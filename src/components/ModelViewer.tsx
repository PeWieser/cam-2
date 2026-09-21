// 3D Viewer using three.js
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TriangleMesh } from "../types/cam";

interface ModelViewerProps {
  mesh: TriangleMesh | null;
  toolpath?: { points: { x: number; y: number; z: number }[]; z: number }[];
  showToolpath: boolean;
}

export function ModelViewer({ mesh, toolpath, showToolpath }: ModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshObjRef = useRef<THREE.Object3D | null>(null);
  const toolpathGroupRef = useRef<THREE.Group | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f11);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 5000);
    camera.position.set(50, 50, 50);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(50, 80, 50);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-50, 30, -50);
    scene.add(fill);

    // Grid + axes (Z is up in CAM convention; grid lies on XY plane at Z=0)
    const grid = new THREE.GridHelper(200, 40, 0x333333, 0x222222);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    grid.rotation.x = Math.PI / 2; // make grid lie on XY plane
    scene.add(grid);

    const axes = new THREE.AxesHelper(20);
    scene.add(axes);

    const toolpathGroup = new THREE.Group();
    scene.add(toolpathGroup);
    toolpathGroupRef.current = toolpathGroup;

    // Animate
    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount || !camera || !renderer) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update mesh when changed
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (meshObjRef.current) {
      scene.remove(meshObjRef.current);
      meshObjRef.current.traverse((c) => {
        if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
        const m = (c as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m) (m as THREE.Material).dispose();
      });
      meshObjRef.current = null;
    }

    if (!mesh) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    if (mesh.normals) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;

    const material = new THREE.MeshStandardMaterial({
      color: 0xc9c9d4,
      metalness: 0.2,
      roughness: 0.55,
      flatShading: false,
    });

    const obj = new THREE.Mesh(geometry, material);
    // No translation needed — the CAM engine works with the model's original coordinates
    scene.add(obj);
    meshObjRef.current = obj;

    // Center and frame
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const size = new THREE.Vector3();
    bb.getSize(size);

    // Note: We use Three.js's default Y-up convention and rotate the model so that
    // its Z axis (CAM up) becomes -Y in world space. The toolpath is also rotated.
    // Re-compute center and size in world space after rotation
    const worldCenter = new THREE.Vector3(center.x, -center.z, center.y);
    const worldSize = new THREE.Vector3(size.x, size.z, size.y);
    const worldMaxDim = Math.max(worldSize.x, worldSize.y, worldSize.z);
    const worldDist = worldMaxDim * 2.2;

    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (cam) {
      cam.position.set(worldCenter.x + worldDist, worldCenter.y + worldDist * 0.7, worldCenter.z + worldDist);
      cam.lookAt(worldCenter);
    }
    if (ctrls) {
      ctrls.target.copy(worldCenter);
      ctrls.update();
    }
  }, [mesh]);

  // Update toolpath
  useEffect(() => {
    const group = toolpathGroupRef.current;
    const scene = sceneRef.current;
    if (!group || !scene) return;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.Line).geometry) (child as THREE.Line).geometry.dispose();
      const mat = (child as THREE.Line).material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) (mat as THREE.Material).dispose();
    }

    if (!showToolpath || !toolpath || toolpath.length === 0) return;

    // Compute z range to color layers
    const zValues = toolpath.map((p) => p.z);
    const minZ = Math.min(...zValues);
    const maxZ = Math.max(...zValues);
    const zRange = Math.max(0.001, maxZ - minZ);

    for (const path of toolpath) {
      if (path.points.length < 2) continue;
      const positions: number[] = [];
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i];
        const b = path.points[i + 1];
        positions.push(a.x, a.y, a.z);
        positions.push(b.x, b.y, b.z);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      // Gradient color from cyan (top) to magenta (bottom)
      const t = (path.z - minZ) / zRange;
      const color = new THREE.Color().setHSL(0.55 - t * 0.45, 0.9, 0.6);
      const mat = new THREE.LineBasicMaterial({ color });
      const line = new THREE.LineSegments(geom, mat);
      group.add(line);
    }
  }, [toolpath, showToolpath]);

  return <div ref={mountRef} className="w-full h-full" />;
}
