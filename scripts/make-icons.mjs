// Renders the app icon (blue tile with a rising line) to PNG without dependencies.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size) {
  const s = size / 64;
  const pts = [
    [12, 46],
    [25, 33],
    [34, 39],
    [52, 18],
  ].map(([x, y]) => [x * s, y * s]);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const SS = 4; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let white = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let d = Infinity;
          for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, py, ...pts[i], ...pts[i + 1]));
          const dot = Math.hypot(px - pts[3][0], py - pts[3][1]);
          if (d <= 3 * s || dot <= 4 * s) white++;
        }
      const a = white / (SS * SS);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      // iOS rounds the corners itself, so the tile is full-bleed.
      raw[o] = Math.round(0x2a + (255 - 0x2a) * a);
      raw[o + 1] = Math.round(0x78 + (255 - 0x78) * a);
      raw[o + 2] = Math.round(0xd6 + (255 - 0xd6) * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('../public/apple-touch-icon.png', import.meta.url), render(180));
writeFileSync(new URL('../public/icon-512.png', import.meta.url), render(512));
console.log('icons written');
