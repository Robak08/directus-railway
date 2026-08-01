import { defineHook } from '@directus/extensions-sdk';

type EmailPayload = {
    subject?: string;
    template?: {
        name?: string;
    };
};

export default defineHook(({ filter }) => {
    filter('email.send', async (input: EmailPayload) => {
        const templateName = input?.template?.name;

        switch (templateName) {
            case 'user-invitation':
                input.subject = 'Tervetuloa Krakovan Oppaaseen';
                break;
            case 'password-reset':
                input.subject = 'Salasanan vaihto — Krakovan Opas';
                break;
            default:
                break;
        }

        return input;
    });
});