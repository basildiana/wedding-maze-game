/* Path to the Chuppah — a wedding-themed maze game.
 * 100% client-side, vanilla JavaScript + HTML5 canvas. No assets, no network. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants & helpers
  // ---------------------------------------------------------------------------
  const T = 32;                 // logical tile size (canvas units)
  const MAX_LIVES = 3;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BEST_KEY = 'chuppahMazeBest';

  const COLORS = {
    floorA: '#fffaf3',
    floorB: '#fcefec',
    wallTop: '#f4cdd5',
    wallFace: '#e2a6b4',
    gold: '#c9a24b',
    goldLight: '#e8cf8f',
    rose: '#d8798c',
    roseDark: '#b4566b',
    ink: '#5a3f47',
    confetti: ['#f4b6c2', '#e8cf8f', '#ffffff', '#c9a24b', '#cfe3d0', '#d8c3e8', '#f7dfe3']
  };
  const GUEST_OUTFITS = ['#a7c4e5', '#c9b3e3', '#f2c18d', '#9fcfb3', '#e89aa8', '#8fb8b0', '#d6a1c9'];
  const SKINS = ['#f6d3c0', '#e8b896', '#c98f6b', '#8d5a3f', '#f1c7a8'];
  const HAIRS = ['#3b2a24', '#7a4b3a', '#c99a5b', '#1f1a1c', '#a35a3c', '#d9d0c7'];

  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const center = (t) => (t + 0.5) * T;
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
  const mazeLayer = document.createElement('canvas');
  const screens = {
    start: $('screenStart'),
    pause: $('screenPause'),
    win: $('screenWin'),
    lose: $('screenLose')
  };
  const hud = {
    level: $('hudLevel'),
    time: $('hudTime'),
    hearts: $('hudHearts'),
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
    start() {
      this.tone(659.25, 0.15, { type: 'triangle' });
      this.tone(987.77, 0.3, { type: 'triangle', delay: 0.1 });
    },
    pickup() {
      this.tone(880, 0.1, { type: 'triangle', vol: 0.1 });
      this.tone(1318.5, 0.18, { type: 'triangle', vol: 0.1, delay: 0.06 });
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
    // (gives the player room to dodge obstacles).
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!grid[y * size + x]) continue;
        const between = (x % 2 === 0 && y % 2 === 1) || (x % 2 === 1 && y % 2 === 0);
        if (between && Math.random() < 0.1) grid[y * size + x] = 0;
      }
    }

    const maze = {
      size,
      grid,
      isWall(tx, ty) {
        return tx < 0 || ty < 0 || tx >= size || ty >= size || grid[ty * size + tx] === 1;
      }
    };
    return maze;
  }

  function bfs(maze, from) {
    const { size } = maze;
    const d = new Int32Array(size * size).fill(-1);
    const queue = [[from.x, from.y]];
    d[from.y * size + from.x] = 0;
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (maze.isWall(nx, ny) || d[ny * size + nx] !== -1) continue;
        d[ny * size + nx] = d[y * size + x] + 1;
        queue.push([nx, ny]);
      }
    }
    return d;
  }

  function runLength(maze, tx, ty, dx, dy) {
    let n = 0;
    while (!maze.isWall(tx + dx * (n + 1), ty + dy * (n + 1))) n++;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Obstacles
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
      const open = DIRS.filter(([dx, dy]) => !game.maze.isWall(this.tx + dx, this.ty + dy));
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
      // body
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
      // head
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
        // chatting — little music note
        c.fillStyle = COLORS.roseDark;
        c.font = `${Math.round(s * 0.35)}px serif`;
        c.textAlign = 'center';
        c.fillText('♪', s * 0.25, -s * 0.48);
      }
      c.restore();
    }
  }

  class Ring {
    constructor(tx, ty, axis, diff) {
      this.kind = 'ring';
      this.x = center(tx);
      this.y = center(ty);
      this.r = T * 0.22;
      const sign = Math.random() < 0.5 ? 1 : -1;
      this.dir = axis === 'h' ? [sign, 0] : [0, sign];
      this.speed = T * 2.5 * diff * rand(0.9, 1.15);
      this.spin = rand(0, Math.PI * 2);
      this.trail = [];
    }
    get harmful() { return true; }
    get hitR() { return this.r; }
    update(dt) {
      this.spin += dt * 7;
      this.trail.unshift({ x: this.x, y: this.y });
      if (this.trail.length > 6) this.trail.pop();
      this.x += this.dir[0] * this.speed * dt;
      this.y += this.dir[1] * this.speed * dt;
      const tx = Math.floor(this.x / T);
      const ty = Math.floor(this.y / T);
      const cx = center(tx);
      const cy = center(ty);
      const past = (this.x - cx) * this.dir[0] + (this.y - cy) * this.dir[1];
      if (past >= 0 && game.maze.isWall(tx + this.dir[0], ty + this.dir[1])) {
        this.x = cx;
        this.y = cy;
        this.dir = [-this.dir[0], -this.dir[1]];
      }
    }
    draw(c) {
      this.trail.forEach((p, i) => {
        c.fillStyle = `rgba(232, 207, 143, ${0.25 - i * 0.04})`;
        c.beginPath();
        c.arc(p.x, p.y, this.r * (1 - i * 0.1), 0, Math.PI * 2);
        c.fill();
      });
      const rx = this.r * Math.max(0.22, Math.abs(Math.cos(this.spin)));
      c.save();
      c.translate(this.x, this.y);
      c.lineWidth = T * 0.075;
      c.strokeStyle = COLORS.gold;
      c.beginPath();
      c.ellipse(0, 0, rx, this.r, 0, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = T * 0.025;
      c.strokeStyle = '#f6e3b0';
      c.beginPath();
      c.ellipse(0, 0, rx, this.r, 0, Math.PI * 1.1, Math.PI * 1.6);
      c.stroke();
      // diamond
      c.translate(0, -this.r - T * 0.05);
      c.rotate(Math.PI / 4);
      const d = T * 0.11;
      c.fillStyle = '#d7eef8';
      c.fillRect(-d / 2, -d / 2, d, d);
      c.fillStyle = '#ffffff';
      c.fillRect(-d / 2, -d / 2, d / 2.4, d / 2.4);
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
          if (game.player && dist(this, game.player) < T * 7) Sound.pop();
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
      // bottle (harmless decoration that shakes just before it pops)
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
      // bells
      c.fillStyle = COLORS.gold;
      c.beginPath();
      c.arc(-r * 0.7, -r * 0.85, r * 0.38, Math.PI, Math.PI * 2);
      c.arc(r * 0.7, -r * 0.85, r * 0.38, Math.PI, Math.PI * 2);
      c.fill();
      // face
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

  function drawBride(c, x, y, { bob = 0, lean = 0, alpha = 1 } = {}) {
    const s = T * 1.05;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y + bob);
    shadow(c, 0, s * 0.4, s * 0.3);
    c.rotate(lean);
    // veil (behind)
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
    // dress
    c.fillStyle = '#ffffff';
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
    // bodice
    c.beginPath();
    roundRect(c, -s * 0.1, -s * 0.2, s * 0.2, s * 0.13, s * 0.04);
    c.fill();
    c.stroke();
    // sash
    c.fillStyle = COLORS.goldLight;
    c.fillRect(-s * 0.105, -s * 0.09, s * 0.21, s * 0.03);
    // bouquet
    c.fillStyle = '#9fbf95';
    c.beginPath();
    c.moveTo(-s * 0.02, s * 0.02);
    c.lineTo(s * 0.02, s * 0.14);
    c.lineTo(s * 0.06, s * 0.02);
    c.fill();
    [[-0.04, -0.01, COLORS.rose], [0.04, -0.02, '#f4b6c2'], [0, -0.05, '#ffffff'], [0.08, 0.02, '#f4b6c2']]
      .forEach(([bx, by, col]) => {
        c.fillStyle = col;
        c.beginPath();
        c.arc(s * bx, s * by, s * 0.04, 0, Math.PI * 2);
        c.fill();
      });
    // head
    c.fillStyle = '#f6d3c0';
    c.beginPath();
    c.arc(0, -s * 0.3, s * 0.12, 0, Math.PI * 2);
    c.fill();
    // hair
    c.fillStyle = '#7a4b3a';
    c.beginPath();
    c.arc(0, -s * 0.33, s * 0.125, Math.PI * 1.02, Math.PI * 1.98);
    c.fill();
    c.beginPath();
    c.arc(0, -s * 0.44, s * 0.06, 0, Math.PI * 2);
    c.fill();
    // tiara
    c.fillStyle = COLORS.gold;
    c.beginPath();
    c.moveTo(-s * 0.08, -s * 0.41);
    c.lineTo(-s * 0.04, -s * 0.47);
    c.lineTo(0, -s * 0.42);
    c.lineTo(s * 0.04, -s * 0.47);
    c.lineTo(s * 0.08, -s * 0.41);
    c.closePath();
    c.fill();
    eyes(c, 0, -s * 0.29, s);
    cheeks(c, 0, -s * 0.29, s);
    c.restore();
  }

  function drawGroom(c, x, y, { bob = 0, lean = 0 } = {}) {
    const s = T * 1.05;
    c.save();
    c.translate(x, y + bob);
    shadow(c, 0, s * 0.4, s * 0.24);
    c.rotate(lean);
    // legs
    c.fillStyle = '#2e2830';
    c.fillRect(-s * 0.1, s * 0.15, s * 0.08, s * 0.25);
    c.fillRect(s * 0.02, s * 0.15, s * 0.08, s * 0.25);
    // jacket
    c.fillStyle = '#3d3540';
    c.beginPath();
    c.moveTo(-s * 0.15, -s * 0.18);
    c.lineTo(-s * 0.17, s * 0.2);
    c.lineTo(s * 0.17, s * 0.2);
    c.lineTo(s * 0.15, -s * 0.18);
    c.quadraticCurveTo(0, -s * 0.22, -s * 0.15, -s * 0.18);
    c.closePath();
    c.fill();
    // shirt
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(-s * 0.06, -s * 0.19);
    c.lineTo(0, s * 0.02);
    c.lineTo(s * 0.06, -s * 0.19);
    c.closePath();
    c.fill();
    // bow tie
    c.fillStyle = '#1f1a1c';
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
    // boutonniere
    c.fillStyle = COLORS.rose;
    c.beginPath();
    c.arc(-s * 0.1, -s * 0.1, s * 0.03, 0, Math.PI * 2);
    c.fill();
    // head
    c.fillStyle = '#e8b896';
    c.beginPath();
    c.arc(0, -s * 0.3, s * 0.12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3b2a24';
    c.beginPath();
    c.arc(0, -s * 0.33, s * 0.125, Math.PI * 1.0, Math.PI * 2);
    c.fill();
    // kippah
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(0, -s * 0.44, s * 0.07, s * 0.03, 0, 0, Math.PI * 2);
    c.fill();
    eyes(c, 0, -s * 0.29, s);
    cheeks(c, 0, -s * 0.29, s);
    c.restore();
  }

  function drawChuppah(c, x, y, t) {
    const w = T * 0.62;
    const top = y - T * 0.78;
    c.save();
    // glow
    const g = c.createRadialGradient(x, y, 2, x, y, T * 1.2);
    g.addColorStop(0, 'rgba(255, 236, 200, 0.75)');
    g.addColorStop(1, 'rgba(255, 236, 200, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, T * 1.2, 0, Math.PI * 2);
    c.fill();
    // poles
    c.fillStyle = COLORS.gold;
    c.fillRect(x - w - 1.5, top, 3, T * 1.2);
    c.fillRect(x + w - 1.5, top, 3, T * 1.2);
    // canopy
    c.fillStyle = '#ffffff';
    c.strokeStyle = COLORS.goldLight;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x - w - 4, top);
    c.quadraticCurveTo(x, top - T * 0.22, x + w + 4, top);
    const scallops = 5;
    for (let i = scallops; i > 0; i--) {
      const x0 = x - w - 4 + ((i) / scallops) * (2 * w + 8);
      const x1 = x - w - 4 + ((i - 1) / scallops) * (2 * w + 8);
      c.quadraticCurveTo((x0 + x1) / 2, top + T * 0.16, x1, top);
    }
    c.closePath();
    c.fill();
    c.stroke();
    // flowers on corners
    [[x - w, top], [x + w, top], [x, top - T * 0.1]].forEach(([fx, fy], i) => {
      flower(c, fx, fy, T * 0.11, i === 2 ? COLORS.rose : '#f4b6c2', t + i);
    });
    c.restore();
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

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const game = {
    mode: 'menu',       // menu | play | paused | dying | kiss | won | lost
    prevMode: null,
    level: 1,
    lives: MAX_LIVES,
    score: 0,
    levelStartScore: 0,
    time: 0,
    heartsGot: 0,
    heartsTotal: 0,
    maze: null,
    start: null,
    goal: null,
    player: null,
    groom: null,
    hearts: [],
    obstacles: [],
    shake: 0,
    stateT: 0,
    kiss: null,
    best: loadBest(),
    clock: 0
  };

  const view = { scale: 1, cssSize: 0, dpr: 1 };
  const input = { up: false, down: false, left: false, right: false };

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }

  function saveBest() {
    if (game.score > game.best) {
      game.best = game.score;
      try { localStorage.setItem(BEST_KEY, String(game.best)); } catch (e) { /* storage unavailable */ }
    }
  }

  function difficulty(level) {
    return 1 + (level - 1) * 0.12;
  }

  function buildLevel(level) {
    const n = Math.min(6 + level, 15);
    const maze = generateMaze(n);
    const { size } = maze;
    game.maze = maze;
    game.start = { x: 1, y: 1 };
    game.goal = { x: size - 2, y: size - 2 };
    game.time = 0;
    game.heartsGot = 0;
    game.shake = 0;
    game.kiss = null;
    particles = [];

    const diff = difficulty(level);
    const dS = bfs(maze, game.start);
    const dG = bfs(maze, game.goal);
    const floor = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!maze.isWall(x, y)) floor.push({ x, y, ds: dS[y * size + x], dg: dG[y * size + x] });
      }
    }

    // Decorative flowers on walls (fixed per level)
    maze.decor = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (maze.isWall(x, y) && Math.random() < 0.14) {
          maze.decor.push({ x, y, ox: rand(-0.15, 0.15), oy: rand(-0.2, 0.05), c: pick(['#ffffff', '#f9e3e8', '#f4b6c2']) });
        }
      }
    }

    // Collectible hearts
    const heartCount = Math.min(4 + level, 12);
    game.hearts = shuffle(floor.filter((f) => f.ds > 3 && f.dg > 1))
      .slice(0, heartCount)
      .map((f) => ({ x: center(f.x), y: center(f.y), phase: rand(0, 6), got: false }));
    game.heartsTotal = game.hearts.length;

    // Obstacles
    const count = Math.min(3 + level * 2, 22);
    const types = ['guest', 'ring', 'clock', 'cork'];
    const cands = shuffle(floor.filter((f) => f.ds >= 7 && f.dg >= 2));
    const used = [];
    const farEnough = (f) => used.every((u) => Math.abs(u.x - f.x) + Math.abs(u.y - f.y) >= 3);
    game.obstacles = [];

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      let made = null;
      for (const f of cands) {
        if (!farEnough(f)) continue;
        if (type === 'ring') {
          const h = runLength(maze, f.x, f.y, 1, 0) + runLength(maze, f.x, f.y, -1, 0);
          const v = runLength(maze, f.x, f.y, 0, 1) + runLength(maze, f.x, f.y, 0, -1);
          if (Math.max(h, v) < 3) continue;
          made = new Ring(f.x, f.y, h >= v ? 'h' : 'v', diff);
        } else if (type === 'cork') {
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
        const f = cands.find(farEnough) || cands[i % cands.length];
        if (!f) break;
        used.push(f);
        made = new Guest(f.x, f.y, diff);
      }
      game.obstacles.push(made);
    }

    game.player = {
      x: center(game.start.x),
      y: center(game.start.y),
      r: T * 0.3,
      speed: T * 4.6,
      moving: false,
      walk: 0,
      invuln: 1.2
    };
    game.groom = { x: center(game.goal.x), y: center(game.goal.y) };

    resize();
    updateHud(true);
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  function resize() {
    if (!game.maze) return;
    const rect = stage.getBoundingClientRect();
    const cssSize = Math.max(200, Math.floor(Math.min(rect.width, rect.height) - 14));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.cssSize = cssSize;
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

    // floor
    c.fillStyle = COLORS.floorA;
    c.fillRect(0, 0, size * T, size * T);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (m.isWall(x, y)) continue;
        if ((x + y) % 2) {
          c.fillStyle = COLORS.floorB;
          c.fillRect(x * T, y * T, T, T);
        }
        // soft shadow under walls
        if (m.isWall(x, y - 1)) {
          const g = c.createLinearGradient(0, y * T, 0, y * T + T * 0.3);
          g.addColorStop(0, 'rgba(180, 86, 107, 0.16)');
          g.addColorStop(1, 'rgba(180, 86, 107, 0)');
          c.fillStyle = g;
          c.fillRect(x * T, y * T, T, T * 0.3);
        }
      }
    }

    // aisle runner hint at the start
    c.fillStyle = 'rgba(216, 121, 140, 0.12)';
    heartPath(c, center(game.start.x), center(game.start.y) + 2, T * 0.8);
    c.fill();

    // walls: top face + darker front face for a soft 2.5D look
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

    // gold trim where walls meet the floor
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

    // little flowers on hedges
    for (const d of m.decor) {
      flower(c, center(d.x) + d.ox * T, center(d.y) + d.oy * T, T * 0.14, d.c);
    }

    // outer frame
    c.strokeStyle = COLORS.goldLight;
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, size * T - 3, size * T - 3);
  }

  // ---------------------------------------------------------------------------
  // Player movement & collision
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

  // When moving along one axis, gently slide the player into the nearest open
  // lane on the other axis — makes turning into corridors feel smooth.
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

  function updatePlayer(dt) {
    const p = game.player;
    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    p.moving = ix !== 0 || iy !== 0;
    if (p.moving) p.walk += dt * 14;
    if (ix && iy) {
      ix *= Math.SQRT1_2;
      iy *= Math.SQRT1_2;
    }
    const step = p.speed * dt;
    if (ix && !iy) {
      const lane = laneTarget(p, true, Math.sign(ix));
      if (lane !== null) p.y += clamp(lane - p.y, -step * 0.8, step * 0.8);
    } else if (iy && !ix) {
      const lane = laneTarget(p, false, Math.sign(iy));
      if (lane !== null) p.x += clamp(lane - p.x, -step * 0.8, step * 0.8);
    }
    if (ix) {
      p.x += ix * step;
      resolveWalls(p);
    }
    if (iy) {
      p.y += iy * step;
      resolveWalls(p);
    }
    if (p.invuln > 0) p.invuln -= dt;
  }

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------
  function hurt() {
    const p = game.player;
    game.lives--;
    p.invuln = 1.8;
    game.shake = 0.35;
    burst(p.x, p.y - T * 0.2, 14, 'heart', ['#c9b6ba', COLORS.rose], 1.2);
    Sound.hit();
    if (game.lives <= 0) {
      game.mode = 'dying';
      game.stateT = 0;
      Sound.lose();
    }
    updateHud();
  }

  function startKiss() {
    const p = game.player;
    game.mode = 'kiss';
    game.stateT = 0;
    game.kiss = {
      fromX: p.x,
      fromY: p.y,
      toX: game.groom.x - T * 0.32,
      toY: game.groom.y,
      popped: false
    };
  }

  function updateKiss(dt) {
    const k = game.kiss;
    const p = game.player;
    const t = (game.stateT += dt);
    const a = easeInOut(Math.min(1, t / 0.6));
    p.x = lerp(k.fromX, k.toX, a);
    p.y = lerp(k.fromY, k.toY, a);
    p.moving = t < 0.6;
    if (p.moving) p.walk += dt * 14;
    if (t > 0.85 && !k.popped) {
      k.popped = true;
      Sound.win();
      burst(game.groom.x - T * 0.16, game.groom.y - T * 0.5, 30, 'heart', [COLORS.rose, '#f4b6c2', '#ffffff'], 1.4);
      burst(game.groom.x, game.groom.y, 60, 'confetti', COLORS.confetti, 1.6);
      confettiRain(120);
    }
    if (k.popped && Math.random() < 0.25) {
      burst(game.groom.x - T * 0.16 + rand(-8, 8), game.groom.y - T * 0.55, 1, 'heart', [COLORS.rose, '#f4b6c2'], 0.5);
    }
    if (t >= 3.0) finishLevel();
  }

  function finishLevel() {
    game.mode = 'won';
    const n = Math.min(6 + game.level, 15);
    const par = 15 + n * n * 0.25;
    const timeBonus = Math.max(0, Math.round((par - game.time) * 10));
    const livesBonus = game.lives * 150;
    const levelBonus = game.level * 250;
    const heartPts = game.heartsGot * 100;
    game.score += timeBonus + livesBonus + levelBonus;
    saveBest();
    $('winStats').innerHTML = `
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
      <dt>Hearts collected</dt><dd>${game.heartsGot} / ${game.heartsTotal}</dd>
      <dt>Time</dt><dd>${fmtTime(game.time)}</dd>
      <dt class="total">Score</dt><dd class="total">${game.score}</dd>
      <dt>Best</dt><dd>${game.best}</dd>`;
    showScreen('lose');
  }

  function newGame() {
    Sound.init();
    Sound.start();
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
    buildLevel(1);
    showBest();
    showScreen('start');
  }

  function beginPlay() {
    clearInput();
    hideScreens();
    game.mode = 'play';
  }

  function togglePause() {
    if (game.mode === 'play') {
      game.prevMode = game.mode;
      game.mode = 'paused';
      clearInput();
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
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    game.clock += dt;
    const mode = game.mode;
    if (mode === 'paused') return;

    if (mode === 'menu' || mode === 'play' || mode === 'dying') {
      for (const ob of game.obstacles) ob.update(dt);
    }

    if (mode === 'play') {
      game.time += dt;
      updatePlayer(dt);
      const p = game.player;

      for (const h of game.hearts) {
        if (!h.got && Math.hypot(h.x - p.x, h.y - p.y) < p.r + T * 0.25) {
          h.got = true;
          game.heartsGot++;
          game.score += 100;
          burst(h.x, h.y, 8, 'heart', [COLORS.rose, '#f4b6c2'], 0.7);
          burst(h.x, h.y, 8, 'spark', [COLORS.goldLight, '#ffffff']);
          Sound.pickup();
        }
      }

      if (p.invuln <= 0) {
        for (const ob of game.obstacles) {
          if (ob.harmful && dist(p, ob) < p.r * 0.8 + ob.hitR) {
            hurt();
            break;
          }
        }
      }

      if (game.mode === 'play' && dist(p, game.groom) < T * 0.75) startKiss();
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

  let hudCache = {};
  function updateHud(force) {
    const vals = {
      level: String(game.level),
      time: fmtTime(game.time),
      hearts: `${game.heartsGot} / ${game.heartsTotal}`,
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
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function render() {
    if (!game.maze) return;
    const t = game.clock;
    let sx = 0;
    let sy = 0;
    if (game.shake > 0) {
      const k = game.shake * 14 * view.dpr;
      sx = rand(-k, k);
      sy = rand(-k, k);
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

    // chuppah & groom
    const g = game.groom;
    drawChuppah(ctx, g.x, g.y, t);

    const kissing = game.mode === 'kiss' || game.mode === 'won';
    const k = game.kiss;
    const leanT = kissing && k ? clamp((game.stateT - 0.55) / 0.3, 0, 1) : 0;
    const leanAmt = game.mode === 'won' ? 1 : leanT;
    drawGroom(ctx, g.x + (kissing ? T * 0.05 : 0), g.y, {
      bob: kissing ? 0 : Math.sin(t * 2) * 0.8,
      lean: -0.2 * leanAmt
    });

    // obstacles (sorted by y for a little depth)
    const obs = game.obstacles.slice().sort((a, b) => a.y - b.y);
    for (const ob of obs) ob.draw(ctx);

    // bride
    const p = game.player;
    let alpha = 1;
    if (p.invuln > 0 && game.mode === 'play') alpha = Math.sin(t * 30) > 0 ? 1 : 0.35;
    if (game.mode === 'dying') alpha = Math.max(0, 1 - game.stateT / 1.2);
    drawBride(ctx, p.x, p.y, {
      bob: p.moving ? Math.abs(Math.sin(p.walk)) * -2 : 0,
      lean: kissing ? 0.2 * leanAmt : 0,
      alpha
    });

    // kiss heart
    if (kissing && k && k.popped) {
      const kt = game.mode === 'won' ? 2 : game.stateT - 0.85;
      const sc = kt < 0.4 ? easeOutBack(kt / 0.4) : 1 + Math.sin(kt * 6) * 0.05;
      ctx.fillStyle = COLORS.rose;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      heartPath(ctx, g.x - T * 0.12, g.y - T * 0.78, T * 0.7 * sc);
      ctx.fill();
      ctx.stroke();
    }

    drawParticles(ctx);
  }

  function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
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
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  function clearInput() {
    input.up = input.down = input.left = input.right = false;
    document.querySelectorAll('.dp.active').forEach((b) => b.classList.remove('active'));
  }

  window.addEventListener('keydown', (e) => {
    const dir = KEYMAP[e.code];
    if (dir) {
      if (game.mode === 'play') e.preventDefault();
      input[dir] = true;
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
    const dir = KEYMAP[e.code];
    if (dir) input[dir] = false;
  });

  window.addEventListener('blur', () => {
    clearInput();
    if (game.mode === 'play') togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'play') togglePause();
  });

  // Touch D-pad
  const isTouch = 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (isTouch) document.body.classList.add('touch');
  document.querySelectorAll('.dp').forEach((btn) => {
    const dir = btn.dataset.dir;
    const on = (e) => { e.preventDefault(); input[dir] = true; btn.classList.add('active'); };
    const off = (e) => { e.preventDefault(); input[dir] = false; btn.classList.remove('active'); };
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

  $('btnStart').addEventListener('click', newGame);
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
  // Boot: show an animated preview maze behind the start screen
  // ---------------------------------------------------------------------------
  buildLevel(1);
  showBest();
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
})();
