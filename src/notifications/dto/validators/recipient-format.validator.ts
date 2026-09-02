import {
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isValidRecipientFormat', async: false })
export class IsValidRecipientFormatConstraint implements ValidatorConstraintInterface {
    validate(recipient: string, args: ValidationArguments) {
        const dto = args.object as any;
        const channel = dto.channel || 'email';

        switch (channel) {
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
            case 'phone':
                return /^\+?[1-9]\d{1,14}$/.test(recipient);
            case 'slack':
                return /^#[a-z0-9_-]+$/.test(recipient);
            default:
                return false;
        }
    }

    defaultMessage(args: ValidationArguments) {
        const dto = args.object as any;
        return `Invalid recipient format for channel "${dto.channel || 'email'}"`;
    }
}