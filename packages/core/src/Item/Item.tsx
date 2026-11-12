// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Item.tsx
 * @input Uses React, ReactNode, StyleXStyles, theme tokens, useClickableContainer,
 *   the shared press overlays and the compositor press layer, and a row's
 *   trailing control (ItemTrailingContext)
 * @output Exports Item component, ItemProps type; publishes the shared inline inset.
 *   Only numbered composing rows keep their start/label/end slots in one flex
 *   group, through Item's private exact-marker scope; other marked rows keep
 *   their flat children. This lets List share a counter track without changing
 *   those slots' own layout.
 * @position Core layout primitive; consumed by index.ts, tested by Item.test.tsx
 *
 * The swipe actions live in ItemSwipeLayer, reached only through a dynamic
 * import when `swipeActions` is set: this module imports nothing of the
 * gesture, so a row without swipe actions ships none of it. The root here
 * still carries the swipe styles and forwards its events into the bridge the
 * layer fills, so a swipeable row keeps the DOM and the event model it had
 * when the gesture was imported here (Item.source-build.test.mjs pins the
 * import graph).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Item/Item.doc.mjs
 * - /packages/core/src/Item/Item.test.tsx
 * - /packages/core/src/Item/ItemSwipeLayer.tsx
 * - /packages/core/src/Item/index.ts
 * - /apps/storybook/stories/Item.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Item/ (showcase blocks)
 */

import {
  lazy,
  Suspense,
  use,
  useCallback,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
  durationVars,
  easeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {chainEventHandlers} from '../utils/chainEventHandlers';
import {useFocusAcrossSwap} from '../utils/useFocusAcrossSwap';
import {ItemDescriptionContext} from './ItemDescriptionContext';
import {ItemLabelContext, ItemLabelNeededContext} from './ItemLabelContext';
import {ItemListRowContext} from './ItemListRowContext';
import {ItemMarkerColumnsContext} from './ItemMarkerColumnsContext';
import {ItemTrailingContext} from './ItemTrailingContext';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {computeTargetAndRel} from '../Link/computeTargetAndRel';
import {useLinkComponent} from '../Link/useLinkComponent';
import {
  cancelNestedPress,
  PRESSABLE_CONTAINER_ATTRIBUTE,
  useClickableContainerProxy,
} from '../hooks/useClickableContainer';
import {useDevWarning} from '../hooks/useDevWarning';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {rowPressLayerStyles} from '../privateAttributes/press.stylex';
import {isCoarsePointer} from '../utils/coarsePointer';
import {disabledInteractionProps} from '../utils/disabledInteraction';
import {usePressFeedback} from '../hooks/usePressFeedback';
import type {ItemSwipeBridge} from './ItemSwipeLayer';

// The gesture and the panels, loaded only by a row that has swipe actions: a
// row without them never bundles useSwipeAction. While the chunk loads the
// row is already painted and at rest — the panels show nothing at rest, so
// nothing appears or moves when the layer mounts; the gesture simply attaches
// once the chunk is ready, as ProgressBar's and Timestamp's lazy affordances do.
const LazyItemSwipeLayer = lazy(async () => import('./ItemSwipeLayer'));

// =============================================================================
// Types
// =============================================================================

export type ItemAlign = 'center' | 'start' | 'first-line';
export type ItemDensity = 'compact' | 'balanced' | 'spacious';

/**
 * How a swipe action looks: ordinary, the one you mean, the dangerous one.
 * Three flavours of verb, not a status set.
 */
export type ItemSwipeActionVariant = 'neutral' | 'accent' | 'destructive';

/** One verb a sideways drag uncovers. Every field is known before the gesture begins. */
export interface ItemSwipeAction {
  id?: string;
  /**
   * The verb's name, and the button's accessible name while the row rests
   * open. Names the state the verb reaches ("Unread"), since the gesture
   * already supplies the verb.
   */
  label: string;
  /** Drawn above the label. */
  icon?: ReactNode;
  /**
   * Fires at activation: a tap on a resting entry, the full-swipe
   * accelerator, or a `commit` release. May return a Promise; the row
   * waits for nothing.
   */
  onActivate: () => void | Promise<void>;
  isDisabled?: boolean;
  /** @default 'accent' */
  variant?: ItemSwipeActionVariant;
  /**
   * After this action fires the row holds out at the edge it travelled
   * toward instead of springing back. Only that: not a promise the caller
   * removes the row, not an animation, not a timing rule.
   * @default false
   */
  hasRemoval?: boolean;
}

export interface ItemSwipeActions {
  /** Uncovered by a drag toward the inline end (rightward in LTR); outermost last. */
  leading?: ItemSwipeAction[];
  /** Uncovered by a drag toward the inline start (leftward in LTR); outermost last. */
  trailing?: ItemSwipeAction[];
}

/**
 * `reveal`: past half the panel, or after a fling, the row rests open with
 * every entry a real button; a long drag fires the outermost. On a side with
 * two or more entries, only a drag that starts on the open row fires it.
 * `commit`: a release past the commit point slides the row out and fires a
 * side's one entry; nothing rests, and the panel is presentational. On a side
 * with two or more entries, `commit` fires none. A fling never fires an entry.
 */
export type ItemSwipeBehavior = 'reveal' | 'commit';

export interface ItemProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLElement>;

  /**
   * What the root renders as: an HTML element, or a component for a caller
   * that needs the root to be something else. A menu row that navigates
   * passes the application's link component here, so the row's root IS the
   * anchor and a modified or middle click keeps the browser's meaning.
   *
   * Give a component only when the row carries a `role`, so the parent owns
   * keyboard access and the row adds no second tab stop; and only when no
   * interactive node sits in `startContent` or `endContent`, since a control
   * nested inside an anchor is invalid.
   * @default 'div'
   */
  as?: 'div' | 'li' | 'span' | React.ElementType;

  /**
   * Marker rendered before startContent as a direct flex child.
   * Use for list bullets/counters that need custom baseline alignment.
   */
  marker?: ReactNode;

  /**
   * Content rendered before the label/description area.
   * Use for leading icons, avatars, or checkboxes.
   */
  startContent?: ReactNode;

  /**
   * Primary text identifying this item. Required.
   * Accepts string (auto-styled) or ReactNode (for rich content).
   */
  label: ReactNode;

  /**
   * Secondary text — subtitle, description, or supporting info.
   */
  description?: ReactNode;

  /**
   * Content rendered after the label/description area.
   * Use for badges, metadata, timestamps, or action buttons.
   */
  endContent?: ReactNode;

  /**
   * Vertical alignment of the start/end content slots. `center` centers each
   * slot on the whole text block; `start` lines up slot tops with the text's
   * top; `first-line` centers each slot on the label's first line, so a small
   * mark (a status dot, a radio, a timestamp) stays level with the first line
   * of a wrapped label. A slot taller than that line moves the text down.
   * @default 'center'
   */
  align?: ItemAlign;

  /**
   * Density: "compact" (4px block padding), "balanced" (8px block padding),
   * or "spacious" (12px block and inline padding).
   * @default 'balanced'
   */
  density?: ItemDensity;

  /**
   * Max lines before label truncates. When set, overflow is hidden
   * and text-overflow: ellipsis is applied.
   */
  labelLines?: number;

  /**
   * Max lines before description truncates. When set, overflow is hidden
   * and text-overflow: ellipsis is applied.
   */
  descriptionLines?: number;

  /**
   * How the label and description sit together. `stacked` puts the description
   * on its own line below the label; `inline` keeps both on one line, with the
   * description ellipsizing first, so the row fits a fixed-height host.
   *
   * @default 'stacked'
   */
  layout?: 'stacked' | 'inline';

  /**
   * Click handler. Makes the item clickable with button semantics.
   */
  onClick?: (event: React.MouseEvent) => void;

  /**
   * Ref to a nested control inside the item (e.g. a checkbox in
   * `startContent`) that already provides the item's keyboard access and
   * action. When set, the item becomes an enlarged click/tap target that
   * delegates surface clicks to that control via the `useClickableContainer`
   * pattern: it renders no invisible button/anchor, so the row adds no second
   * tab stop (WCAG 4.1.2 — one focusable control per option). Clicks on the
   * control itself, and on any other nested interactive element, are left to
   * that element. Mutually exclusive with `onClick`/`href` — when
   * `interactiveRef` is set those are ignored (the nested control is the sole
   * action).
   */
  interactiveRef?: React.RefObject<HTMLElement | null>;

  /**
   * Link URL. Makes the item a link via an invisible anchor element. A row
   * whose root is already a link component (see `as`) carries the address on
   * that root instead, and no invisible anchor is rendered.
   */
  href?: string;

  /**
   * Link target (e.g., '_blank'). Only used with href.
   */
  target?: '_blank' | '_self';

  /**
   * Link relationship. Automatically includes noopener noreferrer when
   * target is "_blank".
   */
  rel?: string;

  /**
   * Highlighted state (hover/keyboard focus appearance).
   * @default false
   */
  isHighlighted?: boolean;

  /**
   * Selected state. Always applies the selected visual styling. When `role`
   * permits it (option, tab, row, gridcell, columnheader, rowheader, treeitem)
   * the state is exposed as `aria-selected`; otherwise (e.g. a listitem or a
   * bare div, where `aria-selected` is invalid ARIA) it falls back to
   * `aria-current="true"` so assistive tech is still told which item is
   * selected. A consumer-provided `aria-current` always wins.
   * @default false
   */
  isSelected?: boolean;

  /**
   * Disabled state. Interactive rows stay keyboard-reachable but cannot activate.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Swipe actions for touch: the verbs a sideways drag uncovers on each side,
   * declared as data so the row paints the panel from them. A coarse pointer
   * drags the row aside and uncovers the side's panel; a mouse never starts
   * the drag, and a mostly vertical drag stays the scroller's. The gesture is
   * a touch accelerator and never a row's only path to a verb: a verb
   * reachable only by swipe is unreachable by keyboard and by mouse, so every
   * entry must also be reachable through the row's own content (a menu or a
   * button in `endContent`).
   *
   * Available on a row whose role permits interactive descendants — a
   * `listitem`, a row with no role — and not served on one whose role forbids
   * them (`option`, `menuitem*`, a row that is the enlarged target of a native
   * radio). The element containing the rows clips in the inline axis
   * (`overflow-inline: clip`): `List` does; any other host does it once.
   *
   * The gesture and its panels are loaded on demand, the first time a row has
   * swipe actions, so a row without them ships none of it; a row with them is
   * drawn at once and becomes swipeable as soon as that module has loaded.
   */
  swipeActions?: ItemSwipeActions;

  /**
   * What a swipe does. `reveal` rests the row open with every entry tappable,
   * and a long drag fires the outermost. On a side with two or more entries,
   * only a drag from the open row fires it. `commit` slides the row out and
   * fires a side's one entry on release. On a side with two or more entries,
   * `commit` fires none.
   * @default 'reveal'
   */
  swipeBehavior?: ItemSwipeBehavior;

  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Roles on which WAI-ARIA permits the aria-selected attribute.
 * https://www.w3.org/TR/wai-aria-1.2/#aria-selected
 */
const ARIA_SELECTED_ROLES = new Set([
  'option',
  'tab',
  'row',
  'gridcell',
  'columnheader',
  'rowheader',
  'treeitem',
]);

/**
 * Roles whose content model permits interactive descendants, so a swipe
 * panel's buttons may live inside the row. A row with no role at all
 * qualifies too; `option`, the `menuitem*` roles and the rest do not.
 */
const SWIPE_ROLES = new Set(['listitem']);

/**
 * Whether a row serves swipe actions, and so is a stacking context at rest:
 * its root translates (`styles.swipeRoot`). Swipe actions need a
 * role that permits interactive descendants, since a swipe panel holds
 * buttons. That is a `listitem`, or no role at all. A root that is itself a
 * link is not served, nor is a role that forbids interactive descendants. A
 * disabled row, a row with no entry on either side, and the enlarged target of
 * a nested control are not served either. Internal: under a finger,
 * List/ListItem.tsx raises such a row, so its touch band stays above the rows
 * after it.
 */
export function servesSwipeActions({
  swipeActions,
  isDisabled,
  isDelegate,
  isLinkRoot,
  role,
}: {
  readonly swipeActions: ItemSwipeActions | undefined;
  readonly isDisabled: boolean;
  readonly isDelegate: boolean;
  readonly isLinkRoot: boolean;
  readonly role: string | null | undefined;
}): boolean {
  return (
    swipeActions != null &&
    ((swipeActions.leading?.length ?? 0) > 0 ||
      (swipeActions.trailing?.length ?? 0) > 0) &&
    !isDisabled &&
    !isDelegate &&
    !isLinkRoot &&
    (role == null || SWIPE_ROLES.has(role))
  );
}

/** The travel a drag writes on the row root, in physical px (see useSwipeAction). */
const SWIPE_TRAVEL = 'var(--_item-swipe-travel, 0px)';
/** The settle clock, `0s` while the finger drives the row. */
const SWIPE_DURATION = 'var(--_item-swipe-duration, 0s)';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    // The inline inset is published as --_item-inset-inline and the padding
    // derives from it, so consumers that need to compensate for the inset
    // (List's edge treatments) read the var instead of mirroring the values.
    // Themes that set paddingInline on `item` also feed this var via the
    // derived var registry, keeping padding and compensation in sync.
    '--_item-inset-inline': spacingVars['--spacing-2'],
    paddingInline: 'var(--_item-inset-inline)',
    position: 'relative',
    boxSizing: 'border-box',
    textAlign: 'start',
    borderRadius: radiusVars['--radius-element'],
  },
  // One content cell beside the marker. Its slots retain the row's flex
  // alignment and gap, including first-line alignment and tall start content.
  // A numbered List can then subgrid the row into marker/content columns.
  markerContent: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    alignItems: 'inherit',
    alignSelf: 'stretch',
    gap: 'inherit',
  },
  markerContentFirstLine: {
    // A tall start/end slot moves the first text baseline down. The marker
    // must follow that baseline, not the stretched group's top edge.
    alignSelf: 'baseline',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  // `first-line`: the row aligns its children on their first baselines. The
  // label's first baseline is its first line's; each slot gets the same
  // baseline from its strut (below), which the slot centers against its
  // content. So each slot's center lands on the first line's center for any
  // slot height, and a taller slot pushes the text down instead of leaving
  // the row. Pure CSS: no measurement.
  alignFirstLine: {
    alignItems: 'baseline',
  },
  // A zero-width line of label text inside the slot: same size and leading as
  // the label, so its line box is the label's first line box. The slot centers
  // it against the slot's content, and the row's baseline alignment puts it on
  // the label's first line. Its content carries empty alternative text so
  // assistive technology reads nothing from it.
  firstLineSlot: {
    alignItems: 'center',
    '::before': {
      content: stylex.firstThatWorks('"\\200B" / ""', '"\\200B"'),
      inlineSize: 0,
      overflow: 'hidden',
      fontSize: typeScaleVars['--text-body-size'],
      lineHeight: typeScaleVars['--text-body-leading'],
    },
  },
  interactive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast-min'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  highlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  selected: {
    backgroundColor: colorVars['--color-accent-muted'],
  },
  disabled: {
    cursor: 'default',
    pointerEvents: 'none' as const,
  },
  // A row whose root is the link: the browser's anchor paint stays out of it.
  linkRoot: {
    color: 'inherit',
    textDecoration: 'none',
  },
  disabledContent: {
    opacity: 0.5,
  },
  invisibleButton: {
    cursor: {
      default: 'inherit',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    textAlign: 'start',
    outline: 'none',
  },
  invisibleAnchor: {
    cursor: {
      default: 'inherit',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    textAlign: 'start',
    textDecoration: 'none',
    outline: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    textAlign: 'start',
  },
  // `layout="inline"`: label and description share one line, so the row fits a
  // fixed-height host such as a Selector trigger inside an InputGroup.
  inlineContent: {
    flexDirection: 'row',
    // Centered, not baseline-aligned: two different font sizes on a shared
    // baseline make a line box taller than either line, which would push a
    // fixed-height host (a Selector trigger) a pixel off its size token.
    alignItems: 'center',
    columnGap: spacingVars['--spacing-1'],
  },
  inlineLabel: {
    flexShrink: 0,
  },
  // The description yields width first, so the label — the part that identifies
  // the item — is the last thing to ellipsize.
  inlineDescription: {
    flexShrink: 1,
    minWidth: 0,
  },
  label: {
    // Falls back to the primary text token; a parent (e.g. a destructive menu
    // item) can recolor the label by setting --_item-label-color.
    color: `var(--_item-label-color, ${colorVars['--color-text-primary']})`,
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  labelSingleTruncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  labelMultiTruncate: {
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
  },
  description: {
    // Companion to --_item-label-color for the secondary line.
    color: `var(--_item-description-color, ${colorVars['--color-text-secondary']})`,
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  descriptionSingleTruncate: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  descriptionMultiTruncate: {
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
  },
  startContent: {
    flex: '0 0 auto',
    display: 'flex',
  },
  endContent: {
    flex: '0 0 auto',
    display: 'flex',
    marginInlineStart: 'auto',
  },
  // Swipe actions. The root translates by the drag's travel and settles on
  // the clock the gesture writes; `pan-y` lets the browser keep scrolling the
  // list while the row owns horizontal movement, and `pinch-zoom` leaves a
  // two-finger pinch that starts on the row to the browser, so the page stays
  // zoomable (WCAG 1.4.4). The hover transition keeps its own clock beside
  // the transform's.
  swipeRoot: {
    touchAction: 'pan-y pinch-zoom',
    transform: `translate3d(${SWIPE_TRAVEL}, 0, 0)`,
    transitionProperty: 'background-color, transform',
    transitionDuration: `${durationVars['--duration-fast-min']}, ${SWIPE_DURATION}`,
    transitionTimingFunction: `${easeVars['--ease-standard']}, ease-out`,
  },
});

const dynamicStyles = stylex.create({
  lineClamp: (lines: number) => ({
    WebkitLineClamp: lines,
  }),
});

const densityStyles = stylex.create({
  compact: {
    paddingBlock: spacingVars['--spacing-1'],
  },
  balanced: {
    paddingBlock: spacingVars['--spacing-2'],
  },
  spacious: {
    paddingBlock: spacingVars['--spacing-3'],
    '--_item-inset-inline': spacingVars['--spacing-3'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A universal item primitive that unifies the "start content + label +
 * description + end content" layout pattern. Use as a building block for list items,
 * menu items, contact rows, notification items, and more.
 *
 * @example
 * ```
 * <Item
 *   startContent={<Avatar src={user.avatar} size="sm" />}
 *   label={user.name}
 *   description={user.role}
 *   endContent={<Badge>Admin</Badge>}
 *   onClick={() => navigate(`/users/${user.id}`)}
 * />
 * ```
 */
export function Item({
  as: Component = 'div',
  marker,
  startContent,
  label,
  description,
  endContent,
  align = 'center',
  density = 'balanced',
  labelLines,
  descriptionLines,
  layout = 'stacked',
  onClick,
  interactiveRef,
  href,
  target: targetFromProps,
  rel: relFromProps,
  isHighlighted = false,
  isSelected = false,
  isDisabled = false,
  swipeActions,
  swipeBehavior = 'reveal',
  xstyle,
  className,
  style,
  ref,
  role,
  ...restProps
}: ItemProps) {
  const pressable = usePressFeedback();
  const columnMarker = use(ItemMarkerColumnsContext);
  const isListRow = use(ItemListRowContext);
  const LinkComponent = useLinkComponent();
  // A disabled row's anchor has no destination, so no activation path (a
  // screen reader's click, Enter, a link context menu) can navigate
  // (spec:AST-085 FR2). Like a disabled Link, it keeps the link role and skips
  // the router link component, which may require a live href. The element type
  // then changes with `isDisabled`, so focus follows the swap (FR4).
  const RowAnchor = isDisabled ? 'a' : LinkComponent;
  // The row's own action, its invisible link or button: a press on it
  // activates the row.
  const actionLinkRef = useRef<HTMLAnchorElement | null>(null);
  const actionButtonRef = useRef<HTMLButtonElement | null>(null);
  const anchorRef = useFocusAcrossSwap<HTMLAnchorElement>(actionLinkRef);

  // Delegation mode: the row is an enlarged click/tap target for a nested
  // control (e.g. a checkbox) that owns the keyboard access and action. The
  // control is the row's only tab stop; the row proxies surface clicks to it.
  const isDelegate = interactiveRef != null;
  const containerRef = useRef<HTMLElement | null>(null);
  // Only onClick is needed: onMouseUp handles middle-click href navigation,
  // which delegation mode never has (href is ignored here). A List link row's
  // surface click goes to its anchor through the same hook and its guards.
  const {onClick: containerOnClick, onPointerDown: delegatedOnPointerDown} =
    useClickableContainerProxy({
      containerRef,
      interactiveRef: interactiveRef ?? actionLinkRef,
      disabled: isDisabled,
    });

  useDevWarning(
    'Item',
    '`interactiveRef` is mutually exclusive with `onClick`/`href`. In ' +
      'delegation mode the row only forwards clicks to the referenced control, ' +
      'so `onClick`/`href` are ignored. Drop one of them.',
    isDelegate && (onClick != null || href != null),
  );

  const isInteractive = onClick != null || href != null || isDelegate;
  const hasStateFill = isHighlighted || isSelected;
  const {target, rel} = computeTargetAndRel(targetFromProps, relFromProps);
  // When a semantic role is provided (e.g. "menuitem"), a parent component
  // handles keyboard access. Skip the invisible button/anchor and put
  // onClick directly on the root element instead.
  const hasParentRole = role != null;
  // The root is whatever `as` says it is. A caller that passed a link
  // component means the root itself is the anchor, so the address rides it
  // and the invisible anchor below is not rendered.
  const isLinkRoot = typeof Component !== 'string' && href != null;
  // A press on a nested control does not run this row's action, so the row
  // shows no touch press. A row with a parent role or a link root runs it, so
  // it keeps the press. Such a row is not a clickable container: an enclosing
  // card still treats it as part of its own surface.
  const hasOwnAction =
    (onClick != null || href != null) && !hasParentRole && !isLinkRoot;
  const pressOnRow = (event: React.PointerEvent<HTMLElement>) =>
    cancelNestedPress(
      event,
      event.currentTarget,
      href != null ? actionLinkRef.current : actionButtonRef.current,
    );

  const leadingSwipe = swipeActions?.leading ?? [];
  const trailingSwipe = swipeActions?.trailing ?? [];
  const hasSwipe = servesSwipeActions({
    swipeActions,
    isDisabled,
    isDelegate,
    isLinkRoot,
    role,
  });
  useDevWarning(
    'Item',
    '`swipeBehavior="commit"` fires no entry on a side with two or more ' +
      'entries. Give a committing side one entry, or use ' +
      '`swipeBehavior="reveal"`.',
    hasSwipe &&
      swipeBehavior === 'commit' &&
      (leadingSwipe.length > 1 || trailingSwipe.length > 1),
  );
  const swipeRootRef = useRef<HTMLElement | null>(null);
  // Filled by the swipe layer once it has mounted; empty until then and on a
  // row without swipe actions, when the forwarders below do nothing.
  const swipeBridgeRef = useRef<ItemSwipeBridge | null>(null);
  const setSwipeBridge = useCallback((bridge: ItemSwipeBridge | null) => {
    swipeBridgeRef.current = bridge;
  }, []);
  const linkRootProps = isLinkRoot
    ? {
        // A disabled row keeps its place in the tree but goes nowhere.
        href: isDisabled ? undefined : href,
        target: isDisabled ? undefined : target,
        rel: isDisabled ? undefined : rel,
      }
    : null;
  // aria-selected is only valid on selectable roles (option, tab, treeitem,
  // grid cells). On the default div/li root the attribute is invalid ARIA
  // (axe: aria-allowed-attr), so selection stays visual-only there — callers
  // that need selection semantics pass a permitted role.
  const allowsAriaSelected = role != null && ARIA_SELECTED_ROLES.has(role);

  // The description element's id, published through ItemDescriptionContext so a
  // control Item renders in a slot can point at it with `aria-describedby`.
  // `isRenderable` rather than `!= null` so the common empty values — `null`,
  // `undefined`, `false`, `''` — publish no id and leave a consumer with no
  // dangling reference. It is a shallow check: content that renders nothing
  // only once React runs it, such as an empty fragment, still publishes an id.
  const descriptionID = useId();
  const hasRenderableDescription = isRenderable(description);
  // The label element's id, published through ItemLabelContext for a control
  // Item renders in a slot that is named after the row (`aria-labelledby`).
  // Only a row with such a control gives its label an id.
  const labelID = useId();
  const isLabelNeeded = use(ItemLabelNeededContext);
  const publishedLabelID =
    isLabelNeeded && isRenderable(label) ? labelID : null;

  const isStringLabel = typeof label === 'string';
  const isStringDescription = typeof description === 'string';

  const labelTruncateStyle =
    labelLines != null
      ? labelLines === 1
        ? styles.labelSingleTruncate
        : styles.labelMultiTruncate
      : isStringLabel
        ? styles.labelSingleTruncate
        : null;

  // Inline rows are one line by definition, so the description always
  // ellipsizes there — a ReactNode description cannot wrap the row open.
  const isInline = layout === 'inline' && hasRenderableDescription;

  const descriptionTruncateStyle =
    descriptionLines != null
      ? descriptionLines === 1
        ? styles.descriptionSingleTruncate
        : styles.descriptionMultiTruncate
      : isStringDescription || isInline
        ? styles.descriptionSingleTruncate
        : null;

  const labelAndDescription = (
    <>
      <span
        id={publishedLabelID ?? undefined}
        {...stylex.props(
          styles.label,
          isInline && styles.inlineLabel,
          labelTruncateStyle,
          labelLines != null &&
            labelLines > 1 &&
            dynamicStyles.lineClamp(labelLines),
        )}>
        {label}
      </span>
      {hasRenderableDescription && (
        <span
          id={descriptionID}
          {...stylex.props(
            styles.description,
            isInline && styles.inlineDescription,
            descriptionTruncateStyle,
            descriptionLines != null &&
              descriptionLines > 1 &&
              dynamicStyles.lineClamp(descriptionLines),
          )}>
          {description}
        </span>
      )}
    </>
  );

  const isLinkRow = isListRow && onClick == null && href != null && !isLinkRoot;

  const handleContainerClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) {
      return;
    }
    if (isLinkRow) {
      // Under a coarse primary pointer, a tap in the row's padding or band
      // follows its link, with the click's modifier keys. The primary pointer
      // decides, as it decides the band, not the pointer that made the click.
      const row = e.currentTarget as HTMLElement;
      const box = row.getBoundingClientRect();
      const isInBand =
        e.clientX < box.left ||
        e.clientX > box.right ||
        e.clientY < box.top ||
        e.clientY > box.bottom;
      if (
        e.detail > 0 &&
        (isInBand || isCoarsePointer(row.ownerDocument.defaultView))
      ) {
        containerOnClick(e as React.MouseEvent<HTMLElement>);
      }
      return;
    }
    onClick?.(e);
  };

  // A control a row adds after the slots, unwrapped (ItemTrailingContext):
  // a List row's reorder handle when the row has no end content.
  const trailing = use(ItemTrailingContext);

  const content = (
    <>
      {isRenderable(startContent) && (
        <span
          {...stylex.props(
            styles.startContent,
            align === 'first-line' && styles.firstLineSlot,
          )}>
          {startContent}
        </span>
      )}

      {hasParentRole || isDelegate ? (
        // Delegation mode (and parent-role mode) put the label in a plain span:
        // keyboard access lives on the nested control, so no invisible
        // button/anchor is rendered and the row adds no second tab stop.
        <span
          {...stylex.props(
            styles.content,
            isInline && styles.inlineContent,
            isDisabled && styles.disabledContent,
          )}>
          {labelAndDescription}
        </span>
      ) : href != null && !isLinkRoot ? (
        <RowAnchor
          ref={anchorRef}
          {...(isDisabled
            ? {role: 'link', 'aria-disabled': true, tabIndex: 0}
            : {href, target, rel})}
          {...stylex.props(
            styles.invisibleAnchor,
            isInline && styles.inlineContent,
            isDisabled && styles.disabledContent,
          )}>
          {labelAndDescription}
        </RowAnchor>
      ) : onClick != null ? (
        <button
          ref={actionButtonRef}
          type="button"
          onClick={onClick}
          aria-disabled={isDisabled || undefined}
          {...(isDisabled
            ? disabledInteractionProps<HTMLButtonElement>()
            : null)}
          {...stylex.props(
            styles.invisibleButton,
            isInline && styles.inlineContent,
            isDisabled && styles.disabledContent,
          )}>
          {labelAndDescription}
        </button>
      ) : (
        <span
          {...stylex.props(
            styles.content,
            isInline && styles.inlineContent,
            isDisabled && styles.disabledContent,
          )}>
          {labelAndDescription}
        </span>
      )}

      {isRenderable(endContent) && (
        <span
          {...stylex.props(
            styles.endContent,
            align === 'first-line' && styles.firstLineSlot,
            isDisabled && styles.disabledContent,
          )}>
          {endContent}
        </span>
      )}
      {trailing}
    </>
  );

  const mergedRef = useMergedRefs(ref, containerRef);
  const rootRef = useMergedRefs(
    (isDelegate || isLinkRow ? mergedRef : ref) as React.Ref<HTMLElement>,
    hasSwipe ? swipeRootRef : undefined,
  );

  // The row's own primary, which the click the browser synthesizes after a
  // drag must not fire.
  const primaryOnClick = isDelegate
    ? containerOnClick
    : hasParentRole
      ? onClick
      : isInteractive
        ? handleContainerClick
        : undefined;
  const rootOnClick =
    hasSwipe && primaryOnClick != null
      ? (event: React.MouseEvent<HTMLElement>) => {
          if (swipeBridgeRef.current?.shouldSuppressClick() === true) {
            return;
          }
          primaryOnClick(event);
        }
      : primaryOnClick;

  // The gesture's handlers, forwarded from the root into the bridge the swipe
  // layer fills: the root keeps the event model it had before the split — React's
  // own pointer, click-capture and key events on the row's root — while the
  // gesture itself lives in the lazily loaded layer. Until the layer has
  // mounted the bridge is empty and each forwarder does nothing.
  const swipeHandlers = hasSwipe
    ? {
        onPointerDown: (event: React.PointerEvent) =>
          swipeBridgeRef.current?.handlers.onPointerDown(event),
        onPointerMove: (event: React.PointerEvent) =>
          swipeBridgeRef.current?.handlers.onPointerMove(event),
        onPointerUp: (event: React.PointerEvent) =>
          swipeBridgeRef.current?.handlers.onPointerUp(event),
        onPointerCancel: (event: React.PointerEvent) =>
          swipeBridgeRef.current?.handlers.onPointerCancel(event),
        onClickCapture: (event: React.MouseEvent) =>
          swipeBridgeRef.current?.handlers.onClickCapture(event),
        onKeyDown: (event: React.KeyboardEvent) =>
          swipeBridgeRef.current?.handlers.onKeyDown(event),
      }
    : undefined;

  return (
    <Component
      ref={rootRef as React.Ref<never>}
      {...restProps}
      {...swipeHandlers}
      {...linkRootProps}
      {...(isDelegate
        ? {
            onPointerDown: chainEventHandlers(
              restProps.onPointerDown,
              delegatedOnPointerDown,
            ),
          }
        : hasOwnAction && !isDisabled
          ? {
              onPointerDown: chainEventHandlers(
                swipeHandlers?.onPointerDown ?? restProps.onPointerDown,
                pressOnRow,
              ),
            }
          : null)}
      // Only a delegate row is a pressable container. So a mouse click in a
      // link row's padding still reaches a clickable container around it.
      {...(isDelegate ? {[PRESSABLE_CONTAINER_ATTRIBUTE]: 'true'} : undefined)}
      aria-selected={(allowsAriaSelected && isSelected) || undefined}
      // aria-selected is invalid on roles that don't permit it (listitem, a
      // bare div, etc.). For those, convey selection via aria-current — valid
      // on any element — so the state still reaches AT. Written after
      // {...restProps} so it must defer to a consumer-provided aria-current.
      aria-current={
        restProps['aria-current'] ??
        (isSelected && !allowsAriaSelected ? true : undefined)
      }
      aria-disabled={isDisabled || undefined}
      {...(isInteractive ? pressable : undefined)}
      {...mergeProps(
        themeProps('item', {
          density,
          align,
          highlighted: isHighlighted ? 'highlighted' : null,
          selected: isSelected ? 'selected' : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        focusOutlineProps.focusWithin(
          styles.root,
          densityStyles[density],
          align === 'start' && styles.alignStart,
          align === 'first-line' && styles.alignFirstLine,
          isInteractive && styles.interactive,
          // A row with a state fill keeps the fill as its background colour.
          // Its overlay paints as an image layer over the fill.
          isInteractive &&
            (hasStateFill
              ? interactionOverlayStyles.backgroundImage
              : interactionOverlayStyles.backgroundColor),
          // The touch press on a compositor layer (after the overlay, whose
          // own touch paint it turns off): the release keeps fading while
          // script runs.
          isInteractive && rowPressLayerStyles.cell,
          // A highlighted row's fill is already the hover tone, so it shows
          // only its press. A selected row also shows its hover.
          isInteractive &&
            hasStateFill &&
            (isSelected
              ? rowPressLayerStyles.cellOnImage
              : rowPressLayerStyles.cellOnImagePressOnly),
          isLinkRoot && styles.linkRoot,
          isHighlighted && styles.highlighted,
          isSelected && styles.selected,
          isDisabled && !hasParentRole && styles.disabled,
          hasSwipe && styles.swipeRoot,
          xstyle,
        ),
        className,
        style,
      )}
      role={role}
      onClick={rootOnClick}>
      <ItemTrailingContext value={null}>
        <ItemDescriptionContext
          value={hasRenderableDescription ? descriptionID : null}>
          <ItemLabelContext value={publishedLabelID}>
            <ItemLabelNeededContext value={false}>
              <ItemListRowContext value={false}>
                {isRenderable(marker) && marker}
                {isRenderable(marker) && columnMarker === marker ? (
                  <span
                    {...stylex.props(
                      styles.markerContent,
                      align === 'first-line' && styles.markerContentFirstLine,
                    )}>
                    {content}
                  </span>
                ) : (
                  content
                )}
              </ItemListRowContext>
            </ItemLabelNeededContext>
          </ItemLabelContext>
        </ItemDescriptionContext>
      </ItemTrailingContext>
      {hasSwipe && (
        // The panels: out-of-flow children of this root, so the DOM is the one
        // the row had before the split. Suspense and lazy add no element, and
        // the fallback is nothing — at rest a panel shows nothing either.
        <Suspense fallback={null}>
          <LazyItemSwipeLayer
            rootRef={swipeRootRef}
            onBridge={setSwipeBridge}
            leading={leadingSwipe}
            trailing={trailingSwipe}
            behavior={swipeBehavior}
          />
        </Suspense>
      )}
    </Component>
  );
}

Item.displayName = 'Item';
