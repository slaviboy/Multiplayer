// Keyboard and touch controls, turned into the simulation's KEY bits.
//
// The original's keys: move A / D or ← / →, jump W or ↑, low kick (shot) T or K,
// high kick (aerial) Y or L. With two players on one keyboard the left player has
// W A D T Y and the right one the arrows, K and L. Alone, either set works.
import { KEY } from './sim.js';

const LEFT_SET = { KeyA: KEY.LEFT, KeyD: KEY.RIGHT, KeyW: KEY.JUMP, KeyT: KEY.SHOT, KeyY: KEY.LOB, KeyS: 0 };
const RIGHT_SET = { ArrowLeft: KEY.LEFT, ArrowRight: KEY.RIGHT, ArrowUp: KEY.JUMP, KeyK: KEY.SHOT, KeyL: KEY.LOB, ArrowDown: 0 };
// extra keys for one player: space jumps; on keyboards where T/Y sit elsewhere the letters still work
const SOLO_EXTRA = { Space: KEY.JUMP };
const BY_LETTER = { a: KEY.LEFT, d: KEY.RIGHT, w: KEY.JUMP, t: KEY.SHOT, y: KEY.LOB, k: KEY.SHOT, l: KEY.LOB };

export const HINTS_SOLO = [
  { side: 0, items: [{ keys: ['A', 'W', 'D'], label: 'Move' }, { keys: ['T'], label: 'Shot' }, { keys: ['Y'], label: 'Aerial' }] },
  { side: 1, items: [{ keys: ['K'], label: 'Shot' }, { keys: ['L'], label: 'Aerial' }, { keys: ['◀', '▲', '▶'], label: 'Move' }] },
];
export const HINTS_TWO = HINTS_SOLO;

export class Controls {
  constructor() {
    this.down = new Set(); // KeyboardEvent.code
    this.letters = new Set(); // KeyboardEvent.key, lower case
    this.touch = 0; // bits held on the touch buttons
    // presses since the game last read the keys: a tap shorter than a tick still counts
    this.latched = new Set();
    this.latchedLetters = new Set();
    this.touchLatched = 0;
    this.enabled = false;
    const onDown = (e) => {
      if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      const known = e.code in LEFT_SET || e.code in RIGHT_SET || e.code in SOLO_EXTRA;
      if (known) e.preventDefault(); // arrows and space must not scroll the page
      this.down.add(e.code);
      if (!e.repeat) this.latched.add(e.code);
      if (e.key && e.key.length === 1) {
        this.letters.add(e.key.toLowerCase());
        if (!e.repeat) this.latchedLetters.add(e.key.toLowerCase());
      }
    };
    const onUp = (e) => {
      this.down.delete(e.code);
      if (e.key && e.key.length === 1) this.letters.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // keys held while the window loses focus never send keyup: let go of everything
    const releaseAll = () => this.releaseAll();
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => document.hidden && releaseAll());
  }

  releaseAll() {
    this.down.clear();
    this.letters.clear();
    this.latched.clear();
    this.latchedLetters.clear();
    this.touch = 0;
    this.touchLatched = 0;
    if (this.pad) for (const b of this.pad.querySelectorAll('.fb-pad-btn')) b.classList.remove('on');
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.releaseAll();
  }

  /** Keys of `map` held now or pressed since the last read (which forgets those presses). */
  bits(map) {
    let b = 0;
    for (const code of this.down) if (code in map) b |= map[code];
    for (const code of this.latched) {
      if (!(code in map)) continue;
      b |= map[code];
      this.latched.delete(code);
    }
    return b;
  }

  /** One player using any of the keys, and the touch buttons. */
  solo() {
    let b = this.bits(LEFT_SET) | this.bits(RIGHT_SET) | this.bits(SOLO_EXTRA) | this.touch | this.touchLatched;
    this.touchLatched = 0;
    for (const l of this.letters) b |= BY_LETTER[l] || 0;
    for (const l of this.latchedLetters) b |= BY_LETTER[l] || 0;
    this.latchedLetters.clear();
    return clean(b);
  }

  /** Two players on one keyboard: side 0 = W A D T Y, side 1 = arrows K L. */
  player(side) {
    return clean(side === 0 ? this.bits(LEFT_SET) : this.bits(RIGHT_SET));
  }

  /** Wires the on-screen buttons (elements with data-key="LEFT" etc.). */
  attachPad(pad) {
    this.pad = pad;
    const held = new Map(); // pointerId -> button
    const update = () => {
      let b = 0;
      for (const btn of held.values()) b |= KEY[btn.dataset.key];
      this.touch = b;
      for (const btn of pad.querySelectorAll('.fb-pad-btn')) btn.classList.toggle('on', [...held.values()].includes(btn));
    };
    const buttonAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && el.closest ? el.closest('.fb-pad-btn') : null;
    };
    pad.addEventListener('pointerdown', (e) => {
      const btn = buttonAt(e.clientX, e.clientY);
      if (!btn) return;
      e.preventDefault();
      held.set(e.pointerId, btn);
      this.touchLatched |= KEY[btn.dataset.key];
      update();
    });
    // sliding a thumb from one button to the next (left ↔ right) switches them
    pad.addEventListener('pointermove', (e) => {
      if (!held.has(e.pointerId)) return;
      const btn = buttonAt(e.clientX, e.clientY);
      if (btn && btn !== held.get(e.pointerId) && btn.dataset.slide === held.get(e.pointerId).dataset.slide) {
        held.set(e.pointerId, btn);
        update();
      }
    });
    const end = (e) => {
      if (held.delete(e.pointerId)) update();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

/** Left and right together cancel out. */
function clean(b) {
  if ((b & KEY.LEFT) && (b & KEY.RIGHT)) b &= ~(KEY.LEFT | KEY.RIGHT);
  return b;
}

export const isTouchDevice = () =>
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 1;
