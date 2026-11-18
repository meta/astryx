---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-132
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

# React Native platform: Media and camera system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app plays sound and video and uses the phone's camera. A person listens to a
recording or a podcast with the lock screen's controls, watches a clip inline,
in full screen, or in a floating picture-in-picture window, sees a waveform of
a voice note, and points the camera at a QR code or takes a photo. The
developer gets one player model for sound and video on the platform's own
players, one video view that draws a player without owning it, and one camera
view that never asks for permission by itself and keeps working where there is
no camera.

This record details the `media` and `camera` capabilities of `spec:AST-112`:
the platform layer and its opt-in capabilities (`spec:AST-112/FR1`,
`spec:AST-112/FR3`), the result vocabulary (`spec:AST-140/FR3`), the
capability shape (`spec:AST-112/FR7`), and additive evolution
(`spec:AST-140/FR5`). It specifies the
audio module (`AstryxAudio`), the video view (`AstryxVideoView`), and the
camera view (`AstryxCameraView`), and how the library's `VideoView`,
`useVideoPlayer`, and `useAudioPlayer` use them. The capabilities' other
modules and views belong to the platform package and are specified in their own
records.

## Why this exists

| Piece              | Why Astryx owns it                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxAudio`      | expo-audio, expo-video and react-native-video play sound and video well. Astryx owns one player model for sound and video (DEC-1), one Now Playing card that follows the player that started last (FR5), peak levels with no limit of their own (DEC-3), closed results, and no third-party native dependency; apps may use third-party libraries beside these components without conflict. |
| `AstryxVideoView`  | expo-video and react-native-video draw video with picture in picture and native controls. Astryx owns a view that draws a player it does not own, so full screen keeps the same player and the app's media controls drive sound and video alike (DEC-1), with picture in picture that shows only the video on Android, and one dependency set (`spec:AST-112/FR2`).                         |
| `AstryxCameraView` | react-native-vision-camera and expo-camera are capable camera libraries. The gap is narrow: a view that never prompts and a simulated camera where there is none (DEC-4), closed results, and no third-party native dependency. No library component uses it; the `camera` create template's screens do, so it ships in the core package (DEC-5).                                           |

## Who uses it

| Native piece       | Kind                                       | Astryx components that use it                                                                                                                        | What a person sees                                                                                                                  |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxAudio`      | native module (Turbo Native Module)        | The library's `useAudioPlayer` and `useVideoPlayer` hooks (the controllers an app wires to its own media controls); apps through the `./media` entry | Sound that keeps playing on the lock screen, the system's Now Playing card and remote controls, and a waveform of a recording       |
| `AstryxVideoView`  | native component (Fabric Native Component) | `VideoView` (inline and in full screen, for a `useVideoPlayer` controller); apps through the `./media` entry's `NativeVideoView`                     | A video inside the screen, the same video in full screen, and a floating picture-in-picture window                                  |
| `AstryxCameraView` | native component (Fabric Native Component) | No library component; the `camera` create template's screens, and apps through the `./camera` entry's `CameraView` (DEC-5)                           | A live camera preview, a photo taken, a QR code or barcode found in view; a moving placeholder scene where the device has no camera |

Scope notes: these pieces are specified elsewhere, in their own records,
which also place them.

- `AstryxBarcode` (`camera`) reads machine-readable codes from a still image
  the app already has. It is camera-class for permission and policy.
- `AstryxAudioRecorder` records sound for the `microphone` capability.
- `AstryxPhotoLibrary` and `AstryxPhotoThumbnailView` read the device's photo
  library.
- `AstryxPdfView` and `AstryxPdfModule` show and render PDF documents.
- `AstryxImageMarkup` marks up an image, and `AstryxScreenCapture` reports or
  prevents screen capture.

## Non-goals

- Astryx Stage and the Astryx app's Preview are specified in `spec:AST-139`;
  they conform to this record's contracts.
- The contract of the library's `VideoView` beyond how it uses the platform
  (FR12); its own record and `spec:AST-082/FR3` own it. The media controls an
  app draws, such as the template kit's `MediaScrubber` and
  `PlaybackRateMenu` (`spec:AST-138/FR7`), are the app's own.
- Streaming formats beyond what the platform's players open from a URL, DRM,
  captions and subtitle tracks, advertising, playlists, and offline downloads.
- Video recording, live photos, depth, RAW, HDR control, frame processors, and
  per-frame image access from the camera.
- Still-image code decoding, recording sound, the photo library, PDF
  documents, image markup, and screen capture: each is specified in its own
  record (scope notes above).
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — `media` and `camera` are opt-in capabilities.** An app opts each in
  (`spec:AST-112/FR3`). This record lists each capability's contents.
  - `media` links the system's media players on iOS (AVFoundation, AVKit, and
    the Now Playing and remote-command frameworks) and Media3 on Android
    (player, media session, and player view), and declares the media
    playback service and the picture-in-picture activity on Android. The
    `./media` entry exports `AstryxAudio`, `NativeVideoView`, and
    `isNativeVideoViewAvailable()`.
  - `camera` links capture on iOS (AVFoundation) and CameraX with a
    pure-Java code decoder on Android, and declares the camera permission and
    the optional camera hardware feature. It holds the camera view, still-image
    code decoding (`AstryxBarcode`, `spec:AST-136`), and camera capture:
    `CameraView`'s `takePhoto` (FR9) is the capture, and the core file
    picker has no camera source (`spec:AST-130/FR13`). The `./camera` entry
    exports `CameraView`, `isCameraViewAvailable()`, `CODE_TYPES`,
    `createCodeDetector`, and `AstryxBarcode`.
  - The library reaches each capability only through
    `AstryxPlatform.capability('media' | 'camera')` (`spec:AST-112/FR2`).
- **FR2 — The native contract.**

  | Contract      | Kind                                | Methods                                                                                                                                                            | Events                | Platforms    |
  | ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ------------ |
  | `AstryxAudio` | native module (Turbo Native Module) | `isBackgroundAvailable`, `open`, `play`, `pause`, `seek`, `setRate`, `setVolume`, `setMuted`, `setLooping`, `close`, `levels`, `cancelLevels`, `appendLevelsBytes` | `onState`, `onLevels` | iOS, Android |

  | Contract           | Kind                                       | Props                                                                                                 | Commands                                        | Events                                       | Platforms    |
  | ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- | ------------ |
  | `AstryxVideoView`  | native component (Fabric Native Component) | `playerId`, `resizeMode`, `controls`, `allowsPictureInPicture`, `startsPictureInPictureAutomatically` | `startPictureInPicture`, `stopPictureInPicture` | `onPictureInPictureChange`, `onVideoSize`    | iOS, Android |
  | `AstryxCameraView` | native component (Fabric Native Component) | `facing`, `zoom`, `flash`, `torch`, `isActive`, `codeTypes`, `scanRegion`                             | `takePhoto`, `focus`                            | `onCameraState`, `onCodesScanned`, `onPhoto` | iOS, Android |
  - Every module method is optional and takes one request object. A method
    that answers resolves a result object and never rejects.
  - Player calls name a `playerId` the JavaScript picks; a level read names a
    `requestId` the JavaScript picks.

- **FR3 — `AstryxAudio` opens players.**
  - `open(source, options)` answers at once with `{ok: true, player}` or a
    failure. `source` is `{uri, title?, artist?, album?, artworkUri?}`: a
    `file://` path, an http or https URL, or a bundled asset. The options are `allowsBackground`,
    `showsNowPlaying`, `rate`, `skipIntervalSeconds` (default 15), `hasVideo`
    (a player `AstryxVideoView` draws), `volume`, `isMuted`, and
    `isLooping`.
  - A player has `id`, `state` (the last state delivered), and
    `subscribe(listener)`, which calls the listener on each change and returns
    the function that stops it. It has `play()`, `pause()`, `seekTo(seconds)`,
    `setRate(rate)`, and `release()`, which frees the native player; later
    calls do nothing. `setVolume({volume})`, `setMuted({isMuted})`, and
    `setLooping({isLooping})` answer an `AstryxResult` at once, and the new
    value arrives in `state`.
  - `state` carries `status` (`idle`, `loading`, `ready`, `playing`,
    `paused`, `ended`, or `error`), `position`, `duration`, and `buffered` in
    seconds, `rate`, `volume`, `isMuted`, `isLooping`, the `reason` a player
    paused by itself (`interruption`, `route`, `remote`, or `background`), and
    for `error` the platform's message. The native side sends a state on every
    change and about four times a second while it plays.
  - The volume is held inside 0 to 1, and the device's volume applies on top
    of it. A muted player plays silently and keeps its volume for unmuting. A
    looping player plays the item again from the start and never reports
    `ended`. A rate change keeps voices at their pitch.
  - `isBackgroundAvailable()` answers whether the host declares what
    background playback needs (FR5).
- **FR5 — Playback follows the system.**
  - On iOS the player plays with the silent switch on, and the audio session
    becomes active on the first play. It is deactivated only when no player
    is open. On Android the player takes audio focus.
  - A call or another app's audio pauses the player with reason
    `interruption`. It resumes when the system says it should (iOS) or when a
    transient focus loss ends (Android).
  - Headphones or a Bluetooth route that goes away pause the player with
    reason `route`, and it does not resume by itself.
  - With `allowsBackground` and the host's declaration (iOS's background audio
    mode; Android's media playback service and its foreground-service
    permissions), the player keeps playing when the app leaves or the screen
    locks. Without them it pauses with reason `background`. On Android
    without the declaration, a player that shows on the Now Playing card plays
    inline only, and the media service never starts.
  - With `showsNowPlaying`, the player that started last owns
    the system's Now Playing card or media notification (title, artist,
    album, artwork, duration, position, rate) and its remote commands: play,
    pause, toggle, skip by `skipIntervalSeconds`, scrubbing, and rate; next
    and previous track are off. When it closes, the card moves to the
    Now-Playing player that started last among those still open, or clears.
- **FR6 — Peak levels for a waveform.**
  `levels(source, {perSamples, onProgress, signal})` reads a local source: a
  `file://` path, an Android `content://` grant, a bundled asset, or
  in-memory bytes (`{bytes, contentType?}`).
  - The native side decodes the source to linear PCM off the main thread and
    answers one peak (0 to 1) per `perSamples` frames (default 1024), each
    frame read at its loudest channel, with the source's `sampleRate`. With
    `onProgress`, the levels also arrive in order as they are read, with the
    fraction of the source read so far; the result still carries every
    level. Aborting `signal` stops the read and
    answers `cancelled`.
  - Bytes cross in slices (`appendLevelsBytes`) and are held in memory only,
    never written to a file. They are freed when the read ends, when it is
    cancelled, and when the module goes away.
  - The read decodes as a stream and keeps only the levels, so it refuses no
    source for its size; the caller bounds the time with `signal`.
  - A remote URL refuses `bad-source` before anything is read. The reasons are
    `bad-source`, `no-audio`, `decode`, `invalid-option`, and the common
    reasons.
- **FR7 — `NativeVideoView` draws a player and plays nothing itself.**
  - Its props are `playerId` (an `AstryxAudio` player opened with
    `hasVideo`; `''` draws nothing), `resizeMode` (`contain`, the default,
    letterboxes; `cover` fills and crops), `controls` (`none`, the default,
    the bare picture; `system`, the platform's own playback controls over it),
    `allowsPictureInPicture` (default true), and
    `startsPictureInPictureAutomatically` (default false).
  - `volume`, `isMuted`, and `isLooping` are the player's, not the view's: a
    set prop is applied to the player through `AstryxAudio` when it changes
    or the view takes another player, and an unset prop leaves the player
    alone. Nothing about them crosses to the native view.
  - Events: `onVideoSize({width, height})` once the picture's natural size is
    known, and `onPictureInPictureChange({isSupported, isActive,
isPossible})`.
  - `ref` is a handle with `startPictureInPicture()` and
    `stopPictureInPicture()`; `fallback`, `style`, and `testID` as every view
    (FR13).
  - A second view of the same player shows it without restarting it; the view
    that registered last owns the handle.
- **FR8 — Picture in picture.**
  - iOS uses the system's picture-in-picture window over the view's player.
    With `startsPictureInPictureAutomatically`, it starts by itself when the
    app leaves while the player plays.
  - Android starts a picture-in-picture activity of the platform's own that
    takes the player, enters picture in picture at the video's ratio with the
    view as its source rectangle, and hands the player back when the window
    closes or expands. The app's own activity is left alone, so the window
    shows only the video.
  - While picture in picture shows a player, leaving the app does not pause
    it.
  - `isSupported` is false where the device or the host does not offer it
    (the iPhone Simulator, a host without the declaration). The library then
    hides its picture-in-picture control.
  - `AstryxPlatformInfo.supports('media.autoPictureInPicture')` and
    `supports('media.stopPictureInPicture')` (`spec:AST-130/FR8`) answer for
    this binary: both are
    true on iOS and false on Android, where `startsPictureInPictureAutomatically`
    is ignored and the person closes or expands the window.
- **FR9 — `CameraView` shows the camera and never asks for permission.**
  - Its props are `facing` (`back`, the default, or `front`), `zoom` (the
    display zoom: 1 is the main lens, 0.5 the ultra-wide where the device has
    one, clamped to the device's range), `flash` (`auto`, `on`, or `off`, for
    the next photo), `isTorchOn`, `isActive` (false pauses the camera),
    `codeTypes`, `scanRegion`, `simulation`, and `label`. It draws `children`
    over the preview.
  - Events: `onReady(capabilities)` with `minZoom`, `maxZoom`, `hasFlash`,
    `hasTorch`, and `hasUltraWide`; `onStatusChange({status})` with
    `starting`, `ready`, `simulated`, `permission-required`, `denied`, or
    `error`; `onError(failure)`; and `onCodesScanned({codes})` (FR10).
  - `ref` is a handle with `takePhoto(options?)` and `focus({x, y})`, which
    focuses and exposes at a point in the view's coordinates and returns to
    continuous focus when the subject changes. `takePhoto` resolves
    `{ok: true, photo}` (`uri`, a JPEG in the app's temporary or cache folder;
    `width` and `height` in pixels with the orientation applied; `facing`;
    `takenAt`; `isSimulated`) or a failure with `not-ready`, `timeout`
    (`timeoutMs`), `unmounted`, or `capture-failed`.
  - The view reads `AstryxPermissions.get('camera')` (`spec:AST-130/FR9`) and
    mounts the native
    camera only when it is `granted`. `undetermined` reports
    `permission-required`; `denied` and `blocked` report `denied`. The view
    then draws the simulated scene dimmed under the app's explanation, follows
    the app's `request`, and reads the permission again when the app returns
    to the foreground.
  - Camera configuration, capture, and JPEG encoding run off the UI thread;
    the preview draws on the platform's own layer.
- **FR10 — Live codes from the camera.**
  - `codeTypes` turns detection on for any of `qr`, `ean13`, `ean8`, `upce`,
    `code128`, `code39`, `code93`, `itf14`, `codabar`, `pdf417`, `aztec`, and
    `datamatrix`; empty or absent turns it off. Detection runs on the same
    camera session as the preview.
  - `scanRegion` is a rectangle in the view's coordinates; a zero width or
    height is the whole view.
  - `onCodesScanned({codes})` sends the codes in view at most every 100 ms,
    and once with an empty list 300 ms after the last code leaves. Each code
    has its `value`, its `type`, and its `corners` in the view's coordinates:
    four for a 2D code, and a box around a 1D code.
  - `createCodeDetector({repeatAfterMs})` turns the stream into one moment per
    code.
- **FR11 — The simulated camera.** Where the device has no camera
  (`hasHardware` false: the iOS Simulator, an emulator without one), where the
  view is absent (Jest, an app without `camera`), or with
  `simulation={{isEnabled: true}}`, `CameraView` draws a simulated
  viewfinder: the library's placeholder art as a moving scene scaled by the
  zoom, still under Reduce Motion. It reports a three-lens back camera
  (0.5× to 10×, flash, torch). `takePhoto` resolves a placeholder photo
  (`uri: null`, `isSimulated: true`, the scene's `seed`). The simulated camera
  finds `simulation.codes` in the scan region after a short delay, so a
  scanner flow runs without a camera.
- **FR12 — The library's components use the platform.**
  - `useAudioPlayer(source, options)` opens `source` on `AstryxAudio`,
    follows its state, and frees the player when the source changes or the
    component unmounts. It returns stable callbacks (`play`, `pause`,
    `seekTo`, `setRate`, `setVolume`, `setMuted`, `toggleMuted`,
    `setLooping`) that an app wires to its own media controls, and it applies
    a changed option live.
  - `useVideoPlayer(source, options)` is the same controller with
    `hasVideo`, with `allowsBackground` and `showsNowPlaying` false unless
    the caller sets them. It adds full screen (`isFullscreen`,
    `enterFullscreen`, `exitFullscreen`), picture in picture
    (`pictureInPicture`, `enterPictureInPicture`, `exitPictureInPicture`),
    and `naturalAspectRatio`. It opens a player only where the video view
    exists.
  - `VideoView` draws `NativeVideoView` for a `useVideoPlayer` controller's
    player. Its full screen draws a second `NativeVideoView` of the same
    player, so playback does not restart. While picture in picture shows the
    player, the content `VideoView` draws over the picture is hidden. The rest
    of `VideoView`'s presentation belongs to its own component record.
- **FR13 — Results and fallbacks.**
  - No call throws. `open` and the player's controls answer at once; `levels`
    and `takePhoto` resolve and never reject (`spec:AST-140/FR3`). `open`
    fails with `busy` or `bad-source` or a common reason; a reason the
    JavaScript does not know reads `error`. `message` never carries a URL's
    query.
  - Not opted in: the capability's JavaScript still loads,
    `AstryxAudio.isAvailable()`, `isNativeVideoViewAvailable()`, and
    `isCameraViewAvailable()` answer false, and calls answer `not-linked`
    (`spec:AST-112/FR3`). Without the native side (Jest, the web) they answer
    `no-module`.
  - `NativeVideoView` where the view is absent draws `fallback` (nothing by
    default) and reports `onError` with `no-native-view` once.
  - `useAudioPlayer` and `useVideoPlayer` without the platform (not opted
    in, Jest, the web, or the platform switched off through the capabilities
    provider) report `status: 'unavailable'`, and their calls do nothing.
    `VideoView` then draws the poster alone, and the controls wired to the
    controller draw disabled.
  - `CameraView` with `camera` not opted in draws the simulated camera and
    reports `onError` with `not-linked` once per mount, naming the opt-in.
- **FR14 — Accessibility.**
  - `NativeVideoView`'s bare picture is hidden from assistive technology; the
    element that names the video is the caller's (`VideoView`'s own record
    owns its name and role). With `controls: 'system'` the system's controls
    are read as the system reads them.
  - The controls an app draws over the picture are its own and are announced
    as the components they are built from. The Now Playing card, the remote
    commands, and the picture-in-picture window are the system's own.
  - `CameraView` is one element named by its `label`, and it announces its
    status changes (`ready`, `permission-required`, `denied`, `error`). Codes
    found and photos taken reach the person through the app's own UI.
- **FR15 — Contract baseline.** Every contract in the group is at revision 1
  and grows by named features (`spec:AST-140/FR5`). The group has no named
  features; the picture-in-picture differences between platforms are feature
  rows of `AstryxPlatformInfo` (FR8).

### Platform support

| Contract           | iOS                                                                                                                                                                                                                                                            | Android                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxAudio`      | `AVPlayer` per player with the time-domain pitch algorithm; `AVAudioSession` playback category; `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter`; background playback with the app's `audio` background mode; levels through an asset reader to float PCM. | Media3 `ExoPlayer` per player on the main thread with its audio focus; a `MediaSessionService` (foreground service of type `mediaPlayback`) and its media notification; levels through `MediaExtractor` and `MediaCodec`. |
| `AstryxVideoView`  | `AVPlayerLayer` over the module's player; `AVPictureInPictureController`; `AVPlayerViewController` for `controls: 'system'`.                                                                                                                                   | Media3 `PlayerView` over the module's player, with its controller for `controls: 'system'`; picture in picture in the platform's own activity; no automatic start and no programmatic stop.                               |
| `AstryxCameraView` | `AVCaptureSession` with a preview layer, a photo output, and a metadata output for codes on the same session; the region of interest from `scanRegion`; orientation from the rotation coordinator.                                                             | CameraX: a `PreviewView`, an `ImageCapture`, and an `ImageAnalysis` decoded with ZXing (no native library and no Google Play services); the region mapped into the analysis buffer.                                       |

- FR10 gap: Android reports at most one code per frame.
- FR9 and FR14 gap: `CameraView` takes no `label`, and its preview has no
  accessible name or status announcement.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only).
  Automatic picture in picture needs iOS 14.2 or later.
- Unsupported behavior: a call the binary lacks answers `unsupported`
  (FR13); a view the binary lacks reports itself unavailable and the
  library draws its fallback (FR13).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- None beyond `spec:AST-112` and `spec:AST-140`. This record details
  `spec:AST-112`'s FR3 (`media` and `camera` stay opt-in) and FR7 (the probes
  and a camera view that never prompts), and `spec:AST-140`'s FR3 (the
  group's closed reasons) and FR5 (the group's revision-1 baseline).
- `spec:AST-130` FR8 (`AstryxPlatformInfo`), FR9 (`AstryxPermissions`), and
  FR13 (camera capture belongs to `camera`) apply unchanged.
- `spec:AST-093/FR5` (every native component is tested and validated the same
  way) applies to `VideoView` unchanged.

## Verification

| Contract | Verification                                                                                                                         | Representative states                                                                                    | Mutation or failure expectation                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Built apps with the core only and with each capability opted in; unit tests of the loader                                            | `media` and `camera` opted out; opted in                                                                 | An opted-out app links a media framework, declares the camera permission or the media service, or the library imports a capability outside its loader |
| FR2      | The platform's spec rules check; `contracts.json` against the codegen specs                                                          | each module method; each view prop, command, and event                                                   | A listed member is missing, a shipped member changes, or a method rejects                                                                             |
| FR3      | The media contract suite over the `./testing` double (`mockMediaCapability`) and on devices                                          | open, play, pause, seek, rate, volume, mute, loop, release; a released player                            | A state is missing a field, a muted player loses its volume, a looping player reports `ended`, or a released player still delivers                    |
| FR5      | Device checks of interruptions, routes, the lock screen, and the Now Playing card; JVM tests of the background and Now Playing rules | a call; headphones out; background with and without the declaration; two Now-Playing players, one closed | The player keeps playing through an interruption, resumes after a route loss, starts a service without the declaration, or loses the card wrongly     |
| FR6      | Unit tests through `scriptAudioLevels`; Simulator and emulator reads                                                                 | a file; bytes in slices; `onProgress`; a cancel; a remote URL; a long file                               | A level falls outside 0 to 1, a chunk arrives out of order, bytes reach a file, a remote URL is read, or a read is refused for its size               |
| FR7      | Library and platform tests through the doubles; Simulator and emulator checks with two views of one player                           | inline then full screen; `contain` and `cover`; `system` controls; `volume` set and unset                | The second view restarts the player, an unset prop changes the player, or the size event is missing                                                   |
| FR8      | Device and emulator checks of picture in picture; Simulator check of `isSupported`                                                   | start and stop; automatic start on iOS; leaving the app while it shows                                   | Android shows the whole app, the player pauses on leaving, or a one-platform feature answers true on the other                                        |
| FR9      | Unit tests of `CameraView` through `mockCameraCapability`; device and emulator checks                                                | each permission state; facing, zoom, flash, torch; `takePhoto` with and without a ready camera           | The view prompts, mounts the camera without `granted`, or `takePhoto` rejects                                                                         |
| FR10     | Unit tests of the code mapping and the detector; an emulator's virtual camera scene with a code; device checks                       | a code inside and outside the region; a code that leaves                                                 | A code outside the region is reported, events come faster than every 100 ms, or no empty list follows the last code                                   |
| FR11     | Unit tests of the simulated camera; Simulator renders                                                                                | no camera; `simulation.isEnabled`; Reduce Motion; simulated codes                                        | A device without a camera prompts, the scene moves under Reduce Motion, or a simulated photo carries a `uri`                                          |
| FR12     | Library tests of `useAudioPlayer`, `useVideoPlayer`, and `VideoView`                                                                 | a source change; unmount; full screen; picture in picture; a changed option                              | A player leaks after unmount, a callback is not stable, or full screen opens a second player                                                          |
| FR13     | Unit tests through the doubles in their absent, not-linked, older, and current shapes                                                | each capability not opted in; the view absent; an unknown native reason                                  | A call throws, a reason falls outside the set, `no-native-view` is reported more than once, or a hook does not report `unavailable`                   |
| FR14     | VoiceOver and TalkBack checks on the Simulator, emulator, and device                                                                 | `NativeVideoView` bare and with system controls; the camera's status changes                             | The bare picture is read, the system controls are covered, or a camera status change is not announced                                                 |
| FR15     | Contract baseline check                                                                                                              | a contract that reports a revision other than 1                                                          | A contract reports another revision                                                                                                                   |

## Decision log

### DEC-1 — One player model for sound and video

**Reference:** `spec:AST-132/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A video is an `AstryxAudio` player opened with `hasVideo`, and
`AstryxVideoView` draws it by id. The same controller drives an app's media
controls for sound and video, and a second view shows the player without
restarting it.

Rejected: a player owned by its view, because full screen and picture in
picture would then restart playback or move the view.

### DEC-3 — Levels hold no limit of their own

**Reference:** `spec:AST-132/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A level read decodes as a stream and keeps only the levels, and bytes arrive
in slices, so no source is refused for its size. The caller bounds the time
with an abort signal.

Rejected: a size cap, because it refuses a long recording the device can read.

### DEC-4 — The camera view never prompts and keeps working without a camera

**Reference:** `spec:AST-132/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

`CameraView` mounts the camera only with `granted` and leaves the request to
the app. Where there is no camera, or the capability is not opted in, it draws
the simulated camera, so a capture or scanner flow runs in tests and on the
Simulator.

Rejected: a view that asks for permission when it mounts, because the app
then cannot explain the request first.

### DEC-5 — The camera view ships in the core package

**Reference:** `spec:AST-132/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

The core package ships the native code that Astryx's components and create
templates use. `AstryxCameraView` stays in the core package's `camera`
capability, because the `camera` create template's screens use it, and
`AstryxAudio` and `AstryxVideoView` stay in its `media` capability for
`VideoView`, `useAudioPlayer`, and `useVideoPlayer`.

## Open questions

- **OQ1 — Does the library offer a camera component of its own over
  `CameraView`, with a label and the theme's appearance?** (`human-design`)
- **OQ2 — Does Android report several codes per frame, as iOS does?**
  (`human-design`)
- **OQ3 — Does Android offer automatic picture in picture, which needs the
  app's own activity in picture-in-picture mode?** (`human-design`)
- **OQ4 — Does `useAudioPlayer` expose `levels` as a hook for a waveform, or
  does the waveform stay app API on `AstryxAudio`?** (`human-api`)
