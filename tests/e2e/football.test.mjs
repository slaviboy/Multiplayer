// End-to-end: Goal Heads (games/football) against the CPU, two players on one
// keyboard, on a phone with the touch pad, and online through a real invite link
// (host on a desktop, guest on a phone). Needs Google Chrome; the online test also
// needs internet access (Nostr relays for signalling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devices } from 'playwright-core';
import { launchBrowser, openPage, startServer } from './helpers.mjs';

const GAME = 'games/football/';
const screenOf = (page) => page.evaluate(() => window.__football && window.__football.screen);
const waitScreen = (page, name, timeout = 30000) =>
  page.waitForFunction((n) => window.__football && window.__football.screen === n, name, { timeout });
const waitPhase = (page, phase, timeout = 30000) =>
  page.waitForFunction((p) => window.__football.state && window.__football.state.phase === p, phase, { timeout });
const playerX = (page, side) => page.evaluate((i) => window.__football.state.players[i].x, side);

async function holdKey(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test('against the CPU: pick a player, play, the result, a rematch', { timeout: 120_000 }, async () => {
  const server = await startServer({ base: '/Multiplayer/' });
  const browser = await launchBrowser();
  try {
    const page = await openPage(await browser.newContext({ viewport: { width: 1280, height: 720 } }), server.url + GAME);
    await waitScreen(page, 'menu');
    assert.ok(await page.locator('[data-action="local"]').isVisible(), 'two-player button on a computer');
    await page.click('[data-action="cpu"]');
    await waitScreen(page, 'select');
    // choose a head, then change the shirt and boots
    await page.click('.fb-head[data-head="kylo-mbappy"]');
    await page.click('button[aria-label="Next shirt"]');
    await page.click('button[aria-label="Next boots"]');
    const kit = await page.evaluate(() => ({ ...window.__football.app.kits[0] }));
    await page.evaluate(() => (window.__football.app.options.seconds = 4)); // a short match
    await page.evaluate(() => (window.__football.firstItem = [0.5, 1])); // power-ups at once
    assert.equal(await page.locator('.fb-chip[data-value="true"]').getAttribute('aria-checked'), 'true', 'power-ups on by default');
    await page.click('[data-action="confirm"]');
    await waitScreen(page, 'versus');
    await waitPhase(page, 'play');
    await page.waitForFunction(() => window.__football.state.items.length === 2 && window.__football.state.items.every((i) => i.live), null, { timeout: 10000 });
    const m = await page.evaluate(() => ({ kit: window.__football.app.match.kits[0], mode: window.__football.app.match.mode }));
    assert.equal(m.mode, 'cpu');
    assert.equal(m.kit.head, 'kylo-mbappy');
    assert.notEqual(kit.jersey, 'royal-whites-home', 'the shirt changed from the default');
    assert.equal(await page.locator('#pad').isVisible(), false, 'no touch pad on a computer');

    const x0 = await playerX(page, 0);
    await holdKey(page, 'KeyA', 500);
    assert.ok((await playerX(page, 0)) < x0 - 1, 'A moves the player left');
    const x1 = await playerX(page, 0);
    await holdKey(page, 'ArrowRight', 500);
    assert.ok((await playerX(page, 0)) > x1 + 1, 'alone, the arrows work too');

    // pause and resume
    await page.keyboard.press('Escape');
    await waitScreen(page, 'pause');
    const tick = await page.evaluate(() => window.__football.state.tick);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__football.state.tick), tick, 'paused');
    await page.click('[data-action="resume"]');
    await page.waitForFunction((t) => window.__football.state.tick > t, tick);

    await waitScreen(page, 'result', 60000);
    const end = await page.evaluate(() => ({ phase: window.__football.state.phase, score: window.__football.state.score }));
    assert.equal(end.phase, 'end');
    assert.match(await page.locator('.fb-result .fb-title').textContent(), /You won!|You lost/);
    await page.click('[data-action="again"]');
    await waitScreen(page, 'versus');
    await waitPhase(page, 'intro');
    assert.deepEqual(await page.evaluate(() => window.__football.state.score), [0, 0]);
    assert.deepEqual(page.errors, []);
  } finally {
    await browser.close();
    server.stop();
  }
});

test('two players on one keyboard each move their own player', { timeout: 90_000 }, async () => {
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const page = await openPage(await browser.newContext({ viewport: { width: 1100, height: 650 } }), server.url + GAME);
    await waitScreen(page, 'menu');
    await page.click('[data-action="local"]');
    await waitScreen(page, 'select');
    await page.click('.fb-chip[data-value="false"]'); // power-ups off
    await page.click('[data-action="confirm"]'); // player 1
    await page.waitForFunction(() => document.querySelector('.fb-select.fb-side-right'));
    await page.click('.fb-head[data-head="mo-salaro"]');
    await page.click('[data-action="confirm"]'); // player 2
    await waitPhase(page, 'play');
    const [a0, b0] = [await playerX(page, 0), await playerX(page, 1)];
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('ArrowRight');
    assert.ok((await playerX(page, 0)) > a0 + 0.8, 'D moves the left player');
    assert.ok((await playerX(page, 1)) > b0 + 0.8, '→ moves the right player');
    assert.equal(await page.evaluate(() => window.__football.app.match.names[1]), 'Mo Salaro');
    assert.deepEqual(await page.evaluate(() => window.__football.state.items), [], 'power-ups switched off');
    assert.deepEqual(page.errors, []);
  } finally {
    await browser.close();
    server.stop();
  }
});

test('on a phone the touch pad plays', { timeout: 90_000 }, async () => {
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const page = await openPage(await browser.newContext({ ...devices['Pixel 7 landscape'] }), server.url + GAME);
    await waitScreen(page, 'menu');
    assert.equal(await page.locator('[data-action="local"]').count(), 0, 'no one-keyboard mode on a phone');
    await page.tap('[data-action="cpu"]');
    await waitScreen(page, 'select');
    await page.tap('[data-action="confirm"]');
    await waitPhase(page, 'play');
    assert.ok(await page.locator('#pad').isVisible());
    const box = await page.locator('#pad [data-key="LEFT"]').boundingBox();
    const x0 = await playerX(page, 0);
    // hold the left button with a real touch (pointer events)
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await playerX(page, 0)) < x0 - 1, 'the left button moves the player');
    const jumped = page.evaluate(
      () =>
        new Promise((resolve) => {
          const until = performance.now() + 2000;
          (function poll() {
            if (window.__football.state.players[0].y > 0.5) resolve(true);
            else if (performance.now() > until) resolve(false);
            else requestAnimationFrame(poll);
          })();
        }),
    );
    await page.tap('#pad [data-key="JUMP"]');
    assert.ok(await jumped, 'the jump button jumps');
    assert.deepEqual(page.errors, []);
  } finally {
    await browser.close();
    server.stop();
  }
});

test('online: a phone joins through the invite link, both play the same match, chat, rematch', { timeout: 300_000 }, async () => {
  const server = await startServer({ base: '/Multiplayer/' });
  const browser = await launchBrowser();
  try {
    // --- host: menu → online → choose → invite
    const host = await openPage(await browser.newContext({ viewport: { width: 1280, height: 720 } }), server.url + GAME);
    await waitScreen(host, 'menu');
    await host.click('[data-action="online"]');
    await waitScreen(host, 'select');
    await host.click('.fb-head[data-head="harvin-cane"]');
    await host.evaluate(() => (window.__football.app.options.seconds = 12));
    await host.evaluate(() => (window.__football.testScore = [3, 0])); // so the short match can't end level (both pages)
    await host.evaluate(() => (window.__football.firstItem = [2, 3])); // power-ups soon (the host sends it)
    await host.click('[data-action="confirm"]');
    const link = await host.locator('.ol-link').inputValue();
    assert.match(link, /\/games\/football\/#g=[A-Za-z0-9_-]{22}$/);

    // --- guest: a phone opens the link, picks a player, says ready
    const guest = await openPage(await browser.newContext({ ...devices['Pixel 7 landscape'] }), link);
    await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__football.online.connected, null, { timeout: 90000 })));
    assert.equal(await guest.evaluate(() => location.hash), '', 'secret removed from the address bar');
    await waitScreen(guest, 'select');
    await guest.evaluate(() => (window.__football.testScore = [3, 0]));
    await guest.tap('.fb-head[data-head="lamio-yamaro"]');
    await guest.tap('[data-action="confirm"]');

    // --- both in the same match
    await Promise.all([host, guest].map((p) => waitPhase(p, 'play', 40000)));
    const info = (p) => p.evaluate(() => ({ me: window.__football.online.me, names: window.__football.app.match.names, stadium: window.__football.app.match.stadium }));
    const [hi, gi] = [await info(host), await info(guest)];
    assert.equal(hi.me, 0);
    assert.equal(gi.me, 1);
    assert.deepEqual(hi.names, ['Harvin Cane', 'Lamio Yamaro']);
    assert.deepEqual(gi.names, hi.names);
    assert.equal(gi.stadium, hi.stadium, "the host's pitch");
    assert.ok(await guest.locator('#pad').isVisible(), 'the phone has its touch pad');

    // the power-ups appear in the same places on both screens
    const icons = (p) =>
      p.evaluate(() =>
        window.__football.state.items.every((i) => i.live) ? window.__football.state.items.map((i) => `${i.kind} ${i.x} ${i.y}`) : null,
      );
    await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__football.state.items.every((i) => i.live), null, { timeout: 20000 })));
    assert.deepEqual(await icons(guest), await icons(host));

    // each moves their own player, and both screens agree
    const hx = await playerX(host, 0);
    await holdKey(host, 'KeyD', 600);
    const box = await guest.locator('#pad [data-key="RIGHT"]').boundingBox();
    const cdp = await guest.context().newCDPSession(guest);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await guest.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await host.waitForTimeout(800);
    const sync = async () => {
      // compare the two games at the same tick
      const t = Math.min(await host.evaluate(() => window.__football.state.tick), await guest.evaluate(() => window.__football.state.tick));
      const at = (p) =>
        p.evaluate(
          (tick) =>
            new Promise((resolve) => {
              (function poll() {
                const s = window.__football.state;
                if (s.tick >= tick + 40) resolve({ tick: s.tick, hashes: window.__football.online.desyncs.length });
                else requestAnimationFrame(poll);
              })();
            }),
          t,
        );
      return Promise.all([at(host), at(guest)]);
    };
    await sync();
    assert.ok((await playerX(host, 0)) > hx + 1, 'the host moved right');
    assert.ok((await playerX(guest, 0)) > hx + 1, "the guest's screen shows it too");
    assert.ok((await playerX(guest, 1)) > 5.5 || (await playerX(host, 1)) > 5.5, 'the guest moved right (towards its goal)');

    // chat: a bubble over the sender's head on the other screen
    await host.click('.ol-hud-chat');
    await host.fill('.ol-chat-input', 'Nice goal!');
    await host.press('.ol-chat-input', 'Enter');
    await guest.waitForFunction(() => [...document.querySelectorAll('.ol-bubble')].some((b) => b.textContent === 'Nice goal!'), null, { timeout: 15000 });

    // --- the end, then both ask for a rematch
    await Promise.all([host, guest].map((p) => waitScreen(p, 'result', 90000)));
    const finals = await Promise.all([host, guest].map((p) => p.evaluate(() => ({ score: window.__football.state.score, tick: window.__football.state.tick }))));
    assert.deepEqual(finals[0].score, finals[1].score, 'same final score');
    assert.deepEqual(await host.evaluate(() => window.__football.online.desyncs), []);
    assert.deepEqual(await guest.evaluate(() => window.__football.online.desyncs), []);
    await host.click('[data-action="again"]');
    await guest.tap('[data-action="again"]');
    await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__football.online.net && window.__football.online.net.no === 2 && window.__football.state.phase === 'play', null, { timeout: 40000 })));
    assert.deepEqual(host.errors, []);
    assert.deepEqual(guest.errors, []);
  } finally {
    await browser.close();
    server.stop();
  }
});
