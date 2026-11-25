// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentPin.tsx
 * @input Ordered participants (grouped pins show at most three circles),
 *   total and unread represented thread counts (unread shows as a dot), a
 *   size on the element-size scale, controlled or uncontrolled selection,
 *   disabled state, and button DOM props
 * @output Exports the avatar-first CommentPin button, its props type, and
 *   the CommentUser person record its participants share with Comments
 * @position Core collaboration primitive for annotation anchors over content
 *   or in content margins; callers own grouping, coordinates, and opened
 *   content
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/CommentPin/CommentPin.doc.mjs
 * - /docs/specs/components/CommentPin/CommentPin.spec.md
 * - /packages/core/src/CommentPin/CommentPin.test.tsx
 * - /packages/core/src/CommentPin/index.ts
 * - /packages/lab/src/CommentPin/index.ts
 * - /apps/storybook/stories/CommentPin.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/CommentPin/CommentPinShowcase.tsx
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Avatar, type AvatarSize} from '../Avatar/Avatar';
import {AvatarGroup} from '../AvatarGroup/AvatarGroup';
import {AvatarGroupOverflow} from '../AvatarGroup/AvatarGroupOverflow';
import type {BaseProps} from '../BaseProps';
import {useDevWarning} from '../hooks/useDevWarning';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {Icon, type IconSize} from '../Icon/Icon';
import type {ElementSize} from '../SizeContext/SizeContext';
import {StatusDot} from '../StatusDot/StatusDot';
import {
  borderVars,
  colorVars,
  fontWeightVars,
  shadowVars,
  sizeVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {useTooltip} from '../Tooltip/useTooltip';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';

/**
 * A person or agent who writes comments, reacts, or acts on the item. A
 * CommentPin's participants and the Comments family take the same records.
 */
export interface CommentUser {
  /** Stable host-owned id, used for equality ("is this my comment?"). */
  id: string;
  /** Full display name. Never a viewer-relative label such as "You". */
  name: string;
  /**
   * An agent shows its logo (`src`), or square-cornered initials without
   * one, and an Agent badge beside its name in a comment. A CommentPin draws
   * every participant the same way.
   * @default 'person'
   */
  kind?: 'person' | 'agent';
  /** Where the author's name links in a comment, such as their profile. */
  href?: string;
  /**
   * Profile picture, or an agent's square logo, as Avatar's `src`. Initials
   * without one.
   */
  src?: string;
}

export interface CommentPinProps extends Omit<
  BaseProps<HTMLButtonElement>,
  'children'
> {
  /** Ref forwarded to the marker button. */
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Accessible action name and visual hover/focus tooltip.
   * Include grouped or unread context when it changes the action's meaning.
   */
  label: string;
  /**
   * Ordered participants, lead first. A single marker shows the first. A
   * grouped marker shows distinct IDs as an AvatarGroup of at most three
   * circles: every participant when three or fewer are distinct, otherwise the
   * first two plus an ellipsis overflow circle. Pass every distinct
   * participant so the overflow appears only when more than three people
   * participate. The pin reads each person's `id`, `name`, and `src`, the
   * same `CommentUser` records the Comments family takes.
   */
  participants: readonly [CommentUser, ...CommentUser[]];
  /**
   * Pin height on the element-size scale: `sm` 28px, `md` 32px, `lg` 36px,
   * with 22px, 24px, and 28px participant circles.
   * @default 'sm'
   */
  size?: ElementSize;
  /**
   * Total number of threads represented by this marker. Values above one use
   * the grouped presentation and show the exact total.
   * @default 1
   */
  threadCount?: number;
  /**
   * Number of represented threads with unread activity. When above zero, an
   * accent status dot appears at the end of the pin: after the thread total,
   * or after the participant on a single pin. Values above `threadCount` are
   * capped.
   * @default 0
   */
  unreadCount?: number;
  /**
   * Whether this pin is the selected annotation target. Pass it to control
   * the selection; leave it out and the pin keeps its own.
   */
  isSelected?: boolean;
  /**
   * Whether the pin starts selected when `isSelected` is left out.
   * @default false
   */
  defaultIsSelected?: boolean;
  /**
   * Called with the requested selection when activation flips it: a click,
   * Enter, or Space. A disabled pin does not call it.
   */
  onSelectedChange?: (isSelected: boolean) => void;
  /** Whether activation is unavailable. */
  isDisabled?: boolean;
}

const styles = stylex.create({
  root: {
    appearance: 'none',
    boxSizing: 'border-box',
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    verticalAlign: 'middle',
    transformOrigin: {
      default: 'left bottom',
      ':is([dir="rtl"] *)': 'right bottom',
    },
    margin: 0,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: 'transparent',
    // Speech-bubble silhouette: a fixed 2px logical bottom-start corner; the
    // other three corners are half the pin's height (see `sizeStyles`). The
    // literal is intentional: no radius token is 2px, and themes may change
    // `--radius-inner`, which would soften the anchor cue. Logical longhands
    // mirror the corner in RTL by construction.
    borderEndStartRadius: '2px',
    backgroundColor: colorVars['--color-background-popover'],
    backgroundImage: 'none',
    boxShadow: shadowVars['--shadow-med'],
    color: colorVars['--color-text-secondary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  withCount: {
    justifyContent: 'flex-start',
    gap: spacingVars['--spacing-1'],
  },
  selected: {
    // Native buttons keep ButtonFace/ButtonText under forced colors unless the
    // selected state opts out of UA remapping; author both sides together.
    forcedColorAdjust: 'none',
    // The border stays transparent so the selection reads as exactly one 2px
    // accent outline: the box-shadow ring below, drawn outside the pin.
    borderColor: {
      default: 'transparent',
      '@media (forced-colors: active)': 'Highlight',
    },
    backgroundColor: {
      default: colorVars['--color-background-popover'],
      '@media (forced-colors: active)': 'Highlight',
    },
    // A solid 2px accent outline outside the pin, layered with its resting
    // medium elevation. A box-shadow ring shifts no layout, follows the
    // speech-bubble corners, and leaves the shared focus outline (offset
    // farther out) as a separate cue.
    boxShadow: {
      default: `0 0 0 2px ${colorVars['--color-accent']}, ${shadowVars['--shadow-med']}`,
      '@media (forced-colors: active)': 'none',
    },
    color: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'HighlightText',
    },
  },
  disabled: {
    cursor: 'default',
    opacity: {
      default: 0.45,
      '@media (forced-colors: active)': 1,
    },
  },
  // An aria-disabled button gets no system disabled paint in forced colors;
  // GrayText is the platform's disabled affordance there. Defaults repeat the
  // base values, since StyleX merges per property. Only unselected pins take
  // it — the selected treatment keeps its forced-colors Highlight, so a
  // selected disabled pin stays prominent.
  disabledUnselected: {
    borderColor: {
      default: 'transparent',
      '@media (forced-colors: active)': 'GrayText',
    },
    color: {
      default: colorVars['--color-text-secondary'],
      '@media (forced-colors: active)': 'GrayText',
    },
  },
  avatarRail: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  // AvatarGroup draws every face inside a 2px surface ring. Sitting the first
  // ring in the start padding keeps the faces themselves as far from the start
  // edge as from the top and bottom, as on a single pin.
  groupedRail: {
    marginInlineStart: -2,
  },
  // AvatarGroupOverflow pads its content for multi-digit `+N` pills; the
  // ellipsis inside this pin stays a circle the size of its sibling Avatars.
  overflowCircle: {
    paddingInline: 0,
  },
  // The thread total and then the unread dot follow the participants. The
  // end padding gives whichever comes last room before the pin's edge, so a
  // number or dot never crowds it.
  trailing: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    paddingInlineEnd: spacingVars['--spacing-1'],
  },
  count: {
    color: 'inherit',
    fontVariantNumeric: 'tabular-nums',
  },
  // StatusDot paints its plate with a background, which forced colors would
  // erase; there it takes the pin's own text color, so it shows in every state.
  unreadDot: {
    forcedColorAdjust: 'none',
    color: {
      default: colorVars['--color-on-accent'],
      '@media (forced-colors: active)': 'inherit',
    },
    backgroundColor: {
      default: colorVars['--color-accent'],
      '@media (forced-colors: active)': 'currentColor',
    },
  },
});

// Each size pairs an element-size height with a participant circle diameter
// (see AVATAR_SIZE). The padding is the inset that centers that circle in the
// height, applied on every side: the avatars and overflow sit the same
// distance from all four edges. The three round corners are half the height,
// which is fully round: the 9999px full-radius token would make the browser
// scale every corner down to fit the box (the CSS corner-overlap rule) and
// shrink the 2px anchor corner to nothing.
const sizeStyles = stylex.create({
  sm: {
    minWidth: sizeVars['--size-element-sm'],
    height: sizeVars['--size-element-sm'],
    padding: `calc((${sizeVars['--size-element-sm']} - 22px) / 2 - ${borderVars['--border-width']})`,
    borderStartStartRadius: `calc(${sizeVars['--size-element-sm']} / 2)`,
    borderStartEndRadius: `calc(${sizeVars['--size-element-sm']} / 2)`,
    borderEndEndRadius: `calc(${sizeVars['--size-element-sm']} / 2)`,
  },
  md: {
    minWidth: sizeVars['--size-element-md'],
    height: sizeVars['--size-element-md'],
    padding: `calc((${sizeVars['--size-element-md']} - 24px) / 2 - ${borderVars['--border-width']})`,
    borderStartStartRadius: `calc(${sizeVars['--size-element-md']} / 2)`,
    borderStartEndRadius: `calc(${sizeVars['--size-element-md']} / 2)`,
    borderEndEndRadius: `calc(${sizeVars['--size-element-md']} / 2)`,
  },
  lg: {
    minWidth: sizeVars['--size-element-lg'],
    height: sizeVars['--size-element-lg'],
    padding: `calc((${sizeVars['--size-element-lg']} - 28px) / 2 - ${borderVars['--border-width']})`,
    borderStartStartRadius: `calc(${sizeVars['--size-element-lg']} / 2)`,
    borderStartEndRadius: `calc(${sizeVars['--size-element-lg']} / 2)`,
    borderEndEndRadius: `calc(${sizeVars['--size-element-lg']} / 2)`,
  },
});

/**
 * Participant circle diameter per pin size, matching the literals in
 * `sizeStyles`. Avatar renders any pixel size; its typed scale lists neither
 * 22 nor 28, hence the cast.
 */
const AVATAR_SIZE: Record<ElementSize, AvatarSize> = {
  sm: 22 as AvatarSize,
  md: 24,
  lg: 28 as AvatarSize,
};

/** The overflow ellipsis per pin size. */
const OVERFLOW_ICON_SIZE: Record<ElementSize, IconSize> = {
  sm: 'xsm',
  md: 'xsm',
  lg: 'sm',
};

function takeDistinctParticipants(
  participants: ReadonlyArray<CommentUser>,
  limit: number,
): CommentUser[] {
  const result: CommentUser[] = [];
  const seen = new Set<string>();

  for (const participant of participants) {
    if (seen.has(participant.id)) {
      continue;
    }
    seen.add(participant.id);
    result.push(participant);
    if (result.length === limit) {
      break;
    }
  }

  return result;
}

function isValidThreadCount(threadCount: number): boolean {
  return (
    Number.isFinite(threadCount) &&
    Number.isInteger(threadCount) &&
    threadCount >= 1
  );
}

function isValidUnreadCount(unreadCount: number): boolean {
  return (
    Number.isFinite(unreadCount) &&
    Number.isInteger(unreadCount) &&
    unreadCount >= 0
  );
}

/** Grouped pins never show more than this many circles, overflow included. */
const MAX_GROUP_CIRCLES = 3;

/**
 * Avatar-first annotation anchor for one thread or a caller-defined group.
 *
 * The caller owns grouping, representative selection, coordinates, collision
 * handling, which pins render, and the content opened by activation. Absolute
 * placement maps the host anchor to the pin's logical bottom-start corner.
 * The pin owns its compact button surface and, when `isSelected` is left out,
 * its own selection. `size` sets its height on the element-size scale.
 *
 * @example
 * ```
 * <CommentPin
 *   label="Open annotation from Ada"
 *   participants={[{id: 'ada', name: 'Ada Lovelace'}]}
 *   onClick={() => openThread('thread-1')}
 * />
 * ```
 *
 * @example
 * ```
 * <CommentPin
 *   label="Open 6 grouped annotations from Ada, Lin, and 3 others, 2 unread"
 *   participants={[ada, lin, mira, noah, sam]}
 *   threadCount={6}
 *   unreadCount={2}
 *   isSelected={selectedId === 'cluster-1'}
 *   onSelectedChange={isSelected =>
 *     setSelectedId(isSelected ? 'cluster-1' : null)
 *   }
 * />
 * ```
 */
export function CommentPin({
  label,
  participants,
  size = 'sm',
  threadCount = 1,
  unreadCount = 0,
  isSelected: isSelectedProp,
  defaultIsSelected = false,
  onSelectedChange,
  isDisabled = false,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: CommentPinProps): React.ReactNode {
  const resolvedSize: ElementSize =
    size === 'md' || size === 'lg' ? size : 'sm';
  const [internalIsSelected, setInternalIsSelected] =
    useState(defaultIsSelected);
  const isControlled = isSelectedProp !== undefined;
  const isSelected = isControlled ? isSelectedProp : internalIsSelected;
  const avatarSize = AVATAR_SIZE[resolvedSize];
  const validThreadCount = isValidThreadCount(threadCount);
  const resolvedThreadCount = validThreadCount ? threadCount : 1;
  const isGrouped = resolvedThreadCount > 1;
  const validUnreadCount = isValidUnreadCount(unreadCount);
  const resolvedUnreadCount = validUnreadCount
    ? Math.min(unreadCount, resolvedThreadCount)
    : 0;
  const hasUnread = resolvedUnreadCount > 0;

  // Grouped pins cap at MAX_GROUP_CIRCLES circles: every distinct participant
  // when they fit, otherwise one fewer Avatar plus an ellipsis overflow circle.
  const distinctParticipants = takeDistinctParticipants(
    participants,
    isGrouped ? Number.POSITIVE_INFINITY : 1,
  );
  const hasOverflow =
    isGrouped && distinctParticipants.length > MAX_GROUP_CIRCLES;
  const visibleParticipants = hasOverflow
    ? distinctParticipants.slice(0, MAX_GROUP_CIRCLES - 1)
    : distinctParticipants;
  const overflowCount =
    distinctParticipants.length - visibleParticipants.length;

  useDevWarning(
    'CommentPin',
    '`participants` should contain at least one participant. Pass the lead participant for a single thread or every distinct participant for a group.',
    participants.length === 0,
  );
  useDevWarning(
    'CommentPin',
    '`threadCount` must be a finite positive integer. Invalid values fall back to 1.',
    !validThreadCount,
  );
  useDevWarning(
    'CommentPin',
    '`unreadCount` must be a finite non-negative integer no greater than `threadCount`. Invalid values are ignored and larger values are capped.',
    !validUnreadCount || unreadCount > resolvedThreadCount,
  );
  useDevWarning(
    'CommentPin',
    '`label` must be a non-empty accessible action name.',
    label.trim() === '',
  );

  const pressFeedback = usePressFeedback();
  const hasTooltip = !isDisabled && label.trim() !== '';
  const tooltip = useTooltip({
    placement: 'above',
    isEnabled: hasTooltip,
  });
  const mergedRef = useMergedRefs(ref, hasTooltip ? tooltip.ref : undefined);

  const avatarParticipants: ReadonlyArray<CommentUser> =
    visibleParticipants.length > 0
      ? visibleParticipants
      : [{id: '__anonymous__', name: ''}];

  const marker = (
    <button
      {...rest}
      {...pressFeedback}
      ref={mergedRef}
      type="button"
      aria-label={label}
      aria-pressed={isSelected}
      // A disabled pin keeps its tab stop and is announced as disabled through
      // aria-disabled instead of the native attribute. The activation guards
      // below keep it inert. Focus stays when the pin becomes disabled while
      // focused, and the shared focus outline still paints, dimmed with the
      // rest of the pin.
      aria-disabled={isDisabled ? 'true' : undefined}
      onClick={e => {
        if (isDisabled) {
          // A natively disabled element dispatched no click at all, so an
          // aria-disabled pin must not reach the caller's handler, and the
          // click must not leak to a clickable ancestor (annotation surface)
          // the native attribute never let it reach either.
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        rest.onClick?.(e);
        const nextIsSelected = !isSelected;
        if (!isControlled) {
          setInternalIsSelected(nextIsSelected);
        }
        onSelectedChange?.(nextIsSelected);
      }}
      // The keyboard paths to activation are Enter and Space; other keys still
      // reach caller handlers, as on an enabled pin.
      onKeyDown={e => {
        if (isDisabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        rest.onKeyDown?.(e);
      }}
      {...mergeProps(
        themeProps('comment-pin', {
          size: resolvedSize,
          grouped: isGrouped ? 'grouped' : null,
          unread: hasUnread ? 'unread' : null,
          selected: isSelected ? 'selected' : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        focusOutlineProps.focusVisible(
          styles.root,
          sizeStyles[resolvedSize],
          interactionOverlayStyles.backgroundImage,
          (isGrouped || hasUnread) && styles.withCount,
          isSelected && styles.selected,
          isDisabled && styles.disabled,
          isDisabled && !isSelected && styles.disabledUnselected,
          xstyle,
        ),
        className,
        style,
      )}>
      <span
        aria-hidden="true"
        {...stylex.props(styles.avatarRail, isGrouped && styles.groupedRail)}>
        {isGrouped ? (
          <AvatarGroup size={avatarSize}>
            {avatarParticipants.map(participant => (
              <Avatar
                key={participant.id}
                name={participant.name}
                src={participant.src}
                tooltip={false}
              />
            ))}
            {overflowCount > 0 ? (
              <AvatarGroupOverflow
                count={overflowCount}
                xstyle={styles.overflowCircle}>
                <Icon
                  icon="moreHorizontal"
                  size={OVERFLOW_ICON_SIZE[resolvedSize]}
                />
              </AvatarGroupOverflow>
            ) : null}
          </AvatarGroup>
        ) : (
          avatarParticipants.map(participant => (
            <Avatar
              key={participant.id}
              name={participant.name}
              src={participant.src}
              size={avatarSize}
              tooltip={false}
            />
          ))
        )}
      </span>
      {hasUnread || isGrouped ? (
        <span aria-hidden="true" {...stylex.props(styles.trailing)}>
          {isGrouped ? (
            <span {...stylex.props(styles.count)}>{resolvedThreadCount}</span>
          ) : null}
          {hasUnread ? (
            // Decorative: the button's label carries the unread context.
            <StatusDot variant="accent" label="" xstyle={styles.unreadDot} />
          ) : null}
        </span>
      ) : null}
    </button>
  );

  return (
    <>
      {marker}
      {hasTooltip ? tooltip.renderTooltip(label) : null}
    </>
  );
}

CommentPin.displayName = 'CommentPin';
