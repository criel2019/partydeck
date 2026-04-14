// ===== Game Carousel Controller =====
// Asobi-Taisen style horizontal game selector with video preview

(function() {
  'use strict';

  // --- State ---
  var _gcIndex = 0;           // Current focused game index
  var _gcGames = [];          // Ordered game ID list
  var _gcVideoTimer = null;   // Delay timer before playing video
  var _gcSwipeStartX = 0;
  var _gcSwipeStartY = 0;
  var _gcSwiping = false;
  var _gcSwipeThreshold = 40;
  var _gcVideoDelay = 800;    // ms to wait before playing video
  var _gcAnimating = false;
  var _gcDragging = false;
  var _gcDragStartX = 0;
  var _gcDragOffset = 0;
  var _gcBound = false;       // Prevent double-binding event listeners

  // --- Comic Strip Data ---
  var COMIC_DATA = {
    poker:       { prefix:'홀덤',                 count:3 },
    mafia:       { prefix:'마피아',               count:3 },
    sutda:       { prefix:'섯다',                 count:2 },
    quickdraw:   { prefix:'총잡이',               count:3 },
    roulette:    { prefix:'러시안룰렛',            count:1 },
    lottery:     { prefix:'뽑기',                 count:2 },
    ecard:       { prefix:'형사와_강도',           count:3 },
    yahtzee:     { prefix:'야추',                 count:4 },
    updown:      { prefix:'업다운',               count:3 },
    truth:       { prefix:'진실게임',             count:2 },
    fortress:    { prefix:'요새',                 count:3 },
    bombshot:    { prefix:'폭탄주',               count:3 },
    blackjack:   { prefix:'블랙잭',               count:2 },
    jewel:       { prefix:'보석맞추기',           count:1 },
    colorchain:  { prefix:'컬러체인',             count:2 },
    slinkystairs:{ prefix:'슬링키_스테어즈',      count:1 },
    pupil:       { prefix:'거짓말탐지기',          count:3 },
    idol:        { prefix:'아이돌_매니저먼트',     count:3 },
    drinkpoker:  { prefix:'술피하기_포커',         count:3 },
    kingstagram: { prefix:'킹스타그램',           count:2 },
    coinstack:   { prefix:'코인_드롭__코인_스윙', count:2 },
    coinswing:   { prefix:'코인_드롭__코인_스윙', count:2 },
    tarot:       { prefix:'별빛_타로',            count:2 },
  };
  var _gcComicGame = null;    // game ID currently displayed
  var _gcComicIdx  = 0;       // current panel index
  var _gcComicTimer = null;   // auto-advance timer

  // Build game list from GAME_INFO (defined in core.js)
  function _gcBuildGameList() {
    // Ordered list matching the original catalog order
    _gcGames = [
      'poker','mafia','sutda','quickdraw','roulette','lottery',
      'ecard','yahtzee','updown','truth','fortress','bombshot',
      'blackjack','jewel','colorchain','slinkystairs','pupil',
      'idol','drinkpoker','kingstagram','coinstack','coinswing','tarot'
    ];
  }

  // --- Carousel Rendering ---
  function _gcRenderTrack() {
    var track = document.getElementById('gcTrack');
    if (!track) return;
    track.innerHTML = '';

    for (var i = 0; i < _gcGames.length; i++) {
      var id = _gcGames[i];
      var info = (typeof GAME_INFO !== 'undefined') ? GAME_INFO[id] : null;
      if (!info) continue;

      var card = document.createElement('div');
      card.className = 'gc-card';
      card.dataset.index = i;
      card.dataset.game = id;

      // Solo-only disabled check
      if (typeof SOLO_ONLY_GAMES !== 'undefined' && SOLO_ONLY_GAMES.includes(id)) {
        if (typeof state !== 'undefined' && state.players && state.players.length > 1) {
          card.classList.add('disabled');
        }
      }

      var emoji = document.createElement('div');
      emoji.className = 'gc-card-emoji';
      emoji.textContent = info.emoji;

      var name = document.createElement('div');
      name.className = 'gc-card-name';
      name.textContent = info.name;

      card.appendChild(emoji);
      card.appendChild(name);

      card.addEventListener('click', (function(idx) {
        return function() { gcGoTo(idx); };
      })(i));

      track.appendChild(card);
    }

    // Render dots
    _gcRenderDots();
  }

  function _gcRenderDots() {
    var dotsEl = document.getElementById('gcDots');
    if (!dotsEl) return;
    dotsEl.innerHTML = '';

    // Show a subset of dots if too many games
    var total = _gcGames.length;
    for (var i = 0; i < total; i++) {
      var dot = document.createElement('div');
      dot.className = 'gc-dot';
      if (i === _gcIndex) dot.classList.add('active');
      dotsEl.appendChild(dot);
    }
  }

  function _gcUpdateCards() {
    var track = document.getElementById('gcTrack');
    if (!track) return;
    var cards = track.querySelectorAll('.gc-card');

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      card.classList.remove('active', 'near');
      var diff = Math.abs(i - _gcIndex);
      if (i === _gcIndex) card.classList.add('active');
      else if (diff === 1) card.classList.add('near');
    }

    // Center the active card
    _gcCenterCard();

    // Update dots
    var dots = document.querySelectorAll('#gcDots .gc-dot');
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.toggle('active', j === _gcIndex);
    }
  }

  function _gcCenterCard() {
    var track = document.getElementById('gcTrack');
    var wrapper = track ? track.parentElement : null;
    if (!track || !wrapper) return;

    var cards = track.querySelectorAll('.gc-card');
    if (!cards.length || _gcIndex >= cards.length) return;

    var wrapperW = wrapper.offsetWidth;
    var cardW = 100; // card width in px
    var gap = 12;

    // Calculate offset to center the active card
    var totalCardWidth = cardW + gap;
    var centerOffset = (wrapperW / 2) - (cardW / 2);
    var translateX = centerOffset - (_gcIndex * totalCardWidth);

    track.style.gap = gap + 'px';
    track.style.transform = 'translateX(' + translateX + 'px)';
  }

  // --- Game Info ---
  function _gcUpdateInfo() {
    var id = _gcGames[_gcIndex];
    var info = (typeof GAME_INFO !== 'undefined') ? GAME_INFO[id] : null;
    if (!info) return;

    var emojiEl = document.getElementById('gcInfoEmoji');
    var nameEl = document.getElementById('gcInfoName');
    var descEl = document.getElementById('gcInfoDesc');
    var typeEl = document.getElementById('gcInfoType');
    var playersEl = document.getElementById('gcInfoPlayers');
    var timeEl = document.getElementById('gcInfoTime');

    if (emojiEl) emojiEl.textContent = info.emoji;
    if (nameEl) nameEl.textContent = info.name;
    if (descEl) descEl.textContent = info.desc;
    if (typeEl) typeEl.textContent = info.type;
    if (playersEl) playersEl.textContent = info.players;
    if (timeEl) timeEl.textContent = info.time;

    // Update pending game for host
    if (typeof state !== 'undefined' && state.isHost) {
      state._catalogPendingGame = id;
    }
  }

  // --- Comic Strip ---
  function _gcComicPanelUrl(prefix, idx) {
    return 'tutorial/comics/' + prefix + '_p' + ('0' + idx).slice(-2) + '.png';
  }

  function _gcShowComic(gameId) {
    var data = COMIC_DATA[gameId];
    var strip = document.getElementById('gcComicStrip');
    var placeholder = document.getElementById('gcVideoPlaceholder');
    var videoEl = document.getElementById('gcVideo');
    if (!strip || !data) {
      // No comic → show placeholder
      if (strip) strip.style.display = 'none';
      if (placeholder) placeholder.style.display = '';
      return;
    }

    // Hide video/placeholder, show comic
    if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.classList.remove('playing'); }
    if (placeholder) placeholder.style.display = 'none';
    strip.style.display = '';

    if (_gcComicGame === gameId) return; // already showing this game
    _gcComicGame = gameId;
    _gcComicIdx = 0;
    _gcComicRender();
    _gcComicAutoStart(data.count);
  }

  function _gcComicRender() {
    var data = COMIC_DATA[_gcComicGame];
    if (!data) return;
    var img = document.getElementById('gcComicImg');
    var dotsEl = document.getElementById('gcComicDots');
    var prevBtn = document.getElementById('gcComicPrev');
    var nextBtn = document.getElementById('gcComicNext');
    if (!img) return;

    img.src = _gcComicPanelUrl(data.prefix, _gcComicIdx);

    if (dotsEl) {
      dotsEl.innerHTML = '';
      for (var i = 0; i < data.count; i++) {
        var d = document.createElement('span');
        d.className = 'gc-comic-dot' + (i === _gcComicIdx ? ' active' : '');
        (function(ii){ d.onclick = function(){ _gcComicIdx = ii; _gcComicRender(); _gcComicAutoStart(data.count); }; })(i);
        dotsEl.appendChild(d);
      }
    }
    if (prevBtn) prevBtn.style.visibility = _gcComicIdx > 0 ? '' : 'hidden';
    if (nextBtn) nextBtn.style.visibility = _gcComicIdx < data.count - 1 ? '' : 'hidden';
  }

  function _gcComicAutoStart(count) {
    if (_gcComicTimer) clearInterval(_gcComicTimer);
    if (count <= 1) return;
    _gcComicTimer = setInterval(function() {
      var data = COMIC_DATA[_gcComicGame];
      if (!data) return;
      _gcComicIdx = (_gcComicIdx + 1) % data.count;
      _gcComicRender();
    }, 3000);
  }

  function _gcCancelComic() {
    if (_gcComicTimer) { clearInterval(_gcComicTimer); _gcComicTimer = null; }
    _gcComicGame = null;
    var strip = document.getElementById('gcComicStrip');
    if (strip) strip.style.display = 'none';
  }

  window.gcComicNav = function(dir) {
    var data = COMIC_DATA[_gcComicGame];
    if (!data) return;
    _gcComicIdx = Math.max(0, Math.min(data.count - 1, _gcComicIdx + dir));
    _gcComicRender();
    _gcComicAutoStart(data.count);
  };

  // --- Video Preview (no videos — show comic directly) ---
  function _gcScheduleVideo() {
    _gcCancelVideo();
    _gcCancelComic();

    var id = _gcGames[_gcIndex];
    _gcVideoTimer = setTimeout(function() {
      _gcShowComic(id);
    }, _gcVideoDelay);
  }

  function _gcCancelVideo() {
    if (_gcVideoTimer) { clearTimeout(_gcVideoTimer); _gcVideoTimer = null; }
  }

  // --- Navigation ---
  window.gcGoTo = function(idx) {
    if (_gcAnimating) return;
    if (idx < 0) idx = 0;
    if (idx >= _gcGames.length) idx = _gcGames.length - 1;

    var changed = (idx !== _gcIndex);
    _gcIndex = idx;

    if (changed) {
      _gcAnimating = true;
      _gcUpdateCards();
      _gcUpdateInfo();
      _gcScheduleVideo();
      setTimeout(function() { _gcAnimating = false; }, 360);
    }
  };

  window.gcNavigate = function(dir) {
    gcGoTo(_gcIndex + dir);
  };

  // --- Touch / Swipe ---
  function _gcTouchStart(e) {
    if (e.touches.length > 1) return;
    _gcSwipeStartX = e.touches[0].clientX;
    _gcSwipeStartY = e.touches[0].clientY;
    _gcSwiping = true;
    _gcDragging = true;
    _gcDragStartX = e.touches[0].clientX;
    _gcDragOffset = 0;

    var track = document.getElementById('gcTrack');
    if (track) track.style.transition = 'none';
  }

  function _gcTouchMove(e) {
    if (!_gcSwiping) return;
    var dx = e.touches[0].clientX - _gcSwipeStartX;
    var dy = e.touches[0].clientY - _gcSwipeStartY;

    // If vertical scroll is dominant, let it through
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      _gcSwiping = false;
      _gcDragging = false;
      var track = document.getElementById('gcTrack');
      if (track) track.style.transition = '';
      _gcCenterCard();
      return;
    }

    e.preventDefault();

    if (_gcDragging) {
      _gcDragOffset = e.touches[0].clientX - _gcDragStartX;
      var track = document.getElementById('gcTrack');
      var wrapper = track ? track.parentElement : null;
      if (track && wrapper) {
        var wrapperW = wrapper.offsetWidth;
        var cardW = 100;
        var gap = 12;
        var totalCardWidth = cardW + gap;
        var centerOffset = (wrapperW / 2) - (cardW / 2);
        var baseX = centerOffset - (_gcIndex * totalCardWidth);
        track.style.transform = 'translateX(' + (baseX + _gcDragOffset * 0.6) + 'px)';
      }
    }
  }

  function _gcTouchEnd(e) {
    if (!_gcSwiping && !_gcDragging) return;

    var track = document.getElementById('gcTrack');
    if (track) track.style.transition = '';

    var dx = _gcDragOffset;

    _gcSwiping = false;
    _gcDragging = false;

    if (Math.abs(dx) > _gcSwipeThreshold) {
      if (dx < 0 && _gcIndex < _gcGames.length - 1) {
        gcGoTo(_gcIndex + 1);
      } else if (dx > 0 && _gcIndex > 0) {
        gcGoTo(_gcIndex - 1);
      } else {
        _gcCenterCard();
      }
    } else {
      _gcCenterCard();
    }
  }

  // --- Keyboard ---
  function _gcKeyDown(e) {
    var overlay = document.getElementById('gameCatalogOverlay');
    if (!overlay || overlay.style.display === 'none') return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); gcNavigate(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); gcNavigate(1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (typeof confirmGameFromCatalog === 'function') confirmGameFromCatalog();
    }
    else if (e.key === 'Escape') {
      e.preventDefault();
      if (typeof closeGameCatalog === 'function') closeGameCatalog();
    }
  }

  // --- Grid View ---
  window.gcToggleGridView = function() {
    var grid = document.getElementById('gcGridOverlay');
    if (!grid) return;

    if (grid.style.display === 'none') {
      _gcRenderGrid();
      grid.style.display = '';
    } else {
      grid.style.display = 'none';
    }
  };

  function _gcRenderGrid() {
    var container = document.getElementById('gcGrid');
    if (!container) return;
    container.innerHTML = '';

    for (var i = 0; i < _gcGames.length; i++) {
      var id = _gcGames[i];
      var info = (typeof GAME_INFO !== 'undefined') ? GAME_INFO[id] : null;
      if (!info) continue;

      var item = document.createElement('div');
      item.className = 'gc-grid-item';
      item.dataset.game = id;
      item.dataset.index = i;

      if (i === _gcIndex) item.classList.add('selected');

      // Solo-only disabled
      if (typeof SOLO_ONLY_GAMES !== 'undefined' && SOLO_ONLY_GAMES.includes(id)) {
        if (typeof state !== 'undefined' && state.players && state.players.length > 1) {
          item.classList.add('disabled');
        }
      }

      var emoji = document.createElement('div');
      emoji.className = 'gc-grid-item-emoji';
      emoji.textContent = info.emoji;

      var name = document.createElement('div');
      name.className = 'gc-grid-item-name';
      name.textContent = info.name;

      item.appendChild(emoji);
      item.appendChild(name);

      item.addEventListener('click', (function(idx) {
        return function() {
          gcGoTo(idx);
          gcToggleGridView();
        };
      })(i));

      container.appendChild(item);
    }
  }

  // --- Init / Open / Close ---
  window.gcInitCarousel = function() {
    _gcBuildGameList();
    _gcRenderTrack();

    // Find initial index from state
    if (typeof state !== 'undefined' && state.selectedGame) {
      var idx = _gcGames.indexOf(state.selectedGame);
      if (idx >= 0) _gcIndex = idx;
    }

    _gcUpdateCards();
    _gcUpdateInfo();

    // Bind touch events on carousel area (once only)
    if (!_gcBound) {
      _gcBound = true;
      var carouselArea = document.querySelector('.gc-carousel-area');
      if (carouselArea) {
        carouselArea.addEventListener('touchstart', _gcTouchStart, { passive: false });
        carouselArea.addEventListener('touchmove', _gcTouchMove, { passive: false });
        carouselArea.addEventListener('touchend', _gcTouchEnd, { passive: true });
      }
      document.addEventListener('keydown', _gcKeyDown);
    }

    // Host/guest button visibility
    var selectBtn = document.getElementById('catalogSelectBtn');
    var readOnlyMsg = document.getElementById('catalogReadOnlyMsg');
    if (typeof state !== 'undefined') {
      if (state.isHost) {
        if (selectBtn) selectBtn.style.display = 'block';
        if (readOnlyMsg) readOnlyMsg.style.display = 'none';
        state._catalogPendingGame = _gcGames[_gcIndex];
      } else {
        if (selectBtn) selectBtn.style.display = 'none';
        if (readOnlyMsg) readOnlyMsg.style.display = 'block';
      }
    }

    // Schedule video for initial selection
    _gcScheduleVideo();
  };

  window.gcDestroyCarousel = function() {
    _gcCancelVideo();
    var videoEl = document.getElementById('gcVideo');
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.classList.remove('playing');
    }
    var carouselArea = document.querySelector('.gc-carousel-area');
    if (carouselArea) {
      carouselArea.removeEventListener('touchstart', _gcTouchStart);
      carouselArea.removeEventListener('touchmove', _gcTouchMove);
      carouselArea.removeEventListener('touchend', _gcTouchEnd);
    }
  };

  // Expose current game getter
  window.gcGetCurrentGame = function() {
    return _gcGames[_gcIndex] || null;
  };

})();
