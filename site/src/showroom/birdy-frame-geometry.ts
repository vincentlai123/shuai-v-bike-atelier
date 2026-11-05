import * as THREE from "three";

type PixelPoint = readonly [number, number];
const photoScale = 1.96 / 407;
const xy = (x: number, y: number): [number, number] => [(x - 319.5) * photoScale, (532 - y) * photoScale];
const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

function withoutClosingPoint(points: THREE.Vector2[]) {
  if (points.length > 1 && points[0].distanceToSquared(points[points.length - 1]) < 1e-12) points.pop();
  return points;
}

function frameProfiles() {
  const outer = new THREE.Shape();
  outer.moveTo(...xy(222, 285));
  outer.bezierCurveTo(...xy(231, 290), ...xy(240, 299), ...xy(257, 302));
  outer.bezierCurveTo(...xy(293, 309), ...xy(338, 299), ...xy(387, 291));
  outer.bezierCurveTo(...xy(420, 285), ...xy(446, 281), ...xy(468, 279));
  outer.bezierCurveTo(...xy(476, 280), ...xy(479, 292), ...xy(482, 307));
  outer.bezierCurveTo(...xy(452, 311), ...xy(425, 314), ...xy(398, 319));
  outer.bezierCurveTo(...xy(354, 325), ...xy(329, 337), ...xy(314, 353));
  outer.bezierCurveTo(...xy(303, 366), ...xy(296, 384), ...xy(288, 395));
  outer.bezierCurveTo(...xy(282, 401), ...xy(271, 397), ...xy(265, 385));
  outer.bezierCurveTo(...xy(249, 359), ...xy(238, 329), ...xy(222, 285));
  outer.closePath();
  const hole = new THREE.Path();
  hole.moveTo(...xy(252, 334));
  hole.bezierCurveTo(...xy(250, 329), ...xy(254, 326), ...xy(265, 324));
  hole.lineTo(...xy(295, 320));
  hole.bezierCurveTo(...xy(303, 319), ...xy(307, 324), ...xy(302, 332));
  hole.lineTo(...xy(290, 352));
  hole.bezierCurveTo(...xy(285, 358), ...xy(272, 362), ...xy(263, 358));
  hole.lineTo(...xy(252, 334));
  hole.closePath();
  return [withoutClosingPoint(outer.getSpacedPoints(218)), withoutClosingPoint(hole.getSpacedPoints(74))];
}

const profiles = frameProfiles();

function boundaryDistance(x: number, y: number, boundaries: THREE.Vector2[][]) {
  let closestSquared = Infinity;
  for (const loop of boundaries) for (let index = 0; index < loop.length; index++) {
    const a = loop[index], b = loop[(index + 1) % loop.length], ex = b.x - a.x, ey = b.y - a.y;
    const along = THREE.MathUtils.clamp(((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey), 0, 1);
    const dx = x - a.x - ex * along, dy = y - a.y - ey * along;
    closestSquared = Math.min(closestSquared, dx * dx + dy * dy);
  }
  return Math.sqrt(closestSquared);
}

function contains(x: number, y: number, boundaries: THREE.Vector2[][]) {
  let inside = false;
  for (const loop of boundaries) for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A torsion/Poisson field is smooth through junctions and medial axes, unlike an opposite-boundary ray. */
function poissonInflation(boundaries: THREE.Vector2[][], halfDepth: (x: number, y: number) => number) {
  const spacing = photoScale * .9, all = boundaries.flat();
  const minX = Math.min(...all.map(point => point.x)) - spacing * 2, minY = Math.min(...all.map(point => point.y)) - spacing * 2;
  const nx = Math.ceil((Math.max(...all.map(point => point.x)) - minX) / spacing) + 3, ny = Math.ceil((Math.max(...all.map(point => point.y)) - minY) / spacing) + 3;
  const count = nx * ny, mask = new Uint8Array(count), distances = new Float64Array(count), values = new Float64Array(count);
  const left = new Float64Array(count), right = new Float64Array(count), down = new Float64Array(count), upper = new Float64Array(count), diagonal = new Float64Array(count);
  const active: number[] = [];
  for (let row = 0; row < ny; row++) for (let column = 0; column < nx; column++) {
    const index = row * nx + column, x = minX + column * spacing, y = minY + row * spacing;
    distances[index] = boundaryDistance(x, y, boundaries);
    if (contains(x, y, boundaries) && distances[index] > 1e-7) { mask[index] = 1; active.push(index); }
  }
  // Short cut cells place the zero Dirichlet boundary at the contour, not at the next grid center.
  function fraction(index: number, neighbor: number) {
    return mask[neighbor] ? 1 : Math.max(.1, distances[index] / (distances[index] + distances[neighbor]));
  }
  for (const index of active) {
    const l = fraction(index, index - 1), r = fraction(index, index + 1), d = fraction(index, index - nx), u = fraction(index, index + nx);
    left[index] = 2 / (l * (l + r)); right[index] = 2 / (r * (l + r));
    down[index] = 2 / (d * (d + u)); upper[index] = 2 / (u * (d + u));
    diagonal[index] = left[index] + right[index] + down[index] + upper[index];
  }
  const source = spacing * spacing;
  for (let iteration = 0; iteration < 900; iteration++) {
    let largestChange = 0;
    for (const index of active) {
      const equilibrium = (left[index] * values[index - 1] + right[index] * values[index + 1] + down[index] * values[index - nx] + upper[index] * values[index + nx] + source) / diagonal[index];
      const next = values[index] + 1.72 * (equilibrium - values[index]);
      largestChange = Math.max(largestChange, Math.abs(next - values[index])); values[index] = next;
    }
    if (largestChange < source * 1e-7) break;
  }
  return (x: number, y: number) => {
    const gridX = THREE.MathUtils.clamp((x - minX) / spacing, 0, nx - 2.001), gridY = THREE.MathUtils.clamp((y - minY) / spacing, 0, ny - 2.001);
    const column = Math.floor(gridX), row = Math.floor(gridY), tx = gridX - column, ty = gridY - row;
    const samples = [row * nx + column, row * nx + column + 1, (row + 1) * nx + column, (row + 1) * nx + column + 1];
    const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    let interpolated = 0, gradient = 0, total = 0;
    for (let index = 0; index < 4; index++) {
      const gridIndex = samples[index]; interpolated += values[gridIndex] * weights[index];
      if (mask[gridIndex]) { gradient += values[gridIndex] / distances[gridIndex] * weights[index]; total += weights[index]; }
    }
    const distance = boundaryDistance(x, y, boundaries);
    const nearBoundary = total ? distance * gradient / total : 0;
    const blend = THREE.MathUtils.smoothstep(distance, spacing, spacing * 3);
    const potential = Math.max(0, THREE.MathUtils.lerp(nearBoundary, interpolated, blend));
    const depth = halfDepth(x, y);
    return depth * Math.tanh(Math.sqrt(2 * potential) / depth);
  };
}

function maximumFrameDepth(x: number, _y: number) {
  return .071 - THREE.MathUtils.smoothstep(x, xy(285, 0)[0], xy(480, 0)[0]) * .026;
}

let frameSurface: ((x: number, y: number) => number) | null = null;

export function birdyFrameSurfaceDepth(x: number, y: number) {
  if (!frameSurface) createBirdyFrameGeometry().dispose();
  return frameSurface?.(x, y) ?? 0;
}

function triangleSampler(vertices: THREE.Vector2[], heights: number[], faces: number[][]) {
  const minX = Math.min(...vertices.map(point => point.x)), maxX = Math.max(...vertices.map(point => point.x));
  const minY = Math.min(...vertices.map(point => point.y)), maxY = Math.max(...vertices.map(point => point.y));
  const columns = 80, rows = 40, buckets: number[][] = Array.from({ length: columns * rows }, () => []);
  const cellX = (x: number) => THREE.MathUtils.clamp(Math.floor((x - minX) / (maxX - minX) * columns), 0, columns - 1);
  const cellY = (y: number) => THREE.MathUtils.clamp(Math.floor((y - minY) / (maxY - minY) * rows), 0, rows - 1);
  faces.forEach((triangle, index) => {
    const [a, b, c] = triangle.map(vertex => vertices[vertex]);
    for (let row = cellY(Math.min(a.y, b.y, c.y)); row <= cellY(Math.max(a.y, b.y, c.y)); row++) for (let column = cellX(Math.min(a.x, b.x, c.x)); column <= cellX(Math.max(a.x, b.x, c.x)); column++) buckets[row * columns + column].push(index);
  });
  return (x: number, y: number) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return 0;
    for (const faceIndex of buckets[cellY(y) * columns + cellX(x)]) {
      const [ia, ib, ic] = faces[faceIndex], a = vertices[ia], b = vertices[ib], c = vertices[ic];
      const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
      const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator, w = 1 - u - v;
      if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) return u * heights[ia] + v * heights[ib] + w * heights[ic];
    }
    return 0;
  };
}
/** A closed, smoothly crowned shell. Front/back share the seam vertices; there are no flat extrusion caps. */
function sculptedShell(boundaries: THREE.Vector2[][], halfDepth: (x: number, y: number) => number, passes: number) {
  const vertices = boundaries.flat().map(point => point.clone());
  const boundaryVertex = vertices.map(() => true);
  let faces = THREE.ShapeUtils.triangulateShape(boundaries[0].map(p => p.clone()), boundaries.slice(1).map(loop => loop.map(p => p.clone()))).filter(([a, b, c]) => {
    const pa = vertices[a], pb = vertices[b], pc = vertices[c];
    return Math.abs((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x)) > 1e-12;
  });
  const edgeIncidence = new Map<string, number>();
  for (const [a, b, c] of faces) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const edge = key(u, v); edgeIncidence.set(edge, (edgeIncidence.get(edge) ?? 0) + 1);
  }
  // Earcut omits exactly collinear contour samples; use its actual perimeter, not the original sample edges.
  let boundaryEdges = new Set([...edgeIncidence.entries()].filter(([, incidence]) => incidence === 1).map(([edge]) => edge));
  for (let pass = 0; pass < passes; pass++) {
    const midpoints = new Map<string, number>(), nextBoundary = new Set<string>(), nextFaces: number[][] = [];
    function midpoint(a: number, b: number) {
      const edge = key(a, b), existing = midpoints.get(edge);
      if (existing !== undefined) return existing;
      const index = vertices.length; vertices.push(vertices[a].clone().lerp(vertices[b], .5));
      const isBoundary = boundaryEdges.has(edge); boundaryVertex.push(isBoundary);
      if (isBoundary) { nextBoundary.add(key(a, index)); nextBoundary.add(key(index, b)); }
      midpoints.set(edge, index); return index;
    }
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      nextFaces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = nextFaces; boundaryEdges = nextBoundary;
  }
  // A chord joining two seam vertices needs an interior vertex; otherwise front/back would share an internal edge.
  const seamChords = new Map<string, number>();
  for (const [a, b, c] of faces) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const edge = key(u, v);
    if (boundaryVertex[u] && boundaryVertex[v] && !boundaryEdges.has(edge) && !seamChords.has(edge)) {
      seamChords.set(edge, vertices.length); vertices.push(vertices[u].clone().lerp(vertices[v], .5)); boundaryVertex.push(false);
    }
  }
  const sewnFaces: number[][] = [];
  for (const [a, b, c] of faces) {
    if (![key(a, b), key(b, c), key(c, a)].some(edge => seamChords.has(edge))) { sewnFaces.push([a, b, c]); continue; }
    const center = vertices.length; vertices.push(vertices[a].clone().add(vertices[b]).add(vertices[c]).multiplyScalar(1 / 3)); boundaryVertex.push(false);
    const perimeter: number[] = [];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) { perimeter.push(u); const midpoint = seamChords.get(key(u, v)); if (midpoint !== undefined) perimeter.push(midpoint); }
    for (let index = 0; index < perimeter.length; index++) sewnFaces.push([center, perimeter[index], perimeter[(index + 1) % perimeter.length]]);
  }
  faces = sewnFaces;
  const inflate = poissonInflation(boundaries, halfDepth);
  // Newly inserted chord centres can land numerically on a cut contour. Giving
  // those interior samples a sub-millimetre crown avoids two separately indexed
  // front/back vertices occupying exactly the same point and fighting in depth.
  const heights = vertices.map((point, index) => {
    if (boundaryVertex[index]) return 0;
    const depth = inflate(point.x, point.y); return depth > 0 ? depth : .00035;
  });
  const positions: number[] = [], front: number[] = [], back: number[] = [], indices: number[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const point = vertices[index];
    const depth = heights[index];
    front.push(positions.length / 3); positions.push(point.x, point.y, depth);
    if (boundaryVertex[index]) back.push(front[index]); else { back.push(positions.length / 3); positions.push(point.x, point.y, -depth); }
  }
  for (const triangle of faces) {
    let [a, b, c] = triangle;
    const pa = vertices[a], pb = vertices[b], pc = vertices[c];
    if ((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x) < 0) [b, c] = [c, b];
    indices.push(front[a], front[b], front[c], back[c], back[b], back[a]);
  }
  // Earcut is allowed to omit collinear contour samples. Compact the referenced
  // mesh so their unused zero normals never enter subsequent attribute work.
  const remap = new Map<number, number>(), compactPositions: number[] = [];
  const compactIndices = indices.map(index => {
    const existing = remap.get(index); if (existing !== undefined) return existing;
    const next = compactPositions.length / 3; remap.set(index, next);
    compactPositions.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]); return next;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(compactPositions, 3)); geometry.setIndex(compactIndices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const storedVertices = vertices.map(point => new THREE.Vector2(Math.fround(point.x), Math.fround(point.y)));
  return { geometry, sample: triangleSampler(storedVertices, heights.map(height => Math.fround(height)), faces) };
}

export function createBirdyFrameGeometry() {
  const result = sculptedShell(profiles, maximumFrameDepth, 3);
  frameSurface = result.sample; return result.geometry;
}

export function createBirdyFrameWeldGeometry() {
  const points = profiles[0].map(point => new THREE.Vector3(point.x, point.y, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true, "centripetal"), 360, .0008, 5, true);
}

/** Elliptical forgings curve in three dimensions and taper into their pivot bosses. */
export function createBirdyForgedBladeGeometry(points: readonly PixelPoint[], width: number, depth: number) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...xy(...point), 0)), false, "centripetal");
  const segments = 48, sides = 16, positions: number[] = [], indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    const t = row / segments, center = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const profile = .86 + .14 * Math.sin(Math.PI * t);
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(center.x + normal.x * Math.cos(angle) * width * .5 * profile, center.y + normal.y * Math.cos(angle) * width * .5 * profile, Math.sin(angle) * depth * .5);
    }
  }
  for (let row = 0; row < segments; row++) for (let side = 0; side < sides; side++) {
    const a = row * sides + side, b = row * sides + (side + 1) % sides, c = a + sides, d = b + sides;
    indices.push(a, b, c, b, d, c);
  }
  const first = curve.getPointAt(0), last = curve.getPointAt(1), firstCenter = positions.length / 3;
  positions.push(first.x, first.y, 0, last.x, last.y, 0);
  for (let side = 0; side < sides; side++) {
    indices.push(firstCenter, (side + 1) % sides, side);
    indices.push(firstCenter + 1, segments * sides + side, segments * sides + (side + 1) % sides);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function createBirdyLeadingLinkGeometry() {
  const outline = new THREE.Shape();
  outline.moveTo(...xy(455, 430)); outline.bezierCurveTo(...xy(469, 428), ...xy(496, 421), ...xy(513, 420));
  outline.bezierCurveTo(...xy(522, 422), ...xy(534, 435), ...xy(534, 442)); outline.bezierCurveTo(...xy(534, 450), ...xy(523, 451), ...xy(512, 449));
  outline.lineTo(...xy(456, 449)); outline.bezierCurveTo(...xy(443, 447), ...xy(444, 434), ...xy(455, 430)); outline.closePath();
  const window = new THREE.Path(); window.moveTo(...xy(469, 436)); window.lineTo(...xy(498, 428));
  window.bezierCurveTo(...xy(507, 426), ...xy(511, 431), ...xy(506, 435)); window.lineTo(...xy(478, 443));
  window.bezierCurveTo(...xy(469, 445), ...xy(464, 440), ...xy(469, 436)); window.closePath();
  return sculptedShell([withoutClosingPoint(outline.getSpacedPoints(68)), withoutClosingPoint(window.getSpacedPoints(38))], () => .013, 2).geometry;
}
