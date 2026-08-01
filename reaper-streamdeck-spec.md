# REAPER Control — Elgato Stream Deck Plugin

**Implementation specification**
Target: public release on the Elgato Marketplace
Author: Stephen Schappler

---

## 1. Purpose

A Stream Deck plugin that executes REAPER actions directly, over REAPER's built-in web interface, without the user assigning keyboard shortcuts and without Stream Deck emulating keystrokes.

The problem today: to trigger a REAPER action from a Stream Deck, a user must assign a hotkey to that action in REAPER, then configure a Stream Deck "Hotkey" key to send that keystroke. This burns a finite keyboard namespace, breaks when focus is elsewhere, collides with other apps' shortcuts, and cannot address the thousands of actions that have no hotkey.

This plugin replaces that with a direct command path. The user picks an action, presses a key, REAPER runs it.

### Success criteria

1. A user with a fresh install can run their first REAPER action within two minutes, including REAPER-side setup.
2. Action latency from key press to REAPER execution is under 50 ms on localhost.
3. The plugin never sends a keystroke to any application.
4. State-bearing keys (transport, track) reflect REAPER's actual state within 200 ms of it changing.

---

## 2. Architecture

```
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────┐
│  Stream Deck HW     │◄───────►│  Stream Deck app     │◄───────►│   Plugin    │
└─────────────────────┘         │  (Elgato runtime)    │  WS     │  (Node 20)  │
                                └──────────────────────┘         └──────┬──────┘
                                                                        │ HTTP
                                                                        │ (localhost
                                                                        │  or LAN)
                                                                 ┌──────▼──────┐
                                                                 │   REAPER    │
                                                                 │ web iface   │
                                                                 └─────────────┘
```

No REAPER-side installation. No C++ extension. No ReaScript. No SWS dependency. The only REAPER-side requirement is enabling the built-in web browser interface, which ships with REAPER.

This constraint is deliberate and is the primary design driver. Where a feature cannot be delivered over the web interface, the feature is scoped down rather than the constraint being relaxed.

### Technology

| Layer | Choice |
|---|---|
| Plugin runtime | Node.js 20, TypeScript (strict) |
| Stream Deck SDK | `@elgato/streamdeck` (SDK v2), Stream Deck app 6.5+ |
| Scaffolding / build | `@elgato/cli` (`streamdeck` CLI) |
| Property Inspector | HTML + `sdpi-components` |
| HTTP client | Node built-in `fetch` / `undici` — no heavy dependency |
| Tests | `vitest` |

Plugin UUID: `com.schapps.reaper`
Bundle directory: `com.schapps.reaper.sdPlugin`

---

## 3. Protocol verification — do this first

**Before writing any plugin code, empirically verify the following against a live REAPER instance and record the results in `docs/protocol-findings.md`.** Several of these are load-bearing for the feature set below, and the documentation is thin. Do not build on an assumption you have not tested.

Enable REAPER's web interface (Preferences → Control/OSC/web → Add → Web browser interface, port 8080), then test with `curl`:

1. **Run a numeric action.** `curl "http://localhost:8080/_/40044"` — confirm play toggles. Record the exact response body and Content-Type.
2. **Run a named command.** `curl "http://localhost:8080/_/_SWS_ABOUT"` with SWS installed. Does the underscore-prefixed named command ID resolve? This determines whether users can trigger SWS actions and ReaPack scripts at all. **If this fails, it is a major scope reduction — stop and report before proceeding.**
3. **Run a ReaScript custom ID.** Same test with an `_RS...` ID from a ReaPack script.
4. **Command batching.** `curl "http://localhost:8080/_/40044;TRANSPORT"` — confirm semicolon-separated lists execute in order and return concatenated results. This is the basis of the polling design.
5. **TRANSPORT reply format.** Record the exact tab-delimited field order and types. Expected to include play state, position in seconds, repeat flag, and formatted position strings — confirm.
6. **TRACK reply format.** Record exact field order. Confirm which of mute, solo, recarm, monitoring, selected are present, and whether they arrive as discrete fields or packed into a flags bitmask. Record volume and pan encoding (linear? dB? normalized?).
7. **NTRACK.** Confirm it returns the track count.
8. **Track setters.** Test `SET/TRACK/1/VOL/0.5`, `SET/TRACK/1/MUTE/1`, `SET/TRACK/1/SOLO/1`, `SET/TRACK/1/RECARM/1`, `SET/TRACK/1/PAN/0`. Record exact syntax that works, value ranges, and whether a toggle form (`MUTE/-1` or similar) exists.
9. **Arbitrary action toggle state.** Search hard for any command that returns the equivalent of `GetToggleCommandState(id)` for a caller-supplied action ID. Check `GET/`-prefixed forms, check the JS in `REAPER/reaper_www_root/` for commands the docs omit. **Record the answer definitively.** The Run Action feedback design in §6.1 depends on this being absent; if you find it, flag it as an upgrade opportunity and implement it.
10. **EXTSTATE.** Confirm `GET/EXTSTATE/<section>/<key>` and `SET/EXTSTATE/<section>/<key>/<value>` work. Useful as an escape hatch.
11. **Authentication.** Configure a username/password on the web interface and confirm HTTP Basic auth is accepted.
12. **Failure modes.** Record what happens when REAPER is closed (ECONNREFUSED?), when the port is wrong, when REAPER is busy in a modal dialog, and when the project is mid-render.
13. **Latency and throughput.** Measure round-trip time for a single request and for a 5 Hz polling loop. Confirm REAPER does not degrade under sustained polling.
14. **Multiple instances.** Confirm two REAPER instances on different ports behave independently.

Run these on both Windows and macOS. Note any divergence.

---

## 4. REAPER-side setup and onboarding

The user must enable REAPER's web interface once. The plugin's job is to make that unmissable and nearly foolproof.

### Onboarding flow

When any key of this plugin appears and the plugin has never had a successful connection:

1. The key renders a distinct "not connected" image — REAPER logo, greyed, with a small warning badge.
2. The Property Inspector shows a **Setup** panel above everything else, containing numbered instructions with the exact menu path, and a **Test Connection** button.
3. On successful connection, the Setup panel collapses to a green single-line status and stays collapsed unless the connection is lost.

### Setup panel copy (use verbatim)

> **Connect to REAPER**
>
> 1. In REAPER, open **Options → Preferences → Control/OSC/web**
> 2. Click **Add**, then choose **Web browser interface**
> 3. Set the port to **8080** (or any port — just match it below)
> 4. Tick **Run on startup**, then click **OK**
> 5. Click **Test Connection** below
>
> REAPER must be running for Stream Deck keys to work.

The "Run on startup" step is the one users skip, and skipping it makes the plugin appear broken after every REAPER restart. Give it visual emphasis.

### Diagnostics

The Test Connection button reports specific, actionable results — never a generic failure:

| Condition | Message |
|---|---|
| Success | Connected to REAPER (v7.x) on port 8080 |
| Connection refused | Couldn't reach REAPER on port 8080. Is REAPER running, and is the web interface enabled? |
| Timeout | REAPER is reachable but not responding. It may be busy rendering or showing a dialog. |
| 401 | REAPER's web interface requires a username and password. Enter them in Advanced settings below. |
| Unexpected response | Something answered on port 8080, but it isn't REAPER. Another app may be using this port. |

---

## 5. Transport layer

Implement as `src/reaper/client.ts`, fully decoupled from Stream Deck concerns so it can be unit-tested against a mock HTTP server.

### `ReaperClient`

```ts
interface ReaperClientOptions {
  host: string;          // default "localhost"
  port: number;          // default 8080
  username?: string;
  password?: string;
  timeoutMs: number;     // default 2000
}

class ReaperClient {
  runCommands(commands: string[]): Promise<CommandResponse>;
  query(queries: QuerySpec[]): Promise<ReaperState>;
  testConnection(): Promise<ConnectionResult>;
  get status(): ConnectionStatus;
  on(event: "statusChange" | "state", handler): void;
}
```

### Requirements

- **Batching.** Never issue one HTTP request per datum. Coalesce all commands and queries scheduled within a 16 ms window into a single `/_/a;b;c` request.
- **Connection state machine.** `disconnected → connecting → connected → degraded → disconnected`. `degraded` means a request failed but the previous one succeeded; two consecutive failures drop to `disconnected`.
- **Reconnection backoff.** On disconnect, retry at 1s, 2s, 5s, 10s, then every 15s. Reset on success. Never hammer the port.
- **Zero-poll when idle.** If no visible key requires state, stop polling entirely. Do not keep a heartbeat running for its own sake — a user with only Run Action keys should generate no traffic when idle.
- **Request deduplication.** Identical queries scheduled in the same window collapse to one.
- **Ordering guarantee.** Action commands must never be reordered or dropped. If a batch containing an action fails, do not silently retry it — a double-fired action is worse than a missed one for destructive actions. Report failure to the key instead.
- **Parser isolation.** All tab-delimited response parsing lives in `src/reaper/parsers.ts` with the field layouts documented from §3. Parsers must tolerate REAPER adding trailing fields in future versions — parse positionally from the left, ignore unknown trailing data, never assume field count.

---

## 6. Key types

Four action types ship in v1. Each is a separate `SingletonAction` subclass under `src/actions/`.

### 6.1 Run Action

`com.schapps.reaper.runaction` — Controller: `Keypad`

The core feature.

**Behavior**

- On key press: send the configured action ID to REAPER.
- Fire on `keyDown`, not `keyUp` — this matches the responsiveness users expect from a hardware trigger.
- On success: `showOk()`.
- On failure: `showAlert()` and log.

**Settings**

| Setting | Type | Notes |
|---|---|---|
| `actionId` | string | Numeric (`40044`) or named (`_SWS_ABOUT`). Stored as string, never coerced to number. |
| `actionName` | string | Cached display name, for the key title and PI |
| `section` | enum | `main` \| `midi_editor` \| `media_explorer` — see below |
| `repeatOnHold` | boolean | Default false |
| `repeatIntervalMs` | number | Default 100, range 50–1000, shown only when `repeatOnHold` is true |

**Section handling.** REAPER's action IDs are namespaced by section, and the same numeric ID means different things in the Main section versus the MIDI Editor. The web interface's `/_/` endpoint is believed to target the Main section only. **Verify during §3 whether any section prefix is supported.** If not: expose the `section` dropdown but disable non-Main options with the tooltip "Only Main section actions are supported over REAPER's web interface," and document the limitation in the listing. Do not silently run a MIDI Editor ID against the Main section — that will fire an unrelated and possibly destructive action.

**Feedback.** Per §3.9, arbitrary action toggle state is expected to be unavailable. Therefore:

- No persistent toggle state on the key.
- On press, flash a brief visual confirmation (200 ms highlight) so the user knows the press registered.
- The PI must not offer a "show toggle state" option that cannot be honored.
- If §3.9 finds a working toggle-state query, add an optional `showToggleState` setting and implement it as a two-state key.

**Repeat on hold.** When enabled, holding the key re-fires the action at the configured interval after an initial 400 ms delay. Cancel on `keyUp` or on `willDisappear`. Guard against runaway repeats if a `keyUp` is missed — hard-stop after 100 repeats.

### 6.2 Transport

`com.schapps.reaper.transport` — Controller: `Keypad`

**Settings**

| Setting | Type | Notes |
|---|---|---|
| `function` | enum | `play` \| `stop` \| `pause` \| `record` \| `playStop` \| `repeat` \| `gotoStart` \| `gotoEnd` |

**Behavior.** Each function maps to a native action ID (`40044` play/stop, `40667` stop, `40073` pause, `40046` record, `1068` repeat toggle, `40042` go to start, `40043` go to end — verify each against REAPER's action list during implementation).

**Feedback.** This is where the web interface earns its keep. The `TRANSPORT` query returns live play state and repeat state, so these keys show accurate state:

- Play key: lit when playing, dim when stopped.
- Record key: lit red when recording, and blinking is acceptable at 1 Hz — but make it a setting, defaulting to solid, because blinking keys irritate people in long sessions.
- Repeat key: lit when repeat is on.
- Pause key: lit when paused.

Poll `TRANSPORT` at 5 Hz while any transport key is visible.

### 6.3 Track Control

`com.schapps.reaper.track` — Controller: `Keypad`

**Settings**

| Setting | Type | Notes |
|---|---|---|
| `trackTarget` | enum | `number` \| `selected` \| `master` |
| `trackNumber` | number | 1-based, shown when target is `number` |
| `function` | enum | `recarm` \| `mute` \| `solo` \| `select` |
| `showTrackName` | boolean | Default true — put the track name on the key title |

**Behavior.** Toggle the given property via the verified `SET/TRACK/...` syntax. If a toggle form exists, use it; otherwise read current state from the last poll and write the inverse.

**Feedback.** Two-state key driven by the `TRACK` query. Standard REAPER color language: record arm red, mute yellow, solo amber. Dim when off.

**Edge cases**

- Track number exceeds `NTRACK`: render an "out of range" state, do nothing on press.
- Target is `selected` with no selection: render inactive, do nothing on press.
- Track name is empty: fall back to "Track N".
- Track name is long: truncate to fit with an ellipsis; the Stream Deck title area is small.

### 6.4 Dial

`com.schapps.reaper.dial` — Controller: `Encoder`

Two modes, chosen per dial.

**Mode A — Action per tick**

| Setting | Type |
|---|---|
| `cwActionId` | string |
| `ccwActionId` | string |
| `pressActionId` | string (optional) |
| `ticksPerFire` | number, default 1, range 1–10 |

Rotating fires the corresponding action once per *n* ticks. The Stream Deck+ encoder emits a `ticks` count per event that can exceed 1 on a fast spin — respect it, and fire the action that many times, but **clamp to 10 firings per event** to protect against a spin flooding REAPER with destructive actions. The touchscreen displays the two action names.

This mode is how a user gets nudge, zoom, grid-size, or item-navigation on a dial.

**Mode B — Parameter control**

| Setting | Type | Notes |
|---|---|---|
| `parameter` | enum | `trackVolume` \| `trackPan` |
| `trackTarget` | enum | `number` \| `selected` \| `master` |
| `trackNumber` | number | |
| `sensitivity` | number | 0.1–5.0, default 1.0 |
| `pressBehavior` | enum | `reset` \| `mute` \| `none` |

Rotating writes a new value via `SET/TRACK/n/VOL/x` or `.../PAN/x`. The touchscreen shows the track name, the parameter, the current value (dB for volume, L/R percentage for pan), and a bar indicator.

FX parameter control is **out of scope** — REAPER's web interface does not expose FX parameters. Do not attempt it, and do not offer it in the PI.

**Value handling for Mode B**

- Maintain an optimistic local value so the dial feels immediate; reconcile against the polled `TRACK` value.
- If the polled value diverges from the local value by more than a small epsilon and no rotation happened in the last 250 ms, snap to the polled value — the user moved the fader in REAPER.
- Volume must use a sensible taper. A linear map of ticks to REAPER's volume scale feels wrong at the top of the range. Use dB-domain increments: roughly 0.5 dB per tick at default sensitivity, finer below −40 dB.
- Throttle writes to 20 Hz maximum.
- Clamp to REAPER's valid range; confirm the range during §3.

---

## 7. Action database and browser

The searchable action picker, delivered without any REAPER-side component.

### 7.1 Bundled database

Ship `data/actions-native.json` with the plugin:

```json
{
  "reaperVersion": "7.25",
  "generated": "2026-07-26",
  "actions": [
    { "id": "40044", "name": "Transport: Play/stop", "section": "main", "tags": ["transport", "play"] }
  ]
}
```

Generate it by exporting the action list from REAPER's Actions window (Actions → Show action list → Export) and converting to JSON with a script in `tools/build-action-db.ts`. Commit both the raw export and the generated JSON so regeneration is reproducible on a new REAPER version.

Curate a `tags` field for the ~150 most commonly used actions so that searching "play" surfaces transport actions before obscure matches. The rest can rely on name matching alone.

### 7.2 User import

Native actions only cover part of what users care about — SWS and ReaPack scripts are absent, and those are exactly what power users bind. Provide an import path:

- PI shows an **Import my action list** button with instructions: in REAPER, Actions → Show action list → Export, save as text, then select the file here.
- Parse the exported format (verify its exact structure — it is tab or comma delimited depending on export choice) and merge into a user database stored in global settings.
- Show a confirmation: "Imported 3,412 actions, including 287 SWS and script actions."
- Imported actions are marked with a badge in the browser so users can tell them apart.
- Provide a **Clear imported actions** button.

Storing several thousand actions in Stream Deck global settings may exceed practical limits. **Test this.** If it does, store the database in the plugin's own data directory on disk and keep only a path reference in settings.

### 7.3 Browser UI

Inside the Property Inspector, a modal or expanding panel:

- Search box with focus on open, filtering as the user types.
- Fuzzy matching on name; exact matching on ID. Typing `40044` finds it directly.
- Results grouped: Recently used, then Favorites, then all matches.
- Each row shows name, ID, and source badge (native / imported).
- Keyboard navigable — arrow keys and Enter. Users configuring twenty keys will not want to reach for the mouse each time.
- Star icon per row to favorite.
- A **Use this ID directly** escape hatch that accepts any string, for actions in neither database.

Debounce filtering at 120 ms. With several thousand entries, filter off the main thread if the UI stutters.

---

## 8. State and polling model

A single `StateManager` owns all polling. Individual keys never poll.

- Keys register their state needs on `willAppear` and deregister on `willDisappear`.
- The manager computes the minimal query set: if any transport key is visible, poll `TRANSPORT`; if any track key or Mode B dial is visible, poll `TRACK`.
- Poll interval 200 ms (5 Hz) when any subscriber exists, zero when none.
- Drop to 1 Hz after 60 seconds with no key press and no state change, to be a good citizen on battery-powered laptops. Return to 5 Hz on any interaction or state change.
- Fan out parsed state to subscribers; each key updates only if its own slice changed. Do not re-render every key on every poll — that causes visible flicker on large decks.

`TRACK` returns all tracks in one reply. Cache the full track list; do not query per-track.

---

## 9. Visual design

The Stream Deck's key is 72×72 px rendered, 144×144 for @2x. Design for legibility at a glance from a meter away in a dim studio.

- Ship SVG sources, export PNG at 1x and 2x.
- Colors follow REAPER's own conventions where they exist — record arm red `#E04040`, solo amber `#E0A030`, mute yellow `#E0E040`.
- Off states are the same icon at roughly 35% opacity, not a different icon. Users must recognize a key regardless of state.
- Provide a neutral default icon for Run Action, with an optional user-supplied image through Stream Deck's standard image picker.
- Key titles: default to the cached action name, truncated. Let users override. Respect the user's font and size choices from the Stream Deck UI.
- Every action needs a 20×20 list icon for the Stream Deck action browser, and the plugin needs a 28×28 category icon.
- Include a disconnected-state overlay: a small badge in the corner, not a full icon replacement, so the key remains recognizable.

---

## 10. Settings

**Global** (shared across all keys, stored via `streamDeck.settings.setGlobalSettings`):

| Key | Default |
|---|---|
| `host` | `localhost` |
| `port` | `8080` |
| `username` | empty |
| `password` | empty |
| `timeoutMs` | `2000` |
| `importedActions` | none |
| `favorites` | `[]` |
| `recentActions` | `[]` (cap 20) |

**Password storage.** REAPER's web interface uses HTTP Basic auth, which is plaintext over the wire. Stream Deck global settings are stored unencrypted on disk. Do not present this as secure. Add a note in the PI: "REAPER's web interface sends credentials unencrypted. Only use this over a network you trust." For a localhost connection this is a non-issue; for the LAN case it matters and the user deserves to know.

**Per-key settings** are defined in each action's section above.

---

## 11. Error handling

Principles: fail loudly at the key, fail informatively in the PI, never fail silently.

| Situation | Key behavior | PI behavior |
|---|---|---|
| REAPER not running | Disconnected badge on all keys | Setup panel expands with reconnection instructions |
| Action ID empty | "Not configured" icon | Field highlighted, inline hint |
| Action ID unrecognized | Normal icon; alert on press | Warning under the field: "This ID isn't in your action list. It may still work — import your action list to confirm." |
| Request timeout | `showAlert()` | Status shows "REAPER isn't responding" |
| Auth failure | `showAlert()` | Setup panel expands to credentials |
| Track out of range | Distinct out-of-range icon | Warning under track number field |

Log through `streamDeck.logger` at appropriate levels. Never log credentials. Provide a **Copy diagnostics** button in the PI that copies plugin version, OS, Stream Deck version, REAPER version, connection settings with the password redacted, and the last 20 log lines — this will halve the round-trips on every support request you receive after launch.

---

## 12. Marketplace requirements

- `manifest.json`: `SDKVersion: 2`, `Software.MinimumVersion: "6.5"`, `Nodejs.Version: "20"` (confirm against the current CLI default), `Category: "REAPER"`, author, description, and a valid semver `Version`.
- `OS` array must list both `mac` (minimum 12) and `windows` (minimum 10) with tested minimums.
- Category icon at 28×28 and 56×56; plugin icon at 72×72 and 144×144.
- Every action needs `Name`, `Tooltip`, `Icon`, and `States`.
- Localization: ship `en.json` at minimum. Structure the code for additional locales even if you ship only English — the REAPER community is heavily international.
- Marketplace listing needs screenshots of real hardware, a clear description, and a support URL. Point it at a GitHub issues page, not personal email.
- State plainly in the listing that REAPER's web interface must be enabled, and link to setup instructions. The most common one-star review for plugins like this is from a user who never enabled the prerequisite.
- Include a privacy statement: the plugin sends no data anywhere except to the user's configured REAPER host.

---

## 13. Testing

**Unit** — parsers against recorded real fixtures from §3, the connection state machine, the polling scheduler, dB taper math, fuzzy search ranking.

**Integration** — a mock HTTP server replaying recorded REAPER responses. Cover REAPER disappearing mid-session, timeouts, malformed replies, and auth failures.

**Manual matrix** — Windows and macOS × Stream Deck Mini, MK.2, XL, and Plus. Verify: first-run onboarding with no prior config, REAPER restart mid-session, plugin behavior with 30+ configured keys, profile switching, dial responsiveness on fast spins.

**Performance** — confirm the polling loop holds under 1% CPU, and that REAPER shows no measurable performance impact during playback with 32 tracks and a full deck of state-bearing keys.

---

## 14. Repository structure

```
reaper-streamdeck/
├── com.schapps.reaper.sdPlugin/
│   ├── manifest.json
│   ├── bin/
│   ├── imgs/
│   ├── ui/                    # Property Inspector
│   ├── data/actions-native.json
│   └── logs/
├── src/
│   ├── plugin.ts
│   ├── reaper/                # client, parsers, state manager
│   ├── actions/               # one file per key type
│   ├── actiondb/              # bundled DB, import, search
│   └── util/
├── tools/build-action-db.ts
├── docs/protocol-findings.md
├── tests/
└── package.json
```

---

## 15. Milestones

1. **Protocol verification.** §3 complete, `docs/protocol-findings.md` written. Report findings before proceeding — several design decisions below depend on the results.
2. **Skeleton and transport.** Scaffold via `streamdeck create`, implement `ReaperClient` with tests, Run Action key with manual ID entry only, setup panel and Test Connection.
3. **Transport and Track keys.** State manager, polling, two-state feedback.
4. **Action database.** Bundled JSON, generator script, search UI, favorites and recents.
5. **Action import.** Export parsing, merge, storage-limit handling.
6. **Dials.** Both modes, touchscreen layouts, dB taper.
7. **Polish.** Icons, error states, diagnostics, localization scaffolding.
8. **Release.** Cross-platform test matrix, Marketplace assets, submission.

Ship milestone 2 to yourself and use it for real work for a week before building milestone 3. Everything after that will be better informed.

---

## 16. Open questions

- Does the web interface expose toggle state for arbitrary actions? (§3.9) — determines whether Run Action keys can show state.
- Do named command IDs resolve? (§3.2) — determines whether SWS and script actions work at all.
- Is section targeting possible? (§6.1) — determines whether MIDI Editor actions are reachable.
- Can Stream Deck global settings hold several thousand actions, or is on-disk storage needed? (§7.2)
- Should multiple REAPER instances be supported in v1, or deferred? Currently specified as a single global host/port; per-key overrides would allow multi-instance but complicate the PI.
