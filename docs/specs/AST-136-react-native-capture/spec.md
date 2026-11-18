---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-136
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [imdreamrunner]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# React Native platform: Capture system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app records what the device hears, reads what a picture shows, and keeps
a sensitive screen out of screenshots. A person records a voice note and
watches its level move, picks a photo of a QR code and the app opens what the
code holds, and opens a private document that a screenshot or a screen
recording shows as blank. The developer gets a recorder that writes a file
the app owns and never asks for the microphone by itself, a decoder that
reads codes from an image file without the camera, and a counted hold on
screen capture that any number of screens can take and release.

This record details three pieces of the platform layer of `spec:AST-112`:
the `microphone` and `camera` opt-in capabilities (`spec:AST-112/FR1`,
`spec:AST-112/FR3`) and one core module, with the result vocabulary
(`spec:AST-112/FR6`), the capability shape (`spec:AST-112/FR7`), additive
evolution (`spec:AST-112/FR8`), and Astryx Stage (`spec:AST-112/FR12`). It
specifies the audio recorder (`AstryxAudioRecorder`), the image code decoder
(`AstryxBarcode`), and the screen-capture module (`AstryxScreenCapture`).
Playback and the camera view belong to `spec:AST-132`; the permission module
and the platform info module belong to `spec:AST-130`.

## Why this exists

Each piece stays in the platform package because an app's alternative is an
open-source library that ships native code of its own, which ends a
JavaScript-only app and its use as a previewed project.

- `AstryxAudioRecorder` records into the calling runtime's own folder, with
  native-timed levels, a closed reason for every way a recording ends by
  itself, results that never throw, no Expo runtime library
  (`spec:AST-112/FR11`), and Astryx Stage parity.
- `AstryxBarcode` reads codes from an image file with no camera and no
  permission prompt. A pure-JavaScript decoder needs no native code but needs
  the image's pixels, which JavaScript cannot read in React Native without a
  native module; the scope stays open (OQ3).
- `AstryxScreenCapture` is one counted hold that screens and the web view's
  `preventsCapture` share, so one release never uncovers another screen's
  content. It declares no permission, which keeps it in the core (DEC-3).
  Reporting capture on iOS is a scope question (OQ2).

## Who uses it

| Native piece          | Kind                                | Astryx components that use it                                                                                                                                                                                      | What a person sees                                                                                                                        |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxAudioRecorder` | native module (Turbo Native Module) | No library component; app API through the `./microphone` entry (`AstryxAudioRecorder`). A finished file plays through the library's `useAudioPlayer` (`spec:AST-132`)                                              | A voice note recorded with a level meter that the app draws, and the system's own microphone indicator while it records                   |
| `AstryxBarcode`       | native module (Turbo Native Module) | No library component; app API through the `./camera` entry (`AstryxBarcode.decodeImage`), often after the file picker (`spec:AST-130`)                                                                             | A photo of a QR code or a barcode, picked from the library, that the app reads with no camera and no permission prompt                    |
| `AstryxScreenCapture` | native module (Turbo Native Module) | No library component calls it. `WebView`'s `preventsCapture` (`spec:AST-131/FR12`) holds the same window flag through the shared count; app API through the `.` entry (`AstryxScreenCapture`, `usePreventCapture`) | On Android, a screenshot or a screen recording of a private screen comes out blank, and the recent-apps thumbnail of that screen is blank |

## Non-goals

- Playback, peak levels of a recorded file for a waveform, the camera view,
  and live code detection from the camera: `spec:AST-132` owns them.
- The permission module, its states, and its hook, and the platform info
  module's feature rows: `spec:AST-130` owns them. This record states only
  how the group reads them.
- Recording video, recording the screen, streaming audio while it records,
  speech recognition, audio effects, and formats other than AAC.
- Generating codes, and decoding codes from anything but an image file.
- A drawn cover over a sensitive screen on iOS, and any guarantee against a
  second device that photographs the screen.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — Where each piece lives.**
  - `microphone` is an opt-in capability (`spec:AST-112/FR3`). It links
    AVFoundation on iOS and the platform's media recorder on Android. With
    the app's opt-in, the configuration plugin writes iOS's microphone usage
    description and Android's `RECORD_AUDIO` permission with the microphone
    hardware feature marked optional; an app that does not opt in carries
    neither. The `./microphone` entry exports `AstryxAudioRecorder`.
  - `AstryxBarcode` is part of the `camera` opt-in capability
    (`spec:AST-132/FR1`). It adds no permission and no hardware feature of
    its own. The `./camera` entry exports `AstryxBarcode` with the code types
    of `spec:AST-132/FR10`.
  - `AstryxScreenCapture` is a core module (DEC-3). The `.` entry exports
    `AstryxScreenCapture` and `usePreventCapture`. Its native module exists on
    Android only, and it declares no permission or manifest entry.
  - The library reaches the two capabilities only through
    `AstryxPlatform.capability('microphone' | 'camera')`
    (`spec:AST-112/FR2`).
- **FR2 — The native contract.**

  | Contract              | Kind                                | Methods                                                                                  | Events               | Platforms    |
  | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- | -------------------- | ------------ |
  | `AstryxAudioRecorder` | native module (Turbo Native Module) | `getConstants()` (`version`), `permission`, `start`, `pause`, `resume`, `stop`, `cancel` | `onLevel`, `onState` | iOS, Android |
  | `AstryxBarcode`       | native module (Turbo Native Module) | `getConstants()` (`version`), `isSupported`, `decodeImage`                               | none                 | iOS, Android |
  | `AstryxScreenCapture` | native module (Turbo Native Module) | `getConstants()` (`version`, `isSupported`), `hold`, `release` (synchronous)             | none                 | Android      |
  - Every method is optional and takes one request object. An asynchronous
    method resolves one result object and never rejects.
  - Recorder calls name a `recordingId` that the JavaScript picks, unique in
    its runtime.
  - `hold` and `release` are synchronous, because the flag must be on the
    window before the next frame (FR10). They answer `status`, `reason`,
    `message`, the process-wide `holds` after the call, and `applied`, whether
    the window agrees with the count when the call returns.

- **FR3 — The microphone permission is explicit.**
  - `AstryxAudioRecorder.getPermission()` reads the microphone's state and
    never prompts. `requestPermission()` shows the system prompt where the
    system allows one, then answers the state. `start` never prompts. Each
    answers `{ok: true, state, hasHardware}`.
  - The states are those of `spec:AST-130/FR9`: `granted`, `undetermined`,
    `denied` (refused; the app may ask again), and `blocked` (only Settings
    changes it). `hasHardware` is false where the system reports no input.
  - An app that did not declare the permission answers `not-declared` and
    sees no prompt. A prompt already showing answers `busy`; Android with no
    activity to ask from answers `no-activity`.
- **FR4 — `AstryxAudioRecorder` records to a file.**
  - `start(options)` answers `{ok: true, recording}` or a failure. Its options
    are `format` (`aac`, the default: AAC in an MPEG-4 container,
    `audio/mp4`, an `.m4a` file), `sampleRate` (default 44100 Hz, at least
    8000), `channels` (1, the default, or 2), `bitRate` (default 64000, at
    least 8000), and `levelIntervalMs` (default 50, at least 16, or `false`
    for no levels). An option outside its range answers `invalid-option`.
  - Without a granted permission `start` answers `not-granted`. One recording
    runs at a time in the process; a second `start` from any runtime answers
    `busy`. A device without a usable input answers `no-input`.
  - The file is new, in the calling runtime's own cache folder, and belongs to
    the app from then on: the platform never deletes a finished file.
    Recording has no length or size limit of its own; it runs until `stop`,
    `cancel`, the app leaves the foreground, or the disk is full.
  - A `recording` has `id`, `uri` (the file being written), `contentType`,
    `status()` (the last state the native side sent), `pause()`, `resume()`,
    `stop()`, `cancel()`, `subscribe(listener)` for state changes, and
    `subscribeLevels(listener)` for levels; each `subscribe` returns the
    function that stops it.
  - `stop()` finishes the file and answers `{ok: true, uri, durationMs,
contentType, size}`; `durationMs` leaves out paused time. After a
    recording has ended by itself, `stop()` answers the same file. `cancel()`
    stops and deletes the file. Pausing a paused recording, resuming one that
    is not paused, or any call but `stop()` after the end answers
    `invalid-state`; an unknown id answers `not-found`.
- **FR5 — Levels while recording.** Every `levelIntervalMs` while the
  recording runs, and never while it is paused, the native side sends one
  level: `level` (average power) and `peak` (peak power), each 0 to 1 over
  −50 dBFS to 0 dBFS with 0 at or below −50 dBFS, `db` (average power in
  dBFS), and `durationMs`. The native side times the levels; JavaScript never
  polls.
- **FR6 — Recording follows the system.**
  - On iOS the recorder sets the shared audio session to play and record
    (speaker output, Bluetooth input allowed) for the recording. When the
    recording ends it restores the category, mode, and options it found and
    lets other apps' audio resume. On Android it holds transient exclusive
    audio focus while it records and gives it back at the end.
  - A call, the system's assistant, or another app that takes the input
    pauses the recording with reason `interruption`. When the interruption
    ends the recording stays paused and a state with reason
    `interruption-ended` arrives; the app may call `resume()`.
  - A change of input, such as a headset plugged in or removed, keeps the
    recording running and sends reason `route` with the new input's name.
  - When the app leaves the foreground, the recording ends: the file is
    finished and kept, and a `stopped` state with reason `background` carries
    it. A full disk ends it with `no-space` and an iOS media-services reset
    with `media-services-reset`, each keeping the file up to that point. A
    `stopped` state carries `uri`, `durationMs`, `contentType`, and `size`.
  - Recording in the background is a later named feature (FR13).
- **FR7 — The person always knows the microphone is on.** The system's own
  recording indicators (iOS's indicator and the app's name in Control Center;
  Android's microphone indicator and privacy chip) show for as long as the
  input is open. The platform never hides or delays them. Because a recording
  ends when the app leaves the foreground, the input is never open while the
  app is out of sight.
- **FR8 — `AstryxBarcode` reads codes from an image file.**
  - `decodeImage({uri, types?})` reads the image at `uri`: a `file://` path,
    or on Android a `content://` grant such as the photo picker's. `types` is
    a list of the code types of `spec:AST-132/FR10`; absent means every type,
    and unknown names are ignored.
  - It answers `{ok: true, codes, imageSize}`. `codes` holds every code of
    the requested types that the platform finds, in reading order where the
    platform gives one, and is empty for an image without one. Each code has
    its `type`, its `value`, and its `bounds` (`x`, `y`, `width`, `height`)
    in the image's upright pixels, with the image's orientation applied.
    `imageSize` is the upright size in pixels.
  - Decoding runs off the main thread. A large image may be decoded at a
    reduced size; the bounds stay in the full upright image's pixels. No
    image is refused for its size.
  - Failures: `unreadable` (missing, or not an image), `no-types` (none of
    `types` is supported here), `unavailable` (the module is present but
    `isSupported()` is false on this device), and the common reasons.
  - The decoder opens no camera and needs no permission. It reports what an
    image holds and gives no meaning to a code.
- **FR9 — `AstryxScreenCapture` is a counted hold.**
  - `preventCapture()` takes one hold and returns its release. Calling the
    release again does nothing. `usePreventCapture(isActive = true)` holds
    while the component is mounted and `isActive` is true, and releases on
    unmount or when `isActive` turns false.
  - On Android, the first hold in the process sets the window's secure flag:
    screenshots and screen recordings show the app's window blank, and the
    recent-apps thumbnail is blank. The last release clears it. A secure flag
    that the app set by itself before the first hold stays after the last
    release.
  - The count belongs to the process, across callers, runtimes, and activity
    re-creation, and the native side applies it again to an activity that
    resumes. Holds are kept per runtime: a runtime that goes away (a reload,
    a host restart) takes its holds with it, and one runtime's release never
    lowers another runtime's holds. The web view's `preventsCapture` shares
    the count.
  - `supports('preventCapture')` answers synchronously whether a hold blocks
    capture here: true on Android with the module, false on iOS, where a
    binary lacks the module, and in Jest. Where it is false a hold blocks
    nothing, so a caller holds unconditionally and reads `supports` only to
    tell the person. `holdCount()` answers the calling runtime's open holds.
- **FR10 — The hold covers the first frame and every window.**
  - `hold` sets the flag on the UI thread before it returns where it safely
    can: on the UI thread it applies at once, and from another thread it
    waits for the UI thread up to a bound. When the bound passes, the hold
    still counts, the flag follows when the UI thread gets to it, and the
    answer says `applied: false`. Content rendered after `preventCapture()`
    returns is never in a frame without the flag.
  - The app's modal windows (the library's sheets, dialogs, menus, and
    drawers on Android) are covered too: a modal shown during a hold takes
    the flag from the activity, a modal already up when the first hold comes
    gets the flag from the module, and both lose it with the last release
    unless a web view inside the modal still holds it.
  - With no resumed activity, `hold` answers `no-window`; the hold counts and
    applies when an activity resumes.
- **FR11 — Previewed projects.**
  - A previewed project's runtime cannot use the microphone: its
    `getPermission`, `requestPermission`, and `start` answer `not-allowed`.
  - `AstryxBarcode` is camera-class in the Preview policy: a project's call
    passes the camera's consent and answers `not-allowed` when the host
    blocks the camera or the person declines. A project decodes only its own
    files (its temporary folder, its cache folder, and its package), and any
    other path answers `not-allowed`.
  - The host app's window is not a project's to protect: a project's `hold`
    and `release` answer `not-allowed` with `holds: 0`, never the app's
    count, and change nothing. A project's web view keeps `preventsCapture`
    (`spec:AST-131/FR12`).
- **FR12 — Results and fallbacks.**
  - No call throws. Every asynchronous call resolves `AstryxResult` and never
    rejects (`spec:AST-112/FR6`). A reason the JavaScript does not know reads
    `error`. `message` never carries a file's contents or a decoded value.
  - The recorder adds `not-declared`, `not-granted`, `busy`,
    `invalid-option`, `not-found`, `invalid-state`, `no-input`, `no-space`,
    `io`, `no-activity` (Android), and `unavailable` (the module went away
    during a reload). The decoder adds `unreadable`, `no-types`, and
    `unavailable`.
  - Not opted in: the capability's JavaScript still loads,
    `AstryxAudioRecorder.isAvailable()` and `AstryxBarcode.isAvailable()`
    answer false, and calls answer `not-linked` (`spec:AST-112/FR3`).
    Without the native side (Jest, the web) they answer `no-module`.
  - `AstryxScreenCapture` returns a release on every platform, and a native
    refusal reaches the log, never the caller.
  - The group draws no UI of its own. The level meter, the decoded result,
    and the explanation of a blocked screenshot are the app's own components
    and are announced as those are; the microphone indicators and the
    screenshot refusal are the system's.
- **FR13 — Contract baseline.** Every contract in the group is at revision 1
  on each platform it ships on. A behaviour added after revision 1 is a named
  feature (`AstryxAudioRecorder.<feature>`, `AstryxBarcode.<feature>`,
  `AstryxScreenCapture.<feature>`) that the binary lists in
  `AstryxPlatformInfo`'s contract features (`spec:AST-130/FR8`) and the
  JavaScript checks with `hasContractFeature` before it uses it. Without the
  feature the JavaScript keeps the revision-1 behaviour or answers
  `unsupported`, never a silent weaker path. Compatibility with Astryx Stage
  goes through the library's Stage version floor: the package names the
  oldest Stage that implements its contract set, and an older Stage refuses
  the project with the gaps listed.
- **FR14 — Public platform API only.** The group uses public iOS, Android,
  and React Native API. The one exception: to flag a modal window already up
  when the first hold comes, the Android module reaches React Native's modal
  host view for its dialog, because React Native copies the secure flag only
  into a modal it shows after the flag is set, and no public React Native API
  reaches a modal's window.

### Platform support

| Contract              | iOS                                                                                                                                                                                         | Android                                                                                                                                                    | Astryx Stage                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AstryxAudioRecorder` | `AVAudioRecorder` over the shared `AVAudioSession` in the play-and-record category; its average and peak power meters; the session's interruption, route, and media-services notifications. | `MediaRecorder` from the microphone to MPEG-4 AAC; transient exclusive audio focus; levels from its maximum amplitude.                                     | No microphone: the permission starts `undetermined` and an ask answers with no drawn prompt; a recording writes a playable silent AAC file of the recorded length; levels are silence unless a scripted check sets them; system events come from a scripted check. |
| `AstryxBarcode`       | Vision's barcode request on an image read with ImageIO, with the image's orientation, on a background queue.                                                                                | ZXing's core library (no native library and no Google Play services) on a worker thread, on an image read through the content resolver and turned upright. | Decodes image files as a device does, with the Preview file rule.                                                                                                                                                                                                  |
| `AstryxScreenCapture` | No module: `supports('preventCapture')` is false and a hold blocks nothing.                                                                                                                 | The window's `FLAG_SECURE`, counted, on the activity and its modal dialogs.                                                                                | With Android behaviour: holds and releases keep the count, with no window to flag. With iOS behaviour: absent, as on iOS.                                                                                                                                          |

- FR5 gap: Android has no average power: `level` and `peak` are both the
  peak, and `db` is the peak's dBFS.
- FR6 gap: Astryx Stage simulates no audio session or audio focus, no
  Bluetooth input, and no prompt still showing (`busy`), `no-activity`, or
  `no-input`.
- FR8 gap: Android finds every QR code in an image but at most one code of
  the other types.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only).
- Unsupported behavior: a feature the binary lacks answers false from
  `supports(feature)`, and a call that needs it answers `unsupported`
  (FR12, FR13); a module the binary lacks answers `no-module` or
  `not-linked` (FR12).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- None beyond `spec:AST-112`. This record details its FR3 (`microphone` and
  `camera` stay opt-in), FR6 (the group's closed reasons), FR7 (explicit
  permissions and the probes), FR8 (the group's revision-1 baseline), and
  FR12 (the group in Astryx Stage).
- `spec:AST-130/FR9` names `camera` as its one permission, and
  `spec:AST-112/FR7` reads permissions through `AstryxPermissions`. This
  record reads the microphone permission through the recorder with the same
  states and rules (FR3); OQ1 asks whether `AstryxPermissions` carries it.
- `spec:AST-112/FR7` asks that an unsupported path never be a silent no-op.
  A hold on iOS blocks nothing and says so only through `supports` (FR9);
  OQ2 asks how iOS answers.

## Verification

| Contract | Verification                                                                                                                       | Representative states                                                                           | Mutation or failure expectation                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Built apps with the core only and with each capability opted in; unit tests of the loader                                          | `microphone` and `camera` opted out; opted in                                                   | An opted-out app declares the microphone permission or links the recorder or the decoder, or the library imports a capability outside its loader |
| FR2      | The platform's spec rules check; `contracts.json` against the codegen specs                                                        | each method and event                                                                           | A listed member is missing, a shipped member changes, or an asynchronous method rejects                                                          |
| FR3      | The microphone contract suite over the `./testing` double; device and emulator permission checks                                   | each permission state; an undeclared permission; a prompt already showing                       | `getPermission` or `start` prompts, an undeclared permission prompts, or a state falls outside the four                                          |
| FR4      | iOS hosted tests that write and read back an AAC file; JVM tests of the recorder rules; Astryx Stage contract suites               | start, pause, resume, stop, cancel; a second start; an unknown id                               | A second recording starts, a cancelled file stays, `durationMs` counts paused time, or a call after the end answers anything but `invalid-state` |
| FR5      | iOS hosted meter tests; JVM tests of the level scale; Astryx Stage scripted levels                                                 | silence; a loud input; paused                                                                   | A level falls outside 0 to 1, a level arrives while paused, or levels depend on JavaScript timers                                                |
| FR6      | Device checks of a call, a headset change, and leaving the app; JVM tests of focus loss                                            | an interruption and its end; a route change; background; a full disk                            | The recording resumes by itself, a route change stops it, the file is lost on leaving the app, or the audio session is not restored              |
| FR7      | Device checks of the system indicators                                                                                             | recording; paused; after leaving the app                                                        | The indicator is missing while the input is open, or the input stays open out of sight                                                           |
| FR8      | Unit tests of the result mapping; Simulator, emulator, and Astryx Stage decodes of fixture images                                  | a QR code; several codes; a rotated photo; no code; a missing file; a picker grant              | A box is in the unrotated image, an empty image fails, a missing file throws, or the decoder asks for the camera permission                      |
| FR9      | Unit tests of `preventCapture` and `usePreventCapture` through the module seam; JVM tests of the count rules; emulator screenshots | two holds and one release; a reload during a hold; an app-set flag; iOS                         | One release uncovers another caller's content, a reload leaves the flag on, the app's own flag is cleared, or `supports` answers true on iOS     |
| FR10     | Emulator checks of the first frame, modal windows, and recents                                                                     | a hold before content renders; a modal open before and during a hold; no resumed activity       | A frame of held content appears without the flag, a modal stays capturable during a hold, or a modal keeps the flag after the last release       |
| FR11     | Astryx Stage runs of a previewed project; device checks with a previewed project                                                   | a project's recorder calls; a project's decode of its own and the app's files; a project's hold | A project records, reads the app's files, or reads or changes the app's hold count                                                               |
| FR12     | Unit tests through the doubles in their absent, not-linked, older, and current shapes                                              | each capability not opted in; the module absent; an unknown native reason                       | A call throws, a reason falls outside the set, or `isAvailable()` answers true without the module                                                |
| FR13     | Contract baseline check; Astryx Stage contract suites; Stage version floor check                                                   | a binary without a named feature; an older Stage                                                | The JavaScript uses a feature the binary does not list, or an older Stage runs the project                                                       |
| FR14     | The platform's public-API check over the native sources                                                                            | each native source of the group                                                                 | A non-public API is used other than the named exception                                                                                          |

## Decision log

### DEC-1 — A recording ends when the app leaves the foreground

**Reference:** `spec:AST-136/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

Revision 1 asks for no background audio mode and no microphone foreground
service. Leaving the app finishes the file and keeps it, so the input is never
open out of sight and the person loses nothing they recorded. Background
recording is a later named feature that the host declares.

Rejected: pausing on background and resuming on return, because the system
may end the app in between and the recording would be lost.

### DEC-2 — The decoder reads files and asks for nothing

**Reference:** `spec:AST-136/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

`AstryxBarcode` decodes an image file the app already has and opens no
camera, so a picked photo is read with no permission prompt. It stays in the
`camera` capability and is camera-class in the Preview policy, because a
code read from a photo is the same data the camera's live detection yields.

### DEC-3 — Screen-capture control is core

**Reference:** `spec:AST-136/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

`AstryxScreenCapture` declares no permission, framework, or manifest entry,
and the opt-in `web` capability's `preventsCapture` shares its count, so the
module is part of every app. An app that never holds pays for one small
module and nothing the person can see.

Rejected: a `screenCapture` opt-in capability, because the web view's holds
would then depend on a second capability for one counted flag.

## Open questions

- **OQ1 — Does `AstryxPermissions` (`spec:AST-130/FR9`) carry the
  `microphone` permission, with a `useMicrophonePermission` hook, as
  `spec:AST-112/FR7` asks for every permission, so the recorder's
  `getPermission` and `requestPermission` read the same store?**
  (`human-api`)
- **OQ2 — How does iOS answer screen capture?** (`human-design`) A hold on iOS
  blocks nothing and says so only through `supports` (FR9). The options:
  - Keep the hold as a no-op that `supports` reports. Callers stay simple; it
    sits against `spec:AST-112/FR7`'s rule on silent no-ops.
  - Report capture on iOS: the screen's captured state and the
    screenshot-taken notification, so the app can hide content itself. This
    needs an iOS module and changes `supports`.
  - Draw a cover over the app-switcher snapshot when the app resigns active.
    It protects the snapshot only, never a screenshot or a recording.
- **OQ3 — Does still-image decoding stay native?** (`human-design`) A native
  decoder is fast and reads a picker's grant with no pixel access in
  JavaScript, at the cost of a native module per platform. A pure-JavaScript
  decoder would need no native code but needs a native way to read an
  image's pixels, which the platform does not offer, and is slower on large
  photos.
