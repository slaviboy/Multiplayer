// Football (Goal Heads): the match simulation, the CPU player and the lockstep buffer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  BALL_R,
  BAR_Y,
  GOAL_TICKS,
  GOAL_X,
  INTRO_TICKS,
  KEY,
  PHASE,
  READY_TICKS,
  TICKS_PER_SECOND,
  createMatch,
  hashState,
  step,
} from '../../games/football/js/sim.js';
import { Cpu, seededRandom } from '../../games/football/js/ai.js';
import { Lockstep } from '../../games/football/js/lockstep.js';
import { BOOTS, HEADS, JERSEYS, SOUNDS, STADIUMS } from '../../games/football/js/catalog.js';
import { defaultKit, distinctKits, randomKit, validKit } from '../../games/football/js/roster.js';

const ASSETS = new URL('../../games/football/assets/', import.meta.url);

/** Runs the match to the end of the intro (the ball is released). */
function kickedOff(opts) {
  const s = createMatch(opts);
  while (s.phase !== PHASE.PLAY) step(s, [0, 0]);
  return s;
}

function runTicks(s, n, inputs = () => [0, 0]) {
  for (let i = 0; i < n; i++) step(s, inputs(s, i));
  return s;
}

/** Random-ish key presses, the same for the same seed. */
function masher(seed) {
  const rnd = seededRandom(seed);
  let bits = [0, 0];
  return (s, i) => {
    if (i % 7 === 0) bits = [Math.floor(rnd() * 32), Math.floor(rnd() * 32)];
    return bits;
  };
}

test('the same inputs give the same match, bit for bit', () => {
  const a = createMatch({ seconds: 30 });
  const b = createMatch({ seconds: 30 });
  const ia = masher(5);
  const ib = masher(5);
  for (let i = 0; i < 30 * TICKS_PER_SECOND + 400; i++) {
    step(a, ia(a, i));
    step(b, ib(b, i));
    if (i % 40 === 0) assert.equal(hashState(a), hashState(b), `tick ${i}`);
  }
  assert.deepEqual(a.score, b.score);
  // and different inputs give a different match
  const c = runTicks(createMatch({ seconds: 30 }), 600, masher(6));
  const d = runTicks(createMatch({ seconds: 30 }), 600, masher(5));
  assert.notEqual(hashState(c), hashState(d));
});

test('the match waits for the intro, then the ball drops and settles on the pitch', () => {
  const s = createMatch();
  runTicks(s, INTRO_TICKS - 1, () => [KEY.RIGHT, KEY.LEFT]);
  assert.equal(s.phase, PHASE.INTRO);
  assert.equal(s.players[0].x, -5, 'players are held during the intro');
  assert.equal(s.ball.y, 6);
  step(s, [0, 0]);
  assert.equal(s.phase, PHASE.PLAY);
  runTicks(s, 10 * TICKS_PER_SECOND);
  assert.ok(Math.abs(s.ball.y - BALL_R) < 1e-9, `ball at rest on the ground (${s.ball.y})`);
  assert.ok(Math.abs(s.ball.x) < 0.01);
});

test('a shot in front of the goal scores, then play restarts from the middle', () => {
  const s = kickedOff();
  Object.assign(s.players[0], { x: 4 });
  Object.assign(s.players[1], { x: -6 }); // out of the way
  Object.assign(s.ball, { x: 4.6, y: BALL_R, vx: 0, vy: 0 });
  step(s, [KEY.SHOT, 0]);
  let ticks = 0;
  while (s.phase === PHASE.PLAY && ticks++ < 200) step(s, [0, 0]);
  assert.equal(s.phase, PHASE.GOAL);
  assert.deepEqual(s.score, [1, 0]);
  assert.equal(s.lastGoal, 0);
  assert.ok(s.ball.x - BALL_R > GOAL_X && s.ball.y < BAR_Y);
  runTicks(s, GOAL_TICKS);
  assert.equal(s.phase, PHASE.READY);
  assert.deepEqual([s.players[0].x, s.players[1].x, s.ball.x, s.ball.y], [-5, 5, 0, 6]);
  runTicks(s, READY_TICKS);
  assert.equal(s.phase, PHASE.PLAY);
});

test('kicks: a shot stays low and fast, an aerial goes high; the ball only moves forward', () => {
  for (const [key, check] of [
    [KEY.SHOT, (apex, vx) => apex < 1.2 && vx > 14],
    [KEY.LOB, (apex, vx) => apex > 3.5 && vx > 5 && vx < 10],
  ]) {
    for (const side of [0, 1]) {
      const s = kickedOff();
      const p = s.players[side];
      const other = s.players[1 - side];
      other.x = p.f * -8; // behind the kicker
      p.x = 0;
      Object.assign(s.ball, { x: p.f * 0.6, y: BALL_R, vx: 0, vy: 0 });
      const inputs = side === 0 ? [key, 0] : [0, key];
      step(s, inputs);
      const vx = s.ball.vx * p.f;
      let apex = 0;
      runTicks(s, 40, (st) => {
        apex = Math.max(apex, st.ball.y);
        return [0, 0];
      });
      assert.ok(check(apex, vx), `side ${side} key ${key}: apex ${apex.toFixed(2)} vx ${vx.toFixed(2)}`);
    }
  }
});

test('a ball falling on a head is headed: forward from the face, up from the top', () => {
  const s = kickedOff();
  const p = s.players[0];
  s.players[1].x = 8;
  p.x = 0;
  Object.assign(s.ball, { x: 0.55, y: 2.1, vx: 0, vy: -2 }); // onto the face
  runTicks(s, 3);
  assert.ok(s.ball.vx > 5 && s.ball.vy > 4, `front header ${s.ball.vx}, ${s.ball.vy}`);
  const t = kickedOff();
  t.players[1].x = 8;
  t.players[0].x = 0;
  Object.assign(t.ball, { x: -0.069, y: 2.25, vx: 0, vy: -1 }); // onto the top
  runTicks(t, 3);
  assert.ok(Math.abs(t.ball.vx) < 3 && t.ball.vy > 6, `upward header ${t.ball.vx}, ${t.ball.vy}`);
});

test('players stay on the pitch, apart, and under the crossbar', () => {
  const s = kickedOff();
  runTicks(s, 400, (st, i) => [i < 200 ? KEY.LEFT | KEY.JUMP : KEY.RIGHT, i < 200 ? KEY.LEFT : KEY.RIGHT | KEY.JUMP]);
  for (let i = 0; i < 600; i++) {
    step(s, [KEY.RIGHT | (i % 3 ? KEY.JUMP : 0), KEY.LEFT | (i % 5 ? 0 : KEY.JUMP)]);
    const [a, b] = s.players;
    for (const p of [a, b]) {
      assert.ok(Math.abs(p.x) <= 8.95 + 1e-9, `x ${p.x}`);
      assert.ok(p.y >= 0);
      if (Math.abs(p.x) + 0.48 > GOAL_X) assert.ok(p.y + 1.99 <= BAR_Y + 0.001, 'head under the crossbar');
    }
    const overlap = Math.min(a.y, b.y) + 1.99 - Math.max(a.y, b.y);
    if (overlap > 0.01) assert.ok(Math.abs(a.x - b.x) >= 0.9, `players overlap at ${a.x}, ${b.x}`);
  }
});

test('a ball jammed between two players pushing each other pops out', () => {
  const s = kickedOff();
  s.players[0].x = -0.6;
  s.players[1].x = 0.6;
  Object.assign(s.ball, { x: 0, y: BALL_R, vx: 0, vy: 0 });
  let free = false;
  for (let i = 0; i < 80 && !free; i++) {
    step(s, [KEY.RIGHT, KEY.LEFT]);
    free = s.ball.y > 2.5;
  }
  assert.ok(free, 'the ball rose over the players');
});

test('time up with a draw goes to a golden goal; the next goal ends the match', () => {
  const s = kickedOff({ seconds: 2 });
  runTicks(s, 2 * TICKS_PER_SECOND + 1);
  assert.equal(s.phase, PHASE.PLAY);
  assert.ok(s.golden && s.clock === 0);
  Object.assign(s.ball, { x: -GOAL_X - 1, y: 1, vx: -5, vy: 0 });
  step(s, [0, 0]);
  assert.equal(s.phase, PHASE.GOAL);
  runTicks(s, GOAL_TICKS);
  assert.equal(s.phase, PHASE.END);
  assert.equal(s.winner, 1);
  // with a lead at the whistle the match just ends
  const t = kickedOff({ seconds: 1 });
  t.score = [2, 1];
  runTicks(t, TICKS_PER_SECOND + 1);
  assert.equal(t.phase, PHASE.END);
  assert.equal(t.winner, 0);
});

test('CPU matches always finish, and harder CPUs win more', () => {
  const wins = { hard: 0, easy: 0 };
  for (let seed = 1; seed <= 8; seed++) {
    for (const [left, right] of [
      ['hard', 'easy'],
      ['easy', 'hard'],
    ]) {
      const s = createMatch({ seconds: 60 });
      const a = new Cpu(0, left, seed);
      const b = new Cpu(1, right, seed + 100);
      let n = 0;
      while (s.phase !== PHASE.END && n++ < 40 * 400) step(s, [a.input(s), b.input(s)]);
      assert.equal(s.phase, PHASE.END, `seed ${seed}: the match ended`);
      assert.ok(s.score[0] + s.score[1] > 0, 'goals were scored');
      if (s.winner >= 0) wins[[left, right][s.winner]]++;
    }
  }
  assert.ok(wins.hard > wins.easy, `hard ${wins.hard} vs easy ${wins.easy}`);
});

test('lockstep: both sides run the same inputs although messages arrive late', () => {
  const delay = 3;
  const sides = [new Lockstep({ delay, me: 0 }), new Lockstep({ delay, me: 1 })];
  const wire = [[], []]; // messages in flight to side i: [arrivalStep, tick, bits]
  const ran = [[], []];
  const rnd = seededRandom(9);
  for (let t = 0; t < 400; t++) {
    for (const i of [0, 1]) {
      const ls = sides[i];
      for (const m of wire[i].filter((w) => w[0] <= t)) ls.addRemote(m[1], m[2]);
      wire[i] = wire[i].filter((w) => w[0] > t);
      let k;
      while ((k = ls.nextSample()) >= 0) {
        const bits = Math.floor(rnd() * 32);
        ls.addLocal(k, bits);
        wire[1 - i].push([t + 1 + Math.floor(rnd() * 3), k, bits]); // 1-3 steps late
      }
      if (ls.ready()) ran[i].push(ls.take().join(','));
    }
  }
  const n = Math.min(ran[0].length, ran[1].length);
  assert.ok(n > 300);
  assert.deepEqual(ran[0].slice(0, n), ran[1].slice(0, n));
  assert.deepEqual(ran[0].slice(0, delay), Array(delay).fill('0,0'));
  // a partner who lost inputs can have them again
  const { from, values } = sides[0].localFrom(sides[0].tick);
  assert.equal(from, sides[0].tick);
  assert.ok(values.every((v) => Number.isInteger(v)));
});

test('outfits: defaults are valid, bad ones are rejected, the CPU dresses differently', () => {
  for (const h of HEADS) assert.ok(validKit(defaultKit(h.id)), h.id);
  assert.equal(validKit(null), null);
  assert.equal(validKit({ head: 'nobody', jersey: JERSEYS[0].id, boots: BOOTS[0].id }), null);
  assert.equal(validKit({ head: HEADS[0].id, jersey: '<script>', boots: BOOTS[0].id }), null);
  const k = validKit({ head: HEADS[3].id, jersey: JERSEYS[2].id, boots: BOOTS[4].id, neck: 'evil' });
  assert.equal(k.neck, HEADS[3].neck, 'the neck always comes from the head');
  const rnd = seededRandom(3);
  for (let i = 0; i < 50; i++) {
    const me = defaultKit(HEADS[i % HEADS.length].id);
    const cpu = randomKit(rnd, me);
    assert.notEqual(cpu.head, me.head);
    assert.notEqual(cpu.jersey, me.jersey);
  }
  const [a, b] = distinctKits(defaultKit('leon-messo'), { ...defaultKit('kylo-mbappy'), jersey: defaultKit('leon-messo').jersey });
  assert.notEqual(a.jersey, b.jersey);
});

test('every catalogue entry has its file', () => {
  const missing = [];
  const need = (p) => existsSync(new URL(p, ASSETS)) || missing.push(p);
  for (const h of HEADS) need(`heads/${h.id}.webp`);
  for (const j of JERSEYS) need(`jerseys/${j.id}.webp`);
  for (const b of BOOTS) need(`boots/${b.id}.webp`);
  for (const s of STADIUMS) need(`stadiums/${s}.jpg`);
  for (const s of SOUNDS) need(`sounds/${s}.m4a`);
  for (const n of ['dark', 'soft']) need(`necks/${n}.webp`);
  assert.deepEqual(missing, []);
  // the simulation must stay deterministic: no clock, random or inexact maths in it
  const sim = readFileSync(new URL('../../games/football/js/sim.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  for (const banned of ['Math.random', 'Date.', 'performance.', 'Math.sin', 'Math.cos', 'Math.pow', 'Math.hypot', 'Math.atan', 'Math.exp', '**']) {
    assert.ok(!sim.includes(banned), `sim.js uses ${banned}`);
  }
});
