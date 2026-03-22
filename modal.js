// ── 管理人モード ──────────────────────────────────────
const ADMIN_PASSWORD = 'ryokawano';

function applyAdminMode() {
  document.body.classList.add('admin-mode');
  _adminBtn.textContent = '🔓';
  _adminBtn.title = 'ログアウト';
  if (!document.querySelector('.admin-indicator')) {
    const ind = document.createElement('div');
    ind.className = 'admin-indicator';
    ind.textContent = '🔑 管理人モード';
    document.body.appendChild(ind);
  }
}

// ログインボタン（固定）
const _adminBtn = document.createElement('button');
_adminBtn.className = 'admin-login-btn';
_adminBtn.textContent = '🔑';
_adminBtn.title = '管理人ログイン';
document.body.appendChild(_adminBtn);

// ログインモーダル
const _loginOverlay = document.createElement('div');
_loginOverlay.className = 'login-overlay';
const _loginModal = document.createElement('div');
_loginModal.className = 'login-modal';
_loginModal.innerHTML = `
  <h3 class="login-title">🔑 管理人ログイン</h3>
  <input type="password" id="adminPwInput" class="login-input" placeholder="パスワード">
  <p class="login-error" id="loginError"></p>
  <div class="login-btns">
    <button id="loginSubmit" class="login-submit-btn">ログイン</button>
    <button id="loginCancel" class="login-cancel-btn">キャンセル</button>
  </div>`;
document.body.appendChild(_loginOverlay);
document.body.appendChild(_loginModal);

function openLoginModal() {
  _loginOverlay.classList.add('active');
  _loginModal.classList.add('active');
  document.getElementById('adminPwInput').value = '';
  document.getElementById('loginError').textContent = '';
  setTimeout(() => document.getElementById('adminPwInput').focus(), 50);
}
function closeLoginModal() {
  _loginOverlay.classList.remove('active');
  _loginModal.classList.remove('active');
}

document.getElementById('loginSubmit').addEventListener('click', function() {
  const pw = document.getElementById('adminPwInput').value;
  if (pw === ADMIN_PASSWORD) {
    localStorage.setItem('adminMode', '1');
    closeLoginModal();
    applyAdminMode();
  } else {
    document.getElementById('loginError').textContent = 'パスワードが違います';
    document.getElementById('adminPwInput').value = '';
    document.getElementById('adminPwInput').focus();
  }
});
document.getElementById('adminPwInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('loginSubmit').click();
});
document.getElementById('loginCancel').addEventListener('click', closeLoginModal);
_loginOverlay.addEventListener('click', closeLoginModal);

_adminBtn.addEventListener('click', function() {
  if (localStorage.getItem('adminMode')) {
    // ログアウト
    localStorage.removeItem('adminMode');
    document.body.classList.remove('admin-mode');
    _adminBtn.textContent = '🔑';
    _adminBtn.title = '管理人ログイン';
    document.querySelector('.admin-indicator')?.remove();
  } else {
    openLoginModal();
  }
});

// ページ読み込み時にログイン済みなら適用
const isAdmin = !!localStorage.getItem('adminMode');
if (isAdmin) applyAdminMode();

// ── ジャンル設定 ──────────────────────────────────────
const genreLabel = { anime: 'アニメ', movie: '映画', drama: 'ドラマ' };
const genreColor = { anime: '#7f77dd', movie: '#f0997b', drama: '#ed93b1' };
const genreIcon  = { anime: '✨', movie: '🎬', drama: '📺' };

// ── TMDB API 設定 ─────────────────────────────────────
const TMDB_KEY      = 'acb6aa56f60387a6985935f25c94704e';
const TMDB_BASE     = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const posterCache          = {};
const tmdbIdCache          = {};   // title+year → TMDB ID
const creditsCache         = {};
const watchProvidersCache  = {};

// ── 手動配信サービス ─────────────────────────────────
const STREAMING_SERVICES = [
  { name: 'Netflix',            color: '#E50914' },
  { name: 'Disney+',            color: '#0063e5' },
  { name: 'Amazon Prime Video', color: '#00a8e0' },
  { name: 'U-NEXT',             color: '#888888' },
  { name: 'Hulu',               color: '#3dba65' },
  { name: 'Apple TV+',         color: '#6e6e73' },
  { name: 'ABEMA',              color: '#6038b4' },
  { name: 'dアニメストア',       color: '#1a6fd4' },
  { name: 'FOD',                color: '#f47f00' },
  { name: 'DMM TV',             color: '#333333' },
];
let manualStreaming = JSON.parse(localStorage.getItem('manualStreaming') || '{}');
function saveManualStreaming() {
  localStorage.setItem('manualStreaming', JSON.stringify(manualStreaming));
}
function buildManualStreamingHtml(title) {
  const services = manualStreaming[title];
  const badges = services && services.length > 0
    ? `<div class="ms-badges">${services.map(s => {
        const svc = STREAMING_SERVICES.find(x => x.name === s);
        return `<span class="ms-badge" style="background:${svc ? svc.color : '#555'}">${s}</span>`;
      }).join('')}</div>`
    : '';
  const btnLabel = services && services.length > 0 ? '📺 配信情報を編集' : '📺 配信情報を追加';
  return `${badges}<button class="ms-add-btn admin-only" id="msAddBtn">${btnLabel}</button>`;
}
function openManualStreamingEdit(title) {
  const current = manualStreaming[title] || [];
  const section = document.getElementById('manualStreamingSection');
  section.innerHTML = `
    <div class="ms-edit-area">
      <p class="ms-edit-label">📺 配信中のサービスにチェックを入れてください</p>
      <div class="ms-checkboxes">
        ${STREAMING_SERVICES.map(s => `
          <label class="ms-check-item">
            <input type="checkbox" value="${s.name}"${current.includes(s.name) ? ' checked' : ''}>
            <span class="ms-check-dot" style="background:${s.color}"></span>
            ${s.name}
          </label>`).join('')}
      </div>
      <div class="ms-edit-btns">
        <button class="ms-save-btn" id="msSaveBtn">保存する</button>
        <button class="ms-cancel-btn" id="msCancelBtn">キャンセル</button>
      </div>
    </div>`;
  document.getElementById('msSaveBtn').addEventListener('click', function() {
    const checked = [...section.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
    if (checked.length > 0) manualStreaming[title] = checked;
    else delete manualStreaming[title];
    saveManualStreaming();
    section.innerHTML = buildManualStreamingHtml(title);
    document.getElementById('msAddBtn').addEventListener('click', () => openManualStreamingEdit(title));
  });
  document.getElementById('msCancelBtn').addEventListener('click', function() {
    section.innerHTML = buildManualStreamingHtml(title);
    document.getElementById('msAddBtn').addEventListener('click', () => openManualStreamingEdit(title));
  });
}

// ── ジャンルタグ ──────────────────────────────────────
const PRESET_TAGS = [
  '#裏社会', '#サスペンス', '#恋愛', '#青春', '#ヒューマンドラマ',
  '#アクション', '#ホラー', '#コメディ', '#SF', '#ファンタジー',
  '#泣ける', '#笑える', '#考えさせられる', '#グロ注意', '#胸熱',
  '#実話ベース', '#続編あり', '#原作あり', '#Netflix限定', '#名作', '#スポーツ'
];
let reviewTags      = JSON.parse(localStorage.getItem('reviewTags') || '{}');
let currentTagFilter = null;
let formSelectedTags = [];

function saveReviewTags() {
  localStorage.setItem('reviewTags', JSON.stringify(reviewTags));
}

// ── 自動タグ付け ─────────────────────────────────────
const TMDB_GENRE_TAG_MAP = {
  28: '#アクション', 12: '#アクション', 10759: '#アクション',
  35: '#コメディ',
  18: '#ヒューマンドラマ',
  14: '#ファンタジー', 10765: '#ファンタジー',
  27: '#ホラー',
  9648: '#サスペンス', 53: '#サスペンス',
  10749: '#恋愛',
  878: '#SF',
  80: '#裏社会',
  36: '#実話ベース', 99: '#実話ベース',
  10752: '#実話ベース', // War
};
const SYNOPSIS_TAG_RULES = [
  { re: /刑事|警察|ヤクザ|暴力団|犯罪|殺人|組長|裏社会/, tag: '#裏社会' },
  { re: /刑事|謎|事件|殺人|陰謀|謀略|スパイ|犯人/, tag: '#サスペンス' },
  { re: /恋愛|恋人|告白|片思い|初恋|ラブ/, tag: '#恋愛' },
  { re: /青春|学生|高校|大学生|部活|甲子園/, tag: '#青春' },
  { re: /ロボット|宇宙|未来|AI|サイボーグ|タイムトラベル/, tag: '#SF' },
  { re: /魔法|妖怪|異世界|ドラゴン|剣と魔法/, tag: '#ファンタジー' },
  { re: /実話|実際の|実在|ノンフィクション|史実/, tag: '#実話ベース' },
  { re: /感動|涙|泣|号泣/, tag: '#泣ける' },
  { re: /笑|コメディ|ギャグ|ユーモア/, tag: '#笑える' },
];
function getAutoTags(review) {
  const tags = new Set();
  // TMDB ジャンルIDから
  (review._genreIds || []).forEach(id => {
    if (TMDB_GENRE_TAG_MAP[id]) tags.add(TMDB_GENRE_TAG_MAP[id]);
  });
  // あらすじキーワードから
  const s = review.synopsis || '';
  SYNOPSIS_TAG_RULES.forEach(({ re, tag }) => { if (re.test(s)) tags.add(tag); });
  return [...tags];
}
function getAllTags(review) {
  const manual   = reviewTags[review.title] || [];
  const auto     = getAutoTags(review);
  const combined = [...manual];
  auto.forEach(t => { if (!combined.includes(t)) combined.push(t); });
  return combined;
}

function getTagColor(tag) {
  const t = tag.replace(/^#/, '');
  if (['裏社会','サスペンス','グロ注意','ホラー'].some(k => t.includes(k)))
    return { bg:'#4a0a0a', text:'#ffaaaa', border:'#7a1a1a' };
  if (['恋愛','青春','ヒューマンドラマ'].some(k => t.includes(k)))
    return { bg:'#3e0a22', text:'#ffaad4', border:'#7a1a44' };
  if (['アクション','SF','ファンタジー'].some(k => t.includes(k)))
    return { bg:'#0a1e3e', text:'#aaccff', border:'#1a3a7a' };
  if (['泣ける','笑える','考えさせられる','胸熱','コメディ'].some(k => t.includes(k)))
    return { bg:'#2e2200', text:'#ffd84d', border:'#5a4400' };
  return { bg:'#1a1a2a', text:'#9999cc', border:'#2e2e48' };
}
function tagStyleStr(tag) {
  const c = getTagColor(tag);
  return `background:${c.bg};color:${c.text};border:1px solid ${c.border}`;
}
function buildTagSectionHtml(title, review) {
  const allTags  = review ? getAllTags(review) : (reviewTags[title] || []);
  const manual   = reviewTags[title] || [];
  const badges = allTags.length > 0
    ? `<div class="tag-badges">${allTags.map(t => {
        const isAuto = !manual.includes(t);
        return `<span class="tag-badge${isAuto ? ' tag-auto' : ''}" data-tag="${t}" style="${tagStyleStr(t)}" title="${isAuto ? '自動タグ' : '手動タグ'}">${t}</span>`;
      }).join('')}</div>`
    : '';
  const btnLabel = manual.length > 0 ? '🏷️ タグを編集' : '🏷️ タグを追加';
  return `${badges}<button class="ms-add-btn admin-only" id="tagAddBtn">${btnLabel}</button>`;
}
function openTagEdit(title) {
  const current = reviewTags[title] || [];
  let selected  = [...current];
  const section = document.getElementById('tagSection');
  section.innerHTML = `
    <div class="ms-edit-area">
      <p class="ms-edit-label">🏷️ タグを選択してください（複数OK）</p>
      <div class="tag-preset-select" id="tagPresetSelect">
        ${PRESET_TAGS.map(t => `<button type="button" class="tag-preset-btn${selected.includes(t) ? ' selected' : ''}" data-tag="${t}" style="${tagStyleStr(t)}">${t}</button>`).join('')}
      </div>
      <div class="tag-custom-row">
        <input type="text" class="form-input" id="tagCustomInput" placeholder="カスタムタグ（Enter で追加・# は自動）">
      </div>
      <div id="tagSelectedPreview" class="selected-tags-preview"></div>
      <div class="ms-edit-btns">
        <button type="button" class="ms-save-btn" id="tagSaveBtn">保存する</button>
        <button type="button" class="ms-cancel-btn" id="tagCancelBtn">キャンセル</button>
      </div>
    </div>`;

  function refreshPreview() {
    const pv = document.getElementById('tagSelectedPreview');
    if (!pv) return;
    pv.innerHTML = selected.map(t =>
      `<span class="tag-badge" style="${tagStyleStr(t)}">${t}<button type="button" class="tag-remove-btn" data-tag="${t}">×</button></span>`
    ).join('');
    pv.querySelectorAll('.tag-remove-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        selected = selected.filter(s => s !== btn.dataset.tag);
        const pb = section.querySelector(`.tag-preset-btn[data-tag="${btn.dataset.tag}"]`);
        if (pb) pb.classList.remove('selected');
        refreshPreview();
      });
    });
  }
  refreshPreview();

  section.querySelectorAll('.tag-preset-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tag = this.dataset.tag;
      if (selected.includes(tag)) { selected = selected.filter(s => s !== tag); this.classList.remove('selected'); }
      else { selected.push(tag); this.classList.add('selected'); }
      refreshPreview();
    });
  });

  document.getElementById('tagCustomInput').addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    let val = this.value.trim();
    if (!val) return;
    if (!val.startsWith('#')) val = '#' + val;
    if (!selected.includes(val)) { selected.push(val); refreshPreview(); }
    this.value = '';
  });

  document.getElementById('tagSaveBtn').addEventListener('click', function() {
    if (selected.length > 0) reviewTags[title] = selected;
    else delete reviewTags[title];
    saveReviewTags();
    // モーダル内タグ表示を更新
    section.innerHTML = buildTagSectionHtml(title, currentOpenReview);
    wireTagSectionBtns(title);
    // カードグリッドのタグも再描画
    if (typeof renderReviews === 'function' && typeof currentGenre !== 'undefined') {
      renderReviews(currentGenre);
    }
  });
  document.getElementById('tagCancelBtn').addEventListener('click', function() {
    section.innerHTML = buildTagSectionHtml(title, currentOpenReview);
    wireTagSectionBtns(title);
  });
}
function wireTagSectionBtns(title) {
  const btn = document.getElementById('tagAddBtn');
  if (btn) btn.addEventListener('click', () => openTagEdit(title));
  document.querySelectorAll('#tagSection .tag-badge[data-tag]').forEach(b => {
    b.addEventListener('click', () => setTagFilter(b.dataset.tag));
  });
}

// ── タグフィルター ─────────────────────────────────────
function setTagFilter(tag) {
  currentTagFilter = (currentTagFilter === tag) ? null : tag;
  updateTagFilterUI();
  if (typeof renderReviews === 'function') {
    renderReviews(typeof currentGenre !== 'undefined' ? currentGenre : 'all');
  }
}
function updateTagFilterUI() {
  const existing = document.getElementById('activeTagFilter');
  if (existing) existing.remove();
  if (!currentTagFilter) return;
  const div = document.createElement('div');
  div.id = 'activeTagFilter';
  div.className = 'active-tag-filter';
  div.innerHTML = `タグで絞り込み中：<span class="filter-tag-badge" style="${tagStyleStr(currentTagFilter)}">${currentTagFilter}</span><button class="clear-tag-btn" id="clearTagBtn">✕ 解除</button>`;
  const searchBar = document.getElementById('searchBar');
  if (searchBar) {
    searchBar.after(div);
  } else {
    document.body.prepend(div);
  }
  document.getElementById('clearTagBtn').addEventListener('click', () => setTagFilter(currentTagFilter));
}

// ── お気に入り・見たい ────────────────────────────────
let favorites = new Set(JSON.parse(localStorage.getItem('favorites') || '[]'));
let wishlist  = new Set(JSON.parse(localStorage.getItem('wishlist')  || '[]'));

function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify([...favorites]));
  updateHeaderCounts();
}
function saveWishlist() {
  localStorage.setItem('wishlist', JSON.stringify([...wishlist]));
  updateHeaderCounts();
}
function updateHeaderCounts() {
  const fn = document.getElementById('favNum');
  const wn = document.getElementById('wishNum');
  if (fn) fn.textContent = favorites.size;
  if (wn) wn.textContent = wishlist.size;
}

function toggleFav(title, e) {
  if (e) e.stopPropagation();
  if (favorites.has(title)) favorites.delete(title);
  else favorites.add(title);
  saveFavorites();
  document.querySelectorAll('.card-fav-btn').forEach(btn => {
    if (btn.dataset.favTitle === title) btn.classList.toggle('active', favorites.has(title));
  });
  const mb = document.getElementById('modalFavBtn');
  if (mb && mb.dataset.title === title) mb.classList.toggle('active', favorites.has(title));
  if (typeof currentGenre !== 'undefined' && currentGenre === 'favorites' && typeof renderReviews === 'function') renderReviews('favorites');
}

function toggleWish(title, e) {
  if (e) e.stopPropagation();
  if (wishlist.has(title)) wishlist.delete(title);
  else wishlist.add(title);
  saveWishlist();
  document.querySelectorAll('.card-wish-btn').forEach(btn => {
    if (btn.dataset.wishTitle === title) btn.classList.toggle('active', wishlist.has(title));
  });
  const mb = document.getElementById('modalWishBtn');
  if (mb && mb.dataset.title === title) mb.classList.toggle('active', wishlist.has(title));
  if (typeof currentGenre !== 'undefined' && currentGenre === 'wishlist' && typeof renderReviews === 'function') renderReviews('wishlist');
}

// ── Xシェア ───────────────────────────────────────────
function shareX(title, stars, e) {
  if (e) e.stopPropagation();
  const starStr = '★'.repeat(stars || 0) + '☆'.repeat(5 - (stars || 0));
  const text = `【${title}】を見ました！おすすめ度：${starStr} #ENTAMEREVIEWで見つけた`;
  window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank');
}

// ── LINEシェア ─────────────────────────────────────────
function shareLine(title, stars, e) {
  if (e) e.stopPropagation();
  const starStr = '★'.repeat(stars || 0) + '☆'.repeat(5 - (stars || 0));
  const text = `【${title}】を見ました！おすすめ度：${starStr} #ENTAMEREVIEWで見つけた`;
  window.open('https://social-plugins.line.me/lineit/share?text=' + encodeURIComponent(text), '_blank');
}

// ── 配信サービス取得 ──────────────────────────────────
async function fetchWatchProviders(tmdbId, genre) {
  const key = `${tmdbId}_${genre}`;
  if (key in watchProvidersCache) return watchProvidersCache[key];
  const type = genre === 'movie' ? 'movie' : 'tv';
  const url  = `${TMDB_BASE}/${type}/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    watchProvidersCache[key] = data.results?.JP || null;
  } catch (e) {
    watchProvidersCache[key] = undefined; // エラー
  }
  return watchProvidersCache[key];
}

function buildProvidersHtml(jp) {
  if (jp === undefined) {
    return '<p class="wp-none">配信情報を取得できませんでした</p>';
  }
  if (!jp) {
    return '<p class="wp-none">日本での配信情報なし</p>';
  }

  const LOGO = 'https://image.tmdb.org/t/p/w45';
  const sections = [
    { key: 'flatrate', label: '見放題' },
    { key: 'rent',     label: 'レンタル' },
    { key: 'buy',      label: '購入' },
  ];

  let html = '';
  sections.forEach(({ key, label }) => {
    const list = jp[key];
    if (!list || list.length === 0) return;
    html += `<div class="wp-section">
      <span class="wp-label">${label}</span>
      <div class="wp-logos">
        ${list.map(p => `<img class="wp-logo" src="${LOGO}${p.logo_path}" alt="${p.provider_name}" title="${p.provider_name}" loading="lazy">`).join('')}
      </div>
    </div>`;
  });

  return html || '<p class="wp-none">日本での配信情報なし</p>';
}

// ── クレジット取得 ────────────────────────────────────
async function fetchTmdbRelated(tmdbId, genre) {
  const type = genre === 'movie' ? 'movie' : 'tv';
  try {
    const res  = await fetch(`${TMDB_BASE}/${type}/${tmdbId}/recommendations?api_key=${TMDB_KEY}&language=ja-JP`);
    const data = await res.json();
    const items = (data.results || []).filter(m => m.poster_path).slice(0, 4);
    if (items.length > 0) return items;
    // 0件なら similar にフォールバック
    const res2  = await fetch(`${TMDB_BASE}/${type}/${tmdbId}/similar?api_key=${TMDB_KEY}&language=ja-JP`);
    const data2 = await res2.json();
    return (data2.results || []).filter(m => m.poster_path).slice(0, 4);
  } catch(e) { return []; }
}

async function fetchCredits(tmdbId, genre) {
  const key = `${tmdbId}_${genre}`;
  // castFullがない古いキャッシュは使い直す
  if (creditsCache[key] && creditsCache[key].castFull) return creditsCache[key];
  const isMovie = genre === 'movie';
  const url = isMovie
    ? `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&language=ja-JP&append_to_response=credits`
    : `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}&language=ja-JP&append_to_response=credits`;
  try {
    const res  = await fetch(url);
    if (!res.ok) { console.error(`fetchCredits: HTTP ${res.status} for tmdbId=${tmdbId}`); throw new Error(res.status); }
    const data = await res.json();
    let creator = '', castLabel = '出演', cast = [];
    const tagline = data.tagline || '';
    const rawCast = (data.credits?.cast || []).slice(0, 20);

    const castFull = rawCast.map(c => {
      let profile = null;
      if (c.profile_path) {
        const path = c.profile_path.startsWith('/') ? c.profile_path : '/' + c.profile_path;
        profile = 'https://image.tmdb.org/t/p/w185' + path;
      }
      return { id: c.id, name: c.name, character: c.character || '', profile };
    });
    if (isMovie) {
      const dir = (data.credits?.crew || []).find(c => c.job === 'Director');
      creator   = dir ? `監督：${dir.name}` : '';
      cast      = rawCast.map(c => c.name);
    } else if (genre === 'anime') {
      const cb  = (data.created_by || [])[0];
      creator   = cb ? `原作：${cb.name}` : '';
      cast      = rawCast.map(c => c.name);
      castLabel = '声優';
    } else {
      const cb  = (data.created_by || [])[0];
      creator   = cb ? `脚本・制作：${cb.name}` : '';
      cast      = rawCast.map(c => c.name);
    }
    creditsCache[key] = { creator, castLabel, cast, castFull, tagline };
  } catch (e) {
    console.error(`fetchCredits エラー tmdbId=${tmdbId}:`, e);
    creditsCache[key] = { creator: '', castLabel: '出演', cast: [], castFull: [] };
  }
  return creditsCache[key];
}

// ── 星レンダリング ────────────────────────────────────
function renderStars(stars) {
  if (!stars || stars === 0) return '';
  let html = '<div class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= stars ? 'filled' : 'empty'}">${i <= stars ? '★' : '☆'}</span>`;
  }
  return html + '</div>';
}

// ── キャスト写真HTML ──────────────────────────────────
const CAST_COLORS = [
  ['#c0392b','#e74c3c'],['#8e44ad','#9b59b6'],['#1a5276','#2980b9'],
  ['#117a65','#1abc9c'],['#784212','#d35400'],['#1c2833','#2c3e50'],
  ['#6c3483','#8e44ad'],['#0e6655','#16a085'],['#922b21','#cb4335'],
  ['#154360','#1f618d'],
];
function castColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return CAST_COLORS[h % CAST_COLORS.length];
}

// 役名のクリーニング（英語表記・voice等を除去）
function cleanRole(role) {
  if (!role) return '';
  // "(voice)" "(Voice)" など括弧内を除去
  let cleaned = role.replace(/\s*\([^)]*\)/g, '').trim();
  // 日本語文字を含まない場合は非表示
  if (cleaned && !/[\u3040-\u30FF\u4E00-\u9FFF]/.test(cleaned)) return '';
  return cleaned;
}

function buildCastPhotoHtml(castItems, label) {
  if (!castItems || castItems.length === 0) return '';
  return `
    <p class="modal-section-label">${label}</p>
    <div class="modal-cast-photo-list">
      ${castItems.map(c => {
        const id      = typeof c === 'object' ? c.id      : null;
        const name    = typeof c === 'string' ? c : c.name;
        const role    = cleanRole(typeof c === 'object' ? c.character : '');
        const profile = typeof c === 'object' ? c.profile   : null;
        const initial = name.charAt(0);
        const [bg1, bg2] = castColor(name);
        const phStyle = `background:linear-gradient(135deg,${bg1},${bg2});`;
        const photoHtml = profile
          ? `<div class="cast-photo-frame">
               <div class="cast-photo-ph" style="${phStyle}">${initial}</div>
               <img class="cast-photo-img" src="${profile}" alt="${name}" onerror="this.style.display='none'">
             </div>`
          : `<div class="cast-photo-ph" style="${phStyle}">${initial}</div>`;
        const inner = `
            ${photoHtml}
            <p class="cast-photo-name">${name}</p>
            ${role ? `<p class="cast-photo-role">${role}</p>` : ''}`;
        return id
          ? `<a href="actor-detail.html?id=${id}" class="modal-cast-photo-item cast-link">${inner}</a>`
          : `<div class="modal-cast-photo-item">${inner}</div>`;
      }).join('')}
    </div>`;
}

// ── モーダル DOM ──────────────────────────────────────
const modalOverlay = document.getElementById('modalOverlay');
const modal        = document.getElementById('modal');
const modalClose   = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');

// ── ポスター拡大ズーム ─────────────────────────────────
const _zoomOverlay = document.createElement('div');
_zoomOverlay.id = 'posterZoomOverlay';
const _zoomImg = document.createElement('img');
_zoomImg.id = 'posterZoomImg';
_zoomImg.alt = 'ポスター拡大';
_zoomOverlay.appendChild(_zoomImg);
document.body.appendChild(_zoomOverlay);

function openPosterZoom(src) {
  _zoomImg.src = src;
  _zoomOverlay.classList.add('active');
}
function closePosterZoom() {
  _zoomOverlay.classList.remove('active');
}
_zoomOverlay.addEventListener('click', closePosterZoom);

let currentOpenReview = null;

async function openModal(review) {
  currentOpenReview = review;
  const g         = review.genre;
  const color     = genreColor[g] || '#888';
  const safeTitle = review.title.replace(/"/g, '&quot;');
  const posterUrl = review.image || '';
  const bgStyle   = posterUrl ? `style="background-image:url('${posterUrl.replace(/'/g, "\\'")}')"` : '';

  const posterInner = posterUrl
    ? `<img class="modal-poster-img" src="${posterUrl}" alt="${review.title}">`
    : `<div class="modal-poster-ph" style="background:linear-gradient(160deg,${color}44,${color}99);">
         <span class="modal-ph-icon">${genreIcon[g] || '🎞️'}</span>
         <span class="modal-ph-title">${review.title}</span>
       </div>`;

  const allItems = (typeof myReviews !== 'undefined' ? myReviews : []).concat(typeof reviews !== 'undefined' ? reviews : []).concat(typeof tmdbItems !== 'undefined' ? tmdbItems : []);

  // キャスト（初期表示：data.jsに含まれる場合のみ）
  const initialCast = review.cast && review.cast.length > 0
    ? buildCastPhotoHtml(review.cast, g === 'anime' ? '声優' : '出演')
    : '';

  modalContent.innerHTML = `
    <div class="modal-hero">
      <div class="modal-hero-bg" id="modalHeroBg" ${bgStyle}></div>
      <div class="modal-hero-overlay"></div>
      <div class="modal-hero-content">
        <div class="modal-hero-poster" id="modal-left">
          <div class="modal-poster-wrap">${posterInner}</div>
        </div>
        <div class="modal-hero-info">
          <div class="modal-meta">
            <span class="genre-tag" style="color:${color};background:${color}22;">${genreLabel[g] || g}</span>
            ${review.year ? `<span class="card-date">${review.year}</span>` : ''}
          </div>
          <h2 class="modal-title">${review.title}</h2>
          <p class="modal-creator" id="modal-creator">${review.creator || ''}</p>
          ${renderStars(review.stars)}
          <div class="modal-action-bar">
            <button class="modal-action-btn modal-fav-btn ${favorites.has(review.title) ? 'active' : ''}" id="modalFavBtn" data-title="${safeTitle}">♥ お気に入り</button>
            <button class="modal-action-btn modal-wish-btn ${wishlist.has(review.title) ? 'active' : ''}" id="modalWishBtn" data-title="${safeTitle}">🔖 見たい</button>
            <button class="modal-action-btn modal-share-btn" id="modalShareBtn">𝕏 シェア</button>
            <button class="modal-action-btn modal-line-btn" id="modalLineBtn">LINE シェア</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-body">
      ${review.synopsis ? `
        <div class="modal-section">
          <p class="modal-section-label">あらすじ</p>
          <p class="modal-synopsis">${review.synopsis}</p>
        </div>` : '<div id="synopsisSection"></div>'}
      ${review.recommend ? `
        <div class="modal-section">
          <p class="modal-section-label">おすすめ一言</p>
          <p class="modal-recommend" data-manual="1"><span class="recommend-icon">💬</span>${review.recommend}</p>
        </div>` : '<div class="modal-section" id="recommendSection" style="display:none"></div>'}
      <div class="modal-section" id="tagSection">${buildTagSectionHtml(review.title, review)}</div>
      <div class="modal-section" id="manualStreamingSection">${buildManualStreamingHtml(review.title)}</div>
      ${review._tmdbId ? '<div class="modal-section watch-providers" id="watchProviders"><p class="wp-loading">取得中…</p></div>' : ''}
      <div class="modal-section" id="modal-cast-area">${initialCast}</div>
      <div id="relatedSection"></div>
    </div>
  `;

  document.getElementById('modalFavBtn').addEventListener('click', e => { e.stopPropagation(); toggleFav(review.title); });
  document.getElementById('modalWishBtn').addEventListener('click', e => { e.stopPropagation(); toggleWish(review.title); });
  document.getElementById('modalShareBtn').addEventListener('click', e => shareX(review.title, review.stars, e));
  document.getElementById('modalLineBtn').addEventListener('click', e => shareLine(review.title, review.stars, e));
  wireTagSectionBtns(review.title);
  document.getElementById('msAddBtn').addEventListener('click', () => openManualStreamingEdit(review.title));

  modalOverlay.classList.add('active');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // ポスタークリックで拡大
  const _posterWrap = modalContent.querySelector('.modal-poster-wrap');
  if (_posterWrap) {
    _posterWrap.classList.add('zoomable');
    _posterWrap.addEventListener('click', () => {
      const img = _posterWrap.querySelector('.modal-poster-img');
      if (img) openPosterZoom(img.src);
    });
  }

  if (review._tmdbId) {
    // 配信サービス（並行取得）
    fetchWatchProviders(review._tmdbId, g).then(jp => {
      const el = document.getElementById('watchProviders');
      if (el) el.innerHTML = `<p class="wp-title">📺 配信サービス</p>${buildProvidersHtml(jp)}`;
    });

    const credits = await fetchCredits(review._tmdbId, g);
    if (credits.creator) {
      const el = document.getElementById('modal-creator');
      if (el) el.textContent = credits.creator;
    }
    // キャッチコピーをおすすめ欄に表示（手動入力がない場合）
    if (credits.tagline) {
      const recSec = document.getElementById('recommendSection');
      if (recSec && recSec.style.display === 'none') {
        recSec.style.display = '';
        recSec.innerHTML = `
          <div class="modal-section">
            <p class="modal-section-label">おすすめ一言</p>
            <p class="modal-recommend"><span class="recommend-icon">💬</span>${credits.tagline}</p>
          </div>`;
      }
    }
    // キャスト（写真付き）
    if (credits.castFull && credits.castFull.length > 0) {
      const castArea = document.getElementById('modal-cast-area');
      if (castArea) castArea.innerHTML = buildCastPhotoHtml(credits.castFull, credits.castLabel);
    }

    // 関連作品（TMDB recommendations → similar にフォールバック）
    fetchTmdbRelated(review._tmdbId, g).then(items => {
      const sec = document.getElementById('relatedSection');
      if (!sec || items.length === 0) return;
      sec.innerHTML = `
        <div class="modal-section">
          <p class="modal-section-label">関連作品</p>
          <div class="modal-related-grid">
            ${items.map(m => {
              const title = m.title || m.name || '';
              const year  = (m.release_date || m.first_air_date || '').slice(0, 4);
              const img   = m.poster_path ? TMDB_IMG_BASE + m.poster_path : '';
              return `
                <div class="modal-related-card" data-tmdb-id="${m.id}" data-media="${g}">
                  ${img
                    ? `<img class="modal-related-poster" src="${img}" alt="${title}" loading="lazy">`
                    : `<div class="modal-related-ph">${genreIcon[g] || '🎞️'}</div>`}
                  <div class="modal-related-info">
                    <p class="modal-related-title">${title}</p>
                    ${year ? `<p class="modal-related-year">${year}</p>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
      // クリックで詳細モーダルに切り替え
      sec.querySelectorAll('.modal-related-card').forEach((card, i) => {
        card.addEventListener('click', () => {
          const m = items[i];
          const title = m.title || m.name || '';
          const year  = (m.release_date || m.first_air_date || '').slice(0, 4);
          const img   = m.poster_path ? TMDB_IMG_BASE + m.poster_path : '';
          // ローカルデータに同名作品があれば優先
          const found = allItems.find(r => r.title === title);
          openModal(found || {
            genre: g, title, year, image: img,
            synopsis: m.overview || '', recommend: '', stars: 0,
            _tmdbId: m.id, _fromTMDB: true
          });
        });
      });
    });
  }

  // ポスター後取得（data.jsの作品など）
  if (!posterUrl && !review._fromTMDB) {
    const url = await fetchPoster(review.title, g, review.year);
    if (url) {
      const wrap = document.getElementById('modal-left')?.querySelector('.modal-poster-wrap');
      if (wrap) wrap.innerHTML = `<img class="modal-poster-img" src="${url}" alt="${review.title}">`;
      const bg = document.getElementById('modalHeroBg');
      if (bg) bg.style.backgroundImage = `url('${url.replace(/'/g, "\\'")}')`;
    }
    // TMDBで見つかったIDを使ってクレジット（キャスト写真）も取得
    const cacheKey  = review.title + (review.year || '');
    const foundId   = tmdbIdCache[cacheKey];
    if (foundId) {
      const credits = await fetchCredits(foundId, g);
      if (credits.creator) {
        const el = document.getElementById('modal-creator');
        if (el && !el.textContent) el.textContent = credits.creator;
      }
      if (credits.castFull && credits.castFull.length > 0) {
        const castArea = document.getElementById('modal-cast-area');
        if (castArea) castArea.innerHTML = buildCastPhotoHtml(credits.castFull, credits.castLabel);
      }
      if (credits.tagline) {
        const recSec = document.getElementById('recommendSection');
        if (recSec && recSec.style.display === 'none') {
          recSec.style.display = '';
          recSec.innerHTML = `<div class="modal-section"><p class="modal-section-label">おすすめ一言</p><p class="modal-recommend"><span class="recommend-icon">💬</span>${credits.tagline}</p></div>`;
        }
      }
    }
  }
}

function closeModal() {
  if (modalOverlay) modalOverlay.classList.remove('active');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalOverlay) modalOverlay.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (_zoomOverlay.classList.contains('active')) { closePosterZoom(); return; }
  closeModal();
  if (typeof closeDiag === 'function') closeDiag();
  if (typeof closeWriteModal === 'function') closeWriteModal();
});

// ── サイドバー アクティブリンク自動検出 ──────────────
(function() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-item').forEach(link => {
    const href = (link.getAttribute('href') || '').split('?')[0];
    if (href === page) link.classList.add('active');
  });
})();

// ══════════════════════════════════════════════════════
// 意見箱
// ══════════════════════════════════════════════════════
(function () {

  // ── サイドバーリンクを動的追加 ──────────────────────
  const sbItems = document.querySelector('.sidebar-items');
  if (sbItems) {
    sbItems.insertAdjacentHTML('beforeend', `
      <a class="sidebar-item" href="#" id="feedbackSidebarBtn">
        <span class="sidebar-icon">📮</span>
        <span class="sidebar-text">意見箱</span>
      </a>
      <a class="sidebar-item admin-only" href="#" id="feedbackAdminBtn">
        <span class="sidebar-icon">📋</span>
        <span class="sidebar-text">意見箱を見る</span>
      </a>
    `);
  }

  // ── モーダル HTML を注入 ─────────────────────────────
  document.body.insertAdjacentHTML('beforeend', `
    <div id="feedbackOverlay"></div>
    <div id="feedbackModal" role="dialog" aria-modal="true">
      <button id="feedbackClose" aria-label="閉じる">✕</button>
      <p class="fb-modal-title">意見・要望・不具合報告</p>
      <p class="fb-modal-sub">サイトへのご意見・ご要望・不具合などをお気軽にどうぞ</p>
      <form id="feedbackForm">
        <div class="form-group">
          <label class="form-label">種類</label>
          <div class="fb-types" id="fbTypeGroup">
            <label class="fb-type-label selected"><input type="radio" name="fbType" value="要望・アイデア" checked>要望・アイデア</label>
            <label class="fb-type-label"><input type="radio" name="fbType" value="不具合の報告">不具合の報告</label>
            <label class="fb-type-label"><input type="radio" name="fbType" value="作品の追加リクエスト">作品の追加リクエスト</label>
            <label class="fb-type-label"><input type="radio" name="fbType" value="その他">その他</label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">内容 <span class="form-required">*</span></label>
          <textarea id="fbContent" class="form-input form-textarea" rows="5" required placeholder="内容を入力してください"></textarea>
        </div>

        <button type="submit" class="form-submit">送信する</button>
      </form>
      <div id="feedbackThanks" style="display:none">ありがとうございます！確認します😊</div>
    </div>

    <div id="fbAdminOverlay"></div>
    <div id="fbAdminModal" role="dialog" aria-modal="true">
      <button id="fbAdminClose" aria-label="閉じる">✕</button>
      <p class="fb-admin-head">📮 意見箱 — 受信一覧</p>
      <p class="fb-admin-count" id="fbAdminCount"></p>
      <div id="fbAdminList"></div>
    </div>
  `);

  // ── ラジオをクリックしたときのビジュアル ────────────
  document.getElementById('fbTypeGroup').addEventListener('change', function () {
    this.querySelectorAll('.fb-type-label').forEach(l => {
      l.classList.toggle('selected', l.querySelector('input').checked);
    });
  });

  // ── 開閉 ────────────────────────────────────────────
  function openFeedback() {
    document.getElementById('feedbackForm').style.display = '';
    document.getElementById('feedbackThanks').style.display = 'none';
    document.getElementById('feedbackForm').reset();
    document.querySelectorAll('.fb-type-label').forEach((l, i) => l.classList.toggle('selected', i === 0));
    document.getElementById('feedbackOverlay').classList.add('active');
    document.getElementById('feedbackModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeFeedback() {
    document.getElementById('feedbackOverlay').classList.remove('active');
    document.getElementById('feedbackModal').classList.remove('active');
    document.body.style.overflow = '';
  }
  function openFbAdmin() {
    renderFbAdmin();
    document.getElementById('fbAdminOverlay').classList.add('active');
    document.getElementById('fbAdminModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeFbAdmin() {
    document.getElementById('fbAdminOverlay').classList.remove('active');
    document.getElementById('fbAdminModal').classList.remove('active');
    document.body.style.overflow = '';
  }

  const sbBtn = document.getElementById('feedbackSidebarBtn');
  if (sbBtn) sbBtn.addEventListener('click', e => { e.preventDefault(); openFeedback(); });
  const abBtn = document.getElementById('feedbackAdminBtn');
  if (abBtn) abBtn.addEventListener('click', e => { e.preventDefault(); openFbAdmin(); });

  document.getElementById('feedbackClose').addEventListener('click', closeFeedback);
  document.getElementById('feedbackOverlay').addEventListener('click', closeFeedback);
  document.getElementById('fbAdminClose').addEventListener('click', closeFbAdmin);
  document.getElementById('fbAdminOverlay').addEventListener('click', closeFbAdmin);

  // ── 送信 ────────────────────────────────────────────
  document.getElementById('feedbackForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const type     = document.querySelector('input[name="fbType"]:checked').value;
    const content  = document.getElementById('fbContent').value.trim();
    const nickname = '匿名';
    if (!content) return;
    const box = JSON.parse(localStorage.getItem('feedbackBox') || '[]');
    box.unshift({ id: Date.now(), type, content, nickname, createdAt: new Date().toISOString(), status: 'new' });
    localStorage.setItem('feedbackBox', JSON.stringify(box));
    this.style.display = 'none';
    document.getElementById('feedbackThanks').style.display = '';
    setTimeout(closeFeedback, 2200);
  });

  // ── 管理人ビュー ─────────────────────────────────────
  window._fbSetStatus = function (id, status) {
    const box  = JSON.parse(localStorage.getItem('feedbackBox') || '[]');
    const item = box.find(i => i.id === id);
    if (item) { item.status = status; localStorage.setItem('feedbackBox', JSON.stringify(box)); }
    renderFbAdmin();
  };

  function renderFbAdmin() {
    const list  = document.getElementById('fbAdminList');
    const count = document.getElementById('fbAdminCount');
    const box   = JSON.parse(localStorage.getItem('feedbackBox') || '[]');
    if (!list) return;
    if (box.length === 0) {
      count.textContent = '';
      list.innerHTML = '<p class="fb-admin-empty">まだ意見はありません</p>';
      return;
    }
    const newCount = box.filter(i => i.status === 'new').length;
    count.textContent = `全${box.length}件　未対応 ${newCount}件`;
    list.innerHTML = box.map(item => {
      const s    = item.status || 'new';
      const date = new Date(item.createdAt).toLocaleString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
      const faded = (s === 'done' || s === 'rejected') ? s : '';
      return `
        <div class="fb-item ${faded}">
          <div class="fb-item-header">
            <span class="fb-badge">${item.type}</span>
            <span class="fb-nick">${item.nickname}</span>
            <span class="fb-date">${date}</span>
          </div>
          <p class="fb-body">${item.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>
          <div class="fb-status-row">
            <button class="fb-sbtn ${s==='checking'?'on-checking':''}" onclick="_fbSetStatus(${item.id},'checking')">検討中</button>
            <button class="fb-sbtn ${s==='done'?'on-done':''}"     onclick="_fbSetStatus(${item.id},'done')">対応済み</button>
            <button class="fb-sbtn ${s==='rejected'?'on-rejected':''}" onclick="_fbSetStatus(${item.id},'rejected')">却下</button>
          </div>
        </div>`;
    }).join('');
  }

})();
