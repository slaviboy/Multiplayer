// Shadow Patrol: fog of war (the map is black until you have been there) and
// monsters that kill on touch but are afraid of light.
// 1. Lisa holds button 1: a torch lights up and the first monster freezes.
//    Stan walks past it and pushes lever 2, which keeps that torch burning, so
//    Lisa can follow.
// 2. A wall too high to climb: Stan stands by it, Lisa jumps onto his head and
//    over, then pushes lever 3, which lowers a ladder for Stan.
// 3. Two more monsters guard the doors. Stan holds button 4 (two torches light
//    and both monsters freeze); Lisa runs past them and pushes lever 5 at the
//    end, which keeps the light on for Stan.
import { grid } from './_grid.mjs';

const g = grid(62, 22).border();
// section 1
g.put(2, 20, 'S').put(5, 20, 'W').put(3, 20, '1').put(21, 20, '2');
g.put(8, 19, 'r').put(12, 19, 'b').put(16, 19, 'r');
// section 2: the wall and its ladder
g.box(28, 16, 33, 20).box(27, 16, 27, 20, 'L').put(30, 15, '3');
g.put(24, 19, 'b').put(30, 12, 'v').put(32, 15, 'r');
// section 3
g.put(35, 20, '4').put(55, 20, '5').put(57, 20, 'A').put(59, 20, 'B');
g.put(41, 19, 'b').put(44, 19, 'r').put(51, 19, 'b').put(53, 19, 'r');
// lights
g.put(14, 17, 'T').put(42, 17, 'U').put(52, 17, 'U').put(3, 17, 'x').put(58, 17, 'x');

export default {
  file: 'coop_11_shadow_patrol.json',
  title: 'Shadow Patrol',
  time: 140,
  mobileTime: 170,
  properties: { darkness: 'reveal', lightRadius: 140, piggyback: true },
  map: g.rows(),
  objects: [
    { kind: 'pusher', at: '1', group: 1 },
    { kind: 'lever', at: '2', group: 1 },
    { kind: 'torch', at: 'T', group: 1, radius: 200 },
    { kind: 'monster', path: [[10, 21], [18, 21]], group: 1 },
    { kind: 'fireflies', path: [[2, 18], [4, 18]], count: 3 },
    { kind: 'lever', at: '3', group: 3 },
    { kind: 'ladder', at: 'L', group: 3 },
    { kind: 'pusher', at: '4', group: 4 },
    { kind: 'lever', at: '5', group: 4 },
    { kind: 'torch', at: 'U', group: 4, radius: 220 },
    { kind: 'monster', path: [[39, 21], [46, 21]], group: 4, speed: 3 },
    { kind: 'monster', path: [[49, 21], [54, 21]], group: 4, speed: 2, phase: 1 },
    { kind: 'torch', at: 'x' },
    { kind: 'fireflies', path: [[34, 15], [40, 14], [47, 15], [54, 14]], count: 6, group: 4 },
  ],
  walkthrough: {
    fb: [
      { wait: 'light1' },
      { idle: 0.8 },
      { go: 23.5 },
      { set: 'lever1' },
      { go: 26.5 },
      { set: 'base' },
      { wait: 'ladder' },
      { idle: 1 },
      { go: 27.5 },
      { climb: 'up', untilAbove: 15 },
      { go: 29.5 },
      { go: 34.2 },
      { go: 36 },
      { set: 'light4' },
      { wait: 'lever5' },
      { idle: 0.8 },
      { go: 58 },
    ],
    wg: [
      { go: 4 },
      { set: 'light1' },
      { wait: 'lever1' },
      { idle: 0.5 },
      { go: 26.5 },
      { wait: 'base' },
      { jump: 'up' },
      { jump: 'right', to: 28.6 },
      { go: 32.6 },
      { set: 'ladder' },
      { wait: 'light4' },
      { idle: 1 },
      { go: 34.2 },
      { go: 56.6 },
      { set: 'lever5' },
      { go: 60 },
    ],
  },
};
