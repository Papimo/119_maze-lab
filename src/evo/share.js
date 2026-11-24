// Delen (link + QR) en rondleiding.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, E, EV, addAlgo, esc, note } = U;
  let algoDetail, setPage;
  U.link(() => ({ algoDetail, setPage } = U));

  // delen: korte link (#dna=…, opent de app en zet hem in de bibliotheek) + QR-code (qrcode-generator in vendor/, geen externe dienst)
  const APP_URL = 'https://papimo.github.io/119_maze-lab/';
  function shareLink(a) { const base = /^https?:/.test(location.protocol) ? location.href.split('#')[0] : APP_URL; return base + '#dna=' + EV().toShort(a); }
  function qrSvg(txt) {
    if (typeof qrcode !== 'function') return '<p class="hint">QR-bibliotheek niet geladen.</p>';
    try { const q = qrcode(0, 'M'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true }); } catch (e) { return '<p class="hint">Link te lang voor een QR-code.</p>'; }
  }
  function shareHtml(a) {
    const url = shareLink(a);
    return `<div class="share"><h4>🔗 Delen: ${esc(a.name)}</h4><div class="share-row"><div class="qr">${qrSvg(url)}</div>
      <div class="share-r"><span class="hint" style="margin:0">Scan met een telefoon, of stuur de link. Wie hem opent krijgt ${esc(a.name)} in de eigen bibliotheek (DNA exact, ${url.length} tekens).</span>
      <input class="share-url" readonly value="${esc(url)}"><div class="btns"><button class="btn primary" data-ev="share-copy" data-id="${esc(a.id)}">Kopieer link</button><button class="btn" data-ev="share" data-id="${esc(a.id)}">Sluiten</button></div></div></div></div>`;
  }
  // link geopend met #dna=… → in de bibliotheek + selecteren
  function openShared() {
    const m = /#dna=([^&]+)/.exec(location.hash || ''); if (!m) return false;
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* file:// */ }
    const o = EV().fromCode(decodeURIComponent(m[1]));
    if (!o) { note('Die link bevat geen geldig algoritme.'); return true; }
    const have = EV().loadAlgos().find(x => x.genes.join() === o.genes.map(v => Math.round(v * 1000) / 1000).join());
    const x = have || addAlgo({ ...o, folder: 'Gedeeld', tags: ['gedeeld'], note: 'Binnengekomen via een gedeelde link.' });
    E.page = 'algos'; E.sel = x ? x.id : null;
    note(have ? `${o.name} stond al in je bibliotheek.` : `📥 ${o.name} toegevoegd aan je bibliotheek (map Gedeeld).`);
    return true;
  }

  // ---- rondleiding: 3 stappen bij het eerste bezoek (localStorage mazelab.tour) ----
  const TOUR = [
    { sel: '#evo-tabs [data-page="algos"]', t: '1 · Algoritmes', d: 'Hier staan de klassiekers en jouw eigen algoritmes, met hun Score (0–100, 100 = altijd de kortste route). Klik een kaart en kies “Wat wil je doen?”: verbeteren, laten strijden, begrijpen, inzetten of delen.' },
    { sel: '#evo-tabs [data-page="evolve"]', t: '2 · Evolueren', d: 'Een zwerm lopers met eigen DNA kweekt hier nieuwe algoritmes, ook als je op een andere pagina bent. Turbo rekent duizenden generaties zonder animatie; onder Automatisch kan hij zelf stoppen, kampioenen bewaren en het doolhof laten meegroeien.' },
    { sel: '#lib-ladder', t: '3 · Doelen', d: 'De doelenladder: versla eerst alle klassiekers op de testbaan, daarna wacht de zware testbaan. Een taak (werkbank, mutantenlab, duel) opent als volledig scherm onder Taak.' }
  ];
  function tour(k) {
    let el = $('#evo-tour');
    document.querySelectorAll('.tour-hl').forEach(x => x.classList.remove('tour-hl'));
    if (k == null || k >= TOUR.length) { if (el) el.remove(); try { localStorage.setItem('mazelab.tour', '1'); } catch (e) { /* geen opslag */ } return; }
    if (E.page !== 'algos') setPage('algos');
    const st = TOUR[k], tg = $(st.sel);
    if (!el) { el = document.createElement('div'); el.id = 'evo-tour'; $('#view-evo').appendChild(el); }
    el.innerHTML = `<b>${esc(st.t)}</b><p>${esc(st.d)}</p><div class="btns"><span class="tour-n">${k + 1}/${TOUR.length}</span><button class="btn" data-ev="tour-end">Overslaan</button><button class="btn primary" data-ev="tour" data-k="${k + 1}">${k + 1 < TOUR.length ? 'Volgende' : 'Klaar'}</button></div>`;
    if (tg) {
      tg.classList.add('tour-hl');
      const r = tg.getBoundingClientRect(), W = Math.min(340, innerWidth - 24);
      el.style.width = W + 'px'; el.style.left = Math.max(12, Math.min(innerWidth - W - 12, r.left)) + 'px'; el.style.top = Math.min(innerHeight - 200, r.bottom + 10) + 'px';
    }
  }


  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    tour: c => tour(+c.b.dataset.k || 0),
    'tour-end': () => tour(null),
    share: ({ a }) => { if (a) { E.share = E.share === a.id ? null : a.id; algoDetail(); } },
    'share-copy': ({ a }) => { if (!a) return; const url = shareLink(a); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => note('Link gekopieerd.'), () => prompt('Kopieer deze link', url)); },
  });
  Object.assign(U, { APP_URL, shareLink, qrSvg, shareHtml, openShared, TOUR, tour });
})(window.ML = window.ML || {});
