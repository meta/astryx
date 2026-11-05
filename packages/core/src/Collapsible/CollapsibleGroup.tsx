// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CollapsibleGroup.tsx
 * @input Uses React useState, useCallback, CollapsibleGroupContext, StyleX, theme tokens
 * @output Exports CollapsibleGroup component and CollapsibleGroupProps
 * @position Core collapsible group coordination provider — renders no wrapper
 *   DOM unless `hasDividers` is set
 *
 * CollapsibleGroup groups collapsible components (Card, etc.) with
 * coordinated open/close behavior. By default it renders only `{children}` —
 * no wrapper DOM element. When `hasDividers` is set it renders a wrapper div
 * that anchors reliable :first-child divider suppression and provides
 * hasDividers/density to items via CollapsibleGroupPresentationContext — each
 * Collapsible draws its own borders since StyleX has no child selectors.
 *
 * In "single" mode (default), only one item can be open at a time.
 * In "multiple" mode, any number of items can be open simultaneously.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Collapsible/CollapsibleGroupContext.tsx (context type)
 * - /packages/core/src/Collapsible/Collapsible.doc.mjs
 * - /packages/core/src/Collapsible/index.ts (exports)
 * - /apps/storybook/stories/Collapsible.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Collapsible/ (showcase blocks)
 */

import React, {useCallback, useMemo, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  CollapsibleGroupContext,
  CollapsibleGroupPresentationContext,
} from './CollapsibleGroupContext';
import type {
  CollapsibleChevronPosition,
  CollapsibleGroupContextValue,
  CollapsibleGroupDensity,
  CollapsibleGroupPresentationValue,
} from './CollapsibleGroupContext';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import type {BaseProps} from '../BaseProps';

const styles = stylex.create({
  // The wrapper lays items out in a column; between-item hairlines are drawn
  // by each Collapsible (borderBlockStart, suppressed on :first-child).
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
  },
});

export interface CollapsibleGroupProps extends Omit<
  BaseProps<HTMLElement>,
  'onChange'
> {
  ref?: React.Ref<HTMLElement>;
  /**
   * Whether only one item can be open at a time, or multiple.
   * @default "single"
   */
  type?: 'single' | 'multiple';

  /**
   * Default open item(s) — uncontrolled mode.
   * Use a string for single mode, string[] for multiple mode.
   */
  defaultValue?: string | string[];

  /**
   * Controlled open item(s).
   * When provided, the group is fully controlled externally.
   */
  value?: string | string[];

  /**
   * Callback when the open item(s) change.
   */
  onChange?: (value: string | string[]) => void;

  /**
   * Whether to draw hairline dividers between the group's items — the
   * accordion row chrome. When set, the group renders a wrapper div (it
   * otherwise renders no DOM) and items get 'balanced' density unless
   * `density` says otherwise. Pair with bare Collapsible children; Card-wrapped
   * items provide their own separation.
   * @default false
   */
  hasDividers?: boolean;

  /**
   * Row density controlling trigger and content block padding on the group's
   * items. Defaults to 'balanced' when dividers are shown; otherwise items
   * keep their default unpadded look.
   */
  density?: CollapsibleGroupDensity;

  /**
   * Logical position of the items' disclosure chevrons. Set this on the group
   * when its direct items should share one position; an individual Collapsible
   * can still override it.
   * @default 'end'
   */
  chevronPosition?: CollapsibleChevronPosition;

  /**
   * Children — any components that support isCollapsible + value.
   *
   * @compositionHint Wrap Collapsible instances (typically inside Card).
   * Each Collapsible needs a `value` prop to participate in the group.
   *
   * @example
   * ```
   * <CollapsibleGroup type="single" defaultValue="general">
   *   <VStack gap={2}>
   *     <Card>
   *       <Collapsible trigger="General" value="general">
   *         <p>General settings content</p>
   *       </Collapsible>
   *     </Card>
   *     <Card>
   *       <Collapsible trigger="Advanced" value="advanced">
   *         <p>Advanced settings content</p>
   *       </Collapsible>
   *     </Card>
   *   </VStack>
   * </CollapsibleGroup>
   * ```
   */
  children: ReactNode;
}

function normalizeToArray(value: string | string[] | undefined): string[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Groups collapsible components with coordinated open/close behavior.
 * Renders no wrapper DOM unless `hasDividers` is set.
 *
 * In "single" mode (default), opening one item closes the others.
 * In "multiple" mode, items toggle independently.
 *
 * @compositionHint Wrap Collapsible instances to coordinate their open/close state.
 * Each Collapsible needs a `value` prop to participate. For FAQ-style lists,
 * use `hasDividers` with bare Collapsible children instead of wrapping each
 * item in Card.
 *
 * @example
 * ```
 * <CollapsibleGroup type="single" hasDividers defaultValue="faq1">
 *   <Collapsible trigger="What is Astryx?" value="faq1">
 *     Astryx is a design system for building internal tools.
 *   </Collapsible>
 *   <Collapsible trigger="How do I start?" value="faq2">
 *     Install the package and import components.
 *   </Collapsible>
 * </CollapsibleGroup>
 * <CollapsibleGroup type="single" defaultValue="faq1">
 *   <VStack gap={2}>
 *     <Card>
 *       <Collapsible trigger="What is Astryx?" value="faq1">
 *         Astryx is a design system for building internal tools.
 *       </Collapsible>
 *     </Card>
 *     <Card>
 *       <Collapsible trigger="How do I start?" value="faq2">
 *         Install the package and import components.
 *       </Collapsible>
 *     </Card>
 *   </VStack>
 * </CollapsibleGroup>
 * ```
 */
export function CollapsibleGroup({
  type = 'single',
  defaultValue,
  value: controlledValue,
  onChange,
  hasDividers = false,
  density,
  chevronPosition,
  children,
  ref,
  xstyle,
  className,
  style,
  ...props
}: CollapsibleGroupProps) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string[]>(() =>
    normalizeToArray(defaultValue),
  );

  const openValues = useMemo(
    () => (isControlled ? normalizeToArray(controlledValue) : internalValue),
    [controlledValue, internalValue, isControlled],
  );

  const isOpen = useCallback(
    (itemValue: string) => openValues.includes(itemValue),
    [openValues],
  );

  const toggle = useCallback(
    (itemValue: string) => {
      let nextValues: string[];

      if (type === 'single') {
        // In single mode, toggling an open item closes it; toggling a closed item opens it (and closes others)
        nextValues = openValues.includes(itemValue) ? [] : [itemValue];
      } else {
        // In multiple mode, toggle the item independently
        nextValues = openValues.includes(itemValue)
          ? openValues.filter(v => v !== itemValue)
          : [...openValues, itemValue];
      }

      if (!isControlled) {
        setInternalValue(nextValues);
      }

      if (onChange) {
        // Return the value in the same shape as the type suggests
        if (type === 'single') {
          onChange(nextValues[0] ?? '');
        } else {
          onChange(nextValues);
        }
      }
    },
    [type, openValues, isControlled, onChange],
  );

  const contextValue = useMemo<CollapsibleGroupContextValue>(
    () => ({isOpen, toggle}),
    [isOpen, toggle],
  );

  const resolvedDensity = density ?? (hasDividers ? 'balanced' : null);

  const presentationValue = useMemo<CollapsibleGroupPresentationValue>(
    () => ({
      hasDividers,
      density: resolvedDensity,
      chevronPosition: chevronPosition ?? null,
    }),
    [hasDividers, resolvedDensity, chevronPosition],
  );

  // The wrapper anchors divider chrome: it makes the items' :first-child
  // suppression independent of surrounding siblings. Without dividers the
  // group stays DOM-less (documented contract), so ref/xstyle/className/style
  // only take effect in wrapper mode.
  const content = hasDividers ? (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      {...mergeProps(
        themeProps('collapsible-group', {
          density: resolvedDensity ?? undefined,
        }),
        stylex.props(styles.wrapper, xstyle),
        className,
        style,
      )}
      {...props}>
      {children}
    </div>
  ) : (
    children
  );

  return (
    <CollapsibleGroupContext value={contextValue}>
      <CollapsibleGroupPresentationContext value={presentationValue}>
        {content}
      </CollapsibleGroupPresentationContext>
    </CollapsibleGroupContext>
  );
}

CollapsibleGroup.displayName = 'CollapsibleGroup';
