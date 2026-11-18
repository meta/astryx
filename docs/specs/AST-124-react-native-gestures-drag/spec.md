---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-124
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

# React Native platform: Gestures and drag system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using an app built with `@astryxdesign/react-native` drags a sheet
up to its next stop, swipes a list row open, pinches a photo, flicks a
notification away, or lifts a card and drops it into another column or another
app. The motion follows the finger on every frame, settles with the platform's
own physics, and never waits for JavaScript, because it runs on the UI thread
inside a native view. JavaScript sets targets (props and commands) and receives
settled events (a stop reached, a row committed, a camera at rest). A drag
that starts on an Astryx control belongs to that control, and the system's back
gesture, scroll views, and sheets take every other drag as they do in a native
app.

This record details the gesture and drag pieces of the platform layer that
`spec:AST-112` defines: it applies the result vocabulary (`spec:AST-112/FR6`),
the capability shape (`spec:AST-112/FR7`), additive evolution of native
interfaces (`spec:AST-112/FR8`), and Astryx Stage as the contract developers
build against (`spec:AST-112/FR12`) to eight native components. The
touch shield is listed under "Who uses it" only (OQ1).

## Why this exists

| Pieces                                                    | What the ecosystem does well                                                                                                                                                                                                                                                    | Why Astryx owns the piece                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gesture ownership (`GestureOwnerView`, `GestureRootView`) | react-native-gesture-handler runs native recognizers off the JS thread and composes them declaratively (simultaneous, exclusive, wait-for relations) under its root view.                                                                                                       | Its relations arbitrate between its own handlers. Astryx components must win against the platform's own recognizers inside Astryx's native hosts: the iOS content-wide and edge back swipes of the stack host, UIKit's sheet drag, enclosing scroll views, and Android's system back gesture, each from the component's live state. The package takes no peer dependency beyond React and React Native (`spec:AST-112/FR2`). The touch that dismisses an iOS system menu has no ecosystem counterpart.                                                                                                                                                                                                                                          |
| Drag and snap, swipe row (`DragSnap`, `SwipeRow`)         | react-native-reanimated runs animation and gesture logic as worklets on the UI thread, with react-native-gesture-handler for input; sheet and swipeable libraries built on them (for example @gorhom/bottom-sheet and the gesture handler's swipeable) are mature and flexible. | A worklet runtime is a second JavaScript runtime and a Babel plugin that every app must carry. Astryx needs release projection, one stop per fling, UIScrollView's rubber band, sheet detents, and scroll hand-off matched to UIKit and to Android, the same rules ported to Astryx Stage, and arbitration with its own hosts. A native view with a declared props, commands, and events contract can be implemented identically in Astryx Stage; arbitrary worklet code cannot. The swipe row draws system-style actions itself because UIKit's swipe actions (`UIContextualAction`) exist only in `UITableView` and `UICollectionView` list cells and Android's `ItemTouchHelper` only in `RecyclerView`, and React Native lists are neither. |
| Pan and zoom, zoomable pager (`PanZoomView`, `ZoomPager`) | React Native's ScrollView zooms on iOS (`maximumZoomScale`); react-native-pager-view pages natively; zoom and image-viewer libraries built on the gesture handler and reanimated cover pinch, pan, and dismiss.                                                                 | ScrollView zoom is iOS only and has no camera API, and the pager view has no zoom. The zoom libraries carry the worklet dependency above. Astryx needs a programmatic camera whose animation resolves once, per-frame values for the native driver, iOS 26 back-swipe arbitration, and Stage parity. The create command's `gallery` and `maps` templates use them.                                                                                                                                                                                                                                                                                                                                                                              |
| System drag and drop (`DragItem`, `DropZone`)             | Reordering libraries (for example react-native-draggable-flatlist) move a view inside the app with the gesture handler and reanimated, and suit list reordering.                                                                                                                | They move a view inside the app; they do not start a system drag session. The platform's session gives the system lift and preview, arbitration with scroll views and with a context menu on the same item, pointer drags on iPad, VoiceOver's drag and drop actions, and data that travels to other apps.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Who uses it

| Native piece             | Kind                                            | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | What a person sees                                                                                                                                                            |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGestureOwnerView` | native component (Fabric Native Component)      | Every component that declares a drag through the library's drag-owner hook: `Item` (swipe actions), `Slider`, `Switch`, `Toast`, `BottomSheet`, `InlineSheet`, `Carousel`, `Pager`, `Calendar` (month swipe), `ResizeHandle`, `ChipGroup`, `CodeBlock`, and the charts (`BarChart`, `LineChart`, `AreaChart`, `Sparkline`, `DonutChart`) through the shared chart frame; horizontal scrollers (`ScrollableArea`, `TabList`, `Table`, `TopNav`, `Stack`, `PowerSearch`, Markdown tables) through the shared owned scroll view. `AstryxAppRoot` and `NativeHostsProvider` supply the frame. | A drag on a slider, a swipe row, or a carousel stays with that control; a drag elsewhere goes back a screen; a carousel at its leading edge hands the drag to the back swipe. |
| `AstryxGestureRootView`  | native component (Fabric Native Component), iOS | `AstryxAppRoot` and `NativeHostsProvider`, around the whole app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The tap that closes a system menu does not also press the row under it.                                                                                                       |
| `AstryxTouchShieldView`  | native component (Fabric Native Component)      | No Astryx component; app API only (the Astryx app's component inspector uses it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | While inspecting, a tap selects a control instead of toggling it; scrolling still works.                                                                                      |
| `AstryxDragItem`         | native component (Fabric Native Component)      | `Draggable`, `ReorderableList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A held card lifts with the system preview and follows the finger, also into another app.                                                                                      |
| `AstryxDropZone`         | native component (Fabric Native Component)      | `DropZone`, `ReorderableList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A column shows where the card lands, scrolls at its edges, and takes the drop.                                                                                                |
| `AstryxDragSnap`         | native component (Fabric Native Component)      | `BottomSheet` (and the components that render one, such as `ActionSheet`, `Selector`, `DropdownMenu`, `CommandPalette`, `DateInput`), `InlineSheet`, `Toast`.                                                                                                                                                                                                                                                                                                                                                                                                                             | A sheet follows the finger, rubber-bands at its ends, and snaps to a stop; a notification flicks away.                                                                        |
| `AstryxSwipeRow`         | native component (Fabric Native Component)      | `Item` rows with swipe actions; `List`, `CheckboxList`, `RadioList`, `TreeList`, and `Selector` render their rows with `Item`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A row slides open to show its actions, or a full swipe fires the outer action.                                                                                                |
| `AstryxPanZoomView`      | native component (Fabric Native Component)      | No Astryx component; app API on the `./controls` entry. The create command's `maps` template uses it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A map-like canvas or a large diagram pans with a glide and zooms about the fingers.                                                                                           |
| `AstryxZoomPager`        | native component (Fabric Native Component)      | No Astryx component; app API on the `./controls` entry. The create command's `gallery` template uses it. `Lightbox` zooms with React Native's ScrollView.                                                                                                                                                                                                                                                                                                                                                                                                                                 | A full-screen photo viewer pages, zooms, and closes on a drag down.                                                                                                           |

## Non-goals

- Web gestures and Core's public gesture hooks, which `spec:AST-107` owns.
- Each component's gesture numbers (detents, thresholds, springs, durations);
  the component's own record owns them and passes them as `metrics`.
- The native stack's back gesture itself, the menu hosts, and the presentation
  hosts, which the Navigation hosts and the Menus and presentation records own.
  This record owns only how a drag yields to them.
- React Native's Animated and its native driver, beyond the event route FR2
  depends on.
- Equivalent internal implementations remain valid when they satisfy this contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol. In that case, state who depends on it and why an equivalent
  implementation would not satisfy the contract.

## Requirements

- **FR1 — Motion runs on the UI thread.** Drag, fling, snap, spring, rubber
  band, pan, glide, zoom, and paging run inside the native view on the UI
  thread, including interruption at touch-down (a touch on a settling view holds
  it). JavaScript only sets targets (props and commands) and receives milestone
  events, each a direct event with one object argument: a state change, a
  threshold crossing (once per crossing, with hysteresis), a settle, a commit,
  a dismiss, a camera at rest. No event reaches JavaScript once per frame unless
  the caller adds its own listener to a driven value.
- **FR2 — Frame events feed only Animated's native driver.** The frame events
  `onDragFrame`, `onSwipeFrame`, `onCameraFrame`, and `onPagerFrame` drive the
  `Animated.Value`s a caller passes (`x`, `y`, `progress`, `offset`, `strip`,
  `zoomScale`, `values`, and so on) through the native driver.
  - The wrapper attaches the mapping with `Animated.attachNativeEvent` on the
    host view's native tag while the view and the values stay the same, and
    detaches it on change and unmount. It never passes an `Animated.event` prop:
    an animated component adds a JavaScript listener to each mapped value, which
    makes the native driver send every frame to JavaScript. Components depend on
    this route to keep JavaScript idle during a gesture.
  - The view keeps one hidden consumer of each driven value for its whole life,
    so the value's native node, and the event's target, stay the same whatever
    the caller mounts and unmounts.
  - On iOS the frame is posted on the event-dispatcher route that Animated's
    native driver observes (a Fabric direct event when the C++ Animated backend
    is on); on Android it is an ordinary event that the native animated module
    maps before JavaScript.
  - A driven value's JavaScript copy keeps the last value JavaScript gave it, or
    a native animation's end value.
  - `PanZoomView` sends `onCameraFrame` only while values are given
    (`cameraFramesEnabled`), once per camera change, once with the current
    camera when frames turn on, and never at rest.
- **FR3 — Components declare the drags they own.** `GestureOwnerView` (on `.`,
  probe `isGestureOwnerAvailable()`) is the touch frame of a component's drag.
  `owns` names the physical directions (`left`, `right`, `up`, `down`) a drag
  that starts on the frame belongs to the component. `releasesScroll` marks a
  frame around a horizontal scroller: `owns` then names the directions it can
  still scroll, and a horizontal drag the other way makes the scroller's pan
  fail. `ownsEdge` makes the screen-edge back swipe yield as well.
  `backGesture` (`always`, `atLeadingEdge`, `never`) says when the back gesture
  may begin on a drag that starts in the frame; undeclared, the frame says
  nothing.
  - The innermost frame under the touch wins by hit-testing; nesting needs no
    depth.
  - iOS: the content-wide back swipe, every enclosing pan (a scroll view's,
    UIKit's sheet drag, the drag-and-snap view, the swipe row, the zoom pager)
    wait for the frame's recognizer, which begins only for an owned direction.
    The screen-edge back swipe waits only for an `ownsEdge` frame. The stack's
    per-screen back-swipe gate reads the nearest frame that declares
    `backGesture`.
  - Android: the drag-and-snap view, the swipe row, and the zoom pager leave the
    drag to an owner of its direction, enclosing scroll views are stopped from
    intercepting, and an `ownsEdge` frame that owns a horizontal direction
    excludes its bounds from the system back gesture (at most 200 dp per edge,
    the system's limit).
  - The library's drag-owner hook feeds one answer to both the JavaScript
    gesture-ownership protocol and the frame. `AstryxAppRoot` supplies the
    native frame; without a provider the frame is a plain View.
  - A drag-and-snap view sits inside any owner frame that claims the same axis,
    never around it.
  - The contract's `strategy` prop is accepted and ignored.
- **FR4 — The app root keeps a menu's dismiss tap from pressing content.** On
  iOS, `GestureRootView` (probe `isGestureRootAvailable()`) wraps the app as a
  `flex: 1` view whose one recognizer never takes a touch. When a touch starts
  while a system menu is on screen, it cancels React Native's handling of that
  touch, so no press under the menu fires, as UIKit's own controls behave.
  Elsewhere it renders its children unchanged. `AstryxAppRoot` places it
  directly under the app's root view.
- **FR5 — Drag and snap.** `DragSnapView` (`./controls`, probe
  `isDragSnapViewAvailable()`; the library reads it through
  `useNativeDragSnap()`) moves its children along one axis between `detents`.
  - Props: `axis` (`vertical`, `horizontal`, or `either`, which locks to the
    dominant axis at the claim), `detents`, `index`, `vertical` and
    `horizontal` edges (free, held, or rubber-banded past the end detents, and a
    dismiss line on each side), `canDismiss`, `isReduceMotion`, `isEnabled`,
    `isRTL`, `isScrollHandoff` (scroll-to-expand with a nested vertical scroll
    view), and `metrics` (claim, vertical intent, release projection, one stop
    per fling, flick, rubber band, spring).
  - Handle (`ref`): `snapTo({index, isAnimated})` and `placeAt({position,
index})`. Events: `onDragStateChange` (`dragging`, `settling`, `idle`,
    with the locked axis), `onSnap` (`index`, `isChosen`: a drag, not a command,
    chose it), `onDismiss` (axis and direction; the view holds where it was let
    go and the component runs its exit), `onDismissAttempt` (a dismissing
    release with `canDismiss` false settles back), and `onThresholdCross` (the
    release target changes during a drag: a detent or `'dismiss'`, 4 dp past
    each boundary, never per frame, on settle, or for a command).
  - A release is judged where it would coast, one stop per fling; past the ends
    the view follows UIScrollView's rubber band.
- **FR6 — Swipe row.** `SwipeRowView` (`./controls`, probe
  `isSwipeRowViewAvailable()`; the library reads it through
  `useNativeSwipeRow()`) runs a row's horizontal swipe over its panels.
  - Props: `leadingWidth`, `trailingWidth`, `behavior` (`reveal` rests open,
    `commit` only fires or closes), `isRTL`, `isReduceMotion`, `isEnabled`,
    `leadingDrag` and `trailingDrag` (`panel` takes a drag toward a side with a
    panel; `none` never takes it, so an enclosing gesture such as the iOS back
    swipe has it; `hold` takes it and only rubber-bands), and `metrics` (axis
    lock, commit point, rest fraction, overshoot resistance, fling, slide-out,
    spring). An open or moving row takes either direction.
  - A vertical drag stays the list's. Handle: `snapTo({index})` with
    `SWIPE_ROW_SNAP` (`closed`, `leading`, `trailing`, `leadingOut`,
    `trailingOut`). Events: `onBegin`, `onThreshold` (`isArmed`), `onSettle`,
    `onCommit` (the component fires its outer entry).
- **FR7 — Pan and zoom surface.** `PanZoomView` (`./controls`, probe
  `isPanZoomViewAvailable()`) lays its children out at scale 1 in
  `contentSize` and moves them through a camera: the content point at the
  viewport's centre and the scale, clamped to the content's edges.
  - One finger pans with the platform's deceleration (`decelerationRate`
    `normal` or `fast`), two fingers zoom about the fingers (rubber-banded past
    `minScale` and `maxScale`, eased back), a double-tap zooms in by
    `doubleTapScale`, and a two-finger tap zooms out.
  - Handle: `animateTo({x, y, scale, durationMs, easing})` runs natively and
    resolves exactly once with `isFinished` (false when a touch, a newer
    `animateTo`, or `setCamera` interrupts it); `setCamera(camera)` jumps;
    `getCamera()` returns the last reported camera. `initialCamera` applies
    once.
  - Events: `onCameraChange` when the camera comes to rest (`isSettled`,
    `reason`: `gesture`, `animation`, `set`), and while it moves only with
    `cameraChangeInterval` > 0, at most once per that many ms. `onTap` is a
    single tap no child took, sent after the double-tap window and never for a
    pan, a pinch, a two-finger tap, or a touch that stopped a glide; a pressed
    child keeps its press. `isEnabled` false turns gestures off; the handle
    still works.
  - FR7 gap: on Android a two-finger tap does not zoom out.
- **FR8 — Zoomable pager.** `ZoomPagerView` (`./controls`, probe
  `isZoomPagerViewAvailable()`; `useNativeZoomPager()`) runs a full-screen
  media pager over its strip and pages: interruptible paging with a velocity
  snap and a rubber band past the ends, pinch about the fingers, double-tap
  zoom (`doubleTapCenters` centres the tapped point), a clamped, rubber-banded
  pan while zoomed that glides on release (`decelerationRate`) and turns the
  page well past an edge, drag-to-dismiss and swipe-up at 1×, and taps after the
  double-tap window.
  - Props: `count`, `index`, `viewport`, `contentSize`, `isRTL`,
    `isReduceMotion`, `isEnabled`, `metrics`, `dismissDirections` (`down` or
    `downOrRight`), and `panRequiresTwoFingers` (a single-image viewer: one
    finger never pans or pages; a drag toward the trailing side is the iOS back
    swipe where it can begin, else the close). Driven values: `strip`,
    `zoomScale`, `zoomX`, `zoomY`, `dragX`, `dragY`, `dismissProgress`.
  - Handle: `setIndex`, `resetZoom`, `toggleZoom(point)`, `zoomTo`. Events:
    `onIndexChange`, `onZoom`, `onDismiss`, `onTap`, `onSwipeUp`.
- **FR9 — System drag and drop.** `NativeDragItemView` and
  `NativeDropZoneView` (on `.`, probes `isNativeDragItemViewAvailable()` and
  `isNativeDropZoneViewAvailable()`; the library reads both through
  `useNativeDragDrop()`) run a system drag session. They are present together
  or not at all.
  - A drag item lifts on a held press with the system preview (its snapshot
    inside `previewCornerRadius`) and haptic, and travels as the session's local
    item (`itemId`, `itemType`) and, with `itemText`, as plain text for other
    apps (`crossApp`) and text fields. iOS arbitrates the lift with scroll views
    and with a context menu on the same item (a still hold opens the menu;
    moving after the lift drags) and drags with a pointer on iPad. Events:
    `onLift`, `onStart`, and always one `onEnd` (`operation` `move`, `copy`, or
    `cancel`; `dropped`) per lift, also for a lift released without a drag.
  - A drop zone accepts items whose `itemType` is in `acceptTypes` (empty: any)
    and, with `acceptsText`, plain text from other apps; the others are
    refused. It reports `onEnter`, `onMove` (at most once per frame, only when
    the location changes), `onLeave`, and `onPerform` (with `text`) in its own
    coordinates (dp from its top-left); JavaScript decides what a location
    means. `dropOperation` (`move`, `copy`) is the operation a drop performs.
    With `autoScrollEdge` > 0, a drag within that band of the nearest enclosing
    scroll view's visible edge scrolls it, faster nearer the edge. The innermost
    accepting zone gets the events, never its ancestors. A drop from another app
    has an empty `itemId`.
- **FR10 — Native contracts.** The group's contracts are native components
  (Fabric Native Components) generated from codegen specs:

  | Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Commands                                        | Events                                                                                                       | Platforms    |
  | ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
  | `AstryxGestureOwnerView` | native component (Fabric Native Component) | `ownsLeft`, `ownsRight`, `ownsUp`, `ownsDown`, `releasesScroll`, `ownsEdge`, `backGesture`, `strategy`                                                                                                                                                                                                                                                                                                                                                                                                     | none                                            | none                                                                                                         | iOS, Android |
  | `AstryxGestureRootView`  | native component (Fabric Native Component) | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                            | none                                                                                                         | iOS          |
  | `AstryxDragItem`         | native component (Fabric Native Component) | `dragEnabled`, `itemId`, `itemType`, `itemText`, `crossApp`, `previewCornerRadius`                                                                                                                                                                                                                                                                                                                                                                                                                         | none                                            | `onDragItemLift`, `onDragItemStart`, `onDragItemEnd`                                                         | iOS, Android |
  | `AstryxDropZone`         | native component (Fabric Native Component) | `dropEnabled`, `acceptTypes`, `acceptsText`, `dropOperation`, `autoScrollEdge`                                                                                                                                                                                                                                                                                                                                                                                                                             | none                                            | `onDropZoneEnter`, `onDropZoneMove`, `onDropZoneLeave`, `onDropZonePerform`                                  | iOS, Android |
  | `AstryxDragSnap`         | native component (Fabric Native Component) | `dragAxis`, `detents`, `restIndex`, `verticalBefore`, `verticalAfter`, `verticalDismissBefore`, `verticalDismissAfter`, `horizontalBefore`, `horizontalAfter`, `horizontalDismissBefore`, `horizontalDismissAfter`, `canDismiss`, `reduceMotion`, `dragEnabled`, `rtl`, `scrollHandoff`, `claim`, `verticalIntent`, `projectionFactor`, `projectionMinTravel`, `stepPerFling`, `flickVelocity`, `flickMinTravel`, `rubberDimension`, `rubberCoefficient`, `springStiffness`, `springDamping`, `springMass` | `snapTo`, `placeAt`                             | `onDragFrame`, `onDragStateChange`, `onDragSnap`, `onDragDismiss`, `onDragDismissAttempt`, `onDragThreshold` | iOS, Android |
  | `AstryxSwipeRow`         | native component (Fabric Native Component) | `leadingWidth`, `trailingWidth`, `swipeBehavior`, `rtl`, `reduceMotion`, `swipeEnabled`, `leadingDrag`, `trailingDrag`, `axisLock`, `commitPastPanel`, `commitFraction`, `restFraction`, `overshootResistance`, `flingVelocity`, `flingMin`, `slideOutOvershoot`, `slideOutMs`, `springStiffness`, `springDamping`, `springMass`                                                                                                                                                                           | `snapTo`                                        | `onSwipeFrame`, `onSwipeBegin`, `onSwipeThreshold`, `onSwipeSettle`, `onSwipeCommit`                         | iOS, Android |
  | `AstryxPanZoomView`      | native component (Fabric Native Component) | `contentWidth`, `contentHeight`, `minScale`, `maxScale`, `initialX`, `initialY`, `initialScale`, `doubleTapScale`, `decelerationRate`, `cameraChangeInterval`, `reduceMotion`, `panZoomEnabled`, `cameraFramesEnabled`                                                                                                                                                                                                                                                                                     | `animateTo`, `setCamera`                        | `onCameraChange`, `onCameraFrame`, `onCameraAnimationEnd`, `onTap`                                           | iOS, Android |
  | `AstryxZoomPager`        | native component (Fabric Native Component) | `count`, `pagerIndex`, `viewportWidth`, `viewportHeight`, `contentWidth`, `contentHeight`, `rtl`, `reduceMotion`, `pagerEnabled`, `zoomMax`, `doubleTapZoom`, `pinchSlack`, `rubber`, `pageShare`, `pageFling`, `dismissDistance`, `dismissFling`, `dismissRight`, `panRequiresTwoFingers`, `doubleTapCenters`, `dismissDistanceRight`, `dismissFlingRight`, `panPageShare`, `slop`, `doubleTapMs`, `pageMs`, `zoomMs`, `decelerationRate`                                                                 | `setIndex`, `resetZoom`, `toggleZoom`, `zoomTo` | `onPagerFrame`, `onPagerIndexChange`, `onPagerZoom`, `onPagerDismiss`, `onPagerTap`, `onPagerSwipeUp`        | iOS, Android |

  Positions and widths are dp, velocities dp/ms, durations ms. A dismiss line
  at ±1e9 or beyond is none.

- **FR11 — An absent view degrades without dropping content.** Where a native
  view is absent (the web, the test host, a binary without it), its probe
  answers false and the wrapper renders the children in a plain View with the
  same layout, test id, and accessibility props, with no gesture
  (`spec:AST-112/FR7`). A command on an absent view does nothing and throws
  nothing.
  - `BottomSheet`, `InlineSheet`, and `Toast` without the drag-and-snap view
    run their drawn drag only under the test host. On a device they rest at
    their stop, take no drag, keep their accessibility actions, and warn once in
    development: drag motion never runs frame by frame in JavaScript.
  - `Item` without the swipe row, and `Draggable`, `DropZone`, and
    `ReorderableList` without the drag-and-drop views, draw their gesture in
    JavaScript (OQ2).
- **FR12 — Every gesture has a non-gesture alternative.**
  - Drag and snap: the view itself stays neutral; the component makes its
    focused element (a sheet's grabber) adjustable through the library's
    drag-snap accessibility helper. Its value is the stop's name; increment
    moves one stop toward the first detent and decrement one stop away
    (VoiceOver's swipe up and down, TalkBack's adjust actions); a dismissible
    view adds a labelled dismiss action and wires the iOS escape gesture to it.
    On iOS a still hold on a row inside the view shows the large content viewer
    at accessibility text sizes, and a hold that then moves begins the drag.
  - Swipe row: every enabled swipe entry is an accessibility action on the row;
    the panels are hidden from assistive technology.
  - Pan and zoom: by default a container whose children stay reachable; with
    `accessible`, one adjustable element whose increment and decrement zoom by
    `doubleTapScale` through `animateTo` and whose value is the zoom as a locale
    percent. The caller's own actions are merged, and its increment or
    decrement replaces the view's.
  - Zoomable pager: one adjustable element by default. The caller passes next
    and previous (increment, decrement), zoom, and escape actions; a pager with
    none warns once in development that paging and zoom are gesture-only.
  - Drag and drop: on iOS a drag item exposes VoiceOver's Drag action and a drop
    zone its drop points; on both platforms `Draggable`'s move actions and
    `ReorderableList`'s Move up, Move down, Move to top, and Move to bottom
    actions run what the drag runs.
  - The views draw no text of their own, so Dynamic Type and font scale apply
    to the children as elsewhere.
- **FR13 — Reduce Motion and right-to-left.** Under Reduce Motion every settle,
  page turn, zoom change, and camera animation jumps to its end and still sends
  its events (`animateTo` resolves finished). The library passes the system
  setting as `isReduceMotion`; `PanZoomView` also reads the system setting
  itself (iOS Reduce Motion, Android's animator duration scale 0). Under
  `isRTL` a horizontal drag-and-snap axis mirrors its ends, a swipe row's
  leading side is on the right, and the zoom pager pages right to left. The back
  direction is the trailing direction (right, left under right-to-left).
- **FR14 — Contract baseline.** Every contract in this group is at revision 1,
  and FR3 to FR10 describe revision 1. A behaviour added after revision 1 is a
  named feature (`<Contract>.<feature>`) that the binary lists and the
  JavaScript checks with `hasContractFeature` before it uses it; without it the
  JavaScript keeps the revision-1 behaviour or answers `unsupported`, and warns
  once, never a silent weaker path. These contracts list no named features.
  Compatibility with Astryx Stage goes through the library's Stage version
  floor: the package names the oldest Stage that implements its contract set,
  and an older Stage refuses the project with the gaps listed.
- **FR15 — The group's native code links by default.** The native half of
  these pieces is part of Astryx's own components, so every app built with the
  package links it without opting in: `DragSnapView`, `SwipeRowView`,
  `PanZoomView`, and `ZoomPagerView` as well as the core's gesture owner, gesture
  root, and drag-and-drop views. An app may opt out; its components then follow
  FR11.
  - FR15 gap: the drag-and-snap, swipe-row, pan-zoom, and zoom-pager views link
    only when the app opts the `controls` capability in (`spec:AST-112/FR3`).
- **FR16 — Native code uses public platform API only.** The views use public
  UIKit and Android framework API, and React Native's own touch handler and
  event routes. One exception: the iOS gesture root (FR4) recognizes an open
  system menu by the class name of UIKit's private context-menu container,
  because UIKit offers no public query for a presented bar-button menu. It only
  reads the name and calls nothing private; when the name is absent, the guard
  does nothing and never blocks a touch.

### Platform support

| Contract                 | iOS                                                                                                                 | Android                                                                                                                                                         | Astryx Stage                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `AstryxGestureOwnerView` | A blocking pan recognizer; the stack's back swipes, scroll views, and UIKit's sheet drag wait through its delegate. | Owner lookup by the gesture views, `requestDisallowInterceptTouchEvent`, `View.setSystemGestureExclusionRects` for `ownsEdge`. `backGesture` is not read (OQ3). | Both looks.                                                         |
| `AstryxGestureRootView`  | A recognizer that never begins and cancels React Native's touch for a menu's dismiss tap.                           | None: the contract is iOS only, and the wrapper renders its children.                                                                                           | iOS look.                                                           |
| `AstryxDragItem`         | `UIDragInteraction` (enabled on iPhone), lift preview, `accessibilityDragSourceDescriptors`.                        | `View.startDragAndDrop` with a `ClipData`, a `DragShadowBuilder`, `DRAG_FLAG_GLOBAL` for `crossApp`.                                                            | Both looks: a held press lifts, the item follows finger or pointer. |
| `AstryxDropZone`         | `UIDropInteraction` with a `UIDropProposal`, `accessibilityDropPointDescriptors`, auto-scroll.                      | `View.OnDragListener`, auto-scroll on the nearest scrollable ancestors.                                                                                         | Both looks.                                                         |
| `AstryxDragSnap`         | A UIKit pan (its threshold is the claim), UIScrollView's rubber band, spring settle.                                | Touch-slop claim (`claim`), the same release rules and spring.                                                                                                  | Both looks, the same rules.                                         |
| `AstryxSwipeRow`         | A pan with an axis gate, velocity-aware release, spring and slide-out.                                              | The same rules.                                                                                                                                                 | Both looks.                                                         |
| `AstryxPanZoomView`      | `UIScrollView` deceleration and rubber band; double tap and two-finger tap recognizers.                             | `OverScroller` fling, `ScaleGestureDetector`, `GestureDetector` taps, `ValueAnimator`. No two-finger tap (FR7 gap).                                             | Both looks.                                                         |
| `AstryxZoomPager`        | Paging, pinch, glide (UIScrollView's deceleration rates), iOS 26 back-swipe arbitration.                            | The same rules; the trailing-side drag closes.                                                                                                                  | Both looks.                                                         |

- Supported feature/engine floor: the floor of `spec:AST-112` (React Native's
  New Architecture; iOS at React Native's minimum; Android API level 24). The
  iOS content-wide back swipe applies from iOS 26.
- Unsupported behavior: an absent view reports itself unavailable and renders
  its children without a gesture (FR11); a behaviour a binary lacks follows
  FR14.
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, devices, and Astryx Stage (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112` FR1 (the gesture owner and gesture root hosts of the
  core), FR6, FR7, FR8, and FR12 for this group.
- Changes `spec:AST-112` FR1 and FR3: the swipe-row, drag-and-snap, zoom-pager,
  and pan-zoom views are the native half of Astryx's own components, so they
  link by default (FR15) instead of through the opt-in `controls` capability.
  Their JavaScript stays on the `./controls` entry.
- No other record changes.

## Verification

| Contract | Verification                                                                                                                     | Representative states                                                                                                          | Mutation or failure expectation                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| FR1      | UI-thread frame checks on the Simulator, the emulator, and Astryx Stage: JavaScript wakes counted during a drag and its settle   | a sheet drag and fling; a swipe-row commit; a pinch; a page turn                                                               | Any JavaScript wake per frame during a gesture or its settle                                                                  |
| FR2      | Unit tests of each wrapper through the `./testing` doubles; frame checks on device builds                                        | values given and not; values changed; a consumer remounted; frames turned on                                                   | An `Animated.event` prop, a frame listener added in JavaScript, a value that stops following after a remount, a frame at rest |
| FR3      | Astryx Stage contract suites and Simulator and emulator checks of back swipes against owner frames                               | a slider at the screen edge; a carousel at its leading edge; a toast dragged toward its edge; `backGesture` values             | A back swipe takes an owned drag, an edge swipe ignores `ownsEdge`, or an owned frame blocks an unowned drag                  |
| FR4      | Simulator and Astryx Stage checks with a system menu open                                                                        | the dismiss tap over a pressable row; the root absent                                                                          | The row's press fires on the dismiss tap                                                                                      |
| FR5–FR8  | Unit tests of the shared rules and wrappers through `./testing` doubles; Astryx Stage suites; Simulator and emulator checks      | fling, slow drag, interrupt, dismiss, threshold; reveal and commit; pan, pinch, tap, glide; paging, zoom, dismiss, two fingers | A release settles on another stop than the rules choose, an event fires per frame, or a command sends a milestone it must not |
| FR9      | Astryx Stage suites and Simulator and emulator checks with two apps                                                              | a held lift; a quick drag that scrolls; nested zones; a refused type; text from another app; a lift released without a drag    | No `onEnd` after a lift, an ancestor zone gets the events, or a refused item is accepted                                      |
| FR10     | The platform's spec rules check over the codegen specs and the contract list                                                     | each contract's props, commands, events, platforms                                                                             | A contract differs from the table                                                                                             |
| FR11     | Unit tests with each view absent through the `./testing` doubles                                                                 | absent view; command on an absent view; a device build without the drag-and-snap view                                          | Children dropped, a throw, or a JavaScript-driven drag on a device                                                            |
| FR12     | VoiceOver and TalkBack checks on the Simulator, the emulator, and devices; unit tests of the accessibility props                 | sheet stops; swipe entries; zoom; drag item and drop zone; a shielded control                                                  | A gesture with no accessibility action, or an action that does something other than the gesture                               |
| FR13     | Unit tests and Astryx Stage suites with Reduce Motion and right-to-left                                                          | each settle under Reduce Motion; each horizontal gesture under right-to-left                                                   | An animated settle under Reduce Motion, a missing event, or an unmirrored horizontal gesture                                  |
| FR14     | Unit tests of `hasContractFeature` through the `./testing` doubles (absent, older, and current shapes); Astryx Stage floor check | a binary without a named feature; a Stage below the floor                                                                      | A silent weaker path, or an older Stage that runs the project                                                                 |
| FR15     | A built app without any capability opted in: binary symbols and registered components                                            | the four gesture views                                                                                                         | A gesture view missing from a default build                                                                                   |
| FR16     | Source review of the iOS and Android views; an iOS build with the private class name absent                                      | each view; the gesture root with no menu container found                                                                       | A private API call, or a gesture root that blocks a touch when the name is absent                                             |

## Decision log

### DEC-1 — Gesture motion runs only on the UI thread

**Reference:** `spec:AST-124/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A drag that waits for JavaScript drops frames whenever JavaScript is busy, so
every Astryx gesture runs in a native view and JavaScript sees only its
milestones. A sheet or a toast without its native view on a device takes no
drag rather than moving frame by frame in JavaScript.

Rejected: a JavaScript responder fallback on devices, because it ships the
dropped frames this record exists to avoid.

### DEC-2 — Frame events reach Animated through native attachment

**Reference:** `spec:AST-124/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Components bind driven values in native-driver styles. Attaching the frame
event natively keeps JavaScript idle; an `Animated.event` prop would add a
JavaScript listener that wakes JavaScript every frame.

### DEC-3 — Fixed-shape native views, not a worklet runtime

**Reference:** `spec:AST-124/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Each gesture is a native view with declared props, commands, and events whose
rules are ported once per platform and once to Astryx Stage, so Stage can match
iOS and Android exactly and the package keeps React and React Native as its only
peers.

Rejected: building on react-native-reanimated and react-native-gesture-handler,
because arbitrary worklets cannot be reproduced in Astryx Stage and add a second
JavaScript runtime to every app.

### DEC-4 — Components declare ownership; the platform arbitrates

**Reference:** `spec:AST-124/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A component knows from its live state which directions it can use, so it
declares them on its touch frame, and the platform makes its own gestures (back
swipes, scroll views, sheets, the system back gesture) yield. One declaration
feeds both the native frame and the JavaScript protocol, so the two never
disagree.

### DEC-5 — Drag and drop uses the system session

**Reference:** `spec:AST-124/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

The system session gives the lift, the arbitration with scroll views and menus,
the pointer, the screen-reader actions, and cross-app data that an in-app drag
cannot. JavaScript keeps the meaning of a location and of a drop.

## Open questions

- **OQ1 — Does `AstryxTouchShieldView` stay in the platform's core while only
  the Astryx app's component inspector uses it?** (`human-design`) Options:
  keep it in the core as app API, specified in this record; or move it out of
  the package's public surface into the Astryx app.
- **OQ2 — Do `Item` and the drag-and-drop components keep a JavaScript-drawn
  gesture on devices once their native views link by default?**
  (`human-design`) Options: keep the drawn gesture for binaries without the
  views; or follow the drag-and-snap rule (rest, keep the accessibility actions,
  warn in development).
- **OQ3 — What does `backGesture` do on Android?** (`human-design`) Options:
  `never` becomes a system-gesture exclusion over the frame (at most 200 dp per
  edge); or Android keeps ignoring it and only `ownsEdge` excludes.
