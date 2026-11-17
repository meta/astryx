// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Outline, useOutlineFromDOM} from '@astryxdesign/core/Outline';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';

const SECTIONS = [
  {id: 'before-you-start', title: 'Before you start'},
  {id: 'run-the-upgrade', title: 'Run the upgrade'},
  {id: 'check-the-result', title: 'Check the result'},
];

export default function UseOutlineFromDOMHookUsage() {
  const articleRef = useRef<HTMLDivElement>(null);
  const items = useOutlineFromDOM(articleRef);
  const [extra, setExtra] = useState(0);

  return (
    <HStack gap={6} align="start" width="100%">
      <ScrollableArea
        ref={articleRef}
        label="Article"
        height={320}
        width="100%">
        <VStack gap={4} align="start">
          {SECTIONS.map(section => (
            <VStack key={section.id} gap={1} align="start">
              <Heading level={2} id={section.id}>
                {section.title}
              </Heading>
              <Text type="body">
                The outline reads this heading from the article.
              </Text>
            </VStack>
          ))}
          {Array.from({length: extra}, (_, index) => (
            <VStack key={`added-${index}`} gap={1} align="start">
              <Heading level={2} id={`new-section-${index + 1}`}>
                New section
              </Heading>
              <Text type="body">The button added this heading.</Text>
            </VStack>
          ))}
        </VStack>
      </ScrollableArea>
      <VStack gap={3} align="start" width={220}>
        <Outline items={items} scrollContainerRef={articleRef} offset={8} />
        <Button
          label="Add section"
          variant="secondary"
          size="sm"
          onClick={() => setExtra(count => count + 1)}
        />
      </VStack>
    </HStack>
  );
}
