/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREANT_ACCESS_TOKEN: string;
  readonly VITE_FIREANT_BASE_URL: string;
  readonly VITE_TRADESTATION_BASE_URL: string;
  readonly VITE_FIREANT_AI_BASE_URL: string;
  readonly VITE_STATIC_FIREANT_URL: string;
  readonly VITE_OIDC_AUTHORITY: string;
  readonly VITE_OIDC_CLIENT_ID: string;
  readonly VITE_APP_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
