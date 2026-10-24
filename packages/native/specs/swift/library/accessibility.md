# Accessibility contract (Swift)

- Status: draft
- Relation: extends AST-093 FR3 and FR5. Applies the core accessibility
  records AST-085 (focusable disabled controls) and AST-086 (status
  announcements) to VoiceOver and Apple's accessibility settings.

## Summary

A VoiceOver user hears the same name, role, state, and messages from an Astryx
component on iPhone as a screen-reader user hears on the web: a message that
appears is announced once, and one already on screen when it opens is not. People
who turn on Reduce Motion, Reduce Transparency, Bold Text, Button Shapes, or
Differentiate Without Color get components that honor each setting.

## Requirements

- **X1 — Name, role, and state come from the core contract.** The contract's
  accessible name becomes `accessibilityLabel`, its role becomes the matching
  trait (`.isButton`, `.isHeader` with `accessibilityHeading`, `.isToggle`,
  `.isSelected`, `.isLink`), and its value becomes `accessibilityValue`. A
  component built on a SwiftUI control keeps that control's own traits and
  adds none that duplicate them. A custom control that has a system
  counterpart exposes it with `accessibilityRepresentation`.
- **X2 — Disabled controls stay reachable (AST-085).** A disabled control stays
  in the VoiceOver order and is read as dimmed. When the contract gives a
  reason, it is the control's `accessibilityHint`.
- **X3 — Announcements follow AST-086.** A component AST-086 FR11 covers
  announces its own message with `AccessibilityNotification.Announcement` once
  when it appears or its words change after its screen has loaded, and not
  when it is present as the screen loads, except a message that VoiceOver can
  reach only through its announcement, which announces even as the screen
  loads (FR11). Errors and time-critical failures are announced at high
  priority (FR5), and re-rendering the same message does not announce it again
  (FR6). Banner, FieldStatus, and a grouped field's status keep their own
  rules, as FR11 says: Banner's status is visual only and the Banner never
  announces itself; the app announces an outcome when it happens
  (`component:Banner` FR8).
- **X4 — Icons are decorative unless labeled (AST-082 FR17).** An icon is
  hidden from VoiceOver unless it carries a label. An icon-only control
  requires a label.
- **X5 — One element per thing a person reads.** A component that reads as one
  thing, such as a banner or a list row, is one accessibility element. Every
  action reachable only by a gesture (swipe, long press, drag) is also an
  `accessibilityAction`.
- **X6 — Settings are honored.**
  - Reduce Motion: movement becomes a cross-fade or no animation.
  - Reduce Transparency: translucent surfaces become opaque.
  - Bold Text: weights come from system or text-style fonts, so they follow
    `legibilityWeight`.
  - Differentiate Without Color: every state shown by color also has a shape,
    an icon, or a word.
  - Button Shapes: controls drawn without a visible edge show one.
- **X7 — Targets are at least 44 by 44 points,** even when the drawn control is
  smaller.

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1          | Unit tests assert each component's label, traits, and value in every state its contract names.                                                                                                                                                                                                                                                                                                               |
| X2          | A test disables a focused control and finds it still focused, read as dimmed, with its reason as the hint.                                                                                                                                                                                                                                                                                                   |
| X3          | A test shows a covered component's message after load and observes exactly one announcement, at high priority for an error; a time-critical failure is also high priority; a second render announces nothing; the same message present at load announces nothing; a Banner shown after load announces nothing. A message VoiceOver can reach only through its announcement, present at load, announces once. |
| X4, X5      | A UI test runs `performAccessibilityAudit()` on a screen of every component at the default and largest text sizes, with no failures.                                                                                                                                                                                                                                                                         |
| X6          | Captures under Reduce Motion show no movement; under Reduce Transparency, opaque surfaces; under Bold Text, heavier text in every component; under Differentiate Without Color, every state shown by color also shows a shape, an icon, or a word; under Button Shapes, every control drawn without a visible edge shows one.                                                                                |
| X7          | The audit's hit-region check passes for every control.                                                                                                                                                                                                                                                                                                                                                       |

## Current state

- On `main`, the Swift package `packages/native/apple` holds generated props,
  the wire, and the logic host, and no SwiftUI views.
- No Swift component has accessibility tests or an audit.

## Open questions

- **OQ1 — Who words the spoken status and state?** Recommendation: the library,
  in its own String Catalog, with the same meaning as core's default strings
  on the web.

## References

- HIG, Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- HIG, VoiceOver: https://developer.apple.com/design/human-interface-guidelines/voiceover
- `accessibilityRepresentation`: https://developer.apple.com/documentation/swiftui/view/accessibilityrepresentation(representation:)
- `AccessibilityNotification.Announcement`: https://developer.apple.com/documentation/accessibility/accessibilitynotification/announcement
- WWDC24, Catch up on accessibility in SwiftUI: https://developer.apple.com/videos/play/wwdc2024/10073/
- WWDC23, Perform accessibility audits for your app: https://developer.apple.com/videos/play/wwdc2023/10035/
