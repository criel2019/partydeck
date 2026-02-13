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
  const deck = createDeck();
  const n = state.players.length;
  const prevChips = state.poker?.players;
  
  const ps = {
    deck, deckIdx: 0,
    players: state.players.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar,
      cards: [], chips: prevChips ? (prevChips.find(pp => pp.id === p.id)?.chips || 1000) : 1000,
      bet: 0, totalBet: 0, folded: false, allIn: false, seatIdx: i, acted: false,
    })),
    community: [], pot: 0, currentBet: 0, minRaise: 20,
    phase: 'preflop', turnIdx: 0,
    dealerIdx: state.poker ? (state.poker.dealerIdx + 1) % n : 0,
    sb: 10, bb: 20,
  };
  
  // Deal
  for(let i = 0; i < n; i++) ps.players[i].cards = [deck[ps.deckIdx++], deck[ps.deckIdx++]];
  
  // Blinds
  const sbI = (ps.dealerIdx + 1) % n;
  const bbI = (ps.dealerIdx + 2) % n;
  
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
  return from;
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
      <span class="pk-opp-label">${p.name}</span>
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

/* Hero card (my hand) — large detailed card */
function pkHeroCardHTML(c) {
  if(!c) return '<div class="pk-hero-card pk-card-back"><div class="pk-hero-back-pattern"></div></div>';
  const cls = (c.suit === '♥' || c.suit === '♦') ? 'pk-red' : 'pk-black';
  return `<div class="pk-hero-card ${cls}">
    <div class="pk-hero-inner">
      <div class="pk-hero-corner"><span class="pk-hero-rank">${c.rank}</span><span class="pk-hero-suit-sm">${c.suit}</span></div>
      <div class="pk-hero-center">${c.suit}</div>
      <div class="pk-hero-corner pk-corner-bottom"><span class="pk-hero-rank">${c.rank}</span><span class="pk-hero-suit-sm">${c.suit}</span></div>
    </div>
  </div>`;
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
  if(state.isHost) processPokerAction(state.myId, action);
  else {
    const host = Object.values(state.connections)[0];
    if(host?.open) host.send(JSON.stringify({ type: 'poker-action', action }));
  }
}

function showRaiseSlider() { document.getElementById('raiseSliderArea').classList.toggle('visible'); }

document.getElementById('raiseSlider').addEventListener('input', e => {
  document.getElementById('raiseAmountDisplay').textContent = e.target.value;
});

function confirmRaise() {
  const amt = parseInt(document.getElementById('raiseSlider').value);
  document.getElementById('raiseSliderArea').classList.remove('visible');
  if(state.isHost) processPokerAction(state.myId, 'raise', amt);
  else {
    const host = Object.values(state.connections)[0];
    if(host?.open) host.send(JSON.stringify({ type: 'poker-action', action: 'raise', amount: amt }));
  }
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
      const total = amount || (ps.currentBet + ps.minRaise);
      const a = total - player.bet;
      if(a > player.chips) return;
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
  if(active.length === 1) { endPokerHand(active[0]); return; }
  
  // Check if betting round complete
  const canAct = ps.players.filter(p => !p.folded && !p.allIn);
  const allActed = canAct.every(p => p.acted && p.bet === ps.currentBet);
  
  if(canAct.length === 0 || allActed) {
    advancePokerPhase();
    return;
  }
  
  // Next player
  ps.turnIdx = findNextActive(ps, (ps.turnIdx + 1) % ps.players.length);
  broadcastPokerState();
}

function advancePokerPhase() {
  const ps = state.poker;
  
  ps.players.forEach(p => { p.bet = 0; p.acted = false; });
  ps.currentBet = 0;
  ps.turnIdx = findNextActive(ps, (ps.dealerIdx + 1) % ps.players.length);
  
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
  
  let best = -1, winner = null;
  active.forEach(p => {
    const s = evaluateHand([...p.cards, ...ps.community]);
    p._score = s;
    p._handName = evaluateHandName([...p.cards, ...ps.community]);
    if(s > best) { best = s; winner = p; }
  });
  
  if(winner) endPokerHand(winner);
}

function endPokerHand(winner) {
  const ps = state.poker;
  winner.chips += ps.pot;
  
  const result = {
    type: 'poker-result',
    winnerId: winner.id, winnerName: winner.name, winnerAvatar: winner.avatar,
    winnerCards: winner.cards, handName: winner._handName || '최후의 1인', pot: ps.pot,
  };
  
  ps.phase = 'showdown';
  broadcastPokerState();
  setTimeout(() => { broadcast(result); handlePokerResult(result); }, 1200);
}

function handlePokerResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won);
  
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
  if(state.isHost) setTimeout(() => startPoker(), 300);
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
  
  if(unique.length === 5) {
    if(unique[0] - unique[4] === 4) isStraight = true;
    if(unique[0] === 14 && unique[1] === 5) isStraight = true;
  }
  
  const counts = {};
  vals.forEach(v => counts[v] = (counts[v]||0)+1);
  const groups = Object.entries(counts).sort((a,b) => b[1]-a[1] || parseInt(b[0])-parseInt(a[0]));
  const pattern = groups.map(g => g[1]).join('');
  
  let cat = 1;
  if(isStraight && isFlush && vals[0] === 14) cat = 10; // Royal
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

// ====================================================================
// ===== MAFIA FULL VERSION ENGINE ====================================
// ====================================================================

/*
 * Replaces the basic startMafia() with a complete 11-role implementation.
 *
 * ROLES:
 *  마피아팀: mafia (x2), spy
 *  시민팀:   police, doctor, reporter, undertaker, detective,
 *            senator, soldier, lover (x2), baeksu (unemployed), citizen
 *
 * Architecture:
 *  - Host-authoritative: all game state lives on host
 *  - Host sends each player a personalized "view" object
 *  - Clients render purely from their view
 *  - Night actions collected from all players, resolved simultaneously on host
 *
 * Message types used:
 *  Host -> Client:  { type: 'mf-state', ...viewData }
 *  Host -> Client:  { type: 'mf-result', winner, message }
 *  Client -> Host:  { type: 'mf-action', action, targetId, extra }
 *  Client -> Host:  { type: 'mf-vote', targetId }
 *  Client -> Host:  { type: 'mf-chat', text }
 *  Client -> Host:  { type: 'mf-extend' }
 *  Client -> Host:  { type: 'mf-skip-vote' }
 */

// ========================= CONSTANTS =========================

const MF_ROLES = {
  mafia:      { emoji: '🔪', name: '마피아',   team: 'mafia',   desc: '밤에 팀원과 상의하여 1명을 제거하세요' },
  spy:        { emoji: '🕵️', name: '스파이',   team: 'mafia',   desc: '밤마다 마피아를 1명 찾을 수 있습니다' },
  police:     { emoji: '🔍', name: '경찰',     team: 'citizen', desc: '밤마다 1명이 마피아인지 조사합니다' },
  doctor:     { emoji: '💊', name: '의사',     team: 'citizen', desc: '밤마다 1명을 치료하여 마피아 공격을 막습니다' },
  reporter:   { emoji: '📰', name: '기자',     team: 'citizen', desc: '밤마다 1명이 스파이인지 조사합니다' },
  undertaker: { emoji: '⚰️', name: '장의사',   team: 'citizen', desc: '밤에 죽은 시체가 마피아인지 시민인지 확인합니다' },
  detective:  { emoji: '🔎', name: '탐정',     team: 'citizen', desc: '시민이 죽으면 그 시민을 죽인 마피아를 알 수 있습니다' },
  senator:    { emoji: '🏛️', name: '국회의원', team: 'citizen', desc: '투표로 처형당하지 않습니다' },
  soldier:    { emoji: '🛡️', name: '군인',     team: 'citizen', desc: '마피아 일반 공격을 1회 막을 수 있습니다 (저격은 즉사)' },
  lover:      { emoji: '💕', name: '연인',     team: 'citizen', desc: '서로 연인이 누구인지 알고 시작합니다' },
  baeksu:     { emoji: '😴', name: '백수',     team: 'citizen', desc: '4번째 사망 시, 첫 사망자의 직업을 이어받습니다' },
  citizen:    { emoji: '👤', name: '시민',     team: 'citizen', desc: '마피아를 찾아 투표하세요' },
};

const MF_PHASE_LABELS = {
  'role-reveal': { icon: '🎭', text: '역할 배분', cls: 'night' },
  'night':       { icon: '🌙', text: '밤',       cls: 'night' },
  'day-announce': { icon: '☀️', text: '아침 발표', cls: 'day' },
  'day-discuss':  { icon: '☀️', text: '토론',     cls: 'day' },
  'day-vote':     { icon: '🗳️', text: '투표',     cls: 'vote' },
  'vote-result':  { icon: '⚖️', text: '처형 결과', cls: 'vote' },
  'result':       { icon: '🏆', text: '게임 종료', cls: 'result' },
};

const MF_NIGHT_DURATION = 30;
const MF_DISCUSS_DURATION = 180;
const MF_VOTE_DURATION = 30;
const MF_ANNOUNCE_DURATION = 8;
const MF_REVEAL_DURATION = 8;
const MF_VOTE_RESULT_DURATION = 6;

// ========================= HOST STATE =========================

let mfState = null;    // host-only full state
let mfView = null;     // local player's current view
let mfTimer = null;    // interval id
let mfSelectedTarget = null;
let mfUseSnipe = false;

// ========================= ROLE ASSIGNMENT ====================

function mfAssignRoles(playerCount) {
  // Role distribution based on player count
  const roles = [];

  if (playerCount <= 5) {
    // Minimum: 1 mafia, doctor, police, citizens
    roles.push('mafia', 'doctor', 'police');
    while (roles.length < playerCount) roles.push('citizen');
  } else if (playerCount <= 7) {
    // 6-7 players: 2 mafia, doctor, police, citizens
    roles.push('mafia', 'mafia', 'doctor', 'police');
    while (roles.length < playerCount) roles.push('citizen');
  } else if (playerCount <= 9) {
    // 8-9 players: 2 mafia, spy, doctor, police, reporter, citizens
    roles.push('mafia', 'mafia', 'spy', 'doctor', 'police', 'reporter');
    while (roles.length < playerCount) roles.push('citizen');
  } else if (playerCount <= 10) {
    // 10 players: core + senator, soldier
    roles.push('mafia', 'mafia', 'spy', 'doctor', 'police', 'reporter',
               'senator', 'soldier');
    while (roles.length < playerCount) roles.push('citizen');
  } else {
    // 11+ players: full role set
    roles.push('mafia', 'mafia', 'spy',
               'police', 'doctor', 'reporter', 'undertaker', 'detective',
               'senator', 'soldier');
    // Add lovers if 11+
    if (playerCount >= 11) {
      roles.push('lover', 'lover');
    }
    // Add baeksu if 13+
    if (playerCount >= 13) {
      roles.push('baeksu');
    }
    // Fill remainder with citizens
    while (roles.length < playerCount) roles.push('citizen');
  }

  // Shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

// ========================= START GAME =========================

function startMafia() {
  if (!state.isHost) return;
  const n = state.players.length;
  if (n < 4) {
    showToast('마피아는 최소 4명이 필요합니다');
    return;
  }

  const roles = mfAssignRoles(n);

  // Find lover partner IDs
  const loverIndices = [];
  roles.forEach((r, i) => { if (r === 'lover') loverIndices.push(i); });

  mfState = {
    phase: 'role-reveal',
    round: 1,
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.isHost || false,
      role: roles[i],             // original assigned role
      activeRole: roles[i],       // can change for baeksu
      alive: true,
      lives: roles[i] === 'soldier' ? 2 : 1,
      snipesLeft: roles[i] === 'mafia' ? 1 : 0,
      // Spy tracking
      spyFoundMafia: false,
      // Baeksu tracking
      baeksuInherited: false,
      // Senator immunity revealed
      senatorRevealed: false,
      // Lover partner
      loverPartnerId: null,
    })),
    // Night action collection
    nightActions: {},
    // Who killed whom (for detective tracking)
    killLog: [],     // { victimId, killerId, method:'kill'|'snipe', round }
    // Death order for baeksu mechanic
    deathOrder: [],  // ordered list of player IDs who died
    // Mafia team chat
    chatMessages: [], // { sender, senderName, text, round }
    // Spy's discovered info
    spyKnownRoles: {},  // { deadPlayerId: roleLabel }
    // Votes
    votes: {},          // { voterId: targetId | 'skip' }
    // Extension tracking
    extensionUsed: {},  // { playerId: true } per day
    extensionAdded: false,
    // Timer
    timer: MF_REVEAL_DURATION,
    // Announcement messages for day phase
    announcements: [],
    // For 6-player rule: first night doctor-only scan
    sixPlayerFirstNight: (n === 6),
  };

  // Assign lover partners
  if (loverIndices.length === 2) {
    const p0 = mfState.players[loverIndices[0]];
    const p1 = mfState.players[loverIndices[1]];
    p0.loverPartnerId = p1.id;
    p1.loverPartnerId = p0.id;
  }

  mfBroadcastState();
  showScreen('mafiaGame');
  mfStartTimer();
}

// ========================= TIMER ==============================

function mfStartTimer() {
  clearInterval(mfTimer);
  mfTimer = setInterval(() => {
    if (!mfState) return;
    mfState.timer--;

    // Update local display
    const timerEl = document.getElementById('mfTimer');
    if (timerEl) timerEl.textContent = mfState.timer;

    if (mfState.timer <= 0) {
      clearInterval(mfTimer);
      if (state.isHost) mfAdvancePhase();
    }
  }, 1000);
}

function mfSetPhaseTimer(duration) {
  mfState.timer = duration;
  mfStartTimer();
}

// ========================= PHASE ADVANCEMENT ==================

function mfAdvancePhase() {
  if (!state.isHost || !mfState) return;

  const phase = mfState.phase;

  if (phase === 'role-reveal') {
    // Move to first night
    mfState.phase = 'night';
    mfState.nightActions = {};
    mfSetPhaseTimer(MF_NIGHT_DURATION);

    // For 6-player variant: first night only doctor scans
    // (handled in night action validation)
  }
  else if (phase === 'night') {
    mfResolveNight();
  }
  else if (phase === 'day-announce') {
    mfState.phase = 'day-discuss';
    mfState.votes = {};
    mfState.extensionUsed = {};
    mfState.extensionAdded = false;
    mfSetPhaseTimer(MF_DISCUSS_DURATION);
  }
  else if (phase === 'day-discuss') {
    mfState.phase = 'day-vote';
    mfState.votes = {};
    mfSetPhaseTimer(MF_VOTE_DURATION);
  }
  else if (phase === 'day-vote') {
    mfResolveVote();
  }
  else if (phase === 'vote-result') {
    // Check win condition
    if (mfCheckWin()) return;
    // Go to night
    mfState.phase = 'night';
    mfState.round++;
    mfState.nightActions = {};
    mfState.announcements = [];
    mfSetPhaseTimer(MF_NIGHT_DURATION);
  }

  mfBroadcastState();
}

// ========================= NIGHT RESOLUTION ===================

function mfResolveNight() {
  const ms = mfState;
  const actions = ms.nightActions;
  const announcements = [];

  // --- Collect mafia team actions ---
  // Find mafia kill action (only 1 mafia acts per night for kill/snipe)
  let killTargetId = null;
  let killerId = null;
  let isSnipe = false;

  // Iterate mafia actions
  const mafiaPlayers = ms.players.filter(p => p.activeRole === 'mafia' && p.alive);
  for (const mp of mafiaPlayers) {
    const act = actions[mp.id];
    if (act && act.action === 'kill') {
      killTargetId = act.targetId;
      killerId = mp.id;
      isSnipe = false;
      break;
    }
    if (act && act.action === 'snipe') {
      killTargetId = act.targetId;
      killerId = mp.id;
      isSnipe = true;
      break;
    }
  }

  // --- Doctor heal target ---
  const doctorPlayer = ms.players.find(p => p.activeRole === 'doctor' && p.alive);
  let healTargetId = null;
  if (doctorPlayer && actions[doctorPlayer.id]) {
    healTargetId = actions[doctorPlayer.id].targetId;
  }

  // --- Detective tracking target ---
  const detectivePlayer = ms.players.find(p => p.activeRole === 'detective' && p.alive);
  let detectiveTargetId = null;
  if (detectivePlayer && actions[detectivePlayer.id]) {
    detectiveTargetId = actions[detectivePlayer.id].targetId;
  }

  // --- Police investigation ---
  const policePlayer = ms.players.find(p => p.activeRole === 'police' && p.alive);
  let policeTargetId = null;
  let policeResult = null;
  if (policePlayer && actions[policePlayer.id]) {
    policeTargetId = actions[policePlayer.id].targetId;
    const target = ms.players.find(p => p.id === policeTargetId);
    if (target) {
      const isMafia = (target.activeRole === 'mafia');
      policeResult = { targetId: policeTargetId, targetName: target.name, isMafia };
    }
  }

  // --- Reporter investigation (looking for spy) ---
  const reporterPlayer = ms.players.find(p => p.activeRole === 'reporter' && p.alive);
  let reporterTargetId = null;
  let reporterResult = null;
  if (reporterPlayer && actions[reporterPlayer.id]) {
    reporterTargetId = actions[reporterPlayer.id].targetId;
    const target = ms.players.find(p => p.id === reporterTargetId);
    if (target) {
      const isSpy = (target.activeRole === 'spy');
      reporterResult = { targetId: reporterTargetId, targetName: target.name, isSpy };
    }
  }

  // --- Spy investigation (looking for mafia) ---
  const spyPlayer = ms.players.find(p => p.activeRole === 'spy' && p.alive);
  let spyTargetId = null;
  let spyResult = null;
  if (spyPlayer && actions[spyPlayer.id]) {
    spyTargetId = actions[spyPlayer.id].targetId;
    const target = ms.players.find(p => p.id === spyTargetId);
    if (target) {
      const isMafia = (target.activeRole === 'mafia');
      if (isMafia) {
        spyPlayer.spyFoundMafia = true;
      }
      spyResult = { targetId: spyTargetId, targetName: target.name, isMafia };
    }
  }

  // --- Undertaker target (check corpse from last night/vote death) ---
  const undertakerPlayer = ms.players.find(p => p.activeRole === 'undertaker' && p.alive);
  let undertakerTargetId = null;
  let undertakerResult = null;
  if (undertakerPlayer && actions[undertakerPlayer.id]) {
    undertakerTargetId = actions[undertakerPlayer.id].targetId;
    const target = ms.players.find(p => p.id === undertakerTargetId);
    if (target && !target.alive) {
      // Spy shows as citizen
      const showTeam = (target.activeRole === 'mafia') ? '마피아' : '시민';
      undertakerResult = { targetId: undertakerTargetId, targetName: target.name, team: showTeam };
    }
  }

  // =========================
  // RESOLVE KILL
  // =========================
  let killedPlayer = null;
  let killBlocked = false;
  let deathMessage = '';

  if (killTargetId) {
    const victim = ms.players.find(p => p.id === killTargetId);
    if (victim && victim.alive) {
      if (isSnipe) {
        // Snipe bypasses doctor, soldier, detective
        victim.alive = false;
        victim.lives = 0;
        killedPlayer = victim;
        deathMessage = 'snipe';

        // Deduct snipe from killer
        const killer = ms.players.find(p => p.id === killerId);
        if (killer) killer.snipesLeft = Math.max(0, killer.snipesLeft - 1);

        // Log kill
        ms.killLog.push({ victimId: victim.id, killerId, method: 'snipe', round: ms.round });
        ms.deathOrder.push(victim.id);

        announcements.push({
          type: 'snipe',
          icon: '🎯',
          text: `${victim.name}님이 저격당했습니다!`
        });
      } else {
        // Normal kill - check doctor heal and soldier
        if (healTargetId === killTargetId) {
          // Doctor saved
          killBlocked = true;
          announcements.push({
            type: 'safe',
            icon: '🌙',
            text: '밤에 아무 일도 일어나지 않았습니다.'
          });
        } else if (victim.activeRole === 'soldier' && victim.lives > 1) {
          // Soldier survives
          victim.lives--;
          killBlocked = true;
          announcements.push({
            type: 'safe',
            icon: '🌙',
            text: '밤에 아무 일도 일어나지 않았습니다.'
          });
        } else {
          // Victim dies
          victim.alive = false;
          victim.lives = 0;
          killedPlayer = victim;
          deathMessage = 'kill';

          ms.killLog.push({ victimId: victim.id, killerId, method: 'kill', round: ms.round });
          ms.deathOrder.push(victim.id);

          announcements.push({
            type: 'death',
            icon: '💀',
            text: `${victim.name}님이 마피아에게 살해당했습니다.`
          });
        }
      }
    }
  } else {
    // No mafia action
    announcements.push({
      type: 'safe',
      icon: '🌙',
      text: '평화로운 밤이었습니다.'
    });
  }

  // --- Detective result (only if a citizen was killed by normal kill) ---
  let detectiveResult = null;
  if (detectivePlayer && detectivePlayer.alive && detectiveTargetId && killedPlayer) {
    // Detective was tracking the killed person
    if (detectiveTargetId === killedPlayer.id && deathMessage === 'kill') {
      const killerP = ms.players.find(p => p.id === killerId);
      if (killerP) {
        detectiveResult = { victimName: killedPlayer.name, killerName: killerP.name, killerId };
      }
    }
    // Note: snipe bypasses detective
  }

  // --- Spy: update dead player roles knowledge ---
  if (spyPlayer && spyPlayer.alive) {
    ms.players.forEach(p => {
      if (!p.alive && !ms.spyKnownRoles[p.id]) {
        // Spy can see dead player's role
        ms.spyKnownRoles[p.id] = MF_ROLES[p.activeRole]?.name || '시민';
      }
    });
  }

  // --- Baeksu mechanic: 4th death triggers inheritance ---
  if (ms.deathOrder.length >= 4) {
    const baeksuPlayer = ms.players.find(p => p.activeRole === 'baeksu' && p.alive && !p.baeksuInherited);
    if (baeksuPlayer) {
      let inheritFrom = null;
      // First death's role
      const firstDead = ms.players.find(p => p.id === ms.deathOrder[0]);
      if (firstDead) {
        const firstRole = firstDead.activeRole;
        const firstTeam = MF_ROLES[firstRole]?.team;
        if (firstTeam === 'mafia') {
          // If first dead was mafia team, inherit next citizen's role
          for (let i = 1; i < ms.deathOrder.length; i++) {
            const dp = ms.players.find(p => p.id === ms.deathOrder[i]);
            if (dp && MF_ROLES[dp.activeRole]?.team === 'citizen') {
              inheritFrom = dp;
              break;
            }
          }
        } else {
          inheritFrom = firstDead;
        }
      }

      if (inheritFrom) {
        baeksuPlayer.activeRole = inheritFrom.activeRole;
        baeksuPlayer.baeksuInherited = true;
        // Copy special attributes
        if (inheritFrom.activeRole === 'soldier') {
          baeksuPlayer.lives = 2;
        }
      }
    }
  }

  // Store announcements
  ms.announcements = announcements;

  // Store personal results for this night
  ms._nightResults = {
    policeResult,
    reporterResult,
    spyResult,
    detectiveResult,
    undertakerResult,
    killedPlayer,
    deathMessage,
  };

  // Check win
  if (mfCheckWin()) return;

  // Move to day announce
  ms.phase = 'day-announce';
  mfSetPhaseTimer(MF_ANNOUNCE_DURATION);
  mfBroadcastState();
}

// ========================= VOTE RESOLUTION ====================

function mfResolveVote() {
  const ms = mfState;
  const votes = ms.votes;

  // Count votes
  const counts = {};
  let skipCount = 0;
  Object.values(votes).forEach(v => {
    if (v === 'skip') { skipCount++; return; }
    counts[v] = (counts[v] || 0) + 1;
  });

  // Find highest vote
  let maxVotes = 0;
  let candidates = [];
  Object.entries(counts).forEach(([pid, c]) => {
    if (c > maxVotes) {
      maxVotes = c;
      candidates = [pid];
    } else if (c === maxVotes) {
      candidates.push(pid);
    }
  });

  const announcements = [];

  if (candidates.length === 1 && maxVotes > skipCount) {
    const targetId = candidates[0];
    const target = ms.players.find(p => p.id === targetId);

    if (target) {
      // Check senator immunity
      if (target.activeRole === 'senator' && !target.senatorRevealed) {
        target.senatorRevealed = true;
        announcements.push({
          type: 'immunity',
          icon: '🏛️',
          text: `${target.name}님은 국회의원입니다! 투표로 처형할 수 없습니다.`
        });
      } else {
        // Execute
        target.alive = false;
        target.lives = 0;
        ms.deathOrder.push(target.id);

        const roleName = MF_ROLES[target.activeRole]?.name || '시민';
        const teamLabel = MF_ROLES[target.activeRole]?.team === 'mafia' ? '마피아팀' : '시민팀';

        announcements.push({
          type: 'vote-result',
          icon: '⚖️',
          text: `${target.name}님이 처형되었습니다. 정체: ${roleName} (${teamLabel})`
        });

        // Check baeksu inheritance
        if (ms.deathOrder.length >= 4) {
          const baeksu = ms.players.find(p => p.activeRole === 'baeksu' && p.alive && !p.baeksuInherited);
          if (baeksu) {
            const firstDead = ms.players.find(p => p.id === ms.deathOrder[0]);
            if (firstDead) {
              const firstTeam = MF_ROLES[firstDead.activeRole]?.team;
              let inheritFrom = null;
              if (firstTeam === 'mafia') {
                for (let i = 1; i < ms.deathOrder.length; i++) {
                  const dp = ms.players.find(p => p.id === ms.deathOrder[i]);
                  if (dp && MF_ROLES[dp.activeRole]?.team === 'citizen') {
                    inheritFrom = dp;
                    break;
                  }
                }
              } else {
                inheritFrom = firstDead;
              }
              if (inheritFrom) {
                baeksu.activeRole = inheritFrom.activeRole;
                baeksu.baeksuInherited = true;
                if (inheritFrom.activeRole === 'soldier') baeksu.lives = 2;
              }
            }
          }
        }
      }
    }
  } else if (candidates.length > 1) {
    announcements.push({
      type: 'safe',
      icon: '⚖️',
      text: '투표가 동률입니다. 아무도 처형되지 않았습니다.'
    });
  } else {
    announcements.push({
      type: 'safe',
      icon: '⚖️',
      text: '과반수 건너뛰기로 아무도 처형되지 않았습니다.'
    });
  }

  ms.announcements = announcements;
  ms._nightResults = null;
  ms.votes = {};

  // Check win
  if (mfCheckWin()) return;

  ms.phase = 'vote-result';
  mfSetPhaseTimer(MF_VOTE_RESULT_DURATION);
  mfBroadcastState();
}

// ========================= WIN CHECK ==========================

function mfCheckWin() {
  const ms = mfState;
  const alive = ms.players.filter(p => p.alive);
  const mafiaAlive = alive.filter(p => MF_ROLES[p.activeRole]?.team === 'mafia').length;
  const citizenAlive = alive.filter(p => MF_ROLES[p.activeRole]?.team !== 'mafia').length;

  let winner = null;
  let message = '';

  if (mafiaAlive === 0) {
    winner = 'citizen';
    message = '시민 팀 승리! 모든 마피아가 제거되었습니다.';
  } else if (mafiaAlive >= citizenAlive) {
    winner = 'mafia';
    message = '마피아 팀 승리! 마피아가 도시를 장악했습니다.';
  }

  if (winner) {
    ms.phase = 'result';
    clearInterval(mfTimer);
    mfBroadcastState();

    const result = { type: 'mf-result', winner, message };
    broadcast(result);
    mfHandleResult(result);
    return true;
  }
  return false;
}

// ========================= STATE BROADCAST ====================

function mfBroadcastState() {
  if (!mfState) return;
  const ms = mfState;

  ms.players.forEach(p => {
    const view = mfBuildView(p.id);
    if (p.id === state.myId) {
      mfView = view;
      mfRenderView();
    } else {
      sendTo(p.id, { type: 'mf-state', ...view });
    }
  });
}

function mfBuildView(playerId) {
  const ms = mfState;
  const me = ms.players.find(p => p.id === playerId);
  if (!me) return {};

  const myRole = me.activeRole;
  const myTeam = MF_ROLES[myRole]?.team || 'citizen';
  const isAlive = me.alive;
  const results = ms._nightResults || {};

  // Build player list with visibility rules
  const playersView = ms.players.map(p => {
    const pv = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      alive: p.alive,
      isHost: p.isHost,
      isMe: p.id === playerId,
      role: null,           // hidden by default
      roleEmoji: null,
      roleName: null,
      showLoverHeart: false,
      showSoldierShield: false,
      showSnipeUsed: false,
      voteCount: 0,
    };

    // Self always sees own role
    if (p.id === playerId) {
      pv.role = p.activeRole;
      pv.roleEmoji = MF_ROLES[p.activeRole]?.emoji;
      pv.roleName = MF_ROLES[p.activeRole]?.name;
    }

    // Mafia can see other mafia
    if (myRole === 'mafia' && p.activeRole === 'mafia' && p.id !== playerId) {
      pv.role = 'mafia';
      pv.roleEmoji = '🔪';
      pv.roleName = '마피아';
    }

    // Spy who found mafia can see mafia
    if (myRole === 'spy' && me.spyFoundMafia && p.activeRole === 'mafia') {
      pv.role = 'mafia';
      pv.roleEmoji = '🔪';
      pv.roleName = '마피아';
    }

    // Lover sees partner
    if (myRole === 'lover' && me.loverPartnerId === p.id) {
      pv.showLoverHeart = true;
    }

    // Result phase: show all roles
    if (ms.phase === 'result') {
      pv.role = p.activeRole;
      pv.roleEmoji = MF_ROLES[p.activeRole]?.emoji;
      pv.roleName = MF_ROLES[p.activeRole]?.name;
    }

    // Dead player role reveal (public)
    if (!p.alive && ms.phase !== 'night' && ms.phase !== 'role-reveal') {
      pv.role = p.activeRole;
      pv.roleEmoji = MF_ROLES[p.activeRole]?.emoji;
      pv.roleName = MF_ROLES[p.activeRole]?.name;
    }

    // Soldier shield indicator (only for self or result)
    if (p.activeRole === 'soldier' && p.lives > 1 && (p.id === playerId || ms.phase === 'result')) {
      pv.showSoldierShield = true;
    }

    // Vote counts
    if (ms.phase === 'day-vote' || ms.phase === 'vote-result') {
      let vc = 0;
      Object.values(ms.votes).forEach(v => { if (v === p.id) vc++; });
      pv.voteCount = vc;
    }

    return pv;
  });

  // Build personal notifications
  const personalEvents = [];

  // Police result
  if (results.policeResult && playerId === (ms.players.find(p => p.activeRole === 'police' && p.alive)?.id)) {
    const r = results.policeResult;
    personalEvents.push({
      type: 'info',
      icon: '🔍',
      text: `${r.targetName}님은 ${r.isMafia ? '마피아입니다!' : '마피아가 아닙니다.'}`
    });
  }

  // Reporter result
  if (results.reporterResult && playerId === (ms.players.find(p => p.activeRole === 'reporter' && p.alive)?.id)) {
    const r = results.reporterResult;
    personalEvents.push({
      type: 'info',
      icon: '📰',
      text: `${r.targetName}님은 ${r.isSpy ? '스파이입니다!' : '스파이가 아닙니다.'}`
    });
  }

  // Spy result
  if (results.spyResult && playerId === (ms.players.find(p => p.activeRole === 'spy' && p.alive)?.id)) {
    const r = results.spyResult;
    personalEvents.push({
      type: 'info',
      icon: '🕵️',
      text: `${r.targetName}님은 ${r.isMafia ? '마피아입니다! 이제 마피아와 대화할 수 있습니다.' : '마피아가 아닙니다.'}`
    });
  }

  // Detective result
  if (results.detectiveResult && playerId === (ms.players.find(p => p.activeRole === 'detective' && p.alive)?.id)) {
    const r = results.detectiveResult;
    personalEvents.push({
      type: 'info',
      icon: '🔎',
      text: `${r.victimName}님을 죽인 마피아는 ${r.killerName}님입니다!`
    });
  }

  // Undertaker result
  if (results.undertakerResult && playerId === (ms.players.find(p => p.activeRole === 'undertaker' && p.alive)?.id)) {
    const r = results.undertakerResult;
    personalEvents.push({
      type: 'info',
      icon: '⚰️',
      text: `${r.targetName}님의 시체를 확인: ${r.team}입니다.`
    });
  }

  // Baeksu inheritance notification
  const mePlayer = ms.players.find(p => p.id === playerId);
  if (mePlayer && mePlayer.role === 'baeksu' && mePlayer.baeksuInherited) {
    const newRoleName = MF_ROLES[mePlayer.activeRole]?.name || '시민';
    personalEvents.push({
      type: 'info',
      icon: '😴',
      text: `백수 능력 발동! 이제 당신의 역할은 "${newRoleName}"입니다.`
    });
  }

  // Can this player chat with mafia team?
  const canChat = (myRole === 'mafia') ||
                  (myRole === 'spy' && me.spyFoundMafia);

  // What chat messages to show
  const chatView = canChat ? ms.chatMessages : [];

  // Spy dead role info
  const spyDeadRoles = (myRole === 'spy') ? ms.spyKnownRoles : {};

  // Determine what night action this player can take
  let nightAction = null;
  if (ms.phase === 'night' && isAlive) {
    // 6-player first night: only doctor scans
    const isFirstNight = ms.round === 1;
    const sixPlayerRestrict = ms.sixPlayerFirstNight && isFirstNight;

    if (myRole === 'mafia' && !sixPlayerRestrict) {
      nightAction = { type: 'mafia', canSnipe: me.snipesLeft > 0, label: '제거할 대상 선택' };
    } else if (myRole === 'spy') {
      nightAction = { type: 'spy', label: '마피아로 의심되는 대상 선택' };
    } else if (myRole === 'police' && !sixPlayerRestrict) {
      nightAction = { type: 'police', label: '조사할 대상 선택' };
    } else if (myRole === 'doctor') {
      nightAction = { type: 'doctor', label: '치료할 대상 선택' };
    } else if (myRole === 'reporter' && !sixPlayerRestrict) {
      nightAction = { type: 'reporter', label: '스파이 의심 대상 선택' };
    } else if (myRole === 'undertaker') {
      nightAction = { type: 'undertaker', label: '확인할 시체 선택' };
    } else if (myRole === 'detective' && !sixPlayerRestrict) {
      nightAction = { type: 'detective', label: '추적할 대상 선택' };
    }
  }

  // Did this player already submit night action?
  const nightActionDone = ms.nightActions[playerId] !== undefined;

  // My snipes remaining
  const mySnipesLeft = me.snipesLeft;

  // Lover partner info
  let loverPartnerName = null;
  if (myRole === 'lover' && me.loverPartnerId) {
    const partner = ms.players.find(p => p.id === me.loverPartnerId);
    if (partner) loverPartnerName = partner.name;
  }

  return {
    phase: ms.phase,
    round: ms.round,
    timer: ms.timer,
    players: playersView,
    myId: playerId,
    myRole: myRole,
    myOriginalRole: me.role,
    myTeam: myTeam,
    isAlive: isAlive,
    announcements: ms.announcements || [],
    personalEvents,
    nightAction,
    nightActionDone,
    canChat,
    chatMessages: chatView,
    spyDeadRoles,
    votes: ms.votes,
    mySnipesLeft,
    loverPartnerName,
    sixPlayerFirstNight: ms.sixPlayerFirstNight && ms.round === 1,
  };
}

// ========================= HOST: PROCESS ACTIONS ==============

function mfProcessAction(senderId, data) {
  if (!state.isHost || !mfState) return;
  const ms = mfState;

  if (data.action === 'night-action') {
    if (ms.phase !== 'night') return;
    const player = ms.players.find(p => p.id === senderId && p.alive);
    if (!player) return;

    ms.nightActions[senderId] = {
      action: data.nightAction,   // 'kill', 'snipe', 'heal', 'investigate', etc.
      targetId: data.targetId,
    };

    // Check if all required night actions are submitted
    if (mfAllNightActionsDone()) {
      clearInterval(mfTimer);
      // Small delay to let last player see confirmation
      setTimeout(() => mfAdvancePhase(), 500);
    } else {
      // Send updated state to show action was received
      mfBroadcastState();
    }
  }
  else if (data.action === 'vote') {
    if (ms.phase !== 'day-vote') return;
    const player = ms.players.find(p => p.id === senderId && p.alive);
    if (!player) return;

    ms.votes[senderId] = data.targetId; // targetId or 'skip'

    // Check if all alive players voted
    const aliveCount = ms.players.filter(p => p.alive).length;
    if (Object.keys(ms.votes).length >= aliveCount) {
      clearInterval(mfTimer);
      setTimeout(() => mfAdvancePhase(), 500);
    } else {
      mfBroadcastState();
    }
  }
  else if (data.action === 'chat') {
    // Mafia team chat
    const player = ms.players.find(p => p.id === senderId);
    if (!player) return;
    const role = player.activeRole;
    const canChat = (role === 'mafia') || (role === 'spy' && player.spyFoundMafia);
    if (!canChat) return;

    ms.chatMessages.push({
      sender: senderId,
      senderName: player.name,
      text: data.text,
      round: ms.round,
    });

    mfBroadcastState();
  }
  else if (data.action === 'extend') {
    if (ms.phase !== 'day-discuss') return;
    if (ms.extensionUsed[senderId]) return;
    if (ms.extensionAdded) return; // only one extension per day phase

    ms.extensionUsed[senderId] = true;
    ms.extensionAdded = true;
    ms.timer += 60; // +1 minute
    mfBroadcastState();
    // Notify
    const player = ms.players.find(p => p.id === senderId);
    // Broadcast will update timer display
  }
}

function mfAllNightActionsDone() {
  const ms = mfState;
  const isFirstNight = ms.round === 1;
  const sixRestrict = ms.sixPlayerFirstNight && isFirstNight;

  let needed = 0;
  ms.players.forEach(p => {
    if (!p.alive) return;
    const role = p.activeRole;
    if (role === 'mafia' && !sixRestrict) needed++;
    else if (role === 'spy') needed++;
    else if (role === 'police' && !sixRestrict) needed++;
    else if (role === 'doctor') needed++;
    else if (role === 'reporter' && !sixRestrict) needed++;
    else if (role === 'undertaker') needed++;
    else if (role === 'detective' && !sixRestrict) needed++;
  });

  // Only count unique players who have acted
  let acted = 0;
  ms.players.forEach(p => {
    if (!p.alive) return;
    if (ms.nightActions[p.id]) {
      const role = p.activeRole;
      const hasAction = (role === 'mafia' && !sixRestrict) ||
                        role === 'spy' ||
                        (role === 'police' && !sixRestrict) ||
                        role === 'doctor' ||
                        (role === 'reporter' && !sixRestrict) ||
                        role === 'undertaker' ||
                        (role === 'detective' && !sixRestrict);
      if (hasAction) acted++;
    }
  });

  // For mafia: only 1 mafia needs to act (they coordinate)
  const mafiaAlive = ms.players.filter(p => p.alive && p.activeRole === 'mafia');
  const mafiaActed = mafiaAlive.filter(p => ms.nightActions[p.id]).length;
  // At least 1 mafia must act if not restricted
  const mafiaOk = sixRestrict ? true : (mafiaAlive.length === 0 || mafiaActed >= 1);

  // Other roles
  const otherRoles = ['spy', 'police', 'doctor', 'reporter', 'undertaker', 'detective'];
  let othersOk = true;
  for (const role of otherRoles) {
    if (sixRestrict && role !== 'doctor' && role !== 'spy') continue;
    const p = ms.players.find(pp => pp.alive && pp.activeRole === role);
    if (p && !ms.nightActions[p.id]) {
      othersOk = false;
      break;
    }
  }

  return mafiaOk && othersOk;
}

// ========================= CLIENT: HANDLE MESSAGES ============

function mfHandleState(msg) {
  mfView = msg;
  showScreen('mafiaGame');
  mfRenderView();
}

function mfHandleResult(msg) {
  clearInterval(mfTimer);
  const myRole = mfView?.myRole;
  const myTeam = mfView?.myTeam;
  const won = (msg.winner === myTeam);
  recordGame(won);

  // Show result overlay
  const overlay = document.getElementById('mfResultOverlay');
  const title = document.getElementById('mfResultTitle');
  const subtitle = document.getElementById('mfResultSubtitle');
  const rolesDiv = document.getElementById('mfResultRoles');

  title.textContent = won ? '승리!' : '패배...';
  title.className = 'mf-result-title ' + (won ? 'win' : 'lose');
  subtitle.textContent = msg.message;

  // Show all player roles
  if (mfView && mfView.players) {
    rolesDiv.innerHTML = mfView.players.map((p, i) => {
      const roleInfo = MF_ROLES[p.role] || MF_ROLES.citizen;
      const teamCls = (roleInfo.team === 'mafia') ? 'mafia-text' : 'citizen-text';
      const deadCls = !p.alive ? 'dead-result' : '';
      return `
        <div class="mf-result-player ${deadCls}">
          <div class="mf-result-player-avatar" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>
          <div class="mf-result-player-name">${p.name}</div>
          <div class="mf-result-player-role ${teamCls}">${roleInfo.emoji} ${roleInfo.name}</div>
        </div>
      `;
    }).join('');
  }

  overlay.style.display = 'flex';
}

function mfCloseResult() {
  document.getElementById('mfResultOverlay').style.display = 'none';
  mfState = null;
  mfView = null;
  clearInterval(mfTimer);
  showScreen('lobby');
}

function mfLeaveGame() {
  clearInterval(mfTimer);
  mfState = null;
  mfView = null;
  leaveGame();
}

// ========================= RENDER =============================

function mfRenderView() {
  const v = mfView;
  if (!v) return;

  // --- Phase Badge ---
  const phaseInfo = MF_PHASE_LABELS[v.phase] || { icon: '❓', text: '알 수 없음', cls: 'day' };
  const phaseBadge = document.getElementById('mfPhaseBadge');
  document.getElementById('mfPhaseIcon').textContent = phaseInfo.icon;
  document.getElementById('mfPhaseText').textContent = phaseInfo.text;
  phaseBadge.className = 'mf-phase-badge ' + phaseInfo.cls;

  // Night mode on game screen
  const gameScreen = document.getElementById('mafiaGame');
  if (v.phase === 'night' || v.phase === 'role-reveal') {
    gameScreen.classList.add('night-mode');
  } else {
    gameScreen.classList.remove('night-mode');
  }

  // --- Day Counter ---
  document.getElementById('mfDayCounter').textContent = `${v.round}일차`;

  // --- Timer ---
  const timerEl = document.getElementById('mfTimer');
  timerEl.textContent = v.timer;
  const timerBox = document.getElementById('mfTimerBox');
  timerBox.classList.toggle('urgent', v.timer <= 10);

  // --- Role Banner ---
  const roleInfo = MF_ROLES[v.myRole] || MF_ROLES.citizen;
  const banner = document.getElementById('mfRoleBanner');
  banner.className = 'mf-role-banner ' + (roleInfo.team === 'mafia' ? 'team-mafia' : 'team-citizen');
  document.getElementById('mfRoleEmoji').textContent = roleInfo.emoji;
  document.getElementById('mfRoleName').textContent = roleInfo.name;
  document.getElementById('mfRoleName').className = 'mf-role-name ' + (roleInfo.team === 'mafia' ? 'mafia-color' : 'citizen-color');
  document.getElementById('mfRoleDesc').textContent = roleInfo.desc;

  // If baeksu inherited, show both
  if (v.myOriginalRole === 'baeksu' && v.myRole !== 'baeksu') {
    document.getElementById('mfRoleDesc').textContent = `백수에서 ${roleInfo.name}(으)로 전직! ${roleInfo.desc}`;
  }

  // --- Main Content ---
  const content = document.getElementById('mfContent');
  let html = '';

  // ============ ROLE REVEAL PHASE ============
  if (v.phase === 'role-reveal') {
    html += `
      <div style="text-align:center; padding:20px 0;">
        <div style="font-size:64px; margin-bottom:12px;">${roleInfo.emoji}</div>
        <div style="font-family:'Black Han Sans',sans-serif; font-size:28px; color:${roleInfo.team === 'mafia' ? '#ff4444' : '#4fc3f7'}; margin-bottom:8px;">${roleInfo.name}</div>
        <div style="font-size:14px; color:var(--text-dim); line-height:1.6;">${roleInfo.desc}</div>
      </div>
    `;

    // Mafia: show team members
    if (v.myRole === 'mafia') {
      const teammates = v.players.filter(p => p.role === 'mafia' && !p.isMe);
      if (teammates.length > 0) {
        html += `<div class="mf-section-label">동료 마피아</div>`;
        html += `<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">`;
        teammates.forEach(t => {
          html += `
            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
              <div class="mf-player-avatar" style="background:${PLAYER_COLORS[v.players.indexOf(t) % PLAYER_COLORS.length]};">${t.avatar}</div>
              <div style="font-size:12px; font-weight:700; color:#ff6b6b;">${t.name}</div>
            </div>
          `;
        });
        html += `</div>`;
      }
    }

    // Lover: show partner
    if (v.myRole === 'lover' && v.loverPartnerName) {
      html += `
        <div class="mf-lover-reveal">
          <div class="mf-lover-reveal-title">💕 당신의 연인</div>
          <div class="mf-lover-reveal-text">${v.loverPartnerName}님이 당신의 연인입니다!</div>
        </div>
      `;
    }
  }

  // ============ NIGHT PHASE ============
  else if (v.phase === 'night') {
    if (!v.isAlive) {
      html += `<div class="mf-spectator-bar">👻 당신은 사망했습니다. 관전 중...</div>`;
      html += mfRenderPlayerGrid(v, false);
    } else if (v.nightAction) {
      // Player has an action to take
      html += `
        <div class="mf-night-panel">
          <div class="mf-night-title">${roleInfo.emoji} ${roleInfo.name} 행동</div>
          <div class="mf-night-desc">${v.nightAction.label}</div>
        </div>
      `;

      // Undertaker: show dead players only
      if (v.nightAction.type === 'undertaker') {
        html += mfRenderPlayerGrid(v, true, 'dead-only');
      } else {
        html += mfRenderPlayerGrid(v, true);
      }
    } else {
      // Citizen / no action - waiting screen
      html += `
        <div class="mf-night-waiting">
          <div class="mf-night-waiting-icon">🌙</div>
          <div class="mf-night-waiting-text">밤이 깊었습니다...</div>
          <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">다른 플레이어들이 행동 중입니다</div>
        </div>
      `;
      html += mfRenderPlayerGrid(v, false);
    }

    // Mafia/Spy Chat
    if (v.canChat) {
      html += mfRenderChat(v);
    }

    // Spy: dead player roles
    if (v.myRole === 'spy' && Object.keys(v.spyDeadRoles).length > 0) {
      html += `
        <div class="mf-spy-info">
          <div class="mf-spy-info-title">🕵️ 사망자 직업 정보</div>
          <div class="mf-spy-dead-roles">
      `;
      Object.entries(v.spyDeadRoles).forEach(([pid, roleName]) => {
        const p = v.players.find(pp => pp.id === pid);
        if (p) {
          html += `<div class="mf-spy-dead-tag">${p.name}: ${roleName}</div>`;
        }
      });
      html += `</div></div>`;
    }
  }

  // ============ DAY ANNOUNCE PHASE ============
  else if (v.phase === 'day-announce') {
    html += `<div class="mf-events-list">`;

    // Public announcements
    v.announcements.forEach(a => {
      html += `
        <div class="mf-event-item ${a.type}">
          <span class="mf-event-icon">${a.icon}</span>
          <span>${a.text}</span>
        </div>
      `;
    });

    // Personal events
    v.personalEvents.forEach(e => {
      html += `
        <div class="mf-event-item ${e.type}">
          <span class="mf-event-icon">${e.icon}</span>
          <span>${e.text}</span>
        </div>
      `;
    });

    html += `</div>`;
    html += mfRenderPlayerGrid(v, false);
  }

  // ============ DAY DISCUSS PHASE ============
  else if (v.phase === 'day-discuss') {
    if (!v.isAlive) {
      html += `<div class="mf-spectator-bar">👻 당신은 사망했습니다. 관전 중...</div>`;
    }
    html += mfRenderPlayerGrid(v, false);

    // Mafia/Spy Chat (even during day for coordination)
    if (v.canChat) {
      html += mfRenderChat(v);
    }

    // Spy: dead player roles
    if (v.myRole === 'spy' && Object.keys(v.spyDeadRoles).length > 0) {
      html += `
        <div class="mf-spy-info">
          <div class="mf-spy-info-title">🕵️ 사망자 직업 정보</div>
          <div class="mf-spy-dead-roles">
      `;
      Object.entries(v.spyDeadRoles).forEach(([pid, roleName]) => {
        const p = v.players.find(pp => pp.id === pid);
        if (p) {
          html += `<div class="mf-spy-dead-tag">${p.name}: ${roleName}</div>`;
        }
      });
      html += `</div></div>`;
    }
  }

  // ============ DAY VOTE PHASE ============
  else if (v.phase === 'day-vote') {
    if (!v.isAlive) {
      html += `<div class="mf-spectator-bar">👻 사망한 플레이어는 투표할 수 없습니다.</div>`;
    }
    html += mfRenderPlayerGrid(v, v.isAlive && !v.votes[v.myId]);

    // Vote status panel
    html += mfRenderVotePanel(v);
  }

  // ============ VOTE RESULT PHASE ============
  else if (v.phase === 'vote-result') {
    html += `<div class="mf-events-list">`;
    v.announcements.forEach(a => {
      html += `
        <div class="mf-event-item ${a.type}">
          <span class="mf-event-icon">${a.icon}</span>
          <span>${a.text}</span>
        </div>
      `;
    });
    html += `</div>`;
    html += mfRenderPlayerGrid(v, false);
  }

  // ============ RESULT PHASE ============
  else if (v.phase === 'result') {
    html += mfRenderPlayerGrid(v, false);
  }

  content.innerHTML = html;

  // --- Bottom Action Area ---
  mfRenderActionArea(v);

  // Attach event listeners for player cards
  mfAttachCardListeners(v);

  // Scroll chat to bottom
  const chatMsgs = document.querySelector('.mf-chat-messages');
  if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ========================= RENDER HELPERS =====================

function mfRenderPlayerGrid(v, selectable, mode) {
  const gridCls = v.players.length > 8 ? 'mf-player-grid three-col' : 'mf-player-grid';
  let html = `<div class="${gridCls}">`;

  v.players.forEach((p, i) => {
    // mode === 'dead-only': only show dead players as selectable
    const isSelectable = selectable && (mode === 'dead-only' ? !p.alive : (p.alive && !p.isMe));
    const isDeadCard = !p.alive;
    const classes = [
      'mf-player-card',
      isSelectable ? 'selectable' : '',
      isDeadCard ? 'dead' : '',
      p.isMe ? 'is-me' : '',
      p.voteCount > 0 ? 'voted-on' : '',
    ].filter(Boolean).join(' ');

    html += `<div class="${classes}" data-pid="${p.id}">`;

    // Host crown
    if (p.isHost) {
      html += `<span class="mf-host-crown">👑</span>`;
    }

    // Lover heart
    if (p.showLoverHeart) {
      html += `<span class="mf-lover-heart">💕</span>`;
    }

    // Vote count badge
    if (p.voteCount > 0) {
      html += `<span class="mf-vote-count-badge">${p.voteCount}</span>`;
    }

    // Dead overlay
    html += `<div class="mf-dead-overlay">💀</div>`;

    // Avatar
    html += `<div class="mf-player-avatar" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>`;

    // Name
    html += `<div class="mf-player-name">${p.name}</div>`;

    // Role tag (if visible)
    if (p.role && (isDeadCard || p.isMe || v.phase === 'result' || p.role === 'mafia')) {
      const rInfo = MF_ROLES[p.role] || MF_ROLES.citizen;
      const tagCls = rInfo.team === 'mafia' ? 'mafia-tag' : 'citizen-tag';
      html += `<div class="mf-player-role-tag ${tagCls}">${rInfo.emoji} ${rInfo.name}</div>`;
    }

    // Soldier shield
    if (p.showSoldierShield) {
      html += `<span class="mf-soldier-shield">🛡️</span>`;
    }

    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

function mfRenderChat(v) {
  let html = `
    <div class="mf-chat-panel">
      <div class="mf-chat-header">
        <span>🔪</span>
        <span>마피아 팀 채팅</span>
      </div>
      <div class="mf-chat-messages" id="mfChatMessages">
  `;

  v.chatMessages.forEach(m => {
    html += `
      <div class="mf-chat-msg">
        <span class="sender">${m.senderName}:</span>
        <span class="text"> ${m.text}</span>
      </div>
    `;
  });

  html += `
      </div>
      <div class="mf-chat-input-row">
        <input type="text" class="mf-chat-input" id="mfChatInput" placeholder="메시지 입력..." maxlength="100"
               onkeydown="if(event.key==='Enter')mfSendChat()">
        <button class="mf-chat-send-btn" onclick="mfSendChat()">전송</button>
      </div>
    </div>
  `;
  return html;
}

function mfRenderVotePanel(v) {
  // Count votes per target
  const counts = {};
  let skipCount = 0;
  Object.values(v.votes).forEach(t => {
    if (t === 'skip') { skipCount++; return; }
    counts[t] = (counts[t] || 0) + 1;
  });

  const alivePlayers = v.players.filter(p => p.alive);
  const totalVoters = alivePlayers.length;
  const votedCount = Object.keys(v.votes).length;

  let html = `
    <div class="mf-vote-panel">
      <div class="mf-vote-title">투표 현황 (${votedCount}/${totalVoters})</div>
      <div class="mf-vote-bars">
  `;

  // Sort by vote count
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  entries.forEach(([pid, count]) => {
    const p = v.players.find(pp => pp.id === pid);
    if (!p) return;
    const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
    html += `
      <div class="mf-vote-bar">
        <div class="mf-vote-bar-name">${p.name}</div>
        <div class="mf-vote-bar-track">
          <div class="mf-vote-bar-fill" style="width:${pct}%;">${count}</div>
        </div>
      </div>
    `;
  });

  html += `</div>`;

  if (skipCount > 0) {
    html += `<div class="mf-skip-count">건너뛰기: ${skipCount}표</div>`;
  }

  html += `</div>`;
  return html;
}

// ========================= ACTION AREA ========================

function mfRenderActionArea(v) {
  const msgBox = document.getElementById('mfMessageBox');
  const btnRow = document.getElementById('mfBtnRow');
  let msg = '';
  let btns = '';

  if (v.phase === 'role-reveal') {
    msg = '🎭 역할을 확인하세요! 잠시 후 밤이 시작됩니다.';
  }
  else if (v.phase === 'night') {
    if (!v.isAlive) {
      msg = '👻 관전 모드';
    } else if (v.nightActionDone) {
      msg = '✅ 행동 완료! 다른 플레이어를 기다리는 중...';
    } else if (v.nightAction) {
      msg = v.nightAction.label;

      if (v.nightAction.type === 'mafia') {
        btns += `<button class="mf-action-btn primary" id="mfConfirmBtn" onclick="mfConfirmNightAction()" disabled>🔪 제거</button>`;
        if (v.nightAction.canSnipe) {
          btns += `<button class="mf-action-btn snipe" id="mfSnipeBtn" onclick="mfToggleSnipe()">🎯 저격 (${v.mySnipesLeft}회)</button>`;
        }
      } else {
        const actionLabel = {
          spy: '🕵️ 조사',
          police: '🔍 조사',
          doctor: '💊 치료',
          reporter: '📰 조사',
          undertaker: '⚰️ 확인',
          detective: '🔎 추적',
        };
        btns += `<button class="mf-action-btn primary" id="mfConfirmBtn" onclick="mfConfirmNightAction()" disabled>${actionLabel[v.nightAction.type] || '확인'}</button>`;
      }
    } else {
      msg = '🌙 밤입니다... 기다리세요.';
    }
  }
  else if (v.phase === 'day-announce') {
    msg = '☀️ 밤이 지나고 아침이 밝았습니다...';
  }
  else if (v.phase === 'day-discuss') {
    if (!v.isAlive) {
      msg = '👻 관전 모드';
    } else {
      msg = '☀️ 의심되는 사람에 대해 토론하세요!';
      btns += `<button class="mf-action-btn extend" onclick="mfRequestExtend()">⏰ 연장 (+1분)</button>`;
    }
  }
  else if (v.phase === 'day-vote') {
    if (!v.isAlive) {
      msg = '👻 사망한 플레이어는 투표할 수 없습니다.';
    } else if (v.votes[v.myId]) {
      msg = '✅ 투표 완료! 결과를 기다리는 중...';
    } else {
      msg = '🗳️ 처형할 사람을 선택하고 투표하세요!';
      btns += `<button class="mf-action-btn primary" id="mfVoteBtn" onclick="mfConfirmVote()" disabled>🗳️ 투표</button>`;
      btns += `<button class="mf-action-btn secondary" onclick="mfSkipVote()">건너뛰기</button>`;
    }
  }
  else if (v.phase === 'vote-result') {
    msg = '⚖️ 투표 결과를 확인하세요.';
  }
  else if (v.phase === 'result') {
    msg = '';
  }

  msgBox.innerHTML = msg;
  btnRow.innerHTML = btns;
}

// ========================= UI INTERACTIONS ====================

function mfAttachCardListeners(v) {
  document.querySelectorAll('.mf-player-card.selectable').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.pid;
      if (!pid) return;

      // Deselect all
      document.querySelectorAll('.mf-player-card').forEach(c => {
        c.classList.remove('selected', 'selected-snipe');
      });

      mfSelectedTarget = pid;
      card.classList.add(mfUseSnipe ? 'selected-snipe' : 'selected');

      // Enable confirm button
      const confirmBtn = document.getElementById('mfConfirmBtn');
      const voteBtn = document.getElementById('mfVoteBtn');
      if (confirmBtn) confirmBtn.disabled = false;
      if (voteBtn) voteBtn.disabled = false;
    });
  });
}

function mfToggleSnipe() {
  mfUseSnipe = !mfUseSnipe;
  const snipeBtn = document.getElementById('mfSnipeBtn');
  if (snipeBtn) {
    if (mfUseSnipe) {
      snipeBtn.style.background = 'linear-gradient(135deg, #b71c1c, #880e0e)';
      snipeBtn.textContent = '🎯 저격 모드 ON';
    } else {
      snipeBtn.style.background = '';
      snipeBtn.textContent = `🎯 저격 (${mfView?.mySnipesLeft || 0}회)`;
    }
  }

  // Update selection visual if target already selected
  const selectedCard = document.querySelector('.mf-player-card.selected, .mf-player-card.selected-snipe');
  if (selectedCard) {
    selectedCard.classList.remove('selected', 'selected-snipe');
    selectedCard.classList.add(mfUseSnipe ? 'selected-snipe' : 'selected');
  }
}

function mfConfirmNightAction() {
  if (!mfSelectedTarget) { showToast('대상을 선택하세요'); return; }

  const actionType = mfView?.nightAction?.type;
  let nightAction = 'investigate';

  if (actionType === 'mafia') {
    nightAction = mfUseSnipe ? 'snipe' : 'kill';
  } else if (actionType === 'doctor') {
    nightAction = 'heal';
  } else if (actionType === 'detective') {
    nightAction = 'track';
  }

  const data = {
    type: 'mf-action',
    action: 'night-action',
    nightAction,
    targetId: mfSelectedTarget,
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify(data));
  }

  showToast('행동 완료!');
  mfSelectedTarget = null;
  mfUseSnipe = false;

  // Disable buttons
  const confirmBtn = document.getElementById('mfConfirmBtn');
  if (confirmBtn) confirmBtn.disabled = true;
  const snipeBtn = document.getElementById('mfSnipeBtn');
  if (snipeBtn) snipeBtn.disabled = true;
}

function mfConfirmVote() {
  if (!mfSelectedTarget) { showToast('투표 대상을 선택하세요'); return; }

  const data = {
    type: 'mf-action',
    action: 'vote',
    targetId: mfSelectedTarget,
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify(data));
  }

  showToast('투표 완료!');
  mfSelectedTarget = null;
}

function mfSkipVote() {
  const data = {
    type: 'mf-action',
    action: 'vote',
    targetId: 'skip',
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify(data));
  }

  showToast('건너뛰기 투표 완료');
}

function mfSendChat() {
  const input = document.getElementById('mfChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const data = {
    type: 'mf-action',
    action: 'chat',
    text,
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify(data));
  }

  input.value = '';
}

function mfRequestExtend() {
  const data = {
    type: 'mf-action',
    action: 'extend',
  };

  if (state.isHost) {
    mfProcessAction(state.myId, data);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify(data));
  }

  showToast('연장 요청!');
}

// ===== GAME STUBS =====
// startSutda, startRacing - 아래 엔진 코드에서 정의됨
// startECard, startYahtzee, startUpDown - 아래 엔진 코드에서 정의됨

// ===== TRUTH GAME ENGINE =====

// --- 호스트 상태 ---
let truthState = null;

function startTruthGame() {
  if (!state.isHost) return;
  if (state.players.length < 3) {
    showToast('진실게임은 3명 이상 필요합니다');
    return;
  }

  truthState = {
    round: 1,
    questionerIdx: 0,
    question: '',
    votes: {},
    votedSet: new Set(),
    phase: 'question',
    playerOrder: state.players.map(p => p.id),
    playerMap: {},
  };

  state.players.forEach((p, i) => {
    truthState.playerMap[p.id] = {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      colorIdx: i,
    };
  });

  const initView = buildTruthView(state.myId);
  showScreen('truthGame');
  renderTruthView(initView);

  state.players.forEach(p => {
    if (p.id !== state.myId) {
      const view = buildTruthView(p.id);
      sendTo(p.id, {
        type: 'game-start',
        game: 'truth',
        state: view,
      });
    }
  });
}

function buildTruthView(forPlayerId) {
  const ts = truthState;
  const questionerId = ts.playerOrder[ts.questionerIdx];
  const isQuestioner = (forPlayerId === questionerId);
  const totalPlayers = ts.playerOrder.length;

  const votedList = Array.from(ts.votedSet || []);
  const voteCount = votedList.length;

  let oCount = 0;
  let xCount = 0;
  if (ts.phase === 'result') {
    Object.values(ts.votes).forEach(v => {
      if (v === 'O') oCount++;
      else if (v === 'X') xCount++;
    });
  }

  const myVoted = ts.votedSet ? ts.votedSet.has(forPlayerId) : false;

  return {
    type: 'truth-state',
    round: ts.round,
    phase: ts.phase,
    questionerId: questionerId,
    questionerName: ts.playerMap[questionerId]?.name || '???',
    isQuestioner: isQuestioner,
    question: ts.phase !== 'question' ? ts.question : (isQuestioner ? '' : ''),
    totalPlayers: totalPlayers,
    voteCount: voteCount,
    votedList: votedList,
    myVoted: myVoted,
    oCount: oCount,
    xCount: xCount,
    players: ts.playerOrder.map(pid => ({
      id: pid,
      name: ts.playerMap[pid]?.name || '???',
      avatar: ts.playerMap[pid]?.avatar || '😎',
      colorIdx: ts.playerMap[pid]?.colorIdx || 0,
      isQuestioner: pid === questionerId,
      hasVoted: ts.votedSet ? ts.votedSet.has(pid) : false,
    })),
    isHost: forPlayerId === state.myId && state.isHost,
  };
}

function broadcastTruthState() {
  if (!truthState) return;
  const ts = truthState;

  ts.playerOrder.forEach(pid => {
    const view = buildTruthView(pid);
    if (pid === state.myId) {
      renderTruthView(view);
    } else {
      sendTo(pid, view);
    }
  });
}

function processTruthQuestion(peerId, question) {
  if (!truthState || truthState.phase !== 'question') return;
  const questionerId = truthState.playerOrder[truthState.questionerIdx];
  if (peerId !== questionerId) return;

  truthState.question = question;
  truthState.phase = 'voting';
  truthState.votes = {};
  truthState.votedSet = new Set();

  broadcastTruthState();
}

function processTruthVote(peerId, vote) {
  if (!truthState || truthState.phase !== 'voting') return;
  if (truthState.votedSet.has(peerId)) return;
  if (vote !== 'O' && vote !== 'X') return;

  truthState.votes[peerId] = vote;
  truthState.votedSet.add(peerId);

  if (truthState.votedSet.size >= truthState.playerOrder.length) {
    truthState.phase = 'result';
  }
  broadcastTruthState();
}

function processTruthNext() {
  if (!truthState) return;
  truthState.round++;
  truthState.questionerIdx = (truthState.questionerIdx + 1) % truthState.playerOrder.length;
  truthState.question = '';
  truthState.votes = {};
  truthState.votedSet = new Set();
  truthState.phase = 'question';

  broadcastTruthState();
}

function renderTruthView(view) {
  if (!view) return;

  document.getElementById('truthRoundBadge').textContent = 'ROUND ' + view.round;
  document.getElementById('truthQuestionerDisplay').textContent = '질문자: ' + view.questionerName;

  document.getElementById('truthQuestionInputArea').style.display = 'none';
  document.getElementById('truthWaitQuestionArea').style.display = 'none';
  document.getElementById('truthVotingArea').style.display = 'none';
  document.getElementById('truthResultArea').style.display = 'none';

  if (view.phase === 'question') {
    if (view.isQuestioner) {
      document.getElementById('truthQuestionInputArea').style.display = 'flex';
      document.getElementById('truthQuestionInput').value = '';
      document.getElementById('truthCharCount').textContent = '0';
    } else {
      document.getElementById('truthWaitQuestionArea').style.display = 'flex';
      document.getElementById('truthWaitingText').textContent = '질문을 기다리는 중...';
      document.getElementById('truthWaitingSubText').textContent =
        view.questionerName + '님이 질문을 작성하고 있습니다';
    }
  } else if (view.phase === 'voting') {
    document.getElementById('truthVotingArea').style.display = 'flex';
    document.getElementById('truthQuestionText').textContent = view.question;

    if (view.myVoted) {
      document.getElementById('truthVoteButtons').style.display = 'none';
      document.getElementById('truthVoteWaiting').style.display = 'block';
      const pct = Math.round((view.voteCount / view.totalPlayers) * 100);
      document.getElementById('truthProgressFill').style.width = pct + '%';
      document.getElementById('truthProgressText').textContent =
        '투표 중... (' + view.voteCount + '/' + view.totalPlayers + '명 완료)';
    } else {
      document.getElementById('truthVoteButtons').style.display = 'flex';
      document.getElementById('truthVoteWaiting').style.display = 'none';
      document.getElementById('truthBtnO').classList.remove('selected', 'disabled');
      document.getElementById('truthBtnX').classList.remove('selected', 'disabled');
    }
  } else if (view.phase === 'result') {
    document.getElementById('truthResultArea').style.display = 'flex';
    document.getElementById('truthResultQuestionText').textContent = view.question;
    document.getElementById('truthResultOCount').textContent = view.oCount + '명';
    document.getElementById('truthResultXCount').textContent = view.xCount + '명';
    document.getElementById('truthResultTotal').textContent =
      '총 ' + view.totalPlayers + '명 참여';

    const oDots = document.getElementById('truthResultODots');
    let oHTML = '';
    for (let i = 0; i < view.totalPlayers; i++) {
      const delay = (i * 0.08).toFixed(2);
      if (i < view.oCount) {
        oHTML += '<div class="truth-dot filled-o" style="animation-delay:' + delay + 's"></div>';
      } else {
        oHTML += '<div class="truth-dot empty"></div>';
      }
    }
    oDots.innerHTML = oHTML;

    const xDots = document.getElementById('truthResultXDots');
    let xHTML = '';
    for (let i = 0; i < view.totalPlayers; i++) {
      const delay = (i * 0.08).toFixed(2);
      if (i < view.xCount) {
        xHTML += '<div class="truth-dot filled-x" style="animation-delay:' + delay + 's"></div>';
      } else {
        xHTML += '<div class="truth-dot empty"></div>';
      }
    }
    xDots.innerHTML = xHTML;

    if (view.isHost) {
      document.getElementById('truthNextBtn').style.display = 'block';
      document.getElementById('truthNextWaiting').style.display = 'none';
    } else {
      document.getElementById('truthNextBtn').style.display = 'none';
      document.getElementById('truthNextWaiting').style.display = 'block';
    }
  }

  renderTruthPlayersBar(view.players);
}

function renderTruthPlayersBar(players) {
  const bar = document.getElementById('truthPlayersBar');
  bar.innerHTML = players.map(p => {
    const isMe = p.id === state.myId;
    const avatarClasses = [
      'truth-player-avatar',
      p.isQuestioner ? 'is-questioner' : '',
      p.hasVoted ? 'has-voted' : '',
    ].filter(Boolean).join(' ');

    const nameClass = p.isQuestioner ? 'truth-player-name active-name' : 'truth-player-name';

    return '<div class="truth-player-chip">' +
      '<div class="' + avatarClasses + '" style="background:' + PLAYER_COLORS[p.colorIdx % PLAYER_COLORS.length] + ';">' +
        p.avatar +
      '</div>' +
      '<div class="' + nameClass + '">' + (isMe ? '나' : p.name) + '</div>' +
    '</div>';
  }).join('');
}

function submitTruthQuestion() {
  const input = document.getElementById('truthQuestionInput');
  const question = input.value.trim();
  if (!question) {
    showToast('질문을 입력하세요');
    return;
  }
  if (question.length > 200) {
    showToast('질문이 너무 깁니다 (200자 이내)');
    return;
  }

  if (state.isHost) {
    processTruthQuestion(state.myId, question);
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'truth-question',
        question: question,
      }));
    }
  }
}

function castTruthVote(vote) {
  const btnO = document.getElementById('truthBtnO');
  const btnX = document.getElementById('truthBtnX');

  if (vote === 'O') {
    btnO.classList.add('selected');
    btnX.classList.add('disabled');
  } else {
    btnX.classList.add('selected');
    btnO.classList.add('disabled');
  }

  setTimeout(() => {
    document.getElementById('truthVoteButtons').style.display = 'none';
    document.getElementById('truthVoteWaiting').style.display = 'block';
    document.getElementById('truthVotedBadge').textContent =
      vote === 'O' ? '⭕ 투표 완료' : '❌ 투표 완료';
  }, 400);

  if (state.isHost) {
    processTruthVote(state.myId, vote);
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'truth-vote',
        vote: vote,
      }));
    }
  }
}

function truthNextRound() {
  if (state.isHost) {
    processTruthNext();
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'truth-next',
      }));
    }
  }
}

document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'truthQuestionInput') {
    const cnt = document.getElementById('truthCharCount');
    if (cnt) cnt.textContent = e.target.value.length;
  }
});

// ===== QUICK DRAW ENGINE =====

let qdState = {
  phase: 'waiting',
  startTime: 0,
  results: {},
  roundNum: 1,
  countdownTimeout: null,
  fireTimeout: null,
};

function startQuickDraw() {
  if(!state.isHost) return;

  qdState = {
    phase: 'waiting',
    startTime: 0,
    results: {},
    roundNum: state.quickdraw?.roundNum || 1,
    countdownTimeout: null,
    fireTimeout: null,
  };

  state.quickdraw = qdState;

  broadcast({ type: 'game-start', game: 'quickdraw', state: qdState });
  showScreen('quickDrawGame');
  renderQuickDrawView(qdState);

  setTimeout(() => {
    qdState.phase = 'countdown';
    broadcastQDState();

    const delay = 2000 + Math.random() * 4000;
    qdState.countdownTimeout = setTimeout(() => {
      qdState.phase = 'fire';
      qdState.startTime = Date.now();
      broadcastQDState();

      if(navigator.vibrate) navigator.vibrate(200);

      qdState.fireTimeout = setTimeout(() => {
        resolveQD();
      }, 5000);
    }, delay);
  }, 3000);
}

function broadcastQDState() {
  const msg = {
    type: 'qd-state',
    phase: qdState.phase,
    startTime: qdState.startTime,
    results: qdState.results,
    roundNum: qdState.roundNum,
  };

  broadcast(msg);
  renderQuickDrawView(msg);
}

function renderQuickDrawView(qd) {
  if(!qd) return;

  const zone = document.getElementById('qdTapZone');
  const statusText = document.getElementById('qdStatusText');
  const reactionTime = document.getElementById('qdReactionTime');
  const roundNum = document.getElementById('qdRoundNum');

  roundNum.textContent = qd.roundNum;

  zone.className = 'qd-tap-zone ' + qd.phase;

  switch(qd.phase) {
    case 'waiting':
      statusText.textContent = '준비...';
      reactionTime.textContent = '';
      break;

    case 'countdown':
      statusText.textContent = '⏳';
      reactionTime.textContent = '';
      break;

    case 'fire':
      statusText.textContent = '발사!';
      reactionTime.textContent = '';

      if(navigator.vibrate) navigator.vibrate(200);
      break;

    case 'result':
      statusText.textContent = '결과';

      const myResult = qd.results[state.myId];
      if(myResult) {
        if(myResult.cheated) {
          reactionTime.textContent = '실격!';
          reactionTime.style.color = 'var(--danger)';
        } else {
          reactionTime.textContent = (myResult.time / 1000).toFixed(3) + '초';
          reactionTime.style.color = 'var(--accent2)';
        }
      } else {
        reactionTime.textContent = '미응답';
        reactionTime.style.color = 'var(--text-dim)';
      }

      document.getElementById('qdRestartBtn').style.display = state.isHost ? 'block' : 'none';
      break;
  }

  renderQDRankings(qd);
}

function renderQDRankings(qd) {
  const list = document.getElementById('qdRankingsList');

  if(qd.phase !== 'result' || Object.keys(qd.results).length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:20px;">대기 중...</div>';
    return;
  }

  const sorted = Object.entries(qd.results)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => {
      if(a.cheated && !b.cheated) return 1;
      if(!a.cheated && b.cheated) return -1;
      if(a.cheated && b.cheated) return 0;
      return a.time - b.time;
    });

  list.innerHTML = sorted.map((r, i) => {
    const rank = r.cheated ? '❌' : (i + 1) + '위';
    const timeStr = r.cheated ? '너무 빨라요!' : (r.time / 1000).toFixed(3) + '초';
    const isWinner = !r.cheated && i === 0;
    const playerIdx = state.players.findIndex(p => p.id === r.id);

    return `
      <div class="qd-ranking-item ${isWinner ? 'winner' : ''}">
        <div class="qd-ranking-rank">${rank}</div>
        <div class="qd-ranking-avatar" style="background:${PLAYER_COLORS[playerIdx % PLAYER_COLORS.length]};">${r.avatar}</div>
        <div class="qd-ranking-name">${r.name}</div>
        <div class="qd-ranking-time ${r.cheated ? 'cheated' : ''}">${timeStr}</div>
      </div>
    `;
  }).join('');
}

function qdTap() {
  const qd = qdState;
  const now = Date.now();

  if(qd.results[state.myId]) return;

  if(qd.phase === 'waiting') {
    return;
  } else if(qd.phase === 'countdown') {
    sendQDAction({ cheated: true, time: 0 });

    qdState.results[state.myId] = {
      cheated: true,
      time: 0,
      name: state.myName,
      avatar: state.myAvatar,
    };

    const zone = document.getElementById('qdTapZone');
    const statusText = document.getElementById('qdStatusText');
    zone.className = 'qd-tap-zone cheated';
    statusText.textContent = '너무 빨라요!\n실격!';
    statusText.style.fontSize = '32px';

  } else if(qd.phase === 'fire') {
    const reactionTime = now - qd.startTime;
    sendQDAction({ cheated: false, time: reactionTime });

    qdState.results[state.myId] = {
      cheated: false,
      time: reactionTime,
      name: state.myName,
      avatar: state.myAvatar,
    };

    const zone = document.getElementById('qdTapZone');
    const statusText = document.getElementById('qdStatusText');
    const reactionTimeEl = document.getElementById('qdReactionTime');
    zone.className = 'qd-tap-zone done';
    statusText.textContent = '완료!';
    reactionTimeEl.textContent = (reactionTime / 1000).toFixed(3) + '초';
  }
}

function sendQDAction(action) {
  const msg = {
    type: 'qd-action',
    playerId: state.myId,
    name: state.myName,
    avatar: state.myAvatar,
    cheated: action.cheated,
    time: action.time,
  };

  if(state.isHost) {
    processQDAction(msg);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) host.send(JSON.stringify(msg));
  }
}

function processQDAction(msg) {
  if(!state.isHost) return;

  qdState.results[msg.playerId] = {
    cheated: msg.cheated,
    time: msg.time,
    name: msg.name,
    avatar: msg.avatar,
  };

  if(Object.keys(qdState.results).length >= state.players.length) {
    clearTimeout(qdState.fireTimeout);
    resolveQD();
  }
}

function resolveQD() {
  if(!state.isHost) return;

  qdState.phase = 'result';

  const valid = Object.entries(qdState.results)
    .filter(([id, r]) => !r.cheated)
    .sort((a, b) => a[1].time - b[1].time);

  let winnerId = null;
  let winnerName = '';
  if(valid.length > 0) {
    winnerId = valid[0][0];
    winnerName = valid[0][1].name;
  }

  const result = {
    type: 'qd-result',
    winnerId,
    winnerName,
    results: qdState.results,
    roundNum: qdState.roundNum,
  };

  broadcast(result);
  handleQDResult(result);
}

function handleQDResult(msg) {
  qdState.phase = 'result';
  qdState.results = msg.results;
  qdState.roundNum = msg.roundNum;

  renderQuickDrawView(qdState);

  const won = msg.winnerId === state.myId;
  if(msg.winnerId) {
    recordGame(won);
  }

  if(msg.winnerId === state.myId) {
    showToast('🏆 승리!');
  } else if(msg.winnerId) {
    showToast(`${msg.winnerName} 승리!`);
  }
}

function restartQuickDraw() {
  if(!state.isHost) return;
  qdState.roundNum++;
  startQuickDraw();
}

// ===== RUSSIAN ROULETTE ENGINE =====
let rrState = {
  bullets: 1,
  chambers: 6,
  cylinder: [],
  currentChamber: 0,
  turnIdx: 0,
  players: [],
  phase: 'setup',
  setupDone: false,
  lastResult: null,
};

function startRussianRoulette() {
  if(!state.isHost) return;

  rrState = {
    bullets: 1,
    chambers: 6,
    cylinder: [],
    currentChamber: 0,
    turnIdx: 0,
    players: state.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, alive: true
    })),
    phase: 'setup',
    setupDone: false,
    lastResult: null,
  };

  showScreen('rouletteGame');
  document.getElementById('rouletteSetup').style.display = 'block';

  document.getElementById('bulletsSlider').oninput = (e) => {
    document.getElementById('bulletsValue').textContent = e.target.value;
  };
  document.getElementById('chambersSlider').oninput = (e) => {
    document.getElementById('chambersValue').textContent = e.target.value;
  };
}

function confirmRouletteSetup() {
  const bullets = parseInt(document.getElementById('bulletsSlider').value);
  const chambers = parseInt(document.getElementById('chambersSlider').value);

  rrState.bullets = bullets;
  rrState.chambers = chambers;
  rrState.cylinder = new Array(chambers).fill(false);

  const positions = [];
  while(positions.length < bullets) {
    const pos = Math.floor(Math.random() * chambers);
    if(!positions.includes(pos)) positions.push(pos);
  }
  positions.forEach(p => rrState.cylinder[p] = true);

  rrState.currentChamber = Math.floor(Math.random() * chambers);
  rrState.phase = 'playing';
  rrState.setupDone = true;
  rrState.turnIdx = 0;

  document.getElementById('rouletteSetup').style.display = 'none';

  broadcastRRState();
  renderRouletteView();
}

function broadcastRRState() {
  const rs = rrState;

  rs.players.forEach(p => {
    const view = {
      type: 'roulette-state',
      players: rs.players.map(pp => ({
        id: pp.id, name: pp.name, avatar: pp.avatar, alive: pp.alive
      })),
      turnIdx: rs.turnIdx,
      phase: rs.phase,
      chambers: rs.chambers,
      bullets: rs.bullets,
      lastResult: rs.lastResult,
      showCylinder: false,
    };

    if(p.id === state.myId) renderRouletteView(view);
    else sendTo(p.id, view);
  });
}

function renderRouletteView(data) {
  const rs = data || {
    players: rrState.players,
    turnIdx: rrState.turnIdx,
    phase: rrState.phase,
    chambers: rrState.chambers,
    bullets: rrState.bullets,
    lastResult: rrState.lastResult,
  };

  const alive = rs.players.filter(p => p.alive).length;
  document.getElementById('rouletteSurvivors').textContent = alive;
  document.getElementById('rouletteTotalPlayers').textContent = rs.players.length;

  const currentPlayer = rs.players[rs.turnIdx];
  if(currentPlayer) {
    document.getElementById('currentTurnName').textContent = currentPlayer.name;
  }

  const cylinder = document.getElementById('cylinder');
  cylinder.innerHTML = '';
  const angleStep = 360 / rs.chambers;

  for(let i = 0; i < rs.chambers; i++) {
    const indicator = document.createElement('div');
    indicator.className = 'chamber-indicator empty';
    const angle = i * angleStep;
    const radius = 80;
    const x = 100 + radius * Math.cos((angle - 90) * Math.PI / 180);
    const y = 100 + radius * Math.sin((angle - 90) * Math.PI / 180);
    indicator.style.left = x + 'px';
    indicator.style.top = y + 'px';
    cylinder.appendChild(indicator);
  }

  const survivorsList = document.getElementById('survivorsList');
  survivorsList.innerHTML = rs.players.map((p, i) => `
    <div class="survivor-item ${!p.alive ? 'dead' : ''}">
      <div class="survivor-avatar-sm" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]};">${p.avatar}</div>
      <div class="survivor-name">${p.name}</div>
    </div>
  `).join('');

  const isMyTurn = currentPlayer?.id === state.myId;
  const spinBtn = document.getElementById('spinBtn');
  const triggerBtn = document.getElementById('triggerBtn');
  const restartBtn = document.getElementById('restartBtn');
  const cylinderInfo = document.getElementById('cylinderInfo');

  spinBtn.style.display = 'none';
  triggerBtn.style.display = 'none';
  restartBtn.style.display = 'none';

  if(rs.phase === 'gameover') {
    cylinderInfo.textContent = '게임 종료!';
    if(state.isHost) {
      restartBtn.style.display = 'block';
    }
  } else if(isMyTurn && rs.phase === 'playing') {
    spinBtn.style.display = 'block';
    cylinderInfo.textContent = '실린더를 돌려주세요';
  } else if(isMyTurn && rs.phase === 'spinning') {
    triggerBtn.style.display = 'block';
    cylinderInfo.textContent = '방아쇠를 당기세요...';
  } else {
    cylinderInfo.textContent = currentPlayer ? `${currentPlayer.name}의 차례` : '대기 중...';
  }
}

function spinCylinder() {
  if(!state.isHost) {
    const host = Object.values(state.connections)[0];
    if(host?.open) host.send(JSON.stringify({ type: 'rr-action', action: 'spin' }));
    return;
  }

  rrState.phase = 'spinning';

  const cylinder = document.getElementById('cylinder');
  cylinder.classList.add('spinning');

  setTimeout(() => {
    cylinder.classList.remove('spinning');
    broadcastRRState();
  }, 3000);

  broadcastRRState();
}

function pullTrigger() {
  if(!state.isHost) {
    const host = Object.values(state.connections)[0];
    if(host?.open) host.send(JSON.stringify({ type: 'rr-action', action: 'trigger' }));
    return;
  }

  const currentPlayer = rrState.players[rrState.turnIdx];
  const isBullet = rrState.cylinder[rrState.currentChamber];

  if(isBullet) {
    currentPlayer.alive = false;
    rrState.lastResult = { playerId: currentPlayer.id, result: 'dead' };

    if(navigator.vibrate) navigator.vibrate([200, 100, 200]);

    showRouletteFlash('bang', '💥', '탕!');

    setTimeout(() => {
      rrState.currentChamber = (rrState.currentChamber + 1) % rrState.chambers;
      advanceRouletteTurn();
    }, 2000);

  } else {
    rrState.lastResult = { playerId: currentPlayer.id, result: 'safe' };

    showRouletteFlash('safe', '😮‍💨', '찰칵... 살았다!');

    setTimeout(() => {
      rrState.currentChamber = (rrState.currentChamber + 1) % rrState.chambers;
      advanceRouletteTurn();
    }, 2000);
  }

  broadcastRRState();
}

function showRouletteFlash(type, icon, text) {
  const flash = document.getElementById('rouletteFlash');
  const flashIcon = document.getElementById('flashIcon');
  const flashText = document.getElementById('flashText');

  flash.className = 'roulette-flash active ' + type;
  flashIcon.textContent = icon;
  flashText.textContent = text;

  setTimeout(() => {
    flash.classList.remove('active', type);
  }, 800);
}

function advanceRouletteTurn() {
  const alivePlayers = rrState.players.filter(p => p.alive);

  if(alivePlayers.length === 1) {
    rrState.phase = 'gameover';
    const winner = alivePlayers[0];

    const result = {
      type: 'rr-result',
      winnerId: winner.id,
      winnerName: winner.name,
      winnerAvatar: winner.avatar,
    };

    broadcast(result);
    handleRRResult(result);
    return;
  }

  if(alivePlayers.length === 0) {
    rrState.phase = 'gameover';
    broadcastRRState();
    return;
  }

  let nextIdx = (rrState.turnIdx + 1) % rrState.players.length;
  while(!rrState.players[nextIdx].alive) {
    nextIdx = (nextIdx + 1) % rrState.players.length;
  }

  rrState.turnIdx = nextIdx;
  rrState.phase = 'playing';
  broadcastRRState();
}

function handleRRResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won);

  document.getElementById('resultTitle').textContent = won ? '🏆 생존!' : '💀 탈락...';
  document.getElementById('resultTitle').style.color = won ? 'var(--success)' : 'var(--danger)';
  document.getElementById('winnerName').textContent = msg.winnerName + ' ' + msg.winnerAvatar + ' 승리!';
  document.getElementById('resultHand').textContent = '러시안 룰렛 최후의 생존자';
  document.getElementById('resultPot').textContent = '';
  document.getElementById('resultCards').innerHTML = '';
  document.getElementById('resultOverlay').classList.add('active');
}

function restartRoulette() {
  if(!state.isHost) return;
  startRussianRoulette();
}

function processRRAction(peerId, action) {
  const currentPlayer = rrState.players[rrState.turnIdx];
  if(!currentPlayer || currentPlayer.id !== peerId) return;

  if(action === 'spin') {
    spinCylinder();
  } else if(action === 'trigger') {
    pullTrigger();
  }
}

// ===== LOTTERY ROULETTE ENGINE =====

let lotteryState = {
  mode: 'lottery',
  items: [],
  grid: [],
  gridSize: 10,
  picked: [],
  spinning: false,
  resultAngle: 0,
  currentRotation: 0,
  phase: 'setup'
};

function startLottery() {
  if(!state.isHost) {
    showToast('호스트만 게임을 시작할 수 있습니다');
    return;
  }

  lotteryState.mode = 'lottery';
  lotteryState.phase = 'setup';

  broadcast({ type: 'game-start', game: 'lottery', state: lotteryState });
  showScreen('lotteryGame');
  renderLotterySetup();
}

function startLotteryGame() {
  if(!state.isHost) return;

  const itemsText = document.getElementById('lotteryItemsInput').value.trim();
  const gridSize = parseInt(document.getElementById('gridSizeSelect').value);

  if(!itemsText) {
    showToast('항목을 입력하세요');
    return;
  }

  const items = itemsText.split('\n').map(s => s.trim()).filter(s => s);

  if(items.length < 2) {
    showToast('최소 2개 항목 필요');
    return;
  }

  lotteryState.items = items;
  lotteryState.gridSize = gridSize;
  lotteryState.phase = 'playing';

  const totalCells = gridSize * gridSize;
  lotteryState.grid = [];

  for(let i = 0; i < totalCells; i++) {
    const item = items[Math.floor(Math.random() * items.length)];
    lotteryState.grid.push({
      index: i,
      item: item,
      revealed: false,
      revealedBy: null
    });
  }

  lotteryState.picked = [];

  const stateToSend = {
    mode: 'lottery',
    phase: 'playing',
    gridSize: gridSize,
    grid: lotteryState.grid.map(c => ({
      index: c.index,
      revealed: false,
      revealedBy: null
    })),
    items: items
  };

  broadcast({ type: 'lottery-state', state: stateToSend });
  renderLotteryGame(stateToSend);
}

function startRouletteGame() {
  if(!state.isHost) return;

  const itemsText = document.getElementById('rouletteItemsInput').value.trim();

  if(!itemsText) {
    showToast('항목을 입력하세요');
    return;
  }

  const items = itemsText.split('\n').map(s => s.trim()).filter(s => s);

  if(items.length < 2 || items.length > 12) {
    showToast('2~12개 항목 필요');
    return;
  }

  lotteryState.items = items;
  lotteryState.mode = 'roulette';
  lotteryState.phase = 'playing';
  lotteryState.currentRotation = 0;

  const stateToSend = {
    mode: 'roulette',
    phase: 'playing',
    items: items,
    currentRotation: 0
  };

  broadcast({ type: 'lottery-state', state: stateToSend });
  renderRouletteGame(stateToSend);
}

function pickLotteryCell(index) {
  if(lotteryState.phase !== 'playing') return;

  const cell = lotteryState.grid[index];
  if(!cell || cell.revealed) return;

  if(state.isHost) {
    cell.revealed = true;
    cell.revealedBy = state.myId;

    const update = {
      type: 'lottery-pick',
      index: index,
      item: cell.item,
      playerId: state.myId,
      playerName: state.myName
    };

    broadcast(update);
    handleLotteryPick(update);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({
        type: 'lottery-pick-request',
        index: index,
        playerId: state.myId,
        playerName: state.myName
      }));
    }
  }
}

function handleLotteryPick(msg) {
  const cell = lotteryState.grid[msg.index];
  if(!cell) return;

  cell.revealed = true;
  cell.revealedBy = msg.playerId;
  cell.item = msg.item;

  lotteryState.picked.push({
    playerId: msg.playerId,
    playerName: msg.playerName,
    item: msg.item
  });

  const cellEl = document.querySelector(`[data-cell-index="${msg.index}"]`);
  if(cellEl) {
    cellEl.classList.add('revealed');
    cellEl.innerHTML = `<div class="cell-content">${msg.item}</div>`;
  }

  const pickedCount = lotteryState.grid.filter(c => c.revealed).length;

  if(document.getElementById('pickedCount')) {
    document.getElementById('pickedCount').textContent = pickedCount;
  }

  if(msg.playerId === state.myId) {
    updateMyLotteryResult();
  }

  showToast(`${msg.playerName}: ${msg.item}`);
}

function updateMyLotteryResult() {
  const myPicks = lotteryState.picked.filter(p => p.playerId === state.myId);

  if(myPicks.length > 0) {
    document.getElementById('myLotteryResult').style.display = 'block';
    const list = document.getElementById('myResultList');
    list.innerHTML = myPicks.map((p, i) =>
      `<div class="result-item">${i + 1}. ${p.item}</div>`
    ).join('');
  }
}

function spinRoulette() {
  if(lotteryState.spinning) return;

  const items = lotteryState.items;
  if(!items || items.length < 2) return;

  if(state.isHost) {
    const randomIndex = Math.floor(Math.random() * items.length);
    const resultItem = items[randomIndex];

    const anglePerItem = 360 / items.length;
    const targetAngle = randomIndex * anglePerItem;
    const fullRotations = 5 + Math.floor(Math.random() * 3);
    const totalRotation = lotteryState.currentRotation + (fullRotations * 360) + (360 - targetAngle);

    const spinData = {
      type: 'roulette-spin',
      resultItem: resultItem,
      resultIndex: randomIndex,
      totalRotation: totalRotation
    };

    broadcast(spinData);
    handleRouletteSpin(spinData);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({
        type: 'roulette-spin-request',
        playerId: state.myId,
        playerName: state.myName
      }));
    }
  }
}

function handleRouletteSpin(msg) {
  lotteryState.spinning = true;
  lotteryState.currentRotation = msg.totalRotation;

  const wheel = document.getElementById('rouletteWheel');
  const btn = document.getElementById('rouletteSpinBtn');
  const resultDisplay = document.getElementById('rouletteResultDisplay');

  if(btn) btn.disabled = true;
  if(resultDisplay) resultDisplay.style.display = 'none';

  if(wheel) {
    wheel.style.transform = `rotate(${msg.totalRotation}deg)`;
  }

  setTimeout(() => {
    lotteryState.spinning = false;
    if(btn) btn.disabled = false;

    if(resultDisplay) {
      resultDisplay.style.display = 'block';
      document.getElementById('rouletteResultText').textContent = msg.resultItem;
    }

    showToast(`🎉 결과: ${msg.resultItem}`);
  }, 4000);
}

function switchLotteryMode(mode) {
  lotteryState.mode = mode;

  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.remove('active');
  });

  document.querySelector(`[data-mode="${mode}"]`)?.classList.add('active');

  if(mode === 'lottery') {
    document.getElementById('lotteryModeContainer').style.display = 'flex';
    document.getElementById('rouletteModeContainer').style.display = 'none';

    if(state.isHost && lotteryState.phase === 'setup') {
      renderLotterySetup();
    }
  } else {
    document.getElementById('lotteryModeContainer').style.display = 'none';
    document.getElementById('rouletteModeContainer').style.display = 'flex';

    if(state.isHost && lotteryState.phase === 'setup') {
      renderRouletteSetup();
    }
  }
}

function renderLotterySetup() {
  const isHost = state.isHost;

  document.getElementById('lotterySetupPanel').style.display = isHost ? 'block' : 'none';
  document.getElementById('lotteryGridContainer').style.display = 'none';
  document.getElementById('myLotteryResult').style.display = 'none';

  if(!isHost) {
    document.getElementById('lotteryModeContainer').innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <div class="spinner"></div>
        <div style="color:var(--text-dim);font-size:14px;">호스트가 설정 중...</div>
      </div>
    `;
  }
}

function renderRouletteSetup() {
  const isHost = state.isHost;

  document.getElementById('rouletteSetupPanel').style.display = isHost ? 'block' : 'none';
  document.getElementById('rouletteDisplayContainer').style.display = 'none';

  if(!isHost) {
    document.getElementById('rouletteModeContainer').innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <div class="spinner"></div>
        <div style="color:var(--text-dim);font-size:14px;">호스트가 설정 중...</div>
      </div>
    `;
  }
}

function renderLotteryGame(stateData) {
  lotteryState.grid = stateData.grid;
  lotteryState.gridSize = stateData.gridSize;
  lotteryState.items = stateData.items;
  lotteryState.phase = 'playing';
  lotteryState.picked = [];

  document.getElementById('lotterySetupPanel').style.display = 'none';
  document.getElementById('lotteryGridContainer').style.display = 'flex';
  document.getElementById('myLotteryResult').style.display = 'none';

  const grid = document.getElementById('lotteryGrid');
  grid.style.gridTemplateColumns = `repeat(${stateData.gridSize}, 1fr)`;

  const totalCount = stateData.grid.length;
  document.getElementById('totalCount').textContent = totalCount;
  document.getElementById('pickedCount').textContent = '0';

  grid.innerHTML = stateData.grid.map((cell, i) => `
    <div class="lottery-cell" data-cell-index="${i}" onclick="pickLotteryCell(${i})">
      <div class="cell-content">?</div>
    </div>
  `).join('');
}

function renderRouletteGame(stateData) {
  lotteryState.items = stateData.items;
  lotteryState.phase = 'playing';
  lotteryState.currentRotation = stateData.currentRotation || 0;

  document.getElementById('rouletteSetupPanel').style.display = 'none';
  document.getElementById('rouletteDisplayContainer').style.display = 'flex';
  document.getElementById('rouletteResultDisplay').style.display = 'none';

  drawRouletteWheel(stateData.items);
}

function drawRouletteWheel(items) {
  const canvas = document.getElementById('rouletteCanvas');
  if(!canvas) return;

  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 10;

  const anglePerItem = (2 * Math.PI) / items.length;

  const colors = [
    '#ff6b35', '#00e5ff', '#ff2d78', '#ffd700',
    '#76ff03', '#e040fb', '#ff6e40', '#18ffff',
    '#ffab40', '#69f0ae', '#ea80fc', '#ff80ab'
  ];

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  items.forEach((item, i) => {
    const startAngle = i * anglePerItem - Math.PI / 2;
    const endAngle = startAngle + anglePerItem;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();

    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(startAngle + anglePerItem / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Noto Sans KR"';
    ctx.fillText(item, radius * 0.6, 5);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
  ctx.fillStyle = '#1c1c3a';
  ctx.fill();
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function handleLotteryMessage(peerId, msg) {
  if(msg.type === 'lottery-state') {
    showScreen('lotteryGame');

    if(msg.state.mode === 'lottery') {
      switchLotteryMode('lottery');
      renderLotteryGame(msg.state);
    } else {
      switchLotteryMode('roulette');
      renderRouletteGame(msg.state);
    }
  }
  else if(msg.type === 'lottery-pick-request') {
    if(state.isHost) {
      const cell = lotteryState.grid[msg.index];
      if(cell && !cell.revealed) {
        cell.revealed = true;
        cell.revealedBy = msg.playerId;

        const response = {
          type: 'lottery-pick',
          index: msg.index,
          item: cell.item,
          playerId: msg.playerId,
          playerName: msg.playerName
        };

        broadcast(response);
        handleLotteryPick(response);
      }
    }
  }
  else if(msg.type === 'lottery-pick') {
    handleLotteryPick(msg);
  }
  else if(msg.type === 'roulette-spin-request') {
    if(state.isHost && !lotteryState.spinning) {
      spinRoulette();
    }
  }
  else if(msg.type === 'roulette-spin') {
    handleRouletteSpin(msg);
  }
}

// ===== UP DOWN ENGINE =====

let udState = {
  deck: [],
  deckIdx: 0,
  currentCard: null,
  previousCard: null,
  turnIdx: 0,
  players: [],
  phase: 'playing',
  penalties: [],
  currentBet: null,
  specialData: null,
};

function startUpDown() {
  if(!state.isHost) return;

  const deck = [];
  const suits = ['\u2660','\u2665','\u2666','\u2663'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  for(const suit of suits) {
    for(const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  for(let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  udState = {
    deck,
    deckIdx: 0,
    currentCard: deck[0],
    previousCard: null,
    turnIdx: 0,
    players: state.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
    })),
    phase: 'playing',
    penalties: ['\uc18c\uc8fc 1\uc794', '\ub9c9\uac78\ub9ac 1\uc794', '\ud3ed\ud0c4\uc8fc 1\uc794'],
    currentBet: null,
    specialData: null,
  };

  udState.deckIdx = 1;

  broadcast({ type: 'game-start', game: 'updown', state: getUpDownView() });
  showScreen('updownGame');
  renderUpDownView(getUpDownView());
}

function getUpDownView() {
  return {
    currentCard: udState.currentCard,
    previousCard: udState.previousCard,
    deckRemaining: udState.deck.length - udState.deckIdx,
    turnIdx: udState.turnIdx,
    players: udState.players,
    phase: udState.phase,
    penalties: udState.penalties,
    currentBet: udState.currentBet,
    specialData: udState.specialData,
  };
}

function broadcastUpDownState() {
  const view = getUpDownView();
  broadcast({ type: 'ud-state', state: view });
  renderUpDownView(view);
}

function renderUpDownView(view) {
  if(!view) return;

  const currentPlayer = view.players[view.turnIdx];
  document.getElementById('updownTurnName').textContent =
    currentPlayer.id === state.myId ? '\ub0b4 \ucc28\ub840!' : currentPlayer.name + '\uc758 \ucc28\ub840';

  document.getElementById('updownDeckCount').textContent = '\ub0a8\uc740 \uce74\ub4dc: ' + view.deckRemaining;

  const prevSlot = document.getElementById('updownPrevCard');
  if(view.previousCard) {
    prevSlot.innerHTML =
      '<div class="ud-card-label">\uc774\uc804</div>' +
      updownCardHTML(view.previousCard, false);
  } else {
    prevSlot.innerHTML =
      '<div class="ud-card-label">\uc774\uc804</div>' +
      '<div class="ud-prev-placeholder"></div>';
  }

  const currSlot = document.getElementById('updownCurrentCard');
  currSlot.innerHTML =
    '<div class="ud-card-label">\ud604\uc7ac \uce74\ub4dc</div>' +
    updownCardHTML(view.currentCard, true);

  setTimeout(() => {
    const card = currSlot.querySelector('.ud-hero-card');
    if(card) card.classList.add('ud-flipping');
  }, 100);

  const penaltyItems = document.getElementById('updownPenaltyItems');
  penaltyItems.innerHTML = view.penalties.slice(-5).map(p =>
    '<div class="ud-penalty-item">\ud83c\udf7a ' + p + '</div>'
  ).join('');

  const isMyTurn = currentPlayer.id === state.myId;
  const choiceButtons = document.getElementById('updownChoiceButtons').querySelectorAll('.ud-btn');
  choiceButtons.forEach(btn => btn.disabled = !isMyTurn || view.phase !== 'playing');

  document.getElementById('updownSpecialJQ').style.display = 'none';
  document.getElementById('updownSpecialK').style.display = 'none';

  if(isMyTurn && view.phase === 'special_jq') {
    showUpDownJQArea(view);
  } else if(isMyTurn && view.phase === 'special_k') {
    showUpDownKArea(view);
  }

  const resultDiv = document.getElementById('updownResult');
  if(view.phase === 'result' && view.specialData?.result) {
    resultDiv.textContent = view.specialData.result;
    resultDiv.style.color = view.specialData.correct ? 'var(--success)' : 'var(--danger)';
  } else {
    resultDiv.textContent = '';
  }
}

function updownCardHTML(card, isCurrent) {
  if(!card) {
    return isCurrent
      ? '<div class="ud-hero-card ud-card-back"><div class="ud-hero-inner"><div class="ud-hero-back-pattern"></div></div></div>'
      : '<div class="ud-prev-placeholder"></div>';
  }

  const isRed = card.suit === '\u2665' || card.suit === '\u2666';
  const colorClass = isRed ? 'ud-red' : 'ud-black';

  if(isCurrent) {
    return '<div class="ud-hero-card ' + colorClass + '">' +
      '<div class="ud-hero-inner">' +
        '<div class="ud-hero-corner">' +
          '<span class="ud-hero-rank">' + card.rank + '</span>' +
          '<span class="ud-hero-suit-sm">' + card.suit + '</span>' +
        '</div>' +
        '<div class="ud-hero-center">' + card.suit + '</div>' +
        '<div class="ud-hero-corner ud-corner-bottom">' +
          '<span class="ud-hero-rank">' + card.rank + '</span>' +
          '<span class="ud-hero-suit-sm">' + card.suit + '</span>' +
        '</div>' +
      '</div></div>';
  } else {
    return '<div class="ud-prev-card ' + colorClass + '">' +
      '<div class="ud-prev-inner">' +
        '<div class="ud-prev-corner">' +
          '<span class="ud-prev-rank">' + card.rank + '</span>' +
          '<span class="ud-prev-suit-sm">' + card.suit + '</span>' +
        '</div>' +
        '<div class="ud-prev-center">' + card.suit + '</div>' +
      '</div></div>';
  }
}

function udChoice(choice) {
  if(state.isHost) {
    processUpDownChoice(state.myId, choice);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'ud-choice', choice }));
    }
  }
}

function processUpDownChoice(playerId, choice) {
  if(!state.isHost || udState.phase !== 'playing') return;

  const playerIdx = udState.players.findIndex(p => p.id === playerId);
  if(playerIdx !== udState.turnIdx) return;

  if(udState.deckIdx >= udState.deck.length) {
    showToast('\uce74\ub4dc\uac00 \ubaa8\ub450 \uc18c\uc9c4\ub418\uc5c8\uc2b5\ub2c8\ub2e4!');
    return;
  }

  const nextCard = udState.deck[udState.deckIdx];
  const currentValue = getCardValue(udState.currentCard);
  const nextValue = getCardValue(nextCard);

  let correct = false;
  if(choice === 'up') {
    correct = nextValue > currentValue;
  } else if(choice === 'down') {
    correct = nextValue < currentValue;
  }

  if(nextValue === currentValue) correct = false;

  udState.previousCard = udState.currentCard;
  udState.currentCard = nextCard;
  udState.deckIdx++;

  if(correct) {
    udState.specialData = { result: '\uc815\ub2f5!', correct: true };
    udState.phase = 'result';
    broadcastUpDownState();

    setTimeout(() => {
      if(!state.isHost || !udState) return;
      udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
      udState.phase = 'playing';
      udState.specialData = null;
      broadcastUpDownState();
    }, 1500);

  } else {
    udState.specialData = { result: '\ud2c0\ub838\ub2e4!', correct: false };

    const rank = nextCard.rank;
    if(rank === 'J' || rank === 'Q') {
      udState.phase = 'special_jq';
      udState.specialData.type = 'jq';
      udState.specialData.requesterId = playerId;
      broadcastUpDownState();
    } else if(rank === 'K') {
      udState.phase = 'special_k';
      udState.specialData.type = 'k';
      udState.specialData.kingId = playerId;
      broadcastUpDownState();
    } else {
      udState.phase = 'penalty';
      const penaltyText = udState.currentBet || udState.penalties[Math.floor(Math.random() * udState.penalties.length)];
      showUpDownPenalty(playerId, penaltyText);
    }
  }
}

function getCardValue(card) {
  const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  return values[card.rank] || 0;
}

function udAddBet() {
  const input = document.getElementById('updownBetInput');
  const text = input.value.trim();
  if(!text) {
    showToast('\ubc8c\uce59 \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694');
    return;
  }

  if(state.isHost) {
    udState.penalties.push(text);
    udState.currentBet = text;
    input.value = '';
    showToast('\ubc8c\uce59\uc774 \ucd94\uac00\ub418\uc5c8\uc2b5\ub2c8\ub2e4!');
    broadcastUpDownState();
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'ud-addbet', text }));
    }
    input.value = '';
    showToast('\ubc8c\uce59 \ucd94\uac00 \uc694\uccad!');
  }
}

function showUpDownJQArea(view) {
  const area = document.getElementById('updownSpecialJQ');
  area.style.display = 'flex';

  const select = document.getElementById('updownJQPlayerSelect');
  select.innerHTML = view.players
    .filter(p => p.id !== state.myId)
    .map((p, i) =>
      '<div class="ud-player-option" data-pid="' + p.id + '" onclick="selectUpDownPlayer(\'' + p.id + '\', \'jq\')">' +
        '<div class="player-avatar-sm" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div>' + p.name + '</div>' +
      '</div>'
    ).join('');
}

function showUpDownKArea(view) {
  const area = document.getElementById('updownSpecialK');
  area.style.display = 'flex';

  const select = document.getElementById('updownKPlayerSelect');
  select.innerHTML = view.players
    .filter(p => p.id !== state.myId)
    .map((p, i) =>
      '<div class="ud-player-option" data-pid="' + p.id + '" onclick="selectUpDownPlayer(\'' + p.id + '\', \'k\')">' +
        '<div class="player-avatar-sm" style="background:' + PLAYER_COLORS[i % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div>' + p.name + '</div>' +
      '</div>'
    ).join('');
}

let selectedUpDownPlayers = [];

function selectUpDownPlayer(pid, type) {
  if(type === 'jq') {
    selectedUpDownPlayers = [pid];
    document.querySelectorAll('#updownJQPlayerSelect .ud-player-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.pid === pid);
    });
  } else if(type === 'k') {
    if(selectedUpDownPlayers.includes(pid)) {
      selectedUpDownPlayers = selectedUpDownPlayers.filter(id => id !== pid);
    } else {
      if(selectedUpDownPlayers.length < 3) {
        selectedUpDownPlayers.push(pid);
      } else {
        showToast('\ucd5c\ub300 3\uba85\uae4c\uc9c0 \uc120\ud0dd \uac00\ub2a5');
        return;
      }
    }

    document.querySelectorAll('#updownKPlayerSelect .ud-player-option').forEach(el => {
      el.classList.toggle('selected', selectedUpDownPlayers.includes(el.dataset.pid));
    });
  }
}

function udBlackKnight() {
  if(selectedUpDownPlayers.length === 0) {
    showToast('\ub300\uc0c1\uc744 \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  const targetId = selectedUpDownPlayers[0];

  if(state.isHost) {
    processBlackKnight(state.myId, targetId);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'ud-special', action: 'blackknight', targetId }));
    }
  }

  selectedUpDownPlayers = [];
}

function processBlackKnight(requesterId, targetId) {
  if(!state.isHost) return;

  const penaltyText = udState.currentBet || udState.penalties[Math.floor(Math.random() * udState.penalties.length)];
  const requester = udState.players.find(p => p.id === requesterId);

  udState.specialData = {
    type: 'bk_request',
    requesterId,
    targetId,
    penaltyText,
    requesterName: requester.name,
  };

  const msg = {
    type: 'ud-bk-request',
    requesterId,
    requesterName: requester.name,
    penaltyText,
  };

  if(targetId === state.myId) {
    showUpDownBKModal(msg);
  } else {
    sendTo(targetId, msg);
  }

  showToast('\ud751\uae30\uc0ac \uc694\uccad \uc804\uc1a1!');
}

function showUpDownBKModal(data) {
  const modal = document.getElementById('updownBKModal');
  document.getElementById('updownBKText').textContent = data.penaltyText;
  document.getElementById('updownBKWho').textContent = data.requesterName + '\ub2d8\uc758 \uc694\uccad';
  modal.classList.add('active');

  modal.dataset.requesterId = data.requesterId;
  modal.dataset.penaltyText = data.penaltyText;
}

function udAcceptBK() {
  const modal = document.getElementById('updownBKModal');
  const requesterId = modal.dataset.requesterId;
  const penaltyText = modal.dataset.penaltyText;

  modal.classList.remove('active');

  if(state.isHost) {
    resolveBKAccept(requesterId, state.myId, penaltyText);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({
        type: 'ud-bk-response',
        accepted: true,
        requesterId
      }));
    }
  }
}

function udRejectBK() {
  const modal = document.getElementById('updownBKModal');
  const requesterId = modal.dataset.requesterId;
  const penaltyText = modal.dataset.penaltyText;

  modal.classList.remove('active');

  if(state.isHost) {
    resolveBKReject(requesterId, state.myId, penaltyText);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({
        type: 'ud-bk-response',
        accepted: false,
        requesterId
      }));
    }
  }
}

function resolveBKAccept(requesterId, acceptorId, penaltyText) {
  showUpDownPenalty(acceptorId, penaltyText);
  showToast('\ud751\uae30\uc0ac\uac00 \ubc8c\uce59\uc744 \ubc1b\uc558\uc2b5\ub2c8\ub2e4!');
}

function resolveBKReject(requesterId, rejectId, penaltyText) {
  const targets = udState.players
    .filter(p => p.id !== requesterId && p.id !== rejectId)
    .map(p => p.id);

  targets.forEach(tid => {
    showUpDownPenalty(tid, penaltyText);
  });

  showToast('\uac70\uc808! \ub098\uba38\uc9c0 \ubaa8\ub450 \ubc8c\uce59!');
}

function udKingPenalty() {
  if(selectedUpDownPlayers.length === 0) {
    showToast('\ucd5c\uc18c 1\uba85\uc744 \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  if(state.isHost) {
    processKingPenalty(state.myId, selectedUpDownPlayers);
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({
        type: 'ud-special',
        action: 'king',
        targets: selectedUpDownPlayers
      }));
    }
  }

  selectedUpDownPlayers = [];
}

function processKingPenalty(kingId, targets) {
  if(!state.isHost) return;

  const penaltyText = udState.currentBet || '\uc655\uc758 \uba85\ub839: ' + udState.penalties[Math.floor(Math.random() * udState.penalties.length)];

  targets.forEach(tid => {
    showUpDownPenalty(tid, penaltyText);
  });

  showToast('\uc655\uc758 \ubc8c\uce59\uc774 \ub0b4\ub824\uc84c\uc2b5\ub2c8\ub2e4!');

  setTimeout(() => {
    if(!state.isHost || !udState) return;
    udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
    udState.phase = 'playing';
    udState.specialData = null;
    udState.currentBet = null;
    broadcastUpDownState();
  }, 2000);
}

function showUpDownPenalty(playerId, penaltyText) {
  const msg = {
    type: 'ud-penalty',
    playerId,
    penaltyText,
  };

  broadcast(msg);
  handleUpDownPenalty(msg);
}

function handleUpDownPenalty(data) {
  if(data.playerId !== state.myId) return;

  const modal = document.getElementById('updownPenaltyModal');
  document.getElementById('updownPenaltyText').textContent = data.penaltyText;
  document.getElementById('updownPenaltyWho').textContent = '\ub2f9\uc2e0\uc758 \ubc8c\uce59\uc785\ub2c8\ub2e4!';
  modal.classList.add('active');

  modal.dataset.penaltyText = data.penaltyText;
}

function udAcceptPenalty() {
  const modal = document.getElementById('updownPenaltyModal');
  modal.classList.remove('active');

  showToast('\ubc8c\uce59 \uc218\ud589!');

  if(state.isHost) {
    continueUpDown();
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'ud-penalty-done' }));
    }
  }
}

function udRejectPenalty() {
  const modal = document.getElementById('updownPenaltyModal');
  modal.classList.remove('active');

  showToast('\uc220 \ub9c8\uc2dc\uae30\ub85c \ub300\uccb4!');

  if(state.isHost) {
    continueUpDown();
  } else {
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'ud-penalty-done' }));
    }
  }
}

function continueUpDown() {
  if(!state.isHost) return;

  udState.turnIdx = (udState.turnIdx + 1) % udState.players.length;
  udState.phase = 'playing';
  udState.specialData = null;
  udState.currentBet = null;
  broadcastUpDownState();
}

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

function startYahtzee() {
  if(!state.isHost || state.players.length < 2) {
    showToast('\ucd5c\uc18c 2\uba85 \ud544\uc694');
    return;
  }

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
  const host = Object.values(state.connections)[0];
  if(host?.open) {
    host.send(JSON.stringify({ type: 'yah-action', action: 'roll' }));
  }
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
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'yah-action', action: 'hold', index: idx }));
    }
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
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'yah-action', action: 'select', category: cat }));
    }
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
    const host = Object.values(state.connections)[0];
    if(host?.open) {
      host.send(JSON.stringify({ type: 'yah-action', action: 'score' }));
    }
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

  yahState.dice = [1, 1, 1, 1, 1];
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
      '<div class="yahtzee-player-mini-name">' + p.name + '</div>' +
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
    if(isRolling) {
      comboLabel.classList.remove('visible');
      setTimeout(() => {
        comboLabel.textContent = getYahtzeeComboName(view.dice);
        comboLabel.classList.add('visible');
      }, 900);
    } else if(view.rollsLeft < 3) {
      comboLabel.textContent = getYahtzeeComboName(view.dice);
      comboLabel.classList.add('visible');
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
    const name = isMe ? 'ME' : p.name.slice(0, 4);
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
        '<div class="yahtzee-rank-name">' + p.name + (p.id === state.myId ? ' (\ub098)' : '') + '</div>' +
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
  if(state.isHost) {
    showScreen('lobby');
  } else {
    leaveLobby();
  }
}

// ===== E CARD ENGINE =====
let ecState = {
  player1: { id: '', name: '', avatar: '', role: 'emperor', cards: [], played: null },
  player2: { id: '', name: '', avatar: '', role: 'slave', cards: [], played: null },
  round: 1,
  maxRounds: 5,
  score: { emperor: 0, slave: 0 },
  bet: 100,
  betProposed: null,
  betAccepted: false,
  phase: 'role-assign',
  selectedCard: null,
};

function startECard() {
  if (state.players.length !== 2) {
    showToast('E\uce74\ub4dc\ub294 \uc815\ud655\ud788 2\uba85\ub9cc \ud50c\ub808\uc774 \uac00\ub2a5\ud569\ub2c8\ub2e4');
    return;
  }

  const roles = ['emperor', 'slave'];
  const shuffled = roles.sort(() => Math.random() - 0.5);

  ecState = {
    player1: {
      id: state.players[0].id,
      name: state.players[0].name,
      avatar: state.players[0].avatar,
      role: shuffled[0],
      cards: shuffled[0] === 'emperor'
        ? ['emperor', 'citizen', 'citizen', 'citizen', 'citizen']
        : ['slave', 'dummy', 'citizen', 'citizen', 'citizen'],
      played: null,
    },
    player2: {
      id: state.players[1].id,
      name: state.players[1].name,
      avatar: state.players[1].avatar,
      role: shuffled[1],
      cards: shuffled[1] === 'emperor'
        ? ['emperor', 'citizen', 'citizen', 'citizen', 'citizen']
        : ['slave', 'dummy', 'citizen', 'citizen', 'citizen'],
      played: null,
    },
    round: 1,
    maxRounds: 5,
    score: { emperor: 0, slave: 0 },
    bet: 100,
    betProposed: null,
    betAccepted: false,
    phase: 'betting',
    selectedCard: null,
  };

  state.ecard = ecState;
  broadcastECardState();
  showScreen('ecardGame');
}

function broadcastECardState() {
  const ec = state.ecard;

  [ec.player1, ec.player2].forEach(p => {
    const opponent = p === ec.player1 ? ec.player2 : ec.player1;
    const view = {
      type: 'ec-state',
      myId: p.id,
      myRole: p.role,
      myCards: p.cards,
      myPlayed: p.played,
      myName: p.name,
      myAvatar: p.avatar,
      oppId: opponent.id,
      oppName: opponent.name,
      oppAvatar: opponent.avatar,
      oppRole: opponent.role,
      oppCardsCount: opponent.cards.length,
      oppPlayed: opponent.played,
      round: ec.round,
      maxRounds: ec.maxRounds,
      score: ec.score,
      bet: ec.bet,
      betProposed: ec.betProposed,
      betAccepted: ec.betAccepted,
      phase: ec.phase,
    };

    if (p.id === state.myId) {
      renderECardView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

function renderECardView(view) {
  state._ecardView = view;

  document.getElementById('ecardRound').textContent = view.round;
  document.getElementById('ecardScoreEmperor').textContent = view.score.emperor;
  document.getElementById('ecardScoreSlave').textContent = view.score.slave;

  const roleIcon = view.myRole === 'emperor' ? '\ud83d\udc51' : '\u26d3\ufe0f';
  const roleName = view.myRole === 'emperor' ? '\ud669\uc81c' : '\ub178\uc608';
  const roleColor = view.myRole === 'emperor' ? 'var(--gold)' : '#c0c0c0';

  document.getElementById('ecardRoleIcon').textContent = roleIcon;
  document.getElementById('ecardRoleName').textContent = roleName;
  document.getElementById('ecardRoleName').style.color = roleColor;

  const oppIndex = state.players.findIndex(p => p.id === view.oppId);
  document.getElementById('ecardOppAvatar').style.background = PLAYER_COLORS[oppIndex % PLAYER_COLORS.length];
  document.getElementById('ecardOppAvatar').textContent = view.oppAvatar;
  document.getElementById('ecardOppName').textContent = view.oppName;
  document.getElementById('ecardOppCardsCount').textContent = view.oppCardsCount;

  const oppPlayedEl = document.getElementById('ecardOppPlayedCard');
  if (view.phase === 'emperor-play' && view.myRole === 'emperor' && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(null, true, 'ecard-card-opp-small');
  } else if (view.phase === 'reveal' && view.oppPlayed) {
    oppPlayedEl.innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-opp-small');
  } else {
    oppPlayedEl.innerHTML = '';
  }

  document.getElementById('ecardMyCardsCount').textContent = view.myCards.length;
  const myCardsEl = document.getElementById('ecardMyCards');
  myCardsEl.innerHTML = view.myCards.map((card, i) =>
    '<div class="ecard-card ecard-card-' + card + ' ' + (ecState.selectedCard === i ? 'selected' : '') + '"' +
          ' onclick="ecardSelectCard(' + i + ')" data-card-idx="' + i + '">' +
      '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
      '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
    '</div>'
  ).join('');

  const battleArea = document.getElementById('ecardBattleArea');
  if (view.phase === 'reveal' && view.myPlayed && view.oppPlayed) {
    battleArea.style.display = 'flex';
    document.getElementById('ecardBattleOpp').innerHTML = ecardCardHTML(view.oppPlayed, false, 'ecard-card-battle');
    document.getElementById('ecardBattleMy').innerHTML = ecardCardHTML(view.myPlayed, false, 'ecard-card-battle');
  } else {
    battleArea.style.display = 'none';
  }

  const resultTextEl = document.getElementById('ecardResultText');
  if (view.phase === 'result') {
    const result = state.ecard._lastResult;
    if (result) {
      resultTextEl.textContent = result.message;
      resultTextEl.style.color = result.winner === view.myRole ? 'var(--gold)' : 'var(--text-dim)';
    }
  } else {
    resultTextEl.textContent = '';
  }

  const betArea = document.getElementById('ecardBetArea');
  const betResponse = document.getElementById('ecardBetResponse');
  const actionButtons = document.getElementById('ecardActionButtons');
  const waiting = document.getElementById('ecardWaiting');

  betArea.style.display = 'none';
  betResponse.style.display = 'none';
  actionButtons.style.display = 'none';
  waiting.style.display = 'none';

  if (view.phase === 'betting') {
    if (view.myRole === 'slave' && !view.betProposed) {
      betArea.style.display = 'block';
    } else if (view.myRole === 'emperor' && view.betProposed && !view.betAccepted) {
      betResponse.style.display = 'block';
      document.getElementById('ecardBetProposed').textContent = view.betProposed;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '\ubc30\ud305 \ub300\uae30 \uc911...';
    }
  } else if (view.phase === 'slave-play') {
    if (view.myRole === 'slave') {
      actionButtons.style.display = 'flex';
      document.getElementById('ecardSubmitBtn').disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '\ub178\uc608\uac00 \uce74\ub4dc\ub97c \uc120\ud0dd \uc911...';
    }
  } else if (view.phase === 'emperor-play') {
    if (view.myRole === 'emperor') {
      actionButtons.style.display = 'flex';
      document.getElementById('ecardSubmitBtn').disabled = ecState.selectedCard === null;
    } else {
      waiting.style.display = 'flex';
      document.getElementById('ecardWaitingText').textContent = '\ud669\uc81c\uac00 \uce74\ub4dc\ub97c \uc120\ud0dd \uc911...';
    }
  }
}

function ecardCardIcon(card) {
  const icons = {
    emperor: '\ud83d\udc51',
    citizen: '\ud83e\udd35',
    slave: '\u26d3\ufe0f',
    dummy: '\u2753',
  };
  return icons[card] || '?';
}

function ecardCardName(card) {
  const names = {
    emperor: '\ud669\uc81c',
    citizen: '\uc2dc\ubbfc',
    slave: '\ub178\uc608',
    dummy: '\ub354\ubbf8',
  };
  return names[card] || '?';
}

function ecardCardHTML(card, isBack, sizeClass) {
  var cls = sizeClass ? ' ' + sizeClass : '';
  if (isBack) {
    return '<div class="ecard-card ecard-card-back' + cls + '"></div>';
  }
  return '<div class="ecard-card ecard-card-' + card + cls + '">' +
    '<div class="ecard-card-icon">' + ecardCardIcon(card) + '</div>' +
    '<div class="ecard-card-name">' + ecardCardName(card) + '</div>' +
  '</div>';
}

function ecardSelectCard(idx) {
  const view = state._ecardView;
  if (!view) return;

  const canPlay = (view.phase === 'slave-play' && view.myRole === 'slave') ||
                  (view.phase === 'emperor-play' && view.myRole === 'emperor');

  if (!canPlay) return;

  ecState.selectedCard = idx;
  renderECardView(view);
}

document.getElementById('ecardBetSlider').addEventListener('input', function(e) {
  document.getElementById('ecardBetAmount').textContent = e.target.value;
});

function ecardSubmitBet() {
  const bet = parseInt(document.getElementById('ecardBetSlider').value);
  if (state.isHost) {
    processECardBet(state.myId, bet);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify({ type: 'ec-bet', bet }));
  }
}

function ecardAcceptBet() {
  if (state.isHost) {
    processECardBetResponse(state.myId, true);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify({ type: 'ec-bet-response', accept: true }));
  }
}

function ecardRejectBet() {
  if (state.isHost) {
    processECardBetResponse(state.myId, false);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify({ type: 'ec-bet-response', accept: false }));
  }
}

function ecardSubmitCard() {
  if (ecState.selectedCard === null) {
    showToast('\uce74\ub4dc\ub97c \uc120\ud0dd\ud558\uc138\uc694');
    return;
  }

  const view = state._ecardView;
  const cardType = view.myCards[ecState.selectedCard];

  if (state.isHost) {
    processECardPlay(state.myId, cardType, ecState.selectedCard);
  } else {
    const host = Object.values(state.connections)[0];
    if (host?.open) host.send(JSON.stringify({ type: 'ec-play', cardType, cardIdx: ecState.selectedCard }));
  }

  ecState.selectedCard = null;
}

function processECardBet(playerId, bet) {
  if (!state.isHost) return;
  const ec = state.ecard;
  if (ec.phase !== 'betting') return;

  const player = ec.player1.id === playerId ? ec.player1 : ec.player2;
  if (player.role !== 'slave') return;

  ec.betProposed = bet;
  broadcastECardState();
}

function processECardBetResponse(playerId, accept) {
  if (!state.isHost) return;
  const ec = state.ecard;
  if (ec.phase !== 'betting') return;

  const player = ec.player1.id === playerId ? ec.player1 : ec.player2;
  if (player.role !== 'emperor') return;

  if (accept) {
    ec.bet = ec.betProposed;
    ec.betAccepted = true;
    ec.phase = 'slave-play';
    broadcastECardState();
  } else {
    ec.betProposed = null;
    broadcastECardState();
    showToast('\ud669\uc81c\uac00 \ubc30\ud305\uc744 \uac70\uc808\ud588\uc2b5\ub2c8\ub2e4. \ub2e4\uc2dc \uc81c\uc548\ud558\uc138\uc694.');
  }
}

function processECardPlay(playerId, cardType, cardIdx) {
  if (!state.isHost) return;
  const ec = state.ecard;

  const player = ec.player1.id === playerId ? ec.player1 : ec.player2;

  if (ec.phase === 'slave-play' && player.role === 'slave') {
    player.played = cardType;
    player.cards.splice(cardIdx, 1);
    ec.phase = 'emperor-play';
    broadcastECardState();
  } else if (ec.phase === 'emperor-play' && player.role === 'emperor') {
    player.played = cardType;
    player.cards.splice(cardIdx, 1);
    ec.phase = 'reveal';
    broadcastECardState();
    setTimeout(() => ecardReveal(), 1500);
  }
}

function ecardReveal() {
  if (!state.isHost) return;
  const ec = state.ecard;

  const card1 = ec.player1.played;
  const card2 = ec.player2.played;

  const result = ecardJudge(card1, card2);

  let winner = null;
  let message = '';

  if (result === 0) {
    message = '\ubb34\uc2b9\ubd80! (\ub354\ubbf8 \ub610\ub294 \uc2dc\ubbfc vs \uc2dc\ubbfc)';
  } else if (result === 1) {
    winner = ec.player1.role;
    message = ec.player1.name + ' \uc2b9\ub9ac!';
    if (ec.player1.role === 'emperor') ec.score.emperor++;
    else ec.score.slave++;
  } else {
    winner = ec.player2.role;
    message = ec.player2.name + ' \uc2b9\ub9ac!';
    if (ec.player2.role === 'emperor') ec.score.emperor++;
    else ec.score.slave++;
  }

  ec._lastResult = { winner, message };
  ec.phase = 'result';
  broadcastECardState();

  setTimeout(() => {
    if (ec.round >= ec.maxRounds) {
      ecardGameOver();
    } else {
      ecardNextRound();
    }
  }, 3000);
}

function ecardJudge(card1, card2) {
  if (card1 === 'dummy' || card2 === 'dummy') return 0;
  if (card1 === 'citizen' && card2 === 'citizen') return 0;
  if (card1 === 'emperor' && card2 === 'citizen') return 1;
  if (card1 === 'citizen' && card2 === 'emperor') return -1;
  if (card1 === 'citizen' && card2 === 'slave') return 1;
  if (card1 === 'slave' && card2 === 'citizen') return -1;
  if (card1 === 'slave' && card2 === 'emperor') return 1;
  if (card1 === 'emperor' && card2 === 'slave') return -1;
  return 0;
}

function ecardNextRound() {
  if (!state.isHost) return;
  const ec = state.ecard;

  ec.round++;
  ec.player1.played = null;
  ec.player2.played = null;
  ec.betProposed = null;
  ec.betAccepted = false;
  ec.phase = 'betting';
  ec._lastResult = null;

  broadcastECardState();
}

function ecardGameOver() {
  if (!state.isHost) return;
  const ec = state.ecard;

  const emperorScore = ec.score.emperor;
  const slaveScore = ec.score.slave;

  let winnerRole = null;
  let message = '';

  if (emperorScore > slaveScore) {
    winnerRole = 'emperor';
    message = '\ud669\uc81c \uc2b9\ub9ac!';
  } else if (slaveScore > emperorScore) {
    winnerRole = 'slave';
    message = '\ub178\uc608 \uc2b9\ub9ac! \ub300\uc5ed\uc804!';
  } else {
    message = '\ubb34\uc2b9\ubd80!';
  }

  const winner = ec.player1.role === winnerRole ? ec.player1 : (ec.player2.role === winnerRole ? ec.player2 : null);

  const result = {
    type: 'ec-result',
    winnerId: winner?.id,
    winnerName: winner?.name || '\ubb34\uc2b9\ubd80',
    winnerRole,
    message,
    score: ec.score,
  };

  broadcast(result);
  handleECardResult(result);
}

function handleECardResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won);

  document.getElementById('resultTitle').textContent = won ? '\uc2b9\ub9ac!' : (msg.winnerId ? '\ud328\ubc30...' : '\ubb34\uc2b9\ubd80');
  document.getElementById('resultTitle').style.color = won ? 'var(--gold)' : 'var(--text-dim)';
  document.getElementById('winnerName').textContent = msg.message;
  document.getElementById('resultHand').textContent = '\ucd5c\uc885 \uc810\uc218: \ud669\uc81c ' + msg.score.emperor + ' - ' + msg.score.slave + ' \ub178\uc608';
  document.getElementById('resultPot').textContent = '';
  document.getElementById('resultCards').innerHTML = '';
  document.getElementById('resultOverlay').classList.add('active');
}

// ===== SUTDA ENGINE =====

// --- 화투패 정의 ---
const HWATU_DECK = [];
(function buildHwatuDeck() {
  for (let i = 1; i <= 10; i++) {
    const isGwangMonth = [1, 3, 8].includes(i);
    // 광 또는 첫번째 패
    HWATU_DECK.push({ num: i, gwang: isGwangMonth, id: i + 'g' });
    // 비광 또는 두번째 패
    HWATU_DECK.push({ num: i, gwang: false, id: i + 'n' });
  }
})();

// 광 이름
const GWANG_NAMES = { 1: '송학', 3: '사쿠라', 8: '공산' };

// --- 호스트 상태 ---
let sutdaHost = null;

// --- 클라이언트 뷰 ---
let sutdaView = null;

// =========================
// 족보 판정 함수 (핵심!)
// =========================
function getSutdaRank(card1, card2) {
  const n1 = card1.num, n2 = card2.num;
  const g1 = card1.gwang, g2 = card2.gwang;

  // === 광땡 체크 (최상위) ===
  // 38광땡: 3광 + 8광
  if ((n1 === 3 && g1 && n2 === 8 && g2) || (n1 === 8 && g1 && n2 === 3 && g2)) {
    return { rank: 100, name: '38광땡', tier: 'gwangttaeng' };
  }
  // 18광땡: 1광 + 8광
  if ((n1 === 1 && g1 && n2 === 8 && g2) || (n1 === 8 && g1 && n2 === 1 && g2)) {
    return { rank: 99, name: '18광땡', tier: 'gwangttaeng' };
  }
  // 13광땡: 1광 + 3광
  if ((n1 === 1 && g1 && n2 === 3 && g2) || (n1 === 3 && g1 && n2 === 1 && g2)) {
    return { rank: 98, name: '13광땡', tier: 'gwangttaeng' };
  }

  // === 땡 (같은 숫자 2장) ===
  if (n1 === n2) {
    // 장땡(10땡)은 최상위 (광땡보다 위)
    if (n1 === 10) return { rank: 101, name: '장땡', tier: 'ttaeng' };
    const ttRank = 80 + n1; // 1땡=81, ... 9땡=89
    return { rank: ttRank, name: n1 + '땡', tier: 'ttaeng' };
  }

  // === 특수패 체크 ===
  // 암행어사 (4+7): 13광땡, 18광땡만 잡음
  if ((n1 === 4 && n2 === 7) || (n1 === 7 && n2 === 4)) {
    return { rank: 75, name: '암행어사', tier: 'special', special: '47' };
  }
  // 땡잡이 (3+7): 모든 땡을 잡음, 일반패에겐 짐
  if ((n1 === 3 && n2 === 7) || (n1 === 7 && n2 === 3)) {
    return { rank: 74, name: '땡잡이', tier: 'special', special: '37' };
  }
  // 세륙 (6+4): 특수 기능
  if ((n1 === 6 && n2 === 4) || (n1 === 4 && n2 === 6)) {
    return { rank: 73, name: '세륙', tier: 'special', special: '64' };
  }

  // === 끗 (두 수의 합의 일의 자리) ===
  const kkut = (n1 + n2) % 10;
  const mult = n1 * n2; // 같은 끗일 때 곱으로 비교

  if (kkut === 9) {
    return { rank: 60, name: '갑오', tier: 'kkut', kkut: 9, mult: mult };
  }
  if (kkut === 0) {
    return { rank: 50, name: '망통', tier: 'kkut', kkut: 0, mult: mult };
  }
  // 1끗~8끗
  return { rank: 50 + kkut, name: kkut + '끗', tier: 'kkut', kkut: kkut, mult: mult };
}

// =========================
// 대결 판정 함수
// =========================
function sutdaCompare(r1, r2) {
  // === 1순위: 땡잡이(37) - 모든 땡을 잡음 (장땡 포함), 일반패에겐 짐 ===
  if (r1.special === '37' && r2.tier === 'ttaeng') return 1;
  if (r2.special === '37' && r1.tier === 'ttaeng') return -1;
  if (r1.special === '37' && r2.tier !== 'ttaeng') {
    const r1asKkut = { rank: 50, name: '망통', tier: 'kkut', kkut: 0, mult: 21 };
    return sutdaCompare(r1asKkut, r2);
  }
  if (r2.special === '37' && r1.tier !== 'ttaeng') {
    const r2asKkut = { rank: 50, name: '망통', tier: 'kkut', kkut: 0, mult: 21 };
    return sutdaCompare(r1, r2asKkut);
  }

  // === 2순위: 암행어사(47) - 13광땡(98), 18광땡(99)만 잡음 ===
  if (r1.special === '47' && (r2.rank === 99 || r2.rank === 98)) return 1;
  if (r2.special === '47' && (r1.rank === 99 || r1.rank === 98)) return -1;
  if (r1.special === '47') {
    const r1asKkut = { rank: 51, name: '1끗', tier: 'kkut', kkut: 1, mult: 28 };
    return sutdaCompare(r1asKkut, r2);
  }
  if (r2.special === '47') {
    const r2asKkut = { rank: 51, name: '1끗', tier: 'kkut', kkut: 1, mult: 28 };
    return sutdaCompare(r1, r2asKkut);
  }

  // === 3순위: 같은 끗일 때 곱으로 비교 (무승부 없음) ===
  if (r1.rank === r2.rank && r1.tier === 'kkut' && r2.tier === 'kkut') {
    if (r1.mult !== r2.mult) return r1.mult > r2.mult ? 1 : -1;
    return 0;
  }

  // === 일반 rank 비교: 장땡(101) > 38광땡(100) > 18광땡(99) > 13광땡(98) > 9땡~1땡 > ... ===
  return r1.rank > r2.rank ? 1 : r1.rank < r2.rank ? -1 : 0;
}

// =========================
// 화투패 HTML 렌더링
// =========================
function hwatuCardHTML(card, big) {
  if (!card) {
    const cls = big ? 'hwatu-card hwatu-card-big back' : 'hwatu-card back';
    return '<div class="' + cls + '"></div>';
  }
  const sizeClass = big ? 'hwatu-card hwatu-card-big' : 'hwatu-card';
  const typeClass = card.gwang ? 'gwang' : 'normal';
  const monthClass = 'm' + card.num;
  const gwangText = card.gwang ? '<span class="hwatu-gwang-text">' + (GWANG_NAMES[card.num] || '광') + '</span>' : '';
  const monthLabel = card.num + '월';
  return '<div class="' + sizeClass + ' ' + typeClass + ' ' + monthClass + '">' +
    '<span class="hwatu-num">' + card.num + '</span>' +
    '<span class="hwatu-month">' + monthLabel + '</span>' +
    gwangText +
    '</div>';
}

// =========================
// 덱 셔플
// =========================
function shuffleHwatu() {
  const deck = HWATU_DECK.map(c => ({ num: c.num, gwang: c.gwang, id: c.id }));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// =========================
// 게임 시작 (호스트)
// =========================
function startSutda() {
  if (!state.isHost) return;
  if (state.players.length < 2 || state.players.length > 6) {
    showToast('섯다는 2~6인 플레이입니다');
    return;
  }

  const deck = shuffleHwatu();
  let deckIdx = 0;

  const prevHost = sutdaHost;
  const n = state.players.length;

  sutdaHost = {
    deck: deck,
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: [deck[deckIdx++], deck[deckIdx++]],
      chips: prevHost ? (prevHost.players.find(pp => pp.id === p.id)?.chips || 500000) : 500000,
      bet: 0,
      totalBet: 0,
      died: false,
      allIn: false,
      seatIdx: i,
      acted: false,
      rank: null,
      seryukChoice: null, // 'push' or 'chaos' or null
    })),
    pot: 0,
    currentBet: 0,
    phase: 'betting', // betting, seryuk_choice, showdown
    turnIdx: 0,
    dealerIdx: prevHost ? (prevHost.dealerIdx + 1) % n : 0,
    baseBet: 10000, // 기본 판돈
    roundNum: prevHost ? (prevHost.roundNum || 0) + 1 : 1,
    bettingRound: 0,
    lastRaiser: -1,
    seryukPlayerId: null,
    seryukCanChaos: false,
  };

  // 기본 판돈 차감
  sutdaHost.players.forEach(p => {
    const ante = Math.min(sutdaHost.baseBet, p.chips);
    p.chips -= ante;
    p.totalBet += ante;
    sutdaHost.pot += ante;
  });

  // 족보 계산
  sutdaHost.players.forEach(p => {
    p.rank = getSutdaRank(p.cards[0], p.cards[1]);
  });

  // 세륙 체크 - 세륙을 가진 플레이어가 있는지
  const seryukPlayer = sutdaHost.players.find(p => p.rank.special === '64');
  if (seryukPlayer) {
    // 세륙 플레이어가 있으면, 나중에 콜을 먼저 받았을 때 선택
    sutdaHost.seryukPlayerId = seryukPlayer.id;
    // 9땡 이하인 상대가 있어야 깽판 가능
    const others = sutdaHost.players.filter(p => p.id !== seryukPlayer.id);
    sutdaHost.seryukCanChaos = others.some(p => p.rank.rank <= 89);
  }

  // 딜러 다음 사람부터 시작
  sutdaHost.turnIdx = (sutdaHost.dealerIdx + 1) % n;
  // 턴 플레이어 찾기
  sutdaHost.turnIdx = findNextSutdaActive(sutdaHost, sutdaHost.turnIdx);

  broadcastSutdaState();

  // 호스트 자신도 게임 화면 표시
  showScreen('sutdaGame');

  // 다른 플레이어에게 game-start 전송
  state.players.forEach(p => {
    if (p.id !== state.myId) {
      sendTo(p.id, {
        type: 'game-start',
        game: 'sutda',
        state: buildSutdaView(p.id),
      });
    }
  });
}

// =========================
// 다음 활성 플레이어 찾기
// =========================
function findNextSutdaActive(gs, from) {
  let idx = from;
  for (let i = 0; i < gs.players.length; i++) {
    const p = gs.players[idx];
    if (!p.died && !p.allIn) return idx;
    idx = (idx + 1) % gs.players.length;
  }
  return from;
}

// =========================
// 뷰 빌드 (각 플레이어별)
// =========================
function buildSutdaView(forPlayerId) {
  const gs = sutdaHost;
  const isShowdown = gs.phase === 'showdown';

  return {
    type: 'sutda-state',
    players: gs.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      chips: p.chips,
      bet: p.bet,
      totalBet: p.totalBet,
      died: p.died,
      allIn: p.allIn,
      seatIdx: p.seatIdx,
      // 자기 패만 보임, showdown이면 전원 공개 (죽은 사람도)
      cards: (p.id === forPlayerId || isShowdown) ? p.cards : null,
      rank: (p.id === forPlayerId || isShowdown) ? p.rank : null,
      seryukChoice: p.seryukChoice,
    })),
    pot: gs.pot,
    currentBet: gs.currentBet,
    phase: gs.phase,
    turnIdx: gs.turnIdx,
    dealerIdx: gs.dealerIdx,
    roundNum: gs.roundNum,
    baseBet: gs.baseBet,
    seryukPlayerId: gs.seryukPlayerId,
    seryukCanChaos: gs.seryukCanChaos,
  };
}

// =========================
// 상태 브로드캐스트
// =========================
function broadcastSutdaState() {
  const gs = sutdaHost;
  gs.players.forEach(p => {
    const view = buildSutdaView(p.id);
    if (p.id === state.myId) {
      sutdaView = view;
      renderSutdaView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

// =========================
// 뷰 렌더링 (클라이언트)
// =========================
function renderSutdaView(vs) {
  sutdaView = vs;
  showScreen('sutdaGame');

  const me = vs.players.find(p => p.id === state.myId);
  const isMyTurn = vs.players[vs.turnIdx]?.id === state.myId && vs.phase === 'betting' && !me?.died;

  // 상단
  document.getElementById('sutdaPotBadge').textContent = formatChips(vs.pot);
  document.getElementById('sutdaMyBalance').textContent = formatChips(me?.chips || 0);

  // 판돈
  document.getElementById('sutdaPotAmount').textContent = formatChips(vs.pot);

  // 턴 표시
  const turnPlayer = vs.players[vs.turnIdx];
  if (vs.phase === 'betting' && turnPlayer && !turnPlayer.died) {
    document.getElementById('sutdaTurnIndicator').textContent =
      turnPlayer.id === state.myId ? '내 차례' : turnPlayer.name + '의 차례';
  } else if (vs.phase === 'seryuk_choice') {
    document.getElementById('sutdaTurnIndicator').textContent = '세륙 선택 중...';
  } else if (vs.phase === 'showdown') {
    document.getElementById('sutdaTurnIndicator').textContent = '결과 공개!';
  } else {
    document.getElementById('sutdaTurnIndicator').textContent = '';
  }

  // 상대방
  const oppArea = document.getElementById('sutdaOpponents');
  const ops = vs.players.filter(p => p.id !== state.myId);
  oppArea.innerHTML = ops.map(p => {
    const isTurn = vs.players[vs.turnIdx]?.id === p.id && vs.phase === 'betting';
    const pIdx = vs.players.findIndex(pp => pp.id === p.id);
    let statusText = '';
    let statusClass = 'waiting';
    if (p.died) { statusText = '다이'; statusClass = 'die'; }
    else if (p.allIn) { statusText = '올인'; statusClass = 'bet'; }
    else if (p.bet > 0) { statusText = formatChips(p.bet); statusClass = 'bet'; }

    const cardsHTML = p.cards
      ? p.cards.map(c => hwatuCardHTML(c, false)).join('')
      : hwatuCardHTML(null, false) + hwatuCardHTML(null, false);

    return '<div class="sutda-opp-slot' + (p.died ? ' died' : '') + '">' +
      '<div class="sutda-opp-avatar' + (isTurn ? ' active-turn' : '') + '" style="background:' + PLAYER_COLORS[pIdx % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
      '<div class="sutda-opp-name">' + p.name + '</div>' +
      '<div class="sutda-opp-chips">' + formatChips(p.chips) + '</div>' +
      '<div class="sutda-opp-status ' + statusClass + '">' + statusText + '</div>' +
      '<div class="sutda-opp-cards">' + cardsHTML + '</div>' +
      (p.rank && vs.phase === 'showdown' ? '<div style="font-size:11px;color:#ff1744;font-weight:700;margin-top:2px;">' + p.rank.name + '</div>' : '') +
      '</div>';
  }).join('');

  // 내 패
  const myCardsEl = document.getElementById('sutdaMyCards');
  if (me?.cards) {
    myCardsEl.innerHTML = me.cards.map(c => hwatuCardHTML(c, true)).join('');
  } else {
    myCardsEl.innerHTML = hwatuCardHTML(null, true) + hwatuCardHTML(null, true);
  }

  // 내 칩
  document.getElementById('sutdaMyChips').textContent = formatChips(me?.chips || 0);
  document.getElementById('sutdaMyName').textContent = me?.name || '나';

  // 족보 표시
  const rankEl = document.getElementById('sutdaMyRank');
  if (me?.rank) {
    rankEl.textContent = me.rank.name;
  } else {
    rankEl.textContent = '';
  }

  // 세륙 패널
  const seryukPanel = document.getElementById('sutdaSeryukPanel');
  if (vs.phase === 'seryuk_choice' && vs.seryukPlayerId === state.myId) {
    seryukPanel.style.display = 'flex';
  } else {
    seryukPanel.style.display = 'none';
  }

  // 배팅 버튼
  const actionBar = document.getElementById('sutdaActionBar');
  const allBtns = actionBar.querySelectorAll('.sutda-bet-btn');

  if (isMyTurn && vs.phase === 'betting') {
    allBtns.forEach(b => b.disabled = false);

    // 콜 금액 계산
    const toCall = vs.currentBet - (me?.bet || 0);
    const callBtn = document.getElementById('sutdaBtnCall');
    if (toCall > 0) {
      callBtn.textContent = '콜 ' + formatChips(toCall);
    } else {
      callBtn.textContent = '콜';
    }

    // 칩이 부족하면 레이즈 비활성화
    if (me && me.chips <= 0) {
      document.getElementById('sutdaBtn10k').disabled = true;
      document.getElementById('sutdaBtn50k').disabled = true;
      document.getElementById('sutdaBtn100k').disabled = true;
    }
    if (me && me.chips < 10000) document.getElementById('sutdaBtn10k').disabled = true;
    if (me && me.chips < 50000) document.getElementById('sutdaBtn50k').disabled = true;
    if (me && me.chips < 100000) document.getElementById('sutdaBtn100k').disabled = true;
  } else {
    allBtns.forEach(b => b.disabled = true);
  }
}

// =========================
// 칩 포맷
// =========================
function formatChips(n) {
  if (n >= 10000) {
    const man = Math.floor(n / 10000);
    const rest = n % 10000;
    if (rest === 0) return man + '만';
    return man + '만' + rest.toLocaleString();
  }
  return n.toLocaleString();
}

// =========================
// 배팅 액션 (클라이언트)
// =========================
function sutdaBet(action, amount) {
  if (state.isHost) {
    processSutdaAction(state.myId, action, amount);
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'sutda-bet',
        action: action,
        amount: amount,
      }));
    }
  }
}

// =========================
// 세륙 선택 (클라이언트)
// =========================
function sutdaSeryukChoice(choice) {
  document.getElementById('sutdaSeryukPanel').style.display = 'none';
  if (state.isHost) {
    processSutdaSeryuk(state.myId, choice);
  } else {
    const hostConn = Object.values(state.connections)[0];
    if (hostConn?.open) {
      hostConn.send(JSON.stringify({
        type: 'sutda-seryuk',
        choice: choice,
      }));
    }
  }
}

// =========================
// 배팅 처리 (호스트)
// =========================
function processSutdaAction(playerId, action, amount) {
  const gs = sutdaHost;
  if (!gs || gs.phase !== 'betting') return;

  const pIdx = gs.players.findIndex(p => p.id === playerId);
  if (pIdx !== gs.turnIdx) return;

  const player = gs.players[pIdx];
  if (player.died || player.allIn) return;

  const toCall = gs.currentBet - player.bet;

  switch (action) {
    case 'die':
      player.died = true;
      break;

    case 'call': {
      const a = Math.min(toCall, player.chips);
      player.chips -= a;
      player.bet += a;
      player.totalBet += a;
      gs.pot += a;
      if (player.chips === 0) player.allIn = true;
      break;
    }

    case 'raise': {
      // 먼저 콜 금액 + 추가 레이즈
      const raiseTotal = toCall + (amount || 10000);
      const a = Math.min(raiseTotal, player.chips);
      player.chips -= a;
      player.bet += a;
      player.totalBet += a;
      gs.pot += a;
      if (player.bet > gs.currentBet) {
        gs.currentBet = player.bet;
        gs.lastRaiser = pIdx;
      }
      if (player.chips === 0) player.allIn = true;
      // 다른 사람들 acted 리셋
      gs.players.forEach((p, i) => {
        if (i !== pIdx && !p.died && !p.allIn) p.acted = false;
      });
      break;
    }

    case 'allin': {
      const a = player.chips;
      player.bet += a;
      player.totalBet += a;
      gs.pot += a;
      player.chips = 0;
      player.allIn = true;
      if (player.bet > gs.currentBet) {
        gs.currentBet = player.bet;
        gs.lastRaiser = pIdx;
        gs.players.forEach((p, i) => {
          if (i !== pIdx && !p.died && !p.allIn) p.acted = false;
        });
      }
      break;
    }
  }

  player.acted = true;

  // 살아있는 플레이어 수 체크
  const alive = gs.players.filter(p => !p.died);
  if (alive.length === 1) {
    // 혼자 남으면 즉시 승리
    endSutdaRound(alive[0]);
    return;
  }

  // 세륙 체크: 세륙 플레이어가 살아있고, 콜을 받았을 때 (첫 번째 배팅 라운드 종료 시)
  // 세륙 선택은 모든 사람이 한 번씩 배팅을 마친 후 트리거
  const canAct = gs.players.filter(p => !p.died && !p.allIn);
  const allActed = canAct.every(p => p.acted && p.bet >= gs.currentBet);

  if (canAct.length === 0 || allActed) {
    // 세륙 플레이어가 있고, 아직 선택을 안 했으면
    const seryukP = gs.players.find(p => p.id === gs.seryukPlayerId && !p.died);
    if (seryukP && seryukP.seryukChoice === null && gs.phase === 'betting') {
      gs.phase = 'seryuk_choice';
      broadcastSutdaState();
      return;
    }

    // 쇼다운
    resolveSutdaShowdown();
    return;
  }

  // 다음 턴
  gs.turnIdx = findNextSutdaActive(gs, (gs.turnIdx + 1) % gs.players.length);
  broadcastSutdaState();
}

// =========================
// 세륙 처리 (호스트)
// =========================
function processSutdaSeryuk(playerId, choice) {
  const gs = sutdaHost;
  if (!gs || gs.phase !== 'seryuk_choice') return;
  if (playerId !== gs.seryukPlayerId) return;

  const seryukP = gs.players.find(p => p.id === playerId);
  if (!seryukP) return;

  seryukP.seryukChoice = choice;

  if (choice === 'push') {
    // 밀기: 숫자 10으로써 기능 → 10%10=0끗=망통
    seryukP.rank = { rank: 50, name: '세륙밀기(망통)', tier: 'kkut', kkut: 0, mult: 24, special: null };
    gs.phase = 'betting';
    // 배팅 계속 (추가 라운드 없이 바로 showdown)
    resolveSutdaShowdown();
  } else if (choice === 'chaos') {
    // 깽판: 9땡 이하인 경우만 가능
    // 살아있는 유저 전원 패 재분배
    const alive = gs.players.filter(p => !p.died);
    // 9땡 이상이면 깽판 불가 (38광땡, 18광땡, 13광땡, 장땡)
    const hasHighHand = alive.some(p => p.id !== playerId && p.rank.rank >= 90);
    if (hasHighHand) {
      // 깽판 실패 - 밀기로 강제 전환 (망통)
      seryukP.rank = { rank: 50, name: '세륙밀기(망통)', tier: 'kkut', kkut: 0, mult: 24, special: null };
      showToast('상대에게 장땡 이상이 있어 깽판 실패!');
    } else {
      // 패 재분배
      const newDeck = shuffleHwatu();
      let newIdx = 0;
      alive.forEach(p => {
        p.cards = [newDeck[newIdx++], newDeck[newIdx++]];
        p.rank = getSutdaRank(p.cards[0], p.cards[1]);
        p.seryukChoice = null;
      });
      // 세륙 상태 리셋
      gs.seryukPlayerId = null;
      // 새로운 패에서 세륙이 또 나올 수 있음
      const newSeryuk = alive.find(p => p.rank.special === '64');
      if (newSeryuk) {
        gs.seryukPlayerId = newSeryuk.id;
        gs.seryukCanChaos = alive.some(p => p.id !== newSeryuk.id && p.rank.rank <= 89);
        // 다시 세륙 선택
        gs.phase = 'seryuk_choice';
        broadcastSutdaState();
        return;
      }
    }
    gs.phase = 'betting';
    resolveSutdaShowdown();
  }
}

// =========================
// 쇼다운 (결과 판정)
// =========================
function resolveSutdaShowdown() {
  const gs = sutdaHost;
  gs.phase = 'showdown';

  const alive = gs.players.filter(p => !p.died);

  if (alive.length === 0) return;
  if (alive.length === 1) {
    endSutdaRound(alive[0]);
    return;
  }

  // 가장 강한 패 찾기
  let bestPlayer = alive[0];
  for (let i = 1; i < alive.length; i++) {
    const cmp = sutdaCompare(alive[i].rank, bestPlayer.rank);
    if (cmp > 0) bestPlayer = alive[i];
  }

  endSutdaRound(bestPlayer);
}

// =========================
// 라운드 종료
// =========================
function endSutdaRound(winner) {
  const gs = sutdaHost;
  winner.chips += gs.pot;
  gs.phase = 'showdown';

  // 먼저 showdown 뷰를 브로드캐스트
  broadcastSutdaState();

  // 패 공개 순서: 콜을 받는 사람(lastRaiser)이 먼저, 나머지 후에
  const alive = gs.players.filter(p => !p.died);
  const revealOrder = [];
  if (gs.lastRaiser !== undefined && gs.lastRaiser !== null) {
    const firstReveal = gs.players[gs.lastRaiser];
    if (firstReveal && !firstReveal.died) revealOrder.push(firstReveal.id);
  }
  alive.forEach(p => { if (!revealOrder.includes(p.id)) revealOrder.push(p.id); });

  const result = {
    type: 'sutda-result',
    winnerId: winner.id,
    winnerName: winner.name,
    winnerAvatar: winner.avatar,
    winnerCards: winner.cards,
    winnerRank: winner.rank,
    pot: gs.pot,
    revealOrder: revealOrder,
    allHands: gs.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: p.cards,
      rank: p.rank,
      died: p.died,
      seatIdx: p.seatIdx,
    })),
  };

  setTimeout(() => {
    broadcast(result);
    handleSutdaResult(result);
  }, 1200);
}

// =========================
// 결과 표시 (클라이언트)
// =========================
function handleSutdaResult(msg) {
  const won = msg.winnerId === state.myId;
  recordGame(won);

  const overlay = document.getElementById('sutdaResultOverlay');
  document.getElementById('sutdaResultTitle').textContent = won ? '승리!' : '패배...';
  document.getElementById('sutdaResultTitle').style.color = won ? 'var(--gold)' : 'var(--text-dim)';
  document.getElementById('sutdaResultWinner').textContent = msg.winnerName + ' ' + msg.winnerAvatar;
  document.getElementById('sutdaResultRank').textContent = msg.winnerRank ? msg.winnerRank.name : '';
  document.getElementById('sutdaResultCards').innerHTML = msg.winnerCards
    ? msg.winnerCards.map(c => hwatuCardHTML(c, true)).join('')
    : '';
  document.getElementById('sutdaResultPot').textContent = formatChips(msg.pot);

  // 전체 결과 표시 (순차 공개: 콜 받은 사람 먼저)
  const allEl = document.getElementById('sutdaResultAllHands');
  allEl.innerHTML = '';

  const order = msg.revealOrder || msg.allHands.map(h => h.id);
  const sortedHands = [];
  order.forEach(id => {
    const h = msg.allHands.find(x => x.id === id);
    if (h) sortedHands.push(h);
  });
  msg.allHands.forEach(h => { if (!sortedHands.includes(h)) sortedHands.push(h); });

  sortedHands.forEach((h, idx) => {
    const isWinner = h.id === msg.winnerId;
    const isDied = h.died;
    const rowClass = 'sutda-result-hand-row' + (isWinner ? ' winner-row' : '') + (isDied ? ' died-row' : '');
    const pIdx = h.seatIdx;
    const rowHTML = '<div class="' + rowClass + '" style="opacity:0;animation:sutdaReveal 0.4s ease ' + (idx * 0.6) + 's forwards;">' +
      '<div class="sutda-result-hand-avatar" style="background:' + PLAYER_COLORS[pIdx % PLAYER_COLORS.length] + ';">' + h.avatar + '</div>' +
      '<div class="sutda-result-hand-name">' + h.name + (isWinner ? ' (승)' : '') + (isDied ? ' (다이)' : '') + (idx === 0 && !isDied ? ' (선공개)' : '') + '</div>' +
      '<div class="sutda-result-hand-rank">' + (h.rank ? h.rank.name : '-') + '</div>' +
      '<div class="sutda-result-hand-cards">' + (h.cards ? h.cards.map(c => hwatuCardHTML(c, false)).join('') : '') + '</div>' +
      '</div>';
    allEl.innerHTML += rowHTML;
  });

  overlay.classList.add('active');
}

// =========================
// 결과 닫기
// =========================
function closeSutdaResult() {
  document.getElementById('sutdaResultOverlay').classList.remove('active');
  if (state.isHost) {
    // 다음 라운드 시작
    setTimeout(() => startSutda(), 500);
  }
}

// ===== RACING ENGINE =====

let racingState = {
  mode: 'survival', // 'survival' or 'race'
  speed: 30, // km/h
  maxSpeed: 30,
  distance: 0, // meters
  lanePos: 1, // 0=left, 1=center, 2=right
  targetLane: 1,
  obstacles: [], // [{id, lane, y, type: 'car'|'truck'}]
  alive: true,
  players: {}, // {playerId: {distance, alive, maxSpeed}}
  phase: 'menu', // 'menu', 'playing', 'gameover'
  startTime: 0,
  gyroEnabled: false,
  nextObstacleId: 0,
};

let racingLoop = null;
let racingAnimationFrame = null;

function startRacing() {
  if(!state.isHost) return;

  // 멀티플레이어 모드는 기본 구현
  broadcast({ type: 'game-start', game: 'racing', state: {} });
  showScreen('racingGame');
  document.getElementById('racingModeSelect').style.display = 'flex';
}

function selectRacingMode(mode) {
  racingState.mode = mode;
  racingState.phase = 'permission';

  // iOS 체크
  const needsPermission = typeof DeviceOrientationEvent !== 'undefined' &&
                         typeof DeviceOrientationEvent.requestPermission === 'function';

  if(needsPermission) {
    document.getElementById('racingGyroPermission').style.display = 'flex';
  } else {
    // 안드로이드나 데스크톱: 바로 시작
    startRacingGame();
  }
}

function requestGyroPermission() {
  if(typeof DeviceOrientationEvent !== 'undefined' &&
     typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(response => {
        if(response === 'granted') {
          racingState.gyroEnabled = true;
          startRacingGame();
        } else {
          showToast('기울기 권한이 필요합니다');
          // 터치 컨트롤 사용
          startRacingGame();
        }
      })
      .catch(err => {
        console.error('Gyro permission error:', err);
        showToast('터치 컨트롤을 사용합니다');
        startRacingGame();
      });
  } else {
    racingState.gyroEnabled = true;
    startRacingGame();
  }
}

function startRacingGame() {
  // 초기화
  racingState = {
    mode: racingState.mode,
    speed: 30,
    maxSpeed: 30,
    distance: 0,
    lanePos: 1,
    targetLane: 1,
    obstacles: [],
    alive: true,
    players: {},
    phase: 'playing',
    startTime: Date.now(),
    gyroEnabled: racingState.gyroEnabled,
    nextObstacleId: 0,
  };

  // UI 전환
  document.getElementById('racingModeSelect').style.display = 'none';
  document.getElementById('racingGameArea').style.display = 'block';

  // 건물 생성
  generateBuildings();

  // 차선 점선 생성
  generateDashes();

  // 자이로스코프 또는 터치 컨트롤
  if(racingState.gyroEnabled) {
    window.addEventListener('deviceorientation', handleRacingTilt);
  } else {
    document.getElementById('racingTouchControls').style.display = 'flex';
  }

  // 게임 루프 시작
  racingLoop = setInterval(racingTick, 50); // 20 FPS
}

function generateBuildings() {
  const container = document.getElementById('racingBuildings');
  container.innerHTML = '';

  for(let i = 0; i < 15; i++) {
    const building = document.createElement('div');
    building.className = 'racing-building';
    building.style.left = (Math.random() * 100) + '%';
    building.style.width = (30 + Math.random() * 40) + 'px';
    building.style.height = (50 + Math.random() * 100) + 'px';
    building.style.bottom = '0';
    container.appendChild(building);
  }
}

function generateDashes() {
  const container = document.getElementById('racingDashes');
  container.innerHTML = '';

  // 각 차선마다 점선 생성
  const lanes = [16.66, 50, 83.33]; // 각 차선 중앙

  lanes.forEach((lanePercent, laneIdx) => {
    for(let i = 0; i < 8; i++) {
      const dash = document.createElement('div');
      dash.className = 'racing-dash';
      dash.style.left = lanePercent + '%';
      dash.style.top = (i * 100) + 'px';
      dash.style.animationDelay = (-i * 0.125) + 's';
      container.appendChild(dash);
    }
  });
}

function handleRacingTilt(e) {
  if(racingState.phase !== 'playing' || !racingState.alive) return;

  const gamma = e.gamma || 0; // -90 (left) to 90 (right)

  if(gamma < -15) {
    racingState.targetLane = 0;
  } else if(gamma > 15) {
    racingState.targetLane = 2;
  } else {
    racingState.targetLane = 1;
  }
}

function racingMoveLane(lane) {
  if(racingState.phase !== 'playing' || !racingState.alive) return;
  racingState.targetLane = lane;
}

function racingStopMove() {
  // 필요시 구현
}

function racingTick() {
  if(racingState.phase !== 'playing' || !racingState.alive) return;

  const dt = 0.05; // 50ms

  // 속도 증가 (서바이벌 모드)
  if(racingState.mode === 'survival') {
    racingState.speed += 0.1 * dt * 20; // 점진적 증가
    if(racingState.speed > 150) racingState.speed = 150; // 최대 속도
  } else {
    // 레이스 모드: 고정 속도
    racingState.speed = 80;
  }

  racingState.maxSpeed = Math.max(racingState.maxSpeed, racingState.speed);

  // 거리 업데이트
  const distanceDelta = (racingState.speed / 3.6) * dt; // m/s * dt
  racingState.distance += distanceDelta;

  // 레이스 모드: 목표 도달 체크
  if(racingState.mode === 'race' && racingState.distance >= 1000) {
    racingGameOver(true); // 완주
    return;
  }

  // 차선 이동
  racingState.lanePos += (racingState.targetLane - racingState.lanePos) * 0.15;

  // 장애물 생성
  if(Math.random() < 0.02 * (racingState.speed / 30)) { // 속도에 비례
    spawnObstacle();
  }

  // 장애물 이동
  const speedFactor = racingState.speed / 30;
  racingState.obstacles.forEach(obs => {
    obs.y += 5 * speedFactor;
  });

  // 장애물 제거 (화면 밖)
  racingState.obstacles = racingState.obstacles.filter(obs => obs.y < window.innerHeight + 100);

  // 충돌 체크
  checkRacingCollision();

  // UI 업데이트
  updateRacingUI();

  // P2P: 내 위치 전송 (멀티플레이어)
  if(state.isHost && state.players.length > 1) {
    racingState.players[state.myId] = {
      distance: racingState.distance,
      alive: racingState.alive,
      maxSpeed: racingState.maxSpeed,
      name: state.myName,
      avatar: state.myAvatar,
    };

    // 주기적으로 순위 브로드캐스트
    if(Math.random() < 0.1) {
      broadcast({
        type: 'race-position',
        playerId: state.myId,
        distance: racingState.distance,
        alive: racingState.alive,
        maxSpeed: racingState.maxSpeed,
      });
    }
  } else if(!state.isHost) {
    // 게스트: 호스트에게 내 위치 전송
    if(Math.random() < 0.1) {
      sendToHost({
        type: 'race-position',
        playerId: state.myId,
        distance: racingState.distance,
        alive: racingState.alive,
        maxSpeed: racingState.maxSpeed,
        name: state.myName,
        avatar: state.myAvatar,
      });
    }
  }
}

function spawnObstacle() {
  const lane = Math.floor(Math.random() * 3);
  const type = Math.random() < 0.7 ? 'car' : 'truck';

  racingState.obstacles.push({
    id: racingState.nextObstacleId++,
    lane: lane,
    y: -100,
    type: type,
  });
}

function checkRacingCollision() {
  const bikeBottomY = window.innerHeight - 120; // 오토바이 위치
  const bikeLane = Math.round(racingState.lanePos);

  racingState.obstacles.forEach(obs => {
    const obsLane = obs.lane;
    const obsY = obs.y;
    const obsHeight = obs.type === 'truck' ? 80 : 60;

    // 충돌 체크
    if(bikeLane === obsLane &&
       obsY < bikeBottomY + 60 &&
       obsY + obsHeight > bikeBottomY) {
      // 충돌!
      handleRacingCrash();
    }
  });
}

function handleRacingCrash() {
  racingState.alive = false;
  racingState.phase = 'gameover';

  // 효과
  const overlay = document.getElementById('racingCrashOverlay');
  overlay.classList.add('active');

  if(navigator.vibrate) navigator.vibrate([200, 100, 200]);

  setTimeout(() => {
    overlay.classList.remove('active');
    racingGameOver(false);
  }, 500);
}

function updateRacingUI() {
  // 속도
  document.getElementById('racingSpeed').textContent = Math.round(racingState.speed);

  // 거리
  document.getElementById('racingDistance').textContent = Math.round(racingState.distance);

  // 오토바이 위치
  const bike = document.getElementById('racingBike');
  const lanePositions = [10, 36, 62]; // %
  bike.style.left = lanePositions[Math.round(racingState.lanePos)] + '%';

  // 장애물 렌더링
  const container = document.getElementById('racingObstacles');
  const existingIds = Array.from(container.children).map(el => el.dataset.obsId);
  const currentIds = racingState.obstacles.map(obs => obs.id.toString());

  // 제거할 장애물
  existingIds.forEach(id => {
    if(!currentIds.includes(id)) {
      const el = container.querySelector(`[data-obs-id="${id}"]`);
      if(el) el.remove();
    }
  });

  // 추가/업데이트할 장애물
  racingState.obstacles.forEach(obs => {
    let el = container.querySelector(`[data-obs-id="${obs.id}"]`);

    if(!el) {
      el = document.createElement('div');
      el.className = 'racing-obstacle';
      el.dataset.obsId = obs.id;

      const body = document.createElement('div');
      body.className = obs.type === 'truck' ? 'racing-obstacle-truck' : 'racing-obstacle-car';
      el.appendChild(body);

      container.appendChild(el);
    }

    const lanePositions = [10, 36, 62]; // %
    el.style.left = lanePositions[obs.lane] + '%';
    el.style.top = obs.y + 'px';
  });

  // 순위 (멀티플레이어)
  if(state.players.length > 1) {
    const rankEl = document.getElementById('racingRank');
    rankEl.style.display = 'block';

    const allPlayers = Object.values(racingState.players).filter(p => p.alive);
    allPlayers.sort((a, b) => b.distance - a.distance);

    const myRank = allPlayers.findIndex(p => p.distance === racingState.distance) + 1;
    document.getElementById('racingRankValue').textContent = myRank + '위/' + allPlayers.length + '명';
  }
}

function racingGameOver(completed) {
  // 게임 종료
  if(racingLoop) {
    clearInterval(racingLoop);
    racingLoop = null;
  }

  window.removeEventListener('deviceorientation', handleRacingTilt);

  // 결과 전송 (멀티플레이어)
  if(state.isHost && state.players.length > 1) {
    racingState.players[state.myId] = {
      distance: racingState.distance,
      alive: racingState.alive,
      maxSpeed: racingState.maxSpeed,
      time: (Date.now() - racingState.startTime) / 1000,
      name: state.myName,
      avatar: state.myAvatar,
    };

    broadcast({
      type: 'race-result',
      playerId: state.myId,
      distance: racingState.distance,
      maxSpeed: racingState.maxSpeed,
      time: (Date.now() - racingState.startTime) / 1000,
      completed: completed,
    });

    // 모든 결과 대기 후 결과 화면
    setTimeout(() => {
      showRacingResults();
    }, 2000);

  } else if(!state.isHost) {
    // 게스트: 호스트에게 결과 전송
    sendToHost({
      type: 'race-result',
      playerId: state.myId,
      distance: racingState.distance,
      maxSpeed: racingState.maxSpeed,
      time: (Date.now() - racingState.startTime) / 1000,
      completed: completed,
      name: state.myName,
      avatar: state.myAvatar,
    });

    // 결과 대기
    setTimeout(() => {
      showRacingResults();
    }, 2000);

  } else {
    // 싱글플레이어: 바로 결과
    showRacingResults();
  }
}

function showRacingResults() {
  document.getElementById('racingGameArea').style.display = 'none';
  document.getElementById('racingResultScreen').style.display = 'flex';

  // 제목
  const title = document.getElementById('racingResultTitle');
  const subtitle = document.getElementById('racingResultSubtitle');

  if(racingState.mode === 'race' && racingState.distance >= 1000) {
    title.textContent = '완주!';
    subtitle.textContent = '목표 지점에 도달했습니다!';
  } else {
    title.textContent = '게임 오버';
    subtitle.textContent = racingState.alive ? '잘했어요!' : '충돌!';
  }

  // 통계
  document.getElementById('racingResultDistance').textContent = Math.round(racingState.distance) + 'm';
  document.getElementById('racingResultMaxSpeed').textContent = Math.round(racingState.maxSpeed) + ' km/h';
  document.getElementById('racingResultTime').textContent =
    ((Date.now() - racingState.startTime) / 1000).toFixed(1) + '초';

  // 순위 (멀티플레이어)
  if(state.players.length > 1) {
    const list = document.getElementById('racingResultRankingsList');
    const allPlayers = Object.values(racingState.players);
    allPlayers.sort((a, b) => b.distance - a.distance);

    list.innerHTML = allPlayers.map((p, i) => {
      const playerIdx = state.players.findIndex(sp => sp.name === p.name);
      const color = PLAYER_COLORS[playerIdx % PLAYER_COLORS.length];

      return `
        <div class="racing-result-ranking-item ${i === 0 ? 'first' : ''}">
          <div class="racing-result-ranking-rank">${i + 1}위</div>
          <div class="racing-result-ranking-avatar" style="background:${color};">${p.avatar}</div>
          <div class="racing-result-ranking-name">${p.name}</div>
          <div class="racing-result-ranking-distance">${Math.round(p.distance)}m</div>
        </div>
      `;
    }).join('');

    document.getElementById('racingResultRankings').style.display = 'block';
  } else {
    document.getElementById('racingResultRankings').style.display = 'none';
  }
}

function restartRacing() {
  document.getElementById('racingResultScreen').style.display = 'none';
  document.getElementById('racingModeSelect').style.display = 'flex';
  document.getElementById('racingGyroPermission').style.display = 'none';

  racingState.phase = 'menu';
}

function sendToHost(msg) {
  const hostId = state.players.find(p => p.isHost)?.id;
  if(hostId) sendTo(hostId, msg);
}

function handleRacePosition(peerId, msg) {
  if(!racingState.players) racingState.players = {};

  racingState.players[msg.playerId] = {
    distance: msg.distance,
    alive: msg.alive,
    maxSpeed: msg.maxSpeed,
    name: msg.name,
    avatar: msg.avatar,
  };
}

function handleRaceResult(msg) {
  if(!racingState.players) racingState.players = {};

  racingState.players[msg.playerId] = {
    distance: msg.distance,
    maxSpeed: msg.maxSpeed,
    time: msg.time,
    completed: msg.completed,
    name: msg.name,
    avatar: msg.avatar,
  };
}

