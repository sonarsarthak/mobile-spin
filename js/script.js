/* ==========================================================
   AADISHAKTI MOBILES – DIWALI DHAMAKA 2026 · Spin & Win
   Vanilla JS, no dependencies.

   Sections
     1. CONFIG            – prizes, weights, storage key
     2. SpinGate          – one-spin-per-browser (swap for OTP/backend later)
     3. PrizeService      – weighted prize draw     (swap for server later)
     4. Wheel             – drawing + geometry + spin animation
     5. Winner popup & confetti
     6. Navigation
     7. Fireworks / golden particles background
     8. Boot
   ========================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. CONFIG
     To change odds just edit `weight`. A weight of 0 means the
     prize is drawn on the wheel but can NEVER be selected.
     ---------------------------------------------------------- */
  var STORAGE_KEY = 'aadishakti_diwali_2026_spin';

  var PRIZES = [
    { id: 'thailand',   name: 'Thailand Trip',     lines: ['THAILAND', 'TRIP'],    weight: 0,  image: 'assets/thailand.png',         c1: '#B3224A', c2: '#7C1236', text: '#FFF2CF' },
    { id: 'bags',       name: 'Bags',              lines: ['BAGS'],                weight: 20, image: 'assets/bags.png',             c1: '#FFC24A', c2: '#E0891A', text: '#3B0925' },
    { id: 'trolley',    name: 'Trolley Bags',      lines: ['TROLLEY', 'BAGS'],     weight: 20, image: 'assets/trolley-bag.png',      c1: '#7A2A74', c2: '#4A1050', text: '#FFF2CF' },
    { id: 'headphones', name: 'Headphones',        lines: ['HEAD-', 'PHONES'],     weight: 20, image: 'assets/headphones.png',       c1: '#F59A3A', c2: '#C9601A', text: '#3B0925' },
    { id: 'speaker',    name: 'Wireless Speakers', lines: ['WIRELESS', 'SPEAKERS'],weight: 20, image: 'assets/wireless-speaker.png', c1: '#5B2A8A', c2: '#35104F', text: '#FFF2CF' },
    { id: 'buds',       name: 'Buds',              lines: ['BUDS'],                weight: 20, image: 'assets/buds.png',             c1: '#FFD36A', c2: '#E8A02A', text: '#3B0925' },
    { id: 'goa',        name: 'Goa Trip',          lines: ['GOA', 'TRIP'],         weight: 0,  image: 'assets/goa.png',              c1: '#8E2257', c2: '#56113C', text: '#FFF2CF' }
  ];

  var N = PRIZES.length;
  var SLICE = (2 * Math.PI) / N;
  var SPIN_MS = 6200;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------
     2. SpinGate – one spin per browser
     LocalStorage (+ cookie mirror) only protects ONE BROWSER.
     For real one-per-person protection, add OTP + server check:
       - verifyCustomer()  → send OTP, confirm, return a token
       - canSpin()         → ask server whether this mobile no. already spun
       - record()          → POST the result to the server
     The rest of the app only talks to this object.
     ---------------------------------------------------------- */
  var SpinGate = {
    _mem: null, // last-resort fallback if storage is blocked

    read: function () {
      var raw = null;
      try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
      if (!raw) {
        var m = document.cookie.match(new RegExp('(?:^|; )' + STORAGE_KEY + '=([^;]*)'));
        if (m) { try { raw = decodeURIComponent(m[1]); } catch (e) {} }
      }
      if (!raw) return this._mem;
      try { var d = JSON.parse(raw); return d && d.used ? d : null; } catch (e) { return null; }
    },

    hasSpun: function () { return !!this.read(); },

    record: function (prize, extra) {
      var data = { used: true, prizeId: prize.id, prize: prize.name, at: new Date().toISOString(), campaign: 'DIWALI-DHAMAKA-2026' };
      for (var k in (extra || {})) data[k] = extra[k];
      var json = JSON.stringify(data);
      this._mem = data;
      try { window.localStorage.setItem(STORAGE_KEY, json); } catch (e) {}
      try { document.cookie = STORAGE_KEY + '=' + encodeURIComponent(json) + '; max-age=31536000; path=/; SameSite=Lax'; } catch (e) {}
      return data;
    },

    /* Placeholder for future mobile-OTP step. Currently always allows. */
    verifyCustomer: function () { return Promise.resolve({ ok: true, customer: null }); }
  };

  /* ----------------------------------------------------------
     3. PrizeService – weighted draw (replaceable by an API call)
     Only prizes with weight > 0 are eligible, so zero-weight
     prizes (Thailand, Goa) can never be returned.
     ---------------------------------------------------------- */
  var PrizeService = {
    _random: function () {
      if (window.crypto && window.crypto.getRandomValues) {
        var b = new Uint32Array(1); window.crypto.getRandomValues(b); return b[0] / 4294967296;
      }
      return Math.random();
    },
    pick: function (rnd) {
      var eligible = PRIZES.filter(function (p) { return p.weight > 0; });
      var total = eligible.reduce(function (s, p) { return s + p.weight; }, 0);
      var n = (rnd === undefined ? this._random() : rnd) * total;
      for (var i = 0; i < eligible.length; i++) { n -= eligible[i].weight; if (n < 0) return eligible[i]; }
      return eligible[eligible.length - 1];
    },
    draw: function () { return Promise.resolve(this.pick()); }
  };

  /* ----------------------------------------------------------
     4. Wheel
     Geometry: at rotation θ (clockwise, radians) segment i covers
     [θ + i·SLICE, θ + (i+1)·SLICE] measured clockwise from the TOP,
     where the fixed pointer sits. So the prize under the pointer is
     decided purely by the wheel's final angle.
     ---------------------------------------------------------- */
  var rotor, canvas, ctx, rotation = 0, spinning = false;
  var images = {};

  function norm(a) { var t = 2 * Math.PI; return ((a % t) + t) % t; }

  function indexAtPointer(theta) {
    var phi = norm(-theta);                       // pointer position in wheel coordinates
    return Math.min(N - 1, Math.floor(phi / SLICE));
  }

  function currentAngle() {                       // real on-screen angle of the rotor
    var m = window.getComputedStyle(rotor).transform;
    if (!m || m === 'none') return 0;
    var v = m.match(/matrix\(([^)]+)\)/);
    if (!v) return rotation;
    var p = v[1].split(',').map(parseFloat);
    return Math.atan2(p[1], p[0]);
  }

  function loadImages() {
    return Promise.all(PRIZES.map(function (p) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { images[p.id] = img; res(); };
        img.onerror = function () { res(); };
        img.src = p.image;
      });
    }));
  }

  function drawWheel() {
    var W = canvas.width, cx = W / 2, cy = W / 2, R = W / 2 - 8;
    ctx.clearRect(0, 0, W, W);

    PRIZES.forEach(function (p, i) {
      var a0 = i * SLICE - Math.PI / 2, a1 = a0 + SLICE, mid = a0 + SLICE / 2;

      // segment fill
      var g = ctx.createRadialGradient(cx, cy, R * .15, cx, cy, R);
      g.addColorStop(0, p.c2); g.addColorStop(.55, p.c1); g.addColorStop(1, p.c2);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();

      // content (drawn in a frame where +x points from centre to the rim)
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(mid);

      // soft light behind the product
      var ix = R * .43, glow = ctx.createRadialGradient(ix, 0, 4, ix, 0, 92);
      glow.addColorStop(0, 'rgba(255,248,225,.45)'); glow.addColorStop(1, 'rgba(255,248,225,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ix, 0, 92, 0, Math.PI * 2); ctx.fill();

      var img = images[p.id];
      if (img) {
        ctx.save(); ctx.translate(ix, 0); ctx.rotate(Math.PI / 2);   // upright towards the rim
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
        var s = 142; ctx.drawImage(img, -s / 2, -s / 2, s, s);
        ctx.restore();
      }

      // label
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = '800 33px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = p.text;
      var light = p.text === '#FFF2CF';
      ctx.shadowColor = light ? 'rgba(20,0,16,.75)' : 'rgba(255,240,190,.55)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1;
      var lh = 36, y0 = -(p.lines.length - 1) * lh / 2;
      p.lines.forEach(function (ln, k) { ctx.fillText(ln, R * .925, y0 + k * lh, 168); });
      ctx.restore();
    });

    // dividers
    ctx.lineCap = 'round';
    for (var i = 0; i < N; i++) {
      var a = i * SLICE - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = '#FFD36A'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // outer + inner rings
    ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, Math.PI * 2); ctx.strokeStyle = '#FFD36A'; ctx.lineWidth = 8; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R - 16, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,240,176,.45)'; ctx.lineWidth = 2; ctx.stroke();
  }

  function buildBulbs() {
    var wrap = $('bulbs'), n = 24, f = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var b = document.createElement('i'); b.className = 'bulb';
      b.style.setProperty('--a', (i * 360 / n) + 'deg'); f.appendChild(b);
    }
    wrap.appendChild(f);
  }

  function setRotation(theta, animate) {
    rotor.style.transition = animate ? 'transform ' + (reduceMotion ? 1500 : SPIN_MS) + 'ms cubic-bezier(.22,.62,.12,1)' : 'none';
    rotor.style.transform = 'rotate(' + theta + 'rad)';
  }

  function startTicker() {                          // pointer "click" each time a divider passes
    var pointer = document.querySelector('.pointer'), last = indexAtPointer(currentAngle());
    (function loop() {
      if (!spinning) return;
      var i = indexAtPointer(currentAngle());
      if (i !== last) { last = i; pointer.classList.remove('tick'); void pointer.offsetWidth; pointer.classList.add('tick'); }
      requestAnimationFrame(loop);
    })();
  }

  function spin() {
    if (spinning || SpinGate.hasSpun()) { refreshSpinState(); return; }
    spinning = true;
    $('spinBtn').disabled = true;
    $('spinBtn').classList.remove('pulse');

    SpinGate.verifyCustomer().then(function (v) {
      if (!v || !v.ok) throw new Error('verification failed');
      return PrizeService.draw();
    }).then(function (prize) {
      var idx = PRIZES.indexOf(prize);
      if (idx < 0 || prize.weight <= 0) throw new Error('invalid prize'); // safety net

      // Lock the spin immediately: a refresh mid-spin must not grant a 2nd spin.
      SpinGate.record(prize, { status: 'spinning' });

      // Land somewhere inside the chosen segment (not always dead-centre, never on a divider).
      var within = (0.5 + (Math.random() - 0.5) * 0.62) * SLICE;
      var phi = idx * SLICE + within;                           // wheel coordinate under pointer
      var turns = 6 + Math.floor(Math.random() * 3);            // 6–8 full rotations
      var target = rotation + turns * 2 * Math.PI + norm(-phi - rotation);

      var finished = false, deadline = performance.now() + (reduceMotion ? 1500 : SPIN_MS) + 8000;
      function angleGap() {                                      // distance from target angle (radians)
        var d = norm(currentAngle() - target); return Math.min(d, 2 * Math.PI - d);
      }
      function finish() {
        if (finished) return; finished = true;
        rotor.removeEventListener('transitionend', onEnd);
        if (angleGap() > 0.02) setRotation(target, false);       // timed out (e.g. background tab): snap to target
        rotation = target; spinning = false;
        // Result is READ FROM THE WHEEL'S ACTUAL FINAL POSITION.
        var landed = PRIZES[indexAtPointer(currentAngle())];
        if (landed !== prize) {                                  // should never happen; keep wheel and prize consistent
          if (window.console) console.warn('Landed prize differs from drawn prize', landed.name, prize.name);
          setRotation(target, false); landed = prize;
        }
        SpinGate.record(landed, { status: 'completed' });
        showWinner(landed);
      }
      // Only accept completion once the wheel is really at rest on the target
      // (a late-starting transition on a busy phone must not be read mid-spin).
      function check() {
        if (finished) return;
        if (angleGap() <= 0.02 || performance.now() > deadline) finish(); else window.setTimeout(check, 250);
      }
      function onEnd(e) { if (e.target === rotor && e.propertyName === 'transform') check(); }
      rotor.addEventListener('transitionend', onEnd);
      window.setTimeout(check, (reduceMotion ? 1500 : SPIN_MS) + 600);

      void rotor.offsetWidth;
      setRotation(target, true);
      startTicker();
    }).catch(function (err) {
      spinning = false;
      if (window.console) console.error(err);
      refreshSpinState();
    });
  }

  function refreshSpinState() {
    var used = SpinGate.read(), btn = $('spinBtn');
    btn.disabled = !!used || spinning;
    btn.textContent = used ? 'SPIN USED' : 'SPIN NOW';
    if (used) btn.classList.remove('pulse');
    // The "already used" card is shown after the popup is dismissed (or on any later visit).
    var showCard = !!used && !spinning && $('winModal').hidden;
    $('usedCard').hidden = !showCard;
    var pz = $('usedPrize');
    if (showCard && used.prize) { pz.hidden = false; pz.innerHTML = 'Your reward: <strong></strong>'; pz.firstChild.nextSibling.textContent = used.prize; }
    else pz.hidden = true;
  }

  /* ----------------------------------------------------------
     5. Winner popup + confetti
     ---------------------------------------------------------- */
  function showWinner(prize) {
    var img = $('wonImage');
    img.src = prize.image; img.alt = prize.name;
    $('wonName').textContent = prize.name;
    $('liveResult').textContent = 'Congratulations! You have won ' + prize.name + '.';
    $('winModal').hidden = false;
    document.body.style.overflow = 'hidden';
    $('winCard').focus({ preventScroll: true });
    refreshSpinState();
    Confetti.burst();
  }

  function closeWinner() {
    $('winModal').hidden = true;
    document.body.style.overflow = '';
    Confetti.stop();
    refreshSpinState();
    var card = $('usedCard');
    if (!card.hidden && card.scrollIntoView) card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  var Confetti = (function () {
    var cv, c, parts = [], raf = null, timers = [], COLORS = ['#FFD36A', '#FFAD25', '#FFF2CF', '#FFE9A0', '#E6A027', '#FFFFFF'];
    function size() {
      var d = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = window.innerWidth * d; cv.height = window.innerHeight * d; c.setTransform(d, 0, 0, d, 0, 0);
    }
    function add(n, x, y, spread, power) {
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * spread, v = power * (0.45 + Math.random() * 0.75);
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 7, h: 3 + Math.random() * 5,
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: COLORS[(Math.random() * COLORS.length) | 0],
          round: Math.random() < 0.25, life: 1, ph: Math.random() * 6 });
      }
    }
    function loop() {
      c.clearRect(0, 0, window.innerWidth, window.innerHeight);
      parts = parts.filter(function (p) { return p.life > 0 && p.y < window.innerHeight + 30; });
      parts.forEach(function (p) {
        p.vy += 0.16; p.vx *= 0.992; p.vy *= 0.992; p.x += p.vx + Math.sin(p.ph += .08) * .6; p.y += p.vy; p.r += p.vr;
        if (p.y > window.innerHeight * 0.55) p.life -= 0.012;
        c.save(); c.globalAlpha = Math.max(p.life, 0); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.col;
        if (p.round) { c.beginPath(); c.arc(0, 0, p.h, 0, 7); c.fill(); } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        c.restore();
      });
      raf = parts.length ? requestAnimationFrame(loop) : null;
      if (!raf) c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    function go() { if (!raf) raf = requestAnimationFrame(loop); }
    return {
      burst: function () {
        if (reduceMotion) return;
        cv = cv || $('confettiCanvas'); c = c || cv.getContext('2d'); size();
        var w = window.innerWidth, h = window.innerHeight, k = w < 600 ? 0.7 : 1;
        add(90 * k | 0, w / 2, h * 0.38, 2.6, 17); go();
        timers.push(setTimeout(function () { add(55 * k | 0, 0, h * 0.8, 1.0, 22); add(55 * k | 0, w, h * 0.8, 1.0, 22); parts.slice(-110).forEach(function (p) { if (p.x < 5) p.vx = Math.abs(p.vx); else p.vx = -Math.abs(p.vx); }); go(); }, 450));
        timers.push(setTimeout(function () { add(70 * k | 0, w / 2, h * 0.3, 3.0, 13); go(); }, 1500));
      },
      stop: function () { timers.forEach(clearTimeout); timers = []; parts = []; if (raf) cancelAnimationFrame(raf); raf = null; if (c) c.clearRect(0, 0, cv.width, cv.height); }
    };
  })();

  /* ----------------------------------------------------------
     6. Navigation (hash based so Back/Forward work)
     ---------------------------------------------------------- */
  var current = null;

  function show(name, instant) {
    var landing = $('pageLanding'), wheel = $('pageWheel');
    var next = name === 'wheel' ? wheel : landing, prev = name === 'wheel' ? landing : wheel;
    if (current === name) return;
    current = name;
    prev.classList.remove('is-active'); prev.classList.add('is-leaving');
    var swap = function () {
      prev.hidden = true; prev.classList.remove('is-leaving');
      next.hidden = false; void next.offsetWidth; next.classList.add('is-active');
      window.scrollTo(0, 0);
      if (name === 'wheel') refreshSpinState();
    };
    if (instant || reduceMotion) swap(); else window.setTimeout(swap, 320);
  }

  function routeFromHash() { return window.location.hash === '#spin' ? 'wheel' : 'landing'; }

  function goWheel() { history.pushState({ n: 1 }, '', '#spin'); show('wheel'); }
  function goLanding() {
    if (history.state && history.state.n) history.back();
    else { history.replaceState(null, '', window.location.pathname + window.location.search); show('landing'); }
  }

  /* ----------------------------------------------------------
     7. Fireworks + golden particles (subtle, pauses when hidden)
     ---------------------------------------------------------- */
  function startFx() {
    if (reduceMotion) return;
    var cv = $('fxCanvas'), c = cv.getContext('2d'), W, H, D;
    var sparks = [], dust = [], next = 600, last = performance.now(), running = true;
    var GOLDS = ['255,211,106', '255,173,37', '255,242,207', '255,224,150'];
    function resize() {
      D = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * D; cv.height = H * D; c.setTransform(D, 0, 0, D, 0, 0);
    }
    resize(); window.addEventListener('resize', resize);
    var nDust = W < 600 ? 22 : 40;
    for (var i = 0; i < nDust; i++) dust.push({ x: Math.random() * W, y: Math.random() * H, r: .6 + Math.random() * 1.6, v: .1 + Math.random() * .3, ph: Math.random() * 6, a: .2 + Math.random() * .5 });

    function burst() {
      var x = W * (.12 + Math.random() * .76), y = H * (.08 + Math.random() * .42), col = GOLDS[(Math.random() * GOLDS.length) | 0];
      var n = W < 600 ? 34 : 52, pw = 1.6 + Math.random() * 1.6;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2 + Math.random() * .1, v = pw * (.7 + Math.random() * .5);
        sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col: col });
      }
    }
    document.addEventListener('visibilitychange', function () { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });

    function frame(t) {
      if (!running) return;
      var dt = Math.min((t - last) / 16.7, 3); last = t;
      c.clearRect(0, 0, W, H);
      next -= dt * 16.7; if (next <= 0) { burst(); next = 2400 + Math.random() * 2800; }

      for (var i = sparks.length - 1; i >= 0; i--) {
        var s = sparks[i];
        s.vx *= .985; s.vy = s.vy * .985 + .022 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= .0085 * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        c.beginPath(); c.fillStyle = 'rgba(' + s.col + ',' + (s.life * .75).toFixed(3) + ')';
        c.arc(s.x, s.y, 1.5 * s.life + .3, 0, 7); c.fill();
      }
      dust.forEach(function (d) {
        d.y -= d.v * dt; d.x += Math.sin(d.ph += .01 * dt) * .25; if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
        c.beginPath(); c.fillStyle = 'rgba(255,211,106,' + (d.a * (.6 + .4 * Math.sin(d.ph * 3))).toFixed(3) + ')';
        c.arc(d.x, d.y, d.r, 0, 7); c.fill();
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------
     8. Boot
     ---------------------------------------------------------- */
  function init() {
    rotor = $('wheelRotor'); canvas = $('wheelCanvas'); ctx = canvas.getContext('2d');
    buildBulbs();
    drawWheel();
    loadImages().then(drawWheel);

    // If the customer already spun, park the wheel on their prize.
    var used = SpinGate.read();
    if (used) {
      var i = PRIZES.map(function (p) { return p.id; }).indexOf(used.prizeId);
      if (i >= 0) { rotation = norm(-(i + .5) * SLICE); setRotation(rotation, false); }
    }

    $('redeemBtn').addEventListener('click', goWheel);
    $('backBtn').addEventListener('click', goLanding);
    $('spinBtn').addEventListener('click', spin);
    $('continueBtn').addEventListener('click', closeWinner);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('winModal').hidden) closeWinner(); });
    window.addEventListener('popstate', function () { show(routeFromHash()); });
    // storage event: if another tab spins, lock this one too
    window.addEventListener('storage', function (e) { if (e.key === STORAGE_KEY) refreshSpinState(); });

    // Start page (deep link #spin supported)
    var start = routeFromHash();
    if (start === 'wheel') { $('pageLanding').hidden = true; $('pageWheel').hidden = false; $('pageWheel').classList.add('is-active'); $('pageLanding').classList.remove('is-active'); current = 'wheel'; refreshSpinState(); }
    else current = 'landing';

    startFx();
  }

  // Small public surface for QA / future backend wiring.
  window.AadishaktiSpin = { PRIZES: PRIZES, PrizeService: PrizeService, SpinGate: SpinGate, indexAtPointer: indexAtPointer };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
