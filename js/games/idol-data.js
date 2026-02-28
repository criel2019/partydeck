// ===== 팟플 아이돌 매니지먼트 — 데이터 모듈 =====

// ─── 아이돌 정의 ───────────────────────────────────
const IDOL_TYPES = [
  {
    id: 'luna', name: '루나', emoji: '🎤', type: '가수형',
    img: 'img/games/idol/luna.png', color: '#ff6b9d',
    bonus: { talent: 1, looks: 0 },
    desc: '음악 샵 훈련 효율 최고',
    shopBonus: 'music',
  },
  {
    id: 'ddyobi', name: '뜌비', emoji: '💃', type: '댄서형',
    img: 'img/games/idol/ddyobi.jpg', color: '#ff9500',
    bonus: { talent: 0, looks: 1 },
    desc: '뷰티/패션 샵 시너지',
    shopBonus: 'beauty',
  },
  {
    id: 'el', name: '엘', emoji: '🎬', type: '배우형',
    img: 'img/games/idol/el.png', color: '#c084fc',
    bonus: { talent: 0, looks: 0 },
    desc: '미디어 샵 수수료 감면 & 이벤트 선택지 추가',
    shopBonus: 'media',
  },
  {
    id: 'ai', name: '아이', emoji: '🌟', type: '만능형',
    img: 'img/games/idol/ai.png', color: '#22d3ee',
    bonus: { talent: 0, looks: 0 },
    desc: '모든 샵 훈련 효율 균등',
    shopBonus: null,
  },
];

// 성장 단계 (외모 스탯 기준)
const IDOL_STAGES = [
  { stage: 0, name: '연습생', emoji: '🌱', minLooks: 0,  maxLooks: 4,  color: '#78909c' },
  { stage: 1, name: '신인',   emoji: '✨', minLooks: 5,  maxLooks: 9,  color: '#42a5f5' },
  { stage: 2, name: '스타',   emoji: '💫', minLooks: 10, maxLooks: 14, color: '#ab47bc' },
  { stage: 3, name: '슈퍼스타', emoji: '🌟', minLooks: 15, maxLooks: 99, color: '#ffd700' },
];

function getIdolStage(looks) {
  let result = IDOL_STAGES[0];
  for (const s of IDOL_STAGES) { if (looks >= s.minLooks) result = s; }
  return result;
}

// ─── 샵 카탈로그 ────────────────────────────────────
const SHOP_CATEGORIES = {
  music:  { name: '음악',  emoji: '🎵', color: '#e91e63', settlementBonus: 2 },
  media:  { name: '미디어', emoji: '🎬', color: '#9c27b0', settlementBonus: 0 }, // ad income
  beauty: { name: '뷰티',  emoji: '💄', color: '#f06292', settlementBonus: 0 }, // instant looks
  event:  { name: '행사',  emoji: '🏟️', color: '#ff9800', settlementBonus: 0 }, // high rent
};

const SHOPS = [
  // 음악 (5)
  { id: 's0',  cat: 'music',  name: '레코딩 스튜디오',  price: 600,  rent: [60,90,150,240],  trainStat: 'talent' },
  { id: 's1',  cat: 'music',  name: '음악 방송국',     price: 800,  rent: [80,120,200,320],  trainStat: 'talent' },
  { id: 's2',  cat: 'music',  name: '음원 유통사',     price: 700,  rent: [70,105,175,280],  trainStat: 'talent' },
  { id: 's3',  cat: 'music',  name: '인디 레이블',     price: 500,  rent: [50,75,125,200],   trainStat: 'talent' },
  { id: 's4',  cat: 'music',  name: '콘서트 투어사',   price: 1000, rent: [100,150,250,400], trainStat: 'talent' },
  // 미디어 (5)
  { id: 's5',  cat: 'media',  name: '드라마 제작사',   price: 700,  rent: [70,105,175,280],  trainStat: 'talent' },
  { id: 's6',  cat: 'media',  name: '영화사',          price: 900,  rent: [90,135,225,360],  trainStat: 'talent' },
  { id: 's7',  cat: 'media',  name: '유튜브 채널',     price: 600,  rent: [60,90,150,240],   trainStat: 'looks'  },
  { id: 's8',  cat: 'media',  name: '엔터테인먼트사',  price: 1100, rent: [110,165,275,440], trainStat: 'talent' },
  { id: 's9',  cat: 'media',  name: '광고 에이전시',   price: 800,  rent: [80,120,200,320],  trainStat: 'looks'  },
  // 뷰티 (5)
  { id: 's10', cat: 'beauty', name: '스타일리스트샵',  price: 500,  rent: [50,75,125,200],   trainStat: 'looks'  },
  { id: 's11', cat: 'beauty', name: '화장품 브랜드',   price: 700,  rent: [70,105,175,280],  trainStat: 'looks'  },
  { id: 's12', cat: 'beauty', name: '의상실',          price: 600,  rent: [60,90,150,240],   trainStat: 'looks'  },
  { id: 's13', cat: 'beauty', name: '뷰티 아카데미',   price: 900,  rent: [90,135,225,360],  trainStat: 'looks'  },
  { id: 's14', cat: 'beauty', name: '패션 스튜디오',   price: 800,  rent: [80,120,200,320],  trainStat: 'looks'  },
  // 행사 (5)
  { id: 's15', cat: 'event',  name: '콘서트홀',        price: 1000, rent: [100,150,250,400], trainStat: 'fame'   },
  { id: 's16', cat: 'event',  name: '팬미팅룸',        price: 600,  rent: [60,90,150,240],   trainStat: 'fame'   },
  { id: 's17', cat: 'event',  name: '스포츠관',        price: 800,  rent: [80,120,200,320],  trainStat: 'fame'   },
  { id: 's18', cat: 'event',  name: '행사 기획사',     price: 700,  rent: [70,105,175,280],  trainStat: 'fame'   },
  { id: 's19', cat: 'event',  name: '뮤직 페스티벌',   price: 1200, rent: [120,180,300,480], trainStat: 'fame'   },
];

const SHOP_LEVEL_NAMES = ['연습실', '소형 스튜디오', '전문 아카데미', '럭셔리 컴퍼니'];
const SHOP_UPGRADE_COST = [300, 500, 800]; // Lv1→2, Lv2→3, Lv3→4

// ─── 보드 레이아웃 ──────────────────────────────────
// 36칸: 0=출발, 9=경찰서, 18=무료주차, 27=무대뒤(가챠)
const BOARD_CELLS = [
  // 하단 (0→9)
  { type: 'start',   name: '출발',    emoji: '🏁' },           // 0
  { type: 'shop',    shopId: 's0' },                            // 1
  { type: 'event',   name: '이벤트',  emoji: '🎴' },           // 2
  { type: 'shop',    shopId: 's10' },                           // 3
  { type: 'gacha',   name: '가챠',    emoji: '🎰' },            // 4
  { type: 'shop',    shopId: 's5' },                            // 5
  { type: 'tax',     name: '세금',    emoji: '💸', amount: 300 }, // 6
  { type: 'shop',    shopId: 's15' },                           // 7
  { type: 'chance',  name: '찬스',    emoji: '⚡' },            // 8
  { type: 'police',  name: '경찰서',  emoji: '🚓' },            // 9
  // 우측 (10→18)
  { type: 'shop',    shopId: 's1' },                            // 10
  { type: 'event',   name: '이벤트',  emoji: '🎴' },           // 11
  { type: 'shop',    shopId: 's11' },                           // 12
  { type: 'gacha',   name: '가챠',    emoji: '🎰' },            // 13
  { type: 'shop',    shopId: 's6' },                            // 14
  { type: 'chance',  name: '찬스',    emoji: '⚡' },            // 15
  { type: 'shop',    shopId: 's16' },                           // 16
  { type: 'event',   name: '이벤트',  emoji: '🎴' },           // 17
  { type: 'free',    name: '무료주차', emoji: '🅿️' },          // 18
  // 상단 (19→27)
  { type: 'shop',    shopId: 's12' },                           // 19
  { type: 'gacha',   name: '가챠',    emoji: '🎰' },            // 20
  { type: 'shop',    shopId: 's7' },                            // 21
  { type: 'chance',  name: '찬스',    emoji: '⚡' },            // 22
  { type: 'shop',    shopId: 's17' },                           // 23
  { type: 'event',   name: '이벤트',  emoji: '🎴' },           // 24
  { type: 'shop',    shopId: 's2' },                            // 25
  { type: 'tax',     name: '세금',    emoji: '💸', amount: 500 }, // 26
  { type: 'stage',   name: '무대 뒤', emoji: '🎭' },            // 27 (특수 가챠)
  // 좌측 (28→35)
  { type: 'shop',    shopId: 's13' },                           // 28
  { type: 'gacha',   name: '가챠',    emoji: '🎰' },            // 29
  { type: 'shop',    shopId: 's8' },                            // 30
  { type: 'chance',  name: '찬스',    emoji: '⚡' },            // 31
  { type: 'shop',    shopId: 's18' },                           // 32
  { type: 'shop',    shopId: 's3' },                            // 33
  { type: 'shop',    shopId: 's14' },                           // 34
  { type: 'shop',    shopId: 's19' },                           // 35
];

function getCellInfo(cellIdx) {
  const cell = BOARD_CELLS[cellIdx];
  if (!cell) return null;
  if (cell.type === 'shop') {
    const shop = SHOPS.find(s => s.id === cell.shopId);
    const cat = SHOP_CATEGORIES[shop.cat];
    return { ...cell, name: shop.name, emoji: cat.emoji, cat: shop.cat };
  }
  return cell;
}

// ─── 이벤트 카드 ────────────────────────────────────
// type: 'normal' | 'scandal' | 'reversal'
const EVENT_CARDS = [
  {
    id: 'e1', type: 'normal',
    title: '무대 중 마이크 사고!',
    choices: [
      { label: '애드립으로 위기 극복', effect: (p, gs) => p.talent >= 5 ? { fame: 3 } : { fame: -1 } },
      { label: '멈추고 사과한다', effect: () => ({ fame: -2, favor: +2 }) },
    ],
  },
  {
    id: 'e2', type: 'normal',
    title: '파파라치에게 사생활 포착!',
    choices: [
      { label: '강경 대응 (법적 조치)', effect: () => ({ money: -500, fame: 0 }) },
      { label: '쿨하게 인정', effect: () => ({ fame: 0, favor: 3 }) },
    ],
  },
  {
    id: 'e3', type: 'normal',
    title: '경쟁사 아이돌의 역대급 컴백!',
    choices: [
      { label: '협업 제안', effect: () => ({ fame: 2, money: 200 }), allPlayers: { fame: 1 } },
      { label: '무시하고 집중', effect: () => ({}) },
    ],
  },
  {
    id: 'e4', type: 'scandal',
    title: 'SNS 스캔들 발생!',
    choices: [
      { label: '즉시 사과문 발표', effect: () => ({ fame: -2, favor: 3 }) },
      { label: '잠수 탄다', effect: () => ({ fame: -5, favor: -2 }) },
    ],
  },
  {
    id: 'e5', type: 'normal',
    title: '팬이 보낸 응원 편지!',
    choices: [
      { label: '직접 답장 쓴다', effect: () => ({ favor: 4, money: 0 }) },
      { label: 'SNS로 감사 인사', effect: () => ({ fame: 2, favor: 1 }) },
    ],
  },
  {
    id: 'e6', type: 'scandal',
    title: '열애설 보도!',
    choices: [
      { label: '부인한다', effect: () => ({ fame: -3, favor: -1 }) },
      { label: '인정한다', effect: () => ({ fame: -1, favor: 4 }) },
    ],
  },
  {
    id: 'e7', type: 'normal',
    title: '예능 프로그램 출연 제안!',
    choices: [
      { label: '출연한다', effect: () => ({ fame: 4, money: 300, looks: 0 }) },
      { label: '거절한다', effect: () => ({ talent: 1 }) },
    ],
  },
  {
    id: 'e8', type: 'normal',
    title: '해외 공연 제안!',
    choices: [
      { label: '수락 (비용 발생)', effect: (p) => p.fame >= 10 ? { fame: 6, money: -400 } : { fame: 3, money: -400 } },
      { label: '거절', effect: () => ({}) },
    ],
  },
  {
    id: 'e9', type: 'scandal',
    title: '립싱크 의혹 보도!',
    choices: [
      { label: '라이브 실력 증명', effect: (p) => p.talent >= 8 ? { fame: 3 } : { fame: -4 } },
      { label: '침묵', effect: () => ({ fame: -2 }) },
    ],
  },
  {
    id: 'e10', type: 'normal',
    title: '브랜드 광고 계약!',
    choices: [
      { label: '수락', effect: () => ({ money: 800, looks: 1 }) },
      { label: '이미지 관리를 위해 거절', effect: () => ({ favor: 2 }) },
    ],
  },
  {
    id: 'e11', type: 'normal',
    title: '신인상 후보 선정!',
    choices: [
      { label: '시상식 참석', effect: () => ({ fame: 3, money: -200 }) },
      { label: '불참 (스케줄 충돌)', effect: () => ({ fame: -1 }) },
    ],
  },
  {
    id: 'e12', type: 'scandal',
    title: '과거 학교폭력 의혹!',
    choices: [
      { label: '적극 해명', effect: () => ({ fame: -4, favor: 2 }) },
      { label: '아무 대응 없음', effect: () => ({ fame: -6, favor: -3 }) },
    ],
  },
];

// 역전 보정 가챠 카드 (꼴찌 전용 고확률)
const REVERSAL_CARDS = [
  { id: 'r1', title: '역전의 히어로!',   effect: { fame: 6 },          desc: '인기도 +6!' },
  { id: 'r2', title: '비밀 팬클럽 발동!', effect: { fame: 8 },          desc: '인기도 +8!!' },
  { id: 'r3', title: '바이럴 영상 대박!', effect: { fame: 5, money: 500 }, desc: '인기도 +5 + 돈 +500만' },
];

// ─── 가챠 테이블 ────────────────────────────────────
const GACHA_TABLE = [
  { grade: 'legend', emoji: '💎', label: '레전드!', prob: 0.15,
    rewards: [
      { type: 'fame',  value: 8,    desc: '인기도 +8!!' },
      { type: 'money', value: 2000, desc: '돈 +2000만!!' },
      { type: 'stat',  stat: 'talent', value: 5, stat2: 'looks', desc: '재능+외모 +5!!' },
    ]
  },
  { grade: 'hit', emoji: '✨', label: '히트!', prob: 0.50,
    rewards: [
      { type: 'fame',  value: 4, desc: '인기도 +4' },
      { type: 'stat',  stat: 'talent', value: 3, desc: '재능 +3' },
      { type: 'stat',  stat: 'looks',  value: 3, desc: '외모 +3' },
    ]
  },
  { grade: 'common', emoji: '🌀', label: '커먼', prob: 0.35,
    rewards: [
      { type: 'fame',  value: 2,   desc: '인기도 +2' },
      { type: 'money', value: 500, desc: '돈 +500만' },
      { type: 'stat',  stat: 'talent', value: 1, desc: '재능 +1' },
    ]
  },
];

function rollGacha() {
  const r = Math.random();
  let cum = 0;
  for (const tier of GACHA_TABLE) {
    cum += tier.prob;
    if (r < cum) {
      const reward = tier.rewards[Math.floor(Math.random() * tier.rewards.length)];
      return { grade: tier.grade, emoji: tier.emoji, label: tier.label, reward };
    }
  }
  return { grade: 'common', emoji: '🌀', label: '커먼', reward: GACHA_TABLE[2].rewards[0] };
}

// ─── 찬스 카드 ──────────────────────────────────────
const CHANCE_CARDS = [
  { id: 'c1', title: '매니저 기도 효과!',   effect: { fame: 3 },          desc: '인기도 +3' },
  { id: 'c2', title: '광고 출연 결정!',    effect: { money: 600 },       desc: '돈 +600만' },
  { id: 'c3', title: '월드 투어 계획!',    effect: { fame: 2, talent: 1 }, desc: '인기도 +2, 재능 +1' },
  { id: 'c4', title: '스타일링 업!',       effect: { looks: 2 },         desc: '외모 +2' },
  { id: 'c5', title: '악성 루머 유포!',    effect: { fame: -3 },         desc: '인기도 -3 (피해자 지목)' , target: true },
  { id: 'c6', title: '경쟁사 방해 공작!',  effect: { fame: -2 },         desc: '인기도 -2 (피해자 지목)', target: true },
  { id: 'c7', title: '레전드 프로듀서 만남!', effect: { talent: 2, favor: 2 }, desc: '재능 +2, 호감도 상승' },
  { id: 'c8', title: '팬덤 이벤트 성공!',  effect: { fame: 2, money: 400 }, desc: '인기도 +2, 돈 +400만' },
];

// ─── 5턴 결산 인기도 보너스 ──────────────────────────
function calcSettlementBonus(talent, looks, ownedShops) {
  const sum = talent + looks;
  let bonus = 0;
  if (sum >= 16) bonus = 5;
  else if (sum >= 11) bonus = 3;
  else if (sum >= 6)  bonus = 2;
  else if (sum >= 1)  bonus = 1;

  // 독점 보너스
  const catCounts = {};
  ownedShops.forEach(s => { catCounts[s.cat] = (catCounts[s.cat] || 0) + 1; });
  Object.values(catCounts).forEach(cnt => {
    if (cnt >= 3) bonus += 2;
    else if (cnt >= 2) bonus += 1;
  });

  return bonus;
}

// ─── 엔딩 정의 ──────────────────────────────────────
const ENDINGS = [
  {
    id: 'best',     emoji: '⭐', rank: 1,  favorHigh: true,
    title: '함께 정상으로',
    text: '"앞으로도 계속 함께해요" — 아이돌이 눈물을 글썽이며 당신을 진심으로 믿는다.',
    bg: 'linear-gradient(135deg, #ffd700, #ffab00)',
  },
  {
    id: 'happy',    emoji: '😊', rank: 1,  favorHigh: false, favorMid: true,
    title: '감사한 프로듀서',
    text: '아이돌이 감사 인사를 전하고 계약을 갱신한다. 좋은 결말.',
    bg: 'linear-gradient(135deg, #42a5f5, #1565c0)',
  },
  {
    id: 'irony',    emoji: '💔', rank: 1,  favorLow: true,
    title: '이제 혼자 갈게요',
    text: '"키워줘서 고마워요." — 인기도는 1위지만 아이돌이 더 큰 기획사로 떠난다.',
    bg: 'linear-gradient(135deg, #78909c, #455a64)',
  },
  {
    id: 'growth',   emoji: '🌱', rank: 2,  favorHigh: true,
    title: '당신이 최고예요',
    text: '"다음엔 꼭 1위 함께 해요" — 순위는 낮지만 아이돌이 당신을 가장 아낀다.',
    bg: 'linear-gradient(135deg, #66bb6a, #2e7d32)',
  },
  {
    id: 'normal',   emoji: '😐', rank: 2,  favorMid: true,
    title: '좋은 경험이었어요',
    text: '아이돌이 무난하게 계약 만료를 맞이한다. 나쁘지 않은 이별.',
    bg: 'linear-gradient(135deg, #bdbdbd, #757575)',
  },
  {
    id: 'bankrupt', emoji: '💀', bankrupt: true,
    title: '기회를 주셔서...',
    text: '아이돌이 매몰차게 더 큰 기획사로 이적한다. 다음엔 잘 해봐.',
    bg: 'linear-gradient(135deg, #b71c1c, #7f0000)',
  },
];

function getEnding(isBankrupt, famRank1, favor) {
  if (isBankrupt) return ENDINGS.find(e => e.id === 'bankrupt');
  const isFirst = famRank1;
  if (isFirst && favor >= 15)  return ENDINGS.find(e => e.id === 'best');
  if (isFirst && favor >= 5)   return ENDINGS.find(e => e.id === 'happy');
  if (isFirst)                 return ENDINGS.find(e => e.id === 'irony');
  if (!isFirst && favor >= 15) return ENDINGS.find(e => e.id === 'growth');
  if (!isFirst && favor >= 5)  return ENDINGS.find(e => e.id === 'normal');
  return ENDINGS.find(e => e.id === 'normal');
}

// ─── 아이템 시스템 상수 ────────────────────────────
const IDOL_MAX_ITEMS = 5;
const IDOL_ITEM_SELL_RATIO = 0.5;

// ─── 타인 땅 관련 상수 ─────────────────────────────
const IDOL_OTHER_LAND_TRAIN_COST_RATIO = 0.3; // 훈련 추가비용 = 샵가격 × 비율
const IDOL_ITEM_OWNER_CUT = 0.1;              // 아이템 구매시 땅주인에게 10%

// ─── 턴 타이머 상수 ────────────────────────────────
const TURN_TIMER_SEC = 60;
const TURN_TIMER_EXTEND_COST_GOLD = 100;
const TURN_TIMER_EXTEND_COST_DIAMOND = 1;
const TURN_TIMER_EXTEND_SEC = 60;

// ─── 페스티벌 상수 ─────────────────────────────────
const FESTIVAL_INTERVAL = 5; // 5턴마다 페스티벌

// 1~4등 차등 보상 (fame 보너스 + 추가 보상)
const FESTIVAL_REWARDS = [
  { rank: 1, fame: 6, money: 800,  talent: 1, looks: 1 }, // 1등
  { rank: 2, fame: 4, money: 500,  talent: 0, looks: 1 }, // 2등
  { rank: 3, fame: 2, money: 300,  talent: 0, looks: 0 }, // 3등
  { rank: 4, fame: 1, money: 100,  talent: 0, looks: 0 }, // 4등
];

// ─── 콤보 공식 상수 ────────────────────────────────
// 콤보 보너스는 페스티벌 점수 계산 시에만 적용
const COMBO_JAIL_MULT     = 10;  // 경찰서 수감횟수 × 10 = 호감도 보너스
const COMBO_LAND_MULT     = 5;   // 구매 땅 수 × 5 = 재능 보너스
const COMBO_ITEMS_MULT    = 3;   // 보유 물품 수 × 3 = 전체 스탯 보너스
const COMBO_MONEY_DIVISOR = 1000; // 보유 돈 / 1000 = 인기도 보너스

// ─── 아이템 카탈로그 ───────────────────────────────
// 각 아이템: id, name, emoji, price, cat(관련 샵 카테고리), baseStat{}, comboType, comboDesc
const IDOL_ITEMS = [
  // 음악 장비 (4)
  { id: 'i1',  name: '골든 마이크',    emoji: '🎤', price: 400,  cat: 'music',
    baseStat: { talent: 2 },
    comboType: 'jail', comboDesc: '수감횟수×10 호감도' },
  { id: 'i2',  name: '작곡 노트북',    emoji: '💻', price: 600,  cat: 'music',
    baseStat: { talent: 3 },
    comboType: 'items', comboDesc: '물품수×3 스탯' },
  { id: 'i3',  name: '빈티지 기타',    emoji: '🎸', price: 350,  cat: 'music',
    baseStat: { talent: 1, fame: 1 },
    comboType: 'land', comboDesc: '땅수×5 재능' },
  { id: 'i4',  name: '플래티넘 앨범',  emoji: '💿', price: 800,  cat: 'music',
    baseStat: { fame: 3 },
    comboType: 'money', comboDesc: '보유돈/1000 인기도' },

  // 패션 아이템 (4)
  { id: 'i5',  name: '디자이너 드레스', emoji: '👗', price: 500,  cat: 'beauty',
    baseStat: { looks: 2 },
    comboType: 'land', comboDesc: '땅수×5 재능' },
  { id: 'i6',  name: '럭셔리 선글라스', emoji: '🕶️', price: 300,  cat: 'beauty',
    baseStat: { looks: 1, fame: 1 },
    comboType: 'money', comboDesc: '보유돈/1000 인기도' },
  { id: 'i7',  name: '시그니처 향수',  emoji: '🌸', price: 450,  cat: 'beauty',
    baseStat: { looks: 2, favor: 1 },
    comboType: 'jail', comboDesc: '수감횟수×10 호감도' },
  { id: 'i8',  name: '스타일링 키트',  emoji: '💅', price: 700,  cat: 'beauty',
    baseStat: { looks: 3 },
    comboType: 'items', comboDesc: '물품수×3 스탯' },

  // 미디어 용품 (4)
  { id: 'i9',  name: '연기 교본',      emoji: '📖', price: 350,  cat: 'media',
    baseStat: { talent: 1, looks: 1 },
    comboType: 'jail', comboDesc: '수감횟수×10 호감도' },
  { id: 'i10', name: 'SNS 부스터',     emoji: '📱', price: 500,  cat: 'media',
    baseStat: { fame: 2 },
    comboType: 'items', comboDesc: '물품수×3 스탯' },
  { id: 'i11', name: '광고 계약서',    emoji: '📝', price: 650,  cat: 'media',
    baseStat: { money: 300, fame: 1 },
    comboType: 'money', comboDesc: '보유돈/1000 인기도' },
  { id: 'i12', name: '황금 트로피',    emoji: '🏆', price: 900,  cat: 'media',
    baseStat: { fame: 4 },
    comboType: 'land', comboDesc: '땅수×5 재능' },

  // 행사 용품 (4)
  { id: 'i13', name: '팬사인 포스터',  emoji: '🖼️', price: 250,  cat: 'event',
    baseStat: { fame: 1, favor: 1 },
    comboType: 'jail', comboDesc: '수감횟수×10 호감도' },
  { id: 'i14', name: '콘서트 세트',    emoji: '🎪', price: 600,  cat: 'event',
    baseStat: { fame: 2, talent: 1 },
    comboType: 'land', comboDesc: '땅수×5 재능' },
  { id: 'i15', name: 'VIP 초대권',     emoji: '🎫', price: 400,  cat: 'event',
    baseStat: { fame: 1, money: 200 },
    comboType: 'money', comboDesc: '보유돈/1000 인기도' },
  { id: 'i16', name: '월드투어 패스',  emoji: '✈️', price: 1000, cat: 'event',
    baseStat: { fame: 3, talent: 2, looks: 1 },
    comboType: 'items', comboDesc: '물품수×3 스탯' },
];

// ─── 역전 보정 가챠 확률 ───────────────────────────
// 순위별 가챠 확률 조정 (기본 GACHA_TABLE 대비)
const GACHA_RANK_ADJUST = {
  last:  { legend: 0.25, hit: 0.45, common: 0.30 }, // 꼴찌 → 레전드 25%
  first: { legend: 0.10, hit: 0.45, common: 0.45 }, // 1위 → 레전드 10%
};

// 역전 보정 적용된 가챠 롤
function rollGachaWithRank(rank, totalPlayers) {
  const isLast  = (rank === totalPlayers && totalPlayers > 1);
  const isFirst = (rank === 1 && totalPlayers > 1);
  let probs;
  if (isLast)       probs = GACHA_RANK_ADJUST.last;
  else if (isFirst) probs = GACHA_RANK_ADJUST.first;
  else              probs = null; // 기본 확률

  if (probs) {
    const r = Math.random();
    let cum = 0;
    const tiers = [
      { ...GACHA_TABLE[0], prob: probs.legend },
      { ...GACHA_TABLE[1], prob: probs.hit },
      { ...GACHA_TABLE[2], prob: probs.common },
    ];
    for (const tier of tiers) {
      cum += tier.prob;
      if (r < cum) {
        const reward = tier.rewards[Math.floor(Math.random() * tier.rewards.length)];
        return { grade: tier.grade, emoji: tier.emoji, label: tier.label, reward };
      }
    }
  }
  return rollGacha(); // fallback: 기본 확률
}

// ─── 페스티벌 점수 계산 ────────────────────────────
// 아이템 baseStat 합산 + 콤보 보너스
function calcFestivalScore(player) {
  const items = player.items || [];
  const tracking = {
    jailCount:  player.jailCount  || 0,
    landCount:  player.ownedShops ? player.ownedShops.length : 0,
    itemCount:  items.length,
    money:      player.money || 0,
  };

  // 1. 아이템 baseStat 합산
  let totalTalent = 0, totalLooks = 0, totalFame = 0, totalFavor = 0, totalMoney = 0;
  items.forEach(item => {
    const def = IDOL_ITEMS.find(d => d.id === item.id);
    if (!def) return;
    totalTalent += def.baseStat.talent || 0;
    totalLooks  += def.baseStat.looks  || 0;
    totalFame   += def.baseStat.fame   || 0;
    totalFavor  += def.baseStat.favor  || 0;
    totalMoney  += def.baseStat.money  || 0;
  });

  // 2. 기본 스탯 보너스 (기존 calcSettlementBonus 로직)
  const ownedShopObjs = (player.ownedShops || []).map(id => SHOPS.find(s => s.id === id)).filter(Boolean);
  const baseBonus = calcSettlementBonus(player.talent + totalTalent, player.looks + totalLooks, ownedShopObjs);

  // 3. 콤보 보너스 계산
  const combos = [];
  items.forEach(item => {
    const def = IDOL_ITEMS.find(d => d.id === item.id);
    if (!def || !def.comboType) return;
    let comboValue = 0;
    switch (def.comboType) {
      case 'jail':
        comboValue = tracking.jailCount * COMBO_JAIL_MULT;
        if (comboValue > 0) combos.push({ item: def, type: 'favor', value: comboValue, desc: `수감${tracking.jailCount}회 → 호감도+${comboValue}` });
        break;
      case 'land':
        comboValue = tracking.landCount * COMBO_LAND_MULT;
        if (comboValue > 0) combos.push({ item: def, type: 'talent', value: comboValue, desc: `땅${tracking.landCount}개 → 재능+${comboValue}` });
        break;
      case 'items':
        comboValue = tracking.itemCount * COMBO_ITEMS_MULT;
        if (comboValue > 0) combos.push({ item: def, type: 'all', value: comboValue, desc: `물품${tracking.itemCount}개 → 전체+${comboValue}` });
        break;
      case 'money':
        comboValue = Math.floor(tracking.money / COMBO_MONEY_DIVISOR);
        if (comboValue > 0) combos.push({ item: def, type: 'fame', value: comboValue, desc: `자금${tracking.money}만 → 인기도+${comboValue}` });
        break;
    }
  });

  // 4. 콤보 보너스 스탯 합산
  let comboTalent = 0, comboLooks = 0, comboFame = 0, comboFavor = 0;
  combos.forEach(c => {
    switch (c.type) {
      case 'talent': comboTalent += c.value; break;
      case 'fame':   comboFame   += c.value; break;
      case 'favor':  comboFavor  += c.value; break;
      case 'all':    comboTalent += c.value; comboLooks += c.value; comboFame += c.value; break;
    }
  });

  // 5. 총 페스티벌 점수 = baseBonus + 아이템 fame + 콤보 fame
  const festivalScore = baseBonus + totalFame + comboFame;

  return {
    baseBonus,
    itemStats: { talent: totalTalent, looks: totalLooks, fame: totalFame, favor: totalFavor, money: totalMoney },
    combos,
    comboStats: { talent: comboTalent, looks: comboLooks, fame: comboFame, favor: comboFavor },
    totalScore: festivalScore,
  };
}

// ─── 아이템 유틸 함수 ──────────────────────────────
function getItemDef(itemId) {
  return IDOL_ITEMS.find(d => d.id === itemId) || null;
}

// 샵 카테고리에 맞는 아이템 목록
function getItemsForShopCat(shopCat) {
  return IDOL_ITEMS.filter(item => item.cat === shopCat);
}

// 가격순 정렬 (저렴→비싼)
function getItemsSortedByPrice(items) {
  return [...items].sort((a, b) => a.price - b.price);
}

// 전광판 연출용 캐릭터별 스프라이트 매핑
// 에셋 없으면 null → CSS fallback 사용
const IDOL_BILLBOARD_SPRITES = {
  luna:   'img/games/idol/sol-sprite.jpg',
  ddyobi: null,
  el:     null,
  ai:     null,
};
