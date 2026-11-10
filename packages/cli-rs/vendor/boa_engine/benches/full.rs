#![allow(unused_crate_dependencies, missing_docs)]

//! Benchmarks of the whole execution engine in Boa.

use boa_engine::{
    Context, Source, context::DefaultHooks, object::shape::RootShape, optimizer::OptimizerOptions,
    realm::Realm, script::Script,
};
use criterion::{Criterion, criterion_group, criterion_main};
use std::hint::black_box;

#[cfg(all(target_arch = "x86_64", target_os = "linux", target_env = "gnu"))]
#[cfg_attr(
    all(target_arch = "x86_64", target_os = "linux", target_env = "gnu"),
    global_allocator
)]
static ALLOC: jemallocator::Jemalloc = jemallocator::Jemalloc;

fn create_realm(c: &mut Criterion) {
    c.bench_function("Create Realm", move |b| {
        let root_shape = RootShape::default();
        b.iter(|| Realm::create(&DefaultHooks, &root_shape));
    });
}

macro_rules! full_benchmarks {
    ($({$id:literal, $name:ident}),*) => {
        fn bench_parser(c: &mut Criterion) {
            $(
                {
                    static CODE: &str = include_str!(concat!("bench_scripts/", stringify!($name), ".js"));
                    let mut context = Context::default();

                    // Disable optimizations
                    context.set_optimizer_options(OptimizerOptions::empty());

                    c.bench_function(concat!($id, " (Parser)"), move |b| {
                        b.iter(|| {
                            Script::parse(
                                black_box(Source::from_bytes(CODE)),
                                None,
                                &mut context,
                            ).unwrap()
                        })
                    });
                }
            )*
        }
        fn bench_compile(c: &mut Criterion) {
            $(
                {
                    static CODE: &str = include_str!(concat!("bench_scripts/", stringify!($name), ".js"));
                    let context = &mut Context::default();

                    // Disable optimizations
                    context.set_optimizer_options(OptimizerOptions::empty());

                    let script = Script::parse(
                        black_box(Source::from_bytes(CODE)),
                        None,
                        context,
                    ).unwrap();
                    c.bench_function(concat!($id, " (Compiler)"), move |b| {
                        b.iter(|| {
                            script.codeblock(context).unwrap()
                        })
                    });
                }
            )*
        }
        fn bench_execution(c: &mut Criterion) {
            $(
                {
                    static CODE: &str = include_str!(concat!("bench_scripts/", stringify!($name), ".js"));
                    let context = &mut Context::default();

                    // Disable optimizations
                    context.set_optimizer_options(OptimizerOptions::empty());

                    let script = Script::parse(
                        black_box(Source::from_bytes(CODE)),
                        None,
                        context,
                    ).unwrap();
                    script.codeblock(context).unwrap();
                    c.bench_function(concat!($id, " (Execution)"), move |b| {
                        b.iter(|| {
                            script.evaluate(context).unwrap();
                        })
                    });
                }
            )*
        }
    };
}

full_benchmarks!(
    {"String Code Point Sum", string_code_point_sum},
    {"Symbols", symbol_creation},
    {"For loop", for_loop},
    {"Fibonacci", fibonacci},
    {"Object Creation", object_creation},
    {"Static Object Property Access", object_prop_access_const},
    {"Dynamic Object Property Access", object_prop_access_dyn},
    {"RegExp Literal Creation", regexp_literal_creation},
    {"RegExp Creation", regexp_creation},
    {"RegExp Literal", regexp_literal},
    {"RegExp", regexp},
    {"Array access", array_access},
    {"Array creation", array_create},
    {"Array pop", array_pop},
    {"String concatenation", string_concat},
    {"String comparison", string_compare},
    {"String copy", string_copy},
    {"Number Object Access", number_object_access},
    {"Boolean Object Access", boolean_object_access},
    {"String Object Access", string_object_access},
    {"Arithmetic operations", arithmetic_operations},
    {"Clean js", clean_js},
    {"Mini js", mini_js}
);

criterion_group!(
    benches,
    create_realm,
    bench_parser,
    bench_compile,
    bench_execution,
);
criterion_main!(benches);
