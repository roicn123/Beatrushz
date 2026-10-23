/**
 * BeatRush ⚡ Song Guessing Game with Millisecond Precision & Deep Statistics
 */

(function () {
  const CATALOG = [...(window.SONGS_CATALOG || [])];
  const STORAGE_KEY = 'beatrush_stats_v1';
  const CUSTOM_SONGS_KEY = 'beatrush_custom_songs_v1';

  // Load any user-imported artists/songs from localStorage
  try {
    const savedCustom = JSON.parse(localStorage.getItem(CUSTOM_SONGS_KEY) || '[]');
    if (Array.isArray(savedCustom) && savedCustom.length > 0) {
      const existingIds = new Set(CATALOG.map((s) => s.id));
      savedCustom.forEach((s) => {
        if (!existingIds.has(s.id)) {
          CATALOG.push(s);
          existingIds.add(s.id);
        }
      });
    }
  } catch (e) {}

  // Extract unique artists and genres from catalog
  let ARTISTS = [];
  let ARTIST_META = {};
  let GENRES = [];

  function detectLanguage(str) {
    return /[\u0590-\u05FF]/.test(str || '') ? 'he' : 'en';
  }

  function rebuildCatalogIndexes() {
    ARTISTS = [];
    ARTIST_META = {};
    const genresSet = new Set();

    CATALOG.forEach((song) => {
      if (!song.lang) {
        song.lang = detectLanguage(song.artist) === 'he' || detectLanguage(song.title) === 'he' ? 'he' : 'en';
      }
      genresSet.add(song.genre);
      if (!ARTIST_META[song.artist]) {
        ARTISTS.push(song.artist);
        ARTIST_META[song.artist] = {
          name: song.artist,
          genre: song.genre,
          lang: song.lang,
          avatar: song.artwork,
          totalSongs: 0
        };
      }
      ARTIST_META[song.artist].totalSongs += 1;
    });

    ARTISTS.sort((a, b) => a.localeCompare(b, 'he', { sensitivity: 'base' }));
    GENRES = Array.from(genresSet);
  }

  rebuildCatalogIndexes();

  const DIFF_LABELS = {
    all: 'הכל (מיקס)',
    easy: 'קל (להיטי ענק)',
    medium: 'בינוני',
    hard: 'קשה (למעריצים)'
  };

  const DIFF_MULTIPLIERS = {
    easy: 1.0,
    medium: 1.25,
    hard: 1.5
  };

  // ==================== STATE ====================
  let config = {
    lang: 'all',       // 'all' | 'en' | 'he'
    difficulty: 'all', // 'all' | 'easy' | 'medium' | 'hard'
    genre: 'all',      // 'all' | genre string
    artist: 'all',     // 'all' | artist string
    inputMode: 'choices', // 'choices' | 'typing'
    roundLength: 10
  };

  const USER_PROFILE_KEY = 'beatrush_user_profile_v1';
  let userProfile = loadUserProfile();

  function loadUserProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || 'null');
      if (saved && saved.username) return saved;
    } catch (e) {}
    return {
      username: '',
      clientId: 'cid_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
    };
  }

  function saveUserProfile() {
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(userProfile));
    } catch (e) {}
  }

  // ==================== SUPABASE CLOUD HELPER ====================
  function isSupabaseConfigured() {
    const cfg = window.BEATRUSH_SUPABASE;
    return Boolean(cfg && cfg.url && cfg.anonKey && cfg.url.startsWith('http'));
  }

  async function sbRest(table, method = 'GET', query = '', body = null, extraHeaders = {}) {
    if (!isSupabaseConfigured()) return null;
    const cfg = window.BEATRUSH_SUPABASE;
    const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/${table}${query ? '?' + query : ''}`;
    const headers = Object.assign({
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json'
    }, extraHeaders);

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function syncSharedSongsFromSupabase() {
    if (!isSupabaseConfigured()) return;
    try {
      const rows = await sbRest('shared_songs', 'GET', 'select=*&limit=2000');
      if (Array.isArray(rows) && rows.length > 0) {
        const existingIds = new Set(CATALOG.map((s) => s.id));
        let addedCount = 0;
        rows.forEach((r) => {
          if (!existingIds.has(r.id)) {
            CATALOG.push({
              id: r.id,
              title: r.title,
              fullTitle: r.full_title || r.title,
              artist: r.artist,
              genre: r.genre,
              lang: r.lang || detectLanguage(r.artist),
              difficulty: r.difficulty || 'medium',
              previewUrl: r.preview_url,
              artwork: r.artwork || '',
              album: r.album || '',
              releaseYear: r.release_year || ''
            });
            existingIds.add(r.id);
            addedCount++;
          }
        });
        if (addedCount > 0) {
          rebuildCatalogIndexes();
          document.getElementById('catalogCountBadge').textContent = CATALOG.length;
          renderGenreChips();
          renderArtistCards();
          populateCatalogFilters();
          renderSidebarArtistFastest();
          updateLobbyState();
        }
      }
    } catch (e) {
      console.warn('Supabase shared_songs sync skipped:', e.message);
    }
  }

  async function pushSongsToSupabase(songsArray) {
    if (!isSupabaseConfigured() || !songsArray.length) return;
    try {
      const payload = songsArray.map((s) => ({
        id: s.id,
        title: s.title,
        full_title: s.fullTitle || s.title,
        artist: s.artist,
        genre: s.genre,
        lang: s.lang || detectLanguage(s.artist),
        difficulty: s.difficulty,
        preview_url: s.previewUrl,
        artwork: s.artwork || '',
        album: s.album || '',
        release_year: s.releaseYear || '',
        added_by: userProfile.username || 'guest'
      }));
      await sbRest('shared_songs', 'POST', 'on_conflict=id', payload, {
        Prefer: 'resolution=ignore-duplicates'
      });
    } catch (e) {
      console.warn('Supabase push shared_songs error:', e.message);
    }
  }

  async function pushRecordToSupabase(recordPayload) {
    if (!isSupabaseConfigured() || !userProfile.username) return;
    try {
      await sbRest('global_records', 'POST', '', Object.assign({
        username: userProfile.username
      }, recordPayload));
    } catch (e) {}
  }

  let stats = loadStats();

  // Active Game Session State
  let game = {
    active: false,
    queue: [],
    currentIndex: 0,
    score: 0,
    streak: 0,
    results: [], // { song, correct, timeMs, points, isNewArtistRecord }
    audio: new Audio(),
    audioStartedAt: 0,
    rafId: null,
    answeredCurrent: false,
    maxListenMs: 15000 // 15 seconds per song challenge
  };

  game.audio.crossOrigin = 'anonymous';

  // ==================== PERSISTENT STATS ENGINE ====================
  function getDefaultStats() {
    return {
      totalSongsPlayed: 0,
      totalCorrect: 0,
      totalCorrectTimeMs: 0,
      sub2SecCount: 0,
      globalFastest: null, // { timeMs, songId, title, artist, artwork, date }
      globalBestRound: null, // { score, accuracy, avgTimeMs, label, date }
      byDifficulty: {}, // key: 'all'|'easy'|'medium'|'hard' -> { bestScore, bestAvgTimeMs, bestAccuracy, gamesPlayed }
      byGenre: {},      // key: genre -> { bestScore, bestAvgTimeMs, bestAccuracy, fastestSong: { timeMs, title, artist } }
      byArtist: {},     // key: artist -> { bestScore, bestAvgTimeMs, fastestSong: { timeMs, title, songId }, totalCorrect, totalPlayed }
      byCombo: {},      // key: `${diff}|${genre}|${artist}` -> { bestScore, bestAvgTimeMs, bestAccuracy }
      songRecords: {},  // key: song.id -> { fastestMs, timesCorrect }
      fastestHistory: [] // Top 15 fastest guesses [{ timeMs, songId, title, artist, artwork, diff }]
    };
  }

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultStats();
      return Object.assign(getDefaultStats(), JSON.parse(raw));
    } catch (e) {
      return getDefaultStats();
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  function formatMs(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '--.---s';
    const sec = Math.floor(ms / 1000);
    const rem = Math.floor(ms % 1000);
    return `${String(sec).padStart(2, '0')}.${String(rem).padStart(3, '0')}s`;
  }

  function getComboKey(diff, genre, artist) {
    return `${diff}|${genre}|${artist}`;
  }

  function getCategoryLabel(diff, genre, artist) {
    const dLabel = DIFF_LABELS[diff] || diff;
    const gLabel = genre === 'all' ? 'כל הז\'אנרים' : genre;
    const aLabel = artist === 'all' ? 'כל האמנים' : artist;
    return `${aLabel} • ${gLabel} • ${dLabel}`;
  }

  // ==================== INITIALIZATION & UI BINDINGS ====================
  function init() {
    document.getElementById('catalogCountBadge').textContent = CATALOG.length;
    updateHeaderUsernameUI();
    renderGenreChips();
    renderArtistCards();
    populateCatalogFilters();
    renderCatalogView();
    updateLobbyState();
    updateHeaderQuickStats();
    renderSidebarArtistFastest();
    renderStatsDashboard();
    bindEvents();
    syncSharedSongsFromSupabase();

    // Prompt for username on first visit if not set
    if (!userProfile.username) {
      setTimeout(() => openProfileModal(), 400);
    }
  }

  function updateHeaderUsernameUI() {
    const disp = document.getElementById('headerUsernameDisplay');
    const dot = document.getElementById('userCloudStatusDot');
    if (disp) {
      disp.textContent = userProfile.username ? `@${userProfile.username}` : '@הגדר_כינוי';
    }
    if (dot) {
      dot.style.background = isSupabaseConfigured() ? 'var(--accent-green)' : 'var(--accent)';
    }
  }

  function openProfileModal() {
    const modal = document.getElementById('profileModal');
    const input = document.getElementById('usernameInput');
    const status = document.getElementById('usernameStatusMsg');
    if (!modal) return;
    modal.classList.remove('hidden');
    input.value = userProfile.username || '';
    status.textContent = isSupabaseConfigured()
      ? 'מחובר ל-Supabase — השם ייבדק לייחודיות בענן.'
      : 'שמירה מקומית (חבר Supabase כדי לסנכרן שיאים בענן).';
    setTimeout(() => input.focus(), 40);
  }

  function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
  }

  async function saveUniqueUsername() {
    const input = document.getElementById('usernameInput');
    const status = document.getElementById('usernameStatusMsg');
    const raw = (input.value || '').trim().replace(/^@/, '');
    if (raw.length < 2) {
      status.textContent = 'נא להזין כינוי באורך 2 תווים לפחות.';
      return;
    }
    if (!/^[a-zA-Z0-9_\u0590-\u05FF.-]+$/.test(raw)) {
      status.textContent = 'הכינוי יכול להכיל אותיות (אנגלית/עברית), מספרים וקו תחתון בלבד.';
      return;
    }

    if (isSupabaseConfigured()) {
      status.textContent = 'בודק זמינות שם משתמש ב-Supabase...';
      try {
        const existing = await sbRest('players', 'GET', `username=eq.${encodeURIComponent(raw)}&select=*`);
        if (Array.isArray(existing) && existing.length > 0 && existing[0].client_id !== userProfile.clientId) {
          status.textContent = `❌ הכינוי "@${raw}" כבר תפוס על ידי שחקן אחר! בחר שם אחר.`;
          return;
        }
        await sbRest('players', 'POST', 'on_conflict=username', [{
          username: raw,
          client_id: userProfile.clientId
        }], { Prefer: 'resolution=merge-duplicates' });
      } catch (e) {
        console.warn('Supabase player registration warning:', e.message);
      }
    }

    userProfile.username = raw;
    saveUserProfile();
    updateHeaderUsernameUI();
    closeProfileModal();
  }

  function bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (game.active) {
          if (!confirm('האם לעצור את הסיבוב הפעיל ולצאת?')) return;
          stopAudioAndTimer();
          game.active = false;
        }
        switchView(btn.dataset.view);
      });
    });

    document.getElementById('logoBtn').addEventListener('click', () => {
      if (game.active) {
        if (!confirm('האם לעצור את הסיבוב הפעיל ולחזור ללובי?')) return;
        stopAudioAndTimer();
        game.active = false;
      }
      switchView('lobby');
    });

    // Language Mode Selector (All / English US / Hebrew IL)
    document.querySelectorAll('#languageModeSelector .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        config.lang = btn.dataset.lang;
        document.querySelectorAll('#languageModeSelector .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Reset artist/genre if they don't match the newly chosen language
        if (config.artist !== 'all' && config.lang !== 'all' && ARTIST_META[config.artist]?.lang !== config.lang) {
          config.artist = 'all';
        }
        config.genre = 'all';

        renderGenreChips();
        renderArtistCards();
        renderSidebarArtistFastest(document.getElementById('sidebarArtistSearchInput')?.value || '');
        updateLobbyState();
      });
    });

    // Difficulty Selector
    document.querySelectorAll('#difficultySelector .diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        config.difficulty = btn.dataset.diff;
        document.querySelectorAll('#difficultySelector .diff-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        updateLobbyState();
      });
    });

    // Profile Modal Events
    const openProfBtn = document.getElementById('openProfileModalBtn');
    const closeProfBtn = document.getElementById('closeProfileModalBtn');
    const saveProfBtn = document.getElementById('saveUsernameBtn');
    const profInput = document.getElementById('usernameInput');
    if (openProfBtn) openProfBtn.addEventListener('click', openProfileModal);
    if (closeProfBtn) closeProfBtn.addEventListener('click', closeProfileModal);
    if (saveProfBtn) saveProfBtn.addEventListener('click', saveUniqueUsername);
    if (profInput) {
      profInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveUniqueUsername();
        }
      });
    }

    // Input Mode Selector
    document.querySelectorAll('#inputModeSelector .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        config.inputMode = btn.dataset.mode;
        document.querySelectorAll('#inputModeSelector .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Round Length Selector
    document.querySelectorAll('#roundLengthSelector .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        config.roundLength = parseInt(btn.dataset.count, 10);
        document.querySelectorAll('#roundLengthSelector .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        updateLobbyState();
      });
    });

    // Start Game Button
    document.getElementById('startGameBtn').addEventListener('click', startNewGame);
    document.getElementById('quitGameBtn').addEventListener('click', () => {
      stopAudioAndTimer();
      game.active = false;
      switchView('lobby');
    });

    document.getElementById('nextSongBtn').addEventListener('click', () => {
      nextSong();
    });

    document.getElementById('playAgainSameBtn').addEventListener('click', startNewGame);
    document.getElementById('backToLobbyBtn').addEventListener('click', () => switchView('lobby'));

    // Typing input autocomplete + Instant Enter Submission
    const guessInput = document.getElementById('songGuessInput');
    const submitTypedBtn = document.getElementById('submitTypedGuessBtn');
    guessInput.addEventListener('input', onTypingInput);
    guessInput.addEventListener('keydown', onTypingKeyDown);
    if (submitTypedBtn) {
      submitTypedBtn.addEventListener('click', () => submitTypedGuess());
    }
    document.getElementById('skipSongBtn').addEventListener('click', () => {
      if (!game.answeredCurrent) {
        handleSongAnswer(null, false);
      }
    });

    // Keyboard shortcuts 1-4 for multiple choices & Enter for Next Song
    window.addEventListener('keydown', (e) => {
      if (!game.active) return;
      if (game.answeredCurrent && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        nextSong();
        return;
      }
      if (!game.answeredCurrent && config.inputMode === 'choices') {
        const idx = ['1', '2', '3', '4'].indexOf(e.key);
        if (idx !== -1) {
          const btns = document.querySelectorAll('#answerChoicesContainer .choice-btn');
          if (btns[idx]) btns[idx].click();
        }
      }
    });

    // Reset Stats
    document.getElementById('resetStatsBtn').addEventListener('click', () => {
      if (confirm('האם אתה בטוח שברצונך לאפס את כל השיאים והסטטיסטיקות?')) {
        stats = getDefaultStats();
        saveStats();
        updateHeaderQuickStats();
        renderSidebarArtistFastest();
        renderStatsDashboard();
        renderCatalogView();
        updateLobbyState();
      }
    });

    // Catalog Filters
    document.getElementById('catalogFilterArtist').addEventListener('change', renderCatalogView);
    document.getElementById('catalogFilterDiff').addEventListener('change', renderCatalogView);

    // Lobby Searchable A-Z Artist Combobox
    const selectedBar = document.getElementById('selectedArtistBar');
    const dropdownPanel = document.getElementById('artistDropdownPanel');
    const lobbySearchInput = document.getElementById('lobbyArtistSearchInput');
    const clearArtistBtn = document.getElementById('clearArtistSelectionBtn');

    selectedBar.addEventListener('click', (e) => {
      if (e.target.closest('#clearArtistSelectionBtn')) return;
      const isOpen = !dropdownPanel.classList.contains('hidden');
      if (isOpen) {
        closeLobbyArtistDropdown();
      } else {
        dropdownPanel.classList.remove('hidden');
        selectedBar.classList.add('open');
        lobbySearchInput.value = '';
        renderLobbyArtistAzList('');
        setTimeout(() => lobbySearchInput.focus(), 30);
      }
    });

    clearArtistBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      config.artist = 'all';
      closeLobbyArtistDropdown();
      renderArtistCards();
      updateLobbyState();
    });

    lobbySearchInput.addEventListener('input', (e) => {
      renderLobbyArtistAzList(e.target.value);
    });

    // Sidebar A-Z filter input
    const sidebarSearchInput = document.getElementById('sidebarArtistSearchInput');
    if (sidebarSearchInput) {
      sidebarSearchInput.addEventListener('input', () => {
        renderSidebarArtistFastest(sidebarSearchInput.value);
      });
    }

    // Stats Page A-Z Artist Search & Spotlight
    const statsSearchInput = document.getElementById('statsArtistSearchInput');
    const statsDropdown = document.getElementById('statsArtistDropdown');
    if (statsSearchInput && statsDropdown) {
      statsSearchInput.addEventListener('focus', () => {
        renderStatsArtistDropdownList(statsSearchInput.value);
        statsDropdown.classList.remove('hidden');
      });
      statsSearchInput.addEventListener('input', () => {
        renderStatsArtistDropdownList(statsSearchInput.value);
        statsDropdown.classList.remove('hidden');
      });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#lobbyArtistPicker')) {
        closeLobbyArtistDropdown();
      }
      if (!e.target.closest('.stats-artist-search-wrap')) {
        if (statsDropdown) statsDropdown.classList.add('hidden');
      }
    });
  }

  function closeLobbyArtistDropdown() {
    const dropdownPanel = document.getElementById('artistDropdownPanel');
    const selectedBar = document.getElementById('selectedArtistBar');
    if (dropdownPanel) dropdownPanel.classList.add('hidden');
    if (selectedBar) selectedBar.classList.remove('open');
  }

  function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach((sec) => sec.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    if (viewName === 'stats') renderStatsDashboard();
    if (viewName === 'catalog') renderCatalogView();
    if (viewName === 'lobby') {
      updateLobbyState();
      renderSidebarArtistFastest();
    }
  }

  // ==================== LOBBY FILTERS & POOL ====================
  function getArtistsForCurrentLang() {
    if (config.lang === 'all') return ARTISTS;
    return ARTISTS.filter((a) => ARTIST_META[a]?.lang === config.lang);
  }

  function renderGenreChips() {
    const container = document.getElementById('genreSelector');
    container.innerHTML = '';

    const allChip = document.createElement('button');
    allChip.className = `chip-btn ${config.genre === 'all' ? 'active' : ''}`;
    allChip.textContent = 'כל הז\'אנרים';
    allChip.addEventListener('click', () => {
      config.genre = 'all';
      renderGenreChips();
      renderArtistCards();
      updateLobbyState();
    });
    container.appendChild(allChip);

    const activeGenres = Array.from(new Set(
      getArtistsForCurrentLang().map((a) => ARTIST_META[a]?.genre).filter(Boolean)
    ));

    activeGenres.forEach((g) => {
      const chip = document.createElement('button');
      chip.className = `chip-btn ${config.genre === g ? 'active' : ''}`;
      chip.textContent = g;
      chip.addEventListener('click', () => {
        config.genre = g;
        if (config.artist !== 'all' && ARTIST_META[config.artist]?.genre !== g) {
          config.artist = 'all';
        }
        renderGenreChips();
        renderArtistCards();
        updateLobbyState();
      });
      container.appendChild(chip);
    });
  }

  function renderArtistCards() {
    const displayEl = document.getElementById('selectedArtistDisplay');
    const clearBtn = document.getElementById('clearArtistSelectionBtn');
    if (!displayEl) return;

    const langArtists = getArtistsForCurrentLang();

    if (config.artist === 'all') {
      displayEl.innerHTML = `
        <div class="artist-avatar">ALL</div>
        <div class="artist-btn-info">
          <div class="artist-btn-name">כל האמנים (${langArtists.length} אמנים זמינים)</div>
          <div class="artist-btn-sub">לחץ לבחירה או חיפוש אמן ספציפי (A–Z / א–ת)</div>
        </div>
      `;
      if (clearBtn) clearBtn.classList.add('hidden');
    } else {
      const meta = ARTIST_META[config.artist];
      displayEl.innerHTML = `
        <img src="${meta.avatar}" alt="${config.artist}" class="artist-avatar" />
        <div class="artist-btn-info">
          <div class="artist-btn-name">${config.artist}</div>
          <div class="artist-btn-sub">${meta.genre} • ${meta.totalSongs} שירים במאגר</div>
        </div>
      `;
      if (clearBtn) clearBtn.classList.remove('hidden');
    }

    renderLobbyArtistAzList(document.getElementById('lobbyArtistSearchInput')?.value || '');
  }

  function renderLobbyArtistAzList(query = '') {
    const listEl = document.getElementById('lobbyArtistAzList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const q = query.trim().toLowerCase();
    const langArtists = getArtistsForCurrentLang();

    // Option 0: All Artists
    if (!q) {
      const allOpt = document.createElement('button');
      allOpt.type = 'button';
      allOpt.className = `az-artist-option ${config.artist === 'all' ? 'active' : ''}`;
      allOpt.innerHTML = `
        <div class="az-opt-left">
          <div class="artist-avatar">ALL</div>
          <div>
            <div class="artist-btn-name">כל האמנים</div>
            <div class="artist-btn-sub">${langArtists.length} אמנים זמינים</div>
          </div>
        </div>
        <span class="az-opt-right">מיקס</span>
      `;
      allOpt.addEventListener('click', () => {
        config.artist = 'all';
        closeLobbyArtistDropdown();
        renderArtistCards();
        updateLobbyState();
      });
      listEl.appendChild(allOpt);
    }

    let currentLetter = '';
    const filteredArtists = langArtists.filter((name) => {
      const meta = ARTIST_META[name];
      return name.toLowerCase().includes(q) || meta.genre.toLowerCase().includes(q);
    });

    if (filteredArtists.length === 0) {
      listEl.innerHTML = `<div style="padding:1rem;color:var(--text-dim);text-align:center;font-size:0.85rem">לא נמצאו אמנים התואמים לחיפוש "${query}"</div>`;
      return;
    }

    filteredArtists.forEach((artistName) => {
      const firstChar = artistName.charAt(0).toUpperCase();
      if (firstChar !== currentLetter) {
        currentLetter = firstChar;
        const divider = document.createElement('div');
        divider.className = 'az-letter-divider';
        divider.textContent = currentLetter;
        listEl.appendChild(divider);
      }

      const meta = ARTIST_META[artistName];
      const matchesGenre = config.genre === 'all' || meta.genre === config.genre;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = `az-artist-option ${config.artist === artistName ? 'active' : ''} ${!matchesGenre ? 'disabled-by-genre' : ''}`;
      opt.innerHTML = `
        <div class="az-opt-left">
          <img src="${meta.avatar}" alt="${artistName}" class="artist-avatar" />
          <div>
            <div class="artist-btn-name">${artistName}</div>
            <div class="artist-btn-sub">${meta.genre}</div>
          </div>
        </div>
        <span class="az-opt-right mono">${meta.totalSongs} tracks</span>
      `;
      opt.addEventListener('click', () => {
        config.artist = artistName;
        if (config.genre !== 'all' && config.genre !== meta.genre) {
          config.genre = 'all';
          renderGenreChips();
        }
        closeLobbyArtistDropdown();
        renderArtistCards();
        updateLobbyState();
      });
      listEl.appendChild(opt);
    });
  }

  function getFilteredPool() {
    return CATALOG.filter((song) => {
      if (config.lang !== 'all' && song.lang !== config.lang) return false;
      if (config.difficulty !== 'all' && song.difficulty !== config.difficulty) return false;
      if (config.genre !== 'all' && song.genre !== config.genre) return false;
      if (config.artist !== 'all' && song.artist !== config.artist) return false;
      return true;
    });
  }

  function updateLobbyState() {
    const pool = getFilteredPool();
    document.getElementById('availablePoolCount').textContent = `${pool.length} שירים זמינים`;

    const comboKey = getComboKey(config.difficulty, config.genre, config.artist);
    const pb = stats.byCombo[comboKey];
    const titleEl = document.getElementById('pbCategoryTitle');
    const detailsEl = document.getElementById('pbCategoryDetails');

    titleEl.textContent = `השיא שלך ב: ${getCategoryLabel(config.difficulty, config.genre, config.artist)}`;
    if (pb) {
      detailsEl.innerHTML = `ניקוד שיא: <strong>${pb.bestScore.toLocaleString()}</strong> נק' • דיוק: <strong>${pb.bestAccuracy}</strong> • ממוצע זיהוי: <strong class="mono">${formatMs(pb.bestAvgTimeMs)}</strong>`;
    } else {
      detailsEl.textContent = 'טרם נקבע שיא בקומבינציה הזו — שחק סיבוב כדי לקבוע שיא ראשון!';
    }
  }

  // ==================== GAMEPLAY ENGINE ====================
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function startNewGame() {
    const pool = getFilteredPool();
    if (pool.length === 0) {
      alert('אין שירים זמינים בסינון הנוכחי. נסה לבחור רמת קושי או ז\'אנר אחר.');
      return;
    }

    const count = Math.min(config.roundLength, pool.length);
    const selectedQueue = shuffleArray(pool).slice(0, count);

    game.active = true;
    game.queue = selectedQueue;
    game.currentIndex = 0;
    game.score = 0;
    game.streak = 0;
    game.results = [];

    // Setup HUD tags
    document.getElementById('activeDiffTag').textContent = DIFF_LABELS[config.difficulty];
    document.getElementById('activeFilterTag').textContent =
      config.artist !== 'all' ? config.artist : (config.genre !== 'all' ? config.genre : 'כל האמנים');

    // Unlock mobile audio element directly inside user gesture (iOS Safari / Android Chrome requirement)
    try {
      game.audio.muted = false;
      game.audio.volume = 1.0;
      game.audio.setAttribute('playsinline', '');
    } catch (e) {}

    switchView('game');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadCurrentSong();
  }

  function renderProgressDots() {
    const container = document.getElementById('gameProgressDots');
    container.innerHTML = '';
    for (let i = 0; i < game.queue.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'prog-dot';
      if (i < game.results.length) {
        dot.classList.add(game.results[i].correct ? 'correct' : 'wrong');
      } else if (i === game.currentIndex) {
        dot.classList.add('current');
      }
      container.appendChild(dot);
    }
  }

  function updateGameHud() {
    document.getElementById('hudSongCounter').textContent = `${game.currentIndex + 1} / ${game.queue.length}`;
    document.getElementById('hudCurrentScore').textContent = game.score.toLocaleString();
    document.getElementById('hudStreak').textContent = `${game.streak}`;

    const correctResults = game.results.filter((r) => r.correct);
    if (correctResults.length > 0) {
      const avg = correctResults.reduce((acc, r) => acc + r.timeMs, 0) / correctResults.length;
      document.getElementById('hudAvgTime').textContent = formatMs(avg);
    } else {
      document.getElementById('hudAvgTime').textContent = '--.---s';
    }
  }

  function loadCurrentSong() {
    stopAudioAndTimer();
    game.answeredCurrent = false;

    const currentSong = game.queue[game.currentIndex];
    renderProgressDots();
    updateGameHud();

    // Reset Visuals
    document.getElementById('roundFeedbackPanel').classList.add('hidden');
    const artworkEl = document.getElementById('mysteryArtwork');
    artworkEl.src = currentSong.artwork;
    artworkEl.classList.add('blurred');
    document.getElementById('vinylBadge').textContent = '?';
    document.getElementById('vinylVisualizer').classList.remove('spinning');
    document.getElementById('waveBars').classList.remove('playing');

    setStopwatchDisplay(0);
    document.getElementById('audioProgressBar').style.width = '0%';
    document.getElementById('stopwatchStatusText').textContent = 'טוען קובץ אודיו רשמי...';

    // Prepare Answer Options UI
    if (config.inputMode === 'choices') {
      document.getElementById('answerChoicesContainer').classList.remove('hidden');
      document.getElementById('answerTypingContainer').classList.add('hidden');
      renderMultipleChoices(currentSong);
    } else {
      document.getElementById('answerChoicesContainer').classList.add('hidden');
      document.getElementById('answerTypingContainer').classList.remove('hidden');
      const input = document.getElementById('songGuessInput');
      input.value = '';
      input.disabled = false;
      document.getElementById('autocompleteDropdown').innerHTML = '';
      setTimeout(() => input.focus(), 50);
    }

    // Load & Play Audio with exact playing timestamp hook
    game.audio.src = currentSong.previewUrl;
    game.audio.currentTime = 0;

    const onPlaying = () => {
      game.audio.removeEventListener('playing', onPlaying);
      if (!game.active || game.answeredCurrent) return;
      game.audioStartedAt = performance.now();
      document.getElementById('stopwatchStatusText').textContent = 'LIVE AUDIO — בחר או הקש 1–4 במקלדת';
      document.getElementById('vinylVisualizer').classList.add('spinning');
      document.getElementById('waveBars').classList.add('playing');
      startStopwatchLoop();
    };

    game.audio.addEventListener('playing', onPlaying);
    game.audio.play().catch((err) => {
      console.warn('Audio play error:', err);
      document.getElementById('stopwatchStatusText').textContent = 'לחץ על אחת האפשרויות או בדוק חיבור רשת';
    });
  }

  function startStopwatchLoop() {
    cancelAnimationFrame(game.rafId);
    const tick = () => {
      if (!game.active || game.answeredCurrent) return;
      const elapsed = Math.max(0, performance.now() - game.audioStartedAt);
      setStopwatchDisplay(elapsed);

      const pct = Math.min(100, (elapsed / game.maxListenMs) * 100);
      document.getElementById('audioProgressBar').style.width = `${pct}%`;

      if (elapsed >= game.maxListenMs) {
        handleSongAnswer(null, true);
        return;
      }
      game.rafId = requestAnimationFrame(tick);
    };
    game.rafId = requestAnimationFrame(tick);
  }

  function setStopwatchDisplay(ms) {
    const sec = Math.floor(ms / 1000);
    const millis = Math.floor(ms % 1000);
    document.getElementById('swSeconds').textContent = String(sec).padStart(2, '0');
    document.getElementById('swMillis').textContent = String(millis).padStart(3, '0');
  }

  function stopAudioAndTimer() {
    cancelAnimationFrame(game.rafId);
    try {
      game.audio.pause();
    } catch (e) {}
    document.getElementById('vinylVisualizer').classList.remove('spinning');
    document.getElementById('waveBars').classList.remove('playing');
  }

  function renderMultipleChoices(correctSong) {
    const container = document.getElementById('answerChoicesContainer');
    container.innerHTML = '';

    // Pick 3 smart distractors from the same language (prefer same artist or genre if available)
    let distractorsPool = CATALOG.filter((s) => s.id !== correctSong.id && s.lang === correctSong.lang && s.title.toLowerCase() !== correctSong.title.toLowerCase());
    if (distractorsPool.length < 3) {
      distractorsPool = CATALOG.filter((s) => s.id !== correctSong.id && s.title.toLowerCase() !== correctSong.title.toLowerCase());
    }
    const sameArtist = distractorsPool.filter((s) => s.artist === correctSong.artist);
    const sameGenre = distractorsPool.filter((s) => s.genre === correctSong.genre && s.artist !== correctSong.artist);

    let chosenDistractors = [];
    if (config.artist !== 'all' && sameArtist.length >= 3) {
      chosenDistractors = shuffleArray(sameArtist).slice(0, 3);
    } else {
      const combinedPref = [...shuffleArray(sameArtist).slice(0, 2), ...shuffleArray(sameGenre).slice(0, 2), ...shuffleArray(distractorsPool)];
      const seenTitles = new Set([correctSong.title.toLowerCase()]);
      for (const cand of combinedPref) {
        if (!seenTitles.has(cand.title.toLowerCase())) {
          seenTitles.add(cand.title.toLowerCase());
          chosenDistractors.push(cand);
          if (chosenDistractors.length === 3) break;
        }
      }
    }

    const options = shuffleArray([correctSong, ...chosenDistractors]);

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.dataset.songId = opt.id;
      btn.innerHTML = `
        <span class="choice-key">${idx + 1}</span>
        <div class="choice-info">
          <span class="choice-title">${opt.title}</span>
          <span class="choice-artist">${opt.artist}</span>
        </div>
      `;
      btn.addEventListener('click', () => {
        if (game.answeredCurrent) return;
        handleSongAnswer(opt, false, btn);
      });
      container.appendChild(btn);
    });
  }

  let currentTypedMatches = [];
  let currentAcHighlightIndex = 0;

  function normalizeSongTitle(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[\(\[\{].*?[\)\]\}]/g, '')
      .replace(/['’`".,!?:\-\/\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function onTypingInput(e) {
    const val = e.target.value.trim();
    const lowerVal = val.toLowerCase();
    const normVal = normalizeSongTitle(val);
    const dropdown = document.getElementById('autocompleteDropdown');
    dropdown.innerHTML = '';
    currentTypedMatches = [];
    currentAcHighlightIndex = 0;
    if (!lowerVal) return;

    const pool = CATALOG.filter((s) => {
      if (config.artist !== 'all' && s.artist !== config.artist) return false;
      if (config.lang !== 'all' && s.lang !== config.lang) return false;
      return true;
    });

    const startsWithList = [];
    const includesList = [];
    const seen = new Set();

    for (const s of pool) {
      const key = `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`;
      if (seen.has(key)) continue;
      const tLower = s.title.toLowerCase();
      const tNorm = normalizeSongTitle(s.title);
      if (tLower.startsWith(lowerVal) || (normVal && tNorm.startsWith(normVal))) {
        seen.add(key);
        startsWithList.push(s);
      } else if (tLower.includes(lowerVal) || (normVal && tNorm.includes(normVal)) || s.artist.toLowerCase().includes(lowerVal)) {
        seen.add(key);
        includesList.push(s);
      }
    }

    currentTypedMatches = [...startsWithList, ...includesList].slice(0, 6);
    renderAutocompleteItems();
  }

  function renderAutocompleteItems() {
    const dropdown = document.getElementById('autocompleteDropdown');
    dropdown.innerHTML = '';
    currentTypedMatches.forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = `ac-item ${idx === currentAcHighlightIndex ? 'highlighted' : ''}`;
      item.innerHTML = `<strong>${m.title}</strong> <span>${m.artist} ${idx === currentAcHighlightIndex ? '↵' : ''}</span>`;
      item.addEventListener('click', () => {
        if (game.answeredCurrent) return;
        handleSongAnswer(m, false);
      });
      dropdown.appendChild(item);
    });
  }

  function onTypingKeyDown(e) {
    if (!game.active || game.answeredCurrent) return;
    if (e.key === 'ArrowDown') {
      if (currentTypedMatches.length > 0) {
        e.preventDefault();
        currentAcHighlightIndex = (currentAcHighlightIndex + 1) % currentTypedMatches.length;
        renderAutocompleteItems();
      }
    } else if (e.key === 'ArrowUp') {
      if (currentTypedMatches.length > 0) {
        e.preventDefault();
        currentAcHighlightIndex = (currentAcHighlightIndex - 1 + currentTypedMatches.length) % currentTypedMatches.length;
        renderAutocompleteItems();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      submitTypedGuess();
    }
  }

  function submitTypedGuess() {
    if (!game.active || game.answeredCurrent) return;
    const input = document.getElementById('songGuessInput');
    const rawVal = (input.value || '').trim();
    if (!rawVal) return;

    const currentSong = game.queue[game.currentIndex];
    const normInput = normalizeSongTitle(rawVal);
    const normCurrent = normalizeSongTitle(currentSong.title);
    const normFull = normalizeSongTitle(currentSong.fullTitle || currentSong.title);

    // 1. Direct case-insensitive / punctuation-insensitive match with current playing song
    if (normInput && (normInput === normCurrent || normInput === normFull)) {
      handleSongAnswer(currentSong, false);
      return;
    }

    // 2. If there is a highlighted autocomplete suggestion, submit it immediately on Enter
    if (currentTypedMatches.length > 0 && currentTypedMatches[currentAcHighlightIndex]) {
      handleSongAnswer(currentTypedMatches[currentAcHighlightIndex], false);
      return;
    }

    // 3. Otherwise submit raw text as a guess (will register as wrong if not matching)
    handleSongAnswer({ id: 'raw_guess', title: rawVal }, false);
  }

  function calculateSongPoints(timeMs, difficulty, streak) {
    // Up to 1000 base points: full 1000 if under 400ms, decays linearly down to 150 at 15,000ms
    const clamped = Math.max(0, Math.min(game.maxListenMs, timeMs));
    const speedFactor = 1 - (clamped / game.maxListenMs) * 0.85;
    let base = Math.round(1000 * speedFactor);

    // Superhuman reflex bonus (< 1.500s)
    if (timeMs <= 1500) base += 200;
    else if (timeMs <= 2500) base += 100;

    const diffMult = DIFF_MULTIPLIERS[difficulty] || 1.0;
    const streakBonus = Math.min(streak * 40, 250);
    return Math.round(base * diffMult + streakBonus);
  }

  function handleSongAnswer(selectedSong, timedOut = false, clickedBtn = null) {
    if (game.answeredCurrent) return;
    game.answeredCurrent = true;

    const elapsedMs = Math.max(50, Math.round(performance.now() - (game.audioStartedAt || performance.now())));
    cancelAnimationFrame(game.rafId);

    const currentSong = game.queue[game.currentIndex];
    const isCorrect = !timedOut && selectedSong && (
      selectedSong.id === currentSong.id ||
      normalizeSongTitle(selectedSong.title) === normalizeSongTitle(currentSong.title) ||
      normalizeSongTitle(selectedSong.title) === normalizeSongTitle(currentSong.fullTitle || '')
    );

    if (isCorrect) {
      setStopwatchDisplay(elapsedMs);
    }

    // Highlight choices if in choice mode
    if (config.inputMode === 'choices') {
      document.querySelectorAll('#answerChoicesContainer .choice-btn').forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.songId === currentSong.id) {
          btn.classList.add('correct-choice');
        } else if (btn === clickedBtn && !isCorrect) {
          btn.classList.add('wrong-choice');
        }
      });
    } else {
      document.getElementById('songGuessInput').disabled = true;
      document.getElementById('autocompleteDropdown').innerHTML = '';
    }

    // Unblur artwork
    document.getElementById('mysteryArtwork').classList.remove('blurred');
    document.getElementById('vinylBadge').textContent = isCorrect ? '✓' : '✕';

    let earnedPoints = 0;
    let isNewArtistFastest = false;

    if (isCorrect) {
      game.streak += 1;
      earnedPoints = calculateSongPoints(elapsedMs, currentSong.difficulty, game.streak);
      game.score += earnedPoints;
      isNewArtistFastest = recordSingleSongStat(currentSong, true, elapsedMs);
      document.getElementById('stopwatchStatusText').textContent = `LOCKED IN — ${formatMs(elapsedMs)}`;
    } else {
      game.streak = 0;
      recordSingleSongStat(currentSong, false, elapsedMs);
      document.getElementById('stopwatchStatusText').textContent = timedOut ? 'TIME EXPIRED' : 'MISSED';
    }

    game.results.push({
      song: currentSong,
      correct: isCorrect,
      timeMs: isCorrect ? elapsedMs : null,
      points: earnedPoints,
      isNewArtistRecord: isNewArtistFastest
    });

    renderProgressDots();
    updateGameHud();
    showSongFeedback(currentSong, isCorrect, elapsedMs, earnedPoints, isNewArtistFastest, timedOut);
  }

  function showSongFeedback(song, isCorrect, elapsedMs, points, isNewArtistFastest, timedOut) {
    const panel = document.getElementById('roundFeedbackPanel');
    const badge = document.getElementById('feedbackResultBadge');
    const timePill = document.getElementById('feedbackTimeTaken');

    if (isCorrect) {
      if (elapsedMs < 1500) {
        badge.textContent = 'זיהוי על-אנושי (מתחת ל-1.5 שניות)';
      } else if (elapsedMs < 3000) {
        badge.textContent = 'זיהוי מהיר במיוחד';
      } else {
        badge.textContent = 'זיהוי מדויק';
      }
      badge.style.color = '#10b981';
      timePill.textContent = `${formatMs(elapsedMs)} (+${points})`;
    } else {
      badge.textContent = timedOut ? 'נגמר הזמן' : 'תשובה שגויה';
      badge.style.color = '#ef4444';
      timePill.textContent = '0 pts';
    }

    document.getElementById('revealedArtwork').src = song.artwork;
    document.getElementById('revealedTitle').textContent = song.fullTitle || song.title;
    document.getElementById('revealedArtistAlbum').textContent = `${song.artist} • ${song.album} (${song.releaseYear})`;

    const recBadge = document.getElementById('newArtistRecordBadge');
    recBadge.classList.toggle('hidden', !isNewArtistFastest);

    const nextBtn = document.getElementById('nextSongBtn');
    nextBtn.textContent = game.currentIndex + 1 < game.queue.length ? 'השיר הבא ↵' : 'לסיכום הסשן ↵';

    panel.classList.remove('hidden');
  }

  function nextSong() {
    stopAudioAndTimer();
    if (game.currentIndex + 1 < game.queue.length) {
      game.currentIndex += 1;
      loadCurrentSong();
    } else {
      finishRound();
    }
  }

  // ==================== RECORDING & UPDATING STATS ====================
  function recordSingleSongStat(song, isCorrect, timeMs) {
    stats.totalSongsPlayed += 1;

    if (!stats.byArtist[song.artist]) {
      stats.byArtist[song.artist] = {
        bestScore: 0,
        bestAvgTimeMs: null,
        fastestSong: null,
        totalCorrect: 0,
        totalPlayed: 0
      };
    }
    const artistStat = stats.byArtist[song.artist];
    artistStat.totalPlayed += 1;

    if (!stats.byGenre[song.genre]) {
      stats.byGenre[song.genre] = {
        bestScore: 0,
        bestAvgTimeMs: null,
        bestAccuracy: '0/0',
        fastestSong: null
      };
    }
    const genreStat = stats.byGenre[song.genre];

    let isNewArtistFastest = false;

    if (isCorrect) {
      stats.totalCorrect += 1;
      stats.totalCorrectTimeMs += timeMs;
      if (timeMs < 2000) stats.sub2SecCount += 1;

      artistStat.totalCorrect += 1;

      // Global fastest song check
      if (!stats.globalFastest || timeMs < stats.globalFastest.timeMs) {
        stats.globalFastest = {
          timeMs,
          songId: song.id,
          title: song.title,
          artist: song.artist,
          artwork: song.artwork,
          date: new Date().toISOString()
        };
      }

      // Artist fastest song check
      if (!artistStat.fastestSong || timeMs < artistStat.fastestSong.timeMs) {
        artistStat.fastestSong = {
          timeMs,
          songId: song.id,
          title: song.title,
          artwork: song.artwork
        };
        isNewArtistFastest = true;
      }

      // Genre fastest song check
      if (!genreStat.fastestSong || timeMs < genreStat.fastestSong.timeMs) {
        genreStat.fastestSong = {
          timeMs,
          title: song.title,
          artist: song.artist
        };
      }

      // Individual song personal record
      if (!stats.songRecords[song.id]) {
        stats.songRecords[song.id] = { fastestMs: timeMs, timesCorrect: 1 };
      } else {
        stats.songRecords[song.id].timesCorrect += 1;
        if (timeMs < stats.songRecords[song.id].fastestMs) {
          stats.songRecords[song.id].fastestMs = timeMs;
        }
      }

      // Hall of Speed Top 15
      stats.fastestHistory.push({
        timeMs,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        artwork: song.artwork,
        diff: song.difficulty
      });
      stats.fastestHistory.sort((a, b) => a.timeMs - b.timeMs);
      stats.fastestHistory = stats.fastestHistory.slice(0, 15);

      // Push fast song identification to Supabase Global Leaderboard
      pushRecordToSupabase({
        record_type: 'song_speed',
        song_id: song.id,
        song_title: song.title,
        artist: song.artist,
        genre: song.genre,
        difficulty: song.difficulty,
        time_ms: timeMs,
        score: null,
        accuracy: null
      });
    }

    saveStats();
    updateHeaderQuickStats();
    return isNewArtistFastest;
  }

  function finishRound() {
    game.active = false;
    stopAudioAndTimer();

    const totalSongs = game.results.length;
    const correctList = game.results.filter((r) => r.correct);
    const accuracyStr = `${correctList.length}/${totalSongs}`;
    const avgTimeMs = correctList.length > 0
      ? Math.round(correctList.reduce((s, r) => s + r.timeMs, 0) / correctList.length)
      : null;

    let fastestInRound = null;
    for (const r of correctList) {
      if (!fastestInRound || r.timeMs < fastestInRound.timeMs) {
        fastestInRound = r;
      }
    }

    // Check & Update Category / Difficulty / Genre / Artist Round Personal Bests
    const comboKey = getComboKey(config.difficulty, config.genre, config.artist);
    const prevCombo = stats.byCombo[comboKey];
    const isNewComboRecord = !prevCombo || game.score > prevCombo.bestScore;

    if (isNewComboRecord) {
      stats.byCombo[comboKey] = {
        bestScore: game.score,
        bestAccuracy: accuracyStr,
        bestAvgTimeMs: avgTimeMs
      };
    }

    // Update Global Best Round
    const catLabel = getCategoryLabel(config.difficulty, config.genre, config.artist);
    if (!stats.globalBestRound || game.score > stats.globalBestRound.score) {
      stats.globalBestRound = {
        score: game.score,
        accuracy: accuracyStr,
        avgTimeMs,
        label: catLabel
      };
    }

    // Update Best Round by Difficulty
    const dKey = config.difficulty;
    if (!stats.byDifficulty[dKey] || game.score > stats.byDifficulty[dKey].bestScore) {
      stats.byDifficulty[dKey] = {
        bestScore: game.score,
        bestAccuracy: accuracyStr,
        bestAvgTimeMs: avgTimeMs,
        gamesPlayed: (stats.byDifficulty[dKey]?.gamesPlayed || 0) + 1
      };
    } else {
      stats.byDifficulty[dKey].gamesPlayed = (stats.byDifficulty[dKey].gamesPlayed || 0) + 1;
    }

    // If round was played for a specific Genre (or single artist belonging to a genre)
    const effectiveGenre = config.genre !== 'all'
      ? config.genre
      : (config.artist !== 'all' ? ARTIST_META[config.artist]?.genre : null);

    if (effectiveGenre) {
      if (!stats.byGenre[effectiveGenre]) {
        stats.byGenre[effectiveGenre] = { bestScore: 0, bestAvgTimeMs: null, bestAccuracy: '0/0', fastestSong: null };
      }
      if (game.score > stats.byGenre[effectiveGenre].bestScore) {
        stats.byGenre[effectiveGenre].bestScore = game.score;
        stats.byGenre[effectiveGenre].bestAccuracy = accuracyStr;
        stats.byGenre[effectiveGenre].bestAvgTimeMs = avgTimeMs;
      }
    }

    // If round was played for a specific Artist
    if (config.artist !== 'all') {
      if (!stats.byArtist[config.artist]) {
        stats.byArtist[config.artist] = { bestScore: 0, bestAvgTimeMs: null, fastestSong: null, totalCorrect: 0, totalPlayed: 0 };
      }
      if (game.score > stats.byArtist[config.artist].bestScore) {
        stats.byArtist[config.artist].bestScore = game.score;
        stats.byArtist[config.artist].bestAvgTimeMs = avgTimeMs;
      }
    }

    saveStats();
    updateHeaderQuickStats();

    // Push completed round score to Supabase Global Leaderboard
    if (game.score > 0) {
      pushRecordToSupabase({
        record_type: 'round_score',
        song_id: null,
        song_title: catLabel,
        artist: config.artist,
        genre: config.genre,
        difficulty: config.difficulty,
        time_ms: avgTimeMs,
        score: game.score,
        accuracy: accuracyStr
      });
    }

    // Populate Summary View
    document.getElementById('summarySubline').textContent = catLabel;
    document.getElementById('newRoundRecordBanner').classList.toggle('hidden', !isNewComboRecord || game.score === 0);
    document.getElementById('sumTotalScore').textContent = game.score.toLocaleString();
    document.getElementById('sumAccuracy').textContent = accuracyStr;
    document.getElementById('sumAvgTime').textContent = formatMs(avgTimeMs);

    if (fastestInRound) {
      document.getElementById('sumFastestTime').textContent = formatMs(fastestInRound.timeMs);
      document.getElementById('sumFastestSongName').textContent = `${fastestInRound.song.title} (${fastestInRound.song.artist})`;
    } else {
      document.getElementById('sumFastestTime').textContent = '--.---s';
      document.getElementById('sumFastestSongName').textContent = '-';
    }

    const tracksList = document.getElementById('summaryTracksList');
    tracksList.innerHTML = '';
    game.results.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'sum-track-row';
      row.innerHTML = `
        <div class="sum-track-left">
          <span>#${i + 1}</span>
          <img src="${r.song.artwork}" class="sum-track-img" alt="" />
          <div>
            <div style="font-weight:800">${r.song.title}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${r.song.artist}</div>
          </div>
        </div>
        <div class="mono" style="font-weight:800; color: ${r.correct ? '#34d399' : '#f87171'}">
          ${r.correct ? `${formatMs(r.timeMs)} (+${r.points})` : '✕ לא זוהה'}
        </div>
      `;
      tracksList.appendChild(row);
    });

    switchView('summary');
  }

  // ==================== DASHBOARD & SIDEBAR RENDERERS ====================
  function updateHeaderQuickStats() {
    document.getElementById('headerFastestTime').textContent = stats.globalFastest
      ? formatMs(stats.globalFastest.timeMs)
      : '--.---s';
    document.getElementById('headerBestScore').textContent = stats.globalBestRound
      ? stats.globalBestRound.score.toLocaleString()
      : '0';
  }

  let selectedStatsArtist = ARTISTS[0] || null;

  function renderSidebarArtistFastest(query = '') {
    const container = document.getElementById('sidebarArtistFastest');
    if (!container) return;
    container.innerHTML = '';

    const q = query.trim().toLowerCase();
    const list = ARTISTS.filter((a) => a.toLowerCase().includes(q));

    if (list.length === 0) {
      container.innerHTML = `<div style="color:var(--text-dim);font-size:0.8rem;padding:0.5rem 0">לא נמצאו אמנים</div>`;
      return;
    }

    list.forEach((artistName) => {
      const meta = ARTIST_META[artistName];
      const aStat = stats.byArtist[artistName];
      const fastest = aStat?.fastestSong;

      const row = document.createElement('div');
      row.className = 'fastest-artist-row';
      row.style.cursor = 'pointer';
      row.title = 'לחץ לבחירת אמן זה לסשן הבא';
      row.innerHTML = `
        <div class="far-left">
          <img src="${meta.avatar}" alt="${artistName}" class="far-img" />
          <div class="far-meta">
            <div class="far-artist">${artistName}</div>
            <div class="far-song">${fastest ? fastest.title : 'טרם זוהה שיר'}</div>
          </div>
        </div>
        <div class="far-time mono ${fastest ? '' : 'empty'}">
          ${fastest ? formatMs(fastest.timeMs) : '--.---s'}
        </div>
      `;
      row.addEventListener('click', () => {
        config.artist = artistName;
        renderArtistCards();
        updateLobbyState();
      });
      container.appendChild(row);
    });
  }

  function renderStatsArtistDropdownList(query = '') {
    const dropdown = document.getElementById('statsArtistDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';

    const q = query.trim().toLowerCase();
    const filtered = ARTISTS.filter((a) => a.toLowerCase().includes(q) || ARTIST_META[a].genre.toLowerCase().includes(q));

    if (filtered.length === 0) {
      dropdown.innerHTML = `<div style="padding:0.75rem;color:var(--text-dim);font-size:0.82rem;text-align:center">לא נמצא אמן בשם זה</div>`;
      return;
    }

    let currentLetter = '';
    filtered.forEach((artistName) => {
      const firstChar = artistName.charAt(0).toUpperCase();
      if (firstChar !== currentLetter) {
        currentLetter = firstChar;
        const div = document.createElement('div');
        div.className = 'az-letter-divider';
        div.textContent = currentLetter;
        dropdown.appendChild(div);
      }

      const meta = ARTIST_META[artistName];
      const aStat = stats.byArtist[artistName];
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = `az-artist-option ${selectedStatsArtist === artistName ? 'active' : ''}`;
      opt.innerHTML = `
        <div class="az-opt-left">
          <img src="${meta.avatar}" alt="${artistName}" class="artist-avatar" />
          <div>
            <div class="artist-btn-name">${artistName}</div>
            <div class="artist-btn-sub">${meta.genre}</div>
          </div>
        </div>
        <span class="az-opt-right mono">${aStat?.fastestSong ? formatMs(aStat.fastestSong.timeMs) : '--.---s'}</span>
      `;
      opt.addEventListener('click', () => {
        selectedStatsArtist = artistName;
        const input = document.getElementById('statsArtistSearchInput');
        if (input) input.value = artistName;
        dropdown.classList.add('hidden');
        renderStatsArtistSpotlight();
      });
      dropdown.appendChild(opt);
    });
  }

  function renderStatsArtistSpotlight() {
    const spotlightEl = document.getElementById('statsArtistSpotlight');
    if (!spotlightEl) return;

    if (!selectedStatsArtist || !ARTIST_META[selectedStatsArtist]) {
      selectedStatsArtist = ARTISTS[0];
    }

    const artistName = selectedStatsArtist;
    const meta = ARTIST_META[artistName];
    const aStat = stats.byArtist[artistName] || { bestScore: 0, bestAvgTimeMs: null, fastestSong: null, totalCorrect: 0, totalPlayed: 0 };
    const acc = aStat.totalPlayed > 0 ? Math.round((aStat.totalCorrect / aStat.totalPlayed) * 100) : 0;

    // Also get all songs of this artist that the user has identified, sorted by fastest time
    const artistSongs = CATALOG.filter((s) => s.artist === artistName);
    const identifiedSongs = artistSongs
      .filter((s) => stats.songRecords[s.id])
      .map((s) => ({ song: s, rec: stats.songRecords[s.id] }))
      .sort((a, b) => a.rec.fastestMs - b.rec.fastestMs);

    let songsBreakdownHtml = '';
    if (identifiedSongs.length > 0) {
      songsBreakdownHtml = `
        <div style="margin-top:0.85rem;padding-top:0.85rem;border-top:1px solid var(--border-subtle)">
          <span class="asc-m-label" style="margin-bottom:0.5rem">שירים שזיהית של ${artistName} (${identifiedSongs.length}/${artistSongs.length} במאגר):</span>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.45rem">
            ${identifiedSongs.map((item) => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);padding:0.4rem 0.65rem;border-radius:6px;direction:ltr">
                <span style="font-size:0.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px">${item.song.title}</span>
                <span class="mono" style="font-size:0.78rem;color:var(--accent-green);font-weight:700">${formatMs(item.rec.fastestMs)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      songsBreakdownHtml = `
        <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border-subtle);font-size:0.8rem;color:var(--text-dim)">
          עדיין לא זיהית שירים של ${artistName} — בחר אותו בעמדת המשחק כדי לקבוע שיא!
        </div>
      `;
    }

    spotlightEl.innerHTML = `
      <div class="artist-stat-card">
        <div class="asc-top" style="flex-wrap:wrap;gap:0.75rem">
          <div class="asc-profile">
            <img src="${meta.avatar}" alt="${artistName}" class="asc-img" style="width:54px;height:54px" />
            <div>
              <div class="asc-name" style="font-size:1.2rem">${artistName}</div>
              <div class="asc-genre">${meta.genre} • ${aStat.totalCorrect} מתוך ${aStat.totalPlayed} ניסיונות זוהו (${acc}% הצלחה)</div>
            </div>
          </div>
          <button type="button" class="quit-btn" id="playThisArtistFromStatsBtn" style="border-color:var(--accent);color:var(--accent)">
            ▶ שחק סשן של ${artistName}
          </button>
        </div>

        <div class="asc-metrics" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
          <div class="asc-metric-box">
            <span class="asc-m-label">השיר הכי מהיר שזיהית</span>
            <span class="asc-m-val mono">${aStat.fastestSong ? formatMs(aStat.fastestSong.timeMs) : '--.---s'}</span>
            <span class="asc-m-sub">${aStat.fastestSong ? aStat.fastestSong.title : 'טרם זוהה'}</span>
          </div>
          <div class="asc-metric-box">
            <span class="asc-m-label">שיא ניקוד בסשן של האמן</span>
            <span class="asc-m-val mono">${aStat.bestScore ? aStat.bestScore.toLocaleString() : 'טרם שוחק'}</span>
            <span class="asc-m-sub">${aStat.bestAvgTimeMs ? 'זמן ממוצע: ' + formatMs(aStat.bestAvgTimeMs) : 'שחק סשן ממוקד לאמן'}</span>
          </div>
          <div class="asc-metric-box">
            <span class="asc-m-label">שליטה בקטלוג האמן</span>
            <span class="asc-m-val mono">${identifiedSongs.length} / ${artistSongs.length}</span>
            <span class="asc-m-sub">שירים שונים שזיהית בהצלחה</span>
          </div>
        </div>
        ${songsBreakdownHtml}
      </div>
    `;

    const playArtistBtn = document.getElementById('playThisArtistFromStatsBtn');
    if (playArtistBtn) {
      playArtistBtn.addEventListener('click', () => {
        config.artist = artistName;
        renderArtistCards();
        updateLobbyState();
        switchView('lobby');
      });
    }
  }

  function renderStatsDashboard() {
    // 1. Global KPIs
    if (stats.globalFastest) {
      document.getElementById('statGlobalFastestTime').textContent = formatMs(stats.globalFastest.timeMs);
      document.getElementById('statGlobalFastestSong').textContent = `${stats.globalFastest.title} • ${stats.globalFastest.artist}`;
    } else {
      document.getElementById('statGlobalFastestTime').textContent = '--.---s';
      document.getElementById('statGlobalFastestSong').textContent = 'טרם נקבע';
    }

    if (stats.globalBestRound) {
      document.getElementById('statGlobalBestScore').textContent = stats.globalBestRound.score.toLocaleString();
      document.getElementById('statGlobalBestCategory').textContent = stats.globalBestRound.label;
    } else {
      document.getElementById('statGlobalBestScore').textContent = '0';
      document.getElementById('statGlobalBestCategory').textContent = 'טרם נקבע';
    }

    const accPct = stats.totalSongsPlayed > 0
      ? Math.round((stats.totalCorrect / stats.totalSongsPlayed) * 100)
      : 0;
    document.getElementById('statGlobalAccuracy').textContent = `${accPct}%`;
    document.getElementById('statGlobalTotalSongs').textContent = `${stats.totalCorrect} מתוך ${stats.totalSongsPlayed} שירים זוהו`;

    const globalAvg = stats.totalCorrect > 0
      ? Math.round(stats.totalCorrectTimeMs / stats.totalCorrect)
      : null;
    document.getElementById('statGlobalAvgTime').textContent = formatMs(globalAvg);
    document.getElementById('statSubSecondCount').textContent = `${stats.sub2SecCount} זיהויים מהירים מתחת ל-2.000 שניות`;

    // 2. Artist Spotlight (Searchable A-Z)
    renderStatsArtistSpotlight();

    // 3. Best Round By Difficulty Table
    const diffContainer = document.getElementById('statsDifficultyTable');
    let diffHtml = `
      <table class="records-table">
        <thead>
          <tr>
            <th>רמת קושי</th>
            <th>שיא ניקוד</th>
            <th>דיוק שיא</th>
            <th>ממוצע זיהוי</th>
          </tr>
        </thead>
        <tbody>
    `;
    ['easy', 'medium', 'hard', 'all'].forEach((dKey) => {
      const rec = stats.byDifficulty[dKey];
      diffHtml += `
        <tr>
          <td><strong>${DIFF_LABELS[dKey]}</strong></td>
          <td class="mono">${rec ? rec.bestScore.toLocaleString() : '-'}</td>
          <td class="mono">${rec ? rec.bestAccuracy : '-'}</td>
          <td class="mono">${rec ? formatMs(rec.bestAvgTimeMs) : '--.---s'}</td>
        </tr>
      `;
    });
    diffHtml += `</tbody></table>`;
    diffContainer.innerHTML = diffHtml;

    // 4. Best Round & Fastest Song By Genre Table
    const genreContainer = document.getElementById('statsGenreTable');
    let genreHtml = `
      <table class="records-table">
        <thead>
          <tr>
            <th>ז'אנר</th>
            <th>שיא סיבוב</th>
            <th>השיר הכי מהיר בז'אנר</th>
          </tr>
        </thead>
        <tbody>
    `;
    GENRES.forEach((g) => {
      const rec = stats.byGenre[g];
      genreHtml += `
        <tr>
          <td><strong>${g}</strong></td>
          <td class="mono">${rec && rec.bestScore ? rec.bestScore.toLocaleString() + ' נק\'' : '-'}</td>
          <td>
            ${rec && rec.fastestSong
              ? `<span class="mono" style="color:var(--accent);font-weight:700">${formatMs(rec.fastestSong.timeMs)}</span> <small style="color:var(--text-dim)">(${rec.fastestSong.title})</small>`
              : '<span style="color:var(--text-dim)">טרם נקבע</span>'}
          </td>
        </tr>
      `;
    });
    genreHtml += `</tbody></table>`;
    genreContainer.innerHTML = genreHtml;

    // 5. Hall of Speed (Top Fastest Identifications)
    const hosContainer = document.getElementById('statsFastestSongsList');
    if (stats.fastestHistory.length === 0) {
      hosContainer.innerHTML = `<p style="color:var(--text-dim)">עדיין אין זיהויים שמורים — התחל לשחק כדי לקבוע שיאי מהירות.</p>`;
    } else {
      hosContainer.innerHTML = '';
      stats.fastestHistory.slice(0, 10).forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'hos-item';
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:0.75rem;direction:ltr;text-align:left">
            <span class="hos-rank">#${idx + 1}</span>
            <img src="${item.artwork}" style="width:36px;height:36px;border-radius:6px" alt="" />
            <div>
              <div style="font-weight:700;font-size:0.9rem">${item.title}</div>
              <div style="font-size:0.74rem;color:var(--text-dim)">${item.artist}</div>
            </div>
          </div>
          <div class="mono" style="font-weight:700;color:var(--accent-green);font-size:0.95rem">
            ${formatMs(item.timeMs)}
          </div>
        `;
        hosContainer.appendChild(div);
      });
    }

    // 6. Load Global Cloud Leaderboard from Supabase
    loadGlobalCloudLeaderboards();
  }

  async function loadGlobalCloudLeaderboards() {
    const fastBox = document.getElementById('globalFastestSongsList');
    const scoreBox = document.getElementById('globalBestRoundsList');
    if (!fastBox || !scoreBox) return;

    if (!isSupabaseConfigured()) {
      fastBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem">לא מחובר ל-Supabase</p>`;
      scoreBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem">לא מחובר ל-Supabase</p>`;
      return;
    }

    try {
      const [fastRows, roundRows] = await Promise.all([
        sbRest('global_records', 'GET', 'record_type=eq.song_speed&order=time_ms.asc&limit=10'),
        sbRest('global_records', 'GET', 'record_type=eq.round_score&order=score.desc&limit=10')
      ]);

      if (!fastRows || fastRows.length === 0) {
        fastBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem">טרם נקבעו שיאי מהירות בענן — היה הראשון!</p>`;
      } else {
        fastBox.innerHTML = '';
        fastRows.forEach((r, idx) => {
          const div = document.createElement('div');
          div.className = 'hos-item';
          div.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.65rem;direction:ltr;text-align:left">
              <span class="hos-rank">#${idx + 1}</span>
              <div>
                <div style="font-weight:700;font-size:0.88rem">${r.song_title || ''} <span style="color:var(--text-dim);font-weight:400">• ${r.artist || ''}</span></div>
                <div class="mono" style="font-size:0.74rem;color:var(--accent)">@${r.username}</div>
              </div>
            </div>
            <div class="mono" style="font-weight:700;color:var(--accent-green);font-size:0.92rem">${formatMs(r.time_ms)}</div>
          `;
          fastBox.appendChild(div);
        });
      }

      if (!roundRows || roundRows.length === 0) {
        scoreBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem">טרם נקבעו שיאי סשן בענן — היה הראשון!</p>`;
      } else {
        scoreBox.innerHTML = '';
        roundRows.forEach((r, idx) => {
          const div = document.createElement('div');
          div.className = 'hos-item';
          div.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.65rem">
              <span class="hos-rank">#${idx + 1}</span>
              <div>
                <div class="mono" style="font-weight:700;font-size:0.86rem;color:var(--accent)">@${r.username}</div>
                <div style="font-size:0.75rem;color:var(--text-dim)">${r.song_title || ''} (${r.accuracy || ''})</div>
              </div>
            </div>
            <div class="mono" style="font-weight:700;color:var(--text-primary);font-size:0.95rem">${(r.score || 0).toLocaleString()} pts</div>
          `;
          scoreBox.appendChild(div);
        });
      }
    } catch (e) {
      fastBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem">שגיאה בטעינת נתוני ענן</p>`;
    }
  }

  // ==================== CATALOG EXPLORER ====================
  function populateCatalogFilters() {
    const sel = document.getElementById('catalogFilterArtist');
    const prev = sel.value || 'all';
    sel.innerHTML = `<option value="all">כל האמנים</option>`;
    ARTISTS.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = `${a} (${ARTIST_META[a].totalSongs})`;
      sel.appendChild(opt);
    });
    if (ARTISTS.includes(prev)) sel.value = prev;
  }

  function renderCatalogView() {
    const artistFilter = document.getElementById('catalogFilterArtist').value;
    const diffFilter = document.getElementById('catalogFilterDiff').value;
    const container = document.getElementById('catalogSongsList');

    const filtered = CATALOG.filter((s) => {
      if (artistFilter !== 'all' && s.artist !== artistFilter) return false;
      if (diffFilter !== 'all' && s.difficulty !== diffFilter) return false;
      return true;
    });

    const diffShort = { easy: 'קל', medium: 'בינוני', hard: 'קשה' };

    let html = `<div class="catalog-grid">`;
    filtered.forEach((song) => {
      const rec = stats.songRecords[song.id];
      html += `
        <div class="cat-song-card">
          <img src="${song.artwork}" alt="" class="cat-song-img" loading="lazy" />
          <div class="cat-song-info">
            <div class="cat-song-title">${song.title}</div>
            <div class="cat-song-sub">${song.artist} • ${song.releaseYear}</div>
            <div style="margin-top:4px;font-size:0.74rem;direction:rtl;text-align:right;color:${rec ? 'var(--accent-green)' : 'var(--text-dim)'}">
              ${rec ? `שיא אישי: <span class="mono">${formatMs(rec.fastestMs)}</span>` : 'טרם זוהה'}
            </div>
          </div>
          <span class="cat-badge ${song.difficulty}">${diffShort[song.difficulty]}</span>
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  // ==================== LIVE ITUNES ARTIST DISCOGRAPHY IMPORTER ====================
  function isJunkTrack(trackName, collectionName = '') {
    const lower = (trackName + ' ' + collectionName).toLowerCase();
    const junk = [
      'instrumental', 'karaoke', 'acappella', 'a cappella', 'sped up', 'slowed',
      'chopped', 'commentary', 'interview', 'skit', 'intro', 'outro', 'interlude',
      'live at', 'live from', '(live', '[live', 'acoustic', 'demo', 'lullaby',
      '8-bit', 'tribute', 'ringtone', 'workout', 'medley'
    ];
    return junk.some((w) => lower.includes(w));
  }

  function cleanTrackTitle(rawTitle) {
    return rawTitle
      .replace(/\s*[\(\[](feat\.?|ft\.?|with|prod\.?|from|bonus|deluxe|remaster|single|original|explicit|clean|version|edit|audio|video|official).*?[\)\]]\s*/gi, '')
      .replace(/\s*\{.*?\}\s*/g, '')
      .replace(/\s*-\s*(single|ep|remastered|live|acoustic|bonus track).*$/gi, '')
      .trim();
  }

  function openImportArtistModal() {
    const modal = document.getElementById('importArtistModal');
    const input = document.getElementById('importArtistQueryInput');
    const status = document.getElementById('importArtistStatus');
    const cands = document.getElementById('importArtistCandidates');
    if (!modal) return;
    modal.classList.remove('hidden');
    input.value = '';
    status.textContent = '';
    cands.innerHTML = '';
    setTimeout(() => input.focus(), 40);
  }

  function closeImportArtistModal() {
    const modal = document.getElementById('importArtistModal');
    if (modal) modal.classList.add('hidden');
  }

  async function searchItunesArtists() {
    const input = document.getElementById('importArtistQueryInput');
    const status = document.getElementById('importArtistStatus');
    const cands = document.getElementById('importArtistCandidates');
    const q = input.value.trim();
    if (!q) return;

    status.textContent = 'מחפש אמנים ב-Apple iTunes...';
    cands.innerHTML = '';

    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=6`);
      const data = await res.json();
      const artists = data.results || [];
      if (artists.length === 0) {
        status.textContent = 'לא נמצאו אמנים בשם זה. נסה איות אחר.';
        return;
      }
      status.textContent = 'בחר את האמן שברצונך לייבא את כל השירים שלו:';
      artists.forEach((art) => {
        const alreadyIn = ARTIST_META[art.artistName];
        const row = document.createElement('div');
        row.className = 'import-cand-row';
        row.innerHTML = `
          <div class="import-cand-info">
            <span class="import-cand-name">${art.artistName}</span>
            <span class="import-cand-genre">${art.primaryGenreName || 'Pop'} ${alreadyIn ? `• כבר במאגר (${alreadyIn.totalSongs} שירים)` : ''}</span>
          </div>
          <button type="button" class="next-song-btn" style="padding:0.45rem 0.9rem;font-size:0.82rem">
            ${alreadyIn ? 'רענן דיסקוגרפיה' : '+ ייבא את כל השירים'}
          </button>
        `;
        row.querySelector('button').addEventListener('click', () => {
          importFullDiscographyFromItunes(art);
        });
        cands.appendChild(row);
      });
    } catch (e) {
      status.textContent = 'שגיאה בחיבור ל-iTunes API. בדוק את חיבור האינטרנט.';
    }
  }

  async function importFullDiscographyFromItunes(artistObj) {
    const status = document.getElementById('importArtistStatus');
    const cands = document.getElementById('importArtistCandidates');
    const artistName = artistObj.artistName;
    const genre = artistObj.primaryGenreName || 'Pop';

    status.textContent = `מושך את כל השירים של ${artistName} מ-iTunes...`;
    cands.innerHTML = '';

    try {
      const [searchRes, lookupRes] = await Promise.all([
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`).then((r) => r.json()).catch(() => ({ results: [] })),
        fetch(`https://itunes.apple.com/lookup?id=${artistObj.artistId}&entity=song&limit=200`).then((r) => r.json()).catch(() => ({ results: [] }))
      ]);

      const rawResults = [...(searchRes.results || []), ...((lookupRes.results || []).slice(1))];
      const seenNorm = new Set();
      const tracks = [];

      for (const it of rawResults) {
        if (it.wrapperType !== 'track' && it.kind !== 'song') continue;
        if (!it.previewUrl || !it.artistName || !it.trackName) continue;

        const aLower = it.artistName.toLowerCase();
        const targetLower = artistName.toLowerCase();
        if (!aLower.startsWith(targetLower) && aLower !== targetLower) continue;
        if (isJunkTrack(it.trackName, it.collectionName)) continue;

        const clean = cleanTrackTitle(it.trackName);
        if (clean.length < 2) continue;

        const normKey = clean.toLowerCase().replace(/[^a-z0-9\u0590-\u05fe]/g, '');
        if (!normKey || seenNorm.has(normKey)) continue;
        seenNorm.add(normKey);

        tracks.push({
          id: `it_${it.trackId}`,
          title: clean,
          fullTitle: it.trackName,
          artist: artistName,
          genre,
          previewUrl: it.previewUrl,
          artwork: it.artworkUrl100 ? it.artworkUrl100.replace('100x100bb', '300x300bb') : '',
          album: it.collectionName || '',
          releaseYear: it.releaseDate ? it.releaseDate.slice(0, 4) : ''
        });
      }

      if (tracks.length < 4) {
        status.textContent = `נמצאו מעט מדי שירים זמינים עבור ${artistName}.`;
        return;
      }

      // Automatically rank into Easy (top 22%), Medium (next 35%), Hard (remaining 43%)
      const easyCut = Math.max(5, Math.round(tracks.length * 0.22));
      const medCut = Math.max(8, Math.round(tracks.length * 0.35));

      tracks.forEach((song, idx) => {
        if (idx < easyCut) song.difficulty = 'easy';
        else if (idx < easyCut + medCut) song.difficulty = 'medium';
        else song.difficulty = 'hard';
      });

      // Merge into CATALOG & persist to localStorage
      const existingIds = new Set(CATALOG.map((s) => s.id));
      const newlyAdded = [];
      tracks.forEach((t) => {
        if (!existingIds.has(t.id)) {
          CATALOG.push(t);
          existingIds.add(t.id);
          newlyAdded.push(t);
        }
      });

      try {
        const prevSaved = JSON.parse(localStorage.getItem(CUSTOM_SONGS_KEY) || '[]');
        const savedIds = new Set(prevSaved.map((s) => s.id));
        newlyAdded.forEach((t) => {
          if (!savedIds.has(t.id)) prevSaved.push(t);
        });
        localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(prevSaved));
      } catch (e) {}

      // Also push to Supabase shared_songs so all players worldwide get this artist!
      if (newlyAdded.length > 0) {
        pushSongsToSupabase(newlyAdded);
      }

      rebuildCatalogIndexes();
      document.getElementById('catalogCountBadge').textContent = CATALOG.length;
      config.artist = artistName;
      config.genre = 'all';

      renderGenreChips();
      renderArtistCards();
      populateCatalogFilters();
      renderCatalogView();
      renderSidebarArtistFastest();
      updateLobbyState();

      closeImportArtistModal();
    } catch (e) {
      status.textContent = 'אירעה שגיאה בעת ייבוא השירים מ-iTunes.';
    }
  }

  // Bind Modal Triggers
  document.addEventListener('DOMContentLoaded', () => {
    const btn1 = document.getElementById('openImportModalBtn');
    const btn2 = document.getElementById('openImportModalFromCatalogBtn');
    const closeBtn = document.getElementById('closeImportModalBtn');
    const searchBtn = document.getElementById('searchItunesArtistBtn');
    const queryInput = document.getElementById('importArtistQueryInput');

    if (btn1) btn1.addEventListener('click', openImportArtistModal);
    if (btn2) btn2.addEventListener('click', openImportArtistModal);
    if (closeBtn) closeBtn.addEventListener('click', closeImportArtistModal);
    if (searchBtn) searchBtn.addEventListener('click', searchItunesArtists);
    const refreshGlobalBtn = document.getElementById('refreshGlobalBoardBtn');
    if (refreshGlobalBtn) refreshGlobalBtn.addEventListener('click', loadGlobalCloudLeaderboards);
    if (queryInput) {
      queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchItunesArtists();
        }
      });
    }
  });

  // Boot the app
  document.addEventListener('DOMContentLoaded', init);
})();
