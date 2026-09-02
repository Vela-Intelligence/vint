// Model calls. Credential resolution, in order: the SDK's own environment
// resolution (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login`
// profile), then the macOS Keychain item "anthropic-api-key". The keychain
// value stays inside this process — it is passed straight to the client and
// is never printed, logged, or written anywhere.

import { execFileSync } from "node:child_process"
import Anthropic from "@anthropic-ai/sdk"

function keychainApiKey() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return undefined
  if (process.platform !== "darwin") return undefined
  try {
    const key = execFileSync("security", ["find-generic-password", "-s", "anthropic-api-key", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return key || undefined
  } catch {
    return undefined // no keychain item / access denied: fall back to SDK resolution
  }
}

const apiKey = keychainApiKey()
const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic()

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
