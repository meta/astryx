// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Layout, LayoutContent} from '@astryxdesign/core';
import {Text} from '@astryxdesign/core';

export default function Page() {
  return (
    <Layout
      content={
        <LayoutContent role="main">
          <Text as="h1" type="large">
            New Page
          </Text>
        </LayoutContent>
      }
    />
  );
}
