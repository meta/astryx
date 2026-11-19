// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Stack} from '@astryxdesign/core/Layout';
import {useToast} from '@astryxdesign/core/Toast';

export default function BannerWithActionButton() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={3}>
      <Banner
        status="info"
        title="Your trial expires in 3 days"
        description="Upgrade now to keep access to all features."
        endContent={
          <Button label="Upgrade" variant="secondary" size="sm" href="#" />
        }
      />
      <Banner
        status="warning"
        title="API key expires soon"
        description="Generate a new key before December 1 to avoid service interruption."
        endContent={
          <Button
            label="Renew key"
            variant="secondary"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: a new API key would be generated here'})
            }
          />
        }
      />
      <Banner
        status="error"
        title="Payment failed"
        description="We could not process your last payment."
        endContent={
          <Button
            label="Retry"
            variant="secondary"
            size="sm"
            onClick={() =>
              showToast({body: 'Demo: the payment would be retried here'})
            }
          />
        }
      />
    </Stack>
  );
}
