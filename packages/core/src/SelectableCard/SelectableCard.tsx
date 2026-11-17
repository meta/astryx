// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SelectableCard.tsx
 * @input Uses Card, useClickableContainer, StyleX
 * @output Exports SelectableCard component and SelectableCardProps
 * @position Interactive card for toggle selection
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/SelectableCard/SelectableCard.doc.mjs (props table, features)
 * - /packages/core/src/SelectableCard/index.ts (exports if types change)
 * - /apps/storybook/stories/SelectableCard.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Card/SelectableCardShowcase.tsx (showcase block)
 * - /packages/cli/assets/templates/blocks/components/Card/SelectableCardMulti.tsx (block)
 * - /packages/cli/assets/templates/blocks/components/Card/SelectableCardElevated.tsx (block)
 *
 * Composes Card for all visual styling. Adds selection state with
 * an inset box-shadow (zero layout jitter) and useClickableContainer
 * for safe nested interactive elements.
 *
 * A hidden <input type="checkbox"> inside the card provides the accessible
 * role, label, and checked state — the card surface itself has no role/tabIndex.
 * Space toggles it natively; Enter is wired up as an additional toggle key.
 * Inside a single-choice group (Lab's SelectableCardGroup, through an internal
 * context) the input is a radio: the card selects and never deselects itself.
 *
 * For static display, use Card.
 * For navigation or action cards, use ClickableCard.
 */

import {
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent,
  useRef,
  useCallback,
  use,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {colorVars, durationVars, easeVars} from '../theme/tokens.stylex';
import type {Elevation, SizeValue, SpacingStep} from '../utils/types';
import {isImeKeyEvent, mergeProps} from '../utils';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {Card} from '../Card/Card';
import type {CardVariant} from '../Card/Card';
import {useClickableContainer} from '../hooks/useClickableContainer';
import {closestLayerRoot} from '../privateAttributes/layerRoot.stylex';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {SelectableCardInputContext} from './selectableCardInput';
import {containerPressOverlayStyles} from '../privateAttributes/press.stylex';
// =============================================================================
// Styles — selection + interaction; Card handles the rest
// =============================================================================

const styles = stylex.create({
  interactive: {
    // Declared here, on the element that carries the `astryx-selectable-card`
    // target, so a theme has something to override — the ring for a variant
    // only the theme knows about reads it (see selectedUnknown).
    '--selectable-card-ring-color': colorVars['--color-accent'],
    position: 'relative',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: {
      default: 'box-shadow, border-color',
      // Under reduced motion a selection's ring and border change at once.
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        'opacity',
    },
    transitionDuration: {
      default: durationVars['--duration-fast'],
      // Under reduced motion a fine pointer gets no transition. A touch
      // screen's opacity fade, such as a disabled card's dimming, takes
      // 200 ms at most.
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))':
        '0s',
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': `min(${durationVars['--duration-exit']}, 200ms)`,
    },
    transitionTimingFunction: {
      default: easeVars['--ease-standard'],
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
        easeVars['--ease-exit'],
    },
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  // Selection indicator — an inset ring drawn via the card's --_card-ring
  // shadow slot (zero layout jitter) plus a borderColor change on the card's
  // own border for a cohesive look. Routing the ring through --_card-ring
  // (rather than box-shadow directly) lets it compose with the card's
  // elevation instead of clobbering it.
  selected: {
    borderColor: colorVars['--color-accent'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-accent']}`,
  },
  selectedBlue: {
    borderColor: colorVars['--color-border-blue'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-blue']}`,
  },
  selectedCyan: {
    borderColor: colorVars['--color-border-cyan'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-cyan']}`,
  },
  selectedGray: {
    borderColor: colorVars['--color-border-gray'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-gray']}`,
  },
  selectedGreen: {
    borderColor: colorVars['--color-border-green'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-green']}`,
  },
  selectedOrange: {
    borderColor: colorVars['--color-border-orange'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-orange']}`,
  },
  selectedPink: {
    borderColor: colorVars['--color-border-pink'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-pink']}`,
  },
  selectedPurple: {
    borderColor: colorVars['--color-border-purple'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-purple']}`,
  },
  selectedRed: {
    borderColor: colorVars['--color-border-red'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-red']}`,
  },
  selectedTeal: {
    borderColor: colorVars['--color-border-teal'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-teal']}`,
  },
  selectedYellow: {
    borderColor: colorVars['--color-border-yellow'],
    '--_card-ring': `inset 0 0 0 2px ${colorVars['--color-border-yellow']}`,
  },
  // A theme-added variant paints with colours the component cannot know, so no
  // token is guaranteed to contrast with it — an accent ring disappears against
  // an accent fill, and an outset one is no better. The theme that supplied the
  // fill is the only thing that can pick a ring, so it gets a lever beside it;
  // the var defaults to the accent, keeping every built-in unchanged.
  selectedUnknown: {
    '--_card-ring': 'inset 0 0 0 2px var(--selectable-card-ring-color)',
  },
});

const selectedStyleForVariant = (variant: CardVariant) => {
  switch (variant) {
    case 'default':
    case 'transparent':
    case 'muted':
      return styles.selected;
    case 'blue':
      return styles.selectedBlue;
    case 'cyan':
      return styles.selectedCyan;
    case 'gray':
      return styles.selectedGray;
    case 'green':
      return styles.selectedGreen;
    case 'orange':
      return styles.selectedOrange;
    case 'pink':
      return styles.selectedPink;
    case 'purple':
      return styles.selectedPurple;
    case 'red':
      return styles.selectedRed;
    case 'teal':
      return styles.selectedTeal;
    case 'yellow':
      return styles.selectedYellow;
    // CardVariant is open — a theme can add a variant this switch has never
    // seen, and it still has to look selected.
    default:
      return styles.selectedUnknown;
  }
};

// =============================================================================
// Props
// =============================================================================

export interface SelectableCardProps extends Omit<BaseProps, 'onChange'> {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLDivElement>;

  /**
   * Accessibility label for the card.
   * Used as `aria-label` — provides the accessible name for screen readers.
   */
  label: string;

  /**
   * Controlled selection state.
   * When true, the card shows an inset accent border indicating selection.
   */
  isSelected: boolean;

  /**
   * Selection change handler.
   * Called with the new selection state when the card is toggled.
   */
  onChange: (isSelected: boolean) => void;

  /**
   * Set to true to disable the card.
   * Disabled cards remain focusable (tabIndex 0) with aria-disabled
   * so screen reader users can discover them.
   */
  isDisabled?: boolean;

  /** Content to render inside the card. */
  children?: ReactNode;

  /**
   * Internal padding of the card using the spacing scale.
   * @default 4 (16px)
   */
  padding?: SpacingStep;

  /**
   * Background color variant.
   * @default 'default'
   */
  variant?: CardVariant;

  /**
   * Resting elevation — the shadow depth the card sits at.
   * The selection ring composes on top, so a selected card keeps its shadow.
   * @default 'none'
   */
  elevation?: Elevation;

  /** Width of the card. */
  width?: SizeValue;

  /** Height of the card. */
  height?: SizeValue;

  /** Maximum width of the card. */
  maxWidth?: SizeValue;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Call a caller's click handler during capture, before the layer's own
 * handlers, without letting it change what those handlers see. Its
 * stopPropagation() would keep the press from the control inside the layer,
 * so it does nothing here. Its preventDefault() would mark the event handled
 * for those controls (a Button skips its clickAction), so it is applied to
 * the native event only after the press has bubbled to the document, where it
 * still cancels the browser's default action.
 */
function callBeforeLayerHandlers(
  handler: (event: MouseEvent<HTMLElement>) => void,
  event: MouseEvent<HTMLElement>,
): void {
  const {stopPropagation, preventDefault} = event;
  let isDefaultPreventedByCaller = false;
  event.stopPropagation = () => {};
  event.preventDefault = () => {
    isDefaultPreventedByCaller = true;
  };
  try {
    handler(event);
  } finally {
    event.stopPropagation = stopPropagation;
    event.preventDefault = preventDefault;
  }
  if (isDefaultPreventedByCaller) {
    const nativeEvent = event.nativeEvent;
    const doc = event.currentTarget.ownerDocument;
    const cancelDefault = (bubbled: Event) => {
      doc.removeEventListener(nativeEvent.type, cancelDefault);
      if (bubbled === nativeEvent) {
        nativeEvent.preventDefault();
      }
    };
    doc.addEventListener(nativeEvent.type, cancelDefault);
  }
}

/**
 * A card that toggles between selected and unselected states.
 *
 * Composes Card for visual styling and adds selection state with
 * an inset box-shadow (zero layout jitter vs plain Card). Supports
 * hover, pressed, focus, and disabled states.
 *
 * A visually-hidden <input type="checkbox"> inside the card provides
 * the accessible role, label, and checked state. The card surface
 * is a plain <div> — no role or tabIndex on the container.
 *
 * @compositionHint Use for multi-select card groups, managing selection
 * state externally in a Set. Not for single-select: each card is a
 * checkbox, so assistive technology announces a multi-select group.
 * For navigation/action cards, use ClickableCard instead.
 *
 * @example
 * ```
 * <SelectableCard
 *   label="Option A"
 *   isSelected={selected.has('a')}
 *   onChange={isSelected => toggle('a', isSelected)}>
 *   <Text type="body" weight="bold">Option A</Text>
 * </SelectableCard>
 * ```
 */
export function SelectableCard({
  label,
  isSelected,
  onChange,
  onClick: onClickProp,
  onMouseUp: onMouseUpProp,
  onPointerDown: onPointerDownProp,
  isDisabled = false,
  children,
  padding,
  variant = 'default',
  elevation = 'none',
  width,
  height,
  maxWidth,
  ref,
  xstyle: xstyleProp,
  className: classNameProp,
  style,
  ...props
}: SelectableCardProps) {
  const pressable = usePressFeedback();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interactiveRef = useRef<HTMLInputElement | null>(null);

  // A group can make the input a radio. A radio only selects: a native radio
  // stays checked when it is clicked again.
  const groupInput = use(SelectableCardInputContext);
  const isRadio = groupInput?.type === 'radio';
  const requestChange = useCallback(() => {
    if (!isRadio) {
      onChange(!isSelected);
    } else if (!isSelected) {
      onChange(true);
    }
  }, [isRadio, isSelected, onChange]);

  const handleClick = useCallback(
    (_event: MouseEvent<HTMLElement>) => {
      if (!isDisabled) {
        requestChange();
      }
    },
    [isDisabled, requestChange],
  );

  // A native checkbox or radio reacts to Space but not to Enter. This handler
  // adds Enter. Space is not handled here, because it would act twice.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (isImeKeyEvent(event.nativeEvent)) {
        return;
      }
      if (isDisabled) {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        requestChange();
      }
    },
    [isDisabled, requestChange],
  );

  const {onClick, onMouseUp, onPointerDown} = useClickableContainer({
    containerRef,
    interactiveRef,
    onClick: handleClick,
    disabled: isDisabled,
  });

  const composedOnClick = onClickProp
    ? (e: MouseEvent<HTMLElement>) => {
        onClick(e);
        onClickProp(e);
      }
    : onClick;

  // Until the next minor, a click inside an open layer within the card still
  // reaches the caller's onClick. The layer root stops that click before the
  // bubble phase, so it is delivered here, during capture. It never toggles.
  // Remove at the next minor, when that click stops reaching onClick.
  const handleLayerClickCapture = onClickProp
    ? (e: MouseEvent<HTMLElement>) => {
        const target = e.target;
        if (!(target instanceof Element)) {
          return;
        }
        const layerRoot = closestLayerRoot(target);
        if (layerRoot == null || layerRoot.contains(e.currentTarget)) {
          return;
        }
        callBeforeLayerHandlers(onClickProp, e);
      }
    : undefined;

  const composedOnMouseUp = onMouseUpProp
    ? (e: MouseEvent<HTMLElement>) => {
        onMouseUp(e);
        onMouseUpProp(e);
      }
    : onMouseUp;

  return (
    <Card
      ref={useMergedRefs(ref, containerRef)}
      {...(isDisabled ? undefined : pressable)}
      width={width}
      height={height}
      maxWidth={maxWidth}
      padding={padding}
      variant={variant}
      elevation={elevation}
      {...mergeProps(
        themeProps('selectable-card', {
          variant,
          selected: isSelected ? 'true' : 'false',
        }),
        focusOutlineProps.focusWithin(),
        classNameProp,
        style,
      )}
      xstyle={
        [
          styles.interactive,
          isSelected && selectedStyleForVariant(variant),
          !isDisabled && containerPressOverlayStyles.overlay,
          !isDisabled && containerPressOverlayStyles.rounded,
          // The touch press's strength and release, on the element the
          // controller writes to; the `::after` above paints off it.
          !isDisabled && interactionOverlayStyles.pressedAlpha,
          isDisabled && styles.disabled,
          xstyleProp,
        ] as unknown as StyleXStyles
      }
      onClick={!isDisabled ? composedOnClick : undefined}
      onMouseUp={!isDisabled ? composedOnMouseUp : undefined}
      onPointerDown={
        !isDisabled
          ? chainEventHandlers(onPointerDown, onPointerDownProp)
          : onPointerDownProp
      }
      {...props}
      onClickCapture={
        !isDisabled && handleLayerClickCapture
          ? (e: MouseEvent<HTMLDivElement>) => {
              handleLayerClickCapture(e);
              props.onClickCapture?.(e);
            }
          : props.onClickCapture
      }>
      <input
        ref={interactiveRef}
        type={isRadio ? 'radio' : 'checkbox'}
        name={groupInput?.name}
        value={groupInput?.value}
        // Radios group by name and form owner, so every radio card leaves
        // the form together and the group stays one tab stop. The group
        // submits its choice itself. A disabled checkbox card submits
        // nothing, so it leaves the form too.
        form={
          groupInput != null && (groupInput.type === 'radio' || isDisabled)
            ? ''
            : undefined
        }
        checked={isSelected}
        aria-label={label}
        aria-disabled={isDisabled ? 'true' : undefined}
        onChange={() => {
          if (isDisabled) {
            return;
          }
          requestChange();
        }}
        onKeyDown={handleKeyDown}
        {...stylex.props(styles.srOnly)}
      />
      {children}
    </Card>
  );
}

SelectableCard.displayName = 'SelectableCard';
