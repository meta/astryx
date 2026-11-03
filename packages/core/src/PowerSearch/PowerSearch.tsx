// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearch.tsx
 * @input PowerSearchConfig, filters, onChange; Tokenizer, Field parts, Token,
 *   useAdaptivePresentation, and PowerSearchBottomSheet (lazy)
 * @output Structured filter bar with token-based filter management
 * @position Main component; forwards DOM ref and exposes tokenizer control via
 *   handleRef. The experimental `presentation` option swaps the tokenizer
 *   field and editor popover for one trigger that opens PowerSearchBottomSheet.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 * - /packages/core/src/PowerSearch/PowerSearchBottomSheet.tsx (sheet presentation)
 * - /packages/cli/assets/templates/blocks/components/PowerSearch/ (showcase blocks)
 */

import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {
  Tokenizer,
  type TokenizerHandle,
  type TokenizerOverflowBehavior,
} from '../Tokenizer';
import {TokenizerClearAllMessageContext} from '../Tokenizer/TokenizerClearAllMessageContext';
import {TokenizerItemRemovableContext} from '../Tokenizer/TokenizerItemRemovableContext';
import {TypeaheadItem} from '../Typeahead/TypeaheadItem';
import {Token} from '../Token';
import {TokenNamingContext} from '../Token/TokenNamingContext';
import {Avatar} from '../Avatar';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {Icon, renderIconSlot} from '../Icon';
import type {IconType} from '../Icon';
import type {IconName} from '../Icon/globalIconRegistry';
import type {InputStatus} from '../Field';
import {Field} from '../Field/Field';
import {
  inputStatusBorderStyles,
  inputStatusFocusWithinStyles,
  inputStatusHoverShadowStyles,
  inputWrapperStyles,
} from '../Field/inputStyles.stylex';
import {usePopover} from '../Popover/usePopover';
import {useTooltip} from '../Tooltip/useTooltip';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {useAnnounce} from '../hooks/useAnnounce';
import {useAdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {useDevWarning} from '../hooks/useDevWarning';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {
  spacingVars,
  colorVars,
  sizeVars,
  typeScaleVars,
  typographyVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {useSize} from '../SizeContext/SizeContext';
import {isFocusDetached} from '../utils/focusReturn';
import {isRenderable} from '../utils/isRenderable';
import {useInternalConfig} from './useInternalConfig';
import {usePowerSearchSource} from './usePowerSearchSource';
import {formatFilterValue} from './formatFilterValue';
import {NestedEditor, PowerSearchEditPopover} from './PowerSearchEditPopover';
import {
  buildRelativeDateOptions,
  PowerSearchValueEditor,
} from './PowerSearchValueEditor';
import {resolveOperatorLabel} from './resolveOperatorLabel';
import {themeProps} from '../utils/themeProps';
import {useLocale} from '../i18n/useLocale';
import type {Locale} from '../i18n/types';
import type {SearchableItem} from '../Typeahead/types';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
  PartialFilter,
  PowerSearchItem,
  PowerSearchAuxData,
  PowerSearchChangeType,
  PowerSearchHandle,
  FilterValue,
  OperatorValue,
  PowerSearchComponents,
  PowerSearchOperator,
} from './types';
import type {
  PowerSearchBottomSheetProps,
  PowerSearchSheetEditors,
} from './PowerSearchBottomSheet';
import {formatTokenValueText} from './formatTokenValue';

import {useMergedRefs} from '../hooks/useMergedRefs';
import type {FieldStatusPlacement} from '../Field/fieldStatusPlacement';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/PowerSearch/PowerSearch.generated';

registerEnglishFallback(english);
// =============================================================================
// Icon mapping for typeahead entries
// =============================================================================

// Ranked suggestions shown for a non-empty query. The field list itself is
// never capped -- see the maxSearchResults prop.
const DEFAULT_MAX_SEARCH_RESULTS = 10;

// Empty-query browsing gets a high safety ceiling, matching XDS. This shows
// every practical field list without allowing an accidental unbounded DOM.
const MAX_BROWSE_MENU_ITEMS = 1000;

const OPERATOR_VALUE_TYPE_TO_ICON: Record<string, IconName> = {
  string: 'search',
  string_list: 'search',
  integer: 'search',
  float: 'search',
  date_absolute: 'calendar',
  date_range: 'calendar',
  date_relative: 'calendar',
  time: 'clock',
  enum: 'menu',
  enum_list: 'menu',
  entity_list: 'search',
  custom: 'search',
  empty: 'search',
  nested: 'search',
};

// =============================================================================
// Token value rendering
// =============================================================================

const tokenValueStyles = stylex.create({
  value: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
});

const popoverLayerStyles = stylex.create({
  layer: {
    width: 'anchor-size(width)',
    // Floor for comfortable editing, clamped by the layer runtime's viewport
    // cap (spec:AST-059 FR7) rather than by the room beside the anchor; the
    // runtime flips or slides the editor into view when it does not fit there
    // (#4761).
    minWidth: stylex.firstThatWorks(
      `min(400px, ${layerViewportInset.maxInlineSize})`,
      `min(400px, ${layerViewportInset.maxInlineSizeFallback})`,
    ),
  },
});

const resultCountStyles = stylex.create({
  text: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
  },
});

// The sheet presentation's trigger field: the same control box as the
// tokenizer field, with display-only tokens and one button as its only tab
// stop.
const sheetTriggerSizeStyles = stylex.create({
  sm: {minHeight: sizeVars['--size-element-sm']},
  md: {minHeight: sizeVars['--size-element-md']},
  lg: {minHeight: sizeVars['--size-element-lg']},
});

const sheetTriggerStyles = stylex.create({
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
      ':is([aria-disabled="true"])': 'default',
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
  endSection: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flexShrink: 0,
    paddingInlineEnd: spacingVars['--spacing-1'],
  },
});

// The sheet flow (three standalone sheets, the sheet editors) only
// renders for the bottom-sheet presentation. Loading it on demand keeps it out
// of pages whose PowerSearch stays a tokenizer field.
// One import promise, shared by the preload and the lazy element: the sheet
// presentation loads the flow's chunk as soon as it is active, so the first
// press does not wait for the network, while nothing of the flow is rendered
// until a press.
const loadPowerSearchBottomSheet = async () =>
  import('./PowerSearchBottomSheet');
const LazyPowerSearchBottomSheet = lazy(async () =>
  loadPowerSearchBottomSheet().then(module => ({
    default: module.PowerSearchBottomSheet,
  })),
);
// The value step reuses the popover presentation's editors, which this
// module already loads; see PowerSearchSheetEditors.
const SHEET_EDITORS: PowerSearchSheetEditors = {
  NestedEditor,
  PowerSearchValueEditor,
  buildRelativeDateOptions,
};

/**
 * Hosts the lazily loaded sheet flow. Renders nothing on the server or in the
 * render that hydrates server HTML: a lazy component that has not loaded yet
 * would leave server markup incomplete and abort hydration. The closed flow
 * has no visible markup, so it first renders right after hydration.
 */
function PowerSearchSheetHost(
  props: Omit<PowerSearchBottomSheetProps, 'editors'>,
) {
  const isHydrating = useIsHydrating();
  if (isHydrating) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyPowerSearchBottomSheet {...props} editors={SHEET_EDITORS} />
    </Suspense>
  );
}

function PowerSearchTokenValue({text}: {text: string}) {
  return <span {...stylex.props(tokenValueStyles.value)}>{text}</span>;
}

// =============================================================================
// Types
// =============================================================================

export type PowerSearchSize = 'sm' | 'md' | 'lg';

export interface PowerSearchProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  /** PowerSearch configuration defining available fields and operators. */
  config: PowerSearchConfig;
  /** Currently active filters. */
  filters: ReadonlyArray<PowerSearchFilter>;
  /** Called when filters change. */
  onChange: (
    filters: ReadonlyArray<PowerSearchFilter>,
    changeType: PowerSearchChangeType,
    index: number,
  ) => void;
  /** Accessible label. @default 'Search' */
  label?: string;
  /** Visually hide the label. @default true */
  isLabelHidden?: boolean;
  /** Placeholder text. @default 'Search...' */
  placeholder?: string;
  /** Auto-focus on mount. @default false */
  hasAutoFocus?: boolean;
  /** Show clear button. @default true */
  hasClear?: boolean;
  /** Whether the input is read-only. @default false */
  isReadOnly?: boolean;
  /** Whether the input is disabled. @default false */
  isDisabled?: boolean;
  /**
   * Explains why the search is disabled. When set together with `isDisabled`,
   * the search shows a tooltip with this text on hover and keyboard focus, and
   * the input stays focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. Input stays blocked.
   *
   * Use this instead of wrapping a disabled PowerSearch in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   */
  disabledMessage?: string;
  /**
   * Icon to display at the start of the input.
   * Accepts a ReactNode (e.g. `<Icon icon={SearchIcon} />`) or an SVG icon component directly.
   */
  startIcon?: ReactNode | IconType;
  /** Fires when focus enters the search input from outside. */
  onFocus?: (e: React.FocusEvent) => void;
  /** Fires when focus leaves the search input entirely. */
  onBlur?: (e: React.FocusEvent) => void;
  /** Validation status. */
  status?: InputStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the input (bordered treatment)
   * - 'detached': message floats below as a separate element with spacing
   * @default 'attached'
   */
  statusVariant?: FieldStatusPlacement;
  /** Max width for dropdown menu. */
  menuWidth?: number;
  /** Max display length for filter token values. @default 40 */
  maxTokenLength?: number;
  /** Max suggestions in string and entity value typeaheads. @default 10 */
  maxOperatorMenuItems?: number;
  /**
   * Max ranked results shown for a non-empty query. This does not affect the
   * value editor shown after selecting a field. Browsing the field list with
   * an empty query shows up to 1,000 fields. @default 10
   */
  maxSearchResults?: number;
  /** Label for the save button in edit popover. @default 'Apply' */
  popoverSaveButtonLabel?: string;
  /** Timezone ID for date formatting. */
  timezoneID?: string;
  /**
   * Controls how tokens overflow when the container is too narrow.
   * Forwarded to Tokenizer.
   * @default 'none'
   */
  tokenOverflowBehavior?: TokenizerOverflowBehavior;
  /**
   * Content to display at the end of the input row.
   * Useful for action buttons or other controls.
   */
  endContent?: React.ReactNode;
  /**
   * Number of results matching the current filters.
   * When a number, formatted as "N results". When a string, displayed as-is.
   */
  resultCount?: number | string;
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLDivElement>;
  /** Imperative handle ref. */
  handleRef?: React.Ref<PowerSearchHandle>;
  /**
   * Size of the search input.
   * @default 'md'
   */
  size?: PowerSearchSize;
  /**
   * Per-type component overrides for token and editor rendering.
   * Keys are operator value types (e.g. 'string', 'enum', 'date_absolute').
   */
  components?: PowerSearchComponents;

  /**
   * Experimental options, outside the stable compatibility promise: anything
   * in this object may change or be removed in a patch release. Omit it for
   * the stable behavior.
   * @experimental
   */
  experimental?: {
    /**
     * How the field presents filter editing.
     * - `'popover'`: the tokenizer field with its typeahead and the editor
     *   popover — the stable behavior.
     * - `'bottom-sheet'`: the whole field is one trigger showing display-only
     *   filter tokens; it opens a stack of sheets. Filters lists the filters
     *   as rows that edit or remove one, with Add filter, Done, and Clear
     *   all, which asks first and keeps read-only filters. Add filter opens
     *   above it with the fields (or the content search with inline
     *   suggestions), and a value step opens above that, stages operator →
     *   value, and confirms from its footer. Dismissing a step reveals the
     *   one beneath. Suited to compact touch screens, where the editor
     *   popover competes with the software keyboard.
     * - `'adaptive'`: the bottom sheet on compact coarse-pointer screens,
     *   otherwise the popover — the same resolution Selector uses.
     *
     * In the sheet presentation `menuWidth` and `tokenOverflowBehavior` have
     * no surface to act on and warn in development.
     * @experimental
     * @default 'popover'
     */
    presentation?: 'popover' | 'bottom-sheet' | 'adaptive';
  };
}

// =============================================================================
// State
// =============================================================================

type PopoverState =
  | {type: 'idle'}
  | {
      type: 'adding';
      partialFilter: PartialFilter;
    }
  | {
      type: 'editing';
      filterIndex: number;
      partialFilter: PartialFilter;
    };

// =============================================================================
// Component
// =============================================================================

/**
 * Whether a press on a token with this operator commits the filter instead of
 * opening its editor: an `empty` operator with no `empty` Editor override.
 */
function commitsWithoutEditor(
  operator: PowerSearchOperator | undefined,
  componentOverrides: PowerSearchComponents | undefined,
): boolean {
  return (
    operator?.value.type === 'empty' &&
    componentOverrides?.empty?.Editor == null
  );
}

/**
 * Structured filter bar where each token represents a filter (field + operator + value).
 *
 * Users select a field from a typeahead dropdown, then configure the operator
 * and value in an edit popover. Filters appear as tokens that can be clicked
 * to edit or removed individually.
 *
 * @example
 * ```
 * const config = {
 *   name: 'MySearch',
 *   fields: [
 *     {
 *       key: 'status',
 *       label: 'Status',
 *       operators: [
 *         {
 *           key: 'is',
 *           label: 'is',
 *           value: {
 *             type: 'enum',
 *             values: [
 *               { value: 'open', label: 'Open' },
 *               { value: 'closed', label: 'Closed' },
 *             ],
 *           },
 *         },
 *       ],
 *     },
 *   ],
 * };
 * const [filters, setFilters] = useState([]);
 * <PowerSearch
 *   config={config}
 *   filters={filters}
 *   onChange={(newFilters) => setFilters(newFilters)}
 * />
 * ```
 *
 * Use contentSearchFieldKey to designate a field for free-text search.
 * When set, unstructured text input is routed to that field.
 *
 * @example
 * ```
 * const config = {
 *   name: 'IssueSearch',
 *   contentSearchFieldKey: 'title',
 *   fields: [
 *     {
 *       key: 'title',
 *       label: 'Title',
 *       operators: [
 *         { key: 'contains', label: 'contains', value: { type: 'string' } },
 *       ],
 *     },
 *     {
 *       key: 'status',
 *       label: 'Status',
 *       operators: [
 *         { key: 'is', label: 'is', value: { type: 'enum', values: [...] } },
 *       ],
 *     },
 *   ],
 * };
 * ```
 */
export function PowerSearch({
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
  menuWidth,
  maxTokenLength = 40,
  maxOperatorMenuItems,
  maxSearchResults = DEFAULT_MAX_SEARCH_RESULTS,
  popoverSaveButtonLabel: popoverSaveButtonLabelFromProps,
  timezoneID,
  tokenOverflowBehavior,
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
  experimental,
}: PowerSearchProps) {
  const size = useSize(sizeProp, 'md');
  const config = useInternalConfig(configProp);
  const searchSource = usePowerSearchSource(config, maxSearchResults);
  const t = useComponentTranslator();
  const locale = useLocale();
  const label = labelFromProps ?? t('@astryx.powersearch.label');
  const placeholder =
    placeholderFromProps ?? t('@astryx.powersearch.placeholder');
  const popoverSaveButtonLabel =
    popoverSaveButtonLabelFromProps ?? t('@astryx.powersearch.editor.apply');
  const tokenizerRef = useRef<TokenizerHandle>(null);

  // Experimental presentation. `adaptive`
  // resolves through the policy the selection controls share; an open flow
  // keeps its presentation until it closes, so a resolution change mid-task
  // cannot pull the surface out from under the person.
  const presentation = experimental?.presentation ?? 'popover';
  const resolvedPresentation = useAdaptivePresentation(presentation);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Latched for the flow's lifetime: the flow stays presented after it closes
  // until the sheets have run their exit and handed focus back to the trigger.
  // Without the latch, `adaptive` resolving to `popover` mid-session (a phone
  // turned to landscape) would unmount the sheets and the trigger they return
  // focus to in the same render, dropping focus to the page body.
  const [isSheetPresented, setIsSheetPresented] = useState(false);
  const isSheetPresentation =
    isSheetOpen || isSheetPresented || resolvedPresentation === 'bottom-sheet';
  const triggerRef = useRef<HTMLButtonElement>(null);
  // `hasAutoFocus` applies only to the control the field first mounts. A
  // presentation swap remounts the control (combobox input or trigger), and
  // React's `autoFocus` on the new one would pull focus from wherever on the
  // page it was; the roots' callback refs hand over the focus the field held
  // instead. A field that never swaps keeps `autoFocus` on every render, so a
  // Dialog that keeps it mounted still finds its `data-autofocus` on open.
  const [autoFocusState, setAutoFocusState] = useState({
    presentation: isSheetPresentation,
    isFirstControl: true,
  });
  if (autoFocusState.presentation !== isSheetPresentation) {
    setAutoFocusState({
      presentation: isSheetPresentation,
      isFirstControl: false,
    });
  }
  const autoFocusOnMount =
    hasAutoFocus &&
    autoFocusState.isFirstControl &&
    autoFocusState.presentation === isSheetPresentation;
  // A focus the swap moves continues the same visit to the field: the
  // control that held focus is gone (no blur fires for a removed element), so
  // the caller is told of neither a blur nor a new focus.
  const isSwapFocusRef = useRef(false);
  const focusAfterSwap = useCallback((control: {focus(): void} | null) => {
    if (control == null) {
      return;
    }
    isSwapFocusRef.current = true;
    try {
      control.focus();
    } finally {
      isSwapFocusRef.current = false;
    }
  }, []);
  const handleFieldFocus = useCallback(
    (event: React.FocusEvent) => {
      if (!isSwapFocusRef.current) {
        onFocus?.(event);
      }
    },
    [onFocus],
  );
  const handleFieldBlur = useCallback(
    (event: React.FocusEvent) => {
      onBlur?.(event);
    },
    [onBlur],
  );
  // While the flow is open, the sheet announces its own content from inside
  // its dialog; this component announces only with the flow closed, and
  // `useAnnounce` routes those messages by where the field is — into a Dialog
  // or modal Drawer that holds it, or the shared channel when no modal does.
  // A result count that changed during the flow's exit is spoken once the
  // flow has fully closed and focus is back on the trigger: the closing
  // dialog stays modal through its exit, so neither its region nor the
  // page-body channel is heard before.
  const afterCloseResultCountRef = useRef<string | null>(null);
  const triggerId = useId();
  const triggerLabelId = useId();
  const triggerContentId = useId();
  const statusMessageId = useId();
  // A field that becomes disabled cannot keep its flow open, and must not
  // reopen it when re-enabled. Adjusted in the
  // render that sees the change, not an effect, so no frame shows both.
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled && isSheetOpen) {
      setIsSheetOpen(false);
    }
  }
  useDevWarning(
    'PowerSearch',
    '`menuWidth` has no surface in the bottom-sheet presentation: the sheet flow has no typeahead popover to size. Scope it to the popover presentation or leave it out.',
    isSheetPresentation && menuWidth != null,
  );
  useDevWarning(
    'PowerSearch',
    '`tokenOverflowBehavior` has no surface in the bottom-sheet presentation: the trigger wraps its display-only tokens. Scope it to the popover presentation or leave it out.',
    isSheetPresentation && tokenOverflowBehavior != null,
  );

  const [popoverState, setPopoverStateRaw] = useState<PopoverState>({
    type: 'idle',
  });

  // A default filter token's visible text: its label (field and operator)
  // and its value. The token's remove button and editor dialog are named by
  // the same text.
  const tokenText = useCallback(
    (filter: PowerSearchFilter) => {
      const field = config.getField(filter.field);
      const operator = config.getOperator(filter.field, filter.operator);
      const fieldLabel = field?.label ?? '';
      const operatorLabel = operator ? resolveOperatorLabel(operator, t) : '';
      const label = `${fieldLabel}: ${operatorLabel}`.trim();
      const value = operator
        ? formatTokenValueText(
            operator.value,
            filter.value,
            Math.max(
              maxTokenLength - fieldLabel.length - operatorLabel.length,
              10,
            ),
            locale,
          )
        : null;
      return {label, value, full: value != null ? `${label} ${value}` : label};
    },
    [config, maxTokenLength, t, locale],
  );
  // The built-in token being edited. A token from a `components` override
  // names itself, so its editor keeps the plain popover.
  const editedFilter =
    popoverState.type === 'editing'
      ? filters[popoverState.filterIndex]
      : undefined;
  const editedOperator =
    editedFilter != null
      ? config.getOperator(editedFilter.field, editedFilter.operator)
      : undefined;
  const editedBuiltInFilter =
    editedOperator == null ||
    componentOverrides?.[editedOperator.value.type]?.Token == null
      ? editedFilter
      : undefined;
  // Whether the editor popover is open, for the hand-off below, which runs
  // in the commit that swaps presentations.
  const isPopoverOpenRef = useRef(false);
  // When `adaptive` flips to the sheet while the editor popover is open (a
  // phone rotated), the editing ends with the popover: its state returns to
  // idle (through the raw setter, since the tokenizer input is gone), in the
  // render that sees the swap, so a later switch back does not reopen a stale
  // editor.
  if (isSheetPresentation && popoverState.type !== 'idle') {
    setPopoverStateRaw({type: 'idle'});
  }

  // Layer for positioning the edit popover anchored to the tokenizer
  const handleLayerHide = useCallback(() => {
    isPopoverOpenRef.current = false;
    setPopoverStateRaw({type: 'idle'});
  }, []);

  const popover = usePopover({
    onHide: handleLayerHide,
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // Adding: the popup's own listbox/menu content is the exposed semantics,
    // and focus stays on the tokenizer input, so a dialog wrapper is
    // incorrect. Editing a token: focus moves into the editor's controls, so
    // the editor is a non-modal dialog named by the token's visible text.
    role: editedBuiltInFilter != null ? 'dialog' : 'none',
    isModal: false,
    dialogLabel:
      editedBuiltInFilter != null
        ? tokenText(editedBuiltInFilter).full
        : undefined,
  });

  // A presentation swap removes the focused control, so the other
  // presentation's primary control (the combobox input or the trigger) takes
  // focus and focus never falls to the page body. Each presentation keys its
  // root, so a swap mounts a new root. The detaching root notes that it held
  // focus, which also covers an input focused by server-rendered `autofocus`
  // before hydration. The editor popover is portaled outside the root, so an
  // open editor counts as held focus. The attaching root gives focus to its
  // primary control when focus has fallen to the page body; the sheet root
  // also hides a popover layer left open.
  const isFocusPendingHandOffRef = useRef(false);
  const hidePopover = popover.hide;
  const handOffFocusRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node == null) {
        return;
      }
      const trigger = triggerRef.current;
      const isSheetRoot = trigger != null && node.contains(trigger);
      // The sheet presentation preloads the flow's chunk, so the first press
      // opens without waiting for the network; nothing renders.
      if (isSheetRoot) {
        void loadPowerSearchBottomSheet();
      }
      if (isSheetRoot && isPopoverOpenRef.current) {
        isPopoverOpenRef.current = false;
        hidePopover();
      }
      const takesFocus = isFocusPendingHandOffRef.current;
      isFocusPendingHandOffRef.current = false;
      if (takesFocus && isFocusDetached(node.ownerDocument)) {
        focusAfterSwap(isSheetRoot ? trigger : tokenizerRef.current);
      }
      return () => {
        if (
          node.contains(node.ownerDocument.activeElement) ||
          isPopoverOpenRef.current
        ) {
          isFocusPendingHandOffRef.current = true;
        }
      };
    },
    [focusAfterSwap, hidePopover],
  );

  // Wrapper that manages layer visibility and tokenizer focus alongside state
  const setPopoverState = useCallback(
    (state: PopoverState) => {
      isPopoverOpenRef.current = state.type !== 'idle';
      setPopoverStateRaw(state);
      if (state.type !== 'idle') {
        // Schedule after the current frame so React can render the popover
        // content and the typeahead's synchronous focus() has completed
        requestAnimationFrame(() => {
          popover.show();
          tokenizerRef.current?.blur();
        });
      } else {
        popover.hide();
        tokenizerRef.current?.focus();
      }
    },
    [popover],
  );

  // Expose imperative handle; in the sheet presentation the trigger is the
  // field's focusable control.
  useImperativeHandle(handleRef, () => ({
    focusTypeahead() {
      if (isSheetPresentation) {
        triggerRef.current?.focus();
      } else {
        tokenizerRef.current?.focus();
      }
    },
    blurTypeahead() {
      if (isSheetPresentation) {
        triggerRef.current?.blur();
      } else {
        tokenizerRef.current?.blur();
      }
    },
  }));

  // Convert filters to tokenizer items
  const tokenizerValue: PowerSearchItem[] = useMemo(() => {
    return filters.map((filter, index) => {
      const field = config.getField(filter.field);
      const operator = config.getOperator(filter.field, filter.operator);
      const resolvedOp = operator ? resolveOperatorLabel(operator, t) : '';
      const operatorLabel = resolvedOp ? `: ${resolvedOp}` : '';
      const valueStr = operator
        ? formatFilterValue(
            config,
            operator.value,
            filter.value,
            maxTokenLength,
            t,
            locale,
            timezoneID,
          )
        : '';

      const displayLabel = valueStr
        ? `${field?.label ?? filter.field}${operatorLabel} ${valueStr}`
        : `${field?.label ?? filter.field}${operatorLabel}`;

      return {
        id: `filter-${index}-${filter.field}-${filter.operator}`,
        label: displayLabel,
        auxiliaryData: {
          fieldKey: filter.field,
          operatorKey: filter.operator,
          filterValue: filter.value,
          filterIndex: index,
        },
      };
    });
  }, [filters, config, maxTokenLength, timezoneID, t, locale]);

  // Handle tokenizer onChange (field selected from typeahead)
  const handleTokenizerChange = useCallback(
    (
      _items: PowerSearchItem[],
      change: {item?: PowerSearchItem; type: string},
    ) => {
      if (change.type === 'add' && change.item) {
        const auxData = change.item.auxiliaryData as PowerSearchAuxData;
        if (!auxData) {
          return;
        }

        const field = config.getField(auxData.fieldKey);
        if (!field) {
          return;
        }

        const operator = auxData.operatorKey
          ? config.getOperator(auxData.fieldKey, auxData.operatorKey)
          : config.getDefaultOperator(auxData.fieldKey);

        // If the item already has a filter value (e.g. content search), add immediately
        if (auxData.filterValue && operator) {
          const newFilter: PowerSearchFilter = {
            field: auxData.fieldKey,
            operator: operator.key,
            value: auxData.filterValue,
          };
          onChange([...filters, newFilter], 'add', filters.length);
          return;
        }

        // For "empty" type operators, add the filter immediately
        if (operator?.value.type === 'empty') {
          const newFilter: PowerSearchFilter = {
            field: auxData.fieldKey,
            operator: operator.key,
            value: {type: 'empty'},
          };
          onChange([...filters, newFilter], 'add', filters.length);
          return;
        }

        // Open the edit popover for the new filter
        setPopoverState({
          type: 'adding',
          partialFilter: {
            field: auxData.fieldKey,
            operator: operator?.key,
            value: undefined,
          },
        });
      } else if (change.type === 'remove') {
        const keptIndices = new Set(
          _items.map(item => item.auxiliaryData?.filterIndex),
        );
        const firstRemovedIndex = filters.findIndex(
          (_, i) => !keptIndices.has(i),
        );
        if (firstRemovedIndex >= 0) {
          onChange(
            filters.filter((_, i) => keptIndices.has(i)),
            'remove',
            firstRemovedIndex,
          );
        }
      }
    },
    [config, filters, onChange, setPopoverState],
  );

  // Tokenizer's Backspace and Clear all do not go through renderToken. This
  // predicate locks each read-only filter, and every token of a read-only
  // field.
  const isItemRemovable = useCallback(
    (item: SearchableItem) => {
      if (isReadOnly) {
        return false;
      }
      const filterIndex = (item as PowerSearchItem).auxiliaryData?.filterIndex;
      return filterIndex == null || !filters[filterIndex]?.isReadOnly;
    },
    [filters, isReadOnly],
  );

  // Handle clicking a token to edit
  const handleTokenClick = useCallback(
    (index: number) => {
      if (isReadOnly || isDisabled) {
        return;
      }

      const filter = filters[index];
      if (filter.isReadOnly) {
        return;
      }

      // An "empty" operator filter has no value for the built-in editor to
      // edit: commit it as that editor's save would, the way adding one does,
      // instead of opening it. A consumer's `empty` Editor override still opens.
      const operator = config.getOperator(filter.field, filter.operator);
      if (commitsWithoutEditor(operator, componentOverrides)) {
        const newFilters = [...filters];
        newFilters[index] = {
          field: filter.field,
          operator: filter.operator,
          value: {type: 'empty'},
        };
        onChange(newFilters, 'edit', index);
        setPopoverState({type: 'idle'});
        return;
      }

      setPopoverState({
        type: 'editing',
        filterIndex: index,
        partialFilter: {
          field: filter.field,
          operator: filter.operator,
          value: filter.value,
        },
      });
    },
    [
      filters,
      isReadOnly,
      isDisabled,
      config,
      componentOverrides,
      onChange,
      setPopoverState,
    ],
  );

  // Handle popover save
  const handlePopoverSave = useCallback(
    (savedFilter: PowerSearchFilter | null) => {
      if (popoverState.type === 'adding') {
        if (savedFilter) {
          onChange([...filters, savedFilter], 'add', filters.length);
        }
      } else if (popoverState.type === 'editing') {
        if (savedFilter) {
          const newFilters = [...filters];
          newFilters[popoverState.filterIndex] = savedFilter;
          onChange(newFilters, 'edit', popoverState.filterIndex);
        } else {
          // Delete
          const newFilters = filters.filter(
            (_, i) => i !== popoverState.filterIndex,
          );
          onChange(newFilters, 'remove', popoverState.filterIndex);
        }
      }
      setPopoverState({type: 'idle'});
    },
    [popoverState, filters, onChange, setPopoverState],
  );

  // Handle popover cancel
  const handlePopoverCancel = useCallback(() => {
    setPopoverState({type: 'idle'});
  }, [setPopoverState]);

  // Token renderer for both presentations. Given `onRemove`, the token is
  // the tokenizer field's: click edits, × removes. Without it (the sheet
  // presentation's trigger) the token is display-only; the field as a whole
  // opens the flow.
  const renderFilterToken = useCallback(
    (item: PowerSearchItem, onRemove: (() => void) | undefined) => {
      const auxData = item.auxiliaryData;
      const filterIndex = auxData?.filterIndex ?? -1;
      const filter = filterIndex >= 0 ? filters[filterIndex] : undefined;

      const field = auxData ? config.getField(auxData.fieldKey) : undefined;
      const operator = auxData?.operatorKey
        ? config.getOperator(auxData.fieldKey, auxData.operatorKey)
        : undefined;

      const canInteract =
        onRemove != null && !isReadOnly && !isDisabled && !filter?.isReadOnly;
      const handleClick = canInteract
        ? () => handleTokenClick(filterIndex)
        : undefined;
      const handleRemove = canInteract ? onRemove : undefined;

      // Check for full Token override
      const TokenOverride = operator
        ? componentOverrides?.[operator.value.type]?.Token
        : undefined;

      if (TokenOverride && filter && field && operator) {
        return (
          <TokenOverride
            config={configProp}
            filter={filter}
            field={field}
            operator={operator}
            maxLength={maxTokenLength}
            onClick={handleClick}
            onRemove={handleRemove}
            isDisabled={isDisabled}
          />
        );
      }

      // Default token rendering
      const fieldLabel = field?.label ?? '';
      const operatorLabel = operator ? resolveOperatorLabel(operator, t) : '';
      const text =
        filter != null
          ? tokenText(filter)
          : {label: `${fieldLabel}: ${operatorLabel}`.trim(), value: null};
      const tokenLabel = text.label;
      const fullText =
        text.value != null ? `${text.label} ${text.value}` : text.label;
      const valueContent =
        text.value != null ? (
          <PowerSearchTokenValue text={text.value} />
        ) : undefined;

      // Show entity photo as token icon for single-entity filters
      let tokenIcon: ReactNode | undefined;
      if (
        filter?.value.type === 'entity_list' &&
        filter.value.value.length === 1 &&
        filter.value.value[0].photo
      ) {
        const entity = filter.value.value[0];
        tokenIcon = <Avatar src={entity.photo} name={entity.label} size={16} />;
      }

      // A token that opens its editor says that it opens a dialog, and the
      // naming context names it by all its visible text.
      const editorProps =
        handleClick != null &&
        !commitsWithoutEditor(operator, componentOverrides)
          ? {
              'aria-haspopup': 'dialog' as const,
              'aria-expanded':
                popoverState.type === 'editing' &&
                popoverState.filterIndex === filterIndex,
            }
          : null;

      return (
        <TokenNamingContext
          value={{actionName: fullText, removeName: fullText}}>
          <Token
            label={tokenLabel}
            size={size}
            icon={tokenIcon}
            {...editorProps}
            endContent={valueContent}
            onMouseDown={
              handleClick
                ? e => {
                    // Keep a token press from entering Tokenizer's input-focus
                    // redirect. Click still edits/removes; Tab entry is unchanged.
                    e.preventDefault();
                  }
                : undefined
            }
            onClick={
              handleClick
                ? (e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleClick();
                  }
                : undefined
            }
            onRemove={handleRemove}
            isDisabled={isDisabled}
          />
        </TokenNamingContext>
      );
    },
    [
      filters,
      config,
      configProp,
      maxTokenLength,
      size,
      isReadOnly,
      isDisabled,
      handleTokenClick,
      componentOverrides,
      t,
      popoverState,
      tokenText,
    ],
  );

  const renderToken = useCallback(
    (item: PowerSearchItem, onRemove: () => void) =>
      renderFilterToken(item, onRemove),
    [renderFilterToken],
  );

  // Custom typeahead item renderer — adds field icon and description
  const renderItem = useCallback(
    (item: PowerSearchItem) => {
      const auxData = item.auxiliaryData;
      if (!auxData) {
        return <TypeaheadItem item={item} />;
      }

      const field = config.getField(auxData.fieldKey);
      let icon: React.ReactNode = null;

      if (field?.icon) {
        icon = field.icon;
      } else if (field) {
        const operator = auxData.operatorKey
          ? config.getOperator(auxData.fieldKey, auxData.operatorKey)
          : config.getDefaultOperator(auxData.fieldKey);
        const iconName =
          OPERATOR_VALUE_TYPE_TO_ICON[operator?.value.type ?? ''] ?? 'search';
        icon = <Icon icon={iconName} size="sm" color="secondary" />;
      }

      return (
        <TypeaheadItem
          item={item}
          icon={icon}
          description={field?.description}
        />
      );
    },
    [config],
  );

  // The partial filter for the popover
  const popoverPartialFilter =
    popoverState.type !== 'idle' ? popoverState.partialFilter : null;

  // Resolve custom Editor override for the current popover filter
  const EditorOverride = useMemo(() => {
    if (!popoverPartialFilter?.field || !popoverPartialFilter?.operator) {
      return undefined;
    }
    const op = config.getOperator(
      popoverPartialFilter.field,
      popoverPartialFilter.operator,
    );
    return op ? componentOverrides?.[op.value.type]?.Editor : undefined;
  }, [popoverPartialFilter, config, componentOverrides]);

  // Render popover content — either custom Editor or default
  const popoverContent = useMemo(() => {
    if (!popoverPartialFilter) {
      return null;
    }

    const mode = popoverState.type === 'editing' ? 'edit' : 'create';

    const popoverKey =
      popoverState.type === 'editing'
        ? `edit-${popoverState.filterIndex}-${popoverPartialFilter.field}`
        : `add-${popoverPartialFilter.field}`;

    if (EditorOverride) {
      return (
        <EditorOverride
          key={popoverKey}
          config={configProp}
          filter={popoverPartialFilter}
          mode={mode}
          onSave={handlePopoverSave}
          onCancel={handlePopoverCancel}
          saveButtonLabel={popoverSaveButtonLabel}
          isReadOnly={isReadOnly}
        />
      );
    }

    return (
      <PowerSearchEditPopover
        key={popoverKey}
        config={config}
        filter={popoverPartialFilter}
        mode={mode}
        onSave={handlePopoverSave}
        onCancel={handlePopoverCancel}
        saveButtonLabel={popoverSaveButtonLabel}
        maxMenuItems={maxOperatorMenuItems}
        isReadOnly={isReadOnly}
      />
    );
  }, [
    popoverPartialFilter,
    popoverState,
    EditorOverride,
    configProp,
    config,
    handlePopoverSave,
    handlePopoverCancel,
    popoverSaveButtonLabel,
    maxOperatorMenuItems,
    isReadOnly,
  ]);

  // Plain-text form of the result count, shared by the visible label and the
  // screen-reader announcement so the two never drift. The ICU plural handles
  // the number formatting + `result` vs `results` in one message so translators
  // can match the locale's plural rules.
  const resultCountText = useMemo((): string | null => {
    if (resultCount == null) {
      return null;
    }
    if (typeof resultCount === 'number') {
      return t('@astryx.powersearch.resultCount', {count: resultCount});
    }
    return resultCount;
  }, [resultCount, t]);

  // This Effect synchronizes a polite live region with the result count,
  // mirroring the way Typeahead announces its dropdown result count: the count
  // is otherwise only shown visually and stays silent to assistive tech. The
  // region follows where the field is: the modal that holds the field (a
  // Dialog, a modal Drawer), else the shared channel. While a sheet of the flow is open the sheet itself announces the
  // count from inside its dialog, and this Effect stays quiet. Only a
  // change after mount is spoken — the count present on mount is not
  // announced unprompted — and the guard compares against the last announced
  // text rather than a mounted flag, so StrictMode's effect replay announces
  // nothing either. A change that lands while the flow is closing waits for
  // the trigger focus, since the dialog is still modal through its exit. The
  // announcement acquires no resource, so there is no cleanup.
  const announce = useAnnounce();
  // PowerSearch words its Clear all as its record does; the field announces
  // these words instead of Tokenizer's (component:Tokenizer AR7).
  const hasReadOnlyFilter = filters.some(filter => filter.isReadOnly);
  const clearAllMessage = useMemo(
    () =>
      hasReadOnlyFilter
        ? t('@astryx.powersearch.editableFiltersRemoved')
        : t('@astryx.powersearch.allFiltersRemoved'),
    [hasReadOnlyFilter, t],
  );
  const announcedResultCountRef = useRef(resultCountText);
  const isSheetExiting = isSheetPresented && !isSheetOpen;
  useEffect(() => {
    if (resultCountText === announcedResultCountRef.current) {
      return;
    }
    announcedResultCountRef.current = resultCountText;
    if (resultCountText != null) {
      if (isSheetExiting) {
        afterCloseResultCountRef.current = resultCountText;
      } else if (!isSheetOpen) {
        announce(resultCountText);
      }
    }
  }, [resultCountText, announce, isSheetExiting, isSheetOpen]);

  // Build combined endContent from resultCount + endContent props
  const combinedEndContent = useMemo((): React.ReactNode => {
    const resultCountNode =
      // eslint-disable-next-line @astryx/no-nullish-jsx-guard -- `resultCountText` is a formatted string, not a slot
      resultCountText != null ? (
        <span {...stylex.props(resultCountStyles.text)}>{resultCountText}</span>
      ) : null;

    if (resultCountNode && endContent) {
      return (
        <>
          {resultCountNode}
          {endContent}
        </>
      );
    }
    return resultCountNode || endContent || undefined;
  }, [resultCountText, endContent]);

  // ------------------------------------------------------- sheet trigger --

  // Disabled-reason tooltip for the sheet trigger. Disabled controls swallow
  // pointer events, so the listeners attach to the field's control box; the
  // trigger stays perceivable through aria-disabled.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: isSheetPresentation && showsDisabledMessage,
  });
  const rootRef = useMergedRefs(
    ref,
    popover.triggerRef as React.Ref<HTMLDivElement>,
    handOffFocusRef,
  );

  const openSheet = useCallback(() => {
    if (isDisabled) {
      return;
    }
    // The flow restores focus to the element that was active when it opened;
    // make sure that is the trigger even for a tap on a token.
    triggerRef.current?.focus({preventScroll: true});
    setIsSheetPresented(true);
    setIsSheetOpen(true);
  }, [isDisabled]);

  // The field's end lane — the result count and `endContent` — sits outside
  // the trigger button: a caller's action button there keeps its own tab stop
  // and taps, and an interactive control must not nest in a component
  // button, so a tap on it must not open the flow.
  const endLaneRef = useRef<HTMLDivElement>(null);
  const handleTriggerWrapperClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Tokens are display-only; a tap on them or the empty space around them
      // opens the flow. The trigger button handles its own click, and the end
      // lane handles its own.
      if (
        event.target instanceof Node &&
        (triggerRef.current?.contains(event.target) ||
          endLaneRef.current?.contains(event.target))
      ) {
        return;
      }
      openSheet();
    },
    [openSheet],
  );

  const handleTriggerFocusWithin = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      // The flow focuses the trigger only after its exit completes; that focus
      // is the signal that the retained sheets can leave. If the resolution
      // moved to the popover meanwhile, the tokenizer input takes over the
      // focus once it mounts (the hand-off above).
      if (!isSheetOpen && isSheetPresented) {
        setIsSheetPresented(false);
        // The dialogs have closed: the page-body channel is exposed again.
        const resultCount = afterCloseResultCountRef.current;
        afterCloseResultCountRef.current = null;
        if (resultCount != null) {
          announce(resultCount);
        }
      }
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        handleFieldFocus(event);
      }
    },
    [announce, handleFieldFocus, isSheetOpen, isSheetPresented],
  );
  const handleTriggerBlurWithin = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      ) {
        handleFieldBlur(event);
      }
    },
    [handleFieldBlur],
  );

  if (isSheetPresentation) {
    const triggerDescribedBy =
      [
        status?.message ? statusMessageId : null,
        showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      ]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <div key="sheet" ref={rootRef} {...themeProps('power-search')}>
        <Field
          label={label}
          isLabelHidden={isLabelHidden}
          inputID={triggerId}
          labelID={triggerLabelId}
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
            ref={disabledMessageTooltip.ref}
            onClick={handleTriggerWrapperClick}
            onFocus={handleTriggerFocusWithin}
            onBlur={handleTriggerBlurWithin}
            aria-disabled={isDisabled ? true : undefined}
            {...stylex.props(
              inputWrapperStyles.base,
              sheetTriggerStyles.wrapper,
              filters.length > 0 && sheetTriggerStyles.wrapperWithTokens,
              sheetTriggerSizeStyles[size],
              isDisabled && inputWrapperStyles.disabled,
              status && inputStatusBorderStyles[status.type],
              status &&
                !isDisabled &&
                inputStatusHoverShadowStyles[status.type],
              status && inputStatusFocusWithinStyles[status.type],
            )}>
            {/* The trigger's name is the label plus everything visible here:
                the placeholder, or the tokens, so speech input can say what
                it sees and assistive technology hears the selected filters
                (WCAG 2.5.3). */}
            <div
              id={triggerContentId}
              {...stylex.props(sheetTriggerStyles.contentSection)}>
              {isRenderable(startIcon as React.ReactNode) && (
                <span
                  {...stylex.props(
                    filters.length > 0 &&
                      sheetTriggerStyles.startIconWithTokens,
                  )}>
                  {renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
                </span>
              )}
              {tokenizerValue.map(item => (
                <React.Fragment key={item.id}>
                  {renderFilterToken(item, undefined)}
                </React.Fragment>
              ))}
              <button
                type="button"
                id={triggerId}
                ref={triggerRef}
                // The field's primary control: `data-testid` lands here, as it
                // lands on the combobox input in the popover presentation.
                data-testid={testId}
                autoFocus={autoFocusOnMount}
                onClick={openSheet}
                aria-disabled={isDisabled ? true : undefined}
                aria-haspopup="dialog"
                aria-expanded={isSheetOpen}
                aria-labelledby={`${triggerLabelId} ${triggerContentId}`}
                aria-describedby={triggerDescribedBy}
                {...stylex.props(
                  sheetTriggerStyles.trigger,
                  filters.length > 0 && sheetTriggerStyles.triggerWithTokens,
                )}>
                {filters.length === 0 ? placeholder : null}
              </button>
            </div>
            {(endContent || isRenderable(resultCountText)) && (
              <div
                ref={endLaneRef}
                {...stylex.props(sheetTriggerStyles.endSection)}>
                {isRenderable(resultCountText) && (
                  <span {...stylex.props(resultCountStyles.text)}>
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
        {/* Mounted from the press until the flow's exit has completed and
            focus is back on the trigger (`isSheetPresented`): at rest the
            field renders its trigger alone — no closed dialogs, rows, search
            field or editors in the DOM. */}
        {(isSheetOpen || isSheetPresented) && (
          <PowerSearchSheetHost
            isOpen={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            finalFocusRef={triggerRef}
            resultCountText={resultCountText}
            config={config}
            configProp={configProp}
            filters={filters}
            onChange={onChange}
            searchSource={searchSource}
            placeholder={placeholder}
            isReadOnly={isReadOnly}
            isDisabled={isDisabled}
            hasClear={hasClear}
            maxOperatorMenuItems={maxOperatorMenuItems}
            maxSearchResults={maxSearchResults}
            saveButtonLabel={popoverSaveButtonLabelFromProps}
            components={componentOverrides}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div key="popover" ref={rootRef} {...themeProps('power-search')}>
        {/* The field's Clear all announces PowerSearch's own words
            (component:PowerSearch; component:Tokenizer AR7). */}
        <TokenizerClearAllMessageContext value={clearAllMessage}>
          <TokenizerItemRemovableContext value={isItemRemovable}>
            <Tokenizer
              handleRef={tokenizerRef}
              label={label}
              isLabelHidden={isLabelHidden}
              searchSource={searchSource}
              value={tokenizerValue}
              onChange={handleTokenizerChange}
              renderToken={renderToken}
              renderItem={renderItem}
              maxMenuItems={MAX_BROWSE_MENU_ITEMS}
              menuWidth={menuWidth}
              placeholder={filters.length === 0 ? placeholder : ''}
              hasAutoFocus={autoFocusOnMount}
              hasClear={hasClear && !isReadOnly}
              startIcon={startIcon}
              endContent={combinedEndContent}
              isDisabled={isDisabled}
              disabledMessage={disabledMessage}
              size={size}
              tokenOverflowBehavior={tokenOverflowBehavior}
              hasEntriesOnFocus
              debounceMs={0}
              status={status}
              statusVariant={statusVariant}
              onFocus={handleFieldFocus}
              onBlur={handleFieldBlur}
              containerXstyle={xstyle}
              containerClassName={className}
              containerStyle={style}
              data-testid={testId}
            />
          </TokenizerItemRemovableContext>
        </TokenizerClearAllMessageContext>
      </div>
      {popover.render(popoverContent, {
        placement: 'below',
        alignment: 'start',
        offset: spacingVars['--spacing-1'],
        xstyle: [popoverLayerStyles.layer, layerAnimations.below],
      })}
    </>
  );
}

PowerSearch.displayName = 'PowerSearch';
