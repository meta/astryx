// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearchToken.tsx
 * @input PowerSearchTokenProps
 * @output Default token pill for PowerSearch filters
 * @position Public component; used internally by PowerSearch and available for consumer composition
 */

import React from 'react';
import * as stylex from '@stylexjs/stylex';
import {Token} from '../Token';
import {useLocale} from '../i18n/useLocale';
import {useCalendarSystem} from '../i18n/useCalendarSystem';
import {fontWeightVars} from '../theme/tokens.stylex';
import {formatFilterValue} from './formatFilterValue';
import {resolveOperatorLabel} from './resolveOperatorLabel';
import {useInternalConfig} from './useInternalConfig';
import type {PowerSearchTokenProps} from './types';
import {useComponentTranslator} from '../i18n/useComponentTranslator';
import {formatTokenLabel} from './formatTokenValue';
import {pickDataAttributes} from '../utils/themeProps';

const tokenValueStyles = stylex.create({
  value: {
    fontWeight: fontWeightVars['--font-weight-bold'],
  },
});

/**
 * Default token pill for PowerSearch filters.
 *
 * Renders a field label, operator label, and formatted value inside an Token.
 * This is the built-in implementation used by PowerSearch — exported so consumers
 * can use it as a base when providing custom `components.Token` overrides.
 */
export function PowerSearchToken({
  config: configProp,
  filter,
  field,
  operator,
  maxLength,
  onClick,
  onRemove,
  isDisabled,
  timezoneID,
  ...rest
}: PowerSearchTokenProps) {
  const config = useInternalConfig(configProp);
  const t = useComponentTranslator();
  const locale = useLocale();
  const calendar = useCalendarSystem(undefined, 'PowerSearchToken');

  const fieldLabel = field.label;
  const resolvedOperatorLabel = resolveOperatorLabel(operator, t);
  const tokenLabel = formatTokenLabel(t, fieldLabel, resolvedOperatorLabel);

  const adjustedMaxLength = Math.max(
    maxLength - fieldLabel.length - resolvedOperatorLabel.length,
    10,
  );

  const valueStr = formatFilterValue(
    config,
    operator.value,
    filter.value,
    adjustedMaxLength,
    t,
    locale,
    timezoneID,
    calendar,
  );

  const valueContent = valueStr ? (
    <span {...stylex.props(tokenValueStyles.value)}>{valueStr}</span>
  ) : undefined;

  return (
    <Token
      {...pickDataAttributes(rest)}
      label={tokenLabel}
      endContent={valueContent}
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onRemove={onRemove}
      isDisabled={isDisabled}
    />
  );
}

PowerSearchToken.displayName = 'PowerSearchToken';
