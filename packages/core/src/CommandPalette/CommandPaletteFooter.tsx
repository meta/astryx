// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPaletteFooter.tsx
 * @input Uses React, StyleX, Kbd
 * @output Exports CommandPaletteFooter component
 * @position Sub-component; footer with keyboard hints
 *
 * SYNC: When modified, update:
 * - /packages/cli/assets/templates/blocks/components/CommandPalette/ (showcase blocks)
 */

'use client';

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {Kbd} from '../Kbd';
import {themeProps} from '../utils/themeProps';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/CommandPalette/CommandPaletteFooter.generated';

registerEnglishFallback(english);

const styles = stylex.create({
  footer: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacingVars['--spacing-4'],
    paddingInline: spacingVars['--spacing-4'],
    paddingBlock: spacingVars['--spacing-2'],
    flexShrink: 0,
    // Inherit font so custom children match hint text treatment
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
});

export interface CommandPaletteFooterProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the footer element. */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Footer content. When provided, renders custom content instead of default hints.
   * Custom children inherit the footer font treatment (supporting/12px, secondary color).
   * When omitted, renders default keyboard navigation hints using Kbd.
   */
  children?: ReactNode;
}

/**
 * Footer for the command palette showing keyboard navigation hints.
 *
 * When no children are provided, renders default hints using Kbd
 * for arrow keys, Enter to select, and Escape to close.
 *
 * @compositionHint Pass to CommandPalette's `footer` slot.
 *
 * @example
 * ```
 * <CommandPalette
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   searchSource={source}
 *   footer={
 *     <CommandPaletteFooter>
 *       Type to filter available commands.
 *     </CommandPaletteFooter>
 *   }
 * />
 * ```
 */
export function CommandPaletteFooter({
  children,
  ref,
  xstyle,
  className,
  style,
  ...props
}: CommandPaletteFooterProps) {
  const t = useComponentTranslator();

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('command-palette-footer'),
        stylex.props(styles.footer, xstyle),
        className,
        style,
      )}
      {...props}>
      {children ?? (
        <>
          <span {...stylex.props(styles.hint)}>
            <Kbd keys="up" />
            <Kbd keys="down" />
            {t('@astryx.commandPalette.footer.navigate')}
          </span>
          <span {...stylex.props(styles.hint)}>
            <Kbd keys="enter" />
            {t('@astryx.commandPalette.footer.select')}
          </span>
          <span {...stylex.props(styles.hint)}>
            <Kbd keys="escape" />
            {t('@astryx.commandPalette.footer.close')}
          </span>
        </>
      )}
    </div>
  );
}

CommandPaletteFooter.displayName = 'CommandPaletteFooter';
