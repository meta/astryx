# <Name> (<language>)

<!-- Copy into the component's folder as <Name>.spec.md (Swift:
packages/native/apple/Sources/Astryx/<Name>/<Name>.spec.md). Fill every section;
write "None" rather than deleting one. Present tense: describe what the
component does, not how it was decided. Rules: AST-093. -->

## Summary

<!-- One to three sentences: who uses this component, in what situation, and
what they get. -->

## Contract

- Core component: `<Name>` (core contract in `packages/native/src/components/<Name>.ts`).
- Platforms: `<ios | macos>`.
- Platform props: <!-- props only this platform offers, or "None". Never rename
  or change a core prop. -->

## Native control

<!-- The platform control this is built on (SwiftUI first, then UIKit or
AppKit). If the component draws its own control, name the platform control you
looked for and why it does not fit. -->

## Platform guidelines

<!-- The Apple Human Interface Guidelines pages this follows, and what each one
decides here: hit target, Dynamic Type, SF Symbols, materials, motion and
Reduce Motion, haptics. -->

## Brand through the theme

| What           | Theme value                           |
| -------------- | ------------------------------------- |
| <!-- color --> | <!-- token or native theme member --> |

<!-- Every brand value the component reads. Nothing here is hard-coded. -->

## States

<!-- Every state the core contract names (default, pressed, disabled, loading,
error, ...) and how each looks and behaves on this platform. -->

## Accessibility

<!-- VoiceOver label, traits, and value for each state; focus behavior; what is
announced. These come from the core contract. -->

## Test and validation

- Unit tests: <!-- what the package's test target covers -->
- Contract: parameters match the generated contract; drift tests pass.
- Accessibility: <!-- assertions, and the largest Dynamic Type check -->
- Theme: renders from two different themes with no value of its own.
- Captures: every state, light and dark, largest text size, from a simulator or
  device. <!-- list anything not measured -->

## Open questions

<!-- Unanswered questions only, or "None". -->
