import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLevel, loadSources } from '../../scripts/build-levels.mjs';
import { grid } from '../../games/stan-and-lisa/levels-src/_grid.mjs';

const W = 40;
const row = (s) => s.padEnd(W - 1, '.') + '#';
const frame = (inner) => ['#'.repeat(W), ...inner.map((s) => row(s)), '#'.repeat(W)];
const objectsOf = (level, layer) => level.layers.find((l) => l.name === layer).objects;

test('characters and doors are placed exactly like the hand-made blank.json', () => {
  const blank = JSON.parse(readFileSync('games/stan-and-lisa/data/friends/levels/blank.json', 'utf8'));
  const chars = objectsOf(blank, 'Chars');
  const stan = chars.find((o) => o.gid === 35);
  // blank.json: Stan at x=608,y=928 on the floor whose top is row 29 → marker at column 19, row 28
  const inner = Array.from({ length: 28 }, () => '#');
  inner[27] = '#..................S.W..A.B';
  const level = buildLevel({ file: 't.json', map: frame(inner) });
  const built = objectsOf(level, 'Chars').find((o) => o.gid === 35);
  assert.equal(built.x, stan.x);
  assert.equal(built.y, stan.y);
  assert.deepEqual(level.tilesets, blank.tilesets);
});

test('buttons sit one row lower than characters, and platforms use screen directions', () => {
  const level = buildLevel({
    file: 't.json',
    map: frame(['#', '#', '#S.W.A.B..1..PP']),
    objects: [
      { kind: 'pusher', at: '1', group: 2 },
      { kind: 'platform', at: 'P', dx: 3, dy: -2, group: 2 },
    ],
  });
  const pusher = objectsOf(level, 'Objects').find((o) => o.gid === 16);
  assert.equal(pusher.y, (3 + 2) * 32, 'pusher marker on row 3 → y = (row + 2) * 32');
  const platform = objectsOf(level, 'Objects').find((o) => o.type === 'platform');
  const props = Object.fromEntries(platform.properties.map((p) => [p.name, p.value]));
  assert.deepEqual([props.dx, props.dy], [-3, 2], 'flipped to the engine axes');
  assert.deepEqual([platform.x, platform.y, platform.width, platform.height], [13 * 32, 3 * 32, 64, 32]);
});

test('thorns runs, checkpoints, ladders and map properties', () => {
  const level = buildLevel({
    file: 't.json',
    properties: { darkness: 'reveal', piggyback: true },
    map: frame(['#.......L', '#.......L', '#S.W.A.Bk^^^.^L']),
    objects: [{ kind: 'ladder', at: 'L', group: 1 }],
  });
  const objs = objectsOf(level, 'Objects');
  const thorns = objs.filter((o) => o.type === 'thorns');
  assert.deepEqual(thorns.map((o) => [o.x / 32, o.width / 32]), [[9, 3], [13, 1]]);
  assert.equal(objs.filter((o) => o.type === 'checkpoint').length, 1);
  const ladder = objs.find((o) => o.type === 'ladder');
  assert.deepEqual([ladder.x / 32, ladder.y / 32, ladder.height / 32], [8, 1, 3], 'bounding box of the L cells');
  assert.deepEqual(level.properties, [
    { name: 'darkness', type: 'string', value: 'reveal' },
    { name: 'piggyback', type: 'bool', value: true },
  ]);
});

test('objects can be placed by cell, and ladders by rect, without map markers', () => {
  const level = buildLevel({
    file: 't.json',
    map: frame(['#..............', '#..............', '#S.W.A.B.......']),
    objects: [
      { kind: 'pusher', cell: [9, 3], group: 1 },
      { kind: 'lever', cell: [11, 3], group: 1 },
      { kind: 'ladder', rect: [13, 1, 1, 3], group: 1 },
    ],
  });
  const objs = objectsOf(level, 'Objects');
  const pusher = objs.find((o) => o.gid === 16);
  const lever = objs.find((o) => o.gid === 17);
  assert.deepEqual([pusher.x / 32, pusher.y / 32], [9, 5], 'same as a marker in that cell');
  assert.deepEqual([lever.x / 32, lever.y / 32], [11, 5]);
  const ladder = objs.find((o) => o.type === 'ladder');
  assert.deepEqual([ladder.x / 32, ladder.y / 32, ladder.width / 32, ladder.height / 32], [13, 1, 1, 3]);
  assert.throws(() => buildLevel({ file: 't.json', map: frame(['#S.W.A.B']), objects: [{ kind: 'box', cell: [40, 1] }] }), /outside the map/);
});

test('broken sources are rejected with a clear message', () => {
  assert.throws(() => buildLevel({ file: 'w.json', map: ['###', '####', '###'] }), /row 1 has 4 columns/);
  assert.throws(() => buildLevel({ file: 'n.json', map: frame(['#.W.A.B']) }), /exactly one Stan/);
  assert.throws(() => buildLevel({ file: 'm.json', map: frame(['#S.W.A.B.Q']) }), /markers without an object: Q/);
});

test('every level source builds, has a walkthrough, and uses its grid helper correctly', async () => {
  const sources = await loadSources();
  assert.ok(sources.length >= 12);
  for (const { source, def } of sources) {
    assert.doesNotThrow(() => buildLevel(def), source);
    assert.ok(def.walkthrough && def.walkthrough.fb && def.walkthrough.wg, `${source} has a walkthrough for both`);
  }
  assert.throws(() => grid(4, 4).box(0, 0, 9, 0), /outside the map/);
});
