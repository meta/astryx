// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';
import {Button, Text} from '@astryxdesign/core';
import {LineClamp} from '@astryxdesign/lab';
import {Modules} from './modules';

// Per package, a base instance, one under the product's StyleX and one under
// its class (globals.css). Each sits in a `data-probe` wrapper.
const styles = stylex.create({
  card: {padding: 13, borderWidth: 3},
  core: {backgroundColor: 'rgb(255, 0, 255)'},
  lab: {overflowWrap: 'normal'},
});

export default function Page() {
  return (
    <main id="card" {...stylex.props(styles.card)}>
      <Text>Hello</Text>
      <div data-probe="core-base">
        <Button label="Delete" variant="destructive" />
      </div>
      <div data-probe="core-stylex">
        <Button label="Delete" variant="destructive" xstyle={styles.core} />
      </div>
      <div data-probe="core-class">
        <Button label="Delete" variant="destructive" className="product-core" />
      </div>
      <div data-probe="lab-base">
        <LineClamp maxLines={2}>Requests</LineClamp>
      </div>
      <div data-probe="lab-stylex">
        <LineClamp maxLines={2} xstyle={styles.lab}>
          Requests
        </LineClamp>
      </div>
      <div data-probe="lab-class">
        <LineClamp maxLines={2} className="product-lab">
          Requests
        </LineClamp>
      </div>
      <Modules />
    </main>
  );
}
