# Level sources

Each `coop_*.mjs` file is one level. `npm run levels` turns them into Tiled JSON in
`../data/friends/levels/`; `npm run check` fails when a built file is out of date.
Files starting with `_` are helpers, not levels: `_grid.mjs` draws large maps by
coordinates, and `_track.mjs` builds long levels from proven pieces (below).

```js
export default {
  file: 'coop_01_hold_the_gate.json',
  title: 'Hold the Gate', time: 60, mobileTime: 75,
  properties: { darkness: 'dark', lightRadius: 150, piggyback: true }, // optional
  map: [ '#####...', ... ],              // one string per row, all the same width
  objects: [ { kind: 'pusher', at: '1', group: 1 }, ... ],
  walkthrough: { fb: [ ...steps ], wg: [ ...steps ] },  // see tests/e2e/bot.mjs
};
```

## Map characters

| Char | Meaning |
|---|---|
| `#` | rock |
| `/` `\` | floor slopes; `F` `7` ceiling slopes (so never use F or 7 as markers) |
| `w` `l` `g` | water (kills Stan), lava (kills Lisa), goo (kills both) |
| `i` | ice |
| `\|` | back wall without collision; portals sit in it |
| `.` or space | empty |
| `S` `W` | Stan, Lisa (left cell of the 2-wide character, in the row above the floor) |
| `A` `B` | Stan's door, Lisa's door (same rule) |
| `r` `b` `v` | red, blue, silver diamond (centred in the cell) |
| `^` | thorns: whoever lands on them goes back to their last checkpoint |
| `k` | checkpoint flag, in the row above the floor |
| anything else | a marker that an entry in `objects` refers to with `at` |

## Objects

| kind | placement | properties |
|---|---|---|
| `pusher`, `timedPusher` | marker in the row above the floor | `group`; timed: `time` (ms) |
| `lever`, `leverMirrored` | same | `group`. A lever leans left and switches when pushed **right**; the mirrored one leans right and switches when pushed **left**. Put it where the player arrives from the side that switches it, and away from where they land after a jump. |
| `box` | marker in the row above the floor | |
| `platform` | every cell with the marker (a filled rectangle), or `rect: [col,row,w,h]` | `dx`, `dy` in tiles, **screen directions** (dx > 0 right, dy < 0 up); `group`. Moves 2 tiles/second. |
| `portal` | `pos: [col, bottomRow]`, 3 tiles tall in a `\|` wall column | `portalId` (pairs), `group` |
| `ladder` | every cell with the marker | `group` → rolled up until lowered |
| `torch` | marker cell | `group` → only burns while on; `radius` |
| `monster` | `path: [[colA, floorRow], [colB, floorRow]]` | `group` → frozen and harmless while on; `speed`, `phase` |
| `fireflies` | `path: [[col, row], ...]` | `group` → only shown while on; `count`, `speed` |

Instead of a marker, any object can take `cell: [col, row]` (and a ladder
`rect: [col, row, w, h]`), which long generated levels need.

Groups: triggers (pushers, levers) in a group are OR'ed; everything else in the
group follows. Level properties: `darkness` (`'dark'` or `'reveal'`), `lightRadius`,
`piggyback`, and `environment`: an outdoor look and weather, one of `snow`, `rain`,
`storm` (also dark, with lightning), `spring`, `summer`, `winter`, `lake`
(`extras/environments.js`; decoration only, physics are unchanged).

## Long levels from pieces (`_track.mjs`)

Levels 13-19 are chains of pieces, left to right. Each piece draws its part of the
map, adds its objects and the bot steps for both characters, so a new chain is
proven by `LEVEL=<name> npm run test:e2e` without writing a walkthrough by hand.

```js
const t = track({ height: 30, floor: 24 }); // floor = row of the ground's top
t.start().hill().gate('fb').bridgePool('wg').pillars().ledge().descend(3).doors();
export default t.level({ file, title, properties: { environment: 'spring' } });
```

| piece | what the players do | floor |
|---|---|---|
| `start`, `doors` | where they begin and end | |
| `flat(w)`, `hill()`, `ice(w)` | walk (diamonds over the flat) | |
| `climb(d)`, `descend(d)` | slopes up or down | -d / +d |
| `gate(holder)` | one holds a button, the other passes and pulls the lever that keeps it open | |
| `bridgePool(wader)` | a pool only the wader survives; a far button raises a bridge | |
| `gooBridge(holder)` | goo: one holds, the other crosses and locks the bridge with a lever | |
| `pillars()` | three pillars over spikes, a flag on each side | |
| `smallPools()` | a lava pool for Lisa to jump, a water pool for Stan | |
| `ledge()` | 5 high: Lisa from Stan's head, a lever lowers a ladder (piggyback) | -5 |
| `lift()` | 7 high: Lisa rides a lift while Stan holds its button, then a ladder | -7 |
| `boxBank()` | 7 high: Stan pushes the box, stands on it, Lisa jumps from his head | -7 |
| `raft(rider)` | the partner holds a button, a raft carries the rider over, the partner wades | |
| `swampRaft()` | goo with a raft called from either bank (button near, lever far) | |
| `timedCover(runner)` | the partner wades over and presses a 6-second timed button | |
| `monsters()` | Stan holds the light on, Lisa runs past frozen monsters to the lever | |

Pits and bridges need the floor at least 5 rows above the bottom; climbing pieces
need room above. Keep levels under about 240 tiles wide (WebGL texture sizes).

## Physics to design by

- A jump reaches about 4.3 tiles; standing on the partner's head adds about 1.8.
  A 5-tile ledge therefore needs piggyback, a box, a ladder or a lift.
- A character is about 1.5 tiles tall; corridors need 2 tiles, 3 to jump in.
- A low ceiling shortens jumps: 7-wide pools under a 3-tall ceiling can't be jumped.
- Leave a run-up before long jumps; 2-tile gaps between 3-wide pillars work well.
- Then write the walkthrough and run `LEVEL=<name> npm run test:e2e`.
