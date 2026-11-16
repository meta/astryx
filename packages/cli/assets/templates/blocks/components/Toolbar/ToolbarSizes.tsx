// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Heading} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Layout';
import {Card} from '@astryxdesign/core/Card';
import {FunnelIcon, PlusIcon} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';

const SIZES = [
  {size: 'sm' as const, label: 'Small'},
  {size: 'md' as const, label: 'Medium'},
  {size: 'lg' as const, label: 'Large'},
];

export default function ToolbarSizes() {
  const showToast = useToast();
  return (
    <Stack direction="vertical" gap={4} style={{width: 500, maxWidth: '100%'}}>
      {SIZES.map(({size, label}) => (
        <Card key={size}>
          <Toolbar
            label={`${label} toolbar`}
            size={size}
            startContent={<Heading level={4}>{label}</Heading>}
            endContent={
              <>
                <Button
                  onClick={() =>
                    showToast({body: 'Demo: filters would open here'})
                  }
                  label="Filter"
                  variant="ghost"
                  icon={<Icon icon={FunnelIcon} />}
                  isIconOnly
                />
                <Button
                  onClick={() =>
                    showToast({body: 'Demo: a new item form would open here'})
                  }
                  label="Add"
                  icon={<Icon icon={PlusIcon} />}
                />
              </>
            }
          />
        </Card>
      ))}
    </Stack>
  );
}
