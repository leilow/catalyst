// Soft bells for the background's hidden gestures, synthesized with Tone.js
// (MIT, https://tonejs.github.io). Nothing loads until someone first presses
// the background, and the footer's Sound link turns it off (remembered per visitor).
(function () {
  const TONE = "https://cdnjs.cloudflare.com/ajax/libs/tone/15.1.22/Tone.js";
  const SCALE = ["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5", "B5"]; // D major pentatonic
  const KEY = "catalyst-sound";

  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) {}

  let loading = null, bells = null;

  // Load Tone.js once, unlock audio (must happen inside a click or tap), and build the bells.
  function ready() {
    if (!on) return Promise.resolve(null);
    if (bells) return Promise.resolve(bells);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = TONE;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      }).then(async () => {
        await Tone.start();
        const reverb = new Tone.Reverb({ decay: 5, wet: 0.45 }).toDestination();
        bells = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3.01,
          modulationIndex: 6,
          oscillator: { type: "sine" },
          modulation: { type: "sine" },
          envelope: { attack: 0.004, decay: 2.8, sustain: 0, release: 2.8 },
          modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.6 },
          volume: -20,
        }).connect(reverb);
        return bells;
      }).catch(() => { loading = null; return null; });
    }
    return loading;
  }

  const ring = (notes, gap, velocity) =>
    ready().then((b) => {
      if (!b || !on) return;
      const t = Tone.now();
      notes.forEach((n, i) => b.triggerAttackRelease(n, 2.5, t + i * gap, velocity));
    });

  // Unlock audio on the first background press, even before a bell is asked for.
  document.addEventListener("pointerdown", () => { ready(); }, { once: true, passive: true });

  window.catalystSound = {
    // xFrac: 0 at the left edge of the screen, 1 at the right. Picks the pitch.
    press(xFrac) {
      const i = Math.max(0, Math.min(5, Math.round(xFrac * 5)));
      ring([SCALE[i]], 0, 0.55);
    },
    ripen() { ring(["A5", "D5"], 0.22, 0.4); },
    wash() { ring(["B5", "A5", "F#5", "E5", "D5", "A4"], 0.11, 0.35); },
  };

  // Footer toggle.
  const btn = document.querySelector(".sound-toggle");
  if (btn) {
    const paint = () => { btn.textContent = on ? "Sound on" : "Sound off"; btn.setAttribute("aria-pressed", String(on)); };
    paint();
    btn.addEventListener("click", () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
      paint();
      if (on) ring(["D5"], 0, 0.4); // a quiet confirmation
    });
  }
})();
