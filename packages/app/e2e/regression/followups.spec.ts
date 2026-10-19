import { expect, test } from "@playwright/test"
import { status } from "../utils/timeline"
import { openSession } from "../utils/workspace"

test.use({ viewport: { width: 1440, height: 900 } })

const T0 = 1700000000000

test("suggests follow-ups after a turn, fills the composer without sending, and clears on the next turn", async ({
  page,
}, testInfo) => {
  const prompts: unknown[] = []
  const requests: { prompt: string; model?: { id: string; providerID: string; variant?: string } | null }[] = []
  const sessionID = "ses_followups"

  const { editor, push } = await openSession(page, {
    name: "Followups",
    sessions: [{ id: sessionID, title: "Followups" }, { id: "ses_followups_other", title: "Other" }],
    onPrompt: (input) => prompts.push(input),
    pageMessages: (id) => ({
      items:
        id === sessionID
          ? [
              { id: "msg_fu_user", type: "user", text: "Write a parser for calc.py", time: { created: T0 } },
              {
                id: "msg_fu_assistant",
                type: "assistant",
                agent: "build",
                model: { id: "model", providerID: "provider" },
                content: [{ type: "text", text: "Here is the parser." }],
                time: { created: T0 + 1, completed: T0 + 2 },
              },
            ]
          : [],
    }),
    generateText: (input) => {
      requests.push(input)

      return {
        text: 'Sure! {"follow_ups": ["Add tests for the parser", "Explain the grammar", "Add tests for the parser"]}',
      }
    },
  })

  const bar = page.getByRole("group", { name: "Suggested follow-ups" })

  // A finished turn in another session asks for nothing.
  await push([status("idle", 1, "ses_followups_other")])
  await expect(bar).toHaveCount(0)

  await push([status("idle", 1, sessionID)])
  await expect(bar.getByRole("button", { name: "Add tests for the parser", exact: true })).toBeVisible()
  await expect(bar.getByRole("button", { name: "Explain the grammar", exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]?.prompt).toContain("Write a parser for calc.py")
  expect(requests[0]?.prompt).toContain("Here is the parser.")
  expect(requests[0]?.model).toEqual({ id: "model", providerID: "provider", variant: "fast" })
  await page.screenshot({ path: testInfo.outputPath("chips.png") })

  // A chip fills the empty draft and focuses it; a second one is appended to what the user typed.
  await bar.getByRole("button", { name: "Add tests for the parser", exact: true }).click()
  await expect(editor).toHaveText("Add tests for the parser")
  await expect(editor).toBeFocused()
  await editor.pressSequentially(" now")
  await bar.getByRole("button", { name: "Explain the grammar", exact: true }).click()
  await expect(editor).toContainText("Add tests for the parser now")
  await expect(editor).toContainText("Explain the grammar")
  expect(prompts).toEqual([])

  // The next turn starting clears them.
  await push([status("busy", 1, sessionID)])
  await expect(bar).toHaveCount(0)
})
