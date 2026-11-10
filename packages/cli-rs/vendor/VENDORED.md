# Vendored crates

## boa_engine 0.22.0

Source: the `boa_engine` 0.22.0 crate as published (license: Unlicense OR
MIT; see `boa_engine/LICENSE-MIT` and `boa_engine/LICENSE-UNLICENSE`). Wired
in with `[patch.crates-io]` in `../Cargo.toml`.

Why: the clone's output must match Node's byte for byte, and user code run in
the engine can surface engine error messages. These patches make Boa's
runtime errors read as V8 words them. `src/js/testdata/runtime.json` (recorded
from Node by `src/js/testdata/runtime-oracle.mjs`) checks them.

Patches (all marked by a reference to `crate::v8_messages` or `v8_names`):

- `src/v8_messages.rs` (new): V8 message builders.
- `src/bytecompiler/v8_names.rs` (new): prints an expression as V8 prints it
  in error messages (`o.a.b`, `a.b(...).c`, `o[k]`, `(intermediate value)`),
  and builds message templates for call, `new`, iteration and destructuring
  sites. The compiler records them per instruction (`ByteCompiler::v8_names`
  → `CodeBlock::v8_names`, keyed by the bytecode position after the
  instruction).
- `bytecompiler/mod.rs`, `expression/mod.rs`, `statement/loop.rs`,
  `declaration/declaration_pattern.rs`: record templates at calls, `new`,
  tagged templates, optional-chain calls, `for…of`, array and call spread,
  object and array patterns.
- `vm/code_block.rs`: `v8_names` field and `v8_message` lookup.
- `vm/opcode/call`, `vm/opcode/new`: non-callable / non-constructor values
  throw "x is not a function" / "x is not a constructor".
- `vm/opcode/iteration/get.rs`, `builtins/iterable/mod.rs`: "x is not
  iterable" (and V8's builtin form).
- `vm/opcode/value/mod.rs`: "Cannot destructure property 'a' of 'x' as it is
  undefined."
- `vm/opcode/get/property.rs`, `vm/opcode/set/property.rs`: "Cannot read /
  set properties of undefined (reading 'x')"; strict failed sets ("Cannot
  assign to read only property …", "Cannot add property …").
- `value/mod.rs`: "Cannot convert undefined or null to object", symbol to
  string.
- `vm/opcode/get/name.rs`: TDZ reads ("Cannot access 'x' before
  initialization").
- `vm/opcode/set/name.rs`: "Assignment to constant variable."
- `vm/mod.rs`: stack/recursion limits throw a catchable RangeError "Maximum
  call stack size exceeded" (V8 behavior) instead of an uncatchable engine
  error.
- `vm/opcode/binary_ops/mod.rs`, `value/operations.rs`: `in` / `instanceof`
  / BigInt mixing wording.
- `builtins/array`, `builtins/map`, `builtins/set`: non-callable callbacks
  ("number 5 is not a function"), "Invalid array length", reduce of empty
  array.
- `builtins/json/mod.rs`: "Converting circular structure to JSON" with V8's
  path lines; BigInt serialization.
- `builtins/regexp/mod.rs`: "Invalid regular expression: /p/f: reason" and
  invalid flags.
- `builtins/bigint`, `builtins/number`, `builtins/string`, `builtins/uri`,
  `builtins/object`, `builtins/function`, `builtins/weak_map`,
  `builtins/weak_set`, `object/operations.rs`: assorted V8 wordings
  (BigInt from a fraction, radix, repeat count, URI malformed,
  setPrototypeOf, class constructor call, weak keys, private members,
  defineProperty).
