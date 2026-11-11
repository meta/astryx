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
 *   Pointer and touch drags are not attached yet
 *
 * The app owns its elements, so this module reads `items()` when it
 * attaches, at each press, key or `start` on a handle, and after each move.
 * It watches no mutations. A move counts when `items()` reports the new
 * order by the end of the task that ran `onReorder`; otherwise the
 * controller announces that it did not happen. Nothing touches the DOM until
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
 * The name announcements and the handle give an item: the element's own
 * accessible name, else its text.
 */
function nameOf(element: HTMLElement): string {
  const label = element.getAttribute('aria-label')?.trim();
  if (label) {
    return label;
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map(id => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      return text;
    }
  }
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Whether `element` takes focus without a `tabindex`. */
function isNativelyFocusable(element: HTMLElement): boolean {
  return (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLAnchorElement && element.hasAttribute('href'))
  );
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

/** A controller whose `start` reads the app's items first. */
class AttachedController extends ListReorderController {
  beforeStart: () => void = () => {};

  startByKey(key: string | number): boolean {
    this.beforeStart();
    return super.startByKey(key);
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
  // Every item's name, a fixed one's too: a refusal names it.
  const named = new Map<HTMLElement, {name: string; release: () => void}>();
  let detached = false;

  // The app's items that can move, in order, with a key and both elements.
  const readItems = (): ReadonlyArray<ReorderableItem> =>
    items().filter(
      item =>
        item.key != null &&
        item.element instanceof HTMLElement &&
        item.handle instanceof HTMLElement,
    );

  const rows: ReorderRows = {
    read: () => readItems().map(item => item.element),
    holds: element => readItems().some(item => item.element === element),
  };
  const controller = new AttachedController(() => container, hintId, rows);

  // The handles' instructions, which every handle's description names.
  const instructions = doc.createElement('span');
  instructions.id = hintId;
  instructions.hidden = true;
  instructions.textContent = t('@astryx.list.reorderHint', {});
  // The elements this module owns go in the nearest theme scope, not in or
  // beside the container: a list holds only its items, an editable container
  // would take them as content, and the container's parent keeps its
  // children. The theme scope gives the hint its theme.
  const ownedParent =
    container.closest<HTMLElement>('[data-astryx-theme]') ?? doc.body;
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
      const name = nameOf(item.element);
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

  const wire = (item: ReorderableItem): WiredHandle => {
    const {handle, element, key} = item;
    const restore = snapshot(handle, HANDLE_ATTRIBUTES);
    const unmark = markReorderHandle(handle);
    const name = nameOf(element);
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
    if (!isNativelyFocusable(handle) || handle.tabIndex < 0) {
      handle.setAttribute('tabindex', '0');
    }
    handle.setAttribute('aria-pressed', 'false');
    const index = readItems().findIndex(entry => entry.handle === handle);
    handle.setAttribute(
      'aria-label',
      name === ''
        ? t('@astryx.list.reorderHandleAt', {position: index + 1})
        : t('@astryx.list.reorderHandle', {label: name}),
    );
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
        releaseKey();
        controller.release(handle);
        unmark();
        restore();
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
  // insertion line, and a positioned box for it, and the hint mounts.
  let restoreContainer: (() => void) | null = null;
  let hintRoot: Root | null = null;
  let hintHost: HTMLElement | null = null;
  const prepareMode = () => {
    if (restoreContainer == null) {
      const restoreClass = snapshot(container, ['class']);
      const {className} = stylex.props(controller.listStyle);
      if (className) {
        container.classList.add(...className.split(/\s+/).filter(Boolean));
      }
      const inlinePosition = container.style.position;
      if (doc.defaultView?.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      restoreContainer = () => {
        restoreClass();
        container.style.position = inlinePosition;
      };
    }
    if (hintRoot == null) {
      hintHost = doc.createElement('div');
      // Out of flow and sizeless: the hint itself is in the top layer.
      hintHost.style.position = 'fixed';
      hintHost.style.inset = '0 auto auto 0';
      hintHost.style.inlineSize = '0';
      hintHost.style.blockSize = '0';
      ownedParent.append(hintHost);
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
        queueMicrotask(() => {
          sync();
          controller.commit();
        });
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
  controller.beforeStart = sync;
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
      root?.unmount();
      host?.remove();
      instructions.remove();
      restoreContainer?.();
      restoreContainer = null;
    },
  };
}
