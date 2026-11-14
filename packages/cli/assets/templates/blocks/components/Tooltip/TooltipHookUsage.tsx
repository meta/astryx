// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useTooltip} from '@astryxdesign/core/Tooltip';
import {Button} from '@astryxdesign/core/Button';
import {Center} from '@astryxdesign/core/Center';

export default function TooltipHookUsage() {
  const tooltip = useTooltip({
    placement: 'above',
    delay: 100,
  });

  return (
    <Center>
      <Button
        label="Using hook directly"
        ref={tooltip.ref}
        aria-describedby={tooltip.describedBy || undefined}
      />
      {tooltip.renderTooltip('Tooltip via hook')}
    </Center>
  );
}
