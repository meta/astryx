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
build against (`spec:AST-112/FR12`) to eight native components.

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
| `AstryxTouchShieldView`  | native component (Fabric Native Component)      | No Astryx component; the Astryx app's component inspector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | While inspecting, a tap selects a control instead of toggling it; scrolling still works.                                                                                      |
| `AstryxDragItem`         | native component (Fabric Native Component)      | `Draggable`, `ReorderableList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A held card lifts with the system preview and follows the finger, also into another app.                                                                                      |
| `AstryxDropZone`         | native component (Fabric Native Component)      | `DropZone`, `ReorderableList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A column shows where the card lands, scrolls at its edges, and takes the drop.                                                                                                |
| `AstryxDragSnap`         | native component (Fabric Native Component)      | `BottomSheet` (and the components that render one, such as `ActionSheet`, `Selector`, `DropdownMenu`, `CommandPalette`, `DateInput`), `InlineSheet`, `Toast`.                                                                                                                                                                                                                                                                                                                                                                                                                             | A sheet follows the finger, rubber-bands at its ends, and snaps to a stop; a notification flicks away.                                                                        |
| `AstryxSwipeRow`         | native component (Fabric Native Component)      | `Item` rows with swipe actions; `List`, `CheckboxList`, `RadioList`, `TreeList`, and `Selector` render their rows with `Item`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A row slides open to show its actions, or a full swipe fires the outer action.                                                                                                |
| `AstryxPanZoomView`      | native component (Fabric Native Component)      | No Astryx component; app API on the `./controls` entry. The create command's `maps` template uses it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A map-like canvas or a large diagram pans with a glide and zooms about the fingers.                                                                                           |
| `AstryxZoomPager`        | native component (Fabric Native Component)      | `Lightbox` (its public face; internal native contract). The create command's `gallery` template.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A full-screen photo viewer pages, zooms, and closes on a drag down.                                                                                                           |

## Non-goals

- Web gestures and Core's public gesture hooks, which `spec:AST-107` owns.
- The API and behaviour of the library components that use these views
  (`BottomSheet`, `InlineSheet`, `Toast`, `Item`, `List`, `Draggable`,
  `DropZone`, `ReorderableList`, `Lightbox`, and the others under "Who uses
  it"), including their gesture numbers (detents, thresholds, springs,
  durations); each component's own record owns them.
- `AstryxTouchShieldView`: Preview and inspector tooling, part of the Astryx
  app's Preview host (`spec:AST-139`), outside this record.
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

- **FR1 — Motion runs on the UI thread.** Each view in this group tracks the
  touch, decides what it means, and animates the result inside its native
  implementation on the UI thread: drags, flings, rubber bands, springs,
  glides, pinches, and page turns. A touch that lands on a moving view stops it
  where it is. JavaScript controls a view only through its props and commands,
  and hears back through direct events that carry one object and mark an
  outcome: a change of state, a crossed threshold (reported once per crossing,
  with a small dead band so a hovering finger does not repeat it), a resting
  place, a commit, a dismissal, a camera that stopped. No view sends JavaScript
  an event per frame.
- **FR2 — Frame events feed only Animated's native driver.** `onDragFrame`,
  `onSwipeFrame`, `onCameraFrame`, and `onPagerFrame` exist so that
  `Animated.Value`s follow a gesture through React Native's native driver.
  - The platform's wrapper binds a frame event to its values with
    `Animated.attachNativeEvent` on the host view, for as long as the view and
    the values stay the same, and unbinds it on change and unmount. It never
    binds them through an `Animated.event` prop, because an animated
    component's event prop puts a JavaScript listener on every mapped value and
    so delivers every frame to JavaScript.
  - For as long as the view lives, the wrapper keeps one hidden view that
    consumes each bound value, so the value's native node stays the event's
    target when the caller's own consumers mount and unmount.
  - iOS delivers a frame on the route that Animated's native driver observes (a
    Fabric direct event when React Native's C++ Animated backend is on);
    Android delivers an ordinary event that the native animated module consumes
    before JavaScript.
  - The JavaScript side of a bound value holds whatever JavaScript last set, or
    the end of a native animation; a caller that wants every frame adds its own
    listener.
  - `AstryxPanZoomView` sends `onCameraFrame` only while `cameraFramesEnabled`
    is true: once when it turns on, then once for each camera change, and
    nothing while the camera rests.
- **FR3 — A frame declares the drags it owns.** `AstryxGestureOwnerView` marks
  the area a drag starts in.
  - `ownsLeft`, `ownsRight`, `ownsUp`, and `ownsDown` name the physical
    directions whose drags belong to the frame. With `releasesScroll`, the
    frame wraps a horizontal scroller, the `owns*` props name the directions it
    can still scroll, and a horizontal drag in any other direction makes the
    scroller let go. `ownsEdge` extends the claim to the screen-edge back
    swipe. `backGesture` (`always`, `atLeadingEdge`, `never`; `auto` declares
    nothing) states when a back gesture may start from a drag in the frame.
    `strategy` is accepted and has no effect.
  - When frames sit inside one another, the deepest frame under the finger decides; no nesting
    level is passed.
  - iOS: the frame's own recognizer begins only for an owned direction, and
    the content-wide back swipe, enclosing scroll views, UIKit's sheet drag, and
    the drag-and-snap, swipe-row, and zoom-pager views all wait for it to fail
    first. The edge back swipe waits only for a frame with `ownsEdge`. The
    stack host's back-swipe check for a screen reads `backGesture` from the
    nearest frame that sets it.
  - Android: the drag-and-snap, swipe-row, and zoom-pager views leave a drag to
    a frame that owns its direction; enclosing scroll views do not intercept
    it; and a frame with `ownsEdge` that owns a horizontal direction removes its
    bounds from the system back gesture, within the system's limit of 200 dp
    per edge.
  - A drag-and-snap view placed inside a frame that owns the same axis never
    begins its pan.
- **FR4 — A menu's dismiss tap presses nothing below it.** On iOS,
  `AstryxGestureRootView` wraps the app's root content and fills it. Its one
  recognizer never begins. When a touch starts while a system menu is shown,
  it cancels React Native's handling of that touch, so the press under the menu
  does not fire, matching UIKit's own controls. It acts once per shown menu.
- **FR5 — Drag and snap.** `AstryxDragSnap` moves its children along one axis
  and lets them rest only at its `detents`.
  - Stops: a stop is identified by its value, a named stop, never by an index.
    The resting stop, `snapTo`, `onDragSnap`, and `onDragThreshold` take and
    report that value. Any list of stops, `detents` included, is ordered
    ascending by the height the surface shows. A stop's position is in dp along
    the axis (+ down, + right).
  - FR5 gap: the contract identifies stops by index (`restIndex`,
    `snapTo(index, …)`, `onDragSnap`'s `index`, `onDragThreshold`'s `target`)
    and orders `detents` by position along the axis, so a sheet's first stop
    is its tallest.
  - `dragAxis` is `vertical`, `horizontal`, or `either`, which picks the
    dominant axis once the drag is claimed (`claim`, `verticalIntent`). For
    each axis, `*Before` and `*After` say whether travel past the outer
    detents is free, held, or rubber-banded and how far, and `*DismissBefore`
    and `*DismissAfter` place a dismiss line on each side (±1e9 or beyond: no
    line). `canDismiss` false turns a dismissing release into a return.
  - The release chooses a stop from where the surface would coast to
    (`projectionFactor`, `projectionMinTravel`), at most one stop per throw
    with `stepPerFling`, or a dismiss for a fast enough flick toward a line
    (`flickVelocity`, `flickMinTravel`). Past the outer detents the surface
    follows UIScrollView's rubber-band curve (`rubberDimension`,
    `rubberCoefficient`), and it settles on a spring (`springStiffness`,
    `springDamping`, `springMass`). With `scrollHandoff`, a vertical drag passes
    between the view and a nested vertical scroll view.
  - Commands: `snapTo` moves to a stop and then reports `onDragSnap` with
    `chosen` false; `placeAt` sets a displaced starting position, resting on a
    stop, without an event.
  - Events: `onDragStateChange` (`dragging`, `settling`, `idle`, and the
    locked axis); `onDragSnap` (the stop, and `chosen`: a drag, not a command,
    put it there); `onDragDismiss` (axis and direction; the surface stays where it
    was released); `onDragDismissAttempt` (a dismissing release while
    `canDismiss` is false); `onDragThreshold` (during a drag, the stop a release
    would choose changes, reporting that stop or a dismiss, after 4 dp of travel
    past the boundary; never on settle or for a command).
- **FR6 — Swipe row.** `AstryxSwipeRow` slides a row horizontally over the
  panels behind it.
  - `leadingWidth` and `trailingWidth` size the panels (0: no panel).
    `swipeBehavior` `reveal` lets the row rest open; `commit` only fires or
    closes. `leadingDrag` and `trailingDrag` decide what a closed row does with
    a drag toward that side: `panel` takes it when the side has a panel, `none`
    leaves it to an enclosing gesture such as the iOS back swipe (`snapTo` can
    still open that side), and `hold` takes it and only stretches. A row that
    is open or moving takes either direction.
  - A drag that turns out vertical (`axisLock`) belongs to the list. The
    release opens, closes, or commits from the travel and velocity
    (`commitPastPanel`, `commitFraction`, `restFraction`,
    `overshootResistance`, `flingVelocity`, `flingMin`); a commit slides the row
    out (`slideOutOvershoot`, `slideOutMs`); other settles use the spring
    props.
  - Command: `snapTo(index)` with 0 closed, 1 leading open, 2 trailing open, 3
    out past the inline end, 4 out past the inline start. Events:
    `onSwipeBegin` (side), `onSwipeThreshold` (`armed`), `onSwipeSettle`
    (index), `onSwipeCommit` (side).
- **FR7 — Pan and zoom surface.** `AstryxPanZoomView` shows children laid out
  at scale 1 in a `contentWidth` × `contentHeight` world through a camera: the
  content point at the viewport's centre plus a scale, kept within the content.
  - One finger pans and glides on with the platform's deceleration
    (`decelerationRate` `normal` or `fast`). Two fingers zoom around the point
    between them, stretch past `minScale` and `maxScale`, and ease back. A double
    tap multiplies the scale by `doubleTapScale`; a two-finger tap divides it.
    `initialX`, `initialY`, and `initialScale` apply once. `panZoomEnabled`
    false stops gestures but not commands.
  - Commands: `animateTo(animationId, x, y, scale, durationMs, easing)` runs on
    the UI thread and ends with exactly one `onCameraAnimationEnd` (`id`,
    `finished` false when a touch, a newer animation, or `setCamera` cuts it
    short); `setCamera(x, y, scale)` jumps.
  - Events: `onCameraChange` (`x`, `y`, `scale`, `settled`, `reason`
    `gesture`, `animation`, or `set`) when the camera stops, and during motion
    only when `cameraChangeInterval` > 0, no more often than that many ms;
    `onTap` (content and view coordinates) for a one-finger tap that no child
    handled, once the double-tap window has closed, and not for a pan, a pinch,
    a two-finger tap, or a touch that stopped a glide.
  - FR7 gap: on Android a two-finger tap does not zoom out.
- **FR8 — Zoomable pager.** `AstryxZoomPager` drives a full-screen media pager
  over the strip and pages it contains. It is an internal native contract whose
  public face is `Lightbox`.
  - FR8 gap: `Lightbox` zooms with React Native's ScrollView, not the zoom
    pager.
  - Paging can be interrupted, snaps with velocity (`pageShare`, `pageFling`,
    `pageMs`), stretches past the first and last page (`rubber`), and runs
    right to left with `rtl`. Pinch zooms around the fingers up to `zoomMax`
    (`pinchSlack`); a double tap zooms to `doubleTapZoom` (`doubleTapCenters`
    moves the tapped point to the centre). A zoomed page pans within its
    edges, glides on release (`decelerationRate`), and turns the page when
    pushed far past an edge (`panPageShare`).
  - At 1×, a drag down past `dismissDistance` or faster than `dismissFling`
    dismisses; `dismissRight` adds a drag toward the trailing side with its own
    `dismissDistanceRight` and `dismissFlingRight`; an upward release past half
    the viewport reports a swipe up. With `panRequiresTwoFingers`, one finger
    never pans or pages, and a one-finger drag toward the trailing side is the
    iOS back swipe where one can begin, otherwise the close.
  - Commands: `setIndex(index, animated)`, `resetZoom(animated)`,
    `toggleZoom(x, y)`, `zoomTo(scale, x, y, animated)`. Events:
    `onPagerIndexChange`, `onPagerZoom`, `onPagerDismiss`, `onPagerTap` (after
    the double-tap window), `onPagerSwipeUp`.
- **FR9 — System drag and drop.** `AstryxDragItem` and `AstryxDropZone` run the
  platform's drag session; a binary has both or neither.
  - A drag item lifts after a long press, with the system's preview of the
    view clipped to `previewCornerRadius` and the system's haptic. The session
    carries `itemId` and `itemType` inside the app and, when `itemText` is set,
    plain text that text fields and, with `crossApp`, other apps can take. On
    iOS the system settles a lift against scroll views and against a context
    menu on the same view (holding still opens the menu, moving drags) and
    supports pointer drags on iPad. `dragEnabled` false makes it an ordinary
    view. Every lift reports `onDragItemLift`, then `onDragItemStart` if it
    moves, and exactly one `onDragItemEnd` (`operation` `move`, `copy`, or
    `cancel`; `dropped`).
  - A drop zone accepts sessions whose `itemType` appears in `acceptTypes`
    (empty: every type) and, with `acceptsText`, plain text from anywhere;
    other sessions are refused. While a session is over it, the zone reports
    `onDropZoneEnter`, `onDropZoneMove` (only when the point moved, no more than
    once a frame), `onDropZoneLeave`, and `onDropZonePerform` (with `text`), in
    dp from the zone's top-left corner; JavaScript decides what a point means.
    `dropOperation` is `move` or `copy`. With `autoScrollEdge` > 0, hovering
    within that band of the nearest enclosing scroll view's visible edge scrolls
    it, faster closer to the edge. When zones sit inside one another, only the deepest one that
    accepts the session hears it. A drop from another app carries an empty
    `itemId`. `dropEnabled` false lets sessions pass to an enclosing zone.
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

- **FR11 — An absent view keeps its content.** Where a view's native component
  is not registered (the web, the test host, a binary without it), its probe
  (`isGestureOwnerAvailable()`, `isGestureRootAvailable()`,
  `isDragSnapViewAvailable()`, `isSwipeRowViewAvailable()`,
  `isPanZoomViewAvailable()`, `isZoomPagerViewAvailable()`,
  `isNativeDragItemViewAvailable()`, `isNativeDropZoneViewAvailable()`)
  answers false, and the wrapper renders the children in a plain View with the
  same style, test id, and accessibility props and no gesture
  (`spec:AST-112/FR7`). A command sent to an absent view does nothing and
  throws nothing. What a component draws instead is the component's own
  contract (OQ1).
- **FR12 — Accessibility passes through.** Every view forwards the
  accessibility props it is given, custom actions and escape included, so the
  component that uses it offers actions that do what the gesture does; the
  drag-and-snap and swipe-row views add no accessibility element of their own.
  - `AstryxZoomPager`'s wrapper is one adjustable element unless its props say
    otherwise, and warns once in development when it is given no actions.
  - `AstryxPanZoomView`'s wrapper is a container whose children stay reachable;
    marked `accessible`, it is one adjustable element whose increment and
    decrement zoom by `doubleTapScale` and whose value is the zoom as a percent
    in the device's locale. Actions the caller passes are merged, and its own
    increment or decrement wins.
  - On iOS, `AstryxDragItem` offers VoiceOver's drag action and
    `AstryxDropZone` its drop points; on Android the item's accessibility
    actions come from its props.
  - On iOS, at accessibility text sizes, holding still on a row inside a
    drag-and-snap view shows the large content viewer, and moving after the
    hold starts the drag instead.
  - The views draw no text, so Dynamic Type and font scale reach their children
    unchanged.
- **FR13 — Reduce Motion and right-to-left.** With `reduceMotion`, each view
  jumps to the end of a settle, page turn, zoom change, or camera animation
  and still sends the events it would have sent; `animateTo` ends finished.
  `AstryxPanZoomView` also follows the system setting by itself (iOS Reduce
  Motion; Android's animator duration scale 0). With `rtl`, a horizontal
  drag-and-snap axis swaps its ends, a swipe row's leading side is on the
  right, and the pager runs right to left. The back direction is the trailing
  one.
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
| `AstryxGestureOwnerView` | A blocking pan recognizer; the stack's back swipes, scroll views, and UIKit's sheet drag wait through its delegate. | Owner lookup by the gesture views, `requestDisallowInterceptTouchEvent`, `View.setSystemGestureExclusionRects` for `ownsEdge`. `backGesture` is not read (OQ2). | Both looks.                                                         |
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
  The drag-and-snap, swipe-row, and pan-zoom views stay on the `./controls`
  entry; the zoom pager is internal (FR8).
- No other record changes.

## Verification

| Contract | Verification                                                                                                                     | Representative states                                                                                                                                                 | Mutation or failure expectation                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| FR1      | UI-thread frame checks on the Simulator, the emulator, and Astryx Stage: JavaScript wakes counted during a drag and its settle   | a sheet drag and fling; a swipe-row commit; a pinch; a page turn                                                                                                      | Any JavaScript wake per frame during a gesture or its settle                                                                  |
| FR2      | Unit tests of each wrapper through the `./testing` doubles; frame checks on device builds                                        | values given and not; values changed; a consumer remounted; frames turned on                                                                                          | An `Animated.event` prop, a frame listener added in JavaScript, a value that stops following after a remount, a frame at rest |
| FR3      | Astryx Stage contract suites and Simulator and emulator checks of back swipes against owner frames                               | a slider at the screen edge; a carousel at its leading edge; a toast dragged toward its edge; `backGesture` values                                                    | A back swipe takes an owned drag, an edge swipe ignores `ownsEdge`, or an owned frame blocks an unowned drag                  |
| FR4      | Simulator and Astryx Stage checks with a system menu open                                                                        | the dismiss tap over a pressable row; the root absent                                                                                                                 | The row's press fires on the dismiss tap                                                                                      |
| FR5–FR8  | Unit tests of the shared rules and wrappers through `./testing` doubles; Astryx Stage suites; Simulator and emulator checks      | stops by value; fling, slow drag, interrupt, dismiss, threshold; reveal and commit; pan, pinch, tap, glide; paging, zoom, dismiss, two fingers                        | A release settles on another stop than the rules choose, an event fires per frame, or a command sends a milestone it must not |
| FR9      | Astryx Stage suites and Simulator and emulator checks with two apps                                                              | a held lift; a quick drag that scrolls; nested zones; a refused type; text from another app; a lift released without a drag                                           | No `onEnd` after a lift, an ancestor zone gets the events, or a refused item is accepted                                      |
| FR10     | The platform's spec rules check over the codegen specs and the contract list                                                     | each contract's props, commands, events, platforms                                                                                                                    | A contract differs from the table                                                                                             |
| FR11     | Unit tests with each view absent through the `./testing` doubles                                                                 | each absent view; a command sent to an absent view                                                                                                                    | Children dropped, a probe that answers true, or a throw                                                                       |
| FR12     | VoiceOver and TalkBack checks on the Simulator, the emulator, and devices; unit tests of forwarded accessibility props           | actions passed to each view; the pager and the pan-zoom surface as adjustable elements; drag item and drop zone; the large content viewer inside a drag-and-snap view | An accessibility prop not forwarded, or an adjustable that does something other than its gesture                              |
| FR13     | Unit tests and Astryx Stage suites with Reduce Motion and right-to-left                                                          | each settle under Reduce Motion; each horizontal gesture under right-to-left                                                                                          | An animated settle under Reduce Motion, a missing event, or an unmirrored horizontal gesture                                  |
| FR14     | Unit tests of `hasContractFeature` through the `./testing` doubles (absent, older, and current shapes); Astryx Stage floor check | a binary without a named feature; a Stage below the floor                                                                                                             | A silent weaker path, or an older Stage that runs the project                                                                 |
| FR15     | A built app without any capability opted in: binary symbols and registered components                                            | the four gesture views                                                                                                                                                | A gesture view missing from a default build                                                                                   |
| FR16     | Source review of the iOS and Android views; an iOS build with the private class name absent                                      | each view; the gesture root with no menu container found                                                                                                              | A private API call, or a gesture root that blocks a touch when the name is absent                                             |

## Decision log

### DEC-1 — Gesture motion runs only on the UI thread

**Reference:** `spec:AST-124/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A drag that waits for JavaScript drops frames whenever JavaScript is busy, so
every Astryx gesture runs in a native view and JavaScript sees only its
outcomes. The platform offers no variant of these gestures that JavaScript
drives frame by frame.

Rejected: a JavaScript-driven mode in the platform's views, because it ships
the dropped frames this record exists to avoid.

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

- **OQ1 — Do `Item` and the drag-and-drop components keep a JavaScript-drawn
  gesture on devices where the native view is absent?** (`human-design`)
  Options: keep the drawn gesture for binaries without the views; or take no
  drag there and keep only the accessibility actions, with a development
  warning.
- **OQ2 — What does `backGesture` do on Android?** (`human-design`) Options:
  `never` becomes a system-gesture exclusion over the frame (at most 200 dp per
  edge); or Android keeps ignoring it and only `ownsEdge` excludes.
- **OQ3 — Does `AstryxPanZoomView` stay in the default link set while no
  Astryx component uses it?** (`human-design`) Options: keep it linked by
  default as app API on `./controls`; or link it only when an app opts in.
