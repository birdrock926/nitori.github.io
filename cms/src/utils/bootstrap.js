const COMMENT_TABLE = 'comments';

const ensureColumn = async (knex, columnName, createFn) => {
  const hasColumn = await knex.schema.hasColumn(COMMENT_TABLE, columnName);
  if (hasColumn) {
    return false;
  }
  await knex.schema.alterTable(COMMENT_TABLE, createFn);
  return true;
};

export const ensureCommentSchema = async (strapi) => {
  const knex = strapi?.db?.connection;
  if (!knex || !knex.schema?.hasTable) {
    strapi.log.warn('[bootstrap] コメントテーブルを検査できませんでした');
    return;
  }

  const hasTable = await knex.schema.hasTable(COMMENT_TABLE);
  if (!hasTable) {
    return;
  }

  let updatedRows = 0;

  const addedStatus = await ensureColumn(knex, 'status', (table) => {
    table.string('status', 16).notNullable().defaultTo('pending');
  });
  if (addedStatus) {
    updatedRows += await knex(COMMENT_TABLE)
      .whereNull('status')
      .orWhere('status', '')
      .update({ status: 'pending' });
  }

  await ensureColumn(knex, 'meta', (table) => {
    table.json('meta');
  });

  if (updatedRows) {
    strapi.log.info(`[bootstrap] コメント ${updatedRows} 件の status を pending へ補正しました`);
  }
};

const COMMENT_CM_SETTINGS = {
  bulkable: true,
  filterable: true,
  searchable: true,
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc',
  pageSize: 20,
  mainField: 'body',
};

const COMMENT_CM_LAYOUTS = {
  list: ['post', 'alias', 'status', 'createdAt'],
  edit: [
    [
      { name: 'post', size: 6 },
      { name: 'parent', size: 6 },
    ],
    [
      { name: 'alias', size: 6 },
      { name: 'status', size: 6 },
    ],
    [{ name: 'body', size: 12 }],
    [{ name: 'meta', size: 12 }],
  ],
  editRelations: ['post', 'parent'],
};

const COMMENT_CM_METADATAS = {
  post: {
    edit: {
      description: 'コメント先の記事',
      placeholder: '対象記事',
    },
    list: {
      label: '対象記事',
      sortable: false,
    },
  },
  parent: {
    edit: {
      description: '返信コメントの場合のみ指定',
      placeholder: '返信先コメント',
    },
  },
  alias: {
    list: { label: '投稿者' },
    edit: {
      description: '匿名投稿者の表示名',
    },
  },
  status: {
    list: {
      label: '状態',
      appearance: {
        type: 'badge',
        color: 'secondary',
      },
    },
    edit: {
      description: 'published に変更すると即時公開されます',
    },
  },
  body: {
    edit: {
      description: 'コメント本文',
      inputType: 'textarea',
    },
  },
  meta: {
    edit: {
      description: '投稿時の IP / UA など (閲覧専用)',
      placeholder: 'メタ情報',
      disabled: true,
    },
  },
  createdAt: {
    list: { label: '投稿日時' },
  },
};

const COMMENT_CM_CONFIGURATION = {
  settings: COMMENT_CM_SETTINGS,
  layouts: COMMENT_CM_LAYOUTS,
  metadatas: COMMENT_CM_METADATAS,
};

const sortKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
};

const snapshot = (value) => {
  if (value === undefined) {
    return 'undefined';
  }
  return JSON.stringify(sortKeys(value));
};

export const ensureCommentContentManagerConfig = async (strapi) => {
  const target = 'api::comment.comment';
  try {
    const plugin = strapi?.plugin?.('content-manager');
    const service = plugin?.service?.('content-types');
    let applied = false;

    if (service?.setConfiguration) {
      await service.setConfiguration(target, {
        settings: COMMENT_CM_SETTINGS,
        layouts: COMMENT_CM_LAYOUTS,
        metadatas: COMMENT_CM_METADATAS,
      });
      applied = true;
    }

    if (!applied) {
      const store = await strapi.store({
        type: 'plugin',
        name: 'content-manager',
        key: `configuration_content_types::${target}`,
      });

      const existing = await store.get();
      if (snapshot(existing) !== snapshot(COMMENT_CM_CONFIGURATION)) {
        await store.set({ value: COMMENT_CM_CONFIGURATION });
        applied = true;
      }
    }

    if (applied) {
      strapi.log.info('[bootstrap] コメントの Content Manager レイアウトを同期しました');
      if (service?.clearCache) {
        await service.clearCache(target);
      }
    }
  } catch (error) {
    strapi.log.error('[bootstrap] コメント用コンテンツマネージャー設定の適用に失敗しました', error);
  }
};
