// The Long Way Home: the longest level. Fog of war over two floors.
// Lower floor, left to right:
//   A. Push the box onto the button (the bump stops it there): the gate opens.
//   B. Pillars over a pit of thorns (fall and you restart at the flag).
//   C. Monsters afraid of light: Stan holds button 4, the torches light and the
//      monsters freeze; Lisa runs past and pushes lever 5 to keep the light on.
//   D. A wall too high to climb: Lisa jumps from Stan's head onto it and pushes
//      lever 6, which lowers a ladder for Stan. The tall ladder at the end leads
//      up to the upper floor.
// Upper floor, right to left:
//   E. A goo pit: Stan holds button P (a bridge rises), Lisa crosses and pushes
//      the far lever to keep it.
//   F. Ten tiles of lava, then ten of water: Stan walks the lava to button 8,
//      which bridges it for Lisa; Lisa walks the water to button 9, which
//      bridges it for Stan. Fireflies show the way to the doors.
import { grid } from './_grid.mjs';

const g = grid(80, 28).border();
// upper floor (rows 15-16) with the goo, lava and water, and the doors
g.box(1, 15, 78, 16);
g.box(52, 15, 63, 15, 'g').box(36, 15, 45, 15, 'l').box(22, 15, 31, 15, 'w');
g.put(66, 14, 'P').put(48, 14, 'm').put(33, 14, '8').put(19, 14, '9').put(4, 14, 'A').put(7, 14, 'B');
g.put(57, 12, 'b').put(41, 14, 'r').put(27, 14, 'b').put(12, 13, 'r');
g.box(76, 15, 76, 26, 'L'); // tall ladder between the floors
// A: box, button, bump, gate
g.put(1, 26, 'S').put(3, 26, 'W').put(5, 26, 'X').put(10, 26, '1').box(12, 26, 12, 26);
g.box(15, 17, 15, 23).box(15, 24, 15, 26, 'G');
g.put(7, 23, 'r').put(9, 22, 'b');
// B: thorns and pillars
g.box(18, 26, 34, 26, '^').box(20, 24, 22, 26).box(25, 23, 27, 26).box(30, 24, 32, 26);
g.put(17, 26, 'k').put(36, 26, 'k');
g.put(21, 23, 'r').put(26, 22, 'b').put(31, 23, 'r');
// C: monsters and their light
g.put(39, 26, '4').put(58, 26, '5');
g.put(45, 25, 'b').put(50, 25, 'r').put(55, 25, 'b');
// D: the piggyback wall, its ladder and lever
g.box(66, 22, 71, 26).box(65, 22, 65, 26, 'H').put(69, 21, '6').put(62, 26, 'k');
g.put(68, 18, 'v').put(73, 25, 'r');
// lights
g.put(46, 22, 'U').put(54, 22, 'U').put(26, 19, 't').put(6, 11, 'x').put(74, 22, 't');

export default {
  file: 'coop_12_the_long_way_home.json',
  title: 'The Long Way Home',
  time: 240,
  mobileTime: 290,
  properties: { darkness: 'reveal', lightRadius: 150, piggyback: true },
  map: g.rows(),
  objects: [
    { kind: 'box', at: 'X' },
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'platform', at: 'G', dx: 0, dy: -3, group: 1 },
    { kind: 'pusher', at: '4', group: 4 },
    { kind: 'lever', at: '5', group: 4 },
    { kind: 'torch', at: 'U', group: 4, radius: 220 },
    { kind: 'monster', path: [[43, 27], [49, 27]], group: 4, speed: 3 },
    { kind: 'monster', path: [[52, 27], [56, 27]], group: 4, speed: 2, phase: 1 },
    { kind: 'fireflies', path: [[41, 22], [48, 21], [55, 22], [59, 21]], count: 6, group: 4 },
    { kind: 'lever', at: '6', group: 6 },
    { kind: 'ladder', at: 'H', group: 6 },
    { kind: 'ladder', at: 'L' },
    { kind: 'pusher', at: 'P', group: 7 },
    { kind: 'leverMirrored', at: 'm', group: 7 },
    { kind: 'platform', rect: [52, 16, 12, 1], dx: 0, dy: -1, group: 7 },
    { kind: 'pusher', at: '8', group: 8 },
    { kind: 'platform', rect: [36, 16, 10, 1], dx: 0, dy: -1, group: 8 },
    { kind: 'pusher', at: '9', group: 9 },
    { kind: 'platform', rect: [22, 16, 10, 1], dx: 0, dy: -1, group: 9 },
    { kind: 'torch', at: 't' },
    { kind: 'torch', at: 'x' },
    { kind: 'fireflies', path: [[30, 12], [22, 11], [14, 12], [8, 12]], count: 6 },
  ],
  walkthrough: {
    fb: [
      { go: 9.4, tol: 0.7, max: 15 },
      { set: 'boxed' },
      { idle: 1.6 },
      { jump: 'right', to: 13.6 },
      { go: 17.6 },
      { jump: 'right', to: 20.6 },
      { go: 21.5 },
      { jump: 'right', to: 25.6 },
      { go: 26.5 },
      { jump: 'right', to: 30.6 },
      { go: 31.5 },
      { jump: 'right', to: 35.6 },
      { go: 40 },
      { set: 'light' },
      { wait: 'lever5' },
      { idle: 0.8 },
      { go: 64.5 },
      { set: 'base' },
      { wait: 'ladder6' },
      { idle: 1 },
      { go: 65.5 },
      { climb: 'up', untilAbove: 21 },
      { go: 67.5 },
      { go: 76.5 },
      { climb: 'up', untilAbove: 14 },
      { go: 67 },
      { set: 'goo' },
      { wait: 'gooLocked' },
      { idle: 0.6 },
      { go: 34 },
      { set: 'lavaBridge' },
      { wait: 'waterBridge' },
      { idle: 1 },
      { go: 5 },
      { set: 'stanHome' },
    ],
    wg: [
      { wait: 'boxed' },
      { idle: 1.6 },
      { go: 9 },
      { jump: 'right', to: 13.6 },
      { go: 17.6 },
      { jump: 'right', to: 20.6 },
      { go: 21.5 },
      { jump: 'right', to: 25.6 },
      { go: 26.5 },
      { jump: 'right', to: 30.6 },
      { go: 31.5 },
      { jump: 'right', to: 35.6 },
      { go: 37 },
      { wait: 'light' },
      { idle: 1 },
      { go: 60.4 },
      { set: 'lever5' },
      { go: 64.5 },
      { wait: 'base' },
      { jump: 'up' },
      { jump: 'right', to: 66.6 },
      { go: 71 },
      { set: 'ladder6' },
      { go: 76.5 },
      { climb: 'up', untilAbove: 14 },
      { go: 64.6 },
      { wait: 'goo' },
      { idle: 0.8 },
      { go: 47.6 },
      { set: 'gooLocked' },
      { go: 46.6 },
      { wait: 'lavaBridge' },
      { idle: 1 },
      { go: 20 },
      { set: 'waterBridge' },
      { wait: 'stanHome' },
      { go: 8 },
    ],
  },
};
