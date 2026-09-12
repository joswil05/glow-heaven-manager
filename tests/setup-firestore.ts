/**
 * Sustituye el SDK de Firebase por el falso en memoria durante las pruebas.
 * Se carga con `setupFiles` en vitest.config.ts, antes de cualquier import
 * de los repositorios.
 */
import { vi } from 'vitest';
import * as falso from './firestore-fake';

vi.mock('firebase/app', () => ({
  initializeApp: falso.initializeApp,
  getApps: falso.getApps,
  getApp: falso.getApp,
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: falso.getFirestore,
  doc: falso.doc,
  collection: falso.collection,
  where: falso.where,
  orderBy: falso.orderBy,
  limit: falso.limit,
  query: falso.query,
  getDoc: falso.getDoc,
  getDocs: falso.getDocs,
  setDoc: falso.setDoc,
  deleteDoc: falso.deleteDoc,
  writeBatch: falso.writeBatch,
  runTransaction: falso.runTransaction,
}));
