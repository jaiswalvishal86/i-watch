import { animate, inView } from "motion";
import * as THREE from "three";
import {
  EffectComposer,
  GLTFLoader,
  OrbitControls,
  OutputPass,
  RenderPass,
  ShaderPass,
} from "three/examples/jsm/Addons.js";
import { NoiseShader } from "./noise.shader";

const loaderTag = document.querySelector("div.loader");

let currentEffect = 0;
let aimEffect = 0;
let timeoutEffect;

const clock = new THREE.Clock();

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.z = 0.25;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);

document.querySelector(".three-container").appendChild(renderer.domElement);

const gltfLoader = new GLTFLoader();

const loadGroup = new THREE.Group();
loadGroup.position.y = 10;

const scrollGroup = new THREE.Group();
scrollGroup.add(loadGroup);

scene.add(scrollGroup);

animate("header", { y: -100, opacity: 0 });
animate("section.new-drop", { y: -100, opacity: 0 });

gltfLoader.load(
  "watch.glb",
  (gltf) => {
    let theModel = gltf.scene;
    theModel.scale.set(2.5, 2.5, 2.5);

    loadGroup.add(theModel);

    animate(
      "header",
      {
        y: [-100, 0],
        opacity: [0, 1],
      },
      { duration: 1, delay: 2.5 }
    );

    animate(
      "section.new-drop",
      {
        y: [-100, 0],
        opacity: [0, 1],
      },
      { duration: 1, delay: 2 }
    );
    animate("section.content p, section.content img", { y: 100, opacity: 0 });

    inView("section.content", (info) => {
      animate(
        info.target.querySelectorAll("p, img"),
        { y: 0, opacity: 1 },
        { duration: 1, delay: 0.2 }
      );
    });

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

    const currentProgress =
      parseInt(loaderTag.querySelector("span").innerHTML) || 0;

    // Smoothly transition to the new progress value
    animate(
      (t) => {
        const newProgress = Math.round(
          currentProgress + (progress - currentProgress) * t
        );
        loaderTag.querySelector("span").innerHTML = newProgress + "%";
      },
      { duration: 0.3 }
    );
  }
);

const ambientLight = new THREE.AmbientLight("0x404040");
const keyLight = new THREE.DirectionalLight("0xffffff", 2);
keyLight.position.set(-1, 1, 3);

const fillLight = new THREE.DirectionalLight("0xffffff", 0.5);
fillLight.position.set(1, 1, 3);

const backLight = new THREE.DirectionalLight("0xffffff", 1);
backLight.position.set(-1, 3, -1);

camera.add(ambientLight, backLight, keyLight, fillLight);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.update();
controls.enableDamping = true;
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.rotateSpeed = 2;
controls.autoRotateSpeed = 3;
if (window.innerWidth < 600) {
  controls.enabled = false;
}

const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

const noisePass = new ShaderPass(NoiseShader);
noisePass.uniforms.time.value = clock.getElapsedTime();
noisePass.uniforms.effect.value = currentEffect;
noisePass.uniforms.aspectRatio.value = window.innerWidth / window.innerHeight;
composer.addPass(noisePass);

const render = () => {
  controls.update();

  scrollGroup.rotation.set(window.scrollY * 0.001, window.scrollY * 0.005, 0);

  currentEffect += (aimEffect - currentEffect) * 0.05;

  noisePass.uniforms.time.value = clock.getElapsedTime();
  noisePass.uniforms.effect.value = currentEffect;

  requestAnimationFrame(render);
  composer.render();
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

    noisePass.uniforms.aspectRatio.value = lastWidth / lastHeight;

    renderer.setSize(lastWidth, lastHeight);
    composer.setSize(lastWidth, lastHeight);
  }
};

const scroll = () => {
  clearTimeout(timeoutEffect);
  aimEffect = 1;

  timeoutEffect = setTimeout(() => {
    aimEffect = 0;
  }, 1);
};

render();
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("orientationchange", resize);

window.addEventListener("scroll", scroll);
