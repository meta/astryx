use super::RegisterOperand;
use crate::{
    Context, JsObject, JsValue,
    module::ModuleKind,
    vm::{ActiveRunnable, opcode::Operation},
};
use std::unreachable;

/// `NewTarget` implements the Opcode Operation for `Opcode::NewTarget`
///
/// Operation:
///  - Store the current new target in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct NewTarget;

impl NewTarget {
    #[inline(always)]
    pub(super) fn operation(dst: RegisterOperand, context: &mut Context) {
        let new_target = if let Some(new_target) = {
            let frame = context.vm.frame();
            frame
                .environments
                .get_this_environment(frame.realm.environment())
                .as_function()
                .and_then(|env| env.slots().new_target().cloned())
        } {
            new_target.into()
        } else {
            JsValue::undefined()
        };
        context.vm.set_register(dst.into(), new_target);
    }
}

impl Operation for NewTarget {
    const NAME: &'static str = "NewTarget";
    const INSTRUCTION: &'static str = "INST - NewTarget";
    const COST: u8 = 2;
}

/// `ImportMeta` implements the Opcode Operation for `Opcode::ImportMeta`
///
/// Operation:
///  - Store the current `import.meta` in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ImportMeta;

impl ImportMeta {
    #[inline(always)]
    pub(super) fn operation(dst: RegisterOperand, context: &mut Context) {
        // Meta Properties
        //
        // ImportMeta : import . meta
        //
        // https://tc39.es/ecma262/#sec-meta-properties

        // 1. Let module be GetActiveScriptOrModule().

        let Some(ActiveRunnable::Module(module)) = context.get_active_script_or_module() else {
            unreachable!("2. Assert: module is a Source Text Module Record.");
        };

        let ModuleKind::SourceText(src) = module.kind() else {
            unreachable!("2. Assert: module is a Source Text Module Record.");
        };

        // 3. Let importMeta be module.[[ImportMeta]].
        // 4. If importMeta is empty, then
        // 5. Else,
        //     a. Assert: importMeta is an Object.
        let import_meta = src
            .import_meta()
            .borrow_mut()
            .get_or_insert_with(|| {
                // a. Set importMeta to OrdinaryObjectCreate(null).
                let import_meta = JsObject::with_null_proto();

                // b. Let importMetaValues be HostGetImportMetaProperties(module).
                // c. For each Record { [[Key]], [[Value]] } p of importMetaValues, do
                //     i. Perform ! CreateDataPropertyOrThrow(importMeta, p.[[Key]], p.[[Value]]).
                // d. Perform HostFinalizeImportMeta(importMeta, module).
                context
                    .module_loader()
                    .init_import_meta(&import_meta, &module, context);

                // e. Set module.[[ImportMeta]] to importMeta.
                import_meta
            })
            .clone();

        //     b. Return importMeta.
        //     f. Return importMeta.
        context.vm.set_register(dst.into(), import_meta.into());
    }
}

impl Operation for ImportMeta {
    const NAME: &'static str = "ImportMeta";
    const INSTRUCTION: &'static str = "INST - ImportMeta";
    const COST: u8 = 6;
}
