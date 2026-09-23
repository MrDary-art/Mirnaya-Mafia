// Decode the reference mesh at development time so the site needs no Draco
// worker, remote decoder, or relaxed Content-Security-Policy at runtime.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "apps/web/public/backgrounds/vara");
mkdirSync(target, { recursive: true });
const source = readFileSync(join(target, "source.glb"));
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const binary = source.subarray(28 + jsonLength);
const primitive = gltf.meshes[0].primitives[0];
const compressed = primitive.extensions.KHR_draco_mesh_compression;
const view = gltf.bufferViews[compressed.bufferView];
const data = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
const temp = mkdtempSync(join(tmpdir(), "arena-draco-"));
try {
  const decoderFile = join(temp, "decoder.cjs");
  copyFileSync(join(root, "node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js"), decoderFile);
  const createDecoder = createRequire(import.meta.url)(decoderFile);
  const draco = await createDecoder({});
  const decoder = new draco.Decoder();
  const buffer = new draco.DecoderBuffer();
  buffer.Init(new Int8Array(data), data.length);
  const mesh = new draco.Mesh();
  const status = decoder.DecodeBufferToMesh(buffer, mesh);
  if (!status.ok()) throw new Error(status.error_msg());
  const vertexCount = mesh.num_points();
  const indexCount = mesh.num_faces() * 3;
  const chunks = [];
  const header = Buffer.alloc(16);
  header.write("ARNA", 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(vertexCount, 8);
  header.writeUInt32LE(indexCount, 12);
  chunks.push(header);
  for (const [name, size] of [["POSITION", 3], ["NORMAL", 3], ["TEXCOORD_0", 2]]) {
    const attribute = decoder.GetAttributeByUniqueId(mesh, compressed.attributes[name]);
    const values = new draco.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
    const array = new Float32Array(vertexCount * size);
    for (let i = 0; i < array.length; i++) array[i] = values.GetValue(i);
    chunks.push(Buffer.from(array.buffer));
    draco.destroy(values);
  }
  const indices = new Uint32Array(indexCount);
  const face = new draco.DracoInt32Array();
  for (let i = 0; i < mesh.num_faces(); i++) {
    decoder.GetFaceFromMesh(mesh, i, face);
    for (let j = 0; j < 3; j++) indices[i * 3 + j] = face.GetValue(j);
  }
  chunks.push(Buffer.from(indices.buffer));
  writeFileSync(join(target, "spiral.bin.gz"), gzipSync(Buffer.concat(chunks), { level: 9 }));
  const image = gltf.bufferViews[gltf.images[0].bufferView];
  writeFileSync(join(target, "material.png"), binary.subarray(image.byteOffset, image.byteOffset + image.byteLength));
  for (const value of [face, mesh, buffer, decoder]) draco.destroy(value);
  console.log(`Prepared reference spiral: ${vertexCount} vertices, ${indexCount / 3} triangles.`);
} finally {
  if (!resolve(temp).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe temporary path");
  rmSync(temp, { recursive: true, force: true });
}
