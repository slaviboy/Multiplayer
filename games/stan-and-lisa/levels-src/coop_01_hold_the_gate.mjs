// Hold the Gate (the first co-op level, kept easy).
// Solution: one player stands on the first button so the other can walk
// through the gate; that player then stands on the second button (same group)
// so the first can follow. Climb the three low steps to the doors. The roof of
// the corridor hides two more diamonds.
import { grid } from './_grid.mjs';

const g = grid(40, 16).border();
g.box(1, 11, 23, 11); // corridor ceiling (and a roof to explore)
g.box(14, 12, 14, 14, 'G'); // the gate
g.box(27, 13, 30, 14).box(31, 11, 33, 14).box(34, 9, 38, 14); // 2-tile steps
g.put(34, 8, 'A').put(36, 8, 'B');
g.put(2, 14, 'S').put(5, 14, 'W').put(9, 14, '1').put(19, 14, '2');
g.put(7, 14, 'r').put(12, 14, 'b').put(17, 14, 'r').put(23, 14, 'b');
g.put(8, 10, 'r').put(16, 10, 'b');

export default {
  file: 'coop_01_hold_the_gate.json',
  title: 'Hold the Gate',
  time: 60,
  mobileTime: 75,
  map: g.rows(),
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'pusher', at: '2', group: 1 },
    { kind: 'platform', at: 'G', dx: 0, dy: -3, group: 1 },
  ],
  walkthrough: {
    fb: [
      { go: 10 },
      { set: 'gateOpen' },
      { wait: 'lisaHolding' },
      { go: 24.5 },
      { set: 'stanThrough' },
      { jump: 'right', to: 28 },
      { go: 30 },
      { jump: 'right', to: 32 },
      { go: 33 },
      { jump: 'right', to: 35 },
      { go: 35 },
    ],
    wg: [
      { wait: 'gateOpen' },
      { idle: 1.5 },
      { go: 20 },
      { set: 'lisaHolding' },
      { wait: 'stanThrough' },
      { go: 25 },
      { jump: 'right', to: 28 },
      { go: 30 },
      { jump: 'right', to: 32 },
      { go: 33 },
      { jump: 'right', to: 36.5 },
      { go: 37 },
    ],
  },
};
