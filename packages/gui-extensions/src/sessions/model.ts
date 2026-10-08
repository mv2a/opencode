import type { SessionInfo } from "@opencode/client/promise"

/**
 * Where a session stands for the user, most urgent first.
 * - `input`: a permission request or a question waits on the user, in the session or a subagent.
 * - `working`: the session or a subagent is running, or has queued work.
 * - `review`: a turn finished after the user last viewed the session.
 * - `idle`: nothing waits and the user saw the last turn.
 */
export type SessionState = "input" | "working" | "review" | "idle"

export const STATES: readonly SessionState[] = ["input", "working", "review", "idle"]

const DAY = 24 * 60 * 60 * 1000

/** A root session with what the board shows and filters by. */
export type Row = {
  readonly server: string
  readonly session: SessionInfo
  readonly project: { readonly id: string; readonly name: string }
  readonly input: boolean
  readonly working: boolean
}

/** The board's filter and grouping choices. `projects` empty means every project; `days` 0 means any age. */
export type Filter = {
  readonly groupBy: "state" | "project"
  readonly status: "active" | "archived"
  readonly projects: readonly string[]
  readonly days: number
  readonly sort: "updated" | "created"
}

export type Group = {
  readonly id: string
  readonly state?: SessionState
  readonly label?: string
  readonly rows: readonly Row[]
}

/** A finished turn the user has not viewed since; the server keeps both watermarks. */
export function unviewed(session: SessionInfo) {
  const idle = session.time.idle

  return idle !== undefined && (session.time.viewed ?? 0) < idle
}

export function sessionState(row: Row): SessionState {
  if (row.input) return "input"

  if (row.working) return "working"

  if (unviewed(row.session)) return "review"

  return "idle"
}

/** The project's local name, else the last segment of its root, else of the session's directory. */
export function projectName(
  project: { readonly name?: string; readonly canonical: string } | undefined,
  directory: string,
) {
  if (project?.name) return project.name

  return lastSegment(project?.canonical ?? directory)
}

function lastSegment(path: string) {
  return path.split(/[\\/]/).findLast((part) => part.length > 0) ?? path
}

/** The projects the rows belong to, most recently active first. */
export function rowProjects(rows: readonly Row[]) {
  return [
    ...new Map(
      rows
        .toSorted((a, b) => b.session.time.updated - a.session.time.updated)
        .map((row) => [row.project.id, row.project]),
    ).values(),
  ]
}

/** Rows the filter keeps. Sessions waiting on the user or running show whatever their age. */
export function visibleRows(rows: readonly Row[], filter: Filter, now: number) {
  const since = filter.days > 0 ? now - filter.days * DAY : 0
  const projects = new Set(filter.projects)

  return rows.filter((row) => {
    if ((filter.status === "archived") !== (row.session.time.archived !== undefined)) return false

    if (projects.size > 0 && !projects.has(row.project.id)) return false

    if (row.input || row.working) return true

    return row.session.time.updated >= since
  })
}

/** Groups in display order: states most urgent first, projects most recently active first; rows by the sort. */
export function groupRows(rows: readonly Row[], filter: Filter): Group[] {
  const sorted = rows.toSorted((a, b) => b.session.time[filter.sort] - a.session.time[filter.sort])

  if (filter.groupBy === "project")
    return rowProjects(rows).map((project) => ({
      id: project.id,
      label: project.name,
      rows: sorted.filter((row) => row.project.id === project.id),
    }))

  return STATES.flatMap((state) => {
    const list = sorted.filter((row) => sessionState(row) === state)

    return list.length > 0 ? [{ id: state, state, rows: list }] : []
  })
}
