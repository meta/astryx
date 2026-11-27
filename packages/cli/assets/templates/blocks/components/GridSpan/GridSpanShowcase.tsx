// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Grid, GridSpan} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';

export default function GridSpanShowcase() {
  return (
    <Grid columns={4} gap={3} width={400} maxWidth="100%">
      <GridSpan columns={3}>
        <Card height={80}>
          <Text type="body" color="secondary">
            Spans 3 columns
          </Text>
        </Card>
      </GridSpan>
      <Card height={80}>
        <Text type="body" color="secondary">
          1 col
        </Text>
      </Card>
      <GridSpan rows={2}>
        <Card>
          <Text type="body" color="secondary">
            1 col
          </Text>
        </Card>
      </GridSpan>
      <GridSpan columns={3}>
        <Card height={80}>
          <Text type="body" color="secondary">
            Full-width row
          </Text>
        </Card>
      </GridSpan>
      <Card height={80}>
        <Text type="body" color="secondary">
          1 col
        </Text>
      </Card>
      <GridSpan columns={2}>
        <Card height={80}>
          <Text type="body" color="secondary">
            Spans 2 columns
          </Text>
        </Card>
      </GridSpan>
    </Grid>
  );
}
