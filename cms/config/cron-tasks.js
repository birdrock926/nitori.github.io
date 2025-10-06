import dayjs from 'dayjs';

export default {
  '0 * * * *': async ({ strapi }) => {
    const nowIso = dayjs().toISOString();
    const expired = await strapi.entityService.findMany('api::ban.ban', {
      filters: {
        expiresAt: { $lt: nowIso },
      },
    });
    await Promise.all(expired.map((ban) => strapi.entityService.delete('api::ban.ban', ban.id)));
  },
};
