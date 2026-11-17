// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SampleCard.tsx
 * @input A title and a one-line detail.
 * @output A demo card built from Astryx components.
 * @position Post-local example asset for the live-example-sample fixture
 *   (spec:AST-033 FR22): not an Astryx component, exported from no package,
 *   listed in no catalog, and resolvable only by this post's live examples.
 */

import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export function SampleCard({title, detail}: {title: string; detail: string}) {
  return (
    <Card padding={4} data-testid="sample-card" style={{width: 220}}>
      <VStack gap={2}>
        <Text type="large" weight="bold">
          {title}
        </Text>
        <Text type="body">{detail}</Text>
      </VStack>
    </Card>
  );
}
