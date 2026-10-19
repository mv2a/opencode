import { For, lazy, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import type { ModelRef } from "@opencode/client/promise"
import { createKeyed, onIdle, SettingsPage, Slot, Style, type MountedSession, type Setup } from "../sdk"
import css from "./followups.css?inline"
import type definition from "./index"
import { buildPrompt, lastModel, parseFollowUps, toTurns } from "./model"

// A suggestion request that takes longer is abandoned. The first one after the server starts also loads the server's
// global location, which can take tens of seconds; a turn starting meanwhile cancels it anyway.
const timeout = 45_000

const setup: Setup<typeof definition> = (ctx) => {
  ctx.add(Style, css)

  // Suggestions per session, by `session.key`. A session's turn starting clears them.
  const [chips, setChips] = createStore<Record<string, readonly string[]>>({})
  const running = new Map<string, AbortController>()

  onCleanup(() => running.forEach((controller) => controller.abort()))

  const clear = (key: string) => {
    running.get(key)?.abort()
    running.delete(key)
    setChips(key, [])
  }

  const suggest = async (session: MountedSession) => {
    const key = session.key
    const server = session.server
    const messages = server.data.session.message.list(session.id)
    const turns = toTurns(messages)

    if (!turns.some((turn) => turn.role === "assistant")) return

    const model = lastModel(messages)
    const variant = ctx.stores.prefs.value.variant
    const prompt = buildPrompt(turns)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const generate = (ref: ModelRef | undefined) =>
      server.client.generate.text({ prompt, model: ref ?? null }, { signal: controller.signal })

    running.get(key)?.abort()
    running.set(key, controller)

    try {
      // A model without the variant rejects it; ask again with the model's own settings.
      const result = await generate(model && variant ? { ...model, variant } : model).catch((error: Error) => {
        if (controller.signal.aborted || !model || !variant) throw error

        return generate(model)
      })

      if (ctx.signal.aborted || controller.signal.aborted) return
      setChips(key, parseFollowUps(result.text))
    } catch {
      // Suggestions are optional: a timeout, a model error or an unreadable reply shows none.
    } finally {
      clearTimeout(timer)

      if (running.get(key) === controller) running.delete(key)
    }
  }

  // Server events for the routed session's server: a turn starting clears its suggestions, a turn finishing asks
  // for new ones. Subagent sessions never get any.
  createKeyed(
    () => ctx.sessions.current()?.server.data,
    (data) => {
      onCleanup(
        data.on("session.execution.started", (event) => {
          const session = ctx.sessions.current()

          if (session?.id === event.data.sessionID) clear(session.key)
        }),
      )
      onCleanup(
        data.on("session.execution.succeeded", (event) => {
          const session = ctx.sessions.current()

          if (!ctx.stores.prefs.value.enabled || session?.id !== event.data.sessionID) return

          if (data.session.get(session.id)?.parentID) return
          void suggest(session)
        }),
      )
    },
  )

  ctx.add(Slot, {
    at: "session.composer.above",
    render: (input) => (
      <Show when={ctx.stores.prefs.value.enabled && (chips[input.session.key]?.length ?? 0) > 0}>
        <div class="followups-bar" role="group" aria-label={ctx.t("bar.label")}>
          <For each={chips[input.session.key]}>
            {(text) => (
              <button
                type="button"
                class="followups-chip"
                title={ctx.t("chip.title")}
                onClick={() => {
                  const composer = input.screen.composer

                  // Never replaces what the user typed: an empty draft takes the text, a draft gets it appended.
                  composer.insert(text, { mode: composer.text().trim() ? "append" : "replace", focus: true })
                }}
              >
                {text}
              </button>
            )}
          </For>
          <button
            type="button"
            class="followups-dismiss"
            aria-label={ctx.t("dismiss")}
            title={ctx.t("dismiss")}
            onClick={() => clear(input.session.key)}
          >
            ×
          </button>
        </div>
      </Show>
    ),
  })

  const EnabledRow = lazy(() => import("./settings"))
  // Settings rows are small; load them while idle so settings opens without a blank row.
  onCleanup(onIdle(() => void EnabledRow.preload()))

  ctx.add(SettingsPage, {
    id: "followups",
    page: "general",
    section: "general",
    get title() {
      return ctx.t("settings.enabled.title")
    },
    get entries() {
      return [
        {
          id: "settings-followups-enabled",
          title: ctx.t("settings.enabled.title"),
          keywords: "follow-up suggestions prompts",
        },
      ]
    },
    render: () => (
      <Suspense>
        <EnabledRow />
      </Suspense>
    ),
  })

  return undefined
}

export default setup
