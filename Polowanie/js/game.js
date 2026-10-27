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
  const COLS = 272;
  const ROWS = 240;
  const WORLD_W = COLS * TILE;
  const WORLD_H = ROWS * TILE;
  const SEED = 23;
  const SPR_W = 24;
  const SPR_H = 36;

  const T = { GRASS: 0, DIRT: 1, SAND: 2, WATER: 3, ASPHALT: 4, FIELD: 5 };
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
  function blankActor(pad) {
    return {
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
      indoors: false,
      mounted: false,
      mountKind: "",
      ride: null,
      doorLock: 0,
      mountLock: 0,
      weapon: "gun",
      outsideSpot: { x: 0, y: 0 },
      shootQueued: false,
      shootCooldown: 0,
      target: null,
      gold: 0,
      energy: 100,
      carry: null,
      pocket: { raw: 0, roast: 0 },
      pad,
      sprites: null,
      camX: 0,
      camY: 0,
      padPrev: { a: false, shoot: false, y: false, b: false },
      _stick: { x: 0, y: 0, keyboard: false },
      _run: false,
    };
  }

  const actors = [blankActor(false), blankActor(true), blankActor(true)];
  actors[2].asleep = true;
  let player = actors[0];
  let netSlot = 1;

  function localActor() {
    return netRole === "guest" ? actors[netSlot] || actors[1] : actors[0];
  }

  function livePeople() {
    if (netRole) return actors.filter((who) => !who.asleep);
    if (playerCount === 2) return [actors[0], actors[1]];
    return [actors[0]];
  }

  let low = document.createElement("canvas");
  let low2 = document.createElement("canvas");
  let ground;
  let decor;
  let props;
  let woods = [];
  let woodGrid = null;
  let field;
  let fieldBase = null;
  let radarMap;
  let fogMap;
  let seen;
  let butterflies;
  let duck;
  let lilies;
  let gun;
  let net;
  let gear = [];
  let scalePixel = 3;
  let phoneScaleApplied = false;
  let joined = true;
  let weapon = "gun";
  let unicorn;
  let unicorns = [];
  let mounted = false;
  let mountKind = "";
  let mountLock = 0;
  let house;
  let places = [];
  let indoors = false;
  let doorLock = 0;
  let outsideSpot = { x: 0, y: 0 };
  let scoreWho = null;
  let musicTime = 0;
  let playerCount = 0;
  let loopStarted = false;
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
  let phoneMode = false;
  let touchRun = false;
  const touchStick = { x: 0, y: 0 };
  let netPeer = null;
  let mqttClient = null;
  let netConn = null;
  const netConns = [null, null];
  let netSelf = "";
  let netSeated = false;
  let netBroker = "hivemq";
  let pendingSave = null;
  let localSocket = null;
  const cutWoods = [];
  const appliedCuts = new Set();
  const guestIds = [null, null];
  const netIns = [null, { x: 0, y: 0, run: false, fire: false, act: false, weapon: false }, { x: 0, y: 0, run: false, fire: false, act: false, weapon: false }];
  let netRole = "";
  let startGuestGame = function () {};
  let netCode = "";
  let netSeed = 0;
  let netTune = null;
  let netState = null;
  let netAcc = 0;
  const netPulse = { fire: false, act: false, weapon: false };
  let pond = { x: 16, y: 14, rx: 5.4, ry: 4 };
  let ponds = [];
  let ducks = [];
  let boars = [];
  let fauna = [];
  let butterflyCap = 0;
  let butterflyTimer = 0;
  let wade = new Uint8Array(0);
  let waterIndex = new Int16Array(0);
  let waterSheet = document.createElement("canvas");
  const motes = [];
  let chars;
  let hintMode = "";
  let level = 1;
  let mapId = "tuczno";
  let forestMask = null;
  const tune = {
    run: 76,
    energy: 100,
    boarEnergy: 100,
    boarDamage: 10,
    regen: 1,
    returnTime: 120,
    butterflies: 72,
    ponds: 3,
    ducks: 2,
    boars: 8,
    foxes: 30,
    squirrels: 30,
    deer: 30,
    birds: 30,
  };

  function readTune() {
    const num = (id, fallback) => {
      const el = document.getElementById(id);
      const value = el ? Number(el.value) : fallback;
      return Number.isFinite(value) ? value : fallback;
    };
    tune.run = num("set-run", 76);
    tune.energy = num("set-energy", 100);
    tune.boarEnergy = num("set-boar-energy", 100);
    tune.boarDamage = num("set-boar-dmg", 10);
    tune.regen = num("set-regen", 1);
    tune.returnTime = num("set-return", 120);
    tune.butterflies = num("set-flies", 72);
    tune.ponds = num("set-ponds", 3);
    tune.ducks = num("set-ducks", 2);
    tune.boars = num("set-boars", 8);
    tune.foxes = num("set-foxes", 30);
    tune.squirrels = num("set-squirrels", 30);
    tune.deer = num("set-deer", 30);
    tune.birds = num("set-birds", 30);
  }

  function energyPct(value, max) {
    return Math.max(0, Math.round(100 * value / Math.max(1, max)));
  }
  let levelBanner = 0;
  let layout = { pathPhase: 0, pathShift: 0 };
  let treeSprites = [];
  let pineSprites = [];
  let bushSprites = [];

  let musicOn = true;
  let boarsOn = true;

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
    button.textContent = document.body.classList.contains("phone") ? "♪" : (on ? "Muzyka: włączona" : "Muzyka: wyłączona");
    button.classList.toggle("off", document.body.classList.contains("phone") && !on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setBoars(on) {
    boarsOn = on;
    if (!on) boars = [];
    else if (ground) spawnBoars();
    const button = document.getElementById("boars-toggle");
    if (!button) return;
    button.textContent = document.body.classList.contains("phone") ? "🐗" : (on ? "Dziki: włączone" : "Dziki: wyłączone");
    button.classList.toggle("off", document.body.classList.contains("phone") && !on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.hidden = netRole === "guest";
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

  function playGrowl() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, 98, 0.14, "sawtooth", 0.03);
    tone(ctx, t + 0.1, 72, 0.18, "triangle", 0.04);
  }

  function playSqueal() {
    const ctx = sfx.arm();
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, t, 780, 0.05, "square", 0.03);
    tone(ctx, t + 0.05, 1040, 0.07, "square", 0.028);
    tone(ctx, t + 0.11, 640, 0.09, "triangle", 0.025);
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
    return 1;
  }

  function useActor(who) {
    player = who;
    indoors = who.indoors;
    mounted = who.mounted;
    mountKind = who.mountKind || "";
    weapon = who.weapon;
    doorLock = who.doorLock;
    mountLock = who.mountLock;
    shootQueued = who.shootQueued;
    shootCooldown = who.shootCooldown;
    target = who.target;
    outsideSpot = who.outsideSpot;
    unicorn = who.ride && unicorns.indexOf(who.ride) >= 0 ? who.ride : null;
  }

  function keepActor() {
    player.indoors = indoors;
    player.mounted = mounted;
    player.mountKind = mounted ? mountKind : "";
    player.weapon = weapon;
    player.doorLock = doorLock;
    player.mountLock = mountLock;
    player.shootQueued = shootQueued;
    player.shootCooldown = shootCooldown;
    player.target = target;
    player.outsideSpot = outsideSpot;
    const next = mounted ? (mountKind === "boar" ? player.ride : unicorn) : null;
    if (player.ride && player.ride !== next && player.ride.rider === player) player.ride.rider = null;
    player.ride = next;
    if (player.ride) player.ride.rider = player;
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
    const id = Math.floor(musicTime / 180) % TRACKS.length;
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

  function installSeed(seed) {
    const prev = Math.random;
    let a = seed >>> 0;
    Math.random = function seededRandom() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return () => {
      Math.random = prev;
    };
  }

  function heldCounts(who) {
    const count = (kind) => gear.filter((item) => item.kind === kind && item.holder === who).length;
    return {
      gun: count("gun"),
      net: count("net"),
      sword: count("sword"),
      raw: pocketOf(who).raw,
      roast: pocketOf(who).roast,
    };
  }

  function packNet() {
    const person = (who) => ({
      x: who.x, y: who.y, dir: who.dir, face: who.face,
      gold: who.gold, energy: who.energy,
      mounted: who.mounted, mountKind: who.mountKind || "",
      indoors: who.indoors, weapon: who.weapon,
      moving: who.moving, phase: who.phase, slash: who.slash || 0,
      asleep: !!who.asleep,
      held: heldCounts(who),
    });
    const whoIndex = (who) => {
      const index = actors.indexOf(who);
      return index < 0 ? -1 : index;
    };
    return {
      players: actors.map(person),
      boars: boars.map((b) => [b.x, b.y, b.dir, b.state, b.energy, whoIndex(b.rider)]),
      fauna: fauna.map((a) => [a.x, a.y, a.dir, a.state, a.z || 0]),
      unicorns: unicorns.map((u) => [u.x, u.y, u.dir, u.state, whoIndex(u.rider)]),
      bullets: bullets.map((b) => [b.x, b.y, b.kind || "gun", whoIndex(b.owner)]),
      cuts: cutWoods,
      gear: gear.map((item) => [
        item.x, item.y, item.held ? 1 : 0,
        whoIndex(item.holder),
        item.kind,
      ]),
    };
  }

  function aimNet(obj, x, y) {
    if (obj._sx === x && obj._sy === y) return;
    obj._fx = obj.x;
    obj._fy = obj.y;
    obj._sx = x;
    obj._sy = y;
    obj._st = 0;
  }

  function blendNet(dt) {
    const step = dt / 0.05;
    const slide = (obj) => {
      if (obj._sx == null) return;
      obj._st = Math.min(1, (obj._st || 0) + step);
      obj.x = obj._fx + (obj._sx - obj._fx) * obj._st;
      obj.y = obj._fy + (obj._sy - obj._fy) * obj._st;
    };
    actors.forEach(slide);
    boars.forEach(slide);
    fauna.forEach(slide);
    unicorns.forEach(slide);
  }

  function applyNetState() {
    const state = netState;
    if (!state || !state.players) return;
    state.players.forEach((src, index) => {
      const who = actors[index];
      if (!who || !src) return;
      const wasIn = who.indoors;
      const wasMount = !!who.mounted;
      who.gold = src.gold;
      who.energy = src.energy;
      who.mounted = src.mounted;
      who.mountKind = src.mountKind;
      who.indoors = src.indoors;
      who.weapon = src.weapon;
      who.dir = src.dir;
      who.face = src.face;
      who.moving = src.moving;
      who.phase = src.phase;
      who.slash = src.slash || 0;
      const far = Math.hypot(who.x - src.x, who.y - src.y) > 90 || wasIn !== src.indoors || wasMount !== !!src.mounted;
      if (far) {
        who.x = src.x;
        who.y = src.y;
        who._fx = src.x;
        who._fy = src.y;
        who._sx = src.x;
        who._sy = src.y;
        who._st = 1;
      } else aimNet(who, src.x, src.y);
      who.asleep = !!src.asleep;
      who.netHeld = src.held;
    });
    const copy = (list, rows, fields) => {
      const n = Math.min(list.length, rows.length);
      for (let i = 0; i < n; i++) {
        fields.forEach((field, k) => {
          list[i][field] = rows[i][k];
        });
      }
    };
    if (state.gear) {
      while (gear.length > state.gear.length) gear.pop();
      state.gear.forEach((row, i) => {
        let item = gear[i];
        if (!item) {
          item = { kind: row[4], x: row[0], y: row[1], held: false, anim: 0, fromX: 0, fromY: 0, holder: null };
          gear.push(item);
        }
        item.kind = row[4];
        item.x = row[0];
        item.y = row[1];
        item.held = row[2] === 1;
        item.holder = row[3] >= 0 ? actors[row[3]] || null : null;
        item.anim = 0;
      });
    }
    if (state.boars) {
      while (boars.length < state.boars.length) {
        boars.push({
          x: 0, y: 0, homeX: 0, homeY: 0, tx: 0, ty: 0,
          dir: "right", state: "roam", wander: 0, bite: 0, rider: null,
          vanish: 0, respawn: 0, energy: tune.boarEnergy, voice: 0,
        });
      }
      boars.length = state.boars.length;
      for (let i = 0; i < boars.length; i++) {
        const row = state.boars[i];
        const boar = boars[i];
        if (netRole === "guest") aimNet(boar, row[0], row[1]);
        else {
          boar.x = row[0];
          boar.y = row[1];
        }
        boar.dir = row[2];
        boar.state = row[3];
        boar.energy = row[4];
        const rider = row[5] >= 0 ? actors[row[5]] : null;
        boar.rider = rider || null;
        if (rider && rider.mountKind === "boar") {
          rider.mounted = true;
          rider.ride = boar;
          boar.x = rider.x;
          boar.y = rider.y;
        }
        if (!boar.homeX && !boar.homeY) {
          boar.homeX = row[0];
          boar.homeY = row[1];
          boar.tx = row[0];
          boar.ty = row[1];
        }
      }
    }
    if (state.fauna) {
      const n = Math.min(fauna.length, state.fauna.length);
      for (let i = 0; i < n; i++) {
        const row = state.fauna[i];
        aimNet(fauna[i], row[0], row[1]);
        fauna[i].dir = row[2];
        fauna[i].state = row[3];
        fauna[i].z = row[4];
      }
    }
    if (state.unicorns) {
      while (unicorns.length < state.unicorns.length) {
        unicorns.push({
          x: 0, y: 0, state: "free", inside: false, mane: "#b7e7f8", rider: null,
          dir: "down", homeX: 0, homeY: 0, tx: 0, ty: 0, wander: 0,
        });
      }
      unicorns.length = state.unicorns.length;
      for (let i = 0; i < unicorns.length; i++) {
        const row = state.unicorns[i];
        const uni = unicorns[i];
        if (netRole === "guest") aimNet(uni, row[0], row[1]);
        else {
          uni.x = row[0];
          uni.y = row[1];
        }
        uni.dir = row[2];
        uni.state = row[3];
        const rider = row[4] >= 0 ? actors[row[4]] : null;
        uni.rider = rider || null;
        if (rider && rider.mountKind !== "boar") {
          rider.mounted = true;
          rider.mountKind = rider.mountKind || "uni";
          rider.ride = uni;
          uni.inside = false;
          if (uni.state !== "dead" && uni.state !== "gone") uni.state = "free";
          uni.x = rider.x;
          uni.y = rider.y;
          uni.homeX = rider.x;
          uni.homeY = rider.y;
        }
      }
    }
    if (state.bullets) {
      bullets.length = 0;
      for (const row of state.bullets) {
        bullets.push({
          x: row[0], y: row[1], kind: row[2], owner: actors[row[3]] || actors[0],
          vx: 0, vy: 0, life: 1, indoors: false,
        });
      }
    }
    if (state.cuts) {
      for (const row of state.cuts) {
        const key = row[0] + "," + row[1];
        if (appliedCuts.has(key)) continue;
        appliedCuts.add(key);
        dropWood(row[0], row[1]);
      }
    }
  }

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

  function bakePine(variant) {
    const height = [30, 34, 26][variant];
    const half = [9, 10, 8][variant];
    const greens = ["#1f6a32", "#2a7a3c", "#185828"];
    const lights = ["#3d9a52", "#4eae64", "#2f8644"];
    const w = half * 2 + 6;
    const h = height + 4;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const cx = Math.floor(w / 2);
    const top = 2;
    const foot = h - 2;
    g.fillStyle = "#5c4030";
    g.fillRect(cx - 1, top + Math.floor(height * 0.45), 3, foot - top - Math.floor(height * 0.45));
    for (let row = 0; row < height - 6; row++) {
      const band = row / (height - 6);
      const wide = Math.max(1, Math.round(half * (0.15 + band * 0.85)));
      const notch = Math.floor(row / 7) % 2 === 1 ? 2 : 0;
      g.fillStyle = row % 3 === 0 ? lights[variant] : greens[variant];
      g.fillRect(cx - wide + notch, top + row, (wide - notch) * 2, 1);
    }
    const sprite = metrics(c, cx);
    sprite.r = 3.3;
    sprite.shadowRX = Math.round(half * 0.55);
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

  function paintField(ctx, px, py, tx, ty) {
    const tone = hash(tx >> 3, ty >> 3);
    ctx.fillStyle = tone > 0.6 ? "#e6c44e" : tone > 0.3 ? "#d4ae3a" : "#c99a32";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#b88928";
    const vertical = hash(tx >> 4, ty >> 4) > 0.5;
    if (vertical) {
      for (let x = 2; x < TILE; x += 4) ctx.fillRect(px + x, py, 1, TILE);
    } else {
      for (let y = 2; y < TILE; y += 4) ctx.fillRect(px, py + y, TILE, 1);
    }
    if (hash(tx + 1, ty + 4) > 0.7) {
      const bx = px + 3 + Math.floor(hash(tx + 2, ty) * 8);
      const by = py + 2 + Math.floor(hash(tx, ty + 3) * 8);
      ctx.fillStyle = "#f4e7a4";
      ctx.fillRect(bx, by, 1, 3);
      ctx.fillRect(bx - 1, by, 1, 1);
      ctx.fillRect(bx + 1, by, 1, 1);
    }
  }

  function drawMapLabel(ctx, label) {
    ctx.save();
    ctx.translate(label.x * TILE, label.y * TILE);
    ctx.rotate(label.a || 0);
    ctx.font = label.water ? "bold 11px Segoe UI, sans-serif" : "bold 10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.ceil(ctx.measureText(label.t).width) + 8;
    ctx.fillStyle = label.water ? "rgba(12, 36, 58, 0.82)" : "rgba(18, 16, 14, 0.78)";
    ctx.fillRect(-width / 2, -7, width, 14);
    ctx.fillStyle = label.water ? "#e7f4ff" : "#fff6d8";
    ctx.fillText(label.t, 0, 1);
    ctx.restore();
  }

  function drawSmoothWater(ctx) {
    const map = osmMap();
    const lakes = (map && map.lakes) || [];
    const rivers = (map && map.rivers) || [];
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const ring of lakes) {
      if (!ring || ring.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0] * TILE, ring[0][1] * TILE);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0] * TILE, ring[i][1] * TILE);
      ctx.closePath();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#e6d3a4";
      ctx.stroke();
      ctx.fillStyle = "#3e97c8";
      ctx.fill();
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#3e97c8";
    for (const line of rivers) {
      if (!line || line.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(line[0][0] * TILE, line[0][1] * TILE);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i][0] * TILE, line[i][1] * TILE);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSmoothRoads(ctx) {
    const roads = (osmMap() && osmMap().roads) || [];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    roads.sort((a, b) => (a.k === "a") - (b.k === "a"));
    for (const road of roads) {
      const pts = road.p;
      if (!pts || pts.length < 2) continue;
      ctx.beginPath();
      ctx.lineWidth = road.w;
      ctx.strokeStyle = road.k === "a" ? "#3a4046" : "#c4a36e";
      ctx.moveTo(pts[0][0] * TILE, pts[0][1] * TILE);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * TILE, pts[i][1] * TILE);
      ctx.stroke();
      if (road.k === "a" && road.w > 24) {
        ctx.strokeStyle = "#6a7278";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function paintAsphalt(ctx, px, py, tx, ty) {
    ctx.fillStyle = hash(tx, ty) > 0.5 ? "#3a3e42" : "#4a5056";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = "#2a2e32";
    ctx.fillRect(px, py + 7, TILE, 1);
    ctx.fillStyle = "#6a7076";
    ctx.fillRect(px + Math.floor(hash(tx + 1, ty) * 10), py + Math.floor(hash(tx, ty + 3) * 6), 2, 1);
    ctx.fillStyle = "#63b44a";
    if (groundAt(tx, ty - 1) === T.GRASS) {
      for (let i = 0; i < 3; i++) ctx.fillRect(px + Math.floor(hash(tx + i, ty) * 15), py, 1, 2);
    }
    if (groundAt(tx, ty + 1) === T.GRASS) {
      for (let i = 0; i < 3; i++) ctx.fillRect(px + Math.floor(hash(tx + i, ty + 3) * 15), py + 14, 1, 2);
    }
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

  function osmMap() {
    if (mapId === "tuczno") return window.TUCZNO_MAP || null;
    if (mapId === "plewiska") return window.PLEWISKA_MAP || null;
    if (mapId === "sehnde") return window.SEHNDE_MAP || null;
    if (mapId === "poznan") return window.POZNAN_MAP || null;
    return null;
  }

  function forestAt(tx, ty) {
    if (!forestMask || tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    return forestMask[ty * COLS + tx] === 1;
  }

  function decodeTiles(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function clearOfRoad(x, y) {
    const reach = 18;
    for (let oy = -reach; oy <= reach; oy += 8) {
      for (let ox = -reach; ox <= reach; ox += 8) {
        if (ox * ox + oy * oy > reach * reach) continue;
        const g = groundAt(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE));
        if (g === T.ASPHALT || g === T.DIRT || g === T.WATER || g === T.SAND) return false;
      }
    }
    return true;
  }

  function addProp(kind, tx, ty, minSpawnTiles, sprites, rng, gapTiles, jitter) {
    if (groundAt(tx, ty) !== T.GRASS) return false;
    const x = tx * TILE + TILE / 2 + (jitter ? (hash(tx * 5, ty) - 0.5) * 10 : 0);
    const y = ty * TILE + Math.floor(TILE * 0.8) + (jitter ? (hash(tx, ty * 5) - 0.5) * 8 : 0);
    if ((kind === "tree" || kind === "bush") && !clearOfRoad(x, y)) return false;
    if (Math.hypot(x - player.x, y - player.y) < TILE * minSpawnTiles) return false;
    const minDist = TILE * (gapTiles || (kind === "tree" ? 4.6 : 2.8));
    for (const prop of props) {
      if (!prop.sprite) continue;
      if (Math.hypot(prop.x - x, prop.y - y) < minDist) return false;
    }
    const sprite = sprites[(Math.abs(tx * 3 + ty) + Math.floor(rng() * 2)) % sprites.length];
    props.push({
      kind,
      x,
      y,
      sprite,
      r: sprite.r,
      shadowRX: sprite.shadowRX,
      shadowRY: sprite.shadowRY,
    });
    return true;
  }

  function makeGear(kind, x, y) {
    const item = { kind, x, y, held: false, anim: 0, fromX: 0, fromY: 0, holder: null };
    gear.push(item);
    return item;
  }

  function separateGear() {
    for (const item of gear) {
      for (const prop of props) {
        if (!prop.r) continue;
        if (Math.hypot(prop.x - item.x, prop.y - item.y) < 22) item.x += 24;
      }
    }
    for (let i = 0; i < gear.length; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.hypot(gear[i].x - gear[j].x, gear[i].y - gear[j].y) < 40) gear[i].x += 36;
      }
    }
  }

  function showLoad(pct) {
    const box = document.getElementById("loading");
    const bar = document.getElementById("load-bar");
    const label = document.getElementById("load-label");
    const n = Math.max(0, Math.min(100, Math.round(pct)));
    if (box) box.hidden = false;
    if (bar) bar.style.width = n + "%";
    if (label) label.textContent = n + "%";
  }

  function hideLoad() {
    const box = document.getElementById("loading");
    if (box) box.hidden = true;
  }

  function waitFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function createWorld(trees, bushes, report) {
    const beat = async (pct) => {
      if (!report) return;
      report(pct);
      await waitFrame();
    };
    await beat(2);
    indoors = false;
    doorLock = 0;
    for (const who of actors) who.carry = null;
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
    woods = [];
    woodGrid = null;
    forestMask = null;
    player.x = spawnTx * TILE + TILE / 2;
    player.y = spawnTy * TILE + TILE / 2;
    actors[0].outsideSpot = { x: player.x, y: player.y };
    const liveMap = osmMap();
    const useTuczno = !!liveMap;
    if (useTuczno) {
      ground = decodeTiles(liveMap.ground);
      forestMask = decodeTiles(liveMap.forest);
      ponds = liveMap.ponds.slice();
    } else {
    ponds = [{ x: spawnTx + slot.dx, y: spawnTy + slot.dy, rx: 5.5, ry: 4.05 }];
    const far = [
      [-30, -22], [28, -20], [-26, 24], [30, 18],
      [6, -28], [-8, 26], [32, -4], [-34, 6],
      [18, 26], [-20, -24], [22, 8], [-14, 22],
      [-32, -12], [14, -26], [26, 22], [-22, 8],
      [-58, -36], [62, -30], [-54, 48], [60, 34],
      [8, -52], [-12, 50], [70, -8], [-68, 10],
      [40, 52], [-44, -48], [48, 16], [-36, 40],
    ];
    for (let i = far.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = far[i];
      far[i] = far[j];
      far[j] = swap;
    }
    const extraPonds = Math.max(0, tune.ponds - 1);
    let placed = 0;
    for (const [dx, dy] of far) {
      if (placed >= extraPonds) break;
      const rx = 4.4 + Math.random() * 2.4;
      const ry = 3.3 + Math.random() * 1.6;
      const cx = spawnTx + dx;
      const cy = spawnTy + dy;
      if (cx - rx < 3 || cy - ry < 3 || cx + rx > COLS - 4 || cy + ry > ROWS - 4) continue;
      if (Math.hypot(cx - spawnTx, cy - spawnTy) < 16) continue;
      let blocked = false;
      for (const other of ponds) {
        if (Math.hypot(cx - other.x, cy - other.y) < 22) blocked = true;
      }
      if (blocked) continue;
      ponds.push({ x: cx, y: cy, rx, ry });
      placed += 1;
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
    }
    if (useTuczno) pond = ponds[0] || { x: spawnTx, y: spawnTy, rx: 2, ry: 2 };
    await beat(18);

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
        if (useTuczno) {
          if (!forestAt(tx, ty) && hash(tx + 4, ty + 8) < 0.04) setDecor(tx, ty, 1 + Math.floor(hash(tx, ty) * 4));
          else if (hash(tx + 12, ty + 2) > 0.97) setDecor(tx, ty, DECOR.TUFT);
          continue;
        }
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
      if (ty % 20 === 19) await beat(18 + 12 * (ty / ROWS));
    }

    let mushrooms = 0;
    if (!useTuczno) for (let n = 0; n < 700 && mushrooms < 18; n++) {
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
    const forestStamp = [];
    if (useTuczno) {
      const near = 16 * TILE;
      const taken = new Uint8Array(COLS * ROWS);
      const gapFree = (tx, ty, gap) => {
        const r = Math.max(1, Math.round(gap));
        for (let y = ty - r; y <= ty + r; y++) {
          for (let x = tx - r; x <= tx + r; x++) {
            if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
            if (taken[y * COLS + x]) return false;
          }
        }
        return true;
      };
      const plant = (kind, tx, ty, sprites, gap) => {
        if (groundAt(tx, ty) !== T.GRASS || !gapFree(tx, ty, gap)) return;
        const x = tx * TILE + TILE / 2 + (hash(tx * 5, ty) - 0.5) * 10;
        const y = ty * TILE + Math.floor(TILE * 0.8) + (hash(tx, ty * 5) - 0.5) * 8;
        if (!clearOfRoad(x, y)) return;
        if (Math.hypot(x - player.x, y - player.y) < TILE * 1.2) return;
        taken[ty * COLS + tx] = 1;
        const sprite = sprites[(Math.abs(tx * 3 + ty) + Math.floor(rng() * 2)) % sprites.length];
        if (Math.hypot(x - player.x, y - player.y) < near) {
          props.push({
            kind, x, y, sprite, r: sprite.r,
            shadowRX: sprite.shadowRX, shadowRY: sprite.shadowRY,
          });
          return;
        }
        woods.push({ kind, x, y, r: sprite.r, sprite });
        forestStamp.push({ sprite, x, y });
      };
      for (let ty = 1; ty < ROWS - 1; ty++) {
        for (let tx = 1; tx < COLS - 1; tx++) {
          if (groundAt(tx, ty) !== T.GRASS) continue;
          if (forestAt(tx, ty)) {
            const spruces = hash(tx + 11, ty + 2) > 0.62;
            plant("tree", tx, ty, spruces ? pineSprites : trees, 1.2);
            if (hash(tx + 3, ty) > 0.62) plant("bush", tx, ty, bushes, 0.45);
          } else if (hash(tx + 9, ty + 4) > 0.994) plant("tree", tx, ty, trees, 6);
          else if (hash(tx + 2, ty + 7) > 0.988) plant("bush", tx, ty, bushes, 4);
        }
        if (ty % 8 === 7) await beat(32 + 28 * (ty / ROWS));
      }
    } else {
    for (const [dx, dy] of treeNear) addProp("tree", spawnTx + dx, spawnTy + dy, 4.2, trees, rng);
    for (const [dx, dy] of bushNear) addProp("bush", spawnTx + dx, spawnTy + dy, 3.4, bushes, rng);

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const edge = tx <= 1 || ty <= 1 || tx >= COLS - 2 || ty >= ROWS - 2;
        if (!edge || rng() > 0.7) continue;
        addProp("tree", tx, ty, 12, trees, rng);
      }
    }
    for (let i = 0; i < 208; i++) {
      addProp("tree", 3 + Math.floor(rng() * (COLS - 6)), 3 + Math.floor(rng() * (ROWS - 6)), 10, trees, rng);
    }
    for (let i = 0; i < 368; i++) {
      addProp("bush", 2 + Math.floor(rng() * (COLS - 4)), 2 + Math.floor(rng() * (ROWS - 4)), 7, bushes, rng);
    }
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
        if (kind === T.FIELD) paintField(g, px, py, tx, ty);
        else if (useTuczno && (kind === T.WATER || kind === T.SAND || kind === T.DIRT || kind === T.ASPHALT)) paintGrass(g, px, py, tx, ty);
        else if (kind === T.WATER) paintWater(g, px, py, tx, ty, 0);
        else if (kind === T.DIRT) paintDirt(g, px, py, tx, ty);
        else if (kind === T.ASPHALT) paintAsphalt(g, px, py, tx, ty);
        else if (kind === T.SAND) paintSand(g, px, py, tx, ty);
        else paintGrass(g, px, py, tx, ty);
        const d = decorAt(tx, ty);
        if (d >= DECOR.DAISY && d <= DECOR.BELL) drawFlower(g, px, py, d);
        else if (d === DECOR.MUSH) drawMushroom(g, px, py);
        else if (d === DECOR.PEBBLE) drawPebble(g, px, py);
        else if (d === DECOR.TUFT) drawTuft(g, px, py);
      }
      if (ty % 4 === 3) await beat(62 + 30 * (ty / ROWS));
    }
    if (useTuczno) {
      drawSmoothRoads(g);
      drawSmoothWater(g);
      for (const label of (osmMap() && osmMap().labels) || []) {
        if (!label.water || useTuczno) drawMapLabel(g, label);
      }
    }

    const logs = useTuczno ? [] : [
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

    ducks = [];
    for (const spot of ponds) {
      const count = tune.ducks;
      for (let i = 0; i < count; i++) {
        const bird = {
          duck: true,
          pond: spot,
          x: spot.x * TILE,
          y: spot.y * TILE,
          ang: Math.random() * Math.PI * 2,
          orbit: 0.28 + Math.random() * 0.28,
          face: true,
          state: "swim",
          sink: 0,
          r: 0,
          shadowRX: 0,
          shadowRY: 0,
        };
        ducks.push(bird);
        props.push(bird);
      }
    }
    duck = ducks[0];

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
    gear = [];
    gun = makeGear("gun", gunTx * TILE + 6, gunTy * TILE + 4);
    makeGear("gun", (spawnTx - 6) * TILE + 8, (spawnTy + 2) * TILE + 6);

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
    net = makeGear("net", netTx * TILE + 6, netTy * TILE + 10);
    makeGear("net", (spawnTx + 8) * TILE + 4, (spawnTy - 3) * TILE + 8);
    makeGear("sword", (spawnTx + 1) * TILE + 8, (spawnTy + 6) * TILE + 6);
    makeGear("sword", (spawnTx - 5) * TILE + 4, (spawnTy - 4) * TILE + 10);
    if (netRole === "host") {
      makeGear("gun", (spawnTx + 6) * TILE + 8, (spawnTy + 4) * TILE + 6);
      makeGear("net", (spawnTx - 8) * TILE + 6, (spawnTy + 5) * TILE + 8);
      makeGear("sword", (spawnTx + 4) * TILE + 4, (spawnTy - 5) * TILE + 10);
    }
    separateGear();

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
    const uniBTx = spawnTx + 8;
    const uniBTy = spawnTy - 1;
    unicorns = [
      {
        x: uniTx * TILE + TILE / 2,
        y: uniTy * TILE + 12,
        state: "free",
        inside: false,
        mane: "#f4b6d8",
        rider: null,
        dir: "down",
        homeX: 0,
        homeY: 0,
        tx: 0,
        ty: 0,
        wander: 0,
      },
      {
        x: (groundAt(uniBTx, uniBTy) === T.GRASS ? uniBTx : spawnTx + 9) * TILE + TILE / 2,
        y: (groundAt(uniBTx, uniBTy) === T.GRASS ? uniBTy : spawnTy + 3) * TILE + 12,
        state: "free",
        inside: false,
        mane: "#f7d36a",
        rider: null,
        dir: "down",
        homeX: 0,
        homeY: 0,
        tx: 0,
        ty: 0,
        wander: 0,
      },
    ];
    if (netRole === "host") {
      const uniCTx = spawnTx - 3;
      const uniCTy = spawnTy - 6;
      unicorns.push({
        x: (groundAt(uniCTx, uniCTy) === T.GRASS ? uniCTx : spawnTx - 2) * TILE + TILE / 2,
        y: (groundAt(uniCTx, uniCTy) === T.GRASS ? uniCTy : spawnTy - 5) * TILE + 12,
        state: "free",
        inside: false,
        mane: "#b7e7f8",
        rider: null,
        dir: "down",
        homeX: 0,
        homeY: 0,
        tx: 0,
        ty: 0,
        wander: 0,
      });
    }
    unicorn = unicorns[0];
    for (const uni of unicorns) {
      for (const item of gear) {
        if (Math.hypot(uni.x - item.x, uni.y - item.y) < 48) uni.x += 28;
      }
      uni.homeX = uni.x;
      uni.homeY = uni.y;
      uni.tx = uni.x;
      uni.ty = uni.y;
    }
    actors[1].x = player.x + 42;
    actors[1].y = player.y + 6;
    actors[1].outsideSpot = { x: actors[1].x, y: actors[1].y };
    actors[2].x = player.x - 36;
    actors[2].y = player.y + 6;
    actors[2].outsideSpot = { x: actors[2].x, y: actors[2].y };

    placeHouse();
    placeSpots();
    if (useTuczno) {
      player.x = house.x;
      player.y = house.y + 22;
      actors[0].outsideSpot = { x: player.x, y: player.y };
      actors[1].x = player.x + 28;
      actors[1].y = player.y + 4;
      actors[1].outsideSpot = { x: actors[1].x, y: actors[1].y };
      actors[2].x = player.x - 28;
      actors[2].y = player.y + 6;
      actors[2].outsideSpot = { x: actors[2].x, y: actors[2].y };
    }
    spawnBoars();
    spawnFauna();
    scatterButterflies(rng);
    butterflyCap = butterflies.length;
    butterflyTimer = 0;
    bakeRadar();
    buildWoodGrid();
    await beat(100);
  }

  function buildWoodGrid() {
    woodGrid = null;
    if (!woods.length) return;
    const cell = 48;
    const buckets = new Map();
    for (const tree of woods) {
      const key = (Math.floor(tree.x / cell) + 4096) + (Math.floor(tree.y / cell) + 4096) * 8192;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }
      bucket.push(tree);
    }
    woodGrid = { cell, buckets };
  }

  function blockedByWoods(px, py) {
    if (!woodGrid) return false;
    const cell = woodGrid.cell;
    const cx = Math.floor(px / cell);
    const cy = Math.floor(py / cell);
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const bucket = woodGrid.buckets.get((x + 4096) + (y + 4096) * 8192);
        if (!bucket) continue;
        for (const tree of bucket) {
          const dx = px - tree.x;
          const dy = py - tree.y;
          const reach = tree.r + 2.2;
          if (dx * dx + dy * dy < reach * reach) return true;
        }
      }
    }
    return false;
  }

  function woodsInView() {
    if (!woodGrid) return [];
    const cell = woodGrid.cell;
    const x0 = Math.floor((view.camX - 64) / cell);
    const y0 = Math.floor((view.camY - 96) / cell);
    const x1 = Math.floor((view.camX + view.w + 64) / cell);
    const y1 = Math.floor((view.camY + view.h + 48) / cell);
    const out = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const bucket = woodGrid.buckets.get((x + 4096) + (y + 4096) * 8192);
        if (!bucket) continue;
        for (const tree of bucket) out.push(tree);
      }
    }
    return out;
  }

  function dropWood(x, y) {
    let gone = false;
    for (let i = props.length - 1; i >= 0; i--) {
      const prop = props[i];
      if (prop.kind !== "tree" && prop.kind !== "bush") continue;
      if (Math.abs(prop.x - x) < 3 && Math.abs(prop.y - y) < 3) {
        props.splice(i, 1);
        gone = true;
      }
    }
    for (let i = woods.length - 1; i >= 0; i--) {
      const tree = woods[i];
      if (Math.abs(tree.x - x) < 3 && Math.abs(tree.y - y) < 3) {
        woods.splice(i, 1);
        gone = true;
      }
    }
    if (gone) buildWoodGrid();
  }

  function eraseWood(tree) {
    if (!field || !tree.sprite) return;
    const g = field.getContext("2d");
    g.imageSmoothingEnabled = false;
    const left = Math.max(0, Math.round(tree.x) - tree.sprite.ax);
    const top = Math.max(0, Math.round(tree.y) - tree.sprite.ay);
    const right = Math.min(field.width, left + tree.sprite.c.width);
    const bottom = Math.min(field.height, top + tree.sprite.c.height);
    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0) return;
    if (fieldBase) g.drawImage(fieldBase, left, top, w, h, left, top, w, h);
    for (const other of woods) {
      if (!other.sprite || other === tree) continue;
      const ox = Math.round(other.x) - other.sprite.ax;
      const oy = Math.round(other.y) - other.sprite.ay;
      if (ox + other.sprite.c.width < left || ox > right || oy + other.sprite.c.height < top || oy > bottom) continue;
      g.drawImage(other.sprite.c, ox, oy);
    }
    if (radarMap) {
      const rg = radarMap.getContext("2d");
      const sx = radarMap.width / field.width;
      const sy = radarMap.height / field.height;
      rg.drawImage(field, left, top, right - left, bottom - top, left * sx, top * sy, (right - left) * sx, (bottom - top) * sy);
    }
  }

  function bakeRadar() {
    radarMap = document.createElement("canvas");
    radarMap.width = 192;
    radarMap.height = 160;
    const g = radarMap.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(field, 0, 0, radarMap.width, radarMap.height);
    const rx = radarMap.width / WORLD_W;
    const ry = radarMap.height / WORLD_H;
    g.imageSmoothingEnabled = false;
    for (const tree of woods) {
      if (!tree.sprite) continue;
      const dx = Math.round(tree.x) - tree.sprite.ax;
      const dy = Math.round(tree.y) - tree.sprite.ay;
      g.drawImage(tree.sprite.c, dx * rx, dy * ry, tree.sprite.c.width * rx, tree.sprite.c.height * ry);
    }
    seen = new Uint8Array(COLS * ROWS);
    fogMap = document.createElement("canvas");
    fogMap.width = radarMap.width;
    fogMap.height = radarMap.height;
    const fog = fogMap.getContext("2d");
    fog.fillStyle = "#000";
    fog.fillRect(0, 0, fogMap.width, fogMap.height);
  }

  function revealAround(x, y) {
    if (!seen || !fogMap) return;
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    const reach = 20;
    const fog = fogMap.getContext("2d");
    const pw = fogMap.width / COLS;
    const ph = fogMap.height / ROWS;
    const reach2 = reach * reach;
    for (let ty = cy - reach; ty <= cy + reach; ty++) {
      for (let tx = cx - reach; tx <= cx + reach; tx++) {
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
        const dx = tx - cx;
        const dy = ty - cy;
        if (dx * dx + dy * dy > reach2) continue;
        const i = ty * COLS + tx;
        if (seen[i]) continue;
        seen[i] = 1;
        fog.clearRect(tx * pw, ty * ph, pw + 0.5, ph + 0.5);
      }
    }
  }

  function spawnBoars() {
    boars = [];
    if (!boarsOn) return;
    const count = tune.boars;
    let guard = 0;
    while (boars.length < count && guard < 4000) {
      guard += 1;
      const tx = 4 + Math.floor(Math.random() * (COLS - 8));
      const ty = 4 + Math.floor(Math.random() * (ROWS - 8));
      if (groundAt(tx, ty) !== T.GRASS) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (Math.hypot(x - player.x, y - player.y) < 200) continue;
      if (Math.hypot(x - house.x, y - house.y) < 100) continue;
      let crowded = false;
      for (const other of boars) {
        if (Math.hypot(other.x - x, other.y - y) < 140) crowded = true;
      }
      if (crowded) continue;
      boars.push({
        x, y, homeX: x, homeY: y, tx: x, ty: y,
        dir: "right", state: "roam", wander: 0, bite: 0, rider: null,
        vanish: 0, respawn: 0, energy: tune.boarEnergy, voice: 0,
      });
    }
  }

  function spawnFauna() {
    fauna = [];
    const plan = [
      ["fox", tune.foxes],
      ["squirrel", tune.squirrels],
      ["deer", tune.deer],
      ["bird", tune.birds],
    ];
    for (const [kind, count] of plan) {
      let made = 0;
      let guard = 0;
      while (made < count && guard < 2400) {
        guard += 1;
        const tx = 4 + Math.floor(Math.random() * (COLS - 8));
        const ty = 4 + Math.floor(Math.random() * (ROWS - 8));
        if (groundAt(tx, ty) !== T.GRASS) continue;
        const x = tx * TILE + TILE / 2;
        const y = ty * TILE + TILE / 2;
        if (Math.hypot(x - player.x, y - player.y) < 140) continue;
        if (house && Math.hypot(x - house.x, y - house.y) < 90) continue;
        let crowded = false;
        for (const other of fauna) {
          if (Math.hypot(other.x - x, other.y - y) < 70) crowded = true;
        }
        if (crowded) continue;
        fauna.push({
          kind, x, y, homeX: x, homeY: y,
          heading: Math.random() * Math.PI * 2,
          curve: (Math.random() - 0.5) * 0.55,
          phase: Math.random() * 6,
          dir: "down", state: "roam",
          vanish: 0, respawn: 0, z: kind === "bird" ? 16 : 0,
          carrier: null,
        });
        made += 1;
      }
    }
  }

  function faunaBlocked(animal, x, y) {
    if (x < 16 || y < 16 || x > WORLD_W - 16 || y > WORLD_H - 16) return true;
    if (animal.kind === "bird") return false;
    if (blockedByHouse(x, y)) return true;
    const next = groundAt(Math.floor(x / TILE), Math.floor(y / TILE));
    return next === T.WATER;
  }

  function updateFauna(dt) {
    for (const animal of fauna) {
      if (animal.state === "down") {
        animal.vanish -= dt;
        animal.respawn -= dt;
        if (animal.vanish <= 0) animal.state = "gone";
        continue;
      }
      if (animal.state === "gone") {
        animal.respawn -= dt;
        if (animal.respawn <= 0) {
          animal.state = "roam";
          animal.x = animal.homeX;
          animal.y = animal.homeY;
          animal.heading = Math.random() * Math.PI * 2;
          animal.curve = (Math.random() - 0.5) * 0.55;
          animal.z = animal.kind === "bird" ? 16 : 0;
        }
        continue;
      }
      let pace = animal.kind === "squirrel" ? 28 : animal.kind === "bird" ? 46 : animal.kind === "fox" ? 42 : 36;
      if (animal.kind !== "bird") {
        let threat = null;
        let best = 140;
        const people = livePeople();
        for (const who of people) {
          if (who.indoors) continue;
          const dist = Math.hypot(who.x - animal.x, who.y - animal.y);
          if (dist < best) {
            best = dist;
            threat = who;
          }
        }
        if (threat) {
          animal.heading = Math.atan2(animal.y - threat.y, animal.x - threat.x);
          animal.curve = 0;
        }
        else {
          if (animal.fleeing) animal.curve = (Math.random() - 0.5) * 0.55;
          pace *= 0.5;
        }
        animal.fleeing = !!threat;
      }
      animal.heading += (animal.curve || 0) * dt;
      const sway = Math.sin(animal.phase || 0) * 0.45;
      let ang = animal.heading + sway;
      let vx = 0;
      let vy = 0;
      let nx = animal.x;
      let ny = animal.y;
      let open = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        vx = Math.cos(ang) * pace;
        vy = Math.sin(ang) * pace;
        nx = animal.x + vx * dt;
        ny = animal.y + vy * dt;
        if (!faunaBlocked(animal, nx, ny)) {
          open = true;
          break;
        }
        ang += 0.75;
      }
      if (!open) {
        animal.heading += Math.PI * 0.5;
        animal.curve = (Math.random() - 0.5) * 0.55;
        continue;
      }
      animal.heading = ang - sway;
      animal.phase = (animal.phase || 0) + dt * 1.7;
      animal.x = nx;
      animal.y = ny;
      if (Math.abs(vx) > Math.abs(vy)) animal.dir = vx > 0 ? "right" : "left";
      else animal.dir = vy > 0 ? "down" : "up";
      if (animal.kind === "bird") animal.z = 14 + Math.sin((animal.phase || 0) * 2) * 6;
    }
  }

  function hitFauna(bullet, radius) {
    for (const animal of fauna) {
      if (animal.state !== "roam") continue;
      if (animal.kind === "bird" && bullet.kind !== "gun") continue;
      const reach = (radius || 14) * (animal.kind === "deer" ? 1.6 : 1);
      const dx = bullet.x - animal.x;
      const dy = bullet.y - (animal.y - (animal.z || 0));
      if (dx * dx + dy * dy > reach * reach) continue;
      animal.state = "down";
      animal.z = 0;
      animal.vanish = tune.returnTime / 2;
      animal.respawn = tune.returnTime;
      animal.homeX = animal.x;
      animal.homeY = animal.y;
      playHit();
      addScore(3);
      return true;
    }
    return false;
  }

  function scatterButterflies(rng) {
    const colors = ["#fff8ee", "#f6d34e", "#f4a0c4", "#8ec8ff", "#ffe08a", "#fffaf0", "#f7b0d4", "#fff4c2", "#d7f7a2", "#f7c39a", "#c9b6ff", "#fff1d0"];
    butterflies = [];
    let guard = 0;
    while (butterflies.length < tune.butterflies && guard < 1800) {
      guard += 1;
      const tx = 2 + Math.floor(rng() * (COLS - 4));
      const ty = 2 + Math.floor(rng() * (ROWS - 4));
      if (groundAt(tx, ty) !== T.GRASS) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (Math.hypot(x - house.x, y - house.y) < 80) continue;
      let crowded = false;
      for (const other of butterflies) {
        if (Math.hypot(other.hx - x, other.hy - y) < 56) crowded = true;
      }
      if (crowded) continue;
      butterflies.push({
        hx: x,
        hy: y,
        rad: 14 + rng() * 22,
        t: rng() * Math.PI * 2,
        color: colors[butterflies.length % colors.length],
        state: "fly",
        inside: false,
        x,
        y,
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
  }

  function placeHouse() {
    if (osmMap()) {
      house = { x: spawnTx * TILE + TILE / 2, y: spawnTy * TILE + 10 };
      props = props.filter((prop) => {
        if (prop.duck) return true;
        const dx = Math.abs(prop.x - house.x);
        const dy = prop.y - house.y;
        return dx > 58 || dy < -80 || dy > 18;
      });
      return;
    }
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
      if (gear.some((item) => Math.hypot(hx - item.x, hy - item.y) < 64)) continue;
      if (unicorns.some((uni) => Math.hypot(hx - uni.x, hy - uni.y) < 72)) continue;
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

  function syncScaleLabel() {
    const scale = document.getElementById("scale");
    const label = document.getElementById("scale-label");
    if (scale) {
      scale.min = "1";
      scale.max = "8";
      scale.step = "1";
      scale.value = String(view.pixel);
    }
    if (label) {
      label.textContent = document.body.classList.contains("phone")
        ? view.pixel + "x"
        : "Skala obrazu: " + view.pixel + "×";
    }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    view.pixel = scalePixel;
    syncScaleLabel();
    const panes = playerCount === 2 && !joined ? 2 : 1;
    view.w = Math.max(1, Math.floor(canvas.width / panes / view.pixel));
    view.h = Math.max(1, Math.floor(canvas.height / view.pixel));
    view.ox = 0;
    view.oy = Math.floor((canvas.height - view.h * view.pixel) / 2);
    low = document.createElement("canvas");
    low2 = document.createElement("canvas");
    low.width = low2.width = view.w;
    low.height = low2.height = view.h;
  }

  function playersJoined() {
    if (playerCount !== 2) return true;
    const a = actors[0];
    const b = actors[1];
    if (a.indoors !== b.indoors) return false;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    return joined ? dist < 230 : dist < 160;
  }

  function shareCamera() {
    const px = Math.round((actors[0].x + actors[1].x) / 2);
    const py = Math.round((actors[0].y + actors[1].y) / 2);
    let x = px - (view.w >> 1);
    let y = py - (view.h >> 1);
    const maxX = WORLD_W - view.w;
    const maxY = WORLD_H - view.h;
    if (maxX < 0) x = maxX >> 1;
    else x = clamp(x, 0, maxX);
    if (maxY < 0) y = maxY >> 1;
    else y = clamp(y, 0, maxY);
    actors[0].camX = actors[1].camX = x;
    actors[0].camY = actors[1].camY = y;
    view.camX = x;
    view.camY = y;
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
    player.camX = x;
    player.camY = y;
    view.camX = x;
    view.camY = y;
  }

  function placeSpots() {
    places = [];
    if (!osmMap()) return;
    const at = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + 10 });
    const eden = at(161.5, 106.7);
    const zabka = at(170.7, 98.3);
    const stop = at(165.5, 110.3);
    places = [];
    if (mapId === "tuczno") {
      places.push(
        { kind: "eden", ...eden, hw: 40, top: 48 },
        { kind: "zabka", ...zabka, hw: 34, top: 46 },
        { kind: "inpost", x: zabka.x + 62, y: zabka.y + 4, hw: 18, top: 40 },
        { kind: "stop", ...stop, hw: 20, top: 36 },
      );
    }
    for (const cottage of osmMap().cottages || []) {
      const spot = at(cottage.x, cottage.y);
      if (!cottage.kind) {
        places.push({ kind: "cottage", ...spot, hw: 26, top: 35 });
        continue;
      }
      if (cottage.poly) {
        let sx = 0;
        let sy = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of cottage.poly) {
          sx += p[0];
          sy += p[1];
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        }
        const tx = sx / cottage.poly.length;
        const ty = sy / cottage.poly.length;
        if (mapId === "tuczno") {
          const left = minX * TILE;
          const right = maxX * TILE;
          const top = minY * TILE;
          const bottom = maxY * TILE;
          const shops = [
            { x: eden.x, y: eden.y, hw: 48, top: 64 },
            { x: zabka.x, y: zabka.y, hw: 42, top: 60 },
            { x: zabka.x + 62, y: zabka.y + 4, hw: 24, top: 48 },
            { x: stop.x, y: stop.y, hw: 28, top: 48 },
          ];
          if (shops.some((shop) => right > shop.x - shop.hw && left < shop.x + shop.hw && bottom > shop.y - shop.top && top < shop.y + 12)) continue;
        }
        const face = facadeBox(cottage.poly, cottage.kind);
        places.push({
          kind: cottage.kind,
          x: tx * TILE,
          y: ty * TILE,
          poly: cottage.poly,
          face,
          foot: (face ? face.bottom : maxY * TILE) - ty * TILE,
          hw: ((maxX - minX) * TILE) / 2 + 4,
          top: ((maxY - minY) * TILE) / 2 + 4,
        });
        continue;
      }
      const len = cottage.len;
      const wid = cottage.wid;
      const c = Math.cos(cottage.a);
      const s = Math.sin(cottage.a);
      let foot = 0;
      for (const lx of [-len / 2, len / 2]) {
        for (const ly of [-wid / 2, wid / 2]) foot = Math.max(foot, lx * s + ly * c);
      }
      places.push({
        kind: cottage.kind,
        ...spot,
        a: cottage.a,
        len,
        wid,
        foot,
        hw: len / 2 + 6,
        top: wid / 2 + 6,
      });
    }
    props = props.filter((prop) => {
      if (prop.duck) return true;
      return !places.some((spot) => Math.abs(prop.x - spot.x) < spot.hw + 8 && prop.y > spot.y - spot.top - 8 && prop.y < spot.y + 16);
    });
  }

  function onRoad(px, py) {
    const kind = groundAt(Math.floor(px / TILE), Math.floor(py / TILE));
    return kind === T.ASPHALT || kind === T.DIRT;
  }

  function blockedByHouse(px, py) {
    if (onRoad(px, py)) return false;
    const left = house.x - 34;
    const right = house.x + 34;
    const top = house.y - 46;
    const bottom = house.y - 2;
    if (px < left || px > right || py < top || py > bottom) return false;
    if (py > house.y - 16 && Math.abs(px - house.x) < 9) return false;
    return true;
  }

  function blockedBySpot(px, py) {
    if (onRoad(px, py)) return false;
    for (const spot of places) {
      if (spot.poly) {
        if (insidePoly(px / TILE, py / TILE, spot.poly)) return true;
        const face = spot.face;
        if (face && px >= face.left && px <= face.right && py >= face.top && py <= face.bottom && southOfNorthEdge(spot.poly, px, py)) return true;
        continue;
      }
      if (spot.len) {
        const dx = px - spot.x;
        const dy = py - spot.y;
        const c = Math.cos(spot.a);
        const s = Math.sin(spot.a);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) <= spot.len / 2 && Math.abs(ly) <= spot.wid / 2) return true;
        continue;
      }
      if (px < spot.x - spot.hw || px > spot.x + spot.hw) continue;
      if (py < spot.y - spot.top || py > spot.y - 2) continue;
      return true;
    }
    return false;
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
    if (blockedByHouse(px, py) || blockedBySpot(px, py)) return false;
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
    if (blockedByWoods(px, py)) return false;
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
        if (mounted) parkRide(house.x + 18, house.y + 18);
        hintMode = "";
      }
      return;
    }
    const doorX = roomX + ROOM_W / 2;
    if (my > 0 && Math.abs(player.x - doorX) < 8 && player.y > roomY + ROOM_H - 16) {
      indoors = false;
      doorLock = 0.45;
      target = null;
      if (!outsideSpot || outsideSpot.x < 12 || outsideSpot.y < 12) {
        outsideSpot = { x: house.x, y: house.y + 14 };
      }
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
    if (x !== 0 || y !== 0) return { x, y, keyboard: true };
    if (phoneMode && (touchStick.x !== 0 || touchStick.y !== 0)) {
      return { x: touchStick.x, y: touchStick.y, keyboard: true };
    }
    return { x: 0, y: 0, keyboard: false };
  }

  const guestHeard = { step: -1, slash: 0, shots: 0, mounted: false };

  function guestEars(me) {
    if (me.moving) {
      const step = Math.floor(me.phase);
      if (step !== guestHeard.step) {
        guestHeard.step = step;
        if (step % 2 === 0) {
          if (me.mounted) playHoof();
          else playStep(false);
        }
      }
    } else guestHeard.step = Math.floor(me.phase);
    if ((me.slash || 0) > 0 && guestHeard.slash <= 0) playSwing();
    guestHeard.slash = me.slash || 0;
    let shots = 0;
    for (const bullet of bullets) if (bullet.owner === me) shots += 1;
    if (shots > guestHeard.shots) playShot();
    guestHeard.shots = shots;
    if (me.mounted && !guestHeard.mounted) playMount();
    guestHeard.mounted = !!me.mounted;
  }

  function update(dt, time) {
    if (!playerCount) return;
    if (netRole === "guest") {
      applyNetState();
      blendNet(dt);
      const me = localActor();
      useActor(me);
      updateCamera();
      keepActor();
      if (!me.indoors) revealAround(me.x, me.y);
      useActor(me);
      musicTime += dt;
      if (!sfx.armed) sfx.arm();
      if (sfx.armed) {
        musicTick();
        guestEars(me);
      }
      syncNet(dt);
      return;
    }
    musicTime += dt;
    const playing = livePeople();
    for (const who of playing) {
      useActor(who);
      const slot = actors.indexOf(who);
      if (netRole === "host" && slot > 0) {
        const input = netIns[slot];
        who.pad = true;
        player._stick = {
          x: input.x,
          y: input.y,
          keyboard: Math.hypot(input.x, input.y) > 0.08,
        };
        player._run = !!input.run;
        if (input.fire) {
          shootQueued = true;
          input.fire = false;
        }
        if (input.act) {
          pickupNearby();
          input.act = false;
        }
        if (input.weapon) {
          cycleHeld(who);
          input.weapon = false;
        }
      } else if (who.pad) applyPad();
      updateHero(dt);
      keepActor();
    }
    updateWorld(dt, time);
    if (!netRole) {
      const nextJoined = playersJoined();
      if (nextJoined !== joined) {
        joined = nextJoined;
        resize();
      }
    }
    if (!netRole && playerCount === 2 && joined) shareCamera();
    else {
      for (const who of playing) {
        useActor(who);
        updateCamera();
        keepActor();
      }
    }
    for (const who of playing) {
      if (!who.indoors) revealAround(who.x, who.y);
    }
    useActor(localActor());
    refreshHint();
    if (sfx.armed) musicTick();
    syncNet(dt);
  }

  function netLog(line) {
    const box = document.getElementById("net-log");
    if (!box) return;
    const row = document.createElement("div");
    row.textContent = line;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function takeGuestMsg(msg) {
    if (!msg) return;
    if (msg.type === "hello" && msg.id) {
      if (kickedIds.has(msg.id)) return;
      let slot = guestIds.indexOf(msg.id);
      if (slot < 0) slot = guestIds.findIndex((id) => !id);
      if (slot < 0) {
        netLog("Pokój pełny. Mogą dołączyć dwie osoby.");
        return;
      }
      if (!guestIds[slot]) netLog("Dołączył gracz " + (slot + 2));
      guestIds[slot] = msg.id;
      actors[slot + 1].asleep = false;
      return;
    }
    if (msg.type === "ping" && msg.id) {
      netEcho[msg.id] = msg.t;
      return;
    }
    if (msg.type !== "input" || !msg.id) return;
    const slot = guestIds.indexOf(msg.id);
    if (slot < 0) return;
    const input = netIns[slot + 1];
    input.x = msg.x || 0;
    input.y = msg.y || 0;
    input.run = !!msg.run;
    if (msg.fire) input.fire = true;
    if (msg.act) input.act = true;
    if (msg.weapon) input.weapon = true;
  }

  function takeHostMsg(msg) {
    if (!msg) return;
    if (msg.type === "kick" && msg.id === netSelf) {
      netKicked = true;
      netLog("Gospodarz wyrzucił cię z gry.");
      document.getElementById("net-log")?.classList.add("open");
      try { if (mqttClient) mqttClient.end(true); } catch (e) {}
      try { if (localSocket) localSocket.close(); } catch (e) {}
      try { if (netPeer) netPeer.destroy(); } catch (e) {}
      return;
    }
    if (msg.type !== "state") return;
    if (msg.echo && msg.echo[netSelf] != null) {
      netRtt = Math.max(0, Math.round(performance.now() - msg.echo[netSelf]));
    }
    if (msg.who && msg.who[netSelf]) {
      netSlot = msg.who[netSelf];
      netSeated = true;
    }
    if (msg.state && msg.state.players) netState = msg.state;
    if (!playerCount && msg.seed) {
      netRole = "guest";
      netSeed = msg.seed;
      netTune = msg.tune || null;
      if (msg.mapId) mapId = msg.mapId;
      netLog("Wchodzę jako gracz " + (netSlot + 1) + ".");
      const boarButton = document.getElementById("boars-toggle");
      if (boarButton) boarButton.hidden = true;
      const saveButton = document.getElementById("save-game");
      if (saveButton) saveButton.hidden = true;
      startGuestGame();
    }
  }

  let netStamp = "";
  const kickedIds = new Set();
  const netEcho = {};
  let netRtt = -1;
  let netPingAcc = 0;
  let netKicked = false;
  let netFireBurst = 0;

  function netUp(obj) {
    if (netBroker === "local") {
      if (localSocket && localSocket.readyState === 1) localSocket.send(JSON.stringify({ ch: "up", msg: obj }));
      return;
    }
    if (netBroker === "webrtc") {
      if (netConn && netConn.open) netConn.send(obj);
      return;
    }
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish("polowanie/" + netCode + "/up", JSON.stringify(obj));
    }
  }

  function netDown(obj) {
    if (netBroker === "local") {
      if (localSocket && localSocket.readyState === 1) localSocket.send(JSON.stringify({ ch: "down", msg: obj }));
      return;
    }
    if (netBroker === "webrtc") {
      netConns.forEach((conn) => {
        if (conn && conn.open) conn.send(obj);
      });
      return;
    }
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish("polowanie/" + netCode + "/down", JSON.stringify(obj));
    }
  }

  function syncNet(dt) {
    netAcc += dt;
    if (netRole === "host") {
      if (netAcc < 0.05) return;
      netAcc = 0;
      const who = {};
      guestIds.forEach((id, index) => {
        if (id) who[id] = index + 1;
      });
      netDown({ type: "state", who, echo: netEcho, mapId, seed: netSeed, tune, state: packNet() });
      return;
    }
    if (netRole !== "guest" || netKicked) return;
    if (!netSeated && netAcc >= 0.3) {
      netAcc = 0;
      netUp({ type: "hello", id: netSelf });
    }
    netPingAcc += dt;
    if (netPingAcc >= 0.5) {
      netPingAcc = 0;
      netUp({ type: "ping", id: netSelf, t: performance.now() });
    }
    if (netPulse.fire) netFireBurst = 4;
    const fireNow = netPulse.fire || netFireBurst > 0;
    const stick = readStick();
    const body = {
      type: "input",
      id: netSelf,
      x: Math.round(stick.x * 20) / 20,
      y: Math.round(stick.y * 20) / 20,
      run: keys.has("shift") || touchRun,
      fire: fireNow,
      act: netPulse.act,
      weapon: netPulse.weapon,
    };
    const stamp = [body.x, body.y, body.run, body.fire, body.act, body.weapon].join("|");
    if (stamp === netStamp) return;
    if (netFireBurst > 0) netFireBurst -= 1;
    netStamp = [body.x, body.y, body.run, false, false, false].join("|");
    netPulse.fire = false;
    netPulse.act = false;
    netPulse.weapon = false;
    netUp(body);
  }

  function applyPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const g of pads) {
      if (g && g.connected) {
        pad = g;
        break;
      }
    }
    const pressed = (i) => !!(pad && pad.buttons[i] && pad.buttons[i].pressed);
    let x = 0;
    let y = 0;
    if (pad) {
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.28) x = Math.sign(ax);
      if (Math.abs(ay) > 0.28) y = Math.sign(ay);
      if (pressed(14)) x = -1;
      if (pressed(15)) x = 1;
      if (pressed(12)) y = -1;
      if (pressed(13)) y = 1;
    }
    player._stick = { x, y, keyboard: x !== 0 || y !== 0 };
    player._run = pressed(4) || pressed(6);
    const shoot = pressed(2) || pressed(5) || pressed(7);
    if (pressed(0) && !player.padPrev.a) pickupNearby();
    if (shoot && !player.padPrev.shoot) shootQueued = true;
    if (pressed(3) && !player.padPrev.y) cycleHeld(player);
    if (pressed(1) && !player.padPrev.b) dropActive(player);
    if (pressed(4) && !player.padPrev.eat) eatMeat();
    player.padPrev = { a: pressed(0), shoot, y: pressed(3), b: pressed(1), eat: pressed(4) };
  }

  function updateHero(dt) {
    const stick = player.pad ? player._stick : readStick();
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
      let speed = mounted ? tune.run * 1.5 : (player.pad ? player._run : keys.has("shift") || (phoneMode && touchRun)) ? tune.run : 40;
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

    if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
    if (player.slash > 0) player.slash = Math.max(0, player.slash - dt);
    if (shootCooldown > 0) shootCooldown = Math.max(0, shootCooldown - dt);
    if (mounted && player.ride && player.ride.rider === player) {
      player.ride.x = player.x;
      player.ride.y = player.y;
      if (mountKind === "boar") {
        player.ride.dir = String(player.dir).indexOf("left") >= 0 ? "left" : "right";
      }
    }
    if (shootQueued) {
      shootQueued = false;
      tryShoot();
    }
    if (indoors && player.energy < 100) {
      const stove = stoveSpot();
      if (Math.hypot(player.x - stove.x, player.y - stove.y) < 28) {
        player.energy = Math.min(tune.energy, player.energy + tune.regen * dt);
        updateScore();
      }
    }
  }

  function stoveSpot() {
    return { x: roomX + 36, y: roomY + 42 };
  }

  function cookStove() {
    return { x: roomX + ROOM_W - 36, y: roomY + 46 };
  }

  function updateWorld(dt, time) {
    for (let i = motes.length - 1; i >= 0; i--) {
      const mote = motes[i];
      mote.life -= dt;
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      mote.vy += 18 * dt;
      if (mote.life <= 0) motes.splice(i, 1);
    }

    for (const bird of ducks) {
      const spot = bird.pond || pond;
      if (bird.state === "swim") {
        bird.ang += dt * 0.45;
        bird.face = Math.sin(bird.ang) < 0;
        bird.x = (spot.x + Math.cos(bird.ang) * spot.rx * bird.orbit) * TILE;
        bird.y = (spot.y + Math.sin(bird.ang * 0.8) * spot.ry * bird.orbit) * TILE;
      } else if (bird.state === "down") {
        bird.sink += dt;
        bird.vanish -= dt;
        bird.respawn -= dt;
        if (bird.vanish <= 0) bird.state = "gone";
      } else if (bird.state === "gone") {
        bird.respawn -= dt;
        if (bird.respawn <= 0) {
          bird.state = "swim";
          bird.sink = 0;
          bird.ang = Math.random() * Math.PI * 2;
        }
      }
    }
    updateBoars(dt);
    updateFauna(dt);
    refillButterflies(dt);

    for (const item of gear) {
      if (item.anim > 0) item.anim = Math.max(0, item.anim - dt);
    }
    updateUnicorns(dt);

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
      scoreWho = bullet.owner || actors[0];
      if (unicornHittable(bullet)) {
        bullets.splice(i, 1);
        if (bullet.kind === "net") {
          if (bullet.indoors) releaseUnicorn();
          else catchUnicorn();
        } else killUnicorn();
        continue;
      }
      if (!bullet.indoors && bullet.kind !== "net" && hitDuck(bullet)) {
        bullets.splice(i, 1);
        if (leveled) break;
        continue;
      }
      if (!bullet.indoors && bullet.kind !== "net" && hitBoar(bullet)) {
        bullets.splice(i, 1);
        continue;
      }
      if (!bullet.indoors && bullet.kind !== "net" && hitFauna(bullet)) {
        bullets.splice(i, 1);
        continue;
      }
      if (!bullet.indoors) for (const butterfly of butterflies) {
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
      if (bullet.indoors) for (const butterfly of butterflies) {
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
      if (bullets[i] === bullet && bullet.kind !== "net" && hitPlayer(bullet)) {
        bullets.splice(i, 1);
        continue;
      }
      if (leveled) break;
    }
  }

  function updateUnicorns(dt) {
    for (const uni of unicorns) {
      if (uni.state === "carried") {
        if (uni.carrier) {
          uni.x = uni.carrier.x;
          uni.y = uni.carrier.y + 8;
        }
        continue;
      }
      if (uni.state === "dead") {
        uni.vanish -= dt;
        uni.respawn -= dt;
        if (uni.vanish <= 0) {
          uni.state = "gone";
          uni.inside = false;
        }
        continue;
      }
      if (uni.state === "gone") {
        uni.respawn -= dt;
        if (uni.respawn <= 0) respawnUnicorn(uni);
        continue;
      }
      if (uni.rider || uni.inside || uni.state !== "free") continue;
      uni.wander -= dt;
      const left = Math.hypot(uni.tx - uni.x, uni.ty - uni.y);
      if (uni.wander <= 0 || left < 3) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 18 + Math.random() * 46;
        uni.tx = uni.homeX + Math.cos(ang) * rad;
        uni.ty = uni.homeY + Math.sin(ang) * rad;
        uni.wander = 1.4 + Math.random() * 2.4;
      }
      const dx = uni.tx - uni.x;
      const dy = uni.ty - uni.y;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const step = Math.min(len, 26 * dt);
      const nx = uni.x + (dx / len) * step;
      const ny = uni.y + (dy / len) * step;
      const tx = Math.floor(nx / TILE);
      const ty = Math.floor(ny / TILE);
      if (groundAt(tx, ty) === T.WATER || blockedByHouse(nx, ny)) {
        uni.wander = 0;
        continue;
      }
      uni.x = nx;
      uni.y = ny;
      if (Math.abs(dx) > Math.abs(dy)) uni.dir = dx < 0 ? "left" : "right";
      else uni.dir = dy < 0 ? "up" : "down";
    }
  }

  function hitPlayer(bullet) {
    for (const who of actors) {
      if (who.asleep) continue;
      if (playerCount < 2 && !netRole && who !== actors[0]) continue;
      if (who === bullet.owner || who.energy <= 0) continue;
      if (!!who.indoors !== !!bullet.indoors) continue;
      const dx = bullet.x - who.x;
      const dy = bullet.y - (who.y - (who.mounted ? 22 : 14));
      if (dx * dx + dy * dy > 196) continue;
      const loss = 5 + Math.floor(Math.random() * 6);
      who.energy = Math.max(0, who.energy - loss);
      who.flash = 0.16;
      playHit();
      if (who.energy <= 0) killPlayer(who);
      else updateScore();
      return true;
    }
    return false;
  }

  function itemOf(who, kind) {
    for (const item of gear) if (item.kind === kind && item.holder === who) return item;
    return null;
  }

  function nearestLoose() {
    let best = null;
    let bestD = Infinity;
    for (const item of gear) {
      if (item.holder) continue;
      const dist = Math.hypot(item.x - player.x, item.y - player.y);
      if (dist < bestD) {
        best = item;
        bestD = dist;
      }
    }
    return { item: best, dist: bestD };
  }

  function pocketOf(who) {
    if (!who.pocket) who.pocket = { raw: 0, roast: 0 };
    return who.pocket;
  }

  function hasKind(who, kind) {
    if (kind === "raw" || kind === "roast") return pocketOf(who)[kind] > 0;
    return !!itemOf(who, kind);
  }

  function activeWeapon() {
    if (netRole === "guest" && player.netHeld) {
      if (player.netHeld[weapon] > 0) return weapon;
      for (const kind of ["gun", "net", "sword", "raw", "roast"]) {
        if (player.netHeld[kind] > 0) return kind;
      }
      return "";
    }
    if (hasKind(player, weapon)) return weapon;
    if (itemOf(player, "gun")) return "gun";
    if (itemOf(player, "net")) return "net";
    if (itemOf(player, "sword")) return "sword";
    if (pocketOf(player).raw > 0) return "raw";
    if (pocketOf(player).roast > 0) return "roast";
    return "";
  }

  function cycleHeld(who) {
    const order = ["gun", "net", "sword", "raw", "roast"];
    const held = order.filter((kind) => hasKind(who, kind));
    if (held.length < 2) return;
    const at = held.indexOf(who.weapon);
    const next = held[(at + 1) % held.length];
    who.weapon = next;
    if (who === player) weapon = next;
    hintMode = "";
  }

  const GEAR_NAME = { gun: "pistolet", net: "łapacz", sword: "miecz", raw: "mięso", roast: "pieczeń" };

  function nearestCarcass() {
    let body = null;
    let kind = "";
    let bestD = Infinity;
    for (const boar of boars) {
      if (boar.state !== "down" || boar.carrier) continue;
      const dist = Math.hypot(boar.x - player.x, boar.y - player.y);
      if (dist < bestD) {
        body = boar;
        kind = "boar";
        bestD = dist;
      }
    }
    for (const animal of fauna) {
      if (animal.kind !== "deer" || animal.state !== "down" || animal.carrier) continue;
      const dist = Math.hypot(animal.x - player.x, animal.y - player.y);
      if (dist < bestD) {
        body = animal;
        kind = "deer";
        bestD = dist;
      }
    }
    for (const uni of unicorns) {
      if (uni.state !== "dead" || uni.carrier) continue;
      const dist = Math.hypot(uni.x - player.x, uni.y - player.y);
      if (dist < bestD) {
        body = uni;
        kind = "uni";
        bestD = dist;
      }
    }
    return { body, kind, dist: bestD };
  }

  function takeCarcass(body, kind) {
    if (!body) return;
    pocketOf(player).raw += 1;
    body.state = "gone";
    body.inside = false;
    body.carrier = null;
    body.respawn = Math.min(20, tune.returnTime);
    weapon = "raw";
    player.weapon = "raw";
    playPickup();
    hintMode = "";
    updateScore();
  }

  function dropCarry(who) {
    const carry = who.carry;
    if (!carry) return;
    const body = carry.body;
    body.carrier = null;
    body.x = who.x + 16;
    body.y = who.y + 12;
    if (carry.kind === "boar" || carry.kind === "deer") {
      body.state = "down";
      body.sink = 0;
      body.vanish = Math.max(body.vanish || 0, 20);
    } else {
      body.state = "dead";
      body.vanish = Math.max(body.vanish || 0, 20);
    }
    who.carry = null;
    hintMode = "";
    playPickup();
  }

  function cookCarry() {
    const pocket = pocketOf(player);
    if (pocket.raw < 1) return;
    pocket.raw -= 1;
    pocket.roast += 1;
    weapon = "roast";
    player.weapon = "roast";
    playPickup();
    hintMode = "";
    updateScore();
  }

  function eatMeat() {
    if (activeWeapon() !== "roast") return;
    const pocket = pocketOf(player);
    if (pocket.roast < 1) return;
    pocket.roast -= 1;
    player.energy = tune.energy;
    if (pocket.roast < 1) {
      const order = ["gun", "net", "sword", "raw", "roast"];
      const next = order.find((key) => hasKind(player, key)) || "gun";
      weapon = next;
      player.weapon = next;
    }
    playPickup();
    hintMode = "";
    updateScore();
  }

  function dropActive(who) {
    const order = ["gun", "net", "sword", "raw", "roast"];
    const kind = hasKind(who, who.weapon) ? who.weapon : order.find((key) => hasKind(who, key));
    if (kind === "raw" || kind === "roast") {
      const pocket = pocketOf(who);
      if (pocket[kind] < 1) return;
      pocket[kind] -= 1;
      const aim = AIM[who.dir] || [0, 1];
      const len = Math.hypot(aim[0], aim[1]) || 1;
      makeGear(kind, who.x + (aim[0] / len) * 28, who.y + (aim[1] / len) * 20);
      if (pocket[kind] < 1) {
        const next = order.find((key) => hasKind(who, key)) || "gun";
        who.weapon = next;
        if (who === player) weapon = next;
      }
      hintMode = "";
      playPickup();
      updateScore();
      return;
    }
    const item = kind && itemOf(who, kind);
    if (!item) return;
    const aim = AIM[who.dir] || [0, 1];
    const len = Math.hypot(aim[0], aim[1]) || 1;
    item.holder = null;
    item.held = false;
    item.anim = 0;
    item.x = who.x + (aim[0] / len) * 28;
    item.y = who.y + (aim[1] / len) * 20;
    const next = order.find((key) => hasKind(who, key)) || "gun";
    who.weapon = next;
    if (who === player) weapon = next;
    hintMode = "";
    playPickup();
  }

  function pickupItem(item) {
    playPickup();
    item.held = true;
    item.holder = player;
    item.anim = 0.22;
    item.fromX = item.x;
    item.fromY = item.y;
    if (netRole !== "guest") player.netHeld = null;
  }

  function closestFreeUnicorn() {
    let best = null;
    let bestD = Infinity;
    for (const uni of unicorns) {
      if (uni.state !== "free" || uni.rider) continue;
      const dist = Math.hypot(uni.x - player.x, uni.y - player.y);
      if (dist < bestD) {
        best = uni;
        bestD = dist;
      }
    }
    if (best) unicorn = best;
    return bestD;
  }

  function parkRide(x, y) {
    mounted = false;
    mountKind = "";
    mountLock = 0.4;
    const steed = player.ride;
    if (steed) {
      if (steed.rider === player) steed.rider = null;
      steed.x = x;
      steed.y = y;
      steed.homeX = x;
      steed.homeY = y;
      steed.tx = x;
      steed.ty = y;
      steed.wander = 0.6;
    }
    player.ride = null;
    player.mountKind = "";
  }

  function parkUnicorn(x, y) {
    if (player.ride === unicorn) {
      parkRide(x, y);
      return;
    }
    if (unicorn && unicorn.rider) {
      const rider = unicorn.rider;
      rider.mounted = false;
      rider.mountKind = "";
      rider.ride = null;
      if (rider === player) {
        mounted = false;
        mountKind = "";
      }
      unicorn.rider = null;
    }
    if (unicorn) {
      unicorn.x = x;
      unicorn.y = y;
      unicorn.homeX = x;
      unicorn.homeY = y;
      unicorn.tx = x;
      unicorn.ty = y;
      unicorn.wander = 0.6;
    }
  }

  function mountUnicorn() {
    if (mountLock > 0 || indoors) return;
    const dist = closestFreeUnicorn();
    if (!unicorn || unicorn.state !== "free" || unicorn.rider || dist >= 36) return;
    mounted = true;
    mountKind = "uni";
    mountLock = 0.35;
    player.ride = unicorn;
    player.mountKind = "uni";
    unicorn.rider = player;
    playMount();
    hintMode = "";
  }

  function dismountUnicorn() {
    if (mountLock > 0) return;
    parkRide(player.x, player.y + 12);
    playMount();
    hintMode = "";
  }

  function boarTame(boar) {
    return boar.energy < tune.boarEnergy * 0.25;
  }

  function closestRideableBoar() {
    let best = null;
    let bestD = Infinity;
    for (const boar of boars) {
      if (boar.state !== "roam" || boar.rider || !boarTame(boar)) continue;
      const dist = Math.hypot(boar.x - player.x, boar.y - player.y);
      if (dist < bestD) {
        best = boar;
        bestD = dist;
      }
    }
    return { boar: best, dist: bestD };
  }

  function mountBoar(boar) {
    if (mountLock > 0 || indoors || !boar || boar.rider || !boarTame(boar)) return;
    mounted = true;
    mountKind = "boar";
    mountLock = 0.35;
    player.ride = boar;
    player.mountKind = "boar";
    boar.rider = player;
    playMount();
    hintMode = "";
  }

  function pickupNearby() {
    if (mountLock > 0) return;
    if (mounted) {
      dismountUnicorn();
      return;
    }
    if (indoors) {
      const cook = cookStove();
      const holdsRaw = pocketOf(player).raw > 0;
      if (holdsRaw && Math.hypot(player.x - cook.x, player.y - cook.y) < 32) {
        cookCarry();
        return;
      }
    }
    const carcass = nearestCarcass();
    const loose = nearestLoose();
    const uDist = closestFreeUnicorn();
    const rideBoar = closestRideableBoar();
    const bDist = rideBoar.dist;
    if (carcass.body && carcass.dist < 36 && carcass.dist <= loose.dist && carcass.dist <= uDist && carcass.dist <= bDist) {
      takeCarcass(carcass.body, carcass.kind);
    } else if (loose.item && loose.dist < 34 && loose.dist <= uDist && loose.dist <= bDist) {
      if (loose.item.kind === "raw" || loose.item.kind === "roast") {
        pocketOf(player)[loose.item.kind] += 1;
        gear.splice(gear.indexOf(loose.item), 1);
        weapon = loose.item.kind;
        player.weapon = weapon;
        if (netRole !== "guest") player.netHeld = null;
        playPickup();
        updateScore();
        hintMode = "";
      } else {
        pickupItem(loose.item);
        weapon = loose.item.kind;
      }
    } else if (uDist < 36 && uDist <= bDist) mountUnicorn();
    else if (bDist < 36) mountBoar(rideBoar.boar);
  }

  function unicornHittable(bullet) {
    for (const uni of unicorns) {
      if (uni.state === "dead" || uni.state === "gone") continue;
      if (uni.rider === bullet.owner) continue;
      if (bullet.indoors) {
        if (uni.state !== "caught") continue;
      } else if (uni.state !== "free" || uni.inside) continue;
      const dx = bullet.x - uni.x;
      const dy = bullet.y - (uni.y - 14);
      if (dx * dx + dy * dy <= 324) {
        unicorn = uni;
        return true;
      }
    }
    return false;
  }

  function catchUnicorn() {
    if (unicorn.rider) parkUnicorn(unicorn.x, unicorn.y);
    unicorn.state = "caught";
    unicorn.inside = true;
    unicorn.rider = null;
    const slot = Math.max(0, unicorns.indexOf(unicorn));
    unicorn.x = roomX + 36 + (slot % 2) * 52;
    unicorn.y = roomY + 54;
    playCatch();
    hintMode = "";
  }

  function releaseUnicorn() {
    unicorn.state = "free";
    unicorn.inside = false;
    unicorn.x = house.x + 30;
    unicorn.y = house.y + 22;
    unicorn.homeX = unicorn.x;
    unicorn.homeY = unicorn.y;
    unicorn.tx = unicorn.x;
    unicorn.ty = unicorn.y;
    playRelease();
    hintMode = "";
  }

  function killUnicorn() {
    const rider = unicorn.rider;
    if (rider) {
      unicorn.x = rider.x;
      unicorn.y = rider.y;
      rider.mounted = false;
      rider.mountKind = "";
      rider.ride = null;
      if (rider === player) mounted = false;
      unicorn.rider = null;
    }
    unicorn.state = "dead";
    unicorn.respawn = tune.returnTime;
    unicorn.vanish = tune.returnTime / 2;
    playHit();
    hintMode = "";
    return addScore(6);
  }

  function respawnUnicorn(uni) {
    uni.state = "free";
    uni.inside = false;
    uni.rider = null;
    uni.respawn = 0;
    uni.dir = "down";
    const x = uni.homeX || uni.x;
    const y = uni.homeY || uni.y;
    uni.x = x;
    uni.y = y;
    uni.tx = x;
    uni.ty = y;
    uni.wander = 0.4;
  }

  function killPlayer(who) {
    const loot = who.gold;
    who.gold = 0;
    who.energy = tune.energy;
    if (who.ride) {
      who.ride.rider = null;
      who.ride.x = house.x + 26;
      who.ride.y = house.y + 18;
      who.ride.homeX = who.ride.x;
      who.ride.homeY = who.ride.y;
      who.ride = null;
    }
    who.mounted = false;
    who.mountKind = "";
    who.indoors = true;
    who.x = roomX + ROOM_W / 2;
    who.y = roomY + 46;
    who.doorLock = 0.7;
    who.target = null;
    who.outsideSpot = { x: house.x, y: house.y + 14 };
    if (who === player) outsideSpot = who.outsideSpot;
    if (playerCount === 2 || netRole) {
      const other = livePeople().find((one) => one !== who);
      if (other) other.gold += loot;
    }
    if (who === player) {
      indoors = true;
      mounted = false;
      mountKind = "";
      doorLock = who.doorLock;
      target = null;
    }
    updateScore();
    hintMode = "";
  }

  function hitDuck(bullet, radius) {
    const reach = radius || 10;
    for (const bird of ducks) {
      if (bird.state !== "swim") continue;
      const dx = bullet.x - bird.x;
      const dy = bullet.y - bird.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      bird.state = "down";
      bird.sink = 0;
      bird.vanish = tune.returnTime / 2;
      bird.respawn = tune.returnTime;
      playQuack();
      addScore(3);
      return true;
    }
    return false;
  }

  function updateBoars(dt) {
    const people = livePeople();
    for (const boar of boars) {
      if (boar.bite > 0) boar.bite -= dt;
      if (boar.state === "carried") {
        if (boar.carrier) {
          boar.x = boar.carrier.x;
          boar.y = boar.carrier.y + 8;
        }
        continue;
      }
      if (boar.state === "down") {
        boar.sink = (boar.sink || 0) + dt;
        boar.vanish -= dt;
        boar.respawn -= dt;
        if (boar.vanish <= 0) boar.state = "gone";
        continue;
      }
      if (boar.state === "gone") {
        if (!boarsOn) continue;
        boar.respawn -= dt;
        if (boar.respawn <= 0) {
          boar.state = "roam";
          boar.energy = tune.boarEnergy;
          boar.rider = null;
          boar.sink = 0;
          boar.x = boar.homeX;
          boar.y = boar.homeY;
          boar.tx = boar.homeX;
          boar.ty = boar.homeY;
        }
        continue;
      }
      if (boar.rider) continue;
      const calm = boarTame(boar);
      let target = null;
      let best = 220;
      if (!calm) {
        for (const who of people) {
          if (who.indoors) continue;
          const dist = Math.hypot(who.x - boar.x, who.y - boar.y);
          if (dist < best) {
            best = dist;
            target = who;
          }
        }
      }
      let dx;
      let dy;
      let pace = tune.run * 1.5;
      if (target) {
        dx = target.x - boar.x;
        dy = target.y - boar.y;
        boar.voice -= dt;
        if (boar.voice <= 0) {
          boar.voice = 0.7;
          playGrowl();
        }
        if (best < 28 && boar.bite <= 0) {
          boar.bite = 0.9;
          const loss = tune.boarDamage;
          target.energy = Math.max(0, target.energy - loss);
          target.flash = 0.16;
          playSqueal();
          playHit();
          if (target.energy <= 0) killPlayer(target);
          else updateScore();
        }
      } else {
        boar.wander -= dt;
        const left = Math.hypot(boar.tx - boar.x, boar.ty - boar.y);
        if (boar.wander <= 0 || left < 3) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 24 + Math.random() * 70;
          boar.tx = boar.homeX + Math.cos(ang) * rad;
          boar.ty = boar.homeY + Math.sin(ang) * rad;
          boar.wander = 1.2 + Math.random() * 2;
        }
        dx = boar.tx - boar.x;
        dy = boar.ty - boar.y;
        if (calm) pace = 26;
      }
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const step = Math.min(len, pace * dt);
      const nx = boar.x + (dx / len) * step;
      const ny = boar.y + (dy / len) * step;
      const tx = Math.floor(nx / TILE);
      const ty = Math.floor(ny / TILE);
      if (groundAt(tx, ty) === T.WATER || blockedByHouse(nx, ny)) {
        boar.wander = 0;
        continue;
      }
      boar.x = nx;
      boar.y = ny;
      if (Math.abs(dx) > Math.abs(dy)) boar.dir = dx < 0 ? "left" : "right";
      else boar.dir = dy < 0 ? "up" : "down";
    }
  }

  function hitBoar(bullet, radius) {
    const reach = radius || 28;
    for (const boar of boars) {
      if (boar.state !== "roam") continue;
      if (boar.rider === bullet.owner) continue;
      const dx = bullet.x - boar.x;
      const dy = bullet.y - (boar.y - 10);
      if (dx * dx + dy * dy > reach * reach) continue;
      const loss = (5 + Math.floor(Math.random() * 6)) * 2;
      boar.energy = Math.max(0, boar.energy - loss);
      playHit();
      if (boar.energy <= 0) {
        const rider = boar.rider;
        if (rider) {
          boar.x = rider.x;
          boar.y = rider.y;
          rider.mounted = false;
          rider.mountKind = "";
          rider.ride = null;
          if (rider === player) {
            mounted = false;
            mountKind = "";
          }
          boar.rider = null;
        }
        boar.state = "down";
        boar.sink = 0;
        boar.vanish = tune.returnTime / 2;
        boar.respawn = tune.returnTime;
        boar.homeX = boar.x;
        boar.homeY = boar.y;
        addScore(2);
      }
      return true;
    }
    return false;
  }

  function livingButterflies() {
    let count = 0;
    for (const butterfly of butterflies) {
      if (butterfly.state === "fly" || butterfly.state === "caught") count += 1;
    }
    return count;
  }

  function spawnButterfly() {
    const colors = ["#fff8ee", "#f6d34e", "#f4a0c4", "#8ec8ff", "#ffe08a", "#fffaf0", "#f7b0d4", "#fff4c2"];
    for (let n = 0; n < 80; n++) {
      const tx = 2 + Math.floor(Math.random() * (COLS - 4));
      const ty = 2 + Math.floor(Math.random() * (ROWS - 4));
      if (groundAt(tx, ty) !== T.GRASS) continue;
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (Math.hypot(x - house.x, y - house.y) < 80) continue;
      butterflies.push({
        hx: x,
        hy: y,
        rad: 14 + Math.random() * 22,
        t: Math.random() * Math.PI * 2,
        color: colors[butterflies.length % colors.length],
        state: "fly",
        inside: false,
        x,
        y,
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
      });
      return;
    }
  }

  function refillButterflies(dt) {
    if (livingButterflies() >= butterflyCap) {
      butterflyTimer = 0;
      return;
    }
    butterflyTimer += dt;
    if (butterflyTimer < 30) return;
    butterflyTimer = 0;
    spawnButterfly();
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
    if (active === "raw") return;
    if (active === "roast") {
      eatMeat();
      return;
    }
    if (active === "sword") {
      swingSword();
      return;
    }
    const item = itemOf(player, active);
    if (!active || !item || item.anim > 0 || shootCooldown > 0) return;
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
      owner: player,
      indoors,
    });
    if (active === "net") playSwing();
    else playShot();
  }

  function swingSword() {
    const item = itemOf(player, "sword");
    if (!item || shootCooldown > 0) return;
    shootCooldown = 0.34;
    player.slash = 0.28;
    playSwing();
    const face = facingAngle(player.dir);
    scoreWho = player;
    for (let step = 0; step <= 4; step++) {
      const ang = face - 1.15 + (2.3 * step) / 4;
      const slash = {
        x: player.x + Math.cos(ang) * 22,
        y: player.y - 8 + Math.sin(ang) * 18,
        vx: Math.cos(ang),
        vy: Math.sin(ang),
        kind: "sword",
        owner: player,
        indoors,
      };
      if (unicornHittable(slash)) {
        killUnicorn();
        return;
      }
      if (hitPlayer(slash)) return;
      if (!indoors && hitDuck(slash, 20)) return;
      if (!indoors && hitBoar(slash, 36)) return;
      if (!indoors && hitFauna(slash, 22)) return;
      for (const butterfly of butterflies) {
        const flying = !indoors && butterfly.state === "fly" && !butterfly.inside;
        const caught = indoors && butterfly.state === "caught";
        if (!flying && !caught) continue;
        const body = butterflyBody(butterfly, 0);
        const dx = slash.x - body.x;
        const dy = slash.y - (body.y - body.z);
        if (dx * dx + dy * dy > 324) continue;
        butterfly.state = "fall";
        butterfly.inside = !!indoors;
        butterfly.x = body.x;
        butterfly.y = body.y;
        butterfly.z = body.z;
        butterfly.vx = Math.cos(ang) * 14;
        butterfly.vy = 8;
        butterfly.vz = 6;
        playHit();
        addScore(1);
        return;
      }
    }
    let chopped = -1;
    let choppedWood = null;
    let choppedD = 20 * 20;
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (prop.kind !== "tree" && prop.kind !== "bush") continue;
      const dx = player.x - prop.x;
      const dy = player.y - 6 - prop.y;
      const d = dx * dx + dy * dy;
      if (d < choppedD) {
        chopped = i;
        choppedWood = null;
        choppedD = d;
      }
    }
    if (woodGrid) {
      const cell = woodGrid.cell;
      const cx = Math.floor(player.x / cell);
      const cy = Math.floor((player.y - 6) / cell);
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          const bucket = woodGrid.buckets.get((x + 4096) + (y + 4096) * 8192);
          if (!bucket) continue;
          for (const tree of bucket) {
            if (tree.kind !== "tree" && tree.kind !== "bush") continue;
            const dx = player.x - tree.x;
            const dy = player.y - 6 - tree.y;
            const d = dx * dx + dy * dy;
            if (d < choppedD) {
              chopped = -1;
              choppedWood = tree;
              choppedD = d;
            }
          }
        }
      }
    }
    if (choppedWood) {
      cutWoods.push([Math.round(choppedWood.x), Math.round(choppedWood.y)]);
      dropWood(choppedWood.x, choppedWood.y);
      playHit();
    } else if (chopped >= 0) {
      cutWoods.push([Math.round(props[chopped].x), Math.round(props[chopped].y)]);
      dropWood(props[chopped].x, props[chopped].y);
      playHit();
    }
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
    const carcass = nearestCarcass();
    const nearDoor = !indoors && Math.hypot(player.x - house.x, player.y - house.y) < 30;
    const loose = nearestLoose();
    const nearItem = loose.item && loose.dist < 34 ? loose.item : null;
    const uDist = mounted ? Infinity : closestFreeUnicorn();
    const nearUni = uDist < 36;
    const rideBoar = mounted ? { dist: Infinity } : closestRideableBoar();
    const bDist = rideBoar.dist;
    const nearBoar = bDist < 36;
    const uniInside = unicorns.some((uni) => uni.state === "caught");
    let caught = 0;
    for (const butterfly of butterflies) if (butterfly.state === "caught") caught += 1;
    const active = activeWeapon();
    const heldCount = ["gun", "net", "sword", "raw", "roast"].filter((kind) => hasKind(player, kind)).length;
    const rawCount = pocketOf(player).raw;
    let mode = "idle";
    const depth = playerDepth();
    const stove = stoveSpot();
    const nearStove = indoors && Math.hypot(player.x - stove.x, player.y - stove.y) < 28;
    const cook = cookStove();
    const nearCook = indoors && Math.hypot(player.x - cook.x, player.y - cook.y) < 32;
    if (indoors) mode = "indoor-" + caught + "-" + (uniInside ? "u" : "x") + "-" + active + (nearStove ? "-stove" : "") + (nearCook ? "-cook" : "") + "-" + rawCount;
    else if (!mounted && carcass.body && carcass.dist < 36 && carcass.dist <= (loose.dist || Infinity) && carcass.dist <= uDist && carcass.dist <= bDist) mode = "near-carcass-" + carcass.kind;
    else if (mounted && !nearDoor) mode = (mountKind === "boar" ? "ride-boar" : "ride") + (depth ? "-water" : "");
    else if (nearItem && loose.dist <= uDist && loose.dist <= bDist) mode = "near-" + nearItem.kind;
    else if (nearUni && uDist <= bDist) mode = "near-uni";
    else if (nearBoar) mode = "near-boar";
    else if (nearDoor) mode = "door";
    else if (depth) mode = "water";
    else if (active) mode = "held-" + active + "-" + heldCount;
    if (mode === hintMode) return;
    hintMode = mode;
    const hint = document.getElementById("hint");
    if (!hint) return;
    if (mode.startsWith("near-carcass")) {
      hint.innerHTML = mode.endsWith("boar")
        ? "E bierze dzika jako mięso surowe<br>Możesz nieść kilka"
        : "E bierze jednorożca jako mięso surowe<br>Możesz nieść kilka";
    } else if (mode.startsWith("indoor")) {
      const stoveLine = nearCook && rawCount
        ? "E gotuje jedno mięso surowe na pieczeń<br>Surowego nie da się zjeść<br>"
        : nearCook
          ? "Kuchenka do mięsa<br>Pieczeń: Q, potem spacja albo F, wszędzie<br>"
          : nearStove
        ? "Kuchenka · energia wraca 1% na sekundę<br>"
        : "Po lewej kuchenka z jedzeniem, po prawej do mięsa<br>";
      const uniLine = uniInside ? "Jednorożec w domku · pistolet daje 6 gold<br>" : "";
      hint.innerHTML = caught > 0
        ? `${stoveLine}${uniLine}Motyle w domku: ${caught}<br>Pistolet zabija · łapacz wypuszcza na łąkę<br>Wyjdź drzwiami w dół`
        : uniInside
          ? `${stoveLine}Jednorożec w domku<br>Pistolet — 6 gold<br>Łapacz wypuszcza na łąkę<br>Wyjdź drzwiami w dół`
          : `${stoveLine}Wyjdź drzwiami w dół`;
    } else if (mode === "door") hint.innerHTML = "Wejdź w drzwi do góry";
    else if (mode === "near-gun") hint.innerHTML = "E — podnieś pistolet";
    else if (mode === "near-net") hint.innerHTML = "E — podnieś łapacz motyli";
    else if (mode === "near-sword") hint.innerHTML = "E — podnieś miecz";
    else if (mode === "near-raw") hint.innerHTML = "E — podnieś mięso surowe";
    else if (mode === "near-roast") hint.innerHTML = "E — podnieś pieczeń";
    else if (mode === "near-uni") hint.innerHTML = "E — wsiądź na jednorożca";
    else if (mode === "near-boar") hint.innerHTML = "Dzik ma mało energii<br>E — wsiądź";
    else if (mode === "ride-boar-water") hint.innerHTML = "Dzik w wodzie · dwa razy wolniej<br>E — zsiądź";
    else if (mode === "ride-boar") hint.innerHTML = "Dzik · półtora raza szybciej niż bieg<br>E — zsiądź";
    else if (mode === "ride-water") hint.innerHTML = "Jednorożec w wodzie · dwa razy wolniej<br>E — zsiądź";
    else if (mode === "ride") hint.innerHTML = "Jednorożec · półtora raza szybciej niż bieg<br>E — zsiądź";
    else if (mode === "water") hint.innerHTML = "Woda · dwa razy wolniej niż na łące<br>Przy brzegu od pasa w górę, głębiej sama głowa";
    else if (mode.startsWith("held-net")) hint.innerHTML = "Łapacz motyli" + (heldCount > 1 ? " · Q zmienia broń" : "") + "<br>Strzał przenosi motyla albo jednorożca do domku<br>Bez punktów";
    else if (mode.startsWith("held-sword")) hint.innerHTML = "Miecz" + (heldCount > 1 ? " · Q zmienia broń" : "") + "<br>Cięcie z bliska · ścina drzewa i krzaki<br>Gracz traci 5–10% energii";
    else if (mode.startsWith("held-gun")) hint.innerHTML = "Pistolet" + (heldCount > 1 ? " · Q zmienia broń" : "") + "<br>Spacja lub prawy przycisk — strzał<br>Kaczka — 3 gold · jednorożec — 6 gold";
    else if (mode.startsWith("held-raw")) hint.innerHTML = "Mięso surowe" + (heldCount > 1 ? " · Q zmienia przedmiot" : "") + "<br>Nie da się zjeść<br>W domu, przy kuchence po prawej, E robi pieczeń";
    else if (mode.startsWith("held-roast")) hint.innerHTML = "Pieczeń" + (heldCount > 1 ? " · Q zmienia przedmiot" : "") + "<br>Spacja, prawy przycisk albo F — zjedz, gdziekolwiek jesteś<br>Energia wraca do 100%";
    else hint.innerHTML = phoneMode
      ? "Drążek chodzi · przycisk Bieg<br>Akcja podnosi i wsiada · Broń zmienia · Strzał"
      : playerCount === 2
      ? "Gracz 1: WASD, E, spacja<br>Gracz 2: pad — drążek, A, X albo RT<br>Strzał w gracza zabiera 5–10% energii"
      : "WASD, E, spacja<br>Strzał pistoletem zabiera energię<br>Kuchenka w domku ją oddaje";
  }

  function addScore(points) {
    const who = scoreWho || player;
    who.gold += points;
    updateScore();
    return false;
  }

  function updateScore() {
    const el = document.getElementById("score");
    if (!el) return;
    const line = (who, n) => {
      const raw = pocketOf(who).raw;
      const roast = pocketOf(who).roast;
      return `Gracz ${n}: ${who.gold} gold · ${energyPct(who.energy, tune.energy)}% · mięso ${raw} · pieczeń ${roast}`;
    };
    if (document.body.classList.contains("phone")) {
      const who = localActor();
      el.textContent = who.gold + " $";
      return;
    }
    if (netRole) {
      el.innerHTML = livePeople().map((who) => line(who, actors.indexOf(who) + 1)).join("<br>");
      return;
    }
    el.innerHTML = playerCount === 2
      ? `${line(actors[0], 1)}<br>${line(actors[1], 2)}`
      : line(actors[0], 1);
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
    const pack = (player.sprites || chars)[player.dir];
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

  function drawPitch(ctx, x, y, top, bot, wide, c1, c2) {
    for (let i = 0; i <= bot - top; i++) {
      const t = i / (bot - top);
      const half = Math.round(4 + t * wide);
      ctx.fillStyle = i % 4 < 2 ? c1 : c2;
      ctx.fillRect(x - half, y + top + i, half * 2, 1);
    }
  }

  function drawShopSign(ctx, x, y, text, bg, fg) {
    ctx.font = "bold 6px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.ceil(ctx.measureText(text).width) + 6;
    ctx.fillStyle = bg;
    ctx.fillRect(x - w / 2, y, w, 8);
    ctx.fillStyle = fg;
    ctx.fillText(text, x, y + 4);
  }

  function insidePoly(x, y, poly) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  function southOfNorthEdge(poly, px, py) {
    const x = px / TILE;
    const y = py / TILE;
    let north = Infinity;
    let seen = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      if ((xi > x) === (xj > x)) continue;
      const iy = yi + ((x - xi) / (xj - xi)) * (yj - yi);
      if (iy < north) north = iy;
      seen = true;
    }
    if (!seen) return true;
    return y >= north - 0.05;
  }

  function tracePoly(ctx, poly, cx, cy, scale) {
    for (let i = 0; i < poly.length; i++) {
      const x = (cx + (poly[i][0] - cx) * scale) * TILE - view.camX;
      const y = (cy + (poly[i][1] - cy) * scale) * TILE - view.camY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function streetEdge(poly) {
    let best = null;
    let longest = null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      minX = Math.min(minX, poly[i][0]);
      maxX = Math.max(maxX, poly[i][0]);
      minY = Math.min(minY, poly[i][1]);
      maxY = Math.max(maxY, poly[i][1]);
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.2) continue;
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      let nx = dy / len;
      let ny = -dx / len;
      if (insidePoly(mx + nx * 0.3, my + ny * 0.3, poly)) {
        nx = -nx;
        ny = -ny;
      }
      let roads = 0;
      for (let s = -1; s <= 1; s++) {
        const px = mx + nx * 0.45 + (dx / len) * s * 0.35;
        const py = my + ny * 0.45 + (dy / len) * s * 0.35;
        const gnd = groundAt(Math.floor(px), Math.floor(py));
        if (gnd === T.ASPHALT || gnd === T.DIRT) roads += 1;
      }
      const item = { mx, my, len, dx, dy, nx, ny, xSpan: Math.abs(dx), roads };
      if (!longest || len > longest.len) longest = item;
      if (!best || roads * len > best.roads * best.len) best = item;
    }
    return { edge: best && best.roads ? best : longest, minX, maxX, minY, maxY };
  }

  function facadeBox(poly, kind) {
    const found = streetEdge(poly);
    const edge = found.edge;
    if (!edge) return null;
    const floors = kind === "block" ? 3 : kind === "industrial" ? 2 : 1;
    const wallH = Math.round((10 + floors * 8) * 1.56);
    let w = Math.round(Math.max(12, edge.len * TILE) * 1.56);
    if (kind === "industrial") w = Math.min(w, 120);
    const cx = ((found.minX + found.maxX) / 2) * TILE;
    const south = found.maxY * TILE;
    const north = found.minY * TILE;
    const bottom = (south + (south + north) / 2) / 2;
    return {
      left: cx - w / 2,
      right: cx + w / 2,
      top: Math.max(north, bottom - wallH),
      bottom,
    };
  }

  function drawPlanBuilding(ctx, spot) {
    if (spot.poly) {
      const face = spot.face || facadeBox(spot.poly, spot.kind);
      if (!face) return;
      const w = face.right - face.left;
      const floors = spot.kind === "block" ? 3 : spot.kind === "industrial" ? 2 : 1;
      const wallH = Math.round((10 + floors * 8) * 1.56);
      const roofH = Math.round(8 * 1.56);
      const x = Math.round((face.left + face.right) / 2 - view.camX);
      const y = Math.round(face.bottom - view.camY);
      const flat = spot.kind === "block" || spot.kind === "industrial";
      ctx.fillStyle = "rgba(24, 42, 18, 0.28)";
      ctx.fillRect(x - w / 2, y - 1, w, 3);
      ctx.fillStyle = spot.kind === "industrial" ? "#b9b9b6" : spot.kind === "block" ? "#d5d0c6" : "#f3e6c8";
      ctx.fillRect(x - w / 2, y - wallH, w, wallH);
      ctx.fillStyle = "#6b4a2c";
      ctx.fillRect(x - w / 2, y - wallH, w, 1);
      ctx.fillRect(x - w / 2, y - 1, w, 1);
      const bays = Math.max(1, Math.floor(w / 14));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < bays; i++) {
          ctx.fillStyle = "#9fd4e0";
          ctx.fillRect(x - w / 2 + 4 + i * Math.floor(w / bays), y - wallH + 4 + f * 8, 5, 4);
        }
      }
      ctx.fillStyle = "#5c3a22";
      ctx.fillRect(x - 3, y - 8, 6, 8);
      if (flat) {
        ctx.fillStyle = spot.kind === "industrial" ? "#8a8a88" : "#6a645c";
        ctx.fillRect(x - w / 2 - 1, y - wallH - roofH, w + 2, roofH);
      } else {
        drawPitch(ctx, x, y, -wallH - roofH, -wallH, w / 2 - 4, "#8d3b32", "#a34a3c");
      }
      return;
    }
    const len = spot.len;
    const wid = spot.wid;
    ctx.save();
    ctx.translate(Math.round(spot.x - view.camX), Math.round(spot.y - view.camY));
    ctx.rotate(spot.a || 0);
    ctx.fillStyle = "rgba(24, 42, 18, 0.28)";
    ctx.fillRect(-len / 2 - 1, wid / 2 - 1, len + 2, 4);
    const wall = spot.kind === "block" ? "#d5d0c6" : spot.kind === "terrace" ? "#efe2cc" : "#f3e6c8";
    const roof = spot.kind === "block" ? "#7e756c" : spot.kind === "terrace" ? "#8d3b32" : "#a34a3c";
    const trim = spot.kind === "block" ? "#5c564e" : "#6b4a2c";
    ctx.fillStyle = wall;
    ctx.fillRect(-len / 2, -wid / 2, len, wid);
    ctx.fillStyle = trim;
    ctx.fillRect(-len / 2, -wid / 2, len, 1);
    ctx.fillRect(-len / 2, wid / 2 - 1, len, 1);
    ctx.fillRect(-len / 2, -wid / 2, 1, wid);
    ctx.fillRect(len / 2 - 1, -wid / 2, 1, wid);
    const roofH = spot.kind === "block" ? wid - 7 : wid - 8;
    ctx.fillStyle = roof;
    ctx.fillRect(-len / 2 + 2, -wid / 2 + 2, len - 4, Math.max(4, roofH));
    if (spot.kind === "block") {
      ctx.fillStyle = "#6a645c";
      ctx.fillRect(-len / 2 + 3, -wid / 2 + Math.round(wid * 0.38), len - 6, 1);
      ctx.fillRect(-len / 2 + 3, -wid / 2 + Math.round(wid * 0.62), len - 6, 1);
    } else {
      ctx.fillStyle = spot.kind === "terrace" ? "#c46a52" : "#c45a48";
      ctx.fillRect(-len / 2 + 3, -1, len - 6, 1);
    }
    ctx.fillStyle = "#9fd4e0";
    const bays = Math.max(1, Math.floor((len - 8) / (spot.kind === "terrace" ? 12 : 16)));
    for (let i = 0; i < bays; i++) {
      const wx = -len / 2 + 5 + i * ((len - 8) / bays);
      ctx.fillRect(wx, -wid / 2 + 3, 3, 2);
      if (spot.kind === "block") ctx.fillRect(wx, -wid / 2 + Math.round(wid * 0.42), 3, 2);
    }
    ctx.fillStyle = spot.kind === "block" ? "#3a342e" : "#5c3a22";
    ctx.fillRect(-3, wid / 2 - 5, 6, 4);
    ctx.restore();
  }

  function drawSpot(ctx, spot) {
    const x = Math.round(spot.x - view.camX);
    const y = Math.round(spot.y - view.camY);
    if (spot.len || spot.poly) {
      drawPlanBuilding(ctx, spot);
      return;
    }
    ctx.fillStyle = "rgba(24, 42, 18, 0.28)";
    ctx.fillRect(x - spot.hw - 4, y - 2, spot.hw * 2 + 8, 6);
    if (spot.kind === "eden") {
      drawPitch(ctx, x, y, -64, -40, 44, "#246b3e", "#318454");
      ctx.fillStyle = "#f6f1e4";
      ctx.fillRect(x - 38, y - 42, 76, 38);
      ctx.fillStyle = "#2f6b45";
      ctx.fillRect(x - 40, y - 28, 80, 6);
      ctx.fillStyle = "#9fd4e0";
      ctx.fillRect(x - 30, y - 22, 22, 14);
      ctx.fillRect(x + 8, y - 22, 22, 14);
      ctx.fillStyle = "#f7f3ea";
      ctx.fillRect(x - 29, y - 21, 8, 5);
      ctx.fillRect(x + 9, y - 21, 8, 5);
      ctx.fillStyle = "#5c3a22";
      ctx.fillRect(x - 6, y - 18, 12, 16);
      drawShopSign(ctx, x, y - 36, "EDEN", "#f2d04a", "#2a2418");
    } else if (spot.kind === "cottage") {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.75, 0.75);
      const roof = (Math.round(spot.x) + Math.round(spot.y)) % 2 ? ["#8d3b32", "#a34a3c"] : ["#7a4630", "#946044"];
      ctx.fillStyle = "#8d7460";
      ctx.fillRect(-38, -6, 76, 5);
      ctx.fillStyle = "#f3e6c8";
      ctx.fillRect(-34, -42, 68, 36);
      ctx.fillStyle = "#6b4a2c";
      ctx.fillRect(-34, -42, 68, 2);
      ctx.fillRect(-34, -26, 68, 2);
      ctx.fillRect(-34, -42, 2, 36);
      ctx.fillRect(32, -42, 2, 36);
      ctx.fillStyle = "#3a2e28";
      ctx.fillRect(-22, -36, 12, 10);
      ctx.fillRect(10, -36, 12, 10);
      ctx.fillStyle = "#9fd4e0";
      ctx.fillRect(-21, -35, 10, 8);
      ctx.fillRect(11, -35, 10, 8);
      ctx.fillStyle = "#5c3a22";
      ctx.fillRect(-8, -20, 16, 18);
      const roofTop = -62;
      const roofBot = -38;
      for (let i = 0; i <= roofBot - roofTop; i++) {
        const t = i / (roofBot - roofTop);
        const half = Math.round(6 + t * 40);
        ctx.fillStyle = i % 4 < 2 ? roof[0] : roof[1];
        ctx.fillRect(-half, roofTop + i, half * 2, 1);
      }
      ctx.restore();
    } else if (spot.kind === "zabka") {
      drawPitch(ctx, x, y, -60, -38, 38, "#0e5a32", "#187a42");
      ctx.fillStyle = "#1f8f4c";
      ctx.fillRect(x - 32, y - 40, 64, 36);
      ctx.fillStyle = "#146b38";
      ctx.fillRect(x - 32, y - 40, 64, 3);
      ctx.fillStyle = "#d7f5c4";
      ctx.fillRect(x - 24, y - 24, 16, 12);
      ctx.fillRect(x + 8, y - 24, 16, 12);
      ctx.fillStyle = "#0e5a32";
      ctx.fillRect(x - 6, y - 18, 12, 16);
      ctx.fillStyle = "#ffe14a";
      ctx.fillRect(x - 5, y - 16, 4, 12);
      drawShopSign(ctx, x, y - 34, "ŻABKA", "#ffe14a", "#17331c");
    } else if (spot.kind === "inpost") {
      ctx.fillStyle = "#2a2e32";
      ctx.fillRect(x - 16, y - 36, 32, 6);
      ctx.fillStyle = "#f5c518";
      ctx.fillRect(x - 14, y - 32, 28, 30);
      ctx.fillStyle = "#1c1c1c";
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.fillRect(x - 11 + col * 8, y - 28 + row * 6, 6, 4);
        }
      }
      ctx.fillStyle = "#8fd0e8";
      ctx.fillRect(x - 6, y - 30, 12, 4);
      drawShopSign(ctx, x, y - 42, "INPOST", "#1c1c1c", "#f5c518");
    } else if (spot.kind === "stop") {
      ctx.fillStyle = "#3a4a62";
      ctx.fillRect(x - 18, y - 28, 36, 4);
      ctx.fillStyle = "#5c6e88";
      ctx.fillRect(x - 16, y - 26, 32, 2);
      ctx.fillStyle = "#2c241c";
      ctx.fillRect(x - 16, y - 24, 2, 22);
      ctx.fillRect(x + 14, y - 24, 2, 22);
      ctx.fillStyle = "#b7e4f2";
      ctx.fillRect(x - 14, y - 22, 28, 12);
      ctx.fillStyle = "#d8c49a";
      ctx.fillRect(x - 10, y - 8, 20, 3);
      ctx.fillStyle = "#6b4a2c";
      ctx.fillRect(x + 18, y - 34, 2, 32);
      drawShopSign(ctx, x + 19, y - 42, "BUS", "#f2d04a", "#2a2418");
    }
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
    drawStove(ctx, x, y);
    drawCookStove(ctx);
    ctx.fillStyle = "#5c3a22";
    ctx.fillRect(doorX - 9, doorY, 18, 16);
    ctx.fillStyle = "#7a4e2e";
    ctx.fillRect(doorX - 7, doorY + 1, 14, 14);
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(doorX - 7, doorY + 1, 6, 14);
    ctx.fillStyle = "#e8d7a4";
    ctx.fillRect(doorX + 3, doorY + 8, 1, 1);
  }

  function drawFauna(ctx, animal, time) {
    if (animal.state === "gone") return;
    const face = animal.dir === "left" ? -1 : 1;
    const sx = Math.round(animal.x - view.camX);
    const sy = Math.round(animal.y - view.camY - (animal.state === "roam" ? animal.z || 0 : 0));
    const px = (rx, ry, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(face > 0 ? sx + rx : sx - rx - w, sy + ry, w, h);
    };
    if (animal.kind === "deer") {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1.65, 1.65);
      ctx.translate(-sx, -sy);
    }
    try {
    if (animal.state === "down") {
      if (animal.kind === "bird") {
        px(-3, -1, 6, 2, "#5c6a78");
        px(2, -2, 3, 1, "#8aa0b4");
        return;
      }
      if (animal.kind === "deer") {
        px(-8, -3, 16, 4, "#c4a06a");
        px(6, -5, 4, 3, "#a8844e");
        px(-6, -4, 3, 2, "#f3e6c8");
        return;
      }
      if (animal.kind === "fox") {
        px(-6, -2, 12, 3, "#d26a2a");
        px(-8, -3, 4, 2, "#f2efe4");
        return;
      }
      px(-4, -2, 7, 3, "#8a5a32");
      px(-6, -4, 3, 3, "#c47a3a");
      return;
    }
    const step = Math.floor((time || 0) * 8) % 2;
    const dir = animal.dir || "down";
    const side = dir === "left" || dir === "right";
    if (side) {
      if (animal.kind === "fox") {
        px(-7, -4, 10, 4, "#d26a2a");
        px(-8, -6, 4, 3, "#f2efe4");
        px(2, -6, 4, 3, "#e07a32");
        px(4, -8, 2, 2, "#d26a2a");
        px(5, -7, 1, 1, "#1a120c");
        px(-9, -3, 4, 2, "#f7f4ee");
        px(-2, step ? -1 : 0, 2, 2, "#8a3e16");
        px(2, step ? 0 : -1, 2, 2, "#8a3e16");
      } else if (animal.kind === "squirrel") {
        px(-4, -4, 6, 3, "#8a5a32");
        px(-6, -8, 3, 5, "#c47a3a");
        px(1, -6, 3, 3, "#a86838");
        px(3, -7, 1, 1, "#1a120c");
        px(-1, step ? 0 : -1, 1, 2, "#5c3a22");
      } else if (animal.kind === "deer") {
        px(-8, -6, 12, 5, "#c4a06a");
        px(-7, -8, 6, 3, "#f3e6c8");
        px(3, -10, 5, 5, "#b89058");
        px(6, -12, 1, 3, "#efe6d4");
        px(4, -12, 1, 2, "#efe6d4");
        px(7, -8, 1, 1, "#1a120c");
        px(-4, step ? -1 : 0, 2, 4, "#8a6840");
        px(2, step ? 0 : -1, 2, 4, "#8a6840");
      } else {
        const flap = Math.sin((time || 0) * 14) > 0 ? -3 : -1;
        px(-3, -2, 6, 3, "#4e6274");
        px(-5, flap, 4, 1, "#8aa0b4");
        px(2, flap, 4, 1, "#8aa0b4");
        px(3, -3, 2, 1, "#e07a32");
        px(1, -3, 1, 1, "#1a120c");
      }
      return;
    }
    if (dir === "down") {
      if (animal.kind === "fox") {
        px(-4, -3, 8, 4, "#d26a2a");
        px(-3, -7, 6, 4, "#e07a32");
        px(-4, -9, 2, 3, "#d26a2a");
        px(2, -9, 2, 3, "#d26a2a");
        px(-2, -6, 1, 1, "#1a120c");
        px(1, -6, 1, 1, "#1a120c");
        px(-2, -4, 4, 2, "#f7f4ee");
        px(-2, step ? 1 : 0, 1, 2, "#8a3e16");
        px(1, step ? 0 : 1, 1, 2, "#8a3e16");
      } else if (animal.kind === "squirrel") {
        px(-3, -2, 6, 3, "#8a5a32");
        px(-2, -6, 4, 4, "#a86838");
        px(-4, -8, 2, 3, "#c47a3a");
        px(2, -8, 2, 3, "#c47a3a");
        px(-2, -5, 1, 1, "#1a120c");
        px(1, -5, 1, 1, "#1a120c");
        px(-1, -9, 2, 3, "#c47a3a");
      } else if (animal.kind === "deer") {
        px(-5, -4, 10, 5, "#c4a06a");
        px(-3, -9, 6, 5, "#b89058");
        px(-4, -12, 1, 4, "#efe6d4");
        px(3, -12, 1, 4, "#efe6d4");
        px(-2, -7, 1, 1, "#1a120c");
        px(1, -7, 1, 1, "#1a120c");
        px(-3, -5, 6, 2, "#f3e6c8");
        px(-3, step ? 1 : 0, 2, 4, "#8a6840");
        px(1, step ? 0 : 1, 2, 4, "#8a6840");
      } else {
        const flap = Math.sin((time || 0) * 14) > 0 ? 4 : 2;
        px(-2, -2, 4, 3, "#4e6274");
        px(-2 - flap, -2, flap, 2, "#8aa0b4");
        px(2, -2, flap, 2, "#8aa0b4");
        px(-1, 1, 2, 2, "#e07a32");
        px(-1, -2, 1, 1, "#1a120c");
      }
      return;
    }
    if (animal.kind === "fox") {
      px(-4, -3, 8, 4, "#e07a32");
      px(-3, -6, 6, 3, "#d26a2a");
      px(-4, -8, 2, 2, "#d26a2a");
      px(2, -8, 2, 2, "#d26a2a");
      px(-5, -2, 4, 3, "#f7f4ee");
      px(-2, step ? 1 : 0, 1, 2, "#8a3e16");
      px(1, step ? 0 : 1, 1, 2, "#8a3e16");
    } else if (animal.kind === "squirrel") {
      px(-3, -2, 6, 3, "#8a5a32");
      px(-2, -5, 4, 3, "#6b4528");
      px(-1, -8, 2, 4, "#c47a3a");
      px(-2, step ? 1 : 0, 1, 2, "#5c3a22");
    } else if (animal.kind === "deer") {
      px(-5, -4, 10, 5, "#c4a06a");
      px(-3, -8, 6, 4, "#a8844e");
      px(-2, -6, 4, 2, "#f7f4ee");
      px(-4, -11, 1, 3, "#efe6d4");
      px(3, -11, 1, 3, "#efe6d4");
      px(-3, step ? 1 : 0, 2, 4, "#8a6840");
      px(1, step ? 0 : 1, 2, 4, "#8a6840");
    } else {
      const flap = Math.sin((time || 0) * 14) > 0 ? 4 : 2;
      px(-2, -2, 4, 3, "#4e6274");
      px(-2 - flap, -1, flap, 2, "#8aa0b4");
      px(2, -1, flap, 2, "#8aa0b4");
      px(-1, -4, 2, 2, "#3a4a58");
    }
    } finally {
      if (animal.kind === "deer") ctx.restore();
    }
  }

  function drawBoar(ctx, boar) {
    const sx = Math.round(boar.x - view.camX);
    const sy = Math.round(boar.y - view.camY);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(2, 2);
    ctx.translate(-sx, -sy);
    if (boar.state === "down") {
      ctx.fillStyle = "#5a341c";
      ctx.fillRect(sx - 8, sy - 4, 16, 6);
      ctx.fillStyle = "#3a2214";
      ctx.fillRect(sx - 8, sy - 2, 4, 4);
      ctx.fillStyle = "#e7e2d4";
      ctx.fillRect(sx - 7, sy - 1, 1, 2);
      ctx.fillRect(sx - 5, sy, 1, 2);
      ctx.restore();
      return;
    }
    const step = Math.floor(Date.now() / 140) % 2;
    const dir = boar.dir || "right";
    if (dir === "down" || dir === "up") {
      const box = (rx, ry, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(sx + rx, sy + ry, w, h);
      };
      if (dir === "down") {
        box(-5, -5, 10, 6, "#6b3a1e");
        box(-4, -8, 8, 4, "#8a4e28");
        box(-5, -9, 3, 3, "#4a2c18");
        box(2, -9, 3, 3, "#4a2c18");
        box(-3, -7, 2, 2, "#f2efe4");
        box(1, -7, 2, 2, "#f2efe4");
        box(-1, -6, 2, 2, "#c47a52");
        box(-4, -4, 3, 2, "#3a2418");
        box(1, -4, 3, 2, "#3a2418");
        box(-4, step ? 1 : 0, 2, 3, "#3a2418");
        box(2, step ? 0 : 1, 2, 3, "#3a2418");
      } else {
        box(-5, -5, 10, 6, "#6b3a1e");
        box(-4, -7, 8, 3, "#5a341c");
        box(-3, -8, 2, 2, "#4a2c18");
        box(1, -8, 2, 2, "#4a2c18");
        box(-1, -2, 2, 2, "#c47a52");
        box(-4, step ? 1 : 0, 2, 3, "#3a2418");
        box(2, step ? 0 : 1, 2, 3, "#3a2418");
      }
      ctx.fillStyle = "rgba(24, 42, 18, 0.25)";
      ctx.fillRect(sx - 4, sy + 3, 8, 2);
      ctx.restore();
    } else {
    const face = dir === "left" ? -1 : 1;
    const px = (rx, ry, w, h, color) => {
      ctx.fillStyle = color;
      const x0 = face > 0 ? sx + rx : sx - rx - w;
      ctx.fillRect(x0, sy + ry, w, h);
    };
    px(-6, -5, 12, 6, "#6b3a1e");
    px(-5, -6, 8, 2, "#8a4e28");
    px(4, -4, 4, 3, "#c47a52");
    px(7, -3, 2, 2, "#3a2418");
    px(5, -6, 1, 2, "#f2efe4");
    px(3, -6, 1, 2, "#f2efe4");
    px(-2, -7, 2, 2, "#4a2c18");
    px(-1, step ? -1 : 1, 2, 3, "#3a2418");
    px(-5, step ? 1 : -1, 2, 3, "#3a2418");
    ctx.fillStyle = "rgba(24, 42, 18, 0.25)";
    ctx.fillRect(sx - 5, sy + 3, 10, 2);
    ctx.restore();
    }
    const bar = Math.max(0, Math.round(20 * (boar.energy / tune.boarEnergy)));
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(sx - 11, sy - 28, 22, 4);
    ctx.fillStyle = boar.energy > 30 ? "#c45a2a" : "#d24a3a";
    if (bar) ctx.fillRect(sx - 10, sy - 27, bar, 2);
  }

  function drawDuck(ctx, time, bird) {
    bird = bird || duck;
    if (!bird || bird.state === "gone" || (bird.state === "down" && bird.sink > 1.15)) return;
    const sunk = bird.state === "down" ? bird.sink : 0;
    ctx.save();
    ctx.globalAlpha = sunk > 0.45 ? Math.max(0, 1 - (sunk - 0.45) / 0.7) : 1;
    const bob = bird.state === "swim" && Math.sin(time * 2.2 + bird.ang) > 0 ? 0 : 1;
    const cx = Math.round(bird.x - view.camX);
    const cy = Math.round(bird.y - view.camY + bob + sunk * 5);
    const face = bird.face ? 1 : -1;
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

  function growWeapon(ctx, sx, sy, draw) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1.5, 1.5);
    ctx.translate(-sx, -sy);
    draw();
    ctx.restore();
  }

  function facingAngle(dir) {
    return {
      right: 0,
      downright: Math.PI / 4,
      down: Math.PI / 2,
      downleft: (Math.PI * 3) / 4,
      left: Math.PI,
      upleft: (-Math.PI * 3) / 4,
      up: -Math.PI / 2,
      upright: -Math.PI / 4,
    }[dir] ?? Math.PI / 2;
  }

  function drawPistol(ctx, x, y, dir, flash) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    growWeapon(ctx, sx, sy, () => drawPistolAt(ctx, sx, sy, dir, flash));
  }

  function drawPistolAt(ctx, sx, sy, dir, flash) {
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
    growWeapon(ctx, sx, sy, () => drawNetAt(ctx, sx, sy, dir, swing));
  }

  function drawNetAt(ctx, sx, sy, dir, swing) {
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

  function drawSword(ctx, x, y, dir, sweep) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const face = facingAngle(dir);
    const t = sweep > 0 ? 1 - sweep / 0.28 : 0;
    const sign = Math.cos(face) >= 0 ? 1 : -1;
    const start = face - sign * 1.25;
    const ang = start + sign * 2.5 * t;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1.5, 1.5);
    if (sweep > 0) {
      ctx.strokeStyle = "rgba(244, 247, 251, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 9, start, ang, sign < 0);
      ctx.stroke();
    }
    ctx.rotate(ang);
    ctx.fillStyle = "#6e4324";
    ctx.fillRect(-2, -2, 4, 3);
    ctx.fillStyle = "#9aa3ad";
    ctx.fillRect(1, -1, 2, 2);
    ctx.fillStyle = "#d5dbe3";
    ctx.fillRect(3, -1, 8, 2);
    ctx.fillStyle = "#f4f7fb";
    ctx.fillRect(10, -1, 2, 2);
    ctx.restore();
  }

  function drawMeat(ctx, x, y, kind, source) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const cooked = kind === "roast";
    ctx.fillStyle = cooked ? "#6a2e22" : (source === "uni" ? "#f4f1ea" : "#c47a6a");
    ctx.fillRect(sx - 4, sy - 3, 9, 6);
    ctx.fillStyle = cooked ? "#3a1c14" : (source === "uni" ? "#f4b6d8" : "#e8c0b4");
    ctx.fillRect(sx - 3, sy - 2, 7, 1);
    ctx.fillRect(sx - 3, sy + 1, 7, 1);
  }

  function drawHeldWeapon(ctx, bob) {
    const active = activeWeapon();
    if (active === "raw" || active === "roast") {
      const hand = handAnchor(bob);
      drawMeat(ctx, hand.x, hand.y, active, "boar");
      return;
    }
    const item = itemOf(player, active) || (player.netHeld && player.netHeld[active] > 0
      ? { anim: 0, fromX: player.x, fromY: player.y }
      : null);
    if (!item) return;
    const pos = heldItemPos(item, bob);
    if (active === "net") drawNet(ctx, pos.x, pos.y, player.dir, player.flash > 0);
    else if (active === "sword") drawSword(ctx, pos.x, pos.y, player.dir, player.slash || 0);
    else drawPistol(ctx, pos.x, pos.y, player.dir, player.flash > 0);
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

  function drawUnicornFrontHead(ctx, sx, sy, maneColor) {
    const body = "#f7f8ff";
    const shade = "#d5d8ea";
    const mane = maneColor || "#f4b6d8";
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

  function drawDeadUnicorn(ctx, x, y, maneColor) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const body = "#f7f8ff";
    const shade = "#d5d8ea";
    const mane = maneColor || "#f4b6d8";
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

  function drawUnicorn(ctx, x, y, dir, gallop, maneColor) {
    const sx = Math.round(x - view.camX);
    const sy = Math.round(y - view.camY);
    const body = "#f7f8ff";
    const shade = "#d5d8ea";
    const mane = maneColor || "#f4b6d8";
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
    drawUnicornFrontHead(ctx, sx, sy, mane);
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
    if (mounted && mountKind === "boar") {
      const boar = (player.ride && boars.indexOf(player.ride) >= 0)
        ? player.ride
        : boars.find((one) => one.rider === player);
      if (boar) drawBoar(ctx, boar);
      drawSeated(ctx, visual.sprite, player.x, player.y + 8, player.dir);
      drawHeldWeapon(ctx, 0);
    } else if (mounted) {
      const gallop = player.moving ? Math.floor(player.phase / 2) % 2 : 0;
      drawUnicorn(ctx, player.x, player.y, player.dir, gallop, unicorn && unicorn.mane);
      drawSeated(ctx, visual.sprite, player.x, player.y, player.dir);
      if (player.dir === "down") {
        drawUnicornFrontHead(ctx, Math.round(player.x - view.camX), Math.round(player.y - view.camY), unicorn && unicorn.mane);
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
    drawEnergy(ctx);
  }

  function drawEnergy(ctx) {
    const sx = Math.round(player.x - view.camX) - 8;
    const sy = Math.round(player.y - view.camY) - (mounted ? 36 : 32);
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(sx - 1, sy - 1, 18, 5);
    const w = Math.max(0, Math.round(16 * (player.energy / tune.energy)));
    ctx.fillStyle = player.energy > 30 ? "#7dce4a" : "#d24a3a";
    if (w) ctx.fillRect(sx, sy, w, 3);
  }

  function drawStove(ctx, x, y) {
    const stove = stoveSpot();
    const sx = Math.round(stove.x - view.camX);
    const sy = Math.round(stove.y - view.camY);
    ctx.fillStyle = "#4a3428";
    ctx.fillRect(sx - 10, sy - 8, 20, 16);
    ctx.fillStyle = "#6b4a32";
    ctx.fillRect(sx - 8, sy - 6, 16, 10);
    ctx.fillStyle = "#2a2420";
    ctx.fillRect(sx - 6, sy - 4, 5, 4);
    ctx.fillRect(sx + 1, sy - 4, 5, 4);
    ctx.fillStyle = "#e07030";
    ctx.fillRect(sx - 5, sy - 3, 3, 2);
    ctx.fillStyle = "#f2d04a";
    ctx.fillRect(sx - 2, sy + 2, 8, 4);
    ctx.fillStyle = "#c4483a";
    ctx.fillRect(sx - 1, sy + 3, 6, 2);
    ctx.fillStyle = "#f7f3ea";
    ctx.fillRect(sx + 4, sy + 1, 3, 3);
  }

  function drawCookStove(ctx) {
    const stove = cookStove();
    const sx = Math.round(stove.x - view.camX);
    const sy = Math.round(stove.y - view.camY);
    ctx.fillStyle = "#3a3e46";
    ctx.fillRect(sx - 12, sy - 10, 24, 18);
    ctx.fillStyle = "#5c646e";
    ctx.fillRect(sx - 10, sy - 8, 20, 12);
    ctx.fillStyle = "#2a2420";
    ctx.fillRect(sx - 8, sy - 6, 6, 5);
    ctx.fillRect(sx + 2, sy - 6, 6, 5);
    ctx.fillStyle = "#e07030";
    ctx.fillRect(sx - 7, sy - 5, 4, 2);
    ctx.fillRect(sx + 3, sy - 5, 4, 2);
    ctx.fillStyle = "#c4483a";
    ctx.fillRect(sx - 6, sy + 2, 12, 4);
    ctx.fillStyle = "#f2d04a";
    ctx.fillRect(sx - 4, sy + 3, 8, 2);
    ctx.fillStyle = "#f7f3ea";
    ctx.font = "bold 6px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("MIĘSO", sx, sy - 14);
  }

  function drawRawCarry(ctx, who) {
    const sx = Math.round(who.x - view.camX);
    const sy = Math.round(who.y - view.camY - 16);
    ctx.fillStyle = "rgba(24, 42, 18, 0.28)";
    ctx.fillRect(sx - 6, sy + 6, 14, 3);
    if (who.carry.kind === "uni") {
      ctx.fillStyle = "#f4f1ea";
      ctx.fillRect(sx - 7, sy - 3, 14, 7);
      ctx.fillStyle = who.carry.body.mane || "#f4b6d8";
      ctx.fillRect(sx - 7, sy - 5, 6, 3);
    } else {
      ctx.fillStyle = "#6b3a1e";
      ctx.fillRect(sx - 7, sy - 3, 14, 7);
      ctx.fillStyle = "#e7c2b0";
      ctx.fillRect(sx - 2, sy - 1, 5, 3);
    }
  }

  function present() {
    screen.imageSmoothingEnabled = false;
    screen.fillStyle = "#172014";
    screen.fillRect(0, 0, canvas.width, canvas.height);
    screen.imageSmoothingEnabled = false;
    const pw = view.w * view.pixel;
    const ph = view.h * view.pixel;
    const mid = Math.floor(canvas.width / 2);
    const oy = view.oy;
    screen.drawImage(low, 0, oy, pw, ph);
    if (playerCount === 2 && !joined && !netRole) {
      screen.drawImage(low2, mid, oy, pw, ph);
      screen.fillStyle = "#f0e2b8";
      screen.fillRect(mid - 1, 0, 3, canvas.height);
      screen.font = "700 16px Segoe UI, sans-serif";
      screen.fillStyle = "#24331c";
      screen.fillRect(mid + 12, oy + 8, 168, 26);
      screen.fillStyle = "#f2d04a";
      screen.fillText("Gracz 2: " + actors[1].gold + " · " + energyPct(actors[1].energy, tune.energy) + "%", mid + 18, oy + 26);
    }
    drawRadar();
    drawControlCards();
  }

  function drawPhonePocket() {
    const who = localActor();
    const order = ["gun", "net", "sword", "raw", "roast"];
    const dpr = canvas.width / Math.max(1, window.innerWidth);
    const slot = Math.round(36 * dpr);
    const border = Math.max(2, Math.round(3 * dpr));
    const width = order.length * slot;
    const x0 = Math.round((canvas.width - width) / 2);
    const y0 = canvas.height - Math.round(18 * dpr) - slot;
    const active = netRole === "guest" && who.netHeld ? who.weapon : (hasKind(who, who.weapon) ? who.weapon : "");
    screen.fillStyle = "#14210f";
    screen.fillRect(x0 - border, y0 - border, width + border * 2, slot + border * 2);
    screen.strokeStyle = "#f0e2b8";
    screen.lineWidth = border;
    screen.strokeRect(x0 - border / 2, y0 - border / 2, width + border, slot + border);
    order.forEach((kind, index) => {
      const count = netRole === "guest" && who.netHeld
        ? (who.netHeld[kind] || 0)
        : (kind === "raw" || kind === "roast"
          ? pocketOf(who)[kind]
          : gear.filter((item) => item.kind === kind && item.holder === who).length);
      const x = x0 + index * slot;
      const chosen = kind === active && count;
      screen.fillStyle = chosen ? "#f2d04a" : "#1a2616";
      screen.fillRect(x, y0, slot, slot);
      if (chosen) {
        screen.fillStyle = "#6a4e08";
        const inset = Math.max(3, Math.round(4 * dpr));
        screen.fillRect(x + inset, y0 + inset, slot - inset * 2, slot - inset * 2);
      }
      if (index > 0) {
        screen.fillStyle = "#f0e2b8";
        screen.fillRect(x, y0, border, slot);
      }
      if (!count) return;
      drawPocketIcon(kind, x, y0, slot);
      if (count > 1) {
        screen.fillStyle = "#f2d04a";
        screen.font = "700 " + Math.round(11 * dpr) + "px Segoe UI, sans-serif";
        screen.textAlign = "right";
        screen.textBaseline = "alphabetic";
        screen.fillText(String(count), x + slot - 3, y0 + slot - 3);
      }
    });
  }

  function drawPocketIcon(kind, x, y, slot) {
    const m = Math.round(slot * 0.22);
    const s = slot - m * 2;
    screen.save();
    screen.translate(x + m, y + m);
    if (kind === "gun") {
      screen.fillStyle = "#6b4a2a";
      screen.fillRect(s * 0.15, s * 0.42, s * 0.7, s * 0.22);
      screen.fillRect(s * 0.62, s * 0.28, s * 0.28, s * 0.16);
      screen.fillStyle = "#2a2118";
      screen.fillRect(s * 0.28, s * 0.58, s * 0.16, s * 0.28);
    } else if (kind === "net") {
      screen.strokeStyle = "#d7c9a2";
      screen.lineWidth = Math.max(2, s * 0.08);
      screen.beginPath();
      screen.arc(s * 0.38, s * 0.36, s * 0.24, 0, Math.PI * 2);
      screen.stroke();
      screen.beginPath();
      screen.moveTo(s * 0.55, s * 0.52);
      screen.lineTo(s * 0.82, s * 0.86);
      screen.stroke();
    } else if (kind === "sword") {
      screen.fillStyle = "#d5d8df";
      screen.fillRect(s * 0.42, s * 0.05, s * 0.16, s * 0.62);
      screen.fillStyle = "#f2d04a";
      screen.fillRect(s * 0.28, s * 0.66, s * 0.44, s * 0.12);
      screen.fillStyle = "#6b4a2a";
      screen.fillRect(s * 0.44, s * 0.78, s * 0.12, s * 0.18);
    } else if (kind === "raw") {
      screen.fillStyle = "#8a3d3d";
      screen.fillRect(s * 0.18, s * 0.32, s * 0.64, s * 0.36);
      screen.fillStyle = "#e7c2b0";
      screen.fillRect(s * 0.38, s * 0.4, s * 0.22, s * 0.18);
    } else {
      screen.fillStyle = "#6b3a1e";
      screen.fillRect(s * 0.16, s * 0.3, s * 0.68, s * 0.38);
      screen.fillStyle = "#f2d04a";
      screen.fillRect(s * 0.34, s * 0.38, s * 0.28, s * 0.16);
    }
    screen.restore();
  }

  function drawControlCards() {
    if (document.body.classList.contains("phone")) {
      drawPhonePocket();
      return;
    }
    const dpr = canvas.width / Math.max(1, window.innerWidth);
    const font = Math.round(14 * dpr);
    const lineH = Math.round(18 * dpr);
    const pad = Math.round(8 * dpr);
    const margin = Math.round(14 * dpr);
    const keyboard = [
      "Gracz 1 — klawiatura",
      "WASD lub strzałki — chodzenie",
      "Shift — bieg",
      "Lewy klik — idź w miejsce",
      "E — podnieś, wsiądź albo zsiądź",
      "Q — zmień broń",
      "G — odłóż broń na ziemię",
      "F — zjedz wybrane mięso",
      "Spacja lub prawy przycisk — strzał albo jedzenie",
      "M — włącz lub wyłącz muzykę",
    ];
    const gamepad = [
      "Gracz 2 — pad",
      "Lewy drążek lub krzyżak — chodzenie",
      "LB lub LT — bieg",
      "A — podnieś, wsiądź albo zsiądź",
      "Y — zmień broń",
      "B — odłóż broń na ziemię",
      "LB — zjedz wybrane mięso",
      "X, RB lub RT — strzał",
    ];
    screen.font = "700 " + font + "px Segoe UI, sans-serif";
    screen.textAlign = "left";
    screen.textBaseline = "alphabetic";
    const card = (lines, x, y) => {
      let width = 0;
      for (const text of lines) width = Math.max(width, screen.measureText(text).width);
      const height = lines.length * lineH;
      screen.fillStyle = "rgba(20, 33, 15, 0.9)";
      screen.fillRect(x, y, width + pad * 2, height + pad * 2);
      screen.strokeStyle = "#f0e2b8";
      screen.lineWidth = Math.max(2, Math.round(2 * dpr));
      screen.strokeRect(x, y, width + pad * 2, height + pad * 2);
      lines.forEach((text, i) => {
        screen.fillStyle = i === 0 ? "#f2d04a" : "#f6f1e3";
        screen.fillText(text, x + pad, y + pad + (i + 1) * lineH - Math.round(4 * dpr));
      });
      return width + pad * 2;
    };
    const bottom = canvas.height - margin;
    const h1 = keyboard.length * lineH + pad * 2;
    const bag1 = bagLines(actors[0]);
    const bag2 = bagLines(actors[1]);
    const bagH = (lines) => lines.length * lineH + pad * 2;
    if (playerCount === 2 && !joined) {
      const mid = Math.floor(canvas.width / 2);
      card(bag1, margin, bottom - h1 - margin - bagH(bag1));
      card(keyboard, margin, bottom - h1);
      const top = view.oy + Math.round(44 * dpr);
      const padH = gamepad.length * lineH + pad * 2;
      card(gamepad, mid + margin, top);
      card(bag2, mid + margin, top + padH + margin);
    } else if (playerCount === 2) {
      const used = card(keyboard, margin, bottom - h1);
      card(bag1, margin, bottom - h1 - margin - bagH(bag1));
      const h2 = gamepad.length * lineH + pad * 2;
      const x2 = margin + used + margin;
      card(gamepad, x2, bottom - h2);
      card(bag2, x2, bottom - h2 - margin - bagH(bag2));
    } else {
      card(bag1, margin, bottom - h1 - margin - bagH(bag1));
      card(keyboard, margin, bottom - h1);
    }
  }

  function bagLines(who) {
    const names = { gun: "Pistolet", net: "Łapacz", sword: "Miecz", raw: "Mięso", roast: "Pieczeń" };
    const order = ["gun", "net", "sword", "raw", "roast"];
    const active = hasKind(who, who.weapon) ? who.weapon : "";
    const lines = ["Kieszeń"];
    let any = false;
    for (const kind of order) {
      const count = kind === "raw" || kind === "roast"
        ? pocketOf(who)[kind]
        : gear.filter((item) => item.kind === kind && item.holder === who).length;
      if (!count) continue;
      any = true;
      const label = count > 1 ? names[kind] + " ×" + count : names[kind];
      lines.push((kind === active ? "► " : "   ") + label);
    }
    if (!any) lines.push("pusto");
    return lines;
  }

  function drawRadar() {
    if (!radarMap || !house) return;
    const dpr = canvas.width / Math.max(1, window.innerWidth);
    const phone = document.body.classList.contains("phone");
    const mapW = Math.round((phone ? 86 : 210) * dpr);
    const mapH = Math.round(mapW * (WORLD_H / WORLD_W));
    const margin = Math.round((phone ? 6 : 16) * dpr);
    const ox = canvas.width - margin - mapW;
    const oy = phone ? margin + Math.round(12 * dpr) : canvas.height - margin - mapH;
    const ring = Math.max(2, Math.round(3 * dpr));
    screen.fillStyle = "#14210f";
    screen.fillRect(ox - ring, oy - ring, mapW + ring * 2, mapH + ring * 2);
    screen.strokeStyle = "#f0e2b8";
    screen.lineWidth = ring;
    screen.strokeRect(ox - ring, oy - ring, mapW + ring * 2, mapH + ring * 2);
    screen.imageSmoothingEnabled = true;
    screen.drawImage(radarMap, ox, oy, mapW, mapH);
    if (fogMap) {
      screen.imageSmoothingEnabled = false;
      screen.drawImage(fogMap, ox, oy, mapW, mapH);
    }
    const spot = (wx, wy) => ({
      x: ox + (wx / WORLD_W) * mapW,
      y: oy + (wy / WORLD_H) * mapH,
    });
    const home = spot(house.x, house.y);
    const houseSeen = seen && seen[Math.floor(house.y / TILE) * COLS + Math.floor(house.x / TILE)];
    const box = Math.max(3, Math.round(4 * dpr));
    if (houseSeen) {
      screen.fillStyle = "#f0e2b8";
      screen.fillRect(home.x - box, home.y - box, box * 2, box * 2);
      screen.fillStyle = "#8d3b32";
      screen.fillRect(home.x - box + 1, home.y - box + 1, box * 2 - 2, box * 2 - 2);
    }
    const angles = {
      right: 0,
      downright: Math.PI / 4,
      down: Math.PI / 2,
      downleft: (Math.PI * 3) / 4,
      left: Math.PI,
      upleft: (-Math.PI * 3) / 4,
      up: -Math.PI / 2,
      upright: -Math.PI / 4,
    };
    const people = livePeople();
    const colors = ["#3e8ec0", "#d4654a", "#6aaa4a"];
    people.forEach((actor, index) => {
      const at = actor.indoors ? home : spot(actor.x, actor.y);
      drawRadarArrow(at.x, at.y, angles[actor.dir] || Math.PI / 2, colors[index], dpr);
    });
    screen.fillStyle = "#f0e2b8";
    screen.font = "700 " + Math.round(13 * dpr) + "px Segoe UI, sans-serif";
    screen.textAlign = "center";
    screen.fillText("N", ox + mapW / 2, oy - ring - Math.round(2 * dpr));
    screen.textAlign = "left";
  }

  function drawRadarArrow(x, y, angle, color, dpr) {
    const tip = Math.round(7 * dpr);
    const back = Math.round(5 * dpr);
    const side = Math.round(4 * dpr);
    screen.save();
    screen.translate(x, y);
    screen.rotate(angle);
    screen.fillStyle = "#14210f";
    screen.beginPath();
    screen.moveTo(tip + 1, 0);
    screen.lineTo(-back, side + 1);
    screen.lineTo(-back + 2, 0);
    screen.lineTo(-back, -side - 1);
    screen.closePath();
    screen.fill();
    screen.fillStyle = color;
    screen.beginPath();
    screen.moveTo(tip, 0);
    screen.lineTo(-back + 1, side);
    screen.lineTo(-back + 3, 0);
    screen.lineTo(-back + 1, -side);
    screen.closePath();
    screen.fill();
    screen.restore();
  }

  function render(time) {
    if (netRole) {
      const who = localActor();
      useActor(who);
      view.camX = player.camX;
      view.camY = player.camY;
      const ctx = low.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      renderPane(ctx, time);
      keepActor();
      present();
      return;
    }
    const count = playerCount === 2 && !joined ? 2 : 1;
    for (let i = 0; i < count; i++) {
      useActor(actors[i]);
      view.camX = player.camX;
      view.camY = player.camY;
      const ctx = (i === 0 ? low : low2).getContext("2d");
      ctx.imageSmoothingEnabled = false;
      renderPane(ctx, time);
      keepActor();
    }
    present();
  }

  function renderPane(ctx, time) {
    if (indoors) {
      ctx.fillStyle = "#1a1612";
      ctx.fillRect(0, 0, view.w, view.h);
      drawInterior(ctx);
      for (const butterfly of butterflies) {
        if (butterfly.inside && butterfly.state !== "fly") drawButterfly(ctx, butterfly, time);
      }
      for (const uni of unicorns) {
        if (!uni.inside || uni.state === "gone") continue;
        if (uni.state === "dead") drawDeadUnicorn(ctx, uni.x, uni.y, uni.mane);
        else drawUnicorn(ctx, uni.x, uni.y, "down", 0, uni.mane);
      }
      drawIndoorHeroes(ctx, time);
      for (const bullet of bullets) if (bullet.indoors) drawShot(ctx, bullet);
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
          const shore = osmMap() && wade[ty * COLS + tx] === 1;
          if (!shore) {
            const row = waterIndex[ty * COLS + tx];
            if (row >= 0) ctx.drawImage(waterSheet, frame * TILE, row * TILE, TILE, TILE, px, py, TILE, TILE);
          }
        } else if (decorAt(tx, ty) === DECOR.REED) drawReed(ctx, px, py, time, tx * 0.7 + ty);
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

    const visibleWoods = woodsInView();
    for (const tree of visibleWoods) {
      if (!tree.sprite) continue;
      ellipse(
        ctx,
        Math.round(tree.x - view.camX),
        Math.round(tree.y - view.camY),
        tree.sprite.shadowRX || 4,
        tree.sprite.shadowRY || 2,
        "rgba(24, 42, 18, 0.28)"
      );
    }

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

    drawMarker(ctx, time);

    const drawables = [];
    for (const prop of props) {
      if (prop.x < view.camX - 48 || prop.y < view.camY - 64) continue;
      if (prop.x > view.camX + view.w + 48 || prop.y > view.camY + view.h + 48) continue;
      drawables.push(prop);
    }
    for (const piece of gear) {
      if (!piece.held) drawables.push({ gear: piece, x: piece.x, y: piece.y });
    }
    for (const uni of unicorns) {
      if (uni.state === "gone" || uni.state === "carried" || uni.rider || uni.inside) continue;
      drawables.push({ uni, x: uni.x, y: uni.y });
    }
    for (const boar of boars) {
      if (boar.state === "gone" || boar.state === "carried" || boar.rider) continue;
      drawables.push({ boar, x: boar.x, y: boar.y });
    }
    const birds = [];
    for (const animal of fauna) {
      if (animal.state === "gone" || animal.state === "carried") continue;
      if (animal.kind === "bird" && animal.state === "roam") {
        birds.push(animal);
        continue;
      }
      drawables.push({ animal, x: animal.x, y: animal.y });
    }
    for (const tree of visibleWoods) {
      if (!tree.sprite) continue;
      drawables.push({ wood: tree, x: tree.x, y: tree.y });
    }
    drawables.push({ house: true, x: house.x, y: house.y - 8 });
    for (const spot of places) {
      const sy = spot.y + (spot.foot || -8);
      if (spot.x < view.camX - 160 || sy < view.camY - 180) continue;
      if (spot.x > view.camX + view.w + 160 || sy > view.camY + view.h + 80) continue;
      drawables.push({ spot, x: spot.x, y: sy });
    }
    for (const butterfly of butterflies) {
      if (butterfly.state === "ground" && !butterfly.inside) drawables.push({ rest: butterfly, x: butterfly.x, y: butterfly.y });
    }
    for (const who of actors) {
      if (who.asleep) continue;
      if (!netRole && playerCount !== 2 && who.pad) continue;
      if (who.indoors) continue;
      drawables.push({ hero: who, x: who.x, y: who.y });
    }
    drawables.sort((a, b) => a.y - b.y || a.x - b.x);
    const camera = player;
    for (const item of drawables) {
      if (item.hero) drawOneHero(ctx, item.hero, time);
      else if (item.boar) drawBoar(ctx, item.boar);
      else if (item.animal) drawFauna(ctx, item.animal, time);
      else if (item.uni) {
        if (item.uni.state === "dead") drawDeadUnicorn(ctx, item.uni.x, item.uni.y, item.uni.mane);
        else drawUnicorn(ctx, item.uni.x, item.uni.y, item.uni.dir || "down", Math.sin(time * 6) > 0 ? 1 : 0, item.uni.mane);
      }
      else if (item.wood) drawSprite(ctx, item.wood.sprite, item.wood.x, item.wood.y, 0);
      else if (item.house) drawHouse(ctx);
      else if (item.spot) drawSpot(ctx, item.spot);
      else if (item.duck) drawDuck(ctx, time, item);
      else if (item.gear) {
        const bob = Math.sin(time * 3 + item.gear.x) > 0 ? -1 : 0;
        const gx = item.gear.x;
        const gy = item.gear.y + bob;
        if (item.gear.kind === "net") drawNet(ctx, gx, gy, "right", false);
        else if (item.gear.kind === "sword") drawSword(ctx, gx, gy, "right", false);
        else if (item.gear.kind === "raw" || item.gear.kind === "roast") drawMeat(ctx, gx, gy, item.gear.kind, item.gear.source);
        else drawPistol(ctx, gx, gy, "right", false);
        if (Math.hypot(gx - player.x, item.gear.y - player.y) < 36) {
          ctx.fillStyle = "#fff4cc";
          const sx = Math.round(gx - view.camX);
          const sy = Math.round(gy - view.camY - 8);
          ctx.fillRect(sx, sy, 1, 1);
          ctx.fillRect(sx - 1, sy + 2, 1, 1);
          ctx.fillRect(sx + 1, sy + 2, 1, 1);
        }
      } else if (item.rest) drawButterfly(ctx, item.rest, time);
      else drawSprite(ctx, item.sprite, item.x, item.y, 0);
    }

    for (const bird of birds) drawFauna(ctx, bird, time);

    for (const mote of motes) {
      ctx.globalAlpha = Math.max(0, mote.life * 2.6);
      ctx.fillStyle = "#a08050";
      ctx.fillRect(Math.round(mote.x - view.camX), Math.round(mote.y - view.camY), 1, 1);
    }
    ctx.globalAlpha = 1;

    for (const bullet of bullets) if (!bullet.indoors) drawShot(ctx, bullet);

    for (const butterfly of butterflies) {
      if (butterfly.state === "fly" || (butterfly.state === "fall" && !butterfly.inside)) drawButterfly(ctx, butterfly, time);
    }

  }

  function drawOneHero(ctx, who, time) {
    const camera = player;
    const savedCamX = view.camX;
    const savedCamY = view.camY;
    useActor(who);
    view.camX = savedCamX;
    view.camY = savedCamY;
    const visual = currentVisual(time);
    ellipse(
      ctx,
      Math.round(who.x - view.camX),
      Math.round(who.y - view.camY),
      mounted ? 12 : visual.bob ? 4 : 5,
      mounted ? 4 : 2,
      "rgba(24, 42, 18, 0.33)"
    );
    drawActor(ctx, visual);
    useActor(camera);
    view.camX = savedCamX;
    view.camY = savedCamY;
  }

  function drawIndoorHeroes(ctx, time) {
    for (const who of actors) {
      if (who.asleep) continue;
      if (!netRole && playerCount !== 2 && who.pad) continue;
      if (!who.indoors) continue;
      drawOneHero(ctx, who, time);
    }
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
    const mid = playerCount === 2 && !joined ? canvas.width / 2 : canvas.width;
    if (bx < 0 || by < view.oy || bx >= mid) return null;
    if (by >= view.oy + view.h * view.pixel) return null;
    return {
      x: clamp(bx / view.pixel + actors[0].camX, 10, WORLD_W - 10),
      y: clamp((by - view.oy) / view.pixel + actors[0].camY, 10, WORLD_H - 10),
    };
  }

  function bindInput() {
    const arm = () => sfx.arm();
    startGuestGame = () => choosePlayers(2);
    function wantsPhone() {
      if (new URLSearchParams(location.search).has("phone")) return true;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      return coarse && Math.min(window.innerWidth, window.innerHeight) < 900;
    }

    function syncPhone() {
      const want = wantsPhone();
      const wide = window.innerWidth >= window.innerHeight;
      const landscape = window.matchMedia("(orientation: landscape)").matches || wide;
      const portrait = want && !landscape;
      phoneMode = want && landscape;
      document.body.classList.toggle("phone", want);
      if (want && !phoneScaleApplied) {
        phoneScaleApplied = true;
        scalePixel = 4;
      }
      const turn = document.getElementById("turn");
      if (turn) turn.hidden = !portrait;
      const split = document.getElementById("mode-split");
      if (split) split.hidden = want;
      const touch = document.getElementById("touch");
      if (touch) touch.hidden = !phoneMode || !playerCount;
      const title = document.querySelector(".hud .title");
      if (title) {
        title.textContent = want
          ? "Polowanie\nv146"
          : "Strzelanina na Łące w Tucznie u Taty i Zosi v146";
      }
      document.title = want ? "Polowanie v146" : "Strzelanina na Łące w Tucznie u Taty i Zosi v146";
      setMusic(musicOn);
      const boarButton = document.getElementById("boars-toggle");
      if (boarButton) {
        boarButton.textContent = want ? "🐗" : (boarsOn ? "Dziki: włączone" : "Dziki: wyłączone");
        boarButton.classList.toggle("off", want && !boarsOn);
        boarButton.hidden = netRole === "guest";
      }
      const saveButton = document.getElementById("save-game");
      if (saveButton) {
        saveButton.hidden = netRole === "guest";
        saveButton.textContent = want ? "💾" : "Zapis";
      }
      const savePick = document.getElementById("save-pick");
      if (savePick && netRole === "guest") savePick.hidden = true;
      if (want && (mapId === "plewiska" || mapId === "sehnde") && typeof pickMap === "function") pickMap("tuczno");
      updateScore();
    }

    function enterPhoneFullscreen() {
      if (!wantsPhone()) return;
      const el = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) return;
      Promise.resolve(req.call(el)).catch(() => {});
    }

    async function choosePlayers(count) {
      if (playerCount) return;
      if (wantsPhone() && count === 2 && netRole !== "host" && netRole !== "guest") return;
      enterPhoneFullscreen();
      playerCount = (netRole === "host" || netRole === "guest") ? 2 : (wantsPhone() ? 1 : (count === 2 ? 2 : 1));
      readTune();
      if (pendingSave && pendingSave.seed) netSeed = pendingSave.seed;
      else if (!netSeed) netSeed = Math.floor(Math.random() * 1000000000);
      if (pendingSave && pendingSave.tune) Object.assign(tune, pendingSave.tune);
      if (netTune) Object.assign(tune, netTune);
      actors[0].energy = tune.energy;
      actors[1].energy = tune.energy;
      actors[2].energy = tune.energy;
      const menu = document.getElementById("menu");
      if (menu) menu.hidden = true;
      showLoad(0);
      await waitFrame();
      const restoreRandom = installSeed(netSeed);
      try {
        if (treeSprites && bushSprites) await createWorld(treeSprites, bushSprites, showLoad);
      } finally {
        if (restoreRandom) restoreRandom();
      }
      if (boarsOn && boars.length < tune.boars) spawnBoars();
      if (pendingSave && pendingSave.state && netRole !== "guest") {
        netState = pendingSave.state;
        applyNetState();
        cutWoods.length = 0;
        if (pendingSave.state.cuts) {
          for (const row of pendingSave.state.cuts) cutWoods.push(row);
        }
        pendingSave = null;
        netLog("Wczytano zapis z tego urządzenia.");
      }
      hideLoad();
      sfx.arm();
      resize();
      updateCamera();
      hintMode = "";
      updateScore();
      refreshHint();
      if (!loopStarted) {
        loopStarted = true;
        requestAnimationFrame(loop);
      }
      syncPhone();
    }

    for (const input of document.querySelectorAll(".set input")) {
      const show = () => {
        const span = document.getElementById(input.id.replace("set-", "") + "-v");
        const map = {
          "set-run": "run-v",
          "set-energy": "energy-v",
          "set-boar-energy": "boar-energy-v",
          "set-boar-dmg": "boar-dmg-v",
          "set-regen": "regen-v",
          "set-return": "return-v",
          "set-flies": "flies-v",
          "set-ponds": "ponds-v",
          "set-ducks": "ducks-v",
          "set-boars": "boars-v",
          "set-foxes": "foxes-v",
          "set-squirrels": "squirrels-v",
          "set-deer": "deer-v",
          "set-birds": "birds-v",
        };
        const label = document.getElementById(map[input.id]);
        if (label) label.textContent = input.value;
      };
      input.addEventListener("input", show);
      show();
    }

    const pickMap = (id) => {
      mapId = id;
      for (const name of ["old", "tuczno", "plewiska", "sehnde", "poznan"]) {
        document.getElementById("map-" + name)?.classList.toggle("picked", mapId === name);
      }
    };
    document.getElementById("map-old")?.addEventListener("click", () => pickMap("old"));
    document.getElementById("map-tuczno")?.addEventListener("click", () => pickMap("tuczno"));
    document.getElementById("map-plewiska")?.addEventListener("click", () => pickMap("plewiska"));
    document.getElementById("map-sehnde")?.addEventListener("click", () => pickMap("sehnde"));
    document.getElementById("map-poznan")?.addEventListener("click", () => pickMap("poznan"));
    let gameMode = "solo";
    const pickMode = (mode) => {
      if (mode === "split" && wantsPhone()) mode = "solo";
      gameMode = mode;
      for (const name of ["solo", "split", "host", "join"]) {
        document.getElementById("mode-" + name)?.classList.toggle("picked", gameMode === name);
      }
      const setup = document.getElementById("setup");
      const join = document.getElementById("join-box");
      const brokers = document.getElementById("broker-choice");
      if (setup) setup.hidden = mode === "join";
      if (join) join.hidden = mode !== "join";
      if (brokers) brokers.hidden = mode !== "host";
    };
    document.getElementById("mode-solo")?.addEventListener("click", () => pickMode("solo"));
    document.getElementById("mode-split")?.addEventListener("click", () => pickMode("split"));
    document.getElementById("mode-host")?.addEventListener("click", () => pickMode("host"));
    document.getElementById("mode-join")?.addEventListener("click", () => pickMode("join"));
    const pickBroker = (name) => {
      netBroker = name;
      for (const id of ["broker-emqx", "broker-hivemq", "broker-webrtc", "broker-local", "join-broker-emqx", "join-broker-hivemq", "join-broker-webrtc", "join-broker-local"]) {
        const button = document.getElementById(id);
        if (button) button.classList.toggle("picked", id.endsWith(name));
      }
      const hostField = document.getElementById("broker-addr");
      const joinField = document.getElementById("join-broker-addr");
      if (hostField) hostField.hidden = name !== "local";
      if (joinField) joinField.hidden = name !== "local";
    };
    document.getElementById("broker-emqx")?.addEventListener("click", () => pickBroker("emqx"));
    document.getElementById("broker-hivemq")?.addEventListener("click", () => pickBroker("hivemq"));
    document.getElementById("broker-webrtc")?.addEventListener("click", () => pickBroker("webrtc"));
    document.getElementById("broker-local")?.addEventListener("click", () => pickBroker("local"));
    document.getElementById("join-broker-emqx")?.addEventListener("click", () => pickBroker("emqx"));
    document.getElementById("join-broker-hivemq")?.addEventListener("click", () => pickBroker("hivemq"));
    document.getElementById("join-broker-webrtc")?.addEventListener("click", () => pickBroker("webrtc"));
    document.getElementById("join-broker-local")?.addEventListener("click", () => pickBroker("local"));
    const failStart = (error) => {
      const menu = document.getElementById("menu");
      if (menu) menu.hidden = false;
      hideLoad();
      netLog("Start się nie udał: " + (error && error.message ? error.message : "błąd"));
      document.getElementById("net-log")?.classList.add("open");
    };
    const startRoom = (role) => {
      if (!netSelf) netSelf = "p" + Math.random().toString(36).slice(2, 10);
      if (mqttClient) {
        try { mqttClient.end(true); } catch (e) {}
        mqttClient = null;
      }
      netConn = null;
      netConns[0] = null;
      netConns[1] = null;
      if (netBroker === "webrtc") {
        if (typeof Peer !== "function") {
          netLog("Brak WebRTC. Odśwież stronę.");
          document.getElementById("net-log")?.classList.add("open");
          return false;
        }
        if (netPeer) netPeer.destroy();
        if (role === "host") {
          netPeer = new Peer(netCode);
          netPeer.on("open", () => netLog("Kod pokoju: " + netCode + " · WebRTC"));
          netPeer.on("connection", (conn) => {
            let slot = netConns.findIndex((open) => open && open.peer === conn.peer);
            if (slot < 0) slot = netConns.findIndex((open) => !open || !open.open);
            if (slot < 0) {
              netLog("Pokój pełny. Mogą dołączyć dwie osoby.");
              conn.close();
              return;
            }
            netConns[slot] = conn;
            conn.on("data", (msg) => takeGuestMsg(msg));
            conn.on("open", () => netLog("Dołączył gracz " + (slot + 2)));
          });
        } else {
          netPeer = new Peer();
          netPeer.on("open", () => {
            const conn = netPeer.connect(netCode, { reliable: true });
            netConn = conn;
            conn.on("open", () => {
              netLog("Połączono. Czekam na grę.");
              netUp({ type: "hello", id: netSelf });
            });
            conn.on("data", (msg) => takeHostMsg(msg));
          });
        }
        netPeer.on("error", (err) => {
          netLog("WebRTC: " + ((err && (err.type || err.message)) || "błąd"));
          document.getElementById("net-log")?.classList.add("open");
        });
        return true;
      }
      if (netBroker === "local") {
        const field = document.getElementById(role === "host" ? "broker-addr" : "join-broker-addr");
        let host = ((field && field.value) || "").trim();
        if (!host) host = location.hostname && location.hostname !== "gaschpl.github.io" ? location.hostname : "127.0.0.1";
        host = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!host.includes(":")) host += ":8777";
        if (location.protocol === "https:") {
          netLog("Ten komputer działa, gdy gra jest otwarta z adresu laptopa (http), nie z GitHuba.");
          document.getElementById("net-log")?.classList.add("open");
        }
        try { if (localSocket) localSocket.close(); } catch (e) {}
        localSocket = new WebSocket("ws://" + host + "/ws");
        localSocket.onopen = () => {
          localSocket.send(JSON.stringify({ join: netCode }));
          if (role === "host") netLog("Kod pokoju: " + netCode + " · ten komputer");
          else {
            netLog("Połączono. Czekam na grę.");
            netUp({ type: "hello", id: netSelf });
          }
        };
        localSocket.onmessage = (event) => {
          let data = null;
          try { data = JSON.parse(event.data); } catch (e) { return; }
          if (!data || !data.msg) return;
          if (role === "host") takeGuestMsg(data.msg);
          else takeHostMsg(data.msg);
        };
        localSocket.onerror = () => {
          netLog("Brak serwera na tym komputerze. Uruchom scripts/room_broker.py.");
          document.getElementById("net-log")?.classList.add("open");
        };
        return true;
      }
      if (typeof mqtt === "undefined") {
        netLog("Brak połączenia sieciowego. Oba urządzenia muszą mieć internet.");
        document.getElementById("net-log")?.classList.add("open");
        return false;
      }
      if (!netSelf) netSelf = "p" + Math.random().toString(36).slice(2, 10);
      if (mqttClient) {
        try { mqttClient.end(true); } catch (e) {}
        mqttClient = null;
      }
      const brokers = {
        emqx: "wss://broker.emqx.io:8084/mqtt",
        hivemq: "wss://broker.hivemq.com:8884/mqtt",
      };
      const url = brokers[netBroker] || brokers.emqx;
      mqttClient = mqtt.connect(url, {
        clientId: netSelf,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 8000,
      });
      mqttClient.on("connect", () => {
        mqttClient.subscribe(role === "host" ? "polowanie/" + netCode + "/up" : "polowanie/" + netCode + "/down");
        if (role === "host") netLog("Kod pokoju: " + netCode + " · " + (netBroker === "hivemq" ? "HiveMQ" : "EMQX"));
        else {
          netLog("Połączono. Czekam na grę.");
          netUp({ type: "hello", id: netSelf });
        }
      });
      mqttClient.on("message", (_topic, payload) => {
        let msg = null;
        try { msg = JSON.parse(payload.toString()); } catch (e) { return; }
        if (role === "host") takeGuestMsg(msg);
        else takeHostMsg(msg);
      });
      mqttClient.on("error", () => {
        netLog("Serwer nie odpowiada. Wybierz drugi przy zakładaniu pokoju.");
        document.getElementById("net-log")?.classList.add("open");
      });
      return true;
    };
    const openRoom = () => {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      netCode = "";
      for (let i = 0; i < 4; i++) netCode += alphabet[Math.floor(Math.random() * alphabet.length)];
      guestIds[0] = null;
      guestIds[1] = null;
      netRole = "host";
      if (!(pendingSave && pendingSave.seed)) netSeed = Math.floor(Math.random() * 1000000000);
      else netSeed = pendingSave.seed;
      readTune();
      return startRoom("host");
    };
    document.getElementById("play")?.addEventListener("click", () => {
      const menu = document.getElementById("menu");
      if (gameMode === "host" && !openRoom()) return;
      if (gameMode !== "host") netRole = "";
      if (menu) menu.hidden = true;
      showLoad(0);
      const count = gameMode === "solo" ? 1 : 2;
      choosePlayers(count).catch(failStart);
    });
    document.getElementById("save-game")?.addEventListener("click", () => {
      if (!playerCount || netRole === "guest") return;
      const box = document.getElementById("save-pick");
      if (!box) return;
      box.hidden = !box.hidden;
      fillSaveButtons();
    });
    document.getElementById("save-pick")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-slot]");
      if (!button || !playerCount || netRole === "guest") return;
      const slot = Number(button.dataset.slot);
      const saves = readSaves();
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const name = pad(now.getDate()) + "." + pad(now.getMonth() + 1) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());
      saves[slot] = {
        name,
        mapId,
        seed: netSeed,
        tune,
        state: packNet(),
        mode: netRole === "host" ? "host" : (playerCount === 2 ? "split" : "solo"),
      };
      while (saves.length < 3) saves.push(null);
      saves.length = 3;
      localStorage.setItem("polowanie-saves", JSON.stringify(saves));
      document.getElementById("save-pick").hidden = true;
      fillContinue();
      netLog("Zapis " + (slot + 1) + ": " + name);
      document.getElementById("net-log")?.classList.add("open");
    });
    const readSaves = () => {
      try {
        const raw = JSON.parse(localStorage.getItem("polowanie-saves") || "null");
        if (Array.isArray(raw)) return raw;
      } catch (e) {}
      try {
        const old = JSON.parse(localStorage.getItem("polowanie-save") || "null");
        if (old && old.seed) return [Object.assign({ name: "wcześniejszy" }, old), null, null];
      } catch (e) {}
      return [null, null, null];
    };
    const fillSaveButtons = () => {
      const saves = readSaves();
      document.querySelectorAll("#save-pick [data-slot]").forEach((button) => {
        const item = saves[Number(button.dataset.slot)];
        button.textContent = (Number(button.dataset.slot) + 1) + (item && item.name ? " " + item.name : " pusty");
      });
    };
    const fillContinue = () => {
      const box = document.getElementById("continue-slots");
      if (!box) return;
      box.innerHTML = "";
      readSaves().forEach((item, index) => {
        if (!item || !item.seed) return;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Kontynuuj " + (item.name || (index + 1));
        button.addEventListener("click", () => {
          pendingSave = item;
          if (item.mapId) pickMap(item.mapId);
          const mode = item.mode === "host" ? "host" : item.mode === "split" ? "split" : "solo";
          pickMode(mode);
          netLog("Wybierz serwer i naciśnij Graj. Zapis nie trzyma starego serwera.");
          document.getElementById("net-log")?.classList.add("open");
        });
        box.appendChild(button);
      });
    };
    fillContinue();
    const refreshKicks = () => {
      const one = document.getElementById("kick-2");
      const two = document.getElementById("kick-3");
      const host = netRole === "host";
      if (one) one.hidden = !(host && guestIds[0]);
      if (two) two.hidden = !(host && guestIds[1]);
    };
    const kickSlot = (index) => {
      const id = guestIds[index];
      if (!id || netRole !== "host") return;
      kickedIds.add(id);
      guestIds[index] = null;
      actors[index + 1].asleep = true;
      netDown({ type: "kick", id });
      refreshKicks();
      netLog("Wyrzucono gracza " + (index + 2) + ".");
    };
    document.getElementById("kick-2")?.addEventListener("click", () => kickSlot(0));
    document.getElementById("kick-3")?.addEventListener("click", () => kickSlot(1));
    setInterval(refreshKicks, 1000);
    document.getElementById("net-log-btn")?.addEventListener("click", () => {
      const box = document.getElementById("net-log");
      const button = document.getElementById("net-log-btn");
      if (!box) return;
      const open = box.classList.toggle("open");
      if (button) button.setAttribute("aria-pressed", open ? "true" : "false");
    });
    const joinNet = () => {
      enterPhoneFullscreen();
      const input = document.getElementById("net-code-input");
      const typed = (input && input.value || "").trim().toUpperCase();
      if (typed) netCode = typed;
      if (!netCode) {
        netLog("Wpisz kod pokoju.");
        return;
      }
      netLog("Łączę z kodem " + netCode + "…");
      sfx.arm();
      netRole = "guest";
      netSeated = false;
      const boarButton = document.getElementById("boars-toggle");
      if (boarButton) boarButton.hidden = true;
      const saveButton = document.getElementById("save-game");
      if (saveButton) saveButton.hidden = true;
      startRoom("guest");
    };
    document.getElementById("net-join")?.addEventListener("click", () => joinNet());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (netRole === "guest" && netCode && (!mqttClient || !mqttClient.connected)) joinNet();
    });
    syncPhone();
    window.addEventListener("resize", syncPhone);
    window.addEventListener("orientationchange", syncPhone);
    const landscapeQuery = window.matchMedia("(orientation: landscape)");
    if (landscapeQuery.addEventListener) landscapeQuery.addEventListener("change", syncPhone);

    window.addEventListener("keydown", (event) => {
      arm();
      const key = event.key.toLowerCase();
      if (!playerCount) {
        const typing = event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
        if (!typing) {
          if (key === "1") pickMode("solo");
          if (key === "2" && !wantsPhone()) pickMode("split");
          if (key === "3") pickMode("host");
          if (key === "4") pickMode("join");
        }
        return;
      }
      if (netRole === "guest") {
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
        keys.add(key);
        if (key === " ") netPulse.fire = true;
        if (key === "e") netPulse.act = true;
        if (key === "q") netPulse.weapon = true;
        return;
      }
      if ((key === " " || key === "e") && event.repeat) {
        if (key === " ") event.preventDefault();
        return;
      }
      if (key === "m") {
        if (!event.repeat) setMusic(!musicOn);
        return;
      }
      if (key === "q") {
        const who = actors[0];
        if (!event.repeat) cycleHeld(who);
        return;
      }
      if (key === "g") {
        if (!event.repeat) dropActive(actors[0]);
        return;
      }
      if (key === "f") {
        if (!event.repeat) {
          useActor(actors[0]);
          eatMeat();
          keepActor();
        }
        return;
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      keys.add(key);
      if (key === "e") {
        useActor(actors[0]);
        pickupNearby();
        keepActor();
      }
      if (key === " ") actors[0].shootQueued = true;
    });
    window.addEventListener("keyup", (event) => {
      keys.delete(event.key.toLowerCase());
    });
    window.addEventListener("blur", () => keys.clear());

    canvas.addEventListener("pointerdown", (event) => {
      sfx.arm();
      if (phoneMode) return;
      if (event.button === 2) {
        event.preventDefault();
        actors[0].shootQueued = true;
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      const point = worldFromEvent(event);
      if (!point) return;
      pointerDown = true;
      actors[0].target = point;
      canvas.setPointerCapture(event.pointerId);
    }, { passive: false });

    canvas.addEventListener("pointermove", (event) => {
      if (!pointerDown) return;
      const point = worldFromEvent(event);
      if (point) actors[0].target = point;
    });

    const release = () => {
      pointerDown = false;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    const musicButton = document.getElementById("music");
    if (musicButton) {
      const scale = document.getElementById("scale");
      if (scale) {
        scale.addEventListener("input", () => {
          scalePixel = Math.max(1, Math.min(8, Math.round(Number(scale.value))));
          resize();
          if (playerCount === 2 && joined) shareCamera();
          else {
            for (const who of actors) {
              useActor(who);
              updateCamera();
              keepActor();
            }
          }
        });
      }
      musicButton.addEventListener("click", () => {
        sfx.arm();
        setMusic(!musicOn);
        musicButton.blur();
      });
      const boarButton = document.getElementById("boars-toggle");
      boarButton?.addEventListener("click", () => {
        if (netRole === "guest") return;
        setBoars(!boarsOn);
        boarButton.blur();
      });
    }
    window.addEventListener("resize", () => {
      resize();
      updateCamera();
    });

    const stickEl = document.getElementById("stick");
    const knob = document.getElementById("stick-knob");
    const placeKnob = (clientX, clientY) => {
      if (!stickEl || !knob) return;
      const rect = stickEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = rect.width * 0.34;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(max, len);
      dx = (dx / len) * clamped;
      dy = (dy / len) * clamped;
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      const nx = dx / max;
      const ny = dy / max;
      touchStick.x = Math.abs(nx) < 0.18 ? 0 : nx;
      touchStick.y = Math.abs(ny) < 0.18 ? 0 : ny;
    };
    const clearStick = () => {
      touchStick.x = 0;
      touchStick.y = 0;
      if (knob) knob.style.transform = "translate(0px,0px)";
    };
    if (stickEl) {
      stickEl.addEventListener("pointerdown", (event) => {
        if (!phoneMode) return;
        event.preventDefault();
        sfx.arm();
        stickEl.setPointerCapture(event.pointerId);
        placeKnob(event.clientX, event.clientY);
      });
      stickEl.addEventListener("pointermove", (event) => {
        if (!stickEl.hasPointerCapture(event.pointerId)) return;
        placeKnob(event.clientX, event.clientY);
      });
      stickEl.addEventListener("pointerup", clearStick);
      stickEl.addEventListener("pointercancel", clearStick);
    }
    const hold = (id, down) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.addEventListener("pointerdown", (event) => {
        if (!phoneMode) return;
        event.preventDefault();
        sfx.arm();
        button.setPointerCapture(event.pointerId);
        down(true);
      });
      const up = () => down(false);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
    };
    hold("touch-run", (on) => {
      touchRun = on;
    });
    hold("touch-fire", (on) => {
      if (!on) return;
      if (netRole === "guest") netPulse.fire = true;
      else actors[0].shootQueued = true;
    });
    document.getElementById("touch-act")?.addEventListener("pointerdown", (event) => {
      if (!phoneMode) return;
      event.preventDefault();
      sfx.arm();
      if (netRole === "guest") {
        netPulse.act = true;
        return;
      }
      useActor(actors[0]);
      pickupNearby();
      keepActor();
    });
    document.getElementById("touch-weapon")?.addEventListener("pointerdown", (event) => {
      if (!phoneMode) return;
      event.preventDefault();
      sfx.arm();
      if (netRole === "guest") {
        netPulse.weapon = true;
        return;
      }
      cycleHeld(actors[0]);
    });
  }

  function loop(time) {
    const seconds = time / 1000;
    if (!loop.last) loop.last = time;
    const dt = Math.min(0.05, (time - loop.last) / 1000);
    loop.last = time;
    loop.frames = (loop.frames || 0) + 1;
    if (!loop.fpsAt) loop.fpsAt = time;
    if (time - loop.fpsAt >= 500) {
      const fps = Math.round(loop.frames * 1000 / (time - loop.fpsAt));
      const el = document.getElementById("fps");
      if (el) {
        el.textContent = netRole === "guest" && netRtt >= 0
          ? "FPS " + fps + "\n" + netRtt + " ms"
          : "FPS " + fps;
      }
      loop.frames = 0;
      loop.fpsAt = time;
    }
    update(dt, seconds);
    render(seconds);
    requestAnimationFrame(loop);
  }

  bindInput();
  resize();
  function tintSprite(sprite, swaps) {
    const c = document.createElement("canvas");
    c.width = sprite.c.width;
    c.height = sprite.c.height;
    const g = c.getContext("2d");
    g.drawImage(sprite.c, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const key = data[i] + "," + data[i + 1] + "," + data[i + 2];
      const to = swaps[key];
      if (!to) continue;
      data[i] = to[0];
      data[i + 1] = to[1];
      data[i + 2] = to[2];
    }
    g.putImageData(img, 0, 0);
    return { c, ax: sprite.ax, ay: sprite.ay };
  }

  function tintPack(pack, swaps) {
    const out = {};
    for (const dir of Object.keys(pack)) {
      const group = pack[dir];
      out[dir] = {
        idle: tintSprite(group.idle, swaps),
        blink: tintSprite(group.blink, swaps),
        walk: group.walk.map((frame) => tintSprite(frame, swaps)),
      };
    }
    return out;
  }

  chars = bakeCharacters();
  actors[1].sprites = tintPack(chars, {
    "62,142,192": [212, 101, 74],
    "44,104,148": [156, 62, 48],
    "142,196,228": [240, 168, 130],
  });
  actors[2].sprites = tintPack(chars, {
    "62,142,192": [92, 150, 72],
    "44,104,148": [52, 96, 44],
    "142,196,228": [186, 214, 150],
  });
  treeSprites = [0, 1, 2].map(bakeTree);
  pineSprites = [0, 1, 2].map(bakePine);
  bushSprites = [0, 1, 2].map(bakeBush);
})();

function showError(err) {
  const pre = document.createElement("pre");
  pre.className = "error";
  pre.textContent = String((err && err.stack) || err);
  document.body.appendChild(pre);
}
