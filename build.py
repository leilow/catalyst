#!/usr/bin/env python3
"""Build The Catalyst site into dist/.

Reads content/episodes.json, downloads each episode's audio (and its image, when
it has an imageDriveId) from Google Drive, cached in .cache/, and writes static
HTML. Standard library only, so it runs the same on a Mac and in a GitHub Action.

    python3 build.py          # build
    python3 build.py --serve  # build, then preview at http://localhost:8000
"""
import datetime as dt
import html
import json
import shutil
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
CACHE = ROOT / ".cache" / "audio"
IMAGE_CACHE = ROOT / ".cache" / "images"

SITE_TITLE = "The Catalyst"
SITE_BLURB = "A bi-weekly tech byte by Leimomi on Bytemarks Café, Hawaiʻi Public Radio."
BYTEMARKS_HOME = "https://bytemarkscafe.org/"
NPR_PODCAST = "https://www.npr.org/podcasts/381443570/bytemarks-caf"
HPR_PROFILE = "https://www.hawaiipublicradio.org/people/leimomi"
LINKEDIN = "https://www.linkedin.com/in/leimomibong/"
SITE_URL = "https://naeolokani.com/catalyst/"  # used for share previews and canonical links

# When The Catalyst airs, inside Bytemarks Café (Fridays, 6:30 pm on HPR-1).
# Set AIR_WEEKS to [] to switch to every Friday.
AIR_WEEKS = [1, 3]
AIR_TIME_HST = "18:30"

P5 = "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"
FONTS = "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"

e = lambda s: html.escape(str(s), quote=True)

# Appended to asset URLs so browsers fetch fresh CSS/JS after each build.
VERSION = dt.datetime.now().strftime("%Y%m%d%H%M%S")


def long_date(d):
    return f"{d:%B} {d.day}, {d.year}"


def short_date(d):
    return f"{d:%b} {d.day}"


def clock(hhmm):
    """'18:30' -> '6:30pm'"""
    h, m = map(int, hhmm.split(":"))
    return f"{(h % 12) or 12}:{m:02d}{'am' if h < 12 else 'pm'}"


def head(title, description, prefix, path="", image="assets/og-card.jpg", size=(1200, 630), kind="website"):
    """Page head. path and image are relative to SITE_URL; they become absolute for share previews."""
    url, img = SITE_URL + path, SITE_URL + image
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="{kind}">
<meta property="og:site_name" content="{e(SITE_TITLE)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:image" content="{e(img)}">
<meta property="og:image:width" content="{size[0]}">
<meta property="og:image:height" content="{size[1]}">
<meta property="og:image:alt" content="{e(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{e(img)}">
<meta name="theme-color" content="#d6e4f0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{prefix}assets/style.css?v={VERSION}">
</head>"""


def drive_download(drive_id, tmp):
    url = f"https://drive.usercontent.google.com/download?id={drive_id}&export=download"
    subprocess.run(["curl", "-sSfL", "-o", str(tmp), url], check=True)
    with open(tmp, "rb") as f:
        return f.read(12)


def fetch_audio(drive_id):
    """Download a publicly shared Drive file once and reuse it after that."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{drive_id}.mp3"
    if out.exists() and out.stat().st_size > 0:
        return out
    tmp = out.with_suffix(".part")
    start = drive_download(drive_id, tmp)
    if start[:3] not in (b"ID3",) and start[:2] not in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        tmp.unlink()
        raise RuntimeError(f"Drive file {drive_id} did not download as audio. Is it shared as 'Anyone with the link'?")
    tmp.rename(out)
    return out


def fetch_image(drive_id):
    """Like fetch_audio, for an episode image (WebP, JPEG or PNG)."""
    IMAGE_CACHE.mkdir(parents=True, exist_ok=True)
    for old in IMAGE_CACHE.glob(f"{drive_id}.*"):
        if old.suffix != ".part" and old.stat().st_size > 0:
            return old
    tmp = IMAGE_CACHE / f"{drive_id}.part"
    start = drive_download(drive_id, tmp)
    ext = ("webp" if start[:4] == b"RIFF" and start[8:12] == b"WEBP" else
           "jpg" if start[:3] == b"\xff\xd8\xff" else
           "png" if start[:8] == b"\x89PNG\r\n\x1a\n" else None)
    if not ext:
        tmp.unlink()
        raise RuntimeError(f"Drive file {drive_id} did not download as an image. Is it shared as 'Anyone with the link'?")
    out = tmp.with_suffix(f".{ext}")
    tmp.rename(out)
    return out


def home_page(episodes):
    tags = []
    for ep in episodes:
        for t in ep["tags"]:
            if t not in tags:
                tags.append(t)
    items = "\n".join(
        f'    <li data-tags="{e("|".join(ep["tags"]))}"><a href="episodes/{e(ep["slug"])}/">'
        f'<span class="t">{e(ep["title"])}</span><span class="d">{e(short_date(ep["d"]))}</span></a></li>'
        for ep in episodes
    )
    tag_buttons = "\n".join(
        f'      <button class="tag" type="button" data-tag="{e(t)}" aria-pressed="false">{e(t)}</button>' for t in tags
    )
    ordinals = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th"}
    cadence = (" and ".join(ordinals[w] for w in AIR_WEEKS) + " Fridays") if AIR_WEEKS else "Fridays"
    return f"""{head(SITE_TITLE, SITE_BLURB, "")}
<body>
<div id="pattern" data-seeds="{len(episodes)}" aria-hidden="true"></div>
<main class="home">
  <header class="home-head">
    <span class="meta">{e(SITE_TITLE)}</span>
    <span class="meta">{e(SITE_BLURB)}</span>
  </header>
  <div class="tags" aria-label="Highlight episodes by tag">
{tag_buttons}
  </div>
  <ul class="index">
{items}
  </ul>
  <footer class="home-foot">
    <div class="onair" data-weeks="{e(",".join(map(str, AIR_WEEKS)))}" data-time="{AIR_TIME_HST}">
      <p class="meta">{e(cadence)}, {clock(AIR_TIME_HST)} HST on HPR-1</p>
      <p class="meta next-air"></p>
    </div>
    <div class="links">
      <a class="chip" href="{BYTEMARKS_HOME}">Bytemarks ↗</a>
      <a class="chip" href="{NPR_PODCAST}">NPR podcast ↗</a>
      <a class="chip" href="{LINKEDIN}">LinkedIn ↗</a>
      <a class="chip" href="{HPR_PROFILE}">Leimomi on HPR ↗</a>
      <button class="chip sound-toggle" type="button" aria-pressed="true">Sound on</button>
    </div>
  </footer>
</main>
<script src="{P5}" defer></script>
<script src="assets/sketch.js?v={VERSION}" defer></script>
<script src="assets/site.js?v={VERSION}" defer></script>
<script src="assets/sound.js?v={VERSION}" defer></script>
</body>
</html>
"""


def share_image(ep):
    """Link previews need JPG or PNG (LinkedIn skips webp). Use the episode's JPG copy
    in content/images if there is one, otherwise the site's main share card."""
    jpg = f'images/{ep["date"]}.jpg'
    return {"image": jpg, "size": (1232, 928)} if (ROOT / "content" / jpg).exists() else {}


def episode_page(ep, older=None, newer=None):
    pre = "../../"
    def step(other, label, cls):
        if not other:
            return '<span></span>'
        return (f'<a class="{cls}" href="{pre}episodes/{e(other["slug"])}/">'
                f'<span class="meta">{label}</span><span class="t">{e(other["title"])}</span></a>')
    pager = (f'<nav class="pager" aria-label="More episodes">'
             f'{step(older, "← Previous", "prev")}{step(newer, "Next →", "next")}</nav>')
    image = (
        f'<div class="img"><img src="{pre}{e(ep["image"])}" alt="" width="1232" height="928" decoding="async"></div>' if ep.get("image") else ''
    )
    script = "\n".join(f"    <p>{e(p)}</p>" for p in ep["script"])
    sources = ", ".join(f'<a href="{e(s["url"])}">{e(s["name"])}</a>' for s in ep["sources"])
    tags = ", ".join(f'<a href="{pre}?tag={e(urllib.parse.quote(t))}">{e(t)}</a>' for t in ep["tags"])
    return f"""{head(f'{ep["title"]} · {SITE_TITLE}', ep["oneLiner"], pre, path=f'episodes/{ep["slug"]}/', kind="article",
        **share_image(ep))}
<body>
<main class="ep">
  <div class="ep-head">
    <a class="chip" href="{pre}">← {e(SITE_TITLE)}</a>
    <span class="meta">Bytemarks Café, Hawaiʻi Public Radio</span>
  </div>
  <p class="meta" style="margin:0">{e(long_date(ep["d"]))}<span data-length></span></p>
  <h1>{e(ep["title"])}</h1>
  {image}
  <p class="one">{e(ep["oneLiner"])}</p>
  <div class="player">
    <audio preload="metadata" src="{pre}audio/{e(ep["slug"])}.mp3"></audio>
    <button type="button" aria-label="Play"></button>
    <input type="range" min="0" max="1" step="0.1" value="0" aria-label="Seek">
    <span class="time meta">0:00 / 0:00</span>
  </div>
  <p class="full meta">Full episode on <a href="{e(ep["bytemarks"])}">Bytemarks ↗</a> · <a href="{e(ep["hpr"])}">Hawaiʻi Public Radio ↗</a></p>
  <div class="script">
{script}
  </div>
  <p class="small-line meta">Sources: {sources}</p>
  <p class="small-line meta">Tags: {tags}</p>
  {pager}
</main>
<script src="{pre}assets/site.js?v={VERSION}" defer></script>
</body>
</html>
"""


def build():
    data = json.loads((ROOT / "content" / "episodes.json").read_text(encoding="utf-8"))
    episodes = data["episodes"]
    for ep in episodes:
        ep["d"] = dt.date.fromisoformat(ep["date"])
    episodes.sort(key=lambda ep: ep["d"], reverse=True)

    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "audio").mkdir(parents=True)
    shutil.copytree(ROOT / "assets", DIST / "assets")
    if (ROOT / "content" / "images").exists():
        shutil.copytree(ROOT / "content" / "images", DIST / "images")
    (DIST / ".nojekyll").write_text("")
    for ep in episodes:
        # a Drive image from the Sheet wins over content/images/<date>.*
        if ep.get("imageDriveId"):
            src = fetch_image(ep["imageDriveId"])
            (DIST / "images").mkdir(exist_ok=True)
            ep["image"] = f'images/{ep["date"]}{src.suffix}'
            shutil.copyfile(src, DIST / ep["image"])

    (DIST / "index.html").write_text(home_page(episodes), encoding="utf-8")
    for i, ep in enumerate(episodes):
        out = DIST / "episodes" / ep["slug"]
        out.mkdir(parents=True)
        # episodes are newest first, so the next index is the older episode
        older = episodes[i + 1] if i + 1 < len(episodes) else None
        newer = episodes[i - 1] if i > 0 else None
        (out / "index.html").write_text(episode_page(ep, older, newer), encoding="utf-8")
        shutil.copyfile(fetch_audio(ep["audioDriveId"]), DIST / "audio" / f'{ep["slug"]}.mp3')
        print(f'  built {ep["slug"]}')
    print(f"Done: {len(episodes)} episodes in {DIST}")


if __name__ == "__main__":
    build()
    if "--serve" in sys.argv:
        import functools
        import http.server

        class NoCache(http.server.SimpleHTTPRequestHandler):
            def end_headers(self):
                self.send_header("Cache-Control", "no-store")  # always show the latest build
                super().end_headers()

        handler = functools.partial(NoCache, directory=str(DIST))
        print("Preview at http://localhost:8000  (Ctrl-C to stop)")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()
