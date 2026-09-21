import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Contour, OrientedMesh, Tool, Toolpath, Vec2 } from '../types';

export type StageProps = {
  mesh: OrientedMesh | null;
  sliceZ: number | null;
  showPlane: boolean;
  contours: Contour[];
  ignored: number[];
  selectable: boolean;
  onToggleContour?: (id: number) => void;
  origin: Vec2 | null;
  originZ: number | null;
  showOrigin: boolean;
  tool: Tool | null;               // null = kein Werkzeug anzeigen
  toolpath: Toolpath | null;
  originForPath: Vec2 | null;      // Weltoffset, um Programm-Koordinaten zurück ins Modell zu setzen
  zTopWorld: number | null;        // Modell-Oberkante in Weltkoordinaten
  zProgramTop: number;             // Programm-Z der Oberkante (0 oder depth)
  progress: number;                // 0..1 Position des Werkzeugs auf dem Pfad
  view: '3d' | 'top';
  dimmed?: boolean;
};

const C = {
  bg: 0x0e0e10, grid: 0x232326, gridMinor: 0x18181b, model: 0x8e8e96,
  contour: 0x3b82f6, contourIgnored: 0x4a4a52, contourHover: 0x93c5fd,
  cut: 0x3b82f6, rapid: 0xf87171, origin: [0xf87171, 0x4ade80, 0x60a5fa], tool: 0xd4d4d8, plane: 0x3b82f6,
};

export default function Stage(p: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    model: THREE.Group; plane: THREE.Mesh; contours: THREE.Group; origin: THREE.Group; tool: THREE.Group; path: THREE.Group;
    ray: THREE.Raycaster; size: number; hover: number | null; propsRef: StageProps; grid: THREE.GridHelper;
  } | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;

  // --- Szene ---------------------------------------------------------------
  useEffect(() => {
    const el = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      el.innerHTML = '<div style="padding:24px;color:#a1a1aa;font-size:13px">WebGL ist in diesem Browser nicht verfügbar.</div>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(60, -80, 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222226, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(0.6, -1, 2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-1, 1, 0.5); scene.add(fill);

    const grid = new THREE.GridHelper(200, 20, C.grid, C.gridMinor);
    grid.rotation.x = Math.PI / 2; scene.add(grid);

    const model = new THREE.Group(); scene.add(model);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: C.plane, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    plane.visible = false; scene.add(plane);
    const contours = new THREE.Group(); scene.add(contours);
    const origin = new THREE.Group(); scene.add(origin);
    const tool = new THREE.Group(); scene.add(tool);
    const path = new THREE.Group(); scene.add(path);

    const ray = new THREE.Raycaster();
    const s = { renderer, scene, camera, controls, model, plane, contours, origin, tool, path, ray, size: 50, hover: null as number | null, propsRef: p, grid };
    st.current = s;

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    // Picking
    const ndc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const pick = (e: PointerEvent): number | null => {
      if (!propsRef.current.selectable) return null;
      ray.params.Line.threshold = Math.max(0.15, s.size * 0.012);
      ray.setFromCamera(ndc(e), camera);
      const hits = ray.intersectObjects(contours.children, false);
      return hits.length ? (hits[0].object.userData.id as number) : null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
      down = null;
      if (moved) return;
      const id = pick(e);
      if (id !== null) propsRef.current.onToggleContour?.(id);
    };
    const onMove = (e: PointerEvent) => {
      const id = pick(e);
      if (id !== s.hover) {
        s.hover = id;
        renderer.domElement.style.cursor = id !== null ? 'pointer' : '';
        for (const l of contours.children) {
          const m = (l as THREE.Line).material as THREE.LineBasicMaterial;
          const ignored = propsRef.current.ignored.includes(l.userData.id);
          m.color.setHex(l.userData.id === id ? C.contourHover : ignored ? C.contourIgnored : C.contour);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose();
      renderer.domElement.remove(); st.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Modell ---------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s) return;
    disposeGroup(s.model);
    if (!p.mesh) { s.plane.visible = false; return; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.mesh.positions, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: C.model, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide, flatShading: true, transparent: true, opacity: 1 });
    s.model.add(new THREE.Mesh(geo, mat));
    const { min, max } = p.mesh;
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
    s.size = size;
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
    s.controls.target.set(cx, cy, cz);
    s.camera.position.set(cx + size * 0.9, cy - size * 1.3, cz + size * 1.0);
    s.camera.near = size / 200; s.camera.far = size * 60; s.camera.updateProjectionMatrix();
    s.grid.scale.setScalar(Math.max(size, 20) / 100);
    s.grid.position.set(cx, cy, min[2] - 0.01);
    s.plane.scale.set((max[0] - min[0]) * 1.25 + 1, (max[1] - min[1]) * 1.25 + 1, 1);
    s.plane.position.set(cx, cy, cz);
  }, [p.mesh]);

  // Dimmen (Modell transparent bei Werkzeugweg-Ansicht)
  useEffect(() => {
    const s = st.current; if (!s) return;
    for (const m of s.model.children) {
      const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.opacity = p.dimmed ? 0.35 : 1;
      mat.depthWrite = !p.dimmed;
    }
  }, [p.dimmed, p.mesh]);

  // --- Schnittebene -----------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.plane.visible = !!(p.mesh && p.showPlane && p.sliceZ !== null);
    if (p.sliceZ !== null) s.plane.position.z = p.sliceZ;
  }, [p.sliceZ, p.showPlane, p.mesh]);

  // --- Konturen ------------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s) return;
    disposeGroup(s.contours);
    if (p.sliceZ === null) return;
    const z = p.sliceZ + s.size * 0.002;
    for (const c of p.contours) {
      const pts = c.pts.map((q) => new THREE.Vector3(q.x, q.y, z));
      if (c.closed) pts.push(pts[0].clone());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const ignored = p.ignored.includes(c.id);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ignored ? C.contourIgnored : C.contour, transparent: true, opacity: ignored ? 0.7 : 1 }));
      line.userData.id = c.id;
      s.contours.add(line);
    }
  }, [p.contours, p.sliceZ, p.ignored]);

  // --- Nullpunkt ------------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s) return;
    disposeGroup(s.origin);
    if (!p.showOrigin || !p.origin || p.originZ === null) return;
    const len = Math.max(s.size * 0.25, 5);
    const o = new THREE.Vector3(p.origin.x, p.origin.y, p.originZ);
    const axes: [THREE.Vector3, number][] = [
      [new THREE.Vector3(1, 0, 0), C.origin[0]], [new THREE.Vector3(0, 1, 0), C.origin[1]], [new THREE.Vector3(0, 0, 1), C.origin[2]],
    ];
    for (const [dir, color] of axes) {
      const arrow = new THREE.ArrowHelper(dir, o, len, color, len * 0.18, len * 0.09);
      s.origin.add(arrow);
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(s.size * 0.012, 0.3), 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dot.position.copy(o); s.origin.add(dot);
  }, [p.origin, p.originZ, p.showOrigin, p.mesh]);

  // --- Werkzeugweg --------------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s) return;
    disposeGroup(s.path);
    if (!p.toolpath || !p.originForPath || p.zTopWorld === null) return;
    const ox = p.originForPath.x, oy = p.originForPath.y, oz = p.zTopWorld - p.zProgramTop;
    const cut: number[] = [], rapid: number[] = [];
    const mv = p.toolpath.moves;
    for (let i = 1; i < mv.length; i++) {
      const a = mv[i - 1], b = mv[i];
      const arr = b.rapid ? rapid : cut;
      arr.push(a.x + ox, a.y + oy, a.z + oz, b.x + ox, b.y + oy, b.z + oz);
    }
    const mk = (arr: number[], color: number, dashed: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const m = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: s.size * 0.02, gapSize: s.size * 0.015, transparent: true, opacity: 0.8 })
        : new THREE.LineBasicMaterial({ color });
      const l = new THREE.LineSegments(g, m);
      if (dashed) l.computeLineDistances();
      s.path.add(l);
    };
    if (cut.length) mk(cut, C.cut, false);
    if (rapid.length) mk(rapid, C.rapid, true);
  }, [p.toolpath, p.originForPath, p.zTopWorld, p.zProgramTop]);

  // --- Werkzeugkopf ------------------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s) return;
    disposeGroup(s.tool);
    if (!p.tool) return;
    const t = p.tool;
    const tipR = t.tipDia / 2, shaftR = t.shaftDia / 2;
    const half = (t.tipAngle * Math.PI) / 360;
    const coneH = Math.max((shaftR - tipR) / Math.tan(half), 0.5);
    const shaftH = Math.max(s.size * 0.4, 15);
    const mat = new THREE.MeshStandardMaterial({ color: C.tool, roughness: 0.35, metalness: 0.7 });
    // Kegel: Spitze bei z=0 (Werkzeugspitze), öffnet nach oben
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, tipR, coneH, 32), mat);
    cone.rotation.x = Math.PI / 2; cone.position.z = coneH / 2;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftH, 32), mat);
    shaft.rotation.x = Math.PI / 2; shaft.position.z = coneH + shaftH / 2;
    const collet = new THREE.Mesh(new THREE.CylinderGeometry(shaftR * 2.6, shaftR * 2.2, shaftH * 0.35, 32), new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.5, metalness: 0.4 }));
    collet.rotation.x = Math.PI / 2; collet.position.z = coneH + shaftH + shaftH * 0.175;
    s.tool.add(cone, shaft, collet);
  }, [p.tool, p.mesh]);

  // --- Werkzeugposition ----------------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s || !p.tool) return;
    let pos: THREE.Vector3;
    if (p.toolpath && p.originForPath && p.zTopWorld !== null) {
      const ox = p.originForPath.x, oy = p.originForPath.y, oz = p.zTopWorld - p.zProgramTop;
      const m = positionAt(p.toolpath, p.progress);
      pos = new THREE.Vector3(m.x + ox, m.y + oy, m.z + oz);
    } else if (p.origin && p.originZ !== null) {
      pos = new THREE.Vector3(p.origin.x, p.origin.y, p.originZ + Math.max(s.size * 0.05, 1));
    } else {
      pos = new THREE.Vector3(0, 0, 0);
    }
    s.tool.position.copy(pos);
  }, [p.tool, p.toolpath, p.progress, p.origin, p.originZ, p.originForPath, p.zTopWorld, p.zProgramTop]);

  // --- Ansicht ---------------------------------------------------------------------------------
  useEffect(() => {
    const s = st.current; if (!s || !p.mesh) return;
    const t = s.controls.target;
    if (p.view === 'top') {
      s.camera.position.set(t.x, t.y - 0.0001, t.z + s.size * 2.2);
    } else {
      s.camera.position.set(t.x + s.size * 0.9, t.y - s.size * 1.3, t.z + s.size * 1.0);
    }
  }, [p.view, p.mesh]);

  return <div ref={ref} className="h-full w-full" />;
}

function disposeGroup(g: THREE.Group) {
  for (const c of [...g.children]) {
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
    g.remove(c);
  }
}

/** Position auf dem Werkzeugweg bei Fortschritt 0..1 (längenparametrisiert) */
export function positionAt(tp: Toolpath, t: number): { x: number; y: number; z: number } {
  const mv = tp.moves;
  if (mv.length < 2) return mv[0] ?? { x: 0, y: 0, z: 0 };
  let total = 0;
  const lens: number[] = [0];
  for (let i = 1; i < mv.length; i++) {
    total += Math.hypot(mv[i].x - mv[i - 1].x, mv[i].y - mv[i - 1].y, mv[i].z - mv[i - 1].z);
    lens.push(total);
  }
  const target = Math.min(Math.max(t, 0), 1) * total;
  let lo = 0, hi = lens.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lens[mid] <= target) lo = mid; else hi = mid; }
  const a = mv[lo], b = mv[hi];
  const seg = lens[hi] - lens[lo];
  const u = seg > 0 ? (target - lens[lo]) / seg : 0;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
}
