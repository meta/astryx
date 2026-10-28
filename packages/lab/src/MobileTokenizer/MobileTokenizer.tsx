// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobileTokenizer.tsx
 * @input Uses public @astryxdesign/core components and hooks only
 *   (AlertDialog, BottomSheet, Button, CheckboxIndicator, EmptyState, Field,
 *   Icon, Spinner, Text, TextInput, Token, VisuallyHidden, useAnnounce,
 *   useMergedRefs, useTooltip, useTranslator)
 * @output Exports MobileTokenizer — Lab prototype of the touch Tokenizer
 *   flow with a single searchable sheet, stable in-session checkbox ordering,
 *   and progressive long-list rendering
 * @position Lab (canary) stack layer 1: the touch sheet's user-experience
 *   pass happens here; Core's sheet presentation (`component:Tokenizer`
 *   DEC-3, FR16–FR24, AR6) is implemented but not exposed. The behaviors
 *   below are at parity with Core's sheet where Lab's component has the same
 *   part: Clear all confirmed, focusable while spent, announced once the
 *   confirmation has closed (FR24); the bootstrap set capped at
 *   `maxMenuItems` and an empty one showing only the search field (FR20);
 *   the trigger described in the inline input's order, then the count and
 *   the rendered tokens by id (AR6, `spec:AST-085` FR5); form carriers only
 *   while enabled (`spec:AST-085` FR3, FR17); the source read through a ref and one
 *   `willSearchFor` rule for the pending state (FR20); the sheet mounted only
 *   from the press until its exit completes (INV7); announcements from inside
 *   the dialog (AR6, `spec:AST-086` FR14); a disabled field closing its sheet
 *   and keeping the query (FR17, FR18); catalog strings.
 *
 * API mirrors Core Tokenizer (label/isLabelHidden/searchSource/value/onChange/
 * change, renderItem, hasCreate, maxEntries) so graduation is an import swap.
 * Lab deltas: the filter is a bordered TextInput (Core's PanelSearchInput is
 * not exported), and there is no theming/spec contract yet.
 */

import type React from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Field} from '@astryxdesign/core/Field';
import {useAnnounce, useMergedRefs} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {Icon} from '@astryxdesign/core/Icon';
import {CheckboxIndicator} from '@astryxdesign/core/Indicator';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {useTooltip} from '@astryxdesign/core/Tooltip';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {composeEventHandlers, mergeProps} from '@astryxdesign/core/utils';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {
  colorVars,
  radiusVars,
  sizeVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

export type MobileTokenizerChange<T extends SearchableItem> =
  | {item: T; type: 'add'}
  | {item: T; type: 'create'}
  | {item: T; type: 'remove'}
  | {type: 'reorder'};

export interface MobileTokenizerProps<T extends SearchableItem> extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange'
> {
  label: string;
  /**
   * Hide the visible field label; the trigger and the sheet keep `label` as
   * their accessible name. Mirrors Core Tokenizer.
   */
  isLabelHidden?: boolean;
  searchSource: SearchSource<T>;
  value: T[];
  onChange: (items: T[], change: MobileTokenizerChange<T>) => void;
  /**
   * Render function for a result row's content, shown beside the row's
   * checkbox. Default: the item's label. Mirrors Core Tokenizer.
   */
  renderItem?: (item: T) => ReactNode;
  placeholder?: string;
  description?: string;
  /** Status shown under the field and read with the trigger. */
  status?: {type: 'error' | 'warning' | 'success'; message: string};
  /**
   * Why the field is disabled; exposed as the disabled trigger's description
   * and shown as its tooltip (`spec:AST-085` FR5). Mirrors Core Tokenizer.
   */
  disabledMessage?: string;
  /** Form field name: one hidden carrier per selected item while enabled. */
  htmlName?: string;
  isOptional?: boolean;
  isDisabled?: boolean;
  hasCreate?: boolean;
  maxEntries?: number;
  maxMenuItems?: number;
  minQueryLength?: number;
  debounceMs?: number;
  emptySearchResultsText?: string;
  onChangeQuery?: (query: string) => void;
}

const CREATABLE_ID_PREFIX = '__xds_create__';
const LIST_RENDER_BATCH_SIZE = 50;
const LIST_LOAD_MORE_THRESHOLD_PX = 200;

const styles = stylex.create({
  trigger: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    // The input surface, as Core's sheet trigger has from the shared input
    // wrapper: Field's attached status band sits behind the control, and a
    // transparent trigger would show it through the tokens.
    backgroundColor: colorVars['--color-background-surface'],
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // An aria-disabled button gets no system disabled paint in forced colors;
  // GrayText is the platform's disabled affordance there. Defaults repeat the
  // base values, since StyleX merges per property.
  triggerDisabled: {
    borderColor: {
      default: colorVars['--color-border'],
      '@media (forced-colors: active)': 'GrayText',
    },
    color: {
      default: null,
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  triggerPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
  triggerPlaceholderDisabled: {
    color: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  sheetBody: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    paddingInline: spacingVars['--spacing-3'],
    paddingBlockStart: spacingVars['--spacing-8'],
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  // The manage sheet intentionally has no dedicated close button; the sheet
  // keeps its standard gesture, scrim, and Escape dismissal paths.
  list: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-1'],
    borderWidth: 0,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    textAlign: 'start',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // A Token authors its own color, which forced colors replace with
  // CanvasText; GrayText marks the tokens of a disabled trigger as disabled.
  // The default repeats Token's own default color.
  tokenDisabled: {
    color: {
      default: colorVars['--color-text-primary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  // Same for the indicator's border: GrayText in forced colors, and the
  // default repeats the indicator's disabled border.
  indicatorDisabled: {
    borderColor: {
      default: colorVars['--color-border'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  rowDisabled: {
    color: {
      default: colorVars['--color-text-primary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  rowLabel: {
    flexGrow: 1,
    minWidth: 0,
  },
  createRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    minHeight: 44,
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-1'],
  },
  createLabel: {
    flexGrow: 1,
    minWidth: 0,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlockStart: spacingVars['--spacing-3'],
    marginTop: 'auto',
  },
  footerAction: {
    flexGrow: 1,
    flexBasis: 0,
  },
  filterRow: {
    display: 'flex',
    alignItems: 'flex-end',
    paddingBlockEnd: spacingVars['--spacing-2'],
  },
  // TextInput renders Field (block, shrink-to-fit); xstyle lands on that
  // root, so it must fill the available search row width.
  filterInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: sizeVars['--size-element-lg'],
    minHeight: sizeVars['--size-element-lg'],
  },
  empty: {
    flexGrow: 1,
  },
  emptyHost: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  pending: {
    display: 'flex',
    justifyContent: 'center',
    paddingBlock: spacingVars['--spacing-4'],
  },
});

export function MobileTokenizer<T extends SearchableItem>({
  label,
  isLabelHidden,
  searchSource,
  value,
  onChange,
  renderItem,
  placeholder,
  description,
  status,
  disabledMessage,
  htmlName,
  isOptional,
  isDisabled = false,
  hasCreate = false,
  maxEntries,
  maxMenuItems = 10,
  minQueryLength = 1,
  debounceMs = 150,
  emptySearchResultsText,
  onChangeQuery,
  xstyle,
  id,
  className,
  style,
  'aria-label': ariaLabelProp,
  'aria-describedby': ariaDescribedByProp,
  onClick: callerOnClick,
  onFocus: callerOnFocus,
  onBlur: callerOnBlur,
  ...rest
}: MobileTokenizerProps<T>) {
  const t = useTranslator();
  const generatedTriggerId = useId();
  const triggerId = id ?? generatedTriggerId;
  const descriptionId = useId();
  const statusId = useId();
  const countId = useId();
  // Each rendered token's id, for the trigger's description; the item id is
  // an arbitrary string, so it is encoded rather than used as is.
  const tokenElementId = (itemId: string) =>
    `${countId}-${encodeURIComponent(itemId)}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Whether the caller has been told focus entered the field and not yet
  // that it left: the sheet's focus hand-back is reported as the entry when
  // the trigger never had focus (a tap or click that opened the sheet without
  // focusing the trigger, as Safari does), so a caller never sees a blur
  // without its focus.
  const hasReportedFocusRef = useRef(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // The sheet stays mounted after it closes until BottomSheet has run its
  // exit and handed focus back to the trigger; at rest nothing of the sheet
  // is in the DOM (`architecture:component-style-authoring` INV7).
  const [isSheetPresented, setIsSheetPresented] = useState(false);
  // The sheet's query between presentations: a close the person makes clears
  // it, a close the field forces (becoming disabled while open) keeps it
  // (`component:Tokenizer` FR18). The ref follows every report; the press
  // snapshots it into the state the next presentation starts from.
  const sheetQueryRef = useRef('');
  const [sheetInitialQuery, setSheetInitialQuery] = useState('');
  const handleSheetQueryChange = useCallback(
    (query: string) => {
      sheetQueryRef.current = query;
      onChangeQuery?.(query);
    },
    [onChangeQuery],
  );
  const selectedIds = useMemo(() => new Set(value.map(v => v.id)), [value]);
  const isAtMax = maxEntries != null && value.length >= maxEntries;

  // A field that becomes disabled cannot keep its sheet open, and must not
  // reopen it when re-enabled (FR17). Adjusted in the render that sees the
  // change, not an effect, so no frame shows both. A sheet that was open when
  // the field became disabled stays mounted, closed, so it runs its exit and
  // hands focus back to the trigger; a field disabled from the start mounts
  // no sheet.
  const [wasDisabled, setWasDisabled] = useState(isDisabled);
  const [keepsSheetWhileDisabled, setKeepsSheetWhileDisabled] = useState(false);
  if (isDisabled !== wasDisabled) {
    setWasDisabled(isDisabled);
    if (isDisabled && isSheetOpen) {
      setIsSheetOpen(false);
      setKeepsSheetWhileDisabled(true);
    }
    if (!isDisabled) {
      setKeepsSheetWhileDisabled(false);
    }
  }

  const handleAdd = useCallback(
    (item: T): boolean => {
      if (isDisabled || isAtMax || selectedIds.has(item.id)) {
        return false;
      }
      if (
        hasCreate &&
        typeof item.id === 'string' &&
        item.id.startsWith(CREATABLE_ID_PREFIX)
      ) {
        const created = item.id.slice(CREATABLE_ID_PREFIX.length);
        if (selectedIds.has(created)) {
          return false;
        }
        const createdItem: SearchableItem = {id: created, label: created};
        const real = createdItem as T;
        onChange([...value, real], {item: real, type: 'create'});
        return true;
      }
      onChange([...value, item], {item, type: 'add'});
      return true;
    },
    [hasCreate, isAtMax, isDisabled, onChange, selectedIds, value],
  );
  const handleRemove = useCallback(
    (item: T): boolean => {
      if (isDisabled) {
        return false;
      }
      onChange(
        value.filter(v => v.id !== item.id),
        {item, type: 'remove'},
      );
      return true;
    },
    [isDisabled, onChange, value],
  );
  const handleClearAll = useCallback(() => {
    if (isDisabled || value.length === 0) {
      return;
    }
    onChange([], {item: value[value.length - 1], type: 'remove'});
  }, [isDisabled, onChange, value]);

  const showsDisabledMessage = isDisabled && disabledMessage != null;
  // The disabled reason as a tooltip on the trigger, for hover, focus and
  // touch alike, and the element the trigger's description names
  // (`spec:AST-085` FR5); the trigger is focusable while disabled, so focus
  // triggering reaches keyboard users.
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });
  const triggerMergedRef = useMergedRefs<HTMLButtonElement>(
    triggerRef,
    disabledMessageTooltip.ref,
  );
  // The trigger's description is the inline input's, in its order — the
  // caller's ids, the field description, the status message, the disabled
  // reason (`spec:AST-085` FR5) — then the hidden count and the rendered
  // tokens themselves, each by id: the accessible-description algorithm reads
  // the referenced elements in order and separates them, so every label
  // renders once (`architecture:component-style-authoring` INV7) and no
  // locale's list punctuation is written here (`component:Tokenizer` AR6).
  const triggerDescribedBy =
    [
      ariaDescribedByProp,
      description ? descriptionId : null,
      status?.message ? statusId : null,
      // The disabled reason is the tooltip's element, as for Core's trigger.
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      value.length > 0 ? countId : null,
      ...value.map(item => tokenElementId(item.id)),
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      descriptionID={description ? descriptionId : undefined}
      status={
        status
          ? {type: status.type, message: status.message, messageID: statusId}
          : undefined
      }
      isOptional={isOptional}
      isDisabled={isDisabled}
      inputID={triggerId}
      xstyle={xstyle}>
      {/* The trigger is the control: the caller's base props — `id`,
          `data-*`, `aria-*`, handlers, className, style — reach it, as they
          reach Core's sheet trigger, not the field root; what the trigger
          sets itself is composed with the caller's value, never over it. */}
      <button
        // Typed for a div by the base props; here the control is a button.
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        ref={triggerMergedRef}
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={isSheetOpen}
        // The caller's name wins over the field label.
        aria-label={ariaLabelProp ?? label}
        aria-disabled={isDisabled || undefined}
        // Already merged with the caller's ids, first.
        aria-describedby={triggerDescribedBy}
        // The open runs first and the caller's onClick after it, as Core's
        // trigger composes its click: a caller observes the click but cannot
        // cancel the field's own handling.
        onClick={composeEventHandlers<React.MouseEvent<HTMLButtonElement>>(
          () => {
            if (isDisabled) {
              return;
            }
            setIsSheetPresented(true);
            setSheetInitialQuery(sheetQueryRef.current);
            setIsSheetOpen(true);
          },
          callerOnClick as unknown as
            React.MouseEventHandler<HTMLButtonElement> | undefined,
        )}
        onFocus={event => {
          // BottomSheet focuses the trigger only after its exit completes;
          // that focus is the signal that the retained sheet can leave. The
          // field's own sheet is part of the field, so focus coming back from
          // it is not focus entering from outside: the caller's onFocus stays
          // quiet for it — unless the trigger never had focus (a tap that
          // opened the sheet without focusing it, as Safari does), in which
          // case the hand-back is the entry, and the caller hears it before
          // any blur.
          const isReturningFromSheet = !isSheetOpen && isSheetPresented;
          if (isReturningFromSheet) {
            setIsSheetPresented(false);
          }
          const isInsideTheField =
            isReturningFromSheet && hasReportedFocusRef.current;
          if (isInsideTheField) {
            return;
          }
          hasReportedFocusRef.current = true;
          (
            callerOnFocus as unknown as
              React.FocusEventHandler<HTMLButtonElement> | undefined
          )?.(event);
        }}
        onBlur={event => {
          // Focus moving into the sheet is still the field's; only a blur to
          // somewhere else is reported.
          if (isSheetOpen) {
            return;
          }
          hasReportedFocusRef.current = false;
          (
            callerOnBlur as unknown as
              React.FocusEventHandler<HTMLButtonElement> | undefined
          )?.(event);
        }}
        {...mergeProps(
          stylex.props(styles.trigger, isDisabled && styles.triggerDisabled),
          className,
          style,
        )}>
        {value.length > 0 ? (
          value.map(item => (
            <Token
              key={item.id}
              id={tokenElementId(item.id)}
              label={item.label}
              isDisabled={isDisabled}
              xstyle={isDisabled ? styles.tokenDisabled : undefined}
            />
          ))
        ) : (
          <span
            {...stylex.props(
              styles.triggerPlaceholder,
              isDisabled && styles.triggerPlaceholderDisabled,
            )}>
            {placeholder ?? ''}
          </span>
        )}
      </button>
      {value.length > 0 && (
        <VisuallyHidden id={countId}>
          {t('@astryx.tokenizer.selectedCount', {count: value.length})}
        </VisuallyHidden>
      )}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
      {/* Form carriers, gated as Core's inline field gates its own: a
          disabled field submits nothing (`spec:AST-085` FR3, FR17). */}
      {htmlName != null &&
        !isDisabled &&
        value.map(item => (
          <input key={item.id} type="hidden" name={htmlName} value={item.id} />
        ))}
      {/* Mounted from the press until the sheet's exit has completed and
          focus is back on the trigger: at rest the field renders its trigger
          alone (INV7). */}
      {(isSheetOpen || isSheetPresented) &&
        (!isDisabled || keepsSheetWhileDisabled) && (
          <MobileTokenizerSheet
            isOpen={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            finalFocusRef={triggerRef}
            initialQuery={sheetInitialQuery}
            label={label}
            searchSource={searchSource}
            value={value}
            selectedIds={selectedIds}
            isAtMax={isAtMax}
            hasCreate={hasCreate}
            maxMenuItems={maxMenuItems}
            minQueryLength={minQueryLength}
            debounceMs={debounceMs}
            emptySearchResultsText={emptySearchResultsText}
            renderItem={renderItem}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onClearAll={handleClearAll}
            onChangeQuery={handleSheetQueryChange}
          />
        )}
    </Field>
  );
}

MobileTokenizer.displayName = 'MobileTokenizer';

interface MobileTokenizerSheetProps<T extends SearchableItem> {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  finalFocusRef: RefObject<HTMLElement | null>;
  /** The query this presentation starts with (kept across a forced close). */
  initialQuery: string;
  label: string;
  searchSource: SearchSource<T>;
  value: T[];
  selectedIds: Set<string>;
  isAtMax: boolean;
  hasCreate: boolean;
  maxMenuItems: number;
  minQueryLength: number;
  debounceMs: number;
  emptySearchResultsText?: string;
  renderItem?: (item: T) => ReactNode;
  onAdd: (item: T) => boolean;
  onRemove: (item: T) => boolean;
  onClearAll: () => void;
  onChangeQuery: (query: string) => void;
}

/**
 * The sheet: BottomSheet around the content. The content owns the query; a
 * close the person makes (Done, swipe, scrim, Escape) clears it through a
 * handle from the closing event, so a close the field forces (becoming
 * disabled) keeps it (FR18).
 */
function MobileTokenizerSheet<T extends SearchableItem>({
  isOpen,
  onOpenChange,
  finalFocusRef,
  label,
  ...content
}: MobileTokenizerSheetProps<T>) {
  const clearQueryRef = useRef<(() => void) | null>(null);
  const requestClose = () => {
    clearQueryRef.current?.();
    onOpenChange(false);
  };
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={next => {
        if (next) {
          onOpenChange(true);
        } else {
          requestClose();
        }
      }}
      finalFocusRef={finalFocusRef}
      label={label}
      height="tall"
      padding={0}>
      <MobileTokenizerSheetContent
        {...content}
        isOpen={isOpen}
        label={label}
        clearQueryRef={clearQueryRef}
        onRequestClose={requestClose}
      />
    </BottomSheet>
  );
}

type MobileTokenizerSheetContentProps<T extends SearchableItem> = Omit<
  MobileTokenizerSheetProps<T>,
  'onOpenChange' | 'finalFocusRef'
> & {
  clearQueryRef: RefObject<(() => void) | null>;
  onRequestClose: () => void;
};

/**
 * Rendered inside the sheet's dialog, so every announcement it makes through
 * `useAnnounce` is delivered inside the open modal (`spec:AST-086` FR14).
 */
function MobileTokenizerSheetContent<T extends SearchableItem>({
  isOpen,
  initialQuery,
  clearQueryRef,
  onRequestClose,
  label,
  searchSource,
  value,
  selectedIds,
  isAtMax,
  hasCreate,
  maxMenuItems,
  minQueryLength,
  debounceMs,
  emptySearchResultsText,
  renderItem,
  onAdd,
  onRemove,
  onClearAll,
  onChangeQuery,
}: MobileTokenizerSheetContentProps<T>) {
  const t = useTranslator();
  const announce = useAnnounce();
  const searchRef = useRef<HTMLInputElement>(null);
  const clearAllRef = useRef<HTMLButtonElement>(null);

  // ---- query and search ----
  const [query, setQuery] = useState(initialQuery);
  const trimmedQuery = query.trim();
  // Whether a query is one the source is asked about: empty (the bootstrap
  // set) or at least `minQueryLength`. One rule for every way a query comes
  // to be: the initial one, a change.
  const willSearchFor = (trimmed: string) =>
    trimmed === '' || trimmed.length >= minQueryLength;
  const isBelowMinQuery = trimmedQuery !== '' && !willSearchFor(trimmedQuery);
  // Pending from open, and from each query change, until that search
  // settles. The sheet mounts already open, so the initial state is derived
  // from the initial query the way a change derives it: a kept query below
  // the threshold starts settled, not pending for a search that never runs
  // (FR20).
  const [isPending, setIsPending] = useState(() =>
    willSearchFor(initialQuery.trim()),
  );
  const [sourceResults, setSourceResults] = useState<T[]>([]);
  const results = isBelowMinQuery ? [] : sourceResults;
  // Each search that runs gets a number; its outcome is announced once.
  const [searchId, setSearchId] = useState(0);
  const searchIdRef = useRef(0);
  const announcedSearchIdRef = useRef(
    willSearchFor(initialQuery.trim()) ? -1 : 0,
  );
  const seqRef = useRef(0);
  // The source is read through a ref at request time, so a caller that
  // rebuilds the source object in render causes no new request on an
  // unrelated render (a row toggle); the sheet asks the source only on open,
  // on a query change, and on clearing (FR20). The ref is updated in a layout
  // effect, before any request this commit makes. (React's own
  // useLayoutEffect: this content renders only inside an open sheet, after a
  // press, so it never runs on the server.)
  const searchSourceRef = useRef(searchSource);
  useLayoutEffect(() => {
    searchSourceRef.current = searchSource;
  }, [searchSource]);
  // Synchronizes the row list with the caller's `searchSource`, an external
  // system this component does not own: it asks the source for the bootstrap
  // set or the query's results and copies the answer into state. The
  // bootstrap set is requested at once — on open and when the query clears —
  // and a typed query waits `debounceMs`. A layout effect, as Core's sheet
  // runs it, so a source that answers synchronously settles before the
  // browser paints the open commit and the Loading row never reaches the
  // screen. Cleanup clears the debounce timer so a superseded query never
  // fetches, and the sequence guard drops a response that lands after a
  // newer request, so the list never shows stale results
  // (`architecture:react-component-runtime` INV3).
  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const trimmed = query.trim();
    const seq = ++seqRef.current;
    if (!willSearchFor(trimmed)) {
      return;
    }
    const settle = (items: T[]) => {
      if (seqRef.current === seq) {
        // The bootstrap set is capped at `maxMenuItems` as the inline field
        // caps its focus bootstrap (FR20).
        setSourceResults(items.slice(0, maxMenuItems));
        setIsPending(false);
      }
    };
    const run = () => {
      const source = searchSourceRef.current;
      let answer: T[] | PromiseLike<T[]>;
      try {
        answer =
          trimmed === ''
            ? source.bootstrap
              ? source.bootstrap()
              : source.search('')
            : source.search(query);
      } catch {
        answer = [];
      }
      if (Array.isArray(answer)) {
        settle(answer);
        return;
      }
      void Promise.resolve(answer).then(settle, () => settle([]));
    };
    if (trimmed !== '' && debounceMs > 0) {
      const timer = setTimeout(run, debounceMs);
      return () => clearTimeout(timer);
    }
    run();
  }, [isOpen, query, minQueryLength, maxMenuItems, debounceMs]);

  const [renderedItemCount, setRenderedItemCount] = useState(
    LIST_RENDER_BATCH_SIZE,
  );
  const lastLoadScrollHeightRef = useRef<number | null>(null);
  // Snapshot the selection and reset the rendered window in the render that
  // opens the sheet (the sheet stays mounted through its exit, so a reopen
  // reuses this content), so the first open frame already shows
  // selected-first order; rows keep their place while the sheet is open.
  const [selectedItemsAtOpen, setSelectedItemsAtOpen] = useState<T[]>(value);
  const resetListWindow = () => {
    lastLoadScrollHeightRef.current = null;
    setRenderedItemCount(LIST_RENDER_BATCH_SIZE);
  };
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setSelectedItemsAtOpen(value);
      resetListWindow();
      // An open lists the bootstrap set, or searches a query kept across a
      // forced close (FR18); a kept query below the threshold leaves nothing
      // pending, since no search runs for it.
      const willSearch = willSearchFor(trimmedQuery);
      setIsPending(willSearch);
      if (willSearch) {
        searchIdRef.current += 1;
        setSearchId(searchIdRef.current);
      } else {
        announcedSearchIdRef.current = searchIdRef.current;
      }
    }
  }
  const handleQueryChange = (next: string) => {
    resetListWindow();
    const willSearch = willSearchFor(next.trim());
    // Below the threshold nothing is searched, so nothing is pending and no
    // outcome is owed: a search still unsettled from the previous query is
    // retired unannounced.
    setIsPending(willSearch);
    if (willSearch) {
      searchIdRef.current += 1;
      setSearchId(searchIdRef.current);
    } else {
      announcedSearchIdRef.current = searchIdRef.current;
    }
    setQuery(next);
    onChangeQuery(next);
  };
  useImperativeHandle(
    clearQueryRef,
    () => () => {
      if (query !== '') {
        setQuery('');
        onChangeQuery('');
      }
    },
    [query, onChangeQuery],
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = trimmedQuery.toLowerCase();
    const matchesQuery = (item: T) =>
      normalizedQuery === '' ||
      item.label.toLowerCase().includes(normalizedQuery);
    const selectedAtOpenMatches = selectedItemsAtOpen.filter(matchesQuery);
    const selectedAtOpenIds = new Set(
      selectedAtOpenMatches.map(item => item.id),
    );
    const resultIds = new Set(results.map(item => item.id));
    const selectedItemsMissingFromResults = value.filter(
      item =>
        !selectedAtOpenIds.has(item.id) &&
        !resultIds.has(item.id) &&
        matchesQuery(item),
    );
    return [
      ...selectedAtOpenMatches,
      ...selectedItemsMissingFromResults,
      ...results.filter(item => !selectedAtOpenIds.has(item.id)),
    ];
  }, [trimmedQuery, results, selectedItemsAtOpen, value]);
  const renderedItems = visibleItems.slice(0, renderedItemCount);

  const createItem = useMemo<T | null>(() => {
    if (!hasCreate || trimmedQuery === '' || isAtMax) {
      return null;
    }
    const lower = trimmedQuery.toLowerCase();
    if (
      selectedIds.has(trimmedQuery) ||
      value.some(item => item.label.toLowerCase() === lower) ||
      results.some(r => r.label.toLowerCase() === lower)
    ) {
      return null;
    }
    return {
      id: `${CREATABLE_ID_PREFIX}${trimmedQuery}`,
      label: t('@astryx.tokenizer.create', {value: trimmedQuery}),
    } as unknown as T;
  }, [hasCreate, trimmedQuery, results, selectedIds, isAtMax, value, t]);

  const isQueryEmpty = trimmedQuery === '';
  // An empty state is a searched query's answer. An empty query that lists
  // nothing — nothing selected and an empty bootstrap set — shows only the
  // search field, no list, no message, and announces nothing (FR20).
  const isSettledEmpty =
    !isPending &&
    !isBelowMinQuery &&
    !isQueryEmpty &&
    visibleItems.length === 0 &&
    createItem == null;
  const isSettledBlank =
    !isPending &&
    !isBelowMinQuery &&
    isQueryEmpty &&
    visibleItems.length === 0 &&
    createItem == null;

  // How each search ended, once per settle (AR6): the result count for a
  // searched query. The empty state announces its own words.
  useEffect(() => {
    if (!isOpen || isPending || announcedSearchIdRef.current === searchId) {
      return;
    }
    announcedSearchIdRef.current = searchId;
    if (!isSettledEmpty && !isQueryEmpty) {
      announce(
        t('@astryx.typeahead.resultCount', {
          count: visibleItems.length + (createItem == null ? 0 : 1),
        }),
      );
    }
  }, [
    announce,
    createItem,
    isOpen,
    isPending,
    isQueryEmpty,
    isSettledEmpty,
    visibleItems.length,
    searchId,
    t,
  ]);

  // ---- Clear all ----
  // The confirmation is in the DOM only from the Clear all press until it
  // closes (INV7). Dialog restores focus only in its close effect, so the
  // sheet places focus itself once the modal is gone: on the search field
  // after a confirmed clear — the clear is spent, and the search field is
  // where the next selection starts (FR24, `spec:AST-085` FR4) — and back on
  // Clear all after a cancel. A confirmed clear is announced there too, after
  // the confirmation has gone, so the words are delivered inside the sheet
  // (`spec:AST-086` FR14).
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const afterConfirmationRef = useRef<'search' | 'clear-all' | null>(null);
  const closeClearConfirmation = (confirmed: boolean) => {
    afterConfirmationRef.current = confirmed ? 'search' : 'clear-all';
    setIsClearConfirmationOpen(false);
  };
  useEffect(() => {
    if (isClearConfirmationOpen || afterConfirmationRef.current == null) {
      return;
    }
    const destination = afterConfirmationRef.current;
    afterConfirmationRef.current = null;
    if (destination === 'search') {
      searchRef.current?.focus();
      announce(t('@astryx.tokenizer.allRemoved'));
    } else {
      clearAllRef.current?.focus();
    }
  }, [announce, isClearConfirmationOpen, t]);

  const searchLabel = t('@astryx.tokenizer.search', {label});
  const noResultsTitle =
    emptySearchResultsText ?? t('@astryx.typeahead.emptySearchResults');

  return (
    <div {...stylex.props(styles.sheetBody)}>
      <div {...stylex.props(styles.filterRow)}>
        <TextInput
          ref={searchRef}
          label={searchLabel}
          isLabelHidden
          placeholder={t('@astryx.tokenizer.searchPlaceholder')}
          startIcon="search"
          value={query}
          size="lg"
          width="100%"
          hasClear
          onChange={handleQueryChange}
          controlXstyle={styles.filterInput}
        />
      </div>
      {isPending ? (
        // Named busy feedback while the source works, above any rows still
        // listed from the previous search (`family:input-fields` FR7).
        <div {...stylex.props(styles.pending)}>
          <Spinner
            size="md"
            role="img"
            aria-label={t('@astryx.typeahead.loading')}
          />
        </div>
      ) : null}
      {isSettledEmpty ? (
        <div {...stylex.props(styles.emptyHost)}>
          <EmptyState
            icon={<Icon icon="search" size="lg" color="secondary" />}
            title={noResultsTitle}
            description={t('@astryx.tokenizer.noResultsDescription')}
            isCompact
            xstyle={styles.empty}
          />
        </div>
      ) : isSettledBlank ? null : (
        <div
          {...stylex.props(styles.list)}
          role="group"
          aria-label={label}
          aria-busy={isPending || undefined}
          data-testid="mobile-tokenizer-list"
          data-rendered-count={renderedItems.length}
          data-total-count={visibleItems.length}
          onScroll={event => {
            const list = event.currentTarget;
            const distanceFromBottom =
              list.scrollHeight - list.scrollTop - list.clientHeight;
            if (
              distanceFromBottom <= LIST_LOAD_MORE_THRESHOLD_PX &&
              lastLoadScrollHeightRef.current !== list.scrollHeight
            ) {
              lastLoadScrollHeightRef.current = list.scrollHeight;
              setRenderedItemCount(current =>
                Math.min(current + LIST_RENDER_BATCH_SIZE, visibleItems.length),
              );
            }
          }}>
          {createItem != null && (
            <div
              data-testid="mobile-tokenizer-create-row"
              {...stylex.props(styles.createRow)}>
              <span {...stylex.props(styles.createLabel)}>
                <Text type="body">{createItem.label}</Text>
              </span>
              <Button
                label={t('@astryx.tokenizer.add')}
                aria-label={t('@astryx.tokenizer.addValue', {
                  value: trimmedQuery,
                })}
                variant="secondary"
                size="lg"
                onClick={() => {
                  if (onAdd(createItem)) {
                    announce(
                      t('@astryx.tokenizer.tokenAdded', {label: trimmedQuery}),
                    );
                  }
                  handleQueryChange('');
                }}
              />
            </div>
          )}
          {renderedItems.map(item => {
            const isSelected = selectedIds.has(item.id);
            const rowDisabled = !isSelected && isAtMax;
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                aria-label={item.label}
                aria-disabled={rowDisabled || undefined}
                onClick={() => {
                  if (rowDisabled) {
                    return;
                  }
                  if (isSelected) {
                    if (onRemove(item)) {
                      announce(
                        t('@astryx.tokenizer.tokenRemoved', {
                          label: item.label,
                        }),
                      );
                    }
                  } else if (onAdd(item)) {
                    announce(
                      t('@astryx.tokenizer.tokenAdded', {label: item.label}),
                    );
                  }
                }}
                {...stylex.props(
                  styles.row,
                  rowDisabled && styles.rowDisabled,
                )}>
                <span {...stylex.props(styles.rowLabel)}>
                  {renderItem ? (
                    renderItem(item)
                  ) : (
                    <Text
                      type="body"
                      color={rowDisabled ? 'inherit' : undefined}>
                      {item.label}
                    </Text>
                  )}
                </span>
                <CheckboxIndicator
                  state={isSelected ? 'checked' : 'unchecked'}
                  size="md"
                  isDisabled={rowDisabled}
                  xstyle={rowDisabled ? styles.indicatorDisabled : undefined}
                />
              </button>
            );
          })}
        </div>
      )}
      {isQueryEmpty && (
        <div {...stylex.props(styles.footer)}>
          <Button
            ref={clearAllRef}
            label={t('@astryx.tokenizer.clearAll')}
            variant="secondary"
            size="lg"
            isDisabled={value.length === 0}
            // With a tooltip, Button's disabled mode is `aria-disabled`: the
            // action keeps its focus order and says why it does nothing
            // (`spec:AST-085` FR1), instead of leaving the tab order as a
            // natively disabled button does (FR24).
            tooltip={
              value.length === 0
                ? t('@astryx.tokenizer.nothingToClear')
                : undefined
            }
            onClick={() => setIsClearConfirmationOpen(true)}
            xstyle={styles.footerAction}
          />
          <Button
            label={t('@astryx.tokenizer.done')}
            variant="primary"
            size="lg"
            onClick={onRequestClose}
            xstyle={styles.footerAction}
          />
        </div>
      )}
      {isClearConfirmationOpen && (
        <AlertDialog
          isOpen
          onOpenChange={next => {
            if (!next) {
              closeClearConfirmation(false);
            }
          }}
          title={t('@astryx.tokenizer.clearAllTitle')}
          description={t('@astryx.tokenizer.clearAllDescription', {label})}
          actionLabel={t('@astryx.tokenizer.clearSelection')}
          onAction={() => {
            onClearAll();
            closeClearConfirmation(true);
          }}
        />
      )}
    </div>
  );
}
