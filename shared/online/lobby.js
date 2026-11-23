// DOM overlay for online play: choose character → invite (link, copy, share, QR)
// → connected; plus a small HUD and banners while playing.
// Games pass their own character list and language; this module owns the markup.
import { qrSvg } from './qr.js';

const STRINGS = {
  en: {
    play_online: 'Play online',
    choose_title: 'Choose your character',
    choose_sub: 'Your friend gets the other one.',
    invite_title: 'Invite a friend',
    invite_sub: 'Send this link or let them scan the code. Your friend will play as {name}.',
    copy: 'Copy link',
    copied: 'Copied!',
    share: 'Share',
    waiting: 'Waiting for your friend…',
    cancel: 'Cancel',
    joining_title: 'Joining your friend',
    you_will_play: 'You will play as {name}.',
    connecting: 'Connecting…',
    connected: 'Connected!',
    online: 'Online',
    leave: 'Leave',
    away_title: 'Your friend disconnected',
    away_sub: 'Waiting for them to come back…',
    play_alone: 'Play alone',
    error_title: "Couldn't connect",
    err_timeout: "Your friend's game didn't answer. Check that it is still open, then open the link again.",
    err_full: 'This game already has two players.',
    err_network:
      'Your network blocks direct connections between browsers. Try another network (for example mobile data).',
    err_version: 'You and your friend have different versions of the game. Reload both pages.',
    retry: 'Try again',
    close: 'Close',
    friend_choosing: 'Your friend is choosing a level…',
    you_are: 'You are {name}',
    switch: 'Switch',
    chat: 'Chat',
    say_something: 'Say something…',
    send: 'Send',
    emoji: 'Emoji',
  },
  es: {
    play_online: 'Jugar en línea',
    choose_title: 'Elige tu personaje',
    choose_sub: 'Tu amigo jugará con el otro.',
    invite_title: 'Invita a un amigo',
    invite_sub: 'Envíale este enlace o que escanee el código. Tu amigo jugará como {name}.',
    copy: 'Copiar enlace',
    copied: '¡Copiado!',
    share: 'Compartir',
    waiting: 'Esperando a tu amigo…',
    cancel: 'Cancelar',
    joining_title: 'Uniéndote a tu amigo',
    you_will_play: 'Jugarás como {name}.',
    connecting: 'Conectando…',
    connected: '¡Conectado!',
    online: 'En línea',
    leave: 'Salir',
    away_title: 'Tu amigo se ha desconectado',
    away_sub: 'Esperando a que vuelva…',
    play_alone: 'Jugar solo',
    error_title: 'No se pudo conectar',
    err_timeout: 'La partida de tu amigo no responde. Comprueba que sigue abierta y vuelve a abrir el enlace.',
    err_full: 'Esta partida ya tiene dos jugadores.',
    err_network:
      'Tu red bloquea las conexiones directas entre navegadores. Prueba con otra red (por ejemplo, datos móviles).',
    err_version: 'Tenéis versiones distintas del juego. Recargad las dos páginas.',
    retry: 'Reintentar',
    close: 'Cerrar',
    friend_choosing: 'Tu amigo está eligiendo un nivel…',
    you_are: 'Eres {name}',
    switch: 'Cambiar',
    chat: 'Chat',
    say_something: 'Escribe algo…',
    send: 'Enviar',
    emoji: 'Emoji',
  },
  fr: {
    play_online: 'Jouer en ligne',
    choose_title: 'Choisis ton personnage',
    choose_sub: "Ton ami jouera l'autre.",
    invite_title: 'Invite un ami',
    invite_sub: 'Envoie ce lien ou fais scanner le code. Ton ami jouera {name}.',
    copy: 'Copier le lien',
    copied: 'Copié !',
    share: 'Partager',
    waiting: 'En attente de ton ami…',
    cancel: 'Annuler',
    joining_title: 'Connexion à la partie de ton ami',
    you_will_play: 'Tu joueras {name}.',
    connecting: 'Connexion…',
    connected: 'Connecté !',
    online: 'En ligne',
    leave: 'Quitter',
    away_title: "Ton ami s'est déconnecté",
    away_sub: 'En attente de son retour…',
    play_alone: 'Jouer seul',
    error_title: 'Connexion impossible',
    err_timeout: "La partie de ton ami ne répond pas. Vérifie qu'elle est encore ouverte et rouvre le lien.",
    err_full: 'Cette partie a déjà deux joueurs.',
    err_network:
      'Ton réseau bloque les connexions directes entre navigateurs. Essaie un autre réseau (par exemple les données mobiles).',
    err_version: "Vous n'avez pas la même version du jeu. Rechargez les deux pages.",
    retry: 'Réessayer',
    close: 'Fermer',
    friend_choosing: 'Ton ami choisit un niveau…',
    you_are: 'Tu es {name}',
    switch: 'Changer',
    chat: 'Chat',
    say_something: 'Écris quelque chose…',
    send: 'Envoyer',
    emoji: 'Émoji',
  },
  it: {
    play_online: 'Gioca online',
    choose_title: 'Scegli il tuo personaggio',
    choose_sub: "Il tuo amico userà l'altro.",
    invite_title: 'Invita un amico',
    invite_sub: 'Manda questo link o fai scansionare il codice. Il tuo amico giocherà con {name}.',
    copy: 'Copia link',
    copied: 'Copiato!',
    share: 'Condividi',
    waiting: 'In attesa del tuo amico…',
    cancel: 'Annulla',
    joining_title: 'Ti stai unendo al tuo amico',
    you_will_play: 'Giocherai con {name}.',
    connecting: 'Connessione…',
    connected: 'Connesso!',
    online: 'Online',
    leave: 'Esci',
    away_title: 'Il tuo amico si è disconnesso',
    away_sub: 'In attesa che torni…',
    play_alone: 'Gioca da solo',
    error_title: 'Connessione non riuscita',
    err_timeout: 'La partita del tuo amico non risponde. Controlla che sia ancora aperta e riapri il link.',
    err_full: 'Questa partita ha già due giocatori.',
    err_network:
      "La tua rete blocca le connessioni dirette tra browser. Prova un'altra rete (ad esempio i dati mobili).",
    err_version: 'Avete versioni diverse del gioco. Ricaricate entrambe le pagine.',
    retry: 'Riprova',
    close: 'Chiudi',
    friend_choosing: 'Il tuo amico sta scegliendo un livello…',
    you_are: 'Sei {name}',
    switch: 'Cambia',
    chat: 'Chat',
    say_something: 'Scrivi qualcosa…',
    send: 'Invia',
    emoji: 'Emoji',
  },
  nl: {
    play_online: 'Online spelen',
    choose_title: 'Kies je personage',
    choose_sub: 'Je vriend speelt de andere.',
    invite_title: 'Nodig een vriend uit',
    invite_sub: 'Stuur deze link of laat de code scannen. Je vriend speelt als {name}.',
    copy: 'Link kopiëren',
    copied: 'Gekopieerd!',
    share: 'Delen',
    waiting: 'Wachten op je vriend…',
    cancel: 'Annuleren',
    joining_title: 'Verbinden met je vriend',
    you_will_play: 'Jij speelt als {name}.',
    connecting: 'Verbinden…',
    connected: 'Verbonden!',
    online: 'Online',
    leave: 'Verlaten',
    away_title: 'De verbinding met je vriend is verbroken',
    away_sub: 'Wachten tot je vriend terugkomt…',
    play_alone: 'Alleen spelen',
    error_title: 'Verbinden mislukt',
    err_timeout: 'Het spel van je vriend reageert niet. Controleer of het nog openstaat en open de link opnieuw.',
    err_full: 'Dit spel heeft al twee spelers.',
    err_network:
      'Je netwerk blokkeert directe verbindingen tussen browsers. Probeer een ander netwerk (bijvoorbeeld mobiele data).',
    err_version: "Jullie hebben verschillende versies van het spel. Laad beide pagina's opnieuw.",
    retry: 'Opnieuw proberen',
    close: 'Sluiten',
    friend_choosing: 'Je vriend kiest een level…',
    you_are: 'Jij bent {name}',
    switch: 'Wisselen',
    chat: 'Chat',
    say_something: 'Zeg iets…',
    send: 'Versturen',
    emoji: 'Emoji',
  },
  ru: {
    play_online: 'Играть онлайн',
    choose_title: 'Выберите персонажа',
    choose_sub: 'Ваш друг получит другого.',
    invite_title: 'Пригласите друга',
    invite_sub: 'Отправьте эту ссылку или покажите код. Друг будет играть за {name}.',
    copy: 'Копировать ссылку',
    copied: 'Скопировано!',
    share: 'Поделиться',
    waiting: 'Ждём друга…',
    cancel: 'Отмена',
    joining_title: 'Подключение к другу',
    you_will_play: 'Вы играете за {name}.',
    connecting: 'Подключение…',
    connected: 'Подключено!',
    online: 'Онлайн',
    leave: 'Выйти',
    away_title: 'Друг отключился',
    away_sub: 'Ждём, пока друг вернётся…',
    play_alone: 'Играть одному',
    error_title: 'Не удалось подключиться',
    err_timeout: 'Игра друга не отвечает. Проверьте, что она открыта, и откройте ссылку ещё раз.',
    err_full: 'В этой игре уже два игрока.',
    err_network:
      'Ваша сеть блокирует прямые соединения между браузерами. Попробуйте другую сеть (например, мобильный интернет).',
    err_version: 'У вас разные версии игры. Перезагрузите обе страницы.',
    retry: 'Повторить',
    close: 'Закрыть',
    friend_choosing: 'Друг выбирает уровень…',
    you_are: 'Вы — {name}',
    switch: 'Сменить',
    chat: 'Чат',
    say_something: 'Напишите что-нибудь…',
    send: 'Отправить',
    emoji: 'Эмодзи',
  },
  de: {
    play_online: 'Online spielen',
    choose_title: 'Wähle deine Figur',
    choose_sub: 'Dein Freund spielt die andere.',
    invite_title: 'Lade einen Freund ein',
    invite_sub: 'Schick diesen Link oder lass den Code scannen. Dein Freund spielt {name}.',
    copy: 'Link kopieren',
    copied: 'Kopiert!',
    share: 'Teilen',
    waiting: 'Warte auf deinen Freund…',
    cancel: 'Abbrechen',
    joining_title: 'Verbinde mit deinem Freund',
    you_will_play: 'Du spielst {name}.',
    connecting: 'Verbinde…',
    connected: 'Verbunden!',
    online: 'Online',
    leave: 'Verlassen',
    away_title: 'Die Verbindung zu deinem Freund ist weg',
    away_sub: 'Warte auf die Rückkehr…',
    play_alone: 'Allein spielen',
    error_title: 'Verbindung fehlgeschlagen',
    err_timeout: 'Das Spiel deines Freundes antwortet nicht. Prüfe, ob es noch offen ist, und öffne den Link erneut.',
    err_full: 'Dieses Spiel hat schon zwei Spieler.',
    err_network:
      'Dein Netzwerk blockiert direkte Verbindungen zwischen Browsern. Versuche ein anderes Netzwerk (z. B. mobile Daten).',
    err_version: 'Ihr habt verschiedene Spielversionen. Ladet beide Seiten neu.',
    retry: 'Erneut versuchen',
    close: 'Schließen',
    friend_choosing: 'Dein Freund wählt ein Level…',
    you_are: 'Du bist {name}',
    switch: 'Wechseln',
    chat: 'Chat',
    say_something: 'Schreib etwas…',
    send: 'Senden',
    emoji: 'Emoji',
  },
};

export const LOBBY_LANGS = Object.keys(STRINGS);

export function translate(lang, key, vars = {}) {
  const dict = STRINGS[lang] || STRINGS.en;
  const text = dict[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
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
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

export class Lobby {
  /**
   * @param {object} o
   * @param {() => string} o.getLang   current language code
   * @param {Array<{id:string,name:string,hint:string,accent:string,icon?:string}>} o.characters
   */
  constructor({ getLang, characters }) {
    this.getLang = getLang;
    this.characters = characters;
    this.root = el('div', { class: 'ol-root' });
    document.body.append(this.root);
    // Keys typed while the overlay is open must not move characters or pause the game.
    const swallow = (e) => {
      if (this.overlay) e.stopPropagation();
    };
    window.addEventListener('keydown', swallow, true);
    window.addEventListener('keyup', swallow, true);
  }

  t(key, vars) {
    return translate(this.getLang(), key, vars);
  }

  charById(id) {
    return this.characters.find((c) => c.id === id);
  }

  // ---------- full-screen dialog ----------

  open(card) {
    this.close();
    this.overlay = el('div', { class: 'ol-overlay', role: 'dialog', 'aria-modal': 'true' }, [card]);
    this.root.append(this.overlay);
    const focusable = card.querySelector('button, [href], input');
    focusable && focusable.focus({ preventScroll: true });
  }

  close() {
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
  }

  get isOpen() {
    return !!this.overlay;
  }

  card(title, sub, body = [], actions = []) {
    return el('div', { class: 'ol-card' }, [
      el('h2', { class: 'ol-title', text: title }),
      sub ? el('p', { class: 'ol-sub', text: sub }) : null,
      ...body,
      actions.length ? el('div', { class: 'ol-actions' }, actions) : null,
    ]);
  }

  button(label, onclick, kind = 'secondary') {
    return el('button', { class: `ol-btn ol-btn-${kind}`, type: 'button', text: label, onclick });
  }

  /** Step 1 (host): pick a character. */
  showChooseCharacter({ onPick, onCancel }) {
    const options = this.characters.map((c) =>
      el(
        'button',
        {
          class: 'ol-char',
          type: 'button',
          style: `--accent:${c.accent}`,
          onclick: () => onPick(c.id),
        },
        [
          c.icon ? el('img', { class: 'ol-char-icon', src: c.icon, alt: '' }) : null,
          el('span', { class: 'ol-char-name', text: c.name }),
          el('span', { class: 'ol-char-hint', text: c.hint }),
        ],
      ),
    );
    this.open(
      this.card(this.t('choose_title'), this.t('choose_sub'), [el('div', { class: 'ol-chars' }, options)], [
        this.button(this.t('cancel'), onCancel),
      ]),
    );
  }

  /** Step 2 (host): link, copy, share, QR, waiting status. */
  showInvite({ url, friendCharId, onCancel }) {
    const friend = this.charById(friendCharId);
    const link = el('input', {
      class: 'ol-link',
      type: 'text',
      readonly: true,
      value: url,
      'aria-label': 'Invite link',
      onfocus: (e) => e.target.select(),
    });
    const copyBtn = this.button(this.t('copy'), async () => {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        link.select();
        document.execCommand && document.execCommand('copy');
      }
      copyBtn.textContent = this.t('copied');
      setTimeout(() => (copyBtn.textContent = this.t('copy')), 1600);
    }, 'primary');
    const actions = [copyBtn];
    if (navigator.share) {
      actions.push(
        this.button(this.t('share'), () => navigator.share({ url, title: document.title }).catch(() => {})),
      );
    }
    actions.push(this.button(this.t('cancel'), onCancel));

    const qr = el('div', { class: 'ol-qr' });
    qr.innerHTML = qrSvg(url, { label: this.t('invite_title') });
    this.statusLine = el('p', { class: 'ol-status ol-status-wait', role: 'status' }, [
      el('span', { class: 'ol-spinner', 'aria-hidden': 'true' }),
      el('span', { text: this.t('waiting') }),
    ]);
    this.open(
      this.card(
        this.t('invite_title'),
        this.t('invite_sub', { name: friend ? friend.name : '' }),
        [el('div', { class: 'ol-invite' }, [qr, el('div', { class: 'ol-invite-side' }, [link, this.statusLine])])],
        actions,
      ),
    );
  }

  /** Guest: connecting screen. */
  showJoining({ myCharId = null, onCancel }) {
    const me = myCharId && this.charById(myCharId);
    this.statusLine = el('p', { class: 'ol-status ol-status-wait', role: 'status' }, [
      el('span', { class: 'ol-spinner', 'aria-hidden': 'true' }),
      el('span', { text: this.t('connecting') }),
    ]);
    this.open(
      this.card(this.t('joining_title'), me ? this.t('you_will_play', { name: me.name }) : '', [this.statusLine], [
        this.button(this.t('cancel'), onCancel),
      ]),
    );
  }

  /** Short "Connected! You are Lisa" confirmation, then closes itself. */
  showConnected(myCharId, ms = 1400) {
    const me = this.charById(myCharId);
    this.open(
      this.card(this.t('connected'), me ? this.t('you_are', { name: me.name }) : '', [
        me && me.icon ? el('img', { class: 'ol-char-icon ol-big', src: me.icon, alt: '' }) : null,
      ]),
    );
    clearTimeout(this.connectedTimer);
    this.connectedTimer = setTimeout(() => this.close(), ms);
  }

  showAway({ onLeave }) {
    this.open(
      this.card(this.t('away_title'), this.t('away_sub'), [
        el('p', { class: 'ol-status ol-status-wait' }, [el('span', { class: 'ol-spinner' })]),
      ], [this.button(this.t('play_alone'), onLeave)]),
    );
  }

  showError({ reason, onRetry, onClose }) {
    const key = { timeout: 'err_timeout', full: 'err_full', network: 'err_network', version: 'err_version' }[reason];
    const actions = [];
    if (onRetry) actions.push(this.button(this.t('retry'), onRetry, 'primary'));
    actions.push(this.button(this.t('close'), onClose));
    this.open(this.card(this.t('error_title'), key ? this.t(key) : String(reason || ''), [], actions));
  }

  // ---------- in-game chrome ----------

  /** Small pill: "● Online · 42 ms   You are Lisa   [Leave]". */
  showHud({ myCharId, onLeave, onSwitch, onChat }) {
    this.hideHud();
    const me = this.charById(myCharId);
    this.hudPing = el('span', { class: 'ol-hud-ping' });
    this.hudDot = el('span', { class: 'ol-dot', 'aria-hidden': 'true' });
    this.switchBtn = el('button', {
      class: 'ol-hud-btn ol-hud-switch',
      type: 'button',
      text: this.t('switch'),
      hidden: true,
      onclick: onSwitch,
    });
    this.hud = el('div', { class: 'ol-hud', style: me ? `--accent:${me.accent}` : null }, [
      this.hudDot,
      el('span', { class: 'ol-hud-label', text: this.t('online') }),
      this.hudPing,
      me ? el('span', { class: 'ol-hud-me', text: me.name }) : null,
      this.switchBtn,
      onChat
        ? el('button', { class: 'ol-hud-btn ol-hud-chat', type: 'button', text: '💬', title: this.t('chat'), 'aria-label': this.t('chat'), onclick: onChat })
        : null,
      el('button', { class: 'ol-hud-btn', type: 'button', text: this.t('leave'), onclick: onLeave }),
    ]);
    this.root.append(this.hud);
  }

  setHudPing(rtt, state = 'ok') {
    if (!this.hud) return;
    this.hudPing.textContent = rtt == null ? '' : `${rtt} ms`;
    this.hud.dataset.state = state;
  }

  setSwitchVisible(visible) {
    if (this.switchBtn) this.switchBtn.hidden = !visible;
  }

  hideHud() {
    if (this.hud) this.hud.remove();
    this.hud = null;
  }

  /** Persistent message at the top of the screen (e.g. "Your friend is choosing a level…"). */
  banner(text) {
    if (!text) {
      if (this.bannerEl) this.bannerEl.remove();
      this.bannerEl = null;
      return;
    }
    if (!this.bannerEl) {
      this.bannerEl = el('div', { class: 'ol-banner', role: 'status' });
      this.root.append(this.bannerEl);
    }
    this.bannerEl.textContent = text;
  }

  /** Brief message that fades out by itself. */
  toast(text, ms = 2200) {
    const node = el('div', { class: 'ol-toast', role: 'status', text });
    this.root.append(node);
    setTimeout(() => node.classList.add('ol-toast-out'), ms);
    setTimeout(() => node.remove(), ms + 400);
  }
}
