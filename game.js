/* Path to the Chuppah — a wedding-themed maze game.
 * 100% client-side, vanilla JavaScript + HTML5 canvas. No assets, no network. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants & helpers
  // ---------------------------------------------------------------------------
  const T = 32;                 // logical tile size (canvas units)
  const MAX_LIVES = 3;
  const RING_BONUS = 500;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BEST_KEY = 'chuppahMazeBest';
  const SETUP_KEY = 'chuppahMazeSetup';

  const COLORS = {
    floorA: '#fffaf3',
    floorB: '#fcefec',
    wallTop: '#f4cdd5',
    wallFace: '#e2a6b4',
    gold: '#c9a24b',
    goldLight: '#e8cf8f',
    rose: '#d8798c',
    roseDark: '#b4566b',
    p2: '#6f9fb8',
    ink: '#5a3f47',
    confetti: ['#f4b6c2', '#e8cf8f', '#ffffff', '#c9a24b', '#cfe3d0', '#d8c3e8', '#f7dfe3']
  };
  const GUEST_OUTFITS = ['#a7c4e5', '#c9b3e3', '#f2c18d', '#9fcfb3', '#e89aa8', '#8fb8b0', '#d6a1c9'];
  const SKINS = ['#f6d3c0', '#e8b896', '#c98f6b', '#8d5a3f', '#f1c7a8'];
  const HAIRS = ['#3b2a24', '#7a4b3a', '#c99a5b', '#1f1a1c', '#a35a3c', '#d9d0c7'];

  // Character looks used to build each couple
  const LOOKS = {
    brideVeil: { type: 'woman', skin: '#f6d3c0', hair: '#7a4b3a', dress: '#ffffff', head: 'veil', flowers: [COLORS.rose, '#f4b6c2', '#ffffff'] },
    brideCrown: { type: 'woman', skin: '#c98f6b', hair: '#2b1d18', dress: '#fff6ea', head: 'crown', flowers: ['#c9b3e3', '#ffffff', '#e8cf8f'] },
    groomBlack: { type: 'man', skin: '#e8b896', hair: '#3b2a24', suit: '#3d3540', trousers: '#2e2830', tie: '#1f1a1c', flower: COLORS.rose },
    groomNavy: { type: 'man', skin: '#f1c7a8', hair: '#a35a3c', suit: '#34405e', trousers: '#283149', tie: '#c9a24b', flower: '#f4b6c2' },
    groomIvory: { type: 'man', skin: '#8d5a3f', hair: '#1f1a1c', suit: '#ebe3d4', trousers: '#cfc4b1', tie: '#b4566b', flower: '#9fbf95' }
  };

  const COUPLES = {
    mw: { label: 'Woman & Man', a: LOOKS.brideVeil, b: LOOKS.groomBlack, names: ['the Bride', 'the Groom'] },
    ww: { label: 'Two Women', a: LOOKS.brideVeil, b: LOOKS.brideCrown, names: ['the Bride with the veil', 'the Bride with the flower crown'] },
    mm: { label: 'Two Men', a: LOOKS.groomNavy, b: LOOKS.groomIvory, names: ['the Groom in navy', 'the Groom in ivory'] }
  };

  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const center = (t) => (t + 0.5) * T;
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');
  const toastEl = $('toast');
  const mazeLayer = document.createElement('canvas');
  const screens = {
    start: $('screenStart'),
    couple: $('screenCouple'),
    mode: $('screenMode'),
    pause: $('screenPause'),
    win: $('screenWin'),
    lose: $('screenLose')
  };
  const hud = {
    level: $('hudLevel'),
    time: $('hudTime'),
    hearts: $('hudHearts'),
    ring: $('hudRing'),
    score: $('hudScore'),
    lives: $('hudLives')
  };

  // ---------------------------------------------------------------------------
  // Sound (synthesised with WebAudio — no audio files)
  // ---------------------------------------------------------------------------
  const Sound = {
    ac: null,
    muted: false,
    init() {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ac = new AC();
      }
      if (this.ac && this.ac.state === 'suspended') this.ac.resume();
    },
    tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, slide = 0 } = {}) {
      if (this.muted || !this.ac) return;
      const t0 = this.ac.currentTime + delay;
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },
    click() {
      this.tone(880, 0.06, { type: 'triangle', vol: 0.05 });
    },
    start() {
      this.tone(659.25, 0.15, { type: 'triangle' });
      this.tone(987.77, 0.3, { type: 'triangle', delay: 0.1 });
    },
    pickup() {
      this.tone(880, 0.1, { type: 'triangle', vol: 0.1 });
      this.tone(1318.5, 0.18, { type: 'triangle', vol: 0.1, delay: 0.06 });
    },
    ring() {
      [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) =>
        this.tone(f, 0.35, { type: 'sine', vol: 0.1, delay: i * 0.08 }));
    },
    hit() {
      this.tone(240, 0.35, { type: 'sawtooth', vol: 0.08, slide: 0.4 });
    },
    pop() {
      this.tone(700, 0.07, { type: 'square', vol: 0.03, slide: 0.5 });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        this.tone(f, 0.5, { type: 'triangle', vol: 0.12, delay: i * 0.13 }));
      this.tone(1318.5, 1.0, { type: 'sine', vol: 0.08, delay: 0.6 });
    },
    lose() {
      [392, 349.23, 311.13, 261.63].forEach((f, i) =>
        this.tone(f, 0.45, { type: 'triangle', vol: 0.1, delay: i * 0.18 }));
    }
  };

  // ---------------------------------------------------------------------------
  // Maze generation (recursive backtracker + light braiding for loops)
  // ---------------------------------------------------------------------------
  function generateMaze(n) {
    const size = 2 * n + 1;
    const grid = new Uint8Array(size * size).fill(1);
    const visited = new Uint8Array(n * n);
    const stack = [[0, 0]];
    visited[0] = 1;
    grid[size + 1] = 0;

    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const options = DIRS.filter(([dx, dy]) => {
        const nx = cx + dx;
        const ny = cy + dy;
        return nx >= 0 && ny >= 0 && nx < n && ny < n && !visited[ny * n + nx];
      });
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [dx, dy] = pick(options);
      const nx = cx + dx;
      const ny = cy + dy;
      visited[ny * n + nx] = 1;
      grid[(2 * cy + 1 + dy) * size + (2 * cx + 1 + dx)] = 0;
      grid[(2 * ny + 1) * size + (2 * nx + 1)] = 0;
      stack.push([nx, ny]);
    }

    // Knock out a few extra walls so there is more than one route
    // (gives the players room to dodge obstacles).
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!grid[y * size + x]) continue;
        const between = (x % 2 === 0 && y % 2 === 1) || (x % 2 === 1 && y % 2 === 0);
        if (between && Math.random() < 0.1) grid[y * size + x] = 0;
      }
    }

    // Open a 3x3 plaza at the exact centre for the chuppah.
    // n is always odd, so the centre tile is a cell and the plaza joins the maze.
    const mid = n;
    for (let y = mid - 1; y <= mid + 1; y++) {
      for (let x = mid - 1; x <= mid + 1; x++) grid[y * size + x] = 0;
    }

    return {
      size,
      grid,
      mid,
      isWall(tx, ty) {
        return tx < 0 || ty < 0 || tx >= size || ty >= size || grid[ty * size + tx] === 1;
      },
      inPlaza(tx, ty) {
        return Math.abs(tx - mid) <= 1 && Math.abs(ty - mid) <= 1;
      }
    };
  }

  function bfs(maze, from) {
    const { size } = maze;
    const d = new Int32Array(size * size).fill(-1);
    const prev = new Int32Array(size * size).fill(-1);
    const queue = [[from.x, from.y]];
    d[from.y * size + from.x] = 0;
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (maze.isWall(nx, ny) || d[ny * size + nx] !== -1) continue;
        d[ny * size + nx] = d[y * size + x] + 1;
        prev[ny * size + nx] = y * size + x;
        queue.push([nx, ny]);
      }
    }
    return { d, prev };
  }

  function pathTo(maze, search, to) {
    const { size } = maze;
    const path = [];
    let i = to.y * size + to.x;
    while (i !== -1) {
      path.unshift({ x: i % size, y: Math.floor(i / size) });
      i = search.prev[i];
    }
    return path;
  }

  function runLength(maze, tx, ty, dx, dy) {
    let n = 0;
    while (!maze.isWall(tx + dx * (n + 1), ty + dy * (n + 1))) n++;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Hazards (rings are no longer hazards — there is one collectable ring)
  // ---------------------------------------------------------------------------
  class Guest {
    constructor(tx, ty, diff) {
      this.kind = 'guest';
      this.tx = tx;
      this.ty = ty;
      this.x = center(tx);
      this.y = center(ty);
      this.r = T * 0.28;
      this.speed = T * 1.7 * diff * rand(0.85, 1.15);
      this.outfit = pick(GUEST_OUTFITS);
      this.skin = pick(SKINS);
      this.hair = pick(HAIRS);
      this.bob = rand(0, 6);
      this.pause = 0;
      this.dir = null;
      this.chooseNext();
    }
    chooseNext() {
      const m = game.maze;
      // Guests never wander under the chuppah — it is a safe zone.
      const open = DIRS.filter(([dx, dy]) =>
        !m.isWall(this.tx + dx, this.ty + dy) && !m.inPlaza(this.tx + dx, this.ty + dy));
      if (!open.length) {
        this.dir = [0, 0];
        this.pause = 0.5;
        return;
      }
      let choices = open;
      if (this.dir) {
        const forward = open.filter(([dx, dy]) => !(dx === -this.dir[0] && dy === -this.dir[1]));
        if (forward.length) choices = forward;
      }
      this.dir = pick(choices);
      // Guests are unpredictable: sometimes they stop to chat.
      if (Math.random() < 0.12) this.pause = rand(0.3, 1.1);
    }
    get harmful() { return true; }
    get hitR() { return this.r; }
    update(dt) {
      this.bob += dt * 9;
      if (this.pause > 0) {
        this.pause -= dt;
        if (this.pause <= 0 && this.dir[0] === 0 && this.dir[1] === 0) this.chooseNext();
        return;
      }
      const tx = center(this.tx + this.dir[0]);
      const ty = center(this.ty + this.dir[1]);
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= step) {
        this.x = tx;
        this.y = ty;
        this.tx += this.dir[0];
        this.ty += this.dir[1];
        this.chooseNext();
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
    }
    draw(c) {
      const moving = this.pause <= 0;
      const bob = moving ? Math.sin(this.bob) * 1.2 : 0;
      const s = T * 0.9;
      c.save();
      c.translate(this.x, this.y + bob);
      shadow(c, 0, s * 0.4, s * 0.26);
      c.fillStyle = this.outfit;
      c.beginPath();
      c.moveTo(-s * 0.12, -s * 0.12);
      c.lineTo(-s * 0.26, s * 0.38);
      c.quadraticCurveTo(0, s * 0.45, s * 0.26, s * 0.38);
      c.lineTo(s * 0.12, -s * 0.12);
      c.closePath();
      c.fill();
      // champagne flute
      c.strokeStyle = '#d9c9a8';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(s * 0.26, s * 0.1);
      c.lineTo(s * 0.26, -s * 0.02);
      c.stroke();
      c.fillStyle = 'rgba(232, 207, 143, 0.9)';
      c.beginPath();
      c.moveTo(s * 0.2, -s * 0.2);
      c.lineTo(s * 0.32, -s * 0.2);
      c.lineTo(s * 0.26, -s * 0.02);
      c.closePath();
      c.fill();
      c.fillStyle = this.skin;
      c.beginPath();
      c.arc(0, -s * 0.25, s * 0.14, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = this.hair;
      c.beginPath();
      c.arc(0, -s * 0.28, s * 0.145, Math.PI, Math.PI * 2);
      c.fill();
      eyes(c, 0, -s * 0.24, s);
      if (!moving) {
        c.fillStyle = COLORS.roseDark;
        c.font = `${Math.round(s * 0.35)}px serif`;
        c.textAlign = 'center';
        c.fillText('♪', s * 0.25, -s * 0.48);
      }
      c.restore();
    }
  }

  class Cork {
    constructor(tx, ty, dir, diff) {
      this.kind = 'cork';
      this.bx = center(tx) - dir[0] * T * 0.2;
      this.by = center(ty) - dir[1] * T * 0.2;
      this.dir = dir;
      this.diff = diff;
      this.x = this.bx;
      this.y = this.by;
      this.r = T * 0.15;
      this.speed = T * 6.5 * Math.sqrt(diff);
      this.state = 'wait';
      this.timer = rand(0.6, 2.4);
      this.angle = Math.atan2(dir[1], dir[0]);
      this.spin = 0;
    }
    get harmful() { return this.state === 'fly'; }
    get hitR() { return this.r; }
    update(dt) {
      if (this.state === 'wait') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'fly';
          this.x = this.bx + this.dir[0] * T * 0.25;
          this.y = this.by + this.dir[1] * T * 0.25;
          burst(this.x, this.y, 10, 'spark', ['#ffffff', COLORS.goldLight]);
          if (game.mode === 'play' && controlledChars().some((ch) => dist(this, ch) < T * 7)) Sound.pop();
        }
        return;
      }
      this.spin += dt * 14;
      this.x += this.dir[0] * this.speed * dt;
      this.y += this.dir[1] * this.speed * dt;
      if (Math.random() < 0.6) {
        particles.push({
          type: 'spark', x: this.x, y: this.y,
          vx: rand(-15, 15) - this.dir[0] * 20, vy: rand(-15, 15) - this.dir[1] * 20,
          life: 0, max: rand(0.25, 0.5), size: rand(1, 2.2), color: pick(['#ffffff', COLORS.goldLight])
        });
      }
      const lx = this.x + this.dir[0] * this.r;
      const ly = this.y + this.dir[1] * this.r;
      if (game.maze.isWall(Math.floor(lx / T), Math.floor(ly / T))) {
        burst(this.x, this.y, 6, 'spark', ['#c49a6c', COLORS.goldLight]);
        this.state = 'wait';
        this.timer = rand(1.3, 2.6) / Math.sqrt(this.diff);
        this.x = this.bx;
        this.y = this.by;
      }
    }
    draw(c) {
      const warn = this.state === 'wait' && this.timer < 0.6;
      const shake = warn ? Math.sin(performance.now() / 25) * 0.12 : 0;
      c.save();
      c.translate(this.bx, this.by);
      shadow(c, 0, T * 0.12, T * 0.2);
      c.rotate(this.angle + shake);
      c.fillStyle = '#4d7a5a';
      roundRect(c, -T * 0.3, -T * 0.12, T * 0.36, T * 0.24, T * 0.08);
      c.fill();
      c.fillRect(T * 0.04, -T * 0.06, T * 0.16, T * 0.12);
      c.fillStyle = COLORS.gold;
      c.fillRect(T * 0.1, -T * 0.07, T * 0.12, T * 0.14);
      c.fillStyle = '#f6efe2';
      c.fillRect(-T * 0.22, -T * 0.08, T * 0.14, T * 0.16);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(-T * 0.28, -T * 0.1, T * 0.3, T * 0.04);
      if (this.state === 'wait') {
        c.fillStyle = '#c49a6c';
        c.fillRect(T * 0.22, -T * 0.06, T * 0.08, T * 0.12);
      }
      c.restore();

      if (this.state === 'fly') {
        c.save();
        c.translate(this.x, this.y);
        c.rotate(this.angle + this.spin);
        c.fillStyle = '#c49a6c';
        roundRect(c, -T * 0.14, -T * 0.1, T * 0.28, T * 0.2, T * 0.05);
        c.fill();
        c.fillStyle = '#a87d52';
        c.fillRect(-T * 0.04, -T * 0.1, T * 0.03, T * 0.2);
        c.fillRect(T * 0.05, -T * 0.1, T * 0.03, T * 0.2);
        c.restore();
      }
    }
  }

  class Clock {
    constructor(tx, ty, diff) {
      this.kind = 'clock';
      this.x = center(tx);
      this.y = center(ty);
      this.period = rand(2.8, 3.6) / Math.sqrt(diff);
      this.phase = rand(0, this.period);
      this.ringDur = 1.0;
      this.warnDur = 0.8;
      this.hands = rand(0, Math.PI * 2);
    }
    get stage() {
      const p = this.phase;
      if (p > this.period - this.ringDur) return 'ring';
      if (p > this.period - this.ringDur - this.warnDur) return 'warn';
      return 'calm';
    }
    get harmful() { return this.stage === 'ring'; }
    get hitR() { return T * 0.42; }
    update(dt) {
      this.phase = (this.phase + dt) % this.period;
      this.hands += dt * (this.stage === 'calm' ? 1.5 : 9);
    }
    draw(c) {
      const st = this.stage;
      const r = T * 0.26;
      c.save();
      c.translate(this.x, this.y);
      if (st === 'ring') {
        const k = (this.phase - (this.period - this.ringDur)) / this.ringDur;
        for (let i = 0; i < 3; i++) {
          const w = (k * 2 + i / 3) % 1;
          c.strokeStyle = `rgba(216, 121, 140, ${0.55 * (1 - w)})`;
          c.lineWidth = 2;
          c.beginPath();
          c.arc(0, 0, r + w * T * 0.3, 0, Math.PI * 2);
          c.stroke();
        }
        c.fillStyle = 'rgba(216, 121, 140, 0.16)';
        c.beginPath();
        c.arc(0, 0, T * 0.42, 0, Math.PI * 2);
        c.fill();
      }
      shadow(c, 0, r + 2, r * 0.9);
      if (st !== 'calm') c.rotate(Math.sin(performance.now() / (st === 'ring' ? 18 : 40)) * 0.18);
      c.fillStyle = COLORS.gold;
      c.beginPath();
      c.arc(-r * 0.7, -r * 0.85, r * 0.38, Math.PI, Math.PI * 2);
      c.arc(r * 0.7, -r * 0.85, r * 0.38, Math.PI, Math.PI * 2);
      c.fill();
      c.fillStyle = COLORS.gold;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = st === 'ring' ? '#ffe9ee' : '#fffdf8';
      c.beginPath();
      c.arc(0, 0, r * 0.82, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = COLORS.ink;
      c.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.lineWidth = i % 3 === 0 ? 1.4 : 0.7;
        c.beginPath();
        c.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
        c.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74);
        c.stroke();
      }
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(this.hands / 12) * r * 0.4, Math.sin(this.hands / 12) * r * 0.4);
      c.moveTo(0, 0);
      c.lineTo(Math.cos(this.hands) * r * 0.62, Math.sin(this.hands) * r * 0.62);
      c.stroke();
      c.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------
  let particles = [];

  function burst(x, y, count, type, colors, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 140) * power;
      particles.push({
        type, x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (type === 'confetti' ? 80 * power : 0),
        life: 0,
        max: type === 'heart' ? rand(1.0, 1.8) : type === 'confetti' ? rand(1.6, 3) : rand(0.4, 0.8),
        size: type === 'heart' ? rand(6, 11) : type === 'confetti' ? rand(3, 6) : rand(1.5, 3),
        rot: rand(0, Math.PI * 2),
        vr: rand(-8, 8),
        color: pick(colors)
      });
    }
  }

  function confettiRain(count) {
    const W = game.maze.size * T;
    for (let i = 0; i < count; i++) {
      particles.push({
        type: 'confetti', x: rand(0, W), y: rand(-40, -5),
        vx: rand(-30, 30), vy: rand(20, 90),
        life: 0, max: rand(2.5, 4.5), size: rand(3, 6),
        rot: rand(0, Math.PI * 2), vr: rand(-8, 8), color: pick(COLORS.confetti)
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'confetti') {
        p.vy += 160 * dt;
        p.vx *= 0.985;
        p.vy = Math.min(p.vy, 110);
        p.rot += p.vr * dt;
        p.x += Math.sin(p.life * 5 + p.rot) * 0.4;
      } else if (p.type === 'heart') {
        p.vx *= 0.96;
        p.vy = p.vy * 0.96 - 30 * dt;
      } else {
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }
    particles = particles.filter((p) => p.life < p.max);
    if (particles.length > 700) particles.splice(0, particles.length - 700);
  }

  function drawParticles(c) {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      c.globalAlpha = Math.max(0, Math.min(1, a * 1.5));
      if (p.type === 'confetti') {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = p.color;
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * (0.4 + Math.abs(Math.cos(p.rot * 1.3))));
        c.restore();
      } else if (p.type === 'heart') {
        c.fillStyle = p.color;
        heartPath(c, p.x, p.y, p.size * (0.7 + 0.3 * Math.sin(p.life * 8)));
        c.fill();
      } else {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function heartPath(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s * 0.6, y - s * 0.05, x - s * 0.32, y - s * 0.6, x, y - s * 0.22);
    c.bezierCurveTo(x + s * 0.32, y - s * 0.6, x + s * 0.6, y - s * 0.05, x, y + s * 0.35);
    c.closePath();
  }

  function shadow(c, x, y, w) {
    c.fillStyle = 'rgba(90, 63, 71, 0.16)';
    c.beginPath();
    c.ellipse(x, y, w, w * 0.28, 0, 0, Math.PI * 2);
    c.fill();
  }

  function eyes(c, x, y, s) {
    c.fillStyle = COLORS.ink;
    c.beginPath();
    c.arc(x - s * 0.05, y, s * 0.018, 0, Math.PI * 2);
    c.arc(x + s * 0.05, y, s * 0.018, 0, Math.PI * 2);
    c.fill();
  }

  function cheeks(c, x, y, s) {
    c.fillStyle = 'rgba(232, 120, 140, 0.35)';
    c.beginPath();
    c.arc(x - s * 0.085, y + s * 0.04, s * 0.03, 0, Math.PI * 2);
    c.arc(x + s * 0.085, y + s * 0.04, s * 0.03, 0, Math.PI * 2);
    c.fill();
  }

  function flower(c, x, y, r, color, t = 0) {
    c.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + t * 0.2;
      c.beginPath();
      c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = COLORS.goldLight;
    c.beginPath();
    c.arc(x, y, r * 0.3, 0, Math.PI * 2);
    c.fill();
  }

  function drawWoman(c, x, y, look, { bob = 0, lean = 0, alpha = 1 } = {}) {
    const s = T * 1.05;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y + bob);
    shadow(c, 0, s * 0.4, s * 0.3);
    c.rotate(lean);
    if (look.head === 'veil') {
      c.fillStyle = 'rgba(255, 255, 255, 0.8)';
      c.strokeStyle = 'rgba(220, 200, 205, 0.8)';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(-s * 0.12, -s * 0.36);
      c.quadraticCurveTo(-s * 0.36, -s * 0.05, -s * 0.3, s * 0.22);
      c.lineTo(s * 0.3, s * 0.22);
      c.quadraticCurveTo(s * 0.36, -s * 0.05, s * 0.12, -s * 0.36);
      c.closePath();
      c.fill();
      c.stroke();
    } else {
      // long hair flowing behind the shoulders
      c.fillStyle = look.hair;
      c.beginPath();
      c.moveTo(-s * 0.13, -s * 0.34);
      c.quadraticCurveTo(-s * 0.22, -s * 0.12, -s * 0.16, -s * 0.02);
      c.lineTo(s * 0.16, -s * 0.02);
      c.quadraticCurveTo(s * 0.22, -s * 0.12, s * 0.13, -s * 0.34);
      c.closePath();
      c.fill();
    }
    // dress
    c.fillStyle = look.dress;
    c.strokeStyle = '#e6d2d6';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-s * 0.1, -s * 0.1);
    c.quadraticCurveTo(-s * 0.16, s * 0.15, -s * 0.34, s * 0.4);
    c.quadraticCurveTo(0, s * 0.48, s * 0.34, s * 0.4);
    c.quadraticCurveTo(s * 0.16, s * 0.15, s * 0.1, -s * 0.1);
    c.closePath();
    c.fill();
    c.stroke();
    roundRect(c, -s * 0.1, -s * 0.2, s * 0.2, s * 0.13, s * 0.04);
    c.fill();
    c.stroke();
    c.fillStyle = COLORS.goldLight;
    c.fillRect(-s * 0.105, -s * 0.09, s * 0.21, s * 0.03);
    // bouquet
    c.fillStyle = '#9fbf95';
    c.beginPath();
    c.moveTo(-s * 0.02, s * 0.02);
    c.lineTo(s * 0.02, s * 0.14);
    c.lineTo(s * 0.06, s * 0.02);
    c.fill();
    [[-0.04, -0.01, 0], [0.04, -0.02, 1], [0, -0.05, 2], [0.08, 0.02, 1]].forEach(([bx, by, ci]) => {
      c.fillStyle = look.flowers[ci];
      c.beginPath();
      c.arc(s * bx, s * by, s * 0.04, 0, Math.PI * 2);
      c.fill();
    });
    // head
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(0, -s * 0.3, s * 0.12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = look.hair;
    c.beginPath();
    c.arc(0, -s * 0.33, s * 0.125, Math.PI * 1.02, Math.PI * 1.98);
    c.fill();
    if (look.head === 'veil') {
      c.beginPath();
      c.arc(0, -s * 0.44, s * 0.06, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = COLORS.gold;
      c.beginPath();
      c.moveTo(-s * 0.08, -s * 0.41);
      c.lineTo(-s * 0.04, -s * 0.47);
      c.lineTo(0, -s * 0.42);
      c.lineTo(s * 0.04, -s * 0.47);
      c.lineTo(s * 0.08, -s * 0.41);
      c.closePath();
      c.fill();
    } else {
      // flower crown
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.1 + i * 0.2);
        c.fillStyle = look.flowers[i % look.flowers.length];
        c.beginPath();
        c.arc(Math.cos(a) * s * 0.12, -s * 0.33 + Math.sin(a) * s * 0.1, s * 0.035, 0, Math.PI * 2);
        c.fill();
      }
    }
    eyes(c, 0, -s * 0.29, s);
    cheeks(c, 0, -s * 0.29, s);
    c.restore();
  }

  function drawMan(c, x, y, look, { bob = 0, lean = 0, alpha = 1 } = {}) {
    const s = T * 1.05;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y + bob);
    shadow(c, 0, s * 0.4, s * 0.24);
    c.rotate(lean);
    c.fillStyle = look.trousers;
    c.fillRect(-s * 0.1, s * 0.15, s * 0.08, s * 0.25);
    c.fillRect(s * 0.02, s * 0.15, s * 0.08, s * 0.25);
    c.fillStyle = look.suit;
    c.strokeStyle = 'rgba(60, 40, 50, 0.25)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(-s * 0.15, -s * 0.18);
    c.lineTo(-s * 0.17, s * 0.2);
    c.lineTo(s * 0.17, s * 0.2);
    c.lineTo(s * 0.15, -s * 0.18);
    c.quadraticCurveTo(0, -s * 0.22, -s * 0.15, -s * 0.18);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(-s * 0.06, -s * 0.19);
    c.lineTo(0, s * 0.02);
    c.lineTo(s * 0.06, -s * 0.19);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = look.tie;
    c.beginPath();
    c.moveTo(0, -s * 0.15);
    c.lineTo(-s * 0.05, -s * 0.18);
    c.lineTo(-s * 0.05, -s * 0.12);
    c.closePath();
    c.moveTo(0, -s * 0.15);
    c.lineTo(s * 0.05, -s * 0.18);
    c.lineTo(s * 0.05, -s * 0.12);
    c.closePath();
    c.fill();
    c.fillStyle = look.flower;
    c.beginPath();
    c.arc(-s * 0.1, -s * 0.1, s * 0.03, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(0, -s * 0.3, s * 0.12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = look.hair;
    c.beginPath();
    c.arc(0, -s * 0.33, s * 0.125, Math.PI * 1.0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(0, -s * 0.44, s * 0.07, s * 0.03, 0, 0, Math.PI * 2);
    c.fill();
    eyes(c, 0, -s * 0.29, s);
    cheeks(c, 0, -s * 0.29, s);
    c.restore();
  }

  function drawPerson(c, x, y, look, opts) {
    if (look.type === 'woman') drawWoman(c, x, y, look, opts);
    else drawMan(c, x, y, look, opts);
  }

  function drawTag(c, x, y, text, color) {
    c.save();
    c.font = `bold ${Math.round(T * 0.3)}px Georgia, serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const w = c.measureText(text).width + T * 0.25;
    c.fillStyle = color;
    roundRect(c, x - w / 2, y - T * 0.2, w, T * 0.4, T * 0.2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillText(text, x, y + 0.5);
    c.restore();
  }

  function drawRingItem(c, x, y, r, spin) {
    const rx = r * Math.max(0.25, Math.abs(Math.cos(spin)));
    c.save();
    c.translate(x, y);
    c.lineWidth = T * 0.075;
    c.strokeStyle = COLORS.gold;
    c.beginPath();
    c.ellipse(0, 0, rx, r, 0, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = T * 0.025;
    c.strokeStyle = '#f6e3b0';
    c.beginPath();
    c.ellipse(0, 0, rx, r, 0, Math.PI * 1.1, Math.PI * 1.6);
    c.stroke();
    c.translate(0, -r - T * 0.06);
    c.rotate(Math.PI / 4);
    const d = T * 0.14;
    c.fillStyle = '#d7eef8';
    c.fillRect(-d / 2, -d / 2, d, d);
    c.fillStyle = '#ffffff';
    c.fillRect(-d / 2, -d / 2, d / 2.4, d / 2.4);
    c.restore();
  }

  function drawChuppah(c, x, y, t) {
    const w = T * 1.15;
    const top = y - T * 1.25;
    c.save();
    const g = c.createRadialGradient(x, y, 2, x, y, T * 1.8);
    g.addColorStop(0, 'rgba(255, 236, 200, 0.8)');
    g.addColorStop(1, 'rgba(255, 236, 200, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, T * 1.8, 0, Math.PI * 2);
    c.fill();
    // poles
    c.fillStyle = COLORS.gold;
    c.fillRect(x - w - 1.5, top, 3, T * 1.95);
    c.fillRect(x + w - 1.5, top, 3, T * 1.95);
    // draped fabric
    c.fillStyle = '#ffffff';
    c.strokeStyle = COLORS.goldLight;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x - w - 5, top);
    c.quadraticCurveTo(x, top - T * 0.38, x + w + 5, top);
    const scallops = 7;
    for (let i = scallops; i > 0; i--) {
      const x0 = x - w - 5 + (i / scallops) * (2 * w + 10);
      const x1 = x - w - 5 + ((i - 1) / scallops) * (2 * w + 10);
      c.quadraticCurveTo((x0 + x1) / 2, top + T * 0.22, x1, top);
    }
    c.closePath();
    c.fill();
    c.stroke();
    // garland
    [[x - w, top], [x + w, top], [x, top - T * 0.18], [x - w * 0.5, top - T * 0.12], [x + w * 0.5, top - T * 0.12]]
      .forEach(([fx, fy], i) => flower(c, fx, fy, T * 0.13, i % 2 ? '#f4b6c2' : COLORS.rose, t + i));
    c.restore();
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const game = {
    mode: 'menu',       // menu | play | paused | dying | kiss | won | lost
    prevMode: null,
    couple: 'mw',
    playMode: 'single', // single | coop
    level: 1,
    lives: MAX_LIVES,
    score: 0,
    levelStartScore: 0,
    time: 0,
    heartsGot: 0,
    heartsTotal: 0,
    maze: null,
    chars: [],
    chuppah: null,
    ring: null,
    hasRing: false,
    hearts: [],
    obstacles: [],
    shake: 0,
    stateT: 0,
    kiss: null,
    toastT: 0,
    best: loadBest(),
    clock: 0
  };

  const view = { scale: 1, dpr: 1 };
  const input = {
    p1: { up: false, down: false, left: false, right: false },  // WASD (+ touch D-pad)
    p2: { up: false, down: false, left: false, right: false }   // Arrow keys
  };

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function saveBest() {
    if (game.score > game.best) {
      game.best = game.score;
      try { localStorage.setItem(BEST_KEY, String(game.best)); } catch (e) { /* storage unavailable */ }
    }
  }

  function loadSetup() {
    try {
      const s = JSON.parse(localStorage.getItem(SETUP_KEY) || '{}');
      if (COUPLES[s.couple]) game.couple = s.couple;
      if (s.playMode === 'single' || s.playMode === 'coop') game.playMode = s.playMode;
    } catch (e) { /* ignore */ }
  }

  function saveSetup() {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify({ couple: game.couple, playMode: game.playMode }));
    } catch (e) { /* ignore */ }
  }

  const difficulty = (level) => 1 + (level - 1) * 0.12;
  // Always odd so the maze has a true centre cell for the chuppah.
  const cellsFor = (level) => Math.min(7 + 2 * Math.floor((level - 1) / 2), 15);
  const isCoop = () => game.playMode === 'coop';
  const controlledChars = () => (isCoop() ? game.chars : game.chars.slice(0, 1));

  function makeChar(tx, ty, look, index) {
    return {
      index,
      look,
      x: center(tx),
      y: center(ty),
      r: T * 0.3,
      speed: T * 4.6,
      moving: false,
      walk: rand(0, 3),
      invuln: 1.2,
      shield: 0,
      path: null,
      pathIdx: 0
    };
  }

  function buildLevel(level) {
    const n = cellsFor(level);
    const maze = generateMaze(n);
    const { size, mid } = maze;
    game.maze = maze;
    game.time = 0;
    game.heartsGot = 0;
    game.hasRing = false;
    game.shake = 0;
    game.kiss = null;
    particles = [];

    const startA = { x: 1, y: 1 };
    const startB = { x: size - 2, y: size - 2 };
    const centreTile = { x: mid, y: mid };
    game.chuppah = { x: center(mid), y: center(mid) };

    const diff = difficulty(level);
    const sA = bfs(maze, startA);
    const sB = bfs(maze, startB);
    const sC = bfs(maze, centreTile);
    const floor = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (maze.isWall(x, y) || maze.inPlaza(x, y)) continue;
        const i = y * size + x;
        floor.push({ x, y, da: sA.d[i], db: sB.d[i], dc: sC.d[i] });
      }
    }

    // Decorative flowers on walls
    maze.decor = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (maze.isWall(x, y) && Math.random() < 0.14) {
          maze.decor.push({ x, y, ox: rand(-0.15, 0.15), oy: rand(-0.2, 0.05), c: pick(['#ffffff', '#f9e3e8', '#f4b6c2']) });
        }
      }
    }

    // The one wedding ring: somewhere far from both starts and the chuppah.
    const ringCands = floor
      .map((f) => ({ ...f, score: Math.min(f.da, f.db, f.dc * 1.5) }))
      .sort((a, b) => b.score - a.score);
    const ringTile = pick(ringCands.slice(0, Math.max(1, Math.floor(ringCands.length * 0.25))));
    game.ring = { x: center(ringTile.x), y: center(ringTile.y), tx: ringTile.x, ty: ringTile.y, spin: 0, got: false };

    // Collectible hearts
    const heartCount = Math.min(4 + level, 12);
    game.hearts = shuffle(floor.filter((f) => f.da > 3 && f.db > 3 && !(f.x === ringTile.x && f.y === ringTile.y)))
      .slice(0, heartCount)
      .map((f) => ({ x: center(f.x), y: center(f.y), phase: rand(0, 6), got: false }));
    game.heartsTotal = game.hearts.length;

    // Hazards
    const count = Math.min(2 + level * 2, 20);
    const types = ['guest', 'clock', 'cork'];
    const cands = shuffle(floor.filter((f) => f.da >= 6 && f.db >= 6 && f.dc >= 3 &&
      !(f.x === ringTile.x && f.y === ringTile.y)));
    const used = [];
    const farEnough = (f) => used.every((u) => Math.abs(u.x - f.x) + Math.abs(u.y - f.y) >= 3);
    game.obstacles = [];

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      let made = null;
      for (const f of cands) {
        if (!farEnough(f)) continue;
        if (type === 'cork') {
          const dirs = DIRS.filter(([dx, dy]) => maze.isWall(f.x - dx, f.y - dy) && runLength(maze, f.x, f.y, dx, dy) >= 3);
          if (!dirs.length) continue;
          made = new Cork(f.x, f.y, pick(dirs), diff);
        } else if (type === 'clock') {
          made = new Clock(f.x, f.y, diff);
        } else {
          made = new Guest(f.x, f.y, diff);
        }
        used.push(f);
        break;
      }
      if (!made) {
        const f = cands.find(farEnough);
        if (!f) break;
        used.push(f);
        made = new Guest(f.x, f.y, diff);
      }
      game.obstacles.push(made);
    }

    // The couple: opposite corners, both heading for the centre.
    const couple = COUPLES[game.couple];
    const a = makeChar(startA.x, startA.y, couple.a, 0);
    const b = makeChar(startB.x, startB.y, couple.b, 1);
    // In single player the partner walks to the chuppah on their own.
    b.path = pathTo(maze, sC, startB).reverse();
    b.pathIdx = 0;
    game.chars = [a, b];

    resize();
    updateHud(true);
  }

  function applyCoupleLooks() {
    const couple = COUPLES[game.couple];
    if (game.chars[0]) game.chars[0].look = couple.a;
    if (game.chars[1]) game.chars[1].look = couple.b;
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  function resize() {
    if (!game.maze) return;
    const rect = stage.getBoundingClientRect();
    const cssSize = Math.max(200, Math.floor(Math.min(rect.width, rect.height) - 14));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.dpr = dpr;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    view.scale = canvas.width / (game.maze.size * T);
    renderMazeLayer();
  }

  function renderMazeLayer() {
    const m = game.maze;
    const size = m.size;
    mazeLayer.width = canvas.width;
    mazeLayer.height = canvas.height;
    const c = mazeLayer.getContext('2d');
    c.setTransform(view.scale, 0, 0, view.scale, 0, 0);

    c.fillStyle = COLORS.floorA;
    c.fillRect(0, 0, size * T, size * T);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (m.isWall(x, y)) continue;
        if ((x + y) % 2) {
          c.fillStyle = COLORS.floorB;
          c.fillRect(x * T, y * T, T, T);
        }
        if (m.isWall(x, y - 1)) {
          const g = c.createLinearGradient(0, y * T, 0, y * T + T * 0.3);
          g.addColorStop(0, 'rgba(180, 86, 107, 0.16)');
          g.addColorStop(1, 'rgba(180, 86, 107, 0)');
          c.fillStyle = g;
          c.fillRect(x * T, y * T, T, T * 0.3);
        }
      }
    }

    // plaza rug under the chuppah
    const mx = center(m.mid);
    c.fillStyle = 'rgba(244, 182, 194, 0.28)';
    roundRect(c, mx - T * 1.4, mx - T * 1.4, T * 2.8, T * 2.8, T * 0.6);
    c.fill();
    c.strokeStyle = 'rgba(201, 162, 75, 0.55)';
    c.lineWidth = 1.2;
    c.setLineDash([3, 3]);
    roundRect(c, mx - T * 1.3, mx - T * 1.3, T * 2.6, T * 2.6, T * 0.5);
    c.stroke();
    c.setLineDash([]);

    // start markers in the two corners
    c.fillStyle = 'rgba(216, 121, 140, 0.14)';
    heartPath(c, center(1), center(1) + 2, T * 0.8);
    c.fill();
    c.fillStyle = 'rgba(111, 159, 184, 0.14)';
    heartPath(c, center(size - 2), center(size - 2) + 2, T * 0.8);
    c.fill();

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!m.isWall(x, y)) continue;
        c.fillStyle = COLORS.wallTop;
        c.fillRect(x * T - 0.3, y * T - 0.3, T + 0.6, T + 0.6);
        if (!m.isWall(x, y + 1) && y + 1 < size) {
          c.fillStyle = COLORS.wallFace;
          c.fillRect(x * T - 0.3, y * T + T * 0.74, T + 0.6, T * 0.26 + 0.3);
        }
      }
    }

    c.strokeStyle = COLORS.gold;
    c.lineWidth = 1.1;
    c.beginPath();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!m.isWall(x, y)) continue;
        const X = x * T;
        const Y = y * T;
        if (!m.isWall(x, y - 1) && y > 0) { c.moveTo(X, Y); c.lineTo(X + T, Y); }
        if (!m.isWall(x, y + 1) && y < size - 1) { c.moveTo(X, Y + T); c.lineTo(X + T, Y + T); }
        if (!m.isWall(x - 1, y) && x > 0) { c.moveTo(X, Y); c.lineTo(X, Y + T); }
        if (!m.isWall(x + 1, y) && x < size - 1) { c.moveTo(X + T, Y); c.lineTo(X + T, Y + T); }
      }
    }
    c.stroke();

    for (const d of m.decor) {
      flower(c, center(d.x) + d.ox * T, center(d.y) + d.oy * T, T * 0.14, d.c);
    }

    c.strokeStyle = COLORS.goldLight;
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, size * T - 3, size * T - 3);
  }

  // ---------------------------------------------------------------------------
  // Movement & collision
  // ---------------------------------------------------------------------------
  function resolveWalls(p) {
    const m = game.maze;
    const r = p.r;
    for (let iter = 0; iter < 2; iter++) {
      const x0 = Math.floor((p.x - r) / T);
      const x1 = Math.floor((p.x + r) / T);
      const y0 = Math.floor((p.y - r) / T);
      const y1 = Math.floor((p.y + r) / T);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!m.isWall(tx, ty)) continue;
          const nx = clamp(p.x, tx * T, tx * T + T);
          const ny = clamp(p.y, ty * T, ty * T + T);
          const dx = p.x - nx;
          const dy = p.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * (r - d);
            p.y += (dy / d) * (r - d);
          } else {
            const left = p.x - tx * T;
            const right = tx * T + T - p.x;
            const top = p.y - ty * T;
            const bottom = ty * T + T - p.y;
            const mn = Math.min(left, right, top, bottom);
            if (mn === left) p.x = tx * T - r;
            else if (mn === right) p.x = tx * T + T + r;
            else if (mn === top) p.y = ty * T - r;
            else p.y = ty * T + T + r;
          }
        }
      }
    }
  }

  // When moving along one axis, gently slide into the nearest open lane on the
  // other axis — makes turning into corridors feel smooth.
  function laneTarget(p, horizontal, sign) {
    const m = game.maze;
    const tx = Math.floor(p.x / T);
    const ty = Math.floor(p.y / T);
    let best = null;
    let bestD = Infinity;
    for (let o = -1; o <= 1; o++) {
      const lx = horizontal ? tx : tx + o;
      const ly = horizontal ? ty + o : ty;
      if (m.isWall(lx, ly)) continue;
      if (m.isWall(lx + (horizontal ? sign : 0), ly + (horizontal ? 0 : sign))) continue;
      const c = horizontal ? center(ly) : center(lx);
      const d = Math.abs(c - (horizontal ? p.y : p.x));
      if (d < bestD && d < T * 0.8) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function inputFor(ch) {
    if (isCoop()) return ch.index === 0 ? input.p1 : input.p2;
    const a = input.p1;
    const b = input.p2;
    return { up: a.up || b.up, down: a.down || b.down, left: a.left || b.left, right: a.right || b.right };
  }

  function updateControlled(ch, dt) {
    const k = inputFor(ch);
    let ix = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    let iy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
    ch.moving = ix !== 0 || iy !== 0;
    if (ch.moving) ch.walk += dt * 14;
    if (ix && iy) {
      ix *= Math.SQRT1_2;
      iy *= Math.SQRT1_2;
    }
    const step = ch.speed * dt;
    if (ix && !iy) {
      const lane = laneTarget(ch, true, Math.sign(ix));
      if (lane !== null) ch.y += clamp(lane - ch.y, -step * 0.8, step * 0.8);
    } else if (iy && !ix) {
      const lane = laneTarget(ch, false, Math.sign(iy));
      if (lane !== null) ch.x += clamp(lane - ch.x, -step * 0.8, step * 0.8);
    }
    if (ix) {
      ch.x += ix * step;
      resolveWalls(ch);
    }
    if (iy) {
      ch.y += iy * step;
      resolveWalls(ch);
    }
  }

  // Single-player partner: follows the shortest path to the chuppah.
  function updatePartner(ch, dt) {
    const leader = game.chars[0];
    const hurry = game.hasRing && atChuppah(leader) ? 2.2 : 1;
    const speed = T * 2.4 * hurry;
    ch.moving = false;
    if (!ch.path || ch.pathIdx >= ch.path.length) return;
    const target = ch.path[ch.pathIdx];
    let tx = center(target.x);
    let ty = center(target.y);
    if (ch.pathIdx === ch.path.length - 1) {
      // stand beside the centre, leaving room for the other partner
      tx = game.chuppah.x + T * 0.4;
      ty = game.chuppah.y;
    }
    const dx = tx - ch.x;
    const dy = ty - ch.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step) {
      ch.x = tx;
      ch.y = ty;
      ch.pathIdx++;
    } else {
      ch.x += (dx / d) * step;
      ch.y += (dy / d) * step;
      ch.moving = true;
      ch.walk += dt * 12;
    }
  }

  const atChuppah = (ch) => dist(ch, game.chuppah) < T * 1.05;
  const inSafeZone = (ch) => game.maze.inPlaza(Math.floor(ch.x / T), Math.floor(ch.y / T));

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------
  function toast(text, seconds = 2.2) {
    if (toastEl.textContent !== text) toastEl.textContent = text;
    toastEl.classList.add('show');
    game.toastT = seconds;
  }

  function hideToast() {
    toastEl.classList.remove('show');
    game.toastT = 0;
  }

  function hurt(ch) {
    game.lives--;
    for (const c of controlledChars()) c.invuln = Math.max(c.invuln, 0.6);
    ch.invuln = 1.8;
    game.shake = 0.35;
    burst(ch.x, ch.y - T * 0.2, 14, 'heart', ['#c9b6ba', COLORS.rose], 1.2);
    Sound.hit();
    if (game.lives <= 0) {
      game.mode = 'dying';
      game.stateT = 0;
      hideToast();
      Sound.lose();
    }
    updateHud();
  }

  function collectRing(ch) {
    const r = game.ring;
    r.got = true;
    game.hasRing = true;
    game.score += RING_BONUS;
    for (const c of controlledChars()) {
      c.shield = 3;
      c.invuln = Math.max(c.invuln, 3);
    }
    burst(r.x, r.y, 24, 'spark', [COLORS.gold, COLORS.goldLight, '#ffffff'], 1.4);
    burst(r.x, r.y, 10, 'heart', [COLORS.rose, '#f4b6c2'], 0.9);
    Sound.ring();
    const who = isCoop() ? `Player ${ch.index + 1}` : 'You';
    toast(`💍 ${who} found the wedding ring! +${RING_BONUS} · shield on — now to the chuppah!`, 3);
    updateHud(true);
  }

  function checkMeeting() {
    const [a, b] = game.chars;
    const aIn = atChuppah(a);
    const bIn = atChuppah(b);
    const someoneIn = isCoop() ? aIn || bIn : aIn;
    if (!someoneIn) return;
    if (!game.hasRing) {
      toast('💍 Find the wedding ring first — the kiss needs a ring!', 0.6);
      return;
    }
    if (aIn && bIn) {
      hideToast();
      startKiss();
      return;
    }
    const names = COUPLES[game.couple].names;
    if (isCoop()) toast(`Waiting for Player ${aIn ? 2 : 1} under the chuppah…`, 0.6);
    else toast(`Waiting for ${names[1]}…`, 0.6);
  }

  function startKiss() {
    game.mode = 'kiss';
    game.stateT = 0;
    const cx = game.chuppah.x;
    const cy = game.chuppah.y;
    game.kiss = {
      from: game.chars.map((c) => ({ x: c.x, y: c.y })),
      to: [{ x: cx - T * 0.3, y: cy }, { x: cx + T * 0.3, y: cy }],
      popped: false
    };
  }

  function updateKiss(dt) {
    const k = game.kiss;
    const t = (game.stateT += dt);
    const a = easeInOut(Math.min(1, t / 0.6));
    game.chars.forEach((c, i) => {
      c.x = lerp(k.from[i].x, k.to[i].x, a);
      c.y = lerp(k.from[i].y, k.to[i].y, a);
      c.moving = t < 0.6;
      if (c.moving) c.walk += dt * 14;
    });
    const cx = game.chuppah.x;
    const cy = game.chuppah.y;
    if (t > 0.85 && !k.popped) {
      k.popped = true;
      Sound.win();
      burst(cx, cy - T * 0.5, 30, 'heart', [COLORS.rose, '#f4b6c2', '#ffffff'], 1.4);
      burst(cx, cy, 60, 'confetti', COLORS.confetti, 1.6);
      confettiRain(140);
    }
    if (k.popped && Math.random() < 0.25) {
      burst(cx + rand(-8, 8), cy - T * 0.55, 1, 'heart', [COLORS.rose, '#f4b6c2'], 0.5);
    }
    if (t >= 3.0) finishLevel();
  }

  function finishLevel() {
    game.mode = 'won';
    const n = cellsFor(game.level);
    const par = 15 + n * n * 0.25;
    const timeBonus = Math.max(0, Math.round((par - game.time) * 10));
    const livesBonus = game.lives * 150;
    const levelBonus = game.level * 250;
    const heartPts = game.heartsGot * 100;
    game.score += timeBonus + livesBonus + levelBonus;
    saveBest();
    $('winStats').innerHTML = `
      <dt>Wedding ring</dt><dd>Found (+${RING_BONUS})</dd>
      <dt>Hearts collected</dt><dd>${game.heartsGot} / ${game.heartsTotal} (+${heartPts})</dd>
      <dt>Time</dt><dd>${fmtTime(game.time)}</dd>
      <dt>Time bonus</dt><dd>+${timeBonus}</dd>
      <dt>Lives bonus</dt><dd>+${livesBonus}</dd>
      <dt>Level ${game.level} bonus</dt><dd>+${levelBonus}</dd>
      <dt class="total">Total score</dt><dd class="total">${game.score}</dd>`;
    $('btnNext').textContent = `Continue to Level ${game.level + 1}`;
    updateHud(true);
    showScreen('win');
  }

  function showLose() {
    game.mode = 'lost';
    saveBest();
    $('loseStats').innerHTML = `
      <dt>Level reached</dt><dd>${game.level}</dd>
      <dt>Wedding ring</dt><dd>${game.hasRing ? 'Found' : 'Not found'}</dd>
      <dt>Hearts collected</dt><dd>${game.heartsGot} / ${game.heartsTotal}</dd>
      <dt>Time</dt><dd>${fmtTime(game.time)}</dd>
      <dt class="total">Score</dt><dd class="total">${game.score}</dd>
      <dt>Best</dt><dd>${game.best}</dd>`;
    showScreen('lose');
  }

  function newGame() {
    Sound.init();
    Sound.start();
    saveSetup();
    game.level = 1;
    game.lives = MAX_LIVES;
    game.score = 0;
    game.levelStartScore = 0;
    buildLevel(1);
    beginPlay();
  }

  function nextLevel() {
    Sound.start();
    game.level++;
    game.lives = Math.min(MAX_LIVES, game.lives + 1);
    game.levelStartScore = game.score;
    buildLevel(game.level);
    beginPlay();
  }

  function retryLevel() {
    Sound.init();
    Sound.start();
    game.lives = MAX_LIVES;
    game.score = game.levelStartScore;
    buildLevel(game.level);
    beginPlay();
  }

  function toMenu() {
    game.mode = 'menu';
    game.level = 1;
    game.score = 0;
    game.lives = MAX_LIVES;
    hideToast();
    buildLevel(1);
    showBest();
    showScreen('start');
  }

  function beginPlay() {
    clearInput();
    hideScreens();
    game.mode = 'play';
    const names = COUPLES[game.couple].names;
    if (isCoop()) toast('P1 (WASD) & P2 (Arrows): find the 💍 ring, then meet at the centre!', 3.5);
    else toast(`Guide ${names[0]} to the 💍 ring, then to the chuppah at the centre!`, 3.5);
  }

  function togglePause() {
    if (game.mode === 'play') {
      game.prevMode = game.mode;
      game.mode = 'paused';
      clearInput();
      $('pauseControls').textContent = isCoop()
        ? 'Player 1: W A S D · Player 2: Arrow keys'
        : 'Move with W A S D or the Arrow keys';
      showScreen('pause');
    } else if (game.mode === 'paused') {
      hideScreens();
      game.mode = game.prevMode || 'play';
    }
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('show', k === name));
    const btn = screens[name].querySelector('.btn.primary');
    if (btn) setTimeout(() => btn.focus({ preventScroll: true }), 50);
  }

  function hideScreens() {
    Object.values(screens).forEach((el) => el.classList.remove('show'));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function showBest() {
    $('bestScore').textContent = game.best ? `Best score: ${game.best}` : '';
  }

  // ---------------------------------------------------------------------------
  // Setup screens
  // ---------------------------------------------------------------------------
  function drawPreviews() {
    document.querySelectorAll('canvas.preview').forEach((cv) => {
      const couple = COUPLES[cv.dataset.couple];
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = 150;
      const h = 100;
      cv.width = w * dpr;
      cv.height = h * dpr;
      const c = cv.getContext('2d');
      const k = (h / (T * 1.7)) * dpr;
      c.setTransform(k, 0, 0, k, 0, 0);
      const W = (w * dpr) / k;
      const cy = T * 0.95;
      c.fillStyle = 'rgba(244, 182, 194, 0.5)';
      heartPath(c, W / 2, cy - T * 0.68, T * 0.42);
      c.fill();
      drawPerson(c, W / 2 - T * 0.33, cy, couple.a, { lean: 0.12 });
      drawPerson(c, W / 2 + T * 0.33, cy, couple.b, { lean: -0.12 });
    });
  }

  function syncSetupUI() {
    document.querySelectorAll('.option[data-couple]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.couple === game.couple)));
    document.querySelectorAll('.option[data-mode]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.mode === game.playMode)));

    const names = COUPLES[game.couple].names;
    $('descSingle').textContent =
      `You guide ${names[0]}; ${names[1]} makes their own way to the chuppah.`;

    const wasd = '<div class="keys"><kbd class="top">W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>';
    const arrows = '<div class="keys"><kbd class="top">↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div>';
    $('controlsGuide').innerHTML = isCoop()
      ? `<div class="guide-col"><span class="badge p1">Player 1</span>${wasd}
           <span>WASD keys · controls ${names[0]} (top-left corner)</span></div>
         <div class="guide-col"><span class="badge p2">Player 2</span>${arrows}
           <span>Arrow keys · controls ${names[1]} (bottom-right corner)</span></div>`
      : `<div class="guide-col"><span class="badge p1">Player 1</span>
           <div class="keys-pair">${wasd}<span class="keys-or">or</span>${arrows}</div>
           <span>WASD or Arrow keys · controls ${names[0]} (top-left corner)</span></div>`;
  }

  function openCoupleScreen() {
    Sound.init();
    Sound.click();
    syncSetupUI();
    drawPreviews();
    showScreen('couple');
  }

  function openModeScreen() {
    Sound.click();
    syncSetupUI();
    showScreen('mode');
  }

  document.querySelectorAll('.option[data-couple]').forEach((btn) => {
    btn.addEventListener('click', () => {
      game.couple = btn.dataset.couple;
      applyCoupleLooks();
      Sound.click();
      syncSetupUI();
    });
  });

  document.querySelectorAll('.option[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      game.playMode = btn.dataset.mode;
      Sound.click();
      syncSetupUI();
    });
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    game.clock += dt;
    const mode = game.mode;
    if (mode === 'paused') return;

    if (game.toastT > 0) {
      game.toastT -= dt;
      if (game.toastT <= 0) hideToast();
    }

    if (mode === 'menu' || mode === 'play' || mode === 'dying') {
      for (const ob of game.obstacles) ob.update(dt);
    }
    if (game.ring) game.ring.spin += dt * 3;

    if (mode === 'play') {
      game.time += dt;
      const ctrl = controlledChars();
      for (const ch of ctrl) {
        updateControlled(ch, dt);
        if (ch.invuln > 0) ch.invuln -= dt;
        if (ch.shield > 0) ch.shield -= dt;
      }
      if (!isCoop()) updatePartner(game.chars[1], dt);

      for (const ch of ctrl) {
        for (const h of game.hearts) {
          if (!h.got && Math.hypot(h.x - ch.x, h.y - ch.y) < ch.r + T * 0.25) {
            h.got = true;
            game.heartsGot++;
            game.score += 100;
            burst(h.x, h.y, 8, 'heart', [COLORS.rose, '#f4b6c2'], 0.7);
            burst(h.x, h.y, 8, 'spark', [COLORS.goldLight, '#ffffff']);
            Sound.pickup();
          }
        }
        if (!game.ring.got && dist(game.ring, ch) < ch.r + T * 0.3) collectRing(ch);
      }

      if (Math.random() < 0.08 && !game.ring.got) {
        burst(game.ring.x + rand(-6, 6), game.ring.y + rand(-6, 6), 1, 'spark', [COLORS.goldLight, '#ffffff'], 0.3);
      }

      outer:
      for (const ch of ctrl) {
        if (ch.invuln > 0 || inSafeZone(ch)) continue;
        for (const ob of game.obstacles) {
          if (ob.harmful && dist(ch, ob) < ch.r * 0.8 + ob.hitR) {
            hurt(ch);
            break outer;
          }
        }
      }

      if (game.mode === 'play') checkMeeting();
    } else if (mode === 'dying') {
      game.stateT += dt;
      if (game.stateT > 1.2) showLose();
    } else if (mode === 'kiss') {
      updateKiss(dt);
    } else if (mode === 'won') {
      if (Math.random() < 0.15) confettiRain(1);
    }

    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
    updateParticles(dt);
    updateHud();
  }

  const hudCache = {};
  function updateHud(force) {
    const vals = {
      level: String(game.level),
      time: fmtTime(game.time),
      hearts: `${game.heartsGot} / ${game.heartsTotal}`,
      ring: game.hasRing ? 'Found 💍' : 'Missing',
      score: String(game.score),
      lives: String(game.lives)
    };
    for (const k of Object.keys(vals)) {
      if (!force && hudCache[k] === vals[k]) continue;
      hudCache[k] = vals[k];
      if (k === 'lives') {
        hud.lives.innerHTML = '♥'.repeat(Math.max(0, game.lives)) +
          `<span class="lost">${'♥'.repeat(Math.max(0, MAX_LIVES - game.lives))}</span>`;
        hud.lives.setAttribute('aria-label', `${game.lives} lives`);
      } else {
        hud[k].textContent = vals[k];
      }
    }
    hud.ring.classList.toggle('found', game.hasRing);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function render() {
    if (!game.maze) return;
    const t = game.clock;
    let sx = 0;
    let sy = 0;
    if (game.shake > 0) {
      const amt = game.shake * 14 * view.dpr;
      sx = rand(-amt, amt);
      sy = rand(-amt, amt);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.floorA;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mazeLayer, sx, sy);
    ctx.setTransform(view.scale, 0, 0, view.scale, sx, sy);

    // hearts
    for (const h of game.hearts) {
      if (h.got) continue;
      const bob = Math.sin(t * 3 + h.phase) * 2;
      const pulse = 1 + Math.sin(t * 5 + h.phase) * 0.06;
      ctx.fillStyle = 'rgba(232, 207, 143, 0.35)';
      ctx.beginPath();
      ctx.arc(h.x, h.y + bob, T * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.rose;
      heartPath(ctx, h.x, h.y + bob, T * 0.42 * pulse);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(h.x - T * 0.07, h.y + bob - T * 0.08, T * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    // the wedding ring
    const ring = game.ring;
    if (ring && !ring.got) {
      const bob = Math.sin(t * 2.5) * 2.5;
      const glowR = T * (0.55 + Math.sin(t * 4) * 0.08);
      const g = ctx.createRadialGradient(ring.x, ring.y, 1, ring.x, ring.y, glowR);
      g.addColorStop(0, 'rgba(255, 238, 190, 0.95)');
      g.addColorStop(1, 'rgba(255, 238, 190, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, glowR, 0, Math.PI * 2);
      ctx.fill();
      drawRingItem(ctx, ring.x, ring.y + bob + T * 0.05, T * 0.2, ring.spin);
    }

    drawChuppah(ctx, game.chuppah.x, game.chuppah.y, t);

    // characters and hazards, sorted by y for a little depth
    const kissing = game.mode === 'kiss' || game.mode === 'won';
    const lean = game.mode === 'won' ? 1 : kissing ? clamp((game.stateT - 0.55) / 0.3, 0, 1) : 0;
    const drawables = game.obstacles.map((ob) => ({ y: ob.y, draw: () => ob.draw(ctx) }));
    game.chars.forEach((ch) => {
      drawables.push({
        y: ch.y + 0.01,
        draw: () => {
          let alpha = 1;
          const controlled = controlledChars().includes(ch);
          if (controlled && ch.invuln > 0 && ch.shield <= 0 && game.mode === 'play') {
            alpha = Math.sin(t * 30) > 0 ? 1 : 0.35;
          }
          if (game.mode === 'dying' && controlled) alpha = Math.max(0, 1 - game.stateT / 1.2);
          if (ch.shield > 0 && game.mode === 'play') {
            ctx.strokeStyle = `rgba(201, 162, 75, ${0.35 + 0.25 * Math.sin(t * 10)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ch.x, ch.y - T * 0.05, T * 0.55, 0, Math.PI * 2);
            ctx.stroke();
          }
          drawPerson(ctx, ch.x, ch.y, ch.look, {
            bob: ch.moving ? Math.abs(Math.sin(ch.walk)) * -2 : 0,
            lean: kissing ? (ch.index === 0 ? 0.2 : -0.2) * lean : 0,
            alpha
          });
          if (isCoop() && !kissing) {
            drawTag(ctx, ch.x, ch.y - T * 0.78, `P${ch.index + 1}`, ch.index === 0 ? COLORS.rose : COLORS.p2);
          }
        }
      });
    });
    drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());

    // kiss heart
    const k = game.kiss;
    if (kissing && k && k.popped) {
      const kt = game.mode === 'won' ? 2 : game.stateT - 0.85;
      const sc = kt < 0.4 ? easeOutBack(kt / 0.4) : 1 + Math.sin(kt * 6) * 0.05;
      ctx.fillStyle = COLORS.rose;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      heartPath(ctx, game.chuppah.x, game.chuppah.y - T * 0.8, T * 0.75 * sc);
      ctx.fill();
      ctx.stroke();
      drawRingItem(ctx, game.chuppah.x + T * 0.42, game.chuppah.y - T * 0.98, T * 0.12, 0);
    }

    drawParticles(ctx);
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const KEYMAP = {
    KeyW: ['p1', 'up'], KeyS: ['p1', 'down'], KeyA: ['p1', 'left'], KeyD: ['p1', 'right'],
    ArrowUp: ['p2', 'up'], ArrowDown: ['p2', 'down'], ArrowLeft: ['p2', 'left'], ArrowRight: ['p2', 'right']
  };

  function clearInput() {
    for (const p of [input.p1, input.p2]) p.up = p.down = p.left = p.right = false;
    document.querySelectorAll('.dp.active').forEach((b) => b.classList.remove('active'));
  }

  window.addEventListener('keydown', (e) => {
    const map = KEYMAP[e.code];
    if (map) {
      if (game.mode === 'play') e.preventDefault();
      input[map[0]][map[1]] = true;
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (game.mode === 'play' || game.mode === 'paused') {
        e.preventDefault();
        togglePause();
      }
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'Space' && game.mode === 'play') {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const map = KEYMAP[e.code];
    if (map) input[map[0]][map[1]] = false;
  });

  window.addEventListener('blur', () => {
    clearInput();
    if (game.mode === 'play') togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'play') togglePause();
  });

  // Touch D-pad drives Player 1
  const isTouch = 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (isTouch) document.body.classList.add('touch');
  document.querySelectorAll('.dp').forEach((btn) => {
    const dir = btn.dataset.dir;
    const on = (e) => { e.preventDefault(); input.p1[dir] = true; btn.classList.add('active'); };
    const off = (e) => { e.preventDefault(); input.p1[dir] = false; btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function toggleMute() {
    Sound.muted = !Sound.muted;
    $('btnMute').classList.toggle('off', Sound.muted);
  }

  $('btnStart').addEventListener('click', openCoupleScreen);
  $('btnCoupleBack').addEventListener('click', () => { Sound.click(); showScreen('start'); });
  $('btnCoupleNext').addEventListener('click', openModeScreen);
  $('btnModeBack').addEventListener('click', openCoupleScreen);
  $('btnBegin').addEventListener('click', newGame);
  $('btnResume').addEventListener('click', togglePause);
  $('btnQuit').addEventListener('click', toMenu);
  $('btnNext').addEventListener('click', nextLevel);
  $('btnMenuWin').addEventListener('click', toMenu);
  $('btnRetry').addEventListener('click', retryLevel);
  $('btnMenuLose').addEventListener('click', toMenu);
  $('btnMute').addEventListener('click', (e) => { toggleMute(); e.currentTarget.blur(); });
  $('btnPause').addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (game.mode === 'play' || game.mode === 'paused') togglePause();
  });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------------------
  // Boot: animated preview maze behind the title screen
  // ---------------------------------------------------------------------------
  loadSetup();
  buildLevel(1);
  showBest();
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
