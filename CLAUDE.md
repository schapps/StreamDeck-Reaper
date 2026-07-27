# CLAUDE.md

REAPER Control — an Elgato Stream Deck plugin that drives REAPER over its
built-in web interface. Full spec: `reaper-streamdeck-spec.md`.

## Source of truth for the web interface

**`docs/protocol-findings.md`, not the spec's §3 assumptions.** The spec was
written with pessimistic guesses where the author was uncertain; the
findings doc is what was actually verified live against a running REAPER
instance, with raw captures in `tests/fixtures/`. Where they disagree, the
findings doc wins. Two load-bearing upgrades over the spec worth knowing up
front:

- Named command IDs (`_SWS_*`, `_RS*`) resolve and execute over `/_/` —
  SWS and ReaPack script actions are NOT out of reach.
- `GET/<command_id>` returns `CMDSTATE \t id \t state` for **any**
  caller-supplied action, numeric or named — arbitrary toggle-state
  querying works, contrary to the spec's assumption that it didn't exist.

`tests/fixtures/reaper-main.js.reference` is REAPER's own protocol
documentation (copied from `reaper_www_root/main.js` inside the REAPER.app
bundle) and is more complete than REAPER's public web docs. Read it before
writing or changing a parser in `src/reaper/parsers.ts`.

## TypeScript / Node conventions

- TypeScript strict mode. Node 20. No heavy HTTP client — built-in `fetch`.
- `src/reaper/` (client, parsers, state manager) must stay fully decoupled
  from Stream Deck concerns — unit-testable against a mock HTTP server with
  no `@elgato/streamdeck` import in sight.
- Parsers parse positionally from the left and ignore unknown trailing
  fields/bits — REAPER adds fields across versions (see the undocumented
  bit 512 on `TRACK` flags noted in the findings doc). Never assume a field
  count or a bitmask is exhaustive.
- Never run a generic URL-encoder over a relative `SET/TRACK/.../VOL/+N`
  command — the sign character must stay raw/unescaped in the path or
  REAPER silently mis-parses it (see findings doc, item 8).
- Client-side range clamping is the plugin's job, not REAPER's — the web
  interface does not clamp `VOL` server-side.
- Tests: `vitest`, built against the fixtures in `tests/fixtures/`.

## Stream Deck SDK v2 patterns

- Plugin UUID `com.stephenschappler.reaper`, bundle dir
  `com.stephenschappler.reaper.sdPlugin`.
- One `SingletonAction` subclass per key type, under `src/actions/`.
- A single `StateManager` owns all polling; individual keys register state
  needs on `willAppear` / deregister on `willDisappear` and never poll
  directly.
- Run Action fires on `keyDown`, not `keyUp`.
- `showOk()` / `showAlert()` for action feedback; never send a keystroke to
  any application — that's the whole point of this plugin over the
  hotkey-emulation status quo.

## Workflow

Plain git repo. Normal commit/PR flow — no special VCS handling needed here.

Milestone order lives in spec §15. Don't skip ahead to plugin scaffolding
without checking whether the current milestone's prerequisites (e.g. a
findings doc, a passing parser test suite) are actually done.

## Commands

Node 20 (installed via `brew install node@20`, keg-only — linked onto PATH).

- `npm test` — vitest, runs once
- `npm run typecheck` — three `tsc --noEmit` passes: `src/` (Node), `tests/`, and `src/pi/` (browser/DOM)
- `npm run build` — rollup, two outputs: `bin/plugin.js` (Node backend) and `ui/js/action-browser.js` (PI, browser-targeted)
- `npm run build:actions` — regenerate `data/actions-native.json` from `tools/ActionList.txt`
- `npm run watch` — rollup watch mode, restarts the plugin in Stream Deck on each rebuild
- `npx @elgato/cli restart com.stephenschappler.reaper` — reload the built plugin into a running Stream Deck app
- `npx @elgato/cli validate com.stephenschappler.reaper.sdPlugin` — validate the manifest/bundle

The PI (`ui/run-action.html` + `ui/js/run-action.js`) talks to the plugin via
`window.SDPIComponents.streamDeckClient` (from the loaded sdpi-components
bundle), not a hand-rolled `connectElgatoStreamDeckSocket` — verified
directly against the v4.0.1 bundle rather than assumed. Global-settings
form fields use sdpi-components' `global` attribute; `value-type="number"`
is required on numeric fields (`type="number"` alone only changes the
native input, not what gets persisted).

### Two TypeScript "projects", and the tsconfig `exclude` trap

`src/pi/` (currently just `action-browser.ts`) runs in the PI's browser
context, not Node — it needs the DOM lib and gets its own
`src/pi/tsconfig.json` and its own rollup output (browser IIFE, not the
Node-targeted plugin bundle). The root `tsconfig.json` and
`tests/tsconfig.json` both `exclude: [...]` that directory so their
Node-context checks don't choke on `document`/`window`.

**If you add a config that `extends` one of these and doesn't declare its
own `exclude`, it silently inherits the parent's** — including
`"src/pi"`, which means it excludes *itself* if it lives there, and
`tsc` "succeeds" having type-checked zero files. This actually happened
while building the action browser: `npm run typecheck` reported success
while `rollup -c` failed on the exact same file, because the standalone
`tsc -p src/pi/tsconfig.json` check was silently a no-op. Any new
project under `src/pi/` must declare its own explicit `"exclude"`, not
rely on inheriting one. When a `tsc --noEmit` project reports zero
errors, that's not the same claim as "checked N files with zero
errors" — worth confirming the file count when a config's `exclude` was
touched recently.

## Action database (Milestone 4)

- `tools/ActionList.txt` — raw export dumped via **SWS/S&M: Dump action
  list (all actions)** (`_S&M_DUMP_ALL_ACTION_LIST`) against a real REAPER
  7.77 instance (`Section\tId\tAction`, all sections) — REAPER's own
  Actions window has no export command in this version, despite what spec
  §7.2 assumes. Commit this alongside the generated JSON so a future
  REAPER version's DB is reproducible: re-dump, rerun `npm run build:actions`.
- `src/actiondb/parse-export.ts` — the shared parser for that export
  format (filters to `Main` only — the web interface can't address other
  sections, see findings doc). Used by both `tools/build-action-db.ts`
  (build-time, applies `tools/curated-tags.ts`) and
  `src/actiondb/import-store.ts` (runtime user import, no tags). One
  parser, two callers — don't fork it.
- `src/actiondb/search.ts` — the fuzzy-search ranking, unit-tested
  (`tests/actiondb/search.test.ts`) and imported directly by
  `src/pi/action-browser.ts`. Don't hand-duplicate this logic in plain JS
  for the PI; that's exactly what the separate browser rollup output
  exists to avoid.

## Action import (Milestone 5)

The user's imported action list is **not** in Stream Deck global
settings — it's a JSON file on disk at
`com.stephenschappler.reaper.sdPlugin/data/actions-imported.json`
(`src/actiondb/import-store.ts`), gitignored, alongside the bundled
`data/actions-native.json`. A full export runs to thousands of rows
(~1.2MB as JSON); global settings round-trip over the local WebSocket on
every read/write — including ones unrelated to the action list — so
storing that much there would mean shipping ~1.2MB over IPC on unrelated
setting changes. Spec §7.2 explicitly allows this fallback ("store the
database in the plugin's own data directory on disk and keep only a path
reference in settings"); the "reference" here is just "does the file
exist," not even a settings field.

`import-store.ts`'s functions take an optional `dataDir` param (default
`path.join(process.cwd(), "data")`, confirmed empirically to resolve to
the sdPlugin root when the plugin is actually running) so tests can point
at a temp directory instead of writing into the real bundle.

PI → plugin messages for this live in the same `streamDeck.ui.onSendToPlugin`
dispatcher as `testConnection` (`src/plugin.ts`): `importActions` (payload
carries the raw file text, read client-side via `FileReader` in
`ui/js/import-actions.js`), `clearImportedActions`, and
`getImportedActionsSummary`.
