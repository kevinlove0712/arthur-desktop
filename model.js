(function (root) {
  const states = {
    idle: { row: 0, times: [280, 110, 110, 140, 140, 320], label: '安静陪你' },
    'running-right': { row: 1, times: [120, 120, 120, 120, 120, 120, 120, 120], label: '向右走' },
    'running-left': { row: 2, times: [120, 120, 120, 120, 120, 120, 120, 120], label: '向左走' },
    waving: { row: 3, times: [140, 140, 140, 280], label: '打个招呼' },
    jumping: { row: 4, times: [140, 140, 140, 140, 280], label: '跳一下' },
    failed: { row: 5, times: [160, 160, 160, 160, 650, 650, 160, 260], label: '看看胖背影' },
    waiting: { row: 6, times: [150, 150, 150, 150, 150, 260], label: '等你摸摸' },
    running: { row: 7, times: [120, 120, 120, 120, 120, 220], label: '认真忙碌' },
    review: { row: 8, times: [150, 150, 150, 150, 150, 280], label: '四处看看' }
  };

  function frameAt(state, elapsed) {
    const spec = states[state];
    const duration = spec.times.reduce((a, b) => a + b, 0);
    let remaining = Math.max(0, elapsed) % duration;
    for (let i = 0; i < spec.times.length; i++) {
      if (remaining < spec.times[i]) return i;
      remaining -= spec.times[i];
    }
    return 0;
  }

  function lookDirection(dx, dy) {
    return Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 / 22.5) % 16;
  }

  function clampBounds(bounds, area) {
    return {
      x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + Math.max(0, area.width - bounds.width)))),
      y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + Math.max(0, area.height - bounds.height)))),
      width: bounds.width,
      height: bounds.height
    };
  }

  function cleanSettings(value = {}) {
    const sizes = [0.8, 1, 1.25, 1.5];
    return {
      size: sizes.includes(value.size) ? value.size : 1.25,
      spontaneous: value.spontaneous !== false,
      follow: value.follow !== false,
      top: value.top !== false,
      position: value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y)
        ? { x: Math.round(value.position.x), y: Math.round(value.position.y) } : null
    };
  }

  const api = { states, frameAt, lookDirection, clampBounds, cleanSettings };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ArthurModel = api;
})(globalThis);
