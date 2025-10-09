import admin from './admin/src';

export default {
  register(app) {
    admin.register?.(app);
  },
  bootstrap(app) {
    admin.bootstrap?.(app);
  },
  async registerTrads(args) {
    if (typeof admin.registerTrads === 'function') {
      return admin.registerTrads(args);
    }
    return [];
  },
};
