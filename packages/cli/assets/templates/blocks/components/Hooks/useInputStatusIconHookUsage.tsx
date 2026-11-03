// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useId, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import type {FieldStatusPlacement, InputStatus} from '@astryxdesign/core/Field';
import {useInputStatusIcon} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {
  borderVars,
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const VALID_CODE = 'SAVE20';

const styles = stylex.create({
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    backgroundColor: colorVars['--color-background-surface'],
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
    borderStyle: 'solid',
    borderWidth: borderVars['--border-width'],
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-3'],
    outlineColor: {
      default: 'transparent',
      ':has(input:focus-visible)': focusVars['--focus-outline-color'],
    },
    outlineOffset: focusVars['--focus-outline-offset'],
    outlineStyle: 'solid',
    outlineWidth: {
      default: '0',
      ':has(input:focus-visible)': focusVars['--focus-outline-width'],
    },
  },
  error: {borderColor: colorVars['--color-border-error']},
  success: {borderColor: colorVars['--color-border-success']},
  input: {
    flexGrow: 1,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colorVars['--color-text-primary'],
    font: 'inherit',
    outline: 'none',
  },
});

function CouponField({statusVariant}: {statusVariant: FieldStatusPlacement}) {
  const [code, setCode] = useState('SAVE10');
  const messageId = useId();

  const status: InputStatus | undefined =
    code === ''
      ? undefined
      : code.toUpperCase() === VALID_CODE
        ? {type: 'success', message: 'Code applied: 20% off.'}
        : {type: 'error', message: 'This code is not valid.'};

  // The hook decides what the field shows for this status and variant, and
  // returns the id of its tooltip only when that tooltip is in the DOM.
  const {statusIcon, describedBy} = useInputStatusIcon({
    status,
    statusVariant,
  });

  // `attached` and `detached` carry the text in a message box under the field;
  // `tooltip` carries it in the hook's tooltip instead.
  const hasMessageBox = statusVariant !== 'tooltip' && !!status;
  const ariaDescribedBy =
    [hasMessageBox ? messageId : null, describedBy].filter(Boolean).join(' ') ||
    undefined;

  return (
    <VStack gap={1}>
      <div
        {...stylex.props(
          styles.field,
          status?.type === 'error' && styles.error,
          status?.type === 'success' && styles.success,
        )}>
        <input
          type="text"
          aria-label="Coupon code"
          aria-invalid={status?.type === 'error' || undefined}
          aria-describedby={ariaDescribedBy}
          placeholder="Enter a coupon code"
          value={code}
          onChange={e => setCode(e.target.value)}
          {...stylex.props(styles.input)}
        />
        {statusIcon}
      </div>
      {hasMessageBox ? (
        <Text id={messageId} type="supporting">
          {status.message}
        </Text>
      ) : null}
    </VStack>
  );
}

export default function UseInputStatusIconHookUsage() {
  const [statusVariant, setStatusVariant] =
    useState<FieldStatusPlacement>('attached');

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <SegmentedControl
          label="Status variant"
          value={statusVariant}
          onChange={next => setStatusVariant(next as FieldStatusPlacement)}
          size="sm">
          <SegmentedControlItem value="attached" label="Attached" />
          <SegmentedControlItem value="detached" label="Detached" />
          <SegmentedControlItem value="tooltip" label="Tooltip" />
        </SegmentedControl>
        <CouponField statusVariant={statusVariant} />
        <Text type="supporting">
          Type {VALID_CODE} to see the success status.
        </Text>
      </VStack>
    </Card>
  );
}
