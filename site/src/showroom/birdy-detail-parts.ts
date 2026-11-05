import * as THREE from "three";

type SaddleSection = {
  x: number;
  halfWidth: number;
  top: number;
  edge: number;
  bottom: number;
  wing: number;
};

// Longitudinal sections follow the photographed thin nose, scooped middle and
// raised, broad rear. The shell is a closed loft, rather than an extruded outline.
const saddleSections: SaddleSection[] = [
  { x: -.275, halfWidth: 0, top: .033, edge: .033, bottom: .033, wing: 0 },
  { x: -.263, halfWidth: .076, top: .047, edge: .022, bottom: -.002, wing: .002 },
  { x: -.237, halfWidth: .113, top: .044, edge: .013, bottom: -.014, wing: .004 },
  { x: -.195, halfWidth: .125, top: .031, edge: .003, bottom: -.029, wing: .006 },
  { x: -.139, halfWidth: .116, top: .014, edge: -.008, bottom: -.037, wing: .007 },
  { x: -.076, halfWidth: .091, top: .001, edge: -.014, bottom: -.039, wing: .006 },
  { x: -.014, halfWidth: .061, top: -.003, edge: -.013, bottom: -.033, wing: .004 },
  { x: .048, halfWidth: .036, top: 0, edge: -.010, bottom: -.026, wing: .0015 },
  { x: .120, halfWidth: .027, top: .003, edge: -.007, bottom: -.020, wing: 0 },
  { x: .211, halfWidth: .023, top: .001, edge: -.008, bottom: -.018, wing: 0 },
  { x: .257, halfWidth: .015, top: -.003, edge: -.010, bottom: -.018, wing: 0 },
  { x: .275, halfWidth: 0, top: -.011, edge: -.011, bottom: -.011, wing: 0 },
];

type SectionField = Exclude<keyof SaddleSection, "x">;

function sectionValue(x: number, field: SectionField): number {
  let segment = 0;
  while (segment < saddleSections.length - 2 && x > saddleSections[segment + 1].x) segment++;
  const a = saddleSections[segment];
  const b = saddleSections[segment + 1];
  const before = saddleSections[Math.max(0, segment - 1)];
  const after = saddleSections[Math.min(saddleSections.length - 1, segment + 2)];
  const distance = b.x - a.x;
  const t = THREE.MathUtils.clamp((x - a.x) / distance, 0, 1);
  let slopeA = (b[field] - before[field]) / (b.x - before.x);
  let slopeB = (after[field] - a[field]) / (after.x - a.x);

  // Prevent narrow tips and local extrema from growing interpolation ripples.
  if (field === "halfWidth") {
    const secant = (b[field] - a[field]) / distance;
    if (Math.abs(secant) < 1e-10) {
      slopeA = 0;
      slopeB = 0;
    } else {
      slopeA = Math.sign(slopeA) === Math.sign(secant) ? Math.sign(secant) * Math.min(Math.abs(slopeA), 3 * Math.abs(secant)) : 0;
      slopeB = Math.sign(slopeB) === Math.sign(secant) ? Math.sign(secant) * Math.min(Math.abs(slopeB), 3 * Math.abs(secant)) : 0;
    }
  }

  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[field]
    + (t3 - 2 * t2 + t) * distance * slopeA
    + (-2 * t3 + 3 * t2) * b[field]
    + (t3 - t2) * distance * slopeB;
}

/** X is longitudinal, positive X is the nose, Y is up, and Z is the width. */
export function createBirdySaddleGeometry(): THREE.BufferGeometry {
  const rings = 80;
  const around = 56;
  const start = saddleSections[0];
  const end = saddleSections[saddleSections.length - 1];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < rings; row++) {
    const u = (row + 1) / (rings + 1);
    const x = THREE.MathUtils.lerp(start.x, end.x, u);
    const width = Math.max(.0001, sectionValue(x, "halfWidth"));
    const edge = sectionValue(x, "edge");
    const top = Math.max(edge + .0001, sectionValue(x, "top"));
    const bottom = Math.min(edge - .0001, sectionValue(x, "bottom"));
    const wing = Math.max(0, sectionValue(x, "wing"));

    for (let column = 0; column < around; column++) {
      const theta = column / around * Math.PI * 2;
      const sine = Math.sin(theta);
      const z = width * Math.cos(theta);
      // A very shallow longitudinal relief is produced by the two softly raised
      // wings. It does not invent a through-hole absent from the reference.
      const y = sine >= 0
        ? edge + (top - edge) * Math.pow(sine, .66) + wing * Math.pow(Math.sin(theta * 2), 2)
        : edge + (edge - bottom) * sine;
      positions.push(x, y, z);
      uvs.push(u, column / around);
    }
  }

  for (let row = 0; row < rings - 1; row++) {
    for (let column = 0; column < around; column++) {
      const next = (column + 1) % around;
      const a = row * around + column;
      const b = (row + 1) * around + column;
      const c = (row + 1) * around + next;
      const d = row * around + next;
      indices.push(a, b, d, b, c, d);
    }
  }

  const rearCap = positions.length / 3;
  positions.push(start.x, start.edge, 0);
  uvs.push(0, .5);
  const noseCap = positions.length / 3;
  positions.push(end.x, end.edge, 0);
  uvs.push(1, .5);
  for (let column = 0; column < around; column++) {
    const next = (column + 1) % around;
    indices.push(rearCap, column, next);
    indices.push(noseCap, (rings - 1) * around + next, (rings - 1) * around + column);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = "BIRDY sculpted sports saddle";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function polar(radius: number, angle: number): [number, number] {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/** A thin six-spider steel rotor in XY, with the sheet centered on Z=0. */
export function createBirdyRotorGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outlineSamples = 240;
  for (let index = 0; index <= outlineSamples; index++) {
    const angle = index / outlineSamples * Math.PI * 2;
    const radius = .1537 + .0013 * Math.cos(angle * 30);
    const point = polar(radius, angle);
    if (index === 0) shape.moveTo(...point);
    else shape.lineTo(...point);
  }
  shape.closePath();

  const bore = new THREE.Path();
  bore.absarc(0, 0, .014, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  for (let arm = 0; arm < 6; arm++) {
    const angle = arm / 6 * Math.PI * 2;
    const step = Math.PI / 3;
    const window = new THREE.Path();
    // The long negative spaces leave curved, slender load-bearing spokes and a
    // continuous outer braking track, rather than a plate with small holes.
    window.moveTo(...polar(.042, angle + .18));
    window.absarc(0, 0, .042, angle + .18, angle + step - .15, false);
    window.bezierCurveTo(...polar(.057, angle + step -.04), ...polar(.102, angle + step + .12), ...polar(.118, angle + step + .16));
    window.quadraticCurveTo(...polar(.122, angle + step + .16), ...polar(.122, angle + step + .12));
    window.absarc(0, 0, .122, angle + step + .12, angle + .24, true);
    window.quadraticCurveTo(...polar(.122, angle + .205), ...polar(.117, angle + .20));
    window.bezierCurveTo(...polar(.090, angle + .18), ...polar(.054, angle + .17), ...polar(.042, angle + .18));
    window.closePath();
    shape.holes.push(window);

    const bolt = new THREE.Path();
    const center = polar(.026, angle + .08);
    bolt.absarc(...center, .0035, 0, Math.PI * 2, true);
    shape.holes.push(bolt);
  }

  for (let index = 0; index < 30; index++) {
    const angle = index / 30 * Math.PI * 2;
    const center = polar(.1392, angle);
    const slot = new THREE.Path();
    slot.absellipse(...center, .0032, .0114, 0, Math.PI * 2, true, angle + Math.PI / 4);
    shape.holes.push(slot);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .0028, bevelEnabled: false, curveSegments: 10, steps: 1 });
  geometry.name = "BIRDY open six-spider brake rotor";
  geometry.translate(0, 0, -.0014);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
