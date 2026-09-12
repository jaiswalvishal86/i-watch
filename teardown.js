/**
 * Exploded view of the watch. Every mesh in the GLB sits at the origin of its
 * own node, so a part is "exploded" by translating its meshes along the screen
 * normal (front/back), the 12 o'clock axis (up/down the wrist) or sideways.
 * The band is the exception: it unbends in place, driven by the same amount.
 * Offsets are in the model's own units (the case is about 4 units wide).
 */
import * as THREE from "three";

const NORMAL = new THREE.Vector3(0, 0.573, 0.819).normalize(); // out of the display
const UP = new THREE.Vector3(0, 0.819, -0.573).normalize(); // toward 12 o'clock
const SIDE = new THREE.Vector3(1, 0, 0); // toward the Digital Crown

// `order` is the peel stage (0 = first layer to lift off the front). The band
// has no stage: it slides sideways out of the case before the peel starts.
export const PARTS = [
  {
    id: "display",
    order: 0,
    label: "Retina display",
    side: "right",
    names: ["wmnqxNpNCdRfDfA", "TgXjmfNiJNmBEaf"],
    n: 4.6,
  },
  {
    id: "gasket",
    order: 1,
    names: ["qfqlcqjRdzzVekA", "khaHlXdxjItYhNs"],
    n: 2.9,
  },
  {
    id: "bezel",
    order: 2,
    label: "Titanium bezel",
    side: "right",
    names: ["KZLnjqsQgoygPoi", "lTuqHocPHeeYuLO"],
    n: 1.4,
  },
  {
    id: "case",
    order: 3,
    label: "49mm titanium case",
    side: "left",
    names: ["wMgdGPGcmgrPUeE", "DpLeqowIFgYtGjG", "eXUJdTIAeUGmQLZ", "IXiSHYGuoMgcNgF"],
    n: -0.2,
  },
  {
    id: "crown",
    order: 3,
    label: "Digital Crown",
    side: "auto",
    names: ["cUdLcKThVrgrQtG", "uwsZHcLJnpKqEWY", "dDmAxNyjhIDOSOh", "dApvNLhuSmTYFHU", "usBhaSMGegdgFZD"],
    x: 2.8,
    n: -0.2,
  },
  {
    id: "sideButton",
    order: 3,
    names: ["sYBCdasHzmkyDRS", "slfmzSCVEebgEnx"],
    x: 2.2,
    n: -0.2,
  },
  {
    id: "action",
    order: 3,
    label: "Action button",
    side: "auto",
    names: ["ARsYRDtRfaqRvjc", "dEgYDFMHfbkpmEF"],
    x: -2.6,
    n: -2.0,
  },
  {
    id: "backRim",
    order: 4,
    names: ["vWfihlqoNhaJTLj", "yPaUlGyzZhvStMM", "XYTcEkWJWbbjayl", "yXwlQnMKInchVwb", "BDhXHhWQPzbsApC"],
    n: -2.4,
  },
  {
    id: "back",
    order: 5,
    label: "Ceramic back",
    side: "left",
    names: ["ukHQvPcopDbGAeP", "oNBZPqvuuOZaMJD", "wlIPQLVNyFEOcyR", "LWVGlhvktNPWDmu", "PPhvAUHUGzJYMhL"],
    n: -4.3,
  },
  {
    id: "sensor",
    order: 6,
    label: "Heart rate sensor",
    side: "right",
    names: [
      "dutMHxWYxKkWoIl",
      "KsxIrenucRYdQlx",
      "PTPnChoGCzenuOx",
      "vaRMlNGtRRowtqF",
      "fCkJQDPNwsNBzWm",
      "YbfvuZWRqXlvTkW",
      "scpcAfQFCzMwocy",
    ],
    n: -6.3,
  },
  {
    id: "band",
    label: "Alpine Loop",
    side: "auto",
    names: [
      "yFPJxjHCZaMTTSP",
      "hFurRdLJljkLFkB",
      "SAesXTqirPZWRXc",
      "uFzdsQxnXjPAlfo",
      "DmhCzDQXADCcXPt",
      "cYPgdqcCkfmEnrF",
      "DPJxFEyTsdtZHfm",
      "vdoUifIjrUGtLiS",
    ],
    stage: "band",
    // The band does not translate: it unbends in place (see band-open.js).
    // The anchor sits on the opened upper strap.
    anchor: new THREE.Vector3(0, 3.3, 1.4),
  },
];

/**
 * Resolve the part list against a loaded model. Returns the parts with their
 * meshes, a rest-state anchor point (mesh-local) and the full explode offset.
 */
export function setupTeardown(model) {
  const box = new THREE.Box3();
  const parts = PARTS.map((part) => {
    const meshes = part.names
      .map((name) => model.getObjectByName(name))
      .filter((obj) => obj && obj.isMesh);

    box.makeEmpty();
    meshes.forEach((mesh) => {
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox);
    });
    const anchor = part.anchor ? part.anchor.clone() : box.getCenter(new THREE.Vector3());
    // How far the callout dot sits from the anchor on either side, so the
    // leader line starts at the part's edge rather than inside it.
    const reach = {
      left: anchor.x - box.min.x + 0.3,
      right: box.max.x - anchor.x + 0.3,
    };

    const offset = new THREE.Vector3()
      .addScaledVector(NORMAL, part.n || 0)
      .addScaledVector(UP, part.t || 0)
      .addScaledVector(SIDE, part.x || 0);

    return { ...part, meshes, anchor, reach, offset, bounds: box.clone() };
  });

  const missing = parts.filter((p) => p.meshes.length !== p.names.length);
  if (missing.length) {
    console.warn("teardown: some meshes were not found", missing.map((p) => p.id));
  }

  return {
    parts,
    /**
     * Move every part along its offset. `amountFor(part)` returns 0
     * (assembled) to 1 (fully apart) for that part.
     */
    apply(amountFor) {
      parts.forEach((part) => {
        const amount = amountFor(part);
        part.amount = amount;
        part.meshes.forEach((mesh) => {
          mesh.position.copy(part.offset).multiplyScalar(amount);
        });
      });
    },
  };
}
