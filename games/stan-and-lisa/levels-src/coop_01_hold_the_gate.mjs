// Solution: one player stands on the first button so the other can walk
// through the gate; that player then stands on the second button (same group)
// so the first can follow. Climb the three steps to the doors. The roof of the
// corridor hides two more diamonds.
export default {
  file: 'coop_01_hold_the_gate.json',
  title: 'Hold the Gate',
  time: 60,
  mobileTime: 75,
  map: [
    '########################################',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#.................................A.B..#',
    '#.................................######',
    '#.................................######',
    '#.................................######',
    '#..............................#########',
    '#.......r.......b..............#########',
    '########################.......#########',
    '#.............G............#############',
    '#.............G............#############',
    '#.S..W.r.1..b.G..r.2...b...#############',
    '########################################',
  ],
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'pusher', at: '2', group: 1 },
    { kind: 'platform', at: 'G', dx: 0, dy: -3, group: 1 },
  ],
};
