/** Escaping user-entered text before it goes into innerHTML -- an account
 * or transfer name containing `<` or `&` must show as itself, not be read
 * as markup. Shared because accounts.ts and transfer-fields.ts both build
 * rows this way and had drifted into carrying their own identical copy.
 */
export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}
