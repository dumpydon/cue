# Cue website

The public website lives in `site/`, independently of the Electron app. It uses
HTML/CSS/JavaScript and a Cloudflare Worker with static assets. At the owner's
request, the layout, SF/system font stack, type scale, glass navigation, feature
rhythm, launch player, and first-launch walkthrough are adapted directly from
the owner's Glee website. Cue uses purple accents and its own product content.
The approved footer is preserved in `components/footer.html` with its scoped
CSS unchanged. No website account, database, AI provider, or analytics is required.

## Work locally

```sh
cd site
npm ci
npm run dev
```

The preview is `http://127.0.0.1:8793/`. Public asset edits refresh the preview.
Restart the server after editing server-side code. Build output is `dist/site`
at the repository root and is ignored by Git.

Page sources live in `public/`; `components/` contains shared navigation,
downloads, launch-player, and approved footer snippets. The build resolves these
snippets for every page and creates install cards from the verified release
manifest. Film, poster, and caption URLs include a content revision so an old
browser cache cannot show the previous film. Checks inspect the resulting pages
and their local links.

```sh
npm run check
npm run deploy
```

Deploy uses the authorized Cloudflare account and publishes
`https://cue.dumpydon.workers.dev/`. Do not commit Wrangler OAuth credentials or
tokens. The site dependency lockfile is separate from the desktop app's.

GitHub Actions checks the desktop app and website independently. A ready preview
manifest triggers the verified prerelease publisher. Cloudflare Workers Builds
is connected to `dumpydon/cue` with these production settings:

- Branch: `main`; watch path: `site/**`; root directory: `site`.
- Node.js: `22` through the build environment's `NODE_VERSION` variable.
- Build command: `npm ci --ignore-scripts && npm run check`.
- Deploy command: `npx wrangler deploy`; the custom build also verifies assets.
- Preview builds are disabled. The existing Cloudflare-managed build token is
  kept in Cloudflare; no deployment credential is embedded in this repository.

`npm run deploy` remains available for an authorized manual deployment.

## Film

`public/media/cue-launch.mp4` is a 19-second 1080p60 H.264/AAC film. It uses the
owner-authorized Glee production footage for photographed hardware and camera
work, composited with synthetic Cue UI, feature close-ups, SF typography, and a
Cue end card. It replaces the earlier canvas-rendered film. See
`film-src/README.md` to reproduce it. The Glee-style player has native fallback,
restart, play/pause, sound, fullscreen, and background/offscreen pausing. The
first-launch guide and product examples are illustrations; they do not capture
audio, call AI providers, or change system settings.

## Downloads and signing

The user explicitly approved a **developer preview** signed with the existing
local development certificate. It is **not Apple Developer ID signed and not
Apple-notarized**. This is an exception for this preview, not a change to the
stable release requirements. The public download is always a fresh source build,
never the installed application or a rollback archive. Private keys, signing
configuration, API credentials, models, sessions, and profiles never ship.

`release.json` describes exact versioned ZIPs, byte lengths, SHA-256 values,
architecture, signing status, source commit, and download URLs. The Worker
serves GET/HEAD with byte ranges and exact lengths. During initial publication,
large ZIPs can be streamed from verified static pieces, each below Cloudflare's
25 MiB asset limit. These pieces remain in ignored local build state. GitHub
Releases is the normal long-term artifact host, and the preview publishing
workflow mirrors the verified public files into a prerelease using its own
repository-scoped `GITHUB_TOKEN`.

Production builds require every manifest-listed bootstrap piece and verify its
size and checksum before copying only those files. A clean source checkout can
run `npm run check` without the ignored archives; this source-check build is
not a deployable bootstrap. The publishing workflow resumes incomplete drafts,
checks the tag and existing asset digests, and never replaces mismatched bytes.

The current preview's permanent downloads are GitHub Release assets. Bootstrap
parts are omitted from normal website builds and from the source repository.

Prepare a verified ZIP after signing, then stage it:

```sh
node site/scripts/stage-downloads.mjs /absolute/path/to/cue-VERSION-preview-mac-arm64.zip arm64 EXACT_SOURCE_SHA
```

Never fill hashes, sizes, or source revisions speculatively. Keep an unavailable
architecture visibly unavailable. The installation guide uses normal macOS GUI
controls and does not ask users to disable system security or reset permissions.

## Verification

- `npm run check`: Worker routing, ranges, ETags, read-only methods, and source/media checks.
- From repository root: `node_modules/.bin/electron site/scripts/visual-qa.cjs`.
  This is an isolated local product-render harness, without browser accounts,
  user profiles, AI requests, or physical capture.
- Run the desktop `npm test` when changing packaging or shared app files.
- Verify the published HTML, MP4 range responses, and complete ZIP checksum
  after deployment. Keep the same local signing identity for local updates.

## Optional Docker preview

```sh
docker build -f site/Dockerfile -t cue-website .
docker run --rm -p 8793:80 cue-website
```

Docker is for a portable static preview. Production runs directly on Cloudflare
Workers; it does not need a continuously running container. The Docker preview
does not implement Worker download transport; production and `npm run dev` do.
