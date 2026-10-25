# Design specifications

Design specs record human-owned visual and interaction intent: hierarchy,
anatomy, state representation, allowed variation, and representative examples.
They may describe one component or a cross-component pattern.

## State taxonomy

State records are split by who drives the change. These are the only three
state-taxonomy records:

| Record                              | Owns                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [User states](user-states.md)       | Person-driven rest, hover, press, focus, selection, and manipulation states                                  |
| [System states](system-states.md)   | System-driven disabled, loading, processing, status, and transient feedback states                           |
| [Agentic states](agentic-states.md) | Agent-driven thinking, streaming, tool execution, waiting, synchronization, inspection, and rendering states |

## Other records

| Record                                                            | Owns                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Spatial hierarchy](spatial-hierarchy.md)                         | Perceptual grouping through proximity, spacing tiers, and alignment                  |
| [Control rhythm](control-rhythm.md)                               | Alignment and density relationships among mixed controls                             |
| [Shape relationships](shape-relationships.md)                     | Role-based and concentric geometry for nested surfaces                               |
| [Elevation hierarchy](elevation-hierarchy.md)                     | Agreement between perceived depth and actual layer order                             |
| [Typography hierarchy](typography-hierarchy.md)                   | Legible, distinguishable text roles across themes and layouts                        |
| [Iconography](iconography.md)                                     | Icon meaning, size, artwork, color, composition, and accessibility                   |
| [Color emphasis](color-emphasis.md)                               | Semantic color roles, contrast intent, and local emphasis                            |
| [Motion](motion.md)                                               | Meaningful movement, timing hierarchy, and easing intent                             |
| [Reduced motion](reduced-motion.md)                               | Cross-fade on touch and immediate change otherwise under reduced motion              |
| [Ordered collection reordering](ordered-collection-reordering.md) | Drag preview, candidate insertion, commit, and settle intent for ordered collections |
| [Template composition](template-composition.md)                   | Page- and block-level layout, hierarchy, spacing, component fidelity, and theming    |

Create a separate record when a subject has a different owner, approval
lifecycle, requirement set, evidence set, or reason to change independently.
Keep implementation mechanics, public API syntax, audit results, and consumer
usage outside these records and link to their canonical owners instead.

Design specs do not own implementation mechanics, public prop syntax, current
audit results, or consumer usage guidance. Component and family contracts link
to stable design requirement IDs instead of copying their rationale.

Public-safe normative screenshots, diagrams, and visual state references live
under `docs/design/assets/<design-id>/`. Each referenced asset records alt text,
state, theme/mode, viewport when relevant, and what decision it demonstrates.
Generated audit screenshots remain audit evidence rather than design authority.
Private design sources stay private and are never named or linked here.

New design specs start as `draft`. Initial promotion to `current`, later changes,
and normative asset updates require exact-head approval from any current member
of `.github/ENGOWNERS` or `.github/DESIGNOWNERS`. A mixed PR still needs an
ENGOWNER for non-design current records. The design record names its content
owners separately from this repository gate.

A DESIGNOWNER author may attest the exact PR head for the design-approval group
by marking it ready for review. That evidence also counts in a mixed PR, while
every other applicable code or spec-owner group remains required. The existing
gate may enable squash auto-merge only when every changed path is a recognized
spec record, every required group has approved, and all branch checks pass.
Normative assets and indexes are outside that scope; any code path prevents the
spec-only auto-merge path.

Use `docs/templates/knowledge/design-spec.md`.
