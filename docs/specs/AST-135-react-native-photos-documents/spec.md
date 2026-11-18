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

# React Native platform: Photos and documents system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An app shows the person's photos and the documents they work with. A person
scrolls the photos they allowed the app to see in a grid inside the app,
changes which photos a limited app sees, and sends a few of them as files. They
read a PDF with paging, zoom, and find, see a document's first page as its
thumbnail in a list, and draw on a photo or a screenshot with a finger or
Apple Pencil before they share a copy. The developer gets the system's own
photo library, PDF renderer, and drawing canvas behind one result vocabulary,
with access the app asks for explicitly and views that never prompt.

This record details the `photos` and `pdf` capabilities and the core's image
markup module within `spec:AST-112`: the platform layer and its opt-in
capabilities (`spec:AST-112/FR1`, `spec:AST-112/FR3`), the result vocabulary
(`spec:AST-112/FR6`), the capability shape (`spec:AST-112/FR7`), additive
evolution (`spec:AST-112/FR8`), and Astryx Stage (`spec:AST-112/FR12`). It
specifies the photo library module (`AstryxPhotoLibrary`), the photo thumbnail
view (`AstryxPhotoThumbnailView`), the PDF view (`AstryxPdfView`), the PDF page
module (`AstryxPdfModule`), and the image markup module (`AstryxImageMarkup`).

## Why this exists

Each piece stays in the platform package because the alternative an app would
otherwise add is an open-source library that ships native code, which a
JavaScript-only app and a previewed project cannot add (DEC-1).

- `AstryxPhotoLibrary`: an app that shows the library inside its own screens
  needs a native module. Choosing a few photos does not: the core file picker
  presents the system's photo picker with no permission
  (`spec:AST-130/FR13`).
- `AstryxPhotoThumbnailView`: iOS has no way to draw a library asset without
  native code. On Android, React Native's `Image` draws an asset's content URI
  with none, so one view serves both platforms with the library module's ids.
- `AstryxPdfView`: Android's web view does not render PDF, so a document view
  on both platforms needs native code.
- `AstryxPdfModule`: a page picture from the system's renderer needs native
  code. A JavaScript PDF renderer in the platform's web view needs none of its
  own, so the module's place is a scope question (OQ2).
- `AstryxImageMarkup`: drawing over an image and flattening the result to a
  file needs native code. Whether it is core or an opt-in capability is OQ1.

## Who uses it

| Native piece               | Kind                                       | Astryx components that use it                                                                                    | What a person sees                                                                                                                  |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxPhotoLibrary`       | native module (Turbo Native Module)        | No library component; app API through the `./photos` entry's `AstryxPhotoLibrary` (DEC-1)                        | The app's own grid of the photos and videos they allowed, a system prompt only when the app asks, and a way to change the selection |
| `AstryxPhotoThumbnailView` | native component (Fabric Native Component) | No library component; app API through the `./photos` entry's `PhotoThumbnail` (DEC-1)                            | Thumbnails that fill in quickly as they scroll a grid, iCloud photos included                                                       |
| `AstryxPdfView`            | native component (Fabric Native Component) | No library component; app API through the `./pdf` entry's `PdfView` (DEC-1)                                      | A document's pages, scrolled or swiped and zoomed, a jump to a page, and find with every match highlighted                          |
| `AstryxPdfModule`          | native module (Turbo Native Module)        | No library component; app API through the `./pdf` entry's `AstryxPdfModule` (DEC-1)                              | A document's page as its thumbnail in a list or grid                                                                                |
| `AstryxImageMarkup`        | native module (Turbo Native Module)        | No library component; app API through the core entry's `AstryxImageMarkup` and `markupImage` on iOS (DEC-1, OQ1) | A full-screen markup screen over a photo or screenshot, and a marked-up copy saved                                                  |

Scope notes: these pieces are specified elsewhere.

- The system photo and document pickers are the core file picker's
  (`spec:AST-130/FR13`); permissions other than photo access are
  `AstryxPermissions`' (`spec:AST-130/FR9`).
- Audio and video playback, the camera view, and code decoding from still
  images belong to the `media` and `camera` capabilities (`spec:AST-132`).
- A remote document reaches the PDF view or the page module once the app has
  downloaded it into its files; downloads and the file cache belong to the
  core's files module (`spec:AST-112/FR1`).

## Non-goals

- A library component over these pieces: a photo grid, a document viewer
  with its own chrome, or a markup button. Apps compose them with the
  library's components.
- Writing to the photo library: saving, deleting, editing, favourites, albums,
  and Live Photo or depth data.
- PDF editing, form filling, annotations, text selection and copy, links,
  password entry, printing, and remote documents.
- Image editing beyond freehand markup: crop, rotate, filters, text boxes,
  shapes, and stickers.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — `photos` and `pdf` are opt-in capabilities; image markup is core.**
  - `photos` links PhotoKit on iOS (Photos, PhotosUI, ImageIO, AVFoundation)
    and the MediaStore readers on Android. When the app opts it in, the
    configuration plugin writes the photo library purpose string on iOS
    (`NSPhotoLibraryUsageDescription`, overridable) and, on Android,
    `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` (13 and later),
    `READ_MEDIA_VISUAL_USER_SELECTED` (14 and later, for limited access), and
    `READ_EXTERNAL_STORAGE` up to API level 32 (`spec:AST-112/FR4`). The
    `./photos` entry exports `AstryxPhotoLibrary`, `PhotoThumbnail`, and
    `isPhotoThumbnailAvailable()`.
  - `pdf` links PDFKit on iOS and uses `PdfRenderer` on Android. It declares
    no permission. Its iOS privacy manifest declares the file-timestamp
    required-reason API that names its page pictures (FR9). The `./pdf` entry
    exports `PdfView`, `isPdfViewAvailable()`, and `AstryxPdfModule`.
  - `AstryxImageMarkup` is part of the core on iOS and declares nothing. The
    core never links PencilKit: the module loads it at the first markup, so
    an app's launch never loads it. The core entry exports
    `AstryxImageMarkup` and `markupImage`.
  - The library reaches each capability only through
    `AstryxPlatform.capability('photos' | 'pdf')` (`spec:AST-112/FR2`).
- **FR2 — The native contract.**

  | Contract             | Kind                                | Methods                                                                                            | Events                                | Platforms    |
  | -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ |
  | `AstryxPhotoLibrary` | native module (Turbo Native Module) | `getAccess`, `requestAccess`, `presentLimitedPicker`, `listAssets`, `exportAssets`, `cancelExport` | `onLibraryChange`, `onExportProgress` | iOS, Android |
  | `AstryxPdfModule`    | native module (Turbo Native Module) | `renderPage`, `cancel`                                                                             | none                                  | iOS, Android |
  | `AstryxImageMarkup`  | native module (Turbo Native Module) | `getConstants()` (`isSupported`), `markup`                                                         | none                                  | iOS          |

  | Contract                   | Kind                                       | Props                                                                                                               | Commands                                                                         | Events                                                                              | Platforms    |
  | -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
  | `AstryxPhotoThumbnailView` | native component (Fabric Native Component) | `assetId`, `contentMode`                                                                                            | none                                                                             | `onThumbnailLoad`, `onThumbnailError`                                               | iOS, Android |
  | `AstryxPdfView`            | native component (Fabric Native Component) | `source`, `initialPageIndex`, `fit`, `displayMode`, `maxZoom`, `pageGap`, `colorScheme`, `isFindInteractionEnabled` | `goToPage`, `resetZoom`, `find`, `findStep`, `clearFind`, `presentFindNavigator` | `onPdfLoad`, `onPdfPageChange`, `onPdfScaleChange`, `onPdfError`, `onPdfFindResult` | iOS, Android |
  - Every module method is optional and takes at most one request object. A
    method resolves a result object and never rejects.
  - An export and a page render name a `requestId` the JavaScript picks;
    each find command names a numeric `requestId` that its one
    `onPdfFindResult` answer carries back.

- **FR3 — Photo access is read and asked for explicitly.**
  - `getAccess()` answers `{access, canAsk}` and never prompts. `access` is
    `full`; `limited` (the person chose which photos the app sees: iOS 14 and
    later, Android 14 and later); `denied`; `restricted` (iOS: a device policy
    stops the person from granting it); or `undetermined` (never asked).
    `canAsk` says whether `requestAccess()` would show the system prompt now;
    false means only Settings can change it.
  - `requestAccess()` shows the system prompt only when `canAsk` is true
    (iOS: `undetermined`; Android: never asked, or refused once while the
    system still shows the prompt), then answers as `getAccess()`. Otherwise
    it answers the current access at once. It never opens Settings.
  - `canPresentLimitedPicker()` is synchronous and says whether the device
    offers the selection picker (iOS 15 and later, Android 14 and later).
    `presentLimitedPicker()` presents it over the app when access is
    `limited` and resolves the access when it closes; a change event follows
    any change. It answers `invalid-option` unless access is `limited`, and
    `unsupported` where the device does not offer it.
  - Only `requestAccess()` and `presentLimitedPicker()` show system UI.
    Listing, exporting, and drawing a thumbnail never prompt; without access
    they answer `denied` (`spec:AST-112/FR7`).
- **FR4 — The library is read newest first, a page at a time.**
  - `listAssets({cursor, pageSize, mediaTypes})` answers `{assets,
nextCursor}`: the photos and videos the app can see (only the selection
    under `limited`), newest first by creation date (Android: date taken,
    else date added). `pageSize` is a whole number from 1, default 60;
    `mediaTypes` is `image`, `video`, or both (the default). No page size or
    library size is refused for its size.
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
  - `addChangeListener(listener)` reports `{reason}`: `library` when the
    visible assets change (added, removed, edited, or a new limited
    selection) and `access` when the access changes in Settings, at most
    about once a second. It starts after the runtime's first `getAccess`,
    `requestAccess`, or `listAssets`. It returns `{remove()}`.
- **FR5 — Assets are exported to files.**
  - `exportAssets(ids, {format, maxPixels, quality, allowsNetwork, signal,
onProgress})` writes each asset, in the order given, to a file in the
    calling runtime's file cache and answers `{files, failures}`. Each file
    has `id`, a `file://` URI, its cache `name`, `mimeType`, `mediaType`,
    pixel `width` and `height`, and `size` in bytes.
  - `format: 'jpeg'` (the default) writes an image as an upright JPEG
    (orientation applied) with its longest side at most `maxPixels` (absent
    is full size) at `quality` (0 to 1, default 0.85), and a video as an MP4
    where the platform converts it: iOS re-encodes a QuickTime movie, and
    Android writes the stored file and reports its own type.
    `format: 'original'` writes the stored bytes; a HEIC image stays HEIC.
  - With `allowsNetwork` (default true), iOS downloads an iCloud-only original
    first, and the progress counts the download. A download that makes no
    progress for ten minutes fails that asset `download-failed`. With
    `allowsNetwork: false`, an iCloud-only asset fails `download-failed` at
    once.
  - One asset's failure never fails the rest: `failures` lists each id not
    written with its reason, `missing` (no such asset, or not visible to the
    app), `download-failed`, `unreadable`, `no-space`, `io`, or `cancelled`.
  - `onProgress` receives `{id, index, count, fraction}` at most about ten
    times a second per asset. Aborting `signal` stops the export: queued
    assets never start, and the asset in flight stops and deletes what it
    wrote. The export answers `cancelled` with the files already written.
  - The files are the caller's: it removes each with the file cache's
    `remove(name)`, and the cache's `clear` removes them all.
- **FR6 — `PhotoThumbnail` draws one asset natively.**
  - Its props are `assetId` (an id `listAssets` answered; `''` draws
    nothing), `contentMode` (`cover`, the default, fills and crops;
    `contain` fits the whole picture), `onLoad({width, height})` with the
    decoded picture's pixels, `onError(failure)`, `fallback`, `style`,
    `testID`, and `accessibilityLabel`.
  - The native view decodes the asset at its own laid-out size times the
    screen scale, off the main thread. A cell scrolled away and back shows
    its picture again without a second decode while the picture stays in
    memory. No picture crosses to JavaScript.
  - A view that leaves the screen or takes another `assetId` cancels its
    request. On iOS the request may use the network, so an iCloud-only photo
    shows once its thumbnail arrives.
  - `onError` reports `missing`, `denied` (no photo access), `unreadable`, or
    `not-allowed` (a previewed project). The view never prompts.
- **FR7 — `PdfView` shows a local document in the system's renderer.**
  - `source` is a local document, `file://` (Android also `content://`), as
    `{uri}` or the bare string. `initialPageIndex` (0-based, default 0) is
    applied when the document loads. `fit` is `width` (the default: a page
    fills the view's width) or `page` (a whole page fits), reapplied on a
    size change. `displayMode` is `continuous` (the default: one vertical
    scroll) or `single` (one page at a time, swiped sideways). `maxZoom` is
    the largest zoom as a multiple of the fitted scale (default 4), and
    `pageGap` the space between pages (default 8).
  - Pinch and double tap zoom between the fitted scale and `maxZoom` times
    it. `colorScheme` is `light`, `dark`, or `system` (the default: the
    appearance provider's scheme where one is set, else the system's); it
    sets the background behind the pages.
  - Events: `onLoad({pageCount})`, `onPageChange({pageIndex, pageCount})`
    (0-based), `onScaleChange({scale})` as a multiple of the fitted scale,
    and `onError(failure)` with `missing-file`, `unreadable`, `locked` (a
    password protects it), or a common reason (`not-allowed`: a previewed
    project's file outside its own files).
  - `ref` is a handle with `goToPage({pageIndex, isAnimated})` and
    `resetZoom({isAnimated})` (`isAnimated` defaults to true).
  - Rendering runs off the main thread. Many PDF views open at once hold
    bounded memory together, and a view's pages are freed when it goes. No
    document is refused for its page count or size.
- **FR8 — Find in a document.**
  - The handle's `find(query, {isCaseSensitive})` finds every match of `query`
    in the document's text (case-insensitive by default), highlights them
    all, and selects the first one on or after the page shown.
    `findNext()` and `findPrevious()` move through the matches and wrap.
    Each resolves the state `{query, count, index, pageIndex}` or a failure,
    and never rejects. `count` counts every match, with no limit; `index` and
    `pageIndex` are -1 when there is no match.
  - `clearFind()` removes the highlights and the selection. `onFindResult`
    reports each change of the state, a new document included (which clears
    it). The system find bar's own searches are not reported.
  - A later `find` or `clearFind` answers an earlier `find` still searching
    with `superseded`. The other reasons are `invalid-option` (an empty
    query), `not-loaded` (no document shown), `unmounted`, and `unsupported`
    (FR12).
  - `isFindInteractionEnabled` (default true) turns on the system find bar
    where the platform has one (iOS 16 and later, with Command-F on a
    keyboard). `presentFindNavigator()` opens it, and answers
    `invalid-option` when the prop is false.
- **FR9 — `AstryxPdfModule` renders a page as a picture file.**
  - `canRenderPage()` is synchronous and says whether the binary renders
    pages. `renderPage(source, {pageIndex, maxPixels, signal})` draws one page
    of a local document (`file://`; Android also `content://`) off the main
    thread as a PNG in the calling runtime's file cache, and answers `{file,
name, width, height, pageCount}`.
  - The page's crop box is scaled so its longest side is `maxPixels` pixels,
    with its aspect, the page's rotation, and white behind transparent
    content. `maxPixels` bounds the picture's decode and memory, never the
    document.
  - The same request for an unchanged document answers the same file, and a
    changed document answers a new one. A reader never sees a partly written
    picture.
  - Renders run one at a time per runtime. Aborting `signal` stops one: a
    queued render never starts, and one in flight leaves no file. It answers
    `cancelled`, as does a render whose runtime's cache was cleared while it
    ran.
  - Reasons: `not-a-pdf`, `locked`, `missing-file`, `page-out-of-range` (with
    the document's `pageCount`), `invalid-option` (a `pageIndex` below 0 or
    not whole, a `maxPixels` below 1, an empty or unsupported URI), `no-space`,
    `io`, `unavailable` (the module went away during a reload), and the common
    reasons. `not-a-pdf` and `page-out-of-range` are definitive for that
    document; the others may succeed later.
- **FR10 — `AstryxImageMarkup` marks up an image and saves a copy.**
  - `AstryxImageMarkup.supports('markup')` is synchronous and true only on
    iOS with the module.
    `markupImage({uri, rootTag?})` presents the markup screen full screen over
    the calling surface (`rootTag`, `spec:AST-112/FR7`) and settles once.
  - `uri` is a `file://` URL of a PNG or JPEG, recognised by its bytes. The
    image fits the screen with its aspect, and a drawing canvas covers
    exactly its frame. The system's tool picker offers pen, marker, eraser,
    ruler, colours, undo, and redo; the default tool is a red pen. Finger and
    Apple Pencil both draw.
  - The bar carries Close and Save; Save is off until something is drawn.
    Save flattens the strokes onto the image at its own pixel size
    (orientation applied) and writes a new file in the source's format into
    the runtime's file cache: a PNG keeps its alpha, and a JPEG is re-encoded.
    The new file carries no metadata. The source file never changes. The call
    answers `{uri, width, height, contentType}`.
  - Close with strokes asks first with the system's confirmation; Close with
    none closes at once. Either way without saving answers `cancelled`, which
    is not an error.
  - A Save whose file cannot be written keeps the screen open with a notice,
    so the person may try again or close it.
  - Reasons: `invalid-option` (not a `file://` URL), `unreadable`,
    `unsupported-format` (not a PNG or JPEG), `no-window`, `busy` (a markup
    screen is already up; a second call answers at once and never queues),
    and the common reasons. No image is refused for its pixel size.
- **FR11 — Results, fallbacks, and previewed projects.**
  - No call throws. Every asynchronous call resolves an `AstryxResult` and
    never rejects (`spec:AST-112/FR6`); a reason the JavaScript does not know
    reads `error`.
  - Not opted in: the capability's JavaScript still loads, `isAvailable()`,
    `isPhotoThumbnailAvailable()`, `isPdfViewAvailable()`, and
    `canRenderPage()` answer false, and calls answer `not-linked`
    (`spec:AST-112/FR3`). Without the native side (Jest, the web) they answer
    `no-module`. A binary without a method answers `unsupported`.
  - `PhotoThumbnail` and `PdfView` where the view is absent draw `fallback`
    (nothing by default) and report `onError` with `no-native-view` once per
    mount; the PDF view's find calls then answer `no-native-view`.
  - `markupImage` on Android, the web, and Jest answers `no-module` at once,
    with no drawing fallback of its own.
  - In a previewed project's runtime, every `AstryxPhotoLibrary` call answers
    `not-allowed` and `PhotoThumbnail` reports `not-allowed`: the person's
    photo library is the app's alone. `PdfView`, `renderPage`, and
    `markupImage` read only the files the project may read (its own cache,
    temporary files, package, and picker results) and write only into the
    project's own cache; any other file answers `not-allowed`.
- **FR12 — Platform features are reported.**
  `AstryxPlatformInfo.supports(name)` (`spec:AST-130/FR8`) answers these rows
  for this binary and device:
  - `pdf.find`: true on iOS; on Android true from API level 35, where page
    text search exists.
  - `pdf.findCaseSensitive`: true on iOS, false on Android.
  - `pdf.findNavigator`: true on iOS 16 and later, false on Android.
  - A find, a case-sensitive find, or `presentFindNavigator()` where its row
    is false answers `unsupported` with a message naming what is missing,
    before anything crosses to the native side. On Android
    `isFindInteractionEnabled` is ignored.
- **FR13 — Accessibility.**
  - `PhotoThumbnail` is one element with the image role, named by its
    `accessibilityLabel`. An unlabelled thumbnail is hidden from assistive
    technology, so a grid cell names its photo through the app's own
    component.
  - `PdfView` is one group named by its `accessibilityLabel` (default "PDF")
    with the current page and the page count ("page 3 of 12"), read as focus
    enters it and updated as the page changes. The system's own page
    accessibility applies inside it.
  - The markup screen's Close and Save buttons are named, the image is one
    named element, the drawing canvas and tool picker are the system's own,
    and saving announces itself. The confirmation is the system's alert.
  - The limited-selection picker, the access prompt, and the iOS find bar are
    the system's own.
- **FR14 — Public platform API only.** Every piece uses only the platform's
  public SDK. One exception is named: the image markup module loads PencilKit
  at first use and reaches its public classes by name, so the core never
  links the framework at launch (FR1).
- **FR15 — Contract baseline.** Every contract in the group is at revision 1
  on iOS and Android, find included, and carries no revision counter
  (`spec:AST-112/FR8`). A behaviour added after revision 1 is a named feature
  (`AstryxPhotoLibrary.<feature>`, `AstryxPhotoThumbnailView.<feature>`,
  `AstryxPdfView.<feature>`, `AstryxPdfModule.<feature>`,
  `AstryxImageMarkup.<feature>`) that the binary reports through the platform
  info module, and the JavaScript checks it before it uses it. Without the
  feature the JavaScript keeps the revision-1 behaviour, draws its fallback,
  or answers `unsupported`, never a silent weaker path. Astryx Stage pairs with
  a project through the project's Astryx Stage version floor: an Astryx Stage
  that lacks a contract or named feature the project needs refuses it and
  lists what is missing (`spec:AST-112/DEC-14`).

### Platform support

| Contract                   | iOS                                                                                                                                                                                                                                   | Android                                                                                                                                                                                          | Astryx Stage                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxPhotoLibrary`       | PhotoKit fetches sorted by creation date; `PHPhotoLibrary` authorization for read and write access, limited from iOS 14; `presentLimitedLibraryPicker` from iOS 15; a change observer; asset resources and image requests for export. | `MediaStore` queries with a keyset cursor; the media read permissions, with `READ_MEDIA_VISUAL_USER_SELECTED` as limited access from Android 14; a content observer; the stored file for export. | A built-in library of placeholder photos and one video with fixed ids; the run sets the starting access and the prompt's answer; listing, cursors, export, and change events follow the platform Stage runs as. |
| `AstryxPhotoThumbnailView` | `PHCachingImageManager`, network allowed.                                                                                                                                                                                             | `ContentResolver.loadThumbnail`.                                                                                                                                                                 | The asset's placeholder tile, `cover` or `contain`, with the load size that platform reports.                                                                                                                   |
| `AstryxPdfView`            | PDFKit's `PDFView`; find on a copy of the document off the main thread; `UIFindInteraction` from iOS 16.                                                                                                                              | Pages drawn by `PdfRenderer` in a scrolling, zooming view; `Page.searchText` from API level 35.                                                                                                  | The document's own pages on macOS (FR7 gap elsewhere); `fit`, `displayMode`, `pageGap`, `colorScheme`, `goToPage`, and the events as on a device.                                                               |
| `AstryxPdfModule`          | PDFKit's page drawing into a bitmap.                                                                                                                                                                                                  | `PdfRenderer`.                                                                                                                                                                                   | Absent (FR9 gap).                                                                                                                                                                                               |
| `AstryxImageMarkup`        | PencilKit's canvas and tool picker in a full-screen screen.                                                                                                                                                                           | Absent: `supports('markup')` is false (OQ3).                                                                                                                                                     | The refusals and their order are the device's; no drawing (FR10 gap).                                                                                                                                           |

- FR5 gap: Astryx Stage writes an `original` photo as a JPEG, not in its
  stored format, and a video as a file that does not play.
- FR7 gap: Astryx Stage does not scroll or zoom inside the PDF view with a
  finger or trackpad, and `resetZoom` does nothing there. On Linux and
  Windows it shows numbered placeholder pages instead of the document's.
- FR8 gap: Astryx Stage has no page text, so a find answers `unsupported`.
- FR9 gap: Astryx Stage has no `AstryxPdfModule`, so `canRenderPage()` is
  false and `renderPage` answers `no-module` there.
- FR10 gap: Astryx Stage shows no markup screen: a markup answers
  `cancelled`, unless a script plays a save, which saves the source's pixels
  as the new file.
- FR13 gap: `PhotoThumbnail` sets no image role, and an unlabelled thumbnail
  is not hidden from assistive technology.
- Supported feature/engine floor: the floor of `spec:AST-112` (iOS at React
  Native's minimum, Android API level 24, the New Architecture only). Limited
  photo access needs iOS 14 or Android 14, the selection picker iOS 15 or
  Android 14, the system find bar iOS 16, and find on Android API level 35.
- Unsupported behavior: a feature the binary or device lacks answers false
  from `supports(feature)` or its probe, and a call that needs it answers
  `unsupported` (FR11, FR12); a view the binary lacks reports itself
  unavailable and draws its fallback (FR11).
- Browser evidence: none. Native claims are proven on the iOS Simulator, the
  Android emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- This record details `spec:AST-112`: its FR1 (`photos` and `pdf` among the
  opt-in capabilities, and photos, PDF, and image markup in the package with
  no library component using them), FR3 (`photos` and `pdf` stay opt-in),
  FR4 (the host declarations written for `photos`), FR5 (the `./photos` and
  `./pdf` entries), FR6 (the group's closed reasons), FR7 (the probes,
  `supports`, and views that never prompt), FR8 (the revision-1 baseline and
  named features), and FR12 (photos and documents in Astryx Stage).
- It places image markup in the core on iOS (OQ1).
- It refines `spec:AST-112/FR7`'s explicit permissions for photo access:
  photo access is read and asked for through `AstryxPhotoLibrary`, whose
  states include `limited` (OQ4).

## Verification

| Contract | Verification                                                                                                                       | Representative states                                                                             | Mutation or failure expectation                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Built apps with the core only and with each capability opted in; unit tests of the loader; an iOS launch check                     | `photos` and `pdf` opted out; opted in; an app that never marks up                                | An opted-out app links PhotoKit or PDFKit or declares a media permission, the library imports a capability outside its loader, or launch loads PencilKit |
| FR2      | The platform's spec rules check; the contracts list against the codegen specs                                                      | each module method; each view prop, command, and event                                            | A listed member is missing, a shipped member changes, or a method rejects                                                                                |
| FR3      | The photos contract suite over the `./testing` double (`mockPhotosCapability`); Simulator, emulator, and device checks             | each access state; `canAsk` true and false; limited picker on and off the supported versions      | A read prompts, `requestAccess` prompts without `canAsk` or opens Settings, or the picker runs without `limited`                                         |
| FR4      | Unit tests of paging; JVM tests of the cursor and selection rules; hosted iOS tests over a seeded library; Astryx Stage            | first, middle, and last page; limited selection; a change between pages on each platform          | An asset repeats or is skipped, an iOS cursor survives a change, an Android cursor goes stale, or a page size is refused                                 |
| FR5      | Unit tests of export through the double; hosted iOS tests; emulator and device checks; Astryx Stage                                | `jpeg` and `original`; `maxPixels`; an iCloud-only asset; one missing id; a cancel mid-export     | One failure fails the batch, a cancelled asset leaves a file, progress arrives faster than its bound, or a JPEG keeps the stored orientation             |
| FR6      | Library tests of `PhotoThumbnail`; hosted iOS tests; emulator checks; Astryx Stage renders                                         | `cover` and `contain`; a scrolled grid; a removed asset; no access                                | A picture crosses to JavaScript, a cell decodes twice at one size, a hidden cell keeps decoding, or the view prompts                                     |
| FR7      | Library tests through the doubles; Simulator, emulator, and device checks; JVM tests of Android's page rendering and memory bounds | each `fit` and `displayMode`; zoom to `maxZoom`; `goToPage`; a locked or missing file; many views | A page event is 1-based, a locked file loads, or a closed view's pages stay in memory                                                                    |
| FR8      | Hosted iOS find tests on a fixture document; emulator checks on API level 35 and below; unit tests of the find state               | a match on several pages; no match; a superseded find; `clearFind`; a new document                | A match is missed or capped, a superseded find resolves its state, or a new document keeps the old highlights                                            |
| FR9      | Module tests of renders and cancels; JVM tests of the job queue; Simulator and emulator checks                                     | the same request twice; a cancel queued and in flight; a cache clear mid-render; each reason      | A second identical request renders a new file, a cancelled render leaves a file, or `page-out-of-range` lacks `pageCount`                                |
| FR10     | Hosted iOS tests of the markup screen; unit tests of the wrapper; Astryx Stage scripted saves                                      | PNG and JPEG; Close with and without strokes; Save; a second call while open; an unwritable save  | The source file changes, the new file carries metadata or a different pixel size, a second call queues, or a failed save closes the screen               |
| FR11     | Unit tests through the doubles in their absent, not-linked, older, and current shapes; previewed-project checks                    | each capability not opted in; each view absent; a project's own and foreign files                 | A call throws, a reason falls outside the set, `no-native-view` repeats, or a project reads the photo library or a foreign file                          |
| FR12     | Unit tests of the feature rows; emulator checks below and at API level 35; iOS checks below and at 16                              | each row true and false                                                                           | A call runs where its row is false, or a row answers true on a device that lacks the feature                                                             |
| FR13     | VoiceOver and TalkBack checks on the Simulator, emulator, and device                                                               | a labelled and an unlabelled thumbnail; a page change; the markup screen                          | A thumbnail has no image role, an unlabelled one is read, the page is not announced, or a markup control has no name                                     |
| FR14     | Review of each platform source against the platform SDKs                                                                           | each piece                                                                                        | A piece calls an API outside the platform's public SDK, other than the named exception                                                                   |
| FR15     | Contract baseline check; Astryx Stage contract suites; Stage version floor check                                                   | a binary without a named feature; an older Stage                                                  | The JavaScript uses a feature the binary does not list, or an older Stage runs the project                                                               |

## Decision log

### DEC-1 — These pieces stay in the platform package as app API

**Reference:** `spec:AST-135/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

No library component uses these pieces, and they stay in the platform
package: an app's alternative for each is an open-source library that ships
native code of its own, which an app holding no native code cannot add
(`spec:AST-112/FR2`, `spec:AST-132/DEC-5`). They are app API, documented
with their entries.

Rejected: leaving photos, PDF, and markup to third-party libraries, because
each brings a second native dependency set and no Astryx Stage behaviour.

### DEC-2 — Photo access and PDF documents are opt-in

**Reference:** `spec:AST-135/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

`photos` and `pdf` are capabilities an app chooses, so an app that never
shows the library declares no photo permission or purpose string and links no
photo framework, and an app that never shows a document links no PDF code.

### DEC-3 — The photo library is the app's alone

**Reference:** `spec:AST-135/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

A previewed project never reads the person's photo library: every call
answers `not-allowed` and the thumbnail view draws nothing. A project reaches
photos the person chooses through the file picker, which copies them into the
project's own files (`spec:AST-130/FR13`).

### DEC-4 — Results hold no size limit of their own

**Reference:** `spec:AST-135/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A page of assets, an export, a find, a page picture, and a marked-up image
take whatever size the caller and the content have. Sizes the caller sets
(`pageSize`, `maxPixels`) bound the work asked for, never what the library or
the document may hold.

Rejected: a cap on matches or pages, because it hides content the platform
can read.

## Open questions

- **OQ1 — Is image markup an opt-in capability instead of core?**
  (`human-api`) As core, every iOS app can mark up with no opt-in, a
  previewed project can use it in any host, and launch never loads PencilKit
  because the module loads it at first use; the cost is the markup screen's
  code in every binary and PencilKit's classes reached by name. As an opt-in
  capability, it links PencilKit normally and an app that never marks up
  carries none of its code; the cost is one more opt-in, and a previewed
  project marks up only in a host that opted it in.
- **OQ2 — Does `AstryxPdfModule` stay native, given that pdf.js in the
  platform's web view renders pages with no native code of its own?**
  (`human-design`) Native renders are fast and small in memory and work
  without the `web` capability; pdf.js needs `web` and a running web view per
  render, and renders slower and with more memory.
- **OQ3 — Does Android offer image markup, with a canvas of the platform's
  own?** (`human-design`)
- **OQ4 — Does photo access join `AstryxPermissions` (`spec:AST-130/FR9`) as
  `photos`, with `limited` added to its states?** (`human-api`)
