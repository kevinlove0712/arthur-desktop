const { test } = require('node:test');
const assert = require('node:assert/strict');
const { states, frameAt, lookDirection, clampBounds, cleanSettings } = require('../model.js');

test('16 gaze directions use screen coordinates, up=0 and clockwise', () => {
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    assert.equal(lookDirection(Math.sin(angle) * 200, -Math.cos(angle) * 200), i);
  }
  assert.equal(lookDirection(-0.01, -100), 0);
});
test('all states loop without entering unused atlas cells', () => {
  const counts = [6, 8, 8, 4, 5, 8, 6, 6, 6];
  for (const [state, spec] of Object.entries(states)) {
    let elapsed = 0;
    for (let frame = 0; frame < counts[spec.row]; frame++) {
      assert.equal(frameAt(state, elapsed), frame);
      assert.equal(frameAt(state, elapsed + spec.times[frame] - 1), frame);
      elapsed += spec.times[frame];
    }
    assert.equal(frameAt(state, elapsed), 0);
  }
});
test('offscreen positions recover, including negative-coordinate displays', () => {
  assert.deepEqual(clampBounds({ x: 9000, y: -6000, width: 240, height: 260 }, { x: -1920, y: -100, width: 1920, height: 1080 }), { x: -240, y: -100, width: 240, height: 260 });
  assert.equal(clampBounds({ x: -20, y: 500, width: 240, height: 260 }, { x: 0, y: 0, width: 100, height: 100 }).y, 0);
});
test('corrupt settings cannot create huge or invisible windows', () => {
  assert.deepEqual(cleanSettings({ size: 1000, position: { x: null, y: 'NaN' } }), cleanSettings());
  assert.equal(cleanSettings({ size: 0.8, follow: false }).follow, false);
});

const { jitter, walkingArea, walkTarget, hourlyDue, hourKey } = require('../model.js');
test('100 percent preserves the original standard size and old sizes migrate', () => {
  assert.equal(cleanSettings().sizePercent, 100);
  assert.equal(cleanSettings({ size: 1.5 }).sizePercent, 120);
  assert.equal(cleanSettings({ sizePercent: 150 }).size, 1.875);
  assert.equal(cleanSettings(null).sizePercent, 100);
  assert.equal(cleanSettings({ actionSeconds: -1, walkSeconds: Infinity }).walkSeconds, 120);
});
test('interval jitter reaches exactly plus or minus 20 percent', () => {
  assert.equal(jitter(30, () => 0), 24000);
  assert.ok(Math.abs(jitter(30, () => 1) - 36000) < 1e-8);
  assert.equal(jitter(120, () => .5), 120000);
});
test('walk destinations stay inside selected grid and work area on negative-coordinate screens', () => {
  const area = { x: -1920, y: -100, width: 1920, height: 1080 };
  const pet = { x: -500, y: 500, width: 240, height: 260 };
  for (const region of ['all', 'bottom', ...Array.from({ length: 9 }, (_, i) => String(i))]) {
    const zone = walkingArea(area, region);
    for (const random of [0, .25, .5, .99, 1]) {
      const to = walkTarget(pet, area, region, () => random);
      assert.ok(to.x >= zone.x && to.y >= zone.y);
      assert.ok(to.x + pet.width <= zone.x + zone.width + 1);
      assert.ok(to.y + pet.height <= zone.y + zone.height + 1);
    }
  }
  const small = { x: 0, y: 0, width: 500, height: 400 };
  const to = walkTarget(pet, small, '8', () => 1);
  assert.ok(to.x + pet.width <= 500 && to.y + pet.height <= 400);
});
test('hourly reminder fires once per boundary and skips missed hours', () => {
  const before = new Date(2026, 9, 28, 13, 59, 59);
  const now = new Date(2026, 9, 28, 14, 0, 0);
  assert.equal(hourlyDue(hourKey(before), now), true);
  assert.equal(hourlyDue(hourKey(now), new Date(2026, 9, 28, 14, 0, 5)), false);
  assert.equal(hourlyDue(hourKey(before), new Date(2026, 9, 28, 16, 12)), false);
  assert.equal(hourlyDue(hourKey(now), now), false);
  assert.equal(hourlyDue(hourKey(new Date(2026, 9, 28, 23, 59)), new Date(2026, 9, 29, 0, 0)), true);
});
