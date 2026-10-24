(() => {
  const mapData = window.POZNAN_TILEMAP;
  if (!mapData) {
    alert('Brak danych mapy w data/poznan-tilemap.js! Uruchom: node scripts/build-map.mjs');
    return;
  }

  const GRID = mapData.meta.gridWidth; // 500 units (1 unit = 2 meters, total 1000x1000m)
  const BASE_TILE_PX = 16;

  function decodeUint8(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  const groundGrid = decodeUint8(mapData.groundBase64);
  const heightGrid = decodeUint8(mapData.heightBase64);
  const styleGrid = decodeUint8(mapData.styleBase64);

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

  // --- 1. Initialize WebGL Context & Shaders ---
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

  // --- 2. Build Smooth High-Res Ground Texture (4096 x 4096) ---
  const GROUND_TEX_SIZE = 4096;
  const SCALE = GROUND_TEX_SIZE / GRID;

  function createPattern(size, drawFn) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    drawFn(ctx, size);
    return ctx.createPattern(c, 'repeat');
  }

  function buildSmoothGroundTexture() {
    const gc = document.createElement('canvas');
    gc.width = GROUND_TEX_SIZE;
    gc.height = GROUND_TEX_SIZE;
    const ctx = gc.getContext('2d');

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

    const plazaPattern = createPattern(24, (c, s) => {
      c.fillStyle = '#5e564b'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#4f483e';
      c.fillRect(0, 0, s, 2); c.fillRect(0, 12, s, 2);
      c.fillRect(0, 0, 2, 12); c.fillRect(12, 12, 2, 12);
    });

    ctx.fillStyle = urbanPattern;
    ctx.fillRect(0, 0, GROUND_TEX_SIZE, GROUND_TEX_SIZE);

    for (const area of (mapData.vectorLanduse || [])) {
      if (area.pts.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(area.pts[0][0] * SCALE, area.pts[0][1] * SCALE);
      for (let i = 1; i < area.pts.length; i++) {
        ctx.lineTo(area.pts[i][0] * SCALE, area.pts[i][1] * SCALE);
      }
      ctx.closePath();

      if (area.kind === 'grass') {
        ctx.fillStyle = grassPattern;
        ctx.fill();
        ctx.strokeStyle = '#22381c';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (area.kind === 'water') {
        ctx.fillStyle = '#1d4d75';
        ctx.fill();
        ctx.strokeStyle = '#3674a8';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (area.kind === 'plaza') {
        ctx.fillStyle = plazaPattern;
        ctx.fill();
      } else if (area.kind === 'paved') {
        ctx.fillStyle = '#3b3e46';
        ctx.fill();
      }
    }

    function strokeRoadPath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * SCALE, pts[0][1] * SCALE);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * SCALE, pts[i][1] * SCALE);
      }
      ctx.stroke();
    }

    const roads = mapData.vectorRoads || [];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of roads) {
      if (r.kind !== 'footway') continue;
      ctx.strokeStyle = '#43464d';
      ctx.lineWidth = (r.w + 0.45) * SCALE;
      strokeRoadPath(r.pts);
      ctx.strokeStyle = '#686b73';
      ctx.lineWidth = r.w * SCALE;
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway' || !r.hasSidewalk) continue;
      ctx.strokeStyle = '#1b1c21';
      ctx.lineWidth = (r.w + 2.1) * SCALE;
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway' || !r.hasSidewalk) continue;
      ctx.strokeStyle = '#70737c';
      ctx.lineWidth = (r.w + 1.7) * SCALE;
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway') continue;
      ctx.strokeStyle = '#4e5159';
      ctx.lineWidth = (r.w + 0.35) * SCALE;
      strokeRoadPath(r.pts);
    }

    for (const r of roads) {
      if (r.kind === 'footway') continue;
      if (r.kind === 'cobble') {
        ctx.strokeStyle = '#423d3a';
      } else if (r.kind === 'plaza') {
        ctx.strokeStyle = '#5e564b';
      } else {
        ctx.strokeStyle = '#25272e';
      }
      ctx.lineWidth = r.w * SCALE;
      strokeRoadPath(r.pts);
    }

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.setLineDash([2.2 * SCALE, 2.2 * SCALE]);
    for (const r of roads) {
      if (!r.hasCenterLine) continue;
      ctx.strokeStyle = r.prio >= 5 ? 'rgba(235, 200, 90, 0.65)' : 'rgba(210, 215, 225, 0.50)';
      ctx.lineWidth = 0.22 * SCALE;
      strokeRoadPath(r.pts);
    }
    ctx.restore();

    for (const tr of (mapData.vectorTrams || [])) {
      if (tr.pts.length < 2) continue;
      ctx.strokeStyle = '#383634';
      ctx.lineWidth = 1.45 * SCALE;
      strokeRoadPath(tr.pts);

      ctx.save();
      ctx.lineCap = 'butt';
      ctx.setLineDash([0.28 * SCALE, 0.55 * SCALE]);
      ctx.strokeStyle = '#544e46';
      ctx.lineWidth = 1.2 * SCALE;
      strokeRoadPath(tr.pts);
      ctx.restore();

      ctx.strokeStyle = '#9aa4b2';
      ctx.lineWidth = 0.65 * SCALE;
      strokeRoadPath(tr.pts);
      ctx.strokeStyle = '#383634';
      ctx.lineWidth = 0.35 * SCALE;
      strokeRoadPath(tr.pts);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    for (const b of (mapData.vectorBuildings || [])) {
      const shOff = Math.min(2.5, (b.floors || 3) * 0.35) * SCALE;
      for (const ring of b.rings) {
        if (ring.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(ring[0][0] * SCALE + shOff, ring[0][1] * SCALE + shOff);
        for (let i = 1; i < ring.length; i++) {
          ctx.lineTo(ring[i][0] * SCALE + shOff, ring[i][1] * SCALE + shOff);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

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

  const groundTex = buildSmoothGroundTexture();

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
      float hFactor = a_pos.z * 0.042 * u_perspK;
      vec2 displacedPx = baseRelPx * (1.0 + hFactor);

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
      GRID, 0, 0, 1, 0,
      GRID, GRID, 0, 1, 1,
      0, GRID, 0, 0, 1,
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

  const mesh = buildVectorMesh();

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

  const tramTracks = buildStitchedTramTracks(mapData.vectorTrams || []);

  // Spawn MPK Poznań Moderus Gamma / Solaris Tramino articulated 3-section trams!
  const trams = [];
  tramTracks.forEach((track, idx) => {
    const count = Math.max(1, Math.floor(track.total / 95));
    for (let i = 0; i < count; i++) {
      trams.push({
        track,
        dist: ((i + 0.3) / count) * track.total,
        dir: (idx + i) % 2 === 0 ? 1 : -1,
        speed: 8.5 + (i % 2) * 1.2, // ~17-20 m/s in grid units (35-40 km/h)
        lineNumber: (idx + i) % 2 === 0 ? '3' : '10', // Poznań tram lines 3 & 10 on Naramowicka/Wilczak!
      });
    }
  });

  // Spawn GTA 1 Retro Cars on major & residential streets (Naramowicka, Serbska, Al. Solidarności, Murawa...)
  const CAR_PALETTE = [
    [0.92, 0.22, 0.18], // Classic GTA Red sports
    [0.20, 0.55, 0.95], // Electric Blue
    [0.95, 0.78, 0.18], // Taxi Yellow
    [0.92, 0.94, 0.96], // White sedan
    [0.22, 0.78, 0.38], // Emerald Green
    [0.85, 0.45, 0.15], // Orange coupe
    [0.55, 0.60, 0.68], // Silver metallic
  ];

  const carRoads = (mapData.vectorRoads || [])
    .filter((r) => r.kind === 'asphalt' && r.prio >= 2)
    .map((r) => ({
      metric: buildPathMetric(r.pts),
      w: r.w,
      oneway: r.oneway,
      prio: r.prio,
    }))
    .filter((r) => r.metric.total >= 18);

  const cars = [];
  for (let i = 0; i < carRoads.length; i++) {
    const road = carRoads[i];
    const density = road.prio >= 4 ? 42 : 70;
    const numCars = Math.floor(road.metric.total / density);
    for (let c = 0; c < numCars && cars.length < 130; c++) {
      const dir = road.oneway ? 1 : (c % 2 === 0 ? 1 : -1);
      const color = CAR_PALETTE[(i * 3 + c * 7) % CAR_PALETTE.length];
      cars.push({
        road,
        dist: ((c + 0.25) / Math.max(1, numCars)) * road.metric.total,
        dir,
        speed: (road.prio >= 4 ? 10.5 : 7.0) + ((i + c) % 5) * 0.9,
        color,
        // 2m unit dimensions: length ~2.2 units (4.4m), width ~1.05 units (2.1m), height 0.52 floors
        length: 2.2,
        width: 1.05,
        height: 0.52,
      });
    }
  }

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
    const img = mctx.createImageData(200, 200);
    const d = img.data;

    for (let my = 0; my < 200; my++) {
      const gy = Math.floor((my / 200) * GRID);
      for (let mx = 0; mx < 200; mx++) {
        const gx = Math.floor((mx / 200) * GRID);
        const idx = gy * GRID + gx;
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
  const CAR_SPECS = [
    {
      name: 'Cossack GT (Sport)',
      color: [0.96, 0.18, 0.16],
      stripe: '#ffe066',
      engineForce: 46.0,
      reverseForce: 26.0,
      brakeForce: 54.0,
      maxSpeed: 29.0, // ~208 km/h in 2m units/s
      turnRate: 3.45,
      baseLatGrip: 9.2,
      handbrakeLatGrip: 1.45,
      oversteerTailKick: 2.1,
      bounciness: 0.56,
      length: 2.25,
      width: 1.08,
      height: 0.52,
    },
    {
      name: 'Polonez Caro 1.6',
      color: [0.16, 0.48, 0.85],
      stripe: null,
      engineForce: 34.0,
      reverseForce: 21.0,
      brakeForce: 42.0,
      maxSpeed: 22.5, // ~162 km/h
      turnRate: 3.15,
      baseLatGrip: 6.4, // loves sliding tail naturally!
      handbrakeLatGrip: 1.15,
      oversteerTailKick: 2.55,
      bounciness: 0.48,
      length: 2.30,
      width: 1.06,
      height: 0.56,
    },
    {
      name: 'Policja Poznań 997',
      color: [0.15, 0.32, 0.78],
      stripe: '#ffffff',
      isPolice: true,
      engineForce: 43.0,
      reverseForce: 25.0,
      brakeForce: 52.0,
      maxSpeed: 27.5, // ~198 km/h
      turnRate: 3.35,
      baseLatGrip: 8.6,
      handbrakeLatGrip: 1.35,
      oversteerTailKick: 2.25,
      bounciness: 0.60,
      length: 2.32,
      width: 1.10,
      height: 0.56,
    },
    {
      name: 'Taxi Winogrady',
      color: [0.96, 0.78, 0.12],
      stripe: '#1a1a1a',
      isTaxi: true,
      engineForce: 38.0,
      reverseForce: 23.0,
      brakeForce: 46.0,
      maxSpeed: 24.5, // ~176 km/h
      turnRate: 3.55,
      baseLatGrip: 7.5,
      handbrakeLatGrip: 1.25,
      oversteerTailKick: 2.35,
      bounciness: 0.52,
      length: 2.26,
      width: 1.08,
      height: 0.55,
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

  // Spatial Hash Grid (cell size = 10x10 units = 20x20m) for exact Vector Building Polygon Wall Collisions!
  const COLL_CELL = 10;
  const COLL_COLS = Math.ceil(GRID / COLL_CELL);
  const wallGrid = Array.from({ length: COLL_COLS * COLL_COLS }, () => []);

  function buildWallSpatialHash() {
    for (const b of (mapData.vectorBuildings || [])) {
      const floors = b.floors || 3;
      for (const ring of b.rings) {
        const n = ring.length;
        if (n < 3) continue;

        // Compute ring signed area to orient wall normals strictly OUTWARD from building
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

          // Outward unit normal
          const nx = (dy / len) * sign;
          const ny = (-dx / len) * sign;

          const seg = { x0, y0, x1, y1, nx, ny, len, floors };

          const minCX = Math.max(0, Math.floor((Math.min(x0, x1) - 1.5) / COLL_CELL));
          const maxCX = Math.min(COLL_COLS - 1, Math.floor((Math.max(x0, x1) + 1.5) / COLL_CELL));
          const minCY = Math.max(0, Math.floor((Math.min(y0, y1) - 1.5) / COLL_CELL));
          const maxCY = Math.min(COLL_COLS - 1, Math.floor((Math.max(y0, y1) + 1.5) / COLL_CELL));

          for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cx = minCX; cx <= maxCX; cx++) {
              wallGrid[cy * COLL_COLS + cx].push(seg);
            }
          }
        }
      }
    }
  }
  buildWallSpatialHash();

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
  };

  // Tire skidmarks ring buffer & particle emitters (smoke, sparks, debris)
  const MAX_SKIDS = 900;
  const skidMarks = [];
  const particles = [];

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
    player.x = sp.x;
    player.y = sp.y;
    player.angle = sp.angle;
    player.vx = 0;
    player.vy = 0;
    player.angularVel = 0;
    player.driftCombo = 0;
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

      // Calculate realistic GTA 1 multi-gear RPM curve
      const kmh = player.speed * 7.2;
      const gearThresholds = [0, 35, 70, 115, 155, 220];
      let gearIdx = 0;
      for (let i = 0; i < gearThresholds.length - 1; i++) {
        if (kmh >= gearThresholds[i]) gearIdx = i;
      }
      const gMin = gearThresholds[gearIdx];
      const gMax = gearThresholds[gearIdx + 1] || 220;
      const gearRpmNorm = Math.max(0, Math.min(1, (kmh - gMin) / Math.max(10, gMax - gMin)));

      // Different engine tone per car (Cossack GT higher sporty pitch, Polonez throatier low pitch)
      const carPitchMul = [1.18, 0.88, 1.05, 0.96][player.carIdx] || 1.0;
      const wheelspinBoost = (player.drifting && throttleInput) ? 24 : 0;
      const baseFreq = (42 + gearRpmNorm * 95 + (kmh * 0.28) + throttleInput * 16 + wheelspinBoost) * carPitchMul;

      this.engOsc1.frequency.setTargetAtTime(baseFreq, now, 0.035);
      this.engOsc2.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.035);
      this.engFilter.frequency.setTargetAtTime(190 + baseFreq * 3.8 + throttleInput * 220, now, 0.04);
      const targetEngVol = 0.09 + Math.min(0.16, (player.speed / 25) * 0.10 + throttleInput * 0.06);
      this.engGain.gain.setTargetAtTime(targetEngVol, now, 0.04);

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
  };

  // --- 9. Camera & Controls ---
  const state = {
    camX: player.x,
    camY: player.y,
    zoom: 1.15,
    effectiveZoom: 1.15,
    followCar: true,
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

  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    sfx.init();
    const k = e.key.toLowerCase();
    if (k === ' ') e.preventDefault();
    keys.add(k);

    if (k >= '1' && k <= '4') {
      selectCar(Number(k) - 1);
      sfx.playCurbBump();
    } else if (k === 'r') {
      respawnPlayerAt(player.x, player.y);
      sfx.playCurbBump();
    } else if (k === 'c') {
      player.damage = 0;
    } else if (k === 'm') {
      sfx.toggleMute();
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
      state.camX = Math.max(10, Math.min(GRID - 10, state.camX - dx));
      state.camY = Math.max(10, Math.min(GRID - 10, state.camY - dy));
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
    respawnPlayerAt(tx, ty);
    state.camX = player.x;
    state.camY = player.y;
  });

  minimapCanvas.addEventListener('mousedown', (e) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const tx = Math.max(10, Math.min(GRID - 10, mx * GRID));
    const ty = Math.max(10, Math.min(GRID - 10, my * GRID));
    respawnPlayerAt(tx, ty);
    state.camX = player.x;
    state.camY = player.y;
  });

  // --- 9.5. Player Vehicle Physics & Vector Collision Step ---
  function sampleGroundAt(x, y) {
    const gx = Math.max(0, Math.min(GRID - 1, Math.floor(x)));
    const gy = Math.max(0, Math.min(GRID - 1, Math.floor(y)));
    return groundGrid[gy * GRID + gx];
  }

  function updatePlayerPhysics(dt) {
    const spec = CAR_SPECS[player.carIdx];

    // Sample surface under vehicle center
    const gType = sampleGroundAt(player.x, player.y);
    const surf = SURFACE_PHYSICS[gType] || SURFACE_PHYSICS[GROUND.URBAN_PAVED];

    // Detect curb / offroad transition bump
    if (gType !== player.lastSurfaceType) {
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

    // Input controls
    const throttleInput = (keys.has('w') || keys.has('arrowup')) ? 1 : 0;
    const reverseInput = (keys.has('s') || keys.has('arrowdown')) ? 1 : 0;
    const leftInput = (keys.has('a') || keys.has('arrowleft')) ? 1 : 0;
    const rightInput = (keys.has('d') || keys.has('arrowright')) ? 1 : 0;
    const steerInput = rightInput - leftInput;
    const handbrake = keys.has(' ');

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

    if (throttleInput > 0) {
      if (vFwd < -0.5) {
        // Braking while moving backwards
        vFwd = Math.min(0, vFwd + spec.brakeForce * surf.grip * dt);
        player.braking = true;
      } else {
        // Accelerate forward with arcade power curve
        const accelFactor = Math.max(0.15, 1.0 - (vFwd / (maxAllowedSpeed * 1.15)) ** 2);
        vFwd += spec.engineForce * surf.grip * accelFactor * dt;
      }
    } else if (reverseInput > 0) {
      if (vFwd > 1.2) {
        // Service brake while moving forward
        vFwd = Math.max(0, vFwd - spec.brakeForce * surf.grip * dt);
        player.braking = true;
      } else {
        // Reverse gear
        vFwd = Math.max(-maxAllowedSpeed * 0.42, vFwd - spec.reverseForce * surf.grip * dt);
        player.reversing = true;
      }
    }

    // Handbrake slows longitudinal speed moderately while unlocking the rear axle for drift!
    if (handbrake) {
      player.braking = true;
      const hbDecel = 14.5 * surf.grip * dt;
      if (Math.abs(vFwd) <= hbDecel) vFwd = 0;
      else vFwd -= Math.sign(vFwd) * hbDecel;
    }

    // Rolling resistance + aerodynamic drag (stronger on grass/parks & sidewalks)
    const rollingDrag = surf.drag * 2.8 * dt;
    if (!throttleInput && !reverseInput && Math.abs(vFwd) < rollingDrag) {
      vFwd = 0;
    } else {
      vFwd -= Math.sign(vFwd) * rollingDrag;
    }
    vFwd *= Math.exp(-surf.drag * 0.45 * dt);

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
    if (player.x > GRID - margin) { player.x = GRID - margin; player.vx = -Math.abs(player.vx) * 0.6; }
    if (player.y < margin) { player.y = margin; player.vy = Math.abs(player.vy) * 0.6; }
    if (player.y > GRID - margin) { player.y = GRID - margin; player.vy = -Math.abs(player.vy) * 0.6; }

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
          if (cy < 0 || cy >= COLL_COLS) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const cx = cellX + dx;
            if (cx < 0 || cx >= COLL_COLS) continue;
            const walls = wallGrid[cy * COLL_COLS + cx];

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
    const curIdx = Math.floor(player.y) * GRID + Math.floor(player.x);
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

    // Dynamic Traffic & Tram Collisions (Bounce off moving cars & MPK trams!)
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
      // Look ahead in direction of velocity so player sees upcoming intersections!
      const lookAheadX = player.vx * 0.34;
      const lookAheadY = player.vy * 0.34;
      const targetCamX = Math.max(10, Math.min(GRID - 10, player.x + lookAheadX));
      const targetCamY = Math.max(10, Math.min(GRID - 10, player.y + lookAheadY));

      const camFollowRate = Math.min(1.0, 7.5 * dt);
      state.camX += (targetCamX - state.camX) * camFollowRate + state.shakeX;
      state.camY += (targetCamY - state.camY) * camFollowRate + state.shakeY;

      // Dynamic GTA 1 Speed Zoom-Out: zooms out up to 28% at top speed, zooms back in when stopped
      const speedRatio = Math.min(1.0, player.speed / spec.maxSpeed);
      const targetZoom = state.zoom * (1.0 - speedRatio * 0.28);
      state.effectiveZoom += (targetZoom - state.effectiveZoom) * Math.min(1.0, 4.5 * dt);
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

    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    if (hudCoordsEl) hudCoordsEl.textContent = `X:${cx} Y:${cy}`;

    // Speedometer (1 unit/s = 2 m/s = 7.2 km/h)
    const kmh = Math.round(player.speed * 7.2);
    if (hudSpeedEl) hudSpeedEl.textContent = String(kmh);

    if (hudGearEl) {
      let gear = 'N';
      if (player.reversing || player.forwardSpeed < -0.5) gear = 'R';
      else if (kmh > 1) {
        if (kmh < 35) gear = '1';
        else if (kmh < 70) gear = '2';
        else if (kmh < 115) gear = '3';
        else if (kmh < 155) gear = '4';
        else gear = '5';
      }
      hudGearEl.textContent = gear;
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
    if (hoverX >= 0 && hoverX < GRID && hoverY >= 0 && hoverY < GRID) {
      const idx = hoverY * GRID + hoverX;
      const h = heightGrid[idx];
      if (h > 0) {
        const pal = BLDG_PALETTES[styleGrid[idx]] || BLDG_PALETTES[1];
        tileInspectorEl.textContent = `${pal.name} (${h} p.) [Odbicie]`;
      } else {
        tileInspectorEl.textContent = GROUND_NAMES[groundGrid[idx]] || 'Teren';
      }
    }

    let bestName = 'WINOGRADY';
    let bestDistSq = 900;

    const dCenter = (cx - 250) ** 2 + (cy - 250) ** 2;
    if (dCenter < 900) {
      bestName = 'UL. NARAMOWICKA 47';
      bestDistSq = dCenter;
    }

    for (const lm of mapData.landmarks) {
      const d2 = (cx - lm.x) ** 2 + (cy - lm.y) ** 2;
      if (d2 < 320 && d2 < bestDistSq) {
        bestDistSq = d2;
        bestName = lm.name.toUpperCase();
      }
    }

    if (bestName === 'WINOGRADY') {
      for (const st of mapData.streets) {
        const d2 = (cx - st.x) ** 2 + (cy - st.y) ** 2;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestName = st.name.toUpperCase();
        }
      }
    }

    if (hudBannerEl.textContent !== bestName) {
      hudBannerEl.textContent = bestName;
    }
  }

  // --- 11. Main Render Loop ---
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;

    // Step player vehicle arcade drift physics & vector polygon collisions
    updatePlayerPhysics(dt);

    const w = canvas.width;
    const h = canvas.height;
    const centerX = w * 0.5;
    const centerY = h * 0.5;
    const tilePx = BASE_TILE_PX * state.effectiveZoom;

    // Update dynamic vehicles & trams VBO
    const dynamicVertCount = updateAndBuildTraffic(dt);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniform2f(uCamLoc, state.camX, state.camY);
    gl.uniform2f(uResLoc, w, h);
    gl.uniform1f(uTilePxLoc, tilePx);
    gl.uniform1f(uPerspKLoc, state.perspectiveStrength);
    gl.uniform1f(uGridModeLoc, state.showGrid ? 1.0 : 0.0);
    gl.uniform1f(uCollModeLoc, state.showCollision ? 1.0 : 0.0);

    // Draw Call 1: Smooth Vector Ground Plane
    bindVertexLayout(mesh.vbo);
    gl.uniform1f(uIsGroundLoc, 1.0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Draw Call 2: All Smooth 2.5D Buildings
    gl.uniform1f(uIsGroundLoc, 0.0);
    gl.drawArrays(gl.TRIANGLES, mesh.bldgStartVertex, mesh.bldgVertexCount);

    // Draw Call 3: All Moving 2.5D Cars & MPK Poznań Trams!
    if (dynamicVertCount > 0) {
      bindVertexLayout(dynamicVbo);
      gl.drawArrays(gl.TRIANGLES, 0, dynamicVertCount);
    }

    // 2D Overlay: Skidmarks, Headlights, Particles, Labels & Collision Debug
    lctx.clearRect(0, 0, w, h);

    const halfCols = Math.ceil(w / tilePx / 2) + 6;
    const halfRows = Math.ceil(h / tilePx / 2) + 6;
    const minTileX = Math.max(0, Math.floor(state.camX - halfCols));
    const maxTileX = Math.min(GRID - 1, Math.ceil(state.camX + halfCols));
    const minTileY = Math.max(0, Math.floor(state.camY - halfRows));
    const maxTileY = Math.min(GRID - 1, Math.ceil(state.camY + halfRows));

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
      lctx.font = 'bold 11px "Courier New", monospace';

      for (const st of mapData.streets) {
        if (st.x < minTileX || st.x > maxTileX || st.y < minTileY || st.y > maxTileY) continue;
        const sx = centerX + (st.x - state.camX) * tilePx;
        const sy = centerY + (st.y - state.camY) * tilePx;
        lctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        lctx.fillText(st.name, sx + 1, sy + 1);
        lctx.fillStyle = '#d8d2b8';
        lctx.fillText(st.name, sx, sy);
      }

      lctx.font = 'bold 12px "Courier New", monospace';
      for (const lm of mapData.landmarks) {
        if (lm.x < minTileX || lm.x > maxTileX || lm.y < minTileY || lm.y > maxTileY) continue;
        const bx = centerX + (lm.x - state.camX) * tilePx;
        const by = centerY + (lm.y - state.camY) * tilePx;
        const hFactor = (lm.floors || 4) * 0.042 * state.perspectiveStrength;
        const rx = bx + (bx - centerX) * hFactor;
        const ry = by + (by - centerY) * hFactor;

        lctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        lctx.fillText(lm.name, rx + 1, ry + 1);
        lctx.fillText(lm.name, rx - 1, ry + 1);
        lctx.fillStyle = '#ffe066';
        lctx.fillText(lm.name, rx, ry);
      }

      // Label moving MPK trams with line numbers (Linia 3 / Linia 10)
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

    // Update Minimap Radar (including live moving trams, traffic & player heading arrow!)
    minimapCtx.drawImage(minimapBase, 0, 0);

    // Draw moving cars on radar
    minimapCtx.fillStyle = '#ff9933';
    for (const c of cars) {
      const s = samplePath(c.road.metric, c.dist);
      minimapCtx.fillRect((s.x / GRID) * 200 - 1, (s.y / GRID) * 200 - 1, 2, 2);
    }

    // Draw moving MPK trams on radar
    minimapCtx.fillStyle = '#59ff67';
    for (const tr of trams) {
      const s = samplePath(tr.track, tr.dist);
      minimapCtx.fillRect((s.x / GRID) * 200 - 2, (s.y / GRID) * 200 - 2, 4, 4);
    }

    const viewX = (minTileX / GRID) * 200;
    const viewY = (minTileY / GRID) * 200;
    const viewW = ((maxTileX - minTileX) / GRID) * 200;
    const viewH = ((maxTileY - minTileY) / GRID) * 200;
    minimapCtx.strokeStyle = '#ffd15c';
    minimapCtx.lineWidth = 1.2;
    minimapCtx.strokeRect(viewX, viewY, viewW, viewH);

    // Player directional triangle on radar
    const pxRadar = (player.x / GRID) * 200;
    const pyRadar = (player.y / GRID) * 200;
    minimapCtx.save();
    minimapCtx.translate(pxRadar, pyRadar);
    minimapCtx.rotate(player.angle);
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
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
