import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBikeModel, type ShowroomPaint } from "./bike-model";
import { createShowroomStudio } from "./showroom-studio";

export type ShowroomFocus = "hero" | "wheels" | "drivetrain" | "frame";
export type ShowroomMood = "atelier" | "noir" | "glacier";
export interface ShowroomScene {
  setPaint: (paint: ShowroomPaint) => void;
  setRiding: (value: boolean) => void;
  setExploded: (value: boolean) => void;
  setPaused: (value: boolean) => void;
  setFocus: (focus: ShowroomFocus) => void;
  setTour: (value: boolean) => void;
  setMood: (mood: ShowroomMood) => void;
  resetCamera: () => void;
  showSide: () => void;
  dispose: () => void;
}
interface SceneCallbacks {
  onReady: (reducedMotion: boolean) => void;
  onError: (reason: string) => void;
  onPauseChange: (paused: boolean) => void;
  onTourChange?: (playing: boolean) => void;
  onFocusChange?: (focus: ShowroomFocus) => void;
}
const views: Record<ShowroomFocus, { target: [number, number, number]; direction: [number, number, number]; width: number; height: number }> = {
  hero: { target: [0, .98, 0], direction: [1.25, .68, 5.5], width: 3.15, height: 2.02 },
  wheels: { target: [.92, .49, .02], direction: [1.05, .36, 4.2], width: 1.30, height: 1.12 },
  drivetrain: { target: [-.51, .47, .13], direction: [.45, .42, 4.5], width: 1.69, height: 1.0 },
  frame: { target: [.13, 1.04, .01], direction: [.55, .42, 5.2], width: 2.08, height: 1.19 },
};

export function createShowroomScene(host: HTMLElement, callbacks: SceneCallbacks): ShowroomScene {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); }
  catch {
    callbacks.onError("這個瀏覽器未能啟用 3D 顯示，車庫工具仍可正常使用。");
    return { setPaint() {}, setRiding() {}, setExploded() {}, setPaused() {}, setFocus() {}, setTour() {}, setMood() {}, resetCamera() {}, showSide() {}, dispose() {} };
  }
  renderer.domElement.className = "showroom-webgl-canvas";
  renderer.domElement.setAttribute("aria-label", "BIRDY 3 五刀碳輪外型展示。拖曳旋轉，或選取部件靠近細看。");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#101619"); scene.fog = new THREE.FogExp2("#101619", .018);
  const camera = new THREE.PerspectiveCamera(30, 1, .045, 45);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .075;
  controls.enablePan = false; controls.minDistance = 1.1; controls.maxDistance = 13;
  controls.minPolarAngle = Math.PI * .18; controls.maxPolarAngle = Math.PI * .5;
  controls.autoRotateSpeed = .24; controls.rotateSpeed = .6; controls.zoomSpeed = .65;
  const studio = createShowroomStudio(renderer);
  scene.add(studio.root); scene.environment = studio.environment.texture; scene.environmentIntensity = .67;
  const bike = createBikeModel(renderOnce);
  bike.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    // The studio light cards define the curved surfaces; keep cast shadows on
    // the ground while avoiding high-frequency self-shadow artifacts on paint.
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) {
      material.envMap = studio.environment.texture; material.needsUpdate = true;
    }
  });
  const restingBounds = new THREE.Box3().setFromObject(bike.root);
  bike.root.position.y = -.0005 - restingBounds.min.y; scene.add(bike.root);
  let disposed = false, lost = false, visible = true, pageVisible = !document.hidden;
  let riding = false, exploded = false, paused = reducedMotion, userInteracting = false;
  let focus: ShowroomFocus = "hero", tour = false, tourElapsed = 0, tourIndex = 0;
  let frameId = 0, previous = 0, entry = reducedMotion ? 1 : 0;
  let lastInteraction = 0, readyReported = false, framed = false, baseDistance = 5, shadowSettle = 0;
  type Framing = { fromTarget: THREE.Vector3; toTarget: THREE.Vector3; fromDirection: THREE.Vector3; toDirection: THREE.Vector3; fromDistance: number; toDistance: number; elapsed: number; duration: number };
  let transition: Framing | null = null;
  const tourViews: ShowroomFocus[] = ["hero", "wheels", "frame", "drivetrain"];
  function viewTarget() { const point = views[focus].target; return new THREE.Vector3(point[0], point[1] + (exploded ? .19 : 0), point[2]); }
  function fitDistance() {
    const view = views[focus], tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(view.height / (2 * tangent), view.width / (2 * tangent * camera.aspect)) * (focus === "hero" ? 1.10 : 1.08) * (exploded ? 1.25 : 1);
  }
  function flushControls() {
    controls.autoRotate = false;
    const damping = controls.enableDamping; controls.enableDamping = false; controls.update(0); controls.enableDamping = damping;
  }
  function stopTour() { if (tour) { tour = false; callbacks.onTourChange?.(false); } }
  function applyFraming(progress: number) {
    if (!transition) return;
    const eased = progress < .5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    const turn = new THREE.Quaternion().setFromUnitVectors(transition.fromDirection, transition.toDirection);
    const direction = transition.fromDirection.clone().applyQuaternion(new THREE.Quaternion().slerp(turn, eased));
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    camera.position.copy(controls.target).addScaledVector(direction, THREE.MathUtils.lerp(transition.fromDistance, transition.toDistance, eased)); camera.lookAt(controls.target);
  }
  function beginFraming(direction?: THREE.Vector3, duration = 1.5) {
    entry = 1; flushControls(); baseDistance = fitDistance();
    transition = { fromTarget: controls.target.clone(), toTarget: viewTarget(), fromDirection: camera.position.clone().sub(controls.target).normalize(), toDirection: direction?.normalize() ?? new THREE.Vector3(...views[focus].direction).normalize(), fromDistance: camera.position.distanceTo(controls.target), toDistance: baseDistance, elapsed: 0, duration };
    if (paused || reducedMotion) { applyFraming(1); transition = null; controls.update(0); }
    lastInteraction = performance.now(); startLoop();
  }
  function changeFocus(next: ShowroomFocus, tourStep = false) {
    if (!tourStep) stopTour(); focus = next; callbacks.onFocusChange?.(next); beginFraming(undefined, tourStep ? 2.1 : 1.45);
  }
  function frameCamera(preserveView: boolean) {
    const preserve = preserveView && framed && entry >= 1 && !transition;
    const direction = preserve ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...views[focus].direction).normalize();
    const aim = preserve ? controls.target.clone() : viewTarget();
    const zoom = preserve ? camera.position.distanceTo(controls.target) / baseDistance : (entry < 1 ? 1.12 : 1);
    camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight); camera.updateProjectionMatrix();
    baseDistance = fitDistance(); controls.maxDistance = Math.max(13, baseDistance * 1.7);
    transition = null; controls.target.copy(aim); camera.position.copy(aim).addScaledVector(direction, baseDistance * zoom);
    camera.lookAt(aim); controls.update(0); framed = true;
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.35 : 1.8));
    renderer.setSize(width, height, false); frameCamera(true); renderOnce();
  }
  function renderOnce() { if (!disposed && !lost && visible && pageVisible) renderer.render(scene, camera); }
  function startLoop() { if (!frameId && !disposed && !lost && visible && pageVisible) frameId = requestAnimationFrame(animate); }
  function stopLoop() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; previous = 0; }
  function animate(timestamp: number) {
    frameId = 0;
    if (disposed || lost || !visible || !pageVisible) return;
    const delta = previous ? Math.min((timestamp - previous) / 1000, .05) : 0; previous = timestamp;
    if (entry < 1 && !paused && !userInteracting) {
      entry = Math.min(1, entry + delta / 2);
      const eased = 1 - Math.pow(1 - entry, 3);
      camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(...views.hero.direction).normalize(), baseDistance * (1.12 - eased * .12));
    }
    if (tour && !paused && !userInteracting) {
      tourElapsed += delta;
      if (tourElapsed >= 6.2) { tourElapsed = 0; tourIndex = (tourIndex + 1) % tourViews.length; changeFocus(tourViews[tourIndex], true); }
      if (!transition) {
        const direction = new THREE.Vector3(...views[focus].direction).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(Math.max(0, tourElapsed - 2.1) / 4.1 * Math.PI / 2) * .1);
        camera.position.copy(controls.target).addScaledVector(direction, baseDistance);
      }
    }
    if (transition && !paused && !userInteracting) {
      transition.elapsed = Math.min(transition.duration, transition.elapsed + delta);
      applyFraming(transition.elapsed / transition.duration);
      if (transition.elapsed >= transition.duration) transition = null;
    }
    controls.autoRotate = !paused && !reducedMotion && !tour && focus === "hero" && entry >= 1 && !exploded && !transition && !userInteracting && timestamp - lastInteraction > 3200;
    const controlsChanged = controls.update(delta);
    bike.update(paused ? 0 : delta, !paused && riding, exploded, reducedMotion);
    shadowSettle = Math.max(0, shadowSettle - delta);
    if ((!paused && riding) || shadowSettle > 0) renderer.shadowMap.needsUpdate = true;
    studio.update(paused ? 0 : delta); renderer.render(scene, camera);
    if (!readyReported) { readyReported = true; callbacks.onReady(reducedMotion); }
    if (!paused || controlsChanged || userInteracting) startLoop();
  }
  function onControlStart() { stopTour(); userInteracting = true; entry = 1; transition = null; lastInteraction = performance.now(); startLoop(); }
  function onControlEnd() { userInteracting = false; lastInteraction = performance.now(); }
  controls.addEventListener("start", onControlStart); controls.addEventListener("end", onControlEnd);
  function onVisibility() { pageVisible = !document.hidden; if (pageVisible) startLoop(); else stopLoop(); }
  document.addEventListener("visibilitychange", onVisibility);
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; if (visible) startLoop(); else stopLoop(); }, { rootMargin: "80px" }); observer.observe(host);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) { paused = true; entry = 1; stopTour(); if (transition) { applyFraming(1); transition = null; } bike.update(0, false, exploded, true); callbacks.onPauseChange(true); }
    startLoop();
  }
  motionQuery.addEventListener("change", onMotionChange);
  function onContextLost(event: Event) { event.preventDefault(); lost = true; stopLoop(); callbacks.onError("3D 顯示已中斷。你可以重新載入展示，車庫工具仍可正常使用。"); }
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  frameCamera(false); resize(); startLoop();
  return {
    setPaint(value) { bike.setPaint(value); renderOnce(); },
    setMood(value) {
      studio.setMood(value);
      const color = value === "noir" ? "#080c10" : value === "glacier" ? "#111c25" : "#101619";
      scene.background = new THREE.Color(color); if (scene.fog instanceof THREE.FogExp2) scene.fog.color.set(color);
      renderer.toneMappingExposure = value === "noir" ? .94 : value === "glacier" ? 1.04 : 1.0; renderOnce(); startLoop();
    },
    setFocus(value) { if (exploded) { exploded = false; bike.update(0, false, false, true); } changeFocus(value); },
    setTour(value) {
      tour = value; callbacks.onTourChange?.(value);
      if (value) { riding = false; exploded = false; bike.update(0, false, false, true); renderer.shadowMap.needsUpdate = true; paused = false; callbacks.onPauseChange(false); tourElapsed = 0; tourIndex = 0; changeFocus("hero", true); } startLoop();
    },
    setRiding(value) { stopTour(); riding = value; startLoop(); },
    setExploded(value) {
      stopTour(); if (value !== exploded) { exploded = value; shadowSettle = 2.5; renderer.shadowMap.needsUpdate = true; focus = "hero"; callbacks.onFocusChange?.("hero"); beginFraming(); }
      if (paused || reducedMotion) bike.update(0, false, value, true); startLoop();
    },
    setPaused(value) { paused = value; if (paused && transition) { applyFraming(1); transition = null; } startLoop(); },
    resetCamera() { stopTour(); focus = "hero"; callbacks.onFocusChange?.("hero"); beginFraming(); renderOnce(); },
    showSide() { stopTour(); focus = "hero"; callbacks.onFocusChange?.("hero"); paused = true; callbacks.onPauseChange(true); beginFraming(new THREE.Vector3(0, 0, 1)); renderOnce(); },
    dispose() {
      if (disposed) return; disposed = true; stopLoop();
      resizeObserver.disconnect(); observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); motionQuery.removeEventListener("change", onMotionChange);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost); controls.removeEventListener("start", onControlStart); controls.removeEventListener("end", onControlEnd); controls.dispose();
      bike.dispose(); studio.dispose(); scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
