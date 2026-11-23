// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {useIndicatorFocusRing} from '@astryxdesign/core/hooks';
import {CheckboxIndicator} from '@astryxdesign/core/Indicator';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';

export default function UseIndicatorFocusRingHookUsage() {
  // Wraps only CheckboxIndicator so the outline follows the box, not the label.
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [isChecked, setIsChecked] = useState(true);

  const {focusProps} = useIndicatorFocusRing(indicatorRef);

  return (
    <Card width={360} padding={4}>
      <VStack gap={3}>
        <Heading level={3}>Workspace sync</Heading>

        <HStack as="label" gap={2} align="center" {...focusProps}>
          <VisuallyHidden>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={event => setIsChecked(event.target.checked)}
            />
          </VisuallyHidden>
          <HStack
            as="span"
            ref={indicatorRef}
            data-testid="indicator-ring-wrapper">
            <CheckboxIndicator state={isChecked ? 'checked' : 'unchecked'} />
          </HStack>
          <Text type="body" color="primary">
            Auto-save drafts
          </Text>
        </HStack>

        <Text type="supporting" color="secondary">
          {isChecked
            ? 'Checked. Tab here to ring only the indicator.'
            : 'Unchecked. Tab here to ring only the indicator.'}
        </Text>
      </VStack>
    </Card>
  );
}
