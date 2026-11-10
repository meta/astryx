//! Boa's implementation of ECMAScript's `Environment Records`.
//!
//! Environments contain the bindings of identifiers to their values.
//! The implementation differs from the methods defined by the specification,
//! but the resulting behavior should be the same.
//!
//! To make the runtime more performant, environment specific behavior is split
//! between bytecode compilation and the runtime.
//! While the association of identifiers to values seems like a natural fit for a hashmap,
//! lookups of the values at runtime are very expensive.
//! Environments can also have outer environments.
//! In the worst case, there are as many hashmap lookups, as there are environments.
//!
//! To avoid these costs, hashmaps are not used at runtime.
//! At runtime, environments are represented as fixed size lists of binding values.
//! The positions of the bindings in these lists is determined at bytecode compile time.
//!
//! A binding is uniquely identified by two indices:
//!  - An environment index, that identifies the environment in which the binding exists
//!  - A binding index, that identifies the binding in the environment
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-environment-records

mod runtime;

pub(crate) use runtime::{
    DeclarativeEnvironment, Environment, EnvironmentStack, FunctionSlots, PrivateEnvironment,
    SavedEnvironments, ThisBindingStatus,
};

#[cfg(test)]
mod tests;
