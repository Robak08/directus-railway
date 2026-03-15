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
        input.subject = 'Kutsu Krakovan Opas -tapahtumaamme on valmis';
        break;
      case 'password-reset':
        input.subject = 'Pyysi salasanan vaihtoa Krakovan Opas -portaalissa';
        break;
      default:
        break;
    }

    return input;
  });
});
