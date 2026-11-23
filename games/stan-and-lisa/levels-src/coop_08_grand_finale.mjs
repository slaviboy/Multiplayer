// Solution:
// 1. One player holds button 1, which raises a bridge over the goo. The other
//    crosses and pulls lever 6 on the far side, which keeps the bridge up.
// 2. Push the box against the ledge, climb it, and pull lever 2. That opens the
//    gate at the top of the wall; drop down into the last room.
// 3. The lift to the doors listens to two levers, one at the bottom (3) and one
//    at the top (5). One player stands on the lift while the other pulls lever 3.
//    The player at the top pulls lever 5 to send it back for the second player.
//    The silver diamond floats above the top of the lift.
export default {
  file: 'coop_08_grand_finale.json',
  title: 'Grand Finale',
  time: 150,
  mobileTime: 180,
  map: [
    '########################################',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..........#.......v.#',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..........#A.B.5....#',
    '###################..........#######...#',
    '###################..........#######...#',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..........#.........#',
    '###################..r.b.....G.........#',
    '###################..........G.........#',
    '###################.......2..G.........#',
    '###################......#####.........#',
    '###################......#####.........#',
    '#........................#####.........#',
    '#........................#####..b.r....#',
    '#S.W.1...r.b...6...X.....#####3.....EEE#',
    '########ggggggg#################llww####',
    '########################################',
  ],
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'lever', at: '6', group: 1 },
    { kind: 'platform', rect: [8, 24, 7, 1], dx: 0, dy: -1, group: 1 },
    { kind: 'box', at: 'X' },
    { kind: 'lever', at: '2', group: 2 },
    { kind: 'platform', at: 'G', dx: 0, dy: -3, group: 2 },
    { kind: 'lever', at: '3', group: 3 },
    { kind: 'lever', at: '5', group: 3 },
    { kind: 'platform', at: 'E', dx: 0, dy: -12, group: 3 },
  ],
};
