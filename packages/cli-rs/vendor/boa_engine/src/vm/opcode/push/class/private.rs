use crate::{
    Context, JsExpect, JsResult,
    builtins::function::OrdinaryFunction,
    js_str, js_string,
    object::{PrivateElement, internal_methods::InternalMethodPropertyContext},
    property::PropertyDescriptor,
    vm::opcode::{IndexOperand, Operation, RegisterOperand},
};

/// `PushClassPrivateMethod` implements the Opcode Operation for `Opcode::PushClassPrivateMethod`
///
/// Operation:
///  - Push a private method to the class.
#[derive(Debug, Clone, Copy)]
pub(crate) struct PushClassPrivateMethod;

impl PushClassPrivateMethod {
    #[inline(always)]
    pub(crate) fn operation(
        (object, prototype, value, index): (
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
            IndexOperand,
        ),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        let prototype = context.vm.get_register(prototype.into()).clone();
        let value = context.vm.get_register(value.into()).clone();
        let name = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into());

        let value = value.as_callable().js_expect("method must be callable")?;
        let prototype = prototype
            .as_object()
            .js_expect("class_prototype must be function object")?;
        let object = object
            .as_object()
            .js_expect("class must be function object")?;

        let name_string = js_string!(js_str!("#"), &name);
        let desc = PropertyDescriptor::builder()
            .value(name_string)
            .writable(false)
            .enumerable(false)
            .configurable(true)
            .build();
        value
            .__define_own_property__(
                &js_string!("name").into(),
                desc,
                &mut InternalMethodPropertyContext::new(context),
            )
            .js_expect("failed to set name property on private method")?;
        value
            .downcast_mut::<OrdinaryFunction>()
            .js_expect("method must be function object")?
            .set_home_object(prototype.clone());

        object
            .downcast_mut::<OrdinaryFunction>()
            .js_expect("class must be function object")?
            .push_private_method(
                object.private_name(name),
                PrivateElement::Method(value.clone()),
            );
        Ok(())
    }
}

impl Operation for PushClassPrivateMethod {
    const NAME: &'static str = "PushClassPrivateMethod";
    const INSTRUCTION: &'static str = "INST - PushClassPrivateMethod";
    const COST: u8 = 6;
}

/// `PushClassPrivateGetter` implements the Opcode Operation for `Opcode::PushClassPrivateGetter`
///
/// Operation:
///  - Push a private getter to the class.
#[derive(Debug, Clone, Copy)]
pub(crate) struct PushClassPrivateGetter;

impl PushClassPrivateGetter {
    #[inline(always)]
    pub(crate) fn operation(
        (object, value, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into());
        let value = context.vm.get_register(value.into());
        let name = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into());

        let value = value.as_callable().js_expect("getter must be callable")?;
        let object = object
            .as_object()
            .js_expect("class must be function object")?;

        object
            .downcast_mut::<OrdinaryFunction>()
            .js_expect("class must be function object")?
            .push_private_method(
                object.private_name(name),
                PrivateElement::Accessor {
                    getter: Some(value.clone()),
                    setter: None,
                },
            );
        Ok(())
    }
}

impl Operation for PushClassPrivateGetter {
    const NAME: &'static str = "PushClassPrivateGetter";
    const INSTRUCTION: &'static str = "INST - PushClassPrivateGetter";
    const COST: u8 = 6;
}

/// `PushClassPrivateSetter` implements the Opcode Operation for `Opcode::PushClassPrivateSetter`
///
/// Operation:
///  - Push a private setter to the class.
#[derive(Debug, Clone, Copy)]
pub(crate) struct PushClassPrivateSetter;

impl PushClassPrivateSetter {
    #[inline(always)]
    pub(crate) fn operation(
        (object, value, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into());
        let value = context.vm.get_register(value.into());
        let name = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into());

        let value = value.as_callable().js_expect("getter must be callable")?;
        let object = object
            .as_object()
            .js_expect("class must be function object")?;

        object
            .downcast_mut::<OrdinaryFunction>()
            .js_expect("class must be function object")?
            .push_private_method(
                object.private_name(name),
                PrivateElement::Accessor {
                    getter: None,
                    setter: Some(value.clone()),
                },
            );
        Ok(())
    }
}

impl Operation for PushClassPrivateSetter {
    const NAME: &'static str = "PushClassPrivateSetter";
    const INSTRUCTION: &'static str = "INST - PushClassPrivateSetter";
    const COST: u8 = 6;
}
