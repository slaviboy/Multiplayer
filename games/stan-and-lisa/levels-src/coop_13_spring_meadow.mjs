// Spring Meadow (spring): the first outdoor level, three small teamwork steps.
// 1. A gate blocks the meadow. Stan holds button 1, the gate rises, Lisa runs
//    through and pushes lever 2, which keeps it open for Stan.
// 2. A long pond: Lisa wades through and stands on button 3 on the far bank,
//    which raises a bridge out of the water for Stan.
// 3. The doors are on a bank five tiles high. Stan stands by it, Lisa jumps
//    from his head onto it (piggyback) and pushes lever 4, which lowers a ladder
//    for Stan.
import { grid } from './_grid.mjs';

const g = grid(56, 21).border();
g.box(1, 18, 54, 19); // the meadow
g.put(9, 17, '/').box(10, 17, 12, 17).put(13, 17, '\\'); // a little hill
g.box(19, 1, 19, 14).box(19, 15, 19, 17, 'G'); // the gate, rising into the hedge
g.put(16, 17, '1').put(23, 17, '2');
g.box(27, 18, 35, 18, 'w').put(37, 17, '3'); // the pond and its button
g.box(46, 13, 54, 17).box(45, 13, 45, 17, 'L'); // the high bank and its ladder
g.put(48, 12, '4').put(51, 12, 'A').put(53, 12, 'B');
g.put(2, 17, 'S').put(5, 17, 'W');
// diamonds
g.put(11, 14, 'r').put(14, 15, 'b').put(30, 16, 'b').put(33, 16, 'r').put(41, 15, 'r').put(42, 15, 'b').put(49, 9, 'v');

export default {
  file: 'coop_13_spring_meadow.json',
  title: 'Spring Meadow',
  time: 90,
  mobileTime: 110,
  properties: { environment: 'spring', piggyback: true },
  map: g.rows(),
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'lever', at: '2', group: 1 },
    { kind: 'platform', at: 'G', dx: 0, dy: -3, group: 1 },
    { kind: 'pusher', at: '3', group: 3 },
    { kind: 'platform', rect: [27, 19, 9, 1], dx: 0, dy: -1, group: 3 },
    { kind: 'lever', at: '4', group: 4 },
    { kind: 'ladder', at: 'L', group: 4 },
  ],
  walkthrough: {
    fb: [
      { go: 17 },
      { set: 'gateOpen' },
      { wait: 'leverDone' },
      { idle: 0.5 },
      { go: 25.5 },
      { wait: 'bridgeUp' },
      { idle: 1 },
      { go: 37.5 },
      { go: 44.4 },
      { set: 'base' },
      { wait: 'ladderDown' },
      { idle: 1 },
      { go: 45.5 },
      { climb: 'up', untilAbove: 11.9 },
      { go: 47 },
      { go: 52 },
    ],
    wg: [
      { wait: 'gateOpen' },
      { idle: 1.6 },
      { go: 24.5 },
      { set: 'leverDone' },
      { go: 38 },
      { set: 'bridgeUp' },
      { wait: 'base' },
      { go: 44.4 },
      { jump: 'up' },
      { jump: 'right', to: 46.6 },
      { go: 49.5 },
      { set: 'ladderDown' },
      { go: 54 },
    ],
  },
};
