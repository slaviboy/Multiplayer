// Rainy Rooftops (rain): Stan on the roofs, Lisa in the street below.
// 1. A gutter full of rain water blocks Stan. Lisa stands on button 1 below it,
//    which raises a cover over the gutter.
// 2. A gate blocks the street. Stan stands on button 2 on the roof, which opens
//    it for Lisa.
// 3. A wider gutter: Lisa jumps the lava and steps on timed button 3, which
//    covers the gutter for six seconds; Stan has to be across by then.
// 4. Lisa climbs the ladder at the end of the street up to the doors.
import { grid } from './_grid.mjs';

const g = grid(64, 24).border();
g.box(1, 10, 62, 11); // the roofs
g.box(1, 21, 62, 22); // the street
g.box(12, 10, 19, 10, 'w'); // gutter 1 and its button below
g.put(15, 20, '1');
g.box(26, 12, 26, 16).box(26, 17, 26, 20, 'G').put(30, 9, '2'); // the gate and its button above
g.box(33, 21, 35, 21, 'l'); // lava in the street
g.box(36, 10, 47, 10, 'w').put(40, 20, '3'); // gutter 3 and its timed button
g.box(61, 10, 61, 20, 'L'); // the ladder up to the roof (always down)
g.put(55, 9, 'A').put(58, 9, 'B');
g.put(2, 9, 'S').put(2, 20, 'W');
// diamonds
g.put(15, 7, 'r').put(22, 17, 'b').put(30, 17, 'b').put(34, 18, 'b').put(39, 6, 'r').put(43, 6, 'r');
g.put(52, 18, 'b').put(52, 7, 'r').put(8, 16, 'v');

export default {
  file: 'coop_16_rainy_rooftops.json',
  title: 'Rainy Rooftops',
  time: 100,
  mobileTime: 120,
  properties: { environment: 'rain' },
  map: g.rows(),
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'platform', rect: [12, 11, 8, 1], dx: 0, dy: -1, group: 1 },
    { kind: 'pusher', at: '2', group: 2 },
    { kind: 'platform', at: 'G', dx: 0, dy: -4, group: 2 },
    { kind: 'timedPusher', at: '3', group: 3, time: 6000 },
    { kind: 'ladder', at: 'L' },
    { kind: 'platform', rect: [36, 11, 12, 1], dx: 0, dy: -1, group: 3 },
  ],
  walkthrough: {
    fb: [
      { go: 10 },
      { wait: 'bridge1' },
      { idle: 1 },
      { go: 21 },
      { set: 'stanAcross1' },
      { go: 31 },
      { set: 'gateOpen' },
      { wait: 'lisaThrough' },
      { go: 35 },
      { wait: 'stones' },
      { idle: 0.8 },
      { go: 49 },
      { set: 'stanAcross3' },
      { go: 56 },
    ],
    wg: [
      { go: 16 },
      { set: 'bridge1' },
      { wait: 'stanAcross1' },
      { go: 24 },
      { wait: 'gateOpen' },
      { idle: 2.2 },
      { go: 29 },
      { set: 'lisaThrough' },
      { go: 31.5 },
      { jump: 'right', to: 36.6 },
      { go: 41 },
      { set: 'stones' },
      { go: 44 }, // off the timed button: it stays down for six seconds
      { wait: 'stanAcross3' },
      { go: 61.5 },
      { climb: 'up', untilAbove: 8.9 },
      { go: 59 },
    ],
  },
};
