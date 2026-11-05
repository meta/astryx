// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A pixel, rem, or percentage width and controlled open state
 * @output A Drawer demonstrating the selected width budget
 * @position Copyable Drawer example
 */

import {useState} from 'react';
import {Drawer, DrawerHeader} from '@astryxdesign/core/Drawer';
import {Button} from '@astryxdesign/core/Button';
import {Layout, LayoutContent} from '@astryxdesign/core/Layout';
import {HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

export default function DrawerWidths() {
  const [isOpen, setIsOpen] = useState(false);
  const [width, setWidth] = useState<number | string>(320);

  function openAtWidth(value: number | string) {
    setWidth(value);
    setIsOpen(true);
  }

  return (
    <>
      <HStack gap={2}>
        <Button label="320px" onClick={() => openAtWidth(320)} />
        <Button label="32rem" onClick={() => openAtWidth('32rem')} />
        <Button label="50%" onClick={() => openAtWidth('50%')} />
      </HStack>
      <Drawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Width budget"
        width={width}>
        <Layout
          header={
            <DrawerHeader title="Width budget" onOpenChange={setIsOpen} />
          }
          content={
            <LayoutContent>
              <Text type="body">
                Width: {typeof width === 'number' ? `${width}px` : width}
              </Text>
            </LayoutContent>
          }
        />
      </Drawer>
    </>
  );
}
