---
'@astryxdesign/cli': patch
---

[fix] Kept catalogs and check results no longer depend on the value of every environment variable when code only lists the variables' names (as a TypeScript transform does). Tools that set a new value per call, such as AI agent harnesses, missed every kept answer on every call; they now hit like any other run. A variable whose value is read still decides the kept answer, including one read inside a kept gather that another one wraps.

@josephfarina
