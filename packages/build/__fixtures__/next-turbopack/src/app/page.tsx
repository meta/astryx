// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';
import {Button, Text} from '@astryxdesign/core';
import {Stat} from '@astryxdesign/lab';
import {Modules} from './modules';

// Per package, a base instance, one under the product's StyleX and one under
// its class (globals.css). Each sits in a `data-probe` wrapper.
const styles = stylex.create({
  card: {padding: 13, borderWidth: 3},
  core: {backgroundColor: 'rgb(255, 0, 255)'},
  lab: {flexDirection: 'row'},
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
        <Stat label="Requests" value="1.2M" />
      </div>
      <div data-probe="lab-stylex">
        <Stat label="Requests" value="1.2M" xstyle={styles.lab} />
      </div>
      <div data-probe="lab-class">
        <Stat label="Requests" value="1.2M" className="product-lab" />
      </div>
      <Modules />
    </main>
  );
}
