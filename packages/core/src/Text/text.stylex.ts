// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file text.stylex.ts
 * @input Uses StyleX, theme tokens
 * @output Exports StyleX styles for Text and Heading props
 * @position Styles module; consumed by Text.tsx, Heading.tsx
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Text/Text.doc.mjs
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  fontWeightVars,
  textSizeVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';

// =============================================================================
// Color Styles
// =============================================================================

export const colorStyles = stylex.create({
  primary: {
    color: colorVars['--color-text-primary'],
  },
  secondary: {
    color: colorVars['--color-text-secondary'],
  },
  disabled: {
    color: colorVars['--color-text-disabled'],
  },
  placeholder: {
    color: colorVars['--color-text-secondary'],
  },
  accent: {
    color: colorVars['--color-text-accent'],
  },
  inherit: {
    color: 'inherit',
  },
});

// =============================================================================
// Weight Styles
// =============================================================================

export const weightStyles = stylex.create({
  normal: {
    fontWeight: fontWeightVars['--font-weight-normal'],
  },
  medium: {
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  semibold: {
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  bold: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
});

// =============================================================================
// Default Weight by Type (matches theme type-scale tokens)
// =============================================================================

export const defaultWeightByTypeStyles = stylex.create({
  body: {
    fontWeight: typeScaleVars['--text-body-weight'],
  },
  large: {
    fontWeight: typeScaleVars['--text-large-weight'],
  },
  label: {
    fontWeight: typeScaleVars['--text-label-weight'],
  },
  code: {
    fontWeight: typeScaleVars['--text-code-weight'],
  },
  supporting: {
    fontWeight: typeScaleVars['--text-supporting-weight'],
  },
  'display-1': {
    fontWeight: typeScaleVars['--text-display-1-weight'],
  },
  'display-2': {
    fontWeight: typeScaleVars['--text-display-2-weight'],
  },
  'display-3': {
    fontWeight: typeScaleVars['--text-display-3-weight'],
  },
  inherit: {
    fontWeight: 'inherit',
  },
});

// =============================================================================
// Baseline Size/Leading by Type (from type-scale tokens)
//
// These ensure Text renders with correct sizing even without a theme.
// Theme component overrides (`.astryx-text[data-type="body"]`, etc.) win when
// because they have higher specificity via @scope.
// =============================================================================

export const sizeByTypeStyles = stylex.create({
  body: {
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
  },
  large: {
    fontSize: typeScaleVars['--text-large-size'],
    lineHeight: typeScaleVars['--text-large-leading'],
  },
  label: {
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
  },
  code: {
    fontSize: typeScaleVars['--text-code-size'],
    lineHeight: typeScaleVars['--text-code-leading'],
    fontFamily: typographyVars['--font-family-code'],
  },
  supporting: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  'display-1': {
    fontSize: typeScaleVars['--text-display-1-size'],
    lineHeight: typeScaleVars['--text-display-1-leading'],
  },
  'display-2': {
    fontSize: typeScaleVars['--text-display-2-size'],
    lineHeight: typeScaleVars['--text-display-2-leading'],
  },
  'display-3': {
    fontSize: typeScaleVars['--text-display-3-size'],
    lineHeight: typeScaleVars['--text-display-3-leading'],
  },
  inherit: {
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
});

// =============================================================================
// Explicit Size Override
// =============================================================================

export const sizeStyles = stylex.create({
  '4xs': {
    fontSize: textSizeVars['--font-size-4xs'],
  },
  '3xs': {
    fontSize: textSizeVars['--font-size-3xs'],
  },
  '2xs': {
    fontSize: textSizeVars['--font-size-2xs'],
  },
  xsm: {
    fontSize: textSizeVars['--font-size-xs'],
  },
  sm: {
    fontSize: textSizeVars['--font-size-sm'],
  },
  base: {
    fontSize: textSizeVars['--font-size-base'],
  },
  lg: {
    fontSize: textSizeVars['--font-size-lg'],
  },
  xl: {
    fontSize: textSizeVars['--font-size-xl'],
  },
  '2xl': {
    fontSize: textSizeVars['--font-size-2xl'],
  },
  '3xl': {
    fontSize: textSizeVars['--font-size-3xl'],
  },
  '4xl': {
    fontSize: textSizeVars['--font-size-4xl'],
  },
});

// =============================================================================
// Baseline Size/Leading by Heading Level (from type-scale tokens)
//
// Same rationale as sizeByTypeStyles — ensures Heading renders
// with correct sizing even without a theme.
// =============================================================================

export const sizeByLevelStyles = stylex.create({
  1: {
    fontSize: typeScaleVars['--text-heading-1-size'],
    lineHeight: typeScaleVars['--text-heading-1-leading'],
    fontWeight: typeScaleVars['--text-heading-1-weight'],
  },
  2: {
    fontSize: typeScaleVars['--text-heading-2-size'],
    lineHeight: typeScaleVars['--text-heading-2-leading'],
    fontWeight: typeScaleVars['--text-heading-2-weight'],
  },
  3: {
    fontSize: typeScaleVars['--text-heading-3-size'],
    lineHeight: typeScaleVars['--text-heading-3-leading'],
    fontWeight: typeScaleVars['--text-heading-3-weight'],
  },
  4: {
    fontSize: typeScaleVars['--text-heading-4-size'],
    lineHeight: typeScaleVars['--text-heading-4-leading'],
    fontWeight: typeScaleVars['--text-heading-4-weight'],
  },
  5: {
    fontSize: typeScaleVars['--text-heading-5-size'],
    lineHeight: typeScaleVars['--text-heading-5-leading'],
    fontWeight: typeScaleVars['--text-heading-5-weight'],
  },
  6: {
    fontSize: typeScaleVars['--text-heading-6-size'],
    lineHeight: typeScaleVars['--text-heading-6-leading'],
    fontWeight: typeScaleVars['--text-heading-6-weight'],
  },
});

// =============================================================================
// Display Styles
// =============================================================================

export const displayStyles = stylex.create({
  inline: {
    display: 'inline',
  },
  block: {
    display: 'block',
  },
});

// =============================================================================
// Truncation Styles
// =============================================================================

export const truncationStyles = stylex.create({
  // Single-line truncation (maxLines=1)
  singleLine: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
  },
  // Multi-line truncation base (maxLines>1)
  // Note: -webkit-line-clamp value is set via inline style
  multiLine: {
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
  },
});

// =============================================================================
// Word Break Styles
// =============================================================================

export const wordBreakStyles = stylex.create({
  'break-word': {
    wordBreak: 'normal',
    overflowWrap: 'break-word',
  },
  'break-all': {
    wordBreak: 'break-all',
  },
});

// =============================================================================
// Text Wrap Styles
// =============================================================================

export const textWrapStyles = stylex.create({
  wrap: {
    textWrap: 'wrap',
  },
  nowrap: {
    textWrap: 'nowrap',
  },
  balance: {
    textWrap: 'balance',
  },
  pretty: {
    textWrap: 'pretty',
  },
});

// =============================================================================
// Capsize Styles (Text Box Trim)
// =============================================================================

export const capsizeStyles = stylex.create({
  enabled: {
    textBoxEdge: 'cap alphabetic',
    textBoxTrim: 'trim-both',
    display: 'block',
  },
});

// =============================================================================
// Decoration Styles
// =============================================================================

export const decorationStyles = stylex.create({
  strikethrough: {
    textDecoration: 'line-through',
  },
});

// =============================================================================
// Tabular Numbers Style
// =============================================================================

export const tabularNumbersStyle = stylex.create({
  enabled: {
    fontVariantNumeric: 'tabular-nums',
  },
});

// =============================================================================
// Justify (Text Alignment) Styles
// =============================================================================

export const justifyStyles = stylex.create({
  start: {
    textAlign: 'start',
  },
  center: {
    textAlign: 'center',
  },
  end: {
    textAlign: 'end',
  },
});

// =============================================================================
// Truncation Tooltip Content Style
// =============================================================================

export const truncationTooltipStyles = stylex.create({
  content: {
    maxWidth: '300px',
    wordBreak: 'break-word',
  },
});
