// Node asset checks have no GPU. Validate real embedded PNG payloads and provide
// their dimensions to GLTFLoader; actual decoding/shading is verified in Blender/Chrome.
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
globalThis.self = globalThis;
globalThis.createImageBitmap = async (blob) => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.ok(width > 0 && height > 0 && width <= 2048 && height <= 2048);
  const idat = [];
  for (let i=8; i<bytes.length;) {
    const length = bytes.readUInt32BE(i), tag = bytes.toString('ascii',i+4,i+8);
    if (tag === 'IDAT') idat.push(bytes.subarray(i+8,i+8+length));
    i += length+12;
  }
  assert.ok(inflateSync(Buffer.concat(idat)).length >= height * (width * 3 + 1));
  return { width, height, close() {} };
};
