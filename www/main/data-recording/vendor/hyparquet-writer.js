/* hyparquet-writer 0.16.11 + hyparquet 1.31.3, MIT (c) Kenny Daniel; bundled with esbuild, unmodified. Writes the parquet shard that Hugging Face datasets use. */
/* eslint-disable */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// entry.mjs
var entry_exports = {};
__export(entry_exports, {
  ByteWriter: () => ByteWriter,
  parquetWrite: () => parquetWrite
});
module.exports = __toCommonJS(entry_exports);

// node_modules/hyparquet-writer/src/bytewriter.js
var ByteWriter = class {
  /**
   * @param {number} [initalSize]
   */
  constructor(initalSize = 1024) {
    this.buffer = new ArrayBuffer(initalSize);
    this.view = new DataView(this.buffer);
    this.offset = 0;
    this.index = 0;
  }
  /**
   * @param {number} size
   */
  ensure(size) {
    if (this.index + size > this.buffer.byteLength) {
      const newSize = Math.max(this.buffer.byteLength * 2, this.index + size);
      const newBuffer = new ArrayBuffer(newSize);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer);
    }
  }
  finish() {
  }
  getBuffer() {
    return this.buffer.slice(0, this.index);
  }
  getBytes() {
    return new Uint8Array(this.buffer, 0, this.index);
  }
  /**
   * @param {number} value
   */
  appendUint8(value) {
    this.ensure(1);
    this.view.setUint8(this.index, value);
    this.offset++;
    this.index++;
  }
  /**
   * @param {number} value
   */
  appendUint32(value) {
    this.ensure(4);
    this.view.setUint32(this.index, value, true);
    this.offset += 4;
    this.index += 4;
  }
  /**
   * @param {number} value
   */
  appendInt32(value) {
    this.ensure(4);
    this.view.setInt32(this.index, value, true);
    this.offset += 4;
    this.index += 4;
  }
  /**
   * @param {bigint} value
   */
  appendInt64(value) {
    this.ensure(8);
    this.view.setBigInt64(this.index, BigInt(value), true);
    this.offset += 8;
    this.index += 8;
  }
  /**
   * @param {number} value
   */
  appendFloat32(value) {
    this.ensure(4);
    this.view.setFloat32(this.index, value, true);
    this.offset += 4;
    this.index += 4;
  }
  /**
   * @param {number} value
   */
  appendFloat64(value) {
    this.ensure(8);
    this.view.setFloat64(this.index, value, true);
    this.offset += 8;
    this.index += 8;
  }
  /**
   * @param {ArrayBuffer} value
   */
  appendBuffer(value) {
    this.appendBytes(new Uint8Array(value));
  }
  /**
   * @param {Uint8Array} value
   */
  appendBytes(value) {
    this.ensure(value.length);
    new Uint8Array(this.buffer, this.index, value.length).set(value);
    this.offset += value.length;
    this.index += value.length;
  }
  /**
   * Convert a 32-bit signed integer to varint (1-5 bytes).
   * Writes out groups of 7 bits at a time, setting high bit if more to come.
   *
   * @param {number} value
   */
  appendVarInt(value) {
    while (true) {
      if ((value & ~127) === 0) {
        this.appendUint8(value);
        return;
      } else {
        this.appendUint8(value & 127 | 128);
        value >>>= 7;
      }
    }
  }
  /**
   * Convert a bigint to varint (1-10 bytes for 64-bit range).
   *
   * @param {bigint} value
   */
  appendVarBigInt(value) {
    while (true) {
      if ((value & ~0x7fn) === 0n) {
        this.appendUint8(Number(value));
        return;
      } else {
        this.appendUint8(Number(value & 0x7fn | 0x80n));
        value >>= 7n;
      }
    }
  }
  /**
   * Convert number to zigzag encoding and write as varint.
   *
   * @param {number | bigint} value
   */
  appendZigZag(value) {
    if (typeof value === "number") {
      this.appendVarInt(value << 1 ^ value >> 31);
    } else {
      this.appendVarBigInt(value << 1n ^ value >> 63n);
    }
  }
};

// node_modules/hyparquet/src/schema.js
function schemaTree(schema, rootIndex, path) {
  const element = schema[rootIndex];
  const children = [];
  let count = 1;
  if (element.num_children) {
    while (children.length < element.num_children) {
      const childElement = schema[rootIndex + count];
      const child = schemaTree(schema, rootIndex + count, [...path, childElement.name]);
      count += child.count;
      children.push(child);
    }
  }
  return { count, element, children, path };
}
function getSchemaPath(schema, name) {
  let tree = schemaTree(schema, 0, []);
  const path = [tree];
  for (const part of name) {
    const child = tree.children.find((child2) => child2.element.name === part);
    if (!child) throw new Error(`parquet schema element not found: ${name}`);
    path.push(child);
    tree = child;
  }
  return path;
}
function getMaxDefinitionLevel(schemaPath) {
  let maxLevel = 0;
  for (const { element } of schemaPath.slice(1)) {
    if (element.repetition_type !== "REQUIRED") {
      maxLevel++;
    }
  }
  return maxLevel;
}
function isListLike(schema) {
  if (!schema) return false;
  if (schema.element.converted_type !== "LIST") return false;
  if (schema.children.length > 1) return false;
  const firstChild = schema.children[0];
  if (firstChild.children.length > 1) return false;
  if (firstChild.element.repetition_type !== "REPEATED") return false;
  return true;
}
function isMapLike(schema) {
  if (!schema) return false;
  if (schema.element.converted_type !== "MAP") return false;
  if (schema.children.length > 1) return false;
  const firstChild = schema.children[0];
  if (firstChild.children.length !== 2) return false;
  if (firstChild.element.repetition_type !== "REPEATED") return false;
  const keyChild = firstChild.children.find((child) => child.element.name === "key");
  if (keyChild?.element.repetition_type === "REPEATED") return false;
  const valueChild = firstChild.children.find((child) => child.element.name === "value");
  if (valueChild?.element.repetition_type === "REPEATED") return false;
  return true;
}

// node_modules/hyparquet/src/xxhash.js
var MASK = 0xffffffffffffffffn;
var PRIME1 = 0x9e3779b185ebca87n;
var PRIME2 = 0xc2b2ae3d27d4eb4fn;
var PRIME3 = 0x165667b19e3779f9n;
var PRIME4 = 0x85ebca77c2b2ae63n;
var PRIME5 = 0x27d4eb2f165667c5n;
function rotl64(x, r) {
  return (x << r | x >> 64n - r) & MASK;
}
function round(acc, val) {
  acc = acc + val * PRIME2 & MASK;
  acc = rotl64(acc, 31n);
  return acc * PRIME1 & MASK;
}
function mergeRound(acc, val) {
  acc ^= round(0n, val);
  return acc * PRIME1 + PRIME4 & MASK;
}
function xxhash64(input, seed = 0n) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const len = input.byteLength;
  let offset = 0;
  let h64;
  if (len >= 32) {
    let v1 = seed + PRIME1 + PRIME2 & MASK;
    let v2 = seed + PRIME2 & MASK;
    let v3 = seed;
    let v4 = seed - PRIME1 & MASK;
    while (offset + 32 <= len) {
      v1 = round(v1, view.getBigUint64(offset, true));
      offset += 8;
      v2 = round(v2, view.getBigUint64(offset, true));
      offset += 8;
      v3 = round(v3, view.getBigUint64(offset, true));
      offset += 8;
      v4 = round(v4, view.getBigUint64(offset, true));
      offset += 8;
    }
    h64 = rotl64(v1, 1n) + rotl64(v2, 7n) + rotl64(v3, 12n) + rotl64(v4, 18n) & MASK;
    h64 = mergeRound(h64, v1);
    h64 = mergeRound(h64, v2);
    h64 = mergeRound(h64, v3);
    h64 = mergeRound(h64, v4);
  } else {
    h64 = seed + PRIME5 & MASK;
  }
  h64 = h64 + BigInt(len) & MASK;
  while (offset + 8 <= len) {
    h64 ^= round(0n, view.getBigUint64(offset, true));
    h64 = rotl64(h64, 27n) * PRIME1 + PRIME4 & MASK;
    offset += 8;
  }
  if (offset + 4 <= len) {
    h64 ^= BigInt(view.getUint32(offset, true)) * PRIME1 & MASK;
    h64 = rotl64(h64, 23n) * PRIME2 + PRIME3 & MASK;
    offset += 4;
  }
  while (offset < len) {
    h64 ^= BigInt(view.getUint8(offset)) * PRIME5 & MASK;
    h64 = rotl64(h64, 11n) * PRIME1 & MASK;
    offset += 1;
  }
  h64 ^= h64 >> 33n;
  h64 = h64 * PRIME2 & MASK;
  h64 ^= h64 >> 29n;
  h64 = h64 * PRIME3 & MASK;
  h64 ^= h64 >> 32n;
  return h64;
}

// node_modules/hyparquet/src/bloom.js
var textEncoder = new TextEncoder();
var SALT = new Uint32Array([
  1203114875,
  1150766481,
  2284105051,
  2729912477,
  1884591559,
  770785867,
  2667333959,
  1550580529
]);
function hashParquetValue(value, element) {
  if (value === null || value === void 0) return void 0;
  const { type, converted_type, logical_type } = element;
  if (type === "BOOLEAN") {
    if (typeof value !== "boolean") return void 0;
    return xxhash64(new Uint8Array([value ? 1 : 0]));
  }
  if (type === "FLOAT") {
    if (typeof value !== "number") return void 0;
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    return xxhash64(new Uint8Array(buf));
  }
  if (type === "DOUBLE") {
    if (typeof value !== "number") return void 0;
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, true);
    return xxhash64(new Uint8Array(buf));
  }
  if (type === "INT32") {
    if (converted_type === "DATE" || converted_type === "DECIMAL" || converted_type === "TIME_MILLIS") return void 0;
    if (logical_type?.type === "DATE" || logical_type?.type === "TIME" || logical_type?.type === "DECIMAL") return void 0;
    if (typeof value !== "number" || !Number.isInteger(value)) return void 0;
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value | 0, true);
    return xxhash64(new Uint8Array(buf));
  }
  if (type === "INT64") {
    if (converted_type === "TIMESTAMP_MILLIS" || converted_type === "TIMESTAMP_MICROS") return void 0;
    if (converted_type === "TIME_MICROS" || converted_type === "DECIMAL") return void 0;
    if (logical_type?.type === "TIMESTAMP" || logical_type?.type === "TIME" || logical_type?.type === "DECIMAL") return void 0;
    let bigValue;
    if (typeof value === "bigint") bigValue = value;
    else if (typeof value === "number" && Number.isSafeInteger(value)) bigValue = BigInt(value);
    else return void 0;
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, BigInt.asUintN(64, bigValue), true);
    return xxhash64(new Uint8Array(buf));
  }
  if (type === "BYTE_ARRAY") {
    if (converted_type === "JSON" || converted_type === "BSON" || converted_type === "DECIMAL") return void 0;
    if (logical_type?.type === "JSON" || logical_type?.type === "BSON" || logical_type?.type === "VARIANT") return void 0;
    if (logical_type?.type === "GEOMETRY" || logical_type?.type === "GEOGRAPHY") return void 0;
    if (typeof value === "string") return xxhash64(textEncoder.encode(value));
    if (value instanceof Uint8Array) return xxhash64(value);
    return void 0;
  }
  if (type === "FIXED_LEN_BYTE_ARRAY") {
    if (converted_type === "DECIMAL" || converted_type === "INTERVAL") return void 0;
    if (logical_type?.type === "DECIMAL" || logical_type?.type === "UUID" || logical_type?.type === "FLOAT16") return void 0;
    if (logical_type?.type === "GEOMETRY" || logical_type?.type === "GEOGRAPHY") return void 0;
    if (value instanceof Uint8Array) return xxhash64(value);
    return void 0;
  }
  return void 0;
}

// node_modules/hyparquet-writer/src/thrift.js
var STOP = 0;
var TRUE = 1;
var FALSE = 2;
var BYTE = 3;
var I32 = 5;
var I64 = 6;
var DOUBLE = 7;
var BINARY = 8;
var LIST = 9;
var STRUCT = 12;
var ThriftStruct = class {
  /**
   * @param {ThriftField[]} fields
   */
  constructor(fields) {
    this.fields = fields;
  }
};
function serializeTCompactProtocol(writer, data) {
  writeElement(writer, STRUCT, data);
}
function writeElement(writer, type, value) {
  if (type === TRUE) return;
  if (type === FALSE) return;
  if (type === BYTE && typeof value === "number") {
    writer.appendUint8(value);
  } else if (type === I32 && typeof value === "number") {
    writer.appendZigZag(value);
  } else if (type === I64 && typeof value === "bigint") {
    writer.appendZigZag(value);
  } else if (type === DOUBLE && typeof value === "number") {
    writer.appendFloat64(value);
  } else if (type === BINARY && typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    writer.appendVarInt(bytes.length);
    writer.appendBytes(bytes);
  } else if (type === BINARY && value instanceof Uint8Array) {
    writer.appendVarInt(value.byteLength);
    writer.appendBytes(value);
  } else if (type === LIST && Array.isArray(value)) {
    const elemType = getCompactTypeForList(value);
    if (value.length > 14) {
      writer.appendUint8(15 << 4 | elemType);
      writer.appendVarInt(value.length);
    } else {
      writer.appendUint8(value.length << 4 | elemType);
    }
    if (elemType === FALSE) {
      for (const v of value) {
        writer.appendUint8(v ? 1 : 0);
      }
    } else {
      for (const v of value) {
        writeElement(writer, elemType, v);
      }
    }
  } else if (type === STRUCT && value instanceof ThriftStruct) {
    let lastFid = 0;
    for (const [fid, fieldType, fieldValue] of value.fields) {
      if (fieldValue === void 0) continue;
      lastFid = writeStructField(writer, lastFid, fid, fieldType, fieldValue);
    }
    writer.appendUint8(STOP);
  } else if (type === STRUCT && typeof value === "object") {
    let lastFid = 0;
    for (const [k, v] of Object.entries(value)) {
      if (v === void 0) continue;
      const fid = parseInt(k.replace(/^field_/, ""), 10);
      if (Number.isNaN(fid)) {
        throw new Error(`thrift invalid field name: ${k}. Expected "field_###"`);
      }
      const t = getCompactTypeForValue(v);
      lastFid = writeStructField(writer, lastFid, fid, t, v);
    }
    writer.appendUint8(STOP);
  } else {
    throw new Error(`thrift invalid type ${type} for value ${value}`);
  }
}
function writeStructField(writer, lastFid, fid, type, value) {
  const delta = fid - lastFid;
  if (delta <= 0) {
    throw new Error(`thrift non-monotonic field id: fid=${fid}, lastFid=${lastFid}`);
  }
  if (delta > 15) {
    writer.appendUint8(type);
    writer.appendZigZag(fid);
  } else {
    writer.appendUint8(delta << 4 | type);
  }
  writeElement(writer, type, value);
  return fid;
}
function getCompactTypeForValue(value) {
  if (value === true) return TRUE;
  if (value === false) return FALSE;
  if (Number.isInteger(value)) return I32;
  if (typeof value === "number") return DOUBLE;
  if (typeof value === "bigint") return I64;
  if (typeof value === "string") return BINARY;
  if (value instanceof Uint8Array) return BINARY;
  if (Array.isArray(value)) return LIST;
  if (value && typeof value === "object") return STRUCT;
  throw new Error(`Cannot determine thrift compact type for: ${value}`);
}
function getCompactTypeForList(value) {
  let elemType = 0;
  for (const v of value) {
    let t = getCompactTypeForValue(v);
    if (t === TRUE) t = FALSE;
    if (!elemType) elemType = t;
    if (elemType === DOUBLE && t === I32) t = DOUBLE;
    if (elemType === I32 && t === DOUBLE) elemType = DOUBLE;
    if (t !== elemType) {
      throw new Error(`thrift invalid type for list element: ${v} (expected type ${elemType})`);
    }
  }
  return elemType ?? BYTE;
}

// node_modules/hyparquet-writer/src/bloom.js
var SALT2 = new Uint32Array([
  1203114875,
  1150766481,
  2284105051,
  2729912477,
  1884591559,
  770785867,
  2667333959,
  1550580529
]);
var BYTES_PER_BLOCK = 32;
var MIN_BYTES = 32;
var MAX_BYTES = 128 * 1024 * 1024;
function blockIndex(hash, numBlocks) {
  return Number((hash >> 32n) * BigInt(numBlocks) >> 32n);
}
function blockMask(hash) {
  const m = new Uint32Array(8);
  const low = Number(hash & 0xffffffffn) | 0;
  for (let i = 0; i < 8; i++) {
    m[i] = 1 << (Math.imul(low, SALT2[i]) >>> 27);
  }
  return m;
}
function sbbfInsert(blocks, hash) {
  const offset = blockIndex(hash, blocks.length >> 3) << 3;
  const m = blockMask(hash);
  for (let i = 0; i < 8; i++) {
    blocks[offset + i] |= m[i];
  }
}
function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
function optimalNumBytes(ndv, fpp) {
  if (!(fpp > 0 && fpp < 1)) throw new Error(`bloom filter fpp must be in (0, 1), got ${fpp}`);
  if (!(ndv >= 0)) throw new Error(`bloom filter ndv must be >= 0, got ${ndv}`);
  const m = -8 * ndv / Math.log(1 - fpp ** (1 / 8));
  let numBits = Math.ceil(m);
  if (!isFinite(numBits) || numBits > MAX_BYTES << 3) numBits = MAX_BYTES << 3;
  const blockBits = BYTES_PER_BLOCK << 3;
  numBits = Math.ceil(numBits / blockBits) * blockBits;
  let numBytes = numBits >> 3;
  if (numBytes < MIN_BYTES) numBytes = MIN_BYTES;
  if (numBytes < 1024) numBytes = nextPowerOfTwo(numBytes);
  return numBytes;
}
var BloomBuilder = class {
  /**
   * @param {SchemaElement} element
   * @param {{ fpp?: number, maxBytes?: number }} [options]
   */
  constructor(element, { fpp = 0.01, maxBytes = 1024 * 1024 } = {}) {
    this.element = element;
    this.fpp = fpp;
    this.maxBytes = maxBytes;
    this.hashes = /* @__PURE__ */ new Set();
    this.skipped = 0;
  }
  /** @param {any} value */
  insert(value) {
    if (value === null || value === void 0) return;
    const h = hashParquetValue(value, this.element);
    if (h === void 0) {
      this.skipped++;
      return;
    }
    this.hashes.add(h);
  }
  /** @returns {Uint32Array | undefined} */
  finalize() {
    if (this.skipped > 0 || this.hashes.size === 0) return void 0;
    const numBytes = optimalNumBytes(this.hashes.size, this.fpp);
    if (numBytes > this.maxBytes) return void 0;
    const blocks = new Uint32Array(numBytes >> 2);
    for (const h of this.hashes) sbbfInsert(blocks, h);
    return blocks;
  }
};
function writeBloomFilter(writer, blocks) {
  if (blocks.length % 8 !== 0) {
    throw new Error(`bloom filter block count must be a multiple of 8 uint32 words, got ${blocks.length}`);
  }
  serializeTCompactProtocol(writer, {
    field_1: blocks.byteLength,
    // numBytes
    field_2: { field_1: {} },
    // algorithm: SplitBlockAlgorithm
    field_3: { field_1: {} },
    // hash: XxHash
    field_4: { field_1: {} }
    // compression: Uncompressed
  });
  for (let i = 0; i < blocks.length; i++) {
    writer.appendUint32(blocks[i]);
  }
}
function writeBlooms(writer, pageIndexes) {
  for (const { chunk, bloomFilter } of pageIndexes) {
    if (!bloomFilter || !chunk.meta_data) continue;
    const offset = writer.offset;
    writeBloomFilter(writer, bloomFilter);
    chunk.meta_data.bloom_filter_offset = BigInt(offset);
    chunk.meta_data.bloom_filter_length = writer.offset - offset;
  }
}

// node_modules/hyparquet/src/constants.js
var ParquetTypes = [
  "BOOLEAN",
  "INT32",
  "INT64",
  "INT96",
  // deprecated
  "FLOAT",
  "DOUBLE",
  "BYTE_ARRAY",
  "FIXED_LEN_BYTE_ARRAY"
];
var Encodings = [
  "PLAIN",
  "GROUP_VAR_INT",
  // deprecated
  "PLAIN_DICTIONARY",
  "RLE",
  "BIT_PACKED",
  // deprecated
  "DELTA_BINARY_PACKED",
  "DELTA_LENGTH_BYTE_ARRAY",
  "DELTA_BYTE_ARRAY",
  "RLE_DICTIONARY",
  "BYTE_STREAM_SPLIT"
];
var FieldRepetitionTypes = [
  "REQUIRED",
  "OPTIONAL",
  "REPEATED"
];
var ConvertedTypes = [
  "UTF8",
  "MAP",
  "MAP_KEY_VALUE",
  "LIST",
  "ENUM",
  "DECIMAL",
  "DATE",
  "TIME_MILLIS",
  "TIME_MICROS",
  "TIMESTAMP_MILLIS",
  "TIMESTAMP_MICROS",
  "UINT_8",
  "UINT_16",
  "UINT_32",
  "UINT_64",
  "INT_8",
  "INT_16",
  "INT_32",
  "INT_64",
  "JSON",
  "BSON",
  "INTERVAL"
];
var CompressionCodecs = [
  "UNCOMPRESSED",
  "SNAPPY",
  "GZIP",
  "LZO",
  "BROTLI",
  "LZ4",
  "ZSTD",
  "LZ4_RAW"
];
var PageTypes = [
  "DATA_PAGE",
  "INDEX_PAGE",
  "DICTIONARY_PAGE",
  "DATA_PAGE_V2"
];
var BoundaryOrders = [
  "UNORDERED",
  "ASCENDING",
  "DESCENDING"
];
var EdgeInterpolationAlgorithms = [
  "SPHERICAL",
  "VINCENTY",
  "THOMAS",
  "ANDOYER",
  "KARNEY"
];

// node_modules/hyparquet-writer/src/delta.js
var BLOCK_SIZE = 128;
var MINIBLOCKS_PER_BLOCK = 4;
var VALUES_PER_MINIBLOCK = BLOCK_SIZE / MINIBLOCKS_PER_BLOCK;
function deltaBinaryPack(writer, values) {
  if (values.length === 0) {
    writer.appendVarInt(BLOCK_SIZE);
    writer.appendVarInt(MINIBLOCKS_PER_BLOCK);
    writer.appendVarInt(0);
    writer.appendVarInt(0);
    return;
  }
  if (typeof values[0] !== "number" && typeof values[0] !== "bigint") {
    throw new Error("deltaBinaryPack only supports number or bigint arrays");
  }
  if (usesInt32NumberPath(values)) {
    deltaBinaryPackInt32(writer, values);
  } else {
    deltaBinaryPackBigInt(writer, values);
  }
}
function usesInt32NumberPath(values) {
  if (values instanceof Int32Array) return true;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (typeof value !== "number" || value !== (value | 0)) return false;
  }
  return true;
}
function deltaBinaryPackInt32(writer, values) {
  const count = values.length;
  writer.appendVarInt(BLOCK_SIZE);
  writer.appendVarInt(MINIBLOCKS_PER_BLOCK);
  writer.appendVarInt(count);
  appendZigZagNumber(writer, values[0]);
  const packedByBitWidth = [];
  const blockDeltas = new Float64Array(BLOCK_SIZE);
  const bitWidths = new Uint8Array(MINIBLOCKS_PER_BLOCK);
  let index = 1;
  while (index < count) {
    const blockEnd = Math.min(index + BLOCK_SIZE, count);
    const blockSize = blockEnd - index;
    const firstDelta = values[index] - values[index - 1];
    let previous = values[index];
    let constantEnd = index + 1;
    while (constantEnd < blockEnd) {
      const value = values[constantEnd];
      if (value - previous !== firstDelta) break;
      previous = value;
      constantEnd++;
    }
    if (constantEnd === blockEnd) {
      appendZigZagNumber(writer, firstDelta);
      writer.appendUint32(0);
      index = blockEnd;
      continue;
    }
    let minDelta = values[index] - values[index - 1];
    blockDeltas[0] = minDelta;
    for (let i = 1; i < blockSize; i++) {
      const delta = values[index + i] - values[index + i - 1];
      blockDeltas[i] = delta;
      if (delta < minDelta) minDelta = delta;
    }
    appendZigZagNumber(writer, minDelta);
    for (let mb = 0; mb < MINIBLOCKS_PER_BLOCK; mb++) {
      const mbStart = mb * VALUES_PER_MINIBLOCK;
      const mbEnd = Math.min(mbStart + VALUES_PER_MINIBLOCK, blockSize);
      let maxAdjusted = 0;
      for (let i = mbStart; i < mbEnd; i++) {
        const adjusted = blockDeltas[i] - minDelta;
        if (adjusted > maxAdjusted) maxAdjusted = adjusted;
      }
      bitWidths[mb] = bitWidthNumber(maxAdjusted);
    }
    writer.appendBytes(bitWidths);
    for (let mb = 0; mb < MINIBLOCKS_PER_BLOCK; mb++) {
      const bitWidth2 = bitWidths[mb];
      if (bitWidth2 === 0) continue;
      const mbStart = mb * VALUES_PER_MINIBLOCK;
      const mbEnd = Math.min(mbStart + VALUES_PER_MINIBLOCK, blockSize);
      const packed = packedByBitWidth[bitWidth2] ??= new Uint8Array(bitWidth2 * 4);
      let byteIndex = 0;
      let buffer = 0;
      let bitsUsed = 0;
      if (bitWidth2 <= 25) {
        for (let i = 0; i < VALUES_PER_MINIBLOCK; i++) {
          const adjusted = mbStart + i < mbEnd ? blockDeltas[mbStart + i] - minDelta : 0;
          buffer |= adjusted << bitsUsed;
          bitsUsed += bitWidth2;
          while (bitsUsed >= 8) {
            packed[byteIndex++] = buffer & 255;
            buffer >>>= 8;
            bitsUsed -= 8;
          }
        }
      } else {
        for (let i = 0; i < VALUES_PER_MINIBLOCK; i++) {
          const adjusted = mbStart + i < mbEnd ? blockDeltas[mbStart + i] - minDelta : 0;
          buffer += adjusted * 2 ** bitsUsed;
          bitsUsed += bitWidth2;
          while (bitsUsed >= 8) {
            packed[byteIndex++] = buffer % 256;
            buffer = Math.floor(buffer / 256);
            bitsUsed -= 8;
          }
        }
      }
      writer.appendBytes(packed);
    }
    index = blockEnd;
  }
}
function deltaBinaryPackBigInt(writer, values) {
  const count = values.length;
  writer.appendVarInt(BLOCK_SIZE);
  writer.appendVarInt(MINIBLOCKS_PER_BLOCK);
  writer.appendVarInt(count);
  writer.appendZigZag(values[0]);
  const blockDeltas = new BigInt64Array(BLOCK_SIZE);
  const bitWidths = new Uint8Array(MINIBLOCKS_PER_BLOCK);
  let index = 1;
  while (index < count) {
    const blockEnd = Math.min(index + BLOCK_SIZE, count);
    const blockSize = blockEnd - index;
    let minDelta = BigInt(values[index]) - BigInt(values[index - 1]);
    blockDeltas[0] = minDelta;
    for (let i = 1; i < blockSize; i++) {
      const delta = BigInt(values[index + i]) - BigInt(values[index + i - 1]);
      blockDeltas[i] = delta;
      if (delta < minDelta) minDelta = delta;
    }
    writer.appendZigZag(minDelta);
    for (let mb = 0; mb < MINIBLOCKS_PER_BLOCK; mb++) {
      const mbStart = mb * VALUES_PER_MINIBLOCK;
      const mbEnd = Math.min(mbStart + VALUES_PER_MINIBLOCK, blockSize);
      let maxAdjusted = 0n;
      for (let i = mbStart; i < mbEnd; i++) {
        const adjusted = blockDeltas[i] - minDelta;
        if (adjusted > maxAdjusted) maxAdjusted = adjusted;
      }
      bitWidths[mb] = bitWidth(maxAdjusted);
    }
    writer.appendBytes(bitWidths);
    for (let mb = 0; mb < MINIBLOCKS_PER_BLOCK; mb++) {
      const bitWidth2 = bitWidths[mb];
      if (bitWidth2 === 0) continue;
      const mbStart = mb * VALUES_PER_MINIBLOCK;
      const mbEnd = Math.min(mbStart + VALUES_PER_MINIBLOCK, blockSize);
      let buffer = 0n;
      let bitsUsed = 0;
      for (let i = 0; i < VALUES_PER_MINIBLOCK; i++) {
        const adjusted = mbStart + i < mbEnd ? blockDeltas[mbStart + i] - minDelta : 0n;
        buffer |= adjusted << BigInt(bitsUsed);
        bitsUsed += bitWidth2;
        while (bitsUsed >= 8) {
          writer.appendUint8(Number(buffer & 0xffn));
          buffer >>= 8n;
          bitsUsed -= 8;
        }
      }
    }
    index = blockEnd;
  }
}
function appendZigZagNumber(writer, value) {
  let encoded = value < 0 ? -value * 2 - 1 : value * 2;
  while (encoded >= 128) {
    writer.appendUint8(encoded % 128 + 128);
    encoded = Math.floor(encoded / 128);
  }
  writer.appendUint8(encoded);
}
function bitWidthNumber(value) {
  if (value === 0) return 0;
  return value > 4294967295 ? 33 : 32 - Math.clz32(value);
}
function deltaLengthByteArray(writer, values) {
  const lengths = new Int32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!(value instanceof Uint8Array)) {
      throw new Error("deltaLengthByteArray expects Uint8Array values");
    }
    lengths[i] = value.length;
  }
  deltaBinaryPack(writer, lengths);
  for (const value of values) {
    writer.appendBytes(value);
  }
}
function deltaByteArray(writer, values) {
  if (values.length === 0) {
    deltaBinaryPack(writer, []);
    deltaBinaryPack(writer, []);
    return;
  }
  const prefixLengths = new Int32Array(values.length);
  const suffixLengths = new Int32Array(values.length);
  const value = values[0];
  if (!(value instanceof Uint8Array)) {
    throw new Error("deltaByteArray expects Uint8Array values");
  }
  prefixLengths[0] = 0;
  suffixLengths[0] = value.length;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    let prefixLen;
    if (curr === prev) {
      prefixLen = curr.length;
    } else {
      if (!(curr instanceof Uint8Array)) {
        throw new Error("deltaByteArray expects Uint8Array values");
      }
      prefixLen = 0;
      const maxPrefix = Math.min(prev.length, curr.length);
      while (prefixLen < maxPrefix && prev[prefixLen] === curr[prefixLen]) {
        prefixLen++;
      }
    }
    prefixLengths[i] = prefixLen;
    suffixLengths[i] = curr.length - prefixLen;
  }
  deltaBinaryPack(writer, prefixLengths);
  deltaBinaryPack(writer, suffixLengths);
  for (let i = 0; i < values.length; i++) {
    if (suffixLengths[i] > 0) {
      writer.appendBytes(values[i].subarray(prefixLengths[i]));
    }
  }
}
function bitWidth(value) {
  if (value === 0n) return 0;
  let bits = 0;
  while (value > 0n) {
    bits++;
    value >>= 1n;
  }
  return bits;
}

// node_modules/hyparquet-writer/src/encoding.js
function writeRleBitPackedHybrid(writer, values, bitWidth2) {
  const offsetStart = writer.offset;
  let pendingBitPackedGroups = 0;
  let bitPackedStart = 0;
  let i = 0;
  while (i < values.length) {
    let rleCount = 1;
    const firstVal = values[i];
    while (i + rleCount < values.length && values[i + rleCount] === firstVal) {
      rleCount++;
    }
    if (rleCount >= 8) {
      if (pendingBitPackedGroups) {
        writeBitPackedGroups(writer, values, bitPackedStart, pendingBitPackedGroups, bitWidth2);
        pendingBitPackedGroups = 0;
      }
      writeRleRun(writer, firstVal, rleCount, bitWidth2);
      i += rleCount;
    } else {
      if (pendingBitPackedGroups === 0) {
        bitPackedStart = i;
      }
      pendingBitPackedGroups++;
      i += 8;
    }
  }
  if (pendingBitPackedGroups) {
    writeBitPackedGroups(writer, values, bitPackedStart, pendingBitPackedGroups, bitWidth2);
  }
  return writer.offset - offsetStart;
}
function writeRleRun(writer, value, count, bitWidth2) {
  writer.appendVarInt(count << 1);
  const width = bitWidth2 + 7 >> 3;
  for (let j = 0; j < width; j++) {
    writer.appendUint8(value >> (j << 3) & 255);
  }
}
function writeBitPackedGroups(writer, values, start, numGroups, bitWidth2) {
  writer.appendVarInt(numGroups << 1 | 1);
  if (bitWidth2 === 0) return;
  const mask = (1 << bitWidth2) - 1;
  let buffer = 0;
  let bitsUsed = 0;
  const totalValues = numGroups * 8;
  for (let i = 0; i < totalValues; i++) {
    const idx = start + i;
    const v = idx < values.length ? values[idx] & mask : 0;
    buffer |= v << bitsUsed;
    bitsUsed += bitWidth2;
    while (bitsUsed >= 8) {
      writer.appendUint8(buffer & 255);
      buffer >>>= 8;
      bitsUsed -= 8;
    }
  }
  if (bitsUsed > 0) {
    writer.appendUint8(buffer & 255);
  }
}

// node_modules/hyparquet-writer/src/plain.js
function writePlain(writer, values, type, fixedLength) {
  if (type === "BOOLEAN") {
    writePlainBoolean(writer, values);
  } else if (type === "INT32") {
    writePlainInt32(writer, values);
  } else if (type === "INT64") {
    writePlainInt64(writer, values);
  } else if (type === "FLOAT") {
    writePlainFloat(writer, values);
  } else if (type === "DOUBLE") {
    writePlainDouble(writer, values);
  } else if (type === "BYTE_ARRAY") {
    writePlainByteArray(writer, values);
  } else if (type === "FIXED_LEN_BYTE_ARRAY") {
    if (!fixedLength) throw new Error("parquet FIXED_LEN_BYTE_ARRAY expected type_length");
    writePlainByteArrayFixed(writer, values, fixedLength);
  } else {
    throw new Error(`parquet unsupported type: ${type}`);
  }
}
function writePlainBoolean(writer, values) {
  let currentByte = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (typeof value !== "boolean") throw new Error("parquet expected boolean value, got " + value);
    const bitOffset = i % 8;
    if (value) {
      currentByte |= 1 << bitOffset;
    }
    if (bitOffset === 7) {
      writer.appendUint8(currentByte);
      currentByte = 0;
    }
  }
  if (values.length % 8) {
    writer.appendUint8(currentByte);
  }
}
function writePlainInt32(writer, values) {
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new Error("parquet expected integer value, got " + value);
    if (value < -2147483648 || value > 2147483647) throw new Error("parquet expected int32 value, got " + value);
    writer.appendInt32(value);
  }
}
function writePlainInt64(writer, values) {
  for (const value of values) {
    if (typeof value !== "bigint") throw new Error("parquet expected bigint value, got " + value);
    writer.appendInt64(value);
  }
}
function writePlainFloat(writer, values) {
  for (const value of values) {
    if (typeof value !== "number") throw new Error("parquet expected number value, got " + value);
    writer.appendFloat32(value);
  }
}
function writePlainDouble(writer, values) {
  for (const value of values) {
    if (typeof value !== "number") throw new Error("parquet expected number value, got " + value);
    writer.appendFloat64(value);
  }
}
function writePlainByteArray(writer, values) {
  for (const value of values) {
    let bytes = value;
    if (typeof bytes === "string") {
      bytes = new TextEncoder().encode(value);
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("parquet expected Uint8Array value, got " + typeof bytes);
    }
    writer.appendUint32(bytes.length);
    writer.appendBytes(bytes);
  }
}
function writePlainByteArrayFixed(writer, values, fixedLength) {
  for (const value of values) {
    if (!(value instanceof Uint8Array)) throw new Error("parquet expected Uint8Array value, got " + typeof value);
    if (value.length !== fixedLength) throw new Error(`parquet expected Uint8Array of length ${fixedLength}`);
    writer.appendBytes(value);
  }
}

// node_modules/hyparquet-writer/src/variant.js
var encoder = new TextEncoder();
var INT64_MIN = -9223372036854775808n;
var INT64_MAX = 9223372036854775807n;
var VARIANT_NULL = new Uint8Array([0]);
var RESERVED_SHREDDING_FIELDS = /* @__PURE__ */ new Set(["value", "typed_value"]);
var EMPTY_KEY_INDEX = /* @__PURE__ */ new Map();
var EMPTY_METADATA = writeVariantMetadata([]);
function encodeVariantColumn(values, shredding, column) {
  if (column?.required) {
    for (let i = 0; i < values.length; i++) {
      if (values[i] === void 0) {
        throw new Error(`required variant column ${column.name} has undefined value at index ${i}`);
      }
    }
  }
  const scratchWriters = [];
  const shreddingConfig = shredding && normalizeShreddingConfig(shredding);
  if (shreddingConfig) {
    const metadataCache = /* @__PURE__ */ new Map();
    return values.map((value) => {
      if (value === void 0) return null;
      const keys = /* @__PURE__ */ new Set();
      collectKeys(value, keys);
      const { metadata: metadata2, keyIndex: keyIndex2 } = getVariantRowMetadata(keys, metadataCache);
      return { metadata: metadata2, ...encodeShredded(value, shreddingConfig, keyIndex2, true, scratchWriters) };
    });
  }
  const dictionary = buildVariantDictionary(values);
  const metadata = writeVariantMetadata(dictionary);
  const keyIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < dictionary.length; i++) {
    keyIndex.set(dictionary[i], i);
  }
  return values.map((value) => {
    if (value === void 0) return null;
    return { metadata, value: writeVariantValue(value, keyIndex, scratchWriters) };
  });
}
function encodeShredded(value, shredType, keyIndex, allowPartialObjects, scratchWriters) {
  if (value === null || value === void 0) {
    return { value: VARIANT_NULL, typed_value: null };
  }
  if (Array.isArray(shredType)) {
    if (!Array.isArray(value)) {
      return { value: writeVariantValue(value, keyIndex, scratchWriters), typed_value: null };
    }
    const elemShred = shredType[0];
    return {
      value: null,
      typed_value: value.map((el) => encodeShredded(el, elemShred, keyIndex, false, scratchWriters))
    };
  }
  if (typeof shredType === "object") {
    if (typeof value !== "object" || Array.isArray(value) || value instanceof Date || value instanceof Uint8Array) {
      return { value: writeVariantValue(value, keyIndex, scratchWriters), typed_value: null };
    }
    const remaining = {};
    let hasRemaining = false;
    for (const k of Object.keys(value)) {
      if (k in shredType || value[k] === void 0) continue;
      remaining[k] = value[k];
      hasRemaining = true;
    }
    if (hasRemaining && !allowPartialObjects) {
      return { value: writeVariantValue(value, keyIndex, scratchWriters), typed_value: null };
    }
    const fieldNames = Object.keys(shredType);
    const hasMissingFieldConflict = fieldNames.some(
      (fieldName) => (!Object.prototype.hasOwnProperty.call(value, fieldName) || value[fieldName] === void 0) && keyIndex.has(fieldName)
    );
    if (hasMissingFieldConflict) {
      return { value: writeVariantValue(value, keyIndex, scratchWriters), typed_value: null };
    }
    const typedValue = {};
    for (const fieldName of fieldNames) {
      if (!Object.prototype.hasOwnProperty.call(value, fieldName) || value[fieldName] === void 0) {
        continue;
      }
      typedValue[fieldName] = encodeShredded(
        value[fieldName],
        shredType[fieldName],
        keyIndex,
        false,
        scratchWriters
      );
    }
    const binaryValue = hasRemaining ? writeVariantValue(remaining, keyIndex, scratchWriters) : null;
    return { value: binaryValue, typed_value: typedValue };
  }
  if (matchesType(value, shredType)) {
    return { value: null, typed_value: value };
  }
  return { value: writeVariantValue(value, keyIndex, scratchWriters), typed_value: null };
}
function getVariantRowMetadata(keys, metadataCache) {
  if (keys.size === 0) {
    return { metadata: EMPTY_METADATA, keyIndex: EMPTY_KEY_INDEX };
  }
  const dictionary = [...keys].sort();
  const cacheKey = dictionary.join("\0");
  const cached = metadataCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const metadata = writeVariantMetadata(dictionary);
  const keyIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < dictionary.length; i++) keyIndex.set(dictionary[i], i);
  const rowMetadata = { metadata, keyIndex };
  metadataCache.set(cacheKey, rowMetadata);
  return rowMetadata;
}
function matchesType(value, type) {
  if (value === null || value === void 0) return false;
  switch (type) {
    case "BOOLEAN":
      return typeof value === "boolean";
    case "INT32":
      return typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
    case "INT64":
      return typeof value === "bigint" && value >= INT64_MIN && value <= INT64_MAX;
    case "FLOAT":
      return typeof value === "number";
    case "DOUBLE":
      return typeof value === "number";
    case "STRING":
      return typeof value === "string";
    case "TIMESTAMP":
      return value instanceof Date;
    default:
      return false;
  }
}
var MAX_SHRED_DEPTH = 3;
var MAX_SHRED_LEAVES = 256;
function autoDetectShredding(values) {
  const detected = detectShred(values, 0);
  if (detected === void 0 || typeof detected !== "object") return void 0;
  const normalized = normalizeShreddingConfig(detected);
  if (normalized === void 0 || countShredLeaves(normalized) > MAX_SHRED_LEAVES) return void 0;
  return normalized;
}
function countShredLeaves(shredType) {
  if (Array.isArray(shredType)) return shredType.length ? countShredLeaves(shredType[0]) : 0;
  if (shredType && typeof shredType === "object") {
    let leaves = 0;
    for (const key of Object.keys(shredType)) leaves += countShredLeaves(shredType[key]);
    return leaves;
  }
  return 1;
}
function detectShred(values, depth) {
  const nonNull = [];
  for (const v of values) {
    if (v !== null && v !== void 0) nonNull.push(v);
  }
  if (!nonNull.length) return void 0;
  if (nonNull.some(isPlainObject)) {
    if (depth >= MAX_SHRED_DEPTH) return void 0;
    const fieldValues = /* @__PURE__ */ new Map();
    for (const v of nonNull) {
      if (!isPlainObject(v)) continue;
      for (const [key, fieldValue] of Object.entries(v)) {
        if (fieldValue === void 0) continue;
        const arr = fieldValues.get(key);
        if (arr) arr.push(fieldValue);
        else fieldValues.set(key, [fieldValue]);
      }
    }
    const shredding = {};
    for (const [key, vals] of fieldValues) {
      const fieldShred = detectShred(vals, depth + 1);
      if (fieldShred !== void 0) shredding[key] = fieldShred;
    }
    return Object.keys(shredding).length > 0 ? shredding : void 0;
  }
  if (nonNull.every(Array.isArray)) {
    if (depth >= MAX_SHRED_DEPTH) return void 0;
    const elements = [];
    for (const arr of nonNull) for (const el of arr) elements.push(el);
    const elemShred = detectShred(elements, depth + 1);
    return elemShred === void 0 ? void 0 : [elemShred];
  }
  let jsType;
  for (const v of nonNull) {
    if (Array.isArray(v)) return void 0;
    const t = v instanceof Date ? "date" : typeof v;
    if (jsType === void 0) jsType = t;
    else if (jsType !== t) return void 0;
  }
  return jsType ? jsTypeToBasicType(jsType) : void 0;
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array);
}
function normalizeShreddingConfig(shredding) {
  if (Array.isArray(shredding)) {
    const elem = shredding.length ? normalizeShreddingConfig(shredding[0]) : void 0;
    return elem === void 0 ? void 0 : [elem];
  }
  if (typeof shredding === "object") {
    const normalized = {};
    for (const [key, type] of Object.entries(shredding)) {
      if (RESERVED_SHREDDING_FIELDS.has(key)) continue;
      const norm = normalizeShreddingConfig(type);
      if (norm !== void 0) normalized[key] = norm;
    }
    return Object.keys(normalized).length > 0 ? normalized : void 0;
  }
  return shredding;
}
function jsTypeToBasicType(jsType) {
  switch (jsType) {
    case "boolean":
      return "BOOLEAN";
    case "string":
      return "STRING";
    case "number":
      return "DOUBLE";
    case "bigint":
      return "INT64";
    case "date":
      return "TIMESTAMP";
    default:
      return void 0;
  }
}
function buildVariantDictionary(values) {
  const keys = /* @__PURE__ */ new Set();
  collectKeys(values, keys);
  return [...keys].sort();
}
function collectKeys(value, keys) {
  if (value === null || value === void 0) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return;
  }
  if (value instanceof Date || value instanceof Uint8Array) return;
  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      keys.add(key);
      collectKeys(value[key], keys);
    }
  }
}
function writeVariantMetadata(dictionary) {
  const n = dictionary.length;
  const encoded = new Array(n);
  let totalStringBytes = 0;
  for (let i = 0; i < n; i++) {
    const e = encoder.encode(dictionary[i]);
    encoded[i] = e;
    totalStringBytes += e.length;
  }
  const offsetSize = byteWidth(totalStringBytes);
  const header = 1 | 1 << 4 | offsetSize - 1 << 6;
  const totalSize = 1 + offsetSize + (n + 1) * offsetSize + totalStringBytes;
  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  bytes[offset++] = header;
  for (let j = 0; j < offsetSize; j++) bytes[offset++] = n >> j * 8 & 255;
  let strOffset = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < offsetSize; j++) bytes[offset++] = strOffset >> j * 8 & 255;
    strOffset += encoded[i].length;
  }
  for (let j = 0; j < offsetSize; j++) bytes[offset++] = strOffset >> j * 8 & 255;
  for (let i = 0; i < n; i++) {
    bytes.set(encoded[i], offset);
    offset += encoded[i].length;
  }
  return bytes;
}
function writeVariantValue(value, keyIndex, scratchWriters) {
  const writer = new ByteWriter(8);
  writeValue(value, writer, keyIndex, scratchWriters);
  return writer.getBytes();
}
function writeValue(val, writer, keyIndex, scratchWriters) {
  if (val === null || val === void 0) {
    writer.appendUint8(0);
    return;
  }
  if (val === true) {
    writer.appendUint8(4);
    return;
  }
  if (val === false) {
    writer.appendUint8(8);
    return;
  }
  if (typeof val === "bigint") {
    if (val < INT64_MIN || val > INT64_MAX) {
      throw new RangeError(`variant bigint out of int64 range: ${val}`);
    }
    writer.appendUint8(6 << 2);
    writer.appendInt64(val);
    return;
  }
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      if (val >= -128 && val <= 127) {
        writer.appendUint8(3 << 2);
        writer.appendUint8(val & 255);
        return;
      }
      if (val >= -32768 && val <= 32767) {
        writer.appendUint8(4 << 2);
        appendUnsignedLE(writer, val, 2);
        return;
      }
      if (val >= -2147483648 && val <= 2147483647) {
        writer.appendUint8(5 << 2);
        writer.appendInt32(val);
        return;
      }
    }
    writer.appendUint8(7 << 2);
    writer.appendFloat64(val);
    return;
  }
  if (typeof val === "string") {
    const strBytes = encoder.encode(val);
    if (strBytes.length <= 63) {
      writer.appendUint8(strBytes.length << 2 | 1);
      writer.appendBytes(strBytes);
    } else {
      writer.appendUint8(16 << 2);
      writer.appendUint32(strBytes.length);
      writer.appendBytes(strBytes);
    }
    return;
  }
  if (val instanceof Date) {
    writer.appendUint8(13 << 2);
    writer.appendInt64(BigInt(val.getTime()) * 1000n);
    return;
  }
  if (val instanceof Uint8Array) {
    writer.appendUint8(15 << 2);
    writer.appendUint32(val.length);
    writer.appendBytes(val);
    return;
  }
  if (Array.isArray(val)) {
    writeVariantArray(val, writer, keyIndex, scratchWriters);
    return;
  }
  if (typeof val === "object") {
    writeVariantObject(val, writer, keyIndex, scratchWriters);
    return;
  }
  throw new Error(`variant cannot encode value: ${val}`);
}
function writeVariantObject(obj, writer, keyIndex, scratchWriters) {
  const entries = Object.keys(obj).filter((key) => obj[key] !== void 0).map((key) => {
    const id = keyIndex.get(key);
    if (id === void 0) throw new Error(`variant key not in dictionary: ${key}`);
    return { id, key };
  });
  entries.sort((a, b) => a.id - b.id);
  const numElements = entries.length;
  const maxFieldId = numElements > 0 ? entries[numElements - 1].id : 0;
  const idWidth = byteWidth(maxFieldId);
  const scratch = scratchWriters.pop() ?? new ByteWriter(8);
  const offsets = new Array(numElements + 1);
  offsets[0] = 0;
  for (let i = 0; i < numElements; i++) {
    writeValue(obj[entries[i].key], scratch, keyIndex, scratchWriters);
    offsets[i + 1] = scratch.index;
  }
  const offsetWidth = byteWidth(offsets[numElements]);
  const isLarge = numElements > 255 ? 1 : 0;
  writer.appendUint8((offsetWidth - 1 | idWidth - 1 << 2 | isLarge << 4) << 2 | 2);
  if (isLarge) writer.appendUint32(numElements);
  else writer.appendUint8(numElements);
  for (const { id } of entries) appendUnsignedLE(writer, id, idWidth);
  for (const off of offsets) appendUnsignedLE(writer, off, offsetWidth);
  writer.appendBytes(scratch.getBytes());
  scratch.index = 0;
  scratch.offset = 0;
  scratchWriters.push(scratch);
}
function writeVariantArray(arr, writer, keyIndex, scratchWriters) {
  const numElements = arr.length;
  const scratch = scratchWriters.pop() ?? new ByteWriter(8);
  const offsets = new Array(numElements + 1);
  offsets[0] = 0;
  for (let i = 0; i < numElements; i++) {
    writeValue(arr[i], scratch, keyIndex, scratchWriters);
    offsets[i + 1] = scratch.index;
  }
  const offsetWidth = byteWidth(offsets[numElements]);
  const isLarge = numElements > 255 ? 1 : 0;
  writer.appendUint8((offsetWidth - 1 | isLarge << 2) << 2 | 3);
  if (isLarge) writer.appendUint32(numElements);
  else writer.appendUint8(numElements);
  for (const off of offsets) appendUnsignedLE(writer, off, offsetWidth);
  writer.appendBytes(scratch.getBytes());
  scratch.index = 0;
  scratch.offset = 0;
  scratchWriters.push(scratch);
}
function byteWidth(maxValue) {
  if (maxValue <= 255) return 1;
  if (maxValue <= 65535) return 2;
  if (maxValue <= 16777215) return 3;
  return 4;
}
function appendUnsignedLE(writer, value, width) {
  for (let i = 0; i < width; i++) {
    writer.appendUint8(value >> i * 8 & 255);
  }
}

// node_modules/hyparquet-writer/src/schema.js
function schemaFromColumnData({ columnData, schemaOverrides }) {
  const schema = [{
    name: "root",
    num_children: columnData.length
  }];
  for (const { name, data, type, nullable, shredding } of columnData) {
    if (schemaOverrides?.[name]) {
      const override = schemaOverrides[name];
      if (type || nullable !== void 0) {
        throw new Error(`cannot provide both type and schema override for column ${name}`);
      }
      if (override.name !== name) {
        throw new Error(`schema override for column ${name} must have matching name, got ${override.name}`);
      }
      if (override.type === "FIXED_LEN_BYTE_ARRAY" && !override.type_length) {
        throw new Error("schema override for FIXED_LEN_BYTE_ARRAY must include type_length");
      }
      if (override.num_children) {
        throw new Error("schema override does not support nested types");
      }
      schema.push(override);
    } else if (type === "VARIANT") {
      const repetition_type = nullable === false ? "REQUIRED" : "OPTIONAL";
      const shreddingConfig = shredding && shredding !== true ? normalizeShreddingConfig(shredding) : void 0;
      if (shreddingConfig) {
        schema.push(
          { name, repetition_type, num_children: 3, logical_type: { type: "VARIANT" } },
          { name: "metadata", type: "BYTE_ARRAY", repetition_type: "REQUIRED" },
          { name: "value", type: "BYTE_ARRAY", repetition_type: "OPTIONAL" },
          ...buildVariantTypedValue(shreddingConfig)
        );
      } else {
        schema.push(
          { name, repetition_type, num_children: 2, logical_type: { type: "VARIANT" } },
          { name: "metadata", type: "BYTE_ARRAY", repetition_type: "REQUIRED" },
          { name: "value", type: "BYTE_ARRAY", repetition_type: "OPTIONAL" }
        );
      }
    } else if (type) {
      schema.push(basicTypeToSchemaElement(name, type, nullable));
    } else {
      schema.push(autoSchemaElement(name, data.slice(0, 1e3)));
    }
  }
  return schema;
}
function buildVariantTypedValue(shredType) {
  if (Array.isArray(shredType)) {
    return [
      { name: "typed_value", repetition_type: "OPTIONAL", converted_type: "LIST", num_children: 1 },
      { name: "list", repetition_type: "REPEATED", num_children: 1 },
      { name: "element", repetition_type: "REQUIRED", num_children: 2 },
      { name: "value", type: "BYTE_ARRAY", repetition_type: "OPTIONAL" },
      ...buildVariantTypedValue(shredType[0])
    ];
  }
  if (typeof shredType === "object") {
    const fieldNames = Object.keys(shredType);
    const elements = [
      { name: "typed_value", repetition_type: "OPTIONAL", num_children: fieldNames.length }
    ];
    for (const fieldName of fieldNames) {
      elements.push(
        { name: fieldName, repetition_type: "OPTIONAL", num_children: 2 },
        { name: "value", type: "BYTE_ARRAY", repetition_type: "OPTIONAL" },
        ...buildVariantTypedValue(shredType[fieldName])
      );
    }
    return elements;
  }
  return [shreddedLeafElement(shredType)];
}
function shreddedLeafElement(type) {
  switch (type) {
    case "STRING":
      return { name: "typed_value", type: "BYTE_ARRAY", converted_type: "UTF8", repetition_type: "OPTIONAL" };
    case "INT32":
      return { name: "typed_value", type: "INT32", repetition_type: "OPTIONAL" };
    case "INT64":
      return { name: "typed_value", type: "INT64", repetition_type: "OPTIONAL" };
    case "DOUBLE":
      return { name: "typed_value", type: "DOUBLE", repetition_type: "OPTIONAL" };
    case "FLOAT":
      return { name: "typed_value", type: "FLOAT", repetition_type: "OPTIONAL" };
    case "BOOLEAN":
      return { name: "typed_value", type: "BOOLEAN", repetition_type: "OPTIONAL" };
    case "TIMESTAMP":
      return { name: "typed_value", type: "INT64", converted_type: "TIMESTAMP_MICROS", repetition_type: "OPTIONAL" };
    default:
      throw new Error(`unsupported shredded field type: ${type}`);
  }
}
function basicTypeToSchemaElement(name, type, nullable) {
  const repetition_type = nullable === false ? "REQUIRED" : "OPTIONAL";
  if (type === "STRING") {
    return { name, type: "BYTE_ARRAY", converted_type: "UTF8", repetition_type };
  }
  if (type === "JSON") {
    return { name, type: "BYTE_ARRAY", converted_type: "JSON", repetition_type };
  }
  if (type === "TIMESTAMP") {
    return { name, type: "INT64", converted_type: "TIMESTAMP_MILLIS", repetition_type };
  }
  if (type === "UUID") {
    return { name, type: "FIXED_LEN_BYTE_ARRAY", type_length: 16, logical_type: { type: "UUID" }, repetition_type };
  }
  if (type === "FLOAT16") {
    return { name, type: "FIXED_LEN_BYTE_ARRAY", type_length: 2, logical_type: { type: "FLOAT16" }, repetition_type };
  }
  if (type === "GEOMETRY") {
    return { name, type: "BYTE_ARRAY", logical_type: { type: "GEOMETRY" }, repetition_type };
  }
  if (type === "GEOGRAPHY") {
    return { name, type: "BYTE_ARRAY", logical_type: { type: "GEOGRAPHY" }, repetition_type };
  }
  return { name, type, repetition_type };
}
function autoSchemaElement(name, values) {
  let type;
  let repetition_type = "REQUIRED";
  let converted_type;
  if (values instanceof Int32Array) return { name, type: "INT32", repetition_type };
  if (values instanceof BigInt64Array) return { name, type: "INT64", repetition_type };
  if (values instanceof Float32Array) return { name, type: "FLOAT", repetition_type };
  if (values instanceof Float64Array) return { name, type: "DOUBLE", repetition_type };
  for (const value of values) {
    if (value === null || value === void 0) {
      repetition_type = "OPTIONAL";
    } else {
      let valueType;
      let valueConvertedType;
      if (typeof value === "boolean") valueType = "BOOLEAN";
      else if (typeof value === "bigint") valueType = "INT64";
      else if (Number.isInteger(value)) valueType = "INT32";
      else if (typeof value === "number") valueType = "DOUBLE";
      else if (value instanceof Uint8Array) valueType = "BYTE_ARRAY";
      else if (typeof value === "string") {
        valueType = "BYTE_ARRAY";
        valueConvertedType = "UTF8";
      } else if (value instanceof Date) {
        valueType = "INT64";
        valueConvertedType = "TIMESTAMP_MILLIS";
      } else if (typeof value === "object") {
        valueType = "BYTE_ARRAY";
        valueConvertedType = "JSON";
      } else throw new Error(`cannot determine parquet type for: ${value}`);
      if (type === void 0) {
        type = valueType;
        converted_type = valueConvertedType;
      } else if (type === "INT32" && valueType === "DOUBLE") {
        type = "DOUBLE";
      } else if (type === "DOUBLE" && valueType === "INT32") {
        continue;
      } else if (type !== valueType || converted_type !== valueConvertedType) {
        throw new Error(`parquet cannot write mixed types: ${converted_type ?? type} and ${valueConvertedType ?? valueType}`);
      }
    }
  }
  if (!type) {
    type = "BYTE_ARRAY";
    repetition_type = "OPTIONAL";
  }
  return { name, type, repetition_type, converted_type };
}
function getMaxRepetitionLevel(schemaPath) {
  let maxLevel = 0;
  for (const element of schemaPath) {
    if (element.repetition_type === "REPEATED") {
      maxLevel++;
    }
  }
  return maxLevel;
}

// node_modules/hyparquet-writer/src/splitstream.js
function writeByteStreamSplit(writer, values, type, typeLength) {
  const count = values.length;
  let bytes;
  let width;
  if (type === "FLOAT") {
    const typed = values instanceof Float32Array ? values : new Float32Array(numberArray(values));
    bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    width = 4;
  } else if (type === "DOUBLE") {
    const typed = values instanceof Float64Array ? values : new Float64Array(numberArray(values));
    bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    width = 8;
  } else if (type === "INT32") {
    const typed = values instanceof Int32Array ? values : new Int32Array(numberArray(values));
    bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    width = 4;
  } else if (type === "INT64") {
    const typed = bigIntArray(values);
    bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    width = 8;
  } else if (type === "FIXED_LEN_BYTE_ARRAY") {
    if (!typeLength) throw new Error("parquet byte_stream_split missing type_length");
    width = typeLength;
    bytes = new Uint8Array(count * width);
    for (let i = 0; i < count; i++) {
      bytes.set(values[i], i * width);
    }
  } else {
    throw new Error(`parquet byte_stream_split unsupported type: ${type}`);
  }
  for (let b = 0; b < width; b++) {
    for (let i = 0; i < count; i++) {
      writer.appendUint8(bytes[i * width + b]);
    }
  }
}
function numberArray(values) {
  if (Array.isArray(values) && values.every((v) => typeof v === "number")) {
    return values;
  }
  throw new Error("Expected number array for BYTE_STREAM_SPLIT encoding");
}
function bigIntArray(values) {
  if (values instanceof BigInt64Array) return values;
  if (Array.isArray(values) && values.every((v) => typeof v === "bigint")) {
    return new BigInt64Array(values);
  }
  throw new Error("Expected bigint array for BYTE_STREAM_SPLIT encoding");
}

// node_modules/hyparquet-writer/src/datapage.js
function writeDataPageV2({ writer, column, encoding, pageData }) {
  const { columnName, element, codec, compressors } = column;
  const { type, type_length, repetition_type } = element;
  if (!type) throw new Error(`column ${columnName} cannot determine type`);
  if (repetition_type === "REPEATED") throw new Error(`column ${columnName} repeated types not supported`);
  const levelWriter = new ByteWriter();
  const {
    definition_levels_byte_length,
    repetition_levels_byte_length,
    num_nulls,
    num_values,
    num_rows
  } = writeLevels(levelWriter, column, pageData);
  const nonnull = num_nulls ? pageData.values.filter((v) => v !== null && v !== void 0) : pageData.values;
  const page = new ByteWriter();
  if (encoding === "PLAIN") {
    writePlain(page, nonnull, type, type_length);
  } else if (encoding === "RLE") {
    if (type !== "BOOLEAN") throw new Error("RLE encoding only supported for BOOLEAN type");
    const rleData = new ByteWriter();
    writeRleBitPackedHybrid(rleData, nonnull, 1);
    page.appendUint32(rleData.offset);
    page.appendBytes(rleData.getBytes());
  } else if (encoding === "PLAIN_DICTIONARY" || encoding === "RLE_DICTIONARY") {
    let maxValue = 0;
    for (const v of nonnull) if (v > maxValue) maxValue = v;
    const bitWidth2 = Math.ceil(Math.log2(maxValue + 1));
    page.appendUint8(bitWidth2);
    writeRleBitPackedHybrid(page, nonnull, bitWidth2);
  } else if (encoding === "DELTA_BINARY_PACKED") {
    if (type !== "INT32" && type !== "INT64") {
      throw new Error("DELTA_BINARY_PACKED encoding only supported for INT32 and INT64 types");
    }
    deltaBinaryPack(page, nonnull);
  } else if (encoding === "DELTA_LENGTH_BYTE_ARRAY") {
    if (type !== "BYTE_ARRAY") {
      throw new Error("DELTA_LENGTH_BYTE_ARRAY encoding only supported for BYTE_ARRAY type");
    }
    deltaLengthByteArray(page, nonnull);
  } else if (encoding === "DELTA_BYTE_ARRAY") {
    if (type !== "BYTE_ARRAY") {
      throw new Error("DELTA_BYTE_ARRAY encoding only supported for BYTE_ARRAY type");
    }
    deltaByteArray(page, nonnull);
  } else if (encoding === "BYTE_STREAM_SPLIT") {
    writeByteStreamSplit(page, nonnull, type, type_length);
  } else {
    throw new Error(`parquet unsupported encoding: ${encoding}`);
  }
  const pageBytes = page.getBytes();
  const compressedBytes = compressors[codec]?.(pageBytes) ?? pageBytes;
  writePageHeader(writer, {
    type: "DATA_PAGE_V2",
    uncompressed_page_size: levelWriter.offset + page.offset,
    compressed_page_size: levelWriter.offset + compressedBytes.length,
    data_page_header_v2: {
      num_values,
      num_nulls,
      num_rows,
      encoding,
      definition_levels_byte_length,
      repetition_levels_byte_length,
      is_compressed: !!codec
      // is there benefit to page statistics here?
    }
  });
  writer.appendBytes(levelWriter.getBytes());
  writer.appendBytes(compressedBytes);
}
function writePageHeader(writer, header) {
  const compact = {
    field_1: PageTypes.indexOf(header.type),
    field_2: header.uncompressed_page_size,
    field_3: header.compressed_page_size,
    field_4: header.crc,
    field_5: header.data_page_header && {
      field_1: header.data_page_header.num_values,
      field_2: Encodings.indexOf(header.data_page_header.encoding),
      field_3: Encodings.indexOf(header.data_page_header.definition_level_encoding),
      field_4: Encodings.indexOf(header.data_page_header.repetition_level_encoding)
      // field_5: header.data_page_header.statistics,
    },
    field_7: header.dictionary_page_header && {
      field_1: header.dictionary_page_header.num_values,
      field_2: Encodings.indexOf(header.dictionary_page_header.encoding)
    },
    field_8: header.data_page_header_v2 && {
      field_1: header.data_page_header_v2.num_values,
      field_2: header.data_page_header_v2.num_nulls,
      field_3: header.data_page_header_v2.num_rows,
      field_4: Encodings.indexOf(header.data_page_header_v2.encoding),
      field_5: header.data_page_header_v2.definition_levels_byte_length,
      field_6: header.data_page_header_v2.repetition_levels_byte_length,
      field_7: header.data_page_header_v2.is_compressed ? void 0 : false
      // default true
    }
  };
  serializeTCompactProtocol(writer, compact);
}
function writeLevels(writer, column, dataPage) {
  const { schemaPath } = column;
  const { values, definitionLevels, repetitionLevels, maxDefinitionLevel } = dataPage;
  const num_values = definitionLevels.length || values.length;
  let num_nulls = 0;
  let num_rows = 0;
  if (repetitionLevels.length) {
    for (let i = 0; i < repetitionLevels.length; i++) {
      if (repetitionLevels[i] === 0) num_rows++;
    }
  } else {
    num_rows = values.length;
  }
  if (definitionLevels.length) {
    for (let i = 0; i < definitionLevels.length; i++) {
      if (definitionLevels[i] < maxDefinitionLevel) num_nulls++;
    }
  }
  const maxRepetitionLevel = getMaxRepetitionLevel(schemaPath);
  let repetition_levels_byte_length = 0;
  if (maxRepetitionLevel) {
    const bitWidth2 = Math.ceil(Math.log2(maxRepetitionLevel + 1));
    repetition_levels_byte_length = writeRleBitPackedHybrid(writer, repetitionLevels, bitWidth2);
  }
  let definition_levels_byte_length = 0;
  if (maxDefinitionLevel) {
    const bitWidth2 = Math.ceil(Math.log2(maxDefinitionLevel + 1));
    definition_levels_byte_length = writeRleBitPackedHybrid(writer, definitionLevels, bitWidth2);
  }
  return { definition_levels_byte_length, repetition_levels_byte_length, num_values, num_nulls, num_rows };
}

// node_modules/hyparquet-writer/src/dictionary.js
var textEncoder2 = new TextEncoder();
function estimateValueSize(value, type, type_length) {
  if (value === null || value === void 0) return 0;
  if (type === "BOOLEAN") return 0.125;
  if (type === "INT32" || type === "FLOAT") return 4;
  if (type === "INT64" || type === "DOUBLE") return 8;
  if (type === "INT96") return 12;
  if (type === "FIXED_LEN_BYTE_ARRAY") return type_length ?? 0;
  if (type === "BYTE_ARRAY") {
    if (value instanceof Uint8Array) return value.byteLength;
    if (typeof value === "string") return value.length;
  }
  return 0;
}
function hashBytes(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
var sampleRejectionRatio = 0.9;
function useDictionary(values, type, type_length, encoding, dictionarySize, required) {
  if (encoding && encoding !== "RLE_DICTIONARY") return {};
  if (type === "BOOLEAN") return {};
  const forced = encoding === "RLE_DICTIONARY";
  const byteArrayPrefixSize = type === "BYTE_ARRAY" ? 4 : 0;
  if (!forced) {
    const sampleSize = Math.min(values.length, 1e3);
    const sampleSizes = /* @__PURE__ */ new Map();
    const sampleHashes = /* @__PURE__ */ new Map();
    let sampleDictionarySize = 0;
    let sampleTotalSize = 0;
    for (let i = 0; i < sampleSize; i++) {
      const sampleIndex = sampleSize === 1 ? 0 : Math.floor(i * (values.length - 1) / (sampleSize - 1));
      const value = values[sampleIndex];
      let key = value;
      if (value instanceof Uint8Array) {
        key = sampleHashes.get(value);
        if (key === void 0) {
          key = hashBytes(value);
          sampleHashes.set(value, key);
        }
      }
      let valueSize = sampleSizes.get(key);
      if (valueSize === void 0) {
        valueSize = estimateValueSize(value, type, type_length) + (value === null || value === void 0 ? 0 : byteArrayPrefixSize);
        sampleSizes.set(key, valueSize);
        sampleDictionarySize += valueSize;
      }
      sampleTotalSize += valueSize;
    }
    if (!sampleTotalSize || sampleDictionarySize / sampleTotalSize > sampleRejectionRatio) return {};
  }
  const dictionary = [];
  const indexes = new Array(values.length);
  const valueIndex = /* @__PURE__ */ new Map();
  const valueSizes = [];
  const hashBuckets = /* @__PURE__ */ new Map();
  let dictSize = 0;
  let physicalDictSize = 0;
  let totalSize = 0;
  let nonNullCount = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || value === void 0) {
      if (required) throw new Error("parquet required value is undefined");
      continue;
    }
    nonNullCount++;
    let index;
    if (value instanceof Uint8Array) {
      totalSize += value.byteLength;
      index = valueIndex.get(value);
      if (index !== void 0) {
        indexes[i] = index;
        continue;
      }
      const hash = hashBytes(value);
      const bucket = hashBuckets.get(hash);
      if (bucket) {
        for (const j of bucket) {
          if (bytesEqual(dictionary[j], value)) {
            index = j;
            break;
          }
        }
      }
      if (index === void 0) {
        dictSize += value.byteLength;
        if (!forced && dictionarySize) {
          physicalDictSize += value.byteLength;
          if (physicalDictSize > dictionarySize) return {};
        }
        index = dictionary.length;
        dictionary.push(value);
        if (bucket) bucket.push(index);
        else hashBuckets.set(hash, [index]);
      }
      valueIndex.set(value, index);
    } else {
      index = valueIndex.get(value);
      const valueSize = index === void 0 ? estimateValueSize(value, type, type_length) : valueSizes[index];
      totalSize += valueSize;
      if (index === void 0) {
        dictSize += valueSize;
        if (!forced && dictionarySize) {
          physicalDictSize += typeof value === "string" ? textEncoder2.encode(value).byteLength : valueSize;
          if (physicalDictSize > dictionarySize) return {};
        }
        index = dictionary.length;
        dictionary.push(value);
        valueSizes[index] = valueSize;
        valueIndex.set(value, index);
      }
    }
    indexes[i] = index;
  }
  const bitWidth2 = Math.ceil(Math.log2(dictionary.length));
  const indexSize = Math.ceil(nonNullCount * bitWidth2 / 8);
  const plainSize = totalSize + nonNullCount * byteArrayPrefixSize;
  const dictionaryValueSize = dictSize + dictionary.length * byteArrayPrefixSize;
  if (!forced && 2 * (dictionaryValueSize + indexSize) > plainSize) return {};
  return { dictionary, indexes };
}
function writeDictionaryPage(writer, column, dictionary) {
  const { element, codec, compressors } = column;
  const { type, type_length } = element;
  if (!type) throw new Error(`column ${column.columnName} cannot determine type`);
  const dictionaryPage = new ByteWriter();
  writePlain(dictionaryPage, dictionary, type, type_length);
  const dictionaryBytes = dictionaryPage.getBytes();
  const compressedBytes = compressors[codec]?.(dictionaryBytes) ?? dictionaryBytes;
  writePageHeader(writer, {
    type: "DICTIONARY_PAGE",
    uncompressed_page_size: dictionaryBytes.byteLength,
    compressed_page_size: compressedBytes.byteLength,
    dictionary_page_header: {
      num_values: dictionary.length,
      encoding: "PLAIN"
    }
  });
  writer.appendBytes(compressedBytes);
}

// node_modules/hyparquet-writer/src/geospatial.js
function geospatialStatistics(values) {
  const typeCodes = /* @__PURE__ */ new Set();
  let partial;
  for (const value of values) {
    if (value === null || value === void 0) continue;
    if (typeof value !== "object") {
      throw new Error("geospatial column expects GeoJSON geometries");
    }
    partial = extendBoundsFromGeometry(partial, value);
    typeCodes.add(geometryTypeCodeWithDimension(value));
  }
  let bbox;
  const { xmin, ymin, xmax, ymax } = partial ?? {};
  if (xmin !== void 0 && ymin !== void 0 && xmax !== void 0 && ymax !== void 0) {
    bbox = { ...partial, xmin, ymin, xmax, ymax };
  }
  if (typeCodes.size || bbox) {
    return {
      bbox,
      // Geospatial type codes of all instances, or an empty list if not known
      geospatial_types: typeCodes.size ? Array.from(typeCodes).sort((a, b) => a - b) : []
    };
  }
}
function extendBoundsFromGeometry(bbox, geometry) {
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries || []) {
      bbox = extendBoundsFromGeometry(bbox, child);
    }
    return bbox;
  }
  return extendBoundsFromCoordinates(bbox, geometry.coordinates);
}
function extendBoundsFromCoordinates(bbox, coordinates) {
  if (typeof coordinates[0] === "number") {
    bbox = updateAxis(bbox, "xmin", "xmax", coordinates[0]);
    bbox = updateAxis(bbox, "ymin", "ymax", coordinates[1]);
    if (coordinates.length > 2) bbox = updateAxis(bbox, "zmin", "zmax", coordinates[2]);
    if (coordinates.length > 3) bbox = updateAxis(bbox, "mmin", "mmax", coordinates[3]);
    return bbox;
  }
  for (const child of coordinates) {
    bbox = extendBoundsFromCoordinates(bbox, child);
  }
  return bbox;
}
function updateAxis(bbox, minKey, maxKey, value) {
  if (value === void 0 || !Number.isFinite(value)) return bbox;
  if (!bbox) bbox = {};
  const min = bbox[minKey];
  const max = bbox[maxKey];
  if (min === void 0 || value < min) bbox[minKey] = value;
  if (max === void 0 || value > max) bbox[maxKey] = value;
  return bbox;
}
function geometryTypeCodeWithDimension(geometry) {
  const base = geometryTypeCodes[geometry.type];
  if (base === void 0) throw new Error(`unknown geometry type: ${geometry.type}`);
  const dim = inferGeometryDimensions(geometry);
  if (dim === 2) return base;
  if (dim === 3) return base + 1e3;
  if (dim === 4) return base + 3e3;
  throw new Error(`unsupported geometry dimensions: ${dim}`);
}
var geometryTypeCodes = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
  GeometryCollection: 7
};
function inferGeometryDimensions(geometry) {
  if (geometry.type === "GeometryCollection") {
    let maxDim = 0;
    for (const child of geometry.geometries || []) {
      maxDim = Math.max(maxDim, inferGeometryDimensions(child));
    }
    return maxDim || 2;
  }
  return inferCoordinateDimensions(geometry.coordinates);
}
function inferCoordinateDimensions(value) {
  if (!value.length) return 2;
  if (typeof value[0] === "number") return value.length;
  let maxDim = 0;
  for (const item of value) {
    maxDim = Math.max(maxDim, inferCoordinateDimensions(item));
  }
  return maxDim || 2;
}

// node_modules/hyparquet/src/utils.js
function toJson(obj) {
  if (obj === void 0) return null;
  if (typeof obj === "bigint") return Number(obj);
  if (Object.is(obj, -0)) return 0;
  if (Array.isArray(obj)) return obj.map(toJson);
  if (obj instanceof Uint8Array) return Array.from(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (obj instanceof Object) {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] === void 0) continue;
      newObj[key] = toJson(obj[key]);
    }
    return newObj;
  }
  return obj;
}

// node_modules/hyparquet-writer/src/wkb.js
function geojsonToWkb(geometry) {
  const writer = new ByteWriter();
  writeGeometry(writer, geometry);
  return writer.getBytes();
}
function writeGeometry(writer, geometry) {
  if (typeof geometry !== "object") {
    throw new Error("geometry values must be GeoJSON geometries");
  }
  const typeCode = geometryTypeCode(geometry.type);
  const dim = inferGeometryDimensions2(geometry);
  let flag = 0;
  if (dim === 3) flag = 1;
  else if (dim === 4) flag = 3;
  else if (dim > 4) throw new Error(`unsupported geometry dimensions: ${dim}`);
  writer.appendUint8(1);
  writer.appendUint32(typeCode + flag * 1e3);
  if (geometry.type === "Point") {
    writePosition(writer, geometry.coordinates, dim);
  } else if (geometry.type === "LineString") {
    writeLine(writer, geometry.coordinates, dim);
  } else if (geometry.type === "Polygon") {
    writer.appendUint32(geometry.coordinates.length);
    for (const ring of geometry.coordinates) {
      writeLine(writer, ring, dim);
    }
  } else if (geometry.type === "MultiPoint") {
    writer.appendUint32(geometry.coordinates.length);
    for (const coordinates of geometry.coordinates) {
      writeGeometry(writer, { type: "Point", coordinates });
    }
  } else if (geometry.type === "MultiLineString") {
    writer.appendUint32(geometry.coordinates.length);
    for (const coordinates of geometry.coordinates) {
      writeGeometry(writer, { type: "LineString", coordinates });
    }
  } else if (geometry.type === "MultiPolygon") {
    writer.appendUint32(geometry.coordinates.length);
    for (const coordinates of geometry.coordinates) {
      writeGeometry(writer, { type: "Polygon", coordinates });
    }
  } else if (geometry.type === "GeometryCollection") {
    writer.appendUint32(geometry.geometries.length);
    for (const child of geometry.geometries) {
      writeGeometry(writer, child);
    }
  } else {
    throw new Error("unsupported geometry type");
  }
}
function writePosition(writer, position, dim) {
  if (position.length < dim) {
    throw new Error("geometry position dimensions mismatch");
  }
  for (let i = 0; i < dim; i++) {
    writer.appendFloat64(position[i]);
  }
}
function writeLine(writer, coordinates, dim) {
  writer.appendUint32(coordinates.length);
  for (const position of coordinates) {
    writePosition(writer, position, dim);
  }
}
function geometryTypeCode(type) {
  if (type === "Point") return 1;
  if (type === "LineString") return 2;
  if (type === "Polygon") return 3;
  if (type === "MultiPoint") return 4;
  if (type === "MultiLineString") return 5;
  if (type === "MultiPolygon") return 6;
  if (type === "GeometryCollection") return 7;
  throw new Error(`unknown geometry type: ${type}`);
}
function inferGeometryDimensions2(geometry) {
  if (geometry.type === "GeometryCollection") {
    let maxDim = 0;
    for (const child of geometry.geometries) {
      maxDim = Math.max(maxDim, inferGeometryDimensions2(child));
    }
    return maxDim || 2;
  }
  return inferCoordinateDimensions2(geometry.coordinates);
}
function inferCoordinateDimensions2(value) {
  if (!Array.isArray(value)) return 2;
  if (!value.length) return 2;
  if (typeof value[0] === "number") return value.length;
  let maxDim = 0;
  for (const item of value) {
    maxDim = Math.max(maxDim, inferCoordinateDimensions2(item));
  }
  return maxDim || 2;
}

// node_modules/hyparquet-writer/src/unconvert.js
var dayMillis = 864e5;
function mapConverted(values, convert) {
  const cache = /* @__PURE__ */ new Map();
  return Array.from(values, (value) => {
    if (cache.has(value)) return cache.get(value);
    const result = convert(value);
    cache.set(value, result);
    return result;
  });
}
function unconvert(element, values) {
  const { type, converted_type: ctype, logical_type: ltype } = element;
  if (ctype === "DECIMAL") {
    const factor = 10 ** (element.scale || 0);
    return Array.from(values, (v) => {
      if (v === null || v === void 0) return v;
      if (typeof v === "bigint") return unconvertDecimal(element, v);
      if (typeof v !== "number") throw new Error("DECIMAL must be a number or bigint");
      return unconvertDecimal(element, BigInt(Math.round(v * factor)));
    });
  }
  if (ctype === "DATE") {
    return Array.from(values).map((v) => {
      if (v instanceof Date) return Math.floor(v.getTime() / dayMillis);
      return v;
    });
  }
  if (ctype === "TIMESTAMP_MILLIS") {
    return Array.from(values).map((v) => {
      if (v === null || v === void 0) return v;
      if (v instanceof Date) return BigInt(v.getTime());
      return BigInt(v);
    });
  }
  if (ctype === "TIMESTAMP_MICROS") {
    return Array.from(values).map((v) => {
      if (v === null || v === void 0) return v;
      if (v instanceof Date) return BigInt(v.getTime() * 1e3);
      return BigInt(v);
    });
  }
  if (ctype === "JSON") {
    if (!Array.isArray(values)) throw new Error("JSON must be an array");
    const encoder2 = new TextEncoder();
    return mapConverted(
      values,
      (v) => v === null || v === void 0 ? v : encoder2.encode(JSON.stringify(toJson(v)))
    );
  }
  if (ctype === "UTF8") {
    if (!Array.isArray(values)) throw new Error("strings must be an array");
    const encoder2 = new TextEncoder();
    return values.map((v) => typeof v === "string" ? encoder2.encode(v) : v);
  }
  if (ctype === "UINT_32" || ltype?.type === "INTEGER" && ltype.bitWidth === 32 && !ltype.isSigned) {
    if (values instanceof Uint32Array) return values;
    if (values instanceof Int32Array) return new Uint32Array(values.buffer, values.byteOffset, values.length);
    return Array.from(values).map((v) => {
      if (v === null || v === void 0) return v;
      if (!Number.isSafeInteger(v)) throw new Error("expected integer value, got " + v);
      if (v < 0 || v > 4294967295) throw new Error("expected uint32 value, got " + v);
      if (v > 2147483647) return v - 4294967296;
      return v;
    });
  }
  if (ltype?.type === "FLOAT16") {
    if (type !== "FIXED_LEN_BYTE_ARRAY") throw new Error("FLOAT16 must be FIXED_LEN_BYTE_ARRAY type");
    if (element.type_length !== 2) throw new Error("FLOAT16 expected type_length to be 2 bytes");
    return Array.from(values).map(unconvertFloat16);
  }
  if (ltype?.type === "UUID") {
    if (!Array.isArray(values)) throw new Error("UUID must be an array");
    if (type !== "FIXED_LEN_BYTE_ARRAY") throw new Error("UUID must be FIXED_LEN_BYTE_ARRAY type");
    if (element.type_length !== 16) throw new Error("UUID expected type_length to be 16 bytes");
    return values.map(unconvertUuid);
  }
  if (ltype?.type === "TIMESTAMP") {
    return Array.from(values).map((v) => {
      if (v === null || v === void 0) return v;
      if (v instanceof Date) {
        const millis = BigInt(v.getTime());
        if (ltype.unit === "NANOS") return millis * 1000000n;
        if (ltype.unit === "MICROS") return millis * 1000n;
        return millis;
      }
      return BigInt(v);
    });
  }
  if (ltype?.type === "GEOMETRY" || ltype?.type === "GEOGRAPHY") {
    if (!Array.isArray(values)) throw new Error("geometry must be an array");
    return mapConverted(values, (v) => {
      if (v === null || v === void 0) return v;
      return geojsonToWkb(v);
    });
  }
  return values;
}
function unconvertUuid(value) {
  if (value === void 0 || value === null) return;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new Error("UUID must be a valid UUID string");
    }
    value = value.replace(/-/g, "").toLowerCase();
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  throw new Error("UUID must be a string or Uint8Array");
}
var STATS_TRUNCATE_LENGTH = 16;
function truncateStatistic(bytes, isMax) {
  if (bytes.length <= STATS_TRUNCATE_LENGTH) return bytes;
  const prefix = new Uint8Array(bytes.subarray(0, STATS_TRUNCATE_LENGTH));
  if (!isMax) return prefix;
  let i = prefix.length - 1;
  while (i >= 0 && prefix[i] === 255) i--;
  if (i < 0) return void 0;
  const rounded = prefix.slice(0, i + 1);
  rounded[i] += 1;
  return rounded;
}
function minMaxIsExact(value, element) {
  if (value === void 0 || value === null) return void 0;
  const { type } = element;
  if (type !== "BYTE_ARRAY" && type !== "FIXED_LEN_BYTE_ARRAY") return void 0;
  if (element.logical_type?.type === "UUID") return void 0;
  if (element.converted_type === "DECIMAL") return void 0;
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value.toString());
  return bytes.length > STATS_TRUNCATE_LENGTH ? false : void 0;
}
function unconvertMinMax(value, element, isMax) {
  if (value === void 0 || value === null) return void 0;
  const { type, converted_type } = element;
  if (type === "BOOLEAN") return new Uint8Array([value ? 1 : 0]);
  if (element.logical_type?.type === "UUID" && (typeof value === "string" || value instanceof Uint8Array)) {
    return unconvertUuid(value);
  }
  if (converted_type === "DECIMAL") {
    if (typeof value !== "number" && typeof value !== "bigint") {
      throw new Error("DECIMAL must be a number or bigint");
    }
    const factor = 10 ** (element.scale || 0);
    const scaled = typeof value === "bigint" ? value : BigInt(Math.round(value * factor));
    const out = unconvertDecimal(element, scaled);
    if (out instanceof Uint8Array) return out;
    if (typeof out === "number") {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setInt32(0, out, true);
      return new Uint8Array(buffer);
    }
    if (typeof out === "bigint") {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setBigInt64(0, out, true);
      return new Uint8Array(buffer);
    }
  }
  if (type === "BYTE_ARRAY" || type === "FIXED_LEN_BYTE_ARRAY") {
    const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value.toString());
    return truncateStatistic(bytes, isMax);
  }
  if (type === "FLOAT" && typeof value === "number") {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    return new Uint8Array(buffer);
  }
  if (type === "DOUBLE" && typeof value === "number") {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    return new Uint8Array(buffer);
  }
  if (type === "INT32" && typeof value === "number") {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    return new Uint8Array(buffer);
  }
  if (type === "INT64" && typeof value === "bigint") {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, value, true);
    return new Uint8Array(buffer);
  }
  if (type === "INT32" && converted_type === "DATE" && value instanceof Date) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, Math.floor(value.getTime() / dayMillis), true);
    return new Uint8Array(buffer);
  }
  if (type === "INT64" && converted_type === "TIMESTAMP_MILLIS" && value instanceof Date) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, BigInt(value.getTime()), true);
    return new Uint8Array(buffer);
  }
  if (type === "INT64" && converted_type === "TIMESTAMP_MICROS" && value instanceof Date) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, BigInt(value.getTime() * 1e3), true);
    return new Uint8Array(buffer);
  }
  if (type === "INT64" && element.logical_type?.type === "TIMESTAMP" && value instanceof Date) {
    const millis = BigInt(value.getTime());
    const { unit } = element.logical_type;
    let bigintValue = millis;
    if (unit === "NANOS") bigintValue = millis * 1000000n;
    else if (unit === "MICROS") bigintValue = millis * 1000n;
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, bigintValue, true);
    return new Uint8Array(buffer);
  }
  throw new Error(`unsupported type for statistics: ${type} with value ${value}`);
}
function unconvertStatistics(stats, element) {
  return {
    field_1: unconvertMinMax(stats.max, element, true),
    field_2: unconvertMinMax(stats.min, element, false),
    field_3: stats.null_count,
    field_4: stats.distinct_count,
    field_5: unconvertMinMax(stats.max_value, element, true),
    field_6: unconvertMinMax(stats.min_value, element, false),
    field_7: stats.is_max_value_exact ?? minMaxIsExact(stats.max_value ?? stats.max, element),
    field_8: stats.is_min_value_exact ?? minMaxIsExact(stats.min_value ?? stats.min, element)
  };
}
function unconvertDecimal({ type, type_length }, value) {
  if (type === "INT32") return Number(value);
  if (type === "INT64") return value;
  if (type === "FIXED_LEN_BYTE_ARRAY" && !type_length) {
    throw new Error("fixed length byte array type_length is required");
  }
  if (!type_length && !value) return new Uint8Array();
  const bytes = [];
  while (true) {
    const byte = Number(value & 0xffn);
    bytes.unshift(byte);
    value >>= 8n;
    if (type_length) {
      if (bytes.length >= type_length) break;
    } else {
      const sign = byte & 128;
      if (!sign && value === 0n || sign && value === -1n) {
        break;
      }
    }
  }
  return new Uint8Array(bytes);
}
function unconvertFloat16(value) {
  if (value === void 0 || value === null) return;
  if (typeof value !== "number") throw new Error("parquet float16 expected number value");
  if (Number.isNaN(value)) return new Uint8Array([0, 126]);
  const sign = value < 0 || Object.is(value, -0) ? 1 : 0;
  const abs = Math.abs(value);
  if (!isFinite(abs)) return new Uint8Array([0, sign << 7 | 124]);
  if (abs === 0) return new Uint8Array([0, sign << 7]);
  const buf = new ArrayBuffer(4);
  new Float32Array(buf)[0] = abs;
  const bits32 = new Uint32Array(buf)[0];
  let exp32 = bits32 >>> 23 & 255;
  let mant32 = bits32 & 8388607;
  exp32 -= 127;
  if (exp32 < -14) {
    const shift = -14 - exp32;
    mant32 = (mant32 | 8388608) >> shift + 13;
    if (mant32 & 1) mant32 += 1;
    const bits162 = sign << 15 | mant32;
    return new Uint8Array([bits162 & 255, bits162 >> 8]);
  }
  if (exp32 > 15) return new Uint8Array([0, sign << 7 | 124]);
  let exp16 = exp32 + 15;
  mant32 = mant32 + 4096;
  if (mant32 & 8388608) {
    mant32 = 0;
    if (++exp16 === 31)
      return new Uint8Array([0, sign << 7 | 124]);
  }
  const bits16 = sign << 15 | exp16 << 10 | mant32 >> 13;
  return new Uint8Array([bits16 & 255, bits16 >> 8]);
}

// node_modules/hyparquet-writer/src/column.js
function writeColumn({ writer, column, pageData }) {
  const { columnName, element, schemaPath, stats, pageSize, dictionarySize, encoding: userEncoding } = column;
  const { type, type_length } = element;
  if (!type) throw new Error(`column ${columnName} cannot determine type`);
  const { values, definitionLevels, repetitionLevels, maxDefinitionLevel } = pageData;
  const offsetStart = writer.offset;
  const encodings = [];
  const isGeospatial = element?.logical_type?.type === "GEOMETRY" || element?.logical_type?.type === "GEOGRAPHY";
  const statistics = stats ? getStatistics(values, element) : void 0;
  const geospatial_statistics = stats && isGeospatial ? geospatialStatistics(values) : void 0;
  let bloomFilter;
  if (column.bloomFilter) {
    const opts = typeof column.bloomFilter === "object" ? column.bloomFilter : void 0;
    const builder = new BloomBuilder(element, opts);
    for (const v of values) builder.insert(v);
    bloomFilter = builder.finalize();
  }
  let dictionary_page_offset;
  const selectPhysical = element.converted_type !== "UTF8";
  const dictionaryValues = selectPhysical ? unconvert(element, values) : values;
  const { dictionary, indexes } = useDictionary(
    dictionaryValues,
    type,
    type_length,
    userEncoding,
    dictionarySize,
    maxDefinitionLevel === 0
  );
  let encoding;
  let writeValues;
  let writeType = type;
  if (dictionary && indexes) {
    writeValues = indexes;
    writeType = "INT32";
    encoding = "RLE_DICTIONARY";
    dictionary_page_offset = BigInt(writer.offset);
    const unconverted = selectPhysical ? dictionary : unconvert(element, dictionary);
    writeDictionaryPage(writer, column, unconverted);
  } else {
    writeValues = selectPhysical ? dictionaryValues : unconvert(element, values);
    encoding = userEncoding && userEncoding !== "RLE_DICTIONARY" ? userEncoding : type === "BOOLEAN" && values.length > 16 ? "RLE" : "PLAIN";
  }
  encodings.push(encoding);
  const pageBoundaries = getPageBoundaries(writeValues, writeType, type_length, pageSize, repetitionLevels);
  const columnIndex = column.columnIndex && pageBoundaries.length > 1 ? {
    null_pages: [],
    min_values: [],
    max_values: [],
    boundary_order: "UNORDERED",
    null_counts: []
  } : void 0;
  const offsetIndex = column.offsetIndex && pageBoundaries.length > 1 ? {
    page_locations: []
  } : void 0;
  const data_page_offset = BigInt(writer.offset);
  let first_row_index = 0n;
  let prevStart = 0;
  let prevMinValue;
  let prevMaxValue;
  let ascending = true;
  let descending = true;
  for (const { start, end } of pageBoundaries) {
    const pageOffset = writer.offset;
    const pageChunk = {
      values: writeValues.slice(start, end),
      definitionLevels: definitionLevels.slice(start, end),
      repetitionLevels: repetitionLevels.slice(start, end),
      maxDefinitionLevel
    };
    writeDataPageV2({ writer, column, encoding, pageData: pageChunk });
    if (columnIndex) {
      const pageValues = values.slice(start, end);
      const { min_value, max_value, null_count = 0n } = getStatistics(pageValues, element);
      columnIndex.null_pages.push(null_count === BigInt(end - start));
      columnIndex.min_values.push(unconvertMinMax(min_value, element, false) ?? new Uint8Array());
      columnIndex.max_values.push(unconvertMinMax(max_value, element, true) ?? new Uint8Array());
      columnIndex.null_counts?.push(null_count);
      if (prevMinValue !== void 0 && min_value !== void 0) {
        const order = compareValues(prevMinValue, min_value);
        if (order > 0) ascending = false;
        if (order < 0) descending = false;
      }
      if (prevMaxValue !== void 0 && max_value !== void 0) {
        const order = compareValues(prevMaxValue, max_value);
        if (order > 0) ascending = false;
        if (order < 0) descending = false;
      }
      prevMinValue = min_value;
      prevMaxValue = max_value;
    }
    if (offsetIndex) {
      if (repetitionLevels.length) {
        for (let i = prevStart + 1; i <= start; i++) {
          if (repetitionLevels[i] === 0) first_row_index++;
        }
      } else {
        first_row_index = BigInt(start);
      }
      offsetIndex.page_locations.push({
        offset: BigInt(pageOffset),
        compressed_page_size: writer.offset - pageOffset,
        first_row_index
      });
    }
    prevStart = start;
  }
  if (columnIndex) {
    if (ascending) columnIndex.boundary_order = "ASCENDING";
    else if (descending) columnIndex.boundary_order = "DESCENDING";
  }
  let encoding_stats;
  if (stats) {
    encoding_stats = [];
    if (dictionary_page_offset !== void 0) {
      encoding_stats.push({ page_type: "DICTIONARY_PAGE", encoding: "PLAIN", count: 1 });
    }
    encoding_stats.push({ page_type: "DATA_PAGE_V2", encoding, count: pageBoundaries.length });
  }
  return {
    chunk: {
      meta_data: {
        type,
        encodings,
        path_in_schema: schemaPath.slice(1).map((s) => s.name),
        codec: column.codec ?? "UNCOMPRESSED",
        num_values: BigInt(values.length),
        total_compressed_size: BigInt(writer.offset - offsetStart),
        total_uncompressed_size: BigInt(writer.offset - offsetStart),
        // TODO: uncompressed pages + headers
        data_page_offset,
        dictionary_page_offset,
        statistics,
        encoding_stats,
        geospatial_statistics
      },
      file_offset: BigInt(offsetStart)
    },
    columnIndex,
    offsetIndex,
    bloomFilter
  };
}
function getPageBoundaries(values, type, type_length, pageSize, repetitionLevels = []) {
  if (!pageSize) {
    return [{ start: 0, end: values.length }];
  }
  const boundaries = [];
  let start = 0;
  let accumulatedBytes = 0;
  for (let i = 0; i < values.length; i++) {
    const valueSize = estimateValueSize(values[i], type, type_length);
    accumulatedBytes += valueSize;
    const rowStart = !repetitionLevels.length || repetitionLevels[i] === 0;
    if (accumulatedBytes >= pageSize && i > start && rowStart) {
      boundaries.push({ start, end: i });
      start = i;
      accumulatedBytes = valueSize;
    }
  }
  if (start < values.length) {
    boundaries.push({ start, end: values.length });
  }
  return boundaries;
}
function getStatistics(values, element) {
  let min_value = void 0;
  let max_value = void 0;
  let null_count = 0n;
  for (const value of values) {
    if (value === null || value === void 0) {
      null_count++;
      continue;
    }
    if (typeof value === "object" && !(value instanceof Uint8Array)) continue;
    if (typeof value === "number" && Number.isNaN(value)) continue;
    const statisticValue = element.converted_type === "DECIMAL" && typeof value === "number" ? BigInt(Math.round(value * 10 ** (element.scale || 0))) : value;
    if (min_value === void 0 || compareValues(statisticValue, min_value) < 0) min_value = statisticValue;
    if (max_value === void 0 || compareValues(statisticValue, max_value) > 0) max_value = statisticValue;
  }
  if (min_value === 0) min_value = -0;
  if (max_value === 0) max_value = 0;
  return { min_value, max_value, null_count };
}
function compareValues(left, right) {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
  }
  if (typeof left === "string" && typeof right === "string") return compareStrings(left, right);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
function compareStrings(left, right) {
  if (left === right) return 0;
  const length = Math.min(left.length, right.length);
  let i = 0;
  while (i < length && left.charCodeAt(i) === right.charCodeAt(i)) i++;
  if (i > 0) {
    const prev = left.charCodeAt(i - 1);
    if (prev >= 55296 && prev <= 56319) i--;
  }
  while (i < left.length && i < right.length) {
    const a = codePointAt(left, i);
    const b = codePointAt(right, i);
    if (a !== b) return a - b;
    i += a > 65535 ? 2 : 1;
  }
  return left.length - right.length;
}
function codePointAt(str, i) {
  const code = str.codePointAt(i) ?? 65533;
  return code >= 55296 && code <= 57343 ? 65533 : code;
}

// node_modules/hyparquet-writer/src/dremel.js
function encodeNestedValues(treePath, rows) {
  const schemaPath = treePath.map((n) => n.element);
  if (treePath.length < 2) throw new Error("parquet schema path must include column");
  const definitionLevels = [];
  const repetitionLevels = [];
  const maxDefinitionLevel = getMaxDefinitionLevel(treePath);
  if (treePath.length === 2 && maxDefinitionLevel === 0) {
    return { values: rows, definitionLevels, repetitionLevels, maxDefinitionLevel };
  }
  if (treePath.length === 2 && maxDefinitionLevel === 1) {
    const definitionLevels2 = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      definitionLevels2[i] = rows[i] === null || rows[i] === void 0 ? 0 : 1;
    }
    return { values: rows, definitionLevels: definitionLevels2, repetitionLevels, maxDefinitionLevel };
  }
  const repLevelPrior = new Array(treePath.length);
  let repeatedCount = 0;
  for (let i = 0; i < treePath.length; i++) {
    repLevelPrior[i] = repeatedCount;
    if (schemaPath[i].repetition_type === "REPEATED") repeatedCount++;
  }
  const values = [];
  for (const row of rows) {
    visit(1, row, 0, 0, false);
  }
  return { values, definitionLevels, repetitionLevels, maxDefinitionLevel };
  function visit(depth, value, defLevel, repLevel, allowNull) {
    const element = schemaPath[depth];
    const repetition = element.repetition_type || "REQUIRED";
    if (depth === treePath.length - 1) {
      if (value === null || value === void 0) {
        if (repetition === "REQUIRED" && !allowNull) {
          throw new Error("parquet required value is undefined");
        }
        definitionLevels.push(defLevel);
      } else {
        definitionLevels.push(repetition === "REQUIRED" ? defLevel : defLevel + 1);
      }
      repetitionLevels.push(repLevel);
      values.push(value);
      return;
    }
    if (repetition === "REPEATED") {
      if (value === null || value === void 0) {
        if (!allowNull) throw new Error("parquet required value is undefined");
        visit(depth + 1, void 0, defLevel, repLevel, true);
        return;
      }
      if (!Array.isArray(value)) {
        throw new Error(`parquet repeated field ${element.name} must be an array`);
      }
      if (!value.length) {
        visit(depth + 1, void 0, defLevel, repLevel, true);
        return;
      }
      const isMapEntry = isMapLike(treePath[depth - 1]);
      const childElement = schemaPath[depth + 1];
      for (let i = 0; i < value.length; i++) {
        let childValue = value[i];
        if (isMapEntry && childValue && typeof childValue === "object" && childElement) {
          childValue = childValue[childElement.name];
        }
        const childRep = i === 0 ? repLevel : repLevelPrior[depth] + 1;
        visit(depth + 1, childValue, defLevel + 1, childRep, false);
      }
      return;
    }
    if (repetition === "OPTIONAL") {
      if (value === null || value === void 0) {
        visit(depth + 1, void 0, defLevel, repLevel, true);
      } else {
        const childValue = getChildValue(depth, value);
        const childIsNull = childValue === null || childValue === void 0;
        const isLogicalContainer = isListLike(treePath[depth]) || isMapLike(treePath[depth]);
        const isStruct = element.num_children && !element.type && !isLogicalContainer;
        const nextDef = isStruct || !childIsNull ? defLevel + 1 : defLevel;
        visit(depth + 1, childValue, nextDef, repLevel, childIsNull);
      }
      return;
    }
    if (value === null || value === void 0) {
      if (!allowNull) throw new Error("parquet required value is undefined");
      visit(depth + 1, void 0, defLevel, repLevel, true);
    } else {
      visit(depth + 1, getChildValue(depth, value), defLevel, repLevel, false);
    }
  }
  function getChildValue(depth, currentValue) {
    if (currentValue === null || currentValue === void 0) return void 0;
    const child = schemaPath[depth + 1];
    if (!child) return void 0;
    if (isListLike(treePath[depth])) return currentValue;
    if (isMapLike(treePath[depth])) {
      return normalizeMap(currentValue, schemaPath[depth]);
    }
    if (typeof currentValue === "object" && !Array.isArray(currentValue)) {
      return currentValue[child.name];
    }
    throw new Error(`parquet expected struct, got ${currentValue}`);
  }
}
function normalizeMap(value, element) {
  if (value instanceof Map) {
    return Array.from(value.entries(), ([k, v]) => ({ key: k, value: v }));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry && typeof entry === "object" && "key" in entry && "value" in entry) {
        return entry;
      }
      if (Array.isArray(entry) && entry.length === 2) {
        return { key: entry[0], value: entry[1] };
      }
      throw new Error("parquet map entry must provide key and value");
    });
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([k, v]) => ({ key: k, value: v }));
  }
  throw new Error(`parquet map field ${element.name} must be Map, array, or object`);
}

// node_modules/hyparquet-writer/src/indexes.js
function writeIndexes(writer, pageIndexes) {
  for (const { chunk, columnIndex } of pageIndexes) {
    writeColumnIndex(writer, chunk, columnIndex);
  }
  for (const { chunk, offsetIndex } of pageIndexes) {
    writeOffsetIndex(writer, chunk, offsetIndex);
  }
}
function writeColumnIndex(writer, columnChunk, columnIndex) {
  if (!columnIndex || columnIndex.min_values.length <= 1) return;
  const columnIndexOffset = writer.offset;
  serializeTCompactProtocol(writer, {
    field_1: columnIndex.null_pages,
    field_2: columnIndex.min_values,
    field_3: columnIndex.max_values,
    field_4: BoundaryOrders.indexOf(columnIndex.boundary_order),
    field_5: columnIndex.null_counts
  });
  columnChunk.column_index_offset = BigInt(columnIndexOffset);
  columnChunk.column_index_length = writer.offset - columnIndexOffset;
}
function writeOffsetIndex(writer, columnChunk, offsetIndex) {
  if (!offsetIndex || offsetIndex.page_locations.length <= 1) return;
  const offsetIndexOffset = writer.offset;
  serializeTCompactProtocol(writer, {
    field_1: offsetIndex.page_locations.map((p) => ({
      field_1: p.offset,
      field_2: p.compressed_page_size,
      field_3: p.first_row_index
    }))
  });
  columnChunk.offset_index_offset = BigInt(offsetIndexOffset);
  columnChunk.offset_index_length = writer.offset - offsetIndexOffset;
}

// node_modules/hyparquet-writer/src/metadata.js
function writeMetadata(writer, metadata) {
  const compact = {
    field_1: metadata.version,
    field_2: metadata.schema.map((element) => ({
      field_1: element.type && ParquetTypes.indexOf(element.type),
      field_2: element.type_length,
      field_3: element.repetition_type && FieldRepetitionTypes.indexOf(element.repetition_type),
      field_4: element.name,
      field_5: element.num_children,
      field_6: element.converted_type && ConvertedTypes.indexOf(element.converted_type),
      field_7: element.scale,
      field_8: element.precision,
      field_9: element.field_id,
      field_10: logicalType(element.logical_type)
    })),
    field_3: metadata.num_rows,
    field_4: metadata.row_groups.map((rg) => ({
      field_1: rg.columns.map((c) => ({
        field_1: c.file_path,
        field_2: c.file_offset,
        field_3: c.meta_data && {
          field_1: ParquetTypes.indexOf(c.meta_data.type),
          field_2: c.meta_data.encodings.map((e) => Encodings.indexOf(e)),
          field_3: c.meta_data.path_in_schema,
          field_4: CompressionCodecs.indexOf(c.meta_data.codec),
          field_5: c.meta_data.num_values,
          field_6: c.meta_data.total_uncompressed_size,
          field_7: c.meta_data.total_compressed_size,
          field_8: c.meta_data.key_value_metadata && c.meta_data.key_value_metadata.map((kv) => ({
            field_1: kv.key,
            field_2: kv.value
          })),
          field_9: c.meta_data.data_page_offset,
          field_10: c.meta_data.index_page_offset,
          field_11: c.meta_data.dictionary_page_offset,
          field_12: c.meta_data.statistics && unconvertStatistics(
            c.meta_data.statistics,
            schemaElement(metadata.schema, c.meta_data.path_in_schema)
          ),
          field_13: c.meta_data.encoding_stats && c.meta_data.encoding_stats.map((es) => ({
            field_1: PageTypes.indexOf(es.page_type),
            field_2: Encodings.indexOf(es.encoding),
            field_3: es.count
          })),
          field_14: c.meta_data.bloom_filter_offset,
          field_15: c.meta_data.bloom_filter_length,
          field_16: c.meta_data.size_statistics && {
            field_1: c.meta_data.size_statistics.unencoded_byte_array_data_bytes,
            field_2: c.meta_data.size_statistics.repetition_level_histogram,
            field_3: c.meta_data.size_statistics.definition_level_histogram
          },
          field_17: c.meta_data.geospatial_statistics && {
            field_1: c.meta_data.geospatial_statistics.bbox && thriftBoundingBox(c.meta_data.geospatial_statistics.bbox),
            field_2: c.meta_data.geospatial_statistics.geospatial_types
          }
        },
        field_4: c.offset_index_offset,
        field_5: c.offset_index_length,
        field_6: c.column_index_offset,
        field_7: c.column_index_length,
        // field_8: c.crypto_metadata,
        field_9: c.encrypted_column_metadata
      })),
      field_2: rg.total_byte_size,
      field_3: rg.num_rows,
      field_4: rg.sorting_columns && rg.sorting_columns.map((sc) => ({
        field_1: sc.column_idx,
        field_2: sc.descending,
        field_3: sc.nulls_first
      })),
      field_5: rg.file_offset,
      field_6: rg.total_compressed_size
      // field_7: rg.ordinal, // should be int16
    })),
    field_5: metadata.key_value_metadata && metadata.key_value_metadata.map((kv) => ({
      field_1: kv.key,
      field_2: kv.value
    })),
    field_6: metadata.created_by
  };
  const metadataStart = writer.offset;
  serializeTCompactProtocol(writer, compact);
  const metadataLength = writer.offset - metadataStart;
  writer.appendUint32(metadataLength);
}
function thriftBoundingBox(bbox) {
  return new ThriftStruct([
    [1, DOUBLE, bbox.xmin],
    [2, DOUBLE, bbox.xmax],
    [3, DOUBLE, bbox.ymin],
    [4, DOUBLE, bbox.ymax],
    [5, DOUBLE, bbox.zmin],
    [6, DOUBLE, bbox.zmax],
    [7, DOUBLE, bbox.mmin],
    [8, DOUBLE, bbox.mmax]
  ]);
}
function schemaElement(schema, path) {
  const tree = getSchemaPath(schema, path);
  return tree[tree.length - 1].element;
}
function logicalType(type) {
  if (!type) return;
  if (type.type === "STRING") return { field_1: {} };
  if (type.type === "MAP") return { field_2: {} };
  if (type.type === "LIST") return { field_3: {} };
  if (type.type === "ENUM") return { field_4: {} };
  if (type.type === "DECIMAL") return { field_5: {
    field_1: type.scale,
    field_2: type.precision
  } };
  if (type.type === "DATE") return { field_6: {} };
  if (type.type === "TIME") return { field_7: {
    field_1: type.isAdjustedToUTC,
    field_2: timeUnit(type.unit)
  } };
  if (type.type === "TIMESTAMP") return { field_8: {
    field_1: type.isAdjustedToUTC,
    field_2: timeUnit(type.unit)
  } };
  if (type.type === "INTEGER") return { field_10: {
    field_1: type.bitWidth,
    field_2: type.isSigned
  } };
  if (type.type === "NULL") return { field_11: {} };
  if (type.type === "JSON") return { field_12: {} };
  if (type.type === "BSON") return { field_13: {} };
  if (type.type === "UUID") return { field_14: {} };
  if (type.type === "FLOAT16") return { field_15: {} };
  if (type.type === "VARIANT") return { field_16: {} };
  if (type.type === "GEOMETRY") return { field_17: {
    field_1: type.crs
  } };
  if (type.type === "GEOGRAPHY") return { field_18: {
    field_1: type.crs,
    field_2: type.algorithm && EdgeInterpolationAlgorithms.indexOf(type.algorithm)
  } };
}
function timeUnit(unit) {
  if (unit === "NANOS") return { field_3: {} };
  if (unit === "MICROS") return { field_2: {} };
  return { field_1: {} };
}

// node_modules/hyparquet-writer/src/snappy.js
var MAX_HASH_TABLE_BITS = 14;
var MAX_OFFSET = 65535;
var globalHashTables = new Array(MAX_HASH_TABLE_BITS + 1);
function snappyCompress(input) {
  const writer = new ByteWriter();
  writer.appendVarInt(input.length);
  compressInput(writer, input);
  return writer.getBytes();
}
function hashFunc(key, hashFuncShift) {
  return Math.imul(key, 506832829) >>> hashFuncShift;
}
function load32(array, pos) {
  return array[pos] + (array[pos + 1] << 8) + (array[pos + 2] << 16) + (array[pos + 3] << 24);
}
function equals32(array, pos1, pos2) {
  return array[pos1] === array[pos2] && array[pos1 + 1] === array[pos2 + 1] && array[pos1 + 2] === array[pos2 + 2] && array[pos1 + 3] === array[pos2 + 3];
}
function emitLiteral(writer, input, ip, len) {
  if (len <= 60) {
    writer.appendUint8(len - 1 << 2);
  } else {
    const value = len - 1;
    const bytes = value < 256 ? 1 : value < 65536 ? 2 : value < 16777216 ? 3 : 4;
    writer.appendUint8(59 + bytes << 2);
    for (let i = 0; i < bytes; i++) {
      writer.appendUint8(value >>> i * 8);
    }
  }
  writer.appendBytes(input.subarray(ip, ip + len));
}
function emitCopyLessThan64(writer, offset, len) {
  if (len < 12 && offset < 2048) {
    writer.appendUint8(1 + (len - 4 << 2) + (offset >>> 8 << 5));
    writer.appendUint8(offset & 255);
  } else {
    writer.appendUint8(2 + (len - 1 << 2));
    writer.appendUint8(offset & 255);
    writer.appendUint8(offset >>> 8);
  }
}
function emitCopy(writer, offset, len) {
  while (len >= 68) {
    emitCopyLessThan64(writer, offset, 64);
    len -= 64;
  }
  if (len > 64) {
    emitCopyLessThan64(writer, offset, 60);
    len -= 60;
  }
  emitCopyLessThan64(writer, offset, len);
}
function compressInput(writer, input) {
  const inputSize = input.length;
  let hashTableBits = 1;
  while (1 << hashTableBits <= inputSize && hashTableBits <= MAX_HASH_TABLE_BITS) {
    hashTableBits++;
  }
  hashTableBits--;
  const hashFuncShift = 32 - hashTableBits;
  globalHashTables[hashTableBits] ??= new Uint32Array(1 << hashTableBits);
  const hashTable = globalHashTables[hashTableBits];
  hashTable.fill(0);
  const ipEnd = inputSize;
  let ipLimit;
  let ip = 0;
  let nextEmit = 0;
  let hash, nextHash;
  let nextIp, candidate, skip;
  let bytesBetweenHashLookups;
  let base, matched, offset;
  let prevHash, curHash;
  let flag = true;
  const INPUT_MARGIN = 15;
  if (inputSize >= INPUT_MARGIN) {
    ipLimit = ipEnd - INPUT_MARGIN;
    ip++;
    nextHash = hashFunc(load32(input, ip), hashFuncShift);
    while (flag) {
      skip = 32;
      nextIp = ip;
      do {
        ip = nextIp;
        hash = nextHash;
        bytesBetweenHashLookups = skip >>> 5;
        skip++;
        nextIp = ip + bytesBetweenHashLookups;
        if (ip > ipLimit) {
          flag = false;
          break;
        }
        nextHash = hashFunc(load32(input, nextIp), hashFuncShift);
        candidate = hashTable[hash];
        hashTable[hash] = ip;
      } while (ip - candidate > MAX_OFFSET || !equals32(input, ip, candidate));
      if (!flag) {
        break;
      }
      emitLiteral(writer, input, nextEmit, ip - nextEmit);
      do {
        base = ip;
        matched = 4;
        while (ip + matched < ipEnd && input[ip + matched] === input[candidate + matched]) {
          matched++;
        }
        ip += matched;
        offset = base - candidate;
        emitCopy(writer, offset, matched);
        nextEmit = ip;
        if (ip >= ipLimit) {
          flag = false;
          break;
        }
        prevHash = hashFunc(load32(input, ip - 1), hashFuncShift);
        hashTable[prevHash] = ip - 1;
        curHash = hashFunc(load32(input, ip), hashFuncShift);
        candidate = hashTable[curHash];
        hashTable[curHash] = ip;
      } while (ip - candidate <= MAX_OFFSET && equals32(input, ip, candidate));
      if (!flag) {
        break;
      }
      ip++;
      nextHash = hashFunc(load32(input, ip), hashFuncShift);
    }
  }
  if (nextEmit < ipEnd) {
    emitLiteral(writer, input, nextEmit, ipEnd - nextEmit);
  }
}

// node_modules/hyparquet-writer/src/parquet-writer.js
var ParquetWriter = class {
  /**
   * @param {object} options
   * @param {Writer} options.writer
   * @param {SchemaElement[]} options.schema
   * @param {CompressionCodec} [options.codec]
   * @param {Compressors} [options.compressors]
   * @param {boolean} [options.statistics]
   * @param {KeyValue[]} [options.kvMetadata]
   */
  constructor({ writer, schema, codec = "SNAPPY", compressors, statistics = true, kvMetadata }) {
    this.writer = writer;
    this.schema = schema;
    this.codec = codec;
    this.compressors = { SNAPPY: snappyCompress, ...compressors };
    this.statistics = statistics;
    this.kvMetadata = kvMetadata;
    this.row_groups = [];
    this.num_rows = 0n;
    this.pendingIndexes = [];
    this.writer.appendUint32(827474256);
  }
  /**
   * Write data to the file.
   * Will split data into row groups of the specified size.
   * Calls writer.flush() (if defined) after each row group; if it returns a
   * Promise, subsequent row groups await it before encoding more data.
   *
   * @param {object} options
   * @param {ColumnSource[]} options.columnData
   * @param {number | number[]} [options.rowGroupSize]
   * @param {number} [options.pageSize]
   * @param {number} [options.dictionarySize]
   * @returns {void | Promise<void>}
   */
  write({ columnData, rowGroupSize = [1e3, 1e5], pageSize = 1048576, dictionarySize }) {
    const columnDataRows = columnData[0]?.data?.length || 0;
    let pending;
    for (const { groupStartIndex, groupSize: groupSize2 } of groupIterator({ columnDataRows, rowGroupSize })) {
      const writeGroup = () => {
        const groupStartOffset = this.writer.offset;
        const columns = [];
        for (let j = 0; j < columnData.length; j++) {
          const { name, data, encoding, codec = this.codec, columnIndex = false, offsetIndex = true, shredding, bloomFilter } = columnData[j];
          if (columnIndex && !offsetIndex) {
            throw new Error("parquet ColumnIndex cannot be present without OffsetIndex");
          }
          if (data.length !== columnDataRows) {
            throw new Error("parquet columns must have the same length");
          }
          const groupData = data.slice(groupStartIndex, groupStartIndex + groupSize2);
          const columnPath = getSchemaPath(this.schema, [name]);
          const leafPaths = getLeafSchemaPaths(columnPath);
          const columnElement = columnPath.at(-1)?.element;
          const shreddingConfig = shredding && shredding !== true ? shredding : void 0;
          const isVariant = columnElement?.logical_type?.type === "VARIANT";
          const isRequired = columnElement?.repetition_type === "REQUIRED";
          const rows = isVariant ? encodeVariantColumn(Array.from(groupData), shreddingConfig, { name, required: isRequired }) : groupData;
          for (const leafPath of leafPaths) {
            const schemaPath = leafPath.map((node) => node.element);
            const column = {
              columnName: schemaPath.slice(1).map((s) => s.name).join("."),
              element: schemaPath[schemaPath.length - 1],
              schemaPath,
              codec,
              compressors: this.compressors,
              stats: this.statistics,
              pageSize,
              dictionarySize,
              columnIndex,
              offsetIndex,
              encoding,
              bloomFilter
            };
            const pageData = encodeNestedValues(leafPath, rows);
            const result = writeColumn({
              writer: this.writer,
              column,
              pageData
            });
            columns.push(result.chunk);
            this.pendingIndexes.push(result);
          }
        }
        this.num_rows += BigInt(groupSize2);
        this.row_groups.push({
          columns,
          total_byte_size: BigInt(this.writer.offset - groupStartOffset),
          num_rows: BigInt(groupSize2)
        });
        return this.writer.flush?.();
      };
      if (pending) {
        pending = pending.then(writeGroup);
      } else {
        const r = writeGroup();
        if (r) pending = Promise.resolve(r);
      }
    }
    return pending;
  }
  /**
   * Finish writing the file.
   *
   * @returns {void | Promise<void>}
   */
  finish() {
    writeIndexes(this.writer, this.pendingIndexes);
    writeBlooms(this.writer, this.pendingIndexes);
    const metadata = {
      version: 2,
      created_by: "hyparquet",
      schema: this.schema,
      num_rows: this.num_rows,
      row_groups: this.row_groups,
      metadata_length: 0,
      key_value_metadata: this.kvMetadata
    };
    delete metadata.metadata_length;
    writeMetadata(this.writer, metadata);
    this.writer.appendUint32(827474256);
    return this.writer.finish();
  }
};
function groupSize(rowGroupSize, i) {
  return Array.isArray(rowGroupSize) ? rowGroupSize[Math.min(i, rowGroupSize.length - 1)] : rowGroupSize;
}
function groupIterator({ columnDataRows, rowGroupSize }) {
  if (Array.isArray(rowGroupSize) && !rowGroupSize.length) {
    throw new Error("rowGroupSize array cannot be empty");
  }
  const groups = [];
  let groupIndex = 0;
  let groupStartIndex = 0;
  while (groupStartIndex < columnDataRows) {
    const size = groupSize(rowGroupSize, groupIndex);
    groups.push({ groupStartIndex, groupSize: Math.min(size, columnDataRows - groupStartIndex) });
    groupStartIndex += size;
    groupIndex++;
  }
  return groups;
}
function getLeafSchemaPaths(schemaPath) {
  const leaves = [];
  dfs(schemaPath);
  return leaves;
  function dfs(path) {
    const node = path[path.length - 1];
    if (!node.children.length) {
      leaves.push(path);
      return;
    }
    for (const child of node.children) {
      dfs([...path, child]);
    }
  }
}

// node_modules/hyparquet-writer/src/write.js
function parquetWrite({
  writer,
  columnData,
  schema,
  codec = "SNAPPY",
  compressors,
  statistics = true,
  rowGroupSize = [1e3, 1e5],
  kvMetadata,
  pageSize = 1048576,
  dictionarySize
}) {
  columnData = columnData.map((col) => {
    if (col.shredding === true && col.type === "VARIANT") {
      const detected = autoDetectShredding(Array.from(col.data));
      return detected ? { ...col, shredding: detected } : { ...col, shredding: void 0 };
    }
    if (col.shredding !== void 0 && col.shredding !== true && col.type === "VARIANT") {
      const shredding = normalizeShreddingConfig(col.shredding);
      return shredding ? { ...col, shredding } : { ...col, shredding: void 0 };
    }
    return col;
  });
  if (!schema) {
    schema = schemaFromColumnData({ columnData });
  } else if (columnData.some(({ type }) => type)) {
    throw new Error("cannot provide both schema and columnData type");
  } else {
  }
  const pq = new ParquetWriter({
    writer,
    schema,
    codec,
    compressors,
    statistics,
    kvMetadata
  });
  const w = pq.write({
    columnData,
    rowGroupSize,
    pageSize,
    dictionarySize
  });
  return w ? w.then(() => pq.finish()) : pq.finish();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ByteWriter,
  parquetWrite
});
