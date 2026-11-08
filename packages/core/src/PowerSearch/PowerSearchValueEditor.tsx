// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearchValueEditor.tsx
 * @input OperatorValue, FilterValue, onChange callback, and the presentation
 *   the editor renders in
 * @output Renders the appropriate editor for a filter value type
 * @position Sub-component; consumed by PowerSearchEditPopover (popover
 *   presentation) and PowerSearchBottomSheet (sheet presentation, which
 *   renders the closed vocabularies as rows itself)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 */

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  OperatorValue,
  FilterValue,
  EnumItem,
  PowerSearchEntity,
  DateTimeRangePart,
} from './types';
import type {InternalConfig} from './useInternalConfig';
import type {SearchableItem, SearchSource} from '../Typeahead/types';
import type {ISODateString} from '../utils/dateTypes';
import type {ISOTimeString} from '../utils';

// Lazy import to avoid circular deps — these are all from the same package
import {TextInput} from '../TextInput';
import {NumberInput} from '../NumberInput';
import {
  resolveNumberInputCommit,
  type NumberInputCommitDecision,
} from '../NumberInput/numberInputCommit';
import {DateInput} from '../DateInput';
import {
  isoDateTimeToUnixSeconds,
  isoDateToUnixSeconds,
  resolveDateZone,
  unixSecondsToISODate,
  unixSecondsToISODateTime,
} from './powerSearchDateZone';
import type {ISODateTimeString} from '../DateTimeInput/DateTimeInput';
import {HStack} from '../HStack/HStack';
import {DateRangeInput, type DateRange} from '../DateRangeInput';
import {resolveDateTimeRangePart} from './resolveDateTimeRangePart';
import {TimeInput} from '../TimeInput';
import {Selector} from '../Selector';
import {Tokenizer} from '../Tokenizer/Tokenizer';
import {Typeahead} from '../Typeahead';
import {useLocale} from '../i18n';
import type {TranslatorFn} from '../i18n';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/PowerSearch/PowerSearchValueEditor.generated';

registerEnglishFallback(english);

export interface PowerSearchValueEditorProps {
  operatorValue: OperatorValue;
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  config: InternalConfig;
  /** Max suggestions in string and entity value typeaheads. */
  maxMenuItems?: number;
  isDisabled?: boolean;
  timezoneID?: string;
  /**
   * Called when a staged value no longer stands — the number input's draft is
   * empty or does not parse — so the sheet presentation's confirm action
   * disables again. Only the `bottom-sheet` presentation stages as typed; the
   * popover commits on blur or Enter and never calls this.
   */
  onUnstage?: () => void;
  /**
   * Where the editor renders. In the `bottom-sheet` presentation the inputs
   * fill the sheet's width, number inputs stage every parseable keystroke
   * (the sheet's footer confirms; there is no Enter-to-save), the date range
   * shows one month, and list values open the Tokenizer's own sheet titled
   * with `fieldLabel`.
   * @default 'popover'
   */
  presentation?: 'popover' | 'bottom-sheet';
  /** The field's label; names the Tokenizer sheet in the sheet presentation. */
  fieldLabel?: string;
}

type EditorPresentation = NonNullable<
  PowerSearchValueEditorProps['presentation']
>;

// =============================================================================
// Helpers
// =============================================================================

function createStaticSource(
  items: SearchableItem[],
): SearchSource<SearchableItem> {
  return {
    search(query: string) {
      const lower = query.toLowerCase();
      return items.filter(item => item.label.toLowerCase().includes(lower));
    },
    bootstrap() {
      return items;
    },
  };
}

function enumItemsToSearchableItems(
  values: ReadonlyArray<EnumItem>,
): SearchableItem[] {
  return values.map(item => ({
    id: item.value,
    label: item.label,
  }));
}

function dateRangePartToISO(
  part: DateTimeRangePart,
  nowSeconds: number,
  zone: string | undefined,
): ISODateString {
  return unixSecondsToISODate(resolveDateTimeRangePart(part, nowSeconds), zone);
}

// =============================================================================
// Individual Editors
// =============================================================================

function StringEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter: _onEnter,
  maxMenuItems,
  isDisabled,
  presentation,
}: {
  operatorValue: OperatorValue & {type: 'string'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  maxMenuItems?: number;
  isDisabled?: boolean;
  presentation: EditorPresentation;
}) {
  const t = useComponentTranslator();
  const width = presentation === 'bottom-sheet' ? '100%' : undefined;
  const currentValue = filterValue?.type === 'string' ? filterValue.value : '';

  // When a searchSource is provided, render a typeahead instead of a plain
  // text input so users get suggestions (#1103).
  if (operatorValue.searchSource) {
    const selectedItem: SearchableItem | null = currentValue
      ? {id: currentValue, label: currentValue}
      : null;

    return (
      <Typeahead
        label={t('@astryx.powersearch.valueEditor.value')}
        isLabelHidden
        isDisabled={isDisabled}
        searchSource={operatorValue.searchSource}
        value={selectedItem}
        onChange={item => {
          if (item) {
            onChange({type: 'string', value: item.label}, true);
          } else {
            onChange({type: 'string', value: ''});
          }
        }}
        placeholder={t('@astryx.powersearch.valueEditor.searchPlaceholder')}
        debounceMs={150}
        maxMenuItems={maxMenuItems}
        width={width}
      />
    );
  }

  return (
    <TextInput
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue}
      placeholder={t('@astryx.powersearch.valueEditor.enterValuePlaceholder')}
      onChange={(value: string) => {
        onChange({type: 'string', value});
      }}
      width={width}
    />
  );
}

function StringListEditor({
  operatorValue,
  filterValue,
  onChange,
  maxMenuItems,
  isDisabled,
  presentation,
  fieldLabel,
}: {
  operatorValue: OperatorValue & {type: 'string_list'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  maxMenuItems?: number;
  isDisabled?: boolean;
  presentation: EditorPresentation;
  fieldLabel?: string;
}) {
  const t = useComponentTranslator();
  const isSheet = presentation === 'bottom-sheet';
  const currentValue: SearchableItem[] = useMemo(() => {
    if (filterValue?.type !== 'string_list') {
      return [];
    }
    return filterValue.value.map(v => ({id: v, label: v}));
  }, [filterValue]);

  const source = useMemo<SearchSource<SearchableItem>>(() => {
    if (operatorValue.searchSource) {
      return operatorValue.searchSource;
    }
    // Free-text: accept anything typed
    return {
      search: () => [],
      bootstrap: () => [],
    };
  }, [operatorValue.searchSource]);

  // Enable creatable mode when no searchSource is provided (free-text tags)
  // or when isArbitraryStringAllowed is explicitly set (#1107).
  const hasCreate =
    operatorValue.isArbitraryStringAllowed || !operatorValue.searchSource;

  // In the sheet presentation the list value edits through the Tokenizer's
  // own sheet, titled with the field's label; a popover menu inside a sheet
  // would stack a second anchored layer on a surface the person is already in.
  return (
    <Tokenizer
      label={
        isSheet && fieldLabel != null
          ? fieldLabel
          : t('@astryx.powersearch.valueEditor.values')
      }
      isLabelHidden
      isDisabled={isDisabled}
      searchSource={source}
      value={currentValue}
      onChange={items => {
        onChange({
          type: 'string_list',
          value: items.map(item => item.label),
        });
      }}
      placeholder={t('@astryx.powersearch.valueEditor.addValuesPlaceholder')}
      debounceMs={operatorValue.searchSource ? 150 : 0}
      hasCreate={hasCreate}
      maxMenuItems={maxMenuItems}
      width={isSheet ? '100%' : undefined}
      presentation={isSheet ? 'bottom-sheet' : 'popover'}
    />
  );
}

function useNumberEditorHandlers({
  valueType,
  min,
  max,
  isIntegerOnly,
  onChange,
  onEnter,
  onUnstage,
  stagesAsTyped,
}: {
  valueType: 'integer' | 'float';
  min?: number;
  max?: number;
  isIntegerOnly: boolean;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  onUnstage?: () => void;
  /**
   * Stage every keystroke the input would commit, and unstage when the draft
   * stops parsing. The sheet presentation confirms from its footer, so the
   * confirm action must enable while the person is still typing and disable
   * again over an empty field; the popover commits on blur or Enter.
   */
  stagesAsTyped: boolean;
}) {
  const locale = useLocale();
  const pendingDecisionRef = useRef<NumberInputCommitDecision | null>(null);
  const toFilterValue = useCallback(
    (value: number): FilterValue =>
      valueType === 'integer'
        ? {type: 'integer', value}
        : {type: 'float', value},
    [valueType],
  );
  const handleChange = useCallback(
    (value: number) => {
      onChange(toFilterValue(value));
    },
    [onChange, toFilterValue],
  );
  const handleFocus = useCallback(() => {
    pendingDecisionRef.current = null;
  }, []);
  const handleInput = useCallback(
    (event: FormEvent<HTMLElement>) => {
      const decision = resolveNumberInputCommit(
        (event.currentTarget as HTMLInputElement).value,
        {min, max, isIntegerOnly, locale, hasClear: false},
      );
      pendingDecisionRef.current = decision;
      if (stagesAsTyped) {
        if (decision.type === 'commit') {
          onChange(toFilterValue(decision.value));
        } else {
          // Cleared, or not a number: nothing stands to confirm.
          onUnstage?.();
        }
      }
    },
    [
      isIntegerOnly,
      locale,
      max,
      min,
      onChange,
      onUnstage,
      stagesAsTyped,
      toFilterValue,
    ],
  );
  const handleEnter = useCallback(() => {
    const decision = pendingDecisionRef.current;
    pendingDecisionRef.current = null;
    if (decision === null) {
      onEnter?.();
    } else if (decision.type === 'commit') {
      onChange(toFilterValue(decision.value), true);
    }
  }, [onChange, onEnter, toFilterValue]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.stopPropagation();
      }
    },
    [],
  );

  return {handleChange, handleEnter, handleFocus, handleInput, handleKeyDown};
}

function IntegerEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter,
  onUnstage,
  isDisabled,
  presentation,
}: {
  operatorValue: OperatorValue & {type: 'integer'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  onUnstage?: () => void;
  isDisabled?: boolean;
  presentation: EditorPresentation;
}) {
  const t = useComponentTranslator();
  const currentValue =
    filterValue?.type === 'integer' ? filterValue.value : undefined;
  const handlers = useNumberEditorHandlers({
    valueType: 'integer',
    min: operatorValue.minValue,
    max: operatorValue.maxValue,
    isIntegerOnly: true,
    onChange,
    onEnter,
    onUnstage,
    stagesAsTyped: presentation === 'bottom-sheet',
  });

  return (
    <NumberInput
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue ?? null}
      onChange={handlers.handleChange}
      onFocus={handlers.handleFocus}
      onInput={handlers.handleInput}
      onEnter={handlers.handleEnter}
      onKeyDown={handlers.handleKeyDown}
      min={operatorValue.minValue}
      max={operatorValue.maxValue}
      units={operatorValue.units}
      isIntegerOnly
      placeholder={t('@astryx.powersearch.valueEditor.enterNumberPlaceholder')}
      width={presentation === 'bottom-sheet' ? '100%' : undefined}
    />
  );
}

function FloatEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter,
  onUnstage,
  isDisabled,
  presentation,
}: {
  operatorValue: OperatorValue & {type: 'float'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  onEnter?: () => void;
  onUnstage?: () => void;
  isDisabled?: boolean;
  presentation: EditorPresentation;
}) {
  const t = useComponentTranslator();
  const currentValue =
    filterValue?.type === 'float' ? filterValue.value : undefined;
  const handlers = useNumberEditorHandlers({
    valueType: 'float',
    min: operatorValue.minValue,
    max: operatorValue.maxValue,
    isIntegerOnly: false,
    onChange,
    onEnter,
    onUnstage,
    stagesAsTyped: presentation === 'bottom-sheet',
  });

  return (
    <NumberInput
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue ?? null}
      onChange={handlers.handleChange}
      onFocus={handlers.handleFocus}
      onInput={handlers.handleInput}
      onEnter={handlers.handleEnter}
      onKeyDown={handlers.handleKeyDown}
      min={operatorValue.minValue}
      max={operatorValue.maxValue}
      units={operatorValue.units}
      placeholder={t('@astryx.powersearch.valueEditor.enterNumberPlaceholder')}
      width={presentation === 'bottom-sheet' ? '100%' : undefined}
    />
  );
}

function TimeEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
  presentation,
}: {
  operatorValue: OperatorValue & {type: 'time'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
  presentation: EditorPresentation;
}) {
  const t = useComponentTranslator();
  const currentValue =
    filterValue?.type === 'time'
      ? (filterValue.value as ISOTimeString)
      : undefined;

  return (
    <TimeInput
      label={t('@astryx.powersearch.valueEditor.time')}
      isLabelHidden
      isDisabled={isDisabled}
      value={currentValue}
      onChange={value => {
        if (value != null) {
          onChange({type: 'time', value});
        }
      }}
      min={operatorValue.minValue as ISOTimeString | undefined}
      max={operatorValue.maxValue as ISOTimeString | undefined}
      width={presentation === 'bottom-sheet' ? '100%' : undefined}
    />
  );
}

/**
 * A value with a time of day: its wall-clock time in `zone`, read and written
 * as one instant through a date picker beside a time field.
 */
function DateTimeEditor({
  label,
  isDisabled,
  presentation,
  unixSeconds,
  zone,
  onChange,
}: {
  label: string;
  isDisabled?: boolean;
  presentation: EditorPresentation;
  unixSeconds: number | undefined;
  zone: string | undefined;
  onChange: (value: FilterValue) => void;
}) {
  const t = useComponentTranslator();
  const [datePart, timePart] = useMemo(() => {
    if (unixSeconds == null) {
      return [undefined, undefined] as const;
    }
    const [date, time] = unixSecondsToISODateTime(unixSeconds, zone).split('T');
    return [date as ISODateString, time as ISOTimeString] as const;
  }, [unixSeconds, zone]);
  // A part picked first waits for the other. The editor writes the instant
  // once both parts exist.
  const [pendingDate, setPendingDate] = useState<ISODateString | undefined>();
  const [pendingTime, setPendingTime] = useState<ISOTimeString | undefined>();
  const date = datePart ?? pendingDate;
  const time = timePart ?? pendingTime;
  const commit = (
    nextDate: ISODateString | undefined,
    nextTime: ISOTimeString | undefined,
  ) => {
    if (nextDate == null || nextTime == null) {
      return;
    }
    onChange({
      type: 'date_absolute',
      unixSeconds: isoDateTimeToUnixSeconds(
        `${nextDate}T${nextTime}` as ISODateTimeString,
        zone,
      ),
    });
  };
  const width = presentation === 'bottom-sheet' ? '100%' : undefined;
  // A nested sub-filter row keeps its selectors' widths, so the pair wraps
  // where the value cell is narrower than the two inputs.
  return (
    <HStack gap={2} wrap="wrap">
      <DateInput
        label={label}
        isLabelHidden
        isDisabled={isDisabled}
        value={date}
        onChange={value => {
          setPendingDate(value);
          commit(value, time);
        }}
        width={width}
      />
      <TimeInput
        label={t('@astryx.powersearch.valueEditor.time')}
        isLabelHidden
        isDisabled={isDisabled}
        value={time}
        onChange={value => {
          setPendingTime(value);
          commit(date, value);
        }}
        width={width}
      />
    </HStack>
  );
}

function DateAbsoluteEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
  presentation,
  timezoneID,
}: {
  operatorValue: OperatorValue & {type: 'date_absolute'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
  presentation: EditorPresentation;
  timezoneID?: string;
}) {
  const t = useComponentTranslator();
  const label = t('@astryx.powersearch.valueEditor.date');
  const unixSeconds =
    filterValue?.type === 'date_absolute' ? filterValue.unixSeconds : undefined;

  if (operatorValue.isDateOnly === false) {
    return (
      <DateTimeEditor
        label={label}
        isDisabled={isDisabled}
        presentation={presentation}
        unixSeconds={unixSeconds}
        zone={resolveDateZone(timezoneID, false)}
        onChange={onChange}
      />
    );
  }

  // A calendar day edits in the one zone the token and the label read it in.
  const zone = resolveDateZone(timezoneID, true);

  return (
    <DateInput
      label={label}
      isLabelHidden
      isDisabled={isDisabled}
      value={
        unixSeconds == null
          ? undefined
          : unixSecondsToISODate(unixSeconds, zone)
      }
      onChange={value => {
        if (value != null) {
          onChange({
            type: 'date_absolute',
            unixSeconds: isoDateToUnixSeconds(value, zone),
          });
        }
      }}
      width={presentation === 'bottom-sheet' ? '100%' : undefined}
    />
  );
}

const RELATIVE_DATE_UNITS = [
  {
    unit: 'day',
    plural: 'days',
    amounts: [1, 3, 7, 14, 30],
    ago: '@astryx.powersearch.sheet.relativeDaysAgo',
    fromNow: '@astryx.powersearch.sheet.relativeDaysFromNow',
  },
  {
    unit: 'week',
    plural: 'weeks',
    amounts: [1, 2, 4],
    ago: '@astryx.powersearch.sheet.relativeWeeksAgo',
    fromNow: '@astryx.powersearch.sheet.relativeWeeksFromNow',
  },
  {
    unit: 'month',
    plural: 'months',
    amounts: [1, 3, 6, 12],
    ago: '@astryx.powersearch.sheet.relativeMonthsAgo',
    fromNow: '@astryx.powersearch.sheet.relativeMonthsFromNow',
  },
] as const;

/**
 * The relative-date choices an operator offers, in display order. Shared by
 * the popover's Selector and the sheet presentation's rows so both list the
 * same values. With `t` the labels resolve through the catalog's ICU plural
 * messages (the sheet presentation's rows); without it they are the popover
 * editor's own literals. In English the two read identically.
 */
export function buildRelativeDateOptions(
  operatorValue: OperatorValue & {type: 'date_relative'},
  t?: TranslatorFn,
): {value: string; label: string}[] {
  const result: {value: string; label: string}[] = [];
  for (const {unit, plural, amounts, ago, fromNow} of RELATIVE_DATE_UNITS) {
    for (const amount of amounts) {
      const unitWord = amount === 1 ? unit : plural;
      if (operatorValue.isPastAllowed !== false) {
        result.push({
          value: `${amount}${unit[0]}_ago`,
          label: t ? t(ago, {count: amount}) : `${amount} ${unitWord} ago`,
        });
      }
      if (operatorValue.isFutureAllowed !== false) {
        result.push({
          value: `${amount}${unit[0]}_from_now`,
          label: t
            ? t(fromNow, {count: amount})
            : `${amount} ${unitWord} from now`,
        });
      }
    }
  }
  return result;
}

function DateRelativeEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'date_relative'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  isDisabled?: boolean;
}) {
  const t = useComponentTranslator();
  const currentValue =
    filterValue?.type === 'date_relative' ? filterValue.value : undefined;

  // The choices depend on the two flags only; a config that rebuilds its
  // operator objects per render keeps the same memoized list.
  const {isPastAllowed, isFutureAllowed} = operatorValue;
  const options = useMemo(
    () =>
      buildRelativeDateOptions({
        type: 'date_relative',
        isPastAllowed,
        isFutureAllowed,
      }),
    [isPastAllowed, isFutureAllowed],
  );

  return (
    <Selector
      label={t('@astryx.powersearch.valueEditor.relativeDate')}
      isLabelHidden
      isDisabled={isDisabled}
      options={options}
      value={currentValue}
      onChange={value => {
        onChange({type: 'date_relative', value}, true);
      }}
    />
  );
}

function DateRangeEditor({
  filterValue,
  onChange,
  isDisabled,
  presentation,
  timezoneID,
}: {
  operatorValue: OperatorValue & {type: 'date_range'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
  presentation: EditorPresentation;
  timezoneID?: string;
}) {
  const t = useComponentTranslator();
  // A range part is a calendar day, read and written as a date-only value is.
  const zone = resolveDateZone(timezoneID, true);
  const currentValue = useMemo<DateRange | null>(() => {
    if (filterValue?.type !== 'date_range') {
      return null;
    }
    const {start, end} = filterValue.value;
    const nowSeconds = Date.now() / 1000;
    return {
      start: dateRangePartToISO(start, nowSeconds, zone),
      end: dateRangePartToISO(end, nowSeconds, zone),
    };
  }, [filterValue, zone]);

  const handleChange = useCallback(
    (range: DateRange | null) => {
      if (range == null) {
        return;
      }
      onChange({
        type: 'date_range',
        value: {
          start: {
            type: 'ABSOLUTE',
            unixSeconds: isoDateToUnixSeconds(range.start, zone),
          },
          end: {
            type: 'ABSOLUTE',
            unixSeconds: isoDateToUnixSeconds(range.end, zone),
          },
        },
      });
    },
    [onChange, zone],
  );

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    // DateRangeInput owns an inner popover. Its Enter activation must not reach
    // the parent PowerSearch shortcut before the focused button's click runs.
    if (event.key === 'Enter') {
      event.stopPropagation();
    }
  }, []);

  return (
    <div onKeyDown={handleKeyDown}>
      <DateRangeInput
        label={t('@astryx.powersearch.valueEditor.dateRange')}
        isLabelHidden
        isDisabled={isDisabled}
        value={currentValue}
        onChange={handleChange}
        hasClear={false}
        // A phone-wide sheet fits one month; the popover keeps the default.
        numberOfMonths={presentation === 'bottom-sheet' ? 1 : undefined}
        width={presentation === 'bottom-sheet' ? '100%' : undefined}
      />
    </div>
  );
}

function EnumEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'enum'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue, shouldSave?: boolean) => void;
  isDisabled?: boolean;
}) {
  const t = useComponentTranslator();
  const currentValue =
    filterValue?.type === 'enum' ? filterValue.value : undefined;

  const options = useMemo(
    () =>
      operatorValue.values.map(item => ({
        value: item.value,
        label: item.label,
      })),
    [operatorValue.values],
  );

  return (
    <Selector
      label={t('@astryx.powersearch.valueEditor.value')}
      isLabelHidden
      isDisabled={isDisabled}
      options={options}
      value={currentValue}
      onChange={value => {
        onChange({type: 'enum', value}, true);
      }}
    />
  );
}

function EnumListEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'enum_list'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useComponentTranslator();
  const items = useMemo(
    () => enumItemsToSearchableItems(operatorValue.values),
    [operatorValue.values],
  );

  const source = useMemo(() => createStaticSource(items), [items]);

  const currentValue: SearchableItem[] = useMemo(() => {
    if (filterValue?.type !== 'enum_list') {
      return [];
    }
    return filterValue.value.map(v => {
      const item = operatorValue.values.find(e => e.value === v);
      return {id: v, label: item?.label ?? v};
    });
  }, [filterValue, operatorValue.values]);

  return (
    <Tokenizer
      label={t('@astryx.powersearch.valueEditor.values')}
      isLabelHidden
      isDisabled={isDisabled}
      searchSource={source}
      value={currentValue}
      onChange={selectedItems => {
        onChange({
          type: 'enum_list',
          value: selectedItems.map(item => item.id),
        });
      }}
      placeholder={t('@astryx.powersearch.valueEditor.selectValuesPlaceholder')}
      hasEntriesOnFocus
      debounceMs={0}
      // A closed vocabulary: every value is a valid choice, so the menu shows
      // all of them instead of BaseTypeahead's 10-suggestion default, which
      // would silently drop valid choices with no way to reach them.
      maxMenuItems={items.length}
      presentation="popover"
    />
  );
}

function EntityListEditor({
  operatorValue,
  filterValue,
  onChange,
  maxMenuItems,
  isDisabled,
  presentation,
  fieldLabel,
}: {
  operatorValue: OperatorValue & {type: 'entity_list'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  maxMenuItems?: number;
  isDisabled?: boolean;
  presentation: EditorPresentation;
  fieldLabel?: string;
}) {
  const t = useComponentTranslator();
  const isSheet = presentation === 'bottom-sheet';
  const source = useMemo<SearchSource<SearchableItem>>(() => {
    if (operatorValue.searchSource) {
      return operatorValue.searchSource;
    }
    return {
      search: () => [],
      bootstrap: () => [],
    };
  }, [operatorValue.searchSource]);

  // Preserve photo in auxiliaryData so it round-trips through the tokenizer (#1106).
  const currentValue: SearchableItem[] = useMemo(() => {
    if (filterValue?.type !== 'entity_list') {
      return [];
    }
    return filterValue.value.map((entity: PowerSearchEntity) => ({
      id: entity.id,
      label: entity.label,
      auxiliaryData: entity.photo ? {photo: entity.photo} : undefined,
    }));
  }, [filterValue]);

  // Sheet presentation: the Tokenizer's own sheet, titled with the field
  // label, as for string_list.
  return (
    <Tokenizer
      label={
        isSheet && fieldLabel != null
          ? fieldLabel
          : t('@astryx.powersearch.valueEditor.entities')
      }
      isLabelHidden
      isDisabled={isDisabled}
      searchSource={source}
      value={currentValue}
      onChange={items => {
        onChange({
          type: 'entity_list',
          // Round-trip photo from auxiliaryData back to PowerSearchEntity (#1106).
          value: items.map(item => {
            const aux = item.auxiliaryData as {photo?: string} | undefined;
            return {
              id: item.id,
              label: item.label,
              ...(aux?.photo ? {photo: aux.photo} : {}),
            };
          }),
        });
      }}
      renderItem={operatorValue.renderItem}
      placeholder={t('@astryx.powersearch.valueEditor.searchPlaceholder')}
      debounceMs={operatorValue.searchSource ? 150 : 0}
      maxMenuItems={maxMenuItems}
      width={isSheet ? '100%' : undefined}
      presentation={isSheet ? 'bottom-sheet' : 'popover'}
    />
  );
}

function CustomEditor({
  operatorValue,
  filterValue,
  onChange,
  isDisabled,
}: {
  operatorValue: OperatorValue & {type: 'custom'};
  filterValue: FilterValue | undefined;
  onChange: (value: FilterValue) => void;
  isDisabled?: boolean;
}) {
  const t = useComponentTranslator();
  const currentValue =
    filterValue?.type === 'custom' ? filterValue.value : null;
  const EditorComponent = operatorValue.Editor;

  return (
    <EditorComponent
      isDisabled={isDisabled}
      onChange={value => {
        if (value != null) {
          onChange({type: 'custom', value});
        }
      }}
      placeholder={t('@astryx.powersearch.valueEditor.enterValuePlaceholder')}
      value={currentValue}
    />
  );
}

// =============================================================================
// Main Dispatcher
// =============================================================================

export function PowerSearchValueEditor({
  operatorValue,
  filterValue,
  onChange,
  onEnter,
  maxMenuItems,
  isDisabled,
  onUnstage,
  presentation = 'popover',
  fieldLabel,
  timezoneID,
}: PowerSearchValueEditorProps) {
  switch (operatorValue.type) {
    case 'empty':
      return null;

    case 'string':
      return (
        <StringEditor
          isDisabled={isDisabled}
          presentation={presentation}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          onEnter={onEnter}
          maxMenuItems={maxMenuItems}
        />
      );

    case 'string_list':
      return (
        <StringListEditor
          isDisabled={isDisabled}
          presentation={presentation}
          fieldLabel={fieldLabel}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          maxMenuItems={maxMenuItems}
        />
      );

    case 'integer':
      return (
        <IntegerEditor
          isDisabled={isDisabled}
          presentation={presentation}
          onUnstage={onUnstage}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          onEnter={onEnter}
        />
      );

    case 'float':
      return (
        <FloatEditor
          isDisabled={isDisabled}
          presentation={presentation}
          onUnstage={onUnstage}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          onEnter={onEnter}
        />
      );

    case 'time':
      return (
        <TimeEditor
          isDisabled={isDisabled}
          presentation={presentation}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'date_absolute':
      return (
        <DateAbsoluteEditor
          isDisabled={isDisabled}
          presentation={presentation}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          timezoneID={timezoneID}
        />
      );

    case 'date_relative':
      return (
        <DateRelativeEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'date_range':
      return (
        <DateRangeEditor
          isDisabled={isDisabled}
          presentation={presentation}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          timezoneID={timezoneID}
        />
      );

    case 'enum':
      return (
        <EnumEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'enum_list':
      return (
        <EnumListEditor
          isDisabled={isDisabled}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
        />
      );

    case 'entity_list':
      return (
        <EntityListEditor
          isDisabled={isDisabled}
          presentation={presentation}
          fieldLabel={fieldLabel}
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          maxMenuItems={maxMenuItems}
        />
      );

    case 'custom':
      return (
        <CustomEditor
          operatorValue={operatorValue}
          filterValue={filterValue}
          onChange={onChange}
          isDisabled={isDisabled}
        />
      );

    case 'nested':
      // Nested filters are complex — simplified v1 just shows a message
      return null;

    default:
      return null;
  }
}
