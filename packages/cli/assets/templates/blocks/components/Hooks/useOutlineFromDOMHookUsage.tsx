// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Outline, useOutlineFromDOM} from '@astryxdesign/core/Outline';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Text} from '@astryxdesign/core/Text';

const INITIAL_SECTIONS = [
  {id: 'install', title: 'Install'},
  {id: 'configure', title: 'Configure'},
];

export default function UseOutlineFromDOMHookUsage() {
  const articleRef = useRef<HTMLDivElement>(null);
  const items = useOutlineFromDOM(articleRef);
  const [sections, setSections] = useState(INITIAL_SECTIONS);

  return (
    <HStack gap={6} align="start" width="100%">
      <ScrollableArea label="Article" height={300} width="100%">
        <div ref={articleRef}>
          <h2 id="intro">Intro</h2>
          <Text type="body">
            The outline beside this article is read straight from the DOM
            headings below - each one carries its own id.
          </Text>
          {sections.map(section => (
            <h3 id={section.id} key={section.id}>
              {section.title}
            </h3>
          ))}
        </div>
      </ScrollableArea>
      <VStack gap={3} align="start" width={220}>
        <Outline items={items} scrollContainerRef={articleRef} offset={8} />
        <Button
          label="Add heading"
          variant="secondary"
          size="sm"
          onClick={() =>
            setSections(current => [
              ...current,
              {
                id: `section-${current.length + 1}`,
                title: `Section ${current.length + 1}`,
              },
            ])
          }
        />
        <Text type="supporting" color="secondary">
          A new heading appears in the outline without any extra wiring: the
          hook observes the container.
        </Text>
      </VStack>
    </HStack>
  );
}
