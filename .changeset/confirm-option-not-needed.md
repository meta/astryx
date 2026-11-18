---
'@astryxdesign/cli': patch
---

[fix] An option that answers a question in other tools (`--yes`, `-y`, `--assume-yes`, `--non-interactive`, `--no-interactive`, `--no-input`) now gets a direct answer: no Astryx command asks a question, so the error says the option is not needed and names the same command without it (`Run: npx astryx init`). On `upgrade` and `gap-report`, which go ahead only with `--apply` and `--confirm-public`, it names that option first and the preview run second. Before, `astryx init --yes` listed init's options and pointed at `init --help`, so an agent spent a step reading help before it ran plain `init`.

@josephfarina
