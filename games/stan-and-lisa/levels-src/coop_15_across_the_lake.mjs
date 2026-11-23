// Across the Lake (lake): two rafts.
// 1. The lake is far too wide to jump. Lisa can wade through it, Stan can't: he
//    steps onto the raft and Lisa holds button 1 on the shore, which carries
//    him across. Then Lisa wades over.
// 2. The swamp beyond is goo, deadly for both. Its raft moves while button 2 on
//    the near bank is held or while lever 3, past the doors on the far bank, is
//    on. Lisa holds button 2 and sends Stan over; she lets go, the raft comes
//    back for her, and Stan pushes the lever, which brings her over.
import { grid } from './_grid.mjs';

const g = grid(64, 22).border();
g.box(1, 19, 62, 20); // the shores and lake bed
g.box(13, 19, 30, 19, 'w'); // the lake
g.box(38, 19, 51, 19, 'g'); // the swamp
g.put(9, 18, '1').put(34, 18, '2').put(60, 18, '3');
g.put(54, 18, 'A').put(56, 18, 'B');
g.put(2, 18, 'S').put(5, 18, 'W');
// diamonds
g.put(18, 17, 'b').put(22, 17, 'b').put(26, 17, 'b').put(20, 14, 'r').put(24, 14, 'r');
g.put(42, 15, 'r').put(46, 15, 'b').put(44, 12, 'v').put(32, 16, 'r');

export default {
  file: 'coop_15_across_the_lake.json',
  title: 'Across the Lake',
  time: 110,
  mobileTime: 130,
  properties: { environment: 'lake' },
  map: g.rows(),
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'platform', rect: [13, 19, 4, 1], dx: 14, dy: 0, group: 1 }, // the raft
    { kind: 'pusher', at: '2', group: 2 },
    { kind: 'lever', at: '3', group: 2 },
    { kind: 'platform', rect: [38, 19, 4, 1], dx: 10, dy: 0, group: 2 }, // the swamp raft
  ],
  walkthrough: {
    fb: [
      { go: 15 },
      { set: 'onRaft1' },
      { wait: 'raft1Going' },
      { idle: 7.5 },
      { go: 32.5 },
      { go: 39.5 },
      { set: 'onRaft2' },
      { wait: 'raft2Going' },
      { idle: 5.5 },
      { go: 58.4 },
      { set: 'stanAcross' },
      { wait: 'lisaOnRaft' },
      { go: 61.5 },
      { set: 'raftComing' },
      { wait: 'lisaAcross' },
      { go: 55 },
    ],
    wg: [
      { wait: 'onRaft1' },
      { go: 10 },
      { set: 'raft1Going' },
      { wait: 'onRaft2' },
      { go: 32.5 },
      { go: 35 },
      { set: 'raft2Going' },
      { wait: 'stanAcross' },
      { go: 32.5 }, // off the button: the raft comes back
      { idle: 5.5 },
      { go: 39.5 },
      { set: 'lisaOnRaft' },
      { wait: 'raftComing' },
      { idle: 5.5 },
      { go: 53 },
      { set: 'lisaAcross' },
      { go: 57 },
    ],
  },
};
