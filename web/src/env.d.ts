/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_COMMENTS_ENABLED?: string;
  readonly PUBLIC_COMMENTS_REQUIRE_APPROVAL?: string;
  readonly PUBLIC_COMMENTS_PAGE_SIZE?: string;
  readonly PUBLIC_COMMENTS_MAX_LENGTH?: string;
  readonly PUBLIC_COMMENTS_DEFAULT_AUTHOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
