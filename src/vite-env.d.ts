/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL: string;
  readonly VITE_TELEGRAM_BOT_USERNAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
