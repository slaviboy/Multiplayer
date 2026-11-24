// Builds long levels from proven pieces, left to right.
//
// Each piece draws its part of the map, adds its objects and the bot steps for
// both characters (the geometry and steps are the ones that passed in the
// hand-made levels 9-17, shifted to where the piece sits). Pieces that climb
// (ledge, lift, boxBank, climb) or go down (descend) change the floor height for
// the pieces after them.
//
//   const t = track({ height: 26, floor: 20 });
//   t.start().hill().gate('fb').bridgePool('wg').pillars().doors();
//   export default t.level({ file, title, properties });
//
// Rows: `floor` is the row of the ground's top surface; things stand in the row
// above it. A character's x in the steps is its centre in tiles.
import { grid } from './_grid.mjs';

const other = (id) => (id === 'fb' ? 'wg' : 'fb');
const liquidOf = (id) => (id === 'fb' ? 'l' : 'w'); // what only this character can wade

export function track({ height, floor }) {
  const H = height;
  let x = 1; // next free column
  let f = floor; // current floor row
  let group = 1;
  let n = 0; // piece counter, for flag names
  let seconds = 0; // rough play time
  const ops = []; // drawing operations, recorded with their coordinates at call time
  const G = {
    box: (...a) => (ops.push(['box', a]), G),
    put: (...a) => (ops.push(['put', a]), G),
  };
  const objects = [];
  const steps = { fb: [], wg: [] };
  const usesPiggyback = { value: false };

  const draw = (fn) => fn(G);
  const ground = (x0, x1, top = f) => draw((g) => g.box(x0, top, x1, H - 2));
  const flag = (name) => `${n}:${name}`;
  const add = (id, ...list) => steps[id].push(...list);
  const need = (cond, msg) => {
    if (!cond) throw new Error(`track piece ${n} at column ${x}: ${msg}`);
  };
  const dia = (c, r, kind) => draw((g) => g.put(c, r, kind));

  const api = {
    /** Stan and Lisa on a short flat start. */
    start() {
      ground(x, x + 6);
      draw((g) => g.put(x + 1, f - 1, 'S').put(x + 3, f - 1, 'W'));
      x += 7;
      return api;
    },

    /** The doors on a short flat end, then the right wall. */
    doors() {
      ground(x, x + 8);
      draw((g) => g.put(x + 2, f - 1, 'A').put(x + 5, f - 1, 'B'));
      add('fb', { go: x + 3 });
      add('wg', { go: x + 6 });
      x += 9;
      return api;
    },

    /** Flat ground, with diamonds over it. */
    flat(w = 6) {
      ground(x, x + w - 1);
      dia(x + Math.floor(w / 2) - 1, f - 3, 'r');
      dia(x + Math.floor(w / 2) + 1, f - 3, 'b');
      x += w;
      seconds += 2;
      return api;
    },

    /** Up `d` tiles on slopes. */
    climb(d = 2) {
      for (let i = 0; i < d; i++) {
        const c = x + i;
        draw((g) => g.box(c, f - i, c, H - 2).put(c, f - 1 - i, '/'));
      }
      x += d;
      f -= d;
      ground(x, x + 1);
      x += 2;
      seconds += 2;
      return api;
    },

    /** Down `d` tiles on slopes. */
    descend(d = 2) {
      ground(x, x + 1);
      x += 2;
      for (let i = 0; i < d; i++) {
        const c = x + i;
        draw((g) => g.box(c, f + i + 1, c, H - 2).put(c, f + i, '\\'));
      }
      x += d;
      f += d;
      seconds += 2;
      return api;
    },

    /** A small hill. */
    hill() {
      ground(x, x + 7);
      draw((g) => g.put(x + 1, f - 1, '/').box(x + 2, f - 1, x + 4, f - 1).put(x + 5, f - 1, '\\'));
      dia(x + 3, f - 4, n % 2 ? 'r' : 'b');
      x += 8;
      seconds += 3;
      return api;
    },

    /** A patch of ice. */
    ice(w = 8) {
      ground(x, x + w - 1);
      draw((g) => g.box(x + 1, f, x + w - 2, f, 'i'));
      x += w;
      seconds += 3;
      return api;
    },

    /** One holds a button, the other passes the gate and pulls the lever that keeps it open. */
    gate(holder = 'fb') {
      n++;
      const passer = other(holder);
      const grp = group++;
      need(f >= 6, 'no room above the gate');
      ground(x, x + 10);
      draw((g) => g.box(x + 4, 1, x + 4, f - 4));
      objects.push(
        { kind: 'pusher', cell: [x + 1, f - 1], group: grp },
        { kind: 'platform', rect: [x + 4, f - 3, 1, 3], dx: 0, dy: -3, group: grp },
        { kind: 'lever', cell: [x + 8, f - 1], group: grp },
      );
      dia(x + 6, f - 3, passer === 'fb' ? 'r' : 'b');
      add(holder, { go: x + 2 }, { set: flag('held') }, { wait: flag('locked') }, { idle: 0.5 }, { go: x + 9.5 });
      add(passer, { wait: flag('held') }, { idle: 1.7 }, { go: x + 9.5 }, { set: flag('locked') }, { go: x + 10.4 });
      x += 11;
      seconds += 10;
      return api;
    },

    /** A pool only `wader` can wade; on the far side a button raises a bridge for the other. */
    bridgePool(wader = 'wg') {
      n++;
      const crosser = other(wader);
      const grp = group++;
      need(f + 1 <= H - 2, 'the floor is too thin for a bridge');
      ground(x, x + 15);
      draw((g) => g.box(x + 2, f, x + 10, f, liquidOf(wader)));
      objects.push(
        { kind: 'pusher', cell: [x + 12, f - 1], group: grp },
        { kind: 'platform', rect: [x + 2, f + 1, 9, 1], dx: 0, dy: -1, group: grp },
      );
      dia(x + 5, f - 2, wader === 'fb' ? 'r' : 'b');
      dia(x + 8, f - 4, crosser === 'fb' ? 'r' : 'b');
      add(wader, { go: x + 13 }, { set: flag('bridge') }, { wait: flag('over') }, { go: x + 15.5 });
      add(crosser, { go: x + 0.5 }, { wait: flag('bridge') }, { idle: 1 }, { go: x + 12 }, { set: flag('over') }, { go: x + 14.4 });
      x += 16;
      seconds += 12;
      return api;
    },

    /** Goo: one holds a button, the other crosses the bridge and pushes the lever that keeps it. */
    gooBridge(holder = 'fb') {
      n++;
      const crosser = other(holder);
      const grp = group++;
      need(f + 1 <= H - 2, 'the floor is too thin for a bridge');
      ground(x, x + 19);
      draw((g) => g.box(x + 4, f, x + 13, f, 'g'));
      objects.push(
        { kind: 'pusher', cell: [x + 1, f - 1], group: grp },
        { kind: 'platform', rect: [x + 4, f + 1, 10, 1], dx: 0, dy: -1, group: grp },
        { kind: 'lever', cell: [x + 15, f - 1], group: grp },
      );
      dia(x + 7, f - 4, 'r');
      dia(x + 10, f - 4, 'b');
      add(holder, { go: x + 2 }, { set: flag('held') }, { wait: flag('locked') }, { idle: 0.4 }, { go: x + 17.5 });
      add(crosser, { wait: flag('held') }, { idle: 1 }, { go: x + 16.6 }, { set: flag('locked') }, { go: x + 18.6 });
      x += 20;
      seconds += 14;
      return api;
    },

    /** Three pillars over a pit of spikes, with a flag on each side. Stan goes first. */
    pillars() {
      n++;
      need(f + 4 <= H - 2, 'the floor is too thin for a pit');
      ground(x, x + 16);
      draw((g) =>
        g
          .box(x + 2, f, x + 13, f + 3, '.')
          .box(x + 2, f + 3, x + 13, f + 3, '^')
          .box(x + 4, f, x + 6, f + 3)
          .box(x + 9, f - 1, x + 11, f + 3)
          .put(x, f - 1, 'k')
          .put(x + 15, f - 1, 'k'),
      );
      dia(x + 7, f - 4, 'r');
      dia(x + 12, f - 5, 'b');
      const hop = [
        { go: x + 1 },
        { jump: 'right', to: x + 4.6 },
        { go: x + 5.5 },
        { jump: 'right', to: x + 9.6 },
        { go: x + 10.5 },
        { jump: 'right', to: x + 14.6 },
      ];
      add('fb', ...hop, { go: x + 15.5 }, { set: flag('across') });
      add('wg', { wait: flag('across') }, ...hop, { go: x + 16.4 });
      x += 17;
      seconds += 12;
      return api;
    },

    /** A small lava pool (Lisa jumps it) and a small water pool (Stan jumps it). */
    smallPools() {
      n++;
      ground(x, x + 13);
      draw((g) => g.box(x + 3, f, x + 5, f, 'l').box(x + 9, f, x + 11, f, 'w'));
      dia(x + 4, f - 3, 'b');
      dia(x + 10, f - 3, 'r');
      add('wg', { go: x + 1 }, { jump: 'right', to: x + 6.6 }, { go: x + 12.5 }, { set: flag('done') });
      add('fb', { wait: flag('done') }, { go: x + 7.5 }, { jump: 'right', to: x + 12.6 }, { go: x + 13.2 });
      x += 14;
      seconds += 8;
      return api;
    },

    /** A ledge five tiles high: Lisa jumps from Stan's head and pushes a lever that lowers a ladder. */
    ledge() {
      n++;
      usesPiggyback.value = true;
      const grp = group++;
      const top = f - 5;
      need(top >= 4, 'no room above the ledge');
      ground(x, x + 3);
      ground(x + 4, x + 13, top);
      draw((g) => g.box(x + 3, top, x + 3, f - 1, '.'));
      objects.push(
        { kind: 'ladder', rect: [x + 3, top, 1, 5], group: grp },
        { kind: 'lever', cell: [x + 6, top - 1], group: grp },
      );
      dia(x + 9, top - 3, 'v');
      add('fb', { go: x + 2.4 }, { set: flag('base') }, { wait: flag('ladder') }, { idle: 1 }, { go: x + 3.5 },
        { climb: 'up', untilAbove: top - 1.1 }, { go: x + 5 }, { go: x + 11 });
      add('wg', { wait: flag('base') }, { go: x + 2.4 }, { jump: 'up' }, { jump: 'right', to: x + 4.6 },
        { go: x + 7.5 }, { set: flag('ladder') }, { go: x + 12 });
      x += 14;
      f = top;
      seconds += 15;
      return api;
    },

    /** A cliff seven tiles high: Lisa rides the lift while Stan holds its button, then lowers a ladder. */
    lift() {
      n++;
      const gLift = group++;
      const gLadder = group++;
      const top = f - 7;
      need(top >= 4, 'no room above the cliff');
      ground(x, x + 9);
      ground(x + 10, x + 17, top);
      objects.push(
        { kind: 'pusher', cell: [x + 1, f - 1], group: gLift },
        { kind: 'platform', rect: [x + 6, f - 1, 3, 1], dx: 0, dy: -6, group: gLift },
        { kind: 'ladder', rect: [x + 9, top, 1, 7], group: gLadder },
        { kind: 'lever', cell: [x + 12, top - 1], group: gLadder },
      );
      dia(x + 7, f - 9, 'b');
      dia(x + 15, top - 3, 'r');
      add('wg', { go: x + 3.5 }, { set: flag('ready') }, { jump: 'right', to: x + 6.6 }, { go: x + 7.5 }, { set: flag('onLift') },
        { wait: flag('up') }, { idle: 3.6 }, { jump: 'right', to: x + 10.8 }, { go: x + 11.2 }, { set: flag('off') },
        { go: x + 13.5 }, { set: flag('ladder') }, { go: x + 16.4 });
      add('fb', { wait: flag('ready') }, { go: x + 0.5 }, { wait: flag('onLift') }, { go: x + 2 }, { set: flag('up') },
        { wait: flag('off') }, { wait: flag('ladder') }, { idle: 1 }, { go: x + 9.5 },
        { climb: 'up', untilAbove: top - 1.1 }, { go: x + 11.5 }, { go: x + 15 });
      x += 18;
      f = top;
      seconds += 20;
      return api;
    },

    /** A bank seven tiles high: Stan pushes the box against it and stands on it; Lisa jumps from his head. */
    boxBank() {
      n++;
      usesPiggyback.value = true;
      const grp = group++;
      const top = f - 7;
      need(top >= 4, 'no room above the bank');
      ground(x, x + 9);
      ground(x + 10, x + 17, top);
      objects.push(
        { kind: 'box', cell: [x + 3, f - 1] },
        { kind: 'ladder', rect: [x + 9, top, 1, 7], group: grp },
        { kind: 'lever', cell: [x + 13, top - 1], group: grp },
      );
      dia(x + 5, f - 5, 'b');
      dia(x + 15, top - 4, 'v');
      add('fb', { go: x + 1.5 }, { set: flag('atBox') }, { go: x + 7.4, tol: 0.7, max: 15 }, { jump: 'right', to: x + 8.6 },
        { go: x + 9 }, { set: flag('base') }, { wait: flag('ladder') }, { idle: 1 },
        { climb: 'up', untilAbove: top - 1.1 }, { go: x + 11 }, { go: x + 15.5 });
      add('wg', { wait: flag('base') }, { go: x + 6.8 }, { jump: 'right', to: x + 8.4 }, { jump: 'right', to: x + 10.6 },
        { go: x + 14.5 }, { set: flag('ladder') }, { go: x + 16.5 });
      x += 18;
      f = top;
      seconds += 20;
      return api;
    },

    /** A long pool the rider can't wade: the partner holds a button and a raft carries the rider over; then the partner wades. */
    raft(rider = 'fb') {
      n++;
      const holder = other(rider);
      const grp = group++;
      ground(x, x + 25);
      draw((g) => g.box(x + 5, f, x + 22, f, liquidOf(holder)));
      objects.push(
        { kind: 'pusher', cell: [x + 1, f - 1], group: grp },
        { kind: 'platform', rect: [x + 5, f, 4, 1], dx: 14, dy: 0, group: grp },
      );
      for (const c of [x + 9, x + 13, x + 17]) dia(c, f - 2, rider === 'fb' ? 'r' : 'b');
      add(rider, { go: x + 7 }, { set: flag('on') }, { wait: flag('going') }, { idle: 7.5 }, { go: x + 24.5 }, { set: flag('across') });
      add(holder, { go: x + 0.5 }, { wait: flag('on') }, { go: x + 2 }, { set: flag('going') }, { wait: flag('across') }, { go: x + 23.5 });
      x += 26;
      seconds += 18;
      return api;
    },

    /**
     * Goo with a raft that moves while the near button is held or while the lever past
     * the far bank is on: Lisa sends Stan over, the raft comes back, Stan calls it for her.
     */
    swampRaft() {
      n++;
      const grp = group++;
      ground(x, x + 30);
      draw((g) => g.box(x + 6, f, x + 19, f, 'g'));
      objects.push(
        { kind: 'pusher', cell: [x + 2, f - 1], group: grp },
        { kind: 'platform', rect: [x + 6, f, 4, 1], dx: 10, dy: 0, group: grp },
        { kind: 'lever', cell: [x + 28, f - 1], group: grp },
      );
      dia(x + 10, f - 4, 'r');
      dia(x + 14, f - 4, 'b');
      dia(x + 12, f - 7, 'v');
      add('fb', { go: x + 7.5 }, { set: flag('onRaft') }, { wait: flag('going') }, { idle: 5.5 }, { go: x + 26.4 },
        { set: flag('across') }, { wait: flag('lisaOn') }, { go: x + 30, tol: 0.6 }, { set: flag('coming') }, { wait: flag('lisaAcross') });
      add('wg', { wait: flag('onRaft') }, { go: x + 0.5 }, { go: x + 3 }, { set: flag('going') }, { wait: flag('across') },
        { go: x + 0.5 }, { idle: 5.5 }, { go: x + 7.5 }, { set: flag('lisaOn') }, { wait: flag('coming') }, { idle: 5.5 },
        { go: x + 21 }, { set: flag('lisaAcross') }, { go: x + 27.5 });
      x += 31;
      seconds += 30;
      return api;
    },

    /** A pool the runner can't wade: the partner wades over and presses a timed button; six seconds to cross. */
    timedCover(runner = 'fb') {
      n++;
      const presser = other(runner);
      const grp = group++;
      need(f + 1 <= H - 2, 'the floor is too thin for a cover');
      ground(x, x + 19);
      draw((g) => g.box(x + 2, f, x + 13, f, liquidOf(presser)));
      objects.push(
        { kind: 'timedPusher', cell: [x + 15, f - 1], group: grp, time: 6000 },
        { kind: 'platform', rect: [x + 2, f + 1, 12, 1], dx: 0, dy: -1, group: grp },
      );
      dia(x + 7, f - 3, runner === 'fb' ? 'r' : 'b');
      // the presser waits by the button until the runner is at the edge: six seconds is not long
      add(runner, { go: x + 0.5 }, { set: flag('ready') }, { wait: flag('pressed') }, { idle: 0.8 }, { go: x + 15 }, { set: flag('across') });
      add(presser, { go: x + 14 }, { wait: flag('ready') }, { go: x + 16 }, { set: flag('pressed') }, { go: x + 18.5 }, { wait: flag('across') });
      x += 20;
      seconds += 12;
      return api;
    },

    /** Monsters afraid of light: Stan holds the button that lights the torches, Lisa runs to the lever that keeps them lit. */
    monsters() {
      n++;
      const grp = group++;
      ground(x, x + 23);
      objects.push(
        { kind: 'pusher', cell: [x + 1, f - 1], group: grp },
        { kind: 'torch', cell: [x + 8, f - 4], group: grp, radius: 220 },
        { kind: 'torch', cell: [x + 16, f - 4], group: grp, radius: 220 },
        { kind: 'monster', path: [[x + 5, f], [x + 11, f]], group: grp, speed: 3 },
        { kind: 'monster', path: [[x + 14, f], [x + 18, f]], group: grp, speed: 2, phase: 1 },
        { kind: 'lever', cell: [x + 20, f - 1], group: grp },
      );
      dia(x + 9, f - 3, 'b');
      dia(x + 15, f - 3, 'r');
      add('fb', { go: x + 2 }, { set: flag('light') }, { wait: flag('locked') }, { idle: 0.8 }, { go: x + 22 });
      add('wg', { wait: flag('light') }, { idle: 1 }, { go: x + 22.4 }, { set: flag('locked') }, { go: x + 23.2 });
      x += 24;
      seconds += 14;
      return api;
    },

    /** The finished level for a levels-src file. */
    level({ file, title, properties = {}, time, mobileTime }) {
      const width = x + 1;
      const g = grid(width, H).border();
      for (const [op, a] of ops) g[op](...a);
      const t = time || Math.round((seconds * 1.6 + 20) / 10) * 10;
      return {
        file,
        title,
        time: t,
        mobileTime: mobileTime || Math.round((t * 1.25) / 10) * 10,
        properties: { ...(usesPiggyback.value ? { piggyback: true } : {}), ...properties },
        map: g.rows(),
        objects,
        walkthrough: steps,
      };
    },

    get floor() {
      return f;
    },
    get column() {
      return x;
    },
  };
  return api;
}
