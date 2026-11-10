mod constant_folding;
mod dead_code_elimination;
mod strength_reduction;

pub(crate) use constant_folding::ConstantFolding;
pub(crate) use dead_code_elimination::DeadCodeElimination;
pub(crate) use strength_reduction::StrengthReduction;
