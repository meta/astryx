// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Outline, useOutlineFromMarkdown} from '@astryxdesign/core/Outline';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';

const ARTICLE = `## Before you start

Check that your project builds on the current release. Commit your work, so
that you can compare the result of the upgrade.

## Run the upgrade

Update the packages, then rebuild the project. The upgrade changes no source
files.

### Update the packages

Install the new version of every package at the same time. Mixed versions fail
the build.

### Rebuild the project

Delete the build output first. A stale cache can hide a real error.

## Check the result

Open the pages that you use most, and compare them with the earlier build.
`;

const NEW_SECTION = `
## New section

The button added this heading to the Markdown string.
`;

export default function UseOutlineFromMarkdownHookUsage() {
  const [markdown, setMarkdown] = useState(ARTICLE);
  const items = useOutlineFromMarkdown(markdown);
  const articleRef = useRef<HTMLDivElement>(null);

  return (
    <HStack gap={6} align="start" width="100%">
      <ScrollableArea
        ref={articleRef}
        label="Article"
        height={320}
        width="100%">
        <Markdown>{markdown}</Markdown>
      </ScrollableArea>
      <VStack gap={3} align="start" width={220}>
        {/* A non-zero offset moves only the article. With 0, a click also moves
            the page around the article. */}
        <Outline items={items} scrollContainerRef={articleRef} offset={8} />
        <Button
          label="Add section"
          variant="secondary"
          size="sm"
          onClick={() => setMarkdown(current => current + NEW_SECTION)}
        />
      </VStack>
    </HStack>
  );
}
