// Renders the game list from games.json (the single registry of games in this repo).
const list = document.getElementById('games');

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function card(game) {
  const badges = el('div', { class: 'badges' }, [
    el('span', { class: 'badge', text: `${game.players} players` }),
    game.online ? el('span', { class: 'badge badge--online', text: 'Online co-op' }) : null,
    ...(game.tags || []).map((tag) => el('span', { class: 'badge badge--tag', text: tag })),
  ]);
  return el('li', { class: 'game' }, [
    el('a', { class: 'game-link', href: game.path }, [
      el('div', { class: 'thumb' }, [
        game.thumbnail ? el('img', { src: game.thumbnail, alt: '', loading: 'lazy', width: '640', height: '360' }) : null,
      ]),
      el('div', { class: 'game-body' }, [
        el('h3', { class: 'game-title', text: game.title }),
        el('p', { class: 'game-desc', text: game.description }),
        badges,
        el('span', { class: 'play', text: 'Play' }),
      ]),
    ]),
  ]);
}

async function render() {
  try {
    const res = await fetch('games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`games.json: HTTP ${res.status}`);
    const { games } = await res.json();
    list.replaceChildren(...games.map(card));
  } catch (err) {
    console.error(err);
    list.replaceChildren(el('li', { class: 'notice', text: 'Could not load the game list. Reload the page to try again.' }));
  }
}

render();
