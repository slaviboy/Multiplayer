// Solution: the doors are in the upper room, which can only be reached through
// the portal in the left wall of the lower room. The portal works while the
// button is held, so one player holds it while the other goes through, then
// pulls the lever upstairs, which keeps the portal on for the second player.
// Stan has to jump the water and Lisa the lava on the way to the portal; the
// goo upstairs is deadly for both.
export default {
  file: 'coop_06_switchback.json',
  title: 'Switchback',
  time: 80,
  mobileTime: 100,
  map: [
    '########################################',
    '########################################',
    '########################################',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '|......................................#',
    '|.................r......b.............#',
    '|.......2.......................A..B...#',
    '################ggggg###################',
    '########################################',
    '########################################',
    '########################################',
    '########################################',
    '########################################',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '|......................................#',
    '|..........r...b.......................#',
    '|.....1...........S.....W.....r...b....#',
    '##########www#lll#######################',
    '########################################',
  ],
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'lever', at: '2', group: 1 },
    // portals sit in the '|' back wall, 3 tiles tall, paired by portalId
    { kind: 'portal', pos: [0, 23], portalId: 1, group: 1 },
    { kind: 'portal', pos: [0, 9], portalId: 1, group: 1 },
  ],
  walkthrough: {
    fb: [
      { go: 13.5 },
      { jump: 'left', to: 9.4 },
      { go: 7 },
      { set: 'held' },
      { wait: 'leverOn' },
      { idle: 0.5 },
      { walk: 'left', untilAbove: 9.5 },
      { go: 14.5 },
      { jump: 'right', to: 21.5 },
      { go: 33 },
    ],
    wg: [
      { go: 17.5 },
      { jump: 'left', to: 12.6 },
      { go: 9 },
      { wait: 'held' },
      { idle: 1 },
      { walk: 'left', untilAbove: 9.5 },
      { go: 11 },
      { set: 'leverOn' },
      { go: 14.5 },
      { jump: 'right', to: 21.5 },
      { go: 36 },
    ],
  },
};
