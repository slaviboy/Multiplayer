// Lockstep input buffer for two players.
//
// Both browsers run the same match tick by tick (40 ticks a second). A tick runs
// only when both players' inputs for it are known. Each side samples its input
// `delay` ticks ahead and sends it, so the partner normally has it before it is
// needed; ticks before `delay` use no input on both sides. If the partner's input
// is late, the tick waits (the game slows down) instead of guessing.

export class Lockstep {
  /**
   * @param {object} o
   * @param {number} o.delay  ticks between sampling an input and using it
   * @param {0|1} o.me        my slot (0 = left / host, 1 = right / guest)
   * @param {number} [o.idle] the input of a player who presses nothing
   */
  constructor({ delay, me, idle = 0 }) {
    this.delay = delay;
    this.me = me;
    this.idle = idle;
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
    const from = Math.max(tick, this.delay);
    const values = [];
    for (let t = from; t <= this.sampled; t++) values.push(this.inputs[this.me].get(t));
    return { from, values };
  }

  ready() {
    return this.tick < this.delay || (this.inputs[0].has(this.tick) && this.inputs[1].has(this.tick));
  }

  /** Both inputs for the next tick; advances. Call only when ready(). */
  take() {
    const t = this.tick;
    let pair;
    if (t < this.delay) pair = [this.idle, this.idle];
    else {
      pair = [this.inputs[0].get(t), this.inputs[1].get(t)];
      this.inputs[1 - this.me].delete(t);
      this.inputs[this.me].delete(t - 400); // keep my own a while for resending
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
