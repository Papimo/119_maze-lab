// Pagina Analyse: eregalerij, stamboom, rapport.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, E, EV, addAlgo, entries, esc, geneZ, isSaved, isl, note, runs } = U;
  let afterSave, record;
  U.link(() => ({ afterSave, record } = U));

  // ======================= Analyse =======================
  function anaRender() { treeRender(); famRender(); }
  function famRender() {
    const el = $('#ana-fame'); if (!el) return;
    const list = EV().loadFame(), Ev = EV();
    if (!list.length) { el.innerHTML = '<p class="hint" style="margin-top:0">Nog leeg. Elk nieuw record van een eigen algoritme komt hier vanzelf in (top 20, ook over sessies heen).</p>'; return; }
    const heavy = Ev.heavyReady(), medal = ['🥇', '🥈', '🥉'];
    const acts = a => (isSaved(a.genes) ? '' : `<button title="Bewaar in mijn algoritmes" data-ev="save-fame" data-id="${esc(a.id)}">💾</button>`) + `<button title="Uit de eregalerij" data-ev="del-fame" data-id="${esc(a.id)}">✕</button>`;
    const hv = a => a.heavy != null ? a.heavy : heavy ? Ev.heavyScore(a.genes).score : '…';
    el.innerHTML = `<div class="podium">${list.slice(0, 3).map((a, i) => `<div class="pod p${i + 1}" data-ev="sel-go" data-id="${esc(a.id)}" title="klik: openen in Algoritmes"><span class="md">${medal[i]}</span><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i><b>${esc(a.name)}</b>
        <span class="big">${a.test}</span><small>zwaar ${hv(a)} · gen ${a.gen} · ${esc(a.date)}</small><span class="acts">${acts(a)}</span></div>`).join('')}</div>
      <div class="fame">${list.slice(3).map((a, i) => `<div class="erow" data-ev="sel-go" data-id="${esc(a.id)}" title="${esc(Ev.describe(a.genes))}"><b class="pos">${i + 4}</b><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>
        <span class="nm">${esc(a.name)}<small>gen ${a.gen} · ${esc(a.date)}${a.parents && a.parents.length ? ' · ' + a.parents.map(esc).join(' × ') : ''}</small></span>
        <span class="sc">${a.test}<small>zwaar ${hv(a)}</small></span><span class="acts">${acts(a)}</span></div>`).join('')}</div>`;
  }
  function treeRender() {
    const el = $('#ana-tree'); if (!el) return;
    const Ev = EV(), algos = Ev.loadAlgos(), byId = new Map(algos.map(a => [a.id, a]));
    Ev.PRESETS.forEach(p => { if (algos.some(a => a.parent === p.id)) byId.set(p.id, { ...p, classic: true }); });
    const nodes = [...byId.values()], kids = new Map();
    nodes.forEach(a => { const p = a.parent && byId.has(a.parent) ? a.parent : null; a._p = p; if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(a); } });
    const roots = nodes.filter(a => !a._p).sort((a, b) => Ev.testScore(b.genes).score - Ev.testScore(a.genes).score);
    if (!nodes.length) { el.innerHTML = '<p class="hint" style="margin-top:0">Nog geen bewaarde algoritmes. Bewaar een kampioen en maak er versies van met de werkbank of het mutantenlab: die verschijnen hier als boom.</p>'; return; }
    const DX = 150, DY = 40, W = 128, H = 30, pos = new Map();
    let row = 0, maxD = 0;
    const place = (a, d) => { maxD = Math.max(maxD, d); const ch = (kids.get(a.id) || []).sort((x, y) => String(x.created).localeCompare(String(y.created)));
      if (!ch.length) pos.set(a.id, { x: 8 + d * DX, y: 8 + row++ * DY }); else { ch.forEach(c => place(c, d + 1)); const ys = ch.map(c => pos.get(c.id).y); pos.set(a.id, { x: 8 + d * DX, y: (Math.min(...ys) + Math.max(...ys)) / 2 }); } };
    roots.forEach(a => place(a, 0));
    const SW = 16 + (maxD + 1) * DX, SH = 16 + row * DY;
    let edges = '', boxes = '';
    nodes.forEach(a => {
      const p = pos.get(a.id); if (!p) return;
      if (a._p) { const q = pos.get(a._p); edges += `<path d="M${q.x + W},${q.y + H / 2} C${q.x + W + 14},${q.y + H / 2} ${p.x - 14},${p.y + H / 2} ${p.x},${p.y + H / 2}"/>`; }
      const sc = Ev.testScore(a.genes).score, par = a._p ? Ev.testScore(byId.get(a._p).genes).score : null, d = par != null ? Math.round((sc - par) * 10) / 10 : null;
      boxes += `<g class="tn${a.classic ? ' classic' : ''}${E.treeSel === a.id ? ' hl' : ''}" data-ev="sel-go" data-id="${esc(a.id)}" transform="translate(${p.x},${p.y})"><title>${esc(Ev.describe(a.genes))}</title><rect width="${W}" height="${H}" rx="7"/>
        <rect width="5" height="${H}" rx="2" fill="${Ev.colorOf(a.genes)}"/><text x="11" y="13">${esc(a.name.length > 17 ? a.name.slice(0, 16) + '…' : a.name)}</text>
        <text x="11" y="25" class="s">${sc}${d != null ? ` <tspan class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</tspan>` : ''}${a.ver > 1 ? ' · v' + a.ver : ''}</text></g>`;
    });
    el.innerHTML = `<p class="hint" style="margin-top:0">Elke lijn = nieuwe versie (werkbank of mutantenlab). Groen/rood = winst/verlies op de testbaan t.o.v. de ouder. Klik een blokje om het te openen in Algoritmes.</p>
      <div class="treewrap"><svg class="stree" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}"><g class="edges">${edges}</g>${boxes}</svg></div>`;
    const hl = el.querySelector('.tn.hl'); if (hl) hl.scrollIntoView({ block: 'center', inline: 'center' });
  }

  // ---- Rapport: ranglijst + kampioen + verloop + eregalerij als zelfstandige HTML ----
  function report() {
    const Ev = EV(), list = entries(), fame = Ev.loadFame(), c = E.champ, d = new Date(), heavy = Ev.heavyReady();
    const bars = genes => `<div class="dna">${Ev.GENES.map((G, i) => { const v = genes[i], z = geneZ(G, v), w = Math.abs(z) * 50;
      const st = G.k === 'chaos' ? `left:0;width:${z * 100}%` : z >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`; return `<span title="${esc(G.name)} ${v.toFixed(2)}"><i style="${st};background:${G.col}"></i></span>`; }).join('')}</div>`;
    const hs = E.hist, n = hs.length, step = Math.max(1, Math.ceil(n / 400));
    let svg = '';
    if (n > 1) {
      const ymax = Math.max(40, ...hs.map(h => Math.max(h.best, h.test))), X = i => 40 + 640 * i / (n - 1), Y = v => 190 - 170 * v / ymax;
      let rec = -1; const recPts = [], bestPts = [];
      hs.forEach((h, i) => { if (h.test > rec) rec = h.test; if (i % step === 0 || i === n - 1) { recPts.push(`${X(i).toFixed(1)},${Y(rec).toFixed(1)}`); bestPts.push(`${X(i).toFixed(1)},${Y(h.best).toFixed(1)}`); } });
      const bc = Ev.bestClassic();
      svg = `<svg viewBox="0 0 700 210" class="chart"><line x1="40" x2="680" y1="${Y(bc.t.score)}" y2="${Y(bc.t.score)}" stroke="#ff6b6b" stroke-dasharray="6 5"/><text x="44" y="${Y(bc.t.score) - 5}" fill="#ff6b6b">beste klassieker ${esc(bc.p.name)} ${bc.t.score}</text>
        <polyline points="${bestPts.join(' ')}" fill="none" stroke="#ffd166" stroke-width="1.2" opacity=".7"/><polyline points="${recPts.join(' ')}" fill="none" stroke="#4cc9f0" stroke-width="2.6"/>
        <text x="40" y="206">generatie ${hs[0].gen}</text><text x="680" y="206" text-anchor="end">generatie ${hs[n - 1].gen}</text><text x="44" y="14" fill="#4cc9f0">record score testbaan</text><text x="200" y="14" fill="#ffd166">score beste (eigen doolhoven)</text></svg>`;
    }
    const rows = list.map((a, i) => `<tr><td>${i + 1}</td><td><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>${esc(a.name)}<small>${a.classic ? 'klassieker' : a.live ? 'kampioen (niet bewaard)' : 'eigen'}</small></td>
      <td class="n">${a.t.score}</td><td class="n">${heavy ? Ev.heavyScore(a.genes).score : '–'}</td><td class="n">${a.t.solved}/${a.t.of}</td>${Ev.TEST_CATS.map(k => `<td class="n">${a.t.cats[k.k]}</td>`).join('')}<td>${bars(a.genes)}</td></tr>`).join('');
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maze Lab – evolutie-rapport</title><style>
:root{--bg:#f6f3ec;--ink:#1d2330;--mut:#6b7380;--line:#ddd6c8;--card:#fff}@media (prefers-color-scheme:dark){:root{--bg:#141820;--ink:#e6e9ef;--mut:#8b98a8;--line:#2a3242;--card:#1b2130}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:24px 16px}main{max-width:1000px;margin:auto}h1{margin:0 0 4px}h2{margin:28px 0 8px;font-size:17px}.mut{color:var(--mut)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.big{font-size:44px;font-weight:700;color:#4cc9f0;line-height:1}.row{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}th{font-size:12px;color:var(--mut);font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}td small{display:block;color:var(--mut);font-size:11px}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.dna{display:grid;grid-template-columns:repeat(9,14px);gap:2px}.dna span{position:relative;height:14px;background:#8882;border-radius:2px;overflow:hidden}.dna i{position:absolute;top:0;bottom:0}
.chart{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}.chart text{font-size:11px;fill:var(--mut)}.wrap{overflow-x:auto}</style></head><body><main>
<h1>Maze Lab – evolutie-rapport</h1><p class="mut">${d.toLocaleString('nl-NL')} · generatie ${E.gen} · ${E.pop.length} lopers · ${E.species.length} soorten${isl() > 1 ? ' · ' + isl() + ' eilanden' : ''} · ${runs()} run(s) per doolhof</p>
${c ? `<div class="card"><div class="row"><div><div class="mut">Kampioen</div><h2 style="margin:2px 0">${esc(c.name)}</h2><div class="mut">${c.from ? 'klassieker' : 'geboren in generatie ' + c.born}</div></div><div class="big">${c.test}</div><div class="mut">testbaan<br>zwaar ${c.heavy != null ? c.heavy : '–'}</div>${bars(c.genes)}</div><p>${esc(Ev.describe(c.genes))}</p></div>` : ''}
${svg ? `<h2>Verloop</h2>${svg}` : ''}
<h2>Ranglijst</h2><div class="wrap"><table><thead><tr><th>#</th><th>Algoritme</th><th>Testbaan</th><th>Zwaar</th><th>Gehaald</th>${Ev.TEST_CATS.map(k => `<th>${esc(k.name)}</th>`).join('')}<th>DNA</th></tr></thead><tbody>${rows}</tbody></table></div>
${fame.length ? `<h2>Eregalerij</h2><div class="wrap"><table><thead><tr><th>#</th><th>Naam</th><th>Testbaan</th><th>Zwaar</th><th>Generatie</th><th>Datum</th><th>DNA</th></tr></thead><tbody>${fame.map((a, i) => `<tr><td>${i + 1}</td><td><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>${esc(a.name)}</td><td class="n">${a.test}</td><td class="n">${a.heavy != null ? a.heavy : '–'}</td><td class="n">${a.gen}</td><td>${esc(a.date)}</td><td>${bars(a.genes)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<h2>Genen</h2><p class="mut">${Ev.GENES.map(G => `<i class="sw" style="background:${G.col}"></i>${esc(G.name)}: + ${esc(G.pos)}, − ${esc(G.neg)}`).join('<br>')}</p>
<p class="mut">Testbaan = 12 vaste doolhoven × 2 runs; zware testbaan = 8 grote doolhoven (40–70) met lussen en puzzels. Score 100 = altijd de kortste route.</p></main></body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `maze-lab-rapport-${d.toISOString().slice(0, 10)}.html`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    note('Rapport gedownload.');
  }



  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'save-fame': ({ a }) => { if (!a) return; note(addAlgo({ name: a.name, genes: a.genes, born: a.born || a.gen, parents: a.parents || [] }) ? `${a.name} bewaard.` : 'Stond er al.'); famRender(); afterSave(); },
    'del-fame': ({ id }) => { EV().delFame(id); famRender(); },
    report: () => report(),
  });
  Object.assign(U, { anaRender, famRender, treeRender, report });
})(window.ML = window.ML || {});
