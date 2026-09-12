/// <reference types="vite/client" />

import type { ApiPuente } from '../../shared/ipc-contracts';

declare global {
  interface Window {
    api: ApiPuente;
  }
}
