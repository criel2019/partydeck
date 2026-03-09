// ===== FORTRESS — Performance Profiler (GamePerf 기반) =====
// 기존 FortPerf.* API 유지, 내부는 GamePerf 공통 모듈 사용
// 제거 시 이 파일 + 각 파일의 FortPerf.begin/end 호출만 삭제

const FortPerf = (() => {
  if (typeof GamePerf === 'undefined') {
    // GamePerf 미로드 시 no-op 스텁
    const noop = () => {};
    return { enabled: false, frameStart: noop, frameEnd: noop, begin: noop, end: noop,
             once: (_, fn) => fn(), save: noop, history: () => [], reset: noop, show: noop, hide: noop };
  }
  const _inst = GamePerf.create({
    name: 'fortress',
    reportEvery: 60,
    warnMs: 2,
    console: true,
    extra: () => ({
      canvas: (typeof FORT_CANVAS_W !== 'undefined' ? FORT_CANVAS_W : '?') +
              'x' +
              (typeof FORT_CANVAS_H !== 'undefined' ? FORT_CANVAS_H : '?'),
    }),
  });

  return {
    get enabled()  { return _inst.enabled; },
    set enabled(v) { _inst.enabled = v; },
    frameStart()   { _inst.frameStart(); },
    frameEnd()     { _inst.frameEnd(); },
    begin(label)   { _inst.begin(label); },
    end(label)     { _inst.end(label); },
    once(label, fn){ return _inst.once(label, fn); },
    save()         { return _inst.save(); },
    history()      { return _inst.history(); },
    reset()        { _inst.reset(); },
    show()         { _inst.show(); },
    hide()         { _inst.hide(); },
  };
})();
