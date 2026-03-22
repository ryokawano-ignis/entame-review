// special.js
// genreLabel / genreColor / genreIcon / TMDB定数 / favorites / openModal は app.js から使用

function createSpecialCard(movie) {
  const title = movie.title || movie.original_title || '';
  const year  = movie.release_date ? movie.release_date.slice(0, 4) : '';
  const image = movie.poster_path ? TMDB_IMG_BASE + movie.poster_path : '';
  const color = genreColor['movie'];

  const card = document.createElement('article');
  card.className = 'review-card';

  const posterHtml = image
    ? `<img class="card-poster-img" src="${image}" alt="${title}" loading="lazy">`
    : `<div class="card-poster-ph" style="background:linear-gradient(160deg,${color}44,${color}99);">
         <span class="card-ph-icon">🎬</span>
         <span class="card-ph-title">${title}</span>
       </div>`;

  card.innerHTML = `
    <div class="card-poster">
      ${posterHtml}
      <div class="card-overlay">
        <p class="overlay-title">${title}</p>
        <p class="overlay-meta">${year}</p>
      </div>
      <div class="card-hover-btns"></div>
    </div>`;

  const btns = card.querySelector('.card-hover-btns');
  btns.addEventListener('click', e => e.stopPropagation());

  const favBtn = document.createElement('button');
  favBtn.className = 'card-action-btn card-fav-btn' + (favorites.has(title) ? ' active' : '');
  favBtn.title = 'お気に入り';
  favBtn.innerHTML = '♥';
  favBtn.addEventListener('click', e => toggleFav(title, e));

  const wishBtn = document.createElement('button');
  wishBtn.className = 'card-action-btn card-wish-btn' + (wishlist.has(title) ? ' active' : '');
  wishBtn.title = '見たい';
  wishBtn.innerHTML = '🔖';
  wishBtn.addEventListener('click', e => toggleWish(title, e));

  btns.appendChild(favBtn);
  btns.appendChild(wishBtn);

  card.addEventListener('click', () => {
    openModal({
      genre:     'movie',
      title,
      year,
      image,
      synopsis:  movie.overview || '',
      recommend: '',
      stars:     movie.vote_average ? Math.min(5, Math.max(1, Math.round(movie.vote_average / 2))) : 0,
      _tmdbId:   movie.id,
      _fromTMDB: true,
      _genreIds: movie.genre_ids || []
    });
  });

  return card;
}

async function loadYakushoMovies() {
  const grid    = document.getElementById('specialGrid');
  const loading = document.getElementById('specialLoading');
  const count   = document.getElementById('specialCount');
  try {
    const searchRes  = await fetch(`${TMDB_BASE}/search/person?api_key=${TMDB_KEY}&language=ja-JP&query=%E5%BD%B9%E6%89%80%E5%BA%83%E5%8F%B8`);
    const searchData = await searchRes.json();
    if (!searchData.results || searchData.results.length === 0) throw new Error('not found');
    const person     = searchData.results[0];
    const personId   = person.id;
    const profilePath = person.profile_path;
    if (profilePath) {
      const wrap = document.getElementById('specialHeroPhotoWrap');
      if (wrap) {
        const img = document.createElement('img');
        img.src = 'https://image.tmdb.org/t/p/w300' + profilePath;
        img.alt = '役所広司';
        wrap.appendChild(img);
      }
    }

    const creditsRes  = await fetch(`${TMDB_BASE}/person/${personId}/movie_credits?api_key=${TMDB_KEY}&language=ja-JP`);
    const creditsData = await creditsRes.json();

    const movies = (creditsData.cast || [])
      .filter(m => m.release_date && m.poster_path && m.order < 10)
      .sort((a, b) => b.release_date.localeCompare(a.release_date));

    loading.remove();
    if (movies.length === 0) {
      grid.innerHTML = '<p class="empty-msg">作品が見つかりませんでした</p>';
      return;
    }

    count.textContent = `${movies.length}作品`;
    movies.forEach(m => grid.appendChild(createSpecialCard(m)));
  } catch(e) {
    loading.textContent = '作品の読み込みに失敗しました。';
  }
}

loadYakushoMovies();
