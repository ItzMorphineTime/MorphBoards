/*
 * MorphBoards demo content.
 *
 * Evaluated inside a page served by a throwaway MorphBoards server (see
 * capture.mjs). Paints procedural reference plates on <canvas>, uploads them
 * through the public API and builds a set of virtual-production boards for a
 * fictional short film, "Meridian". Every random choice is seeded, so each run
 * produces identical boards.
 */
(() => {
  const FONT = '"Montserrat Variable", Montserrat, "Segoe UI", sans-serif';
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const TAU = Math.PI * 2;
  const PLATE_W = 1600;
  const PLATE_H = 900;

  // ================================================================ basics

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function linear(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  function radial(ctx, x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  function stars(ctx, W, rnd, { count, maxY, alpha = 1 }) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * W;
      const y = rnd() * maxY;
      const a = alpha * (1 - y / maxY) * (0.25 + rnd() * 0.75);
      const r = rnd() < 0.06 ? 1.7 : 0.5 + rnd() * 0.8;
      ctx.fillStyle = `rgba(255,248,235,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  function vignette(ctx, W, H, strength = 0.45) {
    ctx.fillStyle = (() => {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${strength})`);
      return g;
    })();
    ctx.fillRect(0, 0, W, H);
  }

  /** Burned-in slate, the way plates come back from the VAD team. */
  function slate(ctx, W, H, left, right) {
    ctx.fillStyle = linear(ctx, 0, H * 0.8, 0, H, [
      [0, 'rgba(0,0,0,0)'],
      [1, 'rgba(0,0,0,0.5)'],
    ]);
    ctx.fillRect(0, H * 0.8, W, H * 0.2);
    const size = Math.round(H * 0.022);
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.letterSpacing = `${(size * 0.16).toFixed(1)}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText(left, W * 0.028, H * 0.952);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.56)';
    ctx.fillText(right, W * 0.972, H * 0.952);
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0px';
  }

  /** Midpoint-displacement mountain profile. */
  function ridgePoints(W, rnd, { base, amp, rough = 0.55, iterations = 8 }) {
    let pts = [
      [-20, base - amp * (0.2 + rnd() * 0.6)],
      [W + 20, base - amp * (0.2 + rnd() * 0.6)],
    ];
    let disp = amp;
    for (let it = 0; it < iterations; it++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        next.push([(x0 + x1) / 2, (y0 + y1) / 2 + (rnd() - 0.5) * disp], [x1, y1]);
      }
      pts = next;
      disp *= rough;
    }
    return pts;
  }

  function fillProfile(ctx, pts, bottom, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], bottom);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[pts.length - 1][0], bottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function strokeProfile(ctx, pts, stroke, width) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function cloakedFigure(ctx, x, ground, h, color, { staff = true, windy = 0 } = {}) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.19 - windy * h * 0.3, ground);
    ctx.quadraticCurveTo(x - h * 0.17 - windy * h * 0.28, ground - h * 0.5, x - h * 0.08, ground - h * 0.8);
    ctx.lineTo(x + h * 0.08, ground - h * 0.8);
    ctx.quadraticCurveTo(x + h * 0.14, ground - h * 0.45, x + h * 0.2, ground);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, ground - h * 0.87, h * 0.085, h * 0.1, 0, 0, TAU);
    ctx.fill();
    if (staff) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, h * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + h * 0.26, ground + h * 0.01);
      ctx.lineTo(x + h * 0.31, ground - h * 1.02);
      ctx.stroke();
    }
  }

  function umbrellaFigure(ctx, x, ground, h, color, rim) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.13, ground);
    ctx.lineTo(x - h * 0.1, ground - h * 0.62);
    ctx.lineTo(x + h * 0.1, ground - h * 0.62);
    ctx.lineTo(x + h * 0.13, ground);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, ground - h * 0.71, h * 0.08, 0, TAU);
    ctx.fill();
    const canopy = () => {
      ctx.beginPath();
      ctx.moveTo(x - h * 0.42, ground - h * 0.84);
      ctx.quadraticCurveTo(x, ground - h * 1.2, x + h * 0.42, ground - h * 0.84);
    };
    canopy();
    ctx.closePath();
    ctx.fill();
    if (rim) {
      canopy();
      ctx.strokeStyle = rim;
      ctx.lineWidth = Math.max(1, h * 0.022);
      ctx.stroke();
    }
  }

  // ======================================================= desert (SH010)

  const DESERT = {
    dusk: {
      sky: [
        [0, '#0b0822'],
        [0.28, '#231345'],
        [0.52, '#5e2a66'],
        [0.7, '#b8506a'],
        [0.86, '#ef8a5e'],
        [1, '#ffc98a'],
      ],
      night: true,
      sun: '#fff1d8',
      sunGlow: ['rgba(255,226,186,0.9)', 'rgba(255,196,140,0.55)', 'rgba(255,140,100,0.2)'],
      cloud: 'rgba(255,150,150,0.13)',
      far: 'rgba(164,80,110,0.92)',
      mid: '#5a2553',
      near: '#2c1130',
      plain: ['#3a1733', '#1d0b1c'],
      haze: 'rgba(255,170,130,0.32)',
      duneA: ['#3e1c30', '#170a16', 'rgba(255,172,122,0.55)'],
      duneB: ['#1d0d19', '#060308', 'rgba(255,150,110,0.3)'],
      figure: '#050208',
      beacon: true,
    },
    noon: {
      sky: [
        [0, '#23579e'],
        [0.5, '#6fa2d6'],
        [0.85, '#bcd6ec'],
        [1, '#f1e2c4'],
      ],
      night: false,
      sun: '#ffffff',
      sunGlow: ['rgba(255,255,245,0.95)', 'rgba(255,250,230,0.5)', 'rgba(255,245,220,0.12)'],
      cloud: 'rgba(255,255,255,0.3)',
      far: 'rgba(214,164,126,0.92)',
      mid: '#b8703f',
      near: '#8a4a2a',
      plain: ['#c98a55', '#9c6035'],
      haze: 'rgba(255,240,222,0.4)',
      duneA: ['#dba06a', '#b0703f', 'rgba(255,238,205,0.7)'],
      duneB: ['#a9643a', '#6e3a1f', 'rgba(255,222,184,0.45)'],
      figure: '#241208',
      beacon: false,
    },
  };

  function mesa(ctx, x, base, w, h, color, rnd) {
    const s = Math.min(w * 0.2, 18 + rnd() * 26);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.9, base + 1);
    ctx.quadraticCurveTo(x - s * 0.1, base - h * 0.1, x + s * 0.25, base - h * 0.42);
    ctx.lineTo(x + s * 0.45, base - h * 0.62);
    ctx.lineTo(x + s * 0.62, base - h * 0.64);
    ctx.lineTo(x + s * 0.8, base - h);
    const steps = 4 + Math.floor(rnd() * 4);
    for (let i = 1; i < steps; i++) {
      ctx.lineTo(x + s * 0.8 + (w - s * 1.6) * (i / steps), base - h + (rnd() - 0.5) * h * 0.05);
    }
    ctx.lineTo(x + w - s * 0.8, base - h);
    ctx.lineTo(x + w - s * 0.55, base - h * 0.72);
    ctx.lineTo(x + w - s * 0.35, base - h * 0.68);
    ctx.quadraticCurveTo(x + w + s * 0.1, base - h * 0.12, x + w + s * 0.9, base + 1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function mesaRange(ctx, W, H, rnd, { base, minH, maxH, color, spacing = 1 }) {
    let x = -80 + rnd() * 80;
    while (x < W + 80) {
      const w = 110 + rnd() * 300;
      mesa(ctx, x, base, w, minH + rnd() * (maxH - minH), color, rnd);
      x += w + (60 + rnd() * 260) * spacing;
    }
    ctx.fillStyle = color;
    ctx.fillRect(-10, base, W + 20, H - base + 10);
  }

  function duneY(W, x, d) {
    return (
      d.y +
      Math.sin((x / W) * TAU * d.f1 + d.p) * d.amp +
      Math.sin((x / W) * TAU * d.f2 + d.p * 1.7) * d.amp * 0.35
    );
  }

  function dune(ctx, W, H, d, [top, bottom, rim]) {
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 5) ctx.lineTo(x, duneY(W, x, d));
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, d.y - d.amp, 0, H, [
      [0, top],
      [1, bottom],
    ]);
    ctx.fill();
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += 5) {
      const y = duneY(W, x, d);
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.5, H * 0.0028);
    ctx.stroke();
  }

  function paintDesert(ctx, W, H, o = {}) {
    const p = DESERT[o.palette ?? 'dusk'];
    const rnd = rng(o.seed ?? 11);
    const horizon = H * 0.64;

    ctx.fillStyle = linear(ctx, 0, 0, 0, horizon, p.sky);
    ctx.fillRect(0, 0, W, H);
    if (p.night) stars(ctx, W, rnd, { count: 320, maxY: horizon * 0.62 });

    // wispy clouds lit from below
    for (let i = 0; i < 7; i++) {
      const cx = rnd() * W;
      const cy = horizon * (0.42 + rnd() * 0.4);
      const rx = W * (0.07 + rnd() * 0.16);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = p.cloud;
        ctx.beginPath();
        ctx.ellipse(cx + (rnd() - 0.5) * rx * 0.6, cy + (rnd() - 0.5) * H * 0.012, rx * (0.5 + rnd() * 0.5), H * (0.004 + rnd() * 0.008), 0, 0, TAU);
        ctx.fill();
      }
    }

    // sun, sitting low enough to be clipped by the mesa in front of it
    const sx = W * (p.night ? 0.69 : 0.72);
    const sy = p.night ? horizon - H * 0.085 : H * 0.18;
    ctx.fillStyle = radial(ctx, sx, sy, H * 0.75, [
      [0, p.sunGlow[0]],
      [0.07, p.sunGlow[1]],
      [0.28, p.sunGlow[2]],
      [1, 'rgba(255,120,100,0)'],
    ]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, H * (p.night ? 0.05 : 0.035), 0, TAU);
    ctx.fill();

    mesaRange(ctx, W, H, rng(3), { base: horizon, minH: H * 0.03, maxH: H * 0.1, color: p.far, spacing: 0.7 });
    ctx.fillStyle = linear(ctx, 0, horizon - H * 0.12, 0, horizon + H * 0.02, [
      [0, 'rgba(0,0,0,0)'],
      [1, p.haze],
    ]);
    ctx.fillRect(0, horizon - H * 0.12, W, H * 0.14);

    const midBase = horizon + H * 0.03;
    mesaRange(ctx, W, H, rng(7), { base: midBase, minH: H * 0.05, maxH: H * 0.15, color: p.mid, spacing: 1.2 });
    mesa(ctx, W * 0.6, midBase, W * 0.2, H * 0.07, p.mid, rng(8));

    // a distant relay spire, beacon lit at dusk
    ctx.fillStyle = p.mid;
    ctx.beginPath();
    ctx.moveTo(W * 0.185, midBase);
    ctx.lineTo(W * 0.193, midBase - H * 0.27);
    ctx.lineTo(W * 0.2, midBase);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(W * 0.176, midBase - H * 0.09, W * 0.034, H * 0.012);
    if (p.beacon) {
      ctx.fillStyle = radial(ctx, W * 0.193, midBase - H * 0.272, H * 0.03, [
        [0, 'rgba(255,70,70,0.95)'],
        [1, 'rgba(255,40,40,0)'],
      ]);
      ctx.fillRect(W * 0.16, midBase - H * 0.31, W * 0.07, H * 0.08);
    }

    mesaRange(ctx, W, H, rng(19), { base: horizon + H * 0.07, minH: H * 0.02, maxH: H * 0.07, color: p.near, spacing: 1.6 });
    ctx.fillStyle = linear(ctx, 0, horizon + H * 0.07, 0, H, [
      [0, p.plain[0]],
      [1, p.plain[1]],
    ]);
    ctx.fillRect(0, horizon + H * 0.07, W, H);

    const duneA = { y: H * 0.8, amp: H * 0.03, f1: 0.9, f2: 2.3, p: 1.3 };
    dune(ctx, W, H, duneA, p.duneA);

    // the traveler, shadow thrown away from the sun
    const tx = W * 0.33;
    const ground = duneY(W, tx, duneA);
    ctx.save();
    ctx.globalAlpha = p.night ? 0.5 : 0.3;
    ctx.fillStyle = p.figure;
    ctx.beginPath();
    ctx.ellipse(tx - H * 0.13, ground + H * 0.004, H * 0.14, H * 0.006, -0.02, 0, TAU);
    ctx.fill();
    ctx.restore();
    cloakedFigure(ctx, tx, ground, H * 0.09, p.figure);

    dune(ctx, W, H, { y: H * 0.92, amp: H * 0.02, f1: 0.7, f2: 1.9, p: 4.1 }, p.duneB);
    vignette(ctx, W, H, p.night ? 0.5 : 0.25);
  }

  // ======================================================= canyon (SH020)

  const CANYON = {
    warm: {
      sky: [
        [0, '#fff3d6'],
        [0.35, '#f6be7c'],
        [0.7, '#d0703f'],
        [1, '#5a2414'],
      ],
      glow: 'rgba(255,236,200,0.85)',
      walls: ['rgba(190,100,62,0.94)', '#7a3219', '#2a0f07'],
      strata: ['rgba(255,210,160,0.13)', 'rgba(255,180,130,0.1)', 'rgba(255,150,100,0.08)'],
      floor: ['#3d170b', '#120604'],
      dust: 'rgba(255,214,168,',
      rays: 'rgba(255,226,180,',
      rider: '#120704',
    },
    dusk: {
      sky: [
        [0, '#f2d0e6'],
        [0.35, '#c98fc0'],
        [0.7, '#7b4d8f'],
        [1, '#2a1638'],
      ],
      glow: 'rgba(255,220,240,0.8)',
      walls: ['rgba(134,86,140,0.94)', '#4a2a5a', '#1a0d22'],
      strata: ['rgba(255,210,240,0.12)', 'rgba(240,180,230,0.09)', 'rgba(220,160,220,0.07)'],
      floor: ['#2c1633', '#0c0510'],
      dust: 'rgba(240,200,235,',
      rays: 'rgba(255,220,245,',
      rider: '#0b050e',
    },
  };

  function canyonWalls(ctx, W, H, rnd, { gapL, gapR, color, strata, jag, lean, floor }) {
    for (const side of [-1, 1]) {
      // rock faces: a mean-reverting walk plus slow undulation, broken into
      // ledges, instead of per-step jitter
      const pts = [];
      const steps = 44;
      let walk = 0;
      const phase = rnd() * TAU;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = t * H * floor;
        const edge = side < 0 ? gapL - lean * t : gapR + lean * t;
        walk = walk * 0.8 + (rnd() - 0.5) * jag * 0.9;
        const n = walk + Math.sin(t * 6 + phase) * jag * 0.8 + Math.sin(t * 17 + phase * 2) * jag * 0.25;
        const x = (edge + (side < 0 ? n : -n)) * W;
        if (i > 0 && rnd() < 0.3) pts.push([x, y - H * floor * 0.008]);
        pts.push([x, y]);
      }
      ctx.beginPath();
      ctx.moveTo(side < 0 ? -2 : W + 2, -2);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(side < 0 ? -2 : W + 2, H * floor);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.strokeStyle = strata;
      ctx.lineWidth = Math.max(1, H * 0.004);
      for (let k = 0; k < 16; k++) {
        const y0 = H * (0.05 + k * 0.052) + (rnd() - 0.5) * H * 0.02;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 16) {
          const y = y0 + Math.sin(x * 0.012 + k) * H * 0.005 + (side < 0 ? x : W - x) * 0.018;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function paintCanyon(ctx, W, H, o = {}) {
    const p = CANYON[o.palette ?? 'warm'];
    const rnd = rng(o.seed ?? 5);

    ctx.fillStyle = linear(ctx, 0, 0, 0, H, p.sky);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(ctx, W * 0.5, H * 0.4, H * 0.62, [
      [0, p.glow],
      [0.45, 'rgba(255,190,120,0.2)'],
      [1, 'rgba(255,160,100,0)'],
    ]);
    ctx.fillRect(0, 0, W, H);

    // light shafts through the slot above
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x0 = W * (0.45 + rnd() * 0.1);
      const spread = W * (0.06 + rnd() * 0.1);
      const drift = W * 0.16 * (rnd() - 0.5);
      ctx.fillStyle = `${p.rays}${(0.018 + rnd() * 0.025).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x0 - W * 0.008, 0);
      ctx.lineTo(x0 + W * 0.008, 0);
      ctx.lineTo(x0 + spread + drift, H);
      ctx.lineTo(x0 - spread + drift, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const layers = [
      { gapL: 0.43, gapR: 0.57, jag: 0.012, lean: 0.03, floor: 0.8 },
      { gapL: 0.35, gapR: 0.66, jag: 0.022, lean: 0.07, floor: 0.84 },
      { gapL: 0.18, gapR: 0.82, jag: 0.032, lean: 0.12, floor: 0.9 },
    ];
    layers.forEach((l, i) => {
      if (i === 2) {
        // canyon floor receding into haze, drawn before the near walls
        ctx.fillStyle = linear(ctx, 0, H * 0.72, 0, H, [
          [0, p.floor[0]],
          [1, p.floor[1]],
        ]);
        ctx.fillRect(0, H * 0.72, W, H * 0.28);
        ctx.fillStyle = linear(ctx, 0, H * 0.7, 0, H * 0.8, [
          [0, `${p.dust}0.38)`],
          [1, `${p.dust}0)`],
        ]);
        ctx.fillRect(0, H * 0.7, W, H * 0.1);
        for (let k = 0; k < 26; k++) {
          const ry = H * (0.75 + rnd() * 0.24);
          const depth = (ry - H * 0.72) / (H * 0.28);
          ctx.fillStyle = `rgba(0,0,0,${(0.25 + depth * 0.35).toFixed(2)})`;
          ctx.beginPath();
          ctx.ellipse(W * (0.28 + rnd() * 0.44), ry, H * 0.012 * (0.4 + depth * 2), H * 0.005 * (0.4 + depth * 2), 0, 0, TAU);
          ctx.fill();
        }

        // speeder bike coming at the lens, dust plume trailing back
        const bx = W * 0.44;
        const by = H * 0.815;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let k = 0; k < 48; k++) {
          const t = k / 48;
          ctx.fillStyle = `${p.dust}${(0.2 * (1 - t) ** 1.4).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(
            bx + W * 0.1 * t + (rnd() - 0.5) * W * 0.015,
            by - H * 0.075 * t + (rnd() - 0.5) * H * 0.015,
            H * (0.028 - 0.016 * t) * (0.7 + rnd() * 0.6),
            0,
            TAU,
          );
          ctx.fill();
        }
        ctx.restore();
        const s = W * 0.05;
        ctx.fillStyle = p.rider;
        ctx.beginPath();
        ctx.moveTo(bx - s, by + s * 0.05);
        ctx.quadraticCurveTo(bx - s * 0.35, by - s * 0.5, bx + s * 0.9, by - s * 0.12);
        ctx.lineTo(bx + s, by + s * 0.1);
        ctx.quadraticCurveTo(bx, by + s * 0.25, bx - s, by + s * 0.05);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(bx - s * 0.05, by - s * 0.55, s * 0.13, s * 0.22, -0.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = radial(ctx, bx + s * 0.95, by, s * 0.5, [
          [0, 'rgba(255,190,110,0.95)'],
          [1, 'rgba(255,120,60,0)'],
        ]);
        ctx.fillRect(bx + s * 0.4, by - s * 0.5, s, s);
      }
      canyonWalls(ctx, W, H, rng(40 + i), { ...l, color: p.walls[i], strata: p.strata[i] });
    });
    vignette(ctx, W, H, 0.42);
  }

  // =================================================== neon market (SH030)

  const NEON = {
    magenta: {
      sky: [
        [0, '#04040a'],
        [0.45, '#0e0b24'],
        [0.85, '#2c1240'],
        [1, '#4c1a48'],
      ],
      horizonGlow: 'rgba(255,60,130,0.28)',
      far: '#0f0c20',
      mid: '#08070f',
      near: '#040308',
      windowsFar: ['rgba(255,196,120,0.55)', 'rgba(120,200,255,0.45)', 'rgba(255,120,180,0.4)'],
      windowsMid: ['rgba(255,190,120,0.6)', 'rgba(140,210,255,0.5)'],
      haze: 'rgba(170,70,160,0.3)',
      signA: '#ff2e55',
      signB: '#2ef2ff',
      signC: '#ffd23e',
      billboard: [
        [0, '#ff2e7a'],
        [1, '#5b2bff'],
      ],
      bulbs: 'rgba(255,196,120,',
      stall: 'rgba(255,170,80,',
      fog: 'rgba(170,110,220,',
    },
    teal: {
      sky: [
        [0, '#020609'],
        [0.45, '#06141d'],
        [0.85, '#0c2c36'],
        [1, '#12434a'],
      ],
      horizonGlow: 'rgba(40,220,210,0.24)',
      far: '#081820',
      mid: '#050d12',
      near: '#020507',
      windowsFar: ['rgba(140,255,230,0.45)', 'rgba(255,220,150,0.5)'],
      windowsMid: ['rgba(120,240,255,0.5)', 'rgba(255,210,140,0.55)'],
      haze: 'rgba(60,170,180,0.28)',
      signA: '#29ffc6',
      signB: '#b565ff',
      signC: '#ffcf4a',
      billboard: [
        [0, '#00d1c1'],
        [1, '#2440ff'],
      ],
      bulbs: 'rgba(210,255,240,',
      stall: 'rgba(120,255,220,',
      fog: 'rgba(80,200,210,',
    },
  };

  function buildings(ctx, W, rnd, o) {
    let x = -20;
    while (x < W + 20) {
      const w = o.minW + rnd() * (o.maxW - o.minW);
      if (rnd() < o.gapChance) {
        x += w * 0.6;
        continue;
      }
      const h = o.minH + rnd() * (o.maxH - o.minH);
      const top = o.base - h;
      ctx.fillStyle = o.color;
      ctx.fillRect(x, top, w, h + 2);
      if (rnd() < 0.35) ctx.fillRect(x + w * 0.2, top - h * 0.04, w * 0.25, h * 0.04);
      if (rnd() < 0.3) ctx.fillRect(x + w * 0.6, top - h * 0.14, 2, h * 0.14);
      const cols = Math.floor((w - 8) / 9);
      const rows = Math.floor((h - 10) / 13);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd() > o.winChance) continue;
          ctx.fillStyle = o.windows[Math.floor(rnd() * o.windows.length)];
          ctx.fillRect(x + 5 + c * 9, top + 8 + r * 13, 4, 6);
          ctx.fillStyle = o.color;
        }
      }
      x += w + (rnd() < 0.3 ? 4 : 0);
    }
  }

  function neonPath(ctx, color, width, build) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    build();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = width * 3.2;
    ctx.shadowBlur = width * 9;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = width;
    ctx.shadowBlur = width * 3.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = width * 0.34;
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }

  function neonText(ctx, text, x, y, size, color, align = 'left') {
    ctx.save();
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.letterSpacing = `${(size * 0.08).toFixed(1)}px`;
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.9;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = size * 0.2;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.globalAlpha = 0.7;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function paintNeon(ctx, W, H, o = {}) {
    const p = NEON[o.palette ?? 'magenta'];
    const rnd = rng(o.seed ?? 21);
    const street = H * 0.7;

    ctx.fillStyle = linear(ctx, 0, 0, 0, street, p.sky);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(ctx, W * 0.5, street, W * 0.6, [
      [0, p.horizonGlow],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(0, 0, W, H);

    buildings(ctx, W, rng(2), {
      base: street,
      minH: H * 0.22,
      maxH: H * 0.55,
      minW: 40,
      maxW: 120,
      color: p.far,
      windows: p.windowsFar,
      winChance: 0.16,
      gapChance: 0.08,
    });
    ctx.fillStyle = linear(ctx, 0, street - H * 0.4, 0, street, [
      [0, 'rgba(0,0,0,0)'],
      [1, p.haze],
    ]);
    ctx.fillRect(0, street - H * 0.4, W, H * 0.4);

    buildings(ctx, W, rng(9), {
      base: street,
      minH: H * 0.3,
      maxH: H * 0.64,
      minW: 70,
      maxW: 170,
      color: p.mid,
      windows: p.windowsMid,
      winChance: 0.07,
      gapChance: 0.4,
    });

    // rooftop billboard on the mid-rise block
    const bb = { x: W * 0.53, y: H * 0.1, w: W * 0.17, h: H * 0.14 };
    ctx.fillStyle = p.mid;
    ctx.fillRect(bb.x + bb.w * 0.15, bb.y + bb.h, W * 0.006, H * 0.12);
    ctx.fillRect(bb.x + bb.w * 0.8, bb.y + bb.h, W * 0.006, H * 0.12);
    ctx.save();
    ctx.fillStyle = linear(ctx, bb.x, bb.y, bb.x + bb.w, bb.y + bb.h, p.billboard);
    ctx.shadowColor = p.billboard[0][1];
    ctx.shadowBlur = 60;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(bb.x + bb.w * 0.2, bb.y + bb.h * 0.5, bb.h * 0.3, 0, TAU);
    ctx.fill();
    ctx.font = `700 ${Math.round(bb.h * 0.28)}px ${FONT}`;
    ctx.letterSpacing = `${(bb.h * 0.05).toFixed(1)}px`;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText('LUMEN', bb.x + bb.w * 0.4, bb.y + bb.h * 0.62);
    ctx.letterSpacing = '0px';

    // near blocks framing the street
    ctx.fillStyle = p.near;
    ctx.fillRect(0, H * 0.02, W * 0.2, street);
    ctx.fillRect(W * 0.8, H * 0.08, W * 0.2, street);
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(W * 0.2, H * (0.2 + i * 0.08), W * 0.015, H * 0.012);
      ctx.fillRect(W * 0.785, H * (0.24 + i * 0.07), W * 0.015, H * 0.012);
    }

    // everything that emits light — drawn again, mirrored, for the wet street
    const lights = (c) => {
      // vertical blade sign with stacked glyphs
      const vx = W * 0.125;
      const vy = H * 0.1;
      const vw = W * 0.045;
      const vh = H * 0.36;
      neonPath(c, p.signA, H * 0.006, () => {
        c.beginPath();
        c.roundRect(vx, vy, vw, vh, 8);
      });
      for (let g = 0; g < 4; g++) {
        const gy = vy + vh * (0.1 + g * 0.22);
        neonPath(c, p.signA, H * 0.005, () => {
          c.beginPath();
          c.moveTo(vx + vw * 0.25, gy);
          c.lineTo(vx + vw * 0.75, gy);
          c.moveTo(vx + vw * 0.5, gy);
          c.lineTo(vx + vw * 0.5, gy + vh * 0.12);
          if (g % 2) {
            c.moveTo(vx + vw * 0.28, gy + vh * 0.08);
            c.lineTo(vx + vw * 0.72, gy + vh * 0.08);
          } else {
            c.moveTo(vx + vw * 0.3, gy + vh * 0.12);
            c.lineTo(vx + vw * 0.7, gy + vh * 0.05);
          }
        });
      }
      neonText(c, 'NOODLES', W * 0.9, H * 0.31, Math.round(H * 0.052), p.signB, 'center');
      neonText(c, 'OPEN 24H', W * 0.9, H * 0.4, Math.round(H * 0.026), p.signC, 'center');
      neonPath(c, p.signB, H * 0.006, () => {
        c.beginPath();
        c.moveTo(W * 0.02, H * 0.56);
        c.lineTo(W * 0.17, H * 0.56);
      });
      neonPath(c, p.signC, H * 0.005, () => {
        c.beginPath();
        c.arc(W * 0.31, H * 0.34, H * 0.034, 0, TAU);
      });
      neonPath(c, p.signA, H * 0.004, () => {
        c.beginPath();
        c.moveTo(W * 0.64, H * 0.47);
        c.lineTo(W * 0.72, H * 0.47);
        c.moveTo(W * 0.64, H * 0.5);
        c.lineTo(W * 0.7, H * 0.5);
      });
      // festoon lights strung across the street
      for (let s = 0; s < 3; s++) {
        const y0 = H * (0.36 + s * 0.07);
        const y1 = H * (0.3 + s * 0.08);
        const sag = H * (0.07 + s * 0.02);
        const x0 = W * 0.2;
        const x1 = W * 0.8;
        c.strokeStyle = 'rgba(0,0,0,0.6)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1);
        c.stroke();
        for (let t = 0.02; t < 1; t += 0.035) {
          const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t * t * x1;
          const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * ((y0 + y1) / 2 + sag) + t * t * y1;
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = radial(c, bx, by + 2, H * 0.014, [
            [0, `${p.bulbs}0.9)`],
            [1, `${p.bulbs}0)`],
          ]);
          c.fillRect(bx - H * 0.015, by - H * 0.013, H * 0.03, H * 0.03);
          c.restore();
        }
      }
      // stall canopies throwing warm light
      for (let s = 0; s < 3; s++) {
        const sx = W * (0.28 + s * 0.16);
        const sw = W * 0.12;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = radial(c, sx + sw / 2, street - H * 0.02, W * 0.1, [
          [0, `${p.stall}0.45)`],
          [1, `${p.stall}0)`],
        ]);
        c.fillRect(sx - W * 0.05, street - H * 0.16, sw + W * 0.1, H * 0.2);
        c.restore();
      }
    };
    lights(ctx);

    // stalls (silhouettes over their own light)
    for (let s = 0; s < 3; s++) {
      const sx = W * (0.28 + s * 0.16);
      const sw = W * 0.12;
      ctx.fillStyle = '#07050c';
      ctx.beginPath();
      ctx.moveTo(sx - W * 0.012, street - H * 0.1);
      ctx.lineTo(sx + sw + W * 0.012, street - H * 0.1);
      ctx.lineTo(sx + sw, street - H * 0.125);
      ctx.lineTo(sx, street - H * 0.125);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(sx + W * 0.005, street - H * 0.045, sw - W * 0.01, H * 0.045);
      ctx.fillRect(sx, street - H * 0.1, W * 0.004, H * 0.1);
      ctx.fillRect(sx + sw - W * 0.004, street - H * 0.1, W * 0.004, H * 0.1);
    }

    // wet street with stretched reflections
    ctx.fillStyle = linear(ctx, 0, street, 0, H, [
      [0, '#0b0714'],
      [1, '#020104'],
    ]);
    ctx.fillRect(0, street, W, H - street);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, street, W, H - street);
    ctx.clip();
    ctx.translate(0, street);
    ctx.scale(1, -1.7);
    ctx.translate(0, -street);
    ctx.filter = 'blur(9px)';
    ctx.globalAlpha = 0.5;
    lights(ctx);
    ctx.restore();

    // pedestrians under umbrellas, rim-lit by the signs
    const walkers = [
      [0.24, 0.93, 0.19, p.signA],
      [0.39, 0.86, 0.14, p.signC],
      [0.55, 0.9, 0.16, p.signB],
      [0.68, 0.83, 0.12, p.signA],
      [0.77, 0.95, 0.2, p.signB],
    ];
    for (const [fx, fy, fh, rim] of walkers) umbrellaFigure(ctx, W * fx, H * fy, H * fh, '#030208', rim);

    // drifting fog and rain
    for (let f = 0; f < 5; f++) {
      ctx.fillStyle = radial(ctx, W * (0.1 + rnd() * 0.8), street - H * 0.04, W * 0.25, [
        [0, `${p.fog}0.12)`],
        [1, `${p.fog}0)`],
      ]);
      ctx.fillRect(0, street - H * 0.35, W, H * 0.5);
    }
    ctx.strokeStyle = 'rgba(210,225,255,0.09)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 900; i++) {
      const x = rnd() * W * 1.2;
      const y = rnd() * H;
      const len = H * (0.02 + rnd() * 0.035);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.22, y + len);
      ctx.stroke();
    }
    vignette(ctx, W, H, 0.55);
  }

  // =================================================== the overlook (SH040)

  const OVERLOOK = {
    blue: {
      sky: [
        [0, '#0d1b3d'],
        [0.35, '#27407a'],
        [0.62, '#7b8fc7'],
        [0.82, '#e9b3b1'],
        [1, '#f7d2b4'],
      ],
      stars: true,
      orb: '#f4f1ff',
      orbGlow: 'rgba(230,230,255,0.35)',
      orbX: 0.78,
      orbY: 0.18,
      ridges: [
        [0.56, 0.06, 'rgba(160,170,214,0.95)'],
        [0.62, 0.09, '#7d8fc2'],
        [0.68, 0.1, '#5a6aa0'],
        [0.75, 0.1, '#3c4a7e'],
        [0.83, 0.1, '#26315a'],
      ],
      mist: 'rgba(240,200,200,0.28)',
      city: 'rgba(255,214,150,',
      cliff: '#070a1a',
      rim: 'rgba(250,200,190,0.55)',
    },
    dawn: {
      sky: [
        [0, '#3b3f78'],
        [0.35, '#9a6c9c'],
        [0.62, '#f0a58a'],
        [0.82, '#ffd39a'],
        [1, '#fff1cf'],
      ],
      stars: false,
      orb: '#fff6e0',
      orbGlow: 'rgba(255,230,180,0.6)',
      orbX: 0.62,
      orbY: 0.52,
      ridges: [
        [0.56, 0.06, 'rgba(236,178,160,0.92)'],
        [0.62, 0.09, '#c98e8f'],
        [0.68, 0.1, '#946577'],
        [0.75, 0.1, '#634560'],
        [0.83, 0.1, '#3a2742'],
      ],
      mist: 'rgba(255,230,200,0.35)',
      city: 'rgba(255,236,190,',
      cliff: '#1a0f1f',
      rim: 'rgba(255,214,170,0.6)',
    },
  };

  function paintOverlook(ctx, W, H, o = {}) {
    const p = OVERLOOK[o.palette ?? 'blue'];
    const rnd = rng(o.seed ?? 31);

    ctx.fillStyle = linear(ctx, 0, 0, 0, H * 0.72, p.sky);
    ctx.fillRect(0, 0, W, H);
    if (p.stars) stars(ctx, W, rnd, { count: 180, maxY: H * 0.38, alpha: 0.85 });
    const ox = W * p.orbX;
    const oy = H * p.orbY;
    ctx.fillStyle = radial(ctx, ox, oy, H * 0.32, [
      [0, p.orbGlow],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.orb;
    ctx.beginPath();
    ctx.arc(ox, oy, H * 0.028, 0, TAU);
    ctx.fill();

    p.ridges.forEach(([base, amp, color], i) => {
      const pts = ridgePoints(W, rng(100 + i), { base: H * base, amp: H * amp });
      fillProfile(ctx, pts, H + 10, color);
      if (i < p.ridges.length - 1) {
        ctx.fillStyle = linear(ctx, 0, H * (base - 0.02), 0, H * (base + 0.1), [
          [0, 'rgba(0,0,0,0)'],
          [1, p.mist],
        ]);
        ctx.fillRect(0, H * (base - 0.02), W, H * 0.12);
      }
      if (i === 2) {
        // valley town, half hidden by the next ridge
        ctx.fillStyle = radial(ctx, W * 0.55, H * 0.71, W * 0.22, [
          [0, `${p.city}0.32)`],
          [1, `${p.city}0)`],
        ]);
        ctx.fillRect(0, H * 0.5, W, H * 0.4);
        for (let k = 0; k < 900; k++) {
          // denser toward the town centre
          const spread = rnd() ** 1.8 * (rnd() < 0.5 ? -1 : 1);
          const x = W * (0.55 + spread * 0.2);
          const y = H * (0.695 + (rnd() - 0.5) * 0.045 * (1 - Math.abs(spread)));
          ctx.fillStyle = `${p.city}${(0.45 + rnd() * 0.55).toFixed(2)})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    });

    // river catching the last light, widening toward the lens
    const river = (width, alpha) => {
      ctx.strokeStyle = linear(ctx, 0, H * 0.8, 0, H, [
        [0, p.mist.replace(/[\d.]+\)$/, '0)')],
        [1, p.mist.replace(/[\d.]+\)$/, `${alpha})`)],
      ]);
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W * 0.46, H + 20);
      ctx.bezierCurveTo(W * 0.56, H * 0.93, W * 0.45, H * 0.88, W * 0.55, H * 0.8);
      ctx.stroke();
    };
    river(H * 0.03, 0.4);
    river(H * 0.008, 0.85);

    // foreground cliff and the traveler on its edge
    const cliff = [
      [-10, H * 0.745],
      [W * 0.06, H * 0.735],
      [W * 0.14, H * 0.742],
      [W * 0.22, H * 0.75],
      [W * 0.28, H * 0.756],
      [W * 0.315, H * 0.77],
      [W * 0.33, H * 0.84],
      [W * 0.345, H * 0.92],
      [W * 0.36, H + 10],
    ];
    fillProfile(ctx, cliff, H + 10, p.cliff);
    ctx.save();
    ctx.beginPath();
    cliff.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.lineTo(-10, H + 10);
    ctx.closePath();
    ctx.fillStyle = p.cliff;
    ctx.fill();
    ctx.restore();
    strokeProfile(ctx, cliff.slice(0, 6), p.rim, Math.max(1.5, H * 0.0028));
    // the same traveler as SH010, cloak caught by the wind
    cloakedFigure(ctx, W * 0.24, H * 0.751, H * 0.15, p.cliff, { staff: true, windy: 0.45 });
    vignette(ctx, W, H, 0.4);
  }

  // ======================================================== ringed planet

  const PLANET = {
    amber: {
      space: [
        [0, '#02030a'],
        [0.6, '#0a1026'],
        [1, '#1a0f2e'],
      ],
      nebula: ['rgba(60,200,220,0.07)', 'rgba(220,60,160,0.07)'],
      body: [
        [0, '#f6d29a'],
        [0.35, '#d0804a'],
        [0.75, '#5a2310'],
        [1, '#140604'],
      ],
      bands: 'rgba(255,230,190,',
      atmos: 'rgba(255,190,130,0.5)',
      ring: 'rgba(245,215,170,',
      terrain: '#07060d',
      rim: 'rgba(255,180,120,0.5)',
    },
    ice: {
      space: [
        [0, '#020409'],
        [0.6, '#081628'],
        [1, '#0c2233'],
      ],
      nebula: ['rgba(90,160,255,0.08)', 'rgba(120,255,230,0.06)'],
      body: [
        [0, '#f2fbff'],
        [0.35, '#9cc8e6'],
        [0.75, '#2c5577'],
        [1, '#06121c'],
      ],
      bands: 'rgba(230,248,255,',
      atmos: 'rgba(170,220,255,0.55)',
      ring: 'rgba(210,235,255,',
      terrain: '#03070c',
      rim: 'rgba(160,210,255,0.5)',
    },
  };

  function paintPlanet(ctx, W, H, o = {}) {
    const p = PLANET[o.palette ?? 'amber'];
    const rnd = rng(o.seed ?? 51);

    ctx.fillStyle = linear(ctx, 0, 0, W * 0.3, H, p.space);
    ctx.fillRect(0, 0, W, H);
    for (const [i, color] of p.nebula.entries()) {
      ctx.fillStyle = radial(ctx, W * (0.65 + i * 0.15), H * (0.3 + i * 0.25), W * 0.35, [
        [0, color],
        [1, 'rgba(0,0,0,0)'],
      ]);
      ctx.fillRect(0, 0, W, H);
    }
    stars(ctx, W, rnd, { count: 520, maxY: H, alpha: 0.9 });

    const cx = W * 0.33;
    const cy = H * 0.4;
    const r = H * 0.28;
    const ring = (front) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.2);
      ctx.beginPath();
      if (front) ctx.rect(-r * 3, 0, r * 6, r * 3);
      else ctx.rect(-r * 3, -r * 3, r * 6, r * 3);
      ctx.clip();
      for (let k = 0; k < 6; k++) {
        ctx.strokeStyle = `${p.ring}${(0.12 + (k % 3) * 0.08).toFixed(2)})`;
        ctx.lineWidth = r * (0.03 + (k % 2) * 0.02);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (1.45 + k * 0.1), r * (0.3 + k * 0.02), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    };
    ring(false);
    ctx.fillStyle = (() => {
      const g = ctx.createRadialGradient(cx + r * 0.45, cy - r * 0.45, r * 0.05, cx, cy, r);
      for (const [off, color] of p.body) g.addColorStop(off, color);
      return g;
    })();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.clip();
    for (let b = 0; b < 9; b++) {
      ctx.strokeStyle = `${p.bands}${(0.05 + rnd() * 0.08).toFixed(3)})`;
      ctx.lineWidth = r * (0.03 + rnd() * 0.06);
      ctx.beginPath();
      const y = cy - r + (b + 0.5) * ((2 * r) / 9);
      for (let x = cx - r; x <= cx + r; x += 8) {
        const yy = y + Math.sin(x * 0.02 + b) * r * 0.02;
        if (x === cx - r) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.shadowColor = p.atmos;
    ctx.shadowBlur = r * 0.25;
    ctx.strokeStyle = p.atmos;
    ctx.lineWidth = r * 0.025;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.95, Math.PI * 0.15);
    ctx.stroke();
    ctx.restore();
    ring(true);

    const terrain = ridgePoints(W, rng(77), { base: H * 0.88, amp: H * 0.12, rough: 0.5 });
    fillProfile(ctx, terrain, H + 10, p.terrain);
    strokeProfile(ctx, terrain, p.rim, Math.max(1.5, H * 0.0028));

    // survey craft: a bright point with a fading contrail
    ctx.strokeStyle = linear(ctx, W * 0.56, 0, W * 0.74, 0, [
      [0, 'rgba(210,225,255,0)'],
      [1, 'rgba(210,225,255,0.5)'],
    ]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.56, H * 0.17);
    ctx.lineTo(W * 0.74, H * 0.225);
    ctx.stroke();
    ctx.fillStyle = radial(ctx, W * 0.74, H * 0.225, H * 0.014, [
      [0, 'rgba(255,255,255,1)'],
      [1, 'rgba(200,220,255,0)'],
    ]);
    ctx.fillRect(W * 0.72, H * 0.2, W * 0.04, H * 0.05);
    vignette(ctx, W, H, 0.45);
  }

  // ================================================ LED volume stage plan

  function paintStagePlan(ctx, W, H) {
    const deg = (d) => (d * Math.PI) / 180;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) {
      ctx.strokeStyle = x % 160 === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.03)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 32) {
      ctx.strokeStyle = y % 160 === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.03)';
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }

    const label = (text, x, y, { size = 21, color = 'rgba(255,255,255,0.72)', align = 'left', weight = 600, track = 0.12 } = {}) => {
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.letterSpacing = `${(size * track).toFixed(1)}px`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
    };

    const cx = W * 0.55;
    const cy = H * 0.97;
    const R = H * 0.68;
    const T = H * 0.03;
    const a0 = deg(206);
    const a1 = deg(334);
    const fr0 = deg(247);
    const fr1 = deg(293);
    const at = (a, r) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });

    // ceiling above the playing area
    ctx.setLineDash([12, 9]);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2;
    const ceil = { x: cx - R * 0.66, y: cy - R * 1.02, w: R * 1.32, h: R * 0.6 };
    ctx.strokeRect(ceil.x, ceil.y, ceil.w, ceil.h);
    ctx.setLineDash([]);
    label('CEILING 12 × 8 M', ceil.x + 16, ceil.y + 34, { size: 19, color: 'rgba(255,255,255,0.5)' });
    for (const [tx, ty] of [
      [ceil.x, ceil.y],
      [ceil.x + ceil.w, ceil.y],
      [ceil.x, ceil.y + ceil.h],
      [ceil.x + ceil.w, ceil.y + ceil.h],
      [ceil.x + ceil.w / 2, ceil.y],
    ]) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx - 8, ty);
      ctx.lineTo(tx + 8, ty);
      ctx.moveTo(tx, ty - 8);
      ctx.lineTo(tx, ty + 8);
      ctx.stroke();
    }

    // playing area floor
    ctx.fillStyle = radial(ctx, cx, cy, R, [
      [0, 'rgba(255,255,255,0.06)'],
      [1, 'rgba(255,255,255,0.01)'],
    ]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fill();

    // camera frustum onto the wall
    const cam = { x: cx - R * 0.04, y: cy - R * 0.3 };
    const fA = at(fr0, R);
    const fB = at(fr1, R);
    ctx.fillStyle = 'rgba(197,22,34,0.16)';
    ctx.beginPath();
    ctx.moveTo(cam.x, cam.y);
    ctx.lineTo(fA.x, fA.y);
    ctx.arc(cx, cy, R, fr0, fr1);
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([9, 7]);
    ctx.strokeStyle = 'rgba(255,92,99,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cam.x, cam.y);
    ctx.lineTo(fA.x, fA.y);
    ctx.moveTo(cam.x, cam.y);
    ctx.lineTo(fB.x, fB.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // LED wall, one tile per 2.4°
    const step = deg(2.4);
    for (let a = a0; a < a1 - 1e-6; a += step) {
      const b = Math.min(a + step * 0.88, a1);
      const inner = a >= fr0 - 1e-6 && b <= fr1 + 1e-6;
      const p0 = at(a, R);
      const p1 = at(a, R + T);
      const p2 = at(b, R + T);
      const p3 = at(b, R);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.save();
      if (inner) {
        ctx.fillStyle = '#c51622';
        ctx.shadowColor = 'rgba(197,22,34,0.9)';
        ctx.shadowBlur = 18;
      } else {
        ctx.fillStyle = '#2b2b2b';
      }
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = inner ? 'rgba(255,140,140,0.9)' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // dolly track and camera
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cam.x - 14, cam.y + 20);
    ctx.lineTo(cam.x - 14, cy + 10);
    ctx.moveTo(cam.x + 14, cam.y + 20);
    ctx.lineTo(cam.x + 14, cy + 10);
    ctx.stroke();
    for (let y = cam.y + 36; y < cy; y += 22) {
      ctx.beginPath();
      ctx.moveTo(cam.x - 20, y);
      ctx.lineTo(cam.x + 20, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cam.x - 17, cam.y, 34, 24);
    ctx.beginPath();
    ctx.moveTo(cam.x - 9, cam.y);
    ctx.lineTo(cam.x - 15, cam.y - 13);
    ctx.lineTo(cam.x + 15, cam.y - 13);
    ctx.lineTo(cam.x + 9, cam.y);
    ctx.closePath();
    ctx.fill();
    label('CAM A · 35 MM', cam.x + 32, cam.y + 20);

    // the talent mark: the decisive point
    const mark = { x: cx + R * 0.02, y: cy - R * 0.64 };
    ctx.fillStyle = radial(ctx, mark.x, mark.y, 40, [
      [0, 'rgba(242,183,5,0.5)'],
      [1, 'rgba(242,183,5,0)'],
    ]);
    ctx.fillRect(mark.x - 40, mark.y - 40, 80, 80);
    ctx.fillStyle = '#f2b705';
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, 13, 0, TAU);
    ctx.fill();
    label('MARK A', mark.x + 26, mark.y + 7, { color: '#f2b705' });

    // radius dimension
    const rimPt = at(deg(318), R);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(rimPt.x, rimPt.y);
    ctx.stroke();
    const ang = deg(318);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(rimPt.x, rimPt.y);
    ctx.lineTo(rimPt.x - Math.cos(ang - 0.35) * 14, rimPt.y - Math.sin(ang - 0.35) * 14);
    ctx.lineTo(rimPt.x - Math.cos(ang + 0.35) * 14, rimPt.y - Math.sin(ang + 0.35) * 14);
    ctx.closePath();
    ctx.fill();
    const mid = at(deg(318), R * 0.55);
    label('R 12.0 M', mid.x + 16, mid.y - 10);

    const top = at(deg(270), R + T);
    label('LED WALL · 60 × 6 M · 2.6 MM PITCH', top.x, top.y - 20, { size: 22, align: 'center', color: 'rgba(255,255,255,0.85)' });

    // title block
    label('STAGE B · LED VOLUME', W * 0.04, H * 0.1, { size: 38, color: '#ffffff', track: 0.12 });
    label('PLAN VIEW · SCALE 1:100 · REV C', W * 0.04, H * 0.15, { size: 20, color: 'rgba(255,255,255,0.5)', weight: 500 });
    ctx.fillStyle = '#c51622';
    ctx.fillRect(W * 0.04, H * 0.175, 72, 6);

    // legend
    const legend = [
      ['swatch', '#c51622', 'INNER FRUSTUM · TRACKED'],
      ['swatch', '#2b2b2b', 'OUTER FRUSTUM · LIGHTING'],
      ['dash', null, 'CEILING · REFLECTIONS'],
      ['dot', '#f2b705', 'TALENT MARK'],
    ];
    legend.forEach(([kind, color, text], i) => {
      const lx = W * 0.04;
      const ly = H * 0.7 + i * 46;
      if (kind === 'swatch') {
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly - 18, 28, 20);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(lx + 0.5, ly - 17.5, 27, 19);
      } else if (kind === 'dash') {
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly - 8);
        ctx.lineTo(lx + 28, ly - 8);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx + 14, ly - 8, 9, 0, TAU);
        ctx.fill();
      }
      label(text, lx + 44, ly, { size: 18, color: 'rgba(255,255,255,0.66)' });
    });
  }

  // ================================================================ plates

  const PLATES = {
    desertDusk: { paint: (c, W, H) => paintDesert(c, W, H), slate: ['MRD_010_010 · ENV PLATE · v004', 'UE 5.4 · 6K'] },
    desertNoon: { paint: (c, W, H) => paintDesert(c, W, H, { palette: 'noon', seed: 12 }), slate: ['MRD_050_010 · ENV PLATE · v002', 'UE 5.4 · 6K'] },
    canyonWarm: { paint: (c, W, H) => paintCanyon(c, W, H), slate: ['MRD_010_020 · ENV PLATE · v002', 'UE 5.4 · 6K'] },
    canyonDusk: { paint: (c, W, H) => paintCanyon(c, W, H, { palette: 'dusk', seed: 6 }), slate: ['HLC_020_030 · PREVIZ · v006', 'UE 5.4 · 4K'] },
    neonMagenta: { paint: (c, W, H) => paintNeon(c, W, H), slate: ['MRD_010_030 · ENV PLATE · v007', 'UE 5.4 · 6K'] },
    neonTeal: { paint: (c, W, H) => paintNeon(c, W, H, { palette: 'teal', seed: 22 }), slate: ['TLS_SCOUT · NIGHT · v001', 'SCOUT · 8K'] },
    overlookBlue: { paint: (c, W, H) => paintOverlook(c, W, H), slate: ['MRD_010_040 · CONCEPT · v001', 'UE 5.4 · 6K'] },
    overlookDawn: { paint: (c, W, H) => paintOverlook(c, W, H, { palette: 'dawn', seed: 32 }), slate: ['NTH_001_020 · CONCEPT · v003', 'MOOD'] },
    planetAmber: { paint: (c, W, H) => paintPlanet(c, W, H), slate: ['HLC_010_010 · PREVIZ · v004', 'UE 5.4 · 4K'] },
    planetIce: { paint: (c, W, H) => paintPlanet(c, W, H, { palette: 'ice', seed: 52 }), slate: ['NTH_001_010 · CONCEPT · v002', 'MOOD'] },
    stagePlan: { paint: (c, W, H) => paintStagePlan(c, W, H), slate: null, png: true },
  };

  const plateCache = new Map();

  function plate(name) {
    if (plateCache.has(name)) return plateCache.get(name);
    const spec = PLATES[name];
    const canvas = makeCanvas(PLATE_W, PLATE_H);
    const ctx = canvas.getContext('2d');
    spec.paint(ctx, PLATE_W, PLATE_H);
    if (spec.slate) slate(ctx, PLATE_W, PLATE_H, spec.slate[0], spec.slate[1]);
    const entry = { name, canvas, png: Boolean(spec.png) };
    plateCache.set(name, entry);
    return entry;
  }

  async function loadFonts() {
    await Promise.all([
      document.fonts.load(`500 32px ${FONT}`),
      document.fonts.load(`600 32px ${FONT}`),
      document.fonts.load(`700 32px ${FONT}`),
    ]);
  }

  /** All plates on one sheet, for reviewing the painters. */
  async function contactSheet() {
    await loadFonts();
    const names = Object.keys(PLATES);
    const cols = 3;
    const tw = 480;
    const th = 270;
    const gap = 12;
    const rows = Math.ceil(names.length / cols);
    const sheet = makeCanvas(cols * tw + (cols + 1) * gap, rows * th + (rows + 1) * gap);
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    names.forEach((name, i) => {
      const x = gap + (i % cols) * (tw + gap);
      const y = gap + Math.floor(i / cols) * (th + gap);
      ctx.drawImage(plate(name).canvas, x, y, tw, th);
    });
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.background = '#0a0a0a';
    sheet.style.cssText = 'display:block;width:100vw;height:auto';
    document.body.appendChild(sheet);
    return { width: sheet.width, height: sheet.height };
  }

  // ================================================================== API

  async function api(path, init) {
    const res = await fetch(path, init);
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
    return res.json();
  }

  const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  function canvasBlob(canvas, png) {
    return new Promise((resolve) => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.9));
  }

  async function upload(boardId, entry) {
    const blob = await canvasBlob(entry.canvas, entry.png);
    const form = new FormData();
    form.append('file', blob, `${entry.name}.${entry.png ? 'png' : 'jpg'}`);
    const res = await api(`/api/boards/${boardId}/assets`, { method: 'POST', body: form });
    return { url: res.url, w: entry.canvas.width, h: entry.canvas.height };
  }

  // ======================================================== doc builders

  const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  class DocBuilder {
    constructor(boardId) {
      this.boardId = boardId;
      this.elements = {};
      this.frames = [];
      this.rest = [];
      this.pins = [];
      this.connectors = {};
      this.images = {};
      this.uploads = [];
    }

    add(el) {
      this.elements[el.id] = el;
      if (el.type === 'frame') this.frames.push(el.id);
      else if (el.type === 'comment') this.pins.push(el.id);
      else this.rest.push(el.id);
      return el;
    }

    frame(x, y, w, h, title) {
      return this.add({ id: newId(), type: 'frame', x, y, width: w, height: h, title, fill: 'rgba(255,255,255,0.04)' });
    }

    image(x, y, w, h, plateName, frameId = null) {
      const el = this.add({ id: newId(), type: 'image', x, y, width: w, height: h, assetUrl: '', naturalWidth: PLATE_W, naturalHeight: PLATE_H, title: plateName, frameId });
      this.images[el.id] = plate(plateName).canvas;
      this.uploads.push([el, plate(plateName)]);
      return el;
    }

    sticky(x, y, w, h, text, color = '#ffffff', frameId = null, fontSize = 22) {
      return this.add({ id: newId(), type: 'sticky', x, y, width: w, height: h, color, text, fontSize, frameId });
    }

    text(x, y, w, text, { size = 24, color = '#ffffff', bold = false, align = 'left', frameId = null } = {}) {
      return this.add({ id: newId(), type: 'text', x, y, width: w, height: Math.round(size * 1.3 + 8), text, textStyle: { fontSize: size, color, align, bold }, frameId });
    }

    rect(x, y, w, h, fill, frameId = null, { kind = 'rect', stroke = 'transparent', strokeWidth = 0, text = '', textStyle } = {}) {
      return this.add({
        id: newId(),
        type: 'shape',
        x,
        y,
        width: w,
        height: h,
        kind,
        fill,
        stroke,
        strokeWidth,
        opacity: 1,
        text,
        textStyle: textStyle ?? { fontSize: 16, color: '#ffffff', align: 'center', bold: true },
        frameId,
      });
    }

    pill(x, y, status, frameId = null) {
      const style = {
        APPROVED: ['#ffffff', '#0a0a0a'],
        'IN REVIEW': ['#f2b705', '#0a0a0a'],
        WIP: ['#c51622', '#ffffff'],
      }[status];
      return this.rect(x, y, 176, 46, style[0], frameId, {
        kind: 'roundRect',
        text: status,
        textStyle: { fontSize: 17, color: style[1], align: 'center', bold: true },
      });
    }

    link(x, y, w, url, title, frameId = null, fontSize = 17) {
      return this.add({ id: newId(), type: 'link', x, y, width: w, height: 76, url, title, fontSize, frameId });
    }

    pin(x, y, attachedTo, messages, resolved = false) {
      // (x, y) is where the tip points
      return this.add({ id: newId(), type: 'comment', x, y: y - 32, width: 32, height: 32, attachedTo, messages, resolved });
    }

    connect(from, to, { label, stroke = '#c51622', width = 4, routing = 'straight' } = {}) {
      const att = (a) => (a.point ? { kind: 'point', x: a.point[0], y: a.point[1] } : { kind: 'element', elementId: a.id, side: a.side ?? 'auto' });
      const c = { id: newId(), from: att(from), to: att(to), routing, arrowStart: false, arrowEnd: true, label, stroke, strokeWidth: width };
      this.connectors[c.id] = c;
      return c;
    }

    async finish() {
      for (const [el, entry] of this.uploads) {
        const asset = await upload(this.boardId, entry);
        el.assetUrl = asset.url;
      }
      const order = [...this.frames, ...this.rest, ...this.pins];
      return { schemaVersion: 1, elements: this.elements, order, connectors: this.connectors };
    }
  }

  const NOW = Date.now();
  const PEOPLE = {
    ava: { id: 'user:ava', name: 'Ava Moreno' },
    maya: { id: 'user:maya', name: 'Maya Chen' },
    leo: { id: 'user:leo', name: 'Leo Park' },
    sam: { id: 'user:sam', name: 'Sam Okafor' },
  };
  const msg = (who, text, ago) => ({ id: newId(), text, createdAt: NOW - ago, author: PEOPLE[who] });

  // ============================================================== boards

  function buildMain(b) {
    const FW = 1080;
    const FH = 900;
    const PITCH = 1280;
    const ROW2 = 1120;
    const IMG = { dx: 30, dy: 30, w: 1020, h: 574 };
    const NOTE = { dy: 634, w: 316, h: 236, gap: 36 };

    b.text(0, -430, 1400, 'MERIDIAN', { size: 124, bold: true });
    b.rect(6, -262, 92, 8, '#c51622');
    b.text(4, -232, 2600, 'SEQ 010 · The Crossing  —  LED volume shoot, Stage B · Shoot days 14–16', { size: 30, color: '#a3a3a3' });

    const shot = (col, row, title, plateName, status, notes) => {
      const x = col * PITCH;
      const y = row === 0 ? 0 : ROW2;
      const f = b.frame(x, y, FW, FH, title);
      const img = b.image(x + IMG.dx, y + IMG.dy, IMG.w, IMG.h, plateName, f.id);
      b.pill(x + IMG.dx + IMG.w - 196, y + IMG.dy + 20, status, f.id);
      const stickies = notes.map(([text, color], i) =>
        b.sticky(x + 30 + i * (NOTE.w + NOTE.gap), y + NOTE.dy, NOTE.w, NOTE.h, text, color, f.id),
      );
      return { f, img, stickies, x, y };
    };

    const sh010 = shot(0, 0, 'SH010 · Desert arrival', 'desertDusk', 'APPROVED', [
      ['35 mm anamorphic · T2.8\nSlow push-in from a low angle', '#ffffff'],
      ['Sun sits 4° above the mesa — match the key to the LED sun', '#ffffff'],
      ['Traveler hits mark A at 00:12', '#ffe8a3'],
    ]);
    const sh020 = shot(1, 0, 'SH020 · Canyon pursuit', 'canyonWarm', 'IN REVIEW', [
      ['Dust haze is practical — sync the fan cue with the plate', '#ffffff'],
      ['Speeder enters frame left at 00:03', '#ffffff'],
      ['Handheld · 24 mm · 48 fps for the pass-by', '#b9d8f7'],
    ]);
    const sh030 = shot(2, 0, 'SH030 · Neon market', 'neonMagenta', 'WIP', [
      ['Rain rig on — the wet street needs a matching reflection pass', '#ffffff'],
      ['Signs: less cyan, more red', '#f6b3b6'],
      ['Crowd: 12 extras + 40 digital', '#ffffff'],
    ]);
    const sh040 = shot(0, 1, 'SH040 · The overlook', 'overlookBlue', 'IN REVIEW', [
      ['Blue hour window is 20 min — pre-light from 18:40', '#ffffff'],
      ['Wind machine on the cloak, 35% gusts', '#ffffff'],
      ['Dim the valley lights 30% for depth', '#dccdf5'],
    ]);

    // the volume itself
    const vx = PITCH;
    const vol = b.frame(vx, ROW2, FW, FH, 'Stage B · LED volume');
    const plan = b.image(vx + IMG.dx, ROW2 + IMG.dy, IMG.w, IMG.h, 'stagePlan', vol.id);
    [
      ['LED wall 60 × 6 m\n2.6 mm pitch · 7,680 Hz', '#ffffff'],
      ['Ceiling 12 × 8 m, for reflections on the cloak', '#ffffff'],
      ['Tracking latency: 12 ms end to end', '#ffe8a3'],
    ].forEach(([text, color], i) => b.sticky(vx + 30 + i * (NOTE.w + NOTE.gap), ROW2 + NOTE.dy, NOTE.w, NOTE.h, text, color, vol.id));

    // look & references
    const lx = 2 * PITCH;
    const look = b.frame(lx, ROW2, FW, FH, 'Look & references');
    b.text(lx + 30, ROW2 + 34, 600, 'COLOR SCRIPT', { size: 18, color: '#a3a3a3', bold: true, frameId: look.id });
    const script = [
      ['SH010', ['#231345', '#b8506a', '#ef8a5e', '#2c1130']],
      ['SH020', ['#f6be7c', '#d0703f', '#7a3219', '#2a0f07']],
      ['SH030', ['#0e0b24', '#ff2e55', '#2ef2ff', '#040308']],
      ['SH040', ['#27407a', '#7b8fc7', '#e9b3b1', '#131d3a']],
    ];
    script.forEach(([name, colors], i) => {
      const sx = lx + 30 + i * 262;
      colors.forEach((color, k) => b.rect(sx, ROW2 + 80 + k * 76, 232, 76, color, look.id));
      b.text(sx, ROW2 + 396, 232, name, { size: 18, color: '#a3a3a3', bold: true, frameId: look.id });
    });
    b.text(lx + 30, ROW2 + 470, 600, 'REFERENCES', { size: 18, color: '#a3a3a3', bold: true, frameId: look.id });
    const links = [
      ['https://app.frame.io/projects/meridian/seq-010', 'SEQ 010 dailies'],
      ['https://drive.google.com/drive/folders/meridian-env-plates', 'Environment plates'],
      ['https://docs.google.com/presentation/d/meridian-look-book', 'Meridian look book'],
      ['https://github.com/meridian-films/mrd-volume', 'MRD_Volume · Unreal project'],
    ];
    links.forEach(([url, title], i) => b.link(lx + 30 + (i % 2) * 520, ROW2 + 514 + Math.floor(i / 2) * 100, 500, url, title, look.id));
    b.text(lx + 30, ROW2 + 750, 1000, 'Next playback — Thursday 16:00, Stage B', { size: 26, bold: true, frameId: look.id });
    b.text(lx + 30, ROW2 + 796, 1000, 'Director, DP and VAD review of SH020–SH040 on the wall', { size: 20, color: '#a3a3a3', frameId: look.id });

    // cuts between shots, and the volume preset driving SH020
    b.connect({ id: sh010.f.id, side: 'e' }, { id: sh020.f.id, side: 'w' }, { label: 'CUT' });
    b.connect({ id: sh020.f.id, side: 'e' }, { id: sh030.f.id, side: 'w' }, { label: 'MATCH ON ACTION' });
    b.connect({ id: vol.id, side: 'n' }, { id: sh020.f.id, side: 's' }, { label: 'WALL PRESET · DUSK', stroke: '#a3a3a3', width: 3 });
    b.connect({ id: sh020.stickies[1].id, side: 'n' }, { point: [sh020.x + 30 + 1020 * 0.46, 30 + 574 * 0.84] }, { stroke: '#ffffff', width: 3 });

    // review threads
    const pinA = b.pin(sh010.x + 30 + 1020 * 0.69, 30 + 574 * 0.585, sh010.img.id, [
      msg('ava', 'The sun needs to sit lower — it should clip the mesa at the end of the push.', 3 * HOUR),
      msg('maya', 'Agreed. Dropping it 2° keeps the key light believable too.', 2 * HOUR + 40 * MINUTE),
      msg('leo', 'Updated in v004. Rebaking the sky now — ready for review by 3 pm.', 35 * MINUTE),
    ]);
    b.pin(sh020.x + 30 + 1020 * 0.3, 30 + 574 * 0.34, sh020.img.id, [msg('ava', 'Dust density approved. Lock it.', DAY)], true);
    b.pin(sh030.x + 30 + 1020 * 0.56, 30 + 574 * 0.86, sh030.img.id, [
      msg('maya', 'Street reflections read too cyan against the plate.', HOUR),
      msg('sam', 'Pushing the practicals warmer for the rain pass. Check it at the 16:00 playback.', 20 * MINUTE),
    ]);
    b.pin(vx + 30 + 1020 * 0.52, ROW2 + 30 + 574 * 0.42, plan.id, [
      msg('sam', 'Frustum overscan is at 18% — confirm with Leo before day 14.', 4 * HOUR),
    ]);

    return {
      pinA: pinA.id,
      sh010: sh010.f.id,
      sh020: sh020.f.id,
      sh030: sh030.f.id,
      reviewPill: Object.values(b.elements).find((el) => el.type === 'shape' && el.text === 'IN REVIEW' && el.frameId === sh020.f.id).id,
      leoSticky: sh030.stickies[1].id,
      frames: { FW, FH, PITCH, ROW2 },
    };
  }

  function buildTracker(b) {
    const assets = [
      ['desertDusk', 'ENV · Desert dusk · v004', 'APPROVED'],
      ['canyonWarm', 'ENV · Canyon · v002', 'IN REVIEW'],
      ['neonMagenta', 'ENV · Neon market · v007', 'WIP'],
      ['overlookBlue', 'ENV · Overlook · v001', 'IN REVIEW'],
      ['desertNoon', 'ENV · Desert noon · v002', 'APPROVED'],
      ['planetAmber', 'SKY · Ringed planet · v004', 'WIP'],
    ];
    assets.forEach(([plateName, title, status], i) => {
      const x = (i % 3) * 620;
      const y = Math.floor(i / 3) * 520;
      const f = b.frame(x, y, 560, 440, title);
      b.image(x + 20, y + 20, 520, 293, plateName, f.id);
      b.pill(x + 20, y + 336, status, f.id);
      b.text(x + 214, y + 344, 330, ['Owner: Leo', 'Owner: Maya', 'Owner: Sam'][i % 3], { size: 20, color: '#a3a3a3', frameId: f.id });
    });
  }

  function buildStage(b) {
    const f = b.frame(0, 0, 1700, 980, 'Calibration pass 3');
    b.image(30, 30, 1040, 585, 'stagePlan', f.id);
    const notes = [
      ['Color: wall matched to ACEScct, ΔE < 1.5', '#ffffff'],
      ['Genlock 23.976 · 7,680 Hz scan', '#ffffff'],
      ['Moiré check at 35 / 50 / 85 mm', '#ffe8a3'],
      ['Ceiling panels re-aimed −4°', '#ffffff'],
    ];
    notes.forEach(([text, color], i) => b.sticky(1110 + (i % 2) * 290, 30 + Math.floor(i / 2) * 290, 260, 260, text, color, f.id));
    b.pill(30, 650, 'APPROVED', f.id);
    b.text(230, 658, 800, 'Signed off by Sam Okafor', { size: 22, color: '#a3a3a3', frameId: f.id });
  }

  function buildNorthlight(b) {
    b.image(0, 0, 1280, 720, 'overlookDawn');
    b.image(1320, 0, 640, 360, 'planetIce');
    b.image(1320, 380, 640, 340, 'overlookBlue');
    ['#3b3f78', '#9a6c9c', '#f0a58a', '#ffd39a', '#fff1cf', '#2c5577'].forEach((color, i) => b.rect(i * 330, 760, 310, 120, color));
    b.text(0, -120, 1200, 'NORTHLIGHT', { size: 90, bold: true });
  }

  function buildTallow(b) {
    b.image(0, 0, 1200, 675, 'neonTeal');
    b.image(1240, 0, 720, 405, 'neonMagenta');
    [
      ['Permit: 22:00–04:00, lane closed', '#ffffff'],
      ['Power tie-in behind the noodle stall', '#f6b3b6'],
      ['Scan the signage for the LED wall', '#b9d8f7'],
    ].forEach(([text, color], i) => b.sticky(1240 + (i % 2) * 370, 440 + Math.floor(i / 2) * 250, 340, 230, text, color));
  }

  function buildShowreel(b) {
    const cols = [
      ['OPEN', ['#ffffff', '#ffffff', '#ffe8a3']],
      ['VIRTUAL PRODUCTION', ['#f2b705', '#ffffff', '#ffffff', '#b9d8f7']],
      ['LIVE EVENTS', ['#ffffff', '#f6b3b6', '#ffffff']],
      ['CLOSE', ['#dccdf5', '#ffffff']],
    ];
    const labels = ['Logo sting', 'Stage B wide', 'Meridian SH010', 'Night market', 'Arena LED', 'Crowd', 'Credits', 'Wall cam', 'Tour', 'Rehearsal', 'Contact card', 'End frame'];
    let n = 0;
    const heads = cols.map(([title, colors], c) => {
      const head = b.rect(c * 360, 0, 320, 70, '#1c1c1c', null, {
        kind: 'roundRect',
        stroke: '#6c6c6c',
        strokeWidth: 2,
        text: title,
        textStyle: { fontSize: 18, color: '#ffffff', align: 'center', bold: true },
      });
      colors.forEach((color, k) => b.sticky(c * 360, 100 + k * 240, 320, 210, labels[n++ % labels.length], color, null, 26));
      return head;
    });
    for (let i = 1; i < heads.length; i++) b.connect({ id: heads[i - 1].id, side: 'e' }, { id: heads[i].id, side: 'w' }, { width: 3 });
  }

  function buildHalcyon(b) {
    const a = b.frame(0, 0, 1080, 700, 'HLC 010 · Arrival');
    b.image(30, 30, 1020, 574, 'planetAmber', a.id);
    b.pill(30, 626, 'IN REVIEW', a.id);
    const c = b.frame(1180, 0, 1080, 700, 'HLC 020 · Descent');
    b.image(1210, 30, 1020, 574, 'canyonDusk', c.id);
    b.pill(1210, 626, 'WIP', c.id);
    b.connect({ id: a.id, side: 'e' }, { id: c.id, side: 'w' }, { label: 'CUT' });
  }

  function buildClientDemo(b) {
    ['desertNoon', 'neonTeal', 'overlookDawn', 'planetIce'].forEach((plateName, i) => {
      const x = (i % 2) * 760;
      const y = Math.floor(i / 2) * 540;
      const f = b.frame(x, y, 700, 470, ['Loop A · Desert', 'Loop B · Night city', 'Loop C · Dawn', 'Loop D · Orbit'][i]);
      b.image(x + 20, y + 20, 660, 371, plateName, f.id);
      b.text(x + 20, y + 410, 660, ['60 s · 16K canvas', '45 s · 16K canvas', '60 s · 12K canvas', '30 s · 16K canvas'][i], { size: 20, color: '#a3a3a3', frameId: f.id });
    });
  }

  const BOARDS = [
    { name: 'Meridian · SEQ 010 shot board', build: buildMain, ago: 12 * MINUTE, main: true },
    { name: 'Meridian · Asset tracker', build: buildTracker, ago: HOUR + 40 * MINUTE },
    { name: 'Stage B · Volume calibration', build: buildStage, ago: 5 * HOUR },
    { name: 'Northlight · Pitch moodboard', build: buildNorthlight, ago: DAY + 3 * HOUR },
    { name: 'Tallow Street · Location scout', build: buildTallow, ago: 2 * DAY },
    { name: 'Showreel 2026 · Edit plan', build: buildShowreel, ago: 4 * DAY },
    { name: 'Halcyon · Previz review', build: buildHalcyon, ago: 9 * DAY },
    { name: 'Client demo · LED wall loops', build: buildClientDemo, ago: 16 * DAY },
  ];

  // ============================================================ thumbnails

  /** Mirrors client/src/api/thumbnail.ts, drawing the real plates. */
  function thumbnail(doc, images) {
    const W = 480;
    const H = 270;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    const els = doc.order.map((id) => doc.elements[id]).filter(Boolean);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of els) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    const pad = 20;
    const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY), 1);
    const ox = W / 2 - ((minX + maxX) / 2) * scale;
    const oy = H / 2 - ((minY + maxY) / 2) * scale;
    const ordered = [...els.filter((el) => el.type === 'frame'), ...els.filter((el) => el.type !== 'frame')];
    for (const el of ordered) {
      const x = el.x * scale + ox;
      const y = el.y * scale + oy;
      const w = Math.max(el.width * scale, 2);
      const h = Math.max(el.height * scale, 2);
      switch (el.type) {
        case 'frame':
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = 'rgba(255,255,255,0.22)';
          ctx.strokeRect(x, y, w, h);
          break;
        case 'sticky':
          ctx.fillStyle = el.color;
          ctx.fillRect(x, y, w, h);
          break;
        case 'shape':
          ctx.fillStyle = el.fill === 'transparent' ? 'rgba(255,255,255,0.18)' : el.fill;
          ctx.fillRect(x, y, w, h);
          break;
        case 'image':
          ctx.drawImage(images[el.id], x, y, w, h);
          break;
        case 'link':
          ctx.fillStyle = '#1f1f1f';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#c51622';
          ctx.fillRect(x + h * 0.2, y + h * 0.2, h * 0.6, h * 0.6);
          break;
        case 'text':
          ctx.fillStyle = '#6c6c6c';
          ctx.fillRect(x, y + h * 0.3, w, Math.max(h * 0.4, 2));
          break;
        case 'comment':
          ctx.fillStyle = '#f2b705';
          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.max(w / 2, 2), 0, TAU);
          ctx.fill();
          break;
      }
    }
    return c.toDataURL('image/png');
  }

  // ================================================================= seed

  async function seed() {
    await loadFonts();
    const out = { boards: [], main: null };
    for (const spec of BOARDS) {
      const board = await api('/api/boards', json('POST', { name: spec.name }));
      const b = new DocBuilder(board.id);
      const info = spec.build(b);
      const doc = await b.finish();
      await api(`/api/boards/${board.id}`, json('PUT', { doc, thumbnail: thumbnail(doc, b.images) }));
      out.boards.push({ id: board.id, name: spec.name, ago: spec.ago });
      if (spec.main) {
        const shares = {};
        for (const role of ['viewer', 'commenter', 'editor']) {
          shares[role] = (await api(`/api/boards/${board.id}/shares`, json('POST', { role }))).token;
        }
        out.main = { id: board.id, shares, ...info };
      }
    }
    return out;
  }

  window.__morphDemo = { seed, contactSheet, plate };
})();
