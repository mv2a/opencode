import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { createMemo, For, Show } from "solid-js"
import { createLatest, useExtension, type ServerRef } from "../sdk"
import type definition from "./index"
import {
  groupRows,
  rowProjects,
  sessionState,
  STATES,
  visibleRows,
  type Filter,
  type Row,
  type SessionState,
} from "./model"
import { loadRoots, serverRows } from "./rows"

const GROUP_BY = ["state", "project"] as const

const STATUS = ["active", "archived"] as const

const DAYS = [1, 7, 30, 0] as const

const SORT = ["updated", "created"] as const

const UNITS = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
] as const

export default function Board(props: { servers: () => readonly ServerRef[]; onOpen: (row: Row) => void }) {
  const ctx = useExtension<typeof definition>()
  const prefs = ctx.stores.prefs
  const filter = (): Filter => prefs.value

  const set = (change: Partial<Filter>) =>
    prefs.update((draft) => {
      Object.assign(draft, change)
    })

  // Every server's root sessions, including ones the app has not loaded, fetched each time the board opens.
  const index = createLatest(
    () =>
      props
        .servers()
        .map((server) => server.id)
        .join("\n") || undefined,
    async (_key, signal) =>
      new Map(
        await Promise.all(props.servers().map(async (server) => [server.id, await loadRoots(server, signal)] as const)),
      ),
  )

  const rows = createMemo(() => props.servers().flatMap((server) => serverRows(server, index.latest?.get(server.id))))
  const visible = createMemo(() => visibleRows(rows(), filter(), Date.now()))
  const groups = createMemo(() => groupRows(visible(), filter()))
  const projects = createMemo(() => rowProjects(visibleRows(rows(), { ...filter(), projects: [] }, Date.now())))
  const count = (state: SessionState) => visible().filter((row) => sessionState(row) === state).length

  const time = createMemo(() => new Intl.RelativeTimeFormat(ctx.locale.locale(), { numeric: "auto" }))

  const ago = (at: number) => {
    const elapsed = at - Date.now()
    const unit = UNITS.find((item) => Math.abs(elapsed) >= item[1])

    if (!unit) return time().format(0, "minute")

    return time().format(Math.round(elapsed / unit[1]), unit[0])
  }

  const toggleProject = (id: string) => {
    const selected = filter().projects

    set({ projects: selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id] })
  }

  return (
    <Dialog size="x-large" class="sessions-board">
      <DialogHeader>
        <DialogTitleGroup
          title={ctx.t("title")}
          description={STATES.flatMap((state) => {
            const total = count(state)

            return total > 0 && state !== "idle" ? [`${ctx.t(`state.${state}`)} ${total}`] : []
          }).join(" · ")}
        />
      </DialogHeader>
      <DialogBody class="sessions-board-body">
        <div class="sessions-board-filters">
          <label class="sessions-board-filter">
            <span>{ctx.t("filter.groupBy")}</span>
            <SegmentedControl
              value={filter().groupBy}
              onChange={(value) => {
                const groupBy = GROUP_BY.find((item) => item === value)

                if (groupBy) set({ groupBy })
              }}
            >
              <For each={GROUP_BY}>
                {(item) => <SegmentedControlItem value={item}>{ctx.t(`groupBy.${item}`)}</SegmentedControlItem>}
              </For>
            </SegmentedControl>
          </label>
          <label class="sessions-board-filter">
            <span>{ctx.t("filter.status")}</span>
            <SegmentedControl
              value={filter().status}
              onChange={(value) => {
                const status = STATUS.find((item) => item === value)

                if (status) set({ status })
              }}
            >
              <For each={STATUS}>
                {(item) => <SegmentedControlItem value={item}>{ctx.t(`status.${item}`)}</SegmentedControlItem>}
              </For>
            </SegmentedControl>
          </label>
          <label class="sessions-board-filter">
            <span>{ctx.t("filter.days")}</span>
            <SegmentedControl
              value={String(filter().days)}
              onChange={(value) => {
                const days = DAYS.find((item) => String(item) === value)

                if (days !== undefined) set({ days })
              }}
            >
              <For each={DAYS}>
                {(item) => <SegmentedControlItem value={String(item)}>{ctx.t(`days.${item}`)}</SegmentedControlItem>}
              </For>
            </SegmentedControl>
          </label>
          <label class="sessions-board-filter">
            <span>{ctx.t("filter.sort")}</span>
            <SegmentedControl
              value={filter().sort}
              onChange={(value) => {
                const sort = SORT.find((item) => item === value)

                if (sort) set({ sort })
              }}
            >
              <For each={SORT}>
                {(item) => <SegmentedControlItem value={item}>{ctx.t(`sort.${item}`)}</SegmentedControlItem>}
              </For>
            </SegmentedControl>
          </label>
        </div>
        <Show when={projects().length > 1}>
          <div class="sessions-board-projects" role="group" aria-label={ctx.t("filter.projects")}>
            <button
              type="button"
              class="sessions-board-chip"
              aria-pressed={filter().projects.length === 0}
              onClick={() => set({ projects: [] })}
            >
              {ctx.t("projects.all")}
            </button>
            <For each={projects()}>
              {(project) => (
                <button
                  type="button"
                  class="sessions-board-chip"
                  aria-pressed={filter().projects.includes(project.id)}
                  onClick={() => toggleProject(project.id)}
                >
                  {project.name}
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show
          when={groups().length > 0}
          fallback={<p class="sessions-board-empty">{index.loading ? ctx.t("loading") : ctx.t("empty")}</p>}
        >
          <div class="sessions-board-groups">
            <For each={groups()}>
              {(group) => (
                <section class="sessions-board-group" data-state={group.state}>
                  <h3 class="sessions-board-heading">
                    <span>{group.state ? ctx.t(`state.${group.state}`) : group.label}</span>
                    <span class="sessions-board-count">{group.rows.length}</span>
                  </h3>
                  <For each={group.rows}>
                    {(row) => (
                      <button
                        type="button"
                        class="sessions-board-row"
                        data-state={sessionState(row)}
                        onClick={() => props.onOpen(row)}
                      >
                        <span class="sessions-board-dot" aria-hidden="true" />
                        <span class="sessions-board-title">{row.session.title || ctx.t("untitled")}</span>
                        <span class="sessions-board-meta">
                          {group.state ? `${row.project.name} · ` : `${ctx.t(`state.${sessionState(row)}`)} · `}
                          {ago(row.session.time[filter().sort])}
                        </span>
                      </button>
                    )}
                  </For>
                </section>
              )}
            </For>
          </div>
        </Show>
      </DialogBody>
    </Dialog>
  )
}
