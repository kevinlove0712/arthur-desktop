const { states, frameAt, lookDirection } = window.ArthurModel;
const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d');
const atlas = new Image();
atlas.src = 'assets/arthur.png';
const mask = document.createElement('canvas');
mask.width = 192; mask.height = 208;
const maskContext = mask.getContext('2d', { willReadFrequently: true });
let pixels, current = 'idle', started = performance.now(), until = 0, dragging = null;
let pointer = { x: -10000, y: -10000 }, settings = { follow: true, spontaneous: true };
let lastCell = '', pointerDown = null, clickTimer;
let nextAction = performance.now() + 18000;

function play(state) {
  if (!states[state]) return;
  current = state; started = performance.now();
  until = state === 'idle' ? 0 : started + states[state].times.reduce((a, b) => a + b, 0) * (state === 'running' ? 3 : 1);
  nextAction = started + 18000 + Math.random() * 18000;
}

function hit(point) {
  const x = Math.floor(point.x), y = Math.floor(point.y);
  return !!pixels && x >= 0 && x < 192 && y >= 0 && y < 208 && pixels[(y * 192 + x) * 4 + 3] > 35;
}

function draw(row, col) {
  const key = `${row}:${col}`;
  if (key === lastCell) return;
  lastCell = key;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(atlas, col * 192, row * 208, 192, 208, 0, 0, canvas.width, canvas.height);
  maskContext.clearRect(0, 0, 192, 208);
  maskContext.drawImage(atlas, col * 192, row * 208, 192, 208, 0, 0, 192, 208);
  pixels = maskContext.getImageData(0, 0, 192, 208).data;
  canvas.dataset.cell = key;
}

function tick() {
  const now = performance.now();
  if (until && now >= until) { current = 'idle'; started = now; until = 0; }
  if (!pointerDown && !dragging && !until && settings.spontaneous && now > nextAction) {
    const options = ['waving', 'waiting', 'review', 'running', 'failed'];
    play(options[Math.floor(Math.random() * options.length)]);
  }
  const dx = pointer.x - 96, dy = pointer.y - 65;
  let state = dragging || current;
  if (!dragging && !until && settings.follow && !pointerDown && Math.hypot(dx, dy) < 380 && Math.hypot(dx, dy) > 65 && !hit(pointer)) {
    const direction = lookDirection(dx, dy);
    draw(9 + Math.floor(direction / 8), direction % 8);
    state = 'look';
  } else draw(states[state].row, frameAt(state, now - started));
  canvas.dataset.state = state;
  const interactive = !!pointerDown || hit(pointer);
  window.arthur.hit(interactive);
}

window.arthur.onSettings(value => { settings = value; });
window.arthur.onAction(play);
window.arthur.onPointer(value => { pointer = value; });
window.arthur.onDrag(value => {
  const wasDragging = dragging;
  if (value !== dragging) started = performance.now();
  dragging = value;
  if (!value) { pointerDown = null; if (wasDragging) play('idle'); }
});
window.addEventListener('blur', () => { pointerDown = null; window.arthur.dragEnd(); });
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointerDown = { x: event.screenX, y: event.screenY };
  canvas.setPointerCapture(event.pointerId);
  window.arthur.dragStart(pointerDown);
});
canvas.addEventListener('pointermove', event => {
  const bounds = canvas.getBoundingClientRect();
  pointer = { x: event.clientX / bounds.width * 192, y: event.clientY / bounds.height * 208 };
  window.arthur.hit(!!pointerDown || hit(pointer));
  if (pointerDown) window.arthur.dragMove({ x: event.screenX, y: event.screenY });
});
// Electron forwards mousemove (rather than pointermove) through an ignored window.
window.addEventListener('mousemove', event => {
  if (pointerDown) return;
  const bounds = canvas.getBoundingClientRect();
  pointer = { x: event.clientX / bounds.width * 192, y: event.clientY / bounds.height * 208 };
  window.arthur.hit(hit(pointer));
});
canvas.addEventListener('pointerup', event => {
  if (event.button !== 0 || !pointerDown) return;
  const moved = Math.hypot(event.screenX - pointerDown.x, event.screenY - pointerDown.y) > 4;
  pointerDown = null;
  window.arthur.dragEnd();
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!moved) {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => play('jumping'), 220);
  }
});
canvas.addEventListener('pointercancel', () => { pointerDown = null; window.arthur.dragEnd(); });
canvas.addEventListener('dblclick', () => { clearTimeout(clickTimer); play('waving'); });
canvas.addEventListener('contextmenu', event => { event.preventDefault(); window.arthur.menu(); });
atlas.onload = () => { tick(); setInterval(tick, 40); window.arthur.ready(); };
atlas.onerror = () => { canvas.setAttribute('aria-label', '图片加载失败，请重新解压完整的亚瑟应用。'); };
