//! The ShadCN composition lane of `upgrade`: receipts, source variants and
//! the three-way merge.

pub mod diff3;
pub mod receipt;
pub mod source_variants;
pub mod ts_enum;
pub mod ts_strip;

#[cfg(test)]
mod dev_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod registry_tests;
