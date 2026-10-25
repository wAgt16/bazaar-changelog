# bazaar-changelog

[简体中文](README.zh-CN.md)

A SiYuan plugin that shows bazaar package release notes, the repository changelog and commit history in
a native "Changelog" dialog, and uses the same dialog to confirm bazaar package updates.

![preview](https://gcore.jsdelivr.net/gh/wmy2981/bazaar-changelog@dev/assets/preview.png)

## Features

- **The version on a bazaar package page opens the changelog**: Settings → Bazaar → any package
  → "Market info - Version".
- **Updates are confirmed in the changelog dialog**: Settings → Bazaar → Downloaded → Update, or the
  Update button on a package detail page. The update starts only after you confirm; SiYuan's own
  download progress, list refresh and error messages are unchanged.
- **Pick the source at the top of the dialog**: release notes (listed per version, switchable), the
  repository CHANGELOG (one file, not per version), or commits (the range between two versions).
- **"Latest" follows the bazaar**: only the version the bazaar index has seen counts as latest;
  releases that are newer on GitHub are not listed yet.
- **Falls back to the other source only when one is missing**: if the bazaar version has no release notes
  at the moment you open the dialog, this open switches to the CHANGELOG; when the CHANGELOG is the
  preferred source but the repository has none, it switches back to the release notes. The source
  dropdown moves with it, and the next open follows the preferred source again.
- **A failed request stays on its source and says why**: errors, rate limiting and timeouts never switch
  sources (the other one would fail just as well); below the main line, a second small line gives the
  reason ("Request refused (403); probably rate limiting", "Network error: could not reach GitHub").
- **Commits default to "installed version → bazaar latest"**: the start and end versions can be changed
  in the dialog; with the start set to "Any" the newest commits of that endpoint are listed. One commit
  per row with its 7-character short hash: the hash opens the commit on GitHub, and clicking the message
  expands the full commit message in place (changed files are not listed). When neither release notes
  nor the CHANGELOG has content, the hint also offers a "View commits" entry.
- **Auto-generated release notes count as "no release notes"**: when the body is only a
  `Full Changelog: v1.0.1...v1.0.2` link (usually generated), the dialog opens the commit range it
  points to instead; a hand-written note with one more line is left alone.
- **#PR / issue numbers and @user become GitHub links**: `#123`, `owner/repo#123` and `@user` in
  release notes, the CHANGELOG and commits are rendered as links (cross-repository references point at
  their own repository), and bare URLs become clickable too; this can be turned off in the settings.
- **Open on GitHub**: the icon button at the end of the source/version row opens whatever the dialog is
  showing on GitHub — the release page for release notes, the file that was actually found for the
  CHANGELOG, the `a...b` compare page for commits (the endpoint's commit list when the start is "Any").
  The button is disabled while there is no address to open.
- **Links inside the dialog switch sources instead of leaving it**: a link to this repository's
  changelog file, a release page (`/releases/tag/...`) or a commit comparison (`/compare/a...b`) switches
  to that source with the version or range preselected; this works in release notes, the CHANGELOG and
  commits alike. Ctrl/⌘-click still hands the link to the browser.
- **Optional GitHub token**: set a personal access token to use your own quota for release notes and
  commits instead of the anonymous ~60 requests per hour; the token is only sent to `api.github.com`.
- **GitHub acceleration is configured per source**: off by default, so `api.github.com` and
  `raw.githubusercontent.com` are requested directly. Click "Configure" on the plugin settings page to
  fill in one acceleration URL in a separate window and choose which requests go through it (release
  notes, the CHANGELOG and commits each have their own switch); the master switch turns it off for all
  of them at once.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Preferred source | Release notes | Which source the changelog dialog opens with (release notes / CHANGELOG / commits). |
| Skip empty release notes | On | Release notes whose only line is a `Full Changelog: v1.0.1...v1.0.2` link count as no release notes, and the dialog opens that commit range instead. |
| Link references | On | Render `#123`, `owner/repo#123` and `@user` as links to GitHub. |
| GitHub acceleration | Off | Click "Configure" to set, in a separate window, the master switch, the acceleration URL (a prefix proxy such as `https://gh-proxy.com/`) and whether release notes, the CHANGELOG and commits each go through it. |
| GitHub token | Empty | A personal access token (PAT) for a higher `api.github.com` quota. Stored encrypted in the plugin's private storage (the key in a separate file) and only sent to `api.github.com`; with acceleration on, requests are relayed by a third-party proxy and carry no token. |
| Debug mode | Off | Print complete plugin logs to the console (request URLs, timings, version filtering, fallback reasons), prefixed with `[bazaar-changelog]`. |

## Data sources

- **Release notes**: the GitHub Releases API (`https://api.github.com/repos/<owner>/<repo>/releases`),
  at most 100 entries, drafts filtered out, newest first; one request per repository per 30 minutes.
  A timeout or a failure stays on the release notes and reports the reason plus a Retry; it does not
  switch sources.
- **CHANGELOG**: `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>` (`HEAD` is resolved
  by GitHub to the repository's default branch), where `path` is one of `CHANGELOG.md`,
  `docs/CHANGELOG.md` and `doc/CHANGELOG.md`, all requested **in parallel**; the first one answering
  200 wins and the remaining requests are cancelled. Only a `404` (or a 200 with an empty body) means
  "this path has no file"; `403` / `429` / `5xx` / network errors only mean this request did not get
  through and are never reported as "none". All three candidates answering 404 reports "this
  repository has no CHANGELOG" (on a slow network those 404s can also outlast the first timeout, so
  that verdict is waited for up to 8 seconds); when a candidate really failed, the second line gives
  that reason, and when the route was merely slow it reports a timeout with the second line "Poor
  network, or this repository has no CHANGELOG". Neither switches sources.
- **Bazaar latest version**: `available.version` from the kernel `/api/bazaar/getBazaarPackage`. It
  decides the "Latest" mark and filters out releases the bazaar index has not seen.
- **Commits**: the GitHub Compare API
  (`https://api.github.com/repos/<owner>/<repo>/compare/<base>...<head>`); with the start version set
  to "Any" it uses `/commits` instead and lists the newest 100 commits of that endpoint. Commits are
  always listed newest first (the two endpoints return opposite orders on GitHub's side). Compare returns
  at most 250 commits and the note after the "Listing N commits" count says so when that limit is hit. One
  request per repository per 30 minutes, and a timeout can still be retried; when the request fails the
  dialog offers "List commits up to HEAD", which retries through `/commits`.
- **Markdown rendering**: the kernel `/api/lute/md2html`, the same Lute pipeline the bazaar README
  uses, followed by DOMPurify.

## Known limitations

- Only GitHub-hosted bazaar packages are supported (the SiYuan bazaar only indexes GitHub repositories).
- Release notes and commits use GitHub's anonymous API, roughly 60 requests per hour per IP. When that
  is exhausted the dialog says they are unavailable. A GitHub token raises this to your own quota
  (usually 5000 per hour).
- A plugin has no system keyring, so the token is only encrypted and stored together with its key in the
  plugin's private storage (`data/storage/petal/<plugin name>/`); anyone who can read that directory can
  decrypt it. It guards against a settings file being pasted somewhere on its own.
- A commit list shows at most 250 commits (the compare API limit); older commits have to be looked at
  on GitHub.
- With GitHub acceleration on, some proxies do not forward the `compare` endpoint, so the commit list
  cannot be loaded (whatever status the proxy answers with); the dialog says "The GitHub acceleration
  service may not support fetching commits for the selected range" with this attempt's reason in
  parentheses, and offers "List commits up to HEAD", which uses the `/commits` endpoint the proxy usually
  does forward. Turning acceleration off to read them directly also works.
- Both the "Latest" mark and the version filter depend on the bazaar index, which refreshes every
  1–3 hours.
- Update confirmation relies on SiYuan's own bazaar update flow. If SiYuan changes that flow the
  plugin logs a console warning, stops replacing the update button, and does not implement an update
  path of its own.
- Code blocks in the dialog are rendered as plain text, without syntax highlighting.
- Acceleration applies per item: with only one source accelerated, the others still reach
  `api.github.com` and `raw.githubusercontent.com` directly, and both domains can be unreachable in
  mainland China.
- The CHANGELOG has this single entry point and no second CDN to fall back on: when it is unreachable
  the dialog reports a timeout and offers a retry.

## Development

```bash
npm install
npm run typecheck   # static checks
npm run build       # writes dist/ and package.zip
npm run icon        # assets/icon.svg -> assets/icon.png
node scripts/build-preview-css.mjs <path to the siyuan repository>   # regenerate assets/preview.css
npm run preview     # assets/preview.html -> assets/preview.png (run npx playwright install chromium once)
```

Build artifacts (`dist/`, `package.zip`, and the repository-root `index.js` / `index.css` / `i18n/`)
are not committed.

## License

[MIT](LICENSE)
