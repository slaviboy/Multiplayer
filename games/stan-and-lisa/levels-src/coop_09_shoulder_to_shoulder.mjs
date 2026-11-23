// Shoulder to Shoulder: piggyback, a ladder, thorns and two bridges.
// 1. The first ledge is 5 tiles high, too high for either of them. Stan stands
//    by the wall, Lisa jumps onto his head and from there onto the ledge
//    (piggyback). She pushes lever 1, which lowers a ladder for Stan.
// 2. Hop across three pillars over a pit of thorns. Whoever falls goes back to
//    the flag on the ledge; the other waits.
// 3. Stan walks over the lava and stands on button 3, which raises a bridge so
//    Lisa can cross; Lisa walks through the water and stands on button 4, which
//    raises a bridge so Stan can cross. Then both go to their doors.
import { grid } from './_grid.mjs';

const g = grid(64, 20).border();
g.box(12, 14, 17, 18); // the high ledge
g.box(11, 14, 11, 18, 'L'); // ladder, rolled up until lever 1
g.put(15, 13, '1').put(12, 13, 'k'); // lever away from where the jumper lands
g.box(18, 18, 34, 18, '^'); // thorns at the bottom of the pit
g.box(20, 13, 22, 18).box(25, 12, 27, 18).box(30, 13, 32, 18); // pillars
g.box(35, 14, 62, 18); // the rest of the level at ledge height
g.put(37, 13, 'k');
g.box(42, 14, 45, 14, 'l').put(46, 13, '3'); // lava, button for Lisa's bridge
g.box(50, 14, 53, 14, 'w').put(54, 13, '4'); // water, button for Stan's bridge
g.put(58, 13, 'A').put(60, 13, 'B');
g.put(2, 18, 'S').put(5, 18, 'W');
// diamonds
g.put(4, 15, 'r').put(8, 15, 'b').put(14, 9, 'v');
g.put(21, 12, 'r').put(26, 11, 'b').put(31, 12, 'r');
g.put(43, 13, 'r').put(51, 13, 'b').put(39, 11, 'b');

export default {
  file: 'coop_09_shoulder_to_shoulder.json',
  title: 'Shoulder to Shoulder',
  time: 120,
  mobileTime: 150,
  properties: { piggyback: true },
  map: g.rows(),
  objects: [
    { kind: 'lever', at: '1', group: 1 },
    { kind: 'ladder', at: 'L', group: 1 },
    { kind: 'pusher', at: '3', group: 3 },
    { kind: 'platform', rect: [42, 15, 4, 1], dx: 0, dy: -1, group: 3 },
    { kind: 'pusher', at: '4', group: 4 },
    { kind: 'platform', rect: [50, 15, 4, 1], dx: 0, dy: -1, group: 4 },
  ],
  walkthrough: {
    fb: [
      { go: 10.4 },
      { set: 'base' },
      { wait: 'ladderDown' },
      { idle: 1 },
      { go: 11.5 },
      { climb: 'up', untilAbove: 12.9 },
      { go: 13 },
      { go: 17 },
      { jump: 'right', to: 20.6 },
      { go: 21.5 },
      { jump: 'right', to: 25.6 },
      { go: 26.5 },
      { jump: 'right', to: 30.6 },
      { go: 31.5 },
      { jump: 'right', to: 35.6 },
      { go: 39 },
      { go: 47 },
      { set: 'lavaBridge' },
      { wait: 'waterBridge' },
      { idle: 1 },
      { go: 59 },
      { set: 'stanHome' },
    ],
    wg: [
      { wait: 'base' },
      { go: 10.4 },
      { jump: 'up' },
      { jump: 'right', to: 12.6 },
      { go: 17.4 },
      { set: 'ladderDown' },
      { go: 17 },
      { jump: 'right', to: 20.6 },
      { go: 21.5 },
      { jump: 'right', to: 25.6 },
      { go: 26.5 },
      { jump: 'right', to: 30.6 },
      { go: 31.5 },
      { jump: 'right', to: 35.6 },
      { go: 40.8 },
      { wait: 'lavaBridge' },
      { idle: 1 },
      { go: 52 },
      { go: 55 },
      { set: 'waterBridge' },
      { wait: 'stanHome' },
      { go: 61 },
    ],
  },
};
