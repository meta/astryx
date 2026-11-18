---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/FileInput
platform_of: component:FileInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers: [public-api, behavior, accessibility, privacy]
verified_by: []
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: []
---

# FileInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Core's `FileInput` props with core's meanings and defaults. `value` and `onChange` hold `FileInputFile` records where web holds the browser's `File`: core's `name`, `type`, and `size`, plus `uri` and, for photos and videos, `assetId`, `width`, `height`, `creationDate`, `duration`, and `posterUri`. Two additions: `maxDuration` and `onPickFailure({source, reason})`.                                                                                                                                                                  |
| Behavior                | `accept` decides the sources a person can pick from. When it allows images or videos, the photo library is a source: an Astryx photo grid over the core package's photo library and photo thumbnail pieces when the app declares photo-library access, else the system photo picker, which needs no permission. Files and the camera come through the native file picker. Picked items are written to the app's file cache, upright and without location metadata, and pass core's `accept`, `maxSize`, and `maxFiles` rules before `onChange`. |
| End-user impact         | A person picks photos and videos in the order they tap them, sees what they picked again when they reopen the grid, sees which photos a limited app can see and how to change that, and is asked for photo access only when they first open the library. VoiceOver and TalkBack read each photo's kind, date, and selection state.                                                                                                                                                                                                              |
| Builder impact          | The same FileInput code picks photos on React Native with no third-party library. An app reads and uploads each picked file through its `uri` and deletes the files it no longer needs. An app that never declares photo-library access still picks photos, through the system picker.                                                                                                                                                                                                                                                          |
| Compatibility/readiness | Not yet released; additive. Draft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Review checks           | Reject a photo source `accept` does not allow, a prompt before the person opens the library, files in an order other than the person's, a selection beyond `maxFiles`, a written file with location metadata, an unpicked item's id, thumbnail, or file reaching the app, or a grid that mounts every cell of the library.                                                                                                                                                                                                                      |
| Governing rules         | `component:FileInput` FR1–FR6; `family:input-fields`; the photo library and photo thumbnail pieces of `spec:AST-135`; the file picker and the app cache location of `spec:AST-130`; DEC-1 below.                                                                                                                                                                                                                                                                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

FileInput on React Native is core's file-selection field, drawn with React
Native views and filled by the platform's own sources. A person picks photos
and videos from the library, takes a photo, or chooses a file, and the app
receives the picked files in the shape core's FileInput gives them.

## Why this exists

An app that picks photos otherwise adds a third-party image-picker library
with native code of its own. Astryx's core package already holds the native
photo library and photo thumbnail pieces (`spec:AST-135`) and the native file
picker (`spec:AST-130`), so FileInput uses them, and web's FileInput is the
shape: a photo picker is FileInput with an image `accept` (DEC-1).

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a React Native implementation of an existing
  core component, with two optional props)
- Controlled/uncontrolled behavior: unchanged; FileInput stays controlled
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Which sources React Native offers for an `accept` value, and how a person
  chooses one (FR3).
- The photo grid: what it lists, selection, preselection, limited access, and
  confirm (FR4–FR6).
- When photo access is asked for, what a person sees when it is off (FR7),
  and the system photo picker (FR8).
- How picked items become `FileInputFile` records: format, orientation,
  metadata, downloads, and video (FR2, FR9, FR10).
- The picked files' rows: thumbnail, poster, and remove (FR13).
- What reaches the app from a pick (FR12), and who deletes the written files
  (FR14).

**Does not own / non-goals**

- The meaning of FileInput's props, its validation rules, statuses, loading,
  and disabled states — owned by `component:FileInput`.
- Labels, descriptions, required and optional markers, and status messages —
  owned by `family:input-fields`.
- Photo access, listing, export, and thumbnail decoding — owned by the core
  package's photo library and photo thumbnail pieces (`spec:AST-135`).
- The system photo picker, the document picker, and the camera — owned by the
  native file picker (`spec:AST-130`).
- The app cache's location — owned by the core package (`spec:AST-130`).
  Deleting, listing, and sharing its files is outside the core package.
- Editing photos: crop, rotate, filters, markup.
- A full gallery app: albums, search, favourites, sharing, deleting, or saving
  to the library.
- A Live Photo's motion, depth data, and RAW files.
- Astryx Stage (`spec:AST-139`) and Preview in the Astryx app
  (`spec:AST-141`) — specified in their own records.

## Public concepts

| Concept           | Closed values or states                                                               | Meaning                                                                                   | Availability by variant/orientation/state | Default                                                   | Owner                              | Stability    | Invalid-value behavior                                    |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ------------ | --------------------------------------------------------- |
| file record       | `FileInputFile` (FR2)                                                                 | one picked or passed-in file                                                              | always                                    | —                                                         | `component:react-native/FileInput` | experimental | a passed-in record without `uri` lists but cannot be read |
| source            | `photos`; `camera`; `files`                                                           | where a pick comes from                                                                   | as `accept` and the device allow (FR3)    | —                                                         | `component:react-native/FileInput` | experimental | a source the device lacks is not offered                  |
| photo source form | grid; system picker                                                                   | the Astryx photo grid, or the system photo picker (FR8)                                   | the `photos` source                       | grid with a photo-library declaration, else system picker | `component:react-native/FileInput` | experimental | none                                                      |
| photo media       | images (Live Photos as stills); videos                                                | what the photo source lists, from `accept`                                                | the `photos` source                       | both                                                      | `component:react-native/FileInput` | experimental | none                                                      |
| photo access      | `full`; `limited`; `denied`; `restricted`; `undetermined`                             | the app's library access, read from `spec:AST-135`                                        | the grid                                  | —                                                         | `spec:AST-135`                     | experimental | none                                                      |
| `maxDuration`     | seconds, a number above 0                                                             | the longest video a person can pick                                                       | `accept` allows videos                    | unset (no bound)                                          | `component:react-native/FileInput` | experimental | 0 or below is ignored                                     |
| pick failure      | `denied`; `restricted`; `unsupported-source`; `no-window`; `download-failed`; `error` | why a source gave no files, or why one item was not written; `cancelled` is not a failure | `onPickFailure`                           | —                                                         | `component:react-native/FileInput` | experimental | an unknown reason reads `error`                           |

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                         | Draft review state |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| FR1  | Web parity. FileInput MUST take core's props with core's meanings and defaults: `label`, `value`, `onChange`, `changeAction`, `accept`, `isMultiple`, `maxSize`, `maxFiles`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `disabledMessage`, `isLoading`, `placeholder`, `mode`, `status`, `statusVariant`, `labelTooltip`, and `width`. Core's validation rules apply to every pick: a file `accept` does not match or larger than `maxSize` is rejected and named in the error status, a multiple field adds picks up to `maxFiles`, and a single field's pick replaces its file. Core's states stay: loading shows the spinner and blocks picking, disabled blocks picking and keeps `disabledMessage`, the clear control removes the files, and a dropzone's status placement follows `component:FileInput` FR6. The web styling props (`containerXstyle`, `containerClassName`, `controlXstyle`, `controlClassName`) do not exist on React Native; `containerStyle` and `controlStyle` take React Native styles. | `component:FileInput` FR1–FR6                                                 | settled            |
| FR2  | `value` and `onChange` MUST keep core's shapes with a `FileInputFile` record in place of the browser's `File`: a record or `null` when `isMultiple` is false, a list when it is true. A record has core's `name`, `type` (the MIME type, `''` when unknown, as web's `File.type`), and `size` in bytes, and `uri`, a `file://` URI of the written file in the app's file cache, whose location the core package owns (`spec:AST-130`). A photo or video also has `width` and `height` in pixels as written, `creationDate` (milliseconds since 1970, `null` when unknown), and `duration` in seconds (0 for an image); a video has `posterUri`, a JPEG of its first frame in the same cache; and an item picked from the grid has `assetId`, its photo library id (`spec:AST-135` FR4). A record the app passes in may leave out every field but `name` and `size`.                                                                                                                                                                                | `component:FileInput` value contract; `spec:AST-130`; `spec:AST-135` FR4, FR5 | settled            |
| FR3  | `accept` MUST decide the sources and filters. The photo library is offered when `accept` allows images or videos (`image/*`, `video/*`, an image or video MIME type, or an extension of one); the camera when it allows images and the device has one; files always, filtered by `accept`. An unset `accept` allows every source. The photo source lists only the media `accept` allows: images, with a Live Photo as its still image, and videos. One source opens at once on press; several open a source menu, the photo library first (iOS: a menu pulled down from the trigger; Android: a bottom sheet). In dropzone mode the surface opens the sources on press; it takes no drops.                                                                                                                                                                                                                                                                                                                                                         | `component:FileInput` `accept`; `spec:AST-130`                                | settled            |
| FR4  | The photo grid MUST list the photos and videos the app can see, newest first, in a full-height sheet over the calling surface, read a page at a time from the photo library piece and drawn with the photo thumbnail piece (`spec:AST-135`). A video cell shows its duration; a video longer than `maxDuration` is unavailable. No library is refused for its size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `spec:AST-135` FR4, FR6                                                       | settled            |
| FR5  | Selection MUST follow `isMultiple`. Single: a tap picks that photo and closes the grid. Multiple: taps toggle selection, each selected cell shows its place in the selection order, and Add (with the count) confirms; files return in selection order. Reopening a multiple field's grid shows the items it holds from the grid as selected, in their order, and the selection limit is `maxFiles` less the field's other files; deselecting a held item and confirming removes it, and new selections follow the held ones. At the limit, unselected cells are unavailable until one is deselected. Cancel, or closing the sheet, changes nothing.                                                                                                                                                                                                                                                                                                                                                                                               | `component:FileInput` `isMultiple`, `maxFiles`                                | settled            |
| FR6  | With `limited` access (iOS limited access; Android 14 and later, user-selected access), the grid MUST list only the photos the app can see and show a notice above them with a Manage action. Manage offers Select More Photos, which presents the system's limited-selection picker where the device offers it (iOS 15 and later, Android 14 and later) and updates the grid when it closes, else the system photo picker for this pick (FR8); and Open Settings. The grid never triggers the system's own limited-access alert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-135` FR3                                                            | settled            |
| FR7  | Photo access MUST be asked for on first use: opening the photo source with `undetermined` access shows the system prompt, and the grid opens with the answer. Nothing prompts before the person opens the photo source. With `denied` access, the sheet shows that photo access is off, Open Settings, and Choose Photos, which presents the system photo picker (FR8). With `restricted` access it shows the notice and Choose Photos only, since the person cannot change it. `onPickFailure` receives `{source: 'photos', reason}` for `denied` and `restricted`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-135` FR3                                                            | settled            |
| FR8  | The photo source MUST use the system photo picker, with no permission and no prompt, when the app's native project declares no photo-library access (iOS `NSPhotoLibraryUsageDescription`; Android the media read permissions), when the photo library piece answers `not-allowed` or is absent, and from FR6 and FR7. It is iOS's system photo picker, and on Android the system Photo Picker, which older Android versions receive through system updates. It presents as the field's sheet and follows `isMultiple`, the limit FR5 sets, and the media `accept` allows; its items keep the order picked. It has no preselection and no `maxDuration` filter: a longer video is rejected after the pick and named in the error status.                                                                                                                                                                                                                                                                                                           | `spec:AST-130` FR13; `spec:AST-135` DEC-3                                     | settled            |
| FR9  | Picked items MUST be written to the app's file cache before `onChange` (`spec:AST-130`, `spec:AST-135` FR5). An image is a JPEG when `accept` allows `image/jpeg`, else its stored bytes; it is upright, with its orientation applied. A video is an MP4 on both platforms when `accept` allows `video/mp4`, else its stored bytes. Location and other EXIF and camera metadata are removed from every written photo and video. Core's rules (FR1) then run on the records, `maxSize` against the written size and `maxDuration` against `duration`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-135` FR5; `component:FileInput` FR1                                 | settled            |
| FR10 | An item held only in iCloud MUST be downloaded before it is written. From the grid, the field shows core's loading state with the download's progress, and a Cancel action stops the download and the writes and keeps nothing from that pick. The system photo picker shows its own download progress in its sheet; once it closes, the field shows the loading state until the files are written. An item that cannot be downloaded or written is named in the error status, reported to `onPickFailure` with `download-failed` or `error`, and the others still arrive.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-135` FR5                                                            | settled            |
| FR11 | Files and the camera MUST come through the native file picker (`spec:AST-130`), which presents over the calling surface; its results become records as FR2 and FR9 describe. What differs from web: the document picker filters by `accept` itself, the camera takes photos only, and a camera with no permission or a denied one reports `onPickFailure` with `denied`, `restricted`, or `unsupported-source`. `onPickFailure({source, reason})` is called once for a pick that ends without files for a reason other than the person cancelling, and once per item FR10 names; the field also shows core's error status with the catalog's message. Cancelling calls nothing and changes nothing.                                                                                                                                                                                                                                                                                                                                                | `spec:AST-130`                                                                | settled            |
| FR12 | Only picked items MUST reach the app. FileInput gives the caller no listing, thumbnail, library change event, or id of an item the person did not pick, writes no file for an unconfirmed selection, and reads no original before confirm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-135` DEC-3                                                          | settled            |
| FR13 | Each file the field holds MUST show as a row with its name, size, and kind, and a Remove button. A photo row shows its thumbnail: through the photo thumbnail piece by `assetId` when the record has one, else decoded natively from `uri` at the row's size. A video row shows its poster and duration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `component:FileInput` file name display; `spec:AST-135` FR6                   | settled            |
| FR14 | The written files MUST be the app's. FileInput never deletes them, removing a file from the field included. They live in the app cache, whose location the core package owns (`spec:AST-130`). Deleting them is outside the core package; the system reclaims the cache under storage pressure, so an app copies or uploads a file it keeps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `spec:AST-130`                                                                | settled            |

### Allowed variation

- **AV1 — System surfaces.** The access prompt, the limited-selection picker,
  the system photo picker, the document picker, and the camera are the
  platform's own and may change with each OS release.
- **AV2 — Grid density.** The column count follows the sheet's width and the
  text size; cells stay square.

### Representative states

| State                             | Required invariant                                     | Allowed variation              |
| --------------------------------- | ------------------------------------------------------ | ------------------------------ |
| `accept` images only, full access | grid lists images, Live Photos as stills               | column count                   |
| `accept="image/*,.pdf"`           | source menu: photo library, camera, files              | menu presentation              |
| first open, `undetermined`        | one system prompt, then the grid                       | prompt is the system's         |
| `limited`                         | only visible photos; Manage notice                     | limited picker is the system's |
| `denied`                          | Open Settings and Choose Photos; `onPickFailure`       | none                           |
| no photo-library declaration      | system photo picker as the sheet, no prompt            | system picker                  |
| multiple, reopened                | held items selected in order; limit counts other files | none                           |
| multiple, limit reached           | other cells unavailable; order numbers shown           | none                           |
| iCloud download                   | loading with progress; Cancel keeps nothing            | progress presentation          |
| right-to-left                     | grid, order marks, and notices mirrored                | none                           |

### Transformation and precedence order

- **ORD1 — Photo source form.** No declaration, `not-allowed`, or an absent
  piece (system picker, FR8); then access: `undetermined` (prompt), `denied` or
  `restricted` (FR7), `limited` (FR6), `full` (grid).
- **ORD2 — Pick to value.** Selection, in the person's order; then download
  and write (FR9, FR10); then core's `accept`, `maxSize`, and `maxFiles` rules
  and `maxDuration`; then `onChange`.

### Performance and resources

- **PR1 — Windowed grid.** The grid mounts only the rows on screen and a margin
  around them, and reads the next page as the person nears its end. A library
  of thousands of photos opens and scrolls with no work that grows with its
  size.
- **PR2 — Native thumbnails.** Thumbnails load lazily as cells appear, decode
  natively at the cell's size, come from the thumbnail cache when a cell
  returns, and cancel when a cell leaves the screen. No picture crosses to
  JavaScript.
- **PR3 — Work on confirm only.** Originals are read and written only for the
  confirmed selection.

## Accessibility contract

- **AR1 — Each photo is one element.** A cell is a button named by its kind
  and date ("Photo, November 3, 2026"; a video adds its duration), with its
  selection state and, when selected in a multiple field, its place in the
  order. An unavailable cell reads as dimmed.
- **AR2 — Selection count announced.** Each change of the selection announces
  the count, and Add carries the count in its name.
- **AR3 — Sheet and notices.** The sheet is a modal for VoiceOver and
  TalkBack, with focus on its title when it opens and back on the trigger when
  it closes. The limited, denied, and restricted notices and their actions are
  named elements.
- **AR4 — Rows.** Each file row is one element named by its name, size, and
  kind, with a remove action that VoiceOver and TalkBack offer on the row; its
  Remove button is named "Remove" and the file's name. A removal is announced
  and focus moves to the trigger.
- **AR5 — Reduced motion.** With Reduce Motion on, selection, sheet, and
  thumbnail appearance use no scale or slide; changes appear at once or
  cross-fade.
- **AR6 — Right to left.** In a right-to-left layout the grid starts at the
  right, and order marks, notices, and rows mirror.
- **AR7 — Field.** The trigger and a pick are announced as core's FileInput
  announces them (`family:input-fields`).

## Design relationships

| Anatomy or state | Design requirement                      | Representation authority   | Hierarchy role | Component contract |
| ---------------- | --------------------------------------- | -------------------------- | -------------- | ------------------ |
| Photo grid       | square cells, selection order marks     | human-selected             | prominent      | FR4, FR5           |
| Access notices   | limited, denied, restricted             | human-selected             | supporting     | FR6, FR7           |
| File rows        | thumbnail or poster, name, size, remove | human-selected             | supporting     | FR13               |
| Source menu      | the platform's menu or bottom sheet     | prescribed by the platform | supporting     | FR3                |

The component implements design requirements without copying their rationale.

## Family and system relationships

- `component:FileInput` owns the props, the rules, and the states; this record
  states only what React Native adds or does differently.
- `family:input-fields` owns the labelled field and its status.
- `spec:AST-135` owns the photo library and photo thumbnail pieces;
  `spec:AST-130` the file picker and the app cache location.

## Verification map

| Contract   | Verification                                                                                                   | Representative states                                                                        | Mutation or failure expectation                                                                                                                            | Audit section                              |
| ---------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| FR1, FR2   | FileInput tests through the core package's test doubles                                                        | single and multiple; each rule; loading; disabled; image, video, and file records            | a prop with another meaning, a list in a single field, a skipped rule, or a missing record field fails                                                     | `audit:react-native/FileInput/parity`      |
| FR3        | Unit tests of the source plan for each `accept` form                                                           | `image/*`; `video/*`; `.jpg`; `image/*,.pdf`; unset                                          | a photo source or media `accept` does not allow, or a missing one, fails                                                                                   | `audit:react-native/FileInput/sources`     |
| FR4, FR5   | Grid tests over a seeded photo library double; Simulator and emulator checks                                   | single; multiple; reopen; `maxFiles`; `maxDuration`                                          | files out of selection order, a selection past the limit, a lost preselection, or a change on cancel fails                                                 | `audit:react-native/FileInput/grid`        |
| FR6, FR7   | Tests over the double in each access state; device checks of the prompt                                        | `undetermined`; `limited`; `denied`; `restricted`                                            | a prompt before open, the system's limited alert, no Open Settings when denied, or Open Settings when restricted fails                                     | `audit:react-native/FileInput/access`      |
| FR8        | Tests with the piece absent and `not-allowed`; a built app with no declaration on each platform                | no declaration; `not-allowed`; absent                                                        | a grid or a prompt without a declaration fails                                                                                                             | `audit:react-native/FileInput/fallback`    |
| FR9, FR10  | Write tests through the double; device checks with an iCloud-only photo                                        | JPEG; stored bytes; a rotated photo; a photo with location; a video; one failed item; Cancel | a sideways image, location metadata in a file, a failed item that drops the others, or a Cancel that keeps files, fails                                    | `audit:react-native/FileInput/export`      |
| FR11       | File picker double tests                                                                                       | each source; each failure reason; cancel                                                     | a failure without `onPickFailure`, or a cancel that calls it, fails                                                                                        | `audit:react-native/FileInput/failures`    |
| FR12, FR14 | Tests that inspect what the caller receives and which files remain                                             | confirm; cancel; remove from the field                                                       | an unpicked item's id, thumbnail, or file reaching the caller, or FileInput deleting a written file, fails                                                 | `audit:react-native/FileInput/privacy`     |
| FR13       | Row tests through the doubles                                                                                  | photo with and without `assetId`; video; file                                                | a photo row without a thumbnail or a video row without its poster fails                                                                                    | `audit:react-native/FileInput/rows`        |
| PR1, PR2   | A seeded library of 10,000 assets on a device                                                                  | fast scroll; return to the top                                                               | mounted cells growing with the library, or a second decode of a cached cell, fails                                                                         | `audit:react-native/FileInput/performance` |
| AR1–AR7    | VoiceOver and TalkBack checks on the Simulator, emulator, and device; Reduce Motion on; a right-to-left locale | each cell state; selection changes; notices; rows                                            | a cell without kind, date, or state, a silent selection change, a row without its remove action, motion under Reduce Motion, or an unmirrored layout fails | `audit:react-native/FileInput/a11y`        |

## Decision log

### DEC-1 — Photo picking is FileInput's photo-library source, not a new public name

**Reference:** `component:react-native/FileInput/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A photo picker on React Native is FileInput with an `accept` that allows
images or videos: the photo library is one of its sources, so an app learns
one field, the same props work on web and React Native, and picked photos
arrive as files like any other.

Rejected: a separate photo picker component with its own props and value
shape.

## Open questions

- **OQ1 — Does web also want a separately named photo input, or does
  `FileInput` with an image `accept` stay the one name?** (`human-api`) Today
  the one name is `FileInput` on every platform (DEC-1).

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
