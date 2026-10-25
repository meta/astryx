// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ListInput.tsx
 * @input React, StyleX, Astryx field/list/button/icon/layer/empty-state primitives, the container-reveal hook, compact size context, browser scroll geometry, programmatic theme tokens, and shared Lab reorder styles
 * @output Exports ListInput and its controlled data, column, renderer, and change types
 * @position Lab experiment (RFC facebook/astryx#4531) for editing compact repeated records
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
  useState,
  type Key,
  type ReactNode,
  type SVGProps,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {flushSync} from 'react-dom';
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
import {useLayer} from '@astryxdesign/core/Layer';
import {SizeProvider} from '@astryxdesign/core/SizeContext';
import type {ColumnWidth} from '@astryxdesign/core/Table';
import {useTheme} from '@astryxdesign/core/theme';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {
  colorVars,
  fontWeightVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  focusOutlineStyles,
  mergeProps,
  themeProps,
} from '@astryxdesign/core/utils';
import {reorderStyles} from '../reorderStyles';

export type ListInputChange<T> =
  | {type: 'add'; item: T; index: number}
  | {
      type: 'update';
      item: T;
      previousItem: T;
      index: number;
      columnKey?: string;
    }
  | {type: 'remove'; item: T; index: number}
  | {type: 'reorder'; item: T; fromIndex: number; toIndex: number};

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
  /** Enables handle-only pointer and keyboard reordering. @default false */
  isReorderable?: boolean;
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

interface ReorderState<T> {
  itemKey: Key;
  fromIndex: number;
  toIndex: number;
  originalValue: T[];
  mode: 'keyboard' | 'pointer';
  pointerId?: number;
  pointerStartX?: number;
  pointerStartY?: number;
  pointerOffsetX?: number;
  pointerOffsetY?: number;
  pointerClientX?: number;
  pointerClientY?: number;
  previewWidth?: number;
  hasPointerMoved?: boolean;
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
  },
  rowFieldsOnly: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  rowWithRemove: {
    gridTemplateColumns: `minmax(0, 1fr) ${sizeVars['--size-element-md']}`,
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
  // The first field's cell anchors the hanging reorder grip.
  handleAnchor: {
    position: 'relative',
  },
  controlCell: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'end',
    justifyContent: 'center',
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
  // The grip hangs in the inline-start gutter beside the first field's control,
  // so it never takes width from the fields. Grip plus clearance is 16px, so it
  // sits inside a container's standard padding. The padding bridges the gap to
  // the field, so the row stays hovered while the pointer crosses to the grip.
  reorderHandleHanger: {
    position: 'absolute',
    insetBlockStart: 0,
    insetBlockEnd: 0,
    insetInlineEnd: '100%',
    display: 'flex',
    alignItems: 'stretch',
    paddingInlineEnd: spacingVars['--spacing-2'],
  },
  // A bare glyph rather than a filled button: an 8px-wide target the height of
  // the field. It meets WCAG 2.5.8 through the spacing exception: the 8px
  // clearance keeps a 24px circle centered on it clear of the field.
  reorderGrip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: spacingVars['--spacing-2'],
    padding: 0,
    margin: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: {
      default: colorVars['--color-icon-primary'],
      ':disabled': colorVars['--color-icon-disabled'],
    },
  },
  reorderGripReveal: {
    display: 'flex',
  },
  reorderGripGlyph: {
    display: 'block',
    flexShrink: 0,
    width: spacingVars['--spacing-1-5'],
    aspectRatio: '3 / 5',
  },
  emptyItem: {
    width: '100%',
  },
  dragPreviewContainer: {
    containerType: 'inline-size',
    containerName: 'list-input',
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
  dragPreview: (x: number, y: number, width: number) => ({
    width,
    transform: `translate3d(${x}px, ${y}px, 0)`,
  }),
  rowTransition: (name: string) => ({viewTransitionName: name}),
});

// The six-dot grip drawn at its own size, so the narrow reorder target needs no
// square icon box around it.
function GripVerticalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 6 10" fill="none" aria-hidden="true" {...props}>
      <circle cx="1" cy="1" r="1" fill="currentColor" />
      <circle cx="5" cy="1" r="1" fill="currentColor" />
      <circle cx="1" cy="5" r="1" fill="currentColor" />
      <circle cx="5" cy="5" r="1" fill="currentColor" />
      <circle cx="1" cy="9" r="1" fill="currentColor" />
      <circle cx="5" cy="9" r="1" fill="currentColor" />
    </svg>
  );
}

function resolveColumnTrack(width?: ColumnWidth): string {
  if (width?.type === 'pixel') {
    return `${width.value}px`;
  }
  const proportion = width?.value ?? 1;
  const minWidth = width?.minWidth ?? 140;
  return `minmax(${minWidth}px, ${proportion}fr)`;
}

function moveItem<T>(value: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return value.slice();
  }
  const nextValue = value.slice();
  const [item] = nextValue.splice(fromIndex, 1);
  nextValue.splice(toIndex, 0, item);
  return nextValue;
}

function joinIDs(...ids: Array<string | undefined>): string | undefined {
  const resolved = ids.filter(Boolean);
  return resolved.length > 0 ? resolved.join(' ') : undefined;
}

// The reorder grip shares the first field's cell but is not a field.
const focusableFieldSelector =
  '[data-list-input-cell] input, [data-list-input-cell] select, [data-list-input-cell] textarea, [data-list-input-cell] button:not([data-list-input-reorder]), [data-list-input-cell] [tabindex]:not([tabindex="-1"]):not([data-list-input-reorder])';

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

const viewTransitionRootClassNames =
  stylex
    .props(reorderStyles.viewTransitionRoot)
    .className?.split(/\s+/)
    .filter(Boolean) ?? [];
let activeViewTransitionCount = 0;

function addViewTransitionRootStyles(): void {
  if (activeViewTransitionCount === 0) {
    document.documentElement.classList.add(...viewTransitionRootClassNames);
  }
  activeViewTransitionCount += 1;
}

function removeViewTransitionRootStyles(): void {
  activeViewTransitionCount = Math.max(0, activeViewTransitionCount - 1);
  if (activeViewTransitionCount === 0) {
    document.documentElement.classList.remove(...viewTransitionRootClassNames);
  }
}

function animateControlledUpdate(update: () => void): void {
  const prefersReducedMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  if (
    !prefersReducedMotion &&
    typeof document.startViewTransition === 'function'
  ) {
    addViewTransitionRootStyles();
    try {
      const transition = document.startViewTransition(() => flushSync(update));
      void transition.finished.then(
        removeViewTransitionRootStyles,
        removeViewTransitionRootStyles,
      );
    } catch {
      removeViewTransitionRootStyles();
      update();
    }
    return;
  }
  update();
}

function transitionName(scope: string, key: Key): string {
  return `${scope}-${String(key)}`.replace(/[^a-zA-Z0-9_-]/g, '-');
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
 *   isReorderable
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
  isReorderable = false,
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
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const reorderStateRef = useRef<ReorderState<T> | null>(null);
  const [reorderState, setReorderStateState] = useState<ReorderState<T> | null>(
    null,
  );
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
  const {
    render: renderDragPreviewLayer,
    show: showDragPreviewLayer,
    hide: hideDragPreviewLayer,
  } = useLayer({mode: 'fixed'});
  // Each record row reveals its row actions (Remove and, when reorderable, the
  // grip) on hover or keyboard focus; touch keeps them visible.
  const {getContainerProps, getContentRevealProps} = useContainerReveal();

  const setReorderState = (nextState: ReorderState<T> | null) => {
    reorderStateRef.current = nextState;
    setReorderStateState(nextState);
  };

  const displayValue = useMemo(() => {
    if (reorderState == null) {
      return value;
    }
    if (reorderState.mode === 'pointer') {
      return reorderState.originalValue;
    }
    return moveItem(
      reorderState.originalValue,
      reorderState.fromIndex,
      reorderState.toIndex,
    );
  }, [reorderState, value]);
  const showReorderHandle = isReorderable;
  const showRemoveColumn = true;
  const fieldGridTemplate = useMemo(
    () => columns.map(column => resolveColumnTrack(column.width)).join(' '),
    [columns],
  );

  const pointerPlacement = useMemo(() => {
    if (
      reorderState?.mode !== 'pointer' ||
      !reorderState.hasPointerMoved ||
      reorderState.toIndex === reorderState.fromIndex
    ) {
      return null;
    }
    const remainingItems = reorderState.originalValue.filter(
      (_, index) => index !== reorderState.fromIndex,
    );
    const beforeItem = remainingItems[reorderState.toIndex];
    if (beforeItem != null) {
      return {
        position: 'before' as const,
        itemKey: String(getItemKey(beforeItem)),
      };
    }
    const afterItem = remainingItems.at(-1);
    return afterItem == null
      ? null
      : {
          position: 'after' as const,
          itemKey: String(getItemKey(afterItem)),
        };
  }, [getItemKey, reorderState]);
  const previewCloneKey =
    reorderState?.mode === 'pointer' ? String(reorderState.itemKey) : null;
  const isPointerReorderActive = previewCloneKey != null;

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
    if ((isDisabled || isLoading) && reorderStateRef.current) {
      setReorderState(null);
      announce(t('@astryx.listInput.announceReorderCancelled'));
    }
  }, [isDisabled, isLoading, announce, t]);

  // A second pointer that lands anywhere during a pointer reorder (the second
  // finger of a pinch) cancels the reorder. A pinch whose first finger slid
  // first zooms without a pointercancel, so the drag would otherwise commit on
  // release and drop the row at the end of the list.
  useEffect(() => {
    if (!isPointerReorderActive) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const activeState = reorderStateRef.current;
      if (
        activeState?.mode === 'pointer' &&
        activeState.pointerId !== event.pointerId
      ) {
        setReorderState(null);
        announce(t('@astryx.listInput.announceReorderCancelled'));
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isPointerReorderActive, announce, t]);

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

  useLayoutEffect(() => {
    const previewHost = dragPreviewRef.current;
    if (previewHost == null || previewCloneKey == null) {
      return;
    }
    const sourceRow = rowRefs.current.get(previewCloneKey);
    if (sourceRow == null) {
      return;
    }
    const clone = sourceRow.cloneNode(true) as HTMLElement;
    previewHost.style.direction = getComputedStyle(sourceRow).direction;
    clone.style.opacity = '1';
    clone.removeAttribute('data-list-input-reorder-source');
    clone.removeAttribute('data-list-input-drop-target');
    clone.removeAttribute('data-list-input-reorder');
    clone.removeAttribute('data-list-input-remove');
    clone.removeAttribute('data-list-input-row');
    clone.setAttribute('aria-hidden', 'true');
    const clonedElements = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
    for (const element of clonedElements) {
      element.removeAttribute('id');
      element.removeAttribute('aria-describedby');
      element.removeAttribute('aria-labelledby');
      element.removeAttribute('name');
      element.removeAttribute('data-list-input-reorder-source');
      element.removeAttribute('data-list-input-drop-target');
      element.removeAttribute('data-list-input-reorder');
      element.removeAttribute('data-list-input-remove');
      element.setAttribute('tabindex', '-1');
      element.style.viewTransitionName = 'none';
    }
    previewHost.replaceChildren(clone);
    showDragPreviewLayer();
    return () => {
      hideDragPreviewLayer();
      previewHost.replaceChildren();
      previewHost.style.removeProperty('direction');
    };
  }, [hideDragPreviewLayer, previewCloneKey, showDragPreviewLayer]);

  const mutationsDisabled = isDisabled || isLoading;
  const hasReachedMax = maxItems != null && value.length >= maxItems;

  const cancelMutationAnimations = () => {
    for (const animation of activeMutationAnimationsRef.current.values()) {
      animation.cancel();
    }
    activeMutationAnimationsRef.current.clear();
  };

  const settleReorderBeforeMutation = () => {
    if (reorderState == null && reorderStateRef.current == null) {
      return;
    }
    flushSync(() => setReorderState(null));
  };

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
    settleReorderBeforeMutation();
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
    settleReorderBeforeMutation();
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

  const startReorder = (
    item: T,
    index: number,
    mode: 'keyboard' | 'pointer',
    pointerId?: number,
    pointerGeometry?: Pick<
      ReorderState<T>,
      | 'pointerStartX'
      | 'pointerStartY'
      | 'pointerOffsetX'
      | 'pointerOffsetY'
      | 'pointerClientX'
      | 'pointerClientY'
      | 'previewWidth'
    >,
  ) => {
    if (mutationsDisabled || !isReorderable) {
      return;
    }
    cancelMutationAnimations();
    setReorderState({
      itemKey: getItemKey(item),
      fromIndex: index,
      toIndex: index,
      originalValue: value.slice(),
      mode,
      pointerId,
      ...pointerGeometry,
      hasPointerMoved: false,
    });
    announce(
      t('@astryx.listInput.announceGrabbed', {itemName, position: index + 1}),
    );
  };

  const previewReorder = (toIndex: number) => {
    const currentState = reorderStateRef.current;
    if (currentState == null) {
      return;
    }
    const boundedIndex = Math.max(
      0,
      Math.min(toIndex, currentState.originalValue.length - 1),
    );
    if (boundedIndex === currentState.toIndex) {
      return;
    }
    setReorderState({...currentState, toIndex: boundedIndex});
    announce(
      t('@astryx.listInput.announceMovedToPosition', {
        itemName,
        position: boundedIndex + 1,
        total: currentState.originalValue.length,
      }),
    );
  };

  const cancelReorder = () => {
    if (reorderStateRef.current == null) {
      return;
    }
    setReorderState(null);
    announce(t('@astryx.listInput.announceReorderCancelled'));
  };

  const commitReorder = () => {
    const currentState = reorderStateRef.current;
    if (currentState == null) {
      return;
    }
    if (currentState.mode === 'pointer' && !currentState.hasPointerMoved) {
      setReorderState(null);
      return;
    }

    const nextValue = moveItem(
      currentState.originalValue,
      currentState.fromIndex,
      currentState.toIndex,
    );
    const item = currentState.originalValue[currentState.fromIndex];
    const hasChanged = currentState.fromIndex !== currentState.toIndex;
    if (currentState.mode === 'pointer') {
      flushSync(() => setReorderState(null));
    } else {
      setReorderState(null);
    }
    if (!hasChanged) {
      announce(
        t('@astryx.listInput.announceReturnedToPosition', {
          itemName,
          position: currentState.fromIndex + 1,
        }),
      );
      return;
    }
    const commit = () =>
      onChange(nextValue, {
        type: 'reorder',
        item,
        fromIndex: currentState.fromIndex,
        toIndex: currentState.toIndex,
      });
    if (currentState.mode === 'pointer') {
      animateControlledUpdate(commit);
    } else {
      commit();
    }
    announce(
      t('@astryx.listInput.announceDropped', {
        itemName,
        position: currentState.toIndex + 1,
        total: currentState.originalValue.length,
      }),
    );
  };
  const moveWithArrowKey = (item: T, fromIndex: number, offset: -1 | 1) => {
    cancelMutationAnimations();
    const toIndex = Math.max(0, Math.min(fromIndex + offset, value.length - 1));
    if (toIndex === fromIndex) {
      announce(
        t('@astryx.listInput.announceAlreadyAtBoundary', {
          itemName,
          boundary: offset < 0 ? 'first' : 'last',
        }),
      );
      return;
    }
    const nextValue = moveItem(value, fromIndex, toIndex);
    animateControlledUpdate(() =>
      onChange(nextValue, {
        type: 'reorder',
        item,
        fromIndex,
        toIndex,
      }),
    );
    announce(
      t('@astryx.listInput.announceMovedToPosition', {
        itemName,
        position: toIndex + 1,
        total: value.length,
      }),
    );
  };

  const handleReorderKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: T,
    index: number,
  ) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const activeState = reorderStateRef.current;
    const isActivationKey = event.key === ' ' || event.key === 'Enter';
    if (activeState == null) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveWithArrowKey(item, index, -1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveWithArrowKey(item, index, 1);
        return;
      }
      if (isActivationKey) {
        event.preventDefault();
        startReorder(item, index, 'keyboard');
      }
      return;
    }
    if (String(activeState.itemKey) !== String(getItemKey(item))) {
      return;
    }
    if (isActivationKey) {
      event.preventDefault();
      commitReorder();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelReorder();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      previewReorder(activeState.toIndex - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      previewReorder(activeState.toIndex + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      previewReorder(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      previewReorder(activeState.originalValue.length - 1);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const activeState = reorderStateRef.current;
    if (
      activeState == null ||
      activeState.mode !== 'pointer' ||
      activeState.pointerId !== event.pointerId
    ) {
      return;
    }
    const horizontalDistance =
      event.clientX - (activeState.pointerStartX ?? event.clientX);
    const verticalDistance =
      event.clientY - (activeState.pointerStartY ?? event.clientY);
    const hasCrossedThreshold =
      activeState.hasPointerMoved ||
      Math.hypot(horizontalDistance, verticalDistance) >= 5;
    const remainingItems = activeState.originalValue.filter(
      (_, index) => index !== activeState.fromIndex,
    );
    let targetIndex = activeState.fromIndex;
    if (hasCrossedThreshold) {
      event.preventDefault();
      targetIndex = remainingItems.length;
      for (let index = 0; index < remainingItems.length; index++) {
        const row = rowRefs.current.get(
          String(getItemKey(remainingItems[index])),
        );
        if (row == null) {
          continue;
        }
        const bounds = row.getBoundingClientRect();
        if (event.clientY < bounds.top + bounds.height / 2) {
          targetIndex = index;
          break;
        }
      }
    }
    const nextState = {
      ...activeState,
      pointerClientX: event.clientX,
      pointerClientY: event.clientY,
      hasPointerMoved: hasCrossedThreshold,
      toIndex: targetIndex,
    };
    if (
      activeState.pointerClientX === nextState.pointerClientX &&
      activeState.pointerClientY === nextState.pointerClientY &&
      activeState.hasPointerMoved === nextState.hasPointerMoved &&
      activeState.toIndex === nextState.toIndex
    ) {
      return;
    }
    setReorderState(nextState);
    if (hasCrossedThreshold && activeState.toIndex !== targetIndex) {
      announce(
        t('@astryx.listInput.announceMovedToPosition', {
          itemName,
          position: targetIndex + 1,
          total: activeState.originalValue.length,
        }),
      );
    }
  };

  const rowLayoutStyle = showRemoveColumn
    ? styles.rowWithRemove
    : styles.rowFieldsOnly;
  const contentGridStyle = showRemoveColumn
    ? styles.contentBeforeOneControl
    : styles.contentOnly;
  const dragPreviewPosition =
    reorderState?.mode === 'pointer' &&
    reorderState.pointerClientX != null &&
    reorderState.pointerClientY != null &&
    reorderState.pointerOffsetX != null &&
    reorderState.pointerOffsetY != null &&
    reorderState.previewWidth != null
      ? {
          x: reorderState.pointerClientX - reorderState.pointerOffsetX,
          y: reorderState.pointerClientY - reorderState.pointerOffsetY,
          width: reorderState.previewWidth,
        }
      : null;

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
              reorderable: isReorderable ? 'true' : undefined,
            }),
            stylex.props(styles.group),
          )}>
          <ol
            role="list"
            aria-labelledby={labelID}
            aria-describedby={joinIDs(descriptionID, statusID)}
            {...stylex.props(styles.list)}>
            {displayValue.length === 0 ? (
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
              displayValue.map((item, index) => {
                const itemKey = getItemKey(item);
                const itemKeyString = String(itemKey);
                const isActiveReorder =
                  reorderState != null &&
                  String(reorderState.itemKey) === itemKeyString;
                const dropPosition =
                  pointerPlacement?.itemKey === itemKeyString
                    ? pointerPlacement.position
                    : null;
                const isPointerReorderSource =
                  isActiveReorder && reorderState?.mode === 'pointer';
                const itemStatus = getItemStatus?.(item, index);
                const itemStatusID = itemStatus?.message
                  ? `${groupID}-item-${index}-status`
                  : undefined;
                const reorderHandle = showReorderHandle ? (
                  <div {...stylex.props(styles.reorderHandleHanger)}>
                    <div
                      {...mergeProps(
                        getContentRevealProps({
                          isLayoutPreserved: true,
                          // The grip owns an active reorder, so it stays
                          // visible however the pointer moves.
                          forceVisibility: isActiveReorder
                            ? 'shown'
                            : undefined,
                        }),
                        // A flex row, so the grip stretches to the field's height.
                        stylex.props(styles.reorderGripReveal),
                      )}>
                      <button
                        type="button"
                        aria-label={t('@astryx.listInput.reorderItem', {
                          itemName,
                          position: index + 1,
                        })}
                        disabled={isDisabled || isLoading}
                        aria-describedby={reorderInstructionsID}
                        aria-pressed={isActiveReorder || undefined}
                        data-list-input-reorder=""
                        {...stylex.props(
                          focusOutlineStyles.focusVisible,
                          styles.reorderGrip,
                          reorderStyles.handle,
                          isActiveReorder && reorderStyles.handleActive,
                        )}
                        onKeyDown={event =>
                          handleReorderKeyDown(event, item, index)
                        }
                        onBlur={() => {
                          const activeState = reorderStateRef.current;
                          if (
                            activeState?.mode === 'keyboard' &&
                            String(activeState.itemKey) === itemKeyString
                          ) {
                            cancelReorder();
                          }
                        }}
                        onPointerDown={event => {
                          if (event.button !== 0 || isDisabled || isLoading) {
                            return;
                          }
                          const sourceRow = rowRefs.current.get(itemKeyString);
                          if (sourceRow == null) {
                            return;
                          }
                          const bounds = sourceRow.getBoundingClientRect();
                          event.currentTarget.setPointerCapture?.(
                            event.pointerId,
                          );
                          startReorder(
                            item,
                            index,
                            'pointer',
                            event.pointerId,
                            {
                              pointerStartX: event.clientX,
                              pointerStartY: event.clientY,
                              pointerOffsetX: event.clientX - bounds.left,
                              pointerOffsetY: event.clientY - bounds.top,
                              pointerClientX: event.clientX,
                              pointerClientY: event.clientY,
                              previewWidth: bounds.width,
                            },
                          );
                        }}
                        onPointerMove={handlePointerMove}
                        onPointerUp={event => {
                          const activeState = reorderStateRef.current;
                          if (
                            activeState?.mode === 'pointer' &&
                            activeState.pointerId === event.pointerId
                          ) {
                            commitReorder();
                            if (
                              event.currentTarget.hasPointerCapture?.(
                                event.pointerId,
                              )
                            ) {
                              event.currentTarget.releasePointerCapture?.(
                                event.pointerId,
                              );
                            }
                          }
                        }}
                        onPointerCancel={event => {
                          const activeState = reorderStateRef.current;
                          if (
                            activeState?.mode === 'pointer' &&
                            activeState.pointerId === event.pointerId
                          ) {
                            cancelReorder();
                            if (
                              event.currentTarget.hasPointerCapture?.(
                                event.pointerId,
                              )
                            ) {
                              event.currentTarget.releasePointerCapture?.(
                                event.pointerId,
                              );
                            }
                          }
                        }}
                        onLostPointerCapture={event => {
                          const activeState = reorderStateRef.current;
                          if (
                            activeState?.mode === 'pointer' &&
                            activeState.pointerId === event.pointerId
                          ) {
                            cancelReorder();
                          }
                        }}>
                        <GripVerticalIcon
                          {...stylex.props(styles.reorderGripGlyph)}
                        />
                      </button>
                    </div>
                  </div>
                ) : null;
                return (
                  <li
                    key={itemKey}
                    data-list-input-motion-key={`item:${itemKeyString}`}
                    data-list-input-drop-target={dropPosition ?? undefined}
                    aria-describedby={itemStatusID}
                    aria-invalid={itemStatus?.type === 'error' || undefined}
                    aria-posinset={index + 1}
                    aria-setsize={displayValue.length}
                    {...stylex.props(
                      styles.item,
                      dropPosition === 'before' && reorderStyles.dropBefore,
                      dropPosition === 'after' && reorderStyles.dropAfter,
                    )}>
                    <div
                      data-list-input-reorder-source={
                        isActiveReorder || undefined
                      }
                      ref={node => {
                        if (node == null) {
                          rowRefs.current.delete(itemKeyString);
                        } else {
                          rowRefs.current.set(itemKeyString, node);
                        }
                      }}
                      data-list-input-row={itemKeyString}
                      {...mergeProps(
                        getContainerProps({
                          // A pointer drag owns the list: rows the pointer
                          // crosses stay quiet instead of lighting their grips.
                          forceState:
                            isPointerReorderActive && !isActiveReorder
                              ? 'inactive'
                              : undefined,
                        }),
                        stylex.props(
                          styles.row,
                          rowLayoutStyle,
                          dynamicStyles.rowTransition(
                            transitionName(groupID, itemKey),
                          ),
                          isPointerReorderSource && reorderStyles.source,
                        ),
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
                                total: displayValue.length,
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
                                  isRepeatedLabel && styles.repeatedColumnLabel,
                                )}>
                                {column.header}
                              </span>
                              <div
                                {...stylex.props(
                                  styles.cellContent,
                                  columnIndex === 0 &&
                                    showReorderHandle &&
                                    styles.handleAnchor,
                                )}>
                                {columnIndex === 0 ? reorderHandle : null}
                                {content}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {showRemoveColumn ? (
                        <div
                          {...mergeProps(
                            // Opacity only: Remove keeps its column, so the
                            // fields never shift when it appears.
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
          {showReorderHandle ? (
            <VisuallyHidden as="div" id={reorderInstructionsID}>
              {t('@astryx.listInput.reorderInstructions')}
            </VisuallyHidden>
          ) : null}
        </div>
      </Field>
      {dragPreviewPosition != null
        ? renderDragPreviewLayer(
            <div
              ref={dragPreviewRef}
              aria-hidden="true"
              data-list-input-drag-preview=""
              {...stylex.props(styles.dragPreviewContainer)}
            />,
            {
              x: 0,
              y: 0,
              xstyle: [
                reorderStyles.preview,
                dynamicStyles.dragPreview(
                  dragPreviewPosition.x,
                  dragPreviewPosition.y,
                  dragPreviewPosition.width,
                ),
              ],
            },
          )
        : null}
    </SizeProvider>
  );
}

ListInput.displayName = 'ListInput';
