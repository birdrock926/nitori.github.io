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
