---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[fix] The setup reminder now says why to run `init` now: "Astryx is not set up in this project yet. Next step: run `npx astryx init` now, before you write Astryx code. It asks no questions, prints the getting-started steps, and saves the Astryx guide to AGENTS.md." Before, it said `init` would "install the Astryx agent prompt", which agents read as a file change the user did not ask for, so they kept working without it. The command it names is unchanged, and so are the places it prints.

@josephfarina
