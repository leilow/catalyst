// Reaction–diffusion background for the main page (Gray–Scott model).
// Each aired episode plants one seed. The cursor adds catalyst along its path,
// speeds growth while it moves, and pulls the pattern toward itself.
// Holding the mouse (or a finger) down turns the strands green; the green
// travels only along connected strands and spreads further the longer you hold.
// Keep holding past YELLOW_AFTER_SEC and pastel yellow follows through the green.
// Double-click (or double-tap) the background to send a cerulean wash outward
// that clears the green and yellow away.
(function () {
  const BG = [214, 228, 240];          // Mist
  const FG = BG.map((c) => Math.round(c * 0.96)); // contrast 4
  const GREEN = [205, 225, 211];       // pastel mint, same lightness as the Mist strands
  const GREEN_SPREAD = 0.985, GREEN_FADE = 0.992; // per-cell thinning, per-frame fade after release
  const GREEN_CELLS_PER_SEC = 20;      // about 85px a second
  const YELLOW = [228, 222, 192];      // pastel yellow, same lightness as the strands
  const YELLOW_AFTER_SEC = 4;          // seconds of holding before yellow starts
  const CERULEAN = [172, 208, 236];    // pastel cerulean for the wash
  const WASH_CELLS_PER_SEC = 90;       // how fast the wash ring travels
  const WASH_WIDTH = 9;                // ring thickness in cells
  const HOLLOW = 0.57, SOFT = 1.0;
  const STIR = 0.6, PULL = 0.5, REACH = 0.5;
  const PX_PER_CELL = 360 / 85;        // scale 7
  const F = 0.0545, K = 0.062;         // coral regime
  const K_SCALE = 85 / 180;            // tuning was done on a 180-cell grid

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const slow = reduced ? 0.3 : 1;
  const seedCount = Number(document.getElementById("pattern").dataset.seeds) || 9;

  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  new p5((p) => {
    let W, H, u, v, u2, v2, g, g2, yl, yl2, ce, img, holdSec = 0, washes = [], washLife = 0, calmFrames = 0, wasHolding = false, bgPress = false, lastPressAt = 0, lastFrameMs = 0, lx = null, ly = null, heat = 0, mouseIn = false, warmup = 0, greenLife = 0, greenClock = 0;

    // How much a cell conducts green: only cells that are part of a strand.
    const strand = (x) => ss(0.08, 0.16, x);

    // Advance a color front one cell outward from the cursor, only into cells
    // that `conduct` allows, thinning a little each cell. Returns the new array.
    function grow(a, b, mx, my, conduct) {
      const r = 4, cx = Math.floor(mx), cy = Math.floor(my);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        a[((cy + y + H) % H) * W + ((cx + x + W) % W)] = 1;
      }
      for (let y = 0; y < H; y++) {
        const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yc = y * W;
        for (let x = 0; x < W; x++) {
          const i = yc + x, c = conduct(i);
          if (c === 0) { b[i] = a[i]; continue; }
          const m = Math.max(a[yc + ((x - 1 + W) % W)], a[yc + ((x + 1) % W)], a[ym + x], a[yp + x]);
          b[i] = Math.max(a[i], m * GREEN_SPREAD * c);
        }
      }
      return b;
    }
    const greenPath = (i) => strand(v[i]);
    const yellowPath = (i) => strand(v[i]) * ss(0.25, 0.5, g[i]); // only where it's already green

    function fadeColors(rate) {
      for (let i = 0; i < W * H; i++) { g[i] *= rate; yl[i] *= rate; }
    }

    // Bells (assets/sound.js) are optional; the sketch works the same without them.
    const bell = (name, ...args) => { if (window.catalystSound) window.catalystSound[name](...args); };

    function startWash(px, py) {
      bell("wash");
      if (reduced) { calmFrames = 60; return; } // no ripple; just let the colors settle away
      washes.push({ x: (px / p.width) * W, y: (py / p.height) * H, r: 0 });
      washLife = 240;
    }

    // Move each wash ring outward: cells it has passed lose their green and yellow,
    // and strand cells under the ring itself light up cerulean.
    function runWashes(dt) {
      const maxR = Math.hypot(W, H);
      for (const w of washes) {
        w.r += dt * WASH_CELLS_PER_SEC;
        for (let y = 0; y < H; y++) {
          const dy = y - w.y;
          for (let x = 0; x < W; x++) {
            const d = Math.hypot(x - w.x, dy);
            if (d > w.r) continue;
            const i = y * W + x;
            g[i] = 0; yl[i] = 0;
            const band = w.r - d;
            if (band < WASH_WIDTH) ce[i] = Math.max(ce[i], strand(v[i]) * (1 - band / WASH_WIDTH));
          }
        }
      }
      washes = washes.filter((w) => w.r < maxR);
      for (let i = 0; i < W * H; i++) ce[i] *= 0.95; // the ring leaves a short cerulean trail
    }

    function addV(cx, cy, r, a) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const i = ((cy + y + H) % H) * W + ((cx + x + W) % W);
        v[i] = Math.min(1, v[i] + a); u[i] = Math.max(0, u[i] - a * 0.5);
      }
    }

    function samp(a, x, y) {
      x = ((x % W) + W) % W; y = ((y % H) + H) % H;
      const x0 = x | 0, y0 = y | 0, x1 = (x0 + 1) % W, y1 = (y0 + 1) % H, fx = x - x0, fy = y - y0;
      return a[y0 * W + x0] * (1 - fx) * (1 - fy) + a[y0 * W + x1] * fx * (1 - fy) +
             a[y1 * W + x0] * (1 - fx) * fy + a[y1 * W + x1] * fx * fy;
    }

    function advect(mx, my) {
      const R = (12 + REACH * 48) * K_SCALE, R2 = R * R, amt = PULL * 1.2 * slow;
      const x0 = Math.max(0, Math.floor(mx - R)), x1 = Math.min(W - 1, Math.ceil(mx + R));
      const y0 = Math.max(0, Math.floor(my - R)), y1 = Math.min(H - 1, Math.ceil(my + R));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; u2[i] = u[i]; v2[i] = v[i]; }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = mx - x, dy = my - y, d2 = dx * dx + dy * dy;
        if (d2 > R2 || d2 < 1) continue;
        const d = Math.sqrt(d2), fall = Math.pow(1 - d / R, 1.5), s = Math.min(d * 0.9, amt * fall * 3);
        const i = y * W + x;
        u2[i] = samp(u, x - (dx / d) * s, y - (dy / d) * s);
        v2[i] = samp(v, x - (dx / d) * s, y - (dy / d) * s);
      }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; u[i] = u2[i]; v[i] = v2[i]; }
    }

    function init() {
      W = Math.max(40, Math.ceil(window.innerWidth / PX_PER_CELL));
      H = Math.max(40, Math.ceil(window.innerHeight / PX_PER_CELL));
      u = new Float32Array(W * H).fill(1); v = new Float32Array(W * H);
      u2 = new Float32Array(W * H); v2 = new Float32Array(W * H);
      g = new Float32Array(W * H); g2 = new Float32Array(W * H); greenLife = 0;
      yl = new Float32Array(W * H); yl2 = new Float32Array(W * H);
      ce = new Float32Array(W * H); washes = []; washLife = 0;
      img = p.createImage(W, H);
      for (let i = 0; i < seedCount; i++) {
        const a = i * 2.39996, r = 0.16 + 0.3 * Math.sqrt((i + 0.5) / seedCount);
        addV(Math.floor((0.5 + r * Math.cos(a)) * W), Math.floor((0.5 + r * Math.sin(a)) * H), 2, 1);
      }
      // Faint spores between the episode seeds, so a large screen fills in
      // within seconds instead of minutes.
      const spores = Math.round((W * H) / 450);
      for (let i = 0; i < spores; i++) addV(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 1, 0.5);
      for (let s = 0; s < 500; s++) step();
      warmup = reduced ? 0 : 180;
    }

    function step() {
      for (let y = 0; y < H; y++) {
        const ym = ((y - 1 + H) % H) * W, yp = ((y + 1) % H) * W, yc = y * W;
        for (let x = 0; x < W; x++) {
          const xm = (x - 1 + W) % W, xp = (x + 1) % W, i = yc + x;
          const lu = 0.2 * (u[yc + xm] + u[yc + xp] + u[ym + x] + u[yp + x]) + 0.05 * (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) - u[i];
          const lv = 0.2 * (v[yc + xm] + v[yc + xp] + v[ym + x] + v[yp + x]) + 0.05 * (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) - v[i];
          const uvv = u[i] * v[i] * v[i];
          u2[i] = u[i] + lu - uvv + F * (1 - u[i]);
          v2[i] = v[i] + 0.5 * lv + uvv - (K + F) * v[i];
        }
      }
      let t = u; u = u2; u2 = t; t = v; v = v2; v2 = t;
    }

    p.setup = () => {
      if (new URLSearchParams(location.search).has("debug")) window.__sketch = p; // lets tests step frames
      p.pixelDensity(1);
      p.createCanvas(window.innerWidth, window.innerHeight).parent("pattern");
      init();
      document.addEventListener("mouseleave", () => { mouseIn = false; });
      document.addEventListener("mousemove", () => { mouseIn = true; });
      document.addEventListener("touchstart", () => { mouseIn = true; }, { passive: true });
      document.addEventListener("visibilitychange", () => (document.hidden ? p.noLoop() : p.loop()));

      // Only the open background counts, not titles, tags, links, or the episode panel.
      const onBackground = (el) => !(el && el.closest && el.closest("a, button, input, .tags, .panel, .links"));
      document.addEventListener("pointerdown", (e) => { bgPress = onBackground(e.target); }, { passive: true });
      document.addEventListener("dblclick", (e) => { if (onBackground(e.target)) startWash(e.clientX, e.clientY); });
      let lastTap = null;
      document.addEventListener("touchend", (e) => {
        const t = e.changedTouches[0];
        if (!t || !onBackground(e.target)) { lastTap = null; return; }
        const now = performance.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 40) {
          e.preventDefault(); // keep the double-tap from zooming the page
          startWash(t.clientX, t.clientY);
          lastTap = null;
        } else lastTap = { t: now, x: t.clientX, y: t.clientY };
      }, { passive: false });
    };

    let resizeTimer;
    p.windowResized = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Phones resize the viewport as the address bar slides away; stretch the
        // existing pattern for that instead of regrowing it.
        const regrow = Math.abs(window.innerWidth - p.width) > 2 || Math.abs(window.innerHeight - p.height) > 160;
        p.resizeCanvas(window.innerWidth, window.innerHeight);
        if (regrow) init();
      }, 250);
    };

    p.draw = () => {
      const inside = mouseIn && p.mouseX >= 0 && p.mouseX < p.width && p.mouseY >= 0 && p.mouseY < p.height;
      let mx, my;
      if (inside) {
        mx = (p.mouseX / p.width) * W; my = (p.mouseY / p.height) * H;
        if (lx !== null) {
          const d = Math.hypot(mx - lx, my - ly), n = Math.ceil(d / 1.5);
          for (let q = 0; q <= n; q++) {
            const f = n ? q / n : 0;
            addV(Math.floor(lx + (mx - lx) * f), Math.floor(ly + (my - ly) * f), Math.max(1, Math.round((2 + STIR * 2) * K_SCALE)), 0.15 + STIR * 0.35);
          }
          heat = Math.min(1, heat + 0.04 + (d / K_SCALE) * 0.01);
        }
        if (p.mouseIsPressed) addV(Math.floor(mx), Math.floor(my), Math.max(2, Math.round(5 * K_SCALE)), 1);
        lx = mx; ly = my;
      } else { lx = null; ly = null; }
      heat *= 0.97;

      // For the first few seconds after load, grow faster so the page settles into its pattern.
      const boost = warmup > 0 ? 30 * (warmup-- / 180) : 0;
      const steps = Math.max(2, Math.round((10 + boost + (reduced ? 0 : heat * STIR * 26)) * slow));
      for (let s = 0; s < steps; s++) {
        if (inside && s % 2 === 0) advect(mx, my);
        step();
      }

      // Green only runs while someone is holding, and for a while after it fades.
      const holding = inside && p.mouseIsPressed;
      const nowMs = performance.now();
      const dt = Math.min(nowMs - (lastFrameMs || nowMs), 250) / 1000; // seconds since last frame
      lastFrameMs = nowMs;
      if (holding && !wasHolding && bgPress) {
        const now = performance.now();
        if (now - lastPressAt > 400) bell("press", p.mouseX / p.width); // the 2nd click of a double-click stays quiet
        lastPressAt = now;
      }
      wasHolding = holding;
      const before = holdSec;
      holdSec = holding ? holdSec + dt : 0;
      if (bgPress && before <= YELLOW_AFTER_SEC && holdSec > YELLOW_AFTER_SEC) bell("ripen");
      if (holding) greenLife = 1500;
      if (greenLife > 0) {
        greenLife--;
        if (!holding) fadeColors(GREEN_FADE);
        else {
          // Advance the fronts at a steady GREEN_CELLS_PER_SEC, whatever the frame rate.
          greenClock += dt * GREEN_CELLS_PER_SEC;
          while (greenClock >= 1) {
            let t = grow(g, g2, mx, my, greenPath); g2 = g; g = t;
            if (holdSec > YELLOW_AFTER_SEC) { t = grow(yl, yl2, mx, my, yellowPath); yl2 = yl; yl = t; }
            greenClock -= 1;
          }
        }
      }

      if (washLife > 0) { washLife--; runWashes(dt); }
      if (calmFrames > 0) { calmFrames--; fadeColors(0.9); }

      const w = 0.02 + SOFT * 0.08, e0 = 0.1, peak = e0 + w, c0 = 0.34 - HOLLOW * 0.14;
      img.loadPixels();
      for (let i = 0; i < W * H; i++) {
        const x = v[i], gr = greenLife > 0 ? g[i] : 0, ye = greenLife > 0 ? yl[i] : 0, cr = washLife > 0 ? ce[i] : 0;
        let t = ss(e0 - w * 0.5, peak, x);
        t *= 1 - HOLLOW * ss(peak, Math.max(peak + 0.01, c0 + w * 0.5), x);
        const j = i * 4;
        for (let k = 0; k < 3; k++) {
          let strandColor = FG[k] + (GREEN[k] - FG[k]) * gr + (YELLOW[k] - GREEN[k]) * Math.min(ye, gr);
          strandColor += (CERULEAN[k] - strandColor) * cr;
          img.pixels[j + k] = BG[k] + (strandColor - BG[k]) * t;
        }
        img.pixels[j + 3] = 255;
      }
      img.updatePixels();
      p.image(img, 0, 0, p.width, p.height);
    };
  });
})();
