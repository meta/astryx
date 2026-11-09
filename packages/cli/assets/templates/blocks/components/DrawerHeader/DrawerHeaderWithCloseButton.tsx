// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled open state for a modal Drawer
 * @output A Drawer whose DrawerHeader renders a close button because it receives onOpenChange
 * @position Copyable DrawerHeader example
 */

import {useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function DrawerHeaderWithCloseButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button label="Open drawer" onClick={() => setIsOpen(true)} />
      <Drawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Details"
        width={360}>
        <Layout
          header={<DrawerHeader title="Details" onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              <Text type="body">
                Passing onOpenChange renders the close button, which calls it
                with false.
              </Text>
            </LayoutContent>
          }
        />
      </Drawer>
    </>
  );
}
