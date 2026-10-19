import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { buildPrompt, lastModel, parseFollowUps, toTurns } from "./model"

const messages: SessionMessageInfo[] = [
  { type: "user", id: "1", time: { created: 1 }, text: "Write a parser" },
  {
    type: "assistant",
    id: "2",
    time: { created: 2 },
    agent: "build",
    model: { providerID: "local", id: "qwen3" },
    content: [
      { type: "reasoning", text: "hidden" },
      { type: "text", text: "Here is the parser." },
    ],
  },
  { type: "user", id: "3", time: { created: 3 }, text: "   " },
]

describe("parseFollowUps", () => {
  test("reads follow_ups around prose, fences and think blocks", () => {
    expect(parseFollowUps('Sure!\n```json\n{"follow_ups": ["One?", "Two?"]}\n```')).toEqual(["One?", "Two?"])
    expect(parseFollowUps('<think>{"follow_ups": ["no"]}</think>{"follow_ups": ["yes"]}')).toEqual(["yes"])
  })

  test("malformed replies yield none", () => {
    for (const bad of ["", "no json", "{not json}", '{"follow_ups": "x"}', '{"other": []}', "}{"]) {
      expect(parseFollowUps(bad)).toEqual([])
    }
  })

  test("drops non-strings, blanks and duplicates; caps count and length", () => {
    expect(parseFollowUps(JSON.stringify({ follow_ups: ["A  b", 3, "", "a b", "C"] }))).toEqual(["A b", "C"])
    expect(parseFollowUps(JSON.stringify({ follow_ups: ["1", "2", "3", "4", "5"] }), 2)).toEqual(["1", "2"])
    expect(parseFollowUps(JSON.stringify({ follow_ups: ["x".repeat(300)] }))[0]).toHaveLength(160)
  })
})

describe("history", () => {
  test("keeps only user and assistant text", () => {
    expect(toTurns(messages)).toEqual([
      { role: "user", text: "Write a parser" },
      { role: "assistant", text: "Here is the parser." },
    ])
  })

  test("the latest assistant model is the session's model", () => {
    expect(lastModel(messages)).toEqual({ providerID: "local", id: "qwen3" })
    expect(lastModel([])).toBeUndefined()
  })

  test("the prompt keeps the last turns, clipped", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: "user" as const, text: `msg${i} ${"y".repeat(400)}` }))
    const prompt = buildPrompt(turns, { turns: 3, chars: 200, count: 4 })

    expect(prompt).not.toContain("msg6")
    expect(prompt).toContain("msg9")
    expect(prompt).toContain("up to 4 suggestions")
    expect(prompt).not.toContain("y".repeat(250))
  })
})
