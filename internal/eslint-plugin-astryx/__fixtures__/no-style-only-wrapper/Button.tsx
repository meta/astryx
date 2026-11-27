// Copyright (c) Meta Platforms, Inc. and affiliates.

// A component that takes `xstyle`.
import type {StyleXStyles} from '@stylexjs/stylex';

export function Button(props: {
  label: string;
  xstyle?: StyleXStyles;
}): JSX.Element {
  return <button type="button">{props.label}</button>;
}
