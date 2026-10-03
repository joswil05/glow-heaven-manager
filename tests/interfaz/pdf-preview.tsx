import { createRoot } from 'react-dom/client';
import { PruebaProformaSheet } from '../../mobile/src/components/PruebaProformaSheet';
import { instalarHapticos } from '../../mobile/src/lib/haptics';
import '../../mobile/src/index.css';

// Entrada independiente: sólo fixtures, sin App, sesión ni acceso a la base.
instalarHapticos();

// Sin StrictMode: el experimento prepara el archivo una sola vez al montar.
createRoot(document.getElementById('root')!).render(<PruebaProformaSheet />);
