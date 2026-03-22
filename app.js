// genreLabel / genreColor / genreIcon / TMDB定数 / キャッシュ / 配信 / タグ / favorites / wishlist / modal は modal.js から使用

// ── 状態管理 ──────────────────────────────────────────
let tmdbItems             = [];
let currentGenre          = 'all';
let currentSearch         = '';
let currentYear           = '';
let currentPersonMatchIds = new Set(); // 人物検索でヒットした作品IDのセット
const personSearchCache   = {};        // 検索ワード → Set<tmdbId> のキャッシュ

// ── ローカルストレージ状態 ────────────────────────────
// data.js のタイトルと重複するものを localStorage から除去（マスターデータ優先）
const _masterTitles = new Set(reviews.map(r => r.title));
let myReviews = JSON.parse(localStorage.getItem('myReviews') || '[]');
const _before = myReviews.length;
myReviews = myReviews.filter(r => !_masterTitles.has(r.title));
if (myReviews.length !== _before) {
  localStorage.setItem('myReviews', JSON.stringify(myReviews));
}
myReviews.forEach(r => { r._myReview = true; });
// favorites / wishlist / saveFavorites / saveWishlist / updateHeaderCounts は modal.js から使用

function saveMyReviews() {
  // data.js と重複するタイトルは保存しない（マスターデータ優先）
  localStorage.setItem('myReviews', JSON.stringify(myReviews.filter(r => !_masterTitles.has(r.title))));
}

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
  } catch (e) {
    console.warn('kuroshiro 初期化失敗', e);
  }
}

async function getYomi(text) {
  if (!text || !kuroshiroReady) return '';
  if (yomiCache[text] !== undefined) return yomiCache[text];
  try {
    yomiCache[text] = await kuroshiroInst.convert(text, { to: 'hiragana', mode: 'normal' });
  } catch (e) {
    yomiCache[text] = '';
  }
  return yomiCache[text];
}

async function preloadYomi(items) {
  if (!kuroshiroReady) return;
  const BATCH = 30;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    await Promise.all(batch.map(r => getYomi(r.title)));
    if (currentSearch) renderReviews(currentGenre);
  }
  if (currentSearch) renderReviews(currentGenre);
}

// ── ポスター取得（手動レビュー用） ───────────────────
const TMDB_SEARCH = { movie: '/search/movie', drama: '/search/tv', anime: '/search/tv' };

async function fetchPoster(title, genre, year) {
  const cacheKey = title + (year || '');
  if (cacheKey in posterCache) return posterCache[cacheKey];
  const endpoint = TMDB_SEARCH[genre];
  if (!endpoint) return null;
  const yearParam = year
    ? (genre === 'movie' ? `&year=${year}` : `&first_air_date_year=${year}`)
    : '';
  const url = `${TMDB_BASE}${endpoint}?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&language=ja-JP${yearParam}`;
  try {
    const res    = await fetch(url);
    const data   = await res.json();
    const first  = data.results && data.results[0];
    posterCache[cacheKey] = first?.poster_path ? TMDB_IMG_BASE + first.poster_path : null;
    if (first?.id) tmdbIdCache[cacheKey] = first.id;
  } catch (e) {
    posterCache[cacheKey] = null;
  }
  return posterCache[cacheKey];
}

// fetchTmdbRelated / fetchCredits は modal.js から使用

// ── カードにクレジットを反映 ──────────────────────────
function applyCreditsToCard(card, credits) {
  // カードはポスター画像のみ表示するため、DOM更新は不要
  // creditsCache への格納は fetchCredits 内で完了済み
}

// ── IntersectionObserver でスクロール時に遅延取得 ─────
const creditsObserver = new IntersectionObserver(async function(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const card   = entry.target;
    const tmdbId = card.dataset.tmdbId;
    const genre  = card.dataset.genre;
    creditsObserver.unobserve(card);
    if (!tmdbId) continue;
    const credits = await fetchCredits(Number(tmdbId), genre);
    applyCreditsToCard(card, credits);
  }
}, { rootMargin: '300px' });

// ── TMDB データ → 共通形式 ────────────────────────────
function movieToReview(m) {
  return {
    genre: 'movie', title: m.title || '',
    _originalTitle: m.original_title || '',
    year:     m.release_date   ? m.release_date.slice(0, 4)   : '',
    synopsis: m.overview,
    stars:    m.vote_average   ? Math.min(5, Math.max(1, Math.round(m.vote_average / 2))) : 0,
    image:    m.poster_path    ? TMDB_IMG_BASE + m.poster_path : '',
    _fromTMDB: true, _tmdbId: m.id, _voteAvg: m.vote_average || 0,
    _genreIds: m.genre_ids || []
  };
}
function tvToReview(m, genre) {
  return {
    genre, title: m.name || '',
    _originalTitle: m.original_name || '',
    year:     m.first_air_date ? m.first_air_date.slice(0, 4) : '',
    synopsis: m.overview,
    stars:    m.vote_average   ? Math.min(5, Math.max(1, Math.round(m.vote_average / 2))) : 0,
    image:    m.poster_path    ? TMDB_IMG_BASE + m.poster_path : '',
    _fromTMDB: true, _tmdbId: m.id, _voteAvg: m.vote_average || 0,
    _genreIds: m.genre_ids || []
  };
}

// ── 全ページを取得する汎用関数 ────────────────────────
async function fetchAllPages(baseUrl, convertFn) {
  let results = [], page = 1, totalPages = 1;
  do {
    try {
      const res  = await fetch(`${baseUrl}&page=${page}`);
      const data = await res.json();
      totalPages = Math.min(data.total_pages || 1, 40);
      results = results.concat(
        (data.results || []).filter(m => m.overview && m.overview.trim()).map(convertFn)
      );
      page++;
    } catch (e) { break; }
  } while (page <= totalPages);
  return results;
}

// ── 1980〜2025年の全作品を取得 ────────────────────────
async function fetchAll2025() {
  const BASE     = `api_key=${TMDB_KEY}&language=ja-JP&sort_by=popularity.desc&with_original_language=ja`;
  const movieUrl = `${TMDB_BASE}/discover/movie?${BASE}&primary_release_date.gte=1980-01-01&primary_release_date.lte=2025-12-31`;
  const animeUrl = `${TMDB_BASE}/discover/tv?${BASE}&first_air_date.gte=1980-01-01&first_air_date.lte=2025-12-31&with_genres=16`;
  const dramaUrl = `${TMDB_BASE}/discover/tv?${BASE}&first_air_date.gte=1980-01-01&first_air_date.lte=2025-12-31&without_genres=16`;
  const [movies, anime, dramas] = await Promise.all([
    fetchAllPages(movieUrl, movieToReview),
    fetchAllPages(animeUrl, m => tvToReview(m, 'anime')),
    fetchAllPages(dramaUrl, m => tvToReview(m, 'drama'))
  ]);
  tmdbItems = movies.concat(anime).concat(dramas);
}

// renderStars は modal.js から使用

// ── サムネイルHTML生成 ────────────────────────────────
function renderThumb(review, rank) {
  const g     = review.genre;
  const color = genreColor[g] || '#888';
  const rankBadge = rank
    ? `<span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank === 1 ? '🥇 1位' : rank === 2 ? '🥈 2位' : rank === 3 ? '🥉 3位' : `#${rank}`}</span>`
    : '';
  if (review.image) {
    return `<div class="card-thumb card-thumb-img">
      <img src="${review.image}" alt="${review.title}" loading="lazy">
      ${review.pickup ? '<span class="pickup-badge">PICKUP</span>' : ''}${rankBadge}
    </div>`;
  }
  return `<div class="card-thumb card-thumb-placeholder" style="background:linear-gradient(135deg,${color}18,${color}44);">
    <span class="thumb-genre-icon">${genreIcon[g] || '🎞️'}</span>
    <span class="thumb-title-text">${review.title}</span>
    ${review.pickup ? '<span class="pickup-badge">PICKUP</span>' : ''}${rankBadge}
  </div>`;
}

// ── 手動レビューのポスターを差し替え ─────────────────
async function loadPosterIntoCard(review, card) {
  if (review.image) return;
  const url = await fetchPoster(review.title, review.genre, review.year);
  if (!url) return;
  const ph = card.querySelector('.card-poster-ph');
  if (!ph) return;
  const img = document.createElement('img');
  img.className = 'card-poster-img';
  img.src = url;
  img.alt = review.title;
  img.loading = 'lazy';
  ph.replaceWith(img);
}

// ── カード生成 ────────────────────────────────────────
function createCard(review, rank) {
  const g     = review.genre;
  const color = genreColor[g] || '#888';
  const card  = document.createElement('article');
  card.className   = 'review-card';
  card.dataset.genre = g;
  if (review._tmdbId) card.dataset.tmdbId = String(review._tmdbId);

  const rankBadge = rank
    ? `<span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</span>`
    : '';

  const posterHtml = review.image
    ? `<img class="card-poster-img" src="${review.image}" alt="${review.title}" loading="lazy">`
    : `<div class="card-poster-ph" style="background:linear-gradient(160deg,${color}44,${color}99);">
         <span class="card-ph-icon">${genreIcon[g] || '🎞️'}</span>
         <span class="card-ph-title">${review.title}</span>
       </div>`;

  const cardTagArr = getAllTags(review).slice(0, 3);
  const cardTagsHtml = cardTagArr.length > 0
    ? `<div class="card-tags">${cardTagArr.map(t => `<span class="card-tag" data-tag="${t}" style="${tagStyleStr(t)}">${t}</span>`).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="card-poster">
      ${posterHtml}
      ${rankBadge}
      ${review._myReview ? '<span class="my-review-badge">MY</span>' : ''}
      <div class="card-overlay">
        <p class="overlay-title">${review.title}</p>
        <p class="overlay-meta">${review.year || ''}${review.year && review.stars ? '　' : ''}${'★'.repeat(review.stars || 0)}</p>
      </div>
      <div class="card-hover-btns"></div>
    </div>
    ${cardTagsHtml}
  `;

  card.querySelectorAll('.card-tag').forEach(tagEl => {
    tagEl.addEventListener('click', e => { e.stopPropagation(); setTagFilter(tagEl.dataset.tag); });
  });

  if (!review._fromTMDB) loadPosterIntoCard(review, card);
  if (review._tmdbId) creditsObserver.observe(card);

  const btns = card.querySelector('.card-hover-btns');
  btns.addEventListener('click', e => e.stopPropagation());

  const favBtn = document.createElement('button');
  favBtn.className = 'card-action-btn card-fav-btn' + (favorites.has(review.title) ? ' active' : '');
  favBtn.dataset.favTitle = review.title;
  favBtn.title = 'お気に入り';
  favBtn.innerHTML = '♥';
  favBtn.addEventListener('click', e => toggleFav(review.title, e));

  const wishBtn = document.createElement('button');
  wishBtn.className = 'card-action-btn card-wish-btn' + (wishlist.has(review.title) ? ' active' : '');
  wishBtn.dataset.wishTitle = review.title;
  wishBtn.title = '見たい';
  wishBtn.innerHTML = '🔖';
  wishBtn.addEventListener('click', e => toggleWish(review.title, e));

  btns.appendChild(favBtn);
  btns.appendChild(wishBtn);

  card.addEventListener('click', () => openModal(review));
  return card;
}

// toggleFav / toggleWish / shareX は modal.js から使用

// ── 検索マッチ判定 ────────────────────────────────────
function normalizeQ(s) {
  return (s || '').normalize('NFKC').toLowerCase();
}

function matchesSearch(review, query, year) {
  if (year && review.year !== year) return false;
  if (!query.trim()) return true;
  const q = normalizeQ(query);

  // タイトル・原題
  if (normalizeQ(review.title).includes(q))          return true;
  if (normalizeQ(review._originalTitle).includes(q)) return true;
  // 読み仮名（手動 or kuroshiro）
  if (normalizeQ(review.yomi).includes(q))           return true;
  if (normalizeQ(yomiCache[review.title]).includes(q)) return true;
  // 監督・著者（手動レビュー）
  if (normalizeQ(review.creator).includes(q))        return true;
  // あらすじ
  if (normalizeQ(review.synopsis).includes(q))       return true;
  // おすすめ一言
  if (normalizeQ(review.recommend).includes(q))      return true;
  // キャスト（手動レビュー）
  if (review.cast && review.cast.some(c => normalizeQ(c).includes(q))) return true;

  // TMDB クレジットキャッシュ（カードが表示済みの場合）
  if (review._tmdbId) {
    const credits = creditsCache[`${review._tmdbId}_${review.genre}`];
    if (credits) {
      if (normalizeQ(credits.creator).includes(q)) return true;
      if (credits.cast && credits.cast.some(c => normalizeQ(c).includes(q))) return true;
    }
    // TMDB 人物検索API でヒットした作品IDと照合
    if (currentPersonMatchIds.has(review._tmdbId)) return true;
  }

  return false;
}

// ── TMDB 人物検索（俳優・監督名 → 作品ID） ────────────
async function searchPersonIds(query) {
  const key = normalizeQ(query);
  if (personSearchCache[key] !== undefined) return personSearchCache[key];

  console.log('[人物検索] クエリ:', query);
  try {
    const url  = `${TMDB_BASE}/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=ja-JP`;
    const res  = await fetch(url);
    const data = await res.json();
    const ids  = new Set();

    (data.results || []).forEach(person => {
      (person.known_for || []).forEach(item => {
        if (item.id) ids.add(item.id);
      });
    });

    console.log('[人物検索] ヒット人物数:', (data.results || []).length, '/ 関連作品ID数:', ids.size, [...ids]);
    personSearchCache[key] = ids;
    return ids;
  } catch (e) {
    console.warn('[人物検索] エラー:', e);
    personSearchCache[key] = new Set();
    return new Set();
  }
}

// ── レビュー一覧を描画 ────────────────────────────────
function renderReviews(genre) {
  currentGenre = genre;
  const container = document.getElementById('reviewGrid');
  const countEl   = document.getElementById('resultCount');
  container.innerHTML = '';

  const allManual = myReviews.concat(reviews);
  const allItems  = allManual.concat(tmdbItems);
  let combined    = [];

  if (genre === 'favorites') {
    combined = allItems.filter(r => favorites.has(r.title));
    if (currentSearch || currentYear) combined = combined.filter(r => matchesSearch(r, currentSearch, currentYear));
  } else if (genre === 'wishlist') {
    combined = allItems.filter(r => wishlist.has(r.title));
    if (currentSearch || currentYear) combined = combined.filter(r => matchesSearch(r, currentSearch, currentYear));
  } else if (genre === 'ranking') {
    combined = [...allItems]
      .filter(r => r.synopsis && r.synopsis.trim())
      .sort((a, b) => (b._voteAvg || 0) - (a._voteAvg || 0))
      .slice(0, 10)
      .map((r, i) => Object.assign({}, r, { _rank: i + 1 }));
  } else {
    const manual          = genre === 'all' ? allManual : allManual.filter(r => r.genre === genre);
    const allManualTitles = new Set(allManual.map(r => r.title));
    const tmdbFiltered    = (genre === 'all' ? tmdbItems : tmdbItems.filter(r => r.genre === genre))
      .filter(r => !allManualTitles.has(r.title));
    combined = manual.concat(tmdbFiltered).sort((a, b) =>
      (b.year || '0').localeCompare(a.year || '0')
    );
    if (currentSearch || currentYear) {
      combined = combined.filter(r => matchesSearch(r, currentSearch, currentYear));
    }
  }

  if (currentTagFilter) {
    combined = combined.filter(r => getAllTags(r).includes(currentTagFilter));
  }

  if (combined.length === 0) {
    container.innerHTML = '<p class="empty-msg">該当する作品が見つかりませんでした</p>';
    countEl.textContent = '';
    return;
  }

  combined.forEach(r => container.appendChild(createCard(r, r._rank)));
  const labelMap = { favorites: '❤️ お気に入り', wishlist: '🔖 見たい', ranking: '🏆 ランキング' };
  const label    = labelMap[genre] || (genre === 'all' ? 'すべて' : (genreLabel[genre] || genre));
  countEl.textContent = genre === 'ranking' ? `TOP ${combined.length}` : `${label} — ${combined.length}件`;
}

// ── フィルターボタン ──────────────────────────────────
function initFilter() {
  const bar = document.getElementById('filterBar');
  bar.addEventListener('click', function(e) {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderReviews(btn.dataset.genre);
  });
}

// ── 検索バー ──────────────────────────────────────────
function initSearch() {
  const yearSelect = document.getElementById('yearSelect');
  for (let y = 2025; y >= 1980; y--) {
    const opt = document.createElement('option');
    opt.value = String(y); opt.textContent = `${y}年`;
    yearSelect.appendChild(opt);
  }
  let timer;
  document.getElementById('searchInput').addEventListener('input', function(e) {
    clearTimeout(timer);
    const val = e.target.value;
    timer = setTimeout(async function() {
      currentSearch = val.trim();
      console.log('[検索] クエリ:', currentSearch);
      if (currentSearch) {
        // 人物検索APIを実行してヒット作品IDを取得
        currentPersonMatchIds = await searchPersonIds(currentSearch);
      } else {
        currentPersonMatchIds = new Set();
      }
      renderReviews(currentGenre);
    }, 400);
  });
  yearSelect.addEventListener('change', function(e) {
    currentYear = e.target.value;
    renderReviews(currentGenre);
  });
}

// ── レビューを書くモーダル（3ステップ） ──────────────
let writeStep = 1;
let writeSelected = null;
let writeStars = 0;
let writeSearchTimer = null;

function openWriteModal() {
  writeStep = 1;
  writeSelected = null;
  writeStars = 0;
  document.getElementById('writeOverlay').classList.add('active');
  document.getElementById('writeModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  renderWriteStep();
}
function closeWriteModal() {
  const ov = document.getElementById('writeOverlay');
  const wm = document.getElementById('writeModal');
  if (ov) ov.classList.remove('active');
  if (wm) wm.classList.remove('active');
  document.body.style.overflow = '';
}
function renderWriteStep() {
  const content = document.getElementById('writeContent');
  if (!content) return;
  if (writeStep === 1) renderWriteStep1(content);
  else if (writeStep === 2) renderWriteStep2(content);
  else renderWriteStep3(content);
}

function renderWriteStep1(content) {
  content.innerHTML = `
    <div class="ws-header">
      <p class="ws-step-label">STEP 1 / 3</p>
      <h3 class="ws-title">作品を検索</h3>
    </div>
    <input type="text" id="writeSearchInput" class="ws-search-input" placeholder="タイトルで検索（例：鬼滅の刃）">
    <div id="writeSearchResults" class="ws-search-results"></div>
  `;
  const input = document.getElementById('writeSearchInput');
  input.addEventListener('input', function() {
    clearTimeout(writeSearchTimer);
    const q = this.value.trim();
    if (!q) { document.getElementById('writeSearchResults').innerHTML = ''; return; }
    document.getElementById('writeSearchResults').innerHTML = '<p class="ws-loading">検索中…</p>';
    writeSearchTimer = setTimeout(() => searchWriteWorks(q), 400);
  });
  setTimeout(() => input.focus(), 50);
}

async function searchWriteWorks(query) {
  const resultsEl = document.getElementById('writeSearchResults');
  if (!resultsEl) return;
  try {
    const url  = `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=ja-JP`;
    const res  = await fetch(url);
    const data = await res.json();
    const items = (data.results || [])
      .filter(m => (m.media_type === 'movie' || m.media_type === 'tv') && (m.title || m.name))
      .slice(0, 8);
    if (items.length === 0) {
      resultsEl.innerHTML = '<p class="ws-empty">見つかりませんでした</p>';
      return;
    }
    resultsEl.innerHTML = items.map((m, i) => {
      const title = m.title || m.name || '';
      const year  = (m.release_date || m.first_air_date || '').slice(0, 4);
      const gLabel = m.media_type === 'movie' ? '映画' : 'TV';
      const thumb  = m.poster_path
        ? `<img src="${TMDB_IMG_BASE + m.poster_path}" alt="${title}" class="ws-thumb">`
        : `<div class="ws-thumb ws-thumb-ph">🎞️</div>`;
      return `<button class="ws-item" data-idx="${i}">${thumb}<div class="ws-item-body"><p class="ws-item-title">${title}</p><p class="ws-item-meta">${gLabel}${year ? ' · ' + year : ''}</p></div></button>`;
    }).join('');
    resultsEl.querySelectorAll('.ws-item').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const m = items[i];
        const GENRE_TAG_MAP = {
          28:'#アクション', 10759:'#アクション', 35:'#コメディ',
          27:'#ホラー', 9648:'#サスペンス', 53:'#サスペンス',
          80:'#裏社会', 10749:'#恋愛', 878:'#SF', 10765:'#SF',
          14:'#ファンタジー', 10764:'#ファンタジー'
        };
        const autoTags = [...new Set(
          (m.genre_ids || []).map(id => GENRE_TAG_MAP[id]).filter(Boolean)
        )];
        writeSelected = {
          title:     m.title || m.name || '',
          year:      (m.release_date || m.first_air_date || '').slice(0, 4),
          genre:     m.media_type === 'movie' ? 'movie' : 'drama',
          synopsis:  m.overview || '',
          posterUrl: m.poster_path ? TMDB_IMG_BASE + m.poster_path : '',
          tmdbId:    m.id || null,
          tags:      autoTags
        };
        writeStep = 2;
        renderWriteStep();
      });
    });
  } catch(e) {
    if (resultsEl) resultsEl.innerHTML = '<p class="ws-empty">検索に失敗しました</p>';
  }
}

function renderWriteStep2(content) {
  const w = writeSelected;
  const genreLabels = { movie: '映画', drama: 'ドラマ', anime: 'アニメ' };
  const posterHtml = w.posterUrl
    ? `<img src="${w.posterUrl}" alt="${w.title}" class="ws-poster-img">`
    : `<div class="ws-poster-ph">🎞️</div>`;
  content.innerHTML = `
    <div class="ws-header">
      <button id="writeBack" class="ws-back-btn">← 戻る</button>
      <p class="ws-step-label">STEP 2 / 3</p>
      <h3 class="ws-title">レビューを書く</h3>
    </div>
    <div class="ws-work-info">
      <div class="ws-work-poster">${posterHtml}</div>
      <div class="ws-work-meta">
        <span class="ws-work-genre">${genreLabels[w.genre] || ''}</span>
        <p class="ws-work-title">${w.title}</p>
        ${w.year ? `<p class="ws-work-year">${w.year}年</p>` : ''}
      </div>
    </div>
    <div class="ws-form">
      <div class="ws-form-group">
        <label class="ws-form-label">評価</label>
        <div class="ws-stars" id="wsStarRow">
          ${[1,2,3,4,5].map(n => `<button type="button" class="ws-star-btn" data-val="${n}">★</button>`).join('')}
        </div>
      </div>
      <div class="ws-form-group">
        <label class="ws-form-label">レビュー本文 <span class="ws-required">*</span></label>
        <textarea id="writeBody" class="ws-textarea" rows="5" placeholder="この作品の感想を書いてください…"></textarea>
      </div>
      <div class="ws-form-group">
        <label class="ws-form-label">ニックネーム</label>
        <input type="text" id="writeNickname" class="ws-input" placeholder="匿名">
      </div>
      <button type="button" id="writeSubmitBtn" class="ws-submit-btn">投稿する</button>
    </div>
  `;
  document.getElementById('writeBack').addEventListener('click', () => { writeStep = 1; renderWriteStep(); });

  const starBtns = document.querySelectorAll('.ws-star-btn');
  starBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      writeStars = Number(this.dataset.val);
      starBtns.forEach((b, i) => b.classList.toggle('active', i < writeStars));
    });
    btn.addEventListener('mouseenter', function() {
      const n = Number(this.dataset.val);
      starBtns.forEach((b, i) => b.classList.toggle('hover', i < n));
    });
    btn.addEventListener('mouseleave', () => { starBtns.forEach(b => b.classList.remove('hover')); });
  });

  document.getElementById('writeSubmitBtn').addEventListener('click', () => {
    const body = document.getElementById('writeBody').value.trim();
    if (!body) { document.getElementById('writeBody').focus(); return; }
    const nickname = document.getElementById('writeNickname').value.trim() || '匿名';
    const review = {
      id:        Date.now(),
      genre:     writeSelected.genre,
      title:     writeSelected.title,
      year:      writeSelected.year,
      synopsis:  writeSelected.synopsis,
      posterUrl: writeSelected.posterUrl,
      tmdbId:    writeSelected.tmdbId,
      stars:     writeStars,
      body:      body,
      nickname:  nickname,
      tags:      writeSelected.tags || [],
      createdAt: new Date().toISOString()
    };
    const communityReviews = JSON.parse(localStorage.getItem('communityReviews') || '[]');
    communityReviews.unshift(review);
    localStorage.setItem('communityReviews', JSON.stringify(communityReviews));
    writeStep = 3;
    renderWriteStep3(document.getElementById('writeContent'), review);
  });
}

function renderWriteStep3(content, review) {
  const r = review || {};
  content.innerHTML = `
    <div class="ws-done">
      <div class="ws-done-icon">🎉</div>
      <h3 class="ws-done-title">投稿ありがとうございます！</h3>
      <p class="ws-done-work">「${r.title || ''}」へのレビューを投稿しました。</p>
      <div class="ws-done-actions">
        <a href="reviews.html" class="ws-done-btn-primary">💬 みんなのレビューを見る</a>
        <button id="writeDoneClose" class="ws-done-btn-secondary">閉じる</button>
      </div>
    </div>
  `;
  document.getElementById('writeDoneClose').addEventListener('click', closeWriteModal);
}

function initWriteModal() {
  document.getElementById('writeBtn')?.addEventListener('click', openWriteModal);
  document.getElementById('sideWriteBtn')?.addEventListener('click', e => { e.preventDefault(); openWriteModal(); });
  document.getElementById('btabWriteBtn')?.addEventListener('click', e => { e.preventDefault(); openWriteModal(); });
  document.getElementById('writeClose').addEventListener('click', closeWriteModal);
  document.getElementById('writeOverlay').addEventListener('click', closeWriteModal);
}

// openModal / closeModal / CAST_COLORS / castColor / cleanRole / buildCastPhotoHtml は modal.js から使用

// ── おすすめ診断 ──────────────────────────────────────
const diagOverlay  = document.getElementById('diagOverlay');
const diagModalEl  = document.getElementById('diagModal');
const diagCloseBtn = document.getElementById('diagClose');
const diagContent  = document.getElementById('diagContent');

const MOOD_LABELS = { refresh: 'スカッとしたい', think: 'じっくり考えたい', cry: '泣きたい', laugh: '笑いたい' };
const TOTAL_STEPS = 8;

let diagAnswers = {};
function resetDiagAnswers() {
  diagAnswers = { mood: null, genre: null, era: null, dark: null, hero: null, tags: [], time: null, social: null };
}
resetDiagAnswers();

const DIAG_STEPS = [null,
  { key: 'mood',   q: '今の気分は？', opts: [
    { val: 'refresh', label: '⚡ スカッとしたい' },
    { val: 'think',   label: '🤔 じっくり考えたい' },
    { val: 'cry',     label: '😢 泣きたい' },
    { val: 'laugh',   label: '😂 笑いたい' }
  ]},
  { key: 'genre',  q: '好きなジャンルは？', opts: [
    { val: 'movie', label: '🎬 映画' },
    { val: 'anime', label: '✨ アニメ' },
    { val: 'drama', label: '📺 ドラマ' },
    { val: 'all',   label: '🎲 なんでも' }
  ]},
  { key: 'era',    q: '時代・年代は？', opts: [
    { val: 'new',    label: '🆕 最新（2020年代）' },
    { val: 'heisei', label: '📱 平成（1990〜2010年代）' },
    { val: 'showa',  label: '📼 昭和（〜1980年代）' },
    { val: 'any',    label: '🕰️ こだわらない' }
  ]},
  { key: 'dark',   q: 'ダーク・グロテスク系は？', opts: [
    { val: 'ok',       label: '💀 大歓迎' },
    { val: 'moderate', label: '😅 ほどほどならOK' },
    { val: 'no',       label: '🌸 苦手・避けたい' }
  ]},
  { key: 'hero',   q: '主人公のタイプは？', opts: [
    { val: 'hero',   label: '😇 正統派ヒーロー' },
    { val: 'dark',   label: '😈 ダークヒーロー' },
    { val: 'normal', label: '🧑 普通の人が主人公' },
    { val: 'any',    label: '🤷 こだわらない' }
  ]},
  { key: 'tags', q: 'ジャンルタグで選ぶ（複数選択OK）', type: 'multi',
    opts: ['#裏社会','#サスペンス','#恋愛','#青春','#アクション','#ホラー','#コメディ','#SF','#ファンタジー','#泣ける']
  },
  { key: 'time',   q: '見られる時間は？', opts: [
    { val: 'short', label: '⏱️ サクッと（2時間以内）' },
    { val: 'long',  label: '🍿 たっぷり（長くてもOK）' }
  ]},
  { key: 'social', q: '誰と見る？', opts: [
    { val: 'alone',    label: '🧍 一人でじっくり' },
    { val: 'together', label: '👫 誰かと一緒に' },
    { val: 'any',      label: '🤷 こだわらない' }
  ]}
];

function openDiag() {
  resetDiagAnswers();
  renderDiagStep(1);
  diagOverlay.classList.add('active');
  diagModalEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeDiag() {
  if (diagOverlay) diagOverlay.classList.remove('active');
  if (diagModalEl) diagModalEl.classList.remove('active');
  document.body.style.overflow = '';
}

function diagProgressHtml(current) {
  const dots = Array.from({ length: TOTAL_STEPS }, (_, i) => {
    const n = i + 1;
    const cls = n < current ? 'done' : n === current ? 'current' : '';
    return `<span class="diag-dot ${cls}"></span>`;
  }).join('');
  return `<div class="diag-progress">${dots}<span class="diag-step-label">STEP ${current} / ${TOTAL_STEPS}</span></div>`;
}

function renderDiagStep(step) {
  const s = DIAG_STEPS[step];
  if (!s) return;

  if (s.type === 'multi') {
    diagContent.innerHTML = `
      ${diagProgressHtml(step)}
      <h3 class="diag-question">${s.q}</h3>
      <div class="diag-tag-opts" id="diagTagOpts">
        ${s.opts.map(t => `<button class="diag-tag-opt" data-val="${t}" style="${tagStyleStr(t)}">${t}</button>`).join('')}
      </div>
      <div class="diag-multi-footer">
        <button class="diag-skip-btn" id="diagTagSkip">こだわらない（スキップ）</button>
        <button class="diag-next-btn" id="diagTagNext">次へ →</button>
      </div>`;
    diagContent.querySelectorAll('.diag-tag-opt').forEach(btn => {
      btn.addEventListener('click', function() { this.classList.toggle('selected'); });
    });
    document.getElementById('diagTagSkip').addEventListener('click', () => {
      diagAnswers.tags = [];
      renderDiagStep(step + 1);
    });
    document.getElementById('diagTagNext').addEventListener('click', () => {
      diagAnswers.tags = [...diagContent.querySelectorAll('.diag-tag-opt.selected')].map(b => b.dataset.val);
      renderDiagStep(step + 1);
    });
  } else {
    diagContent.innerHTML = `
      ${diagProgressHtml(step)}
      <h3 class="diag-question">${s.q}</h3>
      <div class="diag-options">
        ${s.opts.map(o => `<button class="diag-option" data-step="${step}" data-val="${o.val}">${o.label}</button>`).join('')}
      </div>`;
    diagContent.querySelectorAll('.diag-option').forEach(btn => {
      btn.addEventListener('click', function() { selectDiagOption(Number(this.dataset.step), this.dataset.val); });
    });
  }
}

function selectDiagOption(step, val) {
  const keyMap = { 1:'mood', 2:'genre', 3:'era', 4:'dark', 5:'hero', 7:'time', 8:'social' };
  if (keyMap[step]) diagAnswers[keyMap[step]] = val;
  if (step === TOTAL_STEPS) showDiagResult();
  else renderDiagStep(step + 1);
}

const DARK_TAGS = ['#裏社会', '#グロ注意', '#ホラー', '#サスペンス'];

function getRecommendations() {
  const { mood, genre, era, dark, hero, tags, time, social } = diagAnswers;
  const all = myReviews.concat(reviews).concat(tmdbItems).filter(r => r.synopsis && r.synopsis.trim());

  // ジャンルフィルター
  let pool = (genre && genre !== 'all') ? all.filter(r => r.genre === genre) : all;
  // 時間フィルター（短め → 映画優先）
  if (time === 'short' && (!genre || genre === 'all')) pool = pool.filter(r => r.genre === 'movie');

  // 年代フィルター（結果が少なすぎたら無視）
  if (era && era !== 'any') {
    const filtered = pool.filter(r => {
      const y = Number(r.year);
      if (!y) return true;
      if (era === 'new')    return y >= 2020;
      if (era === 'heisei') return y >= 1990 && y <= 2019;
      if (era === 'showa')  return y <= 1989;
      return true;
    });
    if (filtered.length >= 5) pool = filtered;
  }

  // ダーク系除外
  if (dark === 'no') {
    const filtered = pool.filter(r => !getAllTags(r).some(t => DARK_TAGS.includes(t)));
    if (filtered.length >= 5) pool = filtered;
  }

  // スコアリング
  const scored = pool.map(r => {
    let score = Math.random() * 8;
    const rtags = getAllTags(r);
    const voteBonus = (r._voteAvg || 0) * 4;

    // 気分スコア
    if (mood === 'refresh') { score += voteBonus; if (rtags.includes('#アクション')) score += 30; }
    if (mood === 'think')   { score += Math.min((r.synopsis || '').length / 4, 80); score += voteBonus * 0.5; }
    if (mood === 'cry')     { if (rtags.includes('#泣ける')) score += 90; if (r.genre === 'drama' || r.genre === 'anime') score += 30; }
    if (mood === 'laugh')   { if (rtags.includes('#笑える') || rtags.includes('#コメディ')) score += 90; }

    // ダーク系好み
    if (dark === 'ok') { if (DARK_TAGS.some(t => rtags.includes(t))) score += 50; }

    // 主人公タイプ
    if (hero === 'dark')   { if (rtags.includes('#裏社会') || rtags.includes('#サスペンス')) score += 50; }
    if (hero === 'normal') { if (rtags.includes('#ヒューマンドラマ') || rtags.includes('#青春')) score += 50; }
    if (hero === 'hero')   { if (rtags.includes('#アクション') || rtags.includes('#ファンタジー')) score += 40; }

    // 選択タグ一致
    if (tags && tags.length > 0) {
      score += tags.filter(t => rtags.includes(t)).length * 70;
    }

    // 視聴スタイル
    if (social === 'alone')    score += voteBonus;
    if (social === 'together') { if (rtags.includes('#アクション') || rtags.includes('#コメディ') || rtags.includes('#ホラー')) score += 35; }

    return { review: r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  let results = scored.slice(0, 5).map(s => s.review);
  // 5件未満なら残りをランダム補充
  if (results.length < 5) {
    const used = new Set(results.map(r => r.title));
    results = results.concat(
      all.filter(r => !used.has(r.title)).sort(() => Math.random() - 0.5).slice(0, 5 - results.length)
    );
  }
  return results;
}

const MOOD_REASONS = {
  refresh: ['スカッと爽快な作品です！', '高評価の痛快作。気分が上がります！', 'テンション上がること間違いなし！'],
  think:   ['見応えたっぷりのストーリーです。', '深いテーマが心に刺さります。', 'じっくり楽しめる傑作です。'],
  cry:     ['心に響く感動作です。', '泣ける名作として評判の作品です。', 'ハンカチを用意してください。'],
  laugh:   ['楽しい気分になれる作品です！', '見ていて思わず笑顔になれます。', '気軽に楽しめる人気作です。']
};

function showDiagResult() {
  const results   = getRecommendations();
  const moodLabel = MOOD_LABELS[diagAnswers.mood] || 'あなた';
  const tagLabel  = diagAnswers.tags && diagAnswers.tags.length > 0
    ? `・${diagAnswers.tags.join(' ')}` : '';

  const cardsHtml = results.map(r => {
    const g = r.genre, color = genreColor[g] || '#888';
    const img = r.image
      ? `<img src="${r.image}" alt="${r.title}" class="diag-card-img">`
      : `<div class="diag-card-img diag-card-img-ph" style="background:linear-gradient(135deg,${color}22,${color}44);"><span>${genreIcon[g] || '🎞️'}</span></div>`;
    const reasons = MOOD_REASONS[diagAnswers.mood] || ['あなたにおすすめの作品です。'];
    const reason  = reasons[Math.floor(Math.random() * reasons.length)];
    const rtags   = getAllTags(r).slice(0, 3);
    const tagBadges = rtags.map(t => `<span class="diag-card-tag" style="${tagStyleStr(t)}">${t}</span>`).join('');
    return `
      <div class="diag-result-card" data-title="${r.title.replace(/"/g, '&quot;')}">
        ${img}
        <div class="diag-card-body">
          <span class="genre-tag" style="color:${color};background:${color}22;">${genreLabel[g] || g}</span>
          <p class="diag-card-title">${r.title}</p>
          ${r.year ? `<p class="diag-card-year">${r.year}</p>` : ''}
          ${tagBadges ? `<div class="diag-card-tags">${tagBadges}</div>` : ''}
          <p class="diag-card-reason">${reason}</p>
        </div>
      </div>`;
  }).join('');

  diagContent.innerHTML = `
    <p class="diag-result-label">「${moodLabel}${tagLabel}」あなたへのおすすめ</p>
    <div class="diag-result-list">${cardsHtml}</div>
    <div class="diag-result-actions">
      <button class="diag-retry-btn" id="diagRetry">🔄 もう一度診断する</button>
      <button class="diag-close-result-btn" id="diagCloseResult">閉じる</button>
    </div>`;

  document.getElementById('diagRetry').addEventListener('click', function() {
    resetDiagAnswers();
    renderDiagStep(1);
  });
  document.getElementById('diagCloseResult').addEventListener('click', closeDiag);
  diagContent.querySelectorAll('.diag-result-card').forEach(card => {
    card.addEventListener('click', function() {
      const title  = this.dataset.title;
      const review = myReviews.concat(reviews).concat(tmdbItems).find(r => r.title === title);
      if (review) { closeDiag(); openModal(review); }
    });
  });
}

const _diagBtn = document.getElementById('diagBtn');
if (_diagBtn) _diagBtn.addEventListener('click', openDiag);
document.getElementById('sideDiagBtn')?.addEventListener('click', e => { e.preventDefault(); openDiag(); });
document.getElementById('btabDiagBtn')?.addEventListener('click', e => { e.preventDefault(); openDiag(); });
if (diagCloseBtn) diagCloseBtn.addEventListener('click', closeDiag);
if (diagOverlay) diagOverlay.addEventListener('click', closeDiag);

// ── 特集バナー ポスタースライド ───────────────────────
async function loadTokushuPosters() {
  const rail = document.getElementById('tokushuPosterRail');
  if (!rail) return;
  try {
    // 役所広司のperson_idを取得
    const sRes  = await fetch(`${TMDB_BASE}/search/person?api_key=${TMDB_KEY}&language=ja-JP&query=%E5%BD%B9%E6%89%80%E5%BA%83%E5%8F%B8`);
    const sData = await sRes.json();
    if (!sData.results || sData.results.length === 0) return;
    const personId = sData.results[0].id;

    // 出演作品を取得
    const cRes  = await fetch(`${TMDB_BASE}/person/${personId}/movie_credits?api_key=${TMDB_KEY}&language=ja-JP`);
    const cData = await cRes.json();

    // ポスターありの作品を公開年新しい順にソートして最大20枚
    const movies = (cData.cast || [])
      .filter(m => m.poster_path && m.release_date)
      .sort((a, b) => b.release_date.localeCompare(a.release_date))
      .slice(0, 20);

    if (movies.length === 0) return;

    // ループ用に2回並べる
    const imgs = [...movies, ...movies].map(m => {
      const img = document.createElement('img');
      img.className = 'tokushu-poster-img';
      img.src = TMDB_IMG_BASE + m.poster_path;
      img.alt = m.title || '';
      img.loading = 'lazy';
      return img;
    });
    rail.innerHTML = '';
    imgs.forEach(img => rail.appendChild(img));

    // アニメーション速度をポスター枚数に合わせて調整（1枚あたり約2秒）
    rail.style.animationDuration = `${movies.length * 2}s`;
  } catch(e) {
    // 取得失敗時はレールを非表示にするだけ
    const wrap = document.getElementById('tokushuPosterWrap');
    if (wrap) wrap.style.display = 'none';
  }
}

// ── 初期化 ────────────────────────────────────────────
async function init() {
  initFilter();
  initSearch();
  initWriteModal();
  updateHeaderCounts();

  const grid = document.getElementById('reviewGrid');
  myReviews.concat(reviews).forEach(r => grid.appendChild(createCard(r)));

  const loadingEl = document.createElement('p');
  loadingEl.className = 'empty-msg';
  loadingEl.textContent = '1980〜2025年の作品を読み込んでいます…';
  grid.appendChild(loadingEl);

  loadTokushuPosters();
  await Promise.all([fetchAll2025(), initKuroshiro()]);
  renderReviews('all');
  preloadYomi(myReviews.concat(reviews).concat(tmdbItems));
}

if (document.getElementById('reviewGrid')) init();
