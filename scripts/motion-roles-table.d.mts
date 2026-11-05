// Copyright (c) Meta Platforms, Inc. and affiliates.

/** The generated table, relative to the repository root. */
export const MOTION_ROLE_TABLE: string;
/** The role ids spec:AST-094 FR4's table lists. */
export function fr4RoleIds(specText: string): string[];
/** The role ids a generated table lists. */
export function tableRoleIds(markdown: string): string[];
/** A role's default as its table measures it. */
export function describeDefault(
  kind: 'spring' | 'duration' | 'curve',
  value: unknown,
): string;
/**
 * The generated motion role table for `roles`, before formatting, and the
 * roles neither FR4 nor a component's own record names.
 */
export function renderMotionRoleTable(
  roles: ReadonlyArray<{
    id: string;
    kind: 'spring' | 'duration' | 'curve';
    value: unknown;
  }>,
  names: {
    fr4: ReadonlyArray<string>;
    records: ReadonlyArray<{id: string; text: string}>;
  },
): {source: string; unnamed: string[]};
