/** The one delete button every row on the page uses.
 *
 * It used to be a ✕. On a goal card that sits exactly where a "close this"
 * button lives, and reads as one -- so people clicked it expecting to
 * collapse the card and deleted the goal instead. A bin says what it does.
 *
 * Deletion asks for confirmation because the action is destructive.
 */
const BIN_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4M6.5 6.8v4.4M9.5 6.8v4.4"/></svg>';

export function removeButtonHTML(what: string): string {
  return (
    `<button type="button" class="row-remove" data-remove aria-label="Delete ${what}" ` +
    `title="Delete ${what}">${BIN_SVG}</button>`
  );
}

export function confirmRemove(what: string): boolean {
  return window.confirm(`Are you sure you want to delete “${what}”?`);
}
