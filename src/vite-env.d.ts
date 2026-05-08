/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREANT_ACCESS_TOKEN: string;
  readonly VITE_OIDC_AUTHORITY: string;
  readonly VITE_OIDC_CLIENT_ID: string;
  readonly VITE_APP_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}