/**
 * Live watch faces drawn on a 2D canvas and used as the display's emissive map.
 * Several face styles are available; `setPosition` slides between them the
 * way the face switcher does. Every face shows the real local time. Static
 * dial artwork is painted once per face; hands and numerals redraw at ~30 fps.
 */
import * as THREE from "three";

const W = 900;
const H = 1100; // matches the display mesh aspect (3.27 : 3.99)
const CX = W / 2;
const CY = H / 2;
const R_RING = 436; // outer bone ring
const R_DIAL = 336; // inner black dial

const INK = "#0a0a0a";
const BONE = "#ebe6dd";
const ORANGE = "#ff5b1f";
const WHITE = "#f6f3ee";
const GREY = "#7d7a75";
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const DISPLAY = '-apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif';

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

const TAU = Math.PI * 2;
const pad = (n) => String(n).padStart(2, "0");

function radial(g, angle, r0, r1, cx = CX, cy = CY) {
  g.beginPath();
  g.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
  g.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
  g.stroke();
}

function hand(g, angle, length, tail, width, fill, outline, slot) {
  g.save();
  g.translate(CX, CY);
  g.rotate(angle);
  g.lineCap = "round";
  g.lineJoin = "round";
  if (outline) {
    g.strokeStyle = outline;
    g.lineWidth = width + 8;
    g.beginPath();
    g.moveTo(0, tail);
    g.lineTo(0, -length);
    g.stroke();
  }
  g.strokeStyle = fill;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(0, tail);
  g.lineTo(0, -length);
  g.stroke();
  if (slot) {
    g.strokeStyle = slot;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, -width * 1.4);
    g.lineTo(0, -length + width * 0.9);
    g.stroke();
  }
  g.restore();
}

function secondsHand(g, angle, length, color) {
  g.save();
  g.translate(CX, CY);
  g.rotate(angle);
  g.lineCap = "round";
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, 70);
  g.lineTo(0, -length);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.arc(0, 70, 13, 0, TAU);
  g.fill();
  g.restore();
}

function cap(g, fill, ring, dot) {
  g.beginPath();
  g.arc(CX, CY, 20, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = ring;
  g.stroke();
  g.beginPath();
  g.arc(CX, CY, 7, 0, TAU);
  g.fillStyle = dot;
  g.fill();
}

const angles = (d) => {
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds() + d.getMilliseconds() / 1000;
  return {
    h,
    m,
    s,
    hour: (((h % 12) + m / 60 + s / 3600) / 12) * TAU,
    minute: ((m + s / 60) / 60) * TAU,
    second: (s / 60) * TAU,
  };
};

/* ------------------------------------------------------------------ faces */

const wayfinder = {
  name: "Wayfinder",
  paint(g) {
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);

    g.beginPath();
    g.arc(CX, CY, R_RING, 0, TAU);
    g.fillStyle = BONE;
    g.fill();

    g.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const hour = i % 5 === 0;
      g.strokeStyle = hour ? INK : ORANGE;
      g.lineWidth = hour ? 6 : 3;
      radial(g, a, R_DIAL + 12, R_DIAL + (hour ? 40 : 28));
    }

    g.fillStyle = INK;
    g.font = `700 46px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      const r = R_DIAL + 74;
      g.fillText(String(i), CX + Math.cos(a) * r, CY + Math.sin(a) * r + 2);
    }

    g.beginPath();
    g.arc(CX, CY, R_DIAL, 0, TAU);
    g.fillStyle = INK;
    g.fill();

    g.beginPath();
    g.arc(CX, CY, R_DIAL - 10, 0, TAU);
    g.strokeStyle = ORANGE;
    g.lineWidth = 4;
    g.stroke();

    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const hour = i % 5 === 0;
      g.strokeStyle = hour ? WHITE : GREY;
      g.lineWidth = hour ? 4 : 2;
      radial(g, a, R_DIAL - (hour ? 44 : 34), R_DIAL - 22);
    }

    // 24-hour sub-dial at 9 o'clock
    const sx = CX - 150;
    const sy = CY;
    g.beginPath();
    g.arc(sx, sy, 74, 0, TAU);
    g.strokeStyle = GREY;
    g.lineWidth = 2;
    g.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU - Math.PI / 2;
      const major = i % 6 === 0;
      g.strokeStyle = major ? WHITE : GREY;
      g.lineWidth = major ? 3 : 2;
      radial(g, a, major ? 58 : 64, 70, sx, sy);
    }
    g.fillStyle = GREY;
    g.font = `600 18px ${FONT}`;
    g.fillText("24", sx, sy - 38);
    g.fillText("12", sx, sy + 40);
  },
  draw(g, d) {
    const t = angles(d);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = ORANGE;
    g.font = `700 24px ${FONT}`;
    g.fillText(`${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]}`, CX + 160, CY - 30);
    g.fillStyle = WHITE;
    g.font = `700 64px ${FONT}`;
    g.fillText(String(d.getDate()), CX + 160, CY + 22);

    const a24 = ((t.h + t.m / 60) / 24) * TAU - Math.PI / 2;
    g.save();
    g.translate(CX - 150, CY);
    g.strokeStyle = ORANGE;
    g.lineCap = "round";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(Math.cos(a24 + Math.PI) * 14, Math.sin(a24 + Math.PI) * 14);
    g.lineTo(Math.cos(a24) * 50, Math.sin(a24) * 50);
    g.stroke();
    g.fillStyle = WHITE;
    g.beginPath();
    g.arc(0, 0, 6, 0, TAU);
    g.fill();
    g.restore();

    hand(g, t.hour, 190, 34, 30, WHITE, INK, INK);
    hand(g, t.minute, 290, 34, 26, WHITE, INK, INK);
    secondsHand(g, t.second, 318, ORANGE);
    cap(g, WHITE, INK, ORANGE);
  },
};

const modular = {
  name: "Modular Ultra",
  paint(g) {
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);
    // seconds track hugging the display edge
    g.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const major = i % 5 === 0;
      g.strokeStyle = major ? WHITE : GREY;
      g.lineWidth = major ? 4 : 2;
      radial(g, a, 418 - (major ? 30 : 18), 418, CX, CY);
    }
  },
  draw(g, d) {
    const t = angles(d);
    g.textBaseline = "middle";

    // seconds sweep on the edge track
    g.save();
    g.beginPath();
    g.arc(CX, CY, 414, -Math.PI / 2, -Math.PI / 2 + t.second);
    g.strokeStyle = ORANGE;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.stroke();
    g.restore();

    g.textAlign = "left";
    g.fillStyle = ORANGE;
    g.font = `700 34px ${FONT}`;
    g.fillText(`${DAYS[d.getDay()]} ${d.getDate()}`, 160, 300);
    g.fillStyle = GREY;
    g.font = `600 26px ${FONT}`;
    g.fillText(MONTHS[d.getMonth()], 160, 340);

    const hour12 = t.h % 12 || 12;
    g.textAlign = "right";
    g.fillStyle = WHITE;
    g.font = `700 250px ${FONT}`;
    g.fillText(`${hour12}:${pad(t.m)}`, 760, 560);

    g.textAlign = "left";
    g.fillStyle = GREY;
    g.font = `600 26px ${FONT}`;
    g.fillText("UTC", 160, 760);
    const utc = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    g.fillStyle = WHITE;
    g.font = `700 44px ${FONT}`;
    g.fillText(utc, 160, 805);

    g.textAlign = "right";
    g.fillStyle = GREY;
    g.font = `600 26px ${FONT}`;
    g.fillText("SEC", 740, 760);
    g.fillStyle = ORANGE;
    g.font = `700 44px ${FONT}`;
    g.fillText(pad(Math.floor(t.s)), 740, 805);
  },
};

const numerals = {
  name: "Numerals Duo",
  paint(g) {
    g.fillStyle = INK;
    g.fillRect(0, 0, W, H);
  },
  draw(g, d) {
    const t = angles(d);
    const hour12 = t.h % 12 || 12;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = BONE;
    g.font = `900 400px ${DISPLAY}`;
    g.fillText(pad(hour12), CX, 320);
    g.fillStyle = ORANGE;
    g.fillText(pad(t.m), CX, 740);

    g.fillStyle = GREY;
    g.font = `600 36px ${DISPLAY}`;
    g.textAlign = "right";
    g.fillText(`${DAYS[d.getDay()]} ${d.getDate()}`, 830, 1030);
    g.textAlign = "left";
    g.fillText(pad(Math.floor(t.s)), 70, 1030);
  },
};

const simple = {
  name: "Simple",
  paint(g) {
    g.fillStyle = BONE;
    g.fillRect(0, 0, W, H);
    g.lineCap = "round";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const hour = i % 5 === 0;
      g.strokeStyle = INK;
      g.lineWidth = hour ? 5 : 2;
      radial(g, a, 426 - (hour ? 40 : 18), 426);
    }
    g.fillStyle = INK;
    g.font = `500 64px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("12", CX, CY - 318);
    g.fillText("6", CX, CY + 322);
    g.fillText("9", CX - 318, CY + 2);
    g.fillText("3", CX + 318, CY + 2);
  },
  draw(g, d) {
    const t = angles(d);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = INK;
    g.font = `500 40px ${FONT}`;
    g.fillText(`${DAYS[d.getDay()]} ${d.getDate()}`, CX, CY + 180);

    hand(g, t.hour, 200, 30, 12, INK);
    hand(g, t.minute, 310, 30, 10, INK);
    secondsHand(g, t.second, 330, ORANGE);
    cap(g, BONE, INK, ORANGE);
  },
};

export const FACES = [wayfinder, modular, numerals, simple];

export function createWatchFace() {
  // Static artwork per face, painted once.
  const dials = FACES.map((face) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    face.paint(c.getContext("2d"));
    return c;
  });

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  let lastDraw = 0;
  let position = 0; // 0..FACES.length-1, fractional while switching
  let drawnPosition = -1;

  const drawFace = (i, dx, d) => {
    g.save();
    g.translate(dx, 0);
    g.drawImage(dials[i], 0, 0);
    FACES[i].draw(g, d);
    g.restore();
  };

  const draw = (now) => {
    const d = new Date();
    const index = Math.min(FACES.length - 1, Math.floor(position));
    const frac = position - index;
    if (frac > 0.001 && index + 1 < FACES.length) {
      drawFace(index, -frac * W, d);
      drawFace(index + 1, (1 - frac) * W, d);
    } else {
      drawFace(index, 0, d);
    }
    texture.needsUpdate = true;
    lastDraw = now;
    drawnPosition = position;
  };

  draw(performance.now());

  return {
    texture,
    /** Redraw if enough time has passed (~30 fps) or the face moved. */
    update(now = performance.now()) {
      if (now - lastDraw >= 33 || Math.abs(position - drawnPosition) > 0.002) {
        draw(now);
      }
    },
    /** Slide the switcher: 0 is the first face, N-1 the last. */
    setPosition(value) {
      position = Math.min(FACES.length - 1, Math.max(0, value));
    },
    /** Name of the face nearest the current position. */
    currentName() {
      return FACES[Math.round(position)].name;
    },
    /** Attach the face to the display mesh's material. */
    attach(mesh, renderer) {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const material = mesh.material;
      material.emissiveMap = texture;
      material.emissive.set(0xffffff);
      material.needsUpdate = true;
    },
  };
}
