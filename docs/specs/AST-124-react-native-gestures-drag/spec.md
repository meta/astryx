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
own physics, and runs independently of JavaScript, because it runs on the UI
thread inside a native view. JavaScript sets targets (props and commands) and receives
settled events (a stop reached, a row committed, a camera at rest). A drag
that starts on an Astryx control belongs to that control, and the system's back
gesture, scroll views, and sheets take every other drag as they do in a native
app.

This record details the gesture and drag pieces of the platform layer that
`spec:AST-112` defines, under the shared platform code rules of `spec:AST-140`:
it applies the result vocabulary (`spec:AST-140/FR3`), the capability shape
(`spec:AST-112/FR7`), growth by named features (`spec:AST-140/FR5`), and
threading (`spec:AST-140/FR6`) to nine native components, the gesture
handles (FR16), and the gesture arbitration (FR18).

## Why this exists

- Gesture ownership and the gesture root: an Astryx component wins a drag
  against the platform's own back swipes, sheets, and scroll views inside
  Astryx's native hosts, from the component's live state, and a system menu's
  dismiss tap closes the menu alone (DEC-4).
- Drag and snap, and the swipe row: the motion matches UIKit and Android
  physics and runs in Astryx's own native views beside the app's one
  JavaScript runtime (DEC-3). The swipe row draws its actions itself because
  the system's swipe actions belong to UIKit table and collection views and
  Android's `RecyclerView`, and React Native lists are scroll views.
- Zoomable pager: the native paging and zoom behind `Lightbox` (FR8).
- Pan and zoom surface: a programmatic camera with native-driven frames and
  the same zoom on iOS and Android; a designed Astryx component in the React
  Native lab is its public face (DEC-8).
- Pinch around a scroller: a pinch-to-resize grid scales the list's content
  natively while the list keeps its own scroll view, so a large title keeps
  collapsing with it (FR17, DEC-6).
- System drag and drop: the system session lifts with the system preview,
  carries data to other apps, and offers the screen readers' drag actions
  (DEC-5).
- Gesture handles: other recognizers in the app, those of
  react-native-gesture-handler included, declare simultaneous or
  require-to-fail relationships with Astryx's recognizers
  (FR16, FR18).

## Who uses it

| Native piece             | Kind                                            | Astryx components that use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | What a person sees                                                                                                                                                            |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGestureOwnerView` | native component (Fabric Native Component)      | Every component that declares a drag through the library's drag-owner hook: `Item` (swipe actions), `Slider`, `Switch`, `Toast`, `BottomSheet`, `InlineSheet`, `Carousel`, `Pager`, `Calendar` (month swipe), `ResizeHandle`, `ChipGroup`, `CodeBlock`, and the charts (`BarChart`, `LineChart`, `AreaChart`, `Sparkline`, `DonutChart`) through the shared chart frame; horizontal scrollers (`ScrollableArea`, `TabList`, `Table`, `TopNav`, `Stack`, `PowerSearch`, Markdown tables) through the shared owned scroll view. `AstryxAppRoot` and `NativeHostsProvider` supply the frame. | A drag on a slider, a swipe row, or a carousel stays with that control; a drag elsewhere goes back a screen; a carousel at its leading edge hands the drag to the back swipe. |
| `AstryxGestureRootView`  | native component (Fabric Native Component), iOS | `AstryxAppRoot` and `NativeHostsProvider`, around the whole app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The tap that closes a system menu does not also press the row under it.                                                                                                       |
| `AstryxDragItem`         | native component (Fabric Native Component)      | `Draggable`, `ReorderableList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A held card lifts with the system preview and follows the finger, also into another app.                                                                                      |
| `AstryxDropZone`         | native component (Fabric Native Component)      | `DropZone`, `ReorderableList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A column shows where the card lands, scrolls at its edges, and takes the drop.                                                                                                |
| `AstryxDragSnap`         | native component (Fabric Native Component)      | `BottomSheet` (and the components that render one, such as `ActionSheet`, `Selector`, `DropdownMenu`, `CommandPalette`, `DateInput`), `InlineSheet`, `Toast`.                                                                                                                                                                                                                                                                                                                                                                                                                             | A sheet follows the finger, rubber-bands at its ends, and snaps to a stop; a notification flicks away.                                                                        |
| `AstryxSwipeRow`         | native component (Fabric Native Component)      | `Item` rows with swipe actions; `List`, `CheckboxList`, `RadioList`, `TreeList`, and `Selector` render their rows with `Item`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A row slides open to show its actions, or a full swipe fires the outer action.                                                                                                |
| `AstryxPanZoomView`      | native component (Fabric Native Component)      | A designed Astryx component in the React Native lab (`./unstable/*`, `spec:AST-112/FR5`) renders it, and the view itself is not exported (DEC-8); the create command's `maps` template reaches the view through that component.                                                                                                                                                                                                                                                                                                                                                           | A map-like canvas or a large diagram pans with a glide and zooms about the fingers.                                                                                           |
| `AstryxPinchScaleView`   | native component (Fabric Native Component)      | The scrollers whose records decide its public face: `List` (data mode included), `ScrollView`, and `FlatList`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A photo grid grows or shrinks under two fingers and settles at a new column count while its large title keeps collapsing.                                                     |
| `AstryxZoomPager`        | native component (Fabric Native Component)      | `Lightbox` (its public face; internal native contract). The create command's `gallery` template.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A full-screen photo viewer pages, zooms, and closes on a drag down.                                                                                                           |

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

- **FR1 — Motion runs on the UI thread.** Under `spec:AST-140/FR6`, each view
  in this group tracks the touch, decides what it means, and animates the
  result inside its native implementation on the UI thread: drags, flings, rubber bands, springs,
  glides, pinches, and page turns. A touch that lands on a moving view stops it
  where it is. JavaScript controls a view only through its props and commands,
  and hears back through direct events that carry one object and mark an
  outcome: a change of state, a crossed threshold (reported once per crossing,
  with a small dead band so a hovering finger reports it once), a resting
  place, a commit, a dismissal, a camera that stopped, a pinch that ended.
  Beyond outcomes, JavaScript hears two bounded streams a caller asks for:
  `onDropZoneMove`, at most once a frame and only while a drag moves over the
  zone, because JavaScript turns the point into a place to insert; and
  `onCameraChange` during motion, only while `cameraChangeInterval` is above 0
  and no more often than that interval. Both carry positions JavaScript reads,
  and the motion runs on whether JavaScript answers or not.
- **FR2 — Frame events feed Animated's native driver.** `onDragFrame`,
  `onSwipeFrame`, `onCameraFrame`, `onPagerFrame`, and `onPinchFrame` exist so
  that the
  `Animated.Value`s a caller gives a view follow its gesture through React
  Native's native driver.
  - While a gesture and its settle run, the given values move on every frame
    while JavaScript stays idle. They keep following when the caller's own
    views that use them unmount and mount again.
  - A given value's JavaScript copy holds what JavaScript last set, or the end
    of a native animation; a caller that wants every frame adds its own
    listener to the value.
  - `AstryxPanZoomView` sends `onCameraFrame` only while `cameraFramesEnabled`
    is true: once when it turns on, then once per camera change, and nothing
    while the camera rests.
- **FR3 — A frame declares the drags it owns.** `AstryxGestureOwnerView` marks
  the area a drag starts in.
  - `ownsLeft`, `ownsRight`, `ownsUp`, and `ownsDown` name the physical
    directions whose drags belong to the frame. With `releasesScroll`, the
    frame wraps a horizontal scroller, the `owns*` props name the directions it
    can still scroll, and a horizontal drag in any other direction makes the
    scroller let go. `ownsEdge` extends the claim to the screen-edge back
    swipe. `backGesture` (`always`, `atLeadingEdge`, `never`; `auto` declares
    nothing) states when a back gesture may start from a drag in the frame.
  - When frames sit inside one another, the deepest frame under the finger
    decides.
  - iOS: the frame's own recognizer begins only for an owned direction, and
    the content-wide back swipe, enclosing scroll views, UIKit's sheet drag, and
    the drag-and-snap, swipe-row, and zoom-pager views all wait for it to fail
    first. The edge back swipe waits only for a frame with `ownsEdge`. The
    stack host's back-swipe check for a screen reads `backGesture` from the
    nearest frame that sets it.
  - Android: the drag-and-snap, swipe-row, and zoom-pager views leave a drag to
    a frame that owns its direction; enclosing scroll views let
    it through; and a frame with `ownsEdge` that owns a horizontal direction removes its
    bounds from the system back gesture, within the system's limit of 200 dp
    per edge.
  - A drag-and-snap view placed inside a frame that owns the same axis leaves
    that axis's drags to the frame.
- **FR4 — A menu's dismiss tap presses nothing below it.** On iOS,
  `AstryxGestureRootView` wraps the app's root content and fills it. Its one
  recognizer watches touches without recognizing. When a touch starts while a
  system menu is shown, it cancels React Native's handling of that touch, so
  the tap closes the menu alone, matching UIKit's own controls. It acts once
  per shown menu.
- **FR5 — Drag and snap.** `AstryxDragSnap` moves its children along one axis
  and lets them rest only at its `detents`.
  - Stops: `detents` lists the stops, each a value: the stop's position in dp
    along the axis (+ down, + right). A stop is identified by that value. The
    list is ordered ascending by the extent of the surface the
    stop shows (its height on a vertical axis, its width on a horizontal one),
    so the first stop is the smallest. `restStop`, `snapTo(stop, animated)`,
    `placeAt(position, stop)`, `onDragSnap` (`stop`), and `onDragThreshold`
    (`stop`, or `dismiss` true when a release would dismiss) take and report
    that value.
  - FR5 gap: the contract identifies stops by index (`restIndex`,
    `snapTo(index, …)`, `placeAt(…, index)`, `onDragSnap`'s `index`,
    `onDragThreshold`'s `target`, -1 for a dismiss) and orders `detents` by
    position along the axis, so a sheet's first stop is its tallest.
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
    would choose changes, reporting that stop or `dismiss`, after 4 dp of travel
    past the boundary).
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
    false turns the gestures off, and commands keep working.
  - Commands: `animateTo(animationId, x, y, scale, durationMs, easing)` runs on
    the UI thread and ends with exactly one `onCameraAnimationEnd` (`id`,
    `finished` false when a touch, a newer animation, or `setCamera` cuts it
    short); `setCamera(x, y, scale)` jumps.
  - Events: `onCameraChange` (`x`, `y`, `scale`, `settled`, `reason`
    `gesture`, `animation`, or `set`) when the camera stops, and during motion
    only when `cameraChangeInterval` > 0, no more often than that many ms;
    `onTap` (content and view coordinates) for a one-finger tap that no child
    handled, once the double-tap window has closed; a pan, a pinch, a
    two-finger tap, and a touch that stops a glide stay gestures of their own.
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
    the viewport reports a swipe up. With `panRequiresTwoFingers`, panning and
    paging take two fingers, and a one-finger drag toward the trailing side is
    the iOS back swipe where one can begin, otherwise the close.
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
    (empty: every type) and, with `acceptsText`, plain text from anywhere, and
    declines every other session. While a session is over it, the zone reports
    `onDropZoneEnter`, `onDropZoneMove` (only when the point moved, no more than
    once a frame), `onDropZoneLeave`, and `onDropZonePerform` (with `text`), in
    dp from the zone's top-left corner; JavaScript decides what a point means.
    `dropOperation` is `move` or `copy`. With `autoScrollEdge` > 0, hovering
    within that band of the nearest enclosing scroll view's visible edge scrolls
    it, faster closer to the edge. When zones sit inside one another, the
    deepest one that accepts the session hears it. A drop from another app carries an empty
    `itemId`. `dropEnabled` false lets sessions pass to an enclosing zone.
- **FR10 — Native contracts.** The group's contracts are native components
  (Fabric Native Components) generated from codegen specs:

  | Contract                 | Kind                                       | Props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Commands                                        | Events                                                                                                       | Platforms    |
  | ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
  | `AstryxGestureOwnerView` | native component (Fabric Native Component) | `ownsLeft`, `ownsRight`, `ownsUp`, `ownsDown`, `releasesScroll`, `ownsEdge`, `backGesture`                                                                                                                                                                                                                                                                                                                                                                                                                | none                                            | none                                                                                                         | iOS, Android |
  | `AstryxGestureRootView`  | native component (Fabric Native Component) | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                            | none                                                                                                         | iOS          |
  | `AstryxDragItem`         | native component (Fabric Native Component) | `dragEnabled`, `itemId`, `itemType`, `itemText`, `crossApp`, `previewCornerRadius`                                                                                                                                                                                                                                                                                                                                                                                                                        | none                                            | `onDragItemLift`, `onDragItemStart`, `onDragItemEnd`                                                         | iOS, Android |
  | `AstryxDropZone`         | native component (Fabric Native Component) | `dropEnabled`, `acceptTypes`, `acceptsText`, `dropOperation`, `autoScrollEdge`                                                                                                                                                                                                                                                                                                                                                                                                                            | none                                            | `onDropZoneEnter`, `onDropZoneMove`, `onDropZoneLeave`, `onDropZonePerform`                                  | iOS, Android |
  | `AstryxDragSnap`         | native component (Fabric Native Component) | `dragAxis`, `detents`, `restStop`, `verticalBefore`, `verticalAfter`, `verticalDismissBefore`, `verticalDismissAfter`, `horizontalBefore`, `horizontalAfter`, `horizontalDismissBefore`, `horizontalDismissAfter`, `canDismiss`, `reduceMotion`, `dragEnabled`, `rtl`, `scrollHandoff`, `claim`, `verticalIntent`, `projectionFactor`, `projectionMinTravel`, `stepPerFling`, `flickVelocity`, `flickMinTravel`, `rubberDimension`, `rubberCoefficient`, `springStiffness`, `springDamping`, `springMass` | `snapTo`, `placeAt`                             | `onDragFrame`, `onDragStateChange`, `onDragSnap`, `onDragDismiss`, `onDragDismissAttempt`, `onDragThreshold` | iOS, Android |
  | `AstryxSwipeRow`         | native component (Fabric Native Component) | `leadingWidth`, `trailingWidth`, `swipeBehavior`, `rtl`, `reduceMotion`, `swipeEnabled`, `leadingDrag`, `trailingDrag`, `axisLock`, `commitPastPanel`, `commitFraction`, `restFraction`, `overshootResistance`, `flingVelocity`, `flingMin`, `slideOutOvershoot`, `slideOutMs`, `springStiffness`, `springDamping`, `springMass`                                                                                                                                                                          | `snapTo`                                        | `onSwipeFrame`, `onSwipeBegin`, `onSwipeThreshold`, `onSwipeSettle`, `onSwipeCommit`                         | iOS, Android |
  | `AstryxPanZoomView`      | native component (Fabric Native Component) | `contentWidth`, `contentHeight`, `minScale`, `maxScale`, `initialX`, `initialY`, `initialScale`, `doubleTapScale`, `decelerationRate`, `cameraChangeInterval`, `reduceMotion`, `panZoomEnabled`, `cameraFramesEnabled`                                                                                                                                                                                                                                                                                    | `animateTo`, `setCamera`                        | `onCameraChange`, `onCameraFrame`, `onCameraAnimationEnd`, `onTap`                                           | iOS, Android |
  | `AstryxPinchScaleView`   | native component (Fabric Native Component) | `isEnabled`, `isContentScaled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | none                                            | `onPinchFrame`, `onPinchEnd`                                                                                 | iOS, Android |
  | `AstryxZoomPager`        | native component (Fabric Native Component) | `count`, `pagerIndex`, `viewportWidth`, `viewportHeight`, `contentWidth`, `contentHeight`, `rtl`, `reduceMotion`, `pagerEnabled`, `zoomMax`, `doubleTapZoom`, `pinchSlack`, `rubber`, `pageShare`, `pageFling`, `dismissDistance`, `dismissFling`, `dismissRight`, `panRequiresTwoFingers`, `doubleTapCenters`, `dismissDistanceRight`, `dismissFlingRight`, `panPageShare`, `slop`, `doubleTapMs`, `pageMs`, `zoomMs`, `decelerationRate`                                                                | `setIndex`, `resetZoom`, `toggleZoom`, `zoomTo` | `onPagerFrame`, `onPagerIndexChange`, `onPagerZoom`, `onPagerDismiss`, `onPagerTap`, `onPagerSwipeUp`        | iOS, Android |

  | Contract               | Kind                                | Methods              | Platforms    |
  | ---------------------- | ----------------------------------- | -------------------- | ------------ |
  | `AstryxGestureHandles` | native module (Turbo Native Module) | `relate`, `unrelate` | iOS, Android |

  The `AstryxPinchScaleView` row is the named feature
  `AstryxPinchScaleView.pinch` (FR14).

  Positions and widths are dp, velocities dp/ms (the pinch's velocity is
  scale per second), durations ms. A dismiss line at ±1e9 or beyond is none.

- **FR11 — An absent view keeps its content.** Where a view's native component
  is not registered (the web, the test host, a binary without it), its probe
  (`isGestureOwnerAvailable()`, `isGestureRootAvailable()`,
  `isDragSnapViewAvailable()`, `isSwipeRowViewAvailable()`,
  `isPanZoomViewAvailable()`, `isZoomPagerViewAvailable()`,
  `isNativeDragItemViewAvailable()`, `isNativeDropZoneViewAvailable()`)
  answers false, and the wrapper renders the children in a plain View with the
  same style, test id, and accessibility props and no gesture
  (`spec:AST-140/FR2`). An absent view leaves the caller's ref empty, and the
  probe tells the caller. There, `Item` (its swipe actions) and the
  drag-and-drop components (`Draggable`, `ReorderableList`, `DropZone`) take
  no drag and draw no gesture of their own: they keep their accessibility
  actions, which make every move the gesture makes, and each warns once in
  development (DEC-7). The pinch view is detected through its named feature
  (FR14, FR17).
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
- **FR14 — Contracts grow by named features.** The group's contracts grow by
  named features (`spec:AST-140/FR5`). FR3 to FR10 and FR16 describe each
  contract's baseline. The pinch view is the group's named feature,
  `AstryxPinchScaleView.pinch` (FR17): JavaScript reads it through
  `contractFeatures('AstryxPinchScaleView')` before it renders the view, and
  checks every named feature before it uses it.
- **FR15 — Native code uses public platform API only.** The views use public
  UIKit and Android framework API, and React Native's own touch handler and
  event routes. One exception: the iOS gesture root (FR4) recognizes an open
  system menu by the class name of UIKit's private context-menu container,
  because UIKit offers no public query for a presented bar-button menu. It reads
  the name; when the name is absent, the guard stands aside and every
  touch goes through. The binary reports a self-check for
  this exception through the platform info module (`spec:AST-140/FR9`).
- **FR16 — Gesture handles.** Each recognizer of a mounted Astryx gesture view
  has a handle, so a recognizer from outside Astryx, such as a
  react-native-gesture-handler gesture or a custom native recognizer, declares
  its relationship to it (FR18). Astryx's own recognizers relate
  to one another through the gesture owner view's declarations (`ownsLeft`,
  `ownsRight`, `ownsUp`, `ownsDown`, `ownsEdge`, `releasesScroll`, and
  `backGesture`, FR3), so the library's components negotiate with no app
  wiring.
  - A handle is a plain, serialisable value, `{viewTag, recognizer}`: the
    view's React Native tag and the recognizer's name in the view's contract.
    The names are `pan` for the gesture owner, drag-and-snap, and swipe-row
    views; `pan`, `pinch`, `doubleTap`, and `twoFingerTap` for the pan-and-zoom
    surface; `pan`, `pinch`, and `doubleTap` for the zoom pager; and `pinch`
    for the pinch view. A handle stays valid while its view is
    mounted.
  - An app gets a handle from the ref of the component that renders the view:
    the ref's `getGestureHandle(recognizer)` answers the handle, or `null`
    while the view is absent (FR11) or has no recognizer of that name. Each
    component's record states which of its views its ref reaches.
  - A relationship is `simultaneous` (both recognize at once) or
    `requireToFail` (the waiting recognizer begins only after the other one
    fails), the vocabulary of Core's web recognizers
    (`recognizeSimultaneouslyWith`, `requireToFail`). From JavaScript,
    `relateGesture(handle, other, relation)` declares one between a handle and
    `other`, the React Native tag of the view a non-Astryx recognizer is
    attached to (every non-Astryx recognizer on that view takes part), with
    the handle's recognizer as the waiter for `requireToFail`, and returns a
    function that removes it; a relationship also ends when either view
    unmounts. Where the gesture module is absent (the web, the test host),
    `relateGesture` returns a function that removes nothing. Native code resolves a handle through
    the gesture module to its platform recognizer, so a custom native
    recognizer or another gesture library declares the relationship with it
    directly, in either direction.
  - iOS applies `simultaneous` through the recognizer delegate's
    simultaneous-recognition answer and `requireToFail` through the
    recognizer's failure requirement. Android applies both through touch
    interception, in either direction: with `simultaneous`, both recognizers
    keep receiving the touch; with `requireToFail`, the waiting recognizer,
    Astryx's or the peer's, receives the touch once the other one has failed.
- **FR17 — Pinch around a scroller.** `AstryxPinchScaleView` is a native
  two-finger pinch around a scroller: a `List` (data mode included), a
  `ScrollView`, or a `FlatList`. It wraps the scroller and has no scroll view
  of its own, so a screen's scroll-view lookup still finds the scroller and a
  large title keeps collapsing with it. It is an internal native piece; the
  `List` and `ScrollView` component records decide its public face.
  - The pinch is a recognizer in the vocabulary of Core's
    `PinchGestureRecognizer`: `scale` is the fingers' span over their span
    when the pinch began (1 at the begin, unclamped), the focal point
    (`focalX`, `focalY`) is the fingers' midpoint in the view in dp, and
    `velocity` is the scale's rate of change in scale per second, above 0
    while the fingers spread.
  - A pinch begins once the span changes past the platform's slop and cancels
    React Native's touch, so a pressed row lets go. The scroller is held while
    two fingers are down and scrolls again once every finger has lifted; one
    finger scrolls as usual.
  - `isContentScaled` (default true): the view draws the scale natively on the
    scroller's content, so the point under the fingers at the begin follows
    their midpoint, and the scroll offset and content size stay as they are.
    The content holds its last scale until the view's next render, which
    arrives with whatever `onPinchEnd` set, so a new layout and the content
    back at scale 1 land in one frame. With `isContentScaled` false, `values`
    are the only output.
  - `values` `{scale, focalX, focalY}`, each an optional `Animated.Value`, are
    native-driver outputs only: the view drives them on every move through
    `onPinchFrame` (FR2), and each keeps its last value after the end. Without
    `values` the view sends no frames.
  - `onPinchEnd` `{scale, focalX, focalY, velocity, isCancelled}` arrives
    exactly once per begun pinch: when fewer than two fingers remain
    (`isCancelled` false), or when the system cancels the touch, the view
    leaves the window, or `isEnabled` turns off (`isCancelled` true).
    `isEnabled` (default true) turns the pinch on.
  - The pinch is the named feature `AstryxPinchScaleView.pinch`, read through
    `contractFeatures('AstryxPinchScaleView')` (FR14). A binary without it renders the children in a plain View with the same
    style, test id, and accessibility props, and a caller that passed `values`
    or `onPinchEnd` hears one development warning.
  - The wrapper forwards accessibility props, so a grid offers its larger and
    smaller layouts as accessibility actions (FR12).
- **FR18 — Astryx's gestures join each platform's arbitration.**
  - The gesture module registers Astryx's recognizers with each platform's
    arbitration: on iOS, recognizer relationships such as require-to-fail and
    simultaneous recognition; on Android, touch interception.
  - It exposes a handle per recognizer, so other recognizers, those of
    react-native-gesture-handler included, can declare their relationship to
    it (FR16).
  - It runs natively, independent of the JavaScript runtime.
  - Gesture behavior and feel follow `spec:AST-094`, `spec:AST-107`, and
    `spec:AST-108`.
  - Astryx owns its own recognizers, and the app owns its other gestures.

### Platform support

| Contract                 | iOS                                                                                                                                                             | Android                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AstryxGestureOwnerView` | A blocking pan recognizer; the stack's back swipes, scroll views, and UIKit's sheet drag wait through its delegate.                                             | Owner lookup by the gesture views, `requestDisallowInterceptTouchEvent`, `View.setSystemGestureExclusionRects` for `ownsEdge`. `backGesture` is not read (OQ2). |
| `AstryxGestureRootView`  | A recognizer that watches without recognizing and cancels React Native's touch for a menu's dismiss tap.                                                        | None: the contract is iOS only, and the wrapper renders its children.                                                                                           |
| `AstryxDragItem`         | `UIDragInteraction` (enabled on iPhone), lift preview, `accessibilityDragSourceDescriptors`.                                                                    | `View.startDragAndDrop` with a `ClipData`, a `DragShadowBuilder`, `DRAG_FLAG_GLOBAL` for `crossApp`.                                                            |
| `AstryxDropZone`         | `UIDropInteraction` with a `UIDropProposal`, `accessibilityDropPointDescriptors`, auto-scroll.                                                                  | `View.OnDragListener`, auto-scroll on the nearest scrollable ancestors.                                                                                         |
| `AstryxDragSnap`         | A UIKit pan (its threshold is the claim), UIScrollView's rubber band, spring settle.                                                                            | Touch-slop claim (`claim`), the same release rules and spring.                                                                                                  |
| `AstryxSwipeRow`         | A pan with an axis gate, velocity-aware release, spring and slide-out.                                                                                          | The same rules.                                                                                                                                                 |
| `AstryxPanZoomView`      | `UIScrollView` deceleration and rubber band; double tap and two-finger tap recognizers.                                                                         | `OverScroller` fling, `ScaleGestureDetector`, `GestureDetector` taps, `ValueAnimator`. No two-finger tap (FR7 gap).                                             |
| `AstryxPinchScaleView`   | A pinch recognizer on the wrapper beside the inner scroll views' pans, which pause while two fingers are down; the content container's layer carries the scale. | A scale detector fed before any child; the children hear a cancel at the second finger; the content child carries the scale.                                    |
| `AstryxGestureHandles`   | Relationships through the recognizer delegate and failure requirements.                                                                                         | Relationships through touch interception.                                                                                                                       |
| `AstryxZoomPager`        | Paging, pinch, glide (UIScrollView's deceleration rates), iOS 26 back-swipe arbitration.                                                                        | The same rules; the trailing-side drag closes.                                                                                                                  |

- Supported feature/engine floor: the floor of `spec:AST-112` (React Native's
  New Architecture; iOS at React Native's minimum; Android API level 24). The
  iOS content-wide back swipe applies from iOS 26.
- Unsupported behavior: an absent view reports itself unavailable and renders
  its children without a gesture (FR11); `Item` and the drag-and-drop
  components then take no drag and keep their accessibility actions (DEC-7); a behaviour a binary lacks follows
  `spec:AST-140/FR5`.
- Browser evidence: none. Claims are proven on the iOS Simulator, the Android
  emulator, and devices (`spec:AST-112/FR15`).

## Current-state impact

- Details `spec:AST-112` FR1 (the gesture owner and gesture root in the
  core) and FR7, and `spec:AST-140` FR2, FR3, FR5, and FR6, for this group.
- Relies on `spec:AST-112` FR3 (amended): the native half of the library's
  components, these views included, links in every app by default.
- Relies on `spec:AST-140` FR5: contracts grow by named features that
  JavaScript checks before it uses them.
- Relies on `spec:AST-112` FR5 (amended): the gesture views stay internal
  behind the library's components on `./controls`.
- Answers `spec:AST-112` OQ7 for the pan and zoom component: it starts in the
  React Native lab under `./unstable/*` (DEC-8).
- `spec:AST-017` FR27 keeps the pan and zoom component in the lab folder of
  `@astryxdesign/react-native`, under `./unstable/*`, instead of the Lab
  package (DEC-8).

## Verification

| Contract | Verification                                                                                                                          | Representative states                                                                                                                                                 | Mutation or failure expectation                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | UI-thread frame checks on the Simulator and the emulator: JavaScript wakes counted during a drag and its settle                       | a sheet drag and fling; a swipe-row commit; a pinch; a page turn                                                                                                      | Any JavaScript wake per frame during a gesture or its settle, other than `onDropZoneMove` and an asked-for `onCameraChange`                                                              |
| FR2      | Unit tests of each wrapper through the `./testing` doubles; frame checks on device builds                                             | values given and not; values changed; a consumer remounted; frames turned on                                                                                          | An `Animated.event` prop, a frame listener added in JavaScript, a value that stops following after a remount, a frame at rest                                                            |
| FR3      | Simulator and emulator checks of back swipes against owner frames                                                                     | a slider at the screen edge; a carousel at its leading edge; a toast dragged toward its edge; `backGesture` values                                                    | A back swipe takes an owned drag, an edge swipe ignores `ownsEdge`, or an owned frame blocks an unowned drag                                                                             |
| FR4      | Simulator checks with a system menu open                                                                                              | the dismiss tap over a pressable row; the root absent                                                                                                                 | The row's press fires on the dismiss tap                                                                                                                                                 |
| FR5–FR8  | Unit tests of the shared rules and wrappers through `./testing` doubles; Simulator and emulator checks                                | stops by value; fling, slow drag, interrupt, dismiss, threshold; reveal and commit; pan, pinch, tap, glide; paging, zoom, dismiss, two fingers                        | A release settles on another stop than the rules choose, an event fires per frame other than an asked-for `onCameraChange`, or a command sends a milestone the rules give to drags       |
| FR9      | Simulator and emulator checks with two apps                                                                                           | a held lift; a quick drag that scrolls; nested zones; a refused type; text from another app; a lift released without a drag                                           | No `onDragItemEnd` after a lift, an ancestor zone gets the events, or a refused item is accepted                                                                                         |
| FR10     | The platform's spec rules check over the codegen specs and the contract list                                                          | each contract's props, commands, events, platforms                                                                                                                    | A contract differs from the table                                                                                                                                                        |
| FR11     | Unit tests with each view absent through the `./testing` doubles                                                                      | each absent view; a command sent to an absent view; `Item` swipe actions and each drag-and-drop component with their view absent                                      | Children dropped, a probe that answers true, a throw, a command handle on an absent view, a drag drawn in JavaScript, a move without its accessibility action, or no development warning |
| FR12     | VoiceOver and TalkBack checks on the Simulator, the emulator, and devices; unit tests of forwarded accessibility props                | actions passed to each view; the pager and the pan-zoom surface as adjustable elements; drag item and drop zone; the large content viewer inside a drag-and-snap view | An accessibility prop not forwarded, or an adjustable that does something other than its gesture                                                                                         |
| FR13     | Unit tests and Simulator and emulator checks with Reduce Motion and right-to-left                                                     | each settle under Reduce Motion; each horizontal gesture under right-to-left                                                                                          | An animated settle under Reduce Motion, a missing event, or an unmirrored horizontal gesture                                                                                             |
| FR14     | The platform's spec rules check over the contract list and its named features                                                         | each contract in the group; a binary without `AstryxPinchScaleView.pinch`                                                                                             | A named feature the record does not list, or one used without the check                                                                                                                  |
| FR16     | Unit tests of the handle and relationship API through the `./testing` doubles; Simulator and emulator checks with a second recognizer | each recognizer name; an absent view; `simultaneous` and `requireToFail`; an unmount                                                                                  | A handle for an absent view, a relationship that outlives its view, or a `requireToFail` waiter that begins first                                                                        |
| FR17     | Unit tests of the native-driver mapping and the absent view; Simulator and emulator pinch checks over a list under a large title      | a spread and a squeeze; a cancel; `isContentScaled` off; values given and not; a binary without the feature                                                           | A scroll during a two-finger pinch, a frame without `values`, more than one `onPinchEnd`, a large title that stops collapsing, or a missing warning                                      |
| FR18     | Gesture tests on the Simulator, the emulator, and devices, beside a second gesture library                                            | an Astryx recognizer beside a react-native-gesture-handler recognizer; a busy JavaScript thread                                                                       | A relationship that cannot be declared, an Astryx recognizer that does not follow a declared relationship, or a gesture that waits on JavaScript                                         |
| FR15     | Source review of the iOS and Android views; an iOS build with the private class name absent                                           | each view; the gesture root with no menu container found; the platform info self-check                                                                                | A private API call, or a gesture root that blocks a touch when the name is absent                                                                                                        |

## Decision log

### DEC-1 — Gesture motion runs on the UI thread

**Reference:** `spec:AST-124/DEC-1`
**Decider:** imdreamrunner, 2026-11-17

A drag that waits for JavaScript drops frames whenever JavaScript is busy, so
every Astryx gesture runs in a native view and JavaScript sees only its
outcomes.

### DEC-2 — Frame events reach Animated through native attachment

**Reference:** `spec:AST-124/DEC-2`
**Decider:** imdreamrunner, 2026-11-17

Components bind driven values in native-driver styles. Attaching the frame
event natively keeps JavaScript idle; an `Animated.event` prop would add a
JavaScript listener that wakes JavaScript every frame.

### DEC-3 — Fixed-shape native views in Astryx's own package

**Reference:** `spec:AST-124/DEC-3`
**Decider:** imdreamrunner, 2026-11-17

Each gesture is a native view with declared props, commands, and events, so
iOS and Android show the same behaviour, every app runs one JavaScript
runtime, and the package keeps React and React Native as its only peers.
Astryx takes no third-party native dependency for these gestures. Astryx
components work beside react-native-gesture-handler and
react-native-reanimated in the same app (`spec:AST-140/FR9`), and the gesture
handles let their recognizers relate to Astryx's (FR16).

### DEC-4 — Components declare ownership; the platform arbitrates

**Reference:** `spec:AST-124/DEC-4`
**Decider:** imdreamrunner, 2026-11-17

A component knows from its live state which directions it can use, so it
declares them on its touch frame, and the platform makes its own gestures (back
swipes, scroll views, sheets, the system back gesture) yield. One declaration
feeds both the native frame and the JavaScript protocol, so the two always
agree.

### DEC-5 — Drag and drop uses the system session

**Reference:** `spec:AST-124/DEC-5`
**Decider:** imdreamrunner, 2026-11-17

The system session gives the lift, the arbitration with scroll views and menus,
the pointer, the screen-reader actions, and cross-app data. JavaScript keeps the meaning of a location and of a drop.

### DEC-6 — Pinch wraps the scroller

**Reference:** `spec:AST-124/DEC-6`
**Decider:** imdreamrunner, 2026-11-18

The pinch is a native piece around the scroller, so the scroller stays the
screen's scroll view: the large title keeps tracking the list, and a
pinch-to-resize grid scales on the UI thread with one JavaScript event at the
end, where the app sets the new layout.

### DEC-7 — Drags run only in the native views

**Reference:** `spec:AST-124/DEC-7`
**Decider:** imdreamrunner, 2026-11-19

`Item` and the drag-and-drop components drag only through their native views,
so each platform has one drag path, the one this record specifies. Where the
view is absent they take no drag, keep their accessibility actions and warn in
development; the accessibility actions keep every move reachable.

### DEC-8 — Pan and zoom reach apps through a lab component

**Reference:** `spec:AST-124/DEC-8`
**Decider:** imdreamrunner, 2026-11-19

Free pan and zoom of large content reaches apps through a component with an
Astryx API, so `AstryxPanZoomView`'s public face is a designed Astryx component
that renders it, and the native view itself is not exported. That component
starts in the React Native lab (`./unstable/*`, `spec:AST-112/FR5`), and its own
component record brings its name and props.

## Open questions

- **OQ2 — What does `backGesture` do on Android?** (`human-design`) Options:
  `never` becomes a system-gesture exclusion over the frame (at most 200 dp per
  edge); or Android keeps ignoring it and only `ownsEdge` excludes. Leaning:
  Android ignores `backGesture`; only a frame with `ownsEdge` turns off the
  system back gesture over its bounds, within the system's 200 dp per edge, and
  `backGesture` becomes iOS-only in the component records. Settled by: an
  Android device test with gesture navigation and with three-button
  navigation, in which a Carousel at its first item, a Slider at the screen
  edge, and a Toast dragged toward an edge each keep the system back swipe
  except over an `ownsEdge` frame.
