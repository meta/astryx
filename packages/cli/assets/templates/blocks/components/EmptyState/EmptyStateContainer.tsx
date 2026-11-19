// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {FolderPlusIcon} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';

export default function EmptyStateContainer() {
  const showToast = useToast();
  return (
    <Card>
      <EmptyState
        icon={<Icon icon={FolderPlusIcon} size="lg" />}
        title="No projects yet"
        description="Create your first project to start organizing your work. You can invite team members after."
        actions={
          <>
            <Button
              onClick={() =>
                showToast({body: 'Demo: a project import would start here'})
              }
              label="Import"
              variant="secondary"
            />
            <Button
              onClick={() =>
                showToast({body: 'Demo: a new project form would open here'})
              }
              label="Create project"
              variant="primary"
            />
          </>
        }
      />
    </Card>
  );
}
