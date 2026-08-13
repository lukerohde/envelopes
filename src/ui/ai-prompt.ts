/** The "give this to your AI" prompt. A pointer, not a payload: everything
 * about the tool and the format lives in llms.txt, so the only thing this
 * has to carry is which plan, and it can only know that at the moment the
 * button is clicked -- the fragment is rewritten on every edit.
 */

/** Past this, hand over the YAML instead of the link.
 *
 * Set high on purpose. The fallback isn't free -- a real plan is a couple
 * of hundred lines, against one line for a link -- so the link stays the
 * better answer for far longer than it might seem. A full config with the
 * agent header runs to roughly 1,900 characters and should still go as a
 * link. This is a guard against something pathological, not a tidiness
 * rule. */
export const MAX_URL = 4000;

const LLMS = "https://envelopes.lukeroh.de/llms.txt";
const SITE = "https://envelopes.lukeroh.de";

function preamble(): string {
  return `I'm using envelopes (${SITE}), a free budget and retirement projection tool.`;
}

/** `href` is the whole address bar, `yamlText` the config on screen. */
export function aiPromptFor(href: string, yamlText: string): string {
  const hash = href.slice(href.indexOf("#") + 1);
  const hasPlan = href.includes("#") && hash.length > 0;

  // Each paragraph is one unwrapped line -- it's going into a chat box that
  // wraps for itself, and a hard break mid-sentence just looks broken there.
  if (!hasPlan) {
    return [
      preamble(),
      "",
      `Read ${LLMS} first -- it covers the format and how to build a plan.` +
        " Then interview me and build one.",
    ].join("\n");
  }

  if (href.length > MAX_URL) {
    return [
      `${preamble()} My share link is too long to paste, so here's my plan as YAML instead.`,
      "",
      `Read ${LLMS} first -- it covers the format, and how to run and update a plan.` +
        " Then help me with mine.",
      "",
      "```yaml",
      yamlText.trimEnd(),
      "```",
    ].join("\n");
  }

  return [
    `${preamble()} My plan: ${href}`,
    "",
    `Read ${LLMS} first -- it covers the format, and how to decode, run and update that link.` +
      " Then help me with my plan.",
  ].join("\n");
}
