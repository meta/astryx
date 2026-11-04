# @astryxdesign/a11y-spec

Reusable accessibility spec tests: one standards-traceable contract per adopted
widget pattern, bound to the components that implement it. **Internal and
unpublished.**

Authored under [`docs/specs/AST-020`](../../docs/specs/AST-020/spec.md)
(how a contract is written) and
[`docs/specs/AST-021`](../../docs/specs/AST-021/spec.md)
(how existing component tests migrate into one). Read those first; this file
explains the code that implements them.

## Why a contract instead of more component tests

Take the switch pattern. Every component that adopts it owes the same things: the
control is reported as a switch, it has a name that does not change when the
state does, its on/off state is exposed and matches what is rendered, pointer
and keyboard both turn it on and back off, a press slid off and released
elsewhere is taken back, focus stays put when the state changes, and focus can
reach the control and leave it. Writing that per component means reinterpreting
WCAG and the APG each time, and the interpretations drift.

So the pattern is written once, as data, and components bind to it. A binding
says which states it has and what each state is supposed to be; the contract
asks the browser what it actually exposes.

## Shape

```
src/
├── contract.ts    Expectation, PatternContract, definePattern (the schema gate)
├── checklist.ts   the completeness dimensions every pattern must answer
├── harness.ts     the Harness/Subject seam and the evidence-layer vocabulary
├── check.ts       checkAccessibilitySpec — low-level result for reports/mutation proof
├── expect.ts      expectAccessibilitySpec — component-facing render + subject assertion
├── report.ts      separate facts, and the gate over them
├── harness/
│   ├── jsdom.ts       observes unit + DOM. Refuses everything above.
│   └── chromium.ts    observes DOM + accessibility tree + real browser.
├── spoken.ts      how a visible label is compared against a computed name
├── storybook.ts   a static server over a built Storybook, for the browser lane
└── patterns/
    ├── radio-group.*        the radio-group pattern, same four files
    ├── checkbox.*           the checkbox pattern, same four files
    ├── switch.*             the switch pattern, same four files
    ├── button.*             the button pattern, same four files
    ├── text-input.*         the native text-input pattern, same four files
    ├── modal-dialog.*       the native modal-dialog pattern, same four files
    ├── status-message.*     live-region and progress status mechanics
    ├── tabs.*               explicit horizontal ARIA Tabs semantics
    ├── listbox.*            listbox, group, and option semantics
    ├── spinbutton.*         numeric role, value, bounds, state, and arrow stepping
    ├── disclosure.*         standalone disclosure state/content semantics
    ├── menu-button.*        a control's button role and name, aria-haspopup, expanded state, controls, and keyboard opens
    ├── menu.*               a displayed menu's role and name, item roles/names/checked/disabled state, and arrow/Home/End/Enter/Escape/Tab keys (typeahead advisory)
    ├── toolbar.*            a toolbar's role and name, orientation, controls inside it, one Tab stop, and arrow (with wrap, RTL-mirrored, Down/Up when vertical) and Home/End keys
    ├── tooltip.*            a tooltip's role, the trigger described by it, keyboard focus showing it, Escape dismissing it, and hover keeping it (blur, hover-show and pointer-leave advisory)
    ├── window-splitter.*    a focusable resize separator's role, name, position/bounds, pane relationship, and arrow/Enter keys (Home/End advisory)
    ├── grid.*               a composite grid's role, name, row/cell structure, single Tab stop, selection, and arrow/Home/End/Enter keys
    ├── alert-dialog.*       a confirmation surface's alertdialog role, title/message references, modality, initial focus, Escape and click-beside dismissal
    ├── carousel.*           non-rotating collection, slide, off-screen, and focus semantics
    ├── tree-view.*          a tree's roles, names, expanded state, one Tab stop, and arrow/Home/End/Enter-or-Space/typeahead movement
    ├── slider.*             a thumb's role, name, values, text, orientation, and arrow/Page/Home/End keys (RTL-mirrored arrows)
    ├── progressbar.*        a progress indicator's role and name, value and range or indeterminate state, value text, and a subtree with nothing focusable
    ├── accordion.*          a group's header role and name, panel state, single-expansion collapse, page Tab order
    ├── breadcrumb.*         landmark, list-trail, current-page, and separator semantics
    ├── combobox.*           control identity, state, popup, and active-descendant semantics
    ├── landmark.*           one component-owned landmark region's role, name, and content boundary
    ├── link.*               one available link's role, name, current state, focus, and activation
    └── table.*              a static data table's role and name and its header and cell roles; Table modules compose their own semantics
```

## The patterns

| Pattern          | Adopted from                                                                                                                                             | Bound by                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `radio-group`    | [APG radio group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)                                                                                       | RadioList, SegmentedControl; role/state portions of DropdownMenu radio items                                                                                                                                                                                                                             |
| `checkbox`       | [APG checkbox](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/)                                                                                       | CheckboxInput, CheckboxListItem, DropdownMenuCheckboxItem, SelectableCard                                                                                                                                                                                                                                |
| `switch`         | [APG switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)                                                                                           | Switch                                                                                                                                                                                                                                                                                                   |
| `button`         | [APG button](https://www.w3.org/WAI/ARIA/apg/patterns/button/)                                                                                           | Button, IconButton, ClickableCard, SideNavCollapseButton, ChatSendButton                                                                                                                                                                                                                                 |
| `toggle-button`  | Toggle-button semantics in the [APG button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)                                                    | ToggleButton, including standalone and grouped states                                                                                                                                                                                                                                                    |
| `text-input`     | Native HTML controls and [WAI-ARIA textbox](https://www.w3.org/TR/wai-aria-1.2/#textbox)                                                                 | TextInput, TextArea                                                                                                                                                                                                                                                                                      |
| `modal-dialog`   | [APG dialog (modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)                                                                             | Dialog                                                                                                                                                                                                                                                                                                   |
| `status-message` | [WCAG 2.2 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)                                                             | Toast, FieldStatus, Spinner, ChatSystemMessage, ChatTypingIndicator, ProgressBar                                                                                                                                                                                                                         |
| `tabs`           | [APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)                                                                                               | Explicit `role="tablist"` TabList, Tab, and caller-authored tabpanels                                                                                                                                                                                                                                    |
| `listbox`        | [WAI-ARIA 1.2 Listbox](https://www.w3.org/TR/wai-aria-1.2/#listbox) and WCAG 2.2 semantics                                                               | Selector and MultiSelector popup listbox, group, and option parts                                                                                                                                                                                                                                        |
| `spinbutton`     | WCAG 2.2 semantics and [APG Spinbutton](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/)                                                            | NumberInput                                                                                                                                                                                                                                                                                              |
| `disclosure`     | [APG Disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)                                                                                   | Standalone Collapsible triggers and their controlled content                                                                                                                                                                                                                                             |
| `menu-button`    | [APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) required parts; the optional ArrowDown/ArrowUp opens Astryx ships are advisory  | Anchored DropdownMenu and MoreMenu triggers: button role and name, `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, Enter/Space open on the first enabled item (advisory: ArrowDown on the first, ArrowUp on the last)                                                                          |
| `menu`           | [APG Menu and Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) menu; arrows (with wrap) and Home/End per AST-020 FR15; typeahead advisory     | DropdownMenu pointer menu: named `menu`, item roles/names, `aria-checked`, `aria-disabled`, arrows with wrap, Home/End, Enter and Escape back to the trigger, Tab out (advisory: typeahead)                                                                                                              |
| `toolbar`        | [APG Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/); arrows (with wrap) and Home/End per AST-020 FR15                                       | Toolbar: named `toolbar`, `aria-orientation`, controls inside it, one Tab stop entering on the first enabled control, next/previous arrows (RTL-mirrored, Down/Up when vertical) with wrap, Home/End                                                                                                     |
| `tooltip`        | [APG Tooltip](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) role and relationship per AST-020 FR15; WCAG 1.4.13; three rows advisory                | Tooltip, useTooltip: `tooltip` role, `aria-describedby` and computed description, focus shows it (focus stays), Escape dismisses, hover keeps it over trigger and tooltip (advisory: blur hides, hover shows, pointer leaving hides)                                                                     |
| `accordion`      | [APG Accordion](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) required parts                                                                      | CollapsibleGroup headers: button role and name, expanded state, controlled panel, Enter/Space, single-expansion sibling collapse, page Tab order, no arrow-key movement (single-expansion collapse, grouped Tab order, no arrow movement are advisory until `component:CollapsibleGroup` AR4 is current) |
| `breadcrumb`     | WCAG 2.2 semantics; [APG Breadcrumb](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/) as context                                                    | Breadcrumbs landmarks, list trails, current-page state, and separators                                                                                                                                                                                                                                   |
| `combobox`       | WCAG 2.2 + [WAI-ARIA 1.2 Combobox](https://www.w3.org/TR/wai-aria-1.2/#combobox); APG as context                                                         | Selector trigger identity, state, popup, and active-descendant relationships                                                                                                                                                                                                                             |
| `landmark`       | WCAG 2.2 semantics; [APG Landmark Regions](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/) as context                                               | LayoutHeader, LayoutContent, LayoutFooter, and LayoutPanel caller-declared landmarks                                                                                                                                                                                                                     |
| `slider`         | [APG Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) role, values, name, orientation and keys                                                  | Slider thumbs: role, name, now/min/max, value text, orientation, arrows (RTL-mirrored), Page, Home/End, disabled keeps value                                                                                                                                                                             |
| `progressbar`    | WCAG 2.2 4.1.2 and [WAI-ARIA 1.2 progressbar](https://www.w3.org/TR/wai-aria-1.2/#progressbar); no APG pattern exists                                    | ProgressBar, Lab CircularProgress: progressbar role and name, now/min/max, indeterminate claims no value, value text, no focusable descendants (target marks sit beside the bar)                                                                                                                         |
| `treeview`       | [APG Tree View](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) structure and keyboard model                                                         | TreeList rows: tree/treeitem/group, aria-expanded, level/position, one Tab stop, Up/Down, Right/Left (RTL-mirrored), Home/End, Enter or Space, typeahead                                                                                                                                                 |
| `carousel`       | [APG Carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) and WCAG 2.2 semantics                                                                | Carousel container, slides, scroll area, and stable navigation-control focus                                                                                                                                                                                                                             |
| `alertdialog`    | [APG Alert Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/) role, references, modality, focus, dismissal                                   | AlertDialog: alertdialog role and name, aria-describedby to the message, modal, Cancel first (advisory), Escape closes, click beside inert (advisory); modal mechanics stay with the modal-dialog contract through Dialog                                                                                |
| `grid`           | [APG Grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) role, structure, name, selection and data-grid keys                                           | Calendar month grids: grid role/name, row and gridcell/columnheader structure, one Tab stop, aria-selected/aria-multiselectable, arrows in reading order, Home/End, Enter selects (advisory)                                                                                                             |
| `windowsplitter` | [APG Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/) role, values, name, relationship and keys                                | ResizeHandle: separator role/name, now/min/max, orientation, aria-controls to the pane, arrows, Enter collapse/restore, Home/End, disabled keeps position                                                                                                                                                |
| `link`           | WCAG 2.2 semantics; [APG Link](https://www.w3.org/WAI/ARIA/apg/patterns/link/) role and Enter mechanics                                                  | Link, including LinkProvider and `as` router components                                                                                                                                                                                                                                                  |
| `table`          | [APG Table](https://www.w3.org/WAI/ARIA/apg/patterns/table/) roles and name per AST-020 FR15; no keyboard (the pattern defines none); modules add theirs | Table, in data-driven and children mode: table role and name, `row`/`columnheader`/`rowheader`/`cell` roles inside the table; the sort module adds `aria-sort` on sorted headers only                                                                                                                    |

The `progressbar` contract owns what one rendered progress indicator exposes in
each state: the progressbar role and the operation's name (never a meter or a
status), its value inside its range, no value or value text while progress is
unknown, its formatted value text, and a subtree with nothing a keyboard can
land on, since a progressbar's descendants are presentational. Whether that
exposure survives progress and completion updates without moving focus stays
with the `status-message` contract; clamping, ring geometry, and the target
marks' own Tooltip triggers stay with the components. Spinner exposes a status,
not a progressbar, so it binds only to `status-message`.

The toggle-button contract owns the persistent-action extension of button
semantics: the pressed state must be exposed, reversible by pointer, Enter, and
Space, stable under an aborted press, and inert when unavailable. It also checks
that changing state keeps focus and reports APG label stability as advisory
because current Astryx authority does not make that APG-only detail a gate.
ToggleButtonGroup naming, selection coordination, Action ordering, pending
feedback, and rendered appearance keep their existing component, family, and
visual owners.

The `spinbutton` contract owns NumberInput's required role, persistent name,
committed numeric value, optional bounds and formatted value text, disabled and
read-only exposure, and keyboard reachability. ArrowUp and ArrowDown stepping
are recorded as advisory APG evidence because no current Astryx authority
adopts those mechanics as a shared requirement. Typed draft parsing,
formatting, commit/clamp policy, callbacks, optional buttons, and date/time
segments keep their existing owners.

The disclosure contract owns only the disclosure-specific state, optional
trigger-to-content relationship, synchronized visibility, and complete pointer,
Enter, and Space transitions. Generic role, naming, focus navigation, and
unavailable-button semantics remain in the existing `button` contract. This first
migration binds standalone Collapsible states only; CollapsibleGroup coordination
and Accordion, Table, and SideNav adoption remain outside this contract.

The breadcrumb contract owns the named navigation landmark, list trail,
optional current-page state, and decorative separator exposure. Its first
Breadcrumbs binding covers explicit and automatic current-page selection, a
custom landmark label, RTL/supporting presentation, and an intentional
no-current-page opt-out. Link, action-button, and sibling-menu semantics stay
with their own patterns; the APG Breadcrumb page remains context because no
current Astryx record adopts it as an additional required gate.

The combobox contract owns the named control, expanded/busy/read-only state,
its relationship to a rendered popup, and a declared active descendant. Its
first Selector binding covers closed, open, read-only, busy, and bottom-sheet
trigger states plus the search input with an active option. While a binding's
own modal dialog popup makes the combobox inert, the browser correctly leaves it
out of the accessibility tree, so the identity expectation does not apply there.
Popup contents keep the existing listbox contract. `spec:AST-020/FR15` adopts
the APG Combobox required parts, including Tab plus Enter or Space activation,
wherever a part plays the combobox role; each adopter's record names them and its
interaction suites verify the keyboard and selection parts.

The landmark contract owns one component-owned landmark region: the role the
binding declares, the label it declares, and the content the region bounds. It
reports the APG unique-label principle for same-role peers as advisory because
no current Astryx record adopts it as a gate. Its first binding covers the four
Layout region components with caller-supplied roles and labels, including
repeated navigation panels under RTL and a region nested in a main landmark.
Role-less regions, one main landmark per page, top-level placement, and whether
all page content sits in a landmark stay with Layout's own tests, the page, and
AppShell; an isolated region never claims page-wide landmark completeness.

The link contract owns one available navigation link: the link role, the
exact name its binding declares, `aria-current` only when the link is the
current item, Tab entry and exit, and exactly one navigation from Enter or from
a pointer press released on the link, with none from a press slid off it. Every
gate is a WCAG 2.2 outcome; the APG Link page supplies the role and Enter
mechanics those outcomes rest on. Its first binding covers Link as a native
anchor, an icon-only labelled link, a caller-marked current page, an external
new-tab link, and router components supplied through LinkProvider and `as`.
Destination safety stays with `family:navigation-destinations`, disabled links
keep their member-owned semantics, and navigation aggregates such as
breadcrumbs, side and top navigation, citations, and clickable cards bind
separately.

The table contract owns a static data table: the table role, the label its
binding declares, the `row`, `columnheader`, `rowheader`, and `cell` roles of
the rows, headers, and cells the binding designates, and each header and cell's
place in a row of the table. `spec:AST-020/FR15` adopts the APG Table pattern's
role, name, and row and cell roles because Table already plays the table role;
the pattern defines no keyboard interaction, so none is adopted. Each Table
module brings its own accessibility semantics as a module contract owned beside
the module and composed onto the base with `composeTablePattern`, only for the
states a binding renders with that module: the sort module contract
(`packages/core/src/Table/plugins/sortable/__tests__/useTableSortable.a11y.ts`)
adds `aria-sort` on exactly the sorted column headers, and a later module (tree
or grid rows, for example) brings its semantics the same way. The first binding covers a labelled data-driven table, a table sorted
through `useTableSortable`, a composed right-to-left table named by a visible
heading with row headers, and the default empty state. Captions, spans, row and
column counts and indexes, and the rows and controls that selection, expansion,
grouping, and tree modules add stay with their modules and later bindings, and
the filter button and resize separator that sit inside header cells bind with
their modules; the Scroll region keeps its own browser evidence.

The `listbox` contract is a bounded semantic migration, not blanket APG
interaction adoption. Its first bindings cover 21 existing scenarios across
single/multiple selection, disabled options, groups, filtering, custom content,
RTL, hidden labels, sheet presentations, loading, and select-all states.
Chromium records two exact existing failures: the no-search bottom-sheet
listboxes for Selector and MultiSelector have no accessible name. Search-sheet
variants and the other bound states pass; the exact failures remain visible debt
under WCAG 2.2 4.1.2, not conformance or remediation.
Trigger/search semantics, selection algorithms, keyboard/focus policy, empty
representation, callbacks, forms, styling, and real-AT claims keep their named
owners. The completeness exemptions make those limits visible rather than
claiming whole-component conformance.

The `radio-group` contract owns direct-group Tab entry/exit, Space, and adopted
directional selection, including zero-selection entry. DropdownMenu radio roles
and selection state are bound here, while its composite keyboard movement stays
with Menu. Home and End remain component-local because the current APG radio
pattern does not require them and no current Astryx record adopts them as shared
behavior.

The `status-message` contract is WCAG-derived rather than an APG widget
pattern. Required expectations cover browser-exposed status/alert roles and
channels, complete exposed text or names across every public update, preserved
focus, and progressbar role/name/range/value transitions. ARIA22's
container-before-update technique and the roles' overridable implicit atomic
defaults remain advisory reliability evidence. Repetition, timing, order, and
omission remain real assistive-technology outcomes.

The `text-input` contract is native rather than APG-derived. It covers the
role-bearing `<input>` or `<textarea>` only; composed clear and tooltip buttons
keep their button contract. Password fields bind to persistent naming, state,
focus, and editing expectations, while HTML-AAM defines no corresponding ARIA
role and leaves their protected value representation platform-specific.

The button pattern covers the ordinary command button. A toggle button carries
`aria-pressed` and is its own pattern; anything that adopts link semantics — an
Astryx button given `href` renders an anchor — belongs to the link pattern,
because the APG is explicit that the two functions are distinct.

Some patterns need something the control itself cannot show. A switch says
whether it is on, so "pressing it worked" is readable from the control; a
button's action leaves no trace on the button at all. A pattern like that reads
`activations()` from the run context, and the BINDING supplies the count — a
binding that does not makes every expectation reading it fail loudly, never
pass quietly.

Ordering-sensitive focus expectations similarly read `initialFocusEntry()`.
The binding starts recording before its subject can receive focus and supplies
whether the subject was already in its native modal state at the first entry;
a missing observation is a binding fault, not a contract pass or failure.

## Evidence layers are the load-bearing idea

An expectation names the layer that characterizes its claim, plus — in
`alsoNeeds` — any further layer its own body reads. An interaction expectation
is the usual case: "clicking turns it on" is a real-browser claim, but reading
the resulting state is an accessibility-tree observation, so it needs both. A
harness declares which layers it can observe, and the runner will not run an
expectation whose layers a harness cannot all see — it reports `unrun`, naming
the ones that were out of reach.

That is why the jsdom lane is small. jsdom renders markup; it does not compute
an accessibility tree, resolve a real tab sequence, or turn a key press into an
activation. Reporting those as passes because the attributes look right is the
exact failure [`AST-009`](../../docs/specs/AST-009/spec.md) is written against,
so this package reports them as unrun instead and proves them in Chromium.

| Status            | Meaning                                               | Gates                              |
| ----------------- | ----------------------------------------------------- | ---------------------------------- |
| `pass`            | the outcome was observed                              | —                                  |
| `fail`            | the outcome was absent                                | when the expectation is `required` |
| `known-failure`   | the exact recorded historical failure, still failing  | no                                 |
| `unexpected-pass` | a recorded failure that now passes; delete the record | yes                                |
| `not-applicable`  | this state cannot exercise the outcome                | —                                  |
| `unrun`           | a layer this expectation reads was out of reach here  | —                                  |

No status is averaged into another, and there is no score. A pattern with one
required failure is not "mostly conformant" (AST-021 FR11).

## Authoring a pattern

1. Read the applicable WCAG criteria and versioned web standards, plus the APG
   pattern only when a current Astryx record adopts one.
2. Write the expectations. Each needs a stable id, a user outcome in plain
   language, exact sources, an applicability condition, an evidence layer (plus
   `alsoNeeds` for any further layer its body reads), and an enforcement class.
   `definePattern` refuses anything less.
3. Answer every completeness dimension in `checklist.ts` — either an expectation
   names it in `covers`, or the pattern exempts it with an owner, a verification
   method, and a real reason. A criterion the pattern owns only part of takes
   both: the expectation, plus an exemption marked `coversRemainderOnly` naming
   who holds the rest, so the encoded half never implies the whole. Reports
   print those as `part-encoded … — remainder → owner`, distinct from a plain
   `exempt`. `unansweredDimensions` lists what is left, and the pattern's suite
   asserts that list is empty.

   Applicability is normally declared, in `appliesWhen`, where a reader can see
   it. When it can only be discovered from the page — 2.5.3 has nothing to
   compare when nothing is rendered visibly — call `notApplicable(reason)` from
   the run. It reports `not-applicable` with that reason; returning early would
   report a pass, which claims an outcome was observed.

4. Write a conforming fixture per state and a violating fixture per expectation,
   then prove each expectation fails against its own violation. An expectation
   nobody has watched fail is a claim, not a check (AST-020 FR11).

`required` is earned by a directly applicable WCAG 2.2 A/AA criterion, or by a
current Astryx record adopting the outcome — never by how easy the check was to
write.

An Astryx record can therefore make an expectation gate, so citing one is held
to the same standard as citing a specification: name the record (`family:buttons`),
name the clause (`FR3`), quote the requirement exactly, and link to a public
GitHub URL pinned to a full commit sha. `definePattern` refuses anything less —
a branch or tag link moves out from under the quote, and a link into an internal
system is one a reviewer of this repository cannot open. Quote the operative
sentence only: splicing a MUST to the MAY that follows it cites a requirement
the record does not make. "Directly applicable" means the criterion is the expectation's PRIMARY
source: a supporting citation further down the list is not adoption, or any
expectation could buy a gate by appending a plausible criterion. Everything else
is `advisory` and has to say why.

## Binding a component

A binding lives with the component:

```
packages/core/src/Switch/__tests__/
├── Switch.a11y.states.ts          which states exist and what each declares
├── Switch.a11y.known-failures.ts  what does not work yet, exactly
├── Switch.a11y.test.tsx           the jsdom lane
└── Switch.a11y.chromium.spec.ts   the Chromium lane, over checked-in stories
```

The binding designates its own subject — by role for a conforming component, by
a fixture-owned hook for a deliberately violating fixture — so a mutation flips
exactly the expectation under test instead of making the subject unfindable.

Component-specific behaviour does not move: callbacks, form data, composition,
and styling stay in the component's own suite (AST-021 FR5).

The fast component lane uses the assertion API directly, so the test visibly names
the accessibility specification, the component render, and its role-bearing subject:

```tsx
await expectAccessibilitySpec({
  spec: BUTTON_PATTERN,
  binding: state.binding,
  state: state.id,
  facts: state.facts,
  render: () => render(<Button label="Save" />),
  subject: () => screen.getByRole('button'),
  cleanup,
});
```

`expectAccessibilitySpec` fails the test on required failures and unexpected passes.
Lower-level contract fixtures, Chromium bindings, report generation, and mutation
proof use `checkAccessibilitySpec`, which returns the complete factual result without
asserting it.

Some stateful patterns ask the binding to perform named public transitions. The
binding drives each transition through its public API; the contract then
re-observes the current semantic subject. Transition names describe user-visible
state changes rather than component-private implementation steps.

## Known failures

A known failure names one expectation, one binding, one state, one evidence
layer, the exact standards reference, the exact failure, the user impact, and why
the migration is not the place to fix it. It still runs, it still fails, and is
reported as debt. Operational ownership stays in the project's durable gap
registry rather than in public source. The record matches the complete failure
message, not a
substring; a different message, another state, or a wider failure remains a
`fail` rather than being absorbed by the record. Required failures gate;
advisory failures remain report-only under AST-020 FR9. A full binding sweep
also requires every record to match exactly one executed result, so deleted
states and renamed expectations cannot orphan debt. An expectation that starts
passing is reported as an unexpected pass so that exact stale record is deleted;
the separately owned operational gap is reconciled only when no remaining record
refers to it (AST-021 FR8–FR10).

## Running

```bash
# jsdom lane — part of `pnpm test`
pnpm vitest run --project node internal/a11y-spec
pnpm vitest run --project ui packages/core/src/Switch
pnpm vitest run --project ui packages/core/src/FieldStatus/__tests__/StatusMessage.a11y.test.tsx
pnpm vitest run --project ui packages/lab/src/Chat/__tests__/ChatTypingIndicator.a11y.test.tsx

# Chromium lane — needs a browser and a built Storybook
pnpm storybook:build
npx playwright install chromium
pnpm test:a11y-contract
```

## What this package does not claim

It does not report what an assistive technology says. Speech, braille,
announcement timing and order, virtual-cursor entry, and known AT/browser
divergence are the real-AT layer, and they are governed by
[`AST-009`](../../docs/specs/AST-009/spec.md), not by anything here. It also
does not replace axe, the visual gate, or manual review: contrast, target size,
forced colors, and motion are measured from pixels, and every pattern records
who owns them instead of pretending otherwise.
