# Basketball Stars

A Phaser 2 + nape physics + DragonBones game, shipped as one compiled webpack
bundle (`basketball_legends_2019.min.js`). Local modes are the game's own
(1 player vs CPU, 2 players on one keyboard, quick match, tutorial); online
versus/co-op lives in `online/`.

## Changes to the original build

- `index.html`: no Poki SDK (the game's ad wrapper switches itself off without it)
  and no sitelock script; loads `../../shared/online/lobby.css`, `online/online.css`
  and `online/netplay.js`.
- The bundle has exactly two edits (search for them before replacing the file):
  - `e.p="",window.__bb=e,e(e.s=60)`: webpack's module loader is exposed, so
    `online/netplay.js` can reach the game's classes (`window.__bb.c` is the module
    cache; netplay finds classes by their export names, not by module numbers);
  - `checkDomain` returns `true`: the game runs on any host.

Don't edit the bundle otherwise; patch prototypes from `online/` instead.

## Online play (`online/`)

PLAY ONLINE in the main menu creates an invite (link / QR, `shared/online/lobby.js`);
both players land on the game's "2 PLAYERS MATCH" screen. The host owns the left
team and the mode (1 v 1, 2 v 2 with CPU team-mates, 2 v CPU co-op), the guest the
right team; choices show up on both screens. The host presses PLAY, and after the
match RESTART or NEXT for both.

The match runs in **lockstep** (`lockstep.js`): both browsers simulate the same
match, tick by tick (40 ticks/s, the game's own fixed step), and exchange only the
players' inputs, a few ticks ahead (the delay is picked from the ping). A tick waits
until both inputs are known. This only works if the simulation is deterministic,
so while a tick runs (`netplay.js`):

- `Math.random` is a generator seeded by the host, and `sin`/`cos`/`atan2`/`pow`
  and friends are the bit-identical versions in `detmath.js` (browsers differ in
  the last bit of the native ones);
- DragonBones animations advance by the tick, not by the clock: their frame
  events release the ball, steal and finish dunks;
- the fade after a basket (`MatchPreloader`), which restarts play, is timed in
  ticks instead of a Phaser tween;
- every player is simulated with their own device's rules (`isDesktop` changes how
  the supershot recharges and what the touch steal button does), on both screens;
- pausing is off.

Every second both sides hash the match state (bodies, score, clock) and compare;
`window.__online.desyncs` lists the ticks where they differed (should stay empty).
Anything new that changes the match from outside a tick (a timer, a tween with a
callback, a UI button acting on the match) breaks this.

Tests: `tests/unit/basketball.test.mjs` (maths and lockstep buffer) and
`tests/e2e/basketball.test.mjs` (a desktop host and a phone guest play two short
matches over a real link, with lag, and must never desync).
