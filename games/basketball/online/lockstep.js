// Lockstep input buffer for two players.
//
// Both browsers run the same match tick by tick (40 ticks a second). A tick runs
// only when both players' inputs for it are known. Each side samples its input
// `delay` ticks ahead and sends it, so the partner normally has it before it is
// needed; ticks before `delay` use no input on both sides. If the partner's input
// is late, the tick waits (the game slows down) instead of guessing.

/** One player's controls for one tick, packed into an integer. */
export function encodeInput(i) {
  const dir = (v) => (v < 0 ? 1 : v > 0 ? 2 : 0);
  return (
    dir(i.move) |
    (dir(i.dash) << 2) |
    (i.jump ? 1 << 4 : 0) |
    (i.jumpSkip ? 1 << 5 : 0) |
    (i.action ? 1 << 6 : 0) |
    (i.super ? 1 << 7 : 0) |
    (i.block ? 1 << 8 : 0) |
    (i.ready ? 1 << 9 : 0) | // readyForAction(): the action key is up
    (i.release ? 1 << 10 : 0) // releaseBlockOrPump(): the block key is up
  );
}

export function decodeInput(bits) {
  const dir = (v) => (v === 1 ? -1 : v === 2 ? 1 : 0);
  return {
    move: dir(bits & 3),
    dash: dir((bits >> 2) & 3),
    jump: !!(bits & (1 << 4)),
    jumpSkip: !!(bits & (1 << 5)),
    action: !!(bits & (1 << 6)),
    super: !!(bits & (1 << 7)),
    block: !!(bits & (1 << 8)),
    ready: !!(bits & (1 << 9)),
    release: !!(bits & (1 << 10)),
  };
}

/** No keys held: ready to act, nothing to release. */
export const IDLE = encodeInput({ ready: true, release: true });

export const MAX_INPUT = (1 << 11) - 1;

export class Lockstep {
  /**
   * @param {object} o
   * @param {number} o.delay  ticks between sampling an input and using it
   * @param {0|1} o.me        my slot (0 = left / host, 1 = right / guest)
   */
  constructor({ delay, me }) {
    this.delay = delay;
    this.me = me;
    this.tick = 0; // next tick to run
    this.inputs = [new Map(), new Map()];
    this.sampled = delay - 1; // last tick that has my input
  }

  /** The tick whose input should be sampled now, or -1 when up to date. */
  nextSample() {
    return this.sampled < this.tick + this.delay ? this.sampled + 1 : -1;
  }

  addLocal(tick, bits) {
    if (tick !== this.sampled + 1) throw new Error(`lockstep: sampled tick ${tick}, expected ${this.sampled + 1}`);
    this.inputs[this.me].set(tick, bits);
    this.sampled = tick;
  }

  addRemote(tick, bits) {
    if (tick < this.tick || tick < this.delay) return;
    this.inputs[1 - this.me].set(tick, bits);
  }

  /** My inputs from `tick` on, for a partner who lost them (e.g. after a reconnect). */
  localFrom(tick) {
    const out = [];
    for (let t = Math.max(tick, this.delay); t <= this.sampled; t++) out.push(this.inputs[this.me].get(t));
    return { from: Math.max(tick, this.delay), values: out };
  }

  ready() {
    return this.tick < this.delay || (this.inputs[0].has(this.tick) && this.inputs[1].has(this.tick));
  }

  /** Both inputs for the next tick; advances. Call only when ready(). */
  take() {
    const t = this.tick;
    let pair;
    if (t < this.delay) pair = [IDLE, IDLE];
    else {
      pair = [this.inputs[0].get(t), this.inputs[1].get(t)];
      this.inputs[1 - this.me].delete(t);
      // keep my own a while for resending
      this.inputs[this.me].delete(t - 400);
    }
    this.tick++;
    return pair;
  }

  /** How many ticks the partner's inputs reach ahead of the next tick to run (-1: missing). */
  lead() {
    let t = this.tick;
    while (this.inputs[1 - this.me].has(t)) t++;
    return t - this.tick - 1;
  }
}
