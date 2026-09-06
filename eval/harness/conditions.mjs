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

/** The agent guide: skills/vint/SKILL.md with its frontmatter stripped. Through
 *  0.8.0 the same text lived in docs/llms.txt, which the recorded rounds name. */
const guide = () =>
  readFileSync(join(repoRoot, "skills/vint/SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "")

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

// Vue's full build (runtime + template compiler), as a CDN script tag ships it
const vueEsbuild = {
  alias: { vue: join(evalDir, "node_modules/vue/dist/vue.esm-bundler.js") },
  define: {
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    "process.env.NODE_ENV": '"development"',
  },
}

export const conditions = {
  // vint with its agent guide — the product as intended
  "vint-guided": {
    kind: "api",
    ext: "ts",
    system: () =>
      `${CONTRACT("only the package \"vint\"", "TypeScript (no JSX)")}\n\nThe framework guide follows — it teaches the framework's semantics. The task's own requirements always take precedence.\n\n${guide()}`,
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

  // A/B arm for the For item-accessor divergence: identical to vint-bare,
  // except For's children receive plain VALUES (Solid-style) — the type
  // declarations shown to the model are rewritten to match, and "vint"
  // resolves to the value-For shim.
  "vint-bare-valuefor": {
    kind: "api",
    ext: "ts",
    system: () => {
      const dts = vintDts()
        .replace(
          "children: (item: Accessor<T>, index: Accessor<number>) => Child",
          "children: (item: T, index: number) => Child",
        )
        .replace(
          " * C2: keyed list. children(item, index) receives two ACCESSORS (unlike\n * Solid's For) and runs once per key;",
          " * C2: keyed list. children(item, index) receives plain VALUES (like\n * Solid's For) and re-renders a row when its item changes;",
        )
      return `${CONTRACT("only the package \"vint\"", "TypeScript (no JSX)")}\n\nUse the UI framework "vint". Its complete type declarations follow — this is the entire API surface.\n\n\`\`\`ts\n${dts}\n\`\`\``
    },
    esbuild: { alias: { vint: join(evalDir, "variant/vint-value-for.ts") } },
  },

  // calibration for the variant arm
  "reference-valuefor": {
    kind: "reference",
    ext: "ts",
    referenceDir: join(evalDir, "reference/valuefor"),
    esbuild: { alias: { vint: join(evalDir, "variant/vint-value-for.ts") } },
  },

  // Solid baseline: the framework vint's reactive semantics come from,
  // compiled with its real compiler (babel-preset-solid)
  solid: {
    kind: "api",
    ext: "tsx",
    babelSolid: true,
    system: () =>
      `${CONTRACT('only "solid-js" and "solid-js/web"', "TypeScript Solid JSX (.tsx)")}\n\nUse Solid (solid-js). Inside mountApp, call render(() => <App />, container) from "solid-js/web". The code is compiled with babel-preset-solid.`,
    esbuild: {},
  },

  // VanJS baseline: the no-build tag-function framework vint's authoring
  // style comes from
  vanjs: {
    kind: "api",
    ext: "ts",
    system: () =>
      `${CONTRACT('only "vanjs-core"', "TypeScript (no JSX)")}\n\nUse VanJS: import van from "vanjs-core". Build DOM with van.tags, state with van.state, and add to the container with van.add(container, ...).`,
    esbuild: {},
  },

  "reference-solid": {
    kind: "reference",
    ext: "tsx",
    babelSolid: true,
    referenceDir: join(evalDir, "reference/solid"),
    esbuild: {},
  },
  "reference-vanjs": {
    kind: "reference",
    ext: "ts",
    referenceDir: join(evalDir, "reference/vanjs"),
    esbuild: {},
  },

  // The two NO-BUILD baselines a harness author would actually weigh vint
  // against (assessment §3): strong priors and no build step. Preact + htm
  // is React's authoring model without JSX; Vue's runtime+compiler build is
  // what a <script> tag gets, templates compiled in the browser.
  "preact-htm": {
    kind: "api",
    ext: "ts",
    system: () =>
      `${CONTRACT('only "preact", "preact/hooks" and "htm"', "TypeScript (no JSX)")}\n\nUse Preact with htm (no JSX, no build): import { h, render } from "preact", hooks from "preact/hooks", and htm from "htm"; const html = htm.bind(h). Render your component into the container with render(html\`<\${App} />\`, container) inside mountApp.`,
    esbuild: {},
  },
  vue: {
    kind: "api",
    ext: "ts",
    system: () =>
      `${CONTRACT('only "vue"', "TypeScript (no JSX)")}\n\nUse Vue 3 the way a CDN <script> would: import { createApp, ref, computed, reactive, watch } from "vue", write components with a \`template\` string (the runtime compiler is available) or a render function, and call createApp(App).mount(container) inside mountApp.`,
    esbuild: vueEsbuild,
  },
  "reference-preact": {
    kind: "reference",
    ext: "ts",
    referenceDir: join(evalDir, "reference/preact"),
    esbuild: {},
  },
  "reference-vue": {
    kind: "reference",
    ext: "ts",
    referenceDir: join(evalDir, "reference/vue"),
    esbuild: vueEsbuild,
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
