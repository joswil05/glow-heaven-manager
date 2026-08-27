-- ============================================================================
-- Glow Heaven Manager - Esquema de Base de Datos SQLite (20 Tablas + 6 Vistas)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Parámetros Globales del Sistema
CREATE TABLE IF NOT EXISTS parametros (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'text', -- 'text', 'integer', 'json', 'boolean'
    descripcion TEXT,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Categorías de Productos
CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    comision_defecto_bp INTEGER NOT NULL, -- basis points (ej: 3500 = 35%)
    arancel_estimado_bp INTEGER NOT NULL DEFAULT 3000, -- basis points (ej: 3000 = 30%)
    redondeo_cor_cents INTEGER NOT NULL DEFAULT 5000, -- C$50 = 5000 centavos
    activa INTEGER NOT NULL DEFAULT 1
);

-- 3. Tiendas en USA
CREATE TABLE IF NOT EXISTS tiendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    url_base TEXT,
    tax_rate_bp INTEGER NOT NULL DEFAULT 700, -- 700 = 7.00% (Amazon = 0)
    activa INTEGER NOT NULL DEFAULT 1
);

-- 4. Directorio de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    alias TEXT,
    telefono TEXT NOT NULL,
    direccion TEXT,
    ciudad TEXT NOT NULL DEFAULT 'León', -- 'León', 'Chichigalpa', 'Managua', 'Otro'
    cedula TEXT,
    notas TEXT,
    incumplio_anteriormente INTEGER NOT NULL DEFAULT 0, -- 1 sugiere 70% anticipo
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Cotizaciones
CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    cliente_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    valida_hasta DATE NOT NULL,
    tasa_cambio_cents INTEGER NOT NULL, -- Tasa congelada (C$ por 1 USD * 100)
    tarifa_flete_cents_lb INTEGER NOT NULL, -- Tarifa flete congelada ($ / lb * 100)
    estado TEXT NOT NULL DEFAULT 'BORRADOR', -- 'BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'
    subtotal_usa_usd_cents INTEGER NOT NULL DEFAULT 0,
    tax_usa_total_usd_cents INTEGER NOT NULL DEFAULT 0,
    flete_estimado_total_usd_cents INTEGER NOT NULL DEFAULT 0,
    arancel_estimado_total_usd_cents INTEGER NOT NULL DEFAULT 0,
    costo_aterrizado_total_usd_cents INTEGER NOT NULL DEFAULT 0,
    comision_total_cor_cents INTEGER NOT NULL DEFAULT 0,
    total_usd_cents INTEGER NOT NULL DEFAULT 0,
    total_cor_cents INTEGER NOT NULL DEFAULT 0,
    anticipo_bp INTEGER NOT NULL DEFAULT 5000, -- 5000 = 50%, 7000 = 70%
    anticipo_total_usd_cents INTEGER NOT NULL DEFAULT 0,
    anticipo_total_cor_cents INTEGER NOT NULL DEFAULT 0,
    saldo_total_usd_cents INTEGER NOT NULL DEFAULT 0,
    saldo_total_cor_cents INTEGER NOT NULL DEFAULT 0,
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- 6. Ítems de Cotización
CREATE TABLE IF NOT EXISTS cotizacion_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cotizacion_id INTEGER NOT NULL,
    tienda_id INTEGER,
    categoria_id INTEGER,
    descripcion TEXT NOT NULL,
    url TEXT,
    precio_usa_usd_cents INTEGER NOT NULL,
    tax_usa_usd_cents INTEGER NOT NULL DEFAULT 0,
    peso_mlb INTEGER NOT NULL, -- Milésimas de libra (1.5 lb = 1500)
    comision_bp INTEGER NOT NULL,
    comision_cor_cents INTEGER NOT NULL,
    arancel_estimado_usd_cents INTEGER NOT NULL DEFAULT 0,
    flete_estimado_usd_cents INTEGER NOT NULL DEFAULT 0,
    costo_aterrizado_estimado_usd_cents INTEGER NOT NULL,
    precio_final_usd_cents INTEGER NOT NULL,
    precio_final_cor_cents INTEGER NOT NULL,
    anticipo_usd_cents INTEGER NOT NULL,
    anticipo_cor_cents INTEGER NOT NULL,
    saldo_usd_cents INTEGER NOT NULL,
    saldo_cor_cents INTEGER NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (tienda_id) REFERENCES tiendas(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- 7. Pedidos (Convertidos de cotización)
CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    cotizacion_id INTEGER UNIQUE,
    cliente_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    tasa_cambio_cents INTEGER NOT NULL, -- Congelada
    estado_derivado TEXT NOT NULL DEFAULT 'PENDIENTE_ANTICIPO',
    requiere_atencion INTEGER NOT NULL DEFAULT 0,
    anticipo_verificado INTEGER NOT NULL DEFAULT 0,
    total_usd_cents INTEGER NOT NULL,
    total_cor_cents INTEGER NOT NULL,
    anticipo_esperado_cor_cents INTEGER NOT NULL DEFAULT 0,
    saldo_pendiente_cor_cents INTEGER NOT NULL,
    saldo_pendiente_usd_cents INTEGER NOT NULL,
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- 8. Ítems del Pedido (Unidad de estado de compra y logística)
CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    cotizacion_item_id INTEGER,
    lote_id INTEGER,
    tienda_id INTEGER,
    categoria_id INTEGER,
    descripcion TEXT NOT NULL,
    url TEXT,
    precio_usa_usd_cents INTEGER NOT NULL,
    tax_usa_usd_cents INTEGER NOT NULL DEFAULT 0,
    peso_mlb INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE_ANTICIPO',
    costo_aterrizado_estimado_cents INTEGER NOT NULL DEFAULT 0,
    costo_aterrizado_real_cents INTEGER NOT NULL DEFAULT 0,
    margen_real_cents INTEGER NOT NULL DEFAULT 0,
    prioridad INTEGER NOT NULL DEFAULT 1, -- 1 normal, 2 alta
    notas_tolerancia TEXT,
    sustituto_de_item_id INTEGER,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (cotizacion_item_id) REFERENCES cotizacion_items(id),
    FOREIGN KEY (lote_id) REFERENCES lotes(id),
    FOREIGN KEY (tienda_id) REFERENCES tiendas(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    FOREIGN KEY (sustituto_de_item_id) REFERENCES pedido_items(id)
);

-- 9. Lotes de Importación USA
CREATE TABLE IF NOT EXISTS lotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    fecha_creacion DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'ABIERTO', -- 'ABIERTO', 'COMPRADO', 'EN_TRANSITO', 'EN_NICARAGUA', 'LIQUIDADO'
    flete_real_usd_cents INTEGER NOT NULL DEFAULT 0,
    arancel_real_usd_cents INTEGER NOT NULL DEFAULT 0,
    casillero_real_usd_cents INTEGER NOT NULL DEFAULT 0,
    otros_costos_usd_cents INTEGER NOT NULL DEFAULT 0,
    tracking_usa TEXT,
    tracking_mianica TEXT,
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Costos Detallados del Lote
CREATE TABLE IF NOT EXISTS lote_costos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id INTEGER NOT NULL,
    tipo_costo TEXT NOT NULL, -- 'FLETE', 'ARANCEL', 'IVA_ADUANA', 'CASILLERO', 'HANDLING', 'SEGURO', 'EMPAQUE', 'OTRO'
    concepto TEXT NOT NULL,
    monto_usd_cents INTEGER NOT NULL,
    base_prorrateo TEXT NOT NULL, -- 'PESO', 'VALOR', 'UNIDAD'
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE CASCADE
);

-- 11. Pagos de Clientes (Anticipos y Saldos)
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    monto_usd_cents INTEGER NOT NULL DEFAULT 0,
    monto_cor_cents INTEGER NOT NULL DEFAULT 0,
    moneda_pago TEXT NOT NULL DEFAULT 'COR', -- 'COR' o 'USD'
    tasa_cambio_cents INTEGER NOT NULL,
    metodo_pago TEXT NOT NULL, -- 'TRANSFERENCIA_BAC', 'TRANSFERENCIA_BANPRO', 'TRANSFERENCIA_LAFISE', 'EFECTIVO', 'OTRO'
    referencia TEXT,
    verificado INTEGER NOT NULL DEFAULT 0,
    tipo_pago TEXT NOT NULL DEFAULT 'ANTICIPO', -- 'ANTICIPO', 'SALDO', 'COMPLETO'
    comprobante_adjunto_id INTEGER,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (comprobante_adjunto_id) REFERENCES adjuntos(id)
);

-- 12. Adjuntos (Comprobantes y Fotos)
CREATE TABLE IF NOT EXISTS adjuntos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entidad_tipo TEXT NOT NULL, -- 'PEDIDO', 'PAGO', 'ITEM', 'STOCK'
    entidad_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'COMPROBANTE', -- 'COMPROBANTE', 'FOTO_PRODUCTO', 'OTRO'
    ruta_archivo TEXT NOT NULL,
    nombre_original TEXT NOT NULL,
    mime_type TEXT,
    tamano_bytes INTEGER NOT NULL DEFAULT 0,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. Eventos y Auditoría (Motor de Deshacer Ctrl+Z)
CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_grupo_id TEXT NOT NULL, -- UUID de la acción de usuario para Deshacer
    entidad_tipo TEXT NOT NULL, -- 'PEDIDO_ITEM', 'PEDIDO', 'COTIZACION', 'PAGO', 'LOTE'
    entidad_id INTEGER NOT NULL,
    tipo_evento TEXT NOT NULL, -- 'CAMBIO_ESTADO', 'CREACION', 'MODIFICACION', 'PAGO_VERIFICADO'
    estado_anterior TEXT,
    estado_nuevo TEXT,
    valor_anterior TEXT, -- JSON con snapshot antes de mutar
    valor_nuevo TEXT,    -- JSON con snapshot tras mutar
    detalle TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Stock Propio
CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_item_id_origen INTEGER,
    descripcion TEXT NOT NULL,
    categoria_id INTEGER,
    tienda_id INTEGER,
    costo_aterrizado_cents INTEGER NOT NULL,
    precio_venta_sugerido_usd_cents INTEGER NOT NULL,
    precio_venta_sugerido_cor_cents INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'DISPONIBLE', -- 'DISPONIBLE', 'RESERVADO', 'VENDIDO', 'DESCARTADO'
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_item_id_origen) REFERENCES pedido_items(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id),
    FOREIGN KEY (tienda_id) REFERENCES tiendas(id)
);

-- 15. Rutas de Entrega
CREATE TABLE IF NOT EXISTS rutas_entrega (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE NOT NULL,
    repartidor TEXT NOT NULL DEFAULT 'Personal',
    estado TEXT NOT NULL DEFAULT 'PLANIFICADA', -- 'PLANIFICADA', 'EN_CURSO', 'COMPLETADA'
    notas TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Paradas de Ruta
CREATE TABLE IF NOT EXISTS ruta_paradas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ruta_id INTEGER NOT NULL,
    pedido_id INTEGER NOT NULL,
    orden_visita INTEGER NOT NULL DEFAULT 0,
    ciudad TEXT NOT NULL,
    direccion TEXT NOT NULL,
    saldo_cobrar_cor_cents INTEGER NOT NULL,
    saldo_cobrar_usd_cents INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'ENTREGADO', 'NO_ESTABA', 'REPROGRAMADO'
    notas TEXT,
    FOREIGN KEY (ruta_id) REFERENCES rutas_entrega(id) ON DELETE CASCADE,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

-- 17. Plantillas de Mensajes
CREATE TABLE IF NOT EXISTS plantillas_mensaje (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    contenido TEXT NOT NULL,
    activa INTEGER NOT NULL DEFAULT 1
);

-- 18. Cuentas Bancarias
CREATE TABLE IF NOT EXISTS cuentas_bancarias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    banco TEXT NOT NULL,
    moneda TEXT NOT NULL DEFAULT 'COR', -- 'COR' o 'USD'
    numero_cuenta TEXT NOT NULL,
    titular TEXT NOT NULL,
    tipo_cuenta TEXT NOT NULL DEFAULT 'Ahorro',
    activa INTEGER NOT NULL DEFAULT 1
);

-- 19. Alertas del Sistema
CREATE TABLE IF NOT EXISTS alertas_sistema (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL, -- 'ANTICIPO_VENCIDO', 'ITEM_NO_DISPONIBLE', 'CAMBIO_PRECIO', 'ENTREGA_PENDIENTE'
    entidad_tipo TEXT NOT NULL,
    entidad_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    resuelto INTEGER NOT NULL DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 20. Histórico de Tasas de Cambio BCN
CREATE TABLE IF NOT EXISTS historico_tasas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE NOT NULL UNIQUE,
    tasa_oficial_cents INTEGER NOT NULL,
    fuente TEXT DEFAULT 'BCN'
);

-- ============================================================================
-- VISTAS DEL SISTEMA (6 Vistas Clave)
-- ============================================================================

-- Vista 1: v_capital_libre
CREATE VIEW IF NOT EXISTS v_capital_libre AS
SELECT 
    COALESCE(SUM(CASE WHEN p.tipo_pago = 'ANTICIPO' AND p.verificado = 1 THEN p.monto_cor_cents ELSE 0 END), 0) AS total_anticipos_recibidos_cor_cents,
    COALESCE(SUM(CASE WHEN p.tipo_pago = 'SALDO' AND p.verificado = 1 THEN p.monto_cor_cents ELSE 0 END), 0) AS total_saldos_cobrados_cor_cents,
    COALESCE(SUM(CASE WHEN ped.activo = 1 THEN ped.saldo_pendiente_cor_cents ELSE 0 END), 0) AS total_por_cobrar_cor_cents
FROM pedidos ped
LEFT JOIN pagos p ON ped.id = p.pedido_id AND p.activo = 1;

-- Vista 2: v_semaforo_compras
CREATE VIEW IF NOT EXISTS v_semaforo_compras AS
SELECT 
    ped.id AS pedido_id,
    ped.codigo AS pedido_codigo,
    c.nombre AS cliente_nombre,
    c.telefono AS cliente_telefono,
    ped.total_cor_cents,
    ped.total_usd_cents,
    ped.anticipo_esperado_cor_cents,
    COALESCE(SUM(CASE WHEN pag.verificado = 1 THEN pag.monto_cor_cents ELSE 0 END), 0) AS anticipo_pagado_cor_cents,
    CASE 
        WHEN ped.anticipo_verificado = 1 THEN 'VERDE'
        WHEN COALESCE(SUM(pag.monto_cor_cents), 0) > 0 THEN 'AMARILLO'
        ELSE 'ROJO'
    END AS color_semaforo,
    CASE 
        WHEN ped.anticipo_verificado = 1 THEN 'Listo para comprar en USA'
        WHEN COALESCE(SUM(pag.monto_cor_cents), 0) > 0 THEN 'Anticipo registrado, pendiente de verificar en banco'
        ELSE 'Sin anticipo (Bloqueado para compras)'
    END AS estado_descripcion,
    ped.requiere_atencion,
    ped.estado_derivado
FROM pedidos ped
JOIN clientes c ON ped.cliente_id = c.id
LEFT JOIN pagos pag ON ped.id = pag.pedido_id AND pag.tipo_pago = 'ANTICIPO' AND pag.activo = 1
WHERE ped.activo = 1 AND ped.estado_derivado IN ('PENDIENTE_ANTICIPO', 'ANTICIPO_OK', 'EN_LISTA_USA')
GROUP BY ped.id;

-- Vista 3: v_lista_compras_usa
CREATE VIEW IF NOT EXISTS v_lista_compras_usa AS
SELECT 
    pi.id AS item_id,
    ped.id AS pedido_id,
    ped.codigo AS pedido_codigo,
    c.nombre AS cliente_nombre,
    t.nombre AS tienda_nombre,
    cat.nombre AS categoria_nombre,
    pi.descripcion,
    pi.url,
    pi.precio_usa_usd_cents,
    pi.tax_usa_usd_cents,
    pi.peso_mlb,
    pi.prioridad,
    pi.notas_tolerancia,
    pi.estado AS item_estado
FROM pedido_items pi
JOIN pedidos ped ON pi.pedido_id = ped.id
JOIN clientes c ON ped.cliente_id = c.id
LEFT JOIN tiendas t ON pi.tienda_id = t.id
LEFT JOIN categorias cat ON pi.categoria_id = cat.id
WHERE pi.activo = 1 
  AND ped.activo = 1
  AND ped.anticipo_verificado = 1
  AND pi.estado = 'EN_LISTA_USA'
ORDER BY t.nombre ASC, pi.prioridad DESC, pi.id ASC;

-- Vista 4: v_ruta_hoy
CREATE VIEW IF NOT EXISTS v_ruta_hoy AS
SELECT 
    rp.id AS parada_id,
    r.fecha AS fecha_ruta,
    rp.orden_visita,
    c.nombre AS cliente_nombre,
    c.telefono AS cliente_telefono,
    rp.ciudad,
    rp.direccion,
    rp.saldo_cobrar_cor_cents,
    rp.saldo_cobrar_usd_cents,
    rp.estado AS estado_parada,
    ped.codigo AS pedido_codigo
FROM ruta_paradas rp
JOIN rutas_entrega r ON rp.ruta_id = r.id
JOIN pedidos ped ON rp.pedido_id = ped.id
JOIN clientes c ON ped.cliente_id = c.id
WHERE r.activo = 1 AND r.fecha = DATE('now');

-- Vista 5: v_margen_real
CREATE VIEW IF NOT EXISTS v_margen_real AS
SELECT 
    pi.id AS item_id,
    ped.codigo AS pedido_codigo,
    c.nombre AS cliente_nombre,
    pi.descripcion,
    pi.costo_aterrizado_estimado_cents,
    pi.costo_aterrizado_real_cents,
    ci.precio_final_cor_cents,
    (ci.precio_final_cor_cents - (pi.costo_aterrizado_real_cents * ped.tasa_cambio_cents / 100)) AS margen_real_cor_cents,
    CASE 
        WHEN ci.precio_final_cor_cents > 0 THEN 
            CAST(((ci.precio_final_cor_cents - (pi.costo_aterrizado_real_cents * ped.tasa_cambio_cents / 100)) * 10000 / ci.precio_final_cor_cents) AS INTEGER)
        ELSE 0
    END AS margen_real_bp
FROM pedido_items pi
JOIN pedidos ped ON pi.pedido_id = ped.id
JOIN cotizacion_items ci ON pi.cotizacion_item_id = ci.id
JOIN clientes c ON ped.cliente_id = c.id
WHERE pi.costo_aterrizado_real_cents > 0;

-- Vista 6: v_alertas
CREATE VIEW IF NOT EXISTS v_alertas AS
SELECT 
    'ITEM_EXCEPTION' AS tipo_alerta,
    'Urgente: Decisión requerida' AS severidad,
    pi.id AS entidad_id,
    'pedido_items' AS entidad_tipo,
    ped.id AS pedido_id,
    c.nombre AS cliente_nombre,
    c.telefono AS cliente_telefono,
    CASE 
        WHEN pi.estado = 'NO_DISPONIBLE' THEN 'No disponible en tienda: ' || pi.descripcion || ' (' || c.nombre || ')'
        WHEN pi.estado = 'CAMBIO_PRECIO' THEN 'Cambió de precio en tienda: ' || pi.descripcion || ' (' || c.nombre || ')'
        WHEN pi.estado = 'SUSTITUTO_PROPUESTO' THEN 'Sustituto propuesto: ' || pi.descripcion || ' (' || c.nombre || ')'
        ELSE pi.descripcion
    END AS mensaje,
    pi.estado AS detalle_estado
FROM pedido_items pi
JOIN pedidos ped ON pi.pedido_id = ped.id
JOIN clientes c ON ped.cliente_id = c.id
WHERE pi.activo = 1 AND pi.estado IN ('NO_DISPONIBLE', 'CAMBIO_PRECIO', 'SUSTITUTO_PROPUESTO')

UNION ALL

SELECT 
    'ANTICIPO_PENDIENTE' AS tipo_alerta,
    'Advertencia: Anticipo pendiente' AS severidad,
    ped.id AS entidad_id,
    'pedidos' AS entidad_tipo,
    ped.id AS pedido_id,
    c.nombre AS cliente_nombre,
    c.telefono AS cliente_telefono,
    'Anticipo pendiente de verificar para ' || c.nombre || ' (' || ped.codigo || ') por C$ ' || CAST(ped.anticipo_esperado_cor_cents / 100 AS TEXT) AS mensaje,
    ped.estado_derivado AS detalle_estado
FROM pedidos ped
JOIN clientes c ON ped.cliente_id = c.id
WHERE ped.activo = 1 AND ped.anticipo_verificado = 0 AND ped.estado_derivado = 'PENDIENTE_ANTICIPO';
