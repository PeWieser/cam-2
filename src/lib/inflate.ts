// Async raw deflate inflater for 3MF support using DecompressionStream.

export async function inflateRawAsync(data: Uint8Array): Promise<Uint8Array> {
  if (typeof (globalThis as any).DecompressionStream === "undefined") {
    throw new Error("DecompressionStream nicht verfügbar — 3MF kann nicht gelesen werden");
  }

  // Try zlib (with header) first, then fall back to raw deflate
  const tries: ("deflate" | "deflate-raw")[] = ["deflate", "deflate-raw"];
  let lastErr: unknown = null;
  for (const fmt of tries) {
    try {
      const ds = new (globalThis as any).DecompressionStream(fmt);
      const stream = new Blob([data as unknown as ArrayBuffer]).stream().pipeThrough(ds);
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = (await reader.read()) as { done: boolean; value?: Uint8Array };
        if (done) break;
        if (value) {
          chunks.push(value);
          total += value.byteLength;
        }
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.byteLength;
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Deflate-Inflation fehlgeschlagen: " + String(lastErr));
}
