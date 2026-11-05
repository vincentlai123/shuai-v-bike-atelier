import * as THREE from "three";

const tau = Math.PI * 2;

function finishGeometry(name: string, positions: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Both the moulded blades and rim share one planar weave direction. The
  // material can repeat the texture without introducing a seam at each blade.
  const uvs: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    uvs.push(positions[index] / .77 + .5, positions[index + 1] / .77 + .5);
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** XY wheel plane, Z axle: five softly swept, fully rounded carbon blades. */
export function createBirdyFiveBladeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const along = 40;
  const around = 28;

  for (let blade = 0; blade < 5; blade++) {
    const base = positions.length / 3;
    const baseAngle = blade / 5 * tau + Math.PI / 2;
    for (let row = 0; row <= along; row++) {
      const u = row / along;
      const radius = THREE.MathUtils.lerp(.025, .343, u);
      const sweep = -.075 + .35 * (u * u * (3 - 2 * u));
      const angle = baseAngle + sweep;
      // Broad roots and a gently flared rim junction avoid a thin star shape.
      const halfChord = .037 + .009 * Math.sin(Math.PI * u) + .016 * u * u;
      const halfDepth = .016 - .002 * u - .006 * Math.sin(Math.PI * u);
      const centerX = Math.cos(angle) * radius;
      const centerY = Math.sin(angle) * radius;
      // The chord stays almost tangential to the wheel. Slightly leaning its
      // direction into the sweep gives a continuous, moulded trailing edge.
      const chordAngle = angle + Math.PI / 2 - .14 * Math.sin(Math.PI * u);
      for (let column = 0; column < around; column++) {
        const theta = column / around * tau;
        const chord = halfChord * Math.cos(theta);
        const depth = halfDepth * Math.sin(theta) * (.96 + .04 * Math.cos(theta));
        positions.push(centerX + Math.cos(chordAngle) * chord, centerY + Math.sin(chordAngle) * chord, depth);
      }
    }
    for (let row = 0; row < along; row++) {
      for (let column = 0; column < around; column++) {
        const next = (column + 1) % around;
        const a = base + row * around + column;
        const b = base + (row + 1) * around + column;
        const c = base + (row + 1) * around + next;
        const d = base + row * around + next;
        indices.push(a, d, b, b, d, c);
      }
    }
    // The closed ends sit inside the hub and rim, never across the open gaps.
    for (const end of [0, along]) {
      const cap = positions.length / 3;
      const radius = end === 0 ? .025 : .343;
      const angle = baseAngle + (end === 0 ? -.075 : .275);
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      for (let column = 0; column < around; column++) {
        const a = base + end * around + column;
        const b = base + end * around + (column + 1) % around;
        if (end === 0) indices.push(cap, b, a);
        else indices.push(cap, a, b);
      }
    }
  }

  // A small integral rounded carbon hub receives the five blade roots. The
  // metal axle, rotor and cassette remain separate objects in the bike model.
  const hubStart = positions.length / 3;
  const hubAround = 64;
  const hubProfile = [
    [.027, -.023], [.045, -.023], [.051, -.020], [.054, -.014],
    [.055, 0], [.054, .014], [.051, .020], [.045, .023], [.027, .023],
  ];
  for (let row = 0; row < hubProfile.length; row++) {
    const [radius, z] = hubProfile[row];
    for (let column = 0; column < hubAround; column++) {
      const angle = column / hubAround * tau;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    }
  }
  for (let row = 0; row < hubProfile.length; row++) {
    const nextRow = (row + 1) % hubProfile.length;
    for (let column = 0; column < hubAround; column++) {
      const nextColumn = (column + 1) % hubAround;
      const a = hubStart + row * hubAround + column;
      const b = hubStart + row * hubAround + nextColumn;
      const c = hubStart + nextRow * hubAround + nextColumn;
      const d = hubStart + nextRow * hubAround + column;
      indices.push(a, b, d, b, c, d);
    }
  }
  return finishGeometry("BIRDY five swept carbon blades", positions, indices);
}

/** A rounded, deep-section carbon annulus, already oriented to the Z axle. */
export function createBirdyCarbonRimGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const around = 144;
  const profileSamples = 48;
  // The inner lip is radiused; the sidewalls gently crown toward the tire bed.
  const profile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.324, 0, 0),
    new THREE.Vector3(.325, -.012, 0),
    new THREE.Vector3(.330, -.019, 0),
    new THREE.Vector3(.346, -.022, 0),
    new THREE.Vector3(.371, -.023, 0),
    new THREE.Vector3(.382, -.019, 0),
    new THREE.Vector3(.387, -.009, 0),
    new THREE.Vector3(.388, 0, 0),
    new THREE.Vector3(.387, .009, 0),
    new THREE.Vector3(.382, .019, 0),
    new THREE.Vector3(.371, .023, 0),
    new THREE.Vector3(.346, .022, 0),
    new THREE.Vector3(.330, .019, 0),
    new THREE.Vector3(.325, .012, 0),
  ], true, "centripetal");

  for (let row = 0; row < around; row++) {
    const angle = row / around * tau;
    for (let column = 0; column < profileSamples; column++) {
      const section = profile.getPoint(column / profileSamples);
      positions.push(Math.cos(angle) * section.x, Math.sin(angle) * section.x, section.y);
    }
  }
  for (let row = 0; row < around; row++) {
    for (let column = 0; column < profileSamples; column++) {
      const a = row * profileSamples + column;
      const b = (row + 1) % around * profileSamples + column;
      const c = (row + 1) % around * profileSamples + (column + 1) % profileSamples;
      const d = row * profileSamples + (column + 1) % profileSamples;
      indices.push(a, b, d, b, c, d);
    }
  }
  return finishGeometry("BIRDY deep carbon rim", positions, indices);
}
