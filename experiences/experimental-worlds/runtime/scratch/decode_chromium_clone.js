const fs = require('fs');

class Reader {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
    this.objects = [];
  }

  byte() {
    if (this.offset >= this.buffer.length) throw new Error('Unexpected end of input');
    return this.buffer[this.offset++];
  }

  varint() {
    let value = 0n;
    let shift = 0n;
    while (true) {
      const byte = this.byte();
      value |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) break;
      shift += 7n;
      if (shift > 63n) throw new Error('Varint is too large');
    }
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
  }

  bytes(length) {
    const end = this.offset + Number(length);
    if (end > this.buffer.length) throw new Error('Unexpected end of input');
    const value = this.buffer.subarray(this.offset, end);
    this.offset = end;
    return value;
  }

  string(encoding) {
    return this.bytes(this.varint()).toString(encoding);
  }

  nextTag() {
    let tag = this.byte();
    while (tag === 0x00) tag = this.byte();
    return tag;
  }

  value(tag = this.nextTag()) {
    switch (tag) {
      case 0x5f: return undefined; // _
      case 0x30: return null; // 0
      case 0x54: return true; // T
      case 0x46: return false; // F
      case 0x49: { // I, zig-zag int32
        const raw = Number(this.varint());
        return (raw >>> 1) ^ -(raw & 1);
      }
      case 0x55: return Number(this.varint()); // U
      case 0x4e: { // N
        const value = this.buffer.readDoubleLE(this.offset);
        this.offset += 8;
        return value;
      }
      case 0x22: return this.string('latin1'); // one-byte string
      case 0x53: return this.string('utf8'); // UTF-8 string
      case 0x63: return this.string('utf16le'); // two-byte string
      case 0x5e: { // object reference
        const index = Number(this.varint());
        if (!(index in this.objects)) throw new Error(`Missing object reference ${index}`);
        return this.objects[index];
      }
      case 0x6f: return this.object(); // o
      case 0x41: return this.denseArray(); // A
      case 0x61: return this.sparseArray(); // a
      default:
        throw new Error(`Unsupported tag 0x${tag.toString(16)} (${JSON.stringify(String.fromCharCode(tag))}) at ${this.offset - 1}`);
    }
  }

  object() {
    const result = {};
    this.objects.push(result);
    let count = 0;
    while (true) {
      const tag = this.nextTag();
      if (tag === 0x7b) break; // {
      const key = this.value(tag);
      result[key] = this.value();
      count += 1;
    }
    const declared = Number(this.varint());
    if (declared !== count) throw new Error(`Object property mismatch: ${count} != ${declared}`);
    return result;
  }

  denseArray() {
    const length = Number(this.varint());
    const result = [];
    this.objects.push(result);
    for (let index = 0; index < length; index += 1) {
      const tag = this.nextTag();
      result.push(tag === 0x2d ? undefined : this.value(tag)); // - is a hole
    }
    let properties = 0;
    while (true) {
      const tag = this.nextTag();
      if (tag === 0x24) break; // $
      result[this.value(tag)] = this.value();
      properties += 1;
    }
    const declaredProperties = Number(this.varint());
    const declaredLength = Number(this.varint());
    if (declaredProperties !== properties || declaredLength !== length) {
      throw new Error(`Dense array metadata mismatch`);
    }
    return result;
  }

  sparseArray() {
    const length = Number(this.varint());
    const result = new Array(length);
    this.objects.push(result);
    let properties = 0;
    while (true) {
      const tag = this.nextTag();
      if (tag === 0x40) break; // @
      result[this.value(tag)] = this.value();
      properties += 1;
    }
    const declaredProperties = Number(this.varint());
    const declaredLength = Number(this.varint());
    if (declaredProperties !== properties || declaredLength !== length) {
      throw new Error(`Sparse array metadata mismatch`);
    }
    return result;
  }
}

function decodeChromiumClone(buffer) {
  const marker = buffer.indexOf(Buffer.from([0xff, 0x10]));
  if (marker < 0) throw new Error('V8 payload marker was not found');
  const reader = new Reader(buffer, marker);
  if (reader.byte() !== 0xff) throw new Error('Missing V8 version marker');
  const version = reader.varint();
  const value = reader.value();
  return { value, version, bytesRead: reader.offset, totalBytes: buffer.length };
}

if (require.main === module) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) throw new Error('Usage: node decode_chromium_clone.js INPUT [OUTPUT]');
  const decoded = decodeChromiumClone(fs.readFileSync(input));
  const root = Array.isArray(decoded.value) && decoded.value.length === 1
    ? decoded.value[0]
    : decoded.value;
  if (output) fs.writeFileSync(output, `${JSON.stringify(root, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    version: decoded.version,
    bytesRead: decoded.bytesRead,
    totalBytes: decoded.totalBytes,
    name: root?.name,
    keys: root && typeof root === 'object' ? Object.keys(root) : [],
    output: output || null,
  }, null, 2)}\n`);
}

module.exports = { decodeChromiumClone };
