// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useIndicatorFocusRing} from '@astryxdesign/core/hooks';
import {CheckboxIndicator} from '@astryxdesign/core/Indicator';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

export default function UseIndicatorFocusRingHookUsage() {
  // Wraps only CheckboxIndicator so the outline follows the box, not the label.
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [isChecked, setIsChecked] = useState(true);
  const [isDisabled, setIsDisabled] = useState(false);

  const {focusProps} = useIndicatorFocusRing(indicatorRef, isDisabled);

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <HStack gap={2} justify="between" vAlign="center">
          <Heading level={3}>Workspace sync</Heading>
          <Button
            label={isDisabled ? 'Enable' : 'Disable'}
            variant="secondary"
            onClick={() => setIsDisabled(disabled => !disabled)}
          />
        </HStack>

        <label
          {...focusProps}
          data-testid="indicator-focus-owner"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          }}>
          <input
            type="checkbox"
            checked={isChecked}
            disabled={isDisabled}
            onChange={event => setIsChecked(event.target.checked)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              margin: 0,
              opacity: 0,
              cursor: 'inherit',
            }}
          />
          <span
            ref={indicatorRef}
            data-testid="indicator-ring-wrapper"
            style={{display: 'inline-flex'}}>
            <CheckboxIndicator
              state={isChecked ? 'checked' : 'unchecked'}
              isDisabled={isDisabled}
            />
          </span>
          <Text type="body" color={isDisabled ? 'secondary' : 'primary'}>
            Auto-save drafts
          </Text>
        </label>

        <Text type="supporting" color="secondary">
          {isDisabled
            ? 'Disabled: focusProps skips painting the ring.'
            : isChecked
              ? 'Enabled and checked. Tab here to ring only the indicator.'
              : 'Enabled and unchecked. Tab here to ring only the indicator.'}
        </Text>
      </VStack>
    </Card>
  );
}
