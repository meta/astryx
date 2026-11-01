// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typed Storybook parameters for per-dimension RTL audit applicability.
 * @input A story's dimension-specific applicability and rationale.
 * @output Storybook's `{rtlAudit: ...}` parameter shape.
 * @position Authoring boundary between story fixtures and the external RTL audit.
 */

/** Whether an RTL audit dimension applies to a Storybook story. */
export type RtlAuditApplicability =
  {applicable: true; reason?: string} | {applicable: false; reason: string};

/** Storybook parameters consumed by the rendered RTL audit. */
export type RtlAuditParameters = {
  D1?: RtlAuditApplicability;
};

/** Type-check RTL audit parameters while preserving Storybook's parameter shape. */
export function rtlAuditParameters(rtlAudit: RtlAuditParameters): {
  rtlAudit: RtlAuditParameters;
} {
  return {rtlAudit};
}
