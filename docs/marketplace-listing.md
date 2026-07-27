# Marketplace listing copy (draft)

Draft text for the Maker Console submission form. Edit freely before
pasting in — this is a starting point, not final copy. Everything here
describes what the plugin actually does today; update it if functionality
changes before submission.

---

## Tagline (short summary, ~1 sentence)

Run REAPER actions directly from your Stream Deck — no hotkeys, no
keystroke emulation, just press and go.

## Description

REAPER Control triggers REAPER actions directly over REAPER's own
built-in web interface, so you can drive your DAW from a Stream Deck
without ever assigning a hotkey.

Assigning a Stream Deck key to a REAPER action normally means giving that
action a keyboard shortcut first, then teaching Stream Deck to send that
keystroke. That burns your keyboard's limited shortcut space, breaks the
moment focus is somewhere else, collides with shortcuts other apps
already use, and simply can't reach the thousands of REAPER actions that
have no hotkey at all. REAPER Control skips all of that: pick an action,
press the key, REAPER runs it.

**What's included:**

- **Run Action** — trigger any REAPER action by ID, including SWS and
  ReaPack script actions. Don't want to hunt down IDs? Use the built-in
  searchable action browser (fuzzy search, favorites, recently used), or
  import your own action list to search SWS/script actions too.
- **Transport** — play, stop, pause, record, repeat, and seek, with the
  key's own state reflecting what REAPER is actually doing in real time.
- **Track Control** — mute, solo, record-arm, or select a track by
  number, by whatever's currently selected, or the master track, with
  live two-state feedback. Targeting "selected" and multi-selecting
  several tracks applies the action to the whole group at once.
- A guided setup panel that walks through enabling REAPER's web
  interface, a one-click connection test with specific, actionable error
  messages, and a "copy diagnostics" button for fast support requests.

**Requirements:** REAPER 7.x or later with the built-in web browser
interface enabled (Options → Preferences → Control/OSC/web → Add → Web
browser interface). The plugin's setup panel walks through this step by
step — REAPER must be running for the keys to work, but no REAPER-side
extension, ReaScript, or additional install is required.

## Privacy statement

REAPER Control sends data only to the REAPER instance you configure it to
talk to (by default, `localhost`) — nothing is sent anywhere else, and no
usage data, telemetry, or analytics are collected. If you configure a
username and password for REAPER's web interface, be aware REAPER sends
those credentials unencrypted (HTTP Basic auth) — the plugin's setup
panel calls this out directly, and it only matters if REAPER is reachable
over a network you don't fully trust; for the default `localhost` setup
it's a non-issue.

## Support

Issues and questions: <https://github.com/schapps/StreamDeck-Reaper/issues>

## Release notes (initial submission)

Initial release. Run Action (with searchable action browser and action
list import), Transport, and Track Control key types, live state
feedback, guided setup, and diagnostics tooling.
