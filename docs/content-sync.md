# Publishing from the Sheet and Doc

The site rebuilds itself from *The Catalyst Schedule* (Sheet, tab `2026`) and *The Catalyst Scripts* (Doc). It runs every night, on every push to `main`, and whenever you press **Run workflow** on GitHub.

## Adding an episode

1. Write the script in a new tab of the Scripts doc: a one-liner (`One-liner: …`), the script, then a `Sources` heading with links below it.
2. In the Sheet, fill in the row: **Web Title**, **Script** (a link to that tab, from the tab's ⋮ menu → *Copy link*), and **Audio Files** (a Drive link to the MP3, shared as "Anyone with the link"). **Tags** (comma-separated), **Image**, **ByteMarks URL** and **HPR Links** are optional.
3. Wait for the nightly run, or open the repo on GitHub → **Actions** → **Build and publish** → **Run workflow**.

A row goes on the site only when it has a Web Title, a Script link and an Audio link.

**Images:** put a Drive link to one image file (shared as "Anyone with the link", 3:2) in the Image column, or add `content/images/<date>.webp` to the repo. If both exist, the Drive image is used.

## What the sync does with your edits

- **From the Sheet, every time:** title, tags, links, audio, image. The web address stays the same if you rename an episode later, so old links keep working.
- **From the Doc, once:** a new episode's one-liner, script and sources. After that, the site keeps its own copy, because the site text was lightly copy-edited.
- **If you change a script in the Doc later,** the run summary on GitHub shows what changed, and the run gets a yellow "Doc changed" warning. To publish the Doc's version, press **Run workflow** and type the air date (e.g. `2026-10-16`) in *Use the Doc's text*. To keep the site's version and stop the warning, type it in *Keep the site's text* instead.
- The opening line ("You're listening to The Catalyst…"), pronunciation notes, comments, and anything in a table are never published. A pronunciation spelled out inside the script itself (like `KA-RAM-PER-EE-DOO`) can't be fixed automatically and shows up as a warning.
- Source names reuse names from earlier episodes (UH News, PubMed, …). New outlets get a guessed name, listed in the run summary; fix one in `content/episodes.json` and the fix sticks.

Each run that changes something commits `content/episodes.json` back to `main`, so the history of every change stays in the repo.

## One-time setup: Google access

The sync reads the Sheet and Doc as a **service account**, a Google robot user with a key that lives only in GitHub. This lets the Sheet and Doc stay private. The Scripts doc's People tab is a private pitch list and should not be readable by anyone with the link.

You need to do these steps yourself. Use a personal Google account for steps 1–4 if UH's Google Cloud doesn't let you create keys.

1. **Create a project.** Go to <https://console.cloud.google.com/projectcreate>, name it `the-catalyst-site`, and create it.
2. **Turn on the Sheets API.** Open <https://console.cloud.google.com/apis/library/sheets.googleapis.com>, make sure the new project is selected at the top, and click **Enable**.
3. **Create the service account.** Go to <https://console.cloud.google.com/iam-admin/serviceaccounts> → **Create service account**. Name it `catalyst-sync`, click **Create and continue**, skip the role and access steps, and click **Done**. Copy its email address (something like `catalyst-sync@the-catalyst-site.iam.gserviceaccount.com`).
4. **Make a key.** Click the service account → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**. A `.json` file downloads. Treat it like a password: don't email it or commit it.
5. **Share the files.** In the Sheet and in the Scripts doc, click **Share**, paste the service account's email, choose **Viewer**, untick *Notify people*, and click **Share**.
6. **Add two GitHub secrets.** Go to <https://github.com/leilow/the-catalyst/settings/secrets/actions> → **New repository secret**, twice:
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: open the downloaded `.json` file in TextEdit, then copy and paste its whole contents.
   - `CATALYST_SHEET_ID`: the part of the Sheet's URL between `/d/` and `/edit`. It's a secret because the repo is public; until step 8, anyone with the ID could open the Sheet and, through its Script links, the Doc.
7. **Test it.** Go to **Actions** → **Build and publish** → **Run workflow**. Open the finished run to read its summary.
8. **Lock the files.** Once the run works, set **General access** to **Restricted** on both the Sheet and the Doc (Share → General access). Leave the audio and image files as "Anyone with the link"; the site downloads those directly.

Then delete the downloaded key from your Downloads folder, or move it to `.secrets/google-service-account.json` in this folder if you want to run the sync on your Mac. That folder is git-ignored.

## Running it on your Mac

```bash
CATALYST_SHEET_ID=<the Sheet's id> python3 sync_content.py --dry-run
```

`--dry-run` only prints the report. Leave it off to update `content/episodes.json`, then run `python3 build.py --serve` to preview. `--from-doc DATE` and `--keep-site DATE` work the same as the workflow inputs.
