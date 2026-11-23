// Maze Lab 2.0 — extra beeldlagen + geluid. Render2D roept ML.V2.layers(z, …) aan op drie plekken:
//   'floor'  = op de vloer, onder de muren (modelcoördinaten via r.X / r.Y)
//   'top'    = boven alles, zelfde transform als het doolhof (maquette: op halve muurhoogte)
//   'screen' = schermruimte (transform gewist): sfeer, vignet, gloed.
// Elke laag geeft true terug zolang hij beweegt. Instellingen komen uit ML.V2.S (= app-instellingen S).
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;
  const ease = x => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const store = r => r._v2 || (r._v2 = {});

  // Afstand (cellen) vanaf een cel over open gangen; per doolhof gecachet.
  function distFrom(m, src) {
    const key = '_d' + src;
    if (m[key]) return m[key];
    const n = m.cells.length, d = new Int32Array(n).fill(-1), q = [src];
    d[src] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (const nb of m.cells[c].nbrs) if (m.walls[nb.w].open && d[nb.c] < 0) { d[nb.c] = d[c] + 1; q.push(nb.c); }
    }
    let mx = 0; for (let i = 0; i < n; i++) if (d[i] > mx) mx = d[i];
    d.max = mx;
    return (m[key] = d);
  }
  ML.distFrom = distFrom;

  const isDark = p => !p.maq && /^#[0-3]/.test(p.bg);

  // ---------- vloerlagen ----------
  // 1 · Lappendeken: elk blok van "Doolhof van doolhoven" eigen tint + poortpaaltjes bij de deuren
  function patch(g, r, m) {
    if (!m.blocks) return false;
    const S = store(r), key = [m.cells.length, r.s, r.ox, r.oy].join();
    if (S.patchM !== m || S.patchK !== key) {
      const C = m.cells, lists = Array.from({ length: m.blockN }, () => []);
      for (let i = 0; i < C.length; i++) lists[m.blocks[i]].push(i);
      S.patchP = lists.map(l => r.cellsPath(l));
      const posts = new Path2D(), rad = Math.max(1, r.s * 0.11);
      for (const w of m.walls) {
        if (!w.open || w.b === null || w.stair || m.blocks[w.a] === m.blocks[w.b]) continue;
        for (const q of w.segs) for (const [x, y] of [[q[0], q[1]], [q[2], q[3]]]) { const X = r.X(x), Y = r.Y(y); posts.moveTo(X + rad, Y); posts.arc(X, Y, rad, 0, TAU); }
      }
      S.patchPosts = posts; S.patchM = m; S.patchK = key;
    }
    const dark = isDark(r.pal);
    g.save();
    S.patchP.forEach((p, k) => {
      const st = m.blockStyle ? m.blockStyle[k] : 0.5;
      g.fillStyle = `hsl(${(k * 137.5) % 360},${dark ? 70 : 55}%,${dark ? 45 : 60}%)`;
      g.globalAlpha = (dark ? 0.07 : 0.16) + st * (dark ? 0.03 : 0.05);
      g.fill(p);
    });
    g.globalAlpha = m.ready ? 0.9 : 0.4; g.fillStyle = r.pal.accent || '#c8322f'; g.fill(S.patchPosts);
    g.restore();
    return false;
  }

  // 2 · Regenboog-bouw: cellen kleuren in volgorde van uitgraven (tekening van het algoritme)
  function rainbow(g, r, m, vs, now) {
    let ord = vs.gord, a = 1, busy = false;
    if (!ord && vs.rainbow) {
      ord = vs.rainbow.ord;
      const e = (now - vs.rainbow.t0 - 0.5) / 2.4;
      if (e >= 1) return false;
      a = 1 - ease(e); busy = true;
    }
    if (!ord) return false;
    const n = m.cells.length, NB = 36, B = Array.from({ length: NB }, () => []);
    for (let i = 0; i < n; i++) if (ord[i] >= 0) B[Math.min(NB - 1, Math.floor(ord[i] / n * NB))].push(i);
    const dark = isDark(r.pal), base = (vs.rainbowHue || 190);
    g.save();
    g.globalAlpha = (dark ? 0.5 : r.pal.maq ? 0.34 : 0.4) * a;
    B.forEach((l, k) => { if (!l.length) return; g.fillStyle = `hsl(${(base + k / NB * 300) % 360},${dark ? 85 : 70}%,${dark ? 55 : 62}%)`; g.fill(r.cellsPath(l)); });
    g.restore();
    return busy;
  }

  // 3 · Ademgolf: als een doolhof klaar is, loopt één lichtgolf vanaf de start door alle gangen
  function wave(g, r, m, vs, now) {
    if (vs.readyT == null || !m.ready) return false;
    const T = 1.6, e = (now - vs.readyT) / T;
    if (e < 0 || e >= 1) return e < 0;
    const d = distFrom(m, m.start), band = Math.max(3, d.max * 0.08), f = e * (d.max + band * 2) - band;
    const B = [[], [], []];
    for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i] - f); if (d[i] >= 0 && x < band) B[Math.min(2, Math.floor((1 - x / band) * 3))].push(i); }
    g.save(); g.fillStyle = isDark(r.pal) ? (r.pal.wall || '#fff') : '#fffaf0';
    B.forEach((l, k) => { if (!l.length) return; g.globalAlpha = (0.12 + k * 0.14) * (1 - e * 0.5); g.fill(r.cellsPath(l)); });
    g.restore();
    return true;
  }

  // 4 · Aurora (stijl Aurora): langzaam golvend noorderlicht over de vloer
  function aurora(g, r, m, vs, now) {
    if (r.pal.sunset) { // Zonsondergang: lage warme zon rechtsboven, licht ademend
      const W = r.cv.width, H = r.cv.height, t = vs.life ? now : 0, x = W * 0.82, y = H * 0.08, R = Math.max(W, H) * (0.75 + Math.sin(t * 0.4) * 0.03);
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, 'rgba(255,190,110,0.30)'); gr.addColorStop(0.35, 'rgba(255,110,90,0.12)'); gr.addColorStop(1, 'rgba(120,40,120,0)');
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
      return !!vs.life;
    }
    if (!r.pal.aurora) return false;
    const cv = r.cv, W = cv.width, H = cv.height, t = vs.life ? now : 0;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const y0 = H * (0.25 + k * 0.22) + Math.sin(t * 0.21 + k * 2) * H * 0.06;
      const gr = g.createLinearGradient(0, y0 - H * 0.16, 0, y0 + H * 0.16);
      const col = ['rgba(80,255,170,', 'rgba(120,120,255,', 'rgba(220,90,255,'][k];
      gr.addColorStop(0, col + '0)'); gr.addColorStop(0.5, col + '0.075)'); gr.addColorStop(1, col + '0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, y0 - H * 0.2);
      for (let x = 0; x <= W; x += W / 24) g.lineTo(x, y0 - H * 0.12 + Math.sin(x / W * 6 + t * (0.35 + k * 0.1) + k) * H * 0.05);
      g.lineTo(W, y0 + H * 0.2); g.lineTo(0, y0 + H * 0.2); g.closePath(); g.fill();
    }
    g.restore();
    return !!vs.life;
  }

  // ---------- bovenlagen ----------
  // 5 · Lichtstroom: na afloop lopen zachte lichtpulsen over de gevonden route
  function flow(g, r, m, vs, now) {
    const P = vs.path;
    if (!P || P.length < 3 || vs.phase !== 'done' || vs.endT == null || vs.player != null) return false;
    const e = (now - vs.endT - 2.2) / 1.2;
    if (e < 0) return true;
    const C = m.cells, L = P.length - 1, a = Math.min(1, e), per = Math.max(2.5, Math.min(9, L / 9));
    const at = f => { const i = Math.min(L - 1, Math.floor(f)), u = f - i, A = C[P[i]].center, B = C[P[i + 1]].center; const w = ML.edge(m, P[i], P[i + 1]); if (!w || w.wrap || w.stair) return A; return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]; };
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = r.pal.path;
    for (let k = 0; k < 3; k++) {
      const f0 = ((now / per + k / 3) % 1) * L;
      for (let j = 0; j < 7; j++) {
        const f = f0 - j * 0.35;
        if (f < 0) continue;
        const [x, y] = at(f);
        g.globalAlpha = a * 0.55 * (1 - j / 7);
        g.beginPath(); g.arc(r.X(x), r.Y(y), Math.max(1.2, r.s * (0.16 - j * 0.015)), 0, TAU); g.fill();
      }
    }
    g.restore();
    return true;
  }

  // ---------- schermlagen ----------
  // 6 · Glans-veeg: bij een klaar doolhof glijdt één glansband schuin over het beeld
  function glint(g, r, m, vs, now) {
    if (vs.readyT == null) return false;
    const e = (now - vs.readyT - 0.15) / 0.9;
    if (e < 0) return true;
    if (e >= 1) return false;
    const W = r.cv.width, H = r.cv.height, x = -W * 0.4 + e * W * 1.8;
    const gr = g.createLinearGradient(x - W * 0.18, 0, x + W * 0.18, H * 0.4);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25; g.fillRect(0, 0, W, H); g.restore();
    return true;
  }

  // 7 · Sfeer: dag / avond / nacht / zaklamp / cyclus (90 s). Nacht en zaklamp hebben vuurvliegjes.
  const MOODS = { dag: [255, 255, 255, 0], avond: [255, 172, 122, 0.35], nacht: [62, 82, 155, 0.85], dageraad: [255, 205, 175, 0.2] };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function moodColor(mood, now) {
    if (mood !== 'cyclus') return MOODS[mood] || MOODS.dag;
    const seq = [MOODS.dag, MOODS.dag, MOODS.avond, MOODS.nacht, MOODS.nacht, MOODS.dageraad], f = (now / 90 % 1) * seq.length, i = Math.floor(f);
    return mix(seq[i], seq[(i + 1) % seq.length], ease(f - i));
  }
  function flies(g, r, now, k) {
    const S = store(r), W = r.cv.width, H = r.cv.height;
    if (!S.flies) { const R = ML.makeRng('vuurvliegjes'); S.flies = Array.from({ length: 34 }, () => ({ x: R(), y: R(), a: R() * TAU, s: 0.4 + R(), p: R() * TAU })); }
    const dt = S.flyT ? Math.min(0.05, now - S.flyT) : 0; S.flyT = now;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const f of S.flies) {
      f.a += (Math.sin(now * 0.7 + f.p) * 1.4) * dt; f.x = (f.x + Math.cos(f.a) * 0.018 * f.s * dt + 1) % 1; f.y = (f.y + Math.sin(f.a) * 0.018 * f.s * dt + 1) % 1;
      const b = Math.max(0, Math.sin(now * (1.3 + f.s) + f.p)) * k, X = f.x * W, Y = f.y * H, R = Math.max(5, Math.min(W, H) * 0.012);
      if (b < 0.02) continue;
      const gr = g.createRadialGradient(X, Y, 0, X, Y, R * 3);
      gr.addColorStop(0, `rgba(230,255,140,${0.9 * b})`); gr.addColorStop(0.25, `rgba(190,255,90,${0.35 * b})`); gr.addColorStop(1, 'rgba(190,255,90,0)');
      g.fillStyle = gr; g.fillRect(X - R * 3, Y - R * 3, R * 6, R * 6);
    }
    g.restore();
  }
  function screenPt(r, p) {
    const S = store(r);
    if (!p || !S.T) return p ? [r.X(p[0]), r.Y(p[1])] : null;
    const q = S.T.transformPoint(new DOMPoint(r.X(p[0]), r.Y(p[1])));
    return [q.x, q.y];
  }
  function mood(g, r, m, vs, now) {
    const md = V2.S.mood || 'dag';
    if (md === 'dag') return false;
    const W = r.cv.width, H = r.cv.height, head = screenPt(r, r.headPos), cell = r.s * (store(r).Tz || 1);
    if (md === 'zaklamp') {
      const S = store(r);
      if (!S.mask || S.mask.width !== W || S.mask.height !== H) S.mask = mk(W, H);
      const k = S.mask.getContext('2d');
      k.globalCompositeOperation = 'source-over'; k.clearRect(0, 0, W, H); k.fillStyle = 'rgba(4,6,14,0.94)'; k.fillRect(0, 0, W, H);
      k.globalCompositeOperation = 'destination-out';
      const hole = (p, rad, a) => { if (!p) return; const gr = k.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.75})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); k.fillStyle = gr; k.fillRect(p[0] - rad, p[1] - rad, rad * 2, rad * 2); };
      const flick = 1 + Math.sin(now * 13) * 0.02 + Math.sin(now * 7.3) * 0.03;
      hole(head || [W / 2, H / 2], Math.max(60, cell * 4.2) * flick, 1);
      if (m.ready) { hole(screenPt(r, m.cells[m.goal].center), cell * 1.6, 0.8); hole(screenPt(r, m.cells[m.start].center), cell * 1.3, 0.6); }
      g.drawImage(S.mask, 0, 0);
      if (head) { g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(head[0], head[1], 0, head[0], head[1], cell * 3); gr.addColorStop(0, 'rgba(255,200,120,0.22)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(head[0] - cell * 3, head[1] - cell * 3, cell * 6, cell * 6); g.restore(); }
      flies(g, r, now, 0.8);
      return true;
    }
    const c = moodColor(md, now), night = c[3];
    g.save();
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(0, 0, W, H);
    if (night > 0.5 && head) { // lantaarn bij de zoeker
      g.globalCompositeOperation = 'lighter';
      const R = Math.max(50, cell * 4), gr = g.createRadialGradient(head[0], head[1], 0, head[0], head[1], R);
      gr.addColorStop(0, `rgba(255,214,150,${0.32 * night})`); gr.addColorStop(1, 'rgba(255,214,150,0)');
      g.fillStyle = gr; g.fillRect(head[0] - R, head[1] - R, R * 2, R * 2);
    }
    g.restore();
    if (night > 0.4) flies(g, r, now, (night - 0.4) / 0.45);
    return md === 'cyclus' || night > 0.4;
  }

  // 8 · Vignet + filmkorrel (stil)
  function vignette(g, r) {
    const S = store(r), W = r.cv.width, H = r.cv.height;
    if (!S.vig || S.vig.width !== W || S.vig.height !== H) {
      S.vig = mk(W, H); const k = S.vig.getContext('2d');
      const gr = k.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,6,20,0.38)'); k.fillStyle = gr; k.fillRect(0, 0, W, H);
      const R = ML.makeRng('korrel2');
      for (let i = 0; i < W * H / 90; i++) { k.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; k.fillRect(R() * W, R() * H, 1, 1); }
    }
    g.drawImage(S.vig, 0, 0);
    return false;
  }

  // 9 · Gloed (bloom) voor de lichtgevende stijlen: kwart-resolutie vervaagd en opgeteld
  function bloom(g, r) {
    if (!r.pal.glow) return false;
    const S = store(r), W = r.cv.width, H = r.cv.height, w = Math.max(1, W >> 2), h = Math.max(1, H >> 2);
    if (!S.bl || S.bl.width !== w || S.bl.height !== h) S.bl = mk(w, h);
    const k = S.bl.getContext('2d');
    k.clearRect(0, 0, w, h); k.filter = 'blur(3px)'; k.drawImage(r.cv, 0, 0, w, h); k.filter = 'none';
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.32; g.imageSmoothingEnabled = true; g.drawImage(S.bl, 0, 0, W, H); g.restore();
    return false;
  }

  const V2 = ML.V2 = {
    S: {},
    on(k) { return !!this.S[k]; },
    layers(z, g, r, m, vs, now) {
      const S = this.S;
      let busy = false;
      try {
        if (z === 'floor') {
          if (S.patch !== false) busy = patch(g, r, m) || busy;
          busy = aurora(g, r, m, vs, now) || busy;
          if (S.rainbow) busy = rainbow(g, r, m, vs, now) || busy;
          if (S.wave) busy = wave(g, r, m, vs, now) || busy;
        } else if (z === 'top') {
          const st = store(r); st.T = g.getTransform(); st.Tz = Math.hypot(st.T.a, st.T.b);
          if (S.flow) busy = flow(g, r, m, vs, now) || busy;
        } else {
          if (S.bloom) busy = bloom(g, r) || busy;
          busy = mood(g, r, m, vs, now) || busy;
          if (S.glint) busy = glint(g, r, m, vs, now) || busy;
          if (S.vignette) busy = vignette(g, r) || busy;
        }
      } catch (e) { if (!V2._warned) { V2._warned = true; console.warn('V2-laag', e); } }
      return busy;
    }
  };

  // ---------- 10 · Geluid: zachte pentatonische tonen (aan/uit in Weergave) ----------
  const PENTA = [0, 2, 4, 7, 9];
  ML.Sound = {
    ctx: null, last: 0, n: 0,
    ensure() {
      if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.out = this.ctx.createGain(); this.out.gain.value = 0.18; this.out.connect(this.ctx.destination); } catch (e) { return null; } }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, dur, vol, type) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
    },
    // f = 0…1 (bv. positie in het doolhof) → toon in 2 octaven pentatonisch
    blip(f, kind) {
      if (!V2.S.sound || !this.ctx) return;
      const now = performance.now();
      if (now - this.last < (kind === 'carve' ? 55 : 80)) return;
      this.last = now;
      const i = Math.max(0, Math.min(9, Math.floor(f * 10))), semi = PENTA[i % 5] + 12 * Math.floor(i / 5);
      const base = kind === 'carve' ? 330 : kind === 'ant' ? 660 : 440;
      this.tone(base * Math.pow(2, semi / 12), kind === 'carve' ? 0.18 : 0.12, kind === 'carve' ? 0.22 : 0.12, kind === 'carve' ? 'triangle' : 'sine');
    },
    chord() {
      if (!V2.S.sound || !this.ctx) return;
      [0, 4, 7, 12, 16].forEach((s, k) => setTimeout(() => this.tone(392 * Math.pow(2, s / 12), 1.4, 0.16, 'sine'), k * 70));
    }
  };
})(window.ML = window.ML || {});
