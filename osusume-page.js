// osusume-page.js
// genreLabel / genreColor / genreIcon / TMDB定数 / openModal / favorites / wishlist は modal.js から使用
// fetchPoster / tmdbIdCache は app.js から使用

// 旧形式(ichoshiOverride)からの自動移行
if (!localStorage.getItem('osusumeData') && localStorage.getItem('ichoshiOverride')) {
  try {
    const old = JSON.parse(localStorage.getItem('ichoshiOverride') || '[]');
    localStorage.setItem('osusumeData', JSON.stringify(
      old.map(({ active, period, ...rest }) => rest)
    ));
  } catch(e) {}
  localStorage.removeItem('ichoshiOverride');
}

// osusume.js の作品を常にベースにしつつ、localStorageの編集（コメント等）をマージ
let osusumeData = (() => {
  const base  = (typeof osusume !== 'undefined') ? JSON.parse(JSON.stringify(osusume)) : [];
  const saved = JSON.parse(localStorage.getItem('osusumeData') || 'null');
  if (!saved) return base;
  // base の作品は常に含める（savedにコメントがあれば反映）
  const merged = base.map(b => {
    const s = saved.find(x => x.id === b.id || x.title === b.title);
    return s ? { ...b, comment: s.comment ?? b.comment } : b;
  });
  // 編集画面でユーザーが追加した作品も末尾に追加
  saved.forEach(s => {
    if (!merged.find(m => m.id === s.id || m.title === s.title)) merged.push(s);
  });
  return merged;
})();
const osusumePosters = {};

function saveOsusumeData() {
  localStorage.setItem('osusumeData', JSON.stringify(osusumeData));
}

async function fetchOsusumePoster(item) {
  const key = item.title + (item.year || '');
  if (osusumePosters[key] !== undefined) return osusumePosters[key];
  if (item.tmdbId) {
    const type = item.genre === 'movie' ? 'movie' : 'tv';
    try {
      const res  = await fetch(`${TMDB_BASE}/${type}/${item.tmdbId}?api_key=${TMDB_KEY}&language=ja-JP`);
      const data = await res.json();
      osusumePosters[key] = data.poster_path ? TMDB_IMG_BASE + data.poster_path : null;
    } catch(e) { osusumePosters[key] = null; }
  } else {
    osusumePosters[key] = await fetchPoster(item.title, item.genre, item.year);
  }
  return osusumePosters[key];
}

function createOsusumeCard(item, posterUrl, index) {
  const color = genreColor[item.genre] || '#888';

  // data.js / myReviews から同名作品を検索
  const allData = (typeof reviews !== 'undefined' ? reviews : [])
    .concat(typeof myReviews !== 'undefined' ? myReviews : []);
  const found = allData.find(r => r.title === item.title);

  const stars    = found && found.stars ? found.stars : 0;
  const synopsis = found && found.synopsis ? found.synopsis : '';

  // タグ（modal.js の getAllTags を使用）
  const reviewObj = found || { title: item.title, _genreIds: [] };
  const tags = (typeof getAllTags === 'function') ? getAllTags(reviewObj) : [];

  const starsHtml = stars ? renderStars(stars) : '';
  const tagsHtml  = tags.length > 0
    ? `<div class="osusume-item-tags">${tags.map(t =>
        `<span class="tag-badge" style="${tagStyleStr(t)}">${t}</span>`
      ).join('')}</div>`
    : '';

  const isFav  = favorites.has(item.title);
  const isWish = wishlist.has(item.title);

  // ぼかし背景・ポスター画像
  const bgStyle     = posterUrl ? `background-image:url('${posterUrl}')` : '';
  const posterHtml  = posterUrl
    ? `<img class="osusume-item-poster" src="${posterUrl}" alt="${item.title}" loading="lazy">`
    : `<div class="osusume-item-poster-ph" style="background:linear-gradient(160deg,${color}44,${color}99);">
         <span>${genreIcon[item.genre] || '🎞️'}</span>
       </div>`;

  const section = document.createElement('div');
  section.className = 'osusume-item';
  section.innerHTML = `
    <div class="osusume-item-bg" style="${bgStyle}"></div>
    <div class="osusume-item-overlay"></div>
    <div class="osusume-item-inner">
      <div class="osusume-item-left">
        <div class="osusume-item-poster-wrap">${posterHtml}</div>
      </div>
      <div class="osusume-item-right">
        <div class="osusume-item-meta">
          <span class="osusume-item-number">No.${index + 1}</span>
          <span class="genre-tag" style="color:${color};background:${color}22;">${genreLabel[item.genre] || item.genre}</span>
          ${item.year ? `<span class="card-date">${item.year}</span>` : ''}
        </div>
        <h3 class="osusume-item-title">${item.title}</h3>
        ${starsHtml}
        ${item.comment ? `<blockquote class="osusume-item-comment">${item.comment}</blockquote>` : ''}
        ${synopsis     ? `<p class="osusume-item-synopsis">${synopsis}</p>` : ''}
        ${tagsHtml}
        <div class="osusume-item-actions">
          <button class="osusume-item-btn card-fav-btn${isFav ? ' active' : ''}" data-fav-title="${item.title}">♥ お気に入り</button>
          <button class="osusume-item-btn card-wish-btn${isWish ? ' active' : ''}" data-wish-title="${item.title}">🔖 見たい</button>
          <button class="osusume-item-btn card-line-btn" data-line-title="${item.title}">LINE シェア</button>
          <button class="osusume-detail-btn">詳しく見る →</button>
        </div>
      </div>
    </div>`;

  const cacheKey = item.title + (item.year || '');
  const tmdbId   = item.tmdbId || (typeof tmdbIdCache !== 'undefined' ? tmdbIdCache[cacheKey] : null);
  const modalObj = found || {
    genre: item.genre, title: item.title, year: item.year || '',
    image: posterUrl || '', synopsis: '', recommend: item.comment || '', stars: 0,
    ...(tmdbId ? { _tmdbId: tmdbId, _fromTMDB: true } : {})
  };

  section.querySelector('.card-fav-btn').addEventListener('click',  e => { e.stopPropagation(); toggleFav(item.title, e); });
  section.querySelector('.card-wish-btn').addEventListener('click', e => { e.stopPropagation(); toggleWish(item.title, e); });
  section.querySelector('.card-line-btn').addEventListener('click', e => {
    e.stopPropagation();
    const text = `【${item.title}】を見ました！ #ENTAMEREVIEWで見つけた`;
    window.open('https://social-plugins.line.me/lineit/share?text=' + encodeURIComponent(text), '_blank');
  });
  section.querySelector('.osusume-detail-btn').addEventListener('click', () => openModal(modalObj));

  return section;
}

let currentOsusumeGenre = 'all';

const OSUSUME_TABS = [
  { genre: 'all',   label: 'すべて' },
  { genre: 'movie', label: '映画' },
  { genre: 'drama', label: 'ドラマ' },
  { genre: 'anime', label: 'アニメ' },
];

function buildTabBar() {
  const bar = document.getElementById('osusumeTabBar');
  if (!bar) return;

  const counts = { all: osusumeData.length, movie: 0, drama: 0, anime: 0 };
  osusumeData.forEach(item => { if (counts[item.genre] !== undefined) counts[item.genre]++; });

  bar.innerHTML = OSUSUME_TABS.map(t => `
    <button class="osusume-tab-btn${currentOsusumeGenre === t.genre ? ' active' : ''}" data-genre="${t.genre}">
      ${t.label}<span class="osusume-tab-count">(${counts[t.genre] ?? 0})</span>
    </button>`).join('');

  bar.querySelectorAll('.osusume-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchOsusumeTab(btn.dataset.genre));
  });
}

async function switchOsusumeTab(genre) {
  if (genre === currentOsusumeGenre) return;
  currentOsusumeGenre = genre;

  // アクティブタブを更新
  document.querySelectorAll('.osusume-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.genre === genre);
  });

  // フェードアウト → 描画 → フェードイン
  const grid = document.getElementById('osusumeGrid');
  grid.classList.add('fading');
  await new Promise(r => setTimeout(r, 200));
  renderFilteredItems();
  grid.classList.remove('fading');
}

function renderFilteredItems() {
  const grid = document.getElementById('osusumeGrid');
  if (!grid) return;

  const filtered = currentOsusumeGenre === 'all'
    ? osusumeData
    : osusumeData.filter(item => item.genre === currentOsusumeGenre);

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="osusume-loading">まだ登録されていません</p>';
    return;
  }

  grid.innerHTML = '';
  filtered.forEach((item, i) => {
    const key     = item.title + (item.year || '');
    const poster  = osusumePosters[key] || null;
    grid.appendChild(createOsusumeCard(item, poster, i));
  });
}

async function renderOsusumeGrid() {
  const grid = document.getElementById('osusumeGrid');
  if (!grid) return;
  grid.innerHTML = '<p class="osusume-loading">読み込んでいます…</p>';

  if (!osusumeData || osusumeData.length === 0) {
    buildTabBar();
    grid.innerHTML = '<p class="osusume-loading">おすすめ作品がまだありません</p>';
    return;
  }

  // 全ポスターを並行取得してキャッシュ
  await Promise.all(osusumeData.map(item => fetchOsusumePoster(item)));

  buildTabBar();
  renderFilteredItems();
}

// ── 編集モーダル ──────────────────────────────────────
const ichoshiEditOverlay = document.getElementById('ichoshiEditOverlay');
const ichoshiEditModal   = document.getElementById('ichoshiEditModal');
const ichoshiEditContent = document.getElementById('ichoshiEditContent');

function openIchoshiModal() {
  renderIchoshiEditContent();
  ichoshiEditOverlay.classList.add('active');
  ichoshiEditModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeIchoshiModal() {
  ichoshiEditOverlay.classList.remove('active');
  ichoshiEditModal.classList.remove('active');
  document.body.style.overflow = '';
}

function renderIchoshiEditContent() {
  ichoshiEditContent.innerHTML = `
    <h3 class="write-modal-title">👑 おすすめ編集</h3>
    <div class="ichoshi-edit-list">
      ${osusumeData.map((item, idx) => `
        <div class="ichoshi-edit-item">
          <div class="ichoshi-edit-header">
            <span class="ichoshi-edit-title">${item.title}${item.year ? `　<span class="ichoshi-edit-year">（${item.year}）</span>` : ''}</span>
            <button type="button" class="ichoshi-delete-btn" data-idx="${idx}">削除</button>
          </div>
          <textarea class="form-input form-textarea ichoshi-comment-input" data-idx="${idx}"
            rows="3" placeholder="管理人コメント">${item.comment || ''}</textarea>
        </div>`).join('')}
    </div>

    <div class="ichoshi-edit-add">
      <p class="ichoshi-add-label">＋ 新しいおすすめを追加</p>
      <div class="form-row">
        <input type="text" class="form-input" id="ichoshiAddTitle" placeholder="作品名">
        <select class="form-input" id="ichoshiAddGenre">
          <option value="movie">🎬 映画</option>
          <option value="anime">✨ アニメ</option>
          <option value="drama">📺 ドラマ</option>
        </select>
      </div>
      <input type="text" class="form-input" id="ichoshiAddYear"
        placeholder="年（例：2024）" style="margin-top:8px;">
      <textarea class="form-input form-textarea" id="ichoshiAddComment"
        rows="3" placeholder="管理人コメント" style="margin-top:8px;"></textarea>
      <button type="button" class="ms-cancel-btn" id="ichoshiAddBtn"
        style="margin-top:8px;width:100%;text-align:center;">＋ 追加する</button>
    </div>

    <button type="button" class="form-submit" id="ichoshiSaveBtn" style="margin-top:16px;">保存する</button>`;

  ichoshiEditContent.querySelectorAll('.ichoshi-delete-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      osusumeData.splice(Number(this.dataset.idx), 1);
      renderIchoshiEditContent();
    });
  });

  document.getElementById('ichoshiAddBtn').addEventListener('click', function() {
    const title = document.getElementById('ichoshiAddTitle').value.trim();
    if (!title) { alert('作品名を入力してください'); return; }
    osusumeData.push({
      id:      Date.now(),
      genre:   document.getElementById('ichoshiAddGenre').value,
      title,
      year:    document.getElementById('ichoshiAddYear').value.trim(),
      comment: document.getElementById('ichoshiAddComment').value.trim(),
      tmdbId:  null
    });
    renderIchoshiEditContent();
  });

  document.getElementById('ichoshiSaveBtn').addEventListener('click', function() {
    ichoshiEditContent.querySelectorAll('.ichoshi-comment-input').forEach((el, idx) => {
      if (osusumeData[idx]) osusumeData[idx].comment = el.value.trim();
    });
    saveOsusumeData();
    currentOsusumeGenre = 'all';
    closeIchoshiModal();
    renderOsusumeGrid();
  });
}

document.getElementById('ichoshiBtn').addEventListener('click', openIchoshiModal);
document.getElementById('ichoshiEditClose').addEventListener('click', closeIchoshiModal);
ichoshiEditOverlay.addEventListener('click', closeIchoshiModal);

// ── 初期化 ────────────────────────────────────────────
renderOsusumeGrid();
