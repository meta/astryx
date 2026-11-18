// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TransferList.tsx
 * @input Controlled option data, local action glyphs, core's reorder (List
 *   `reorderable` and ListItem `itemKey`) and the core i18n catalog. The
 *   owner's createReorderable object is adapted through Core's internal
 *   reorder entry, which loads no reorder code of its own
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
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Item} from '@astryxdesign/core/Item';
import {List, ListItem} from '@astryxdesign/core/List';
import {type Reorderable, type ReorderMove} from '@astryxdesign/core';
import {
  adaptReorderable,
  reorderableOptions,
} from '@astryxdesign/core/internal/reorder';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Tooltip} from '@astryxdesign/core/Tooltip';
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
import {transferListVars} from './tokens.stylex';

// A Lucide glyph the shared icon registry does not carry (there is no `add`
// semantic name). Typed as icon components and rendered through `Icon`
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
  /** Explains why a transfer is unavailable. */
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
  /**
   * Disables every transfer, reorder, Clear, Add all and search control. The
   * row controls and the search field stay focusable. @default false
   */
  isDisabled?: boolean;
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
  /**
   * Makes the selected options reorderable through core List's reorder
   * handle (touch hold, mouse drag, keys, reorder mode): pass the object
   * `createReorderable` makes. Its `isReorderable(value)` decides which
   * options move. One it rejects at either end of the list also keeps the
   * others from moving past it. Each move goes to its `onReorder({key, to})`,
   * `to` being the value's index in `value` after the move. Paused while a
   * search filters the panel. Without it, the selected options keep their
   * order.
   */
  reorderable?: Reorderable<T>;
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

const styles = stylex.create({
  // Core List's reorder handle is a small control, 28 px for every pointer,
  // overlapping the row's end padding by 8 px. A finger's 44 px target is its
  // invisible hit layer. A row without one keeps its end content clear of
  // it, so every Remove sits in one column.
  clearsHandle: {
    marginInlineEnd: 20,
  },
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
    // In the phone layout the body does not scroll, so the panel does not
    // clip. On iOS, that clip around the list's own clip draws the row at its
    // edge one point off while rows glide.
    overflow: {
      default: 'hidden',
      '@container (max-width: 40rem)': 'visible',
    },
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
  // A disabled row still takes the pointer, so its disabled controls show
  // their tooltips on hover.
  disabledItem: {
    pointerEvents: 'auto',
  },
  // A disabled row already dims its end content, Remove included. Remove's
  // own disabled dim would make it fainter than the list's other controls.
  removeInDisabledRow: {
    opacity: 1,
  },
  item: {
    minWidth: 0,
    paddingInline: spacingVars['--spacing-3'],
  },
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

interface DisabledHandleTooltipProps {
  rootRef: RefObject<HTMLElement | null>;
  value: string;
  content: string;
}

/**
 * The tooltip and description of a disabled list's reorder handle, which say
 * why the row does not move. Core List renders the handle. So the tooltip
 * finds it in its row when it attaches. It takes the row's last toggle
 * button: the handle comes after the row's own content.
 */
function DisabledHandleTooltip({
  rootRef,
  value,
  content,
}: DisabledHandleTooltipProps) {
  const anchorRef = useMemo(
    () => ({
      get current() {
        const toggles = rootRef.current?.querySelectorAll<HTMLElement>(
          `[data-transfer-list-row="${CSS.escape(value)}"] button[aria-pressed]`,
        );
        return toggles == null || toggles.length === 0
          ? null
          : toggles[toggles.length - 1];
      },
    }),
    [rootRef, value],
  );
  return <Tooltip anchorRef={anchorRef} content={content} />;
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
  options: optionsFromProps,
  isDisabled = false,
  value,
  onChange,
  selectedLabel: selectedLabelFromProps,
  availableLabel: availableLabelFromProps,
  hasSearch = false,
  searchLabel,
  searchPlaceholder: searchPlaceholderFromProps,
  reorderable: reorderableProp,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selectedPanelRef = useRef<HTMLDivElement | null>(null);
  const availablePanelRef = useRef<HTMLDivElement | null>(null);
  const currentValueRef = useRef<readonly T[]>(value);
  const [query, setQuery] = useState('');
  const announce = useAnnounce();

  // Syncs the handlers' ref with the committed `value`. A render React
  // discards, as a suspended transition does, must not leave its value.
  useLayoutEffect(() => {
    currentValueRef.current = value;
  });

  // An option's own message names its own constraint.
  // It does not apply to a disabled list.
  const options = useMemo(
    () =>
      isDisabled
        ? optionsFromProps.map(option => ({
            ...option,
            isTransferDisabled: true,
            disabledMessage: undefined,
          }))
        : optionsFromProps,
    [isDisabled, optionsFromProps],
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

  // Reordering is off while a search filters the panel. A hidden row could
  // otherwise move past the shown rows.
  const isOrdering = reorderableProp != null && normalizedQuery === '';
  // The owner's object decides which values move and takes each move.
  const owner =
    reorderableProp == null ? undefined : reorderableOptions(reorderableProp);
  const canMove = useCallback(
    (optionValue: T) => owner?.isReorderable?.(optionValue) ?? true,
    [owner],
  );
  const reorderSelected = useCallback(
    ({key, to: toIndex}: ReorderMove) => {
      const shown = selectedOptions.map(option => option.value);
      const fromIndex = shown.indexOf(key as T);
      if (fromIndex < 0 || fromIndex === toIndex || shown[toIndex] == null) {
        return;
      }
      const order = [...shown];
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      // The shown rows' new order goes back into the places the shown values
      // held. So a value without an option keeps its place in this order.
      const isShown = new Set(shown);
      let next = 0;
      const nextValue = currentValueRef.current.map(item =>
        isShown.has(item) ? order[next++] : item,
      );
      if (owner == null) {
        return;
      }
      // In the value's terms: where the moved value lands. The owner moving
      // it there keeps the shown rows in this order.
      owner.onReorder({key: key as T, to: nextValue.indexOf(key as T)});
    },
    [owner, selectedOptions],
  );
  // The owner's object, adapted so List's moves among the shown rows reach
  // the owner in the value's terms. Its engine is the owner's, so nothing
  // here loads the reorder, and the owner's `start(key)` finds this list.
  const reorderable = useMemo(
    () =>
      isOrdering && reorderableProp != null
        ? adaptReorderable<string, number>(reorderableProp, {
            onReorder: reorderSelected,
            isReorderable: key => canMove(key as T),
          })
        : undefined,
    [canMove, isOrdering, reorderSelected, reorderableProp],
  );

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
    const remove = (
      <IconButton
        label={t('@astryx.transferList.removeOption', {label: option.label})}
        icon={<Icon icon="close" size="sm" />}
        size="sm"
        variant="ghost"
        isDisabled={isTransferDisabled}
        tooltip={isTransferDisabled ? disabledReason : undefined}
        data-transfer-list-action="selected"
        onClick={() => removeOption(option, index)}
        // A row that keeps its place has no handle: its Remove keeps the
        // movable rows' column, clear of where their handles sit.
        xstyle={[
          isOrdering && !canMove(option.value) && styles.clearsHandle,
          isDisabled && styles.removeInDisabledRow,
        ]}
      />
    );
    if (!isDisabled || !isOrdering || !canMove(option.value)) {
      return remove;
    }
    return (
      <>
        {remove}
        <DisabledHandleTooltip
          rootRef={rootRef}
          value={option.value}
          content={t('@astryx.transferList.reorderDisabled', {
            label: option.label,
          })}
        />
      </>
    );
  };

  const transferItem = (
    option: TransferListOption<T>,
    side: 'selected' | 'available',
    index: number,
  ) => {
    // Transfer and reorder are separate states of the row's own target. A
    // row the owner keeps in place is `fixed`.
    const theme = themeProps('transfer-list-item', {
      side,
      state: option.isTransferDisabled ? 'disabled' : 'enabled',
      reorder:
        side === 'selected' && isOrdering
          ? canMove(option.value)
            ? 'movable'
            : 'fixed'
          : undefined,
    });
    if (side === 'selected') {
      return (
        <ListItem
          key={option.value}
          itemKey={option.value}
          label={renderOption?.(option) ?? option.label}
          endContent={optionActions(option, side, index)}
          // A disabled list keeps each handle as a focusable disabled
          // control. Core List ends its reorder mode and sends a drag home.
          isDisabled={isDisabled}
          xstyle={[styles.item, isDisabled && styles.disabledItem]}
          data-transfer-list-row={option.value}
          data-transfer-list-index={String(value.indexOf(option.value))}
          {...theme}
        />
      );
    }
    return (
      <Item
        key={option.value}
        as="li"
        density="compact"
        label={renderOption?.(option) ?? option.label}
        endContent={optionActions(option, side, index)}
        xstyle={styles.item}
        {...theme}
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
            isDisabled={isDisabled}
            onChange={handleSearch}
          />
        </div>
      )}

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
                header={<VisuallyHidden>{selectedLabel}</VisuallyHidden>}
                reorderable={reorderable}>
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
                      !value.includes(option.value),
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
    </div>
  );
}

TransferList.displayName = 'TransferList';
