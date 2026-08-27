/// <reference types="vite/client" />

import { ElectronApi } from '../../preload/api';

declare global {
  interface Window {
    api: ElectronApi;
  }
}
