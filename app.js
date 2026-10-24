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
    'clean edit', '(clean)', '[clean]', 'clean version',
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

  const CAMPAIGN_STAGES = {
    1: { stage: 1, name: 'Stage 1: Hits', shortName: 'STAGE 1', diff: 'easy', roundLength: 5, minCorrect: 4, minScore: 2800 },
    2: { stage: 2, name: 'Stage 2: Popular', shortName: 'STAGE 2', diff: 'medium', roundLength: 5, minCorrect: 4, minScore: 3400 },
    3: { stage: 3, name: 'Stage 3: Deep Cuts', shortName: 'STAGE 3', diff: 'hard', roundLength: 5, minCorrect: 4, minScore: 4000 }
  };

  // ==================== STATE ====================
  let config = {
    lang: 'all',          // 'all' | 'en' | 'he'
    difficulty: 'all',    // 'all' | 'easy' | 'medium' | 'hard'
    genre: 'all',         // 'all' | genre string
    artist: 'all',        // 'all' | artist string
    inputMode: 'choices', // 'choices' | 'typing'
    roundLength: 10,
    campaignStage: 1      // 1 | 2 | 3 | 'free'
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
      fastestHistory: [],
      artistCampaigns: {},
      unlockedCards: {},
      dailyHistory: {}
    };
  }

  function getArtistVaultTargetSongs(artistName) {
    const artistTracks = CATALOG.filter((s) => s.artist === artistName);
    if (artistTracks.length === 0) return [];
    const easyTrack = artistTracks.find((s) => s.difficulty === 'easy') || artistTracks[0];
    const medTrack = artistTracks.find((s) => s.difficulty === 'medium' && s.id !== easyTrack.id) || artistTracks[Math.min(1, artistTracks.length - 1)];
    const hardTrack = artistTracks.find((s) => s.difficulty === 'hard' && s.id !== easyTrack.id && s.id !== medTrack.id) || artistTracks[Math.min(2, artistTracks.length - 1)];
    return [
      { rarity: 'rare', label: 'RARE • EASY', song: easyTrack },
      { rarity: 'epic', label: 'EPIC • MEDIUM', song: medTrack },
      { rarity: 'legendary', label: 'LEGENDARY • HARD', song: hardTrack }
    ].filter((x) => Boolean(x.song));
  }

  let cardDropTimeoutId = null;

  function showCardDropAnimation(cardObj) {
    const overlay = document.getElementById('cardDropOverlay');
    const rarityPill = document.getElementById('cdRarityPill');
    const visual = document.getElementById('cdCardVisual');
    const titleEl = document.getElementById('cdSongTitle');
    const artistEl = document.getElementById('cdSongArtist');
    const timeEl = document.getElementById('cdTimeBadge');
    const box = document.getElementById('cardDropBox');
    if (!overlay) return;

    const rarityColors = {
      rare: { border: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)', text: '#38bdf8', label: '💎 RARE CARD UNLOCKED' },
      epic: { border: '#c084fc', bg: 'rgba(192, 132, 252, 0.18)', text: '#c084fc', label: '🔮 EPIC CARD UNLOCKED' },
      legendary: { border: '#facc15', bg: 'rgba(250, 204, 21, 0.2)', text: '#facc15', label: '👑 LEGENDARY CARD UNLOCKED' }
    };
    const style = rarityColors[cardObj.rarity] || rarityColors.rare;

    if (rarityPill) {
      rarityPill.textContent = style.label;
      rarityPill.style.color = style.text;
      rarityPill.style.borderColor = style.border;
      rarityPill.style.background = style.bg;
    }
    if (box) box.style.borderColor = style.border;
    if (visual) visual.style.backgroundImage = cardObj.artwork ? `url("${cardObj.artwork}")` : 'none';
    if (titleEl) titleEl.textContent = cardObj.title;
    if (artistEl) artistEl.textContent = cardObj.artist;
    if (timeEl) timeEl.textContent = `⚡ Captured in ${formatMs(cardObj.timeMs)}`;

    overlay.classList.remove('hidden');
    clearTimeout(cardDropTimeoutId);
    cardDropTimeoutId = setTimeout(() => {
      overlay.classList.add('hidden');
    }, 4200);
  }

  function checkAndUnlockCollectibleCard(song, timeMs) {
    if (!stats.unlockedCards) stats.unlockedCards = {};

    const targets = getArtistVaultTargetSongs(song.artist);
    const matchingTarget = targets.find((t) => t.song && t.song.id === song.id);

    let earnedRarity = null;
    if (matchingTarget && timeMs < 1000) {
      earnedRarity = matchingTarget.rarity;
    } else if (timeMs < 500) {
      earnedRarity = song.difficulty === 'hard' ? 'legendary' : (song.difficulty === 'medium' ? 'epic' : 'rare');
    }

    if (!earnedRarity) return false;

    const existing = stats.unlockedCards[song.id];
    const isFirstUnlock = !existing;
    const isFaster = existing && timeMs < existing.timeMs;

    if (isFirstUnlock || isFaster) {
      const cardData = {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        artwork: song.artwork,
        rarity: earnedRarity,
        timeMs,
        isVaultTarget: Boolean(matchingTarget),
        date: new Date().toISOString()
      };
      stats.unlockedCards[song.id] = cardData;
      saveStats();

      pushRecordToSupabase({
        record_type: 'card_unlock',
        song_id: song.id,
        song_title: song.title,
        artist: song.artist,
        genre: song.genre,
        difficulty: earnedRarity,
        time_ms: timeMs,
        score: null,
        accuracy: null
      });

      showCardDropAnimation(cardData);
      return true;
    }
    return false;
  }

  function getArtistCampaign(artistName) {
    if (!stats.artistCampaigns) stats.artistCampaigns = {};
    if (!stats.artistCampaigns[artistName]) {
      stats.artistCampaigns[artistName] = {
        unlockedStage: 1,
        mastered: false,
        stageScores: { 1: 0, 2: 0, 3: 0 },
        totalMasteryScore: 0
      };
    }
    return stats.artistCampaigns[artistName];
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
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedArtist = params.get('artist');
      if (sharedArtist && ARTIST_META[sharedArtist]) {
        selectArtistForLobby(sharedArtist);
      }
    } catch (e) {}

    updateHeaderUsernameUI();
    renderGenreChips();
    renderArtistCards();
    updateLobbyState();
    updateDailyBannerUI();
    updateHeaderQuickStats();
    renderSidebarArtistFastest();
    renderStatsDashboard();
    renderCollectionDashboard();
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
    const bnavLabel = document.getElementById('bottomNavUserLabel');
    if (bnavLabel) {
      bnavLabel.textContent = userProfile.username ? `@${userProfile.username}` : 'Profile';
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
        } else if (r.record_type === 'artist_stage' && r.artist) {
          const camp = getArtistCampaign(r.artist);
          const stageNum = parseInt(r.difficulty, 10) || 1;
          if (r.score > (camp.stageScores[stageNum] || 0)) {
            camp.stageScores[stageNum] = r.score;
            updated = true;
          }
          if (stageNum + 1 > camp.unlockedStage) {
            camp.unlockedStage = Math.min(4, stageNum + 1);
            if (camp.unlockedStage >= 4) camp.mastered = true;
            updated = true;
          }
          camp.totalMasteryScore = (camp.stageScores[1] || 0) + (camp.stageScores[2] || 0) + (camp.stageScores[3] || 0);
        } else if (r.record_type === 'artist_mastery' && r.artist) {
          const camp = getArtistCampaign(r.artist);
          camp.mastered = true;
          camp.unlockedStage = 4;
          if (r.score > (camp.totalMasteryScore || 0)) {
            camp.totalMasteryScore = r.score;
          }
          updated = true;
        } else if (r.record_type === 'card_unlock' && r.song_id) {
          if (!stats.unlockedCards) stats.unlockedCards = {};
          const existingCard = stats.unlockedCards[r.song_id];
          if (!existingCard || (r.time_ms > 0 && r.time_ms < existingCard.timeMs)) {
            const catSong = CATALOG.find((s) => s.id === r.song_id);
            stats.unlockedCards[r.song_id] = {
              songId: r.song_id,
              title: r.song_title || catSong?.title || 'Track',
              artist: r.artist || catSong?.artist || '',
              artwork: catSong?.artwork || '',
              rarity: r.difficulty || 'rare',
              timeMs: r.time_ms || 499,
              isVaultTarget: true
            };
            updated = true;
          }
        }
      });

      if (updated) {
        saveStats();
        updateHeaderQuickStats();
        renderArtistCards();
        renderSidebarArtistFastest();
        renderStatsDashboard();
        renderCollectionDashboard();
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

    // Start Game Button & Daily Challenge Button
    document.getElementById('startGameBtn').addEventListener('click', startNewGame);
    const dailyBtn = document.getElementById('startDailyChallengeBtn');
    if (dailyBtn) {
      dailyBtn.addEventListener('click', startDailyChallenge);
    }
    const cardDropClose = document.getElementById('cardDropOverlay');
    if (cardDropClose) {
      cardDropClose.addEventListener('click', () => cardDropClose.classList.add('hidden'));
    }
    document.getElementById('quitGameBtn').addEventListener('click', () => {
      stopAudioAndTimer();
      game.active = false;
      switchView('lobby');
    });

    document.getElementById('nextSongBtn').addEventListener('click', () => {
      nextSong();
    });

    document.getElementById('playAgainSameBtn').addEventListener('click', () => {
      if (game.isDailyChallenge) {
        startDailyChallenge();
      } else {
        startNewGame();
      }
    });
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
      selectArtistForLobby('all');
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
    if (viewName === 'collection') renderCollectionDashboard();
    if (viewName === 'lobby') {
      updateDailyBannerUI();
      updateLobbyState();
      renderSidebarArtistFastest();
    }
  }

  // ==================== LOBBY FILTERS & POOL ====================
  function getArtistsForCurrentLang() {
    if (config.lang === 'all') return ARTISTS;
    return ARTISTS.filter((a) => ARTIST_META[a]?.lang === config.lang);
  }

  function getGenreCoverImage(genreName) {
    const langArtists = getArtistsForCurrentLang();
    if (genreName === 'all') {
      const firstArt = langArtists.find((a) => ARTIST_META[a]?.avatar);
      return firstArt ? ARTIST_META[firstArt].avatar : '';
    }
    const matchArt = langArtists.find((a) => ARTIST_META[a]?.genre === genreName && ARTIST_META[a]?.avatar);
    return matchArt ? ARTIST_META[matchArt].avatar : '';
  }

  function renderGenreChips() {
    const container = document.getElementById('genreSelector');
    container.innerHTML = '';

    const langArtists = getArtistsForCurrentLang();
    const allCover = getGenreCoverImage('all');
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `genre-visual-card ${config.genre === 'all' ? 'active' : ''}`;
    if (allCover) allChip.style.backgroundImage = `url("${allCover}")`;
    allChip.innerHTML = `
      <div class="glass-card-overlay">
        <span class="gvc-title">All Genres</span>
        <span class="gvc-count">${langArtists.length}</span>
      </div>
    `;
    allChip.addEventListener('click', () => {
      config.genre = 'all';
      renderGenreChips();
      renderArtistCards();
      updateLobbyState();
    });
    container.appendChild(allChip);

    const activeGenres = GENRES.filter((g) =>
      langArtists.some((a) => ARTIST_META[a]?.genre === g)
    );

    activeGenres.forEach((g) => {
      const gCover = getGenreCoverImage(g);
      const gCount = langArtists.filter((a) => ARTIST_META[a]?.genre === g).length;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `genre-visual-card ${config.genre === g ? 'active' : ''}`;
      if (gCover) chip.style.backgroundImage = `url("${gCover}")`;
      chip.innerHTML = `
        <div class="glass-card-overlay">
          <span class="gvc-title">${g}</span>
          <span class="gvc-count">${gCount}</span>
        </div>
      `;
      chip.addEventListener('click', () => {
        config.genre = g;
        if (config.artist !== 'all' && ARTIST_META[config.artist]?.genre !== g) {
          selectArtistForLobby('all');
        }
        renderGenreChips();
        renderArtistCards();
        updateLobbyState();
      });
      container.appendChild(chip);
    });
  }

  function selectArtistForLobby(artistName) {
    config.artist = artistName;
    if (artistName !== 'all') {
      const camp = getArtistCampaign(artistName);
      if (camp.mastered || camp.unlockedStage >= 4) {
        config.campaignStage = 'free';
      } else {
        config.campaignStage = camp.unlockedStage || 1;
      }
    }
  }

  function renderArtistCards() {
    const displayEl = document.getElementById('selectedArtistDisplay');
    const selectedBar = document.getElementById('selectedArtistBar');
    const clearBtn = document.getElementById('clearArtistSelectionBtn');
    if (!displayEl) return;

    const langArtists = getArtistsForCurrentLang();

    if (config.artist === 'all') {
      const cover = getGenreCoverImage(config.genre);
      if (selectedBar) {
        selectedBar.style.backgroundImage = cover ? `url("${cover}")` : 'none';
      }
      displayEl.innerHTML = `
        <div class="artist-avatar">ALL</div>
        <div class="artist-btn-info">
          <div class="artist-btn-name">All Artists (${langArtists.length})</div>
          <div class="artist-btn-sub">Free Play Open • Tap to pick an artist campaign</div>
        </div>
      `;
      if (clearBtn) clearBtn.classList.add('hidden');
    } else {
      const meta = ARTIST_META[config.artist];
      const camp = getArtistCampaign(config.artist);
      const badgeStr = camp.mastered ? '👑 MASTER' : `Stage ${Math.min(3, camp.unlockedStage || 1)}/3`;
      if (selectedBar) {
        selectedBar.style.backgroundImage = meta.avatar ? `url("${meta.avatar}")` : 'none';
      }
      displayEl.innerHTML = `
        <img src="${meta.avatar}" alt="${config.artist}" class="artist-avatar" />
        <div class="artist-btn-info">
          <div class="artist-btn-name">${config.artist} <span style="color:var(--accent);font-size:0.75rem;margin-left:0.35rem">${badgeStr}</span></div>
          <div class="artist-btn-sub">${meta.genre} • ${meta.totalSongs} tracks</div>
        </div>
      `;
      if (clearBtn) clearBtn.classList.remove('hidden');
    }

    renderLobbyArtistAzList(document.getElementById('lobbyArtistSearchInput')?.value || '');
    renderArtistCampaignPanel();
  }

  function renderLobbyArtistAzList(query = '') {
    const listEl = document.getElementById('lobbyArtistAzList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const q = query.trim().toLowerCase();
    const langArtists = getArtistsForCurrentLang();

    if (!q) {
      const allCover = getGenreCoverImage(config.genre);
      const allOpt = document.createElement('button');
      allOpt.type = 'button';
      allOpt.className = `az-artist-option ${config.artist === 'all' ? 'active' : ''}`;
      if (allCover) allOpt.style.backgroundImage = `url("${allCover}")`;
      allOpt.innerHTML = `
        <div class="az-glass-bar">
          <div class="az-opt-left">
            <div class="artist-avatar">ALL</div>
            <div style="min-width:0">
              <div class="artist-btn-name">All Artists</div>
              <div class="artist-btn-sub">${langArtists.length} artists • Free Play</div>
            </div>
          </div>
          <span class="az-opt-right mono">MIX</span>
        </div>
      `;
      allOpt.addEventListener('click', () => {
        selectArtistForLobby('all');
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
      listEl.innerHTML = `<div style="grid-column:1/-1;padding:1rem;color:var(--text-dim);text-align:center;font-size:0.84rem">No matching artists found</div>`;
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
      const camp = getArtistCampaign(artistName);
      const matchesGenre = config.genre === 'all' || meta.genre === config.genre;
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = `az-artist-option ${config.artist === artistName ? 'active' : ''} ${!matchesGenre ? 'disabled-by-genre' : ''}`;
      if (meta.avatar) opt.style.backgroundImage = `url("${meta.avatar}")`;
      opt.innerHTML = `
        <div class="az-glass-bar">
          <div class="az-opt-left">
            <img src="${meta.avatar}" alt="${artistName}" class="artist-avatar" />
            <div style="min-width:0">
              <div class="artist-btn-name">${artistName} ${camp.mastered ? '👑' : ''}</div>
              <div class="artist-btn-sub">${meta.genre} • ${camp.mastered ? 'Mastered' : `Stg ${Math.min(3, camp.unlockedStage || 1)}/3`}</div>
            </div>
          </div>
          <span class="az-opt-right mono">${meta.totalSongs}</span>
        </div>
      `;
      opt.addEventListener('click', () => {
        selectArtistForLobby(artistName);
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

  async function loadArtistWorldTopMasters(artistName) {
    const listEl = document.getElementById('acpWorldTopList');
    if (!listEl) return;
    if (!isSupabaseConfigured()) {
      listEl.innerHTML = `<span style="color:var(--text-dim)">Offline</span>`;
      return;
    }
    listEl.innerHTML = `<span style="color:var(--text-dim)">Loading...</span>`;
    try {
      const rows = await sbRest(
        'global_records',
        'GET',
        `record_type=eq.artist_mastery&artist=eq.${encodeURIComponent(artistName)}&order=score.desc&limit=15`
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        listEl.innerHTML = `<span style="color:var(--text-dim)">No Master crowned yet — be #1 in the world!</span>`;
        return;
      }
      // Deduplicate by username (keep highest score per player)
      const bestByPlayer = [];
      const seenUsers = new Set();
      for (const r of rows) {
        const uKey = (r.username || '').toLowerCase();
        if (!uKey || seenUsers.has(uKey)) continue;
        seenUsers.add(uKey);
        bestByPlayer.push(r);
        if (bestByPlayer.length === 3) break;
      }
      listEl.innerHTML = bestByPlayer.map((r, idx) => `
        <span class="acp-world-pill ${idx === 0 ? 'rank-1' : ''}">
          ${idx === 0 ? '👑 #1' : `#${idx + 1}`} @${r.username} (${(r.score || 0).toLocaleString()})
        </span>
      `).join('');
    } catch (e) {
      listEl.innerHTML = `<span style="color:var(--text-dim)">No records yet</span>`;
    }
  }

  function renderArtistCampaignPanel() {
    const panel = document.getElementById('artistCampaignPanel');
    const diffGroup = document.getElementById('difficultySelector')?.closest('.filter-group');
    const lenGroup = document.getElementById('roundLengthSelector')?.closest('.filter-group');
    const startBtn = document.getElementById('startGameBtn');

    if (!panel) return;

    if (config.artist === 'all') {
      panel.classList.add('hidden');
      if (diffGroup) diffGroup.classList.remove('disabled-by-campaign');
      if (lenGroup) lenGroup.classList.remove('disabled-by-campaign');
      if (startBtn) {
        startBtn.innerHTML = `<span>START SESSION</span><kbd class="start-kbd">PLAY ▶</kbd>`;
      }
      return;
    }

    panel.classList.remove('hidden');
    const camp = getArtistCampaign(config.artist);
    const unlocked = camp.unlockedStage || 1;
    const isMastered = Boolean(camp.mastered || unlocked >= 4);

    if (config.campaignStage !== 'free' && config.campaignStage > unlocked) {
      config.campaignStage = isMastered ? 'free' : unlocked;
    }

    document.getElementById('acpArtistTitle').textContent = `${config.artist} — Campaign`;
    const badgeEl = document.getElementById('acpMasteryBadge');
    const descEl = document.getElementById('acpStatusDesc');

    if (isMastered) {
      badgeEl.textContent = `👑 MASTER (${(camp.totalMasteryScore || 0).toLocaleString()} PTS)`;
      badgeEl.classList.add('mastered');
      descEl.textContent = 'Free Play unlocked! Play freely or replay any Campaign Stage to boost your World Mastery rank.';
    } else {
      badgeEl.textContent = `STAGE ${Math.min(3, unlocked)} / 3`;
      badgeEl.classList.remove('mastered');
      descEl.textContent = 'Pass all 3 stages (5 tracks each) to earn the Artist Crown 👑 and unlock Free Play.';
    }

    const grid = document.getElementById('acpStagesGrid');
    grid.innerHTML = '';

    [1, 2, 3].forEach((stNum) => {
      const st = CAMPAIGN_STAGES[stNum];
      const isStUnlocked = stNum <= unlocked || isMastered;
      const isStCleared = stNum < unlocked || isMastered;
      const bestScore = camp.stageScores?.[stNum] || 0;
      const isSelected = config.campaignStage === stNum;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `acp-stage-card ${isSelected ? 'active' : ''} ${isStCleared ? 'cleared' : ''} ${!isStUnlocked ? 'locked' : ''}`;
      card.innerHTML = `
        <div class="acp-stage-top">
          <span>STAGE ${stNum} • ${st.diff.toUpperCase()}</span>
          <span>${isStCleared ? '✓' : (isStUnlocked ? '🔓' : '🔒')}</span>
        </div>
        <div class="acp-stage-name">${st.name.replace(/^Stage \d:\s*/, '')}</div>
        <div class="acp-stage-req">${bestScore > 0 ? `Best: ${bestScore.toLocaleString()} pts` : `Req: ${st.minCorrect}/5 & ${st.minScore.toLocaleString()}+`}</div>
      `;
      card.addEventListener('click', () => {
        if (!isStUnlocked) return;
        config.campaignStage = stNum;
        renderArtistCampaignPanel();
        updateLobbyState();
      });
      grid.appendChild(card);
    });

    // 4th card: Free Play
    const freeCard = document.createElement('button');
    freeCard.type = 'button';
    const isFreeSelected = config.campaignStage === 'free';
    freeCard.className = `acp-stage-card ${isFreeSelected ? 'active' : ''} ${isMastered ? 'cleared' : 'locked'}`;
    freeCard.innerHTML = `
      <div class="acp-stage-top">
        <span>CUSTOM</span>
        <span>${isMastered ? '👑' : '🔒'}</span>
      </div>
      <div class="acp-stage-name">Free Play</div>
      <div class="acp-stage-req">${isMastered ? 'All lengths & modes' : 'Clear Stage 3 first'}</div>
    `;
    freeCard.addEventListener('click', () => {
      if (!isMastered) return;
      config.campaignStage = 'free';
      renderArtistCampaignPanel();
      updateLobbyState();
    });
    grid.appendChild(freeCard);

    if (config.campaignStage === 'free') {
      if (diffGroup) diffGroup.classList.remove('disabled-by-campaign');
      if (lenGroup) lenGroup.classList.remove('disabled-by-campaign');
      if (startBtn) {
        startBtn.innerHTML = `<span>START FREE PLAY — ${config.artist.toUpperCase()}</span><kbd class="start-kbd">PLAY ▶</kbd>`;
      }
    } else {
      if (diffGroup) diffGroup.classList.add('disabled-by-campaign');
      if (lenGroup) lenGroup.classList.add('disabled-by-campaign');
      const st = CAMPAIGN_STAGES[config.campaignStage] || CAMPAIGN_STAGES[1];
      if (startBtn) {
        startBtn.innerHTML = `<span>START ${st.name.toUpperCase()} (5 TRACKS)</span><kbd class="start-kbd">STAGE ${st.stage} ▶</kbd>`;
      }
    }

    // Render Artist 3-Card Vault Challenge if Mastered
    const vaultBox = document.getElementById('acpVaultBox');
    const vaultGrid = document.getElementById('acpVaultCardsGrid');
    const vaultProg = document.getElementById('acpVaultProgress');
    if (vaultBox && vaultGrid) {
      if (!isMastered) {
        vaultBox.classList.add('hidden');
      } else {
        vaultBox.classList.remove('hidden');
        const targets = getArtistVaultTargetSongs(config.artist);
        let unlockedCount = 0;
        vaultGrid.innerHTML = '';
        targets.forEach((t) => {
          const cardRec = stats.unlockedCards?.[t.song.id];
          if (cardRec) unlockedCount++;
          const cardEl = document.createElement('div');
          cardEl.className = `collectible-card ${t.rarity} ${cardRec ? 'unlocked' : 'locked'}`;
          if (t.song.artwork) cardEl.style.backgroundImage = `url("${t.song.artwork}")`;
          cardEl.innerHTML = `
            <div class="cc-top-row">
              <span class="cc-rarity-tag">${t.label}</span>
              <span class="cc-status-icon">${cardRec ? `✓ ${formatMs(cardRec.timeMs)}` : '🔒 < 1.0s'}</span>
            </div>
            <div class="cc-glass-bottom">
              <div class="cc-title">${t.song.title}</div>
              <div class="cc-sub">${cardRec ? 'Unlocked in Vault!' : 'Identify in under 1.000s'}</div>
            </div>
          `;
          vaultGrid.appendChild(cardEl);
        });
        if (vaultProg) vaultProg.textContent = `${unlockedCount} / ${targets.length} Cards`;
      }
    }

    loadArtistWorldTopMasters(config.artist);
  }

  function getFilteredPool() {
    const isCampaignRun = config.artist !== 'all' && config.campaignStage !== 'free';
    const effectiveDiff = isCampaignRun
      ? (CAMPAIGN_STAGES[config.campaignStage]?.diff || 'easy')
      : config.difficulty;

    let pool = CATALOG.filter((song) => {
      if (config.lang !== 'all' && song.lang !== config.lang) return false;
      if (effectiveDiff !== 'all' && song.difficulty !== effectiveDiff) return false;
      if (config.genre !== 'all' && song.genre !== config.genre) return false;
      if (config.artist !== 'all' && song.artist !== config.artist) return false;
      return true;
    });

    // Fallback if an imported artist has fewer than 5 tracks in a specific difficulty tier
    if (isCampaignRun && pool.length < 5) {
      pool = CATALOG.filter((song) => song.artist === config.artist);
    }
    return pool;
  }

  function updateLobbyState() {
    const pool = getFilteredPool();
    document.getElementById('availablePoolCount').textContent = `${pool.length} tracks`;

    const isCampaignRun = config.artist !== 'all' && config.campaignStage !== 'free';
    const effectiveDiff = isCampaignRun
      ? (CAMPAIGN_STAGES[config.campaignStage]?.diff || 'easy')
      : config.difficulty;

    const comboKey = getComboKey(effectiveDiff, config.genre, config.artist);
    const pb = stats.byCombo[comboKey];
    const titleEl = document.getElementById('pbCategoryTitle');
    const detailsEl = document.getElementById('pbCategoryDetails');

    titleEl.textContent = getCategoryLabel(effectiveDiff, config.genre, config.artist);
    if (pb) {
      detailsEl.innerHTML = `Best Score: <strong class="mono">${pb.bestScore.toLocaleString()}</strong> • Accuracy: <strong class="mono">${pb.bestAccuracy}</strong> • Avg: <strong class="mono">${formatMs(pb.bestAvgTimeMs)}</strong>`;
    } else {
      detailsEl.textContent = 'No personal record set for this filter yet';
    }
  }

  // ==================== DAILY SEEDED CHALLENGE & AUDIO PREFETCHER ====================
  function getTodaySeedString() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function createSeededRng(seedStr) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let state = h >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDailyChallengeQueue() {
    const seedStr = getTodaySeedString();
    const rng = createSeededRng(`beatrushz_daily_${seedStr}`);
    const basePool = [...(window.SONGS_CATALOG || CATALOG)];
    const chosen = [];
    const usedIds = new Set();
    const cutOffsets = [0, 2, 4, 6, 8, 10];

    while (chosen.length < 5 && chosen.length < basePool.length) {
      const idx = Math.floor(rng() * basePool.length);
      const song = basePool[idx];
      if (!song || usedIds.has(song.id)) continue;
      usedIds.add(song.id);
      const cutIdx = Math.floor(rng() * cutOffsets.length);
      chosen.push(Object.assign({}, song, {
        startOffsetSec: cutOffsets[cutIdx]
      }));
    }
    return chosen;
  }

  function updateDailyBannerUI() {
    const seedStr = getTodaySeedString();
    const dateLabel = document.getElementById('dailyChallengeDateLabel');
    const statusPill = document.getElementById('dailyChallengeStatusPill');
    const btn = document.getElementById('startDailyChallengeBtn');
    if (dateLabel) dateLabel.textContent = `#${seedStr}`;

    const todayRec = stats.dailyHistory?.[seedStr];
    if (statusPill) {
      if (todayRec) {
        statusPill.textContent = `✓ Done: ${todayRec.score.toLocaleString()} pts (${todayRec.accuracy})`;
        statusPill.style.color = 'var(--accent)';
        statusPill.style.borderColor = 'var(--accent)';
      } else {
        statusPill.textContent = '5 Tracks • Unplayed Today';
        statusPill.style.color = '';
        statusPill.style.borderColor = '';
      }
    }
    if (btn) {
      btn.textContent = todayRec ? '↻ REPLAY DAILY' : '⚡ PLAY DAILY';
    }
  }

  const prefetchedAudioCache = new Map();

  function prefetchRoundAudioQueue(queue) {
    queue.forEach((song) => {
      if (!song || !song.previewUrl || prefetchedAudioCache.has(song.previewUrl)) return;
      try {
        const a = new Audio();
        a.preload = 'auto';
        a.crossOrigin = 'anonymous';
        a.src = song.previewUrl;
        a.load();
        prefetchedAudioCache.set(song.previewUrl, a);
      } catch (e) {}
    });
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

  function startDailyChallenge() {
    const dailyQueue = buildDailyChallengeQueue();
    if (dailyQueue.length === 0) return;

    prefetchRoundAudioQueue(dailyQueue);

    game.active = true;
    game.isDailyChallenge = true;
    game.dailySeed = getTodaySeedString();
    game.isCampaign = false;
    game.campaignStage = null;
    game.queue = dailyQueue;
    game.currentIndex = 0;
    game.score = 0;
    game.streak = 0;
    game.results = [];

    document.getElementById('activeDiffTag').textContent = `DAILY #${game.dailySeed}`;
    document.getElementById('activeFilterTag').textContent = 'Global 5-Track Seed';

    try {
      game.audio.muted = false;
      game.audio.volume = 1.0;
      game.audio.setAttribute('playsinline', '');
    } catch (e) {}

    switchView('game');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadCurrentSong();
  }

  function startNewGame() {
    const pool = getFilteredPool();
    if (pool.length === 0) {
      alert('No songs match this filter combination. Try selecting All Genres or All Difficulty.');
      return;
    }

    const isCampaignRun = config.artist !== 'all' && config.campaignStage !== 'free';
    const stageObj = isCampaignRun ? CAMPAIGN_STAGES[config.campaignStage] : null;
    const desiredCount = isCampaignRun ? 5 : config.roundLength;
    const count = Math.min(desiredCount, pool.length);
    const selectedQueue = shuffleArray(pool).slice(0, count).map((s) => Object.assign({}, s, { startOffsetSec: 0 }));

    prefetchRoundAudioQueue(selectedQueue);

    game.active = true;
    game.isDailyChallenge = false;
    game.dailySeed = null;
    game.isCampaign = isCampaignRun;
    game.campaignStage = isCampaignRun ? stageObj.stage : null;
    game.queue = selectedQueue;
    game.currentIndex = 0;
    game.score = 0;
    game.streak = 0;
    game.results = [];

    document.getElementById('activeDiffTag').textContent = isCampaignRun
      ? `STAGE ${stageObj.stage} (${DIFF_LABELS[stageObj.diff]})`
      : DIFF_LABELS[config.difficulty];
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

  let playbackVerifyRaf = null;

  function loadCurrentSong() {
    stopAudioAndTimer();
    game.answeredCurrent = false;

    const currentSong = game.queue[game.currentIndex];
    // Prefetch next upcoming tracks in queue
    prefetchRoundAudioQueue(game.queue.slice(game.currentIndex + 1, game.currentIndex + 4));

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

    const startOffset = Number(currentSong.startOffsetSec) || 0;
    game.audio.src = currentSong.previewUrl;
    try {
      game.audio.currentTime = startOffset;
    } catch (e) {
      game.audio.addEventListener('loadedmetadata', function onMeta() {
        game.audio.removeEventListener('loadedmetadata', onMeta);
        try { game.audio.currentTime = startOffset; } catch (err) {}
      });
    }

    let timerLockedIn = false;
    const activateStopwatchOnRealAudio = () => {
      if (timerLockedIn || !game.active || game.answeredCurrent) return;
      // Strict check: ensure audio element is actively playing AND currentTime is advancing past startOffset
      if (!game.audio.paused && game.audio.readyState >= 3 && game.audio.currentTime >= startOffset) {
        timerLockedIn = true;
        cancelAnimationFrame(playbackVerifyRaf);
        game.audioStartedAt = performance.now();
        document.getElementById('stopwatchStatusText').textContent = startOffset > 0 ? `LIVE AUDIO (+${startOffset}s CUT)` : 'LIVE AUDIO';
        document.getElementById('vinylVisualizer').classList.add('spinning');
        document.getElementById('waveBars').classList.add('playing');
        startStopwatchLoop();
        return;
      }
      playbackVerifyRaf = requestAnimationFrame(activateStopwatchOnRealAudio);
    };

    const onPlaying = () => {
      game.audio.removeEventListener('playing', onPlaying);
      if (!game.active || game.answeredCurrent) return;
      cancelAnimationFrame(playbackVerifyRaf);
      playbackVerifyRaf = requestAnimationFrame(activateStopwatchOnRealAudio);
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
    cancelAnimationFrame(playbackVerifyRaf);
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

    const chronoEl = document.querySelector('#view-game .chrono-stage');
    if (chronoEl) {
      chronoEl.classList.remove('pulse-correct', 'shake-wrong');
      void chronoEl.offsetWidth;
      chronoEl.classList.add(isCorrect ? 'pulse-correct' : 'shake-wrong');
    }

    if (config.inputMode === 'choices') {
      document.querySelectorAll('#answerChoicesContainer .choice-btn').forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.songId === currentSong.id) {
          btn.classList.add('correct-choice');
          if (isCorrect) btn.classList.add('pulse-correct');
        } else if (btn === clickedBtn && !isCorrect) {
          btn.classList.add('wrong-choice', 'shake-wrong');
        }
      });
    } else {
      const gInput = document.getElementById('songGuessInput');
      gInput.disabled = true;
      gInput.classList.remove('pulse-correct', 'shake-wrong');
      void gInput.offsetWidth;
      gInput.classList.add(isCorrect ? 'pulse-correct' : 'shake-wrong');
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
      checkAndUnlockCollectibleCard(currentSong, elapsedMs);
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

    // Campaign Progression & Mastery Check
    const campBanner = document.getElementById('campaignSummaryBanner');
    const playAgainBtn = document.getElementById('playAgainSameBtn');
    let campaignStatusObj = null;

    if (game.isDailyChallenge && game.dailySeed) {
      if (!stats.dailyHistory) stats.dailyHistory = {};
      const prevDaily = stats.dailyHistory[game.dailySeed];
      if (!prevDaily || game.score > prevDaily.score) {
        stats.dailyHistory[game.dailySeed] = {
          score: game.score,
          accuracy: accuracyStr,
          avgTimeMs,
          results: game.results.map((r) => ({ correct: r.correct, timeMs: r.timeMs }))
        };
      }
      if (campBanner) {
        campBanner.classList.remove('hidden', 'failed');
        campBanner.classList.add('passed');
        campBanner.textContent = `🌍 DAILY CHALLENGE #${game.dailySeed} COMPLETED! Share your spoiler-free reaction grid below.`;
      }
      if (playAgainBtn) playAgainBtn.textContent = 'Replay Daily Challenge ↺';
      updateDailyBannerUI();
    } else if (game.isCampaign && config.artist !== 'all' && game.campaignStage) {
      const stDef = CAMPAIGN_STAGES[game.campaignStage] || CAMPAIGN_STAGES[1];
      const camp = getArtistCampaign(config.artist);
      const passed = correctList.length >= stDef.minCorrect && game.score >= stDef.minScore;

      if (game.score > (camp.stageScores[stDef.stage] || 0)) {
        camp.stageScores[stDef.stage] = game.score;
      }
      camp.totalMasteryScore = (camp.stageScores[1] || 0) + (camp.stageScores[2] || 0) + (camp.stageScores[3] || 0);

      if (passed) {
        const nextUnlock = Math.min(4, stDef.stage + 1);
        if (nextUnlock > (camp.unlockedStage || 1)) {
          camp.unlockedStage = nextUnlock;
        }
        const justMastered = stDef.stage === 3 || camp.unlockedStage >= 4;
        if (justMastered) {
          camp.mastered = true;
          camp.unlockedStage = 4;
        }

        pushRecordToSupabase({
          record_type: 'artist_stage',
          song_id: null,
          song_title: `${config.artist} - Stage ${stDef.stage}`,
          artist: config.artist,
          genre: ARTIST_META[config.artist]?.genre || 'Pop',
          difficulty: String(stDef.stage),
          time_ms: avgTimeMs,
          score: camp.stageScores[stDef.stage],
          accuracy: accuracyStr
        });

        if (camp.mastered) {
          pushRecordToSupabase({
            record_type: 'artist_mastery',
            song_id: null,
            song_title: `${config.artist} Master Crown`,
            artist: config.artist,
            genre: ARTIST_META[config.artist]?.genre || 'Pop',
            difficulty: 'master',
            time_ms: avgTimeMs,
            score: camp.totalMasteryScore,
            accuracy: accuracyStr
          });
        }

        if (campBanner) {
          campBanner.classList.remove('hidden', 'failed');
          campBanner.classList.add('passed');
          if (stDef.stage < 3) {
            campBanner.textContent = `🔓 STAGE ${stDef.stage} CLEARED! Stage ${stDef.stage + 1} (${CAMPAIGN_STAGES[stDef.stage + 1].name}) is now unlocked!`;
            config.campaignStage = stDef.stage + 1;
            if (playAgainBtn) playAgainBtn.textContent = `Start Stage ${stDef.stage + 1} ▶`;
          } else {
            campBanner.textContent = `👑 ARTIST MASTERY UNLOCKED! Total Mastery Score: ${camp.totalMasteryScore.toLocaleString()} pts • Free Play is now open!`;
            config.campaignStage = 'free';
            if (playAgainBtn) playAgainBtn.textContent = `Play Free Mode (${config.artist}) ▶`;
          }
        }
        campaignStatusObj = { passed: true, stage: stDef.stage, mastered: camp.mastered, totalMasteryScore: camp.totalMasteryScore };
      } else {
        if (campBanner) {
          campBanner.classList.remove('hidden', 'passed');
          campBanner.classList.add('failed');
          campBanner.textContent = `🔒 Stage ${stDef.stage} Target: ${stDef.minCorrect}/5 correct & ${stDef.minScore.toLocaleString()}+ pts (You got ${accuracyStr} & ${game.score.toLocaleString()} pts). Try again!`;
        }
        if (playAgainBtn) playAgainBtn.textContent = `Retry Stage ${stDef.stage} ↺`;
        campaignStatusObj = { passed: false, stage: stDef.stage, mastered: camp.mastered, totalMasteryScore: camp.totalMasteryScore };
      }
      renderArtistCards();
    } else {
      if (campBanner) campBanner.classList.add('hidden');
      if (playAgainBtn) playAgainBtn.textContent = 'Play Again';
    }

    saveStats();
    updateHeaderQuickStats();

    if (game.score > 0) {
      pushRecordToSupabase({
        record_type: game.isDailyChallenge ? 'daily_challenge' : 'round_score',
        song_id: game.isDailyChallenge ? game.dailySeed : null,
        song_title: game.isDailyChallenge ? `Daily #${game.dailySeed}` : catLabel,
        artist: game.isDailyChallenge ? 'all' : config.artist,
        genre: game.isDailyChallenge ? 'all' : config.genre,
        difficulty: game.isDailyChallenge ? 'daily' : config.difficulty,
        time_ms: avgTimeMs,
        score: game.score,
        accuracy: accuracyStr
      });
    }

    document.getElementById('summaryHeadline').textContent = game.isDailyChallenge
      ? `🌍 Daily Challenge #${game.dailySeed}`
      : (game.isCampaign
        ? `${config.artist} — Stage ${game.campaignStage} Summary`
        : 'Session Summary');
    document.getElementById('summarySubline').textContent = game.isDailyChallenge
      ? 'Global Seeded 5-Track Sprint • Same Tracks & Cuts Worldwide'
      : catLabel;
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

    initSocialSharePanel({
      score: game.score,
      correctCount: correctList.length,
      totalCount: totalSongs,
      accuracyStr,
      avgTimeMs,
      fastestInRound,
      artist: config.artist,
      genre: config.genre,
      isDailyChallenge: game.isDailyChallenge,
      dailySeed: game.dailySeed,
      isCampaign: game.isCampaign,
      campaignStage: game.campaignStage,
      campaignStatus: campaignStatusObj,
      results: game.results
    });

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

  // ==================== VIRAL SOCIAL SHARING & STORY CARD ENGINE ====================
  let lastShareData = null;

  function buildTeaserPool(d) {
    if (d.isDailyChallenge) {
      const fastStr = d.fastestInRound ? formatMs(d.fastestInRound.timeMs) : formatMs(d.avgTimeMs);
      return [
        `No spoilers — can you beat my reaction times on today's 5 tracks? ⚡`,
        `Got ${d.accuracyStr} (${d.score.toLocaleString()} pts) on Today's Daily Challenge! Fastest hit: ${fastStr}`,
        `Same 5 tracks, same audio cuts worldwide 🌍 Beat my ${d.score.toLocaleString()} pts if you can!`,
        `Avg reaction time: ${formatMs(d.avgTimeMs)} on Daily #${d.dailySeed}. Test your ears!`
      ];
    }
    const targetName = d.artist !== 'all' ? d.artist : (d.genre !== 'all' ? d.genre : 'Beatrushz');
    const fastestStr = d.fastestInRound ? formatMs(d.fastestInRound.timeMs) : formatMs(d.avgTimeMs);
    const fastestSongTitle = d.fastestInRound ? d.fastestInRound.song.title : 'that track';
    const lines = [
      `Got ${d.accuracyStr} (${d.score.toLocaleString()} pts) on ${targetName}. Can you beat that?`,
      `My reaction speed is ${fastestStr} ⚡ Think your ears are faster?`,
      `Scored ${d.score.toLocaleString()} pts on ${targetName}. Try to touch this score.`,
      `Identified "${fastestSongTitle}" in ${fastestStr}. Beat that if you can.`,
      `${d.accuracyStr} in ${formatMs(d.avgTimeMs)} average reaction time. Your turn.`
    ];

    if (d.correctCount === d.totalCount && d.totalCount > 0) {
      lines.unshift(`Perfect ${d.accuracyStr} on ${targetName} (${d.score.toLocaleString()} pts) 🔥 Think you can match perfection?`);
    }
    if (d.campaignStatus?.passed && d.campaignStage === 3) {
      lines.unshift(`Just unlocked MASTER 👑 on ${d.artist} (${d.campaignStatus.totalMasteryScore.toLocaleString()} pts)! Try to take my crown.`);
    } else if (d.campaignStatus?.passed) {
      lines.unshift(`Cleared Stage ${d.campaignStage}/3 on ${d.artist} with ${d.score.toLocaleString()} pts ⚡ Who's #1?`);
    }
    return lines;
  }

  function getChallengeUrl(d) {
    const baseUrl = window.location.origin && window.location.origin.startsWith('http')
      ? window.location.origin
      : 'https://beatrushz.netlify.app';
    if (d && !d.isDailyChallenge && d.artist && d.artist !== 'all') {
      return `${baseUrl}/?artist=${encodeURIComponent(d.artist)}`;
    }
    return baseUrl;
  }

  function formatShareText(d) {
    const siteUrl = getChallengeUrl(d);

    if (d.isDailyChallenge) {
      const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const gridLines = (d.results || []).map((r, idx) => {
        const num = numEmojis[idx] || `#${idx + 1}`;
        if (!r.correct) return `${num} 🔴 MISSED`;
        const badge = r.timeMs < 500 ? '🟣' : (r.timeMs < 1000 ? '⚡' : '🟢');
        return `${num} ${badge} ${formatMs(r.timeMs)}`;
      });

      return [
        `🌍 BEATRUSHZ DAILY #${d.dailySeed || getTodaySeedString()}`,
        `🏆 ${d.score.toLocaleString()} pts (${d.accuracyStr}) • Avg: ${formatMs(d.avgTimeMs)}`,
        ...gridLines,
        `"${d.currentTeaser}"`,
        `👉 ${siteUrl}`
      ].join('\n');
    }

    const emojiRow = (d.results || []).map((r) => (r.correct ? '🟢' : '🔴')).join('');
    const targetLabel = d.artist !== 'all'
      ? (d.isCampaign ? `${d.artist} (Stage ${d.campaignStage}/3)` : d.artist)
      : (d.genre !== 'all' ? `${d.genre} Mix` : 'All Artists');
    const fastStr = d.fastestInRound ? formatMs(d.fastestInRound.timeMs) : '--.---s';

    return [
      `⚡ BEATRUSHZ — ${targetLabel}`,
      `${emojiRow} (${d.accuracyStr})`,
      `🏆 ${d.score.toLocaleString()} pts • ⚡ Fastest: ${fastStr}`,
      `"${d.currentTeaser}"`,
      `👉 ${siteUrl}`
    ].join('\n');
  }

  function initSocialSharePanel(data) {
    lastShareData = data;
    const pool = buildTeaserPool(data);
    lastShareData.teaserPool = pool;
    lastShareData.teaserIndex = 0;
    lastShareData.currentTeaser = pool[0];

    const previewEl = document.getElementById('shareTeaserPreview');
    const statusEl = document.getElementById('shareStatusMsg');
    if (previewEl) previewEl.textContent = formatShareText(lastShareData);
    if (statusEl) statusEl.textContent = '';
  }

  function shuffleShareTeaser() {
    if (!lastShareData || !lastShareData.teaserPool) return;
    lastShareData.teaserIndex = (lastShareData.teaserIndex + 1) % lastShareData.teaserPool.length;
    lastShareData.currentTeaser = lastShareData.teaserPool[lastShareData.teaserIndex];
    const previewEl = document.getElementById('shareTeaserPreview');
    if (previewEl) previewEl.textContent = formatShareText(lastShareData);
  }

  async function generateAndShareStoryCard() {
    if (!lastShareData) return;
    const d = lastShareData;
    const statusEl = document.getElementById('shareStatusMsg');
    if (statusEl) statusEl.textContent = 'Generating Story Card...';

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGrad.addColorStop(0, '#06080b');
    bgGrad.addColorStop(0.5, '#0c1117');
    bgGrad.addColorStop(1, '#050709');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Monster Neon Radial Glow
    const glow = ctx.createRadialGradient(540, 620, 40, 540, 620, 620);
    glow.addColorStop(0, 'rgba(57, 255, 20, 0.18)');
    glow.addColorStop(1, 'rgba(57, 255, 20, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1080, 1920);

    // Outer Neon Border Card
    ctx.strokeStyle = 'rgba(57, 255, 20, 0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(64, 84, 952, 1752);

    // Brand Header
    ctx.fillStyle = '#39ff14';
    ctx.font = '900 66px Syne, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ BEATRUSHZ', 540, 210);

    ctx.fillStyle = '#8b95a5';
    ctx.font = '700 26px Space Mono, monospace';
    ctx.fillText('MILLISECOND SONG QUIZ', 540, 260);

    // Player Tag Pill
    const playerTag = userProfile.username ? `@${userProfile.username}` : '@player';
    ctx.fillStyle = 'rgba(57, 255, 20, 0.12)';
    ctx.fillRect(340, 310, 400, 64);
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    ctx.strokeRect(340, 310, 400, 64);
    ctx.fillStyle = '#39ff14';
    ctx.font = '700 32px Space Mono, monospace';
    ctx.fillText(playerTag, 540, 353);

    // Target Artist / Mode Title
    const targetHeadline = d.artist !== 'all' ? d.artist.toUpperCase() : (d.genre !== 'all' ? `${d.genre.toUpperCase()} MIX` : 'ALL ARTISTS');
    ctx.fillStyle = '#f3f6fa';
    ctx.font = '800 58px Plus Jakarta Sans, sans-serif';
    ctx.fillText(targetHeadline, 540, 475);

    const subMode = d.isCampaign
      ? (d.campaignStatus?.passed && d.campaignStage === 3 ? '👑 ARTIST MASTER CROWN UNLOCKED' : `CAMPAIGN STAGE ${d.campaignStage} / 3`)
      : 'FREE PLAY SESSION';
    ctx.fillStyle = '#39ff14';
    ctx.font = '700 30px Space Mono, monospace';
    ctx.fillText(subMode, 540, 530);

    // Main Score Box
    ctx.fillStyle = '#0d1218';
    ctx.fillRect(130, 590, 820, 270);
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 3;
    ctx.strokeRect(130, 590, 820, 270);

    ctx.fillStyle = '#8b95a5';
    ctx.font = '700 28px Space Mono, monospace';
    ctx.fillText('TOTAL SCORE', 540, 655);

    ctx.fillStyle = '#39ff14';
    ctx.font = '800 112px Space Mono, monospace';
    ctx.fillText(d.score.toLocaleString(), 540, 795);

    // 3 Telemetry Boxes (Accuracy, Avg Time, Fastest)
    const statsBoxes = [
      { label: 'ACCURACY', val: d.accuracyStr },
      { label: 'AVG TIME', val: formatMs(d.avgTimeMs) },
      { label: 'FASTEST', val: d.fastestInRound ? formatMs(d.fastestInRound.timeMs) : '--.---s' }
    ];
    statsBoxes.forEach((b, idx) => {
      const bx = 130 + idx * 280;
      ctx.fillStyle = '#0d1218';
      ctx.fillRect(bx, 895, 260, 175);
      ctx.strokeStyle = '#252d3a';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, 895, 260, 175);

      ctx.fillStyle = '#8b95a5';
      ctx.font = '700 22px Space Mono, monospace';
      ctx.fillText(b.label, bx + 130, 950);

      ctx.fillStyle = '#f3f6fa';
      ctx.font = '700 42px Space Mono, monospace';
      ctx.fillText(b.val, bx + 130, 1025);
    });

    // Fastest Track Highlight
    if (d.fastestInRound) {
      ctx.fillStyle = '#8b95a5';
      ctx.font = '600 26px Plus Jakarta Sans, sans-serif';
      ctx.fillText(`⚡ Fastest ID: "${d.fastestInRound.song.title}" (${formatMs(d.fastestInRound.timeMs)})`, 540, 1145);
    }

    // Track Result Squares
    const resArr = d.results || [];
    const boxSize = 52;
    const gap = 14;
    const totalW = resArr.length * boxSize + Math.max(0, resArr.length - 1) * gap;
    let startX = (1080 - totalW) / 2;
    resArr.forEach((r) => {
      ctx.fillStyle = r.correct ? '#39ff14' : '#ff3b5c';
      ctx.fillRect(startX, 1195, boxSize, boxSize);
      startX += boxSize + gap;
    });

    // Teaser Quote (Wrapped)
    ctx.fillStyle = '#f3f6fa';
    ctx.font = '700 38px Plus Jakarta Sans, sans-serif';
    const words = `"${d.currentTeaser}"`.split(' ');
    let line = '';
    let y = 1365;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      if (ctx.measureText(testLine).width > 800 && i > 0) {
        ctx.fillText(line.trim(), 540, y);
        line = words[i] + ' ';
        y += 54;
      } else {
        line = testLine;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), 540, y);

    // Bottom Call To Action
    ctx.fillStyle = '#39ff14';
    ctx.fillRect(180, 1640, 720, 96);
    ctx.fillStyle = '#050805';
    ctx.font = '800 32px Space Mono, monospace';
    const hostLabel = (window.location.host && !window.location.host.includes('localhost'))
      ? window.location.host.toUpperCase()
      : 'BEATRUSHZ.NETLIFY.APP';
    ctx.fillText(`PLAY AT ${hostLabel}`, 540, 1700);

    const challengeUrl = getChallengeUrl(d);
    try {
      await navigator.clipboard.writeText(challengeUrl);
    } catch (e) {}

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'beatrushz-score.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Beatrushz Challenge',
            text: formatShareText(d),
            url: challengeUrl
          });
          if (statusEl) statusEl.textContent = '🔗 Link auto-copied! Paste it into Instagram "Link" Sticker.';
          return;
        } catch (err) {}
      }
      // Fallback: download PNG image directly
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'beatrushz-story-card.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (statusEl) statusEl.textContent = '📸 Card downloaded + 🔗 Game link auto-copied! Paste it into IG Link Sticker.';
    }, 'image/png');
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
      const camp = getArtistCampaign(artistName);
      const fastest = aStat?.fastestSong;

      const row = document.createElement('div');
      row.className = 'fastest-artist-row';
      row.style.cursor = 'pointer';
      row.title = 'Click to open artist campaign';
      if (meta.avatar) row.style.backgroundImage = `url("${meta.avatar}")`;
      row.innerHTML = `
        <div class="far-glass-inner">
          <div class="far-left">
            <img src="${meta.avatar}" alt="${artistName}" class="far-img" />
            <div class="far-meta">
              <div class="far-artist">${artistName} ${camp.mastered ? '👑' : ''}</div>
              <div class="far-song">${fastest ? fastest.title : `Stage ${Math.min(3, camp.unlockedStage || 1)}/3`}</div>
            </div>
          </div>
          <div class="far-time mono ${fastest ? '' : 'empty'}">
            ${fastest ? formatMs(fastest.timeMs) : '--.---s'}
          </div>
        </div>
      `;
      row.addEventListener('click', () => {
        selectArtistForLobby(artistName);
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

  function renderCollectionDashboard() {
    const totalEl = document.getElementById('vaultTotalCards');
    const rareEl = document.getElementById('vaultRareCount');
    const epicEl = document.getElementById('vaultEpicCount');
    const legEl = document.getElementById('vaultLegendaryCount');
    const masteredListEl = document.getElementById('vaultMasteredArtistsList');
    const allCardsGridEl = document.getElementById('vaultAllCardsGrid');
    if (!totalEl || !masteredListEl || !allCardsGridEl) return;

    const allCards = Object.values(stats.unlockedCards || {});
    const rareCount = allCards.filter((c) => c.rarity === 'Rare').length;
    const epicCount = allCards.filter((c) => c.rarity === 'Epic').length;
    const legCount = allCards.filter((c) => c.rarity === 'Legendary').length;

    totalEl.textContent = String(allCards.length);
    if (rareEl) rareEl.textContent = String(rareCount);
    if (epicEl) epicEl.textContent = String(epicCount);
    if (legEl) legEl.textContent = String(legCount);

    // 1. Mastered Artists & 3-Card Sets (<1.000s target)
    const masteredArtists = ARTISTS.filter((name) => {
      const camp = stats.artistCampaigns?.[name];
      return camp && (camp.mastered || camp.unlockedStage >= 4);
    });

    if (masteredArtists.length === 0) {
      masteredListEl.innerHTML = `
        <div class="vault-artist-block" style="text-align:center;padding:1.4rem 1rem">
          <div style="font-size:1.8rem;margin-bottom:0.35rem">👑</div>
          <div style="font-weight:800;font-size:0.96rem;margin-bottom:0.25rem">No Mastered Artists Yet</div>
          <div style="font-size:0.8rem;color:var(--text-secondary)">Complete all 3 Campaign Stages (Easy, Medium, Hard) for any artist to unlock their 3-Card Sub-1.0s Vault Challenge!</div>
        </div>
      `;
    } else {
      masteredListEl.innerHTML = '';
      masteredArtists.forEach((artistName) => {
        const meta = ARTIST_META[artistName];
        const targets = getArtistVaultTargetSongs(artistName);
        const unlockedInSet = targets.filter((t) => stats.unlockedCards?.[t.song.id]).length;

        const block = document.createElement('div');
        block.className = 'vault-artist-block';
        block.innerHTML = `
          <div class="vault-artist-top">
            <div class="vault-artist-info">
              <img src="${meta?.avatar || ''}" alt="${artistName}" />
              <div>
                <div class="vault-artist-name">${artistName} 👑</div>
                <div class="vault-artist-sub">${unlockedInSet}/3 Vault Cards Unlocked • Sub-1.000s Challenge</div>
              </div>
            </div>
            <button type="button" class="vault-hunt-btn" data-artist="${artistName}">⚡ Hunt Cards</button>
          </div>
          <div class="acp-vault-cards-row">
            ${targets.map((t) => {
              const unlocked = stats.unlockedCards?.[t.song.id];
              const rClass = t.rarity.toLowerCase();
              const coverStyle = t.song.artwork ? `background-image:url("${t.song.artwork}")` : '';
              return `
                <div class="collectible-card ${rClass} ${unlocked ? 'unlocked' : 'locked'}" style="${coverStyle}">
                  <span class="cc-rarity-pill ${rClass}">${t.rarity}</span>
                  <div class="cc-glass-footer">
                    <div class="cc-song-title">${t.song.title}</div>
                    <div class="cc-artist-name">${t.diffLabel} Target</div>
                    <div class="cc-time-badge mono">${unlocked ? `✓ ${formatMs(unlocked.timeMs)}` : '🔒 Target: < 01.000s'}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        const huntBtn = block.querySelector('.vault-hunt-btn');
        if (huntBtn) {
          huntBtn.addEventListener('click', () => {
            selectArtistForLobby(artistName);
            config.campaignStage = 'free';
            config.difficulty = 'all';
            renderArtistCards();
            updateLobbyState();
            startNewGame();
          });
        }
        masteredListEl.appendChild(block);
      });
    }

    // 2. All Unlocked Collectible Cards (sorted by rarity then fastest time)
    if (allCards.length === 0) {
      allCardsGridEl.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:1.5rem 1rem;color:var(--text-secondary);background:var(--bg-surface);border:1px dashed var(--border-subtle);border-radius:var(--radius-md)">
          <div style="font-size:1.6rem;margin-bottom:0.3rem">🃏</div>
          <div style="font-weight:700;font-size:0.9rem">Your Card Vault is Empty</div>
          <div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.2rem">Identify any song in under <strong class="mono" style="color:var(--accent)">00.500s</strong> (or Master an artist and beat their 3 target songs under <strong class="mono" style="color:var(--accent)">01.000s</strong>) to unlock holographic cards!</div>
        </div>
      `;
    } else {
      const rarityRank = { Legendary: 3, Epic: 2, Rare: 1 };
      const sortedCards = [...allCards].sort((a, b) => {
        const rDiff = (rarityRank[b.rarity] || 0) - (rarityRank[a.rarity] || 0);
        if (rDiff !== 0) return rDiff;
        return (a.timeMs || 9999) - (b.timeMs || 9999);
      });

      allCardsGridEl.innerHTML = sortedCards.map((c) => {
        const rClass = (c.rarity || 'Rare').toLowerCase();
        const coverStyle = c.artwork ? `background-image:url("${c.artwork}")` : '';
        return `
          <div class="collectible-card ${rClass} unlocked" style="${coverStyle}">
            <span class="cc-rarity-pill ${rClass}">${c.rarity}</span>
            <div class="cc-glass-footer">
              <div class="cc-song-title">${c.title}</div>
              <div class="cc-artist-name">${c.artist}</div>
              <div class="cc-time-badge mono">⚡ ${formatMs(c.timeMs)}</div>
            </div>
          </div>
        `;
      }).join('');
    }
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
      const [searchRes, lookupRes, albumsRes] = await Promise.all([
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`).then((r) => r.json()).catch(() => ({ results: [] })),
        fetch(`https://itunes.apple.com/lookup?id=${artistObj.artistId}&entity=song&limit=200`).then((r) => r.json()).catch(() => ({ results: [] })),
        fetch(`https://itunes.apple.com/lookup?id=${artistObj.artistId}&entity=album&limit=40`).then((r) => r.json()).catch(() => ({ results: [] }))
      ]);

      let albumTracks = [];
      const expAlbumIds = ((albumsRes.results || []).slice(1))
        .filter((a) => a.wrapperType === 'collection' && a.collectionExplicitness === 'explicit')
        .map((a) => a.collectionId)
        .slice(0, 20);
      if (expAlbumIds.length > 0) {
        const albLookup = await fetch(`https://itunes.apple.com/lookup?id=${expAlbumIds.join(',')}&entity=song&limit=200`).then((r) => r.json()).catch(() => ({ results: [] }));
        albumTracks = (albLookup.results || []).filter((r) => r.wrapperType === 'track');
      }

      const rawResults = [...(searchRes.results || []), ...((lookupRes.results || []).slice(1)), ...albumTracks];
      const normIndexMap = new Map();
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
        if (!normKey) continue;

        const candidateObj = {
          id: `it_${it.trackId}`,
          title: clean,
          fullTitle: it.trackName,
          artist: artistName,
          genre,
          lang,
          explicitness: it.trackExplicitness || 'notExplicit',
          previewUrl: it.previewUrl,
          artwork: it.artworkUrl100 ? it.artworkUrl100.replace('100x100bb', '300x300bb') : '',
          album: it.collectionName || '',
          releaseYear: it.releaseDate ? it.releaseDate.slice(0, 4) : ''
        };

        if (normIndexMap.has(normKey)) {
          const existingIdx = normIndexMap.get(normKey);
          const existingTrack = tracks[existingIdx];
          // Upgrade censored ('cleaned') or non-explicit track to the uncensored 'explicit' version in place
          if (existingTrack.explicitness !== 'explicit' && (candidateObj.explicitness === 'explicit' || (existingTrack.explicitness === 'cleaned' && candidateObj.explicitness === 'notExplicit'))) {
            tracks[existingIdx] = candidateObj;
          }
          continue;
        }

        normIndexMap.set(normKey, tracks.length);
        tracks.push(candidateObj);
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
      selectArtistForLobby(artistName);
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
    const bottomAddBtn = document.getElementById('bottomAddArtistBtn');
    const bottomProfBtn = document.getElementById('bottomProfileBtn');
    const closeBtn = document.getElementById('closeImportModalBtn');
    const searchBtn = document.getElementById('searchItunesArtistBtn');
    const queryInput = document.getElementById('importArtistQueryInput');
    const refreshGlobalBtn = document.getElementById('refreshGlobalBoardBtn');

    if (btn1) btn1.addEventListener('click', openImportArtistModal);
    if (bottomAddBtn) bottomAddBtn.addEventListener('click', openImportArtistModal);
    if (bottomProfBtn) bottomProfBtn.addEventListener('click', openProfileModal);
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

    // Social Share Buttons
    const shuffleBtn = document.getElementById('shuffleShareTeaserBtn');
    const waBtn = document.getElementById('shareWhatsappBtn');
    const xBtn = document.getElementById('shareTwitterBtn');
    const igBtn = document.getElementById('shareStoryCardBtn');
    const copyBtn = document.getElementById('shareCopyTextBtn');
    const statusEl = document.getElementById('shareStatusMsg');

    if (shuffleBtn) shuffleBtn.addEventListener('click', shuffleShareTeaser);

    if (waBtn) {
      waBtn.addEventListener('click', () => {
        if (!lastShareData) return;
        const text = formatShareText(lastShareData);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
    }

    if (xBtn) {
      xBtn.addEventListener('click', () => {
        if (!lastShareData) return;
        const text = formatShareText(lastShareData);
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
    }

    if (igBtn) {
      igBtn.addEventListener('click', generateAndShareStoryCard);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!lastShareData) return;
        const text = formatShareText(lastShareData);
        try {
          await navigator.clipboard.writeText(text);
          if (statusEl) statusEl.textContent = '✓ Challenge copied to clipboard!';
        } catch (e) {
          if (statusEl) statusEl.textContent = 'Copy from the box above.';
        }
      });
    }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
