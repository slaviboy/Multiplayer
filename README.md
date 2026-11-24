# Multiplayer Games

A collection of browser games served as one static site on GitHub Pages. The
main page (`index.html`) lists every game from `games.json`. Each game lives in
its own folder under `games/`.

| Game | Folder | Players |
|---|---|---|
| Stan & Lisa and Friends | [`games/stan-and-lisa/`](games/stan-and-lisa/) | 1–2, online co-op |
| Basketball Stars | [`games/basketball/`](games/basketball/) | 1–2, online versus |
| Goal Heads | [`games/football/`](games/football/) | 1–2, online versus |

## Playing together online

1. Open a game and choose **Play online**.
2. Pick your character (Stan or Lisa).
3. Send the link, or let your friend scan the QR code. They get the other character.
4. Chat with the 💬 button or Enter; messages and emojis appear above your character.

There is no game server. The two browsers connect directly over WebRTC using
[Trystero](https://github.com/dmotz/trystero); public Nostr relays are only used to
find each other. The invite secret is in the link's `#` part, so it never reaches a
web server, and it encrypts the connection handshake. If a network blocks direct
connections the game says so; trying another network (for example mobile data)
usually helps.

## Repository layout

```
index.html, hub/          the game list (rendered from games.json)
games.json                registry of games: id, title, path, thumbnail, ...
games/stan-and-lisa/      the first game (see below)
games/basketball/         Basketball Stars, online lockstep (see its README)
games/football/           Goal Heads, our own engine on the original art (see its README)
shared/online/            reusable online kit: invite links, WebRTC link, lobby, QR, chat
shared/vendor/            bundled third-party code (see shared/vendor/LICENSES.md)
scripts/                  tooling: checks, level generator, site build, dev server
tests/unit/               fast tests (npm test)
tests/e2e/                browser tests with Google Chrome (npm run test:e2e)
.githooks/                pre-commit and commit-msg hooks
.github/workflows/        GitHub Pages deployment
```

### Stan & Lisa and Friends

- `js/init.js` is the compiled game (Phaser 2 + Box2D). It is not edited except one
  line that turns off the ad SDK; everything new is added from outside:
  - `online/netplay.js` – online co-op and chat
  - `extras/extras.js` – darkness, fog of war, torches, monsters, fireflies, thorns,
    checkpoints, ladders and piggyback (standing on each other's heads)
- `levels-src/` – the new co-op levels as readable ASCII sources; `npm run levels`
  turns them into the Tiled JSON in `data/friends/levels/`. See
  [`levels-src/README.md`](games/stan-and-lisa/levels-src/README.md).
- `data/friends/temple.json` – the level map (positions, unlock graph, time limits).

Every co-op level has a `walkthrough` that a bot plays with the game's real physics
and controls (`tests/e2e/levels.test.mjs`), which proves the level can be finished.

## Commands

Requires Node.js 22 or newer.

```sh
npm install          # also enables the git hooks
npm run serve        # http://localhost:8080/  (VS Code Live Server works too)
npm run levels       # rebuild generated levels after editing levels-src/
npm run check        # repository checks (also run by the pre-commit hook and CI)
npm test             # unit tests
npm run test:e2e     # browser tests (needs Google Chrome, and internet for online play)
npm run build        # copy the deployable site into _site/
npm run vendor       # rebuild shared/vendor/ after changing a pinned version
```

`LEVEL=coop_07 npm run test:e2e` runs the bot on one level.

## Git hooks

`npm install` points git at `.githooks/` and records your name and e-mail in local
git config (`hooks.author`, never committed). Then:

- **pre-commit** – the commit author must match `hooks.author`; runs `npm run check`
  and the unit tests.
- **commit-msg** – removes `Co-Authored-By:` trailers (delete the hook to keep them).

To enable them by hand: `git config core.hooksPath .githooks`.

## Deploying to GitHub Pages

Push to `main`. `.github/workflows/deploy.yml` runs the checks and unit tests,
builds `_site/` and publishes it. One setting on GitHub, made once:
**Settings → Pages → Source: GitHub Actions**. The site then lives at
`https://<user>.github.io/<repo>/`, and each game at `.../games/<folder>/`.

## Adding a game

1. Put it in `games/<folder>/` with an `index.html` that uses relative paths.
2. Add an entry to `games.json` (unique `id`, `title`, `path`, `description`,
   optional `thumbnail`, `players`, `online`, `tags`).
3. For online play, reuse `shared/online/` (see how `games/stan-and-lisa/online/netplay.js`
   uses `PeerLink`, `Lobby` and `Chat`).
4. `npm run check`, then commit.

All games share one origin on GitHub Pages, so they share `localStorage`; prefix
your storage keys with the game's id.
