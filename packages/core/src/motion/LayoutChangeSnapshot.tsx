// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayoutChangeSnapshot.tsx
 * @input A value and a callback
 * @output Exports LayoutChangeSnapshot: calls the callback in the commit that
 *   changes the value, before React changes the DOM
 * @position Motion foundation, internal to core; how a component that takes
 *   an `animatedLayout` handle measures each change before it lands
 *   (`spec:AST-105` FR1), whatever caused it: a click, an owner-set prop, or
 *   a group's value
 *
 * `getSnapshotBeforeUpdate` runs in the commit, after render and before any
 * DOM mutation of that commit, so the layout it reads is the old one. Unlike
 * a read during render, it runs only for a render that commits, once (a
 * StrictMode replay or a render React throws away never reaches it), and it
 * keeps render pure (`architecture:react-component-runtime` INV1, INV3).
 * Only a class component has it.
 *
 * SYNC: When modified, update Collapsible.tsx and TreeList.tsx.
 */

import {Component} from 'react';

interface LayoutChangeSnapshotProps<T> {
  /** The state whose change moves the layout. */
  value: T;
  /** Runs before the DOM changes, with the value being left. */
  onBeforeChange: (previous: T) => void;
}

export class LayoutChangeSnapshot<T> extends Component<
  LayoutChangeSnapshotProps<T>
> {
  override getSnapshotBeforeUpdate(
    previous: Readonly<LayoutChangeSnapshotProps<T>>,
  ): null {
    if (!Object.is(previous.value, this.props.value)) {
      this.props.onBeforeChange(previous.value);
    }
    return null;
  }

  // React asks for this beside getSnapshotBeforeUpdate.
  override componentDidUpdate(): void {}

  override render(): null {
    return null;
  }
}
