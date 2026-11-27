/**
 * =====================================================================================
 *  IMCOLMETRIC S.A.S. - SISTEMA DE GESTIÓN DE CALIDAD (SGC)
 *  MÓDULO: VENTAS DE SERVICIOS                                   Archivo: Ventas.gs
 * =====================================================================================
 *  Procedimiento de gestión de ventas y contratación (numerales 5.1 a 5.10)
 *  ISO/IEC 17025:2017 numeral 7.1 - Revisión de solicitudes, ofertas y contratos.
 *
 *  Formatos asociados:
 *    GCV-FO-001  Contrato de compraventa            (Google Docs, marcadores {{...}})
 *    GCV-FO-002  Orden de trabajo interna            (Google Sheets, registro de OT)
 *    GCV-FO-003  Cotizaciones                        (Google Sheets)
 *    GCV-FO-004  Solicitud de calibración de equipos (Google Sheets)
 *    GCV-FO-005  Portafolio de servicios con precios (hoja VENTAS_SERVICIOS)
 *    GCO-FO-006  Envío a proveedor / tercerizado     (referenciado en VENTAS_TERCERIZADOS)
 *
 *  Módulo INDEPENDIENTE de Compras y Calidad: todas las funciones globales usan el
 *  prefijo "ventas" / "VENTAS_" y las privadas terminan en "_" para no chocar con
 *  funciones de otros archivos del mismo proyecto de Apps Script.
 *
 *  INSTALACIÓN RÁPIDA (integrado al portal IMCOLMETRIC)
 *   1. Crear los archivos Ventas.gs y Ventasvista.gs en el proyecto de Apps Script.
 *      El portal (index.html) abre el módulo con el botón "Ventas" del menú lateral.
 *   2. Ejecutar una vez ventasInstalar() desde el editor -> crea las hojas, carga los usuarios
 *      del portal en VENTAS_USUARIOS y crea los disparadores de alertas y encuestas.
 *   3. Configurar las Propiedades del script (Configuración del proyecto > Propiedades):
 *        VENTAS_SS_ID           ID del Google Sheets base de datos (vacío = la misma hoja del portal)
 *        VENTAS_CARPETA_ID      Carpeta de Drive donde se guardan los documentos generados
 *        VENTAS_PLANTILLA_FO001 ID de la plantilla Google Docs de GCV-FO-001
 *        VENTAS_PLANTILLA_FO003 ID de la plantilla Google Sheets de GCV-FO-003
 *        VENTAS_PLANTILLA_FO004 ID de la plantilla Google Sheets de GCV-FO-004
 *        VENTAS_REGISTRO_FO002  ID del Google Sheets de registro GCV-FO-002 (OT)
 *        VENTAS_WA_PROVEEDOR    CALLMEBOT | META | NINGUNO (vacío = CALLMEBOT si el usuario tiene API key)
 *        VENTAS_WA_TOKEN        Token de Meta WhatsApp Cloud API (CallMeBot usa la API key de cada
 *                               usuario, columna APIKEY_WHATSAPP de VENTAS_USUARIOS)
 *        VENTAS_WA_PHONE_ID     (solo META) Phone Number ID
 *        VENTAS_URL_ENCUESTA    Enlace del formulario de encuesta de satisfacción
 *        VENTAS_URL_PQRSF       Enlace al gestor de PQRSF / no conformidades
 *   4. Revisar en VENTAS_USUARIOS el ROL de cada usuario (COMERCIAL, LABORATORIO, DIRECTOR_TECNICO,
 *      CALIDAD, GERENCIA, FACTURACION), su TELEFONO y su APIKEY_WHATSAPP.
 *   5. Implementar una nueva versión de la aplicación web del portal.
 * =====================================================================================
 */

/* ===================================== CONFIGURACIÓN ================================ */

var VENTAS_CFG = {
  EMPRESA: 'IMCOLMETRIC S.A.S.',
  ZONA_HORARIA: 'America/Bogota',
  PREFIJO_WA_PAIS: '57',

  DIAS_RESPUESTA_COTIZACION: 2,   // días hábiles para emitir cotización desde la recepción
  DIAS_SEGUIMIENTO: 5,            // días hábiles sin seguimiento => alerta (X días)
  DIAS_VALIDEZ_OFERTA: 15,        // vigencia de la oferta (GCV-FO-003 cond. 8)
  DIAS_ALERTA_ENTREGA: 2,         // días hábiles antes del vencimiento => alerta
  DIAS_ALERTA_TERCERIZADO: 15,    // días hábiles fuera sin retorno => alerta
  SEMAFORO_AMARILLO: 0.7,         // % del plazo consumido para pasar a amarillo
  IVA_DEFECTO: 19,
  PLAZO_TERCERIZADO: 15,          // días hábiles (GCV-FO-003 cond. 4)

  // Plazo de entrega por magnitud en días hábiles (GCV-FO-003 cond. 4)
  MAGNITUDES: {
    'Temperatura de contacto': 8,
    'Temperatura y humedad relativa': 8,
    'Instrumentos de pesaje de funcionamiento no automático': 8,
    'Presión relativa': 8,
    'Equipos biomédicos': 8,
    'Otra': 8
  },

  CANALES: ['Correo electrónico', 'WhatsApp', 'Teléfono', 'Licitación', 'Presencial', 'Otro'],
  TIPOS_CLIENTE: ['Privado', 'Público'],
  LUGARES: ['Instalaciones del laboratorio', 'En sitio'],
  RESULTADOS_REVISION: ['Capacidad confirmada', 'Con desviación', 'No atendible'],
  REGLAS_DECISION: [
    'Binaria de aceptación simple (riesgo hasta 50%)',
    'Binaria con zona de seguridad (riesgo ≤ 2,5%, W = U)',
    'No binaria con zona de seguridad'
  ],
  // Los servicios del laboratorio siempre se formalizan con orden de servicio y/o contrato (la orden de compra es solo de Compras)
  TIPOS_ACEPTACION: ['Orden de servicio', 'Contrato privado', 'Contrato público'],
  // Clientes con contrato: la operación arranca desde la orden de servicio, sin cotización ni seguimiento comercial
  TIPOS_CONTRATO: ['Contrato privado', 'Contrato público', 'Orden de servicio'],
  MOTIVOS_DESISTIMIENTO: ['Precio', 'Tiempo de entrega', 'Sin capacidad técnica', 'Cliente no responde', 'Eligió otro proveedor', 'Presupuesto', 'Otro'],
  ROLES: ['COMERCIAL', 'LABORATORIO', 'DIRECTOR_TECNICO', 'CALIDAD', 'GERENCIA', 'FACTURACION']
};

var VENTAS_ESTADOS = [
  'Recibida',
  'En revisión de requisitos',
  'Cotizada',
  'En seguimiento',
  'Cerrada por venta',
  'Cerrada por desistimiento',
  'Solicitud de calibración recibida',
  'Programada',
  'En ejecución',
  'En servicio tercerizado',
  'Resultados emitidos',
  'Entregada',
  'Facturada',
  'Postventa'
];

/** Transiciones permitidas del flujo (5.1 a 5.10). */
var VENTAS_TRANSICIONES = {
  'Recibida': ['En revisión de requisitos', 'Cerrada por desistimiento'],
  'En revisión de requisitos': ['Cotizada', 'Cerrada por desistimiento'],
  'Cotizada': ['En seguimiento', 'Cerrada por venta', 'Cerrada por desistimiento', 'En revisión de requisitos'],
  'En seguimiento': ['Cerrada por venta', 'Cerrada por desistimiento', 'En revisión de requisitos'],
  'Cerrada por venta': ['Solicitud de calibración recibida'],
  'Cerrada por desistimiento': [],
  'Solicitud de calibración recibida': ['Programada'],
  'Programada': ['En ejecución', 'En servicio tercerizado'],
  'En ejecución': ['En servicio tercerizado', 'Resultados emitidos'],
  'En servicio tercerizado': ['En ejecución', 'Resultados emitidos'],
  'Resultados emitidos': ['Entregada'],
  'Entregada': ['Facturada'],
  'Facturada': ['Postventa'],
  'Postventa': []
};

/** Estados en los que el trabajo ya inició (aplican 5.5 y 5.6 con re-revisión). */
var VENTAS_ESTADOS_TRABAJO_INICIADO = ['Programada', 'En ejecución', 'En servicio tercerizado', 'Resultados emitidos'];

/** Estructura de hojas (base de datos). */
var VENTAS_HOJAS = {
  SOLICITUDES: {
    nombre: 'VENTAS_SOLICITUDES',
    columnas: ['ID', 'VERSION', 'FECHA_RECEPCION', 'CANAL', 'CLIENTE_NIT', 'CLIENTE', 'CONTACTO',
      'TELEFONO_CONTACTO', 'CORREO_CONTACTO', 'TIPO_CLIENTE', 'COMERCIAL', 'ESTADO', 'REFERENCIA',
      'LUGAR_SERVICIO', 'VALOR_SUBTOTAL', 'VALOR_IVA', 'VALOR_TOTAL',
      'F_REVISION', 'F_COTIZADA', 'F_ULTIMO_SEGUIMIENTO', 'F_PROXIMO_SEGUIMIENTO', 'F_ACEPTADA',
      'F_SOLICITUD_CAL', 'CONSECUTIVO_FO004', 'F_LLEGADA_EQUIPOS', 'F_PROGRAMADA', 'F_EJECUCION',
      'F_RESULTADOS', 'F_ENTREGADA', 'F_FACTURADA', 'NUM_FACTURA', 'F_COMPROMISO', 'F_CIERRE',
      'TIPO_CIERRE', 'MOTIVO_CIERRE', 'TIPO_ACEPTACION', 'NUM_CONTRATO', 'NUM_OT',
      'ACT_FO003', 'ACT_FO004', 'REVISION_CONTRATO_REABIERTA',
      'URL_FO001', 'URL_FO002', 'URL_FO003', 'URL_FO004', 'OBSERVACIONES',
      'CREADO_POR', 'F_CREACION', 'F_ACTUALIZACION', 'URL_SOLICITUD_CLIENTE',
      // Ruta del servicio (GCV-FO-004 "El servicio solicitado ha sido tercerizado"): NO = lo hace el laboratorio; SI = tercero en Sitio o en su Laboratorio
      'TERCERIZADO', 'MODALIDAD_TERCERO', 'NUM_SOL_COMPRA', 'NUM_OC_TERCERO', 'PROVEEDOR_TERCERO',
      // ALCANCE_LAB: ¿el servicio está dentro del alcance del laboratorio (MT-FO-006)? · TERCERIZADO_A_IMC: casilla de la SC, el cliente subcontrató el servicio a IMCOLMETRIC
      'ALCANCE_LAB', 'TERCERIZADO_A_IMC',
      // Cotización cargada (GCV-FO-003 en PDF, Word o Excel) y su valor
      'URL_COTIZACION', 'NUM_COTIZACION_DOC', 'VALOR_COTIZACION',
      // GCV-FO-004: correo al que se envían los certificados
      'CORREO_CERTIFICADO']
  },
  EQUIPOS: {
    nombre: 'VENTAS_EQUIPOS',
    columnas: ['ID_EQUIPO', 'ID_SOLICITUD', 'ITEM', 'MAGNITUD', 'EQUIPO', 'MARCA', 'MODELO', 'SERIE',
      'CODIGO_INVENTARIO', 'UBICACION', 'RANGO', 'PUNTOS_CALIBRACION', 'METODO', 'INCERTIDUMBRE',
      'EMP', 'COND_AMBIENTALES', 'CRITERIO_ACEPTACION', 'TIPO_SERVICIO', 'PLAZO_DIAS', 'F_COMPROMISO',
      'CANTIDAD', 'VALOR_UNITARIO', 'IVA_PCT', 'ESTADO_EQUIPO', 'OBSERVACIONES']
  },
  REVISION: {
    nombre: 'VENTAS_REVISION',
    columnas: ['ID_REVISION', 'ID_SOLICITUD', 'VERSION', 'TIPO_REVISION', 'FECHA',
      'PERSONAL_COMPETENTE', 'PATRONES', 'METODO', 'INSTALACIONES', 'COND_AMBIENTALES',
      'RESULTADO', 'DESVIACION', 'F_CLIENTE_NOTIFICADO', 'MEDIO_NOTIFICACION', 'NUEVA_COTIZACION',
      'RESP_TECNICO', 'RESP_COMERCIAL', 'OBSERVACIONES', 'USUARIO']
  },
  CONFORMIDAD: {
    nombre: 'VENTAS_CONFORMIDAD',
    columnas: ['ID_SOLICITUD', 'SOLICITA_DECLARACION', 'NORMA_ESPECIFICACION', 'REGLA_DECISION',
      'VALIDACION', 'ADVERTENCIAS', 'ACEPTADA_POR_CLIENTE', 'FECHA', 'USUARIO']
  },
  TERCERIZADOS: {
    nombre: 'VENTAS_TERCERIZADOS',
    columnas: ['ID_TERC', 'ID_SOLICITUD', 'ID_EQUIPO', 'EQUIPO', 'PROVEEDOR', 'NUM_GCO_FO_006',
      'F_SALIDA', 'F_ENTRADA_ESPERADA', 'F_ENTRADA', 'NUM_CERTIFICADO', 'CERT_REVISADO',
      'F_REVISION_CERT', 'REVISADO_POR', 'ENTREGABLE_VERIFICADO', 'ESTADO', 'OBSERVACIONES']
  },
  HISTORIAL: {
    nombre: 'VENTAS_HISTORIAL',
    columnas: ['FECHA', 'ID_SOLICITUD', 'USUARIO', 'ACCION', 'ESTADO_ANTERIOR', 'ESTADO_NUEVO',
      'OBSERVACION', 'POSTERIOR_INICIO_TRABAJO', 'PERSONAL_COMUNICADO']
  },
  POSTVENTA: {
    nombre: 'VENTAS_POSTVENTA',
    columnas: ['ID_POST', 'PERIODO', 'CLIENTE_NIT', 'CLIENTE', 'ID_SOLICITUDES', 'F_ENVIO',
      'F_RESPUESTA', 'CALIFICACION', 'COMENTARIOS', 'PQRSF_NUM', 'PQRSF_TIPO', 'PQRSF_ESTADO',
      'PQRSF_ENLACE', 'ESTADO']
  },
  CLIENTES: {
    nombre: 'VENTAS_CLIENTES',
    columnas: ['NIT', 'NOMBRE', 'TIPO_CLIENTE', 'CONTACTO', 'TELEFONO', 'CORREO', 'DIRECCION',
      'CIUDAD', 'CORREO_FACTURACION', 'F_REGISTRO', 'OBSERVACIONES', 'CORREO_CERTIFICADO']
  },
  // Contratos con clientes: bajo un contrato vigente se trabaja con órdenes de servicio, sin cotización
  CONTRATOS: {
    nombre: 'VENTAS_CONTRATOS',
    columnas: ['NUM_CONTRATO', 'CLIENTE_NIT', 'CLIENTE', 'TIPO', 'OBJETO', 'F_INICIO', 'F_FIN', 'VALOR', 'ESTADO',
      'OBSERVACIONES', 'F_REGISTRO']
  },
  VERSIONES: {
    nombre: 'VENTAS_VERSIONES',
    columnas: ['FECHA', 'ID_SOLICITUD', 'VERSION_ANTERIOR', 'VERSION_NUEVA', 'MOTIVO', 'TIPO',
      'USUARIO', 'SNAPSHOT_JSON']
  },
  USUARIOS: {
    nombre: 'VENTAS_USUARIOS',
    columnas: ['NOMBRE', 'CORREO', 'TELEFONO', 'ROL', 'ACTIVO', 'USUARIO_PORTAL', 'APIKEY_WHATSAPP']
  },
  SERVICIOS: {
    nombre: 'VENTAS_SERVICIOS',
    columnas: ['CODIGO', 'MAGNITUD', 'DESCRIPCION', 'VALOR', 'IVA_PCT', 'TIPO_SERVICIO', 'ACTIVO']
  },
  // GCV-FO-003 V3: cotizaciones hechas en el módulo (los ítems van en ITEMS_JSON)
  COTIZACIONES: {
    nombre: 'VENTAS_COTIZACIONES',
    columnas: ['NUMERO', 'FECHA', 'CLIENTE_NIT', 'CLIENTE', 'DIRECCION', 'CIUDAD', 'CONTACTO', 'TELEFONO', 'CORREO',
      'CORREO_CERTIFICADO', 'REFERENCIA', 'ITEMS_JSON', 'SUBTOTAL', 'IVA', 'TOTAL', 'OBSERVACIONES', 'ESTADO', 'MOTIVO_ESTADO',
      'ID_SOLICITUD', 'URL_PDF', 'CREADO_POR', 'F_CREACION', 'ACTUALIZADO_POR', 'F_ACTUALIZACION']
  },
  // GCV-FO-004 V2: campos del formato de solicitud de calibración registrados en la «Nueva solicitud»
  FO004: {
    nombre: 'VENTAS_FO004',
    columnas: ['ID_SOLICITUD', 'CONSECUTIVO', 'NUM_COTIZACION',
      'CERT_NOMBRE', 'CERT_DIRECCION', 'CERT_CIUDAD', 'CERT_CONTACTO', 'CERT_TELEFONO', 'CERT_CORREO',
      'REQUIERE_CONFORMIDAD', 'CONFORMIDAD_DOCUMENTO', 'REGLA_DECISION',
      'ENTREGA_MISMA_DIRECCION', 'ENTREGA_NOMBRE', 'ENTREGA_DIRECCION', 'ENTREGA_CIUDAD', 'ENTREGA_TELEFONO', 'ENTREGA_CORREO',
      'SITIO_CONTACTO', 'SITIO_DIRECCION', 'SITIO_TELEFONO', 'SITIO_CORREO',
      'FACT_NOMBRE', 'FACT_NIT', 'FACT_TELEFONO', 'FACT_CORREO', 'FACT_CIERRE_CONTABLE',
      'TERCERIZADO_A_IMC', 'USUARIO', 'FECHA']
  }
};

/* ===================================== INSTALACIÓN ================================== */

/** Crea las hojas faltantes y los disparadores. Ejecutar una vez manualmente. */
function ventasInstalar() { seguridadRPC_();
  ventasCrearHojas_();
  ventasInstalarDisparadores();
  return 'Módulo de Ventas instalado correctamente.';
}

function ventasCrearHojas_() {
  var ss = ventasSS_();
  Object.keys(VENTAS_HOJAS).forEach(function (k) {
    var def = VENTAS_HOJAS[k];
    var sh = ss.getSheetByName(def.nombre);
    if (!sh) sh = ss.insertSheet(def.nombre);
    var actuales = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    // agrega columnas nuevas al final sin romper datos existentes
    var faltantes = def.columnas.filter(function (c) { return actuales.indexOf(c) === -1; });
    if (actuales.filter(String).length === 0) {
      sh.getRange(1, 1, 1, def.columnas.length).setValues([def.columnas]);
    } else if (faltantes.length) {
      sh.getRange(1, actuales.length + 1, 1, faltantes.length).setValues([faltantes]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#0b3d6b').setFontColor('#ffffff');
  });
  ventasSembrarUsuarios_();
}

/* ============================ USUARIOS DEL PORTAL ================================== */

function ventasNorm_(v) {
  return String(v === null || v === undefined ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Usuarios activos de la hoja "Usuarios" del portal (la del ingreso al sistema). */
function ventasUsuariosPortal_() {
  var sh = SpreadsheetApp.openById(VENTAS_ID_HOJA_PORTAL).getSheetByName('Usuarios');
  if (!sh || sh.getLastRow() < 2) return [];
  var datos = sh.getDataRange().getValues();
  var enc = datos[0].map(ventasNorm_);
  var col = function (nombres, def) {
    for (var i = 0; i < enc.length; i++) if (nombres.indexOf(enc[i]) > -1) return i;
    return def;
  };
  var cU = col(['usuario'], 1), cC = col(['correo', 'email', 'correo electronico'], 2), cCa = col(['cargo'], 4),
    cN = col(['nombre completo', 'nombre'], 5), cE = col(['estado'], 6);
  return datos.slice(1).filter(function (f) { return ventasNorm_(f[cE]) === 'activo' && String(f[cU]).trim(); }).map(function (f) {
    return { usuario: String(f[cU]).trim(), nombre: String(f[cN] || f[cU]).trim(), cargo: String(f[cCa] || '').trim(), correo: String(f[cC] || '').trim() };
  });
}

/** Rol sugerido según el cargo del usuario en el portal. */
function ventasRolPorCargo_(cargo) {
  var c = ventasNorm_(cargo);
  if (c.indexOf('gerent') > -1) return 'GERENCIA';
  if (c.indexOf('comercial') > -1 || c.indexOf('ventas') > -1 || c.indexOf('asesor') > -1) return 'COMERCIAL';
  if (c.indexOf('director') > -1 && (c.indexOf('laborator') > -1 || c.indexOf('tecnic') > -1)) return 'DIRECTOR_TECNICO';
  if (c.indexOf('metrolog') > -1 || c.indexOf('laborator') > -1 || c.indexOf('tecnic') > -1) return 'LABORATORIO';
  if (c.indexOf('calidad') > -1) return 'CALIDAD';
  if (c.indexOf('contab') > -1 || c.indexOf('factur') > -1 || c.indexOf('cartera') > -1) return 'FACTURACION';
  return '';
}

/** Si VENTAS_USUARIOS está vacía, la llena con los usuarios activos del portal (rol sugerido por cargo). */
function ventasSembrarUsuarios_() {
  var sh = ventasSS_().getSheetByName(VENTAS_HOJAS.USUARIOS.nombre);
  if (!sh || sh.getLastRow() > 1) return;
  ventasUsuariosPortal_().forEach(function (u) {
    ventasInsertar_('USUARIOS', { NOMBRE: u.nombre, CORREO: u.correo, TELEFONO: '', ROL: ventasRolPorCargo_(u.cargo),
      ACTIVO: 'SI', USUARIO_PORTAL: u.usuario, APIKEY_WHATSAPP: '' });
  });
}

/** Instala el disparador diario (alertas) y el mensual (encuesta semestral). */
function ventasInstalarDisparadores() { seguridadRPC_();
  // ventasPublicarIndicadores se deja en la lista solo para borrar el disparador si quedó de una versión anterior
  var nombres = ['ventasRevisarAlertas', 'ventasEncuestaSemestral', 'ventasPublicarIndicadores'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (nombres.indexOf(t.getHandlerFunction()) > -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ventasRevisarAlertas').timeBased().everyDays(1).atHour(7).inTimezone(VENTAS_CFG.ZONA_HORARIA).create();
  ScriptApp.newTrigger('ventasEncuestaSemestral').timeBased().onMonthDay(1).atHour(8).inTimezone(VENTAS_CFG.ZONA_HORARIA).create();
  return 'Disparadores instalados.';
}

/* ===================================== UTILIDADES BD ================================ */

function ventasProp_(clave, defecto) {
  var v = PropertiesService.getScriptProperties().getProperty(clave);
  return (v === null || v === '') ? (defecto === undefined ? '' : defecto) : v;
}

// Hoja de cálculo del portal IMCOLMETRIC (base de datos por defecto del módulo y hoja "Usuarios")
var VENTAS_ID_HOJA_PORTAL = '1_njMVA5z2CEZojysjuIJSZWq_6HaFmY5aEx9JOb2cLQ';
var VENTAS_SS_CACHE = null;

function ventasSS_() {
  if (VENTAS_SS_CACHE) return VENTAS_SS_CACHE;
  var id = ventasProp_('VENTAS_SS_ID') || VENTAS_ID_HOJA_PORTAL;
  VENTAS_SS_CACHE = SpreadsheetApp.openById(id);
  return VENTAS_SS_CACHE;
}

function ventasHoja_(clave) {
  var def = VENTAS_HOJAS[clave];
  var sh = ventasSS_().getSheetByName(def.nombre);
  if (!sh) { ventasCrearHojas_(); sh = ventasSS_().getSheetByName(def.nombre); }
  return sh;
}

function ventasEncabezados_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

/** Lee una hoja como arreglo de objetos. Incluye _fila (número de fila real). */
function ventasLeer_(clave) {
  var sh = ventasHoja_(clave);
  var ult = sh.getLastRow();
  if (ult < 2) return [];
  var enc = ventasEncabezados_(sh);
  var datos = sh.getRange(2, 1, ult - 1, enc.length).getValues();
  var out = [];
  for (var i = 0; i < datos.length; i++) {
    if (datos[i].join('') === '') continue;
    var o = { _fila: i + 2 };
    for (var j = 0; j < enc.length; j++) o[enc[j]] = datos[i][j];
    out.push(o);
  }
  return out;
}

// Agrega al final las columnas definidas que le falten a una hoja ya existente
function ventasAsegurarColumnas_(clave) {
  var sh = ventasHoja_(clave), enc = ventasEncabezados_(sh);
  var faltan = VENTAS_HOJAS[clave].columnas.filter(function (c) { return enc.indexOf(c) === -1; });
  if (faltan.length) sh.getRange(1, enc.length + 1, 1, faltan.length).setValues([faltan]);
}
function ventasInsertar_(clave, obj) {
  var sh = ventasHoja_(clave);
  var enc = ventasEncabezados_(sh);
  var fila = enc.map(function (c) { return obj[c] === undefined ? '' : obj[c]; });
  sh.appendRow(fila);
  return sh.getLastRow();
}

/** Actualiza las columnas indicadas de una fila. */
function ventasActualizarFila_(clave, fila, cambios) {
  var sh = ventasHoja_(clave);
  var enc = ventasEncabezados_(sh);
  var rango = sh.getRange(fila, 1, 1, enc.length);
  var valores = rango.getValues()[0];
  Object.keys(cambios).forEach(function (k) {
    var idx = enc.indexOf(k);
    if (idx > -1) valores[idx] = cambios[k];
  });
  rango.setValues([valores]);
}

function ventasBuscar_(clave, campo, valor) {
  var lista = ventasLeer_(clave);
  for (var i = 0; i < lista.length; i++) if (String(lista[i][campo]) === String(valor)) return lista[i];
  return null;
}

function ventasFiltrar_(clave, campo, valor) {
  return ventasLeer_(clave).filter(function (r) { return String(r[campo]) === String(valor); });
}

function ventasEliminarFilas_(clave, filas) {
  if (!filas.length) return;
  var sh = ventasHoja_(clave);
  // Sheets no permite borrar todas las filas no congeladas: se garantiza una fila libre al final
  if (sh.getMaxRows() - filas.length <= 1) sh.insertRowsAfter(sh.getMaxRows(), 1);
  filas.sort(function (a, b) { return b - a; }).forEach(function (f) {
    if (typeof anotarEliminado_ === 'function') anotarEliminado_(sh, [sh.getRange(f, 1, 1, sh.getLastColumn()).getValues()[0]]);
    sh.deleteRow(f);
  });
}

/** Usuario del portal que hace la petición (lo fija ventasLlamar). */
var VENTAS_SESION = null;

function ventasUsuario_() {
  if (VENTAS_SESION) return VENTAS_SESION.nombre;
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { }
  return e || 'Sistema';
}

function ventasAhora_() { return new Date(); }

function ventasFecha_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v;
  var s = String(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? '' : d;
}

function ventasFmt_(d, patron) {
  d = ventasFecha_(d);
  if (!d) return '';
  return Utilities.formatDate(d, VENTAS_CFG.ZONA_HORARIA, patron || 'yyyy-MM-dd');
}

function ventasNum_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  var s = String(v).replace(/[^\d.,-]/g, '');
  if (s.indexOf('.') > -1 && s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');                                        // 0,005
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}

/** Convierte objetos con fechas a valores serializables para google.script.run. */
function ventasSerializar_(o) {
  if (o === null || o === undefined) return o;
  if (Array.isArray(o)) return o.map(ventasSerializar_);
  if (Object.prototype.toString.call(o) === '[object Date]') {
    if (isNaN(o.getTime())) return '';
    var conHora = ventasFmt_(o, 'HH:mm:ss') !== '00:00:00';
    return ventasFmt_(o, conHora ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  if (typeof o === 'object') {
    var r = {};
    Object.keys(o).forEach(function (k) { r[k] = ventasSerializar_(o[k]); });
    return r;
  }
  return o;
}

function ventasRespuesta_(fn) {
  try {
    return { ok: true, data: ventasSerializar_(fn()) };
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/* ============================ DÍAS HÁBILES (FESTIVOS COLOMBIA) ======================= */

var VENTAS_CACHE_FESTIVOS = {};

/** Calcula los festivos de Colombia (Ley 51 de 1983 - Ley Emiliani). */
function ventasFestivosCO_(anio) {
  if (VENTAS_CACHE_FESTIVOS[anio]) return VENTAS_CACHE_FESTIVOS[anio];
  var lista = [];
  function fijo(m, d) { lista.push(new Date(anio, m - 1, d)); }
  function lunes(m, d) {           // traslada al lunes siguiente
    var f = new Date(anio, m - 1, d);
    var dw = f.getDay();
    if (dw !== 1) f.setDate(f.getDate() + ((8 - dw) % 7));
    lista.push(f);
  }
  function pascuaMas(dias, trasladar) {
    var p = ventasPascua_(anio);
    var f = new Date(p.getFullYear(), p.getMonth(), p.getDate() + dias);
    if (trasladar) { var dw = f.getDay(); if (dw !== 1) f.setDate(f.getDate() + ((8 - dw) % 7)); }
    lista.push(f);
  }
  fijo(1, 1); lunes(1, 6); lunes(3, 19);
  pascuaMas(-3, false); pascuaMas(-2, false);         // jueves y viernes santo
  fijo(5, 1);
  pascuaMas(39, true); pascuaMas(60, true); pascuaMas(68, true); // Ascensión, Corpus, Sagrado Corazón
  lunes(6, 29); fijo(7, 20); fijo(8, 7); lunes(8, 15); lunes(10, 12); lunes(11, 1); lunes(11, 11);
  fijo(12, 8); fijo(12, 25);
  var claves = {};
  lista.forEach(function (f) { claves[ventasFmt_(f)] = true; });
  VENTAS_CACHE_FESTIVOS[anio] = claves;
  return claves;
}

function ventasPascua_(y) {
  var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}

function ventasEsHabil_(d) {
  var dw = d.getDay();
  if (dw === 0 || dw === 6) return false;
  return !ventasFestivosCO_(d.getFullYear())[ventasFmt_(d)];
}

/** Suma n días hábiles contando desde el día siguiente (GCV-FO-003 cond. 5). */
function ventasSumarHabiles_(desde, n) {
  var d = ventasFecha_(desde);
  if (!d) return '';
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var cuenta = 0;
  while (cuenta < n) {
    d.setDate(d.getDate() + 1);
    if (ventasEsHabil_(d)) cuenta++;
  }
  return d;
}

/** Días hábiles transcurridos entre dos fechas (excluye el día inicial). */
function ventasHabilesEntre_(desde, hasta) {
  var a = ventasFecha_(desde), b = ventasFecha_(hasta || new Date());
  if (!a || !b) return 0;
  a = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  b = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  var signo = 1;
  if (b < a) { var t = a; a = b; b = t; signo = -1; }
  var n = 0, d = new Date(a);
  while (d < b) { d.setDate(d.getDate() + 1); if (ventasEsHabil_(d)) n++; }
  return n * signo;
}

function ventasPlazoMagnitud_(magnitud, tipoServicio) {
  if (String(tipoServicio).toLowerCase().indexOf('tercer') > -1) return VENTAS_CFG.PLAZO_TERCERIZADO;
  return VENTAS_CFG.MAGNITUDES[magnitud] || 8;
}

/* ===================================== SEMÁFORO ===================================== */

/**
 * Calcula el semáforo de una solicitud según la fase:
 *  - Comercial (Recibida / En revisión): días hábiles desde recepción vs DIAS_RESPUESTA_COTIZACION
 *  - Seguimiento (Cotizada / En seguimiento): días desde último contacto vs DIAS_SEGUIMIENTO
 *  - Ejecución: días transcurridos desde llegada de equipos vs plazo comprometido
 */
function ventasSemaforo_(s) {
  var hoy = new Date();
  var est = s.ESTADO, plazo = 0, trans = 0, base = '';
  if (est === 'Recibida' || est === 'En revisión de requisitos') {
    base = s.FECHA_RECEPCION; plazo = VENTAS_CFG.DIAS_RESPUESTA_COTIZACION;
  } else if (est === 'Cotizada' || est === 'En seguimiento') {
    base = s.F_ULTIMO_SEGUIMIENTO || s.F_COTIZADA; plazo = VENTAS_CFG.DIAS_SEGUIMIENTO;
  } else if (['Cerrada por venta', 'Solicitud de calibración recibida', 'Programada', 'En ejecución',
    'En servicio tercerizado', 'Resultados emitidos'].indexOf(est) > -1) {
    if (s.F_COMPROMISO) {
      var inicio = s.F_LLEGADA_EQUIPOS || s.F_PROGRAMADA || s.F_ACEPTADA;
      plazo = Math.max(ventasHabilesEntre_(inicio, s.F_COMPROMISO), 1);
      trans = ventasHabilesEntre_(inicio, hoy);
      return ventasColor_(trans, plazo, ventasHabilesEntre_(hoy, s.F_COMPROMISO));
    }
    base = s.F_ACEPTADA || s.F_SOLICITUD_CAL; plazo = VENTAS_CFG.DIAS_SEGUIMIENTO;
  } else {
    return { color: 'gris', transcurridos: 0, plazo: 0, restantes: 0 };
  }
  if (!base) return { color: 'gris', transcurridos: 0, plazo: plazo, restantes: plazo };
  trans = ventasHabilesEntre_(base, hoy);
  return ventasColor_(trans, plazo, plazo - trans);
}

function ventasColor_(trans, plazo, restantes) {
  var r = plazo ? trans / plazo : 0;
  var color = r > 1 ? 'rojo' : (r >= VENTAS_CFG.SEMAFORO_AMARILLO ? 'amarillo' : 'verde');
  return { color: color, transcurridos: trans, plazo: plazo, restantes: restantes };
}

/* ===================================== CONSECUTIVOS ================================= */

/** Consecutivo AAAA-NNNN (= consecutivo de GCV-FO-003). */
function ventasNuevoConsecutivo_() {
  var anio = new Date().getFullYear();
  var max = 0;
  ventasLeer_('SOLICITUDES').forEach(function (s) {
    var m = String(s.ID).match(/^(\d{4})-(\d+)$/);
    if (m && Number(m[1]) === anio) max = Math.max(max, Number(m[2]));
  });
  return anio + '-' + ('0000' + (max + 1)).slice(-4);
}

function ventasNuevoIdSimple_(clave, campo, prefijo) {
  var max = 0;
  ventasLeer_(clave).forEach(function (r) {
    var m = String(r[campo]).match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefijo + ('00000' + (max + 1)).slice(-5);
}

function ventasNuevoConsecutivoFO004_() {
  var anio = new Date().getFullYear(), max = 0;
  ventasLeer_('SOLICITUDES').forEach(function (s) {
    var m = String(s.CONSECUTIVO_FO004).match(/^SC-(\d{4})-(\d+)$/);
    if (m && Number(m[1]) === anio) max = Math.max(max, Number(m[2]));
  });
  return 'SC-' + anio + '-' + ('0000' + (max + 1)).slice(-4);
}

// ---------- Orden de trabajo (OT) ----------
// CS-PR-001 5.1.1 G: OT + consecutivo + año, ej. OT101-25. La asigna el área comercial y NUNCA se repite:
// el siguiente número sale del mayor entre (a) las OT del año en Ventas, (b) las OT del registro GCV-FO-002
// (si está configurado) y (c) el último número entregado, guardado en las propiedades del script.
// Así, aunque se borre una solicitud o se lleven OT anteriores en el registro, no se vuelve a usar un número.
function ventasPartesOT_(ot) {
  var t = String(ot || '').trim().toUpperCase(), m;
  if ((m = t.match(/^OT\s*-?\s*(\d+)\s*-\s*(\d{2})$/))) return { n: Number(m[1]), anio: 2000 + Number(m[2]) };   // OT101-25
  if ((m = t.match(/^OT-(\d{4})-(\d+)$/))) return { n: Number(m[2]), anio: Number(m[1]) };                          // OT-2026-0001 (anterior)
  return null;
}

function ventasOTsExistentes_() {
  var lista = ventasLeer_('SOLICITUDES').map(function (s) { return String(s.NUM_OT || '').trim(); });
  try {
    var regId = ventasProp_('VENTAS_REGISTRO_FO002');
    if (regId) {
      var ss = SpreadsheetApp.openById(regId), sh = ss.getSheetByName('FORMATO') || ss.getSheets()[0];
      if (sh.getLastRow() >= 5) sh.getRange(5, 8, sh.getLastRow() - 4, 1).getValues().forEach(function (r) { lista.push(String(r[0] || '').trim()); });
    }
  } catch (e) { Logger.log('No se pudo leer el registro GCV-FO-002: ' + e); }
  return lista.filter(Boolean);
}

function ventasNuevoNumeroOT_() {
  var anio = new Date().getFullYear(), max = 0, usadas = {};
  ventasOTsExistentes_().forEach(function (ot) {
    usadas[ot.toUpperCase()] = true;
    var p = ventasPartesOT_(ot);
    if (p && p.anio === anio) max = Math.max(max, p.n);
  });
  var clave = 'VENTAS_ULTIMA_OT_' + anio, props = null;
  try { props = PropertiesService.getScriptProperties(); max = Math.max(max, Number(props.getProperty(clave)) || 0); } catch (e) {}
  // Los consecutivos reservados por SC pendientes (SC-0008 → OT008) no se entregan a otra solicitud
  var reservados = {};
  ventasLeer_('SOLICITUDES').forEach(function (s) {
    if (s.NUM_OT || !s.CONSECUTIVO_FO004 || /^SC-\d{4}-\d+$/i.test(String(s.CONSECUTIVO_FO004)) || s.ESTADO === 'Cerrada por desistimiento') return;
    var p = ventasPartesSC_(s.CONSECUTIVO_FO004); if (p && (!p.anio || p.anio === anio)) reservados[p.n] = true;
  });
  var n = max + 1, ot;
  do { ot = 'OT' + ('00' + n).slice(-3) + '-' + String(anio).slice(-2); n++; } while (usadas[ot] || reservados[n - 1]);
  try { if (props) props.setProperty(clave, String(n - 1)); } catch (e) {}
  return ot;
}

/** Verifica que ninguna OT esté repetida en Ventas (ejecutar desde el editor si se sospecha de duplicados). */
function ventasRevisarOTsRepetidas() { seguridadRPC_();
  var vistas = {}, rep = [];
  ventasLeer_('SOLICITUDES').forEach(function (s) {
    var ot = String(s.NUM_OT || '').trim().toUpperCase();
    if (!ot) return;
    if (vistas[ot]) rep.push(ot + ' en ' + vistas[ot] + ' y ' + s.ID); else vistas[ot] = s.ID;
  });
  Logger.log(rep.length ? 'OT repetidas: ' + rep.join(' | ') : 'No hay OT repetidas');
  return rep;
}


// ---------- Secuencia única SC ↔ OT ----------
// La solicitud de calibración (GCV-FO-004) y la orden de trabajo llevan el mismo consecutivo: SC-0003 ↔ OT003-26.
function ventasNumSC_(n) { return 'SC-' + ('000' + n).slice(-4); }
function ventasOTDeN_(n, anio) { return 'OT' + ('00' + n).slice(-3) + '-' + String(anio || new Date().getFullYear()).slice(-2); }
// SC en el formato anterior del sistema (SC-2026-0001): no seguía la numeración de la OT, se exceptúa
function ventasSCAntigua_(sc) { return /^SC-\d{4}-\d+$/i.test(String(sc || '').trim()); }
// ¿El N° de SC corresponde a la OT? (mismo consecutivo; si la SC trae año, también el año)
function ventasSecuenciaCoincide_(sc, ot) {
  if (!sc || !ot || ventasSCAntigua_(sc)) return true;
  var ps = ventasPartesSC_(sc), po = ventasPartesOT_(ot);
  if (!ps || !po) return true;
  return ps.n === po.n && (!ps.anio || ps.anio === po.anio);
}
function ventasErrorSecuencia_(sc, ot) {
  var po = ventasPartesOT_(ot);
  return 'SECUENCIA: La solicitud ' + sc + ' no corresponde a la ' + ot + '. La SC y la OT llevan el mismo consecutivo (SC-' + ('000' + (po ? po.n : '')).slice(-4) + ' ↔ ' + ot +
    '): verifique el número de la SC o de la OT.';
}
// Consecutivos ya usados: OT existentes del año y SC reservadas en solicitudes que aún no tienen OT
function ventasSecuenciaUsada_(anio, exceptoId) {
  var usados = {};
  ventasOTsExistentes_().forEach(function (ot) { var p = ventasPartesOT_(ot); if (p && p.anio === anio) usados[p.n] = ot; });
  ventasLeer_('SOLICITUDES').forEach(function (s) {
    if (s.ID === exceptoId || s.NUM_OT || !s.CONSECUTIVO_FO004 || ventasSCAntigua_(s.CONSECUTIVO_FO004) || s.ESTADO === 'Cerrada por desistimiento') return;
    var p = ventasPartesSC_(s.CONSECUTIVO_FO004); if (p && (!p.anio || p.anio === anio)) usados[p.n] = usados[p.n] || s.CONSECUTIVO_FO004 + ' (' + s.ID + ')';
  });
  return usados;
}
// Próximo consecutivo libre de la secuencia (sin reservarlo)
function ventasSiguienteSecuencia_(exceptoId) {
  var anio = new Date().getFullYear(), usados = ventasSecuenciaUsada_(anio, exceptoId), max = 0;
  Object.keys(usados).forEach(function (n) { max = Math.max(max, Number(n)); });
  try { max = Math.max(max, Number(PropertiesService.getScriptProperties().getProperty('VENTAS_ULTIMA_OT_' + anio)) || 0); } catch (e) {}
  var n = max + 1; while (usados[n]) n++;
  return n;
}
// Asigna la OT de una solicitud según su SC (o el siguiente consecutivo si aún no tiene SC). Devuelve { NUM_OT, CONSECUTIVO_FO004 }.
function ventasAsignarSecuencia_(s, numSC, soloRevisar) {
  numSC = String(numSC || s.CONSECUTIVO_FO004 || '').trim().toUpperCase();
  if (s.NUM_OT) {
    if (numSC && !ventasSecuenciaCoincide_(numSC, s.NUM_OT)) throw new Error(ventasErrorSecuencia_(numSC, s.NUM_OT));
    var po = ventasPartesOT_(s.NUM_OT);
    return { NUM_OT: s.NUM_OT, CONSECUTIVO_FO004: numSC || (po ? ventasNumSC_(po.n) : '') };
  }
  var anio = new Date().getFullYear(), p = numSC && !ventasSCAntigua_(numSC) ? ventasPartesSC_(numSC) : null;
  if (p) {
    var a = p.anio || anio, ot = ventasOTDeN_(p.n, a), usados = ventasSecuenciaUsada_(a, s.ID);
    if (usados[p.n]) throw new Error('SECUENCIA: El consecutivo ' + numSC + ' ya está usado por ' + usados[p.n] + '. La SC y la OT llevan el mismo número: asigne a esta SC el siguiente consecutivo libre (' + ventasNumSC_(ventasSiguienteSecuencia_(s.ID)) + ').');
    if (!soloRevisar) try { var pr = PropertiesService.getScriptProperties(), k = 'VENTAS_ULTIMA_OT_' + a; if (p.n > (Number(pr.getProperty(k)) || 0)) pr.setProperty(k, String(p.n)); } catch (e) {}
    return { NUM_OT: ot, CONSECUTIVO_FO004: numSC };
  }
  var nueva = ventasNuevoNumeroOT_(), pn = ventasPartesOT_(nueva);
  return { NUM_OT: nueva, CONSECUTIVO_FO004: numSC || ventasNumSC_(pn.n) };
}
/** Reserva el consecutivo de la SC (el asesor comercial lo escribe en el GCV-FO-004 que envía al cliente); la OT llevará el mismo número. */
function ventasReservarConsecutivo(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id);
      if (s.NUM_OT || (s.CONSECUTIVO_FO004 && !ventasSCAntigua_(s.CONSECUTIVO_FO004))) throw new Error('La solicitud ya tiene consecutivo: ' + (s.CONSECUTIVO_FO004 || s.NUM_OT) + '.');
      if (['Cotizada', 'En seguimiento', 'Cerrada por venta'].indexOf(s.ESTADO) === -1) throw new Error('El consecutivo de la SC se asigna con la cotización enviada o aceptada.');
      var n = ventasSiguienteSecuencia_(id), sc = ventasNumSC_(n);
      ventasActualizarFila_('SOLICITUDES', s._fila, { CONSECUTIVO_FO004: sc, F_ACTUALIZACION: ventasAhora_() });
      ventasLog_(id, 'Consecutivo de la SC asignado: ' + sc, s.ESTADO, s.ESTADO, 'La OT llevará el mismo número: ' + ventasOTDeN_(n));
      return { SC: sc, OT: ventasOTDeN_(n) };
    });
  });
}

function ventasConLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================================== HISTORIAL ==================================== */

function ventasLog_(id, accion, antes, despues, obs, posterior, personal) {
  ventasInsertar_('HISTORIAL', {
    FECHA: ventasAhora_(), ID_SOLICITUD: id, USUARIO: ventasUsuario_(), ACCION: accion,
    ESTADO_ANTERIOR: antes || '', ESTADO_NUEVO: despues || '', OBSERVACION: obs || '',
    POSTERIOR_INICIO_TRABAJO: posterior ? 'SÍ' : 'NO', PERSONAL_COMUNICADO: personal || ''
  });
}

/* ===================================== CATÁLOGOS ==================================== */

/** Devuelve todo lo necesario para inicializar la vista. */
function ventasCatalogos() { seguridadRPC_();
  return ventasRespuesta_(function () {
    var usuarios = ventasLeer_('USUARIOS').filter(function (u) { return String(u.ACTIVO).toUpperCase() !== 'NO'; });
    var nombres = function (re) { return usuarios.filter(function (u) { return re.test(u.ROL); }).map(function (u) { return u.NOMBRE; }); };
    var todos = usuarios.map(function (u) { return u.NOMBRE; });
    if (VENTAS_SESION && todos.indexOf(VENTAS_SESION.nombre) === -1) todos.push(VENTAS_SESION.nombre);
    var comerciales = nombres(/COMERCIAL|GERENCIA/i), tecnicos = nombres(/LABORATORIO|DIRECTOR_TECNICO/i);
    // El comercial responsable se escribe libremente: los filtros incluyen los nombres ya usados en solicitudes
    ventasLeer_('SOLICITUDES').forEach(function (x) { var n = String(x.COMERCIAL || '').trim(); if (n && comerciales.indexOf(n) === -1) comerciales.push(n); });
    return {
      estados: VENTAS_ESTADOS,
      transiciones: VENTAS_TRANSICIONES,
      canales: VENTAS_CFG.CANALES,
      tiposCliente: VENTAS_CFG.TIPOS_CLIENTE,
      lugares: VENTAS_CFG.LUGARES,
      magnitudes: Object.keys(VENTAS_CFG.MAGNITUDES),
      plazos: VENTAS_CFG.MAGNITUDES,
      plazoTercerizado: VENTAS_CFG.PLAZO_TERCERIZADO,
      resultadosRevision: VENTAS_CFG.RESULTADOS_REVISION,
      reglas: VENTAS_CFG.REGLAS_DECISION,
      tiposAceptacion: VENTAS_CFG.TIPOS_ACEPTACION,
      tiposContrato: VENTAS_CFG.TIPOS_CONTRATO,
      estadosImportables: VENTAS_ESTADOS_IMPORTABLES,
      modalidadesTercero: VENTAS_MODALIDADES_TERCERO, rutas: VENTAS_RUTAS, alcance: VENTAS_ALCANCE,
      // Contratos ya usados por cada cliente (para sugerirlos en nuevas órdenes de servicio)
      // Contratos registrados (Clientes → Contratos) y los ya usados en solicitudes, para sugerirlos en nuevas órdenes de servicio
      contratos: ventasLeer_('CONTRATOS').map(function (x) {
        return { NIT: String(x.CLIENTE_NIT), TIPO: x.TIPO, NUMERO: String(x.NUM_CONTRATO), OBJETO: x.OBJETO || '', F_FIN: ventasFmt_(x.F_FIN), VIGENTE: ventasContratoVigente_(x), REGISTRADO: true };
      }).concat(ventasLeer_('SOLICITUDES').filter(function (x) { return x.NUM_CONTRATO && VENTAS_CFG.TIPOS_CONTRATO.indexOf(x.TIPO_ACEPTACION) !== -1; })
        .map(function (x) { return { NIT: String(x.CLIENTE_NIT), TIPO: x.TIPO_ACEPTACION, NUMERO: String(x.NUM_CONTRATO), VIGENTE: true, REGISTRADO: false }; }))
        .filter(function (x, i, a) { return a.findIndex(function (y) { return ventasClaveContrato_(y.NUMERO) === ventasClaveContrato_(x.NUMERO); }) === i; }),
      motivosDesistimiento: VENTAS_CFG.MOTIVOS_DESISTIMIENTO,
      // Si aún no hay roles asignados en VENTAS_USUARIOS se ofrecen todos los usuarios para no bloquear el registro
      comerciales: comerciales.length ? comerciales : todos,
      tecnicos: tecnicos.length ? tecnicos : todos,
      usuarios: usuarios.map(function (u) { return { nombre: u.NOMBRE, rol: u.ROL }; }),
      servicios: ventasLeer_('SERVICIOS').filter(function (s) { return String(s.ACTIVO).toUpperCase() !== 'NO'; }),
      clientes: ventasLeer_('CLIENTES').map(function (c) { return { NIT: c.NIT, NOMBRE: c.NOMBRE, TIPO_CLIENTE: c.TIPO_CLIENTE, CONTACTO: c.CONTACTO, TELEFONO: c.TELEFONO, CORREO: c.CORREO, CIUDAD: c.CIUDAD || '',
        DIRECCION: c.DIRECCION || '', CORREO_FACTURACION: c.CORREO_FACTURACION || '', CORREO_CERTIFICADO: c.CORREO_CERTIFICADO || '' }; }),
      // GCV-FO-004: reglas de decisión del formato, comercial responsable y próximo consecutivo de la SC
      reglasFO004: VENTAS_FO004_REGLAS, comercialesFO004: ['Gerente'], siguienteSC: ventasNumSC_(ventasSiguienteSecuencia_('')),
      usuarioActual: ventasUsuario_(),
      config: { diasSeguimiento: VENTAS_CFG.DIAS_SEGUIMIENTO, diasValidez: VENTAS_CFG.DIAS_VALIDEZ_OFERTA, iva: VENTAS_CFG.IVA_DEFECTO },
      urlPqrsf: ventasProp_('VENTAS_URL_PQRSF'),
      urlEncuesta: ventasProp_('VENTAS_URL_ENCUESTA')
    };
  });
}

/* ===================================== CLIENTES ===================================== */

function ventasGuardarCliente(c) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () { return ventasUpsertCliente_(Object.assign({}, c, { EDITAR: true })); });
  });
}

// ---------- Clientes sin duplicar ----------
// NIT comparable: solo dígitos y sin dígito de verificación ("900.123.456-7" = "900123456")
function ventasClaveNit_(nit) {
  var t = String(nit || '').trim();
  var base = t.indexOf('-') > 0 ? t.slice(0, t.indexOf('-')) : t;
  return base.replace(/\D/g, '') || t.toUpperCase().replace(/\s+/g, '');
}
// Nombre comparable: sin tildes, signos ni palabras genéricas (ESE, IPS, SAS, LTDA, DE, LA...)
var VENTAS_PALABRAS_GENERICAS = ['ese', 'ips', 'eps', 'sas', 'sa', 'ltda', 'limitada', 'sociedad', 'anonima', 'acciones', 'simplificada', 'por',
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'empresa', 'social', 'estado', 'eu', 'cia', 'compania', 'nit', 'zf', 'bic'];
function ventasTokensNombre_(n) {
  return ventasNorm_(n).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/)
    .filter(function (w) { return w && (w.length > 1 || /\d/.test(w)) && VENTAS_PALABRAS_GENERICAS.indexOf(w) === -1; });
}
function ventasDistancia_(a, b) {
  var m = a.length, n = b.length, d = [], i, j;
  for (i = 0; i <= m; i++) d[i] = [i];
  for (j = 0; j <= n; j++) d[0][j] = j;
  for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
  return d[m][n];
}
// ¿Dos nombres corresponden al mismo cliente? "ESE HOSPITAL GUADALUPE" ≈ "Hospital Guadalupe" ≈ "HOSPITAL GUADALUPPE"
function ventasNombresParecidos_(a, b) {
  var ta = ventasTokensNombre_(a), tb = ventasTokensNombre_(b);
  if (!ta.length || !tb.length) return false;
  // Si tienen números distintos son clientes distintos ("Clínica 1" ≠ "Clínica 2")
  var na = ta.filter(function (w) { return /\d/.test(w); }).sort().join(' '), nb = tb.filter(function (w) { return /\d/.test(w); }).sort().join(' ');
  if (na !== nb) return false;
  var ka = ta.slice().sort().join(' '), kb = tb.slice().sort().join(' ');
  if (ka === kb) return true;
  var corta = ta.length <= tb.length ? ta : tb, larga = corta === ta ? tb : ta;
  var comunes = corta.filter(function (w) { return larga.indexOf(w) !== -1; }).length;
  if (corta.length >= 2 && comunes === corta.length) return true;                       // una contiene a la otra
  var union = ta.concat(tb).filter(function (w, i, x) { return x.indexOf(w) === i; }).length;
  if (comunes / union >= 0.75) return true;
  if (ka.length >= 8 && kb.length >= 8) {                                                // errores de digitación
    var dist = ventasDistancia_(ka, kb);
    if (dist / Math.max(ka.length, kb.length) <= 0.12) return true;
  }
  return false;
}
// Busca el cliente por NIT y los clientes con nombre parecido (para pedir confirmación)
function ventasClientesSimilares_(nit, nombre, lista) {
  lista = lista || ventasLeer_('CLIENTES');
  var kn = ventasClaveNit_(nit);
  var mismoNit = kn ? lista.filter(function (c) { return ventasClaveNit_(c.NIT) === kn; })[0] || null : null;
  var parecidos = lista.filter(function (c) {
    return c !== mismoNit && (!mismoNit || ventasClaveNit_(c.NIT) !== ventasClaveNit_(mismoNit.NIT)) && ventasNombresParecidos_(c.NOMBRE, nombre);
  }).map(function (c) { return { NIT: String(c.NIT), NOMBRE: c.NOMBRE, CIUDAD: c.CIUDAD || '' }; });
  return { mismoNit: mismoNit ? { NIT: String(mismoNit.NIT), NOMBRE: mismoNit.NOMBRE, CIUDAD: mismoNit.CIUDAD || '' } : null, parecidos: parecidos };
}
/** Desde la pantalla: verifica si el cliente ya existe (mismo NIT) o se parece a otro antes de guardarlo. */
function ventasVerificarCliente(c) { seguridadRPC_();
  return ventasRespuesta_(function () { return ventasClientesSimilares_(c && c.NIT, c && c.NOMBRE); });
}

// Crea o actualiza el cliente. Devuelve el registro con el NIT y el nombre oficiales del cliente.
//  - Mismo NIT (con o sin dígito de verificación) → es el mismo cliente: se completan sus datos, el nombre registrado se conserva
//    (solo cambia si se edita desde Clientes: c.EDITAR).
//  - NIT nuevo con nombre parecido a otro cliente → exige confirmación (c.CONFIRMAR_NUEVO) para no duplicar.
function ventasUpsertCliente_(c, lista) {
  if (!c || !String(c.NIT || '').trim() || !String(c.NOMBRE || '').trim()) throw new Error('El NIT y el nombre del cliente son obligatorios.');
  lista = lista || ventasLeer_('CLIENTES');
  var kn = ventasClaveNit_(c.NIT);
  var existente = lista.filter(function (x) { return ventasClaveNit_(x.NIT) === kn; })[0];
  if (!existente && !c.CONFIRMAR_NUEVO) {
    var sim = ventasClientesSimilares_(c.NIT, c.NOMBRE, lista);
    if (sim.parecidos.length) throw new Error('CLIENTE_PARECIDO: El cliente "' + c.NOMBRE + '" se parece a ' +
      sim.parecidos.map(function (p) { return '"' + p.NOMBRE + '" (NIT ' + p.NIT + ')'; }).join(', ') + '. Confirme si es el mismo cliente o si es uno nuevo.');
  }
  var campos = ['TIPO_CLIENTE', 'CONTACTO', 'TELEFONO', 'CORREO', 'DIRECCION', 'CIUDAD', 'CORREO_FACTURACION', 'OBSERVACIONES', 'CORREO_CERTIFICADO'];
  if (c.CORREO_CERTIFICADO) ventasAsegurarColumnas_('CLIENTES');
  var datos = { NIT: String(c.NIT).trim(), NOMBRE: String(c.NOMBRE).trim() };
  campos.forEach(function (k) { datos[k] = c[k] === undefined || c[k] === null ? '' : String(c[k]).trim(); });
  if (existente) {
    datos.NIT = String(existente.NIT);
    if (!c.EDITAR) datos.NOMBRE = existente.NOMBRE;
    campos.forEach(function (k) { if (datos[k] === '' && existente[k]) datos[k] = existente[k]; });
    if (!datos.TIPO_CLIENTE) datos.TIPO_CLIENTE = 'Privado';
    ventasActualizarFila_('CLIENTES', existente._fila, datos);
    Object.assign(existente, datos);
  } else {
    if (!datos.TIPO_CLIENTE) datos.TIPO_CLIENTE = 'Privado';
    datos.F_REGISTRO = ventasAhora_();
    ventasInsertar_('CLIENTES', datos);
    lista.push(Object.assign({}, datos));
  }
  return datos;
}

// Para cargas masivas: resuelve el cliente de una fila sin duplicar.
//  ctx = { lista, decisiones:{ claveNit: 'NUEVO' | NIT de un cliente existente }, pendientes:{}, alias:{}, simular }
//  Devuelve el cliente oficial o null si hay que confirmar (queda en ctx.pendientes para preguntarle al usuario).
function ventasResolverCliente_(c, ctx, refFila) {
  var kn = ventasClaveNit_(c.NIT);
  if (ctx.alias[kn]) return ctx.alias[kn];
  var dec = (ctx.decisiones || {})[kn];
  var existente = ctx.lista.filter(function (x) { return ventasClaveNit_(x.NIT) === kn; })[0];
  if (!existente && dec && dec !== 'NUEVO') {
    // El usuario indicó que es un cliente ya registrado: se usa ese (no se crea otro)
    var elegido = ctx.lista.filter(function (x) { return ventasClaveNit_(x.NIT) === ventasClaveNit_(dec); })[0];
    if (!elegido) throw new Error('El cliente elegido (NIT ' + dec + ') no existe.');
    ctx.alias[kn] = { NIT: String(elegido.NIT), NOMBRE: elegido.NOMBRE };
    return ctx.alias[kn];
  }
  if (!existente && dec !== 'NUEVO') {
    var sim = ventasClientesSimilares_(c.NIT, c.NOMBRE, ctx.lista);
    if (sim.parecidos.length) {
      var p = ctx.pendientes[kn] || (ctx.pendientes[kn] = { CLAVE: kn, NIT: String(c.NIT).trim(), NOMBRE: String(c.NOMBRE).trim(), parecidos: sim.parecidos, filas: [] });
      if (refFila) p.filas.push(refFila);
      return null;
    }
  }
  var datos;
  if (ctx.simular) {
    datos = existente ? { NIT: String(existente.NIT), NOMBRE: existente.NOMBRE } : { NIT: String(c.NIT).trim(), NOMBRE: String(c.NOMBRE).trim() };
    if (!existente) ctx.lista.push(Object.assign({ _nuevo: true }, datos));
  } else {
    datos = ventasUpsertCliente_(Object.assign({}, c, { CONFIRMAR_NUEVO: true }), ctx.lista);
  }
  if (!existente) ctx.nuevos = (ctx.nuevos || 0) + 1;
  return { NIT: datos.NIT, NOMBRE: datos.NOMBRE };
}
function ventasPendientesLista_(ctx) {
  return Object.keys(ctx.pendientes).map(function (k) { return ctx.pendientes[k]; });
}

// ---------- Contratos ----------
function ventasClaveContrato_(n) { return String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function ventasContratoVigente_(k, hoy) {
  if (String(k.ESTADO || '').toLowerCase().indexOf('termin') === 0 || String(k.ESTADO || '').toLowerCase().indexOf('anul') === 0) return false;
  var fin = ventasFecha_(k.F_FIN);
  return !fin || fin >= new Date((hoy || new Date()).getFullYear(), (hoy || new Date()).getMonth(), (hoy || new Date()).getDate());
}
function ventasListarContratos(nit) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var kn = nit ? ventasClaveNit_(nit) : '';
    return ventasLeer_('CONTRATOS').filter(function (k) { return !kn || ventasClaveNit_(k.CLIENTE_NIT) === kn; }).map(function (k) {
      var o = ventasSerializar_(k); o.VIGENTE = ventasContratoVigente_(k); delete o._fila; return o;
    });
  });
}
// Crea o actualiza un contrato (por su número). El cliente debe existir.
function ventasGuardarContrato_(k, clientes) {
  var num = String(k.NUM_CONTRATO || '').trim();
  if (!num) throw new Error('Indique el número del contrato.');
  clientes = clientes || ventasLeer_('CLIENTES');
  var kn = ventasClaveNit_(k.CLIENTE_NIT);
  var cli = clientes.filter(function (c) { return ventasClaveNit_(c.NIT) === kn; })[0];
  if (!cli) throw new Error('El cliente con NIT ' + k.CLIENTE_NIT + ' no existe. Regístrelo primero en Clientes.');
  var tipo = VENTAS_CFG.TIPOS_CONTRATO.indexOf(k.TIPO) !== -1 ? k.TIPO : (/p[uú]blic/i.test(k.TIPO || '') ? 'Contrato público' : 'Contrato privado');
  var existente = ventasLeer_('CONTRATOS').filter(function (x) { return ventasClaveContrato_(x.NUM_CONTRATO) === ventasClaveContrato_(num); })[0];
  if (existente && ventasClaveNit_(existente.CLIENTE_NIT) !== kn)
    throw new Error('El contrato ' + num + ' ya está registrado para ' + existente.CLIENTE + ' (NIT ' + existente.CLIENTE_NIT + ').');
  var datos = { NUM_CONTRATO: existente ? existente.NUM_CONTRATO : num, CLIENTE_NIT: String(cli.NIT), CLIENTE: cli.NOMBRE, TIPO: tipo,
    OBJETO: String(k.OBJETO || '').trim(), F_INICIO: ventasFecha_(k.F_INICIO) || '', F_FIN: ventasFecha_(k.F_FIN) || '',
    VALOR: ventasNum_(k.VALOR) || '', ESTADO: String(k.ESTADO || '').trim() || 'Vigente', OBSERVACIONES: String(k.OBSERVACIONES || '').trim() };
  if (existente) {
    Object.keys(datos).forEach(function (x) { if (datos[x] === '' && existente[x] !== '' && existente[x] !== undefined) datos[x] = existente[x]; });
    ventasActualizarFila_('CONTRATOS', existente._fila, datos);
  } else {
    datos.F_REGISTRO = ventasAhora_();
    ventasInsertar_('CONTRATOS', datos);
  }
  return datos;
}
function ventasGuardarContrato(k) { seguridadRPC_();
  return ventasRespuesta_(function () { return ventasConLock_(function () { return ventasSerializar_(ventasGuardarContrato_(k)); }); });
}

/** Directorio de clientes con historial de servicios y encuestas. */
function ventasListarClientes() { seguridadRPC_();
  return ventasRespuesta_(function () {
    var sol = ventasLeer_('SOLICITUDES'), post = ventasLeer_('POSTVENTA');
    return ventasLeer_('CLIENTES').map(function (c) {
      var propias = sol.filter(function (s) { return String(s.CLIENTE_NIT) === String(c.NIT); });
      var ventas = propias.filter(function (s) { return s.TIPO_CIERRE === 'Venta'; });
      var enc = post.filter(function (p) { return String(p.CLIENTE_NIT) === String(c.NIT) && p.CALIFICACION !== ''; });
      var prom = enc.length ? enc.reduce(function (a, p) { return a + ventasNum_(p.CALIFICACION); }, 0) / enc.length : '';
      var ultima = propias.reduce(function (a, s) { var f = ventasFecha_(s.FECHA_RECEPCION); return (f && (!a || f > a)) ? f : a; }, '');
      c.TOTAL_SOLICITUDES = propias.length;
      c.TOTAL_VENTAS = ventas.length;
      c.VALOR_VENDIDO = ventas.reduce(function (a, s) { return a + ventasNum_(s.VALOR_TOTAL); }, 0);
      c.SATISFACCION = prom === '' ? '' : Math.round(prom * 10) / 10;
      c.ULTIMA_SOLICITUD = ultima;
      delete c._fila;
      return c;
    });
  });
}

function ventasHistorialCliente(nit) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return {
      cliente: ventasBuscar_('CLIENTES', 'NIT', nit),
      solicitudes: ventasFiltrar_('SOLICITUDES', 'CLIENTE_NIT', nit).map(function (s) {
        return { ID: s.ID, VERSION: s.VERSION, FECHA_RECEPCION: s.FECHA_RECEPCION, ESTADO: s.ESTADO, VALOR_TOTAL: s.VALOR_TOTAL, REFERENCIA: s.REFERENCIA, TIPO_CIERRE: s.TIPO_CIERRE };
      }),
      encuestas: ventasFiltrar_('POSTVENTA', 'CLIENTE_NIT', nit),
      contratos: ventasLeer_('CONTRATOS').filter(function (k) { return ventasClaveNit_(k.CLIENTE_NIT) === ventasClaveNit_(nit); }).map(function (k) {
        var o = ventasSerializar_(k); o.VIGENTE = ventasContratoVigente_(k); delete o._fila; return o;
      })
    };
  });
}

/* ============================ RUTA DEL SERVICIO (Ventas · Compras · Almacén) ============================
 * GCV-FO-004 "El servicio solicitado ha sido tercerizado a IMCOLMETRIC":
 *  NO  → lo ejecuta el laboratorio: Almacén recibe → área técnica → retorno al almacén → despacho → facturación y cierre.
 *        (Si es en sitio: registro en sitio del almacén → servicio finalizado → facturación y cierre.)
 *  SI · SITIO       → Compras (GCO-FO-006 → orden de compra GCO-FO-005) → el tercero ejecuta en sitio → certificado verificado (5.8.1) → facturación y cierre.
 *  SI · LABORATORIO → Compras (orden de compra) → Almacén recibe → envío al tercero → retorno al almacén → certificado verificado → despacho → facturación y cierre.
 */
var VENTAS_MODALIDADES_TERCERO = ['Sitio', 'Laboratorio'];
function ventasRutaDe_(s) {
  if (String(s.TERCERIZADO).toUpperCase() !== 'SI') return s.LUGAR_SERVICIO === 'En sitio' ? 'propio-sitio' : 'propio-lab';
  return s.MODALIDAD_TERCERO === 'Sitio' ? 'tercero-sitio' : 'tercero-lab';
}
var VENTAS_RUTAS = {
  'propio-lab': 'Laboratorio de IMCOLMETRIC (pasa por el almacén)',
  'propio-sitio': 'Laboratorio de IMCOLMETRIC en sitio',
  'tercero-sitio': 'Tercerizado · el proveedor trabaja en sitio',
  'tercero-lab': 'Tercerizado · en el laboratorio del proveedor (pasa por el almacén)'
};
// Equipos del almacén de una OT (si el módulo de Almacén está en el proyecto)
function ventasAlmacenOT_(ot) {
  if (!ot || typeof almLeer !== 'function' || typeof ALM_ID_HOJA === 'undefined') return null;
  try {
    var ss = SpreadsheetApp.openById(ALM_ID_HOJA), k = ventasClaveOT_(ot);
    var eqs = almLeer(ss, 'eq').filter(function (e) { return ventasClaveOT_(e.ot) === k; });
    var items = eqs.map(function (e) { return Number(e.item); });
    var movs = items.length ? almLeer(ss, 'mov').filter(function (m) { return items.indexOf(Number(m.item)) !== -1; }) : [];
    return { equipos: eqs, movimientos: movs };
  } catch (e) { Logger.log('Ventas: no se pudo leer el almacén: ' + e); return null; }
}
function ventasComprasOT_(id) {
  if (typeof cmpEstadoTercerizado_ !== 'function') return null;
  try { return cmpEstadoTercerizado_(id); } catch (e) { Logger.log('Ventas: no se pudo leer Compras: ' + e); return null; }
}
/** Etapas de la ruta con su avance, leyendo Compras, Almacén y Ventas. */
function ventasInfoRuta_(s) {
  var ruta = ventasRutaDe_(s), alm = ventasAlmacenOT_(s.NUM_OT), cmp = ruta.indexOf('tercero') === 0 ? ventasComprasOT_(s.ID) : null;
  var eqs = alm ? alm.equipos : [], movs = alm ? alm.movimientos : [];
  var hay = function (evento) { return movs.some(function (m) { return String(m.evento).indexOf(evento) === 0; }); };
  var todos = function (sits) { return eqs.length > 0 && eqs.every(function (e) { return sits.indexOf(e.situacion) !== -1; }); };
  var terc = ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', s.ID);
  var verificado = terc.length > 0 && terc.every(function (t) { return t.CERT_REVISADO === 'SÍ' && t.ENTREGABLE_VERIFICADO === 'SÍ'; });
  var facturada = ['Facturada', 'Postventa'].indexOf(s.ESTADO) !== -1;
  var E = [];
  var et = function (k, t, ok, det) { E.push({ k: k, t: t, ok: !!ok, detalle: det || '' }); };
  et('ot', 'Orden de trabajo', !!s.NUM_OT, s.NUM_OT || 'Sin OT');
  if (ruta.indexOf('tercero') === 0) {
    et('compra', 'Solicitud a Compras (GCO-FO-006)', !!(cmp && cmp.solicitud), cmp && cmp.solicitud ? cmp.solicitud.id + ' · ' + cmp.solicitud.estado : (s.NUM_SOL_COMPRA || 'Pendiente'));
    et('oc', 'Orden de compra al tercero (GCO-FO-005)', !!(cmp && cmp.oc), cmp && cmp.oc ? cmp.oc.id + ' · ' + cmp.oc.proveedor : 'Pendiente en Compras');
  }
  if (ruta === 'tercero-sitio') {
    et('tercero', 'Servicio del tercero en sitio', !!(cmp && cmp.oc && cmp.oc.recibida), cmp && cmp.oc && cmp.oc.recibida ? 'Recibido conforme ' + cmp.oc.fechaRecepcion : 'Compras registra la recepción del servicio');
    et('cert', 'Certificado del proveedor verificado (5.8.1)', verificado, verificado ? 'Verificado' : 'Pestaña Tercerizados');
  } else if (ruta === 'tercero-lab') {
    et('recepcion', 'Recepción en almacén', eqs.length > 0, eqs.length ? eqs.length + ' equipo(s)' : 'Pendiente');
    et('envio', 'Enviado al tercero', hay('Envío al tercero'), hay('Envío al tercero') ? (s.PROVEEDOR_TERCERO || 'Proveedor') : 'Pendiente');
    et('retorno', 'Retorno del tercero al almacén', todos(['Listo para despacho', 'Despachado']) && hay('Retorno del tercero'), '');
    et('cert', 'Certificado del proveedor verificado (5.8.1)', verificado, verificado ? 'Verificado' : 'Pestaña Tercerizados');
    et('despacho', 'Despacho al cliente', todos(['Despachado']), '');
  } else if (ruta === 'propio-sitio') {
    et('sitio', 'Registro del servicio en sitio (almacén)', eqs.length > 0, eqs.length ? eqs.length + ' equipo(s)' : 'Pendiente');
    et('fin', 'Servicio en sitio finalizado', todos(['Despachado']), '');
  } else {
    et('recepcion', 'Recepción en almacén', eqs.length > 0, eqs.length ? eqs.length + ' equipo(s)' : 'Pendiente');
    et('lab', 'Laboratorio (área técnica)', hay('Salida al área técnica'), '');
    et('retorno', 'Retorno al almacén', todos(['Listo para despacho', 'Despachado']) && hay('Retorno a recepción técnica'), '');
    et('despacho', 'Despacho al cliente', todos(['Despachado']), '');
  }
  et('factura', 'Facturación y cierre de la venta', facturada, s.NUM_FACTURA ? 'Factura ' + s.NUM_FACTURA : '');
  var sig = E.filter(function (x) { return !x.ok; })[0];
  return { ruta: ruta, nombre: VENTAS_RUTAS[ruta], tercerizado: String(s.TERCERIZADO).toUpperCase() === 'SI', modalidad: s.MODALIDAD_TERCERO || '',
    alcance: s.ALCANCE_LAB || '', tercerizadoAImc: s.TERCERIZADO_A_IMC || '',
    alcanceSugerido: ventasSugerirAlcance_(ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID), s.LUGAR_SERVICIO),
    etapas: E, siguiente: sig ? sig.t : 'Completada', almacenActivo: !!alm, comprasActivo: typeof cmpEstadoTercerizado_ === 'function',
    oc: cmp && cmp.oc ? cmp.oc : null, solicitudCompra: cmp && cmp.solicitud ? cmp.solicitud : null };
}
// Etapas que deben estar cumplidas antes de un estado de Ventas
function ventasValidarRuta_(s, nuevo) {
  var r = ventasInfoRuta_(s);
  var faltan = function (claves) { return r.etapas.filter(function (e) { return claves.indexOf(e.k) !== -1 && !e.ok; }).map(function (e) { return e.t; }); };
  var f = [];
  if (nuevo === 'En servicio tercerizado') {
    if (!r.tercerizado) throw new Error('La OT no está marcada como tercerizada. Defina la ruta del servicio en el detalle (Tercerizado: SI).');
    f = faltan(['compra', 'oc']);
  } else if (nuevo === 'Entregada') {
    f = faltan(r.ruta === 'tercero-sitio' ? ['oc', 'tercero', 'cert'] : r.ruta === 'tercero-lab' ? ['oc', 'recepcion', 'envio', 'retorno', 'cert', 'despacho'] :
      r.ruta === 'propio-sitio' ? (r.almacenActivo ? ['sitio', 'fin'] : []) : (r.almacenActivo ? ['recepcion', 'retorno', 'despacho'] : []));
  } else if (nuevo === 'Facturada') {
    f = r.etapas.filter(function (e) { return e.k !== 'factura' && !e.ok && (r.almacenActivo || ['recepcion', 'lab', 'retorno', 'despacho', 'sitio', 'fin', 'envio'].indexOf(e.k) === -1); })
      .map(function (e) { return e.t; });
  }
  if (f.length) throw new Error('Ruta "' + r.nombre + '": falta ' + f.join(', ') + '.');
}
/** Define si el servicio es propio o tercerizado (en sitio o en el laboratorio del proveedor). r = { TERCERIZADO, MODALIDAD, PROVEEDOR_SUGERIDO } */
function ventasDefinirRuta(id, r) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id);
      return ventasDefinirRuta_(s, r || {});
    });
  });
}
function ventasDefinirRuta_(s, r) {
  // ¿Dentro del alcance del laboratorio (MT-FO-006)? Si NO, el servicio se terceriza con un proveedor (GCV-PR-001 5.8.1)
  var al = String(r.ALCANCE || s.ALCANCE_LAB || '').toUpperCase();
  var alcance = al === 'NO' || al === 'SI' ? al : '';
  if (alcance === 'NO') r.TERCERIZADO = 'SI';
  var terc = String(r.TERCERIZADO || '').toUpperCase() === 'SI' ? 'SI' : 'NO';
  var mod = terc === 'SI' ? (VENTAS_MODALIDADES_TERCERO.indexOf(r.MODALIDAD) !== -1 ? r.MODALIDAD : '') : '';
  if (terc === 'SI' && !mod) throw new Error('Indique si el tercero presta el servicio en SITIO o en su LABORATORIO.');
  ventasAsegurarColumnas_('SOLICITUDES');
  var antes = ventasRutaDe_(s);
  var cmp = ventasComprasOT_(s.ID);
  if (cmp && cmp.oc && (terc === 'NO' || mod !== s.MODALIDAD_TERCERO))
    throw new Error('Ya existe la orden de compra ' + cmp.oc.id + ' al tercero. Para cambiar la ruta, Compras debe anularla primero.');
  var alm = ventasAlmacenOT_(s.NUM_OT);
  if (alm && alm.equipos.length && terc === 'SI' && mod === 'Sitio')
    throw new Error('Los equipos de la ' + s.NUM_OT + ' ya fueron recibidos en el almacén: el servicio no puede pasar a tercerizado en sitio.');
  var c = { TERCERIZADO: terc, MODALIDAD_TERCERO: mod, ALCANCE_LAB: alcance, F_ACTUALIZACION: ventasAhora_() };
  if (terc === 'SI') c.LUGAR_SERVICIO = mod === 'Sitio' ? 'En sitio' : VENTAS_CFG.LUGARES[0];
  ventasActualizarFila_('SOLICITUDES', s._fila, c);
  Object.assign(s, c);
  // Plazo: tercerizado 15 días hábiles, propio según la magnitud (GCV-PR-001 5.3)
  ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID).forEach(function (e) {
    var tipo = terc === 'SI' ? 'Tercerizado' : 'Propio';
    if (e.TIPO_SERVICIO !== tipo) ventasActualizarFila_('EQUIPOS', e._fila, { TIPO_SERVICIO: tipo, PLAZO_DIAS: ventasPlazoMagnitud_(e.MAGNITUD, tipo) });
  });
  ventasRecalcularCompromiso_(s.ID);
  var ruta = ventasRutaDe_(s), msg = '';
  if (ruta !== antes || r.PROVEEDOR_SUGERIDO || r.ALCANCE) ventasLog_(s.ID, 'Ruta del servicio: ' + VENTAS_RUTAS[ruta], s.ESTADO, s.ESTADO,
    (alcance ? 'Dentro del alcance del laboratorio (MT-FO-006): ' + alcance + '. ' : '') + 'Antes: ' + VENTAS_RUTAS[antes]);
  if (terc === 'SI') msg = ventasAsegurarCompraTercero_(s, r.PROVEEDOR_SUGERIDO);
  else if (cmp && cmp.solicitud) msg = 'Queda la solicitud de compra ' + cmp.solicitud.id + ' del tercero: pida a Compras anularla.';
  return { ruta: ruta, nombre: VENTAS_RUTAS[ruta], mensaje: msg };
}
// Pide a Compras el servicio tercerizado (GCV-PR-001 5.8.1 → GCO-FO-006). Requiere OT. No duplica.
function ventasAsegurarCompraTercero_(s, proveedorSugerido) {
  if (String(s.TERCERIZADO).toUpperCase() !== 'SI') return '';
  if (!s.NUM_OT) return 'La solicitud a Compras se creará cuando la solicitud tenga OT.';
  if (typeof cmpSolicitudDesdeVentas_ !== 'function') return 'El módulo de Compras no está en el proyecto: solicite la tercerización con el GCO-FO-006.';
  var equipos = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID);
  var cli = ventasLeer_('CLIENTES').filter(function (c) { return ventasClaveNit_(c.NIT) === ventasClaveNit_(s.CLIENTE_NIT); })[0] || {};
  var u = VENTAS_SESION || {};
  var r = cmpSolicitudDesdeVentas_({
    idVentas: s.ID, ot: s.NUM_OT, cliente: s.CLIENTE, nit: String(s.CLIENTE_NIT), modalidad: s.MODALIDAD_TERCERO,
    items: equipos.map(function (e) {
      return { descripcion: 'Calibración ' + [e.EQUIPO, e.MARCA, e.MODELO].filter(String).join(' ') + (e.SERIE ? ' · Serie ' + e.SERIE : ''),
        especificaciones: [e.MAGNITUD, e.RANGO ? 'Rango ' + e.RANGO : '', e.PUNTOS_CALIBRACION ? 'Puntos ' + e.PUNTOS_CALIBRACION : '', e.UBICACION ? 'Ubicación ' + e.UBICACION : ''].filter(String).join(' · '),
        cantidad: ventasNum_(e.CANTIDAD) || 1, unidad: 'Servicio' };
    }),
    fechaRequerida: s.F_COMPROMISO ? ventasFmt_(s.F_COMPROMISO) : '', lugarEntrega: [cli.DIRECCION, cli.CIUDAD].filter(String).join(', ') || s.CLIENTE,
    proveedorSugerido: proveedorSugerido || '', solicitante: { usuario: u.usuario, nombre: u.nombre || ventasUsuario_(), cargo: u.cargo },
    observaciones: 'Solicitud de Ventas ' + s.ID + (s.CONSECUTIVO_FO004 ? ' · SC del cliente ' + s.CONSECUTIVO_FO004 : '')
  });
  if (r.id !== s.NUM_SOL_COMPRA) ventasActualizarFila_('SOLICITUDES', s._fila, { NUM_SOL_COMPRA: r.id });
  if (!r.existente) ventasLog_(s.ID, 'Servicio tercerizado solicitado a Compras (5.8.1)', s.ESTADO, s.ESTADO,
    'GCO-FO-006 N° ' + r.id + ' · servicio ' + (s.MODALIDAD_TERCERO === 'Sitio' ? 'en sitio' : 'en el laboratorio del proveedor'));
  return (r.existente ? 'Ya existe' : 'Se creó') + ' la solicitud de compra ' + r.id + ' para el tercero.';
}
/** Avisos de Compras sobre el servicio tercerizado (los llama Compras.gs). */
function ventasEventoCompras_(idVentas, evento, d) {
  var s = ventasBuscar_('SOLICITUDES', 'ID', idVentas);
  if (!s) return;
  ventasAsegurarColumnas_('SOLICITUDES');
  if (evento === 'oc') {
    ventasActualizarFila_('SOLICITUDES', s._fila, { NUM_OC_TERCERO: d.oc, PROVEEDOR_TERCERO: d.proveedor, NUM_SOL_COMPRA: d.solicitud || s.NUM_SOL_COMPRA });
    // Registro del servicio tercerizado (5.8.1) para el seguimiento del certificado
    var terc = ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', s.ID);
    if (!terc.length) ventasInsertar_('TERCERIZADOS', {
      ID_TERC: ventasNuevoIdSimple_('TERCERIZADOS', 'ID_TERC', 'TER-'), ID_SOLICITUD: s.ID, ID_EQUIPO: '', EQUIPO: 'Equipos de la ' + s.NUM_OT,
      PROVEEDOR: d.proveedor, NUM_GCO_FO_006: d.solicitud || s.NUM_SOL_COMPRA, CERT_REVISADO: 'NO', ENTREGABLE_VERIFICADO: 'NO',
      ESTADO: s.MODALIDAD_TERCERO === 'Sitio' ? 'Por ejecutar en sitio' : 'Por enviar', OBSERVACIONES: 'Orden de compra ' + d.oc
    });
    else terc.forEach(function (t) { ventasActualizarFila_('TERCERIZADOS', t._fila, { PROVEEDOR: d.proveedor, NUM_GCO_FO_006: d.solicitud || t.NUM_GCO_FO_006 }); });
    ventasLog_(s.ID, 'Compras emitió la orden de compra ' + d.oc + ' al tercero', s.ESTADO, s.ESTADO, d.proveedor + (d.fechaEntrega ? ' · entrega pactada ' + d.fechaEntrega : '') + ' · ' + (d.usuario || ''));
    ventasNotificarComercial_(s, '🛒 OC ' + d.oc + ' emitida a ' + d.proveedor + ' para la ' + s.NUM_OT + (s.MODALIDAD_TERCERO === 'Sitio' ? ' (servicio en sitio).' : '. El almacén ya puede recibir los equipos.'));
    if (s.MODALIDAD_TERCERO === 'Sitio') ventasAvanzarAuto_(s.ID, 'En servicio tercerizado', 'Compras emitió la OC ' + d.oc + ' al tercero (servicio en sitio)');
  } else if (evento === 'recepcion') {
    if (s.MODALIDAD_TERCERO === 'Sitio' && d.conforme) ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', s.ID).forEach(function (t) {
      if (!t.F_ENTRADA) ventasActualizarFila_('TERCERIZADOS', t._fila, { F_SALIDA: t.F_SALIDA || ventasFecha_(d.fecha), F_ENTRADA: ventasFecha_(d.fecha), ESTADO: 'Recibido - por verificar' });
    });
    ventasLog_(s.ID, 'Compras recibió el servicio del tercero (' + d.oc + ')', s.ESTADO, s.ESTADO, (d.conforme ? 'Conforme' : 'No conforme') + ' · ' + (d.fecha || '') + '. Falta verificar el certificado (5.8.1).');
  } else if (evento === 'ocAnulada') {
    ventasActualizarFila_('SOLICITUDES', s._fila, { NUM_OC_TERCERO: '', PROVEEDOR_TERCERO: '' });
    ventasLog_(s.ID, 'Compras anuló la orden de compra ' + d.oc, s.ESTADO, s.ESTADO, d.motivo || '');
  } else if (evento === 'solicitudAnulada') {
    ventasActualizarFila_('SOLICITUDES', s._fila, { NUM_SOL_COMPRA: '' });
    ventasLog_(s.ID, 'Compras anuló la solicitud ' + d.solicitud, s.ESTADO, s.ESTADO, d.motivo || '');
  }
}
/** Para el Almacén: ruta de la OT (la llama Almacen.gs). */
function ventasRutaOT_(ot) {
  var k = ventasClaveOT_(ot);
  var s = ventasLeer_('SOLICITUDES').filter(function (x) { return x.NUM_OT && ventasClaveOT_(x.NUM_OT) === k; })[0];
  if (!s) return null;
  var ruta = ventasRutaDe_(s), cmp = ruta.indexOf('tercero') === 0 ? ventasComprasOT_(s.ID) : null;
  var terc = ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', s.ID);
  return { idVentas: s.ID, ruta: ruta, certVerificado: terc.length > 0 && terc.every(function (t) { return t.CERT_REVISADO === 'SÍ' && t.ENTREGABLE_VERIFICADO === 'SÍ'; }), nombre: VENTAS_RUTAS[ruta], tercerizado: ruta.indexOf('tercero') === 0, modalidad: s.MODALIDAD_TERCERO || '',
    oc: cmp && cmp.oc ? cmp.oc.id : '', proveedor: cmp && cmp.oc ? cmp.oc.proveedor : (s.PROVEEDOR_TERCERO || ''), solicitudCompra: cmp && cmp.solicitud ? cmp.solicitud.id : '' };
}
/** Avisos del Almacén (recepción, envío y retorno del tercero, despacho) para la trazabilidad en Ventas. */
function ventasEventoAlmacen_(ot, evento, d) {
  var k = ventasClaveOT_(ot);
  var s = ventasLeer_('SOLICITUDES').filter(function (x) { return x.NUM_OT && ventasClaveOT_(x.NUM_OT) === k; })[0];
  if (!s) return;
  d = d || {};
  var terc = ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', s.ID);
  if (evento === 'envioTercero') {
    terc.forEach(function (t) { ventasActualizarFila_('TERCERIZADOS', t._fila, { F_SALIDA: ventasFecha_(d.fecha), PROVEEDOR: d.proveedor || t.PROVEEDOR,
      F_ENTRADA_ESPERADA: ventasSumarHabiles_(ventasFecha_(d.fecha) || ventasAhora_(), VENTAS_CFG.DIAS_ALERTA_TERCERIZADO), ESTADO: 'En proveedor' }); });
  } else if (evento === 'retornoTercero') {
    terc.forEach(function (t) { ventasActualizarFila_('TERCERIZADOS', t._fila, { F_ENTRADA: ventasFecha_(d.fecha), NUM_CERTIFICADO: d.certificado || t.NUM_CERTIFICADO,
      ESTADO: t.CERT_REVISADO === 'SÍ' && t.ENTREGABLE_VERIFICADO === 'SÍ' ? 'Verificado' : 'Recibido - por verificar' }); });
  } else if (evento === 'recepcion' && !s.F_LLEGADA_EQUIPOS && d.fecha) {
    ventasActualizarFila_('SOLICITUDES', s._fila, { F_LLEGADA_EQUIPOS: ventasFecha_(d.fecha) });
    ventasRecalcularCompromiso_(s.ID);
  }
  var objetivo = { recepcion: 'Programada', salida: 'En ejecución', envioTercero: 'En servicio tercerizado', retorno: 'Resultados emitidos',
    retornoTercero: 'Resultados emitidos', finSitio: 'Resultados emitidos', despacho: 'Entregada' }[evento];
  var nombres = { recepcion: 'Almacén: equipos recibidos', envioTercero: 'Almacén: equipos enviados al tercero', retornoTercero: 'Almacén: equipos regresaron del tercero',
    salida: 'Almacén: salida al área técnica', retorno: 'Almacén: retorno del área técnica', despacho: 'Almacén: despacho al cliente', finSitio: 'Almacén: servicio en sitio finalizado' };
  ventasLog_(s.ID, nombres[evento] || 'Almacén: ' + evento, s.ESTADO, s.ESTADO, d.detalle || '');
  if (objetivo) ventasAvanzarAuto_(s.ID, objetivo, nombres[evento]);
}

/* ===================================== SOLICITUDES (5.1) ============================ */

/**
 * Registra una nueva solicitud. datos = { solicitud:{...}, cliente:{...}, equipos:[...], contrato:{...} }
 * contrato (opcional) = { TIPO, NUMERO, ORDEN_SERVICIO, F_LLEGADA_EQUIPOS }: cliente con contrato vigente.
 * En ese caso no hay cotización ni seguimiento: la solicitud nace aceptada, con su OT asignada,
 * lista para programar (el contrato ya fue revisado y aceptado al firmarse).
 */
function ventasCrearSolicitud(datos) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      var s = datos.solicitud || {}, c = datos.cliente || {}, k = datos.contrato || null;
      if (!c.NIT || !c.NOMBRE) throw new Error('Debe indicar NIT y nombre del cliente.');
      if (!s.CANAL) throw new Error('Debe indicar el canal de recepción.');
      if (!s.COMERCIAL) throw new Error('Debe asignar un comercial responsable.');
      if (datos.fo004 && !ventasCorreoOk_(datos.fo004.CORREO_CERTIFICADO)) throw new Error('El correo de emisión del certificado no es válido.');
      if (k) {
        if (VENTAS_CFG.TIPOS_CONTRATO.indexOf(k.TIPO) === -1) throw new Error('Seleccione el tipo de contrato (contrato privado, contrato público u orden de servicio).');
        if (!String(k.NUMERO || '').trim()) throw new Error('Indique el número del contrato u orden de servicio.');
        if (!(datos.equipos || []).length) throw new Error('Registre los equipos/servicios de la orden de servicio.');
      }
      // Una SC que pertenece a una OT existente no se registra aparte: se vincula a su OT (mismo paquete)
      var numSC = String(s.NUM_SC || '').trim().toUpperCase();
      if (numSC && s.ESPERA_OT && !k) {
        // Solicitud del cliente (CS) que espera su OT: su número no sigue al de la OT; solo no puede repetirse
        var kSC = ventasClaveOT_(numSC), dup = ventasLeer_('SOLICITUDES').filter(function (x) { return x.ESTADO !== 'Cerrada por desistimiento' && x.CONSECUTIVO_FO004 && ventasClaveOT_(x.CONSECUTIVO_FO004) === kSC; })[0];
        if (dup) throw new Error('La solicitud ' + numSC + ' ya está registrada en ' + (dup.NUM_OT || 'la solicitud ' + dup.ID) + ' (' + dup.CLIENTE + ').');
      } else if (numSC) {
        var paq = ventasBuscarDestinoSC_(numSC, String(s.NUM_OT_SC || '').toUpperCase(), String(s.NUM_COTIZACION || ''));
        if (paq) throw new Error(ventasClienteCoincide_(c.NIT, c.NOMBRE, paq) ? 'La solicitud ' + numSC + ' pertenece a la ' + (paq.NUM_OT || 'cotización ' + paq.ID) + ': regístrela allí en lugar de crear otra.'
          : ventasErrorPaquete_(numSC, c.NOMBRE, c.NIT, paq));
        if (!k) throw new Error('La solicitud de calibración (GCV-FO-004) llega después de la cotización aceptada: regístrela en su cotización. Solo sin cotización, bajo un contrato, se crea la orden de servicio.');
      }
      var clientes = ventasLeer_('CLIENTES');
      var cli = ventasUpsertCliente_(c, clientes);   // NIT y nombre oficiales (evita duplicar clientes)
      c = Object.assign({}, c, { NIT: cli.NIT, NOMBRE: cli.NOMBRE, TIPO_CLIENTE: c.TIPO_CLIENTE || cli.TIPO_CLIENTE,
        CONTACTO: c.CONTACTO || cli.CONTACTO, TELEFONO: c.TELEFONO || cli.TELEFONO, CORREO: c.CORREO || cli.CORREO });
      if (k && k.TIPO !== 'Orden de servicio') {
        // El contrato debe pertenecer al cliente y estar vigente; si no está registrado se registra con lo indicado
        var kk = ventasClaveContrato_(k.NUMERO);
        var reg0 = ventasLeer_('CONTRATOS').filter(function (x) { return ventasClaveContrato_(x.NUM_CONTRATO) === kk; })[0];
        if (reg0) {
          if (ventasClaveNit_(reg0.CLIENTE_NIT) !== ventasClaveNit_(cli.NIT))
            throw new Error('El contrato ' + k.NUMERO + ' pertenece a ' + reg0.CLIENTE + ' (NIT ' + reg0.CLIENTE_NIT + '), no a ' + cli.NOMBRE + '.');
          if (!ventasContratoVigente_(reg0))
            throw new Error('El contrato ' + reg0.NUM_CONTRATO + ' no está vigente (estado: ' + (reg0.ESTADO || '—') + ', fin: ' + ventasFmt_(ventasFecha_(reg0.F_FIN), 'dd/MM/yyyy') + '). Actualícelo en Clientes → Contratos.');
          k.TIPO = reg0.TIPO || k.TIPO; k.NUMERO = reg0.NUM_CONTRATO;
        } else {
          ventasGuardarContrato_({ NUM_CONTRATO: k.NUMERO, CLIENTE_NIT: cli.NIT, TIPO: k.TIPO, ESTADO: 'Vigente',
            OBSERVACIONES: 'Registrado automáticamente desde una orden de servicio.' }, clientes);
        }
      }
      var id = ventasNuevoConsecutivo_();
      var reg = {
        ID: id, VERSION: 1, FECHA_RECEPCION: ventasFecha_(s.FECHA_RECEPCION) || ventasAhora_(),
        CANAL: s.CANAL, CLIENTE_NIT: String(c.NIT).trim(), CLIENTE: c.NOMBRE,
        CONTACTO: c.CONTACTO || '', TELEFONO_CONTACTO: c.TELEFONO || '', CORREO_CONTACTO: c.CORREO || '',
        TIPO_CLIENTE: c.TIPO_CLIENTE || 'Privado', COMERCIAL: s.COMERCIAL, ESTADO: 'Recibida',
        REFERENCIA: s.REFERENCIA || '', LUGAR_SERVICIO: s.LUGAR_SERVICIO || VENTAS_CFG.LUGARES[0],
        OBSERVACIONES: s.OBSERVACIONES || '', ACT_FO003: '', ACT_FO004: '', REVISION_CONTRATO_REABIERTA: 'NO', CONSECUTIVO_FO004: numSC,
        CREADO_POR: ventasUsuario_(), F_CREACION: ventasAhora_(), F_ACTUALIZACION: ventasAhora_(),
        TERCERIZADO_A_IMC: datos.TERCERIZADO_A_IMC || ''
      };
      var ot = '';
      if (k) {
        var hoy = ventasAhora_(), num = String(k.NUMERO).trim(), os = String(k.ORDEN_SERVICIO || '').trim();
        var sqk = ventasAsignarSecuencia_({ ID: '', NUM_OT: '' }, numSC);
        ot = sqk.NUM_OT; if (numSC) reg.CONSECUTIVO_FO004 = numSC;
        reg.ESTADO = 'Solicitud de calibración recibida';
        reg.TIPO_CIERRE = 'Venta'; reg.F_ACEPTADA = hoy; reg.F_CIERRE = hoy; reg.F_SOLICITUD_CAL = hoy;
        reg.TIPO_ACEPTACION = k.TIPO; reg.NUM_CONTRATO = num; reg.NUM_OT = ot;
        reg.ACT_FO003 = 'NO APLICA (contrato)';
        if (k.F_LLEGADA_EQUIPOS) reg.F_LLEGADA_EQUIPOS = ventasFecha_(k.F_LLEGADA_EQUIPOS);
        if (!reg.REFERENCIA) reg.REFERENCIA = k.TIPO + ' N° ' + num + (os ? ' · Orden de servicio ' + os : '');
        if (os) reg.OBSERVACIONES = ('Orden de servicio del cliente N° ' + os + '. ' + reg.OBSERVACIONES).trim();
      }
      if (datos.adjunto && datos.adjunto.base64) {
        // Soporte: el PDF con que el cliente pidió el servicio queda en Drive y enlazado a la solicitud
        ventasAsegurarColumnas_('SOLICITUDES');
        reg.URL_SOLICITUD_CLIENTE = ventasGuardarAdjuntoSolicitud_(id, datos.adjunto);
      }
      ventasInsertar_('SOLICITUDES', reg);
      ventasGuardarEquipos_(id, datos.equipos || []);
      ventasRecalcularTotales_(id);
      if (k) {
        ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).forEach(function (e) { ventasActualizarFila_('EQUIPOS', e._fila, { ESTADO_EQUIPO: reg.ESTADO }); });
        if (reg.F_LLEGADA_EQUIPOS) ventasRecalcularCompromiso_(id);
        ventasLog_(id, 'Orden de servicio por contrato (sin cotización)', '', reg.ESTADO,
          k.TIPO + ' N° ' + reg.NUM_CONTRATO + '. OT ' + ot + ' asignada. Canal: ' + s.CANAL + '. La revisión y aceptación se hicieron al firmar el contrato.');
      } else {
        ventasLog_(id, 'Solicitud recibida (5.1)', '', 'Recibida', 'Canal: ' + s.CANAL + (numSC ? '. SC ' + numSC + ': la OT se une al cargarla' : '') + (s.OBSERVACIONES ? '. ' + s.OBSERVACIONES : '') +
          (reg.URL_SOLICITUD_CLIENTE ? '. Documento del cliente: ' + reg.URL_SOLICITUD_CLIENTE : ''));
      }
      if (datos.conformidad) ventasGuardarConformidad_(id, datos.conformidad);
      // GCV-FO-004: campos del formato, correo de emisión de certificados, cotización y consecutivo de la SC
      var fo4 = datos.fo004 ? ventasGuardarFO004_(id, datos.fo004, !!k) : {};
      var rutaMsg = '';
      if (datos.ruta && (datos.ruta.ALCANCE || datos.ruta.TERCERIZADO)) rutaMsg = ventasDefinirRuta_(ventasBuscar_('SOLICITUDES', 'ID', id), datos.ruta).mensaje;
      if (k) ventasNotificarRol_(['COMERCIAL', 'LABORATORIO', 'DIRECTOR_TECNICO'], '📄 Orden de servicio por contrato ' + id + ' de ' + c.NOMBRE + ' (' + k.TIPO + ' N° ' + reg.NUM_CONTRATO + '). OT ' + ot + ': lista para programar.');
      else ventasNotificarRol_(['COMERCIAL'], 'Nueva solicitud ' + id + ' de ' + c.NOMBRE + ' asignada a ' + s.COMERCIAL + '.', s.COMERCIAL);
      return { ID: id, NUM_OT: ot, mensajeRuta: rutaMsg, SC: fo4.sc || '', COTIZACION: fo4.cotizacion || '' };
    });
  });
}

/** Lista de cotizaciones/solicitudes con filtros { cliente, estado, comercial, desde, hasta, texto }. */
function ventasListarSolicitudes(filtros) { seguridadRPC_();
  return ventasRespuesta_(function () {
    filtros = filtros || {};
    var desde = ventasFecha_(filtros.desde), hasta = ventasFecha_(filtros.hasta);
    if (hasta) hasta = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59);
    var txt = String(filtros.texto || '').toLowerCase();
    return ventasLeer_('SOLICITUDES').filter(function (s) {
      var f = ventasFecha_(s.FECHA_RECEPCION);
      if (filtros.estado && s.ESTADO !== filtros.estado) return false;
      if (filtros.comercial && s.COMERCIAL !== filtros.comercial) return false;
      if (filtros.cliente && String(s.CLIENTE_NIT) !== String(filtros.cliente) && String(s.CLIENTE).toLowerCase().indexOf(String(filtros.cliente).toLowerCase()) === -1) return false;
      if (desde && f && f < desde) return false;
      if (hasta && f && f > hasta) return false;
      if (txt && [s.ID, s.CLIENTE, s.REFERENCIA, s.NUM_CONTRATO, s.NUM_OT].join(' ').toLowerCase().indexOf(txt) === -1) return false;
      return true;
    }).map(ventasResumen_).sort(function (a, b) { return String(b.ID).localeCompare(String(a.ID)); });
  });
}

function ventasResumen_(s) {
  var sem = ventasSemaforo_(s);
  return {
    ID: s.ID, VERSION: s.VERSION, FECHA_RECEPCION: s.FECHA_RECEPCION, CANAL: s.CANAL, CLIENTE: s.CLIENTE,
    CLIENTE_NIT: s.CLIENTE_NIT, TIPO_CLIENTE: s.TIPO_CLIENTE, COMERCIAL: s.COMERCIAL, ESTADO: s.ESTADO,
    REFERENCIA: s.REFERENCIA, VALOR_TOTAL: s.VALOR_TOTAL, F_COMPROMISO: s.F_COMPROMISO,
    NUM_CONTRATO: s.NUM_CONTRATO, NUM_OT: s.NUM_OT, ACT_FO003: s.ACT_FO003, ACT_FO004: s.ACT_FO004,
    REVISION_CONTRATO_REABIERTA: s.REVISION_CONTRATO_REABIERTA,
    SEMAFORO: sem.color, DIAS_TRANSCURRIDOS: sem.transcurridos, DIAS_PLAZO: sem.plazo, DIAS_RESTANTES: sem.restantes
  };
}

/** Datos del tablero Kanban agrupados por estado. */
function ventasTablero(filtros) { seguridadRPC_();
  var r = ventasListarSolicitudes(filtros);
  if (!r.ok) return r;
  var col = {};
  VENTAS_ESTADOS.forEach(function (e) { col[e] = []; });
  r.data.forEach(function (s) { (col[s.ESTADO] = col[s.ESTADO] || []).push(s); });
  return { ok: true, data: { columnas: col, estados: VENTAS_ESTADOS } };
}

/** Detalle completo: solicitud, equipos, revisión, conformidad, tercerizados, historial, versiones. */
function ventasDetalle(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var sem = ventasSemaforo_(s);
    s.SEMAFORO = sem.color; s.DIAS_TRANSCURRIDOS = sem.transcurridos; s.DIAS_PLAZO = sem.plazo; s.DIAS_RESTANTES = sem.restantes;
    s.SIGUIENTES = VENTAS_TRANSICIONES[s.ESTADO] || [];
    s.TRABAJO_INICIADO = VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1;
    s.RUTA = ventasInfoRuta_(s);
    if (!s.NUM_OT) {
      var pSC = s.CONSECUTIVO_FO004 && !ventasSCAntigua_(s.CONSECUTIVO_FO004) ? ventasPartesSC_(s.CONSECUTIVO_FO004) : null;
      s.OT_PREVISTA = pSC ? ventasOTDeN_(pSC.n, pSC.anio) : '';
      s.SIGUIENTE_SC = !pSC ? ventasNumSC_(ventasSiguienteSecuencia_(s.ID)) : '';
    }
    var conf = ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', id);
    return {
      solicitud: s,
      cliente: ventasBuscar_('CLIENTES', 'NIT', s.CLIENTE_NIT),
      equipos: ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).sort(function (a, b) { return a.ITEM - b.ITEM; }),
      revisiones: ventasFiltrar_('REVISION', 'ID_SOLICITUD', id),
      conformidad: conf,
      tercerizados: ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', id),
      historial: ventasFiltrar_('HISTORIAL', 'ID_SOLICITUD', id).sort(function (a, b) { return ventasFecha_(a.FECHA) - ventasFecha_(b.FECHA); }),
      versiones: ventasFiltrar_('VERSIONES', 'ID_SOLICITUD', id).map(function (v) { delete v.SNAPSHOT_JSON; return v; }),
      postventa: ventasLeer_('POSTVENTA').filter(function (p) { return String(p.ID_SOLICITUDES).split(',').map(function (x) { return x.trim(); }).indexOf(String(id)) > -1; })
    };
  });
}

/** Actualiza datos generales (no cambia estado). */
function ventasActualizarSolicitud(id, cambios) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var permitidos = ['CANAL', 'CONTACTO', 'TELEFONO_CONTACTO', 'CORREO_CONTACTO', 'TIPO_CLIENTE', 'COMERCIAL',
      'REFERENCIA', 'LUGAR_SERVICIO', 'OBSERVACIONES', 'F_PROXIMO_SEGUIMIENTO', 'F_LLEGADA_EQUIPOS', 'NUM_CONTRATO', 'TIPO_ACEPTACION'];
    var c = {}, txt = [];
    permitidos.forEach(function (k) {
      var antes = s[k] instanceof Date ? ventasFmt_(s[k]) : String(s[k]);
      if (cambios[k] !== undefined && String(cambios[k]) !== antes) {
        c[k] = /^F_/.test(k) ? ventasFecha_(cambios[k]) : cambios[k];
        txt.push(k + ': "' + antes + '" → "' + cambios[k] + '"');
      }
    });
    if (!txt.length) return { sinCambios: true };
    c.F_ACTUALIZACION = ventasAhora_();
    ventasActualizarFila_('SOLICITUDES', s._fila, c);
    if (c.F_LLEGADA_EQUIPOS) ventasRecalcularCompromiso_(id);
    var iniciado = VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1;
    ventasLog_(id, 'Actualización de datos', s.ESTADO, s.ESTADO, txt.join('; '), iniciado);
    return { actualizado: true };
  });
}

/* ===================================== EQUIPOS ====================================== */

function ventasGuardarEquipos_(id, equipos) {
  var sh = ventasHoja_('EQUIPOS');
  var actuales = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id);
  ventasEliminarFilas_('EQUIPOS', actuales.map(function (e) { return e._fila; }));
  var enc = ventasEncabezados_(sh);
  var filas = [];
  (equipos || []).forEach(function (e, i) {
    if (!e.EQUIPO && !e.MAGNITUD) return;
    var tipo = e.TIPO_SERVICIO || 'Propio';
    var o = {
      ID_EQUIPO: id + '-E' + ('00' + (i + 1)).slice(-3), ID_SOLICITUD: id, ITEM: i + 1,
      MAGNITUD: e.MAGNITUD || '', EQUIPO: e.EQUIPO || '', MARCA: e.MARCA || '', MODELO: e.MODELO || '',
      SERIE: e.SERIE || '', CODIGO_INVENTARIO: e.CODIGO_INVENTARIO || '', UBICACION: e.UBICACION || '',
      RANGO: e.RANGO || '', PUNTOS_CALIBRACION: e.PUNTOS_CALIBRACION || '', METODO: e.METODO || '',
      INCERTIDUMBRE: e.INCERTIDUMBRE || '', EMP: e.EMP || '', COND_AMBIENTALES: e.COND_AMBIENTALES || '',
      CRITERIO_ACEPTACION: e.CRITERIO_ACEPTACION || '', TIPO_SERVICIO: tipo,
      PLAZO_DIAS: ventasPlazoMagnitud_(e.MAGNITUD, tipo), F_COMPROMISO: '',
      CANTIDAD: ventasNum_(e.CANTIDAD) || 1, VALOR_UNITARIO: ventasNum_(e.VALOR_UNITARIO),
      IVA_PCT: e.IVA_PCT === '' || e.IVA_PCT === undefined ? VENTAS_CFG.IVA_DEFECTO : ventasNum_(e.IVA_PCT),
      ESTADO_EQUIPO: e.ESTADO_EQUIPO || 'Pendiente', OBSERVACIONES: e.OBSERVACIONES || ''
    };
    filas.push(enc.map(function (c) { return o[c] === undefined ? '' : o[c]; }));
  });
  if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, enc.length).setValues(filas);
  ventasRecalcularCompromiso_(id);
}

function ventasRecalcularTotales_(id) {
  var s = ventasBuscar_('SOLICITUDES', 'ID', id);
  if (!s) return;
  var sub = 0, iva = 0;
  ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).forEach(function (e) {
    var st = ventasNum_(e.CANTIDAD) * ventasNum_(e.VALOR_UNITARIO);
    sub += st; iva += st * ventasNum_(e.IVA_PCT) / 100;
  });
  // Sin valores en los equipos, el valor de la venta es el de la cotización cargada
  if (!sub && ventasNum_(s.VALOR_COTIZACION)) return;
  ventasActualizarFila_('SOLICITUDES', s._fila, { VALOR_SUBTOTAL: Math.round(sub), VALOR_IVA: Math.round(iva), VALOR_TOTAL: Math.round(sub + iva) });
}

/** Fecha compromiso por equipo y solicitud: llegada + plazo en días hábiles (desde el día siguiente). */
function ventasRecalcularCompromiso_(id) {
  var s = ventasBuscar_('SOLICITUDES', 'ID', id);
  if (!s) return;
  var inicio = s.F_LLEGADA_EQUIPOS || (s.LUGAR_SERVICIO === 'En sitio' ? s.F_PROGRAMADA : '');
  if (!inicio) return;
  var maxF = '';
  ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).forEach(function (e) {
    var plazo = ventasNum_(e.PLAZO_DIAS) || ventasPlazoMagnitud_(e.MAGNITUD, e.TIPO_SERVICIO);
    var f = ventasSumarHabiles_(inicio, plazo);
    ventasActualizarFila_('EQUIPOS', e._fila, { F_COMPROMISO: f, PLAZO_DIAS: plazo });
    if (!maxF || f > maxF) maxF = f;
  });
  if (maxF) ventasActualizarFila_('SOLICITUDES', s._fila, { F_COMPROMISO: maxF });
}

/**
 * Guarda equipos antes de iniciar el trabajo (no genera versión). Si la cotización ya fue emitida,
 * se trata como modificación de alcance (5.6) y se versiona.
 */
function ventasGuardarEquipos(id, equipos, motivo) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    if (['Recibida', 'En revisión de requisitos'].indexOf(s.ESTADO) > -1) {
      ventasGuardarEquipos_(id, equipos);
      ventasRecalcularTotales_(id);
      ventasLog_(id, 'Equipos actualizados', s.ESTADO, s.ESTADO, (equipos || []).length + ' equipo(s)');
      return { versionado: false };
    }
    return ventasModificarAlcance_(id, equipos, motivo || 'Modificación de equipos');
  });
}

/* ======================== MODIFICACIÓN DEL ALCANCE (5.6) / CONTRATO (5.5) =========== */

function ventasModificarAlcance(id, equipos, motivo, personalAfectado) { seguridadRPC_();
  return ventasRespuesta_(function () { return ventasModificarAlcance_(id, equipos, motivo, personalAfectado); });
}

function ventasModificarAlcance_(id, equipos, motivo, personalAfectado) {
  return ventasConLock_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    if (!motivo) throw new Error('Debe describir el motivo de la modificación del alcance.');
    if (['Cerrada por desistimiento', 'Entregada', 'Facturada', 'Postventa'].indexOf(s.ESTADO) > -1)
      throw new Error('No se puede modificar el alcance en estado "' + s.ESTADO + '".');
    var iniciado = VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1;
    if (iniciado && !personalAfectado) throw new Error('El trabajo ya inició: indique el personal afectado al que se comunicó el cambio (5.5).');
    var vAnt = ventasNum_(s.VERSION) || 1;
    ventasGuardarVersion_(s, vAnt, vAnt + 1, motivo, 'Modificación de alcance (5.6)');
    ventasGuardarEquipos_(id, equipos);
    ventasRecalcularTotales_(id);
    var cambios = { VERSION: vAnt + 1, ACT_FO003: 'PENDIENTE', ACT_FO004: 'PENDIENTE', F_ACTUALIZACION: ventasAhora_() };
    if (iniciado) cambios.REVISION_CONTRATO_REABIERTA = 'SÍ';
    ventasActualizarFila_('SOLICITUDES', s._fila, cambios);
    ventasLog_(id, 'Modificación del alcance (5.6) - V' + vAnt + ' → V' + (vAnt + 1), s.ESTADO, s.ESTADO,
      motivo + '. Se marca actualización de GCV-FO-003 y GCV-FO-004.' + (iniciado ? ' Se reabre la revisión del contrato (5.5).' : ''),
      iniciado, personalAfectado || '');
    ventasNotificarRol_(['LABORATORIO', 'DIRECTOR_TECNICO'],
      '⚠️ Modificación de alcance en ' + id + ' (' + s.CLIENTE + '), versión V' + (vAnt + 1) + '. Motivo: ' + motivo +
      '. Se debe actualizar GCV-FO-003 y GCV-FO-004.' + (iniciado ? ' El trabajo ya estaba iniciado: revisar nuevamente el contrato.' : ''));
    return { versionado: true, version: vAnt + 1, revisionReabierta: iniciado };
  });
}

/** Contrato modificado (5.5). Reabre la revisión y registra la comunicación al personal afectado. */
function ventasModificarContrato(id, detalle, personalAfectado) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    if (!detalle) throw new Error('Describa la modificación del contrato.');
    var iniciado = VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1;
    if (iniciado && !personalAfectado) throw new Error('El trabajo ya inició: registre el personal afectado al que se comunicó la modificación.');
    var vAnt = ventasNum_(s.VERSION) || 1;
    ventasGuardarVersion_(s, vAnt, vAnt + 1, detalle, 'Modificación de contrato (5.5)');
    ventasActualizarFila_('SOLICITUDES', s._fila, { VERSION: vAnt + 1, REVISION_CONTRATO_REABIERTA: 'SÍ', F_ACTUALIZACION: ventasAhora_() });
    ventasLog_(id, 'Modificación del contrato (5.5) - revisión reabierta', s.ESTADO, s.ESTADO, detalle, iniciado, personalAfectado || '');
    ventasNotificarRol_(['LABORATORIO', 'DIRECTOR_TECNICO'], '⚠️ Contrato modificado en ' + id + ' (' + s.CLIENTE + '): ' + detalle + '. Se requiere repetir la revisión del contrato.');
    return { version: vAnt + 1 };
  });
}

function ventasGuardarVersion_(s, vAnt, vNueva, motivo, tipo) {
  var snap = {
    solicitud: ventasSerializar_(s),
    equipos: ventasSerializar_(ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID)),
    conformidad: ventasSerializar_(ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', s.ID))
  };
  var json = JSON.stringify(snap);
  if (json.length > 49000) json = json.substring(0, 49000) + '...[truncado]';
  ventasInsertar_('VERSIONES', {
    FECHA: ventasAhora_(), ID_SOLICITUD: s.ID, VERSION_ANTERIOR: vAnt, VERSION_NUEVA: vNueva,
    MOTIVO: motivo, TIPO: tipo, USUARIO: ventasUsuario_(), SNAPSHOT_JSON: json
  });
}

function ventasVerVersion(id, versionAnterior) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var v = ventasLeer_('VERSIONES').filter(function (x) { return String(x.ID_SOLICITUD) === String(id) && String(x.VERSION_ANTERIOR) === String(versionAnterior); });
    if (!v.length) throw new Error('Versión no encontrada.');
    try { return JSON.parse(v[v.length - 1].SNAPSHOT_JSON); } catch (e) { return { raw: v[v.length - 1].SNAPSHOT_JSON }; }
  });
}

/* ============================ REVISIÓN DE REQUISITOS Y CAPACIDAD (5.2 / 5.4) ======== */

/**
 * r = { PERSONAL_COMPETENTE, PATRONES, METODO, INSTALACIONES, COND_AMBIENTALES (SÍ/NO),
 *       RESULTADO, DESVIACION, F_CLIENTE_NOTIFICADO, MEDIO_NOTIFICACION, RESP_TECNICO, RESP_COMERCIAL, OBSERVACIONES }
 */
function ventasRegistrarRevision(id, r) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id);
      if (!r.RESULTADO) throw new Error('Seleccione el resultado de la revisión.');
      if (!r.RESP_TECNICO || !r.RESP_COMERCIAL) throw new Error('Indique el responsable técnico y el responsable comercial que revisaron.');
      var items = ['PERSONAL_COMPETENTE', 'PATRONES', 'METODO', 'INSTALACIONES', 'COND_AMBIENTALES'];
      var noCumple = items.filter(function (k) { return String(r[k]).toUpperCase() !== 'SÍ' && String(r[k]).toUpperCase() !== 'SI' && String(r[k]).toUpperCase() !== 'N/A'; });
      if (r.RESULTADO === 'Capacidad confirmada' && noCumple.length)
        throw new Error('No puede confirmar capacidad con ítems del checklist sin cumplir: ' + noCumple.join(', '));
      var esDesv = r.RESULTADO === 'Con desviación';
      if (esDesv) {
        if (!r.DESVIACION) throw new Error('Describa la desviación técnica (5.4).');
        if (!r.F_CLIENTE_NOTIFICADO) throw new Error('Registre la fecha en que se notificó la desviación al cliente (5.4).');
      }
      var trabajoIniciado = VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1;
      var tipo = trabajoIniciado || s.REVISION_CONTRATO_REABIERTA === 'SÍ' ? 'Re-revisión de contrato (5.5)'
        : (esDesv ? 'Desviación técnica (5.4)' : 'Revisión inicial (5.2)');
      var version = ventasNum_(s.VERSION) || 1;
      // Desviación sobre una cotización ya emitida: se versiona. Si aún está en fase comercial se reabre (5.4).
      var versionar = esDesv && !!s.F_COTIZADA;
      var nuevaCot = versionar && ['Cotizada', 'En seguimiento', 'En revisión de requisitos'].indexOf(s.ESTADO) > -1;
      if (versionar) {
        ventasGuardarVersion_(s, version, version + 1, 'Desviación técnica: ' + r.DESVIACION, 'Desviación técnica (5.4)');
        version = version + 1;
      }
      ventasInsertar_('REVISION', {
        ID_REVISION: ventasNuevoIdSimple_('REVISION', 'ID_REVISION', 'REV-'), ID_SOLICITUD: id, VERSION: version,
        TIPO_REVISION: tipo, FECHA: ventasAhora_(),
        PERSONAL_COMPETENTE: r.PERSONAL_COMPETENTE || 'NO', PATRONES: r.PATRONES || 'NO', METODO: r.METODO || 'NO',
        INSTALACIONES: r.INSTALACIONES || 'NO', COND_AMBIENTALES: r.COND_AMBIENTALES || 'NO',
        RESULTADO: r.RESULTADO, DESVIACION: r.DESVIACION || '', F_CLIENTE_NOTIFICADO: ventasFecha_(r.F_CLIENTE_NOTIFICADO),
        MEDIO_NOTIFICACION: r.MEDIO_NOTIFICACION || '', NUEVA_COTIZACION: nuevaCot ? 'SÍ' : 'NO',
        RESP_TECNICO: r.RESP_TECNICO, RESP_COMERCIAL: r.RESP_COMERCIAL, OBSERVACIONES: r.OBSERVACIONES || '',
        USUARIO: ventasUsuario_()
      });
      var cambios = { F_REVISION: ventasAhora_(), F_ACTUALIZACION: ventasAhora_() };
      var nuevoEstado = s.ESTADO;
      if (s.ESTADO === 'Recibida') nuevoEstado = 'En revisión de requisitos';
      if (versionar) { cambios.VERSION = version; cambios.ACT_FO003 = 'PENDIENTE'; }
      if (nuevaCot) nuevoEstado = 'En revisión de requisitos';
      if (trabajoIniciado || s.REVISION_CONTRATO_REABIERTA === 'SÍ') cambios.REVISION_CONTRATO_REABIERTA = 'REVISADA';
      cambios.ESTADO = nuevoEstado;
      ventasActualizarFila_('SOLICITUDES', s._fila, cambios);
      ventasLog_(id, tipo + ' - ' + r.RESULTADO, s.ESTADO, nuevoEstado,
        (r.DESVIACION ? 'Desviación: ' + r.DESVIACION + '. Cliente notificado: ' + ventasFmt_(r.F_CLIENTE_NOTIFICADO) + ' (' + (r.MEDIO_NOTIFICACION || '') + '). ' : '') +
        (nuevaCot ? 'Se reabre la cotización con versión V' + version + '.' : (versionar ? 'Nueva versión V' + version + ' (actualizar GCV-FO-003).' : '')) + (r.OBSERVACIONES || ''), trabajoIniciado);
      if (r.RESULTADO === 'No atendible') {
        ventasNotificarComercial_(s, 'La solicitud ' + id + ' (' + s.CLIENTE + ') fue revisada como NO ATENDIBLE. Informe al cliente y cierre por desistimiento.');
      }
      return { estado: nuevoEstado, version: version, nuevaCotizacion: nuevaCot };
    });
  });
}

function ventasUltimaRevision_(id, version) {
  var revs = ventasFiltrar_('REVISION', 'ID_SOLICITUD', id);
  if (version) revs = revs.filter(function (r) { return Number(r.VERSION) === Number(version); });
  revs.sort(function (a, b) { return ventasFecha_(a.FECHA) - ventasFecha_(b.FECHA); });
  return revs.length ? revs[revs.length - 1] : null;
}

/* ============================ DECLARACIÓN DE CONFORMIDAD (5.7.1) ==================== */

function ventasGuardarConformidad(id, c) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var r = ventasGuardarConformidad_(id, c);
    ventasLog_(id, 'Declaración de conformidad (5.7.1)', s.ESTADO, s.ESTADO,
      c.SOLICITA === 'SÍ' ? ('Norma: ' + c.NORMA + '. Regla: ' + c.REGLA + (r.advertencias.length ? '. ' + r.advertencias.join(' ') : '')) : 'No solicita declaración',
      VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1);
    return r;
  });
}

function ventasGuardarConformidad_(id, c) {
  var solicita = String(c.SOLICITA || 'NO').toUpperCase().replace('SI', 'SÍ');
  var adv = [], val = 'N/A';
  if (solicita === 'SÍ') {
    if (!c.NORMA) throw new Error('Indique el documento según el cual se declara la conformidad (Conformidad según documento).');
    if (!c.REGLA) throw new Error('Seleccione la regla de decisión.');
    val = ventasValidarConformidad_(id, c.REGLA, adv);
  }
  var reg = {
    ID_SOLICITUD: id, SOLICITA_DECLARACION: solicita, NORMA_ESPECIFICACION: c.NORMA || '',
    REGLA_DECISION: solicita === 'SÍ' ? c.REGLA : '', VALIDACION: val, ADVERTENCIAS: adv.join(' | '),
    ACEPTADA_POR_CLIENTE: c.ACEPTADA_POR_CLIENTE || '', FECHA: ventasAhora_(), USUARIO: ventasUsuario_()
  };
  var ex = ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', id);
  if (ex) ventasActualizarFila_('CONFORMIDAD', ex._fila, reg); else ventasInsertar_('CONFORMIDAD', reg);
  return { validacion: val, advertencias: adv };
}

/** Regla binaria simple: se requiere U ≤ 1/3 EMP. Valida equipo por equipo cuando hay datos numéricos. */
function ventasValidarConformidad_(id, regla, adv) {
  if (regla.indexOf('simple') === -1) return 'No requiere validación U/EMP';
  adv.push('Regla de aceptación simple: se requiere que la incertidumbre expandida U sea ≤ 1/3 del EMP.');
  var equipos = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id), incumple = [], sinDatos = 0;
  equipos.forEach(function (e) {
    var u = ventasNum_(e.INCERTIDUMBRE), emp = ventasNum_(e.EMP);
    if (!u || !emp) { sinDatos++; return; }
    if (u > emp / 3) incumple.push('Ítem ' + e.ITEM + ' (' + e.EQUIPO + '): U=' + u + ' > EMP/3=' + Math.round(emp / 3 * 10000) / 10000);
  });
  if (incumple.length) { adv.push('NO CUMPLE U ≤ EMP/3 → ' + incumple.join('; ') + '. Proponga regla con zona de seguridad.'); return 'NO CUMPLE'; }
  if (sinDatos) { adv.push(sinDatos + ' equipo(s) sin U o EMP numéricos: verificar manualmente.'); return 'PENDIENTE VERIFICAR'; }
  return 'CUMPLE';
}

/* ===================================== CAMBIO DE ESTADO ============================= */

/**
 * Avanza el flujo. extra = { observacion, motivo, tipoAceptacion, numContrato, consecutivoFO004,
 *   fechaLlegada, fechaProgramada, numFactura, fecha }
 */
function ventasCambiarEstado(id, nuevo, extra) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () { return ventasCambiarEstado_(id, nuevo, extra); });
  });
}
function ventasCambiarEstado_(id, nuevo, extra) {
  {
    {
      extra = extra || {};
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id);
      var permitidos = VENTAS_TRANSICIONES[s.ESTADO] || [];
      if (permitidos.indexOf(nuevo) === -1) throw new Error('Transición no permitida: "' + s.ESTADO + '" → "' + nuevo + '".');
      var f = ventasFecha_(extra.fecha) || ventasAhora_();
      var c = { ESTADO: nuevo, F_ACTUALIZACION: ventasAhora_() };
      var obs = extra.observacion || '';
      var equipos = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id);

      switch (nuevo) {
        case 'En revisión de requisitos':
          if (['Cotizada', 'En seguimiento'].indexOf(s.ESTADO) > -1) {
            if (!obs) throw new Error('Indique por qué se reabre la revisión.');
            var v = ventasNum_(s.VERSION) || 1;
            ventasGuardarVersion_(s, v, v + 1, obs, 'Reapertura de cotización');
            c.VERSION = v + 1; c.ACT_FO003 = 'PENDIENTE';
          }
          break;
        case 'Cotizada':
          if (!equipos.length) throw new Error('Registre al menos un equipo/servicio antes de cotizar.');
          var rev = ventasUltimaRevision_(id, s.VERSION) || ventasUltimaRevision_(id);
          if (!rev) throw new Error('Debe registrar la revisión de requisitos y capacidad (5.2) antes de cotizar.');
          if (rev.RESULTADO === 'No atendible') throw new Error('La revisión concluyó "No atendible". Cierre por desistimiento.');
          if (rev.RESULTADO === 'Con desviación' && !rev.F_CLIENTE_NOTIFICADO) throw new Error('Falta registrar la notificación de la desviación al cliente (5.4).');
          var conf = ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', id);
          if (conf && conf.SOLICITA_DECLARACION === 'SÍ' && conf.VALIDACION === 'NO CUMPLE')
            obs += ' ADVERTENCIA: la regla simple no cumple U ≤ EMP/3 en algunos equipos.';
          c.F_COTIZADA = f; c.F_ULTIMO_SEGUIMIENTO = f;
          c.F_PROXIMO_SEGUIMIENTO = ventasSumarHabiles_(f, VENTAS_CFG.DIAS_SEGUIMIENTO);
          if (s.ACT_FO003 === 'PENDIENTE') c.ACT_FO003 = 'ACTUALIZAR AL GENERAR';
          break;
        case 'En seguimiento':
          c.F_ULTIMO_SEGUIMIENTO = f;
          c.F_PROXIMO_SEGUIMIENTO = ventasFecha_(extra.proximo) || ventasSumarHabiles_(f, VENTAS_CFG.DIAS_SEGUIMIENTO);
          break;
        case 'Cerrada por venta':
          if (!extra.tipoAceptacion) throw new Error('Indique cómo aceptó el cliente (orden de servicio o contrato).');
          if (VENTAS_CFG.TIPOS_ACEPTACION.indexOf(extra.tipoAceptacion) === -1) throw new Error('La aceptación del servicio es con orden de servicio o contrato.');
          if (!extra.numContrato) throw new Error('Indique el número de la orden de servicio o del contrato.');
          c.TIPO_CIERRE = 'Venta'; c.F_ACEPTADA = f; c.F_CIERRE = f;
          c.TIPO_ACEPTACION = extra.tipoAceptacion; c.NUM_CONTRATO = extra.numContrato || '';
          obs = 'Aceptación: ' + extra.tipoAceptacion + (extra.numContrato ? ' N° ' + extra.numContrato : '') + '. ' + obs;
          break;
        case 'Cerrada por desistimiento':
          if (!extra.motivo) throw new Error('Seleccione el motivo del desistimiento.');
          c.TIPO_CIERRE = 'Desistimiento'; c.MOTIVO_CIERRE = extra.motivo; c.F_CIERRE = f;
          obs = 'Motivo: ' + extra.motivo + '. ' + obs;
          break;
        case 'Solicitud de calibración recibida':
          c.F_SOLICITUD_CAL = f;
          // 5.7: con la SC y la aceptación se relaciona la orden de trabajo (GCV-FO-002); la SC y la OT llevan el mismo consecutivo
          var sq = ventasAsignarSecuencia_(s, extra.consecutivoFO004);
          c.CONSECUTIVO_FO004 = sq.CONSECUTIVO_FO004; if (!s.NUM_OT) c.NUM_OT = sq.NUM_OT;
          if (extra.fechaLlegada) c.F_LLEGADA_EQUIPOS = ventasFecha_(extra.fechaLlegada);
          break;
        case 'Programada':
          c.F_PROGRAMADA = ventasFecha_(extra.fechaProgramada) || f;
          if (extra.fechaLlegada) c.F_LLEGADA_EQUIPOS = ventasFecha_(extra.fechaLlegada);
          if (!c.F_LLEGADA_EQUIPOS && !s.F_LLEGADA_EQUIPOS && s.LUGAR_SERVICIO !== 'En sitio')
            throw new Error('Registre la fecha de llegada de los equipos al laboratorio (inicia el conteo de días hábiles).');
          if (!s.NUM_OT) { var sq2 = ventasAsignarSecuencia_(s); c.NUM_OT = sq2.NUM_OT; if (!s.CONSECUTIVO_FO004) c.CONSECUTIVO_FO004 = sq2.CONSECUTIVO_FO004; }
          break;
        case 'En ejecución':
          c.F_EJECUCION = s.F_EJECUCION || f;
          break;
        case 'En servicio tercerizado':
          ventasValidarRuta_(s, nuevo);
          if (!ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', id).length)
            throw new Error('Registre primero el envío del equipo al proveedor (GCO-FO-006) en la pestaña Tercerizados.');
          break;
        case 'Resultados emitidos':
          var pend = ventasFiltrar_('TERCERIZADOS', 'ID_SOLICITUD', id).filter(function (t) {
            return !t.F_ENTRADA || t.CERT_REVISADO !== 'SÍ' || t.ENTREGABLE_VERIFICADO !== 'SÍ';
          });
          if (pend.length) throw new Error('Hay ' + pend.length + ' equipo(s) tercerizado(s) sin retorno, sin revisión del certificado o sin verificación del entregable (5.8.1).');
          if (s.REVISION_CONTRATO_REABIERTA === 'SÍ') throw new Error('La revisión del contrato está reabierta (5.5/5.6). Registre la re-revisión antes de emitir resultados.');
          c.F_RESULTADOS = f;
          break;
        case 'Entregada':
          ventasValidarRuta_(s, nuevo);
          c.F_ENTREGADA = f;
          break;
        case 'Facturada':
          if (!extra.numFactura) throw new Error('Indique el número de factura.');
          ventasValidarRuta_(s, nuevo);
          c.F_FACTURADA = f; c.NUM_FACTURA = extra.numFactura;
          obs = 'Factura N° ' + extra.numFactura + '. ' + obs;
          break;
      }

      ventasActualizarFila_('SOLICITUDES', s._fila, c);
      if (c.F_LLEGADA_EQUIPOS || c.F_PROGRAMADA) ventasRecalcularCompromiso_(id);
      if (nuevo === 'Programada' || nuevo === 'Solicitud de calibración recibida') {
        equipos.forEach(function (e) { ventasActualizarFila_('EQUIPOS', e._fila, { ESTADO_EQUIPO: nuevo }); });
      }
      ventasLog_(id, 'Cambio de estado', s.ESTADO, nuevo, obs.trim(), VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1);
      if (c.NUM_OT && String(s.TERCERIZADO).toUpperCase() === 'SI') ventasAsegurarCompraTercero_(Object.assign(s, c));
      ventasNotificarCambio_(s, nuevo, c);
      return { estado: nuevo, cambios: ventasSerializar_(c) };
    }
  }
}
// Avanza el estado de Ventas hasta "objetivo" por las transiciones permitidas, cuando un hecho de Almacén o Compras lo cumple.
// Nunca retrocede; si un paso no se puede dar (falta un dato o una etapa de la ruta) se detiene sin error.
function ventasAvanzarAuto_(id, objetivo, motivo) {
  var s = ventasBuscar_('SOLICITUDES', 'ID', id);
  if (!s || s.TIPO_CIERRE !== 'Venta') return;
  var orden = function (e) { return VENTAS_ESTADOS.indexOf(e); };
  if (orden(objetivo) <= orden(s.ESTADO)) return;
  var previo = {}, cola = [s.ESTADO], visto = {}; visto[s.ESTADO] = true;
  while (cola.length && !visto[objetivo]) {
    var e = cola.shift();
    (VENTAS_TRANSICIONES[e] || []).forEach(function (x) { if (!visto[x] && orden(x) > orden(e) && orden(x) <= orden(objetivo)) { visto[x] = true; previo[x] = e; cola.push(x); } });
  }
  if (!visto[objetivo]) return;
  var camino = [], x = objetivo;
  while (x !== s.ESTADO) { camino.unshift(x); x = previo[x]; }
  for (var i = 0; i < camino.length; i++) {
    try { ventasCambiarEstado_(id, camino[i], { observacion: 'Automático: ' + motivo }); }
    catch (err) { Logger.log('Ventas: avance automático detenido en "' + camino[i] + '": ' + err.message); return; }
  }
}

/** Seguimiento comercial (llamada, correo...) sin cambiar a otro estado distinto de "En seguimiento". */
function ventasRegistrarSeguimiento(id, nota, proximo) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    if (['Cotizada', 'En seguimiento'].indexOf(s.ESTADO) === -1) throw new Error('El seguimiento aplica a cotizaciones emitidas.');
    if (!nota) throw new Error('Describa el seguimiento realizado.');
    var hoy = ventasAhora_();
    ventasActualizarFila_('SOLICITUDES', s._fila, {
      ESTADO: 'En seguimiento', F_ULTIMO_SEGUIMIENTO: hoy,
      F_PROXIMO_SEGUIMIENTO: ventasFecha_(proximo) || ventasSumarHabiles_(hoy, VENTAS_CFG.DIAS_SEGUIMIENTO),
      F_ACTUALIZACION: hoy
    });
    ventasLog_(id, 'Seguimiento comercial', s.ESTADO, 'En seguimiento', nota);
    return { ok: true };
  });
}

/** Registro libre en la bitácora. */
function ventasAgregarNota(id, nota, personalComunicado) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    ventasLog_(id, 'Nota', s.ESTADO, s.ESTADO, nota, VENTAS_ESTADOS_TRABAJO_INICIADO.indexOf(s.ESTADO) > -1, personalComunicado || '');
    return true;
  });
}

/* ===================================== TERCERIZADOS (5.8.1) ========================= */

/** t = { ID_TERC?, ID_EQUIPO, PROVEEDOR, NUM_GCO_FO_006, F_SALIDA, F_ENTRADA, NUM_CERTIFICADO, CERT_REVISADO, REVISADO_POR, ENTREGABLE_VERIFICADO, OBSERVACIONES } */
function ventasGuardarTercerizado(id, t) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    if (!t.PROVEEDOR) throw new Error('Indique el proveedor.');
    if (!t.NUM_GCO_FO_006) throw new Error('Indique el número de GCO-FO-006.');
    var eq = t.ID_EQUIPO ? ventasBuscar_('EQUIPOS', 'ID_EQUIPO', t.ID_EQUIPO) : null;
    var salida = ventasFecha_(t.F_SALIDA);
    var reg = {
      ID_SOLICITUD: id, ID_EQUIPO: t.ID_EQUIPO || '', EQUIPO: eq ? (eq.EQUIPO + ' ' + eq.SERIE).trim() : (t.EQUIPO || ''),
      PROVEEDOR: t.PROVEEDOR, NUM_GCO_FO_006: t.NUM_GCO_FO_006, F_SALIDA: salida,
      F_ENTRADA_ESPERADA: salida ? ventasSumarHabiles_(salida, VENTAS_CFG.DIAS_ALERTA_TERCERIZADO) : '',
      F_ENTRADA: ventasFecha_(t.F_ENTRADA), NUM_CERTIFICADO: t.NUM_CERTIFICADO || '',
      CERT_REVISADO: t.CERT_REVISADO || 'NO', F_REVISION_CERT: t.CERT_REVISADO === 'SÍ' ? (ventasFecha_(t.F_REVISION_CERT) || ventasAhora_()) : '',
      REVISADO_POR: t.REVISADO_POR || '', ENTREGABLE_VERIFICADO: t.ENTREGABLE_VERIFICADO || 'NO',
      OBSERVACIONES: t.OBSERVACIONES || ''
    };
    if (t.CERT_REVISADO === 'SÍ' && !t.REVISADO_POR) throw new Error('Indique quién revisó el certificado del proveedor.');
    reg.ESTADO = !reg.F_SALIDA ? 'Por enviar' : (!reg.F_ENTRADA ? 'En proveedor' :
      (reg.CERT_REVISADO === 'SÍ' && reg.ENTREGABLE_VERIFICADO === 'SÍ' ? 'Verificado' : 'Recibido - por verificar'));
    var ex = t.ID_TERC ? ventasBuscar_('TERCERIZADOS', 'ID_TERC', t.ID_TERC) : null;
    if (ex) { ventasActualizarFila_('TERCERIZADOS', ex._fila, reg); reg.ID_TERC = ex.ID_TERC; }
    else { reg.ID_TERC = ventasNuevoIdSimple_('TERCERIZADOS', 'ID_TERC', 'TER-'); ventasInsertar_('TERCERIZADOS', reg); }
    if (eq && String(eq.TIPO_SERVICIO) !== 'Tercerizado') {
      ventasActualizarFila_('EQUIPOS', eq._fila, { TIPO_SERVICIO: 'Tercerizado', PLAZO_DIAS: VENTAS_CFG.PLAZO_TERCERIZADO });
      ventasRecalcularCompromiso_(id);
    }
    ventasLog_(id, 'Servicio tercerizado (5.8.1) - ' + reg.ESTADO, s.ESTADO, s.ESTADO,
      reg.EQUIPO + ' → ' + reg.PROVEEDOR + ' (GCO-FO-006 N° ' + reg.NUM_GCO_FO_006 + ')');
    if (reg.ESTADO === 'Verificado') {
      // Certificado verificado: resultados emitidos; si los equipos ya se despacharon (o el servicio fue en sitio) queda lista para facturar
      ventasAvanzarAuto_(id, 'Resultados emitidos', 'certificado del proveedor verificado (5.8.1)');
      var rt = ventasInfoRuta_(ventasBuscar_('SOLICITUDES', 'ID', id));
      if (rt.ruta === 'tercero-lab' && rt.etapas.filter(function (e) { return e.k === 'despacho'; })[0].ok) ventasAvanzarAuto_(id, 'Entregada', 'equipos despachados y certificado verificado');
    }
    return reg;
  });
}

/* ===================================== POSTVENTA (5.10) ============================= */

function ventasListarPostventa(filtros) { seguridadRPC_();
  return ventasRespuesta_(function () {
    filtros = filtros || {};
    return ventasLeer_('POSTVENTA').filter(function (p) {
      if (filtros.periodo && p.PERIODO !== filtros.periodo) return false;
      if (filtros.estado && p.ESTADO !== filtros.estado) return false;
      return true;
    });
  });
}

/** Registra la respuesta de una encuesta. */
function ventasRegistrarEncuesta(idPost, calificacion, comentarios) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var p = ventasBuscar_('POSTVENTA', 'ID_POST', idPost);
    if (!p) throw new Error('Encuesta no encontrada.');
    var cal = ventasNum_(calificacion);
    if (cal < 1 || cal > 5) throw new Error('La calificación debe estar entre 1 y 5.');
    ventasActualizarFila_('POSTVENTA', p._fila, { F_RESPUESTA: ventasAhora_(), CALIFICACION: cal, COMENTARIOS: comentarios || '', ESTADO: 'Respondida' });
    String(p.ID_SOLICITUDES).split(',').forEach(function (id) {
      id = id.trim(); if (!id) return;
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (s) ventasLog_(id, 'Encuesta de satisfacción respondida', s.ESTADO, s.ESTADO, 'Calificación ' + cal + '/5. ' + (comentarios || ''));
    });
    if (cal <= 2) ventasNotificarRol_(['CALIDAD', 'GERENCIA'], '⚠️ Encuesta con calificación baja (' + cal + '/5) del cliente ' + p.CLIENTE + '. Evaluar apertura de PQRSF.');
    return true;
  });
}

/** Vincula un PQRSF (gestor de no conformidades) a una encuesta o cliente. */
function ventasVincularPQRSF(idPost, num, tipo, estado, enlace) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var p = ventasBuscar_('POSTVENTA', 'ID_POST', idPost);
    if (!p) throw new Error('Registro de postventa no encontrado.');
    if (!num) throw new Error('Indique el número de PQRSF.');
    ventasActualizarFila_('POSTVENTA', p._fila, {
      PQRSF_NUM: num, PQRSF_TIPO: tipo || '', PQRSF_ESTADO: estado || 'Abierta',
      PQRSF_ENLACE: enlace || ventasProp_('VENTAS_URL_PQRSF')
    });
    return true;
  });
}

/** Crea manualmente un registro de postventa para un servicio entregado. */
function ventasCrearPostventa(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var p = {
      ID_POST: ventasNuevoIdSimple_('POSTVENTA', 'ID_POST', 'PV-'), PERIODO: ventasPeriodo_(new Date()),
      CLIENTE_NIT: s.CLIENTE_NIT, CLIENTE: s.CLIENTE, ID_SOLICITUDES: id, F_ENVIO: '', ESTADO: 'Pendiente envío'
    };
    ventasInsertar_('POSTVENTA', p);
    return p;
  });
}

function ventasPeriodo_(d) {
  return d.getFullYear() + '-S' + (d.getMonth() < 6 ? '1' : '2');
}

/**
 * Encuesta semestral (disparador mensual). En enero y julio genera la encuesta para los clientes
 * con servicios entregados/facturados en el semestre anterior y envía el recordatorio.
 * También reenvía recordatorio a encuestas sin respuesta con más de 30 días.
 */
function ventasEncuestaSemestral(forzar) { seguridadRPC_();
  var hoy = new Date();
  var mes = hoy.getMonth();
  var generar = forzar === true || mes === 0 || mes === 6;
  var creadas = 0;
  if (generar) {
    var ini, fin;
    if (mes < 6) { ini = new Date(hoy.getFullYear() - 1, 6, 1); fin = new Date(hoy.getFullYear() - 1, 11, 31, 23, 59, 59); }
    else { ini = new Date(hoy.getFullYear(), 0, 1); fin = new Date(hoy.getFullYear(), 5, 30, 23, 59, 59); }
    var periodo = ventasPeriodo_(ini);
    var existentes = {};
    ventasLeer_('POSTVENTA').forEach(function (p) { if (p.PERIODO === periodo) existentes[p.CLIENTE_NIT] = true; });
    var porCliente = {};
    ventasLeer_('SOLICITUDES').forEach(function (s) {
      var f = ventasFecha_(s.F_ENTREGADA);
      if (!f || f < ini || f > fin) return;
      (porCliente[s.CLIENTE_NIT] = porCliente[s.CLIENTE_NIT] || { cliente: s.CLIENTE, ids: [], s: s }).ids.push(s.ID);
    });
    Object.keys(porCliente).forEach(function (nit) {
      if (existentes[nit]) return;
      var g = porCliente[nit];
      ventasInsertar_('POSTVENTA', {
        ID_POST: ventasNuevoIdSimple_('POSTVENTA', 'ID_POST', 'PV-'), PERIODO: periodo, CLIENTE_NIT: nit,
        CLIENTE: g.cliente, ID_SOLICITUDES: g.ids.join(', '), F_ENVIO: ventasAhora_(), ESTADO: 'Enviada'
      });
      ventasEnviarEncuesta_(nit, g.cliente);
      g.ids.forEach(function (id) {
        var s = ventasBuscar_('SOLICITUDES', 'ID', id);
        if (s && s.ESTADO === 'Facturada') {
          ventasActualizarFila_('SOLICITUDES', s._fila, { ESTADO: 'Postventa', F_ACTUALIZACION: ventasAhora_() });
          ventasLog_(id, 'Encuesta semestral enviada (5.10)', 'Facturada', 'Postventa', 'Periodo ' + periodo);
        }
      });
      creadas++;
    });
  }
  // recordatorio a encuestas sin respuesta
  ventasLeer_('POSTVENTA').forEach(function (p) {
    if (p.ESTADO !== 'Enviada' || !p.F_ENVIO) return;
    if (ventasHabilesEntre_(p.F_ENVIO, hoy) >= 20) {
      ventasEnviarEncuesta_(p.CLIENTE_NIT, p.CLIENTE, true);
      ventasActualizarFila_('POSTVENTA', p._fila, { ESTADO: 'Enviada (recordatorio)' });
    }
  });
  return 'Encuestas creadas: ' + creadas;
}

function ventasEnviarEncuesta_(nit, nombre, recordatorio) {
  var c = ventasBuscar_('CLIENTES', 'NIT', nit);
  var url = ventasProp_('VENTAS_URL_ENCUESTA');
  var msg = (recordatorio ? 'Recordatorio: ' : '') + 'Estimado cliente ' + nombre + ', en ' + VENTAS_CFG.EMPRESA +
    ' valoramos su opinión. Por favor califique nuestros servicios de calibración del último semestre' + (url ? ': ' + url : '.') + ' ¡Gracias!';
  if (c && c.TELEFONO) ventasWhatsApp_(c.TELEFONO, msg);
  if (c && c.CORREO) {
    try { MailApp.sendEmail(String(c.CORREO), 'Encuesta de satisfacción - ' + VENTAS_CFG.EMPRESA, msg); } catch (e) { console.warn(e); }
  }
}

/* ===================================== ALERTAS ====================================== */

/**
 * Disparador diario:
 *  - Cotización sin seguimiento después de X días.
 *  - Fecha de entrega próxima a vencer / vencida.
 *  - Equipo tercerizado sin retorno.
 *  - Oferta próxima a perder vigencia.
 */
function ventasRevisarAlertas() { seguridadRPC_();
  var hoy = new Date();
  if (!ventasEsHabil_(hoy)) return 'Día no hábil: sin alertas.';
  var enviados = 0;
  var sols = ventasLeer_('SOLICITUDES');
  sols.forEach(function (s) {
    if (s.ESTADO === 'Cotizada' || s.ESTADO === 'En seguimiento') {
      var dias = ventasHabilesEntre_(s.F_ULTIMO_SEGUIMIENTO || s.F_COTIZADA, hoy);
      if (dias >= VENTAS_CFG.DIAS_SEGUIMIENTO) {
        ventasNotificarComercial_(s, '🔔 Cotización ' + s.ID + ' (' + s.CLIENTE + ') lleva ' + dias + ' días hábiles sin seguimiento.'); enviados++;
      }
      var vig = ventasHabilesEntre_(hoy, ventasSumarHabiles_(s.F_COTIZADA, VENTAS_CFG.DIAS_VALIDEZ_OFERTA));
      if (vig === 2) { ventasNotificarComercial_(s, '⏳ La oferta ' + s.ID + ' (' + s.CLIENTE + ') pierde vigencia en 2 días hábiles.'); enviados++; }
    }
    if (s.F_COMPROMISO && ['Solicitud de calibración recibida', 'Programada', 'En ejecución', 'En servicio tercerizado', 'Resultados emitidos'].indexOf(s.ESTADO) > -1) {
      var rest = ventasHabilesEntre_(hoy, s.F_COMPROMISO);
      if (rest <= VENTAS_CFG.DIAS_ALERTA_ENTREGA) {
        var txt = rest < 0 ? '🔴 VENCIDA hace ' + Math.abs(rest) + ' día(s) hábil(es)' : (rest === 0 ? '🟠 vence HOY' : '🟡 vence en ' + rest + ' día(s) hábil(es)');
        var m = 'Entrega ' + s.ID + ' (' + s.CLIENTE + ', OT ' + (s.NUM_OT || '-') + '): ' + txt + ' - compromiso ' + ventasFmt_(s.F_COMPROMISO, 'dd/MM/yyyy') + '.';
        ventasNotificarRol_(['LABORATORIO', 'DIRECTOR_TECNICO'], m);
        ventasNotificarComercial_(s, m); enviados++;
      }
    }
    if (s.ESTADO === 'Recibida' || s.ESTADO === 'En revisión de requisitos') {
      var d2 = ventasHabilesEntre_(s.FECHA_RECEPCION, hoy);
      if (d2 > VENTAS_CFG.DIAS_RESPUESTA_COTIZACION) { ventasNotificarComercial_(s, '📝 Solicitud ' + s.ID + ' (' + s.CLIENTE + ') lleva ' + d2 + ' días hábiles sin cotizar.'); enviados++; }
    }
  });
  ventasLeer_('TERCERIZADOS').forEach(function (t) {
    if (t.F_SALIDA && !t.F_ENTRADA) {
      var d = ventasHabilesEntre_(t.F_SALIDA, hoy);
      if (d >= VENTAS_CFG.DIAS_ALERTA_TERCERIZADO) {
        ventasNotificarRol_(['LABORATORIO', 'DIRECTOR_TECNICO', 'COMERCIAL'], '📦 Equipo tercerizado sin retorno: ' + t.EQUIPO + ' en ' + t.PROVEEDOR +
          ' (GCO-FO-006 N° ' + t.NUM_GCO_FO_006 + ', solicitud ' + t.ID_SOLICITUD + ') hace ' + d + ' días hábiles.'); enviados++;
      }
    }
  });
  return 'Alertas enviadas: ' + enviados;
}

/* ===================================== WHATSAPP ===================================== */

function ventasNotificarCambio_(s, nuevo, c) {
  var base = s.ID + ' - ' + s.CLIENTE;
  switch (nuevo) {
    case 'Cerrada por venta':
      ventasNotificarRol_(['LABORATORIO', 'DIRECTOR_TECNICO', 'GERENCIA'], '✅ Venta cerrada: ' + base + (c.NUM_CONTRATO ? ' (' + (c.TIPO_ACEPTACION || s.TIPO_ACEPTACION || 'Contrato / orden de servicio') + ' ' + c.NUM_CONTRATO + ')' : '') + '. Valor: $' + ventasNum_(s.VALOR_TOTAL).toLocaleString('es-CO'));
      break;
    case 'Solicitud de calibración recibida':
      ventasNotificarRol_(['LABORATORIO', 'DIRECTOR_TECNICO'], '🧪 Nueva solicitud asignada al laboratorio: ' + base + ' (GCV-FO-004 ' + c.CONSECUTIVO_FO004 + '). Por favor programar.');
      break;
    case 'Programada':
      ventasNotificarRol_(['LABORATORIO'], '📅 Servicio programado ' + base + ' - OT ' + (c.NUM_OT || s.NUM_OT) + ' para ' + ventasFmt_(c.F_PROGRAMADA, 'dd/MM/yyyy') + '.');
      break;
    case 'Resultados emitidos':
      ventasNotificarComercial_(s, '📄 Resultados emitidos para ' + base + '. Coordinar entrega al cliente.');
      break;
    case 'Entregada':
      ventasNotificarRol_(['FACTURACION', 'GERENCIA'], '🧾 Servicio entregado ' + base + '. Pendiente facturación.');
      break;
  }
}

function ventasNotificarComercial_(s, msg) {
  var u = ventasLeer_('USUARIOS').filter(function (x) { return x.NOMBRE === s.COMERCIAL && String(x.ACTIVO).toUpperCase() !== 'NO'; })[0];
  if (u && u.TELEFONO) ventasWhatsApp_(u.TELEFONO, msg, u.APIKEY_WHATSAPP);
}

/** Notifica a todos los usuarios activos de los roles indicados (o solo al nombre indicado). */
function ventasNotificarRol_(roles, msg, soloNombre) {
  ventasLeer_('USUARIOS').forEach(function (u) {
    if (String(u.ACTIVO).toUpperCase() === 'NO' || !u.TELEFONO) return;
    if (soloNombre) { if (u.NOMBRE === soloNombre) ventasWhatsApp_(u.TELEFONO, msg, u.APIKEY_WHATSAPP); return; }
    if (roles.indexOf(String(u.ROL).toUpperCase()) > -1) ventasWhatsApp_(u.TELEFONO, msg, u.APIKEY_WHATSAPP);
  });
}

/**
 * Envía WhatsApp. Si el proyecto ya tiene una función global enviarWhatsApp(telefono, mensaje)
 * (p. ej. la del portal de documentos), la reutiliza. Si no, usa el proveedor configurado.
 */
function ventasWhatsApp_(telefono, mensaje, apikey) {
  try {
    var tel = String(telefono).replace(/\D/g, '');
    if (!tel) return false;
    if (tel.length === 10) tel = VENTAS_CFG.PREFIJO_WA_PAIS + tel;
    mensaje = '*' + VENTAS_CFG.EMPRESA + ' - Ventas*\n' + mensaje;
    if (typeof enviarWhatsApp === 'function') return enviarWhatsApp(tel, mensaje);
    var token = ventasProp_('VENTAS_WA_TOKEN');
    var prov = ventasProp_('VENTAS_WA_PROVEEDOR', apikey ? 'CALLMEBOT' : 'NINGUNO').toUpperCase();
    if (prov === 'CALLMEBOT') {
      var clave = String(apikey || token || '').trim();
      if (!clave) { console.log('[WhatsApp sin API key] ' + tel + ': ' + mensaje); return false; }
      var url = 'https://api.callmebot.com/whatsapp.php?phone=' + tel + '&text=' + encodeURIComponent(mensaje) + '&apikey=' + encodeURIComponent(clave);
      UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      return true;
    }
    if (prov === 'META') {
      var phoneId = ventasProp_('VENTAS_WA_PHONE_ID');
      UrlFetchApp.fetch('https://graph.facebook.com/v19.0/' + phoneId + '/messages', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: mensaje } })
      });
      return true;
    }
    console.log('[WhatsApp no configurado] ' + tel + ': ' + mensaje);
    return false;
  } catch (e) {
    console.warn('Error enviando WhatsApp: ' + e);
    return false;
  }
}

/** Prueba de envío desde el editor. */
function ventasProbarWhatsApp() { seguridadRPC_();
  var u = ventasLeer_('USUARIOS').filter(function (x) { return x.TELEFONO; })[0];
  if (!u) return 'No hay usuarios con teléfono en VENTAS_USUARIOS.';
  return ventasWhatsApp_(u.TELEFONO, 'Mensaje de prueba del módulo de Ventas.', u.APIKEY_WHATSAPP) ? 'Enviado a ' + u.NOMBRE : 'No enviado (revise configuración).';
}

/* ===================================== DOCUMENTOS =================================== */

function ventasCarpeta_() {
  var id = ventasProp_('VENTAS_CARPETA_ID');
  if (id) return DriveApp.getFolderById(id);
  // Sin propiedad: subcarpeta "IMCOLMETRIC - Ventas (Documentos)" dentro de la carpeta raíz del portal
  var raiz;
  if (typeof carpetaRaizSGC === 'function') raiz = carpetaRaizSGC();
  else { var p = DriveApp.getFileById(ventasSS_().getId()).getParents(); raiz = p.hasNext() ? p.next() : DriveApp.getRootFolder(); }
  var it = raiz.getFoldersByName('IMCOLMETRIC - Ventas (Documentos)');
  return it.hasNext() ? it.next() : raiz.createFolder('IMCOLMETRIC - Ventas (Documentos)');
}

function ventasCopiarPlantilla_(prop, nombre) {
  var idPl = ventasProp_(prop);
  if (!idPl) throw new Error('Configure la propiedad del script ' + prop + ' con el ID de la plantilla.');
  return DriveApp.getFileById(idPl).makeCopy(nombre, ventasCarpeta_());
}

/** Genera GCV-FO-003 (Cotización) con los datos cargados. */
function ventasGenerarFO003(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var c = ventasBuscar_('CLIENTES', 'NIT', s.CLIENTE_NIT) || {};
    var eqs = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).sort(function (a, b) { return a.ITEM - b.ITEM; });
    if (!eqs.length) throw new Error('La cotización no tiene ítems.');
    var archivo = ventasCopiarPlantilla_('VENTAS_PLANTILLA_FO003', 'GCV-FO-003 Cotización ' + id + ' V' + s.VERSION + ' - ' + s.CLIENTE);
    var ss = SpreadsheetApp.openById(archivo.getId());
    var sh = ss.getSheetByName('Cotización') || ss.getSheets()[0];
    var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var hoy = new Date();
    sh.getRange('B5').setValue(hoy.getDate() + ' de ' + meses[hoy.getMonth()] + ' de ' + hoy.getFullYear());
    sh.getRange('B8').setValue(s.CLIENTE);
    sh.getRange('B10').setValue('Nit: ' + s.CLIENTE_NIT);
    sh.getRange('B12').setValue('Dirección: ' + (c.DIRECCION || ''));
    sh.getRange('B14').setValue('Ciudad: ' + (c.CIUDAD || ''));
    sh.getRange('B16').setValue('Ref.     ' + (s.REFERENCIA || 'Servicio de calibración de equipos') + (s.CONTACTO ? ' - Atn. ' + s.CONTACTO : ''));
    sh.getRange('H20').setValue('Cotización No. ' + id + (Number(s.VERSION) > 1 ? ' V' + s.VERSION : ''));
    // filas de ítems: plantilla trae 1 fila (23) y totales en fila 24
    var FILA_INI = 23;
    if (eqs.length > 1) sh.insertRowsAfter(FILA_INI, eqs.length - 1);
    var filas = eqs.map(function (e, i) {
      var r = FILA_INI + i;
      var desc = 'Calibración ' + (e.EQUIPO || '') + (e.MAGNITUD ? ' (' + e.MAGNITUD + ')' : '') +
        (e.RANGO ? '. Rango: ' + e.RANGO : '') + (e.PUNTOS_CALIBRACION ? '. Puntos: ' + e.PUNTOS_CALIBRACION : '') +
        (e.TIPO_SERVICIO === 'Tercerizado' ? '. Servicio tercerizado' : '');
      return [desc, e.MARCA, e.MODELO, ventasNum_(e.CANTIDAD) || 1, ventasNum_(e.VALOR_UNITARIO),
        '=E' + r + '*F' + r, '=G' + r + '*' + (ventasNum_(e.IVA_PCT) / 100), '=G' + r + '+H' + r];
    });
    sh.getRange(FILA_INI, 2, filas.length, 8).setValues(filas);
    var fT = FILA_INI + eqs.length;
    var fUlt = fT - 1;
    sh.getRange(fT, 7, 1, 3).setFormulas([['=SUM(G' + FILA_INI + ':G' + fUlt + ')', '=SUM(H' + FILA_INI + ':H' + fUlt + ')', '=SUM(I' + FILA_INI + ':I' + fUlt + ')']]);
    sh.getRange(FILA_INI, 6, filas.length, 4).setNumberFormat('$ #,##0');
    sh.getRange(fT, 7, 1, 3).setNumberFormat('$ #,##0');
    // Observaciones: conformidad y plazos
    var conf = ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', id);
    var obs = [];
    if (conf && conf.SOLICITA_DECLARACION === 'SÍ') obs.push('Declaración de conformidad según ' + conf.NORMA_ESPECIFICACION + ', regla de decisión: ' + conf.REGLA_DECISION + '.');
    var terc = eqs.filter(function (e) { return e.TIPO_SERVICIO === 'Tercerizado'; }).length;
    if (terc) obs.push(terc + ' ítem(s) corresponden a servicio tercerizado (' + VENTAS_CFG.PLAZO_TERCERIZADO + ' días hábiles).');
    if (s.OBSERVACIONES) obs.push(s.OBSERVACIONES);
    var celdaObs = ventasBuscarTexto_(sh, 'OBSERVACIONES:');
    if (celdaObs && obs.length) sh.getRange(celdaObs.getRow() + 1, 2).setValue(obs.join(' '));
    SpreadsheetApp.flush();
    var url = ss.getUrl();
    ventasActualizarFila_('SOLICITUDES', s._fila, { URL_FO003: url, ACT_FO003: s.ACT_FO003 ? 'ACTUALIZADO V' + s.VERSION : '' });
    ventasLog_(id, 'Documento generado GCV-FO-003 V' + s.VERSION, s.ESTADO, s.ESTADO, url);
    return { url: url };
  });
}

/** Genera GCV-FO-004 (Solicitud de calibración de equipos). */
function ventasGenerarFO004(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var c = ventasBuscar_('CLIENTES', 'NIT', s.CLIENTE_NIT) || {};
    var eqs = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).sort(function (a, b) { return a.ITEM - b.ITEM; });
    var consec = s.CONSECUTIVO_FO004 || ventasNuevoConsecutivoFO004_();
    var archivo = ventasCopiarPlantilla_('VENTAS_PLANTILLA_FO004', 'GCV-FO-004 ' + consec + ' - ' + s.CLIENTE);
    var ss = SpreadsheetApp.openById(archivo.getId());
    var sh = ss.getSheetByName('Formato') || ss.getSheets()[0];
    var conf = ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', id);
    var set = function (a1, v) { sh.getRange(a1).setValue(v); };
    set('B6', consec);
    set('B8', s.NUM_CONTRATO ? s.ID + ' / Contrato ' + s.NUM_CONTRATO : s.ID);
    set('B10', s.CLIENTE); set('B11', c.DIRECCION || ''); set('B12', c.CIUDAD || '');
    set('B13', s.CONTACTO || c.CONTACTO || ''); set('B14', [s.TELEFONO_CONTACTO, s.CORREO_CONTACTO].filter(String).join(' / '));
    set('B15', conf && conf.SOLICITA_DECLARACION === 'SÍ' ? 'SI' : 'NO');
    if (conf && conf.SOLICITA_DECLARACION === 'SÍ') { set('F15', conf.NORMA_ESPECIFICACION); set('I15', conf.REGLA_DECISION); }
    set('B37', eqs.some(function (e) { return e.TIPO_SERVICIO === 'Tercerizado'; }) ? 'SI' : 'NO');
    var FILA_INI = 40, MAX = 10;
    var filas = eqs.slice(0, MAX).map(function (e) {
      return [e.EQUIPO, e.MARCA, e.MODELO, e.SERIE, e.CODIGO_INVENTARIO, e.UBICACION, e.PUNTOS_CALIBRACION || 'Asignados por el laboratorio'];
    });
    if (filas.length) sh.getRange(FILA_INI, 2, filas.length, 7).setValues(filas);
    if (eqs.length > MAX) {
      var anexo = ss.insertSheet('Anexo equipos');
      anexo.appendRow(['Item', 'Equipo', 'Marca', 'Modelo', 'Serie', 'Código inventario', 'Ubicación', 'Puntos a calibrar', 'Magnitud']);
      eqs.forEach(function (e) { anexo.appendRow([e.ITEM, e.EQUIPO, e.MARCA, e.MODELO, e.SERIE, e.CODIGO_INVENTARIO, e.UBICACION, e.PUNTOS_CALIBRACION, e.MAGNITUD]); });
    }
    SpreadsheetApp.flush();
    var url = ss.getUrl();
    ventasActualizarFila_('SOLICITUDES', s._fila, { URL_FO004: url, CONSECUTIVO_FO004: consec, ACT_FO004: s.ACT_FO004 ? 'ACTUALIZADO V' + s.VERSION : '' });
    ventasLog_(id, 'Documento generado GCV-FO-004 ' + consec, s.ESTADO, s.ESTADO, url);
    return { url: url, consecutivo: consec };
  });
}

/**
 * GCV-FO-002 (Orden de trabajo interna): agrega una fila al registro de OT.
 * Regla 5.7: si existe número de contrato (público o privado) reemplaza al número de cotización.
 */
function ventasGenerarFO002(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id);
      if (s.TIPO_CIERRE !== 'Venta') throw new Error('La orden de trabajo se genera para ventas cerradas.');
      var regId = ventasProp_('VENTAS_REGISTRO_FO002');
      if (!regId) throw new Error('Configure la propiedad VENTAS_REGISTRO_FO002 con el ID del registro de órdenes de trabajo.');
      var ot = s.NUM_OT || ventasNuevoNumeroOT_();
      var ss = SpreadsheetApp.openById(regId);
      var sh = ss.getSheetByName('FORMATO') || ss.getSheets()[0];
      var eqs = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id);
      var magn = eqs.map(function (e) { return e.MAGNITUD; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      var numRef = s.NUM_CONTRATO ? s.NUM_CONTRATO : s.ID;   // 5.7
      var tipo = 'Calibración' + (magn.length ? ' - ' + magn.join(', ') : '') + (eqs.some(function (e) { return e.TIPO_SERVICIO === 'Tercerizado'; }) ? ' (incluye tercerizado)' : '');
      var fila = [ventasAhora_(), s.CLIENTE, s.CLIENTE_NIT, numRef, tipo, s.CONSECUTIVO_FO004 || 'N/A', s.LUGAR_SERVICIO, ot];
      // busca si la OT ya está registrada para actualizarla
      var datos = sh.getLastRow() >= 5 ? sh.getRange(5, 1, sh.getLastRow() - 4, 8).getValues() : [];
      var filaDestino = -1, primeraVacia = -1;
      for (var i = 0; i < datos.length; i++) {
        if (String(datos[i][7]) === ot) { filaDestino = i + 5; break; }
        if (primeraVacia === -1 && datos[i].join('') === '') primeraVacia = i + 5;
      }
      if (filaDestino === -1) filaDestino = primeraVacia > -1 ? primeraVacia : Math.max(sh.getLastRow() + 1, 5);
      sh.getRange(filaDestino, 1, 1, 8).setValues([fila]);
      sh.getRange(filaDestino, 1).setNumberFormat('dd/MM/yyyy');
      var url = ss.getUrl() + '#gid=' + sh.getSheetId() + '&range=A' + filaDestino;
      ventasActualizarFila_('SOLICITUDES', s._fila, { NUM_OT: ot, URL_FO002: url });
      ventasLog_(id, 'GCV-FO-002 Orden de trabajo ' + ot, s.ESTADO, s.ESTADO, 'Referencia: ' + (s.NUM_CONTRATO ? 'Contrato ' : 'Cotización ') + numRef);
      return { url: url, ot: ot };
    });
  });
}

/** GCV-FO-001 Contrato: plantilla Google Docs con marcadores {{CAMPO}}. */
function ventasGenerarFO001(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var s = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!s) throw new Error('No existe la solicitud ' + id);
    var c = ventasBuscar_('CLIENTES', 'NIT', s.CLIENTE_NIT) || {};
    var archivo = ventasCopiarPlantilla_('VENTAS_PLANTILLA_FO001', 'GCV-FO-001 Contrato ' + (s.NUM_CONTRATO || s.ID) + ' - ' + s.CLIENTE);
    var doc = DocumentApp.openById(archivo.getId());
    var eqs = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id);
    var mapa = {
      NUM_CONTRATO: s.NUM_CONTRATO || s.ID, ANIO: String(new Date().getFullYear()), CLIENTE: s.CLIENTE, NIT: s.CLIENTE_NIT,
      DIRECCION: c.DIRECCION || '', CIUDAD: c.CIUDAD || '', CONTACTO: s.CONTACTO || '', COTIZACION: s.ID,
      FECHA_COTIZACION: ventasFmt_(s.F_COTIZADA, 'dd/MM/yyyy'), OBJETO: s.REFERENCIA || 'Prestación de servicios de calibración',
      VALOR: '$ ' + ventasNum_(s.VALOR_TOTAL).toLocaleString('es-CO'), FECHA: ventasFmt_(new Date(), 'dd/MM/yyyy'),
      LUGAR_ENTREGA: s.LUGAR_SERVICIO, FECHA_ENTREGA: ventasFmt_(s.F_COMPROMISO, 'dd/MM/yyyy'),
      ALCANCE: eqs.map(function (e) { return '• ' + e.EQUIPO + ' ' + e.MARCA + ' ' + e.MODELO + ' (' + e.MAGNITUD + ') x' + e.CANTIDAD; }).join('\n')
    };
    var body = doc.getBody();
    Object.keys(mapa).forEach(function (k) { body.replaceText('\\{\\{' + k + '\\}\\}', String(mapa[k])); });
    doc.saveAndClose();
    var url = doc.getUrl();
    ventasActualizarFila_('SOLICITUDES', s._fila, { URL_FO001: url });
    ventasLog_(id, 'Documento generado GCV-FO-001', s.ESTADO, s.ESTADO, url);
    return { url: url };
  });
}

function ventasBuscarTexto_(sh, texto) {
  var r = sh.createTextFinder(texto).matchCase(false).findNext();
  return r || null;
}

/* ============================ IMPORTAR OT EXISTENTES =============================== */
// Carga en Ventas las órdenes de trabajo que ya se llevaban antes del sistema (registro GCV-FO-002),
// sin tener que crearlas una por una. Cada OT queda como venta cerrada (sin cotización), con su número
// original, y la numeración automática continúa después de la última OT cargada.
//   filas:   [{ FECHA, CLIENTE, NIT, REFERENCIA, TIPO_SERVICIO, SOLICITUD_CAL, LUGAR, OT, ESTADO }]
//   equipos: [{ OT, MAGNITUD, EQUIPO, MARCA, MODELO, SERIE, CODIGO_INVENTARIO, CANTIDAD }]   (opcional)
//   op:      { estado, comercial, soloRevisar }
var VENTAS_ESTADOS_IMPORTABLES = ['Solicitud de calibración recibida', 'Programada', 'En ejecución', 'Resultados emitidos', 'Entregada', 'Facturada'];

function ventasClaveOT_(ot) { return String(ot || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

// ---------- OT ↔ solicitud del cliente (CS) ----------
// Orden de carga: primero las solicitudes de los clientes (CS) y después las OT. El número de la CS no sigue al de la OT
// (la CS 001 puede ser de Discolmets y la OT 001 de otra empresa): al importar cada OT el usuario elige a qué CS se asocia
// (o «Sin CS») y el servidor valida que la CS sea del mismo cliente. El sistema solo sugiere.
function ventasInfoCS_(x, cli) {
  return { ID: x.ID, CLIENTE: x.CLIENTE, NIT: String(x.CLIENTE_NIT || ''), FECHA: ventasFmt_(ventasFecha_(x.FECHA_RECEPCION)), SC: x.CONSECUTIVO_FO004 || '',
    REFERENCIA: x.REFERENCIA || '', EQUIPOS: ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', x.ID).length, MISMO: ventasClienteCoincide_(cli.NIT, cli.NOMBRE, x) };
}
function ventasSugerirCS_(cli, f, disp) {
  var del = disp.filter(function (x) { return ventasClienteCoincide_(cli.NIT, cli.NOMBRE, x); }), x;
  var scFila = String(f.SOLICITUD_CAL || '').trim();
  if (scFila) {
    var ks = ventasClaveOT_(scFila);
    x = del.filter(function (s) { return s.CONSECUTIVO_FO004 && ventasClaveOT_(s.CONSECUTIVO_FO004) === ks; })[0];
    if (x) return { cs: x, por: 'N° de solicitud ' + x.CONSECUTIVO_FO004 + ' escrito en la OT' };
  }
  var ref = String(f.REFERENCIA || ''), m = ref.match(/(\d{4})\s*-\s*(\d{3,5})/);
  if (m) {
    var id = m[1] + '-' + ('0000' + Number(m[2])).slice(-4), kr = ventasClaveContrato_(ref);
    x = del.filter(function (s) { return String(s.ID) === id || (s.NUM_COTIZACION_DOC && ventasClaveContrato_(s.NUM_COTIZACION_DOC) === kr); })[0];
    if (x) return { cs: x, por: 'cotización ' + (x.NUM_COTIZACION_DOC || x.ID) };
  }
  if (del.length === 1) return { cs: del[0], por: 'única CS pendiente del cliente' };
  return {};
}
// Une la OT importada a su CS: la CS queda como la venta de esa OT (no se crea otra solicitud)
function ventasUnirOTaCS_(cs, f, ot, eqs, o) {
  var sc = cs.CONSECUTIVO_FO004 || String(f.SOLICITUD_CAL || '').trim();
  var cambios = {
    NUM_OT: ot, ESTADO: o.estado, TIPO_CIERRE: 'Venta', F_ACEPTADA: cs.F_ACEPTADA || o.fecha, F_CIERRE: cs.F_CIERRE || o.fecha,
    F_SOLICITUD_CAL: cs.F_SOLICITUD_CAL || o.fecha, CONSECUTIVO_FO004: sc,
    TIPO_ACEPTACION: cs.TIPO_ACEPTACION || (o.esContrato ? 'Contrato privado' : 'Orden de servicio'),
    NUM_CONTRATO: cs.NUM_CONTRATO || (o.esContrato ? o.ref : ''),
    LUGAR_SERVICIO: f.LUGAR ? o.lugar : (cs.LUGAR_SERVICIO || o.lugar),
    REFERENCIA: cs.REFERENCIA || ((f.TIPO_SERVICIO ? f.TIPO_SERVICIO + ' · ' : '') + (o.ref ? (o.esContrato ? 'Contrato ' : 'Cotización ') + o.ref : 'OT ' + ot)),
    OBSERVACIONES: ((cs.OBSERVACIONES ? cs.OBSERVACIONES + ' ' : '') + 'OT ' + ot + ' cargada desde el registro GCV-FO-002 y unida a esta solicitud del cliente.').trim(),
    F_ACTUALIZACION: ventasAhora_()
  };
  if (!cs.ACT_FO003) cambios.ACT_FO003 = 'NO APLICA (OT importada)';
  ventasActualizarFila_('SOLICITUDES', cs._fila, cambios);
  var propios = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', cs.ID), n = propios.length;
  if (!n && eqs.length) { ventasGuardarEquipos_(cs.ID, eqs); ventasRecalcularTotales_(cs.ID); n = eqs.length; }
  ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', cs.ID).forEach(function (e) { ventasActualizarFila_('EQUIPOS', e._fila, { ESTADO_EQUIPO: o.estado }); });
  ventasLog_(cs.ID, 'OT importada y unida a la solicitud del cliente (' + ot + ')', cs.ESTADO, o.estado,
    'Asociada por ' + o.por + (sc ? ' · solicitud ' + sc : '') + (propios.length ? ' · se conservan los ' + propios.length + ' equipo(s) de la solicitud' : n ? ' · ' + n + ' equipo(s) de la OT' : ''));
  return { equipos: n };
}

function ventasMagnitudImportada_(m) {
  var t = ventasNorm_(m), keys = Object.keys(VENTAS_CFG.MAGNITUDES);
  var exacta = keys.filter(function (k) { return ventasNorm_(k) === t; })[0];
  if (exacta) return exacta;
  if (/humedad|higrom|higrog|termohigr|datalog|condiciones ambientales/.test(t)) return 'Temperatura y humedad relativa';
  if (/temperatura|termometr|termocupla|pt100|rtd|contacto|punzon|infrarroj/.test(t)) return 'Temperatura de contacto';
  if (/presion|manometr|vacuometr|manovacuometr|esfigmo|tensiometr/.test(t)) return 'Presión relativa';
  if (/masa|pesaje|balanza|bascula|pesa\b|ipfna/.test(t)) return 'Instrumentos de pesaje de funcionamiento no automático';
  if (t) return 'Equipos biomédicos';
  return '';
}

function ventasImportarOT(filas, equipos, op) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      op = op || {};
      var estadoDef = VENTAS_ESTADOS_IMPORTABLES.indexOf(op.estado) !== -1 ? op.estado : VENTAS_ESTADOS_IMPORTABLES[0];
      var comercial = String(op.comercial || (VENTAS_SESION && VENTAS_SESION.nombre) || '').trim();
      var existentes = {};
      ventasLeer_('SOLICITUDES').forEach(function (x) { if (x.NUM_OT) existentes[ventasClaveOT_(x.NUM_OT)] = x.ID; });
      var vistos = {}, res = { creadas: [], omitidas: [], equipos: 0 };
      var ctx = { lista: ventasLeer_('CLIENTES'), decisiones: op.decisiones || {}, pendientes: {}, alias: {}, simular: !!op.soloRevisar };
      // Solicitudes de los clientes (CS) ya cargadas que esperan su OT: cada OT se une a la de su cliente
      var libres = ventasLeer_('SOLICITUDES').filter(function (x) { return !x.NUM_OT && x.ESTADO !== 'Cerrada por desistimiento'; }), usadas = {};
      (filas || []).forEach(function (f, i) {
        var n = 'Fila ' + (i + 1) + ': ';
        var ot = String(f.OT || '').trim().toUpperCase(), clave = ventasClaveOT_(ot);
        if (!ot) { res.omitidas.push(n + 'sin número de OT'); return; }
        if (!/^OT/.test(clave)) { res.omitidas.push(n + ot + ' no parece un número de OT'); return; }
        if (existentes[clave]) { res.omitidas.push(n + ot + ' ya existe en Ventas (' + existentes[clave] + ')'); return; }
        if (vistos[clave]) { res.omitidas.push(n + ot + ' está repetida en los datos pegados'); return; }
        if (!String(f.CLIENTE || '').trim()) { res.omitidas.push(n + ot + ' sin cliente'); return; }
        if (!String(f.NIT || '').trim()) { res.omitidas.push(n + ot + ' sin NIT del cliente'); return; }
        var cli = ventasResolverCliente_({ NIT: String(f.NIT).trim(), NOMBRE: String(f.CLIENTE).trim() }, ctx, ot);
        if (!cli) { res.omitidas.push(n + ot + ' pendiente: confirme si "' + f.CLIENTE + '" es un cliente ya registrado'); return; }
        // Asociación OT ↔ CS: la elige el usuario (op.asociar[clave OT] = ID de la CS o 'NINGUNA') y debe ser del mismo cliente
        var disp = libres.filter(function (x) { return !usadas[x.ID]; });
        var dec = (op.asociar || {})[clave], cs = {};
        if (!dec) {
          var sug = ventasSugerirCS_(cli, f, disp);
          var cands = disp.map(function (x) { return ventasInfoCS_(x, cli); }).sort(function (a, b) { return (b.MISMO - a.MISMO) || String(a.ID).localeCompare(String(b.ID)); });
          res.porAsociar = res.porAsociar || [];
          res.porAsociar.push({ OT: ot, CLAVE: clave, CLIENTE: cli.NOMBRE, NIT: cli.NIT, FECHA: ventasFmt_(ventasFecha_(f.FECHA)), SUGERIDA: sug.cs ? sug.cs.ID : '', POR: sug.por || '', candidatos: cands });
          if (sug.cs) usadas[sug.cs.ID] = true;   // para que la sugerencia no se repita en otra OT
          return;
        }
        if (dec !== 'NINGUNA') {
          var elegida = libres.filter(function (x) { return String(x.ID) === String(dec); })[0];
          if (!elegida) { res.omitidas.push(n + ot + ': la CS ' + dec + ' ya no está disponible (tiene OT o fue desistida)'); return; }
          if (usadas[elegida.ID]) { res.omitidas.push(n + ot + ': la CS ' + dec + ' ya se asoció a otra OT de esta carga'); return; }
          if (!ventasClienteCoincide_(cli.NIT, cli.NOMBRE, elegida)) {
            res.noCoinciden = res.noCoinciden || [];
            res.noCoinciden.push(ot + ' es de «' + cli.NOMBRE + '» (NIT ' + cli.NIT + '), pero la CS ' + elegida.ID + ' es de «' + elegida.CLIENTE + '» (NIT ' + elegida.CLIENTE_NIT + ')');
            res.omitidas.push(n + ot + ': CLIENTE_NO_COINCIDE con la CS ' + elegida.ID + ' (' + elegida.CLIENTE + '). No pertenecen al mismo cliente.');
            return;
          }
          cs = { cs: elegida, por: 'asociación del usuario (mismo cliente)' };
        }
        vistos[clave] = true;
        if (cs.cs) usadas[cs.cs.ID] = true;
        var eqs = (equipos || []).filter(function (e) { return ventasClaveOT_(e.OT) === clave; }).map(function (e) {
          return { MAGNITUD: ventasMagnitudImportada_(e.MAGNITUD), EQUIPO: e.EQUIPO || '', MARCA: e.MARCA || '', MODELO: e.MODELO || '',
            SERIE: e.SERIE || '', CODIGO_INVENTARIO: e.CODIGO_INVENTARIO || '', CANTIDAD: ventasNum_(e.CANTIDAD) || 1, TIPO_SERVICIO: 'Propio' };
        });
        if (op.soloRevisar) { res.creadas.push({ OT: ot, CLIENTE: cli.NOMBRE, EQUIPOS: eqs.length, CS: cs.cs ? cs.cs.ID : '', POR: cs.por || '' }); res.equipos += eqs.length; return; }
        var ref = String(f.REFERENCIA || '').trim();
        var esContrato = /^(CT|CONT)|CONTRATO/i.test(ref);
        var fecha = ventasFecha_(f.FECHA) || ventasAhora_();
        var lugar = /cliente|sitio/i.test(String(f.LUGAR || '')) ? 'En sitio' : VENTAS_CFG.LUGARES[0];
        var estado = VENTAS_ESTADOS_IMPORTABLES.indexOf(String(f.ESTADO || '').trim()) !== -1 ? String(f.ESTADO).trim() : estadoDef;
        if (cs.cs) {
          var u = ventasUnirOTaCS_(cs.cs, f, ot, eqs, { fecha: fecha, estado: estado, ref: ref, esContrato: esContrato, lugar: lugar, por: cs.por });
          existentes[clave] = cs.cs.ID;
          res.creadas.push({ ID: cs.cs.ID, OT: ot, CLIENTE: cli.NOMBRE, EQUIPOS: u.equipos, CS: cs.cs.ID, POR: cs.por });
          res.equipos += u.equipos;
          return;
        }
        var id = ventasNuevoConsecutivo_();
        ventasInsertar_('SOLICITUDES', {
          ID: id, VERSION: 1, FECHA_RECEPCION: fecha, CANAL: 'Otro', CLIENTE_NIT: cli.NIT, CLIENTE: cli.NOMBRE,
          TIPO_CLIENTE: 'Privado', COMERCIAL: comercial || 'Sin asignar', ESTADO: estado,
          REFERENCIA: (f.TIPO_SERVICIO ? f.TIPO_SERVICIO + ' · ' : '') + (ref ? (esContrato ? 'Contrato ' : 'Cotización ') + ref : 'OT importada'),
          LUGAR_SERVICIO: lugar, TIPO_CIERRE: 'Venta', F_ACEPTADA: fecha, F_CIERRE: fecha, F_SOLICITUD_CAL: fecha,
          TIPO_ACEPTACION: esContrato ? 'Contrato privado' : 'Orden de servicio', NUM_CONTRATO: esContrato ? ref : '',
          CONSECUTIVO_FO004: String(f.SOLICITUD_CAL || '').trim(), NUM_OT: ot, ACT_FO003: 'NO APLICA (OT importada)', ACT_FO004: '',
          REVISION_CONTRATO_REABIERTA: 'NO', OBSERVACIONES: 'OT cargada desde el registro GCV-FO-002 existente.',
          CREADO_POR: ventasUsuario_(), F_CREACION: ventasAhora_(), F_ACTUALIZACION: ventasAhora_()
        });
        if (eqs.length) { ventasGuardarEquipos_(id, eqs); ventasRecalcularTotales_(id); }
        ventasLog_(id, 'OT importada (' + ot + ')', '', estado, 'Carga inicial de órdenes de trabajo existentes' + (eqs.length ? ' · ' + eqs.length + ' equipo(s)' : ''));
        existentes[clave] = id;
        res.creadas.push({ ID: id, OT: ot, CLIENTE: cli.NOMBRE, EQUIPOS: eqs.length });
        res.equipos += eqs.length;
      });
      res.confirmar = ventasPendientesLista_(ctx);
      res.clientesNuevos = ctx.nuevos || 0;
      // La numeración automática sigue después de la mayor OT del año (ventasNuevoNumeroOT_ ya lee todas las OT)
      if (!op.soloRevisar) {
        var anio = new Date().getFullYear(), max = 0;
        Object.keys(existentes).forEach(function (k) { var p = ventasPartesOT_(k.replace(/^OT(\d+)(\d{2})$/, 'OT$1-$2')); if (p && p.anio === anio) max = Math.max(max, p.n); });
        try {
          var props = PropertiesService.getScriptProperties(), clave = 'VENTAS_ULTIMA_OT_' + anio;
          if (max > (Number(props.getProperty(clave)) || 0)) props.setProperty(clave, String(max));
        } catch (e) {}
      }
      return res;
    });
  });
}

/**
 * Carga masiva de clientes y contratos (pegados desde Excel).
 * clientes = [{NIT, NOMBRE, TIPO_CLIENTE, CONTACTO, TELEFONO, CORREO, DIRECCION, CIUDAD, CORREO_FACTURACION}]
 * contratos = [{CLIENTE_NIT, NUM_CONTRATO, TIPO, OBJETO, F_INICIO, F_FIN, VALOR, ESTADO}]
 * op = { decisiones, soloRevisar }. Los clientes con nombre parecido a otro quedan en res.confirmar hasta que se decida.
 */
function ventasImportarClientes(clientes, contratos, op) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      op = op || {};
      var ctx = { lista: ventasLeer_('CLIENTES'), decisiones: op.decisiones || {}, pendientes: {}, alias: {}, simular: !!op.soloRevisar };
      var res = { clientes: [], contratos: [], omitidos: [] };
      (clientes || []).forEach(function (c, i) {
        var n = 'Cliente fila ' + (i + 1) + ': ';
        if (!String(c.NIT || '').trim() || !String(c.NOMBRE || '').trim()) { res.omitidos.push(n + 'falta el NIT o el nombre'); return; }
        var antes = ctx.lista.length;
        var cli = ventasResolverCliente_(c, ctx, 'Cliente fila ' + (i + 1));
        if (!cli) { res.omitidos.push(n + '"' + c.NOMBRE + '" pendiente de confirmar (se parece a un cliente registrado)'); return; }
        // Si se eligió un cliente existente, sus datos se completan con los de la fila (sin cambiar NIT ni nombre)
        if (!ctx.simular && ventasClaveNit_(cli.NIT) !== ventasClaveNit_(c.NIT))
          ventasUpsertCliente_(Object.assign({}, c, { NIT: cli.NIT, NOMBRE: cli.NOMBRE }), ctx.lista);
        res.clientes.push({ NIT: cli.NIT, NOMBRE: cli.NOMBRE, NUEVO: ctx.lista.length > antes });
      });
      var vistos = {};
      (contratos || []).forEach(function (k, i) {
        var n = 'Contrato fila ' + (i + 1) + ': ', num = String(k.NUM_CONTRATO || '').trim();
        if (!num) { res.omitidos.push(n + 'sin número de contrato'); return; }
        var kk = ventasClaveContrato_(num);
        if (vistos[kk]) { res.omitidos.push(n + num + ' está repetido en los datos pegados'); return; }
        var kn = ventasClaveNit_(k.CLIENTE_NIT);
        var cli = ctx.alias[kn] || ctx.lista.filter(function (x) { return ventasClaveNit_(x.NIT) === kn; })[0];
        if (!cli) {
          res.omitidos.push(n + num + (ctx.pendientes[kn] ? ': el cliente está pendiente de confirmar' : ': el cliente con NIT ' + (k.CLIENTE_NIT || '—') + ' no está registrado'));
          return;
        }
        vistos[kk] = true;
        if (ctx.simular) {
          var otro = ventasLeer_('CONTRATOS').filter(function (x) { return ventasClaveContrato_(x.NUM_CONTRATO) === kk; })[0];
          if (otro && ventasClaveNit_(otro.CLIENTE_NIT) !== ventasClaveNit_(cli.NIT)) { res.omitidos.push(n + num + ' ya está registrado para ' + otro.CLIENTE); return; }
          res.contratos.push({ NUM_CONTRATO: num, CLIENTE: cli.NOMBRE, EXISTE: !!otro });
          return;
        }
        try {
          var d = ventasGuardarContrato_(Object.assign({}, k, { CLIENTE_NIT: cli.NIT }), ctx.lista);
          res.contratos.push({ NUM_CONTRATO: d.NUM_CONTRATO, CLIENTE: d.CLIENTE });
        } catch (e) { res.omitidos.push(n + e.message); }
      });
      res.confirmar = ventasPendientesLista_(ctx);
      return res;
    });
  });
}

// Envía un PDF o imagen a Gemini con una instrucción y devuelve el JSON que responde
function ventasGeminiLeer_(base64, mime, prompt, nombre) {
  var clave = ventasProp_('GEMINI_API_KEY');
  if (!clave) throw new Error('Para leer PDF falta la propiedad del script GEMINI_API_KEY (la misma del Asistente).');
  if (!base64) throw new Error('El archivo ' + (nombre || '') + ' llegó vacío.');
  if (base64.length > 26000000) throw new Error('El archivo ' + (nombre || '') + ' supera 19 MB. Divídalo en partes.');
  mime = mime || 'application/pdf';
  var modelo = ventasProp_('VENTAS_MODELO_LECTURA', 'gemini-2.5-flash');
  var pedir = function (m) {
    var config = { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 32768 };
    if (/^gemini-2\.5-flash/.test(m)) config.thinkingConfig = { thinkingBudget: 0 };
    return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': clave },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }], generationConfig: config })
    });
  };
  var resp = pedir(modelo);
  // Si el modelo no existe para la clave se usa el Flash más reciente disponible (lista del Asistente)
  if (resp.getResponseCode() === 404 && typeof asiModelosDisponibles_ === 'function') {
    var otro = asiModelosDisponibles_(clave).filter(function (n) { return /^gemini-[\d.]+-flash(-preview)?(-\d+)?$/.test(n); })
      .sort(function (a, b) { return parseFloat(b.replace(/^gemini-/, '')) - parseFloat(a.replace(/^gemini-/, '')); })[0];
    if (otro) { modelo = otro; resp = pedir(otro); }
  }
  if (resp.getResponseCode() !== 200) throw new Error('No se pudo leer ' + (nombre || 'el archivo') + ' con Gemini (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 300));
  var cuerpo = JSON.parse(resp.getContentText());
  var partes = (((cuerpo.candidates || [])[0] || {}).content || {}).parts || [];
  var texto = partes.filter(function (x) { return !x.thought && x.text; }).map(function (x) { return x.text; }).join('').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  var datos;
  try { datos = JSON.parse(texto); } catch (e) { throw new Error('La lectura de ' + (nombre || 'el archivo') + ' no devolvió datos legibles. Intente con un archivo más nítido.'); }
  if (datos && typeof datos === 'object') datos._modelo = modelo;
  return datos;
}

/**
 * Lee órdenes de trabajo desde un PDF (o una foto/escaneo) con Gemini y devuelve sus datos para revisarlos antes de importar.
 * Sirve tanto para el registro GCV-FO-002 completo (varias OT) como para una OT individual con sus equipos.
 * Requiere la propiedad GEMINI_API_KEY (la misma del Asistente). Modelo opcional: VENTAS_MODELO_LECTURA (por defecto gemini-2.5-flash).
 */
function ventasLeerOTArchivo(base64, mime, nombre) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var prompt = 'Eres un asistente que extrae datos de órdenes de trabajo (OT) del laboratorio de metrología IMCOLMETRIC S.A.S. ' +
      'El documento puede ser: (a) el registro GCV-FO-002 con muchas OT (columnas: fecha, cliente, NIT, N° de cotización o contrato, tipo de servicio, N° solicitud de calibración, lugar de trabajo, N° OT), ' +
      'o (b) una orden de trabajo individual con los datos del cliente y la lista de equipos/instrumentos. ' +
      'Devuelve SOLO un JSON con la forma {"ordenes":[{"OT":"","FECHA":"","CLIENTE":"","NIT":"","REFERENCIA":"","TIPO_SERVICIO":"","SOLICITUD_CAL":"","LUGAR":"","ESTADO":"","equipos":[{"MAGNITUD":"","EQUIPO":"","MARCA":"","MODELO":"","SERIE":"","CODIGO_INVENTARIO":"","CANTIDAD":1}]}]}. ' +
      'Reglas: OT exactamente como aparece (p. ej. OT-015-26 u OT015-26); FECHA en formato AAAA-MM-DD; NIT tal como aparece con su dígito de verificación; ' +
      'REFERENCIA es el número de cotización, contrato u orden de servicio del cliente; LUGAR es "Laboratorio" o "Dirección del cliente"; ' +
      'MAGNITUD debe ser una de: ' + Object.keys(VENTAS_CFG.MAGNITUDES).join(', ') + ' (o vacío si no se sabe); ' +
      'deja vacío ("") lo que no aparezca, no inventes datos; incluye todas las OT del documento y todas las filas de equipos; ignora filas vacías y encabezados.';
    var datos = ventasGeminiLeer_(base64, mime, prompt, nombre), modelo = datos._modelo;
    var t = function (v) { return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); };
    var ordenes = (Array.isArray(datos) ? datos : (datos.ordenes || [])).map(function (o) {
      return { OT: t(o.OT).toUpperCase(), FECHA: t(o.FECHA), CLIENTE: t(o.CLIENTE), NIT: t(o.NIT), REFERENCIA: t(o.REFERENCIA), TIPO_SERVICIO: t(o.TIPO_SERVICIO),
        SOLICITUD_CAL: t(o.SOLICITUD_CAL), LUGAR: t(o.LUGAR), ESTADO: VENTAS_ESTADOS_IMPORTABLES.indexOf(t(o.ESTADO)) !== -1 ? t(o.ESTADO) : '',
        equipos: (o.equipos || []).map(function (e) {
          return { MAGNITUD: t(e.MAGNITUD), EQUIPO: t(e.EQUIPO), MARCA: t(e.MARCA), MODELO: t(e.MODELO), SERIE: t(e.SERIE), CODIGO_INVENTARIO: t(e.CODIGO_INVENTARIO), CANTIDAD: ventasNum_(e.CANTIDAD) || 1 };
        }).filter(function (e) { return e.EQUIPO || e.SERIE || e.MAGNITUD; }) };
    }).filter(function (o) { return o.OT || o.CLIENTE; });
    return { archivo: nombre || '', modelo: modelo, ordenes: ordenes };
  });
}

/**
 * Lee la solicitud de un cliente (PDF, correo impreso, orden de servicio o foto) con Gemini y la prepara para registrarla.
 * Devuelve los datos leídos y lo que ya se sabe del cliente: si está registrado (mismo NIT), si se parece a otro y sus contratos.
 */
function ventasLeerSolicitudArchivo(base64, mime, nombre) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var prompt = 'Eres un asistente del área comercial del laboratorio de metrología IMCOLMETRIC S.A.S. (calibración de equipos). ' +
      'El documento lo envía un cliente y puede ser: (1) su SOLICITUD inicial (carta, correo, pedido de cotización, listado de equipos o una orden de servicio), o ' +
      '(2) el formato GCV-FO-004 "FORMATO DE SOLICITUD DE CALIBRACIÓN DE EQUIPOS" (SC), que el cliente diligencia DESPUÉS de aceptar la cotización. ' +
      'Devuelve SOLO un JSON con la forma {"TIPO_DOCUMENTO":"","cliente":{"NIT":"","NOMBRE":"","CONTACTO":"","TELEFONO":"","CORREO":"","CIUDAD":"","DIRECCION":""},' +
      '"FECHA":"","NUM_SC":"","NUM_COTIZACION":"","NUM_OT":"","TERCERIZADO_A_IMC":"","CONFORMIDAD":{"SOLICITA":"","NORMA":"","REGLA":""},' +
      '"REFERENCIA":"","LUGAR":"","NUM_CONTRATO":"","ORDEN_SERVICIO":"","OBSERVACIONES":"",' +
      '"equipos":[{"MAGNITUD":"","EQUIPO":"","MARCA":"","MODELO":"","SERIE":"","CODIGO_INVENTARIO":"","UBICACION":"","RANGO":"","PUNTOS_CALIBRACION":"","CANTIDAD":1}]}. ' +
      'Reglas: TIPO_DOCUMENTO es "SC" si es el formato GCV-FO-004 de solicitud de calibración, o "SOLICITUD" en otro caso; ' +
      'el cliente es quien solicita el servicio (NO es IMCOLMETRIC); en la SC el cliente es el de "Nombre o razón social a quién se le emitirá el certificado" y el NIT el de facturación; ' +
      'NIT con su dígito de verificación tal como aparece; FECHA del documento en formato AAAA-MM-DD; ' +
      'NUM_SC es el "Número de consecutivo" de la SC (p. ej. SC-0001) tal como aparece; NUM_COTIZACION es lo escrito en "Número de cotización" (puede ser un número de cotización como 2026-0005, un contrato o un acuerdo de servicio); ' +
      'NUM_OT el número de orden de trabajo si aparece (p. ej. OT-001-26); ' +
      'TERCERIZADO_A_IMC es "SI" o "NO" según la casilla "El servicio solicitado ha sido tercerizado a Imcolmetric S.A.S." (vacío si no aparece); ' +
      'CONFORMIDAD: SOLICITA "SI"/"NO" según "¿Requiere conformidad para los equipos?", NORMA el documento bajo el que la requiere y REGLA la regla de decisión; ' +
      'REFERENCIA es un asunto corto de lo que pide (p. ej. "Calibración de 5 termohigrómetros"); LUGAR es "Instalaciones del laboratorio" o "En sitio" (si piden el servicio en sus instalaciones) o vacío; ' +
      'si los equipos no vienen en la tabla de equipos pero sí en una orden de compra u orden de servicio adjunta, tómalos de allí (descripción y cantidad); ' +
      'NUM_CONTRATO solo si menciona un contrato; ORDEN_SERVICIO solo si el documento es o cita una orden de servicio del cliente; OBSERVACIONES: requisitos especiales, plazos o condiciones que pida el cliente (máximo 300 caracteres); ' +
      'MAGNITUD debe ser una de: ' + Object.keys(VENTAS_CFG.MAGNITUDES).join(', ') + ' (use "Otra" si no corresponde, o vacío si no se sabe); ' +
      'una fila por equipo, o CANTIDAD si piden varios iguales sin serie; deja vacío ("") lo que no aparezca, no inventes datos.';
    var d = ventasGeminiLeer_(base64, mime, prompt, nombre) || {};
    d.archivo = nombre || '';
    return ventasEnriquecerSolicitud_(d);
  });
}
/** Para el GCV-FO-004 en Excel (leído en el navegador): prepara la SC igual que si viniera del PDF. */
function ventasPrepararSolicitud(d) { seguridadRPC_();
  return ventasRespuesta_(function () { return ventasEnriquecerSolicitud_(d || {}); });
}
// Normaliza lo leído y agrega lo que ya se sabe: cliente registrado o parecido, contratos, a qué cotización/OT va la SC y el alcance sugerido
function ventasEnriquecerSolicitud_(d) {
  var t = function (v) { return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); };
  var sn = function (v) { return /^s/i.test(t(v)) ? 'SI' : (/^n/i.test(t(v)) ? 'NO' : ''); };
  var c = d.cliente || {}, cli = {};
  ['NIT', 'NOMBRE', 'CONTACTO', 'TELEFONO', 'CORREO', 'CIUDAD', 'DIRECCION'].forEach(function (k) { cli[k] = t(c[k]); });
  var mags = Object.keys(VENTAS_CFG.MAGNITUDES);
  var equipos = (d.equipos || []).map(function (e) {
    var o = {};
    ['EQUIPO', 'MARCA', 'MODELO', 'SERIE', 'CODIGO_INVENTARIO', 'UBICACION', 'RANGO', 'PUNTOS_CALIBRACION'].forEach(function (k) { o[k] = t(e[k]); });
    var m = t(e.MAGNITUD) || t(e.EQUIPO), mi = m ? ventasMagnitudImportada_(m) : '';
    o.MAGNITUD = mags.indexOf(t(e.MAGNITUD)) !== -1 ? t(e.MAGNITUD) : (mi === 'Equipos biomédicos' && !/biom|monitor|desfibril|bomba|electrocard|oximetr|ventilad/i.test(m) ? 'Otra' : mi);
    o.CANTIDAD = ventasNum_(e.CANTIDAD) || 1;
    return o;
  }).filter(function (e) { return e.EQUIPO || e.SERIE || e.MAGNITUD; });
  var lugar = /sitio|instalaciones del cliente|en planta/i.test(t(d.LUGAR)) ? 'En sitio' : (t(d.LUGAR) ? VENTAS_CFG.LUGARES[0] : '');
  var sim = cli.NIT || cli.NOMBRE ? ventasClientesSimilares_(cli.NIT, cli.NOMBRE) : { mismoNit: null, parecidos: [] };
  var nitRef = sim.mismoNit ? sim.mismoNit.NIT : cli.NIT;
  var contratos = nitRef ? ventasLeer_('CONTRATOS').filter(function (k) { return ventasClaveNit_(k.CLIENTE_NIT) === ventasClaveNit_(nitRef); })
    .map(function (k) { return { NUMERO: String(k.NUM_CONTRATO), TIPO: k.TIPO, VIGENTE: ventasContratoVigente_(k), F_FIN: ventasFmt_(k.F_FIN) }; }) : [];
  var fecha = ventasFecha_(t(d.FECHA));
  var numSC = t(d.NUM_SC).toUpperCase(), numOT = t(d.NUM_OT).toUpperCase(), numCot = t(d.NUM_COTIZACION);
  var tipo = /^sc$/i.test(t(d.TIPO_DOCUMENTO)) || (numSC && /^S\.?\s*C/i.test(numSC)) ? 'SC' : 'SOLICITUD';
  var conf = d.CONFORMIDAD || {};
  var r = { archivo: t(d.archivo), modelo: d._modelo || '', TIPO_DOCUMENTO: tipo, cliente: cli, FECHA: fecha ? ventasFmt_(fecha) : '',
    NUM_SC: numSC, NUM_OT: numOT, NUM_COTIZACION: numCot, TERCERIZADO_A_IMC: sn(d.TERCERIZADO_A_IMC || d.TERCERIZADO),
    CONFORMIDAD: { SOLICITA: sn(conf.SOLICITA), NORMA: t(conf.NORMA), REGLA: t(conf.REGLA) },
    REFERENCIA: t(d.REFERENCIA), LUGAR: lugar, NUM_CONTRATO: t(d.NUM_CONTRATO), ORDEN_SERVICIO: t(d.ORDEN_SERVICIO),
    OBSERVACIONES: t(d.OBSERVACIONES).slice(0, 500), equipos: equipos,
    mismoNit: sim.mismoNit, parecidos: sim.parecidos, contratos: contratos, alcance: ventasSugerirAlcance_(equipos, lugar) };
  if (tipo === 'SC') {
    // GCV-PR-001 5.6/5.7: la SC llega después de la cotización aceptada (o del contrato): se amarra a esa solicitud / OT
    var dest = ventasBuscarDestinoSC_(numSC, numOT, numCot, fecha);
    r.paquete = dest ? ventasInfoPaquete_(dest, cli.NIT, cli.NOMBRE, numSC) : null;
    r.candidatos = ventasCandidatosSC_(cli.NIT, cli.NOMBRE);
    // ¿La "cotización" es un contrato del cliente? (5.7 nota: para contratos la SC va con el número del contrato)
    var kc = ventasClaveContrato_(numCot);
    r.contratoSC = kc ? contratos.filter(function (k) { var n = ventasClaveContrato_(k.NUMERO); return n === kc || (n.length > 5 && kc.indexOf(n) !== -1); })[0] || null : null;
  }
  return r;
}

// ---------- Alcance del laboratorio (MT-FO-006 Actividades del laboratorio) ----------
var VENTAS_ALCANCE = [
  { magnitud: 'Temperatura de contacto', lugares: ['Laboratorio'], intervalo: '-30 °C ≤ t ≤ 125 °C', instrumentos: 'Termómetros digitales y analógicos con sensor termopar, termistor o RTD' },
  { magnitud: 'Temperatura y humedad relativa', lugares: ['Laboratorio'], intervalo: '10 °C a 40 °C · 10 %HR a 90 %HR', instrumentos: 'Termohigrómetros, termohigrógrafos, higrómetros, dataloggers y termómetros de condiciones ambientales' },
  { magnitud: 'Instrumentos de pesaje de funcionamiento no automático', lugares: ['Laboratorio', 'Sitio'], intervalo: '0 kg < m ≤ 200 kg', instrumentos: 'Instrumentos de pesaje de funcionamiento no automático' },
  { magnitud: 'Presión relativa', lugares: ['Laboratorio', 'Sitio'], intervalo: '-69 kPa a 34 473,79 kPa', instrumentos: 'Esfigmomanómetros, vacuómetros, manovacuómetros y manómetros' }
];
// Sugiere si los equipos están dentro del alcance (magnitud declarada y lugar permitido). La decisión final es del usuario.
function ventasSugerirAlcance_(equipos, lugar) {
  var sitio = lugar === 'En sitio';
  var det = (equipos || []).map(function (e) {
    var a = VENTAS_ALCANCE.filter(function (x) { return x.magnitud === e.MAGNITUD; })[0];
    var ok = !!a && (!sitio || a.lugares.indexOf('Sitio') !== -1);
    return { EQUIPO: e.EQUIPO, MAGNITUD: e.MAGNITUD, DENTRO: ok,
      MOTIVO: !e.MAGNITUD ? 'sin magnitud' : !a ? 'la magnitud no está en el MT-FO-006' : (!ok ? 'esta magnitud no se calibra en sitio' : a.intervalo) };
  });
  var fuera = det.filter(function (x) { return !x.DENTRO; });
  return { sugerido: !det.length ? '' : (fuera.length ? 'NO' : 'SI'), detalle: det,
    texto: !det.length ? '' : fuera.length ? fuera.length + ' equipo(s) fuera del alcance: ' + fuera.map(function (x) { return x.EQUIPO + ' (' + x.MOTIVO + ')'; }).join('; ')
      : 'Todos los equipos están en magnitudes del MT-FO-006' + (sitio ? ' que se calibran en sitio' : '') + '. Verifique el intervalo de medición.' };
}

// ---------- Paquete SC ↔ OT ----------
// Número de una solicitud de calibración: SC-001, SC 001-26, SC-2026-0001 → { n, anio }
function ventasPartesSC_(sc) {
  var t = String(sc || '').toUpperCase(), m;
  if ((m = t.match(/S\.?\s*C\.?\s*-?\s*(\d{4})\s*-\s*(\d+)/))) return { n: Number(m[2]), anio: Number(m[1]) };
  if ((m = t.match(/S\.?\s*C\.?\s*-?\s*(\d+)(?:\s*-\s*(\d{2,4}))?/))) return { n: Number(m[1]), anio: m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : null };
  return null;
}
// Destino de una SC (GCV-FO-004): la OT escrita, la cotización (N° de solicitud), el contrato, el N° de SC ya registrado o el mismo consecutivo de la OT
function ventasBuscarDestinoSC_(numSC, numOT, numCot, fechaSC) {
  var lista = ventasLeer_('SOLICITUDES').filter(function (x) { return x.ESTADO !== 'Cerrada por desistimiento'; });
  if (numOT) {
    var k = ventasClaveOT_(numOT), porOT = lista.filter(function (x) { return x.NUM_OT && ventasClaveOT_(x.NUM_OT) === k; })[0];
    if (porOT) return porOT;
  }
  var cot = String(numCot || '');
  var m = cot.match(/(\d{4})\s*-\s*(\d{3,5})/);
  if (m) {
    var id = m[1] + '-' + ('0000' + Number(m[2])).slice(-4), porId = lista.filter(function (x) { return String(x.ID) === id; })[0];
    if (porId) return porId;
  }
  var kc = ventasClaveContrato_(cot);
  if (kc.length >= 4) {
    var porK = lista.filter(function (x) { var n = ventasClaveContrato_(x.NUM_CONTRATO); return n && (n === kc || (n.length > 5 && kc.indexOf(n) !== -1)); });
    var libre = porK.filter(function (x) { return !x.CONSECUTIVO_FO004; })[0];
    if (libre || porK[0]) return libre || porK[0];
  }
  return ventasBuscarPaqueteSC_(numSC, '', fechaSC, lista);
}
// Solicitudes del cliente que esperan su SC (cotización aceptada o por aceptar) para elegir a mano
function ventasCandidatosSC_(nit, nombre) {
  if (!nit && !nombre) return [];
  return ventasLeer_('SOLICITUDES').filter(function (x) {
    return ['Cotizada', 'En seguimiento', 'Cerrada por venta', 'Solicitud de calibración recibida', 'Programada'].indexOf(x.ESTADO) !== -1 &&
      !/^S/i.test(String(x.CONSECUTIVO_FO004 || '').trim()) && ventasClienteCoincide_(nit, nombre, x);
  }).map(function (x) { return { ID: x.ID, ESTADO: x.ESTADO, REFERENCIA: x.REFERENCIA || '', NUM_OT: x.NUM_OT || '', VALOR_TOTAL: x.VALOR_TOTAL || 0 }; });
}
// Busca la OT a la que pertenece la SC: por la OT escrita en la SC, por el N° de SC registrado en la OT o por el mismo consecutivo (SC-001 ↔ OT-001)
function ventasBuscarPaqueteSC_(numSC, numOT, fechaSC, lista) {
  lista = (lista || ventasLeer_('SOLICITUDES')).filter(function (x) { return x.NUM_OT; });
  if (numOT) {
    var k = ventasClaveOT_(numOT), porOT = lista.filter(function (x) { return ventasClaveOT_(x.NUM_OT) === k; })[0];
    if (porOT) return porOT;
  }
  if (!numSC) return null;
  var ks = ventasClaveOT_(numSC), exacta = lista.filter(function (x) { return x.CONSECUTIVO_FO004 && ventasClaveOT_(x.CONSECUTIVO_FO004) === ks; })[0];
  if (exacta) return exacta;
  var p = ventasPartesSC_(numSC); if (!p) return null;
  var cand = lista.filter(function (x) { var o = ventasPartesOT_(x.NUM_OT); return o && o.n === p.n && (!p.anio || o.anio === p.anio); });
  if (cand.length > 1) {
    var anio = (fechaSC || new Date()).getFullYear(), mismo = cand.filter(function (x) { return ventasPartesOT_(x.NUM_OT).anio === anio; });
    if (mismo.length) cand = mismo;
    cand.sort(function (a, b) { return ventasPartesOT_(b.NUM_OT).anio - ventasPartesOT_(a.NUM_OT).anio; });
  }
  return cand[0] || null;
}
// ¿La SC es del mismo cliente que la OT? Mismo NIT (sin dígito de verificación) o mismo nombre (sin S.A.S., E.S.E., etc.)
function ventasClienteCoincide_(nit, nombre, s) {
  if (nit && s.CLIENTE_NIT && ventasClaveNit_(nit) === ventasClaveNit_(s.CLIENTE_NIT)) return true;
  if (!nombre || !s.CLIENTE) return false;
  return ventasNorm_(nombre) === ventasNorm_(s.CLIENTE) || ventasNombresParecidos_(nombre, s.CLIENTE);
}
function ventasInfoPaquete_(s, nit, nombre, numSC) {
  var otraSC = !!(numSC && s.CONSECUTIVO_FO004 && ventasClaveOT_(s.CONSECUTIVO_FO004) !== ventasClaveOT_(numSC) && /^S/i.test(String(s.CONSECUTIVO_FO004).trim()));
  var antes = VENTAS_ESTADOS.indexOf(s.ESTADO) < VENTAS_ESTADOS.indexOf('Cerrada por venta');
  return { ID: s.ID, NUM_OT: s.NUM_OT || '', CLIENTE: s.CLIENTE, CLIENTE_NIT: String(s.CLIENTE_NIT), ESTADO: s.ESTADO, SC_ACTUAL: s.CONSECUTIVO_FO004 || '',
    EQUIPOS: ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID).length, TIENE_PDF: !!s.URL_SOLICITUD_CLIENTE, REFERENCIA: s.REFERENCIA || '',
    TIPO_ACEPTACION: s.TIPO_ACEPTACION || '', NUM_CONTRATO: s.NUM_CONTRATO || '',
    COINCIDE: ventasClienteCoincide_(nit, nombre, s), OTRA_SC: otraSC,
    // La SC se recibe con la cotización aceptada (GCV-PR-001 5.6 y 5.7)
    SIN_ACEPTAR: antes || s.ESTADO === 'Cerrada por desistimiento',
    // Secuencia SC ↔ OT: con OT, el número de la SC debe ser el mismo; sin OT, la OT prevista no debe estar usada
    SECUENCIA_ERROR: numSC ? (s.NUM_OT ? (ventasSecuenciaCoincide_(numSC, s.NUM_OT) ? '' : ventasErrorSecuencia_(numSC, s.NUM_OT).replace(/^SECUENCIA:\s*/, ''))
      : (ventasSCAntigua_(numSC) ? '' : (function () { try { ventasAsignarSecuencia_(s, numSC, true); return ''; } catch (e) { return e.message.replace(/^SECUENCIA:\s*/, ''); } })())) : '',
    OT_PREVISTA: !s.NUM_OT && numSC && ventasPartesSC_(numSC) && !ventasSCAntigua_(numSC) ? ventasOTDeN_(ventasPartesSC_(numSC).n, ventasPartesSC_(numSC).anio) : '',
    // Alcance sugerido con los equipos ya cotizados / de la OT
    ALCANCE: ventasSugerirAlcance_(ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID), s.LUGAR_SERVICIO), ALCANCE_LAB: s.ALCANCE_LAB || '' };
}
function ventasErrorPaquete_(numSC, nombre, nit, s) {
  return 'CLIENTE_NO_COINCIDE: La solicitud ' + (numSC || '') + ' es de «' + nombre + '»' + (nit ? ' (NIT ' + nit + ')' : '') +
    ', pero la ' + (s.NUM_OT || 'cotización ' + s.ID) + ' es de «' + s.CLIENTE + '» (NIT ' + s.CLIENTE_NIT + '). No pertenecen al mismo paquete: verifique el número de la SC, de la cotización o de la OT.';
}
function ventasErrorSinAceptar_(numSC, s) {
  return 'COTIZACION_SIN_ACEPTAR: La cotización ' + s.ID + ' está en estado «' + s.ESTADO + '». La solicitud de calibración ' + (numSC || '') +
    ' se recibe cuando el cliente ya aceptó la cotización (GCV-PR-001 5.6): registre primero la aceptación («Cerrada por venta»).';
}
/**
 * Vincula la solicitud de calibración (SC) leída del PDF a su OT: guarda el PDF como soporte, registra el N° de SC
 * y, si la OT no tiene equipos, le carga los de la SC. Si el cliente no coincide, no se vincula.
 * datos = { NUM_SC, FECHA, cliente:{NIT,NOMBRE}, equipos:[], adjunto:{base64,mime,nombre} }
 */
function ventasVincularSC(id, datos) { seguridadRPC_(); return ventasRegistrarSC(id, datos); }
/**
 * Registra la SC (GCV-FO-004) en su solicitud: la de la cotización aceptada o la OT (contrato / OT existente).
 * Con la cotización en «Cerrada por venta» pasa a «Solicitud de calibración recibida» y se asigna la OT (5.7).
 * datos = { NUM_SC, FECHA, cliente:{NIT,NOMBRE}, equipos:[], conformidad:{SOLICITA,NORMA,REGLA}, TERCERIZADO_A_IMC, adjunto, ruta }
 */
function ventasRegistrarSC(id, datos) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      datos = datos || {};
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id + '.');
      var c = datos.cliente || {}, numSC = String(datos.NUM_SC || '').trim().toUpperCase();
      if (!ventasClienteCoincide_(c.NIT, c.NOMBRE, s)) throw new Error(ventasErrorPaquete_(numSC, c.NOMBRE, c.NIT, s));
      var info = ventasInfoPaquete_(s, c.NIT, c.NOMBRE, numSC);
      if (info.SIN_ACEPTAR) throw new Error(ventasErrorSinAceptar_(numSC, s));
      if (info.OTRA_SC) throw new Error('La ' + (s.NUM_OT || 'solicitud ' + s.ID) + ' ya tiene la solicitud de calibración ' + s.CONSECUTIVO_FO004 + '. Una OT solo puede tener una SC.');
      if (s.NUM_OT && numSC && !ventasSecuenciaCoincide_(numSC, s.NUM_OT)) throw new Error(ventasErrorSecuencia_(numSC, s.NUM_OT));
      ventasAsegurarColumnas_('SOLICITUDES');
      // Equipos de la SC (solo si la solicitud no tiene) y declaración de conformidad (5.7.1)
      var previos = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).length, nuevos = 0;
      if (!previos && (datos.equipos || []).length) {
        ventasGuardarEquipos_(id, datos.equipos.map(function (e) { return Object.assign({}, e, { ESTADO_EQUIPO: s.ESTADO }); }));
        ventasRecalcularTotales_(id);
        nuevos = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', id).length;
      }
      var conf = datos.conformidad || {};
      if (conf.SOLICITA && !ventasBuscar_('CONFORMIDAD', 'ID_SOLICITUD', id)) {
        try { ventasGuardarConformidad_(id, conf); } catch (e) { Logger.log('Ventas: conformidad de la SC no registrada: ' + e.message); }
      }
      var estadoAntes = s.ESTADO;
      if (s.ESTADO === 'Cerrada por venta') {
        ventasCambiarEstado_(id, 'Solicitud de calibración recibida', { consecutivoFO004: numSC, fecha: datos.FECHA, observacion: 'GCV-FO-004 recibida del cliente' });
        s = ventasBuscar_('SOLICITUDES', 'ID', id);
      }
      var cambios = { F_ACTUALIZACION: ventasAhora_() };
      if (numSC) cambios.CONSECUTIVO_FO004 = numSC;
      if (!s.F_SOLICITUD_CAL && datos.FECHA) cambios.F_SOLICITUD_CAL = ventasFecha_(datos.FECHA);
      if (datos.TERCERIZADO_A_IMC) cambios.TERCERIZADO_A_IMC = datos.TERCERIZADO_A_IMC;
      if (datos.adjunto && datos.adjunto.base64) cambios.URL_SOLICITUD_CLIENTE = ventasGuardarAdjuntoSolicitud_((s.NUM_OT || s.ID) + ' ' + (numSC || 'SC'), datos.adjunto);
      ventasActualizarFila_('SOLICITUDES', s._fila, cambios);
      var rutaMsg = '';
      if (datos.ruta && (datos.ruta.ALCANCE || datos.ruta.TERCERIZADO)) rutaMsg = ventasDefinirRuta_(ventasBuscar_('SOLICITUDES', 'ID', id), datos.ruta).mensaje;
      s = ventasBuscar_('SOLICITUDES', 'ID', id);
      ventasLog_(id, 'Solicitud de calibración ' + (numSC || '') + ' registrada' + (s.NUM_OT ? ' · ' + s.NUM_OT : ''), estadoAntes, s.ESTADO,
        'Cliente verificado: ' + s.CLIENTE + (nuevos ? '. Se cargaron ' + nuevos + ' equipo(s) de la SC' : '') +
        (datos.TERCERIZADO_A_IMC === 'SI' ? '. El cliente subcontrató el servicio a IMCOLMETRIC' : '') + (cambios.URL_SOLICITUD_CLIENTE ? '. Documento: ' + cambios.URL_SOLICITUD_CLIENTE : ''));
      return { ID: id, NUM_OT: s.NUM_OT || '', NUM_SC: numSC, ESTADO: s.ESTADO, equipos: nuevos, mensajeRuta: rutaMsg };
    });
  });
}
/** Desde la pantalla: busca la OT del paquete de una SC (por N° de SC o de OT) y dice si el cliente coincide. */
function ventasConsultarPaquete(numSC, ref, nit, nombre) { seguridadRPC_();
  return ventasRespuesta_(function () {
    ref = String(ref || '').trim();
    var esOT = /^O\.?\s*T/i.test(ref);
    var x = ref ? ventasBuscarDestinoSC_('', esOT ? ref : '', esOT ? '' : ref) : ventasBuscarDestinoSC_(String(numSC || '').toUpperCase(), '', '');
    return x ? ventasInfoPaquete_(x, nit, nombre, String(numSC || '').toUpperCase()) : null;
  });
}
// Busca la OT aunque se escriba corta ("OT03", "3", "OT-003"): primero exacta; si no, por el consecutivo, prefiriendo las del mismo cliente y el año más reciente
function ventasBuscarOTFlexible_(numOT, cliente) {
  var lista = ventasLeer_('SOLICITUDES').filter(function (y) { return y.NUM_OT; });
  var k = ventasClaveOT_(numOT);
  var exacta = lista.filter(function (y) { return ventasClaveOT_(y.NUM_OT) === k; })[0];
  if (exacta) return exacta;
  var m = String(numOT || '').match(/(\d+)(?:\s*-\s*(\d{2}))?\s*$/);
  if (!m) return null;
  var n = Number(m[1]), anio = m[2] ? 2000 + Number(m[2]) : null;
  var cand = lista.filter(function (y) { var o = ventasPartesOT_(y.NUM_OT); return o && o.n === n && (!anio || o.anio === anio); })
    .sort(function (a, b) { return ventasPartesOT_(b.NUM_OT).anio - ventasPartesOT_(a.NUM_OT).anio; });
  var mismo = cliente ? cand.filter(function (y) { return ventasClienteCoincide_(cliente.CLIENTE_NIT, cliente.CLIENTE, y); }) : [];
  return mismo[0] || cand[0] || null;
}
/** OT del mismo cliente que una solicitud (para unir una solicitud suelta a su paquete). */
function ventasOTsCliente(id) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var x = ventasBuscar_('SOLICITUDES', 'ID', id);
    if (!x) return [];
    return ventasLeer_('SOLICITUDES').filter(function (y) { return y.NUM_OT && y.ID !== x.ID && ventasClienteCoincide_(x.CLIENTE_NIT, x.CLIENTE, y); })
      .map(function (y) { return { NUM_OT: y.NUM_OT, ID: y.ID, ESTADO: y.ESTADO, SC: y.CONSECUTIVO_FO004 || '', TIENE_PDF: !!y.URL_SOLICITUD_CLIENTE }; });
  });
}
/**
 * Corrige una SC que quedó como solicitud suelta: la une a su OT (mismo cliente), le pasa el PDF, el N° de SC
 * y los equipos (si la OT no tiene), y elimina la solicitud suelta.
 */
function ventasUnirSolicitudAOT(idSuelta, numOT) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      var x = ventasBuscar_('SOLICITUDES', 'ID', idSuelta);
      if (!x) throw new Error('No existe la solicitud ' + idSuelta + '.');
      if (x.NUM_OT) throw new Error('La solicitud ' + idSuelta + ' ya tiene la ' + x.NUM_OT + ': no es una solicitud suelta.');
      if (['Recibida', 'En revisión de requisitos'].indexOf(x.ESTADO) === -1) throw new Error('Solo se pueden unir solicitudes sueltas en estado Recibida (esta está en ' + x.ESTADO + ').');
      var s = ventasBuscarOTFlexible_(numOT, x);
      if (!s) throw new Error('No existe la orden de trabajo ' + numOT + '.');
      if (!ventasClienteCoincide_(x.CLIENTE_NIT, x.CLIENTE, s)) throw new Error(ventasErrorPaquete_(x.CONSECUTIVO_FO004 || idSuelta, x.CLIENTE, x.CLIENTE_NIT, s));
      if (x.CONSECUTIVO_FO004 && !ventasSecuenciaCoincide_(x.CONSECUTIVO_FO004, s.NUM_OT)) throw new Error(ventasErrorSecuencia_(x.CONSECUTIVO_FO004, s.NUM_OT));
      ventasAsegurarColumnas_('SOLICITUDES');
      var cambios = { F_ACTUALIZACION: ventasAhora_() };
      if (x.URL_SOLICITUD_CLIENTE) cambios.URL_SOLICITUD_CLIENTE = x.URL_SOLICITUD_CLIENTE;
      if (x.CONSECUTIVO_FO004 && !s.CONSECUTIVO_FO004) cambios.CONSECUTIVO_FO004 = x.CONSECUTIVO_FO004;
      ventasActualizarFila_('SOLICITUDES', s._fila, cambios);
      var eqX = ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', idSuelta), pasados = 0;
      if (eqX.length && !ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', s.ID).length) {
        ventasGuardarEquipos_(s.ID, eqX.map(function (e) { var o = Object.assign({}, e); delete o._fila; o.ESTADO_EQUIPO = s.ESTADO; return o; }));
        ventasRecalcularTotales_(s.ID);
        pasados = eqX.length;
      }
      ventasEliminarFilas_('EQUIPOS', ventasFiltrar_('EQUIPOS', 'ID_SOLICITUD', idSuelta).map(function (e) { return e._fila; }));
      var conf = ventasFiltrar_('CONFORMIDAD', 'ID_SOLICITUD', idSuelta);
      ventasEliminarFilas_('CONFORMIDAD', conf.map(function (e) { return e._fila; }));
      ventasEliminarFilas_('SOLICITUDES', [ventasBuscar_('SOLICITUDES', 'ID', idSuelta)._fila]);
      ventasLog_(s.ID, 'Solicitud ' + idSuelta + ' unida a la ' + s.NUM_OT, s.ESTADO, s.ESTADO,
        'La solicitud del cliente estaba registrada aparte (' + idSuelta + ') y se integró al paquete de la OT' + (pasados ? ' con ' + pasados + ' equipo(s)' : '') + '.');
      return { ID: s.ID, NUM_OT: s.NUM_OT };
    });
  });
}

// Guarda en Drive el documento con que el cliente pidió el servicio y devuelve su enlace
function ventasGuardarAdjuntoSolicitud_(id, adj) {
  if (!adj || !adj.base64) return '';
  var carpeta = ventasCarpeta_(), it = carpeta.getFoldersByName('Solicitudes de clientes');
  var sub = it.hasNext() ? it.next() : carpeta.createFolder('Solicitudes de clientes');
  var nombre = id + ' - ' + String(adj.nombre || 'solicitud.pdf').replace(/[\\/:*?"<>|]+/g, '_');
  var blob = Utilities.newBlob(Utilities.base64Decode(adj.base64), adj.mime || 'application/pdf', nombre);
  return sub.createFile(blob).getUrl();
}

/* ============================ COTIZACIONES CARGADAS (GCV-FO-003) ============================
 * La cotización enviada al cliente (PDF, Word o Excel) se carga y se asocia a su paquete: la solicitud de la
 * cotización, su SC (GCV-FO-004) y/o su OT. El archivo queda en Drive y su valor queda como valor de la venta.
 */
/** PDF o imagen de la cotización: se leen el número, el cliente y los valores con Gemini. */
function ventasLeerCotizacionArchivo(base64, mime, nombre) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var prompt = 'Eres un asistente del área comercial del laboratorio IMCOLMETRIC S.A.S. El documento es una COTIZACIÓN (formato GCV-FO-003) que IMCOLMETRIC envió a un cliente. ' +
      'Devuelve SOLO un JSON {"NUM_COTIZACION":"","FECHA":"","CLIENTE":"","NIT":"","NUM_SC":"","NUM_OT":"","VALOR_SUBTOTAL":0,"VALOR_IVA":0,"VALOR_TOTAL":0,"REFERENCIA":""}. ' +
      'Reglas: NUM_COTIZACION es el número de la cotización tal como aparece (p. ej. "Cotización No. 2026-0005" → 2026-0005); el CLIENTE es a quien va dirigida (NO es IMCOLMETRIC); ' +
      'NIT del cliente tal como aparece; FECHA en formato AAAA-MM-DD; valores en pesos como números sin puntos ni símbolos; NUM_SC y NUM_OT solo si aparecen; ' +
      'REFERENCIA es la línea "Ref." o un asunto corto; deja vacío lo que no aparezca, no inventes datos.';
    var d = ventasGeminiLeer_(base64, mime, prompt, nombre) || {};
    d.archivo = nombre || '';
    return ventasEnriquecerCotizacion_(d);
  });
}
/** Word o Excel (leídos en el navegador): se completa con lo que ya existe en Ventas. */
function ventasPrepararCotizacion(d) { seguridadRPC_();
  return ventasRespuesta_(function () { return ventasEnriquecerCotizacion_(d || {}); });
}
function ventasEnriquecerCotizacion_(d) {
  var t = function (v) { return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); };
  var r = { archivo: t(d.archivo), NUM_COTIZACION: t(d.NUM_COTIZACION), FECHA: ventasFecha_(t(d.FECHA)) ? ventasFmt_(ventasFecha_(t(d.FECHA))) : '',
    CLIENTE: t(d.CLIENTE), NIT: t(d.NIT), NUM_SC: t(d.NUM_SC).toUpperCase(), NUM_OT: t(d.NUM_OT).toUpperCase(), REFERENCIA: t(d.REFERENCIA),
    VALOR_SUBTOTAL: ventasNum_(d.VALOR_SUBTOTAL) || '', VALOR_IVA: ventasNum_(d.VALOR_IVA) || '', VALOR_TOTAL: ventasNum_(d.VALOR_TOTAL) || '' };
  var dest = ventasDestinoCotizacion_(r.NUM_SC, r.NUM_OT, r.NUM_COTIZACION);
  r.destino = dest.fila ? ventasInfoCotizacion_(dest.fila, r.NIT, r.CLIENTE) : null;
  r.conflicto = dest.conflicto || '';
  // Solicitudes del mismo cliente, para elegir a mano
  r.candidatos = (r.NIT || r.CLIENTE) ? ventasLeer_('SOLICITUDES').filter(function (x) {
    return x.ESTADO !== 'Cerrada por desistimiento' && ventasClienteCoincide_(r.NIT, r.CLIENTE, x);
  }).map(function (x) { return { ID: x.ID, NUM_OT: x.NUM_OT || '', SC: x.CONSECUTIVO_FO004 || '', ESTADO: x.ESTADO, TIENE: !!x.URL_COTIZACION }; }) : [];
  return r;
}
// Cada referencia escrita (SC, OT, N° de cotización) debe llevar a la misma solicitud (mismo paquete)
function ventasDestinoCotizacion_(sc, ot, cot) {
  var lista = ventasLeer_('SOLICITUDES').filter(function (x) { return x.ESTADO !== 'Cerrada por desistimiento'; });
  var hall = [];
  if (ot) { var o = ventasBuscarOTFlexible_(ot); hall.push(['OT ' + ot, o]); }
  if (sc) { var ks = ventasClaveOT_(sc), s = lista.filter(function (x) { return x.CONSECUTIVO_FO004 && ventasClaveOT_(x.CONSECUTIVO_FO004) === ks; })[0]; hall.push(['SC ' + sc, s]); }
  var m = String(cot || '').match(/(\d{4})\s*-\s*(\d{3,5})/);
  if (m) { var id = m[1] + '-' + ('0000' + Number(m[2])).slice(-4); hall.push(['cotización ' + id, lista.filter(function (x) { return String(x.ID) === id; })[0]]); }
  else if (cot) {
    var kc = ventasClaveContrato_(cot), c = lista.filter(function (x) { return ventasClaveContrato_(x.NUM_COTIZACION_DOC) === kc || (kc.length >= 4 && ventasClaveContrato_(x.NUM_CONTRATO) === kc); })[0];
    if (c) hall.push(['cotización ' + cot, c]);
  }
  var encontrados = hall.filter(function (h) { return h[1]; });
  var noExiste = hall.filter(function (h) { return !h[1]; }).map(function (h) { return h[0]; });
  var ids = encontrados.map(function (h) { return h[1].ID; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  if (ids.length > 1) return { fila: null, conflicto: 'Las referencias no son del mismo paquete: ' + encontrados.map(function (h) { return h[0] + ' → ' + (h[1].NUM_OT || h[1].ID) + ' (' + h[1].CLIENTE + ')'; }).join('; ') + '.' };
  return { fila: encontrados.length ? encontrados[0][1] : null, conflicto: '', noExiste: noExiste };
}
function ventasInfoCotizacion_(s, nit, nombre) {
  return { ID: s.ID, NUM_OT: s.NUM_OT || '', SC: s.CONSECUTIVO_FO004 || '', CLIENTE: s.CLIENTE, CLIENTE_NIT: String(s.CLIENTE_NIT), ESTADO: s.ESTADO,
    VALOR_TOTAL: ventasNum_(s.VALOR_TOTAL) || 0, URL_COTIZACION: s.URL_COTIZACION || '', NUM_COTIZACION_DOC: s.NUM_COTIZACION_DOC || '',
    COINCIDE: (!nit && !nombre) || ventasClienteCoincide_(nit, nombre, s) };
}
/** Desde la pantalla: busca la solicitud por N° de SC, OT y/o cotización (deben ser del mismo paquete). */
function ventasConsultarCotizacion(sc, ot, cot, nit, nombre) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var dest = ventasDestinoCotizacion_(String(sc || '').trim().toUpperCase(), String(ot || '').trim().toUpperCase(), String(cot || '').trim());
    if (dest.conflicto) throw new Error('PAQUETE_DISTINTO: ' + dest.conflicto);
    if (!dest.fila) throw new Error('No se encontró ' + ((dest.noExiste || []).join(', ') || 'la solicitud') + '.');
    var info = ventasInfoCotizacion_(dest.fila, nit, nombre);
    if (dest.noExiste && dest.noExiste.length) info.AVISO = 'No se encontró: ' + dest.noExiste.join(', ') + '.';
    return info;
  });
}
/**
 * Asocia la cotización cargada a su solicitud (y con ella a su SC y OT).
 * datos = { adjunto:{base64,mime,nombre}, NUM_COTIZACION, FECHA, CLIENTE, NIT, VALOR_SUBTOTAL, VALOR_IVA, VALOR_TOTAL, reemplazar }
 */
function ventasAsociarCotizacion(id, datos) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      datos = datos || {};
      var s = ventasBuscar_('SOLICITUDES', 'ID', id);
      if (!s) throw new Error('No existe la solicitud ' + id + '.');
      if ((datos.NIT || datos.CLIENTE) && !ventasClienteCoincide_(datos.NIT, datos.CLIENTE, s))
        throw new Error('CLIENTE_NO_COINCIDE: La cotización es de «' + datos.CLIENTE + '»' + (datos.NIT ? ' (NIT ' + datos.NIT + ')' : '') + ', pero la ' +
          (s.NUM_OT || 'solicitud ' + s.ID) + ' es de «' + s.CLIENTE + '» (NIT ' + s.CLIENTE_NIT + '). No pertenecen al mismo paquete.');
      if (s.URL_COTIZACION && !datos.reemplazar) throw new Error('YA_TIENE: La ' + (s.NUM_OT || 'solicitud ' + s.ID) + ' ya tiene una cotización cargada' + (s.NUM_COTIZACION_DOC ? ' (N° ' + s.NUM_COTIZACION_DOC + ')' : '') + '. Confirme si desea reemplazarla.');
      if (!datos.adjunto || !datos.adjunto.base64) throw new Error('Falta el archivo de la cotización.');
      ventasAsegurarColumnas_('SOLICITUDES');
      var carpeta = ventasCarpeta_(), it = carpeta.getFoldersByName('Cotizaciones');
      var sub = it.hasNext() ? it.next() : carpeta.createFolder('Cotizaciones');
      var nombre = 'GCV-FO-003 ' + (datos.NUM_COTIZACION || s.ID) + ' - ' + (s.NUM_OT ? s.NUM_OT + ' - ' : '') + String(datos.adjunto.nombre || 'cotizacion').replace(/[\\/:*?"<>|]+/g, '_');
      var url = sub.createFile(Utilities.newBlob(Utilities.base64Decode(datos.adjunto.base64), datos.adjunto.mime || 'application/pdf', nombre)).getUrl();
      var c = { URL_COTIZACION: url, NUM_COTIZACION_DOC: String(datos.NUM_COTIZACION || s.ID).trim(), F_ACTUALIZACION: ventasAhora_() };
      var total = ventasNum_(datos.VALOR_TOTAL);
      if (total) {
        c.VALOR_COTIZACION = total; c.VALOR_TOTAL = total;
        c.VALOR_SUBTOTAL = ventasNum_(datos.VALOR_SUBTOTAL) || (ventasNum_(datos.VALOR_IVA) ? total - ventasNum_(datos.VALOR_IVA) : total);
        c.VALOR_IVA = ventasNum_(datos.VALOR_IVA) || (c.VALOR_SUBTOTAL ? total - c.VALOR_SUBTOTAL : 0);
      }
      if (!s.F_COTIZADA && datos.FECHA) c.F_COTIZADA = ventasFecha_(datos.FECHA);
      ventasActualizarFila_('SOLICITUDES', s._fila, c);
      ventasLog_(id, 'Cotización ' + c.NUM_COTIZACION_DOC + ' cargada' + (s.NUM_OT ? ' · ' + s.NUM_OT : '') + (s.CONSECUTIVO_FO004 ? ' · ' + s.CONSECUTIVO_FO004 : ''), s.ESTADO, s.ESTADO,
        (total ? 'Valor ' + total + '. ' : '') + 'Documento: ' + url + (s.URL_COTIZACION ? ' (reemplaza la anterior)' : ''));
      return { ID: id, NUM_OT: s.NUM_OT || '', SC: s.CONSECUTIVO_FO004 || '', URL: url, VALOR_TOTAL: total || ventasNum_(s.VALOR_TOTAL) };
    });
  });
}

/** Lee las OT del registro GCV-FO-002 configurado (propiedad VENTAS_REGISTRO_FO002), desde la fila 5. */
function ventasLeerRegistroFO002() { seguridadRPC_();
  return ventasRespuesta_(function () {
    var regId = ventasProp_('VENTAS_REGISTRO_FO002');
    if (!regId) throw new Error('No está configurada la propiedad VENTAS_REGISTRO_FO002 (ID del registro GCV-FO-002). Copia y pega las filas del Excel.');
    var ss = SpreadsheetApp.openById(regId), sh = ss.getSheetByName('FORMATO') || ss.getSheets()[0];
    if (sh.getLastRow() < 5) return [];
    return sh.getRange(5, 1, sh.getLastRow() - 4, 8).getValues().filter(function (r) { return String(r[7]).trim(); }).map(function (r) {
      return { FECHA: r[0] instanceof Date ? ventasFmt_(r[0], 'yyyy-MM-dd') : String(r[0]), CLIENTE: String(r[1]).trim(), NIT: String(r[2]).trim(),
        REFERENCIA: String(r[3]).trim(), TIPO_SERVICIO: String(r[4]).trim(), SOLICITUD_CAL: String(r[5]).trim(), LUGAR: String(r[6]).trim(), OT: String(r[7]).trim() };
    });
  });
}

/* ============================ COTIZACIONES GCV-FO-003 V3 Y PORTAFOLIO GCV-FO-005 ============================
 * Primero se cotiza al cliente con los servicios del portafolio (precio e IVA), se genera el PDF con la hoja
 * membrete (en el navegador, con el membrete del portal) y después, desde la cotización, se crea la «Nueva solicitud».
 * Hojas: VENTAS_COTIZACIONES (una fila por cotización, ítems en ITEMS_JSON) y VENTAS_SERVICIOS (portafolio).
 * El portafolio solo lo modifican la Gerencia o el Administrador del sistema.
 */
var VENTAS_COT_ESTADOS = ['Emitida', 'Aceptada', 'No aceptada', 'Anulada', 'Solicitud creada'];
var VENTAS_COT_FORMATO = { codigo: 'GCV-FO-003', version: 'V3.09.2026' };
var VENTAS_COT_FIRMA = { nombre: 'Germán Camilo Dániel Puello', cargo: 'Gerente', contacto: 'Cel. 3134135143 / e-mail. gerencia@imcolmetric.com' };
var VENTAS_COT_INTRO = 'De acuerdo a su amable solicitud es para IMCOLMETRIC S.A.S un placer poner a su consideracion nuestra oferta de cotizacion de acuerdo a los requerimientos solicitados de la siguiente manera:';
var VENTAS_COT_CONDICIONES = [
  { titulo: "COMERCIALES:", items: [
    "1. Al aceptar esta cotización, se entenderá que el cliente ha leído y aceptado todas las condiciones dadas en esta.",
    "2. La propuesta NO INCLUYE gastos logísticos de desplazamiento y manutención del personal fuera de la ciudad de Neiva, Huila",
    "3. Los costos de envío y/o despacho no están incluidos en la oferta.",
    "4. Tiempo de ejecución (lunes a viernes) en las instalaciones del laboratorio de metrología:",
    "*Temperatura de contacto: 8 días hábiles",
    "*Temperatura y humedad relativa: 8 días hábiles",
    "*Instrumentos de pesaje de funcionamiento no automático: 8 días hábiles",
    "*Presión relativa: 8 días hábiles",
    "*Equipos biomédicos: 8 días hábiles",
    "*Servicios tercerizados: 15 días hábiles",
    "5. Los días hábiles cuenta a partir del día siguiente a la llegada del equipo a nuestras instalaciones.",
    "6. Cualquier cambio en la oferta actual generará una nueva cotización.",
    "7. Moneda: Pesos Colombianos",
    "8. Oferta válida por 15 días.",
    "9. Forma de pago: A convenir",
    "10. Cuenta corriente BANCO BANCOLOMBIA 45 40000 4207"
  ] },
  { titulo: "DEL O LOS EQUIPOS:", items: [
    "1.Todos los certificados de calibración son emitidos y entregados en medio magnético digital enviados al correo registrado en el formato de GCV-FO-004 SOLICITUD DE CALIBRACIÓN EQUIPOS. Si se requiere el certificado impreso, el costo por impresión (certificado) será de $25.000 + IVA, no incluye envíos.",
    "2. Si el equipo suministrado requiere intervención especial de equipos y/o sotfware, se debe confirmar con IMCOLMETRIC si ya posee dichas herramientas para evitar el retraso en la prestación de servicios.",
    "3. El equipo a calibrar debe tener una identificación única (serie o código) que lo diferencie de otros instrumentos de iguales características metrológicas. En caso de no tener dicha identificación, IMCOLMETRIC le asignará uno y será relacionado en en el certificado. También, el equipo debe estar operativo (se realiza una prueba para verificación de funcionabilidad) antes de la calibración, sino, se comunicará con el cliente para dar cierre al servicio o la continuidad de este, de acuerdo con la decisión tomada por el cliente. El equipo debe ser entregado con todos sus accesorios y si posee baterías, estas deben estar cargadas o con carga para operar el equipo adecuadamente según las recomendaciones del fabricante.",
    "4. El equipo es entregado con sticker y certificado de calibración.",
    "5. La calibración no incluye mantenimiento o limpieza interna del equipo. El cliente deberá garantizar la operatividad del equipo.",
    "6. El o los equipos enviados al laboratorio deberán ser enviados garantizando la integridad de este. IMCOLMETRIC no se hace responsable por equipos enviados por transportadora que no hayan sido empacados adecuadamente por parte del cliente."
  ] },
  { titulo: "DEL LABORATORIO:", items: [
    "1. La prestación del servicio se realiza por orden de llegada y de acuerdo con la disponibilidad del laboratorio.",
    "2. Imcolmetric se reserva el derecho a cambiar los tiempos de entrega en caso de alguna eventualidad o imprevisto. Estos tiempos serán consultados con el o los clientes afectados para acordar una nueva fecha de entrega si es necesario.",
    "3. Todos los servicios prestados son en las instalaciones de IMCOLMETRIC. Si el cliente requiere realizar calibraciones en sitio, este deberá asumir los gastos de desplazamiento y viáticos del personal de Imcolmetric para la ejecución de ese servicio.",
    "4. IMCOLMETRIC cuenta con personal profesional, integral y calificado para la prestación de los servicios.",
    "5. Cualquier modificación solicitada al certificado de calibración está sujeta a la aprobación y verificación de la información por parte de IMCOLMETRIC, de acuerdo con el formato de GCV-FO-004 SOLICITUD DE CALIBRACIÓN EQUIPOS y tendrá un costo de $25.000 + IVA  (no incluye envío).",
    "6. Si desea presenciar la calibración de sus equipos, por favor, escribir a metrologia@imcolmetric.com con dicha solicitud. Se programará un espacio para ver ÚNICAMENTE la calibración de sus equipos. Las fechas y horarios serán a discreción de IMCOLMETRIC para garantizar la confidencialidad de sus trabajos e información de otros clientes.",
    "7.  IMCOLMETRIC garantiza la confidencialidad acerca del trabajo realizado y el desempeño obtenido en sus calibraciones. La información suministrada por el cliente será utilizada para los fines establecidos en la prestación del servicio. Al aprobar esta cotización se aceptan los términos y condiciones que conforman la Política de Calidad, la Política de Imparcialidad y Confidencialidad de IMCOLMETRIC, y la Ley 1581:2012.",
    "8. Cuando IMCOLMETRIC sea requerido por ley o autorizado por las disposiciones contractuales, para revelar información confidencial, se notificará al cliente o a la persona interesada la información proporcionada, salvo que esté prohibido por ley",
    "9. En caso de presentarse quejas, reclamos, sugerencias o felicitaciones por parte del cliente se podrán comunicar al canal metrologia@imcolmetric.com",
    "10. El tiempo de retención documental para certificados, resultados, datos obtenidos de los equipos del cliente y cualquier otro será de un máximo de 2 años, excepto, cuando se haya acordado otro diferente con el cliente.",
    "11. Para calibraciones en sitio se acordará con el cliente la realización de cada uno de los servicios solicitados. El tiempo de ejecución del servicio variará de acuerdo con las condiciones comerciales ofertadas, disponibilidad, condiciones del área (ambientales o estructurales), entre otras."
  ] },
  { titulo: "DEL CLIENTE:", items: [
    "1. Los equipos enviados al laboratorio deben estar aprobados por el área comercial y deben ser parte de una cotización aceptada por el cliente. Sin ello, el laboratorio de IMCOLMETRIC se reserva el derecho de prestar sus servicios.",
    "2. La aprobación de esta cotización se dará por medio orden de compra y/o servicio, o aceptación entre las dos partes. Si las partes lo consideran necesario, se emitirá contrato de acuerdo con las condiciones comerciales pactadas en esta cotización.",
    "3. El cliente deberá entregar los manuales de operación y/o servicio si IMCOLMETRIC los solicita para la ejecución del servicio.",
    "4. El cliente no deberá estar en mora y/o haber pagado el o los anticipos para efectuar el servicio solicitado.",
    "5. Si el cliente requiere declaración de conformidad en su certificado de calibración, este debe comunicarlo a través del formato GCV-FO-004 Solicitud calibración de equipos"
  ] },
  { titulo: "DE CALIBRACIÓN EQUIPOS:", items: [
    "1. Por defecto, al realizar la declaración de conformidad solicitado previamente por el cliente, el laboratorio hace referencia a las especificaciones del fabricante, norma, o requisitos declarados por este y se determina de acuerdo con la norma ILAC G8:09 2019, donde la incertidumbre de medición será |Error| ≤  EMP. La regla aplica a los resultados numéricos que se muestran el la columna Pasa/Falla del certificado de calibración.",
    "2. Tipos de declaración de conformidad (PASA/FALLA)",
    "2.1. Declaración Binaria de Aceptación Simple con nivel de riesgo de hasta el 50%: En esta regla, la incertidumbre no se tiene en cuenta para la declaración de conformidad, así, si el dato se sitúa sobre el límite de aceptación ya sea positivo o negativo, aproximadamente el 50% de la incertidumbre podría estar fuera de especificaciones, por eso se maneja un nivel de riesgo de hasta el 50% de una falsa aceptación o un falso rechazo, y para esto, la incertidumbre debe ser menor o igual a un tercio del error máximo permisible establecido.",
    "2.2. Declaración Binaria con Zona de Seguridad con nivel de riesgo ≤ 2,5% de riesgo global) y Zona de Seguridad W (Ancho de banda) = U (Incertidumbre Expandida): En esta regla, la incertidumbre no se tiene en cuenta para la declaración de conformidad, sin embargo, la zona de seguridad W, que tiene el mismo valor de la incertidumbre expandida al 95% de nivel de confianza, marca los nuevos límites de aceptación para el dato evaluado, así, si el dato sobrepasa la zona de seguridad es rechazado.",
    "3. El cliente deberá garantizar las condiciones ambientales del sitio de calibración si se realiza en las instalaciones de este.\n*Temperatura entre 18 °C a 27 °C con una variación no mayor a 1°C\n*Humedad entre 20 %HR a 80 %HR"
  ] },
  { titulo: "DEVOLUCIONES:", items: [
    "1. Las devoluciones de equipos, insumos, dispositivos médicos, entre otros se hará de acuerdo con la politíca de devolución de IMCOLMETRIC. Así mismo, solamente se realizará la devolución si se cumple en su totalidad las condiciones de dicha política y de acuerdo con el motivo justificado por el cliente.",
    "2. Para los servicios prestados por IMCOLMETRIC, el cliente tendrá hasta 3 días hábiles para realizar reclamaciones sobre este, siempre y cuando sean justificables."
  ] }
];
function ventasCotRed_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ventasCotPublica_(c) {
  var items = [];
  try { items = JSON.parse(c.ITEMS_JSON || '[]'); } catch (e) { }
  return { numero: String(c.NUMERO), fecha: ventasFmt_(c.FECHA), nit: String(c.CLIENTE_NIT || ''), cliente: c.CLIENTE || '', direccion: c.DIRECCION || '',
    ciudad: c.CIUDAD || '', contacto: c.CONTACTO || '', telefono: String(c.TELEFONO || ''), correo: c.CORREO || '', correoCertificado: c.CORREO_CERTIFICADO || '',
    referencia: c.REFERENCIA || '', items: items, subtotal: ventasNum_(c.SUBTOTAL), iva: ventasNum_(c.IVA), total: ventasNum_(c.TOTAL),
    observaciones: c.OBSERVACIONES || '', estado: c.ESTADO || 'Emitida', motivo: c.MOTIVO_ESTADO || '', idSolicitud: c.ID_SOLICITUD || '', urlPdf: c.URL_PDF || '',
    creadoPor: c.CREADO_POR || '', actualizadoPor: c.ACTUALIZADO_POR || '' };
}
function ventasPortafolio_() {
  return ventasLeer_('SERVICIOS').map(function (s) {
    var v = ventasNum_(s.VALOR), p = s.IVA_PCT === '' || s.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : ventasNum_(s.IVA_PCT);
    return { CODIGO: String(s.CODIGO || ''), MAGNITUD: s.MAGNITUD || '', DESCRIPCION: s.DESCRIPCION || '', VALOR: v, IVA_PCT: p,
      TOTAL: ventasCotRed_(v * (1 + p / 100)), TIPO_SERVICIO: s.TIPO_SERVICIO || 'Propio', ACTIVO: String(s.ACTIVO || 'SI').toUpperCase() === 'NO' ? 'NO' : 'SI' };
  });
}
// El portafolio (precios) solo lo modifican la Gerencia y el Administrador del sistema
function ventasPuedePortafolio_() {
  var u = VENTAS_SESION || {};
  return ventasNorm_(u.usuario) === 'admin' || /^administrador/.test(ventasNorm_(u.cargo)) || /^gerent/.test(ventasNorm_(u.cargo));
}
function ventasExigirPortafolio_() {
  if (!ventasPuedePortafolio_()) throw new Error('Solo la Gerencia o el Administrador del sistema pueden modificar el portafolio de servicios.');
}
// Consecutivo «Cotización No. 2026-0001»: el mayor del año entre las cotizaciones del módulo y las ya cargadas en las solicitudes
function ventasCotSiguiente_(lista) {
  var anio = new Date().getFullYear(), max = 0;
  var mirar = function (n) { var m = String(n || '').trim().match(/^(\d{4})\s*-\s*(\d+)$/); if (m && Number(m[1]) === anio) max = Math.max(max, Number(m[2])); };
  (lista || ventasLeer_('COTIZACIONES')).forEach(function (c) { mirar(c.NUMERO); });
  ventasLeer_('SOLICITUDES').forEach(function (s) { mirar(s.NUM_COTIZACION_DOC); });
  return anio + '-' + ('000' + (max + 1)).slice(-4);
}
function ventasCotItems_(items) {
  return (items || []).map(function (it) {
    var cant = ventasNum_(it.CANTIDAD), vu = ventasNum_(it.VALOR_UNITARIO), pct = it.IVA_PCT === '' || it.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : ventasNum_(it.IVA_PCT);
    var sub = ventasCotRed_(cant * vu), iva = ventasCotRed_(sub * pct / 100);
    return { CODIGO: String(it.CODIGO || '').trim(), DESCRIPCION: String(it.DESCRIPCION || '').trim(), MAGNITUD: String(it.MAGNITUD || '').trim(),
      TIPO_SERVICIO: String(it.TIPO_SERVICIO || 'Propio').trim(), MARCA: String(it.MARCA || '').trim(), MODELO: String(it.MODELO || '').trim(),
      CANTIDAD: cant, VALOR_UNITARIO: vu, IVA_PCT: pct, SUBTOTAL: sub, IVA: iva, TOTAL: ventasCotRed_(sub + iva) };
  }).filter(function (it) { return it.DESCRIPCION; });
}
function ventasCorreoOk_(c) { return !c || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c).trim()); }

/** Cotizaciones, portafolio, condiciones y permisos para la pantalla de Cotizaciones. */
function ventasCotDatos() { seguridadRPC_();
  return ventasRespuesta_(function () {
    var lista = ventasLeer_('COTIZACIONES');
    return { cotizaciones: lista.map(ventasCotPublica_).reverse(), portafolio: ventasPortafolio_(), siguiente: ventasCotSiguiente_(lista),
      condiciones: VENTAS_COT_CONDICIONES, formato: VENTAS_COT_FORMATO, firma: VENTAS_COT_FIRMA, intro: VENTAS_COT_INTRO, estados: VENTAS_COT_ESTADOS,
      puedePortafolio: ventasPuedePortafolio_() };
  });
}
/** Crea o actualiza una cotización. d = { numero?, fecha, nit, cliente, direccion, ciudad, contacto, telefono, correo, correoCertificado, referencia, items, observaciones } */
function ventasCotGuardar(d) { seguridadRPC_();
  return ventasRespuesta_(function () {
    return ventasConLock_(function () {
      d = d || {};
      if (!String(d.nit || '').trim() || !String(d.cliente || '').trim()) throw new Error('Indique el NIT y el nombre del cliente.');
      var items = ventasCotItems_(d.items);
      if (!items.length) throw new Error('Agregue al menos un servicio a la cotización.');
      if (!ventasCorreoOk_(d.correoCertificado)) throw new Error('El correo de emisión del certificado no es válido.');
      var lista = ventasLeer_('COTIZACIONES'), actual = d.numero ? lista.filter(function (c) { return String(c.NUMERO) === String(d.numero); })[0] : null;
      if (d.numero && !actual) throw new Error('No existe la cotización ' + d.numero + '.');
      if (actual && (actual.ID_SOLICITUD || actual.ESTADO === 'Anulada')) throw new Error('La cotización ' + actual.NUMERO + ' ya está ' + (actual.ID_SOLICITUD ? 'unida a la solicitud ' + actual.ID_SOLICITUD : 'anulada') + ' y no se puede modificar.');
      var sub = 0, iva = 0; items.forEach(function (it) { sub += it.SUBTOTAL; iva += it.IVA; });
      var t = function (v) { return String(v || '').trim(); };
      var reg = { FECHA: ventasFecha_(d.fecha) || ventasAhora_(), CLIENTE_NIT: t(d.nit), CLIENTE: t(d.cliente), DIRECCION: t(d.direccion), CIUDAD: t(d.ciudad),
        CONTACTO: t(d.contacto), TELEFONO: t(d.telefono), CORREO: t(d.correo), CORREO_CERTIFICADO: t(d.correoCertificado), REFERENCIA: t(d.referencia),
        ITEMS_JSON: JSON.stringify(items), SUBTOTAL: ventasCotRed_(sub), IVA: ventasCotRed_(iva), TOTAL: ventasCotRed_(sub + iva), OBSERVACIONES: t(d.observaciones),
        ACTUALIZADO_POR: ventasUsuario_(), F_ACTUALIZACION: ventasAhora_() };
      if (actual) { reg.NUMERO = String(actual.NUMERO); ventasActualizarFila_('COTIZACIONES', actual._fila, reg); }
      else {
        reg.NUMERO = ventasCotSiguiente_(lista); reg.ESTADO = 'Emitida'; reg.CREADO_POR = ventasUsuario_(); reg.F_CREACION = ventasAhora_();
        var sh = ventasHoja_('COTIZACIONES'); sh.getRange('A:A').setNumberFormat('@');
        ventasInsertar_('COTIZACIONES', reg);
      }
      // El cliente queda registrado (o completado) en Ventas con su correo de emisión de certificados
      try { ventasUpsertCliente_({ NIT: reg.CLIENTE_NIT, NOMBRE: reg.CLIENTE, CONTACTO: reg.CONTACTO, TELEFONO: reg.TELEFONO, CORREO: reg.CORREO,
        DIRECCION: reg.DIRECCION, CIUDAD: reg.CIUDAD, CORREO_CERTIFICADO: reg.CORREO_CERTIFICADO, CONFIRMAR_NUEVO: true }); } catch (e) { Logger.log('Cliente no actualizado: ' + e.message); }
      return ventasCotPublica_(ventasBuscar_('COTIZACIONES', 'NUMERO', reg.NUMERO));
    });
  });
}
/** Guarda en Drive (carpeta de Ventas › Cotizaciones) el PDF de la cotización generado con la hoja membrete. */
function ventasCotGuardarPdf(numero, base64) { seguridadRPC_();
  return ventasRespuesta_(function () {
    var c = ventasBuscar_('COTIZACIONES', 'NUMERO', numero);
    if (!c) throw new Error('No existe la cotización ' + numero + '.');
    var carpeta = ventasCarpeta_(), it = carpeta.getFoldersByName('Cotizaciones');
    var sub = it.hasNext() ? it.next() : carpeta.createFolder('Cotizaciones');
    var nombre = VENTAS_COT_FORMATO.codigo + ' Cotización ' + c.NUMERO + ' - ' + String(c.CLIENTE).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
    var viejos = sub.getFilesByName(nombre);
    while (viejos.hasNext()) viejos.next().setTrashed(true);
    var url = sub.createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', nombre)).getUrl();
    ventasActualizarFila_('COTIZACIONES', c._fila, { URL_PDF: url });
    if (c.ID_SOLICITUD) { var s = ventasBuscar_('SOLICITUDES', 'ID', c.ID_SOLICITUD); if (s) ventasActualizarFila_('SOLICITUDES', s._fila, { URL_COTIZACION: url }); }
    return { url: url };
  });
}
/** Emitida · Aceptada · No aceptada · Anulada */
function ventasCotCambiarEstado(numero, estado, motivo) { seguridadRPC_();
  return ventasRespuesta_(function () {
    if (['Emitida', 'Aceptada', 'No aceptada', 'Anulada'].indexOf(estado) === -1) throw new Error('Estado no válido: ' + estado);
    var c = ventasBuscar_('COTIZACIONES', 'NUMERO', numero);
    if (!c) throw new Error('No existe la cotización ' + numero + '.');
    if (c.ID_SOLICITUD) throw new Error('La cotización ya está unida a la solicitud ' + c.ID_SOLICITUD + ': su seguimiento se hace en la solicitud.');
    if ((estado === 'No aceptada' || estado === 'Anulada') && !String(motivo || '').trim()) throw new Error('Indique el motivo.');
    ventasActualizarFila_('COTIZACIONES', c._fila, { ESTADO: estado, MOTIVO_ESTADO: String(motivo || '').trim(), ACTUALIZADO_POR: ventasUsuario_(), F_ACTUALIZACION: ventasAhora_() });
    return { numero: String(c.NUMERO), estado: estado };
  });
}
/** Agrega o modifica un servicio del portafolio. item = { CODIGO?, CODIGO_ORIGINAL?, MAGNITUD, DESCRIPCION, VALOR, IVA_PCT, TIPO_SERVICIO, ACTIVO } */
function ventasPortafolioGuardar(item) { seguridadRPC_();
  return ventasRespuesta_(function () {
    ventasExigirPortafolio_();
    return ventasConLock_(function () {
      item = item || {};
      var desc = String(item.DESCRIPCION || '').trim(), valor = ventasNum_(item.VALOR);
      if (!desc) throw new Error('Escriba la descripción del servicio.');
      if (valor < 0) throw new Error('El valor no puede ser negativo.');
      var lista = ventasLeer_('SERVICIOS'), original = String(item.CODIGO_ORIGINAL || '').trim();
      var actual = original ? lista.filter(function (s) { return String(s.CODIGO) === original; })[0] : null;
      var codigo = String(item.CODIGO || '').trim().toUpperCase();
      if (!codigo) {
        var max = 0; lista.forEach(function (s) { var m = String(s.CODIGO).match(/^S-(\d+)$/i); if (m) max = Math.max(max, Number(m[1])); });
        codigo = actual ? String(actual.CODIGO) : 'S-' + ('00' + (max + 1)).slice(-3);
      }
      var dup = lista.filter(function (s) { return String(s.CODIGO).toUpperCase() === codigo && (!actual || s._fila !== actual._fila); })[0];
      if (dup) throw new Error('Ya existe un servicio con el código ' + codigo + ' (' + dup.DESCRIPCION + ').');
      var reg = { CODIGO: codigo, MAGNITUD: String(item.MAGNITUD || '').trim(), DESCRIPCION: desc, VALOR: valor,
        IVA_PCT: item.IVA_PCT === '' || item.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : ventasNum_(item.IVA_PCT),
        TIPO_SERVICIO: String(item.TIPO_SERVICIO || 'Propio'), ACTIVO: String(item.ACTIVO || 'SI').toUpperCase() === 'NO' ? 'NO' : 'SI' };
      if (actual) ventasActualizarFila_('SERVICIOS', actual._fila, reg); else ventasInsertar_('SERVICIOS', reg);
      ventasLog_('', (actual ? 'Portafolio: servicio modificado ' : 'Portafolio: servicio agregado ') + codigo, '', '', desc + ' · $' + valor + ' + IVA ' + reg.IVA_PCT + '%');
      return ventasPortafolio_();
    });
  });
}
/** Quita un servicio del portafolio (las cotizaciones ya emitidas conservan su precio). */
function ventasPortafolioEliminar(codigo) { seguridadRPC_();
  return ventasRespuesta_(function () {
    ventasExigirPortafolio_();
    return ventasConLock_(function () {
      var s = ventasBuscar_('SERVICIOS', 'CODIGO', codigo);
      if (!s) throw new Error('No existe el servicio ' + codigo + '.');
      ventasEliminarFilas_('SERVICIOS', [s._fila]);
      ventasLog_('', 'Portafolio: servicio eliminado ' + codigo, '', '', String(s.DESCRIPCION));
      return ventasPortafolio_();
    });
  });
}
/** Agrega varios servicios de una vez (filas copiadas del Excel GCV-FO-005: descripción, valor, IVA). */
function ventasPortafolioImportar(items) { seguridadRPC_();
  return ventasRespuesta_(function () {
    ventasExigirPortafolio_();
    return ventasConLock_(function () {
      var lista = ventasLeer_('SERVICIOS'), max = 0, n = 0;
      lista.forEach(function (s) { var m = String(s.CODIGO).match(/^S-(\d+)$/i); if (m) max = Math.max(max, Number(m[1])); });
      var ya = lista.map(function (s) { return ventasNorm_(s.DESCRIPCION); });
      (items || []).forEach(function (it) {
        var desc = String(it.DESCRIPCION || '').trim(), valor = ventasNum_(it.VALOR);
        if (!desc || valor < 0 || ya.indexOf(ventasNorm_(desc)) !== -1) return;
        max++; n++; ya.push(ventasNorm_(desc));
        ventasInsertar_('SERVICIOS', { CODIGO: 'S-' + ('00' + max).slice(-3), MAGNITUD: String(it.MAGNITUD || '').trim(), DESCRIPCION: desc, VALOR: valor,
          IVA_PCT: it.IVA_PCT === '' || it.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : ventasNum_(it.IVA_PCT), TIPO_SERVICIO: String(it.TIPO_SERVICIO || 'Propio'), ACTIVO: 'SI' });
      });
      if (!n) throw new Error('No se agregó ningún servicio (las descripciones ya estaban en el portafolio o no tenían valor).');
      ventasLog_('', 'Portafolio: ' + n + ' servicios agregados desde Excel', '', '', '');
      return ventasPortafolio_();
    });
  });
}

/* ============================ GCV-FO-004 V2 EN LA «NUEVA SOLICITUD» ============================
 * Todos los campos del formato de solicitud de calibración de equipos quedan en la hoja VENTAS_FO004
 * (una fila por solicitud). Con el N° de cotización la solicitud se une a la cotización del módulo y,
 * si aún no tiene OT, se le asigna el consecutivo de la SC (la OT llevará el mismo número).
 */
var VENTAS_FO004_REGLAS = ['Aceptación Simple', 'ILAC G8', 'Sigma 3', 'Sigma 6'];
// Regla del formato → regla con que Ventas valida la conformidad (5.7.1)
var VENTAS_FO004_REGLA_VENTAS = { 'Aceptación Simple': 'Binaria de aceptación simple (riesgo hasta 50%)', 'ILAC G8': 'Binaria con zona de seguridad (riesgo ≤ 2,5%, W = U)' };
function ventasGuardarFO004_(id, f, conContrato) {
  var s = ventasBuscar_('SOLICITUDES', 'ID', id);
  if (!s) return {};
  ventasAsegurarColumnas_('SOLICITUDES');
  var res = {}, numero = String(f.NUM_COTIZACION || '').trim(), cambios = {};
  if (f.CORREO_CERTIFICADO) cambios.CORREO_CERTIFICADO = f.CORREO_CERTIFICADO;
  if (numero) {
    var c = ventasBuscar_('COTIZACIONES', 'NUMERO', numero);
    if (c && !c.ID_SOLICITUD && ventasClienteCoincide_(c.CLIENTE_NIT, c.CLIENTE, s)) {
      cambios.NUM_COTIZACION_DOC = String(c.NUMERO); cambios.VALOR_COTIZACION = ventasNum_(c.TOTAL);
      if (c.URL_PDF) cambios.URL_COTIZACION = c.URL_PDF;
      if (!s.F_COTIZADA) cambios.F_COTIZADA = ventasFecha_(c.FECHA) || ventasAhora_();
      if (!ventasNum_(s.VALOR_TOTAL)) { cambios.VALOR_SUBTOTAL = ventasNum_(c.SUBTOTAL); cambios.VALOR_IVA = ventasNum_(c.IVA); cambios.VALOR_TOTAL = ventasNum_(c.TOTAL); }
      ventasActualizarFila_('COTIZACIONES', c._fila, { ID_SOLICITUD: id, ESTADO: 'Solicitud creada', ACTUALIZADO_POR: ventasUsuario_(), F_ACTUALIZACION: ventasAhora_() });
      ventasLog_(id, 'Cotización ' + c.NUMERO + ' (GCV-FO-003) unida a la solicitud', s.ESTADO, s.ESTADO, 'Valor ' + ventasNum_(c.TOTAL) + (c.URL_PDF ? '. Documento: ' + c.URL_PDF : ''));
      res.cotizacion = String(c.NUMERO);
    } else if (!s.NUM_COTIZACION_DOC) cambios.NUM_COTIZACION_DOC = numero;   // cotización hecha fuera del módulo
  }
  // Número de consecutivo (lo asigna el asesor comercial): con cotización y sin OT, la SC toma el siguiente de la secuencia SC ↔ OT
  if (numero && !conContrato && !s.NUM_OT && !s.CONSECUTIVO_FO004) {
    var sc = ventasNumSC_(ventasSiguienteSecuencia_(id));
    cambios.CONSECUTIVO_FO004 = sc; res.sc = sc;
    ventasLog_(id, 'Consecutivo de la SC asignado: ' + sc + ' (GCV-FO-004)', s.ESTADO, s.ESTADO, 'La OT llevará el mismo número: ' + ventasOTDeN_(ventasPartesSC_(sc).n));
  }
  if (Object.keys(cambios).length) ventasActualizarFila_('SOLICITUDES', s._fila, cambios);
  s = ventasBuscar_('SOLICITUDES', 'ID', id);
  var reg = {};
  VENTAS_HOJAS.FO004.columnas.forEach(function (k) { reg[k] = f[k] === undefined || f[k] === null ? '' : String(f[k]).trim(); });
  reg.ID_SOLICITUD = id; reg.CONSECUTIVO = s.CONSECUTIVO_FO004 || s.NUM_OT || ''; reg.NUM_COTIZACION = numero || s.NUM_COTIZACION_DOC || (s.NUM_CONTRATO ? 'Contrato ' + s.NUM_CONTRATO : '');
  if (reg.FACT_CIERRE_CONTABLE) reg.FACT_CIERRE_CONTABLE = ventasFecha_(reg.FACT_CIERRE_CONTABLE) || reg.FACT_CIERRE_CONTABLE;
  reg.USUARIO = ventasUsuario_(); reg.FECHA = ventasAhora_();
  var ex = ventasBuscar_('FO004', 'ID_SOLICITUD', id);
  if (ex) ventasActualizarFila_('FO004', ex._fila, reg); else ventasInsertar_('FO004', reg);
  return res;
}

/* ============================ ENTRADA DESDE EL PORTAL =============================== */

/** Pantalla del módulo para el portal (index.html la muestra dentro de un marco). */
function ventasVista() { seguridadRPC_();
  return ventasVistaHtml_();
}

/**
 * Punto único de entrada desde la pantalla: valida que el usuario del portal esté activo,
 * lo deja como usuario de la sesión (bitácora y responsables) y ejecuta la función pedida.
 */
function ventasLlamar(usuario, fn, args) { seguridadRPC_();
  try {
    var u = ventasUsuariosPortal_().filter(function (x) { return ventasNorm_(x.usuario) === ventasNorm_(usuario); })[0];
    if (!u) return { ok: false, error: 'Tu usuario no está activo en el portal. Vuelve a ingresar al sistema.' };
    var funciones = {
      ventasCatalogos: ventasCatalogos, ventasTablero: ventasTablero, ventasListarSolicitudes: ventasListarSolicitudes,
      ventasDetalle: ventasDetalle, ventasCrearSolicitud: ventasCrearSolicitud, ventasActualizarSolicitud: ventasActualizarSolicitud,
      ventasGuardarEquipos: ventasGuardarEquipos, ventasModificarAlcance: ventasModificarAlcance, ventasModificarContrato: ventasModificarContrato,
      ventasVerVersion: ventasVerVersion, ventasRegistrarRevision: ventasRegistrarRevision, ventasGuardarConformidad: ventasGuardarConformidad,
      ventasCambiarEstado: ventasCambiarEstado, ventasRegistrarSeguimiento: ventasRegistrarSeguimiento, ventasAgregarNota: ventasAgregarNota,
      ventasGuardarTercerizado: ventasGuardarTercerizado, ventasGuardarCliente: ventasGuardarCliente, ventasListarClientes: ventasListarClientes,
      ventasHistorialCliente: ventasHistorialCliente, ventasListarPostventa: ventasListarPostventa, ventasRegistrarEncuesta: ventasRegistrarEncuesta,
      ventasVincularPQRSF: ventasVincularPQRSF, ventasCrearPostventa: ventasCrearPostventa, ventasEncuestaSemestral: ventasEncuestaSemestral,
      ventasGenerarFO001: ventasGenerarFO001, ventasGenerarFO002: ventasGenerarFO002, ventasGenerarFO003: ventasGenerarFO003, ventasGenerarFO004: ventasGenerarFO004,
      ventasImportarOT: ventasImportarOT, ventasLeerRegistroFO002: ventasLeerRegistroFO002,
      ventasVerificarCliente: ventasVerificarCliente, ventasListarContratos: ventasListarContratos, ventasGuardarContrato: ventasGuardarContrato,
      ventasImportarClientes: ventasImportarClientes, ventasLeerOTArchivo: ventasLeerOTArchivo, ventasLeerSolicitudArchivo: ventasLeerSolicitudArchivo,
      ventasVincularSC: ventasVincularSC, ventasUnirSolicitudAOT: ventasUnirSolicitudAOT, ventasConsultarPaquete: ventasConsultarPaquete,
      ventasDefinirRuta: ventasDefinirRuta, ventasRegistrarSC: ventasRegistrarSC, ventasPrepararSolicitud: ventasPrepararSolicitud,
      ventasOTsCliente: ventasOTsCliente, ventasReservarConsecutivo: ventasReservarConsecutivo, ventasLeerCotizacionArchivo: ventasLeerCotizacionArchivo, ventasPrepararCotizacion: ventasPrepararCotizacion,
      ventasConsultarCotizacion: ventasConsultarCotizacion, ventasAsociarCotizacion: ventasAsociarCotizacion,
      ventasCotDatos: ventasCotDatos, ventasCotGuardar: ventasCotGuardar, ventasCotGuardarPdf: ventasCotGuardarPdf, ventasCotCambiarEstado: ventasCotCambiarEstado,
      ventasPortafolioGuardar: ventasPortafolioGuardar, ventasPortafolioEliminar: ventasPortafolioEliminar, ventasPortafolioImportar: ventasPortafolioImportar
    };
    if (!funciones[fn]) return { ok: false, error: 'Acción no permitida: ' + fn };
    // Permisos del portal (hoja PERMISOS de Calidad): crear / editar en Ventas
    var accionPerm = { ventasCrearSolicitud: 'crear', ventasCrearPostventa: 'crear', ventasGuardarCliente: 'editar',
      ventasActualizarSolicitud: 'editar', ventasGuardarEquipos: 'editar', ventasModificarAlcance: 'editar', ventasModificarContrato: 'editar',
      ventasRegistrarRevision: 'editar', ventasGuardarConformidad: 'editar', ventasCambiarEstado: 'editar', ventasRegistrarSeguimiento: 'editar',
      ventasAgregarNota: 'editar', ventasGuardarTercerizado: 'editar', ventasRegistrarEncuesta: 'editar', ventasVincularPQRSF: 'editar',
      ventasEncuestaSemestral: 'crear', ventasGenerarFO001: 'editar', ventasGenerarFO002: 'editar', ventasGenerarFO003: 'editar', ventasGenerarFO004: 'editar', ventasImportarOT: 'crear',
      ventasGuardarContrato: 'editar', ventasImportarClientes: 'crear', ventasLeerOTArchivo: 'crear', ventasLeerSolicitudArchivo: 'crear',
      ventasVincularSC: 'editar', ventasUnirSolicitudAOT: 'eliminar', ventasDefinirRuta: 'editar', ventasRegistrarSC: 'editar', ventasPrepararSolicitud: 'crear',
      ventasLeerCotizacionArchivo: 'editar', ventasPrepararCotizacion: 'editar', ventasAsociarCotizacion: 'editar', ventasReservarConsecutivo: 'editar',
      ventasCotGuardar: 'crear', ventasCotGuardarPdf: 'editar', ventasCotCambiarEstado: 'editar',
      ventasPortafolioGuardar: 'editar', ventasPortafolioEliminar: 'editar', ventasPortafolioImportar: 'editar' }[fn];
    if (accionPerm && typeof exigirPermiso === 'function') exigirPermiso(usuario, 'ven', accionPerm);
    VENTAS_SESION = u;
    var r = funciones[fn].apply(null, args || []);
    return (r && typeof r === 'object' && 'ok' in r) ? r : { ok: true, data: ventasSerializar_(r) };
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/* ===================================== WEB APP ====================================== */

/** Entrada de la aplicación web del módulo. */
function ventasDoGet(e) { seguridadRPC_();
  return HtmlService.createHtmlOutput(ventasVistaHtml_())
    .setTitle('Ventas de Servicios - IMCOLMETRIC')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Abre el módulo como diálogo desde el menú del Google Sheets. */
function ventasAbrirDialogo() { seguridadRPC_();
  var html = HtmlService.createHtmlOutput(ventasVistaHtml_()).setWidth(1400).setHeight(850);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Ventas de Servicios - IMCOLMETRIC');
}

/** Agrega el menú "Ventas" (llamar desde el onOpen principal del proyecto). */
function ventasMenu() { seguridadRPC_();
  SpreadsheetApp.getUi().createMenu('Ventas')
    .addItem('Abrir módulo de Ventas', 'ventasAbrirDialogo')
    .addSeparator()
    .addItem('Instalar / actualizar hojas', 'ventasInstalar')
    .addItem('Revisar alertas ahora', 'ventasRevisarAlertas')
    .addItem('Probar WhatsApp', 'ventasProbarWhatsApp')
    .addToUi();
}
