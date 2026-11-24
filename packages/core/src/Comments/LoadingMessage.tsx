// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LoadingMessage.tsx
 * @input A loading message, a Spinner size
 * @output LoadingMessage: a silent Spinner ring above readable loading words
 * @position Internal to the Comments family, which announces its own busy
 *   start: the ring
 *   is hidden from assistive technology, since its owner announces, and the
 *   words stay readable, laid out as Spinner's own labelled wrapper is (an
 *   inline column, centred, with `--spacing-2` between)
 */

import * as stylex from '@stylexjs/stylex';
import {Spinner, type SpinnerSize} from '../Spinner/Spinner';
import {Text} from '../Text/Text';
import {spacingVars} from '../theme/tokens.stylex';

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
