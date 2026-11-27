// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading} from '@astryxdesign/core/Text';
import type {
  ReferenceSection,
  ReferenceContentBlock,
  ReferenceDocBlock,
} from '@astryxdesign/cli/authoring';
import {ContentBlockRenderer} from './content-blocks';

const styles = stylex.create({
  sectionTitle: {
    scrollMarginTop: 80,
  },
});

/**
 * The preview renders `astryx docs` reads (scripts/generate-foundation-docs.mjs),
 * and a read includes the doc a `reference` block names in place of the block.
 * A `reference` block here was never read, and this renderer has no way to
 * include its doc, so it fails visibly at this boundary, as the docsite's block
 * renderer does, instead of rendering nothing.
 */
function readBlocks(
  content: (ReferenceContentBlock | ReferenceDocBlock)[],
): ReferenceContentBlock[] {
  return content.map(block => {
    if (block.type === 'reference') {
      throw new Error(
        `Documentation block "reference" (${block.target}) needs a read that includes the doc it names.`,
      );
    }
    return block;
  });
}

/**
 * Merge adjacent do/dont list blocks into a single unified table.
 */
function mergeDosDonts(
  blocks: ReferenceContentBlock[],
): ReferenceContentBlock[] {
  const merged: ReferenceContentBlock[] = [];
  let pendingDo: string[] = [];
  let pendingDont: string[] = [];

  const flush = () => {
    if (pendingDo.length > 0 || pendingDont.length > 0) {
      merged.push({
        type: 'list' as const,
        style: 'do-dont-merged' as 'do',
        items: [
          ...pendingDo.map(text => `do:${text}`),
          ...pendingDont.map(text => `dont:${text}`),
        ],
      });
      pendingDo = [];
      pendingDont = [];
    }
  };

  for (const block of blocks) {
    if (block.type === 'list' && block.style === 'do') {
      pendingDo.push(...block.items);
    } else if (block.type === 'list' && block.style === 'dont') {
      pendingDont.push(...block.items);
    } else {
      flush();
      merged.push(block);
    }
  }
  flush();
  return merged;
}

export function SectionRenderer({section}: {section: ReferenceSection}) {
  const mergedContent = useMemo(
    () => mergeDosDonts(readBlocks(section.content)),
    [section.content],
  );

  return (
    <VStack gap={4}>
      <Heading
        level={2}
        id={section.title.toLowerCase().replace(/\s+/g, '-')}
        xstyle={styles.sectionTitle}>
        {section.title}
      </Heading>
      {mergedContent.map((block, i) => (
        <ContentBlockRenderer key={i} block={block} />
      ))}
    </VStack>
  );
}
