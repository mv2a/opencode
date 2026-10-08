import type { SessionInfo } from "@opencode/client/promise"
import type { ServerRef } from "../sdk"
import { projectName, type Row } from "./model"

// The form kinds that wait on the user, as the session tabs count them.
const ASKING: readonly unknown[] = ["question", "websearch.provider"]

/**
 * The root sessions with a permission request or a question waiting on the user, counted from the requests alone, so
 * a session whose info the server's data has not loaded yet still counts. Reactive.
 */
export function waitingRoots(server: ServerRef) {
  const session = server.data.session

  const ids = [
    ...session.permission.sessions(),
    ...session.form
      .sessions()
      .filter((id) => id !== "global" && session.form.list(id)?.some((form) => ASKING.includes(form.metadata?.kind))),
  ]

  return new Set(ids.map((id) => session.root(id)))
}

/**
 * The server's root sessions as board rows: the ones its data holds, plus `indexed` ones it has not loaded. A family's
 * waiting requests and running work count for its root, as the session tabs show them. Reactive.
 */
export function serverRows(server: ServerRef, indexed: readonly SessionInfo[] = []): Row[] {
  const data = server.data
  const projects = new Map(data.project.list().map((project) => [project.id, project]))

  const roots = new Map(
    [...indexed, ...data.session.list()].flatMap((session) =>
      session.parentID ? [] : [[session.id, session] as const],
    ),
  )

  return [...roots.values()].map((indexedSession) => {
    const session = data.session.get(indexedSession.id) ?? indexedSession
    const family = [...new Set([session.id, ...data.session.family(session.id)])]

    const input = family.some(
      (id) =>
        (data.session.permission.list(id)?.length ?? 0) > 0 ||
        (data.session.form.list(id)?.some((form) => ASKING.includes(form.metadata?.kind)) ?? false),
    )

    // Like the TUI, work waiting in the inbox counts as busy; parked synthetic context does not.
    const working = family.some(
      (id) =>
        data.session.status(id) === "running" ||
        data.session.pending.list(id).some((item) => item.type !== "synthetic"),
    )

    return {
      server: server.id,
      session,
      project: {
        id: session.projectID,
        name: projectName(projects.get(session.projectID), session.location.directory),
      },
      input,
      working,
    }
  })
}

const PAGE = 500

const MAX = 2000

// Requests asked before the app connected reach its data only through a sync; refresh the recent sessions' ones.
const SYNC_WINDOW = 30 * 24 * 60 * 60 * 1000

const SYNC_MAX = 100

/**
 * The server's root sessions, newest first, up to `MAX`, and syncs the waiting requests of the recent active ones. A
 * server that fails to answer lists none, so the others still show.
 */
export async function loadRoots(server: ServerRef, signal: AbortSignal) {
  const page = async (cursor: string | undefined, found: SessionInfo[]): Promise<SessionInfo[]> => {
    const result = await server.client.session.list({ parentID: null, order: "desc", limit: PAGE, cursor }, { signal })
    const next = [...found, ...result.data]

    if (signal.aborted || !result.cursor.next || next.length >= MAX) return next

    return page(result.cursor.next, next)
  }

  const roots = await page(undefined, []).catch(() => [])

  if (signal.aborted) return roots
  const since = Date.now() - SYNC_WINDOW
  roots
    .filter((session) => session.time.archived === undefined && session.time.updated >= since)
    .slice(0, SYNC_MAX)
    .forEach((session) => {
      void server.data.session.permission.sync(session.id)
      void server.data.session.form.sync(session.id)
    })

  return roots
}
