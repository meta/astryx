// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Timer} from '@astryxdesign/core/Timer';
import {Text} from '@astryxdesign/core/Text';

export default function TimerInline() {
  return (
    <Text type="body" color="primary">
      Processing for <Timer type="inherit" color="inherit" />
    </Text>
  );
}
