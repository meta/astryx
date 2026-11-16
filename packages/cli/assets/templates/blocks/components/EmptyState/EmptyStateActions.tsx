// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';

export default function EmptyStateActions() {
  const showToast = useToast();
  return (
    <EmptyState
      icon={<Icon icon={MagnifyingGlassIcon} size="lg" />}
      title="No results found"
      description="Try adjusting your search terms or clearing filters to see more results."
      actions={
        <>
          <Button
            onClick={() =>
              showToast({
                body: 'Demo: you would go back to the previous page here',
              })
            }
            label="Go back"
            variant="secondary"
          />
          <Button
            onClick={() =>
              showToast({body: 'Demo: your filters would be cleared here'})
            }
            label="Clear filters"
            variant="primary"
          />
        </>
      }
    />
  );
}
