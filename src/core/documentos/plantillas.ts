import type { VentaCompleta, ParametrosSistema, CuentaBancaria } from '../../shared/types';
import { formatearMoneda, formatearFecha } from '../moneda';

/**
 * Escapa caracteres especiales para evitar inyección de HTML en documentos generados.
 */
export function escaparHtml(texto: unknown): string {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Genera el documento HTML completo de una Factura Comercial de Venta.
 */
export function generarHtmlFactura(venta: VentaCompleta, parametros: ParametrosSistema): string {
  const tasa = parametros.tasa_cambio_cents || venta.tasa_cambio_cents || 3662;
  const tasaNum = tasa / 100;
  const totalCs = Math.round((venta.total_usd_cents * tasa) / 100);
  const saldoCs = Math.round((venta.saldo_usd_cents * tasa) / 100);
  const subtotal = venta.subtotal_usd_cents ?? venta.total_usd_cents;
  const descuento = venta.descuento_usd_cents ?? 0;
  const esPagada = venta.saldo_usd_cents <= 0;

  const cuentas = parametros.cuentas_bancarias ?? [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura ${venta.codigo} - ${parametros.nombre_negocio || 'Glow Heaven'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Un documento comercial se define contra el PAPEL, no contra la
       pantalla. Sin @page el navegador elige los margenes por su cuenta y el
       mismo archivo sale distinto en cada impresora. A4 es el tamano de
       oficina en Nicaragua. */
    @page {
      size: A4;
      margin: 16mm 15mm;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      background-color: #ffffff;
      line-height: 1.45;
      /* Ancho util de un A4 con esos margenes. En pantalla se centra con el
         mismo ancho que va a tener impreso, asi lo que se ve es lo que sale. */
      width: 180mm;
      padding: 16mm 15mm;
      margin: 0 auto;
      font-size: 10.5pt;
    }

    /* Una fila de la tabla partida entre dos hojas es ilegible. */
    tr, .bank-item, .total-row { break-inside: avoid; }
    thead { display: table-header-group; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }

    .brand-title {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }

    .brand-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: #059669;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 2px;
    }

    .brand-contact {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    .doc-meta {
      text-align: right;
    }

    .doc-type {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .doc-code {
      font-size: 15px;
      font-weight: 700;
      color: #059669;
      font-family: monospace;
      margin-top: 2px;
    }

    .doc-date {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    .client-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .client-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
    }

    .client-value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 2px;
    }

    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    table.items-table th {
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      text-align: left;
      border-bottom: 2px solid #cbd5e1;
    }

    table.items-table td {
      padding: 12px;
      font-size: 13px;
      border-bottom: 1px solid #e2e8f0;
    }

    .item-desc {
      font-weight: 600;
      color: #0f172a;
    }

    .item-variant {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    .totals-wrapper {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 24px;
    }

    .status-badge-container {
      flex: 1;
      padding: 14px;
      border-radius: 10px;
      border: 1px dashed;
    }

    .status-paid {
      background: #ecfdf5;
      border-color: #10b981;
      color: #065f46;
    }

    .status-pending {
      background: #fffbeb;
      border-color: #f59e0b;
      color: #92400e;
    }

    .totals-table {
      width: 280px;
      border-collapse: collapse;
    }

    .totals-table td {
      padding: 5px 0;
      font-size: 12px;
    }

    .totals-table td.label {
      color: #64748b;
    }

    .totals-table td.value {
      text-align: right;
      font-weight: 600;
      color: #0f172a;
    }

    .totals-table tr.total-row td {
      border-top: 2px solid #0f172a;
      padding-top: 8px;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }

    .totals-table tr.total-cor td {
      font-size: 13px;
      font-weight: 700;
      color: #059669;
    }

    .totals-table tr.discount-row td {
      color: #059669;
      font-weight: 600;
    }

    .bank-accounts {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 11px;
    }

    .bank-title {
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 6px;
    }

    .bank-list {
      list-style: none;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      color: #334155;
    }

    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.6;
    }

    @media print {
      /* Al imprimir, el margen lo pone @page: si el body tambien lo pusiera,
         se sumarian los dos. */
      body {
        width: auto;
        padding: 0;
        margin: 0;
      }
      .no-print { display: none !important; }
      /* Sin esto el navegador descarta los fondos de las celdas y los
         encabezados de tabla pierden su franja. */
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">${escaparHtml(parametros.nombre_negocio || 'GLOW HEAVEN')}</div>
            <div class="brand-contact">
        ${parametros.telefono_negocio ? `Tel: ${escaparHtml(parametros.telefono_negocio)} · ` : ''}Managua, Nicaragua
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Factura Comercial</div>
      <div class="doc-code">${venta.codigo}</div>
      <div class="doc-date">Fecha: ${formatearFecha(venta.fecha)}</div>
    </div>
  </div>

  <div class="client-card">
    <div>
      <div class="client-label">Cliente</div>
      <div class="client-value">${escaparHtml(venta.cliente_nombre || venta.cliente?.nombre || 'Cliente Mostrador')}</div>
    </div>
    <div>
      <div class="client-label">Teléfono / WhatsApp</div>
      <div class="client-value">${escaparHtml(venta.cliente?.telefono || 'No registrado')}</div>
    </div>
    ${venta.cliente?.ciudad ? `
    <div>
      <div class="client-label">Ciudad</div>
      <div class="client-value">${escaparHtml(venta.cliente.ciudad)}</div>
    </div>` : ''}
    ${venta.cliente?.direccion ? `
    <div>
      <div class="client-label">Dirección</div>
      <div class="client-value">${escaparHtml(venta.cliente.direccion)}</div>
    </div>` : ''}
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 45%;">Descripción</th>
        <th style="width: 15%; text-align: center;">Cantidad</th>
        <th style="width: 20%; text-align: right;">Precio Unit.</th>
        <th style="width: 20%; text-align: right;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${venta.lineas.map((l) => {
        const variantes = [l.talla, l.color].filter(Boolean).map(escaparHtml).join(' · ');
        return `
        <tr>
          <td>
            <div class="item-desc">${escaparHtml(l.descripcion)}</div>
            ${variantes ? `<div class="item-variant">${variantes}</div>` : ''}
          </td>
          <td style="text-align: center; font-weight: 600;">${l.cantidad}</td>
          <td style="text-align: right; font-family: monospace;">${formatearMoneda(l.precio_unitario_usd_cents, 'USD')}</td>
          <td style="text-align: right; font-weight: 700; font-family: monospace;">${formatearMoneda(l.subtotal_usd_cents, 'USD')}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="totals-wrapper">
    <div class="status-badge-container ${esPagada ? 'status-paid' : 'status-pending'}">
      <div style="font-size: 13px; font-weight: 800; text-transform: uppercase;">
        ${esPagada ? '✓ Pagado en su totalidad' : '⚠ Saldo Pendiente de Pago'}
      </div>
      <div style="font-size: 11px; margin-top: 4px;">
        ${esPagada
          ? 'Gracias por tu compra. La cuenta se encuentra completamente saldada.'
          : `Resta por pagar: <strong>${formatearMoneda(venta.saldo_usd_cents, 'USD')}</strong> (≈ ${formatearMoneda(saldoCs, 'COR')})`
        }
      </div>
    </div>

    <table class="totals-table">
      ${descuento > 0 ? `
      <tr>
        <td class="label">Subtotal:</td>
        <td class="value">${formatearMoneda(subtotal, 'USD')}</td>
      </tr>
      <tr class="discount-row">
        <td class="label">Descuento${venta.descuento_motivo ? ` (${escaparHtml(venta.descuento_motivo)})` : ''}:</td>
        <td class="value">-${formatearMoneda(descuento, 'USD')}</td>
      </tr>
      ` : ''}
      <tr class="total-row">
        <td class="label">Total USD:</td>
        <td class="value">${formatearMoneda(venta.total_usd_cents, 'USD')}</td>
      </tr>
      <tr class="total-cor">
        <td class="label">Total C$ (T.C. ${tasaNum.toFixed(2)}):</td>
        <td class="value">${formatearMoneda(totalCs, 'COR')}</td>
      </tr>
      <tr>
        <td class="label">Abonado:</td>
        <td class="value">${formatearMoneda(venta.pagado_usd_cents, 'USD')}</td>
      </tr>
      ${venta.saldo_usd_cents > 0 ? `
      <tr style="color: #b45309; font-weight: 700;">
        <td class="label" style="color: #b45309;">Saldo Pendiente:</td>
        <td class="value">${formatearMoneda(venta.saldo_usd_cents, 'USD')}</td>
      </tr>
      ` : ''}
    </table>
  </div>

  ${cuentas.length > 0 ? `
  <div class="bank-accounts">
    <div class="bank-title">Cuentas bancarias para transferencias</div>
    <ul class="bank-list">
      ${cuentas.map((c: CuentaBancaria) => `<li><strong>${escaparHtml(c.banco)} (${escaparHtml(c.moneda)}):</strong> ${escaparHtml(c.numero)}${c.titular ? ` · ${escaparHtml(c.titular)}` : ''}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>¡Gracias por elegir <strong>${escaparHtml(parametros.nombre_negocio || 'Glow Heaven')}</strong>! 💖</p>
    <p>Cambios válidos dentro de los primeros 5 días presentando este comprobante. Las prendas deben conservar sus etiquetas intactas.</p>
  </div>
</body>
</html>`;
}

/**
 * Genera el documento HTML completo de una Proforma / Cotización para Encargos.
 */
export function generarHtmlProforma(venta: VentaCompleta, parametros: ParametrosSistema): string {
  const tasa = parametros.tasa_cambio_cents || venta.tasa_cambio_cents || 3662;
  const tasaNum = tasa / 100;
  const totalCs = Math.round((venta.total_usd_cents * tasa) / 100);
  const anticipoEsperadoCs = Math.round((venta.anticipo_esperado_usd_cents * tasa) / 100);
  const anticipoCubierto = venta.pagado_usd_cents >= venta.anticipo_esperado_usd_cents;

  const cuentas = parametros.cuentas_bancarias ?? [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cotización ${venta.codigo} - ${parametros.nombre_negocio || 'Glow Heaven'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Un documento comercial se define contra el PAPEL, no contra la
       pantalla. Sin @page el navegador elige los margenes por su cuenta y el
       mismo archivo sale distinto en cada impresora. A4 es el tamano de
       oficina en Nicaragua. */
    @page {
      size: A4;
      margin: 16mm 15mm;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      background-color: #ffffff;
      line-height: 1.45;
      /* Ancho util de un A4 con esos margenes. En pantalla se centra con el
         mismo ancho que va a tener impreso, asi lo que se ve es lo que sale. */
      width: 180mm;
      padding: 16mm 15mm;
      margin: 0 auto;
      font-size: 10.5pt;
    }

    /* Una fila de la tabla partida entre dos hojas es ilegible. */
    tr, .bank-item, .total-row { break-inside: avoid; }
    thead { display: table-header-group; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }

    .brand-title {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
    }

    .brand-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 2px;
    }

    .brand-contact {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    .doc-meta {
      text-align: right;
    }

    .doc-type {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .doc-code {
      font-size: 15px;
      font-weight: 700;
      color: #2563eb;
      font-family: monospace;
      margin-top: 2px;
    }

    .doc-date {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }

    .client-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .client-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
    }

    .client-value {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 2px;
    }

    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    table.items-table th {
      background: #f1f5f9;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 12px;
      text-align: left;
      border-bottom: 2px solid #cbd5e1;
    }

    table.items-table td {
      padding: 12px;
      font-size: 13px;
      border-bottom: 1px solid #e2e8f0;
    }

    .item-desc {
      font-weight: 600;
      color: #0f172a;
    }

    .item-variant {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    .conditions-card {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .cond-block {
      display: flex;
      flex-direction: column;
    }

    .cond-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1e40af;
    }

    .cond-amount {
      font-size: 18px;
      font-weight: 800;
      color: #1e3a8a;
      margin-top: 2px;
      font-family: monospace;
    }

    .cond-sub {
      font-size: 11px;
      color: #3b82f6;
      font-weight: 600;
    }

    .totals-wrapper {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 24px;
    }

    .totals-table {
      width: 280px;
      border-collapse: collapse;
      margin-left: auto;
    }

    .totals-table td {
      padding: 5px 0;
      font-size: 12px;
    }

    .totals-table td.label {
      color: #64748b;
    }

    .totals-table td.value {
      text-align: right;
      font-weight: 600;
      color: #0f172a;
    }

    .totals-table tr.total-row td {
      border-top: 2px solid #0f172a;
      padding-top: 8px;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }

    .totals-table tr.total-cor td {
      font-size: 13px;
      font-weight: 700;
      color: #2563eb;
    }

    .bank-accounts {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 11px;
    }

    .bank-title {
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 6px;
    }

    .bank-list {
      list-style: none;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      color: #334155;
    }

    .policy-box {
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 11px;
      color: #64748b;
      margin-bottom: 24px;
      background: #ffffff;
    }

    .policy-box strong {
      color: #334155;
    }

    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.6;
    }

    @media print {
      /* Al imprimir, el margen lo pone @page: si el body tambien lo pusiera,
         se sumarian los dos. */
      body {
        width: auto;
        padding: 0;
        margin: 0;
      }
      .no-print { display: none !important; }
      /* Sin esto el navegador descarta los fondos de las celdas y los
         encabezados de tabla pierden su franja. */
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">${escaparHtml(parametros.nombre_negocio || 'GLOW HEAVEN')}</div>
            <div class="brand-contact">
        ${parametros.telefono_negocio ? `Tel: ${escaparHtml(parametros.telefono_negocio)} · ` : ''}Managua, Nicaragua
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Cotización de Encargo</div>
      <div class="doc-code">${venta.codigo}</div>
      <div class="doc-date">Fecha: ${formatearFecha(venta.fecha)}</div>
    </div>
  </div>

  <div class="client-card">
    <div>
      <div class="client-label">Clienta</div>
      <div class="client-value">${escaparHtml(venta.cliente_nombre || venta.cliente?.nombre || 'Clienta')}</div>
    </div>
    <div>
      <div class="client-label">Teléfono / WhatsApp</div>
      <div class="client-value">${escaparHtml(venta.cliente?.telefono || 'No registrado')}</div>
    </div>
    ${venta.cliente?.ciudad ? `
    <div>
      <div class="client-label">Ciudad de Entrega</div>
      <div class="client-value">${escaparHtml(venta.cliente.ciudad)}</div>
    </div>` : ''}
    ${venta.cliente?.direccion ? `
    <div>
      <div class="client-label">Dirección</div>
      <div class="client-value">${escaparHtml(venta.cliente.direccion)}</div>
    </div>` : ''}
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 50%;">Artículo / Descripción</th>
        <th style="width: 15%; text-align: center;">Cantidad</th>
        <th style="width: 15%; text-align: right;">Precio Unit.</th>
        <th style="width: 20%; text-align: right;">Total Cotizado</th>
      </tr>
    </thead>
    <tbody>
      ${venta.lineas.map((l) => {
        const variantes = [l.talla, l.color].filter(Boolean).map(escaparHtml).join(' · ');
        return `
        <tr>
          <td>
            <div class="item-desc">${escaparHtml(l.descripcion)}</div>
            ${variantes ? `<div class="item-variant">${variantes}</div>` : ''}
          </td>
          <td style="text-align: center; font-weight: 600;">${l.cantidad}</td>
          <td style="text-align: right; font-family: monospace;">${formatearMoneda(l.precio_unitario_usd_cents, 'USD')}</td>
          <td style="text-align: right; font-weight: 700; font-family: monospace;">${formatearMoneda(l.subtotal_usd_cents, 'USD')}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <!-- Condiciones Financieras de Encargo -->
  <div class="conditions-card">
    <div class="cond-block">
      <span class="cond-title">🔒 Anticipo Requerido para Ordenar</span>
      <span class="cond-amount">${formatearMoneda(venta.anticipo_esperado_usd_cents, 'USD')}</span>
      <span class="cond-sub">≈ ${formatearMoneda(anticipoEsperadoCs, 'COR')} (50%)</span>
      <span style="font-size: 11px; margin-top: 4px; font-weight: 700; color: ${anticipoCubierto ? '#059669' : '#d97706'}">
        ${anticipoCubierto ? '✓ Anticipo cubierto - Pedido en proceso' : '⏳ Pendiente de depósito'}
      </span>
    </div>

    <div class="cond-block">
      <span class="cond-title">🤝 Saldo Contra Entrega</span>
      <span class="cond-amount">${formatearMoneda(venta.saldo_usd_cents, 'USD')}</span>
      <span class="cond-sub">A cancelar al recibir tus prendas</span>
    </div>
  </div>

  <table class="totals-table">
    <tr class="total-row">
      <td class="label">Total Cotizado USD:</td>
      <td class="value">${formatearMoneda(venta.total_usd_cents, 'USD')}</td>
    </tr>
    <tr class="total-cor">
      <td class="label">Total C$ (T.C. ${tasaNum.toFixed(2)}):</td>
      <td class="value">${formatearMoneda(totalCs, 'COR')}</td>
    </tr>
    <tr>
      <td class="label">Anticipo Abonado:</td>
      <td class="value">${formatearMoneda(venta.pagado_usd_cents, 'USD')}</td>
    </tr>
    <tr style="color: #1e3a8a; font-weight: 700;">
      <td class="label" style="color: #1e3a8a;">Saldo Pendiente:</td>
      <td class="value">${formatearMoneda(venta.saldo_usd_cents, 'USD')}</td>
    </tr>
  </table>

  <div class="policy-box">
    <strong>📦 Políticas y Tiempos de Entrega de Encargos:</strong>
    <ul style="margin-left: 18px; margin-top: 6px; line-height: 1.6;">
      <li>Tiempo estimado de entrega: <strong>12 a 18 días hábiles</strong> tras confirmar el anticipo.</li>
      <li>Una vez realizada la compra en USA, no se permiten cancelaciones ni cambios de talla o color.</li>
      <li>En caso de que el proveedor cancele la prenda por falta de stock, se reembolsará el 100% de tu anticipo.</li>
    </ul>
  </div>

  ${cuentas.length > 0 ? `
  <div class="bank-accounts">
    <div class="bank-title">Cuentas bancarias para depósito del anticipo</div>
    <ul class="bank-list">
      ${cuentas.map((c: CuentaBancaria) => `<li><strong>${escaparHtml(c.banco)} (${escaparHtml(c.moneda)}):</strong> ${escaparHtml(c.numero)}${c.titular ? ` · ${escaparHtml(c.titular)}` : ''}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>¡Gracias por confiar en <strong>${escaparHtml(parametros.nombre_negocio || 'Glow Heaven')}</strong> para tus prendas favoritas! ✈️🛍️</p>
    <p>Por favor compártenos la captura de tu transferencia bancaria para colocar tu pedido de inmediato.</p>
  </div>
</body>
</html>`;
}

/**
 * Imprime el documento abriendo una ventana de impresión limpia del navegador.
 */
export function imprimirHtml(html: string): void {
  const printWindow = window.open('', '_blank', 'width=850,height=900');
  if (!printWindow) {
    // Fallback con iframe invisible si popups están bloqueados
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 2000);
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}
