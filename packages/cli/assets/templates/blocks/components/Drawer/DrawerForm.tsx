// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Controlled open state and two editable fields
 * @output A form drawer with a header, scrolling fields, and pinned footer
 *   actions; purpose="form" keeps Escape but ignores scrim clicks
 * @position Copyable Drawer example
 */

import {useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';

export default function DrawerForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('web-prod-04');
  const [owner, setOwner] = useState('Platform team');

  return (
    <>
      <Button label="Edit host" onClick={() => setIsOpen(true)} />
      <Drawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Edit host"
        purpose="form">
        <Layout
          header={<DrawerHeader title="Edit host" onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              <VStack gap={4}>
                <TextInput label="Name" value={name} onChange={setName} />
                <TextInput label="Owner" value={owner} onChange={setOwner} />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsOpen(false)}
                />
                <Button
                  label="Save"
                  variant="primary"
                  onClick={() => setIsOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Drawer>
    </>
  );
}
