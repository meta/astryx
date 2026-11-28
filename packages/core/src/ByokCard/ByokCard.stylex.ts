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
  radiusVars,
  shadowVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';

export const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    borderRadius: radiusVars['--radius-container'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-surface'],
    boxShadow: shadowVars['--shadow-elevation-low'],
    padding: spacingVars['--spacing-4'],
    minWidth: 0,
    width: '100%',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
    transitionTimingFunction: 'ease-in-out',
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
    color: colorVars['--color-text-default'],
  },
  textContainer: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: spacingVars['--spacing-0.5'],
  },
  name: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
    fontSize: textSizeVars['--font-size-base'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-default'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: {
    fontSize: textSizeVars['--font-size-sm'],
    lineHeight: typeScaleVars['--text-caption-leading'],
    color: colorVars['--color-text-muted'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1.5'],
    flexShrink: 0,
  },
  statusText: {
    fontSize: textSizeVars['--font-size-sm'],
    lineHeight: typeScaleVars['--text-caption-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-muted'],
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
    borderTopColor: colorVars['--color-border-subtle'],
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    justifyContent: 'flex-end',
  },
});
