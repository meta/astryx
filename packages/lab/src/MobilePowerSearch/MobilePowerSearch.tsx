// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobilePowerSearch.tsx
 * @input Core PowerSearch config, filters and onChange (the same props as
 *   @astryxdesign/core PowerSearch); public @astryxdesign/core components only
 *   (BottomSheet, Button, Field, Heading, Icon, List,
 *   RadioList, Text, TextInput, Token, Tooltip hooks, i18n, hooks —
 *   useAnnounce for every announcement — utils, Layout container-padding
 *   styles)
 * @output Exports MobilePowerSearch — Lab prototype of the touch PowerSearch
 *   flow: the whole field is one "Manage filters" trigger with display-only
 *   tokens, a Filters sheet with chevron rows, Add filter and sticky
 *   Clear all / Done, and a field → operator → value drill-down whose edit
 *   sheet holds Cancel / Apply / Remove; the steps are sibling BottomSheets
 *   that replace one another on a same-update switch (one scrim, the
 *   entering step above the leaving one)
 * @position Lab (canary) stack layer 1: validates the touch design before any
 *   Core promotion. The caller chooses it explicitly
 *   (`isTouch ? MobilePowerSearch : PowerSearch`); there is no pointer
 *   switching inside the component.
 *
 * API mirrors Core PowerSearchProps (config, filters, onChange with the same
 * change metadata, label, placeholder, size, isDisabled, isReadOnly,
 * timezoneID, status, startIcon, endContent, resultCount, handleRef,
 * components, ...) so graduation is an import swap. Differences from Core are
 * the Lab deltas:
 * - no `menuWidth` or `tokenOverflowBehavior`: there is no typeahead popover
 *   and tokens wrap inside the trigger;
 * - strings are literals (no new i18n keys; existing Core keys are reused
 *   for the result count, the add and the removal announcements);
 * - announcements made while a sheet is open are delivered inside that
 *   sheet's dialog by `useAnnounce`, called from a `SheetAnnouncer` rendered
 *   in each step (spec AST-086 FR14): the shared page-body channel is not
 *   exposed while a native modal dialog is open. Empty-result and
 *   unavailable messages are spoken from their rendered element, once per
 *   occasion; Clear all's outcome and a result count that changes during
 *   the flow's exit are spoken once focus is back on the trigger;
 * - no theming contract: no `power-search` theme target or selectors;
 * - `components[type].Token` overrides receive Core's PowerSearchTokenProps;
 *   the built-in token renders Core `Token` directly, with the value text
 *   the Filters rows share; `timezoneID` is accepted for API parity and
 *   changes no date value (dates follow Core's semantics, below);
 * - fields whose every operator is `nested` are left out with a development
 *   warning; `nested` has no sheet editor yet (Core's built-in nested editor
 *   is not exported);
 * - dates follow Core PowerSearch's semantics (`component:PowerSearch`
 *   DEC-3, FR11, FR12): a `date_absolute` is the UTC midnight of the chosen
 *   day, which the date editor reads and writes as that UTC day; the token
 *   and the Filters row show it as the Core token does (the day in the
 *   browser's zone, no time); `isDateOnly: false` gets the same date-only
 *   editor, and `date_relative` is a row list rather than a Selector;
 * - Clear all removes every filter, read-only ones included, reported as one
 *   `remove` at the last index, as the Core field's clear control does;
 * - a filter whose field or operator the config no longer knows lists by its
 *   raw keys and its step is the unavailable state, whose Remove is the way
 *   out; rows and tokens are keyed by filter identity, so a controlled
 *   reorder or a removal above the focused row keeps focus where it was, and
 *   a removed focused control hands focus to the nearest remaining button
 *   row, else the sheet's first control;
 * - the sheets pad their own content (`padding={0}` on BottomSheet); each
 *   sheet body publishes that padding as container padding so its
 *   `edge="bleed"` lists run edge to edge with row text on the body's inset.
 *
 * The sheets are pinned tall on purpose: the field list resizes as it is
 * searched and the editor changes with the operator, and only a fully
 * expanded tall sheet gives mobile-keyboard accommodation.
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/MobilePowerSearch/MobilePowerSearch.doc.mjs
 * - /packages/lab/src/MobilePowerSearch/MobilePowerSearch.test.tsx
 * - /apps/storybook/stories/MobilePowerSearch.stories.tsx
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {
  Field,
  inputStatusBorderStyles,
  inputStatusFocusWithinStyles,
  inputStatusHoverShadowStyles,
  inputWrapperStyles,
  type FieldStatusVariant,
  type InputStatus,
} from '@astryxdesign/core/Field';
import {Heading} from '@astryxdesign/core/Heading';
import {Icon, renderIconSlot, type IconType} from '@astryxdesign/core/Icon';
import {containerPaddingInlineVarStyles} from '@astryxdesign/core/Layout/padding.stylex';
import {List, ListItem} from '@astryxdesign/core/List';
import {resolveOperatorLabel} from '@astryxdesign/core/PowerSearch';
import type {
  FilterValue,
  PowerSearchChangeType,
  PowerSearchComponents,
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchHandle,
  PowerSearchOperator,
  PowerSearchSize,
} from '@astryxdesign/core/PowerSearch';
import {formatFilterValue} from '@astryxdesign/core/PowerSearch/utils';
import type {InternalConfig} from '@astryxdesign/core/PowerSearch/utils';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {useSize} from '@astryxdesign/core/SizeContext';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {useTooltip} from '@astryxdesign/core/Tooltip';
import {
  useAnnounce,
  useDevWarning,
  useMergedRefs,
  type AnnounceFn,
} from '@astryxdesign/core/hooks';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import {
  colorVars,
  fontWeightVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {isImeKeyEvent, isRenderable, rtlStyles} from '@astryxdesign/core/utils';
import {MobilePowerSearchValueEditor} from './MobilePowerSearchValueEditor';
import {
  createContentSearchSource,
  createFilterIdentities,
  fieldMatchesQuery,
  filterSignature,
  formatDateDay,
  isSupportedOperator,
  nearestEditableIndex,
  resolveFilterIdentityIndex,
  useMobilePowerSearchConfig,
  type MobilePowerSearchItem,
} from './mobilePowerSearchUtils';

// =============================================================================
// Props
// =============================================================================

export interface MobilePowerSearchProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  /** PowerSearch configuration defining available fields and operators. */
  config: PowerSearchConfig;
  /** Currently active filters. */
  filters: ReadonlyArray<PowerSearchFilter>;
  /** Called when filters change, with the same metadata as Core PowerSearch. */
  onChange: (
    filters: ReadonlyArray<PowerSearchFilter>,
    changeType: PowerSearchChangeType,
    index: number,
  ) => void;
  /** Accessible label for the field and its trigger. @default 'Manage filters' */
  label?: string;
  /** Visually hide the label. @default true */
  isLabelHidden?: boolean;
  /** Trigger text when no filter is selected, and the content-search placeholder. */
  placeholder?: string;
  /** Auto-focus the trigger on mount. @default false */
  hasAutoFocus?: boolean;
  /** Show Clear all in the Filters sheet. @default true */
  hasClear?: boolean;
  /** Filters stay visible but cannot be added, edited, or removed. @default false */
  isReadOnly?: boolean;
  /** Disable the field; the sheet cannot open. @default false */
  isDisabled?: boolean;
  /**
   * Explains why the field is disabled. With `isDisabled`, the trigger stays
   * focusable (via `aria-disabled`) and shows this text in a tooltip.
   */
  disabledMessage?: string;
  /** Icon at the start of the field. */
  startIcon?: ReactNode | IconType;
  /** Fires when focus enters the field from outside. */
  onFocus?: (e: React.FocusEvent) => void;
  /** Fires when focus leaves the field entirely. */
  onBlur?: (e: React.FocusEvent) => void;
  /** Validation status. */
  status?: InputStatus;
  /** How the status message is placed. @default 'attached' */
  statusVariant?: FieldStatusVariant;
  /** Max display length for token values. @default 40 */
  maxTokenLength?: number;
  /** Max suggestions in string and entity value typeaheads. @default 10 */
  maxOperatorMenuItems?: number;
  /** Max ranked results for a non-empty field or content query. @default 10 */
  maxSearchResults?: number;
  /** Label for the edit sheet's save action. @default 'Apply' when editing, 'Add filter' when creating */
  popoverSaveButtonLabel?: string;
  /**
   * Accepted for API parity with Core PowerSearch. Dates follow Core's
   * semantics: tokens and rows show a `date_absolute` as the Core token does
   * (its day in the browser's zone) and the date editors read and write the
   * UTC day, so this prop does not change a date value today.
   */
  timezoneID?: string;
  /** Content at the end of the field row. */
  endContent?: ReactNode;
  /** Result count: a number formats as "N results"; a string shows as-is. */
  resultCount?: number | string;
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLDivElement>;
  /** Imperative handle; `focusTypeahead` focuses the sheet trigger. */
  handleRef?: React.Ref<PowerSearchHandle>;
  /** Size of the field. @default 'md' */
  size?: PowerSearchSize;
  /** Per-type overrides for token and editor rendering. */
  components?: PowerSearchComponents;
}

// =============================================================================
// Styles
// =============================================================================

const sizeStyles = stylex.create({
  sm: {minHeight: sizeVars['--size-element-sm']},
  md: {minHeight: sizeVars['--size-element-md']},
  lg: {minHeight: sizeVars['--size-element-lg']},
});

const styles = stylex.create({
  wrapper: {
    position: 'relative',
    flexWrap: 'nowrap',
    gap: spacingVars['--spacing-1'],
    height: 'auto',
    cursor: {
      default: 'pointer',
      ':is([aria-disabled="true"])': 'default',
    },
  },
  wrapperWithTokens: {
    paddingBlock: `calc(${spacingVars['--spacing-1']} - 1px)`,
    paddingInline: `calc(${spacingVars['--spacing-1']} - 1px)`,
  },
  contentSection: {
    position: 'relative',
    minWidth: 0,
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacingVars['--spacing-1'],
    rowGap: `calc(${spacingVars['--spacing-1']} - 1px)`,
  },
  startIconWithTokens: {
    marginInlineStart: `calc(${spacingVars['--spacing-2']} - ${spacingVars['--spacing-1']} + 1px)`,
  },
  // The only tab stop in the field. It stays visually borderless while the
  // wrapper delegates taps on tokens and empty space to it.
  trigger: {
    appearance: 'none',
    flex: '1 1 40px',
    minWidth: '40px',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    paddingBlock: 0,
    paddingInline: spacingVars['--spacing-1'],
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    textAlign: 'start',
    whiteSpace: 'nowrap',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    outline: 'none',
  },
  // Once a token is present the empty trigger covers the token lane instead
  // of reserving 40px or wrapping onto an otherwise blank row.
  triggerWithTokens: {
    position: 'absolute',
    inset: 0,
    minWidth: 0,
    padding: 0,
  },
  tokenValue: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
  endSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flexShrink: 0,
    paddingInlineEnd: spacingVars['--spacing-1'],
  },
  resultCount: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
  },
  // 44px touch targets for every sheet action, without resizing inputs.
  touchAction: {
    minHeight: 44,
  },
  touchIconAction: {
    minWidth: 44,
    minHeight: 44,
  },
  // --- sheet shell ---------------------------------------------------------
  // Scopes the sticky header's and footer's layer to this sheet's content:
  // the List rows are `position: relative` and come after the header, so
  // without a layer of its own the header is painted under the rows that
  // scroll beneath it. Isolating the content keeps that z-index inside it, so
  // the sheet's grab handle (z-index 1 on the panel, outside this wrapper)
  // still paints above.
  sheet: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    isolation: 'isolate',
  },
  header: {
    position: 'sticky',
    insetBlockStart: 0,
    // Above the rows that scroll under it, within the isolated sheet content.
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-3'],
    // Clears the sheet's floating grab handle.
    paddingBlockStart: spacingVars['--spacing-6'],
    paddingBlockEnd: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  headerText: {
    minWidth: 0,
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  // The body pads the sheet's content and publishes that inline padding as
  // the container padding its lists read: with `edge="bleed"` their rows run
  // edge to edge (full-bleed dividers) while row text keeps this inset, so
  // row text, group headings and the sheet title share one edge. The sheet
  // itself has `padding={0}`, so it publishes none.
  body: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-4'],
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  footer: {
    position: 'sticky',
    insetBlockEnd: 0,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
    backgroundColor: colorVars['--color-background-surface'],
  },
  footerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    marginInlineStart: 'auto',
  },
  footerSoleAction: {
    flexGrow: 1,
  },
  empty: {
    paddingBlock: spacingVars['--spacing-6'],
    textAlign: 'center',
  },
  rowValue: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
});

// =============================================================================
// Draft state
// =============================================================================

type SheetStep = 'manage' | 'fields' | 'value';

type PendingSheetFocus =
  | {readonly type: 'manager-add'}
  | {readonly type: 'content-search'}
  | {
      readonly type: 'manager-filter';
      readonly sourceFilter: PowerSearchFilter;
      readonly sourceSignature: string;
      readonly preferredIndex: number;
    }
  | {readonly type: 'field'; readonly fieldKey: string};

interface FilterDraft {
  readonly mode: 'create' | 'edit';
  /** Where Cancel returns for a new filter. */
  readonly returnStep?: 'fields' | 'manage';
  /** Control within the return sheet that launched this draft. */
  readonly returnFocus?: 'field' | 'content-search';
  /** Index in `filters` when edit mode opened. */
  readonly filterIndex?: number;
  /** Original controlled filter identity, used to follow immutable reorders. */
  readonly sourceFilter?: PowerSearchFilter;
  /** Structural snapshot, used when controlled parents clone their values. */
  readonly sourceSignature?: string;
  readonly field: string;
  readonly operator?: string;
  readonly value?: FilterValue;
}

function resolveDraftFilterIndex(
  filters: ReadonlyArray<PowerSearchFilter>,
  draft: FilterDraft,
): number | null {
  if (
    draft.mode !== 'edit' ||
    draft.filterIndex == null ||
    draft.sourceFilter == null ||
    draft.sourceSignature == null
  ) {
    return null;
  }
  return resolveFilterIdentityIndex(
    filters,
    draft.sourceFilter,
    draft.sourceSignature,
    draft.filterIndex,
  );
}

// Below this many fields a search box is noise: the whole list is on screen.
const SEARCHABLE_FIELD_COUNT = 8;
const DEFAULT_MAX_SEARCH_RESULTS = 10;
const MAX_BROWSE_MENU_ITEMS = 1000;

// =============================================================================
// In-sheet announcements
// =============================================================================

/**
 * Rendered inside a step's BottomSheet so that `useAnnounce` resolves the
 * sheet's dialog as the enclosing modal (spec AST-086 FR14): a message
 * written through it is delivered inside that dialog, the only channel
 * assistive technology exposes while the native modal is open. Publishes
 * that dialog's `announce` to the flow above while mounted. Renders nothing.
 */
function SheetAnnouncer({
  onAnnounceChange,
}: {
  onAnnounceChange: (announce: AnnounceFn | null) => void;
}) {
  const announce = useAnnounce();
  useEffect(() => {
    onAnnounceChange(announce);
    return () => {
      onAnnounceChange(null);
    };
  }, [announce, onAnnounceChange]);
  return null;
}

/**
 * A sheet's empty-result or unavailable message, rendered inside the step's
 * dialog and spoken from its rendered text once per occasion — a query that
 * matches nothing, a filter that became unavailable — through `useAnnounce`,
 * which, called from inside the sheet, delivers into the sheet's dialog. The
 * message is plain text, not an EmptyState, so nothing announces it twice.
 * (Core's own-content hook is not reachable from Lab; this is its shape.)
 */
function SheetEmptyMessage({
  id,
  message,
  occasion,
}: {
  id?: string;
  message: string;
  occasion: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const announce = useAnnounce();
  const spokenOccasionRef = useRef<string | null>(null);
  useEffect(() => {
    if (spokenOccasionRef.current === occasion) {
      return;
    }
    spokenOccasionRef.current = occasion;
    const text = ref.current?.textContent?.trim();
    if (text) {
      announce(text);
    }
  }, [announce, occasion]);
  return (
    <div ref={ref} id={id} {...stylex.props(styles.empty)}>
      <Text type="supporting" color="secondary">
        {message}
      </Text>
    </div>
  );
}

// =============================================================================
// Token
// =============================================================================

/**
 * Formats a filter's value for a token or a row with the formatter the
 * Filters rows share. A `date_absolute` reads as the Core PowerSearch token
 * shows it (`formatDateDay`: a day in the browser's zone, no time), so a Lab
 * token or row and a Core token read the same; everything else goes through
 * Core's `formatFilterValue`.
 */
function formatValueText(
  config: InternalConfig,
  operator: PowerSearchOperator,
  filter: PowerSearchFilter,
  maxLength: number,
  t: ReturnType<typeof useTranslator>,
  locale: string,
  timezoneID: string | undefined,
): string {
  if (
    operator.value.type === 'date_absolute' &&
    filter.value.type === 'date_absolute'
  ) {
    return formatDateDay(filter.value.unixSeconds, locale);
  }
  return formatFilterValue(
    config,
    operator.value,
    filter.value,
    maxLength,
    t,
    locale,
    timezoneID,
  );
}

/**
 * Display-only token for the trigger. Core's PowerSearchToken has no
 * `timezoneID` prop, so the value is formatted here with the same formatter
 * the Filters rows use. A filter whose field or operator the config no
 * longer has still shows, by its raw keys, as the Core token does.
 */
function MobilePowerSearchToken({
  config,
  filter,
  field,
  operator,
  maxLength,
  size,
  isDisabled,
  timezoneID,
}: {
  config: InternalConfig;
  filter: PowerSearchFilter;
  field: PowerSearchField | undefined;
  operator: PowerSearchOperator | undefined;
  maxLength: number;
  size: PowerSearchSize;
  isDisabled: boolean;
  timezoneID?: string;
}) {
  const t = useTranslator();
  const locale = useLocale();
  const fieldLabel = field?.label ?? filter.field;
  const operatorLabel =
    operator == null ? filter.operator : resolveOperatorLabel(operator, t);
  const tokenLabel = operatorLabel
    ? `${fieldLabel}: ${operatorLabel}`
    : fieldLabel;
  const adjustedMaxLength = Math.max(
    maxLength - fieldLabel.length - operatorLabel.length,
    10,
  );
  const value =
    operator == null
      ? ''
      : formatValueText(
          config,
          operator,
          filter,
          adjustedMaxLength,
          t,
          locale,
          timezoneID,
        );
  return (
    <Token
      label={tokenLabel}
      size={size}
      isDisabled={isDisabled}
      endContent={
        value ? (
          <span {...stylex.props(styles.tokenValue)}>{value}</span>
        ) : undefined
      }
    />
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * Lab prototype of the touch PowerSearch flow. The outer field keeps active
 * filters as display-only tokens and acts as one sheet trigger. The Filters
 * sheet lists selected filters as chevron rows with Add filter in its header
 * and Clear all plus Done in its sticky footer; opening a row edits that
 * filter in a sheet with Cancel, Apply and Remove. Add filter opens directly
 * when no filter exists and, when the config names a content-search field,
 * carries that search with inline suggestions.
 */
export function MobilePowerSearch({
  config: configProp,
  filters,
  onChange,
  label: labelFromProps,
  isLabelHidden = true,
  placeholder: placeholderFromProps,
  hasAutoFocus = false,
  hasClear = true,
  isReadOnly = false,
  isDisabled = false,
  disabledMessage,
  startIcon,
  onFocus,
  onBlur,
  status,
  statusVariant = 'attached',
  maxTokenLength = 40,
  maxOperatorMenuItems,
  maxSearchResults = DEFAULT_MAX_SEARCH_RESULTS,
  popoverSaveButtonLabel,
  timezoneID,
  endContent,
  resultCount,
  ref,
  handleRef,
  size: sizeProp,
  'data-testid': testId,
  xstyle,
  className,
  style,
  components: componentOverrides,
}: MobilePowerSearchProps) {
  const size = useSize(sizeProp, 'md');
  const config = useMobilePowerSearchConfig(configProp);
  const t = useTranslator();
  const locale = useLocale();
  const announceOnPage = useAnnounce();
  // `useAnnounce` delivers inside the open Astryx modal that encloses its
  // caller (spec AST-086 FR14), and this component renders above the sheets,
  // so with a sheet open it cannot call the hook itself: each step's body
  // renders a `SheetAnnouncer` inside its BottomSheet, which publishes the
  // dialog's own `announce` here while that step is the active one. With no
  // sheet open the field's own `useAnnounce` routes a message by where the
  // field is — a Dialog or modal Drawer that holds it, else the shared
  // page-body channel.
  const sheetAnnounceRef = useRef<AnnounceFn | null>(null);
  const handleAnnounceChange = useCallback((next: AnnounceFn | null) => {
    sheetAnnounceRef.current = next;
  }, []);
  const stepRef = useRef<SheetStep | null>(null);
  const announce = useCallback(
    (message: string) => {
      const inSheet = stepRef.current == null ? null : sheetAnnounceRef.current;
      (inSheet ?? announceOnPage)(message);
    },
    [announceOnPage],
  );
  // An announcement queued by a step change — a suggestion or a removal that
  // changed the filters — is spoken in the commit that shows the next step,
  // so it lands in that step's dialog rather than the one about to close.
  const pendingAnnouncementRef = useRef<string | null>(null);
  // What to speak once the flow has fully closed and focus is back on the
  // trigger: that Clear all removed every filter, and a result count that
  // changed during the exit. The closing dialog stays modal through its exit,
  // so neither its region nor the page-body channel is heard before then.
  const afterCloseRef = useRef<{
    isCleared: boolean;
    resultCount: string | null;
  }>({isCleared: false, resultCount: null});

  const triggerLabel = labelFromProps ?? 'Manage filters';
  const fieldPlaceholder = placeholderFromProps ?? 'Filters…';
  const contentSearchPlaceholder = placeholderFromProps ?? 'Search…';

  const contentSearchFieldKey = config.config.contentSearchFieldKey;
  const contentSearchOperator =
    contentSearchFieldKey == null
      ? undefined
      : config.getDefaultOperator(contentSearchFieldKey);
  const hasContentSearch = contentSearchOperator?.value.type === 'string';
  const contentSearchSource = useMemo(
    () => createContentSearchSource(config, t, maxSearchResults),
    [config, maxSearchResults, t],
  );

  const triggerId = useId();
  const triggerLabelId = useId();
  const triggerContentId = useId();
  const statusMessageId = useId();
  const contentResultsId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The field's end lane — the result count and `endContent` — sits outside
  // the trigger button: a caller's action button there keeps its own tab
  // stop and taps, so a tap on it must not open the flow.
  const endLaneRef = useRef<HTMLDivElement>(null);
  const managerAddButtonRef = useRef<HTMLButtonElement>(null);
  const contentSearchRef = useRef<HTMLDivElement>(null);
  const contentSuggestionListRef = useRef<HTMLUListElement>(null);
  const managerRowsRef = useRef(new Map<number, HTMLLIElement>());
  const fieldRowsRef = useRef(new Map<string, HTMLLIElement>());
  const manageSheetRef = useRef<HTMLDivElement>(null);
  const fieldsSheetRef = useRef<HTMLDivElement>(null);
  const fieldPickerOriginRef = useRef<'manage' | 'trigger'>('manage');
  const latestFiltersRef = useRef(filters);
  const pendingSheetFocusRef = useRef<PendingSheetFocus | null>(null);
  const pendingMutationFocusRef = useRef(false);
  // Where focus was inside the Filters or Add filter sheet — the sheet and
  // the index among its button rows — read on every focus change there, so a
  // controlled update that unmounts the focused control (a filter's row, a
  // dropped field's row, Clear all gone with the last filter) can put focus
  // on the nearest remaining row by that index, else the sheet's first
  // control, else the sheet panel. A removed element fires no blur, so the
  // position is what the effect below reads.
  const lastSheetFocusRef = useRef<{
    sheet: 'manage' | 'fields';
    rowIndex: number | null;
  } | null>(null);
  // One index space for the record and the recovery: rows that are buttons
  // (a plain read-only row is passed over, as the Remove and Apply/Cancel
  // rules pass it over), in document order.
  const buttonRowsOf = (panel: HTMLElement): HTMLElement[] =>
    Array.from(panel.querySelectorAll<HTMLLIElement>('li'))
      .map(row => row.querySelector<HTMLElement>('button'))
      .filter((button): button is HTMLElement => button != null);
  const noteSheetFocus = useCallback(
    (sheet: 'manage' | 'fields') => (event: React.FocusEvent) => {
      const row = (event.target as HTMLElement).closest('li');
      const button = row?.querySelector<HTMLElement>('button') ?? null;
      const rowIndex =
        button == null
          ? -1
          : buttonRowsOf(event.currentTarget as HTMLElement).indexOf(button);
      lastSheetFocusRef.current = {
        sheet,
        rowIndex: rowIndex === -1 ? null : rowIndex,
      };
    },
    [],
  );

  const [step, setStep] = useState<SheetStep | null>(null);
  stepRef.current = step;
  // A field that becomes disabled cannot keep its flow open, and must not
  // reopen it when re-enabled. Adjusted in the render that sees the change,
  // not an effect, so no frame shows both.
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled && step != null) {
      setStep(null);
    }
  }
  // The draft outlives a step change on purpose: the replace handoff keeps
  // the outgoing sheet presented while the incoming one enters, and clearing
  // the draft with the step would blank that sheet mid-transition.
  const [draft, setDraft] = useState<FilterDraft | null>(null);
  const [fieldQuery, setFieldQuery] = useState('');
  const [contentQuery, setContentQuery] = useState('');

  const isInteractive = !isDisabled && !isReadOnly;
  // Whether a Filters row is a button: the field interactive and the filter
  // not read-only. The row opens the value step — the editor for its
  // operator's value type, or for a filter the config no longer knows the
  // unavailable state, whose Remove is the way out.
  const isRowButton = useCallback(
    (filter: PowerSearchFilter): boolean => !filter.isReadOnly && isInteractive,
    [isInteractive],
  );
  const contentResults = useMemo(() => {
    if (step !== 'fields' || !hasContentSearch || !isInteractive) {
      return [];
    }
    const results =
      contentQuery.trim() === ''
        ? contentSearchSource.bootstrap()
        : contentSearchSource.search(contentQuery);
    return results.slice(0, MAX_BROWSE_MENU_ITEMS);
  }, [
    contentQuery,
    contentSearchSource,
    hasContentSearch,
    isInteractive,
    step,
  ]);

  // ------------------------------------------------------------------ focus --

  const focusPendingSheetTarget = useCallback(() => {
    const target = pendingSheetFocusRef.current;
    if (target == null) {
      return;
    }
    pendingSheetFocusRef.current = null;
    if (target.type === 'manager-add') {
      managerAddButtonRef.current?.focus({preventScroll: true});
      return;
    }
    // Add filter's fallback: a controlled update may have removed the field
    // whose row opened the step, or the content-search field itself; the
    // sheet's first focusable control then takes focus — the search field
    // when one shows, else the first field row, else Back.
    const firstFieldsControl = () => {
      const panel = fieldsSheetRef.current;
      return (
        panel?.querySelector<HTMLElement>('input') ??
        panel?.querySelector<HTMLElement>('li button') ??
        panel?.querySelector<HTMLElement>('button') ??
        null
      );
    };
    if (target.type === 'content-search') {
      (
        contentSearchRef.current?.querySelector<HTMLInputElement>('input') ??
        firstFieldsControl()
      )?.focus({preventScroll: true});
      return;
    }
    if (target.type === 'field') {
      (
        fieldRowsRef.current
          .get(target.fieldKey)
          ?.querySelector<HTMLButtonElement>('button') ?? firstFieldsControl()
      )?.focus({preventScroll: true});
      return;
    }
    // The row the step came from, followed across a controlled reorder or
    // clone; when a controlled update removed it, or left two filters it
    // could be, the nearest remaining row that is a button, as after a
    // removal; else Add filter.
    const index =
      resolveFilterIdentityIndex(
        latestFiltersRef.current,
        target.sourceFilter,
        target.sourceSignature,
        target.preferredIndex,
      ) ??
      nearestEditableIndex(
        latestFiltersRef.current,
        target.preferredIndex,
        isRowButton,
      );
    const rowButton =
      index == null
        ? null
        : managerRowsRef.current
            .get(index)
            ?.querySelector<HTMLButtonElement>('button');
    (rowButton ?? managerAddButtonRef.current)?.focus({preventScroll: true});
  }, [isRowButton]);

  // A controlled update that unmounts the focused control of the Filters or
  // Add filter sheet leaves focus on the page body inside the open modal.
  // Read before paint on every commit of an open step: when focus is no
  // longer inside the sheet's dialog, the nearest remaining row by the last
  // focused index takes it, else the sheet's first control, else its panel.
  // The pending-target effects below run after and win when a step change
  // named a control.
  useLayoutEffect(() => {
    const last = lastSheetFocusRef.current;
    if (step !== 'manage' && step !== 'fields') {
      return;
    }
    if (last == null || last.sheet !== step) {
      return;
    }
    const panel =
      step === 'manage' ? manageSheetRef.current : fieldsSheetRef.current;
    const dialog = panel?.closest('dialog');
    const active = document.activeElement;
    if (
      panel == null ||
      dialog == null ||
      (active != null && active !== document.body && dialog.contains(active))
    ) {
      return;
    }
    const rowButtons = buttonRowsOf(panel);
    let target: HTMLElement | null = null;
    if (last.rowIndex != null && rowButtons.length > 0) {
      // The following button row, else the last.
      target = rowButtons[Math.min(last.rowIndex, rowButtons.length - 1)];
    }
    target ??=
      panel.querySelector<HTMLElement>('input') ??
      rowButtons[0] ??
      panel.querySelector<HTMLElement>('button') ??
      null;
    if (target != null) {
      target.focus({preventScroll: true});
    } else {
      const focusable = dialog.querySelector<HTMLElement>('[tabindex="-1"]');
      (focusable ?? dialog).focus({preventScroll: true});
    }
  });

  // Both effects run after the entering sheet's own panel focus (child
  // effects commit first), so the intended control wins. The filters effect
  // is declared first so a mutation that lands in the same commit as the step
  // change resolves its row against the new filters.
  useEffect(() => {
    latestFiltersRef.current = filters;
    if (step === 'manage' && pendingMutationFocusRef.current) {
      pendingMutationFocusRef.current = false;
      focusPendingSheetTarget();
    }
  }, [filters, focusPendingSheetTarget, step]);

  useEffect(() => {
    if (step != null) {
      focusPendingSheetTarget();
    }
  }, [focusPendingSheetTarget, step]);

  // An announcement queued by a step change is spoken in the commit that
  // shows the next step, so it lands in that step's dialog.
  useEffect(() => {
    const message = pendingAnnouncementRef.current;
    if (step != null && message != null) {
      pendingAnnouncementRef.current = null;
      announce(message);
    }
  }, [announce, step]);

  // ----------------------------------------------------------------- fields --

  const fields = useMemo(
    () =>
      config
        .getVisibleFields()
        .filter(field => field.operators.some(isSupportedOperator)),
    [config],
  );

  const droppedFieldCount = config.getVisibleFields().length - fields.length;
  useDevWarning(
    'MobilePowerSearch',
    `${droppedFieldCount} field(s) were left out of the filter list because every operator they define has a 'nested' value type, which the sheet editor cannot edit yet. Give those fields a non-nested operator to make them available.`,
    droppedFieldCount > 0,
  );

  const normalizedFieldQuery = fieldQuery.trim().toLowerCase();
  const matchingFields = useMemo(() => {
    const matches = fields.filter(field =>
      fieldMatchesQuery(field, normalizedFieldQuery),
    );
    return normalizedFieldQuery === ''
      ? matches
      : matches.slice(0, maxSearchResults);
  }, [fields, maxSearchResults, normalizedFieldQuery]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, PowerSearchField[]>();
    for (const field of matchingFields) {
      const key = field.group ?? '';
      const existing = groups.get(key);
      if (existing) {
        existing.push(field);
      } else {
        groups.set(key, [field]);
      }
    }
    return [...groups.entries()];
  }, [matchingFields]);

  const isFieldSearchShown = fields.length >= SEARCHABLE_FIELD_COUNT;

  // ------------------------------------------------------------------ draft --

  const draftField = draft ? config.getField(draft.field) : undefined;
  const draftOperator =
    draft?.operator != null
      ? config.getOperator(draft.field, draft.operator)
      : undefined;
  const draftOperators = useMemo(
    () =>
      draft
        ? config.getVisibleOperators(draft.field).filter(isSupportedOperator)
        : [],
    [config, draft],
  );

  const closeSheet = useCallback(() => {
    setStep(null);
  }, []);

  const openManager = useCallback(() => {
    if (isDisabled) {
      return;
    }
    // A sheet returns focus to the element that was active when its dialog
    // opened, and a replace handoff carries that target from step to step;
    // make sure it is the trigger even for a tap on a token.
    triggerRef.current?.focus({preventScroll: true});
    if (filters.length === 0 && isInteractive) {
      fieldPickerOriginRef.current = 'trigger';
      setFieldQuery('');
      setContentQuery('');
      pendingSheetFocusRef.current = hasContentSearch
        ? {type: 'content-search'}
        : null;
      setStep('fields');
      return;
    }
    fieldPickerOriginRef.current = 'manage';
    setStep('manage');
  }, [filters.length, hasContentSearch, isDisabled, isInteractive]);

  const handleWrapperClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Tokens are display-only; a tap on them or the empty space around them
      // opens the sheet. The trigger button handles its own click, and the
      // end lane handles its own.
      if (
        event.target instanceof Node &&
        (triggerRef.current?.contains(event.target) ||
          endLaneRef.current?.contains(event.target))
      ) {
        return;
      }
      openManager();
    },
    [openManager],
  );

  const openFieldList = useCallback(() => {
    if (!isInteractive) {
      return;
    }
    fieldPickerOriginRef.current = 'manage';
    setFieldQuery('');
    setContentQuery('');
    pendingSheetFocusRef.current = hasContentSearch
      ? {type: 'content-search'}
      : null;
    setStep('fields');
  }, [hasContentSearch, isInteractive]);

  const queueManagerAddFocus = useCallback(() => {
    pendingSheetFocusRef.current = {type: 'manager-add'};
  }, []);

  const commitSavedFilter = useCallback(
    (next: FilterDraft, filter: PowerSearchFilter) => {
      if (!isInteractive) {
        queueManagerAddFocus();
        setStep('manage');
        return;
      }
      if (next.mode === 'edit') {
        const filterIndex = resolveDraftFilterIndex(filters, next);
        const currentFilter =
          filterIndex == null ? undefined : filters[filterIndex];
        if (
          filterIndex == null ||
          currentFilter == null ||
          currentFilter.isReadOnly
        ) {
          // A controlled update removed the edited filter, or left two it
          // could be, or made it read-only: nothing is written, and focus
          // returns to the nearest row that is a button around where it was,
          // else Add filter.
          pendingSheetFocusRef.current =
            next.sourceFilter != null &&
            next.sourceSignature != null &&
            next.filterIndex != null
              ? {
                  type: 'manager-filter',
                  sourceFilter: next.sourceFilter,
                  sourceSignature: next.sourceSignature,
                  preferredIndex: next.filterIndex,
                }
              : {type: 'manager-add'};
          setStep('manage');
          return;
        }
        pendingSheetFocusRef.current = {
          type: 'manager-filter',
          sourceFilter: filter,
          sourceSignature: filterSignature(filter),
          preferredIndex: filterIndex,
        };
        const updated = [...filters];
        updated[filterIndex] = filter;
        onChange(updated, 'edit', filterIndex);
      } else {
        queueManagerAddFocus();
        onChange([...filters, filter], 'add', filters.length);
      }
      setStep('manage');
    },
    [filters, isInteractive, onChange, queueManagerAddFocus],
  );

  // Opening a new filter can come from a field row or a content-search
  // suggestion. The origin is kept so Cancel returns to the control the user
  // came from.
  const openCreateEditor = useCallback(
    (
      field: PowerSearchField,
      operator: PowerSearchOperator,
      returnFocus: 'field' | 'content-search' = 'field',
    ) => {
      setDraft({
        mode: 'create',
        returnStep: 'fields',
        returnFocus,
        field: field.key,
        operator: operator.key,
        value: operator.value.type === 'empty' ? {type: 'empty'} : undefined,
      });
      pendingSheetFocusRef.current = null;
      setStep('value');
    },
    [],
  );

  const handleFieldSelect = useCallback(
    (field: PowerSearchField) => {
      if (!isInteractive) {
        return;
      }
      const operators = field.operators.filter(isSupportedOperator);
      const preferred = config.getDefaultOperator(field.key);
      const operator =
        preferred && isSupportedOperator(preferred) ? preferred : operators[0];
      if (operator == null) {
        return;
      }
      openCreateEditor(field, operator);
    },
    [config, isInteractive, openCreateEditor],
  );

  const handleContentSuggestionSelect = useCallback(
    (item: MobilePowerSearchItem | null) => {
      if (!isInteractive || item?.auxiliaryData == null) {
        return;
      }
      const {fieldKey, filterValue, operatorKey} = item.auxiliaryData;
      const field = config.getField(fieldKey);
      const operator =
        operatorKey == null
          ? config.getDefaultOperator(fieldKey)
          : config.getOperator(fieldKey, operatorKey);
      if (field == null || operator == null || !isSupportedOperator(operator)) {
        return;
      }
      setContentQuery('');
      if (filterValue != null) {
        const nextFilter: PowerSearchFilter = {
          field: field.key,
          operator: operator.key,
          value: filterValue,
        };
        pendingSheetFocusRef.current = {
          type: 'manager-filter',
          sourceFilter: nextFilter,
          sourceSignature: filterSignature(nextFilter),
          preferredIndex: filters.length,
        };
        pendingMutationFocusRef.current = true;
        onChange([...filters, nextFilter], 'add', filters.length);
        // Spoken once the Filters sheet is the open dialog, so it lands there
        // rather than in the Add filter dialog about to be replaced.
        pendingAnnouncementRef.current = t('@astryx.tokenizer.tokenAdded', {
          label: item.label,
        });
        setStep('manage');
        return;
      }
      openCreateEditor(field, operator, 'content-search');
    },
    [config, filters, isInteractive, onChange, openCreateEditor, t],
  );

  const handleFilterEdit = useCallback(
    (index: number) => {
      const filter = filters[index];
      if (!isInteractive || filter == null || filter.isReadOnly) {
        return;
      }
      setDraft({
        mode: 'edit',
        filterIndex: index,
        sourceFilter: filter,
        sourceSignature: filterSignature(filter),
        field: filter.field,
        operator: filter.operator,
        value: filter.value,
      });
      pendingSheetFocusRef.current = null;
      setStep('value');
    },
    [filters, isInteractive],
  );

  // A filter as its Filters row reads it: the field's label when the field
  // remains, the raw key for what the config no longer has, and the value as
  // the token shows it.
  const describeFilterParts = useCallback(
    (filter: PowerSearchFilter): {label: string; value: string | null} => {
      const field = config.getField(filter.field);
      const operator = config.getOperator(filter.field, filter.operator);
      const fieldLabel = field?.label ?? filter.field;
      const operatorLabel =
        operator == null ? filter.operator : resolveOperatorLabel(operator, t);
      const label = [fieldLabel, operatorLabel].filter(Boolean).join(' ');
      if (operator == null) {
        return {label, value: null};
      }
      const value = formatValueText(
        config,
        operator,
        filter,
        Number.MAX_SAFE_INTEGER,
        t,
        locale,
        timezoneID,
      );
      return {label, value: value || null};
    },
    [config, locale, t, timezoneID],
  );
  const describeFilter = useCallback(
    (filter: PowerSearchFilter): string => {
      const parts = describeFilterParts(filter);
      return parts.value ? `${parts.label} ${parts.value}` : parts.label;
    },
    [describeFilterParts],
  );

  const handleRemoveFilter = useCallback(
    (index: number) => {
      const filter = filters[index];
      if (!isInteractive || filter == null || filter.isReadOnly) {
        return;
      }
      const nextFilters = filters.filter((_, i) => i !== index);
      const nextIndex = nearestEditableIndex(nextFilters, index, isRowButton);
      if (nextIndex == null) {
        pendingSheetFocusRef.current = {type: 'manager-add'};
      } else {
        const nextFilter = nextFilters[nextIndex];
        pendingSheetFocusRef.current = {
          type: 'manager-filter',
          sourceFilter: nextFilter,
          sourceSignature: filterSignature(nextFilter),
          preferredIndex: nextIndex,
        };
      }
      pendingMutationFocusRef.current = true;
      onChange(nextFilters, 'remove', index);
      // The Core token's × announces the same phrase; spoken once the Filters
      // sheet is the open dialog.
      pendingAnnouncementRef.current = t('@astryx.tokenizer.tokenRemoved', {
        label: describeFilter(filter),
      });
    },
    [describeFilter, filters, isInteractive, isRowButton, onChange, t],
  );

  // Clear all keeps the Core PowerSearch semantics (DEC-3): every filter
  // goes, read-only ones included, reported as a `remove` at the last index —
  // the change the Core field's clear control commits.
  const handleClearAll = useCallback(() => {
    if (filters.length === 0) {
      return;
    }
    onChange([], 'remove', filters.length - 1);
    // Clear all closes the flow. The Filters dialog stays modal through its
    // exit, hiding both its own region and the page-body channel, so the
    // outcome is spoken once the dialog has gone and focus is back on the
    // trigger.
    afterCloseRef.current.isCleared = true;
    closeSheet();
  }, [closeSheet, filters, onChange]);

  const handleOperatorSelect = useCallback((operator: PowerSearchOperator) => {
    setDraft(current => {
      if (current == null) {
        return current;
      }
      // A value survives an operator change only when the new operator
      // reads the same value type.
      const keepsValue =
        current.value != null && current.value.type === operator.value.type;
      return {
        ...current,
        operator: operator.key,
        value:
          operator.value.type === 'empty'
            ? {type: 'empty'}
            : keepsValue
              ? current.value
              : undefined,
      };
    });
  }, []);

  const handleDraftValueChange = useCallback((value: FilterValue) => {
    setDraft(current => (current == null ? current : {...current, value}));
  }, []);

  const handleSave = useCallback(() => {
    if (draft?.value == null || draft.operator == null) {
      return;
    }
    commitSavedFilter(draft, {
      field: draft.field,
      operator: draft.operator,
      value: draft.value,
    });
  }, [commitSavedFilter, draft]);

  const returnFromValue = useCallback(() => {
    if (draft == null) {
      queueManagerAddFocus();
      setStep('manage');
      return;
    }
    if (
      draft.mode === 'edit' &&
      draft.sourceFilter != null &&
      draft.sourceSignature != null &&
      draft.filterIndex != null
    ) {
      pendingSheetFocusRef.current = {
        type: 'manager-filter',
        sourceFilter: draft.sourceFilter,
        sourceSignature: draft.sourceSignature,
        preferredIndex:
          resolveDraftFilterIndex(filters, draft) ?? draft.filterIndex,
      };
      setStep('manage');
      return;
    }
    if (draft.returnFocus === 'content-search') {
      pendingSheetFocusRef.current = {type: 'content-search'};
      setStep('fields');
      return;
    }
    pendingSheetFocusRef.current = {type: 'field', fieldKey: draft.field};
    setStep('fields');
  }, [draft, filters, queueManagerAddFocus]);

  const handleRemove = useCallback(() => {
    if (draft?.mode !== 'edit') {
      return;
    }
    const filterIndex = resolveDraftFilterIndex(filters, draft);
    if (filterIndex == null || filters[filterIndex]?.isReadOnly) {
      queueManagerAddFocus();
      setStep('manage');
      return;
    }
    handleRemoveFilter(filterIndex);
    setStep('manage');
  }, [draft, filters, handleRemoveFilter, queueManagerAddFocus]);

  // Each step sheet is controlled by `step`; a sheet only ever asks to close
  // (a dismissal its `purpose` allows: Escape, the scrim, a swipe), and only
  // the current step's request ends the flow. Every step change goes through
  // the handlers above.
  const handleStepOpenChange = useCallback(
    (sheetStep: SheetStep, isOpen: boolean) => {
      if (!isOpen && stepRef.current === sheetStep) {
        setStep(null);
      }
    },
    [],
  );
  const handleManageOpenChange = useCallback(
    (isOpen: boolean) => handleStepOpenChange('manage', isOpen),
    [handleStepOpenChange],
  );
  const handleFieldsOpenChange = useCallback(
    (isOpen: boolean) => handleStepOpenChange('fields', isOpen),
    [handleStepOpenChange],
  );
  const handleValueOpenChange = useCallback(
    (isOpen: boolean) => handleStepOpenChange('value', isOpen),
    [handleStepOpenChange],
  );

  const handleFocusWithin = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      // The flow returns focus to the trigger only after its exit completes:
      // the dialogs have closed and the page-body channel is exposed again.
      // One announcement — two in one tick would replace each other in the
      // single polite region.
      if (step == null) {
        const {isCleared, resultCount} = afterCloseRef.current;
        afterCloseRef.current = {isCleared: false, resultCount: null};
        if (isCleared && resultCount != null) {
          announceOnPage(`All filters removed. ${resultCount}`);
        } else if (isCleared) {
          announceOnPage('All filters removed');
        } else if (resultCount != null) {
          announceOnPage(resultCount);
        }
      }
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        onFocus?.(event);
      }
    },
    [announceOnPage, onFocus, step],
  );
  const handleBlurWithin = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        onBlur?.(event);
      }
    },
    [onBlur],
  );

  // ------------------------------------------------------------- imperative --

  useImperativeHandle(handleRef, () => ({
    focusTypeahead() {
      triggerRef.current?.focus();
    },
    blurTypeahead() {
      triggerRef.current?.blur();
    },
  }));

  // ----------------------------------------------------------- result count --

  const resultCountText = useMemo((): string | null => {
    if (resultCount == null) {
      return null;
    }
    if (typeof resultCount === 'number') {
      return t('@astryx.powersearch.resultCount', {count: resultCount});
    }
    return resultCount;
  }, [resultCount, t]);

  // This Effect synchronizes a polite live region with the result count
  // through `announce`, which routes by where the field is: into the open
  // sheet's dialog while a step is open (its `SheetAnnouncer`), else by the
  // field's own `useAnnounce` — a Dialog or modal Drawer that holds the
  // field, or the shared page-body channel (spec AST-086 FR14). A count
  // present on mount is not announced unprompted, and the guard compares
  // against the last announced text rather than a mounted flag, so
  // StrictMode's effect replay announces nothing either. The announcement
  // acquires no resource, so there is no cleanup.
  const announcedResultCountRef = useRef(resultCountText);
  useEffect(() => {
    if (resultCountText === announcedResultCountRef.current) {
      return;
    }
    announcedResultCountRef.current = resultCountText;
    if (resultCountText == null) {
      return;
    }
    // A change that lands while the flow is closing — Clear all's, whose
    // commit also ends the flow — waits for the trigger focus with the other
    // after-close messages, since the dialog is still modal through its exit.
    if (stepRef.current == null && afterCloseRef.current.isCleared) {
      afterCloseRef.current.resultCount = resultCountText;
      return;
    }
    announce(resultCountText);
  }, [resultCountText, announce]);

  // --------------------------------------------------------------- tooltip --

  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });
  const mergedWrapperRef = useMergedRefs(
    wrapperRef,
    disabledMessageTooltip.ref,
  );

  const triggerDescribedBy =
    [
      status?.message ? statusMessageId : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  // ---------------------------------------------------------------- render --

  // Rows and tokens are keyed by filter identity, not position: a parent's
  // reorder or a removal above the focused row then moves elements instead
  // of remounting them, and focus stays on the same filter. Only a filter
  // that is itself removed loses its element, and the re-home effect above
  // takes over. Every filter lists — one whose field or operator the config
  // no longer has by its raw keys, as its token shows on the trigger; its row
  // opens the unavailable state, whose Remove is the way out.
  const [filterIdentities] = useState(createFilterIdentities);
  const filterIds = filterIdentities.next(filters);
  const filterRows = filters.map((filter, index) => {
    const {label, value} = describeFilterParts(filter);
    const displayLabel = value ? (
      <>
        {label} <span {...stylex.props(styles.rowValue)}>{value}</span>
      </>
    ) : (
      label
    );
    return {
      displayLabel,
      filter,
      index,
      isEditable: isRowButton(filter),
      key: `filter-${filterIds[index]}`,
    };
  });

  const tokens = filters.map((filter, index) => {
    const field = config.getField(filter.field);
    const operator = config.getOperator(filter.field, filter.operator);
    const key = `filter-${filterIds[index]}`;
    const TokenOverride =
      field != null && operator != null
        ? componentOverrides?.[operator.value.type]?.Token
        : undefined;
    if (TokenOverride && field != null && operator != null) {
      return (
        <TokenOverride
          key={key}
          config={configProp}
          filter={filter}
          field={field}
          operator={operator}
          maxLength={maxTokenLength}
          onClick={undefined}
          onRemove={undefined}
          isDisabled={isDisabled}
        />
      );
    }
    return (
      <MobilePowerSearchToken
        key={key}
        config={config}
        filter={filter}
        field={field}
        operator={operator}
        maxLength={maxTokenLength}
        size={size}
        isDisabled={isDisabled}
        timezoneID={timezoneID}
      />
    );
  });

  const isClearAllShown = hasClear && isInteractive && filters.length > 0;

  const EditorOverride =
    draftOperator != null
      ? componentOverrides?.[draftOperator.value.type]?.Editor
      : undefined;

  const draftOperatorLabel =
    draftOperator == null ? '' : resolveOperatorLabel(draftOperator, t);
  // The title — the dialog's name — reads the field and operator as the
  // Filters row does: by their labels, or, for a filter whose field or
  // operator the config no longer has, by the raw keys the row shows.
  const editorTitle =
    draft == null
      ? 'Add filter'
      : draftField == null || (draftOperator == null && draft.operator != null)
        ? [
            draftField?.label ?? draft.field,
            draftOperatorLabel !== '' ? draftOperatorLabel : draft.operator,
          ]
            .filter(Boolean)
            .join(' ')
        : draftOperators.length <= 1 && draftOperatorLabel !== ''
          ? `${draftField.label} ${draftOperatorLabel}`
          : draftField.label;
  const saveButtonLabel =
    popoverSaveButtonLabel ?? (draft?.mode === 'edit' ? 'Apply' : 'Add filter');

  // Every sheet body: padded, and publishing that padding to its lists.
  const bodyProps = stylex.props(
    styles.body,
    containerPaddingInlineVarStyles[4],
  );

  const isEditorDisabled = isDisabled || isReadOnly;
  const isSaveDisabled =
    isEditorDisabled || draft?.operator == null || draft.value == null;
  const isDraftRenderable =
    draft != null && draftField != null && draftOperator != null;
  // A controlled config update that removes the field or operator being
  // edited replaces the step's body with the unavailable state while focus
  // may be on one of the body's controls, which unmount without a blur. Focus
  // then moves to the way out — Remove, or Cancel when there is no Remove —
  // so it never falls to the page body inside the open sheet. The message
  // itself is announced by its rendered element.
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const wasDraftRenderableRef = useRef(isDraftRenderable);
  useLayoutEffect(() => {
    const becameUnavailable =
      wasDraftRenderableRef.current && !isDraftRenderable && draft != null;
    wasDraftRenderableRef.current = isDraftRenderable;
    if (!becameUnavailable || step !== 'value') {
      return;
    }
    const active = document.activeElement;
    const dialog = cancelButtonRef.current?.closest('dialog');
    if (dialog != null && active != null && dialog.contains(active)) {
      return;
    }
    (removeButtonRef.current ?? cancelButtonRef.current)?.focus();
  }, [draft, isDraftRenderable, step]);

  return (
    <>
      <Field
        ref={ref}
        label={triggerLabel}
        labelID={triggerLabelId}
        isLabelHidden={isLabelHidden}
        inputID={triggerId}
        isDisabled={isDisabled}
        status={
          status
            ? {
                type: status.type,
                message: status.message,
                messageID: status.message ? statusMessageId : undefined,
              }
            : undefined
        }
        statusVariant={statusVariant}
        xstyle={xstyle}
        className={className}
        style={style}>
        <div
          ref={mergedWrapperRef}
          onClick={handleWrapperClick}
          onFocus={handleFocusWithin}
          onBlur={handleBlurWithin}
          data-testid={testId}
          aria-disabled={isDisabled ? true : undefined}
          {...stylex.props(
            inputWrapperStyles.base,
            styles.wrapper,
            filters.length > 0 && styles.wrapperWithTokens,
            sizeStyles[size],
            isDisabled && inputWrapperStyles.disabled,
            status && inputStatusBorderStyles[status.type],
            status && !isDisabled && inputStatusHoverShadowStyles[status.type],
            status && inputStatusFocusWithinStyles[status.type],
          )}>
          {/* The trigger's name is the label plus everything visible here:
              the placeholder, or the tokens, so speech input can say what it
              sees and assistive technology hears the selected filters
              (WCAG 2.5.3). */}
          <div id={triggerContentId} {...stylex.props(styles.contentSection)}>
            {startIcon && (
              <span
                {...stylex.props(
                  filters.length > 0 && styles.startIconWithTokens,
                )}>
                {renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
              </span>
            )}
            {tokens}
            <button
              type="button"
              id={triggerId}
              ref={triggerRef}
              autoFocus={hasAutoFocus}
              onClick={openManager}
              // Never natively `disabled`: the trigger stays focusable, so it
              // can take focus back when a flow closes because the field
              // became disabled, and so a disabled reason can be read from
              // it; `openManager` refuses to open while disabled.
              aria-disabled={isDisabled ? true : undefined}
              aria-haspopup="dialog"
              aria-expanded={step != null}
              aria-labelledby={`${triggerLabelId} ${triggerContentId}`}
              aria-describedby={triggerDescribedBy}
              {...stylex.props(
                styles.trigger,
                filters.length > 0 && styles.triggerWithTokens,
              )}>
              {filters.length === 0 ? fieldPlaceholder : null}
            </button>
          </div>
          {(endContent || isRenderable(resultCountText)) && (
            <div ref={endLaneRef} {...stylex.props(styles.endSection)}>
              {isRenderable(resultCountText) && (
                <span {...stylex.props(styles.resultCount)}>
                  {resultCountText}
                </span>
              )}
              {endContent}
            </div>
          )}
        </div>
        {showsDisabledMessage &&
          disabledMessageTooltip.renderTooltip(disabledMessage)}
      </Field>

      <BottomSheet
        isOpen={step === 'manage'}
        onOpenChange={handleManageOpenChange}
        finalFocusRef={triggerRef}
        label="Filters"
        height="tall"
        padding={0}>
        <div
          ref={manageSheetRef}
          onFocus={noteSheetFocus('manage')}
          {...stylex.props(styles.sheet)}>
          {step === 'manage' && (
            <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
          )}
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.headerRow)}>
              <div {...stylex.props(styles.headerText)}>
                <Heading level={3}>Filters</Heading>
              </div>
              {isInteractive && (
                <Button
                  ref={managerAddButtonRef}
                  label="Add filter"
                  variant="ghost"
                  xstyle={styles.touchAction}
                  onClick={openFieldList}
                />
              )}
            </div>
          </div>
          <div {...bodyProps}>
            {filterRows.length === 0 ? (
              <div {...stylex.props(styles.empty)}>
                <Text type="supporting" color="secondary">
                  No filters selected
                </Text>
              </div>
            ) : (
              <List hasDividers density="spacious" edge="bleed">
                {filterRows.map(row => {
                  const canEdit = row.isEditable;
                  return (
                    <ListItem
                      key={row.key}
                      ref={node => {
                        if (node == null) {
                          managerRowsRef.current.delete(row.index);
                        } else {
                          managerRowsRef.current.set(row.index, node);
                        }
                      }}
                      label={row.displayLabel}
                      onClick={
                        canEdit ? () => handleFilterEdit(row.index) : undefined
                      }
                      endContent={
                        canEdit ? (
                          <Icon
                            icon="chevronRight"
                            size="sm"
                            color="secondary"
                            xstyle={rtlStyles.mirror}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </List>
            )}
          </div>
          <div {...stylex.props(styles.footer)}>
            {isClearAllShown && (
              <Button
                label="Clear all"
                variant="ghost"
                xstyle={styles.touchAction}
                onClick={handleClearAll}
              />
            )}
            <div
              {...stylex.props(
                styles.footerActions,
                !isClearAllShown && styles.footerSoleAction,
              )}>
              <Button
                label="Done"
                variant="primary"
                xstyle={styles.touchAction}
                onClick={closeSheet}
                width={isClearAllShown ? undefined : '100%'}
              />
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={step === 'fields'}
        onOpenChange={handleFieldsOpenChange}
        finalFocusRef={triggerRef}
        label="Add filter"
        height="tall"
        padding={0}>
        <div
          ref={fieldsSheetRef}
          onFocus={noteSheetFocus('fields')}
          {...stylex.props(styles.sheet)}>
          {step === 'fields' && (
            <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
          )}
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.headerRow)}>
              <Button
                label="Back"
                icon={
                  <Icon
                    icon="chevronLeft"
                    size="sm"
                    xstyle={rtlStyles.mirror}
                  />
                }
                isIconOnly
                variant="ghost"
                size="sm"
                xstyle={styles.touchIconAction}
                onClick={() => {
                  if (fieldPickerOriginRef.current === 'trigger') {
                    closeSheet();
                    return;
                  }
                  queueManagerAddFocus();
                  setStep('manage');
                }}
              />
              <div {...stylex.props(styles.headerText)}>
                <Heading level={3}>Add filter</Heading>
              </div>
            </div>
            {hasContentSearch ? (
              <div ref={contentSearchRef}>
                <TextInput
                  label="Search"
                  isLabelHidden
                  role="searchbox"
                  aria-controls={contentResultsId}
                  value={contentQuery}
                  onChange={setContentQuery}
                  onKeyDown={event => {
                    if (isImeKeyEvent(event.nativeEvent)) {
                      return;
                    }
                    if (event.key === 'Enter' && contentResults[0] != null) {
                      event.preventDefault();
                      handleContentSuggestionSelect(contentResults[0]);
                      return;
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      contentSuggestionListRef.current
                        ?.querySelector<HTMLButtonElement>('button')
                        ?.focus();
                    }
                  }}
                  placeholder={contentSearchPlaceholder}
                  hasClear
                  startIcon={<Icon icon="search" size="sm" color="secondary" />}
                  isDisabled={!isInteractive}
                  width="100%"
                />
              </div>
            ) : isFieldSearchShown ? (
              <TextInput
                label="Search filters"
                isLabelHidden
                placeholder="Search filters…"
                value={fieldQuery}
                onChange={setFieldQuery}
                startIcon={<Icon icon="search" size="sm" color="secondary" />}
                isDisabled={!isInteractive}
                width="100%"
              />
            ) : null}
          </div>
          <div {...bodyProps}>
            {hasContentSearch ? (
              contentResults.length > 0 ? (
                <List
                  ref={contentSuggestionListRef}
                  id={contentResultsId}
                  aria-label="Search results"
                  hasDividers
                  density="spacious"
                  edge="bleed">
                  {contentResults.map((item, index) => (
                    <ListItem
                      key={item.id}
                      label={item.label}
                      isDisabled={!isInteractive}
                      onClick={() => handleContentSuggestionSelect(item)}
                      onKeyDown={event => {
                        if (
                          isImeKeyEvent(event.nativeEvent) ||
                          (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
                        ) {
                          return;
                        }
                        event.preventDefault();
                        const buttons = [
                          ...(contentSuggestionListRef.current?.querySelectorAll<HTMLButtonElement>(
                            'button',
                          ) ?? []),
                        ];
                        const nextIndex =
                          event.key === 'ArrowDown'
                            ? Math.min(index + 1, buttons.length - 1)
                            : index - 1;
                        if (nextIndex < 0) {
                          contentSearchRef.current
                            ?.querySelector<HTMLInputElement>('input')
                            ?.focus();
                        } else {
                          buttons[nextIndex]?.focus();
                        }
                      }}
                    />
                  ))}
                </List>
              ) : contentQuery.trim() !== '' ? (
                // The searchbox's `aria-controls` target while nothing lists:
                // the empty-result message carries the results id.
                <SheetEmptyMessage
                  id={contentResultsId}
                  message="No results found"
                  occasion={contentQuery}
                />
              ) : (
                // An empty query with no bootstrap suggestion: the results
                // region exists, empty, so `aria-controls` always names an
                // element in the document.
                <div id={contentResultsId} />
              )
            ) : groupedFields.length === 0 ? (
              // A search outcome: only a non-empty query that matches nothing
              // shows it; a config with no field lists nothing.
              normalizedFieldQuery !== '' && (
                <SheetEmptyMessage
                  message="No filters match your search"
                  occasion={fieldQuery}
                />
              )
            ) : (
              groupedFields.map(([group, groupFields]) => (
                <List
                  key={group}
                  hasDividers
                  density="spacious"
                  header={group === '' ? undefined : group}
                  edge="bleed">
                  {groupFields.map(field => (
                    <ListItem
                      key={field.key}
                      ref={node => {
                        if (node == null) {
                          fieldRowsRef.current.delete(field.key);
                        } else {
                          fieldRowsRef.current.set(field.key, node);
                        }
                      }}
                      label={field.label}
                      isDisabled={!isInteractive}
                      startContent={field.icon}
                      endContent={
                        <Icon
                          icon="chevronRight"
                          size="sm"
                          color="secondary"
                          xstyle={rtlStyles.mirror}
                        />
                      }
                      onClick={() => handleFieldSelect(field)}
                    />
                  ))}
                </List>
              ))
            )}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={step === 'value'}
        onOpenChange={handleValueOpenChange}
        finalFocusRef={triggerRef}
        label={editorTitle}
        height="tall"
        padding={0}
        purpose="form">
        <div {...stylex.props(styles.sheet)}>
          {step === 'value' && (
            <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
          )}
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.headerRow)}>
              <div {...stylex.props(styles.headerText)}>
                <Heading level={3} maxLines={1}>
                  {editorTitle}
                </Heading>
              </div>
            </div>
          </div>
          {isDraftRenderable && EditorOverride != null ? (
            <div {...bodyProps}>
              <EditorOverride
                key={`${draft.mode}-${draft.filterIndex ?? 'new'}-${draft.field}`}
                config={configProp}
                filter={{
                  field: draft.field,
                  operator: draft.operator,
                  value: draft.value,
                }}
                mode={draft.mode}
                onSave={saved => {
                  if (saved == null) {
                    if (draft.mode === 'edit') {
                      handleRemove();
                    } else {
                      queueManagerAddFocus();
                      setStep('manage');
                    }
                    return;
                  }
                  commitSavedFilter(draft, saved);
                }}
                onCancel={returnFromValue}
                saveButtonLabel={saveButtonLabel}
                isReadOnly={isEditorDisabled}
                timezoneID={timezoneID}
              />
            </div>
          ) : (
            <>
              <div {...bodyProps}>
                {isDraftRenderable ? (
                  <>
                    {draftOperators.length > 1 && (
                      <RadioList
                        label="Operator"
                        isLabelHidden
                        value={draft.operator ?? ''}
                        onChange={operatorKey => {
                          const operator = draftOperators.find(
                            candidate => candidate.key === operatorKey,
                          );
                          if (operator != null) {
                            handleOperatorSelect(operator);
                          }
                        }}
                        isDisabled={isEditorDisabled}>
                        {draftOperators.map(operator => (
                          <RadioListItem
                            key={operator.key}
                            label={`${draftField.label} ${resolveOperatorLabel(operator, t)}`}
                            value={operator.key}
                          />
                        ))}
                      </RadioList>
                    )}
                    <MobilePowerSearchValueEditor
                      key={`${draft.field}-${draft.operator}`}
                      operatorValue={draftOperator.value}
                      filterValue={draft.value}
                      onChange={handleDraftValueChange}
                      label={draftField.label}
                      isDisabled={isEditorDisabled}
                      maxMenuItems={maxOperatorMenuItems}
                    />
                  </>
                ) : (
                  // A controlled config update removed the field or operator
                  // being edited: say so and keep a way out.
                  draft != null && (
                    <SheetEmptyMessage
                      message="This filter is no longer available"
                      occasion={`${draft.field}-${draft.operator ?? ''}`}
                    />
                  )
                )}
              </div>
              <div {...stylex.props(styles.footer)}>
                {draft?.mode === 'edit' && !isReadOnly && (
                  <Button
                    ref={removeButtonRef}
                    label="Remove"
                    variant="ghost"
                    isDisabled={isEditorDisabled}
                    xstyle={styles.touchAction}
                    onClick={handleRemove}
                  />
                )}
                <div
                  {...stylex.props(
                    styles.footerActions,
                    isReadOnly && styles.footerSoleAction,
                  )}>
                  <Button
                    ref={cancelButtonRef}
                    label="Cancel"
                    variant="ghost"
                    xstyle={styles.touchAction}
                    onClick={returnFromValue}
                    width={isReadOnly ? '100%' : undefined}
                  />
                  {!isReadOnly && isDraftRenderable && (
                    <Button
                      label={saveButtonLabel}
                      variant="primary"
                      isDisabled={isSaveDisabled}
                      xstyle={styles.touchAction}
                      onClick={handleSave}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

MobilePowerSearch.displayName = 'MobilePowerSearch';
