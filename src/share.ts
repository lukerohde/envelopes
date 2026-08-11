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
