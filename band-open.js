/**
 * Unbends the closed Alpine Loop into a flat, unbuckled strap.
 *
 * The loop is a circle in the plane spanned by the 12 o'clock axis (T) and the
 * display normal (N). Each vertex is described by its arc distance from the lug
 * it hangs off and its offset from the loop's centre-line. A vertex shader then
 * re-bends the strap around a radius that grows from the loop radius to
 * infinity, pivoting at the lug so the strap ends up lying flat along T. The
 * loop is split at the buckle, so the two halves open like an unbuckled band.
 */
import * as THREE from "three";

const T = new THREE.Vector3(0, 0.819, -0.573).normalize();
const N = new THREE.Vector3(0, 0.573, 0.819).normalize();

// Circle fitted to the loop's vertices, in (t, d) coordinates.
const CENTER_T = -0.06;
const CENTER_D = 0.236;
const RADIUS = 3.503;
// Where the lugs sit on that circle, and where the buckle splits it.
const TOP_LUG_DEG = 46.6;
const BOTTOM_LUG_DEG = 134.1;
const SPLIT_DEG = 105; // clockwise from the top lug

const DEG = Math.PI / 180;

const wrap = (deg, low) => ((((deg - low) % 360) + 360) % 360) + low;

/** Add the per-vertex bend attributes (arc, offset, half) to a band mesh. */
function prepareGeometry(mesh) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const position = geometry.attributes.position;
  const count = position.count;
  const bend = new Float32Array(count * 3);
  const p = new THREE.Vector3();

  const polar = (i) => {
    p.fromBufferAttribute(position, i);
    const t = p.dot(T) - CENTER_T;
    const d = p.dot(N) - CENTER_D;
    return { rho: Math.hypot(t, d), theta: Math.atan2(d, t) / DEG };
  };

  for (let tri = 0; tri < count; tri += 3) {
    // Decide which half the whole triangle belongs to from its mean angle,
    // so no triangle is stretched across the opened buckle.
    let sumPhi = 0;
    const verts = [0, 1, 2].map((k) => {
      const v = polar(tri + k);
      v.phi = wrap(TOP_LUG_DEG - v.theta, -45);
      sumPhi += v.phi;
      return v;
    });
    const half = sumPhi / 3 < SPLIT_DEG ? 0 : 1;

    verts.forEach((v, k) => {
      const arc =
        half === 0
          ? RADIUS * v.phi * DEG
          : RADIUS * wrap(v.theta - BOTTOM_LUG_DEG, -45) * DEG;
      const idx = (tri + k) * 3;
      bend[idx] = arc;
      bend[idx + 1] = v.rho - RADIUS;
      bend[idx + 2] = half;
    });
  }

  geometry.setAttribute("aBend", new THREE.BufferAttribute(bend, 3));
  mesh.geometry = geometry;
}

const f = (v) => v.toFixed(5);

const SHADER_HEADER = /* glsl */ `
attribute vec3 aBend;
uniform float uOpen;
const vec3 T_AXIS = vec3(${f(T.x)}, ${f(T.y)}, ${f(T.z)});
const vec3 N_AXIS = vec3(${f(N.x)}, ${f(N.y)}, ${f(N.z)});
const float R_LOOP = ${f(RADIUS)};
const vec2 LUG_TOP = vec2(${f(CENTER_T + RADIUS * Math.cos(TOP_LUG_DEG * DEG))}, ${f(CENTER_D + RADIUS * Math.sin(TOP_LUG_DEG * DEG))});
const vec2 LUG_BOTTOM = vec2(${f(CENTER_T + RADIUS * Math.cos(BOTTOM_LUG_DEG * DEG))}, ${f(CENTER_D + RADIUS * Math.sin(BOTTOM_LUG_DEG * DEG))});
const float HEADING_TOP = ${f((TOP_LUG_DEG - 90) * DEG)};
const float HEADING_BOTTOM = ${f((BOTTOM_LUG_DEG + 90) * DEG)};
`;

// Computed once at the normal stage (which runs first) and reused for the
// position: the bent (t, d) point and the local rotation for normals.
const SHADER_BEND = /* glsl */ `
  float bendArc = aBend.x;
  float bendOff = aBend.y;
  bool bendTop = aBend.z < 0.5;
  float bendR = R_LOOP / max(1.0 - uOpen, 0.003);
  float bendPhi = bendArc / bendR;
  float bendHeading0 = bendTop ? HEADING_TOP : HEADING_BOTTOM;
  float bendHeading = mix(bendHeading0, bendTop ? 0.0 : PI, uOpen);
  float bendRim = bendR + bendOff;
  vec2 bendQ = bendTop
    ? vec2(bendRim * sin(bendPhi), bendRim * cos(bendPhi) - bendR)
    : vec2(bendRim * sin(bendPhi), bendR - bendRim * cos(bendPhi));
  float bendC = cos(bendHeading);
  float bendS = sin(bendHeading);
  vec2 bendTD = (bendTop ? LUG_TOP : LUG_BOTTOM)
    + vec2(bendC * bendQ.x - bendS * bendQ.y, bendS * bendQ.x + bendC * bendQ.y);
  float bendTurn = bendTop
    ? (bendHeading - bendPhi) - (bendHeading0 - bendArc / R_LOOP)
    : (bendHeading + bendPhi) - (bendHeading0 + bendArc / R_LOOP);
  float bendCa = cos(bendTurn);
  float bendSa = sin(bendTurn);
`;

const rotateInPlane = (name) => /* glsl */ `
  {
    vec2 c = vec2(dot(${name}, T_AXIS), dot(${name}, N_AXIS));
    vec2 r = vec2(bendCa * c.x - bendSa * c.y, bendSa * c.x + bendCa * c.y);
    ${name} = vec3(${name}.x, 0.0, 0.0) + T_AXIS * r.x + N_AXIS * r.y;
  }
`;

/**
 * Prepare the given band meshes for opening. Returns a controller:
 * `set(amount)` runs from 0 (buckled loop) to 1 (flat strap), and
 * `recede(amount)` sinks the strap behind the case and dissolves it while the
 * layers peel, so the body has the frame to itself.
 */
export function setupBandOpen(meshes) {
  const uOpen = { value: 0 };

  meshes.forEach((mesh) => {
    prepareGeometry(mesh);
    // Materials are shared with case parts, so the band gets its own.
    const material = mesh.material.clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOpen = uOpen;
      shader.vertexShader = SHADER_HEADER + shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>\n${SHADER_BEND}${rotateInPlane("objectNormal")}\n#ifdef USE_TANGENT\n${rotateInPlane("objectTangent")}\n#endif`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n  transformed = vec3(transformed.x, 0.0, 0.0) + T_AXIS * bendTD.x + N_AXIS * bendTD.y;`
        );
    };
    material.customProgramCacheKey = () => "band-open";
    material.transparent = true;
    mesh.material = material;
    // The bent strap leaves its original bounds; never cull it.
    mesh.frustumCulled = false;
  });

  const SINK = 6;
  return {
    set(amount) {
      uOpen.value = amount;
    },
    recede(amount) {
      const opacity = 1 - Math.min(1, Math.max(0, (amount - 0.1) / 0.5));
      meshes.forEach((mesh) => {
        mesh.position.copy(N).multiplyScalar(-SINK * amount);
        mesh.material.opacity = opacity;
        mesh.visible = opacity > 0;
      });
    },
  };
}
