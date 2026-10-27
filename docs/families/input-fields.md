---
schema_version: 1
template_version: 1
kind: family
id: family:input-fields
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-20
owners: [cixzhang, imdreamrunner]
review_triggers: [behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Field/Field.test.tsx,
    packages/core/src/InputGroup/InputGroup.test.tsx,
    packages/core/src/TextInput/TextInput.test.tsx,
    packages/core/src/Selector/Selector.test.tsx,
    packages/core/src/Typeahead/Typeahead.test.tsx,
    packages/core/src/Tokenizer/Tokenizer.test.tsx,
    packages/core/src/inputFontFloor.test.ts,
  ]
members:
  [
    component:TextInput,
    component:TextArea,
    component:NumberInput,
    component:DateInput,
    component:DateRangeInput,
    component:DateTimeInput,
    component:TimeInput,
    component:FileInput,
    component:Selector,
    component:MultiSelector,
    component:ComplexSelector,
    component:Typeahead,
    component:Tokenizer,
  ]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
deciding_specs: [spec:AST-001/DEC-1, spec:AST-001/DEC-2, spec:AST-002/DEC-1]
---

# Input field family contract

## Intent

A person should encounter one coherent input system: state display, behavior,
appearance, and size use consistent treatment and API contracts across members.
Each component still owns the interaction model specific to the value it edits.

This record separates normative family requirements from shipped facts. The
frontmatter `verified_by` list names representative evidence anchors rather than
every member suite. The membership list and adoption table are exhaustive for
the current family; changes to any member still require its focused evidence.

## Membership rule

A component belongs when its primary public purpose is collecting or editing a
form value through a labeled field surface with a content lane. Members use
`Field` semantics or own an equivalent field shell and can participate in
`FormLayout`.

- **Members:** TextInput, TextArea, NumberInput, DateInput, DateRangeInput,
  DateTimeInput, TimeInput, FileInput, Selector, MultiSelector,
  ComplexSelector, Typeahead, and Tokenizer.
- **Collaborators:** Field and FieldStatus provide shared field chrome;
  FormLayout arranges fields; InputGroup groups members that explicitly adopt its
  capability contract; InputClearButton, Spinner, Tooltip, and BaseTypeahead provide
  shared affordance or interaction behavior. These collaborators are not members.
- **Excluded:** CheckboxInput, RadioList, Switch, and Slider use labeled-control
  models without this content/end-lane geometry. PowerSearch and ChatComposer
  are higher-level compositions that consume member behavior rather than define
  another field primitive. BaseTypeahead is a combobox engine without a field
  surface. RichTextEditor stays outside this family until a family adoption is
  recorded.

FR10 and DEC-7 also bind CheckboxList, RadioList, and Slider. They stay
outside this family's geometry rules, but they compose Field, and every
component that composes Field targets base props and styling the same way.

Membership follows public responsibility, not use of `inputWrapperStyles` or
another implementation helper.

## Shared owner

- This family owns the consistent cross-component treatment and API contract for
  input state display, behavior, appearance, and size. Sizing and end-control
  geometry are invariants within that broader purpose, not the purpose itself.
- `Field` owns the standalone label, description, status placement, and explicit
  `width` seam, and is the member's `container*` styling target under FR10 when
  it renders a box. A member omits its nested Field when a supported InputGroup
  owns the group label and supporting text.
- `FormLayout` owns outer arrangement, spacing, direction, and form-level
  optionality. It does not redefine a member's internal control geometry.
- `InputGroup` owns the row height (fixed today; it grows with a set text size
  under `spec:AST-102` FR4, and the fixed height is a gap), connected outer surface, edge alignment,
  and group-level focus presentation for admitted children. Admission follows the
  capability contract in FR3, not a permanent component allowlist; input-family
  membership alone does not imply support.
- Each admitted member owns the grouped adaptation that satisfies FR3. Ungrouped
  presentation and behavior remain component-owned and unchanged by admission.
  End controls may be ordinary flex items or a component-local lane; this family
  does not require one shared wrapper, measurement hook, target, custom property,
  or new public prop.
- Shared primitives retain their own visual and accessibility ownership. In
  particular, InputClearButton, Spinner, Tooltip, FieldStatus, and Icon do not
  become member-specific APIs when composed into a field.
- FieldStatus owns its direct `attached` and `detached` message-box
  presentations. Field owns composition with an input: it consumes `tooltip`
  before rendering FieldStatus and applies the member's supported placement
  contract.

## Canonical concepts

| Concept           | Values or states                                               | Default semantics                                                                                                                                         | Stability                                            |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| field shell       | standalone Field or supported InputGroup path                  | One label/status owner surrounds the control                                                                                                              | shipped pattern                                      |
| field size        | `sm`, `md`, `lg` where supported                               | Same-size single-line controls align without one state changing the row                                                                                   | approved family rule                                 |
| inline size       | intrinsic, explicit `Field.width`, or containing layout        | A member keeps its available inline size across value and busy-state changes                                                                              | approved rule; Selector exception below              |
| end controls      | absent, clear, busy, status, disclosure, or component content  | Every rendered control has non-overlapping space; absent controls leave no unexplained reserve                                                            | approved family rule                                 |
| grouped row       | standalone or admitted InputGroup child                        | InputGroup owns row height (grows with a set text size under `spec:AST-102` FR4), connected edges, and group focus; the child owns its grouped adaptation | approved capability contract; shipped adoption below |
| disabled reason   | absent or component-supported `disabledMessage`                | The reason remains keyboard- and assistive-technology-reachable while mutation stays blocked                                                              | approved family rule where exposed                   |
| input busy        | explicit `isLoading` or pending `changeAction` where exposed   | The field value is resolving or being saved                                                                                                               | approved by DEC-2 and AST-001                        |
| focus-zoom floor  | iOS or non-iOS text entry                                      | iOS text-entry controls floor rendered text at 16 CSS px to prevent focus zoom; other platforms retain theme sizing                                       | approved family rule                                 |
| source busy       | component-owned async search or option loading                 | Supporting data work is separate from input `isLoading`                                                                                                   | component/system-spec owned                          |
| Transition Action | absent or component-supported `changeAction`                   | Callback first, optimistic value next, Action in a transition, one busy presentation                                                                      | approved family rule where exposed                   |
| status placement  | `attached`, `detached`, or `tooltip` at the input-family layer | Attached is the default where the member supports safe overlap; detached and tooltip remain available to every input                                      | approved family rule                                 |
| prop targets      | base props, `container*`, `control*`                           | Base props reach the primary semantic control; `container*` reaches Field; `control*` reaches the control box; no root styling input                      | approved by DEC-7                                    |

## Cross-component invariants

- **FR1 — Inline size is stable across ordinary field states.** In the same
  containing layout, a member MUST NOT change its outer available inline size
  merely because placeholder content becomes a value, or because a busy,
  status, or clear control appears. Explicit `width`, parent layout, and
  responsive constraints still apply. Standalone Selector is the DEC-1
  exception and may follow its displayed content.
- **FR2 — Rendered end controls own non-overlapping space.** Text, tokens, the
  caret, and selected content MUST NOT paint or receive pointer input underneath
  a clear action, Spinner, status control, disclosure, or component-owned end
  content. A lane that is absent MUST NOT leave stale or unexplained space.
  This is an observable requirement, not a mandate for measurement or a shared
  lane primitive.
- **FR3 — InputGroup admission requires a complete grouped adaptation.** Any input
  member MAY participate when its owning component explicitly adopts grouped mode
  and proves all of the following: it resolves a compatible control height and size
  from the group; removes or suppresses competing outer Field, border, radius, and
  surface geometry; delegates the connected outer border, radius, and group-level
  focus presentation coherently; keeps content within the single-row group geometry
  through component-owned truncation, folding, clipping, or overflow; and preserves
  the input's accessible name and description, value semantics, keyboard behavior,
  focus behavior, and editing or selection model. Admission follows these
  capabilities rather than a permanent allowlist. Family membership or context
  consumption alone is insufficient.
- **FR4 — Disabled reasons remain reachable where supported.** When a member
  exposes `disabledMessage`, the inactive field remains focusable
  (`spec:AST-085`) and exposes the reason while editing, selection, and
  activation stay blocked.
  Components without that public concept are not required to add it.
- **FR5 — Input loading describes the value, not supporting data.** Where a
  member exposes `isLoading`, it means the field value is resolving or being
  saved. It MUST NOT make independently supplied options unavailable or change
  a data-source prop's contract. Initial option-source pending is the separate
  explicit state required by AST-001.
- **FR6 — Transition Actions preserve immediate feedback.** Where a member
  exposes `changeAction`, every documented value-change path runs `onChange`
  first, presents the proposed controlled value optimistically, runs
  `changeAction` in a React transition, and contributes to the same busy
  presentation until the controlled value accepts or replaces it.
- **FR7 — Component-owned source work keeps family geometry and accessibility.**
  Typeahead and Tokenizer own asynchronous search state through BaseTypeahead,
  not through the family `isLoading` meaning. Their visible source-busy feedback
  still MUST be named, expose busy semantics on the combobox — or, in a
  presentation without a combobox, such as Tokenizer's sheet
  (`component:Tokenizer` DEC-3), on the result list the search updates — and
  satisfy FR1, FR2, and FR3 where grouped.
- **FR8 — Status placement follows member capability.** Every input MUST offer
  `detached` and `tooltip`. A member supports `attached` only when its direct
  control is opaque, bordered, fixed-height (a height set by its resolved size,
  which grows with a set text size under `spec:AST-102` FR4), and its owning root reliably
  reflects the resolved size used for overlap. Where supported, `attached` is
  the default. Wrapped, custom, tall, or translucent surfaces normally use
  `detached` or a component-owned placement. Direct FieldStatus continues to
  support only `attached` and `detached`; Field consumes `tooltip` before
  rendering it.
- **FR9 — The focus-zoom floor is iOS-specific.** A text-entry control that uses
  the family focus-zoom guard MUST resolve its editable text to at least 16 CSS
  px on the supported iOS touch path. Android, desktop touch, and other non-iOS
  coarse-pointer environments MUST keep the active theme's type scale rather
  than inheriting the iOS floor. The platform-detection mechanism remains an
  implementation detail, but it MUST preserve those observable outcomes.
- **FR10 — Base props reach the control; styling reaches named parts only.**
  This is the input family's exception to base styling: where
  `architecture:public-component-api` and `spec:AST-071` give a component a root
  `xstyle`, `className`, and `style`, a Field-composed component has none. In
  every component that composes Field:
  1. `ref`, `id`, `data-*` (including `data-testid`), `aria-*`, `hidden`,
     `inert`, `dir`, and DOM event handlers MUST reach the primary semantic
     control: the native input, textarea, or combobox/trigger element that
     carries the field's accessible name and value. For a group input
     (RadioList, CheckboxList) the primary semantic control is the group element
     (`role="radiogroup"` or `role="group"`); per-option props stay on the option
     API.
  2. The component's props type MUST NOT accept root `xstyle`, `className`, or
     `style`; passing one is a type error. A development build warns when an
     untyped caller passes one at runtime, and the value is not applied.
  3. `containerXstyle`, `containerClassName`, and `containerStyle` MUST reach the
     Field box when one renders. Where none renders (inside InputGroup, and in
     horizontal-label FormLayout, where Field lays out its children directly in
     the form's columns), they have no effect and a development build warns;
     inside InputGroup the caller styles the group.
  4. `controlXstyle`, `controlClassName`, and `controlStyle` MUST reach the
     visual control box: the element that paints the field border and
     background and contains its icons and end controls. They never target the
     native input. Each set is one `spec:AST-071` part set.
  5. Styling never reroutes: no layout moves `container*` to the control box or
     `control*` to Field.

  Component-owned value callbacks (`onChange(value)`) are typed out of base
  props and keep their value signature. Retargeting a base prop changes the
  element a consumer DOM handler reaches, not its order or cancellation behavior:
  a component keeps the order and cancellation it released and states any order
  that differs from component-first composition in its docs and JSDoc. A handler
  a component forwards for the first time composes component-first through the
  shared composition helper. No component and no layout may vary the prop
  targets.

- **FR11 — The clear control's tooltip names the action, not the field.**
  Every member's clear control MUST show the localized generic tooltip "Clear"
  on hover and keyboard focus, whatever the field's label or the scope of the
  clear. Its accessible name stays contextual and member-owned, such as "Clear
  Search" or "Clear all Countries", and contains the visible word.

## Allowed component variation

- **AV1 — Native versus composed control.** Text fields may use native inputs;
  selection controls may use button/listbox or dialog composition.
- **AV2 — End-control mechanism and meaning.** A member may use in-flow flex
  items or a component-local out-of-flow lane and may render clear, busy,
  status, disclosure, stepper, or documented custom content. The mechanism does
  not weaken FR1 or FR2.
- **AV3 — Block-axis growth and grouped adaptation.** TextArea and Tokenizer may
  grow in the block axis for multiline or multi-token content while ungrouped.
  InputGroup admission does not change those standalone defaults. In grouped mode,
  an admitted component owns a presentation that satisfies FR3. Tokenizer is
  admitted on that basis and, when the caller does not choose another supported
  overflow mode, MUST default to a component-owned overflow treatment that preserves
  the group's single-line appearance. This grouped default does not require a new
  public prop or theme target.
- **AV4 — Action callback shape.** Text-editing members may pass their change
  event to `changeAction`; structured-value members may pass only the proposed
  value. Component docs own the exact callback type.
- **AV5 — Supported concepts vary.** A member need not add `size`, `isLoading`,
  `changeAction`, `disabledMessage`, clear, or InputGroup support merely to join
  the family. When it exposes one of those concepts, the matching family rule
  applies.
- **AV6 — Attached-status support.** A member that cannot satisfy FR8 keeps
  attached unavailable rather than approximating the overlap. It still offers
  detached and tooltip through the family status contract.
- **AV7 — Platform detection.** Implementations may use any supported capability
  test that identifies the iOS touch path without applying the floor to non-iOS
  coarse pointers. This contract does not require a particular CSS query,
  browser string, or shared helper.

## Representative matrix

| Member and state                                                    | Shared invariant                                                                                                                                         | Deliberate variation                                                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| TextInput / empty, valued, or input-busy                            | Stable inline size; in-flow end controls do not overlap text                                                                                             | Native input and optional clear/status controls                                                               |
| Selector / placeholder or selected                                  | End controls and grouped row remain bounded                                                                                                              | Standalone inline size may follow displayed content under DEC-1                                               |
| Typeahead / empty, selected, or source-busy                         | Stable inline size and one non-overlapping end area, standalone and grouped                                                                              | Editable input becomes a selected Token; source busy is BaseTypeahead-owned                                   |
| Tokenizer / standalone tokens, source-busy, and endContent          | Stable inline size and clear content/end-control separation                                                                                              | Standalone tokens may wrap and grow the field in the block axis                                               |
| Tokenizer / admitted InputGroup mode                                | Group height, connected surface, semantics, and keyboard behavior remain coherent                                                                        | Grouped default uses a single-line overflow treatment; caller-selected supported overflow may vary within FR3 |
| ComplexSelector / placeholder, selected, or input-busy              | Stable field surface and non-overlapping Spinner/disclosure                                                                                              | Caller owns rich popup content; no shipped InputGroup support                                                 |
| Admitted member / InputGroup                                        | Compatible size/height, one outer surface/focus owner, one-row geometry, and preserved semantics                                                         | Component owns its internal grouped truncation, folding, clipping, or overflow                                |
| Member with `disabledMessage`                                       | Reason is reachable; mutation remains blocked                                                                                                            | Component owns the focus target and Tooltip composition                                                       |
| Member / validation status                                          | Detached and tooltip are available; attached is default only when supported                                                                              | Component owns whether its control safely satisfies attached eligibility                                      |
| Floored text entry / iOS touch                                      | Editable text resolves to at least 16 CSS px and focus does not trigger browser zoom                                                                     | Theme size may already satisfy the floor                                                                      |
| Floored text entry / non-iOS coarse pointer                         | The active theme's type scale remains in force                                                                                                           | Platform and input hardware may vary                                                                          |
| Field-composed component / standalone, horizontal-label, InputGroup | Base props on the primary semantic control; `container*` on the Field box where one renders; `control*` on the control box; root styling is a type error | `container*` has no effect where no Field box renders                                                         |

## Adoption and exceptions

### Current shipped facts

| Component       | Current adoption                                                                                                           | Recorded exception                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| TextInput       | Field, FormLayout, InputGroup, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                | none                                                                                                                                            |
| TextArea        | Field, FormLayout, size, width, `isLoading`, `changeAction`, status, and disabled reason; block-axis growth                | not InputGroup-compatible                                                                                                                       |
| NumberInput     | Field, FormLayout, InputGroup, size, width, clear, status, and disabled reason                                             | no shipped `isLoading` or `changeAction`                                                                                                        |
| DateInput       | Field, FormLayout, InputGroup, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                | none                                                                                                                                            |
| DateRangeInput  | Field, FormLayout, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                            | not InputGroup-compatible                                                                                                                       |
| DateTimeInput   | Field, FormLayout, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                            | not InputGroup-compatible                                                                                                                       |
| TimeInput       | Field, FormLayout, InputGroup, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                | none                                                                                                                                            |
| FileInput       | Field, FormLayout, width, `isLoading`, `changeAction`, clear, status, and disabled reason                                  | no public `size`; compact and dropzone modes are component-owned                                                                                |
| Selector        | Field, FormLayout, InputGroup, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                | DEC-1 permits standalone content-sized width                                                                                                    |
| MultiSelector   | Field, FormLayout, InputGroup, size, width, `isLoading`, `changeAction`, clear, status, and disabled reason                | trigger-display modes remain component-owned                                                                                                    |
| ComplexSelector | Field, FormLayout, size, width, `isLoading`, `changeAction`, and status                                                    | no InputGroup or disabled-reason API                                                                                                            |
| Typeahead       | Field, FormLayout, InputGroup, size, width, clear, status, disabled reason, and BaseTypeahead source loading               | no family `isLoading` or `changeAction`; search lifecycle is component-owned                                                                    |
| Tokenizer       | Field, FormLayout, size, width, clear, status, disabled reason, BaseTypeahead source loading, and multi-token block growth | Not InputGroup-compatible on current main; DEC-5 approves admission after the grouped adaptation lands; no family `isLoading` or `changeAction` |

The current text-entry controls that already carry a 16px anti-zoom floor apply it
only on iOS. This includes input-family members and the existing shared or
higher-level text-entry collaborators covered by the family-wide source guard;
DEC-6 does not require unrelated components to add a new floor.

### Implementation gaps

- **Typeahead state geometry:** current main removes the intrinsic-width input
  from layout when a selected Token is shown, so a content-sized parent can
  collapse the field onto the value. Its clear control is separately positioned,
  and current source-busy feedback is an in-flow static clock without
  `aria-busy`; selected, source-busy, and grouped combinations do not have the
  focused geometry coverage required by FR1–FR3 and FR7. PRs
  [#5555](https://github.com/facebook/astryx/pull/5555) and
  [#5682](https://github.com/facebook/astryx/pull/5682) document attempted
  implementations and are non-authoritative evidence. Any implementation keeps its
  DOM/CSS mechanism component-owned and must be reviewed against this contract at
  its exact head.
- **Tokenizer state geometry and grouped admission:** current main positions
  `endContent` and clear controls out of flow without reserving their rendered
  width, so narrow input content can pass underneath them. Token count can also
  change intrinsic inline size. PR #5555 is non-authoritative evidence of an
  attempted component-local reserve. Tokenizer is not InputGroup-compatible on
  current main; DEC-5 admits it once its grouped path satisfies FR3 and defaults to
  a single-line overflow treatment without changing ungrouped behavior. [#4405](https://github.com/facebook/astryx/pull/4405)
  is implementation evidence to review against that authority, not a Tokenizer-only
  exception or authority by itself.
- **Selector source-state semantics:** Selector and MultiSelector keep provided
  options available while input `isLoading` is true, but current empty/no-result
  presentation still treats that flag as option-source pending and neither
  component has the explicit source-pending API required by AST-001.
- **Transition Action coverage:** current TextInput and FileInput clear
  affordances call `onChange` without `changeAction`, and FileInput does not
  explicitly hold the proposed controlled files as an optimistic value while
  its Action is pending. Other exposed clear paths inspected on current main
  route through their ordinary Action pipeline. These are conformance gaps
  under FR6, not alternate family semantics.
- **Status placement conformance:** current Field defaults attached for arbitrary
  children without proving the control satisfies FR8. TextArea, Tokenizer, and
  FileInput's dropzone are representative tall, wrapped, or custom surfaces that
  cannot inherit attached solely from the shared default. Some member docs also
  omit tooltip or the whole status-placement projection even though Field
  consumes the family sentinel. Follow-up work must make attached capability and
  the three input-level choices accurate in each member's API and docs.
- **Attached FieldStatus overlap:** attached placement is limited to eligible
  members whose direct control and owning root reliably expose resolved size.
  Eligible members preserve attached placement; unsupported wrapped, custom, tall,
  and translucent surfaces retain component-owned placement, normally detached.
  [PR #5769](https://github.com/facebook/astryx/pull/5769) is non-authoritative
  evidence of an attempted implementation that derives overlap from a descendant
  `data-size`; that mechanism does not by itself establish eligibility or root-size
  ownership.
- **Prop targets:** current components do not yet meet FR10. Every component
  below accepts root `xstyle`/`className`/`style`, and none accepts `container*`
  or `control*`. Today's targets:

  | Component                          | Root styling reaches | Base props reach                       | Primary semantic control    | Root styling migrates to |
  | ---------------------------------- | -------------------- | -------------------------------------- | --------------------------- | ------------------------ |
  | TextArea                           | control box          | native textarea                        | native textarea             | `control*`               |
  | FileInput                          | control box          | native file input                      | native file input           | `control*`               |
  | DateInput (pointer, native, touch) | control box          | control box                            | date input                  | `control*`               |
  | DateRangeInput                     | control box          | control box; `ref` on a trigger button | range trigger               | `control*`               |
  | DateTimeInput (pointer, touch)     | control box          | control box                            | date-time input             | `control*`               |
  | TimeInput (typed, native, touch)   | control box          | not forwarded                          | time input                  | `control*`               |
  | Selector                           | control box          | trigger button                         | trigger button              | `control*`               |
  | MultiSelector                      | control box          | not forwarded                          | trigger button              | `control*`               |
  | ComplexSelector                    | control box          | control box                            | trigger button              | `control*`               |
  | Typeahead                          | Field                | Field                                  | combobox input              | `container*`             |
  | Tokenizer                          | Field                | Field                                  | combobox input              | `container*`             |
  | CheckboxList                       | Field                | Field                                  | `role="group"` element      | `container*`             |
  | RadioList                          | Field                | not forwarded; `ref` on Field          | `role="radiogroup"` element | `container*`             |
  | Slider                             | Field                | not forwarded; `ref` on the track      | slider control              | `container*`             |

  Conformance is an approved removal of root
  styling; an `astryx upgrade` codemod rewrites each component's root styling to
  the part it reaches today, per the last column. A codemod cannot follow
  styling passed through a product wrapper's own props or spread; FR10's type
  error surfaces those callsites.

- **Verification coverage:** current unit tests prove composition, semantics, and
  individual state behavior, but do not yet provide the complete real-browser
  inline-size/end-overlap matrix below. This current record names those
  implementation gaps rather than claiming they are already fixed.

The verification map names representative evidence, not every member suite.
The exhaustive coverage obligation follows the membership and adoption tables.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                  | Representative members and states                                                                                                 | Mutation or failure expectation                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1      | Real-Chromium before/after inline-size measurements in block, flex-item, inline-block, grid auto-track, and explicit-width containers                                                                                                         | TextInput baseline; Selector exception; Typeahead empty/selected/source-busy; Tokenizer zero/one/many tokens                      | Value or busy state changes the field's outer inline size outside a recorded exception                                                                                                                                   |
| FR2      | Real-Chromium content-box/control-box overlap matrix at narrow supported widths and LTR/RTL                                                                                                                                                   | clear, Spinner, status, disclosure, Tokenizer `endContent`; alone and combined                                                    | Content, caret, or pointer hit area intersects a rendered end control, or stale reserve remains after it unmounts                                                                                                        |
| FR3      | InputGroup unit tests plus rendered size/height, surface/focus-ownership, overflow, and interaction checks                                                                                                                                    | every admitted member; Tokenizer zero/one/many tokens, focused/unfocused, explicit/default overflow; mismatched child/group sizes | A child keeps competing outer geometry, expands or adds a row, loses connected focus/border ownership, or changes naming, keyboard, focus, editing, or selection semantics                                               |
| FR4      | Keyboard, pointer, and accessibility-tree tests                                                                                                                                                                                               | each member that exposes `disabledMessage`                                                                                        | Reason becomes unreachable, or the disabled control mutates/activates                                                                                                                                                    |
| FR5      | Selector and MultiSelector interaction and announcement tests from AST-001                                                                                                                                                                    | populated options while input-busy; explicit source-pending; completed empty                                                      | Input busy suppresses supplied options or substitutes for source state                                                                                                                                                   |
| FR6      | Focused callback/order/optimistic/busy tests for every Action-capable mutation path                                                                                                                                                           | typing, selection, calendar/preset, file selection, and clear where exposed                                                       | Callback/Action order changes, optimistic feedback disappears, or a clear path bypasses the Action contract                                                                                                              |
| FR7      | Typeahead/Tokenizer source-busy tests and real-browser geometry checks                                                                                                                                                                        | direct BaseTypeahead, standalone wrappers, grouped Typeahead, selected/tokenized values                                           | Busy feedback is unnamed/duplicated, `aria-busy` is absent, or source loading changes row/inline geometry                                                                                                                |
| FR8      | Representative member tests plus real-browser overlap/opacity/height checks                                                                                                                                                                   | eligible single-line direct controls; wrapped, custom, tall, and translucent controls; all three placements                       | Attached is missing where supported, appears where unsafe, or tooltip reaches direct FieldStatus                                                                                                                         |
| FR9      | `inputFontFloor.test.ts`, focused computed-style checks, and real iOS Safari focus evidence                                                                                                                                                   | iOS touch, non-iOS coarse pointer, and desktop fine pointer                                                                       | iOS renders below 16 CSS px or focus zooms, or a non-iOS coarse pointer receives the iOS-only floor                                                                                                                      |
| FR10     | A type test over every Field-composed component's props that fails if one accepts root `xstyle`, `className`, or `style`; per-component render tests for every base prop, `container*`, and `control*` prop and for both development warnings | every Field-composed component standalone, in horizontal-label FormLayout, and inside InputGroup where admitted                   | A component type-checks with root styling, a base prop lands off the primary semantic control, `container*` lands off the Field box or on the control box, `control*` lands off the control box, or a warning is missing |
| FR11     | `InputClearButton.test.tsx` tooltip and accessible-name assertions, plus real-Chromium hover captures                                                                                                                                         | a long field label; a locale override; light and dark                                                                             | The tooltip repeats the field label, or the accessible name loses the field label                                                                                                                                        |

## Decision links

### DEC-1 — Selector is the standalone inline-size exception

**Decider:** `cixzhang`, `2026-08-30`

Selector belongs to the input-field family, but a standalone Selector may size
with its displayed placeholder or selected value. This exception does not remove
constraints imposed by FormLayout, a supported InputGroup, or explicit product
layout.

### DEC-2 — Input loading describes value resolution or saving

**Decider:** `cixzhang`, `2026-08-30`

For members that expose `isLoading`, it describes the field value resolving or
being saved. It does not mean option or supporting data is loading. Data-source
props keep their normal contract while the value is busy.

`spec:AST-001/DEC-1` and `spec:AST-001/DEC-2` apply that distinction to Selector
and MultiSelector: provided options stay available, zero options is a no-choice
state, and initial option-source pending must be explicit.

### DEC-3 — Transition Actions are an input-family contract

**Decider:** `cixzhang`, `2026-08-30`

The optional `changeAction` API and its optimistic/pending behavior belong to the
input family. Component docs own each value and event type, but members do not
independently redefine callback ordering, optimistic feedback, or busy-state
semantics.

Public API admission remains owned by `spec:AST-002/DEC-1`; this family adds no
separate invalid-state or API-guardrail policy.

### DEC-4 — Attached status is conditional capability, not universal geometry

**Decider:** `cixzhang`, `2026-08-31`

Every input offers detached and tooltip status placement. A member offers
attached only when its direct control is opaque, bordered, fixed-height, and its
owning root reliably reflects the resolved size used for overlap. Attached is the
default whenever it is supported. Wrapped, custom, tall, or translucent surfaces
normally use detached or retain component-owned placement. A fixed height is
one set by the resolved size, which grows with a set text size under
`spec:AST-102` FR4.

Direct FieldStatus remains limited to attached and detached presentation. Tooltip
is an input-family composition that Field consumes before rendering FieldStatus.

Rejected: deriving universal attached overlap from any descendant `data-size`,
because descendant metadata does not prove the direct surface is opaque,
bordered, fixed-height, or the owner of that resolved size.

### DEC-5 — InputGroup admission is capability-based

**Decider:** `cixzhang`, `2026-09-09`

InputGroup compatibility is not a closed component allowlist. Any input-family
member may participate when its component contract and implementation explicitly
adopt grouped mode and satisfy FR3: compatible resolved size and control height, no
competing outer Field or surface geometry, coherent connected border/radius/focus
ownership, single-row group geometry, and unchanged input semantics and keyboard
behavior.

Tokenizer is admitted under this rule. Its ungrouped wrapping and overflow defaults
remain unchanged. In grouped mode, when no supported overflow mode is selected by
the caller, Tokenizer defaults to a component-owned treatment that preserves the
group's single-line appearance. The implementation may reuse its existing overflow
surface; this decision adds no public prop, callback, theme target, or generic
InputGroup branch.

Rejected: a permanent hard-coded allowlist, a Tokenizer-only exception, allowing
context consumption without a complete grouped adaptation, or forcing standalone
multiline/multi-token inputs into single-line presentation.

### DEC-6 — The 16px focus-zoom floor applies only on iOS

**Decider:** `cixzhang`, `2026-09-20`

Text-entry controls that carry the anti-zoom safeguard resolve editable text to at
least 16 CSS px on the supported iOS touch path. Other coarse-pointer platforms
keep the active theme's type scale because they do not share the iOS focus-zoom
behavior this safeguard addresses.

The contract owns the observable platform outcomes, not a particular feature
query or source pattern. Existing shared and higher-level text-entry surfaces may
reuse the family rule without becoming input-family members, and this decision
does not require unrelated controls to adopt a new floor.

Rejected: applying the 16px floor to every coarse pointer. Pointer precision does
not establish the iOS browser behavior and inflates text on Android and
input-capable touch laptops without preventing a corresponding zoom failure.

### DEC-7 — Field-composed components forbid root styling

**Decider:** `cixzhang`, `2026-10-11`

A caller passing a base prop to a field wants the control a person operates, so
`ref`, ids, test ids, ARIA, and handlers reach the primary semantic control. A
field has two styleable surfaces, the whole field and its visual control box,
and a root `xstyle` would have to pick one silently. So the family declares an
exception to base styling: no root styling input, only `container*` for Field
and `control*` for the control box, each one AST-071 part set. A product wrapper
that spreads props into an input then gets a type error at the callsite, rather
than a visual move a codemod cannot see. Each part keeps one target in every
member and layout; where its element does not render, the part has no effect
rather than moving to another element.

Rejected: keeping root `xstyle` and routing it to Field; spreads and wrappers would move styling silently.

### DEC-8 — Prop retargeting keeps each component's handler order

**Decider:** `cixzhang`, `2026-10-11`

When a consumer handler runs relative to the component's own, and whether it can
cancel built-in behavior, are released interaction behavior that
`architecture:public-component-api` INV9 keeps stable. Moving base props to the
semantic control changes which element a consumer handler reaches, not that
behavior, so a component keeps the order and cancellation it released and
documents any order that differs from component-first composition.
Component-first cancelling composition applies only to handlers a component
forwards for the first time.

Rejected: composing every retargeted handler component-first; a consumer that
cancels built-in behavior, or that observes events the component cancels, would
change behavior with no API change to signal it.

### DEC-9 — The clear tooltip names only the action

**Decider:** `cixzhang`, `2026-10-13`

The field's label already sits beside the clear glyph, so a sighted person
needs only the action. Repeating the label makes long or noun-phrase labels
read as awkward copy. A screen-reader user does not see the field around the
button, so the accessible name keeps the label.

Rejected: a tooltip that repeats the accessible name; it doubles the label on screen.

## Open questions

None.

## Content boundary

This record owns only cross-component field behavior. Component props,
selection/search algorithms, visual target maps, implementation mechanisms,
current audit results, and product-specific compositions remain with their
component, architecture, design, audit, or callsite owners.
