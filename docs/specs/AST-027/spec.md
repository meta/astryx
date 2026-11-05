---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-027
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-04
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture: [architecture:layer-runtime]
affects_families:
  [family:input-fields, family:layout-regions, family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: []
---

# Local stacking and browser top-layer routing system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layering": ["DEC-1", "DEC-2", "DEC-3", "DEC-4", "FR11"]
  }
}
```

## Intent

An Astryx component should be able to order its own painted parts without
changing how unrelated components, page content, or application chrome stack.
Menus, dialogs, and other floating interaction surfaces should escape ordinary
document stacking through Astryx's Layer system and the browser top layer, not
through larger `z-index` values.

This spec separates two mechanisms:

- **local stacking** orders parts inside one component-owned surface; and
- **top-layer routing** hosts floating interaction surfaces through
  [`architecture:layer-runtime`](../../architecture/layer-runtime.md).

A local number never becomes a claim on the whole page.

## Non-goals

- Define shadows, borders, or perceived elevation. Those remain visual-design
  concerns.
- Create a global numeric z-index scale or semantic page-wide z-index tokens.
- Change which interaction dismisses a menu, dialog, popover, or other overlay.
- Require `isolation: isolate` on components that have no local paint-order
  relationship.
- Treat a React portal as equivalent to browser top-layer promotion.

## Terms

- **Local layer:** a positioned or stacking-context descendant whose paint order
  is meaningful only inside one component-owned surface.
- **Isolation owner:** the component-owned element that establishes
  `isolation: isolate` for one local stacking relationship.
- **Surface owner:** the element that paints or directly owns the component
  surface whose parts are being ordered, including its background, border,
  clipping, or elevation boundary.
- **Floating interaction surface:** a menu, dialog, popover, tooltip, hover card,
  sheet, command surface, or similar UI that must escape ordinary content or
  clipping to perform its interaction role.
- **Browser top layer:** the platform stacking plane entered through native
  mechanisms such as the Popover API or modal `<dialog>`.

## Requirements

### Local stacking

- **FR1 — z-index is local only.** A `z-index` value in Astryx MUST order parts
  within one component-owned stacking relationship. It MUST NOT establish an
  ordering contract against unrelated components, application content,
  AppShell chrome, or another page region.
- **FR2 — The surface owns the isolation boundary.** Every local stacking
  relationship MUST have an `isolation: isolate` owner on the component surface
  that contains the relationship. The isolation boundary MUST live on the
  surface owner rather than an arbitrary page wrapper or distant ancestor.
- **FR3 — The isolation owner does not escalate itself.** The outer isolation
  owner MUST remain at its normal parent paint level. Local `z-index` values
  belong to descendants inside that owner. If a nested surface must be ordered
  inside a larger component, that larger component supplies another local
  isolation owner.
- **FR4 — Local values have no system-wide rank.** Values such as `-1`, `0`, `1`,
  `2`, or a dynamic local depth MAY express a relationship inside an isolation
  owner. The same value MAY mean something different in another component.
  Astryx MUST NOT document or depend on page-wide bands such as “inputs at 1,”
  “sticky content at 10,” or “overlays at 1000.”
- **FR5 — Fix the leaking owner, not the unrelated neighbor.** When a component
  part paints above unrelated UI, the fix MUST contain that part at its
  component-owned surface. Raising the unrelated header, shell, or neighbor to a
  larger value is not a conforming fix.
- **FR6 — Every local state stays contained.** Hover, focus, validation, drag,
  sticky, selected, resized, animated, and negative-layer states MUST remain
  inside the same isolation boundary. A state change MUST NOT promote the
  component surface into a page-level stacking competitor.

### Floating interaction surfaces

- **FR7 — Floating interactions use the Layer system.** Menus, dialogs,
  popovers, tooltips, hover cards, sheets, command surfaces, and equivalent
  floating interactions MUST use the hosting and promotion mechanisms owned by
  [`architecture:layer-runtime`](../../architecture/layer-runtime.md). A local
  component MUST NOT recreate that system with positioned DOM and page-level
  `z-index`.
- **FR8 — Browser promotion owns cross-surface order.** A floating interaction
  that must escape ordinary content or clipping MUST enter the browser top layer
  through the applicable Layer/native host. A body portal, a fixed position, or
  a larger number is not a substitute.
- **FR9 — Numeric values inside a top-layer host remain local.** A promoted
  surface MAY use locally isolated z-index values to order its own backdrop,
  panel, arrow, controls, or animation plates. Those values MUST NOT be treated
  as the reason the surface appears above page content or another native host.
- **FR10 — Existing Layer support boundaries remain authoritative.** Native
  Popover and modal-dialog behavior, corrective portals, anchored positioning,
  reduced browser fallback, and global-host admission continue to follow
  `architecture:layer-runtime` and
  [AST-003](../AST-003/spec.md). This spec does not authorize a component to
  bypass those contracts when native support is unavailable.
- **FR11 — In-flow UI remains in flow.** A label, status message, banner, sticky
  page region, focus ring, or other in-flow presentation does not become a
  floating interaction merely because it needs local paint ordering. It follows
  FR1–FR6 unless its owning contract explicitly assigns it to Layer.

### Implementation requirements

- **IR1 — Every shipped z-index is classified.** Before this spec ships,
  every production `z-index` in published package source and CLI-emitted template
  source MUST be classified as a contained local relationship, a local
  relationship inside a Layer/native top-layer host, or a migration gap.
  Unclassified values fail the migration.
- **IR2 — New leaks fail mechanically.** Repository checks MUST reject a new
  local z-index relationship that has no component-owned isolation surface.
  The check MAY use source metadata or a narrow allowlist for relationships
  whose owner cannot be derived statically, but an allowlist entry MUST name
  its owner and verification.
- **IR3 — Layer bypasses fail mechanically.** Repository checks MUST reject a
  new menu, dialog, popover, tooltip, hover card, sheet, command surface, or
  equivalent overlay that uses page-level z-index instead of the shared Layer
  or native top-layer path.
- **IR4 — Migrations remove obsolete bands.** When a surface is contained or
  moved into the top layer, obsolete page-wide z-index comments, constants,
  tokens, tests, and compensating neighbor values MUST be removed in the same
  change.

### Platform support

- Supported feature/engine floor: `isolation: isolate` defines local stacking in
  every browser supported by Astryx. Floating-surface support follows the matrix
  and reduced fallback in `architecture:layer-runtime`.
- Unsupported behavior: a browser below the native Layer feature floor receives
  the documented reduced fallback. It MUST NOT receive an undocumented global
  z-index ladder as an attempted top-layer polyfill.
- Browser evidence: local containment requires real-browser paint and hit-test
  evidence. Popover, modal-dialog, focus/inertness, and top-layer ordering require
  the real-browser matrix named by `architecture:layer-runtime`; Playwright WebKit
  does not substitute for Safari-specific evidence.

## Current-state impact

The repository already contains good examples of the intended local pattern:
Thumbnail, Calendar, ChatComposer, ChatLayout, CodeBlock, CheckboxInput,
RadioList, Switch, Slider, Field's attached-status wrapper, and the touch
DateInput panel place internal z-index relationships beneath a local
`isolation: isolate` owner. They are migration references, not blanket proof
that every descendant is correct.

The source audit covered published package source and CLI-emitted template source:
`packages/{core,lab,charts,richtext}/src` and
`packages/cli/assets/templates`, excluding tests and stories. It found 56
production declarations across 40 files and these current gaps:

| Surface                                                                                                | Current mechanism                                                                                                                                                                                                                       | Impact under this spec                                                                                                                                             | Required migration or proof                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared Field input wrappers, including TextInput, FileInput, TextArea, NumberInput, and RichTextEditor | `inputWrapperStyles.base` places the painted input surface itself at `z-index: 1`; only the attached-status composition adds an isolated wrapper; RichTextEditor also places its status icon at local `1` inside the unisolated surface | **Confirmed leak.** Detached and tooltip Field compositions compete directly with AppShell and later page content                                                  | Put isolation on the Field-owned surface for every variant, keep wrapper and status-icon layers beneath it, and remove the painted input surface's external rank |
| Production docsite component pages                                                                     | A live Chromium probe on `/components/TextInput` found a rendered input and the sticky AppShell header both at `z-index: 1` with `isolation: auto`; after the input was scrolled into the header, it won browser hit-testing            | **Confirmed user-facing leak.** A real component example covers navigation on the production route                                                                 | Preserve that route and overlapping-control relationship as a Chromium regression fixture; prove the contained field passes below unrelated sticky chrome        |
| AppShell header and skip link                                                                          | The sticky header uses `1`, the focused skip link uses `9999`, and the shell root is not isolated; only transparent content establishes a local isolation boundary                                                                      | **Confirmed page-level coupling.** AppShell exposes numeric bands for ordinary shell parts                                                                         | Isolate the AppShell-owned surface and use only local depths inside it; the skip link remains local AppShell content rather than a reusable global band          |
| ChatComposerDrawer and ChatDictationButton                                                             | The separately exported drawer root and dictation bars use `z-index: 1` without owning isolation; placement inside ChatComposer is only a consumer convention                                                                           | **Confirmed implicit-containment gaps.** Either export can be composed outside ChatComposer's isolated root                                                        | Give each exported part a component-owned isolation surface and keep its internal ordering local; do not rely on a consumer ancestor                             |
| InputGroup focus ordering                                                                              | A focused connected child uses `z-index: 1`; InputGroup composes Field through the detached path                                                                                                                                        | **Confirmed leak.** Focus ordering can escape the group                                                                                                            | Isolate the complete painted group owner and verify connected-border focus ordering against neighboring components                                               |
| SideNav sticky content                                                                                 | The sticky top region uses `z-index: 1`; the SideNav root is not isolated                                                                                                                                                               | **Confirmed leak.** Sticky navigation internals can compete with siblings                                                                                          | Add isolation to the SideNav surface; collapsed menus continue to use Popover/Layer                                                                              |
| Outline active indicator                                                                               | The positioned indicator uses `z-index: 1` beneath an unisolated root                                                                                                                                                                   | **Confirmed leak.** The visual indicator can compete outside Outline                                                                                               | Isolate the Outline root and keep the indicator relationship local                                                                                               |
| Table sticky columns and resize handle                                                                 | Sticky header/body cells use `3` and `1`, the row overlay uses `-1`, and the resize handle uses `1`; `TableScrollWrapper` is not isolated                                                                                               | **Confirmed leak.** Table internals can meet unrelated shell content                                                                                               | Isolate `TableScrollWrapper`; retain header/body/overlay/resize ordering beneath it and verify sticky states under shell chrome                                  |
| Resizable handles and local overlays                                                                   | Overlay root, hit area, and pill use `1` and `2`; no resized surface owner is isolated                                                                                                                                                  | **Confirmed leak.** Resize affordances can escape their region                                                                                                     | Isolate each resized panel or region owner, not only the handle descendant; verify drag and focus states against adjacent content                                |
| Lab Schedule and ChartZoom overlays                                                                    | Schedule uses `1`, dynamic event levels, and `20`; ChartZoom uses `1`; neither painted root is isolated                                                                                                                                 | **Confirmed leaks.** Visualization internals create page-level ranks                                                                                               | Isolate the Schedule and Chart painted roots; Chart also establishes the containing block required by its absolute toolbar                                       |
| ChartTooltip                                                                                           | The published Charts package renders the tooltip with `position: fixed` and `z-index: 9999` instead of Layer                                                                                                                            | **Confirmed Layer bypass and page-level leak.** It uses exactly the substitute prohibited by FR7–FR8                                                               | Route ChartTooltip through Layer's fixed mode and the browser top layer; keep tooltip-internal ordering inside its surface                                       |
| Lab ListInput and TransferList reorder indicators                                                      | Shared reorder styles use `z-index: 2`; ListInput's detached Field path is unisolated, while TransferList relies incidentally on `container-type`                                                                                       | **Confirmed gap for ListInput; implicit containment for TransferList is not the explicit contract**                                                                | Add explicit isolation to both painted owners and verify reorder hit-testing in Chromium                                                                         |
| CLI-emitted page templates                                                                             | Dashboard alert rail and Settings dialog use local `1`; Table filter uses reorder `2`; Kanban renders a fixed drag clone at `1000`                                                                                                      | **Generated leaks.** New consumer apps inherit implicit local boundaries and, for Kanban, a page-level floating band                                               | Add explicit surface isolation to local template relationships; route the Kanban drag clone through a visual-only Layer/top-layer host                           |
| Popover, Lightbox, and modal panel internals                                                           | Small values order arrows, controls, handles, panels, and tints inside native Popover or dialog hosts                                                                                                                                   | **Correct cross-page mechanism; local ownership still requires proof.** The browser host, not the number, places the surface above page content                    | Preserve top-layer hosting and add or identify an explicit isolation owner for each internal relationship                                                        |
| ToastViewport                                                                                          | The viewport enters `popover="manual"` but also carries `z-index: 500`                                                                                                                                                                  | **Redundant page-band value plus the AST-003 hosting gap.** Native promotion, not `500`, owns page-content order; current Toast can still sit behind a later modal | Complete AST-003's global host first or in the same change, then remove `500` and keep any internal ordering beneath an isolated viewport surface                |
| BottomSheet and BottomSheetSwitcher non-modal paths                                                    | Non-modal `dialog.show()` paths use static or dynamic values beginning at `1000`                                                                                                                                                        | **Confirmed global leaks.** A page band cannot provide dialog-layer semantics                                                                                      | Route non-modal hosting through Layer/native top-layer infrastructure; keep panel, handle, tint, action, and stack ordering locally isolated inside the host     |

Current source already routes Tooltip, HoverCard, Popover, DropdownMenu and its
submenus, ContextMenu, CommandPalette, modal Dialog, Drawer, Lightbox,
MobileNav, Tour, Date-input layers, and RadialTooltip through Layer, native
Popover, or `showModal()`. Their cross-page mechanism is directionally
conforming. The confirmed exceptions are ChartTooltip and the non-modal
BottomSheet and BottomSheetSwitcher paths. Toast is promoted but still has the
global-host limitation already owned by AST-003.

This table is an impact inventory, not an implementation approval. Each row still
requires its named browser evidence before migration lands. The exhaustive IR1
audit may add rows; a row may be cleared only with named ownership and evidence.

## Verification

| Contract | Verification                                                   | Representative states                                                                   | Mutation or failure expectation                                                                                                  |
| -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR6  | Source classification plus real Chromium paint/hit-test matrix | positive, zero, negative, sticky, focused, dragged, selected, and animated local layers | Removing the isolation owner lets a descendant cover an unrelated sibling; changing a local value never changes page-level order |
| FR2, FR3 | DOM ownership and computed-style assertions                    | painted surface root, nested local surface, transparent surface, consumer wrapper       | Isolation appears on a distant page ancestor, or the isolation owner itself competes through a page-level z-index                |
| FR5      | Before/after regression fixtures                               | docsite Field under sticky AppShell header; Table under shell chrome                    | A neighbor must be raised to make the fixture pass, or the leaking surface still wins hit-testing                                |
| FR7–FR10 | Layer unit tests and real browser top-layer matrix             | menu, submenu, dialog, popover, tooltip, hover card, sheet, CommandPalette, Toast       | Positioned DOM or a body portal replaces Layer, or a numeric band determines cross-surface order                                 |
| FR11     | Component and browser tests                                    | label/status overlap, sticky region, focus ring, banner                                 | In-flow UI is unnecessarily promoted, or its local paint state escapes its surface                                               |
| IR1      | Generated shipped z-index inventory checked in CI              | every published package and emitted template declaration                                | A declaration is missing, duplicated, or has no owner/classification                                                             |
| IR2, IR3 | Static-rule fixtures with valid and invalid examples           | isolated local component, leaking field, hand-built menu, native Layer surface          | A leak or Layer bypass passes, or a valid isolated relationship is rejected                                                      |
| IR4      | Changed-file and source scans                                  | migrated Field, AppShell, Table, Toast, BottomSheet, Drawer                             | Obsolete bands, comments, tests, or compensating values remain after migration                                                   |

### Completion criteria

This spec moves to `shipped` only when:

- every z-index in published package source and CLI-emitted template source has
  an owner and classification;
- every ordinary local relationship is contained by its component-owned painted
  surface;
- the real docsite Field/AppShell failure is reproduced before the fix and passes
  through local containment afterward;
- menus, dialogs, popovers, tooltips, hover cards, sheets, command surfaces, and
  equivalent overlays use the Layer/native top-layer path;
- numeric bands no longer determine cross-component, page-shell, or overlay
  order;
- mechanical checks reject a representative local leak and Layer bypass;
- the browser matrices for local containment and Layer hosting pass; and
- `architecture:layer-runtime` plus affected family/component records describe
  the shipped ownership without relying on this impact inventory.

## Decision log

### DEC-1 — z-index expresses local relationships only

**Reference:** `spec:AST-027/DEC-1`
**Decider:** `cixzhang`, `2026-09-04`

A z-index value belongs to one component-owned stacking relationship. Reusing a
number elsewhere creates no relationship between the components.

Rejected: a global scale that ranks inputs, sticky navigation, page chrome, and
overlays against one another. That scale turns every local change into a page-wide
compatibility problem.

### DEC-2 — Isolation lives on the component surface

**Reference:** `spec:AST-027/DEC-2`
**Decider:** `cixzhang`, `2026-09-04`

The element that owns the painted surface also establishes `isolation: isolate`.
Descendant z-index values can then order that surface's parts without escaping to
unrelated content.

Rejected: placing isolation on an arbitrary page wrapper or raising the surface
root itself. Both preserve hidden coupling between the component and its caller.

### DEC-3 — Floating interactions use the browser top layer through Layer

**Reference:** `spec:AST-027/DEC-3`
**Decider:** `cixzhang`, `2026-09-04`

Menus, dialogs, and equivalent floating interactions route through Astryx's Layer
system and applicable native top-layer host. Their cross-surface order comes from
the browser host and Layer contract, not a number.

Rejected: fixed positioning, a body portal, or a large z-index as a substitute for
Layer. These mechanisms do not provide native top-layer, modal, association,
positioning, or dismissal behavior.

### DEC-4 — Leaks are repaired at their owner

**Reference:** `spec:AST-027/DEC-4`
**Decider:** `cixzhang`, `2026-09-04`

When a Field or another component covers unrelated shell chrome, contain the
component at its own surface. Do not raise AppShell or add another global band.

Rejected: escalating the AppShell header to a larger page-level value. It can
pass a known comparison only by outranking today's values and leaves the next
larger value to recreate the same defect.

## Open questions

None.
