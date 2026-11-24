// Vandaag: dagelijks doolhof, zelf spelen, records.
(function (ML) {
  'use strict';
  const A = ML.App;
  const { $, Runner, pal, byId, GRID_NAMES, speedToSpf } = A;

  // ---- Vandaag: dagelijks doolhof, zelf spelen ----
  let daily = null;
  const D = { ymd: '', s: null };
  function dailyEnsure() {
    if (!daily) {
      daily = new Runner($('#cv-daily'));
      daily.setPalette(pal());
      daily.onPlay = (r, p) => { if (p.done) dailyFinish(p); };
      $('#cv-daily').addEventListener('pointerdown', e => {
        const d = window.devicePixelRatio || 1;
        ML.Play.click(daily, e.offsetX * d, e.offsetY * d);
      });
    }
    const today = ML.Daily.ymd();
    if (D.ymd !== today || !daily.m) {
      D.ymd = today; D.s = ML.Daily.settings(today); D.msg = '';
      daily.generate(D.s, D.s.gen, false);
      ML.Play.start(daily);
    }
    dailyPanel();
  }
  function dailyFinish(p) {
    if (p.gaveUp) return;
    const time = p.tEnd - p.t0, best = daily.stats.route;
    const res = ML.Daily.record(D.ymd, { time, moves: p.moves, best });
    setTimeout(A.recalibrate, 50);
    D.msg = `Gehaald in ${ML.Daily.fmt(time)} met ${p.moves} stappen (kortste ${best}).` + (res.newTime ? ' Nieuw tijdrecord!' : res.newMoves ? ' Minste stappen ooit!' : '');
    dailyPanel();
  }
  function dailyPanel() {
    const all = ML.Daily.load(), rec = all[D.ymd], s = D.s, m = daily.m;
    const date = new Date(D.ymd + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    const extras = [];
    if (s.levels > 1) extras.push(`${s.levels} verdiepingen`);
    if (s.torus) extras.push('torus');
    if (m.weighted) extras.push('terrein');
    if (m.keys.length) extras.push(`${m.keys.length} sleutel${m.keys.length > 1 ? 's' : ''}`);
    if (m.switches.length) extras.push('hendel');
    if (m.timed.length) extras.push('tijddeuren');
    if (m.teleporters.length) extras.push('teleporter');
    if (m.oneways.length) extras.push('eenrichting');
    let hist = '';
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = ML.Daily.ymd(d), r = all[k];
      hist += `<li><span>${d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' })}</span><span>${r && r.time ? `${ML.Daily.fmt(r.time)} · ${r.moves} st.` : '—'}</span></li>`;
    }
    $('#daily-info').innerHTML = `<p class="daily-date">${date}</p>
      <p>${GRID_NAMES[s.grid]} · ${byId(ML.GENERATORS, s.gen).name}${extras.length ? ' · ' + extras.join(', ') : ''}</p>
      <p>Moeilijkheid <b>${daily.score ? daily.score.score : '—'}</b> · kortste route ${daily.stats.route} stappen</p>
      <p>Jouw record vandaag: <b>${rec && rec.time ? `${ML.Daily.fmt(rec.time)} · ${rec.moves} stappen` : 'nog niet gehaald'}</b></p>
      ${D.msg ? `<p class="daily-msg">${D.msg}</p>` : ''}
      <h3>Vorige 7 dagen</h3><ul class="daily-hist">${hist}</ul>`;
  }
  function dailyHud() {
    if (!daily || !daily.m) return;
    const p = daily.play;
    if (!p) { $('#hud-daily').textContent = 'Opgegeven · oplossing getoond · R = opnieuw'; return; }
    const ms = p.done ? p.tEnd - p.t0 : p.t0 ? performance.now() - p.t0 : 0;
    const parts = [`⏱ ${ML.Daily.fmt(ms)}`, `${p.moves} stappen`];
    if (daily.m.weighted) parts.push(`kosten ${Math.round(p.cost * 10) / 10}`);
    parts.push(p.done ? 'gehaald!' : 'pijltjes/klik = lopen · T = trap/teleporter' + (daily.m.timed.length ? ' · spatie = wachten' : '') + ' · R = opnieuw');
    $('#hud-daily').textContent = parts.join(' · ');
  }
  const dailyRunner = () => daily;
  function dailyFrame(t) { if (daily) { daily.tick(speedToSpf(70), t); daily.draw(t); dailyHud(); } }
  const ARROWS = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2, d: 0, s: Math.PI / 2, a: Math.PI, w: -Math.PI / 2 };
  function dailyKey(e) {
    if (!daily || !daily.m) return;
    if (ARROWS[e.key] !== undefined) { e.preventDefault(); ML.Play.arrow(daily, ARROWS[e.key]); }
    else if (e.key === ' ') { e.preventDefault(); ML.Play.wait(daily); }
    else if (e.key === 't' || e.key === 'Enter') ML.Play.special(daily);
    else if (e.key === 'r') $('#btn-restart').click();
  }
  $('#btn-restart').addEventListener('click', () => { if (daily && daily.m) { ML.Play.start(daily); D.msg = ''; dailyPanel(); } });
  $('#btn-giveup').addEventListener('click', () => { if (daily && daily.play && !daily.play.done) { daily.play.gaveUp = true; daily.solve('astar'); } });

  Object.assign(A, { dailyEnsure, dailyHud, dailyKey, dailyFrame, dailyRunner });
})(window.ML = window.ML || {});
