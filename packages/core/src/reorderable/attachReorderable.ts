// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file attachReorderable.ts
 * @input A reorderable object's options, a container, and the app's
 *   `items()`; List's reorder controller, hint and strings, the shared
 *   announcer, and the private handle mark
 * @output `attachReorderable`, which reorders plain elements without a
 *   collection component, and its item and attachment types
 * @position Internal to the reorder; createReorderable's `attach` calls it.
 *   Pointer and touch drags are not attached yet, and items move along the
 *   vertical axis only
 *
 * The app owns its elements, so this module reads `items()` when it
 * attaches, at each press, key or `start` on a handle, and after each move.
 * It watches no mutations. A move counts when `items()` reports the moved
 * key at its new place, in a microtask after `onReorder` or as the move's
 * end-of-task fallback starts; otherwise the controller announces that it
 * did not happen. Nothing touches the DOM until
 * `attach` is called, so importing this module is safe on the server.
 */

import {createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import {
  announceInModal,
  announceMessage,
  enclosingModalDialog,
  type AnnouncePoliteness,
} from '../hooks/useAnnounce';
import {registerEnglishFallback} from '../i18n/englishFallback';
import {getResolve} from '../i18n/resolve';
import english from '../i18n/generated-english/reorderable/attachReorderable.generated';
import {
  ListReorderController,
  ListReorderModeHint,
  messagesFrom,
  mountSession,
} from '../List/listReorderEngine';
import type {ListReorderOptions, ReorderRows} from '../List/listReorderContext';
import {markReorderHandle} from '../privateAttributes/listReorder.stylex';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {readAccessibleName} from '../utils/accessibleName';
import {devWarn} from '../utils/devWarning';

registerEnglishFallback(english);

/** One item of an attached container, in order. */
export interface ReorderableItem<
  TKey extends string | number = string | number,
> {
  /** The item's key, which its moves report. */
  readonly key: TKey;
  /** The item's element: the row that moves. */
  readonly element: HTMLElement;
  /** The element that drags the item and toggles its reorder mode. */
  readonly handle: HTMLElement;
}

/** What `attach` takes beside the container. */
export interface ReorderableAttachOptions<
  TKey extends string | number = string | number,
> {
  /** The container's items, in order. Read again after each move. */
  items: () => ReadonlyArray<ReorderableItem<TKey>>;
}

/** An attached container. */
export interface ReorderableAttachment {
  /**
   * Ends any reorder mode in progress, calling nothing, and removes every
   * listener, element and attribute `attach` added.
   */
  detach(): void;
}

/** The attributes `attach` writes on a handle, put back by `detach`. */
const HANDLE_ATTRIBUTES = [
  'role',
  'tabindex',
  'aria-pressed',
  'aria-label',
  'aria-describedby',
] as const;

interface WiredHandle {
  readonly key: string | number;
  readonly element: HTMLElement;
  readonly name: string;
  readonly unwire: () => void;
}

let nextHintId = 0;

/**
 * A wired handle's own naming: the `aria-label` and `aria-labelledby` it
 * has apart from `attach`, and the label `attach` last wrote.
 */
interface OwnNaming {
  label: string | null;
  labelledBy: string | null;
  written: string | null;
}

/**
 * The name announcements and the handle give an item: the element's
 * accessible name, with its handle left out. An item that is its own handle
 * is read with its own naming, not with the label `attach` wrote.
 */
function nameOf(
  item: ReorderableItem,
  naming: WeakMap<HTMLElement, OwnNaming>,
): string {
  const own = item.handle === item.element ? naming.get(item.element) : null;
  if (own == null) {
    return readAccessibleName(item.element, {exclude: item.handle}) ?? '';
  }
  const copy = item.element.cloneNode(true) as HTMLElement;
  for (const [name, value] of [
    ['aria-label', own.label],
    ['aria-labelledby', own.labelledBy],
  ] as const) {
    if (value == null) {
      copy.removeAttribute(name);
    } else {
      copy.setAttribute(name, value);
    }
  }
  return readAccessibleName(copy) ?? '';
}

/** Puts back the handle attributes and the container style `attach` set. */
function snapshot(element: Element, names: ReadonlyArray<string>): () => void {
  const saved = names.map(name => [name, element.getAttribute(name)] as const);
  return () => {
    for (const [name, value] of saved) {
      if (value == null) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, value);
      }
    }
  };
}

/**
 * A controller that reads the app's items again before `start` and before a
 * move's end-of-task fallback.
 */
class AttachedController extends ListReorderController {
  beforeStart: () => void = () => {};
  settle: () => void = () => {};

  startByKey(key: string | number): boolean {
    this.beforeStart();
    return super.startByKey(key);
  }

  protected beforeFallback(): void {
    this.settle();
  }
}

/**
 * Reorders the items of `container`, plain elements an app renders, with
 * List's reorder mode. `options` is the reorderable object's.
 */
export function attachReorderable(
  options: ListReorderOptions,
  container: HTMLElement,
  {items}: ReorderableAttachOptions,
): ReorderableAttachment {
  const doc = container.ownerDocument;
  const t = getResolve('en', {});
  const hintId = `astryx-reorder-attach-hint-${(nextHintId += 1)}`;
  const wired = new Map<HTMLElement, WiredHandle>();
  // Each wired handle's own naming, apart from what `attach` writes.
  const naming = new WeakMap<HTMLElement, OwnNaming>();
  // Every item's name, a fixed one's too: a refusal names it.
  const named = new Map<HTMLElement, {name: string; release: () => void}>();
  let detached = false;

  // The app's items in order. A keyless item keeps its place in the order,
  // so each move's index counts it, but it gets no handle.
  const readRows = (): ReadonlyArray<HTMLElement> =>
    items()
      .map(item => item.element)
      .filter(element => element instanceof HTMLElement);
  // The items that can be wired: a key and both elements.
  const readItems = (): ReadonlyArray<ReorderableItem> =>
    items().filter(
      item =>
        item.key != null &&
        item.element instanceof HTMLElement &&
        item.handle instanceof HTMLElement,
    );

  const rows: ReorderRows = {
    read: () => [...readRows()],
    holds: element => readRows().includes(element as HTMLElement),
  };
  const controller = new AttachedController(() => container, hintId, rows);

  // The handles' instructions, which every handle's description names.
  const instructions = doc.createElement('span');
  instructions.id = hintId;
  instructions.hidden = true;
  instructions.textContent = t('@astryx.list.reorderHint', {});
  // The elements this module owns go in the nearest dialog or theme scope,
  // not in or beside the container: a list holds only its items, an editable
  // container would take them as content, and the container's parent keeps
  // its children. The theme scope gives the hint its theme.
  // Inside a dialog they go in the dialog: a modal one makes everything
  // outside it inert.
  const ownedParentOf = (): HTMLElement =>
    container.closest<HTMLElement>('dialog') ??
    container.closest<HTMLElement>('[data-astryx-theme]') ??
    doc.body;
  const ownedParent = ownedParentOf();
  ownedParent.append(instructions);

  const announce = (message: string, politeness?: AnnouncePoliteness) => {
    if (message === '') {
      return;
    }
    const dialog = enclosingModalDialog(container);
    const urgency = politeness ?? 'polite';
    if (dialog != null) {
      announceInModal(dialog, message, urgency);
    } else {
      announceMessage(message, urgency);
    }
  };

  // Reads the items again: wires each new handle, and puts back each one
  // that left or can no longer move. A replaced handle in reorder mode
  // hands the mode to the new one.
  const sync = () => {
    if (detached) {
      return;
    }
    const modeHandle = controller.modeTarget;
    const modeKey = modeHandle == null ? undefined : wired.get(modeHandle)?.key;
    const current = new Map<HTMLElement, ReorderableItem>();
    const present = new Set<HTMLElement>();
    for (const item of readItems()) {
      present.add(item.element);
      const name = nameOf(item, naming);
      const entry = named.get(item.element);
      if (entry == null || entry.name !== name) {
        entry?.release();
        named.set(item.element, {
          name,
          release: controller.registerName(item.element, name),
        });
      }
      if (options.isReorderable?.(item.key) !== false) {
        current.set(item.handle, item);
      }
    }
    for (const [element, entry] of named) {
      if (!present.has(element)) {
        entry.release();
        named.delete(element);
      }
    }
    for (const [handle, entry] of wired) {
      const item = current.get(handle);
      if (
        item == null ||
        item.key !== entry.key ||
        item.element !== entry.element
      ) {
        entry.unwire();
        wired.delete(handle);
      }
    }
    current.forEach((item, handle) => {
      if (!wired.has(handle)) {
        wired.set(handle, wire(item));
      } else {
        relabel(item);
      }
    });
    if (
      modeKey != null &&
      controller.modeTarget == null &&
      [...wired.values()].some(entry => entry.key === modeKey)
    ) {
      controller.startByKey(modeKey);
    }
  };

  // The handle's name: "Reorder" and the item's name, or its place when it
  // has none. Set again at each read, so it follows a rename and a move.
  const relabel = (item: ReorderableItem) => {
    const own = naming.get(item.handle);
    if (own != null) {
      // A label or a labelledby the app set since the last write is the
      // handle's own now. A labelledby would hide the label `attach` writes,
      // so it is kept aside while the handle is wired.
      const label = item.handle.getAttribute('aria-label');
      if (label !== own.written) {
        own.label = label;
      }
      const labelledBy = item.handle.getAttribute('aria-labelledby');
      if (labelledBy != null) {
        own.labelledBy = labelledBy;
        item.handle.removeAttribute('aria-labelledby');
      }
    }
    const name = nameOf(item, naming);
    const label =
      name === ''
        ? t('@astryx.list.reorderHandleAt', {
            position: readRows().indexOf(item.element) + 1,
          })
        : t('@astryx.list.reorderHandle', {label: name});
    if (item.handle.getAttribute('aria-label') !== label) {
      item.handle.setAttribute('aria-label', label);
    }
    if (own != null) {
      own.written = label;
    }
  };

  const wire = (item: ReorderableItem): WiredHandle => {
    const {handle, element, key} = item;
    const restore = snapshot(handle, HANDLE_ATTRIBUTES);
    naming.set(handle, {
      label: handle.getAttribute('aria-label'),
      labelledBy: handle.getAttribute('aria-labelledby'),
      written: null,
    });
    const unmark = markReorderHandle(handle);
    const name = nameOf(item, naming);
    if (name === '') {
      devWarn(
        'createReorderable',
        `\`attach\`: item ${String(key)} has no accessible name or text, ` +
          'so its handle and its moves are announced by position.',
      );
    }
    if (!(handle instanceof HTMLButtonElement)) {
      handle.setAttribute('role', 'button');
    }
    if (!handle.matches(FOCUSABLE_SELECTOR) || handle.tabIndex < 0) {
      handle.setAttribute('tabindex', '0');
    }
    handle.setAttribute('aria-pressed', 'false');
    relabel(item);
    const describedBy = handle.getAttribute('aria-describedby');
    handle.setAttribute(
      'aria-describedby',
      describedBy == null ? hintId : `${describedBy} ${hintId}`,
    );
    const releaseKey = controller.registerHandle(handle, key);
    return {
      key,
      element,
      name,
      unwire: () => {
        const own = naming.get(handle);
        naming.delete(handle);
        releaseKey();
        controller.release(handle);
        unmark();
        restore();
        // The handle's own naming as it is now, not as it was at wiring.
        if (own != null) {
          for (const [name, value] of [
            ['aria-label', own.label],
            ['aria-labelledby', own.labelledBy],
          ] as const) {
            if (value == null) {
              handle.removeAttribute(name);
            } else {
              handle.setAttribute(name, value);
            }
          }
        }
      },
    };
  };

  // The handle `target` is in, if it is one of this container's.
  const handleOf = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) {
      return null;
    }
    for (const handle of wired.keys()) {
      if (handle.contains(target)) {
        return handle;
      }
    }
    return null;
  };

  // Reorder mode's look, set at its first use: the container takes the
  // insertion line's style, and the hint mounts. The controller positions
  // the container for the line while the mode lasts.
  let restoreContainer: (() => void) | null = null;
  let hintRoot: Root | null = null;
  let hintHost: HTMLElement | null = null;
  const prepareMode = () => {
    if (restoreContainer == null) {
      // Only the tokens this adds come off again: the app may change the
      // container's classes while it is attached.
      const {className} = stylex.props(controller.listStyle);
      const added = (className ?? '')
        .split(/\s+/)
        .filter(token => token !== '' && !container.classList.contains(token));
      container.classList.add(...added);
      restoreContainer = () => container.classList.remove(...added);
    }
    if (hintRoot == null) {
      hintHost = doc.createElement('div');
      // Out of flow and sizeless: the hint itself is in the top layer.
      hintHost.style.position = 'fixed';
      hintHost.style.inset = '0 auto auto 0';
      hintHost.style.inlineSize = '0';
      hintHost.style.blockSize = '0';
      ownedParentOf().append(hintHost);
      hintRoot = createRoot(hintHost);
      hintRoot.render(createElement(ListReorderModeHint, {controller}));
    }
  };

  const unsubscribeMode = controller.subscribeMode(() => {
    const target = controller.modeTarget;
    if (target != null) {
      prepareMode();
    }
    for (const handle of wired.keys()) {
      handle.setAttribute('aria-pressed', String(handle === target));
    }
  });

  controller.configure({
    options: {
      onReorder: move => {
        options.onReorder(move);
        // The app applies the move by the end of this task; a React app's
        // flush is queued before this check.
        queueMicrotask(settle);
      },
      isReorderable: options.isReorderable,
      startedBy: options.startedBy ?? options,
    },
    announce,
    messages: {
      ...messagesFrom(t),
      notMoved: label => t('@astryx.list.reorderNotMoved', {label}),
    },
    presentation: 'theme',
  });
  // Reads the items after a move: a move that landed commits, and its row's
  // new handle takes the mode.
  const settle = () => {
    sync();
    controller.commit();
  };
  controller.beforeStart = sync;
  controller.settle = settle;
  const unmount = mountSession(options.startedBy ?? options, controller);

  const onClick = (event: MouseEvent) => {
    sync();
    const handle = handleOf(event.target);
    if (handle != null && !controller.takeDrag(handle)) {
      controller.toggleMode(handle);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const handle = handleOf(event.target);
    if (handle == null) {
      return;
    }
    sync();
    // A handle that is not a button takes a button's Space and Enter.
    if (
      !(handle instanceof HTMLButtonElement) &&
      (event.key === 'Enter' || event.key === ' ') &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      controller.toggleMode(handle);
      return;
    }
    controller.keyDown(handle, event);
  };
  const onFocusOut = (event: FocusEvent) => {
    const handle = handleOf(event.target);
    if (handle != null) {
      controller.blur(handle, event.relatedTarget);
    }
  };
  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('focusout', onFocusOut);

  sync();

  return {
    detach: () => {
      if (detached) {
        return;
      }
      detached = true;
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('focusout', onFocusOut);
      unmount();
      controller.dispose();
      unsubscribeMode();
      for (const entry of wired.values()) {
        entry.unwire();
      }
      wired.clear();
      for (const entry of named.values()) {
        entry.release();
      }
      named.clear();
      const root = hintRoot;
      const host = hintHost;
      hintRoot = null;
      hintHost = null;
      // A React app may detach while it renders (a ref callback's cleanup),
      // and a root cannot unmount synchronously then.
      host?.setAttribute('hidden', '');
      queueMicrotask(() => {
        root?.unmount();
        host?.remove();
      });
      instructions.remove();
      restoreContainer?.();
      restoreContainer = null;
    },
  };
}
