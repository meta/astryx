// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {AnchorHeading} from './AnchorHeading';
import {ContentBlockRenderer} from './ContentBlockRenderer';
import {BestPracticesBlock} from './BestPracticesBlock';
import {DocPageLayout} from './DocPageLayout';
import {buildOutline, normalizeHeadingLevel} from './docOutline';
import type {DocSection} from '../../generated/docsRegistry';
import type {ReactNode} from 'react';

export type SectionOverrides = Record<
  string,
  (section: DocSection, id: string) => ReactNode
>;

function isGuidanceList(block: DocSection['content'][number] | undefined) {
  return (
    block?.type === 'list' && (block.style === 'do' || block.style === 'dont')
  );
}

function isBestPracticesSection(section: DocSection): boolean {
  return section.content.every(isGuidanceList);
}

function BestPracticesSection({
  section,
  id,
}: {
  section: DocSection;
  id: string;
}) {
  const items: {guidance: boolean; description: string}[] = [];
  for (const block of section.content) {
    if (
      block.type === 'list' &&
      (block.style === 'do' || block.style === 'dont')
    ) {
      const isDo = block.style === 'do';
      for (const item of block.items ?? []) {
        items.push({guidance: isDo, description: item});
      }
    }
  }
  return (
    <VStack gap={4}>
      <AnchorHeading id={id} level={2} type="display-3">
        {section.title}
      </AnchorHeading>
      <BestPracticesBlock items={items} />
    </VStack>
  );
}

export function ReferenceDocView({
  title,
  description,
  sections,
  sectionOverrides,
}: {
  title: string;
  description: string;
  sections: DocSection[];
  sectionOverrides?: SectionOverrides;
}) {
  const {sectionIds, blockIds, outline} = buildOutline(sections);

  return (
    <DocPageLayout title={title} description={description} outline={outline}>
      {sections.map((section, i) => {
        const id = sectionIds[i];
        const override = sectionOverrides?.[section.title];
        return (
          <VStack gap={4} key={section.title}>
            {override ? (
              override(section, id)
            ) : isBestPracticesSection(section) ? (
              <BestPracticesSection section={section} id={id} />
            ) : (
              <>
                <AnchorHeading id={id} level={2} type="display-3">
                  {section.title}
                </AnchorHeading>
                {section.content.map((block, blockIndex) => {
                  if (block.type === 'heading') {
                    const blockId = blockIds.get(`${i}:${blockIndex}`);
                    if (blockId != null) {
                      return (
                        <AnchorHeading
                          key={blockIndex}
                          id={blockId}
                          level={normalizeHeadingLevel(block.level)}>
                          {block.text ?? ''}
                        </AnchorHeading>
                      );
                    }
                  }
                  // A run of do/dont lists is one badge table, so guidance
                  // keeps its Do/Don't label outside all-guidance sections.
                  if (isGuidanceList(block)) {
                    if (isGuidanceList(section.content[blockIndex - 1])) {
                      return null;
                    }
                    const items: {guidance: boolean; description: string}[] =
                      [];
                    for (let j = blockIndex; j < section.content.length; j++) {
                      const run = section.content[j];
                      if (!isGuidanceList(run)) {
                        break;
                      }
                      for (const item of run.items ?? []) {
                        items.push({
                          guidance: run.style === 'do',
                          description: item,
                        });
                      }
                    }
                    return (
                      <BestPracticesBlock key={blockIndex} items={items} />
                    );
                  }
                  return (
                    <ContentBlockRenderer key={blockIndex} block={block} />
                  );
                })}
              </>
            )}
          </VStack>
        );
      })}
    </DocPageLayout>
  );
}
