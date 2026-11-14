// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Rating.tsx
 * @input Uses React, StyleX, and Astryx core theme tokens and utilities
 * @output Exports Rating, RatingProps and RatingSize
 * @position Lab implementation; consumed by packages/lab/src/index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - ./Rating.doc.mjs (props table, usage)
 * - ./Rating.test.tsx (tests for new or changed behavior)
 * - ./RatingTracking.test.tsx (action-group pointer streams)
 * - ./rating.stylex.ts (hover markers)
 * - ./index.ts (exports if types change)
 * - /apps/storybook/stories/Rating.stories.tsx (examples)
 */

import {useRef, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useListFocus, useMergedRefs} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {
  useGroupPressTracking,
  GROUP_PRESS_POINTERS,
  pressGroupItemProps,
  useTouchPresentation,
  touchHitAreaStyles,
} from '@astryxdesign/core/internal/touch';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  focusOutlineStyles,
  interactionOverlayStyles,
  mergeProps,
  themeProps,
} from '@astryxdesign/core/utils';

import {ratingStar} from './rating.stylex';

const STAR_PATH =
  'M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.53L12 17.5l-5.87 3.07 1.12-6.53L2.5 9.41l6.56-.95L12 2.5z';

const styles = stylex.create({
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  tracking: {position: 'relative'},
  star: {
    position: 'relative',
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 4,
    padding: 0,
    margin: 0,
    display: 'inline-flex',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    touchAction: 'manipulation',
  },
  filledDisabled: {
    color: colorVars['--color-text-disabled'],
  },
  glyph: {
    display: 'block',
    flexShrink: 0,
    pointerEvents: 'none',
  },
  sm: {width: 16, height: 16},
  md: {width: 24, height: 24},
  lg: {width: 32, height: 32},
  path: {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinejoin: 'round',
  },
  empty: {
    color: colorVars['--color-border-emphasized'],
    '@media (forced-colors: active)': {color: 'CanvasText'},
  },
  filled: {
    color: colorVars['--color-icon-yellow'],
    fill: 'currentColor',
    '@media (forced-colors: active)': {color: 'Highlight'},
  },
  interactiveStar: {
    '--rating-color': {
      default: `var(--rating-selected-color, ${colorVars['--color-border-emphasized']})`,
      '@media (forced-colors: active)':
        'var(--rating-selected-color, CanvasText)',
      '@media (hover: hover)': {
        [stylex.when.siblingBefore(':hover', ratingStar)]:
          colorVars['--color-border-emphasized'],
        [stylex.when.siblingAfter(':hover', ratingStar)]:
          colorVars['--color-icon-yellow'],
        ':hover:where(:not(:disabled,[aria-disabled="true"]))':
          colorVars['--color-icon-yellow'],
      },
    },
    '--rating-fill': {
      default: 'var(--rating-selected-fill, none)',
      '@media (hover: hover)': {
        [stylex.when.siblingBefore(':hover', ratingStar)]: 'none',
        [stylex.when.siblingAfter(':hover', ratingStar)]: 'currentColor',
        ':hover:where(:not(:disabled,[aria-disabled="true"]))': 'currentColor',
      },
    },
  },
  selectedStar: {
    '--rating-selected-fill': 'currentColor',
    '--rating-selected-color': colorVars['--color-icon-yellow'],
    '@media (forced-colors: active)': {'--rating-selected-color': 'Highlight'},
  },
  interactivePath: {
    fill: 'var(--rating-fill)',
    color: 'var(--rating-color)',
  },
  partial: (fill: number) => ({
    clipPath: {
      default: `inset(0 ${(1 - fill) * 100}% 0 0)`,
      ':dir(rtl)': `inset(0 0 0 ${(1 - fill) * 100}%)`,
    },
  }),
});

export type RatingSize = 'sm' | 'md' | 'lg';

export type RatingProps = Omit<
  BaseProps<HTMLDivElement>,
  'children' | 'onChange' | 'role' | 'aria-label'
> & {
  /** Ref forwarded to the group element. */
  ref?: Ref<HTMLDivElement>;
  /** The accessible name of the group, such as "Your rating". */
  label: string;
  /**
   * The current rating, a whole number from 0 to `max`. `null` or `0` means
   * not rated. A read-only rating may also be fractional, such as an average
   * of 4.3, and fills the last star partway.
   */
  value: number | null;
  /**
   * Called with the star the user chose, from 1 to `max`. With `allowClear`
   * it is called with `null` when the user chooses the current rating again.
   */
  onChange?: (value: number | null) => void;
  /**
   * How many stars there are.
   * @default 5
   */
  max?: number;
  /**
   * Shows the rating without letting the user change it. It is one image
   * with a text name, not a set of buttons, so it takes no tab stop.
   */
  isReadOnly?: boolean;
  /** Stops changes. The group stays focusable and announces disabled. */
  isDisabled?: boolean;
  /**
   * Lets a second choice of the current star clear the rating.
   * @default false
   */
  allowClear?: boolean;
  /**
   * The size of the stars.
   * @default 'md'
   */
  size?: RatingSize;
  /**
   * The text name of a rating, such as "3 of 5 stars". Read-only values
   * may be fractional. Supply it to translate or change the wording.
   * @default Localized catalog message
   */
  getStarLabel?: (star: number, max: number) => string;
};

function clampRating(value: number | null, max: number, whole: boolean) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const clamped = Math.min(value, max);
  return whole ? Math.round(clamped) : clamped;
}

/**
 * A star rating. The user picks 1 to `max` stars, with a pointer or the
 * arrow keys. It is a radio group: one tab stop, arrows move the choice,
 * Home and End pick the first and last star. Down advances and Up retreats.
 * Horizontal arrows follow the text direction.
 *
 * Pass `isReadOnly` to show a rating, such as a product average.
 *
 * Styles use Astryx theme tokens via StyleX.
 *
 * @example
 * ```
 * const [stars, setStars] = useState<number | null>(null);
 * <Rating label="Your rating" value={stars} onChange={setStars} />
 * <Rating label="Average" value={4.3} isReadOnly />
 * ```
 */
export function Rating({
  label,
  value,
  onChange,
  max = 5,
  isReadOnly = false,
  isDisabled = false,
  allowClear = false,
  size = 'md',
  getStarLabel,
  onKeyDown: onKeyDownProp,
  onFocus: onFocusProp,
  xstyle,
  className,
  style,
  ref,
  ...props
}: RatingProps) {
  const count = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 5;
  const rating = clampRating(value, count, !isReadOnly);
  const t = useTranslator();
  const starLabel = (star: number) =>
    getStarLabel?.(star, count) ??
    t('@astryx.rating.starLabel', {value: star, max: count});
  const isEditable = !isReadOnly && !isDisabled;
  const {isTouch} = useTouchPresentation();
  const tracksPress = isEditable && isTouch;
  const {
    listRef: groupRef,
    handleKeyDown,
    handleFocus,
  } = useListFocus<HTMLDivElement>({
    itemSelector: '[role="radio"]',
    wrap: false,
    orientation: 'both',
  });
  const {hitAreaRef} = useGroupPressTracking(groupRef, tracksPress);
  const mergedRef = useMergedRefs(ref, groupRef, hitAreaRef);
  // Only a focus move from an arrow key, Home or End selects a star.
  // Tab, a pointer and a script move focus and select nothing.
  const isNavigating = useRef(false);
  const focusedStar = useRef<number | null>(null);
  const stars = Array.from({length: count}, (_, index) => index + 1);
  const choose = (star: number) => {
    if (!isEditable) {
      return;
    }
    if (star !== rating) {
      onChange?.(star);
    } else if (allowClear) {
      onChange?.(null);
    }
  };

  if (isReadOnly) {
    return (
      <div
        {...props}
        ref={mergedRef}
        role="img"
        onKeyDown={onKeyDownProp}
        onFocus={onFocusProp}
        aria-label={t('@astryx.rating.readOnlyLabel', {
          label,
          rating: starLabel(Number(rating.toFixed(1))),
        })}
        {...mergeProps(
          themeProps('rating', {size}),
          stylex.props(styles.group, xstyle),
          className,
          style,
        )}>
        {stars.map(star => {
          const fill = Math.min(1, Math.max(0, rating - (star - 1)));
          return (
            <StarGlyph
              key={star}
              size={size}
              fill={fill}
              isDisabled={isDisabled}
            />
          );
        })}
      </div>
    );
  }

  const tabStop = rating >= 1 ? rating : 1;

  return (
    <div
      {...props}
      ref={mergedRef}
      role="radiogroup"
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      onKeyDown={event => {
        onKeyDownProp?.(event);
        if (
          event.defaultPrevented ||
          !isEditable ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) {
          return;
        }
        isNavigating.current = true;
        try {
          handleKeyDown(event);
        } finally {
          isNavigating.current = false;
        }
      }}
      onFocus={event => {
        const star = focusedStar.current;
        focusedStar.current = null;
        onFocusProp?.(event);
        if (event.defaultPrevented) {
          return;
        }
        handleFocus(event);
        if (!isNavigating.current || !isEditable) {
          return;
        }
        if (star !== null && star !== rating) {
          onChange?.(star);
        }
      }}
      {...mergeProps(
        themeProps('rating', {size}),
        stylex.props(
          styles.group,
          tracksPress && styles.tracking,
          tracksPress && touchHitAreaStyles.layerBelowChildren,
          xstyle,
        ),
        className,
        style,
      )}>
      {stars.map(star => (
        <button
          key={star}
          {...(tracksPress ? pressGroupItemProps(GROUP_PRESS_POINTERS) : {})}
          type="button"
          role="radio"
          aria-checked={star === rating}
          aria-label={starLabel(star)}
          aria-disabled={isDisabled || undefined}
          tabIndex={star === tabStop ? 0 : -1}
          onFocus={() => {
            focusedStar.current = star;
          }}
          onClick={() => choose(star)}
          {...stylex.props(
            styles.star,
            isEditable && ratingStar,
            isEditable && styles.interactiveStar,
            star <= rating && styles.selectedStar,
            interactionOverlayStyles.backgroundColor,
            focusOutlineStyles.focusVisible,
          )}>
          <StarGlyph
            size={size}
            fill={star <= rating ? 1 : 0}
            isInteractive={isEditable}
            isDisabled={isDisabled}
          />
        </button>
      ))}
    </div>
  );
}

Rating.displayName = 'Rating';

// A fractional star fills from the inline start.
// The :dir(rtl) clip mirrors it in CSS.
function StarGlyph({
  size,
  fill,
  isDisabled = false,
  isInteractive = false,
}: {
  size: RatingSize;
  fill: number;
  isDisabled?: boolean;
  isInteractive?: boolean;
}) {
  const partial = fill > 0 && fill < 1;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      {...stylex.props(styles.glyph, styles[size])}>
      <path
        d={STAR_PATH}
        {...stylex.props(
          styles.path,
          styles.empty,
          !partial && fill === 1 && styles.filled,
          isInteractive && styles.interactivePath,
          isDisabled && styles.filledDisabled,
        )}
      />
      {partial ? (
        <path
          d={STAR_PATH}
          {...stylex.props(
            styles.path,
            styles.filled,
            styles.partial(fill),
            isDisabled && styles.filledDisabled,
          )}
        />
      ) : null}
    </svg>
  );
}
