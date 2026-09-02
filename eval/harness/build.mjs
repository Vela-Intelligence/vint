// Bundle a solution module with esbuild. A build failure is a first-try
// failure like any other — its message becomes the try-2 feedback.

import { build } from "esbuild"

export async function buildSolution({ srcPath, outPath, esbuildOptions }) {
  try {
    await build({
      entryPoints: [srcPath],
      bundle: true,
      format: "esm",
      outfile: outPath,
      logLevel: "silent",
      ...esbuildOptions,
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
