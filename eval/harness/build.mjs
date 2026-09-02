// Bundle a solution module with esbuild — for Solid, babel-preset-solid
// runs first (Solid's JSX needs its own compiler; a generic JSX transform
// silently breaks its reactivity). A build failure is a first-try failure
// like any other — its message becomes the try-2 feedback.

import { writeFileSync } from "node:fs"
import { build } from "esbuild"

export async function buildSolution({ srcPath, outPath, condition }) {
  let entry = srcPath
  if (condition.babelSolid) {
    try {
      const { transformFileAsync } = await import("@babel/core")
      const result = await transformFileAsync(srcPath, {
        presets: [
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
          ["babel-preset-solid"],
        ],
        filename: srcPath,
        configFile: false,
        babelrc: false,
      })
      entry = `${srcPath}.solid.js`
      writeFileSync(entry, result.code)
    } catch (err) {
      return { ok: false, report: `BUILD ERROR (solid compiler):\n${String(err.message ?? err).slice(0, 1500)}` }
    }
  }
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      outfile: outPath,
      logLevel: "silent",
      ...(condition.esbuild ?? {}),
    })
    return { ok: true }
  } catch (err) {
    const messages = (err.errors ?? []).map(
      (e) => `${e.location?.file ?? ""}:${e.location?.line ?? "?"}: ${e.text}`,
    )
    return {
      ok: false,
      report: `BUILD ERROR:\n${messages.join("\n") || String(err.message ?? err)}`,
    }
  }
}
