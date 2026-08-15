/** The console tool as one self-contained file, built to
 * `dist/envelopes-cli.mjs` and served from the site:
 *
 *     curl -O https://envelopes.lukeroh.de/envelopes-cli.mjs
 *     node envelopes-cli.mjs check my-budget.yml
 *
 * Same tool as `npx tsx src/cli.ts` -- literally the same function, not a
 * second implementation. It used to be a second implementation, and it had
 * quietly fallen a long way behind: it printed a report and understood no
 * arguments, so every command `llms.txt` tells an agent to run failed for
 * anyone who downloaded this file. Which is everyone it exists for.
 *
 * Nothing here but the entry point, so there's nowhere for the two to drift
 * apart again. `node:fs` stays unbundled, because Node provides it.
 */

import { reportAndExit, runCli } from "./cli";

runCli(process.argv.slice(2)).catch(reportAndExit);
