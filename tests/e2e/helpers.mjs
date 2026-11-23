// Shared helpers for the browser tests (local only; they need Google Chrome installed).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright-core';

export const ROOT = new URL('../../', import.meta.url);

/** Starts scripts/serve.mjs on a free-ish port; resolves to { url, stop }. */
export async function startServer({ base = '/', root = '.' } = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(port), '--base', base, '--root', root], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(child.stdout, 'data');
  return {
    url: `http://localhost:${port}${base}`,
    stop: () => child.kill(),
  };
}

export async function launchBrowser() {
  const channel = process.env.PW_CHANNEL || 'chrome';
  return chromium.launch({ channel, headless: process.env.HEADED ? false : true });
}

/** Opens a page and collects uncaught errors (ignoring 404s for optional images). */
export async function openPage(context, url) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url);
  return page;
}

export function gameState(page) {
  return page.evaluate(() => window.Phaser && Phaser.GAMES[0] && Phaser.GAMES[0].state.current);
}

/** Waits for one of the given Phaser state keys (string or array) with no fade in progress. */
export async function waitForState(page, keys, timeout = 30000) {
  await page.waitForFunction(
    (ks) =>
      window.Phaser && Phaser.GAMES[0] && ks.includes(Phaser.GAMES[0].state.current) && !Phaser.GAMES[0].state.fading,
    [].concat(keys),
    { timeout },
  );
}

/** The level map, or the first-visit tutorial prompt the game shows on top of it. */
export const LEVEL_MAP = ['levelMenu', 'tutorialPrompt'];

/** Waits until the current level is loaded (and, for online levels, released from the start hold). */
export async function waitForPlayableLevel(page, timeout = 40000) {
  await page.waitForFunction(
    () => {
      const g = window.Phaser && Phaser.GAMES[0];
      const l = g && g.level;
      return (
        g.state.current === 'level' &&
        l &&
        l.loadCompleted &&
        !g.physics.box2d.paused &&
        (!l._net || l._net.hold === false)
      );
    },
    null,
    { timeout },
  );
}
