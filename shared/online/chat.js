// In-game chat for online play: a small bar with a text field, an emoji picker
// and Send. Messages appear as speech bubbles above the sender's character
// (the game supplies screen positions), or as a short notice outside a level.
// Text is always rendered with textContent, never as HTML.

export const EMOJIS = [
  '❤️', '😍', '😘', '💋', '🥰', '💖', '😂', '😊', '😉', '😎', '👍', '👏',
  '🎉', '🙌', '💪', '🤝', '👋', '🙏', '😮', '🤔', '😢', '😡', '🔥', '💧',
  '⭐', '💯', '🏆', '🙈', '👀', '➡️', '⬅️', '⬆️',
];

export const MAX_CHAT_LENGTH = 80;
const BUBBLE_MS = 4500;

/** Trims, drops control characters, and limits the length; returns '' when nothing is left. */
export function cleanChatText(text) {
  if (typeof text !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return [...text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()].slice(0, MAX_CHAT_LENGTH).join('');
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

export class Chat {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root            where the chat UI lives (the lobby root)
   * @param {(key:string, vars?:object)=>string} o.t   translator
   * @param {(text:string)=>void} o.onSend  send to the other player
   * @param {(who:string)=>{x:number,y:number}|null} o.anchorFor  screen point above a character, or null
   * @param {(who:string)=>string} o.nameOf  display name for notices
   */
  constructor({ root, t, onSend, anchorFor, nameOf }) {
    this.root = root;
    this.t = t;
    this.onSend = onSend;
    this.anchorFor = anchorFor;
    this.nameOf = nameOf;
    this.bubbles = new Map();
    this.lastSent = 0;
    this.enabled = false;
    this.frame = this.frame.bind(this);
    this.onKey = (e) => {
      if (!this.enabled || this.bar || e.key !== 'Enter' || e.repeat) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.querySelector('.ol-overlay')) return;
      e.preventDefault();
      this.open();
    };
    window.addEventListener('keydown', this.onKey);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.close();
  }

  open() {
    if (this.bar) return this.input.focus();
    const stop = (e) => e.stopPropagation(); // keep typing away from the game's keys
    this.input = el('input', {
      class: 'ol-chat-input',
      type: 'text',
      maxlength: String(MAX_CHAT_LENGTH),
      placeholder: this.t('say_something'),
      'aria-label': this.t('chat'),
      enterkeyhint: 'send',
      onkeydown: (e) => {
        stop(e);
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submit(this.input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      },
      onkeyup: stop,
      onkeypress: stop,
    });
    this.picker = el('div', { class: 'ol-emoji-grid', role: 'listbox', hidden: true, 'aria-label': this.t('emoji') },
      EMOJIS.map((emoji) =>
        el('button', {
          class: 'ol-emoji',
          type: 'button',
          text: emoji,
          'aria-label': emoji,
          onclick: () => this.submit(emoji),
        }),
      ),
    );
    const emojiBtn = el('button', {
      class: 'ol-chat-btn',
      type: 'button',
      text: '😊',
      'aria-label': this.t('emoji'),
      'aria-expanded': 'false',
      onclick: () => {
        this.picker.hidden = !this.picker.hidden;
        emojiBtn.setAttribute('aria-expanded', String(!this.picker.hidden));
      },
    });
    this.bar = el('div', { class: 'ol-chat', role: 'dialog', 'aria-label': this.t('chat') }, [
      this.picker,
      el('div', { class: 'ol-chat-row' }, [
        emojiBtn,
        this.input,
        el('button', { class: 'ol-chat-send', type: 'button', text: this.t('send'), onclick: () => this.submit(this.input.value) }),
        el('button', { class: 'ol-chat-btn', type: 'button', text: '✕', 'aria-label': this.t('close'), onclick: () => this.close() }),
      ]),
    ]);
    this.root.append(this.bar);
    this.input.focus({ preventScroll: true });
  }

  close() {
    if (this.bar) this.bar.remove();
    this.bar = this.input = this.picker = null;
  }

  toggle() {
    if (this.bar) this.close();
    else this.open();
  }

  submit(raw) {
    const text = cleanChatText(raw);
    if (!text) return;
    const now = performance.now();
    if (now - this.lastSent < 250) return; // no spamming (the text stays in the field)
    this.lastSent = now;
    this.onSend(text);
    if (this.input) this.input.value = '';
    if (this.picker) this.picker.hidden = true;
  }

  /** Shows `text` from `who` (a character id) as a bubble, or a notice outside a level. */
  show(who, rawText) {
    const text = cleanChatText(rawText);
    if (!text) return;
    if (!this.anchorFor(who)) {
      const notice = el('div', { class: 'ol-toast ol-chat-notice', role: 'status' }, [
        el('strong', { text: `${this.nameOf(who)}: ` }),
        el('span', { text }),
      ]);
      this.root.append(notice);
      setTimeout(() => notice.classList.add('ol-toast-out'), BUBBLE_MS - 400);
      setTimeout(() => notice.remove(), BUBBLE_MS);
      return;
    }
    const old = this.bubbles.get(who);
    if (old) old.node.remove();
    const onlyEmoji = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(text);
    const node = el('div', { class: `ol-bubble${onlyEmoji ? ' ol-bubble-emoji' : ''}`, role: 'status', text });
    this.root.append(node);
    this.bubbles.set(who, { node, until: performance.now() + BUBBLE_MS });
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame() {
    this.raf = null;
    const now = performance.now();
    for (const [who, b] of this.bubbles) {
      const at = this.anchorFor(who);
      if (!at || now > b.until) {
        b.node.remove();
        this.bubbles.delete(who);
        continue;
      }
      b.node.style.left = `${at.x}px`;
      b.node.style.top = `${at.y}px`;
      b.node.classList.toggle('ol-bubble-out', b.until - now < 400);
    }
    if (this.bubbles.size) this.raf = requestAnimationFrame(this.frame);
  }

  clear() {
    for (const b of this.bubbles.values()) b.node.remove();
    this.bubbles.clear();
    this.close();
  }
}
