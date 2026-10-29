// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearch.tsx
 * @input PowerSearchConfig, filters, onChange
 * @output Structured filter bar with token-based filter management
 * @position Main component; forwards DOM ref and exposes tokenizer control via
 *   handleRef
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 * - /packages/cli/assets/templates/blocks/components/PowerSearch/ (showcase blocks)
 */

import React, {
  useCallback,
  useEffect,
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
import {TypeaheadItem} from '../Typeahead/TypeaheadItem';
import {Token} from '../Token';
import {Avatar} from '../Avatar';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {Icon} from '../Icon';
import type {IconType} from '../Icon';
import type {IconName} from '../Icon/globalIconRegistry';
import type {InputStatus, FieldStatusVariant} from '../Field';
import {usePopover} from '../Popover/usePopover';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {useAnnounce} from '../hooks/useAnnounce';
import {
  spacingVars,
  colorVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {useSize} from '../SizeContext/SizeContext';
import {useInternalConfig} from './useInternalConfig';
import {usePowerSearchSource} from './usePowerSearchSource';
import {
  formatFilterValue,
  formatDateAbsoluteCompact,
} from './formatFilterValue';
import {PowerSearchEditPopover} from './PowerSearchEditPopover';
import {resolveOperatorLabel} from './resolveOperatorLabel';
import {themeProps} from '../utils/themeProps';
import {truncateCharacters} from '../utils/characters';
import {useTranslator} from '../i18n';
import {useLocale} from '../i18n/useLocale';
import type {Locale} from '../i18n/types';
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
  EnumItem,
  PowerSearchComponents,
} from './types';

import {useMergedRefs} from '../hooks/useMergedRefs';
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

function truncateString(value: string, limit: number): string {
  // Same semantics as before — strings within limit + 3 pass through, longer
  // ones cut to limit + '...' — but counted in characters, not code units.
  return truncateCharacters(value, limit + 3, '...');
}

function getEnumLabel(values: ReadonlyArray<EnumItem>, value: string): string {
  return values.find(v => v.value === value)?.label ?? value;
}

function PowerSearchTokenValue({
  operatorValue,
  filterValue,
  maxLength,
  locale,
}: {
  operatorValue: OperatorValue;
  filterValue: FilterValue;
  maxLength: number;
  locale: Locale;
}) {
  switch (filterValue.type) {
    case 'empty':
      return null;

    case 'string':
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {truncateString(filterValue.value, maxLength)}
        </span>
      );

    case 'integer':
    case 'float':
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {filterValue.value}
        </span>
      );

    case 'enum':
      if (operatorValue.type === 'enum') {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {truncateString(
              getEnumLabel(operatorValue.values, filterValue.value),
              maxLength,
            )}
          </span>
        );
      }
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {truncateString(filterValue.value, maxLength)}
        </span>
      );

    case 'string_list': {
      const items = filterValue.value;
      if (items.length === 0) {
        return null;
      }
      if (items.length === 1) {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {truncateString(items[0], maxLength)}
          </span>
        );
      }
      const totalLength = items.reduce((sum, s) => sum + s.length, 0);
      if (totalLength > maxLength) {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {items.length} items
          </span>
        );
      }
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {items.join(', ')}
        </span>
      );
    }

    case 'enum_list': {
      const items = filterValue.value;
      if (items.length === 0) {
        return null;
      }
      if (operatorValue.type === 'enum_list') {
        const labels = items.map(v => getEnumLabel(operatorValue.values, v));
        if (labels.length === 1) {
          return (
            <span {...stylex.props(tokenValueStyles.value)}>
              {truncateString(labels[0], maxLength)}
            </span>
          );
        }
        const totalLength = labels.reduce((sum, s) => sum + s.length, 0);
        if (totalLength > maxLength) {
          return (
            <span {...stylex.props(tokenValueStyles.value)}>
              {labels.length} items
            </span>
          );
        }
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {labels.join(', ')}
          </span>
        );
      }
      if (items.length === 1) {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {truncateString(items[0], maxLength)}
          </span>
        );
      }
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {items.length} items
        </span>
      );
    }

    case 'entity_list': {
      const entities = filterValue.value;
      if (entities.length === 0) {
        return null;
      }
      if (entities.length === 1) {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {truncateString(entities[0].label, maxLength)}
          </span>
        );
      }
      const totalLength = entities.reduce((sum, e) => sum + e.label.length, 0);
      if (totalLength > maxLength) {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {entities.length} items
          </span>
        );
      }
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {entities.map(e => e.label).join(', ')}
        </span>
      );
    }

    case 'time':
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {filterValue.value}
        </span>
      );

    case 'date_absolute': {
      const formatted = formatDateAbsoluteCompact(
        filterValue.unixSeconds,
        locale,
      );
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {truncateString(formatted, maxLength)}
        </span>
      );
    }

    case 'date_relative':
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {truncateString(filterValue.value, maxLength)}
        </span>
      );

    case 'date_range':
      return <span {...stylex.props(tokenValueStyles.value)}>date range</span>;

    case 'custom':
      if (operatorValue.type === 'custom') {
        return (
          <span {...stylex.props(tokenValueStyles.value)}>
            {truncateString(
              operatorValue.getString(filterValue.value),
              maxLength,
            )}
          </span>
        );
      }
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {filterValue.value}
        </span>
      );

    case 'nested': {
      const count = filterValue.value.length;
      return (
        <span {...stylex.props(tokenValueStyles.value)}>
          {count === 1 ? '1 filter' : `${count} filters`}
        </span>
      );
    }

    default:
      return null;
  }
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
  statusVariant?: FieldStatusVariant;
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
}: PowerSearchProps) {
  const size = useSize(sizeProp, 'md');
  const config = useInternalConfig(configProp);
  const searchSource = usePowerSearchSource(config, maxSearchResults);
  const t = useTranslator();
  const locale = useLocale();
  const label = labelFromProps ?? t('@astryx.powersearch.label');
  const placeholder =
    placeholderFromProps ?? t('@astryx.powersearch.placeholder');
  const popoverSaveButtonLabel =
    popoverSaveButtonLabelFromProps ?? t('@astryx.powersearch.editor.apply');
  const tokenizerRef = useRef<TokenizerHandle>(null);

  const [popoverState, setPopoverStateRaw] = useState<PopoverState>({
    type: 'idle',
  });

  // Layer for positioning the edit popover anchored to the tokenizer
  const handleLayerHide = useCallback(() => {
    setPopoverStateRaw({type: 'idle'});
  }, []);

  const popover = usePopover({
    onHide: handleLayerHide,
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // The popup's own listbox/menu content is the exposed semantics; focus
    // stays on the tokenizer input, so a modal dialog wrapper is incorrect.
    role: 'none',
  });

  // Wrapper that manages layer visibility and tokenizer focus alongside state
  const setPopoverState = useCallback(
    (state: PopoverState) => {
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

  // Expose imperative handle
  useImperativeHandle(handleRef, () => ({
    focusTypeahead() {
      tokenizerRef.current?.focus();
    },
    blurTypeahead() {
      tokenizerRef.current?.blur();
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
      } else if (change.type === 'remove' && change.item) {
        const auxData = change.item.auxiliaryData as PowerSearchAuxData;
        if (auxData?.filterIndex != null) {
          const newFilters = filters.filter((_, i) =>
            _items.some(item => item.auxiliaryData?.filterIndex === i),
          );
          onChange(newFilters, 'remove', auxData.filterIndex);
        }
      }
    },
    [config, filters, onChange, setPopoverState],
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
      if (
        operator?.value.type === 'empty' &&
        componentOverrides?.empty?.Editor == null
      ) {
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

  // Custom token renderer
  // Custom token renderer
  const renderToken = useCallback(
    (item: PowerSearchItem, onRemove: () => void) => {
      const auxData = item.auxiliaryData;
      const filterIndex = auxData?.filterIndex ?? -1;
      const filter = filterIndex >= 0 ? filters[filterIndex] : undefined;

      const field = auxData ? config.getField(auxData.fieldKey) : undefined;
      const operator = auxData?.operatorKey
        ? config.getOperator(auxData.fieldKey, auxData.operatorKey)
        : undefined;

      const canInteract = !isReadOnly && !isDisabled && !filter?.isReadOnly;
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
      const tokenLabel = `${fieldLabel}: ${operatorLabel}`.trim();
      const adjustedMaxLength = Math.max(
        maxTokenLength - fieldLabel.length - operatorLabel.length,
        10,
      );

      const valueContent =
        operator && filter ? (
          <PowerSearchTokenValue
            operatorValue={operator.value}
            filterValue={filter.value}
            maxLength={adjustedMaxLength}
            locale={locale}
          />
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

      return (
        <Token
          label={tokenLabel}
          size={size}
          icon={tokenIcon}
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
      );
    },
    [
      filters,
      config,
      configProp,
      maxTokenLength,
      locale,
      size,
      isReadOnly,
      isDisabled,
      handleTokenClick,
      componentOverrides,
      t,
    ],
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

  // Announce result-count changes to screen readers through a polite live
  // region, mirroring the way Typeahead announces its dropdown result count.
  // The count is otherwise only shown visually and stays silent to assistive
  // tech. Only a change after mount is spoken: the guard compares against the
  // last announced text rather than a mounted flag, so StrictMode's effect
  // replay (which resets a flag and would speak the count present on mount
  // unprompted) announces nothing until the count changes.
  const announce = useAnnounce();
  const announcedResultCountRef = useRef(resultCountText);
  useEffect(() => {
    if (resultCountText === announcedResultCountRef.current) {
      return;
    }
    announcedResultCountRef.current = resultCountText;
    if (resultCountText != null) {
      announce(resultCountText);
    }
  }, [resultCountText, announce]);

  // Build combined endContent from resultCount + endContent props
  const combinedEndContent = useMemo((): React.ReactNode => {
    const resultCountNode =
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

  return (
    <>
      <div
        ref={useMergedRefs(
          ref,
          popover.triggerRef as React.Ref<HTMLDivElement>,
        )}
        {...themeProps('power-search')}>
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
          hasAutoFocus={hasAutoFocus}
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
          onFocus={onFocus}
          onBlur={onBlur}
          containerXstyle={xstyle}
          containerClassName={className}
          containerStyle={style}
          data-testid={testId}
        />
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
