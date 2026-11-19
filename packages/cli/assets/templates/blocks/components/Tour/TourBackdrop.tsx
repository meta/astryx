// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Tour} from '@astryxdesign/core/Tour';
import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';

export default function TourBackdrop() {
  const filterRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <Stack direction="horizontal" gap={2}>
      <Button
        label="Take the tour"
        variant="primary"
        onClick={() => setActiveId('welcome')}
      />
      <Button ref={filterRef} label="Filter" />
      <Tour
        steps={[
          {
            id: 'welcome',
            title: 'Filters moved',
            body: 'A short tour shows where they are now.',
          },
          {
            id: 'filter',
            anchorRef: filterRef,
            title: 'Filter the list',
            body: 'Pick the columns to filter by.',
          },
        ]}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={() => setActiveId(null)}
        hasBackdrop
        hasSkipButton
      />
    </Stack>
  );
}
