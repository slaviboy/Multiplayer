// Solution: the players take turns. Stan's buttons (top lane) raise bridges
// over the lava in Lisa's lane; Lisa's buttons (bottom lane) raise bridges over
// the water in Stan's lane. Stan holds 1, Lisa crosses to 2 and holds it, Stan
// crosses to 3, Lisa crosses to 4, Stan crosses to his door.
export default {
  file: 'coop_03_crossfire.json',
  title: 'Crossfire',
  time: 70,
  mobileTime: 90,
  map: [
    '########################################',
    '########################################',
    '########################################',
    '########################################',
    '#......................................#',
    '#......................................#',
    '#S..1.......r......3.......r......A....#',
    '########wwwwwww########wwwwwww##########',
    '########################################',
    '########################################',
    '########################################',
    '########################################',
    '#......................................#',
    '#......................................#',
    '#.W........b.....2.......b.....4...B...#',
    '########lllllll#######lllllll###########',
    '########################################',
    '########################################',
  ],
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'pusher', at: '2', group: 2 },
    { kind: 'pusher', at: '3', group: 3 },
    { kind: 'pusher', at: '4', group: 4 },
    // bridges hide one tile below the liquid and rise to cover it
    { kind: 'platform', rect: [8, 16, 7, 1], dx: 0, dy: -1, group: 1 },
    { kind: 'platform', rect: [8, 8, 7, 1], dx: 0, dy: -1, group: 2 },
    { kind: 'platform', rect: [22, 16, 7, 1], dx: 0, dy: -1, group: 3 },
    { kind: 'platform', rect: [23, 8, 7, 1], dx: 0, dy: -1, group: 4 },
  ],
};
