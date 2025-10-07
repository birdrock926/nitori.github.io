/// <reference types="astro/client" />

declare global {
  interface Window {
    REMARK42?: {
      createInstance: (options: Record<string, unknown>) => void;
      destroy?: () => void;
    };
  }
}

export {};
