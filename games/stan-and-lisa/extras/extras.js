// Extra level features for Stan & Lisa and Friends, added from outside the
// compiled bundle (js/init.js) by registering new device types and patching
// prototypes through RequireJS, like online/netplay.js does.
//
// Level-wide options (Tiled map properties, written by scripts/build-levels.mjs):
//   darkness: 'dark'    the level is black; every character carries a circle of light
//   darkness: 'reveal'  fog of war: the level starts black and stays revealed
//                       wherever a character (or a lit torch) has been
//   lightRadius: <px>   radius of each character's light in dark levels
//   piggyback: true     Stan and Lisa can stand on each other's heads
//
// New objects (Objects layer, by `type`):
//   torch      light source; with a `group` it only burns while that group is on
//   monster    patrols a 2-point polyline and kills on touch; with a `group` it
//              is scared (frozen and harmless) while that group is on
//   fireflies  glowing dots that fly along a polyline to show the way; with a
//              `group` they only appear while that group is on
//   thorns     whoever lands on them goes back to their last checkpoint (or start)
//   checkpoint a flag that becomes the respawn point of whoever touches it
//   ladder     hold jump/up to climb; with a `group` it is rolled up until lowered
// Torch, monster, fireflies and ladder are "receivers": they follow the group state like platforms do, so
// online play syncs them through the host's world snapshot.

const ART = {
  ext_torch: 'extras/art/torch.svg',
  ext_flame: 'extras/art/flame.svg',
  ext_glow: 'extras/art/glow.svg',
  ext_firefly: 'extras/art/firefly.svg',
  ext_monster: 'extras/art/monster.svg',
  ext_thorns: 'extras/art/thorns.svg',
  ext_ladder: 'extras/art/ladder.svg',
  ext_checkpoint: 'extras/art/checkpoint.svg',
};

let GAME = null;

const toDict = (props) =>
  Array.isArray(props) ? Object.fromEntries(props.map((p) => [p.name, p.value])) : props || {};

function charsOf(level) {
  const list = [];
  if (level.pers1) list.push(level.pers1);
  if (level.pers2) list.push(level.pers2);
  if (level.friends) list.push(...level.friends);
  return list;
}

function wrap(proto, name, fn) {
  const orig = proto[name];
  proto[name] = function (...args) {
    return fn.call(this, orig, args);
  };
}

function radialLight(bmd, x, y, radius, strength = 1) {
  const c = { x: x + bmd.offset.x, y: y + bmd.offset.y };
  const g = bmd.ctx.createRadialGradient(c.x, c.y, Math.min(20, radius / 4), c.x, c.y, radius);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(0.5, `rgba(255,255,255,${0.35 * strength})`);
  g.addColorStop(1, 'transparent');
  bmd.ctx.globalCompositeOperation = 'lighter';
  bmd.circle(c.x, c.y, radius + 40, g);
}

// ---------------------------------------------------------------- devices

/** Fixture-less static body: lets the camera and checkpoint code treat us like any device. */
function anchorBody(device, game, x, y) {
  const s = game.make.sprite(x, y, 'CharAssets', '_default0000');
  game.layers.underGround.addChild(s);
  game.physics.box2d.enable(s);
  s.body.clearFixtures();
  s.body.data.SetType(window.box2d.b2BodyType.b2_staticBody);
  device.anchorSprite = s;
  device.body = s.body;
}

function receiverSetup(device, game, options) {
  options.properties = options.properties || {};
  const p = options.properties;
  device.options = options;
  device.signal = null; // a receiver, not a trigger
  device.hasGroup = p.group != null;
  device.state = device.hasGroup ? +(p.initialState || 0) : 0;
  if (device.hasGroup) game.MechManager.registerDevice(device);
}

// The classes extend Phaser.Group, which only exists once RequireJS has run the
// bundle, so they are created on demand.
function makeDevices(P) {
class Torch extends P.Group {
  constructor(game, options) {
    super(game);
    receiverSetup(this, game, options);
    const p = options.properties;
    this.radius = +p.radius || 260;
    this.cx = options.x + (options.width || 32) / 2;
    this.cy = options.y + (options.height || 64) / 2;
    const layer = game.layers.underGround;
    this.stick = game.make.image(this.cx, this.cy - 8, 'ext_torch');
    this.stick.anchor.set(0.5, 0.25);
    this.glow = game.make.image(this.cx, this.cy - 14, 'ext_glow');
    this.glow.anchor.set(0.5);
    this.glow.scale.set(1.6);
    this.glow.blendMode = window.Phaser.blendModes.ADD;
    this.flame = game.make.image(this.cx, this.cy - 4, 'ext_flame');
    this.flame.anchor.set(0.5, 0.95);
    this.flame.scale.set(0.8);
    layer.addChild(this.glow);
    layer.addChild(this.stick);
    layer.addChild(this.flame);
    anchorBody(this, game, this.cx, this.cy);
    this.t = Math.random() * 10;
    this.updateState();
  }

  get lit() {
    return this.hasGroup ? !!this.state : true;
  }

  update() {
    if (!this.game) return;
    this.t += Math.min(0.05, this.game.time.elapsed / 1000);
    if (this.lit) {
      const f = 1 + 0.08 * Math.sin(this.t * 11) + 0.05 * Math.sin(this.t * 17.3);
      this.flame.scale.set(0.8 * (2 - f), 0.8 * f);
      this.glow.alpha = 0.6 + 0.12 * Math.sin(this.t * 7);
      const fog = this.game.level && this.game.level._fog;
      if (fog && !this.revealed) {
        fog.reveal(this.cx, this.cy, this.radius);
        this.revealed = true;
      }
    }
  }

  _updateState() {
    this.updateState();
  }

  updateState() {
    if (!this.flame) return;
    this.flame.visible = this.lit;
    this.glow.visible = this.lit;
  }

  drawDarkMask(bmd) {
    if (this.lit) radialLight(bmd, this.cx, this.cy - 10, this.radius);
  }

  sounds() {
    return [];
  }

  destroy(...args) {
    [this.stick, this.flame, this.glow, this.anchorSprite].forEach((s) => s && s.destroy());
    if (this.body) this.body.destroy();
    return super.destroy(...args);
  }
}

class Monster extends P.Group {
  constructor(game, options) {
    super(game);
    receiverSetup(this, game, options);
    const p = options.properties;
    const pts = options.polyline && options.polyline.length ? options.polyline : [[0, 0], [0, 0]];
    this.ax = options.x + pts[0][0];
    this.bx = options.x + pts[pts.length - 1][0];
    this.footY = options.y + pts[0][1];
    this.speed = (+p.speed || 2.5) * 32;
    this.pause = 0.5;
    this.pathLen = Math.abs(this.bx - this.ax);
    this.t = +p.phase || 0;
    this.sprite = game.make.image(this.ax, this.footY + 2, 'ext_monster');
    this.sprite.anchor.set(0.5, 1);
    game.layers.chars.addChild(this.sprite);
    anchorBody(this, game, this.ax, this.footY - 30);
    this.x0 = this.ax;
  }

  get scared() {
    return this.hasGroup && !!this.state;
  }

  positionAt(t) {
    if (this.pathLen < 1) return { x: this.ax, dir: 1 };
    const travel = this.pathLen / this.speed;
    const period = 2 * (travel + this.pause);
    const u = ((t % period) + period) % period;
    const sign = this.bx >= this.ax ? 1 : -1;
    if (u < this.pause) return { x: this.ax, dir: sign };
    if (u < this.pause + travel) return { x: this.ax + sign * (u - this.pause) * this.speed, dir: sign };
    if (u < 2 * this.pause + travel) return { x: this.bx, dir: -sign };
    return { x: this.bx - sign * (u - 2 * this.pause - travel) * this.speed, dir: -sign };
  }

  update() {
    const game = this.game;
    const level = game && game.level;
    if (!level || !level.loadCompleted || !this.sprite) return;
    const running = !game.physics.box2d.paused && !level.ended;
    if (running && !this.scared) this.t += Math.min(0.05, game.time.elapsed / 1000);
    const { x, dir } = this.positionAt(this.t);
    this.x0 = x;
    this.sprite.x = x;
    this.sprite.scale.x = dir < 0 ? -1 : 1;
    this.sprite.scale.y = 1 + 0.05 * Math.sin(game.time.now / 90);
    this.sprite.tint = this.scared ? 0x9d8cff : 0xffffff;
    this.sprite.alpha = this.scared ? 0.55 : 1;
    if (this.body) this.body.x = x;
    if (!running || this.scared) return;
    for (const ch of charsOf(level)) {
      if (ch.dying || !ch.sprite) continue;
      const dx = Math.abs(ch.sprite.x - x);
      const dy = Math.abs(ch.sprite.y - (this.footY - 26));
      if (dx < 34 && dy < 44) ch.kill();
    }
  }

  _updateState() {}

  updateState() {}

  drawDarkMask(bmd) {
    // its glowing eyes are always visible, so players can see it coming
    radialLight(bmd, this.x0, this.footY - 30, 70, this.scared ? 0.5 : 0.9);
  }

  sounds() {
    return [];
  }

  destroy(...args) {
    [this.sprite, this.anchorSprite].forEach((s) => s && s.destroy());
    if (this.body) this.body.destroy();
    return super.destroy(...args);
  }
}

class Fireflies extends P.Group {
  constructor(game, options) {
    super(game);
    receiverSetup(this, game, options);
    const p = options.properties;
    const pts = (options.polyline && options.polyline.length ? options.polyline : [[0, 0]]).map(([x, y]) => ({
      x: options.x + x,
      y: options.y + y,
    }));
    this.points = pts;
    this.lengths = [];
    this.pathLength = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      this.lengths.push(l);
      this.pathLength += l;
    }
    this.flyCount = +p.count || 7;
    this.speed = (+p.speed || 2.4) * 32;
    this.spacing = 26;
    this.t = 0;
    this.flies = [];
    for (let i = 0; i < this.flyCount; i++) {
      const s = game.make.image(pts[0].x, pts[0].y, 'ext_firefly');
      s.anchor.set(0.5);
      s.blendMode = window.Phaser.blendModes.ADD;
      s.visible = false;
      game.layers.overChars.addChild(s);
      this.flies.push(s);
    }
    anchorBody(this, game, pts[0].x, pts[0].y);
  }

  get shown() {
    return this.hasGroup ? !!this.state : true;
  }

  pointAt(d) {
    let rest = Math.max(0, Math.min(this.pathLength, d));
    for (let i = 0; i < this.lengths.length; i++) {
      if (rest <= this.lengths[i] || i === this.lengths.length - 1) {
        const k = this.lengths[i] ? rest / this.lengths[i] : 0;
        const a = this.points[i];
        const b = this.points[i + 1];
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      rest -= this.lengths[i];
    }
    return this.points[0];
  }

  update() {
    if (!this.game || !this.flies.length) return;
    this.t += Math.min(0.05, this.game.time.elapsed / 1000);
    const cycle = this.pathLength + this.flyCount * this.spacing + 96;
    const lead = (this.t * this.speed) % cycle;
    const fog = this.game.level && this.game.level._fog;
    this.flies.forEach((s, i) => {
      const d = lead - i * this.spacing;
      if (!this.shown || d < 0 || d > this.pathLength || this.pathLength === 0) {
        s.visible = false;
        return;
      }
      const p = this.pointAt(d);
      const w = this.t * 3 + i * 1.7;
      s.x = p.x + Math.sin(w) * 7;
      s.y = p.y + Math.cos(w * 1.3) * 6;
      s.visible = true;
      const edge = Math.min(d, this.pathLength - d);
      s.alpha = Math.min(1, edge / 48) * (0.75 + 0.25 * Math.sin(w * 2));
      if (fog && i === 0 && Math.random() < 0.25) fog.reveal(s.x, s.y, 52);
    });
  }

  _updateState() {}

  updateState() {}

  drawDarkMask(bmd) {
    for (const s of this.flies) if (s.visible) radialLight(bmd, s.x, s.y, 60, 0.8 * s.alpha);
  }

  sounds() {
    return [];
  }

  destroy(...args) {
    this.flies.forEach((s) => s.destroy());
    this.flies = [];
    if (this.anchorSprite) this.anchorSprite.destroy();
    if (this.body) this.body.destroy();
    return super.destroy(...args);
  }
}

// Thorns don't kill: whoever lands on them is sent back to their last checkpoint
// (or their start), and the other player waits for them.
class Thorns extends P.Group {
  constructor(game, options) {
    super(game);
    options.properties = options.properties || {};
    this.options = options;
    this.signal = null;
    this.state = 0;
    this.rect = { x: options.x, y: options.y, w: options.width, h: options.height };
    this.strip = game.make.tileSprite(this.rect.x, this.rect.y + this.rect.h - 28, this.rect.w, 28, 'ext_thorns');
    game.layers.overGround.addChild(this.strip);
    anchorBody(this, game, this.rect.x + this.rect.w / 2, this.rect.y + this.rect.h / 2);
  }

  update() {
    const level = this.game && this.game.level;
    if (!level || !level.loadCompleted || level.ended || this.game.physics.box2d.paused) return;
    const bottom = this.rect.y + this.rect.h;
    for (const ch of charsOf(level)) {
      if (ch.dying || !ch.sprite || !ownsChar(ch)) continue;
      const feet = ch.sprite.y + 34;
      const inX = ch.sprite.x > this.rect.x - 6 && ch.sprite.x < this.rect.x + this.rect.w + 6;
      if (inX && feet > bottom - 22 && feet < bottom + 14) respawn(ch);
    }
  }

  _updateState() {}

  updateState() {}

  sounds() {
    return [];
  }

  destroy(...args) {
    [this.strip, this.anchorSprite].forEach((s) => s && s.destroy());
    if (this.body) this.body.destroy();
    return super.destroy(...args);
  }
}

// A flag on the floor: touching it moves your respawn point here. It takes the
// colour of whoever reached it (gold once both have).
class Checkpoint extends P.Group {
  constructor(game, options) {
    super(game);
    options.properties = options.properties || {};
    this.options = options;
    this.signal = null;
    this.state = 0;
    this.cx = options.x + (options.width || 32) / 2;
    this.floorY = options.y + (options.height || 32);
    this.flag = game.make.image(this.cx, this.floorY + 2, 'ext_checkpoint');
    this.flag.anchor.set(0.2, 1);
    this.flag.alpha = 0.85;
    game.layers.underGround.addChild(this.flag);
    anchorBody(this, game, this.cx, this.floorY - 32);
    this.reached = {};
  }

  update() {
    const level = this.game && this.game.level;
    if (!level || !level.loadCompleted || !this.flag) return;
    for (const ch of charsOf(level)) {
      if (ch.dying || !ch.sprite) continue;
      if (Math.abs(ch.sprite.x - this.cx) < 40 && Math.abs(ch.sprite.y - (this.floorY - 34)) < 50) {
        ch._respawn = { x: this.cx, y: this.floorY - 34 };
        const id = ch.data.char;
        if (!this.reached[id]) {
          this.reached[id] = true;
          const both = this.reached.fb && this.reached.wg;
          this.flag.tint = both ? 0xffd34d : id === 'fb' ? 0xff8a3d : id === 'wg' ? 0x4db8ff : 0xb6f23c;
          this.flag.alpha = 1;
        }
      }
    }
  }

  _updateState() {}

  updateState() {}

  sounds() {
    return [];
  }

  destroy(...args) {
    [this.flag, this.anchorSprite].forEach((s) => s && s.destroy());
    if (this.body) this.body.destroy();
    return super.destroy(...args);
  }
}

// Hold jump/up to climb; let go to slide down slowly. With a group the ladder is
// rolled up until a switch lowers it.
class Ladder extends P.Group {
  constructor(game, options) {
    super(game);
    receiverSetup(this, game, options);
    this.rect = { x: options.x, y: options.y, w: options.width || 32, h: options.height || 64 };
    this.tile = game.make.tileSprite(this.rect.x, this.rect.y, this.rect.w, this.rect.h, 'ext_ladder');
    game.layers.underGround.addChild(this.tile);
    anchorBody(this, game, this.rect.x + this.rect.w / 2, this.rect.y + this.rect.h / 2);
    this.frac = this.lowered ? 1 : 0;
    this.draw();
  }

  get lowered() {
    return this.hasGroup ? !!this.state : true;
  }

  draw() {
    this.tile.height = Math.max(1, this.rect.h * this.frac);
    this.tile.visible = this.frac > 0.02;
  }

  update() {
    const game = this.game;
    const level = game && game.level;
    if (!level || !level.loadCompleted || !this.tile) return;
    const target = this.lowered ? 1 : 0;
    if (this.frac !== target) {
      const step = Math.min(0.05, game.time.elapsed / 1000) * 2.5;
      this.frac = target > this.frac ? Math.min(target, this.frac + step) : Math.max(target, this.frac - step);
      this.draw();
    }
    if (game.physics.box2d.paused || level.ended) return;
    const usable = this.lowered && this.frac > 0.98;
    const cx = this.rect.x + this.rect.w / 2;
    for (const ch of charsOf(level)) {
      if (!ch.sprite || ch.dying || !ownsChar(ch)) continue;
      const inside =
        usable &&
        Math.abs(ch.sprite.x - cx) < 22 &&
        ch.sprite.y > this.rect.y - 60 &&
        ch.sprite.y < this.rect.y + this.rect.h + 8;
      if (!inside) {
        if (ch._ladder === this) ch._ladder = null;
        continue;
      }
      const up = ch.cursors && ch.cursors.up && ch.cursors.up.isDown;
      if (up) {
        ch.prohibitJump = true; // climbing, not jumping
        ch.body.velocity.y = -150;
        ch._ladder = this;
        // keep a climber centred so they fit through 1-tile holes, unless they steer
        const steer = ch.cursors.left.isDown || ch.cursors.right.isDown;
        if (!steer) ch.body.velocity.x = Math.max(-140, Math.min(140, (cx - ch.sprite.x) * 8));
      } else if (ch._ladder === this) {
        ch.body.velocity.y = Math.min(ch.body.velocity.y, 70);
      }
    }
  }

  _updateState() {}

  updateState() {}

  sounds() {
    return [];
  }

  destroy(...args) {
    [this.tile, this.anchorSprite].forEach((s) => s && s.destroy());
    if (this.body) this.body.destroy();
    return super.destroy(...args);
  }
}

return { Torch, Monster, Fireflies, Thorns, Checkpoint, Ladder };
}

/** Online play: only the browser that controls a character moves it (true when offline). */
function ownsChar(ch) {
  const online = window.__online;
  return !online || typeof online.owns !== 'function' || online.owns(ch.data && ch.data.char);
}

function respawn(ch) {
  const now = ch.game.time.now;
  if (!ch._respawn || (ch._respawnedAt && now - ch._respawnedAt < 600)) return;
  ch._respawnedAt = now;
  ch.body.x = ch._respawn.x;
  ch.body.y = ch._respawn.y;
  ch.body.velocity.x = 0;
  ch.body.velocity.y = 0;
  ch.body.data.SetAwake(true); // a moved body that was asleep would hang in the air
  if (ch.runForce) ch.currentRunForce = 0.475 * ch.runForce;
  ch.sprite.alpha = 0.15;
  ch.game.add.tween(ch.sprite).to({ alpha: 1 }, 600, 'Linear', true);
  try {
    ch.game.level.sounds.charToggle1.play();
  } catch {
    /* sound not loaded */
  }
}

// ---------------------------------------------------------------- fog of war

class Fog {
  constructor(level) {
    const game = level.game;
    this.level = level;
    this.scale = 4;
    const w = Math.ceil((level.size.width + 64) / this.scale);
    const h = Math.ceil((level.size.height + 64) / this.scale);
    this.bmd = game.make.bitmapData(w, h);
    this.bmd.ctx.fillStyle = '#000';
    this.bmd.ctx.fillRect(0, 0, w, h);
    this.bmd.dirty = true;
    this.sprite = game.make.sprite(-32, -32, this.bmd);
    this.sprite.scale.set(this.scale);
    level.root.addChild(this.sprite);
    this.last = new Map();
    this.radius = 150;
  }

  reveal(px, py, r) {
    const s = this.scale;
    const x = (px + 32) / s;
    const y = (py + 32) / s;
    const R = r / s;
    const ctx = this.bmd.ctx;
    const g = ctx.createRadialGradient(x, y, R * 0.55, x, y, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    this.bmd.dirty = true;
  }

  update() {
    for (const ch of charsOf(this.level)) {
      if (!ch.sprite || ch.isDead) continue;
      const prev = this.last.get(ch);
      const { x, y } = ch.sprite;
      if (!prev || Math.hypot(prev.x - x, prev.y - y) > 10) {
        this.reveal(x, y, this.radius);
        this.last.set(ch, { x, y });
      }
    }
  }

  destroy() {
    this.sprite.destroy();
    this.bmd.destroy();
  }
}

// ---------------------------------------------------------------- patches

function patchLevel(Level) {
  const L = Level.prototype;

  // first thing loadComplete does: read the map-level options
  wrap(L, 'setupLayers', function (orig, args) {
    const raw = this.game.cache.getTilemapData('map');
    this._ext = toDict(raw && raw.data && raw.data.properties);
    return orig.apply(this, args);
  });

  // everyone respawns at their start until they reach a checkpoint
  wrap(L, 'createCharObjects', function (orig, args) {
    const result = orig.apply(this, args);
    for (const ch of charsOf(this)) if (ch.sprite) ch._respawn = { x: ch.sprite.x, y: ch.sprite.y };
    return result;
  });

  wrap(L, 'preloadAudioFiles', function (orig, args) {
    const result = orig.apply(this, args);
    for (const [key, url] of Object.entries(ART)) {
      if (!this.game.cache.checkImageKey(key)) this.game.load.image(key, url);
    }
    return result;
  });

  wrap(L, 'setupDarkness', function (orig, args) {
    const ext = this._ext || {};
    let result;
    if (ext.darkness === 'dark' && this.levelData.type !== 'dark') {
      // borrow the engine's darkness without changing the level's scoring type
      const type = this.levelData.type;
      this.levelData.type = 'dark';
      try {
        result = orig.apply(this, args);
      } finally {
        this.levelData.type = type;
      }
    } else {
      result = orig.apply(this, args);
    }
    if (ext.darkness === 'reveal') {
      this._fog = new Fog(this);
      this._fog.radius = +ext.lightRadius || 150;
      this._fog.update();
    }
    return result;
  });

  wrap(L, 'update', function (orig, args) {
    if (this._fog && this.loadCompleted) this._fog.update();
    return orig.apply(this, args);
  });

  wrap(L, 'shutdown', function (orig, args) {
    try {
      return orig.apply(this, args);
    } finally {
      if (this._fog) this._fog.destroy();
      this._fog = null;
    }
  });
}

function patchCharacters(Character, MainCharacter) {
  // Engine bug fix: the running force is only initialised on a frame with no
  // key held, so a key held through the level intro left the character stuck.
  wrap(Character.prototype, 'update', function (orig, args) {
    if (this.currentRunForce == null && this.runForce) this.currentRunForce = 0.475 * this.runForce;
    return orig.apply(this, args);
  });

  wrap(Character.prototype, 'drawDarkMask', function (orig, args) {
    const level = this.game && this.game.level;
    const radius = level && level._ext && +level._ext.lightRadius;
    if (!radius) return orig.apply(this, args);
    return radialLight(args[0], this.sprite.x, this.sprite.y, radius);
  });

  // piggyback: a one-way top on Stan's and Lisa's heads, like the fat friend has
  wrap(MainCharacter.prototype, 'createShapes', function (orig, args) {
    const result = orig.apply(this, args);
    const level = this.game && this.game.level;
    if (level && level._ext && level._ext.piggyback) {
      const top = this.makeTrapezoid(0.34, 0.42, 0.72, 0.46, { categoryBits: 257, maskBits: 4353 }, 0, 5);
      // negative group: the two heads never collide with each other (they would wedge
      // together when the characters overlap); feet still land on them
      top.m_filter.groupIndex = -12;
      top.m_userData = 'oneway';
    }
    return result;
  });
}

function init(game) {
  GAME = game;
  const req = window.require;
  const MechManager = req('States/Level/MechManager');
  const { Torch, Monster, Fireflies, Thorns, Checkpoint, Ladder } = makeDevices(window.Phaser);
  MechManager.classNames.torch = Torch;
  MechManager.classNames.monster = Monster;
  MechManager.classNames.fireflies = Fireflies;
  MechManager.classNames.thorns = Thorns;
  MechManager.classNames.checkpoint = Checkpoint;
  MechManager.classNames.ladder = Ladder;
  patchLevel(req('States/Level/Level'));
  patchCharacters(req('States/Level/Characters/Character'), req('States/Level/Characters/MainCharacter'));
  window.__extras = { ready: true };
}

(function waitForGame() {
  const P = window.Phaser;
  const g = P && P.GAMES && P.GAMES[0];
  const req = window.require;
  if (g && g.state && typeof req === 'function' && req.defined && req.defined('States/Level/Level') && window.box2d) {
    init(g);
  } else {
    setTimeout(waitForGame, 30);
  }
})();

export { GAME };
