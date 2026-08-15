/** Everything around getting a config in and out of the page: the raw-YAML
 * toggle, Load/Save as a file, and a stateless share link. Nothing here
 * re-implements YAML parsing -- parseYamlIntoState()/stateToYamlText() are
 * the only place that happens, same as every other edit path.
 */

import { debounce } from "../debounce";
import { parseYamlIntoState, stateToYamlText, type UIState } from "../state";
import { decodeShareHash, encodeShareHash } from "../share";

interface IOElements {
  toggleRawBtn: HTMLButtonElement;
  structuredView: HTMLElement;
  rawSection: HTMLElement;
  rawYaml: HTMLTextAreaElement;
  rawStatus: HTMLElement;
  loadBtn: HTMLButtonElement;
  loadFile: HTMLInputElement;
  saveBtn: HTMLButtonElement;
  shareBtn: HTMLButtonElement;
  ioStatus: HTMLElement;
  keepBar: HTMLElement;
}

/** How long the keep-this bar stays up before fading. Long enough to read a
 * sentence and decide whether to act on it, short enough not to sit there
 * being furniture. */
const BAR_LINGER_MS = 8000;

export interface IOHandle {
  /** Called on every real edit: pushes the new state into the address bar so
   * a bookmark or a copied link is never a stale snapshot, and raises the
   * bar reminding you that's where your budget actually lives. */
  markEdited: () => void;
}

export function initIO(elements: IOElements, state: UIState, applyLoadedState: (next: UIState) => void): IOHandle {
  let rawMode = false;
  let unkept = false;

  function flashStatus(text: string): void {
    elements.ioStatus.textContent = text;
    setTimeout(() => {
      if (elements.ioStatus.textContent === text) elements.ioStatus.textContent = "";
    }, 3000);
  }

  function showRawError(text: string): void {
    elements.rawStatus.textContent = text;
  }

  elements.toggleRawBtn.addEventListener("click", () => {
    rawMode = !rawMode;
    elements.structuredView.hidden = rawMode;
    elements.rawSection.hidden = !rawMode;
    elements.toggleRawBtn.textContent = rawMode ? "Edit as form" : "Edit as YAML";
    if (rawMode) {
      elements.rawYaml.value = stateToYamlText(state);
      showRawError("");
    }
  });

  const scheduleRawApply = debounce(() => {
    try {
      applyLoadedState(parseYamlIntoState(elements.rawYaml.value));
      showRawError("");
    } catch (err) {
      showRawError(`Not valid YAML yet: ${(err as Error).message}`);
    }
  }, 400);
  elements.rawYaml.addEventListener("input", scheduleRawApply);

  elements.saveBtn.addEventListener("click", () => {
    const blob = new Blob([stateToYamlText(state)], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "envelopes-budget.yaml";
    link.click();
    URL.revokeObjectURL(url);
    flashStatus("Saved");
    kept();
  });

  elements.loadBtn.addEventListener("click", () => elements.loadFile.click());
  elements.loadFile.addEventListener("change", () => {
    const file = elements.loadFile.files ? elements.loadFile.files[0] : undefined;
    elements.loadFile.value = "";
    if (!file) return;
    file.text().then(
      (text) => {
        applyLoadedState(parseYamlIntoState(text));
        if (rawMode) elements.rawYaml.value = stateToYamlText(state);
        flashStatus(`Loaded ${file.name}`);
      },
      (err) => flashStatus(`Couldn't read that file: ${(err as Error).message}`),
    );
  });

  function copyLink(): Promise<void> {
    return shareHashFor(state)
      .then((hash) => navigator.clipboard.writeText(`${location.origin}${location.pathname}#${hash}`))
      .then(() => {
        flashStatus("Link copied");
        kept();
      })
      .catch((err) => flashStatus(`Couldn't copy the link: ${(err as Error).message}`));
  }
  elements.shareBtn.addEventListener("click", copyLink);

  /** The bar is a reminder, not a task -- it says its piece and gets out of
   * the way rather than sitting there needing to be clicked. Fading out is
   * only the bar going quiet, though: `unkept` stays as it was, so the
   * exit warning isn't silently disarmed by a timer nobody watched. */
  let fadeTimer = 0;

  function showBar(): void {
    clearTimeout(fadeTimer);
    elements.keepBar.hidden = false;
    // one frame with the class still on, so the browser has something to
    // transition *from* -- set it on an element that was display:none a
    // moment ago and there's no starting value to animate
    requestAnimationFrame(() => elements.keepBar.classList.remove("leaving"));
    fadeTimer = window.setTimeout(hideBar, BAR_LINGER_MS);
  }

  function hideBar(): void {
    clearTimeout(fadeTimer);
    if (elements.keepBar.hidden) return;
    elements.keepBar.classList.add("leaving");
    const done = (): void => {
      if (elements.keepBar.classList.contains("leaving")) elements.keepBar.hidden = true;
    };
    elements.keepBar.addEventListener("transitionend", done, { once: true });
    // a transition that never fires would leave an invisible bar sitting in
    // the page, so don't rely on the event alone to take it out
    fadeTimer = window.setTimeout(done, 600);
  }

  /** The budget is somewhere the user can get back to -- copied or saved.
   * Put the notice away and stop warning on the way out. */
  function kept(): void {
    unkept = false;
    hideBar();
  }
  // Writing the address bar is debounced for the same reason the recompute
  // is: gzipping the whole config on every keystroke is pointless work. It's
  // replaceState, not pushState -- the back button walking you through a
  // half-typed budget is not a feature.
  const writeUrl = debounce(() => {
    shareHashFor(state).then((hash) => {
      history.replaceState(null, "", `${location.pathname}#${hash}`);
    });
  }, 400);

  // A bookmark is a frozen copy of a URL, so the live address bar can't
  // reach back and update one already made. What it can do is make sure the
  // link in front of you is never stale, and say so once.
  window.addEventListener("beforeunload", (event) => {
    if (!unkept) return;
    event.preventDefault();
    event.returnValue = "";
  });

  return {
    markEdited(): void {
      writeUrl();
      showBar();
      unkept = true;
    },
  };
}

/** The current state as a URL fragment. One place builds it, whether it's
 * going into the address bar on every edit or onto the clipboard as a share
 * link. */
export async function shareHashFor(state: UIState): Promise<string> {
  return encodeShareHash(stateToYamlText(state));
}

/** What the URL fragment turned out to be.
 *
 * A hash that won't decode is *not* the same as no hash. It's a broken link
 * -- almost always one truncated on the way here -- and this used to report
 * both as "nothing usable", so startup quietly loaded example.yaml. Somebody
 * sent a plan, somebody else opened a sample budget, and nothing on the page
 * said a word. That cost a whole exchange to work out. */
export type SharedPlan =
  | { kind: "none" }
  | { kind: "plan"; state: UIState }
  | { kind: "broken"; why: string };

/** A URL fragment left over from a share link, decoded back into state --
 * called once at startup, before the first render, so a shared link wins
 * over example.yaml. */
export async function stateFromShareHash(hash: string): Promise<SharedPlan> {
  if (!hash) return { kind: "none" };
  try {
    return { kind: "plan", state: parseYamlIntoState(await decodeShareHash(hash)) };
  } catch (err) {
    return { kind: "broken", why: (err as Error).message };
  }
}

/** What to say when a link arrives broken. Names the likely cause, because
 * there's only really one, and says what to ask for instead. */
export const BROKEN_LINK_NOTICE =
  "That share link is truncated or corrupt, so this is the sample budget, not the plan you were sent. " +
  "Ask whoever sent it for the link on its own line, or for the plain YAML to paste into Edit as YAML.";
