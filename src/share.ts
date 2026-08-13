/** Turns the live YAML config into a URL fragment and back -- the whole
 * mechanism behind "share it without the server maintaining state." Gzipped
 * with the browser's own CompressionStream (no library) so a real config
 * still makes a link short enough to actually paste somewhere, then
 * base64url'd so it's safe to drop straight into a URL fragment. A fragment,
 * never a query string -- it never leaves the browser in the request, so it
 * never ends up in a server access log either.
 */

async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(text));
  writer.close();
  return readAllChunks(stream.readable);
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(new Uint8Array(bytes));
  writer.close();
  const out = await readAllChunks(stream.readable);
  return new TextDecoder().decode(out);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  let base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeShareHash(yamlText: string): Promise<string> {
  const compressed = await gzip(yamlText);
  return bytesToBase64Url(compressed);
}

export async function decodeShareHash(hash: string): Promise<string> {
  const compressed = base64UrlToBytes(hash);
  return gunzip(compressed);
}

/** Where a link points when nobody says otherwise. */
const SITE = "https://envelopes.lukeroh.de/";

/** The whole link, not just the fragment -- what someone actually pastes.
 *
 * The hash-level pair above is what the page itself uses, since it already
 * knows its own origin. These two are for everyone standing outside it: an
 * AI assistant is handed a URL, and making it split on "#" and reassemble
 * the thing itself is exactly the sort of small manual step that ends in a
 * badly hand-rolled codec. Which is the failure all of this exists to stop,
 * so we may as well not invite it back one layer up. */
export async function encodeShareUrl(yamlText: string, base: string = SITE): Promise<string> {
  return `${base}#${await encodeShareHash(yamlText)}`;
}

/** Tolerant on the way in: a full URL, a bare `#fragment`, or the fragment
 * on its own all work, because all three are things people paste. */
export async function decodeShareUrl(url: string): Promise<string> {
  const marker = url.indexOf("#");
  const hash = marker === -1 ? url : url.slice(marker + 1);
  if (!hash || /^https?:\/\//i.test(hash)) {
    throw new Error("no share data in that URL -- the plan lives after the '#'");
  }
  return decodeShareHash(hash);
}
