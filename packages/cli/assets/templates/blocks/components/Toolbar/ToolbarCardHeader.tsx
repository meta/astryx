// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {FunnelIcon, AddIcon} from '@astryxdesign/template-icons';
import {useToast} from '@astryxdesign/core/Toast';

export default function ToolbarCardHeader() {
  const showToast = useToast();
  return (
    <Card
      style={{width: 500, maxWidth: '100%', height: '100%', marginTop: 260}}>
      <Toolbar
        label="User list actions"
        size="sm"
        dividers={['bottom']}
        startContent={<Heading level={4}>Card title</Heading>}
        endContent={
          <>
            <Button
              onClick={() =>
                showToast({body: 'Demo: user filters would open here'})
              }
              label="Filter"
              variant="ghost"
              icon={<Icon icon={FunnelIcon} />}
              isIconOnly
            />
            <Button
              onClick={() =>
                showToast({body: 'Demo: an add-user form would open here'})
              }
              label="Add user"
              icon={<Icon icon={AddIcon} />}
              isIconOnly
            />
          </>
        }
      />
      <Section />
    </Card>
  );
}
