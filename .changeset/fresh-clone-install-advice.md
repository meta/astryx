---
'@astryxdesign/cli': patch
---

[fix] In a fresh clone whose `package.json` lists `@astryxdesign/cli`, the once-a-day hint, `doctor`, and the setup reminder now say to install the project's dependencies (such as `npm install`), not to add the CLI again. Adding it again replaced the exact version the project lists with a range, such as `^0.7.10`.

@josephfarina
