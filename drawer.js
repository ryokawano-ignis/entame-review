// ── メニュードロワー（全ページ共通） ─────────────────────

(function () {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  const isIndex = currentPage === 'index.html' || currentPage === '';

  // ── ドロワーHTMLを注入 ──────────────────────────────
  document.body.insertAdjacentHTML('beforeend', `
    <div id="drawerOverlay" class="drawer-overlay"></div>
    <nav id="menuDrawer" class="menu-drawer" role="dialog" aria-label="メニュー">
      <div class="menu-drawer-handle"></div>
      <ul class="menu-drawer-list">
        <li><a href="blog.html"    class="menu-drawer-item"><span class="mdi-icon">📝</span><span>ブログ</span></a></li>
        <li><a href="reviews.html" class="menu-drawer-item"><span class="mdi-icon">💬</span><span>みんなのレビュー</span></a></li>
        <li><a href="actor.html"   class="menu-drawer-item"><span class="mdi-icon">🎭</span><span>俳優・声優</span></a></li>
        <li><a href="ranking.html" class="menu-drawer-item"><span class="mdi-icon">🏆</span><span>いいねランキング</span></a></li>
        <li><button class="menu-drawer-item" id="drawerFavBtn"    ><span class="mdi-icon">❤️</span><span>お気に入り</span></button></li>
        <li><button class="menu-drawer-item" id="drawerWishBtn"   ><span class="mdi-icon">🔖</span><span>見たい</span></button></li>
        <li><button class="menu-drawer-item" id="drawerDiagBtn"   ><span class="mdi-icon">🎯</span><span>診断</span></button></li>
        <li><button class="menu-drawer-item" id="drawerOpinionBtn"><span class="mdi-icon">📮</span><span>意見箱</span></button></li>
      </ul>
    </nav>
  `);

  // ── 開閉 ─────────────────────────────────────────────
  function openDrawer() {
    document.getElementById('drawerOverlay').classList.add('active');
    document.getElementById('menuDrawer').classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    document.getElementById('drawerOverlay').classList.remove('active');
    document.getElementById('menuDrawer').classList.remove('active');
    document.body.style.overflow = '';
  }

  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

  // ── タブバー：メニューボタン ──────────────────────────
  document.getElementById('btabMenuBtn')?.addEventListener('click', e => { e.preventDefault(); openDrawer(); });

  // ── タブバー：検索ボタン ──────────────────────────────
  document.getElementById('btabSearchBtn')?.addEventListener('click', e => {
    e.preventDefault();
    if (isIndex) {
      const el = document.getElementById('searchInput');
      if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } else {
      location.href = 'index.html?action=search';
    }
  });

  // ── タブバー：投稿ボタン ──────────────────────────────
  document.getElementById('btabWriteBtn')?.addEventListener('click', e => {
    e.preventDefault();
    if (isIndex && typeof openWriteModal === 'function') {
      openWriteModal();
    } else {
      location.href = 'index.html?action=write';
    }
  });

  // ── ドロワー：お気に入り ──────────────────────────────
  document.getElementById('drawerFavBtn')?.addEventListener('click', () => {
    closeDrawer();
    if (isIndex && typeof renderReviews === 'function') {
      renderReviews('favorites');
      document.getElementById('filterBar')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      location.href = 'index.html?action=favorites';
    }
  });

  // ── ドロワー：見たい ──────────────────────────────────
  document.getElementById('drawerWishBtn')?.addEventListener('click', () => {
    closeDrawer();
    if (isIndex && typeof renderReviews === 'function') {
      renderReviews('wishlist');
      document.getElementById('filterBar')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      location.href = 'index.html?action=wishlist';
    }
  });

  // ── ドロワー：診断 ────────────────────────────────────
  document.getElementById('drawerDiagBtn')?.addEventListener('click', () => {
    closeDrawer();
    if (isIndex && typeof openDiag === 'function') {
      openDiag();
    } else {
      location.href = 'index.html?action=diag';
    }
  });

  // ── ドロワー：意見箱 ──────────────────────────────────
  document.getElementById('drawerOpinionBtn')?.addEventListener('click', () => {
    closeDrawer();
    if (typeof openFeedback === 'function') {
      openFeedback();
    } else {
      location.href = 'index.html?action=feedback';
    }
  });

  // ── URLパラメータ処理（index.htmlのみ） ───────────────
  if (isIndex) {
    window.addEventListener('load', () => {
      const action = new URLSearchParams(location.search).get('action');
      if (!action) return;
      history.replaceState({}, '', location.pathname);
      const delay = ms => new Promise(r => setTimeout(r, ms));
      switch (action) {
        case 'search':
          delay(500).then(() => {
            const el = document.getElementById('searchInput');
            if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          });
          break;
        case 'write':
          delay(500).then(() => { if (typeof openWriteModal === 'function') openWriteModal(); });
          break;
        case 'diag':
          delay(500).then(() => { if (typeof openDiag === 'function') openDiag(); });
          break;
        case 'favorites':
          delay(1200).then(() => { if (typeof renderReviews === 'function') renderReviews('favorites'); });
          break;
        case 'wishlist':
          delay(1200).then(() => { if (typeof renderReviews === 'function') renderReviews('wishlist'); });
          break;
        case 'feedback':
          delay(500).then(() => { if (typeof openFeedback === 'function') openFeedback(); });
          break;
      }
    });
  }
})();
