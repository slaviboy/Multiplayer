# Notes for working in this repo

- Static site, no build step: the repo root is what GitHub Pages serves (`npm run build`
  only copies it into `_site/`). Keep every path relative; the site lives under
  `/<repo>/` on Pages. Node is only for tooling and tests.
- `games.json` is the registry the hub renders. Game ids must be unique; they also
  namespace saved progress, since all games share one origin.
- `games/stan-and-lisa/js/init.js` is a compiled Phaser 2.6 + Box2D bundle. Don't edit
  it (the only change is `devSkipAds: !0`). Extend it from ES modules by patching
  prototypes obtained with RequireJS (`window.require('States/Level/Level')`), like
  `online/netplay.js` and `extras/extras.js` do. Patch prototypes before instances
  exist: constructors bind methods to the instance.
- Engine facts that bit before:
  - platform `dx`/`dy` in Tiled JSON are in Box2D axes (positive dy = up, positive dx =
    left); the level generator takes screen directions and flips them.
  - Moving a Box2D body by setting its position doesn't wake it; call `SetAwake(true)`.
  - `Phaser.Group` has getters such as `total`; don't use those names on device classes.
  - The `levelMenu` state only exists after the Play button; online code adds it.
  - Devices need a `body` (camera and checkpoints read it); new ones use a fixture-less
    static body.
- `games/basketball/` is a compiled webpack bundle (Phaser 2 + nape + DragonBones) with
  two documented edits (see its README): `window.__bb` exposes webpack's module loader,
  and the domain check passes. Patch it from `online/` by finding classes by export
  name. Online play is deterministic lockstep: anything that changes a match outside a
  tick, or reads the clock, `Math.random` or native trig inside one, desyncs it; the
  e2e test checks `window.__online.desyncs` stays empty.
- Levels: edit `levels-src/*.mjs`, run `npm run levels`, prove with
  `LEVEL=<name> npm run test:e2e` (bot walkthrough). See `levels-src/README.md`.
- Before committing: `npm run check` and `npm test` (the pre-commit hook runs both).
  Browser tests need Google Chrome; the online test also needs internet (Nostr relays).
- On Windows with Git Bash, arguments starting with `/` are rewritten into paths;
  pass level file names without a leading slash.
