// End-to-end: two browsers play Stan & Lisa together through a real invite link.
// Needs Google Chrome and internet access (Trystero uses public Nostr relays for
// signalling). Run with `npm run test:e2e`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_MAP, launchBrowser, openPage, startServer, waitForPlayableLevel, waitForState } from './helpers.mjs';

const GAME = 'games/stan-and-lisa/';

test('host shares a link, guest joins as the other character, and play stays in sync', { timeout: 240_000 }, async () => {
  const server = await startServer();
  const browser = await launchBrowser();
  try {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    // --- host: main menu → "Play online" (real canvas click) → pick Stan → invite
    const host = await openPage(hostCtx, server.url + GAME);
    await waitForState(host, 'menu');
    await host.waitForFunction(() => {
      const m = Phaser.GAMES[0].state.states.menu;
      return m.templeHall && m.templeHall._olBtn;
    });
    await host.waitForTimeout(600); // menu fade-in
    const box = await host.evaluate(() => {
      const b = Phaser.GAMES[0].state.states.menu.templeHall._olBtn.getBounds();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await host.mouse.click(box.x, box.y);
    await host.locator('.ol-char').first().waitFor();
    assert.equal(await host.locator('.ol-char').count(), 2, 'two characters to choose from');
    await host.locator('.ol-char').first().click(); // Stan

    const link = await host.locator('.ol-link').inputValue();
    assert.match(link, /\/games\/stan-and-lisa\/#g=[A-Za-z0-9_-]{22}$/);
    assert.equal(await host.locator('.ol-qr svg path').count(), 1, 'QR code rendered');

    // --- guest opens the link
    const guest = await openPage(guestCtx, link);
    await guest.locator('.ol-overlay').waitFor();
    await Promise.all([
      host.waitForFunction(() => window.__online && window.__online.connected, null, { timeout: 90_000 }),
      guest.waitForFunction(() => window.__online && window.__online.connected && window.__online.myMain, null, {
        timeout: 90_000,
      }),
    ]);
    assert.equal(await host.evaluate(() => window.__online.myMain), 'fb');
    assert.equal(await guest.evaluate(() => window.__online.myMain), 'wg', 'guest automatically gets Lisa');
    assert.equal(await guest.evaluate(() => location.hash), '', 'secret removed from the address bar');

    // --- host picks a level; guest follows
    await host.evaluate(() => {
      const g = Phaser.GAMES[0];
      g.state.states.menu.startTemple(g.progress.get('temples')[0]);
    });
    await host.waitForFunction(() => Phaser.GAMES[0].state.states.levelMenu && !Phaser.GAMES[0].state.fading);
    await host.waitForTimeout(500);
    await host.evaluate(() => {
      const g = Phaser.GAMES[0];
      const lvl = g.progress.get('temples')[0].levels.find((l) => l.filename.endsWith('/small_1.json'));
      g.state.states.levelMenu.startLevel({ data: lvl });
    });
    await Promise.all([waitForPlayableLevel(host), waitForPlayableLevel(guest)]);
    const seq1 = await host.evaluate(() => window.__online.seq);
    assert.equal(await guest.evaluate(() => window.__online.seq), seq1, 'same level session');

    // --- guest moves Lisa; the host sees it
    const lisaX = () => Phaser.GAMES[0].level.pers2.sprite.x;
    const stanX = () => Phaser.GAMES[0].level.pers1.sprite.x;
    const hostLisa0 = await host.evaluate(lisaX);
    await guest.keyboard.down('KeyD');
    await guest.waitForTimeout(700);
    await guest.keyboard.up('KeyD');
    await host.waitForTimeout(500);
    const hostLisa1 = await host.evaluate(lisaX);
    const guestLisa1 = await guest.evaluate(lisaX);
    assert.ok(hostLisa1 - hostLisa0 > 40, `host sees Lisa move right (${hostLisa0} → ${hostLisa1})`);
    assert.ok(Math.abs(hostLisa1 - guestLisa1) < 24, `Lisa agrees on both screens (${hostLisa1} vs ${guestLisa1})`);

    // --- host moves Stan with the *other* key set (A/W/D also drive your own character)
    const guestStan0 = await guest.evaluate(stanX);
    await host.keyboard.down('KeyA');
    await host.waitForTimeout(700);
    await host.keyboard.up('KeyA');
    await guest.waitForTimeout(500);
    const guestStan1 = await guest.evaluate(stanX);
    assert.ok(guestStan0 - guestStan1 > 40, `guest sees Stan move left (${guestStan0} → ${guestStan1})`);
    assert.ok(
      Math.abs((await host.evaluate(lisaX)) - (await guest.evaluate(lisaX))) < 24,
      'Lisa did not move when the host pressed A',
    );

    // --- world snapshot: a body the host moves shows up on the guest
    const moved = await host.evaluate(() => {
      const l = Phaser.GAMES[0].level;
      const b = l._net.bodies && l._net.bodies[0];
      if (!b) return null;
      const p = b.GetPosition();
      b.SetTransformXYRadians(p.x - 0.5, p.y, b.GetAngle());
      return { x: p.x, y: p.y };
    });
    if (moved) {
      await guest.waitForTimeout(400);
      const gp = await guest.evaluate(() => {
        const p = Phaser.GAMES[0].level._net.bodies[0].GetPosition();
        return { x: p.x, y: p.y };
      });
      const hp = await host.evaluate(() => {
        const p = Phaser.GAMES[0].level._net.bodies[0].GetPosition();
        return { x: p.x, y: p.y };
      });
      assert.ok(Math.hypot(gp.x - hp.x, gp.y - hp.y) < 0.6, `world body in sync (${JSON.stringify({ gp, hp })})`);
    }

    // --- chat: an emoji and a typed message show up above the sender on the other screen
    await guest.locator('.ol-hud-chat').click();
    await guest.locator('.ol-chat .ol-chat-btn').first().click(); // emoji picker
    await guest.locator('.ol-emoji', { hasText: '❤️' }).click();
    await host.locator('.ol-bubble', { hasText: '❤️' }).waitFor({ timeout: 10000 });
    await guest.waitForTimeout(400);
    await guest.locator('.ol-chat-input').fill('wait for me <b>here</b>');
    await guest.locator('.ol-chat-input').press('Enter');
    const bubble = host.locator('.ol-bubble', { hasText: 'wait for me' });
    await bubble.waitFor({ timeout: 10000 });
    assert.equal(await bubble.evaluate((n) => n.children.length), 0, 'chat text is not parsed as HTML');
    const lisaScreenX = await host.evaluate(() => {
      const b = Phaser.GAMES[0].level.pers2.sprite.getBounds();
      return b.x + b.width / 2;
    });
    const bubbleX = await bubble.evaluate((n) => n.getBoundingClientRect().left + n.getBoundingClientRect().width / 2);
    assert.ok(Math.abs(bubbleX - lisaScreenX) < 80, `bubble sits above Lisa (${bubbleX} vs ${lisaScreenX})`);
    await guest.locator('.ol-chat .ol-chat-btn', { hasText: '✕' }).click();

    // --- tapping a buddy takes it; tapping your own character takes control back
    const buddy = await host.evaluate(() => {
      const f = Phaser.GAMES[0].level.friends[0];
      return f && f.data.char;
    });
    assert.ok(buddy, 'the level has a buddy');
    await host.evaluate(() => Phaser.GAMES[0].level.friends[0].onTouched());
    assert.equal(await host.evaluate(() => window.__online.controlled), buddy);
    await host.evaluate(() => Phaser.GAMES[0].level.pers1.onTouched());
    assert.equal(await host.evaluate(() => window.__online.controlled), 'fb', 'tap on Stan selects Stan again');

    // --- pause is shared
    await host.evaluate(() => void Phaser.GAMES[0].level.togglePause());
    await guest.waitForFunction(() => Phaser.GAMES[0].paused === true, null, { timeout: 5000 });
    await guest.evaluate(() => void Phaser.GAMES[0].level.togglePause());
    await host.waitForFunction(() => Phaser.GAMES[0].paused === false, null, { timeout: 5000 });

    // --- hiding the tab pauses only that player's game, and a key held when the
    //     tab was left (its keyup goes to the other tab) doesn't stay pressed
    await guest.keyboard.down('KeyD');
    assert.equal(await guest.evaluate(() => !!Phaser.GAMES[0].input.keyboard.isDown('KeyD')), true);
    await guest.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await guest.evaluate(() => Phaser.GAMES[0].paused), true, 'hidden tab pauses locally');
    await host.waitForTimeout(1000);
    assert.equal(await host.evaluate(() => Phaser.GAMES[0].paused), false, 'the partner keeps playing');
    await guest.evaluate(() => {
      delete document.hidden; // back to the prototype getter
      document.dispatchEvent(new Event('visibilitychange'));
      Phaser.GAMES[0].level.togglePause(); // the player presses Resume
    });
    assert.equal(await guest.evaluate(() => Phaser.GAMES[0].paused), false);
    assert.equal(
      await guest.evaluate(() => !!Phaser.GAMES[0].input.keyboard.isDown('KeyD')),
      false,
      'key released when the tab was hidden',
    );
    await guest.keyboard.up('KeyD');
    await host.waitForTimeout(300);
    assert.equal(await host.evaluate(() => Phaser.GAMES[0].paused), false);

    // --- a death ends the level for both; the guest's Retry restarts it for both
    await guest.evaluate(() => void Phaser.GAMES[0].level.pers2.kill());
    await Promise.all([
      host.waitForFunction(() => Phaser.GAMES[0].level.ended && Phaser.GAMES[0].level.GameOverMenu, null, {
        timeout: 15000,
      }),
      guest.waitForFunction(() => Phaser.GAMES[0].level.ended && Phaser.GAMES[0].level.GameOverMenu, null, {
        timeout: 15000,
      }),
    ]);
    await guest.evaluate(() => void Phaser.GAMES[0].level.retry());
    await host.waitForFunction((s) => window.__online.seq > s, seq1, { timeout: 10000 });
    await Promise.all([waitForPlayableLevel(host), waitForPlayableLevel(guest)]);
    assert.equal(await guest.evaluate(() => window.__online.seq), await host.evaluate(() => window.__online.seq));

    // --- both characters reach their doors on the host → both see the win screen
    await host.evaluate(() => {
      const l = Phaser.GAMES[0].level;
      l.door1.isUp = true;
      l.door2.isUp = true;
      l.checkEndGame();
    });
    await Promise.all([waitForState(host, 'endGame', 15000), waitForState(guest, 'endGame', 15000)]);

    // --- host continues to the level map; the guest follows and is told to wait
    await host.evaluate(() => {
      const g = Phaser.GAMES[0];
      g.state.fade('levelMenu', true, false, g.currentTemple);
    });
    await Promise.all([waitForState(host, LEVEL_MAP), waitForState(guest, LEVEL_MAP)]);
    await guest.locator('.ol-banner').waitFor();

    // --- and quitting from inside a level also brings both back
    await host.evaluate(() => {
      const g = Phaser.GAMES[0];
      const lvl = g.progress.get('temples')[0].levels.find((l) => l.filename.endsWith('/small_1.json'));
      g.state.states.levelMenu.startLevel({ data: lvl });
    });
    await Promise.all([waitForPlayableLevel(host), waitForPlayableLevel(guest)]);
    await host.evaluate(() => void Phaser.GAMES[0].level.quit());
    await Promise.all([waitForState(host, LEVEL_MAP), waitForState(guest, LEVEL_MAP)]);

    assert.deepEqual(host.errors, [], 'no uncaught errors on host');
    assert.deepEqual(guest.errors, [], 'no uncaught errors on guest');
  } finally {
    await browser.close();
    server.stop();
  }
});

// Nostr relays compare signal timestamps, so two devices whose clocks disagree
// used to hear each other late or never. Both pages now take the site's clock.
test('players whose device clocks disagree still connect quickly', { timeout: 120_000 }, async () => {
  const server = await startServer();
  const browser = await launchBrowser();
  const skew = (offset) => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + offset;
  };
  try {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    await hostCtx.addInitScript(skew, -3 * 60 * 60 * 1000); // three hours behind
    await guestCtx.addInitScript(skew, 5 * 60 * 1000); // five minutes fast

    const host = await openPage(hostCtx, server.url + GAME);
    await waitForState(host, 'menu');
    assert.ok((await host.evaluate(() => Date.now())) < Date.now() - 2 * 60 * 60 * 1000, 'host clock is skewed');
    await host.waitForFunction(() => {
      const m = Phaser.GAMES[0].state.states.menu;
      return m.templeHall && m.templeHall._olBtn;
    });
    await host.waitForTimeout(600);
    const box = await host.evaluate(() => {
      const b = Phaser.GAMES[0].state.states.menu.templeHall._olBtn.getBounds();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await host.mouse.click(box.x, box.y);
    await host.locator('.ol-char').first().click();
    const link = await host.locator('.ol-link').inputValue();

    const guest = await openPage(guestCtx, link);
    const t0 = Date.now();
    await guest.waitForFunction(() => window.__online && window.__online.connected && window.__online.myMain, null, {
      timeout: 30_000,
    });
    const took = Date.now() - t0;
    assert.ok(took < 15_000, `connected in ${took} ms`);
    assert.deepEqual(host.errors, [], 'no uncaught errors on host');
    assert.deepEqual(guest.errors, [], 'no uncaught errors on guest');
  } finally {
    await browser.close();
    server.stop();
  }
});
