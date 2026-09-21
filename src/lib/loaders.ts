import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import type { MeshData } from '../types';

export const SUPPORTED_EXT = ['stl', 'obj', '3mf', 'step', 'stp', 'iges', 'igs', 'brep'];

export async function loadModelFile(file: File): Promise<MeshData> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const buffer = await file.arrayBuffer();

  let positions: Float32Array;
  switch (ext) {
    case 'stl': {
      const geo = new STLLoader().parse(buffer);
      positions = extractFromGeometry(geo);
      break;
    }
    case 'obj': {
      const text = new TextDecoder().decode(buffer);
      const obj = new OBJLoader().parse(text);
      positions = extractFromObject(obj);
      break;
    }
    case '3mf': {
      const obj = new ThreeMFLoader().parse(buffer);
      positions = extractFromObject(obj);
      break;
    }
    case 'step': case 'stp': case 'iges': case 'igs': case 'brep': {
      positions = await loadWithOcct(buffer, ext);
      break;
    }
    default:
      throw new Error(
        `Dateityp ".${ext}" wird nicht unterstützt. Unterstützt: ${SUPPORTED_EXT.map((e) => '.' + e).join(', ')}`
      );
  }

  if (!positions.length) throw new Error('Die Datei enthält keine Dreiecksgeometrie.');

  return {
    positions,
    triangleCount: positions.length / 9,
    name: file.name,
  };
}

// ---------------------------------------------------------------------------

function extractFromGeometry(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): Float32Array {
  let g = geo;
  if (g.index) g = g.toNonIndexed();
  const attr = g.getAttribute('position');
  const arr = new Float32Array(attr.array.length);
  arr.set(attr.array as Float32Array);
  if (matrix) {
    const v = new THREE.Vector3();
    for (let i = 0; i < arr.length; i += 3) {
      v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(matrix);
      arr[i] = v.x; arr[i + 1] = v.y; arr[i + 2] = v.z;
    }
  }
  return arr;
}

function extractFromObject(obj: THREE.Object3D): Float32Array {
  obj.updateMatrixWorld(true);
  const parts: Float32Array[] = [];
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      parts.push(extractFromGeometry(mesh.geometry as THREE.BufferGeometry, mesh.matrixWorld));
    }
  });
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ---------------------------------------------------------------------------
// STEP / IGES / BREP über occt-import-js (WASM, wird bei Bedarf vom CDN geladen)
// ---------------------------------------------------------------------------

const OCCT_VERSION = '0.0.23';
const OCCT_BASE = `https://cdn.jsdelivr.net/npm/occt-import-js@${OCCT_VERSION}/dist/`;

let occtPromise: Promise<any> | null = null;

function getOcct(): Promise<any> {
  if (!occtPromise) {
    occtPromise = new Promise<any>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = OCCT_BASE + 'occt-import-js.js';
      script.onload = () => {
        const factory = (window as any).occtimportjs;
        if (!factory) { reject(new Error('occt-import-js konnte nicht initialisiert werden.')); return; }
        factory({ locateFile: (f: string) => OCCT_BASE + f }).then(resolve, reject);
      };
      script.onerror = () => reject(new Error(
        'STEP-Konverter (occt-import-js) konnte nicht geladen werden. Bitte Internetverbindung prüfen oder STL/3MF/OBJ verwenden.'
      ));
      document.head.appendChild(script);
    });
    occtPromise.catch(() => { occtPromise = null; });
  }
  return occtPromise;
}

async function loadWithOcct(buffer: ArrayBuffer, ext: string): Promise<Float32Array> {
  const occt = await getOcct();
  const data = new Uint8Array(buffer);
  const params = { linearDeflection: 0.05, angularDeflection: 0.3 } as any;
  let result: any;
  if (ext === 'step' || ext === 'stp') result = occt.ReadStepFile(data, params);
  else if (ext === 'iges' || ext === 'igs') result = occt.ReadIgesFile(data, params);
  else result = occt.ReadBrepFile(data, params);

  if (!result?.success || !result.meshes?.length) {
    throw new Error('Die STEP/IGES-Datei konnte nicht gelesen werden.');
  }

  let total = 0;
  for (const m of result.meshes) total += m.index.array.length * 3;
  const out = new Float32Array(total);
  let off = 0;
  for (const m of result.meshes) {
    const pos = m.attributes.position.array as number[];
    const idx = m.index.array as number[];
    for (let i = 0; i < idx.length; i++) {
      const p = idx[i] * 3;
      out[off++] = pos[p];
      out[off++] = pos[p + 1];
      out[off++] = pos[p + 2];
    }
  }
  return out;
}
