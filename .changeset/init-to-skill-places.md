---
'@astryxdesign/cli': patch
---

[feat] `astryx init --to <places>` puts the Astryx skill where your agents read it: `agents-md` (the AGENTS.md block, still the default), `skills` (the `astryx-project` skill in `.agents/skills` and `.claude/skills` in the project, named apart from the computer's `astryx` skill so neither hides the other), `user` (this computer, the same as `--user`), or a folder written as a path. The choice is saved: in astryx.config `skills.to` for the project, so a later `astryx init` writes the same places, and in the settings file for a folder outside it, whose copy the CLI installed for the computer refreshes after each of its upgrades while it is there (delete the copy to stop it). Moving a project to another place removes the skill from the old one. `astryx init` with no `--to` and nothing saved writes exactly what it wrote before.

@josephfarina
