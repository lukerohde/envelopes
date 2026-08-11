/** The engine, bundled as one self-contained file for anyone who wants to
 * run it without cloning this repo -- an AI agent drafting someone's budget,
 * mainly. Two separate builds so each output stands alone rather than
 * sharing a chunk: envelopes.mjs works anywhere, envelopes-cli.mjs is Node
 * only and leaves node:fs to Node.
 *
 *     npm run build:lib
 *
 * emptyOutDir is off so these land alongside the site build in dist/, which
 * is what deploy-site.yml already syncs.
 */

import { defineConfig } from "vite";

const CLI = process.env.LIB_ENTRY === "cli";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: CLI ? "src/cli-bundle.ts" : "src/lib.ts",
      formats: ["es"],
      fileName: () => (CLI ? "envelopes-cli.mjs" : "envelopes.mjs"),
    },
    rollupOptions: { external: [/^node:/] },
  },
});
