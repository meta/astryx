---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:<surface>
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [<owner>]
applies_to: [<path-prefix>]
verified_by: [<test-or-check>]
deciding_specs: [spec:AST-000/DEC-0]
---

# <Surface> architecture

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | `<Observable current decisions this architecture serves; write “None” when no product contract changes.>`                                    |
| System behavior         | `<Shipped system behavior, including the decisive invariant, boundary, or precedence rule.>`                                                 |
| End-user impact         | `<Who is affected, in what state, and what improves, worsens, or remains unchanged.>`                                                        |
| Builder impact          | `<Which implementation decisions, coordination work, or workarounds this architecture removes or adds.>`                                     |
| Compatibility/readiness | `<Compatibility effect; authority and implementation state; material evidence still pending.>`                                               |
| Review checks           | `<Reject specific boundary violations, mechanism leaks into product API, or lost invariants/evidence distinctions already forbidden below.>` |
| Governing rules         | `<Deciding specs and only the current clauses needed to justify this projection.>`                                                           |

This table is a review projection; the body below is authoritative.

<!-- Keep each cell compact. Architecture projects deciding product contracts but never broadens them. Review checks project settled body rules; they do not create policy. -->

## Purpose

## System model

## Boundaries and invariants

<!-- Architecture records own internal responsibility, seams, and mechanisms needed to satisfy deciding specs. They MUST NOT broaden the observable product contract beyond those current decisions. -->

- **INV1 — `<invariant>`.** `<What MUST remain true in the shipped system.>`

## Change coupling

<!-- State how code changes trigger review of this architecture and which checks prove it remains current. -->

## Owning code

- `<path or public module>` — `<responsibility>`

## Deciding specs

- `spec:AST-000/DEC-0` — `<observable behavior decision; architecture records never treat implementation evidence as product authority>`

## Verification

| Invariant | Evidence                        | Failure signal                           |
| --------- | ------------------------------- | ---------------------------------------- |
| INV1      | `<test or observable evidence>` | `<what fails when the invariant breaks>` |
