// =======================================
// ===== POKER ENGINE (Host-side) =====
// =======================================
function createDeck() {
  const deck = [];
  for(const s of SUITS) for(const r of RANKS) deck.push({ rank: r, suit: s });
  for(let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function startPoker() {
  _pkCardsHidden = false; // reset card flip state on new round
  const deck = createDeck();
  const n = state.players.length;
  const prevChips = state.poker?.players;
  
  const ps = {
    deck, deckIdx: 0,
    players: state.players.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar,
      cards: [], chips: prevChips ? (prevChips.find(pp => pp.id === p.id)?.chips ?? 1000) : 1000,
      bet: 0, totalBet: 0, folded: false, allIn: false, seatIdx: i, acted: false,
    })),
    community: [], pot: 0, currentBet: 0, minRaise: 20,
    phase: 'preflop', turnIdx: 0,
    dealerIdx: state.poker ? (state.poker.dealerIdx + 1) % n : 0,
    sb: 10, bb: 20,
  };
  
  // Bankruptcy: fold players with 0 chips
  ps.players.forEach(p => { if (p.chips <= 0) p.folded = true; });
  const activePlayers = ps.players.filter(p => !p.folded);
  if (activePlayers.length < 2) {
    // Not enough active players — declare winner
    const winner = ps.players.reduce((a, b) => a.chips >= b.chips ? a : b);
    const result = {
      type: 'poker-result',
      winnerId: winner.id, winnerName: winner.name, winnerAvatar: winner.avatar,
      winnerCards: [], handName: '최후의 생존자',
      pot: 0,
    };
    state.poker = ps;
    broadcast(result); handlePokerResult(result);
    return;
  }

  // Deal
  for(let i = 0; i < n; i++) ps.players[i].cards = [deck[ps.deckIdx++], deck[ps.deckIdx++]];

  // Blinds (heads-up: dealer=SB, opponent=BB)
  const sbI = n === 2 ? ps.dealerIdx : (ps.dealerIdx + 1) % n;
  const bbI = n === 2 ? (ps.dealerIdx + 1) % n : (ps.dealerIdx + 2) % n;
  
  const sbAmt = Math.min(ps.sb, ps.players[sbI].chips);
  ps.players[sbI].bet = sbAmt;
  ps.players[sbI].totalBet = sbAmt;
  ps.players[sbI].chips -= sbAmt;
  
  const bbAmt = Math.min(ps.bb, ps.players[bbI].chips);
  ps.players[bbI].bet = bbAmt;
  ps.players[bbI].totalBet = bbAmt;
  ps.players[bbI].chips -= bbAmt;
  
  ps.pot = sbAmt + bbAmt;
  ps.currentBet = bbAmt;
  ps.minRaise = ps.bb;
  ps.turnIdx = (bbI + 1) % n;
  
  // Skip folded/allin for turnIdx
  ps.turnIdx = findNextActive(ps, ps.turnIdx);
  
  state.poker = ps;
  broadcastPokerState();
  showScreen('pokerGame');
}

function findNextActive(ps, from) {
  let idx = from;
  for(let i = 0; i < ps.players.length; i++) {
    const p = ps.players[idx];
    if(!p.folded && !p.allIn && p.chips > 0) return idx;
    idx = (idx + 1) % ps.players.length;
  }
  return -1; // no active player found
}

function broadcastPokerState() {
  const ps = state.poker;
  ps.players.forEach(p => {
    const view = {
      type: 'poker-state',
      players: ps.players.map(pp => ({
        id: pp.id, name: pp.name, avatar: pp.avatar,
        chips: pp.chips, bet: pp.bet, totalBet: pp.totalBet,
        folded: pp.folded, allIn: pp.allIn, seatIdx: pp.seatIdx,
        cards: pp.id === p.id ? pp.cards : (ps.phase === 'showdown' && !pp.folded ? pp.cards : null)
      })),
      community: ps.community, pot: ps.pot, currentBet: ps.currentBet,
      minRaise: ps.minRaise, phase: ps.phase, turnIdx: ps.turnIdx,
    };
    if(p.id === state.myId) renderPokerView(view);
    else sendTo(p.id, view);
  });
}

function renderPokerView(ps) {
  state._pokerView = ps;
  window._lastPokerView = ps;
  const me = ps.players.find(p => p.id === state.myId);
  const isMyTurn = ps.players[ps.turnIdx]?.id === state.myId && ps.phase !== 'showdown';

  // Opponents - compact row
  const opArea = document.getElementById('opponentsArea');
  const ops = ps.players.filter(p => p.id !== state.myId);
  opArea.innerHTML = ops.map(p => {
    const isTurn = ps.players[ps.turnIdx]?.id === p.id && ps.phase !== 'showdown';
    const ci = ps.players.findIndex(pp => pp.id === p.id);
    const cardsHtml = p.cards
      ? p.cards.map(c => pkOppCardHTML(c)).join('')
      : '<div class="pk-opp-card pk-card-back"><div class="pk-opp-card-pattern"></div></div><div class="pk-opp-card pk-card-back"><div class="pk-opp-card-pattern"></div></div>';
    const betStr = p.bet > 0 ? `<span class="pk-opp-bet">${p.bet}</span>` : (p.folded ? '<span class="pk-opp-bet">폴드</span>' : '');
    return `<div class="pk-opp-slot ${p.folded ? 'fold-overlay' : ''}">
      <div class="pk-opp-avatar ${isTurn ? 'active-turn' : ''}" style="background:${PLAYER_COLORS[ci % PLAYER_COLORS.length]};">${p.avatar}</div>
      <span class="pk-opp-label">${escapeHTML(p.name)}</span>
      <span class="pk-opp-chips">${p.chips}</span>${betStr}
      <div class="pk-opp-cards">${cardsHtml}</div>
    </div>`;
  }).join('');

  // Community cards
  const cc = document.getElementById('communityCards');
  let cHTML = '';
  for(let i = 0; i < 5; i++) {
    cHTML += i < ps.community.length ? pkCommCardHTML(ps.community[i]) : '<div class="pk-comm-placeholder"></div>';
  }
  cc.innerHTML = cHTML;

  // My cards - hero size
  const mc = document.getElementById('myCardsDisplay');
  mc.innerHTML = me?.cards
    ? me.cards.map(c => pkHeroCardHTML(c)).join('')
    : '<div class="pk-hero-card pk-card-back"><div class="pk-hero-back-pattern"></div></div><div class="pk-hero-card pk-card-back"><div class="pk-hero-back-pattern"></div></div>';

  document.getElementById('myChipsDisplay').textContent = (me?.chips || 0).toLocaleString();
  document.getElementById('potAmount').textContent = ps.pot.toLocaleString();

  // Always hide raise area on state update (reset raise UI)
  document.getElementById('raiseSliderArea').classList.remove('visible');
  document.getElementById('actionBar').style.display = '';

  const phaseNames = { preflop:'프리플랍', flop:'플랍', turn:'턴', river:'리버', showdown:'쇼다운' };
  document.getElementById('roundDisplay').textContent = phaseNames[ps.phase] || ps.phase;

  // Hand rank
  if(me?.cards && ps.community.length > 0) {
    document.getElementById('handRankDisplay').textContent = evaluateHandName([...me.cards, ...ps.community]);
  } else {
    document.getElementById('handRankDisplay').textContent = '';
  }

  // Actions
  const btns = document.getElementById('actionBar').querySelectorAll('.pk-action-btn');
  const ccb = document.getElementById('checkCallBtn');

  if(!isMyTurn || me?.folded || me?.allIn) {
    btns.forEach(b => b.disabled = true);
  } else {
    btns.forEach(b => b.disabled = false);
    const toCall = ps.currentBet - (me?.bet || 0);
    if(toCall > 0) {
      ccb.textContent = `콜 ${Math.min(toCall, me.chips)}`;
      ccb.className = 'pk-action-btn pk-btn-call';
      ccb.onclick = () => pokerAction('call');
    } else {
      ccb.textContent = '체크';
      ccb.className = 'pk-action-btn pk-btn-check';
      ccb.onclick = () => pokerAction('check');
    }
    const slider = document.getElementById('raiseSlider');
    const minR = ps.currentBet + ps.minRaise;
    slider.min = minR;
    slider.max = me.chips + me.bet;
    slider.value = minR;
    document.getElementById('raiseAmountDisplay').textContent = minR;
  }
}

/* Hero card (my hand) — large detailed card, tap to flip */
var _pkCardsHidden = false;
function pkHeroCardHTML(c) {
  if(!c) return '<div class="pk-hero-card pk-card-back"><div class="pk-hero-back-pattern"></div></div>';
  const cls = (c.suit === '♥' || c.suit === '♦') ? 'pk-red' : 'pk-black';
  // During showdown, always show cards regardless of hidden state
  const isShowdown = window._lastPokerView && window._lastPokerView.phase === 'showdown';
  if(_pkCardsHidden && !isShowdown) {
    return `<div class="pk-hero-card pk-card-back" onclick="pkToggleCards()" style="cursor:pointer;"><div class="pk-hero-back-pattern"></div></div>`;
  }
  return `<div class="pk-hero-card ${cls}" onclick="pkToggleCards()" style="cursor:pointer;">
    <div class="pk-hero-inner">
      <div class="pk-hero-corner"><span class="pk-hero-rank">${c.rank}</span><span class="pk-hero-suit-sm">${c.suit}</span></div>
      <div class="pk-hero-center">${c.suit}</div>
      <div class="pk-hero-corner pk-corner-bottom"><span class="pk-hero-rank">${c.rank}</span><span class="pk-hero-suit-sm">${c.suit}</span></div>
    </div>
  </div>`;
}
function pkToggleCards() {
  _pkCardsHidden = !_pkCardsHidden;
  if(window._lastPokerView) renderPokerView(window._lastPokerView);
}

/* Community card — medium */
function pkCommCardHTML(c) {
  if(!c) return '<div class="pk-comm-card pk-card-back"><div class="pk-opp-card-pattern"></div></div>';
  const cls = (c.suit === '♥' || c.suit === '♦') ? 'pk-red' : 'pk-black';
  return `<div class="pk-comm-card pk-card-face ${cls}"><span class="pk-comm-rank">${c.rank}</span><span class="pk-comm-suit">${c.suit}</span></div>`;
}

/* Opponent card — small */
function pkOppCardHTML(c) {
  if(!c) return '<div class="pk-opp-card pk-card-back"><div class="pk-opp-card-pattern"></div></div>';
  const cls = (c.suit === '♥' || c.suit === '♦') ? 'pk-red' : 'pk-black';
  return `<div class="pk-opp-card pk-card-face ${cls}"><span class="pk-small-rank">${c.rank}</span><span class="pk-small-suit">${c.suit}</span></div>`;
}

/* Keep old cardHTML for result overlay */
function cardHTML(c) {
  if(!c) return '<div class="pk-hero-card pk-card-back"><div class="pk-hero-back-pattern"></div></div>';
  const cls = (c.suit === '♥' || c.suit === '♦') ? 'pk-red' : 'pk-black';
  return `<div class="pk-hero-card ${cls}" style="width:60px;height:86px;">
    <div class="pk-hero-inner">
      <div class="pk-hero-corner"><span class="pk-hero-rank" style="font-size:16px;">${c.rank}</span><span class="pk-hero-suit-sm" style="font-size:11px;">${c.suit}</span></div>
      <div class="pk-hero-center" style="font-size:28px;">${c.suit}</div>
      <div class="pk-hero-corner pk-corner-bottom"><span class="pk-hero-rank" style="font-size:16px;">${c.rank}</span><span class="pk-hero-suit-sm" style="font-size:11px;">${c.suit}</span></div>
    </div>
  </div>`;
}

function pokerAction(action) {
  document.getElementById('raiseSliderArea').classList.remove('visible');
  document.getElementById('actionBar').style.display = '';
  if(state.isHost) processPokerAction(state.myId, action);
  else sendToHost({ type: 'poker-action', action });
}

function showRaiseSlider() {
  document.getElementById('actionBar').style.display = 'none';
  document.getElementById('raiseSliderArea').classList.add('visible');
}

function cancelRaise() {
  document.getElementById('raiseSliderArea').classList.remove('visible');
  document.getElementById('actionBar').style.display = '';
}

document.getElementById('raiseSlider').addEventListener('input', e => {
  document.getElementById('raiseAmountDisplay').textContent = e.target.value;
});

function confirmRaise() {
  const amt = parseInt(document.getElementById('raiseSlider').value);
  document.getElementById('raiseSliderArea').classList.remove('visible');
  document.getElementById('actionBar').style.display = '';
  if(state.isHost) processPokerAction(state.myId, 'raise', amt);
  else sendToHost({ type: 'poker-action', action: 'raise', amount: amt });
}

function processPokerAction(playerId, action, amount) {
  const ps = state.poker;
  if(!ps || ps.phase === 'showdown') return;
  
  const pIdx = ps.players.findIndex(p => p.id === playerId);
  if(pIdx !== ps.turnIdx) return;
  
  const player = ps.players[pIdx];
  if(player.folded || player.allIn) return;
  
  const toCall = ps.currentBet - player.bet;
  
  switch(action) {
    case 'fold': player.folded = true; break;
    case 'check': if(toCall > 0) return; break;
    case 'call': {
      const a = Math.min(toCall, player.chips);
      player.chips -= a; player.bet += a; player.totalBet += a; ps.pot += a;
      if(player.chips === 0) player.allIn = true;
      break;
    }
    case 'raise': {
      if(typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return;
      const total = amount || (ps.currentBet + ps.minRaise);
      const minRequired = ps.currentBet + ps.minRaise;
      // Must meet minimum raise unless going all-in
      if(total < minRequired && (total - player.bet) < player.chips) return;
      const a = total - player.bet;
      if(a <= 0 || a > player.chips) return;
      player.chips -= a; player.bet += a; player.totalBet += a; ps.pot += a;
      ps.minRaise = total - ps.currentBet; ps.currentBet = player.bet;
      if(player.chips === 0) player.allIn = true;
      // Reset acted flags for others (they need to respond to raise)
      ps.players.forEach((p, i) => { if(i !== pIdx && !p.folded && !p.allIn) p.acted = false; });
      break;
    }
    case 'allin': {
      const a = player.chips;
      player.bet += a; player.totalBet += a; ps.pot += a; player.chips = 0; player.allIn = true;
      if(player.bet > ps.currentBet) {
        ps.minRaise = player.bet - ps.currentBet; ps.currentBet = player.bet;
        ps.players.forEach((p, i) => { if(i !== pIdx && !p.folded && !p.allIn) p.acted = false; });
      }
      break;
    }
  }
  
  player.acted = true;
  
  // Only one left?
  const active = ps.players.filter(p => !p.folded);
  if(active.length === 1) { active[0].chips += ps.pot; endPokerHand(active[0], ps.pot); return; }
  
  // Check if betting round complete
  const canAct = ps.players.filter(p => !p.folded && !p.allIn);
  const allActed = canAct.every(p => p.acted && p.bet === ps.currentBet);
  
  if(canAct.length === 0 || allActed) {
    advancePokerPhase();
    return;
  }
  
  // Next player
  const nextIdx = findNextActive(ps, (ps.turnIdx + 1) % ps.players.length);
  if(nextIdx === -1) { advancePokerPhase(); return; }
  ps.turnIdx = nextIdx;
  broadcastPokerState();
}

function advancePokerPhase() {
  const ps = state.poker;
  
  ps.players.forEach(p => { p.bet = 0; p.acted = false; });
  ps.currentBet = 0;
  const nextIdx = findNextActive(ps, (ps.dealerIdx + 1) % ps.players.length);
  ps.turnIdx = nextIdx === -1 ? 0 : nextIdx;
  
  switch(ps.phase) {
    case 'preflop':
      ps.phase = 'flop';
      ps.deckIdx++;
      ps.community.push(ps.deck[ps.deckIdx++], ps.deck[ps.deckIdx++], ps.deck[ps.deckIdx++]);
      break;
    case 'flop':
      ps.phase = 'turn';
      ps.deckIdx++;
      ps.community.push(ps.deck[ps.deckIdx++]);
      break;
    case 'turn':
      ps.phase = 'river';
      ps.deckIdx++;
      ps.community.push(ps.deck[ps.deckIdx++]);
      break;
    case 'river':
      ps.phase = 'showdown';
      resolveShowdown();
      return;
  }
  
  const canAct = ps.players.filter(p => !p.folded && !p.allIn);
  if(canAct.length <= 1) {
    broadcastPokerState();
    setTimeout(() => advancePokerPhase(), 800);
    return;
  }
  
  broadcastPokerState();
}

function resolveShowdown() {
  const ps = state.poker;
  const active = ps.players.filter(p => !p.folded);

  // Evaluate all hands
  active.forEach(p => {
    p._score = evaluateHand([...p.cards, ...ps.community]);
    p._handName = evaluateHandName([...p.cards, ...ps.community]);
  });

  // Build side pots based on totalBet amounts
  const sidePots = buildSidePots(ps);

  // Distribute each pot to the best hand(s) among eligible players
  const potWon = {};
  let totalDistributed = 0;
  for(const sp of sidePots) {
    const eligible = sp.eligible.filter(p => !p.folded);
    if(eligible.length === 0) continue;
    let best = -1;
    eligible.forEach(p => { if(p._score > best) best = p._score; });
    const winners = eligible.filter(p => p._score === best);
    const share = Math.floor(sp.amount / winners.length);
    const remainder = sp.amount % winners.length;
    winners.forEach((w, i) => {
      const amt = share + (i === 0 ? remainder : 0);
      w.chips += amt;
      potWon[w.id] = (potWon[w.id] || 0) + amt;
    });
    totalDistributed += sp.amount;
  }

  // Find overall display winner (most chips won)
  let displayWinner = active[0];
  let maxWon = 0;
  active.forEach(p => {
    if((potWon[p.id] || 0) > maxWon) { maxWon = potWon[p.id]; displayWinner = p; }
  });

  endPokerHand(displayWinner, totalDistributed);
}

function buildSidePots(ps) {
  const active = ps.players.filter(p => !p.folded || p.totalBet > 0);
  const betLevels = [...new Set(active.map(p => p.totalBet))].sort((a,b) => a - b);
  const pots = [];
  let prevLevel = 0;

  for(const level of betLevels) {
    if(level <= prevLevel) continue;
    let potAmount = 0;
    const eligible = [];
    ps.players.forEach(p => {
      const contribution = Math.min(p.totalBet, level) - Math.min(p.totalBet, prevLevel);
      if(contribution > 0) potAmount += contribution;
      if(!p.folded && p.totalBet >= level) eligible.push(p);
    });
    if(potAmount > 0) pots.push({ amount: potAmount, eligible });
    prevLevel = level;
  }

  return pots;
}

function endPokerHand(winner, potAmount) {
  const ps = state.poker;

  const result = {
    type: 'poker-result',
    winnerId: winner.id, winnerName: winner.name, winnerAvatar: winner.avatar,
    winnerCards: winner.cards, handName: winner._handName || '최후의 1인',
    pot: potAmount != null ? potAmount : ps.pot,
  };

  ps.phase = 'showdown';
  broadcastPokerState();
  setTimeout(() => { broadcast(result); handlePokerResult(result); }, 1200);
}

function handlePokerResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won, won ? msg.pot : 5);
  
  document.getElementById('resultTitle').textContent = won ? '🏆 승리!' : '😢 패배...';
  document.getElementById('resultTitle').style.color = won ? 'var(--gold)' : 'var(--text-dim)';
  document.getElementById('winnerName').textContent = msg.winnerName + ' ' + msg.winnerAvatar;
  document.getElementById('resultHand').textContent = msg.handName;
  document.getElementById('resultPot').textContent = '💰 ' + msg.pot;
  document.getElementById('resultCards').innerHTML = msg.winnerCards ? msg.winnerCards.map(c => cardHTML(c)).join('') : '';
  document.getElementById('resultOverlay').classList.add('active');
}

function closeResult() {
  document.getElementById('resultOverlay').classList.remove('active');
  if(state.isHost) {
    const g = state.selectedGame;
    if (g === 'poker') setTimeout(() => startPoker(), 300);
    else if (g === 'roulette') setTimeout(() => startRussianRoulette(), 300);
    else if (g === 'ecard') setTimeout(() => startECard(), 300);
    else returnToLobby();
  }
}

// ===== HAND EVALUATION =====
function cardValue(r) {
  return {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14}[r]||0;
}

function evaluateHand(cards) {
  if(!cards || cards.length < 5) return 0;
  let best = 0;
  for(const combo of getCombos(cards, 5)) {
    const s = scoreHand(combo);
    if(s > best) best = s;
  }
  return best;
}

function evaluateHandName(cards) {
  if(!cards || cards.length < 5) return '';
  let best = 0, bestH = null;
  for(const combo of getCombos(cards, 5)) {
    const s = scoreHand(combo);
    if(s > best) { best = s; bestH = combo; }
  }
  const cat = Math.floor(best / 1000000);
  return ['','하이카드','원페어','투페어','쓰리카드','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시','로얄 플러시'][cat] || '';
}

function scoreHand(hand) {
  const vals = hand.map(c => cardValue(c.rank)).sort((a,b) => b - a);
  const suits = hand.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const unique = [...new Set(vals)].sort((a,b) => b - a);
  let isStraight = false;
  let isLowStraight = false;

  if(unique.length === 5) {
    if(unique[0] - unique[4] === 4) isStraight = true;
    if(unique[0] === 14 && unique[1] === 5) { isStraight = true; isLowStraight = true; }
  }

  const counts = {};
  vals.forEach(v => counts[v] = (counts[v]||0)+1);
  let groups = Object.entries(counts).sort((a,b) => b[1]-a[1] || parseInt(b[0])-parseInt(a[0]));
  const pattern = groups.map(g => g[1]).join('');

  // A-low straight: remap A(14) to 1 for correct sub-score
  if(isLowStraight) {
    const lowCounts = {};
    [5,4,3,2,1].forEach(v => lowCounts[v] = 1);
    groups = Object.entries(lowCounts).sort((a,b) => b[1]-a[1] || parseInt(b[0])-parseInt(a[0]));
  }

  let cat = 1;
  if(isStraight && isFlush && vals[0] === 14 && vals[1] === 13) cat = 10; // Royal (A-K-Q-J-10)
  else if(isStraight && isFlush) cat = 9;
  else if(pattern === '41') cat = 8;
  else if(pattern === '32') cat = 7;
  else if(isFlush) cat = 6;
  else if(isStraight) cat = 5;
  else if(pattern === '311') cat = 4;
  else if(pattern === '221') cat = 3;
  else if(pattern === '2111') cat = 2;
  
  let sub = 0;
  groups.forEach((g, i) => sub += parseInt(g[0]) * Math.pow(15, 4-i));
  return cat * 1000000 + sub;
}

function getCombos(arr, k) {
  if(k === 0) return [[]];
  if(!arr.length) return [];
  const [first, ...rest] = arr;
  return [...getCombos(rest, k-1).map(c => [first,...c]), ...getCombos(rest, k)];
}

