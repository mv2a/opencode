import { Schema } from "effect"
import type { ModelRef, SessionMessageInfo } from "@opencode/client/promise"

/** One user or assistant turn, as plain text. */
export interface Turn {
  readonly role: "user" | "assistant"
  readonly text: string
}

/** How much history goes into a suggestion request, and how many suggestions come back. */
export interface Limits {
  /** Recent turns sent. */
  readonly turns: number
  /** Characters kept per turn. */
  readonly chars: number
  /** Suggestions kept. */
  readonly count: number
}

export const limits: Limits = { turns: 6, chars: 1500, count: 4 }

const maxSuggestion = 160

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

/** The user text and assistant text of a session's messages; tools, reasoning and bookkeeping rows are dropped. */
export function toTurns(messages: readonly SessionMessageInfo[]): Turn[] {
  return messages.flatMap((message): Turn[] => {
    if (message.type === "user") {
      const text = message.text.trim()

      return text ? [{ role: "user", text }] : []
    }

    if (message.type !== "assistant") return []

    const text = message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim()

    return text ? [{ role: "assistant", text }] : []
  })
}

/** The model of the latest assistant message: the session's current model, in the shape `generate.text` takes. */
export function lastModel(messages: readonly SessionMessageInfo[]): ModelRef | undefined {
  return messages.findLast((message) => message.type === "assistant")?.model
}

/** The suggestion request for the last `limits.turns` turns. */
export function buildPrompt(turns: readonly Turn[], value: Limits = limits): string {
  const history = turns
    .slice(-value.turns)
    .map((turn) => `${turn.role.toUpperCase()}: ${clip(turn.text, value.chars)}`)
    .join("\n\n")

  return [
    "You suggest what the USER could type next in a chat with an AI coding assistant.",
    `Read the conversation below and write up to ${value.count} suggestions.`,
    "Rules:",
    '- Write each one as the user talking to the assistant, e.g. "Add tests for the parser".',
    "- One short sentence each, under 20 words, specific to this conversation.",
    "- Make each one a different next step (e.g. go deeper, test, refactor, explain, move on).",
    "- Do not repeat anything that was already asked or done.",
    "- Never suggest destructive actions (deleting files or history, force-pushing, dropping data).",
    "- Use the language of the conversation.",
    '- Reply with JSON only, no prose and no code fence: {"follow_ups": ["...", "..."]}',
    "",
    "<conversation>",
    history,
    "</conversation>",
  ].join("\n")
}

/**
 * The suggestions in a model reply: the JSON object from the first `{` to the last `}`, its `follow_ups` strings,
 * trimmed, deduplicated and clipped. Anything malformed yields none; this never throws.
 */
export function parseFollowUps(reply: string, count = limits.count): string[] {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/giu, "")
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start < 0 || end <= start) return []

  const list = readList(text.slice(start, end + 1))
  const seen = new Set<string>()

  return list.flatMap((item) => {
    const clean = clip(item.replace(/\s+/gu, " ").trim(), maxSuggestion)
    const key = clean.toLowerCase()

    if (!clean || seen.has(key) || seen.size >= count) return []
    seen.add(key)

    return [clean]
  })
}

// The reply's contract: an object whose `follow_ups` is a list; entries that are not strings are skipped.
const Reply = Schema.fromJsonString(Schema.Struct({ follow_ups: Schema.Array(Schema.Unknown) }))

const isText = Schema.is(Schema.String)

function readList(json: string): string[] {
  try {
    return Schema.decodeUnknownSync(Reply)(json).follow_ups.filter(isText)
  } catch {
    return []
  }
}
