// Sun-Baked Dunes (summer): hot sand and a cliff.
// 1. A long pit of lava: Stan walks across it and stands on button 1, which
//    raises a bridge out of the lava for Lisa.
// 2. The doors are on a cliff seven tiles high, too high even from Stan's head.
//    Lisa steps onto the lift and Stan holds button 2, which raises it.
// 3. On the cliff Lisa pushes lever 3, which lowers a ladder for Stan.
// 4. Up there, a small lava pool (Lisa jumps it) and a small water pool (Stan
//    jumps it) before the doors.
import { grid } from './_grid.mjs';

const g = grid(60, 22).border();
g.box(1, 19, 58, 20); // the sand
g.put(5, 18, '/').box(6, 18, 7, 18).put(8, 18, '\\'); // a dune
g.box(10, 19, 19, 19, 'l').put(22, 18, '1'); // the lava pit and its button
g.put(27, 18, '2'); // the lift's button, far from the lift
g.box(32, 18, 34, 18, 'E'); // the lift
g.box(35, 12, 35, 18, 'L'); // ladder against the cliff, rolled up until lever 3
g.box(36, 12, 58, 18); // the cliff
g.put(40, 11, '3');
g.box(44, 12, 46, 12, 'l').box(50, 12, 52, 12, 'w');
g.put(54, 11, 'A').put(56, 11, 'B');
g.put(2, 18, 'S').put(4, 18, 'W');
// diamonds
g.put(6, 15, 'b').put(13, 17, 'r').put(16, 17, 'r').put(24, 15, 'b').put(30, 14, 'v');
g.put(45, 9, 'b').put(51, 9, 'r').put(38, 9, 'r');

export default {
  file: 'coop_14_sun_baked_dunes.json',
  title: 'Sun-Baked Dunes',
  time: 90,
  mobileTime: 110,
  properties: { environment: 'summer' },
  map: g.rows(),
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'platform', rect: [10, 20, 10, 1], dx: 0, dy: -1, group: 1 },
    { kind: 'pusher', at: '2', group: 2 },
    { kind: 'platform', at: 'E', dx: 0, dy: -6, group: 2 },
    { kind: 'lever', at: '3', group: 3 },
    { kind: 'ladder', at: 'L', group: 3 },
  ],
  walkthrough: {
    fb: [
      { go: 23 },
      { set: 'bridge' },
      { wait: 'lisaAcross' },
      { wait: 'onLift' },
      { go: 28 },
      { set: 'liftUp' },
      { wait: 'lisaOff' },
      { wait: 'ladderDown' },
      { idle: 1 },
      { go: 35.5 },
      { climb: 'up', untilAbove: 10.9 },
      { go: 37.5 },
      { go: 42.5 },
      { go: 48.5 },
      { jump: 'right', to: 53.6 },
      { go: 55 },
    ],
    wg: [
      { wait: 'bridge' },
      { idle: 1 },
      { go: 29.5 },
      { set: 'lisaAcross' },
      { jump: 'right', to: 32.6 },
      { go: 33.5 },
      { set: 'onLift' },
      { wait: 'liftUp' },
      { idle: 3.6 },
      { jump: 'right', to: 36.8 }, // over the gap above the rolled-up ladder
      { go: 37.5 },
      { set: 'lisaOff' },
      { go: 41.5 },
      { set: 'ladderDown' },
      { go: 42 },
      { jump: 'right', to: 47.6 },
      { go: 57 },
    ],
  },
};
