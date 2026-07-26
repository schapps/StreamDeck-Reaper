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
