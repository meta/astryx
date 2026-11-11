// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxInput.tsx
 * @input Uses React, useId, ChangeEvent, FieldLabel, FieldStatus, IconType, InputStatus, useTooltip,
 *   CheckboxRowPressContext (a row around the checkbox that owns its press)
 * @output Exports CheckboxInput component, CheckboxInputProps
 * @position Core implementation; consumed by index.ts, tested by CheckboxInput.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/CheckboxInput/CheckboxInput.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/CheckboxInput/CheckboxInput.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/CheckboxInput/index.ts (exports if types change)
 * - /apps/storybook/stories/CheckboxInput.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/CheckboxInput/ (showcase blocks)
 */

import {
  use,
  useId,
  useCallback,
  useOptimistic,
  useRef,
  useTransition,
  type ChangeEvent,
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import type {SizeValue} from '../utils/types';
import {FieldLabel} from '../Field/FieldLabel';
import {FieldStatus} from '../FieldStatus/FieldStatus';
import type {IconType} from '../Icon';
import type {InputStatus} from '../Field/types';
import {Spinner} from '../Spinner/Spinner';
import {useTooltip} from '../Tooltip/useTooltip';
import {mergeProps} from '../utils/mergeProps';
import {rtlStyles} from '../utils/rtlStyles';
import {withholdCallerHandlers} from '../utils/disabledInteraction';
import {indicatorScope} from '../Indicator/indicator.markers.stylex';
import {indicatorPressScope} from '../internal/indicatorPress.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {useIndicatorFocusRing} from '../hooks/useIndicatorFocusRing';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {pressFinePointerProps} from '../privateAttributes/pressFinePointer.stylex';
import {useIndicator} from '../Indicator/useIndicator';
import {themeProps} from '../utils/themeProps';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {useTouchHitArea} from '../utils/touchHitArea';
import {pressBoxProps} from '../privateAttributes/pressBox.stylex';
import {registerBoxHold} from '../utils/boxHold';
import {registerFinePress} from '../utils/finePress';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/CheckboxInput/CheckboxInput.generated';
import {CheckboxRowPressContext} from './CheckboxRowPressContext';

registerEnglishFallback(english);
// Registered here, not in the press controller, so a page with no box carries
// none of its code.
registerBoxHold();
registerFinePress();

/** Written by the press controller while the row is pressed. */
const PRESSED_ON = '[data-astryx-press="on"]';
/** Written by the press controller for the press's release. */
const PRESSED_FADING = '[data-astryx-press="fading"]';
/** The row is pressed, and the press controller does not paint the press. */
const ACTIVE_UNPAINTED = `:active:not(${PRESSED_ON},${PRESSED_FADING})`;

// The touch press's paint, declared by the shared overlay styles on the
// element the controller writes to (`pressedAlpha`) at the press's strength,
// 1 while on and 1 → 0 over the release, and inherited resolved by the layer
// that paints it. See interactionOverlay.stylex.ts.
const pressedOverlayImage = 'var(--_press-paint-image)';

const styles = stylex.create({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  containerLabelHidden: {
    gap: 0,
  },
  // Under a coarse pointer the row contains its hit band.
  hitAreaHost: {
    position: {default: null, '@media (pointer: coarse)': 'relative'},
  },
  // An indicator in another package may not name this row's private press
  // attribute. So the row hands its touch press image down to an indicator
  // that paints its own press, but only in its own press states. A pressed
  // outer row hands down nothing, as for the built-in box. The
  // property has no default: a layered stylesheet ranks a default above the
  // arms. Only this row declares it. A menu item paints its own press, so a
  // mapped indicator there paints none.
  indicatorPressImage: {
    '--_indicator-press-image': {
      default: null,
      [PRESSED_ON]: 'var(--_press-paint-image)',
      [PRESSED_FADING]: 'var(--_press-paint-image)',
    },
    // While the controller paints the press, the indicator's `:active` fill
    // stays off, so a mouse's press paints once.
    '--_indicator-active-press': {
      default: null,
      [PRESSED_ON]: 'transparent',
      [PRESSED_FADING]: 'transparent',
    },
  },
  // Under a row that owns the press (CheckboxRowPressContext), this row is
  // never pressed. So it hands down that row's press paint, which the
  // built-in box reads too.
  indicatorRowPressImage: {
    '--_indicator-press-image': 'var(--_checkbox-row-press-paint, none)',
    // The row paints every press, so the indicator draws no `:active` fill.
    '--_indicator-active-press': 'transparent',
  },
  checkboxWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    isolation: 'isolate',
  },
  // The owner paints this layer over the resolved indicator, so a plain theme
  // replacement keeps the pressed feedback. An indicator with
  // `indicatorPressScope` paints its own press from what the row hands down,
  // so this layer stays off over it. The press controller writes the press
  // attribute on the row for every pointer: a finger, a mouse and a pen. This
  // layer reads it off the scope marker, as the hover tint does. `:active`
  // paints only a press the controller does not paint, and under a coarse
  // pointer it is dropped. Under a row that owns the press
  // (CheckboxRowPressContext), the row's own checkbox paints that row's press
  // paint instead (indicatorRowPressOverlay).
  indicatorPressOverlay: {
    '::after': {
      // `when.descendant` takes a pseudo-class; `:is(*)` matches any marked
      // indicator.
      content: {
        default: '""',
        [stylex.when.descendant(':is(*)', indicatorPressScope)]: 'none',
      },
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-inner'],
      pointerEvents: 'none',
      backgroundColor: {
        default: 'transparent',
        [stylex.when.ancestor(ACTIVE_UNPAINTED, indicatorScope)]: {
          default: colorVars['--color-overlay-pressed'],
          '@media (pointer: coarse)': 'transparent',
        },
      },
      // The controller's press paints as an image layer over the colour. An
      // image change is discrete, so no transition can delay the onset. Only
      // the strength moves: the row's `pressedAlpha` arms set it to 1 while
      // on, and 1 → 0 over the release. This holds for every pointer, because
      // the controller writes the attribute only for a press it paints.
      backgroundImage: {
        default: null,
        [stylex.when.ancestor(PRESSED_ON, indicatorScope)]: pressedOverlayImage,
        [stylex.when.ancestor(PRESSED_FADING, indicatorScope)]:
          pressedOverlayImage,
      },
    },
  },
  // The row's own checkbox when its row owns the press
  // (CheckboxRowPressContext). It paints only the paint that row declares
  // (`--_checkbox-row-press-paint`), so it draws no `:active` fill. No outer
  // row or card reaches it.
  indicatorRowPressOverlay: {
    '::after': {
      backgroundColor: 'transparent',
      backgroundImage: 'var(--_checkbox-row-press-paint, none)',
    },
  },
  // Holds only the indicator, so the focus ring has one unambiguous target.
  // `display: contents` adds no box of its own — the indicator keeps whatever
  // layout relationship it already had with the wrapper.
  indicatorSlot: {
    display: 'contents',
  },
  input: {
    position: 'absolute',
    top: '50%',
    margin: 0,
    padding: 0,
    opacity: 0,
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    zIndex: 1,
  },
  inputCoarse: {
    '@media (pointer: coarse)': {
      minInlineSize: 24,
      minBlockSize: 24,
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  labelWrapper: {
    display: 'flex',
    flexDirection: 'column',
  },
  description: {
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
});

const wrapperSizeStyles = stylex.create({
  sm: {
    width: 20,
    height: 20,
  },
  md: {
    width: 24,
    height: 24,
  },
});

export type CheckboxInputSize = keyof typeof wrapperSizeStyles;

export interface CheckboxInputProps extends Omit<BaseProps, 'onChange'> {
  /** Ref forwarded to the underlying `<input>` element */
  ref?: React.Ref<HTMLInputElement>;
  /**
   * Label text for the checkbox (always rendered for accessibility).
   */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Description text displayed below the label.
   */
  description?: string;
  /**
   * Callback fired when the checkbox state changes.
   */
  onChange?: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
  /**
   * Async action on change. Fires after onChange if not prevented.
   */
  changeAction?: (
    checked: boolean,
    e: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  /**
   * Whether the checkbox is in a loading state.
   * @default false
   */
  isLoading?: boolean;
  /**
   * Whether the checkbox is checked, unchecked, or indeterminate.
   */
  value: boolean | 'indeterminate';
  /**
   * Whether the checkbox is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * The HTML name attribute for the underlying checkbox input.
   * Useful for form submissions.
   */
  htmlName?: string;
  /**
   * Explains why the checkbox is disabled. When set together with
   * `isDisabled`, the checkbox shows a tooltip with this text on hover and
   * keyboard focus, and the control stays focusable (via `aria-disabled`) so
   * the reason is discoverable by keyboard and assistive technology.
   * Activation stays blocked.
   *
   * Use this instead of wrapping a disabled checkbox in `Tooltip` — disabled
   * controls don't emit the pointer events an external tooltip needs.
   *
   * @example
   * ```
   * <CheckboxInput
   *   label="Accept terms"
   *   value={accepted}
   *   isDisabled
   *   disabledMessage="Terms are managed by your administrator"
   * />
   * ```
   */
  disabledMessage?: string;
  /**
   * Whether the checkbox is read-only.
   * Displays the current state at full opacity but prevents interaction.
   * Unlike `isDisabled`, read-only checkboxes are not visually dimmed.
   * @default false
   */
  isReadOnly?: boolean;
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Whether the checkbox is required. Mutually exclusive with isOptional.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /**
   * The size of the checkbox.
   * - 'sm': Compact size (28px row height)
   * - 'md': Default size (36px row height)
   * @default 'md'
   */
  size?: CheckboxInputSize;
  /**
   * Callback fired when the checkbox receives focus.
   */
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  /**
   * Callback fired when the checkbox loses focus.
   */
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  /**
   * Icon to display before the label text.
   */
  labelIcon?: ReactNode | IconType;
  /**
   * Status indicator for the checkbox.
   * When set with a message, displays a colored message box below the checkbox.
   */
  status?: InputStatus;
}

// Dynamic field width (number -> px, string used as-is).
const dynamicWidthStyles = stylex.create({
  width: (width: SizeValue | null) => ({width}),
});

/**
 * A checkbox input component for toggling boolean values.
 *
 * @example
 * ```
 * <CheckboxInput
 *   label="Accept terms"
 *   value={accepted}
 *   onChange={setAccepted}
 * />
 * <CheckboxInput
 *   label="Subscribe"
 *   description="Receive weekly updates"
 *   value={subscribed}
 *   onChange={setSubscribed}
 * />
 * ```
 */
export function CheckboxInput({
  id: idProp,
  label,
  isLabelHidden = false,
  description,
  onChange,
  changeAction,
  isLoading = false,
  value,
  isDisabled = false,
  htmlName,
  disabledMessage,
  isReadOnly = false,
  isOptional = false,
  isRequired = false,
  size = 'md',
  onFocus,
  onBlur,
  labelIcon,
  status,
  width,
  xstyle,
  className,
  style,
  ref,
  'aria-describedby': ariaDescribedByProp,
  ...rest
}: CheckboxInputProps) {
  // The row is the pressable: the overlay's pressed arm reads the row's
  // scope marker, the way the indicator's hover tint does.
  const pressable = usePressFeedback();
  // A row around the checkbox that answers a press anywhere on it (a
  // CheckboxListItem) owns the touch press instead. The checkbox then carries
  // no press marker of its own. So the controller's innermost-wins rule finds
  // the row for a finger on the label, the description or the box. The
  // overlay below paints that row's press.
  const isRowPressSurface = use(CheckboxRowPressContext);
  // A read-only checkbox paints no press, for any pointer.
  const paintsPress = !isDisabled && !isReadOnly;
  const ownsPress = paintsPress && !isRowPressSurface;
  const generatedId = useId();
  const id = idProp || generatedId;
  const descriptionID = useId();
  const statusMessageID = useId();

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;

  // A disabled checkbox stays focusable via aria-disabled instead of the
  // native disabled attribute (spec:AST-085 FR1). Value mutation is blocked by
  // the click and onChange guards on the input.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container row is not naturally focusable; focusin bubbles up from the
    // native checkbox, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  // The checkbox visual is an indicator: a theme can restyle it through the
  // canonical `checkbox-indicator` target or replace the component outright.
  const CheckboxControl = useIndicator('checkbox');
  // The ring is drawn on the indicator itself: the native input is
  // `opacity: 0`, and only the indicator's own element can shape the outline
  // to match it. See useIndicatorFocusRing.
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const t = useComponentTranslator();
  // The busy Spinner sits in the decorative, aria-hidden indicator, so this
  // control announces its busy start itself (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), indicatorRef);
  const {focusProps} = useIndicatorFocusRing(indicatorRef);

  // Under a coarse pointer a labelled checkbox's row grows toward 44 px
  // through an invisible band, and nothing changes size. A label-hidden
  // checkbox is a marker in another component's row, which keeps its target.
  const hasHitArea = !isLabelHidden && !isDisabled && !isReadOnly;
  const inputRef = useRef<HTMLInputElement>(null);
  // The band's insets stay live while the row takes taps, and clear when it
  // stops.
  const watchRowHitArea = useTouchHitArea(hasHitArea);
  // The disabled-message tooltip listens for hover and focus on the whole
  // row, a larger trigger. It anchors on the checkbox itself (below), so it
  // shows next to the control. Its handlers check isEnabled, so the row
  // always attaches them.
  const rowRef = useMergedRefs(
    disabledMessageTooltip.interactionRef,
    watchRowHitArea,
  );
  // Where a press on the row itself began. A browser can move a tap's click
  // onto the row's edge, so the band is judged from the press.
  const pressPointRef = useRef<{x: number; y: number} | null>(null);
  const handleRowPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pressPointRef.current =
      event.target === event.currentTarget
        ? {x: event.clientX, y: event.clientY}
        : null;
  };
  // A press that began on the band, outside the row's box, toggles the
  // checkbox, as a tap on the box does. A click from code has no press count
  // (`detail` is 0), so it never toggles from here.
  const handleRowClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const press = pressPointRef.current;
    pressPointRef.current = null;
    if (
      press == null ||
      event.detail === 0 ||
      event.target !== event.currentTarget
    ) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const isOnBand =
      press.x < box.left ||
      press.x > box.right ||
      press.y < box.top ||
      press.y > box.bottom;
    if (isOnBand) {
      inputRef.current?.click();
    }
  };

  const isIndeterminate = optimisticValue === 'indeterminate';
  const isChecked = optimisticValue === true;

  // Sync the native indeterminate DOM property (can't be set via JSX
  // attribute). On a native checkbox this is the authoritative way to expose
  // the mixed state — a separate aria-checked="mixed" would be redundant and
  // can desync from / override the native state (forms-16), so it is omitted.
  const indeterminateRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) {
        el.indeterminate = isIndeterminate;
      }
    },
    [isIndeterminate],
  );

  // Build aria-describedby from description and status message
  // Only include descriptionID when the element actually renders.
  // FieldLabel renders the description (with descriptionID) even when the
  // label is visually hidden — it's sr-only, so keep it linked.
  // A consumer's own `aria-describedby` (CheckboxListItem points the control
  // at its visible row description) comes first, then the input's own ids —
  // the explicit attribute below would otherwise replace it via `...rest`.
  const describedByParts: string[] = [];
  if (ariaDescribedByProp) {
    describedByParts.push(ariaDescribedByProp);
  }
  if (description) {
    describedByParts.push(descriptionID);
  }
  if (status?.message) {
    describedByParts.push(statusMessageID);
  }
  if (showsDisabledMessage) {
    describedByParts.push(disabledMessageTooltip.describedBy);
  }
  const ariaDescribedBy =
    describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

  return (
    <div
      {...mergeProps(
        themeProps('checkbox-input', {size}),
        stylex.props(width != null && dynamicWidthStyles.width(width), xstyle),
        className,
        style,
      )}>
      <div
        ref={rowRef}
        onPointerDown={hasHitArea ? handleRowPointerDown : undefined}
        onClick={hasHitArea ? handleRowClick : undefined}
        {...(ownsPress ? pressable : undefined)}
        // A mouse's press paints through the controller too, so it fades on
        // release as a finger's does.
        {...pressFinePointerProps(ownsPress)}
        {...stylex.props(
          styles.container,
          isLabelHidden && styles.containerLabelHidden,
          hasHitArea && styles.hitAreaHost,
          hasHitArea && touchHitAreaStyles.layer,
          // Hover and focus reach the checkbox visual through this ancestor
          // marker rather than props, so the whole row drives it.
          !isDisabled && indicatorScope,
          paintsPress &&
            (isRowPressSurface
              ? styles.indicatorRowPressImage
              : styles.indicatorPressImage),
          // The touch press's strength and release live on the row the
          // controller writes to; the layer over the checkbox box inherits
          // and paints it. Under a row that owns the press, the box inherits
          // that row's strength instead.
          ownsPress && interactionOverlayStyles.pressedAlpha,
        )}>
        <div
          // iOS answers a long hold on the box with a text selection and no
          // click. The press controller holds the row's selection for a press
          // on the marked box, and checks it if no click comes.
          {...(isDisabled ? undefined : pressBoxProps)}
          {...stylex.props(
            styles.checkboxWrapper,
            wrapperSizeStyles[size],
            paintsPress && styles.indicatorPressOverlay,
            paintsPress && isRowPressSurface && styles.indicatorRowPressOverlay,
          )}
          {...focusProps}>
          <input
            // A disabled checkbox stays focusable, so it still receives key and
            // pointer events. It runs no caller handler except `onFocus` and
            // `onBlur`.
            {...withholdCallerHandlers(rest, isDisabled)}
            ref={useMergedRefs(
              ref,
              indeterminateRef,
              disabledMessageTooltip.positionRef,
              inputRef,
            )}
            id={id}
            type="checkbox"
            // Withhold the name while disabled: the input stays focusable (not
            // natively disabled), and a disabled control must not submit.
            name={isDisabled ? undefined : htmlName}
            checked={isChecked}
            aria-disabled={isDisabled ? 'true' : undefined}
            // Detached from its form while disabled, so it neither submits nor
            // blocks submission through `required` (spec:AST-085 FR3).
            form={isDisabled ? '' : undefined}
            // Native `disabled` suppressed onClick (FR2); preventDefault here
            // would desync React's controlled checked state.
            onClick={isDisabled ? undefined : rest.onClick}
            readOnly={isReadOnly}
            required={isRequired}
            // A form's required default sets nothing here: an unchecked box is an answer.
            aria-required={isRequired ? 'true' : undefined}
            onChange={e => {
              if (isDisabled || isBusy || isReadOnly) {
                // Activation clears the native mixed state; React restores
                // only `checked`, so restore `indeterminate` too.
                e.target.indeterminate = isIndeterminate;
                return;
              }
              const checked = e.target.checked;
              onChange?.(checked, e);
              if (changeAction && !e.defaultPrevented) {
                startTransition(async () => {
                  setOptimisticValue(checked);
                  await changeAction(checked, e);
                });
              }
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-readonly={isReadOnly || undefined}
            aria-describedby={ariaDescribedBy}
            aria-invalid={status?.type === 'error' ? true : undefined}
            aria-busy={isBusy || undefined}
            {...stylex.props(
              styles.input,
              rtlStyles.centerInline('-50%'),
              styles.inputCoarse,
              wrapperSizeStyles[size],
              isDisabled && styles.inputDisabled,
            )}
          />
          {/*
           * A container holding ONLY the indicator, so the focus ring has an
           * unambiguous target whatever a theme renders. `display: contents`
           * keeps it out of layout entirely.
           */}
          <span ref={indicatorRef} {...stylex.props(styles.indicatorSlot)}>
            <CheckboxControl
              state={
                isIndeterminate
                  ? 'indeterminate'
                  : isChecked
                    ? 'checked'
                    : 'unchecked'
              }
              size={size}
              isDisabled={isDisabled}>
              {isBusy ? <Spinner size="sm" shade="inherit" /> : null}
            </CheckboxControl>
          </span>
        </div>
        <div {...stylex.props(styles.labelWrapper)}>
          <FieldLabel
            // A checkbox's label shares a row with its control, unlike a form
            // field's label above its input. Naming the label rather than the
            // arrangement means a theme asks for the thing it wants, and the
            // component that actually knows what this is says so.
            {...themeProps('checkbox-label')}
            label={label}
            inputID={id}
            isLabelHidden={isLabelHidden}
            isDisabled={isDisabled}
            isOptional={isOptional}
            isRequired={isRequired}
            labelIcon={labelIcon}
            description={description}
            descriptionID={descriptionID}
          />
        </div>
      </div>
      {status?.message && (
        <FieldStatus
          type={status.type}
          message={status.message}
          id={statusMessageID}
          variant="detached"
        />
      )}
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </div>
  );
}

CheckboxInput.displayName = 'CheckboxInput';
