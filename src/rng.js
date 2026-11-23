// Zaad-gebaseerde random: zelfde zaadje = zelfde doolhof.
(window.MLDEF = window.MLDEF || []).push(function (ML) { // MLDEF: ook in de Web Worker (evo.js Pool)
  'use strict';
  function hashStr(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  ML.makeRng = function (seed) {
    let a = hashStr(String(seed)) || 1;
    const f = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = n => Math.floor(f() * n);
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.shuffle = arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return f;
  };
  ML.randomSeed = () => Math.random().toString(36).slice(2, 8);
}); MLDEF[MLDEF.length - 1](window.ML = window.ML || {});
