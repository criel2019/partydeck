// =============================================
// KINGSTAGRAM (킹스타그램) — Las Vegas Dice Variant
// 6 lands, follower cards, dice placement
// 1 die per turn, auto-place on corresponding land
// =============================================

// ===== CONSTANTS =====
var KING_LANDS = [
  { id: 1, name: '\uc81c\ub85c\ud22c \ucda4', emoji: '\ud83d\udc83' },
  { id: 2, name: '\ucf54\uce74\uc778 \ucda4', emoji: '\ud83d\udd7a' },
  { id: 3, name: '\uace8\ubc18\ud1b5\uc2e0', emoji: '\ud83d\ude0f' },
  { id: 4, name: '\uc724\uc815\uc544', emoji: '\ud83c\udfb5' },
  { id: 5, name: '\ucd08\uc804\ub3c4\uccb4 \ucda4', emoji: '\u26a1' },
  { id: 6, name: '\ub9c8\ub77c\ud0d5\ud6c4\ub8e8', emoji: '\ud83c\udf36' }
];

var KING_DECK_TEMPLATE = [
  { value: 10000, count: 8 },
  { value: 20000, count: 8 },
  { value: 30000, count: 8 },
  { value: 40000, count: 7 },
  { value: 50000, count: 6 },
  { value: 60000, count: 6 },
  { value: 70000, count: 5 },
  { value: 80000, count: 5 },
  { value: 90000, count: 4 },
  { value: 100000, count: 3 }
];

// ===== STATE =====
var kingState = null; // host-only full state
var _kingView = null; // client-side last received view
var _kingTimers = [];
var _kingShowRankings = false; // toggle rankings overlay
var _kingRecorded = false; // prevent duplicate recordGame calls

// ===== DECK HELPERS =====
function kingCreateDeck() {
  var deck = [];
  for (var i = 0; i < KING_DECK_TEMPLATE.length; i++) {
    var tmpl = KING_DECK_TEMPLATE[i];
    for (var j = 0; j < tmpl.count; j++) {
      deck.push(tmpl.value);
    }
  }
  // Fisher-Yates shuffle
  for (var k = deck.length - 1; k > 0; k--) {
    var r = Math.floor(Math.random() * (k + 1));
    var tmp = deck[k];
    deck[k] = deck[r];
    deck[r] = tmp;
  }
  return deck;
}

function dealCardsToLands(deck, lands) {
  for (var i = 0; i < lands.length; i++) {
    lands[i].cards = [];
  }
  var landIdx = 0;
  while (deck.length > 0 && landIdx < lands.length) {
    var sum = 0;
    for (var c = 0; c < lands[landIdx].cards.length; c++) {
      sum += lands[landIdx].cards[c];
    }
    if (sum >= 50000) {
      landIdx++;
      continue;
    }
    lands[landIdx].cards.push(deck.shift());
    sum = 0;
    for (var s = 0; s < lands[landIdx].cards.length; s++) {
      sum += lands[landIdx].cards[s];
    }
    if (sum >= 50000) {
      landIdx++;
    }
  }
  for (var l = 0; l < lands.length; l++) {
    lands[l].cards.sort(function(a, b) { return b - a; });
  }
}

// ===== FORMAT HELPERS =====
function kingFormatFollowers(n) {
  if (n >= 10000) {
    var man = n / 10000;
    if (man === Math.floor(man)) return Math.floor(man) + '\ub9cc';
    return man.toFixed(1) + '\ub9cc';
  }
  return String(n);
}

function kingFormatTotal(n) {
  if (n >= 10000) {
    var man = n / 10000;
    if (man === Math.floor(man)) return Math.floor(man) + '\ub9cc';
    return man.toFixed(1) + '\ub9cc';
  }
  return String(n);
}

// ===== HOST: START GAME =====
function startKingstagram() {
  if (!state.isHost) return;
  closeKingstagramCleanup();

  // Add CPUs to fill up to 4 players
  var allPlayers = state.players.slice();
  var cpuIdx = 0;
  while (allPlayers.length < 4) {
    allPlayers.push({
      id: 'ai-' + cpuIdx,
      name: 'CPU ' + (cpuIdx + 1),
      avatar: '\ud83e\udd16',
    });
    cpuIdx++;
  }
  // Update state.players so AI system can detect CPU turns
  state.players = allPlayers;

  var deck = kingCreateDeck();

  var lands = [];
  for (var i = 0; i < KING_LANDS.length; i++) {
    lands.push({
      id: KING_LANDS[i].id,
      name: KING_LANDS[i].name,
      emoji: KING_LANDS[i].emoji,
      cards: [],
      dice: {} // { playerId: count }
    });
  }

  dealCardsToLands(deck, lands);

  var players = allPlayers.map(function(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      diceLeft: 8,
      totalFollowers: 0,
      cards: []
    };
  });

  kingState = {
    players: players,
    lands: lands,
    deck: deck,
    round: 1,
    maxRounds: 4,
    turnIdx: 0,
    lastRoll: null, // { value, landName, landEmoji, playerId, playerName }
    phase: 'rolling', // rolling | placed | scoring | round-end | gameover
    startPlayerIdx: 0
  };

  broadcast({ type: 'game-start', game: 'kingstagram', state: getKingView() });
  showScreen('kingstagramGame');
  broadcastKingState();
}

// ===== HOST: BUILD VIEW =====
function getKingView() {
  if (!kingState) return null;
  var ks = kingState;
  var view = {
    players: ks.players.map(function(p) {
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        diceLeft: p.diceLeft,
        totalFollowers: p.totalFollowers,
        cardCount: p.cards.length
      };
    }),
    lands: ks.lands.map(function(land) {
      return {
        id: land.id,
        name: land.name,
        emoji: land.emoji,
        cards: land.cards.slice(),
        dice: Object.assign({}, land.dice)
      };
    }),
    round: ks.round,
    maxRounds: ks.maxRounds,
    turnIdx: ks.turnIdx,
    lastRoll: ks.lastRoll,
    phase: ks.phase,
    startPlayerIdx: ks.startPlayerIdx,
    rankings: ks.phase === 'gameover' ? getKingRankings() : null
  };
  return view;
}

// ===== HOST: BROADCAST =====
function broadcastKingState() {
  if (!state.isHost || !kingState) return;
  var view = getKingView();
  broadcast({ type: 'king-state', state: view });
  renderKingView(view);
}

// ===== HOST: PROCESS ROLL (1 die per turn) =====
function processKingRoll(fromId) {
  if (!state.isHost || !kingState) return;
  if (kingState.phase !== 'rolling') return;

  var ks = kingState;
  var player = ks.players[ks.turnIdx];
  if (!player || player.id !== fromId) return;
  if (player.diceLeft <= 0) return;

  // Roll 1 die (1-6)
  var value = Math.floor(Math.random() * 6) + 1;

  // Place on corresponding land
  var landIdx = value - 1;
  var land = ks.lands[landIdx];
  if (!land.dice[player.id]) land.dice[player.id] = 0;
  land.dice[player.id]++;
  player.diceLeft--;

  // Set display info
  var landInfo = KING_LANDS[landIdx];
  ks.lastRoll = {
    value: value,
    landName: landInfo.name,
    landEmoji: landInfo.emoji,
    playerId: player.id,
    playerName: player.name
  };
  ks.phase = 'placed';
  broadcastKingState();

  // After brief display, advance turn
  var t = setTimeout(function() {
    if (!kingState || kingState.phase !== 'placed') return;
    kingState.lastRoll = null;
    advanceKingTurn();
  }, 1200);
  _kingTimers.push(t);
}

// ===== HOST: ADVANCE TURN =====
function advanceKingTurn() {
  if (!kingState) return;
  var ks = kingState;
  var pCount = ks.players.length;

  // Find next player with dice remaining
  for (var i = 1; i <= pCount; i++) {
    var nextIdx = (ks.turnIdx + i) % pCount;
    var nextPlayer = ks.players[nextIdx];
    if (nextPlayer.diceLeft > 0) {
      ks.turnIdx = nextIdx;
      ks.phase = 'rolling';
      broadcastKingState();
      return;
    }
  }

  // All players have placed all dice -> score round
  processKingScoring();
}

// ===== HOST: SCORING =====
function processKingScoring() {
  if (!kingState) return;
  var ks = kingState;
  ks.phase = 'scoring';
  ks.lastRoll = null;

  var scoringResults = [];

  for (var l = 0; l < ks.lands.length; l++) {
    var land = ks.lands[l];
    var landResult = {
      landId: land.id,
      landName: land.name,
      landEmoji: land.emoji,
      cards: land.cards.slice(),
      awards: [] // [{playerId, playerName, card, cancelled}]
    };

    // Build ranking: [{id, count}]
    var entries = [];
    var playerIds = Object.keys(land.dice);
    for (var p = 0; p < playerIds.length; p++) {
      var pid = playerIds[p];
      var cnt = land.dice[pid];
      if (cnt > 0) {
        entries.push({ id: pid, count: cnt });
      }
    }

    // Sort by count descending
    entries.sort(function(a, b) { return b.count - a.count; });

    // Award cards: handle ties (cancel out tied players)
    var cardIdx = 0;
    var i = 0;
    while (i < entries.length && cardIdx < land.cards.length) {
      var groupCount = entries[i].count;
      var group = [];
      while (i < entries.length && entries[i].count === groupCount) {
        group.push(entries[i]);
        i++;
      }

      if (group.length === 1) {
        // No tie - award card
        var entry = group[0];
        var winner = ks.players.find(function(pp) { return pp.id === entry.id; });
        if (winner) {
          winner.totalFollowers += land.cards[cardIdx];
          winner.cards.push(land.cards[cardIdx]);
          landResult.awards.push({
            playerId: entry.id,
            playerName: winner.name,
            card: land.cards[cardIdx],
            cancelled: false
          });
        }
        cardIdx++;
      } else {
        // Tie - all tied players cancel out, skip cards for each
        for (var t = 0; t < group.length; t++) {
          var tiedEntry = group[t];
          var tiedPlayer = ks.players.find(function(pp) { return pp.id === tiedEntry.id; });
          var tiedName = tiedPlayer ? tiedPlayer.name : '???';
          landResult.awards.push({
            playerId: tiedEntry.id,
            playerName: tiedName,
            card: cardIdx < land.cards.length ? land.cards[cardIdx] : 0,
            cancelled: true
          });
          if (cardIdx < land.cards.length) cardIdx++;
        }
      }
    }

    scoringResults.push(landResult);
  }

  // Broadcast scoring animation
  broadcast({ type: 'king-scoring', results: scoringResults });
  kingShowScoring(scoringResults);

  var delay = (ks.lands.length * 800) + 2000;
  var tEnd = setTimeout(function() {
    if (!kingState) return;
    if (kingState.round < kingState.maxRounds) {
      processKingRoundEnd();
    } else {
      kingState.phase = 'gameover';
      broadcastKingState();
    }
  }, delay);
  _kingTimers.push(tEnd);
}

// ===== HOST: ROUND END =====
function processKingRoundEnd() {
  if (!kingState) return;
  var ks = kingState;

  ks.round++;
  ks.startPlayerIdx = (ks.startPlayerIdx + 1) % ks.players.length;
  ks.turnIdx = ks.startPlayerIdx;

  // Reset player dice
  for (var p = 0; p < ks.players.length; p++) {
    ks.players[p].diceLeft = 8;
  }

  // Reset land dice
  for (var l = 0; l < ks.lands.length; l++) {
    ks.lands[l].dice = {};
    ks.lands[l].cards = [];
  }

  // Re-deal remaining deck to lands
  if (ks.deck.length > 0) {
    dealCardsToLands(ks.deck, ks.lands);
  }

  ks.lastRoll = null;
  ks.phase = 'rolling';
  broadcastKingState();
}

// ===== HOST: RANKINGS =====
function getKingRankings() {
  if (!kingState) return [];
  var sorted = kingState.players.slice().sort(function(a, b) {
    if (b.totalFollowers !== a.totalFollowers) return b.totalFollowers - a.totalFollowers;
    return b.cards.length - a.cards.length;
  });
  return sorted.map(function(p, idx) {
    return {
      rank: idx + 1,
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      totalFollowers: p.totalFollowers,
      cardCount: p.cards.length
    };
  });
}

// ===== CLIENT: ROLL =====
function kingRoll() {
  if (!_kingView) return;
  if (_kingView.phase !== 'rolling') return;
  var currentPlayer = _kingView.players[_kingView.turnIdx];
  if (!currentPlayer || currentPlayer.id !== state.myId) {
    showToast('\ub2f9\uc2e0\uc758 \ucc28\ub840\uac00 \uc544\ub2d9\ub2c8\ub2e4');
    return;
  }

  if (state.isHost) {
    processKingRoll(state.myId);
  } else {
    sendToHost({ type: 'king-roll' });
  }
}

// ===== CLIENT: TOGGLE RANKINGS =====
function kingToggleRankings() {
  _kingShowRankings = !_kingShowRankings;
  if (_kingView) renderKingView(_kingView);
}

// ===== CLIENT: RENDER VIEW =====
function renderKingView(view) {
  if (!view) return;
  _kingView = view;
  showScreen('kingstagramGame');

  var container = document.getElementById('kingstagramGame');
  if (!container) return;

  var currentPlayer = view.players[view.turnIdx];
  var isMyTurn = currentPlayer && currentPlayer.id === state.myId;
  var myPlayer = null;
  var myIdx = -1;
  for (var pi = 0; pi < view.players.length; pi++) {
    if (view.players[pi].id === state.myId) {
      myPlayer = view.players[pi];
      myIdx = pi;
      break;
    }
  }

  var html = '';

  // === Top bar ===
  html += '<div class="king-topbar">';
  html += '<button class="king-back-btn" onclick="closeKingstagramGame()">\u2715</button>';
  html += '<div class="king-round-badge">' + view.round + '/' + view.maxRounds + ' \ub77c\uc6b4\ub4dc</div>';
  html += '<button class="king-rank-btn" onclick="kingToggleRankings()">\ud83c\udfc6</button>';
  html += '</div>';

  // === Turn indicator ===
  html += '<div class="king-turn-indicator">';
  if (view.phase === 'gameover') {
    html += '<span class="king-turn-text">\uac8c\uc784 \uc885\ub8cc!</span>';
  } else if (view.phase === 'scoring') {
    html += '<span class="king-turn-text">\uacb0\uc0b0 \uc911...</span>';
  } else if (view.phase === 'placed' && view.lastRoll) {
    // Show who placed what
    html += '<span class="king-turn-text">' + escapeHTML(view.lastRoll.playerName) + ': \ud83c\udfb2 ' +
      view.lastRoll.value + ' \u2192 ' + view.lastRoll.landEmoji + ' ' + view.lastRoll.landName + '</span>';
  } else if (currentPlayer) {
    var turnName = currentPlayer.id === state.myId ? '\ub0b4' : escapeHTML(currentPlayer.name) + '\uc758';
    html += '<span class="king-turn-text">' + turnName + ' \ucc28\ub840</span>';
    if (currentPlayer.id !== state.myId) {
      var cpIdx = view.players.indexOf(currentPlayer);
      html += '<span class="king-turn-avatar" style="background:' + PLAYER_COLORS[cpIdx % PLAYER_COLORS.length] + ';">' + currentPlayer.avatar + '</span>';
    }
  }
  html += '</div>';

  // === Players bar ===
  html += '<div class="king-players-bar">';
  for (var pi2 = 0; pi2 < view.players.length; pi2++) {
    var p = view.players[pi2];
    var isActive = pi2 === view.turnIdx && view.phase !== 'gameover' && view.phase !== 'scoring';
    html += '<div class="king-player-chip' + (isActive ? ' active' : '') + (p.id === state.myId ? ' me' : '') + '">';
    html += '<div class="king-player-avatar" style="background:' + PLAYER_COLORS[pi2 % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>';
    html += '<div class="king-player-info">';
    html += '<div class="king-player-name">' + escapeHTML(p.name) + '</div>';
    html += '<div class="king-player-followers">' + kingFormatTotal(p.totalFollowers) + '</div>';
    html += '</div>';
    html += '<div class="king-player-dice-count">\ud83c\udfb2' + p.diceLeft + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // === Lands grid (3x2) ===
  html += '<div class="king-lands-grid">';
  for (var li = 0; li < KING_LANDS.length; li++) {
    var land = view.lands[li];
    if (!land) continue;

    // Highlight the land that was just placed on
    var justPlaced = view.phase === 'placed' && view.lastRoll && view.lastRoll.value === (li + 1);

    html += '<div class="king-land-card' + (justPlaced ? ' king-land-highlight' : '') + '">';
    html += '<div class="king-land-header">';
    html += '<span class="king-land-emoji">' + land.emoji + '</span>';
    html += '<span class="king-land-name">' + land.name + '</span>';
    html += '</div>';

    // Cards in land
    html += '<div class="king-land-cards">';
    if (land.cards.length > 0) {
      var landSum = 0;
      for (var lc = 0; lc < land.cards.length; lc++) landSum += land.cards[lc];
      html += '<div class="king-land-total">' + kingFormatFollowers(landSum) + '</div>';
      html += '<div class="king-land-card-badges">';
      for (var lc2 = 0; lc2 < land.cards.length; lc2++) {
        html += '<span class="king-card-badge">' + kingFormatFollowers(land.cards[lc2]) + '</span>';
      }
      html += '</div>';
    } else {
      html += '<div class="king-land-empty">\u2014</div>';
    }
    html += '</div>';

    // Dice placed on land
    html += '<div class="king-land-dice">';
    var diceKeys = Object.keys(land.dice);
    for (var dk = 0; dk < diceKeys.length; dk++) {
      var dPlayerId = diceKeys[dk];
      var dCount = land.dice[dPlayerId];
      if (dCount <= 0) continue;
      var dPlayerIdx = -1;
      for (var pf = 0; pf < view.players.length; pf++) {
        if (view.players[pf].id === dPlayerId) { dPlayerIdx = pf; break; }
      }
      var dColor = dPlayerIdx >= 0 ? PLAYER_COLORS[dPlayerIdx % PLAYER_COLORS.length] : 'linear-gradient(135deg, #888, #666)';
      for (var dn = 0; dn < dCount; dn++) {
        html += '<div class="king-die-dot" style="background:' + dColor + ';" title="' + (dPlayerIdx >= 0 ? escapeHTML(view.players[dPlayerIdx].name) : '?') + '"></div>';
      }
    }
    html += '</div>';

    html += '</div>'; // .king-land-card
  }
  html += '</div>'; // .king-lands-grid

  // === Action area ===
  html += '<div class="king-action-area">';

  if (view.phase === 'rolling' && isMyTurn) {
    html += '<div class="king-dice-info">';
    html += '\ud83c\udfb2 \xd7' + (myPlayer ? myPlayer.diceLeft : 0) + ' \ub0a8\uc74c';
    html += '</div>';
    html += '<button class="king-roll-btn" onclick="kingRoll()">\ud83c\udfb2 \uad74\ub9ac\uae30</button>';
  } else if (view.phase === 'placed' && view.lastRoll) {
    // Show placement result
    html += '<div class="king-placed-result">';
    html += '<span class="king-placed-die">' + view.lastRoll.value + '</span>';
    html += '<span class="king-placed-arrow">\u2192</span>';
    html += '<span class="king-placed-land">' + view.lastRoll.landEmoji + ' ' + view.lastRoll.landName + '</span>';
    html += '</div>';
  } else if (view.phase === 'rolling' && !isMyTurn) {
    html += '<div class="king-waiting-text">' + escapeHTML(currentPlayer ? currentPlayer.name : '') + '\uc774(\uac00) \uc8fc\uc0ac\uc704\ub97c \uad74\ub9ac\ub294 \uc911...</div>';
  } else if (view.phase === 'scoring') {
    html += '<div class="king-scoring-text">\ud83d\udcca \uacb0\uc0b0 \uc911...</div>';
  }

  html += '</div>'; // .king-action-area

  // === Game Over ===
  if (view.phase === 'gameover' && view.rankings) {
    html += kingBuildGameOverHTML(view.rankings, view.players);
  }

  // === Rankings overlay ===
  if (_kingShowRankings && view.phase !== 'gameover') {
    html += kingBuildRankingsOverlay(view);
  }

  container.innerHTML = html;
}

// ===== BUILD GAME OVER HTML =====
function kingBuildGameOverHTML(rankings, players) {
  var html = '<div class="king-gameover-overlay">';
  html += '<div class="king-gameover-panel">';
  html += '<div class="king-gameover-title">\ud83d\udc51 \ud0b9\uc2a4\ud0c0\uadf8\ub7a8 \ucd5c\uc885 \uc21c\uc704</div>';

  for (var i = 0; i < rankings.length; i++) {
    var r = rankings[i];
    var rankClass = '';
    if (r.rank === 1) rankClass = 'first';
    else if (r.rank === 2) rankClass = 'second';
    else if (r.rank === 3) rankClass = 'third';

    var pIdx = -1;
    for (var pi = 0; pi < players.length; pi++) {
      if (players[pi].id === r.id) { pIdx = pi; break; }
    }

    html += '<div class="king-rank-item ' + rankClass + '">';
    html += '<div class="king-rank-number">' + r.rank + '\uc704</div>';
    html += '<div class="king-rank-avatar" style="background:' + PLAYER_COLORS[pIdx >= 0 ? pIdx % PLAYER_COLORS.length : 0] + ';">' + r.avatar + '</div>';
    html += '<div class="king-rank-info">';
    html += '<div class="king-rank-name">' + escapeHTML(r.name) + (r.id === state.myId ? ' (\ub098)' : '') + '</div>';
    html += '<div class="king-rank-detail">\uce74\ub4dc ' + r.cardCount + '\uc7a5</div>';
    html += '</div>';
    html += '<div class="king-rank-score">' + kingFormatTotal(r.totalFollowers) + '</div>';
    html += '</div>';
  }

  html += '<button class="king-close-btn" onclick="closeKingstagramGame()">\ub85c\ube44\ub85c \ub3cc\uc544\uac00\uae30</button>';
  html += '</div></div>';

  // Record game (only once)
  if (!_kingRecorded && rankings.length > 0) {
    _kingRecorded = true;
    var myRank = -1;
    for (var mi = 0; mi < rankings.length; mi++) {
      if (rankings[mi].id === state.myId) { myRank = mi; break; }
    }
    if (myRank >= 0) {
      var won = myRank === 0;
      var goldRewards = [60, 30, 10];
      var goldReward = myRank < goldRewards.length ? goldRewards[myRank] : 0;
      if (typeof recordGame === 'function') recordGame(won, goldReward);
    }
  }

  return html;
}

// ===== BUILD RANKINGS OVERLAY =====
function kingBuildRankingsOverlay(view) {
  var sorted = view.players.slice().sort(function(a, b) {
    if (b.totalFollowers !== a.totalFollowers) return b.totalFollowers - a.totalFollowers;
    return b.cardCount - a.cardCount;
  });
  for (var i = 0; i < sorted.length; i++) {
    sorted[i]._rank = i + 1;
  }

  var html = '<div class="king-rankings-overlay" onclick="kingToggleRankings()">';
  html += '<div class="king-rankings-panel" onclick="event.stopPropagation()">';
  html += '<div class="king-rankings-title">\ud83c\udfc6 \ud604\uc7ac \uc21c\uc704 (\ub77c\uc6b4\ub4dc ' + view.round + '/' + view.maxRounds + ')</div>';

  for (var i2 = 0; i2 < sorted.length; i2++) {
    var p = sorted[i2];
    var pIdx = -1;
    for (var pi = 0; pi < view.players.length; pi++) {
      if (view.players[pi].id === p.id) { pIdx = pi; break; }
    }
    html += '<div class="king-ranking-row">';
    html += '<span class="king-ranking-pos">' + p._rank + '\uc704</span>';
    html += '<span class="king-ranking-avatar" style="background:' + PLAYER_COLORS[pIdx >= 0 ? pIdx % PLAYER_COLORS.length : 0] + ';">' + p.avatar + '</span>';
    html += '<span class="king-ranking-name">' + escapeHTML(p.name) + (p.id === state.myId ? ' (\ub098)' : '') + '</span>';
    html += '<span class="king-ranking-score">' + kingFormatTotal(p.totalFollowers) + '</span>';
    html += '</div>';
  }

  html += '<button class="king-close-overlay-btn" onclick="kingToggleRankings()">\ub2eb\uae30</button>';
  html += '</div></div>';
  return html;
}

// ===== CLIENT: SCORING OVERLAY =====
function kingShowScoring(results) {
  if (!results || results.length === 0) return;

  var overlay = document.createElement('div');
  overlay.className = 'king-scoring-overlay';
  overlay.id = 'kingScoringOverlay';

  var panel = document.createElement('div');
  panel.className = 'king-scoring-panel';

  var title = document.createElement('div');
  title.className = 'king-scoring-title';
  title.textContent = '\ud83d\udcca \ub77c\uc6b4\ub4dc \uacb0\uc0b0';
  panel.appendChild(title);

  var landsContainer = document.createElement('div');
  landsContainer.className = 'king-scoring-lands';
  panel.appendChild(landsContainer);

  overlay.appendChild(panel);

  var gameScreen = document.getElementById('kingstagramGame');
  if (gameScreen) gameScreen.appendChild(overlay);

  for (var i = 0; i < results.length; i++) {
    (function(idx) {
      var t = setTimeout(function() {
        var result = results[idx];
        var landDiv = document.createElement('div');
        landDiv.className = 'king-scoring-land';

        var landHeader = '<div class="king-scoring-land-header">' +
          result.landEmoji + ' ' + result.landName + '</div>';

        var awardsHtml = '';
        if (result.awards.length === 0) {
          awardsHtml = '<div class="king-scoring-empty">\uc8fc\uc0ac\uc704 \uc5c6\uc74c</div>';
        } else {
          for (var a = 0; a < result.awards.length; a++) {
            var award = result.awards[a];
            var cls = 'king-scoring-award';
            if (award.cancelled) cls += ' cancelled';
            awardsHtml += '<div class="' + cls + '">';
            awardsHtml += '<span class="king-scoring-player">' + escapeHTML(award.playerName) + '</span>';
            if (award.cancelled) {
              awardsHtml += '<span class="king-scoring-result">\ub3d9\ub960 \uc0c1\uc1c4! \u274c</span>';
            } else {
              awardsHtml += '<span class="king-scoring-result">\u2192 ' + kingFormatFollowers(award.card) + ' \ud68d\ub4dd! \u2705</span>';
            }
            awardsHtml += '</div>';
          }
        }

        landDiv.innerHTML = landHeader + awardsHtml;
        landDiv.style.animation = 'kingScoreFadeIn 0.4s ease-out';
        landsContainer.appendChild(landDiv);
      }, idx * 800);
      _kingTimers.push(t);
    })(i);
  }

  var closeDelay = results.length * 800 + 1500;
  var tClose = setTimeout(function() {
    var el = document.getElementById('kingScoringOverlay');
    if (el) el.remove();
  }, closeDelay);
  _kingTimers.push(tClose);
}

// ===== CLEANUP =====
function closeKingstagramCleanup() {
  _kingTimers.forEach(function(t) { clearTimeout(t); });
  _kingTimers = [];
  _kingView = null;
  _kingShowRankings = false;
  _kingRecorded = false;
  kingState = null;

  var overlay = document.getElementById('kingScoringOverlay');
  if (overlay) overlay.remove();
}

function closeKingstagramGame() {
  closeKingstagramCleanup();
  returnToLobby();
}

// ===== HOST: HANDLE MESSAGES FROM CLIENTS =====
function handleKingAction(peerId, msg) {
  if (!state.isHost || !kingState) return;

  if (msg.type === 'king-roll') {
    processKingRoll(peerId);
  }
}
