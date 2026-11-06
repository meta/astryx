// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typed Storybook parameters for per-dimension RTL audit applicability and declared physical regions.
 * @input A story's dimension-specific applicability and rationale.
 * @output Storybook's `{rtlAudit: ...}` parameter shape.
 * @position Authoring boundary between story fixtures and the external RTL audit.
 */

/** Whether an RTL audit dimension applies to a Storybook story. */
export type RtlAuditApplicability =
  {applicable: true; reason?: string} | {applicable: false; reason: string};

/**
 * A story-declared region whose positioned elements stay physical in RTL:
 * `chart` marks a plot whose overlays follow chart coordinates
 * (`design:bidirectionality` DR5). D5 still scans the story; it expects those
 * overlays to keep their position instead of mirroring.
 */
export type RtlAuditPhysicalPosition = {physical: 'chart'; within: string};

/** Storybook parameters consumed by the rendered RTL audit. */
export type RtlAuditParameters = {
  D1?: RtlAuditApplicability;
  D5?: RtlAuditPhysicalPosition;
};

/** Type-check RTL audit parameters while preserving Storybook's parameter shape. */
export function rtlAuditParameters(rtlAudit: RtlAuditParameters): {
  rtlAudit: RtlAuditParameters;
} {
  return {rtlAudit};
}
