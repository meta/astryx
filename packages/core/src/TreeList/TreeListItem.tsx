// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TreeListItem.tsx
 * @input Uses React, StyleX, theme tokens, TreeListBranches
 * @output Exports TreeListItem component (internal, not publicly exported)
 * @position Internal implementation; consumed by TreeList.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TreeList/TreeList.doc.mjs
 * - /packages/core/src/TreeList/TreeList.tsx
 * - /packages/cli/assets/templates/blocks/components/TreeList/ (showcase blocks)
 */

import {useId, useMemo, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
  durationVars,
  easeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {
  hasInteractiveAncestor,
  useClickableContainer,
} from '../hooks/useClickableContainer';
import {Icon} from '../Icon';
import {mergeProps} from '../utils';
import {useLinkComponent} from '../Link/useLinkComponent';
import {TreeListBranches} from './TreeListBranches';
import type {TreeListDensity, TreeListVariant} from './TreeListTypes';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import {disabledInteractionProps} from '../utils/disabledInteraction';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  wrapper: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    position: 'relative',
    width: '100%',
    // Publish whether THIS treeitem has keyboard focus, for its row's
    // `zIndex` (see `contentWrapper`). Every nested <li> redeclares the
    // default, so a focused ancestor never lifts its descendants' rows.
    '--_tree-focus-z': {
      default: 'auto',
      ':focus-visible': '2',
    },
    // The treeitem row is the roving-tabindex focus owner; suppress the
    // native focus ring in favor of the row's :focus-visible outline below.
    outline: 'none',
    // Publish this row's own focus state as an inheritable CSS variable
    // instead of matching it via an ancestor selector. Every nested <li>
    // redeclares these vars (default: 'none' / '0'), so a descendant row's
    // default shadows an ancestor's active value — the ring can never leak
    // past the nearest containing treeitem, however deep the tree nests.
  },
  childGroup: {
    margin: 0,
    padding: 0,
    listStyleType: 'none',
  },
  treeBranches: {
    paddingInlineStart: spacingVars['--spacing-2'],
  },
  rowWrapper: {
    position: 'relative',
    // Inter-row gap. Half the public `--tree-list-row-gap` lever sits above and
    // half below the row box; because this is PADDING (not margin) it cannot
    // collapse, so adjacent rows end up a full gap apart — and it rides the
    // `rowWrapper`, which carries no theme target, so the paintable
    // `tree-list-item` stays a pure paint seam (layout lives off it). The <li>s
    // stay contiguous — the gap is padding INSIDE each <li>, not space between
    // them — so the per-<li> connector guide can still span it and read as a
    // continuous line (see TreeListBranches). The lever's default is a subtle
    // `--spacing-0-5` (2px, set on the tree-list root); a theme widens or closes
    // it via the `tree-list` target.
    paddingBlock: 'calc(var(--tree-list-row-gap, 0px) / 2)',
  },
  contentWrapper: {
    borderRadius: radiusVars['--radius-element'],
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    // The row's own inline padding only. The per-level indent lives on
    // `indentedContent` inside it, so a theme or caller padding here composes
    // with the indent instead of replacing it.
    paddingInline: spacingVars['--spacing-2'],
    // No `outline: 'none'` here: this element receives the shared focus ring,
    // which already defaults to none, and the shorthand would erase it.
    overflow: 'hidden',
    position: 'relative',
    boxSizing: 'border-box',
    textAlign: 'start',
  },
  // Guide lines draw above the rows (TreeListBranches) so a row's fill does
  // not break them. Lift the row whose focus ring is showing above the guides
  // too, so no guide cuts through the ring: when focus is inside the row, or
  // when its own treeitem publishes focus (`--_tree-focus-z` on `wrapper`).
  // The ring is the row's outline, so it cannot be lifted on its own: a
  // focused row that is also filled (selected or hovered) covers the guides at
  // that row. That is the accepted trade-off (DD3). Applied only with
  // `focusWithinOrPublished`, the rows that draw the ring: a plain row shows
  // no ring, so its fill stays under the guides.
  focusLift: {
    zIndex: {
      default: 'var(--_tree-focus-z, auto)',
      ':has(:focus-visible)': 2,
    },
  },
  // Per-level indent, drawn INSIDE the row box: the row (`contentWrapper`)
  // stays full width, so a nested row's hover and selected fill spans the
  // list like a root row's, while its content sits exactly where a margin
  // indent would put it. A child of the row rather than the row's own padding,
  // so a theme or caller that sets the row's padding keeps the indent. It
  // inherits the row's flex alignment and gap, so a theme that retunes those
  // on `tree-list-item` still lays the content out. The row publishes only the
  // computed distance as `--_tree-indent`; the per-level step is the public,
  // themeable `--tree-list-indent` lever (see TreeList `root`).
  indentedContent: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    alignItems: 'inherit',
    gap: 'inherit',
    paddingInlineStart: 'var(--_tree-indent, 0px)',
  },
  interactive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-image',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  selected: {
    backgroundColor: colorVars['--color-accent-muted'],
  },
  invisibleButton: {
    cursor: {
      default: 'inherit',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    font: 'inherit',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    textAlign: 'start',
    // Suppress inner focus ring — the parent <li> handles it via :has(:focus-visible)
    outline: 'none',
  },
  invisibleAnchor: {
    cursor: {
      default: 'inherit',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    font: 'inherit',
    color: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    textAlign: 'start',
    textDecoration: 'none',
    // Suppress inner focus ring — the parent <li> handles it via :has(:focus-visible)
    outline: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    textAlign: 'start',
  },
  label: {
    color: colorVars['--color-text-primary'],
  },
  description: {
    color: colorVars['--color-text-secondary'],
  },
  startContent: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  endContent: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    marginInlineStart: 'auto',
  },
  chevronContainer: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: spacingVars['--spacing-4'],
    height: spacingVars['--spacing-4'],
    fontSize: spacingVars['--spacing-4'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    color: colorVars['--color-icon-secondary'],
    borderRadius: radiusVars['--radius-inner'],
    marginInlineStart: spacingVars['--spacing-1'],
    marginInlineEnd: `calc(${spacingVars['--spacing-1']} * -1)`,
  },
  chevronButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: spacingVars['--spacing-4'],
    height: spacingVars['--spacing-4'],
    fontSize: spacingVars['--spacing-4'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: colorVars['--color-icon-secondary'],
    borderRadius: radiusVars['--radius-inner'],
    marginInlineStart: spacingVars['--spacing-1'],
    marginInlineEnd: `calc(${spacingVars['--spacing-1']} * -1)`,
  },
  chevronSvg: {
    display: 'flex',
    // The chevron column is sized in spacing tokens by the button/container
    // around it (--spacing-4 = 16px), not on Icon's rem scale, so the glyph's
    // box is pinned to that same token. Icon's `sm` (1rem) only coincides with
    // 16px at a 16px root font-size; drifting off the token would knock the
    // glyph out of its 16px column.
    width: spacingVars['--spacing-4'],
    height: spacingVars['--spacing-4'],
    fontSize: spacingVars['--spacing-4'],
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // The RTL mirror is folded into each state's transform rather than living on
  // a parent span. Both are `transform`, so on one element the later value
  // would win — spelling out `scaleX(-1) rotate(...)` per state composes them
  // exactly as the nested elements did, while leaving a single element to
  // carry the glyph's theme target.
  chevronExpanded: {
    transform: {
      default: 'rotate(90deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(90deg)',
    },
  },
  chevronCollapsed: {
    transform: {
      default: 'rotate(0deg)',
      ':is([dir="rtl"] *)': 'scaleX(-1) rotate(0deg)',
    },
  },
});

const densityStyles = stylex.create({
  compact: {
    paddingBlock: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  balanced: {
    paddingBlock: spacingVars['--spacing-2'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  spacious: {
    paddingBlock: spacingVars['--spacing-3'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
});

const descriptionSizeStyles = stylex.create({
  compact: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  balanced: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  spacious: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
});

// `CSSProperties` has no index signature for custom properties, so the row's
// inline style — which publishes the computed indent distance as the private
// `--_tree-indent` — needs this augmentation to typecheck.
type IndentStyle = React.CSSProperties & Record<'--_tree-indent', string>;

// =============================================================================
// Types
// =============================================================================

export interface TreeListItemInternalProps {
  id: string;
  label: React.ReactNode;
  description?: string;
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  target?: string;
  isDisabled?: boolean;
  isSelected?: boolean;
  /** Consumer styles for the row element. See `TreeListItemData`. */
  xstyle?: stylex.StyleXStyles;
  className?: string;
  style?: React.CSSProperties;
  hasChildren: boolean;
  /**
   * Whether the tree contains at least one expandable item anywhere (i.e. a
   * caret exists somewhere to align labels under). A leaf reserves the chevron
   * column — the extra offset that lines its label up past an expandable
   * ancestor/sibling's caret — whenever this is true, so it stays indented
   * beyond its parent's label. Only a fully flat tree (no expandable items at
   * all) has no caret to align under, so its rows sit flush (no chevron-column
   * offset). Computed once for the whole tree by TreeList.
   */
  hasExpandableItems: boolean;
  nestedLevel: number;
  isLast: boolean;
  ancestorsIsLast: ReadonlyArray<boolean>;
  isExpanded: boolean;
  /**
   * The row collapsed and its child group is playing its exit: the group
   * stays rendered (the exit makes it inert) until it ends, and its rows
   * leave the tree's keyboard order at once.
   */
  isExiting?: boolean;
  onToggle?: (id: string) => void;
  density: TreeListDensity;
  /**
   * Guide-line visual treatment. `noGuides` suppresses the connector lines;
   * indentation is unaffected (it lives on the row's `marginLeft`, not the
   * guide element).
   */
  variant: TreeListVariant;
  /** Pre-rendered children subtree (rendered by the parent recursion) */
  renderedChildren?: ReactNode;
  /** 1-based position of this item among its siblings (aria-posinset). */
  posInSet: number;
  /** Number of siblings at this level (aria-setsize). */
  setSize: number;
  /**
   * Whether this treeitem is the initial roving-tabindex seed. Exactly one
   * treeitem is seeded tabbable at mount; useTreeFocus (hasRovingTabIndex)
   * then owns the tab stop dynamically.
   */
  isTabbable: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function TreeListItem({
  id,
  label,
  description,
  startContent,
  endContent,
  xstyle,
  className,
  style,
  onClick,
  href,
  target,
  isDisabled = false,
  isSelected = false,
  hasChildren,
  hasExpandableItems,
  nestedLevel,
  isLast,
  ancestorsIsLast,
  isExpanded,
  isExiting = false,
  onToggle,
  density,
  variant,
  renderedChildren,
  posInSet,
  setSize,
  isTabbable,
}: TreeListItemInternalProps) {
  const pressable = usePressFeedback();
  const t = useTranslator();
  const labelId = useId();
  const descriptionId = useId();
  const LinkComponent = useLinkComponent();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const isInteractive = onClick != null || href != null;

  const handleToggle = useMemo(
    () =>
      hasChildren && onToggle != null
        ? (e: React.MouseEvent) => {
            e.stopPropagation();
            onToggle(id);
          }
        : undefined,
    [hasChildren, onToggle, id],
  );

  const handleClick = useMemo(() => {
    if (onClick != null || (hasChildren && onToggle != null)) {
      return (e: React.MouseEvent) => {
        if (isDisabled) {
          return;
        }
        // Controls inside the row, native or role-based, keep their own
        // activation (FR7): the same rule link rows get from the shared
        // enlarged-surface hook below.
        if (hasInteractiveAncestor(e.target as Element, e.currentTarget)) {
          return;
        }
        if (onClick != null) {
          onClick(e);
        } else if (hasChildren && onToggle != null) {
          onToggle(id);
        }
      };
    }
    return undefined;
  }, [onClick, hasChildren, onToggle, id, isDisabled]);

  // A link row (an `href` and no other row action) is an enlarged surface for
  // its link: the indent is part of the row, so a click anywhere in it must
  // follow the link, as Enter already does. Built on the shared
  // enlarged-surface hook (family:navigation-destinations), which skips
  // clicks on nested controls, native or role-based, and text selections.
  // - Clicks are delegated: the hook re-dispatches the click on the anchor
  //   with its modifier keys, so the link component and the browser handle
  //   same-tab, new-tab and new-window activation, and stops the original, so
  //   ancestors see one click per press.
  // - Middle-click has no synthetic equivalent, so it takes the hook's href
  //   path, which opens the destination in a new tab after the shared
  //   navigation rule.
  // The container ref is attached to link rows only, so every other row stays
  // a plain element and both hook instances stay inert on it.
  const forwardsToLink = href != null && handleClick == null;
  const linkRowRef = useRef<HTMLDivElement>(null);
  const {onClick: delegateToLink} = useClickableContainer({
    containerRef: linkRowRef,
    interactiveRef: linkRef,
    disabled: isDisabled || !forwardsToLink,
  });
  const {onMouseUp: openLinkOnMiddleClick} = useClickableContainer({
    containerRef: linkRowRef,
    href,
    target,
    disabled: isDisabled || !forwardsToLink,
  });

  // Per-level indent distance. The per-level step is the public, themeable
  // `--tree-list-indent` lever (default `--spacing-4`, set on the tree-list
  // root). A leaf adds a fixed chevron-column offset (chevron width + gap) so
  // its label lines up past an expandable ancestor/sibling's caret — but ONLY
  // when the tree actually contains an expandable item somewhere. In a fully
  // flat tree there is no caret to align under, so the offset is pointless and
  // every row sits flush, like a parent at that level. That offset is tied to
  // the chevron's own dimensions, not the indent step, so it does not scale
  // with the lever. Published as the private `--_tree-indent` and consumed by
  // `indentedContent`'s stylesheet `padding-inline-start`; the step stays
  // themeable through `--tree-list-indent` (see #4308).
  const reservesChevronColumn = !hasChildren && hasExpandableItems;
  const indentDistance = reservesChevronColumn
    ? `calc(${nestedLevel} * var(--tree-list-indent) + ${spacingVars['--spacing-4']} + ${spacingVars['--spacing-2']})`
    : `calc(${nestedLevel} * var(--tree-list-indent))`;
  const indentStyle: IndentStyle = {'--_tree-indent': indentDistance};

  const labelAndDescription = (
    <>
      <span
        id={labelId}
        {...mergeProps(
          // Stable theme target for the item's label text. The label carries no
          // themeable handle today, so a theme can only reach it through a
          // fragile structural selector (a content button's first span). This
          // adds an `astryx-tree-list-item-label` class and reflects the row's
          // `selected` state so a theme can, e.g., bold just the selected
          // item's label via `defineTheme`.
          themeProps('tree-list-item-label', {
            selected: isSelected ? 'selected' : null,
          }),
          stylex.props(styles.label),
        )}>
        {label}
      </span>
      {description != null && (
        <span
          id={descriptionId}
          {...stylex.props(styles.description, descriptionSizeStyles[density])}>
          {description}
        </span>
      )}
    </>
  );

  // <Icon> renders the glyph's span itself — carrying the pre-existing
  // astryx-icon target — so the rotation rides on that same element instead of
  // an extra wrapper: a theme can still restyle the mark and its open/closed
  // transform through one selector.
  const chevronIcon = (
    <Icon
      icon="chevronRight"
      // Nearest size to the 16px chevron column; `chevronSvg` re-pins the exact
      // box because the column is spacing-token-sized, not rem-sized.
      size="sm"
      // The button/container owns the chevron color (--color-icon-secondary);
      // inheriting keeps that as the single source.
      color="inherit"
      xstyle={[
        styles.chevronSvg,
        isExpanded ? styles.chevronExpanded : styles.chevronCollapsed,
      ]}
    />
  );

  const chevron = hasChildren ? (
    handleToggle != null ? (
      // Real toggle button whenever expand/collapse is supported, so the row
      // can be expanded from the keyboard even when the item has no onClick/href
      // (row-level onClick is the only click path in that case, but there is no
      // focusable element to receive Enter/Space). The row's handleClick ignores
      // clicks originating inside a <button>, so this never double-toggles.
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={t('@astryx.treeList.toggleChildren')}
        // Stable identity for TreeList's activateItem selector — do not
        // remove without also updating TreeList.tsx.
        data-tree-toggle=""
        // Disabled stays focusable (spec:AST-085 FR1) but inert (FR2).
        aria-disabled={isDisabled || undefined}
        // Roving tabindex lives on the treeitem row; the chevron toggle is not
        // a separate tab stop. Row-level Enter/Space forwards to this button.
        tabIndex={-1}
        onClick={handleToggle}
        {...(isDisabled ? disabledInteractionProps() : null)}
        {...mergeProps(
          // Stable theme target for the expand/collapse control. `data-tree-toggle`
          // stays as the functional activation hook; this adds a themeable
          // `astryx-tree-list-chevron` class and reflects the open/closed state so
          // a theme can restyle the toggle (and each state) without a fragile
          // `[data-tree-toggle]` selector.
          themeProps('tree-list-chevron', {
            state: isExpanded ? 'expanded' : 'collapsed',
          }),
          stylex.props(styles.chevronButton),
        )}>
        {chevronIcon}
      </button>
    ) : (
      // Non-interactive chevron only when toggling is not wired up at all
      <span
        {...mergeProps(
          themeProps('tree-list-chevron', {
            state: isExpanded ? 'expanded' : 'collapsed',
          }),
          stylex.props(styles.chevronContainer),
        )}>
        {chevronIcon}
      </span>
    )
  ) : null;

  const innerContent = (
    <>
      {chevron}
      {startContent != null && (
        <span {...stylex.props(styles.startContent)}>{startContent}</span>
      )}
      {href != null ? (
        <LinkComponent
          ref={linkRef}
          href={href}
          target={target}
          aria-disabled={isDisabled || undefined}
          aria-labelledby={labelId}
          aria-describedby={description != null ? descriptionId : undefined}
          // Roving tabindex lives on the treeitem row; inner action is not a
          // separate tab stop. Activation is forwarded from the row.
          tabIndex={-1}
          {...stylex.props(styles.invisibleAnchor)}>
          {labelAndDescription}
        </LinkComponent>
      ) : onClick != null ? (
        <button
          type="button"
          onClick={onClick}
          aria-disabled={isDisabled || undefined}
          {...(isDisabled ? disabledInteractionProps() : null)}
          aria-labelledby={labelId}
          aria-describedby={description != null ? descriptionId : undefined}
          // Roving tabindex lives on the treeitem row; inner action is not a
          // separate tab stop. Activation is forwarded from the row.
          tabIndex={-1}
          {...stylex.props(styles.invisibleButton)}>
          {labelAndDescription}
        </button>
      ) : (
        <span {...stylex.props(styles.content)}>{labelAndDescription}</span>
      )}
      {endContent != null && (
        <span {...stylex.props(styles.endContent)}>{endContent}</span>
      )}
    </>
  );

  return (
    <li
      role="treeitem"
      // The row is named by its label alone and described by its description
      // (APG tree view): without these the name would be the row's whole text,
      // chevron button label and description included.
      aria-labelledby={labelId}
      aria-describedby={description != null ? descriptionId : undefined}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected || undefined}
      aria-disabled={isDisabled || undefined}
      aria-level={nestedLevel + 1}
      aria-posinset={posInSet}
      aria-setsize={setSize}
      // Roving tabindex: exactly one visible treeitem is tabbable at a time.
      // Disabled items are skipped by the tree keyboard handler but remain
      // in the accessibility tree.
      tabIndex={isDisabled ? -1 : isTabbable ? 0 : -1}
      data-tree-id={id}
      data-tree-level={nestedLevel + 1}
      data-tree-disabled={isDisabled || undefined}
      {...focusOutlineProps.publishFocusVisibleVars(styles.wrapper)}>
      {variant !== 'noGuides' && (
        <div {...stylex.props(styles.treeBranches)}>
          <TreeListBranches
            ancestorsIsLast={ancestorsIsLast}
            isLast={isLast}
            nestedLevel={nestedLevel}
          />
        </div>
      )}
      <div {...stylex.props(styles.rowWrapper)}>
        <div
          {...(isInteractive || (hasChildren && onClick == null)
            ? pressable
            : undefined)}
          {...mergeProps(
            themeProps('tree-list-item', {
              density,
              selected: isSelected ? 'selected' : null,
              disabled: isDisabled ? 'disabled' : null,
            }),
            isInteractive || (hasChildren && onClick == null)
              ? focusOutlineProps.focusWithinOrPublished(
                  styles.contentWrapper,
                  styles.focusLift,
                  densityStyles[density],
                  styles.interactive,
                  interactionOverlayStyles.backgroundImage,
                  isDisabled && styles.disabled,
                  isSelected && styles.selected,
                  xstyle,
                )
              : stylex.props(
                  styles.contentWrapper,
                  densityStyles[density],
                  isDisabled && styles.disabled,
                  isSelected && styles.selected,
                  xstyle,
                ),
            // Consumer row props are merged last so useContainerReveal can
            // publish both its classes and inline custom properties. Seed the
            // private indent first, then preserve the standard inline-style
            // precedence promised by the TreeList contract.
            className,
            {...indentStyle, ...style},
          )}
          ref={forwardsToLink ? linkRowRef : undefined}
          onClick={forwardsToLink ? delegateToLink : handleClick}
          onMouseUp={forwardsToLink ? openLinkOnMiddleClick : undefined}>
          <div {...stylex.props(styles.indentedContent)}>{innerContent}</div>
        </div>
      </div>
      {(isExpanded || isExiting) && renderedChildren != null && (
        <ul
          role="group"
          data-tree-exiting={isExiting ? '' : undefined}
          {...stylex.props(styles.childGroup)}>
          {renderedChildren}
        </ul>
      )}
    </li>
  );
}

TreeListItem.displayName = 'TreeListItem';
