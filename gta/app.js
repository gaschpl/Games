(() => {
  const NARA_MAP = window.POZNAN_TILEMAP;
  const TRASA_MAP = window.TRASA_OPENSITE_MAP;
  const SEHNDE_MAP = window.SEHNDE_MAP;
  if (!NARA_MAP && !TRASA_MAP) {
    alert('Brak danych mapy w data/poznan-tilemap.js lub data/trasa-opensite-karpia.js!');
    return;
  }

  let activeMapKey = 'naramowicka'; // 'naramowicka' | 'trasa' | 'sehnde'
  function usesSectorMap() {
    return activeMapKey === 'trasa' || activeMapKey === 'sehnde';
  }
  let mapData = NARA_MAP || TRASA_MAP;
  let WORLD_W = mapData.meta.gridWidth || mapData.meta.worldWidth || 500;
  let WORLD_H = mapData.meta.gridHeight || mapData.meta.worldHeight || 500;
  let GRID = WORLD_W;
  const BASE_TILE_PX = 16;

  function decodeUint8(b64) {
    if (!b64) return null;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  let groundGrid = decodeUint8(mapData.groundBase64);
  let heightGrid = decodeUint8(mapData.heightBase64);
  let styleGrid = decodeUint8(mapData.styleBase64);

  const GROUND = {
    URBAN_PAVED: 0,
    GRASS: 1,
    WATER: 2,
    COBBLESTONE: 3,
    SIDEWALK: 4,
    ROAD_ASPHALT: 5,
    ROAD_COBBLE: 6,
    TRAM_TRACK: 7,
  };

  const GROUND_NAMES = {
    0: 'Teren Miejski / Parking',
    1: 'Zieleń / Park (Trawa)',
    2: 'Woda / Staw (Kolizja)',
    3: 'Plac / Deptak (Kostka)',
    4: 'Chodnik / Alejka',
    5: 'Jezdnia (Asfalt)',
    6: 'Ulica Osiedlowa (Kostka)',
    7: 'Torowisko Tramwajowe MPK',
  };

  const BLDG_PALETTES = {
    1: {
      name: 'Zabudowa Niska / Dom',
      roof: '#7d3a2c', roofInner: '#6b3024', edge: '#b56753',
      wallLit: '#d4a36a', wallDark: '#9e7242', window: '#1e2c3a', windowLit: '#f2d16b',
    },
    2: {
      name: 'Blok Osiedlowy (Winogrady)',
      roof: '#4a5259', roofInner: '#3e454b', edge: '#8c969e',
      wallLit: '#b8c9a7', wallDark: '#829472', window: '#1c2833', windowLit: '#ffe380',
    },
    3: {
      name: 'Budynek Ceglany / Kamienica',
      roof: '#662b25', roofInner: '#54221d', edge: '#99473e',
      wallLit: '#b55445', wallDark: '#82382c', window: '#1b2229', windowLit: '#f5c856',
    },
    4: {
      name: 'Wieżowiec / Blok (Wielka Płyta)',
      roof: '#454b52', roofInner: '#393e44', edge: '#7a838f',
      wallLit: '#a8b0ba', wallDark: '#757c87', window: '#22364a', windowLit: '#99d6ff',
    },
    5: {
      name: 'Naramowicka 47 (Cel)',
      roof: '#2d6e59', roofInner: '#235947', edge: '#f0e6c8',
      wallLit: '#f2e8c9', wallDark: '#bfb086', window: '#1a222b', windowLit: '#ffd86b',
    },
    6: {
      name: 'Szkoła / Kościół / Obiekt Publiczny',
      roof: '#3a6152', roofInner: '#2e4f42', edge: '#b59072',
      wallLit: '#c9886b', wallDark: '#915b43', window: '#1a1c29', windowLit: '#ffcf70',
    },
    7: {
      name: 'Pawilon Handlowy / Garaże',
      roof: '#59534f', roofInner: '#47423f', edge: '#8c827a',
      wallLit: '#cfb68a', wallDark: '#9c855e', window: '#26211c', windowLit: '#ffe07d',
    },
  };

  // --- 1. Initialize WebGL Context & Shaders (Pure WebGL like Map 1 & trasa-app.js!) ---
  const canvas = document.getElementById('game-canvas');
  const labelCanvas = document.getElementById('label-canvas');
  const lctx = labelCanvas.getContext('2d');

  const gl = canvas.getContext('webgl', {
    alpha: false,
    depth: true,
    antialias: true,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    alert('Twoja przeglądarka nie obsługuje WebGL!');
    return;
  }

  // --- 2A. 1x1 km Sector Ground Baker for Map 2 (Trasa Opensite -> Kicin -> Karpia 21A) ---
  // Exact 1:1 implementation from trasa-app.js: bakes each 500x500 unit (1x1 km) sector ONCE
  // into a 4096x4096 WebGL texture with mipmaps (8.192 px/unit — identical to Naramowicka 47!)
  const SECTOR_UNITS = 500;
  const SECTOR_TEX_PX = 4096;
  const SECTOR_SCALE = SECTOR_TEX_PX / SECTOR_UNITS;

  function getPtsBBox(pts, pad = 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }

  function boxesOverlap(a, b) {
    return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
  }

  let landuseWithBBox = [];
  let roadsWithBBox = [];
  let tramsWithBBox = [];
  let bldgsWithBBox = [];
  let trasaAnchors = [];
  let trasaRoutePts = [];
  let trasaCorrRad = 25;
  let globalOverview = null;
  const sectorCache = new Map();

  const bakeCanvas = document.createElement('canvas');
  bakeCanvas.width = SECTOR_TEX_PX;
  bakeCanvas.height = SECTOR_TEX_PX;
  const bctx = bakeCanvas.getContext('2d');

  function createPattern(size, drawFn) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    drawFn(ctx, size);
    return bctx.createPattern(c, 'repeat');
  }

  // Exact same 3 patterns used by both Map 1 and trasa-app.js!
  const sharedUrbanPattern = createPattern(32, (c, s) => {
    c.fillStyle = '#33363d'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#2e3138'; c.fillRect(0, 0, 16, 16); c.fillRect(16, 16, 16, 16);
    c.fillStyle = '#393c44'; c.fillRect(4, 6, 3, 3); c.fillRect(20, 22, 3, 3);
  });

  const sharedGrassPattern = createPattern(32, (c, s) => {
    c.fillStyle = '#2b4724'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#33542b';
    for (let y = 0; y < s; y += 8) {
      for (let x = (y % 16 === 0 ? 0 : 4); x < s; x += 8) {
        c.fillRect(x, y, 3, 3);
      }
    }
    c.fillStyle = '#233b1d';
    c.fillRect(6, 10, 3, 2); c.fillRect(22, 26, 3, 2);
  });

  const sharedPlazaPattern = createPattern(24, (c, s) => {
    c.fillStyle = '#5e564b'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#4f483e';
    c.fillRect(0, 0, s, 2); c.fillRect(0, 12, s, 2);
    c.fillRect(0, 0, 2, 12); c.fillRect(12, 12, 2, 12);
  });

  function clearSectorCache() {
    for (const entry of sectorCache.values()) {
      gl.deleteTexture(entry.tex);
      gl.deleteBuffer(entry.vbo);
    }
    sectorCache.clear();
  }

  function getOrBakeSector(secX, secY) {
    const key = `${secX}_${secY}`;
    if (sectorCache.has(key)) {
      return sectorCache.get(key);
    }

    const originX = secX * SECTOR_UNITS;
    const originY = secY * SECTOR_UNITS;
    const secBBox = {
      minX: originX,
      maxX: originX + SECTOR_UNITS,
      minY: originY,
      maxY: originY + SECTOR_UNITS,
    };

    const S = SECTOR_SCALE; // 8.192 px per unit (exact match to Naramowicka 47!)
    const toPxX = (wx) => (wx - originX) * S;
    const toPxY = (wy) => (wy - originY) * S;

    bctx.fillStyle = '#0c0e13';
    bctx.fillRect(0, 0, SECTOR_TEX_PX, SECTOR_TEX_PX);

    bctx.fillStyle = sharedUrbanPattern;
    bctx.strokeStyle = sharedUrbanPattern;
    bctx.lineCap = 'round';
    bctx.lineJoin = 'round';

    for (const a of trasaAnchors) {
      bctx.beginPath();
      bctx.arc(toPxX(a.x), toPxY(a.y), a.radiusUnits * S, 0, Math.PI * 2);
      bctx.fill();
    }
    if (trasaRoutePts.length >= 2) {
      bctx.beginPath();
      bctx.moveTo(toPxX(trasaRoutePts[0][0]), toPxY(trasaRoutePts[0][1]));
      for (let i = 1; i < trasaRoutePts.length; i++) {
        bctx.lineTo(toPxX(trasaRoutePts[i][0]), toPxY(trasaRoutePts[i][1]));
      }
      bctx.lineWidth = trasaCorrRad * 2 * S;
      bctx.stroke();
    }

    // Layer 1: Smooth Vector Landuse Polygons
    for (const area of landuseWithBBox) {
      if (!boxesOverlap(area.bbox, secBBox)) continue;
      bctx.beginPath();
      bctx.moveTo(toPxX(area.pts[0][0]), toPxY(area.pts[0][1]));
      for (let i = 1; i < area.pts.length; i++) {
        bctx.lineTo(toPxX(area.pts[i][0]), toPxY(area.pts[i][1]));
      }
      bctx.closePath();

      if (area.kind === 'grass' || area.kind === 'forest') {
        bctx.fillStyle = sharedGrassPattern;
        bctx.fill();
        bctx.strokeStyle = '#22381c';
        bctx.lineWidth = 2;
        bctx.stroke();
      } else if (area.kind === 'water') {
        bctx.fillStyle = '#1d4d75';
        bctx.fill();
        bctx.strokeStyle = '#3674a8';
        bctx.lineWidth = 3;
        bctx.stroke();
      } else if (area.kind === 'plaza') {
        bctx.fillStyle = sharedPlazaPattern;
        bctx.fill();
      } else if (area.kind === 'paved') {
        bctx.fillStyle = '#3b3e46';
        bctx.fill();
      }
    }

    function strokeRoadPath(pts) {
      bctx.beginPath();
      bctx.moveTo(toPxX(pts[0][0]), toPxY(pts[0][1]));
      for (let i = 1; i < pts.length; i++) {
        bctx.lineTo(toPxX(pts[i][0]), toPxY(pts[i][1]));
      }
      bctx.stroke();
    }

    const sectorRoads = roadsWithBBox.filter((r) => boxesOverlap(r.bbox, secBBox));

    // Layer 2A: Smooth Footways
    bctx.lineCap = 'round';
    bctx.lineJoin = 'round';
    for (const r of sectorRoads) {
      if (r.kind !== 'footway') continue;
      bctx.strokeStyle = '#43464d';
      bctx.lineWidth = (r.w + 0.45) * S;
      strokeRoadPath(r.pts);
      bctx.strokeStyle = '#686b73';
      bctx.lineWidth = r.w * S;
      strokeRoadPath(r.pts);
    }

    // Layer 2B: Outer Curb Shadow for Car Roads
    for (const r of sectorRoads) {
      if (r.kind === 'footway') continue;
      bctx.strokeStyle = '#1b1c21';
      bctx.lineWidth = (r.w + 2.1) * S;
      strokeRoadPath(r.pts);
    }

    // Layer 2C: Smooth Sidewalks along Car Roads
    for (const r of sectorRoads) {
      if (r.kind === 'footway') continue;
      bctx.strokeStyle = '#70737c';
      bctx.lineWidth = (r.w + 1.7) * S;
      strokeRoadPath(r.pts);
    }

    // Layer 2D: Inner Curb Edge
    for (const r of sectorRoads) {
      if (r.kind === 'footway') continue;
      bctx.strokeStyle = '#4e5159';
      bctx.lineWidth = (r.w + 0.35) * S;
      strokeRoadPath(r.pts);
    }

    // Layer 2E: Smooth Road Carriageway
    for (const r of sectorRoads) {
      if (r.kind === 'footway') continue;
      if (r.kind === 'cobble') {
        bctx.strokeStyle = '#423d3a';
      } else if (r.kind === 'plaza') {
        bctx.strokeStyle = '#5e564b';
      } else {
        bctx.strokeStyle = '#25272e';
      }
      bctx.lineWidth = r.w * S;
      strokeRoadPath(r.pts);
    }

    // Layer 2F: GTA 1 Style Road Lane Markings
    bctx.save();
    bctx.lineCap = 'butt';
    bctx.setLineDash([2.2 * S, 2.2 * S]);
    for (const r of sectorRoads) {
      if (!r.hasCenterLine && !r.isMainRoute) continue;
      bctx.strokeStyle = (r.isMainRoute || r.prio >= 5)
        ? 'rgba(235, 200, 90, 0.65)'
        : 'rgba(210, 215, 225, 0.50)';
      bctx.lineWidth = 0.22 * S;
      strokeRoadPath(r.pts);
    }
    bctx.restore();

    // Layer 3: Smooth Tram Tracks
    for (const tr of tramsWithBBox) {
      if (!boxesOverlap(tr.bbox, secBBox)) continue;
      bctx.strokeStyle = '#383634';
      bctx.lineWidth = 1.45 * S;
      strokeRoadPath(tr.pts);

      bctx.save();
      bctx.lineCap = 'butt';
      bctx.setLineDash([0.28 * S, 0.55 * S]);
      bctx.strokeStyle = '#544e46';
      bctx.lineWidth = 1.2 * S;
      strokeRoadPath(tr.pts);
      bctx.restore();

      bctx.strokeStyle = '#9aa4b2';
      bctx.lineWidth = 0.65 * S;
      strokeRoadPath(tr.pts);
      bctx.strokeStyle = '#383634';
      bctx.lineWidth = 0.35 * S;
      strokeRoadPath(tr.pts);
    }

    // Layer 4: Ambient Drop Shadows under 2.5D Buildings
    bctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    for (const b of bldgsWithBBox) {
      if (!boxesOverlap(b.bbox, secBBox)) continue;
      const shOff = Math.min(2.5, (b.floors || 3) * 0.35) * S;
      for (const ring of b.rings) {
        if (ring.length < 3) continue;
        bctx.beginPath();
        bctx.moveTo(toPxX(ring[0][0]) + shOff, toPxY(ring[0][1]) + shOff);
        for (let i = 1; i < ring.length; i++) {
          bctx.lineTo(toPxX(ring[i][0]) + shOff, toPxY(ring[i][1]) + shOff);
        }
        bctx.closePath();
        bctx.fill();
      }
    }

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bakeCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bldgAtlasTex);

    const x0 = originX, y0 = originY;
    const x1 = originX + SECTOR_UNITS, y1 = originY + SECTOR_UNITS;
    const quadVerts = new Float32Array([
      x0, y0, 0, 0, 0, 0, 0, 1, 1, 1,
      x1, y0, 0, 1, 0, 0, 0, 1, 1, 1,
      x1, y1, 0, 1, 1, 0, 0, 1, 1, 1,
      x0, y0, 0, 0, 0, 0, 0, 1, 1, 1,
      x1, y1, 0, 1, 1, 0, 0, 1, 1, 1,
      x0, y1, 0, 0, 1, 0, 0, 1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    if (sectorCache.size > 24) {
      const oldestKey = sectorCache.keys().next().value;
      const old = sectorCache.get(oldestKey);
      gl.deleteTexture(old.tex);
      gl.deleteBuffer(old.vbo);
      sectorCache.delete(oldestKey);
    }

    const entry = { tex, vbo };
    sectorCache.set(key, entry);
    return entry;
  }

  function buildGlobalOverview(mData) {
    const wW = mData.meta.worldWidth || 6583;
    const wH = mData.meta.worldHeight || 5261;
    const texSize = 2048;
    const gc = document.createElement('canvas');
    gc.width = texSize;
    gc.height = texSize;
    const ctx = gc.getContext('2d');

    ctx.fillStyle = '#0c0e13';
    ctx.fillRect(0, 0, texSize, texSize);

    ctx.save();
    ctx.scale(texSize / wW, texSize / wH);

    ctx.fillStyle = '#294522';
    ctx.strokeStyle = '#294522';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const a of trasaAnchors) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radiusUnits, 0, Math.PI * 2);
      ctx.fill();
    }
    if (trasaRoutePts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(trasaRoutePts[0][0], trasaRoutePts[0][1]);
      for (let i = 1; i < trasaRoutePts.length; i++) ctx.lineTo(trasaRoutePts[i][0], trasaRoutePts[i][1]);
      ctx.lineWidth = trasaCorrRad * 2;
      ctx.stroke();

      ctx.strokeStyle = '#25272e';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.strokeStyle = '#ffd15c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gc);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bldgAtlasTex);

    const quadVerts = new Float32Array([
      0, 0, -0.02, 0, 0, 0, 0, 1, 1, 1,
      wW, 0, -0.02, 1, 0, 0, 0, 1, 1, 1,
      wW, wH, -0.02, 1, 1, 0, 0, 1, 1, 1,
      0, 0, -0.02, 0, 0, 0, 0, 1, 1, 1,
      wW, wH, -0.02, 1, 1, 0, 0, 1, 1, 1,
      0, wH, -0.02, 0, 1, 0, 0, 1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    return { tex, vbo, overviewCanvas: gc };
  }

  function prepareTrasaVectorLayers(mData) {
    if (!mData || !mData.anchors) return;
    clearSectorCache();
    landuseWithBBox = (mData.vectorLanduse || []).map((a) => ({
      ...a,
      bbox: getPtsBBox(a.pts, 4),
    }));
    roadsWithBBox = (mData.vectorRoads || []).map((r) => ({
      ...r,
      bbox: getPtsBBox(r.pts, r.w + 4),
    }));
    tramsWithBBox = (mData.vectorTrams || []).map((t) => ({
      ...t,
      bbox: getPtsBBox(t.pts, 4),
    }));
    bldgsWithBBox = (mData.vectorBuildings || []).map((b) => ({
      ...b,
      bbox: getPtsBBox(b.rings[0] || [], 6),
    }));
    trasaAnchors = Object.values(mData.anchors);
    trasaRoutePts = mData.routePts || [];
    trasaCorrRad = mData.corridorRadiusUnits || 25;

    if (globalOverview) {
      gl.deleteTexture(globalOverview.tex);
      gl.deleteBuffer(globalOverview.vbo);
    }
    globalOverview = buildGlobalOverview(mData);

    // Pre-bake starting 1x1 km sector at Opensite (Tuczno)
    const sx = Math.floor(mData.anchors.opensite.x / SECTOR_UNITS);
    const sy = Math.floor(mData.anchors.opensite.y / SECTOR_UNITS);
    getOrBakeSector(sx, sy);
  }

  // --- 2B. Build Smooth High-Res Ground Texture (4096 x 4096) for Map 1 (Naramowicka 47) ---
  const GROUND_TEX_SIZE = 4096;

  let currentGroundCanvas = null;

  function buildSmoothGroundTexture() {
    const gc = document.createElement('canvas');
    if (usesSectorMap()) {
      gc.width = 4;
      gc.height = 4;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gc);
      return tex;
    }

    gc.width = GROUND_TEX_SIZE;
    gc.height = GROUND_TEX_SIZE;
    const ctx = gc.getContext('2d');

    const SCALE_X = GROUND_TEX_SIZE / WORLD_W;
    const SCALE_Y = GROUND_TEX_SIZE / WORLD_H;
    const SCALE = (SCALE_X + SCALE_Y) * 0.5;

    const urbanPattern = createPattern(32, (c, s) => {
      c.fillStyle = '#33363d'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#2e3138'; c.fillRect(0, 0, 16, 16); c.fillRect(16, 16, 16, 16);
      c.fillStyle = '#393c44'; c.fillRect(4, 6, 3, 3); c.fillRect(20, 22, 3, 3);
    });

    const grassPattern = createPattern(32, (c, s) => {
      c.fillStyle = '#2b4724'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#33542b';
      for (let y = 0; y < s; y += 8) {
        for (let x = (y % 16 === 0 ? 0 : 4); x < s; x += 8) {
          c.fillRect(x, y, 3, 3);
        }
      }
      c.fillStyle = '#233b1d';
      c.fillRect(6, 10, 3, 2); c.fillRect(22, 26, 3, 2);
    });

    const forestPattern = createPattern(32, (c, s) => {
      c.fillStyle = '#1e3318'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#152611';
      c.fillRect(4, 4, 10, 10); c.fillRect(18, 18, 10, 10);
      c.fillStyle = '#2b4a22';
      c.fillRect(6, 5, 6, 6); c.fillRect(20, 19, 6, 6);
    });

    const plazaPattern = createPattern(24, (c, s) => {
      c.fillStyle = '#5e564b'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#4f483e';
      c.fillRect(0, 0, s, 2); c.fillRect(0, 12, s, 2);
      c.fillRect(0, 0, 2, 12); c.fillRect(12, 12, 2, 12);
    });

    if (usesSectorMap() && mapData.anchors) {
      // Corridor & anchor circles (Trasa or Sehnde)
      ctx.fillStyle = '#0e1015';
      ctx.fillRect(0, 0, GROUND_TEX_SIZE, GROUND_TEX_SIZE);

      const anchors = Object.values(mapData.anchors);
      const routePts = mapData.routePts || [];
      const corrRad = mapData.corridorRadiusUnits || 25;

      ctx.fillStyle = grassPattern;
      ctx.strokeStyle = grassPattern;
      for (const a of anchors) {
        const r = a.radiusUnits;
        ctx.beginPath();
        ctx.ellipse(a.x * SCALE_X, a.y * SCALE_Y, r * SCALE_X, r * SCALE_Y, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (routePts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(routePts[0][0] * SCALE_X, routePts[0][1] * SCALE_Y);
        for (let i = 1; i < routePts.length; i++) {
          ctx.lineTo(routePts[i][0] * SCALE_X, routePts[i][1] * SCALE_Y);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = corrRad * 2 * SCALE;
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = urbanPattern;
      ctx.fillRect(0, 0, GROUND_TEX_SIZE, GROUND_TEX_SIZE);
    }

    for (const area of (mapData.vectorLanduse || [])) {
      if (area.pts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(area.pts[0][0] * SCALE_X, area.pts[0][1] * SCALE_Y);
      for (let i = 1; i < area.pts.length; i++) {
        ctx.lineTo(area.pts[i][0] * SCALE_X, area.pts[i][1] * SCALE_Y);
      }
      ctx.closePath();

      if (area.kind === 'forest') {
        ctx.fillStyle = forestPattern;
        ctx.fill();
      } else if (area.kind === 'grass') {
        ctx.fillStyle = grassPattern;
        ctx.fill();
        ctx.strokeStyle = '#22381c';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (area.kind === 'water') {
        ctx.fillStyle = '#1d4d75';
        ctx.fill();
        ctx.strokeStyle = '#3674a8';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (area.kind === 'plaza') {
        ctx.fillStyle = plazaPattern;
        ctx.fill();
      } else if (area.kind === 'paved') {
        ctx.fillStyle = '#3b3e46';
        ctx.fill();
      }
    }

    // Clip landuse to exact 500m circles & 50m corridor when on Trasa map
    if (usesSectorMap() && mapData.anchors) {
      const anchors = Object.values(mapData.anchors);
      const routePts = mapData.routePts || [];
      const corrRad = mapData.corridorRadiusUnits || 25;
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = GROUND_TEX_SIZE;
      maskCanvas.height = GROUND_TEX_SIZE;
      const mctx = maskCanvas.getContext('2d');
      mctx.fillStyle = '#ffffff';
      mctx.strokeStyle = '#ffffff';
      for (const a of anchors) {
        const r = a.radiusUnits;
        mctx.beginPath();
        mctx.ellipse(a.x * SCALE_X, a.y * SCALE_Y, r * SCALE_X, r * SCALE_Y, 0, 0, Math.PI * 2);
        mctx.fill();
      }
      if (routePts.length >= 2) {
        mctx.beginPath();
        mctx.moveTo(routePts[0][0] * SCALE_X, routePts[0][1] * SCALE_Y);
        for (let i = 1; i < routePts.length; i++) {
          mctx.lineTo(routePts[i][0] * SCALE_X, routePts[i][1] * SCALE_Y);
        }
        mctx.lineCap = 'round';
        mctx.lineJoin = 'round';
        mctx.lineWidth = corrRad * 2 * SCALE;
        mctx.stroke();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#0c0e13';
      ctx.fillRect(0, 0, GROUND_TEX_SIZE, GROUND_TEX_SIZE);
      ctx.restore();
    }

    function strokeRoadPath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * SCALE_X, pts[0][1] * SCALE_Y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * SCALE_X, pts[i][1] * SCALE_Y);
      }
      ctx.stroke();
    }

    const roads = mapData.vectorRoads || [];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of roads) {
      if (r.kind !== 'footway') continue;
      ctx.strokeStyle = '#43464d';
      ctx.lineWidth = Math.max(1.0, (r.w + 0.45) * SCALE);
      strokeRoadPath(r.pts);
      ctx.strokeStyle = '#686b73';
      ctx.lineWidth = Math.max(0.8, r.w * SCALE);
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway' || !r.hasSidewalk) continue;
      ctx.strokeStyle = '#1b1c21';
      ctx.lineWidth = Math.max(2.0, (r.w + 2.1) * SCALE);
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway' || !r.hasSidewalk) continue;
      ctx.strokeStyle = '#70737c';
      ctx.lineWidth = Math.max(1.8, (r.w + 1.7) * SCALE);
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway') continue;
      ctx.strokeStyle = r.isMainRoute ? '#595240' : '#4e5159';
      ctx.lineWidth = Math.max(1.6, (r.w + 0.35) * SCALE);
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway') continue;
      if (r.kind === 'cobble') {
        ctx.strokeStyle = '#423d3a';
      } else if (r.kind === 'plaza') {
        ctx.strokeStyle = '#5e564b';
      } else {
        ctx.strokeStyle = r.isMainRoute ? '#22252c' : '#25272e';
      }
      ctx.lineWidth = Math.max(1.3, r.w * SCALE);
      strokeRoadPath(r.pts);
    }

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.setLineDash([2.2 * SCALE, 2.2 * SCALE]);
    for (const r of roads) {
      if (!r.hasCenterLine && !r.isMainRoute) continue;
      ctx.strokeStyle = (r.prio >= 5 || r.isMainRoute) ? 'rgba(255, 215, 80, 0.80)' : 'rgba(210, 215, 225, 0.50)';
      ctx.lineWidth = Math.max(0.6, 0.24 * SCALE);
      strokeRoadPath(r.pts);
    }
    ctx.restore();

    for (const tr of (mapData.vectorTrams || [])) {
      if (tr.pts.length < 2) continue;
      ctx.strokeStyle = '#383634';
      ctx.lineWidth = Math.max(1.2, 1.45 * SCALE);
      strokeRoadPath(tr.pts);

      ctx.save();
      ctx.lineCap = 'butt';
      ctx.setLineDash([0.28 * SCALE, 0.55 * SCALE]);
      ctx.strokeStyle = '#544e46';
      ctx.lineWidth = Math.max(1.0, 1.2 * SCALE);
      strokeRoadPath(tr.pts);
      ctx.restore();

      ctx.strokeStyle = '#9aa4b2';
      ctx.lineWidth = Math.max(0.6, 0.65 * SCALE);
      strokeRoadPath(tr.pts);
      ctx.strokeStyle = '#383634';
      ctx.lineWidth = Math.max(0.3, 0.35 * SCALE);
      strokeRoadPath(tr.pts);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    for (const b of (mapData.vectorBuildings || [])) {
      const shOff = Math.min(2.5, (b.floors || 3) * 0.35) * SCALE;
      for (const ring of b.rings) {
        if (ring.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(ring[0][0] * SCALE_X + shOff, ring[0][1] * SCALE_Y + shOff);
        for (let i = 1; i < ring.length; i++) {
          ctx.lineTo(ring[i][0] * SCALE_X + shOff, ring[i][1] * SCALE_Y + shOff);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    currentGroundCanvas = gc;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gc);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);

    return tex;
  }

  // --- 3. Build Procedural Building & Vehicle Texture Atlas (512 x 256) ---
  // Columns 0..6: Building styles 1..7
  // Column 7: Vehicles & MPK Poznań Trams!
  const ATLAS_W = 512;
  const ATLAS_H = 256;
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_W;
  atlasCanvas.height = ATLAS_H;
  const actx = atlasCanvas.getContext('2d');
  actx.imageSmoothingEnabled = false;

  function putSubTile(slotX, slotY, drawFn) {
    const temp = document.createElement('canvas');
    temp.width = 16;
    temp.height = 16;
    const tctx = temp.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    drawFn(tctx, 16);

    const ox = slotX * 64 + 16;
    const oy = slotY * 64 + 16;
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        actx.drawImage(temp, ox + dx * 16, oy + dy * 16);
      }
    }
  }

  for (let st = 1; st <= 7; st++) {
    const pal = BLDG_PALETTES[st];
    putSubTile(st - 1, 0, (c, s) => {
      c.fillStyle = pal.roof; c.fillRect(0, 0, s, s);
      c.fillStyle = pal.roofInner;
      c.fillRect(0, 0, 8, 8); c.fillRect(8, 8, 8, 8);
      c.fillStyle = pal.edge;
      c.fillRect(2, 2, 2, 2);
    });

    putSubTile(st - 1, 1, (c, s) => {
      c.fillStyle = pal.wallLit; c.fillRect(0, 0, s, s);
      c.fillStyle = pal.edge; c.fillRect(0, 0, s, 2);
      c.fillStyle = pal.window;
      c.fillRect(2, 4, 5, 8);
      c.fillStyle = (st === 5 || st % 2 === 0) ? pal.windowLit : pal.window;
      c.fillRect(9, 4, 5, 8);
    });

    putSubTile(st - 1, 2, (c, s) => {
      c.fillStyle = pal.wallDark; c.fillRect(0, 0, s, s);
      c.fillStyle = pal.roofInner; c.fillRect(0, 0, s, 2);
      c.fillStyle = pal.window;
      c.fillRect(2, 4, 5, 8);
      c.fillRect(9, 4, 5, 8);
    });

    putSubTile(st - 1, 3, (c, s) => {
      c.fillStyle = pal.edge; c.fillRect(0, 0, s, s);
    });
  }

  // Column 7 (slotX = 7): Vehicle & Tram Textures!
  // (7, 0): MPK Poznań Tram Roof (Green + Yellow + White AC units)
  putSubTile(7, 0, (c, s) => {
    c.fillStyle = '#198744'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#f5c418';
    c.fillRect(0, 0, 2, s); c.fillRect(s - 2, 0, 2, s);
    c.fillStyle = '#d9e0e6';
    c.fillRect(5, 3, 6, 4);
    c.fillRect(5, 10, 6, 4);
  });

  // (7, 1): MPK Poznań Tram Side Wall (Green lower, Yellow belt, Dark panoramic windows)
  putSubTile(7, 1, (c, s) => {
    c.fillStyle = '#15753b'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#f5c418'; c.fillRect(0, 0, s, 3);
    c.fillStyle = '#f5c418'; c.fillRect(0, 10, s, 2);
    c.fillStyle = '#1b2836'; c.fillRect(1, 3, 6, 7);
    c.fillStyle = '#25394d'; c.fillRect(9, 3, 6, 7);
  });

  // (7, 2): GTA 1 Retro Car Roof (Windshield, Roof, Rear window)
  // Note: modulated by vertex shade/color in shader or distinct car variants
  putSubTile(7, 2, (c, s) => {
    c.fillStyle = '#d9dee6'; c.fillRect(0, 0, s, s);
    // Front & rear dark windshields
    c.fillStyle = '#1b2633';
    c.fillRect(2, 2, 12, 3);
    c.fillRect(2, 11, 12, 3);
    // Headlights at front (top of tile)
    c.fillStyle = '#fff599';
    c.fillRect(1, 0, 3, 1);
    c.fillRect(12, 0, 3, 1);
    // Taillights at back (bottom of tile)
    c.fillStyle = '#ff3333';
    c.fillRect(1, 15, 3, 1);
    c.fillRect(12, 15, 3, 1);
  });

  // (7, 3): Vehicle Side / Chassis Wall
  putSubTile(7, 3, (c, s) => {
    c.fillStyle = '#aeb6bf'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#1b2229';
    c.fillRect(2, 2, 12, 6);
    c.fillRect(2, 11, 4, 5);
    c.fillRect(10, 11, 4, 5);
  });

  const bldgAtlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bldgAtlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let groundTex = buildSmoothGroundTexture();

  // --- 4. Polygon Ear-Clipping Triangulator ---
  function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const v0x = cx - ax, v0y = cy - ay;
    const v1x = bx - ax, v1y = by - ay;
    const v2x = px - ax, v2y = py - ay;
    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;
    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01 + 1e-12);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    return u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6;
  }

  function triangulatePolygon(ring) {
    const n = ring.length;
    if (n < 3) return [];
    const pts = ring.map((p) => [p[0], p[1]]);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    if (area < 0) pts.reverse();

    const indices = pts.map((_, i) => i);
    const tris = [];
    let guard = 0;

    while (indices.length > 3 && guard++ < 2000) {
      let earFound = false;
      const len = indices.length;
      for (let i = 0; i < len; i++) {
        const iPrev = indices[(i + len - 1) % len];
        const iCurr = indices[i];
        const iNext = indices[(i + 1) % len];

        const [ax, ay] = pts[iPrev];
        const [bx, by] = pts[iCurr];
        const [cx, cy] = pts[iNext];

        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (cross <= 1e-7) continue;

        let hasPointInside = false;
        for (let j = 0; j < len; j++) {
          const idx = indices[j];
          if (idx === iPrev || idx === iCurr || idx === iNext) continue;
          const [px, py] = pts[idx];
          if (pointInTriangle(px, py, ax, ay, bx, by, cx, cy)) {
            hasPointInside = true;
            break;
          }
        }

        if (!hasPointInside) {
          tris.push([pts[iPrev], pts[iCurr], pts[iNext]]);
          indices.splice(i, 1);
          earFound = true;
          break;
        }
      }
      if (!earFound) {
        for (let i = 1; i < indices.length - 1; i++) {
          tris.push([pts[indices[0]], pts[indices[i]], pts[indices[i + 1]]]);
        }
        break;
      }
    }

    if (indices.length === 3) {
      tris.push([pts[indices[0]], pts[indices[1]], pts[indices[2]]]);
    }
    return tris;
  }

  // --- 5. Compile Shaders (Supports RGB Tint for Retro Cars & Trams!) ---
  // Vertex format: [x, y, z, u, v, slotX, slotY, rTint, gTint, bTint] -> 10 floats (40 bytes)
  const vsSource = `
    attribute vec3 a_pos;
    attribute vec2 a_uv;
    attribute vec2 a_slot;
    attribute vec3 a_tint;

    uniform vec2 u_cam;
    uniform vec2 u_resolution;
    uniform float u_tilePx;
    uniform float u_perspK;

    varying vec2 v_uv;
    varying vec2 v_slot;
    varying vec3 v_tint;
    varying vec2 v_worldPos;
    varying float v_height;

    void main() {
      v_uv = a_uv;
      v_slot = a_slot;
      v_tint = a_tint;
      v_worldPos = a_pos.xy;
      v_height = a_pos.z;

      vec2 baseRelPx = (a_pos.xy - u_cam) * u_tilePx;

      // GTA 1 2.5D radial perspective displacement proportional to height Z
      // Capped radial 2.5D perspective displacement so buildings on screen edges never stretch into tall pillars!
      float hFactor = max(0.0, a_pos.z) * 0.015 * u_perspK;
      float rLen = length(baseRelPx);
      float clampedLen = min(rLen, 280.0);
      vec2 radialDir = (rLen > 0.001) ? (baseRelPx / rLen) : vec2(0.0, 0.0);
      vec2 displacedPx = baseRelPx + radialDir * (clampedLen * hFactor);

      vec2 clipXY = displacedPx / (u_resolution * 0.5);
      float clipZ = 0.5 - (a_pos.z / 32.0);

      gl_Position = vec4(clipXY.x, -clipXY.y, clipZ, 1.0);
    }
  `;

  const fsSource = `
    precision mediump float;

    varying vec2 v_uv;
    varying vec2 v_slot;
    varying vec3 v_tint;
    varying vec2 v_worldPos;
    varying float v_height;

    uniform sampler2D u_groundTex;
    uniform sampler2D u_bldgTex;
    uniform float u_isGround;
    uniform float u_gridMode;
    uniform float u_collMode;

    void main() {
      vec3 rgb;

      if (u_isGround > 0.5) {
        rgb = texture2D(u_groundTex, v_uv).rgb;
      } else {
        vec2 tiledUV = fract(v_uv);
        vec2 atlasUV = (v_slot * 64.0 + 16.0 + tiledUV * 32.0) / vec2(512.0, 256.0);
        rgb = texture2D(u_bldgTex, atlasUV).rgb * v_tint;
      }

      if (u_collMode > 0.5 && v_height > 0.01) {
        rgb = mix(rgb, vec3(1.0, 0.2, 0.2), 0.45);
      }

      if (u_gridMode > 0.5 && v_height < 0.01) {
        vec2 f = fract(v_worldPos);
        if (f.x < 0.05 || f.y < 0.05) {
          rgb = mix(rgb, vec3(1.0, 0.85, 0.35), 0.30);
        }
      }

      gl_FragColor = vec4(rgb, 1.0);
    }
  `;

  function compileShader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const aPosLoc = gl.getAttribLocation(prog, 'a_pos');
  const aUvLoc = gl.getAttribLocation(prog, 'a_uv');
  const aSlotLoc = gl.getAttribLocation(prog, 'a_slot');
  const aTintLoc = gl.getAttribLocation(prog, 'a_tint');

  const uCamLoc = gl.getUniformLocation(prog, 'u_cam');
  const uResLoc = gl.getUniformLocation(prog, 'u_resolution');
  const uTilePxLoc = gl.getUniformLocation(prog, 'u_tilePx');
  const uPerspKLoc = gl.getUniformLocation(prog, 'u_perspK');
  const uIsGroundLoc = gl.getUniformLocation(prog, 'u_isGround');
  const uGridModeLoc = gl.getUniformLocation(prog, 'u_gridMode');
  const uCollModeLoc = gl.getUniformLocation(prog, 'u_collMode');
  const uGroundTexLoc = gl.getUniformLocation(prog, 'u_groundTex');
  const uBldgTexLoc = gl.getUniformLocation(prog, 'u_bldgTex');

  const STRIDE = 10 * 4; // 40 bytes per vertex

  function bindVertexLayout(buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(aUvLoc);
    gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, STRIDE, 3 * 4);
    gl.enableVertexAttribArray(aSlotLoc);
    gl.vertexAttribPointer(aSlotLoc, 2, gl.FLOAT, false, STRIDE, 5 * 4);
    gl.enableVertexAttribArray(aTintLoc);
    gl.vertexAttribPointer(aTintLoc, 3, gl.FLOAT, false, STRIDE, 7 * 4);
  }

  // --- 6. Bake Static Buildings + Ground Mesh ---
  function buildVectorMesh() {
    const t0 = performance.now();
    const verts = [];

    function pushTri(
      x0, y0, z0, u0, v0,
      x1, y1, z1, u1, v1,
      x2, y2, z2, u2, v2,
      slotX, slotY, r, g, b
    ) {
      verts.push(
        x0, y0, z0, u0, v0, slotX, slotY, r, g, b,
        x1, y1, z1, u1, v1, slotX, slotY, r, g, b,
        x2, y2, z2, u2, v2, slotX, slotY, r, g, b
      );
    }

    function pushQuad(
      x0, y0, z0, u0, v0,
      x1, y1, z1, u1, v1,
      x2, y2, z2, u2, v2,
      x3, y3, z3, u3, v3,
      slotX, slotY, r, g, b
    ) {
      pushTri(
        x0, y0, z0, u0, v0,
        x1, y1, z1, u1, v1,
        x2, y2, z2, u2, v2,
        slotX, slotY, r, g, b
      );
      pushTri(
        x0, y0, z0, u0, v0,
        x2, y2, z2, u2, v2,
        x3, y3, z3, u3, v3,
        slotX, slotY, r, g, b
      );
    }

    // Ground plane (vertices 0..5)
    pushQuad(
      0, 0, 0, 0, 0,
      WORLD_W, 0, 0, 1, 0,
      WORLD_W, WORLD_H, 0, 1, 1,
      0, WORLD_H, 0, 0, 1,
      0, 0, 1, 1, 1
    );

    const bldgStartVertex = 6;

    for (const b of (mapData.vectorBuildings || [])) {
      const floors = b.floors || 3;
      const style = b.style || 1;
      const slotX = style - 1;

      for (const ring of b.rings) {
        if (ring.length < 3) continue;

        const tris = triangulatePolygon(ring);
        for (const [p0, p1, p2] of tris) {
          pushTri(
            p0[0], p0[1], floors, p0[0] * 0.25, p0[1] * 0.25,
            p1[0], p1[1], floors, p1[0] * 0.25, p1[1] * 0.25,
            p2[0], p2[1], floors, p2[0] * 0.25, p2[1] * 0.25,
            slotX, 0, 1, 1, 1
          );
        }

        const zRim = floors + 0.04;
        const rimW = 0.28;
        const n = ring.length;

        let cx = 0, cy = 0;
        for (const [px, py] of ring) { cx += px; cy += py; }
        cx /= n; cy /= n;

        for (let i = 0; i < n; i++) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[(i + 1) % n];
          const dx = x1 - x0;
          const dy = y1 - y0;
          const segLen = Math.hypot(dx, dy);
          if (segLen < 0.05) continue;

          let nx = -dy / segLen;
          let ny = dx / segLen;
          const midX = (x0 + x1) * 0.5;
          const midY = (y0 + y1) * 0.5;
          if (nx * (cx - midX) + ny * (cy - midY) < 0) {
            nx = -nx;
            ny = -ny;
          }

          pushQuad(
            x0, y0, zRim, 0, 0,
            x1, y1, zRim, 1, 0,
            x1 + nx * rimW, y1 + ny * rimW, zRim, 1, 1,
            x0 + nx * rimW, y0 + ny * rimW, zRim, 0, 1,
            slotX, 3, 1, 1, 1
          );

          const wallLitRow = (ny > 0.1 || nx > 0.2) ? 1 : 2;
          const sh = 0.85 + 0.15 * ((-nx * 0.6 - ny * 0.8) * 0.5 + 0.5);
          const uRepeat = Math.max(0.5, Math.round(segLen * 0.5) * 0.5);
          const vRepeat = floors * 0.5;

          pushQuad(
            x0, y0, floors, 0, 0,
            x1, y1, floors, uRepeat, 0,
            x1, y1, 0, uRepeat, vRepeat,
            x0, y0, 0, 0, vRepeat,
            slotX, wallLitRow, sh, sh, sh
          );
        }
      }
    }

    const floatArr = new Float32Array(verts);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, floatArr, gl.STATIC_DRAW);

    const totalVertices = floatArr.length / 10;
    const triCount = totalVertices / 3;
    const buildMs = (performance.now() - t0).toFixed(1);
    const gpuStatsEl = document.getElementById('gpu-stats');
    if (gpuStatsEl) {
      gpuStatsEl.textContent = `Gładka siatka GPU: ${(triCount / 1000).toFixed(1)}k trójkątów (${buildMs} ms)`;
    }

    return { vbo, bldgStartVertex, bldgVertexCount: totalVertices - bldgStartVertex };
  }

  let mesh = buildVectorMesh();

  // --- 7. Traffic & MPK Poznań Trams Simulation System (2.5D Oriented Boxes on GPU!) ---
  const dynamicVbo = gl.createBuffer();
  const MAX_DYNAMIC_VERTS = 24000;
  const dynamicData = new Float32Array(MAX_DYNAMIC_VERTS * 10);

  // Build cumulative arc-length paths for smooth movement along polylines
  function buildPathMetric(pts) {
    const cumLen = [0];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      total += d;
      cumLen.push(total);
    }
    return { pts, cumLen, total };
  }

  function samplePath(metric, dist) {
    const { pts, cumLen, total } = metric;
    const d = Math.max(0, Math.min(total - 0.001, dist));
    let idx = 0;
    while (idx < cumLen.length - 2 && cumLen[idx + 1] < d) idx++;
    const segStart = cumLen[idx];
    const segLen = Math.max(1e-5, cumLen[idx + 1] - segStart);
    const t = (d - segStart) / segLen;
    const x0 = pts[idx][0], y0 = pts[idx][1];
    const x1 = pts[idx + 1][0], y1 = pts[idx + 1][1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: x0 + dx * t,
      y: y0 + dy * t,
      tx: dx / len,
      ty: dy / len,
    };
  }

  // Stitch connected OSM tram ways into longer continuous tracks
  function buildStitchedTramTracks(rawTrams) {
    const segs = rawTrams.map((t) => [...t.pts]).filter((pts) => pts.length >= 2);
    const used = new Array(segs.length).fill(false);
    const stitched = [];

    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const line = [...segs[i]];
      let extended = true;
      while (extended) {
        extended = false;
        for (let j = 0; j < segs.length; j++) {
          if (used[j]) continue;
          const tail = line[line.length - 1];
          const head = line[0];
          const sHead = segs[j][0];
          const sTail = segs[j][segs[j].length - 1];

          if (Math.hypot(tail[0] - sHead[0], tail[1] - sHead[1]) < 1.5) {
            line.push(...segs[j].slice(1));
            used[j] = true;
            extended = true;
          } else if (Math.hypot(sTail[0] - head[0], sTail[1] - head[1]) < 1.5) {
            line.unshift(...segs[j].slice(0, -1));
            used[j] = true;
            extended = true;
          }
        }
      }
      const m = buildPathMetric(line);
      if (m.total >= 25) stitched.push(m);
    }
    return stitched;
  }

  const CAR_PALETTE = [
    [0.92, 0.22, 0.18], // Classic GTA Red sports
    [0.20, 0.55, 0.95], // Electric Blue
    [0.95, 0.78, 0.18], // Taxi Yellow
    [0.92, 0.94, 0.96], // White sedan
    [0.22, 0.78, 0.38], // Emerald Green
    [0.85, 0.45, 0.15], // Orange coupe
    [0.55, 0.60, 0.68], // Silver metallic
  ];

  let tramTracks = [];
  let trams = [];
  let carRoads = [];
  let cars = [];
  let mainRouteMetric = null;

  function rebuildTrafficAndTrams() {
    tramTracks = buildStitchedTramTracks(mapData.vectorTrams || []);
    trams = [];
    tramTracks.forEach((track, idx) => {
      const count = Math.max(1, Math.floor(track.total / 95));
      for (let i = 0; i < count; i++) {
        trams.push({
          track,
          dist: ((i + 0.3) / count) * track.total,
          dir: (idx + i) % 2 === 0 ? 1 : -1,
          speed: 8.5 + (i % 2) * 1.2,
          lineNumber: (idx + i) % 2 === 0 ? '3' : '10',
        });
      }
    });

    mainRouteMetric = (mapData.routePts && mapData.routePts.length >= 2)
      ? buildPathMetric(mapData.routePts)
      : null;

    carRoads = (mapData.vectorRoads || [])
      .filter((r) => r.kind === 'asphalt' && (r.prio >= 2 || r.isMainRoute))
      .map((r) => ({
        metric: buildPathMetric(r.pts),
        w: r.w,
        oneway: r.oneway,
        prio: r.prio,
        isMainRoute: !!r.isMainRoute,
      }))
      .filter((r) => r.metric.total >= 18);

    cars = [];
    // If on Trasa map, spawn 120 highway cars along the main 21.8 km route + local cars
    if (activeMapKey === 'trasa' && mainRouteMetric) {
      const mainRoadObj = { metric: mainRouteMetric, w: 4.5, oneway: false, prio: 6, isMainRoute: true };
      const numHighway = 120;
      for (let c = 0; c < numHighway; c++) {
        const dir = c % 2 === 0 ? 1 : -1;
        const color = CAR_PALETTE[c % CAR_PALETTE.length];
        cars.push({
          road: mainRoadObj,
          dist: (c / numHighway) * mainRouteMetric.total,
          dir,
          speed: 12.0 + (c % 5) * 1.5,
          color,
          length: 2.2,
          width: 1.05,
          height: 0.52,
        });
      }
    }

    for (let i = 0; i < carRoads.length; i++) {
      const road = carRoads[i];
      if (road.isMainRoute) continue;
      const density = road.prio >= 4 ? 42 : 75;
      const numCars = Math.floor(road.metric.total / density);
      for (let c = 0; c < numCars && cars.length < 180; c++) {
        const dir = road.oneway ? 1 : (c % 2 === 0 ? 1 : -1);
        const color = CAR_PALETTE[(i * 3 + c * 7) % CAR_PALETTE.length];
        cars.push({
          road,
          dist: ((c + 0.25) / Math.max(1, numCars)) * road.metric.total,
          dir,
          speed: (road.prio >= 4 ? 10.5 : 7.0) + ((i + c) % 5) * 0.9,
          color,
          length: 2.2,
          width: 1.05,
          height: 0.52,
        });
      }
    }
  }

  rebuildTrafficAndTrams();

  // Helper to append a 2.5D Oriented Box (Roof + 4 Side Walls) into dynamicData buffer
  function writeOrientedBox3D(
    out, ptr,
    cx, cy, zBase, zTop,
    tx, ty, halfLen, halfWid,
    roofSlotX, roofSlotY,
    wallSlotX, wallSlotY,
    rTint, gTint, bTint
  ) {
    // Right perpendicular vector
    const rx = -ty;
    const ry = tx;

    // 4 corners in world XY:
    // 0: Front-Left, 1: Front-Right, 2: Rear-Right, 3: Rear-Left
    const x0 = cx + tx * halfLen - rx * halfWid;
    const y0 = cy + ty * halfLen - ry * halfWid;

    const x1 = cx + tx * halfLen + rx * halfWid;
    const y1 = cy + ty * halfLen + ry * halfWid;

    const x2 = cx - tx * halfLen + rx * halfWid;
    const y2 = cy - ty * halfLen + ry * halfWid;

    const x3 = cx - tx * halfLen - rx * halfWid;
    const y3 = cy - ty * halfLen - ry * halfWid;

    function pushV(x, y, z, u, v, sx, sy, r, g, b) {
      out[ptr++] = x;
      out[ptr++] = y;
      out[ptr++] = z;
      out[ptr++] = u;
      out[ptr++] = v;
      out[ptr++] = sx;
      out[ptr++] = sy;
      out[ptr++] = r;
      out[ptr++] = g;
      out[ptr++] = b;
    }

    function pushQ(
      ax, ay, az, au, av,
      bx, by, bz, bu, bv,
      cx_, cy_, cz, cu, cv,
      dx, dy, dz, du, dv,
      sx, sy, r, g, b
    ) {
      pushV(ax, ay, az, au, av, sx, sy, r, g, b);
      pushV(bx, by, bz, bu, bv, sx, sy, r, g, b);
      pushV(cx_, cy_, cz, cu, cv, sx, sy, r, g, b);

      pushV(ax, ay, az, au, av, sx, sy, r, g, b);
      pushV(cx_, cy_, cz, cu, cv, sx, sy, r, g, b);
      pushV(dx, dy, dz, du, dv, sx, sy, r, g, b);
    }

    // 1. Roof Quad at z = zTop
    pushQ(
      x0, y0, zTop, 0.02, 0.02,
      x1, y1, zTop, 0.98, 0.02,
      x2, y2, zTop, 0.98, 0.98,
      x3, y3, zTop, 0.02, 0.98,
      roofSlotX, roofSlotY, rTint, gTint, bTint
    );

    const sr = rTint * 0.82, sg = gTint * 0.82, sb = bTint * 0.82;

    // 2. Front Wall (0 -> 1)
    pushQ(
      x0, y0, zTop, 0, 0,
      x1, y1, zTop, 1, 0,
      x1, y1, zBase, 1, 1,
      x0, y0, zBase, 0, 1,
      wallSlotX, wallSlotY, rTint, gTint, bTint
    );

    // 3. Rear Wall (2 -> 3)
    pushQ(
      x2, y2, zTop, 0, 0,
      x3, y3, zTop, 1, 0,
      x3, y3, zBase, 1, 1,
      x2, y2, zBase, 0, 1,
      wallSlotX, wallSlotY, sr, sg, sb
    );

    // 4. Right Side Wall (1 -> 2)
    pushQ(
      x1, y1, zTop, 0, 0,
      x2, y2, zTop, 1, 0,
      x2, y2, zBase, 1, 1,
      x1, y1, zBase, 0, 1,
      wallSlotX, wallSlotY, sr, sg, sb
    );

    // 5. Left Side Wall (3 -> 0)
    pushQ(
      x3, y3, zTop, 0, 0,
      x0, y0, zTop, 1, 0,
      x0, y0, zBase, 1, 1,
      x3, y3, zBase, 0, 1,
      wallSlotX, wallSlotY, rTint, gTint, bTint
    );

    return ptr;
  }

  function updateAndBuildTraffic(dt) {
    let ptr = 0;

    if (typeof state === 'undefined' || state.showTraffic !== false) {
      // 1. Update & emit articulated 3-car MPK Poznań Trams
      for (const tr of trams) {
        tr.dist += tr.dir * tr.speed * dt;
        if (tr.dist > tr.track.total - 6) {
          tr.dist = tr.track.total - 6;
          tr.dir = -1;
        } else if (tr.dist < 6) {
          tr.dist = 6;
          tr.dir = 1;
        }

        // 3 articulated wagons per tram (each ~4.2 units = 8.4m long, separated by 4.5 units)
        for (let w = -1; w <= 1; w++) {
          const dWagon = tr.dist + w * 4.5;
          const sample = samplePath(tr.track, dWagon);
          const tx = sample.tx * tr.dir;
          const ty = sample.ty * tr.dir;

          ptr = writeOrientedBox3D(
            dynamicData, ptr,
            sample.x, sample.y, 0.02, 1.05,
            tx, ty, 2.05, 0.65,
            7, 0, // Tram roof slot (7,0)
            7, 1, // Tram wall slot (7,1)
            1.0, 1.0, 1.0
          );
        }
      }

      // 2. Update & emit GTA 1 Retro Cars
      for (const c of cars) {
        c.dist += c.dir * c.speed * dt;
        if (c.dist > c.road.metric.total) {
          c.dist -= c.road.metric.total;
        } else if (c.dist < 0) {
          c.dist += c.road.metric.total;
        }

        const sample = samplePath(c.road.metric, c.dist);
        const tx = sample.tx * c.dir;
        const ty = sample.ty * c.dir;
        // Right-hand traffic lane offset
        const rx = -ty;
        const ry = tx;
        const laneOffset = c.road.oneway ? 0 : Math.min(1.1, c.road.w * 0.24);
        const cx = sample.x + rx * laneOffset;
        const cy = sample.y + ry * laneOffset;

        ptr = writeOrientedBox3D(
          dynamicData, ptr,
          cx, cy, 0.02, c.height,
          tx, ty, c.length * 0.5, c.width * 0.5,
          7, 2, // Car roof slot (7,2)
          7, 3, // Car wall slot (7,3)
          c.color[0], c.color[1], c.color[2]
        );
      }
    }

      // 3. Emit Player Vehicle 2.5D Oriented Box (+ Police/Taxi Roof Lightbar!)
    if (typeof player !== 'undefined') {
      const spec = CAR_SPECS[player.carIdx];
      const tx = Math.cos(player.angle);
      const ty = Math.sin(player.angle);

      // Slight visual roll/pitch when bumping curb or drifting hard
      const bumpZ = player.curbBumpTimer > 0 ? Math.sin(player.curbBumpTimer * 45) * 0.06 : 0;
      const flashBoost = player.collisionFlash > 0 ? 0.35 : 0;
      const cr = Math.min(1.0, spec.color[0] + flashBoost);
      const cg = Math.min(1.0, spec.color[1] + flashBoost);
      const cb = Math.min(1.0, spec.color[2] + flashBoost);

      ptr = writeOrientedBox3D(
        dynamicData, ptr,
        player.x, player.y, 0.03 + bumpZ, spec.height + bumpZ,
        tx, ty, spec.length * 0.5, spec.width * 0.5,
        7, 2,
        7, 3,
        cr, cg, cb
      );

      // Add roof siren bar for Police or yellow sign for Taxi
      if (spec.isPolice) {
        const sBlue = Math.sin(player.sirenPhase * 16) > 0;
        ptr = writeOrientedBox3D(
          dynamicData, ptr,
          player.x - tx * 0.08, player.y - ty * 0.08,
          spec.height + bumpZ, spec.height + 0.14 + bumpZ,
          tx, ty, 0.20, 0.36,
          7, 3, 7, 3,
          player.sirenActive ? (sBlue ? 0.15 : 1.0) : 0.2,
          player.sirenActive ? (sBlue ? 0.55 : 0.15) : 0.3,
          player.sirenActive ? (sBlue ? 1.0 : 0.15) : 0.8
        );
      } else if (spec.isTaxi) {
        ptr = writeOrientedBox3D(
          dynamicData, ptr,
          player.x, player.y,
          spec.height + bumpZ, spec.height + 0.13 + bumpZ,
          tx, ty, 0.18, 0.28,
          7, 3, 7, 3,
          1.0, 0.88, 0.20
        );
      }

      // 4. If player is on foot ("ludzik"), emit a 2.5D torso/head block so he has real depth against buildings!
      if (player.mode === 'foot') {
        const ptx = Math.cos(player.pedAngle);
        const pty = Math.sin(player.pedAngle);
        const bobZ = Math.abs(Math.sin(player.walkCycle)) * 0.04;
        // Torso (blue retro jacket)
        ptr = writeOrientedBox3D(
          dynamicData, ptr,
          player.pedX, player.pedY, 0.04 + bobZ, 0.36 + bobZ,
          ptx, pty, 0.22, 0.28,
          7, 3, 7, 3,
          0.18, 0.52, 0.95
        );
      }
    }

    const vertCount = ptr / 10;
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicVbo);
    gl.bufferData(gl.ARRAY_BUFFER, dynamicData.subarray(0, ptr), gl.DYNAMIC_DRAW);
    return vertCount;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0.05, 0.05, 0.07, 1.0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, groundTex);
  gl.uniform1i(uGroundTexLoc, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bldgAtlasTex);
  gl.uniform1i(uBldgTexLoc, 1);

  // --- 8. Static Minimap Radar ---
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas.getContext('2d');
  const minimapBase = document.createElement('canvas');
  minimapBase.width = 200;
  minimapBase.height = 200;

  function buildMinimapBase() {
    const mctx = minimapBase.getContext('2d');
    const mw = minimapBase.width;
    const mh = minimapBase.height;
    mctx.clearRect(0, 0, mw, mh);

    if (usesSectorMap()) {
      // Exact crisp vector minimap from trasa-app.js!
      const sx = mw / WORLD_W;
      const sy = mh / WORLD_H;

      mctx.fillStyle = '#0c0e13';
      mctx.fillRect(0, 0, mw, mh);

      mctx.strokeStyle = '#294522';
      mctx.lineWidth = Math.max(4, trasaCorrRad * 2 * sx);
      mctx.lineCap = 'round';
      mctx.lineJoin = 'round';
      if (trasaRoutePts.length >= 2) {
        mctx.beginPath();
        mctx.moveTo(trasaRoutePts[0][0] * sx, trasaRoutePts[0][1] * sy);
        for (let i = 1; i < trasaRoutePts.length; i++) {
          mctx.lineTo(trasaRoutePts[i][0] * sx, trasaRoutePts[i][1] * sy);
        }
        mctx.stroke();
      }

      for (const a of trasaAnchors) {
        mctx.fillStyle = '#294522';
        mctx.beginPath();
        mctx.arc(a.x * sx, a.y * sy, Math.max(5, a.radiusUnits * sx), 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = '#59ff67';
        mctx.lineWidth = 1.5;
        mctx.stroke();
      }

      if (trasaRoutePts.length >= 2) {
        mctx.strokeStyle = '#ffd15c';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.moveTo(trasaRoutePts[0][0] * sx, trasaRoutePts[0][1] * sy);
        for (let i = 1; i < trasaRoutePts.length; i++) {
          mctx.lineTo(trasaRoutePts[i][0] * sx, trasaRoutePts[i][1] * sy);
        }
        mctx.stroke();
      }
      return;
    }

    if (!groundGrid || !heightGrid || !styleGrid) return;

    const img = mctx.createImageData(200, 200);
    const d = img.data;

    for (let my = 0; my < 200; my++) {
      const gy = Math.floor((my / 200) * WORLD_H);
      for (let mx = 0; mx < 200; mx++) {
        const gx = Math.floor((mx / 200) * WORLD_W);
        const idx = gy * WORLD_W + gx;
        const h = heightGrid[idx];
        const g = groundGrid[idx];
        const st = styleGrid[idx];

        let r = 45, gr = 47, b = 54;
        if (h > 0) {
          if (st === 5) { r = 89; gr = 255; b = 150; }
          else if (st === 6) { r = 230; gr = 150; b = 110; }
          else { r = 165; gr = 105; b = 75; }
        } else if (g === GROUND.GRASS) {
          r = 45; gr = 85; b = 40;
        } else if (g === GROUND.WATER) {
          r = 35; gr = 100; b = 170;
        } else if (g === GROUND.COBBLESTONE) {
          r = 140; gr = 125; b = 100;
        } else if (g === GROUND.ROAD_ASPHALT || g === GROUND.ROAD_COBBLE || g === GROUND.TRAM_TRACK) {
          r = 32; gr = 34; b = 40;
        } else if (g === GROUND.SIDEWALK) {
          r = 95; gr = 98; b = 104;
        }

        const p = (my * 200 + mx) * 4;
        d[p] = r; d[p + 1] = gr; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    mctx.putImageData(img, 0, 0);
  }

  buildMinimapBase();

  // --- 8.5. Player Vehicle & GTA 1 Arcade Drift Physics Engine ---
  // True physical longitudinal dynamics for a ~200 HP, 1500 kg (1.5t) car in 1 unit = 2 meters world scale:
  //   F_drive = min(F_tire_traction_limit, (P_wheel_watts * powerBand(RPM)) / v_m_s)
  //   F_resist = 0.5 * rho * CdA * v_m_s^2 + m * g * C_rr
  // Gives real-world benchmark times:
  //   0 - 60 km/h:  ~3.6 s (tire-traction & clutch limited on 1st gear, no rocket launch!)
  //   0 - 100 km/h: ~7.1 s
  //   0 - 150 km/h: ~14.6 s (strong 3rd/4th gear pull!)
  //   0 - 180 km/h: ~22.5 s
  //   Top speed:    ~212 km/h (aerodynamic drag equilibrium)
  const GEARBOXES = {
    manual6: {
      kind: 'auto',
      shiftUp: 0.22,
      shiftDown: 0.16,
      ratios: [
        { minKmh: 0,   upshiftKmh: 42,  downshiftKmh: 0,   maxGearKmh: 48,  engineBrakeMul: 1.6 },
        { minKmh: 18,  upshiftKmh: 72,  downshiftKmh: 22,  maxGearKmh: 80,  engineBrakeMul: 1.35 },
        { minKmh: 42,  upshiftKmh: 108, downshiftKmh: 48,  maxGearKmh: 118, engineBrakeMul: 1.1 },
        { minKmh: 72,  upshiftKmh: 142, downshiftKmh: 78,  maxGearKmh: 152, engineBrakeMul: 0.85 },
        { minKmh: 108, upshiftKmh: 168, downshiftKmh: 112, maxGearKmh: 178, engineBrakeMul: 0.65 },
        { minKmh: 138, upshiftKmh: 999, downshiftKmh: 142, maxGearKmh: 198, engineBrakeMul: 0.5 },
      ],
    },
    dsg7: {
      kind: 'auto',
      shiftUp: 0.07,
      shiftDown: 0.05,
      ratios: [
        { minKmh: 0,   upshiftKmh: 36,  downshiftKmh: 0,   maxGearKmh: 42,  engineBrakeMul: 1.4 },
        { minKmh: 16,  upshiftKmh: 58,  downshiftKmh: 24,  maxGearKmh: 66,  engineBrakeMul: 1.2 },
        { minKmh: 36,  upshiftKmh: 86,  downshiftKmh: 44,  maxGearKmh: 96,  engineBrakeMul: 1.0 },
        { minKmh: 58,  upshiftKmh: 118, downshiftKmh: 70,  maxGearKmh: 128, engineBrakeMul: 0.85 },
        { minKmh: 88,  upshiftKmh: 152, downshiftKmh: 100, maxGearKmh: 162, engineBrakeMul: 0.7 },
        { minKmh: 122, upshiftKmh: 186, downshiftKmh: 134, maxGearKmh: 196, engineBrakeMul: 0.55 },
        { minKmh: 158, upshiftKmh: 999, downshiftKmh: 168, maxGearKmh: 230, engineBrakeMul: 0.42 },
      ],
    },
    auto8: {
      kind: 'auto',
      shiftUp: 0.13,
      shiftDown: 0.08,
      ratios: [
        { minKmh: 0,   upshiftKmh: 32,  downshiftKmh: 0,   maxGearKmh: 38,  engineBrakeMul: 1.45 },
        { minKmh: 14,  upshiftKmh: 52,  downshiftKmh: 20,  maxGearKmh: 60,  engineBrakeMul: 1.25 },
        { minKmh: 32,  upshiftKmh: 76,  downshiftKmh: 38,  maxGearKmh: 86,  engineBrakeMul: 1.05 },
        { minKmh: 52,  upshiftKmh: 104, downshiftKmh: 60,  maxGearKmh: 114, engineBrakeMul: 0.9 },
        { minKmh: 78,  upshiftKmh: 134, downshiftKmh: 86,  maxGearKmh: 146, engineBrakeMul: 0.75 },
        { minKmh: 108, upshiftKmh: 164, downshiftKmh: 116, maxGearKmh: 176, engineBrakeMul: 0.62 },
        { minKmh: 140, upshiftKmh: 194, downshiftKmh: 148, maxGearKmh: 206, engineBrakeMul: 0.5 },
        { minKmh: 172, upshiftKmh: 999, downshiftKmh: 176, maxGearKmh: 240, engineBrakeMul: 0.4 },
      ],
    },
  };

  const CAR_SPECS = [
    {
      name: 'Nissan Leaf 2013 (109 KM / 1.52t)',
      color: [0.15, 0.72, 0.38],
      stripe: '#e8f7ee',
      drivetrain: 'ev',
      massKg: 1521,
      powerHp: 109,
      maxLaunchG: 0.38,
      cdA: 0.61,
      reverseForce: 3.2,
      brakeForce: 4.6,
      maxSpeed: 20.0, // 144 km/h (ogranicznik Leaf ZE0)
      turnRate: 2.55,
      baseLatGrip: 7.2,
      handbrakeLatGrip: 1.4,
      oversteerTailKick: 1.2,
      bounciness: 0.4,
      length: 2.22,
      width: 1.12,
      height: 0.62,
    },
    {
      name: 'VW Touran 1.9 TDI 2008 (105 KM / 1.58t)',
      color: [0.22, 0.34, 0.55],
      stripe: null,
      drivetrain: 'diesel',
      gearbox: 'manual6',
      massKg: 1580,
      powerHp: 105,
      maxLaunchG: 0.34,
      cdA: 0.78,
      reverseForce: 3.0,
      brakeForce: 4.3,
      maxSpeed: 25.4, // ~183 km/h
      turnRate: 2.45,
      baseLatGrip: 6.4,
      handbrakeLatGrip: 1.25,
      oversteerTailKick: 1.55,
      bounciness: 0.42,
      length: 2.20,
      width: 1.15,
      height: 0.72,
    },
    {
      name: 'VW Golf Sportsvan 1.5 TSI (150 KM / 1.39t)',
      color: [0.82, 0.16, 0.16],
      stripe: '#f2f2f2',
      drivetrain: 'petrol',
      gearbox: 'dsg7',
      massKg: 1390,
      powerHp: 150,
      maxLaunchG: 0.46,
      cdA: 0.66,
      reverseForce: 3.4,
      brakeForce: 4.7,
      maxSpeed: 29.2, // ~210 km/h
      turnRate: 2.75,
      baseLatGrip: 7.4,
      handbrakeLatGrip: 1.3,
      oversteerTailKick: 1.65,
      bounciness: 0.44,
      length: 2.17,
      width: 1.13,
      height: 0.64,
    },
    {
      name: 'BMW X1 2.0d 2018 (190 KM / 1.66t)',
      color: [0.12, 0.16, 0.22],
      stripe: '#c5a46e',
      drivetrain: 'diesel',
      gearbox: 'auto8',
      massKg: 1660,
      powerHp: 190,
      maxLaunchG: 0.46,
      cdA: 0.82,
      reverseForce: 3.5,
      brakeForce: 4.8,
      maxSpeed: 30.6, // ~220 km/h
      turnRate: 2.6,
      baseLatGrip: 7.6,
      handbrakeLatGrip: 1.35,
      oversteerTailKick: 1.45,
      bounciness: 0.46,
      length: 2.22,
      width: 1.16,
      height: 0.70,
    },
  ];

  // Surface physics parameters (Allowed everywhere outside buildings & water, with distinct grip & drag!)
  const SURFACE_PHYSICS = {
    [GROUND.ROAD_ASPHALT]: {
      name: 'JEZDNIA (ASFALT)',
      grip: 1.00,
      drag: 0.24,
      maxSpeedMul: 1.00,
      skidColor: 'rgba(18, 18, 22, 0.58)',
      smokeColor: [215, 220, 230],
      pillColor: '#59ff67',
    },
    [GROUND.ROAD_COBBLE]: {
      name: 'ULICA (KOSTKA BRUKOWA)',
      grip: 0.80,
      drag: 0.34,
      maxSpeedMul: 0.92,
      skidColor: 'rgba(26, 22, 18, 0.50)',
      smokeColor: [200, 195, 185],
      pillColor: '#ffd15c',
    },
    [GROUND.TRAM_TRACK]: {
      name: 'TOROWISKO MPK (ŚLISKIE SZYN)',
      grip: 0.68,
      drag: 0.30,
      maxSpeedMul: 0.95,
      skidColor: 'rgba(20, 20, 24, 0.52)',
      smokeColor: [210, 215, 225],
      pillColor: '#70e2ff',
    },
    [GROUND.SIDEWALK]: {
      name: 'CHODNIK / ALEJKA',
      grip: 0.76,
      drag: 0.52,
      maxSpeedMul: 0.84,
      skidColor: 'rgba(30, 30, 35, 0.48)',
      smokeColor: [195, 195, 200],
      pillColor: '#ffe07d',
    },
    [GROUND.COBBLESTONE]: {
      name: 'DEPTAK / PLAC',
      grip: 0.78,
      drag: 0.42,
      maxSpeedMul: 0.88,
      skidColor: 'rgba(32, 28, 24, 0.48)',
      smokeColor: [200, 190, 175],
      pillColor: '#ffd15c',
    },
    [GROUND.URBAN_PAVED]: {
      name: 'TEREN OSIEDLOWY / PARKING',
      grip: 0.72,
      drag: 0.62,
      maxSpeedMul: 0.80,
      skidColor: 'rgba(28, 26, 24, 0.44)',
      smokeColor: [180, 175, 165],
      pillColor: '#e6c278',
    },
    [GROUND.GRASS]: {
      name: 'PARK / TRAWA (ŚLISKO!)',
      grip: 0.42,
      drag: 1.25,
      maxSpeedMul: 0.66,
      skidColor: 'rgba(58, 42, 22, 0.58)', // muddy brown tire ruts on grass!
      smokeColor: [138, 112, 72], // dirt/grass dust kickup
      pillColor: '#98ff66',
    },
    [GROUND.WATER]: {
      name: 'WODA / STAW (ODBICIE)',
      grip: 0.35,
      drag: 2.50,
      maxSpeedMul: 0.40,
      skidColor: 'rgba(40, 80, 120, 0.4)',
      smokeColor: [160, 210, 255],
      pillColor: '#5ce1ff',
    },
  };

  // Spatial Hash Map for exact Vector Building Polygon Wall Collisions (works on any world size!)
  const COLL_CELL = 10;
  let wallBuckets = new Map();

  function getWallBucket(cx, cy) {
    return wallBuckets.get(`${cx},${cy}`) || [];
  }

  function buildWallSpatialHash() {
    wallBuckets = new Map();
    for (const b of (mapData.vectorBuildings || [])) {
      const floors = b.floors || 3;
      for (const ring of b.rings) {
        const n = ring.length;
        if (n < 3) continue;

        let area = 0;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
        }
        const sign = area >= 0 ? 1 : -1;

        for (let i = 0; i < n; i++) {
          const [x0, y0] = ring[i];
          const [x1, y1] = ring[(i + 1) % n];
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len = Math.hypot(dx, dy);
          if (len < 0.05) continue;

          const nx = (dy / len) * sign;
          const ny = (-dx / len) * sign;

          const seg = { x0, y0, x1, y1, nx, ny, len, floors };

          const minCX = Math.floor((Math.min(x0, x1) - 1.5) / COLL_CELL);
          const maxCX = Math.floor((Math.max(x0, x1) + 1.5) / COLL_CELL);
          const minCY = Math.floor((Math.min(y0, y1) - 1.5) / COLL_CELL);
          const maxCY = Math.floor((Math.max(y0, y1) + 1.5) / COLL_CELL);

          for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cx = minCX; cx <= maxCX; cx++) {
              const key = `${cx},${cy}`;
              let arr = wallBuckets.get(key);
              if (!arr) {
                arr = [];
                wallBuckets.set(key, arr);
              }
              arr.push(seg);
            }
          }
        }
      }
    }
  }
  buildWallSpatialHash();

  // Spatial Hash Map for Vector Roads (used on Trasa map where groundGrid is not baked)
  const ROAD_CELL = 20;
  let roadBuckets = new Map();

  function buildRoadSpatialHash() {
    roadBuckets = new Map();
    for (const r of (mapData.vectorRoads || [])) {
      const pts = r.pts;
      if (!pts || pts.length < 2) continue;
      const halfW = (r.w || 3.5) * 0.5;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const seg = {
          x0, y0, x1, y1,
          halfW,
          hasSidewalk: !!r.hasSidewalk,
          kind: r.kind,
          isMainRoute: !!r.isMainRoute,
        };
        const minCX = Math.floor((Math.min(x0, x1) - halfW - 2) / ROAD_CELL);
        const maxCX = Math.floor((Math.max(x0, x1) + halfW + 2) / ROAD_CELL);
        const minCY = Math.floor((Math.min(y0, y1) - halfW - 2) / ROAD_CELL);
        const maxCY = Math.floor((Math.max(y0, y1) + halfW + 2) / ROAD_CELL);
        for (let cy = minCY; cy <= maxCY; cy++) {
          for (let cx = minCX; cx <= maxCX; cx++) {
            const key = `${cx},${cy}`;
            let arr = roadBuckets.get(key);
            if (!arr) {
              arr = [];
              roadBuckets.set(key, arr);
            }
            arr.push(seg);
          }
        }
      }
    }
  }
  buildRoadSpatialHash();

  // Helper to find closest drivable road spot near target (x, y) so car never spawns inside a building
  function findNearestRoadSpawn(targetX, targetY) {
    let bestX = targetX;
    let bestY = targetY;
    let bestAngle = -Math.PI * 0.5;
    let bestDistSq = Infinity;

    for (const r of (mapData.vectorRoads || [])) {
      if (r.kind === 'footway' || r.pts.length < 2) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x0, y0] = r.pts[i];
        const [x1, y1] = r.pts[i + 1];
        const dx = x1 - x0, dy = y1 - y0;
        const l2 = dx * dx + dy * dy;
        if (l2 < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((targetX - x0) * dx + (targetY - y0) * dy) / l2));
        const px = x0 + t * dx;
        const py = y0 + t * dy;
        const dSq = (targetX - px) ** 2 + (targetY - py) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestX = px;
          bestY = py;
          bestAngle = Math.atan2(dy, dx);
        }
      }
    }
    return { x: bestX, y: bestY, angle: bestAngle };
  }

  const initialSpawn = findNearestRoadSpawn(250, 250);

  const player = {
    mode: 'car', // 'car' | 'foot'
    carIdx: 0,
    x: initialSpawn.x,
    y: initialSpawn.y,
    vx: 0,
    vy: 0,
    angle: initialSpawn.angle,
    angularVel: 0,
    steerAngle: 0,
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    drifting: false,
    handbrake: false,
    braking: false,
    reversing: false,
    sirenActive: false,
    sirenPhase: 0,
    damage: 0,
    score: 0,
    driftCombo: 0,
    driftTimer: 0,
    surfaceType: GROUND.ROAD_ASPHALT,
    lastSurfaceType: GROUND.ROAD_ASPHALT,
    curbBumpTimer: 0,
    collisionFlash: 0,
    // 5-speed transmission & RPM state
    gear: 1,         // 1..5
    shiftTimer: 0,   // >0 when clutch is disengaged during gear shift
    rpmNorm: 0.15,   // 0..1 normalized engine RPM
    // On-foot character ("ludzik") state
    pedX: initialSpawn.x,
    pedY: initialSpawn.y,
    pedVx: 0,
    pedVy: 0,
    pedAngle: initialSpawn.angle,
    walkCycle: 0,
    shootCooldown: 0,
    muzzleFlashTimer: 0,
    stepSoundTimer: 0,
  };

  // Tire skidmarks ring buffer, bullets & particle emitters (smoke, sparks, shell casings)
  const MAX_SKIDS = 900;
  const skidMarks = [];
  const particles = [];
  const bullets = [];

  function addSkidMark(x0, y0, x1, y1, color, width) {
    skidMarks.push({ x0, y0, x1, y1, color, width });
    if (skidMarks.length > MAX_SKIDS) skidMarks.shift();
  }

  function spawnParticle(x, y, vx, vy, size, color, life, kind = 'smoke') {
    if (particles.length > 260) particles.shift();
    particles.push({ x, y, vx, vy, size, color, life, maxLife: life, kind });
  }

  function respawnPlayerAt(tx, ty) {
    const sp = findNearestRoadSpawn(tx, ty);
    player.mode = 'car';
    player.x = sp.x;
    player.y = sp.y;
    player.angle = sp.angle;
    player.vx = 0;
    player.vy = 0;
    player.angularVel = 0;
    player.driftCombo = 0;
    player.gear = 1;
    player.shiftTimer = 0;
    player.rpmNorm = 0.14;
    player.pedX = sp.x;
    player.pedY = sp.y;
  }

  // --- 8.8. GTA 1 Retro Web Audio Synthesizer (Engine RPM, Tire Screech, Grass Slide, Crashes, Horn & 997 Siren) ---
  const sfx = {
    ctx: null,
    masterGain: null,
    engOsc1: null,
    engOsc2: null,
    engFilter: null,
    engGain: null,
    skidFilter: null,
    skidGain: null,
    sirenOsc: null,
    sirenGain: null,
    volume: 0.75,
    muted: false,
    ready: false,
    lastCrashSoundTime: 0,

    init() {
      if (this.ready) {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(ctx.destination);
      this.masterGain = master;

      // 1. Continuous Engine Synthesizer (Dual Sawtooth + Sub-Triangle through resonant Lowpass)
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 240;
      engFilter.Q.value = 3.2;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.14;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 52;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 26;

      osc1.connect(engFilter);
      osc2.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(master);
      osc1.start();
      osc2.start();

      this.engOsc1 = osc1;
      this.engOsc2 = osc2;
      this.engFilter = engFilter;
      this.engGain = engGain;

      // 2. Continuous Looping White Noise Buffer for Tire Screech & Grass/Gravel Sliding
      const bufSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuf = noiseBuf;

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1250;
      skidFilter.Q.value = 4.5;

      const skidGain = ctx.createGain();
      skidGain.gain.value = 0.0;

      noiseSrc.connect(skidFilter);
      skidFilter.connect(skidGain);
      skidGain.connect(master);
      noiseSrc.start();

      this.skidFilter = skidFilter;
      this.skidGain = skidGain;

      // 3. Police 997 Two-Tone Siren Oscillator ("Le-On")
      const sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 580;

      const sirenFilter = ctx.createBiquadFilter();
      sirenFilter.type = 'lowpass';
      sirenFilter.frequency.value = 1600;

      const sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.0;

      sirenOsc.connect(sirenFilter);
      sirenFilter.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      this.sirenOsc = sirenOsc;
      this.sirenGain = sirenGain;

      this.ready = true;
    },

    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, val));
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
      }
    },

    toggleMute() {
      this.muted = !this.muted;
      this.setVolume(this.volume);
      const volValEl = document.getElementById('volume-val');
      if (volValEl) {
        volValEl.textContent = this.muted ? 'WYCISZONY' : `${Math.round(this.volume * 100)}%`;
      }
    },

    updateContinuous(throttleInput) {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;

      if (player.mode === 'foot') {
        // Quiet engine idle based on distance to parked car
        const distToCar = Math.hypot(player.pedX - player.x, player.pedY - player.y);
        const idleProx = Math.max(0, 1 - distToCar / 18);
        const parkedEv = CAR_SPECS[player.carIdx].drivetrain === 'ev';
        this.engOsc1.frequency.setTargetAtTime(38, now, 0.05);
        this.engOsc2.frequency.setTargetAtTime(19, now, 0.05);
        this.engGain.gain.setTargetAtTime(parkedEv ? 0 : 0.03 * idleProx, now, 0.05);
        this.skidGain.gain.setTargetAtTime(0.0, now, 0.04);
        this.sirenGain.gain.setTargetAtTime(0.0, now, 0.04);
        return;
      }

      const specNow = CAR_SPECS[player.carIdx];
      const isEv = specNow.drivetrain === 'ev';
      const isDiesel = specNow.drivetrain === 'diesel';
      const isShifting = !isEv && player.shiftTimer > 0;
      const rpm = player.rpmNorm || 0.14;

      if (isEv) {
        this.engGain.gain.setTargetAtTime(0, now, 0.04);
      } else {
        const revCurve = 0.72 * rpm + 0.28 * (rpm * rpm);
        const shiftDip = isShifting ? -22 : 0;
        const loadBoost = isShifting ? 0 : throttleInput * (isDiesel ? 4 : 9);
        const pitchMul = isDiesel ? 0.62 : 1.0;
        const baseFreq = Math.max(28, (34 + revCurve * (isDiesel ? 78 : 124) + loadBoost + shiftDip) * pitchMul);
        this.engOsc1.frequency.setTargetAtTime(baseFreq, now, 0.012);
        this.engOsc2.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.012);
        this.engFilter.frequency.setTargetAtTime(
          isShifting ? 160 : (isDiesel ? 140 + baseFreq * 2.2 : 180 + baseFreq * 4.2 + throttleInput * 260),
          now,
          0.015
        );
        const targetEngVol = isShifting
          ? 0.045
          : (0.08 + rpm * 0.12 + throttleInput * 0.06);
        this.engGain.gain.setTargetAtTime(targetEngVol, now, 0.015);
      }

      // Tire Screech (Asphalt/Sidewalk/Tram) vs Grass Dirt Rumble
      if (player.drifting && player.speed > 2.2) {
        const slideIntensity = Math.min(1.0, (Math.abs(player.lateralSpeed) + (player.handbrake ? 4.0 : 0)) / 9.0);
        if (player.surfaceType === GROUND.GRASS) {
          // Low gritty turf/gravel slide sound in park
          this.skidFilter.type = 'lowpass';
          this.skidFilter.frequency.setTargetAtTime(360 + player.speed * 14, now, 0.03);
          this.skidFilter.Q.setTargetAtTime(1.4, now, 0.03);
          this.skidGain.gain.setTargetAtTime(slideIntensity * 0.24, now, 0.03);
        } else {
          // Classic GTA 1 high-pitched tire screech on asphalt/concrete/rails!
          const pitchMod = 1100 + Math.min(600, Math.abs(player.lateralSpeed) * 45) + (player.surfaceType === GROUND.TRAM_TRACK ? 350 : 0);
          this.skidFilter.type = 'bandpass';
          this.skidFilter.frequency.setTargetAtTime(pitchMod, now, 0.03);
          this.skidFilter.Q.setTargetAtTime(5.5, now, 0.03);
          this.skidGain.gain.setTargetAtTime(slideIntensity * 0.22, now, 0.025);
        }
      } else if (isEv && player.speed > 0.35) {
        const roll = Math.min(1, player.speed / 16);
        this.skidFilter.type = 'lowpass';
        this.skidFilter.frequency.setTargetAtTime(160 + player.speed * 18, now, 0.08);
        this.skidFilter.Q.setTargetAtTime(0.55, now, 0.08);
        this.skidGain.gain.setTargetAtTime(0.01 + roll * 0.04, now, 0.08);
      } else {
        this.skidGain.gain.setTargetAtTime(0.0, now, 0.04);
      }

      // Police 997 Siren or silence
      if (player.sirenActive && CAR_SPECS[player.carIdx].isPolice) {
        const isHigh = Math.sin(player.sirenPhase * 8.5) > 0;
        this.sirenOsc.frequency.setTargetAtTime(isHigh ? 780 : 580, now, 0.015);
        this.sirenGain.gain.setTargetAtTime(0.11, now, 0.03);
      } else {
        this.sirenGain.gain.setTargetAtTime(0.0, now, 0.03);
      }
    },

    playGearShift(isUpshift) {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      // Short mechanical gearbox clunk + exhaust blow-off puff on upshift
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isUpshift ? 135 : 175, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.075);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.085);
    },

    playCrash(impactSpeed) {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastCrashSoundTime < 0.09) return;
      this.lastCrashSoundTime = now;

      const strength = Math.min(1.0, impactSpeed / 16.0);

      // 1. Metallic crunch noise burst
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuf;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520 + Math.random() * 280, now);
      filter.Q.setValueAtTime(1.8, now);

      const nGain = this.ctx.createGain();
      const dur = 0.14 + strength * 0.22;
      nGain.gain.setValueAtTime(0.15 + strength * 0.35, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + dur);

      // 2. Low body thump / bounce resonance
      const thump = this.ctx.createOscillator();
      thump.type = 'triangle';
      thump.frequency.setValueAtTime(115 + strength * 40, now);
      thump.frequency.exponentialRampToValueAtTime(28, now + 0.18);

      const tGain = this.ctx.createGain();
      tGain.gain.setValueAtTime(0.25 + strength * 0.35, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

      thump.connect(tGain);
      tGain.connect(this.masterGain);
      thump.start(now);
      thump.stop(now + 0.20);
    },

    playCurbBump() {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.08);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.09);
    },

    playHorn() {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      // Dual-tone retro car horn (e.g., 410 Hz + 510 Hz)
      const freqs = player.carIdx === 1 ? [340, 425] : [420, 525];
      for (const f of freqs) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now);

        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(1300, now);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.11, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        osc.connect(flt);
        flt.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.27);
      }
    },

    playGunshot() {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Sharp pistol powder crack (high-energy filtered noise burst)
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuf;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1450, now);
      bandpass.frequency.exponentialRampToValueAtTime(380, now + 0.11);
      bandpass.Q.setValueAtTime(1.2, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.42, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      noise.connect(bandpass);
      bandpass.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.14);

      // 2. Punchy 9mm barrel transients
      const pop = this.ctx.createOscillator();
      pop.type = 'sawtooth';
      pop.frequency.setValueAtTime(290, now);
      pop.frequency.exponentialRampToValueAtTime(48, now + 0.065);

      const pGain = this.ctx.createGain();
      pGain.gain.setValueAtTime(0.32, now);
      pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      pop.connect(pGain);
      pGain.connect(this.masterGain);
      pop.start(now);
      pop.stop(now + 0.075);
    },

    playRicochet() {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const startF = 1900 + Math.random() * 900;
      osc.frequency.setValueAtTime(startF, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.09);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.10);
    },

    playDoorLatch() {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(110, now + 0.04);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.11);
    },

    playFootstep(isGrass) {
      if (!this.ready || !this.ctx) return;
      const now = this.ctx.currentTime;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuf;

      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(isGrass ? 450 : 950, now);
      flt.Q.setValueAtTime(2.5, now);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.045, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      noise.connect(flt);
      flt.connect(g);
      g.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.05);
    },
  };

  // --- 9. Camera & Controls ---
  const state = {
    camX: player.x,
    camY: player.y,
    zoom: 1.15,
    effectiveZoom: 1.15,
    followCar: true,
    showTraffic: true,
    perspectiveStrength: 1.0,
    showLabels: true,
    showGrid: false,
    showCollision: false,
    mouseX: 0,
    mouseY: 0,
    dragging: false,
    dragLastX: 0,
    dragLastY: 0,
    shakePower: 0,
    shakeX: 0,
    shakeY: 0,
  };

  function setTrafficEnabled(enabled) {
    state.showTraffic = !!enabled;
    const chk = document.getElementById('toggle-traffic');
    if (chk) chk.checked = state.showTraffic;
    const btn = document.getElementById('btn-toggle-traffic');
    if (btn) {
      btn.textContent = state.showTraffic ? 'Ruch drogowy: WŁĄCZONY (T)' : 'Ruch drogowy: WYŁĄCZONY (T)';
      btn.style.background = state.showTraffic ? '#3b2d10' : '#2a1818';
      btn.style.color = state.showTraffic ? '#ffe07d' : '#ff8080';
      btn.style.borderColor = state.showTraffic ? '#d99b26' : '#a83838';
    }
  }

  // --- Enter / Exit Vehicle ("Wysiadanie i wsiadanie ludzikiem") & Pistol Firing ---
  function toggleEnterExitVehicle() {
    if (player.mode === 'car') {
      // Exit vehicle: place ludzik next to the left driver's door (or right door if blocked)
      const spec = CAR_SPECS[player.carIdx];
      const tx = Math.cos(player.angle);
      const ty = Math.sin(player.angle);
      const rx = -ty;
      const ry = tx;

      // Driver door is on the left (-rx, -ry)
      const doorDist = spec.width * 0.5 + 0.55;
      let exitX = player.x - rx * doorDist;
      let exitY = player.y - ry * doorDist;

      // Check if left side is inside a building tile; if so, exit on right side
      if (heightGrid && exitX >= 0 && exitX < WORLD_W && exitY >= 0 && exitY < WORLD_H) {
        if (heightGrid[Math.floor(exitY) * WORLD_W + Math.floor(exitX)] > 0) {
          exitX = player.x + rx * doorDist;
          exitY = player.y + ry * doorDist;
        }
      }

      player.mode = 'foot';
      player.pedX = exitX;
      player.pedY = exitY;
      player.pedVx = player.vx * 0.35;
      player.pedVy = player.vy * 0.35;
      player.pedAngle = player.angle - Math.PI * 0.5;
      player.handbrake = true;
      sfx.playDoorLatch();
    } else {
      // On foot -> try to enter own car or commandeer nearest AI traffic car!
      const distOwn = Math.hypot(player.pedX - player.x, player.pedY - player.y);
      let bestAiCar = null;
      let bestAiDist = 2.6;
      let bestAiSample = null;

      if (state.showTraffic) {
        for (const c of cars) {
          const s = samplePath(c.road.metric, c.dist);
          const ctx = s.tx * c.dir;
          const cty = s.ty * c.dir;
          const crx = -cty, cry = ctx;
          const laneOffset = c.road.oneway ? 0 : Math.min(1.1, c.road.w * 0.24);
          const cx = s.x + crx * laneOffset;
          const cy = s.y + cry * laneOffset;
          const d = Math.hypot(player.pedX - cx, player.pedY - cy);
          if (d < bestAiDist) {
            bestAiDist = d;
            bestAiCar = c;
            bestAiSample = { cx, cy, angle: Math.atan2(cty, ctx) };
          }
        }
      }

      if (distOwn <= 2.8 && (!bestAiCar || distOwn <= bestAiDist)) {
        player.mode = 'car';
        player.handbrake = false;
        sfx.playDoorLatch();
      } else if (bestAiCar && bestAiSample) {
        // GTA 1 Carjacking! Take over the AI car!
        player.mode = 'car';
        player.x = bestAiSample.cx;
        player.y = bestAiSample.cy;
        player.angle = bestAiSample.angle;
        player.vx = 0;
        player.vy = 0;
        player.angularVel = 0;
        player.damage = 0;
        // Move the hijacked AI car far ahead along its route so it doesn't overlap
        bestAiCar.dist = (bestAiCar.dist + 45) % bestAiCar.road.metric.total;
        sfx.playDoorLatch();
      }
    }
  }

  function firePistol() {
    if (player.shootCooldown > 0) return;
    player.shootCooldown = 0.16; // Semi-auto rapid fire rate
    player.muzzleFlashTimer = 0.06;

    const originX = player.mode === 'foot' ? player.pedX : player.x;
    const originY = player.mode === 'foot' ? player.pedY : player.y;

    // Aim toward mouse cursor if moved, otherwise along character/car facing angle
    let aimAngle = player.mode === 'foot' ? player.pedAngle : player.angle;
    if (state.mouseX > 0 && state.mouseY > 0) {
      const tilePx = BASE_TILE_PX * state.effectiveZoom;
      const worldMouseX = state.camX + (state.mouseX - canvas.width * 0.5) / tilePx;
      const worldMouseY = state.camY + (state.mouseY - canvas.height * 0.5) / tilePx;
      if (Math.hypot(worldMouseX - originX, worldMouseY - originY) > 0.25) {
        aimAngle = Math.atan2(worldMouseY - originY, worldMouseX - originX);
        if (player.mode === 'foot') player.pedAngle = aimAngle;
      }
    }

    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);
    const rightX = -dirY;
    const rightY = dirX;

    // Gun barrel tip position (held in right hand slightly forward)
    const muzzleX = originX + dirX * 0.45 + rightX * 0.14;
    const muzzleY = originY + dirY * 0.45 + rightY * 0.14;

    const bulletSpeed = 52.0; // ~104 m/s in 2m units/s
    const spread = (Math.random() - 0.5) * 0.04;
    const bAngle = aimAngle + spread;

    bullets.push({
      x: muzzleX,
      y: muzzleY,
      prevX: muzzleX,
      prevY: muzzleY,
      vx: Math.cos(bAngle) * bulletSpeed,
      vy: Math.sin(bAngle) * bulletSpeed,
      life: 0.65,
    });

    // Eject brass shell casing to the right + muzzle smoke puff
    spawnParticle(
      muzzleX, muzzleY,
      rightX * (2.5 + Math.random() * 2) - dirX * 1.0,
      rightY * (2.5 + Math.random() * 2) - dirY * 1.0,
      2.2, [255, 215, 90], 0.32, 'spark'
    );
    spawnParticle(
      muzzleX + dirX * 0.15, muzzleY + dirY * 0.15,
      dirX * 3.5 + (Math.random() - 0.5) * 1.5,
      dirY * 3.5 + (Math.random() - 0.5) * 1.5,
      3.8, [235, 235, 240], 0.22, 'smoke'
    );

    state.shakePower = Math.max(state.shakePower, 0.16);
    sfx.playGunshot();
  }

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    sfx.init();
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') e.preventDefault();
    keys.add(k);

    if ((k === 'f' || k === 'enter') && !e.repeat) {
      toggleEnterExitVehicle();
    } else if ((k === 'control' || (k === ' ' && player.mode === 'foot')) && !e.repeat) {
      firePistol();
    } else if (k >= '1' && k <= '4') {
      selectCar(Number(k) - 1);
      sfx.playCurbBump();
    } else if (k === 'r') {
      respawnPlayerAt(player.x, player.y);
      sfx.playCurbBump();
    } else if (k === 'c') {
      player.damage = 0;
    } else if (k === 'm') {
      sfx.toggleMute();
    } else if (k === 't' && !e.repeat) {
      setTrafficEnabled(!state.showTraffic);
      sfx.playCurbBump();
    } else if ((k === 'q' || k === 'e') && !e.repeat && player.mode !== 'foot') {
      const box = GEARBOXES[CAR_SPECS[player.carIdx].gearbox];
      if (box && box.kind === 'manual' && player.shiftTimer <= 0 && player.forwardSpeed > -0.5) {
        const next = (player.gear || 1) + (k === 'q' ? 1 : -1);
        if (next >= 1 && next <= box.ratios.length) {
          player.gear = next;
          player.shiftTimer = k === 'q' ? box.shiftUp : box.shiftDown;
          sfx.playGearShift(k === 'q');
        }
      }
    } else if (k === 'h') {
      player.sirenActive = !player.sirenActive;
      sfx.playHorn();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spawnParticle(
          player.x, player.y,
          Math.cos(a) * 6, Math.sin(a) * 6,
          3.5, [255, 230, 90], 0.35, 'spark'
        );
      }
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('mousedown', () => sfx.init());

  function selectCar(idx) {
    player.carIdx = Math.max(0, Math.min(CAR_SPECS.length - 1, idx));
    player.gear = 1;
    player.shiftTimer = 0;
    const btns = document.querySelectorAll('#car-selector button');
    btns.forEach((b, i) => b.classList.toggle('active', i === player.carIdx));
  }

  const carSelectorEl = document.getElementById('car-selector');
  if (carSelectorEl) {
    carSelectorEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-car]');
      if (!btn) return;
      selectCar(Number(btn.dataset.car));
    });
  }

  const btnRespawnRoad = document.getElementById('btn-respawn-road');
  if (btnRespawnRoad) {
    btnRespawnRoad.addEventListener('click', () => {
      respawnPlayerAt(player.x, player.y);
    });
  }

  const toggleCamFollowEl = document.getElementById('toggle-cam-follow');
  if (toggleCamFollowEl) {
    toggleCamFollowEl.addEventListener('change', (e) => {
      state.followCar = e.target.checked;
    });
  }

  const toggleTrafficEl = document.getElementById('toggle-traffic');
  if (toggleTrafficEl) {
    toggleTrafficEl.addEventListener('change', (e) => {
      setTrafficEnabled(e.target.checked);
    });
  }

  const btnToggleTrafficEl = document.getElementById('btn-toggle-traffic');
  if (btnToggleTrafficEl) {
    btnToggleTrafficEl.addEventListener('click', () => {
      sfx.init();
      setTrafficEnabled(!state.showTraffic);
      sfx.playCurbBump();
    });
  }

  // --- Map Switcher & Startup Modal Logic (Naramowicka 47 vs Trasa Opensite -> Karpia 21A) ---
  const mapModalEl = document.getElementById('map-select-modal');
  const btnOpenMapModal = document.getElementById('btn-open-map-modal');
  const mapSwitcherQuickEl = document.getElementById('map-switcher-Quick');
  const routeProgressGroupEl = document.getElementById('route-progress-group');
  const routeProgressSliderEl = document.getElementById('route-progress');
  const routePctEl = document.getElementById('route-pct');
  const panelMapTitleEl = document.getElementById('panel-map-title');
  const panelMapSubtitleEl = document.getElementById('panel-map-subtitle');
  const minimapHeaderEl = document.querySelector('.minimap-header');

  function populateQuickJumpsForMap() {
    const qj = document.getElementById('quick-jumps');
    if (!qj) return;
    qj.innerHTML = '';

    let jumps = [];
    if (activeMapKey === 'sehnde' && mapData.anchors) {
      const lm = mapData.landmarks || [];
      jumps = lm.slice(0, 8).map((item) => ({ label: item.name, x: item.x, y: item.y }));
      jumps.push({ label: 'Achardstraße 54', x: mapData.anchors.opensite.x, y: mapData.anchors.opensite.y });
      jumps.push({ label: 'Widok całości', x: WORLD_W * 0.5, y: WORLD_H * 0.5, zoom: 0.35 });
    } else if (activeMapKey === 'trasa' && mapData.anchors) {
      const lm = mapData.landmarks || [];
      jumps = [
        { label: '1. Opensite (Tuczno)', x: mapData.anchors.opensite.x, y: mapData.anchors.opensite.y },
        { label: '2. Wierzonka / Szosa', x: lm[3] ? lm[3].x : mapData.anchors.opensite.x, y: lm[3] ? lm[3].y : mapData.anchors.opensite.y },
        { label: '3. Las Puszcza Zielonka', x: lm[4] ? lm[4].x : mapData.anchors.kicin.x, y: lm[4] ? lm[4].y : mapData.anchors.kicin.y },
        { label: '4. Szkoła (Kicin 500m)', x: mapData.anchors.kicin.x, y: mapData.anchors.kicin.y },
        { label: '5. Koziegłowy / Gdyńska', x: lm[5] ? lm[5].x : mapData.anchors.kicin.x, y: lm[5] ? lm[5].y : mapData.anchors.kicin.y },
        { label: '6. Most Lecha (Warta)', x: lm[6] ? lm[6].x : mapData.anchors.karpia.x, y: lm[6] ? lm[6].y : mapData.anchors.karpia.y },
        { label: '7. HQ Systemia (Karpia 21A)', x: mapData.anchors.karpia.x, y: mapData.anchors.karpia.y },
        { label: 'Widok całej trasy', x: WORLD_W * 0.5, y: WORLD_H * 0.5, zoom: 0.11 },
      ];
    } else {
      jumps = [
        { label: 'Naramowicka 47', x: 250, y: 250 },
        { label: 'Rondo Solidarności', x: 275, y: 200 },
        { label: 'Os. Kosmonautów', x: 235, y: 160 },
        { label: 'Os. Pod Lipami', x: 119, y: 288 },
        { label: 'Wilczak / Serbska', x: 365, y: 255 },
        { label: 'Miasto Wnętrz / Giga', x: 393, y: 195 },
        { label: 'Ul. Murawa / Park', x: 190, y: 360 },
      ];
    }

    for (const j of jumps) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.x = Math.round(j.x);
      btn.dataset.y = Math.round(j.y);
      if (j.zoom) btn.dataset.zoom = j.zoom;
      btn.textContent = j.label;
      qj.appendChild(btn);
    }
  }

  function loadSelectedMap(mapKey) {
    if (mapKey === 'trasa' && !TRASA_MAP) {
      alert('Brak danych nowej trasy w data/trasa-opensite-karpia.js!');
      return;
    }
    if (mapKey === 'sehnde' && !SEHNDE_MAP) {
      alert('Brak danych mapy Sehnde w data/sehnde-achardstrasse54.js!');
      return;
    }
    activeMapKey = mapKey === 'trasa' ? 'trasa' : (mapKey === 'sehnde' ? 'sehnde' : 'naramowicka');
    mapData = activeMapKey === 'trasa' ? TRASA_MAP : (activeMapKey === 'sehnde' ? SEHNDE_MAP : NARA_MAP);

    WORLD_W = mapData.meta.gridWidth || mapData.meta.worldWidth || 500;
    WORLD_H = mapData.meta.gridHeight || mapData.meta.worldHeight || 500;
    GRID = WORLD_W;

    groundGrid = decodeUint8(mapData.groundBase64);
    heightGrid = decodeUint8(mapData.heightBase64);
    styleGrid = decodeUint8(mapData.styleBase64);

    // Rebuild GPU Ground Texture & 2.5D Buildings VBO for the chosen map
    if (groundTex) gl.deleteTexture(groundTex);
    groundTex = buildSmoothGroundTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, groundTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bldgAtlasTex);

    if (mesh && mesh.vbo) gl.deleteBuffer(mesh.vbo);
    mesh = buildVectorMesh();

    if (usesSectorMap()) {
      prepareTrasaVectorLayers(mapData);
    }

    rebuildTrafficAndTrams();
    buildWallSpatialHash();
    buildRoadSpatialHash();
    buildMinimapBase();
    populateQuickJumpsForMap();

    skidMarks.length = 0;
    particles.length = 0;

    if (activeMapKey === 'trasa' && mapData.anchors) {
      respawnPlayerAt(mapData.anchors.opensite.x, mapData.anchors.opensite.y);
      if (panelMapTitleEl) panelMapTitleEl.textContent = 'TRASA: OPENSITE → KARPIA';
      if (panelMapSubtitleEl) panelMapSubtitleEl.textContent = 'Tuczno (500m) → Kicin SP (500m) → Karpia 21A (21.8 km)';
      if (minimapHeaderEl) minimapHeaderEl.textContent = 'RADAR TRASY (21.8 KM) — KLIKNIJ BY SKOCZYĆ';
      if (routeProgressGroupEl) routeProgressGroupEl.classList.remove('hidden');
      if (routeProgressSliderEl) routeProgressSliderEl.value = 0;
      if (routePctEl) routePctEl.textContent = '0%';
    } else if (activeMapKey === 'sehnde' && mapData.anchors) {
      respawnPlayerAt(mapData.anchors.opensite.x, mapData.anchors.opensite.y);
      if (panelMapTitleEl) panelMapTitleEl.textContent = 'SEHNDE: ACHARDSTRAßE 54';
      if (panelMapSubtitleEl) panelMapSubtitleEl.textContent = '31319 Sehnde, Niemcy • średnica 2 km';
      if (minimapHeaderEl) minimapHeaderEl.textContent = 'RADAR SEHNDE (2 KM) — KLIKNIJ BY SKOCZYĆ';
      if (routeProgressGroupEl) routeProgressGroupEl.classList.add('hidden');
    } else {
      respawnPlayerAt(250, 250);
      if (panelMapTitleEl) panelMapTitleEl.textContent = 'GTA 1: NARAMOWICKA 47';
      if (panelMapSubtitleEl) panelMapSubtitleEl.textContent = 'Winogrady • Fizyka jazdy 2.5D • Poślizgi • Odbicia';
      if (minimapHeaderEl) minimapHeaderEl.textContent = 'RADAR (1×1 KM) — KLIKNIJ BY SKOCZYĆ';
      if (routeProgressGroupEl) routeProgressGroupEl.classList.add('hidden');
    }

    state.camX = player.x;
    state.camY = player.y;

    // Highlight active buttons
    if (mapSwitcherQuickEl) {
      mapSwitcherQuickEl.querySelectorAll('button[data-switch-map]').forEach((b) => {
        b.classList.toggle('active', b.dataset.switchMap === activeMapKey);
      });
    }
    if (mapModalEl) {
      mapModalEl.querySelectorAll('.map-card[data-select-map]').forEach((c) => {
        c.classList.toggle('active', c.dataset.selectMap === activeMapKey);
      });
      mapModalEl.classList.add('hidden');
    }
  }

  if (mapModalEl) {
    mapModalEl.addEventListener('click', (e) => {
      const card = e.target.closest('[data-select-map]');
      if (!card) return;
      sfx.init();
      loadSelectedMap(card.dataset.selectMap);
      sfx.playCurbBump();
    });
  }

  if (btnOpenMapModal && mapModalEl) {
    btnOpenMapModal.addEventListener('click', () => {
      mapModalEl.classList.remove('hidden');
    });
  }

  if (mapSwitcherQuickEl) {
    mapSwitcherQuickEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-switch-map]');
      if (!btn) return;
      sfx.init();
      loadSelectedMap(btn.dataset.switchMap);
      sfx.playCurbBump();
    });
  }

  if (routeProgressSliderEl) {
    routeProgressSliderEl.addEventListener('input', (e) => {
      if (!mainRouteMetric) return;
      const permille = Number(e.target.value);
      const dist = (permille / 1000) * mainRouteMetric.total;
      const pt = samplePath(mainRouteMetric, dist);
      player.x = pt.x;
      player.y = pt.y;
      player.angle = Math.atan2(pt.ty, pt.tx);
      player.vx = 0;
      player.vy = 0;
      player.angularVel = 0;
      state.camX = player.x;
      state.camY = player.y;
      const km = ((permille / 1000) * (mapData.meta.routeDistanceKm || 21.8)).toFixed(1);
      if (routePctEl) routePctEl.textContent = `${Math.round(permille / 10)}% (${km} km)`;
    });
  }

  // Allow URL query ?map=trasa to jump directly to the new route map
  if (window.location.search.includes('map=trasa')) {
    loadSelectedMap('trasa');
  } else if (window.location.search.includes('map=sehnde')) {
    loadSelectedMap('sehnde');
  }

  function resizeCanvases() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    labelCanvas.width = w;
    labelCanvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  window.addEventListener('resize', resizeCanvases);
  resizeCanvases();

  canvas.addEventListener('mousedown', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    if (e.button === 0 && player.mode === 'foot') {
      firePistol();
      return;
    }
    state.dragging = true;
    state.dragLastX = e.clientX;
    state.dragLastY = e.clientY;
  });

  window.addEventListener('mouseup', () => {
    state.dragging = false;
  });

  window.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    if (state.dragging) {
      const tilePx = BASE_TILE_PX * state.effectiveZoom;
      const dx = (e.clientX - state.dragLastX) / tilePx;
      const dy = (e.clientY - state.dragLastY) / tilePx;
      state.camX = Math.max(10, Math.min(WORLD_W - 10, state.camX - dx));
      state.camY = Math.max(10, Math.min(WORLD_H - 10, state.camY - dy));
      state.dragLastX = e.clientX;
      state.dragLastY = e.clientY;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    state.zoom = Math.max(0.40, Math.min(2.8, +(state.zoom * factor).toFixed(2)));
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomVal = document.getElementById('zoom-val');
    if (zoomSlider) zoomSlider.value = Math.round(state.zoom * 100);
    if (zoomVal) zoomVal.textContent = `${state.zoom.toFixed(2)}x`;
  }, { passive: false });

  document.getElementById('persp-slider').addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.perspectiveStrength = val / 100;
    document.getElementById('persp-val').textContent = `${val}%`;
  });

  document.getElementById('zoom-slider').addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.zoom = val / 100;
    document.getElementById('zoom-val').textContent = `${state.zoom.toFixed(2)}x`;
  });

  const volumeSliderEl = document.getElementById('volume-slider');
  if (volumeSliderEl) {
    volumeSliderEl.addEventListener('input', (e) => {
      sfx.init();
      const val = Number(e.target.value);
      sfx.muted = val === 0;
      sfx.setVolume(val / 100);
      const volValEl = document.getElementById('volume-val');
      if (volValEl) volValEl.textContent = val === 0 ? 'WYCISZONY' : `${val}%`;
    });
  }

  document.getElementById('toggle-labels').addEventListener('change', (e) => {
    state.showLabels = e.target.checked;
  });

  document.getElementById('toggle-grid').addEventListener('change', (e) => {
    state.showGrid = e.target.checked;
  });

  document.getElementById('toggle-collision').addEventListener('change', (e) => {
    state.showCollision = e.target.checked;
  });

  document.getElementById('quick-jumps').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-x]');
    if (!btn) return;
    const tx = Number(btn.dataset.x);
    const ty = Number(btn.dataset.y);
    if (btn.dataset.zoom) {
      state.followCar = false;
      const toggleCamEl = document.getElementById('toggle-cam-follow');
      if (toggleCamEl) toggleCamEl.checked = false;
      state.camX = tx;
      state.camY = ty;
      state.zoom = Number(btn.dataset.zoom);
      state.effectiveZoom = state.zoom;
      const zoomVal = document.getElementById('zoom-val');
      if (zoomVal) zoomVal.textContent = `${state.zoom.toFixed(2)}x`;
      return;
    }
    if (!state.followCar && state.zoom < 0.4) {
      state.followCar = true;
      const toggleCamEl = document.getElementById('toggle-cam-follow');
      if (toggleCamEl) toggleCamEl.checked = true;
      state.zoom = 1.15;
    }
    respawnPlayerAt(tx, ty);
    state.camX = player.x;
    state.camY = player.y;
  });

  minimapCanvas.addEventListener('mousedown', (e) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const tx = Math.max(10, Math.min(WORLD_W - 10, mx * WORLD_W));
    const ty = Math.max(10, Math.min(WORLD_H - 10, my * WORLD_H));
    respawnPlayerAt(tx, ty);
    state.camX = player.x;
    state.camY = player.y;
  });

  // --- 9.5. Player Vehicle Physics & Vector Collision Step ---
  function sampleGroundAt(x, y) {
    if (groundGrid && x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H) {
      const gx = Math.floor(x);
      const gy = Math.floor(y);
      return groundGrid[gy * WORLD_W + gx];
    }

    // Vector surface lookup for Trasa Opensite -> Karpia 21A map
    const cx = Math.floor(x / ROAD_CELL);
    const cy = Math.floor(y / ROAD_CELL);
    let bestSurface = GROUND.GRASS;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const segs = roadBuckets.get(`${cx + dx},${cy + dy}`);
        if (!segs) continue;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const vx = s.x1 - s.x0;
          const vy = s.y1 - s.y0;
          const l2 = vx * vx + vy * vy;
          const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((x - s.x0) * vx + (y - s.y0) * vy) / l2)) : 0;
          const d = Math.hypot(x - (s.x0 + t * vx), y - (s.y0 + t * vy));
          if (d <= s.halfW) {
            if (s.kind === 'footway') {
              if (bestSurface < GROUND.SIDEWALK) bestSurface = GROUND.SIDEWALK;
            } else if (s.kind === 'cobble') {
              if (bestSurface < GROUND.ROAD_COBBLE) bestSurface = GROUND.ROAD_COBBLE;
            } else {
              return GROUND.ROAD_ASPHALT;
            }
          } else if (s.hasSidewalk && d <= s.halfW + 1.1) {
            if (bestSurface < GROUND.SIDEWALK) bestSurface = GROUND.SIDEWALK;
          }
        }
      }
    }
    return bestSurface;
  }

  function updatePlayerPhysics(dt) {
    const spec = CAR_SPECS[player.carIdx];
    const isFoot = player.mode === 'foot';

    if (player.shootCooldown > 0) player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    if (player.muzzleFlashTimer > 0) player.muzzleFlashTimer = Math.max(0, player.muzzleFlashTimer - dt);

    // Sample surface under active player entity (ludzik or car)
    const activeX = isFoot ? player.pedX : player.x;
    const activeY = isFoot ? player.pedY : player.y;
    const gType = sampleGroundAt(activeX, activeY);
    const surf = SURFACE_PHYSICS[gType] || SURFACE_PHYSICS[GROUND.URBAN_PAVED];

    // Detect curb / offroad transition bump when driving
    if (!isFoot && gType !== player.lastSurfaceType) {
      const wasRoad = player.lastSurfaceType >= GROUND.ROAD_ASPHALT;
      const isRoad = gType >= GROUND.ROAD_ASPHALT;
      if (wasRoad !== isRoad && player.speed > 4.0) {
        player.curbBumpTimer = 0.18;
        sfx.playCurbBump();
      }
      player.lastSurfaceType = gType;
    }
    player.surfaceType = gType;
    if (player.curbBumpTimer > 0) player.curbBumpTimer = Math.max(0, player.curbBumpTimer - dt);
    if (player.collisionFlash > 0) player.collisionFlash = Math.max(0, player.collisionFlash - dt);
    if (player.sirenActive || spec.isPolice) player.sirenPhase += dt;

    // Input controls (when on foot, car inputs are zeroed so the parked car coasts to a stop)
    const rawUp = (keys.has('w') || keys.has('arrowup')) ? 1 : 0;
    const rawDown = (keys.has('s') || keys.has('arrowdown')) ? 1 : 0;
    const rawLeft = (keys.has('a') || keys.has('arrowleft')) ? 1 : 0;
    const rawRight = (keys.has('d') || keys.has('arrowright')) ? 1 : 0;

    // --- ON-FOOT ("LUDZIK") MOVEMENT & BUILDING COLLISION ---
    if (isFoot) {
      const moveX = rawRight - rawLeft;
      const moveY = rawDown - rawUp;
      const moveLen = Math.hypot(moveX, moveY);
      const pedMaxSpeed = (gType === GROUND.GRASS ? 4.4 : 5.4); // ~35-38 km/h arcade sprint

      if (moveLen > 0) {
        const nx = moveX / moveLen;
        const ny = moveY / moveLen;
        player.pedVx = nx * pedMaxSpeed;
        player.pedVy = ny * pedMaxSpeed;
        player.pedAngle = Math.atan2(ny, nx);
        player.walkCycle += dt * 16.0;

        player.stepSoundTimer -= dt;
        if (player.stepSoundTimer <= 0) {
          player.stepSoundTimer = 0.24;
          sfx.playFootstep(gType === GROUND.GRASS);
        }
      } else {
        player.pedVx *= Math.exp(-18.0 * dt);
        player.pedVy *= Math.exp(-18.0 * dt);
      }

      const prevPedX = player.pedX;
      const prevPedY = player.pedY;
      player.pedX = Math.max(4, Math.min(WORLD_W - 4, player.pedX + player.pedVx * dt));
      player.pedY = Math.max(4, Math.min(WORLD_H - 4, player.pedY + player.pedVy * dt));

      // Collide ludzik circle (radius 0.34) with Vector Building Walls
      const pedRadius = 0.34;
      const pCellX = Math.floor(player.pedX / COLL_CELL);
      const pCellY = Math.floor(player.pedY / COLL_CELL);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const walls = getWallBucket(pCellX + dx, pCellY + dy);
          for (let w = 0; w < walls.length; w++) {
            const seg = walls[w];
            const wx = seg.x1 - seg.x0;
            const wy = seg.y1 - seg.y0;
            const l2 = seg.len * seg.len;
            const t = Math.max(0, Math.min(1, ((player.pedX - seg.x0) * wx + (player.pedY - seg.y0) * wy) / l2));
            const closestX = seg.x0 + t * wx;
            const closestY = seg.y0 + t * wy;
            const distX = player.pedX - closestX;
            const distY = player.pedY - closestY;
            const dSq = distX * distX + distY * distY;
            if (dSq < pedRadius * pedRadius && dSq > 1e-9) {
              const d = Math.sqrt(dSq);
              let nx = distX / d, ny = distY / d;
              if (nx * seg.nx + ny * seg.ny < 0) { nx = seg.nx; ny = seg.ny; }
              player.pedX += nx * (pedRadius - d + 0.01);
              player.pedY += ny * (pedRadius - d + 0.01);
            }
          }
        }
      }

      if (groundGrid && heightGrid) {
        const pIdx = Math.floor(player.pedY) * WORLD_W + Math.floor(player.pedX);
        if (groundGrid[pIdx] === GROUND.WATER || heightGrid[pIdx] > 0) {
          player.pedX = prevPedX;
          player.pedY = prevPedY;
        }
      }

      // Also collide ludzik against parked player car so he walks around it
      const dxCar = player.pedX - player.x;
      const dyCar = player.pedY - player.y;
      const minCarDist = 0.85;
      const dCarSq = dxCar * dxCar + dyCar * dyCar;
      if (dCarSq < minCarDist * minCarDist && dCarSq > 1e-6) {
        const d = Math.sqrt(dCarSq);
        player.pedX += (dxCar / d) * (minCarDist - d);
        player.pedY += (dyCar / d) * (minCarDist - d);
      }

      // Allow holding spacebar or Ctrl for rapid pistol fire on foot
      if (keys.has(' ') || keys.has('control')) {
        firePistol();
      }
    }

    const throttleInput = isFoot ? 0 : rawUp;
    const reverseInput = isFoot ? 0 : rawDown;
    const leftInput = isFoot ? 0 : rawLeft;
    const rightInput = isFoot ? 0 : rawRight;
    const steerInput = rightInput - leftInput;
    const handbrake = isFoot ? true : keys.has(' ');

    player.handbrake = handbrake;
    player.steerAngle = steerInput * 0.58;

    // Vehicle basis vectors (tx, ty = Forward, rx, ry = Right)
    let tx = Math.cos(player.angle);
    let ty = Math.sin(player.angle);
    let rx = -ty;
    let ry = tx;

    // Decompose velocity into longitudinal (vFwd) and lateral (vLat) components
    let vFwd = player.vx * tx + player.vy * ty;
    let vLat = player.vx * rx + player.vy * ry;

    player.braking = false;
    player.reversing = false;

    const maxAllowedSpeed = spec.maxSpeed * surf.maxSpeedMul;

    const fwdKmh = Math.max(0, vFwd * 7.2);
    let activeGearSpec = { engineBrakeMul: 0.35, minKmh: 0, maxGearKmh: 200 };

    if (spec.drivetrain === 'ev') {
      // Single-speed reduction gear: motor rpm tracks road speed, no clutch shifts.
      player.gear = 1;
      player.shiftTimer = 0;
      const speedNorm = Math.min(1, Math.abs(vFwd) / Math.max(1, spec.maxSpeed));
      player.rpmNorm = 0.06 + speedNorm * 0.94;
    } else {
      if (player.shiftTimer > 0) {
        player.shiftTimer = Math.max(0, player.shiftTimer - dt);
      }
      const box = GEARBOXES[spec.gearbox] || GEARBOXES.auto8;
      const curGearIdx = Math.max(0, Math.min(box.ratios.length - 1, (player.gear || 1) - 1));
      const gSpec = box.ratios[curGearIdx];

      if (vFwd < -0.5 && box.kind !== 'manual') {
        player.gear = 1;
      } else if (box.kind !== 'manual' && player.shiftTimer <= 0) {
        if (curGearIdx < box.ratios.length - 1 && fwdKmh >= gSpec.upshiftKmh && throttleInput > 0) {
          player.gear = curGearIdx + 2;
          player.shiftTimer = box.shiftUp;
          sfx.playGearShift(true);
        } else if (curGearIdx > 0 && fwdKmh <= gSpec.downshiftKmh) {
          player.gear = curGearIdx;
          player.shiftTimer = box.shiftDown;
          sfx.playGearShift(false);
        }
      }

      activeGearSpec = box.ratios[Math.max(0, Math.min(box.ratios.length - 1, (player.gear || 1) - 1))];
      if (vFwd < -0.5) {
        player.rpmNorm = Math.min(0.95, 0.18 + (Math.abs(vFwd) * 7.2) / 55);
      } else {
        const span = Math.max(12, activeGearSpec.maxGearKmh - activeGearSpec.minKmh);
        let targetRpm = 0.14 + Math.max(0, (fwdKmh - activeGearSpec.minKmh) / span) * 0.86;
        if (spec.drivetrain === 'diesel') targetRpm = 0.22 + targetRpm * 0.62;
        if (player.drifting && throttleInput > 0) {
          targetRpm = Math.min(1.0, targetRpm + 0.12);
        }
        if (player.shiftTimer > 0) targetRpm *= 0.65;
        player.rpmNorm += (Math.min(1.0, targetRpm) - player.rpmNorm) * Math.min(1.0, 18.0 * dt);
      }
    }

    const vMs = vFwd * 2.0; // Convert 2m units/s to real meters/second (m/s)
    const massKg = spec.massKg || 1500;
    const driveline = spec.drivetrain === 'ev' ? 0.92 : 0.85;
    const wheelPowerWatts = (spec.powerHp || 200) * 735.5 * driveline;

    if (throttleInput > 0) {
      if (vFwd < -0.25) {
        // Braking while moving backwards
        vFwd = Math.min(0, vFwd + spec.brakeForce * surf.grip * dt);
        player.braking = true;
      } else if (player.shiftTimer <= 0 && vFwd < maxAllowedSpeed) {
        // True physics power-to-weight & traction model:
        // 1) Below ~35 km/h (9.5 m/s), acceleration is capped by tire traction & clutch slip (maxLaunchG ~ 0.50g)
        //    so the car doesn't launch like a rocket from 0 to 100 km/h!
        // 2) Above 35 km/h, wheel force follows F = P_wheel / v, giving strong, sustained pull from 100 to 180+ km/h!
        let powerBand = spec.drivetrain === 'ev'
          ? 0.97
          : (spec.drivetrain === 'diesel'
            ? 0.90
            : (0.78 + 0.24 * Math.sin(player.rpmNorm * Math.PI * 0.92)));
        const boxNow = GEARBOXES[spec.gearbox];
        if (boxNow && boxNow.kind === 'manual') {
          if (player.rpmNorm > 0.98) powerBand = 0;
          else powerBand *= Math.min(1, 0.2 + player.rpmNorm * 1.15);
        }
        const maxTireForceN = massKg * 9.81 * (spec.maxLaunchG || 0.50) * surf.grip;
        const vEffMs = Math.max(8.5, Math.abs(vMs));
        const powerForceN = (wheelPowerWatts * powerBand * surf.grip) / vEffMs;
        const driveForceN = Math.min(maxTireForceN, powerForceN);

        const accelMs2 = driveForceN / massKg;
        vFwd += (accelMs2 * 0.5) * dt; // 1 unit/s^2 = 2 m/s^2 -> divide m/s^2 by 2
      }
    } else if (reverseInput > 0) {
      if (vFwd > 0.6) {
        // Service brake while moving forward (~9.6 m/s^2 on dry asphalt)
        vFwd = Math.max(0, vFwd - spec.brakeForce * surf.grip * dt);
        player.braking = true;
      } else {
        // Reverse gear (max ~42 km/h)
        vFwd = Math.max(-5.8 * surf.maxSpeedMul, vFwd - spec.reverseForce * surf.grip * dt);
        player.reversing = true;
      }
    }

    // Handbrake slows longitudinal speed moderately while unlocking the rear axle for drift!
    if (handbrake) {
      player.braking = true;
      const hbDecel = 3.2 * surf.grip * dt;
      if (Math.abs(vFwd) <= hbDecel) vFwd = 0;
      else vFwd -= Math.sign(vFwd) * hbDecel;
    }

    // True Aerodynamic Drag (F_aero = 0.5 * rho * CdA * v^2) + Rolling Resistance + Engine Braking:
    // Unlike linear damping, quadratic aero drag is very small below 150 km/h (so 100->180 km/h pulls hard!)
    // and naturally balances 200 HP around 210 km/h.
    const curVMs = vFwd * 2.0;
    const surfaceRollMul = surf.drag / 0.24; // 1.0 on asphalt, higher on grass/sidewalk
    const aeroDragN = 0.5 * 1.225 * (spec.cdA || 0.62) * curVMs * Math.abs(curVMs);
    const rollResistN = Math.sign(curVMs) * massKg * 9.81 * 0.013 * surfaceRollMul;
    const engBrakeN = (!throttleInput && !reverseInput && Math.abs(curVMs) > 0.5)
      ? Math.sign(curVMs) * massKg * 0.42 * (activeGearSpec.engineBrakeMul || 1.0)
      : 0;

    const totalResistUnitsPerS2 = ((aeroDragN + rollResistN + engBrakeN) / massKg) * 0.5;
    const resistStep = totalResistUnitsPerS2 * dt;
    if (!throttleInput && !reverseInput && Math.abs(vFwd) <= Math.abs(resistStep) + 0.02) {
      vFwd = 0;
    } else {
      vFwd -= resistStep;
    }

    // Steering angular velocity (GTA 1 style: responsive at medium speeds, slightly heavier at top speed, kicks tail on handbrake!)
    const absSpeed = Math.hypot(vFwd, vLat);
    if (absSpeed > 0.35 && steerInput !== 0) {
      const dirSign = vFwd >= -0.2 ? 1 : -1;
      const speedNorm = Math.min(1.0, absSpeed / 4.2);
      const highSpeedDamp = 1.0 - Math.min(0.28, (absSpeed / spec.maxSpeed) * 0.28);
      const driftBoost = handbrake ? 1.32 : (Math.abs(vLat) > 2.2 ? 1.15 : 1.0);

      const targetAngVel = steerInput * dirSign * spec.turnRate * speedNorm * highSpeedDamp * driftBoost;
      player.angularVel += (targetAngVel - player.angularVel) * Math.min(1, 14 * dt);

      // Classic GTA 1 Arcade Tail Kick: turning at speed pushes lateral velocity outward for juicy powerslides!
      if (absSpeed > 5.0) {
        const tailKick = steerInput * dirSign * (handbrake ? spec.oversteerTailKick * 1.45 : spec.oversteerTailKick * 0.45);
        vLat -= tailKick * (absSpeed / spec.maxSpeed) * 12.0 * dt;
      }
    } else {
      player.angularVel *= Math.exp(-10.0 * dt);
    }

    // Integrate vehicle heading angle
    player.angle += player.angularVel * dt;
    tx = Math.cos(player.angle);
    ty = Math.sin(player.angle);
    rx = -ty;
    ry = tx;

    // Lateral Tire Grip (The core of GTA 1 drift physics!)
    // On asphalt: high lateral grip unless handbrake is pulled or high slip angle.
    // On grass/park or tram rails: low lateral grip -> long, wide slides!
    let latGrip = handbrake ? spec.handbrakeLatGrip : spec.baseLatGrip;
    latGrip *= surf.grip;

    // Dynamic slip-angle grip drop (once the rear breaks loose, it stays slidey until counter-steered)
    const slipRatio = Math.abs(vLat) / (Math.abs(vFwd) + 1.5);
    if (slipRatio > 0.32 && !handbrake) {
      latGrip *= 0.68;
    }

    const latFriction = latGrip * 2.6 * dt;
    if (Math.abs(vLat) <= latFriction) {
      vLat = 0;
    } else {
      vLat -= Math.sign(vLat) * latFriction;
    }
    vLat *= Math.exp(-latGrip * 0.22 * dt);

    // Reconstruct world velocity
    player.vx = tx * vFwd + rx * vLat;
    player.vy = ty * vFwd + ry * vLat;
    player.forwardSpeed = vFwd;
    player.lateralSpeed = vLat;
    player.speed = Math.hypot(player.vx, player.vy);

    // Proposed new position
    const prevX = player.x;
    const prevY = player.y;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Keep within map boundaries
    const margin = 4.0;
    if (player.x < margin) { player.x = margin; player.vx = Math.abs(player.vx) * 0.6; }
    if (player.x > WORLD_W - margin) { player.x = WORLD_W - margin; player.vx = -Math.abs(player.vx) * 0.6; }
    if (player.y < margin) { player.y = margin; player.vy = Math.abs(player.vy) * 0.6; }
    if (player.y > WORLD_H - margin) { player.y = WORLD_H - margin; player.vy = -Math.abs(player.vy) * 0.6; }

    // --- Vector Building Polygon Collision & Elastic Bounce with Angular Impulse! ---
    // Represent car body with 3 overlapping collision spheres along its chassis (Front bumper, Center, Rear bumper)
    const halfLen = spec.length * 0.5;
    const sphereRadius = spec.width * 0.50;
    const sphereOffsets = [halfLen - sphereRadius * 0.65, 0, -(halfLen - sphereRadius * 0.65)];

    const cellX = Math.floor(player.x / COLL_CELL);
    const cellY = Math.floor(player.y / COLL_CELL);

    let hitOccurred = false;
    let maxImpactSpeed = 0;
    let hitPointX = player.x;
    let hitPointY = player.y;
    let hitNormalX = 0;
    let hitNormalY = 0;

    // Check 3x3 neighborhood in wall spatial hash
    for (let pass = 0; pass < 2; pass++) {
      for (let sIdx = 0; sIdx < sphereOffsets.length; sIdx++) {
        const off = sphereOffsets[sIdx];
        const sx = player.x + tx * off;
        const sy = player.y + ty * off;

        for (let dy = -1; dy <= 1; dy++) {
          const cy = cellY + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const cx = cellX + dx;
            const walls = getWallBucket(cx, cy);

            for (let w = 0; w < walls.length; w++) {
              const seg = walls[w];
              const wx = seg.x1 - seg.x0;
              const wy = seg.y1 - seg.y0;
              const l2 = seg.len * seg.len;
              let t = ((sx - seg.x0) * wx + (sy - seg.y0) * wy) / l2;
              t = Math.max(0, Math.min(1, t));

              const closestX = seg.x0 + t * wx;
              const closestY = seg.y0 + t * wy;
              const distX = sx - closestX;
              const distY = sy - closestY;
              const distSq = distX * distX + distY * distY;

              if (distSq < sphereRadius * sphereRadius && distSq > 1e-9) {
                const dist = Math.sqrt(distSq);
                let nx = distX / dist;
                let ny = distY / dist;
                // Prefer outward wall normal if deeply penetrating
                if (nx * seg.nx + ny * seg.ny < 0) {
                  nx = seg.nx;
                  ny = seg.ny;
                }

                const penetration = sphereRadius - dist + 0.015;
                player.x += nx * penetration;
                player.y += ny * penetration;

                // Relative velocity along collision normal
                const vn = player.vx * nx + player.vy * ny;
                if (vn < 0) {
                  const restitution = spec.bounciness;
                  const impulse = -(1.0 + restitution) * vn;
                  player.vx += nx * impulse;
                  player.vy += ny * impulse;

                  // Tangential wall scraping friction (allows smooth sliding along diagonal walls!)
                  const vtX = player.vx - (player.vx * nx + player.vy * ny) * nx;
                  const vtY = player.vy - (player.vx * nx + player.vy * ny) * ny;
                  player.vx = vtX * 0.88 + (player.vx * nx + player.vy * ny) * nx;
                  player.vy = vtY * 0.88 + (player.vx * nx + player.vy * ny) * ny;

                  // Torque / Angular spin when front or rear bumper clips a building corner!
                  const rArmX = closestX - player.x;
                  const rArmY = closestY - player.y;
                  const torque = rArmX * (ny * impulse) - rArmY * (nx * impulse);
                  player.angularVel += Math.max(-9.5, Math.min(9.5, torque * 0.65));

                  hitOccurred = true;
                  if (-vn > maxImpactSpeed) {
                    maxImpactSpeed = -vn;
                    hitPointX = closestX;
                    hitPointY = closestY;
                    hitNormalX = nx;
                    hitNormalY = ny;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Fallback check: if center ever enters a water tile or deep inside an un-hashed building tile, bounce out
    if (groundGrid && heightGrid) {
      const curIdx = Math.floor(player.y) * WORLD_W + Math.floor(player.x);
      if (groundGrid[curIdx] === GROUND.WATER || heightGrid[curIdx] > 0) {
        player.x = prevX;
        player.y = prevY;
        player.vx *= -0.55;
        player.vy *= -0.55;
        player.angularVel += (Math.random() - 0.5) * 5.0;
        hitOccurred = true;
        maxImpactSpeed = Math.max(maxImpactSpeed, 5.0);
        hitPointX = player.x;
        hitPointY = player.y;
      }
    }

    // Dynamic Traffic & Tram Collisions (Bounce off moving cars & MPK trams!)
    if (state.showTraffic) {
      for (const c of cars) {
        const s = samplePath(c.road.metric, c.dist);
        const ctx = s.tx * c.dir;
        const cty = s.ty * c.dir;
        const crx = -cty, cry = ctx;
        const laneOffset = c.road.oneway ? 0 : Math.min(1.1, c.road.w * 0.24);
        const cx = s.x + crx * laneOffset;
        const cy = s.y + cry * laneOffset;

        const dx = player.x - cx;
        const dy = player.y - cy;
        const minDist = 1.35;
        const dSq = dx * dx + dy * dy;
        if (dSq < minDist * minDist && dSq > 0.001) {
          const d = Math.sqrt(dSq);
          const nx = dx / d, ny = dy / d;
          player.x += nx * (minDist - d + 0.05);
          player.y += ny * (minDist - d + 0.05);
          const vn = player.vx * nx + player.vy * ny;
          if (vn < 2.0) {
            const boost = Math.max(4.0, -vn * 1.45);
            player.vx += nx * boost;
            player.vy += ny * boost;
            player.angularVel += (Math.random() - 0.5) * 4.5;
            // Push the AI car forward/backward along its road!
            c.dist += (nx * ctx + ny * cty < 0 ? 1.4 : -1.4) * c.dir;
            hitOccurred = true;
            maxImpactSpeed = Math.max(maxImpactSpeed, boost);
            hitPointX = (player.x + cx) * 0.5;
            hitPointY = (player.y + cy) * 0.5;
            hitNormalX = nx;
            hitNormalY = ny;
          }
        }
      }
    }

    if (hitOccurred && maxImpactSpeed > 1.8) {
      player.collisionFlash = 0.14;
      player.damage = Math.min(100, player.damage + maxImpactSpeed * 0.8);
      state.shakePower = Math.min(1.2, maxImpactSpeed * 0.065);
      sfx.playCrash(maxImpactSpeed);
      if (maxImpactSpeed > 6.5) {
        player.driftCombo = 0; // Hard crash resets active drift combo
      }
      // Emit orange/yellow impact sparks!
      const sparkCount = Math.min(18, Math.floor(maxImpactSpeed * 1.6) + 4);
      for (let i = 0; i < sparkCount; i++) {
        const spread = (Math.random() - 0.5) * 2.2;
        const svx = (hitNormalX + spread) * (4 + Math.random() * 10);
        const svy = (hitNormalY + spread) * (4 + Math.random() * 10);
        spawnParticle(
          hitPointX, hitPointY,
          svx, svy,
          2.0 + Math.random() * 2.0,
          Math.random() > 0.35 ? [255, 210, 65] : [255, 110, 35],
          0.18 + Math.random() * 0.22,
          'spark'
        );
      }
    }

    // --- Drift Detection, Tire Skidmarks & Smoke Emitters ---
    const isSliding = (Math.abs(vLat) > 2.35 && player.speed > 3.2) || (handbrake && player.speed > 2.8) || (throttleInput && Math.abs(vFwd) < 4.5 && gType === GROUND.GRASS);
    player.drifting = isSliding;
    sfx.updateContinuous(throttleInput);

    if (isSliding) {
      const rearX = player.x - tx * (halfLen * 0.72);
      const rearY = player.y - ty * (halfLen * 0.72);
      const prevTx = Math.cos(player.angle - player.angularVel * dt);
      const prevTy = Math.sin(player.angle - player.angularVel * dt);
      const prevRearX = prevX - prevTx * (halfLen * 0.72);
      const prevRearY = prevY - prevTy * (halfLen * 0.72);

      const wheelTrack = spec.width * 0.40;
      // Left & Right rear tire world positions
      const lx0 = prevRearX - rx * wheelTrack, ly0 = prevRearY - ry * wheelTrack;
      const lx1 = rearX - rx * wheelTrack, ly1 = rearY - ry * wheelTrack;
      const rx0 = prevRearX + rx * wheelTrack, ry0 = prevRearY + ry * wheelTrack;
      const rx1 = rearX + rx * wheelTrack, ry1 = rearY + ry * wheelTrack;

      addSkidMark(lx0, ly0, lx1, ly1, surf.skidColor, 0.16);
      addSkidMark(rx0, ry0, rx1, ry1, surf.skidColor, 0.16);

      // If 4-wheel powerslide, also leave faint front wheel marks
      if (Math.abs(vLat) > 5.0 || handbrake) {
        const frontX = player.x + tx * (halfLen * 0.65);
        const frontY = player.y + ty * (halfLen * 0.65);
        const prevFrontX = prevX + prevTx * (halfLen * 0.65);
        const prevFrontY = prevY + prevTy * (halfLen * 0.65);
        addSkidMark(prevFrontX - rx * wheelTrack, prevFrontY - ry * wheelTrack, frontX - rx * wheelTrack, frontY - ry * wheelTrack, surf.skidColor, 0.12);
        addSkidMark(prevFrontX + rx * wheelTrack, prevFrontY + ry * wheelTrack, frontX + rx * wheelTrack, frontY + ry * wheelTrack, surf.skidColor, 0.12);
      }

      // Emit tire smoke / grass dirt particles
      if (Math.random() < 0.85) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const px = rearX + rx * wheelTrack * side + (Math.random() - 0.5) * 0.25;
        const py = rearY + ry * wheelTrack * side + (Math.random() - 0.5) * 0.25;
        spawnParticle(
          px, py,
          -player.vx * 0.18 + (Math.random() - 0.5) * 2.2,
          -player.vy * 0.18 + (Math.random() - 0.5) * 2.2,
          3.5 + Math.random() * 3.5,
          surf.smokeColor,
          0.35 + Math.random() * 0.30,
          'smoke'
        );
      }

      // Accumulate GTA 1 Drift Score!
      if (Math.abs(vLat) > 2.4 && player.speed > 4.5) {
        const pts = Math.round((Math.abs(vLat) * player.speed) * dt * 3.5);
        player.driftCombo += pts;
        player.score += pts;
        player.driftTimer = 0.65;
      }
    }

    if (player.driftTimer > 0) {
      player.driftTimer -= dt;
      if (player.driftTimer <= 0) {
        player.driftCombo = 0;
      }
    }

    // Update pistol bullets & check collisions with Vector Building Walls & Traffic Cars
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      if (b.life <= 0) {
        bullets.splice(i, 1);
        continue;
      }
      b.prevX = b.x;
      b.prevY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      let bulletHit = false;
      let hitX = b.x;
      let hitY = b.y;

      // 1. Check building walls in bullet's spatial cell
      const bCellX = Math.floor(b.x / COLL_CELL);
      const bCellY = Math.floor(b.y / COLL_CELL);
      const walls = getWallBucket(bCellX, bCellY);
      for (let w = 0; w < walls.length; w++) {
        const seg = walls[w];
        const wx = seg.x1 - seg.x0, wy = seg.y1 - seg.y0;
        const l2 = seg.len * seg.len;
        const t = Math.max(0, Math.min(1, ((b.x - seg.x0) * wx + (b.y - seg.y0) * wy) / l2));
        const dSq = (b.x - (seg.x0 + t * wx)) ** 2 + (b.y - (seg.y0 + t * wy)) ** 2;
        if (dSq < 0.20) {
          bulletHit = true;
          hitX = seg.x0 + t * wx;
          hitY = seg.y0 + t * wy;
          break;
        }
      }

      if (!bulletHit && heightGrid && b.x >= 0 && b.x < WORLD_W && b.y >= 0 && b.y < WORLD_H) {
        if (heightGrid[Math.floor(b.y) * WORLD_W + Math.floor(b.x)] > 0) {
          bulletHit = true;
        }
      }

      // 2. Check traffic cars hit by bullet
      if (!bulletHit && state.showTraffic) {
        for (const c of cars) {
          const s = samplePath(c.road.metric, c.dist);
          const ctx = s.tx * c.dir, cty = s.ty * c.dir;
          const crx = -cty, cry = ctx;
          const laneOffset = c.road.oneway ? 0 : Math.min(1.1, c.road.w * 0.24);
          const cx = s.x + crx * laneOffset;
          const cy = s.y + cry * laneOffset;
          if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < 0.85) {
            bulletHit = true;
            hitX = b.x;
            hitY = b.y;
            player.score += 50; // GTA 1 points for hitting traffic!
            // Panic speed boost on hit AI car
            c.speed = Math.min(22, c.speed + 2.5);
            break;
          }
        }
      }

      if (bulletHit) {
        sfx.playRicochet();
        for (let s = 0; s < 7; s++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 3 + Math.random() * 8;
          spawnParticle(
            hitX, hitY,
            Math.cos(ang) * spd, Math.sin(ang) * spd,
            2.4, s % 2 === 0 ? [255, 230, 90] : [255, 120, 40],
            0.16 + Math.random() * 0.14, 'spark'
          );
        }
        bullets.splice(i, 1);
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') {
        p.size += 5.5 * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
    }

    // Update GTA 1 Dynamic Camera (Smooth velocity look-ahead + speed zoom-out + impact shake)
    if (state.shakePower > 0.005) {
      state.shakeX = (Math.random() - 0.5) * state.shakePower * 2.0;
      state.shakeY = (Math.random() - 0.5) * state.shakePower * 2.0;
      state.shakePower *= Math.exp(-12.0 * dt);
    } else {
      state.shakeX = 0;
      state.shakeY = 0;
      state.shakePower = 0;
    }

    if (state.followCar && !state.dragging) {
      if (isFoot) {
        const lookAheadX = player.pedVx * 0.22;
        const lookAheadY = player.pedVy * 0.22;
        const targetCamX = Math.max(10, Math.min(WORLD_W - 10, player.pedX + lookAheadX));
        const targetCamY = Math.max(10, Math.min(WORLD_H - 10, player.pedY + lookAheadY));
        const camFollowRate = Math.min(1.0, 9.5 * dt);
        state.camX += (targetCamX - state.camX) * camFollowRate + state.shakeX;
        state.camY += (targetCamY - state.camY) * camFollowRate + state.shakeY;

        // Slightly closer zoom on foot so the GTA 1 ludzik and pistol are crisp!
        const targetZoom = state.zoom * 1.18;
        state.effectiveZoom += (targetZoom - state.effectiveZoom) * Math.min(1.0, 5.0 * dt);
      } else {
        // Look ahead in direction of velocity so player sees upcoming intersections!
        const lookAheadX = player.vx * 0.34;
        const lookAheadY = player.vy * 0.34;
        const targetCamX = Math.max(10, Math.min(WORLD_W - 10, player.x + lookAheadX));
        const targetCamY = Math.max(10, Math.min(WORLD_H - 10, player.y + lookAheadY));

        const camFollowRate = Math.min(1.0, 7.5 * dt);
        state.camX += (targetCamX - state.camX) * camFollowRate + state.shakeX;
        state.camY += (targetCamY - state.camY) * camFollowRate + state.shakeY;

        // Dynamic GTA 1 Speed Zoom-Out: zooms out up to 28% at top speed, zooms back in when stopped
        const speedRatio = Math.min(1.0, player.speed / spec.maxSpeed);
        const targetZoom = state.zoom * (1.0 - speedRatio * 0.28);
        state.effectiveZoom += (targetZoom - state.effectiveZoom) * Math.min(1.0, 4.5 * dt);
      }
    } else {
      state.effectiveZoom += (state.zoom - state.effectiveZoom) * Math.min(1.0, 8.0 * dt);
    }
  }

  // --- 10. HUD & FPS Counter ---
  const hudCoordsEl = document.getElementById('hud-coords');
  const hudBannerEl = document.getElementById('hud-street-banner');
  const hudFpsEl = document.getElementById('hud-fps');
  const hudScoreEl = document.getElementById('hud-score');
  const hudDriftBadgeEl = document.getElementById('hud-drift-badge');
  const hudSurfacePillEl = document.getElementById('hud-surface-pill');
  const hudActionPromptEl = document.getElementById('hud-action-prompt');
  const hudModeBadgeEl = document.getElementById('hud-mode-badge');
  const hudSpeedEl = document.getElementById('hud-speed');
  const hudGearEl = document.getElementById('hud-gear');
  const tileInspectorEl = document.getElementById('tile-inspector');

  let frameCount = 0;
  let fpsTimer = performance.now();

  function updateHUD(now) {
    frameCount++;
    if (now - fpsTimer >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - fpsTimer));
      if (hudFpsEl) hudFpsEl.textContent = `${fps} FPS`;
      frameCount = 0;
      fpsTimer = now;
    }

    const isFoot = player.mode === 'foot';
    const cx = Math.floor(isFoot ? player.pedX : player.x);
    const cy = Math.floor(isFoot ? player.pedY : player.y);
    if (hudCoordsEl) hudCoordsEl.textContent = `X:${cx} Y:${cy}`;

    // Speedometer (1 unit/s = 2 m/s = 7.2 km/h)
    const curSpd = isFoot ? Math.hypot(player.pedVx, player.pedVy) : player.speed;
    const kmh = Math.round(curSpd * 7.2);
    if (hudSpeedEl) hudSpeedEl.textContent = String(kmh);

    if (hudModeBadgeEl) {
      hudModeBadgeEl.textContent = isFoot ? 'PIESZO (PISTOLET)' : 'AUTO';
      hudModeBadgeEl.style.color = isFoot ? '#59ff67' : '#ffd15c';
    }

    if (hudActionPromptEl) {
      if (isFoot) {
        const distOwn = Math.hypot(player.pedX - player.x, player.pedY - player.y);
        if (distOwn <= 2.8) {
          hudActionPromptEl.textContent = 'PIESZO • [LPM / CTRL / SPACJA] STRZAŁ Z PISTOLETU • [F / ENTER] WSIĄDŹ DO AUTA';
          hudActionPromptEl.style.color = '#59ff67';
        } else {
          hudActionPromptEl.textContent = 'PIESZO • [LPM / CTRL / SPACJA] STRZAŁ Z PISTOLETU • PODEJDŹ DO AUTA I [F] BY WSIĄŚĆ';
          hudActionPromptEl.style.color = '#ffe07d';
        }
      } else {
        hudActionPromptEl.textContent = 'W POJEŹDZIE • [SPACJA] RĘCZNY (DRIFT) • [F / ENTER] WYSIĄDŹ LUDZIKIEM';
        hudActionPromptEl.style.color = '#ffe07d';
      }
    }

    if (hudGearEl) {
      let gear = 'N';
      if (isFoot) gear = '🔫';
      else if (player.reversing || player.forwardSpeed < -0.5) gear = 'R';
      else if (CAR_SPECS[player.carIdx].drivetrain === 'ev') gear = 'D';
      else gear = String(player.gear || 1);
      hudGearEl.textContent = gear;
      hudGearEl.style.borderColor = player.shiftTimer > 0 ? '#ff6644' : '#d99b26';
    }

    if (hudScoreEl) {
      hudScoreEl.textContent = String(player.score).padStart(6, '0');
    }

    if (hudDriftBadgeEl) {
      if (player.driftCombo >= 10) {
        hudDriftBadgeEl.classList.remove('hidden');
        hudDriftBadgeEl.textContent = `DRIFT! +${player.driftCombo}`;
      } else {
        hudDriftBadgeEl.classList.add('hidden');
      }
    }

    if (hudSurfacePillEl) {
      const surf = SURFACE_PHYSICS[player.surfaceType] || SURFACE_PHYSICS[GROUND.URBAN_PAVED];
      const gripPct = Math.round(surf.grip * (player.handbrake ? 35 : 100));
      hudSurfacePillEl.textContent = `NAWIERZCHNIA: ${surf.name} • PRZYCZEPNOŚĆ ${gripPct}%`;
      hudSurfacePillEl.style.color = surf.pillColor;
    }

    const tilePx = BASE_TILE_PX * state.effectiveZoom;
    const hoverX = Math.floor(state.camX + (state.mouseX - canvas.width / 2) / tilePx);
    const hoverY = Math.floor(state.camY + (state.mouseY - canvas.height / 2) / tilePx);
    if (groundGrid && heightGrid && hoverX >= 0 && hoverX < WORLD_W && hoverY >= 0 && hoverY < WORLD_H) {
      const idx = hoverY * WORLD_W + hoverX;
      const h = heightGrid[idx];
      if (h > 0) {
        const pal = BLDG_PALETTES[styleGrid[idx]] || BLDG_PALETTES[1];
        tileInspectorEl.textContent = `${pal.name} (${h} p.) [Odbicie]`;
      } else {
        tileInspectorEl.textContent = GROUND_NAMES[groundGrid[idx]] || 'Teren';
      }
    } else if (usesSectorMap() && mapData.anchors) {
      let zoneDesc = 'Korytarz szosy (pas 50m)';
      for (const a of Object.values(mapData.anchors)) {
        if (Math.hypot(cx - a.x, cy - a.y) <= a.radiusUnits) {
          zoneDesc = `${a.name} (${a.radiusM}m)`;
          break;
        }
      }
      tileInspectorEl.textContent = zoneDesc;
    }

    // Find exact road polyline we are currently driving on!
    let currentRoadName = '';
    let minRoadD2 = 144; // within 12 units (24m) of road centerline
    for (const r of (mapData.vectorRoads || [])) {
      if (!r.name || r.isMainRoute) continue;
      const pts = r.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = pts[i][0], y1 = pts[i][1];
        const x2 = pts[i + 1][0], y2 = pts[i + 1][1];
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        let t = l2 > 0 ? ((player.x - x1) * (x2 - x1) + (player.y - y1) * (y2 - y1)) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d2 = (player.x - (x1 + t * (x2 - x1))) ** 2 + (player.y - (y1 + t * (y2 - y1))) ** 2;
        if (d2 < minRoadD2) {
          minRoadD2 = d2;
          currentRoadName = r.name;
        }
      }
    }

    if (!currentRoadName) {
      let bestStD2 = 900;
      for (const st of (mapData.streets || [])) {
        const d2 = (cx - st.x) ** 2 + (cy - st.y) ** 2;
        if (d2 < bestStD2) {
          bestStD2 = d2;
          currentRoadName = st.name;
        }
      }
    }

    let bestName = currentRoadName
      ? (currentRoadName.toLowerCase().startsWith('ul') || currentRoadName.toLowerCase().startsWith('al') || currentRoadName.toLowerCase().startsWith('rondo') || currentRoadName.toLowerCase().startsWith('most') || currentRoadName.toLowerCase().startsWith('osiedle') || currentRoadName.toLowerCase().startsWith('plac')
          ? currentRoadName.toUpperCase()
          : `UL. ${currentRoadName.toUpperCase()}`)
      : (activeMapKey === 'trasa' ? 'SZOSA: TUCZNO → KICIN → POZNAŃ' : (activeMapKey === 'sehnde' ? 'ACHARDSTRAßE 54' : 'WINOGRADY'));

    if (hudBannerEl.textContent !== bestName) {
      hudBannerEl.textContent = bestName;
    }

    if (hudSurfacePillEl && currentRoadName) {
      const surf = SURFACE_PHYSICS[player.surfaceType] || SURFACE_PHYSICS[GROUND.URBAN_PAVED];
      const gripPct = Math.round(surf.grip * (player.handbrake ? 35 : 100));
      hudSurfacePillEl.textContent = `ULICA: ${currentRoadName.toUpperCase()} • ${surf.name} (${gripPct}%)`;
    }
  }

  // --- 11. Main Render Loop ---
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;
    try {

    // Step player vehicle arcade drift physics & vector polygon collisions
    updatePlayerPhysics(dt);

    const w = canvas.width;
    const h = canvas.height;
    const centerX = w * 0.5;
    const centerY = h * 0.5;
    const tilePx = BASE_TILE_PX * state.effectiveZoom;

    const halfCols = Math.ceil(w / tilePx / 2) + 8;
    const halfRows = Math.ceil(h / tilePx / 2) + 8;
    const minTileX = Math.max(0, Math.floor(state.camX - halfCols));
    const maxTileX = Math.min(WORLD_W - 1, Math.ceil(state.camX + halfCols));
    const minTileY = Math.max(0, Math.floor(state.camY - halfRows));
    const maxTileY = Math.min(WORLD_H - 1, Math.ceil(state.camY + halfRows));

    // Update dynamic vehicles & trams VBO
    const dynamicVertCount = updateAndBuildTraffic(dt);

    gl.clearColor(0.05, 0.06, 0.08, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniform2f(uCamLoc, state.camX, state.camY);
    gl.uniform2f(uResLoc, w, h);
    gl.uniform1f(uTilePxLoc, tilePx);
    gl.uniform1f(uPerspKLoc, state.perspectiveStrength);
    gl.uniform1f(uGridModeLoc, state.showGrid ? 1.0 : 0.0);
    gl.uniform1f(uCollModeLoc, state.showCollision ? 1.0 : 0.0);

    // --- Draw Call 1: Pre-Baked WebGL Ground Texture (Exact same method & 8.192 px/unit resolution as trasa.html & Map 1!) ---
    gl.uniform1f(uIsGroundLoc, 1.0);
    gl.activeTexture(gl.TEXTURE0);

    if (usesSectorMap()) {
      if (globalOverview) {
        bindVertexLayout(globalOverview.vbo);
        gl.bindTexture(gl.TEXTURE_2D, globalOverview.tex);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      if (state.effectiveZoom >= 0.3) {
        const minSecX = Math.max(0, Math.floor((state.camX - halfCols) / SECTOR_UNITS));
        const maxSecX = Math.min(Math.floor(WORLD_W / SECTOR_UNITS), Math.floor((state.camX + halfCols) / SECTOR_UNITS));
        const minSecY = Math.max(0, Math.floor((state.camY - halfRows) / SECTOR_UNITS));
        const maxSecY = Math.min(Math.floor(WORLD_H / SECTOR_UNITS), Math.floor((state.camY + halfRows) / SECTOR_UNITS));

        for (let sy = minSecY; sy <= maxSecY; sy++) {
          for (let sx = minSecX; sx <= maxSecX; sx++) {
            const sec = getOrBakeSector(sx, sy);
            bindVertexLayout(sec.vbo);
            gl.bindTexture(gl.TEXTURE_2D, sec.tex);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
        }
      }
    } else {
      bindVertexLayout(mesh.vbo);
      gl.bindTexture(gl.TEXTURE_2D, groundTex);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // --- Draw Call 2: All Smooth 2.5D Buildings ---
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bldgAtlasTex);
    gl.uniform1f(uIsGroundLoc, 0.0);
    bindVertexLayout(mesh.vbo);
    gl.drawArrays(gl.TRIANGLES, mesh.bldgStartVertex, mesh.bldgVertexCount);

    // --- Draw Call 3: All Moving 2.5D Cars & MPK Poznań Trams! ---
    if (dynamicVertCount > 0) {
      bindVertexLayout(dynamicVbo);
      gl.drawArrays(gl.TRIANGLES, 0, dynamicVertCount);
    }

    // 2D Overlay: Skidmarks, Headlights, Particles, Labels & Collision Debug
    lctx.clearRect(0, 0, w, h);

    // Draw green dashed 500m zone circle outlines on Trasa map (just like trasa.html!)
    if (usesSectorMap() && trasaAnchors.length > 0 && activeMapKey === 'trasa') {
      lctx.save();
      lctx.strokeStyle = 'rgba(89, 255, 103, 0.55)';
      lctx.lineWidth = 2;
      lctx.setLineDash([8, 6]);
      for (const a of trasaAnchors) {
        const sx = centerX + (a.x - state.camX) * tilePx;
        const sy = centerY + (a.y - state.camY) * tilePx;
        const sr = a.radiusUnits * tilePx;
        lctx.beginPath();
        lctx.arc(sx, sy, sr, 0, Math.PI * 2);
        lctx.stroke();
      }
      lctx.restore();
    }

    // 1. Render Persistent Tire Skidmarks / Mud Tracks on Ground Plane
    lctx.lineCap = 'round';
    for (let i = 0; i < skidMarks.length; i++) {
      const sk = skidMarks[i];
      if (sk.x0 < minTileX && sk.x1 < minTileX) continue;
      if (sk.x0 > maxTileX && sk.x1 > maxTileX) continue;
      if (sk.y0 < minTileY && sk.y1 < minTileY) continue;
      if (sk.y0 > maxTileY && sk.y1 > maxTileY) continue;

      const sx0 = centerX + (sk.x0 - state.camX) * tilePx;
      const sy0 = centerY + (sk.y0 - state.camY) * tilePx;
      const sx1 = centerX + (sk.x1 - state.camX) * tilePx;
      const sy1 = centerY + (sk.y1 - state.camY) * tilePx;

      lctx.strokeStyle = sk.color;
      lctx.lineWidth = Math.max(1.5, sk.width * tilePx);
      lctx.beginPath();
      lctx.moveTo(sx0, sy0);
      lctx.lineTo(sx1, sy1);
      lctx.stroke();
    }

    // 2. Render Player Car Headlight Beams, Brake Glow & Turned Front Wheels
    {
      const spec = CAR_SPECS[player.carIdx];
      const carScreenX = centerX + (player.x - state.camX) * tilePx;
      const carScreenY = centerY + (player.y - state.camY) * tilePx;

      lctx.save();
      lctx.translate(carScreenX, carScreenY);
      lctx.rotate(player.angle);

      const halfL = (spec.length * 0.5) * tilePx;
      const halfW = (spec.width * 0.5) * tilePx;

      // Ambient drop shadow under player car
      lctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      lctx.fillRect(-halfL * 1.05 + 3, -halfW * 1.05 + 3, halfL * 2.1, halfW * 2.1);

      // Steerable front wheels sticking slightly out when turning
      const wheelL = 0.36 * tilePx;
      const wheelW = 0.16 * tilePx;
      for (const side of [-1, 1]) {
        lctx.save();
        lctx.translate(halfL * 0.62, side * (halfW * 0.96));
        lctx.rotate(player.steerAngle);
        lctx.fillStyle = '#111215';
        lctx.fillRect(-wheelL * 0.5, -wheelW * 0.5, wheelL, wheelW);
        lctx.restore();
      }

      // Twin Headlight Cones (GTA 1 classic light beams)
      const grad = lctx.createLinearGradient(halfL, 0, halfL + 4.8 * tilePx, 0);
      grad.addColorStop(0, 'rgba(255, 245, 180, 0.34)');
      grad.addColorStop(1, 'rgba(255, 245, 180, 0.0)');
      lctx.fillStyle = grad;
      lctx.beginPath();
      lctx.moveTo(halfL, -halfW * 0.75);
      lctx.lineTo(halfL + 4.8 * tilePx, -halfW * 2.3);
      lctx.lineTo(halfL + 4.8 * tilePx, halfW * 2.3);
      lctx.lineTo(halfL, halfW * 0.75);
      lctx.closePath();
      lctx.fill();

      // Bright red brake / reverse tail glow
      if (player.braking || player.reversing) {
        lctx.fillStyle = player.reversing ? 'rgba(255, 255, 220, 0.75)' : 'rgba(255, 40, 40, 0.78)';
        lctx.beginPath();
        lctx.arc(-halfL, -halfW * 0.65, 0.25 * tilePx, 0, Math.PI * 2);
        lctx.arc(-halfL, halfW * 0.65, 0.25 * tilePx, 0, Math.PI * 2);
        lctx.fill();
      }

      // Police siren flash halo on ground
      if (spec.isPolice && player.sirenActive) {
        const isBlue = Math.sin(player.sirenPhase * 16) > 0;
        lctx.fillStyle = isBlue ? 'rgba(40, 130, 255, 0.26)' : 'rgba(255, 40, 60, 0.26)';
        lctx.beginPath();
        lctx.arc(0, 0, 2.6 * tilePx, 0, Math.PI * 2);
        lctx.fill();
      }

      lctx.restore();
    }

    // 2B. Render GTA 1 On-Foot Character ("Ludzik") + Pistol + Muzzle Flash + Bullet Tracers!
    if (player.mode === 'foot') {
      const pedScreenX = centerX + (player.pedX - state.camX) * tilePx;
      const pedScreenY = centerY + (player.pedY - state.camY) * tilePx;
      const isMoving = Math.hypot(player.pedVx, player.pedVy) > 0.3;
      const swing = isMoving ? Math.sin(player.walkCycle) : 0;

      // Update aim angle toward mouse cursor smoothly when moving mouse
      lctx.save();
      lctx.translate(pedScreenX, pedScreenY);
      lctx.rotate(player.pedAngle);

      const scale = Math.max(0.65, tilePx / 16);

      // Drop shadow under ludzik
      lctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      lctx.beginPath();
      lctx.arc(1.5, 2.0, 5.5 * scale, 0, Math.PI * 2);
      lctx.fill();

      // Animated stepping feet (left & right dark boots sticking out during stride)
      lctx.fillStyle = '#181a20';
      lctx.fillRect((swing * 3.5 - 1.5) * scale, -3.6 * scale, 3.4 * scale, 2.2 * scale);
      lctx.fillRect((-swing * 3.5 - 1.5) * scale, 1.4 * scale, 3.4 * scale, 2.2 * scale);

      // Shoulders / Blue retro tracksuit jacket with white stripes
      lctx.fillStyle = '#2466cc';
      lctx.strokeStyle = '#0d1017';
      lctx.lineWidth = 1.2;
      lctx.beginPath();
      lctx.roundRect(-3.2 * scale, -5.2 * scale, 6.4 * scale, 10.4 * scale, 2.5 * scale);
      lctx.fill();
      lctx.stroke();

      // White shoulder stripes
      lctx.fillStyle = '#f0f4ff';
      lctx.fillRect(-1.2 * scale, -4.8 * scale, 2.4 * scale, 1.3 * scale);
      lctx.fillRect(-1.2 * scale, 3.5 * scale, 2.4 * scale, 1.3 * scale);

      // Right extended arm holding black 9mm pistol forward
      lctx.fillStyle = '#2466cc';
      lctx.fillRect(1.5 * scale, 1.6 * scale, 4.5 * scale, 2.3 * scale);
      // Hand
      lctx.fillStyle = '#f2c199';
      lctx.beginPath();
      lctx.arc(6.0 * scale, 2.6 * scale, 1.4 * scale, 0, Math.PI * 2);
      lctx.fill();
      // Pistol barrel
      lctx.fillStyle = '#1c1e24';
      lctx.fillRect(6.2 * scale, 1.7 * scale, 4.2 * scale, 1.7 * scale);

      // Bright yellow/orange Muzzle Flash star when firing pistol!
      if (player.muzzleFlashTimer > 0) {
        lctx.fillStyle = '#fff599';
        lctx.beginPath();
        lctx.arc(11.5 * scale, 2.5 * scale, 4.2 * scale, 0, Math.PI * 2);
        lctx.fill();
        lctx.fillStyle = '#ff6622';
        lctx.beginPath();
        lctx.moveTo(10.2 * scale, 2.5 * scale);
        lctx.lineTo(17.5 * scale, -1.2 * scale);
        lctx.lineTo(15.0 * scale, 2.5 * scale);
        lctx.lineTo(17.5 * scale, 6.2 * scale);
        lctx.closePath();
        lctx.fill();
      }

      // Head (skin + dark hair cap)
      lctx.fillStyle = '#f2c199';
      lctx.beginPath();
      lctx.arc(0.4 * scale, 0, 3.3 * scale, 0, Math.PI * 2);
      lctx.fill();
      lctx.stroke();

      lctx.fillStyle = '#2b1d12';
      lctx.beginPath();
      lctx.arc(-0.5 * scale, 0, 2.8 * scale, Math.PI * 0.45, -Math.PI * 0.45);
      lctx.fill();

      lctx.restore();

      // Highlight green "[F] WSIĄDŹ" indicator over parked car if ludzik is nearby
      const distOwn = Math.hypot(player.pedX - player.x, player.pedY - player.y);
      if (distOwn <= 2.8) {
        const cxScreen = centerX + (player.x - state.camX) * tilePx;
        const cyScreen = centerY + (player.y - state.camY) * tilePx;
        lctx.font = 'bold 11px "Courier New", monospace';
        lctx.textAlign = 'center';
        lctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        lctx.fillText('[F / ENTER] WSIĄDŹ', cxScreen + 1, cyScreen - 18 + 1);
        lctx.fillStyle = '#59ff67';
        lctx.fillText('[F / ENTER] WSIĄDŹ', cxScreen, cyScreen - 18);
      }
    }

    // 2C. Render Active Pistol Bullet Tracers
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const bx0 = centerX + (b.prevX - state.camX) * tilePx;
      const by0 = centerY + (b.prevY - state.camY) * tilePx;
      const bx1 = centerX + (b.x - state.camX) * tilePx;
      const by1 = centerY + (b.y - state.camY) * tilePx;

      lctx.strokeStyle = 'rgba(255, 240, 130, 0.95)';
      lctx.lineWidth = 2.2;
      lctx.beginPath();
      lctx.moveTo(bx0, by0);
      lctx.lineTo(bx1, by1);
      lctx.stroke();

      lctx.fillStyle = '#ffffff';
      lctx.beginPath();
      lctx.arc(bx1, by1, 2.0, 0, Math.PI * 2);
      lctx.fill();
    }

    // 3. Render Tire Smoke, Grass Dust & Wall Collision Sparks
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const sx = centerX + (p.x - state.camX) * tilePx;
      const sy = centerY + (p.y - state.camY) * tilePx;
      const alpha = Math.max(0, p.life / p.maxLife);
      const [r, g, b] = p.color;

      if (p.kind === 'spark') {
        lctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        lctx.lineWidth = 2.0;
        lctx.beginPath();
        lctx.moveTo(sx, sy);
        lctx.lineTo(sx - p.vx * 0.03 * tilePx, sy - p.vy * 0.03 * tilePx);
        lctx.stroke();
      } else {
        lctx.fillStyle = `rgba(${r},${g},${b},${(alpha * 0.55).toFixed(2)})`;
        lctx.beginPath();
        lctx.arc(sx, sy, (p.size / 16) * tilePx, 0, Math.PI * 2);
        lctx.fill();
      }
    }

    // 4. Optional Vector Building Collision Normals & Car Hit-Spheres Overlay
    if (state.showCollision) {
      const spec = CAR_SPECS[player.carIdx];
      const halfLen = spec.length * 0.5;
      const sphereRadius = spec.width * 0.50;
      const tx = Math.cos(player.angle), ty = Math.sin(player.angle);
      lctx.strokeStyle = '#59ff67';
      lctx.lineWidth = 1.5;
      for (const off of [halfLen - sphereRadius * 0.65, 0, -(halfLen - sphereRadius * 0.65)]) {
        const sx = centerX + (player.x + tx * off - state.camX) * tilePx;
        const sy = centerY + (player.y + ty * off - state.camY) * tilePx;
        lctx.beginPath();
        lctx.arc(sx, sy, sphereRadius * tilePx, 0, Math.PI * 2);
        lctx.stroke();
      }
    }

    if (state.showLabels && state.effectiveZoom >= 0.45) {
      lctx.textAlign = 'center';

      // 1. House Numbers on Building Roofs (visible when zoomed in >= 0.70)
      if (state.effectiveZoom >= 0.70 && mapData.houseNumbers) {
        lctx.font = 'bold 10px "Courier New", monospace';
        for (const hn of mapData.houseNumbers) {
          if (hn.x < minTileX || hn.x > maxTileX || hn.y < minTileY || hn.y > maxTileY) continue;
          const bx = centerX + (hn.x - state.camX) * tilePx;
          const by = centerY + (hn.y - state.camY) * tilePx;
          const dx = bx - centerX, dy = by - centerY;
          const rLen = Math.hypot(dx, dy);
          const clampedLen = Math.min(rLen, 280);
          const hFactor = (hn.floors || 2) * 0.015 * state.perspectiveStrength;
          const rx = bx + (rLen > 0.01 ? (dx / rLen) * clampedLen * hFactor : 0);
          const ry = by + (rLen > 0.01 ? (dy / rLen) * clampedLen * hFactor : 0);

          lctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          lctx.fillText(hn.num, rx + 1, ry + 1);
          lctx.fillStyle = '#b8e2ff';
          lctx.fillText(hn.num, rx, ry);
        }
      }

      // 2. Street Names
      lctx.font = 'bold 11px "Courier New", monospace';
      for (const st of mapData.streets) {
        if (st.x < minTileX || st.x > maxTileX || st.y < minTileY || st.y > maxTileY) continue;
        const sx = centerX + (st.x - state.camX) * tilePx;
        const sy = centerY + (st.y - state.camY) * tilePx;
        let ang = st.angle || 0;
        if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
        lctx.save();
        lctx.translate(sx, sy);
        lctx.rotate(ang);
        lctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        lctx.fillText(st.name, 1, 1);
        lctx.fillStyle = '#d8d2b8';
        lctx.fillText(st.name, 0, 0);
        lctx.restore();
      }

      // 3. Shops, Companies & Services (POIs)
      if (state.effectiveZoom >= 0.50 && mapData.pois) {
        lctx.font = 'bold 11px "Courier New", monospace';
        for (const poi of mapData.pois) {
          if (poi.x < minTileX || poi.x > maxTileX || poi.y < minTileY || poi.y > maxTileY) continue;
          const bx = centerX + (poi.x - state.camX) * tilePx;
          const by = centerY + (poi.y - state.camY) * tilePx;
          const dx = bx - centerX, dy = by - centerY;
          const rLen = Math.hypot(dx, dy);
          const clampedLen = Math.min(rLen, 280);
          const hFactor = (poi.floors || 2) * 0.015 * state.perspectiveStrength;
          const rx = bx + (rLen > 0.01 ? (dx / rLen) * clampedLen * hFactor : 0);
          const ry = by + (rLen > 0.01 ? (dy / rLen) * clampedLen * hFactor : 0) - 9;

          const tag = poi.kind === 'shop' ? `[SKLEP] ${poi.name}` : (poi.kind === 'company' ? `[FIRMA] ${poi.name}` : poi.name);
          lctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
          lctx.fillText(tag, rx + 1, ry + 1);
          lctx.fillStyle = poi.kind === 'shop' ? '#ff9f43' : (poi.kind === 'company' ? '#54d4ff' : '#ffd166');
          lctx.fillText(tag, rx, ry);
        }
      }

      // 4. Key Landmarks & Waypoints
      lctx.font = 'bold 12px "Courier New", monospace';
      for (const lm of mapData.landmarks) {
        if (lm.x < minTileX || lm.x > maxTileX || lm.y < minTileY || lm.y > maxTileY) continue;
        const bx = centerX + (lm.x - state.camX) * tilePx;
        const by = centerY + (lm.y - state.camY) * tilePx;
        const dx = bx - centerX, dy = by - centerY;
        const rLen = Math.hypot(dx, dy);
        const clampedLen = Math.min(rLen, 280);
        const hFactor = (lm.floors || 2) * 0.015 * state.perspectiveStrength;
        const rx = bx + (rLen > 0.01 ? (dx / rLen) * clampedLen * hFactor : 0);
        const ry = by + (rLen > 0.01 ? (dy / rLen) * clampedLen * hFactor : 0);

        if (lm.name.includes('HQ Systemia')) {
          lctx.save();
          lctx.font = '900 13px "Courier New", monospace';
          const textW = lctx.measureText('HQ SYSTEMIA').width;
          lctx.fillStyle = 'rgba(12, 24, 18, 0.92)';
          lctx.strokeStyle = '#59ff67';
          lctx.lineWidth = 2;
          lctx.fillRect(rx - textW * 0.5 - 8, ry - 22, textW + 16, 20);
          lctx.strokeRect(rx - textW * 0.5 - 8, ry - 22, textW + 16, 20);
          lctx.fillStyle = '#59ff67';
          lctx.fillText('HQ SYSTEMIA', rx, ry - 8);
          lctx.font = 'bold 10px "Courier New", monospace';
          lctx.fillStyle = '#ffe066';
          lctx.fillText('ul. Karpia 21A', rx, ry + 8);
          lctx.restore();
          continue;
        }

        lctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        lctx.fillText(lm.name, rx + 1, ry + 1);
        lctx.fillText(lm.name, rx - 1, ry + 1);
        lctx.fillStyle = lm.style === 5 ? '#59ff67' : '#ffe066';
        lctx.fillText(lm.name, rx, ry);
      }

      // Label moving MPK trams with line numbers (Linia 3 / Linia 10)
      if (state.showTraffic) {
        lctx.font = 'bold 10px "Courier New", monospace';
        for (const tr of trams) {
          const s = samplePath(tr.track, tr.dist);
          if (s.x < minTileX || s.x > maxTileX || s.y < minTileY || s.y > maxTileY) continue;
          const bx = centerX + (s.x - state.camX) * tilePx;
          const by = centerY + (s.y - state.camY) * tilePx;
          const hFactor = 1.15 * 0.042 * state.perspectiveStrength;
          const rx = bx + (bx - centerX) * hFactor;
          const ry = by + (by - centerY) * hFactor - 8;
          const label = `MPK [${tr.lineNumber}]`;
          lctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          lctx.fillText(label, rx + 1, ry + 1);
          lctx.fillStyle = '#59ff67';
          lctx.fillText(label, rx, ry);
        }
      }
    }

    // Update Minimap Radar (including live moving trams, traffic & player heading arrow!)
    minimapCtx.drawImage(minimapBase, 0, 0);

    if (state.showTraffic) {
      // Draw moving cars on radar
      minimapCtx.fillStyle = '#ff9933';
      for (const c of cars) {
        const s = samplePath(c.road.metric, c.dist);
        minimapCtx.fillRect((s.x / WORLD_W) * 200 - 1, (s.y / WORLD_H) * 200 - 1, 2, 2);
      }

      // Draw moving MPK trams on radar
      minimapCtx.fillStyle = '#59ff67';
      for (const tr of trams) {
        const s = samplePath(tr.track, tr.dist);
        minimapCtx.fillRect((s.x / WORLD_W) * 200 - 2, (s.y / WORLD_H) * 200 - 2, 4, 4);
      }
    }

    const viewX = (minTileX / WORLD_W) * 200;
    const viewY = (minTileY / WORLD_H) * 200;
    const viewW = ((maxTileX - minTileX) / WORLD_W) * 200;
    const viewH = ((maxTileY - minTileY) / WORLD_H) * 200;
    minimapCtx.strokeStyle = '#ffd15c';
    minimapCtx.lineWidth = 1.2;
    minimapCtx.strokeRect(viewX, viewY, viewW, viewH);

    // Player directional triangle on radar (shows ludzik position when on foot, plus cyan dot for parked car)
    if (player.mode === 'foot') {
      const carRadarX = (player.x / WORLD_W) * 200;
      const carRadarY = (player.y / WORLD_H) * 200;
      minimapCtx.fillStyle = '#00e5ff';
      minimapCtx.fillRect(carRadarX - 2, carRadarY - 2, 4, 4);
    }
    const activeRadarX = player.mode === 'foot' ? player.pedX : player.x;
    const activeRadarY = player.mode === 'foot' ? player.pedY : player.y;
    const activeRadarAng = player.mode === 'foot' ? player.pedAngle : player.angle;
    const pxRadar = (activeRadarX / WORLD_W) * 200;
    const pyRadar = (activeRadarY / WORLD_H) * 200;
    minimapCtx.save();
    minimapCtx.translate(pxRadar, pyRadar);
    minimapCtx.rotate(activeRadarAng);
    minimapCtx.fillStyle = '#ff2a2a';
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 1.2;
    minimapCtx.beginPath();
    minimapCtx.moveTo(5.5, 0);
    minimapCtx.lineTo(-4, -3.5);
    minimapCtx.lineTo(-4, 3.5);
    minimapCtx.closePath();
    minimapCtx.fill();
    minimapCtx.stroke();
    minimapCtx.restore();

    updateHUD(now);
    } catch (err) {
      if (!frame.reported) {
        frame.reported = true;
        console.error(err);
      }
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
