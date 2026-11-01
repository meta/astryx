// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LoadingMessage.tsx
 * @input A loading message, a Spinner size
 * @output LoadingMessage: a silent Spinner ring above readable loading words
 * @position Shared by Lab owners that announce their own busy start: the ring
 *   is hidden from assistive technology, as a composed indicator is silent
 *   (`spec:AST-086` FR8), and the words stay readable (FR7), laid out as
 *   Spinner's own labelled wrapper is (an inline column, centred, with
 *   `--spacing-2` between)
 */

import * as stylex from '@stylexjs/stylex';
import {Spinner, type SpinnerSize} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  column: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
});

export function LoadingMessage({
  label,
  size = 'md',
}: {
  label: string;
  size?: SpinnerSize;
}) {
  return (
    <span {...stylex.props(styles.column)}>
      <Spinner size={size} aria-hidden />
      <Text type="body" weight="bold">
        {label}
      </Text>
    </span>
  );
}
