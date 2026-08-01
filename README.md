# REAPER Control — Stream Deck Plugin

A Stream Deck plugin that runs REAPER actions directly over REAPER's
built-in web interface — no hotkey assignment, no keystroke emulation, no
REAPER-side extension or ReaScript required.

The problem it solves: today, triggering a REAPER action from a Stream Deck
means assigning a hotkey to that action in REAPER, then configuring a Stream
Deck key to send that keystroke. That burns a finite keyboard namespace,
breaks when focus is elsewhere, collides with other apps' shortcuts, and
can't reach the thousands of actions that have no hotkey. This plugin
replaces that with a direct path: pick an action, press a key, REAPER runs
it.

## Status

Actively in development, milestone by milestone. Not yet packaged for the
Marketplace.

| Milestone | Status |
|---|---|
| 1. Protocol verification | ✅ Done — see [`docs/protocol-findings.md`](docs/protocol-findings.md) |
| 2. Skeleton, transport layer, Run Action key | ✅ Done |
| 3. Transport & Track Control keys, state manager, polling | ✅ Done |
| 4. Action database, fuzzy search, browser UI | ✅ Done |
| 5. Action import (user's exported action list) | ✅ Done |
| 6. Dials (Stream Deck+) | Skipped for now (no Stream Deck+ to test against) |
| 7. Polish (icon art, error states, diagnostics, localization scaffolding) | ✅ Done |
| 8. Release (Marketplace assets, submission) | Not started |

## What works today

- **Run Action** — trigger any REAPER action by numeric or named command ID
  (`40044`, `_SWS_ABOUT`, ReaPack script IDs, …), with a searchable action
  browser (fuzzy search, favorites, recents) instead of hand-typing IDs.
  Import your own action list (via the SWS action
  `SWS/S&M: Dump action list (all actions)`) to make SWS and ReaPack
  scripts searchable too.
- **Transport** — play, stop, pause, record, repeat, go to start/end, with
  live lit/dim feedback driven by REAPER's actual transport state.
- **Track Control** — mute, solo, record-arm, select, targeting a track by
  number, the current selection, or master, with live two-state feedback.
- A setup panel that walks through enabling REAPER's web interface, plus a
  **Test Connection** button with specific, actionable diagnostics. It
  re-expands automatically if a previously-working connection drops, and
  every key shows a small disconnected badge without losing its normal
  icon.
- A **Copy diagnostics** button (plugin/OS/Stream Deck versions, redacted
  connection settings, last 20 log lines) for support requests, and inline
  PI warnings for an unrecognized action ID or an out-of-range track
  number.

## Requirements

- REAPER 7.x with the built-in web browser interface enabled
  (**Options → Preferences → Control/OSC/web → Add → Web browser
  interface**) — the plugin's setup panel walks through this.
- Stream Deck app 6.5+, macOS 12+ or Windows 10+.

## Documentation

- [`reaper-streamdeck-spec.md`](reaper-streamdeck-spec.md) — the full
  implementation spec.
- [`docs/protocol-findings.md`](docs/protocol-findings.md) — REAPER web
  interface behavior verified live against a real instance. This is the
  source of truth for anything protocol-related, not the spec's own
  assumptions where the two disagree.
- [`CLAUDE.md`](CLAUDE.md) — conventions and gotchas for working on this
  codebase.
- [`docs/marketplace-listing.md`](docs/marketplace-listing.md) — draft
  copy for the Elgato Marketplace submission (tagline, description,
  privacy statement, release notes).

## Development

Requires Node 20.

```sh
npm install
npm test           # vitest
npm run typecheck   # tsc --noEmit across the Node, test, and PI (browser) projects
npm run build        # rollup -> com.schapps.reaper.sdPlugin/{bin,ui/js}
npm run build:actions # regenerate data/actions-native.json from tools/ActionList.txt
npm run build:icons   # rasterize design/icons/*.svg -> the PNGs the manifest requires
```

To try it locally in a running Stream Deck app:

```sh
npx @elgato/cli link com.schapps.reaper.sdPlugin
npx @elgato/cli restart com.schapps.reaper
```

`npm run watch` rebuilds and restarts the plugin automatically on save.
