// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {ArrowLeftIcon} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';
import {rtlStyles} from '@astryxdesign/core/utils';

export default function ToolbarThreeSlot() {
  const showToast = useToast();
  return (
    <Card style={{width: 600, height: '100%', marginTop: 260}}>
      <Toolbar
        label="Document toolbar"
        dividers={['bottom']}
        startContent={
          <Button
            label="Back"
            variant="ghost"
            icon={<Icon icon={ArrowLeftIcon} xstyle={rtlStyles.mirror} />}
            isIconOnly
          />
        }
        centerContent={<Heading level={4}>Title</Heading>}
        endContent={
          <>
            <Button
              onClick={() =>
                showToast({body: 'Demo: your changes would be discarded here'})
              }
              label="Discard"
              variant="secondary"
            />
            <Button
              onClick={() =>
                showToast({body: 'Demo: your changes would be saved here'})
              }
              label="Save"
              variant="primary"
            />
          </>
        }
      />
      <Section />
    </Card>
  );
}
