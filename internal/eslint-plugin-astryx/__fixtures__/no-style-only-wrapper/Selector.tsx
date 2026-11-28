// Copyright (c) Meta Platforms, Inc. and affiliates.

// A field input: its props omit root `xstyle` and take `containerXstyle`.
import type {StyleXStyles} from '@stylexjs/stylex';

export function Selector(props: {
  label: string;
  containerXstyle?: StyleXStyles;
}): JSX.Element {
  return <div>{props.label}</div>;
}
