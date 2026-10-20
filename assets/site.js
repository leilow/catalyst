// Tag dimming, the on-air date, the audio player, and (on wide screens) the
// right-side panel that opens episodes over the main page.
(function () {
  const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z"/></svg>';
  const fmt = (s) => (isFinite(s) ? Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") : "0:00");

  function initPlayer(root) {
    const player = root.querySelector(".player");
    if (!player) return;
    const audio = player.querySelector("audio");
    const btn = player.querySelector("button");
    const bar = player.querySelector("input");
    const time = player.querySelector(".time");
    const paint = () => {
      const d = audio.duration || 0;
      bar.max = d || 1;
      bar.value = audio.currentTime;
      bar.style.setProperty("--p", d ? (audio.currentTime / d) * 100 + "%" : "0%");
      time.textContent = fmt(audio.currentTime) + " / " + fmt(d);
    };
    btn.innerHTML = PLAY;
    btn.addEventListener("click", () => (audio.paused ? audio.play() : audio.pause()));
    audio.addEventListener("play", () => { btn.innerHTML = PAUSE; btn.setAttribute("aria-label", "Pause"); });
    audio.addEventListener("pause", () => { btn.innerHTML = PLAY; btn.setAttribute("aria-label", "Play"); });
    audio.addEventListener("timeupdate", paint);
    const onMeta = () => {
      paint();
      const len = root.querySelector("[data-length]");
      if (len) len.textContent = " · " + fmt(audio.duration);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    if (audio.readyState >= 1) onMeta();
    bar.addEventListener("input", () => { audio.currentTime = Number(bar.value); paint(); });
  }

  // Tags: highlight matching episodes, remembered in the URL as ?tag=
  const tagBox = document.querySelector(".tags");
  let applyTag = () => {};
  if (tagBox) {
    const items = [...document.querySelectorAll(".index li")];
    applyTag = (tag) => {
      tagBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tag === tag)));
      items.forEach((li) => li.classList.toggle("dim", !!tag && !li.dataset.tags.split("|").includes(tag)));
    };
    tagBox.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const tag = b.getAttribute("aria-pressed") === "true" ? null : b.dataset.tag;
      applyTag(tag);
      const url = new URL(location.href);
      tag ? url.searchParams.set("tag", tag) : url.searchParams.delete("tag");
      history.replaceState(history.state, "", url);
    });
    const start = new URL(location.href).searchParams.get("tag");
    if (start) applyTag(start);
  }

  // Next airing date. Hawaiʻi has no daylight saving, so the air time is a fixed UTC−10 instant.
  const onair = document.querySelector(".onair");
  if (onair) {
    const weeks = onair.dataset.weeks ? onair.dataset.weeks.split(",").map(Number) : [];
    const [hh, mm] = onair.dataset.time.split(":").map(Number);
    const now = Date.now();
    const hst = new Date(now - 10 * 3600 * 1000); // read its UTC fields as Hawaiʻi wall time
    let next = null;
    for (let i = 0; i < 70 && !next; i++) {
      const d = new Date(Date.UTC(hst.getUTCFullYear(), hst.getUTCMonth(), hst.getUTCDate() + i));
      const isFriday = d.getUTCDay() === 5;
      const week = Math.ceil(d.getUTCDate() / 7);
      const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh + 10, mm);
      if (isFriday && (!weeks.length || weeks.includes(week)) && at > now) next = new Date(at);
    }
    if (next) {
      const day = new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Honolulu", weekday: "long", month: "long", day: "numeric" }).format(next);
      onair.querySelector(".next-air").textContent = `Next show: ${day}`;
    }
  }

  // A standalone episode page just needs its player.
  if (!document.querySelector(".home")) {
    initPlayer(document);
    return;
  }

  // ---- Episode panel (main page, wide screens only) ----
  const wide = window.matchMedia("(min-width: 760px)");
  const homeUrl = new URL(".", location.href); // the folder the main page lives in
  const isEpisode = (url) => url.origin === homeUrl.origin && url.pathname.startsWith(homeUrl.pathname + "episodes/");
  const isHome = (url) => url.origin === homeUrl.origin && url.pathname === homeUrl.pathname;
  const cache = new Map();
  let panel = null, opener = null;

  // Links on the main page become absolute, so they still work while the
  // address bar shows an episode's URL.
  document.querySelectorAll(".home a[href]").forEach((a) => a.setAttribute("href", a.href));

  // Close the panel and put the main page's address back (keeping any ?tag=).
  function goHome() {
    history.pushState(null, "", homeUrl.href + new URL(location.href).search);
    close();
  }

  function markCurrent(url) {
    document.querySelectorAll(".index a").forEach((a) => a.classList.toggle("current", !!url && a.href === url));
  }

  async function load(url) {
    if (!cache.has(url)) {
      const res = await fetch(url, { cache: "no-cache" }); // always check for the latest version
      if (!res.ok) throw new Error(res.status);
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const main = doc.querySelector("main.ep");
      // Resolve the episode page's relative links against its own address.
      main.querySelectorAll("[href]").forEach((el) => el.setAttribute("href", new URL(el.getAttribute("href"), url).href));
      main.querySelectorAll("[src]").forEach((el) => el.setAttribute("src", new URL(el.getAttribute("src"), url).href));
      cache.set(url, { html: main.outerHTML, title: doc.title });
    }
    return cache.get(url);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.className = "panel";
    panel.setAttribute("aria-label", "Episode");
    panel.tabIndex = -1;
    document.body.appendChild(panel);
    panel.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const url = new URL(a.href);
      if (a.classList.contains("close") || (isHome(url) && !url.search)) {
        e.preventDefault();
        goHome();
      } else if (isHome(url) && url.searchParams.get("tag")) {
        e.preventDefault();
        history.pushState(null, "", url.href);
        close();
        applyTag(url.searchParams.get("tag"));
      } else if (isEpisode(url)) {
        e.preventDefault();
        history.pushState({ episode: url.href }, "", url.href);
        open(url.href);
      }
    });
    return panel;
  }

  async function open(url) {
    const p = ensurePanel();
    let page;
    try { page = await load(url); } catch { location.href = url; return; }
    const old = p.querySelector("audio");
    if (old) old.pause();
    p.innerHTML = page.html;
    // In the panel, the back link becomes a close button in the top-right corner.
    const back = p.querySelector(".ep-head .chip");
    if (back) { back.classList.add("close"); back.textContent = "×"; back.setAttribute("aria-label", "Close episode"); }
    initPlayer(p);
    p.scrollTop = 0;
    document.title = page.title;
    markCurrent(url);
    document.body.classList.add("panel-open");
    requestAnimationFrame(() => p.classList.add("open"));
    p.focus({ preventScroll: true });
  }

  function close() {
    if (!panel) return;
    const a = panel.querySelector("audio");
    if (a) a.pause();
    panel.classList.remove("open");
    document.body.classList.remove("panel-open");
    document.title = "The Catalyst";
    markCurrent(null);
    if (opener) opener.focus({ preventScroll: true });
  }

  document.querySelector(".index").addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || !wide.matches || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    opener = a;
    history.pushState({ episode: a.href }, "", a.href);
    open(a.href);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("panel-open")) goHome();
  });

  window.addEventListener("popstate", () => {
    const url = new URL(location.href);
    if (isEpisode(url)) open(url.href);
    else close();
  });
})();
