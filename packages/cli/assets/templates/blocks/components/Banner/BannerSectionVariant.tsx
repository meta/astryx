// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {useToast} from '@astryxdesign/core/Toast';

export default function BannerSectionVariant() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={3}>
      <Banner
        status="warning"
        title="Scheduled downtime"
        description="All services will be unavailable on Sunday from 2:00–4:00 AM."
        container="section"
        isDismissable
      />
      <Banner
        status="info"
        title="Welcome to the new dashboard"
        description="We have redesigned the layout based on your feedback."
        container="section"
        endContent={
          <Button
            label="Take a tour"
            variant="secondary"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: the dashboard tour would start here'})
            }
          />
        }
      />
    </Stack>
  );
}
