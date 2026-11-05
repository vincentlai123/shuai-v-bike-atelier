import * as THREE from "three";
import { birdyFrameSurfaceDepth, createBirdyForgedBladeGeometry, createBirdyFrameGeometry, createBirdyFrameWeldGeometry, createBirdyLeadingLinkGeometry } from "./birdy-frame-geometry";
import { createBirdyRotorGeometry, createBirdySaddleGeometry } from "./birdy-detail-parts";
import { createBirdyCarbonRimGeometry, createBirdyFiveBladeGeometry } from "./birdy-carbon-wheel";

export type ShowroomPaint = "emerald" | "pearl" | "graphite";
export const showroomPaints: Record<ShowroomPaint, string> = { emerald: "#126449", pearl: "#eeeae1", graphite: "#34414a" };
type V3 = readonly [number, number, number];
type PixelPoint = readonly [number, number];

export interface BikeModel {
  root: THREE.Group;
  setPaint: (paint: ShowroomPaint) => void;
  update: (delta: number, riding: boolean, exploded: boolean, immediate?: boolean) => void;
  dispose: () => void;
}

/** The silhouette follows the owner's BIRDY 3 reference photograph; this is a visual model, not a dimensional specification. */
export function createBikeModel(onVisualChange?: () => void): BikeModel {
  const root = new THREE.Group(); root.name = "BIRDY 3 reference study";
  let disposed = false;
  // Photograph anchors: rear axle (116,438), front axle (523,438), bottom bracket (281,416).
  const scale = 1.96 / 407;
  const xy = (x: number, y: number): [number, number] => [(x - 319.5) * scale, (532 - y) * scale];
  const p = (x: number, y: number, z = 0): V3 => [...xy(x, y), z];
  const paint = new THREE.MeshPhysicalMaterial({ color: showroomPaints.pearl, metalness: .12, roughness: .35, clearcoat: .85, clearcoatRoughness: .28, reflectivity: .48, envMapIntensity: .85 });
  const weldPaint = new THREE.MeshPhysicalMaterial({ color: showroomPaints.pearl, metalness: .12, roughness: .34, clearcoat: .7, clearcoatRoughness: .22 });
  const silver = new THREE.MeshStandardMaterial({ color: "#b7bfbd", metalness: .94, roughness: .29 });
  const polished = new THREE.MeshStandardMaterial({ color: "#d0d6d4", metalness: 1, roughness: .2 });
  const blackMetal = new THREE.MeshPhysicalMaterial({ color: "#252c31", metalness: .68, roughness: .33, clearcoat: .25, clearcoatRoughness: .3 });
  const matteBlack = new THREE.MeshStandardMaterial({ color: "#20262a", metalness: .22, roughness: .5 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#101313", roughness: .88 });
  const sidewall = new THREE.MeshStandardMaterial({ color: "#262a28", roughness: .82 });
  const red = new THREE.MeshStandardMaterial({ color: "#b52d32", metalness: .2, roughness: .46 });
  const yellow = new THREE.MeshStandardMaterial({ color: "#d5ca48", metalness: .45, roughness: .32 });
  const saddleMat = new THREE.MeshStandardMaterial({ color: "#13191b", roughness: .72 });
  const chainMat = new THREE.MeshStandardMaterial({ color: "#8d999c", metalness: .95, roughness: .3, transparent: true });
  const seamMat = new THREE.LineBasicMaterial({ color: "#53605f" });
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>([paint, weldPaint, silver, polished, blackMetal, matteBlack, rubber, sidewall, red, yellow, saddleMat, chainMat, seamMat]);
  const textures = new Set<THREE.Texture>();
  // Moulded 2/2 twill: restrained colour, crossing tow normals and resin roughness.
  // All three maps are data textures, so model construction stays safe during SSR.
  const weaveSize = 128, weavePixels = new Uint8Array(weaveSize * weaveSize * 4);
  const weaveNormals = new Uint8Array(weaveSize * weaveSize * 4), weaveRoughness = new Uint8Array(weaveSize * weaveSize * 4);
  for (let y = 0; y < weaveSize; y++) for (let x = 0; x < weaveSize; x++) {
    const warp = ((Math.floor(x / 8) - Math.floor(y / 8) + 32) % 4) < 2;
    const across = (warp ? x : y) % 8, along = warp ? y : x;
    const towCrown = Math.sin((across + .5) / 8 * Math.PI);
    const fiber = Math.sin(across * 2.3) * 2 + Math.cos(along * .8) * 2;
    const value = Math.round(161 + towCrown * 23 + (warp ? 4 : -4) + fiber), index = (y * weaveSize + x) * 4;
    weavePixels.set([value, value + 3, value + 5, 255], index);
    const slope = Math.cos((across + .5) / 8 * Math.PI) * 23;
    weaveNormals.set([128 + (warp ? slope : 0), 128 + (warp ? 0 : slope), 253, 255], index);
    const roughness = Math.round(178 + (warp ? 8 : -8) - towCrown * 10);
    weaveRoughness.set([roughness, roughness, roughness, 255], index);
  }
  function weaveTexture(data: Uint8Array, srgb = false) {
    const texture = new THREE.DataTexture(data, weaveSize, weaveSize, THREE.RGBAFormat);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 8); texture.anisotropy = 8;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true; textures.add(texture); return texture;
  }
  const carbon = new THREE.MeshPhysicalMaterial({ color: "#242a2d", map: weaveTexture(weavePixels, true), normalMap: weaveTexture(weaveNormals), normalScale: new THREE.Vector2(.22, .22), roughnessMap: weaveTexture(weaveRoughness), metalness: .08, roughness: .5, clearcoat: .8, clearcoatRoughness: .23, envMapIntensity: .9 });
  materials.add(carbon);
  const up = new THREE.Vector3(0, 1, 0);

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = root, position?: V3) {
    geometries.add(geometry); geometry.computeBoundingSphere();
    const object = new THREE.Mesh(geometry, material); object.castShadow = (geometry.boundingSphere?.radius ?? 0) > .13; object.receiveShadow = true;
    if (position) object.position.set(...position); parent.add(object); return object;
  }
  function rod(a: V3, b: V3, radius: number, material: THREE.Material, parent: THREE.Object3D = root, endRadius = radius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const object = mesh(new THREE.CylinderGeometry(endRadius, radius, start.distanceTo(end), 16), material, parent);
    object.position.copy(start).lerp(end, .5); object.quaternion.setFromUnitVectors(up, end.sub(start).normalize()); return object;
  }
  function tube(points: V3[], radius: number, material: THREE.Material, parent: THREE.Object3D = root, segments = 32) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), segments, radius, 9, false), material, parent);
  }
  function tubePx(points: PixelPoint[], z: number, radius: number, material: THREE.Material, parent: THREE.Object3D = root) {
    return tube(points.map(point => p(point[0], point[1], z)), radius, material, parent);
  }
  function axle(position: V3, radius: number, length: number, material: THREE.Material, parent: THREE.Object3D = root) {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material, parent, position); object.rotation.x = Math.PI / 2; return object;
  }
  function ring(radius: number, thickness: number, position: V3, material: THREE.Material, parent: THREE.Object3D = root) {
    return mesh(new THREE.TorusGeometry(radius, thickness, 7, 96), material, parent, position);
  }
  function spring(start: V3, end: V3, radius: number) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), axis = b.clone().sub(a).normalize();
    const normal = new THREE.Vector3(0, 0, 1).cross(axis).normalize(), binormal = axis.clone().cross(normal).normalize();
    const points = Array.from({ length: 151 }, (_, index) => {
      const t = index / 150, angle = t * Math.PI * 18, taper = Math.min(1, t * 20, (1 - t) * 20);
      return a.clone().lerp(b, t).addScaledVector(normal, Math.cos(angle) * radius * taper).addScaledVector(binormal, Math.sin(angle) * radius * taper);
    });
    rod(start, end, .012, polished);
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 150, .0065, 7), matteBlack);
  }

  function brakeRotor(parent: THREE.Object3D, z: number) {
    mesh(createBirdyRotorGeometry(), silver, parent, [0, 0, z]);
    for (let index = 0; index < 6; index++) { const angle = index / 6 * Math.PI * 2; axle([Math.cos(angle) * .026, Math.sin(angle) * .026, z + .0025], .004, .005, blackMetal, parent); }
  }

  // Five sculpted carbon blades and a deep carbon rim; retain the BIRDY's small-wheel tire envelope.
  const tireProfile = [[.382, -.017], [.393, -.025], [.409, -.029], [.421, -.023], [.426, -.012], [.428, 0], [.426, .012], [.421, .023], [.409, .029], [.393, .025], [.382, .017], [.382, -.017]].map(([x, y]) => new THREE.Vector2(x, y));
  const carbonRimGeometry = createBirdyCarbonRimGeometry(), carbonBladeGeometry = createBirdyFiveBladeGeometry();
  function wheel(name: string, pixelX: number) {
    const group = new THREE.Group(); group.name = name; group.position.set(...p(pixelX, 438)); root.add(group);
    const spinning = new THREE.Group(); group.add(spinning);
    const tire = mesh(new THREE.LatheGeometry(tireProfile, 112), rubber, spinning); tire.rotation.x = Math.PI / 2;
    const rim = mesh(carbonRimGeometry, carbon, spinning); rim.name = "Deep-section carbon rim";
    const blades = mesh(carbonBladeGeometry, carbon, spinning); blades.name = "Five sculpted carbon blades";
    for (const z of [-.022, .022]) {
      ring(.383, .0014, [0, 0, z], blackMetal, spinning);
      ring(.409, .0013, [0, 0, z * 1.26], sidewall, spinning);
      axle([0, 0, z * 1.6], .042, .009, blackMetal, spinning);
    }
    axle([0, 0, 0], .023, .105, polished, spinning); axle([0, 0, .064], .012, .018, blackMetal, spinning);
    // A compact black valve inside the rim, clear of the carbon blades and tire.
    const valveAngle = .43;
    rod([Math.cos(valveAngle) * .314, Math.sin(valveAngle) * .314, 0], [Math.cos(valveAngle) * .337, Math.sin(valveAngle) * .337, 0], .004, blackMetal, spinning);
    const treadGeometry = new THREE.BoxGeometry(.009, .0015, .010); geometries.add(treadGeometry);
    const tread = new THREE.InstancedMesh(treadGeometry, sidewall, 128), dummy = new THREE.Object3D();
    for (let index = 0; index < 128; index++) {
      const angle = Math.floor(index / 2) / 64 * Math.PI * 2; dummy.position.set(Math.cos(angle) * .427, Math.sin(angle) * .427, index % 2 ? .015 : -.015); dummy.rotation.set(0, index % 2 ? .35 : -.35, angle - Math.PI / 2); dummy.updateMatrix(); tread.setMatrixAt(index, dummy.matrix);
    }
    spinning.add(tread); brakeRotor(spinning, pixelX > 300 ? .059 : -.057);
    return { group, spinning, original: group.position.clone() };
  }
  const rear = wheel("BIRDY rear wheel", 116), front = wheel("BIRDY front wheel", 523);

  // A shared-vertex sculpted shell: continuously crowned sides and rolled, genuinely open aperture lips.
  const monocoque = mesh(createBirdyFrameGeometry(), paint); monocoque.name = 'Sculpted BIRDY monocoque';
  const weld = mesh(createBirdyFrameWeldGeometry(), weldPaint); weld.castShadow = false;
  rod(p(278, 386), p(281, 416), .035, paint);
  rod(p(225, 287), p(240, 333), .032, paint, root, .037);
  for (const z of [-.066, .066]) {
    // Tiny pivot hardware and the photograph's organic shoulder detail.
    const first = p(239, 300), second = p(301, 338), side = Math.sign(z);
    axle(p(239, 300, side * (birdyFrameSurfaceDepth(first[0], first[1]) + .002)), .010, .008, blackMetal);
    axle(p(301, 338, side * (birdyFrameSurfaceDepth(second[0], second[1]) + .002)), .008, .007, silver);
  }
  rod(p(470, 280), p(481, 315), .034, paint);
  rod(p(467, 273), p(470, 284), .036, silver);
  rod(p(480, 311), p(482, 322), .033, blackMetal);
  // Pearl rear swingarm: two low triangular stays, with a short red elastomer at the upper pivot.
  for (const z of [-.068, .068]) {
    mesh(createBirdyForgedBladeGeometry([[116, 438], [154, 407], [198, 379], [232, 360], [242, 365]], .042, .029), paint, root, [0, 0, z]);
    mesh(createBirdyForgedBladeGeometry([[116, 438], [169, 423], [213, 402], [259, 382]], .029, .025), paint, root, [0, 0, z]);
    rod(p(232, 360, z), p(259, 382, z), .020, paint);
    axle(p(117, 438, z * 1.15), .016, .018, polished);
  }
  rod(p(227, 347), p(239, 366), .027, red);
  rod(p(225, 345), p(228, 350), .03, blackMetal);
  rod(p(238, 363), p(241, 368), .03, silver);
  axle(p(241, 366, .084), .018, .017, polished);
  tubePx([[246, 359], [272, 354], [299, 345]], .073, .0035, matteBlack);

  // BIRDY's characteristic leading-link front suspension: two narrow blades, four-bar bottom link and diagonal black spring.
  for (const z of [-.066, .066]) {
    mesh(createBirdyForgedBladeGeometry([[480, 317], [474, 352], [466, 393], [456, 439]], .041, .031), paint, root, [0, 0, z]);
    mesh(createBirdyForgedBladeGeometry([[531, 335], [529, 365], [522, 405], [518, 427]], .037, .029), paint, root, [0, 0, z]);
    mesh(createBirdyLeadingLinkGeometry(), paint, root, [0, 0, z]);
    axle(p(458, 440, z * 1.21), .016, .014, blackMetal);
    axle(p(516, 428, z * 1.21), .013, .014, blackMetal);
    axle(p(523, 438, z * 1.35), .018, .018, polished);
  }
  spring(p(490, 319, .012), p(530, 334, .012), .022);
  rod(p(526, 332, .012), p(532, 334, .012), .026, yellow);
  rod(p(486, 317, .012), p(491, 319, .012), .027, blackMetal);
  rod(p(477, 314, -.066), p(477, 314, .066), .018, paint);
  axle(p(503, 421, .081), .025, .028, red);
  axle(p(108, 407, -.079), .021, .026, red);
  const caliper = mesh(new THREE.BoxGeometry(.055, .07, .035), blackMetal, root, p(502, 420, .069)); caliper.rotation.z = -.45;

  const seat = new THREE.Group(); seat.name = "Long black seatpost and saddle"; root.add(seat);
  rod(p(225, 283), p(183, 155), .022, matteBlack, seat);
  rod(p(224, 280), p(227, 288), .034, blackMetal, seat);
  axle(p(224, 282, .043), .010, .055, blackMetal, seat);
  rod(p(211, 285, .041), p(234, 278, .041), .006, silver, seat);
  for (const z of [-.035, .035]) tubePx([[177, 156], [197, 157], [220, 153]], z, .006, silver, seat);
  const saddle = mesh(createBirdySaddleGeometry(), saddleMat, seat, p(190, 140));
  saddle.rotation.z = -.015;
  const cockpit = new THREE.Group(); cockpit.name = "BIRDY folding handlepost"; root.add(cockpit);
  rod(p(463, 268), p(452, 165), .026, blackMetal, cockpit);
  rod(p(462, 267), p(459, 246), .032, matteBlack, cockpit);
  rod(p(456, 207, .029), p(451, 169, .029), .003, silver, cockpit);
  axle(p(461, 263, .044), .012, .05, silver, cockpit);
  rod(p(449, 266, .05), p(473, 260, .05), .008, blackMetal, cockpit);
  rod(p(452, 166), p(447, 146), .027, blackMetal, cockpit);
  tube([p(447, 146, -.32), p(443, 147, -.20), p(443, 147, .20), p(447, 146, .32)], .016, blackMetal, cockpit);
  for (const sign of [-1, 1]) {
    rod(p(445, 146, sign * .20), p(447, 146, sign * .35), .024, rubber, cockpit);
    axle(p(447, 146, sign * .355), .021, .009, silver, cockpit);
    axle(p(443, 147, sign * .185), .023, .012, blackMetal, cockpit);
    tube([p(446, 148, sign * .19), p(460, 157, sign * .18), p(463, 166, sign * .24)], .006, blackMetal, cockpit, 20);
  }
  tubePx([[455, 150], [495, 184], [519, 234], [506, 284], [488, 318], [501, 415]], .083, .0045, rubber);
  tubePx([[449, 155], [489, 182], [509, 239], [488, 294], [421, 323], [282, 365], [111, 409]], -.08, .004, rubber);

  // Open-spider cassette: six genuine relief windows leave separate outer tooth rings,
  // rather than a stack of solid discs that closes up under a close camera.
  const cassette = new THREE.Group(); rear.spinning.add(cassette); cassette.position.set(0, 0, .079);
  cassette.name = "Twelve-speed cassette with open six-arm spider";
  for (let index = 0; index < 12; index++) {
    const r = .126 - index * .0077, shape = new THREE.Shape(), teeth = 18 + Math.round(r * 100);
    for (let tooth = 0; tooth <= teeth * 2; tooth++) { const a = tooth / (teeth * 2) * Math.PI * 2, radius = r + (tooth % 2 ? 0 : .004); if (!tooth) shape.moveTo(Math.cos(a) * radius, Math.sin(a) * radius); else shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); }
    const center = new THREE.Path(); center.absarc(0, 0, .021, 0, Math.PI * 2, true); shape.holes.push(center);
    if (r > .066) for (let windowIndex = 0; windowIndex < 6; windowIndex++) {
      const a0 = windowIndex / 6 * Math.PI * 2 + .14;
      const a1 = (windowIndex + 1) / 6 * Math.PI * 2 - .14;
      const innerR = .031, outerR = r - .013;
      const relief = new THREE.Path();
      relief.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
      relief.absarc(0, 0, innerR, a0, a1, false);
      relief.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      relief.absarc(0, 0, outerR, a1, a0, true); relief.closePath(); shape.holes.push(relief);
    }
    const cog = mesh(new THREE.ExtrudeGeometry(shape, { depth: .0025, bevelEnabled: true, bevelThickness: .00045, bevelSize: .00045, bevelSegments: 1, curveSegments: 12 }), index < 2 ? blackMetal : silver, cassette, [0, 0, index * .004]);
    cog.name = `Cassette cog ${index + 1}${r > .066 ? " with six relief windows" : ""}`;
  }
  axle([0, 0, .053], .024, .007, blackMetal, cassette);
  const crank = new THREE.Group(); crank.position.set(...p(281, 416, .137)); root.add(crank);
  const ringShape = new THREE.Shape();
  for (let tooth = 0; tooth <= 112; tooth++) { const a = tooth / 112 * Math.PI * 2, r = tooth % 2 ? .214 : .22; if (!tooth) ringShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ringShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  const center = new THREE.Path(); center.absarc(0, 0, .179, 0, Math.PI * 2, true); ringShape.holes.push(center);
  mesh(new THREE.ExtrudeGeometry(ringShape, { depth: .009, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 1 }), blackMetal, crank);
  ring(.207, .003, [0, 0, .011], matteBlack, crank);
  for (let index = 0; index < 5; index++) {
    const angle = index / 5 * Math.PI * 2 + .3;
    const arm = new THREE.Shape();
    arm.moveTo(Math.cos(angle) * .038, Math.sin(angle) * .038);
    arm.bezierCurveTo(Math.cos(angle + .1) * .1, Math.sin(angle + .1) * .1, Math.cos(angle + .2) * .15, Math.sin(angle + .2) * .15, Math.cos(angle + .24) * .19, Math.sin(angle + .24) * .19);
    arm.lineTo(Math.cos(angle + .57) * .19, Math.sin(angle + .57) * .19);
    arm.bezierCurveTo(Math.cos(angle + .64) * .14, Math.sin(angle + .64) * .14, Math.cos(angle + .76) * .09, Math.sin(angle + .76) * .09, Math.cos(angle + .82) * .038, Math.sin(angle + .82) * .038); arm.closePath();
    mesh(new THREE.ExtrudeGeometry(arm, { depth: .011, bevelEnabled: true, bevelThickness: .002, bevelSize: .002, bevelSegments: 1 }), blackMetal, crank);
    axle([Math.cos(angle + .35) * .154, Math.sin(angle + .35) * .154, .016], .007, .005, silver, crank);
  }
  axle([0, 0, .012], .044, .02, blackMetal, crank); axle([0, 0, .029], .015, .012, silver, crank);
  const pedals: THREE.Group[] = [];
  for (const sign of [-1, 1]) {
    const z = sign > 0 ? .025 : -.245, armX = sign * .20, armY = sign * .085;
    rod([0, 0, z], [armX, armY, z], .017, blackMetal, crank, .013);
    axle([armX, armY, z + sign * .022], .009, .06, silver, crank);
    const pedal = new THREE.Group(); pedal.position.set(armX, armY, z + sign * .055); crank.add(pedal); pedals.push(pedal);
    // Open cage pedals, with real gaps between the perimeter rails and grip bars.
    for (const side of [-1, 1]) {
      rod([-.054, 0, side * .042], [.054, 0, side * .042], .0045, blackMetal, pedal);
      rod([side * .054, 0, -.042], [side * .054, 0, .042], .0045, blackMetal, pedal);
    }
    for (const x of [-.032, 0, .032]) rod([x, 0, -.041], [x, 0, .041], .0038, blackMetal, pedal);
    rod([0, 0, -.04], [0, 0, .04], .009, blackMetal, pedal);
    const pinGeometry = new THREE.BoxGeometry(.004, .006, .006); geometries.add(pinGeometry);
    const pins = new THREE.InstancedMesh(pinGeometry, silver, 8), pinDummy = new THREE.Object3D();
    for (let index = 0; index < 8; index++) { pinDummy.position.set((index % 4 - 1.5) * .027, .006, index < 4 ? -.041 : .041); pinDummy.updateMatrix(); pins.setMatrixAt(index, pinDummy.matrix); }
    pedal.add(pins);
  }
  // Rear derailleur: hanger, parallelogram, separate guide/tension pulleys and twin open cage plates.
  rod(p(115, 442, .135), p(118, 451, .15), .016, blackMetal);
  mesh(createBirdyForgedBladeGeometry([[118, 449], [128, 455], [138, 462]], .045, .028), blackMetal, root, [0, 0, .152]);
  rod(p(119, 452, .169), p(135, 462, .169), .008, silver);
  rod(p(116, 459, .169), p(132, 470, .169), .008, blackMetal);
  axle(p(118, 451, .174), .014, .012, silver); axle(p(136, 464, .174), .013, .012, silver);
  for (const z of [.139, .164]) tubePx([[133, 466], [132, 477], [119, 496]], z, .008, blackMetal);
  function pulley(pixelX: number, pixelY: number, radius: number) {
    const shape = new THREE.Shape();
    for (let tooth = 0; tooth <= 24; tooth++) { const a = tooth / 24 * Math.PI * 2, r = tooth % 2 ? radius * .85 : radius; if (!tooth) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    const center = new THREE.Path(); center.absarc(0, 0, radius * .28, 0, Math.PI * 2, true); shape.holes.push(center);
    mesh(new THREE.ExtrudeGeometry(shape, { depth: .007, bevelEnabled: false }), blackMetal, root, p(pixelX, pixelY, .148));
    axle(p(pixelX, pixelY, .164), radius * .35, .010, silver);
  }
  pulley(129, 473, .027); pulley(119, 496, .025);
  const chainPoints: THREE.Vector3[] = [], bb = new THREE.Vector3(...p(281, 416)), rearCenter = rear.original;
  for (let index = 0; index <= 32; index++) { const a = Math.PI / 2 - index / 32 * Math.PI; chainPoints.push(new THREE.Vector3(bb.x + Math.cos(a) * .218, bb.y + Math.sin(a) * .218, .143)); }
  const lowerPulley = p(119, 496), upperPulley = p(129, 473);
  for (let index = 0; index <= 12; index++) { const a = -Math.PI / 4 - index / 12 * Math.PI * .75; chainPoints.push(new THREE.Vector3(lowerPulley[0] + Math.cos(a) * .027, lowerPulley[1] + Math.sin(a) * .027, .143)); }
  for (let index = 0; index <= 8; index++) { const a = Math.PI - index / 8 * Math.PI / 2; chainPoints.push(new THREE.Vector3(upperPulley[0] + Math.cos(a) * .028, upperPulley[1] + Math.sin(a) * .028, .143)); }
  for (let index = 0; index <= 32; index++) { const a = -Math.PI / 2 - index / 32 * Math.PI; chainPoints.push(new THREE.Vector3(rearCenter.x + Math.cos(a) * .112, rearCenter.y + Math.sin(a) * .112, .143)); }
  const chainCurve = new THREE.CatmullRomCurve3(chainPoints, true, "centripetal"), linkGeometry = new THREE.BoxGeometry(.018, .007, .004); geometries.add(linkGeometry);
  const chain = new THREE.InstancedMesh(linkGeometry, chainMat, 224); root.add(chain);

  if (typeof document !== "undefined") {
    const texture = new THREE.TextureLoader().load('/images/birdy-wordmark.png', loaded => {
      if (disposed) { loaded.dispose(); return; }
      onVisualChange?.();
    });
    texture.offset.set(20 / 280, 0); texture.repeat.set(128 / 280, 1); texture.anisotropy = 4; textures.add(texture);
    const material = new THREE.MeshBasicMaterial({ color: '#101719', alphaMap: texture, transparent: true, alphaTest: .04, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); materials.add(material);
    for (const side of [-1, 1]) {
      const geometry = new THREE.PlaneGeometry(.35, .109375, 40, 10), positions = geometry.getAttribute('position');
      const center = p(414, 300), angle = .12;
      for (let index = 0; index < positions.count; index++) {
        const localX = positions.getX(index) * side, localY = positions.getY(index);
        const x = center[0] + localX * Math.cos(angle) - localY * Math.sin(angle), y = center[1] + localX * Math.sin(angle) + localY * Math.cos(angle);
        positions.setXYZ(index, x, y, side * (birdyFrameSurfaceDepth(x, y) + .0012));
      }
      geometry.computeVertexNormals();
      const logo = mesh(geometry, material); logo.castShadow = false;
    }
  }
  let chainPhase = 0, explosion = 0;
  const dummy = new THREE.Object3D();
  function updateChain() {
    for (let index = 0; index < 112; index++) {
      const t = (index / 112 + chainPhase) % 1, position = chainCurve.getPointAt(t), tangent = chainCurve.getTangentAt(t);
      for (let side = 0; side < 2; side++) { dummy.position.copy(position); dummy.position.z += side ? .006 : -.006; dummy.rotation.set(0, 0, Math.atan2(tangent.y, tangent.x)); dummy.updateMatrix(); chain.setMatrixAt(index * 2 + side, dummy.matrix); }
    }
    chain.instanceMatrix.needsUpdate = true;
  }
  updateChain();
  return {
    root,
    setPaint(value) {
      paint.color.set(showroomPaints[value]); weldPaint.color.set(showroomPaints[value]);
      paint.metalness = value === "pearl" ? .12 : value === "emerald" ? .3 : .42;
      paint.roughness = value === "pearl" ? .35 : .31;
      paint.clearcoatRoughness = value === "graphite" ? .29 : .28;
      weldPaint.metalness = paint.metalness; weldPaint.roughness = paint.roughness + .05;
    },
    update(delta, riding, exploded, immediate = false) {
      explosion = immediate ? Number(exploded) : THREE.MathUtils.damp(explosion, Number(exploded), 4, delta);
      front.group.position.copy(front.original).add(new THREE.Vector3(explosion * .40, explosion * .10, explosion * .42));
      rear.group.position.copy(rear.original).add(new THREE.Vector3(-explosion * .40, explosion * .10, -explosion * .42));
      cockpit.position.set(explosion * .08, explosion * .48, 0); seat.position.set(-explosion * .1, explosion * .42, 0);
      crank.position.z = .137 + explosion * .23; chainMat.opacity = 1 - explosion * .78;
      if (riding && explosion < .12) { front.spinning.rotation.z -= delta * 2.2; rear.spinning.rotation.z -= delta * 2.2; crank.rotation.z -= delta * 1.6; chainPhase = (chainPhase + delta * .22) % 1; updateChain(); }
      pedals.forEach(pedal => { pedal.rotation.z = -crank.rotation.z; });
    },
    dispose() { disposed = true; geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); root.clear(); },
  };
}
