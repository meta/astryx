// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatPastedTextToken.tsx
 * @input Uses React, StyleX, Badge, HoverCard, Button, provider-bound translator
 * @output Exports ChatPastedTextToken component
 * @position Inline token for pasted text with hover card preview + expand
 *
 * Hover: card with truncated text preview and "Expand" button.
 * Expand replaces the token with the full text in the contentEditable.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/index.ts (exports)
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {Badge} from '../Badge';
import {Button} from '../Button';
import {HoverCard} from '../HoverCard';
import {useTranslator, type TranslatorFn} from '../i18n';

// =============================================================================
// Types
// =============================================================================

export interface ChatPastedTextTokenProps {
  /** The full pasted text. */
  text: string;
  /** Called when the user clicks Expand — dissolves the token into editable text. */
  onExpand?: () => void;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    maxWidth: '480px',
  },
  previewText: {
    fontFamily: typographyVars['--font-family-code'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-primary'],
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '240px',
    overflowY: 'auto',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
  },
  meta: {
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
  },
});

// =============================================================================
// Helpers
// =============================================================================

function formatLabel(text: string, t: TranslatorFn): string {
  return t('@astryx.chat.pastedText.label', {
    lines: text.split('\n').length,
    chars: text.length,
  });
}

// =============================================================================
// Component
// =============================================================================

export function ChatPastedTextToken({
  text,
  onExpand,
}: ChatPastedTextTokenProps) {
  const t = useTranslator();
  const label = formatLabel(text, t);

  const cardContent = (
    <div {...stylex.props(styles.preview)}>
      <div {...stylex.props(styles.previewText)}>{text}</div>
      <div {...stylex.props(styles.footer)}>
        <span {...stylex.props(styles.meta)}>{label}</span>
        {onExpand && (
          <Button
            label={t('@astryx.chat.pastedText.expand')}
            variant="ghost"
            size="sm"
            onClick={onExpand}
          />
        )}
      </div>
    </div>
  );

  return (
    <HoverCard
      content={cardContent}
      placement="above"
      alignment="start"
      hasHoverIndication={false}>
      <Badge label={label} variant="neutral" />
    </HoverCard>
  );
}

ChatPastedTextToken.displayName = 'ChatPastedTextToken';
