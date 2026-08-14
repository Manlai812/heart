(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const phaseLabel = document.getElementById('phase-label');
  let W, H, DPR;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------- CONFIG ----------------
  const PALETTES = [
    ["#ff6c9c", "#ff9ab8", "#ffd1dc", "#ffb3c6", "#ff4d7e"],
    ["#00f5d4", "#7ad0ff", "#b9e6c9", "#00bbf9", "#5eead4"],
    ["#ffd479", "#ff9f1c", "#ffe8a3", "#f6b93b", "#ffcf70"],
    ["#c084fc", "#f0abfc", "#e879f9", "#d8b4fe", "#a78bfa"],
  ];
  let paletteIndex = 0;

  const WORD = "I love you";
  const RINGS = [10, 11, 12, 13, 14, 15, 16, 17];  // more rings = denser, more "filled" heart
  const POINTS_PER_RING = 70;                       // more words per ring = solid outline
  const FONT_SIZE_BASE = 9.5;

  const DURATIONS = {
    entry: 2600,
    hold: 3400,
    outro: 1600,
  };
  // -----------------------------------------

  function heartPoint(angle, ringScale) {
    const x = 16 * Math.pow(Math.sin(angle), 3);
    const y = (13 * Math.cos(angle) - 5 * Math.cos(2 * angle)
              - 2 * Math.cos(3 * angle) - Math.cos(4 * angle));
    return { x: x * ringScale, y: -y * ringScale }; // flip y for canvas
  }

  // Precompute point list with stable ordering for the entry "typewriter" reveal
  function buildPoints() {
    const pts = [];
    let order = 0;
    for (let r = 0; r < RINGS.length; r++) {
      const ringScale = RINGS[r];
      for (let i = 0; i < POINTS_PER_RING; i++) {
        const angle = (i / POINTS_PER_RING) * Math.PI * 2;
        const p1 = heartPoint(angle, ringScale);
        const p2 = heartPoint(angle + 0.02, ringScale);
        const tangent = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        pts.push({
          angle,
          ring: r,
          ringScale,
          baseX: p1.x,
          baseY: p1.y,
          rot: tangent,
          order: order++,
          twinklePhase: Math.random() * Math.PI * 2,
          color: PALETTES[paletteIndex][(r + i) % PALETTES[paletteIndex].length],
        });
      }
    }
    return pts;
  }

  let points = buildPoints();
  const TOTAL = points.length;

  function refreshColors() {
    for (const p of points) {
      p.color = PALETTES[paletteIndex][(p.ring + Math.floor(p.angle * 10)) % PALETTES[paletteIndex].length];
    }
  }

  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  // ---------------- Phase machine ----------------
  let phase = 'entry';
  let phaseStart = null;
  let paused = false;
  let globalRotation = 0;

  function setPhase(name, now) {
    phase = name;
    phaseStart = now;
    phaseLabel.textContent = name.charAt(0).toUpperCase() + name.slice(1);
  }

  // ---------------- Click bursts (mini floating hearts) ----------------
  let bursts = [];
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    for (let i = 0; i < 6; i++) {
      bursts.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy,
        vy: -0.3 - Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.3,
        born: performance.now(),
        life: 1400 + Math.random() * 600,
        color: PALETTES[paletteIndex][i % PALETTES[paletteIndex].length],
      });
    }
  });

  function drawBursts(now) {
    bursts = bursts.filter(b => now - b.born < b.life);
    ctx.font = `11px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of bursts) {
      const t = (now - b.born) / b.life;
      const x = b.x + b.vx * (now - b.born) * 0.06;
      const y = b.y + b.vy * (now - b.born) * 0.06;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = b.color;
      ctx.fillText("I love you", x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- Main draw ----------------
  function draw(now) {
    ctx.fillStyle = 'rgba(5,5,10,0.30)';
    ctx.fillRect(0, 0, W, H);

    if (!phaseStart) phaseStart = now;
    const elapsed = now - phaseStart;

    if (phase === 'entry' && elapsed > DURATIONS.entry + 400) {
      setPhase('hold', now);
    } else if (phase === 'hold' && elapsed > DURATIONS.hold) {
      setPhase('outro', now);
    } else if (phase === 'outro' && elapsed > DURATIONS.outro) {
      setPhase('entry', now);
    }

    const cx = W / 2, cy = H / 2;
    // Raw heart coordinates span roughly ±(16*17)=272 units at the outer ring,
    // so this scale factor sizes the whole heart to ~55% of the smaller viewport edge.
    const baseUnit = (Math.min(W, H) * 0.55) / 550;
    globalRotation += 0.0006;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const p of points) {
      let alpha = 1, scale = 1, extraY = 0;

      if (phase === 'entry') {
        const revealAt = (p.order / TOTAL) * DURATIONS.entry;
        const local = elapsed - revealAt;
        if (local < 0) { continue; }
        const prog = Math.min(local / 260, 1);
        alpha = prog;
        scale = easeOutBack(prog);
      } else if (phase === 'hold') {
        const twinkle = 0.85 + 0.15 * Math.sin(now * 0.002 + p.twinklePhase);
        alpha = twinkle;
        scale = 1 + 0.02 * Math.sin(now * 0.0015 + p.twinklePhase);
      } else if (phase === 'outro') {
        const prog = easeInOutSine(Math.min(elapsed / DURATIONS.outro, 1));
        alpha = 1 - prog;
        scale = 1 - prog * 0.4;
        extraY = prog * 40 * (p.ring + 1) / RINGS.length;
      }

      if (alpha <= 0.01) continue;

      const rx = p.baseX * baseUnit;
      const ry = p.baseY * baseUnit;
      const cosR = Math.cos(globalRotation), sinR = Math.sin(globalRotation);
      const wx = rx * cosR - ry * sinR;
      const wy = rx * sinR + ry * cosR;

      ctx.save();
      ctx.translate(cx + wx, cy + wy + extraY);
      ctx.rotate(p.rot + globalRotation);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.font = `${FONT_SIZE_BASE}px 'Courier New', monospace`;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.fillText(WORD, 0, 0);
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    drawBursts(now);
  }

  function loop(now) {
    if (!paused) draw(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------------- Controls ----------------
  document.getElementById('btn-replay').addEventListener('click', () => {
    setPhase('entry', performance.now());
  });

  document.getElementById('btn-palette').addEventListener('click', () => {
    paletteIndex = (paletteIndex + 1) % PALETTES.length;
    refreshColors();
  });

  const pauseBtn = document.getElementById('btn-pause');
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Play' : 'Pause';
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paused = true;
  }
})();
