// Solution: one player waits next to the gate while the other presses the
// timed button far to the left; the gate stays open for 2.5 seconds, too short
// for the presser to make it. The runner pulls the lever behind the gate, which
// keeps it open for good. Mind the pools on the way: Stan must jump the water,
// Lisa the lava. Two ledges above the start hold extra diamonds.
export default {
  file: 'coop_05_race_the_clock.json',
  title: 'Race the Clock',
  time: 75,
  mobileTime: 95,
  map: [
    '########################################',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#............................##........#',
    '#................b...........##........#',
    '#..............#####.........##........#',
    '#............................##........#',
    '#......r.....................##........#',
    '#....#####...................G.........#',
    '#............r.......b.......G.........#',
    '#.1.S..W.....................G..2.A.B..#',
    '############www#####lll#################',
    '########################################',
  ],
  objects: [
    { kind: 'timedPusher', at: '1', group: 1, time: 2500 },
    { kind: 'lever', at: '2', group: 1 },
    { kind: 'platform', at: 'G', dx: 0, dy: -3, group: 1 },
  ],
};
