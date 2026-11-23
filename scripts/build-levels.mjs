// Builds Tiled JSON levels for Stan & Lisa from readable ASCII sources.
//
//   node scripts/build-levels.mjs            build every games/stan-and-lisa/levels-src/*.mjs
//   node scripts/build-levels.mjs --check    exit 1 if a built file is missing or out of date
//
// Source format (see levels-src/README.md for the full legend):
//   export default {
//     file: 'coop_01_hold_the_gate.json',
//     map: ['#####', '#S.W#', ...],          // one string per tile row, all the same width
//     objects: [{ kind: 'pusher', at: '1', group: 1 }, ...],
//   }
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const GAME_DIR = 'games/stan-and-lisa';
export const SRC_DIR = `${GAME_DIR}/levels-src`;
export const OUT_DIR = `${GAME_DIR}/data/friends/levels`;
const TILE = 32;

export const GROUND = {
  '#': 1, // solid rock
  '/': 2, // floor slope, solid lower-right ◢
  '\\': 3, // floor slope ◣
  F: 4, // ceiling slope ◥
  7: 5, // ceiling slope ◤
  w: 6, // water: kills Stan
  l: 7, // lava: kills Lisa
  g: 8, // goo: kills everyone
  '|': 11, // back wall without collision (portals sit in it)
  i: 14, // ice
  '.': 0,
  ' ': 0,
};
// '7' and 'F' are ground; never use them as object markers.

// Fixed markers placed automatically ('^' thorns and 'k' checkpoints are handled
// separately below).
const FIXED = {
  S: { kind: 'stan' },
  W: { kind: 'lisa' },
  A: { kind: 'stanDoor' },
  B: { kind: 'lisaDoor' },
  r: { kind: 'red' },
  b: { kind: 'blue' },
  v: { kind: 'silver' },
};

const TILE_GIDS = {
  stan: 35,
  lisa: 36,
  stanDoor: 37,
  lisaDoor: 38,
  red: 39,
  blue: 40,
  silver: 41,
  fat: 44,
  small: 45,
  jump: 46,
  pusher: 16,
  lever: 17,
  leverMirrored: 18,
  box: 20,
  ball: 26,
  boxHeavy: 29,
  timedPusher: 30,
  portal: 32,
};
const CHARS_LAYER = new Set(['stan', 'lisa', 'stanDoor', 'lisaDoor', 'red', 'blue', 'silver', 'fat', 'small', 'jump']);

/** Template tilesets (same external files every level uses). */
function tilesets() {
  return [
    { firstgid: 1, source: '../../../assets/tilemaps/tilesets/Ground.json' },
    { firstgid: 16, source: '../../../assets/tilemaps/tilesets/Objects.json' },
    { firstgid: 32, source: '../../../assets/tilemaps/tilesets/LargeObjects.json' },
    { firstgid: 35, source: '../../../assets/tilemaps/tilesets/Chars.json' },
  ];
}

function propType(v) {
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'string') return 'string';
  return Number.isInteger(v) ? 'int' : 'float';
}

function properties(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([name, value]) => ({ name, type: propType(value), value }));
}

/**
 * Converts one source definition into a Tiled map object.
 * Placement rules (c = column, r = row of the marker cell):
 *  - characters, doors, boxes: marker in the left cell of the 2-wide footprint, just above the floor
 *      → x = c·32, y = (r+1)·32 (the floor surface)
 *  - pushers, levers, timed pushers: same marker rule → x = c·32, y = (r+2)·32 (the engine centres them on the floor surface)
 *  - diamonds: marker is the diamond's cell → centre of that cell
 *  - platforms: every cell with the marker, as one rectangle; or `rect: [col, row, w, h]`.
 *    `dx`/`dy` are in tiles in screen directions: dx > 0 moves right, dy < 0 moves up.
 *  - portals: `pos: [col, bottomRow]` (64×96, rotation 0) against a column of '|' back wall
 */
export function buildLevel(src) {
  const name = src.file || '(unnamed)';
  const fail = (msg) => {
    throw new Error(`${name}: ${msg}`);
  };
  const map = src.map;
  if (!Array.isArray(map) || map.length < 3) fail('map must be an array of rows');
  const height = map.length;
  const width = map[0].length;
  const markers = new Map();
  const data = [];

  map.forEach((row, r) => {
    if (row.length !== width) fail(`row ${r} has ${row.length} columns, expected ${width}`);
    [...row].forEach((ch, c) => {
      if (ch in GROUND) {
        data.push(GROUND[ch]);
        return;
      }
      data.push(0);
      if (!markers.has(ch)) markers.set(ch, []);
      markers.get(ch).push([c, r]);
    });
  });

  const objects = [];
  const chars = [];
  let nextId = 1;

  const cellOf = (marker) => {
    const cells = markers.get(marker);
    if (!cells) fail(`marker '${marker}' is not on the map`);
    return cells[0];
  };

  const tileObject = (kind, x, y, props = {}, extra = {}) => {
    const gid = TILE_GIDS[kind];
    if (!gid) fail(`unknown object kind '${kind}'`);
    const o = {
      gid,
      height: kind === 'portal' ? 96 : 64,
      id: nextId++,
      name: '',
      rotation: 0,
      type: '',
      visible: true,
      width: 64,
      x,
      y,
      ...extra,
    };
    const p = properties(props);
    if (p.length) o.properties = p;
    (CHARS_LAYER.has(kind) ? chars : objects).push(o);
  };

  const place = (kind, cell, props) => {
    const [c, r] = cell;
    if (kind === 'red' || kind === 'blue' || kind === 'silver') {
      // the engine centres a diamond at (x + 32, y - 32)
      return tileObject(kind, c * TILE + TILE / 2 - 32, r * TILE + TILE / 2 + 32, props);
    }
    if (kind === 'pusher' || kind === 'lever' || kind === 'leverMirrored' || kind === 'timedPusher') {
      return tileObject(kind, c * TILE, (r + 2) * TILE, props);
    }
    return tileObject(kind, c * TILE, (r + 1) * TILE, props);
  };

  // fixed single-character markers
  for (const [marker, def] of Object.entries(FIXED)) {
    for (const cell of markers.get(marker) || []) place(def.kind, cell);
    markers.delete(marker);
  }

  // '^' thorns: each horizontal run becomes one strip (extras/extras.js)
  const thorns = (markers.get('^') || []).slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  markers.delete('^');
  for (let i = 0; i < thorns.length; ) {
    const [c0, r] = thorns[i];
    let n = 1;
    while (i + n < thorns.length && thorns[i + n][1] === r && thorns[i + n][0] === c0 + n) n++;
    objects.push({ height: TILE, id: nextId++, name: '', rotation: 0, type: 'thorns', visible: true, width: n * TILE, x: c0 * TILE, y: r * TILE });
    i += n;
  }

  // 'k' checkpoint flags, standing on the floor below the marker (extras/extras.js)
  for (const [c, r] of markers.get('k') || []) {
    objects.push({ height: TILE, id: nextId++, name: '', rotation: 0, type: 'checkpoint', visible: true, width: TILE, x: c * TILE, y: r * TILE });
  }
  markers.delete('k');

  const used = new Set();
  for (const obj of src.objects || []) {
    const { kind, at, rect, pos, ...props } = obj;
    if (at) used.add(at);
    if (kind === 'ladder') {
      // extras/extras.js: climbable column; every cell with the marker
      const cells = markers.get(at);
      if (!cells) fail(`marker '${at}' is not on the map`);
      const cs = cells.map(([c]) => c);
      const rs = cells.map(([, r]) => r);
      const x0 = Math.min(...cs);
      const y0 = Math.min(...rs);
      objects.push({
        height: (Math.max(...rs) - y0 + 1) * TILE,
        id: nextId++,
        name: '',
        properties: properties({ group: props.group, initialState: props.initialState }),
        rotation: 0,
        type: 'ladder',
        visible: true,
        width: (Math.max(...cs) - x0 + 1) * TILE,
        x: x0 * TILE,
        y: y0 * TILE,
      });
    } else if (kind === 'platform') {
      let x0, y0, w, h;
      if (rect) {
        [x0, y0, w, h] = rect;
      } else {
        const cells = markers.get(at);
        if (!cells) fail(`marker '${at}' is not on the map`);
        const cs = cells.map(([c]) => c);
        const rs = cells.map(([, r]) => r);
        x0 = Math.min(...cs);
        y0 = Math.min(...rs);
        w = Math.max(...cs) - x0 + 1;
        h = Math.max(...rs) - y0 + 1;
        if (cells.length !== w * h) fail(`platform '${at}' is not a filled rectangle`);
      }
      // Sources use screen directions (dx > 0 right, dy < 0 up). The engine moves
      // platforms in Box2D's axes, where both are flipped: engine dx > 0 is left
      // and engine dy > 0 is up (verified in the browser).
      const flip = (v) => (v ? -v : 0);
      const p = properties({ dx: flip(props.dx), dy: flip(props.dy), group: props.group, dontFocus: props.dontFocus });
      objects.push({
        height: h * TILE,
        id: nextId++,
        name: '',
        properties: p,
        rotation: 0,
        type: 'platform',
        visible: true,
        width: w * TILE,
        x: x0 * TILE,
        y: y0 * TILE,
      });
    } else if (kind === 'torch') {
      // extras/extras.js: a light source centred on the top edge of its marker cell
      for (const [c, r] of markers.get(at) || [cellOf(at)]) {
        objects.push({
          height: 64,
          id: nextId++,
          name: '',
          properties: properties({ group: props.group, radius: props.radius, initialState: props.initialState }),
          rotation: 0,
          type: 'torch',
          visible: true,
          width: 32,
          x: c * TILE,
          y: (r - 1) * TILE,
        });
      }
    } else if (kind === 'monster' || kind === 'fireflies') {
      // extras/extras.js: polyline objects. Monster path points are [column, floorRow]
      // (it walks on that floor, centred in the column); firefly points are cell centres.
      if (!Array.isArray(obj.path) || obj.path.length < 2) fail(`${kind} needs path: [[col,row], ...]`);
      const pts = obj.path.map(([c, r]) =>
        kind === 'monster' ? { x: c * TILE + TILE / 2, y: r * TILE } : { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 },
      );
      const { path: _path, ...rest } = props;
      objects.push({
        height: 0,
        id: nextId++,
        name: '',
        polyline: pts.map((p) => ({ x: p.x - pts[0].x, y: p.y - pts[0].y })),
        properties: properties(rest),
        rotation: 0,
        type: kind,
        visible: true,
        width: 0,
        x: pts[0].x,
        y: pts[0].y,
      });
    } else if (kind === 'portal') {
      if (!pos) fail('portal needs pos: [col, bottomRow]');
      tileObject('portal', pos[0] * TILE, pos[1] * TILE, {
        group: props.group,
        portalId: props.portalId,
        initialState: props.initialState ?? 0,
      });
    } else if (kind in TILE_GIDS) {
      if (!at) fail(`${kind} needs a marker ('at')`);
      for (const cell of markers.get(at) || [cellOf(at)]) place(kind, cell, props);
    } else {
      fail(`unknown object kind '${kind}'`);
    }
  }

  const unused = [...markers.keys()].filter((m) => !used.has(m));
  if (unused.length) fail(`markers without an object: ${unused.join(' ')}`);

  const count = (gid) => chars.filter((o) => o.gid === gid).length;
  for (const [gid, what] of [
    [35, 'Stan (S)'],
    [36, 'Lisa (W)'],
    [37, "Stan's door (A)"],
    [38, "Lisa's door (B)"],
  ]) {
    if (count(gid) !== 1) fail(`needs exactly one ${what}, found ${count(gid)}`);
  }

  const tiled = {
    compressionlevel: -1,
    height,
    infinite: false,
    layers: [
      { data, height, id: 1, name: 'Ground', opacity: 1, type: 'tilelayer', visible: true, width, x: 0, y: 0 },
      { draworder: 'topdown', id: 2, name: 'Objects', objects, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
      { draworder: 'topdown', id: 3, name: 'Chars', objects: chars, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    ],
    nextlayerid: 4,
    nextobjectid: nextId,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.6.0',
    tileheight: TILE,
    tilesets: tilesets(),
    tilewidth: TILE,
    type: 'map',
    version: '1.6',
    width,
  };
  // level-wide options for extras/extras.js: darkness ('dark' | 'reveal'), lightRadius, piggyback
  const mapProps = properties(src.properties || {});
  if (mapProps.length) tiled.properties = mapProps;
  return tiled;
}

export async function loadSources(dir = SRC_DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_')) // _helpers are not levels
    .sort();
  const out = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    out.push({ source: f, def: mod.default });
  }
  return out;
}

export const serialize = (level) => `${JSON.stringify(level)}\n`;

async function main() {
  const check = process.argv.includes('--check');
  const sources = await loadSources();
  let stale = 0;
  for (const { source, def } of sources) {
    const json = serialize(buildLevel(def));
    const target = join(OUT_DIR, def.file);
    let current = null;
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      /* not built yet */
    }
    if (current !== null) current = current.replace(/\r\n/g, '\n'); // core.autocrlf checkouts
    if (check) {
      if (current !== json) {
        console.error(`out of date: ${target} (from ${source}); run: npm run levels`);
        stale++;
      }
    } else if (current !== json) {
      writeFileSync(target, json);
      console.log(`built ${target}`);
    }
  }
  if (check && stale) process.exit(1);
  if (!check) console.log(`${sources.length} level source(s) up to date`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
