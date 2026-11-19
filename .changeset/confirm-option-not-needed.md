---
'@astryxdesign/cli': patch
---

[fix] An option that answers a question in other tools (`--yes`, `-y`, `--assume-yes`, `--non-interactive`, `--no-interactive`, `--no-input`) now gets a direct answer: no Astryx command asks a question, so the error says the option is not needed and names the same command without it (`Run: npx astryx init`). On `upgrade`, which writes only with `--apply`, it names the `--apply` run first and the preview run second (a `--list` run keeps the plain answer). Before, `astryx init --yes` listed init's options and pointed at `init --help`, so an agent spent a step reading help before it ran plain `init`.

@josephfarina
