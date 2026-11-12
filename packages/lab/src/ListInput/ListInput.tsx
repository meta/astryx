// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListInput.tsx
 * @input React, StyleX, Astryx field/list/button/icon/empty-state
 *   primitives, the container-reveal hook, compact size context, browser
 *   scroll geometry, and programmatic theme tokens. Also core List's reorder
 *   session and handle, run by the owner's createReorderable object through
 *   Core's internal entry `@astryxdesign/core/internal/reorder`
 * @output Exports ListInput and its controlled data, column, renderer, and change types
 * @position Lab experiment (RFC meta/astryx#4531) for editing compact repeated records
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/ListInput/ListInput.doc.mjs
 * - /packages/lab/src/ListInput/ListInput.test.tsx
 * - /packages/lab/src/ListInput/index.ts
 * - /apps/storybook/stories/ListInput.stories.tsx
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type Key,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Field, type InputStatus} from '@astryxdesign/core/Field';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {Icon} from '@astryxdesign/core/Icon';
import {
  useAnnounce,
  useContainerReveal,
  useMediaQuery,
} from '@astryxdesign/core/hooks';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  ListReorderScope,
  useListReorderScope,
} from '@astryxdesign/core/internal/reorder';
import type {Reorderable} from '@astryxdesign/core';
import {SizeProvider} from '@astryxdesign/core/SizeContext';
import type {ColumnWidth} from '@astryxdesign/core/Table';
import {useTheme} from '@astryxdesign/core/theme';
import {
  colorVars,
  fontWeightVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';

// Bundlers replace this value at build time. The declaration lets a product
// without Node's types type-check this file.
declare const process: {readonly env: {readonly NODE_ENV?: string}};

export type ListInputChange<T> =
  | {type: 'add'; item: T; index: number}
  | {
      type: 'update';
      item: T;
      previousItem: T;
      index: number;
      columnKey?: string;
    }
  | {type: 'remove'; item: T; index: number};

export interface ListInputValueContext<T> {
  /** Current record. */
  item: T;
  /** Current visual position. */
  index: number;
  /** Accessible cell label, including the record position. */
  label: string;
  /** True because ListInput owns the visible column label. */
  isLabelHidden: boolean;
}

export interface ListInputRenderContext<T> extends ListInputValueContext<T> {
  /** Complete validation status scoped to this field. */
  status?: InputStatus;
  /** Forward to the rendered Astryx control so status uses its native tooltip. */
  statusVariant: 'tooltip';
  /** Whether the rendered control should be disabled. */
  isDisabled: boolean;
  /** Whether an asynchronous list operation is in progress. */
  isLoading: boolean;
  /** Replace this record in the controlled list. */
  updateItem: (nextItem: T, columnKey?: string) => void;
}

export interface ListInputColumn<T> {
  /** Stable column identifier, also passed to getFieldStatus. */
  key: string;
  /** Field label shown on the first record and repeated when rows stack. */
  header: string;
  /**
   * Column sizing. Use proportional() or pixel() from @astryxdesign/core/Table
   * to tune the width ratio. Defaults to a proportional column with a 140px floor.
   */
  width?: ColumnWidth;
  /** Renders the editable control for one cell. */
  renderInput: (context: ListInputRenderContext<T>) => ReactNode;
}

export interface ListInputProps<T> extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the outer field element. */
  ref?: React.Ref<HTMLDivElement>;
  /** Visible and accessible label for the list. */
  label: string;
  /** Optional supporting text. */
  description?: string;
  /** Controlled records. */
  value: T[];
  /** Called for every record mutation with the next value and mutation detail. */
  onChange: (nextValue: T[], change: ListInputChange<T>) => void;
  /** Returns a stable key for focus preservation and reordering. */
  getItemKey: (item: T) => Key;
  /** Creates a new record when the Add action is used. */
  createItem: () => T;
  /** Column definitions and cell renderers. */
  columns: ListInputColumn<T>[];
  /** Singular name used in action labels and announcements. @default 'item' */
  itemName?: string;
  /** Validation status for the whole list. */
  status?: InputStatus;
  /** Returns a validation status displayed across one record. */
  getItemStatus?: (item: T, index: number) => InputStatus | undefined;
  /** Returns a validation status passed to one field renderer. */
  getFieldStatus?: (
    item: T,
    columnKey: string,
    index: number,
  ) => InputStatus | undefined;
  /**
   * Makes the records reorderable: pass the object
   * `createReorderable` makes, keyed by `getItemKey`. Each record ends with
   * core List's reorder handle. A finger holds it a moment, then drags. A
   * mouse drags at once. Its arrow keys move the record. The object's
   * `isReorderable(key)` says which records move, and each move goes to its
   * `onReorder({key, to})`, `to` being the record's index in `value` after
   * the move. Without it, the records keep their order.
   */
  reorderable?: Reorderable;
  /** Disables fields and mutation controls. @default false */
  isDisabled?: boolean;
  /** Marks the list busy and prevents mutations. @default false */
  isLoading?: boolean;
  /** Maximum record count. Reaching it disables, but does not remove, Add. */
  maxItems?: number;
  /** Visually hides the list label while preserving its accessible name. */
  isLabelHidden?: boolean;
  /** Marks the list optional. */
  isOptional?: boolean;
  /** Marks the list required. */
  isRequired?: boolean;
}

interface PendingFocus {
  itemKey?: string;
  target: 'first-field' | 'remove' | 'add';
}

interface PendingAddScrollAnchor {
  addTop: number;
  expectedKeys: string[];
  itemKey: string;
}

interface LayoutSnapshot {
  element: HTMLElement;
  rect: DOMRect;
}

interface PendingMutationMotion<T> {
  before: Map<string, LayoutSnapshot>;
  duration: number;
  easing: string;
  entryOffset: string;
  matchesValue: (nextValue: T[]) => boolean;
}

// Core List's reorder handle is 28 px wide for every pointer.
const REORDER_HANDLE_SIZE = 28;

const styles = stylex.create({
  group: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflowAnchor: 'none',
    width: '100%',
    containerType: 'inline-size',
    containerName: 'list-input',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: {
      default: spacingVars['--spacing-2'],
      '@container list-input (max-width: 640px)': spacingVars['--spacing-8'],
    },
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    position: 'relative',
  },
  row: {
    display: 'grid',
    alignItems: 'end',
    columnGap: spacingVars['--spacing-1'],
    rowGap: {
      default: 0,
      '@container list-input (max-width: 640px)': spacingVars['--spacing-2'],
    },
    minWidth: 0,
    // Core's reorder handle reaches into a ListItem row's inline inset. A
    // record has no inset, so the handle and its focus ring end at its edge.
    '--_item-inset-inline': '0px',
  },
  rowFieldsOnly: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  rowWithRemove: {
    gridTemplateColumns: `minmax(0, 1fr) ${sizeVars['--size-element-md']}`,
  },
  // Fields, then Remove and the reorder handle in one cell at the row's end
  // (UIKit's reorder control is the trailing control of an editing row). The
  // cell's track is fixed, so the Add row, which has no controls, keeps the
  // fields' width.
  rowWithRemoveAndHandle: {
    gridTemplateColumns: `minmax(0, 1fr) calc(${sizeVars['--size-element-md']} + ${spacingVars['--spacing-1']} + ${REORDER_HANDLE_SIZE}px)`,
  },
  fields: {
    display: {
      default: 'grid',
      '@container list-input (max-width: 640px)': 'contents',
    },
    alignItems: 'end',
    gap: {
      default: spacingVars['--spacing-1'],
      '@container list-input (max-width: 640px)': spacingVars['--spacing-2'],
    },
    minWidth: 0,
  },
  fieldCell: {
    gridColumn: {
      default: 'auto',
      '@container list-input (max-width: 640px)': '1',
    },
  },
  contentOnly: {gridColumn: '1 / -1'},
  contentBeforeOneControl: {gridColumn: '1 / -2'},
  itemStatus: {
    gridRow: {
      default: '2',
      '@container list-input (max-width: 640px)': 'auto',
    },
    marginBlockStart: {
      default: spacingVars['--spacing-1'],
      '@container list-input (max-width: 640px)': 0,
    },
    minWidth: 0,
  },
  actionRow: {
    display: 'grid',
    alignItems: 'center',
    columnGap: spacingVars['--spacing-1'],
    marginBlockStart: spacingVars['--spacing-2'],
  },
  actionContent: {
    minWidth: 0,
  },
  columnLabel: {
    display: 'block',
    marginBlockEnd: {
      default: spacingVars['--spacing-0-5'],
      '@container list-input (max-width: 640px)': spacingVars['--spacing-1'],
    },
    color: colorVars['--color-text-primary'],
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  repeatedColumnLabel: {
    display: {
      default: 'none',
      '@container list-input (max-width: 640px)': 'block',
    },
  },
  cellContent: {minWidth: 0},
  controlCell: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'end',
    // Remove keeps its column in a record that has no reorder handle.
    justifyContent: 'flex-start',
    columnGap: spacingVars['--spacing-1'],
    minHeight: sizeVars['--size-element-md'],
  },
  removeControlCell: {
    gridColumn: {
      default: 'auto',
      '@container list-input (max-width: 640px)': '2',
    },
    gridRow: {
      default: 'auto',
      '@container list-input (max-width: 640px)': '1',
    },
  },
  emptyItem: {
    width: '100%',
  },
});

const dynamicStyles = stylex.create({
  fields: (gridTemplateColumns: string) => ({
    gridTemplateColumns: {
      default: gridTemplateColumns,
      '@container list-input (max-width: 640px)': 'minmax(0, 1fr)',
    },
  }),
});

function resolveColumnTrack(width?: ColumnWidth): string {
  if (width?.type === 'pixel') {
    return `${width.value}px`;
  }
  const proportion = width?.value ?? 1;
  const minWidth = width?.minWidth ?? 140;
  return `minmax(${minWidth}px, ${proportion}fr)`;
}

function joinIDs(...ids: Array<string | undefined>): string | undefined {
  const resolved = ids.filter(Boolean);
  return resolved.length > 0 ? resolved.join(' ') : undefined;
}

const focusableFieldSelector =
  '[data-list-input-cell] input, [data-list-input-cell] select, [data-list-input-cell] textarea, [data-list-input-cell] button, [data-list-input-cell] [tabindex]:not([tabindex="-1"])';

function getScrollableAncestors(element: HTMLElement): HTMLElement[] {
  const scrollRoots: HTMLElement[] = [];
  let current = element.parentElement;

  while (current != null) {
    const overflowY = window.getComputedStyle(current).overflowY;
    const isScrollable =
      (overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight;

    if (isScrollable) {
      scrollRoots.push(current);
    }
    current = current.parentElement;
  }

  return scrollRoots;
}

function isVerticallyPerceivable(element: HTMLElement): boolean {
  const elementBounds = element.getBoundingClientRect();
  const viewportBottom =
    window.innerHeight || document.documentElement.clientHeight;
  let visibleTop = 0;
  let visibleBottom = viewportBottom;
  let current = element.parentElement;

  while (current != null) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'overlay' ||
      overflowY === 'hidden' ||
      overflowY === 'clip'
    ) {
      const bounds = current.getBoundingClientRect();
      const contentTop = bounds.top + current.clientTop;
      visibleTop = Math.max(visibleTop, contentTop);
      visibleBottom = Math.min(
        visibleBottom,
        contentTop + current.clientHeight,
      );
    }
    current = current.parentElement;
  }

  const elementCenter = (elementBounds.top + elementBounds.bottom) / 2;
  return elementCenter >= visibleTop && elementCenter <= visibleBottom;
}

function scrollByInstantly(
  scrollRoot: HTMLElement | null,
  delta: number,
): void {
  const styleTarget = scrollRoot ?? document.documentElement;
  const previousBehavior =
    styleTarget.style.getPropertyValue('scroll-behavior');
  const previousPriority =
    styleTarget.style.getPropertyPriority('scroll-behavior');
  styleTarget.style.setProperty('scroll-behavior', 'auto', 'important');

  try {
    if (scrollRoot != null) {
      scrollRoot.scrollTop += delta;
    } else {
      window.scrollBy(0, delta);
    }
  } finally {
    if (previousBehavior === '') {
      styleTarget.style.removeProperty('scroll-behavior');
    } else {
      styleTarget.style.setProperty(
        'scroll-behavior',
        previousBehavior,
        previousPriority,
      );
    }
  }
}

function parseDuration(value: string): number {
  const normalizedValue = value.trim();
  const duration = Number.parseFloat(normalizedValue);
  if (!Number.isFinite(duration)) {
    return 0;
  }
  if (normalizedValue.endsWith('ms')) {
    return duration;
  }
  return normalizedValue.endsWith('s') ? duration * 1000 : 0;
}

function captureMutationLayout(
  root: HTMLElement,
  activeAnimations: Map<HTMLElement, Animation>,
): Map<string, LayoutSnapshot> {
  const snapshots = new Map<string, LayoutSnapshot>();
  const elements: HTMLElement[] = [];
  for (const child of root.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.tagName === 'OL') {
      for (const item of child.children) {
        if (
          item instanceof HTMLElement &&
          item.dataset.listInputMotionKey != null
        ) {
          elements.push(item);
        }
      }
    } else if (child.dataset.listInputMotionKey != null) {
      elements.push(child);
    }
  }
  for (const element of elements) {
    const key = element.dataset.listInputMotionKey;
    if (key == null) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    activeAnimations.get(element)?.cancel();
    activeAnimations.delete(element);
    snapshots.set(key, {element, rect});
  }
  return snapshots;
}

function startMutationAnimation(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  activeAnimations: Map<HTMLElement, Animation>,
): void {
  try {
    const animation = element.animate(keyframes, options);
    activeAnimations.set(element, animation);
    void animation.finished.then(
      () => {
        if (activeAnimations.get(element) === animation) {
          activeAnimations.delete(element);
        }
      },
      () => {
        if (activeAnimations.get(element) === animation) {
          activeAnimations.delete(element);
        }
      },
    );
  } catch {
    // Motion is progressive enhancement; the controlled update already ran.
  }
}

/**
 * A compact editor for short collections of consistent, simple records.
 *
 * ListInput owns list semantics, add/remove controls, handle-only reordering,
 * live collection motion, focus restoration, announcements, and list/item/
 * field validation placement. Consumers keep ownership of the controlled data
 * and render each field with standard Astryx inputs.
 *
 * @example
 * ```
 * <ListInput
 *   label="Guests"
 *   value={guests}
 *   onChange={setGuests}
 *   getItemKey={guest => guest.id}
 *   createItem={() => ({id: crypto.randomUUID(), name: '', email: ''})}
 *   columns={columns}
 *   itemName="guest"
 *   reorderable={reorderable}
 * />
 * ```
 */
export function ListInput<T>({
  label,
  description,
  value,
  onChange,
  getItemKey,
  createItem,
  columns,
  itemName = 'item',
  status,
  getItemStatus,
  getFieldStatus,
  reorderable,
  isDisabled = false,
  isLoading = false,
  maxItems,
  isLabelHidden = false,
  isOptional = false,
  isRequired = false,
  ref,
  ...rest
}: ListInputProps<T>): ReactNode {
  const generatedID = useId();
  const groupID = `list-input-${generatedID}`;
  const labelID = `${groupID}-label`;
  const descriptionID = description ? `${groupID}-description` : undefined;
  const statusID = status?.message ? `${groupID}-status` : undefined;
  const reorderInstructionsID = `${groupID}-reorder-instructions`;
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const groupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const addActionRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addPointerAnchorTopRef = useRef<number | null>(null);
  const addAnchorFrameRef = useRef<number | null>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const pendingAddScrollAnchorRef = useRef<PendingAddScrollAnchor | null>(null);
  const pendingMutationMotionRef = useRef<PendingMutationMotion<T> | null>(
    null,
  );
  const activeMutationAnimationsRef = useRef(new Map<HTMLElement, Animation>());
  const t = useTranslator();
  const announce = useAnnounce();
  const {tokens: themeTokens} = useTheme();
  const mutationDuration = parseDuration(
    themeTokens['--duration-fast-max'] ?? '',
  );
  const mutationEasing = themeTokens['--ease-standard'] ?? 'linear';
  const mutationEntryOffset = themeTokens['--spacing-2'] ?? '8px';
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );
  // Each record row reveals its row actions (Remove and, when reorderable, the
  // reorder handle) on hover or keyboard focus; touch keeps them visible.
  const {getContainerProps, getContentRevealProps} = useContainerReveal();
  // A disabled or loading list keeps its handles focusable but inert.
  const reorderScope = useListReorderScope(
    reorderable,
    () => listRef.current,
    reorderInstructionsID,
  );
  const canReorder = reorderScope?.options.isReorderable;
  const showReorderHandle = reorderScope != null;
  // The handle comes with the owner's object: a list without one loads no
  // reorder code.
  const Handle = reorderScope?.session.Handle;
  const showRemoveColumn = true;
  const fieldGridTemplate = useMemo(
    () => columns.map(column => resolveColumnTrack(column.width)).join(' '),
    [columns],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    const itemKeys = new Set<string>();
    for (const item of value) {
      const key = String(getItemKey(item));
      if (itemKeys.has(key)) {
        console.warn(
          `ListInput: getItemKey returned duplicate key "${key}". Keys must be unique and stable.`,
        );
        break;
      }
      itemKeys.add(key);
    }
    const columnKeys = new Set<string>();
    for (const column of columns) {
      if (columnKeys.has(column.key)) {
        console.warn(
          `ListInput: columns contains duplicate key "${column.key}". Column keys must be unique.`,
        );
        break;
      }
      columnKeys.add(column.key);
    }
  }, [columns, getItemKey, value]);

  useEffect(() => {
    const activeAnimations = activeMutationAnimationsRef.current;
    return () => {
      if (addAnchorFrameRef.current != null) {
        window.cancelAnimationFrame(addAnchorFrameRef.current);
      }
      for (const animation of activeAnimations.values()) {
        animation.cancel();
      }
      activeAnimations.clear();
    };
  }, []);

  useEffect(() => {
    if (!prefersReducedMotion) {
      return;
    }
    for (const animation of activeMutationAnimationsRef.current.values()) {
      animation.cancel();
    }
    activeMutationAnimationsRef.current.clear();
    pendingMutationMotionRef.current = null;
  }, [prefersReducedMotion]);

  useLayoutEffect(() => {
    const pendingAnchor = pendingAddScrollAnchorRef.current;
    if (pendingAnchor == null) {
      return;
    }
    const matchesValue =
      value.length === pendingAnchor.expectedKeys.length &&
      value.every(
        (item, index) =>
          String(getItemKey(item)) === pendingAnchor.expectedKeys[index],
      );
    if (!matchesValue) {
      pendingAddScrollAnchorRef.current = null;
      return;
    }
    pendingAddScrollAnchorRef.current = null;

    const addAction = addActionRef.current;
    if (addAction == null) {
      return;
    }
    const pendingFocus = pendingFocusRef.current;
    const addedRow = rowRefs.current.get(pendingAnchor.itemKey);
    const focusTarget =
      pendingFocus?.target === 'first-field' &&
      pendingFocus.itemKey === pendingAnchor.itemKey
        ? (addedRow?.querySelector<HTMLElement>(focusableFieldSelector) ?? null)
        : null;
    if (focusTarget != null) {
      focusTarget.focus({preventScroll: true});
      pendingFocusRef.current = null;
    }

    // Resolve after insertion: the new record may make a nearer overflow
    // container scrollable for the first time. Cascade any clamped remainder
    // outward so a partially growing inner container does not displace Add.
    const preserveAddPosition = () => {
      const scrollRoots = getScrollableAncestors(addAction);
      for (const scrollRoot of scrollRoots) {
        const scrollDelta =
          addAction.getBoundingClientRect().top - pendingAnchor.addTop;
        if (Math.abs(scrollDelta) < 0.5) {
          break;
        }
        scrollByInstantly(scrollRoot, scrollDelta);
      }
      const viewportDelta =
        addAction.getBoundingClientRect().top - pendingAnchor.addTop;
      if (Math.abs(viewportDelta) >= 0.5) {
        scrollByInstantly(null, viewportDelta);
      }
    };
    preserveAddPosition();

    // Slight clipping should not move Add away from an active pointer. Only a
    // meaningfully hidden target takes priority over pointer anchoring.
    if (focusTarget != null && !isVerticallyPerceivable(focusTarget)) {
      focusTarget.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
    } else {
      // Recheck once after the browser's native anchoring/focus phase. This is
      // interaction-scoped work, not a persistent scroll or resize observer.
      if (addAnchorFrameRef.current != null) {
        window.cancelAnimationFrame(addAnchorFrameRef.current);
      }
      addAnchorFrameRef.current = window.requestAnimationFrame(() => {
        addAnchorFrameRef.current = null;
        if (addAction.isConnected) {
          preserveAddPosition();
        }
      });
    }
  }, [getItemKey, value]);

  useLayoutEffect(() => {
    const pendingMotion = pendingMutationMotionRef.current;
    if (pendingMotion == null) {
      return;
    }
    if (!pendingMotion.matchesValue(value)) {
      pendingMutationMotionRef.current = null;
      return;
    }
    pendingMutationMotionRef.current = null;
    const root = groupRef.current;
    if (root == null) {
      return;
    }

    const activeAnimations = activeMutationAnimationsRef.current;
    const after = captureMutationLayout(root, activeAnimations);
    const options: KeyframeAnimationOptions = {
      duration: pendingMotion.duration,
      easing: pendingMotion.easing,
    };
    const hasSizeChange = Array.from(after).some(([key, nextSnapshot]) => {
      const previousSnapshot = pendingMotion.before.get(key);
      return (
        previousSnapshot != null &&
        (Math.abs(previousSnapshot.rect.width - nextSnapshot.rect.width) >=
          0.5 ||
          Math.abs(previousSnapshot.rect.height - nextSnapshot.rect.height) >=
            0.5)
      );
    });
    const hasEnteringParticipant = Array.from(after.keys()).some(
      key => !pendingMotion.before.has(key),
    );
    for (const [key, nextSnapshot] of after) {
      const previousSnapshot = pendingMotion.before.get(key);
      if (previousSnapshot == null) {
        startMutationAnimation(
          nextSnapshot.element,
          [
            {transform: `translateY(${pendingMotion.entryOffset})`},
            {transform: 'translateY(0)'},
          ],
          options,
          activeAnimations,
        );
        continue;
      }
      // Appended rows already carry the orientation cue; moving the Add action
      // from beneath them would temporarily overlap the new live controls.
      if (hasSizeChange || hasEnteringParticipant) {
        continue;
      }

      const deltaX = previousSnapshot.rect.left - nextSnapshot.rect.left;
      const deltaY = previousSnapshot.rect.top - nextSnapshot.rect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        continue;
      }
      startMutationAnimation(
        nextSnapshot.element,
        [
          {transform: `translate(${deltaX}px, ${deltaY}px)`},
          {transform: 'translate(0, 0)'},
        ],
        options,
        activeAnimations,
      );
    }
  }, [value]);

  useLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current;
    if (pendingFocus == null) {
      return;
    }
    let target: HTMLElement | null = null;
    if (pendingFocus.target === 'add') {
      target = addButtonRef.current;
    } else if (pendingFocus.itemKey != null) {
      const row = rowRefs.current.get(pendingFocus.itemKey);
      const selector =
        pendingFocus.target === 'remove'
          ? '[data-list-input-remove]'
          : focusableFieldSelector;
      target = row?.querySelector<HTMLElement>(selector) ?? null;
    }
    if (target != null) {
      target.focus();
      pendingFocusRef.current = null;
    }
  }, [value]);

  const mutationsDisabled = isDisabled || isLoading;
  const hasReachedMax = maxItems != null && value.length >= maxItems;

  const prepareMutationMotion = (nextValue: T[]) => {
    const root = groupRef.current;
    if (
      root == null ||
      prefersReducedMotion ||
      mutationDuration <= 0 ||
      typeof root.animate !== 'function'
    ) {
      pendingMutationMotionRef.current = null;
      return;
    }

    const expectedKeys = nextValue.map(item => String(getItemKey(item)));
    const pendingMotion: PendingMutationMotion<T> = {
      before: captureMutationLayout(root, activeMutationAnimationsRef.current),
      duration: mutationDuration,
      easing: mutationEasing,
      entryOffset: mutationEntryOffset,
      matchesValue: candidate =>
        candidate.length === expectedKeys.length &&
        candidate.every(
          (item, index) => String(getItemKey(item)) === expectedKeys[index],
        ),
    };
    pendingMutationMotionRef.current = pendingMotion;
    window.setTimeout(() => {
      // Delayed controlled updates cannot safely reuse viewport measurements
      // from the originating interaction. Synchronous updates consume the
      // snapshot in the layout effect before the next task.
      if (pendingMutationMotionRef.current === pendingMotion) {
        pendingMutationMotionRef.current = null;
      }
    }, 0);
  };

  const prepareAddScrollAnchor = (
    nextValue: T[],
    itemKey: string,
    pointerDownTop?: number,
  ) => {
    const addAction = addActionRef.current;
    if (addAction == null) {
      pendingAddScrollAnchorRef.current = null;
      return;
    }

    const pendingAnchor: PendingAddScrollAnchor = {
      addTop: pointerDownTop ?? addAction.getBoundingClientRect().top,
      expectedKeys: nextValue.map(item => String(getItemKey(item))),
      itemKey,
    };
    pendingAddScrollAnchorRef.current = pendingAnchor;
    window.setTimeout(() => {
      // Controlled updates that arrive in a later task cannot safely reuse a
      // pointer position captured during the originating click.
      if (pendingAddScrollAnchorRef.current === pendingAnchor) {
        pendingAddScrollAnchorRef.current = null;
      }
    }, 0);
  };

  const handleAddPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      mutationsDisabled ||
      hasReachedMax
    ) {
      addPointerAnchorTopRef.current = null;
      return;
    }
    addPointerAnchorTopRef.current =
      addActionRef.current?.getBoundingClientRect().top ?? null;
  };

  const handleAdd = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (mutationsDisabled || hasReachedMax) {
      return;
    }
    const item = createItem();
    const nextValue = [...value, item];
    const itemKey = String(getItemKey(item));
    pendingFocusRef.current = {
      itemKey,
      target: 'first-field',
    };
    if (event.detail > 0) {
      prepareAddScrollAnchor(
        nextValue,
        itemKey,
        addPointerAnchorTopRef.current ?? undefined,
      );
    } else {
      pendingAddScrollAnchorRef.current = null;
    }
    addPointerAnchorTopRef.current = null;
    prepareMutationMotion(nextValue);
    onChange(nextValue, {type: 'add', item, index: value.length});
    announce(
      t('@astryx.listInput.announceAdded', {
        itemName,
        position: value.length + 1,
      }),
    );
  };

  const handleUpdate = (
    item: T,
    index: number,
    nextItem: T,
    columnKey?: string,
  ) => {
    if (mutationsDisabled) {
      return;
    }
    const nextValue = value.slice();
    nextValue[index] = nextItem;
    onChange(nextValue, {
      type: 'update',
      item: nextItem,
      previousItem: item,
      index,
      columnKey,
    });
  };

  const handleRemove = (item: T) => {
    if (mutationsDisabled) {
      return;
    }
    const itemKey = String(getItemKey(item));
    const index = value.findIndex(
      candidate => String(getItemKey(candidate)) === itemKey,
    );
    if (index < 0) {
      return;
    }
    const removedItem = value[index];
    const nextValue = value.filter((_, itemIndex) => itemIndex !== index);
    const nextFocusItem = nextValue[Math.min(index, nextValue.length - 1)];
    pendingFocusRef.current =
      nextFocusItem == null
        ? {target: 'add'}
        : {itemKey: String(getItemKey(nextFocusItem)), target: 'remove'};
    prepareMutationMotion(nextValue);
    onChange(nextValue, {type: 'remove', item: removedItem, index});
    announce(
      t('@astryx.listInput.announceRemoved', {itemName, position: index + 1}),
    );
  };

  const rowLayoutStyle = showReorderHandle
    ? styles.rowWithRemoveAndHandle
    : showRemoveColumn
      ? styles.rowWithRemove
      : styles.rowFieldsOnly;
  const contentGridStyle = showRemoveColumn
    ? styles.contentBeforeOneControl
    : styles.contentOnly;
  return (
    <SizeProvider value="md">
      <Field
        ref={ref}
        label={label}
        description={description}
        inputID={groupID}
        labelID={labelID}
        descriptionID={descriptionID}
        isGroupLabel
        isLabelHidden={isLabelHidden}
        isOptional={isOptional}
        isRequired={isRequired}
        isDisabled={isDisabled}
        status={status == null ? undefined : {...status, messageID: statusID}}
        statusVariant="detached"
        {...rest}>
        <div
          ref={groupRef}
          id={groupID}
          role="group"
          aria-labelledby={labelID}
          aria-describedby={joinIDs(descriptionID, statusID)}
          aria-disabled={isDisabled || undefined}
          aria-busy={isLoading || undefined}
          {...mergeProps(
            themeProps('list-input', {
              state: isLoading
                ? 'loading'
                : isDisabled
                  ? 'disabled'
                  : undefined,
              reorderable: showReorderHandle ? 'true' : undefined,
            }),
            stylex.props(styles.group),
          )}>
          <ListReorderScope reorder={reorderScope}>
            <ol
              ref={listRef}
              role="list"
              aria-labelledby={labelID}
              aria-describedby={joinIDs(descriptionID, statusID)}
              {...stylex.props(
                styles.list,
                // The session's line marks where a dragged record would land.
                reorderScope?.session.listStyle,
              )}>
              {value.length === 0 ? (
                <li
                  data-list-input-motion-key="state:empty"
                  {...stylex.props(styles.emptyItem)}>
                  <EmptyState
                    title={t('@astryx.listInput.emptyTitle', {itemName})}
                    description={t('@astryx.listInput.emptyDescription', {
                      itemName,
                    })}
                    isCompact
                  />
                </li>
              ) : (
                value.map((item, index) => {
                  const itemKey = getItemKey(item);
                  const itemKeyString = String(itemKey);
                  // A record the owner's isReorderable rejects keeps its
                  // place, with no handle.
                  const hasHandle =
                    showReorderHandle && (canReorder?.(itemKey) ?? true);
                  const itemStatus = getItemStatus?.(item, index);
                  const itemStatusID = itemStatus?.message
                    ? `${groupID}-item-${index}-status`
                    : undefined;
                  return (
                    <li
                      key={itemKey}
                      data-list-input-motion-key={`item:${itemKeyString}`}
                      aria-describedby={itemStatusID}
                      aria-invalid={itemStatus?.type === 'error' || undefined}
                      aria-posinset={index + 1}
                      aria-setsize={value.length}
                      {...stylex.props(
                        styles.item,
                        hasHandle && reorderScope?.session.rowStyle,
                      )}>
                      <div
                        ref={node => {
                          if (node == null) {
                            rowRefs.current.delete(itemKeyString);
                          } else {
                            rowRefs.current.set(itemKeyString, node);
                          }
                        }}
                        data-list-input-row={itemKeyString}
                        {...mergeProps(
                          getContainerProps(),
                          stylex.props(styles.row, rowLayoutStyle),
                        )}>
                        <div
                          {...stylex.props(
                            styles.fields,
                            dynamicStyles.fields(fieldGridTemplate),
                          )}>
                          {columns.map((column, columnIndex) => {
                            const fieldStatus = getFieldStatus?.(
                              item,
                              column.key,
                              index,
                            );
                            const isRepeatedLabel = index !== 0;
                            const cellLabel = isRepeatedLabel
                              ? t('@astryx.listInput.fieldLabelWithPosition', {
                                  header: column.header,
                                  itemName,
                                  position: index + 1,
                                  total: value.length,
                                })
                              : column.header;
                            const valueContext: ListInputValueContext<T> = {
                              item,
                              index,
                              label: cellLabel,
                              isLabelHidden: true,
                            };
                            const content = column.renderInput({
                              ...valueContext,
                              status: fieldStatus,
                              statusVariant: 'tooltip',
                              isDisabled: isDisabled || isLoading,
                              isLoading,
                              updateItem: (nextItem, changeColumnKey) =>
                                handleUpdate(
                                  item,
                                  index,
                                  nextItem,
                                  changeColumnKey ?? column.key,
                                ),
                            });
                            return (
                              <div
                                key={column.key}
                                data-list-input-cell={String(columnIndex)}
                                {...stylex.props(
                                  styles.cellContent,
                                  styles.fieldCell,
                                )}>
                                <span
                                  aria-hidden="true"
                                  data-list-input-column-label={
                                    isRepeatedLabel ? 'responsive' : 'primary'
                                  }
                                  {...stylex.props(
                                    styles.columnLabel,
                                    isRepeatedLabel &&
                                      styles.repeatedColumnLabel,
                                  )}>
                                  {column.header}
                                </span>
                                <div {...stylex.props(styles.cellContent)}>
                                  {content}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {showRemoveColumn ? (
                          <div
                            {...mergeProps(
                              // Opacity only: Remove and the reorder handle keep
                              // their places, so the fields never shift when
                              // they appear.
                              getContentRevealProps({isLayoutPreserved: true}),
                              stylex.props(
                                styles.controlCell,
                                styles.removeControlCell,
                              ),
                            )}>
                            <IconButton
                              label={t('@astryx.listInput.removeItem', {
                                itemName,
                                position: index + 1,
                              })}
                              tooltip={
                                isDisabled || isLoading
                                  ? t('@astryx.listInput.removeUnavailable', {
                                      itemName,
                                    })
                                  : t('@astryx.listInput.removeItem', {
                                      itemName,
                                      position: index + 1,
                                    })
                              }
                              icon={<Icon icon="close" size="sm" />}
                              variant="ghost"
                              size="md"
                              isDisabled={isDisabled || isLoading}
                              data-list-input-remove=""
                              onClick={() => handleRemove(item)}
                            />
                            {Handle != null && hasHandle ? (
                              // Named "Reorder guest 2", like Remove.
                              <Handle
                                label={t('@astryx.listInput.itemName', {
                                  itemName,
                                  position: index + 1,
                                })}
                                itemKey={itemKey}
                                isDisabled={isDisabled || isLoading}
                              />
                            ) : null}
                          </div>
                        ) : null}
                        {itemStatus?.message ? (
                          <FieldStatus
                            id={itemStatusID}
                            type={itemStatus.type}
                            message={itemStatus.message}
                            variant="detached"
                            data-list-input-item-status=""
                            xstyle={[styles.itemStatus, contentGridStyle]}
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ol>
          </ListReorderScope>
          <div
            ref={addActionRef}
            data-list-input-motion-key="action:add"
            {...stylex.props(styles.actionRow, rowLayoutStyle)}>
            <div
              data-list-input-add-content=""
              {...stylex.props(styles.actionContent, contentGridStyle)}>
              <Button
                ref={addButtonRef}
                label={t('@astryx.listInput.addItem', {itemName})}
                variant="secondary"
                size="md"
                width="100%"
                isDisabled={isDisabled || hasReachedMax}
                isLoading={isLoading}
                onPointerDown={handleAddPointerDown}
                onPointerCancel={() => {
                  addPointerAnchorTopRef.current = null;
                }}
                onClick={handleAdd}
              />
            </div>
          </div>
        </div>
      </Field>
    </SizeProvider>
  );
}

ListInput.displayName = 'ListInput';
