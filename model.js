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
    if (!value || typeof value !== 'object') value = {};
    const number = (input, fallback, min, max) => typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max ? Math.round(input) : fallback;
    const sizePercent = number(value.sizePercent, number(value.size * 80, 100, 50, 200), 50, 200);
    return {
      sizePercent,
      size: sizePercent / 80,
      spontaneous: value.spontaneous !== false,
      actionSeconds: number(value.actionSeconds, 30, 5, 86400),
      walking: value.walking !== false,
      walkSeconds: number(value.walkSeconds, 120, 10, 86400),
      walkRegion: ['all', 'bottom', ...Array.from({ length: 9 }, (_, i) => String(i))].includes(value.walkRegion) ? value.walkRegion : 'bottom',
      hourly: value.hourly !== false,
      follow: value.follow !== false,
      top: value.top !== false,
      position: value.position && Number.isFinite(value.position.x) && Number.isFinite(value.position.y)
        ? { x: Math.round(value.position.x), y: Math.round(value.position.y) } : null
    };
  }

  function jitter(seconds, random = Math.random) { return seconds * (0.8 + random() * 0.4) * 1000; }

  function walkingArea(area, region) {
    if (region === 'all') return { ...area };
    if (region === 'bottom') return { ...area, y: area.y + area.height * 2 / 3, height: area.height / 3 };
    const cell = Number(region);
    return { x: area.x + (cell % 3) * area.width / 3, y: area.y + Math.floor(cell / 3) * area.height / 3, width: area.width / 3, height: area.height / 3 };
  }

  function walkTarget(bounds, area, region, random = Math.random) {
    const zone = walkingArea(area, region);
    // Keep the entire pet in the work area even when a grid cell is smaller than it.
    return clampBounds({ ...bounds,
      x: zone.x + random() * Math.max(0, zone.width - bounds.width),
      y: zone.y + random() * Math.max(0, zone.height - bounds.height)
    }, area);
  }

  function hourKey(date) {
    return [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()].join('-');
  }

  function hourlyDue(previous, date) {
    // Do not replay missed hours after sleep, or announce immediately on launch.
    return previous !== hourKey(date) && date.getMinutes() === 0;
  }

  const api = { states, frameAt, lookDirection, clampBounds, cleanSettings, jitter, walkingArea, walkTarget, hourKey, hourlyDue };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ArthurModel = api;
})(globalThis);
