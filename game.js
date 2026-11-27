'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - light blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#ffd700', // 9 - pieza power-up (dorado)
  '#f5f5f5', // 10 - comodín (blanco)
  '#f06292', // 11 - pentominó + (rosa)
  '#4db6ac', // 12 - pentominó U (verde azulado)
  '#aed581', // 13 - pentominó Y (lima)
  '#fff176', // 14 - single 1×1 (amarillo claro)
  '#78909c', // 15 - basura / bloques fijos de desafío
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (centro vacío)
  null,                                        // 9 - reservado: bloque power-up
  null,                                        // 10 - reservado: comodín
  [[0,11,0],[11,11,11],[0,11,0]],             // + (pentominó)
  [[12,0,12],[12,12,12],[0,0,0]],             // U (pentominó)
  [[0,13,0,0],[13,13,13,13],[0,0,0,0],[0,0,0,0]], // Y (pentominó)
  [[14]],                                      // single 1×1 (recompensa tras un Tetris)
];

const STANDARD_COUNT = 8;        // tipos 1–8 (7 clásicas + tuerca)
const PENTOS = [11, 12, 13];
const PENTO_CHANCE = 0.12;       // probabilidad de que salga un pentominó
const SINGLE = 14;
const GARBAGE = 15;
const T_TYPE = 3;

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [400, 800, 1200, 1600];
const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
const PERFECT_CLEAR_BONUS = 2000;

// Power-ups: cada POWER_EVERY líneas la siguiente pieza es un bloque especial de 1×1
const POWER_EVERY = 5;
const FREEZE_MS = 5000;
const POWER_BLOCK = 9;
const WILD = 10; // comodín: cuenta como lleno y, al limpiarse una línea con él, se van todos los comodines
const POWERS = { bomb: '💣', lightning: '⚡', tint: '🎨', gravity: '⬇️', freeze: '❄️' };
const POWER_TYPES = Object.keys(POWERS);

// Cola de piezas, energía y habilidades
const QUEUE_SIZE = 6;
const ENERGY_MAX = 100;
const ENERGY_PER_LINE = 15;
const SLOW_MS = 10000;
const SLOW_FACTOR = 0.4;
const PEEK_MS = 15000;
const REVEAL_MS = 700;           // modo invisible: tiempo que se ve el tablero tras asentar una pieza

const SKILLS = [
  { id: 'peek', name: 'Ver las siguientes 5 piezas' },
  { id: 'swap', name: 'Cambiar la pieza actual por otra' },
  { id: 'slow', name: 'Ralentizar el tiempo 10 s' },
  { id: 'undo', name: 'Deshacer la última colocación' },
  { id: 'hold', name: 'Hold extra (reservar otra vez)' },
];

// Modos de juego: clásico + desafíos con objetivos
const MODES = {
  classic:   { },
  sprint:    { goalLines: 40, timeLimit: 120000 },
  garbage:   { surviveMs: 90000, garbageEvery: 10000 },
  fixed:     { goalLines: 12, prefill: 6 },
  invisible: { goalLines: 10, invisible: true },
  reverse:   { goalLines: 15, startLevel: 8, reverseRotation: true },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const peekCanvas = document.getElementById('peek-canvas');
const peekCtx = peekCanvas.getContext('2d');
const peekSection = document.getElementById('peek-section');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const objectiveEl = document.getElementById('objective');
const modeSelect = document.getElementById('mode-select');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skillMenu = document.getElementById('skill-menu');
const skillList = document.getElementById('skill-list');

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let board, current, next, queue, held, holdLocked, score, lines, level, startLevel, paused, gameOver;
let lastTime, dropAccum, dropInterval, animId, pendingPower, pendingSingle, freezeLeft, slowLeft, peekLeft;
let combo, b2b, lastRotate, energy, skillMenuOpen, undoState, elapsed, garbageTimer, revealUntil;
let mode = MODES.classic;
let popups = [];
let flash = null;
let muted = false;
let audioCtx = null;

/* ---------------- Sonido ---------------- */

function beep(freq, dur = 0.12, type = 'square', vol = 0.05, delay = 0) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* audio no disponible */ }
}

function arpeggio(freqs, type = 'square', step = 0.07) {
  freqs.forEach((f, i) => beep(f, 0.14, type, 0.05, i * step));
}

/* ---------------- Efectos visuales ---------------- */

function popup(text, color) {
  popups.push({ text, color, born: performance.now(), life: 1500 });
}

function flashScreen(color) {
  flash = { color, until: performance.now() + 250 };
}

/* ---------------- Piezas y cola ---------------- */

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type, power) {
  if (power) return { type: POWER_BLOCK, power, shape: [[POWER_BLOCK]], x: Math.floor(COLS / 2), y: 0 };
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

const freshPiece = p => makePiece(p.type, p.power);

// useFlags: solo en spawn(); consume las recompensas pendientes (power-up / single)
function randomPiece(useFlags = false) {
  if (useFlags && pendingPower) {
    pendingPower = false;
    return makePiece(POWER_BLOCK, POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)]);
  }
  let type;
  if (useFlags && pendingSingle) {
    pendingSingle = false;
    type = SINGLE;
  } else if (Math.random() < PENTO_CHANCE) {
    type = PENTOS[Math.floor(Math.random() * PENTOS.length)];
  } else {
    type = Math.floor(Math.random() * STANDARD_COUNT) + 1;
  }
  return makePiece(type);
}

function fillQueue() {
  while (queue.length < QUEUE_SIZE) queue.push(randomPiece());
}

/* ---------------- Mecánica base ---------------- */

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  // Modo "rotación inversa": el giro es antihorario
  const rotated = mode.reverseRotation
    ? rotateCW(rotateCW(rotateCW(current.shape)))
    : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastRotate = true;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// T-spin (regla de las 3 esquinas): pieza T, último movimiento fue un giro
function isTSpin() {
  if (current.type !== T_TYPE || !lastRotate) return false;
  const cx = current.x + 1, cy = current.y + 1;
  let corners = 0;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) corners++;
  }
  return corners >= 3;
}

function compactBoard() {
  for (let c = 0; c < COLS; c++) {
    let w = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const v = board[r][c];
        board[r][c] = 0;
        board[w][c] = v;
        w--;
      }
    }
  }
}

function applyPower(p) {
  const { x, y } = p;
  let destroyed = 0;
  const clearCell = (cx, cy) => {
    if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && board[cy][cx]) {
      board[cy][cx] = 0;
      destroyed++;
    }
  };
  switch (p.power) {
    case 'bomb':
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) clearCell(x + dx, y + dy);
      break;
    case 'lightning':
      if (Math.random() < 0.5) for (let c = 0; c < COLS; c++) clearCell(c, y);
      else for (let r = 0; r < ROWS; r++) clearCell(x, r);
      break;
    case 'tint': {
      const below = y + 1 < ROWS ? board[y + 1][x] : 0;
      let color = below > 0 && below !== WILD ? below : 0;
      if (!color) {
        const present = [...new Set(board.flat().filter(v => v > 0 && v !== WILD))];
        color = present[Math.floor(Math.random() * present.length)] || 0;
      }
      if (color) board.forEach(row => row.forEach((v, i) => { if (v === color) row[i] = WILD; }));
      break;
    }
    case 'gravity':
      compactBoard();
      break;
    case 'freeze':
      freezeLeft = FREEZE_MS;
      break;
  }
  score += destroyed * 10;
  popup(`${POWERS[p.power]} ${p.power.toUpperCase()}`, '#ffd700');
  arpeggio([660, 880, 1100], 'triangle', 0.05);
  updateHUD();
}

function addEnergy(amount) {
  const was = energy;
  energy = Math.min(ENERGY_MAX, energy + amount);
  if (was < ENERGY_MAX && energy >= ENERGY_MAX) {
    popup('HABILIDAD LISTA (E)', '#4fc3f7');
    beep(988, 0.2, 'sine', 0.06);
  }
}

function clearLines(tspin) {
  let cleared = 0;
  let wildCleared = false;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      if (board[r].includes(WILD)) wildCleared = true;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }

  if (cleared) {
    if (wildCleared) board.forEach(row => row.forEach((v, i) => { if (v === WILD) row[i] = 0; }));
    if (cleared === 4) pendingSingle = true;
    if (Math.floor((lines + cleared) / POWER_EVERY) > Math.floor(lines / POWER_EVERY)) pendingPower = true;

    // Combo: turnos consecutivos limpiando líneas → x1, x2, x3...
    combo++;
    const difficult = cleared === 4 || tspin;
    let pts = (tspin ? TSPIN_SCORES[cleared] : LINE_SCORES[cleared]) * level * combo;
    const labels = [];
    if (tspin) labels.push(`T-SPIN ${LINE_NAMES[cleared] || 'x' + cleared}`);
    else if (cleared === 4) labels.push('TETRIS!');
    if (difficult) {
      if (b2b) { pts = Math.floor(pts * 1.5); labels.push('BACK-TO-BACK x1.5'); }
      b2b = true;
    } else {
      b2b = false;
    }
    if (combo >= 2) labels.push(`COMBO x${combo}`);

    lines += cleared;
    level = Math.floor(lines / 10) + startLevel;
    dropInterval = speedFor(level);

    const perfect = board.every(row => row.every(v => v === 0));
    if (perfect) {
      pts += PERFECT_CLEAR_BONUS * level;
      labels.push('PERFECT CLEAR!');
    }
    score += pts;
    addEnergy(cleared * ENERGY_PER_LINE);

    // Efectos
    labels.forEach(l => popup(l, perfect ? '#ffd700' : tspin ? '#ba68c8' : combo >= 2 ? '#ff8a65' : '#fff'));
    if (perfect) { flashScreen('#ffd700'); arpeggio([523, 659, 784, 1047, 1319], 'triangle'); }
    else if (difficult) { flashScreen('#ffffff'); arpeggio([392, 523, 659, 784], 'triangle'); }
    else {
      const up = Math.pow(1.0595, Math.min(combo, 12));
      arpeggio([523, 659, 784, 1047].slice(0, Math.max(2, cleared)).map(f => f * up));
    }
  } else {
    combo = 0;
    if (tspin) {
      score += TSPIN_SCORES[0] * level;
      popup('T-SPIN', '#ba68c8');
      beep(392, 0.15, 'triangle', 0.06);
    }
  }
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  if (gy > current.y) lastRotate = false;
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastRotate = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function saveUndo() {
  undoState = {
    board: board.map(r => [...r]),
    piece: freshPiece(current),
    score, lines, level, dropInterval, combo, b2b, pendingPower, pendingSingle,
  };
}

function checkGoal() {
  if (mode.goalLines && lines >= mode.goalLines) {
    winGame();
    return true;
  }
  return false;
}

function lockPiece() {
  saveUndo();
  const tspin = isTSpin();
  if (current.power) applyPower(current);
  else merge();
  clearLines(tspin);
  revealUntil = performance.now() + REVEAL_MS;
  if (checkGoal()) return;
  spawn();
}

function spawn() {
  current = queue.shift();
  if (pendingPower || pendingSingle) queue[0] = randomPiece(true);
  fillQueue();
  next = queue[0];
  holdLocked = false;
  lastRotate = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

/* ---------------- Hold ---------------- */

function holdPiece() {
  if (holdLocked) return;
  const saved = freshPiece(current);
  if (held) {
    current = held;
    held = saved;
    lastRotate = false;
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    held = saved;
    spawn();
  }
  holdLocked = true;
  beep(300, 0.08, 'sine', 0.06);
  drawNext();
}

/* ---------------- Habilidades ---------------- */

function openSkillMenu() {
  if (energy < ENERGY_MAX || skillMenuOpen || paused || gameOver) return;
  skillMenuOpen = true;
  cancelAnimationFrame(animId);
  skillMenu.classList.remove('hidden');
}

function closeSkillMenu() {
  skillMenuOpen = false;
  skillMenu.classList.add('hidden');
  lastTime = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function runSkill(id) {
  switch (id) {
    case 'peek':
      peekLeft = PEEK_MS;
      return true;
    case 'swap': {
      const p = makePiece(Math.floor(Math.random() * STANDARD_COUNT) + 1);
      p.y = current.y;
      if (collide(p.shape, p.x, p.y)) return false;
      current = p;
      lastRotate = false;
      return true;
    }
    case 'slow':
      slowLeft = SLOW_MS;
      return true;
    case 'undo': {
      if (!undoState) return false;
      const u = undoState;
      undoState = null;
      queue.unshift(current);
      board = u.board;
      current = u.piece;
      ({ score, lines, level, dropInterval, combo, b2b, pendingPower, pendingSingle } = u);
      next = queue[0];
      holdLocked = false;
      lastRotate = false;
      return true;
    }
    case 'hold':
      if (!holdLocked) return false;
      holdLocked = false;
      return true;
  }
  return false;
}

function chooseSkill(skill) {
  if (runSkill(skill.id)) {
    energy = 0;
    popup(skill.name.toUpperCase(), '#4fc3f7');
    arpeggio([330, 440, 660], 'sawtooth', 0.06);
  } else {
    popup('NO DISPONIBLE', '#e57373');
  }
  updateHUD();
  drawNext();
  closeSkillMenu();
}

/* ---------------- Modos de desafío ---------------- */

const speedFor = lv => Math.max(100, 1000 - (lv - 1) * 90);

function prefillBoard(rows) {
  for (let r = ROWS - rows; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) board[r][c] = Math.random() < 0.65 ? GARBAGE : 0;
    if (board[r].every(v => v)) board[r][Math.floor(Math.random() * COLS)] = 0;
  }
}

function addGarbage() {
  if (board[0].some(v => v)) { endGame(); return; }
  board.shift();
  const hole = Math.floor(Math.random() * COLS);
  board.push(Array.from({ length: COLS }, (_, c) => (c === hole ? 0 : GARBAGE)));
  while (collide(current.shape, current.x, current.y) && current.y > -4) current.y--;
  if (collide(current.shape, current.x, current.y)) { endGame(); return; }
  beep(110, 0.15, 'sawtooth', 0.06);
}

const fmtTime = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function updateObjective() {
  let text = 'Modo clásico';
  if (mode.timeLimit) text = `${lines}/${mode.goalLines} líneas · ${fmtTime(mode.timeLimit - elapsed)}`;
  else if (mode.surviveMs) text = `Sobrevive ${fmtTime(mode.surviveMs - elapsed)} · basura en ${fmtTime(mode.garbageEvery - garbageTimer)}`;
  else if (mode.goalLines) text = `${lines}/${mode.goalLines} líneas`;
  if (mode.invisible) text += ' · piezas invisibles';
  if (mode.reverseRotation) text += ' · giro inverso';
  if (objectiveEl.textContent !== text) objectiveEl.textContent = text;
}

/* ---------------- HUD y dibujo ---------------- */

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo >= 2 ? `x${combo}${b2b ? ' · B2B' : ''}` : (b2b ? 'B2B listo' : '—');
  energyFill.style.width = `${(energy / ENERGY_MAX) * 100}%`;
  energyFill.classList.toggle('ready', energy >= ENERGY_MAX);
  energyHint.textContent = energy >= ENERGY_MAX ? 'LISTA · pulsa E' : `${energy}/${ENERGY_MAX}`;
  updateObjective();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = cssVar('--block-highlight');
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
  if (colorIndex === WILD) drawGlyph(context, x, y, size, '★');
}

function drawGlyph(context, x, y, size, glyph) {
  context.save();
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#555';
  context.fillText(glyph, x * size + size / 2, y * size + size / 2 + 1);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = cssVar('--grid');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function drawEffects(now) {
  if (flash && now < flash.until) {
    ctx.globalAlpha = ((flash.until - now) / 250) * 0.4;
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
  popups = popups.filter(p => now - p.born < p.life);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px sans-serif';
  popups.forEach((p, i) => {
    const t = (now - p.born) / p.life;
    ctx.globalAlpha = 1 - t * t;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillStyle = p.color;
    const y = 200 + i * 28 - t * 40;
    ctx.strokeText(p.text, canvas.width / 2, y);
    ctx.fillText(p.text, canvas.width / 2, y);
  });
  ctx.restore();
}

function draw() {
  const now = performance.now();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board (en modo invisible solo se ve un instante tras asentar una pieza)
  if (!mode.invisible || now < revealUntil)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.power) drawGlyph(ctx, current.x, current.y, BLOCK, POWERS[current.power]);

  if (freezeLeft > 0) {
    ctx.fillStyle = 'rgba(129, 212, 250, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText(`❄️ ${Math.ceil(freezeLeft / 1000)}s`, canvas.width / 2, 24);
    ctx.restore();
  }
  if (slowLeft > 0) {
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ba68c8';
    ctx.fillText(`⏳ ${Math.ceil(slowLeft / 1000)}s`, canvas.width / 2, freezeLeft > 0 ? 44 : 24);
    ctx.restore();
  }

  drawEffects(now);
}

// Dibuja una pieza centrada en una caja de boxCells×boxCells celdas, desplazada (ox, oy) px
function drawPiecePreview(context, piece, size, ox, oy, boxCells) {
  const shape = piece.shape;
  const offX = Math.floor((boxCells - shape[0].length) / 2);
  const offY = Math.floor((boxCells - shape.length) / 2);
  context.save();
  context.translate(ox, oy);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], size);
  if (piece.power) drawGlyph(context, offX, offY, size, POWERS[piece.power]);
  context.restore();
}

// Repinta los paneles laterales: siguiente, hold y (si está activo) las próximas 5
function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawPiecePreview(nextCtx, next, 30, 0, 0, 4);

  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (held) drawPiecePreview(holdCtx, held, 30, 0, 0, 4);
  holdCanvas.classList.toggle('locked', holdLocked);

  peekSection.classList.toggle('hidden', peekLeft <= 0);
  peekCtx.clearRect(0, 0, peekCanvas.width, peekCanvas.height);
  if (peekLeft > 0)
    queue.slice(0, 5).forEach((p, i) => drawPiecePreview(peekCtx, p, 15, 30, i * 60, 4));
}

function endGame(title = 'GAME OVER', win = false) {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = title;
  overlayTitle.classList.toggle('win', win);
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  if (win) arpeggio([523, 659, 784, 1047, 1319], 'triangle', 0.1);
  else arpeggio([392, 330, 262, 196], 'sawtooth', 0.12);
}

function winGame() {
  endGame('¡DESAFÍO COMPLETADO!', true);
}

function togglePause() {
  if (gameOver || skillMenuOpen) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayTitle.classList.remove('win');
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = Math.min(ts - lastTime, 250);
  lastTime = ts;
  elapsed += dt;

  // temporizadores de efectos
  if (peekLeft > 0) {
    peekLeft = Math.max(0, peekLeft - dt);
    if (peekLeft === 0) drawNext();
  }
  if (freezeLeft > 0) {
    freezeLeft = Math.max(0, freezeLeft - dt);
    dropAccum = 0;
  } else if (slowLeft > 0) {
    dropAccum += dt * SLOW_FACTOR;
  } else {
    dropAccum += dt;
  }
  if (slowLeft > 0) slowLeft = Math.max(0, slowLeft - dt);

  // reglas de los desafíos
  if (mode.timeLimit && elapsed >= mode.timeLimit) { endGame('TIEMPO AGOTADO'); return; }
  if (mode.surviveMs && elapsed >= mode.surviveMs) { winGame(); return; }
  if (mode.garbageEvery) {
    garbageTimer += dt;
    if (garbageTimer >= mode.garbageEvery) {
      garbageTimer = 0;
      addGarbage();
      if (gameOver) return;
    }
  }

  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      lastRotate = false;
    } else {
      lockPiece();
    }
  }
  draw();
  if (mode.timeLimit || mode.surviveMs) updateObjective();
  // endGame() pudo ejecutarse dentro de lockPiece: no reprogramar el loop
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  mode = MODES[modeSelect.value] || MODES.classic;
  startLevel = mode.startLevel || 1;
  board = createBoard();
  if (mode.prefill) prefillBoard(mode.prefill);
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  skillMenuOpen = false;
  skillMenu.classList.add('hidden');
  dropInterval = speedFor(level);
  dropAccum = 0;
  pendingPower = false;
  pendingSingle = false;
  freezeLeft = 0;
  slowLeft = 0;
  peekLeft = 0;
  combo = 0;
  b2b = false;
  lastRotate = false;
  energy = 0;
  held = null;
  holdLocked = false;
  undoState = null;
  elapsed = 0;
  garbageTimer = 0;
  popups = [];
  flash = null;
  lastTime = performance.now();
  revealUntil = lastTime + REVEAL_MS;
  queue = [];
  fillQueue();
  next = queue[0];
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (skillMenuOpen) {
    if (e.code === 'Escape' || e.code === 'KeyE') closeSkillMenu();
    else {
      const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
      if (m) chooseSkill(SKILLS[m[1] - 1]);
    }
    return;
  }
  if (e.code === 'KeyM') { muted = !muted; return; }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastRotate = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
    case 'KeyE':
      openSkillMenu();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  if (!gameOver) updateHUD();
});

restartBtn.addEventListener('click', () => {
  restartBtn.blur(); // evita que Space reactive el botón
  init();
});

modeSelect.addEventListener('change', () => {
  modeSelect.blur(); // evita que las flechas cambien el modo en mitad de la partida
  init();
});

SKILLS.forEach((s, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<kbd>${i + 1}</kbd> ${s.name}`;
  li.addEventListener('click', () => chooseSkill(s));
  skillList.appendChild(li);
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (e) { /* almacenamiento no disponible */ }
  themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
  // El loop está cancelado en pausa/game over: repintar manualmente
  draw();
  drawNext();
}

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space active el botón
});

init();
setTheme(document.documentElement.dataset.theme);
