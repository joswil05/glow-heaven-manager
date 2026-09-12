# Plan de Desarrollo: Versión Móvil (PWA) — Glow Heaven Manager

> **Destinatario:** Este documento está redactado como directiva y contexto de arquitectura para un agente de inteligencia artificial o desarrollador que implementará la versión móvil de **Glow Heaven Manager**.

## Estado de implementación (2026-09-11)

La primera versión ya está construida en [`../mobile/`](../mobile/) (Vite +
React, build aparte del mismo `package.json`, salida a `dist-mobile/`). Leé
[`../mobile/README.md`](../mobile/README.md) para cómo correrla, buildearla y
desplegarla. Cubre los cuatro módulos de la sección 3: acceso con Google,
Panel, Venta Rápida y Consulta de Inventario, reutilizando sin duplicar la
lógica de `src/core/` y los repositorios de `src/main/firebase/repositories/`
(incluido el descuento transaccional de stock).

**Falta antes de que quede en manos de la dueña:**
1. Crear el segundo sitio de Firebase Hosting y aplicarle el target `movil`
   (comando exacto en `mobile/README.md`) — sin esto `deploy:mobile` no tiene
   a dónde publicar.
2. Confirmar que Authentication → Google esté habilitado en la consola (la
   migración a Google Sign-In del escritorio, descrita en `docs/CONTINUAR.md`,
   ya lo necesita igual).
3. Probar el flujo completo en un Android real: instalar desde Chrome,
   iniciar sesión, y registrar una venta de prueba para confirmar que
   descuenta stock y se ve reflejada en el escritorio.

---

## 1. Contexto del Negocio y Sistema Existente

- **Negocio:** *Glow Heaven* es una tienda de belleza, cosméticos, cuidado personal y moda que importa productos desde USA hacia Nicaragua.
- **Moneda:** Las transacciones se cotizan y operan en **dólares (USD)** y se muestran con su conversión a **córdobas (NIO)** según la tasa oficial registrada en el sistema.
- **Infraestructura actual:**
  - Base de datos en la nube: **Google Cloud Firestore** (proyecto de Firebase: `glow-heaven-db-app`).
  - Autenticación: **Firebase Authentication** (Google OAuth).
  - La aplicación actual de escritorio (Electron + React) ya sincroniza en tiempo real con este proyecto de Firestore.
- **Colecciones clave de Firestore:**
  - `productos`: Catálogo, existencias, costos, precios, variantes/tonos y fotos.
  - `clientes`: Directorio de clientas, historial, saldo adeudado y teléfonos de WhatsApp.
  - `ventas`: Registro de ventas al contado y a crédito, líneas de venta, costos congelados y cuotas de abono.
  - `pagos`: Abonos y cobros asociados a ventas.
  - `parametros/sistema`: Tasa de cambio, márgenes, nombres y configuración general.
  - `categorias`: Clasificación de productos.

---

## 2. Objetivo Principal del Proyecto Móvil

Desarrollar una aplicación web progresiva (**PWA - Progressive Web App**) optimizada para teléfonos móviles (orientada a **Android**), que permita a la dueña y a su equipo **registrar ventas rápidamente desde el celular** y **consultar el estado del negocio (Dashboard)** en cualquier momento y lugar (ferias, entregas en la calle o mientras atiende clientas por WhatsApp).

La aplicación debe instalarse en Android directamente desde el navegador (Chrome) mediante el botón *"Instalar aplicación / Añadir a pantalla de inicio"*, abriendo en **pantalla completa** (modo *standalone*) con el ícono oficial de la marca y sin barras de navegación del navegador.

---

## 3. Lo que se Quiere Lograr (Alcance y Módulos)

### Módulo A: Acceso Rápido y Seguro
- Inicio de sesión mediante **Google Sign-In** (con la cuenta autorizada de Glow Heaven).
- Sesión persistente para no tener que iniciar sesión cada vez que se desbloquea el teléfono.
- Soporte opcional del PIN de seguridad numérico configurado en `parametros/sistema`.

### Módulo B: Dashboard Móvil (Resumen Ejecutivo en Pantalla Vertical)
Una pantalla de inicio clara y legible sin saturación:
1. **Métricas clave de hoy:**
   - Total facturado en el día (en USD y C$).
   - Ganancia estimada del día.
   - Cobros pendientes globales.
2. **Alertas accionables prioritarias:**
   - **Cobros vencidos:** Listado de clientas con pagos atrasados, mostrando monto pendiente y un **botón directo para abrir chat de WhatsApp** con el recordatorio y saldo pre-redactado.
   - **Stock crítico:** Alerta de productos que están a punto de agotarse (stock $\le 2$).
   - **Encargos pendientes:** Pedidos especiales de clientas que están pendientes de entrega o cobro.
3. **Tendencia resumida:** Visualización limpia del comportamiento de ventas de los últimos 7 días.

### Módulo C: Venta Rápida Móvil (Quick Point-of-Sale)
El núcleo de la experiencia móvil. Debe diseñarse para ser operado **con una sola mano en menos de 30 segundos**:
1. **Búsqueda táctil instantánea:** Buscador con filtro predictivo por nombre de producto, con foto miniatura, precio en USD/C$ y unidades disponibles en inventario.
2. **Soporte de Variantes y Tonos:** Si el producto tiene múltiples tonos (ej. labiales, bases, correctores), permitir seleccionar el tono específico mediante *chips* o botones táctiles grandes.
3. **Selección/Creación Ágil de Clienta:**
   - Selector predictivo de clientas existentes.
   - Posibilidad de crear una clienta nueva en 2 pasos (solo Nombre y WhatsApp) dentro del mismo flujo sin abandonar la venta.
4. **Condiciones de Pago:**
   - Tipo de venta: Contado o Crédito/Apartado.
   - Método de cobro: Efectivo, Transferencia banco local, etc.
   - Monto abonado al momento y fecha límite de saldo si queda debiendo.
5. **Generación y Envío de Comprobante:**
   - Al tocar "Confirmar Venta", actualizar Firestore de inmediato (descontando existencias y registrando venta/pago).
   - Botón destacado: **"Enviar comprobante a WhatsApp"**, que abre la app de WhatsApp de Android con el texto formal del recibo ya armado (productos, total pagado, saldo pendiente y cuenta bancaria).

### Módulo D: Consulta Rápida de Inventario (Consulta al Vuelo)
- Vista de búsqueda rápida de productos para responder consultas inmediatas de clientas en redes sociales:
  - Ver fotos del producto.
  - Ver tonos disponibles y existencias exactas.
  - Ver precio de venta al público en dólares y córdobas.

---

## 4. Lineamientos Arquitectónicos y Reglas de Negocio

El agente o desarrollador que construya esta PWA debe respetar las siguientes directivas fundamentales:

1. **Manejo del Dinero (Innegociable):**
   - El dinero en Firestore **SIEMPRE se guarda en enteros de centavos USD** (`usd_cents`). Ejemplo: `$15.00` se almacena como `1500`.
   - Jamás almacenar floats ni centavos fraccionados en la base de datos.
   - Los córdobas son un cálculo derivado en frontend para presentación (`(usd_cents * tasa_cambio_cents) / 10000`).
2. **Descuento Atómico de Inventario:**
   - La venta debe descontar existencias de forma segura (usando `runTransaction` o lotes de Firestore) para evitar inconsistencias de inventario si dos personas venden al mismo tiempo.
3. **Reutilización de Lógica de Negocio:**
   - Las fórmulas de cálculo de precios, márgenes y redondeos deben ser consistentes con la suite de negocio ya definida en `src/core/` de la herramienta de escritorio.
4. **Despliegue y Alojamiento:**
   - Se debe utilizar **Firebase Hosting** dentro del mismo proyecto existente (`glow-heaven-db-app`).
   - El despliegue se efectúa mediante `firebase deploy --only hosting`.
   - Incluir configuración de PWA: `manifest.json`, iconos de 192x192 y 512x512, tema de color esmeralda/dorado y modo `standalone`.

---

## 5. Criterios de Éxito
- La aplicación carga en menos de 2 segundos en un smartphone Android sobre conexión móvil.
- La navegación es 100% responsiva y optimizada para pantallas verticales de 360px a 430px de ancho.
- Una venta se registra en menos de 4 toques.
- Los datos registrados desde el móvil se ven reflejados en tiempo real en la aplicación de escritorio.
