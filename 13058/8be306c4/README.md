# #13058 Toast text: main c1eeb636 vs head 8be306c4

Real Google Chrome 157 (headless), DPR 2, Storybook `core-toast--types` built at each revision: an info and an error toast on a light and a dark page. Contrast is the card text's computed colour on the card's computed fill. Frames: `toast-<side>-<theme>-<mode>.png`.

| Theme | Page | Toast | Card side | Fill | Text main → head | Contrast main → head |
| --- | --- | --- | --- | --- | --- | --- |
| none | dark | error | dark | `rgb(227, 25, 59)` | `rgb(223, 226, 229)` → `rgb(255, 255, 255)` | 3.61 → **4.7** |
| none | dark | info | light | `rgb(255, 255, 255)` | `rgb(10, 19, 23)` → `rgb(0, 0, 0)` | 18.78 → **21** |
| none | light | error | dark | `rgb(170, 7, 30)` | `rgb(223, 226, 229)` → `rgb(255, 255, 255)` | 5.85 → **7.61** |
| none | light | info | dark | `rgb(10, 19, 23)` | `rgb(223, 226, 229)` → `rgb(255, 255, 255)` | 14.44 → **18.78** |
| neutral | dark | error | off | `rgb(227, 25, 59)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 4.7 → 4.7 |
| neutral | dark | info | light | `rgb(255, 255, 255)` | `rgb(17, 17, 17)` → `rgb(17, 17, 17)` | 18.88 → 18.88 |
| neutral | light | error | dark | `rgb(170, 7, 30)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 7.61 → 7.61 |
| neutral | light | info | dark | `rgb(10, 19, 23)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 18.78 → 18.78 |
| stone | dark | error | dark | `rgb(227, 25, 59)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 4.7 → 4.7 |
| stone | dark | info | light | `rgb(240, 240, 249)` | `rgb(37, 37, 42)` → `rgb(37, 37, 42)` | 13.46 → 13.46 |
| stone | light | error | dark | `rgb(170, 7, 30)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 7.61 → 7.61 |
| stone | light | info | dark | `rgb(37, 37, 42)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 15.25 → 15.25 |
| butter | dark | error | dark | `rgb(227, 25, 59)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 4.7 → 4.7 |
| butter | dark | info | light | `rgb(253, 251, 228)` | `rgb(29, 28, 17)` → `rgb(29, 28, 17)` | 16.39 → 16.39 |
| butter | light | error | dark | `rgb(170, 7, 30)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 7.61 → 7.61 |
| butter | light | info | dark | `rgb(29, 28, 17)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 17.12 → 17.12 |
| chocolate | dark | error | dark | `rgb(227, 25, 59)` | `rgb(255, 252, 247)` → `rgb(255, 252, 247)` | 4.59 → 4.59 |
| chocolate | dark | info | light | `rgb(237, 228, 212)` | `rgb(74, 53, 32)` → `rgb(74, 53, 32)` | 9.14 → 9.14 |
| chocolate | light | error | dark | `rgb(170, 7, 30)` | `rgb(255, 252, 247)` → `rgb(255, 252, 247)` | 7.44 → 7.44 |
| chocolate | light | info | dark | `rgb(74, 53, 32)` | `rgb(255, 252, 247)` → `rgb(255, 252, 247)` | 11.27 → 11.27 |
| gothic | dark | error | off | `rgb(130, 94, 89)` | `rgb(232, 241, 246)` → `rgb(232, 241, 246)` | 4.97 → 4.97 |
| gothic | dark | info | light | `rgb(232, 241, 246)` | `rgb(16, 19, 20)` → `rgb(16, 19, 20)` | 16.3 → 16.3 |
| gothic | light | error | off | `rgb(130, 94, 89)` | `rgb(232, 241, 246)` → `rgb(232, 241, 246)` | 4.97 → 4.97 |
| gothic | light | info | light | `rgb(232, 241, 246)` | `rgb(16, 19, 20)` → `rgb(16, 19, 20)` | 16.3 → 16.3 |
| matcha | dark | error | dark | `rgb(227, 25, 59)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 4.7 → 4.7 |
| matcha | dark | info | light | `rgb(192, 203, 169)` | `rgb(62, 72, 29)` → `rgb(62, 72, 29)` | 5.75 → 5.75 |
| matcha | light | error | dark | `rgb(170, 7, 30)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 7.61 → 7.61 |
| matcha | light | info | dark | `rgb(62, 72, 29)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 9.77 → 9.77 |
| y2k | dark | error | dark | `rgb(227, 25, 59)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 4.7 → 4.7 |
| y2k | dark | info | light | `rgb(237, 239, 252)` | `rgb(45, 36, 27)` → `rgb(45, 36, 27)` | 13.3 → 13.3 |
| y2k | light | error | dark | `rgb(170, 7, 30)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 7.61 → 7.61 |
| y2k | light | info | dark | `rgb(45, 36, 27)` | `rgb(255, 255, 255)` → `rgb(255, 255, 255)` | 15.22 → 15.22 |
