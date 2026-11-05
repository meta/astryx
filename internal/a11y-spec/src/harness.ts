// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.ts
 * @input None (pure declarations)
 * @output The evidence-layer vocabulary and the Harness/Subject seam every
 *   expectation is written against.
 * @position The runtime seam of @astryxdesign/a11y-spec. One contract, many
 *   harnesses: a harness declares which evidence layers it can observe, and the
 *   runner refuses to run an expectation the harness cannot see.
 *
 * The layers and their boundaries are the ones in the accepted records:
 * `docs/specs/AST-020/spec.md` FR6 lists them; `docs/specs/AST-009/spec.md`
 * bounds what each one proves. The rule that makes them worth having is that a
 * lower layer may not claim a result only a higher layer observes — so jsdom
 * never reports a computed accessible name, and no automated layer ever reports
 * what a screen reader says.
 *
 * SYNC: A new harness implements this file and updates
 * - /internal/a11y-spec/README.md
 */

export const EVIDENCE_LAYERS = [
  'unit',
  'dom',
  'accessibility-tree',
  'axe',
  'real-browser',
  'visual',
  'lint',
  'manual',
  'real-at',
] as const;

export type EvidenceLayer = (typeof EVIDENCE_LAYERS)[number];

/**
 * What the browser computes for a node. Only an engine can answer this.
 *
 * Properties are nullable when the engine does not expose them for a role. For
 * example, Chromium emits `required` for native textboxes but not checkboxes;
 * callers must not substitute a DOM guess for a missing tree property.
 */
export interface ComputedNode {
  /** Computed role, e.g. `switch`. */
  readonly role: string | null;
  /** Computed accessible name. */
  readonly name: string;
  /** Computed accessible description. */
  readonly description: string;
  /** Text descendants the engine keeps in this node's accessibility subtree. */
  readonly accessibleText: string;
  /** Computed live-region channel, or null when this node is not live. */
  readonly live: 'off' | 'polite' | 'assertive' | null;
  /** Whether the accessibility tree exposes the live region as atomic. */
  readonly atomic: boolean | null;
  /** Computed text value, or null when the node exposes no value. */
  readonly value: string | null;
  /** Numeric range value when the accessibility node exposes one. */
  readonly rangeValue: number | null;
  readonly rangeMin: number | null;
  readonly rangeMax: number | null;
  readonly valueText: string | null;
  /** Whether the engine exposes the subject as modal. */
  readonly modal: boolean | null;
  /** Whether the engine exposes the textbox as multi-line. */
  readonly multiline: boolean | null;
  /** Whether the engine exposes the control as read-only. */
  readonly readOnly: boolean | null;
  /** Whether the engine exposes the control as required. */
  readonly required: boolean | null;
  /** Computed pressed state for toggle buttons, or null when none is exposed. */
  readonly pressed: 'true' | 'false' | 'mixed' | null;
  /** Computed checked state, or null when the node exposes none. */
  readonly checked: 'true' | 'false' | 'mixed' | null;
  /** Computed selected state, or null when the node exposes none. */
  readonly selected: boolean | null;
  readonly disabled: boolean;
  readonly invalid: boolean;
}

/** The element a binding designates as the pattern's control. */
export interface Subject {
  /** DOM layer: an attribute exactly as authored. */
  attribute(name: string): Promise<string | null>;
  /**
   * DOM layer: resolve an id-list attribute (`aria-describedby`,
   * `aria-labelledby`) to the text of each referenced element. A `null` entry
   * is an id that resolves to nothing — a description the user never gets.
   */
  idReferences(attribute: string): Promise<readonly (string | null)[]>;
  /** Real-browser layer: visible text for each id-list relationship target. */
  visibleIdReferences(attribute: string): Promise<readonly (string | null)[]>;
  /** DOM layer: persistent author-supplied label text, excluding placeholder. */
  labelText(): Promise<string | null>;
  /** DOM/runtime layer: the live value of a native text control, if this is one. */
  textValue(): Promise<string | null>;
  /** DOM layer: the subject's authored text content, whitespace-normalized. */
  textContent(): Promise<string>;
  /**
   * DOM layer: how many descendants match a CSS selector (`:scope` names the
   * subject). Structure contracts count rows and cells with it; it never
   * reaches into component-private markup beyond ARIA roles and attributes.
   */
  descendantCount(selector: string): Promise<number>;
  /** DOM layer: whether a current semantic subject resolves after an update. */
  currentExists(): Promise<boolean>;
  /** DOM layer: whether the originally designated subject is still connected. */
  isConnected(): Promise<boolean>;
  /** Accessibility-tree layer: what the engine computes for this node. */
  computed(): Promise<ComputedNode>;
  /**
   * Real-browser layer: the text of this control's label as a sighted person
   * actually sees it, or null when nothing is visibly rendered.
   *
   * Bounded on purpose: it reads the label the platform ASSOCIATES with the
   * control. WCAG 2.5.3's visible label need not be associated — an adjacent
   * unlinked `<span>` can label a control to the eye — and no generic rule can
   * tell that span from neighbouring prose. A pattern that needs that case
   * covered gives the binding an explicit hidden-label state to verify.
   *
   * Deciding what is *visible* takes layout, which is why this is a
   * real-browser observation and not a DOM one: markup alone cannot tell a
   * rendered label from a visually-hidden one. Resolution follows the platform's
   * own labelling — `aria-labelledby`, then a `for=`/wrapping `<label>` — never
   * a design system's private structure.
   */
  visibleLabelText(): Promise<string | null>;
  /** Real-browser layer: whether this node is rendered and visible. */
  isVisible(): Promise<boolean>;
  /** Real-browser layer: whether this node currently holds focus. */
  isFocused(): Promise<boolean>;
  /** Real-browser layer: whether focus is on this node or one of its descendants. */
  containsFocus(): Promise<boolean>;
  /** Real-browser layer: whether this node is an active modal in the top layer. */
  isModal(): Promise<boolean>;
  /** Real-browser layer: whether a pointer can currently reach this node. */
  canReceivePointer(): Promise<boolean>;
  /** Real-browser layer: move focus here the way a user's Tab would leave it. */
  focus(): Promise<void>;
}

/** A key an expectation can send. Spelled by intent, not by engine syntax. */
export type Key =
  | 'Space'
  | 'Enter'
  | 'Tab'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | 'Escape';

/**
 * A mounted binding, observed at whatever layers this runtime can honestly see.
 */
export interface Harness {
  /** Short runtime name, e.g. `jsdom` or `chromium`. Appears in every report row. */
  readonly name: string;
  /** The layers this harness can observe. Anything else is reported `unrun`. */
  readonly observes: readonly EvidenceLayer[];
  /** The element the binding designates as the pattern's control. */
  subject(): Promise<Subject>;
  /**
   * Another public-semantic element involved in the outcome, such as the
   * invoker a modal dialog returns focus to. Bindings name these relations;
   * contracts never query component-private structure.
   */
  related(name: string): Promise<Subject>;
  /** DOM layer: whether one semantic subject contains another. */
  contains(container: Subject, candidate: Subject): Promise<boolean>;
  /** Accessibility-tree layer: whether one semantic subject owns another. */
  containsSemantically(
    container: Subject,
    candidate: Subject,
  ): Promise<boolean>;
  /** DOM layer: whether an IDREF attribute resolves to the exact target subject. */
  references(
    source: Subject,
    attribute: string,
    target: Subject,
  ): Promise<boolean>;
  /**
   * Real-browser layer: click the subject the way a pointer user would,
   * including the browser's own judgement that the control is there to be
   * clicked. `ignoreAvailability` drops that judgement, and exists for the one
   * case that needs it: proving a control the browser considers unavailable
   * still does not change when someone clicks it anyway.
   */
  click(
    subject: Subject,
    options?: {ignoreAvailability?: boolean},
  ): Promise<void>;
  /**
   * Real-browser layer: begin a pointer press on the subject and release it
   * somewhere else, the way a person takes back a press they did not mean —
   * press, slide off, let go.
   */
  abortedPress(subject: Subject): Promise<void>;
  /**
   * Real-browser layer: click just outside the subject's box, the way a
   * person clicks the dimmed page beside a modal surface. What that click
   * lands on (a backdrop, an inert page) is the subject's own business; the
   * harness only puts the pointer there.
   */
  clickBeside(subject: Subject): Promise<void>;
  /**
   * Real-browser layer: move a mouse pointer onto the subject and leave it
   * resting there, the way a mouse user hovers a control to see its hint.
   */
  hover(subject: Subject): Promise<void>;
  /**
   * Real-browser layer: move the pointer to a point in the viewport that is
   * off the subject and every related subject, the way a mouse user moves on.
   */
  pointerAway(): Promise<void>;
  /** Real-browser layer: type text into the focused subject. */
  typeText(subject: Subject, text: string): Promise<void>;
  /** Real-browser layer: select and delete all text from the subject. */
  clearText(subject: Subject): Promise<void>;
  /** Real-browser layer: send a key to whatever currently holds focus. */
  press(key: Key): Promise<void>;
  /** Real-browser layer: park focus at the document body, before the content. */
  resetFocus(): Promise<void>;
}

export class MissingHarnessRelation extends Error {
  constructor(harness: string, relation: string) {
    super(
      `The ${harness} harness binding supplies no related subject named "${relation}".`,
    );
    this.name = 'MissingHarnessRelation';
  }
}

/**
 * Thrown when something asks a harness for an observation it cannot make. The
 * runner prevents this by checking `observes` first; the guard exists so a
 * harness can never quietly answer with a substitute from a lower layer.
 */
export class UnobservableError extends Error {
  constructor(harness: string, layer: EvidenceLayer, what: string) {
    super(
      `The ${harness} harness cannot observe the ${layer} layer, so it cannot report ${what}.`,
    );
    this.name = 'UnobservableError';
  }
}
