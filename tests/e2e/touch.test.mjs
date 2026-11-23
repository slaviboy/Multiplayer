// End-to-end: touch controls on a phone. One-player touch mode has left and right
// buttons in the corners and, by default, a jump button in the middle; Settings
// switches back to the two buttons (press both to jump).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright-core';
import { launchBrowser, openPage, startServer, waitForPlayableLevel, waitForState } from './helpers.mjs';

const GAME = 'games/stan-and-lisa/';

async function startFirstLevel(page) {
  await waitForState(page, 'menu', 60000);
  await page.evaluate(() => {
    const g = Phaser.GAMES[0];
    g.state.states.menu.startTemple(g.progress.get('temples')[0]);
  });
  await page.waitForFunction(() => Phaser.GAMES[0].state.states.levelMenu && !Phaser.GAMES[0].state.fading);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const g = Phaser.GAMES[0];
    g.state.states.levelMenu.startLevel({ data: g.progress.get('temples')[0].levels[1] });
  });
  await waitForPlayableLevel(page);
  await page.waitForTimeout(500);
}

// The character whose buttons are on screen (changing controls selects a friend).
const shown = () => {
  const l = Phaser.GAMES[0].level;
  return [l.pers1, l.pers2, ...(l.friends || [])].find((c) => c.cursors.buttons && c.cursors.buttons.visible);
};

test('phones get left, jump and right buttons, and Settings switches to two', { timeout: 120_000 }, async () => {
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const page = await openPage(await browser.newContext({ ...devices['Pixel 7 landscape'] }), server.url + GAME);
    await startFirstLevel(page);
    assert.equal(await page.evaluate(() => Phaser.GAMES[0].settings.controls), 'single');

    const layout = await page.evaluate(`(${shown})().cursors.buttons.children.map((b) => Math.round(b.x))`);
    assert.equal(layout.length, 3, 'three buttons by default');
    const [left, right, jump] = layout;
    assert.ok(left < jump && jump < right && jump === 0, `jump sits in the middle (${layout})`);

    // the middle button jumps
    const y0 = await page.evaluate(`(() => { const c = (${shown})(); c.cursors.jumpButton.onTouchStart(); return c.sprite.y; })()`);
    assert.equal(await page.evaluate(`(${shown})().cursors.up.isDown`), true);
    await page.waitForTimeout(300);
    const y1 = await page.evaluate(`(() => { const c = (${shown})(); c.cursors.jumpButton.onTouchEnd(); return c.sprite.y; })()`);
    assert.ok(y0 - y1 > 40, `the character jumped (${y0} → ${y1})`);
    assert.equal(await page.evaluate(`(${shown})().cursors.up.isDown`), false);

    // Settings: the toggle reads "3 buttons"; pressing it gives two, and it is saved
    await page.evaluate(() => {
      const g = Phaser.GAMES[0];
      const SettingsMenu = window.require('States/Settings/SettingsMenu');
      const m = (g.level.pauseMenu.settingsMenu = new SettingsMenu(g, g.level));
      m.show();
    });
    const menu = () => Phaser.GAMES[0].level.pauseMenu.settingsMenu.jumpToggle;
    assert.equal(await page.evaluate(`(${menu})().label.text`), '3 buttons');
    await page.evaluate(`(${menu})().toggle()`);
    assert.equal(await page.evaluate(`(${menu})().label.text`), '2 buttons');
    const counts = await page.evaluate(() => {
      const l = Phaser.GAMES[0].level;
      return [l.pers1, l.pers2].map((c) => c.cursors.buttons.children.length);
    });
    assert.deepEqual(counts, [2, 2], 'back to two buttons');
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(`!!(${shown})()`), 'the rebuilt buttons are on screen');
    const saved = await page.evaluate(() => {
      const g = Phaser.GAMES[0];
      return JSON.parse(localStorage.getItem(`fb-${g.gameConfig.id}:settings`)).jumpButton;
    });
    assert.equal(saved, false, 'the choice is saved');
    assert.deepEqual(page.errors, []);
  } finally {
    await browser.close();
    server.stop();
  }
});
