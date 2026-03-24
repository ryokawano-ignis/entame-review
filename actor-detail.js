const TMDB_FACE_BASE = 'https://image.tmdb.org/t/p/w342';
// TMDB_KEY, TMDB_BASE, TMDB_IMG_BASE, genreColor, genreIcon come from modal.js

function getWorkGenre(work, mediaType) {
  if (mediaType === 'movie') return 'movie';
  return (work.genre_ids || []).includes(16) ? 'anime' : 'drama';
}

function createWorkCard(work, mediaType) {
  const genre  = getWorkGenre(work, mediaType);
  const title  = work.title || work.name || '';
  const year   = (work.release_date || work.first_air_date || '').slice(0, 4);
  const image  = work.poster_path ? TMDB_IMG_BASE + work.poster_path : '';
  const color  = genreColor[genre] || '#888';

  const card = document.createElement('article');
  card.className = 'review-card';

  const posterHtml = image
    ? `<img class="card-poster-img" src="${image}" alt="${title}" loading="lazy">`
    : `<div class="card-poster-ph" style="background:linear-gradient(160deg,${color}44,${color}99);">
         <span class="card-ph-icon">${genreIcon[genre] || '🎞️'}</span>
         <span class="card-ph-title">${title}</span>
       </div>`;

  card.innerHTML = `
    <div class="card-poster">
      ${posterHtml}
      <div class="card-overlay">
        <p class="overlay-title">${title}</p>
        <p class="overlay-meta">${year}</p>
      </div>
    </div>`;

  function openWorkModal() {
    openModal({
      genre,
      title,
      year,
      image,
      synopsis:  work.overview || '',
      recommend: '',
      stars:     work.vote_average ? Math.min(5, Math.max(1, Math.round(work.vote_average / 2))) : 0,
      _tmdbId:   work.id,
      _fromTMDB: true,
      _genreIds: work.genre_ids || []
    });
  }
  let _touchMoved = false;
  card.addEventListener('touchstart', () => { _touchMoved = false; }, { passive: true });
  card.addEventListener('touchmove',  () => { _touchMoved = true; }, { passive: true });
  card.addEventListener('click', openWorkModal);
  card.addEventListener('touchend', e => { if (!_touchMoved) { e.preventDefault(); openWorkModal(); } });

  return card;
}

async function loadActorDetail() {
  const params   = new URLSearchParams(location.search);
  const personId = params.get('id');
  if (!personId) { document.getElementById('actorName').textContent = '俳優が見つかりません'; return; }

  try {
    // プロフィール取得
    const personRes  = await fetch(`${TMDB_BASE}/person/${personId}?api_key=${TMDB_KEY}&language=ja-JP`);
    const person     = await personRes.json();

    document.title = `${person.name} — ENTAME REVIEW`;
    document.getElementById('actorName').textContent = person.name || '不明';

    // 写真
    if (person.profile_path) {
      document.getElementById('actorPhotoWrap').innerHTML =
        `<img class="actor-detail-photo" src="${TMDB_FACE_BASE}${person.profile_path}" alt="${person.name}">`;
      document.getElementById('actorHeroBg').style.backgroundImage =
        `url('${TMDB_FACE_BASE}${person.profile_path}')`;
    }

    // メタ情報
    const metaParts = [];
    if (person.birthday) metaParts.push(`🎂 ${person.birthday.replace(/-/g, '/')}`);
    if (person.place_of_birth) metaParts.push(`📍 ${person.place_of_birth}`);
    document.getElementById('actorMeta').innerHTML = metaParts.map(p => `<span>${p}</span>`).join('');

    // プロフィール
    if (person.biography) {
      document.getElementById('actorBio').textContent = person.biography;
    }

    // 出演作品取得
    const [movieRes, tvRes] = await Promise.all([
      fetch(`${TMDB_BASE}/person/${personId}/movie_credits?api_key=${TMDB_KEY}&language=ja-JP`),
      fetch(`${TMDB_BASE}/person/${personId}/tv_credits?api_key=${TMDB_KEY}&language=ja-JP`)
    ]);
    const movieData = await movieRes.json();
    const tvData    = await tvRes.json();

    const movies = (movieData.cast || []).filter(m => m.poster_path && m.release_date)
      .sort((a, b) => b.release_date.localeCompare(a.release_date));
    const tvShows = (tvData.cast || []).filter(t => t.poster_path && t.first_air_date)
      .sort((a, b) => b.first_air_date.localeCompare(a.first_air_date));

    const grid    = document.getElementById('worksGrid');
    const loading = document.getElementById('worksLoading');
    loading.remove();

    const total = movies.length + tvShows.length;
    document.getElementById('worksCount').textContent = `${total}件`;

    // 映画と TV を混ぜて日付順に並べ直す
    const allWorks = [
      ...movies.map(m => ({ ...m, _type: 'movie' })),
      ...tvShows.map(t => ({ ...t, _type: 'tv' }))
    ].sort((a, b) => {
      const da = a.release_date || a.first_air_date || '';
      const db = b.release_date || b.first_air_date || '';
      return db.localeCompare(da);
    });

    if (allWorks.length === 0) {
      grid.innerHTML = '<p style="color:#888;text-align:center;padding:40px 0;">作品が見つかりませんでした</p>';
      return;
    }

    allWorks.forEach(work => grid.appendChild(createWorkCard(work, work._type)));

  } catch(e) {
    document.getElementById('actorName').textContent = '読み込みに失敗しました';
    const loading = document.getElementById('worksLoading');
    if (loading) loading.textContent = '作品の読み込みに失敗しました';
  }
}

loadActorDetail();
