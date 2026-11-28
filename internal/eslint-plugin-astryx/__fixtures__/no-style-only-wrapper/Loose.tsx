// Copyright (c) Meta Platforms, Inc. and affiliates.

// Components whose props name no property the rule can read: `any`, and an
// index signature. The rule counts them as taking `xstyle`.
export function LooseAny(props: any): JSX.Element {
  return <div>{String(props)}</div>;
}

export function LooseIndex(props: {[key: string]: unknown}): JSX.Element {
  return <div>{Object.keys(props).length}</div>;
}
