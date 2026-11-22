---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-135
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

# React Native: Photos system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app lets a person pick from their photos inside the app. In `FileInput`'s
photo picker a person scrolls the photos they allowed the app to see in a
grid, changes which photos a limited app sees, and sends a few of them as
files. The developer gets the system's own photo library behind one result
vocabulary: listing, counting, and exporting, with access the app asks for
explicitly. The picker's thumbnails draw with the access the app already
has.

This record details the photo library pieces of `spec:AST-112`: the photo
library module (`AstryxPhotoLibrary`) and the photo thumbnail view
(`AstryxPhotoThumbnailView`). They are the core package's opt-in `photos`
capability, because `FileInput`'s photo picker uses them. In an app without
the opt-in, `FileInput`'s photo source is the system photo picker, which works
without a permission (`spec:AST-130/FR12`). The thumbnail view is internal
implementation behind `FileInput`'s photo picker (`spec:AST-112/FR5`). They
follow the platform layer and its
opt-in capabilities (`spec:AST-112/FR1`, `spec:AST-112/FR3`), the result vocabulary (`spec:AST-140/FR3`), the
capability shape (`spec:AST-112/FR7`), and additive evolution
(`spec:AST-140/FR5`).

## Why this exists

`FileInput`'s photo picker uses `AstryxPhotoLibrary` and
`AstryxPhotoThumbnailView`, so they ship in the core package as its opt-in
`photos` capability (DEC-1). These pieces take no third-party native
dependency; apps may use third-party
libraries beside these components without conflict.

- `AstryxPhotoLibrary`: `FileInput`'s photo picker needs a native module to
  list, count, and export the library, and apps reach the same calls. Choosing a few photos
  in the system's photo picker goes through the core file picker, which
  presents it without a permission (`spec:AST-130/FR12`).
- `AstryxPhotoThumbnailView`: iOS draws a library asset through native code.
  On Android, React Native's `Image` draws an asset's content URI directly,
  so one view serves both platforms with the library module's ids.

## Who uses it

| Native piece               | Kind                                       | Astryx components that use it                                                                    | What a person sees                                                                                                                                    |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxPhotoLibrary`       | native module (Turbo Native Module)        | `FileInput` (its photo picker); apps through the `./photos` entry's `AstryxPhotoLibrary` (DEC-1) | A grid of the photos and videos they allowed in `FileInput`'s photo picker, a system prompt only when the app asks, and a way to change the selection |
| `AstryxPhotoThumbnailView` | native component (Fabric Native Component) | `FileInput`'s photo picker, its public face (the picker's thumbnails)                            | Thumbnails that fill in quickly as they scroll a grid, iCloud photos included                                                                         |

Scope notes: these pieces are specified elsewhere.

- The system photo and document pickers are the core file picker's
  (`spec:AST-130/FR12`); permissions other than photo access are
  `AstryxPermissions`' (`spec:AST-130/FR9`).
- Audio and video playback and the camera view belong to the `media` and
  `camera` capabilities (`spec:AST-132`).
- The file cache that exports write into belongs to `spec:AST-130/FR14`.

## Non-goals

- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — `photos` is an opt-in capability of the core package.**
  `AstryxPhotoLibrary` and `AstryxPhotoThumbnailView` are the core package's
  `photos` capability, which an app opts in (`spec:AST-112/FR3`). In an app
  without it, `FileInput`'s photo source is the system photo picker, which
  works without a permission (`spec:AST-130/FR12`).
  - `photos` links PhotoKit on iOS (Photos, PhotosUI, ImageIO, AVFoundation)
    and the MediaStore readers on Android. When the app opts it in, the
    generated native project carries
    the photo library purpose string on iOS (`NSPhotoLibraryUsageDescription`,
    overridable) and, on Android, `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO`
    (13 and later), `READ_MEDIA_VISUAL_USER_SELECTED` (14 and later, for
    limited access), and `READ_EXTERNAL_STORAGE` up to API level 32
    (`spec:AST-112/FR4`).
  - The `./photos` entry exports `AstryxPhotoLibrary`. The thumbnail view
    stays internal behind `FileInput`'s photo picker (`spec:AST-112/FR5`).
    The library reaches the capability only through `AstryxPlatform.capability('photos')` (`spec:AST-112/FR2`).
- **FR2 — The native contract.**

  | Contract             | Kind                                | Methods                                                                                                           | Events                                | Platforms    |
  | -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ |
  | `AstryxPhotoLibrary` | native module (Turbo Native Module) | `getAccess`, `requestAccess`, `presentLimitedPicker`, `listAssets`, `countAssets`, `exportAssets`, `cancelExport` | `onLibraryChange`, `onExportProgress` | iOS, Android |

  | Contract                   | Kind                                       | Props                   | Commands | Events                                | Platforms    |
  | -------------------------- | ------------------------------------------ | ----------------------- | -------- | ------------------------------------- | ------------ |
  | `AstryxPhotoThumbnailView` | native component (Fabric Native Component) | `assetId`, `resizeMode` | none     | `onThumbnailLoad`, `onThumbnailError` | iOS, Android |
  - Every module method is optional and takes at most one request object. A
    method resolves a result object, failures included.
  - An export names a `requestId` the JavaScript picks.

- **FR3 — Photo access is read and asked for explicitly.**
  - `getAccess()` answers `{access, canAsk}` silently. `access` is
    `full`; `limited` (the person chose which photos the app sees: iOS 14 and
    later, Android 14 and later); `denied`; `restricted` (iOS: a device policy
    stops the person from granting it); or `undetermined` (not yet asked).
    `canAsk` says whether `requestAccess()` would show the system prompt now;
    false means only Settings can change it.
  - `requestAccess()` shows the system prompt only when `canAsk` is true
    (iOS: `undetermined`; Android: not yet asked, or refused once while the
    system still shows the prompt), then answers as `getAccess()`. Otherwise
    it answers the current access at once. The app opens Settings itself when
    it wants to.
  - `canPresentLimitedPicker()` is synchronous and says whether the device
    offers the selection picker (iOS 15 and later, Android 14 and later).
    `presentLimitedPicker()` presents it over the app when access is
    `limited` and resolves the access when it closes; a change event follows
    any change. It answers `invalid-option` when access is other than
    `limited`, and `unsupported` on a device without the picker.
  - System UI comes from `requestAccess()` and `presentLimitedPicker()`
    alone. Listing, counting, exporting, and drawing a thumbnail work
    silently; without access they answer `denied` (`spec:AST-112/FR7`).
- **FR4 — The library is read newest first, a page at a time.**
  - `listAssets({cursor, pageSize, mediaTypes})` answers `{assets,
nextCursor}`: the photos and videos the app can see (only the selection
    under `limited`), newest first by creation date (Android: date taken,
    else date added). `pageSize` is a whole number from 1, default 60;
    `mediaTypes` is `image`, `video`, or both (the default). Every page size
    and every library size is read.
  - Each asset has an opaque `id` (the same id the thumbnail view and export
    take), `mediaType`, the stored pixel `width` and `height` (0 when
    unknown), `creationDate` (milliseconds since 1970, `null` when unknown),
    and `duration` in seconds (0 for an image).
  - `cursor` is absent or `null` for the newest page, else a `nextCursor`
    this module answered; `nextCursor` is `null` after the last page. On
    Android a cursor names the last row's sort key, so an asset added or
    removed between pages shifts nothing. On iOS a cursor is a position in the
    list as it was, so after a library change it answers `stale-cursor`, and
    the caller starts again from the newest.
  - `countAssets({mediaTypes})` (feature `countAssets`) answers `{count}`, a
    number: how many assets `listAssets` with the same `mediaTypes` answers
    across all its pages, from the same fetch. Under `limited` access it
    counts only the photos and videos the app can see. In a binary without
    the feature it answers `unsupported`, and the app shows an open-ended
    total such as "N of M+". - `addChangeListener(listener)` reports `{reason}`: `library` when the
    visible assets change (added, removed, edited, or a new limited
    selection) and `access` when the access changes in Settings, at most
    about once a second. It starts after the runtime's first `getAccess`,
    `requestAccess`, or `listAssets`. It returns `{remove()}`.
- **FR5 — Assets are exported to files.**
  - `exportAssets(ids, {format, maxPixels, quality, allowsNetwork, signal,
onProgress})` writes each asset, in the order given, to a file in the
    app's file cache (`spec:AST-130/FR14`) and answers
    `{files, failures}`. Each file has `id`, a `file://` URI, its cache
    `name`, `mimeType`, `mediaType`, pixel `width` and `height`, `size` in
    bytes, and the asset's `creationDate` and `duration` as `listAssets`
    answers them.
  - `format: 'jpeg'` (the default) writes an image as an upright JPEG
    (orientation applied) with its longest side at most `maxPixels` (absent
    is full size) at `quality` (0 to 1, default 0.85). The JPEG carries the
    pixels alone, with location and other EXIF metadata stripped. It writes a video as an MP4 on both
    platforms, re-encoding a video stored in another container, and the video's file also has `poster`, the `file://` URI of a
    JPEG of its first frame in the same cache.
    `format: 'original'` writes the stored bytes, metadata included; a HEIC
    image stays HEIC. On Android 10 and later the system strips an
    `original`'s location, because the package declares the media read
    permissions without `ACCESS_MEDIA_LOCATION`.
  - With `allowsNetwork` (default true), iOS downloads an iCloud-only original
    first, and the progress counts the download. A download that makes no
    progress for ten minutes fails that asset `download-failed`. With
    `allowsNetwork: false`, an iCloud-only asset fails `download-failed` at
    once.
  - Each asset succeeds or fails on its own: `failures` lists each id not
    written with its reason, `missing` (no such asset, or not visible to the
    app), `download-failed`, `unreadable`, `no-space`, `io`, or `cancelled`.
  - `onProgress` receives `{id, index, count, fraction}` at most about ten
    times a second per asset. Aborting `signal` stops the export: queued
    assets stay unstarted, and the asset in flight stops and deletes what it
    wrote. The export then resolves `ok` with the files already written in
    `files`, and lists each id not written as `cancelled` in `failures`.
  - The files last until the system reclaims the cache location
    (`spec:AST-130/FR14`).
- **FR6 — The photo picker's thumbnail draws one asset natively.**
  `PhotoThumbnail` is the library's internal wrapper of
  `AstryxPhotoThumbnailView`; `FileInput`'s photo picker renders it.
  - Its props are `assetId` (an id `listAssets` answered; `''` draws
    nothing), `resizeMode` (`cover`, the default, fills and crops;
    `contain` fits the whole picture), `onLoad({width, height})` with the
    decoded picture's pixels, `onError(failure)`, `fallback`, `style`,
    `testID`, and `accessibilityLabel`.
  - The native view decodes the asset at its own laid-out size times the
    screen scale, off the main thread. A cell scrolled away and back shows
    its picture again without a second decode while the picture stays in
    memory. Pictures stay native.
  - A view that leaves the screen or takes another `assetId` cancels its
    request. On iOS the request may use the network, so an iCloud-only photo
    shows once its thumbnail arrives.
  - `onError` reports `missing`, `denied` (no photo access), or `unreadable`.
    The view draws with the access the app has (FR3).
- **FR7 — Results and fallbacks.**
  - Every call returns a value, and every asynchronous call resolves an
    `AstryxResult` (`spec:AST-140/FR3`); a reason the JavaScript does not know
    reads `error`.
  - Not opted in: the capability's JavaScript still loads, `isAvailable()`
    and the library's internal view probe answer false, and calls answer
    `not-linked` (`spec:AST-112/FR3`).
  - Without the native side (Jest, the web), `isAvailable()` and the view
    probe answer false and calls answer `no-module`.
    A binary without a method answers `unsupported`.
  - `PhotoThumbnail` where the view is absent draws `fallback` (nothing by
    default) and reports `onError` with `no-native-view` once per mount.
- **FR8 — Accessibility.**
  - `PhotoThumbnail` is one element with the image role, named by its
    `accessibilityLabel`. An unlabelled thumbnail is hidden from assistive
    technology, and the photo picker's grid cell names its photo.
  - The limited-selection picker and the access prompt are the system's own.
- **FR9 — Public platform API.** Every piece uses the platform's public SDK.
- **FR10 — Contracts grow by named features.** Every contract in the group
  grows by named features (`spec:AST-140/FR5`),
  `AstryxPhotoLibrary.<feature>` and `AstryxPhotoThumbnailView.<feature>`,
  which the binary reports through the platform info module; the JavaScript
  checks a feature before it uses it. The group's named feature is
  `AstryxPhotoLibrary.countAssets` (FR4). In a binary without a feature, the
  JavaScript keeps the baseline behaviour, draws its fallback, or answers
  `unsupported` (`spec:AST-112/DEC-14`).

### Platform support

| Contract                   | iOS                                                                                                                                                                                                                                                                            | Android                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxPhotoLibrary`       | PhotoKit fetches sorted by creation date, and the fetch's count for `countAssets`; `PHPhotoLibrary` authorization for read and write access, limited from iOS 14; `presentLimitedLibraryPicker` from iOS 15; a change observer; asset resources and image requests for export. | `MediaStore` queries with a keyset cursor, and the same query's row count for `countAssets`; the media read permissions, with `READ_MEDIA_VISUAL_USER_SELECTED` as limited access from Android 14; a content observer; the stored file for export. |
| `AstryxPhotoThumbnailView` | `PHCachingImageManager`, network allowed.                                                                                                                                                                                                                                      | `ContentResolver.loadThumbnail` from API level 29; the system's stored thumbnails below it.                                                                                                                                                        |

- FR8 gap: `PhotoThumbnail` lacks the image role, and an unlabelled thumbnail
  reaches assistive technology.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only). Limited
  photo access needs iOS 14 or Android 14, and the selection picker iOS 15 or
  Android 14.
- Unsupported behavior: a feature the binary or device lacks answers false
  from its probe, and a call that needs it answers `unsupported` (FR3, FR7);
  a view the binary lacks reports itself unavailable and draws its fallback
  (FR7).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- This record details `spec:AST-112`: its FR1 (`photos` among the core
  package's opt-in capabilities), FR3 (`photos` stays opt-in), FR4 (the host
  declarations written for `photos`), FR5 (the `./photos` entry, with the
  thumbnail view internal behind `FileInput`'s photo picker), and FR7 (the
  probes, and a view that draws without prompting); and `spec:AST-140`: its
  FR3 (the group's closed reasons) and FR5 (named features, `countAssets`
  among them).
- It refines `spec:AST-112/FR7`'s explicit permissions for photo access:
  photo access is read and asked for through `AstryxPhotoLibrary`, whose
  states include `limited` (OQ1).

## Verification

| Contract | Verification                                                                                                           | Representative states                                                                                                                                           | Mutation or failure expectation                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Built apps with the core package only and with `photos` opted in; unit tests of the loader                             | `photos` opted out; opted in                                                                                                                                    | An opted-out app links PhotoKit or declares a photo permission or purpose string, an opted-in app lacks them, or the library imports `photos` outside its loader                    |
| FR2      | The platform's spec rules check; the contracts list against the codegen specs                                          | each module method; each view prop, command, and event                                                                                                          | A listed member is missing, a shipped member changes, or a method rejects                                                                                                           |
| FR3      | The photos contract suite over the `./testing` double (`mockPhotosCapability`); Simulator, emulator, and device checks | each access state; `canAsk` true and false; limited picker on and off the supported versions                                                                    | A read prompts, `requestAccess` prompts without `canAsk` or opens Settings, or the picker runs without `limited`                                                                    |
| FR4      | Unit tests of paging; JVM tests of the cursor and selection rules; hosted iOS tests over a seeded library              | first, middle, and last page; limited selection; a change between pages on each platform; a count with and without `countAssets`, under full and limited access | An asset repeats or is skipped, an iOS cursor survives a change, an Android cursor goes stale, a page size is refused, or a count differs from the total `listAssets` pages through |
| FR5      | Unit tests of export through the double; hosted iOS tests; emulator and device checks                                  | `jpeg` and `original`; `maxPixels`; a photo with location; a video; an iCloud-only asset; one missing id; a cancel mid-export                                   | One failure fails the batch, a cancelled asset leaves a file, progress arrives faster than its bound, a JPEG keeps the stored orientation or its location, or a video has no poster |
| FR6      | Library tests of `PhotoThumbnail`; hosted iOS tests; emulator checks                                                   | `cover` and `contain`; a scrolled grid; a removed asset; no access                                                                                              | A picture crosses to JavaScript, a cell decodes twice at one size, a hidden cell keeps decoding, or the view prompts                                                                |
| FR7      | Unit tests through the doubles in their absent, not-linked, older, and current shapes                                  | `photos` not opted in; the module absent; the view absent                                                                                                       | A call throws, a reason falls outside the set, or `no-native-view` repeats                                                                                                          |
| FR8      | VoiceOver and TalkBack checks on the Simulator, emulator, and device                                                   | a labelled and an unlabelled thumbnail                                                                                                                          | A thumbnail has no image role, or an unlabelled one is read                                                                                                                         |
| FR9      | Review of each platform source against the platform SDKs                                                               | each piece                                                                                                                                                      | A piece calls an API outside the platform's public SDK                                                                                                                              |
| FR10     | Contract baseline check                                                                                                | a binary without `countAssets`                                                                                                                                  | The JavaScript uses a feature the binary does not list                                                                                                                              |

## Decision log

### DEC-1 — The photo pieces ship in the core package

**Reference:** `spec:AST-135/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

`FileInput`'s photo picker uses `AstryxPhotoLibrary` and
`AstryxPhotoThumbnailView`, so they ship in the core package, as its opt-in
`photos` capability: the photo permission, the purpose string and the photo
frameworks come with the opt-in, so an app carries them when it shows the
library, and `FileInput`'s photo source is the system photo picker in an app
without it. Astryx ships the native code an app would otherwise get from a library
(`spec:AST-112/FR2`, `spec:AST-112/DEC-16`). Apps also reach
`AstryxPhotoLibrary` as app API through the `./photos` entry; the thumbnail
view stays internal behind `FileInput`'s photo picker.

### DEC-2 — Results take the size the library has

**Reference:** `spec:AST-135/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

A page of assets and an export take whatever size the caller and the library
have. Sizes the caller sets (`pageSize`, `maxPixels`) bound the work asked
for.

### DEC-3 — The count comes from the listing's own fetch

**Reference:** `spec:AST-135/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

`countAssets` counts the same fetch `listAssets` pages through, so a picker's
total matches what the person can scroll to, under `limited` access too. A
binary without the feature leaves the app an open-ended total such as "N of
M+".

## Open questions

- **OQ1 — Does photo access join `AstryxPermissions` (`spec:AST-130/FR9`) as
  `photos`, with `limited` added to its states?** (`human-api`)
