// Model calls. Uses the zero-arg Anthropic client: credentials resolve from
// ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.

import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

/** One generation turn. Returns { text, code, usage, stopReason }. */
export async function generate({ model, system, messages, maxTokens = 16000 }) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  })
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
  return {
    text,
    code: extractCode(text),
    usage: response.usage,
    stopReason: response.stop_reason,
  }
}

/** The largest fenced code block in the response (the solution module). */
export function extractCode(text) {
  const blocks = [...text.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1])
  if (blocks.length === 0) return null
  return blocks.reduce((a, b) => (b.length > a.length ? b : a))
}

export function tokensOf(usage) {
  return (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
}
