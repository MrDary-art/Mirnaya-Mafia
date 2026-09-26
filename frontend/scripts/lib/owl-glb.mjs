import { readFile, writeFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function readGlb(url) {
  const bytes = await readFile(url);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const bin = bytes.subarray(28 + jsonLength);
  const accessor = index => {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView];
    const counts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const types = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array };
    const Type = types[a.componentType];
    const start = (view.byteOffset || 0) + (a.byteOffset || 0);
    if (view.byteStride) throw new Error('Interleaved accessor is not supported by the repair tool');
    return new Type(bin.buffer, bin.byteOffset + start, a.count * counts[a.type]);
  };
  return { bytes, json, bin, accessor };
}

// Geometry/animation tests use the real asset without a browser image decoder.
// No texture or material changes are written to the public resource.
export async function loadGeometryGlb(url) {
  const data = await readGlb(url);
  const json = structuredClone(data.json);
  delete json.images; delete json.textures; delete json.samplers;
  json.materials = json.materials.map(material => ({ name: material.name, doubleSided: true }));
  json.buffers = [{ byteLength: data.bin.length, uri: `data:application/octet-stream;base64,${data.bin.toString('base64')}` }];
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, values) { this.type = type; Object.assign(this, values); } };
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  return { ...data, ...gltf };
}

export async function writeGlb(url, json, bin) {
  const encoded = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32); encoded.copy(jsonChunk);
  const binary = Buffer.alloc(Math.ceil(bin.length / 4) * 4); bin.copy(binary);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + binary.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(binary.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  await writeFile(url, Buffer.concat([header, jsonChunk, binaryHeader, binary]));
}
