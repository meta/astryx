// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteList.tsx
 * @input Uses React, StyleX, CommandPaletteContext
 * @output Exports CommandPaletteList component
 * @position Sub-component; scrollable results container
 *
 * SYNC: When modified, update:
 * - /packages/core/src/CommandPalette/index.ts
 * - /packages/cli/assets/templates/blocks/components/CommandPalette/ (showcase blocks)
 */

'use client';

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {spacingVars} from '../theme/tokens.stylex';
import {useCommandPaletteContext} from './CommandPaletteContext';
import {themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/CommandPalette/CommandPaletteList.generated';

registerEnglishFallback(english);

const styles = stylex.create({
  list: {
    overflowY: 'auto',
    maxHeight: '100%',
    padding: spacingVars['--spacing-1'],
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
  },
});

export interface CommandPaletteListProps extends BaseProps<HTMLDivElement> {
  /**
   * Ref forwarded to the root element.
   */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Command palette items, groups, empty states, etc.
   */
  children: ReactNode;

  /**
   * Accessible label for the listbox.
   * @default 'Commands'
   */
  label?: string;
}

/**
 * Scrollable results container for the command palette. Standalone composition
 * renders as a listbox. Inside CommandPalette, listbox semantics are present
 * only while selectable results exist; empty and pending states retain the same
 * styled container without exposing an empty interactive popup.
 *
 * When used inside CommandPalette, automatically gets the correct
 * ID for aria-controls linking with the input.
 *
 * @compositionHint CommandPalette renders its own list after its input; render
 *   this list directly only for a standalone results list. Contains
 *   CommandPaletteItem and CommandPaletteGroup children.
 *
 * @example
 * ```
 * <CommandPaletteList>
 *   <CommandPaletteItem value="home" onSelect={goHome}>
 *     Go Home
 *   </CommandPaletteItem>
 * </CommandPaletteList>
 * ```
 */
export function CommandPaletteList({
  children,
  label: labelFromProps,
  ref,
  xstyle,
  className,
  style,
  ...props
}: CommandPaletteListProps) {
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.commandPalette.list.label');
  const ctx = useCommandPaletteContext();
  // Inside CommandPalette the list is a listbox only while it holds selectable
  // results; standalone composition is always a listbox.
  const hasListbox = ctx ? ctx.selectableItems.length > 0 : true;

  return (
    <div
      ref={ref}
      {...props}
      id={ctx?.listId ?? props.id}
      role={hasListbox ? 'listbox' : undefined}
      aria-label={hasListbox ? label : undefined}
      {...mergeProps(
        themeProps('command-palette-list'),
        stylex.props(styles.list, xstyle),
        className,
        style,
      )}>
      {children}
    </div>
  );
}

CommandPaletteList.displayName = 'CommandPaletteList';
