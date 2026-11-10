#![allow(unused_crate_dependencies)]
//! A test that mimics the GCD example from wasmtime.
//! See: <https://docs.wasmtime.dev/examples-rust-gcd.html#gcdrs>.
//! This is a good point to discuss and improve on the usability
//! of the [`boa_engine`] API.

// You can execute this example with `cargo run --example gcd`

use boa_engine::{Context, Module, js_string};
use boa_parser::Source;
use std::path::PathBuf;

#[test]
fn gcd() {
    let assets_dir =
        PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("tests/assets");

    // Create the engine.
    let context = &mut Context::default();

    // Load the JavaScript code.
    let gcd_path = assets_dir.join("gcd.js");
    let source = Source::from_filepath(&gcd_path).unwrap();
    let module = Module::parse(source, None, context).unwrap();
    module
        .load_link_evaluate(context)
        .await_blocking(context)
        .unwrap();

    let js_gcd = module
        .get_typed_fn::<(i32, i32), i32>(js_string!("gcd"), context)
        .unwrap();

    assert_eq!(js_gcd.call(context, (6, 9)), Ok(3));
    assert_eq!(js_gcd.call(context, (9, 6)), Ok(3));
}
