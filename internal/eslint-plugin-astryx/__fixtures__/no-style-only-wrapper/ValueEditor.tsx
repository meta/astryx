// Copyright (c) Meta Platforms, Inc. and affiliates.

// An internal editor with no style prop.
export function ValueEditor(props: {value: string}): JSX.Element {
  return <input defaultValue={props.value} />;
}
