/**
 * AWS EventStream binary frame parser.
 * Ported from OmniRouter's open-sse/executors/kiro/eventstream.ts
 */

export type EventFrame = {
  headers: Record<string, string>;
  payload: JsonRecord | null;
};

type JsonRecord = Record<string, unknown>;

// --- ByteQueue: Zero-copy streaming buffer ---

export class ByteQueue {
  private chunks: Uint8Array[] = [];
  private headOffset = 0;
  length = 0;

  push(chunk: Uint8Array) {
    if (!(chunk instanceof Uint8Array) || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  peekUint32BE(offset = 0): number | null {
    if (this.length < offset + 4) return null;
    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = (value << 8) | this.byteAt(offset + i);
    }
    return value >>> 0;
  }

  read(length: number): Uint8Array | null {
    if (length < 0 || this.length < length) return null;
    const output = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      const head = this.chunks[0];
      if (!head) break;
      const available = head.length - this.headOffset;
      const take = Math.min(available, length - written);
      output.set(
        head.subarray(this.headOffset, this.headOffset + take),
        written,
      );
      written += take;
      this.headOffset += take;
      this.length -= take;
      if (this.headOffset >= head.length) {
        this.chunks.shift();
        this.headOffset = 0;
      }
    }
    return output;
  }

  private byteAt(offset: number): number {
    let remaining = offset;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (!chunk) continue;
      const start = i === 0 ? this.headOffset : 0;
      const available = chunk.length - start;
      if (remaining < available) {
        return chunk[start + remaining] ?? 0;
      }
      remaining -= available;
    }
    return 0;
  }
}

// --- CRC32: IEEE Polynomial Lookup Table ---

const CRC32_TABLE = new Uint32Array(256);
const TEXT_DECODER = new TextDecoder();

for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (byte !== undefined) {
      const tableValue = CRC32_TABLE[(crc ^ byte) & 0xff];
      if (tableValue !== undefined) {
        crc = tableValue ^ (crc >>> 8);
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- parseEventFrame: Core frame parser ---

export function parseEventFrame(data: Uint8Array): EventFrame | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const headersLength = view.getUint32(4, false);

    // Prelude CRC validation: covers bytes [0..7]
    const preludeCRC = view.getUint32(8, false);
    const computedPreludeCRC = crc32(data.slice(0, 8));
    if (preludeCRC !== computedPreludeCRC) {
      console.warn("[Kiro] Prelude CRC mismatch, skipping frame");
      return null;
    }

    // Parse headers starting at offset 12
    const headers: Record<string, string> = {};
    let offset = 12;
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      if (nameLen === undefined) break;
      offset++;
      const name = TEXT_DECODER.decode(data.subarray(offset, offset + nameLen));
      offset += nameLen;
      const headerType = data[offset];
      if (headerType === undefined) break;
      offset++;

      if (headerType === 7) {
        // type 7 = string
        const highByte = data[offset] ?? 0;
        const lowByte = data[offset + 1] ?? 0;
        const valueLen = (highByte << 8) | lowByte;
        offset += 2;
        const value = TEXT_DECODER.decode(
          data.subarray(offset, offset + valueLen),
        );
        offset += valueLen;
        headers[name] = value;
      } else {
        break; // Unknown header type
      }
    }

    // Parse payload: between headers end and trailing 4-byte message CRC
    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4;

    let payload: JsonRecord | null = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = TEXT_DECODER.decode(
        data.subarray(payloadStart, payloadEnd),
      );
      if (payloadStr?.trim()) {
        try {
          payload = JSON.parse(payloadStr) as JsonRecord;
        } catch {
          payload = { raw: payloadStr };
        }
      }
    }

    return { headers, payload };
  } catch {
    return null;
  }
}
