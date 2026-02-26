// =============================================
// KINGSTAGRAM (킹스타그램) — Las Vegas Dice Variant
// 6 lands, follower cards, dice placement
// =============================================

// ===== CONSTANTS =====
var KING_LANDS = [
  { id: 1, name: '제로투 춤', emoji: '💃' },
  { id: 2, name: '코카인 춤', emoji: '🕺' },
  { id: 3, name: '골반통신', emoji: '😏' },
  { id: 4, name: '윤정아', emoji: '🎵' },
  { id: 5, name: '초전도체 춤', emoji: '⚡' },
  { id: 6, name: '마라탕후루', emoji: '🌶' }
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
var _kingSelectedNumber = null; // locally selected dice group number
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
  // Reset land cards
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
    // Recompute sum
    sum = 0;
    for (var s = 0; s < lands[landIdx].cards.length; s++) {
      sum += lands[landIdx].cards[s];
    }
    if (sum >= 50000) {
      landIdx++;
    }
  }
  // Sort each land's cards descending (highest first for awarding)
  for (var l = 0; l < lands.length; l++) {
    lands[l].cards.sort(function(a, b) { return b - a; });
  }
}

// ===== FORMAT HELPERS =====
function kingFormatFollowers(n) {
  if (n >= 10000) {
    var man = n / 10000;
    if (man === Math.floor(man)) return Math.floor(man) + '만';
    return man.toFixed(1) + '만';
  }
  return String(n);
}

function kingFormatTotal(n) {
  if (n >= 10000) {
    var man = n / 10000;
    if (man === Math.floor(man)) return Math.floor(man) + '만';
    return man.toFixed(1) + '만';
  }
  return String(n);
}

// ===== NEUTRAL DICE COUNT =====
function kingGetNeutralCount(playerCount) {
  if (playerCount <= 1) return 4;
  if (playerCount === 2) return 4;
  if (playerCount <= 5) return 2;
  return 0; // 6 players
}

// ===== HOST: START GAME =====
function startKingstagram() {
  if (!state.isHost) return;
  closeKingstagramCleanup();

  var deck = kingCreateDeck();

  var playerCount = state.players.length;
  var neutralCount = kingGetNeutralCount(playerCount);

  var lands = [];
  for (var i = 0; i < KING_LANDS.length; i++) {
    lands.push({
      id: KING_LANDS[i].id,
      name: KING_LANDS[i].name,
      emoji: KING_LANDS[i].emoji,
      cards: [],
      dice: {},       // { playerId: count }
      neutralCount: 0 // neutral dice placed here
    });
  }

  dealCardsToLands(deck, lands);

  var players = state.players.map(function(p) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      diceLeft: 8,
      neutralDice: neutralCount,
      totalFollowers: 0,
      cards: []
    };
  });

  kingState = {
    players: players,
    lands: lands,
    deck: deck, // remaining after dealing
    round: 1,
    maxRounds: 4,
    turnIdx: 0,
    currentRoll: [], // {value:1-6, isNeutral:bool}[]
    phase: 'rolling', // rolling | choosing | scoring | round-end | gameover
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
        neutralDice: p.neutralDice,
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
        dice: Object.assign({}, land.dice),
        neutralCount: land.neutralCount
      };
    }),
    round: ks.round,
    maxRounds: ks.maxRounds,
    turnIdx: ks.turnIdx,
    currentRoll: ks.currentRoll.slice(),
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

// ===== HOST: PROCESS ROLL =====
function processKingRoll(fromId) {
  if (!state.isHost || !kingState) return;
  if (kingState.phase !== 'rolling') return;

  var ks = kingState;
  var player = ks.players[ks.turnIdx];
  if (!player || player.id !== fromId) return;
  if (player.diceLeft <= 0 && player.neutralDice <= 0) return;

  // Roll all remaining dice
  var roll = [];
  for (var i = 0; i < player.diceLeft; i++) {
    roll.push({ value: Math.floor(Math.random() * 6) + 1, isNeutral: false });
  }
  for (var j = 0; j < player.neutralDice; j++) {
    roll.push({ value: Math.floor(Math.random() * 6) + 1, isNeutral: true });
  }
  ks.currentRoll = roll;
  ks.phase = 'choosing';
  broadcastKingState();
}

// ===== HOST: PROCESS CHOOSE =====
function processKingChoose(fromId, number) {
  if (!state.isHost || !kingState) return;
  if (kingState.phase !== 'choosing') return;
  if (typeof number !== 'number' || number < 1 || number > 6) return;

  var ks = kingState;
  var player = ks.players[ks.turnIdx];
  if (!player || player.id !== fromId) return;

  // Count dice of chosen number
  var personalCount = 0;
  var neutralCount = 0;
  for (var i = 0; i < ks.currentRoll.length; i++) {
    if (ks.currentRoll[i].value === number) {
      if (ks.currentRoll[i].isNeutral) neutralCount++;
      else personalCount++;
    }
  }

  if (personalCount + neutralCount === 0) return; // no dice of that number

  // Place dice on corresponding land
  var landIdx = number - 1;
  var land = ks.lands[landIdx];
  if (!land) return;

  // Place personal dice
  if (personalCount > 0) {
    if (!land.dice[player.id]) land.dice[player.id] = 0;
    land.dice[player.id] += personalCount;
    player.diceLeft -= personalCount;
  }

  // Place neutral dice
  if (neutralCount > 0) {
    land.neutralCount += neutralCount;
    player.neutralDice -= neutralCount;
  }

  // Clear roll
  ks.currentRoll = [];
  _kingSelectedNumber = null;

  // Check if player is done
  if (player.diceLeft <= 0 && player.neutralDice <= 0) {
    advanceKingTurn();
  } else {
    // Player still has dice, back to rolling
    ks.phase = 'rolling';
    broadcastKingState();
  }
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
    if (nextPlayer.diceLeft > 0 || nextPlayer.neutralDice > 0) {
      ks.turnIdx = nextIdx;
      ks.phase = 'rolling';
      ks.currentRoll = [];
      broadcastKingState();
      return;
    }
  }

  // All players have placed all dice → score round
  processKingScoring();
}

// ===== HOST: SCORING =====
function processKingScoring() {
  if (!kingState) return;
  var ks = kingState;
  ks.phase = 'scoring';
  ks.currentRoll = [];

  var scoringResults = [];

  for (var l = 0; l < ks.lands.length; l++) {
    var land = ks.lands[l];
    var landResult = {
      landId: land.id,
      landName: land.name,
      landEmoji: land.emoji,
      cards: land.cards.slice(),
      awards: [],    // [{playerId, playerName, card, cancelled}]
      neutralWins: 0 // cards discarded due to neutral winning
    };

    // Build ranking: [{id, count, isNeutral}]
    var entries = [];
    var playerIds = Object.keys(land.dice);
    for (var p = 0; p < playerIds.length; p++) {
      var pid = playerIds[p];
      var cnt = land.dice[pid];
      if (cnt > 0) {
        entries.push({ id: pid, count: cnt, isNeutral: false });
      }
    }
    if (land.neutralCount > 0) {
      entries.push({ id: '__neutral__', count: land.neutralCount, isNeutral: true });
    }

    // Sort by count descending
    entries.sort(function(a, b) { return b.count - a.count; });

    // Award cards: handle ties (cancel out tied players)
    var cardIdx = 0;
    var i = 0;
    while (i < entries.length && cardIdx < land.cards.length) {
      // Find group of entries with same count
      var groupCount = entries[i].count;
      var group = [];
      while (i < entries.length && entries[i].count === groupCount) {
        group.push(entries[i]);
        i++;
      }

      if (group.length === 1) {
        // No tie — award card
        var entry = group[0];
        if (entry.isNeutral) {
          // Neutral wins → discard card
          landResult.neutralWins++;
          landResult.awards.push({
            playerId: '__neutral__',
            playerName: '중립',
            card: land.cards[cardIdx],
            cancelled: false,
            isNeutral: true
          });
          cardIdx++;
        } else {
          // Player wins card
          var winner = ks.players.find(function(pp) { return pp.id === entry.id; });
          if (winner) {
            winner.totalFollowers += land.cards[cardIdx];
            winner.cards.push(land.cards[cardIdx]);
            landResult.awards.push({
              playerId: entry.id,
              playerName: winner.name,
              card: land.cards[cardIdx],
              cancelled: false,
              isNeutral: false
            });
          }
          cardIdx++;
        }
      } else {
        // Tie — all tied players/neutral cancel out, skip cards for each
        for (var t = 0; t < group.length; t++) {
          var tiedEntry = group[t];
          var tiedName = '중립';
          if (!tiedEntry.isNeutral) {
            var tiedPlayer = ks.players.find(function(pp) { return pp.id === tiedEntry.id; });
            if (tiedPlayer) tiedName = tiedPlayer.name;
          }
          landResult.awards.push({
            playerId: tiedEntry.id,
            playerName: tiedName,
            card: cardIdx < land.cards.length ? land.cards[cardIdx] : 0,
            cancelled: true,
            isNeutral: tiedEntry.isNeutral
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

  // After scoring animation, proceed to next round or gameover
  var delay = (ks.lands.length * 800) + 2000; // 800ms per land + 2s buffer
  var t = setTimeout(function() {
    if (!kingState) return;
    if (kingState.round < kingState.maxRounds) {
      processKingRoundEnd();
    } else {
      kingState.phase = 'gameover';
      broadcastKingState();
    }
  }, delay);
  _kingTimers.push(t);

  // NOTE: Do NOT call broadcastKingState() here — renderKingView's innerHTML
  // would destroy the scoring overlay DOM. State broadcast happens in the timer above.
}

// ===== HOST: ROUND END =====
function processKingRoundEnd() {
  if (!kingState) return;
  var ks = kingState;

  ks.round++;
  ks.startPlayerIdx = (ks.startPlayerIdx + 1) % ks.players.length;
  ks.turnIdx = ks.startPlayerIdx;

  var neutralCount = kingGetNeutralCount(ks.players.length);

  // Reset player dice
  for (var p = 0; p < ks.players.length; p++) {
    ks.players[p].diceLeft = 8;
    ks.players[p].neutralDice = neutralCount;
  }

  // Reset land dice
  for (var l = 0; l < ks.lands.length; l++) {
    ks.lands[l].dice = {};
    ks.lands[l].neutralCount = 0;
    ks.lands[l].cards = [];
  }

  // Re-deal remaining deck to lands
  if (ks.deck.length > 0) {
    dealCardsToLands(ks.deck, ks.lands);
  }

  ks.currentRoll = [];
  ks.phase = 'rolling';
  broadcastKingState();
}

// ===== HOST: RANKINGS =====
function getKingRankings() {
  if (!kingState) return [];
  var sorted = kingState.players.slice().sort(function(a, b) {
    if (b.totalFollowers !== a.totalFollowers) return b.totalFollowers - a.totalFollowers;
    return b.cards.length - a.cards.length; // tiebreak: more cards
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
    showToast('당신의 차례가 아닙니다');
    return;
  }

  if (state.isHost) {
    processKingRoll(state.myId);
  } else {
    sendToHost({ type: 'king-roll' });
  }
}

// ===== CLIENT: CHOOSE NUMBER =====
function kingChoose(number) {
  if (!_kingView) return;
  if (_kingView.phase !== 'choosing') return;
  var currentPlayer = _kingView.players[_kingView.turnIdx];
  if (!currentPlayer || currentPlayer.id !== state.myId) return;

  // Validate number exists in current roll
  var found = false;
  for (var i = 0; i < _kingView.currentRoll.length; i++) {
    if (_kingView.currentRoll[i].value === number) { found = true; break; }
  }
  if (!found) {
    showToast('해당 숫자의 주사위가 없습니다');
    return;
  }

  if (state.isHost) {
    processKingChoose(state.myId, number);
  } else {
    sendToHost({ type: 'king-choose', number: number });
  }
}

// ===== CLIENT: SELECT DICE GROUP (local highlight before confirm) =====
function kingSelectNumber(number) {
  _kingSelectedNumber = number;
  if (_kingView) renderKingView(_kingView);
}

function kingConfirmChoice() {
  if (_kingSelectedNumber === null) {
    showToast('주사위 그룹을 선택하세요');
    return;
  }
  kingChoose(_kingSelectedNumber);
  _kingSelectedNumber = null;
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

  // Build HTML
  var html = '';

  // === Top bar ===
  html += '<div class="king-topbar">';
  html += '<button class="king-back-btn" onclick="closeKingstagramGame()">✕</button>';
  html += '<div class="king-round-badge">' + view.round + '/' + view.maxRounds + ' 라운드</div>';
  html += '<button class="king-rank-btn" onclick="kingToggleRankings()">🏆</button>';
  html += '</div>';

  // === Turn indicator ===
  html += '<div class="king-turn-indicator">';
  if (view.phase === 'gameover') {
    html += '<span class="king-turn-text">게임 종료!</span>';
  } else if (view.phase === 'scoring') {
    html += '<span class="king-turn-text">결산 중...</span>';
  } else if (currentPlayer) {
    var turnName = currentPlayer.id === state.myId ? '내' : escapeHTML(currentPlayer.name) + '의';
    html += '<span class="king-turn-text">' + turnName + ' 차례</span>';
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
    html += '<div class="king-player-dice-count">🎲' + p.diceLeft + (p.neutralDice > 0 ? '+' + p.neutralDice : '') + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // === Lands grid (3×2) ===
  html += '<div class="king-lands-grid">';
  for (var li = 0; li < KING_LANDS.length; li++) {
    var land = view.lands[li];
    if (!land) continue;

    html += '<div class="king-land-card">';
    // Land header
    html += '<div class="king-land-header">';
    html += '<span class="king-land-emoji">' + land.emoji + '</span>';
    html += '<span class="king-land-name">' + land.name + '</span>';
    html += '</div>';

    // Cards in land
    html += '<div class="king-land-cards">';
    if (land.cards.length > 0) {
      // Show total and individual cards
      var landSum = 0;
      for (var lc = 0; lc < land.cards.length; lc++) landSum += land.cards[lc];
      html += '<div class="king-land-total">' + kingFormatFollowers(landSum) + '</div>';
      html += '<div class="king-land-card-badges">';
      for (var lc2 = 0; lc2 < land.cards.length; lc2++) {
        html += '<span class="king-card-badge">' + kingFormatFollowers(land.cards[lc2]) + '</span>';
      }
      html += '</div>';
    } else {
      html += '<div class="king-land-empty">—</div>';
    }
    html += '</div>';

    // Dice placed on land
    html += '<div class="king-land-dice">';
    var diceKeys = Object.keys(land.dice);
    for (var dk = 0; dk < diceKeys.length; dk++) {
      var dPlayerId = diceKeys[dk];
      var dCount = land.dice[dPlayerId];
      if (dCount <= 0) continue;
      // Find player index for color
      var dPlayerIdx = -1;
      for (var pf = 0; pf < view.players.length; pf++) {
        if (view.players[pf].id === dPlayerId) { dPlayerIdx = pf; break; }
      }
      var dColor = dPlayerIdx >= 0 ? PLAYER_COLORS[dPlayerIdx % PLAYER_COLORS.length] : 'linear-gradient(135deg, #888, #666)';
      for (var dn = 0; dn < dCount; dn++) {
        html += '<div class="king-die-dot" style="background:' + dColor + ';" title="' + (dPlayerIdx >= 0 ? escapeHTML(view.players[dPlayerIdx].name) : '?') + '"></div>';
      }
    }
    // Neutral dice
    for (var nn = 0; nn < land.neutralCount; nn++) {
      html += '<div class="king-die-dot king-die-neutral" title="중립">⚪</div>';
    }
    html += '</div>';

    html += '</div>'; // .king-land-card
  }
  html += '</div>'; // .king-lands-grid

  // === Roll results / Action area ===
  html += '<div class="king-action-area">';

  if (view.phase === 'rolling' && isMyTurn) {
    // Show dice remaining info + roll button
    html += '<div class="king-dice-info">';
    html += '🎲 ×' + (myPlayer ? myPlayer.diceLeft : 0);
    if (myPlayer && myPlayer.neutralDice > 0) {
      html += ' + ⚪×' + myPlayer.neutralDice;
    }
    html += ' 남음';
    html += '</div>';
    html += '<button class="king-roll-btn" onclick="kingRoll()">🎲 굴리기</button>';
  } else if (view.phase === 'choosing') {
    // Show roll results grouped by number
    var groups = {}; // {number: {personal, neutral}}
    for (var ri = 0; ri < view.currentRoll.length; ri++) {
      var die = view.currentRoll[ri];
      if (!groups[die.value]) groups[die.value] = { personal: 0, neutral: 0 };
      if (die.isNeutral) groups[die.value].neutral++;
      else groups[die.value].personal++;
    }

    html += '<div class="king-roll-results">';
    html += '<div class="king-roll-title">주사위 결과 — 배치할 숫자를 선택하세요</div>';
    html += '<div class="king-dice-groups">';
    var groupKeys = Object.keys(groups).sort(function(a, b) { return Number(a) - Number(b); });
    for (var gi = 0; gi < groupKeys.length; gi++) {
      var num = Number(groupKeys[gi]);
      var grp = groups[num];
      var landInfo = KING_LANDS[num - 1];
      var isSelected = _kingSelectedNumber === num;
      var canClick = isMyTurn;
      html += '<div class="king-dice-group' + (isSelected ? ' selected' : '') + (canClick ? ' clickable' : '') + '" ' +
        (canClick ? 'onclick="kingSelectNumber(' + num + ')"' : '') + '>';
      html += '<div class="king-dice-group-land">' + (landInfo ? landInfo.emoji : '') + ' ' + num + '</div>';
      html += '<div class="king-dice-group-count">';
      // Show personal dice as colored
      if (myIdx >= 0) {
        for (var dp = 0; dp < grp.personal; dp++) {
          html += '<span class="king-die-mini" style="background:' + PLAYER_COLORS[myIdx % PLAYER_COLORS.length] + ';">' + num + '</span>';
        }
      } else {
        for (var dp2 = 0; dp2 < grp.personal; dp2++) {
          html += '<span class="king-die-mini">' + num + '</span>';
        }
      }
      // Show neutral dice as gray
      for (var dnn = 0; dnn < grp.neutral; dnn++) {
        html += '<span class="king-die-mini king-die-mini-neutral">' + num + '</span>';
      }
      html += '</div>';
      html += '<div class="king-dice-group-label">' + (landInfo ? landInfo.name : '') + '</div>';
      html += '</div>';
    }
    html += '</div>'; // .king-dice-groups

    if (isMyTurn) {
      html += '<button class="king-choose-btn' + (_kingSelectedNumber !== null ? '' : ' disabled') + '" onclick="kingConfirmChoice()" ' +
        (_kingSelectedNumber === null ? 'disabled' : '') + '>✅ ' +
        (_kingSelectedNumber !== null ? KING_LANDS[_kingSelectedNumber - 1].emoji + ' ' + KING_LANDS[_kingSelectedNumber - 1].name + '에 배치' : '선택하세요') +
        '</button>';
    } else {
      html += '<div class="king-waiting-text">' + escapeHTML(currentPlayer ? currentPlayer.name : '') + '이(가) 선택 중...</div>';
    }
    html += '</div>'; // .king-roll-results
  } else if (view.phase === 'rolling' && !isMyTurn) {
    html += '<div class="king-waiting-text">' + escapeHTML(currentPlayer ? currentPlayer.name : '') + '이(가) 주사위를 굴리는 중...</div>';
  } else if (view.phase === 'scoring') {
    html += '<div class="king-scoring-text">📊 결산 중...</div>';
  } else if (view.phase === 'gameover') {
    // Show gameover
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
  html += '<div class="king-gameover-title">👑 킹스타그램 최종 순위</div>';

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
    html += '<div class="king-rank-number">' + r.rank + '위</div>';
    html += '<div class="king-rank-avatar" style="background:' + PLAYER_COLORS[pIdx >= 0 ? pIdx % PLAYER_COLORS.length : 0] + ';">' + r.avatar + '</div>';
    html += '<div class="king-rank-info">';
    html += '<div class="king-rank-name">' + escapeHTML(r.name) + (r.id === state.myId ? ' (나)' : '') + '</div>';
    html += '<div class="king-rank-detail">카드 ' + r.cardCount + '장</div>';
    html += '</div>';
    html += '<div class="king-rank-score">' + kingFormatTotal(r.totalFollowers) + '</div>';
    html += '</div>';
  }

  html += '<button class="king-close-btn" onclick="closeKingstagramGame()">로비로 돌아가기</button>';
  html += '</div></div>';

  // Record game (only once per game)
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
  var rankings = [];
  var sorted = view.players.slice().sort(function(a, b) {
    if (b.totalFollowers !== a.totalFollowers) return b.totalFollowers - a.totalFollowers;
    return b.cardCount - a.cardCount;
  });
  for (var i = 0; i < sorted.length; i++) {
    sorted[i]._rank = i + 1;
  }

  var html = '<div class="king-rankings-overlay" onclick="kingToggleRankings()">';
  html += '<div class="king-rankings-panel" onclick="event.stopPropagation()">';
  html += '<div class="king-rankings-title">🏆 현재 순위 (라운드 ' + view.round + '/' + view.maxRounds + ')</div>';

  for (var i2 = 0; i2 < sorted.length; i2++) {
    var p = sorted[i2];
    var pIdx = -1;
    for (var pi = 0; pi < view.players.length; pi++) {
      if (view.players[pi].id === p.id) { pIdx = pi; break; }
    }
    html += '<div class="king-ranking-row">';
    html += '<span class="king-ranking-pos">' + p._rank + '위</span>';
    html += '<span class="king-ranking-avatar" style="background:' + PLAYER_COLORS[pIdx >= 0 ? pIdx % PLAYER_COLORS.length : 0] + ';">' + p.avatar + '</span>';
    html += '<span class="king-ranking-name">' + escapeHTML(p.name) + (p.id === state.myId ? ' (나)' : '') + '</span>';
    html += '<span class="king-ranking-score">' + kingFormatTotal(p.totalFollowers) + '</span>';
    html += '</div>';
  }

  html += '<button class="king-close-overlay-btn" onclick="kingToggleRankings()">닫기</button>';
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
  title.textContent = '📊 라운드 결산';
  panel.appendChild(title);

  var landsContainer = document.createElement('div');
  landsContainer.className = 'king-scoring-lands';
  panel.appendChild(landsContainer);

  overlay.appendChild(panel);

  var gameScreen = document.getElementById('kingstagramGame');
  if (gameScreen) gameScreen.appendChild(overlay);

  // Reveal each land one by one
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
          awardsHtml = '<div class="king-scoring-empty">주사위 없음</div>';
        } else {
          for (var a = 0; a < result.awards.length; a++) {
            var award = result.awards[a];
            var cls = 'king-scoring-award';
            if (award.cancelled) cls += ' cancelled';
            if (award.isNeutral) cls += ' neutral';
            awardsHtml += '<div class="' + cls + '">';
            awardsHtml += '<span class="king-scoring-player">' + escapeHTML(award.playerName) + '</span>';
            if (award.cancelled) {
              awardsHtml += '<span class="king-scoring-result">동률 상쇄! ❌</span>';
            } else if (award.isNeutral) {
              awardsHtml += '<span class="king-scoring-result">중립 승리 → ' + kingFormatFollowers(award.card) + ' 폐기</span>';
            } else {
              awardsHtml += '<span class="king-scoring-result">→ ' + kingFormatFollowers(award.card) + ' 획득! ✅</span>';
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

  // Auto-close after all revealed
  var closeDelay = results.length * 800 + 1500;
  var tClose = setTimeout(function() {
    var el = document.getElementById('kingScoringOverlay');
    if (el) el.remove();
  }, closeDelay);
  _kingTimers.push(tClose);
}

// ===== CLIENT: GAME OVER =====
function kingShowGameOver(rankings) {
  // Already handled by renderKingView when phase === 'gameover'
}

// ===== CLEANUP =====
function closeKingstagramCleanup() {
  _kingTimers.forEach(function(t) { clearTimeout(t); });
  _kingTimers = [];
  _kingView = null;
  _kingSelectedNumber = null;
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
  } else if (msg.type === 'king-choose') {
    processKingChoose(peerId, msg.number);
  }
}
