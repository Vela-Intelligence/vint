# vint

AI-native vanilla TypeScript UI framework: real DOM, VanJS-shaped tag
functions, Solid-faithful reactivity. Its primary reader is a model writing
app code — start with **[docs/llms.txt](docs/llms.txt)**.

Two ways to consume it:

- **TS source** (Vite projects): `import { createSignal, tags, mount } from "vint"`
- **Vendored, no build**: copy `dist/vint.js` (+ `dist/vint.d.ts` for types)
  from a release and `import { ... } from "./vint.js"`

Docs: [docs/llms.txt](docs/llms.txt) (agent guide) ·
[docs/contract.md](docs/contract.md) (behavioral contract — the source of
truth) · [docs/understanding.md](docs/understanding.md) (why this exists).

Develop: `npm test` · `npm run typecheck` · `npm run build`
