// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';

export default function GridShowcase() {
  return (
    <Grid columns={3} gap={2} width={400} maxWidth="100%">
      {Array.from({length: 12}, (_, i) => (
        <Card key={i}>Item {i + 1}</Card>
      ))}
    </Grid>
  );
}
