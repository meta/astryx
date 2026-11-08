// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Fixture: a component doc that has BOTH a default export and a named `docs`
 * export. The default export must win (same precedence as loadComponentDoc).
 */
export default {
  type: 'component',
  name: 'DefaultWinsCard',
  description: 'From the default export.',
  props: [{name: 'priority', type: 'number', description: 'Priority level.'}],
};

export const docs = {
  type: 'component',
  name: 'NamedLosesCard',
  description: 'From the named export — must NOT be returned.',
  props: [],
};
