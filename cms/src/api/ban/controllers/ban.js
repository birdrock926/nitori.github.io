import { factories } from '@strapi/strapi';
import { hashIp, networkHash } from '../../../utils/comment.js';

const resolvePepper = (strapi) => {
  const keys = strapi.config.get('server.app.keys', []);
  return process.env.HASH_PEPPER || keys[0] || 'hash-pepper';
};

export default factories.createCoreController('api::ban.ban', ({ strapi }) => ({
  async createBan(ctx) {
    const { ip, net, reason, expiresAt } = ctx.request.body || {};
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
    return { data: record };
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
