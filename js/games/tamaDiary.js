// ===== TAMA DIARY - 다마고치 캐릭터 일기장 시스템 =====
// wrealing 일기장 시스템을 partydeck 다마고치에 컨버팅
// 날짜 기반 결정론적 일기 선택 + 골드 해금

const TAMA_DIARY_STORAGE = 'pd_tama_diary_unlocked';
const TAMA_DIARY_COST = 150; // 골드

// ── 날씨 데이터 ─────────────────────────────────────────
const TAMA_DIARY_WEATHERS = {
  spring: [
    { emoji:'☀️', label:'맑음' },
    { emoji:'🌤️', label:'구름 조금' },
    { emoji:'🌧️', label:'봄비' },
    { emoji:'🌸', label:'꽃바람' },
  ],
  summer: [
    { emoji:'☀️', label:'맑음' },
    { emoji:'⛅', label:'소나기 예보' },
    { emoji:'🌧️', label:'장마' },
    { emoji:'🔥', label:'폭염' },
  ],
  autumn: [
    { emoji:'☀️', label:'맑음' },
    { emoji:'🍂', label:'낙엽 바람' },
    { emoji:'🌫️', label:'안개' },
    { emoji:'🍃', label:'선선한 바람' },
  ],
  winter: [
    { emoji:'❄️', label:'눈' },
    { emoji:'☁️', label:'흐림' },
    { emoji:'☀️', label:'맑음' },
    { emoji:'🌫️', label:'안개' },
  ],
};

// ── 종족별 일기 데이터 (3일분) ─────────────────────────────
// wrealing의 모찌/루나 스타일을 종족별 성격으로 컨버팅
// 각 종족의 말투와 세계관이 반영된 1인칭 일기

const TAMA_DIARY_ENTRIES = {

  // ━━━━━━━━━━━━ 🐉 화염 (Fire) ━━━━━━━━━━━━
  // 성격: 열정적, 직설적, 전투적 에너지, 불꽃 비유
  fire: [
    {
      id: 'FD-01',
      text: '오늘 훈련을 했다. 상대는 소파 쿠션이었다. 10라운드 끝에 내가 이겼다. 솜이 좀 나왔지만 그건 전투의 흔적이다. 주인이 소리를 질렀다. 승리의 환호인 줄 알았는데 아닌 것 같았다. ...간식을 줬으니까 아마 칭찬이었을 거다. 내일은 방석에 도전한다. 더 강한 상대가 필요하니까!',
      themes: ['daily', 'funny'],
    },
    {
      id: 'FD-02',
      text: '밥을 먹었다. 맛있었다. 하지만 양이 부족했다. 전사에게 이 정도 식사는 간식이다. 그릇을 핥아서 깨끗하게 만들었는데 주인이 "벌써 다 먹었어?" 하고 놀랐다. 당연하지. 전투력은 밥심이다. 추가 급식을 요구했더니 "살쪄" 라고 했다. 이건 근육이다. 뭘 모른다.',
      themes: ['food', 'funny'],
    },
    {
      id: 'FD-03',
      text: '오늘 주인이 나를 쓰다듬었다. 평소에는 비켜! 하고 도망가는데 오늘은... 좀 피곤해서 가만히 있었다. 그랬더니 주인이 "오늘은 왜 이렇게 착해?" 하고 웃었다. 착한 게 아니라 전략적 휴식이다. 전사도 쉴 때가 필요하다. 근데 쓰다듬는 거 은근히 따뜻했다. 이건 비밀이다. 절대 비밀.',
      themes: ['human', 'emotion'],
    },
  ],

  // ━━━━━━━━━━━━ 🗿 암석 (Rock) ━━━━━━━━━━━━
  // 성격: 과묵, 건조한 유머, 느릿느릿, 말줄임
  rock: [
    {
      id: 'RD-01',
      text: '...오늘도 같은 자리에 있었다. 움직일 이유가 없었으니까. 창밖으로 구름이 지나갔다. 느린 구름이었다. 나보다는 빨랐지만. 주인이 "뭐 봐?" 하고 물었다. "구름." 이라고 대답했다. 주인이 같이 봤다. 조용했다. ...좋았다.',
      themes: ['daily', 'philosophical'],
    },
    {
      id: 'RD-02',
      text: '밥을 먹었다. 천천히. 서두를 이유가 없다. 씹는 횟수를 세봤다. 47번. 어제는 45번이었다. 기록 갱신이다. ...대단한 건 아니지만 기록은 기록이다. 주인이 "맛있어?" 하고 물었다. 끄덕였다. 맛있었다. 고마웠다. ...말은 안 했지만.',
      themes: ['food', 'emotion'],
    },
    {
      id: 'RD-03',
      text: '주인이 안아줬다. 무거웠는지 "으으" 소리를 냈다. 내가 무거운 게 아니라 주인이 약한 거다. ...근데 안기는 건 싫지 않았다. 따뜻했다. 바위도 오래 햇볕을 받으면 따뜻해지는 것처럼. 주인은 나의 햇볕 같은 존재다. ...이런 말 직접 할 일은 없겠지만.',
      themes: ['human', 'emotion'],
    },
  ],

  // ━━━━━━━━━━━━ 🦅 풍래 (Wind) ━━━━━━━━━━━━
  // 성격: 자유롭고 몽환적, 감성적, 바람/하늘 비유
  wind: [
    {
      id: 'WD-01',
      text: '오늘 바람이 참 좋았어~ 창문 틈으로 들어오는 바람의 냄새를 맡았는데, 풀 냄새가 섞여 있었어. 어디선가 꽃이 피고 있나 봐~ 바람은 세상의 소식을 전해주는 우체부 같아. 오늘의 소식은 "어딘가에서 봄이 왔다"였어. 나도 언젠가 그 봄을 보러 가고 싶다~',
      themes: ['weather', 'philosophical'],
    },
    {
      id: 'WD-02',
      text: '구름을 보면서 모양 맞추기를 했어. 첫 번째 구름은 토끼 같았고, 두 번째 구름은 물고기 같았어~ 세 번째 구름은... 주인 얼굴 같았어! 정말이야! 웃고 있는 주인 얼굴이었어~ 바람이 불어서 금방 흩어졌지만 마음속에 사진 찍어놨어. 하늘이 주인을 닮은 구름을 만들어준 거야, 틀림없어~',
      themes: ['daily', 'human', 'emotion'],
    },
    {
      id: 'WD-03',
      text: '오늘은 왠지 날고 싶은 날이었어. 높이높이~ 구름 위까지~ 바람을 타고 세상을 내려다보면 어떤 느낌일까? 주인에게 물어봤더니 "비행기 타면 볼 수 있어" 라고 했어. 그게 아닌데... 내가 말하는 건 바람이 되는 거야. 바람이 되어서 주인 옆에 항상 있고 싶어~ 보이지 않아도 느낄 수 있도록~',
      themes: ['adventure', 'emotion', 'philosophical'],
    },
  ],

  // ━━━━━━━━━━━━ 🐯 뇌전 (Thunder) ━━━━━━━━━━━━
  // 성격: 장난꾸러기, 활발, 대담, 찌릿 의성어
  thunder: [
    {
      id: 'TD-01',
      text: '오늘 엄청난 장난을 쳤다! 주인이 의자에서 일어나는 순간 뒤에서 "번쩍!" 하고 나타났다! 주인이 놀라서 소리 질렀다! 하하하하하! 최고였어! 근데 그 다음에 간식을 안 줬다. 아까 너무 놀라서 그런 거겠지? 반성은... 조금만. 아주 조금만!',
      themes: ['daily', 'funny'],
    },
    {
      id: 'TD-02',
      text: '밥을 먹는데 갑자기 아이디어가 번쩍! 떠올랐다! "밥에 간식을 섞으면 맛 2배 아닌가?!" 천재적이잖아! 바로 시도했다. 결과: 맛 200%! 찌릿찌릿! 주인이 "왜 간식통 열었어!" 하고 달려왔다. 혁신을 이해 못하는 거다. 다음에는 들키지 않게 해야지! 번개는 빠르니까!',
      themes: ['food', 'funny'],
    },
    {
      id: 'TD-03',
      text: '비가 왔다. 번개도 쳤다! 창밖에 번쩍번쩍 번개가 치는 걸 보면서 생각했다. "저건 나의 동료다!" 번개는 빠르고 강하고 멋있다. 나처럼! 근데 천둥소리에... 살짝 놀랐다. 아주 살짝! 놀란 게 아니라 반가워서 몸이 움찔한 거다! 그래서 주인 옆으로 갔다. 주인을 지켜주려고. 내가 무서운 게 아니야!',
      themes: ['weather', 'emotion', 'funny'],
    },
  ],

  // ━━━━━━━━━━━━ 🔮 영혼 (Spirit) ━━━━━━━━━━━━
  // 성격: 신비롭고 차분, 지혜로운, 여운 있는 말투
  spirit: [
    {
      id: 'SD-01',
      text: '달빛이 방 안으로 스며들었다… 은빛 물결 같은 빛 속에서 명상을 했다. 눈을 감으면 보이는 것들이 있다. 어둠 속의 빛, 고요 속의 소리… 주인이 "뭐 해?" 하고 물었다. "우주와 대화 중…" 이라고 답했다. 주인이 웃었다. 하지만 나는 진심이었다. 우주는 듣는 자에게 말을 건다…',
      themes: ['philosophical', 'daily'],
    },
    {
      id: 'SD-02',
      text: '오늘 주인의 손을 오래 바라봤다. 손금 하나하나에 이야기가 담겨 있는 것 같았다… 주인은 이 손으로 나를 돌봐주고, 밥을 주고, 쓰다듬어준다. 세상에서 가장 따뜻한 손이다… 가만히 볼을 비비며 감사를 전했다. 말은 하지 않아도 마음은 전해졌을 거라 믿는다…',
      themes: ['human', 'emotion'],
    },
    {
      id: 'SD-03',
      text: '비가 내렸다. 빗소리를 들으면서 생각했다… 비는 하늘의 기억이라고 한다. 구름이 담아뒀던 것들이 견딜 수 없을 만큼 무거워지면 내려오는 것… 마음도 그런 것일까. 가끔은 울어도 괜찮다. 비 뒤에는 항상 맑은 하늘이 오니까… 주인도 힘들 때 울어도 된다. 내가 옆에 있을 테니까…',
      themes: ['weather', 'philosophical', 'emotion'],
    },
  ],
};

// ── 테마 라벨 맵 ────────────────────────────────────────
const TAMA_DIARY_THEME_LABELS = {
  daily: '일상',
  food: '음식',
  weather: '날씨',
  human: '주인',
  adventure: '모험',
  emotion: '감정',
  hobby: '취미',
  lazy: '휴식',
  philosophical: '생각',
  funny: '유머',
};

// ── 결정론적 시드 기반 랜덤 ──────────────────────────────
function tamaDiarySeed(year, month, day, offset) {
  // FNV-1a hash
  let h = 2166136261;
  const vals = [year, month, day, offset || 0];
  for (const v of vals) {
    h ^= v & 0xff; h = Math.imul(h, 16777619);
    h ^= (v >> 8) & 0xff; h = Math.imul(h, 16777619);
  }
  return function() {
    h ^= h << 13; h ^= h >> 17; h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

// ── 계절 계산 ────────────────────────────────────────────
function tamaDiarySeason(month) {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}
const TAMA_DIARY_SEASON_KR = { spring:'봄', summer:'여름', autumn:'가을', winter:'겨울' };
const TAMA_DIARY_DAY_KR = ['일','월','화','수','목','금','토'];

// ── 날씨 결정 ────────────────────────────────────────────
function tamaDiaryWeather(date) {
  const y = date.getFullYear(), m = date.getMonth()+1, d = date.getDate();
  const rng = tamaDiarySeed(y, m, d, 9999);
  const season = tamaDiarySeason(m);
  const pool = TAMA_DIARY_WEATHERS[season] || TAMA_DIARY_WEATHERS.spring;
  return pool[Math.floor(rng() * pool.length)];
}

// ── 일기 엔트리 선택 (결정론적) ──────────────────────────
function tamaDiarySelect(tribe, date) {
  const y = date.getFullYear(), m = date.getMonth()+1, d = date.getDate();
  const entries = TAMA_DIARY_ENTRIES[tribe];
  if (!entries || entries.length === 0) return null;

  // 종족별 시드 오프셋
  const offsets = { fire:0, rock:1111, wind:2222, thunder:3333, spirit:4444 };
  const rng = tamaDiarySeed(y, m, d, offsets[tribe] || 0);

  // 결정론적으로 인덱스 선택
  const idx = Math.floor(rng() * entries.length);
  return entries[idx];
}

// ── 해금 관리 ────────────────────────────────────────────
function tamaDiaryLoadUnlocked() {
  try {
    const raw = localStorage.getItem(TAMA_DIARY_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function tamaDiarySaveUnlocked(arr) {
  localStorage.setItem(TAMA_DIARY_STORAGE, JSON.stringify(arr));
}

function tamaDiaryKey(tribe, date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return tribe + '-' + y + '-' + m + '-' + d;
}

function tamaDiaryIsUnlocked(tribe, date) {
  const unlocked = tamaDiaryLoadUnlocked();
  return unlocked.includes(tamaDiaryKey(tribe, date));
}

function tamaDiaryUnlock(tribe, date) {
  if (!tamaPet) return false;
  const cost = TAMA_DIARY_COST;
  if (tamaGetGold() < cost) {
    if (typeof showToast === 'function') showToast('🪙 골드가 부족합니다! (필요: ' + cost + ')');
    return false;
  }
  if (typeof addGold === 'function') addGold(-cost);
  const unlocked = tamaDiaryLoadUnlocked();
  const key = tamaDiaryKey(tribe, date);
  if (!unlocked.includes(key)) {
    unlocked.push(key);
    tamaDiarySaveUnlocked(unlocked);
  }
  // Update gold display
  const ge = document.getElementById('tamaGoldValue');
  if (ge) ge.textContent = tamaGetGold().toLocaleString();
  return true;
}

// ── 일기장 UI 상태 ──────────────────────────────────────
let tamaDiaryDate = new Date();
let tamaDiaryOpen = false;

function tamaDiaryFormatDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dow = TAMA_DIARY_DAY_KR[date.getDay()];
  const season = tamaDiarySeason(m);
  return y + '년 ' + m + '월 ' + d + '일 ' + dow + '요일 · ' + TAMA_DIARY_SEASON_KR[season];
}

// ── Open / Close ────────────────────────────────────────
function tamaDiaryOpen_() {
  if (!tamaPet) return;
  tamaDiaryOpen = true;
  tamaDiaryDate = new Date(); // 오늘부터 시작
  const ovl = document.getElementById('tamaDiaryOverlay');
  if (ovl) ovl.classList.add('active');
  tamaDiaryRender();
}

function tamaDiaryClose() {
  tamaDiaryOpen = false;
  const ovl = document.getElementById('tamaDiaryOverlay');
  if (ovl) ovl.classList.remove('active');
}

// ── 날짜 이동 ───────────────────────────────────────────
function tamaDiaryPrev() {
  tamaDiaryDate = new Date(tamaDiaryDate.getTime() - 86400000);
  tamaDiaryRender();
}

function tamaDiaryNext() {
  const tomorrow = new Date(tamaDiaryDate.getTime() + 86400000);
  const today = new Date();
  today.setHours(23,59,59,999);
  if (tomorrow > today) return; // 미래 불가
  tamaDiaryDate = tomorrow;
  tamaDiaryRender();
}

function tamaDiaryToday() {
  tamaDiaryDate = new Date();
  tamaDiaryRender();
}

// ── 해금 버튼 핸들러 ────────────────────────────────────
function tamaDiaryUnlockBtn() {
  if (!tamaPet) return;
  const tribe = tamaPet.tribe;
  const cost = TAMA_DIARY_COST;

  if (tamaGetGold() < cost) {
    if (typeof showToast === 'function') showToast('🪙 골드가 부족합니다! (필요: ' + cost + ')');
    return;
  }

  // 확인 대화상자
  if (!confirm('🪙 ' + cost + ' 골드를 사용하여 일기를 해금하시겠습니까?')) return;

  if (tamaDiaryUnlock(tribe, tamaDiaryDate)) {
    if (typeof showToast === 'function') showToast('📖 일기가 해금되었습니다!');
    tamaDiaryRender();
  }
}

// ── 렌더링 ──────────────────────────────────────────────
function tamaDiaryRender() {
  if (!tamaPet) return;
  const container = document.getElementById('tamaDiaryContent');
  if (!container) return;

  const tribe = tamaPet.tribe;
  const tribeInfo = TAMA_TRIBES[tribe] || TAMA_TRIBES.fire;
  const petName = tamaPet.name || '펫';
  const date = tamaDiaryDate;
  const entry = tamaDiarySelect(tribe, date);
  const weather = tamaDiaryWeather(date);
  const unlocked = tamaDiaryIsUnlocked(tribe, date);
  const isToday = isSameDay(date, new Date());

  // Update header date
  const dateLabel = document.getElementById('tamaDiaryDateLabel');
  if (dateLabel) dateLabel.textContent = tamaDiaryFormatDate(date);

  // Update title
  const titleEl = document.getElementById('tamaDiaryTitle');
  if (titleEl) titleEl.textContent = tribeInfo.emoji + ' ' + petName + '의 일기장';

  // Update gold
  const goldEl = document.getElementById('tamaDiaryGold');
  if (goldEl) goldEl.textContent = '🪙 ' + tamaGetGold().toLocaleString();

  // Next button disabled if today
  const nextBtn = document.getElementById('tamaDiaryNextBtn');
  if (nextBtn) nextBtn.disabled = isToday;

  if (!entry) {
    container.innerHTML = '<div class="td-empty">이 종족의 일기가 아직 없습니다.</div>';
    return;
  }

  let html = '';

  // 날짜 & 날씨 헤더
  html += '<div class="td-date-weather">';
  html += '<span class="td-date-text">' + (date.getMonth()+1) + '월 ' + date.getDate() + '일 ' + TAMA_DIARY_DAY_KR[date.getDay()] + '요일</span>';
  if (unlocked) html += '<span class="td-weather">' + weather.emoji + ' ' + weather.label + '</span>';
  html += '</div>';

  if (unlocked) {
    // 해금된 일기 표시
    html += '<div class="td-entry td-entry-revealed">';
    html += '<div class="td-author">' + tribeInfo.emoji + ' ' + petName + '</div>';
    html += '<div class="td-text">' + entry.text + '</div>';
    html += '<div class="td-signature">— ' + petName + ' 올림</div>';
    html += '<div class="td-themes">';
    (entry.themes || []).forEach(function(t) {
      html += '<span class="td-theme-badge">' + (TAMA_DIARY_THEME_LABELS[t] || t) + '</span>';
    });
    html += '</div>';
    html += '</div>';
  } else {
    // 잠긴 일기 표시
    html += '<div class="td-entry td-entry-locked">';
    html += '<div class="td-lock-icon">🔒</div>';
    html += '<div class="td-lock-msg">' + petName + '의 비밀 일기</div>';
    html += '<div class="td-lock-hint">';
    (entry.themes || []).slice(0, 2).forEach(function(t) {
      html += '<span class="td-theme-badge td-theme-hint">' + (TAMA_DIARY_THEME_LABELS[t] || t) + '</span>';
    });
    html += '</div>';
    html += '<button class="td-unlock-btn" onclick="tamaDiaryUnlockBtn()">';
    html += '🪙 ' + TAMA_DIARY_COST + ' 골드로 몰래 읽기';
    html += '</button>';
    html += '</div>';
  }

  container.innerHTML = html;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
