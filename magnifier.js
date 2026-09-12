/**
 * A liquid-glass loupe that follows the pointer.
 *
 * Each frame the scene is rendered a second time through a camera whose
 * projection is narrowed to just the patch of screen under the lens, into a
 * small high-resolution target. A circular quad is then drawn over the main
 * render, sampling that target through a sphere: view rays are refracted at
 * the glass surface, once per colour channel, which magnifies the patch and
 * gives the chromatic fringe and edge bulge of a real lens.
 */
import * as THREE from "three";

const LENS_RADIUS = 140; // CSS px on screen
const ZOOM = 2.6;
const TARGET_SIZE = 1024;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tLens;
  uniform float uAlpha;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;

    // Sphere surface normal at this pixel.
    float z = sqrt(1.0 - r2);
    vec3 n = vec3(p, z);
    vec3 eye = vec3(0.0, 0.0, -1.0);

    // Refract once per channel so the fringe grows toward the rim.
    vec3 tr = refract(eye, n, 1.0 / 1.46);
    vec3 tg = refract(eye, n, 1.0 / 1.50);
    vec3 tb = refract(eye, n, 1.0 / 1.54);
    float depth = 0.22;
    vec4 cr = texture2D(tLens, vUv + tr.xy * depth);
    vec4 cg = texture2D(tLens, vUv + tg.xy * depth);
    vec4 cb = texture2D(tLens, vUv + tb.xy * depth);
    vec3 col = vec3(cr.r, cg.g, cb.b);
    float a = (cr.a + cg.a + cb.a) / 3.0;
    // The offscreen render is linear and untonemapped; bring it to the same
    // look as the main frame before shading the glass over it.
    #ifdef TONE_MAPPING
      col = toneMapping(col);
    #endif

    // Glass body: a faint frost so the sphere reads over the empty page,
    // a bright specular from the upper left, and a soft rim.
    float frost = 0.10;
    vec3 light = normalize(vec3(-0.55, 0.65, 0.55));
    float spec = pow(max(dot(n, light), 0.0), 48.0);
    float rim = pow(1.0 - z, 2.5);
    float edge = smoothstep(0.90, 1.0, sqrt(r2));

    col = mix(vec3(0.96), col, a);
    col += vec3(1.0) * spec * 0.75;
    col = mix(col, vec3(0.99), rim * 0.35);
    col = mix(col, vec3(0.62, 0.62, 0.64), edge * 0.45);

    float alpha = max(a, frost);
    alpha = max(alpha, spec * 0.9);
    alpha = max(alpha, rim * 0.5);
    alpha = max(alpha, edge * 0.55);
    alpha *= 1.0 - smoothstep(0.985, 1.0, sqrt(r2));

    gl_FragColor = vec4(col, alpha * uAlpha);
    #include <colorspace_fragment>
  }
`;

export function createMagnifier({ renderer, scene, camera }) {
  const target = new THREE.WebGLRenderTarget(TARGET_SIZE, TARGET_SIZE, {
    samples: 4,
    colorSpace: THREE.SRGBColorSpace,
  });

  const lensCamera = new THREE.PerspectiveCamera();
  const lensScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  overlayCamera.position.z = 1;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { tLens: { value: target.texture }, uAlpha: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(LENS_RADIUS * 2, LENS_RADIUS * 2),
    material
  );
  lensScene.add(quad);

  const pointer = { x: -1e4, y: -1e4, inside: false };
  let enabled = false;
  let alpha = 0;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    overlayCamera.left = -w / 2;
    overlayCamera.right = w / 2;
    overlayCamera.top = h / 2;
    overlayCamera.bottom = -h / 2;
    overlayCamera.updateProjectionMatrix();
  };
  resize();

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
  });
  document.addEventListener("pointerleave", () => {
    pointer.inside = false;
  });
  window.addEventListener("blur", () => {
    pointer.inside = false;
  });

  return {
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = value;
    },
    resize,
    /** Draw the loupe over the current frame. Call after the main render. */
    render() {
      const want = enabled && pointer.inside ? 1 : 0;
      alpha += (want - alpha) * 0.2;
      if (alpha < 0.005) {
        alpha = 0;
        return;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;

      // Narrow the projection to the patch under the lens, at ZOOM.
      const patch = (LENS_RADIUS * 2) / ZOOM;
      lensCamera.position.copy(camera.position);
      lensCamera.quaternion.copy(camera.quaternion);
      lensCamera.fov = camera.fov;
      lensCamera.aspect = camera.aspect;
      lensCamera.near = camera.near;
      lensCamera.far = camera.far;
      lensCamera.setViewOffset(
        w,
        h,
        pointer.x - patch / 2,
        pointer.y - patch / 2,
        patch,
        patch
      );
      lensCamera.updateProjectionMatrix();

      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, lensCamera);
      renderer.setRenderTarget(null);

      quad.position.set(pointer.x - w / 2, h / 2 - pointer.y, 0);
      material.uniforms.uAlpha.value = alpha;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(lensScene, overlayCamera);
      renderer.autoClear = autoClear;
    },
  };
}
