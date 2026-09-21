// 3D Model Loader - supports STL, OBJ, 3MF, PLY using three.js loaders
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { inflateRawAsync } from "./inflate";
import type { TriangleMesh, ModelInfo } from "../types/cam";

export type SupportedFormat = "stl" | "obj" | "3mf" | "ply" | "step" | "iges" | "brep";

export const SUPPORTED_EXTENSIONS: { ext: SupportedFormat; label: string; native: boolean }[] = [
  { ext: "stl", label: "STL (Stereolithography)", native: true },
  { ext: "obj", label: "OBJ (Wavefront)", native: true },
  { ext: "3mf", label: "3MF (3D Manufacturing)", native: true },
  { ext: "ply", label: "PLY (Polygon)", native: true },
  { ext: "step", label: "STEP (.step / .stp)", native: false },
  { ext: "iges", label: "IGES (.igs / .iges)", native: false },
  { ext: "brep", label: "BREP (.brep)", native: false },
];

export function detectFormat(file: File): SupportedFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".stl")) return "stl";
  if (name.endsWith(".obj")) return "obj";
  if (name.endsWith(".3mf")) return "3mf";
  if (name.endsWith(".ply")) return "ply";
  if (name.endsWith(".step") || name.endsWith(".stp")) return "step";
  if (name.endsWith(".iges") || name.endsWith(".igs")) return "iges";
  if (name.endsWith(".brep")) return "brep";
  return null;
}

export async function loadModel(file: File): Promise<ModelInfo> {
  const format = detectFormat(file);
  if (!format) {
    throw new Error("Nicht unterstütztes Dateiformat: " + file.name);
  }

  if (!SUPPORTED_EXTENSIONS.find((e) => e.ext === format)?.native) {
    throw new Error(
      `Format ${format.toUpperCase()} erfordert OpenCASCADE WASM und wird in dieser Browser-Version noch nicht unterstützt. ` +
      `Bitte STL, OBJ, 3MF oder PLY verwenden.`
    );
  }

  const buffer = await file.arrayBuffer();
  let geometry: THREE.BufferGeometry;

  switch (format) {
    case "stl": {
      const loader = new STLLoader();
      geometry = loader.parse(buffer);
      break;
    }
    case "obj": {
      const loader = new OBJLoader();
      const text = new TextDecoder().decode(buffer);
      const obj = loader.parse(text);
      const geoms: THREE.BufferGeometry[] = [];
      obj.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry;
          if (g) geoms.push(g.clone());
        }
      });
      if (geoms.length === 0) {
        throw new Error("OBJ-Datei enthält keine Geometrie");
      }
      geometry = mergeBufferGeometries(geoms);
      break;
    }
    case "ply": {
      const loader = new PLYLoader();
      geometry = loader.parse(buffer);
      break;
    }
    case "3mf": {
      geometry = await load3MF(buffer);
      break;
    }
    default:
      throw new Error("Unbekanntes Format: " + format);
  }

  if (!geometry.attributes.position) {
    throw new Error("Geometrie enthält keine Positionsdaten");
  }
  geometry.computeVertexNormals();

  const nonIndexed = geometry.toNonIndexed();
  const positions = nonIndexed.attributes.position.array as Float32Array;
  const normals = nonIndexed.attributes.normal?.array as Float32Array | undefined;

  nonIndexed.computeBoundingBox();
  const bb = nonIndexed.boundingBox!;

  const mesh: TriangleMesh = { positions, normals };
  const triangleCount = positions.length / 9;

  return {
    mesh,
    bbox: {
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
    },
    triangleCount,
    fileName: file.name,
    fileSize: file.size,
  };
}

function mergeBufferGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  geoms.forEach((g) => {
    totalVerts += g.attributes.position.count;
  });

  const positions = new Float32Array(totalVerts * 3);
  let offset = 0;
  geoms.forEach((g) => {
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let j = 0; j < pos.count; j++) {
      v.fromBufferAttribute(pos, j);
      positions[offset * 3 + 0] = v.x;
      positions[offset * 3 + 1] = v.y;
      positions[offset * 3 + 2] = v.z;
      offset++;
    }
  });

  const target = new THREE.BufferGeometry();
  target.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return target;
}

async function load3MF(buffer: ArrayBuffer): Promise<THREE.BufferGeometry> {
  const dv = new DataView(buffer);
  const files: Record<string, Uint8Array> = {};

  let eocdOffset = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("3MF: ungültiges ZIP-Archiv");

  const cdOffset = dv.getUint32(eocdOffset + 16, true);
  const cdSize = dv.getUint32(eocdOffset + 12, true);
  let p = cdOffset;
  const end = cdOffset + cdSize;

  while (p < end) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localHeaderOffset = dv.getUint32(p + 42, true);

    const nameBytes = new Uint8Array(buffer, p + 46, nameLen);
    const name = new TextDecoder().decode(nameBytes);

    const lhCompSize = dv.getUint32(localHeaderOffset + 18, true);
    const lhNameLen = dv.getUint16(localHeaderOffset + 26, true);
    const lhExtraLen = dv.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const compData = new Uint8Array(buffer, dataStart, lhCompSize);

    if (name.endsWith(".model") || name.endsWith(".xml")) {
      const uncomp = await inflateRawAsync(compData);
      files[name] = uncomp;
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  const modelFile = Object.keys(files).find((k) => k.endsWith(".model"));
  if (!modelFile) throw new Error("3MF: modelldatei nicht gefunden");

  const xml = new TextDecoder().decode(files[modelFile]);

  const vertices: number[] = [];
  const vertexRegex = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = vertexRegex.exec(xml)) !== null) {
    vertices.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }

  const indices: number[] = [];
  const triRegex = /<triangle\s+v1="([^"]+)"\s+v2="([^"]+)"\s+v3="([^"]+)"/g;
  while ((m = triRegex.exec(xml)) !== null) {
    indices.push(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }

  if (vertices.length === 0 || indices.length === 0) {
    throw new Error("3MF: keine Dreiecksdaten gefunden");
  }

  const positions = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    positions[i * 3 + 0] = vertices[indices[i] * 3 + 0];
    positions[i * 3 + 1] = vertices[indices[i] * 3 + 1];
    positions[i * 3 + 2] = vertices[indices[i] * 3 + 2];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geom;
}
