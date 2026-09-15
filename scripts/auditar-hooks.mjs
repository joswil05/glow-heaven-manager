/**
 * Detecta hooks llamados DESPUÉS de un `return` temprano.
 *
 * Por qué existe
 * --------------
 * React exige que cada render de un componente llame a los mismos hooks, en
 * el mismo orden. Un hook que queda del otro lado de un `if (...) return null`
 * se llama unas veces sí y otras no. Cuando eso pasa React no avisa
 * suavemente: lanza el error 300 (o el 310) y DESMONTA EL ÁRBOL ENTERO. La
 * ventana queda en blanco, sin mensaje, y no hay forma de volver sin
 * reiniciar la aplicación.
 *
 * Es exactamente lo que pasaba en el editor de paquetes: `useCerrarConEscape`
 * estaba cien líneas por debajo de `if (!abierto) return null`, así que abrir
 * o cerrar ese modal vaciaba la app.
 *
 * Cómo lo busca
 * -------------
 * Dentro de cada componente, mira las líneas a la sangría del cuerpo (dos
 * espacios): si aparece un `return` temprano y más abajo, a esa misma
 * sangría, una llamada a un hook, lo reporta. Las funciones anidadas van más
 * adentro, así que no se confunden con esto.
 *
 * El rastreo se reinicia en cada declaración de nivel superior (una línea que
 * empieza en la columna cero). Sin eso, el `return` de una función auxiliar
 * del principio del archivo se cruzaba con los hooks del componente de más
 * abajo, que son cosas distintas.
 *
 * No pretende reemplazar a `eslint-plugin-react-hooks`, que hace esto y mucho
 * más; existe porque el proyecto no tiene eslint configurado y este caso
 * concreto tumba la aplicación entera.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CARPETAS = [
  path.join(RAIZ, 'src', 'renderer', 'src'),
  path.join(RAIZ, 'mobile', 'src'),
];

/** Un `return` temprano a la sangría del cuerpo del componente. */
const RE_RETURN_TEMPRANO = /^ {2}(?:if\s*\([^)]*\)\s*)?return\b/;

/** Una llamada a hook a esa misma sangría. */
const RE_HOOK = /^ {2}(?:const\s+.*=\s*)?use[A-Z]\w*\s*\(/;

/** El `return` final del JSX no cuenta: no hay nada después. */
function listarArchivos(carpeta) {
  const salida = [];
  if (!fs.existsSync(carpeta)) return salida;
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const completo = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      salida.push(...listarArchivos(completo));
    } else if (entrada.name.endsWith('.tsx')) {
      salida.push(completo);
    }
  }
  return salida;
}

const hallazgos = [];
let revisados = 0;

for (const carpeta of CARPETAS) {
  for (const archivo of listarArchivos(carpeta)) {
    revisados++;
    const relativa = path.relative(RAIZ, archivo).replace(/\\/g, '/');
    const lineas = fs.readFileSync(archivo, 'utf8').split('\n');

    let primerReturn = -1;

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];

      // Nueva declaración de nivel superior: empieza otro cuerpo, se olvida
      // lo visto en el anterior.
      if (/^\S/.test(linea)) {
        primerReturn = -1;
        continue;
      }

      if (primerReturn === -1 && RE_RETURN_TEMPRANO.test(linea)) {
        primerReturn = i;
        continue;
      }

      if (primerReturn !== -1 && RE_HOOK.test(linea)) {
        hallazgos.push({
          archivo: relativa,
          lineaReturn: primerReturn + 1,
          textoReturn: lineas[primerReturn].trim(),
          lineaHook: i + 1,
          textoHook: linea.trim(),
        });
        // Un hallazgo por archivo alcanza: el arreglo es el mismo.
        break;
      }
    }
  }
}

console.log('\n=== Auditoría de orden de hooks ===\n');
console.log(`Componentes revisados: ${revisados}`);

if (hallazgos.length === 0) {
  console.log('\n✓ ningún hook queda del otro lado de un return temprano\n');
  process.exit(0);
}

console.log(`\n✗ ${hallazgos.length} componente(s) con un hook después de un return temprano.`);
console.log('  Al cambiar de rama de render, React desmonta el árbol y la app queda en blanco.\n');

for (const h of hallazgos) {
  console.log(`    ${h.archivo}`);
  console.log(`      línea ${h.lineaReturn}: ${h.textoReturn}`);
  console.log(`      línea ${h.lineaHook}: ${h.textoHook}   <- el hook tiene que ir ARRIBA del return`);
  console.log('');
}

process.exit(1);
