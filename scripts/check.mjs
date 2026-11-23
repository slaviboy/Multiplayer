// Repository checks, run by the pre-commit hook and by CI before deploying.
//   node scripts/check.mjs
// Exits 1 with a list of problems.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildLevel, loadSources, serialize, OUT_DIR } from './build-levels.mjs';

const problems = [];
const fail = (msg) => problems.push(msg);

function readJson(path) {
  try {
    const buf = readFileSync(path);
    const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    fail(`${path}: invalid JSON (${err.message})`);
    return null;
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1. the game registry
const registry = readJson('games.json');
const ids = new Set();
for (const game of (registry && registry.games) || []) {
  for (const key of ['id', 'title', 'path', 'description']) if (!game[key]) fail(`games.json: a game is missing "${key}"`);
  if (ids.has(game.id)) fail(`games.json: duplicate id "${game.id}" (ids also namespace saved progress)`);
  ids.add(game.id);
  if (game.path && !existsSync(join(game.path, 'index.html'))) fail(`games.json: ${game.path}index.html does not exist`);
  if (game.thumbnail && !existsSync(game.thumbnail)) fail(`games.json: thumbnail ${game.thumbnail} does not exist`);
}

// 2. every JSON file in the repo parses
for (const file of walk('.').filter((f) => f.endsWith('.json'))) readJson(file);

// 3. Stan & Lisa: level map and level files
const GAME = 'games/stan-and-lisa';
const temple = readJson(`${GAME}/data/friends/temple.json`);
if (temple) {
  const nodeIds = new Set();
  const levelIds = new Set();
  for (const lvl of temple.levels) {
    if (levelIds.has(lvl.id)) fail(`temple.json: duplicate level id ${lvl.id} (it keys saved progress)`);
    levelIds.add(lvl.id);
    if (nodeIds.has(lvl._id)) fail(`temple.json: duplicate node _id ${lvl._id}`);
    nodeIds.add(lvl._id);
    const path = `${GAME}/data/${lvl.filename}`;
    if (!existsSync(path)) {
      fail(`temple.json: level ${lvl.id} points at missing ${lvl.filename}`);
      continue;
    }
    const map = readJson(path);
    if (!map) continue;
    const layers = Object.fromEntries((map.layers || []).map((l) => [l.name, l]));
    if (!layers.Objects || !layers.Chars) fail(`${lvl.filename}: needs both an Objects and a Chars layer`);
    if (!map.layers || map.layers[0].type !== 'tilelayer') fail(`${lvl.filename}: the first layer must be the ground tile layer`);
    const chars = (layers.Chars && layers.Chars.objects) || [];
    for (const [gid, what] of [
      [35, 'Stan'],
      [36, 'Lisa'],
      [37, "Stan's door"],
      [38, "Lisa's door"],
    ]) {
      const n = chars.filter((o) => o.gid === gid).length;
      if (n !== 1) fail(`${lvl.filename}: needs exactly one ${what}, found ${n}`);
    }
    const portals = {};
    for (const o of (layers.Objects && layers.Objects.objects) || []) {
      if (o.gid === 32 || o.gid === 33) {
        const props = Object.fromEntries((o.properties || []).map((p) => [p.name, p.value]));
        const key = props.portalId || 0;
        portals[key] = (portals[key] || 0) + 1;
      }
    }
    for (const [key, n] of Object.entries(portals)) if (n !== 2) fail(`${lvl.filename}: portalId ${key} has ${n} portals (needs 2)`);
  }
  for (const e of temple.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) fail(`temple.json: edge ${e.source}->${e.target} points at a missing _id`);
  }
  // map nodes must not overlap (measured on a 1280x720 screen: box 1152x648, nodes ~56px)
  const placed = temple.levels.filter((l) => l.x >= 0 && l.y >= 0);
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const d = Math.hypot((a.x - b.x) * 1152, (a.y - b.y) * 648);
      if (d < 58) fail(`temple.json: levels ${a.id} and ${b.id} overlap on the map (${Math.round(d)}px apart)`);
    }
  for (const l of placed) if (l.x > 1 || l.y > 1) fail(`temple.json: level ${l.id} is outside the map (${l.x}, ${l.y})`);
}

// 4. generated levels are up to date with their sources
for (const { source, def } of await loadSources()) {
  try {
    const json = serialize(buildLevel(def));
    const target = join(OUT_DIR, def.file);
    const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== json) fail(`${target} is out of date with levels-src/${source}; run: npm run levels`);
  } catch (err) {
    fail(`levels-src/${source}: ${err.message}`);
  }
}

if (problems.length) {
  console.error(`check: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('check: ok');
