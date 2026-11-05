// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Tab.tsx
 * @input Uses React, StyleX, TabListContext
 * @output Exports Tab component and TabProps type
 * @position Core tab item; renders as button or anchor in navigation with a
 *   divider-overlay selected indicator. Where the TabList speaks the tabs
 *   pattern it is a button with role="tab".
 *
 * SYNC: When modified, update:
 * - /packages/core/src/TabList/TabList.doc.mjs
 * - /packages/core/src/TabList/index.ts
 * - /packages/core/src/TabList/TabList.test.tsx
 * - /packages/cli/assets/templates/blocks/components/TabList/ (showcase blocks)
 *
 * MOTION LAB FORK — see ./index.ts. The one change here is
 * `indicatorSuppressed`: when the strip owns a travelling indicator, this tab
 * keeps its own in the tree but hidden. Marked PROPOSED.
 */

import React, {useCallback, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  sizeVars,
  radiusVars,
  durationVars,
  easeVars,
  fontWeightVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import type {BaseProps} from '@astryxdesign/core/BaseProps';
import {useTabListContext} from './TabListContext';
import type {TabListSize} from './TabListContext';
import {tabScope} from './tab.markers.stylex';
import {useLinkComponent} from '@astryxdesign/core/Link';
import type {LinkComponentType} from '@astryxdesign/core/Link';
import {mergeProps} from '@astryxdesign/core/utils';
import {useDevWarning} from '@astryxdesign/core/hooks';
import {EDGE_COMP_ATTR} from '@astryxdesign/core/Layout';
import {themeProps} from '@astryxdesign/core/utils';
import {focusOutlineProps} from '@astryxdesign/core/utils';

export interface TabProps extends BaseProps<HTMLButtonElement> {
  /**
   * Custom component to render instead of `<a>` for link tabs.
   * Overrides the provider-level default set by LinkProvider.
   * Only applies when `href` is provided. Must accept href, className, style, and children props.
   */
  as?: LinkComponentType;
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Unique value for this tab. Matched against TabListContext.value.
   */
  value: string;
  /**
   * Accessible label for this tab. Used as visible text by default, or
   * as aria-label when isLabelHidden is true.
   */
  label: string;
  /**
   * Whether the label is visually hidden. When true, only the icon and
   * endContent are displayed, and label is used as aria-label for accessibility.
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * URL to navigate to. When provided, renders as an anchor element.
   *
   * Ignored in a TabList given an explicit `role="tablist"`: activating a tab
   * there swaps a panel in place, so a tab that navigates would be a false
   * statement.
   */
  href?: string;
  /**
   * Id of the panel this tab controls, wired up as `aria-controls` where the
   * TabList speaks the tabs pattern. Put the same id on the panel element.
   *
   * Has no effect under the navigation pattern, where there is no panel to
   * associate — a development warning says so.
   */
  panelId?: string;
  /**
   * Icon element shown when tab is not selected.
   */
  icon?: ReactNode;
  /**
   * Icon element shown when tab is selected. Falls back to `icon` if not provided.
   */
  selectedIcon?: ReactNode;
  /**
   * Content rendered after the label (e.g. a badge or status dot).
   */
  endContent?: ReactNode;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  base: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transitionProperty: 'color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  hoverBg: {
    position: 'absolute',
    inset: 0,
    margin: 'auto',
    width: '100%',
    borderRadius: radiusVars['--radius-element'],
    pointerEvents: 'none',
    backgroundColor: {
      default: 'transparent',
      [stylex.when.ancestor(':hover', tabScope)]: {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  selected: {
    color: colorVars['--color-text-primary'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  indicator: {
    position: 'absolute',
    // Sits on the tab's bottom edge by default (-1px). When the tab strip
    // reserves space for a divider rail — TabList `hasDivider` or a Toolbar
    // with a bottom divider — that ancestor sets `--_tab-indicator-bottom`
    // to drop the indicator onto the rail beneath the reserved gap.
    bottom: 'var(--_tab-indicator-bottom, -1px)',
    insetInlineStart: spacingVars['--spacing-3'],
    insetInlineEnd: spacingVars['--spacing-3'],
    height: '2px',
    borderRadius: radiusVars['--radius-full'],
    pointerEvents: 'none',
    transitionProperty: 'opacity, background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  indicatorSelected: {
    backgroundColor: colorVars['--color-accent'],
    opacity: 1,
  },
  indicatorUnselected: {
    backgroundColor: 'transparent',
    opacity: 0,
  },
  /**
   * PROPOSED — not in core.
   *
   * When the strip owns a single travelling indicator, this tab must not draw
   * its own or the two stack: two bars on the selected tab, one of them
   * cross-fading while the other slides in.
   *
   * `display: 'none'` rather than unmounting the element. The indicator is
   * absolutely positioned, so hiding it costs no layout — but keeping the node
   * in the tree keeps the DOM shape identical between the two panes of the
   * comparison, which is the point: the only difference a reviewer sees is the
   * motion, not a different tree.
   */
  indicatorSuppressed: {
    display: 'none',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labelContainer: {
    display: 'inline-grid',
  },
  labelText: {
    gridRowStart: 1,
    gridColumnStart: 1,
  },
  labelSizer: {
    gridRowStart: 1,
    gridColumnStart: 1,
    visibility: 'hidden',
    pointerEvents: 'none',
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  endContentWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
});

const sizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm']},
  md: {height: sizeVars['--size-element-md']},
  lg: {height: sizeVars['--size-element-lg']},
});

// Hover bg uses the standard element size (one step smaller than tab)
const hoverSizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm']},
  md: {height: sizeVars['--size-element-md']},
  lg: {height: sizeVars['--size-element-lg']},
});

const layoutStyles = stylex.create({
  fill: {
    flex: 1,
    justifyContent: 'center',
  },
});

const iconSizeStyles = stylex.create({
  sm: {width: '14px', height: '14px'},
  md: {width: '16px', height: '16px'},
  lg: {width: '18px', height: '18px'},
});

/**
 * Tab item component. Renders as an anchor when `href` is provided,
 * otherwise as a button.
 *
 * @example
 * ```
 * <TabList value={tab} onChange={setTab}>
 *   <Tab value="general" label="General" />
 *   <Tab value="advanced" label="Advanced" />
 * </TabList>
 * ```
 */
export function Tab({
  as,
  ref,
  value,
  label,
  isLabelHidden = false,
  href,
  panelId,
  icon,
  selectedIcon,
  endContent,
  xstyle,
  className,
  style,
  ...restProps
}: TabProps) {
  const tabListCtx = useTabListContext();
  const LinkComponent = useLinkComponent(as);

  const isSelected = tabListCtx.value === value;
  const size: TabListSize = tabListCtx.size;
  const isFill = tabListCtx.layout === 'fill';
  const isTabsPattern = tabListCtx.pattern === 'tabs';
  // PROPOSED — not in core. The strip sets this when it draws the single
  // travelling indicator; this tab then keeps its own indicator in the tree
  // but hidden, so exactly one bar is painted.
  const hasTravellingIndicator = tabListCtx.hasTravellingIndicator === true;
  const isLink = href != null && !isTabsPattern;
  const isTabRole = isTabsPattern && !isLink;
  const displayIcon = isSelected && selectedIcon ? selectedIcon : icon;
  const hasVisibleLabel = !isLabelHidden && label !== '';

  const handleSelect = useCallback(() => {
    tabListCtx.onChange(value);
  }, [tabListCtx, value]);

  useDevWarning(
    'Tab',
    'href is ignored in a role="tablist" TabList — a tab swaps a panel in ' +
      'place rather than navigating. Drop the href, or drop the role for the ' +
      'navigation pattern.',
    isTabRole && href != null,
  );

  // A consumer who wired aria-controls by hand already said which panel this
  // is, so panelId is the sugar, not the only way in.
  const controls = panelId ?? restProps['aria-controls'];

  useDevWarning(
    'Tab',
    'a tab in a role="tablist" TabList controls nothing: pass panelId with ' +
      'the id of the panel it opens, so assistive technology can associate ' +
      'the two.',
    isTabRole && controls == null,
  );

  useDevWarning(
    'Tab',
    'panelId does nothing outside a role="tablist" TabList — the navigation ' +
      'pattern has no panel to associate. Give the TabList role="tablist", ' +
      'or drop the panelId.',
    !isTabsPattern && panelId != null,
  );

  const iconElement = displayIcon ? (
    <span {...stylex.props(styles.icon, iconSizeStyles[size])}>
      {displayIcon}
    </span>
  ) : null;

  const sharedProps = {
    ...restProps,
    ...(isLabelHidden ? {'aria-label': label} : {}),
    [EDGE_COMP_ATTR]: '',
    'data-tab-value': value,
    ...(isTabRole
      ? {
          role: 'tab' as const,
          'aria-selected': isSelected,
          // Only when there is a panel to point at: an aria-controls whose
          // target does not exist is an invalid attribute value, which is a
          // worse state than saying nothing. The dev warning above asks for
          // the id instead.
          'aria-controls': controls,
        }
      : {
          // Generic `true` ("the current item within a set"), not `page`: the
          // strip switches views in place at least as often as it navigates,
          // and claiming "current page" when no page changed is a false
          // statement to a screen reader. Stays truthful for the `href` case
          // too, just less specific. A tab role states this with
          // aria-selected instead.
          'aria-current': isSelected ? ('true' as const) : undefined,
        }),
    // Roving tabindex: the tab strip is a single Tab stop. The selected tab is
    // the tabbable one; the rest are reachable via arrow keys (handled by
    // TabList's onKeyDown). When no tab is selected, TabList's repair effect
    // makes the first stop tabbable.
    tabIndex: isSelected ? 0 : -1,
    ...mergeProps(
      themeProps('tab', {
        selected: isSelected ? 'selected' : null,
      }),
      focusOutlineProps.focusVisible(
        styles.base,
        sizeStyles[size],
        isSelected && styles.selected,
        isFill && layoutStyles.fill,
        tabScope,
        xstyle,
      ),
      className,
      style,
    ),
  };

  const hoverBgElement = (
    <span
      aria-hidden="true"
      {...stylex.props(styles.hoverBg, hoverSizeStyles[size])}
    />
  );

  const indicatorElement = (
    <span
      {...mergeProps(
        themeProps('tab-indicator', {
          selected: isSelected ? 'selected' : null,
        }),
        stylex.props(
          styles.indicator,
          isSelected ? styles.indicatorSelected : styles.indicatorUnselected,
          // PROPOSED — not in core. Last in the list so it wins: the strip's
          // travelling indicator is the only bar painted.
          hasTravellingIndicator && styles.indicatorSuppressed,
        ),
      )}
    />
  );

  const labelElement = hasVisibleLabel ? (
    <span {...stylex.props(styles.labelContainer)}>
      <span {...stylex.props(styles.labelText)}>{label}</span>
      <span aria-hidden="true" {...stylex.props(styles.labelSizer)}>
        {label}
      </span>
    </span>
  ) : null;

  const endContentElement = endContent ? (
    <span {...stylex.props(styles.endContentWrapper)}>{endContent}</span>
  ) : null;

  if (isLink) {
    return (
      <LinkComponent
        ref={ref}
        href={href}
        onClick={handleSelect}
        {...sharedProps}>
        {hoverBgElement}
        {iconElement}
        {labelElement}
        {endContentElement}
        {indicatorElement}
      </LinkComponent>
    );
  }

  return (
    <button ref={ref} type="button" onClick={handleSelect} {...sharedProps}>
      {hoverBgElement}
      {iconElement}
      {labelElement}
      {endContentElement}
      {indicatorElement}
    </button>
  );
}

Tab.displayName = 'Tab';
