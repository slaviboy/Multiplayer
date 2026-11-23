// Solution: Lisa holds button 1, which raises the left lift so Stan can reach
// the middle ledge. Stan holds button 2 on that ledge, which carries Lisa up the
// right shaft to the top. Lisa pulls the lever at the top, which raises the
// lift Stan is standing on (at the end of the middle ledge) to the top floor.
// Lifts move 2 tiles per second (engine constant), so the shafts are kept short.
export default {
  file: 'coop_07_three_lifts.json',
  title: 'Three Lifts',
  time: 100,
  mobileTime: 120,
  map: [
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#..A..B..r..........3..b.....#',
    '############...##########...##',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............r............b..#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#......2.....................#',
    '#...########.................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#.........b...r..............#',
    '#EEE.S............1..W...HHH.#',
    '#########www#lll##############',
    '##############################',
  ],
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'platform', at: 'E', dx: 0, dy: -7, group: 1 },
    { kind: 'pusher', at: '2', group: 2 },
    { kind: 'platform', at: 'H', dx: 0, dy: -17, group: 2 },
    { kind: 'lever', at: '3', group: 3 },
    { kind: 'platform', rect: [12, 17, 3, 1], dx: 0, dy: -10, group: 3 },
  ],
};
