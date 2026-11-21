---
'@astryxdesign/cli': patch
---

[feat] An integration can ship a skill: a doc that sets `skill: {name, description}` becomes a skill of its own in every app that keeps the Astryx skill in a skills folder (`astryx init --to skills`), and the AGENTS.md block gets one line that names it and points to `astryx docs skills/<name>`. `astryx docs skills` lists every skill a folder has (the project skill, the computer skill, and each integration skill), and `astryx docs skills/<name>` reads one. `astryx upgrade --apply` refreshes integration skills and removes one an integration no longer declares, `astryx doctor` checks them, and `astryx discover` lists them. A skill that breaks a rule (its name, a repeated name, its description) is left out with a note, and its doc still loads. `agentDocs.append` keeps working as before, and a project whose integrations declare no skill gets exactly the block it got before.

@josephfarina
