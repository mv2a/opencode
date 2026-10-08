import { expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import { groupRows, projectName, rowProjects, sessionState, visibleRows, type Filter, type Row } from "./model"

const NOW = 1_800_000_000_000

const DAY = 24 * 60 * 60 * 1000

const filter: Filter = { groupBy: "state", status: "active", projects: [], days: 7, sort: "updated" }

function row(
  id: string,
  input: {
    time?: Partial<SessionInfo["time"]>
    project?: string
    input?: boolean
    working?: boolean
  } = {},
): Row {
  // SAFETY: the model reads only id, time and location; the rest of SessionInfo is irrelevant to these tests.
  const session = {
    id,
    projectID: input.project ?? "p1",
    location: { directory: `/work/${input.project ?? "p1"}` },
    time: { created: NOW - DAY, updated: NOW - DAY, ...input.time },
  } as SessionInfo

  return {
    server: "local",
    session,
    project: { id: input.project ?? "p1", name: input.project ?? "p1" },
    input: input.input ?? false,
    working: input.working ?? false,
  }
}

test("a waiting request outranks running work, which outranks an unviewed turn", () => {
  expect(sessionState(row("a", { input: true, working: true }))).toBe("input")
  expect(sessionState(row("a", { working: true, time: { idle: NOW } }))).toBe("working")
  expect(sessionState(row("a", { time: { idle: NOW } }))).toBe("review")
  expect(sessionState(row("a", { time: { idle: NOW, viewed: NOW - 1 } }))).toBe("review")
  expect(sessionState(row("a", { time: { idle: NOW, viewed: NOW } }))).toBe("idle")
  expect(sessionState(row("a"))).toBe("idle")
})

test("the activity window hides old idle sessions but never waiting or running ones", () => {
  const old = { updated: NOW - 30 * DAY }

  const rows = [
    row("old", { time: old }),
    row("ask", { time: old, input: true }),
    row("run", { time: old, working: true }),
  ]

  expect(visibleRows(rows, filter, NOW).map((item) => item.session.id)).toEqual(["ask", "run"])
  expect(visibleRows(rows, { ...filter, days: 0 }, NOW)).toHaveLength(3)
})

test("status and project filters", () => {
  const rows = [row("a"), row("b", { time: { archived: NOW } }), row("c", { project: "p2" })]

  expect(visibleRows(rows, filter, NOW).map((item) => item.session.id)).toEqual(["a", "c"])
  expect(visibleRows(rows, { ...filter, status: "archived" }, NOW).map((item) => item.session.id)).toEqual(["b"])
  expect(visibleRows(rows, { ...filter, projects: ["p2"] }, NOW).map((item) => item.session.id)).toEqual(["c"])
})

test("state groups come in urgency order and skip empty states", () => {
  const groups = groupRows([row("seen"), row("ask", { input: true }), row("done", { time: { idle: NOW } })], filter)

  expect(groups.map((group) => group.state)).toEqual(["input", "review", "idle"])
})

test("rows sort by the chosen time, newest first", () => {
  const rows = [
    row("a", { time: { updated: NOW - 3, created: NOW - 1 } }),
    row("b", { time: { updated: NOW - 1, created: NOW - 3 } }),
  ]

  expect(groupRows(rows, filter)[0]?.rows.map((item) => item.session.id)).toEqual(["b", "a"])
  expect(groupRows(rows, { ...filter, sort: "created" })[0]?.rows.map((item) => item.session.id)).toEqual(["a", "b"])
})

test("project groups follow their most recent activity", () => {
  const rows = [
    row("a", { project: "p1", time: { updated: NOW - 5 } }),
    row("b", { project: "p2", time: { updated: NOW } }),
  ]

  expect(groupRows(rows, { ...filter, groupBy: "project" }).map((group) => group.label)).toEqual(["p2", "p1"])
  expect(rowProjects(rows).map((project) => project.id)).toEqual(["p2", "p1"])
})

test("project names fall back to the root's or the directory's last segment", () => {
  expect(projectName({ name: "App", canonical: "/x/app" }, "/x/app")).toBe("App")
  expect(projectName({ canonical: "/x/app/" }, "/y")).toBe("app")
  expect(projectName(undefined, "C:\\work\\api")).toBe("api")
})
