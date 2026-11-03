// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearchBottomSheet.tsx
 * @input The field's InternalConfig, filters, onChange, the field typeahead
 *   source, and the sheet options PowerSearch forwards; BottomSheet,
 *   Button, EmptyState, Heading, Icon, IconButton, Indicator, List,
 *   RadioList, Text, TextInput, PowerSearchValueEditor, the internal sheet
 *   confirmation and search-drag owners, i18n
 * @output Exports PowerSearchBottomSheet — the touch surface of
 *   `PowerSearch experimental.presentation="bottom-sheet"`: a Filters sheet
 *   with editable rows and trailing remove actions, Add filter in its fixed
 *   header and Clear all / Done in its fixed footer, an Add filter sheet with
 *   grouped field rows or the content search with inline suggestions, and a
 *   value step that stages field → operator → value and confirms from its
 *   footer
 * @position Internal presentation surface of PowerSearch. Loaded on demand by
 *   PowerSearch.tsx so the popover presentation never carries it. The
 *   trigger lives in PowerSearch.tsx.
 *
 * The three steps are sibling standalone BottomSheets that stack: each step
 * opens above the sheet that led to it, which stays open beneath as a covered
 * sheet, so no sheet needs a Back action. A dismissal closes only the top
 * sheet and reveals the step beneath; dismissing the bottom sheet ends the
 * flow. A list value's Tokenizer opens its own sheet above the value step, as
 * the top sheet of the stack.
 *
 * The sheets pad their own content (`padding={0}` on BottomSheet). The
 * Filters and Add filter sheets keep their header and footer fixed around a
 * scroll viewport that reaches the sheet edge; its content publishes the
 * padding as container padding so `edge="bleed"` lists run edge to edge with
 * row text on the header's inset. The sheets are pinned tall: the field list
 * resizes as it is searched and the editor changes with the operator, and
 * only a fully expanded tall sheet gives mobile-keyboard accommodation.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/PowerSearch.tsx (the trigger and the lazy host)
 * - /docs/specs/components/PowerSearch/PowerSearch.spec.md (FR10–FR21, AR4–AR6, PR5)
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Button} from '../Button/Button';
import {EmptyState} from '../EmptyState/EmptyState';
import {Heading} from '../Heading/Heading';
import {Icon} from '../Icon/Icon';
import {IconButton} from '../IconButton/IconButton';
import {CheckboxIndicator} from '../Indicator/CheckboxIndicator';
import {RadioIndicator} from '../Indicator/RadioIndicator';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {isRenderable} from '../utils/isRenderable';
import {containerPaddingInlineVarStyles} from '../Layout/padding.stylex';
import {List} from '../List/List';
import {ListItem} from '../List/ListItem';
import {RadioList} from '../RadioList/RadioList';
import {RadioListItem} from '../RadioList/RadioListItem';
import {Text} from '../Text/Text';
import {TextInput} from '../TextInput/TextInput';
import type {SearchSource} from '../Typeahead/types';
import {useAnnounce, type AnnounceFn} from '../hooks/useAnnounce';
import type {TranslatorFn} from '../i18n';
import {useListFormatter} from '../i18n/useListFormatter';
import {useLocale} from '../i18n/useLocale';
import {SheetConfirmation} from '../internal/SheetConfirmation';
import {useDismissSearchOnTouchDrag} from '../internal/useDismissSearchOnTouchDrag';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {isImeKeyEvent} from '../utils/ime';
import {rtlStyles} from '../utils/rtlStyles';
import {formatTokenValueText} from './formatTokenValue';

function resolveRelativeDateLabel(
  operatorValue: OperatorValue & {type: 'date_relative'},
  value: string,
  t: TranslatorFn,
  buildRelativeDateOptions: PowerSearchSheetEditors['buildRelativeDateOptions'],
): string {
  return (
    buildRelativeDateOptions(operatorValue, t).find(
      option => option.value === value,
    )?.label ?? value
  );
}

// A placeholder the Filters row formats `labelValue` with, then splits on, so
// the value segment can render bold inside the catalog's ordering. A private
// use code point: never part of a label or value.
const ROW_VALUE_SLOT = '\uE000';
import type {
  buildRelativeDateOptions,
  PowerSearchValueEditor,
} from './PowerSearchValueEditor';
import type {NestedEditor} from './PowerSearchEditPopover';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {useInternalListFocus} from '../hooks/useListFocus';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {groupItems} from '../utils/groupItems';
import {
  createSheetSuggestionSource,
  fieldMatchesQuery,
  createFilterIdentities,
  filterSignature,
  isSupportedOperator,
  nearestEditableIndex,
  resolveFilterIdentityIndex,
} from './powerSearchSheetUtils';
import {resolveOperatorLabel} from './resolveOperatorLabel';
import type {InternalConfig} from './useInternalConfig';
import type {
  FilterValue,
  OperatorValue,
  PartialFilter,
  PowerSearchChangeType,
  PowerSearchComponents,
  PowerSearchConfig,
  PowerSearchField,
  PowerSearchFilter,
  PowerSearchItem,
  PowerSearchOperator,
} from './types';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/PowerSearch/PowerSearchBottomSheet.generated';

registerEnglishFallback(english);

// =============================================================================
// Props
// =============================================================================

/**
 * The popover presentation's editors, which the value step reuses. They come
 * from PowerSearch.tsx, whose module graph already loads them for the popover
 * presentation. Imported here, they and every component they reach would join
 * this lazily imported graph, whose modules must import Core directly and
 * never through a barrel.
 */
export interface PowerSearchSheetEditors {
  NestedEditor: typeof NestedEditor;
  PowerSearchValueEditor: typeof PowerSearchValueEditor;
  buildRelativeDateOptions: typeof buildRelativeDateOptions;
}

export interface PowerSearchBottomSheetProps {
  /** Whether the flow is open; the trigger in PowerSearch.tsx owns it. */
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * The trigger: where focus returns when the flow closes, whichever step
   * closed it and however it opened (a tap on a token included).
   */
  finalFocusRef: RefObject<HTMLElement | null>;
  /**
   * The field's formatted result count, announced from inside the open
   * sheet's dialog when it changes while the flow is open. `useAnnounce`
   * routes a message by where its caller is, so the owner above the sheets
   * cannot reach the dialog's region.
   */
  resultCountText?: string | null;
  config: InternalConfig;
  /** The caller's config, handed to Editor overrides as they expect it. */
  configProp: PowerSearchConfig;
  filters: ReadonlyArray<PowerSearchFilter>;
  onChange: (
    filters: ReadonlyArray<PowerSearchFilter>,
    changeType: PowerSearchChangeType,
    index: number,
  ) => void;
  /** The field typeahead source; the content search lists its suggestions. */
  searchSource: SearchSource<PowerSearchItem>;
  /** Placeholder of the content search. */
  placeholder: string;
  isReadOnly: boolean;
  isDisabled: boolean;
  hasClear: boolean;
  maxOperatorMenuItems?: number;
  maxSearchResults: number;
  /** The caller's confirm label; the step picks a default per mode. */
  saveButtonLabel?: string;
  components?: PowerSearchComponents;
  editors: PowerSearchSheetEditors;
}

// =============================================================================
// Styles
// =============================================================================

// The trailing plus a field row shows when choosing it adds the filter at
// once, and the Add filter actions' glyph. Core's default icon set has no plus.
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

const styles = stylex.create({
  // 44px touch targets for every sheet action, without resizing inputs.
  touchAction: {
    minHeight: 44,
  },
  // A sheet action drawn smaller than 44px keeps its drawn size and grows
  // only its hit area to 44px, under a coarse pointer. The custom properties
  // carry the media condition because StyleX allows plain values inside a
  // pseudo-element. On a fine pointer the overlay is not generated, so it
  // never takes hover from the action's own content.
  touchHitArea: {
    '--_power-search-sheet-hit-inset': {
      default: '0px',
      '@media (pointer: coarse)': 'min(0px, calc((100% - 44px) / 2))',
    },
    '--_power-search-sheet-hit-content': {
      default: 'none',
      '@media (pointer: coarse)': '""',
    },
    '::after': {
      content: 'var(--_power-search-sheet-hit-content)',
      position: 'absolute',
      inset: 'var(--_power-search-sheet-hit-inset)',
    },
  },
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
  // The Filters and Add filter sheets fill the panel and scroll only their
  // viewport, so the header and footer stay fixed.
  sheetWithFixedFooter: {
    height: '100%',
    overflow: 'hidden',
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
  // row text, group headings and the sheet title share one edge.
  body: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-4'],
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockEnd: spacingVars['--spacing-4'],
  },
  // The viewport reaches the sheet edge, so its scrollbar does too; the
  // content inside it carries the body's padding.
  scrollViewport: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehaviorY: 'contain',
  },
  scrollContent: {
    minHeight: '100%',
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
  fixedFooter: {
    position: 'relative',
    insetBlockEnd: 'auto',
    flexShrink: 0,
  },
  footerEqualAction: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 44,
  },
  footerSoleAction: {
    flexGrow: 1,
  },
  empty: {
    paddingBlock: spacingVars['--spacing-6'],
    textAlign: 'center',
  },
  emptyState: {
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // With more than one section in the value step, each section is a muted
  // container. Its inline padding is published as container padding, so
  // choice rows run edge to edge inside the section.
  controlSection: {
    padding: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-muted'],
  },
  // The operator radios put their indicator at the row's end, as the choice
  // rows do.
  trailingControlRow: {
    flexDirection: 'row-reverse',
  },
  // The built-in nested editor's sub-filter rows collapse from one line to
  // wrapped lines under a container query on the popover's own container;
  // the sheet renders no such container, so the editor's tree root is the
  // query container here, and at phone widths the rows wrap instead of
  // running past the sheet's edge.
  nestedEditorContainer: {
    containerType: 'inline-size',
    overflow: 'hidden',
  },
  rowValue: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
  // Choice rows run edge to edge on the inset of the surface that holds them,
  // the body or a muted section, with no dividers: the group reaches into
  // that padding and each row pads back out to it.
  choiceList: {
    display: 'flex',
    flexDirection: 'column',
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    width:
      'calc(100% + var(--container-padding-inline-start, 0px) + var(--container-padding-inline-end, 0px))',
  },
  choiceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-3'],
    paddingInlineStart: 'var(--container-padding-inline-start, 0px)',
    paddingInlineEnd: 'var(--container-padding-inline-end, 0px)',
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    fontFamily: 'inherit',
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is([aria-disabled="true"])': 'default',
    },
  },
  // An aria-disabled row gets no system disabled paint in forced colors;
  // GrayText is the platform's disabled affordance there.
  choiceRowDisabled: {
    color: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  choiceIcon: {
    display: 'inline-flex',
    flexShrink: 0,
  },
  choiceLabel: {
    flexGrow: 1,
    minWidth: 0,
  },
  editorInput: {
    paddingBlockStart: spacingVars['--spacing-1'],
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
      /**
       * After a removal, focus goes to the row's trailing remove action, so a
       * run of removals needs no re-aiming; otherwise to the row.
       */
      readonly part?: 'remove';
    }
  | {readonly type: 'field'; readonly fieldKey: string};

interface FilterDraft {
  readonly mode: 'create' | 'edit';
  /**
   * Counts the value steps opened in this flow. Part of the editor's `key`:
   * the step's sheet stays mounted between openings, and an editor that
   * reads its filter on mount (the built-in nested editor, a caller's
   * override) must remount per opened filter, not per field and operator —
   * two groups on one field would otherwise share one editor's state.
   */
  readonly generation: number;
  /** Control within the Add filter sheet that launched this draft. */
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
// Empty-query browsing keeps the popover presentation's safety ceiling.
const MAX_BROWSE_MENU_ITEMS = 1000;

// =============================================================================
// Choice rows (enum, enum_list, date_relative)
// =============================================================================

/**
 * Rendered inside a step's BottomSheet so that `useAnnounce` resolves the
 * sheet's dialog as the enclosing modal; publishes that
 * dialog's `announce` to the flow above through `onAnnounceChange` while
 * mounted. Renders nothing.
 */
function SheetAnnouncer({
  onAnnounceChange,
}: {
  onAnnounceChange: (announce: AnnounceFn | null) => void;
}) {
  const announce = useAnnounce();
  // Hands this dialog's announce function up; the cleanup withdraws it when
  // the step changes or the flow closes.
  useEffect(() => {
    onAnnounceChange(announce);
    return () => {
      onAnnounceChange(null);
    };
  }, [announce, onAnnounceChange]);
  return null;
}

/**
 * The value step's "This filter is no longer available" message, rendered
 * inside the step's dialog. The shared own-content module reads the rendered
 * text and speaks it once per opened filter while the step is the open one.
 * Called from inside the sheet's dialog, `useAnnounce` routes it into the
 * dialog. The message is plain text, not an EmptyState, so nothing announces
 * it a second time.
 */
function SheetEmptyMessage({
  id,
  message,
  occasion,
  isShown,
}: {
  id?: string;
  message: string;
  occasion: string;
  /**
   * Whether the message's step is the open one. A sheet beneath another, or
   * closed with its body retained, speaks nothing, and the hook re-arms so
   * the same occasion is spoken again when the step reopens on it.
   */
  isShown: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useAnnounceRenderedText(ref, isShown, occasion);
  return (
    <div ref={ref} id={id} {...stylex.props(styles.empty)}>
      <Text type="supporting" color="secondary">
        {message}
      </Text>
    </div>
  );
}

interface ChoiceItem {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

// A radio group's one tab stop: the checked row, else the first.
function radioTabStopOrder(list: HTMLElement): ReadonlyArray<HTMLElement> {
  const rows = Array.from(list.querySelectorAll<HTMLElement>('[role="radio"]'));
  const checked = rows.find(row => row.getAttribute('aria-checked') === 'true');
  return checked == null
    ? rows
    : [checked, ...rows.filter(row => row !== checked)];
}

/**
 * Closed vocabularies render as full-width rows with a trailing check instead
 * of the popover presentation's Selector or Tokenizer: a dropdown layer inside
 * a sheet stacks a second overlay on a surface the person is already inside.
 */
function ChoiceRows({
  items,
  selected,
  isDisabled,
  isMultiple,
  label,
  onToggle,
}: {
  items: ReadonlyArray<ChoiceItem>;
  selected: ReadonlySet<string>;
  isDisabled?: boolean;
  /** `enum_list`: checkbox rows that toggle. Otherwise radio rows. */
  isMultiple: boolean;
  /** The group's accessible name: the field label. */
  label: string;
  onToggle: (value: string, isSelected: boolean) => void;
}) {
  // The rows carry their state as state, not as a name suffix: `radio` rows
  // in a `radiogroup` for a single choice, `checkbox` rows in a `group` for
  // `enum_list`, each with `aria-checked`, as the Tokenizer's sheet rows do.
  // Disabled rows stay focusable with `aria-disabled`.
  //
  // Keyboard: a radio group is one tab stop — the checked row, else the
  // first — and the arrow keys move focus and check the row they land on,
  // wrapping; Home and End move to and check the first and last row. The
  // shared list focus owns the tab stop and the moves; a row that takes focus
  // from an arrow, Home or End is checked here. Space and Enter check the
  // focused radio row and toggle a checkbox row: each row is a native
  // `button`, whose activation fires `onClick` for both keys. A checkbox row
  // is its own tab stop.
  const isKeyMoveRef = useRef(false);
  const {listRef, handleKeyDown, handleFocus} =
    useInternalListFocus<HTMLDivElement>({
      itemSelector: '[role="radio"]',
      orientation: 'both',
      hasRovingTabIndex: !isMultiple,
      tabStopOrder: radioTabStopOrder,
    });
  const handleRadioKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    isKeyMoveRef.current = true;
    try {
      handleKeyDown(event);
    } finally {
      isKeyMoveRef.current = false;
    }
  };
  const handleRadioFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    handleFocus(event);
    if (!isKeyMoveRef.current || isDisabled) {
      return;
    }
    const value = (event.target as HTMLElement).closest<HTMLElement>(
      '[role="radio"]',
    )?.dataset.value;
    if (value != null && !selected.has(value)) {
      onToggle(value, false);
    }
  };
  return (
    <div
      ref={listRef}
      role={isMultiple ? 'group' : 'radiogroup'}
      aria-label={label}
      onKeyDown={isMultiple ? undefined : handleRadioKeyDown}
      onFocus={isMultiple ? undefined : handleRadioFocus}
      {...stylex.props(styles.choiceList)}>
      {items.map(item => {
        const isSelected = selected.has(item.value);
        return (
          <button
            key={item.value}
            type="button"
            role={isMultiple ? 'checkbox' : 'radio'}
            aria-checked={isSelected}
            aria-disabled={isDisabled || undefined}
            data-value={item.value}
            onClick={() => {
              if (!isDisabled) {
                onToggle(item.value, isSelected);
              }
            }}
            {...stylex.props(
              focusOutlineStyles.focusVisible,
              styles.choiceRow,
              isDisabled && styles.choiceRowDisabled,
            )}>
            {isRenderable(item.icon) && (
              <span aria-hidden="true" {...stylex.props(styles.choiceIcon)}>
                {item.icon}
              </span>
            )}
            <Text
              type="body"
              color={isDisabled ? 'inherit' : undefined}
              xstyle={styles.choiceLabel}>
              {item.label}
            </Text>
            {isMultiple ? (
              <CheckboxIndicator
                state={isSelected ? 'checked' : 'unchecked'}
                size="md"
                isDisabled={isDisabled}
              />
            ) : (
              <RadioIndicator
                state={isSelected ? 'checked' : 'unchecked'}
                size="md"
                isDisabled={isDisabled}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The value control for one filter inside the value step. Closed vocabularies
 * are rows here; every other type is the popover presentation's own editor in
 * its sheet presentation.
 */
function SheetValueEditor({
  operatorValue,
  filterValue,
  onChange,
  onUnstage,
  config,
  fieldLabel,
  isDisabled,
  maxMenuItems,
  editors,
}: {
  operatorValue: OperatorValue;
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  onUnstage: () => void;
  config: InternalConfig;
  fieldLabel: string;
  isDisabled: boolean;
  maxMenuItems?: number;
  editors: PowerSearchSheetEditors;
}) {
  const {buildRelativeDateOptions, PowerSearchValueEditor} = editors;
  const t = useComponentTranslator();
  const selectedValues = useMemo<ReadonlySet<string>>(() => {
    if (filterValue?.type === 'enum' || filterValue?.type === 'date_relative') {
      return new Set([filterValue.value]);
    }
    if (filterValue?.type === 'enum_list') {
      return new Set(filterValue.value);
    }
    return new Set();
  }, [filterValue]);

  switch (operatorValue.type) {
    case 'empty':
    case 'nested':
      return null;
    case 'enum':
      return (
        <ChoiceRows
          items={operatorValue.values}
          selected={selectedValues}
          isDisabled={isDisabled}
          isMultiple={false}
          label={fieldLabel}
          onToggle={value => onChange({type: 'enum', value})}
        />
      );
    case 'enum_list':
      return (
        <ChoiceRows
          items={operatorValue.values}
          selected={selectedValues}
          isDisabled={isDisabled}
          isMultiple
          label={fieldLabel}
          onToggle={(value, isSelected) => {
            const existing =
              filterValue?.type === 'enum_list' ? filterValue.value : [];
            onChange({
              type: 'enum_list',
              value: isSelected
                ? existing.filter(v => v !== value)
                : [...existing, value],
            });
          }}
        />
      );
    case 'date_relative':
      return (
        <ChoiceRows
          items={buildRelativeDateOptions(operatorValue, t)}
          selected={selectedValues}
          isDisabled={isDisabled}
          isMultiple={false}
          label={fieldLabel}
          onToggle={value => onChange({type: 'date_relative', value})}
        />
      );
    case 'string':
    case 'string_list':
    case 'integer':
    case 'float':
    case 'time':
    case 'date_absolute':
    case 'date_range':
    case 'entity_list':
    case 'custom':
      return (
        <div {...stylex.props(styles.editorInput)}>
          <PowerSearchValueEditor
            operatorValue={operatorValue}
            filterValue={filterValue}
            onChange={onChange}
            onUnstage={onUnstage}
            config={config}
            maxMenuItems={maxMenuItems}
            isDisabled={isDisabled}
            presentation="bottom-sheet"
            fieldLabel={fieldLabel}
          />
        </div>
      );
  }
}

// =============================================================================
// Component
// =============================================================================

/**
 * The sheet flow of PowerSearch's touch presentation: Filters, Add filter,
 * and the value step, as standalone sheets that stack, each open beneath the
 * step it led to.
 */
export function PowerSearchBottomSheet({
  isOpen,
  onOpenChange,
  finalFocusRef,
  resultCountText,
  config,
  configProp,
  filters,
  onChange,
  searchSource,
  placeholder,
  isReadOnly,
  isDisabled,
  hasClear,
  maxOperatorMenuItems,
  maxSearchResults,
  saveButtonLabel: saveButtonLabelFromProps,
  components: componentOverrides,
  editors,
}: PowerSearchBottomSheetProps) {
  const {NestedEditor} = editors;
  const t = useComponentTranslator();
  const locale = useLocale();
  const formatList = useListFormatter();
  const isInteractive = !isDisabled && !isReadOnly;

  const contentSearchFieldKey = config.config.contentSearchFieldKey;
  const contentSearchOperator =
    contentSearchFieldKey == null
      ? undefined
      : config.getDefaultOperator(contentSearchFieldKey);
  const hasContentSearch = contentSearchOperator?.value.type === 'string';
  const suggestionSource = useMemo(
    () => createSheetSuggestionSource(config, searchSource),
    [config, searchSource],
  );

  const contentResultsId = useId();
  const managerAddButtonRef = useRef<HTMLButtonElement>(null);
  const contentSearchRef = useRef<HTMLDivElement>(null);
  const fieldSearchRef = useRef<HTMLDivElement>(null);
  // The Add filter sheet's panel: the fallback focus target when the control
  // a step came from is gone — its first focusable control, which is the
  // search field when one shows, else the first field row.
  const fieldsSheetRef = useRef<HTMLDivElement>(null);
  // The content search and its suggestion rows are one vertical list for the
  // arrow keys: ArrowDown from the searchbox reaches the first suggestion,
  // ArrowUp from the first suggestion returns to the searchbox, and the ends
  // do not wrap. Home and End stay with the searchbox's caret.
  const contentListFocus = useInternalListFocus<HTMLDivElement>({
    itemSelector: `[role="searchbox"], [id="${contentResultsId}"] button`,
    wrap: false,
    hasHomeEnd: false,
  });
  const fieldsSheetCallbackRef = useMergedRefs(
    fieldsSheetRef,
    contentListFocus.listRef,
  );
  const handleContentListKeyDown = (event: React.KeyboardEvent) => {
    if (!isImeKeyEvent(event.nativeEvent)) {
      contentListFocus.handleKeyDown(event);
    }
  };
  const manageSheetRef = useRef<HTMLDivElement>(null);
  // Where focus was inside the Filters or Add filter sheet, read on every
  // focus change there, so a controlled update that unmounts the focused
  // control (a filter's row, a dropped field's row, Clear all after the last
  // filter) can put focus on the nearest remaining row by that index, else
  // the sheet's first control, else the sheet panel. A removed element
  // fires no blur, so the position is what the effect below reads.
  const lastSheetFocusRef = useRef<{
    sheet: 'manage' | 'fields';
    rowIndex: number | null;
  } | null>(null);
  // One index space for the record and the recovery: rows that are buttons
  // (a plain read-only row is passed over, as the removal and Apply/Cancel
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
  const managerRowsRef = useRef(new Map<number, HTMLLIElement>());
  const fieldRowsRef = useRef(new Map<string, HTMLLIElement>());
  const latestFiltersRef = useRef(filters);
  const pendingSheetFocusRef = useRef<PendingSheetFocus | null>(null);
  const pendingMutationFocusRef = useRef(false);

  // The step an open starts on: Add filter directly when an interactive field
  // has nothing to manage yet, otherwise Filters. Neither search field takes
  // focus on open, so the software keyboard stays down until the person taps
  // the search. Add filter opened directly is the flow's entry point: no
  // Filters sheet beneath it, and Done in its footer.
  const isEntryAddFilter = filters.length === 0 && isInteractive;
  const [step, setStep] = useState<SheetStep | null>(() =>
    isOpen ? (isEntryAddFilter ? 'fields' : 'manage') : null,
  );
  const [fieldPickerOrigin, setFieldPickerOrigin] = useState<
    'manage' | 'trigger'
  >(() => (isOpen && isEntryAddFilter ? 'trigger' : 'manage'));
  // The current step, read by the sheets' close reports and by a removal that
  // decides where to speak.
  const stepRef = useRef(step);
  useLayoutEffect(() => {
    stepRef.current = step;
  }, [step]);
  // The draft outlives a step change on purpose: a closing value step stays
  // presented through its exit, and clearing the draft with the step would
  // blank that sheet mid-transition.
  const [draft, setDraft] = useState<FilterDraft | null>(null);
  const draftGenerationRef = useRef(0);
  const nextDraftGeneration = useCallback(() => {
    draftGenerationRef.current += 1;
    return draftGenerationRef.current;
  }, []);
  const [fieldQuery, setFieldQuery] = useState('');
  const [contentQuery, setContentQuery] = useState('');
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const clearAllButtonRef = useRef<HTMLButtonElement>(null);
  // Set while Clear all commits, so the result count that changes in that
  // commit is spoken with Clear all's outcome, as one message.
  const isClearingRef = useRef(false);

  // `useAnnounce` delivers inside the open Astryx modal that encloses its
  // caller, and this component renders above the
  // sheets, so it cannot call the hook itself. Each step's body renders a
  // `SheetAnnouncer` inside its BottomSheet, which publishes the dialog's own
  // `announce` here while that step is the active one; the effects below
  // speak through it, so every message about a sheet's content is delivered
  // in that sheet's dialog.
  const announceRef = useRef<AnnounceFn | null>(null);
  const handleAnnounceChange = useCallback((next: AnnounceFn | null) => {
    announceRef.current = next;
  }, []);
  const announce = useCallback((message: string) => {
    announceRef.current?.(message);
  }, []);
  const pendingAnnouncementRef = useRef<string | null>(null);

  // The controlled `isOpen` opens and closes the flow; the step follows it in
  // the render that sees the change, not an effect, so the entry step's sheet
  // opens in the same commit as the flow (React's adjust-state-on-
  // prop-change pattern). Closing from outside — the field became disabled —
  // ends the flow wherever it was, the Clear all confirmation included.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setFieldQuery('');
      setContentQuery('');
      setStep(isEntryAddFilter ? 'fields' : 'manage');
      setFieldPickerOrigin(isEntryAddFilter ? 'trigger' : 'manage');
    } else {
      setStep(null);
      setIsClearConfirmationOpen(false);
    }
  }

  const closeFlow = useCallback(() => {
    pendingSheetFocusRef.current = null;
    setStep(null);
    onOpenChange(false);
  }, [onOpenChange]);

  // Whether a Filters row is a button: the field interactive and the
  // filter not read-only. The row opens the value step — the editor for its
  // operator's value type, the built-in nested editor for a `nested` one, or
  // for a filter the config no longer knows the unavailable state — and its
  // trailing remove action removes it, as the popover's token has its × for
  // it.
  const isRowButton = useCallback(
    (filter: PowerSearchFilter): boolean => !filter.isReadOnly && isInteractive,
    [isInteractive],
  );

  // ------------------------------------------------------------------ focus --

  // The control a step change named also becomes where the closing step
  // sheets return focus when their exit ends: a closing sheet that held focus
  // keeps it until then, and BottomSheet then returns it, so the named control
  // receives it even when the first move could not land. With no control
  // named, the closing steps return focus as the flow does.
  const stepReturnTargetRef = useRef<HTMLElement | null>(null);
  const stepFinalFocusRef = useMemo<React.RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return stepReturnTargetRef.current ?? finalFocusRef.current;
      },
    }),
    [finalFocusRef],
  );
  const placeFocus = (element: HTMLElement | null | undefined) => {
    if (element == null) {
      return;
    }
    stepReturnTargetRef.current = element;
    element.focus({preventScroll: true});
  };
  const focusPendingSheetTarget = useCallback(() => {
    const target = pendingSheetFocusRef.current;
    if (target == null) {
      return;
    }
    pendingSheetFocusRef.current = null;
    if (target.type === 'manager-add') {
      placeFocus(managerAddButtonRef.current);
      return;
    }
    // Add filter's fallback: a controlled update may have removed the field
    // whose row opened the step, or the content-search field itself; the
    // sheet's first focusable control then takes focus — the search field
    // when one shows, else the first field row.
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
      placeFocus(
        contentSearchRef.current?.querySelector<HTMLInputElement>('input') ??
          firstFieldsControl(),
      );
      return;
    }
    if (target.type === 'field') {
      placeFocus(
        fieldRowsRef.current
          .get(target.fieldKey)
          ?.querySelector<HTMLButtonElement>('button') ?? firstFieldsControl(),
      );
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
    const row = index == null ? null : managerRowsRef.current.get(index);
    const rowButton =
      target.part === 'remove'
        ? (row?.querySelector<HTMLButtonElement>('[data-sheet-remove]') ??
          row?.querySelector<HTMLButtonElement>('button'))
        : row?.querySelector<HTMLButtonElement>('button');
    placeFocus(rowButton ?? managerAddButtonRef.current);
  }, [isRowButton]);

  // A controlled update that unmounts the focused control of the Filters or
  // Add filter sheet leaves focus on the page body inside the open modal.
  // Read before paint on every commit of an open step: when focus is no
  // longer inside the sheet's dialog, the nearest remaining row by the last
  // focused index takes it, else the sheet's first control, else its panel.
  // The pending-target effects below run after and win when a step
  // change named a control.
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

  // Both Effects move focus inside the entering sheet — the external system
  // is the document's focus — to the control the step named. They run after
  // the entering sheet's own
  // panel focus (child effects commit first), so the intended control wins,
  // and they acquire nothing, so they need no cleanup. The filters effect is
  // declared first so a mutation that lands in the same commit as the step
  // change resolves its row against the new filters.
  useEffect(() => {
    latestFiltersRef.current = filters;
    if (step === 'manage' && pendingMutationFocusRef.current) {
      pendingMutationFocusRef.current = false;
      focusPendingSheetTarget();
    }
  }, [filters, focusPendingSheetTarget, step]);

  // A target still pending when the flow closes, such as a commit that
  // disabled the field, never carries into the next open.
  useEffect(() => {
    if (step == null) {
      stepReturnTargetRef.current = null;
      pendingSheetFocusRef.current = null;
      return;
    }
    // A step that opens starts with no named return target; a return to
    // Filters keeps the one its commit, or its removal, has just named.
    if (step !== 'manage') {
      stepReturnTargetRef.current = null;
    }
    focusPendingSheetTarget();
  }, [focusPendingSheetTarget, step]);

  // An announcement queued by a step change — a suggestion or a removal that
  // changed the filters — is spoken in the commit that shows the next step,
  // so it lands in that step's dialog region rather than the one about to
  // close. It synchronizes the live region named above and acquires nothing.
  useEffect(() => {
    const message = pendingAnnouncementRef.current;
    if (step != null && message != null) {
      pendingAnnouncementRef.current = null;
      announce(message);
    }
  }, [announce, step]);

  // ----------------------------------------------------------------- fields --

  // Every visible field lists: the value step edits every operator's value,
  // `nested` through the popover's built-in editor.
  const fields = useMemo(() => config.getVisibleFields(), [config]);

  const normalizedFieldQuery = fieldQuery.trim().toLowerCase();
  const matchingFields = useMemo(() => {
    const matches = fields.filter(field =>
      fieldMatchesQuery(field, normalizedFieldQuery),
    );
    return normalizedFieldQuery === ''
      ? matches
      : matches.slice(0, maxSearchResults);
  }, [fields, maxSearchResults, normalizedFieldQuery]);

  // Ungrouped fields first, then each group in first-appearance order — the
  // same grouping the popover presentation's field suggestions use
  // (`groupItems` with `ungroupedFirst`), so the two presentations
  // list a config's fields in one order.
  const groupedFields = useMemo(
    () =>
      matchingFields.length === 0
        ? []
        : groupItems(
            matchingFields.map(field => ({
              id: field.key,
              label: field.label,
              auxiliaryData: {group: field.group},
              field,
            })),
            {ungroupedFirst: true},
          ).map(
            group =>
              [
                group.heading ?? '',
                group.items.map(item => item.field),
              ] as const,
          ),
    [matchingFields],
  );

  const isFieldSearchShown = fields.length >= SEARCHABLE_FIELD_COUNT;

  // A field whose only operator takes an `empty` value is a one-tap filter:
  // its row adds it with no value step, and shows a plus, not a chevron.
  const isImmediateAddField = useCallback(
    (field: PowerSearchField): boolean => {
      const operators = config.getVisibleOperators(field.key);
      return operators.length === 1 && operators[0].value.type === 'empty';
    },
    [config],
  );

  // The steps stack: each opens above the sheet that led to it, which stays
  // open beneath. Add filter entered directly has no Filters sheet beneath.
  const isFieldPickerDirectEntry = fieldPickerOrigin === 'trigger';
  const isManageSheetOpen =
    step === 'manage' ||
    (step === 'fields' && !isFieldPickerDirectEntry) ||
    (step === 'value' && (draft?.mode === 'edit' || !isFieldPickerDirectEntry));
  const isFieldsSheetOpen =
    step === 'fields' || (step === 'value' && draft?.mode === 'create');

  // The suggestions derive synchronously from the config, so a list never
  // waits on a request: an empty list means an empty result, not a pending
  // one. They stay listed while the value step covers Add filter.
  const contentResults = useMemo(() => {
    if (!isFieldsSheetOpen || !hasContentSearch || !isInteractive) {
      return [];
    }
    const results =
      contentQuery.trim() === ''
        ? suggestionSource.bootstrap()
        : suggestionSource.search(contentQuery);
    return results.slice(0, MAX_BROWSE_MENU_ITEMS);
  }, [
    contentQuery,
    hasContentSearch,
    isFieldsSheetOpen,
    isInteractive,
    suggestionSource,
  ]);

  // The field's result count, while a sheet is open: the owner's own Effect
  // is quiet then, so the change is spoken here, inside the dialog. Only a
  // change after the flow opened is spoken.
  const announcedResultCountRef = useRef(resultCountText);
  // The latest result count, for Clear all's handler to read after its
  // commit has flushed.
  const latestResultCountRef = useRef(resultCountText);
  useLayoutEffect(() => {
    latestResultCountRef.current = resultCountText;
  }, [resultCountText]);
  useEffect(() => {
    if (
      isClearingRef.current ||
      resultCountText === announcedResultCountRef.current
    ) {
      return;
    }
    announcedResultCountRef.current = resultCountText;
    if (step != null && resultCountText != null) {
      announce(resultCountText);
    }
  }, [announce, resultCountText, step]);

  // ------------------------------------------------------------------ draft --

  const draftField = draft ? config.getField(draft.field) : undefined;
  const draftOperator =
    draft?.operator != null
      ? config.getOperator(draft.field, draft.operator)
      : undefined;
  const draftOperators = useMemo(
    () => (draft ? config.getVisibleOperators(draft.field) : []),
    [config, draft],
  );

  // The two parts of a Filters row's text for `filter`: "{field} {operator}"
  // as one catalog message, and the value as the popover presentation's
  // token shows it — the same function, so the same words and the same zone
  // handling, before the token's width budget. The rows render these, and
  // the removal announcement joins them, so the three can never
  // disagree.
  const describeFilterParts = useCallback(
    (filter: PowerSearchFilter): {label: string; value: string | null} => {
      const field = config.getField(filter.field);
      const operator = config.getOperator(filter.field, filter.operator);
      // A filter whose field or operator the config no longer has still
      // lists, by its raw keys, as its token does on the trigger; its row
      // opens the unavailable step, and its trailing remove action removes
      // it.
      const fieldLabel = field?.label ?? filter.field;
      const operatorLabel =
        operator == null ? filter.operator : resolveOperatorLabel(operator, t);
      const label = operatorLabel
        ? t('@astryx.powersearch.sheet.fieldOperator', {
            field: fieldLabel,
            operator: operatorLabel,
          })
        : fieldLabel;
      if (operator == null) {
        return {label, value: null};
      }
      // A relative-date value is stored as a key (`3d_ago`); the row reads it
      // as the value step's choice row does ("3 days ago"), through the
      // catalog's relative-date messages, so the sheet agrees with itself. The popover token
      // shows the stored key (a known gap of the record).
      const value =
        operator.value.type === 'date_relative' &&
        filter.value.type === 'date_relative'
          ? resolveRelativeDateLabel(
              operator.value,
              filter.value.value,
              t,
              editors.buildRelativeDateOptions,
            )
          : formatTokenValueText(
              operator.value,
              filter.value,
              Number.MAX_SAFE_INTEGER,
              locale,
              t,
              formatList,
            );
      return {label, value};
    },
    [config, editors, formatList, locale, t],
  );
  const describeFilter = useCallback(
    (filter: PowerSearchFilter): string => {
      const parts = describeFilterParts(filter);
      return parts.value
        ? t('@astryx.powersearch.sheet.labelValue', {
            label: parts.label,
            value: parts.value,
          })
        : parts.label;
    },
    [describeFilterParts, t],
  );

  const openFieldList = useCallback(() => {
    if (!isInteractive) {
      return;
    }
    setFieldPickerOrigin('manage');
    setFieldQuery('');
    setContentQuery('');
    pendingSheetFocusRef.current = null;
    setStep('fields');
  }, [isInteractive]);

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
  // suggestion. The origin is kept so Cancel returns to the control the person
  // came from.
  const openCreateEditor = useCallback(
    (
      field: PowerSearchField,
      operator: PowerSearchOperator,
      returnFocus: 'field' | 'content-search' = 'field',
    ) => {
      setDraft({
        mode: 'create',
        generation: nextDraftGeneration(),
        returnFocus,
        field: field.key,
        operator: operator.key,
        value: operator.value.type === 'empty' ? {type: 'empty'} : undefined,
      });
      pendingSheetFocusRef.current = null;
      setStep('value');
    },
    [nextDraftGeneration],
  );

  const handleFieldSelect = useCallback(
    (field: PowerSearchField) => {
      if (!isInteractive) {
        return;
      }
      // A one-tap filter has nothing to stage: choosing its field adds it
      // and returns to Filters.
      if (isImmediateAddField(field)) {
        const [operator] = config.getVisibleOperators(field.key);
        const nextFilter: PowerSearchFilter = {
          field: field.key,
          operator: operator.key,
          value: {type: 'empty'},
        };
        pendingSheetFocusRef.current = {
          type: 'manager-filter',
          sourceFilter: nextFilter,
          sourceSignature: filterSignature(nextFilter),
          preferredIndex: filters.length,
        };
        pendingMutationFocusRef.current = true;
        onChange([...filters, nextFilter], 'add', filters.length);
        pendingAnnouncementRef.current = t('@astryx.tokenizer.tokenAdded', {
          label: describeFilter(nextFilter),
        });
        setStep('manage');
        return;
      }
      const operator =
        config.getDefaultOperator(field.key) ?? field.operators[0];
      if (operator == null) {
        return;
      }
      openCreateEditor(field, operator);
    },
    [
      config,
      describeFilter,
      filters,
      isImmediateAddField,
      isInteractive,
      onChange,
      openCreateEditor,
      t,
    ],
  );

  const handleContentSuggestionSelect = useCallback(
    (item: PowerSearchItem | null) => {
      if (!isInteractive || item?.auxiliaryData == null) {
        return;
      }
      const {fieldKey, filterValue, operatorKey} = item.auxiliaryData;
      const field = config.getField(fieldKey);
      const operator =
        operatorKey == null
          ? config.getDefaultOperator(fieldKey)
          : config.getOperator(fieldKey, operatorKey);
      if (field == null || operator == null) {
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
        // The same announcement the popover presentation's typeahead add
        // makes, so assistive technology hears one phrase for one outcome;
        // spoken once the Filters sheet is the open dialog.
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
        generation: nextDraftGeneration(),
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
    [filters, isInteractive, nextDraftGeneration],
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
          part: 'remove',
        };
      }
      pendingMutationFocusRef.current = true;
      onChange(nextFilters, 'remove', index);
      // The popover presentation's token × announces the same phrase. A
      // removal from a Filters row stays in that sheet and speaks at once; a
      // caller's Editor that removes while returning to Filters speaks once
      // the Filters sheet is the open dialog.
      const message = t('@astryx.tokenizer.tokenRemoved', {
        label: describeFilter(filter),
      });
      if (stepRef.current === 'manage') {
        announce(message);
      } else {
        pendingAnnouncementRef.current = message;
      }
    },
    [
      announce,
      describeFilter,
      filters,
      isInteractive,
      isRowButton,
      onChange,
      t,
    ],
  );

  // Closing Clear all's confirmation. Kept, focus returns to Clear all.
  // Confirmed, Clear all removes the filters the person can edit and keeps
  // read-only ones, which are the consumer's: one `remove` at the first
  // removed index. The Filters sheet stays open for further editing. The
  // confirmation must be gone before focus moves into the sheet and the
  // outcome is routed into the sheet's region, so its close is flushed
  // first. The outcome is "Editable filters removed" while a read-only filter
  // remains, otherwise "All filters removed", joined with a result count that
  // changed in the same commit as one catalog message; focus moves to the
  // sheet's first remaining control: a kept read-only row has none, so Add
  // filter.
  const closeClearConfirmation = (confirmed: boolean) => {
    const kept = filters.filter(filter => filter.isReadOnly);
    const firstRemovedIndex = filters.findIndex(filter => !filter.isReadOnly);
    const isClearing = confirmed && isInteractive && firstRemovedIndex >= 0;
    isClearingRef.current = isClearing;
    try {
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the confirmation must be gone before focus moves into the sheet and the words are routed into it
      flushSync(() => {
        setIsClearConfirmationOpen(false);
        if (isClearing) {
          onChange(kept, 'remove', firstRemovedIndex);
        }
      });
    } finally {
      isClearingRef.current = false;
    }
    if (!isClearing) {
      clearAllButtonRef.current?.focus();
      return;
    }
    managerAddButtonRef.current?.focus({preventScroll: true});
    const resultCount = latestResultCountRef.current;
    const changedCount =
      resultCount !== announcedResultCountRef.current ? resultCount : null;
    announcedResultCountRef.current = resultCount;
    if (kept.length > 0) {
      announce(
        changedCount == null
          ? t('@astryx.powersearch.editableFiltersRemoved')
          : t('@astryx.powersearch.sheet.editableFiltersClearedWithCount', {
              resultCount: changedCount,
            }),
      );
    } else {
      announce(
        changedCount == null
          ? t('@astryx.powersearch.allFiltersRemoved')
          : t('@astryx.powersearch.sheet.filtersClearedWithCount', {
              resultCount: changedCount,
            }),
      );
    }
  };

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
  // The number input's draft was cleared or stopped parsing: nothing stands
  // to confirm, so the confirm action disables again.
  const handleDraftUnstage = useCallback(() => {
    setDraft(current =>
      current == null ? current : {...current, value: undefined},
    );
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
  // (a dismissal its `purpose` allows: Escape, the scrim, a swipe, a platform
  // close request), which only the top sheet of the stack receives. Closing
  // the top step reveals the step beneath it; closing the bottom one ends the
  // flow. A stale report from a step that is no longer current is ignored.
  // Every step change goes through the handlers above.
  const handleManageOpenChange = useCallback(
    (isSheetOpen: boolean) => {
      if (!isSheetOpen && stepRef.current === 'manage') {
        closeFlow();
      }
    },
    [closeFlow],
  );
  const handleFieldsOpenChange = useCallback(
    (isSheetOpen: boolean) => {
      if (isSheetOpen || stepRef.current !== 'fields') {
        return;
      }
      if (fieldPickerOrigin === 'trigger') {
        closeFlow();
        return;
      }
      queueManagerAddFocus();
      setStep('manage');
    },
    [closeFlow, fieldPickerOrigin, queueManagerAddFocus],
  );
  const handleValueOpenChange = useCallback(
    (isSheetOpen: boolean) => {
      if (!isSheetOpen && stepRef.current === 'value') {
        returnFromValue();
      }
    },
    [returnFromValue],
  );

  // ---------------------------------------------------------------- render --

  // Rows are keyed by filter identity, not position: a parent's reorder or a
  // removal above the focused row then moves elements instead of remounting
  // them, and focus stays on the same filter. Only a filter that is
  // itself removed loses its element, and the re-home effect above takes
  // over.
  const [filterIdentities] = useState(createFilterIdentities);
  const filterIds = filterIdentities.next(filters);
  const filterRows = filters.map((filter, index) => {
    const {label, value} = describeFilterParts(filter);
    const isEditable = isRowButton(filter);
    // The row reads from the same catalog message the removal announcement
    // uses (`labelValue`), so a locale that reorders it reorders both: the
    // message is formatted with a placeholder for the value, and the text
    // either side of that placeholder wraps the bold value.
    let displayLabel: ReactNode = label;
    if (value) {
      const [before, after] = t('@astryx.powersearch.sheet.labelValue', {
        label,
        value: ROW_VALUE_SLOT,
      }).split(ROW_VALUE_SLOT);
      displayLabel = (
        <>
          {before}
          <span {...stylex.props(styles.rowValue)}>{value}</span>
          {after}
        </>
      );
    }
    return {
      displayLabel,
      filter,
      index,
      isEditable,
      key: `filter-${filterIds[index]}`,
    };
  });

  const hasRemovableFilter = filters.some(filter => !filter.isReadOnly);
  const isClearAllShown = hasClear && isInteractive && hasRemovableFilter;

  const EditorOverride =
    draftOperator != null
      ? componentOverrides?.[draftOperator.value.type]?.Editor
      : undefined;

  const draftOperatorLabel =
    draftOperator == null ? '' : resolveOperatorLabel(draftOperator, t);
  // The title names the filter's own operator when the step offers no
  // Operator group: one visible operator, or an operator the config no longer
  // lists as visible. The step then never shows another operator's name.
  const showsOperatorGroup =
    draftOperators.length > 1 &&
    draftOperator != null &&
    draftOperators.includes(draftOperator);
  // The title — the dialog's name — reads the field and operator as
  // the Filters row does: by their labels, or, for a filter whose field or
  // operator the config no longer has, by the raw keys the row shows.
  const editorTitle =
    draft == null
      ? t('@astryx.powersearch.sheet.addFilter')
      : draftField == null || (draftOperator == null && draft.operator != null)
        ? t('@astryx.powersearch.sheet.fieldOperator', {
            field: draftField?.label ?? draft.field,
            operator:
              draftOperatorLabel !== ''
                ? draftOperatorLabel
                : (draft.operator ?? ''),
          }).trim()
        : !showsOperatorGroup && draftOperatorLabel !== ''
          ? t('@astryx.powersearch.sheet.fieldOperator', {
              field: draftField.label,
              operator: draftOperatorLabel,
            })
          : draftField.label;
  const saveButtonLabel =
    saveButtonLabelFromProps ??
    (draft?.mode === 'edit'
      ? t('@astryx.powersearch.editor.apply')
      : t('@astryx.powersearch.sheet.addFilter'));

  // Every sheet body: padded, and publishing that padding to its lists.
  const bodyProps = stylex.props(
    styles.body,
    containerPaddingInlineVarStyles[4],
  );
  const scrollContentProps = stylex.props(
    styles.scrollContent,
    containerPaddingInlineVarStyles[4],
  );
  const controlSectionProps = stylex.props(
    styles.controlSection,
    containerPaddingInlineVarStyles[3],
  );

  // A vertical touch drag on the Add filter rows moves focus off a focused
  // search to the sheet, so the software keyboard leaves and the rows can be
  // read.
  const fieldPickerDragProps = useDismissSearchOnTouchDrag(
    () => [
      contentSearchRef.current?.querySelector('input'),
      fieldSearchRef.current?.querySelector('input'),
    ],
    () => fieldsSheetRef.current?.closest<HTMLElement>('[tabindex="-1"]'),
  );

  const isEditorDisabled = isDisabled || isReadOnly;
  const isSaveDisabled =
    isEditorDisabled || draft?.operator == null || draft.value == null;
  // The step has something to edit when the field and operator still exist
  // (a controlled config update can remove either). A caller's `Editor`
  // override replaces the body for its value type with the props the popover
  // hands it; otherwise a `nested` value takes the popover's built-in
  // NestedEditor and every other type the sheet's own control.
  const isDraftRenderable =
    draft != null && draftField != null && draftOperator != null;
  const isDraftNested =
    isDraftRenderable && !isSupportedOperator(draftOperator);
  // A controlled config update that removes the field or operator being
  // edited replaces the step's body with the unavailable state while focus
  // may be on one of the body's controls, which unmount without a blur. Focus
  // then moves to Cancel, the way back to the Filters row whose remove action
  // is the removal path, so it never falls to the page body inside the open
  // sheet. The message itself is announced by its rendered element.
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
    cancelButtonRef.current?.focus();
  }, [draft, isDraftRenderable, step]);
  // The operator group stays outside either editor, so switching operators
  // swaps the body — a `nested` operator beside a plain one included.
  const operatorGroup = isDraftRenderable && showsOperatorGroup && (
    <RadioList
      label={t('@astryx.powersearch.editor.operator')}
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
          label={t('@astryx.powersearch.sheet.fieldOperator', {
            field: draftField.label,
            operator: resolveOperatorLabel(operator, t),
          })}
          value={operator.key}
          xstyle={styles.trailingControlRow}
        />
      ))}
    </RadioList>
  );
  // The step's Operator group owns the operator choice, so the built-in
  // nested editor's root operator picker is hidden and its root shows the
  // checked operator's label.
  const nestedOperatorOptions = useMemo(
    () =>
      draftOperator == null
        ? []
        : [
            {
              value: draftOperator.key,
              label: resolveOperatorLabel(draftOperator, t),
            },
          ],
    [draftOperator, t],
  );
  const handleNestedDraftChange = useCallback((next: PartialFilter) => {
    setDraft(current =>
      current == null ? current : {...current, value: next.value},
    );
  }, []);

  const valueEditor =
    isDraftRenderable &&
    (isDraftNested ? (
      <NestedEditor
        key={`${draft.generation}-${draft.field}-${draft.operator}`}
        config={config}
        partialFilter={{
          field: draft.field,
          operator: draft.operator,
          value: draft.value,
        }}
        operatorOptions={nestedOperatorOptions}
        hasRootOperatorPicker={false}
        onOperatorChange={() => {}}
        onPartialFilterChange={handleNestedDraftChange}
        maxMenuItems={maxOperatorMenuItems}
        isReadOnly={isEditorDisabled}
        xstyle={styles.nestedEditorContainer}
      />
    ) : (
      <SheetValueEditor
        key={`${draft.generation}-${draft.field}-${draft.operator}`}
        operatorValue={draftOperator.value}
        filterValue={draft.value}
        onChange={handleDraftValueChange}
        onUnstage={handleDraftUnstage}
        config={config}
        fieldLabel={draftField.label}
        isDisabled={isEditorDisabled}
        maxMenuItems={maxOperatorMenuItems}
        editors={editors}
      />
    ));

  return (
    <>
      <BottomSheet
        isOpen={isManageSheetOpen}
        onOpenChange={handleManageOpenChange}
        finalFocusRef={finalFocusRef}
        label={t('@astryx.powersearch.sheet.filtersTitle')}
        height="tall"
        padding={0}>
        <div
          ref={manageSheetRef}
          onFocus={noteSheetFocus('manage')}
          {...stylex.props(styles.sheet, styles.sheetWithFixedFooter)}>
          {step === 'manage' && (
            <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
          )}
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.headerRow)}>
              <div {...stylex.props(styles.headerText)}>
                <Heading level={3}>
                  {t('@astryx.powersearch.sheet.filtersTitle')}
                </Heading>
              </div>
              {isInteractive && filterRows.length > 0 && (
                <Button
                  ref={managerAddButtonRef}
                  label={t('@astryx.powersearch.sheet.addFilter')}
                  icon={<Icon icon={PlusIcon} size="sm" />}
                  isIconOnly
                  variant="secondary"
                  size="md"
                  xstyle={styles.touchHitArea}
                  onClick={openFieldList}
                />
              )}
            </div>
          </div>
          <div {...stylex.props(styles.scrollViewport)}>
            <div {...scrollContentProps}>
              {filterRows.length === 0 ? (
                // With no filter the single thing to do is the only visible
                // action. Mounted only while the sheet is open, so its text
                // is spoken in this sheet when it appears.
                isManageSheetOpen && (
                  <EmptyState
                    title={t('@astryx.powersearch.sheet.noFilters')}
                    description={t(
                      '@astryx.powersearch.sheet.noFiltersDescription',
                    )}
                    headingLevel={4}
                    icon={<Icon icon="funnel" size="lg" color="secondary" />}
                    xstyle={styles.emptyState}
                    actions={
                      isInteractive ? (
                        <Button
                          ref={managerAddButtonRef}
                          label={t('@astryx.powersearch.sheet.addFilter')}
                          icon={<Icon icon={PlusIcon} size="sm" />}
                          variant="primary"
                          size="lg"
                          xstyle={styles.touchHitArea}
                          onClick={openFieldList}
                        />
                      ) : undefined
                    }
                  />
                )
              ) : (
                <List hasDividers density="spacious" edge="bleed">
                  {filterRows.map(row => {
                    const operator = config.getOperator(
                      row.filter.field,
                      row.filter.operator,
                    );
                    const fieldLabel =
                      config.getField(row.filter.field)?.label ??
                      row.filter.field;
                    // A one-tap filter has no value to edit: its row removes
                    // it.
                    const isOneTap = operator?.value.type === 'empty';
                    const removeLabel = t(
                      '@astryx.powersearch.sheet.removeFilter',
                      {field: fieldLabel},
                    );
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
                          row.isEditable
                            ? isOneTap
                              ? () => handleRemoveFilter(row.index)
                              : () => handleFilterEdit(row.index)
                            : undefined
                        }
                        endContent={
                          row.isEditable ? (
                            <IconButton
                              data-sheet-remove=""
                              label={removeLabel}
                              tooltip={removeLabel}
                              icon={<Icon icon="close" size="sm" />}
                              variant="ghost"
                              size="md"
                              xstyle={styles.touchHitArea}
                              onClick={event => {
                                event.stopPropagation();
                                handleRemoveFilter(row.index);
                              }}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </List>
              )}
            </div>
          </div>
          {filterRows.length > 0 && (
            <div {...stylex.props(styles.footer, styles.fixedFooter)}>
              {isClearAllShown && (
                <Button
                  ref={clearAllButtonRef}
                  label={t('@astryx.powersearch.sheet.clearAll')}
                  variant="secondary"
                  size="lg"
                  xstyle={styles.footerEqualAction}
                  onClick={() => setIsClearConfirmationOpen(true)}
                />
              )}
              <Button
                label={t('@astryx.powersearch.sheet.done')}
                variant="primary"
                size="lg"
                xstyle={
                  isClearAllShown
                    ? styles.footerEqualAction
                    : [styles.footerSoleAction, styles.touchHitArea]
                }
                onClick={closeFlow}
                width={isClearAllShown ? undefined : '100%'}
              />
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isFieldsSheetOpen}
        onOpenChange={handleFieldsOpenChange}
        finalFocusRef={stepFinalFocusRef}
        label={t('@astryx.powersearch.sheet.addFilter')}
        height="tall"
        padding={0}>
        <div
          ref={fieldsSheetCallbackRef}
          onFocus={noteSheetFocus('fields')}
          onKeyDown={hasContentSearch ? handleContentListKeyDown : undefined}
          {...stylex.props(styles.sheet, styles.sheetWithFixedFooter)}>
          {step === 'fields' && (
            <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
          )}
          <div {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.headerRow)}>
              <div {...stylex.props(styles.headerText)}>
                <Heading level={3}>
                  {t('@astryx.powersearch.sheet.addFilter')}
                </Heading>
              </div>
            </div>
            {hasContentSearch ? (
              <div ref={contentSearchRef}>
                <TextInput
                  label={t('@astryx.powersearch.sheet.search')}
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
                    }
                  }}
                  placeholder={placeholder}
                  hasClear
                  startIcon={<Icon icon="search" size="sm" color="secondary" />}
                  isDisabled={!isInteractive}
                  size="lg"
                  width="100%"
                />
              </div>
            ) : isFieldSearchShown ? (
              <div ref={fieldSearchRef}>
                <TextInput
                  label={t('@astryx.powersearch.sheet.searchFields')}
                  isLabelHidden
                  placeholder={t(
                    '@astryx.powersearch.sheet.searchFieldsPlaceholder',
                  )}
                  value={fieldQuery}
                  onChange={setFieldQuery}
                  startIcon={<Icon icon="search" size="sm" color="secondary" />}
                  isDisabled={!isInteractive}
                  size="lg"
                  width="100%"
                />
              </div>
            ) : null}
          </div>
          <div
            {...stylex.props(styles.scrollViewport)}
            {...fieldPickerDragProps}>
            <div {...scrollContentProps}>
              {hasContentSearch ? (
                contentResults.length > 0 ? (
                  <List
                    id={contentResultsId}
                    aria-label={t('@astryx.powersearch.sheet.searchResults')}
                    hasDividers
                    density="spacious"
                    edge="bleed">
                    {contentResults.map(item => (
                      <ListItem
                        key={item.id}
                        label={item.label}
                        isDisabled={!isInteractive}
                        onClick={() => handleContentSuggestionSelect(item)}
                      />
                    ))}
                  </List>
                ) : contentQuery.trim() !== '' ? (
                  // The searchbox's `aria-controls` target while nothing
                  // lists. The empty state mounts only while this step is the
                  // open one and is spoken from its rendered text, once per
                  // query that matches nothing.
                  <div id={contentResultsId}>
                    {step === 'fields' && (
                      <EmptyState
                        key={contentQuery}
                        icon={
                          <Icon icon="search" size="lg" color="secondary" />
                        }
                        title={t('@astryx.powersearch.sheet.noResults')}
                        description={t(
                          '@astryx.powersearch.sheet.tryDifferentSearch',
                        )}
                        headingLevel={4}
                        isCompact
                        xstyle={styles.emptyState}
                      />
                    )}
                  </div>
                ) : (
                  // An empty query with no bootstrap suggestion: the results
                  // region exists, empty, so the searchbox's `aria-controls`
                  // always names an element in the document.
                  <div id={contentResultsId} />
                )
              ) : groupedFields.length === 0 ? (
                // A search outcome: only a non-empty query that matches
                // nothing shows it; a config with no field lists nothing.
                normalizedFieldQuery !== '' &&
                step === 'fields' && (
                  <EmptyState
                    key={normalizedFieldQuery}
                    icon={<Icon icon="search" size="lg" color="secondary" />}
                    title={t('@astryx.powersearch.sheet.noMatchingFields')}
                    description={t(
                      '@astryx.powersearch.sheet.tryDifferentSearch',
                    )}
                    headingLevel={4}
                    isCompact
                    xstyle={styles.emptyState}
                  />
                )
              ) : (
                groupedFields.map(([group, groupFields]) => (
                  <List
                    key={group}
                    hasDividers
                    density="spacious"
                    header={
                      <Heading level={4}>
                        {group === ''
                          ? t('@astryx.powersearch.sheet.ungroupedFields')
                          : group}
                      </Heading>
                    }
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
                          isImmediateAddField(field) ? (
                            <Icon icon={PlusIcon} size="sm" color="secondary" />
                          ) : (
                            <Icon
                              icon="chevronRight"
                              size="sm"
                              color="secondary"
                              xstyle={rtlStyles.mirror}
                            />
                          )
                        }
                        onClick={() => handleFieldSelect(field)}
                      />
                    ))}
                  </List>
                ))
              )}
            </div>
          </div>
          {isFieldPickerDirectEntry && (
            <div {...stylex.props(styles.footer, styles.fixedFooter)}>
              <Button
                label={t('@astryx.powersearch.sheet.done')}
                variant="primary"
                width="100%"
                xstyle={styles.touchAction}
                onClick={closeFlow}
              />
            </div>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={step === 'value'}
        onOpenChange={handleValueOpenChange}
        finalFocusRef={stepFinalFocusRef}
        label={editorTitle}
        height="tall"
        padding={0}
        purpose="info">
        <div {...stylex.props(styles.sheet)}>
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
              {step === 'value' && (
                <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
              )}
              {operatorGroup && (
                <div {...controlSectionProps}>{operatorGroup}</div>
              )}
              <EditorOverride
                key={`${draft.generation}-${draft.field}-${draft.operator}`}
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
              />
            </div>
          ) : (
            <>
              <div {...bodyProps}>
                {step === 'value' && (
                  <SheetAnnouncer onAnnounceChange={handleAnnounceChange} />
                )}
                {isDraftRenderable ? (
                  // A lone editor sits on the sheet's surface; with the
                  // Operator group above it, each section is a muted
                  // container.
                  operatorGroup ? (
                    <>
                      <div {...controlSectionProps}>{operatorGroup}</div>
                      <div {...controlSectionProps}>{valueEditor}</div>
                    </>
                  ) : (
                    valueEditor
                  )
                ) : (
                  // A controlled config update removed the field or operator
                  // being edited: say so (the element's rendered text is
                  // announced, once per opened filter, while this step is the
                  // open one) and keep a way out.
                  draft != null && (
                    <SheetEmptyMessage
                      message={t('@astryx.powersearch.sheet.filterUnavailable')}
                      occasion={String(draft.generation)}
                      isShown={step === 'value'}
                    />
                  )
                )}
              </div>
              <div {...stylex.props(styles.footer)}>
                {isReadOnly ? (
                  <Button
                    ref={cancelButtonRef}
                    label={t('@astryx.powersearch.editor.cancel')}
                    variant="secondary"
                    width="100%"
                    xstyle={[styles.footerSoleAction, styles.touchHitArea]}
                    onClick={returnFromValue}
                  />
                ) : (
                  <>
                    <Button
                      ref={cancelButtonRef}
                      label={t('@astryx.powersearch.editor.cancel')}
                      variant="secondary"
                      size="lg"
                      xstyle={styles.footerEqualAction}
                      onClick={returnFromValue}
                    />
                    {isDraftRenderable && (
                      <Button
                        label={saveButtonLabel}
                        variant="primary"
                        size="lg"
                        isDisabled={isSaveDisabled}
                        xstyle={styles.footerEqualAction}
                        onClick={handleSave}
                      />
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      {isClearConfirmationOpen && (
        <SheetConfirmation
          isOpen
          onOpenChange={isConfirmationOpen => {
            if (!isConfirmationOpen) {
              closeClearConfirmation(false);
            }
          }}
          title={t('@astryx.powersearch.sheet.clearAllTitle')}
          description={t('@astryx.powersearch.sheet.clearAllDescription')}
          actionLabel={t('@astryx.powersearch.sheet.clearAllConfirm')}
          cancelLabel={t('@astryx.powersearch.sheet.clearAllCancel')}
          onAction={() => closeClearConfirmation(true)}
        />
      )}
    </>
  );
}

PowerSearchBottomSheet.displayName = 'PowerSearchBottomSheet';
