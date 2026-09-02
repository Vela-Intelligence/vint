// Model calls. Two providers, chosen by model id: names starting with
// gpt/chatgpt/o go to the OpenAI API, everything else to Anthropic.
//
// Credential resolution (per provider): environment first (the Anthropic
// SDK also honors `ant auth login` profiles), then the macOS Keychain
// items "anthropic-api-key" / "openai-api-key". A keychain value stays
// inside this process — passed straight to the client, never printed,
// logged, or written anywhere.

import { execFileSync } from "node:child_process"
import Anthropic from "@anthropic-ai/sdk"

function keychainItem(service) {
  if (process.platform !== "darwin") return undefined
  try {
    const key = execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    return key || undefined
  } catch {
    return undefined
  }
}

const isOpenAiModel = (model) => /^(gpt|chatgpt|o\d)/i.test(model)

let anthropicClient
function anthropic() {
  if (!anthropicClient) {
    const fromEnv = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
    const apiKey = fromEnv ? undefined : keychainItem("anthropic-api-key")
    anthropicClient = apiKey ? new Anthropic({ apiKey }) : new Anthropic()
  }
  return anthropicClient
}

let openAiKey
function openAiApiKey() {
  openAiKey ??= process.env.OPENAI_API_KEY || keychainItem("openai-api-key")
  if (!openAiKey) {
    throw new Error(
      'no OpenAI credentials: set OPENAI_API_KEY or add a keychain item named "openai-api-key"',
    )
  }
  return openAiKey
}

async function generateOpenAi({ model, system, messages, maxTokens }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openAiApiKey()}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI API ${response.status}: ${body.slice(0, 400)}`)
  }
  const data = await response.json()
  const choice = data.choices?.[0]
  const text = choice?.message?.content ?? ""
  return {
    text,
    code: extractCode(text),
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
    stopReason: choice?.finish_reason ?? "unknown",
  }
}

/** One generation turn. Returns { text, code, usage, stopReason }. */
export async function generate({ model, system, messages, maxTokens = 16000 }) {
  if (isOpenAiModel(model)) return generateOpenAi({ model, system, messages, maxTokens })
  const response = await anthropic().messages.create({
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
