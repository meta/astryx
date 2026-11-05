<!-- Use this template only when the primary intent is to restore broken behavior. -->

## User impact

<!-- Who encounters the defect, in what supported state, what fails, and what does the restoration enable or prevent? -->

## Problem and solution fit

<!-- Ask why three times: why does the defect occur, why does it harm the task, and why does that harm matter? Explain how the narrow fix addresses that chain. -->

## Expected behavior and authority

<!-- Link the current contract, standard, documented promise, or regression history that defines the expected outcome. -->

## Smallest restoration

<!-- Explain the narrow fix. Remove or split new API, visual affordances, layout changes, cleanup, and other tagalongs. -->

## Evidence

- Reproduction before the change:
- Result after the change:
- Representative unchanged path:
- Regression test or other mutation-sensitive proof:

## Scope

- [ ] One defect is restored.
- [ ] Separable contradictory or unsettled tagalongs were removed or split.
- [ ] No new public API, visual representation, default, or interaction model is hidden under the bug-fix label.
- [ ] Public text and artifacts contain no internal Meta context.

## Testing

<!-- Commands and real-browser states where behavior depends on layout, pixels, focus, scrolling, hit testing, or input modality. -->
