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
  assert.deepEqual(cleanSettings({ size: 1000, position: { x: null, y: 'NaN' } }), { size: 1.25, position: null, spontaneous: true, follow: true, top: true });
  assert.equal(cleanSettings({ size: 0.8, follow: false }).follow, false);
});
