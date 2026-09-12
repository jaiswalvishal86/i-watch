import { animate } from "motion";
import * as THREE from "three";
import { GLTFLoader, OrbitControls, RoomEnvironment } from "three/examples/jsm/Addons.js";
import { createWatchFace } from "./watch-face";
import { setupTeardown } from "./teardown";
import { setupBandOpen } from "./band-open";
import { FACES } from "./watch-face";
import Lenis from "lenis";
import { createMagnifier } from "./magnifier";

const loaderTag = document.querySelector("div.loader");
const loaderText = loaderTag.querySelector("span");
const loaderBar = loaderTag.querySelector(".loader-bar i");
const teardownSection = document.querySelector("section.teardown");
const labelLayer = document.querySelector(".teardown-labels");
const keyList = document.querySelector(".teardown-key");
const faceLabel = document.querySelector(".face-label");
const faceLabelName = faceLabel.querySelector("span");

// Camera distance at rest. During the zoom and peel the distance is fitted
// live so the exploded parts always sit inside the space under the heading.
const CAMERA_REST = 0.25;
const CAMERA_MIN = 0.14;
const FIT_FILL = 0.88; // fraction of the available box the stack may fill
// Resting tilt (radians about X) that squares the display to the viewer.
const FRONT_TILT = 0.45;
// Presentation pose for the peel, relative to the camera heading: tip the
// stack toward the viewer and turn the crown side in.
const POSE_TILT = -0.42;
const POSE_TURN = -0.6;
// Portrait screens are narrower than the watch at the desktop distance, and
// they show the key under the stack, so the camera sits further back and aims
// a little lower to leave room for it.
const portraitQuery = window.matchMedia("(max-aspect-ratio: 9/10)");
// At rest the watch is framed into whatever height is left beneath the copy
// (hero or teardown heading), so the two never overlap on any viewport.
// Measured at CAMERA_REST: the watch spans this fraction of the viewport
// height, and its visual centre sits this far below the model origin.
const WATCH_HEIGHT_FRACTION = 0.578;
const WATCH_ASPECT = 0.82; // width / height on screen, with room for the idle sway
const WATCH_CENTER_Y = -0.013;
const FRAME_GAP = 24;
const FRAME_BOTTOM = 32;
const FRAME_BOTTOM_PORTRAIT = 84; // leaves room for the face caption
const heroActions = document.querySelector(".hero-actions");
const teardownCopy = document.querySelector(".teardown-copy");
const teardownStage = document.querySelector(".teardown-stage");



// Scroll choreography inside the pinned section (fractions of its travel).
const FACES_PHASE = [0.02, 0.24]; // crown turns, faces switch
const CROWN_TURN = Math.PI; // crown rotation per face
const BAND_OUT = [0.27, 0.42]; // band unbuckles and lies flat
const BAND_ROLL = -0.7; // roll (radians) so the open strap runs off to the side, clear of the heading
const LUG_NAMES = ["DPJxFEyTsdtZHfm", "vdoUifIjrUGtLiS"];
const ZOOM_IN = [0.4, 0.52]; // camera dives onto the body, pose tilts in
const PEEL_START = 0.5; // first layer lifts
const PEEL_STEP = 0.045; // gap between layers
const PEEL_LENGTH = 0.11; // how long each layer takes
const RESTORE = [0.9, 1]; // everything returns before the next section

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// Smooth scrolling. The render loop reads the native scroll position, so
// Lenis slots in without touching the choreography.
const lenis = new Lenis({ lerp: 0.1 });

const scene = new THREE.Scene();

// The scene is small and the flat strap reaches toward the lens when the
// camera dives onto the body, so the near plane sits very close.
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.01,
  20
);
camera.position.z = CAMERA_REST;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Image-based lighting: the glass and titanium reflect a soft studio room
// rather than a single hard point, which is what real reflections look like.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
pmrem.dispose();

document.querySelector(".three-container").appendChild(renderer.domElement);

const gltfLoader = new GLTFLoader();

const loadGroup = new THREE.Group();
loadGroup.position.y = 10;

const scrollGroup = new THREE.Group();
scrollGroup.add(loadGroup);

scene.add(scrollGroup);

const face = createWatchFace();

// Liquid-glass loupe, toggled from the floating control.
const magnifier = createMagnifier({ renderer, scene, camera });
const magnifierToggle = document.querySelector(".magnifier-toggle");
const setMagnifier = (on) => {
  magnifier.enabled = on;
  magnifierToggle.setAttribute("aria-pressed", String(on));
  document.body.classList.toggle("magnifying", on);
};
magnifierToggle.addEventListener("click", () => setMagnifier(!magnifier.enabled));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && magnifier.enabled) setMagnifier(false);
});
let teardown = null;
let labels = [];
// The case's centre in its own node space, and that node, for aiming the camera.
let bodyCenter = new THREE.Vector3();
let bodyNode = null;
let bandOpen = null;
let crownPart = null;
const crownCenter = new THREE.Vector3();
const crownQuat = new THREE.Quaternion();
const crownShift = new THREE.Vector3();

animate("header", { y: -100, opacity: 0 });
animate("section.hero", { y: -100, opacity: 0 });

// Callouts for the exploded view. Wide screens get a leader line and the
// name beside each part; portrait screens get a numbered marker on the part
// and a key under the stack, since the names cannot fit beside it there.
const buildLabels = (parts) =>
  parts
    .filter((part) => part.label)
    .map((part, i) => {
      const el = document.createElement("div");
      el.className = "part-label";
      el.innerHTML = `<b>${i + 1}</b><svg viewBox="0 0 140 48" aria-hidden="true"><circle cx="4" cy="44" r="3.5"/><polyline points="4,44 44,6 128,6"/></svg><span>${part.label}</span>`;
      labelLayer.appendChild(el);

      const li = document.createElement("li");
      li.innerHTML = `<b>${i + 1}</b><span>${part.label}</span>`;
      keyList.appendChild(li);
      return { part, el, li };
    });

gltfLoader.load(
  "watch.glb",
  (gltf) => {
    let theModel = gltf.scene;
    theModel.scale.set(2.5, 2.5, 2.5);

    loadGroup.add(theModel);

    const display = theModel.getObjectByName("wmnqxNpNCdRfDfA");
    if (display) {
      face.attach(display, renderer);
      // The screen is emissive: keep it out of tone mapping so it stays
      // crisp, and let only a faint reflection sit over it.
      display.material.toneMapped = false;
      display.material.metalness = 0;
      display.material.roughness = 0.45;
      display.material.envMapIntensity = 0.05;
    }
    // The display's glass plate is modelled as a metallic mirror; treat it as
    // dielectric cover glass with a soft, restrained reflection instead.
    const glass = theModel.getObjectByName("TgXjmfNiJNmBEaf");
    if (glass) {
      glass.material.metalness = 0;
      glass.material.roughness = 0.35;
      glass.material.envMapIntensity = 0.1;
    }

    teardown = setupTeardown(theModel);
    labels = buildLabels(teardown.parts);
    const casePart = teardown.parts.find((p) => p.id === "case");
    bodyCenter = casePart.anchor.clone();
    bodyNode = casePart.meshes[0].parent;

    crownPart = teardown.parts.find((p) => p.id === "crown");
    crownCenter.copy(crownPart.anchor);

    // The strap and buckle unbend; the lug connectors stay in the case.
    const bandPart = teardown.parts.find((p) => p.id === "band");
    bandOpen = setupBandOpen(
      bandPart.meshes.filter((mesh) => !LUG_NAMES.includes(mesh.name))
    );

    animate(
      "header",
      {
        y: [-100, 0],
        opacity: [0, 1],
      },
      { duration: 1, delay: 2.5 }
    );

    animate(
      "section.hero",
      {
        y: [-100, 0],
        opacity: [0, 1],
      },
      { duration: 1, delay: 2 }
    );

    animate(
      (t) => {
        loadGroup.position.y = -1 + 1 * t;
      },
      { duration: 2, delay: 1, easing: "ease-in-out" }
    );

    animate(
      "div.loader",
      {
        opacity: 0,
        display: "none",
      },
      {
        duration: 1,
        delay: 1,
      }
    );
  },
  (xhr) => {
    // Add a check for xhr.total being 0
    const progress =
      xhr.total > 0
        ? Math.round((xhr.loaded / xhr.total) * 100)
        : Math.min(99, Math.round((xhr.loaded / 1000000) * 100)); // Fallback calculation

    const currentProgress = parseInt(loaderText.textContent) || 0;

    // Smoothly transition to the new progress value
    animate(
      (t) => {
        const newProgress = Math.round(
          currentProgress + (progress - currentProgress) * t
        );
        loaderText.textContent = newProgress + "%";
        loaderBar.style.width = newProgress + "%";
      },
      { duration: 0.3 }
    );
  }
);

// Direct lights only shape the form now; the environment carries reflections.
const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
const keyLight = new THREE.DirectionalLight(0xffffff, 0.35);
keyLight.position.set(1.6, 2.2, 2.4); // upper right, in front

const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-1.5, 0.6, 2.5); // low left

const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
backLight.position.set(-1, 3, -1);

camera.add(ambientLight, backLight, keyLight, fillLight);
scene.add(camera);

// Drag to look around, but never behind the watch: the face stays in view.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = false;
controls.enablePan = false;
controls.rotateSpeed = 2;
controls.minAzimuthAngle = -1.1;
controls.maxAzimuthAngle = 1.1;
controls.minPolarAngle = Math.PI / 2 - 0.7;
controls.maxPolarAngle = Math.PI / 2 + 0.5;
controls.update();
if (window.innerWidth < 600) {
  controls.enabled = false;
}

/**
 * Where the page is relative to the teardown section.
 * `spin`     scroll distance that drives the idle motion. It freezes while
 *            the teardown is pinned so the watch holds still, then resumes.
 * `progress` 0..1 through the pinned teardown.
 */
const readScroll = () => {
  const rect = teardownSection.getBoundingClientRect();
  const travel = Math.max(1, rect.height - window.innerHeight);
  const scrolled = -rect.top;
  const scrollY = window.scrollY;

  if (scrolled <= 0) {
    // How far the stage has scrolled into view from below (0..1).
    const entering = clamp(1 - rect.top / window.innerHeight, 0, 1);
    return { spin: scrollY, progress: 0, past: 0, entering };
  }
  if (scrolled >= travel) {
    return { spin: scrollY - travel, progress: 1, past: scrolled - travel, entering: 1 };
  }
  return { spin: scrollY - scrolled, progress: scrolled / travel, past: 0, entering: 1 };
};

const anchor = new THREE.Vector3();
const origin = new THREE.Vector3();
const target = new THREE.Vector3();
const bodyWorld = new THREE.Vector3();
const restTarget = new THREE.Vector3();
const fitTarget = new THREE.Vector3();
const corner = new THREE.Vector3();
let fitDistance = CAMERA_REST;
let fitReady = false;

/**
 * Fit the exploded stack (everything but the band) into the space under the
 * heading. The stack is projected through a virtual camera placed at the
 * fitted state itself, so the measured error is the fit's own error and the
 * loop converges regardless of how much of the fit is currently applied.
 * A few iterations converge it; the first call runs them all at once.
 */
const fitCamera = new THREE.PerspectiveCamera();
const fitDir = new THREE.Vector3();
const fitStack = (iterations = 1) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const stageBottom =
    teardownCopy.getBoundingClientRect().bottom - teardownStage.getBoundingClientRect().top;
  const top = stageBottom + FRAME_GAP;
  const bottom = vh - (portraitQuery.matches ? 150 : FRAME_BOTTOM);
  const availW = (vw - 64) * FIT_FILL;
  const availH = Math.max(120, bottom - top) * FIT_FILL;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);

  fitDir.copy(camera.position).sub(controls.target).normalize();
  fitCamera.fov = camera.fov;
  fitCamera.aspect = camera.aspect;
  fitCamera.near = camera.near;
  fitCamera.far = camera.far;
  fitCamera.quaternion.copy(camera.quaternion);
  fitCamera.updateProjectionMatrix();

  for (let it = 0; it < iterations; it++) {
    fitCamera.position.copy(fitTarget).addScaledVector(fitDir, fitDistance);
    fitCamera.updateMatrixWorld(true);
    fitCamera.matrixWorldInverse.copy(fitCamera.matrixWorld).invert();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    teardown.parts.forEach((part) => {
      if (part.stage === "band" || !part.meshes.length) return;
      const matrix = part.meshes[0].parent.matrixWorld;
      const b = part.bounds;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        corner.addScaledVector(part.offset, part.amount).applyMatrix4(matrix).project(fitCamera);
        minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y);
      }
    });
    if (minX === Infinity) return;

    const pxW = ((maxX - minX) / 2) * vw;
    const pxH = ((maxY - minY) / 2) * vh;
    const ratio = Math.max(pxW / availW, pxH / availH);
    const wanted = clamp(fitDistance * ratio, CAMERA_MIN, 2);

    // Where the stack's centre landed versus where it should sit.
    const centerPx = ((1 - (minY + maxY) / 2) / 2) * vh;
    const centerPy = (((minX + maxX) / 2 + 1) / 2) * vw;
    const perPixel = (2 * fitDistance * tanHalf) / vh;
    const dy = ((top + bottom) / 2 - centerPx) * perPixel;
    const dx = (centerPy - vw / 2) * perPixel;

    const gain = iterations > 1 ? 0.8 : 0.25;
    fitDistance += (wanted - fitDistance) * gain;
    fitTarget.x += dx * gain;
    fitTarget.y += dy * gain;
  }
  fitReady = true;
};

/** Camera distance and aim that fit the watch under the visible copy. */
const restFraming = () => {
  const vh = window.innerHeight;
  const heroBottom = heroActions.getBoundingClientRect().bottom;
  const stageBottom =
    teardownCopy.getBoundingClientRect().bottom -
    teardownStage.getBoundingClientRect().top;
  const top = Math.max(heroBottom, stageBottom) + FRAME_GAP;
  const bottom = vh - (portraitQuery.matches ? FRAME_BOTTOM_PORTRAIT : FRAME_BOTTOM);
  const avail = Math.max(120, bottom - top);
  const pixels = Math.min(
    avail * 0.9,
    vh * 0.62,
    (window.innerWidth - 64) / WATCH_ASPECT
  );
  const distance = (CAMERA_REST * WATCH_HEIGHT_FRACTION * vh) / pixels;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const targetY =
    WATCH_CENTER_Y + (((top + bottom) / 2 - vh / 2) / vh) * (2 * distance * tanHalf);
  return { distance, targetY };
};
const offset = new THREE.Vector3();
const idleEuler = new THREE.Euler();
const idleQuat = new THREE.Quaternion();
const poseQuat = new THREE.Quaternion();
const turnQuat = new THREE.Quaternion();
const rollQuat = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
let heldAzimuth = 0;
let bandFade = 1; // how visible the strap currently is
// The face switcher animates to whichever face the scroll has selected, so it
// never rests half way between two faces.
let facePos = 0;
let lastFrame = 0;

/** How far apart a part is at this point of the scroll. */
const amountFor = (part, progress, restore) => {
  if (part.stage === "band") {
    return smoothstep(BAND_OUT[0], BAND_OUT[1], progress) * restore;
  }
  const start = PEEL_START + part.order * PEEL_STEP;
  return smoothstep(start, start + PEEL_LENGTH, progress) * restore;
};

const updateLabels = (peel, zoom, progress) => {
  void zoom;
  // Portrait key fades in with the peel so it never sits over the intact body.
  keyList.style.opacity = peel;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const model = loadGroup.children[0];
  origin.set(0, 0, 0);
  model.localToWorld(origin).project(camera);

  // Face name callout at the crown while the faces switch.
  const facesVisible =
    smoothstep(FACES_PHASE[0], FACES_PHASE[0] + 0.03, progress) *
    (1 - smoothstep(FACES_PHASE[1], FACES_PHASE[1] + 0.03, progress));
  faceLabel.style.opacity = facesVisible;
  if (facesVisible > 0 && crownPart) {
    faceLabelName.textContent = face.currentName();
    if (portraitQuery.matches) {
      // Portrait: a caption under the watch, positioned by CSS.
      faceLabel.style.left = "";
      faceLabel.style.top = "";
    } else {
      anchor.copy(crownPart.anchor);
      anchor.x += crownPart.reach.right;
      crownPart.meshes[0].parent.localToWorld(anchor).project(camera);
      faceLabel.style.left = `${((anchor.x + 1) / 2) * vw}px`;
      faceLabel.style.top = `${((1 - anchor.y) / 2) * vh}px`;
    }
  }

  labels.forEach(({ part, el, li }) => {
    const mesh = part.meshes[0];
    if (!mesh) return;

    // The band's label shows once the strap lies open, until the zoom.
    const visible =
      part.stage === "band"
        ? smoothstep(0.75, 1, part.amount) * bandFade
        : smoothstep(0.55, 1, part.amount);
    el.style.opacity = visible;
    li.style.opacity = 0.35 + 0.65 * visible;
    if (visible <= 0) return;

    anchor.copy(part.anchor).addScaledVector(part.offset, part.amount);
    mesh.parent.localToWorld(anchor).project(camera);

    let side = part.side;
    if (side === "auto") side = anchor.x >= origin.x ? "right" : "left";
    // Re-project from the part's edge on the chosen side.
    anchor.copy(part.anchor).addScaledVector(part.offset, part.amount);
    anchor.x += side === "left" ? -part.reach.left : part.reach.right;
    mesh.parent.localToWorld(anchor).project(camera);
    el.classList.toggle("left", side === "left");
    el.style.left = `${((anchor.x + 1) / 2) * vw}px`;
    el.style.top = `${((1 - anchor.y) / 2) * vh}px`;
  });
};

const render = (now) => {
  lenis.raf(now);
  const { spin, progress, past, entering } = readScroll();

  // The stage heading would sweep up through the watch as the stage scrolls
  // in, so it appears in place over the last stretch of that travel.
  teardownCopy.style.opacity = smoothstep(0.95, 1, entering);
  const restore = 1 - smoothstep(RESTORE[0], RESTORE[1], progress);
  const zoom = smoothstep(ZOOM_IN[0], ZOOM_IN[1], progress) * restore;
  const peel = smoothstep(PEEL_START, PEEL_START + 6 * PEEL_STEP + PEEL_LENGTH, progress) * restore;

  // Idle motion: a slow sway that keeps the display facing the viewer.
  const seconds = now / 1000;
  idleEuler.set(
    FRONT_TILT + 0.18 * Math.sin(spin * 0.0015) + 0.05 * Math.sin(seconds * 0.7),
    0.35 * Math.sin(spin * 0.002) + 0.12 * Math.sin(seconds * 0.45),
    0
  );
  idleQuat.setFromEuler(idleEuler);

  // While the pose blends in, follow the camera's heading so the stack faces
  // the viewer; then hold it so dragging still turns the model.
  if (progress < ZOOM_IN[1]) {
    const delta =
      ((controls.getAzimuthalAngle() - heldAzimuth + Math.PI) % (2 * Math.PI) +
        2 * Math.PI) %
      (2 * Math.PI) -
      Math.PI;
    heldAzimuth += delta * 0.15;
  }
  poseQuat.setFromAxisAngle(X_AXIS, POSE_TILT);
  turnQuat.setFromAxisAngle(Y_AXIS, heldAzimuth + POSE_TURN);
  poseQuat.premultiply(turnQuat);

  // Roll the open strap onto a diagonal, then let the peel pose take over.
  const bandAmount = smoothstep(BAND_OUT[0], BAND_OUT[1], progress) * restore;
  // The roll leads the unbending, so the strap straightens out sideways
  // rather than sweeping up through the heading on its way.
  rollQuat.setFromAxisAngle(Z_AXIS, BAND_ROLL * smoothstep(0, 0.55, bandAmount) * (1 - zoom));
  idleQuat.premultiply(rollQuat);
  scrollGroup.quaternion.copy(idleQuat).slerp(poseQuat, zoom);

  // Faces: the crown turns with the scroll; each half turn selects the next
  // face, and the switcher eases to it in its own time.
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  const facesRaw = smoothstep(FACES_PHASE[0], FACES_PHASE[1], progress) * (FACES.length - 1);
  const faceTarget = Math.round(facesRaw);
  facePos += (faceTarget - facePos) * (1 - Math.exp(-dt / 0.09));
  if (Math.abs(faceTarget - facePos) < 0.002) facePos = faceTarget;
  face.setPosition(facePos);

  if (teardown) {
    teardown.apply((part) => amountFor(part, progress, restore));
    bandOpen.set(bandAmount);
    bandOpen.recede(Math.max(clamp(zoom * 2.5, 0, 1), peel));
    bandFade = 1 - smoothstep(0.1, 0.6, Math.max(clamp(zoom * 2.5, 0, 1), peel));

    // Spin the crown about its own axis (X through its centre).
    crownQuat.setFromAxisAngle(X_AXIS, facesRaw * CROWN_TURN);
    crownShift.copy(crownCenter).applyQuaternion(crownQuat).sub(crownCenter).negate();
    crownPart.meshes.forEach((mesh) => {
      mesh.quaternion.copy(crownQuat);
      mesh.position.add(crownShift);
    });
  }

  // Aim the camera at the case as it zooms in, keeping its orbit offset.
  const framing = restFraming();
  restTarget.set(0, framing.targetY, 0);
  offset.copy(camera.position).sub(controls.target);

  if (teardown && zoom > 0) {
    if (!fitReady && bodyNode) {
      // Start the fit from the case centre at the resting distance and
      // converge it before any of it is applied.
      bodyWorld.copy(bodyCenter);
      bodyNode.localToWorld(bodyWorld);
      fitTarget.copy(bodyWorld);
      fitDistance = framing.distance;
      fitStack(12);
    } else {
      fitStack();
    }
  } else {
    fitReady = false;
  }

  target.copy(restTarget);
  if (zoom > 0) target.lerp(fitTarget, zoom);
  offset.setLength(lerp(framing.distance, fitDistance, zoom));

  controls.target.copy(target);
  camera.position.copy(target).add(offset);
  controls.update();

  // Once the pinned stage ends, the watch scrolls away with the page like
  // any other content instead of floating over the sections below.
  const worldPerPixel =
    (2 * offset.length() * Math.tan((camera.fov * Math.PI) / 360)) / window.innerHeight;
  scrollGroup.position.y = past * worldPerPixel;

  face.update(now);
  if (teardown) updateLabels(peel, zoom, progress);

  renderer.render(scene, camera);
  magnifier.render();
  requestAnimationFrame(render);
};

let lastWidth = window.innerWidth;
let lastHeight = window.innerHeight;

const resize = () => {
  // Check if the actual window dimensions have changed
  if (window.innerWidth !== lastWidth || window.innerHeight !== lastHeight) {
    lastWidth = window.innerWidth;
    lastHeight = window.innerHeight;

    camera.aspect = lastWidth / lastHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(lastWidth, lastHeight);
    magnifier.resize();
  }
};

requestAnimationFrame(render);
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("orientationchange", resize);
