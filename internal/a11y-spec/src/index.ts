// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Re-exports the browser-free surface of @astryxdesign/a11y-spec
 * @output Contract vocabulary, completeness checklist, harness seam, runner,
 *   report, the jsdom harness, and the authored pattern contracts, including
 *   Carousel collection, slide, and focus semantics. A pattern
 *   exports a helper here only when a BINDING needs it — a helper the contract
 *   uses internally stays module-private.
 * @position Package entry point. The Chromium harness is deliberately NOT here:
 *   it imports Playwright, and the jsdom lane must never drag a browser in. It
 *   is a separate entry, `@astryxdesign/a11y-spec/chromium`.
 *
 * SYNC: When a pattern is authored, export it here and list it in README.md
 */

export {
  NotApplicableHere,
  citeSource,
  definePattern,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
  type ApgRequirement,
  type Applicability,
  type AstryxRecord,
  type Enforcement,
  type Expectation,
  type ExpectationContext,
  type InitialFocusEntryObservation,
  type NormativeSource,
  type PatternContract,
  type WcagCriterion,
  type WebStandardRequirement,
} from './contract';

export {
  CHECKLIST_DIMENSIONS,
  type ChecklistDimension,
  type ChecklistDimensionId,
  type ChecklistExemption,
} from './checklist';

export {
  EVIDENCE_LAYERS,
  MissingHarnessRelation,
  UnobservableError,
  type ComputedNode,
  type EvidenceLayer,
  type Harness,
  type Key,
  type Subject,
} from './harness';

export {
  MissingBindingCapability,
  checkAccessibilitySpec,
  unmatchedKnownFailures,
  type BindingResult,
  type CheckAccessibilitySpecOptions,
  type ExpectationResult,
  type KnownFailure,
  type ResultStatus,
} from './check';

export {
  expectAccessibilitySpec,
  type ExpectAccessibilitySpecOptions,
} from './expect';

export {
  blockingResults,
  formatFailures,
  neverExercised,
  formatReport,
  summarize,
  type Report,
  type ReportCounts,
} from './report';

export {createJsdomHarness, type JsdomHarnessOptions} from './harness/jsdom';

export {
  TEXT_INPUT_PATTERN,
  type TextInputStateFacts,
} from './patterns/text-input';

export {CHECKBOX_PATTERN, type CheckboxStateFacts} from './patterns/checkbox';

export {
  RADIO_GROUP_PATTERN,
  type RadioGroupRole,
  type RadioGroupStateFacts,
} from './patterns/radio-group';

export {SWITCH_PATTERN, type SwitchStateFacts} from './patterns/switch';

export {
  MODAL_DIALOG_PATTERN,
  type ModalDialogStateFacts,
} from './patterns/modal-dialog';

export {
  STATUS_MESSAGE_PATTERN,
  type StatusMessageStateFacts,
} from './patterns/status-message';

export {saysInOrder, spokenWords} from './spoken';

export {BUTTON_PATTERN, type ButtonStateFacts} from './patterns/button';

export {TABS_PATTERN, type TabsStateFacts} from './patterns/tabs';

export {LISTBOX_PATTERN, type ListboxStateFacts} from './patterns/listbox';

export {
  SPINBUTTON_PATTERN,
  type SpinbuttonStateFacts,
} from './patterns/spinbutton';

export {
  TOGGLE_BUTTON_PATTERN,
  type ToggleButtonStateFacts,
} from './patterns/toggle-button';

export {
  DISCLOSURE_PATTERN,
  type DisclosureStateFacts,
} from './patterns/disclosure';

export {
  BREADCRUMB_PATTERN,
  type BreadcrumbStateFacts,
} from './patterns/breadcrumb';

export {
  COMBOBOX_PATTERN,
  type ComboboxPopupRole,
  type ComboboxStateFacts,
} from './patterns/combobox';

export {
  LANDMARK_PATTERN,
  type LandmarkRole,
  type LandmarkStateFacts,
} from './patterns/landmark';

export {SLIDER_PATTERN, type SliderStateFacts} from './patterns/slider';
export {
  PROGRESSBAR_PATTERN,
  type ProgressbarStateFacts,
} from './patterns/progressbar';
export {TREE_VIEW_PATTERN, type TreeViewStateFacts} from './patterns/tree-view';
export {CAROUSEL_PATTERN, type CarouselStateFacts} from './patterns/carousel';
export {
  ACCORDION_PATTERN,
  type AccordionStateFacts,
} from './patterns/accordion';
export {GRID_PATTERN, type GridStateFacts} from './patterns/grid';
export {
  ALERT_DIALOG_PATTERN,
  type AlertDialogStateFacts,
} from './patterns/alert-dialog';
export {
  WINDOW_SPLITTER_PATTERN,
  type WindowSplitterStateFacts,
} from './patterns/window-splitter';
export {
  MENU_BUTTON_PATTERN,
  type MenuButtonStateFacts,
} from './patterns/menu-button';
export {MENU_PATTERN, type MenuStateFacts} from './patterns/menu';
export {
  LINK_PATTERN,
  type LinkCurrentToken,
  type LinkStateFacts,
} from './patterns/link';
export {
  TABLE_AST_020_FR15,
  TABLE_PATTERN,
  composeTablePattern,
  tableApgRequirement,
  type TableModuleContract,
  type TableStateFacts,
} from './patterns/table';
export {TOOLBAR_PATTERN, type ToolbarStateFacts} from './patterns/toolbar';
export {TOOLTIP_PATTERN, type TooltipStateFacts} from './patterns/tooltip';
