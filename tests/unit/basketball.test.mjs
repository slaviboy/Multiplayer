// Basketball online play: deterministic maths and the lockstep input buffer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as det from '../../games/basketball/online/detmath.js';
import { Lockstep, encodeInput, decodeInput, IDLE, MAX_INPUT } from '../../games/basketball/online/lockstep.js';

// relative error, falling back to absolute near zero
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

function sweep(n, lo, hi) {
  const rnd = det.seededRandom(42);
  return Array.from({ length: n }, () => lo + (hi - lo) * rnd());
}

test('sin, cos and tan match Math to ~1 ulp, also for large angles', () => {
  for (const x of [...sweep(4000, -20, 20), ...sweep(2000, -2e5, 2e5), 0, -0, 1e-9, Math.PI, -Math.PI / 2, 0.785398]) {
    assert.ok(close(det.sin(x), Math.sin(x), 2e-15), `sin(${x})`);
    assert.ok(close(det.cos(x), Math.cos(x), 2e-15), `cos(${x})`);
  }
  for (const x of sweep(2000, -1.5, 1.5)) assert.ok(close(det.tan(x), Math.tan(x), 1e-14), `tan(${x})`);
  assert.ok(Number.isNaN(det.sin(Infinity)) && Number.isNaN(det.cos(NaN)));
  assert.ok(Object.is(det.sin(-0), -0));
});

test('atan, atan2, asin and acos match Math, including the special cases', () => {
  for (const x of [...sweep(3000, -50, 50), ...sweep(500, -1e8, 1e8), 0, 0.4375, 0.6875, 1.1875, 2.4375, 1e-30]) {
    assert.ok(close(det.atan(x), Math.atan(x), 2e-16 * 4), `atan(${x})`);
  }
  const rnd = det.seededRandom(7);
  for (let i = 0; i < 4000; i++) {
    const y = (rnd() - 0.5) * 400;
    const x = (rnd() - 0.5) * 400;
    assert.ok(close(det.atan2(y, x), Math.atan2(y, x), 1e-15), `atan2(${y}, ${x})`);
  }
  for (const [y, x] of [[0, 1], [-0, 1], [0, -1], [-0, -1], [1, 0], [-1, 0], [0, 0], [0, -0], [Infinity, Infinity], [-Infinity, -Infinity], [5, Infinity], [5, -Infinity], [Infinity, 3]]) {
    assert.ok(Object.is(det.atan2(y, x), Math.atan2(y, x)) || close(det.atan2(y, x), Math.atan2(y, x), 1e-15), `atan2(${y}, ${x})`);
  }
  for (const x of [...sweep(2000, -1, 1), -1, 1, 0]) {
    assert.ok(close(det.asin(x), Math.asin(x), 1e-15), `asin(${x})`);
    assert.ok(close(det.acos(x), Math.acos(x), 1e-15), `acos(${x})`);
  }
  assert.ok(Number.isNaN(det.asin(1.5)) && Number.isNaN(det.acos(-2)));
});

test('exp, log and pow match Math', () => {
  for (const x of [...sweep(3000, -700, 700), 0, 1e-12, -1e-12]) assert.ok(close(det.exp(x), Math.exp(x), 4e-15), `exp(${x})`);
  for (const x of [...sweep(3000, 1e-6, 1e6), 1, 2, 0.5, Number.MIN_VALUE, 1e300]) assert.ok(close(det.log(x), Math.log(x), 4e-15), `log(${x})`);
  assert.equal(det.log(0), -Infinity);
  assert.ok(Number.isNaN(det.log(-1)));
  for (const [x, y] of [[2, 10], [10, -3], [-3, 3], [1.5, 2], [0.3, 0.7], [9, 0.5], [2, -0.5], [100, 1.25], [0, 2], [0, -1], [-8, 1 / 3], [7, 0]]) {
    const a = det.pow(x, y);
    const b = Math.pow(x, y);
    assert.ok(Object.is(a, b) || close(a, b, 1e-14), `pow(${x}, ${y}) = ${a}, Math: ${b}`);
  }
});

test('the functions use only exactly rounded operations: same bits on every run', () => {
  const xs = sweep(500, -1000, 1000);
  const run = () => xs.map((x) => [det.sin(x), det.cos(x), det.atan2(x, 3), det.pow(Math.abs(x) + 1, 0.37)]);
  assert.deepEqual(run(), run());
});

test('deterministic() swaps Math only while fn runs, and seeds Math.random', () => {
  const nativeSin = Math.sin;
  const nativeRandom = Math.random;
  const a = det.deterministic(det.seededRandom(99), () => [Math.random(), Math.random(), Math.sin === det.sin]);
  const b = det.deterministic(det.seededRandom(99), () => [Math.random(), Math.random()]);
  assert.deepEqual(a.slice(0, 2), b);
  assert.equal(a[2], true);
  assert.equal(Math.sin, nativeSin);
  assert.equal(Math.random, nativeRandom);
  assert.throws(() => det.deterministic(det.seededRandom(1), () => {
    throw new Error('boom');
  }), /boom/);
  assert.equal(Math.sin, nativeSin, 'restored after an exception');
});

test('inputs pack into 11 bits and back', () => {
  const sample = { move: -1, dash: 1, jump: true, jumpSkip: false, action: true, super: false, block: true, ready: false, release: true };
  const bits = encodeInput(sample);
  assert.ok(bits >= 0 && bits <= MAX_INPUT);
  assert.deepEqual(decodeInput(bits), sample);
  assert.deepEqual(decodeInput(IDLE), { move: 0, dash: 0, jump: false, jumpSkip: false, action: false, super: false, block: false, ready: true, release: true });
});

test('lockstep: the first `delay` ticks need no inputs, later ticks need both', () => {
  const host = new Lockstep({ delay: 3, me: 0 });
  const guest = new Lockstep({ delay: 3, me: 1 });
  const wire = [];
  const step = (ls, bits) => {
    const t = ls.nextSample();
    if (t >= 0) {
      ls.addLocal(t, bits);
      wire.push([ls.me, t, bits]);
    }
    if (!ls.ready()) return null;
    return ls.take();
  };
  // the host runs alone: ticks 0..2 run, tick 3 waits for the guest
  const ran = [];
  for (let i = 0; i < 6; i++) ran.push(step(host, 10 + i));
  assert.deepEqual(ran.slice(0, 3), [[IDLE, IDLE], [IDLE, IDLE], [IDLE, IDLE]]);
  assert.equal(ran[3], null);
  assert.equal(host.tick, 3);
  assert.equal(host.nextSample(), -1, 'at most `delay` ticks of input ahead');
  // deliver everything both ways and let the guest catch up
  for (let i = 0; i < 6; i++) step(guest, 20 + i);
  for (const [from, t, bits] of wire.splice(0)) (from === 0 ? guest : host).addRemote(t, bits);
  const hostTicks = [];
  const guestTicks = [];
  while (host.ready()) hostTicks.push(host.take());
  while (guest.ready()) guestTicks.push(guest.take());
  // both ran tick 3..5 with the same pair of inputs
  assert.deepEqual(hostTicks, guestTicks.slice(-hostTicks.length));
  assert.deepEqual(hostTicks[0], [10, 20]);
});

test('lockstep: lost inputs can be sent again from a tick', () => {
  const ls = new Lockstep({ delay: 2, me: 1 });
  ls.addLocal(2, 5);
  ls.addLocal(3, 6);
  assert.deepEqual(ls.localFrom(0), { from: 2, values: [5, 6] });
  assert.deepEqual(ls.localFrom(3), { from: 3, values: [6] });
});
