// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Tour} from '@astryxdesign/core/Tour';
import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';

export default function TourShowcase() {
  const saveRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <Stack direction="horizontal" gap={2}>
      <Button
        label="Take the tour"
        variant="primary"
        onClick={() => setActiveId('save')}
      />
      <Button ref={saveRef} label="Save" />
      <Button ref={shareRef} label="Share" />
      <Tour
        steps={[
          {
            id: 'save',
            anchorRef: saveRef,
            title: 'Save your work',
            body: 'Changes save to the cloud.',
          },
          {
            id: 'share',
            anchorRef: shareRef,
            title: 'Share it',
            body: 'Invite people from here.',
          },
        ]}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={() => setActiveId(null)}
        hasStepCount
      />
    </Stack>
  );
}
