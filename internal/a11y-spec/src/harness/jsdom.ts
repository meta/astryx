// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file jsdom.ts
 * @input Uses ../harness (the seam) and a DOM element the binding designates
 * @output `createJsdomHarness` — a harness that observes the unit and DOM
 *   layers, and honestly refuses everything above them.
 * @position Fast lane. Runs inside the existing Vitest `ui` project, so a DOM
 *   regression is caught on every pull request without a browser.
 *
 * What this harness will NOT do is the point of it. jsdom renders markup; it
 * does not compute an accessibility tree, it does not resolve a real focus
 * order, and it does not dispatch the activation a browser derives from a key.
 * Every one of those is a higher layer (`docs/specs/AST-009/spec.md`), so this
 * harness declares that it cannot see them and the runner reports `unrun`
 * instead of quietly answering from the markup.
 *
 * SYNC: Keep the observed-layer list honest. Adding a layer here is a claim
 *   that jsdom can actually observe it.
 */

import {
  MissingHarnessRelation,
  UnobservableError,
  type Harness,
  type Subject,
  type EvidenceLayer,
} from '../harness';

/** What this harness can observe. Exported so a suite need not restate it. */
export const JSDOM_OBSERVES: readonly EvidenceLayer[] = ['unit', 'dom'];

const HARNESS = 'jsdom';

function unobservable(layer: EvidenceLayer, what: string): never {
  throw new UnobservableError(HARNESS, layer, what);
}

function createSubject(element: Element): Subject {
  return {
    attribute: async name => element.getAttribute(name),
    idReferences: async attribute => {
      // The same walk exists in the Chromium harness. It is not shared: that
      // copy is serialized into the page by Playwright, so it cannot close over
      // an import from this package.
      const value = element.getAttribute(attribute);
      if (value == null || value.trim() === '') {
        return [];
      }
      return value
        .split(/\s+/)
        .filter(Boolean)
        .map(id => {
          const target = element.ownerDocument.getElementById(id);
          return target == null ? null : (target.textContent ?? '').trim();
        });
    },
    visibleIdReferences: async () =>
      unobservable(
        'real-browser',
        'whether referenced text is visibly rendered',
      ),
    labelText: async () => {
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy != null && labelledBy.trim() !== '') {
        const text = (
          await Promise.all(
            labelledBy
              .split(/\s+/)
              .filter(Boolean)
              .map(
                async id =>
                  element.ownerDocument.getElementById(id)?.textContent ?? '',
              ),
          )
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
    },
    textValue: async () => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        return element.value;
      }
      return null;
    },
    textContent: async () =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    descendantCount: async selector =>
      element.querySelectorAll(selector).length,
    currentExists: async () => element.isConnected,
    isConnected: async () => element.isConnected,
    computed: async () =>
      unobservable('accessibility-tree', 'a computed accessibility node'),
    visibleLabelText: async () =>
      unobservable('real-browser', 'what a label actually renders as'),
    isVisible: async () =>
      unobservable('real-browser', 'whether a node is rendered and visible'),
    isFocused: async () => unobservable('real-browser', 'real focus'),
    containsFocus: async () =>
      unobservable('real-browser', 'whether focus is inside a subject'),
    isModal: async () =>
      unobservable('real-browser', 'native modal top-layer state'),
    canReceivePointer: async () =>
      unobservable('real-browser', 'pointer reachability'),
    focus: async () => unobservable('real-browser', 'real focus'),
  };
}

export interface JsdomHarnessOptions {
  /**
   * The element the binding designates as the pattern's control. The binding
   * resolves it — by role for a conforming component, or by a fixture-owned
   * hook for a deliberately violating fixture, so that a mutation flips exactly
   * the expectation under test instead of making the subject unfindable.
   */
  readonly subject: Element;
  /** Public-semantic elements participating in a relationship expectation. */
  readonly related?: Readonly<Record<string, Element>>;
}

export function createJsdomHarness(options: JsdomHarnessOptions): Harness {
  const elements = new WeakMap<Subject, Element>();
  const subject = createSubject(options.subject);
  elements.set(subject, options.subject);
  const relatedSubjects = new Map<string, Subject>();
  for (const [name, element] of Object.entries(options.related ?? {})) {
    const related = createSubject(element);
    elements.set(related, element);
    relatedSubjects.set(name, related);
  }
  return {
    name: HARNESS,
    observes: JSDOM_OBSERVES,
    subject: async () => subject,
    related: async name => {
      const related = relatedSubjects.get(name);
      if (related == null) {
        throw new MissingHarnessRelation(HARNESS, name);
      }
      return related;
    },
    contains: async (container, candidate) => {
      const containerElement = elements.get(container);
      const candidateElement = elements.get(candidate);
      if (containerElement == null || candidateElement == null) {
        throw new Error(
          'the jsdom harness was asked to compare a subject it did not create',
        );
      }
      return containerElement.contains(candidateElement);
    },
    containsSemantically: async () =>
      unobservable(
        'accessibility-tree',
        'whether one subject semantically owns another',
      ),
    references: async (source, attribute, target) => {
      const sourceElement = elements.get(source);
      const targetElement = elements.get(target);
      if (sourceElement == null || targetElement == null) {
        throw new Error(
          'the jsdom harness was asked to compare a subject it did not create',
        );
      }
      return (sourceElement.getAttribute(attribute) ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .some(
          id =>
            sourceElement.ownerDocument.getElementById(id) === targetElement,
        );
    },
    click: async () =>
      unobservable('real-browser', 'a real pointer activation'),
    abortedPress: async () =>
      unobservable('real-browser', 'a real pointer press'),
    clickBeside: async () =>
      unobservable('real-browser', 'a real pointer click beside the subject'),
    hover: async () => unobservable('real-browser', 'a real pointer hover'),
    pointerAway: async () =>
      unobservable('real-browser', 'a real pointer moving away'),
    typeText: async () =>
      unobservable('real-browser', 'real keyboard text entry'),
    clearText: async () =>
      unobservable('real-browser', 'real keyboard text deletion'),
    press: async () => unobservable('real-browser', 'a real key press'),
    resetFocus: async () => unobservable('real-browser', 'real focus'),
  };
}
