const parseCsv = (value, fallback = []) => {
  if (!value) {
    return [...fallback];
  }

  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (!items.length) {
    return [...fallback];
  }

  return Array.from(new Set(items));
};

const toBoolean = (value, fallback) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  if (typeof fallback === 'boolean') {
    return fallback;
  }

  return false;
};

const withEnsuredCollection = (collection, defaults) => {
  const source = Array.isArray(collection) ? collection : [];
  const ensured = new Set(defaults);
  source.forEach((item) => ensured.add(item));
  return Array.from(ensured);
};

const buildCommentsConfig = (env) => {
  const defaultCollection = 'api::post.post';
  const enabledCollections = withEnsuredCollection(
    parseCsv(env('COMMENTS_ENABLED_COLLECTIONS'), [defaultCollection]),
    [defaultCollection]
  );
  const approvalFlow = withEnsuredCollection(
    parseCsv(env('COMMENTS_APPROVAL_FLOW'), [defaultCollection]),
    []
  );
  const moderatorRoles = parseCsv(env('COMMENTS_MODERATOR_ROLES'), ['Authenticated']);
  const blockedAuthorProps = withEnsuredCollection(
    parseCsv(env('COMMENTS_BLOCKED_AUTHOR_PROPS'), ['email']),
    []
  );

  const badWords = toBoolean(env('COMMENTS_BAD_WORDS'), true);
  const isValidationEnabled = toBoolean(env('COMMENTS_VALIDATION_ENABLED'), true);

  const entryLabel = {
    '*': ['Title', 'title', 'Name', 'name', 'Subject', 'subject'],
    [defaultCollection]: ['title', 'slug'],
  };

  const clientUrl = env('COMMENTS_CLIENT_URL', env('PUBLIC_URL', 'http://localhost:1337'));
  const contactEmail = env('COMMENTS_CONTACT_EMAIL', env('SMTP_REPLY_TO', 'contact@example.com'));

  return {
    enabled: true,
    config: {
      enabledCollections,
      approvalFlow,
      moderatorRoles,
      blockedAuthorProps,
      badWords,
      isValidationEnabled,
      entryLabel,
      client: {
        url: clientUrl,
        contactEmail,
      },
    },
  };
};

const buildUploadConfig = (env) => {
  const provider = env('UPLOAD_PROVIDER', 'local');

  if (provider === 'oci') {
    const region = env('OCI_REGION');
    const bucket = env('OCI_BUCKET');
    const namespace = env('OCI_NAMESPACE');

    if (!region || !bucket || !namespace) {
      throw new Error('OCI upload provider requires OCI_REGION, OCI_BUCKET, and OCI_NAMESPACE environment variables.');
    }

    const endpoint = env('OCI_S3_ENDPOINT', `https://objectstorage.${region}.oraclecloud.com`);
    const baseUrl = env('OCI_PUBLIC_URL', `${endpoint}/n/${namespace}/b/${bucket}/o`);

    return {
      config: {
        provider: '@strapi/provider-upload-aws-s3',
        providerOptions: {
          accessKeyId: env('OCI_ACCESS_KEY'),
          secretAccessKey: env('OCI_SECRET_KEY'),
          endpoint,
          region,
          baseUrl,
          params: {
            Bucket: bucket,
          },
          s3ForcePathStyle: true,
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      },
    };
  }

  return {
    config: {
      provider: 'local',
      providerOptions: {
        sizeLimit: env.int('UPLOAD_SIZE_LIMIT', 256 * 1024 * 1024),
      },
    },
  };
};

export default ({ env }) => ({
  seo: {
    enabled: true,
  },
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET'),
    },
  },
  'color-picker': {
    enabled: true,
  },
  upload: buildUploadConfig(env),
  comments: buildCommentsConfig(env),
  email: {
    config: {
      provider: '@strapi/provider-email-nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'smtp.example.com'),
        port: env.int('SMTP_PORT', 587),
        secure: env.bool('SMTP_SECURE', false),
        auth: {
          user: env('SMTP_USERNAME'),
          pass: env('SMTP_PASSWORD'),
        },
      },
      settings: {
        defaultFrom: env('SMTP_FROM', 'noreply@example.com'),
        defaultReplyTo: env('SMTP_REPLY_TO', 'contact@example.com'),
      },
    },
  },
});
