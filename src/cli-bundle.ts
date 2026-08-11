/** The console tool as one self-contained file, built to
 * `dist/envelopes-cli.mjs` and served from the site:
 *
 *     curl -O https://envelopes.lukeroh.de/envelopes-cli.mjs
 *     node envelopes-cli.mjs my-budget.yml
 *
 * Same output as `npx tsx src/cli.ts`, but nothing to clone and nothing to
 * install. `node:fs` is the one thing left unbundled, because Node provides
 * it and nothing else needs to.
 */

import { readFileSync } from "node:fs";
import { report } from "./lib";

const path = process.argv[2];
if (!path) {
  console.error("usage: node envelopes-cli.mjs <config.yml>");
  process.exit(1);
}
console.log(report(readFileSync(path, "utf-8")));
