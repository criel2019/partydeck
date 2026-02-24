// ===== BLACKJACK ENGINE =====
// Standard Blackjack (P2P, host-authoritative)
// All players vs automated dealer

let bjState = null;  // host-side full state
let bjView = null;   // client-side view

// Card value for blackjack
function bjCardValue(rank) {
  if (rank === 'A') return 11;
  if (['K','Q','J'].includes(rank)) return 10;
  return parseInt(rank);
}

// Calculate hand total (adjusts Aces from 11→1 as needed)
function bjHandTotal(cards) {
  let total = 0;
  let aces = 0;
  for (let i = 0; i < cards.length; i++) {
    total += bjCardValue(cards[i].rank);
    if (cards[i].rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function bjIsBlackjack(cards) {
  return cards.length === 2 && bjHandTotal(cards) === 21;
}

// Safe card draw — returns null if deck exhausted
function bjDrawCard() {
  const bs = bjState;
  if (!bs || bs.deckIdx >= bs.deck.length) return null;
  return bs.deck[bs.deckIdx++];
}

// ===== HOST: CREATE DECK =====
function bjCreateDeck() {
  const deck = [];
  // Double deck (104 cards) for up to 14 players
  for (let copy = 0; copy < 2; copy++) {
    for (let s = 0; s < SUITS.length; s++) {
      for (let r = 0; r < RANKS.length; r++) {
        deck.push({ rank: RANKS[r], suit: SUITS[s] });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
  return deck;
}

// ===== HOST: START GAME =====
function startBlackjack() {
  if (!state.isHost) return;
  if (state.players.length < 1) {
    showToast('최소 1명 필요합니다');
    return;
  }

  const startChips = typeof getStartChips === 'function' ? getStartChips() : 1000;
  const prevState = bjState;

  const players = state.players.map(function(p, i) {
    const prevP = prevState ? prevState.players.find(function(pp) { return pp.id === p.id; }) : null;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      cards: [],
      chips: prevP ? prevP.chips : startChips,
      bet: 0,
      status: 'betting', // betting, playing, stand, bust, blackjack, broke
      seatIdx: i
    };
  });

  bjState = {
    deck: bjCreateDeck(),
    deckIdx: 0,
    players: players,
    dealer: { cards: [], status: 'waiting' },
    turnIdx: -1,
    phase: 'betting', // betting, dealing, playing, dealer, result
    baseBet: Math.max(10, Math.round(startChips / 20)),
    roundNum: prevState ? (prevState.roundNum || 0) + 1 : 1
  };

  showScreen('blackjackGame');
  broadcastBJState();
}

// ===== HOST: DEAL CARDS =====
function bjDeal() {
  if (!state.isHost || !bjState || bjState.phase !== 'betting') return;
  const bs = bjState;

  // Validate all bets
  let hasBet = false;
  bs.players.forEach(function(p) {
    if (p.bet > 0) {
      hasBet = true;
      p.status = 'playing';
    } else {
      // Auto-bet minimum for players who didn't bet
      const autoBet = Math.min(bs.baseBet, p.chips);
      if (autoBet > 0) {
        p.bet = autoBet;
        p.chips -= autoBet;
        p.status = 'playing';
        hasBet = true;
      } else {
        p.status = 'broke';
      }
    }
  });

  if (!hasBet) { showToast('베팅할 수 있는 플레이어가 없습니다'); return; }

  bs.phase = 'dealing';

  // Deal 2 cards to each player and dealer
  for (let round = 0; round < 2; round++) {
    bs.players.forEach(function(p) {
      if (p.status !== 'broke') {
        const card = bjDrawCard();
        if (card) p.cards.push(card);
      }
    });
    const dCard = bjDrawCard();
    if (dCard) bs.dealer.cards.push(dCard);
  }

  // Check for natural blackjacks
  bs.players.forEach(function(p) {
    if (p.status === 'playing' && bjIsBlackjack(p.cards)) {
      p.status = 'blackjack';
    }
  });

  // Find first active player
  bs.phase = 'playing';
  bs.turnIdx = bjFindNextPlayer(bs, -1);

  if (bs.turnIdx === -1) {
    bjDealerPlay();
  } else {
    broadcastBJState();
  }
}

// ===== HOST: FIND NEXT ACTIVE PLAYER =====
function bjFindNextPlayer(bs, fromIdx) {
  for (let i = fromIdx + 1; i < bs.players.length; i++) {
    if (bs.players[i].status === 'playing') return i;
  }
  return -1;
}

// ===== HOST: PROCESS ACTION =====
function processBJAction(playerId, action) {
  if (!state.isHost || !bjState) return;
  const bs = bjState;
  if (bs.phase !== 'playing') return;

  const pIdx = bs.players.findIndex(function(p) { return p.id === playerId; });
  if (pIdx !== bs.turnIdx) return;

  const player = bs.players[pIdx];
  if (player.status !== 'playing') return;

  switch (action) {
    case 'hit': {
      const card = bjDrawCard();
      if (!card) { player.status = 'stand'; break; }
      player.cards.push(card);
      const total = bjHandTotal(player.cards);
      if (total > 21) player.status = 'bust';
      else if (total === 21) player.status = 'stand';
      break;
    }

    case 'stand':
      player.status = 'stand';
      break;

    case 'double':
      if (player.cards.length === 2 && player.chips >= player.bet) {
        player.chips -= player.bet;
        player.bet *= 2;
        const card = bjDrawCard();
        if (card) player.cards.push(card);
        const dTotal = bjHandTotal(player.cards);
        player.status = dTotal > 21 ? 'bust' : 'stand';
      } else {
        return; // can't double
      }
      break;

    default:
      return;
  }

  // Move to next player or dealer
  if (player.status !== 'playing') {
    const nextIdx = bjFindNextPlayer(bs, pIdx);
    if (nextIdx === -1) {
      bjDealerPlay();
      return;
    }
    bs.turnIdx = nextIdx;
  }

  broadcastBJState();
}

// ===== HOST: DEALER PLAY =====
function bjDealerPlay() {
  const bs = bjState;
  bs.phase = 'dealer';
  bs.turnIdx = -1;
  bs.dealer.status = 'playing';

  broadcastBJState();
  bjDealerDrawStep();
}

function bjDealerDrawStep() {
  const bs = bjState;
  if (!bs) return;

  const dealerTotal = bjHandTotal(bs.dealer.cards);

  if (dealerTotal < 17) {
    const card = bjDrawCard();
    if (card) bs.dealer.cards.push(card);
    broadcastBJState();
    setTimeout(bjDealerDrawStep, 800);
  } else {
    bs.dealer.status = dealerTotal > 21 ? 'bust' : 'stand';
    setTimeout(bjResolve, 600);
  }
}

// ===== HOST: RESOLVE =====
function bjResolve() {
  const bs = bjState;
  if (!bs) return;
  bs.phase = 'result';

  const dealerTotal = bjHandTotal(bs.dealer.cards);
  const dealerBJ = bjIsBlackjack(bs.dealer.cards);

  const results = [];

  bs.players.forEach(function(p) {
    if (p.bet <= 0) { results.push({ id: p.id, result: 'none', payout: 0 }); return; }

    const playerBJ = p.status === 'blackjack';
    let payout = 0;

    if (p.status === 'bust') {
      payout = 0;
    } else if (playerBJ && dealerBJ) {
      payout = p.bet; // push
    } else if (playerBJ) {
      payout = p.bet + Math.floor(p.bet * 1.5); // 3:2
    } else if (dealerBJ) {
      payout = 0;
    } else if (bs.dealer.status === 'bust') {
      payout = p.bet * 2;
    } else {
      const playerTotal = bjHandTotal(p.cards);
      if (playerTotal > dealerTotal) payout = p.bet * 2;
      else if (playerTotal === dealerTotal) payout = p.bet;
      else payout = 0;
    }

    p.chips += payout;

    let resultStr = 'lose';
    if (payout > p.bet) resultStr = 'win';
    else if (payout === p.bet) resultStr = 'push';
    if (playerBJ && !dealerBJ) resultStr = 'blackjack';

    const playerTotal = bjHandTotal(p.cards);
    results.push({ id: p.id, name: p.name, avatar: p.avatar, result: resultStr, payout: payout, bet: p.bet, total: playerTotal });
  });

  const resultMsg = {
    type: 'bj-result',
    results: results,
    dealerCards: bs.dealer.cards,
    dealerTotal: dealerTotal,
    dealerBlackjack: dealerBJ
  };

  broadcastBJState();
  setTimeout(function() {
    broadcast(resultMsg);
    handleBJResult(resultMsg);
  }, 800);
}

// ===== HOST: BUILD VIEW =====
function buildBJView() {
  const bs = bjState;
  const isDealerRevealed = bs.phase === 'dealer' || bs.phase === 'result';

  return {
    type: 'bj-state',
    players: bs.players.map(function(p) {
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        cards: p.cards,
        chips: p.chips,
        bet: p.bet,
        status: p.status,
        seatIdx: p.seatIdx,
        total: bjHandTotal(p.cards)
      };
    }),
    dealer: {
      cards: isDealerRevealed ? bs.dealer.cards :
             (bs.dealer.cards.length > 0 ? [bs.dealer.cards[0], null] : []),
      status: bs.dealer.status,
      total: isDealerRevealed ? bjHandTotal(bs.dealer.cards) : null
    },
    turnIdx: bs.turnIdx,
    phase: bs.phase,
    baseBet: bs.baseBet,
    roundNum: bs.roundNum
  };
}

// ===== HOST: BROADCAST =====
function broadcastBJState() {
  if (!state.isHost || !bjState) return;
  const view = buildBJView();
  // Same view for all players (no hidden info between players)
  bjState.players.forEach(function(p) {
    if (p.id === state.myId) {
      bjView = view;
      renderBJView(view);
    } else {
      sendTo(p.id, view);
    }
  });
}

// ===== CLIENT: RENDER =====
function renderBJView(view) {
  bjView = view;
  showScreen('blackjackGame');

  const me = view.players.find(function(p) { return p.id === state.myId; });
  const currentTurnPlayer = view.turnIdx >= 0 ? view.players[view.turnIdx] : null;
  const isMyTurn = me && currentTurnPlayer && currentTurnPlayer.id === state.myId && view.phase === 'playing';

  // Phase badge
  const phaseNames = { betting: '베팅', dealing: '딜링', playing: '플레이', dealer: '딜러 턴', result: '결과' };
  const phaseEl = document.getElementById('bjPhaseBadge');
  if (phaseEl) phaseEl.textContent = phaseNames[view.phase] || view.phase;

  // My chips
  const chipsEl = document.getElementById('bjMyChips');
  if (chipsEl) chipsEl.textContent = (me ? me.chips : 0).toLocaleString();

  // Dealer area
  const dealerCardsEl = document.getElementById('bjDealerCards');
  if (dealerCardsEl) {
    let dHTML = '';
    if (view.dealer.cards && view.dealer.cards.length > 0) {
      for (let d = 0; d < view.dealer.cards.length; d++) {
        dHTML += bjCardHTML(view.dealer.cards[d], false);
      }
    }
    dealerCardsEl.innerHTML = dHTML;
  }

  const dealerTotalEl = document.getElementById('bjDealerTotal');
  if (dealerTotalEl) {
    if (view.dealer.total !== null && view.dealer.total !== undefined) {
      dealerTotalEl.textContent = view.dealer.total;
      dealerTotalEl.style.display = 'inline-block';
    } else if (view.dealer.cards && view.dealer.cards.length > 0 && view.dealer.cards[0]) {
      // Show visible card's rank (e.g. "A", "K") instead of numeric value
      dealerTotalEl.textContent = view.dealer.cards[0].rank;
      dealerTotalEl.style.display = 'inline-block';
    } else {
      dealerTotalEl.style.display = 'none';
    }
  }

  const dealerStatusEl = document.getElementById('bjDealerStatus');
  if (dealerStatusEl) {
    if (view.dealer.status === 'bust') dealerStatusEl.textContent = '버스트!';
    else if (view.phase === 'result' && view.dealer.total) dealerStatusEl.textContent = view.dealer.total + '점';
    else dealerStatusEl.textContent = '';
  }

  // Opponents
  const oppArea = document.getElementById('bjOpponents');
  if (oppArea) {
    const ops = view.players.filter(function(p) { return p.id !== state.myId; });
    oppArea.innerHTML = ops.map(function(p) {
      const isTurn = currentTurnPlayer && currentTurnPlayer.id === p.id && view.phase === 'playing';
      const statusText = bjStatusText(p.status, p.total);
      const cardsHTML = p.cards.map(function(c) { return bjCardHTML(c, false); }).join('');
      const dimmed = p.status === 'bust' || p.status === 'broke';

      return '<div class="bj-opp-slot ' + (dimmed ? 'bust' : '') + '">' +
        '<div class="bj-opp-avatar ' + (isTurn ? 'active-turn' : '') + '" style="background:' + PLAYER_COLORS[p.seatIdx % PLAYER_COLORS.length] + ';">' + p.avatar + '</div>' +
        '<div class="bj-opp-name">' + escapeHTML(p.name) + '</div>' +
        '<div class="bj-opp-chips">' + p.chips.toLocaleString() + '</div>' +
        '<div class="bj-opp-bet">' + (p.bet > 0 ? p.bet.toLocaleString() : '') + '</div>' +
        '<div class="bj-opp-cards">' + cardsHTML + '</div>' +
        '<div class="bj-opp-status">' + statusText + '</div>' +
        '</div>';
    }).join('');
  }

  // My cards
  const myCardsEl = document.getElementById('bjMyCards');
  if (myCardsEl && me) {
    myCardsEl.innerHTML = me.cards.map(function(c) { return bjCardHTML(c, true); }).join('');
  }

  // My total
  const myTotalEl = document.getElementById('bjMyTotal');
  if (myTotalEl && me && me.cards.length > 0) {
    myTotalEl.textContent = me.total + '점';
    myTotalEl.className = 'bj-my-total' + (me.total === 21 ? ' bj-21' : '') + (me.total > 21 ? ' bj-bust' : '');
  } else if (myTotalEl) {
    myTotalEl.textContent = '';
  }

  // My status
  const myStatusEl = document.getElementById('bjMyStatus');
  if (myStatusEl && me) {
    myStatusEl.textContent = bjStatusText(me.status, me.total);
  }

  // Betting area
  const betArea = document.getElementById('bjBetArea');
  const actionArea = document.getElementById('bjActionArea');

  if (view.phase === 'betting') {
    if (betArea) betArea.style.display = 'flex';
    if (actionArea) actionArea.style.display = 'none';

    const betAmountEl = document.getElementById('bjBetAmount');
    if (betAmountEl && me && !betAmountEl.dataset.init) {
      betAmountEl.value = view.baseBet;
      betAmountEl.dataset.init = '1';
    }
  } else {
    if (betArea) betArea.style.display = 'none';

    if (isMyTurn && me.status === 'playing') {
      if (actionArea) actionArea.style.display = 'flex';

      const dblBtn = document.getElementById('bjDoubleBtn');
      if (dblBtn) {
        dblBtn.disabled = !(me.cards.length === 2 && me.chips >= me.bet);
      }
    } else {
      if (actionArea) actionArea.style.display = 'none';
    }
  }

  // Deal button (host only, betting phase)
  const dealBtn = document.getElementById('bjDealBtn');
  if (dealBtn) {
    dealBtn.style.display = (state.isHost && view.phase === 'betting') ? 'block' : 'none';
  }
}

// ===== CARD HTML =====
function bjCardHTML(card, big) {
  if (!card) {
    const cls = big ? 'bj-card bj-card-big bj-card-back' : 'bj-card bj-card-back';
    return '<div class="' + cls + '"><div class="bj-card-back-pattern"></div></div>';
  }
  const colorCls = (card.suit === '♥' || card.suit === '♦') ? 'bj-red' : 'bj-black';
  const sizeCls = big ? 'bj-card bj-card-big' : 'bj-card';
  return '<div class="' + sizeCls + ' ' + colorCls + '">' +
    '<div class="bj-card-corner"><span class="bj-card-rank">' + card.rank + '</span><span class="bj-card-suit-sm">' + card.suit + '</span></div>' +
    '<div class="bj-card-center">' + card.suit + '</div>' +
    '<div class="bj-card-corner bj-card-corner-br"><span class="bj-card-rank">' + card.rank + '</span><span class="bj-card-suit-sm">' + card.suit + '</span></div>' +
    '</div>';
}

function bjStatusText(status, total) {
  switch (status) {
    case 'blackjack': return '블랙잭!';
    case 'bust': return '버스트';
    case 'broke': return '파산';
    case 'stand': return total + '점';
    case 'playing': return '';
    case 'betting': return '베팅 중';
    default: return '';
  }
}

// ===== CLIENT: ACTIONS =====
function bjHit() {
  if (state.isHost) processBJAction(state.myId, 'hit');
  else sendToHost({ type: 'bj-action', action: 'hit' });
}

function bjStand() {
  if (state.isHost) processBJAction(state.myId, 'stand');
  else sendToHost({ type: 'bj-action', action: 'stand' });
}

function bjDouble() {
  if (state.isHost) processBJAction(state.myId, 'double');
  else sendToHost({ type: 'bj-action', action: 'double' });
}

function bjPlaceBet() {
  const input = document.getElementById('bjBetAmount');
  if (!input) return;
  const amount = parseInt(input.value);
  if (!amount || amount <= 0) { showToast('베팅 금액을 입력하세요'); return; }

  if (state.isHost) {
    processBJBet(state.myId, amount);
  } else {
    sendToHost({ type: 'bj-bet', amount: amount });
  }
}

function bjQuickBet(multiplier) {
  if (!bjView) return;
  const input = document.getElementById('bjBetAmount');
  if (!input) return;
  const me = bjView.players.find(function(p) { return p.id === state.myId; });
  const maxChips = me ? me.chips + (me.bet || 0) : 0; // include current bet (re-bet allowed)
  input.value = Math.min(Math.floor(bjView.baseBet * multiplier), maxChips);
}

// ===== HOST: PROCESS BET =====
function processBJBet(playerId, amount) {
  if (!state.isHost || !bjState || bjState.phase !== 'betting') return;
  const player = bjState.players.find(function(p) { return p.id === playerId; });
  if (!player) return;

  const betAmount = Math.min(amount, player.chips);
  if (betAmount <= 0) return;

  // Return previous bet if re-betting
  player.chips += player.bet;
  player.bet = betAmount;
  player.chips -= betAmount;

  broadcastBJState();
  showToast(player.name + ': ' + betAmount.toLocaleString() + ' 베팅');
}

// ===== CLIENT: RESULT =====
function handleBJResult(msg) {
  const me = msg.results.find(function(r) { return r.id === state.myId; });
  const won = me && (me.result === 'win' || me.result === 'blackjack');
  const goldMode = typeof isBetModeGold === 'function' && isBetModeGold();
  recordGame(won, goldMode ? 0 : (won ? 30 : 5));

  const overlay = document.getElementById('bjResultOverlay');
  if (!overlay) return;

  // Dealer info
  const dealerHTML = msg.dealerCards.map(function(c) { return bjCardHTML(c, false); }).join('');
  document.getElementById('bjResultDealerCards').innerHTML = dealerHTML;
  document.getElementById('bjResultDealerTotal').textContent = msg.dealerTotal + (msg.dealerBlackjack ? ' (블랙잭)' : '');

  // Results list
  const listEl = document.getElementById('bjResultList');
  listEl.innerHTML = msg.results.filter(function(r) { return r.result !== 'none'; }).map(function(r) {
    let resultLabel, resultColor;
    switch (r.result) {
      case 'blackjack': resultLabel = '블랙잭! +' + Math.floor(r.payout - r.bet).toLocaleString(); resultColor = '#ffd700'; break;
      case 'win': resultLabel = '승리! +' + (r.payout - r.bet).toLocaleString(); resultColor = '#00e676'; break;
      case 'push': resultLabel = '무승부'; resultColor = '#aaa'; break;
      default: resultLabel = '패배 -' + r.bet.toLocaleString(); resultColor = '#ff5252'; break;
    }
    const isMe = r.id === state.myId;
    return '<div class="bj-result-row' + (isMe ? ' bj-result-me' : '') + '">' +
      '<span class="bj-result-name">' + escapeHTML(r.name || '') + ' ' + (r.avatar || '') + '</span>' +
      '<span class="bj-result-total">' + (r.total || '') + '</span>' +
      '<span class="bj-result-label" style="color:' + resultColor + ';">' + resultLabel + '</span>' +
      '</div>';
  }).join('');

  overlay.classList.add('active');
}

function closeBJResult() {
  document.getElementById('bjResultOverlay').classList.remove('active');
  if (state.isHost) {
    const betInput = document.getElementById('bjBetAmount');
    if (betInput) delete betInput.dataset.init;
    setTimeout(function() { startBlackjack(); }, 300);
  } else {
    // Non-host: show waiting message until host starts next round
    const statusEl = document.getElementById('bjMyStatus');
    if (statusEl) statusEl.textContent = '다음 라운드 대기 중...';
    const actionArea = document.getElementById('bjActionArea');
    if (actionArea) actionArea.style.display = 'none';
    const betArea = document.getElementById('bjBetArea');
    if (betArea) betArea.style.display = 'none';
  }
}

function closeBJResultToLobby() {
  document.getElementById('bjResultOverlay').classList.remove('active');
  returnToLobby();
}

// ===== CLEANUP =====
function closeBJCleanup() {
  bjState = null;
  bjView = null;
  const overlay = document.getElementById('bjResultOverlay');
  if (overlay) overlay.classList.remove('active');
}
