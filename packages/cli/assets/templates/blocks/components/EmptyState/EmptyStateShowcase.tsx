// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {SearchIcon} from '@astryxdesign/template-icons';
import {useToast} from '@astryxdesign/core/Toast';

export default function EmptyStateShowcase() {
  const showToast = useToast();
  return (
    <EmptyState
      icon={<Icon icon={SearchIcon} size="lg" />}
      title="No results found"
      description="Try adjusting your search or filters to find what you need."
      actions={
        <Button
          label="Clear filters"
          variant="secondary"
          onClick={() =>
            showToast({body: 'Demo: your filters would be cleared here'})
          }
        />
      }
    />
  );
}
