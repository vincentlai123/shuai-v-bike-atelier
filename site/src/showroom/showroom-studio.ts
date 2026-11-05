import * as THREE from "three";

export type ShowroomMood = "atelier" | "noir" | "glacier";

export interface ShowroomStudio {
  root: THREE.Group;
  environment: THREE.WebGLRenderTarget;
  setMood: (mood: ShowroomMood) => void;
  update: (delta: number) => void;
  dispose: () => void;
}

const moods = {
  atelier: { floor: "#20282b", key: "#fff0dc", rim: "#c9e9ee", fill: "#ebf0f2", strip: "#9db6b6", keyPower: 3.1, rimPower: 2.8, fillPower: 1.25, ambient: .52, stripOpacity: .28 },
  noir: { floor: "#10171b", key: "#f6e7d5", rim: "#a6d9e6", fill: "#c1d5df", strip: "#88b5c0", keyPower: 2.6, rimPower: 3.7, fillPower: .82, ambient: .32, stripOpacity: .36 },
  glacier: { floor: "#303b40", key: "#e2f3ff", rim: "#d5e9f5", fill: "#fff6e8", strip: "#c6e7ee", keyPower: 3.2, rimPower: 2.9, fillPower: 1.45, ambient: .68, stripOpacity: .24 },
} as const;

/** A seamless product-photography studio, with no browser-only asset loading. */
export function createShowroomStudio(renderer: THREE.WebGLRenderer): ShowroomStudio {
  const root = new THREE.Group(); root.name = "BIRDY charcoal photographic studio";
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let disposed = false;

  // Large bright cards produce long, clean reflections on the sculpted frame
  // and moulded carbon blades. They live only in the image-based light rig.
  const environmentScene = new THREE.Scene();
  environmentScene.background = new THREE.Color("#161d22");
  const environmentGeometries: THREE.BufferGeometry[] = [];
  const environmentMaterials: THREE.Material[] = [];
  function softbox(width: number, height: number, position: THREE.Vector3, color: string, power: number) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide });
    environmentGeometries.push(geometry); environmentMaterials.push(material);
    const lightCard = new THREE.Mesh(geometry, material); lightCard.position.copy(position); lightCard.lookAt(0, 1, 0); environmentScene.add(lightCard);
  }
  softbox(5.4, 3.2, new THREE.Vector3(-2.7, 5.2, 3.4), "#fff4e4", 5.2);
  softbox(1.8, 4.6, new THREE.Vector3(3.8, 2.5, -2.3), "#c5e6f1", 4.1);
  softbox(5.8, .7, new THREE.Vector3(.3, 4.5, -3.5), "#eefaff", 3.8);
  softbox(2.4, 3.0, new THREE.Vector3(-4.2, 1.8, -.5), "#d1dbe5", 1.3);
  softbox(1.8, 2.5, new THREE.Vector3(.5, 2, 5.5), "#ffffff", .65);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, .045, .1, 40);
  pmrem.dispose();
  environmentGeometries.forEach(geometry => geometry.dispose());
  environmentMaterials.forEach(material => material.dispose()); environmentScene.clear();

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry); materials.add(material);
    const object = new THREE.Mesh(geometry, material); root.add(object); return object;
  }

  // One continuous curved sweep removes the hard horizon behind the bicycle.
  const sweep: Array<[number, number]> = [[-.012, 24], [-.012, -3.2]];
  for (let index = 1; index <= 40; index++) {
    const angle = index / 40 * Math.PI / 2;
    sweep.push([3 - Math.cos(angle) * 3 - .012, -3.2 - Math.sin(angle) * 3]);
  }
  sweep.push([6, -6.2], [10, -6.2], [16, -6.2]);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const across = 12;
  for (let row = 0; row < sweep.length; row++) {
    const [y, z] = sweep[row];
    for (let column = 0; column <= across; column++) {
      positions.push(-24 + column / across * 48, y, z);
      uvs.push(column / across, row / (sweep.length - 1));
    }
  }
  for (let row = 0; row < sweep.length - 1; row++) for (let column = 0; column < across; column++) {
    const a = row * (across + 1) + column, b = a + 1, c = a + across + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const sweepGeometry = new THREE.BufferGeometry();
  sweepGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  sweepGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  sweepGeometry.setIndex(indices); sweepGeometry.computeVertexNormals(); sweepGeometry.computeBoundingSphere();
  const floorMaterial = new THREE.MeshPhysicalMaterial({ color: moods.atelier.floor, metalness: .12, roughness: .66, clearcoat: .18, clearcoatRoughness: .54, envMap: environment.texture, envMapIntensity: .13 });
  const floor = mesh(sweepGeometry, floorMaterial); floor.name = "Seamless charcoal cyclorama"; floor.receiveShadow = false;
  // Keep cast shadows subtle and separate from the sweep's lighting: the
  // contact patches provide tire weight while this layer suggests depth.
  const castShadowMaterial = new THREE.ShadowMaterial({ color: "#060a0d", opacity: .21, depthWrite: false });
  const castShadow = mesh(new THREE.PlaneGeometry(12, 12), castShadowMaterial);
  castShadow.name = "Soft studio cast-shadow layer"; castShadow.rotation.x = -Math.PI / 2;
  castShadow.position.y = -.0105; castShadow.receiveShadow = true;

  // A quiet architectural reveal lies behind the subject, instead of a neon
  // turntable. The channel and emissive insert are narrow in actual geometry.
  const channelMaterial = new THREE.MeshStandardMaterial({ color: "#080e12", metalness: .5, roughness: .4, envMap: environment.texture, envMapIntensity: .12 });
  const channel = mesh(new THREE.BoxGeometry(8.2, .011, .024), channelMaterial); channel.position.set(0, .002, -2.65);
  const stripMaterial = new THREE.MeshBasicMaterial({ color: moods.atelier.strip, transparent: true, opacity: moods.atelier.stripOpacity, depthWrite: false, toneMapped: false });
  const strip = mesh(new THREE.PlaneGeometry(7.9, .005), stripMaterial); strip.rotation.x = -Math.PI / 2; strip.position.set(0, .009, -2.65);

  const hemisphere = new THREE.HemisphereLight("#d8e5eb", "#141b22", moods.atelier.ambient); root.add(hemisphere);
  const key = new THREE.DirectionalLight(moods.atelier.key, moods.atelier.keyPower); key.position.set(-2.4, 5.7, 4.4); key.target.position.set(0, .8, 0); root.add(key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 3.3, bottom: -2.3, near: .5, far: 15 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias = .018; key.shadow.bias = -.00012; key.shadow.radius = 5; key.shadow.blurSamples = 8;
  const rim = new THREE.DirectionalLight(moods.atelier.rim, moods.atelier.rimPower); rim.position.set(3.5, 3.6, -3); root.add(rim);
  const fill = new THREE.DirectionalLight(moods.atelier.fill, moods.atelier.fillPower); fill.position.set(-3.8, 1.9, 4); root.add(fill);
  const ceiling = new THREE.DirectionalLight("#e2e7e8", .55); ceiling.position.set(.1, 5, -.5); root.add(ceiling);

  // Low-opacity, elongated contact shading is independent of the frame's
  // cast shadow, so the two tires remain visually grounded at shallow angles.
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5 - size / 2) / (size / 2), ny = (y + .5 - size / 2) / (size / 2);
    const distance = Math.sqrt(nx * nx + ny * ny), alpha = Math.pow(Math.max(0, 1 - distance), 2) * .48;
    const index = (y * size + x) * 4; pixels[index + 3] = Math.round(alpha * 255);
  }
  const shadowTexture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat); shadowTexture.needsUpdate = true; shadowTexture.magFilter = THREE.LinearFilter; shadowTexture.minFilter = THREE.LinearFilter; textures.add(shadowTexture);
  const contactMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false });
  const contact = mesh(new THREE.PlaneGeometry(3.35, 1.0), contactMaterial); contact.rotation.x = -Math.PI / 2; contact.position.y = -.009;
  const tireContactMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .75, depthWrite: false, toneMapped: false });
  for (const x of [-.98, .98]) {
    const tireContact = mesh(new THREE.PlaneGeometry(.5, .34), tireContactMaterial); tireContact.rotation.x = -Math.PI / 2; tireContact.position.set(x, -.008, 0);
  }

  let mood: ShowroomMood = "atelier";
  const scratchColor = new THREE.Color();
  return {
    root, environment,
    setMood(value) { mood = value; },
    update(delta) {
      if (disposed) return;
      const blend = delta <= 0 ? 1 : 1 - Math.exp(-Math.min(delta, .1) * 4.5), desired = moods[mood];
      floorMaterial.color.lerp(scratchColor.set(desired.floor), blend);
      key.color.lerp(scratchColor.set(desired.key), blend); key.intensity = THREE.MathUtils.lerp(key.intensity, desired.keyPower, blend);
      rim.color.lerp(scratchColor.set(desired.rim), blend); rim.intensity = THREE.MathUtils.lerp(rim.intensity, desired.rimPower, blend);
      fill.color.lerp(scratchColor.set(desired.fill), blend); fill.intensity = THREE.MathUtils.lerp(fill.intensity, desired.fillPower, blend);
      hemisphere.intensity = THREE.MathUtils.lerp(hemisphere.intensity, desired.ambient, blend);
      stripMaterial.color.lerp(scratchColor.set(desired.strip), blend); stripMaterial.opacity = THREE.MathUtils.lerp(stripMaterial.opacity, desired.stripOpacity, blend);
    },
    dispose() {
      if (disposed) return; disposed = true;
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
      key.shadow.dispose(); environment.dispose(); root.clear();
    },
  };
}
