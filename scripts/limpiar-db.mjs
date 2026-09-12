/**
 * Script de limpieza de base de datos Firestore para pruebas
 * Permite limpiar datos de prueba y resetear contadores.
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  updateDoc,
  deleteField,
} from 'firebase/firestore';

const FIREBASE_CONFIG = {
  projectId: 'glow-heaven-db-app',
  appId: '1:423077292727:web:39f388f681d400924e3b32',
  storageBucket: 'glow-heaven-db-app.firebasestorage.app',
  apiKey: 'AIzaSyAPLt-SgbXkKig06pXxtrj34pi6ydRg7FQ',
  authDomain: 'glow-heaven-db-app.firebaseapp.com',
  messagingSenderId: '423077292727',
};

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

const modo = process.argv[2] || '--normal';

async function vaciarColeccion(nombre) {
  const colRef = collection(db, nombre);
  const snap = await getDocs(colRef);
  if (snap.empty) {
    console.log(`  - ${nombre}: vacía (0 documentos)`);
    return 0;
  }

  let borrados = 0;
  // Lotes de 400 por límite de Firestore (500 máx)
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    borrados += chunk.length;
  }
  console.log(`  - ${nombre}: ${borrados} documento(s) eliminados`);
  return borrados;
}

async function main() {
  console.log('Iniciando limpieza de base de datos Firestore (' + FIREBASE_CONFIG.projectId + ')...');
  console.log(`Modo: ${modo}`);

  // 1. Colecciones operativas a vaciar siempre
  const coleccionesOperativas = [
    'ventas',
    'compras',
    'productos',
    'clientes',
    'pagos',
    'movimientos_inventario',
    'eventos',
  ];

  console.log('\n1. Vaciando colecciones operativas:');
  for (const col of coleccionesOperativas) {
    await vaciarColeccion(col);
  }

  // 2. Reiniciar secuencias de IDs
  console.log('\n2. Reiniciando contadores de secuencia (_secuencias):');
  await vaciarColeccion('_secuencias');

  // 3. Categorías
  if (modo === '--todo') {
    console.log('\n3. Vaciando categorías:');
    await vaciarColeccion('categorias');
  } else {
    console.log('\n3. Categorías: conservadas para que el usuario no tenga que crearlas.');
  }

  // 4. Parámetros del sistema y PIN
  console.log('\n4. Parámetros del sistema:');
  const paramDoc = doc(db, 'parametros', 'sistema');
  if (modo === '--todo') {
    await vaciarColeccion('parametros');
    console.log('  - parametros/sistema eliminado completamente.');
  } else if (modo === '--quitar-pin' || modo === '--normal') {
    try {
      await updateDoc(paramDoc, {
        pin_seguridad: deleteField(),
        pin_hash: deleteField(),
        onboarding_completado: '0',
        actualizado_en: new Date().toISOString(),
      });
      console.log('  - PIN de seguridad eliminado (el tester entrará directo sin PIN).');
    } catch (err) {
      console.log('  - Nota al actualizar parametros:', err.message);
    }
  } else {
    console.log('  - PIN de seguridad conservado.');
  }

  console.log('\n Limpieza completada con éxito.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error durante la limpieza:', err);
  process.exit(1);
});
