// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Typeahead.tsx
 * @input Uses React, BaseTypeahead, Field, Token, InputGroupContext
 * @output Exports Typeahead styled typeahead component
 * @position Styled wrapper; composes BaseTypeahead with Field or InputGroup
 *
 * Owns the input wrapper (border, padding, status styles), selected value
 * token with spacing compensation, and edit mode behavior. Delegates
 * search, keyboard navigation, and dropdown to BaseTypeahead.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Typeahead/index.ts
 * - /apps/storybook/stories/Typeahead.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Typeahead/ (showcase blocks)
 */

import React, {
  useCallback,
  useId,
  useRef,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {
  BusyIndicatorLaneProvider,
  createBusyIndicatorLane,
  useIsBusy,
  type BusyIndicatorLane,
} from './busyIndicatorLane';
import {BaseTypeahead} from './BaseTypeahead';
import {useSize} from '../SizeContext/SizeContext';
import {
  Field,
  InputClearButton,
  type InputStatus,
  inputWrapperStyles,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputStatusFocusWithinStyles,
  type FieldStatusVariant,
} from '../Field';
import {Token} from '../Token';
import {useTooltip} from '../Tooltip';
import {renderIconSlot, type IconType} from '../Icon';
import {VisuallyHidden} from '../VisuallyHidden';
import {Spinner} from '../Spinner';
import {spacingVars, sizeVars} from '../theme/tokens.stylex';
import {groupStyles} from '../InputGroup/groupStyles';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import {
  composeEventHandlers,
  getInputARIA,
  isImeKeyEvent,
  mergeProps,
} from '../utils';
import {TrailingKeyDownContext} from './trailingKeyDown';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import type {SearchableItem, SearchSource} from './types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
export type {
  InputStatus as TypeaheadStatus,
  InputStatusType as TypeaheadStatusType,
} from '../Field';

export type TypeaheadSize = 'sm' | 'md' | 'lg';

export interface TypeaheadProps<T extends SearchableItem> extends Omit<
  FieldInputBaseProps<HTMLInputElement>,
  'onChange' | 'onKeyDown'
> {
  /**
   * Key handler. Runs after the built-in key handling, so it observes every key
   * and cannot cancel navigation, selection, or token editing. It receives keys
   * on the combobox input and on the field's other controls (the clear button
   * and tokens).
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Ref forwarded to the combobox input. */
  ref?: React.Ref<HTMLInputElement>;
  /** Accessible label (required). */
  label: string;
  /** Visually hide the label. @default false */
  isLabelHidden?: boolean;
  /** Helper text. */
  description?: string;
  /** Required field. @default false */
  isRequired?: boolean;
  /** Optional field. @default false */
  isOptional?: boolean;
  /** Validation status. */
  status?: InputStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the input (bordered treatment)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': no message box; the status icon becomes a focusable info-tip button that reveals the message on hover, keyboard focus, or tap
   * @default 'attached'
   */
  statusVariant?: FieldStatusVariant;
  /**
   * Icon to display at the start of the input.
   * Accepts a ReactNode (e.g. `<Icon icon={SearchIcon} />`) or an SVG icon component directly.
   */
  startIcon?: ReactNode | IconType;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /** Label tooltip. */
  labelTooltip?: string;
  /** Search source providing items. */
  searchSource: SearchSource<T>;
  /** Currently selected item (null = nothing selected). */
  value: T | null;
  /** Callback when selection changes. */
  onChange: (item: T | null) => void;
  /** Render function for dropdown items. Default: TypeaheadItem. */
  renderItem?: (item: T) => ReactNode;
  /** Placeholder text. */
  placeholder?: string;
  /** Show results on focus before typing. @default false */
  hasEntriesOnFocus?: boolean;
  /** Max dropdown items. @default 10 */
  maxMenuItems?: number;
  /**
   * Minimum query length before the search source is queried. Below it no
   * search runs and the menu stays closed — useful for remote sources where
   * one or two characters match too much to be worth fetching.
   * @default 1
   */
  minQueryLength?: number;
  /**
   * Content shown when the query matched nothing (`spec:AST-056` FR1).
   * Takes a `ReactNode`, so a dead end can carry a link or a create row.
   *
   * The message is announced in a polite live region as the text it renders,
   * read from the DOM, so an element is announced as written and anything
   * marked `aria-hidden` is left out of both. Content that renders no text
   * announces nothing, matching the screen.
   *
   * `null` means "not given", exactly as `undefined` does, so it falls
   * through to the default. Pass an empty string to render nothing.
   *
   * @default 'No results found'
   */
  emptySearchText?: ReactNode;
  /** Whether the input is disabled. @default false */
  isDisabled?: boolean;
  /**
   * Explains why the input is disabled. When set together with `isDisabled`,
   * the input shows a tooltip with this text on hover and keyboard focus, and
   * the field stays focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. Editing and selection
   * stay blocked.
   *
   * Use this instead of wrapping a disabled input in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   *
   * @example
   * ```
   * <Typeahead
   *   label="Assignee"
   *   searchSource={userSource}
   *   value={assignee}
   *   onChange={setAssignee}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
   * />
   * ```
   */
  disabledMessage?: string;
  /** Show clear button. @default true */
  hasClear?: boolean;
  /** Auto-focus on mount. @default false */
  hasAutoFocus?: boolean;
  /** Input size. @default 'md' */
  size?: TypeaheadSize;
  /**
   * Debounce delay in ms before triggering search after typing.
   * Set to 0 for synchronous/local search sources that don't need debouncing.
   * @default 150
   */
  debounceMs?: number;
  /** Query change callback. */
  onChangeQuery?: (query: string) => void;
  /** Callback when dropdown opens/closes. */
  onOpenChange?: (isOpen: boolean) => void;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  wrapper: {
    position: 'relative',
    // No `flexWrap`. The shared field base does not wrap and neither does
    // TextInput; this field only ever holds one token, so there is no second
    // row to wrap to. It also cannot wrap and keep its end controls in flow:
    // flex moves an item to a new line rather than shrinking it, so a long
    // value put the clear button and spinner on a row of their own (a 280px
    // field grew to 46px tall). Unwrapped, the token ellipsizes instead.
    gap: spacingVars['--spacing-1'],
    // Standard padding minus border width to prevent height jump
    // when a token (28px) is added inside the input
    paddingBlock: `calc(${spacingVars['--spacing-1']} - 1px)`,
    cursor: {
      default: 'text',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // The busy indicator and the clear button, at the field's inline end.
  //
  // In flow, as a flex child — an in-flow box takes up room, so the input
  // cannot run underneath it and nothing has to be measured. That is
  // TextInput's arrangement for the same two controls.
  //
  // The `auto` margin keeps them in the corner in the states where the
  // content lane is not the only flexible item in the row (a start icon, a
  // grouped row): `auto` gives free space to the margin rather than to a
  // sibling, so it needs no sibling to exist.
  endLane: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    marginInlineStart: 'auto',
  },
  // The field's content lane: the input, and the token painted over it.
  //
  // This is the box the value is allowed to occupy, and it is what makes the
  // end lane's space its own — the lane is an ordinary flex item that ends
  // exactly where `endLane` begins, so a value bounded by it can never reach
  // the clear button or the spinner. Before it existed the token was
  // positioned against the whole field, so a value longer than the input ran
  // under the end controls and past the field's border (measured 33px of
  // overlap and 4px outside the border at a 180px field).
  //
  // `flex: 1` with `min-width: 0` is TextInput's own arrangement for its
  // input: the lane takes the free space so the end controls sit in the
  // corner, and yields all of it when the field is narrow, so a narrow field
  // never overflows. Stretched, so its padding box matches the field's
  // content box in the block direction and the token keeps the vertical
  // placement it has always had.
  contentLane: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    minWidth: 0,
  },
  // While a token shows, the input keeps its place in the row and its own
  // intrinsic width — it is only made invisible and inert. That width is what
  // sizes the field, exactly as it does for TextInput, so a Typeahead is as
  // wide with a value as without one. Collapsing it to nothing instead left
  // the field measuring the token: in any shrink-to-fit parent it snapped to
  // the value's length (measured 199px to 57px, #5560), and block-level
  // parents hid it because they fill their container whatever their content
  // is, which is why no story caught it.
  inputHidden: {
    opacity: 0,
    // The token is painted over this space and owns the pointer; the input
    // must not swallow clicks meant for it, or for the wrapper's own
    // click-to-edit.
    pointerEvents: 'none',
  },
  // Painted over the input rather than beside it. In flow the token would add
  // its own width to the row, which is the same value-dependent sizing from
  // the other direction — a long value would grow the field.
  //
  // Bounded by the content lane at both ends. `fit-content` shrink-wraps the
  // label but resolves against the space left between the two insets, so a
  // long value ellipsizes at the lane's edge instead of running under the end
  // controls; the `auto` end margin is what keeps that pair of insets from
  // being over-constrained, which would drop the end one and let the token
  // overflow again. The negative inline start and the zero block start put it
  // where it has always sat: the lane's padding box is the field's content
  // box, 3px inside the field's own padding on both axes.
  tokenOverlay: {
    position: 'absolute' as const,
    insetBlockStart: 0,
    insetInlineStart: `calc(-1 * (${spacingVars['--spacing-1']} - 1px))`,
    insetInlineEnd: 0,
    width: 'fit-content',
    marginBlock: 0,
    marginInlineStart: 0,
    marginInlineEnd: 'auto',
  },
});

const wrapperSizeStyles = stylex.create({
  sm: {minHeight: sizeVars['--size-element-sm']},
  md: {minHeight: sizeVars['--size-element-md']},
  lg: {minHeight: sizeVars['--size-element-lg']},
});

// =============================================================================
// Component
// =============================================================================

/**
 * A search-as-you-type component for selecting an item from a search source.
 *
 * Wraps BaseTypeahead with Field for label, description, and status.
 * Owns the input wrapper styling, selected value token, and edit mode.
 *
 * Edit mode: clicking the token or input area removes the token, populates
 * the input with the value's label, and selects all text. Blurring without
 * selecting restores the original token. Escape also restores.
 *
 * @example
 * ```
 * <Typeahead
 *   label="Assignee"
 *   searchSource={userSource}
 *   value={assignee}
 *   onChange={setAssignee}
 *   placeholder="Search users..."
 * />
 * ```
 */

/**
 * The field's inline-end lane: the busy Spinner, then the clear button.
 *
 * A separate component so that subscribing to the busy state re-renders THIS
 * and nothing else. Subscribing from `Typeahead` itself would re-render the
 * whole field — and, in the Tokenizer that shares this design, every selected
 * token — twice per search for one glyph.
 *
 * Renders nothing when there is neither a spinner nor a clear button, which is
 * what keeps an empty flex item from taking a gap in the row.
 */
function EndLane({
  lane,
  loadingLabel,
  anchorRef,
  clear,
}: {
  lane: BusyIndicatorLane;
  loadingLabel: string;
  anchorRef: RefObject<Element | null>;
  clear: ReactNode;
}) {
  const isBusy = useIsBusy(lane);
  // The search Spinner stays named (family:input-fields FR7) but is not a
  // live region; the field announces each search's busy start instead
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, loadingLabel, anchorRef);
  if (!isBusy && clear == null) {
    return null;
  }
  return (
    <div {...stylex.props(styles.endLane)}>
      {isBusy && <Spinner size="sm" aria-label={loadingLabel} role="img" />}
      {clear}
    </div>
  );
}

export function Typeahead<T extends SearchableItem>({
  ref,
  label,
  isLabelHidden = false,
  description,
  isRequired = false,
  isOptional = false,
  status,
  statusVariant = 'attached',
  startIcon,
  labelTooltip,
  searchSource,
  value,
  onChange,
  renderItem,
  placeholder,
  hasEntriesOnFocus,
  maxMenuItems,
  minQueryLength,
  emptySearchText,
  isDisabled = false,
  disabledMessage,
  hasClear = true,
  hasAutoFocus,
  size: sizeProp,
  debounceMs,
  onChangeQuery,
  onOpenChange,
  onKeyDown,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  id: idProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: TypeaheadProps<T>) {
  const {rest, container} = useFieldInputStyling('Typeahead', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const t = useTranslator();
  const size = useSize(sizeProp, 'md');
  const generatedInputId = useId();
  const inputId = idProp ?? generatedInputId;
  const inputLabelId = useId();
  const descriptionId = useId();
  const statusMessageId = useId();
  const inputGroup = useInputGroup();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<HTMLElement>(null);

  // Disabled-reason tooltip. Disabled controls swallow pointer events, so the
  // tooltip listeners attach to the input wrapper (which already exists) and
  // the input stays perceivable via aria-disabled + readOnly instead of the
  // disabled attribute. Editing and selection stay blocked by the isDisabled
  // guards (handleWrapperClick, handleEnterEditMode, and BaseTypeahead's own
  // focus/change guards).
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The wrapper div is not naturally focusable; focusin bubbles up from the
    // input, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // Edit mode: when the user clicks the token to edit the selected value
  // Reported by BaseTypeahead so the indicator can live in this field's own
  // end lane, beside the clear button, rather than in the engine's row.
  // The base owns the busy state; this field only paints it. Held in a store
  // rather than this component's state so a search transition re-renders the
  // one leaf that shows the Spinner, not the whole field. See
  // busyIndicatorLane.tsx.
  const busyLane = useMemo(() => createBusyIndicatorLane(), []);
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState<T | null>(null);

  // Show token when value is selected and not in edit mode
  const showToken = value != null && !isEditing;

  // Enter edit mode: remove token visually, populate input with value label.
  //
  // Everything happens inside the tap or click that asked for it, never a
  // frame later: iOS raises the software keyboard only for a focus made while
  // the browser is still dispatching the person's own tap (or when the
  // keyboard is already up). Deferred to an animation frame, the focus landed
  // with no keyboard, so a tap on the selected value showed a caret and
  // nothing to type with until a second tap.
  const handleEnterEditMode = useCallback(() => {
    if (isDisabled || !value) {
      return;
    }
    setEditingValue(value);
    setIsEditing(true);
    // The base will receive onChangeQuery with the value's label
    onChangeQuery?.(value.label);
    const input = inputRef.current;
    if (input) {
      // Set the input value directly since the base manages its own query
      // state, and trigger a synthetic change to sync the base's internal
      // state. flushSync commits that query before the focus, so the base's
      // focus handler sees the label rather than an empty query: an empty one
      // would open the hasEntriesOnFocus bootstrap entries, and Enter would
      // commit the first of them instead of the edited value.
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the base must hold the label as its query before the in-tap focus
      flushSync(() => {
        nativeInputValueSetter?.call(input, value.label);
        input.dispatchEvent(new Event('input', {bubbles: true}));
      });
      input.focus();
      input.setSelectionRange(0, input.value.length);
    }
  }, [isDisabled, value, onChangeQuery]);

  // Handle blur: restore token if editing and no selection was made
  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      // Don't restore if focus is moving within the wrapper (e.g. to dropdown)
      if (wrapperRef.current?.contains(e.relatedTarget)) {
        return;
      }

      if (editingValue && isEditing) {
        setIsEditing(false);
        setEditingValue(null);
        // Value was never cleared from parent, so no onChange needed
      }
    },
    [editingValue, isEditing],
  );

  // Handle selection from dropdown — clears edit mode
  const handleChange = useCallback(
    (item: T | null) => {
      setIsEditing(false);
      setEditingValue(null);
      onChange(item);
      // After selection, focus the token so keyboard users stay in the component.
      // Use requestAnimationFrame because the token renders on the next cycle.
      if (item) {
        requestAnimationFrame(() => {
          const tokenEl = tokenRef.current;
          if (tokenEl) {
            // Focus the internal button inside the token
            const button = tokenEl.querySelector('button');
            (button ?? tokenEl).focus();
          }
        });
      }
    },
    [onChange],
  );

  // Handle clear (explicit X button on token). Edit mode copied the label into
  // the base's query, and the base only resets that query on a selection, so
  // clearing the value has to empty it the way entering edit mode filled it
  // (#7038): a native set plus a synthetic input event, which reaches the
  // base's own change handler and its onChangeQuery.
  const handleClear = useCallback(() => {
    const input = inputRef.current;
    if (input && input.value !== '') {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(input, '');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
    setIsEditing(false);
    setEditingValue(null);
    onChange(null);
    input?.focus();
  }, [onChange]);

  // Handle Escape during edit mode — restore token
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // BaseTypeahead invokes this external handler *before* its own IME
      // guard, so we must guard here too: an IME candidate window uses Escape
      // to cancel the pending composition, and that composing Escape fires
      // before compositionend. Without this, a Korean/Japanese/Chinese user
      // cancelling a candidate would instead exit edit mode and blur the
      // field. See utils/ime.ts.
      if (isImeKeyEvent(e.nativeEvent)) {
        return;
      }
      if (e.key === 'Escape' && editingValue) {
        e.preventDefault();
        setIsEditing(false);
        setEditingValue(null);
        inputRef.current?.blur();
      }
    },
    [editingValue],
  );

  // Click wrapper to focus input or enter edit mode
  const handleWrapperClick = useCallback(() => {
    if (isDisabled) {
      return;
    }
    if (showToken) {
      handleEnterEditMode();
    } else {
      inputRef.current?.focus();
    }
  }, [isDisabled, showToken, handleEnterEditMode]);

  const {ariaLabelledBy, ariaDescribedBy} = getInputARIA(
    inputLabelId,
    [
      description ? descriptionId : null,
      status?.message ? statusMessageId : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
    ],
    inputGroup,
  );

  const sizeStyle = wrapperSizeStyles[size];

  const typeaheadContent = (
    <>
      <div
        ref={useMergedRefs(wrapperRef, disabledMessageTooltip.ref)}
        onClick={handleWrapperClick}
        onBlur={handleBlur}
        // Keys on the field's other controls (clear button, tokens) reach a
        // consumer onKeyDown here; keys on the input reach it through
        // TrailingKeyDownContext after the built-in handling.
        onKeyDown={event => {
          if (event.target !== inputRef.current) {
            onKeyDown?.(event);
          }
        }}
        {...mergeProps(
          themeProps('typeahead', {size, status: status?.type}),
          stylex.props(
            inputWrapperStyles.base,
            styles.wrapper,
            sizeStyle,
            status && inputStatusBorderStyles[status.type],
            status && !isDisabled && inputStatusHoverShadowStyles[status.type],
            status && inputStatusFocusWithinStyles[status.type],
            isDisabled && inputWrapperStyles.disabled,
            inputGroup && groupStyles.inGroup,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        {startIcon &&
          renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
        {inputGroup && (
          <VisuallyHidden id={inputLabelId}>{label}</VisuallyHidden>
        )}
        {/* The base reports its busy state through this lane, so the
            indicator lands in the end controls below beside the clear button
            rather than as a second one inside the base. */}
        <BusyIndicatorLaneProvider value={busyLane}>
          <div {...stylex.props(styles.contentLane)}>
            {showToken && (
              <Token
                ref={tokenRef}
                label={value.label}
                size={size}
                onClick={handleEnterEditMode}
                isDisabled={isDisabled}
                xstyle={styles.tokenOverlay}
              />
            )}
            <TrailingKeyDownContext value={onKeyDown}>
              <BaseTypeahead
                {...rest}
                ref={useMergedRefs(inputRef, ref)}
                searchSource={searchSource}
                value={value}
                onChange={handleChange}
                renderItem={renderItem}
                placeholder={showToken ? undefined : placeholder}
                hasEntriesOnFocus={hasEntriesOnFocus}
                maxMenuItems={maxMenuItems}
                minQueryLength={minQueryLength}
                emptySearchText={emptySearchText}
                isDisabled={isDisabled}
                hasAutoFocus={hasAutoFocus}
                isFocusableDisabled={showsDisabledMessage}
                inputId={inputId}
                ariaDescribedBy={
                  [ariaDescribedByProp, ariaDescribedBy]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                ariaLabelledBy={ariaLabelledBy}
                onChangeQuery={onChangeQuery}
                onOpenChange={onOpenChange}
                debounceMs={debounceMs}
                anchorRef={wrapperRef}
                onKeyDown={handleKeyDown}
                inputXStyle={showToken ? styles.inputHidden : undefined}
                // While the token is shown the input is invisible and inert behind
                // it — take it out of the Tab order so keyboard users don't hit a
                // stop they cannot see (WCAG 2.4.3 / 2.4.7). It stays
                // programmatically focusable: entering edit mode and clearing both
                // refocus it once the token goes away.
                inputTabIndex={showToken ? -1 : undefined}
                size={size}
              />
            </TrailingKeyDownContext>
          </div>
        </BusyIndicatorLaneProvider>
        <EndLane
          lane={busyLane}
          loadingLabel={t('@astryx.typeahead.loading')}
          anchorRef={wrapperRef}
          clear={
            hasClear && value && !isDisabled ? (
              <InputClearButton
                label={t('@astryx.typeahead.clearSelection')}
                onClick={e => {
                  e.stopPropagation();
                  handleClear();
                }}
              />
            ) : null
          }
        />
      </div>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </>
  );

  if (inputGroup) {
    return typeaheadContent;
  }

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputId}
      descriptionID={description ? descriptionId : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
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
      labelTooltip={labelTooltip}
      width={width}>
      {typeaheadContent}
    </Field>
  );
}

Typeahead.displayName = 'Typeahead';
