# The Catalyst

Website for *The Catalyst*, Leimomi's bi-weekly tech segment on Bytemarks Café (Hawaiʻi Public Radio).

## How it's put together

- `content/episodes.json` holds the aired episodes: title, one-liner, script, sources, tags, links, image, and the Google Drive ID of each audio file. `sync_content.py` generates it from *The Catalyst Schedule* (Sheet) and *The Catalyst Scripts* (Doc) and keeps hand edits to the text. See [docs/content-sync.md](docs/content-sync.md) for adding episodes and the one-time Google setup.
- `content/images/` holds episode images, named by air date. A Drive link in the Sheet's Image column works too.
- `build.py` turns that into a static site in `dist/` and downloads each episode's audio from Drive (files must be shared as "Anyone with the link"). Air day and time are set at the top of the file.
- `assets/` has the styles, the reaction–diffusion background (`sketch.js`, built on p5.js), and `site.js` for tags, the on-air date, the audio player, and the episode side panel.
- `.github/workflows/deploy.yml` syncs from the Sheet and Doc, then builds and publishes the site to GitHub Pages: on every push to `main`, nightly, and from the **Run workflow** button.

## Build and preview

```bash
python3 build.py --serve
```

Then open http://localhost:8000. The build needs only Python 3, with no extra packages.
