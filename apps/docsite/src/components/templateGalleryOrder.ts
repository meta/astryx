// Copyright (c) Meta Platforms, Inc. and affiliates.

export function sortTemplatesByTitle<T extends {name: string}>(
  templates: readonly T[],
): T[] {
  return [...templates].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
