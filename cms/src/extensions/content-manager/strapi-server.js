const COMMENT_SETTINGS = {
  bulkable: true,
  filterable: true,
  searchable: true,
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc',
  pageSize: 20,
  mainField: 'body',
};

const COMMENT_LAYOUTS = {
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

const COMMENT_METADATAS = {
  post: {
    list: {
      label: '対象記事',
      sortable: false,
    },
    edit: {
      label: '対象記事',
      description: 'コメント先の記事',
      placeholder: '対象記事',
    },
  },
  parent: {
    edit: {
      label: '返信元',
      description: '返信コメントの場合のみ指定',
      placeholder: '返信先のコメント ID',
    },
  },
  alias: {
    list: {
      label: '投稿者',
    },
    edit: {
      label: '表示名',
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
      label: '状態',
      description: 'published に変更すると即時公開されます',
    },
  },
  body: {
    edit: {
      label: '本文',
      description: 'コメント本文',
      inputType: 'textarea',
    },
  },
  meta: {
    edit: {
      label: 'メタ情報',
      description: '投稿時の IP / UA など (閲覧専用)',
      placeholder: 'メタ情報',
      disabled: true,
    },
  },
  createdAt: {
    list: {
      label: '投稿日時',
    },
  },
};

export default (plugin) => {
  if (plugin?.contentTypes?.['api::comment.comment']) {
    const comment = plugin.contentTypes['api::comment.comment'];
    comment.settings = { ...comment.settings, ...COMMENT_SETTINGS };
    comment.layouts = { ...comment.layouts, ...COMMENT_LAYOUTS };
    comment.metadatas = { ...comment.metadatas, ...COMMENT_METADATAS };
  }
  return plugin;
};
