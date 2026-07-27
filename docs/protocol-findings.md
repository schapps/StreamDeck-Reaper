# REAPER web interface — protocol verification findings

Milestone 1 of `reaper-streamdeck-spec.md` §3. Verified live against REAPER 7.x
(`reaper_csurf_www/0.1`) on macOS, port 8080, using `curl`. Raw captures live
under `tests/fixtures/`. Windows was not tested this session (no Windows
machine available) — treat Windows behavior as unverified, not assumed
identical, until someone runs this same battery there.

A copy of REAPER's own `reaper_www_root/main.js` — the file that ships
inside REAPER.app and is the actual source of truth for this protocol — is
saved at `tests/fixtures/reaper-main.js.reference`. It is more complete than
REAPER's public web docs and was the single most useful artifact this
session. Read it before extending any parser.

---

## The three flagged results

### 1. Named command IDs (`_SWS_*`, `_RS*`) — RESOLVE. Spec's pessimism was unwarranted here... partially.

Both SWS actions and installed ReaPack/ReaScript custom IDs resolve and run
over the web interface, exactly like numeric IDs. Confirmed by:

- Firing `/_/_SWS_ABOUT` → `200 OK`, and it visibly opened the SWS About
  dialog on screen (confirmed by the user).
- Firing `/_/_RSba8db1c5bf8a9ba5ba40b9ad5e6189967b612716` (a real installed
  ReaScript's custom ID, pulled from `reaper-kb.ini`) → `200 OK`, ran without
  error.
- Non-destructively confirmed resolution for *any* candidate ID via
  `GET/<id>` (see finding 2 below) — a fabricated `_RS...`-style ID returns
  an empty body, a real one returns a `CMDSTATE` line.

**Section 4.2 of the spec ("Run Action cannot trigger SWS or ReaPack script
actions") does not apply.** No scope reduction needed. `actionId` as a plain
string, numeric or named, works as designed.

### 2. Arbitrary action toggle-state query — EXISTS. This is an upgrade, not a deviation.

`GET/<command_id>` (numeric or named) returns:

```
CMDSTATE \t command_id \t state
```

`state` is `>0` (on), `0` (off), or `-1` (no toggle state, e.g. a momentary
action like Transport: Play/stop). This is documented directly in REAPER's
own `main.js` (which the public web docs omit or bury) and confirmed live:

| Request | Response |
|---|---|
| `GET/40364` (View: Toggle metronome — a real toggle) | `CMDSTATE\t40364\t0` |
| `GET/40044` (Transport: Play/stop — not a toggle) | `CMDSTATE\t40044\t-1` |
| `GET/999999999` (nonexistent numeric ID) | `CMDSTATE\t999999999\t-1` |
| `GET/_SWS_ABOUT` (real named command) | `CMDSTATE\t_SWS_ABOUT\t0` |
| `GET/_BOGUSIDNOTREAL` (fabricated named ID) | **empty body**, no `CMDSTATE` line |
| `GET/_RSba8db1c5bf8a9ba5ba40b9ad5e6189967b612716` (real installed script) | `CMDSTATE\t_RS...\t-1` |
| `GET/_RS0000...0000` (fabricated RS-style ID) | **empty body** |

Two consequences for the spec:

- **§6.1 "Feedback" must change.** The Run Action key CAN show persistent
  toggle state for a caller-supplied action, not just a 200ms press-flash.
  Add `showToggleState` as a real, always-available option — not one gated
  behind a "§3.9 found it" conditional, since it's confirmed present. Poll
  `GET/<actionId>` for any Run Action key with `showToggleState` enabled;
  treat `-1` as "no state, fall back to press-flash" per-key rather than a
  global capability flag.
- **Bonus, free "does this ID exist" check.** Because unresolvable named IDs
  return an empty body while resolvable ones (even non-toggle ones) return
  `CMDSTATE ... -1`, the action browser's "This ID isn't in your action
  list" warning (spec §11) can be upgraded from a static heuristic (look it
  up in the bundled/imported DB) to a live, authoritative check against the
  actual running REAPER instance — with zero side effects, since `GET/` never
  fires the action.

### 3. Section targeting — inferred Main-only, not empirically proven live.

`main.js`'s own protocol documentation — which is otherwise exhaustive
(covers TRANSPORT, TRACK, SEND, EXTSTATE, PROJEXTSTATE, MARKER/REGION, OSC,
LYRICS, and more) — contains **no mention of any section-targeting syntax**:
no prefix, no query parameter, no alternate endpoint. Every command form
(bare numeric ID, bare named ID, `GET/<id>`) takes no section argument.

I did not run a live cross-section test (e.g., firing a MIDI-editor-only
action ID while the MIDI editor is focused and confirming which section's
meaning wins) — doing that safely requires an open MIDI item and a way to
visually confirm the result, and firing an unfamiliar numeric ID blind
against a real project risked an unintended action. Given the absence of any
documented mechanism in REAPER's own reference file, treat this as
high-confidence but not certainty.

**Recommendation: keep the spec's §6.1 handling as-is** — expose the
`section` dropdown, disable non-Main options with the documented tooltip,
never silently run a non-Main ID against Main. If you want to close this out
completely before shipping, open a MIDI item's piano roll, focus it, and
fire a known MIDI-editor-only ID through `/_/` while watching what happens
in REAPER.

---

## Items 1–14

**1. Numeric action (`40044` play/stop).** `200 OK`, `Content-Type: text/plain`,
empty body, `Content-length: 0`. Verified round-trip via `TRANSPORT`:
playstate flipped `0 → 1` after firing, `1 → 0` after firing again. See
`tests/fixtures/transport.txt`.

**2/3. Named commands.** See flagged result #1 above. Both SWS and ReaScript
custom IDs resolve and execute.

**4. Batching.** `/_/40044;TRANSPORT` executes in listed order and returns
concatenated `\n`-joined replies reflecting post-command state. Mixed query
types in one batch (`NTRACK;TRACK`) work identically — one reply line per
matched command, in order. See `tests/fixtures/batching.txt`.

**5. TRANSPORT format.** Confirmed exact field order:

```
TRANSPORT \t playstate \t position_seconds \t isRepeatOn \t position_string \t position_string_beats
```

`playstate`: 0 stopped, 1 playing, 2 paused, 5 recording, 6 record-paused
(from `main.js`; only 0 and 1 observed live this session).
`position_string` is `HH:MM:SS:FF`, `position_string_beats` is
`measure.beat.hundredths`. See `tests/fixtures/transport.txt`.

**6. TRACK format.** Confirmed exact field order:

```
TRACK \t idx \t name \t flags \t vol \t pan \t last_meter_peak \t last_meter_pos \t width/pan2 \t panmode \t sendcnt \t recvcnt \t hwoutcnt \t color
```

- `idx`: 0 = master, 1+ = user tracks.
- `flags` is a bitmask, confirmed live: 1 folder, 2 selected, 4 has-FX,
  8 muted, 16 soloed, 32 solo-in-place, 64 record-armed, 128 record-monitor-on,
  256 record-monitor-auto. **Also observed bit 512 set on tracks with FX,
  which `main.js` does not document.** Parsers must mask only the known bits
  and silently ignore anything else — do not assume the documented set is
  exhaustive, and do not treat an unmatched bit as an error.
- `vol`: linear multiplier, 1.0 = 0dB, 0 = -inf. Not clamped by the server on
  write (see item 8).
- `pan`: -1..1, clamped by the server on write.
- `color`: decimal `0xAARRGGBB`. **Observed to change spontaneously after a
  record-arm on/off cycle** on a track that was never given a custom color —
  likely a theme-driven arm-tint that doesn't fully revert. Don't use `color`
  as a stable per-track identity key; use `idx`.

See `tests/fixtures/track-list.txt`.

**7. NTRACK.** `NTRACK \t count`, where count excludes the master track
(4 user tracks → `NTRACK\t4`, and 5 `TRACK` lines came back for `TRACK` with
no index, idx 0–4). Confirmed. See `tests/fixtures/ntrack.txt`.

**8. Track setters.** All five confirmed working exactly as `main.js`
documents, tested on an unused track and restored after each step:

- `SET/TRACK/n/MUTE/1`, `.../0`, and toggle `.../-1` — all three forms work.
- `SET/TRACK/n/SOLO/1` sets **both** bit 16 (soloed) and bit 32
  (solo-in-place) — not independently controllable through this setter.
- `SET/TRACK/n/RECARM/1` / `/0` confirmed; see the `color` side-effect noted
  above.
- `SET/TRACK/n/VOL/<value>`: absolute (`1.0` = 0dB) and relative
  (`+3`, `-3`, in dB) both confirmed **exact** — `+3` → `×1.412538`
  (`10^(3/20)`), `-3` → `×0.707946`. **Critical gotcha found live: the sign
  character must be sent unescaped in the URL path.** Percent-encoding it
  (`%2B3`) silently breaks parsing and the volume is set to `0.000000`
  instead of applying a relative adjustment — REAPER does not decode `%2B`
  the same way it reads a raw `+`. Any client that blindly runs
  `encodeURIComponent` over the whole command string **will** hit this bug.
  Build relative-volume commands by concatenating the raw sign character
  into the path, never through a URL-encoding helper.
- `SET/TRACK/n/PAN/<value>`: confirmed clamps to `-1..1` server-side
  (sent `2.0`, got back `1.0`).
- **`VOL` is NOT clamped server-side** — sent `10.0` (+20dB, absurd), REAPER
  accepted it verbatim. Client-side clamping (spec §6.4's "clamp to REAPER's
  valid range") must be enforced by the plugin; REAPER will not save you
  here. Recommend clamping to REAPER's own UI fader range, roughly
  `0..3.98` linear (-inf to +12dB).

See `tests/fixtures/track-setters.txt` for the full before/after sequence.

**9. Toggle-state query.** See flagged result #2 above. Exists, works for
arbitrary caller-supplied IDs, numeric and named alike.

**10. EXTSTATE.** `GET/EXTSTATE/<section>/<key>` and
`SET/EXTSTATE/<section>/<key>/<value>` both confirmed exactly as documented.
Response format `EXTSTATE \t section \t key \t value` (empty value if
unset). URL-encoded values with spaces round-trip correctly. Note this is
the non-persistent form (`persist=false`) — `SET/EXTSTATEPERSIST/...` exists
for the persisted variant but was not tested. See `tests/fixtures/extstate.txt`.

**11. Authentication.** HTTP Basic, confirmed against a live username:password
credential set via REAPER's Control Surface Settings dialog (redacted here —
see note below):

- No `Authorization` header → `401 Unauthorized`,
  `WWW-Authenticate: Basic realm="reaper_www"`.
- Wrong credentials → same `401`.
- Correct credentials → `200 OK` with the normal response body.

No real password is committed anywhere in this repo (see
`tests/fixtures/auth.txt`, which redacts the credential and records only the
response shapes).

**12. Failure modes.**

- **REAPER not running / web interface not applied**: `curl` exit code 7,
  connection refused. Verified directly — this was the actual state at the
  start of this session, before the user enabled and applied the web
  interface.
- **Wrong port**: identical signature, exit code 7, connection refused. The
  client cannot distinguish "REAPER is closed" from "wrong port" — both need
  the same generic "Couldn't reach REAPER" diagnostic (matches spec §4's
  Diagnostics table already).
- **Busy in a modal dialog**: tested live — with the SWS About dialog open
  on screen, `GET /_/TRANSPORT` still returned `200 OK` in ~33ms. **The web
  server is not blocked by a modal on REAPER's main thread**, at least for
  read-only state queries. This is better than the spec assumed. Whether
  action-firing commands queue, execute, or no-op while a modal is open was
  not tested — flag as an open question before relying on it for anything
  destructive.
- **Mid-render**: not tested this session (would have required triggering a
  real render against the user's live project). Deferred.

See `tests/fixtures/failure-modes.txt`.

**13. Latency and throughput.**

- Single-request latency (`TRANSPORT`, 20 samples): min 16.5ms, max 27.4ms,
  avg 21.9ms. Comfortably under the spec's 50ms success-criterion target.
- Sustained 5Hz polling (`NTRACK;TRACK;TRANSPORT` batched, 50 requests over
  10s): min 5.0ms, max 28.6ms, avg 19.5ms, **no degradation** between the
  first 5 and last 5 samples. REAPER shows no measurable slowdown under
  sustained polling at the spec's target rate.

**14. Multiple instances.** Not tested this session — deferred by explicit
choice rather than by finding a blocker. Launching a second REAPER process
was judged not worth the disruption for this pass. Architecturally there's
no reason to expect cross-instance interference (each instance's web server
is configured and bound independently, on its own port, via that instance's
own prefs), but this is inference, not verification. Recommend a quick live
check before shipping any multi-instance UI (spec §16 open question).

---

## Summary of spec changes this findings doc drives

1. **§6.1 Run Action feedback**: replace "no persistent toggle state" with a
   real `showToggleState` setting, unconditionally available (not gated on
   an unresolved §3.9). Backed by finding 2.
2. **§11 unrecognized-ID warning**: can be upgraded from a static DB lookup
   to a live `GET/<id>` existence check, with zero side effects.
3. **§5/§6.4 client-side clamping**: VOL is not server-clamped — the
   `ReaperClient`/dial code must enforce range limits itself, not assume
   REAPER will reject an absurd value.
4. **Relative VOL/PAN encoding**: `ReaperClient` must never run a generic
   URL-encoder over a relative-adjustment command — the sign character has
   to stay raw and unescaped in the path, or the command silently misbehaves
   (sets to 0 instead of adjusting).
5. **§6.1 section targeting**: no change to the spec's planned handling
   (Main-only, dropdown disabled for other sections) — just downgrade
   confidence from "assumed" to "strongly inferred, not live-proven."

No item in §3 came back worse than the spec assumed. Two came back better
(named-ID resolution, toggle-state query) with concrete design upgrades
above; the rest matched or were left explicitly unverified/deferred rather
than assumed.

---

## Milestone 3 addendum: Transport action IDs

Spec §6.2 lists action IDs for the Transport key's `function` settings but
notes they need verifying. Verified live (each fired, `TRANSPORT` checked
before/after, state fully restored afterward):

| function | action ID | verified how |
|---|---|---|
| `play` | `1007` | fired from stopped, confirmed `playState` 0→1; name confirmed by export: "Transport: Play" |
| `playStop` | `40044` | confirmed in Milestone 1 (§3 item 1); export: "Transport: Play/stop" |
| `stop` | `40667` | fired from paused, confirmed `playState`→0; export: "Transport: Stop (save all recorded media)" |
| `pause` | `1008` | export: "Transport: Pause" - see correction below, not fire-tested directly |
| `record` | `1013` | export: "Transport: Record" - see correction below, deliberately not fired |
| `repeat` | `1068` | fired, confirmed `isRepeatOn` flips both directions; export: "Transport: Toggle repeat" |
| `gotoStart` | `40042` | fired, confirmed `positionSeconds`→0; export: "Transport: Go to start of project" |
| `gotoEnd` | `40043` | export: "Transport: Go to end of project" - see correction below |

### Correction (Milestone 4): pause and record were wrong

The user obtained a real action-list export via an SWS action (`ActionList.txt`,
committed at repo root) after this doc was first written. Cross-referencing it
against the live-fired IDs above turned up two mistakes from the original
session, both now fixed in `src/actions/transport.ts`:

- **`pause`**: was mapped to `40073`, which the export names "Transport:
  Play/pause" - a toggle, not a dedicated pause. Firing it while playing
  (what I tested) happens to look identical to a real pause, which is how
  the mistake slipped through live-fire verification. The correct dedicated,
  non-toggling action is `1008` ("Transport: Pause"), sitting in the same
  low-ID family as `1007` Play - the same pattern that was already right for
  `play`, and should have been the first place to look for `pause` too.
- **`record`**: was mapped to `40046` ("Transport: Start/stop recording at
  edit cursor") - a real action, but a specific variant, not the plain one.
  The export shows `1013` ("Transport: Record") in the same `1007`/`1008`
  family. Switched to `1013`, still deliberately not fire-tested - starting
  a record pass on the user's live project wasn't worth it for a name-level
  confirmation this clear.
- **`gotoEnd` (40043)** is confirmed correct by the export's name ("Transport:
  Go to end of project"), resolving the earlier ambiguity (landing on the
  same position as `gotoStart` was the test project being short, not a wrong
  ID).
- **`stop` (40667)** was deliberately kept over the plainer `1016` ("Transport:
  Stop", also live-verified to exist) - `40667` explicitly preserves any
  in-progress recording, while its sibling `40668` explicitly *deletes* it,
  strongly suggesting `1016`'s behavior mid-recording is unspecified/risky by
  comparison. A "Stop" key a user reaches for reflexively, possibly while
  recording, should not gamble on that.

Lesson for later milestones: a live fire-and-observe test proves an action
does *something* consistent with the hypothesis, not that it's the *specific*
action the spec intended - name confirmation from an authoritative list
catches mistakes behavioral testing alone can miss when two actions produce
overlapping observable effects from the same starting state.

---

## Milestone 5 addendum: action-list export mechanism

Spec §7.2 assumes REAPER's native **Actions → Show action list → Export**
menu item. It doesn't exist in the user's REAPER 7.77 - the Actions window
has no export command. The real, working mechanism is an SWS action:
**`SWS/S&M: Dump action list (all actions)`** (command ID
`_S&M_DUMP_ALL_ACTION_LIST`), which writes the same tab-delimited
`Section\tId\tAction` format already verified in Milestone 4
(`tools/ActionList.txt`). SWS ships four other dump variants (native-only,
SWS-only, custom-only, all-but-custom) - "all actions" is what both the
bundled native database and the runtime import feature are built against,
since it's the only one that captures SWS and ReaPack/custom script IDs
alongside the native ones.

The plugin's own action-list import feature (§7.2's "Import my action
list") points users at this SWS action directly rather than the
nonexistent native export command.

Also resolved from the Milestone 3 addendum: REAPER's native "toggle `<x>`
for selected tracks" actions (`6` mute, `7` solo, `9` recarm) toggle each
selected track **independently**, verified live with a mixed-state
selection - not a uniform block toggle. The Track Control key's "selected"
target mode (see the git history for `src/actions/track.ts`) computes
uniform on/off state client-side from cached poll data instead of relying
on those actions or the `SET/TRACK/.../-1` toggle form.
