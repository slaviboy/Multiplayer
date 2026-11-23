// Into the Dark: the whole temple is black; each of them carries a small circle
// of light. Three floors joined in a zig-zag.
// Bottom floor (left to right): fireflies lead to button 1. One holds it (the
//   gate opens and a torch lights up) while the other walks through and holds
//   button 8 behind the gate, so the first can follow. Hop the pillars over the
//   thorns (fall and you restart at the flag) and climb the ladder.
// Middle floor (right to left): a pit of goo too wide to jump. One holds
//   button 2, which raises a bridge, lights two torches and wakes fireflies; the
//   other crosses and pushes the far lever to keep the bridge up.
//   Then the lift at the far left: one rides it while the other holds button 3;
//   the one at the top pulls lever 6 to send it up again for the second.
// Top floor (left to right, low ceiling): Stan walks over the lava to button 4,
//   which bridges the lava for Lisa; Lisa walks through the water to button 5,
//   which bridges the water for Stan. The doors are lit by a torch.
import { grid } from './_grid.mjs';

const g = grid(60, 25).border();
// top floor: low ceiling (rows 1-3), floor rows 7-8 with a hole for the lift
g.box(1, 1, 58, 3).box(1, 7, 58, 8).box(1, 7, 3, 8, '.');
g.box(18, 7, 25, 7, 'l').box(30, 7, 37, 7, 'w');
g.put(9, 6, '6').put(27, 6, '4').put(39, 6, '5').put(50, 6, 'A').put(53, 6, 'B');
g.put(21, 6, 'r').put(33, 6, 'b');
// middle floor: rows 15-16, goo pit, lift on the left
g.box(1, 15, 58, 16).box(38, 15, 49, 15, 'g');
g.box(1, 14, 3, 14, 'E').put(8, 14, '3').put(34, 14, 'm').put(51, 14, '2');
g.put(20, 13, 'b').put(30, 13, 'r').put(44, 11, 'v');
// ladder from the bottom floor to the middle floor
g.box(57, 15, 57, 23, 'L');
// bottom floor: wall with a gate, then the thorn pit with pillars
g.box(16, 17, 16, 19).box(16, 20, 16, 23, 'G');
g.box(24, 23, 40, 23, '^').box(26, 22, 28, 23).box(31, 21, 33, 23).box(36, 22, 38, 23); // low pillars: the floor above is a low ceiling
g.put(2, 23, 'S').put(5, 23, 'W').put(9, 23, '1').put(19, 23, '8').put(22, 23, 'k').put(44, 23, 'k');
g.put(7, 22, 'r').put(12, 22, 'b').put(27, 21, 'r').put(32, 20, 'b').put(37, 21, 'r').put(48, 22, 'b');
// lights
g.put(18, 19, 'T').put(29, 19, 't').put(35, 19, 't').put(41, 11, 'u').put(46, 11, 'u').put(48, 5, 'x');

export default {
  file: 'coop_10_into_the_dark.json',
  title: 'Into the Dark',
  time: 200,
  mobileTime: 240,
  properties: { darkness: 'dark', lightRadius: 150 },
  map: g.rows(),
  objects: [
    // bottom
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'pusher', at: '8', group: 1 },
    { kind: 'platform', at: 'G', dx: 0, dy: -4, group: 1 },
    { kind: 'torch', at: 'T', group: 1 },
    { kind: 'torch', at: 't' },
    { kind: 'ladder', at: 'L' },
    { kind: 'fireflies', path: [[4, 21], [9, 20], [15, 21], [21, 20]], count: 6 },
    // middle
    { kind: 'pusher', at: '2', group: 2 },
    { kind: 'leverMirrored', at: 'm', group: 2 },
    { kind: 'platform', rect: [38, 16, 12, 1], dx: 0, dy: -1, group: 2 },
    { kind: 'torch', at: 'u', group: 2 },
    { kind: 'fireflies', path: [[54, 12], [48, 11], [42, 12], [36, 11], [30, 12]], count: 6, group: 2 },
    { kind: 'pusher', at: '3', group: 3 },
    { kind: 'lever', at: '6', group: 3 },
    { kind: 'platform', at: 'E', dx: 0, dy: -7, group: 3 },
    // top
    { kind: 'pusher', at: '4', group: 4 },
    { kind: 'platform', rect: [18, 8, 8, 1], dx: 0, dy: -1, group: 4 },
    { kind: 'pusher', at: '5', group: 5 },
    { kind: 'platform', rect: [30, 8, 8, 1], dx: 0, dy: -1, group: 5 },
    { kind: 'torch', at: 'x' },
    { kind: 'fireflies', path: [[40, 5], [45, 5], [50, 5]], count: 5 },
  ],
  walkthrough: {
    fb: [
      { go: 10 },
      { set: 'gate' },
      { wait: 'gateHeld' },
      { go: 23 },
      { set: 'stanThrough' },
      { jump: 'right', to: 26.6 },
      { go: 27.5 },
      { jump: 'right', to: 31.6 },
      { go: 32.5 },
      { jump: 'right', to: 36.6 },
      { go: 37.5 },
      { jump: 'right', to: 41.5 },
      { go: 57.5 },
      { climb: 'up', untilAbove: 14 },
      { go: 52 },
      { set: 'bridge' },
      { wait: 'bridgeLocked' },
      { idle: 0.6 },
      { go: 11 },
      { wait: 'onLift' },
      { go: 9 },
      { set: 'liftUp' },
      { wait: 'lisaTop' },
      { go: 6 },
      { idle: 4 },
      { go: 4.6 },
      { jump: 'left', to: 2.6 },
      { go: 2.5 },
      { set: 'stanOnLift' },
      { wait: 'raised' },
      { idle: 4.5 },
      { go: 6.5 },
      { go: 28 },
      { set: 'lavaBridge' },
      { wait: 'waterBridge' },
      { idle: 1 },
      { go: 51 },
      { set: 'stanHome' },
    ],
    wg: [
      { wait: 'gate' },
      { idle: 2.2 },
      { go: 20 },
      { set: 'gateHeld' },
      { wait: 'stanThrough' },
      { go: 23 },
      { jump: 'right', to: 26.6 },
      { go: 27.5 },
      { jump: 'right', to: 31.6 },
      { go: 32.5 },
      { jump: 'right', to: 36.6 },
      { go: 37.5 },
      { jump: 'right', to: 41.5 },
      { go: 57.5 },
      { climb: 'up', untilAbove: 14 },
      { go: 50.6 },
      { wait: 'bridge' },
      { idle: 0.8 },
      { go: 33.6 },
      { set: 'bridgeLocked' },
      { go: 4.6 },
      { jump: 'left', to: 2.6 },
      { go: 2.5 },
      { set: 'onLift' },
      { wait: 'liftUp' },
      { idle: 4.5 },
      { go: 6.3 },
      { set: 'lisaTop' },
      { wait: 'stanOnLift' },
      { go: 12 },
      { set: 'raised' },
      { go: 16.6 },
      { wait: 'lavaBridge' },
      { idle: 1 },
      { go: 40 },
      { set: 'waterBridge' },
      { wait: 'stanHome' },
      { go: 54 },
    ],
  },
};
