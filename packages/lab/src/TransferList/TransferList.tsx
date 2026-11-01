// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TransferList.tsx
 * @input Controlled option data, React DOM portals, local action glyphs, shared Lab reorder styles, and the core i18n catalog
 * @output Exports TransferList with immediate transfers, vertical reordering, and responsive scroll ownership
 * @position Lab collection input; consumed by index.ts, TransferListSelector, docs, and tests
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/TransferList/TransferList.doc.mjs
 * - /packages/lab/src/TransferList/TransferList.test.tsx
 * - /packages/lab/src/TransferList/index.ts
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SVGProps,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {flushSync} from 'react-dom';
import type {BaseProps} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Item} from '@astryxdesign/core/Item';
import {useLayer} from '@astryxdesign/core/Layer';
import {List} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  borderVars,
  colorVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  focusOutlineStyles,
  mergeProps,
  mergeRefs,
  themeProps,
} from '@astryxdesign/core/utils';
import {reorderStyles} from '../reorderStyles';
import {transferListVars} from './tokens.stylex';

// Lucide glyphs the shared icon registry does not carry (there is no `add` or
// `grip` semantic name). Typed as icon components and rendered through `Icon`
// so sizing, colour and a11y come from the icon pipeline rather than a raw
// inline `<svg>`. Removal reuses the registry `close` glyph instead.
function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function GripVerticalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );
}

export interface TransferListOption<T extends string = string> {
  /** Stable value written to the controlled value array. */
  value: T;
  /** Visible option name and the basis of action labels. */
  label: string;
  /** Optional searchable metadata. Not rendered in the default row. */
  description?: ReactNode;
  /** Optional group heading on the available side. */
  group?: string;
  /** Prevents moving the option between the selected and available lists. */
  isTransferDisabled?: boolean;
  /** Prevents reordering the selected option and keeps its position fixed. */
  isReorderDisabled?: boolean;
  /** Explains why a transfer or reorder action is unavailable. */
  disabledMessage?: string;
}

export interface TransferListProps<T extends string = string> extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the root group. */
  ref?: React.Ref<HTMLDivElement>;
  /** Accessible name for the complete control. */
  label: string;
  /** Visually hides the label while retaining its accessible name. */
  isLabelHidden?: boolean;
  /** Supporting guidance shown below the label. */
  description?: string;
  /** Complete option catalog. Option values must be unique. */
  options: readonly TransferListOption<T>[];
  /** Ordered selected values. This array is the single source of truth. */
  value: readonly T[];
  /** Called with the next ordered selection after a committed change. */
  onChange: (value: readonly T[]) => void;
  /** Heading for the selected panel. @default 'Selected' */
  selectedLabel?: string;
  /** Heading for the available panel. @default 'Available' */
  availableLabel?: string;
  /** Shows one search field that filters both panels. @default false */
  hasSearch?: boolean;
  /** Accessible label for search. Defaults to `Search ${label}`. */
  searchLabel?: string;
  /** Search input placeholder. @default 'Search…' */
  searchPlaceholder?: string;
  /** Enables pointer and keyboard ordering on selected options. @default true */
  isReorderable?: boolean;
  /** Shows an Add all action. @default false */
  hasSelectAll?: boolean;
  /** Shows a Clear action. Transfer-disabled selected options are retained. */
  hasClear?: boolean;
  /** Customizes primary row content without changing built-in behavior. */
  renderOption?: (option: TransferListOption<T>) => ReactNode;
  /** Empty copy for the selected panel. */
  selectedEmptyText?: string;
  /** Empty copy for the available panel. */
  availableEmptyText?: string;
  /** Empty copy while a search query is active. */
  noResultsText?: string;
}

interface ReorderSession<T extends string> {
  value: T;
  label: string;
  mode: 'keyboard' | 'pointer';
  originalValue: readonly T[];
  fromIndex: number;
  toIndex: number;
  pointerId?: number;
  pointerStartY?: number;
  pointerOffsetY?: number;
  pointerClientY?: number;
  previewX?: number;
  previewWidth?: number;
  hasPointerMoved?: boolean;
}

type PointerGeometry = Required<
  Pick<
    ReorderSession<string>,
    | 'pointerId'
    | 'pointerStartY'
    | 'pointerOffsetY'
    | 'pointerClientY'
    | 'previewX'
    | 'previewWidth'
  >
>;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    minWidth: 0,
    containerType: 'inline-size',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
  },
  controls: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: spacingVars['--spacing-2'],
    minWidth: 0,
    padding: spacingVars['--spacing-3'],
  },
  search: {flex: 1, minWidth: 0},
  panels: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) minmax(0, 1fr)',
      '@container (max-width: 40rem)': 'minmax(0, 1fr)',
    },
    gap: 0,
    minWidth: 0,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    // Inset, not the shared offset: the panel's own edge is the container
    // boundary, so an outset ring would fall outside the component.
    outlineOffset: {default: '0', ':focus-visible': -2},
  },
  panelDivider: {
    borderInlineStartWidth: {
      default: borderVars['--border-width'],
      '@container (max-width: 40rem)': 0,
    },
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    borderBlockStartWidth: {
      default: 0,
      '@container (max-width: 40rem)': borderVars['--border-width'],
    },
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    backgroundColor: {
      default: 'transparent',
      '@container (max-width: 40rem)': colorVars['--color-background-body'],
    },
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    borderBlockEndWidth: borderVars['--border-width'],
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: colorVars['--color-border'],
  },
  headerAction: {
    // A text-link treatment, but the hit target still has to clear the WCAG
    // 2.5.8 24px floor. The link keeps `height: auto` so its baseline aligns
    // with the panel heading; `minBlockSize` gives the button a >=24px target
    // (the sm element height) without changing where the text sits, and the
    // width already exceeds 24px.
    height: 'auto',
    minBlockSize: sizeVars['--size-element-sm'],
    paddingBlock: 0,
    paddingInline: 0,
    borderRadius: 0,
    color: colorVars['--color-text-accent'],
    backgroundImage: {
      default: 'none',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': 'none',
      ':active': 'none',
    },
    textDecoration: {
      default: 'none',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': 'underline',
    },
    fontSize: typeScaleVars['--text-body-size'],
    fontWeight: typeScaleVars['--text-body-weight'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  panelBody: {
    minBlockSize: {
      default: transferListVars['--transfer-list-panel-min-block-size'],
      '@container (max-width: 40rem)': 0,
    },
    maxBlockSize: {
      default: transferListVars['--transfer-list-panel-max-block-size'],
      '@container (max-width: 40rem)': 'none',
    },
    overflowY: {
      default: 'auto',
      '@container (max-width: 40rem)': 'visible',
    },
    overscrollBehavior: {
      default: 'contain',
      '@container (max-width: 40rem)': 'auto',
    },
    scrollbarGutter: {
      default: 'stable',
      '@container (max-width: 40rem)': 'auto',
    },
    padding: 0,
  },
  groupHeading: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    marginBlockStart: {
      default: spacingVars['--spacing-1'],
      ':first-child': 0,
    },
  },
  item: {
    minWidth: 0,
    paddingInline: spacingVars['--spacing-3'],
  },
  reorderHandle: {
    marginInlineStart: `calc(-1 * ${spacingVars['--spacing-1-5']})`,
  },
  draggingItem: {backgroundColor: colorVars['--color-accent-muted']},
  dragPreviewContainer: {listStyleType: 'none'},
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minBlockSize: {
      default: transferListVars['--transfer-list-panel-min-block-size'],
      '@container (max-width: 40rem)': 0,
    },
    padding: spacingVars['--spacing-4'],
    textAlign: 'center',
  },
});

const dynamicStyles = stylex.create({
  // Only the width is dynamic here. The layer owns the placement: it reads the
  // same viewport coordinates as `position: fixed` insets, which is what
  // getBoundingClientRect gives us.
  dragPreview: (width: number) => ({width}),
});

function moveItem<T>(
  value: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const nextValue = [...value];
  const [item] = nextValue.splice(fromIndex, 1);
  nextValue.splice(toIndex, 0, item);
  return nextValue;
}

// Case folding is locale-independent here, matching Selector, MultiSelector,
// and CommandPalette. Locale-sensitive folding would mean raw Intl access,
// which the shipped packages route through the provider instead.
function matchesQuery<T extends string>(
  option: TransferListOption<T>,
  query: string,
): boolean {
  if (query === '') {
    return true;
  }
  const description =
    typeof option.description === 'string' ? option.description : '';
  return [option.label, description, option.group ?? ''].some(part =>
    part.toLowerCase().includes(query),
  );
}

/**
 * A controlled dual-panel collection input for choosing and ordering values.
 * Selection, ordering, drafts, persistence, and saved views stay explicit in
 * the consumer; this component owns only search and active gesture state.
 *
 * @example
 * ```
 * const [columns, setColumns] = useState(['name', 'status']);
 * <TransferList
 *   label="Table columns"
 *   options={columnOptions}
 *   value={columns}
 *   onChange={setColumns}
 * />
 * ```
 */
export function TransferList<T extends string = string>({
  label,
  isLabelHidden = false,
  description,
  options,
  value,
  onChange,
  selectedLabel: selectedLabelFromProps,
  availableLabel: availableLabelFromProps,
  hasSearch = false,
  searchLabel,
  searchPlaceholder: searchPlaceholderFromProps,
  isReorderable = true,
  hasSelectAll = false,
  hasClear = false,
  renderOption,
  selectedEmptyText: selectedEmptyTextFromProps,
  availableEmptyText: availableEmptyTextFromProps,
  noResultsText: noResultsTextFromProps,
  xstyle,
  className,
  style,
  ref,
  role,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ...restProps
}: TransferListProps<T>): ReactNode {
  const t = useTranslator();
  const selectedLabel =
    selectedLabelFromProps ?? t('@astryx.transferList.selectedLabel');
  const availableLabel =
    availableLabelFromProps ?? t('@astryx.transferList.availableLabel');
  const searchPlaceholder =
    searchPlaceholderFromProps ?? t('@astryx.transferList.searchPlaceholder');
  const selectedEmptyText =
    selectedEmptyTextFromProps ?? t('@astryx.transferList.selectedEmpty');
  const availableEmptyText =
    availableEmptyTextFromProps ?? t('@astryx.transferList.availableEmpty');
  const noResultsText =
    noResultsTextFromProps ?? t('@astryx.transferList.noResults');
  const labelId = useId();
  const descriptionId = useId();
  const selectedHeadingId = useId();
  const availableHeadingId = useId();
  const reorderInstructionsId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);
  const availablePanelRef = useRef<HTMLDivElement | null>(null);
  const selectedRowRefs = useRef(new Map<T, HTMLElement>());
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);
  // The ghost that follows the pointer is a layer, not a portal into body.
  // Its coordinates come from getBoundingClientRect, so they are viewport
  // relative; the top layer is the only host that reads them that way from
  // any scroll position and still paints above a Popover or open dialog.
  const dragPreviewLayer = useLayer({mode: 'fixed'});
  const currentValueRef = useRef<readonly T[]>(value);
  const reorderSessionRef = useRef<ReorderSession<T> | null>(null);
  const suppressClickRef = useRef(false);
  const [query, setQuery] = useState('');
  const [reorderSession, setReorderSessionState] =
    useState<ReorderSession<T> | null>(null);
  const announce = useAnnounce();

  currentValueRef.current = value;

  const setReorderSession = useCallback(
    (nextSession: ReorderSession<T> | null) => {
      reorderSessionRef.current = nextSession;
      setReorderSessionState(nextSession);
    },
    [],
  );

  const optionByValue = useMemo(() => {
    const map = new Map<T, TransferListOption<T>>();
    options.forEach(option => map.set(option.value, option));
    return map;
  }, [options]);
  const selectedValues = useMemo(() => new Set(value), [value]);
  const normalizedQuery = query.trim().toLowerCase();
  const selectedOptions = useMemo(
    () =>
      value
        .map(optionValue => optionByValue.get(optionValue))
        .filter(
          (option): option is TransferListOption<T> =>
            option != null && matchesQuery(option, normalizedQuery),
        ),
    [normalizedQuery, optionByValue, value],
  );
  const availableOptions = useMemo(
    () =>
      options.filter(
        option =>
          !selectedValues.has(option.value) &&
          matchesQuery(option, normalizedQuery),
      ),
    [normalizedQuery, options, selectedValues],
  );
  const groupedAvailable = useMemo(() => {
    const groups = new Map<string, TransferListOption<T>[]>();
    availableOptions.forEach(option => {
      const group = option.group ?? '';
      const items = groups.get(group);
      if (items) {
        items.push(option);
      } else {
        groups.set(group, [option]);
      }
    });
    return Array.from(groups.entries());
  }, [availableOptions]);

  const pointerPlacement = useMemo(() => {
    if (
      reorderSession?.mode !== 'pointer' ||
      !reorderSession.hasPointerMoved ||
      reorderSession.toIndex === reorderSession.fromIndex
    ) {
      return null;
    }
    const remainingValues = reorderSession.originalValue.filter(
      optionValue => optionValue !== reorderSession.value,
    );
    const beforeValue = remainingValues[reorderSession.toIndex];
    if (beforeValue != null) {
      return {value: beforeValue, position: 'before' as const};
    }
    const afterValue = remainingValues.at(-1);
    return afterValue == null
      ? null
      : {value: afterValue, position: 'after' as const};
  }, [reorderSession]);

  const previewCloneValue =
    reorderSession?.mode === 'pointer' ? reorderSession.value : null;

  useLayoutEffect(() => {
    const previewHost = dragPreviewRef.current;
    if (previewHost == null || previewCloneValue == null) {
      return;
    }
    const sourceRow = selectedRowRefs.current.get(previewCloneValue);
    if (sourceRow == null) {
      return;
    }
    const clone = sourceRow.cloneNode(true) as HTMLElement;
    previewHost.style.direction = getComputedStyle(sourceRow).direction;
    clone.style.opacity = '1';
    clone.setAttribute('aria-hidden', 'true');
    const clonedElements = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
    for (const element of clonedElements) {
      element.removeAttribute('id');
      element.removeAttribute('aria-describedby');
      element.removeAttribute('aria-labelledby');
      element.removeAttribute('name');
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.startsWith('data-transfer-list-')) {
          element.removeAttribute(attribute.name);
        }
      }
      element.setAttribute('tabindex', '-1');
    }
    previewHost.replaceChildren(clone);
    return () => {
      previewHost.replaceChildren();
      previewHost.style.removeProperty('direction');
    };
  }, [previewCloneValue]);

  const commit = useCallback(
    (nextValue: readonly T[]) => {
      currentValueRef.current = nextValue;
      onChange(nextValue);
    },
    [onChange],
  );

  const focusAfterTransfer = useCallback(
    (side: 'selected' | 'available', index: number) => {
      const moveFocus = () => {
        const panel =
          side === 'selected'
            ? selectedPanelRef.current
            : availablePanelRef.current;
        const actions = panel?.querySelectorAll<HTMLButtonElement>(
          `[data-transfer-list-action="${side}"]:not([disabled]):not([aria-disabled="true"])`,
        );
        if (actions && actions.length > 0) {
          actions[Math.min(index, actions.length - 1)]?.focus();
        } else if (hasSearch) {
          searchRef.current?.focus();
        } else {
          panel?.focus();
        }
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(moveFocus);
      } else {
        setTimeout(moveFocus, 0);
      }
    },
    [hasSearch],
  );

  const addOption = useCallback(
    (option: TransferListOption<T>, index: number) => {
      if (
        option.isTransferDisabled ||
        currentValueRef.current.includes(option.value)
      ) {
        return;
      }
      const nextValue = [...currentValueRef.current, option.value];
      commit(nextValue);
      announce(
        t('@astryx.transferList.announceAdded', {
          label: option.label,
          count: nextValue.length,
        }),
      );
      focusAfterTransfer('available', index);
    },
    [announce, commit, focusAfterTransfer, t],
  );

  const removeOption = useCallback(
    (option: TransferListOption<T>, index: number) => {
      if (option.isTransferDisabled) {
        return;
      }
      const nextValue = currentValueRef.current.filter(
        item => item !== option.value,
      );
      commit(nextValue);
      announce(
        t('@astryx.transferList.announceRemoved', {
          label: option.label,
          count: nextValue.length,
        }),
      );
      focusAfterTransfer('selected', index);
    },
    [announce, commit, focusAfterTransfer, t],
  );

  const addAll = useCallback(() => {
    const additions = options
      .filter(
        option =>
          !option.isTransferDisabled &&
          !currentValueRef.current.includes(option.value),
      )
      .map(option => option.value);
    if (additions.length > 0) {
      commit([...currentValueRef.current, ...additions]);
      announce(
        t('@astryx.transferList.announceBulkAdded', {
          count: additions.length,
        }),
      );
    }
  }, [announce, commit, options, t]);

  const clearSelected = useCallback(() => {
    const nextValue = currentValueRef.current.filter(optionValue => {
      const option = optionByValue.get(optionValue);
      return option == null || option.isTransferDisabled;
    });
    const removed = currentValueRef.current.length - nextValue.length;
    if (removed > 0) {
      commit(nextValue);
      announce(t('@astryx.transferList.announceBulkRemoved', {count: removed}));
    }
  }, [announce, commit, optionByValue, t]);

  const movableRange = useCallback(
    (optionValue: T, orderedValue: readonly T[]) => {
      const index = orderedValue.indexOf(optionValue);
      let start = 0;
      let end = orderedValue.length - 1;
      for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const option = optionByValue.get(orderedValue[cursor] as T);
        if (option == null || option.isReorderDisabled) {
          start = cursor + 1;
          break;
        }
      }
      for (let cursor = index + 1; cursor < orderedValue.length; cursor += 1) {
        const option = optionByValue.get(orderedValue[cursor] as T);
        if (option == null || option.isReorderDisabled) {
          end = cursor - 1;
          break;
        }
      }
      return {index, start, end};
    },
    [optionByValue],
  );

  const moveOption = useCallback(
    (optionValue: T, requestedIndex: number) => {
      const nextValue = [...currentValueRef.current];
      const {index, start, end} = movableRange(optionValue, nextValue);
      if (index < 0) {
        return false;
      }
      const target = Math.max(start, Math.min(end, requestedIndex));
      if (target === index) {
        return false;
      }
      nextValue.splice(index, 1);
      nextValue.splice(target, 0, optionValue);
      commit(nextValue);
      return true;
    },
    [commit, movableRange],
  );

  const beginReorder = useCallback(
    (
      option: TransferListOption<T>,
      mode: 'keyboard' | 'pointer',
      pointerGeometry?: PointerGeometry,
    ) => {
      if (option.isReorderDisabled || !isReorderable) {
        return;
      }
      const index = currentValueRef.current.indexOf(option.value);
      if (index < 0 || (mode === 'pointer' && pointerGeometry == null)) {
        return;
      }
      setReorderSession({
        value: option.value,
        label: option.label,
        mode,
        originalValue: [...currentValueRef.current],
        fromIndex: index,
        toIndex: index,
        ...pointerGeometry,
        hasPointerMoved: false,
      });
      if (mode === 'keyboard') {
        announce(
          t('@astryx.transferList.announceGrabbed', {
            label: option.label,
            position: index + 1,
            total: currentValueRef.current.length,
          }),
        );
      }
    },
    [announce, isReorderable, setReorderSession, t],
  );

  const finishReorder = useCallback(
    (cancelled: boolean) => {
      const session = reorderSessionRef.current;
      if (!session) {
        return;
      }
      if (session.mode === 'pointer') {
        if (cancelled || !session.hasPointerMoved) {
          setReorderSession(null);
          if (cancelled) {
            announce(
              t('@astryx.transferList.announceMoveCancelled', {
                label: session.label,
              }),
            );
          }
          return;
        }
        const hasChanged = session.fromIndex !== session.toIndex;
        const nextValue = moveItem(
          session.originalValue,
          session.fromIndex,
          session.toIndex,
        );
        flushSync(() => setReorderSession(null));
        if (hasChanged) {
          commit(nextValue);
          announce(
            t('@astryx.transferList.announceDropped', {
              label: session.label,
              position: session.toIndex + 1,
              total: session.originalValue.length,
            }),
          );
        } else {
          announce(
            t('@astryx.transferList.announceReturned', {
              label: session.label,
              position: session.fromIndex + 1,
            }),
          );
        }
        return;
      }
      if (cancelled) {
        commit(session.originalValue);
        announce(
          t('@astryx.transferList.announceMoveCancelled', {
            label: session.label,
          }),
        );
      } else {
        const index = currentValueRef.current.indexOf(session.value);
        announce(
          t('@astryx.transferList.announceDropped', {
            label: session.label,
            position: index + 1,
            total: currentValueRef.current.length,
          }),
        );
      }
      setReorderSession(null);
    },
    [announce, commit, setReorderSession, t],
  );

  const handleReorderClick = useCallback(
    (option: TransferListOption<T>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (reorderSessionRef.current?.value === option.value) {
        finishReorder(false);
      } else {
        beginReorder(option, 'keyboard');
      }
    },
    [beginReorder, finishReorder],
  );

  const handleReorderKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      option: TransferListOption<T>,
    ) => {
      const session = reorderSessionRef.current;
      if (session?.value !== option.value || session.mode !== 'keyboard') {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finishReorder(true);
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        finishReorder(false);
        return;
      }
      const {index, start, end} = movableRange(
        option.value,
        currentValueRef.current,
      );
      const targets: Record<string, number> = {
        ArrowUp: index - 1,
        ArrowDown: index + 1,
        Home: start,
        End: end,
      };
      const target = targets[event.key];
      if (target == null) {
        return;
      }
      event.preventDefault();
      if (moveOption(option.value, target)) {
        const nextIndex = currentValueRef.current.indexOf(option.value);
        announce(
          t('@astryx.transferList.announceMovedToPosition', {
            label: option.label,
            position: nextIndex + 1,
            total: currentValueRef.current.length,
          }),
        );
      }
    },
    [announce, finishReorder, movableRange, moveOption, t],
  );

  const handlePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      option: TransferListOption<T>,
    ) => {
      if (event.button !== 0 || option.isReorderDisabled) {
        return;
      }
      const sourceRow = selectedRowRefs.current.get(option.value);
      if (sourceRow == null) {
        return;
      }
      const bounds = sourceRow.getBoundingClientRect();
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      beginReorder(option, 'pointer', {
        pointerId: event.pointerId,
        pointerStartY: event.clientY,
        pointerOffsetY: event.clientY - bounds.top,
        pointerClientY: event.clientY,
        previewX: bounds.left,
        previewWidth: bounds.width,
      });
    },
    [beginReorder],
  );

  const handlePointerMove = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      option: TransferListOption<T>,
    ) => {
      const session = reorderSessionRef.current;
      if (
        session?.value !== option.value ||
        session.mode !== 'pointer' ||
        session.pointerId !== event.pointerId
      ) {
        return;
      }
      const verticalDistance =
        event.clientY - (session.pointerStartY ?? event.clientY);
      const hasCrossedThreshold =
        session.hasPointerMoved || Math.abs(verticalDistance) >= 5;
      let targetIndex = session.fromIndex;
      if (hasCrossedThreshold) {
        event.preventDefault();
        const {start, end} = movableRange(session.value, session.originalValue);
        const remainingValues = session.originalValue.filter(
          optionValue => optionValue !== session.value,
        );
        const candidates = session.originalValue
          .map((optionValue, originalIndex) => ({optionValue, originalIndex}))
          .filter(
            candidate =>
              candidate.optionValue !== session.value &&
              candidate.originalIndex >= start &&
              candidate.originalIndex <= end,
          )
          .map(candidate => ({
            row: selectedRowRefs.current.get(candidate.optionValue),
            targetIndex: remainingValues.indexOf(candidate.optionValue),
          }))
          .filter(
            (candidate): candidate is {row: HTMLElement; targetIndex: number} =>
              candidate.row != null,
          );
        if (candidates.length > 0) {
          targetIndex = candidates[candidates.length - 1].targetIndex + 1;
          for (const candidate of candidates) {
            const bounds = candidate.row.getBoundingClientRect();
            if (event.clientY < bounds.top + bounds.height / 2) {
              targetIndex = candidate.targetIndex;
              break;
            }
          }
          targetIndex = Math.max(start, Math.min(end, targetIndex));
        }
      }
      const nextSession = {
        ...session,
        pointerClientY: event.clientY,
        hasPointerMoved: hasCrossedThreshold,
        toIndex: targetIndex,
      };
      setReorderSession(nextSession);
      if (hasCrossedThreshold && session.toIndex !== targetIndex) {
        announce(
          t('@astryx.transferList.announceMovedToPosition', {
            label: option.label,
            position: targetIndex + 1,
            total: session.originalValue.length,
          }),
        );
      }
    },
    [announce, movableRange, setReorderSession, t],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
      const session = reorderSessionRef.current;
      if (
        session?.mode !== 'pointer' ||
        session.pointerId !== event.pointerId
      ) {
        return;
      }
      if (cancelled) {
        suppressClickRef.current = false;
      } else {
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      finishReorder(cancelled);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [finishReorder],
  );

  // A second pointer that lands anywhere during a pointer reorder (the second
  // finger of a pinch) cancels the reorder. A pinch whose first finger slid
  // first zooms without a pointercancel, so the drag would otherwise commit on
  // release and drop the row at the end of the list.
  const isPointerReorderActive = previewCloneValue != null;
  useEffect(() => {
    if (!isPointerReorderActive) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const session = reorderSessionRef.current;
      if (
        session?.mode === 'pointer' &&
        session.pointerId !== event.pointerId
      ) {
        suppressClickRef.current = false;
        finishReorder(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isPointerReorderActive, finishReorder]);

  const handleSearch = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      const normalized = nextQuery.trim().toLowerCase();
      if (normalized === '') {
        announce('');
      } else {
        const count = options.filter(option =>
          matchesQuery(option, normalized),
        ).length;
        announce(t('@astryx.transferList.announceSearchResults', {count}));
      }
    },
    [announce, options, t],
  );

  const optionActions = (
    option: TransferListOption<T>,
    side: 'selected' | 'available',
    index: number,
  ) => {
    const isTransferDisabled = option.isTransferDisabled === true;
    const disabledReason =
      option.disabledMessage ??
      t('@astryx.transferList.transferDisabled', {label: option.label});
    if (side === 'available') {
      return (
        <IconButton
          label={t('@astryx.transferList.addOption', {label: option.label})}
          icon={<Icon icon={PlusIcon} size="sm" />}
          size="sm"
          variant="ghost"
          isDisabled={isTransferDisabled}
          tooltip={isTransferDisabled ? disabledReason : undefined}
          data-transfer-list-action="available"
          onClick={() => addOption(option, index)}
        />
      );
    }
    return (
      <IconButton
        label={t('@astryx.transferList.removeOption', {label: option.label})}
        icon={<Icon icon="close" size="sm" />}
        size="sm"
        variant="ghost"
        isDisabled={isTransferDisabled}
        tooltip={isTransferDisabled ? disabledReason : undefined}
        data-transfer-list-action="selected"
        onClick={() => removeOption(option, index)}
      />
    );
  };

  const dragPreviewPosition =
    reorderSession?.mode === 'pointer' &&
    reorderSession.pointerClientY != null &&
    reorderSession.pointerOffsetY != null &&
    reorderSession.previewX != null &&
    reorderSession.previewWidth != null
      ? {
          x: reorderSession.previewX,
          y: reorderSession.pointerClientY - reorderSession.pointerOffsetY,
          width: reorderSession.previewWidth,
        }
      : null;
  const isDraggingPreview = dragPreviewPosition != null;
  const {show: showDragPreview, hide: hideDragPreview} = dragPreviewLayer;
  useEffect(() => {
    if (!isDraggingPreview) {
      return undefined;
    }
    showDragPreview();
    return hideDragPreview;
  }, [isDraggingPreview, showDragPreview, hideDragPreview]);

  const reorderControl = (option: TransferListOption<T>) => {
    if (!isReorderable) {
      return undefined;
    }
    const active = reorderSession?.value === option.value;
    const isReorderDisabled = option.isReorderDisabled === true;
    const disabledReason =
      option.disabledMessage ??
      t('@astryx.transferList.reorderDisabled', {label: option.label});
    return (
      <IconButton
        label={t('@astryx.transferList.reorderOption', {label: option.label})}
        aria-describedby={reorderInstructionsId}
        aria-pressed={active}
        icon={<Icon icon={GripVerticalIcon} size="sm" />}
        size="sm"
        variant="ghost"
        isDisabled={isReorderDisabled}
        tooltip={isReorderDisabled ? disabledReason : undefined}
        xstyle={[
          styles.reorderHandle,
          reorderStyles.handle,
          active && reorderStyles.handleActive,
        ]}
        onClick={() => handleReorderClick(option)}
        onKeyDown={event => handleReorderKeyDown(event, option)}
        onPointerDown={event => handlePointerDown(event, option)}
        onPointerMove={event => handlePointerMove(event, option)}
        onPointerUp={event => handlePointerEnd(event, false)}
        onPointerCancel={event => handlePointerEnd(event, true)}
        onLostPointerCapture={event => {
          const session = reorderSessionRef.current;
          if (
            session?.mode === 'pointer' &&
            session.pointerId === event.pointerId
          ) {
            suppressClickRef.current = false;
            finishReorder(true);
          }
        }}
      />
    );
  };

  const transferItem = (
    option: TransferListOption<T>,
    side: 'selected' | 'available',
    index: number,
  ) => {
    const active = reorderSession?.value === option.value;
    const isPointerSource = active && reorderSession?.mode === 'pointer';
    const dropPosition =
      pointerPlacement?.value === option.value
        ? pointerPlacement.position
        : null;
    const orderedIndex = currentValueRef.current.indexOf(option.value);
    return (
      <Item
        key={option.value}
        as="li"
        ref={node => {
          if (side !== 'selected') {
            return;
          }
          if (node == null) {
            selectedRowRefs.current.delete(option.value);
          } else {
            selectedRowRefs.current.set(option.value, node);
          }
        }}
        density="compact"
        startContent={side === 'selected' ? reorderControl(option) : undefined}
        label={renderOption?.(option) ?? option.label}
        endContent={optionActions(option, side, index)}
        xstyle={[
          styles.item,
          active && reorderSession?.mode === 'keyboard' && styles.draggingItem,
          isPointerSource && reorderStyles.source,
          dropPosition === 'before' && reorderStyles.dropBefore,
          dropPosition === 'after' && reorderStyles.dropAfter,
        ]}
        data-transfer-list-row={side === 'selected' ? option.value : undefined}
        data-transfer-list-reorder-source={isPointerSource || undefined}
        data-transfer-list-drop-target={dropPosition ?? undefined}
        data-transfer-list-index={
          side === 'selected' ? String(orderedIndex) : undefined
        }
        {...themeProps('transfer-list-item', {
          side,
          state:
            option.isTransferDisabled || option.isReorderDisabled
              ? 'disabled'
              : active
                ? 'reordering'
                : 'enabled',
        })}
      />
    );
  };

  const describedBy =
    [ariaDescribedBy, description != null ? descriptionId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div
      ref={mergeRefs(ref, rootRef)}
      {...restProps}
      {...mergeProps(
        themeProps('transfer-list'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      role={role ?? 'group'}
      aria-labelledby={ariaLabelledBy ?? labelId}
      aria-describedby={describedBy}>
      <div {...stylex.props(styles.heading)}>
        {isLabelHidden ? (
          <VisuallyHidden id={labelId}>{label}</VisuallyHidden>
        ) : (
          <Text id={labelId} type="label" display="block">
            {label}
          </Text>
        )}
        {description != null && (
          <Text id={descriptionId} type="supporting" display="block">
            {description}
          </Text>
        )}
      </div>

      {hasSearch && (
        <div {...stylex.props(styles.controls)}>
          <TextInput
            ref={searchRef}
            role="searchbox"
            label={
              searchLabel ?? t('@astryx.transferList.searchLabel', {label})
            }
            isLabelHidden
            value={query}
            placeholder={searchPlaceholder}
            startIcon={<Icon icon="search" size="sm" color="secondary" />}
            hasClear
            width="100%"
            controlXstyle={styles.search}
            onChange={handleSearch}
          />
        </div>
      )}

      <VisuallyHidden id={reorderInstructionsId}>
        {t('@astryx.transferList.reorderInstructions')}
      </VisuallyHidden>

      <div
        {...mergeProps(
          themeProps('transfer-list-collection'),
          stylex.props(styles.panels),
        )}>
        <div
          ref={selectedPanelRef}
          role="group"
          aria-labelledby={selectedHeadingId}
          tabIndex={-1}
          {...mergeProps(
            themeProps('transfer-list-panel', {side: 'selected'}),
            stylex.props(focusOutlineStyles.focusVisible, styles.panel),
          )}>
          <div {...stylex.props(styles.panelHeader)}>
            <Text id={selectedHeadingId} type="label" color="secondary">
              {selectedLabel}
            </Text>
            {hasClear && (
              <Button
                label={t('@astryx.transferList.clear')}
                size="sm"
                variant="ghost"
                xstyle={styles.headerAction}
                data-transfer-list-header-action="true"
                isDisabled={
                  !value.some(
                    optionValue =>
                      !optionByValue.get(optionValue)?.isTransferDisabled,
                  )
                }
                onClick={clearSelected}
              />
            )}
          </div>
          <div
            data-transfer-list-panel-body="selected"
            {...stylex.props(styles.panelBody)}>
            {selectedOptions.length > 0 ? (
              <List
                density="compact"
                header={<VisuallyHidden>{selectedLabel}</VisuallyHidden>}>
                {selectedOptions.map((option, index) =>
                  transferItem(option, 'selected', index),
                )}
              </List>
            ) : (
              <div
                data-transfer-list-empty="selected"
                {...stylex.props(styles.empty)}>
                <Text type="supporting" color="secondary">
                  {normalizedQuery === '' ? selectedEmptyText : noResultsText}
                </Text>
              </div>
            )}
          </div>
        </div>

        <div
          ref={availablePanelRef}
          role="group"
          aria-labelledby={availableHeadingId}
          tabIndex={-1}
          {...mergeProps(
            themeProps('transfer-list-panel', {side: 'available'}),
            stylex.props(
              focusOutlineStyles.focusVisible,
              styles.panel,
              styles.panelDivider,
            ),
          )}>
          <div {...stylex.props(styles.panelHeader)}>
            <Text id={availableHeadingId} type="label" color="secondary">
              {availableLabel}
            </Text>
            {hasSelectAll && (
              <Button
                label={t('@astryx.transferList.addAll')}
                size="sm"
                variant="ghost"
                xstyle={styles.headerAction}
                data-transfer-list-header-action="true"
                isDisabled={
                  !options.some(
                    option =>
                      !option.isTransferDisabled &&
                      !currentValueRef.current.includes(option.value),
                  )
                }
                onClick={addAll}
              />
            )}
          </div>
          <div
            data-transfer-list-panel-body="available"
            {...stylex.props(styles.panelBody)}>
            {availableOptions.length > 0 ? (
              <List
                density="compact"
                header={<VisuallyHidden>{availableLabel}</VisuallyHidden>}>
                {groupedAvailable.map(([group, groupOptions]) => (
                  <Fragment key={group || 'ungrouped'}>
                    {(group !== '' || groupedAvailable.length > 1) && (
                      <li
                        role="presentation"
                        {...stylex.props(styles.groupHeading)}>
                        <Text type="body" weight="bold" color="primary">
                          {group || t('@astryx.transferList.ungroupedLabel')}
                        </Text>
                      </li>
                    )}
                    {groupOptions.map(option =>
                      transferItem(
                        option,
                        'available',
                        availableOptions.indexOf(option),
                      ),
                    )}
                  </Fragment>
                ))}
              </List>
            ) : (
              <div
                data-transfer-list-empty="available"
                {...stylex.props(styles.empty)}>
                <Text type="supporting" color="secondary">
                  {normalizedQuery === '' ? availableEmptyText : noResultsText}
                </Text>
              </div>
            )}
          </div>
        </div>
      </div>
      {dragPreviewPosition != null
        ? dragPreviewLayer.render(
            <div
              ref={dragPreviewRef}
              aria-hidden="true"
              data-transfer-list-drag-preview=""
              {...stylex.props(
                reorderStyles.preview,
                styles.dragPreviewContainer,
                dynamicStyles.dragPreview(dragPreviewPosition.width),
              )}
            />,
            {x: dragPreviewPosition.x, y: dragPreviewPosition.y},
          )
        : null}
    </div>
  );
}

TransferList.displayName = 'TransferList';
