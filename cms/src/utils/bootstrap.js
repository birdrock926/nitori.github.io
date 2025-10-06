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

const COMMENT_CM_CONFIGURATION = {
  settings: {
    bulkable: true,
    filterable: true,
    searchable: true,
    defaultSortBy: 'createdAt',
    defaultSortOrder: 'desc',
    pageSize: 20,
    mainField: 'body',
  },
  layouts: {
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
  },
  metadatas: {
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
        placeholder: '返信元コメント',
      },
    },
    alias: {
      list: { label: '投稿者' },
      edit: {
        description: '匿名投稿者の表示名',
      },
    },
    status: {
      list: { label: '状態' },
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
  },
};

export const ensureCommentContentManagerConfig = async (strapi) => {
  const service = strapi?.plugin?.('content-manager')?.service?.('content-types');
  if (!service) {
    strapi.log.warn('[bootstrap] content-manager サービスにアクセスできませんでした');
    return;
  }

  const target = 'api::comment.comment';
  try {
    if (typeof service.updateConfiguration === 'function') {
      await service.updateConfiguration(target, COMMENT_CM_CONFIGURATION);
      return;
    }
    if (typeof service.setConfiguration === 'function') {
      await service.setConfiguration(target, COMMENT_CM_CONFIGURATION);
      return;
    }
    if (typeof service.createConfiguration === 'function') {
      await service.createConfiguration(target, COMMENT_CM_CONFIGURATION);
      return;
    }
    strapi.log.warn('[bootstrap] content-manager 設定を更新できるメソッドが見つかりませんでした');
  } catch (error) {
    strapi.log.error('[bootstrap] コメント用コンテンツマネージャー設定の適用に失敗しました', error);
  }
};
