// ===== YAHTZEE ENGINE =====

let yahState = {
  players: [],
  turnIdx: 0,
  dice: [0, 0, 0, 0, 0],
  held: [false, false, false, false, false],
  rollsLeft: 3,
  turnNum: 1,
  maxTurns: 13,
  selectedCategory: null,
  phase: 'rolling',
};

const YAHTZEE_CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'three-kind', 'four-kind', 'full-house', 'small-straight',
  'large-straight', 'yahtzee', 'chance'
];

// Lazy-load Three.js + yahtzee-three.js on first use
let _threeLoaded = false;
function loadYahtzeeThree() {
  if(_threeLoaded) return;
  _threeLoaded = true;
  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'js/yahtzee-three.js';
    s2.onerror = () => { _threeLoaded = false; };
    document.head.appendChild(s2);
  };
  s1.onerror = () => { _threeLoaded = false; };
  document.head.appendChild(s1);
}

function startYahtzee() {
  if(!state.isHost || state.players.length < 2) {
    showToast('\ucd5c\uc18c 2\uba85 \ud544\uc694');
    return;
  }
  loadYahtzeeThree();

  yahState = {
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      scores: {
        ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null,
        'three-kind': null, 'four-kind': null, 'full-house': null,
        'small-straight': null, 'large-straight': null, yahtzee: null, chance: null
      },
      total: 0
    })),
    turnIdx: 0,
    dice: [0, 0, 0, 0, 0],
    held: [false, false, false, false, false],
    rollsLeft: 3,
    turnNum: 1,
    maxTurns: 13,
    selectedCategory: null,
    phase: 'rolling'
  };

  broadcastYahtzeeState();
  showScreen('yahtzeeGame');
  broadcast({ type: 'game-start', game: 'yahtzee', state: createYahtzeeView() });
}

function yahRollDice() {
  if(yahState.rollsLeft <= 0) return;

  yahState.dice = yahState.dice.map((val, idx) =>
    yahState.held[idx] ? val : Math.floor(Math.random() * 6) + 1
  );

  yahState.rollsLeft--;
  yahState.phase = 'rolling';
  yahState.selectedCategory = null;
}

// Cup shake integration state
let cupShakeActive = false;
let cupTapCount = 0;
let _lastYahHeld = [false, false, false, false, false];
let _lastYahView = null;

// Called by yahtzee-three.js after Three.js finishes initializing
window.onYahtzeeThreeReady = function() {
  if(!_lastYahView) return;
  const view = _lastYahView;
  const currentPlayer = view.players[view.turnIdx];
  const isMyTurn = currentPlayer.id === state.myId;
  const isHumanTurn = !currentPlayer.id.startsWith('ai-');
  // Show cup only at start of turn (first roll)
  if(isMyTurn && isHumanTurn && view.rollsLeft === 3 && view.phase === 'rolling' && !cupShakeActive) {
    if(typeof showCupReady === 'function') {
      showCupReady(view.held);
    }
  }
  // Also update dice display
  if(typeof updateYahtzeeDice === 'function') {
    updateYahtzeeDice(view.dice, view.held, false);
  }
};

function vibrateOnTap(intensity) {
  if(navigator.vibrate) navigator.vibrate(Math.round(20 + intensity * 60));
}

function commitCupRoll() {
  cupShakeActive = false;
  cupTapCount = 0;
  const rollBtn = document.getElementById('yahtzeeRollBtn');
  if(rollBtn) { rollBtn.classList.remove('shaking'); }
  // Validate it's still our turn before committing
  if(!yahState || yahState.players[yahState.turnIdx].id !== state.myId || yahState.rollsLeft <= 0) {
    if(typeof hideCup === 'function') hideCup();
    return;
  }
  yahRollDice();
  broadcastYahtzeeState();
}

function commitCupRollNonHost() {
  cupShakeActive = false;
  cupTapCount = 0;
  const rollBtn = document.getElementById('yahtzeeRollBtn');
  if(rollBtn) { rollBtn.classList.remove('shaking'); }
  sendToHost({ type: 'yah-action', action: 'roll' });
}

function updateRollBtnShake() {
  const rollBtn = document.getElementById('yahtzeeRollBtn');
  if(!rollBtn) return;
  rollBtn.classList.add('shaking');
  rollBtn.disabled = false;
  if(cupTapCount >= 4) rollBtn.textContent = '\ucd5c\ub300 \ud30c\uc6cc!!';
  else if(cupTapCount >= 2) rollBtn.textContent = '\ub354 \uc138\uac8c!';
  else rollBtn.textContent = '\ud754\ub4dc\ub294 \uc911...';
}

function yahRoll() {
  // Non-host: local cup animation + send roll on dump
  if(!state.isHost) {
    const cupS = typeof getCupState === 'function' ? getCupState() : 'hidden';
    if(cupS === 'dumping') return;

    if(cupS === 'hidden' || cupS === 'ready') {
      if(typeof showCupReady === 'function' && cupS === 'hidden') {
        showCupReady(_lastYahHeld);
      }
      if(typeof startCupShake === 'function') {
        startCupShake(commitCupRollNonHost);
        cupShakeActive = true;
        cupTapCount = 1;
      }
    } else if(cupS === 'shaking') {
      if(typeof startCupShake === 'function') startCupShake();
      cupTapCount++;
    }
    vibrateOnTap(Math.min(cupTapCount * 0.2, 1.0));
    updateRollBtnShake();
    return;
  }

  // Host: check turn & rolls
  if(yahState.players[yahState.turnIdx].id !== state.myId) {
    showToast('\ub2f9\uc2e0\uc758 \ucc28\ub840\uac00 \uc544\ub2d9\ub2c8\ub2e4');
    return;
  }

  if(yahState.rollsLeft <= 0) {
    showToast('\ub354 \uc774\uc0c1 \uad74\ub9b4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4');
    return;
  }

  // Cup mechanic
  const cupS = typeof getCupState === 'function' ? getCupState() : 'hidden';
  if(cupS === 'dumping') return;

  if(cupS === 'hidden' || cupS === 'ready') {
    if(typeof showCupReady === 'function' && cupS === 'hidden') {
      showCupReady(yahState.held);
    }
    if(typeof startCupShake === 'function') {
      startCupShake(commitCupRoll);
      cupShakeActive = true;
      cupTapCount = 1;
    }
  } else if(cupS === 'shaking') {
    if(typeof startCupShake === 'function') startCupShake();
    cupTapCount++;
  }
  vibrateOnTap(Math.min(cupTapCount * 0.2, 1.0));
  updateRollBtnShake();
}

function yahToggleHold(idx) {
  if(!state.isHost) {
    sendToHost({ type: 'yah-action', action: 'hold', index: idx });
    return;
  }

  if(yahState.players[yahState.turnIdx].id !== state.myId) {
    return;
  }

  if(yahState.rollsLeft === 3) {
    showToast('\uba3c\uc800 \uc8fc\uc0ac\uc704\ub97c \uad74\ub9ac\uc138\uc694');
    return;
  }

  yahState.held[idx] = !yahState.held[idx];
  broadcastYahtzeeState();
}

function yahSelectCategory(cat) {
  if(!state.isHost) {
    sendToHost({ type: 'yah-action', action: 'select', category: cat });
    return;
  }

  if(yahState.players[yahState.turnIdx].id !== state.myId) {
    return;
  }

  const player = yahState.players[yahState.turnIdx];
  if(player.scores[cat] !== null) {
    showToast('\uc774\ubbf8 \uae30\ub85d\ub41c \uce74\ud14c\uace0\ub9ac\uc785\ub2c8\ub2e4');
    return;
  }

  yahState.selectedCategory = cat;
  yahState.phase = 'scoring';
  broadcastYahtzeeState();
}

function yahScore() {
  if(!state.isHost) {
    sendToHost({ type: 'yah-action', action: 'score' });
    return;
  }

  if(yahState.players[yahState.turnIdx].id !== state.myId) {
    return;
  }

  if(!yahState.selectedCategory) {
    showToast('\uce74\ud14c\uace0\ub9ac\ub97c \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  yahConfirmScore();
}

// Shared scoring logic — called by yahScore() (human) and aiYahtzee() (AI)
function yahConfirmScore() {
  if(!yahState || !yahState.selectedCategory) return;

  const player = yahState.players[yahState.turnIdx];
  const score = calcYahtzeeScore(yahState.dice, yahState.selectedCategory);
  player.scores[yahState.selectedCategory] = score;

  player.total = calculatePlayerTotal(player);

  const allFinished = yahState.players.every(p =>
    YAHTZEE_CATEGORIES.every(cat => p.scores[cat] !== null)
  );

  if(allFinished) {
    yahState.phase = 'gameover';
    broadcastYahtzeeState();
    handleYahtzeeGameOver();
    return;
  }

  yahState.turnIdx = (yahState.turnIdx + 1) % yahState.players.length;

  if(yahState.turnIdx === 0) {
    yahState.turnNum++;
  }

  yahState.dice = [0, 0, 0, 0, 0];
  yahState.held = [false, false, false, false, false];
  yahState.rollsLeft = 3;
  yahState.selectedCategory = null;
  yahState.phase = 'rolling';

  broadcastYahtzeeState();
}

function calculatePlayerTotal(player) {
  let total = 0;

  const upperCats = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
  let upperSum = 0;
  upperCats.forEach(cat => {
    if(player.scores[cat] !== null) {
      upperSum += player.scores[cat];
    }
  });

  let bonus = 0;
  if(upperSum >= 63) {
    bonus = 35;
  }

  total = upperSum + bonus;

  const lowerCats = ['three-kind', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'yahtzee', 'chance'];
  lowerCats.forEach(cat => {
    if(player.scores[cat] !== null) {
      total += player.scores[cat];
    }
  });

  return total;
}

function calcYahtzeeScore(dice, category) {
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
  const sorted = [...dice].sort((a, b) => a - b);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch(category) {
    case 'ones': return dice.filter(d => d === 1).length * 1;
    case 'twos': return dice.filter(d => d === 2).length * 2;
    case 'threes': return dice.filter(d => d === 3).length * 3;
    case 'fours': return dice.filter(d => d === 4).length * 4;
    case 'fives': return dice.filter(d => d === 5).length * 5;
    case 'sixes': return dice.filter(d => d === 6).length * 6;

    case 'three-kind':
      return Object.values(counts).some(c => c >= 3) ? sum : 0;

    case 'four-kind':
      return Object.values(counts).some(c => c >= 4) ? sum : 0;

    case 'full-house': {
      const vals = Object.values(counts).sort((a, b) => b - a);
      return (vals[0] === 3 && vals[1] === 2) ? 25 : 0;
    }

    case 'small-straight': {
      const unique = [...new Set(sorted)];
      const patterns = [[1,2,3,4], [2,3,4,5], [3,4,5,6]];
      return patterns.some(p => p.every(n => unique.includes(n))) ? 30 : 0;
    }

    case 'large-straight': {
      const str1 = [1,2,3,4,5];
      const str2 = [2,3,4,5,6];
      return (JSON.stringify(sorted) === JSON.stringify(str1) ||
              JSON.stringify(sorted) === JSON.stringify(str2)) ? 40 : 0;
    }

    case 'yahtzee':
      return Object.values(counts).some(c => c === 5) ? 50 : 0;

    case 'chance':
      return sum;

    default:
      return 0;
  }
}

function calcPossibleScores(dice) {
  const possible = {};
  YAHTZEE_CATEGORIES.forEach(cat => {
    possible[cat] = calcYahtzeeScore(dice, cat);
  });
  return possible;
}

function getYahtzeeComboName(dice) {
  if (dice.some(d => d === 0)) return '';
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
  const vals = Object.values(counts).sort((a, b) => b - a);
  const sorted = [...dice].sort((a, b) => a - b);

  if (vals[0] === 5) return 'YAHTZEE!';
  if (vals[0] === 4) return 'Four of a Kind';
  if (vals[0] === 3 && vals[1] === 2) return 'Full House';
  if (sorted.join('') === '12345' || sorted.join('') === '23456') return 'Large Straight';
  if (vals[0] === 3) return 'Three of a Kind';

  // small straight check
  const unique = [...new Set(sorted)];
  const uStr = unique.join('');
  if (uStr.includes('1234') || uStr.includes('2345') || uStr.includes('3456')) return 'Small Straight';

  if (vals[0] === 2 && vals[1] === 2) return 'Two Pair';
  if (vals[0] === 2) return 'One Pair';
  return 'Chance';
}

function broadcastYahtzeeState() {
  const view = createYahtzeeView();
  broadcast({ type: 'yah-state', state: view });
  renderYahtzeeView(view);
}

function createYahtzeeView() {
  return {
    players: yahState.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      scores: p.scores,
      total: p.total
    })),
    turnIdx: yahState.turnIdx,
    dice: yahState.dice,
    held: yahState.held,
    rollsLeft: yahState.rollsLeft,
    turnNum: yahState.turnNum,
    maxTurns: yahState.maxTurns,
    selectedCategory: yahState.selectedCategory,
    phase: yahState.phase
  };
}

let _prevRollsLeft = null;
let _prevTurnIdx = null;

function renderYahtzeeView(view) {
  loadYahtzeeThree();
  _lastYahView = view;
  document.getElementById('yahTurnText').textContent = '\ud134 ' + view.turnNum + '/' + view.maxTurns;
  const currentPlayer = view.players[view.turnIdx];
  document.getElementById('yahCurrentPlayer').textContent =
    currentPlayer.id === state.myId ? '\ub0b4 \ucc28\ub840!' : currentPlayer.name + '\uc758 \ucc28\ub840';
  document.getElementById('yahRollsLeft').textContent = view.rollsLeft + ' left';

  const playersBar = document.getElementById('yahtzeePlayersBar');
  playersBar.innerHTML = view.players.map((p, idx) =>
    '<div class="yahtzee-player-mini ' + (idx === view.turnIdx ? 'active' : '') + '">' +
      '<div class="yahtzee-player-mini-avatar" style="background:' + PLAYER_COLORS[idx % PLAYER_COLORS.length] + ';">' +
        p.avatar +
      '</div>' +
      '<div class="yahtzee-player-mini-name">' + escapeHTML(p.name) + '</div>' +
      '<div class="yahtzee-player-mini-score">' + p.total + '</div>' +
    '</div>'
  ).join('');

  // Save held state for non-host cup mechanic
  _lastYahHeld = [...view.held];

  // Detect if a roll just happened (rollsLeft decreased or new turn)
  const turnChanged = _prevTurnIdx !== null && _prevTurnIdx !== view.turnIdx;
  const isRolling = (_prevRollsLeft !== null && view.rollsLeft < _prevRollsLeft) || turnChanged;
  _prevRollsLeft = view.rollsLeft;
  _prevTurnIdx = view.turnIdx;

  const isMyTurn = currentPlayer.id === state.myId;
  const isHumanTurn = !currentPlayer.id.startsWith('ai-');

  // Cup management on turn change
  if(turnChanged) {
    if(typeof hideCup === 'function') hideCup();
    cupShakeActive = false;
    cupTapCount = 0;
  }

  // AI turn: hide cup, show dice normally
  if(!isHumanTurn) {
    if(typeof hideCup === 'function') hideCup();
    cupShakeActive = false;
  }

  // Show cup ready ONLY at start of turn (rollsLeft===3), not after every hold toggle
  // Subsequent rolls (rollsLeft 2,1) show cup only when user taps roll button via yahRoll()
  if(isMyTurn && isHumanTurn && view.rollsLeft === 3 && view.phase === 'rolling' && !cupShakeActive && turnChanged) {
    const cupS = typeof getCupState === 'function' ? getCupState() : 'hidden';
    if(cupS === 'hidden' && typeof showCupReady === 'function') {
      showCupReady(view.held);
    }
  }

  // Update Three.js dice (cup animation may intercept this)
  if(typeof updateYahtzeeDice === 'function') {
    updateYahtzeeDice(view.dice, view.held, isRolling);
  }

  // Update hold bar HTML
  const holdBar = document.getElementById('yahtzeeHoldBar');
  if(holdBar) {
    holdBar.innerHTML = '';
    view.held.forEach((isHeld, idx) => {
      if(isHeld) {
        const val = view.dice[idx];
        const div = document.createElement('div');
        div.className = 'yahtzee-held-die';
        div.setAttribute('data-val', val);
        div.onclick = () => yahToggleHold(idx);
        for(let p = 0; p < val; p++) {
          const pip = document.createElement('div');
          pip.className = 'held-pip';
          div.appendChild(pip);
        }
        holdBar.appendChild(div);
      }
    });
  }

  // Combo label update
  const comboLabel = document.getElementById('yahtzeeComboLabel');
  if(comboLabel) {
    if(view.rollsLeft === 3) {
      // New turn — hide combo label
      comboLabel.classList.remove('visible');
      comboLabel.textContent = '';
    } else if(isRolling) {
      comboLabel.classList.remove('visible');
      setTimeout(() => {
        comboLabel.textContent = getYahtzeeComboName(view.dice);
        if(comboLabel.textContent) comboLabel.classList.add('visible');
      }, 900);
    } else {
      comboLabel.textContent = getYahtzeeComboName(view.dice);
      if(comboLabel.textContent) comboLabel.classList.add('visible');
    }
  }

  // Roll button state
  const rollBtn = document.getElementById('yahtzeeRollBtn');
  if(cupShakeActive) {
    // Don't override button during cup shake (yahRoll sets it)
  } else {
    rollBtn.classList.remove('shaking');
    rollBtn.textContent = '\ud83c\udfb2 \uad74\ub9ac\uae30 (' + view.rollsLeft + '\ud68c)';
    rollBtn.disabled = !isMyTurn || view.rollsLeft <= 0 || view.phase === 'gameover';
  }

  // Rolls indicator pips
  const rollsInd = document.getElementById('yahtzeeRollsIndicator');
  if(rollsInd) {
    const pips = rollsInd.querySelectorAll('.roll-pip');
    const used = 3 - view.rollsLeft;
    pips.forEach((pip, i) => {
      pip.className = 'roll-pip' + (i < used ? ' used' : ' active');
    });
  }

  // Dynamic multi-player scorecard
  renderYahtzeeScorecard(view, isMyTurn);

  const scoreBtn = document.getElementById('yahtzeeScoreBtn');
  scoreBtn.style.display = (isMyTurn && view.selectedCategory && view.phase === 'scoring') ? 'block' : 'none';

  if(view.phase === 'gameover') {
    showYahtzeeGameOver(view);
  }
}

const YAH_CATS_UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const YAH_CATS_LOWER = ['three-kind', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'yahtzee', 'chance'];
const YAH_CAT_LABELS = {
  ones: '1s', twos: '2s', threes: '3s', fours: '4s', fives: '5s', sixes: '6s',
  'three-kind': '3Kind', 'four-kind': '4Kind', 'full-house': 'F.House',
  'small-straight': 'S.Str', 'large-straight': 'L.Str', yahtzee: 'Yahtzee!', chance: 'Chance'
};

function renderYahtzeeScorecard(view, isMyTurn) {
  const container = document.getElementById('yahtzeeScorecard');
  if(!container) return;

  const players = view.players;
  const myPlayer = players.find(p => p.id === state.myId);
  const possible = myPlayer ? calcPossibleScores(view.dice) : {};
  const pCount = players.length;

  // Build table HTML
  let html = '<table class="yahtzee-score-table"><thead><tr><th></th>';
  players.forEach((p, idx) => {
    const isMe = p.id === state.myId;
    const isTurn = idx === view.turnIdx;
    const cls = (isMe ? ' ysc-me' : '') + (isTurn ? ' ysc-turn' : '');
    const name = isMe ? 'ME' : escapeHTML(p.name.slice(0, 4));
    html += '<th class="ysc-player' + cls + '">' + name + '</th>';
  });
  html += '</tr></thead><tbody>';

  // Score rows helper
  const renderCatRows = (cats) => {
    cats.forEach(cat => {
      const rowCls = myPlayer && myPlayer.scores[cat] === null && isMyTurn && view.rollsLeft < 3
        ? (view.selectedCategory === cat ? 'yahtzee-score-row selected' : 'yahtzee-score-row preview')
        : (myPlayer && myPlayer.scores[cat] !== null ? 'yahtzee-score-row filled' : 'yahtzee-score-row');
      const available = myPlayer && myPlayer.scores[cat] === null && isMyTurn && view.rollsLeft < 3 && possible[cat] > 0;
      html += '<tr class="' + rowCls + (available ? ' available' : '') + '" data-cat="' + cat + '">';
      html += '<td class="yahtzee-cat-name">' + YAH_CAT_LABELS[cat] + '</td>';
      players.forEach(p => {
        const isMe = p.id === state.myId;
        let val = '-';
        let cls = 'ysc-cell';
        if(p.scores[cat] !== null) {
          val = p.scores[cat];
          cls += ' ysc-filled';
        } else if(isMe && isMyTurn && view.rollsLeft < 3) {
          val = possible[cat] || 0;
          cls += ' ysc-preview';
          if(view.selectedCategory === cat) cls += ' ysc-selected';
        }
        html += '<td class="' + cls + '">' + val + '</td>';
      });
      html += '</tr>';
    });
  };

  renderCatRows(YAH_CATS_UPPER);

  // Upper subtotal + bonus
  html += '<tr class="yahtzee-subtotal-row"><td>합계</td>';
  players.forEach(p => {
    let sum = 0;
    YAH_CATS_UPPER.forEach(c => { if(p.scores[c] !== null) sum += p.scores[c]; });
    html += '<td class="ysc-cell">' + sum + '</td>';
  });
  html += '</tr>';

  html += '<tr class="yahtzee-bonus-row"><td>+35</td>';
  players.forEach(p => {
    let sum = 0;
    YAH_CATS_UPPER.forEach(c => { if(p.scores[c] !== null) sum += p.scores[c]; });
    html += '<td class="ysc-cell">' + (sum >= 63 ? 35 : 0) + '</td>';
  });
  html += '</tr>';

  html += '<tr class="yahtzee-divider-row"><td colspan="' + (1 + pCount) + '"></td></tr>';

  renderCatRows(YAH_CATS_LOWER);

  // Total
  html += '<tr class="yahtzee-total-row"><td><strong>TOTAL</strong></td>';
  players.forEach(p => {
    const isMe = p.id === state.myId;
    html += '<td class="ysc-cell' + (isMe ? ' ysc-me' : '') + '"><strong>' + p.total + '</strong></td>';
  });
  html += '</tr></tbody></table>';

  container.innerHTML = html;

  // Attach click handlers to my scorable rows
  if(myPlayer && isMyTurn && view.rollsLeft < 3) {
    [...YAH_CATS_UPPER, ...YAH_CATS_LOWER].forEach(cat => {
      if(myPlayer.scores[cat] === null) {
        const row = container.querySelector('.yahtzee-score-row[data-cat="' + cat + '"]');
        if(row) row.onclick = () => yahSelectCategory(cat);
      }
    });
  }
}

function showYahtzeeGameOver(view) {
  const gameOverDiv = document.getElementById('yahtzeeGameOver');
  const rankings = document.getElementById('yahtzeeRankings');

  const sorted = [...view.players].sort((a, b) => b.total - a.total);

  rankings.innerHTML = sorted.map((p, idx) => {
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : '';
    const pIdx = view.players.findIndex(pp => pp.id === p.id);

    return '<div class="yahtzee-rank-item ' + rankClass + '">' +
      '<div class="yahtzee-rank-number">' + rank + '\uc704</div>' +
      '<div class="yahtzee-rank-avatar" style="background:' + PLAYER_COLORS[pIdx % PLAYER_COLORS.length] + ';">' +
        p.avatar +
      '</div>' +
      '<div class="yahtzee-rank-info">' +
        '<div class="yahtzee-rank-name">' + escapeHTML(p.name) + (p.id === state.myId ? ' (나)' : '') + '</div>' +
      '</div>' +
      '<div class="yahtzee-rank-score">' + p.total + '\uc810</div>' +
    '</div>';
  }).join('');

  gameOverDiv.style.display = 'flex';

  const winner = sorted[0];
  const won = winner.id === state.myId;
  recordGame(won);
}

function handleYahtzeeGameOver() {
  const view = createYahtzeeView();
  broadcast({ type: 'yah-state', state: view });
  showYahtzeeGameOver(view);
}

function closeYahtzeeGame() {
  document.getElementById('yahtzeeGameOver').style.display = 'none';
  returnToLobby();
}

function handleYahAction(peerId, msg) {
  if(!state.isHost) return;
  if(yahState.players[yahState.turnIdx].id !== peerId) return;

  if(msg.action === 'roll') {
    if(yahState.rollsLeft > 0) { yahRollDice(); broadcastYahtzeeState(); }
  } else if(msg.action === 'hold') {
    const idx = msg.index;
    if(typeof idx !== 'number' || idx < 0 || idx > 4) return;
    if(yahState.rollsLeft < 3) { yahState.held[idx] = !yahState.held[idx]; broadcastYahtzeeState(); }
  } else if(msg.action === 'select') {
    if(!YAHTZEE_CATEGORIES.includes(msg.category)) return;
    const player = yahState.players[yahState.turnIdx];
    if(player.scores[msg.category] === null) { yahState.selectedCategory = msg.category; yahState.phase = 'scoring'; broadcastYahtzeeState(); }
  } else if(msg.action === 'score') {
    yahConfirmScore();
  }
}

