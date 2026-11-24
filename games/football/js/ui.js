// The screens around a match: menu, player select, versus, pause and result.
// Plain DOM over the canvas; characters are drawn into small canvases.
import { BOOTS, HEADS, JERSEYS, STADIUMS } from './catalog.js';
import { assetUrl, kitImages, loadAll } from './assets.js';
import { drawPortrait } from './render.js';
import { bootsById, cycle, defaultKit, headById, jerseyById, kitName } from './roster.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null && c !== false) node.append(c);
  return node;
}

const icon = (name, cls = 'fb-icon') => el('img', { class: cls, src: assetUrl(`ui/${name}.webp`), alt: '' });

export const STADIUM_NAMES = { sunset: 'Sunset Park', 'favela-day': 'Favela', 'favela-night': 'Favela Night' };
export const LENGTHS = [60, 90, 120];
export const LEVEL_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export class Screens {
  constructor(root, { sound, prefs, savePrefs }) {
    this.root = root;
    this.sound = sound;
    this.prefs = prefs;
    this.savePrefs = savePrefs;
    this.previews = []; // { canvas, kit, flip }
    this.current = null;
  }

  click() {
    this.sound.unlock();
    this.sound.play('click', { volume: 0.6 });
  }

  show(node, name) {
    if (this.node) this.node.remove();
    this.current = name;
    this.node = node;
    this.root.append(node);
    this.previews = this.previews.filter((p) => p.canvas.isConnected); // the ones on this screen
    const first = node.querySelector('[autofocus]') || node.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  hide() {
    if (this.node) this.node.remove();
    this.node = null;
    this.current = null;
    this.previews = [];
  }

  button(label, onClick, kind = 'orange', { icon: iconName, ...extra } = {}) {
    return el('button', {
      class: `fb-btn fb-btn-${kind}`,
      type: 'button',
      ...extra,
      onclick: (e) => {
        this.click();
        onClick(e);
      },
    }, [iconName ? icon(iconName) : null, el('span', { text: label })]);
  }

  portrait(kit, { flip = false, cls = 'fb-portrait' } = {}) {
    const canvas = el('canvas', { class: cls, width: 260, height: 300 });
    const entry = { canvas, kit, flip };
    this.previews.push(entry);
    loadAll(kitImages(kit)).then(() => this.animate(performance.now() / 1000));
    return { canvas, entry };
  }

  /** Redraws the idling characters (called every frame). */
  animate(t) {
    for (const p of this.previews) if (p.canvas.isConnected) drawPortrait(p.canvas, p.kit, t, { flip: p.flip });
  }

  toggles() {
    const make = (key, name, label) => {
      const btn = el('button', {
        class: 'fb-round',
        type: 'button',
        'aria-label': label,
        'aria-pressed': String(this.prefs[key] !== false),
        onclick: () => {
          const on = this.prefs[key] === false;
          if (key === 'sound') this.sound.setSfx(on);
          else this.sound.setMusic(on);
          this.savePrefs();
          btn.setAttribute('aria-pressed', String(on));
          this.click();
        },
      }, [icon(name)]);
      return btn;
    };
    return el('div', { class: 'fb-toggles' }, [make('sound', 'icon-sound', 'Sound effects'), make('music', 'icon-music', 'Music')]);
  }

  // ------------------------------------------------------------ menu

  menu({ onCpu, onLocal, onOnline, showLocal }) {
    const help = el('div', { class: 'fb-help', hidden: true }, [
      el('h3', { text: 'How to play' }),
      el('p', { text: 'Score more goals than your opponent before the clock runs out. A draw goes to a golden goal.' }),
      el('ul', {}, [
        el('li', {}, [el('b', { text: 'Move: ' }), 'A / D or ← / →']),
        el('li', {}, [el('b', { text: 'Jump: ' }), 'W or ↑ (head the ball!)']),
        el('li', {}, [el('b', { text: 'Shot (low kick): ' }), 'T or K']),
        el('li', {}, [el('b', { text: 'Aerial (high kick): ' }), 'Y or L']),
        el('li', {}, [el('b', { text: 'Two players on one keyboard: ' }), 'left W A D T Y, right ← ↑ → K L']),
        el('li', {}, [el('b', { text: 'Phone or tablet: ' }), 'buttons on the screen']),
      ]),
      el('p', {}, [
        el('b', { text: 'Power-ups: ' }),
        'after 20–30 seconds fire and ice icons float over the pitch. Hit one with the ball: ' +
          '🔥 fire makes your next shot or header a fireball that knocks the other player over; ' +
          '❄️ ice freezes the other player for 3 seconds (press keys to break free sooner).',
      ]),
      el('p', { class: 'fb-hint', text: 'Headers loop, kicks stay low. Run forward for more power. Get under the ball to lob it.' }),
    ]);
    const node = el('div', { class: 'fb-screen fb-menu' }, [
      el('img', { class: 'fb-logo', src: assetUrl('ui/logo.webp'), alt: 'Goal Heads' }),
      el('div', { class: 'fb-menu-buttons' }, [
        this.button('Play vs CPU', onCpu, 'orange', { icon: 'icon-joystick', 'data-action': 'cpu', autofocus: true }),
        showLocal ? this.button('2 players, one keyboard', onLocal, 'blue', { icon: 'icon-friends', 'data-action': 'local' }) : null,
        this.button('Play online with a friend', onOnline, 'green', { icon: 'icon-chat', 'data-action': 'online' }),
      ]),
      help,
      el('div', { class: 'fb-menu-foot' }, [
        el('a', { class: 'fb-link', href: '../../', text: '← All games' }),
        el('button', {
          class: 'fb-link',
          type: 'button',
          text: 'How to play',
          onclick: () => {
            help.hidden = !help.hidden;
            this.click();
          },
        }),
        this.toggles(),
      ]),
    ]);
    this.show(node, 'menu');
  }

  // ------------------------------------------------------------ player select

  /**
   * @param {object} o
   * @param {string} o.title
   * @param {object} o.kit         starting outfit
   * @param {(kit)=>void} o.onDone
   * @param {()=>void} o.onBack
   * @param {object|null} o.options {stadium, seconds, level?} match options the chooser sets
   * @param {string} o.confirm     label of the confirm button
   * @param {string} [o.side]      'left' | 'right': the colour of the panel
   */
  select({ title, sub = '', kit, onDone, onBack, options = null, confirm = 'Play', side = 'left' }) {
    let current = { ...kit };
    const { canvas, entry } = this.portrait(current);
    const name = el('div', { class: 'fb-kit-name' });
    const shirt = el('span', { class: 'fb-kit-value' });
    const boots = el('span', { class: 'fb-kit-value' });
    const grid = el('div', { class: 'fb-heads', role: 'listbox', 'aria-label': 'Players' });
    const set = (next) => {
      current = next;
      entry.kit = current;
      name.textContent = kitName(current);
      shirt.textContent = jerseyById(current.jersey).name.replace(/ (Home|Away)$/, '');
      boots.textContent = bootsById(current.boots).name;
      for (const b of grid.children) b.setAttribute('aria-selected', String(b.dataset.head === current.head));
      loadAll(kitImages(current)).then(() => this.animate(performance.now() / 1000));
    };
    for (const h of HEADS) {
      grid.append(
        el('button', {
          class: 'fb-head',
          type: 'button',
          role: 'option',
          title: h.name,
          'data-head': h.id,
          onclick: () => {
            this.click();
            set(defaultKit(h.id));
          },
        }, [el('img', { src: assetUrl(`heads/${h.id}.webp`), alt: h.name, loading: 'lazy' })]),
      );
    }
    const arrows = (label, value, list, key) =>
      el('div', { class: 'fb-kit-row' }, [
        el('span', { class: 'fb-kit-label', text: label }),
        el('button', { class: 'fb-arrow', type: 'button', 'aria-label': `Previous ${label.toLowerCase()}`, onclick: () => { this.click(); set({ ...current, [key]: cycle(list, current[key], -1) }); } }, ['◀']),
        value,
        el('button', { class: 'fb-arrow', type: 'button', 'aria-label': `Next ${label.toLowerCase()}`, onclick: () => { this.click(); set({ ...current, [key]: cycle(list, current[key], 1) }); } }, ['▶']),
      ]);
    const random = el('button', {
      class: 'fb-link',
      type: 'button',
      text: '🎲 Random',
      onclick: () => {
        this.click();
        const h = HEADS[Math.floor(Math.random() * HEADS.length)].id;
        set({ ...defaultKit(h), jersey: JERSEYS[Math.floor(Math.random() * JERSEYS.length)].id, boots: BOOTS[Math.floor(Math.random() * BOOTS.length)].id });
      },
    });

    const opts = options ? this.optionsPanel(options) : null;
    const node = el('div', { class: `fb-screen fb-select fb-side-${side}` }, [
      el('div', { class: 'fb-select-head' }, [
        el('button', { class: 'fb-back', type: 'button', 'aria-label': 'Back', onclick: () => { this.click(); onBack(); } }, ['‹']),
        el('div', {}, [el('h2', { class: 'fb-title', text: title }), sub ? el('p', { class: 'fb-sub', text: sub }) : null]),
      ]),
      el('div', { class: 'fb-select-body' }, [
        el('div', { class: 'fb-preview' }, [
          el('div', { class: 'fb-podium' }, [canvas]),
          name,
          arrows('Shirt', shirt, JERSEYS, 'jersey'),
          arrows('Boots', boots, BOOTS, 'boots'),
          random,
        ]),
        el('div', { class: 'fb-select-side' }, [
          grid,
          el('div', { class: 'fb-select-foot' }, [
            opts,
            this.button(confirm, () => onDone({ ...current }), 'green', { class: 'fb-btn fb-btn-green fb-play', 'data-action': 'confirm' }),
          ]),
        ]),
      ]),
    ]);
    this.show(node, 'select');
    set(current);
    const chosen = grid.querySelector('[aria-selected="true"]');
    if (chosen) chosen.scrollIntoView({ block: 'nearest' });
  }

  optionsPanel(options) {
    const group = (label, values, key, text) => {
      const box = el('div', { class: 'fb-opt', role: 'radiogroup', 'aria-label': label }, [el('span', { class: 'fb-opt-label', text: label })]);
      for (const v of values) {
        const b = el('button', {
          class: 'fb-chip',
          type: 'button',
          role: 'radio',
          'aria-checked': String(options[key] === v),
          'data-value': String(v),
          onclick: () => {
            this.click();
            options[key] = v;
            for (const c of box.querySelectorAll('.fb-chip')) c.setAttribute('aria-checked', String(c === b));
            if (options.onChange) options.onChange(key, v);
          },
        }, [key === 'stadium' ? el('img', { src: assetUrl(`stadiums/${v}.jpg`), alt: '' }) : null, el('span', { text: text(v) })]);
        box.append(b);
      }
      return box;
    };
    return el('div', { class: 'fb-options' }, [
      group('Pitch', STADIUMS, 'stadium', (v) => STADIUM_NAMES[v] || v),
      group('Time', LENGTHS, 'seconds', (v) => `${v / 60 | 0}:${String(v % 60).padStart(2, '0')}`),
      'level' in options ? group('CPU', Object.keys(LEVEL_NAMES), 'level', (v) => LEVEL_NAMES[v]) : null,
      'powerups' in options ? group('Power-ups', [true, false], 'powerups', (v) => (v ? '🔥❄️ On' : 'Off')) : null,
    ]);
  }

  // ------------------------------------------------------------ versus

  /** The blue / orange split screen before a match. `kits[i]` may be null (still choosing). */
  versus({ kits, names, labels = ['', ''], status = '' }) {
    const half = (i) => {
      const kit = kits[i];
      const body = kit ? this.portrait(kit, { flip: i === 1, cls: 'fb-portrait fb-vs-portrait' }).canvas : el('div', { class: 'fb-silhouette' }, [el('span', { class: 'fb-spinner' })]);
      return el('div', { class: `fb-vs-half fb-vs-${i ? 'right' : 'left'}` }, [
        body,
        el('div', { class: 'fb-vs-name', text: kit ? names[i] : 'Choosing…' }),
        labels[i] ? el('div', { class: 'fb-vs-label', text: labels[i] }) : null,
      ]);
    };
    const node = el('div', { class: 'fb-screen fb-versus' }, [
      half(0),
      half(1),
      el('img', { class: 'fb-vs-icon', src: assetUrl('ui/vs.webp'), alt: 'versus' }),
      status ? el('div', { class: 'fb-vs-status', role: 'status', text: status }) : null,
    ]);
    this.show(node, 'versus');
  }

  // ------------------------------------------------------------ pause and result

  pause({ onResume, onRestart, onQuit }) {
    const node = el('div', { class: 'fb-screen fb-dim' }, [
      el('div', { class: 'fb-card' }, [
        el('h2', { class: 'fb-title', text: 'Paused' }),
        el('div', { class: 'fb-card-buttons' }, [
          this.button('Resume', onResume, 'green', { autofocus: true, 'data-action': 'resume' }),
          onRestart ? this.button('Restart', onRestart, 'blue', { 'data-action': 'restart' }) : null,
          this.button('Quit to menu', onQuit, 'orange', { 'data-action': 'quit' }),
        ]),
        this.toggles(),
      ]),
    ]);
    this.show(node, 'pause');
  }

  /** `buttons`: [{label, kind, action, onClick}] */
  result({ title, sub = '', score, kits, names, winner, buttons }) {
    const side = (i) =>
      el('div', { class: `fb-result-side${winner === i ? ' fb-winner' : ''}` }, [
        this.portrait(kits[i], { flip: i === 1, cls: 'fb-portrait fb-result-portrait' }).canvas,
        el('div', { class: 'fb-vs-name', text: names[i] }),
      ]);
    const node = el('div', { class: 'fb-screen fb-dim' }, [
      el('div', { class: 'fb-card fb-result' }, [
        el('h2', { class: 'fb-title fb-big', text: title }),
        sub ? el('p', { class: 'fb-sub', text: sub }) : null,
        el('div', { class: 'fb-result-row' }, [side(0), el('div', { class: 'fb-score', text: `${score[0]} – ${score[1]}` }), side(1)]),
        el('div', { class: 'fb-card-buttons' }, buttons.map((b, i) => this.button(b.label, b.onClick, b.kind || 'orange', { 'data-action': b.action, autofocus: i === 0 }))),
      ]),
    ]);
    this.show(node, 'result');
  }

  loading(progress) {
    if (this.current !== 'loading') {
      this.bar = el('div', { class: 'fb-bar-fill' });
      this.show(el('div', { class: 'fb-screen fb-loading' }, [
        el('img', { class: 'fb-logo', src: assetUrl('ui/logo.webp'), alt: 'Goal Heads' }),
        el('div', { class: 'fb-bar', role: 'progressbar', 'aria-label': 'Loading' }, [this.bar]),
      ]), 'loading');
    }
    this.bar.style.width = `${Math.round(progress * 100)}%`;
  }
}

export { headById };
