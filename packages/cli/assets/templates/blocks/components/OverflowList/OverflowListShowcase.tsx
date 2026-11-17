// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {OverflowList} from '@astryxdesign/core/OverflowList';
import {Button} from '@astryxdesign/core/Button';

export default function OverflowListShowcase() {
  return (
    <div
      style={{
        maxWidth: 400,
        border: '1px dashed var(--color-border)',
        padding: 8,
      }}>
      <OverflowList
        gap={2}
        overflowRenderer={overflowItems => (
          <Button
            label={`+${overflowItems.length} more`}
            variant="ghost"
            size="sm"
          />
        )}>
        <Button label="Edit" size="sm" />
        <Button label="Duplicate" size="sm" />
        <Button label="Share" size="sm" />
        <Button label="Archive" size="sm" />
        <Button label="Delete" size="sm" />
      </OverflowList>
    </div>
  );
}
