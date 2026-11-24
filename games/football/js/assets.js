// Images, sounds and saved preferences.
import { SOUNDS } from './catalog.js';

const BASE = new URL('../assets/', import.meta.url);
export const assetUrl = (path) => new URL(path, BASE).href;

// ------------------------------------------------------------------ images

const pending = new Map(); // path -> Promise<HTMLImageElement>
const ready = new Map(); // path -> HTMLImageElement (for drawing)

export function loadImage(path) {
  let p = pending.get(path);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        ready.set(path, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`could not load ${path}`));
      img.src = assetUrl(path);
    });
    pending.set(path, p);
  }
  return p;
}

/** The image if it has loaded, else null (drawing code skips it). */
export const img = (path) => ready.get(path) || null;

export const CORE_IMAGES = [
  'sprites/ball.webp',
  'sprites/golden-ball.webp',
  'sprites/shadow.webp',
  'sprites/goal-back.webp',
  'sprites/goal-front.webp',
  'sprites/dust.webp',
  'necks/dark.webp',
  'necks/soft.webp',
  'ui/goal.webp',
  'ui/match-starts.webp',
  'ui/final-whistle.webp',
  // power-ups
  'ui/icon-shot.webp',
  'sprites/ice-1.webp',
  'sprites/ice-2.webp',
  'sprites/ice-3.webp',
  'sprites/ice-shards.webp',
  'sprites/fire.webp',
  'sprites/ring.webp',
  'sprites/star.webp',
];

/** Paths of the images a kit (head, jersey, boots) needs. */
export function kitImages(kit) {
  return [`heads/${kit.head}.webp`, `jerseys/${kit.jersey}.webp`, `boots/${kit.boots}.webp`];
}

export function loadAll(paths, onProgress) {
  let done = 0;
  return Promise.all(
    paths.map((p) =>
      loadImage(p)
        .catch((err) => console.warn('[football]', err.message))
        .finally(() => onProgress && onProgress(++done / paths.length)),
    ),
  );
}

// ------------------------------------------------------------------ preferences

const PREFS_KEY = 'football:prefs';

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked: preferences last until the page closes */
  }
}

// ------------------------------------------------------------------ sound

export class Sound {
  constructor(prefs) {
    this.prefs = prefs;
    this.ctx = null;
    this.buffers = new Map();
    this.music = null;
    this.wantMusic = false;
  }

  get sfxOn() {
    return this.prefs.sound !== false;
  }

  get musicOn() {
    return this.prefs.music !== false;
  }

  /** Browsers start audio only after a click or key press; call this from one. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      for (const name of SOUNDS) if (name !== 'menu-music') this.load(name);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.wantMusic) this.playMusic();
  }

  async load(name) {
    try {
      const res = await fetch(assetUrl(`sounds/${name}.m4a`));
      const data = await res.arrayBuffer();
      const buf = await new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject));
      this.buffers.set(name, buf);
    } catch {
      /* this browser can't decode AAC: that sound stays silent */
    }
  }

  /** Plays a sound; `name` may end in a dash to pick one of name-1, name-2, … at random. */
  play(name, { volume = 1, rate = 1 } = {}) {
    if (!this.ctx || !this.sfxOn || document.hidden) return;
    let key = name;
    if (name.endsWith('-')) {
      const options = SOUNDS.filter((s) => s.startsWith(name) && /\d$/.test(s));
      key = options[Math.floor(Math.random() * options.length)];
    }
    const buf = this.buffers.get(key);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(g).connect(this.gain);
    src.start();
  }

  playMusic() {
    this.wantMusic = true;
    if (!this.musicOn || !this.ctx) return;
    if (!this.music) {
      this.music = new Audio(assetUrl('sounds/menu-music.m4a'));
      this.music.loop = true;
      this.music.volume = 0.45;
    }
    this.music.play().catch(() => {});
  }

  stopMusic() {
    this.wantMusic = false;
    if (this.music) this.music.pause();
  }

  setSfx(on) {
    this.prefs.sound = on;
  }

  setMusic(on) {
    this.prefs.music = on;
    if (!on && this.music) this.music.pause();
    else if (on && this.wantMusic) this.playMusic();
  }
}
