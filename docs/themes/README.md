# Theme specifications

Theme specifications are the canonical owner for decisions that belong to one
published theme package: its audience and visual intent, inherited base, portable
token choices, theme-local roles, tonal palette families and selected tones,
component/state mappings, compatibility, artifact shape, and measured evidence.

Theme specifications are colocated with their package at
`packages/themes/<theme>/<theme>.spec.md`, analogous to component specs. This
page is guidance and an index, not a canonical record. Start a record from
`docs/templates/knowledge/theme-spec.md` and use an id of the form
`theme:<package-theme-name>` (for example, `theme:neutral`).

Current records:

- [Neutral](../../packages/themes/neutral/neutral.spec.md) — current
- [Stone](../../packages/themes/stone/stone.spec.md) — current
- [Gothic](../../packages/themes/gothic/gothic.spec.md) — current
- [Matcha](../../packages/themes/matcha/matcha.spec.md) — current
- [Butter](../../packages/themes/butter/butter.spec.md) — current
- [Y2K](../../packages/themes/y2k/y2k.spec.md) — current

A theme record sits between system theming architecture and consumer/component
records. It uses one typed `references` list for architecture, design, system,
and other knowledge relationships rather than separate relation fields:

- architecture and system specs own cross-theme APIs, vocabulary boundaries,
  inheritance rules, validation, compiler behavior, and shared artifact policy;
- design records own cross-theme visual and accessibility methodology, including
  how contrast evidence is judged;
- architecture/tooling owns shared measurement implementation;
- package-local theme specs own application of that methodology: selected
  token/palette mappings, required pairings/states, exceptions, measured receipts,
  and known gaps;
- component and family records own observable component behavior; and
- consumer docs own supported syntax, examples, and usage guidance.

Only `current` records are policy. A draft may link another draft while decisions
are being developed, but current records may depend only on current records.
Current theme records require approval of their content (`architecture:knowledge-contracts`
DEC-14) from the committed union of
`.github/ENGOWNERS` and `.github/DESIGNOWNERS`. Theme records do not declare an
`owners` field, and record metadata never grants approval rights.
