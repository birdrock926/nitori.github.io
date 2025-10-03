import { factories } from '@strapi/strapi';
import { hashIp, networkHash } from '../../../utils/comment.js';

const resolvePepper = (strapi) => {
  const keys = strapi.config.get('server.app.keys', []);
  return process.env.HASH_PEPPER || keys[0] || 'hash-pepper';
};

export default factories.createCoreController('api::ban.ban', ({ strapi }) => ({
  async createBan(ctx) {
    const { ip, net, reason, expiresAt, purge = true } = ctx.request.body || {};
    if (!ip && !net) {
      return ctx.badRequest('IP またはネットワークを指定してください');
    }
    const pepper = resolvePepper(strapi);
    const data = {
      reason,
    };
    if (ip) {
      data.ip_hash = hashIp(ip, pepper);
      data.net_hash = networkHash(ip, pepper);
    }
    if (net) {
      data.net_hash = networkHash(net, pepper);
    }
    if (expiresAt) {
      data.expiresAt = expiresAt;
    }
    const record = await strapi.entityService.create('api::ban.ban', { data });

    let removedCount = 0;
    if (purge) {
      const conditions = [];
      if (data.ip_hash) conditions.push({ ip_hash: data.ip_hash });
      if (data.net_hash) conditions.push({ net_hash: data.net_hash });
      if (conditions.length) {
        const { count } = await strapi.db.query('api::comment.comment').deleteMany({
          where: { $or: conditions },
        });
        removedCount = count || 0;
      }
    }

    return { data: { ban: record, removedCount } };
  },

  async deleteBan(ctx) {
    const { id } = ctx.params;
    if (!id) {
      return ctx.badRequest('ID が必要です');
    }
    await strapi.entityService.delete('api::ban.ban', id);
    return { ok: true };
  },
}));
