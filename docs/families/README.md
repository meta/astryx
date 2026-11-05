# Component family contracts

Family contracts own behavior shared by sibling components, such as input
sizing, end lanes, overlay dismissal, or status presentation. A component spec
links to its family instead of copying the shared rule.

New records start as `draft`. They become `current` only after explicit owner
approval. Archived records remain for context and state why they no longer
govern. Use `docs/templates/knowledge/family-contract.md`.
