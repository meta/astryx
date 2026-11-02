// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InputGroupText.tsx
 * @input Uses React, StyleX, theme tokens
 * @output Exports InputGroupText component
 * @position Text/icon element rendered inside InputGroup
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/InputGroup/InputGroup.doc.mjs
 * - /packages/core/src/InputGroup/index.ts
 * - /packages/cli/assets/templates/blocks/components/InputGroup/
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {inputGroupItemProps} from './groupStyles';

const styles = stylex.create({
  text: {
    display: 'flex',
    alignItems: 'center',
    paddingInline: spacingVars['--spacing-2'],
    backgroundColor: colorVars['--color-background-muted'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-secondary'],
    whiteSpace: 'nowrap',
    flexShrink: 0,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    marginInlineStart: {
      default: `calc(-1 * ${borderVars['--border-width']})`,
      ':first-child': 0,
    },
    borderStartStartRadius: {
      default: 0,
      ':first-child': radiusVars['--radius-element'],
    },
    borderEndStartRadius: {
      default: 0,
      ':first-child': radiusVars['--radius-element'],
    },
    borderStartEndRadius: {
      default: 0,
      ':last-child': radiusVars['--radius-element'],
    },
    borderEndEndRadius: {
      default: 0,
      ':last-child': radiusVars['--radius-element'],
    },
  },
});

export interface InputGroupTextProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content to render in the text slot.
   * Can be text or an icon.
   */
  children: ReactNode;
}

/**
 * A prefix or suffix text element for use inside InputGroup.
 *
 * @example
 * ```
 * <InputGroup label="URL">
 *   <InputGroupText>https://</InputGroupText>
 *   <TextInput label="URL" isLabelHidden value={url} onChange={setUrl} />
 * </InputGroup>
 * ```
 */
export function InputGroupText({
  ref,
  children,
  xstyle,
  className,
  style,
  ...rest
}: InputGroupTextProps) {
  return (
    <div
      ref={ref}
      {...rest}
      {...inputGroupItemProps}
      {...mergeProps(
        themeProps('input-group-text'),
        stylex.props(styles.text, xstyle),
        className,
        style,
      )}>
      {children}
    </div>
  );
}

InputGroupText.displayName = 'InputGroupText';
