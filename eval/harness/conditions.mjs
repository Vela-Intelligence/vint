// Eval conditions: what the model gets in context, what it may import, and
// how its solution is built. The task spec is identical across conditions —
// only the framework context differs.

import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const evalDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = join(evalDir, "..")

const CONTRACT = (imports, flavor) => `
You are completing a small UI coding task.

Output EXACTLY ONE fenced code block containing one self-contained
${flavor} module, and nothing else outside the block.

The module MUST export:

    export function mountApp(container: HTMLElement, deps?: Record<string, any>): void

mountApp renders the app into \`container\`. It may be called in a DOM
environment (document/window exist). Allowed imports: ${imports} — nothing
else (no CSS imports, no other packages). Do not use localStorage, fetch,
or timers unless the task says so.
`.trim()

const llmsTxt = () => readFileSync(join(repoRoot, "docs/llms.txt"), "utf8")

const vintDts = () => {
  const p = join(repoRoot, "dist/vint.d.ts")
  if (!existsSync(p)) {
    throw new Error("dist/vint.d.ts missing — run `npm run build` in the repo root first (vint-bare condition needs it)")
  }
  return readFileSync(p, "utf8")
}

const vintEsbuild = {
  alias: { vint: join(repoRoot, "src/index.ts") },
}

export const conditions = {
  // vint with its agent guide — the product as intended
  "vint-guided": {
    kind: "api",
    ext: "ts",
    system: () =>
      `${CONTRACT("only the package \"vint\"", "TypeScript (no JSX)")}\n\nThe framework guide follows. Follow it exactly.\n\n${llmsTxt()}`,
    esbuild: vintEsbuild,
  },

  // vint with only its typings — ablation: how much does the guide carry?
  "vint-bare": {
    kind: "api",
    ext: "ts",
    system: () =>
      `${CONTRACT("only the package \"vint\"", "TypeScript (no JSX)")}\n\nUse the UI framework "vint". Its complete type declarations follow — this is the entire API surface.\n\n\`\`\`ts\n${vintDts()}\n\`\`\``,
    esbuild: vintEsbuild,
  },

  // the prior baseline: React 18, which models know best
  react: {
    kind: "api",
    ext: "tsx",
    system: () =>
      `${CONTRACT('only "react" and "react-dom/client"', "TypeScript React (JSX, .tsx)")}\n\nUse React 18. Create a root with createRoot(container) inside mountApp and render your component.`,
    esbuild: { jsx: "automatic" },
  },

  // offline calibration conditions: run hand-written reference solutions
  // through the identical build+accept pipeline (no API calls). If these
  // fail, the harness or an acceptance test is wrong — not the model.
  "reference-vint": {
    kind: "reference",
    ext: "ts",
    referenceDir: join(evalDir, "reference/vint"),
    esbuild: vintEsbuild,
  },
  "reference-react": {
    kind: "reference",
    ext: "tsx",
    referenceDir: join(evalDir, "reference/react"),
    esbuild: { jsx: "automatic" },
  },
}

export { evalDir, repoRoot }
