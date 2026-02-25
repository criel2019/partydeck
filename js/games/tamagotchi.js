// ===== TAMAGOTCHI - 포트리스 타마고치 육성 시스템 v2 =====
// 상용 품질 리팩터: 100개 이슈 수정 반영

const TAMA_VERSION = 2;
const TAMA_STORAGE_KEY = 'pd_tama_pet';
const TAMA_TICK_MS = 1000;
const TAMA_SAVE_INTERVAL = 30;
const TAMA_IDLE_SPEECH_INTERVAL = 60;

// ── Data Tables ────────────────────────────────────────
const TAMA_TRIBES = {
  fire:    { emoji:'🐉', name:'화염', desc:'공격 특화',  color:'#ff6b35', statBonus:{dmg:2} },
  rock:    { emoji:'🗿', name:'암석', desc:'방어 특화',  color:'#8b7765', statBonus:{def:2} },
  wind:    { emoji:'🦅', name:'풍래', desc:'속도 특화',  color:'#64ffda', statBonus:{spd:2} },
  thunder: { emoji:'🐯', name:'뇌전', desc:'밸런스형',  color:'#ffeb3b', statBonus:{dmg:1,spd:1} },
  spirit:  { emoji:'🔮', name:'영혼', desc:'전술 특화',  color:'#b388ff', statBonus:{bomb:2} }
};

const TAMA_STAGES = [
  { name:'알',   minLv:0  },
  { name:'유아', minLv:1  },
  { name:'소년', minLv:5  },
  { name:'청년', minLv:10 },
  { name:'전사', minLv:20 }
];

const TAMA_SPRITE_MAP = {
  fire:   ['🥚','🔥','🦎','🐲','🐉'],
  rock:   ['🥚','🪨','🐢','🦏','🗿'],
  wind:   ['🥚','🍃','🐤','🦅','🦚'],
  thunder:['🥚','⚡','🐱','🐯','🐅'],
  spirit: ['🥚','✨','👻','🔮','🌀']
};

const TAMA_PERSONALITIES = ['active','calm','playful'];
const TAMA_PERSONALITY_NAMES = { active:'활발', calm:'차분', playful:'장난' };
const TAMA_DECAY = { hunger:12, happiness:8, hygiene:6, energy:4 };
const TAMA_MOOD_W = { hunger:0.35, happiness:0.30, hygiene:0.20, energy:0.15 };

const TAMA_MOODS = [
  { min:80, label:'최상', emoji:'😆', cls:'best' },
  { min:60, label:'좋음', emoji:'😊', cls:'good' },
  { min:40, label:'보통', emoji:'😐', cls:'normal' },
  { min:20, label:'나쁨', emoji:'😟', cls:'bad' },
  { min:0,  label:'최악', emoji:'😫', cls:'worst' }
];

const TAMA_AFF_TIERS = [
  { name:'경계', min:0,   emoji:'💔' },
  { name:'친근', min:50,  emoji:'💛' },
  { name:'신뢰', min:150, emoji:'💚' },
  { name:'유대', min:350, emoji:'💙' },
  { name:'영혼', min:700, emoji:'💜' }
];

const TAMA_FOODS = [
  { id:'bread',    emoji:'🍞', name:'빵',        cat:'basic',  hunger:15, exp:5,  costBase:20, happy:2,  hygiene:0 },
  { id:'rice',     emoji:'🍚', name:'밥',        cat:'basic',  hunger:20, exp:6,  costBase:25, happy:3,  hygiene:0 },
  { id:'meat',     emoji:'🍖', name:'고기',      cat:'basic',  hunger:25, exp:8,  costBase:35, happy:5,  hygiene:0 },
  { id:'fish',     emoji:'🐟', name:'생선',      cat:'basic',  hunger:22, exp:7,  costBase:30, happy:4,  hygiene:0 },
  { id:'egg',      emoji:'🥚', name:'달걀',      cat:'basic',  hunger:12, exp:4,  costBase:15, happy:1,  hygiene:0 },
  { id:'salad',    emoji:'🥗', name:'샐러드',    cat:'healthy', hunger:10, exp:10, costBase:40, happy:3,  hygiene:5 },
  { id:'soup',     emoji:'🍲', name:'수프',      cat:'healthy', hunger:18, exp:12, costBase:45, happy:4,  hygiene:3 },
  { id:'fruit',    emoji:'🍎', name:'과일',      cat:'healthy', hunger:8,  exp:8,  costBase:30, happy:6,  hygiene:2 },
  { id:'milk',     emoji:'🥛', name:'우유',      cat:'healthy', hunger:10, exp:9,  costBase:25, happy:5,  hygiene:0 },
  { id:'vitamin',  emoji:'💊', name:'영양제',    cat:'healthy', hunger:5,  exp:15, costBase:60, happy:1,  hygiene:0 },
  { id:'cookie',   emoji:'🍪', name:'쿠키',      cat:'snack',  hunger:8,  exp:3,  costBase:15, happy:10, hygiene:-2 },
  { id:'cake',     emoji:'🍰', name:'케이크',    cat:'snack',  hunger:12, exp:4,  costBase:30, happy:15, hygiene:-3 },
  { id:'icecream', emoji:'🍦', name:'아이스크림', cat:'snack',  hunger:6,  exp:3,  costBase:20, happy:12, hygiene:-5 },
  { id:'candy',    emoji:'🍬', name:'사탕',      cat:'snack',  hunger:3,  exp:2,  costBase:10, happy:8,  hygiene:-1 },
  { id:'chocolate',emoji:'🍫', name:'초콜릿',    cat:'snack',  hunger:5,  exp:3,  costBase:18, happy:12, hygiene:-2 }
];
const TAMA_FOOD_CATS = { basic:'기본식', healthy:'건강식', snack:'간식' };

const TAMA_EVO1_TYPES = [
  { id:'attack',  name:'공격형',  emoji:'⚔️', desc:'데미지 +3',    stat:'dmg', bonus:3 },
  { id:'defense', name:'방어형',  emoji:'🛡️', desc:'방어 +3',     stat:'def', bonus:3 },
  { id:'speed',   name:'기동형',  emoji:'💨', desc:'속도 +3',     stat:'spd', bonus:3 },
  { id:'tactical',name:'전술형',  emoji:'🎯', desc:'폭탄범위 +3', stat:'bomb',bonus:3 },
  { id:'allround',name:'올라운더',emoji:'⭐', desc:'전스탯 +1',   stat:'all', bonus:1 }
];

const TAMA_EVO2_QUALITY = [
  { tier:'유대',   suffix:'★★★', bonus:3 },
  { tier:'신뢰',   suffix:'★★',  bonus:2 },
  { tier:'default',suffix:'★',   bonus:1 }
];

const TAMA_IDLE_ANIMS = {
  best:  ['bounce','dance','sparkle','sparkle'],
  good:  ['bounce','walk','nod'],
  normal:['bounce','blink','look'],
  bad:   ['slouch','yawn','sigh'],
  worst: ['tremble','huddle','cry']
};

const TAMA_SPEECHES = {
  greet_morning: ['좋은 아침이야!','오늘도 파이팅!','일어났다~!','해가 떴어!'],
  greet_day:     ['오늘 뭐 할까?','같이 놀자!','심심해~','좋은 하루야!'],
  greet_night:   ['졸려...','오늘 하루도 수고했어','별이 예쁘다...','잘 자~'],
  hungry_mild:   ['배 좀 고프다...','뭐 좀 먹고 싶어','간식 줄래?','꼬르륵...'],
  hungry_severe: ['배고파아아!!','밥! 밥 줘!','쓰러지겠어...','헉... 힘없어...'],
  happy:         ['기분 좋다~!','행복해!','노래 부르고 싶어!','오늘 최고야!'],
  sad:           ['우울해...','놀아줘...','혼자 심심해...','외로워...'],
  bath_before:   ['좀 더러운 것 같아...','씻고 싶어...','몸이 끈적끈적해...'],
  bath_after:    ['깨끗해졌다!','상쾌해!','뽀송뽀송~','반짝반짝!'],
  feed_after:    ['맛있다!','냠냠!','배부르다~','고마워!','더 줘!','최고의 맛!'],
  play_after:    ['재밌다!','또 놀자!','하하하!','신난다~!','이긴 거지?!'],
  sleep_before:  ['졸려...','눈이 감겨...','하아암...'],
  sleep_after:   ['잘 잤다!','푹 쉬었어!','개운해!','꿈에서 널 봤어!'],
  train_after:   ['강해진 느낌!','더 열심히 할게!','근육이 뻣뻣해...'],
  idle_best:     ['기분 최고!','세상이 아름다워!','날아갈 것 같아!','콧노래~♪'],
  idle_good:     ['오늘 괜찮은 날이야','뭔가 좋은 일이 생길 것 같아','흥흥~'],
  idle_normal:   ['그냥 그래...','보통이야','뭐 할까...','멍...'],
  idle_bad:      ['기분이 별로야...','어딘가 불편해...','응...','한숨...'],
  idle_worst:    ['힘들어...','싫어...','포기하고 싶어...','돌봐줘...'],
  levelup:       ['레벨 업!','더 강해졌어!','성장했다!'],
  evolve:        ['진화한다!!','몸이 변하고 있어!','새로운 힘이 느껴져!'],
  affinity_up:   ['우리 사이가 더 가까워졌어!','너를 더 좋아하게 됐어!','최고의 파트너야!'],
  active_idle:   ['뛰고 싶다!','가만히 있기 싫어!','모험 가자!','운동하자!'],
  calm_idle:     ['...','조용히 있고 싶어','책 읽을래...','평화롭다'],
  playful_idle:  ['장난치고 싶다!','까꿍!','헤헤헤~','뭐 재미있는 거 없어?'],
  energy_low:    ['지쳤어...','쉬고 싶다...','눈이 감겨...'],
  happy_low:     ['놀아줘...','재미없어...','외로워...']
};

// ── State ──────────────────────────────────────────────
let tamaPet = null;
let tamaTickId = null;
let tamaSaveCounter = 0;
let tamaSpeechCounter = 0;
let tamaSpeechTimeout = null;
let tamaIdleTimeout = null;
let tamaSleepInterval = null;
let tamaSleeping = false;
let tamaWelcomeBackBonus = false;
let tamaSelectedTribe = null;
let tamaEggTaps = 0;
let tamaFeedCat = 'all';
let tamaAnimLock = false; // prevent sprite class reset during animation

// DOM cache (populated on home show)
const _td = {};
function tamaCacheDom() {
  const ids = [
    'tamaPetNameLabel','tamaGoldValue','tamaLevelBadge','tamaExpFill',
    'tamaExpText','tamaStageLabel','tamaSpriteMain','tamaMoodDisplay',
    'tamaSpeechBubble','tamaPetArea','tamaStatsRow','tamaStatAllocBtn',
    'tamaAffinityFill','tamaAffinityLabel','tamaAffinityTierLabel',
    'tamaAffinityVal','tamaBathBtn','tamaPersonalityLabel','tamaPetAge',
    'tamaHomeScreen'
  ];
  const needKeys = ['hunger','happiness','hygiene','energy'];
  ids.forEach(id => { _td[id] = document.getElementById(id); });
  needKeys.forEach(k => {
    _td['need_'+k] = document.getElementById('tamaNeed_'+k);
    _td['needVal_'+k] = document.getElementById('tamaNeedVal_'+k);
  });
}

// ── Helpers ────────────────────────────────────────────
function tamaClamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function tamaExpReq(lv){return Math.floor(100*Math.pow(lv,1.5));}
function tamaFoodCost(f,lv){return Math.floor(f.costBase*Math.pow(1.15,lv-1));}
function tamaVibrate(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}

function tamaMoodScore(){
  if(!tamaPet)return 0;
  const n=tamaPet.needs;
  return n.hunger*TAMA_MOOD_W.hunger+n.happiness*TAMA_MOOD_W.happiness+
         n.hygiene*TAMA_MOOD_W.hygiene+n.energy*TAMA_MOOD_W.energy;
}
function tamaMoodInfo(){
  const s=tamaMoodScore();
  for(const m of TAMA_MOODS) if(s>=m.min) return m;
  return TAMA_MOODS[TAMA_MOODS.length-1];
}
function tamaStageIdx(pet){
  const p=pet||tamaPet; if(!p)return 0;
  for(let i=TAMA_STAGES.length-1;i>=0;i--) if(p.level>=TAMA_STAGES[i].minLv) return i;
  return 0;
}
function tamaSprite(pet){
  const p=pet||tamaPet; if(!p)return '🥚';
  return (TAMA_SPRITE_MAP[p.tribe]||[])[tamaStageIdx(p)]||'🥚';
}
function tamaAffTier(pet){
  const p=pet||tamaPet; if(!p)return TAMA_AFF_TIERS[0];
  for(let i=TAMA_AFF_TIERS.length-1;i>=0;i--) if(p.affinity>=TAMA_AFF_TIERS[i].min) return TAMA_AFF_TIERS[i];
  return TAMA_AFF_TIERS[0];
}
function tamaAffNext(){
  const t=tamaAffTier(); const i=TAMA_AFF_TIERS.indexOf(t);
  return i<TAMA_AFF_TIERS.length-1?TAMA_AFF_TIERS[i+1].min:1000;
}
function tamaGetGold(){
  if(typeof _economy!=='undefined'&&_economy) return _economy.gold||0;
  try{return (JSON.parse(localStorage.getItem('pd_economy')||'{}')).gold||0;}catch(e){return 0;}
}
function tamaPetAge(){
  if(!tamaPet)return '';
  const days=Math.floor((Date.now()-tamaPet.createdAt)/86400000);
  return days<1?'오늘 태어남':days+'일째';
}

// ── Save / Load ────────────────────────────────────────
function tamaSave(){
  if(!tamaPet)return;
  tamaPet.needsUpdatedAt=Date.now();
  tamaPet._v=TAMA_VERSION;
  try{localStorage.setItem(TAMA_STORAGE_KEY,JSON.stringify(tamaPet));}
  catch(e){if(typeof showToast==='function')showToast('저장 실패: 저장공간 부족');}
}

function tamaLoad(){
  try{
    const raw=localStorage.getItem(TAMA_STORAGE_KEY);
    if(!raw)return false;
    tamaPet=JSON.parse(raw);
    tamaMigrate();
    tamaValidate();
    return true;
  }catch(e){tamaPet=null;return false;}
}

function tamaMigrate(){
  if(!tamaPet)return;
  // v1 → v2 migration: add missing fields
  if(!tamaPet._v||tamaPet._v<2){
    if(tamaPet.totalPlays===undefined) tamaPet.totalPlays=0;
    if(tamaPet.totalBaths===undefined) tamaPet.totalBaths=0;
    if(tamaPet.totalFeedings===undefined) tamaPet.totalFeedings=0;
    if(tamaPet.personality===undefined) tamaPet.personality=TAMA_PERSONALITIES[Math.floor(Math.random()*3)];
    if(tamaPet.createdAt===undefined) tamaPet.createdAt=Date.now()-86400000;
    tamaPet._v=TAMA_VERSION;
  }
}

function tamaValidate(){
  if(!tamaPet)return;
  const n=tamaPet.needs;
  ['hunger','happiness','hygiene','energy'].forEach(k=>{
    if(typeof n[k]!=='number'||isNaN(n[k])) n[k]=50;
    n[k]=tamaClamp(n[k],0,100);
  });
  tamaPet.level=tamaClamp(tamaPet.level||1,1,50);
  tamaPet.exp=Math.max(0,tamaPet.exp||0);
  tamaPet.affinity=Math.max(0,tamaPet.affinity||0);
  tamaPet.statPoints=Math.max(0,tamaPet.statPoints||0);
  if(!tamaPet.stats)tamaPet.stats={dmg:3,def:3,spd:3,bomb:3};
  ['dmg','def','spd','bomb'].forEach(k=>{tamaPet.stats[k]=Math.max(0,tamaPet.stats[k]||0);});
  if(!TAMA_TRIBES[tamaPet.tribe]) tamaPet.tribe='fire';
}

function tamaReset(){tamaPet=null;localStorage.removeItem(TAMA_STORAGE_KEY);}

// ── Create Pet ─────────────────────────────────────────
function tamaCreatePet(tribe,name){
  const pers=TAMA_PERSONALITIES[Math.floor(Math.random()*3)];
  tamaPet={
    _v:TAMA_VERSION, id:'tama_'+Date.now(), name:name||'이름없음',
    tribe:tribe, personality:pers, createdAt:Date.now(),
    level:1, exp:0,
    stats:{dmg:3,def:3,spd:3,bomb:3}, statPoints:0,
    needs:{hunger:80,happiness:80,hygiene:80,energy:80}, needsUpdatedAt:Date.now(),
    affinity:0, evolution1:null, evolution2:null, specType:null,
    lastFed:0, lastBathed:0, lastPlayed:0,
    totalFeedings:0, totalBaths:0, totalPlays:0,
    hatched:true, ftueComplete:false
  };
  const bonus=TAMA_TRIBES[tribe].statBonus;
  if(bonus) Object.keys(bonus).forEach(k=>{tamaPet.stats[k]+=bonus[k];});
  tamaSave();
}

// ── Offline ────────────────────────────────────────────
function tamaProcessOffline(){
  if(!tamaPet||!tamaPet.needsUpdatedAt)return 0;
  const now=Date.now();
  const elapsed=Math.max(0,(now-tamaPet.needsUpdatedAt)/1000);
  if(elapsed<60)return 0;
  const hrs=elapsed/3600;
  const n=tamaPet.needs;
  n.hunger   =Math.max(20,n.hunger   -TAMA_DECAY.hunger   *hrs);
  n.happiness=Math.max(20,n.happiness-TAMA_DECAY.happiness*hrs);
  n.hygiene  =Math.max(20,n.hygiene  -TAMA_DECAY.hygiene  *hrs);
  n.energy   =Math.max(20,n.energy   -TAMA_DECAY.energy   *hrs);
  tamaPet.needsUpdatedAt=now;
  tamaSave();
  return elapsed;
}

function tamaOfflineMsg(sec){
  const h=sec/3600;
  if(h<1)return null;
  if(h<4)return '잠깐 어디 갔었어? 심심했어...';
  if(h<24)return '오래 기다렸어... 배고파!';
  if(h<48)return '혼자 있으니까 무서웠어... 다행이다 돌아왔구나!';
  return '정말 오랫동안 안 왔잖아... 다시 와줘서 고마워 ㅠㅠ';
}

// ── Tick ───────────────────────────────────────────────
function tamaStartTick(){
  tamaStopTick();
  tamaSaveCounter=0;
  tamaSpeechCounter=0;
  tamaTickId=setInterval(tamaTick,TAMA_TICK_MS);
}
function tamaStopTick(){
  if(tamaTickId){clearInterval(tamaTickId);tamaTickId=null;}
  if(tamaSpeechTimeout){clearTimeout(tamaSpeechTimeout);tamaSpeechTimeout=null;}
  if(tamaIdleTimeout){clearTimeout(tamaIdleTimeout);tamaIdleTimeout=null;}
  if(tamaSleepInterval){clearInterval(tamaSleepInterval);tamaSleepInterval=null;}
  tamaSleeping=false;
}

function tamaTick(){
  if(!tamaPet)return;
  const n=tamaPet.needs;
  n.hunger   =Math.max(0,n.hunger   -TAMA_DECAY.hunger   /3600);
  n.happiness=Math.max(0,n.happiness-TAMA_DECAY.happiness/3600);
  n.hygiene  =Math.max(0,n.hygiene  -TAMA_DECAY.hygiene  /3600);
  n.energy   =Math.max(0,n.energy   -TAMA_DECAY.energy   /3600);
  tamaPet.needsUpdatedAt=Date.now();

  tamaRenderNeeds();
  tamaRenderMood();
  tamaRenderBathCD();
  // Gold refresh every 5s
  if(tamaSaveCounter%5===0){
    const ge=_td.tamaGoldValue;
    if(ge) ge.textContent=tamaGetGold().toLocaleString();
  }

  tamaSaveCounter++;
  if(tamaSaveCounter>=TAMA_SAVE_INTERVAL){tamaSaveCounter=0;tamaSave();}
  tamaSpeechCounter++;
  if(tamaSpeechCounter>=TAMA_IDLE_SPEECH_INTERVAL){tamaSpeechCounter=0;tamaRandomSpeech();}
}

// ── Speech ─────────────────────────────────────────────
function tamaPick(cat){
  const l=TAMA_SPEECHES[cat];
  return l&&l.length?l[Math.floor(Math.random()*l.length)]:'';
}
function tamaSpeech(text,dur){
  const el=_td.tamaSpeechBubble||document.getElementById('tamaSpeechBubble');
  if(!el||!text)return;
  el.textContent=text;
  el.classList.add('visible');
  if(tamaSpeechTimeout)clearTimeout(tamaSpeechTimeout);
  tamaSpeechTimeout=setTimeout(()=>{el.classList.remove('visible');tamaSpeechTimeout=null;},dur||3000);
}

function tamaRandomSpeech(){
  if(!tamaPet)return;
  const n=tamaPet.needs;
  if(n.hunger<20){tamaSpeech(tamaPick('hungry_severe'));return;}
  if(n.hunger<40){tamaSpeech(tamaPick('hungry_mild'));return;}
  if(n.hygiene<30){tamaSpeech(tamaPick('bath_before'));return;}
  if(n.energy<20){tamaSpeech(tamaPick('energy_low'));return;}
  if(n.happiness<30){tamaSpeech(tamaPick('happy_low'));return;}

  const mood=tamaMoodInfo();
  const mKey='idle_'+mood.cls;
  if(Math.random()<0.3&&tamaPet.personality){
    const pk=tamaPet.personality+'_idle';
    if(TAMA_SPEECHES[pk]){tamaSpeech(tamaPick(pk));return;}
  }
  if(TAMA_SPEECHES[mKey]){tamaSpeech(tamaPick(mKey));return;}

  const h=new Date().getHours();
  if(h<6||h>=22) tamaSpeech(tamaPick('greet_night'));
  else if(h<12) tamaSpeech(tamaPick('greet_morning'));
  else tamaSpeech(tamaPick('greet_day'));
}

// ── Idle Animation ─────────────────────────────────────
function tamaStartIdle(){
  if(tamaIdleTimeout)clearTimeout(tamaIdleTimeout);
  const d=8000+Math.random()*12000;
  tamaIdleTimeout=setTimeout(()=>{tamaPlayIdle();tamaStartIdle();},d);
}
function tamaPlayIdle(){
  if(!tamaPet)return;
  const sp=_td.tamaSpriteMain;if(!sp)return;
  const mood=tamaMoodInfo();
  const anims=TAMA_IDLE_ANIMS[mood.cls]||TAMA_IDLE_ANIMS.normal;
  const a=anims[Math.floor(Math.random()*anims.length)];
  switch(a){
    case 'bounce':sp.classList.remove('idle-bounce');void sp.offsetWidth;sp.classList.add('idle-bounce');break;
    case 'dance':case 'spin':tamaAnimSprite('happy',500);break;
    case 'sparkle':tamaParticle('✨');break;
    case 'walk':case 'nod':case 'look':case 'blink':
      sp.classList.remove('idle-bounce');void sp.offsetWidth;sp.classList.add('idle-bounce');break;
    case 'yawn':case 'sigh':case 'slouch':tamaParticle('💤');break;
    case 'tremble':case 'huddle':case 'cry':tamaParticle('💧');break;
  }
}
function tamaParticle(emoji){
  const area=_td.tamaPetArea||document.getElementById('tamaPetArea');
  if(!area)return;
  const p=document.createElement('div');
  p.className='tama-particle';p.textContent=emoji;
  p.style.left=(40+Math.random()*20)+'%';p.style.top='40%';
  area.appendChild(p);
  setTimeout(()=>p.remove(),2000);
}
function tamaAnimSprite(cls,ms){
  if(tamaAnimLock)return;
  const sp=_td.tamaSpriteMain;if(!sp)return;
  tamaAnimLock=true;
  sp.classList.add(cls);
  setTimeout(()=>{sp.classList.remove(cls);tamaAnimLock=false;},ms);
}

// ── EXP & Level ────────────────────────────────────────
function tamaAddExp(amount){
  if(!tamaPet)return;
  tamaPet.exp+=amount;
  while(tamaPet.exp>=tamaExpReq(tamaPet.level)&&tamaPet.level<50){
    tamaPet.exp-=tamaExpReq(tamaPet.level);
    tamaPet.level++;
    tamaPet.statPoints++;
    tamaOnLevelUp();
  }
  tamaPet.exp=Math.max(0,tamaPet.exp);
  tamaRenderLevel();
  tamaRenderStats();
}

function tamaOnLevelUp(){
  tamaShowFlash('Lv.'+tamaPet.level+' 달성!',tamaPick('levelup'));
  tamaVibrate([50,30,50]);
  const oldStg=tamaStageIdx();
  // Stage change sprite update (delayed so flash shows first)
  setTimeout(()=>{
    if(tamaStageIdx()!==oldStg) tamaRenderSprite();
  },1600);
  // Evolution triggers
  if(tamaPet.level===15&&!tamaPet.evolution1) setTimeout(()=>tamaShowEvo1(),2200);
  if(tamaPet.level===25&&!tamaPet.evolution2) setTimeout(()=>tamaShowEvo2(),2200);
  tamaSave();
}

function tamaShowFlash(text,sub){
  const f=document.getElementById('tamaLevelUpFlash');if(!f)return;
  f.querySelector('.lu-text').textContent=text;
  f.querySelector('.lu-sub').textContent=sub||'';
  f.classList.add('active');
  setTimeout(()=>f.classList.remove('active'),2200);
}

// ── Affinity ───────────────────────────────────────────
function tamaAddAff(amount){
  if(!tamaPet)return;
  const old=tamaAffTier();
  tamaPet.affinity+=amount;
  const nw=tamaAffTier();
  if(nw.name!==old.name) tamaOnAffUp(nw);
  tamaRenderAffinity();
}
function tamaOnAffUp(tier){
  const f=document.getElementById('tamaAffinityFlash');
  if(f){
    f.querySelector('.af-text').textContent=tier.emoji+' '+tier.name+' 등급 달성!';
    f.classList.add('active');
    setTimeout(()=>f.classList.remove('active'),2500);
  }
  tamaSpeech(tamaPick('affinity_up'),4000);
  tamaVibrate([30,20,30]);
}

// ── Actions ────────────────────────────────────────────

// Feed
function tamaFeedAndClose(foodId){
  if(tamaFeed(foodId)) tamaCloseOvl('tamaFeedOverlay');
}
function tamaFeed(foodId){
  if(!tamaPet)return false;
  const food=TAMA_FOODS.find(f=>f.id===foodId);if(!food)return false;
  const cost=tamaFoodCost(food,tamaPet.level);
  if(tamaGetGold()<cost){
    if(typeof showToast==='function')showToast('🪙 골드가 부족합니다!');
    return false;
  }
  if(typeof addGold==='function')addGold(-cost);

  const mult=tamaWelcomeBackBonus?2:1;
  tamaPet.needs.hunger   =tamaClamp(tamaPet.needs.hunger   +food.hunger*mult,0,100);
  tamaPet.needs.happiness=tamaClamp(tamaPet.needs.happiness+(food.happy||0)*mult,0,100);
  tamaPet.needs.hygiene  =tamaClamp(tamaPet.needs.hygiene  +(food.hygiene||0),0,100);
  tamaWelcomeBackBonus=false;

  tamaAddExp(food.exp);
  tamaAddAff(5);
  tamaPet.lastFed=Date.now();
  tamaPet.totalFeedings++;

  tamaAnimSprite('eating',600);
  tamaSpeech(tamaPick('feed_after'));
  tamaParticle(food.emoji);
  tamaVibrate(30);

  tamaSave();
  tamaRenderNeeds();tamaRenderMood();tamaRenderAffinity();tamaRenderStats();tamaRenderLevel();
  if(_td.tamaGoldValue)_td.tamaGoldValue.textContent=tamaGetGold().toLocaleString();
  return true;
}

// Bathe
function tamaBathe(){
  if(!tamaPet)return;
  const cd=5*60*1000;
  if(tamaPet.lastBathed&&Date.now()-tamaPet.lastBathed<cd){
    const sec=Math.ceil((cd-(Date.now()-tamaPet.lastBathed))/1000);
    if(typeof showToast==='function') showToast('🛁 쿨다운: '+(sec>=60?Math.ceil(sec/60)+'분':sec+'초'));
    return;
  }
  const mult=tamaWelcomeBackBonus?2:1;
  tamaPet.needs.hygiene=tamaClamp(tamaPet.needs.hygiene+30*mult,0,100);
  tamaWelcomeBackBonus=false;
  tamaAddAff(3);
  tamaPet.lastBathed=Date.now();
  tamaPet.totalBaths++;

  tamaAnimSprite('bathing',800);
  tamaSpeech(tamaPick('bath_after'));
  tamaParticle('🫧');
  tamaVibrate(30);

  tamaSave();
  tamaRenderNeeds();tamaRenderMood();tamaRenderAffinity();tamaRenderBathCD();
}

// Play
function tamaPlay(){
  if(!tamaPet)return;
  if(tamaPet.lastPlayed&&Date.now()-tamaPet.lastPlayed<3000){
    if(typeof showToast==='function')showToast('잠깐 쉬는 중...');
    return;
  }
  tamaPet.lastPlayed=Date.now();
  tamaShowTrain();
}

// Sleep
function tamaSleep(){
  if(!tamaPet||tamaSleeping)return;
  tamaSleeping=true;
  const ovl=document.getElementById('tamaSleepOverlay');
  if(!ovl){tamaSleeping=false;return;}
  ovl.querySelector('.tama-sleep-sprite').textContent=tamaSprite();
  ovl.classList.add('active');

  let t=30;
  const tEl=ovl.querySelector('.tama-sleep-timer');
  tEl.textContent=t+'초 남음 · 탭하여 취소';

  if(tamaSleepInterval)clearInterval(tamaSleepInterval);
  tamaSleepInterval=setInterval(()=>{
    t--;
    tEl.textContent=t+'초 남음 · 탭하여 취소';
    if(t<=0){
      clearInterval(tamaSleepInterval);tamaSleepInterval=null;tamaSleeping=false;
      tamaPet.needs.energy=tamaClamp(tamaPet.needs.energy+40,0,100);
      ovl.classList.remove('active');
      tamaSpeech(tamaPick('sleep_after'));
      tamaVibrate([20,10,20]);
      tamaRenderNeeds();tamaRenderMood();tamaSave();
    }
  },1000);
}
function tamaCancelSleep(){
  if(!tamaSleeping)return;
  if(tamaSleepInterval){clearInterval(tamaSleepInterval);tamaSleepInterval=null;}
  tamaSleeping=false;
  const ovl=document.getElementById('tamaSleepOverlay');
  if(ovl)ovl.classList.remove('active');
}

// Train mini-game
function tamaShowTrain(){
  const ovl=document.getElementById('tamaTrainOverlay');if(!ovl)return;
  ovl.classList.add('active');
  let taps=0;const goal=10;
  const counter=ovl.querySelector('.tama-train-counter');
  const bar=ovl.querySelector('.tama-train-progress-bar');
  const target=ovl.querySelector('.tama-train-target');
  target.textContent=tamaSprite();
  counter.textContent='0 / '+goal;
  bar.style.width='0%';

  const onTap=()=>{
    taps++;tamaVibrate(15);
    counter.textContent=taps+' / '+goal;
    bar.style.width=(taps/goal*100)+'%';
    target.style.transform='scale(0.9)';
    setTimeout(()=>{target.style.transform='';},100);
    if(taps>=goal){
      target.removeEventListener('click',onTap);
      target.removeEventListener('touchstart',onTap);
      const mult=tamaWelcomeBackBonus?2:1;
      tamaPet.needs.happiness=tamaClamp(tamaPet.needs.happiness+25*mult,0,100);
      tamaWelcomeBackBonus=false;
      tamaAddExp(15);tamaAddAff(3);
      tamaPet.totalPlays++;
      tamaSpeech(tamaPick('play_after'));
      tamaVibrate([30,20,30]);
      tamaSave();tamaRenderNeeds();tamaRenderMood();tamaRenderAffinity();
      setTimeout(()=>ovl.classList.remove('active'),400);
    }
  };
  // Clone to remove old listeners
  const nw=target.cloneNode(true);
  target.parentNode.replaceChild(nw,target);
  nw.addEventListener('click',onTap);
}

// ── Evolution ──────────────────────────────────────────
function tamaEvoCondMet(){
  if(!tamaPet)return 0;
  let m=1; // level (always met if called)
  if((tamaPet.totalFeedings+tamaPet.totalBaths+tamaPet.totalPlays)>=30) m++;
  const n=tamaPet.needs;
  if(n.hunger>=50&&n.happiness>=50&&n.hygiene>=50&&n.energy>=50) m++;
  if(tamaPet.affinity>=50) m++;
  return m;
}
function tamaEvoCondText(){
  if(!tamaPet)return '';
  const total=tamaPet.totalFeedings+tamaPet.totalBaths+tamaPet.totalPlays;
  const n=tamaPet.needs;
  let lines=[];
  lines.push('✅ 레벨 조건 충족');
  lines.push((total>=30?'✅':'❌')+' 돌봄 횟수 '+total+'/30');
  const needOk=n.hunger>=50&&n.happiness>=50&&n.hygiene>=50&&n.energy>=50;
  lines.push((needOk?'✅':'❌')+' 모든 니즈 50% 이상');
  lines.push((tamaPet.affinity>=50?'✅':'❌')+' 호감도 50 이상 (현재: '+Math.floor(tamaPet.affinity)+')');
  return lines.join('\n');
}

function tamaShowEvo1(){
  if(!tamaPet||tamaPet.evolution1)return;
  const met=tamaEvoCondMet();
  if(met<3){tamaSpeech('진화 조건 부족... ('+met+'/4, 3 필요)',4000);return;}
  const ovl=document.getElementById('tamaEvolveOverlay');if(!ovl)return;
  let h='<div class="tama-overlay-header"><span class="tama-overlay-title">1차 진화!</span><span></span></div>';
  h+='<div style="text-align:center"><div class="tama-evolve-sprite">'+tamaSprite()+'</div>';
  h+='<div class="tama-evolve-title">진화 방향 선택</div>';
  h+='<div class="tama-evolve-desc">되돌릴 수 없습니다</div>';
  h+='<div class="tama-evolve-choices">';
  TAMA_EVO1_TYPES.forEach(e=>{
    h+='<div class="tama-evolve-choice" onclick="tamaSelectEvo1(\''+e.id+'\')">';
    h+='<span class="evo-emoji">'+e.emoji+'</span><span class="evo-name">'+e.name+'</span><span class="evo-desc">'+e.desc+'</span></div>';
  });
  h+='</div></div>';
  ovl.innerHTML=h;ovl.classList.add('active');
}
function tamaSelectEvo1(id){
  if(!tamaPet)return;
  const e=TAMA_EVO1_TYPES.find(x=>x.id===id);if(!e)return;
  tamaPet.evolution1=id;tamaPet.specType=e.name;
  if(e.stat==='all'){['dmg','def','spd','bomb'].forEach(k=>{tamaPet.stats[k]+=e.bonus;});}
  else tamaPet.stats[e.stat]+=e.bonus;
  tamaSpeech(tamaPick('evolve'),4000);
  tamaCloseOvl('tamaEvolveOverlay');
  tamaShowFlash('진화 완료!',e.name+' — '+e.desc);
  tamaVibrate([50,30,80]);
  tamaSave();tamaRenderHome();
}

function tamaShowEvo2(){
  if(!tamaPet||tamaPet.evolution2||!tamaPet.evolution1)return;
  const met=tamaEvoCondMet();
  if(met<3){tamaSpeech('2차 진화 조건 부족... ('+met+'/4)',4000);return;}
  const tier=tamaAffTier();
  let q=TAMA_EVO2_QUALITY[TAMA_EVO2_QUALITY.length-1];
  for(const x of TAMA_EVO2_QUALITY) if(tier.name===x.tier){q=x;break;}

  // Show confirmation overlay
  const ovl=document.getElementById('tamaEvolveOverlay');if(!ovl)return;
  let h='<div class="tama-overlay-header"><span class="tama-overlay-title">2차 진화!</span><span></span></div>';
  h+='<div style="text-align:center"><div class="tama-evolve-sprite">'+tamaSprite()+'</div>';
  h+='<div class="tama-evolve-title">'+q.suffix+' 등급 진화</div>';
  h+='<div class="tama-evolve-desc">호감도 "'+tier.name+'" 기반 · 전 스탯 +'+q.bonus+'</div>';
  h+='<button class="tama-btn" style="margin-top:20px" onclick="tamaConfirmEvo2()">진화하기!</button></div>';
  ovl.innerHTML=h;ovl.classList.add('active');
  ovl._evo2q=q;
}
function tamaConfirmEvo2(){
  const ovl=document.getElementById('tamaEvolveOverlay');
  const q=ovl&&ovl._evo2q;if(!q||!tamaPet)return;
  tamaPet.evolution2=q.suffix;
  ['dmg','def','spd','bomb'].forEach(k=>{tamaPet.stats[k]+=q.bonus;});
  tamaSpeech(tamaPick('evolve'),4000);
  tamaCloseOvl('tamaEvolveOverlay');
  tamaShowFlash('2차 진화! '+q.suffix,'전 스탯 +'+q.bonus);
  tamaVibrate([50,30,80]);
  tamaSave();tamaRenderHome();
}

// ── Stat Allocation ────────────────────────────────────
function tamaShowStats(){
  if(!tamaPet||tamaPet.statPoints<=0){
    if(typeof showToast==='function')showToast('배분할 포인트가 없습니다');return;
  }
  const ovl=document.getElementById('tamaStatOverlay');if(!ovl)return;
  tamaRenderStatOvl();ovl.classList.add('active');
}
function tamaRenderStatOvl(){
  const ovl=document.getElementById('tamaStatOverlay');if(!ovl||!tamaPet)return;
  const stats=[
    {k:'dmg',i:'⚔️',n:'데미지'},{k:'def',i:'🛡️',n:'방어'},
    {k:'spd',i:'💨',n:'속도'},{k:'bomb',i:'💣',n:'폭탄범위'}
  ];
  let h='<div class="tama-overlay-header"><span class="tama-overlay-title">스탯 배분</span><button class="tama-overlay-close" onclick="tamaCloseOvl(\'tamaStatOverlay\')">✕</button></div>';
  h+='<div class="tama-stat-alloc"><div class="tama-stat-alloc-header"><span class="tama-stat-points-badge">남은 포인트: '+tamaPet.statPoints+'P</span></div>';
  stats.forEach(s=>{
    h+='<div class="tama-stat-row"><span class="stat-icon">'+s.i+'</span>';
    h+='<div class="stat-info"><div class="stat-name">'+s.n+'</div><div class="stat-val">'+tamaPet.stats[s.k]+'</div></div>';
    h+='<button class="stat-add-btn" onclick="tamaAllocStat(\''+s.k+'\')" '+(tamaPet.statPoints<=0?'disabled':'')+'>+1</button></div>';
  });
  h+='</div>';
  ovl.innerHTML=h;
}
function tamaAllocStat(k){
  if(!tamaPet||tamaPet.statPoints<=0)return;
  tamaPet.stats[k]++;tamaPet.statPoints--;
  tamaVibrate(15);
  tamaSave();tamaRenderStatOvl();tamaRenderStats();tamaRenderLevel();
  if(tamaPet.statPoints<=0) setTimeout(()=>tamaCloseOvl('tamaStatOverlay'),300);
}

function tamaCloseOvl(id){
  const el=document.getElementById(id);if(el)el.classList.remove('active');
}

// ── Render ─────────────────────────────────────────────
function tamaRenderHome(){
  if(!tamaPet)return;
  const ne=_td.tamaPetNameLabel;if(ne)ne.textContent=tamaPet.name;
  const ge=_td.tamaGoldValue;if(ge)ge.textContent=tamaGetGold().toLocaleString();
  const pe=_td.tamaPersonalityLabel;if(pe)pe.textContent=TAMA_PERSONALITY_NAMES[tamaPet.personality]||'';
  const ae=_td.tamaPetAge;if(ae)ae.textContent=tamaPetAge();
  tamaRenderLevel();tamaRenderSprite();tamaRenderNeeds();tamaRenderMood();
  tamaRenderAffinity();tamaRenderStats();tamaRenderBathCD();
}

function tamaRenderLevel(){
  if(!tamaPet)return;
  const b=_td.tamaLevelBadge;if(b)b.textContent='Lv.'+tamaPet.level;
  const f=_td.tamaExpFill;
  if(f){const r=tamaExpReq(tamaPet.level);f.style.width=Math.min(100,tamaPet.exp/r*100)+'%';}
  const t=_td.tamaExpText;
  if(t)t.textContent=tamaPet.exp+'/'+tamaExpReq(tamaPet.level);
  const s=_td.tamaStageLabel;
  if(s){
    let l=TAMA_STAGES[tamaStageIdx()].name;
    if(tamaPet.specType)l+=' · '+tamaPet.specType;
    if(tamaPet.evolution2)l+=' '+tamaPet.evolution2;
    s.textContent=l;
  }
}

function tamaRenderSprite(){
  if(!tamaPet||tamaAnimLock)return;
  const el=_td.tamaSpriteMain;if(!el)return;
  el.textContent=tamaSprite();
  el.className='tama-sprite idle-bounce tribe-'+tamaPet.tribe;
}

function tamaRenderNeeds(){
  if(!tamaPet)return;
  ['hunger','happiness','hygiene','energy'].forEach(k=>{
    const f=_td['need_'+k],v=_td['needVal_'+k];if(!f)return;
    const val=Math.round(tamaPet.needs[k]);
    f.style.width=val+'%';
    f.className='tama-need-fill '+(val>=60?'high':val>=30?'mid':'low');
    if(v)v.textContent=val;
  });
}

function tamaRenderMood(){
  if(!tamaPet)return;
  const el=_td.tamaMoodDisplay;if(!el)return;
  const m=tamaMoodInfo();el.textContent=m.emoji+' '+m.label;
}

function tamaRenderAffinity(){
  if(!tamaPet)return;
  const tier=tamaAffTier();
  const f=_td.tamaAffinityFill;
  if(f){
    const next=tamaAffNext(),cur=tier.min;
    f.style.width=Math.min(100,(tamaPet.affinity-cur)/(next-cur)*100)+'%';
  }
  const l=_td.tamaAffinityLabel;if(l)l.textContent=tier.emoji+' 호감도';
  const t=_td.tamaAffinityTierLabel;if(t)t.textContent=tier.name;
  const v=_td.tamaAffinityVal;if(v)v.textContent=Math.floor(tamaPet.affinity);
}

function tamaRenderStats(){
  if(!tamaPet)return;
  const c=_td.tamaStatsRow;if(!c)return;
  const d=[{k:'dmg',i:'⚔️',l:'DMG'},{k:'def',i:'🛡️',l:'DEF'},{k:'spd',i:'💨',l:'SPD'},{k:'bomb',i:'💣',l:'BOM'}];
  c.innerHTML=d.map(s=>'<div class="tama-stat-chip"><span>'+s.i+'</span><span>'+s.l+'</span><span class="val">'+tamaPet.stats[s.k]+'</span></div>').join('');
  const sp=_td.tamaStatAllocBtn;
  if(sp){
    if(tamaPet.statPoints>0){sp.style.display='';sp.querySelector('.label').textContent='SP: '+tamaPet.statPoints;sp.classList.add('pulse');}
    else{sp.style.display='none';sp.classList.remove('pulse');}
  }
}

function tamaRenderBathCD(){
  const btn=_td.tamaBathBtn||document.getElementById('tamaBathBtn');if(!btn||!tamaPet)return;
  const cd=5*60*1000;
  const cdEl=btn.querySelector('.cooldown');
  if(tamaPet.lastBathed&&Date.now()-tamaPet.lastBathed<cd){
    const sec=Math.ceil((cd-(Date.now()-tamaPet.lastBathed))/1000);
    if(cdEl)cdEl.textContent=sec>=60?Math.ceil(sec/60)+'분':sec+'초';
    btn.disabled=true;
  }else{
    if(cdEl)cdEl.textContent='';
    btn.disabled=false;
  }
}

// ── FTUE ───────────────────────────────────────────────
function tamaShowFTUE(){
  tamaSelectedTribe=null;tamaEggTaps=0;
  // Clear previous selection UI state
  document.querySelectorAll('.tama-tribe-btn').forEach(b=>b.classList.remove('selected'));
  const cb=document.getElementById('tamaTribeConfirm');if(cb)cb.disabled=true;
  const crack=document.getElementById('tamaEggCrack');if(crack){crack.classList.remove('visible');crack.textContent='';}
  const bar=document.getElementById('tamaEggProgressBar');if(bar)bar.style.width='0%';
  tamaShowScreen('tamaTribeSelect');
}

function tamaShowScreen(id){
  document.querySelectorAll('#tamagotchiGame .tama-ftue-screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('#tamagotchiGame .tama-home').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('#tamagotchiGame .tama-overlay').forEach(s=>s.classList.remove('active'));
  // Also hide hatch flash
  const hf=document.getElementById('tamaHatchFlash');if(hf)hf.classList.remove('active');
  const el=document.getElementById(id);if(el)el.classList.add('active');
}

function tamaSelectTribe(tribe){
  tamaSelectedTribe=tribe;
  document.querySelectorAll('.tama-tribe-btn').forEach(b=>b.classList.remove('selected'));
  const btn=document.querySelector('.tama-tribe-btn[data-tribe="'+tribe+'"]');
  if(btn)btn.classList.add('selected');
  const cb=document.getElementById('tamaTribeConfirm');if(cb)cb.disabled=false;
  tamaVibrate(15);
}

function tamaConfirmTribe(){
  if(!tamaSelectedTribe)return;
  tamaEggTaps=0;
  const es=document.getElementById('tamaEggHatch');
  if(es){const egg=es.querySelector('.tama-egg');if(egg)egg.textContent='🥚';}
  const bar=document.getElementById('tamaEggProgressBar');if(bar)bar.style.width='0%';
  const crack=document.getElementById('tamaEggCrack');if(crack){crack.classList.remove('visible');crack.textContent='';}
  tamaShowScreen('tamaEggHatch');
}

function tamaTapEgg(){
  if(tamaEggTaps>=3)return;
  tamaEggTaps++;tamaVibrate(40);
  const egg=document.querySelector('#tamaEggHatch .tama-egg');
  if(egg){egg.classList.remove('shake');void egg.offsetWidth;egg.classList.add('shake');}
  const bar=document.getElementById('tamaEggProgressBar');
  if(bar)bar.style.width=(tamaEggTaps/3*100)+'%';
  const crack=document.getElementById('tamaEggCrack');
  if(crack){crack.textContent=['💥','💥💥','💥💥💥'][tamaEggTaps-1]||'';crack.classList.add('visible');}
  if(tamaEggTaps>=3) setTimeout(tamaHatch,400);
}

function tamaHatch(){
  const flash=document.getElementById('tamaHatchFlash');if(!flash)return;
  const baby=TAMA_SPRITE_MAP[tamaSelectedTribe][1];
  flash.querySelector('.tama-hatch-baby').textContent=baby;
  // Reset animation by removing and re-adding active
  flash.classList.remove('active');void flash.offsetWidth;
  flash.classList.add('active');
  tamaVibrate([50,30,80,30,50]);

  setTimeout(()=>{
    flash.classList.remove('active');
    const np=document.getElementById('tamaNamePreview');if(np)np.textContent=baby;
    const ni=document.getElementById('tamaNameInput');
    if(ni)ni.value={fire:'불꽃이',rock:'돌돌이',wind:'바람이',thunder:'번개',spirit:'요정이'}[tamaSelectedTribe]||'다마';
    tamaShowScreen('tamaNameScreen');
  },1800);
}

function tamaConfirmName(){
  const inp=document.getElementById('tamaNameInput');
  const name=(inp&&inp.value.trim())||'다마';
  tamaCreatePet(tamaSelectedTribe,name.substring(0,8));
  const tp=document.getElementById('tamaFtueFeedPet');if(tp)tp.textContent=tamaSprite();
  tamaShowScreen('tamaFtueFeed');
}

function tamaFtueFirstFeed(){
  if(!tamaPet)return;
  tamaPet.needs.hunger=100;tamaPet.totalFeedings++;tamaPet.ftueComplete=true;
  tamaSave();tamaShowHome();
}

// ── Entry Points ───────────────────────────────────────
function startTamagotchi(){
  showScreen('tamagotchiGame');
  tamaCacheDom();

  if(tamaLoad()){
    const elapsed=tamaProcessOffline();
    const msg=tamaOfflineMsg(elapsed);
    tamaShowHome();
    if(msg){
      tamaWelcomeBackBonus=true;
      setTimeout(()=>{
        const ovl=document.getElementById('tamaOfflineOverlay');if(!ovl)return;
        ovl.querySelector('.offline-msg').textContent=msg;
        const h=Math.round(elapsed/3600);
        ovl.querySelector('.offline-icon').textContent=h>=24?'😢':h>=4?'😟':'😊';
        ovl.querySelector('.offline-bonus').textContent='💝 웰컴 백! 다음 돌봄 효과 2배!';
        ovl.classList.add('active');
      },300);
    }
  }else{
    tamaShowFTUE();
  }
}

function tamaShowHome(){
  document.querySelectorAll('#tamagotchiGame .tama-ftue-screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('#tamagotchiGame .tama-overlay').forEach(s=>s.classList.remove('active'));
  const hf=document.getElementById('tamaHatchFlash');if(hf)hf.classList.remove('active');
  const home=_td.tamaHomeScreen||document.getElementById('tamaHomeScreen');
  if(home)home.classList.add('active');
  tamaRenderHome();
  tamaStartTick();
  tamaStartIdle();
  setTimeout(()=>tamaRandomSpeech(),1500);
}

function tamaCleanup(){
  tamaStopTick();
  if(tamaPet)tamaSave();
}

function tamaGoBack(){
  tamaCleanup();
  showScreen('mainMenu');
  tamaUpdateMenuBtn();
}

// Feed overlay
function tamaOpenFeed(){
  const ovl=document.getElementById('tamaFeedOverlay');if(!ovl||!tamaPet)return;
  tamaFeedCat='all';
  tamaRenderFoodGrid();
  ovl.classList.add('active');
}
function tamaSetFoodCat(cat){
  tamaFeedCat=cat;
  document.querySelectorAll('.tama-food-tab').forEach(t=>t.classList.toggle('active',t.dataset.cat===cat));
  tamaRenderFoodGrid();
}
function tamaRenderFoodGrid(){
  const grid=document.querySelector('#tamaFeedOverlay .tama-food-grid');if(!grid||!tamaPet)return;
  const gold=tamaGetGold();
  const foods=tamaFeedCat==='all'?TAMA_FOODS:TAMA_FOODS.filter(f=>f.cat===tamaFeedCat);
  grid.innerHTML=foods.map(f=>{
    const cost=tamaFoodCost(f,tamaPet.level);
    const ok=gold>=cost;
    return '<div class="tama-food-item'+(ok?'':' disabled')+'" onclick="tamaFeedAndClose(\''+f.id+'\')" title="포만+'+f.hunger+' 행복+'+f.happy+' EXP+'+f.exp+'">'+
      '<span class="tama-food-emoji">'+f.emoji+'</span>'+
      '<span class="tama-food-name">'+f.name+'</span>'+
      '<span class="tama-food-info">포만+'+f.hunger+' 행복+'+f.happy+'</span>'+
      '<span class="tama-food-cost">🪙 '+cost.toLocaleString()+'</span></div>';
  }).join('');
}

// Info panel
function tamaShowInfo(){
  const ovl=document.getElementById('tamaInfoOverlay');if(!ovl||!tamaPet)return;
  const t=TAMA_TRIBES[tamaPet.tribe];
  let h='<div class="tama-overlay-header"><span class="tama-overlay-title">펫 정보</span><button class="tama-overlay-close" onclick="tamaCloseOvl(\'tamaInfoOverlay\')">✕</button></div>';
  h+='<div class="tama-info-body">';
  h+='<div class="tama-info-sprite">'+tamaSprite()+'</div>';
  h+='<div class="tama-info-name">'+tamaPet.name+'</div>';
  h+='<div class="tama-info-row">종족: '+(t?t.emoji+' '+t.name:'?')+'</div>';
  h+='<div class="tama-info-row">성격: '+TAMA_PERSONALITY_NAMES[tamaPet.personality]+'</div>';
  h+='<div class="tama-info-row">나이: '+tamaPetAge()+'</div>';
  h+='<div class="tama-info-row">레벨: Lv.'+tamaPet.level+' (EXP '+tamaPet.exp+'/'+tamaExpReq(tamaPet.level)+')</div>';
  h+='<div class="tama-info-row">스탯: ⚔️'+tamaPet.stats.dmg+' 🛡️'+tamaPet.stats.def+' 💨'+tamaPet.stats.spd+' 💣'+tamaPet.stats.bomb+'</div>';
  h+='<div class="tama-info-row">호감도: '+tamaAffTier().emoji+' '+tamaAffTier().name+' ('+Math.floor(tamaPet.affinity)+')</div>';
  if(tamaPet.specType) h+='<div class="tama-info-row">1차 진화: '+tamaPet.specType+'</div>';
  if(tamaPet.evolution2) h+='<div class="tama-info-row">2차 진화: '+tamaPet.evolution2+'</div>';
  h+='<div class="tama-info-row">돌봄: 먹이 '+tamaPet.totalFeedings+'회 · 목욕 '+tamaPet.totalBaths+'회 · 놀기 '+tamaPet.totalPlays+'회</div>';
  // Evo conditions
  if(!tamaPet.evolution1&&tamaPet.level>=10){
    h+='<div class="tama-info-section">진화 조건 (Lv.15)</div>';
    h+='<pre class="tama-info-evo">'+tamaEvoCondText()+'</pre>';
  }
  h+='</div>';
  h+='<div style="text-align:center;margin-top:16px"><button class="tama-reset-btn" onclick="tamaConfirmReset()">펫 초기화</button></div>';
  ovl.innerHTML=h;ovl.classList.add('active');
}

function tamaDismissOffline(){
  const ovl=document.getElementById('tamaOfflineOverlay');if(ovl)ovl.classList.remove('active');
}

function tamaConfirmReset(){
  if(confirm('정말 펫을 초기화하시겠습니까? 모든 데이터가 삭제됩니다.')){
    tamaCleanup();tamaReset();startTamagotchi();
  }
}

function tamaQuickAccess(){
  if(typeof state!=='undefined'){
    if(!state.myId)state.myId='solo-tama';
    if(!state.myName)state.myName='플레이어';
    if(!state.players||state.players.length===0)
      state.players=[{id:state.myId,name:state.myName,avatar:state.myAvatar||'😎'}];
    state.isHost=true;
  }
  startTamagotchi();
}

// ── Menu Button ────────────────────────────────────────
function tamaUpdateMenuBtn(){
  const btn=document.getElementById('tamaMenuBtn');if(!btn)return;
  try{
    const raw=localStorage.getItem(TAMA_STORAGE_KEY);
    if(raw){
      const p=JSON.parse(raw);
      const sp=TAMA_SPRITE_MAP[p.tribe]?TAMA_SPRITE_MAP[p.tribe][tamaStageIdx(p)]:'🥚';
      btn.innerHTML='<span class="tama-menu-preview">'+sp+'</span> '+(p.name||'내 다마고치')+' (Lv.'+p.level+')';
    }else btn.innerHTML='🥚 내 다마고치 키우기';
  }catch(e){btn.innerHTML='🥚 내 다마고치 키우기';}
}

// ── Lifecycle ──────────────────────────────────────────
window.addEventListener('beforeunload',()=>{if(tamaPet)tamaSave();});
document.addEventListener('DOMContentLoaded',()=>{tamaUpdateMenuBtn();});
// Visibility change: save when tab hidden, process offline when visible
document.addEventListener('visibilitychange',()=>{
  if(!tamaPet)return;
  if(document.hidden){tamaSave();}
  else{
    tamaProcessOffline();
    tamaRenderHome();
  }
});
