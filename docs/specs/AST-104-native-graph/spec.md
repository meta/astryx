---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-104
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [humbertovirtudes]
affects_architecture:
  [
    architecture:public-component-api,
    architecture:theme-tokens,
    architecture:component-style-authoring,
    architecture:react-component-runtime,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Native Flow system spec

## Intent

A graph builder uses a complete Astryx-native graph system without installing
another graph engine. Flow owns its components, hooks, utilities, public types,
state, geometry, rendering, connections and interaction. Its public API follows
Astryx conventions; reference compatibility is measured by supported capabilities
and outcomes, not literal upstream names or signatures.

## Non-goals

- Wrapping, importing, re-exporting or delegating implementation to XYFlow.
- A drop-in source-compatible facade or aliases whose only purpose is retaining
  upstream branding and naming.
- Adding a graph engine to Core or duplicating its existing tokens, focus,
  announcement and interaction infrastructure.
- Treating exported stubs, copied declarations or screenshots as working parity.
- Treating application examples such as collaboration transport, undo history or
  automatic layout as exports already provided by a graph-engine package.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 - The system is native and has no XYFlow dependency.** All graph
  components, hooks, utilities and types MUST be implemented and owned by
  `@astryxdesign/flow`. Its source and runtime, peer, build, test, optional and
  transitive dependency closure MUST NOT depend on `@xyflow/react`,
  `@xyflow/system` or another XYFlow package. Examples MUST import only the native
  graph surface from Astryx. The published 12.12.0 reference defines a fixed
  feature inventory, not an installed implementation or executable test oracle.
- **FR2 - Feature parity is complete and explicitly mapped.** Every reference
  component, hook, utility and public supporting type MUST have a native owner
  and capability/type contract. Stable, experimental and examples-only surfaces
  MUST be distinguished. System-only reference exports MUST NOT become native
  root exports merely because they exist; supporting mechanisms and types are
  authored where the admitted native surface needs them. Missing, unverifiable
  or inert entries MUST remain incomplete rather than count as parity.
- **FR3 - The public API is Astryx-idiomatic.** The native root component,
  provider and instance hook are `Flow`, `FlowProvider` and `useFlow`.
  Graph-specific types and hooks MUST have clear native ownership and obey
  `architecture:public-component-api` and `spec:AST-002`; boolean props use the
  established `is*`/`has*` conventions and callbacks name the action. Reference
  names, signatures, leaked implementation types and pinned defects are not
  automatically admitted. The capability mapping MUST identify native names,
  type/callback changes and intentional behavior divergences without silently
  removing a supported feature. Experimental capabilities remain explicitly
  experimental; deprecated names may map to one complete native owner rather
  than create a redundant compatibility alias.
- **FR4 - One native runtime owns state and geometry.** Controlled and
  uncontrolled graph state, change application, node/edge identity, nesting,
  selection, deletion, dimensions, handle geometry and coordinate conversion
  MUST operate on the native model. No-op updates, replacement/deletion,
  subscriptions and concurrent rendering MUST preserve documented ordering and
  identity. Hooks, instance operations and components MUST observe that model,
  not parallel stores. Caller-controlled updates remain caller-owned.
- **FR5 - Rendering and customization are native.** Built-in and custom nodes,
  edges, connection lines, labels, markers, handles, grouping, overlays and
  viewport-attached content MUST render without a third-party graph renderer.
  Generic node/edge data, custom renderers and events MUST remain extensible.
  Static server rendering MUST work with explicit node, handle and container
  geometry without browser globals or DOM measurement; hydration MUST preserve
  identity and content.
- **FR6 - Interaction and viewport behavior are complete.** Native dragging,
  pan/zoom, pinch/wheel input, snapping, selection, viewport constraints and
  helpers, connection creation, validation, reconnection and cancellation MUST
  cover the admitted capability matrix. Keyboard, pointer and touch paths MUST
  preserve state and focus. Cancellation, capture loss and unmount MUST release
  gesture state and resources without committing an unintended operation.
- **FR7 - The full component family composes with the runtime.** Controls,
  control buttons, minimap, background patterns, panels, node/edge toolbars,
  resize controls, edge implementations and label renderers MUST provide their
  admitted states, options and interactions through the same instance. Custom
  content, disabled states, callbacks, grouping and coordinate-space behavior
  MUST work; static visual imitation does not establish completion.
- **FR8 - Hooks, utilities and types are functional native contracts.** Every
  graph hook MUST operate on or subscribe to the native instance. Geometry,
  path, graph-traversal, reducer and connection utilities MUST cover their
  boundaries and failure cases. Generics, callbacks, discriminated unions and
  supporting types MUST be locally authored and testable without upstream type
  imports. A type or export with missing behavior is not an implementation.
- **FR9 - Presentation and accessibility are Astryx-native.** Components MUST
  compose existing Astryx primitives and supported behavior infrastructure,
  semantic tokens and StyleX. The nearest Theme governs light, dark, system and
  nested-theme states; theme changes MUST not reset graph state or focus.
  Styling inputs follow existing admission/compatibility contracts. Focus MUST
  remain visible and distinct from selection. Accessible names, roles, states,
  keyboard navigation, announcements, touch targets, zoom, reduced motion and
  forced colors MUST have verified contracts.
- **FR10 - Complete parity is independently verifiable.** The packed native
  package MUST work in a consumer with no XYFlow package present. Every required
  capability MUST have mutation-sensitive tests through the shipped native path;
  public types require positive/negative native consumer type tests. Browser and
  canonical visual evidence MUST cover interaction, accessibility and theming.
  Small and large graphs require measured rendering, update, subscription,
  geometry and viewport performance. Missing evidence, stubs, uncovered entries
  or an unmeasured regression MUST prevent a complete-parity claim.

### Native public API

The stable entry point is `@astryxdesign/flow`. The following names identify native
owners, not wrappers or aliases of an installed graph engine. Supporting contracts
reachable through their signatures remain public even when not named root exports.

- **Components:** `Flow`, `FlowBackground`, `FlowBaseEdge`, `FlowBezierEdge`,
  `FlowControlButton`, `FlowControls`, `FlowEdgeLabelPortal`, `FlowEdgeText`,
  `FlowEdgeToolbar`, `FlowMiniMap`, `FlowMiniMapNode`, `FlowNodeResizeControl`,
  `FlowNodeResizer`, `FlowNodeToolbar`, `FlowPanel`, `FlowPort`, `FlowProvider`,
  `FlowSimpleBezierEdge`, `FlowSmoothStepEdge`, `FlowStepEdge`, `FlowStraightEdge`,
  `FlowViewportPortal`.
- **Hooks:** `useFlow`, `useFlowConnection`, `useFlowEdges`, `useFlowEdgesState`,
  `useFlowKeyPress`, `useFlowNodeConnections`, `useFlowNodeData`,
  `useFlowNodeGeometry`, `useFlowNodeGeometryRefresh`, `useFlowNodeId`,
  `useFlowNodes`, `useFlowNodesInitialized`, `useFlowNodesState`,
  `useFlowSelectionChange`, `useFlowState`, `useFlowStore`, `useFlowViewport`,
  `useFlowViewportChange`.
- **Utilities:** `getFlowBezierEdgeCenter`, `getFlowBezierPath`,
  `getFlowConnectedEdges`, `getFlowEdgeCenter`, `getFlowIncomingNodes`,
  `getFlowNodesBounds`, `getFlowOutgoingNodes`, `getFlowSimpleBezierPath`,
  `getFlowSmoothStepPath`, `getFlowStraightPath`, `getFlowViewportForBounds`,
  `isFlowEdge`, `isFlowNode`, `mergeFlowEdge`, `mergeFlowEdgeChanges`,
  `mergeFlowEdgeConnection`, `mergeFlowNodeChanges`.
- **Closed domains:** `FlowBackgroundVariant`, `FlowConnectionLineType`,
  `FlowConnectionMode`, `FlowMarkerType`, `FlowPortPosition`,
  `FlowResizeControlVariant`, `FlowScrollPanMode`, `FlowSelectionMode`. Each has
  a typed value object and same-named string-literal type; behavior values are
  not open to theme augmentation.
- **Experimental entry point:** `@astryxdesign/flow/experimental` owns
  `useFlowEdgesChangeMiddleware` and `useFlowNodesChangeMiddleware`. They MUST
  remain explicitly experimental and MUST NOT be stable-root aliases.

Graph models are `FlowNode`, `FlowEdge`, `FlowConnection`, `FlowPosition`,
`FlowDimensions`, `FlowBox`, `FlowRect`, `FlowViewport`, `FlowTransform` and
`FlowSnapshot`. Renderer inputs are separate `FlowNodeRenderProps` and
`FlowEdgeRenderProps`; the port component `FlowPort` is distinct from its
`FlowPortGeometry` data. `FlowController` composes graph and viewport operations;
getter contracts are functions, not aliases of their returned models.

Native graph-specific root type names are:

`FlowAccessibilityLabels`, `FlowActions`, `FlowAlignment`, `FlowAttributionOptions`,
`FlowBackgroundProps`, `FlowBackgroundVariant`, `FlowBaseEdgeProps`,
`FlowBezierEdgeProps`, `FlowBezierPathOptions`, `FlowBezierPathParams`, `FlowBox`,
`FlowBuiltInEdge`, `FlowBuiltInNode`, `FlowConnectEndHandler`, `FlowConnectHandler`,
`FlowConnectStartHandler`, `FlowConnection`, `FlowConnectionContext`,
`FlowConnectionEndpoint`, `FlowConnectionInProgress`, `FlowConnectionLineType`,
`FlowConnectionMode`, `FlowConnectionRenderProps`, `FlowConnectionRenderer`,
`FlowConnectionStartEvent`, `FlowConnectionState`, `FlowConnectionValidator`,
`FlowControlAction`, `FlowControlButtonProps`, `FlowController`, `FlowControlsProps`,
`FlowCoordinateExtent`, `FlowDefaultEdgeOptions`, `FlowDeleteElementsOptions`,
`FlowDeleteHandler`, `FlowDeletionDecision`, `FlowDeletionRequest`,
`FlowDeletionResolver`, `FlowDeletionResult`, `FlowDimensions`, `FlowEdge`,
`FlowEdgeAddChange`, `FlowEdgeCenter`, `FlowEdgeChange`, `FlowEdgeComponentProps`,
`FlowEdgeComponentWithPathOptions`, `FlowEdgeConnectionMergeOptions`,
`FlowEdgeLabelOptions`, `FlowEdgeLabelPortalProps`, `FlowEdgeMergeOptions`,
`FlowEdgePath`, `FlowEdgePointerHandler`, `FlowEdgeRemoveChange`, `FlowEdgeRenderProps`,
`FlowEdgeRenderers`, `FlowEdgeReplaceChange`, `FlowEdgeSelectionChange`,
`FlowEdgeTextProps`, `FlowEdgeToolbarProps`, `FlowEdgesChangeHandler`,
`FlowEdgesDeleteHandler`, `FlowErrorHandler`, `FlowFinalConnectionState`,
`FlowFitBounds`, `FlowFitBoundsOptions`, `FlowFitView`, `FlowFitViewOptions`,
`FlowGraphController`, `FlowInitializeHandler`, `FlowInputEvent`, `FlowKeyBinding`,
`FlowMarkerOptions`, `FlowMarkerReference`, `FlowMarkerType`,
`FlowMiniMapNodeAttributeGetter`, `FlowMiniMapNodeProps`, `FlowMiniMapNodes`,
`FlowMiniMapProps`, `FlowNoConnection`, `FlowNode`, `FlowNodeAddChange`,
`FlowNodeChange`, `FlowNodeConnection`, `FlowNodeDimensionChange`,
`FlowNodeDragHandler`, `FlowNodeGeometry`, `FlowNodeOrigin`, `FlowNodePointerHandler`,
`FlowNodePort`, `FlowNodePositionChange`, `FlowNodeRemoveChange`,
`FlowNodeRenderProps`, `FlowNodeRenderers`, `FlowNodeReplaceChange`,
`FlowNodeResizeControlProps`, `FlowNodeResizeLineOptions`, `FlowNodeResizerProps`,
`FlowNodeSelectionChange`, `FlowNodeToolbarProps`, `FlowNodesChangeHandler`,
`FlowNodesDeleteHandler`, `FlowPadding`, `FlowPaddingUnit`, `FlowPaddingWithUnit`,
`FlowPanelPosition`, `FlowPanelProps`, `FlowPortConnection`, `FlowPortGeometry`,
`FlowPortPosition`, `FlowPortProps`, `FlowPortType`, `FlowPosition`, `FlowPosition3D`,
`FlowProps`, `FlowProviderProps`, `FlowReconnectHandler`, `FlowRect`,
`FlowResizeControlPosition`, `FlowResizeControlVariant`, `FlowResizeDirection`,
`FlowResizeEndHandler`, `FlowResizeEvent`, `FlowResizeGuard`, `FlowResizeHandler`,
`FlowResizeLinePosition`, `FlowResizeParams`, `FlowResizeParamsWithDirection`,
`FlowResizeStartHandler`, `FlowScrollPanMode`, `FlowSelectionChangeEvent`,
`FlowSelectionChangeHandler`, `FlowSelectionDragHandler`,
`FlowSelectionInteractionHandler`, `FlowSelectionMode`, `FlowSelectionRect`,
`FlowSetCenter`, `FlowSetCenterOptions`, `FlowSetViewport`, `FlowSimpleBezierEdgeProps`,
`FlowSmoothStepEdgeProps`, `FlowSmoothStepPathOptions`, `FlowSmoothStepPathParams`,
`FlowSnapGrid`, `FlowSnapshot`, `FlowState`, `FlowStepEdgeProps`,
`FlowStepPathOptions`, `FlowStore`, `FlowStoreState`, `FlowStraightEdgeProps`,
`FlowStraightPathParams`, `FlowSvgProps`, `FlowTransform`,
`FlowUnselectNodesAndEdgesParams`, `FlowViewport`, `FlowViewportChangeEndHandler`,
`FlowViewportChangeHandler`, `FlowViewportChangeStartHandler`,
`FlowViewportController`, `FlowViewportTransitionOptions`, `FlowZIndexMode`,
`UseFlowNodeConnectionsOptions`, `UseFlowNodesInitializedOptions`,
`UseFlowSelectionChangeOptions`, `UseFlowViewportChangeOptions`.

### Ownership and native semantic contracts

- **One owner per state channel.** Nodes, edges and viewport may independently
  be controlled or uncontrolled. Provider `initialNodes`/`initialEdges` are
  mount-only pre-canvas seeds followed by live controlled canvas inputs;
  `defaultNodes`/`defaultEdges` initialize an uncontrolled channel once.
  Standalone `Flow` creates a scoped provider. Child remounts do not reseed it.
  Controlled/default conflicts, duplicated defaults and an initial seed without
  the required controlled canvas owner MUST be rejected before mutation.
- **Controlled requests are not commits.** A change notification proposes an
  update; accepted external values own persistent controlled state. Without a
  change callback that channel is read-only, while focus and inspection remain
  available. Sequential updater reduction and subscription cleanup remain
  native runtime responsibilities.
- **One initial-fit owner.** Provider precomputed fit and canvas client initial
  fit cannot compete. Controlled viewport cannot silently compete with default
  or initial-fit requests. Live canvas geometry/constraints take over from
  provider seeds; invalid geometry or conflicting hydration inputs reject
  before state mutation.
- **Native notifications and decisions differ.** Value/context precedes input
  event. Notifications use action-first names such as `onChangeNodes`,
  `onChangeViewport`, `onClickNode`, `onStartNodeDrag` and `onEndNodeDrag`.
  `resolveDeletion` is an asynchronous decision resolver, not a notification
  or transition Action. Its result reports requested, committed or unchanged
  status per node/edge channel; deletion waits for the resolver, not indefinite
  external controlled feedback.
- **Capabilities and restrictions are separate axes.** Drag enablement and
  allowed mouse buttons are distinct; reconnect enablement and endpoints are
  distinct. Keyboard accessibility is positive `hasKeyboardAccessibility`.
  Invalid disabled/restriction combinations reject rather than acquire hidden
  precedence. Distance, speed, tolerance, culling and similar tuning controls
  retain their required capability while public exposure must meet the current
  caller-need and dependable-contract admission bar.
- **Native geometry has named results.** Edge paths return `FlowEdgePath`
  records retaining path, label position and offsets, not opaque tuples.
  Coordinate models, rectangles, boxes, dimensions and viewport transforms
  remain distinct. Pure collection merges take the base collection first.
  A data updater receives current data plus entity context; incomplete whole-
  entity replacement rejects instead of silently merging.
- **Ports, endpoints and connection lifecycle differ.** Port geometry, port
  type and the dragged connection endpoint have separate native contracts.
  Click and drag observations share one connection lifecycle with an explicit
  interaction discriminator. A successful click has valid final geometry;
  valid loose-mode connections must be renderable. Reconnection callbacks
  identify the actual dragged endpoint, not the stationary port type.
- **Experimental changes have one native pipeline.** Registered node/edge
  transformations apply consistently to queued and gesture-driven changes in
  controlled/uncontrolled channels, preserve explicit experimental status,
  support rejection through empty changes and clean up on unmount.
- **Styling targets real elements.** HTML roots use the existing BaseProps
  contract where appropriate; SVG owners use local `FlowSvgProps`. Providers
  and portal-only coordinators do not pretend to own DOM roots. Refs are React
  19 props and root/part styling inputs expose the full xstyle/className/style
  trio. DOM pass-through cannot overwrite reserved identity, roles or gesture
  ownership.
- **Marker ink preserves stroke and fill.** Per-marker ink wins over a default;
  null default ink inherits effective edge stroke. Open arrows have stroke and
  no fill; closed arrows use ink for both. Explicit SVG styling composes after
  base semantic paint with documented channel overrides. Null inheritance is
  resolved before CSS assignment and never changes marker kind or geometry.
- **One native stylesheet.** `@astryxdesign/flow/flow.css` carries independently
  authored styles under the existing package stylesheet contract. There are no
  XYFlow CSS compatibility entry points, vendor account state or graph-specific
  theme provider competing with Astryx's nearest Theme.

### Platform support

- Supported platform: Astryx's supported React and web platform. Native means
  an independently owned graph engine, not an implicit mobile-renderer promise.
  Static rendering accepts explicit geometry; interactive rendering uses the
  supported browser input platform.
- Unsupported behavior: third-party graph-engine delegation, a source-compatible
  facade, stable guarantees for unadmitted experimental APIs, or a parity claim
  based on names, declarations, stubs or partial coverage.
- Browser evidence: shipped native keyboard/pointer/touch interactions, themes,
  nested scopes, zoom, reduced motion and forced colors. Server and hydration
  fixtures use the native renderer. Performance records identify graph sizes
  and observable operation costs.

## Current-state impact

The standalone Flow package owns the graph runtime and complete native public
surface. The public-component API and `spec:AST-002` govern API admission;
React-component runtime owns state and resource rules; theme tokens own the
shared vocabulary; component-style authoring and `spec:AST-080` govern stylesheet
output. These records do not provide a graph engine or decide its native API.

Flow reuses those contracts without adding a graph dependency or token
vocabulary to Core. Consumer documentation describes native imports, provider
and instance ownership, controlled state, custom renderers and limits. Component
and module records project the admitted graph surface; an inventory alone does
not approve it.

## Verification

| Contract      | Evidence layer                                                          | Representative states                                                                           | Mutation or failure expectation                                                     |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| FR1           | Source/import and packed dependency-closure audit                       | Runtime, peer, dev/test, optional, transitive; isolated consumer                                | Any XYFlow implementation/type import or dependency fails                           |
| FR2, FR3, FR8 | Complete native capability mapping, entry-point and consumer type tests | Components, hooks, utilities, types, deprecated/experimental entries                            | Missing owner, lost capability, inert export or unsupported type reports incomplete |
| FR4           | Native state, change and subscription tests                             | Controlled/uncontrolled, no-op, reorder, replacement, deletion, nested nodes, concurrent render | Operations diverge across owners, lose identity or emit incorrect changes           |
| FR5           | Native render and server/hydration fixtures                             | Built-in/custom nodes/edges, labels, markers, handles, groups, explicit geometry                | Rendering loses content or a server path reads browser globals                      |
| FR6, FR7      | Real native keyboard/pointer/touch interactions                         | Drag/select/connect/reconnect, validate/cancel, pan/zoom/snap/fit, resize, toolbars, minimap    | Removing behavior changes a user result or leaves gesture state/resources active    |
| FR9           | Canonical visual and accessibility evidence                             | Themes/modes, focus/selection, disabled, zoom, reduced motion, forced colors                    | A missing rule loses a cue, resets state or regresses accessibility                 |
| FR10          | Packed consumer, full capability matrix and two-size performance        | Complete admitted surface at small/large graph sizes                                            | Missing package, stub, evidence or unresolved regression blocks full parity         |

## Decision log

### DEC-1 - Own the complete graph system

**Reference:** `spec:AST-104/DEC-1`
**Decider:** pending

Native ownership gives Astryx control of behavior, accessibility, theming, types
and dependency closure. Milestones partition the complete capability surface;
they do not reduce the final completion contract.

Rejected: a themed wrapper or upstream re-export, because another engine would
still own the behavior and remain a consumer dependency.

### DEC-2 - Native naming and capability parity

**Reference:** `spec:AST-104/DEC-2`
**Decider:** pending

An Astryx-native API follows the system's conventions and maps every required
capability explicitly. Literal source compatibility is not the objective;
renaming, locally authored event/type shapes and deliberate defect corrections
remain visible in the capability mapping.

Rejected: keeping upstream names and leaked implementation shapes solely to
advertise drop-in compatibility, which creates a second naming contract.

## Open questions

None.
