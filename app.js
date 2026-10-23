/**
 * Beatrushz ⚡ Millisecond Song Quiz
 */

(function () {
  const CATALOG = [...(window.SONGS_CATALOG || [])];
  const STORAGE_KEY = 'beatrush_stats_v1';
  const CUSTOM_SONGS_KEY = 'beatrush_custom_songs_v1';
  const USER_PROFILE_KEY = 'beatrush_user_profile_v1';

  const BAD_REMIX_WORDS = [
    'remix', 'rmx', 'mix)', 'mix]', 'rework', 'vip', 'edit)', 'edit]', 'radio edit',
    'version', 'ver.', 'live', 'acoustic', 'instrumental', 'karaoke', 'sped up',
    'slowed', 'reverb', 'chopped', 'screwed', 'lullaby', 'tribute', 'cover',
    'demo', 'commentary', 'skit', 'interlude', 'intro', 'outro', 'medley',
    'club', 'extended', 'dub', 'bootleg', 'mashup', 'session', 'unplugged',
    'רמיקס', 'בהופעה', 'אקוסטי', 'לייב', 'אינסטרומנטלי', 'קריוקי', 'מחרוזת'
  ];

  function isRemixOrJunk(trackName, fullTitle = '', album = '') {
    const lower = `${trackName || ''} ${fullTitle || ''} ${album || ''}`.toLowerCase();
    return BAD_REMIX_WORDS.some((w) => lower.includes(w));
  }

  function cleanTrackTitle(rawTitle) {
    return (rawTitle || '')
      .replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, '')
      .replace(/\s*-\s*.*$/g, '')
      .trim();
  }

  function mapToBroadGenre(rawGenre) {
    const g = (rawGenre || '').toLowerCase();
    if (g.includes('country')) return 'Country';
    if (g.includes('hip-hop') || g.includes('rap') || g.includes('היפ-הופ')) return 'Hip-Hop';
    if (g.includes('r&b') || g.includes('soul') || g.includes('נשמה')) return 'R&B';
    if (g.includes('rock') || g.includes('alt') || g.includes('indie') || g.includes('רוק')) return 'Rock & Alt';
    if (g.includes('mizrahi') || g.includes('מזרחית') || g.includes('ים תיכוני')) return 'Mizrahi';
    return 'Pop';
  }

  function detectLanguage(str) {
    return /[\u0590-\u05FF]/.test(str || '') ? 'he' : 'en';
  }

  // Load any user-imported artists/songs from localStorage
  try {
    const savedCustom = JSON.parse(localStorage.getItem(CUSTOM_SONGS_KEY) || '[]');
    if (Array.isArray(savedCustom) && savedCustom.length > 0) {
      const existingIds = new Set(CATALOG.map((s) => s.id));
      savedCustom.forEach((s) => {
        if (!existingIds.has(s.id) && !isRemixOrJunk(s.title, s.fullTitle, s.album)) {
          s.genre = mapToBroadGenre(s.genre);
          CATALOG.push(s);
          existingIds.add(s.id);
        }
      });
    }
  } catch (e) {}

  let ARTISTS = [];
  let ARTIST_META = {};
  let GENRES = [];

  function rebuildCatalogIndexes() {
    ARTISTS = [];
    ARTIST_META = {};
    const genresSet = new Set();

    CATALOG.forEach((song) => {
      song.genre = mapToBroadGenre(song.genre);
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

    ARTISTS.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    const preferredOrder = ['Pop', 'Hip-Hop', 'R&B', 'Rock & Alt', 'Country', 'Mizrahi'];
    GENRES = Array.from(genresSet).sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  rebuildCatalogIndexes();

  const DIFF_LABELS = {
    all: 'All Mix',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard'
  };

  const DIFF_MULTIPLIERS = {
    easy: 1.0,
    medium: 1.25,
    hard: 1.5
  };

  // ==================== STATE ====================
  let config = {
    lang: 'all',          // 'all' | 'en' | 'he'
    difficulty: 'all',    // 'all' | 'easy' | 'medium' | 'hard'
    genre: 'all',         // 'all' | genre string
    artist: 'all',        // 'all' | artist string
    inputMode: 'choices', // 'choices' | 'typing'
    roundLength: 10
  };

  let userProfile = loadUserProfile();
  let stats = loadStats();
  let selectedStatsArtist = ARTISTS[0] || null;

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
          if (!existingIds.has(r.id) && !isRemixOrJunk(r.title, r.full_title, r.album)) {
            CATALOG.push({
              id: r.id,
              title: cleanTrackTitle(r.title),
              fullTitle: r.full_title || r.title,
              artist: r.artist,
              genre: mapToBroadGenre(r.genre),
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
          renderGenreChips();
          renderArtistCards();
          renderSidebarArtistFastest();
          updateLobbyState();
        }
      }
    } catch (e) {}
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
    } catch (e) {}
  }

  async function pushRecordToSupabase(recordPayload) {
    if (!isSupabaseConfigured() || !userProfile.username) return;
    try {
      await sbRest('global_records', 'POST', '', Object.assign({
        username: userProfile.username
      }, recordPayload));
    } catch (e) {}
  }

  // Active Game Session State
  let game = {
    active: false,
    queue: [],
    currentIndex: 0,
    score: 0,
    streak: 0,
    results: [],
    audio: new Audio(),
    audioStartedAt: 0,
    rafId: null,
    answeredCurrent: false,
    maxListenMs: 15000
  };

  game.audio.crossOrigin = 'anonymous';

  // ==================== PERSISTENT STATS ENGINE ====================
  function getDefaultStats() {
    return {
      totalSongsPlayed: 0,
      totalCorrect: 0,
      totalCorrectTimeMs: 0,
      sub2SecCount: 0,
      globalFastest: null,
      globalBestRound: null,
      byDifficulty: {},
      byGenre: {},
      byArtist: {},
      byCombo: {},
      songRecords: {},
      fastestHistory: []
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
    const gLabel = genre === 'all' ? 'All Genres' : genre;
    const aLabel = artist === 'all' ? 'All Artists' : artist;
    return `${aLabel} • ${gLabel} • ${dLabel}`;
  }

  // ==================== INITIALIZATION & UI BINDINGS ====================
  function init() {
    updateHeaderUsernameUI();
    renderGenreChips();
    renderArtistCards();
    updateLobbyState();
    updateHeaderQuickStats();
    renderSidebarArtistFastest();
    renderStatsDashboard();
    bindEvents();
    syncSharedSongsFromSupabase();

    if (!userProfile.username) {
      setTimeout(() => openProfileModal(), 350);
    } else {
      syncUserCloudStats(userProfile.username);
    }
  }

  function updateHeaderUsernameUI() {
    const disp = document.getElementById('headerUsernameDisplay');
    if (disp) {
      disp.textContent = userProfile.username ? `@${userProfile.username}` : '@set_tag';
    }
  }

  function openProfileModal() {
    const modal = document.getElementById('profileModal');
    const input = document.getElementById('usernameInput');
    const pinInput = document.getElementById('userPinInput');
    const status = document.getElementById('usernameStatusMsg');
    if (!modal) return;
    modal.classList.remove('hidden');
    input.value = userProfile.username || '';
    if (pinInput) pinInput.value = '';
    status.textContent = '';
    setTimeout(() => {
      if (input.value && pinInput) pinInput.focus();
      else input.focus();
    }, 40);
  }

  function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
  }

  async function hashUserPin(username, pin) {
    const normalized = `${username.toLowerCase().trim()}::beatrushz_v1::${pin.trim()}`;
    try {
      if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(normalized);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return 'pin_v1_' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    let h = 2166136261;
    for (let i = 0; i < normalized.length; i++) {
      h ^= normalized.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'pin_v1_' + (h >>> 0).toString(16);
  }

  async function syncUserCloudStats(username) {
    if (!isSupabaseConfigured() || !username) return;
    try {
      const rows = await sbRest(
        'global_records',
        'GET',
        `username=ilike.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=500`
      );
      if (!Array.isArray(rows) || rows.length === 0) return;

      let updated = false;
      rows.forEach((r) => {
        if (r.record_type === 'song_speed' && r.time_ms > 0) {
          if (!stats.globalFastest || r.time_ms < stats.globalFastest.timeMs) {
            stats.globalFastest = {
              timeMs: r.time_ms,
              songId: r.song_id || '',
              title: r.song_title || '',
              artist: r.artist || '',
              genre: r.genre || '',
              difficulty: r.difficulty || 'all'
            };
            updated = true;
          }
          if (r.artist) {
            if (!stats.byArtist[r.artist]) {
              stats.byArtist[r.artist] = { played: 1, correct: 1, totalCorrectTimeMs: r.time_ms, fastestMs: r.time_ms, fastestSongTitle: r.song_title || '', bestRoundScore: 0 };
              updated = true;
            } else if (!stats.byArtist[r.artist].fastestMs || r.time_ms < stats.byArtist[r.artist].fastestMs) {
              stats.byArtist[r.artist].fastestMs = r.time_ms;
              stats.byArtist[r.artist].fastestSongTitle = r.song_title || '';
              updated = true;
            }
          }
        } else if (r.record_type === 'round_score' && r.score > 0) {
          if (!stats.globalBestRound || r.score > stats.globalBestRound.score) {
            stats.globalBestRound = {
              score: r.score,
              categoryLabel: r.song_title || 'Session',
              accuracy: r.accuracy || '',
              avgMs: r.time_ms || null
            };
            updated = true;
          }
        }
      });

      if (updated) {
        saveStats();
        updateHeaderQuickStats();
        renderSidebarArtistFastest();
        renderStatsDashboard();
        updateLobbyState();
      }
    } catch (e) {}
  }

  async function saveUniqueUsername() {
    const input = document.getElementById('usernameInput');
    const pinInput = document.getElementById('userPinInput');
    const status = document.getElementById('usernameStatusMsg');
    const raw = (input.value || '').trim().replace(/^@/, '');
    const pin = (pinInput ? pinInput.value : '').trim();

    if (raw.length < 2) {
      status.textContent = 'Username must be at least 2 characters.';
      return;
    }
    if (!/^[a-zA-Z0-9_\u0590-\u05FF.-]+$/.test(raw)) {
      status.textContent = 'Use letters, numbers, or underscores only.';
      return;
    }
    if (pin.length < 4) {
      status.textContent = 'Please enter a PIN / passcode (at least 4 characters).';
      if (pinInput) pinInput.focus();
      return;
    }

    status.textContent = '';
    let finalUsername = raw;
    const pinHash = await hashUserPin(raw, pin);

    if (isSupabaseConfigured()) {
      try {
        const existing = await sbRest('players', 'GET', `username=ilike.${encodeURIComponent(raw)}&select=*`);
        if (Array.isArray(existing) && existing.length > 0) {
          const record = existing[0];
          finalUsername = record.username;
          const storedToken = record.client_id || '';

          if (storedToken.startsWith('pin_v1_')) {
            if (storedToken !== pinHash) {
              status.textContent = `Wrong PIN for @${finalUsername} (or username is already taken).`;
              return;
            }
          } else {
            // Legacy account created before PIN was added — upgrade it with this new PIN
            await sbRest(
              'players',
              'PATCH',
              `username=eq.${encodeURIComponent(finalUsername)}`,
              { client_id: pinHash }
            );
          }
        } else {
          await sbRest('players', 'POST', 'on_conflict=username', [{
            username: finalUsername,
            client_id: pinHash
          }], { Prefer: 'resolution=merge-duplicates' });
        }
      } catch (e) {
        status.textContent = 'Could not verify account. Try again.';
        return;
      }
    }

    userProfile.username = finalUsername;
    userProfile.clientId = pinHash;
    saveUserProfile();
    updateHeaderUsernameUI();
    closeProfileModal();
    syncUserCloudStats(finalUsername);
  }

  function bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (game.active) {
          if (!confirm('Leave current session?')) return;
          stopAudioAndTimer();
          game.active = false;
        }
        switchView(btn.dataset.view);
      });
    });

    document.getElementById('logoBtn').addEventListener('click', () => {
      if (game.active) {
        if (!confirm('Leave current session?')) return;
        stopAudioAndTimer();
        game.active = false;
      }
      switchView('lobby');
    });

    // Language Mode Selector
    document.querySelectorAll('#languageModeSelector .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        config.lang = btn.dataset.lang;
        document.querySelectorAll('#languageModeSelector .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

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
    const pinInput = document.getElementById('userPinInput');
    if (openProfBtn) openProfBtn.addEventListener('click', openProfileModal);
    if (closeProfBtn) closeProfBtn.addEventListener('click', closeProfileModal);
    if (saveProfBtn) saveProfBtn.addEventListener('click', saveUniqueUsername);
    if (profInput) {
      profInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (pinInput && !pinInput.value.trim()) {
            pinInput.focus();
          } else {
            saveUniqueUsername();
          }
        }
      });
    }
    if (pinInput) {
      pinInput.addEventListener('keydown', (e) => {
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
      if (confirm('Reset all local statistics and personal records?')) {
        stats = getDefaultStats();
        saveStats();
        updateHeaderQuickStats();
        renderSidebarArtistFastest();
        renderStatsDashboard();
        updateLobbyState();
      }
    });

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
    allChip.textContent = 'All Genres';
    allChip.addEventListener('click', () => {
      config.genre = 'all';
      renderGenreChips();
      renderArtistCards();
      updateLobbyState();
    });
    container.appendChild(allChip);

    const activeGenres = GENRES.filter((g) =>
      getArtistsForCurrentLang().some((a) => ARTIST_META[a]?.genre === g)
    );

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
          <div class="artist-btn-name">All Artists (${langArtists.length})</div>
          <div class="artist-btn-sub">Click to search or select an artist</div>
        </div>
      `;
      if (clearBtn) clearBtn.classList.add('hidden');
    } else {
      const meta = ARTIST_META[config.artist];
      displayEl.innerHTML = `
        <img src="${meta.avatar}" alt="${config.artist}" class="artist-avatar" />
        <div class="artist-btn-info">
          <div class="artist-btn-name">${config.artist}</div>
          <div class="artist-btn-sub">${meta.genre} • ${meta.totalSongs} tracks</div>
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

    if (!q) {
      const allOpt = document.createElement('button');
      allOpt.type = 'button';
      allOpt.className = `az-artist-option ${config.artist === 'all' ? 'active' : ''}`;
      allOpt.innerHTML = `
        <div class="az-opt-left">
          <div class="artist-avatar">ALL</div>
          <div>
            <div class="artist-btn-name">All Artists</div>
            <div class="artist-btn-sub">${langArtists.length} artists available</div>
          </div>
        </div>
        <span class="az-opt-right">Mix</span>
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
      listEl.innerHTML = `<div style="padding:1rem;color:var(--text-dim);text-align:center;font-size:0.84rem">No matching artists found</div>`;
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
        <span class="az-opt-right mono">${meta.totalSongs}</span>
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
    document.getElementById('availablePoolCount').textContent = `${pool.length} tracks`;

    const comboKey = getComboKey(config.difficulty, config.genre, config.artist);
    const pb = stats.byCombo[comboKey];
    const titleEl = document.getElementById('pbCategoryTitle');
    const detailsEl = document.getElementById('pbCategoryDetails');

    titleEl.textContent = getCategoryLabel(config.difficulty, config.genre, config.artist);
    if (pb) {
      detailsEl.innerHTML = `Best Score: <strong class="mono">${pb.bestScore.toLocaleString()}</strong> • Accuracy: <strong class="mono">${pb.bestAccuracy}</strong> • Avg: <strong class="mono">${formatMs(pb.bestAvgTimeMs)}</strong>`;
    } else {
      detailsEl.textContent = 'No personal record set for this filter yet';
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
      alert('No songs match this filter combination. Try selecting All Genres or All Difficulty.');
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

    document.getElementById('activeDiffTag').textContent = DIFF_LABELS[config.difficulty];
    document.getElementById('activeFilterTag').textContent =
      config.artist !== 'all' ? config.artist : (config.genre !== 'all' ? config.genre : 'All Artists');

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

    document.getElementById('roundFeedbackPanel').classList.add('hidden');
    const artworkEl = document.getElementById('mysteryArtwork');
    artworkEl.src = currentSong.artwork;
    artworkEl.classList.add('blurred');
    document.getElementById('vinylBadge').textContent = '?';
    document.getElementById('vinylVisualizer').classList.remove('spinning');
    document.getElementById('waveBars').classList.remove('playing');

    setStopwatchDisplay(0);
    document.getElementById('audioProgressBar').style.width = '0%';
    document.getElementById('stopwatchStatusText').textContent = 'BUFFERING AUDIO...';

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

    game.audio.src = currentSong.previewUrl;
    game.audio.currentTime = 0;

    const onPlaying = () => {
      game.audio.removeEventListener('playing', onPlaying);
      if (!game.active || game.answeredCurrent) return;
      game.audioStartedAt = performance.now();
      document.getElementById('stopwatchStatusText').textContent = 'LIVE AUDIO';
      document.getElementById('vinylVisualizer').classList.add('spinning');
      document.getElementById('waveBars').classList.add('playing');
      startStopwatchLoop();
    };

    game.audio.addEventListener('playing', onPlaying);
    game.audio.play().catch(() => {
      document.getElementById('stopwatchStatusText').textContent = 'TAP TO PLAY AUDIO';
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
      item.innerHTML = `<strong>${m.title}</strong> <span style="color:var(--text-dim);font-size:0.8rem">${m.artist} ${idx === currentAcHighlightIndex ? '↵' : ''}</span>`;
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

    if (normInput && (normInput === normCurrent || normInput === normFull)) {
      handleSongAnswer(currentSong, false);
      return;
    }

    if (currentTypedMatches.length > 0 && currentTypedMatches[currentAcHighlightIndex]) {
      handleSongAnswer(currentTypedMatches[currentAcHighlightIndex], false);
      return;
    }

    handleSongAnswer({ id: 'raw_guess', title: rawVal }, false);
  }

  function calculateSongPoints(timeMs, difficulty, streak) {
    const clamped = Math.max(0, Math.min(game.maxListenMs, timeMs));
    const speedFactor = 1 - (clamped / game.maxListenMs) * 0.85;
    let base = Math.round(1000 * speedFactor);

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
        badge.textContent = 'GODLIKE REFLEX';
      } else if (elapsedMs < 3000) {
        badge.textContent = 'FAST HIT';
      } else {
        badge.textContent = 'CORRECT';
      }
      badge.style.color = 'var(--accent)';
      timePill.textContent = `${formatMs(elapsedMs)} (+${points})`;
    } else {
      badge.textContent = timedOut ? 'TIME UP' : 'WRONG';
      badge.style.color = 'var(--accent-red)';
      timePill.textContent = '0 pts';
    }

    document.getElementById('revealedArtwork').src = song.artwork;
    document.getElementById('revealedTitle').textContent = song.title;
    document.getElementById('revealedArtistAlbum').textContent = `${song.artist} • ${song.album} (${song.releaseYear})`;

    const recBadge = document.getElementById('newArtistRecordBadge');
    recBadge.classList.toggle('hidden', !isNewArtistFastest);

    const nextBtn = document.getElementById('nextSongBtn');
    nextBtn.textContent = game.currentIndex + 1 < game.queue.length ? 'Next ↵' : 'Finish ↵';

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

      if (!artistStat.fastestSong || timeMs < artistStat.fastestSong.timeMs) {
        artistStat.fastestSong = {
          timeMs,
          songId: song.id,
          title: song.title,
          artwork: song.artwork
        };
        isNewArtistFastest = true;
      }

      if (!genreStat.fastestSong || timeMs < genreStat.fastestSong.timeMs) {
        genreStat.fastestSong = {
          timeMs,
          title: song.title,
          artist: song.artist
        };
      }

      if (!stats.songRecords[song.id]) {
        stats.songRecords[song.id] = { fastestMs: timeMs, timesCorrect: 1 };
      } else {
        stats.songRecords[song.id].timesCorrect += 1;
        if (timeMs < stats.songRecords[song.id].fastestMs) {
          stats.songRecords[song.id].fastestMs = timeMs;
        }
      }

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

    const catLabel = getCategoryLabel(config.difficulty, config.genre, config.artist);
    if (!stats.globalBestRound || game.score > stats.globalBestRound.score) {
      stats.globalBestRound = {
        score: game.score,
        accuracy: accuracyStr,
        avgTimeMs,
        label: catLabel
      };
    }

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
          <span class="mono" style="color:var(--text-dim)">#${i + 1}</span>
          <img src="${r.song.artwork}" class="sum-track-img" alt="" />
          <div>
            <div style="font-weight:700;font-size:0.9rem">${r.song.title}</div>
            <div style="font-size:0.75rem;color:var(--text-dim)">${r.song.artist}</div>
          </div>
        </div>
        <div class="mono" style="font-weight:700; color: ${r.correct ? 'var(--accent)' : 'var(--accent-red)'}">
          ${r.correct ? `${formatMs(r.timeMs)} (+${r.points})` : 'MISSED'}
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

  function renderSidebarArtistFastest(query = '') {
    const container = document.getElementById('sidebarArtistFastest');
    if (!container) return;
    container.innerHTML = '';

    const q = query.trim().toLowerCase();
    const list = getArtistsForCurrentLang().filter((a) => a.toLowerCase().includes(q));

    if (list.length === 0) {
      container.innerHTML = `<div style="color:var(--text-dim);font-size:0.8rem;padding:0.5rem 0">No artists found</div>`;
      return;
    }

    list.forEach((artistName) => {
      const meta = ARTIST_META[artistName];
      const aStat = stats.byArtist[artistName];
      const fastest = aStat?.fastestSong;

      const row = document.createElement('div');
      row.className = 'fastest-artist-row';
      row.style.cursor = 'pointer';
      row.title = 'Click to select artist';
      row.innerHTML = `
        <div class="far-left">
          <img src="${meta.avatar}" alt="${artistName}" class="far-img" />
          <div class="far-meta">
            <div class="far-artist">${artistName}</div>
            <div class="far-song">${fastest ? fastest.title : 'No record'}</div>
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
      dropdown.innerHTML = `<div style="padding:0.75rem;color:var(--text-dim);font-size:0.82rem;text-align:center">No artist found</div>`;
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

    const artistSongs = CATALOG.filter((s) => s.artist === artistName);
    const identifiedSongs = artistSongs
      .filter((s) => stats.songRecords[s.id])
      .map((s) => ({ song: s, rec: stats.songRecords[s.id] }))
      .sort((a, b) => a.rec.fastestMs - b.rec.fastestMs);

    let songsBreakdownHtml = '';
    if (identifiedSongs.length > 0) {
      songsBreakdownHtml = `
        <div style="margin-top:0.8rem;padding-top:0.8rem;border-top:1px solid var(--border-subtle)">
          <span class="asc-m-label" style="margin-bottom:0.5rem">IDENTIFIED TRACKS (${identifiedSongs.length}/${artistSongs.length}):</span>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:0.4rem">
            ${identifiedSongs.map((item) => `
              <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--border-subtle);padding:0.38rem 0.6rem;border-radius:6px">
                <span style="font-size:0.78rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px">${item.song.title}</span>
                <span class="mono" style="font-size:0.76rem;color:var(--accent);font-weight:700">${formatMs(item.rec.fastestMs)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    spotlightEl.innerHTML = `
      <div class="artist-stat-card">
        <div class="asc-top" style="flex-wrap:wrap;gap:0.75rem">
          <div class="asc-profile">
            <img src="${meta.avatar}" alt="${artistName}" class="asc-img" style="width:50px;height:50px" />
            <div>
              <div class="asc-name" style="font-size:1.15rem">${artistName}</div>
              <div class="asc-genre">${meta.genre} • ${aStat.totalCorrect}/${aStat.totalPlayed} hits (${acc}%)</div>
            </div>
          </div>
          <button type="button" class="quit-btn" id="playThisArtistFromStatsBtn" style="border-color:var(--accent);color:var(--accent)">
            ▶ Play ${artistName}
          </button>
        </div>

        <div class="asc-metrics" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
          <div class="asc-metric-box">
            <span class="asc-m-label">FASTEST TRACK</span>
            <span class="asc-m-val mono">${aStat.fastestSong ? formatMs(aStat.fastestSong.timeMs) : '--.---s'}</span>
            <span class="asc-m-sub">${aStat.fastestSong ? aStat.fastestSong.title : 'None yet'}</span>
          </div>
          <div class="asc-metric-box">
            <span class="asc-m-label">BEST SESSION SCORE</span>
            <span class="asc-m-val mono">${aStat.bestScore ? aStat.bestScore.toLocaleString() : '0'}</span>
            <span class="asc-m-sub">${aStat.bestAvgTimeMs ? 'Avg: ' + formatMs(aStat.bestAvgTimeMs) : 'No session yet'}</span>
          </div>
          <div class="asc-metric-box">
            <span class="asc-m-label">DISCOGRAPHY UNLOCKED</span>
            <span class="asc-m-val mono">${identifiedSongs.length} / ${artistSongs.length}</span>
            <span class="asc-m-sub">Tracks identified</span>
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
    if (stats.globalFastest) {
      document.getElementById('statGlobalFastestTime').textContent = formatMs(stats.globalFastest.timeMs);
      document.getElementById('statGlobalFastestSong').textContent = `${stats.globalFastest.title} • ${stats.globalFastest.artist}`;
    } else {
      document.getElementById('statGlobalFastestTime').textContent = '--.---s';
      document.getElementById('statGlobalFastestSong').textContent = 'None yet';
    }

    if (stats.globalBestRound) {
      document.getElementById('statGlobalBestScore').textContent = stats.globalBestRound.score.toLocaleString();
      document.getElementById('statGlobalBestCategory').textContent = stats.globalBestRound.label;
    } else {
      document.getElementById('statGlobalBestScore').textContent = '0';
      document.getElementById('statGlobalBestCategory').textContent = 'None yet';
    }

    const accPct = stats.totalSongsPlayed > 0
      ? Math.round((stats.totalCorrect / stats.totalSongsPlayed) * 100)
      : 0;
    document.getElementById('statGlobalAccuracy').textContent = `${accPct}%`;
    document.getElementById('statGlobalTotalSongs').textContent = `${stats.totalCorrect} / ${stats.totalSongsPlayed} hits`;

    const globalAvg = stats.totalCorrect > 0
      ? Math.round(stats.totalCorrectTimeMs / stats.totalCorrect)
      : null;
    document.getElementById('statGlobalAvgTime').textContent = formatMs(globalAvg);
    document.getElementById('statSubSecondCount').textContent = `${stats.sub2SecCount} hits under 2.000s`;

    renderStatsArtistSpotlight();

    const diffContainer = document.getElementById('statsDifficultyTable');
    let diffHtml = `
      <table class="records-table">
        <thead>
          <tr>
            <th>Difficulty</th>
            <th>Best Score</th>
            <th>Accuracy</th>
            <th>Avg Time</th>
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

    const genreContainer = document.getElementById('statsGenreTable');
    let genreHtml = `
      <table class="records-table">
        <thead>
          <tr>
            <th>Genre</th>
            <th>Best Score</th>
            <th>Fastest Track</th>
          </tr>
        </thead>
        <tbody>
    `;
    GENRES.forEach((g) => {
      const rec = stats.byGenre[g];
      genreHtml += `
        <tr>
          <td><strong>${g}</strong></td>
          <td class="mono">${rec && rec.bestScore ? rec.bestScore.toLocaleString() : '-'}</td>
          <td>
            ${rec && rec.fastestSong
              ? `<span class="mono" style="color:var(--accent);font-weight:700">${formatMs(rec.fastestSong.timeMs)}</span> <small style="color:var(--text-dim)">(${rec.fastestSong.title})</small>`
              : '<span style="color:var(--text-dim)">-</span>'}
          </td>
        </tr>
      `;
    });
    genreHtml += `</tbody></table>`;
    genreContainer.innerHTML = genreHtml;

    const hosContainer = document.getElementById('statsFastestSongsList');
    if (stats.fastestHistory.length === 0) {
      hosContainer.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem">No records yet — play a session to set your fastest time.</p>`;
    } else {
      hosContainer.innerHTML = '';
      stats.fastestHistory.slice(0, 10).forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'hos-item';
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:0.7rem">
            <span class="hos-rank">#${idx + 1}</span>
            <img src="${item.artwork}" style="width:34px;height:34px;border-radius:6px" alt="" />
            <div>
              <div style="font-weight:700;font-size:0.88rem">${item.title}</div>
              <div style="font-size:0.72rem;color:var(--text-dim)">${item.artist}</div>
            </div>
          </div>
          <div class="mono" style="font-weight:700;color:var(--accent);font-size:0.92rem">
            ${formatMs(item.timeMs)}
          </div>
        `;
        hosContainer.appendChild(div);
      });
    }

    loadGlobalCloudLeaderboards();
  }

  async function loadGlobalCloudLeaderboards() {
    const fastBox = document.getElementById('globalFastestSongsList');
    const scoreBox = document.getElementById('globalBestRoundsList');
    if (!fastBox || !scoreBox || !isSupabaseConfigured()) return;

    try {
      const [fastRows, roundRows] = await Promise.all([
        sbRest('global_records', 'GET', 'record_type=eq.song_speed&order=time_ms.asc&limit=10'),
        sbRest('global_records', 'GET', 'record_type=eq.round_score&order=score.desc&limit=10')
      ]);

      if (!fastRows || fastRows.length === 0) {
        fastBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.8rem">No global records yet.</p>`;
      } else {
        fastBox.innerHTML = '';
        fastRows.forEach((r, idx) => {
          const div = document.createElement('div');
          div.className = 'hos-item';
          div.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.65rem">
              <span class="hos-rank">#${idx + 1}</span>
              <div>
                <div style="font-weight:700;font-size:0.86rem">${r.song_title || ''} <span style="color:var(--text-dim);font-weight:400">• ${r.artist || ''}</span></div>
                <div class="mono" style="font-size:0.72rem;color:var(--accent)">@${r.username}</div>
              </div>
            </div>
            <div class="mono" style="font-weight:700;color:var(--accent);font-size:0.9rem">${formatMs(r.time_ms)}</div>
          `;
          fastBox.appendChild(div);
        });
      }

      if (!roundRows || roundRows.length === 0) {
        scoreBox.innerHTML = `<p style="color:var(--text-dim);font-size:0.8rem">No global scores yet.</p>`;
      } else {
        scoreBox.innerHTML = '';
        roundRows.forEach((r, idx) => {
          const div = document.createElement('div');
          div.className = 'hos-item';
          div.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.65rem">
              <span class="hos-rank">#${idx + 1}</span>
              <div>
                <div class="mono" style="font-weight:700;font-size:0.84rem;color:var(--accent)">@${r.username}</div>
                <div style="font-size:0.72rem;color:var(--text-dim)">${r.song_title || ''} (${r.accuracy || ''})</div>
              </div>
            </div>
            <div class="mono" style="font-weight:700;color:var(--text-primary);font-size:0.92rem">${(r.score || 0).toLocaleString()} pts</div>
          `;
          scoreBox.appendChild(div);
        });
      }
    } catch (e) {}
  }

  // ==================== LIVE ITUNES ARTIST DISCOGRAPHY IMPORTER ====================
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

    status.textContent = 'Searching artists...';
    cands.innerHTML = '';

    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=6`);
      const data = await res.json();
      const artists = data.results || [];
      if (artists.length === 0) {
        status.textContent = 'No artists found.';
        return;
      }
      status.textContent = '';
      artists.forEach((art) => {
        const alreadyIn = ARTIST_META[art.artistName];
        const broadGenre = mapToBroadGenre(art.primaryGenreName);
        const row = document.createElement('div');
        row.className = 'import-cand-row';
        row.innerHTML = `
          <div class="import-cand-info">
            <span class="import-cand-name">${art.artistName}</span>
            <span class="import-cand-genre">${broadGenre} ${alreadyIn ? `• In library (${alreadyIn.totalSongs})` : ''}</span>
          </div>
          <button type="button" class="next-song-btn" style="padding:0.42rem 0.85rem;font-size:0.8rem">
            ${alreadyIn ? 'Update' : '+ Import'}
          </button>
        `;
        row.querySelector('button').addEventListener('click', () => {
          importFullDiscographyFromItunes(art);
        });
        cands.appendChild(row);
      });
    } catch (e) {
      status.textContent = 'Connection error.';
    }
  }

  async function importFullDiscographyFromItunes(artistObj) {
    const status = document.getElementById('importArtistStatus');
    const cands = document.getElementById('importArtistCandidates');
    const artistName = artistObj.artistName;
    const genre = mapToBroadGenre(artistObj.primaryGenreName);
    const lang = detectLanguage(artistName);

    status.textContent = `Importing ${artistName}...`;
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
        if (isRemixOrJunk(it.trackName, it.trackName, it.collectionName)) continue;

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
          lang,
          previewUrl: it.previewUrl,
          artwork: it.artworkUrl100 ? it.artworkUrl100.replace('100x100bb', '300x300bb') : '',
          album: it.collectionName || '',
          releaseYear: it.releaseDate ? it.releaseDate.slice(0, 4) : ''
        });
      }

      if (tracks.length < 4) {
        status.textContent = `Not enough tracks found for ${artistName}.`;
        return;
      }

      const easyCut = Math.max(5, Math.round(tracks.length * 0.25));
      const medCut = Math.max(8, Math.round(tracks.length * 0.35));

      tracks.forEach((song, idx) => {
        if (idx < easyCut) song.difficulty = 'easy';
        else if (idx < easyCut + medCut) song.difficulty = 'medium';
        else song.difficulty = 'hard';
      });

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

      if (newlyAdded.length > 0) {
        pushSongsToSupabase(newlyAdded);
      }

      rebuildCatalogIndexes();
      config.artist = artistName;
      config.genre = 'all';

      renderGenreChips();
      renderArtistCards();
      renderSidebarArtistFastest();
      updateLobbyState();

      closeImportArtistModal();
    } catch (e) {
      status.textContent = 'Import failed.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn1 = document.getElementById('openImportModalBtn');
    const closeBtn = document.getElementById('closeImportModalBtn');
    const searchBtn = document.getElementById('searchItunesArtistBtn');
    const queryInput = document.getElementById('importArtistQueryInput');
    const refreshGlobalBtn = document.getElementById('refreshGlobalBoardBtn');

    if (btn1) btn1.addEventListener('click', openImportArtistModal);
    if (closeBtn) closeBtn.addEventListener('click', closeImportArtistModal);
    if (searchBtn) searchBtn.addEventListener('click', searchItunesArtists);
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

  document.addEventListener('DOMContentLoaded', init);
})();
