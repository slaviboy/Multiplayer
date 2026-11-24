// End-to-end: two browsers play Basketball Stars online through a real invite link.
// The guest is a phone (touch build of the game), the host a desktop. Needs Google
// Chrome and internet access (Nostr relays for signalling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright-core';
import { launchBrowser, openPage, startServer } from './helpers.mjs';

const GAME = 'games/basketball/';
const stateOf = (page) => page.evaluate(() => Phaser.GAMES[0].state.current);
const waitState = (page, name, timeout = 30000) =>
  page.waitForFunction((n) => Phaser.GAMES[0].state.current === n, name, { timeout });
const selectionOf = (page) =>
  page.evaluate(() => {
    for (const m of Object.values(window.__bb.c)) {
      const inv = m.exports && m.exports.Inventory;
      if (inv) {
        const md = inv.instance.matchData;
        return { teams: md.teams.slice(), players: md.players.map((p) => p[0]), mode: md.matchMode };
      }
    }
    return null;
  });
const scoreOf = (page) =>
  page.evaluate(() => {
    for (const m of Object.values(window.__bb.c)) if (m.exports && m.exports.Inventory) return m.exports.Inventory.instance.matchData.matchScore.slice();
    return null;
  });

async function pressFor(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test('host invites, a phone joins, they pick teams and play in sync, then a rematch', { timeout: 300_000 }, async () => {
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    // --- host: main menu → PLAY ONLINE (a real click on the canvas button) → invite
    const host = await openPage(await browser.newContext({ viewport: { width: 1280, height: 720 } }), server.url + GAME);
    await host.waitForFunction(() => window.__online && Phaser.GAMES[0].state.current === 'menu', null, { timeout: 60000 });
    await host.waitForTimeout(1200); // menu tweens
    const at = await host.evaluate(() => {
      const g = Phaser.GAMES[0];
      const b = g.state.states.menu._olBtn.getBounds();
      const r = g.canvas.getBoundingClientRect();
      const k = r.width / g.width;
      return { x: r.left + (b.x + b.width / 2) * k, y: r.top + (b.y + b.height / 2) * k };
    });
    await host.mouse.click(at.x, at.y);
    const link = await host.locator('.ol-link').inputValue();
    assert.match(link, /\/games\/basketball\/#g=[A-Za-z0-9_-]{22}$/);

    // --- guest: a phone opens the link
    const guest = await openPage(await browser.newContext({ ...devices['Pixel 7 landscape'] }), link);
    await Promise.all(
      [host, guest].map((p) =>
        p.waitForFunction(() => window.__online && window.__online.connected && Phaser.GAMES[0].state.current === 'randomstate', null, { timeout: 60000 }),
      ),
    );
    assert.equal(await guest.evaluate(() => location.hash), '', 'secret removed from the address bar');

    // --- the team screen: each side changes its own team, both see both
    await host.waitForTimeout(1200);
    await host.evaluate(() => Phaser.GAMES[0].state.states.randomstate.selectPlayer.changeTeam2());
    await guest.evaluate(() => {
      const p = Phaser.GAMES[0].state.states.randomstate.selectPlayer2;
      p.changeTeam2();
      p.changeTeam2();
      p.onArmature2Click(null, true);
    });
    await host.waitForTimeout(1000);
    const hostSel = await selectionOf(host);
    assert.deepEqual(await selectionOf(guest), hostSel, 'same teams and players on both screens');
    assert.equal(hostSel.players[1], 1, "the guest's choice of player reached the host");
    const guestLocks = await guest.evaluate(() => {
      const st = Phaser.GAMES[0].state.states.randomstate;
      return { leftArrows: st.selectPlayer.btnLeft.visible, rightArrows: st.selectPlayer2.btnLeft.visible, play: st.playBtn.visible };
    });
    assert.deepEqual(guestLocks, { leftArrows: false, rightArrows: true, play: false }, 'the guest only controls the right team');

    // --- the host starts a short match
    // short matches that can't end level (a tie means overtime until someone scores)
    for (const p of [host, guest]) await p.evaluate(() => {
      window.__online.setMatchSeconds(14);
      window.__online.testScore = [6, 0];
    });
    await host.evaluate(() => Phaser.GAMES[0].state.states.randomstate.onPlay());
    await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__online.tick > 170, null, { timeout: 60000 })));

    // the guest's input moves the right team's player on the host's screen
    const before = await host.evaluate(() => window.__online.playerX(1));
    await pressFor(guest, 'ArrowLeft', 900);
    await host.waitForTimeout(400);
    const after = await host.evaluate(() => window.__online.playerX(1));
    assert.ok(before - after > 40, `guest's player moved left on the host's screen (${before} → ${after})`);

    // play with both players pressing keys, part of it over a slow connection
    await guest.evaluate(() => (window.__online.lag = 150));
    const keys = ['ArrowRight', 'ArrowUp', 'KeyX', 'ArrowLeft', 'KeyB', 'ArrowDown', 'KeyV', 'KeyD', 'KeyW'];
    for (let i = 0; i < 12; i++) {
      await Promise.all([pressFor(host, keys[i % keys.length], 220), pressFor(guest, keys[(i * 5 + 2) % keys.length], 260)]);
      if (i === 6) await guest.evaluate(() => (window.__online.lag = 0));
    }

    // --- the match ends on both; the guest waits for the host
    await Promise.all([host, guest].map((p) => waitState(p, 'postmatchstate', 60000)));
    for (const p of [host, guest]) assert.deepEqual(await p.evaluate(() => window.__online.desyncs), [], 'never out of sync');
    assert.deepEqual(await scoreOf(guest), await scoreOf(host), 'same final score');
    await guest.waitForTimeout(800);
    assert.equal(await guest.evaluate(() => Phaser.GAMES[0].state.states.postmatchstate.backBtn.visible), false);

    // --- RESTART on the host: a second match for both
    const firstMatch = await host.evaluate(() => window.__online.matchNo);
    await host.evaluate(() => Phaser.GAMES[0].state.states.postmatchstate.onBack());
    await Promise.all([host, guest].map((p) => p.waitForFunction((n) => window.__online.matchNo > n && window.__online.tick > 80, firstMatch, { timeout: 60000 })));
    await Promise.all([pressFor(host, 'ArrowRight', 600), pressFor(guest, 'ArrowLeft', 600)]);
    await Promise.all([host, guest].map((p) => waitState(p, 'postmatchstate', 60000)));
    for (const p of [host, guest]) assert.deepEqual(await p.evaluate(() => window.__online.desyncs), []);

    // --- NEXT on the host: both back to the team screen
    await host.evaluate(() => Phaser.GAMES[0].state.states.postmatchstate.onNextState());
    await Promise.all([host, guest].map((p) => waitState(p, 'randomstate')));
    assert.equal(await stateOf(guest), 'randomstate');

    assert.deepEqual(host.errors, [], 'no uncaught errors on host');
    assert.deepEqual(guest.errors, [], 'no uncaught errors on guest');
  } finally {
    await browser.close();
    server.stop();
  }
});
