// Strzelanina na Łące w Tucznie u Taty i Zosi — prosta gra w przeglądarce.
// Sterowanie: WASD lub strzałki, Shift bieg, kliknięcie wskazuje cel.
// E podnosi broń albo wsiada na jednorożca, Q zmienia broń, spacja albo prawy przycisk strzela.
// Łapacz przenosi motyla do domku. W domku pistolet zabija, a łapacz wypuszcza go na łąkę.

"use strict";

window.addEventListener("error", (event) => {
  showError(event.error || event.message);
});

(() => {
  const canvas = document.getElementById("game");
  const screen = canvas.getContext("2d");

  const TILE = 16;
  const COLS = 96;
  const ROWS = 80;
  const WORLD_W = COLS * TILE;
  const WORLD_H = ROWS * TILE;
  const SEED = 23;
  const SPR_W = 24;
  const SPR_H = 36;

  const T = { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3 };
  const DECOR = { DAISY: 1, TULIP: 2, POPPY: 3, BELL: 4, MUSH: 5, PEBBLE: 6, REED: 7, TUFT: 8 };

  const COL = {
    outline: 0x2b221c,
    hair: 0x6b3f24,
    hairD: 0x4a2b16,
    hairL: 0x8d5a34,
    skin: 0xffd2b3,
    skinD: 0xe4ae86,
    eye: 0x241c18,
    blush: 0xf09990,
    shirt: 0x3e8ec0,
    shirtD: 0x2c6894,
    shirtL: 0x8ec4e4,
    pants: 0x3c4a6c,
    pantsD: 0x2a3550,
    shoe: 0x2a2420,
    shoeL: 0x5a4c42,
  };

  const WALK = [
    { raiseL: 0, raiseR: 3, tuck: 0, arm: 1, bob: 0 },
    { raiseL: 0, raiseR: 0, tuck: 1, arm: 0, bob: 1 },
    { raiseL: 3, raiseR: 0, tuck: 0, arm: -1, bob: 0 },
    { raiseL: 0, raiseR: 0, tuck: 1, arm: 0, bob: 1 },
  ];
  const IDLE = { raiseL: 0, raiseR: 0, tuck: 1, arm: 0, bob: 0 };

  const keys = new Set();
  const view = { w: 320, h: 180, pixel: 3, ox: 0, oy: 0, camX: 0, camY: 0 };
  const player = {
    x: 0,
    y: 0,
    dir: "down",
    face: "down",
    faceTimer: 0,
    phase: 0,
    moving: false,
    lastStep: 0,
    stuck: 0,
    flash: 0,
  };

  let low = document.createElement("canvas");
  let ground;
  let decor;
  let props;
  let field;
  let butterflies;
  let duck;
  let lilies;
  let gun;
  let net;
  let weapon = "gun";
  let unicorn;
  let mounted = false;
  let mountLock = 0;
  let house;
  let indoors = false;
  let doorLock = 0;
  let outsideSpot = { x: 0, y: 0 };
  const ROOM_TW = 10;
  const ROOM_TH = 8;
  const ROOM_W = ROOM_TW * TILE;
  const ROOM_H = ROOM_TH * TILE;
  const roomX = Math.floor((COLS - ROOM_TW) / 2) * TILE;
  const roomY = Math.floor((ROWS - ROOM_TH) / 2) * TILE;
  const bullets = [];
  let shootQueued = false;
  let shootCooldown = 0;
  let target = null;
  let pointerDown = false;
  let pond = { x: 16, y: 14, rx: 5.4, ry: 4 };
  let ponds = [];
  let wade = new Uint8Array(0);
  let waterIndex = new Int16Array(0);
  let waterSheet = document.createElement("canvas");
  const motes = [];
  let chars;
  let hintMode = "";
  let level = 1;
  let score = 0;
  let levelBanner = 0;
  let layout = { pathPhase: 0, pathShift: 0 };
  let treeSprites = [];
  let bushSprites = [];

  let musicOn = true;

  const sfx = {
    ctx: null,
    music: null,
    armed: false,
    arm() {
      this.armed = true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
      if (this.ctx.state !== "running") return null;
      return this.ctx;
    },
  };

  function tone(ctx, t, freq, dur, type, gain, dest) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + Math.min(0.03, dur * 0.4));
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(dest || ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function ensureMusic(ctx) {
    if (!sfx.music) {
      const bus = ctx.createGain();
      bus.gain.value = musicOn ? 1 : 0;
      bus.connect(ctx.destination);
      sfx.music = bus;
    }
    return sfx.music;
  }

  function setMusic(on) {
    musicOn = on;
    if (!on) music.on = false;
    if (sfx.ctx && sfx.music) sfx.music.gain.setValueAtTime(on ? 1 : 0, sfx.ctx.currentTime);
    const button = document.getElementById("music");
    if (!button) return;
    button.textContent = on ? "Muzyka: włączona" : "Muzyka: wyłączona";
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function noteFreq(name) {
    const semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let acc = 0;
    let octChar = name[name.length - 1];
    let letter = name[0];
    if (name[1] === "#") acc = 1;
    if (name[1] === "b") acc = -1;
    const oct = Number(octChar);
    const midi = (oct + 1) * 12 + semi[letter] + acc;
    return 440 * 2 ** ((midi - 69) / 12);
  }

  function playStep(onDirt) {
    const ctx = sfx.arm();
    if (!ctx) return;
    tone(ctx, ctx.currentTime, onDirt ? 196 : 262, 0.045, "triangle", 0.035);
  }

  function playShot() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.07);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  function playPickup() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, noteFreq("E5"), 0.08, "square", 0.04);
    tone(ctx, t + 0.08, noteFreq("A5"), 0.1, "square", 0.04);
  }

  function playHit() {
    const ctx = sfx.arm();
    if (!ctx) return;
    tone(ctx, ctx.currentTime, noteFreq("B3"), 0.12, "triangle", 0.05);
  }

  function playSwing() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, 620, 0.05, "triangle", 0.03);
    tone(ctx, t + 0.04, 880, 0.07, "triangle", 0.025);
  }

  function playCatch() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, noteFreq("E6"), 0.08, "triangle", 0.035);
    tone(ctx, t + 0.07, noteFreq("A6"), 0.12, "triangle", 0.03);
  }

  function playRelease() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, noteFreq("A5"), 0.08, "triangle", 0.03);
    tone(ctx, t + 0.08, noteFreq("E5"), 0.12, "triangle", 0.03);
  }

  function playMount() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, 392, 0.07, "triangle", 0.04);
    tone(ctx, t + 0.07, 523, 0.1, "triangle", 0.035);
  }

  function playHoof() {
    const ctx = sfx.arm();
    if (!ctx) return;
    tone(ctx, ctx.currentTime, 146, 0.04, "triangle", 0.04);
  }

  function playQuack() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, 520, 0.06, "square", 0.045);
    tone(ctx, t + 0.06, 320, 0.12, "square", 0.04);
  }

  function playLevel() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, noteFreq("C5"), 0.1, "square", 0.04);
    tone(ctx, t + 0.1, noteFreq("E5"), 0.1, "square", 0.04);
    tone(ctx, t + 0.2, noteFreq("A5"), 0.18, "square", 0.045);
  }

  function flySpeed() {
    return Math.pow(1.1, level - 1);
  }

  // Uproszczone tematy Chopina (domena publiczna). Poziom 1–10, potem od nowa.
  const TRACKS = [
    {
      eighth: 0.24, per: 6, chords: [2, 4],
      bars: [
        { root: "A2", chord: ["C4", "E4"] },
        { root: "D3", chord: ["F3", "A3"] },
        { root: "A2", chord: ["C4", "E4"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "C3", chord: ["E4", "G4"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "A2", chord: ["C4", "E4"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "A2", chord: ["C4", "E4"] },
        { root: "F2", chord: ["A3", "C4"] },
        { root: "D3", chord: ["F3", "A3"] },
        { root: "E2", chord: ["G#3", "B3"] },
      ],
      melody: [
        [0, "E5", 2], [2, "E5", 2], [4, "F5", 1], [5, "E5", 1],
        [6, "D5", 2], [8, "C5", 2], [10, "D5", 2],
        [12, "E5", 2], [14, "F5", 2], [16, "E5", 2],
        [18, "D5", 2], [20, "C5", 2], [22, "B4", 2],
        [24, "C5", 2], [26, "C5", 2], [28, "D5", 1], [29, "C5", 1],
        [30, "B4", 2], [32, "A4", 2], [34, "B4", 2],
        [36, "C5", 2], [38, "D5", 2], [40, "C5", 2],
        [42, "B4", 2], [44, "A4", 2], [46, "G4", 2],
        [48, "A4", 2], [50, "C5", 2], [52, "E5", 2],
        [54, "A5", 2], [56, "G5", 2], [58, "F5", 2],
        [60, "E5", 2], [62, "D5", 2], [64, "C5", 2],
        [66, "B4", 1], [67, "E5", 1], [68, "A4", 4],
      ],
    },
    {
      eighth: 0.34, per: 8, chords: [0, 4],
      bars: [
        { root: "E2", chord: ["G3", "B3"] },
        { root: "F#2", chord: ["A3", "C4"] },
        { root: "G2", chord: ["B3", "D4"] },
        { root: "A2", chord: ["C4", "E4"] },
        { root: "B2", chord: ["D4", "F#4"] },
        { root: "E2", chord: ["G3", "B3"] },
      ],
      melody: [
        [0, "B4", 4], [4, "A4", 4],
        [8, "G4", 4], [12, "F#4", 4],
        [16, "E4", 6], [22, "F#4", 2],
        [24, "G4", 4], [28, "F#4", 4],
        [32, "E4", 4], [36, "D#4", 4],
        [40, "E4", 8],
      ],
    },
    {
      eighth: 0.22, per: 6, chords: [2, 4],
      bars: [
        { root: "A2", chord: ["C#4", "E4"] },
        { root: "E2", chord: ["B3", "D4"] },
        { root: "A2", chord: ["C#4", "E4"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "A2", chord: ["C#4", "E4"] },
        { root: "D3", chord: ["F#3", "A3"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "A2", chord: ["C#4", "E4"] },
      ],
      melody: [
        [0, "C#5", 2], [2, "E5", 2], [4, "E5", 2],
        [6, "D5", 2], [8, "F#5", 2], [10, "F#5", 2],
        [12, "E5", 2], [14, "A5", 2], [16, "G#5", 2],
        [18, "F#5", 2], [20, "E5", 2], [22, "D5", 2],
        [24, "C#5", 2], [26, "E5", 2], [28, "A4", 4],
        [36, "B4", 2], [38, "C#5", 2], [40, "D5", 2],
        [42, "C#5", 2], [44, "B4", 2], [46, "A4", 2],
      ],
    },
    {
      eighth: 0.3, per: 8, chords: [0, 4],
      bars: [
        { root: "C2", chord: ["G3", "C4", "Eb4"] },
        { root: "Ab1", chord: ["Eb3", "Ab3", "C4"] },
        { root: "F1", chord: ["C3", "F3", "Ab3"] },
        { root: "G1", chord: ["D3", "F3", "B3"] },
        { root: "C2", chord: ["E3", "G3", "C4"] },
        { root: "G1", chord: ["D3", "F3", "G3"] },
        { root: "C2", chord: ["E3", "G3", "C4"] },
        { root: "C2", chord: ["G3", "C4", "Eb4"] },
      ],
      melody: [
        [0, "C5", 4], [4, "G4", 4],
        [8, "Ab4", 4], [12, "G4", 4],
        [16, "F4", 4], [20, "Eb4", 4],
        [24, "D4", 4], [28, "C4", 4],
        [32, "E4", 4], [36, "F4", 4],
        [40, "D4", 4], [44, "B3", 4],
        [48, "C4", 8],
        [56, "Eb5", 4], [60, "C5", 4],
      ],
    },
    {
      eighth: 0.2, per: 6, chords: [2, 4],
      bars: [
        { root: "Eb2", chord: ["G3", "Bb3"] },
        { root: "Bb2", chord: ["D4", "F4"] },
        { root: "Eb2", chord: ["G3", "Bb3"] },
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Bb2", chord: ["D4", "F4"] },
        { root: "Eb2", chord: ["G3", "Bb3"] },
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Bb2", chord: ["D4", "F4"] },
      ],
      melody: [
        [0, "Bb4", 2], [2, "G5", 2], [4, "F5", 1], [5, "Eb5", 1],
        [6, "F5", 2], [8, "G5", 2], [10, "F5", 2],
        [12, "Eb5", 2], [14, "D5", 2], [16, "C5", 2],
        [18, "Bb4", 2], [20, "C5", 2], [22, "D5", 2],
        [24, "Eb5", 4], [28, "F5", 2],
        [30, "G5", 2], [32, "Ab5", 2], [34, "G5", 2],
        [36, "F5", 2], [38, "Eb5", 2], [40, "D5", 2],
        [42, "Eb5", 2], [44, "Bb4", 4],
      ],
    },
    {
      eighth: 0.11, per: 6, chords: [2, 4],
      bars: [
        { root: "Db2", chord: ["F3", "Ab3"] },
        { root: "Ab2", chord: ["Eb3", "Ab3"] },
        { root: "Db2", chord: ["F3", "Ab3"] },
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Gb2", chord: ["Bb3", "Db4"] },
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Db2", chord: ["F3", "Ab3"] },
        { root: "Ab2", chord: ["Eb3", "G3"] },
      ],
      melody: [
        [0, "Ab5", 1], [1, "Ab5", 1], [2, "Ab5", 1], [3, "Ab5", 1], [4, "Gb5", 1], [5, "Ab5", 1],
        [6, "Bb5", 2], [8, "Ab5", 2], [10, "F5", 2],
        [12, "Eb5", 1], [13, "F5", 1], [14, "Gb5", 1], [15, "Ab5", 1], [16, "Bb5", 2],
        [18, "Ab5", 1], [19, "Gb5", 1], [20, "F5", 1], [21, "Eb5", 1], [22, "Db5", 2],
        [24, "F5", 2], [26, "Ab5", 2], [28, "Db6", 2],
        [30, "C6", 1], [31, "Bb5", 1], [32, "Ab5", 2], [34, "Gb5", 2],
        [36, "Ab5", 2], [38, "F5", 2], [40, "Eb5", 2],
        [42, "Db5", 1], [43, "Eb5", 1], [44, "F5", 1], [45, "Gb5", 1], [46, "Ab5", 2],
      ],
    },
    {
      eighth: 0.26, per: 6, chords: [2, 4],
      bars: [
        { root: "C#2", chord: ["E3", "G#3"] },
        { root: "G#2", chord: ["B3", "D#4"] },
        { root: "C#2", chord: ["E3", "G#3"] },
        { root: "F#2", chord: ["A3", "C#4"] },
        { root: "G#2", chord: ["B3", "D#4"] },
        { root: "C#2", chord: ["E3", "G#3"] },
        { root: "A2", chord: ["C#4", "E4"] },
        { root: "G#2", chord: ["B3", "D#4"] },
      ],
      melody: [
        [0, "C#5", 2], [2, "B4", 1], [3, "C#5", 1], [4, "E5", 2],
        [6, "D#5", 2], [8, "C#5", 2], [10, "B4", 2],
        [12, "A4", 2], [14, "G#4", 2], [16, "A4", 2],
        [18, "B4", 2], [20, "C#5", 2], [22, "E5", 2],
        [24, "D#5", 4], [28, "C#5", 2],
        [30, "B4", 2], [32, "A4", 2], [34, "G#4", 2],
        [36, "A4", 2], [38, "B4", 1], [39, "A4", 1], [40, "G#4", 2],
        [42, "F#4", 2], [44, "E4", 2], [46, "C#5", 2],
      ],
    },
    {
      eighth: 0.2, per: 6, chords: [2, 4],
      bars: [
        { root: "Bb2", chord: ["D4", "F4"] },
        { root: "F2", chord: ["A3", "C4"] },
        { root: "Bb2", chord: ["D4", "F4"] },
        { root: "Eb3", chord: ["G3", "Bb3"] },
        { root: "F2", chord: ["A3", "C4"] },
        { root: "Bb2", chord: ["D4", "F4"] },
        { root: "C3", chord: ["E3", "G3"] },
        { root: "F2", chord: ["A3", "C4"] },
      ],
      melody: [
        [0, "F5", 2], [2, "D5", 1], [3, "Bb4", 1], [4, "C5", 2],
        [6, "D5", 2], [8, "F5", 2], [10, "Bb5", 2],
        [12, "A5", 1], [13, "G5", 1], [14, "F5", 2], [16, "Eb5", 2],
        [18, "D5", 2], [20, "C5", 2], [22, "Bb4", 2],
        [24, "D5", 2], [26, "F5", 2], [28, "Bb4", 4],
        [36, "C5", 2], [38, "D5", 2], [40, "Eb5", 2],
        [42, "D5", 1], [43, "C5", 1], [44, "Bb4", 4],
      ],
    },
    {
      eighth: 0.28, per: 8, chords: [0, 4],
      bars: [
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "A2", chord: ["C#4", "E4"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "B2", chord: ["D#4", "F#4"] },
        { root: "E2", chord: ["G#3", "B3"] },
        { root: "A2", chord: ["C#4", "E4"] },
        { root: "B2", chord: ["D#4", "F#4"] },
        { root: "E2", chord: ["G#3", "B3"] },
      ],
      melody: [
        [0, "G#4", 2], [2, "B4", 2], [4, "E5", 4],
        [8, "D#5", 2], [10, "C#5", 2], [12, "B4", 4],
        [16, "A4", 2], [18, "G#4", 2], [20, "F#4", 4],
        [24, "G#4", 2], [26, "A4", 2], [28, "B4", 4],
        [32, "C#5", 2], [34, "B4", 2], [36, "A4", 4],
        [40, "G#4", 2], [42, "F#4", 2], [44, "E4", 4],
        [48, "F#4", 2], [50, "G#4", 2], [52, "A4", 4],
        [56, "B4", 4], [60, "E5", 4],
      ],
    },
    {
      eighth: 0.18, per: 6, chords: [2, 4],
      bars: [
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Eb2", chord: ["G3", "Bb3"] },
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Db3", chord: ["F3", "Ab3"] },
        { root: "Eb2", chord: ["G3", "Bb3"] },
        { root: "Ab2", chord: ["C4", "Eb4"] },
        { root: "Bb2", chord: ["D4", "F4"] },
        { root: "Eb2", chord: ["G3", "Bb3"] },
      ],
      melody: [
        [0, "Eb5", 2], [2, "Eb5", 2], [4, "Eb5", 2],
        [6, "Db5", 1], [7, "C5", 1], [8, "Bb4", 2], [10, "Ab4", 2],
        [12, "C5", 2], [14, "Eb5", 2], [16, "Ab5", 2],
        [18, "G5", 1], [19, "F5", 1], [20, "Eb5", 2], [22, "Db5", 2],
        [24, "C5", 2], [26, "Bb4", 2], [28, "Ab4", 4],
        [36, "Eb5", 2], [38, "F5", 2], [40, "G5", 2],
        [42, "Ab5", 2], [44, "Eb5", 2], [46, "Ab4", 2],
      ],
    },
  ];
  for (const track of TRACKS) track.loop = track.bars.length * track.per;
  const music = { next: 0, step: 0, on: false, id: -1 };

  function musicVoice(ctx, t, name, eighths, type, gain, eighth) {
    tone(ctx, t, noteFreq(name), Math.max(0.05, eighths * eighth * 0.92), type, gain, ensureMusic(ctx));
  }

  function musicTick() {
    const ctx = sfx.ctx;
    if (!ctx || ctx.state !== "running" || !musicOn) return;
    const id = (level - 1) % TRACKS.length;
    const track = TRACKS[id];
    if (!music.on || music.id !== id) {
      music.on = true;
      music.id = id;
      music.step = 0;
      music.next = ctx.currentTime + 0.08;
    }
    while (music.next < ctx.currentTime + 0.35) {
      const step = music.step;
      const when = music.next;
      const bar = track.bars[Math.floor(step / track.per) % track.bars.length];
      const beat = step % track.per;
      if (beat === 0) musicVoice(ctx, when, bar.root, 2, "triangle", 0.045, track.eighth);
      if (track.chords.indexOf(beat) >= 0) {
        for (const chordNote of bar.chord) musicVoice(ctx, when, chordNote, 1, "triangle", 0.014, track.eighth);
      }
      for (const [at, name, len] of track.melody) {
        if (at === step) musicVoice(ctx, when, name, len, "square", 0.028, track.eighth);
      }
      music.step = (step + 1) % track.loop;
      music.next += track.eighth;
    }
  }

  const spawnTx = Math.floor(COLS / 2);
  const spawnTy = Math.floor(ROWS / 2);

  function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function groundAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T.GRASS;
    return ground[ty * COLS + tx];
  }

  function setGround(tx, ty, type) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    ground[ty * COLS + tx] = type;
  }

  function decorAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return 0;
    return decor[ty * COLS + tx];
  }

  function setDecor(tx, ty, type) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return;
    decor[ty * COLS + tx] = type;
  }

  function box(map, x, y, w, h, color) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x + i;
        const py = y + j;
        if (px < 0 || py < 0 || px >= SPR_W || py >= SPR_H) continue;
        map[py * SPR_W + px] = color;
      }
    }
  }

  function addOutline(map) {
    const src = map.slice();
    for (let y = 0; y < SPR_H; y++) {
      for (let x = 0; x < SPR_W; x++) {
        const i = y * SPR_W + x;
        if (src[i]) continue;
        const left = x > 0 && src[i - 1];
        const right = x < SPR_W - 1 && src[i + 1];
        const up = y > 0 && src[i - SPR_W];
        const down = y < SPR_H - 1 && src[i + SPR_W];
        if (left || right || up || down) map[i] = COL.outline;
      }
    }
  }

  function toCanvas(map) {
    const c = document.createElement("canvas");
    c.width = SPR_W;
    c.height = SPR_H;
    const g = c.getContext("2d");
    const img = g.createImageData(SPR_W, SPR_H);
    for (let i = 0; i < map.length; i++) {
      const color = map[i];
      if (!color) continue;
      const o = i * 4;
      img.data[o] = (color >> 16) & 255;
      img.data[o + 1] = (color >> 8) & 255;
      img.data[o + 2] = color & 255;
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function metrics(c, ax) {
    const { width, height } = c;
    const data = c.getContext("2d").getImageData(0, 0, width, height).data;
    let bottom = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) bottom = y;
      }
    }
    return { c, ax, ay: bottom + 1 };
  }

  function flipSprite(src) {
    const c = document.createElement("canvas");
    c.width = src.c.width;
    c.height = src.c.height;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.translate(c.width, 0);
    g.scale(-1, 1);
    g.drawImage(src.c, 0, 0);
    return { c, ax: src.c.width - 1 - src.ax, ay: src.ay };
  }

  function drawLeg(map, x, raise) {
    const y = 22 - raise;
    box(map, x, y, 3, 6, COL.pants);
    box(map, x + 2, y + 1, 1, 4, COL.pantsD);
    box(map, x, y + 5, 3, 2, COL.shoe);
    box(map, x, y + 5, 1, 1, COL.shoeL);
  }

  function drawArm(map, x, dy) {
    const y = 17 + dy;
    box(map, x, y, 2, 5, COL.shirt);
    box(map, x + (x < 12 ? 0 : 1), y, 1, 4, COL.shirtD);
    box(map, x, y + 4, 2, 2, COL.skin);
  }

  function drawFrontBody(map, spec) {
    drawLeg(map, 8 + spec.tuck, spec.raiseL);
    drawLeg(map, 13 - spec.tuck, spec.raiseR);
    drawArm(map, 6, -spec.arm);
    drawArm(map, 16, spec.arm);
    box(map, 8, 17, 8, 6, COL.shirt);
    box(map, 14, 17, 2, 5, COL.shirtD);
    box(map, 9, 17, 3, 1, COL.shirtL);
    box(map, 8, 22, 8, 1, COL.shirtD);
  }

  function drawFace(map, blink) {
    box(map, 11, 15, 2, 2, COL.skin);
    box(map, 7, 4, 10, 3, COL.hair);
    box(map, 6, 6, 12, 3, COL.hair);
    box(map, 8, 4, 4, 1, COL.hairL);
    box(map, 7, 7, 10, 8, COL.skin);
    box(map, 15, 9, 2, 4, COL.skinD);
    box(map, 7, 7, 10, 2, COL.hair);
    box(map, 6, 8, 2, 5, COL.hair);
    box(map, 16, 8, 2, 5, COL.hair);
    box(map, 16, 8, 2, 3, COL.hairD);
    if (!blink) {
      box(map, 9, 10, 1, 2, COL.eye);
      box(map, 14, 10, 1, 2, COL.eye);
    }
    box(map, 8, 13, 1, 1, COL.blush);
    box(map, 15, 13, 1, 1, COL.blush);
  }

  function drawBackHead(map, hideLeftEar) {
    box(map, 7, 4, 10, 12, COL.hair);
    box(map, 6, 7, 12, 8, COL.hair);
    box(map, 8, 4, 4, 1, COL.hairL);
    box(map, 15, 8, 2, 6, COL.hairD);
    if (!hideLeftEar) box(map, 5, 10, 1, 2, COL.skinD);
    box(map, 18, 10, 1, 2, COL.skinD);
  }

  function drawSideBody(map, spec) {
    const stride = spec.tuck ? 0 : 1;
    const frontPlanted = spec.raiseR === 0 && spec.raiseL > 0;
    drawLeg(map, 8, spec.raiseL);
    drawLeg(map, 11 + stride + (frontPlanted ? 1 : 0), spec.raiseR);
    drawArm(map, 8, -spec.arm);
    box(map, 9, 17, 6, 6, COL.shirt);
    box(map, 13, 17, 2, 5, COL.shirtD);
    box(map, 10, 17, 2, 1, COL.shirtL);
    drawArm(map, 13, spec.arm);
  }

  function drawSideHead(map, blink) {
    box(map, 11, 15, 2, 2, COL.skin);
    box(map, 6, 6, 5, 10, COL.hair);
    box(map, 7, 4, 8, 4, COL.hair);
    box(map, 8, 4, 3, 1, COL.hairL);
    box(map, 10, 7, 6, 7, COL.skin);
    box(map, 15, 9, 2, 3, COL.skin);
    box(map, 16, 10, 1, 2, COL.skinD);
    box(map, 9, 6, 6, 2, COL.hair);
    box(map, 8, 8, 2, 4, COL.hair);
    if (!blink) box(map, 13, 10, 1, 2, COL.eye);
    box(map, 14, 13, 1, 1, COL.blush);
  }

  function drawDiagBody(map, spec) {
    const stride = spec.tuck ? 0 : 1;
    drawLeg(map, 7 + stride, spec.raiseL);
    box(map, 7 + stride, 22 - spec.raiseL, 1, 6, COL.pantsD);
    drawLeg(map, 12, spec.raiseR);
    drawArm(map, 6, -spec.arm);
    box(map, 9, 17, 7, 6, COL.shirt);
    box(map, 13, 17, 3, 5, COL.shirtD);
    box(map, 10, 17, 2, 1, COL.shirtL);
    box(map, 9, 22, 7, 1, COL.shirtD);
    drawArm(map, 14, spec.arm);
  }

  function drawDiagHead(map, blink) {
    box(map, 6, 6, 5, 8, COL.hair);
    box(map, 7, 4, 7, 3, COL.hair);
    box(map, 8, 4, 3, 1, COL.hairL);
    box(map, 13, 5, 3, 2, COL.hairD);
    box(map, 10, 8, 7, 7, COL.skin);
    box(map, 15, 9, 2, 4, COL.skinD);
    box(map, 8, 7, 6, 2, COL.hair);
    box(map, 7, 8, 2, 3, COL.hair);
    box(map, 14, 7, 2, 1, COL.hair);
    if (!blink) {
      box(map, 12, 10, 1, 2, COL.eye);
      box(map, 15, 10, 1, 2, COL.eye);
    }
    box(map, 16, 13, 1, 1, COL.blush);
    box(map, 12, 15, 3, 2, COL.skin);
  }

  function bakePose(facing, spec, blink) {
    const map = new Uint32Array(SPR_W * SPR_H);
    if (facing === "side") drawSideBody(map, spec);
    else if (facing === "downright") drawDiagBody(map, spec);
    else drawFrontBody(map, spec);
    if (facing === "down") drawFace(map, blink);
    else if (facing === "up") drawBackHead(map, false);
    else if (facing === "downright") drawDiagHead(map, blink);
    else if (facing === "upright") drawBackHead(map, true);
    else drawSideHead(map, blink);
    addOutline(map);
    return metrics(toCanvas(map), 12);
  }

  function bakeCharacters() {
    function pack(facing) {
      return {
        idle: bakePose(facing, IDLE, false),
        blink: bakePose(facing, IDLE, true),
        walk: WALK.map((spec) => bakePose(facing, spec, false)),
      };
    }
    function mirror(src) {
      return {
        idle: flipSprite(src.idle),
        blink: flipSprite(src.blink),
        walk: src.walk.map(flipSprite),
      };
    }
    const right = pack("side");
    const downRight = pack("downright");
    const upRight = pack("upright");
    return {
      down: pack("down"),
      up: pack("up"),
      right,
      left: mirror(right),
      downright: downRight,
      downleft: mirror(downRight),
      upright: upRight,
      upleft: mirror(upRight),
    };
  }

  function fillDisc(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    const r2 = r * r;
    for (let y = -r; y <= r; y++) {
      const span = Math.floor(Math.sqrt(Math.max(0, r2 - y * y)));
      ctx.fillRect(cx - span, cy + y, span * 2 + 1, 1);
    }
  }

  function bakeTree(variant) {
    const radius = [12, 14, 11][variant];
    const greens = ["#3f8f34", "#4ea244", "#347a30"];
    const lights = ["#8ed46a", "#a4e484", "#74c45c"];
    const top = 2;
    const cy = top + radius;
    const foot = cy + radius + 7;
    const w = (radius + 2) * 2 + 2;
    const h = foot + 2;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const cx = Math.floor(w / 2);
    fillDisc(g, cx, cy, radius + 1, "#1c3d16");
    fillDisc(g, cx, cy, radius, greens[variant]);
    fillDisc(g, cx - 3, cy - 3, Math.max(3, radius - 6), lights[variant]);
    const trunkTop = cy + Math.floor(radius * 0.35);
    g.fillStyle = "#6b4a2c";
    g.fillRect(cx - 2, trunkTop, 4, foot - trunkTop);
    g.fillStyle = "#4a321c";
    g.fillRect(cx - 2, trunkTop, 1, foot - trunkTop);
    g.fillStyle = "#8d6844";
    g.fillRect(cx, trunkTop, 1, foot - trunkTop - 1);
    const sprite = metrics(c, cx);
    sprite.r = 3.3;
    sprite.shadowRX = Math.round(radius * 0.62);
    sprite.shadowRY = 3;
    return sprite;
  }

  function bakeBush(variant) {
    const radius = 6 + variant;
    const greens = ["#3c8a34", "#4e9c40", "#2f7030"];
    const w = (radius + 2) * 2 + 2;
    const h = (radius + 2) * 2 + 2;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2) - 1;
    fillDisc(g, cx, cy, radius + 1, "#1c3d16");
    fillDisc(g, cx, cy, radius, greens[variant]);
    fillDisc(g, cx - 2, cy - 2, Math.max(2, radius - 4), "#8ed46a");
    if (variant === 1) {
      g.fillStyle = "#d4534c";
      g.fillRect(cx - 3, cy, 2, 2);
      g.fillRect(cx + 2, cy + 2, 2, 2);
    } else if (variant === 2) {
      g.fillStyle = "#f2d04a";
      g.fillRect(cx - 1, cy - 1, 2, 2);
    }
    const sprite = metrics(c, cx);
    sprite.r = radius * 0.82;
    sprite.shadowRX = Math.round(radius * 0.75);
    sprite.shadowRY = 2;
    return sprite;
  }

  function paintGrass(ctx, px, py, tx, ty) {
    ctx.fillStyle = "#63b44a";
    ctx.fillRect(px, py, TILE, TILE);
    const blades = 4 + Math.floor(hash(tx + 3, ty + 5) * 3);
    for (let i = 0; i < blades; i++) {
      const bx = px + Math.floor(hash(tx * 3 + i * 5, ty + i) * 15);
      const by = py + Math.floor(hash(tx + i, ty * 3 + 2) * 13);
      const h = 2 + Math.floor(hash(tx + i * 2, ty + 1) * 3);
      ctx.fillStyle = hash(tx + i, ty + i) > 0.4 ? "#4e9836" : "#3e8630";
      ctx.fillRect(bx, by, 1, h);
      ctx.fillStyle = "#96d470";
      ctx.fillRect(bx, by, 1, 1);
    }
    ctx.fillStyle = hash(tx, ty) > 0.5 ? "#6ec055" : "#59aa42";
    ctx.fillRect(px + Math.floor(hash(tx, ty + 4) * 14), py + Math.floor(hash(tx + 6, ty) * 14), 2, 1);
  }

  function paintDirt(ctx, px, py, tx, ty) {
    ctx.fillStyle = hash(tx, ty) > 0.5 ? "#c6a56e" : "#d2b07a";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#a68452";
    ctx.fillRect(px + Math.floor(hash(tx, ty + 4) * 12), py + Math.floor(hash(tx + 2, ty) * 12), 2, 1);
    ctx.fillStyle = "#e4cb96";
    ctx.fillRect(px + 2 + Math.floor(hash(tx + 8, ty) * 10), py + 3 + Math.floor(hash(tx, ty + 9) * 8), 1, 1);
    ctx.fillStyle = "#63b44a";
    if (groundAt(tx, ty - 1) === T.GRASS) {
      for (let i = 0; i < 4; i++) ctx.fillRect(px + Math.floor(hash(tx + i, ty) * 15), py + (i % 2), 1, 2);
    }
    if (groundAt(tx, ty + 1) === T.GRASS) {
      for (let i = 0; i < 4; i++) ctx.fillRect(px + Math.floor(hash(tx + i, ty + 3) * 15), py + 13 - (i % 2), 1, 2);
    }
    if (groundAt(tx - 1, ty) === T.GRASS) {
      for (let i = 0; i < 3; i++) ctx.fillRect(px + (i % 2), py + Math.floor(hash(tx, ty + i) * 14), 2, 1);
    }
    if (groundAt(tx + 1, ty) === T.GRASS) {
      for (let i = 0; i < 3; i++) ctx.fillRect(px + 13, py + Math.floor(hash(tx + 4, ty + i) * 14), 2, 1);
    }
  }

  function paintSand(ctx, px, py, tx, ty) {
    ctx.fillStyle = "#e6d3a4";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#f4e6c4";
    ctx.fillRect(px + Math.floor(hash(tx, ty) * 12), py + Math.floor(hash(tx + 1, ty) * 12), 2, 1);
    ctx.fillStyle = "#d8f4ff";
    if (groundAt(tx, ty - 1) === T.WATER) ctx.fillRect(px, py, TILE, 1);
    if (groundAt(tx, ty + 1) === T.WATER) ctx.fillRect(px, py + TILE - 1, TILE, 1);
    if (groundAt(tx - 1, ty) === T.WATER) ctx.fillRect(px, py, 1, TILE);
    if (groundAt(tx + 1, ty) === T.WATER) ctx.fillRect(px + TILE - 1, py, 1, TILE);
  }

  function paintWater(ctx, px, py, tx, ty, frame) {
    ctx.fillStyle = "#3e97c8";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#327eae";
    const n = (tx * 13 + ty * 7 + frame) % 5;
    ctx.fillRect(px + (n % 3) * 5, py + ((ty + frame) % 4) * 3, 3, 2);
    ctx.fillStyle = "#b7e7f8";
    ctx.fillRect(px + ((tx * 5 + frame * 3) % 13), py + ((ty * 4 + frame * 2) % 12), 2, 1);
    ctx.fillStyle = "#f3fbff";
    ctx.fillRect(px + ((tx * 9 + frame * 5) % 12), py + ((ty * 3 + frame) % 10) + 2, 1, 1);
  }

  function drawFlower(ctx, px, py, type) {
    const cx = px + 8;
    ctx.fillStyle = "#3f7d34";
    ctx.fillRect(cx, py + 8, 1, 5);
    if (type === DECOR.DAISY) {
      ctx.fillStyle = "#fffaf0";
      ctx.fillRect(cx - 2, py + 5, 5, 1);
      ctx.fillRect(cx - 1, py + 4, 3, 3);
      ctx.fillRect(cx, py + 3, 1, 5);
      ctx.fillStyle = "#f0c93a";
      ctx.fillRect(cx, py + 5, 1, 1);
    } else if (type === DECOR.TULIP) {
      ctx.fillStyle = "#f2d04a";
      ctx.fillRect(cx - 1, py + 3, 3, 4);
      ctx.fillStyle = "#d8a82a";
      ctx.fillRect(cx - 1, py + 5, 1, 2);
    } else if (type === DECOR.POPPY) {
      ctx.fillStyle = "#e15a48";
      ctx.fillRect(cx - 1, py + 4, 3, 3);
      ctx.fillStyle = "#2b221c";
      ctx.fillRect(cx, py + 5, 1, 1);
    } else {
      ctx.fillStyle = "#6aaef0";
      ctx.fillRect(cx, py + 3, 1, 3);
      ctx.fillRect(cx - 1, py + 4, 3, 2);
    }
  }

  function drawMushroom(ctx, px, py) {
    const cx = px + 7;
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(cx, py + 8, 2, 4);
    ctx.fillStyle = "#d4534c";
    ctx.fillRect(cx - 2, py + 5, 6, 3);
    ctx.fillStyle = "#fffaf2";
    ctx.fillRect(cx - 1, py + 6, 1, 1);
    ctx.fillRect(cx + 2, py + 6, 1, 1);
  }

  function drawPebble(ctx, px, py) {
    ctx.fillStyle = "#8d8a82";
    ctx.fillRect(px + 6, py + 11, 3, 2);
    ctx.fillStyle = "#c2beb4";
    ctx.fillRect(px + 6, py + 11, 1, 1);
  }

  function drawTuft(ctx, px, py) {
    ctx.fillStyle = "#3f8a32";
    ctx.fillRect(px + 5, py + 8, 1, 6);
    ctx.fillRect(px + 8, py + 6, 1, 8);
    ctx.fillRect(px + 11, py + 9, 1, 5);
    ctx.fillStyle = "#b6e888";
    ctx.fillRect(px + 8, py + 6, 1, 1);
  }

  function drawLog(ctx, x, y) {
    ctx.fillStyle = "#6b4428";
    ctx.fillRect(x, y + 4, 18, 5);
    ctx.fillStyle = "#8a6240";
    ctx.fillRect(x, y + 4, 18, 2);
    ctx.fillStyle = "#d8c09a";
    ctx.fillRect(x + 1, y + 5, 3, 3);
    ctx.fillStyle = "#a08058";
    ctx.fillRect(x + 2, y + 6, 1, 1);
    ctx.fillStyle = "#4a301c";
    ctx.fillRect(x + 16, y + 5, 2, 4);
  }

  function ellipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    if (ry < 1 || rx < 1) {
      ctx.fillRect(cx, cy, 1, 1);
      return;
    }
    for (let y = -ry; y <= ry; y++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      ctx.fillRect(cx - span, cy + y, span * 2 + 1, 1);
    }
  }

  function pondDist(tx, ty) {
    let best = 99;
    for (let i = 0; i < ponds.length; i++) {
      const spot = ponds[i];
      const dx = (tx + 0.5 - spot.x) / spot.rx;
      const dy = (ty + 0.5 - spot.y) / spot.ry;
      const dist = Math.hypot(dx, dy);
      if (dist < best) best = dist;
    }
    return best;
  }

  function bakeWadeMap() {
    wade = new Uint8Array(COLS * ROWS);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (groundAt(tx, ty) !== T.WATER) continue;
        let shore = false;
        for (let oy = -1; oy <= 1 && !shore; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            if (groundAt(tx + ox, ty + oy) !== T.WATER) {
              shore = true;
              break;
            }
          }
        }
        wade[ty * COLS + tx] = shore ? 1 : 2;
      }
    }
  }

  function bakeWaterSheet() {
    const tiles = [];
    waterIndex = new Int16Array(COLS * ROWS);
    waterIndex.fill(-1);
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (groundAt(tx, ty) !== T.WATER) continue;
        waterIndex[ty * COLS + tx] = tiles.length;
        tiles.push([tx, ty]);
      }
    }
    const frames = 4;
    waterSheet = document.createElement("canvas");
    waterSheet.width = TILE * frames;
    waterSheet.height = Math.max(1, tiles.length * TILE);
    const g = waterSheet.getContext("2d");
    g.imageSmoothingEnabled = false;
    for (let i = 0; i < tiles.length; i++) {
      const [tx, ty] = tiles[i];
      for (let frame = 0; frame < frames; frame++) {
        paintWater(g, frame * TILE, i * TILE, tx, ty, frame);
      }
    }
  }

  function playerDepth() {
    if (indoors || !wade.length) return 0;
    const tx = Math.floor(player.x / TILE);
    const ty = Math.floor(player.y / TILE);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return 0;
    return wade[ty * COLS + tx];
  }

  function pathRow(tx) {
    if (level === 1) return Math.round(spawnTy + 5 + Math.sin(tx * 0.33) * 1.7);
    return Math.round(spawnTy + 4 + layout.pathShift + Math.sin(tx * 0.33 + layout.pathPhase) * 2.2);
  }

  function addProp(kind, tx, ty, minSpawnTiles, sprites, rng) {
    if (groundAt(tx, ty) !== T.GRASS) return false;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + Math.floor(TILE * 0.8);
    if (Math.hypot(x - player.x, y - player.y) < TILE * minSpawnTiles) return false;
    const minDist = kind === "tree" ? TILE * 4.6 : TILE * 2.8;
    for (const prop of props) {
      if (!prop.sprite) continue;
      if (Math.hypot(prop.x - x, prop.y - y) < minDist) return false;
    }
    const sprite = sprites[(Math.abs(tx * 3 + ty) + Math.floor(rng() * 2)) % sprites.length];
    props.push({
      x,
      y,
      sprite,
      r: sprite.r,
      shadowRX: sprite.shadowRX,
      shadowRY: sprite.shadowRY,
    });
    return true;
  }

  function createWorld(trees, bushes) {
    indoors = false;
    doorLock = 0;
    const rng = makeRng(SEED + (level - 1) * 97);
    const pondSlots = [
      { dx: 9, dy: -5 },
      { dx: -9, dy: 6 },
      { dx: 8, dy: 7 },
      { dx: 0, dy: -9 },
      { dx: 11, dy: 1 },
      { dx: -12, dy: 1 },
      { dx: 2, dy: 8 },
      { dx: -6, dy: -8 },
    ];
    const slot = level === 1 ? { dx: -8, dy: -6 } : pondSlots[(level - 2) % pondSlots.length];
    layout = {
      pathPhase: (level - 1) * 0.9,
      pathShift: ((level - 1) % 5) - 2,
    };
    ground = new Uint8Array(COLS * ROWS);
    decor = new Uint8Array(COLS * ROWS);
    props = [];
    player.x = spawnTx * TILE + TILE / 2;
    player.y = spawnTy * TILE + TILE / 2;
    ponds = [{ x: spawnTx + slot.dx, y: spawnTy + slot.dy, rx: 5.5, ry: 4.05 }];
    if (Math.random() < 0.5) {
      const far = [
        [-30, -22], [28, -20], [-26, 24], [30, 18],
        [6, -28], [-8, 26], [32, -4], [-34, 6],
        [18, 26], [-20, -24], [22, 8], [-14, 22],
        [-32, -12], [14, -26], [26, 22], [-22, 8],
      ];
      for (let i = far.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = far[i];
        far[i] = far[j];
        far[j] = swap;
      }
      for (const [dx, dy] of far) {
        const rx = 4.4 + Math.random() * 2.4;
        const ry = 3.3 + Math.random() * 1.6;
        const cx = spawnTx + dx;
        const cy = spawnTy + dy;
        if (cx - rx < 3 || cy - ry < 3 || cx + rx > COLS - 4 || cy + ry > ROWS - 4) continue;
        if (Math.hypot(cx - spawnTx, cy - spawnTy) < 16) continue;
        let blocked = false;
        for (const other of ponds) {
          if (Math.hypot(cx - other.x, cy - other.y) < 18) blocked = true;
        }
        if (blocked) continue;
        ponds.push({ x: cx, y: cy, rx, ry });
        break;
      }
    }
    pond = ponds[0];

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const dist = pondDist(tx, ty) + (hash(tx + 2, ty + 5) - 0.5) * 0.22;
        if (dist <= 1) setGround(tx, ty, T.WATER);
        else if (dist <= 1.22) setGround(tx, ty, T.SAND);
        else setGround(tx, ty, T.GRASS);
      }
    }

    for (let tx = 1; tx < COLS - 1; tx++) {
      const row = pathRow(tx);
      const width = hash(tx, 99) > 0.72 ? 3 : 2;
      for (let w = 0; w < width; w++) {
        const ty = row + w - 1;
        if (groundAt(tx, ty) === T.WATER || groundAt(tx, ty) === T.SAND) continue;
        setGround(tx, ty, T.DIRT);
      }
    }

    const flowerShift = level === 1 ? 0 : ((level % 5) - 2) * 1.6;
    const patches = [
      { x: spawnTx + 3.2 + flowerShift, y: spawnTy - 1.4 - flowerShift * 0.4, r: 2.3, type: DECOR.DAISY },
      { x: spawnTx - 2.6 - flowerShift, y: spawnTy + 2.1, r: 2.2, type: DECOR.TULIP },
      { x: spawnTx + 1.1, y: spawnTy + 3.1 + flowerShift, r: 1.8, type: DECOR.POPPY },
      { x: spawnTx - 4.1, y: spawnTy - 1.2 - flowerShift, r: 2.1, type: DECOR.BELL },
      { x: spawnTx + 8.2 + flowerShift, y: spawnTy + 0.6, r: 2.5, type: DECOR.DAISY },
      { x: spawnTx - 7.4, y: spawnTy + 3.4 + flowerShift * 0.5, r: 2.2, type: DECOR.POPPY },
      { x: spawnTx - 22, y: spawnTy - 14, r: 3.2, type: DECOR.DAISY },
      { x: spawnTx + 24, y: spawnTy + 12, r: 3, type: DECOR.TULIP },
      { x: spawnTx - 18, y: spawnTy + 16, r: 2.6, type: DECOR.POPPY },
      { x: spawnTx + 16, y: spawnTy - 18, r: 2.8, type: DECOR.BELL },
      { x: spawnTx + 30, y: spawnTy - 8, r: 2.4, type: DECOR.DAISY },
      { x: spawnTx - 28, y: spawnTy + 6, r: 2.5, type: DECOR.TULIP },
    ];

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const kind = groundAt(tx, ty);
        if (kind === T.SAND && neighborWater(tx, ty) && hash(tx, ty + 20) < 0.72) {
          setDecor(tx, ty, DECOR.REED);
          continue;
        }
        if (kind !== T.GRASS) continue;
        const dist = Math.hypot(tx - spawnTx, ty - spawnTy);
        let flower = 0;
        for (const patch of patches) {
          if (Math.hypot(tx - patch.x, ty - patch.y) <= patch.r) flower = patch.type;
        }
        if (!flower) {
          let chance = 0.055;
          if (dist > 1.5 && dist < 7) chance = 0.2;
          else if (dist < 13) chance = 0.09;
          const flowerSalt = (level - 1) * 5;
          if (hash(tx + 4 + flowerSalt, ty + 8 + flowerSalt) < chance) {
            flower = 1 + Math.floor(hash(tx + flowerSalt, ty) * 4);
          }
        }
        if (dist < 1.35) flower = 0;
        if (flower) {
          setDecor(tx, ty, flower);
          continue;
        }
        if (dist > 2.2 && hash(tx + 12, ty + 2) > 0.94) setDecor(tx, ty, DECOR.TUFT);
        else if (dist > 2.4 && hash(tx + 15, ty + 6) > 0.972) setDecor(tx, ty, DECOR.PEBBLE);
      }
    }

    let mushrooms = 0;
    for (let n = 0; n < 700 && mushrooms < 18; n++) {
      const tx = Math.floor(rng() * COLS);
      const ty = Math.floor(rng() * ROWS);
      if (groundAt(tx, ty) !== T.GRASS || decorAt(tx, ty)) continue;
      const dist = Math.hypot(tx - spawnTx, ty - spawnTy);
      if (dist < 5 || dist > 36) continue;
      setDecor(tx, ty, DECOR.MUSH);
      mushrooms++;
    }

    bakeWadeMap();
    bakeWaterSheet();

    const turn = (dx, dy) => {
      const steps = level <= 1 ? 0 : (level - 1) % 4;
      let x = dx;
      let y = dy;
      for (let i = 0; i < steps; i++) {
        const next = -y;
        y = x;
        x = next;
      }
      return [x, y];
    };
    const treeNear = [
      [-11, -1],
      [10, -3],
      [-9, 7],
      [12, 4],
      [1, -8],
    ].map(([dx, dy]) => turn(dx, dy));
    const bushNear = [
      [5, -2],
      [-4, 3],
      [6, 5],
      [-6, -2],
      [3, 4],
      [-2, 6],
    ].map(([dx, dy]) => turn(dx, dy));
    for (const [dx, dy] of treeNear) addProp("tree", spawnTx + dx, spawnTy + dy, 4.2, trees, rng);
    for (const [dx, dy] of bushNear) addProp("bush", spawnTx + dx, spawnTy + dy, 3.4, bushes, rng);

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const edge = tx <= 1 || ty <= 1 || tx >= COLS - 2 || ty >= ROWS - 2;
        if (!edge || rng() > 0.7) continue;
        addProp("tree", tx, ty, 12, trees, rng);
      }
    }
    for (let i = 0; i < 104; i++) {
      addProp("tree", 3 + Math.floor(rng() * (COLS - 6)), 3 + Math.floor(rng() * (ROWS - 6)), 10, trees, rng);
    }
    for (let i = 0; i < 184; i++) {
      addProp("bush", 2 + Math.floor(rng() * (COLS - 4)), 2 + Math.floor(rng() * (ROWS - 4)), 7, bushes, rng);
    }

    field = document.createElement("canvas");
    field.width = WORLD_W;
    field.height = WORLD_H;
    const g = field.getContext("2d");
    g.imageSmoothingEnabled = false;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const px = tx * TILE;
        const py = ty * TILE;
        const kind = groundAt(tx, ty);
        if (kind === T.WATER) paintWater(g, px, py, tx, ty, 0);
        else if (kind === T.DIRT) paintDirt(g, px, py, tx, ty);
        else if (kind === T.SAND) paintSand(g, px, py, tx, ty);
        else paintGrass(g, px, py, tx, ty);
        const d = decorAt(tx, ty);
        if (d >= DECOR.DAISY && d <= DECOR.BELL) drawFlower(g, px, py, d);
        else if (d === DECOR.MUSH) drawMushroom(g, px, py);
        else if (d === DECOR.PEBBLE) drawPebble(g, px, py);
        else if (d === DECOR.TUFT) drawTuft(g, px, py);
      }
    }

    const logs = [
      [spawnTx + 6, spawnTy + 2, 2, 0],
      [spawnTx - 10, spawnTy + 6, 0, 4],
      [spawnTx - 24, spawnTy - 12, 1, 2],
      [spawnTx + 22, spawnTy + 14, 3, 1],
      [spawnTx + 18, spawnTy - 16, 0, 3],
      [spawnTx - 16, spawnTy + 18, 2, 2],
    ];
    for (const [tx, ty, ox, oy] of logs) {
      if (groundAt(tx, ty) === T.GRASS) drawLog(g, tx * TILE + ox, ty * TILE + oy);
    }

    lilies = [];
    for (const spot of ponds) {
      lilies.push(
        { x: (spot.x - 1.15) * TILE, y: (spot.y + 0.35) * TILE },
        { x: (spot.x + 1.55) * TILE, y: (spot.y - 0.55) * TILE },
        { x: (spot.x + 0.25) * TILE, y: (spot.y + 1.25) * TILE }
      );
    }

    duck = {
      duck: true,
      x: pond.x * TILE,
      y: pond.y * TILE,
      ang: 0.6,
      face: true,
      state: "swim",
      sink: 0,
      r: 0,
      shadowRX: 0,
      shadowRY: 0,
    };
    props.push(duck);

    const gunSpots = [
      [3, 2],
      [4, -2],
      [-3, 3],
      [5, 1],
      [-4, -1],
      [2, 4],
    ];
    const gunSpot = gunSpots[(level - 1) % gunSpots.length];
    let gunTx = spawnTx + gunSpot[0];
    let gunTy = spawnTy + gunSpot[1];
    if (groundAt(gunTx, gunTy) !== T.GRASS) {
      gunTx = spawnTx + 3;
      gunTy = spawnTy - 3;
    }
    gun = {
      x: gunTx * TILE + 6,
      y: gunTy * TILE + 4,
      held: false,
      anim: 0,
      fromX: 0,
      fromY: 0,
    };
    for (const prop of props) {
      if (!prop.r) continue;
      if (Math.hypot(prop.x - gun.x, prop.y - gun.y) < 22) gun.x += 28;
    }

    const netSpots = [
      [-4, 3],
      [-5, -1],
      [6, 3],
      [-2, 5],
      [7, -2],
      [-6, 4],
    ];
    const netSpot = netSpots[(level - 1) % netSpots.length];
    let netTx = spawnTx + netSpot[0];
    let netTy = spawnTy + netSpot[1];
    if (groundAt(netTx, netTy) !== T.GRASS) {
      netTx = spawnTx - 4;
      netTy = spawnTy + 1;
    }
    net = {
      x: netTx * TILE + 6,
      y: netTy * TILE + 10,
      held: false,
      anim: 0,
      fromX: 0,
      fromY: 0,
    };
    for (const prop of props) {
      if (!prop.r) continue;
      if (Math.hypot(prop.x - net.x, prop.y - net.y) < 22) net.x -= 28;
    }
    if (Math.hypot(net.x - gun.x, net.y - gun.y) < 48) net.x -= 36;

    const uniSpots = [
      [-8, 1],
      [7, 5],
      [0, 7],
      [-9, -2],
      [9, 6],
      [-1, -8],
    ];
    const uniSpot = uniSpots[(level - 1) % uniSpots.length];
    let uniTx = spawnTx + uniSpot[0];
    let uniTy = spawnTy + uniSpot[1];
    if (groundAt(uniTx, uniTy) !== T.GRASS) {
      uniTx = spawnTx - 8;
      uniTy = spawnTy + 2;
    }
    unicorn = {
      x: uniTx * TILE + TILE / 2,
      y: uniTy * TILE + 12,
      state: "free",
      inside: false,
    };
    if (Math.hypot(unicorn.x - gun.x, unicorn.y - gun.y) < 56) unicorn.x -= 40;
    if (Math.hypot(unicorn.x - net.x, unicorn.y - net.y) < 56) unicorn.y += 36;

    const homes = [
      [player.x + 36, player.y - 28],
      [player.x - 48, player.y + 18],
      [player.x + 20, player.y + 46],
      [gun.x + 46, gun.y - 18],
      [gun.x + 8, gun.y + 42],
      [pond.x * TILE - 10, pond.y * TILE - 24],
      [player.x + 120, player.y + 20],
      [player.x - 90, player.y - 70],
      [player.x + 72, player.y - 64],
      [player.x - 78, player.y + 58],
      [player.x + 96, player.y + 74],
      [player.x - 24, player.y - 96],
    ];
    const colors = ["#fff8ee", "#f6d34e", "#f4a0c4", "#8ec8ff", "#ffe08a", "#fffaf0", "#f7b0d4", "#fff4c2", "#d7f7a2", "#f7c39a", "#c9b6ff", "#fff1d0"];
    butterflies = homes.map((home, i) => ({
      hx: home[0],
      hy: home[1],
      rad: 16 + rng() * 18,
      t: rng() * Math.PI * 2,
      color: colors[i % colors.length],
      state: "fly",
      inside: false,
      x: home[0],
      y: home[1],
      z: 10,
      vx: 0,
      vy: 0,
      vz: 0,
    }));
    placeHouse();
  }

  function placeHouse() {
    const spots = [
      [8, -3],
      [-6, -2],
      [9, 2],
      [-7, 3],
      [5, -6],
      [2, -7],
    ];
    let chosen = null;
    for (const [dx, dy] of spots) {
      const tx = spawnTx + dx;
      const ty = spawnTy + dy;
      let clear = true;
      for (let y = ty - 4; y <= ty && clear; y++) {
        for (let x = tx - 3; x <= tx + 3; x++) {
          const kind = groundAt(x, y);
          if (kind === T.WATER || kind === T.SAND) clear = false;
        }
      }
      if (!clear) continue;
      const hx = tx * TILE + TILE / 2;
      const hy = ty * TILE + 10;
      if (Math.hypot(hx - gun.x, hy - gun.y) < 64) continue;
      if (Math.hypot(hx - net.x, hy - net.y) < 64) continue;
      if (Math.hypot(hx - unicorn.x, hy - unicorn.y) < 72) continue;
      chosen = { x: hx, y: hy };
      break;
    }
    if (!chosen) {
      chosen = { x: (spawnTx + 8) * TILE + TILE / 2, y: (spawnTy - 3) * TILE + 10 };
    }
    house = chosen;
    props = props.filter((prop) => {
      if (prop.duck) return true;
      const dx = Math.abs(prop.x - house.x);
      const dy = prop.y - house.y;
      return dx > 58 || dy < -80 || dy > 18;
    });
  }

  function neighborWater(tx, ty) {
    return (
      groundAt(tx - 1, ty) === T.WATER ||
      groundAt(tx + 1, ty) === T.WATER ||
      groundAt(tx, ty - 1) === T.WATER ||
      groundAt(tx, ty + 1) === T.WATER
    );
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    view.pixel = Math.max(1, Math.round(canvas.width / 680));
    view.w = Math.max(1, Math.floor(canvas.width / view.pixel));
    view.h = Math.max(1, Math.floor(canvas.height / view.pixel));
    view.ox = Math.floor((canvas.width - view.w * view.pixel) / 2);
    view.oy = Math.floor((canvas.height - view.h * view.pixel) / 2);
    low = document.createElement("canvas");
    low.width = view.w;
    low.height = view.h;
  }

  function updateCamera() {
    // Kamera trzyma się zaokrąglonej pozycji postaci. Przy nieparzystej
    // wysokości widoku round(pozycja - połowa) skacze o piksel i obraz drży.
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    let x = px - (view.w >> 1);
    let y = py - (view.h >> 1);
    const maxX = WORLD_W - view.w;
    const maxY = WORLD_H - view.h;
    if (maxX < 0) x = maxX >> 1;
    else x = clamp(x, 0, maxX);
    if (maxY < 0) y = maxY >> 1;
    else y = clamp(y, 0, maxY);
    view.camX = x;
    view.camY = y;
  }

  function blockedByHouse(px, py) {
    const left = house.x - 34;
    const right = house.x + 34;
    const top = house.y - 46;
    const bottom = house.y - 2;
    if (px < left || px > right || py < top || py > bottom) return false;
    if (py > house.y - 16 && Math.abs(px - house.x) < 9) return false;
    return true;
  }

  function fitsIndoors(px, py) {
    const left = roomX + 14;
    const right = roomX + ROOM_W - 14;
    const top = roomY + 18;
    const bottom = roomY + ROOM_H - 8;
    if (px < left || px > right || py < top) return false;
    if (py > bottom) return Math.abs(px - (roomX + ROOM_W / 2)) < 9;
    return true;
  }

  function fits(px, py) {
    if (indoors) return fitsIndoors(px, py);
    if (px < 8 || py < 8 || px > WORLD_W - 8 || py > WORLD_H - 8) return false;
    if (blockedByHouse(px, py)) return false;
    const samples = [
      [0, 0],
      [3, 0],
      [-3, 0],
      [0, 2],
      [0, -2],
    ];
    for (const [ox, oy] of samples) {
      const tx = Math.floor((px + ox) / TILE);
      const ty = Math.floor((py + oy) / TILE);
      if (tx <= 0 || ty <= 0 || tx >= COLS - 1 || ty >= ROWS - 1) return false;
    }
    for (const prop of props) {
      if (!prop.r) continue;
      const dx = px - prop.x;
      const dy = py - prop.y;
      const reach = prop.r + 2.2;
      if (dx * dx + dy * dy < reach * reach) return false;
    }
    return true;
  }

  const FACE_ORDER = ["up", "upright", "right", "downright", "down", "downleft", "left", "upleft"];
  const FACE_STEP = 0.055;

  const AIM = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
    upleft: [-1, -1],
    upright: [1, -1],
    downleft: [-1, 1],
    downright: [1, 1],
  };

  function facingFrom(mx, my) {
    const ax = Math.abs(mx);
    const ay = Math.abs(my);
    if (ax < 0.001 && ay < 0.001) return player.dir;
    const sx = Math.sign(mx);
    const sy = Math.sign(my);
    const diagonal = ax > 0.001 && ay > 0.001 && ax / ay > 0.5 && ay / ax > 0.5;
    if (diagonal) {
      if (sy < 0) return sx < 0 ? "upleft" : "upright";
      return sx < 0 ? "downleft" : "downright";
    }
    if (ay >= ax) return sy < 0 ? "up" : "down";
    return sx < 0 ? "left" : "right";
  }

  function stepFacing(dt) {
    const from = FACE_ORDER.indexOf(player.dir);
    const to = FACE_ORDER.indexOf(player.face);
    if (from < 0 || to < 0 || from === to) {
      player.faceTimer = 0;
      return;
    }
    player.faceTimer -= dt;
    if (player.faceTimer > 0) return;
    let delta = to - from;
    if (delta > 4) delta -= 8;
    if (delta < -4) delta += 8;
    player.dir = FACE_ORDER[(from + Math.sign(delta) + 8) % 8];
    player.faceTimer = FACE_STEP;
  }

  function tryDoor(my) {
    if (doorLock > 0 || Math.abs(my) < 0.2) return;
    if (!indoors) {
      if (my < 0 && Math.abs(player.x - house.x) < 7 && player.y > house.y - 6 && player.y < house.y + 8) {
        indoors = true;
        doorLock = 0.45;
        target = null;
        outsideSpot = { x: house.x, y: house.y + 14 };
        player.x = roomX + ROOM_W / 2;
        player.y = roomY + ROOM_H - 26;
        player.face = "up";
        player.dir = "up";
        if (mounted) parkUnicorn(house.x + 18, house.y + 18);
        hintMode = "";
      }
      return;
    }
    const doorX = roomX + ROOM_W / 2;
    if (my > 0 && Math.abs(player.x - doorX) < 8 && player.y > roomY + ROOM_H - 16) {
      indoors = false;
      doorLock = 0.45;
      target = null;
      player.x = outsideSpot.x;
      player.y = outsideSpot.y;
      player.face = "down";
      player.dir = "down";
      hintMode = "";
    }
  }

  function readStick() {
    let x = 0;
    let y = 0;
    if (keys.has("arrowleft") || keys.has("a")) x -= 1;
    if (keys.has("arrowright") || keys.has("d")) x += 1;
    if (keys.has("arrowup") || keys.has("w")) y -= 1;
    if (keys.has("arrowdown") || keys.has("s")) y += 1;
    return { x, y, keyboard: x !== 0 || y !== 0 };
  }

  function update(dt, time) {
    const stick = readStick();
    let mx = 0;
    let my = 0;
    let keyboard = false;
    if (stick.keyboard) {
      target = null;
      player.stuck = 0;
      mx = stick.x;
      my = stick.y;
      keyboard = true;
    } else if (target) {
      mx = target.x - player.x;
      my = target.y - player.y;
      const len = Math.hypot(mx, my);
      if (len < 1.4) {
        target = null;
        mx = 0;
        my = 0;
      }
    }

    const len = Math.hypot(mx, my);
    const ox = player.x;
    const oy = player.y;
    if (len > 0.001 && (keyboard || target)) {
      player.face = facingFrom(mx, my);
      let speed = mounted ? 114 : keys.has("shift") ? 76 : 40;
      if (playerDepth()) speed *= 0.5;
      const vx = (mx / len) * speed;
      const vy = (my / len) * speed;
      const nx = player.x + vx * dt;
      const ny = player.y + vy * dt;
      if (fits(nx, player.y)) player.x = nx;
      if (fits(player.x, ny)) player.y = ny;
      const moved = Math.hypot(player.x - ox, player.y - oy);
      if (target) {
        if (moved < speed * dt * 0.2) player.stuck += dt;
        else player.stuck = 0;
        if (player.stuck > 0.45) {
          target = null;
          player.stuck = 0;
        }
      }
    }

    stepFacing(dt);
    if (doorLock > 0) doorLock = Math.max(0, doorLock - dt);
    if (mountLock > 0) mountLock = Math.max(0, mountLock - dt);
    tryDoor(my);
    const moved = Math.hypot(player.x - ox, player.y - oy);
    player.moving = moved > 0.04;
    if (player.moving) {
      player.phase += (moved / TILE) * 4;
      const step = Math.floor(player.phase);
      if (step !== player.lastStep) {
        const tx = Math.floor(player.x / TILE);
        const ty = Math.floor(player.y / TILE);
        if (step % 2 === 0) {
          if (mounted) playHoof();
          else playStep(groundAt(tx, ty) === T.DIRT);
          if (!mounted && groundAt(tx, ty) === T.DIRT && motes.length < 20) {
            motes.push({
              x: player.x + (hash(step, ty) - 0.5) * 4,
              y: player.y,
              vx: (hash(step + 2, tx) - 0.5) * 8,
              vy: -10 - hash(step, tx) * 6,
              life: 0.35,
            });
          }
        }
        player.lastStep = step;
      }
    }

    for (let i = motes.length - 1; i >= 0; i--) {
      const mote = motes[i];
      mote.life -= dt;
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      mote.vy += 18 * dt;
      if (mote.life <= 0) motes.splice(i, 1);
    }

    if (duck.state === "swim") {
      duck.ang += dt * 0.45;
      duck.face = Math.sin(duck.ang) < 0;
      duck.x = (pond.x + Math.cos(duck.ang) * pond.rx * 0.52) * TILE;
      duck.y = (pond.y + Math.sin(duck.ang * 0.8) * pond.ry * 0.48) * TILE;
    } else {
      duck.sink += dt;
    }

    if (gun.anim > 0) gun.anim = Math.max(0, gun.anim - dt);
    if (net.anim > 0) net.anim = Math.max(0, net.anim - dt);
    if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
    if (shootCooldown > 0) shootCooldown = Math.max(0, shootCooldown - dt);
    if (shootQueued) {
      shootQueued = false;
      tryShoot();
    }

    for (const butterfly of butterflies) {
      if (butterfly.state === "fly") {
        butterfly.t += dt * 0.85 * flySpeed();
      } else if (butterfly.state === "caught") {
        butterfly.t += dt * 1.4;
      } else if (butterfly.state === "fall") {
        butterfly.vz -= 78 * dt;
        butterfly.z += butterfly.vz * dt;
        butterfly.x = clamp(butterfly.x + butterfly.vx * dt, 8, WORLD_W - 8);
        butterfly.y = clamp(butterfly.y + butterfly.vy * dt, 8, WORLD_H - 8);
        if (butterfly.z <= 0) {
          butterfly.z = 0;
          butterfly.state = "ground";
        }
      }
    }

    let leveled = false;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD_W || bullet.y > WORLD_H) {
        bullets.splice(i, 1);
        continue;
      }
      if (unicornHittable(bullet)) {
        bullets.splice(i, 1);
        if (bullet.kind === "net") {
          if (indoors) releaseUnicorn();
          else catchUnicorn();
        } else if (killUnicorn()) leveled = true;
        if (leveled) break;
        continue;
      }
      if (!indoors && bullet.kind !== "net" && duck.state === "swim") {
        const dx = bullet.x - duck.x;
        const dy = bullet.y - duck.y;
        if (dx * dx + dy * dy <= 100) {
          duck.state = "down";
          duck.sink = 0;
          bullets.splice(i, 1);
          playQuack();
          if (addScore(3)) leveled = true;
          if (leveled) break;
          continue;
        }
      }
      if (!indoors) for (const butterfly of butterflies) {
        if (butterfly.state !== "fly" || butterfly.inside) continue;
        const body = butterflyBody(butterfly, time);
        const dx = bullet.x - body.x;
        const dy = bullet.y - (body.y - body.z);
        if (dx * dx + dy * dy > 64) continue;
        if (bullet.kind === "net") {
          catchButterfly(butterfly);
          bullets.splice(i, 1);
          break;
        }
        butterfly.state = "fall";
        butterfly.inside = false;
        butterfly.x = body.x;
        butterfly.y = body.y;
        butterfly.z = body.z;
        butterfly.vx = (hash(Math.floor(body.x), i + 1) - 0.5) * 16;
        butterfly.vy = 10;
        butterfly.vz = 6;
        bullets.splice(i, 1);
        playHit();
        if (addScore(1)) leveled = true;
        break;
      }
      if (indoors) for (const butterfly of butterflies) {
        if (butterfly.state !== "caught") continue;
        const body = butterflyBody(butterfly, time);
        const dx = bullet.x - body.x;
        const dy = bullet.y - (body.y - body.z);
        if (dx * dx + dy * dy > 64) continue;
        if (bullet.kind === "net") releaseButterfly(butterfly);
        else {
          butterfly.state = "fall";
          butterfly.inside = true;
          butterfly.x = body.x;
          butterfly.y = body.y;
          butterfly.z = body.z;
          butterfly.vx = (hash(Math.floor(body.x), i + 3) - 0.5) * 10;
          butterfly.vy = 4;
          butterfly.vz = 5;
          playHit();
          if (addScore(1)) leveled = true;
        }
        bullets.splice(i, 1);
        break;
      }
      if (leveled) break;
    }
    if (leveled) advanceLevel();

    if (levelBanner > 0) {
      levelBanner -= dt;
      if (levelBanner <= 0) {
        const banner = document.getElementById("banner");
        if (banner) banner.hidden = true;
      }
    }
    refreshHint();
    if (sfx.armed) musicTick();
    updateCamera();
  }

  function gunDistance() {
    return Math.hypot(gun.x - player.x, gun.y - player.y);
  }

  function netDistance() {
    return Math.hypot(net.x - player.x, net.y - player.y);
  }

  function activeWeapon() {
    if (weapon === "net" && net.held) return "net";
    if (gun.held) return "gun";
    if (net.held) return "net";
    return "";
  }

  function pickupItem(item) {
    playPickup();
    item.held = true;
    item.anim = 0.22;
    item.fromX = item.x;
    item.fromY = item.y;
  }

  function unicornDistance() {
    return Math.hypot(unicorn.x - player.x, unicorn.y - player.y);
  }

  function parkUnicorn(x, y) {
    mounted = false;
    mountLock = 0.4;
    unicorn.x = x;
    unicorn.y = y;
  }

  function mountUnicorn() {
    if (mountLock > 0 || indoors || unicorn.state !== "free") return;
    mounted = true;
    mountLock = 0.35;
    playMount();
    hintMode = "";
  }

  function dismountUnicorn() {
    if (mountLock > 0) return;
    parkUnicorn(player.x, player.y + 12);
    playMount();
    hintMode = "";
  }

  function pickupNearby() {
    if (mountLock > 0) return;
    if (mounted) {
      dismountUnicorn();
      return;
    }
    const gDist = gun.held ? Infinity : gunDistance();
    const nDist = net.held ? Infinity : netDistance();
    const uDist = unicorn.state === "free" ? unicornDistance() : Infinity;
    if (gDist < 34 && gDist <= nDist && gDist <= uDist) {
      pickupItem(gun);
      weapon = "gun";
    } else if (nDist < 34 && nDist <= uDist) {
      pickupItem(net);
      weapon = "net";
    } else if (unicorn.state === "free" && uDist < 36) mountUnicorn();
  }

  function unicornHittable(bullet) {
    if (mounted || unicorn.state === "dead") return false;
    if (indoors) {
      if (unicorn.state !== "caught") return false;
    } else if (unicorn.state !== "free" || unicorn.inside) return false;
    const dx = bullet.x - unicorn.x;
    const dy = bullet.y - (unicorn.y - 14);
    return dx * dx + dy * dy <= 324;
  }

  function catchUnicorn() {
    unicorn.state = "caught";
    unicorn.inside = true;
    unicorn.x = roomX + ROOM_W / 2;
    unicorn.y = roomY + 58;
    playCatch();
    hintMode = "";
  }

  function releaseUnicorn() {
    unicorn.state = "free";
    unicorn.inside = false;
    unicorn.x = house.x + 30;
    unicorn.y = house.y + 22;
    playRelease();
    hintMode = "";
  }

  function killUnicorn() {
    unicorn.state = "dead";
    playHit();
    hintMode = "";
    return addScore(6);
  }

  function handAnchor(bob) {
    const offset = {
      down: [3, -9],
      up: [5, -9],
      left: [-1, -11],
      right: [2, -11],
      upleft: [-5, -8],
      upright: [5, -8],
      downleft: [-2, -8],
      downright: [3, -8],
    }[player.dir];
    return {
      x: Math.round(player.x) + offset[0],
      y: Math.round(player.y) - bob + offset[1] - (mounted ? 14 : 0),
    };
  }

  function tryShoot() {
    const active = activeWeapon();
    const item = active === "net" ? net : gun;
    if (!active || item.anim > 0 || shootCooldown > 0) return;
    const aim = AIM[player.dir];
    const len = Math.hypot(aim[0], aim[1]);
    const nx = aim[0] / len;
    const ny = aim[1] / len;
    const hand = handAnchor(0);
    shootCooldown = 0.28;
    player.flash = 0.07;
    bullets.push({
      x: hand.x + nx * 5,
      y: hand.y + ny * 5,
      vx: nx * (active === "net" ? 125 : 218),
      vy: ny * (active === "net" ? 125 : 218),
      life: active === "net" ? 0.48 : 0.55,
      kind: active,
    });
    if (active === "net") playSwing();
    else playShot();
  }

  function caughtSpot(index) {
    const col = index % 4;
    const row = Math.floor(index / 4) % 3;
    const layer = Math.floor(index / 12);
    return {
      x: roomX + 32 + col * 32 + (layer % 2) * 6,
      y: roomY + 46 + row * 20,
    };
  }

  function catchButterfly(butterfly) {
    let caught = 0;
    for (const other of butterflies) if (other.state === "caught") caught += 1;
    const spot = caughtSpot(caught);
    butterfly.state = "caught";
    butterfly.inside = true;
    butterfly.x = spot.x;
    butterfly.y = spot.y;
    butterfly.z = 8;
    butterfly.vx = 0;
    butterfly.vy = 0;
    butterfly.vz = 0;
    playCatch();
  }

  function freeMeadowSpot() {
    for (let ring = 4; ring <= 16; ring++) {
      for (let i = 0; i < 8; i++) {
        const ang = hash(ring * 3, i + butterflies.length) * Math.PI * 2;
        const tx = spawnTx + Math.round(Math.cos(ang) * ring);
        const ty = spawnTy + Math.round(Math.sin(ang) * ring);
        if (groundAt(tx, ty) !== T.GRASS) continue;
        const x = tx * TILE + 8;
        const y = ty * TILE + 8;
        if (Math.hypot(x - house.x, y - house.y) < 74) continue;
        let crowded = false;
        for (const other of butterflies) {
          if (other.state !== "fly" || other.inside) continue;
          if (Math.hypot(other.hx - x, other.hy - y) < 30) crowded = true;
        }
        if (!crowded) return { x, y };
      }
    }
    return { x: (spawnTx + 6) * TILE, y: (spawnTy + 6) * TILE };
  }

  function releaseButterfly(butterfly) {
    const spot = freeMeadowSpot();
    butterfly.state = "fly";
    butterfly.inside = false;
    butterfly.hx = spot.x;
    butterfly.hy = spot.y;
    butterfly.x = spot.x;
    butterfly.y = spot.y;
    butterfly.z = 10;
    butterfly.vx = 0;
    butterfly.vy = 0;
    butterfly.vz = 0;
    playRelease();
  }

  function butterflyBody(butterfly, time) {
    if (butterfly.state === "caught") {
      return {
        x: butterfly.x + Math.sin(butterfly.t) * 4,
        y: butterfly.y + Math.cos(butterfly.t * 1.3) * 2,
        z: 7 + Math.sin(time * 3 + butterfly.t) * 1.5,
      };
    }
    if (butterfly.state === "fly") {
      return {
        x: butterfly.hx + Math.cos(butterfly.t) * butterfly.rad,
        y: butterfly.hy + Math.sin(butterfly.t * 2) * butterfly.rad * 0.55,
        z: 9 + Math.sin(time * 3 + butterfly.t) * 2,
      };
    }
    return { x: butterfly.x, y: butterfly.y, z: butterfly.z };
  }

  function refreshHint() {
    const nearDoor = !indoors && Math.hypot(player.x - house.x, player.y - house.y) < 30;
    const gDist = gun.held ? Infinity : gunDistance();
    const nDist = net.held ? Infinity : netDistance();
    const nearGun = gDist < 34;
    const nearNet = nDist < 34;
    const uDist = mounted ? Infinity : unicornDistance();
    const nearUni = unicorn.state === "free" && uDist < 36;
    const uniInside = unicorn.state === "caught";
    let caught = 0;
    for (const butterfly of butterflies) if (butterfly.state === "caught") caught += 1;
    const active = activeWeapon();
    const both = gun.held && net.held;
    let mode = "idle";
    const depth = playerDepth();
    if (indoors) mode = "indoor-" + caught + "-" + (uniInside ? "u" : "x") + "-" + active;
    else if (mounted && !nearDoor) mode = depth ? "ride-water" : "ride";
    else if (nearGun && (!nearNet || gDist <= nDist) && gDist <= uDist) mode = "near-gun";
    else if (nearNet && nDist <= uDist) mode = "near-net";
    else if (nearUni) mode = "near-uni";
    else if (nearDoor) mode = "door";
    else if (depth) mode = "water";
    else if (active) mode = "held-" + active + (both ? "-both" : "");
    if (mode === hintMode) return;
    hintMode = mode;
    const hint = document.getElementById("hint");
    if (!hint) return;
    if (mode.startsWith("indoor")) {
      const uniLine = uniInside ? "Jednorożec w domku · pistolet daje 6 punktów<br>" : "";
      hint.innerHTML = caught > 0
        ? `${uniLine}Motyle w domku: ${caught}<br>Pistolet zabija · łapacz wypuszcza na łąkę<br>Wyjdź drzwiami w dół`
        : uniInside
          ? "Jednorożec w domku<br>Pistolet — 6 punktów<br>Łapacz wypuszcza na łąkę<br>Wyjdź drzwiami w dół"
          : "Pusty domek<br>Wyjdź drzwiami w dół";
    } else if (mode === "door") hint.innerHTML = "Wejdź w drzwi do góry";
    else if (mode === "near-gun") hint.innerHTML = "E — podnieś pistolet";
    else if (mode === "near-net") hint.innerHTML = "E — podnieś łapacz motyli";
    else if (mode === "near-uni") hint.innerHTML = "E — wsiądź na jednorożca";
    else if (mode === "ride-water") hint.innerHTML = "Jednorożec w wodzie · dwa razy wolniej<br>E — zsiądź";
    else if (mode === "ride") hint.innerHTML = "Jednorożec · półtora raza szybciej niż bieg<br>E — zsiądź";
    else if (mode === "water") hint.innerHTML = "Woda · dwa razy wolniej niż na łące<br>Przy brzegu od pasa w górę, głębiej sama głowa";
    else if (mode === "held-net-both") hint.innerHTML = "Łapacz motyli · Q — pistolet<br>Strzał przenosi motyla albo jednorożca do domku<br>Bez punktów";
    else if (mode === "held-net") hint.innerHTML = "Łapacz motyli w ręce<br>Strzał przenosi motyla albo jednorożca do domku<br>Bez punktów";
    else if (mode === "held-gun-both") hint.innerHTML = "Pistolet w ręce · Q — łapacz<br>Spacja lub prawy przycisk — strzał<br>Kaczka — 3 · jednorożec — 6";
    else if (mode === "held-gun") hint.innerHTML = "WASD — także na skos, np. W+A<br>Shift — bieg · klik — idź<br>Spacja lub prawy przycisk — strzał<br>Na łące leży łapacz motyli";
    else hint.innerHTML = "WASD lub strzałki — chodzenie<br>Shift — bieg · klik — idź w miejsce<br>Pistolet, łapacz i biały jednorożec";
  }

  function addScore(points) {
    const before = Math.floor(score / 10);
    score += points;
    if (Math.floor(score / 10) > before) return true;
    updateScore();
    return false;
  }

  function updateScore() {
    const el = document.getElementById("score");
    if (!el) return;
    el.textContent = `Poziom ${level} · punkty ${score % 10}/10`;
  }

  function advanceLevel() {
    level += 1;
    levelBanner = 2.6;
    bullets.length = 0;
    motes.length = 0;
    target = null;
    player.stuck = 0;
    const heldGun = gun.held;
    const heldNet = net.held;
    const keptWeapon = activeWeapon();
    const wasMounted = mounted && unicorn.state === "free";
    const keptUnicorn = unicorn.state === "caught";
    const caught = butterflies.filter((butterfly) => butterfly.state === "caught");
    createWorld(treeSprites, bushSprites);
    gun.held = heldGun;
    gun.anim = 0;
    net.held = heldNet;
    net.anim = 0;
    weapon = keptWeapon === "net" && heldNet ? "net" : "gun";
    mounted = wasMounted;
    if (keptUnicorn) {
      unicorn.state = "caught";
      unicorn.inside = true;
      unicorn.x = roomX + ROOM_W / 2;
      unicorn.y = roomY + 58;
    }
    for (const butterfly of caught) butterflies.push(butterfly);
    hintMode = "";
    const banner = document.getElementById("banner");
    if (banner) {
      banner.hidden = false;
      banner.textContent = `Poziom ${level}`;
    }
    updateScore();
    playLevel();
  }

  function currentVisual(time) {
    const pack = chars[player.dir];
    if (mounted || !player.moving) {
      const blink = player.dir !== "up" && time % 3.6 > 3.45;
      const cycle = time % 1.8;
      const bob = cycle > 1.2 && cycle < 1.45 ? 1 : 0;
      return { sprite: blink ? pack.blink : pack.idle, bob };
    }
    const frame = Math.floor(player.phase) % 4;
    return { sprite: pack.walk[frame], bob: WALK[frame].bob };
  }

  function blitField(ctx) {
    const camX = view.camX;
    const camY = view.camY;
    const sx = Math.max(0, camX);
    const sy = Math.max(0, camY);
    const dx = Math.max(0, -camX);
    const dy = Math.max(0, -camY);
    const sw = Math.min(field.width - sx, view.w - dx);
    const sh = Math.min(field.height - sy, view.h - dy);
    if (sw > 0 && sh > 0) ctx.drawImage(field, sx, sy, sw, sh, dx, dy, sw, sh);
  }

  function drawReed(ctx, px, py, time, n) {
    const s1 = Math.round(Math.sin(time * 1.8 + n));
    const s2 = Math.round(Math.sin(time * 1.5 + n + 1.7));
    ctx.fillStyle = "#2f6e32";
    ctx.fillRect(px + 6 + s1, py + 6, 1, 8);
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(px + 6 + s1, py + 6, 1, 2);
    ctx.fillStyle = "#4e9a3c";
    ctx.fillRect(px + 10 + s2, py + 8, 1, 6);
  }

  function drawLily(ctx, x, y) {
    const cx = Math.round(x - view.camX);
    const cy = Math.round(y - view.camY);
    fillDisc(ctx, cx, cy, 4, "#2f8f3c");
    fillDisc(ctx, cx - 1, cy - 1, 2, "#67c45a");
    ctx.fillStyle = "#f7f3ea";
    ctx.fillRect(cx, cy - 1, 2, 2);
    ctx.fillStyle = "#f2d04a";
    ctx.fillRect(cx, cy - 1, 1, 1);
  }

  function drawMarker(ctx, time) {
    if (!target) return;
    const bob = Math.round(Math.sin(time * 5));
    const px = Math.round(target.x - view.camX);
    const py = Math.round(target.y - view.camY + bob);
    ctx.fillStyle = "#fff4cc";
    ctx.fillRect(px - 3, py, 1, 1);
    ctx.fillRect(px + 3, py, 1, 1);
    ctx.fillRect(px, py - 3, 1, 1);
    ctx.fillRect(px, py + 3, 1, 1);
    ctx.fillStyle = "#e07a3d";
    ctx.fillRect(px - 1, py, 3, 1);
    ctx.fillRect(px, py - 1, 1, 3);
  }

  function drawSprite(ctx, sprite, x, y, bob) {
    ctx.drawImage(sprite.c, Math.round(x) - sprite.ax - view.camX, Math.round(y) - sprite.ay - bob - view.camY);
  }

  function drawHouse(ctx) {
    const x = Math.round(house.x - view.camX);
    const y = Math.round(house.y - view.camY);
    ctx.fillStyle = "rgba(24, 42, 18, 0.28)";
    ctx.fillRect(x - 40, y - 2, 80, 6);
    ctx.fillStyle = "#8d7460";
    ctx.fillRect(x - 38, y - 6, 76, 5);
    ctx.fillStyle = "#f3e6c8";
    ctx.fillRect(x - 34, y - 42, 68, 36);
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(x - 34, y - 42, 68, 2);
    ctx.fillRect(x - 34, y - 26, 68, 2);
    ctx.fillRect(x - 34, y - 42, 2, 36);
    ctx.fillRect(x + 32, y - 42, 2, 36);
    ctx.fillRect(x - 2, y - 42, 2, 22);
    const windowAt = (wx) => {
      ctx.fillStyle = "#3a2e28";
      ctx.fillRect(x + wx, y - 36, 12, 10);
      ctx.fillStyle = "#9fd4e0";
      ctx.fillRect(x + wx + 1, y - 35, 10, 8);
      ctx.fillStyle = "#f7f3ea";
      ctx.fillRect(x + wx + 1, y - 35, 4, 3);
      ctx.fillStyle = "#6b4a2c";
      ctx.fillRect(x + wx + 5, y - 35, 1, 8);
      ctx.fillRect(x + wx + 1, y - 31, 10, 1);
    };
    windowAt(-24);
    windowAt(12);
    ctx.fillStyle = "#5c3a22";
    ctx.fillRect(x - 8, y - 20, 16, 18);
    ctx.fillStyle = "#7a4e2e";
    ctx.fillRect(x - 7, y - 19, 14, 16);
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(x - 7, y - 19, 6, 16);
    ctx.fillStyle = "#e8d7a4";
    ctx.fillRect(x + 3, y - 11, 1, 1);
    const roofTop = -62;
    const roofBot = -38;
    for (let i = 0; i <= roofBot - roofTop; i++) {
      const t = i / (roofBot - roofTop);
      const half = Math.round(6 + t * 40);
      ctx.fillStyle = i % 4 < 2 ? "#8d3b32" : "#a34a3c";
      ctx.fillRect(x - half, y + roofTop + i, half * 2, 1);
    }
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(x - 18, y - 58, 6, 12);
    ctx.fillStyle = "#4a3424";
    ctx.fillRect(x - 19, y - 60, 8, 3);
    const puff = Math.floor(Date.now() / 280) % 3;
    ctx.fillStyle = "#d9d3cc";
    ctx.fillRect(x - 16 + puff, y - 64 - puff, 2, 1);
    ctx.fillRect(x - 14, y - 66, 1, 1);
  }

  function drawInterior(ctx) {
    const x = Math.round(roomX - view.camX);
    const y = Math.round(roomY - view.camY);
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(x + 8, y + 12, ROOM_W - 16, ROOM_H - 18);
    ctx.fillStyle = "#b89564";
    for (let row = 0; row < ROOM_TH - 1; row++) {
      ctx.fillRect(x + 8, y + 16 + row * TILE, ROOM_W - 16, 1);
    }
    ctx.fillStyle = "#a07d52";
    for (let col = 2; col < ROOM_TW - 1; col += 2) {
      ctx.fillRect(x + col * TILE, y + 14, 1, ROOM_H - 24);
    }
    ctx.fillStyle = "#efe6d2";
    ctx.fillRect(x, y, ROOM_W, 14);
    ctx.fillRect(x, y + 14, 10, ROOM_H - 20);
    ctx.fillRect(x + ROOM_W - 10, y + 14, 10, ROOM_H - 20);
    ctx.fillRect(x, y + ROOM_H - 10, (ROOM_W - 18) / 2, 10);
    ctx.fillRect(x + (ROOM_W + 18) / 2, y + ROOM_H - 10, (ROOM_W - 18) / 2, 10);
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(x, y + 12, ROOM_W, 2);
    ctx.fillRect(x + 8, y + 14, 2, ROOM_H - 22);
    ctx.fillRect(x + ROOM_W - 10, y + 14, 2, ROOM_H - 22);
    const doorX = x + ROOM_W / 2;
    const doorY = y + ROOM_H - 16;
    ctx.fillStyle = "#5c3a22";
    ctx.fillRect(doorX - 9, doorY, 18, 16);
    ctx.fillStyle = "#7a4e2e";
    ctx.fillRect(doorX - 7, doorY + 1, 14, 14);
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(doorX - 7, doorY + 1, 6, 14);
    ctx.fillStyle = "#e8d7a4";
    ctx.fillRect(doorX + 3, doorY + 8, 1, 1);
  }

  function drawDuck(ctx, time) {
    if (duck.state === "down" && duck.sink > 1.15) return;
    const sunk = duck.state === "down" ? duck.sink : 0;
    ctx.save();
    ctx.globalAlpha = sunk > 0.45 ? Math.max(0, 1 - (sunk - 0.45) / 0.7) : 1;
    const bob = duck.state === "swim" && Math.sin(time * 2.2 + duck.ang) > 0 ? 0 : 1;
    const cx = Math.round(duck.x - view.camX);
    const cy = Math.round(duck.y - view.camY + bob + sunk * 5);
    const face = duck.face ? 1 : -1;
    const tip = sunk > 0 ? 2 : 0;
    const rect = (rx, ry, w, h, color) => {
      ctx.fillStyle = color;
      const x0 = face > 0 ? cx + rx : cx - rx - w;
      ctx.fillRect(x0, cy + ry + tip, w, Math.max(1, h - tip));
    };
    rect(-5, -2, 9, 5, "#2b221c");
    if (sunk < 0.2) rect(-4, -5, 5, 4, "#2b221c");
    rect(-4, -1, 7, 3, "#f7f4ee");
    rect(-3, 0, 4, 2, "#e4dccd");
    rect(2, -4 + tip, 3, 3, "#3e8f4a");
    rect(5, -3 + tip, 2, 1, "#f2c14a");
    rect(-2, 2, 2, 1, "#f2c14a");
    if (sunk > 0 && sunk < 0.35) {
      ctx.fillStyle = "#f3fbff";
      ctx.fillRect(cx - 3, cy + 3, 2, 1);
      ctx.fillRect(cx + 2, cy + 4, 3, 1);
      ctx.fillRect(cx - 1, cy + 5, 1, 1);
    }
    ctx.restore();
  }

  function paintButterfly(ctx, sx, sy, color, wing, tall) {
    const h = tall ? 3 : 2;
    ctx.fillStyle = color;
    ctx.fillRect(sx - wing, sy, wing, h);
    ctx.fillRect(sx + 1, sy, wing, h);
    ctx.fillStyle = "#2b221c";
    ctx.fillRect(sx, sy, 1, h);
  }

  function drawButterfly(ctx, butterfly, time) {
    const body = butterflyBody(butterfly, time);
    const sx = Math.round(body.x - view.camX);
    const sy = Math.round(body.y - body.z - view.camY);
    if (sx < -8 || sy < -8 || sx > view.w + 8 || sy > view.h + 8) return;
    if (butterfly.state === "caught") {
      const wing = Math.sin(time * 10 + butterfly.t) > 0 ? 4 : 3;
      paintButterfly(ctx, sx, sy, butterfly.color, wing, true);
      return;
    }
    const wing = butterfly.state === "ground" ? 3 : butterfly.state === "fall" ? 1 : Math.sin(time * 18 * flySpeed() + butterfly.t) > 0 ? 2 : 1;
    paintButterfly(ctx, sx, sy, butterfly.color, wing, false);
  }

  function drawPistol(ctx, x, y, dir, flash) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const metal = "#5c6370";
    const shine = "#d5dbe3";
    const grip = "#8d5a32";
    const diagonal = {
      upright: [1, -1],
      upleft: [-1, -1],
      downright: [1, 1],
      downleft: [-1, 1],
    }[dir];
    if (diagonal) {
      const [dx, dy] = diagonal;
      ctx.fillStyle = grip;
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
      ctx.fillStyle = metal;
      for (let i = 1; i <= 4; i++) ctx.fillRect(sx + dx * i, sy + dy * i, 1, 1);
      ctx.fillStyle = shine;
      ctx.fillRect(sx + dx * 3, sy + dy * 3, 1, 1);
      if (flash) {
        ctx.fillStyle = "#ffe38a";
        ctx.fillRect(sx + dx * 5, sy + dy * 5, 2, 2);
      }
      return;
    }
    if (dir === "left" || dir === "right") {
      const face = dir === "right" ? 1 : -1;
      const px = (rx, ry, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(face > 0 ? sx + rx : sx - rx - w, sy + ry, w, h);
      };
      px(0, 0, 5, 2, metal);
      px(3, 0, 2, 1, shine);
      px(-1, 1, 3, 2, "#2a241c");
      px(-1, 2, 2, 2, grip);
      if (flash) px(5, -1, 2, 3, "#ffe38a");
      return;
    }
    const down = dir === "down";
    ctx.fillStyle = metal;
    ctx.fillRect(sx, sy + (down ? 0 : -4), 2, 5);
    ctx.fillStyle = shine;
    ctx.fillRect(sx, sy + (down ? 3 : -4), 1, 2);
    ctx.fillStyle = grip;
    ctx.fillRect(sx + (down ? 1 : -2), sy + (down ? 0 : -1), 2, 2);
    if (flash) {
      ctx.fillStyle = "#ffe38a";
      ctx.fillRect(sx - 1, sy + (down ? 5 : -6), 3, 2);
    }
  }

  function heldItemPos(item, bob) {
    const hand = handAnchor(bob);
    if (item.anim > 0) {
      const k = 1 - item.anim / 0.22;
      const ease = k * k;
      return {
        x: item.fromX + (hand.x - item.fromX) * ease,
        y: item.fromY + (hand.y - item.fromY) * ease,
      };
    }
    return hand;
  }

  function drawNet(ctx, x, y, dir, swing) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const wood = "#a56b3c";
    const woodD = "#6e4324";
    const rim = "#39d6c4";
    const mesh = "#e9fffb";
    const hoop = (cx, cy) => {
      ctx.fillStyle = rim;
      ctx.fillRect(cx - 2, cy - 3, 5, 1);
      ctx.fillRect(cx - 2, cy + 2, 5, 1);
      ctx.fillRect(cx - 3, cy - 2, 1, 4);
      ctx.fillRect(cx + 3, cy - 2, 1, 4);
      ctx.fillStyle = mesh;
      ctx.fillRect(cx - 1, cy - 1, 1, 1);
      ctx.fillRect(cx + 1, cy, 1, 1);
      ctx.fillRect(cx, cy + 1, 1, 1);
      if (swing) {
        ctx.fillStyle = "#fffef6";
        ctx.fillRect(cx - 1, cy - 4, 3, 1);
      }
    };
    const diagonal = {
      upright: [1, -1],
      upleft: [-1, -1],
      downright: [1, 1],
      downleft: [-1, 1],
    }[dir];
    if (diagonal) {
      const [dx, dy] = diagonal;
      ctx.fillStyle = wood;
      for (let i = 0; i <= 3; i++) ctx.fillRect(sx + dx * i, sy + dy * i, 1, 1);
      ctx.fillStyle = woodD;
      ctx.fillRect(sx, sy, 1, 1);
      hoop(sx + dx * 6, sy + dy * 6);
      return;
    }
    if (dir === "left" || dir === "right") {
      const face = dir === "right" ? 1 : -1;
      ctx.fillStyle = woodD;
      ctx.fillRect(sx, sy, 1, 1);
      ctx.fillStyle = wood;
      ctx.fillRect(face > 0 ? sx + 1 : sx - 3, sy, 3, 1);
      hoop(sx + face * 6, sy);
      return;
    }
    const sign = dir === "down" ? 1 : -1;
    ctx.fillStyle = woodD;
    ctx.fillRect(sx, sy, 1, 1);
    ctx.fillStyle = wood;
    ctx.fillRect(sx, sy + sign, 1, 1);
    ctx.fillRect(sx, sy + sign * 2, 1, 1);
    hoop(sx, sy + sign * 6);
  }

  function drawHeldWeapon(ctx, bob) {
    const active = activeWeapon();
    if (active === "net") {
      const pos = heldItemPos(net, bob);
      drawNet(ctx, pos.x, pos.y, player.dir, player.flash > 0);
    } else if (active === "gun") {
      const pos = heldItemPos(gun, bob);
      drawPistol(ctx, pos.x, pos.y, player.dir, player.flash > 0);
    }
  }

  function drawShot(ctx, bullet) {
    const sx = Math.round(bullet.x - view.camX);
    const sy = Math.round(bullet.y - view.camY);
    if (bullet.kind === "net") {
      ctx.fillStyle = "#39d6c4";
      ctx.fillRect(sx - 2, sy - 2, 5, 1);
      ctx.fillRect(sx - 2, sy + 2, 5, 1);
      ctx.fillRect(sx - 2, sy - 1, 1, 3);
      ctx.fillRect(sx + 2, sy - 1, 1, 3);
      ctx.fillStyle = "#e9fffb";
      ctx.fillRect(sx, sy, 1, 1);
      return;
    }
    ctx.fillStyle = "#ffe38a";
    ctx.fillRect(sx, sy, 2, 2);
    ctx.fillStyle = "#e07a3d";
    ctx.fillRect(sx - Math.sign(bullet.vx), sy - Math.sign(bullet.vy), 1, 1);
  }

  function drawUnicornFrontHead(ctx, sx, sy) {
    const body = "#f7f8ff";
    const shade = "#d5d8ea";
    const mane = "#f4b6d8";
    ctx.fillStyle = mane;
    ctx.fillRect(sx - 8, sy - 22, 3, 7);
    ctx.fillRect(sx + 5, sy - 22, 3, 7);
    ctx.fillStyle = body;
    ctx.fillRect(sx - 5, sy - 21, 10, 11);
    ctx.fillStyle = shade;
    ctx.fillRect(sx - 3, sy - 13, 6, 3);
    ctx.fillStyle = "#c5c8dc";
    ctx.fillRect(sx - 2, sy - 12, 1, 1);
    ctx.fillRect(sx + 1, sy - 12, 1, 1);
    ctx.fillStyle = body;
    ctx.fillRect(sx - 7, sy - 24, 3, 4);
    ctx.fillRect(sx + 4, sy - 24, 3, 4);
    ctx.fillStyle = mane;
    ctx.fillRect(sx - 6, sy - 23, 1, 2);
    ctx.fillRect(sx + 5, sy - 23, 1, 2);
    ctx.fillStyle = "#241c18";
    ctx.fillRect(sx - 3, sy - 17, 1, 2);
    ctx.fillRect(sx + 2, sy - 17, 1, 2);
    ctx.fillStyle = "#3ec6ff";
    ctx.fillRect(sx - 1, sy - 27, 2, 7);
    ctx.fillStyle = "#e9fbff";
    ctx.fillRect(sx, sy - 27, 1, 2);
  }

  function drawDeadUnicorn(ctx, x, y) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const body = "#f7f8ff";
    const shade = "#d5d8ea";
    const mane = "#f4b6d8";
    ctx.fillStyle = mane;
    ctx.fillRect(sx + 12, sy - 9, 5, 3);
    ctx.fillStyle = body;
    ctx.fillRect(sx - 8, sy - 12, 22, 8);
    ctx.fillStyle = shade;
    ctx.fillRect(sx - 6, sy - 6, 16, 2);
    ctx.fillStyle = "#8d5a32";
    ctx.fillRect(sx - 1, sy - 14, 8, 2);
    ctx.fillStyle = body;
    ctx.fillRect(sx - 18, sy - 16, 11, 8);
    ctx.fillStyle = shade;
    ctx.fillRect(sx - 16, sy - 10, 6, 2);
    ctx.fillStyle = body;
    ctx.fillRect(sx - 16, sy - 19, 3, 3);
    ctx.fillStyle = mane;
    ctx.fillRect(sx - 15, sy - 18, 1, 2);
    ctx.fillRect(sx - 8, sy - 16, 4, 5);
    ctx.fillStyle = "#241c18";
    ctx.fillRect(sx - 14, sy - 13, 3, 1);
    ctx.fillStyle = "#3ec6ff";
    ctx.fillRect(sx - 12, sy - 24, 2, 8);
    ctx.fillStyle = "#e9fbff";
    ctx.fillRect(sx - 12, sy - 24, 1, 2);
    ctx.fillStyle = shade;
    ctx.fillRect(sx - 4, sy - 5, 3, 5);
    ctx.fillRect(sx + 1, sy - 5, 3, 4);
    ctx.fillRect(sx + 6, sy - 5, 3, 5);
    ctx.fillStyle = "#c9b8a4";
    ctx.fillRect(sx - 4, sy - 1, 3, 2);
    ctx.fillRect(sx + 1, sy - 2, 3, 2);
    ctx.fillRect(sx + 6, sy - 1, 3, 2);
  }

  function drawUnicorn(ctx, x, y, dir, gallop) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const body = "#f7f8ff";
    const shade = "#d5d8ea";
    const mane = "#f4b6d8";
    const horn = "#3ec6ff";
    const hoof = "#c9b8a4";
    const eye = "#241c18";
    const saddle = "#8d5a32";
    const side = dir === "left" || dir === "upleft" || dir === "downleft" ? -1
      : dir === "right" || dir === "upright" || dir === "downright" ? 1 : 0;
    const step = gallop ? 1 : 0;
    if (side !== 0) {
      const face = side;
      const px = (rx, ry, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(face > 0 ? sx + rx : sx - rx - w, sy + ry, w, h);
      };
      const leg = (rx, reach, drop) => {
        px(rx + reach, -9, 3, 7 + drop, shade);
        px(rx + reach, -2 + drop, 3, 2, hoof);
      };
      px(-16, -16, 4, 3, mane);
      px(-15, -13, 3, 6, mane);
      px(-12, -19, 22, 10, body);
      px(-8, -12, 14, 3, shade);
      px(-2, -21, 8, 3, saddle);
      px(7, -25, 5, 8, body);
      px(10, -27, 8, 7, body);
      px(14, -25, 4, 3, shade);
      px(9, -29, 2, 3, body);
      px(12, -34, 2, 7, horn);
      px(12, -34, 1, 2, "#e9fbff");
      px(6, -26, 3, 8, mane);
      px(14, -24, 1, 1, eye);
      leg(-9, step ? -1 : 0, step ? 0 : 2);
      leg(-3, step ? 1 : 0, step ? 2 : 0);
      leg(3, step ? 3 : 0, step ? 0 : 1);
      leg(8, step ? 0 : 3, step ? 2 : 0);
      return;
    }
    const legDown = (lx, drop) => {
      ctx.fillStyle = shade;
      ctx.fillRect(sx + lx, sy - 9, 3, 7 + drop);
      ctx.fillStyle = hoof;
      ctx.fillRect(sx + lx, sy - 2 + drop, 3, 2);
    };
    if (dir === "up") {
      ctx.fillStyle = mane;
      ctx.fillRect(sx - 4, sy - 22, 8, 4);
      ctx.fillStyle = body;
      ctx.fillRect(sx - 9, sy - 18, 18, 10);
      ctx.fillStyle = shade;
      ctx.fillRect(sx - 7, sy - 12, 14, 3);
      ctx.fillStyle = saddle;
      ctx.fillRect(sx - 4, sy - 20, 8, 3);
      ctx.fillStyle = horn;
      ctx.fillRect(sx - 1, sy - 26, 2, 5);
      ctx.fillStyle = mane;
      ctx.fillRect(sx - 6, sy - 16, 3, 6);
      legDown(-8, step ? 2 : 0);
      legDown(-2, step ? 0 : 2);
      legDown(2, step ? 2 : 0);
      legDown(6, step ? 0 : 2);
      return;
    }
    ctx.fillStyle = body;
    ctx.fillRect(sx - 9, sy - 18, 18, 10);
    ctx.fillStyle = shade;
    ctx.fillRect(sx - 7, sy - 12, 14, 3);
    ctx.fillStyle = saddle;
    ctx.fillRect(sx - 4, sy - 20, 8, 3);
    legDown(-8, step ? 0 : 2);
    legDown(-2, step ? 2 : 0);
    legDown(2, step ? 0 : 2);
    legDown(6, step ? 2 : 0);
    drawUnicornFrontHead(ctx, sx, sy);
  }

  function drawSeated(ctx, sprite, x, y, dir) {
    const cut = 22;
    const seat = 17;
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const side = dir === "left" || dir === "upleft" || dir === "downleft" ? -1
      : dir === "right" || dir === "upright" || dir === "downright" ? 1 : 0;
    const pants = "#3c4a6c";
    const pantsD = "#2a3550";
    const shoe = "#2a2420";
    if (side !== 0) {
      const face = side;
      const px = (rx, ry, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(face > 0 ? sx + rx : sx - rx - w, sy + ry, w, h);
      };
      px(-1, -18, 7, 3, pants);
      px(4, -16, 3, 5, pantsD);
      px(4, -11, 4, 2, shoe);
    } else if (dir !== "up") {
      ctx.fillStyle = pants;
      ctx.fillRect(sx - 11, sy - 18, 6, 3);
      ctx.fillRect(sx + 5, sy - 18, 6, 3);
      ctx.fillStyle = pantsD;
      ctx.fillRect(sx - 11, sy - 15, 3, 4);
      ctx.fillRect(sx + 8, sy - 15, 3, 4);
      ctx.fillStyle = shoe;
      ctx.fillRect(sx - 11, sy - 11, 4, 2);
      ctx.fillRect(sx + 7, sy - 11, 4, 2);
    }
    ctx.drawImage(
      sprite.c,
      0,
      0,
      SPR_W,
      cut,
      Math.round(x) - sprite.ax - view.camX,
      Math.round(y) - seat - cut - view.camY,
      SPR_W,
      cut
    );
  }

  function drawActor(ctx, visual) {
    const depth = playerDepth();
    let line = 0;
    if (depth) {
      const sy = Math.round(player.y - view.camY);
      const lift = mounted ? 9 : 0;
      line = sy - (depth === 1 ? 7 : 13) - lift;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, view.w, Math.max(0, line));
      ctx.clip();
    }
    if (mounted) {
      const gallop = player.moving ? Math.floor(player.phase / 2) % 2 : 0;
      drawUnicorn(ctx, player.x, player.y, player.dir, gallop);
      drawSeated(ctx, visual.sprite, player.x, player.y, player.dir);
      if (player.dir === "down") {
        drawUnicornFrontHead(ctx, Math.round(player.x - view.camX), Math.round(player.y - view.camY));
      }
      drawHeldWeapon(ctx, 0);
    } else {
      drawSprite(ctx, visual.sprite, player.x, player.y, visual.bob);
      drawHeldWeapon(ctx, visual.bob);
    }
    if (depth) {
      ctx.restore();
      ctx.fillStyle = "#b7e7f8";
      const sx = Math.round(player.x - view.camX);
      const half = mounted ? 10 : 7;
      ctx.fillRect(sx - half, line, half * 2, 1);
    }
  }

  function present() {
    screen.imageSmoothingEnabled = false;
    screen.fillStyle = "#172014";
    screen.fillRect(0, 0, canvas.width, canvas.height);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(low, view.ox, view.oy, view.w * view.pixel, view.h * view.pixel);
  }

  function render(time) {
    const ctx = low.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (indoors) {
      ctx.fillStyle = "#1a1612";
      ctx.fillRect(0, 0, view.w, view.h);
      drawInterior(ctx);
      for (const butterfly of butterflies) {
        if (butterfly.inside && butterfly.state !== "fly") drawButterfly(ctx, butterfly, time);
      }
      if (unicorn.inside) {
        if (unicorn.state === "dead") drawDeadUnicorn(ctx, unicorn.x, unicorn.y);
        else drawUnicorn(ctx, unicorn.x, unicorn.y, "down", 0);
      }
      drawPlayerAndShots(ctx, time);
      present();
      return;
    }
    ctx.fillStyle = "#63b348";
    ctx.fillRect(0, 0, view.w, view.h);
    blitField(ctx);

    const frame = Math.floor(time * 2.5) % 4;
    const x0 = Math.max(0, Math.floor(view.camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(view.camY / TILE) - 1);
    const x1 = Math.min(COLS, Math.ceil((view.camX + view.w) / TILE) + 1);
    const y1 = Math.min(ROWS, Math.ceil((view.camY + view.h) / TILE) + 1);
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const px = tx * TILE - view.camX;
        const py = ty * TILE - view.camY;
        if (groundAt(tx, ty) === T.WATER) {
          const row = waterIndex[ty * COLS + tx];
          if (row >= 0) ctx.drawImage(waterSheet, frame * TILE, row * TILE, TILE, TILE, px, py, TILE, TILE);
        }
        else if (decorAt(tx, ty) === DECOR.REED) drawReed(ctx, px, py, time, tx * 0.7 + ty);
        else if ((tx * 5 + ty * 3) % 11 === 0 && groundAt(tx, ty) === T.GRASS) {
          const sway = Math.round(Math.sin(time * 1.6 + tx * 0.8 + ty));
          ctx.fillStyle = "#3f7d32";
          ctx.fillRect(px + 4 + sway, py + 10, 1, 3);
          ctx.fillStyle = "#b6e888";
          ctx.fillRect(px + 4 + sway, py + 10, 1, 1);
        }
      }
    }

    for (const lily of lilies) drawLily(ctx, lily.x, lily.y);

    for (const prop of props) {
      if (!prop.shadowRX) continue;
      if (prop.x < view.camX - 40 || prop.x > view.camX + view.w + 40) continue;
      ellipse(
        ctx,
        Math.round(prop.x - view.camX),
        Math.round(prop.y - view.camY),
        prop.shadowRX,
        prop.shadowRY,
        "rgba(24, 42, 18, 0.28)"
      );
    }

    for (const butterfly of butterflies) {
      if (butterfly.inside) continue;
      if (butterfly.state !== "fly" && butterfly.state !== "fall") continue;
      const body = butterflyBody(butterfly, time);
      ellipse(
        ctx,
        Math.round(body.x - view.camX),
        Math.round(body.y - view.camY),
        body.z > 6 ? 2 : 3,
        1,
        "rgba(24, 42, 18, 0.22)"
      );
    }

    const visual = currentVisual(time);
    ellipse(
      ctx,
      Math.round(player.x - view.camX),
      Math.round(player.y - view.camY),
      mounted ? 12 : visual.bob ? 4 : 5,
      mounted ? 4 : 2,
      "rgba(24, 42, 18, 0.33)"
    );
    drawMarker(ctx, time);

    const drawables = [];
    for (const prop of props) {
      if (prop.x < view.camX - 48 || prop.y < view.camY - 64) continue;
      if (prop.x > view.camX + view.w + 48 || prop.y > view.camY + view.h + 48) continue;
      drawables.push(prop);
    }
    if (!gun.held) drawables.push({ gun: true, x: gun.x, y: gun.y });
    if (!net.held) drawables.push({ net: true, x: net.x, y: net.y });
    if (!mounted && !unicorn.inside) drawables.push({ unicorn: true, x: unicorn.x, y: unicorn.y });
    drawables.push({ house: true, x: house.x, y: house.y - 8 });
    for (const butterfly of butterflies) {
      if (butterfly.state === "ground" && !butterfly.inside) drawables.push({ rest: butterfly, x: butterfly.x, y: butterfly.y });
    }
    drawables.push({ player: true, x: player.x, y: player.y });
    drawables.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of drawables) {
      if (item.player) drawActor(ctx, visual);
      else if (item.unicorn) {
        if (unicorn.state === "dead") drawDeadUnicorn(ctx, unicorn.x, unicorn.y);
        else drawUnicorn(ctx, unicorn.x, unicorn.y, "down", Math.sin(time * 2) > 0 ? 1 : 0);
      }
      else if (item.house) drawHouse(ctx);
      else if (item.duck) drawDuck(ctx, time);
      else if (item.gun) {
        const bob = Math.sin(time * 3) > 0 ? -1 : 0;
        drawPistol(ctx, gun.x, gun.y + bob, "right", false);
        if (gunDistance() < 34) {
          ctx.fillStyle = "#fff4cc";
          const sx = Math.round(gun.x - view.camX);
          const sy = Math.round(gun.y + bob - view.camY - 8);
          ctx.fillRect(sx, sy, 1, 1);
          ctx.fillRect(sx - 1, sy + 2, 1, 1);
          ctx.fillRect(sx + 1, sy + 2, 1, 1);
        }
      } else if (item.net) {
        const bob = Math.sin(time * 3) > 0 ? -1 : 0;
        drawNet(ctx, net.x, net.y + bob, "right", false);
        if (netDistance() < 34) {
          ctx.fillStyle = "#d7fff8";
          const sx = Math.round(net.x - view.camX);
          const sy = Math.round(net.y + bob - view.camY - 8);
          ctx.fillRect(sx, sy, 1, 1);
          ctx.fillRect(sx - 1, sy + 2, 1, 1);
          ctx.fillRect(sx + 1, sy + 2, 1, 1);
        }
      } else if (item.rest) drawButterfly(ctx, item.rest, time);
      else drawSprite(ctx, item.sprite, item.x, item.y, 0);
    }

    for (const mote of motes) {
      ctx.globalAlpha = Math.max(0, mote.life * 2.6);
      ctx.fillStyle = "#a08050";
      ctx.fillRect(Math.round(mote.x - view.camX), Math.round(mote.y - view.camY), 1, 1);
    }
    ctx.globalAlpha = 1;

    for (const bullet of bullets) drawShot(ctx, bullet);

    for (const butterfly of butterflies) {
      if (butterfly.state === "fly" || (butterfly.state === "fall" && !butterfly.inside)) drawButterfly(ctx, butterfly, time);
    }

    present();
  }

  function drawPlayerAndShots(ctx, time) {
    const visual = currentVisual(time);
    ellipse(
      ctx,
      Math.round(player.x - view.camX),
      Math.round(player.y - view.camY),
      visual.bob ? 4 : 5,
      2,
      "rgba(24, 42, 18, 0.33)"
    );
    drawActor(ctx, visual);
    for (const bullet of bullets) drawShot(ctx, bullet);
  }

  function worldFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const bx = x * (canvas.width / rect.width);
    const by = y * (canvas.height / rect.height);
    if (bx < view.ox || by < view.oy) return null;
    if (bx >= view.ox + view.w * view.pixel || by >= view.oy + view.h * view.pixel) return null;
    return {
      x: clamp((bx - view.ox) / view.pixel + view.camX, 10, WORLD_W - 10),
      y: clamp((by - view.oy) / view.pixel + view.camY, 10, WORLD_H - 10),
    };
  }

  function bindInput() {
    const arm = () => sfx.arm();
    window.addEventListener("keydown", (event) => {
      arm();
      const key = event.key.toLowerCase();
      if ((key === " " || key === "e") && event.repeat) {
        if (key === " ") event.preventDefault();
        return;
      }
      if (key === "m") {
        if (!event.repeat) setMusic(!musicOn);
        return;
      }
      if (key === "q") {
        if (!event.repeat && gun.held && net.held) {
          weapon = activeWeapon() === "net" ? "gun" : "net";
          hintMode = "";
        }
        return;
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      keys.add(key);
      if (key === "e") pickupNearby();
      if (key === " ") shootQueued = true;
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => keys.clear());

    canvas.addEventListener("pointerdown", (event) => {
      sfx.arm();
      if (event.button === 2) {
        event.preventDefault();
        shootQueued = true;
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      const point = worldFromEvent(event);
      if (!point) return;
      pointerDown = true;
      target = point;
      canvas.setPointerCapture(event.pointerId);
    }, { passive: false });

    canvas.addEventListener("pointermove", (event) => {
      if (!pointerDown) return;
      const point = worldFromEvent(event);
      if (point) target = point;
    });

    const release = () => {
      pointerDown = false;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    const musicButton = document.getElementById("music");
    if (musicButton) {
      musicButton.addEventListener("click", () => {
        sfx.arm();
        setMusic(!musicOn);
        musicButton.blur();
      });
    }
    window.addEventListener("resize", () => {
      resize();
      updateCamera();
    });
  }

  function loop(time) {
    const seconds = time / 1000;
    if (!loop.last) loop.last = time;
    const dt = Math.min(0.05, (time - loop.last) / 1000);
    loop.last = time;
    update(dt, seconds);
    render(seconds);
    requestAnimationFrame(loop);
  }

  bindInput();
  resize();
  chars = bakeCharacters();
  treeSprites = [0, 1, 2].map(bakeTree);
  bushSprites = [0, 1, 2].map(bakeBush);
  createWorld(treeSprites, bushSprites);
  updateScore();
  updateCamera();
  requestAnimationFrame(loop);
})();

function showError(err) {
  const pre = document.createElement("pre");
  pre.className = "error";
  pre.textContent = String((err && err.stack) || err);
  document.body.appendChild(pre);
}
