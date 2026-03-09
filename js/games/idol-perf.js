// ===== 아이돌 게임 퍼포먼스 프로파일러 (GamePerf 기반) =====
// GamePerf 공통 모듈 사용 — monkey-patch + DOM 감시 + rAF FPS 측정
// index.html에서 idol.js, idol-board-iso.js 뒤에 로드

(function () {
  'use strict';

  // ── 래핑 대상 함수 목록 ──
  const WRAP_TARGETS = [
    // 보드 렌더링 (idol-board-iso.js)
    'idolRenderIsoBoard', 'idolIsoUpdateCellHighlights',
    '_idolIsoSetStepHL', 'idolIsoGetCellCenter',
    '_isoDefsHTML', '_isoCenterHTML', '_isoCreateCellGroup',
    '_idolUpdateCenterPanelPos',
    // 메인 엔진 (idol.js)
    'idolRenderAll', 'idolRenderHeader', 'idolRenderBoard',
    'idolRenderResourceBar', 'idolRenderCenterPanel',
    'idolRenderCenterHTML', 'idolRenderActionPanel',
    'idolSyncTokenLayer', 'idolAnimateMoveToken',
    'idolShowSelectPhase', 'idolShowEndings', 'idolShowEvolution',
    'idolRollDice', 'idolMovePlayer', 'idolProcessCell',
    'idolShowDiceOverlay', 'idolBgSet',
    // 카메라
    'idolCamInitGestures', 'idolCamFollowPos', 'idolCamFollow',
    'idolCamReset', '_idolCamFlush', '_idolCamTick',
    // 서브 패널
    'idolRenderDicePanel', 'idolRenderShopBuyPanel',
    'idolRenderShopUpgradePanel', 'idolRenderTrainPanel',
    'idolRenderTrainResult', 'idolRenderEventPanel',
    'idolRenderGachaPanel', 'idolRenderGachaResult',
    'idolRenderChancePanel', 'idolRenderSettlementPanel',
    'idolRenderBankruptPanel', 'idolRenderEndingPanel',
    'idolRenderTakeoverPanel', 'idolShowCellResult',
    // 기타
    'broadcastIdolState', 'idolStartPractice',
  ];

  // ── GamePerf 인스턴스 생성 ──
  const _inst = GamePerf.create({
    name: 'idol',
    reportEvery: 60,
    warnMs: 3,
    console: true,
    wrapFns: WRAP_TARGETS,
    watchDOM: true,
  });

  // ── rAF 자동 프레임 측정 (아이돌 화면 활성 시에만) ──
  let _rafId = null;

  function _isIdolActive() {
    const el = document.getElementById('idolGame');
    return el && el.classList.contains('active');
  }

  function _rafLoop() {
    if (_isIdolActive()) {
      _inst.frameEnd();
      _inst.frameStart();
    }
    _rafId = requestAnimationFrame(_rafLoop);
  }

  // 화면 전환 감시: 아이돌 진입 시 UI 표시, 이탈 시 숨김
  let _wasActive = false;
  setInterval(() => {
    const active = _isIdolActive();
    if (active && !_wasActive) {
      _inst.show();
      if (!_rafId) {
        _inst.frameStart();
        _rafId = requestAnimationFrame(_rafLoop);
      }
    } else if (!active && _wasActive) {
      _inst.hide();
    }
    _wasActive = active;
  }, 300);

  // ── 글로벌 API (하위호환) ──
  window.idolPerf = {
    download: () => _inst.save(),
    report:   () => _inst._buildSummary(),
    reset:    () => _inst.reset(),
    show:     () => _inst.show(),
    hide:     () => _inst.hide(),
  };

  console.log('[idolPerf] GamePerf 기반 프로파일러 준비 완료');

})();
