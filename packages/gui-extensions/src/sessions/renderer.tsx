import { createMemo, createSignal, lazy, onCleanup, Suspense } from "solid-js"
import { Command, createKeyed, onIdle, Style, TitlebarItem, type DialogHandle, type Setup } from "../sdk"
import type definition from "./index"
import { unviewed } from "./model"
import { waitingRoots } from "./rows"

const setup: Setup<typeof definition> = (ctx) => {
  const servers = () => ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

  const waiting = createMemo(() => servers().reduce((total, server) => total + waitingRoots(server).size, 0))

  // A request asked before this window connected reaches the server's data only through a sync. A session waiting
  // on one is running, so sync the requests of each running session once, for the pill's count.
  createKeyed(
    () =>
      servers()
        .flatMap((server) => server.data.session.active().map((id) => `${server.id}\n${id}`))
        .join(" ") || undefined,
    () =>
      servers().forEach((server) =>
        server.data.session.active().forEach((id) => {
          void server.data.session.permission.sync(id)
          void server.data.session.form.sync(id)
        }),
      ),
  )

  const [dialog, setDialog] = createSignal<DialogHandle>()

  const Board = lazy(() =>
    Promise.all([import("./board"), import("./board.css?inline")]).then(([board, css]) => {
      ctx.add(Style, css.default)

      return board
    }),
  )

  // Compile the board while the app idles, so the first open renders at once.
  onCleanup(onIdle(() => void Board.preload()))

  const toggle = () => {
    const open = dialog()

    if (open) return open.close()
    setDialog(
      ctx.dialogs.open((handle) => {
        onCleanup(() => setDialog((current) => (current === handle ? undefined : current)))

        return (
          <Suspense>
            <Board
              servers={servers}
              onOpen={(row) => {
                handle.close()
                ctx.sessions.open({ server: row.server, id: row.session.id })
              }}
            />
          </Suspense>
        )
      }),
    )
  }

  ctx.add(TitlebarItem, (): TitlebarItem => {
    const count = waiting()

    return {
      id: "board",
      icon: count > 0 ? "status-active" : "status",
      label: count > 0 ? ctx.plural("pill.waiting", count) : ctx.t("pill.label"),
      title: ctx.t("command.toggle"),
      pressed: dialog() !== undefined,
      run: toggle,
    }
  })

  ctx.add(Command, {
    id: "toggle",
    get title() {
      return ctx.t("command.toggle")
    },
    bind: "mod+shift+j",
    run: toggle,
  })

  // Tells the server the user saw the routed session's latest turn, which takes it out of "Ready for review". The
  // server keeps the watermark, so the board in every window and client agrees.
  createKeyed(
    () => {
      const session = ctx.sessions.current()
      const info = session && session.server.data.session.get(session.id)

      if (!session || !info || !unviewed(info) || info.time.idle === undefined) return

      return { server: session.server.id, id: session.id, idle: info.time.idle }
    },
    (target) =>
      void ctx.servers
        .get(target.server)
        ?.client.session.view({ sessionID: target.id, idle: target.idle }, { signal: ctx.signal })
        // The next view or a later turn marks it again; a session left unmarked only stays in review.
        .catch(() => undefined),
    {
      equals: (previous, next) =>
        previous.server === next.server && previous.id === next.id && previous.idle === next.idle,
    },
  )
}

export default setup
