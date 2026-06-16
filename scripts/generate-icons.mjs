import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Precomputed CRC-32 lookup table. @type {number[]} */
const CRC_TABLE = buildCrcTable();

/**
 * Build the CRC-32 lookup table.
 * @returns {number[]} 256-entry CRC table.
 */
function buildCrcTable() {
  return Array.from({ length: 256 }, (_, n) => crcEntry(n));
}

/**
 * Compute a single CRC-32 table entry.
 * @param {number} n - Byte value (0-255).
 * @returns {number} The CRC value for the byte.
 */
function crcEntry(n) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
}

/**
 * Compute the CRC-32 checksum of a buffer.
 * @param {Buffer} buffer - Input bytes.
 * @returns {number} The CRC-32 checksum.
 */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Wrap chunk data into a PNG chunk (length + type + data + CRC).
 * @param {string} type - Four-character chunk type.
 * @param {Buffer} data - Chunk payload.
 * @returns {Buffer} The encoded chunk.
 */
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Encode an RGBA pixel buffer into a PNG buffer.
 * @param {number} size - Square image edge length in pixels.
 * @param {Buffer} rgba - Raw RGBA pixels (size*size*4 bytes).
 * @returns {Buffer} The encoded PNG file.
 */
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflate(size, rgba)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Filter and deflate the pixel rows for the IDAT chunk.
 * @param {number} size - Image edge length.
 * @param {Buffer} rgba - Raw RGBA pixels.
 * @returns {Buffer} The zlib-compressed scanlines.
 */
function deflate(size, rgba) {
  const stride = size * 4;
  const rows = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y += 1) rgba.copy(rows, y * (stride + 1) + 1, y * stride, y * stride + stride);
  return zlib.deflateSync(rows, { level: 9 });
}

/**
 * Render a simple disc-on-teal icon into an RGBA buffer.
 * @param {number} size - Image edge length.
 * @returns {Buffer} The generated RGBA pixel buffer.
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = size * 0.3;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) paintPixel(rgba, size, x, y, center, radius);
  return rgba;
}

/**
 * Paint a single pixel: white inside the disc, teal otherwise.
 * @param {Buffer} rgba - Target buffer.
 * @param {number} size - Image edge length.
 * @param {number} x - Pixel column.
 * @param {number} y - Pixel row.
 * @param {number} center - Disc center coordinate.
 * @param {number} radius - Disc radius.
 * @returns {void}
 */
function paintPixel(rgba, size, x, y, center, radius) {
  const inside = (x - center) ** 2 + (y - center) ** 2 <= radius ** 2;
  const color = inside ? [255, 255, 255, 255] : [13, 148, 136, 255];
  rgba.set(color, (y * size + x) * 4);
}

/**
 * Generate a PNG file at the given path.
 * @param {string} path - Output file path.
 * @param {number} size - Image edge length.
 * @returns {void}
 */
function writeIcon(path, size) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(size, drawIcon(size)));
}

writeIcon('build/icon.png', 512);
writeIcon('resources/tray.png', 32);
