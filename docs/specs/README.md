# System specs

This directory contains records for consequential shared-system changes. Each
spec lives under `docs/specs/<id>-<slug>/spec.md`; an optional sibling `plan.md`
is used only for multi-step implementation.

Component and module contracts live under `docs/specs/components/`, one folder
per component, holding the core record beside each platform's
(`components/Avatar/Avatar.spec.md` and `components/Avatar/Avatar.swift.spec.md`).
[`docs/README.md`](../README.md) has the layout.

Templates live separately under `docs/templates/knowledge/`. Existing records
are validated against `docs/schemas/knowledge/`; changing a template does not
silently change accepted history.

A system spec is appropriate when work changes more than one component, a
shared primitive, architecture, public API policy, theming, accessibility
policy, distribution, or lifecycle. Focused fixes that restore an existing
contract do not need a new spec.

Only records with `authority: current` are authoritative. Draft records may
carry unresolved evidence or owner decisions; they do not govern review.
Archived records state why they no longer govern and link a replacement when
one exists. Initial promotion to `current` requires explicit owner approval.
