import fs from 'node:fs';
import path from 'node:path';

// Center: ul. Naramowicka 47, Poznań (Winogrady)
const CENTER_LAT = 52.43185;
const CENTER_LON = 16.94420;
const AREA_SLUG = 'naramowicka47';

// Coordinate system: 0..500 units (1 unit = 2 meters, total 1000m x 1000m)
const MAP_SIZE_METERS = 1000;
const TILE_SIZE_METERS = 2;
const GRID_SIZE = MAP_SIZE_METERS / TILE_SIZE_METERS; // 500

const METERS_PER_DEG_LAT = 111132.92;
const METERS_PER_DEG_LON = 111412.84 * Math.cos((CENTER_LAT * Math.PI) / 180);

const FETCH_HALF_M = 560;
const dLat = FETCH_HALF_M / METERS_PER_DEG_LAT;
const dLon = FETCH_HALF_M / METERS_PER_DEG_LON;

const BBOX = {
  south: +(CENTER_LAT - dLat).toFixed(6),
  west: +(CENTER_LON - dLon).toFixed(6),
  north: +(CENTER_LAT + dLat).toFixed(6),
  east: +(CENTER_LON + dLon).toFixed(6),
};

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

const BLDG_STYLE = {
  NONE: 0,
  KAMIENICA_WARM: 1,
  KAMIENICA_PASTEL: 2,
  KAMIENICA_RED: 3,
  MODERN_OFFICE: 4,
  RATUSZ_SPECIAL: 5, // Naramowicka 47 highlight
  CHURCH_MONUMENT: 6,
  MARKET_STALL: 7,
};

function latLonToGrid(lat, lon) {
  const dxMeters = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const dyMeters = (CENTER_LAT - lat) * METERS_PER_DEG_LAT;
  const gx = +((dxMeters + MAP_SIZE_METERS / 2) / TILE_SIZE_METERS).toFixed(2);
  const gy = +((dyMeters + MAP_SIZE_METERS / 2) / TILE_SIZE_METERS).toFixed(2);
  return [gx, gy];
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPolygon(poly, callback) {
  if (poly.length < 3) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(GRID_SIZE - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(GRID_SIZE - 1, Math.ceil(maxY));

  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      if (pointInPoly(px, py, poly)) {
        callback(x, y);
      }
    }
  }
}

function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) ** 2 + (py - projY) ** 2;
}

function drawPolyline(points, halfWidthTiles, callback) {
  if (points.length < 2) return;
  const rSq = halfWidthTiles * halfWidthTiles;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - halfWidthTiles - 1));
    const maxX = Math.min(GRID_SIZE - 1, Math.ceil(Math.max(x1, x2) + halfWidthTiles + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - halfWidthTiles - 1));
    const maxY = Math.min(GRID_SIZE - 1, Math.ceil(Math.max(y1, y2) + halfWidthTiles + 1));

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        if (distToSegmentSq(px, py, x1, y1, x2, y2) <= rSq) {
          callback(x, y);
        }
      }
    }
  }
}

// Clean duplicate consecutive points in a closed polygon ring
function cleanRing(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (out.length === 0) {
      out.push(p);
    } else {
      const prev = out[out.length - 1];
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.08) {
        out.push(p);
      }
    }
  }
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.08) {
      out.pop();
    }
  }
  return out;
}

async function fetchOSM() {
  const rawPath = path.resolve(`data/poznan-${AREA_SLUG}-raw-osm.json`);
  if (fs.existsSync(rawPath)) {
    console.log(`Wczytywanie istniejących danych OSM z ${rawPath}...`);
    return JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  }
  throw new Error(`Brak pliku ${rawPath}`);
}

function hashId(id) {
  let x = (id ^ 61) ^ (id >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return Math.abs(x);
}

function parseFloors(tags, id) {
  if (tags['building:levels']) {
    const lvl = parseFloat(tags['building:levels']);
    if (!Number.isNaN(lvl) && lvl > 0) return Math.min(16, Math.max(1, Math.round(lvl)));
  }
  if (tags.height) {
    const h = parseFloat(String(tags.height).replace('m', '').trim());
    if (!Number.isNaN(h) && h > 0) return Math.min(16, Math.max(1, Math.round(h / 3.0)));
  }
  if (tags.building === 'garages' || tags.building === 'garage' || tags.building === 'kiosk' || tags.building === 'shed') {
    return 1;
  }
  if (tags.building === 'retail' || tags.building === 'supermarket' || tags.building === 'commercial') {
    return 2;
  }
  if (tags.building === 'school' || tags.building === 'kindergarten') {
    return 3;
  }
  if (tags.building === 'church' || tags.amenity === 'place_of_worship') {
    return 6;
  }
  if (tags.building === 'apartments') {
    return (hashId(id) % 4 === 0) ? 11 : 5;
  }
  return 2 + (hashId(id) % 3);
}

function pickBuildingStyle(tags, id, floors) {
  const street = (tags['addr:street'] || '').toLowerCase();
  const num = (tags['addr:housenumber'] || '').toLowerCase();
  if (street.includes('naramowicka') && num === '47') {
    return BLDG_STYLE.RATUSZ_SPECIAL;
  }
  if (tags.building === 'church' || tags.amenity === 'place_of_worship' || tags.building === 'school') {
    return BLDG_STYLE.CHURCH_MONUMENT;
  }
  if (tags.building === 'garages' || tags.building === 'garage' || tags.building === 'kiosk' || tags.building === 'retail') {
    return BLDG_STYLE.MARKET_STALL;
  }
  if (floors >= 8 || tags.building === 'office' || tags.building === 'commercial') {
    return BLDG_STYLE.MODERN_OFFICE;
  }
  if (tags.building === 'apartments') {
    return (hashId(id) % 2 === 0) ? BLDG_STYLE.KAMIENICA_PASTEL : BLDG_STYLE.MODERN_OFFICE;
  }
  const h = hashId(id) % 10;
  if (h < 4) return BLDG_STYLE.KAMIENICA_WARM;
  if (h < 7) return BLDG_STYLE.KAMIENICA_PASTEL;
  return BLDG_STYLE.KAMIENICA_RED;
}

async function main() {
  const osm = await fetchOSM();

  const nodes = new Map();
  const ways = new Map();
  const relations = [];
  const addressNodes = [];

  for (const el of osm.elements) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lat, el.lon]);
      if (el.tags && (el.tags['addr:housenumber'] || el.tags.name || el.tags.shop || el.tags.amenity)) {
        addressNodes.push(el);
      }
    } else if (el.type === 'way') {
      ways.set(el.id, el);
    } else if (el.type === 'relation') {
      relations.push(el);
    }
  }

  function getWayCoords(way) {
    if (!way || !way.nodes) return [];
    const pts = [];
    for (const nid of way.nodes) {
      const n = nodes.get(nid);
      if (n) pts.push(latLonToGrid(n[0], n[1]));
    }
    return pts;
  }

  function getRelationOuterRings(rel) {
    const outerWays = (rel.members || [])
      .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === ''))
      .map((m) => ways.get(m.ref))
      .filter(Boolean);

    const rings = [];
    const segments = outerWays.map((w) => ({
      first: w.nodes[0],
      last: w.nodes[w.nodes.length - 1],
      coords: getWayCoords(w),
    })).filter((s) => s.coords.length >= 2);

    const used = new Array(segments.length).fill(false);
    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const ring = [...segments[i].coords];
      let head = segments[i].first;
      let tail = segments[i].last;

      let progress = true;
      while (progress && head !== tail) {
        progress = false;
        for (let j = 0; j < segments.length; j++) {
          if (used[j]) continue;
          if (segments[j].first === tail) {
            ring.push(...segments[j].coords.slice(1));
            tail = segments[j].last;
            used[j] = true;
            progress = true;
          } else if (segments[j].last === tail) {
            ring.push(...[...segments[j].coords].reverse().slice(1));
            tail = segments[j].first;
            used[j] = true;
            progress = true;
          }
        }
      }
      if (ring.length >= 3) rings.push(ring);
    }
    return rings;
  }

  // We keep the 500x500 grid for fast O(1) physics/collision lookup AND also export exact vector polygons/polylines!
  const totalTiles = GRID_SIZE * GRID_SIZE;
  const groundGrid = new Uint8Array(totalTiles);
  const heightGrid = new Uint8Array(totalTiles);
  const styleGrid = new Uint8Array(totalTiles);

  const vectorLanduse = [];
  const vectorRoads = [];
  const vectorTrams = [];
  const vectorBuildings = [];
  const landmarks = [];
  const streetLabels = new Map();

  // 1. Vector Landuse (Parks, Grass, Parking lots, Plazas, Water)
  function processLandArea(pts, tags) {
    if (pts.length < 3) return;
    let kind = null;
    if (
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.leisure === 'playground' ||
      tags.leisure === 'pitch' ||
      tags.landuse === 'grass' ||
      tags.landuse === 'allotments' ||
      tags.landuse === 'village_green' ||
      tags.landuse === 'recreation_ground' ||
      tags.landuse === 'forest' ||
      tags.landuse === 'meadow' ||
      tags.natural === 'wood' ||
      tags.natural === 'scrub' ||
      tags.natural === 'grassland'
    ) {
      kind = 'grass';
      fillPolygon(pts, (x, y) => { groundGrid[y * GRID_SIZE + x] = GROUND.GRASS; });
    } else if (tags.natural === 'water' || tags.amenity === 'fountain' || tags.waterway === 'riverbank') {
      kind = 'water';
      fillPolygon(pts, (x, y) => { groundGrid[y * GRID_SIZE + x] = GROUND.WATER; });
    } else if (tags.place === 'square' || (tags.highway === 'pedestrian' && tags.area === 'yes')) {
      kind = 'plaza';
      fillPolygon(pts, (x, y) => { groundGrid[y * GRID_SIZE + x] = GROUND.COBBLESTONE; });
    } else if (tags.amenity === 'parking' || tags.landuse === 'commercial' || tags.landuse === 'retail') {
      kind = 'paved';
      fillPolygon(pts, (x, y) => { groundGrid[y * GRID_SIZE + x] = GROUND.URBAN_PAVED; });
    }

    if (kind) {
      const cleaned = cleanRing(pts);
      if (cleaned.length >= 3) {
        vectorLanduse.push({ kind, pts: cleaned });
      }
    }
  }

  for (const way of ways.values()) {
    const tags = way.tags || {};
    const pts = getWayCoords(way);
    processLandArea(pts, tags);
  }

  for (const rel of relations) {
    const tags = rel.tags || {};
    for (const ring of getRelationOuterRings(rel)) {
      processLandArea(ring, tags);
    }
  }

  // 2. Vector Roads, Sidewalks, Footways
  for (const way of ways.values()) {
    const tags = way.tags || {};
    if (!tags.highway || tags.area === 'yes') continue;
    const pts = getWayCoords(way);
    if (pts.length < 2) continue;

    const hw = tags.highway;
    let widthTiles = 0; // full width in 2m units
    let kind = 'asphalt';
    let prio = 2;
    let hasCenterLine = false;
    let hasSidewalk = true;

    if (hw === 'primary' || hw === 'trunk' || hw === 'primary_link' || hw === 'trunk_link') {
      widthTiles = 6.2; // 12.4m wide carriageway
      prio = 5;
      hasCenterLine = true;
    } else if (hw === 'secondary' || hw === 'secondary_link') {
      widthTiles = 5.2; // 10.4m
      prio = 4;
      hasCenterLine = true;
    } else if (hw === 'tertiary' || hw === 'tertiary_link') {
      widthTiles = 4.2; // 8.4m
      prio = 3;
      hasCenterLine = true;
    } else if (hw === 'residential' || hw === 'unclassified' || hw === 'living_street') {
      widthTiles = 3.2; // 6.4m
      prio = 2;
      if (hw === 'living_street') kind = 'cobble';
    } else if (hw === 'service') {
      widthTiles = 2.0; // 4.0m
      prio = 1;
      hasSidewalk = false;
    } else if (hw === 'pedestrian') {
      widthTiles = 3.2;
      kind = 'plaza';
      prio = 1;
      hasSidewalk = false;
    } else if (hw === 'footway' || hw === 'path' || hw === 'cycleway' || hw === 'steps') {
      widthTiles = 1.1; // 2.2m smooth footpath
      kind = 'footway';
      prio = 0;
      hasSidewalk = false;
    } else {
      continue;
    }

    const oneway = tags.oneway === 'yes' || tags.junction === 'roundabout';
    const lanes = parseInt(tags.lanes || '0', 10);

    vectorRoads.push({
      pts,
      w: widthTiles,
      kind,
      prio,
      hasSidewalk,
      hasCenterLine,
      oneway,
      lanes,
      roundabout: tags.junction === 'roundabout',
      name: tags.name || '',
    });

    // Also populate collision/surface grid
    if (kind === 'footway') {
      drawPolyline(pts, widthTiles * 0.5, (x, y) => {
        if (groundGrid[y * GRID_SIZE + x] < GROUND.SIDEWALK) {
          groundGrid[y * GRID_SIZE + x] = GROUND.SIDEWALK;
        }
      });
    } else {
      if (hasSidewalk) {
        drawPolyline(pts, widthTiles * 0.5 + 0.9, (x, y) => {
          if (groundGrid[y * GRID_SIZE + x] < GROUND.SIDEWALK) {
            groundGrid[y * GRID_SIZE + x] = GROUND.SIDEWALK;
          }
        });
      }
      drawPolyline(pts, widthTiles * 0.5, (x, y) => {
        groundGrid[y * GRID_SIZE + x] = kind === 'cobble' ? GROUND.ROAD_COBBLE : GROUND.ROAD_ASPHALT;
      });
    }

    if (tags.name && !streetLabels.has(tags.name)) {
      const mid = pts[Math.floor(pts.length / 2)];
      if (mid[0] >= 12 && mid[0] < GRID_SIZE - 12 && mid[1] >= 12 && mid[1] < GRID_SIZE - 12) {
        streetLabels.set(tags.name, {
          name: tags.name,
          x: Math.round(mid[0]),
          y: Math.round(mid[1]),
        });
      }
    }
  }

  // Sort vector roads by priority so main arteries render cleanly on top of service/residential connections
  vectorRoads.sort((a, b) => a.prio - b.prio);

  // 3. Vector Tram Tracks
  for (const way of ways.values()) {
    const tags = way.tags || {};
    if (tags.railway !== 'tram') continue;
    const pts = getWayCoords(way);
    if (pts.length < 2) continue;
    vectorTrams.push({ pts });
    drawPolyline(pts, 0.8, (x, y) => {
      groundGrid[y * GRID_SIZE + x] = GROUND.TRAM_TRACK;
    });
  }

  // 4. Vector Buildings (Exact smooth OSM polygons!)
  const [nara47X, nara47Y] = latLonToGrid(52.4317814, 16.9448342);
  let buildingCount = 0;

  function addVectorBuilding(rings, tags, id) {
    const cleanedRings = rings.map(cleanRing).filter((r) => r.length >= 3);
    if (cleanedRings.length === 0) return;

    // Check if any vertex is inside our 0..500 map bounds
    let inBounds = false;
    for (const r of cleanedRings) {
      for (const [x, y] of r) {
        if (x >= -15 && x <= GRID_SIZE + 15 && y >= -15 && y <= GRID_SIZE + 15) {
          inBounds = true;
          break;
        }
      }
    }
    if (!inBounds) return;

    const floors = parseFloors(tags, id);
    let style = pickBuildingStyle(tags, id, floors);

    let containsNara47 = false;
    for (const poly of cleanedRings) {
      if (pointInPoly(nara47X, nara47Y, poly)) {
        containsNara47 = true;
      }
    }
    if (containsNara47) {
      style = BLDG_STYLE.RATUSZ_SPECIAL;
    }

    let sumX = 0, sumY = 0, count = 0;
    for (const poly of cleanedRings) {
      for (const [px, py] of poly) {
        sumX += px;
        sumY += py;
        count++;
      }
      // Also mark collision heightGrid for gameplay physics & minimap
      fillPolygon(poly, (x, y) => {
        const idx = y * GRID_SIZE + x;
        if (floors >= heightGrid[idx]) {
          heightGrid[idx] = floors;
          styleGrid[idx] = style;
        }
      });
    }

    buildingCount++;
    vectorBuildings.push({
      rings: cleanedRings,
      floors,
      style,
    });

    if (count > 0) {
      const cx = Math.round(sumX / count);
      const cy = Math.round(sumY / count);
      if (cx < 5 || cx >= GRID_SIZE - 5 || cy < 5 || cy >= GRID_SIZE - 5) return;

      const street = tags['addr:street'] || '';
      const num = tags['addr:housenumber'] || '';
      let labelName = tags.name || '';

      if (containsNara47 || (street.toLowerCase().includes('naramowicka') && num === '47')) {
        labelName = 'Naramowicka 47';
      } else if (!labelName && street.toLowerCase().includes('naramowicka') && num) {
        labelName = `Naramowicka ${num}`;
      } else if (!labelName && tags['addr:place'] && num) {
        labelName = `${tags['addr:place']} ${num}`;
      }

      if (
        labelName &&
        (containsNara47 ||
          labelName.includes('Naramowicka') ||
          tags.amenity ||
          tags.shop ||
          tags.building === 'school' ||
          tags.building === 'church' ||
          floors >= 8)
      ) {
        if (!landmarks.some((l) => l.name === labelName)) {
          landmarks.push({ name: labelName, x: cx, y: cy, floors, style });
        }
      }
    }
  }

  for (const rel of relations) {
    const tags = rel.tags || {};
    if (!tags.building && !tags['building:part']) continue;
    const rings = getRelationOuterRings(rel);
    if (rings.length > 0) {
      addVectorBuilding(rings, tags, rel.id);
    }
  }

  for (const way of ways.values()) {
    const tags = way.tags || {};
    if (!tags.building && !tags['building:part']) continue;
    const pts = getWayCoords(way);
    if (pts.length >= 3) {
      addVectorBuilding([pts], tags, way.id);
    }
  }

  const rx47 = Math.round(nara47X);
  const ry47 = Math.round(nara47Y);
  if (!landmarks.some((l) => l.name === 'Naramowicka 47')) {
    landmarks.unshift({
      name: 'Naramowicka 47',
      x: rx47,
      y: ry47,
      floors: heightGrid[ry47 * GRID_SIZE + rx47] || 4,
      style: BLDG_STYLE.RATUSZ_SPECIAL,
    });
  }

  for (const n of addressNodes) {
    const t = n.tags || {};
    const [gx, gy] = latLonToGrid(n.lat, n.lon);
    const ix = Math.round(gx);
    const iy = Math.round(gy);
    if (ix < 15 || ix >= GRID_SIZE - 15 || iy < 15 || iy >= GRID_SIZE - 15) continue;

    let label = null;
    if (t['addr:street'] === 'Naramowicka' && t['addr:housenumber'] === '47' && t.name) {
      label = `Naramowicka 47 (${t.name})`;
    } else if (t.railway === 'tram_stop' && t.name) {
      label = `Przystanek: ${t.name}`;
    } else if ((t.shop === 'supermarket' || t.shop === 'convenience') && t.name) {
      label = t.name;
    }

    if (label && !landmarks.some((l) => l.name === label)) {
      landmarks.push({
        name: label,
        x: ix,
        y: iy,
        floors: heightGrid[iy * GRID_SIZE + ix] || 2,
        style: 5,
      });
    }
  }

  const mapPayload = {
    meta: {
      city: 'Poznań, Polska',
      centerName: 'ul. Naramowicka 47 (Winogrady)',
      centerLat: CENTER_LAT,
      centerLon: CENTER_LON,
      sizeMeters: MAP_SIZE_METERS,
      tileSizeMeters: TILE_SIZE_METERS,
      gridWidth: GRID_SIZE,
      gridHeight: GRID_SIZE,
      buildingCount,
      generatedAt: new Date().toISOString(),
    },
    groundBase64: Buffer.from(groundGrid.buffer).toString('base64'),
    heightBase64: Buffer.from(heightGrid.buffer).toString('base64'),
    styleBase64: Buffer.from(styleGrid.buffer).toString('base64'),
    vectorLanduse,
    vectorRoads,
    vectorTrams,
    vectorBuildings,
    landmarks: landmarks.slice(0, 75),
    streets: Array.from(streetLabels.values()),
  };

  const jsonPath = path.resolve('data/poznan-tilemap.json');
  const jsPath = path.resolve('data/poznan-tilemap.js');

  fs.writeFileSync(jsonPath, JSON.stringify(mapPayload));
  fs.writeFileSync(
    jsPath,
    `// Auto-generated GTA 1 Poznań 1x1km Vector+Hybrid Map - ul. Naramowicka 47\nwindow.POZNAN_TILEMAP = ${JSON.stringify(mapPayload)};\n`
  );

  console.log(
    `Gotowe! Wyeksportowano gładkie wektory: ${vectorBuildings.length} budynków, ${vectorRoads.length} odcinków dróg, ${vectorTrams.length} torów tramwajowych, ${vectorLanduse.length} terenów.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
