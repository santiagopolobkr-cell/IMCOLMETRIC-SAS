/**
 * =====================================================================================
 *  IMCOLMETRIC S.A.S. · MÓDULO DE VENTAS · COTIZACIONES                Archivo: Cotizaciones.gs
 * =====================================================================================
 *  GCV-FO-003 V3.09.2026  Formato de cotizaciones (mismos campos y condiciones generales)
 *  GCV-FO-005             Portafolio de servicios con precios (hoja VENTAS_SERVICIOS, editable)
 *
 *  Flujo: primero se cotiza al cliente (ítems tomados del portafolio con su precio e IVA),
 *  se genera el PDF con la hoja membrete y, con la cotización, se crea la «Nueva solicitud»
 *  en Ventas. La cotización queda unida a la solicitud (número, valores y PDF).
 *
 *  Usa las funciones de Ventas.gs (ventasLeer_, ventasInsertar_, ventasActualizarFila_, ventasSS_ …)
 *  y no cambia ninguna de ellas. Todo lo de este archivo empieza por "cot" / "COT_".
 *  La pantalla está en index.html (botón «🧾 Cotizaciones» de la barra de Ventas).
 * =====================================================================================
 */

var COT_HOJA = 'VENTAS_COTIZACIONES';
var COT_COLUMNAS = ['NUMERO', 'FECHA', 'CLIENTE_NIT', 'CLIENTE', 'DIRECCION', 'CIUDAD', 'CONTACTO', 'TELEFONO', 'CORREO',
  'CORREO_CERTIFICADO', 'REFERENCIA', 'ITEMS_JSON', 'SUBTOTAL', 'IVA', 'TOTAL', 'OBSERVACIONES', 'ESTADO', 'MOTIVO_ESTADO',
  'ID_SOLICITUD', 'URL_PDF', 'CREADO_POR', 'F_CREACION', 'ACTUALIZADO_POR', 'F_ACTUALIZACION'];
var COT_ESTADOS = ['Emitida', 'Aceptada', 'No aceptada', 'Anulada', 'Solicitud creada'];
var COT_FORMATO = { codigo: 'GCV-FO-003', version: 'V3.09.2026', portafolio: 'GCV-FO-005' };
var COT_FIRMA = { nombre: 'Germán Camilo Dániel Puello', cargo: 'Gerente', contacto: 'Cel. 3134135143 / e-mail. gerencia@imcolmetric.com' };
var COT_INTRO = 'De acuerdo a su amable solicitud es para IMCOLMETRIC S.A.S un placer poner a su consideracion nuestra oferta de cotizacion de acuerdo a los requerimientos solicitados de la siguiente manera:';

// Condiciones generales del GCV-FO-003 V3 (se imprimen en cada cotización)
var COT_CONDICIONES = [
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
/* ------------------------------------ utilidades ------------------------------------ */

function cotHoja_() { return cotHojaDe_(COT_HOJA, COT_COLUMNAS); }
function cotHojaDe_(nombre, columnas) {
  var ss = ventasSS_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold').setBackground('#0b3d6b').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
  }
  var enc = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var faltan = columnas.filter(function (c) { return enc.indexOf(c) === -1; });
  if (faltan.length) sh.getRange(1, enc.filter(String).length + 1, 1, faltan.length).setValues([faltan]);
  return sh;
}

function cotLeer_() {
  var sh = cotHoja_(), ult = sh.getLastRow();
  if (ult < 2) return [];
  var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return sh.getRange(2, 1, ult - 1, enc.length).getValues().map(function (f, i) {
    var o = { _fila: i + 2 };
    enc.forEach(function (c, j) { o[c] = f[j]; });
    return o;
  }).filter(function (o) { return String(o.NUMERO).trim(); });
}

function cotEscribir_(fila, obj) {
  var sh = cotHoja_(), enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (!fila) { sh.appendRow(enc.map(function (c) { return obj[c] === undefined ? '' : obj[c]; })); return sh.getLastRow(); }
  var r = sh.getRange(fila, 1, 1, enc.length), v = r.getValues()[0];
  enc.forEach(function (c, j) { if (obj[c] !== undefined) v[j] = obj[c]; });
  r.setValues([v]);
  return fila;
}

// Agrega una columna a una hoja de Ventas si no la tiene (sin tocar VENTAS_HOJAS de Ventas.gs)
function cotAsegurarColumna_(clave, columna) {
  var sh = ventasHoja_(clave), enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (enc.indexOf(columna) === -1) sh.getRange(1, enc.filter(String).length + 1).setValue(columna).setFontWeight('bold').setBackground('#0b3d6b').setFontColor('#ffffff');
}

function cotUsuario_(usuario) {
  var u = usuarioSD(usuario);
  if (!u) throw new Error('Tu usuario no está activo en el portal. Vuelve a ingresar al sistema.');
  VENTAS_SESION = { nombre: u.nombre, usuario: u.usuario };   // bitácora de Ventas (VENTAS_HISTORIAL) con el usuario del portal
  return u;
}

// El portafolio (precios) solo lo modifican el Administrador del sistema y la Gerencia
function cotPuedePortafolio_(u) {
  return esAdministradorPerm(u) || /^gerent/.test(normalizar(u && u.cargo));
}

function cotNum_(v) { return typeof ventasNum_ === 'function' ? ventasNum_(v) : (Number(v) || 0); }
function cotRedondear_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function cotFecha_(v) { return v ? ventasFmt_(v, 'yyyy-MM-dd') : ''; }

function cotJSON_(fn) {
  try { return respuesta(true, ventasSerializar_(fn())); }
  catch (e) { console.error(e && e.stack ? e.stack : e); return respuesta(false, null, String(e && e.message ? e.message : e)); }
}

// Consecutivo «Cotización No. 2026-0001»: sigue al mayor del año entre las cotizaciones del módulo y las ya cargadas en Ventas
function cotSiguienteNumero_(lista) {
  var anio = new Date().getFullYear(), max = 0;
  var mirar = function (n) { var m = String(n || '').trim().match(/^(\d{4})\s*-\s*(\d+)$/); if (m && Number(m[1]) === anio) max = Math.max(max, Number(m[2])); };
  (lista || cotLeer_()).forEach(function (c) { mirar(c.NUMERO); });
  try { ventasLeer_('SOLICITUDES').forEach(function (s) { mirar(s.NUM_COTIZACION_DOC); }); } catch (e) { }
  return anio + '-' + ('000' + (max + 1)).slice(-4);
}

// Ítems: { CODIGO, DESCRIPCION, MAGNITUD, TIPO_SERVICIO, MARCA, MODELO, CANTIDAD, VALOR_UNITARIO, IVA_PCT } + calculados
function cotItems_(items) {
  return (items || []).map(function (it) {
    var cant = cotNum_(it.CANTIDAD) || 0, vu = cotNum_(it.VALOR_UNITARIO), pct = it.IVA_PCT === '' || it.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : cotNum_(it.IVA_PCT);
    var sub = cotRedondear_(cant * vu), iva = cotRedondear_(sub * pct / 100);
    return { CODIGO: String(it.CODIGO || '').trim(), DESCRIPCION: String(it.DESCRIPCION || '').trim(), MAGNITUD: String(it.MAGNITUD || '').trim(),
      TIPO_SERVICIO: String(it.TIPO_SERVICIO || 'Propio').trim(), MARCA: String(it.MARCA || '').trim(), MODELO: String(it.MODELO || '').trim(),
      CANTIDAD: cant, VALOR_UNITARIO: vu, IVA_PCT: pct, SUBTOTAL: sub, IVA: iva, TOTAL: cotRedondear_(sub + iva) };
  }).filter(function (it) { return it.DESCRIPCION; });
}

function cotPublica_(c) {
  var items = [];
  try { items = JSON.parse(c.ITEMS_JSON || '[]'); } catch (e) { }
  return { numero: String(c.NUMERO), fecha: cotFecha_(c.FECHA), nit: String(c.CLIENTE_NIT || ''), cliente: c.CLIENTE || '', direccion: c.DIRECCION || '',
    ciudad: c.CIUDAD || '', contacto: c.CONTACTO || '', telefono: String(c.TELEFONO || ''), correo: c.CORREO || '', correoCertificado: c.CORREO_CERTIFICADO || '',
    referencia: c.REFERENCIA || '', items: items, subtotal: cotNum_(c.SUBTOTAL), iva: cotNum_(c.IVA), total: cotNum_(c.TOTAL),
    observaciones: c.OBSERVACIONES || '', estado: c.ESTADO || 'Emitida', motivo: c.MOTIVO_ESTADO || '', idSolicitud: c.ID_SOLICITUD || '', urlPdf: c.URL_PDF || '',
    creadoPor: c.CREADO_POR || '', fCreacion: c.F_CREACION || '', actualizadoPor: c.ACTUALIZADO_POR || '', fActualizacion: c.F_ACTUALIZACION || '' };
}

function cotPortafolio_() {
  return ventasLeer_('SERVICIOS').map(function (s) {
    var v = cotNum_(s.VALOR), p = s.IVA_PCT === '' || s.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : cotNum_(s.IVA_PCT);
    return { CODIGO: String(s.CODIGO || ''), MAGNITUD: s.MAGNITUD || '', DESCRIPCION: s.DESCRIPCION || '', VALOR: v, IVA_PCT: p,
      TOTAL: cotRedondear_(v * (1 + p / 100)), TIPO_SERVICIO: s.TIPO_SERVICIO || 'Propio', ACTIVO: String(s.ACTIVO || 'SI').toUpperCase() === 'NO' ? 'NO' : 'SI' };
  });
}

/* --------------------------------- funciones del portal --------------------------------- */

/** Todo lo que necesita la pantalla: cotizaciones, portafolio, clientes, condiciones y permisos. */
function cotDatos(usuario) { seguridadRPC_();
  return cotJSON_(function () {
    var u = cotUsuario_(usuario), lista = cotLeer_();
    return {
      cotizaciones: lista.map(cotPublica_).reverse(),
      portafolio: cotPortafolio_(),
      clientes: ventasLeer_('CLIENTES').map(function (c) {
        return { NIT: String(c.NIT), NOMBRE: c.NOMBRE, CONTACTO: c.CONTACTO || '', TELEFONO: String(c.TELEFONO || ''), CORREO: c.CORREO || '',
          DIRECCION: c.DIRECCION || '', CIUDAD: c.CIUDAD || '', CORREO_CERTIFICADO: c.CORREO_CERTIFICADO || '' };
      }),
      magnitudes: Object.keys(VENTAS_CFG.MAGNITUDES), iva: VENTAS_CFG.IVA_DEFECTO, validez: VENTAS_CFG.DIAS_VALIDEZ_OFERTA,
      condiciones: COT_CONDICIONES, formato: COT_FORMATO, firma: COT_FIRMA, intro: COT_INTRO, estados: COT_ESTADOS,
      siguiente: cotSiguienteNumero_(lista), siguienteSC: cotSiguienteSC_(''), reglasFO004: COT_REGLAS_FO004, puedePortafolio: cotPuedePortafolio_(u), usuario: u.nombre
    };
  });
}

/** Crea o actualiza una cotización. d = { numero?, fecha, nit, cliente, direccion, ciudad, contacto, telefono, correo, correoCertificado, referencia, items, observaciones } */
function cotGuardar(usuario, d) { seguridadRPC_();
  var neg = negarPermiso(usuario, 'ven', d && d.numero ? 'editar' : 'crear'); if (neg) return neg;
  return cotJSON_(function () {
    var u = cotUsuario_(usuario);
    return ventasConLock_(function () {
      d = d || {};
      if (!String(d.nit || '').trim() || !String(d.cliente || '').trim()) throw new Error('Indique el NIT y el nombre del cliente.');
      var items = cotItems_(d.items);
      if (!items.length) throw new Error('Agregue al menos un ítem del portafolio a la cotización.');
      var correoCert = String(d.correoCertificado || '').trim();
      if (correoCert && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoCert)) throw new Error('El correo de emisión del certificado no es válido.');
      var lista = cotLeer_(), actual = d.numero ? lista.filter(function (c) { return String(c.NUMERO) === String(d.numero); })[0] : null;
      if (d.numero && !actual) throw new Error('No existe la cotización ' + d.numero + '.');
      if (actual && (actual.ID_SOLICITUD || actual.ESTADO === 'Anulada')) throw new Error('La cotización ' + actual.NUMERO + ' ya está ' + (actual.ID_SOLICITUD ? 'unida a la solicitud ' + actual.ID_SOLICITUD : 'anulada') + ' y no se puede modificar.');
      var sub = 0, iva = 0; items.forEach(function (it) { sub += it.SUBTOTAL; iva += it.IVA; });
      var reg = {
        FECHA: ventasFecha_(d.fecha) || ventasAhora_(), CLIENTE_NIT: String(d.nit).trim(), CLIENTE: String(d.cliente).trim(),
        DIRECCION: String(d.direccion || '').trim(), CIUDAD: String(d.ciudad || '').trim(), CONTACTO: String(d.contacto || '').trim(),
        TELEFONO: String(d.telefono || '').trim(), CORREO: String(d.correo || '').trim(), CORREO_CERTIFICADO: correoCert,
        REFERENCIA: String(d.referencia || '').trim(), ITEMS_JSON: JSON.stringify(items), SUBTOTAL: cotRedondear_(sub), IVA: cotRedondear_(iva),
        TOTAL: cotRedondear_(sub + iva), OBSERVACIONES: String(d.observaciones || '').trim(), ACTUALIZADO_POR: u.nombre, F_ACTUALIZACION: ventasAhora_()
      };
      if (actual) {
        reg.NUMERO = String(actual.NUMERO);
        if (actual.URL_PDF) reg.URL_PDF = actual.URL_PDF;   // el PDF se reemplaza al regenerarlo
        cotEscribir_(actual._fila, reg);
      } else {
        reg.NUMERO = cotSiguienteNumero_(lista); reg.ESTADO = 'Emitida'; reg.CREADO_POR = u.nombre; reg.F_CREACION = ventasAhora_();
        cotEscribir_(0, reg);
      }
      // El cliente queda registrado (o actualizado) en Ventas, con su correo de emisión del certificado
      try {
        var cli = ventasUpsertCliente_({ NIT: reg.CLIENTE_NIT, NOMBRE: reg.CLIENTE, CONTACTO: reg.CONTACTO, TELEFONO: reg.TELEFONO, CORREO: reg.CORREO,
          DIRECCION: reg.DIRECCION, CIUDAD: reg.CIUDAD, CONFIRMAR_NUEVO: true });
        if (correoCert) cotCorreoCliente_(cli.NIT, correoCert);
      } catch (e) { console.warn('Cliente no actualizado: ' + e.message); }
      return cotPublica_(cotLeer_().filter(function (c) { return String(c.NUMERO) === reg.NUMERO; })[0]);
    });
  });
}

/** Guarda en Drive (carpeta de Ventas › Cotizaciones) el PDF generado con la hoja membrete. */
function cotGuardarPdf(usuario, numero, base64) { seguridadRPC_();
  var neg = negarPermiso(usuario, 'ven', 'editar'); if (neg) return neg;
  return cotJSON_(function () {
    cotUsuario_(usuario);
    var c = cotLeer_().filter(function (x) { return String(x.NUMERO) === String(numero); })[0];
    if (!c) throw new Error('No existe la cotización ' + numero + '.');
    var carpeta = ventasCarpeta_(), it = carpeta.getFoldersByName('Cotizaciones');
    var sub = it.hasNext() ? it.next() : carpeta.createFolder('Cotizaciones');
    var nombre = COT_FORMATO.codigo + ' Cotización ' + c.NUMERO + ' - ' + String(c.CLIENTE).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
    var viejos = sub.getFilesByName(nombre);
    while (viejos.hasNext()) viejos.next().setTrashed(true);
    var url = sub.createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', nombre)).getUrl();
    cotEscribir_(c._fila, { URL_PDF: url });
    if (c.ID_SOLICITUD) {
      var s = ventasBuscar_('SOLICITUDES', 'ID', c.ID_SOLICITUD);
      if (s) ventasActualizarFila_('SOLICITUDES', s._fila, { URL_COTIZACION: url });
    }
    return { url: url };
  });
}

/** Aceptada · No aceptada · Anulada · Emitida (reabrir). */
function cotCambiarEstado(usuario, numero, estado, motivo) { seguridadRPC_();
  var neg = negarPermiso(usuario, 'ven', 'editar'); if (neg) return neg;
  return cotJSON_(function () {
    var u = cotUsuario_(usuario);
    if (['Emitida', 'Aceptada', 'No aceptada', 'Anulada'].indexOf(estado) === -1) throw new Error('Estado no válido: ' + estado);
    var c = cotLeer_().filter(function (x) { return String(x.NUMERO) === String(numero); })[0];
    if (!c) throw new Error('No existe la cotización ' + numero + '.');
    if (c.ID_SOLICITUD) throw new Error('La cotización ya está unida a la solicitud ' + c.ID_SOLICITUD + ': su seguimiento se hace en Ventas.');
    if ((estado === 'No aceptada' || estado === 'Anulada') && !String(motivo || '').trim()) throw new Error('Indique el motivo.');
    cotEscribir_(c._fila, { ESTADO: estado, MOTIVO_ESTADO: String(motivo || '').trim(), ACTUALIZADO_POR: u.nombre, F_ACTUALIZACION: ventasAhora_() });
    return { numero: String(c.NUMERO), estado: estado };
  });
}

/* ------------------- GCV-FO-004 Solicitud de calibración de equipos («Nueva solicitud») ------------------- */

var COT_FO004 = { codigo: 'GCV-FO-004', version: 'V2.03.2026' };
var COT_REGLAS_FO004 = ['Aceptación Simple', 'ILAC G8', 'Sigma 3', 'Sigma 6'];
var COT_HOJA_FO004 = 'VENTAS_FO004';
// Un registro por solicitud con todos los campos del GCV-FO-004 V2 que no tienen columna propia en VENTAS_SOLICITUDES
var COT_COLUMNAS_FO004 = ['ID_SOLICITUD', 'CONSECUTIVO', 'NUM_COTIZACION',
  'CERT_NOMBRE', 'CERT_DIRECCION', 'CERT_CIUDAD', 'CERT_CONTACTO', 'CERT_TELEFONO', 'CERT_CORREO',
  'REQUIERE_CONFORMIDAD', 'CONFORMIDAD_DOCUMENTO', 'REGLA_DECISION',
  'ENTREGA_MISMA_DIRECCION', 'ENTREGA_NOMBRE', 'ENTREGA_DIRECCION', 'ENTREGA_CIUDAD', 'ENTREGA_TELEFONO', 'ENTREGA_CORREO',
  'SITIO_CONTACTO', 'SITIO_DIRECCION', 'SITIO_TELEFONO', 'SITIO_CORREO',
  'FACT_NOMBRE', 'FACT_NIT', 'FACT_TELEFONO', 'FACT_CORREO', 'FACT_CIERRE_CONTABLE',
  'TERCERIZADO_A_IMC', 'USUARIO', 'FECHA'];

function cotSiguienteSC_(id) {
  try { return ventasNumSC_(ventasSiguienteSecuencia_(id || '')); } catch (e) { return ''; }
}

/** Datos del GCV-FO-004 de una solicitud (para consultarlos). */
function cotLeerFO004(usuario, idSolicitud) { seguridadRPC_();
  return cotJSON_(function () {
    cotUsuario_(usuario);
    var sh = cotHojaDe_(COT_HOJA_FO004, COT_COLUMNAS_FO004), ult = sh.getLastRow();
    if (ult < 2) return null;
    var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], f = sh.getRange(2, 1, ult - 1, enc.length).getValues()
      .filter(function (r) { return String(r[0]) === String(idSolicitud); })[0];
    if (!f) return null;
    var o = {}; enc.forEach(function (c, j) { o[c] = f[j]; }); return o;
  });
}

/**
 * Después de registrar la «Nueva solicitud»: guarda los campos del GCV-FO-004, el correo de emisión de certificados,
 * une la cotización (si es del módulo) y asigna el número de consecutivo (SC) cuando la solicitud viene con cotización.
 * d = { NUM_COTIZACION, CORREO_CERTIFICADO, ...COT_COLUMNAS_FO004 }
 */
function cotGuardarFO004(usuario, idSolicitud, d) { seguridadRPC_();
  return cotJSON_(function () {
    var u = cotUsuario_(usuario);
    return ventasConLock_(function () { return cotGuardarFO004_(u, idSolicitud, d || {}); });
  });
}
// Compatibilidad: une la cotización y guarda el correo
function cotVincularSolicitud(usuario, numero, idSolicitud, correoCertificado) { seguridadRPC_();
  return cotGuardarFO004(usuario, idSolicitud, { NUM_COTIZACION: numero, CORREO_CERTIFICADO: correoCertificado });
}
function cotGuardarFO004_(u, idSolicitud, d) {
  var s = ventasBuscar_('SOLICITUDES', 'ID', idSolicitud);
  if (!s) throw new Error('No existe la solicitud ' + idSolicitud + '.');
  var res = { id: idSolicitud };
  cotGuardarCorreoSolicitud_(s, d.CORREO_CERTIFICADO || d.ENTREGA_CORREO);
  var numero = String(d.NUM_COTIZACION || '').trim();
  ventasAsegurarColumnas_('SOLICITUDES');
  if (numero) {
    var c = cotLeer_().filter(function (x) { return String(x.NUMERO) === numero; })[0];
    if (c) {
      if (c.ID_SOLICITUD && String(c.ID_SOLICITUD) !== String(idSolicitud)) throw new Error('La cotización ' + numero + ' ya está unida a la solicitud ' + c.ID_SOLICITUD + '.');
      if (!ventasClienteCoincide_(c.CLIENTE_NIT, c.CLIENTE, s)) throw new Error('La cotización es de «' + c.CLIENTE + '» y la solicitud ' + idSolicitud + ' es de «' + s.CLIENTE + '».');
      var cambios = { NUM_COTIZACION_DOC: String(c.NUMERO), VALOR_COTIZACION: cotNum_(c.TOTAL), F_ACTUALIZACION: ventasAhora_() };
      if (c.URL_PDF) cambios.URL_COTIZACION = c.URL_PDF;
      if (!s.F_COTIZADA) cambios.F_COTIZADA = ventasFecha_(c.FECHA) || ventasAhora_();
      if (!cotNum_(s.VALOR_TOTAL)) { cambios.VALOR_SUBTOTAL = cotNum_(c.SUBTOTAL); cambios.VALOR_IVA = cotNum_(c.IVA); cambios.VALOR_TOTAL = cotNum_(c.TOTAL); }
      ventasActualizarFila_('SOLICITUDES', s._fila, cambios);
      cotEscribir_(c._fila, { ID_SOLICITUD: idSolicitud, ESTADO: 'Solicitud creada', ACTUALIZADO_POR: u.nombre, F_ACTUALIZACION: ventasAhora_() });
      ventasLog_(idSolicitud, 'Cotización ' + c.NUMERO + ' (' + COT_FORMATO.codigo + ') unida a la solicitud', s.ESTADO, s.ESTADO,
        'Valor ' + cotNum_(c.TOTAL) + (c.URL_PDF ? '. Documento: ' + c.URL_PDF : ''));
      res.numero = String(c.NUMERO);
    } else if (!s.NUM_COTIZACION_DOC) {
      ventasActualizarFila_('SOLICITUDES', s._fila, { NUM_COTIZACION_DOC: numero });   // cotización hecha fuera del módulo
    }
  }
  // Número de consecutivo (lo asigna el asesor comercial): con cotización, la SC toma el siguiente de la secuencia SC ↔ OT
  s = ventasBuscar_('SOLICITUDES', 'ID', idSolicitud);
  if (numero && !s.NUM_OT && !s.CONSECUTIVO_FO004) {
    var sc = cotSiguienteSC_(idSolicitud);
    if (sc) {
      ventasActualizarFila_('SOLICITUDES', s._fila, { CONSECUTIVO_FO004: sc, F_ACTUALIZACION: ventasAhora_() });
      ventasLog_(idSolicitud, 'Consecutivo de la SC asignado: ' + sc + ' (' + COT_FO004.codigo + ')', s.ESTADO, s.ESTADO, 'La OT llevará el mismo número.');
      s.CONSECUTIVO_FO004 = sc;
    }
  }
  res.sc = s.CONSECUTIVO_FO004 || s.NUM_OT || '';
  // Registro GCV-FO-004
  var sh = cotHojaDe_(COT_HOJA_FO004, COT_COLUMNAS_FO004), enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var reg = {};
  COT_COLUMNAS_FO004.forEach(function (k) { reg[k] = d[k] === undefined || d[k] === null ? '' : String(d[k]).trim(); });
  reg.ID_SOLICITUD = idSolicitud; reg.CONSECUTIVO = res.sc; reg.NUM_COTIZACION = numero || s.NUM_COTIZACION_DOC || '';
  reg.USUARIO = u.nombre; reg.FECHA = ventasAhora_();
  if (reg.FACT_CIERRE_CONTABLE) reg.FACT_CIERRE_CONTABLE = ventasFecha_(reg.FACT_CIERRE_CONTABLE) || reg.FACT_CIERRE_CONTABLE;
  var ult = sh.getLastRow(), fila = 0;
  if (ult > 1) sh.getRange(2, 1, ult - 1, 1).getValues().forEach(function (r, i) { if (String(r[0]) === String(idSolicitud)) fila = i + 2; });
  var vals = enc.map(function (k) { return reg[k] === undefined ? '' : reg[k]; });
  if (fila) sh.getRange(fila, 1, 1, enc.length).setValues([vals]); else sh.appendRow(vals);
  return res;
}

// «Correo de Emisión de Certificado»: se guarda en la solicitud y en el cliente
function cotGuardarCorreoSolicitud_(s, correo) {
  correo = String(correo || '').trim();
  if (!correo) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('El correo de emisión del certificado no es válido.');
  cotAsegurarColumna_('SOLICITUDES', 'CORREO_CERTIFICADO');
  ventasActualizarFila_('SOLICITUDES', s._fila, { CORREO_CERTIFICADO: correo });
  cotCorreoCliente_(s.CLIENTE_NIT, correo);
}
function cotCorreoCliente_(nit, correo) {
  cotAsegurarColumna_('CLIENTES', 'CORREO_CERTIFICADO');
  var k = ventasClaveNit_(nit), c = ventasLeer_('CLIENTES').filter(function (x) { return ventasClaveNit_(x.NIT) === k; })[0];
  if (c) ventasActualizarFila_('CLIENTES', c._fila, { CORREO_CERTIFICADO: correo });
}

/** Correo de emisión del certificado guardado para cada cliente (para la «Nueva solicitud»). */
function cotCorreosCertificado(usuario) { seguridadRPC_();
  return cotJSON_(function () {
    cotUsuario_(usuario);
    var m = {};
    ventasLeer_('CLIENTES').forEach(function (c) { if (c.CORREO_CERTIFICADO) m[String(c.NIT)] = c.CORREO_CERTIFICADO; });
    return m;
  });
}

/* ------------------------------ Portafolio GCV-FO-005 ------------------------------ */

/** Agrega o modifica un servicio del portafolio. item = { CODIGO?, CODIGO_ORIGINAL?, MAGNITUD, DESCRIPCION, VALOR, IVA_PCT, TIPO_SERVICIO, ACTIVO } */
function cotPortafolioGuardar(usuario, item) { seguridadRPC_();
  return cotJSON_(function () {
    var u = cotUsuario_(usuario);
    if (!cotPuedePortafolio_(u)) throw new Error('Solo la Gerencia o el Administrador del sistema pueden modificar el portafolio de servicios.');
    return ventasConLock_(function () {
      item = item || {};
      var desc = String(item.DESCRIPCION || '').trim();
      if (!desc) throw new Error('Escriba la descripción del servicio.');
      var valor = cotNum_(item.VALOR);
      if (valor < 0) throw new Error('El valor no puede ser negativo.');
      var lista = ventasLeer_('SERVICIOS');
      var original = String(item.CODIGO_ORIGINAL || '').trim();
      var actual = original ? lista.filter(function (s) { return String(s.CODIGO) === original; })[0] : null;
      var codigo = String(item.CODIGO || '').trim().toUpperCase();
      if (!codigo) {
        var max = 0; lista.forEach(function (s) { var m = String(s.CODIGO).match(/^S-(\d+)$/i); if (m) max = Math.max(max, Number(m[1])); });
        codigo = actual ? String(actual.CODIGO) : 'S-' + ('00' + (max + 1)).slice(-3);
      }
      var dup = lista.filter(function (s) { return String(s.CODIGO).toUpperCase() === codigo && (!actual || s._fila !== actual._fila); })[0];
      if (dup) throw new Error('Ya existe un servicio con el código ' + codigo + ' (' + dup.DESCRIPCION + ').');
      var reg = { CODIGO: codigo, MAGNITUD: String(item.MAGNITUD || '').trim(), DESCRIPCION: desc, VALOR: valor,
        IVA_PCT: item.IVA_PCT === '' || item.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : cotNum_(item.IVA_PCT),
        TIPO_SERVICIO: String(item.TIPO_SERVICIO || 'Propio'), ACTIVO: String(item.ACTIVO || 'SI').toUpperCase() === 'NO' ? 'NO' : 'SI' };
      if (actual) ventasActualizarFila_('SERVICIOS', actual._fila, reg); else ventasInsertar_('SERVICIOS', reg);
      ventasLog_('', (actual ? 'Portafolio: servicio modificado ' : 'Portafolio: servicio agregado ') + codigo, '', '', desc + ' · $' + valor + ' + IVA ' + reg.IVA_PCT + '% · por ' + u.nombre);
      return cotPortafolio_();
    });
  });
}

/** Quita un servicio del portafolio (las cotizaciones ya emitidas conservan su precio). */
function cotPortafolioEliminar(usuario, codigo) { seguridadRPC_();
  return cotJSON_(function () {
    var u = cotUsuario_(usuario);
    if (!cotPuedePortafolio_(u)) throw new Error('Solo la Gerencia o el Administrador del sistema pueden modificar el portafolio de servicios.');
    return ventasConLock_(function () {
      var s = ventasLeer_('SERVICIOS').filter(function (x) { return String(x.CODIGO) === String(codigo); })[0];
      if (!s) throw new Error('No existe el servicio ' + codigo + '.');
      ventasEliminarFilas_('SERVICIOS', [s._fila]);
      ventasLog_('', 'Portafolio: servicio eliminado ' + codigo, '', '', String(s.DESCRIPCION) + ' · por ' + u.nombre);
      return cotPortafolio_();
    });
  });
}

/** Agrega varios servicios de una vez (filas copiadas del Excel GCV-FO-005: descripción, valor, IVA). */
function cotPortafolioImportar(usuario, items) { seguridadRPC_();
  return cotJSON_(function () {
    var u = cotUsuario_(usuario);
    if (!cotPuedePortafolio_(u)) throw new Error('Solo la Gerencia o el Administrador del sistema pueden modificar el portafolio de servicios.');
    return ventasConLock_(function () {
      var lista = ventasLeer_('SERVICIOS'), max = 0, n = 0;
      lista.forEach(function (s) { var m = String(s.CODIGO).match(/^S-(\d+)$/i); if (m) max = Math.max(max, Number(m[1])); });
      var existentes = lista.map(function (s) { return normalizar(s.DESCRIPCION); });
      (items || []).forEach(function (it) {
        var desc = String(it.DESCRIPCION || '').trim(), valor = cotNum_(it.VALOR);
        if (!desc || valor < 0 || existentes.indexOf(normalizar(desc)) !== -1) return;
        max++; n++; existentes.push(normalizar(desc));
        ventasInsertar_('SERVICIOS', { CODIGO: 'S-' + ('00' + max).slice(-3), MAGNITUD: String(it.MAGNITUD || '').trim(), DESCRIPCION: desc, VALOR: valor,
          IVA_PCT: it.IVA_PCT === '' || it.IVA_PCT == null ? VENTAS_CFG.IVA_DEFECTO : cotNum_(it.IVA_PCT), TIPO_SERVICIO: String(it.TIPO_SERVICIO || 'Propio'), ACTIVO: 'SI' });
      });
      if (!n) throw new Error('No se agregó ningún servicio (las descripciones ya estaban en el portafolio o no tenían valor).');
      ventasLog_('', 'Portafolio: ' + n + ' servicios agregados desde Excel', '', '', 'por ' + u.nombre);
      return cotPortafolio_();
    });
  });
}
