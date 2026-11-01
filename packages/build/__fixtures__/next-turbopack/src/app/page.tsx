// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';
import {Button, Text} from '@astryxdesign/core';
import {Stat} from '@astryxdesign/lab';

const styles = stylex.create({card: {padding: 13, borderWidth: 3}});

export default function Page() {
  return (
    <main id="card" {...stylex.props(styles.card)}>
      <Text>Hello</Text>
      <Button label="Delete" variant="destructive" />
      <Stat label="Requests" value="1.2M" />
    </main>
  );
}
