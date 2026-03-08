// ===== PARTYPLAY SKILL SYSTEM v1 =====
// 업적 기반 스킬 해금 + 게임 연동 (포트리스 시범 도입)
// 다른 게임으로 확장 가능한 범용 설계

const SKILL_ACHIEVE_KEY  = 'pd_achievements';
const SKILL_EQUIP_KEY    = 'pd_skill_equip';
const SKILL_MAX_EQUIPPED = 3;
const SKILL_MAX_USES     = 2;

// ── 스킬 정의 ───────────────────────────────────────────────────
// games: 이 스킬이 적용되는 게임 ID 목록 (확장성 확보)
const SKILL_DEFS = [
  {
    id: 'sniper',  name: '저격탄', emoji: '🎯',
    desc: '사거리 무제한, 바람 영향 없음.',
    unlock: { game: 'fortress', type: 'win', count: 10, label: '포트리스 10번 승리' },
    games: ['fortress'],
  },
  {
    id: 'bounce',  name: '바운스탄', emoji: '🏀',
    desc: '벽과 지형에 최대 3회 튕기는 포탄입니다.',
    unlock: { game: 'fortress', type: 'win', count: 20, label: '포트리스 20번 승리' },
    games: ['fortress'],
  },
  {
    id: 'penetrate',  name: '관통탄', emoji: '⚡',
    desc: '지형을 무시하고 직선으로 관통합니다.',
    unlock: { game: 'fortress', type: 'win', count: 30, label: '포트리스 30번 승리' },
    games: ['fortress'],
  },
  {
    id: 'earthquake',  name: '지진탄', emoji: '🌋',
    desc: '착탄 범위 주변 지형이 크게 무너집니다.',
    unlock: { game: 'drinkpoker', type: 'win', count: 50, label: '폭탄주 50번 승리' },
    games: ['fortress'],
  },
  {
    id: 'homing',  name: '유도탄', emoji: '🚀',
    desc: '적을 향해 유도되는 포탄입니다.',
    unlock: { game: 'poker', type: 'win', count: 30, label: '홀덤 30번 승리' },
    games: ['fortress'],
  },
  {
    id: 'knockback',  name: '넉백탄', emoji: '💨',
    desc: '맞은 적을 크게 날려버립니다.',
    unlock: { game: 'sutda', type: 'win', count: 30, label: '섯다 30번 승리' },
    games: ['fortress'],
  },
  {
    id: 'poison',  name: '독 데미지', emoji: '☠️',
    desc: '맞은 적에게 매 턴 독 피해를 줍니다.',
    unlock: { game: 'mafia', type: 'win', count: 10, label: '마피아 10번 승리' },
    games: ['fortress'],
  },
  {
    id: 'double_shot',  name: '포탄 두 발', emoji: '💥',
    desc: '포탄이 2발 동시에 발사됩니다.',
    unlock: { game: 'mafia', type: 'win', count: 20, label: '마피아 20번 승리' },
    games: ['fortress'],
  },
  {
    id: 'split',  name: '분열탄', emoji: '🌟',
    desc: '날아가다 3발로 분열합니다.',
    unlock: { game: 'mafia', type: 'win', count: 50, label: '마피아 50번 승리' },
    games: ['fortress'],
  },
  {
    id: 'cluster',  name: '클러스터', emoji: '💣',
    desc: '착탄 후 주변에 소형 폭탄을 산포합니다.',
    unlock: { game: 'mafia', type: 'win', count: 100, label: '마피아 100번 승리' },
    games: ['fortress'],
  },
  {
    id: 'double_pierce',  name: '땅 두 번 뚫기', emoji: '🔩',
    desc: '지형을 2번 관통하는 포탄입니다.',
    unlock: { game: 'slinky', type: 'win', count: 10, label: '술피하기 10번 승리' },
    games: ['fortress'],
  },
  {
    id: 'triple_pierce',  name: '땅 세 번 뚫기', emoji: '🔱',
    desc: '지형을 3번 관통하는 포탄입니다.',
    unlock: { game: 'slinky', type: 'win', count: 20, label: '술피하기 20번 승리' },
    games: ['fortress'],
  },
  {
    id: 'ice',  name: '빙결탄', emoji: '❄️',
    desc: '맞은 적을 1턴 행동 불가로 만듭니다.',
    unlock: { game: 'detective', type: 'win', count: 50, label: '형사와 강도 50번 승리' },
    games: ['fortress'],
  },
];

// ── 업적 저장소 ─────────────────────────────────────────────────
function skillsGetAchievements() {
  try { return JSON.parse(localStorage.getItem(SKILL_ACHIEVE_KEY) || '{}'); }
  catch(e) { return {}; }
}
function _skillsSaveAchievements(a) {
  localStorage.setItem(SKILL_ACHIEVE_KEY, JSON.stringify(a));
}
function skillsRecordPlay(game) {
  if (!game) return;
  const a = skillsGetAchievements();
  if (!a[game]) a[game] = { play: 0, win: 0 };
  a[game].play++;
  _skillsSaveAchievements(a);
}
function skillsRecordWin(game) {
  if (!game) return;
  const a = skillsGetAchievements();
  if (!a[game]) a[game] = { play: 0, win: 0 };
  a[game].win++;
  _skillsSaveAchievements(a);
}

// ── 해금 판정 ────────────────────────────────────────────────────
// [CHEAT] 아이콘 3연타 강제 해금용
const _skillCheatTaps = {};  // { skillId: { count, timer } }
const SKILL_CHEAT_KEY = 'pd_skill_cheat_unlocked';

function _skillCheatGetUnlocked() {
  try { return JSON.parse(localStorage.getItem(SKILL_CHEAT_KEY) || '[]'); }
  catch(e) { return []; }
}
function _skillCheatForceUnlock(skillId) {
  const list = _skillCheatGetUnlocked();
  if (!list.includes(skillId)) {
    list.push(skillId);
    localStorage.setItem(SKILL_CHEAT_KEY, JSON.stringify(list));
  }
}
function _skillCheatHandleTap(skillId) {
  const now = Date.now();
  const t = _skillCheatTaps[skillId] || { count: 0, last: 0 };
  // 1초 이내 연속 탭만 카운트
  if (now - t.last > 1000) t.count = 0;
  t.count++;
  t.last = now;
  _skillCheatTaps[skillId] = t;
  if (t.count >= 3) {
    t.count = 0;
    _skillCheatForceUnlock(skillId);
    _skillsRenderOverlay();
  }
}

function skillsIsUnlocked(skillId) {
  // [CHEAT] 강제 해금 목록 체크
  if (_skillCheatGetUnlocked().includes(skillId)) return true;
  const def = SKILL_DEFS.find(s => s.id === skillId);
  if (!def) return false;
  const a = skillsGetAchievements();
  const g = a[def.unlock.game] || { play: 0, win: 0 };
  return (g[def.unlock.type] || 0) >= def.unlock.count;
}
function skillsGetDef(skillId) {
  return SKILL_DEFS.find(s => s.id === skillId) || null;
}

// ── 장착 관리 ────────────────────────────────────────────────────
function skillsGetEquipped(game) {
  try {
    const data = JSON.parse(localStorage.getItem(SKILL_EQUIP_KEY) || '{}');
    return (data[game] || []).filter(id => skillsIsUnlocked(id));
  } catch(e) { return []; }
}
function skillsSetEquipped(game, skillIds) {
  try {
    const data = JSON.parse(localStorage.getItem(SKILL_EQUIP_KEY) || '{}');
    data[game] = skillIds.slice(0, SKILL_MAX_EQUIPPED);
    localStorage.setItem(SKILL_EQUIP_KEY, JSON.stringify(data));
  } catch(e) {}
}

// ── 타마고치 스킬 오버레이 ──────────────────────────────────────
function tamaShowSkills() {
  const ovl = document.getElementById('tamaSkillOverlay');
  if (!ovl) return;
  ovl.style.display = 'flex';
  _skillsRenderOverlay();
}
function tamaCloseSkills() {
  const ovl = document.getElementById('tamaSkillOverlay');
  if (ovl) ovl.style.display = 'none';
}

function _skillsRenderOverlay() {
  const ovl = document.getElementById('tamaSkillOverlay');
  if (!ovl) return;
  const game = 'fortress';
  const equipped = skillsGetEquipped(game);
  const achieve = skillsGetAchievements();

  ovl.innerHTML = `
    <div class="skill-ovl-panel">
      <div class="skill-ovl-header">
        <span class="skill-ovl-title">⚔️ 스킬 해금</span>
        <button class="skill-ovl-close" onclick="tamaCloseSkills()">✕</button>
      </div>
      <div class="skill-ovl-tabs">
        <button class="skill-tab active">🏰 포트리스</button>
      </div>
      <div class="skill-equip-section">
        <div class="skill-equip-label">장착 슬롯 (${equipped.length}/${SKILL_MAX_EQUIPPED}) · 게임당 스킬별 최대 ${SKILL_MAX_USES}회 사용</div>
        <div class="skill-equip-slots">
          ${_skillsRenderEquipSlots(game, equipped)}
        </div>
      </div>
      <div class="skill-list-section">
        <div class="skill-list-label">스킬 목록</div>
        <div class="skill-list">
          ${_skillsRenderList(game, equipped, achieve)}
        </div>
      </div>
    </div>
  `;
}

function _skillsRenderEquipSlots(game, equipped) {
  const slots = [];
  for (let i = 0; i < SKILL_MAX_EQUIPPED; i++) {
    const id = equipped[i];
    const def = id ? skillsGetDef(id) : null;
    if (def) {
      slots.push(`<div class="skill-slot filled" onclick="skillsUnequipSlot('${game}',${i})">
        <div class="skill-slot-emoji">${def.emoji}</div>
        <div class="skill-slot-name">${def.name}</div>
        <div class="skill-slot-hint">탭하여 해제</div>
      </div>`);
    } else {
      slots.push(`<div class="skill-slot empty">
        <div class="skill-slot-plus">+</div>
        <div class="skill-slot-name">비어 있음</div>
      </div>`);
    }
  }
  return slots.join('');
}

function _skillsRenderList(game, equipped, achieve) {
  return SKILL_DEFS.filter(s => s.games.includes(game)).map(s => {
    const unlocked = skillsIsUnlocked(s.id);
    const isEquipped = equipped.includes(s.id);
    const g = achieve[s.unlock.game] || { play: 0, win: 0 };
    const progress = g[s.unlock.type] || 0;
    const pct = Math.min(100, Math.floor(progress / s.unlock.count * 100));
    const canEquip = unlocked && !isEquipped && equipped.length < SKILL_MAX_EQUIPPED;
    return `<div class="skill-item ${unlocked ? 'unlocked' : 'locked'} ${isEquipped ? 'equipped' : ''}">
      <div class="skill-item-icon" onclick="event.stopPropagation();_skillCheatHandleTap('${s.id}')">${s.emoji}</div>
      <div class="skill-item-body">
        <div class="skill-item-name">${s.name}</div>
        <div class="skill-item-desc">${s.desc}</div>
        ${unlocked ? '' : `<div class="skill-progress-row">
          <div class="skill-progress-track"><div class="skill-progress-fill" style="width:${pct}%"></div></div>
          <span class="skill-progress-text">${progress}/${s.unlock.count} ${s.unlock.label}</span>
        </div>`}
      </div>
      <div class="skill-item-action">
        ${isEquipped
          ? `<button class="skill-btn-unequip" onclick="skillsUnequipById('${game}','${s.id}')">해제</button>`
          : canEquip
          ? `<button class="skill-btn-equip" onclick="skillsEquipById('${game}','${s.id}')">장착</button>`
          : unlocked
          ? `<span class="skill-item-max">슬롯 가득</span>`
          : `<span class="skill-lock-icon">🔒</span>`
        }
      </div>
    </div>`;
  }).join('');
}

function skillsEquipById(game, skillId) {
  const equipped = skillsGetEquipped(game);
  if (equipped.includes(skillId) || equipped.length >= SKILL_MAX_EQUIPPED) return;
  equipped.push(skillId);
  skillsSetEquipped(game, equipped);
  _skillsRenderOverlay();
}
function skillsUnequipById(game, skillId) {
  const equipped = skillsGetEquipped(game).filter(id => id !== skillId);
  skillsSetEquipped(game, equipped);
  _skillsRenderOverlay();
}
function skillsUnequipSlot(game, slotIdx) {
  const equipped = skillsGetEquipped(game);
  equipped.splice(slotIdx, 1);
  skillsSetEquipped(game, equipped);
  _skillsRenderOverlay();
}
