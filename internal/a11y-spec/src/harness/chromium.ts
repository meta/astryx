// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file chromium.ts
 * @input Uses a Playwright `Page`, the semantic subject `Locator`, optional
 *   binding-owned pointer-target and visible-label `Locator`s, and the Chrome
 *   DevTools Protocol accessibility domain behind them
 * @output `createChromiumHarness` — a clipping-aware harness that observes the DOM,
 *   accessibility-tree, and real-browser layers of a page rendered by a real
 *   shipping engine — plus `holdMotionStill`, the page setup its specs share.
 * @position The high-fidelity lane. Imported only from the Playwright specs, so
 *   the jsdom lane never loads Playwright: this file is the package's separate
 *   `@astryxdesign/a11y-spec/chromium` entry point, never re-exported from
 *   ../index.ts.
 *
 * The accessibility tree here is the ENGINE's, read through
 * `Accessibility.getPartialAXTree`, not a DOM approximation. That is the whole
 * reason this harness exists: `docs/specs/AST-009/spec.md` bounds the DOM layer
 * to "author-supplied ARIA relationships" and reserves computed role, name,
 * description, and state for the accessibility-tree layer. Chromium is where
 * Astryx can actually observe them.
 *
 * What it still does NOT prove is what an assistive technology says. Speech,
 * braille, announcement timing, and virtual-cursor entry are the real-AT layer,
 * and no harness in this package reports them.
 *
 * SYNC: Keep the observed-layer list honest, and keep the method surface equal
 *   to ../harness/jsdom.ts — both implement Harness in ../harness.ts.
 */

import {errors as playwrightErrors} from '@playwright/test';
import type {CDPSession, Locator, Page} from '@playwright/test';
import {
  MissingHarnessRelation,
  type ComputedNode,
  type EvidenceLayer,
  type Harness,
  type Key,
  type Subject,
} from '../harness';

/** What this harness can observe. Exported so a suite need not restate it. */
export const CHROMIUM_OBSERVES: readonly EvidenceLayer[] = [
  'unit',
  'dom',
  'accessibility-tree',
  'real-browser',
];

/**
 * How long a pointer gets to reach a control before the attempt is a failure.
 *
 * Generous for a control that is reachable at all — Playwright's actionability
 * check normally settles in single-digit milliseconds — and short enough that a
 * control a pointer can never reach reports why instead of hanging.
 */
const POINTER_REACH_BUDGET_MS = 2_000;

/**
 * Playwright's own timeout type, rather than a regex over the message: the
 * message is prose that can be reworded in any release, and matching it would
 * turn a wording change into a mystery failure.
 */
function isTimeout(error: unknown): boolean {
  return error instanceof playwrightErrors.TimeoutError;
}

async function canReceivePointer(locator: Locator): Promise<boolean> {
  try {
    await locator.click({trial: true, timeout: POINTER_REACH_BUDGET_MS});
    return true;
  } catch (error) {
    if (isTimeout(error)) {
      return false;
    }
    throw error;
  }
}

const KEYS: Record<Key, string> = {
  Space: ' ',
  Enter: 'Enter',
  Tab: 'Tab',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Escape: 'Escape',
};

interface AxValue {
  readonly value?: unknown;
}

interface AxProperty {
  readonly name: string;
  readonly value?: AxValue;
}

interface AxNode {
  readonly nodeId?: string;
  readonly childIds?: readonly string[];
  readonly ignored?: boolean;
  readonly role?: AxValue;
  readonly name?: AxValue;
  readonly description?: AxValue;
  readonly value?: AxValue;
  readonly backendDOMNodeId?: number;
  readonly properties?: readonly AxProperty[];
}

function text(value: AxValue | undefined): string {
  return typeof value?.value === 'string' ? value.value : '';
}

function property(node: AxNode, name: string): unknown {
  return node.properties?.find(candidate => candidate.name === name)?.value
    ?.value;
}

function accessibleText(nodes: readonly AxNode[], root: AxNode): string {
  const byId = new Map(
    nodes.flatMap(node =>
      node.nodeId == null ? [] : [[node.nodeId, node] as const],
    ),
  );
  const visit = (node: AxNode): string => {
    if (node.ignored !== true && text(node.role) === 'StaticText') {
      return text(node.name);
    }
    return (node.childIds ?? [])
      .map(id => byId.get(id))
      .flatMap(child => (child == null ? [] : [visit(child)]))
      .join(' ');
  };
  return visit(root).replace(/\s+/g, ' ').trim();
}

function flag(node: AxNode, name: string): boolean {
  const value = property(node, name);
  // The protocol is not consistent about booleans across property names, so
  // accept every spelling of true rather than silently reading a set flag as
  // unset.
  return value === true || value === 'true' || value === 1;
}

function optionalFlag(node: AxNode, name: string): boolean | null {
  const value = property(node, name);
  if (value === true || value === 'true' || value === 1) {
    return true;
  }
  if (value === false || value === 'false' || value === 0) {
    return false;
  }
  return null;
}

const AX_TARGET_ATTRIBUTE = 'data-a11y-spec-ax-target';

/**
 * The engine's own accessibility node for the subject.
 *
 * Playwright's `ariaSnapshot` renders role and name, but not the invalid state
 * a field contract needs, so this reads the protocol directly. The protocol addresses DOM nodes by id, and the page is on the far
 * side of the bridge, so the subject is marked with a data attribute for the
 * length of the query and unmarked afterwards. A data attribute takes no part
 * in accessibility computation, so marking it cannot change the answer.
 *
 * An element the engine leaves out of the tree comes back `ignored`, and is
 * reported as exposing nothing rather than as absent state.
 */
async function computedNode(
  cdp: CDPSession,
  locator: Locator,
): Promise<ComputedNode> {
  await locator.evaluate(
    (element, attribute) => element.setAttribute(attribute, ''),
    AX_TARGET_ATTRIBUTE,
  );
  try {
    const {root} = (await cdp.send('DOM.getDocument', {
      depth: 0,
    })) as unknown as {
      root: {nodeId: number};
    };
    const {nodeId} = (await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `[${AX_TARGET_ATTRIBUTE}]`,
    })) as unknown as {nodeId: number};

    if (nodeId === 0) {
      throw new Error('the subject is not in the document');
    }

    const {nodes} = (await cdp.send('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: true,
    })) as unknown as {nodes: readonly AxNode[]};

    const node = nodes[0];

    if (node == null || node.ignored === true) {
      return {
        role: null,
        name: '',
        description: '',
        accessibleText: '',
        live: null,
        atomic: null,
        value: null,
        rangeValue: null,
        rangeMin: null,
        rangeMax: null,
        valueText: null,
        modal: null,
        multiline: null,
        readOnly: null,
        required: null,
        pressed: null,
        checked: null,
        selected: null,
        disabled: false,
        invalid: false,
      };
    }

    const role = text(node.role);
    let textNodes = nodes;
    let textRoot = node;
    if (
      (role === 'status' || role === 'alert') &&
      node.backendDOMNodeId != null
    ) {
      const full = (await cdp.send(
        'Accessibility.getFullAXTree',
      )) as unknown as {nodes: readonly AxNode[]};
      const fullRoot = full.nodes.find(
        candidate => candidate.backendDOMNodeId === node.backendDOMNodeId,
      );
      if (fullRoot != null) {
        textNodes = full.nodes;
        textRoot = fullRoot;
      }
    }
    const live = property(node, 'live');
    const pressed = property(node, 'pressed');
    const checked = property(node, 'checked');
    const selected = optionalFlag(node, 'selected');
    const invalid = property(node, 'invalid');
    const exposedValue = node.value?.value;

    return {
      role: role === '' ? null : role,
      name: text(node.name),
      description: text(node.description),
      accessibleText: accessibleText(textNodes, textRoot),
      live:
        live === 'off' || live === 'polite' || live === 'assertive'
          ? live
          : null,
      atomic: optionalFlag(node, 'atomic'),
      value:
        typeof exposedValue === 'string'
          ? exposedValue
          : role === 'textbox'
            ? ''
            : null,
      rangeValue: typeof exposedValue === 'number' ? exposedValue : null,
      rangeMin:
        typeof property(node, 'valuemin') === 'number'
          ? (property(node, 'valuemin') as number)
          : null,
      rangeMax:
        typeof property(node, 'valuemax') === 'number'
          ? (property(node, 'valuemax') as number)
          : null,
      valueText:
        typeof property(node, 'valuetext') === 'string'
          ? (property(node, 'valuetext') as string)
          : null,
      modal: optionalFlag(node, 'modal'),
      multiline: optionalFlag(node, 'multiline'),
      readOnly: optionalFlag(node, 'readonly'),
      required: optionalFlag(node, 'required'),
      pressed:
        pressed === 'true' || pressed === true
          ? 'true'
          : pressed === 'false' || pressed === false
            ? 'false'
            : pressed === 'mixed'
              ? 'mixed'
              : null,
      checked:
        checked === 'true' || checked === true
          ? 'true'
          : checked === 'false' || checked === false
            ? 'false'
            : checked === 'mixed'
              ? 'mixed'
              : null,
      selected,
      disabled: flag(node, 'disabled'),
      invalid: invalid != null && invalid !== 'false' && invalid !== false,
    };
  } finally {
    await locator.evaluate(
      (element, attribute) => element.removeAttribute(attribute),
      AX_TARGET_ATTRIBUTE,
    );
  }
}

/**
 * How long `abortedPress` holds the press before sliding off: past the
 * longest press-timing delay a component uses (DropdownMenu's 300 ms settle
 * delay, the 500 ms long press).
 */
const ABORTED_PRESS_HOLD_MS = 700;

/**
 * Stop transitions before an expectation reads state, so nothing measures a
 * frame the animation happens to be showing.
 *
 * This is a page call rather than configuration on purpose. Playwright's
 * `use: {reducedMotion: 'reduce'}` and Chromium's own
 * `--force-prefers-reduced-motion` flag both leave
 * `matchMedia('(prefers-reduced-motion: reduce)')` FALSE in this version —
 * measured, not assumed. `emulateMedia` sets the preference, while the injected
 * override also collapses components that intentionally retain a non-zero
 * reduced-motion duration. Two animation frames apply both changes before an
 * expectation can observe the page.
 */
export async function holdMotionStill(page: Page): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

export interface ChromiumHarnessOptions {
  readonly page: Page;
  /**
   * The element the binding designates as the pattern's control. The binding
   * resolves it — by role for a conforming component, or by a fixture-owned
   * hook for a deliberately violating fixture, so a mutation flips exactly the
   * expectation under test.
   */
  readonly subject: Locator;
  /** The surface that receives pointer input when it differs from the semantic node. */
  readonly pointerTarget?: Locator;
  /** A binding-owned visible label when it is not the subject's DOM label. Null means this state deliberately has no visible label. */
  readonly visibleLabel?: Locator | null;
  /** A CDP session on `page`, reused across expectations. */
  readonly cdp: CDPSession;
  /** Public-semantic elements participating in relationship expectations. */
  readonly related?: Readonly<Record<string, Locator>>;
}

async function renderedVisible(locator: Locator): Promise<boolean> {
  return locator.evaluate(element => {
    if (
      !element.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
        contentVisibilityAuto: true,
      })
    ) {
      return false;
    }
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      return false;
    }
    const rootMargin = [
      Math.max(0, -box.top),
      Math.max(0, box.right - window.innerWidth),
      Math.max(0, box.bottom - window.innerHeight),
      Math.max(0, -box.left),
    ]
      .map(value => `${value}px`)
      .join(' ');
    return new Promise<boolean>(resolve => {
      const observer = new IntersectionObserver(
        entries => {
          observer.disconnect();
          resolve((entries[0]?.intersectionRatio ?? 0) > 0);
        },
        {rootMargin},
      );
      observer.observe(element);
    });
  });
}

const AX_OWNERSHIP_TARGET_ATTRIBUTE = 'data-a11y-spec-ownership-target';

async function backendNodeId(
  cdp: CDPSession,
  locator: Locator,
): Promise<number | null> {
  const previous = await locator.getAttribute(AX_OWNERSHIP_TARGET_ATTRIBUTE);
  await locator.evaluate(
    (element, attribute) => element.setAttribute(attribute, ''),
    AX_OWNERSHIP_TARGET_ATTRIBUTE,
  );
  try {
    const {root} = (await cdp.send('DOM.getDocument', {
      depth: 0,
    })) as unknown as {
      root: {nodeId: number};
    };
    const {nodeId} = (await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `[${AX_OWNERSHIP_TARGET_ATTRIBUTE}]`,
    })) as unknown as {nodeId: number};
    if (nodeId === 0) {
      return null;
    }
    const {node} = (await cdp.send('DOM.describeNode', {
      nodeId,
    })) as unknown as {
      node: {backendNodeId?: number};
    };
    return node.backendNodeId ?? null;
  } finally {
    await locator.evaluate(
      (element, [attribute, oldValue]) => {
        if (oldValue == null) {
          element.removeAttribute(attribute);
        } else {
          element.setAttribute(attribute, oldValue);
        }
      },
      [AX_OWNERSHIP_TARGET_ATTRIBUTE, previous] as const,
    );
  }
}

async function containsSemantically(
  cdp: CDPSession,
  container: Locator,
  candidate: Locator,
): Promise<boolean> {
  const containerBackendId = await backendNodeId(cdp, container);
  const candidateBackendId = await backendNodeId(cdp, candidate);
  if (containerBackendId == null || candidateBackendId == null) {
    return false;
  }
  const {nodes} = (await cdp.send(
    'Accessibility.getFullAXTree',
  )) as unknown as {nodes: readonly AxNode[]};
  const byId = new Map(
    nodes.flatMap(node =>
      node.nodeId == null ? [] : [[node.nodeId, node] as const],
    ),
  );
  const containerNode = nodes.find(
    node =>
      node.backendDOMNodeId === containerBackendId && node.ignored !== true,
  );
  const candidateNode = nodes.find(
    node =>
      node.backendDOMNodeId === candidateBackendId && node.ignored !== true,
  );
  if (containerNode?.nodeId == null || candidateNode?.nodeId == null) {
    return false;
  }
  const pending = [...(containerNode.childIds ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (nodeId == null || visited.has(nodeId)) {
      continue;
    }
    if (nodeId === candidateNode.nodeId) {
      return true;
    }
    visited.add(nodeId);
    pending.push(...(byId.get(nodeId)?.childIds ?? []));
  }
  return false;
}

export function createChromiumHarness(
  options: ChromiumHarnessOptions,
): Harness {
  const {page, subject: locator, pointerTarget, cdp, visibleLabel} = options;
  const pointerLocator = pointerTarget ?? locator;
  let initialElement: ReturnType<Locator['elementHandle']> | undefined;
  const capturedElement = () => {
    initialElement ??= locator.elementHandle();
    return initialElement;
  };
  const pointerTargets = new WeakMap<Subject, Locator>();
  const semanticTargets = new WeakMap<Subject, Locator>();

  const subject: Subject = {
    attribute: name => locator.getAttribute(name),
    idReferences: attribute =>
      // The same walk exists in the jsdom harness. It is not shared: Playwright
      // serializes this function into the page, so it cannot close over an
      // import from this package.
      locator.evaluate(
        (element, name) =>
          (element.getAttribute(name) ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .map(id => {
              const target = element.ownerDocument.getElementById(id);
              return target == null ? null : (target.textContent ?? '').trim();
            }),
        attribute,
      ),
    visibleIdReferences: attribute =>
      locator.evaluate((element, name) => {
        const isTransparentBox = (node: Element): boolean =>
          getComputedStyle(node).display === 'contents';
        const rendered = (node: Element): boolean => {
          if (isTransparentBox(node)) {
            return true;
          }
          if (
            !node.checkVisibility({
              visibilityProperty: true,
              opacityProperty: true,
              contentVisibilityAuto: true,
            })
          ) {
            return false;
          }
          const box = node.getBoundingClientRect();
          return box.width > 1 && box.height > 1;
        };
        const textIsReadable = (node: Element): boolean =>
          !/^rgba\(.*,\s*0\)$/.test(getComputedStyle(node).color);
        const paints = (node: Element): boolean => {
          if (!rendered(node)) {
            return false;
          }
          if (isTransparentBox(node)) {
            return true;
          }
          const box = node.getBoundingClientRect();
          const inlineStyle = (node as HTMLElement).style;
          const pointerTransparent =
            getComputedStyle(node).pointerEvents === 'none';
          const originalPointerEvents =
            inlineStyle.getPropertyValue('pointer-events');
          const originalPriority =
            inlineStyle.getPropertyPriority('pointer-events');
          if (pointerTransparent) {
            inlineStyle.setProperty('pointer-events', 'auto', 'important');
          }
          try {
            const samples: ReadonlyArray<readonly [number, number]> = [
              [box.x + box.width / 2, box.y + box.height / 2],
              [box.x + 1, box.y + box.height / 2],
              [box.right - 1, box.y + box.height / 2],
            ];
            return samples.some(([x, y]) => {
              const at = node.ownerDocument.elementFromPoint(x, y);
              return at != null && (at === node || node.contains(at));
            });
          } finally {
            if (pointerTransparent) {
              if (originalPointerEvents === '') {
                inlineStyle.removeProperty('pointer-events');
              } else {
                inlineStyle.setProperty(
                  'pointer-events',
                  originalPointerEvents,
                  originalPriority,
                );
              }
            }
          }
        };
        const visibleTextOf = (node: Element): string => {
          if (!paints(node)) {
            return '';
          }
          let value = '';
          for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              if (textIsReadable(node)) {
                value += child.nodeValue ?? '';
              }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              value += ` ${visibleTextOf(child as Element)} `;
            }
          }
          return value.replace(/\s+/g, ' ').trim();
        };

        return (element.getAttribute(name) ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map(id => {
            const target = element.ownerDocument.getElementById(id);
            if (target == null) {
              return null;
            }
            const text = visibleTextOf(target);
            return text === '' ? null : text;
          });
      }, attribute),
    labelText: () =>
      locator.evaluate(element => {
        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy != null && labelledBy.trim() !== '') {
          const text = labelledBy
            .split(/\s+/)
            .filter(Boolean)
            .map(
              id => element.ownerDocument.getElementById(id)?.textContent ?? '',
            )
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          return text === '' ? null : text;
        }
        const ariaLabel = element.getAttribute('aria-label')?.trim();
        if (ariaLabel != null && ariaLabel !== '') {
          return ariaLabel;
        }
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          const text = Array.from(element.labels ?? [])
            .map(label => label.textContent ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          return text === '' ? null : text;
        }
        return null;
      }),
    textValue: () =>
      locator.evaluate(element => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          return element.value;
        }
        return null;
      }),
    textContent: () =>
      locator.evaluate(node =>
        (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    descendantCount: selector => locator.locator(selector).count(),
    currentExists: async () => (await locator.count()) > 0,
    isConnected: async () => {
      const element = await capturedElement();
      return element != null && element.evaluate(node => node.isConnected);
    },
    computed: () => computedNode(cdp, locator),
    visibleLabelText: async () => {
      if (visibleLabel === null) {
        return null;
      }
      const explicitLabel =
        visibleLabel === undefined ? null : await visibleLabel.elementHandle();
      try {
        return await locator.evaluate((element, explicitLabel) => {
          // Whether a person can actually read this text. Two questions, because
          // no single API answers both.
          //
          // `checkVisibility` is the platform's own answer to "is this rendered
          // at all", and it walks ancestors — so a node inside a
          // `visibility: hidden`, `opacity: 0`, or `display: none` wrapper is
          // correctly invisible without this code reimplementing the cascade.
          // What it cannot answer is whether anything of the node LANDS on
          // screen: every sr-only recipe stays "visible" to it. Hence the box.
          /**
           * A wrapper that generates no box of its own and lets its children lay
           * out as if it were not there. Judging it by its own box would be
           * wrong twice over: it has none, and its children may be perfectly
           * readable. Astryx wraps button content in one, so this is not an edge
           * case — it is the common path.
           */
          const isTransparentBox = (node: Element): boolean =>
            getComputedStyle(node).display === 'contents';

          const rendered = (node: Element): boolean => {
            if (isTransparentBox(node)) {
              // Nothing to judge here; each child is judged on its own.
              return true;
            }
            if (
              !node.checkVisibility({
                visibilityProperty: true,
                opacityProperty: true,
                contentVisibilityAuto: true,
              })
            ) {
              return false;
            }
            const box = node.getBoundingClientRect();
            // The sr-only recipe: clipped to a 1px box, still in the tree.
            return box.width > 1 && box.height > 1;
          };

          /**
           * Whether text sitting directly in this node can be read.
           *
           * Separate from `rendered` because `color` inherits but is overridable:
           * a transparent wrapper whose child re-colours its own text is showing
           * that child's words, and judging the wrapper would erase them. So this
           * asks only about the node the text is actually in.
           *
           * Astryx dims a button's label with `color: transparent` while it waits
           * on an action, so this is a real case, not a hypothetical one.
           */
          const textIsReadable = (node: Element): boolean =>
            !/^rgba\(.*,\s*0\)$/.test(getComputedStyle(node).color);

          /**
           * Whether the label element as a whole paints anywhere.
           *
           * Sampling catches the case the box cannot: a FULL-SIZE element clipped
           * away entirely (`clip-path: inset(100%)`), which keeps its box and
           * stays "visible" to the platform. If a point over it resolves to the
           * element, to something inside it, or to something covering it, it
           * paints there; if every sample resolves to one of its own ancestors,
           * nothing of it paints.
           *
           * Applied only to the element being measured, never to its descendants:
           * a span inside a button legitimately hit-tests to the button, and
           * treating that as hidden would erase every nested label.
           *
           * Occlusion is deliberately not hiding: a label under an overlay is
           * still a label a person can read when the overlay moves.
           */
          const paints = (node: Element): boolean => {
            if (!rendered(node)) {
              return false;
            }
            if (isTransparentBox(node)) {
              // No box to sample; whether anything shows is up to the children.
              return true;
            }
            const box = node.getBoundingClientRect();
            const inlineStyle = (node as HTMLElement).style;
            const pointerTransparent =
              getComputedStyle(node).pointerEvents === 'none';
            const originalPointerEvents =
              inlineStyle.getPropertyValue('pointer-events');
            const originalPriority =
              inlineStyle.getPropertyPriority('pointer-events');
            if (pointerTransparent) {
              // Hit testing normally skips pointer-transparent labels even though
              // they paint. Temporarily make only this node targetable so the
              // same paint sampling still distinguishes visible text from a
              // fully clipped box.
              inlineStyle.setProperty('pointer-events', 'auto', 'important');
            }
            try {
              const samples: ReadonlyArray<readonly [number, number]> = [
                [box.x + box.width / 2, box.y + box.height / 2],
                [box.x + 1, box.y + box.height / 2],
                [box.right - 1, box.y + box.height / 2],
              ];
              return samples.some(([x, y]) => {
                const at = node.ownerDocument.elementFromPoint(x, y);
                if (at == null) {
                  // Outside the viewport, so nothing is there to read.
                  return false;
                }
                return at === node || node.contains(at) || !at.contains(node);
              });
            } finally {
              if (pointerTransparent) {
                if (originalPointerEvents === '') {
                  inlineStyle.removeProperty('pointer-events');
                } else {
                  inlineStyle.setProperty(
                    'pointer-events',
                    originalPointerEvents,
                    originalPriority,
                  );
                }
              }
            }
          };

          // The text a person can actually READ inside this node.
          //
          // Not `textContent`: a control commonly carries a visually-hidden live
          // region or an sr-only span inside it, and counting that text would
          // report words nobody sees — which then reads as a label mismatch
          // against a name that (correctly) does not contain them. So the walk
          // descends and drops any subtree that is not rendered.
          const visibleTextOf = (node: Element): string => {
            let text = '';
            for (const child of node.childNodes) {
              if (child.nodeType === Node.TEXT_NODE) {
                if (textIsReadable(node)) {
                  text += child.nodeValue ?? '';
                }
              } else if (
                child.nodeType === Node.ELEMENT_NODE &&
                rendered(child as Element)
              ) {
                text += ` ${visibleTextOf(child as Element)} `;
              }
            }
            return text.replace(/\s+/g, ' ').trim();
          };
          const textOf = (node: Element): string | null => {
            if (!paints(node)) {
              return null;
            }
            const text = visibleTextOf(node);
            return text === '' ? null : text;
          };

          if (explicitLabel != null) {
            return textOf(explicitLabel);
          }

          // The platform's own labelling order, not any design system's.
          const labelledBy = element.getAttribute('aria-labelledby');
          if (labelledBy != null && labelledBy.trim() !== '') {
            const parts = labelledBy
              .split(/\s+/)
              .filter(Boolean)
              .map(id => element.ownerDocument.getElementById(id))
              .flatMap(target => (target == null ? [] : [textOf(target)]))
              .filter((text): text is string => text != null);
            return parts.length === 0 ? null : parts.join(' ');
          }
          const id = element.getAttribute('id');
          const associated =
            id == null || id === ''
              ? null
              : element.ownerDocument.querySelector(
                  // An id is author-supplied and need not be a bare identifier.
                  `label[for="${CSS.escape(id)}"]`,
                );
          const wrapping = element.closest('label');
          for (const label of [associated, wrapping]) {
            if (label != null) {
              const text = textOf(label);
              if (text != null) {
                return text;
              }
            }
          }
          // A control that labels itself, e.g. a div with role=switch.
          return textOf(element);
        }, explicitLabel);
      } finally {
        await explicitLabel?.dispose();
      }
    },
    isVisible: () => renderedVisible(locator),
    isFocused: () =>
      locator.evaluate(
        element => element.ownerDocument.activeElement === element,
      ),
    containsFocus: () =>
      locator.evaluate(element => {
        const active = element.ownerDocument.activeElement;
        return (
          active != null && (active === element || element.contains(active))
        );
      }),
    isModal: () => locator.evaluate(element => element.matches(':modal')),
    canReceivePointer: () => canReceivePointer(locator),
    focus: () => locator.focus(),
  };
  pointerTargets.set(subject, pointerLocator);
  semanticTargets.set(subject, locator);

  const relatedSubject = (name: string): Subject => {
    const related = options.related?.[name];
    if (related == null) {
      throw new MissingHarnessRelation('chromium', name);
    }
    const result: Subject = {
      attribute: attribute => related.getAttribute(attribute),
      idReferences: attribute =>
        related.evaluate(
          (element, relation) =>
            (element.getAttribute(relation) ?? '')
              .split(/\s+/)
              .filter(Boolean)
              .map(id => {
                const target = element.ownerDocument.getElementById(id);
                return target == null
                  ? null
                  : (target.textContent ?? '').trim();
              }),
          attribute,
        ),
      visibleIdReferences: attribute =>
        related.evaluate(
          (element, relation) =>
            (element.getAttribute(relation) ?? '')
              .split(/\s+/)
              .filter(Boolean)
              .map(id => {
                const target = element.ownerDocument.getElementById(id);
                if (target == null || !target.checkVisibility()) {
                  return null;
                }
                const text = (target.textContent ?? '')
                  .replace(/\s+/g, ' ')
                  .trim();
                return text === '' ? null : text;
              }),
          attribute,
        ),
      labelText: () =>
        related.evaluate(element => {
          const labelledBy = element.getAttribute('aria-labelledby');
          if (labelledBy != null && labelledBy.trim() !== '') {
            const text = labelledBy
              .split(/\s+/)
              .filter(Boolean)
              .map(
                id =>
                  element.ownerDocument.getElementById(id)?.textContent ?? '',
              )
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            return text === '' ? null : text;
          }
          const ariaLabel = element.getAttribute('aria-label')?.trim();
          if (ariaLabel != null && ariaLabel !== '') {
            return ariaLabel;
          }
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          ) {
            const text = Array.from(element.labels ?? [])
              .map(label => label.textContent ?? '')
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            return text === '' ? null : text;
          }
          return null;
        }),
      textValue: () =>
        related.evaluate(element => {
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          ) {
            return element.value;
          }
          return null;
        }),
      textContent: () =>
        related.evaluate(node =>
          (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ),
      descendantCount: selector => related.locator(selector).count(),
      currentExists: async () => (await related.count()) > 0,
      isConnected: () => related.evaluate(node => node.isConnected),
      computed: () => computedNode(cdp, related),
      visibleLabelText: async () => {
        const value = (await related.innerText()).trim();
        return value === '' ? null : value;
      },
      isVisible: () => renderedVisible(related),
      isFocused: () =>
        related.evaluate(
          element => element.ownerDocument.activeElement === element,
        ),
      containsFocus: () =>
        related.evaluate(element => {
          const active = element.ownerDocument.activeElement;
          return (
            active != null && (active === element || element.contains(active))
          );
        }),
      isModal: () => related.evaluate(element => element.matches(':modal')),
      canReceivePointer: () => canReceivePointer(related),
      focus: () => related.focus(),
    };
    pointerTargets.set(result, related);
    semanticTargets.set(result, related);
    return result;
  };

  return {
    name: 'chromium',
    observes: CHROMIUM_OBSERVES,
    subject: async () => subject,
    related: async name => relatedSubject(name),
    contains: async (container, candidate) => {
      const containerLocator = semanticTargets.get(container);
      const candidateLocator = semanticTargets.get(candidate);
      if (containerLocator == null || candidateLocator == null) {
        throw new Error(
          'the Chromium harness was asked to compare a subject it did not create',
        );
      }
      const candidateHandle = await candidateLocator.elementHandle();
      if (candidateHandle == null) {
        return false;
      }
      try {
        return await containerLocator.evaluate(
          (element, candidateElement) => element.contains(candidateElement),
          candidateHandle,
        );
      } finally {
        await candidateHandle.dispose();
      }
    },
    containsSemantically: async (container, candidate) => {
      const containerLocator = semanticTargets.get(container);
      const candidateLocator = semanticTargets.get(candidate);
      if (containerLocator == null || candidateLocator == null) {
        throw new Error(
          'the Chromium harness was asked to compare a subject it did not create',
        );
      }
      return containsSemantically(cdp, containerLocator, candidateLocator);
    },
    references: async (source, attribute, target) => {
      const sourceLocator = semanticTargets.get(source);
      const targetLocator = semanticTargets.get(target);
      if (sourceLocator == null || targetLocator == null) {
        throw new Error(
          'the Chromium harness was asked to compare a subject it did not create',
        );
      }
      const targetHandle = await targetLocator.elementHandle();
      if (targetHandle == null) {
        return false;
      }
      try {
        return await sourceLocator.evaluate(
          (element, [name, targetElement]) =>
            (element.getAttribute(name) ?? '')
              .split(/\s+/)
              .filter(Boolean)
              .some(
                id =>
                  element.ownerDocument.getElementById(id) === targetElement,
              ),
          [attribute, targetHandle] as const,
        );
      } finally {
        await targetHandle.dispose();
      }
    },
    click: async (targetSubject, options) => {
      const target = pointerTargets.get(targetSubject);
      if (target == null) {
        throw new Error(
          'the Chromium harness was asked to click a subject it did not create',
        );
      }
      // Without `force`, Playwright first satisfies itself that the control is
      // visible, stable, enabled, and actually receives pointer events — so an
      // ordinary click here also proves a pointer could reach the control.
      // `ignoreAvailability` skips that judgement, which is the only way to ask
      // a control the browser calls unavailable what it does when clicked
      // anyway.
      try {
        await target.click({
          force: options?.ignoreAvailability === true,
          // Bounded, and short. A control a pointer cannot reach — one covered
          // by something else, or clipped to nothing — otherwise sits here
          // until the whole test times out, and a timeout says nothing about
          // WHY. This turns that into a legible failure the report can carry.
          timeout: POINTER_REACH_BUDGET_MS,
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw new Error(
            `a pointer could not reach this control within ${POINTER_REACH_BUDGET_MS}ms: the browser never found it visible, stable, and able to receive a pointer event. Something is covering it, or it is clipped to nothing.`,
            {cause: error},
          );
        }
        throw error;
      }
    },
    clickBeside: async targetSubject => {
      const target = pointerTargets.get(targetSubject);
      if (target == null) {
        throw new Error(
          'the Chromium harness was asked to click beside a subject it did not create',
        );
      }
      const box = await target.boundingBox();
      if (box == null) {
        throw new Error('the subject has no box to click beside');
      }
      const viewport = page.viewportSize() ?? {width: 1280, height: 720};
      // A point outside the box but inside the viewport: above-left when
      // there is room, else below-right.
      const x =
        box.x >= 8
          ? box.x - 4
          : Math.min(viewport.width - 2, box.x + box.width + 4);
      const y =
        box.y >= 8
          ? box.y - 4
          : Math.min(viewport.height - 2, box.y + box.height + 4);
      const inside =
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height;
      if (inside) {
        // A subject that fills the viewport leaves no point beside it; a
        // click on the subject itself would prove nothing about dismissal.
        throw new Error(
          'the subject fills the viewport, so there is no point beside it to click',
        );
      }
      await page.mouse.click(x, y);
    },
    abortedPress: async () => {
      const box = await pointerLocator.boundingBox();
      if (box == null) {
        throw new Error('the subject has no box to press on');
      }
      // A press that never lands on the control proves nothing about what
      // releasing it elsewhere does. Without this, a control a pointer cannot
      // reach reports a serene pass for pointer cancellation — the exact
      // vacuous green the evidence-layer rules exist to prevent.
      const reachable = await pointerLocator.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const at = element.ownerDocument.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return at != null && (at === element || element.contains(at));
      });
      if (!reachable) {
        throw new Error(
          'a pointer press cannot land on this control: something else is on top of it at its own centre, so there is no press here to abort',
        );
      }
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      // Release clear of the control but still inside the viewport: a gesture
      // that ends out of bounds is not one the browser reports. Which way to
      // go is decided per axis by whichever side has more room, so a control
      // flush against an edge does not push the release back INSIDE its own box
      // — which would be a completed click, and would fail a switch that is
      // behaving correctly.
      const away = (start: number, end: number, limit: number): number => {
        const before = start;
        const after = limit - end;
        return before > after
          ? Math.max(1, start - 200)
          : Math.min(limit - 1, end + 200);
      };
      const releaseX = away(box.x, box.x + box.width, viewport.width);
      const releaseY = away(box.y, box.y + box.height, viewport.height);
      const insideTheControl =
        releaseX >= box.x &&
        releaseX <= box.x + box.width &&
        releaseY >= box.y &&
        releaseY <= box.y + box.height;
      if (insideTheControl) {
        throw new Error(
          'the viewport leaves nowhere to release a press outside this control, so an aborted press cannot be performed here',
        );
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      // Hold the press before sliding off, as a person who changes their mind
      // does. A press released at once has a duration set by the machine: a
      // component that times the press (DropdownMenu ignores the release of an
      // opening press shorter than its settle delay) then reports a different
      // outcome on a loaded runner than on an idle one. Holding past any such
      // delay gives every machine the same gesture.
      await page.waitForTimeout(ABORTED_PRESS_HOLD_MS);
      await page.mouse.move(releaseX, releaseY);
      await page.mouse.up();
    },
    hover: async targetSubject => {
      const target = pointerTargets.get(targetSubject);
      if (target == null) {
        throw new Error(
          'the Chromium harness was asked to hover a subject it did not create',
        );
      }
      // The same bounded reach as `click`: a subject a pointer can never rest
      // on reports why instead of sitting out the whole test timeout.
      try {
        await target.hover({timeout: POINTER_REACH_BUDGET_MS});
      } catch (error) {
        if (isTimeout(error)) {
          throw new Error(
            `a pointer could not reach this subject within ${POINTER_REACH_BUDGET_MS}ms: the browser never found it visible, stable, and able to receive a pointer event. Something is covering it, or it is clipped to nothing.`,
            {cause: error},
          );
        }
        throw error;
      }
    },
    pointerAway: async () => {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      // Corners first, then edge midpoints: the first point that is off the
      // subject and every related subject. A point over one of them would
      // leave the pointer where the outcome is being judged.
      const candidates = [
        [viewport.width - 2, viewport.height - 2],
        [2, viewport.height - 2],
        [viewport.width - 2, 2],
        [2, 2],
        [viewport.width / 2, viewport.height - 2],
        [viewport.width - 2, viewport.height / 2],
      ] as const;
      // The pointer target is watched too: `hover` rests on it, and a binding's
      // pointer target can differ from its semantic subject.
      const watched = [
        locator,
        pointerLocator,
        ...Object.values(options.related ?? {}),
      ];
      for (const [x, y] of candidates) {
        const handles = (
          await Promise.all(watched.map(item => item.elementHandles()))
        ).flat();
        try {
          const clear = await page.evaluate(
            ([pointX, pointY, elements]) => {
              const hit = document.elementFromPoint(pointX, pointY);
              return (
                hit != null &&
                !elements.some(
                  element => element === hit || element.contains(hit),
                )
              );
            },
            [x, y, handles] as const,
          );
          if (clear) {
            await page.mouse.move(x, y);
            return;
          }
        } finally {
          await Promise.all(handles.map(handle => handle.dispose()));
        }
      }
      throw new Error(
        'every edge of the viewport is covered by the subject or a related subject, so there is nowhere to move the pointer away to',
      );
    },
    typeText: async (_subject, text) => {
      await locator.focus();
      await page.keyboard.type(text);
    },
    clearText: async () => {
      await locator.focus();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
    },
    press: async key => {
      await page.keyboard.press(KEYS[key]);
    },
    resetFocus: async () => {
      await page.evaluate(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
      });
    },
  };
}
