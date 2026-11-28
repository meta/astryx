// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ByokCard.stylex.ts
 * @input Uses StyleX and theme design tokens
 * @output Exports StyleX styles for ByokCard
 * @position Styles for the ByokCard component
 */

import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  fontWeightVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';

export const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minWidth: 0,
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-3'],
  },
  providerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
    minWidth: 0,
  },
  logoSlot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: spacingVars['--spacing-8'],
    height: spacingVars['--spacing-8'],
    flexShrink: 0,
    color: colorVars['--color-text-primary'],
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: spacingVars['--spacing-0-5'],
  },
  name: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
    fontSize: textSizeVars['--font-size-base'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: {
    fontSize: textSizeVars['--font-size-sm'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1-5'],
    flexShrink: 0,
  },
  statusText: {
    fontSize: textSizeVars['--font-size-sm'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
  },
  statusConnectedText: {
    color: colorVars['--color-text-success'],
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacingVars['--spacing-2'],
    marginTop: spacingVars['--spacing-4'],
    paddingTop: spacingVars['--spacing-3'],
    borderTopWidth: borderVars['--border-width'],
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    justifyContent: 'flex-end',
  },
});
