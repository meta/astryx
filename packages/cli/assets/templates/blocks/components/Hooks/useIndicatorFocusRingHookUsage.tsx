// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {useIndicatorFocusRing} from '@astryxdesign/core/hooks';
import {CheckboxIndicator} from '@astryxdesign/core/Indicator';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

export default function UseIndicatorFocusRingHookUsage() {
  // Wraps only CheckboxIndicator so the outline follows the box, not the label.
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [isChecked, setIsChecked] = useState(true);

  const {focusProps} = useIndicatorFocusRing(indicatorRef);

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <Heading level={3}>Workspace sync</Heading>

        <label
          {...focusProps}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}>
          <input
            type="checkbox"
            checked={isChecked}
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
            <CheckboxIndicator state={isChecked ? 'checked' : 'unchecked'} />
          </span>
          <Text type="body" color="primary">
            Auto-save drafts
          </Text>
        </label>

        <Text type="supporting" color="secondary">
          {isChecked
            ? 'Checked. Tab here to ring only the indicator.'
            : 'Unchecked. Tab here to ring only the indicator.'}
        </Text>
      </VStack>
    </Card>
  );
}
