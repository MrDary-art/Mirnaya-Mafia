// Extract only the existing static perch. No owl geometry or rig is modified.
import { readFile, writeFile } from 'node:fs/promises';
const input = await readFile(new URL('../public/assets/owl/owl-rigged-low.glb', import.meta.url));
const jsonLength = input.readUInt32LE(12);
const source = JSON.parse(input.subarray(20, 20 + jsonLength));
const binary = input.subarray(28 + jsonLength);
const node = source.nodes.find(item => item.name === 'TreeStump');
if (!node || source.images?.length) throw new Error('Expected the original vertex-coloured static stump');
const mesh = structuredClone(source.meshes[node.mesh]);
const accessors = [], bufferViews = [], materials = [], buffers = [];
const accessorMap = new Map(), viewMap = new Map(), materialMap = new Map();
let length = 0;
function accessor(index) {
  if (accessorMap.has(index)) return accessorMap.get(index);
  const value = structuredClone(source.accessors[index]);
  if (!viewMap.has(value.bufferView)) {
    const view = source.bufferViews[value.bufferView];
    const bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
    bytes.copy(padded);
    viewMap.set(value.bufferView, bufferViews.length);
    bufferViews.push({ ...view, buffer: 0, byteOffset: length });
    buffers.push(padded); length += padded.length;
  }
  value.bufferView = viewMap.get(value.bufferView);
  accessorMap.set(index, accessors.length);
  accessors.push(value);
  return accessors.length - 1;
}
for (const primitive of mesh.primitives) {
  primitive.indices = accessor(primitive.indices);
  primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([key,index]) => [key, accessor(index)]));
  if (!materialMap.has(primitive.material)) {
    materialMap.set(primitive.material, materials.length);
    materials.push(source.materials[primitive.material]);
  }
  primitive.material = materialMap.get(primitive.material);
}
const output = { asset: { version: '2.0', generator: 'Arena: existing TreeStump only' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ ...node, mesh: 0 }], meshes: [mesh],
  materials, accessors, bufferViews, buffers: [{ byteLength: length }] };
const json = Buffer.from(JSON.stringify(output));
const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(paddedJson);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + paddedJson.length + length, 8);
header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(length); binHeader.writeUInt32LE(0x004e4942, 4);
await writeFile(new URL('../public/assets/owl/hero-stump.glb', import.meta.url), Buffer.concat([header, paddedJson, binHeader, ...buffers]));
console.log(JSON.stringify({ bytes: 28 + paddedJson.length + length, node: node.name }));
