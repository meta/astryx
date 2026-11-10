use crate::{
    Context, JsExpect, JsResult,
    builtins::function::{OrdinaryFunction, set_function_name},
    object::internal_methods::InternalMethodPropertyContext,
    property::PropertyDescriptor,
    vm::opcode::{IndexOperand, Operation, RegisterOperand},
};

/// `DefineClassStaticMethodByName` implements the Opcode Operation for `Opcode::DefineClassStaticMethodByName`
///
/// Operation:
///  - Defines a class method by name.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassStaticMethodByName;

impl DefineClassStaticMethodByName {
    #[inline(always)]
    pub(crate) fn operation(
        (function, class, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let class = context.vm.get_register(class.into()).clone();
        let class = class.as_object().js_expect("class must be object")?;
        let key = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into())
            .into();
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, None, context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class.clone());
        }

        class.define_method_property(
            key,
            function.clone(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for DefineClassStaticMethodByName {
    const NAME: &'static str = "DefineClassStaticMethodByName";
    const INSTRUCTION: &'static str = "INST - DefineClassStaticMethodByName";
    const COST: u8 = 6;
}

/// `DefineClassMethodByName` implements the Opcode Operation for `Opcode::DefineClassMethodByName`
///
/// Operation:
///  - Defines a class method by name.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassMethodByName;

impl DefineClassMethodByName {
    #[inline(always)]
    pub(crate) fn operation(
        (function, class_proto, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let class_proto = context.vm.get_register(class_proto.into()).clone();
        let class_proto = class_proto.as_object().js_expect("class must be object")?;
        let key = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into())
            .into();
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, None, context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class_proto.clone());
        }

        class_proto.define_method_property(
            key,
            function.clone(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for DefineClassMethodByName {
    const NAME: &'static str = "DefineClassMethodByName";
    const INSTRUCTION: &'static str = "INST - DefineClassMethodByName";
    const COST: u8 = 6;
}

/// `DefineClassStaticMethodByValue` implements the Opcode Operation for `Opcode::DefineClassStaticMethodByValue`
///
/// Operation:
///  - Defines a class method by value.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassStaticMethodByValue;

impl DefineClassStaticMethodByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (function, key, class): (RegisterOperand, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let class = context.vm.get_register(class.into()).clone();
        let class = class.as_object().js_expect("class must be object")?;
        let key = key.to_property_key(context)?;
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, None, context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class.clone());
        }

        class.define_property_or_throw(
            key,
            PropertyDescriptor::builder()
                .value(function.clone())
                .writable(true)
                .enumerable(false)
                .configurable(true)
                .build(),
            context,
        )?;
        Ok(())
    }
}

impl Operation for DefineClassStaticMethodByValue {
    const NAME: &'static str = "DefineClassStaticMethodByValue";
    const INSTRUCTION: &'static str = "INST - DefineClassStaticMethodByValue";
    const COST: u8 = 6;
}

/// `DefineClassMethodByValue` implements the Opcode Operation for `Opcode::DefineClassMethodByValue`
///
/// Operation:
///  - Defines a class method by value.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassMethodByValue;

impl DefineClassMethodByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (function, key, class_proto): (RegisterOperand, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let class_proto = context.vm.get_register(class_proto.into()).clone();
        let class_proto = class_proto.as_object().js_expect("class must be object")?;
        let key = key.to_property_key(context)?;
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, None, context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class_proto.clone());
        }

        class_proto.define_method_property(
            key,
            function.clone(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for DefineClassMethodByValue {
    const NAME: &'static str = "DefineClassMethodByValue";
    const INSTRUCTION: &'static str = "INST - DefineClassMethodByValue";
    const COST: u8 = 6;
}
