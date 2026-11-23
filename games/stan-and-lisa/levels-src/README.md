# Level sources

Each `coop_*.mjs` file is one level. `npm run levels` turns them into Tiled JSON in
`../data/friends/levels/`; `npm run check` fails when a built file is out of date.
Files starting with `_` are helpers, not levels (`_grid.mjs` draws large maps by
coordinates).

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

Groups: triggers (pushers, levers) in a group are OR'ed; everything else in the
group follows. Level properties: `darkness` (`'dark'` or `'reveal'`), `lightRadius`,
`piggyback`.

## Physics to design by

- A jump reaches about 4.3 tiles; standing on the partner's head adds about 1.8.
  A 5-tile ledge therefore needs piggyback, a box, a ladder or a lift.
- A character is about 1.5 tiles tall; corridors need 2 tiles, 3 to jump in.
- A low ceiling shortens jumps: 7-wide pools under a 3-tall ceiling can't be jumped.
- Leave a run-up before long jumps; 2-tile gaps between 3-wide pillars work well.
- Then write the walkthrough and run `LEVEL=<name> npm run test:e2e`.
