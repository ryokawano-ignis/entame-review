const TMDB_KEY      = 'acb6aa56f60387a6985935f25c94704e';
const TMDB_BASE     = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w185';

let allActors   = [];
let currentPage = 1;
let isLoading   = false;
let searchMode  = false;

// ── 読み仮名変換（kuroshiro） ─────────────────────────
let kuroshiroReady = false;
let kuroshiroInst  = null;
const yomiCache    = {};

async function initKuroshiro() {
  try {
    kuroshiroInst = new Kuroshiro();
    await kuroshiroInst.init(new KuromojiAnalyzer({
      dictPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict'
    }));
    kuroshiroReady = true;
  } catch(e) {}
}

async function getYomi(text) {
  if (!text) return '';
  if (yomiCache[text] !== undefined) return yomiCache[text];
  if (!kuroshiroReady) return text;
  try {
    yomiCache[text] = await kuroshiroInst.convert(text, { to: 'hiragana', mode: 'normal' });
  } catch(e) {
    yomiCache[text] = text;
  }
  return yomiCache[text];
}

async function sortActorsByYomi() {
  const withYomi = await Promise.all(
    allActors.map(async a => ({ ...a, _yomi: await getYomi(a.name) }))
  );
  withYomi.sort((a, b) => a._yomi.localeCompare(b._yomi, 'ja'));
  allActors = withYomi;
}

initKuroshiro();

function buildActorCard(actor) {
  const card = document.createElement('a');
  card.href      = `actor-detail.html?id=${actor.id}`;
  card.className = 'actor-card';
  const knownFor = (actor.known_for || [])
    .map(k => k.title || k.name || '')
    .filter(Boolean)
    .slice(0, 2)
    .join('・');
  card.innerHTML = `
    <div class="actor-photo-wrap">
      ${actor.profile_path
        ? `<img class="actor-photo" src="${TMDB_IMG_BASE}${actor.profile_path}" alt="${actor.name}" loading="lazy">`
        : `<div class="actor-photo-ph">${actor.name.charAt(0)}</div>`}
    </div>
    <p class="actor-name">${actor.name}</p>
    ${knownFor ? `<p class="actor-known-for">${knownFor}</p>` : ''}`;
  return card;
}

function renderActors(actors) {
  const grid = document.getElementById('actorGrid');
  actors.forEach(actor => grid.appendChild(buildActorCard(actor)));
}

function clearGrid() {
  document.getElementById('actorGrid').querySelectorAll('.actor-card').forEach(c => c.remove());
}

// ── 検索：TMDB APIを直接叩く ─────────────────────────
let searchTimer;
document.getElementById('actorSearch').addEventListener('input', function() {
  clearTimeout(searchTimer);
  const q = this.value.trim();
  searchTimer = setTimeout(() => runSearch(q), 350);
});

async function runSearch(query) {
  const count   = document.getElementById('actorCount');
  const moreBtn = document.getElementById('loadMoreBtn');

  if (!query) {
    searchMode = false;
    clearGrid();
    renderActors(allActors);
    count.textContent = `${allActors.length}人`;
    moreBtn.style.display = 'block';
    return;
  }

  searchMode = true;
  moreBtn.style.display = 'none';
  count.textContent = '検索中…';
  clearGrid();

  try {
    const res  = await fetch(`${TMDB_BASE}/search/person?api_key=${TMDB_KEY}&language=ja-JP&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const results = (data.results || []).filter(p => p.profile_path);
    renderActors(results);
    count.textContent = `「${query}」— ${results.length}人`;
    if (results.length === 0) {
      document.getElementById('actorGrid').innerHTML = '<p class="empty-msg">見つかりませんでした</p>';
    }
  } catch(e) {
    count.textContent = '検索に失敗しました';
  }
}

// ── 一覧：人気の日本映画・ドラマの出演者を集める ─────
async function loadActors(page) {
  if (isLoading || searchMode) return;
  isLoading = true;

  const moreBtn = document.getElementById('loadMoreBtn');
  moreBtn.disabled = true;

  try {
    // 人気の日本映画・ドラマを取得
    const [movieData, tvData] = await Promise.all([
      fetch(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=ja-JP&with_original_language=ja&sort_by=popularity.desc&page=${page}`)
        .then(r => r.json()).catch(() => ({ results: [] })),
      fetch(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=ja-JP&with_original_language=ja&sort_by=popularity.desc&page=${page}`)
        .then(r => r.json()).catch(() => ({ results: [] }))
    ]);

    const works = [
      ...(movieData.results || []).slice(0, 8).map(m => ({ id: m.id, type: 'movie', title: m.title || '' })),
      ...(tvData.results   || []).slice(0, 8).map(m => ({ id: m.id, type: 'tv',    title: m.name  || '' }))
    ];

    // 各作品のキャストを並行取得
    const creditsAll = await Promise.all(
      works.map(w =>
        fetch(`${TMDB_BASE}/${w.type}/${w.id}/credits?api_key=${TMDB_KEY}&language=ja-JP`)
          .then(r => r.json())
          .then(d => ({ cast: d.cast || [], workTitle: w.title }))
          .catch(() => ({ cast: [], workTitle: w.title }))
      )
    );

    // 重複なしで俳優を追加（写真がある人のみ）
    const existingIds = new Set(allActors.map(a => a.id));
    const newActors   = [];

    creditsAll.forEach(({ cast, workTitle }) => {
      cast.slice(0, 10).forEach(person => {
        if (!person.profile_path || existingIds.has(person.id)) return;
        existingIds.add(person.id);
        newActors.push({
          id:           person.id,
          name:         person.name,
          profile_path: person.profile_path,
          known_for:    [{ title: workTitle }]
        });
      });
    });

    allActors = allActors.concat(newActors);
    await sortActorsByYomi();

    clearGrid();
    renderActors(allActors);

    document.getElementById('actorCount').textContent = `${allActors.length}人`;
    currentPage = page;
    moreBtn.style.display = 'block';
    moreBtn.disabled = false;
    document.getElementById('actorLoading')?.remove();
  } catch(e) {
    const el = document.getElementById('actorLoading');
    if (el) el.textContent = '読み込みに失敗しました';
    moreBtn.disabled = false;
  }

  isLoading = false;
}

document.getElementById('loadMoreBtn').addEventListener('click', () => {
  loadActors(currentPage + 1);
});

loadActors(1);
