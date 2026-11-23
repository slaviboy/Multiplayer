// Browser checks for Stan & Lisa levels (needs Google Chrome; run with `npm run test:e2e`).
//  1. every level on the level map loads and starts without errors;
//  2. every generated co-op level is beaten by the bot following its walkthrough,
//     which proves it can be finished with the game's real physics and rules.
// Run a single level with: LEVEL=coop_03 npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { launchBrowser, openPage, startServer, waitForPlayableLevel, waitForState } from './helpers.mjs';
import { playLevel } from './bot.mjs';
import { loadSources } from '../../scripts/build-levels.mjs';

const GAME = 'games/stan-and-lisa/';
const only = process.env.LEVEL || '';

async function withGame(fn) {
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await openPage(ctx, server.url + GAME);
    await waitForState(page, 'menu');
    await fn(page);
  } finally {
    await browser.close();
    server.stop();
  }
}

test('every level on the map loads and starts', { timeout: 900_000, skip: !!only }, async () => {
  const temple = JSON.parse(readFileSync(`${GAME}data/friends/temple.json`, 'utf8'));
  await withGame(async (page) => {
    for (const lvl of temple.levels) {
      page.errors.length = 0;
      await page.evaluate((data) => {
        const g = Phaser.GAMES[0];
        g.currentTemple = g.progress.get('temples')[0];
        if (g.level && g.state.current === 'level' && !g.level._olKilled) {
          g.level.sounds.levelMusic.stop();
          g.level.killAll();
        }
        g.state.add('level', window.require('States/Level/Level'));
        g.state.fade('level', true, false, data);
      }, { ...lvl, time: 999 });
      await waitForPlayableLevel(page, 30000);
      await page.waitForTimeout(300);
      assert.deepEqual(page.errors, [], `${lvl.filename}: no errors`);
    }
  });
});

test('every co-op level can be finished (bot walkthrough)', { timeout: 3_600_000 }, async () => {
  const sources = (await loadSources()).filter(({ def }) => def.file.includes(only));
  const failures = [];
  await withGame(async (page) => {
    for (const { def } of sources) {
      if (!existsSync(`${GAME}data/friends/levels/${def.file}`)) {
        failures.push(`${def.file}: not built (run npm run levels)`);
        continue;
      }
      if (!def.walkthrough) {
        failures.push(`${def.file}: no walkthrough`);
        continue;
      }
      // a fresh game per level, so nothing from the previous level carries over
      await page.reload();
      await waitForState(page, 'menu');
      const { result, log } = await playLevel(page, def.file, def.walkthrough);
      console.log(`${def.file}: ${result}`);
      if (result !== 'win') {
        failures.push(`${def.file}: ${result}`);
        console.log(log.slice(-25).join('\n'));
      }
    }
  });
  assert.deepEqual(failures, []);
});
