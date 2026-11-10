use std::path::Path;

use crate::{
    Context, JsError, Source,
    builtins::promise::PromiseState,
    module::Module,
    vm::{shadow_stack::ShadowEntry, source_info::SourcePath},
};
use indoc::indoc;

/// Helper to extract backtrace entries from a rejected module promise.
fn get_backtrace_from_rejection(
    context: &mut Context,
    js_code: &[u8],
    path: &str,
) -> Vec<ShadowEntry> {
    let source = Source::from_bytes(js_code).with_path(Path::new(path));
    let module = Module::parse(source, None, context).unwrap();
    let promise = module.load_link_evaluate(context);
    context.run_jobs().unwrap();

    match promise.state() {
        PromiseState::Rejected(err) => {
            let js_error = JsError::from_opaque(err);
            js_error
                .backtrace
                .as_ref()
                .expect("error should have a backtrace")
                .iter()
                .cloned()
                .collect()
        }
        PromiseState::Fulfilled(_) => panic!("Module should have thrown an error"),
        PromiseState::Pending => panic!("Module evaluation should not be pending"),
    }
}

/// Assert that a `ShadowEntry::Bytecode` frame matches expected function name, path, line, and column.
#[track_caller]
fn assert_bytecode_frame(
    entry: &ShadowEntry,
    expected_fn: &str,
    expected_path: &Path,
    expected_line: u32,
    expected_col: u32,
) {
    match entry {
        ShadowEntry::Bytecode { pc, source_info } => {
            assert_eq!(
                source_info.function_name().to_std_string_escaped(),
                expected_fn,
                "function name mismatch"
            );
            assert_eq!(
                source_info.map().path(),
                &SourcePath::Path(expected_path.into()),
                "path mismatch"
            );
            let pos = source_info
                .map()
                .find(*pc)
                .expect("should have a source position");
            assert_eq!(pos.line_number(), expected_line, "line number mismatch");
            assert_eq!(pos.column_number(), expected_col, "column number mismatch");
        }
        ShadowEntry::Native { .. } => panic!("expected Bytecode frame, got Native"),
    }
}

/// Assert that a `ShadowEntry` is a `Native` frame.
#[track_caller]
fn assert_native_frame(entry: &ShadowEntry) {
    assert!(
        matches!(entry, ShadowEntry::Native { .. }),
        "expected Native frame, got Bytecode"
    );
}

/// Test that errors caught by internal handlers (e.g. async module evaluation)
/// preserve their backtrace through promise rejection (`JsError` -> `JsValue` -> `JsError`).
#[test]
fn backtrace_preserved_through_promise_rejection() {
    let mut context = Context::default();
    let entries = get_backtrace_from_rejection(
        &mut context,
        indoc! {br#"
            let x = undefined;
            x()
        "#},
        "test.js",
    );

    let path = Path::new("test.js");

    // Backtrace stored bottom-up: [Native (call site), Bytecode (<main>)]
    assert_eq!(entries.len(), 2, "expected 2 backtrace entries");
    assert_native_frame(&entries[0]);
    assert_bytecode_frame(&entries[1], "<main>", path, 2, 2);
}

/// Test that nested call frames produce a full backtrace through the
/// promise rejection round-trip.
#[test]
fn nested_backtrace_preserved_through_promise_rejection() {
    let mut context = Context::default();
    let entries = get_backtrace_from_rejection(
        &mut context,
        indoc! {br#"
            function foo() {
                function baz() {
                    import.meta.non_existent()
                }
                baz()
            }

            foo()
        "#},
        "test.js",
    );

    let path = Path::new("test.js");

    // Backtrace stored bottom-up: [Native, <main>, foo, baz]
    assert_eq!(entries.len(), 4, "expected 4 backtrace entries");
    assert_native_frame(&entries[0]);
    assert_bytecode_frame(&entries[1], "<main>", path, 8, 4);
    assert_bytecode_frame(&entries[2], "foo", path, 5, 8);
    assert_bytecode_frame(&entries[3], "baz", path, 3, 33);
}

/// Test that an explicit `throw new Error(...)` inside a module also preserves
/// the backtrace through the promise rejection round-trip.
#[test]
fn explicit_throw_backtrace_preserved_through_promise_rejection() {
    let mut context = Context::default();
    let entries = get_backtrace_from_rejection(
        &mut context,
        indoc! {br#"
            function foo() {
                throw new Error("test")
            }
            foo()
        "#},
        "test.js",
    );

    let path = Path::new("test.js");

    // Backtrace stored bottom-up: [Native, <main>, foo]
    assert_eq!(entries.len(), 3, "expected 3 backtrace entries");
    assert_native_frame(&entries[0]);
    assert_bytecode_frame(&entries[1], "<main>", path, 4, 4);
    assert_bytecode_frame(&entries[2], "foo", path, 2, 11);
}

/// Sanity check: `context.eval()` errors include a backtrace (relates to
/// <https://github.com/boa-dev/boa/discussions/4475>).
#[test]
fn eval_error_has_backtrace() {
    let mut context = Context::default();
    let code = indoc! {br#"
        const a = 0;
        iWillCauseAnError
        const b = a + 1;
    "#};
    let source = Source::from_reader(code.as_slice(), Some(Path::new("test.js")));
    match context.eval(source) {
        Ok(_) => panic!("Should have thrown a ReferenceError"),
        Err(e) => {
            assert!(e.backtrace.is_some(), "eval error should have a backtrace");
            let entries: Vec<_> = e.backtrace.as_ref().unwrap().iter().collect();
            assert!(
                !entries.is_empty(),
                "backtrace should have at least one entry"
            );
        }
    }
}
