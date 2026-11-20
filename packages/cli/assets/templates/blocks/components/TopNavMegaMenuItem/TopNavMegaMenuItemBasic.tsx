// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {TopNavMegaMenuItem} from '@astryxdesign/core/TopNav';
import {Grid} from '@astryxdesign/core/Grid';
import {BoltIcon, DatabaseIcon} from '@astryxdesign/template-icons';

export default function TopNavMegaMenuItemBasic() {
  return (
    <Grid columns={2} gap={2}>
      <TopNavMegaMenuItem
        title="Edge Functions"
        description="Run serverless code at the network edge"
        icon={<BoltIcon width={20} height={20} />}
        href="#edge"
      />
      <TopNavMegaMenuItem
        title="Storage"
        description="Object and file storage for your application"
        icon={<DatabaseIcon width={20} height={20} />}
        href="#storage"
      />
    </Grid>
  );
}
