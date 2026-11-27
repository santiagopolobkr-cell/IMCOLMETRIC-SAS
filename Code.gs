const ID_HOJA = "1_njMVA5z2CEZojysjuIJSZWq_6HaFmY5aEx9JOb2cLQ";

// ============================================================
// GUARDA DE SEGURIDAD (ver Seguridad.gs)
// Todas las funciones del servidor empiezan con seguridadRPC_(): solo se ejecutan si la petición
// entró por rpc() (con sesión verificada) o si las ejecuta el propietario del proyecto
// (editor de Apps Script y disparadores). Una llamada directa desde el navegador se rechaza.
// ============================================================
var RPC_ = { activo: false, funcion: "", token: "", sesion: null, eliminados: [], propietario: undefined };
function seguridadRPC_() {
  if (RPC_.activo) return;
  if (RPC_.propietario === undefined) {
    try {
      const a = Session.getActiveUser().getEmail();
      RPC_.propietario = !!a && a === Session.getEffectiveUser().getEmail();
    } catch (e) { RPC_.propietario = false; }
  }
  if (!RPC_.propietario) throw new Error("ACCESO_DENEGADO: ingresa a la plataforma con tu usuario para usar esta función.");
}
// Las funciones que borran filas anotan lo borrado para la bitácora (BITACORA_AUDITORIA)
function anotarEliminado_(hoja, filas) {
  try {
    const nombre = typeof hoja === "string" ? hoja : (hoja && hoja.getName ? hoja.getName() : "");
    const enc = hoja && hoja.getRange && hoja.getLastColumn ? hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0] : [];
    (filas || []).forEach(f => {
      const o = {};
      f.forEach((v, i) => { if (v !== "" && v !== null) o[String(enc[i] || "Col" + (i + 1))] = v instanceof Date ? formatearFecha(v, "yyyy-MM-dd HH:mm") : v; });
      RPC_.eliminados.push({ hoja: nombre, datos: o });
    });
  } catch (e) {}
}

const NUMERO_WHATSAPP = "573153809151";
const APIKEY_CALLMEBOT = "1861285";

const DIAS_RECIENTE = 7; // ventana de días para considerar "recién actualizado"

// Encabezados de la hoja de mediciones mensuales
const ENCABEZADOS_DATOS = [
  "IndicadorID", "Mes", "Valor", "Acumulado", "Fecha Registro",
  "Variable1", "Variable2", "Analisis", "Usuario"
];

// ============================================================
// WEB APP
// ============================================================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('IMCOLMETRIC - SGC');
}

// ============================================================
// RESPUESTA
// ============================================================
function respuesta(ok, data, error) { seguridadRPC_();
  return JSON.stringify({ ok, data, error });
}
// ============================================================
// AUTENTICACIÓN Y USUARIOS
// Hoja "Usuarios": A ID | B Usuario | C Correo | D Contraseña | E Cargo |
//                  F Nombre Completo | G Estado | H EsProvisional | I Fecha Creación
// ============================================================
// Las columnas se ubican por el nombre del encabezado (fila 1), así funciona
// aunque cambie el orden. Si no encuentra un encabezado usa la posición por defecto.
const COLUMNAS_USUARIOS = {
  id:          { nombres: ["id"], defecto: 1 },
  usuario:     { nombres: ["usuario"], defecto: 2 },
  correo:      { nombres: ["correo", "email", "correo electronico"], defecto: 3 },
  contrasena:  { nombres: ["contrasena", "password", "clave"], defecto: 4 },
  cargo:       { nombres: ["cargo"], defecto: 5 },
  nombre:      { nombres: ["nombre completo", "nombre"], defecto: 6 },
  estado:      { nombres: ["estado"], defecto: 7 },
  provisional: { nombres: ["esprovisional", "es provisional", "provisional"], defecto: 8 }
};

// Devuelve { usuario: 2, provisional: 8, ... } (números de columna, base 1)
function columnasUsuarios(encabezados) { seguridadRPC_();
  const enc = (encabezados || []).map(normalizar);
  const cols = {};
  Object.keys(COLUMNAS_USUARIOS).forEach(k => {
    const def = COLUMNAS_USUARIOS[k];
    const i = enc.findIndex(e => def.nombres.indexOf(e) !== -1);
    cols[k] = i !== -1 ? i + 1 : def.defecto;
  });
  return cols;
}

// Valor de una celda de la fila por nombre de campo
function campo(fila, cols, nombre) { seguridadRPC_();
  return fila[cols[nombre] - 1];
}

// Inicializar hoja de Usuarios si no existe
function inicializarHojaUsuarios() { seguridadRPC_();
  const ss = SpreadsheetApp.openById(ID_HOJA);
  let hojaUsuarios = ss.getSheetByName("Usuarios") || ss.insertSheet("Usuarios");

  if (hojaUsuarios.getLastRow() === 0) {
    hojaUsuarios.appendRow([
      "ID", "Usuario", "Correo", "Contraseña", "Cargo",
      "Nombre Completo", "Estado", "EsProvisional", "Fecha Creación"
    ]);

    // Usuario por defecto: contraseña provisional (cifrada), se pide cambio al primer ingreso
    hojaUsuarios.appendRow([
      "USR-001", "admin", "admin@imcolmetric.com", hashContrasena_("admin123"),
      "Administrador", "Administrador Sistema", "Activo", "SI", new Date()
    ]);
  }

  return hojaUsuarios;
}

// Normaliza texto: sin espacios extremos, minúsculas y sin tildes
function normalizar(valor) { seguridadRPC_();
  return String(valor === null || valor === undefined ? "" : valor)
    .trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// "SI", "Si", "si", "Sí", "SÍ", true, 1 → provisional
function esValorSi(valor) { seguridadRPC_();
  if (valor === true || valor === 1) return true;
  const v = normalizar(valor);
  return v === "si" || v === "true" || v === "1";
}

// Busca la fila (1-based en la hoja) de un usuario activo; -1 si no existe
function buscarFilaUsuario(data, usuario) { seguridadRPC_();
  const u = normalizar(usuario);
  const cols = columnasUsuarios(data[0]);
  for (let i = 1; i < data.length; i++) {
    if (normalizar(campo(data[i], cols, "usuario")) === u) return i + 1;
  }
  return -1;
}

function usuarioActivo(fila, cols) { seguridadRPC_();
  return normalizar(campo(fila, cols, "estado")) === "activo";
}

// Validar login: compara la contraseña cifrada, bloquea tras varios intentos fallidos
// y crea la sesión en el servidor (el navegador solo guarda el token).
function validarLogin(usuario, contrasena) { seguridadRPC_();
  try {
    if (intentosLogin_(usuario) >= LOGIN_MAX_INTENTOS) {
      return respuesta(false, null, "Usuario bloqueado por " + LOGIN_MAX_INTENTOS + " intentos fallidos. Intenta de nuevo en " + LOGIN_MIN_BLOQUEO + " minutos o restaura tu contraseña.");
    }
    const hoja = inicializarHojaUsuarios();
    const data = hoja.getDataRange().getValues();

    const cols = columnasUsuarios(data[0]);
    const numFila = buscarFilaUsuario(data, usuario);
    const fila = numFila > 0 ? data[numFila - 1] : null;

    if (!fila || !usuarioActivo(fila, cols) || !verificarContrasena_(campo(fila, cols, "contrasena"), contrasena)) {
      intentosLogin_(usuario, true);
      return respuesta(false, null, "Usuario o contraseña incorrectos");
    }
    intentosLogin_(usuario, false);
    // Contraseña antigua guardada en texto: se cifra en este ingreso
    if (!esHashContrasena_(campo(fila, cols, "contrasena"))) guardarContrasena_(hoja, numFila, cols, contrasena);

    const provisional = esValorSi(campo(fila, cols, "provisional"));
    const sesion = {
      token: crearSesion_(campo(fila, cols, "usuario"), provisional),
      usuario: campo(fila, cols, "usuario"),
      nombre: campo(fila, cols, "nombre"),
      cargo: campo(fila, cols, "cargo"),
      correo: campo(fila, cols, "correo"),
      id: campo(fila, cols, "id"),
      esProvisional: provisional,
      timestamp: new Date().getTime()
    };

    return respuesta(true, sesion);

  } catch (e) {
    Logger.log("ERROR validarLogin: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Revisa la sesión guardada en el navegador: el token debe existir en el servidor, no estar vencido
// y ser del mismo usuario; el usuario debe seguir activo y sin contraseña provisional.
function verificarSesion(usuario) { seguridadRPC_();
  try {
    const s = RPC_.sesion;
    if (!s || normalizar(s.usuario) !== normalizar(usuario)) return respuesta(true, { valida: false, motivo: "expirada" });
    const est = estadoUsuario_(s.usuario);
    const valida = !!est && est.activo && !est.provisional && !s.provisional;
    return respuesta(true, { valida: valida, motivo: valida ? "" : (est && est.activo ? "provisional" : "inactivo") });
  } catch (e) {
    Logger.log("ERROR verificarSesion: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Cambio de contraseña provisional.
// Exige la contraseña actual para que nadie cambie la clave de otro usuario.
// Deja la columna EsProvisional en "NO".
function actualizarContraseña(usuario, contrasenaActual, contrasenaNueva) { seguridadRPC_();
  try {
    if (!contrasenaNueva || String(contrasenaNueva).length < 8) {
      return respuesta(false, null, "La nueva contraseña debe tener mínimo 8 caracteres");
    }
    if (String(contrasenaNueva) === String(contrasenaActual)) {
      return respuesta(false, null, "La nueva contraseña debe ser diferente a la provisional");
    }

    const hoja = inicializarHojaUsuarios();
    const data = hoja.getDataRange().getValues();
    const cols = columnasUsuarios(data[0]);
    const numFila = buscarFilaUsuario(data, usuario);

    if (intentosLogin_(usuario) >= LOGIN_MAX_INTENTOS) {
      return respuesta(false, null, "Usuario bloqueado por intentos fallidos. Intenta de nuevo en " + LOGIN_MIN_BLOQUEO + " minutos.");
    }
    if (numFila === -1 || !usuarioActivo(data[numFila - 1], cols)) {
      return respuesta(false, null, "Usuario no encontrado");
    }
    if (!verificarContrasena_(campo(data[numFila - 1], cols, "contrasena"), contrasenaActual)) {
      intentosLogin_(usuario, true);
      return respuesta(false, null, "La contraseña actual no es correcta");
    }

    guardarContrasena_(hoja, numFila, cols, contrasenaNueva);
    hoja.getRange(numFila, cols.provisional).setValue("NO");
    // La sesión del ingreso con contraseña provisional queda habilitada
    if (RPC_.sesion && RPC_.token && normalizar(RPC_.sesion.usuario) === normalizar(usuario)) {
      RPC_.sesion.provisional = false;
      RPC_.sesion.revisada = Date.now();
      sesGuardar_(RPC_.token, RPC_.sesion);
    }

    return respuesta(true, { mensaje: "Contraseña actualizada correctamente" });

  } catch (e) {
    Logger.log("ERROR actualizarContraseña: " + e.toString());
    return respuesta(false, null, "Error actualizando contraseña: " + e.toString());
  }
}

// Restaurar contraseña: si usuario y correo coinciden con un usuario activo,
// genera una contraseña provisional, marca EsProvisional = "SI" y la envía al correo.
// Siempre responde el mismo mensaje para no revelar qué usuarios existen.
function restaurarContraseña(usuario, correo) { seguridadRPC_();
  const mensaje = "Si el usuario y el correo coinciden con nuestros registros, " +
                  "recibirás una contraseña provisional en tu correo.";
  try {
    if (!usuario || !correo) {
      return respuesta(false, null, "Ingresa tu usuario y tu correo registrado");
    }

    const hoja = inicializarHojaUsuarios();
    const data = hoja.getDataRange().getValues();
    const cols = columnasUsuarios(data[0]);
    const numFila = buscarFilaUsuario(data, usuario);
    const fila = numFila > 0 ? data[numFila - 1] : null;

    if (!fila || !usuarioActivo(fila, cols) || normalizar(campo(fila, cols, "correo")) !== normalizar(correo)) {
      return respuesta(true, { mensaje: mensaje });
    }

    const provisional = generarContrasenaProvisional();
    guardarContrasena_(hoja, numFila, cols, provisional);
    hoja.getRange(numFila, cols.provisional).setValue("SI");
    cerrarSesionesDe_(campo(fila, cols, "usuario"));
    intentosLogin_(campo(fila, cols, "usuario"), false);   // la contraseña restaurada desbloquea el usuario

    MailApp.sendEmail({
      to: String(campo(fila, cols, "correo")).trim(),
      subject: "IMCOLMETRIC SGC - Restauración de contraseña",
      htmlBody:
        "<p>Hola " + (campo(fila, cols, "nombre") || campo(fila, cols, "usuario")) + ",</p>" +
        "<p>Se solicitó restaurar la contraseña de tu usuario <b>" + campo(fila, cols, "usuario") + "</b>.</p>" +
        "<p>Tu contraseña provisional es: <b style='font-size:16px;'>" + provisional + "</b></p>" +
        "<p>Al ingresar al sistema se te pedirá cambiarla por una nueva.</p>" +
        "<p>Si no solicitaste este cambio, comunícate con el administrador del sistema.</p>"
    });

    return respuesta(true, { mensaje: mensaje });

  } catch (e) {
    Logger.log("ERROR restaurarContraseña: " + e.toString());
    return respuesta(false, null, "No fue posible restaurar la contraseña. Intenta más tarde.");
  }
}

function generarContrasenaProvisional() { seguridadRPC_();
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const azar = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");   // aleatorio criptográfico
  let clave = "";
  for (let i = 0; i < 10; i++) {
    clave += caracteres.charAt(parseInt(azar.substr(i * 3, 3), 16) % caracteres.length);
  }
  return clave;
}

// Crear nuevo usuario (solo el Administrador; la contraseña asignada queda cifrada y provisional)
function crearUsuario(datos) { seguridadRPC_();
  try {
    if (!esAdministradorPerm(usuarioSesion_())) return respuesta(false, null, "Solo el Administrador puede crear usuarios");
    datos = datos || {};
    if (!String(datos.usuario || "").trim() || !String(datos.nombre || "").trim()) return respuesta(false, null, "Indica el usuario y el nombre");
    if (String(datos.contrasena || "").length < 8) return respuesta(false, null, "La contraseña asignada debe tener mínimo 8 caracteres");
    const hoja = inicializarHojaUsuarios();
    const data = hoja.getDataRange().getValues();

    // Verificar si usuario ya existe
    if (buscarFilaUsuario(data, datos.usuario) !== -1) {
      return respuesta(false, null, "El usuario ya existe");
    }

    const id = "USR-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMddHHmmss");

    hoja.appendRow([
      id,
      datos.usuario,
      datos.correo,
      hashContrasena_(datos.contrasena),
      datos.cargo,
      datos.nombre,
      "Activo",
      "SI", // contraseña asignada: se pide cambio al primer ingreso
      new Date()
    ]);

    return respuesta(true, { id, usuario: datos.usuario });
  } catch (e) {
    return respuesta(false, null, "Error creando usuario: " + e.toString());
  }
}

// ============================================================
// DOCUMENTOS
// ============================================================
function obtenerDocumentosTabla() { seguridadRPC_();

  const hoja = SpreadsheetApp.openById(ID_HOJA).getSheetByName("DOCUMENTOS");
  const data = hoja.getDataRange().getValues();

  const rows = data.slice(1).map((r, i) => ({
    fila: i + 2,
    url: String(r[10] || ""),
    codigo: r[8],
    nombre: r[9],
    version: r[7],
    fechadeaprobacion: formatearFecha(r[13], "dd/MM/yyyy"),
    proceso: r[1],
    tipoDocumento: r[3],
    estado: r[15],
    fileId: extraerIdDrive(r[10])
  }));

  return respuesta(true, rows);
}

// Cambiar el enlace (columna URL) de un documento del listado maestro.
// Solo el Administrador del sistema y el Coordinador de Calidad. Queda registrado en SD_Trazabilidad.
function puedeEditarUrlDocs_(u) {
  return !!u && (esAdministradorPerm(u) || /^coordinador(a)? de (gestion de )?(la )?calidad/.test(normalizar(u.cargo)));
}
function actualizarUrlDocumento(usuario, fila, codigo, url) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const u = usuarioSD(usuario);
    if (!puedeEditarUrlDocs_(u)) return respuesta(false, null, "Solo el Administrador del sistema y el Coordinador de Calidad pueden cambiar el enlace de un documento.");
    url = String(url || "").trim();
    if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(url)) return respuesta(false, null, "Pega el enlace del archivo en Google Drive (empieza por https://drive.google.com o https://docs.google.com).");
    const id = extraerIdDrive(url);
    if (!id) return respuesta(false, null, "El enlace no tiene el identificador del archivo. Copia el enlace con «Compartir › Copiar vínculo».");
    const ss = SpreadsheetApp.openById(ID_HOJA), hoja = ss.getSheetByName("DOCUMENTOS");
    fila = Number(fila);
    if (!hoja || !(fila >= 2) || fila > hoja.getLastRow()) return respuesta(false, null, "No se encontró el documento. Vuelve a abrir el listado.");
    const r = hoja.getRange(fila, 1, 1, 16).getValues()[0];
    if (String(r[8]).trim() !== String(codigo || "").trim()) return respuesta(false, null, "El listado cambió mientras lo tenías abierto. Vuelve a abrirlo e inténtalo de nuevo.");
    const antes = String(r[10] || "");
    if (antes.trim() === url) return respuesta(true, { url: url, fileId: id, sinCambios: true });
    hoja.getRange(fila, 11).setValue(url);
    try { registrarEventoSD(ss, String(r[8]), "Listado maestro", "Enlace del documento actualizado", "Actualizado", u,
      String(r[9]) + " (versión " + r[7] + "). Enlace anterior: " + (antes || "sin enlace"), url, String(r[15] || "")); } catch (e) { Logger.log("Traza URL documento: " + e); }
    return respuesta(true, { url: url, fileId: id });
  } catch (e) {
    return respuesta(false, null, e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// DOCUMENTOS ACTUALIZADOS RECIENTEMENTE
// ============================================================
function obtenerDocumentosActualizadosRecientes() { seguridadRPC_();

  const hoja = SpreadsheetApp.openById(ID_HOJA).getSheetByName("DOCUMENTOS");
  const data = hoja.getDataRange().getValues();

  const hoy = new Date();
  const limite = new Date();
  limite.setDate(hoy.getDate() - DIAS_RECIENTE);

  const recientes = data.slice(1)
    .filter(r => {
      const fecha = r[13]; // FECHA DE REVISIÓN (columna N)
      return fecha instanceof Date && fecha >= limite && fecha <= hoy;
    })
    .map(r => ({
      codigo: r[8],
      nombre: r[9],
      fechaActualizacion: Utilities.formatDate(r[13], Session.getScriptTimeZone(), "dd/MM/yyyy"),
      fileId: extraerIdDrive(r[10])
    }));

  return respuesta(true, recientes);
}

// ============================================================
// ALERTA DE DOCUMENTOS ACTUALIZADOS PARA VENTANA EMERGENTE
// ============================================================
function validarDocumentosActualizadosModal() { seguridadRPC_();

  const resultado = JSON.parse(obtenerDocumentosActualizadosRecientes());

  if (!resultado.ok) {
    return respuesta(false, null, "Error consultando documentos");
  }
  return respuesta(true, {
    mostrarModal: resultado.data.length > 0,
    cantidad: resultado.data.length,
    documentos: resultado.data
  });
}

// ============================================================
// SOLICITUD DOCUMENTAL - RUTA DE APROBACIÓN
// Solicitud → Revisión → Aprobación → Cierre → Publicación
//
// Hojas (se crean solas):
//  RUTAS_DOCUMENTALES  matriz Proceso / Revisor / Aprobador (editable: el sistema la lee siempre)
//  SD_Solicitudes      una fila por radicado (SD-2026-00001)
//  SD_Trazabilidad     cada acción: quién, cuándo, resultado, observaciones y archivo
// ============================================================
const SD_HOJA_RUTAS = "RUTAS_DOCUMENTALES";
const SD_HOJA_SOLICITUDES = "SD_Solicitudes";
const SD_HOJA_TRAZABILIDAD = "SD_Trazabilidad";
const SD_CARPETA = "IMCOLMETRIC - Solicitudes Documentales";
const SD_ESTADO_DOC_VIGENTE = "Vigente";
const SD_ESTADO_DOC_OBSOLETO = "Obsoleto";

// Codificación documental para creaciones: PROCESO-TIPO-NNN (ej: GH-FO-003, GH-PR-003)
// - El consecutivo es por proceso + tipo de documento, siempre de 3 dígitos.
// - El código se asigna solo cuando la creación queda aprobada por todos (sin reservas previas).
// - Un código está ocupado mientras tenga una versión no obsoleta en DOCUMENTOS; al anular un
//   documento su código queda disponible y se reutiliza (se asigna el número libre más bajo).
const SD_HOJA_CODIFICACION = "CODIFICACION_DOCUMENTAL";
const SD_DIGITOS_CONSECUTIVO = 3;

const SD_ESTADOS = {
  SOLICITADO: "SOLICITADO",              // revisión pendiente
  DEVUELTO: "DEVUELTO PARA AJUSTES",     // en manos del solicitante
  AJUSTADO: "AJUSTADO",                  // reenviado: revisión pendiente otra vez
  EN_ACEPTACION: "EN ACEPTACIÓN",        // primera etapa: los líderes de los procesos impactados aceptan el documento
  EN_APROBACION: "EN APROBACIÓN",        // revisión aprobada: aprobación pendiente
  CERRADO: "APROBADO CERRADO",
  RECHAZADO: "RECHAZADO"
};

// Matriz inicial (solo se usa para crear la hoja la primera vez)
const SD_RUTAS_INICIALES = [
  ["Direccionamiento Estratégico", "Coordinador de Calidad", "", "Gerente", ""],
  ["Gestión Humana", "Coordinador de Calidad", "", "Gerente", ""],
  ["Gestión de Equipos", "Director de Laboratorio", "", "Director de Laboratorio", ""],
  ["Gestión de Calidad", "Coordinador de Calidad", "", "Coordinador de Calidad", ""],
  ["Gestión de Ventas y Contratación", "Coordinador de Calidad", "", "Coordinador de Calidad", ""],
  ["Gestión Financiera", "Coordinador de Calidad", "", "Coordinador de Calidad", ""],
  ["Cadena de Suministros", "Director de Laboratorio", "", "Director de Laboratorio", ""],
  ["Gestión de la Infraestructura", "Coordinador de Calidad", "", "Coordinador de Calidad", ""],
  ["Gestión de las Tecnologías", "Coordinador de Calidad", "", "Coordinador de Calidad", ""],
  ["Seguimiento y Control", "Coordinador de Calidad", "", "Coordinador de Calidad", ""],
  ["Gestión de Compras", "Coordinador de Calidad", "", "Coordinador de Calidad", ""]
];

// [clave, encabezado] de SD_Solicitudes
const SD_COLUMNAS = [
  ["radicado", "Radicado"], ["fechaSolicitud", "Fecha Solicitud"], ["tipoSolicitud", "Tipo Solicitud"],
  ["proceso", "Proceso"], ["tipoDocumento", "Tipo Documento"], ["codigo", "Código"],
  ["nombreDocumento", "Nombre Documento"], ["justificacion", "Justificación"], ["observaciones", "Observaciones"],
  ["archivo", "Documento Actual"], ["solicitanteUsuario", "Solicitante Usuario"], ["solicitanteNombre", "Solicitante"],
  ["solicitanteCorreo", "Correo Solicitante"], ["estado", "Estado"], ["etapaActual", "Etapa Actual"],
  ["responsableActual", "Responsable Actual"], ["revisor", "Revisor"], ["aprobador", "Aprobador"],
  ["versionAprobada", "Versión Aprobada"], ["documentoOficial", "Documento Oficial"], ["aprobadoPor", "Aprobado Por"],
  ["fechaAprobacion", "Fecha Aprobación"], ["publicado", "Publicado"], ["fechaPublicacion", "Fecha Publicación"],
  ["fechaActualizacion", "Fecha Actualización"],
  // Procesos que impacta el documento (lista) y la aceptación de cada líder de proceso
  ["procesosImpacto", "Procesos que impacta"], ["aceptaciones", "Aceptación procesos impactados (detalle)"]
];
const SD_COLUMNAS_TRAZA = ["Radicado", "Fecha", "Etapa", "Evento", "Resultado", "Usuario", "Nombre", "Cargo",
                           "Observaciones", "Archivo", "Estado Resultante"];

// ---------- Hojas ----------
// Hoja de una versión anterior con menos columnas: agrega las columnas y sus encabezados al final
function asegurarColumnas_(hoja, encabezados) {
  try {
    if (hoja.getMaxColumns() < encabezados.length) hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezados.length - hoja.getMaxColumns());
  } catch (e) {}
  const ultima = hoja.getLastColumn();
  if (hoja.getLastRow() > 0 && ultima < encabezados.length) {
    hoja.getRange(1, ultima + 1, 1, encabezados.length - ultima).setValues([encabezados.slice(ultima)]).setFontWeight("bold");
  }
  return hoja;
}

function hojaSD(ss, nombre, encabezados, filasIniciales) { seguridadRPC_();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    // F-0001: dos pantallas pueden pedir la misma hoja a la vez; si la otra ya la creó, se usa esa
    try { hoja = ss.insertSheet(nombre); }
    catch (e) { SpreadsheetApp.flush(); hoja = ss.getSheetByName(nombre); if (!hoja) throw e; }
  }
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(encabezados);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight("bold");
    hoja.setFrozenRows(1);
    (filasIniciales || []).forEach(f => hoja.appendRow(f));
  }
  return asegurarColumnas_(hoja, encabezados);
}

function hojaRutasSD(ss) { seguridadRPC_();
  return hojaSD(ss, SD_HOJA_RUTAS,
    ["PROCESO", "REVISOR", "CORREO_REVISOR", "APROBADOR", "CORREO_APROBADOR", "LIDER_PROCESO", "CORREO_LIDER"], SD_RUTAS_INICIALES);
}
function hojaSolicitudesSD(ss) { seguridadRPC_(); return hojaSD(ss, SD_HOJA_SOLICITUDES, SD_COLUMNAS.map(c => c[1])); }
function hojaTrazabilidadSD(ss) { seguridadRPC_(); return hojaSD(ss, SD_HOJA_TRAZABILIDAD, SD_COLUMNAS_TRAZA); }

function leerRutasSD(ss) { seguridadRPC_();
  const hoja = hojaRutasSD(ss);
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({
      proceso: String(r[0]).trim(), revisor: String(r[1]).trim(), correoRevisor: String(r[2]).trim(),
      aprobador: String(r[3]).trim(), correoAprobador: String(r[4]).trim(),
      lider: String(r[5] || "").trim(), correoLider: String(r[6] || "").trim()
    }));
}

// Líder del proceso (acepta los documentos que impactan su proceso). Si la matriz no lo indica, es el aprobador del proceso.
function liderRutaSD(r) { seguridadRPC_();
  r = r || {};
  return r.lider ? { cargo: r.lider, correo: r.correoLider } : { cargo: r.aprobador || "", correo: r.correoAprobador || "" };
}

function procesosImpactoSD(sol) { seguridadRPC_();
  try { const l = JSON.parse(String(sol.procesosImpacto || "") || "[]"); return Array.isArray(l) ? l.map(x => String(x).trim()).filter(Boolean) : []; } catch (e) { return []; }
}
function aceptacionesSD(sol) { seguridadRPC_();
  try { const l = JSON.parse(String(sol.aceptaciones || "") || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
// ¿El actor es líder de alguno de los procesos impactados?
function esLiderImpactoSD(actor, sol, rutas) { seguridadRPC_();
  return procesosImpactoSD(sol).some(p => {
    const l = liderRutaSD((rutas || []).find(r => normalizar(r.proceso) === normalizar(p)));
    return cumpleRolSD(actor, l.cargo, l.correo);
  });
}

function rutaPorProcesoSD(ss, proceso) { seguridadRPC_();
  return leerRutasSD(ss).find(r => normalizar(r.proceso) === normalizar(proceso)) || null;
}

function leerSolicitudesSD(ss) { seguridadRPC_();
  const hoja = hojaSolicitudesSD(ss);
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, SD_COLUMNAS.length).getValues()
    .map((r, i) => {
      const o = { _fila: i + 2 };
      SD_COLUMNAS.forEach((c, j) => o[c[0]] = r[j]);
      return o;
    })
    .filter(o => o.radicado);
}

function buscarSolicitudSD(ss, radicado) { seguridadRPC_();
  const r = normalizar(radicado);
  return leerSolicitudesSD(ss).find(s => normalizar(s.radicado) === r) || null;
}

function guardarFilaSolicitudSD(ss, sol) { seguridadRPC_();
  const hoja = hojaSolicitudesSD(ss);
  const fila = SD_COLUMNAS.map(c => sol[c[0]] === undefined ? "" : sol[c[0]]);
  if (sol._fila) hoja.getRange(sol._fila, 1, 1, fila.length).setValues([fila]);
  else hoja.appendRow(fila);
}

function leerTrazabilidadSD(ss, radicado) { seguridadRPC_();
  const hoja = hojaTrazabilidadSD(ss);
  if (hoja.getLastRow() < 2) return [];
  const r = normalizar(radicado);
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, SD_COLUMNAS_TRAZA.length).getValues()
    .filter(f => normalizar(f[0]) === r)
    .map(f => ({
      fecha: f[1] instanceof Date ? f[1].getTime() : 0,
      fechaTexto: formatearFecha(f[1], "dd/MM/yyyy HH:mm"),
      etapa: f[2], evento: f[3], resultado: f[4], usuario: f[5], nombre: f[6], cargo: f[7],
      observaciones: f[8], archivo: f[9], estado: f[10]
    }))
    .sort((a, b) => a.fecha - b.fecha);
}

function registrarEventoSD(ss, radicado, etapa, evento, resultado, actor, observaciones, archivo, estado) { seguridadRPC_();
  hojaTrazabilidadSD(ss).appendRow([
    radicado, new Date(), etapa, evento, resultado || "",
    actor ? actor.usuario : "", actor ? actor.nombre : "Sistema", actor ? actor.cargo : "",
    observaciones || "", archivo || "", estado || ""
  ]);
}

// ---------- Usuarios y roles ----------
function usuarioSD(usuario) { seguridadRPC_();
  const data = inicializarHojaUsuarios().getDataRange().getValues();
  const cols = columnasUsuarios(data[0]);
  const numFila = buscarFilaUsuario(data, usuario);
  if (numFila === -1) return null;
  const fila = data[numFila - 1];
  if (!usuarioActivo(fila, cols)) return null;
  return {
    usuario: String(campo(fila, cols, "usuario")),
    nombre: String(campo(fila, cols, "nombre") || campo(fila, cols, "usuario")),
    cargo: String(campo(fila, cols, "cargo") || ""),
    correo: String(campo(fila, cols, "correo") || "").trim()
  };
}

function listaCorreosSD(texto) { seguridadRPC_();
  return String(texto || "").split(/[,;\s]+/).map(c => c.trim()).filter(c => c.indexOf("@") > 0);
}

// El usuario cumple el rol si su cargo coincide con el de la matriz o su correo está en la matriz
function cumpleRolSD(actor, cargoRuta, correosRuta) { seguridadRPC_();
  if (!actor) return false;
  if (cargoRuta && normalizar(actor.cargo) === normalizar(cargoRuta)) return true;
  return !!actor.correo && listaCorreosSD(correosRuta).some(c => normalizar(c) === normalizar(actor.correo));
}

// Correos de quien cumple un rol: los de la matriz o, si no hay, los usuarios activos con ese cargo
function correosRolSD(cargo, correosRuta) { seguridadRPC_();
  const deMatriz = listaCorreosSD(correosRuta);
  if (deMatriz.length) return deMatriz;
  const data = inicializarHojaUsuarios().getDataRange().getValues();
  const cols = columnasUsuarios(data[0]);
  return data.slice(1)
    .filter(f => usuarioActivo(f, cols) && normalizar(campo(f, cols, "cargo")) === normalizar(cargo))
    .map(f => String(campo(f, cols, "correo") || "").trim())
    .filter(c => c.indexOf("@") > 0);
}

// Solo el Administrador y el Coordinador de Calidad ven todas las solicitudes, sin importar el proceso
function veTodasSD(actor) { seguridadRPC_();
  if (!actor) return false;
  const cargo = normalizar(actor.cargo);
  return normalizar(actor.usuario) === "admin" || cargo.indexOf("administrador") === 0 ||
    /^coordinador(a)? de (gestion de )?(la )?calidad/.test(cargo);
}

// El usuario puede ver una solicitud si la hizo, si ve todas o si es revisor/aprobador de su proceso
function puedeVerSolicitudSD(actor, sol, ruta, rutas) { seguridadRPC_();
  if (!actor) return false;
  if (veTodasSD(actor)) return true;
  if (normalizar(actor.usuario) === normalizar(sol.solicitanteUsuario)) return true;
  ruta = ruta || {};
  if (rutas && esLiderImpactoSD(actor, sol, rutas)) return true;
  return cumpleRolSD(actor, ruta.revisor, ruta.correoRevisor) || cumpleRolSD(actor, ruta.aprobador, ruta.correoAprobador);
}

function rolesSD(ss, actor) { seguridadRPC_();
  const rutas = leerRutasSD(ss);
  return {
    revisor: rutas.some(r => cumpleRolSD(actor, r.revisor, r.correoRevisor)),
    aprobador: rutas.some(r => cumpleRolSD(actor, r.aprobador, r.correoAprobador)),
    lider: rutas.some(r => { const l = liderRutaSD(r); return cumpleRolSD(actor, l.cargo, l.correo); }),
    todas: veTodasSD(actor)
  };
}

function obtenerRolSD(usuario) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    return respuesta(true, rolesSD(ss, usuarioSD(usuario)));
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// ---------- Correo ----------
function enviarCorreoSD(destinatarios, asunto, mensajeHtml, sol) { seguridadRPC_();
  const lista = [...new Set((destinatarios || []).filter(Boolean))];
  if (!lista.length) return;
  let urlApp = "";
  try { urlApp = ScriptApp.getService().getUrl() || ""; } catch (e) {}
  const html =
    "<div style='font-family:Segoe UI,Arial,sans-serif;color:#0f1f33;max-width:560px'>" +
    "<div style='background:#003566;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0'>" +
    "<b>IMCOLMETRIC SGC</b> · Solicitud Documental</div>" +
    "<div style='border:1px solid #e3e9f0;border-top:none;padding:18px;border-radius:0 0 8px 8px'>" +
    mensajeHtml +
    (sol ? "<table style='margin-top:14px;font-size:13px;border-collapse:collapse'>" +
      filaCorreoSD("Radicado", sol.radicado) + filaCorreoSD("Documento", sol.nombreDocumento) +
      (sol.codigo ? filaCorreoSD("Código", sol.codigo) : "") +
      filaCorreoSD("Proceso", sol.proceso) + (procesosImpactoSD(sol).length ? filaCorreoSD("Procesos que impacta", procesosImpactoSD(sol).join(", ")) : "") +
      filaCorreoSD("Tipo de solicitud", sol.tipoSolicitud) +
      filaCorreoSD("Solicitante", sol.solicitanteNombre) + "</table>" : "") +
    (urlApp ? "<p style='margin-top:18px'><a href='" + urlApp + "' style='background:#2d9e5f;color:#fff;" +
      "padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:600'>Ingresar a la Visual IMCOLMETRIC SGC</a></p>" : "") +
    "</div></div>";
  try {
    MailApp.sendEmail({ to: lista.join(","), subject: asunto, htmlBody: html });
  } catch (e) {
    Logger.log("No se pudo enviar correo SD: " + e.toString());
  }
}

function filaCorreoSD(etiqueta, valor) { seguridadRPC_();
  return "<tr><td style='padding:3px 12px 3px 0;color:#6b7a8c'>" + etiqueta + "</td><td><b>" +
    escaparHtmlSD(valor) + "</b></td></tr>";
}

function escaparHtmlSD(v) { seguridadRPC_();
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Utilidades del flujo ----------
function siguienteRadicadoSD(solicitudes) { seguridadRPC_();
  const prefijo = "SD-" + new Date().getFullYear() + "-";
  let max = 0;
  solicitudes.forEach(s => {
    const n = String(s.radicado);
    if (n.indexOf(prefijo) === 0) max = Math.max(max, parseInt(n.slice(prefijo.length), 10) || 0);
  });
  return prefijo + ("0000" + (max + 1)).slice(-5);
}

function actualizarEtapaSD(sol, ruta) { seguridadRPC_();
  const e = SD_ESTADOS;
  if (ruta) { sol.revisor = ruta.revisor; sol.aprobador = ruta.aprobador; }
  if (sol.estado === e.SOLICITADO || sol.estado === e.AJUSTADO) {
    sol.etapaActual = "Revisión"; sol.responsableActual = sol.revisor;
  } else if (sol.estado === e.EN_ACEPTACION) {
    sol.etapaActual = "Aceptación procesos impactados";
    sol.responsableActual = aceptacionesSD(sol).filter(a => a.estado !== "ACEPTADO").map(a => a.lider + " (" + a.proceso + ")").join(", ");
  } else if (sol.estado === e.EN_APROBACION) {
    sol.etapaActual = "Aprobación"; sol.responsableActual = sol.aprobador;
  } else if (sol.estado === e.DEVUELTO) {
    sol.etapaActual = "Ajustes"; sol.responsableActual = sol.solicitanteNombre;
  } else {
    sol.etapaActual = sol.estado === e.CERRADO ? (esSiSD(sol.publicado) ? "Publicado" : "Publicación pendiente") : "Finalizada";
    sol.responsableActual = "";
  }
  sol.fechaActualizacion = new Date();
}

function esSiSD(v) { seguridadRPC_(); return normalizar(v) === "si"; }

function resumenSolicitudSD(s) { seguridadRPC_();
  return {
    radicado: s.radicado, fechaSolicitud: formatearFecha(s.fechaSolicitud, "dd/MM/yyyy"),
    tipoSolicitud: s.tipoSolicitud, proceso: s.proceso, tipoDocumento: s.tipoDocumento, codigo: s.codigo,
    nombreDocumento: s.nombreDocumento, solicitanteNombre: s.solicitanteNombre, estado: s.estado,
    etapaActual: s.etapaActual, responsableActual: s.responsableActual,
    publicado: esSiSD(s.publicado), fechaActualizacion: formatearFecha(s.fechaActualizacion, "dd/MM/yyyy")
  };
}

// Estado de cada etapa en el ciclo actual (desde la última solicitud o reenvío)
function etapasSD(sol, eventos) { seguridadRPC_();
  let inicio = 0;
  eventos.forEach((ev, i) => { if (ev.etapa === "Solicitud" || ev.etapa === "Ajuste") inicio = i; });
  const ciclo = eventos.slice(inicio);
  const ultimo = etapa => ciclo.filter(ev => ev.etapa === etapa).pop();
  const e = SD_ESTADOS;

  const armar = (etapa, cargo, activa) => {
    const ev = ultimo(etapa);
    return {
      etapa: etapa, cargo: cargo,
      estado: ev ? ev.resultado : (activa ? "PENDIENTE" : (sol.estado === e.RECHAZADO ? "NO APLICA" : "EN ESPERA")),
      fecha: ev ? ev.fechaTexto : "", responsable: ev ? ev.nombre : "", observaciones: ev ? ev.observaciones : ""
    };
  };
  return [
    armar("Revisión", sol.revisor, sol.estado === e.SOLICITADO || sol.estado === e.AJUSTADO),
    armar("Aprobación", sol.aprobador, sol.estado === e.EN_APROBACION)
  ];
}

// ---------- Codificación automática (solo creaciones) ----------
// Separa un código "GC-FO-011" en { proceso: "GC", tipo: "FO", numero: 11 }
function partesCodigoSD(codigo) { seguridadRPC_();
  const m = String(codigo || "").trim().toUpperCase().match(/^([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/);
  return m ? { proceso: m[1], tipo: m[2], numero: parseInt(m[3], 10) } : null;
}

// Aprende las siglas de los códigos existentes en DOCUMENTOS (la más usada por proceso y por tipo)
function siglasInferidasSD(ss) { seguridadRPC_();
  const conteo = { proceso: {}, tipo: {} };
  const hoja = ss.getSheetByName("DOCUMENTOS");
  if (hoja && hoja.getLastRow() > 1) {
    hoja.getDataRange().getValues().slice(1).forEach(r => {
      const p = partesCodigoSD(r[8]);
      if (!p) return;
      [["proceso", r[1], p.proceso], ["tipo", r[3], p.tipo]].forEach(([cat, nombre, sigla]) => {
        const n = normalizar(nombre);
        if (!n) return;
        conteo[cat][n] = conteo[cat][n] || {};
        conteo[cat][n][sigla] = (conteo[cat][n][sigla] || 0) + 1;
      });
    });
  }
  const masUsada = obj => Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0];
  const out = { proceso: {}, tipo: {} };
  ["proceso", "tipo"].forEach(cat => Object.keys(conteo[cat]).forEach(n => out[cat][n] = masUsada(conteo[cat][n])));
  return out;
}

// Hoja editable CATEGORIA | NOMBRE | SIGLA. Se crea con lo aprendido de DOCUMENTOS;
// si un proceso o tipo no tiene sigla, se agrega la fila vacía para que se complete.
function hojaCodificacionSD(ss, tiposConocidos) { seguridadRPC_();
  let hoja = ss.getSheetByName(SD_HOJA_CODIFICACION);
  const inferidas = siglasInferidasSD(ss);
  if (!hoja) {
    hoja = ss.insertSheet(SD_HOJA_CODIFICACION);
    hoja.appendRow(["CATEGORIA", "NOMBRE", "SIGLA"]);
    hoja.getRange(1, 1, 1, 3).setFontWeight("bold");
    hoja.setFrozenRows(1);
  }
  const filas = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 3).getValues() : [];
  // Completar siglas vacías que ya se pueden aprender de DOCUMENTOS
  filas.forEach((f, i) => {
    if (String(f[2]).trim()) return;
    const cat = normalizar(f[0]) === "proceso" ? "proceso" : "tipo";
    const sigla = inferidas[cat][normalizar(f[1])];
    if (sigla) { f[2] = sigla; hoja.getRange(i + 2, 3).setValue(sigla); }
  });
  const existe = (cat, nombre) => filas.some(f => normalizar(f[0]) === normalizar(cat) && normalizar(f[1]) === normalizar(nombre));
  const nuevas = [];
  leerRutasSD(ss).forEach(r => {
    if (!existe("Proceso", r.proceso)) nuevas.push(["Proceso", r.proceso, inferidas.proceso[normalizar(r.proceso)] || ""]);
  });
  (tiposConocidos || []).forEach(t => {
    if (t && !existe("Tipo de documento", t) && !nuevas.some(n => n[0] === "Tipo de documento" && normalizar(n[1]) === normalizar(t))) {
      nuevas.push(["Tipo de documento", t, inferidas.tipo[normalizar(t)] || ""]);
    }
  });
  if (nuevas.length) hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas);
  return { hoja: hoja, filas: filas.concat(nuevas), inferidas: inferidas };
}

function siglaSD(cod, categoria, nombre) { seguridadRPC_();
  const fila = cod.filas.find(f => normalizar(f[0]) === normalizar(categoria) && normalizar(f[1]) === normalizar(nombre));
  const sigla = fila ? String(fila[2]).trim().toUpperCase() : "";
  if (sigla) return sigla;
  return cod.inferidas[categoria === "Proceso" ? "proceso" : "tipo"][normalizar(nombre)] || "";
}

// Código libre más bajo para proceso + tipo (reutiliza los de documentos anulados)
function calcularCodigoSD(ss, proceso, tipoDocumento) { seguridadRPC_();
  const cod = hojaCodificacionSD(ss, [tipoDocumento]);
  const sp = siglaSD(cod, "Proceso", proceso);
  const st = siglaSD(cod, "Tipo de documento", tipoDocumento);
  const faltan = [];
  if (!sp) faltan.push("proceso \"" + proceso + "\"");
  if (!st) faltan.push("tipo de documento \"" + tipoDocumento + "\"");
  if (faltan.length) {
    return { codigo: "", mensaje: "Falta la sigla del " + faltan.join(" y del ") + " en la hoja " + SD_HOJA_CODIFICACION };
  }
  const prefijo = sp + "-" + st;
  const ocupados = {};
  codigosOcupadosSD(ss).forEach(c => {
    const p = partesCodigoSD(c);
    if (p && p.proceso + "-" + p.tipo === prefijo) ocupados[p.numero] = true;
  });
  let n = 1;
  while (ocupados[n]) n++;
  return { codigo: prefijo + "-" + ("000" + n).slice(-SD_DIGITOS_CONSECUTIVO), mensaje: "" };
}

// Códigos en uso: los que tienen al menos una versión no obsoleta en DOCUMENTOS
// (los de documentos anulados u obsoletos sin versión vigente quedan libres)
function codigosOcupadosSD(ss) { seguridadRPC_();
  const hoja = ss.getSheetByName("DOCUMENTOS");
  if (!hoja || hoja.getLastRow() < 2) return [];
  const obsoleto = normalizar(SD_ESTADO_DOC_OBSOLETO);
  return hoja.getDataRange().getValues().slice(1)
    .filter(r => String(r[8] || "").trim() && normalizar(r[15]) !== obsoleto)
    .map(r => String(r[8]).trim());
}

// ---------- Documentos que ya existen ----------
// Nombre comparable: sin tildes, mayúsculas, signos ni espacios repetidos
function nombreDocSD(v) { seguridadRPC_();
  return normalizar(v).replace(/[^a-z0-9]+/g, " ").trim();
}

// Documento vigente (no obsoleto) en DOCUMENTOS con el mismo nombre
function documentoExistenteSD(ss, nombre) { seguridadRPC_();
  const n = nombreDocSD(nombre);
  const hoja = ss.getSheetByName("DOCUMENTOS");
  if (!n || !hoja || hoja.getLastRow() < 2) return null;
  const obsoleto = normalizar(SD_ESTADO_DOC_OBSOLETO);
  const r = hoja.getDataRange().getValues().slice(1)
    .filter(f => String(f[8] || "").trim() && normalizar(f[15]) !== obsoleto && nombreDocSD(f[9]) === n).pop();
  return r ? { codigo: String(r[8]).trim(), nombre: String(r[9]).trim(), version: String(r[7]), proceso: String(r[1]).trim(),
               tipoDocumento: String(r[3]).trim(), url: String(r[10] || ""), estado: String(r[15] || "") } : null;
}

// Otra solicitud de creación en trámite para el mismo documento
function creacionEnTramiteSD(ss, nombre, excluirRadicado) { seguridadRPC_();
  const n = nombreDocSD(nombre);
  return leerSolicitudesSD(ss).find(s => s.tipoSolicitud === "Crear" && nombreDocSD(s.nombreDocumento) === n &&
    s.estado !== SD_ESTADOS.RECHAZADO && s.estado !== SD_ESTADOS.CERRADO &&
    normalizar(s.radicado) !== normalizar(excluirRadicado)) || null;
}

function mensajeDuplicadoSD(existente) { seguridadRPC_();
  return "El documento \"" + existente.nombre + "\" ya existe con el código " + existente.codigo +
    " (versión " + existente.version + "). La solicitud de creación no procede: valide su solicitud.";
}

// Rechaza automáticamente una creación cuyo documento ya existe y avisa al solicitante
function rechazarPorDuplicadoSD(ss, sol, ruta, existente, etapa, actor) { seguridadRPC_();
  const motivo = mensajeDuplicadoSD(existente);
  sol.estado = SD_ESTADOS.RECHAZADO;
  actualizarEtapaSD(sol, ruta);
  guardarFilaSolicitudSD(ss, sol);
  registrarEventoSD(ss, sol.radicado, etapa, "Solicitud rechazada: el documento ya existe", "RECHAZADO", actor, motivo, "", sol.estado);
  correoRechazoSD(sol, motivo);
  return motivo;
}

function sugerirCodigoSD(proceso, tipoDocumento) { seguridadRPC_();
  try {
    if (!proceso || !tipoDocumento) return respuesta(true, { codigo: "", mensaje: "" });
    return respuesta(true, calcularCodigoSD(SpreadsheetApp.openById(ID_HOJA), proceso, tipoDocumento));
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

function obtenerCodificacionSD() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const cod = hojaCodificacionSD(ss, JSON.parse(obtenerConfigSD("")).data.tiposDocumento);
    return respuesta(true, cod.filas.map(f => ({ categoria: f[0], nombre: f[1], sigla: String(f[2] || "").trim() })));
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// "OTRO DOCUMENTO" → "Otro documento" (deja igual lo que ya tiene minúsculas)
function textoPresentableSD(v) { seguridadRPC_();
  const t = String(v || "").trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  const min = t.toLowerCase();
  return min.charAt(0).toUpperCase() + min.slice(1);
}

// ---------- Configuración para el formulario ----------
function obtenerConfigSD(usuario) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const rutas = leerRutasSD(ss);
    // Tipos sin repetir: "FORMATO", "Formato" y "formato" son el mismo tipo
    const tipos = {};
    const agregarTipo = t => {
      const clave = normalizar(t);
      if (clave && !tipos[clave]) tipos[clave] = textoPresentableSD(t);
    };
    ["Procedimiento", "Formato", "Instructivo", "Manual", "Política", "Guía",
     "Plan", "Programa", "Caracterización", "Matriz", "Protocolo"].forEach(agregarTipo);
    const documentos = [];
    const hojaDocs = ss.getSheetByName("DOCUMENTOS");
    if (hojaDocs && hojaDocs.getLastRow() > 1) {
      hojaDocs.getDataRange().getValues().slice(1).forEach(r => {
        agregarTipo(r[3]);
        if (String(r[8]).trim() && normalizar(r[15]) !== normalizar(SD_ESTADO_DOC_OBSOLETO)) {
          documentos.push({ codigo: String(r[8]).trim(), nombre: String(r[9]).trim(), proceso: String(r[1]).trim(),
                            tipoDocumento: String(r[3]).trim(), version: String(r[7]) });
        }
      });
    }
    const actor = usuarioSD(usuario);
    return respuesta(true, {
      rutas: rutas,
      tiposDocumento: Object.values(tipos).sort((a, b) => a.localeCompare(b, "es")),
      documentos: documentos,
      solicitante: actor,
      roles: rolesSD(ss, actor)
    });
  } catch (e) {
    Logger.log("ERROR obtenerConfigSD: " + e.toString());
    return respuesta(false, null, "Error cargando la configuración: " + e.toString());
  }
}

function obtenerRutasSD() { seguridadRPC_();
  try {
    return respuesta(true, leerRutasSD(SpreadsheetApp.openById(ID_HOJA)));
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// ---------- 1. Crear solicitud ----------
function crearSolicitudSD(datos, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const actor = usuarioSD(usuario);
    if (!actor) return respuesta(false, null, "Usuario no válido. Vuelve a iniciar sesión.");

    const texto = v => String(v == null ? "" : v).trim();
    const tipo = texto(datos.tipoSolicitud);
    if (["Crear", "Modificar", "Anular"].indexOf(tipo) === -1) return respuesta(false, null, "Tipo de solicitud no válido");
    if (!texto(datos.proceso) || !texto(datos.nombreDocumento) || !texto(datos.justificacion) || !texto(datos.tipoDocumento)) {
      return respuesta(false, null, "Completa los campos obligatorios");
    }
    if (tipo !== "Crear" && !texto(datos.codigo)) {
      return respuesta(false, null, "Indica el código del documento a " + tipo.toLowerCase());
    }

    const ss = SpreadsheetApp.openById(ID_HOJA);
    const ruta = rutaPorProcesoSD(ss, datos.proceso);
    if (!ruta) return respuesta(false, null, "El proceso no tiene ruta de aprobación en " + SD_HOJA_RUTAS);
    // Procesos que impacta el documento: deben existir en la matriz de rutas; cada líder acepta el documento
    const rutas = leerRutasSD(ss);
    const impactos = [];
    for (const p of (Array.isArray(datos.procesosImpacto) ? datos.procesosImpacto : [])) {
      const r = rutas.find(x => normalizar(x.proceso) === normalizar(p));
      if (!r) return respuesta(false, null, "El proceso impactado \"" + texto(p) + "\" no está en la matriz " + SD_HOJA_RUTAS);
      if (normalizar(r.proceso) !== normalizar(ruta.proceso) && !impactos.some(x => normalizar(x) === normalizar(r.proceso))) impactos.push(r.proceso);
    }
    if (tipo === "Crear") {
      const existente = documentoExistenteSD(ss, datos.nombreDocumento);
      if (existente) {
        return respuesta(false, { existente: existente }, mensajeDuplicadoSD(existente));
      }
      const enTramite = creacionEnTramiteSD(ss, datos.nombreDocumento, "");
      if (enTramite) {
        return respuesta(false, null, "Ya existe la solicitud " + enTramite.radicado + " en trámite para crear \"" +
          enTramite.nombreDocumento + "\". Consulta ese radicado.");
      }
    }

    lock.waitLock(20000);
    const radicado = siguienteRadicadoSD(leerSolicitudesSD(ss));
    const sol = {
      radicado: radicado, fechaSolicitud: new Date(), tipoSolicitud: tipo, proceso: ruta.proceso,
      tipoDocumento: texto(datos.tipoDocumento), codigo: tipo === "Crear" ? "" : texto(datos.codigo), nombreDocumento: texto(datos.nombreDocumento),
      justificacion: texto(datos.justificacion), observaciones: texto(datos.observaciones), archivo: texto(datos.archivo),
      solicitanteUsuario: actor.usuario, solicitanteNombre: actor.nombre, solicitanteCorreo: actor.correo,
      estado: SD_ESTADOS.SOLICITADO, publicado: "NO", procesosImpacto: JSON.stringify(impactos), aceptaciones: "[]"
    };
    if (impactos.length) iniciarAceptacionSD_(ss, sol);   // primero aceptan los procesos impactados, después revisa Calidad
    actualizarEtapaSD(sol, ruta);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, radicado, "Solicitud", "Solicitud registrada", "REGISTRADA", actor,
                      sol.observaciones, sol.archivo, sol.estado);

    lock.releaseLock();

    enviarCorreoSD([actor.correo], "Solicitud documental " + radicado + " recibida",
      "<p>Su solicitud documental <b>" + radicado + "</b> ha sido recibida y se encuentra pendiente de " +
      (impactos.length ? "aceptación de los procesos impactados" : "revisión") + ".</p>", sol);
    if (impactos.length) correosAceptacionSD_(sol);
    else enviarCorreoSD(correosRolSD(ruta.revisor, ruta.correoRevisor), "Pendiente de revisión: " + radicado,
      "<p>Tiene una solicitud documental pendiente de <b>revisión</b> como " + escaparHtmlSD(ruta.revisor) + ".</p>", sol);
    notificarWhatsApp({ tipoSolicitud: tipo, proceso: sol.proceso, nombreDocumento: sol.nombreDocumento,
                        solicitante: actor.nombre, correo: actor.correo }, radicado);

    return respuesta(true, { radicado: radicado, revisor: ruta.revisor, aprobador: ruta.aprobador, estado: sol.estado,
      aceptaciones: aceptacionesSD(sol).map(a => ({ proceso: a.proceso, lider: a.lider })) });
  } catch (e) {
    Logger.log("ERROR crearSolicitudSD: " + e.toString());
    return respuesta(false, null, "Error registrando la solicitud: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ---------- Consultas ----------
function consultarSolicitudSD(radicado, usuario) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const sol = buscarSolicitudSD(ss, radicado);
    if (!sol) return respuesta(false, null, "No existe una solicitud con el radicado " + String(radicado).trim());

    const actor = usuarioSD(usuario);
    const ruta = rutaPorProcesoSD(ss, sol.proceso) || { revisor: sol.revisor, aprobador: sol.aprobador };
    const rutas = leerRutasSD(ss);
    if (!puedeVerSolicitudSD(actor, sol, ruta, rutas)) {
      return respuesta(false, null, "No tienes permiso para ver la solicitud " + sol.radicado + ". Solo la ven quien la registró, el revisor y el aprobador de su proceso, los líderes de los procesos impactados, el Administrador y el Coordinador de Calidad.");
    }
    if (sol.estado !== SD_ESTADOS.CERRADO && sol.estado !== SD_ESTADOS.RECHAZADO) {
      sol.revisor = ruta.revisor; sol.aprobador = ruta.aprobador;   // la matriz vigente manda en lo pendiente
    }
    const eventos = leerTrazabilidadSD(ss, sol.radicado);
    const e = SD_ESTADOS;
    const esSolicitante = !!actor && normalizar(actor.usuario) === normalizar(sol.solicitanteUsuario);
    const puedeAprobar = cumpleRolSD(actor, ruta.aprobador, ruta.correoAprobador);

    // Documento vigente actual (para sugerir la nueva versión)
    let documentoVigente = null;
    const duplicado = (sol.tipoSolicitud === "Crear" && sol.estado !== e.CERRADO && sol.estado !== e.RECHAZADO)
      ? documentoExistenteSD(ss, sol.nombreDocumento) : null;
    if (duplicado) documentoVigente = duplicado;
    const hojaDocs = ss.getSheetByName("DOCUMENTOS");
    if (sol.codigo && hojaDocs && hojaDocs.getLastRow() > 1) {
      const r = hojaDocs.getDataRange().getValues().slice(1).filter(f =>
        normalizar(f[8]) === normalizar(sol.codigo) && normalizar(f[15]) !== normalizar(SD_ESTADO_DOC_OBSOLETO)).pop();
      if (r) documentoVigente = { codigo: r[8], nombre: r[9], version: String(r[7]), url: String(r[10]), estado: r[15] };
    }

    const detalle = resumenSolicitudSD(sol);
    Object.assign(detalle, {
      justificacion: sol.justificacion, observaciones: sol.observaciones, archivo: sol.archivo,
      revisor: sol.revisor, aprobador: sol.aprobador, versionAprobada: sol.versionAprobada,
      documentoOficial: sol.documentoOficial, aprobadoPor: sol.aprobadoPor,
      fechaAprobacion: formatearFecha(sol.fechaAprobacion, "dd/MM/yyyy"),
      fechaPublicacion: formatearFecha(sol.fechaPublicacion, "dd/MM/yyyy"),
      etapas: etapasSD(sol, eventos),
      procesosImpacto: procesosImpactoSD(sol).map(p => {
        const l = liderRutaSD(rutas.find(r => normalizar(r.proceso) === normalizar(p)));
        const a = aceptacionesSD(sol).find(x => normalizar(x.proceso) === normalizar(p)) || {};
        return { proceso: p, lider: a.lider || l.cargo, estado: a.estado || (sol.estado === e.EN_ACEPTACION ? "PENDIENTE" : "EN ESPERA"),
                 responsable: a.nombre || "", fecha: a.fecha || "", observaciones: a.observaciones || "" };
      }),
      trazabilidad: eventos,
      documentoVigente: documentoVigente,
      duplicado: duplicado,
      codigoProyectado: (sol.tipoSolicitud === "Crear" && !duplicado && !sol.codigo && sol.estado !== e.RECHAZADO)
        ? calcularCodigoSD(ss, sol.proceso, sol.tipoDocumento) : null,
      permisos: {
        revisar: (sol.estado === e.SOLICITADO || sol.estado === e.AJUSTADO) && cumpleRolSD(actor, ruta.revisor, ruta.correoRevisor),
        aprobar: sol.estado === e.EN_APROBACION && puedeAprobar,
        // procesos impactados que este usuario debe aceptar
        aceptar: sol.estado === e.EN_ACEPTACION ? aceptacionesSD(sol).filter(a => a.estado !== "ACEPTADO" && (() => {
          const l = liderRutaSD(rutas.find(r => normalizar(r.proceso) === normalizar(a.proceso))); return cumpleRolSD(actor, l.cargo, l.correo); })()).map(a => a.proceso) : [],
        ajustar: sol.estado === e.DEVUELTO && esSolicitante,
        republicar: sol.estado === e.CERRADO && !esSiSD(sol.publicado) && puedeAprobar
      }
    });
    return respuesta(true, detalle);
  } catch (e) {
    Logger.log("ERROR consultarSolicitudSD: " + e.toString());
    return respuesta(false, null, "Error consultando la solicitud: " + e.toString());
  }
}

function obtenerMisSolicitudesSD(usuario) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const u = normalizar(usuario);
    const lista = leerSolicitudesSD(ss).filter(s => normalizar(s.solicitanteUsuario) === u)
      .map(resumenSolicitudSD).reverse();
    return respuesta(true, lista);
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// tipo: "revision" | "aprobacion" | "todas"
function obtenerBandejaSD(usuario, tipo) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const actor = usuarioSD(usuario);
    const roles = rolesSD(ss, actor);
    if (!roles.revisor && !roles.aprobador && !roles.lider && !roles.todas) return respuesta(false, null, "No tienes rol de revisión, aceptación o aprobación");

    const rutas = leerRutasSD(ss);
    const rutaDe = p => rutas.find(r => normalizar(r.proceso) === normalizar(p)) || {};
    const e = SD_ESTADOS;
    let lista = leerSolicitudesSD(ss);

    if (tipo === "revision") {
      lista = lista.filter(s => (s.estado === e.SOLICITADO || s.estado === e.AJUSTADO) &&
        cumpleRolSD(actor, rutaDe(s.proceso).revisor, rutaDe(s.proceso).correoRevisor));
    } else if (tipo === "aceptacion") {
      lista = lista.filter(s => s.estado === e.EN_ACEPTACION && aceptacionesSD(s).some(a => {
        if (a.estado === "ACEPTADO") return false;
        const l = liderRutaSD(rutaDe(a.proceso)); return cumpleRolSD(actor, l.cargo, l.correo);
      }));
    } else if (tipo === "aprobacion") {
      lista = lista.filter(s => (s.estado === e.EN_APROBACION ||
          (s.estado === e.CERRADO && !esSiSD(s.publicado))) &&
        cumpleRolSD(actor, rutaDe(s.proceso).aprobador, rutaDe(s.proceso).correoAprobador));
    } else if (!roles.todas) {
      // Revisores y aprobadores ven solo las solicitudes de los procesos que les corresponden
      lista = lista.filter(s => puedeVerSolicitudSD(actor, s, rutaDe(s.proceso), rutas));
    }
    return respuesta(true, lista.map(resumenSolicitudSD).reverse());
  } catch (e) {
    Logger.log("ERROR obtenerBandejaSD: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// ---------- 3/4. Revisión ----------
// accion: "aprobar" | "ajustes" | "rechazar"
function revisarSolicitudSD(radicado, usuario, accion, observaciones, archivo) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const sol = buscarSolicitudSD(ss, radicado);
    if (!sol) return respuesta(false, null, "Solicitud no encontrada");
    const e = SD_ESTADOS;
    if (sol.estado !== e.SOLICITADO && sol.estado !== e.AJUSTADO) {
      return respuesta(false, null, "La solicitud no está pendiente de revisión (estado: " + sol.estado + ")");
    }
    const actor = usuarioSD(usuario);
    const ruta = rutaPorProcesoSD(ss, sol.proceso);
    if (!ruta || !cumpleRolSD(actor, ruta.revisor, ruta.correoRevisor)) {
      return respuesta(false, null, "Solo " + (ruta ? ruta.revisor : "el revisor") + " puede revisar esta solicitud");
    }
    const obs = String(observaciones || "").trim();
    if (accion !== "aprobar" && !obs) return respuesta(false, null, "Escribe las observaciones para el solicitante");
    if (archivo) sol.archivo = archivo;
    if (accion === "aprobar" && sol.tipoSolicitud === "Crear") {
      const existente = documentoExistenteSD(ss, sol.nombreDocumento);
      if (existente) {
        const motivo = rechazarPorDuplicadoSD(ss, sol, ruta, existente, "Revisión", actor);
        return respuesta(true, { estado: sol.estado, rechazadaPorDuplicado: true, mensaje: motivo });
      }
    }

    let evento, resultado;
    if (accion === "aprobar") {
      sol.estado = e.EN_APROBACION; evento = "Revisión aprobada"; resultado = "APROBADO";
    } else if (accion === "ajustes") {
      sol.estado = e.DEVUELTO; evento = "Ajustes solicitados en revisión"; resultado = "AJUSTES SOLICITADOS";
    } else if (accion === "rechazar") {
      sol.estado = e.RECHAZADO; evento = "Solicitud rechazada en revisión"; resultado = "RECHAZADO";
    } else {
      return respuesta(false, null, "Acción no válida");
    }
    actualizarEtapaSD(sol, ruta);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, sol.radicado, "Revisión", evento, resultado, actor, obs, archivo, sol.estado);
    lock.releaseLock();

    if (accion === "aprobar") {
      enviarCorreoSD(correosRolSD(ruta.aprobador, ruta.correoAprobador), "Pendiente de aprobación: " + sol.radicado,
        "<p>La solicitud documental <b>" + sol.radicado + "</b> fue revisada por " + escaparHtmlSD(ruta.revisor) +
        " y se encuentra pendiente de su <b>aprobación</b>.</p>", sol);
    } else if (accion === "ajustes") {
      correoAjustesSD(sol, obs);
    } else {
      correoRechazoSD(sol, obs);
    }
    return respuesta(true, { estado: sol.estado });
  } catch (err) {
    Logger.log("ERROR revisarSolicitudSD: " + err.toString());
    return respuesta(false, null, "Error: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

// ---------- Aceptación de los líderes de los procesos impactados ----------
// Es la primera etapa: los líderes de los procesos impactados aceptan el documento antes de la revisión de Calidad.
function iniciarAceptacionSD_(ss, sol) {
  const rutas = leerRutasSD(ss);
  sol.aceptaciones = JSON.stringify(procesosImpactoSD(sol).map(p => {
    const l = liderRutaSD(rutas.find(r => normalizar(r.proceso) === normalizar(p)));
    return { proceso: p, lider: l.cargo, correo: l.correo, estado: "PENDIENTE" };
  }));
  sol.estado = SD_ESTADOS.EN_ACEPTACION;
}
function correosAceptacionSD_(sol) {
  aceptacionesSD(sol).filter(a => a.estado !== "ACEPTADO").forEach(a => enviarCorreoSD(correosRolSD(a.lider, a.correo), "Pendiente de aceptación: " + sol.radicado,
    "<p>La solicitud documental <b>" + sol.radicado + "</b> <b>impacta el proceso " + escaparHtmlSD(a.proceso) +
    "</b>. Como líder del proceso (" + escaparHtmlSD(a.lider) + ") debe ingresar a la plataforma y <b>aceptar el documento</b> " +
    "en Gestión Documental → Pendientes de aceptación. Después pasa a la revisión de Calidad.</p>", sol));
}
// accion: "aceptar" | "ajustes". proceso: el proceso impactado que acepta (el usuario debe ser su líder)
function aceptarSolicitudSD(radicado, usuario, accion, proceso, observaciones) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const sol = buscarSolicitudSD(ss, radicado);
    if (!sol) return respuesta(false, null, "Solicitud no encontrada");
    const e = SD_ESTADOS;
    if (sol.estado !== e.EN_ACEPTACION) return respuesta(false, null, "La solicitud no está pendiente de aceptación (estado: " + sol.estado + ")");
    const actor = usuarioSD(usuario);
    const rutas = leerRutasSD(ss);
    const lista = aceptacionesSD(sol);
    const a = lista.find(x => normalizar(x.proceso) === normalizar(proceso));
    if (!a) return respuesta(false, null, "El proceso " + proceso + " no está entre los procesos impactados");
    if (a.estado === "ACEPTADO") return respuesta(false, null, "El proceso " + a.proceso + " ya aceptó el documento");
    const l = liderRutaSD(rutas.find(r => normalizar(r.proceso) === normalizar(a.proceso)));
    if (!cumpleRolSD(actor, l.cargo, l.correo)) return respuesta(false, null, "Solo el líder del proceso " + a.proceso + " (" + l.cargo + ") puede aceptar este documento");
    const obs = String(observaciones || "").trim();
    if (accion !== "aceptar" && accion !== "ajustes") return respuesta(false, null, "Acción no válida");
    if (accion === "ajustes" && !obs) return respuesta(false, null, "Escribe las observaciones para el solicitante");
    a.nombre = actor.nombre; a.fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"); a.observaciones = obs;
    a.estado = accion === "aceptar" ? "ACEPTADO" : "AJUSTES SOLICITADOS";
    sol.aceptaciones = JSON.stringify(lista);
    const ruta = rutaPorProcesoSD(ss, sol.proceso);
    const todos = lista.every(x => x.estado === "ACEPTADO");
    if (accion === "ajustes") sol.estado = e.DEVUELTO;
    else if (todos) sol.estado = e.SOLICITADO;   // aceptado por todos: pasa a la revisión de Calidad
    actualizarEtapaSD(sol, ruta);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, sol.radicado, "Aceptación",
      (accion === "aceptar" ? "Aceptado por el proceso " : "Ajustes solicitados por el proceso ") + a.proceso, a.estado, actor, obs, "", sol.estado);
    lock.releaseLock();
    if (accion === "ajustes") correoAjustesSD(sol, "Proceso " + a.proceso + ": " + obs);
    else if (todos && ruta) enviarCorreoSD(correosRolSD(ruta.revisor, ruta.correoRevisor), "Pendiente de revisión: " + sol.radicado,
      "<p>Los líderes de los procesos impactados aceptaron la solicitud documental <b>" + sol.radicado +
      "</b>. Se encuentra pendiente de su <b>revisión</b> como " + escaparHtmlSD(ruta.revisor) + ".</p>", sol);
    return respuesta(true, { estado: sol.estado, pendientes: lista.filter(x => x.estado !== "ACEPTADO").map(x => x.proceso) });
  } catch (err) {
    Logger.log("ERROR aceptarSolicitudSD: " + err.toString());
    return respuesta(false, null, "Error: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

function correoAjustesSD(sol, obs) { seguridadRPC_();
  enviarCorreoSD([sol.solicitanteCorreo], "Ajustes requeridos: " + sol.radicado,
    "<p>La solicitud <b>" + sol.radicado + "</b> requiere ajustes antes de continuar con el proceso de aprobación.</p>" +
    "<p><b>Observación:</b><br>" + escaparHtmlSD(obs).replace(/\n/g, "<br>") + "</p>" +
    "<p>Ingrese a <b>Solicitud Documental → Mis solicitudes</b>, cargue la nueva versión y envíela nuevamente a revisión.</p>", sol);
}

function correoRechazoSD(sol, obs) { seguridadRPC_();
  enviarCorreoSD([sol.solicitanteCorreo], "Solicitud rechazada: " + sol.radicado,
    "<p>La solicitud <b>" + sol.radicado + "</b> fue <b>rechazada</b>.</p>" +
    "<p><b>Motivo:</b><br>" + escaparHtmlSD(obs).replace(/\n/g, "<br>") + "</p>", sol);
}

// ---------- Documento oficial sin marcas de revisión ----------
// Al aprobar, se genera una copia limpia del documento: el texto en ROJO (lo que se elimina) se borra y
// el texto RESALTADO EN AMARILLO (lo nuevo) queda sin resaltado y en negro. El archivo con las marcas
// se conserva como soporte de la revisión. Funciona con Word (.docx) y documentos de Google.
function sdEsRojo_(hex) {
  const m = /^([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(String(hex || "").replace("#", ""));
  if (!m) return false;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return r >= 0x99 && g <= 0x70 && b <= 0x70 && r - Math.max(g, b) >= 0x60;
}
function sdEsAmarillo_(hex) {
  const m = /^([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(String(hex || "").replace("#", ""));
  if (!m) return false;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return r >= 0xE0 && g >= 0xD0 && b <= 0xA0;
}
// Transforma el XML de una parte del Word (cuerpo, encabezados, pies, notas). Devuelve { xml, rojo, amarillo }.
function sdLimpiarXmlWord_(xml) {
  let rojo = 0, amarillo = 0;
  const RUN = /<w:r(?:\s[^>]*)?>(?:(?!<w:r[\s>])[\s\S])*?<\/w:r>/g;   // solo los textos «hoja» (sin otros textos dentro)
  const PAR = /<w:p(?:\s[^>]*)?>(?:(?!<w:p[\s>])[\s\S])*?<\/w:p>/g;
  const esAmarilloRPr = rpr => /<w:highlight\b[^>]*w:val="(yellow|darkYellow)"/.test(rpr) ||
    ((rpr.match(/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/) || [])[1] && sdEsAmarillo_(rpr.match(/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/)[1]));
  const quitarAmarillo = rpr => {
    let x = rpr.replace(/<w:highlight\b[^>]*\/>/g, "").replace(/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"[^>]*\/>/g, (m, f) => sdEsAmarillo_(f) ? "" : m);
    x = x.replace(/<w:color\b[^>]*\/>/g, "");
    return x.replace(/<\/w:rPr>/, '<w:color w:val="000000"/></w:rPr>');
  };
  xml = xml.replace(PAR, p => {
    let quitados = 0;
    const q = p.replace(RUN, run => {
      const rpr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
      const color = (rpr.match(/<w:color\b[^>]*w:val="([0-9A-Fa-f]{6})"/) || [])[1];
      if (color && sdEsRojo_(color)) {
        if (/<w:(drawing|pict|object)\b/.test(run)) return run;   // las imágenes no se borran
        quitados++; rojo++; return "";
      }
      if (rpr && esAmarilloRPr(rpr)) { amarillo++; return run.replace(rpr, quitarAmarillo(rpr)); }
      return run;
    });
    // Marca de párrafo resaltada en amarillo
    let r2 = q.replace(/(<w:pPr>[\s\S]*?)(<w:rPr>[\s\S]*?<\/w:rPr>)([\s\S]*?<\/w:pPr>)/, (m, a, rpr, c) => esAmarilloRPr(rpr) ? a + quitarAmarillo(rpr) + c : m);
    // Si el párrafo quedó vacío porque todo su texto estaba en rojo, se elimina el párrafo
    if (quitados && !/<w:t(?:\s[^>]*)?>[^<]*\S/.test(r2) && !/<w:(drawing|pict|object|tab|br)\b/.test(r2.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, ""))) return "";
    return r2;
  });
  xml = xml.replace(//g, "");
  // Una celda de tabla debe tener al menos un párrafo
  xml = xml.replace(/(<w:tc(?:\s[^>]*)?>)((?:(?!<w:p[\s>]|<w:p\/>|<w:tbl[\s>]|<\/w:tc>)[\s\S])*)(<\/w:tc>)/g, "$1$2<w:p/>$3");
  return { xml: xml, rojo: rojo, amarillo: amarillo };
}
function sdLimpiarDocx_(blob, nombre) {
  const partes = Utilities.unzip(blob.setContentType("application/zip"));
  let rojo = 0, amarillo = 0;
  const salida = partes.map(p => {
    const n = p.getName();
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n)) return p;
    const r = sdLimpiarXmlWord_(p.getDataAsString("UTF-8"));
    rojo += r.rojo; amarillo += r.amarillo;
    return Utilities.newBlob(r.xml, "application/xml", n);
  });
  const zip = Utilities.zip(salida, nombre).setContentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  return { blob: zip, rojo: rojo, amarillo: amarillo };
}
// Excel (.xlsx / .xlsm): las celdas con letra roja quedan vacías (y los fragmentos rojos de un texto se borran);
// las celdas con relleno amarillo quedan sin relleno y con letra negra. Las macros se conservan.
function sdColorExcel_(el) {
  const rgb = (el.match(/\brgb="([0-9A-Fa-f]{6,8})"/) || [])[1];
  if (rgb) return rgb.slice(-6);
  const ind = (el.match(/\bindexed="(\d+)"/) || [])[1];
  return { "2": "FF0000", "10": "FF0000", "5": "FFFF00", "13": "FFFF00" }[ind] || "";
}
function sdLimpiarXlsx_(blob, nombre, tipo) {
  const partes = Utilities.unzip(blob.setContentType("application/zip"));
  const texto = n => { const p = partes.find(x => x.getName() === n); return p ? p.getDataAsString("UTF-8") : null; };
  let st = texto("xl/styles.xml");
  if (!st) return { blob: blob, rojo: 0, amarillo: 0 };
  const lista = (xml, sec, tag) => { const m = new RegExp("<" + sec + "\\b[^>]*>([\\s\\S]*?)</" + sec + ">").exec(xml); return m ? (m[1].match(new RegExp("<" + tag + "\\b[^>]*/>|<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + ">", "g")) || []) : []; };
  const fonts = lista(st, "fonts", "font"), fills = lista(st, "fills", "fill"), xfs = lista(st, "cellXfs", "xf");
  const fuenteRoja = fonts.map(f => { const c = (f.match(/<color\b[^>]*\/>/) || [""])[0]; return !!c && sdEsRojo_(sdColorExcel_(c)); });
  const rellenoAmarillo = fills.map(f => { const c = (f.match(/<fgColor\b[^>]*\/>/) || [""])[0]; return /patternType="solid"/.test(f) && !!c && sdEsAmarillo_(sdColorExcel_(c)); });
  const attr = (x, a) => Number((x.match(new RegExp("\\b" + a + '="(\\d+)"')) || [])[1] || 0);
  const nuevasFuentes = [], fuenteNegra = {}, nuevosXf = [], xfLimpio = {}, xfRojo = {};
  xfs.forEach((x, k) => {
    if (fuenteRoja[attr(x, "fontId")]) { xfRojo[k] = true; return; }
    if (!rellenoAmarillo[attr(x, "fillId")]) return;
    const fid = attr(x, "fontId");
    if (fuenteNegra[fid] === undefined) {
      const f = fonts[fid] || "<font/>";
      const negra = /<color\b[^>]*\/>/.test(f) ? f.replace(/<color\b[^>]*\/>/, '<color rgb="FF000000"/>') : f.replace(/<font\s*\/>/, '<font><color rgb="FF000000"/></font>').replace(/<\/font>/, '<color rgb="FF000000"/></font>');
      fuenteNegra[fid] = fonts.length + nuevasFuentes.length; nuevasFuentes.push(negra);
    }
    let n = x.replace(/\bfillId="\d+"/, 'fillId="0"').replace(/\bfontId="\d+"/, 'fontId="' + fuenteNegra[fid] + '"');
    if (!/applyFont=/.test(n)) n = n.replace(/<xf\b/, '<xf applyFont="1"');
    xfLimpio[k] = xfs.length + nuevosXf.length; nuevosXf.push(n);
  });
  if (nuevasFuentes.length) st = st.replace(/<\/fonts>/, nuevasFuentes.join("") + "</fonts>").replace(/<fonts\b([^>]*?)count="\d+"/, '<fonts$1count="' + (fonts.length + nuevasFuentes.length) + '"');
  if (nuevosXf.length) st = st.replace(/<\/cellXfs>/, nuevosXf.join("") + "</cellXfs>").replace(/<cellXfs\b([^>]*?)count="\d+"/, '<cellXfs$1count="' + (xfs.length + nuevosXf.length) + '"');
  let rojo = 0, amarillo = 0, quitoFormulas = false;
  // Fragmentos en rojo dentro de un texto con varios formatos
  let ss = texto("xl/sharedStrings.xml");
  if (ss) ss = ss.replace(/<r>(?:(?!<r>)[\s\S])*?<\/r>/g, r => { const c = (r.match(/<color\b[^>]*\/>/) || [""])[0]; if (c && sdEsRojo_(sdColorExcel_(c))) { rojo++; return ""; } return r; });
  const cambiar = {};
  partes.forEach(p => {
    const n = p.getName();
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(n)) return;
    let x = p.getDataAsString("UTF-8");
    x = x.replace(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (m, at, fin, cont) => {
      const s = Number((at.match(/\bs="(\d+)"/) || [])[1] || 0);
      if (xfRojo[s] && cont) { rojo++; if (/<f\b/.test(cont)) quitoFormulas = true; return "<c" + at.replace(/\st="[^"]*"/, "") + "/>"; }
      if (xfLimpio[s] !== undefined) { amarillo++; return "<c" + at.replace(/\bs="\d+"/, 's="' + xfLimpio[s] + '"') + fin; }
      return m;
    });
    x = x.replace(/<(row|col)\b([^>]*?)\b(s|style)="(\d+)"/g, (m, tag, a, nom, v) => xfLimpio[v] !== undefined ? "<" + tag + a + nom + '="' + xfLimpio[v] + '"' : m);
    cambiar[n] = x;
  });
  cambiar["xl/styles.xml"] = st;
  if (ss) cambiar["xl/sharedStrings.xml"] = ss;
  if (quitoFormulas) {   // Excel recalcula la cadena de cálculo; se quita para que no pida reparar el archivo
    const ct = texto("[Content_Types].xml"), rel = texto("xl/_rels/workbook.xml.rels");
    if (ct) cambiar["[Content_Types].xml"] = ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/, "");
    if (rel) cambiar["xl/_rels/workbook.xml.rels"] = rel.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, "");
  }
  const salida = partes.filter(p => !(quitoFormulas && p.getName() === "xl/calcChain.xml"))
    .map(p => cambiar[p.getName()] !== undefined ? Utilities.newBlob(cambiar[p.getName()], "application/xml", p.getName()) : p);
  return { blob: Utilities.zip(salida, nombre).setContentType(tipo), rojo: rojo, amarillo: amarillo };
}
function sdLimpiarGoogleDoc_(doc) {
  let rojo = 0, amarillo = 0;
  const partes = [doc.getBody()].concat(doc.getHeader() ? [doc.getHeader()] : [], doc.getFooter() ? [doc.getFooter()] : []);
  partes.forEach(parte => {
    const textos = [];
    let r = null;
    while ((r = parte.findElement(DocumentApp.ElementType.TEXT, r))) textos.push(r.getElement().asText());
    textos.forEach(t => {
      const idx = t.getTextAttributeIndices(), largo = t.getText().length;
      for (let i = idx.length - 1; i >= 0; i--) {            // de atrás hacia adelante para no mover los índices
        const ini = idx[i], fin = (i + 1 < idx.length ? idx[i + 1] : largo) - 1;
        if (fin < ini) continue;
        const fg = t.getForegroundColor(ini), bg = t.getBackgroundColor(ini);
        if (fg && sdEsRojo_(fg)) { t.deleteText(ini, fin); rojo++; }
        else if (bg && sdEsAmarillo_(bg)) { t.setBackgroundColor(ini, fin, null); t.setForegroundColor(ini, fin, "#000000"); amarillo++; }
      }
    });
  });
  doc.saveAndClose();
  return { rojo: rojo, amarillo: amarillo };
}
// Crea la copia limpia junto al original. Devuelve { url, rojo, amarillo, nota }.
function sdDocumentoOficialLimpio_(urlArchivo, nombreFinal) {
  const id = extraerIdDrive(urlArchivo);
  if (!id) return { url: urlArchivo, nota: "No se encontró el archivo para quitar las marcas de revisión." };
  const f = DriveApp.getFileById(id), tipo = f.getMimeType();
  const padres = f.getParents(), carpeta = padres.hasNext() ? padres.next() : carpetaSGC(SD_CARPETA);
  let nuevo, r;
  if (tipo === MimeType.MICROSOFT_WORD || /\.docx$/i.test(f.getName())) {
    r = sdLimpiarDocx_(f.getBlob(), nombreFinal + ".docx");
    nuevo = carpeta.createFile(r.blob.setName(nombreFinal + ".docx"));
  } else if (/\.(xlsx|xlsm)$/i.test(f.getName()) || tipo === MimeType.MICROSOFT_EXCEL || /macroenabled/i.test(tipo)) {
    const ext = (f.getName().match(/\.(xlsx|xlsm)$/i) || [".xlsx"])[0].toLowerCase();
    const tipoX = ext === ".xlsm" ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    r = sdLimpiarXlsx_(f.getBlob(), nombreFinal + ext, tipoX);
    nuevo = carpeta.createFile(r.blob.setName(nombreFinal + ext));
  } else if (tipo === MimeType.GOOGLE_DOCS) {
    nuevo = f.makeCopy(nombreFinal, carpeta);
    r = sdLimpiarGoogleDoc_(DocumentApp.openById(nuevo.getId()));
  } else {
    return { url: urlArchivo, nota: "El documento no es Word, Excel ni Google Docs (" + f.getName() + "): se publica tal como se adjuntó, sin quitar las marcas de revisión." };
  }
  if (COMPARTIR_EVIDENCIAS_CON_ENLACE) { try { nuevo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {} }
  return { url: nuevo.getUrl(), rojo: r.rojo, amarillo: r.amarillo,
    nota: "Documento oficial sin marcas de revisión: " + r.rojo + " texto(s) en rojo eliminados y " + r.amarillo + " resaltado(s) en amarillo pasados a texto negro. El archivo con las marcas se conserva como soporte." };
}

// ---------- 5/6. Aprobación, cierre y publicación ----------
// accion: "aprobar" | "ajustes" | "rechazar"
// datos: { observaciones, codigo, version, archivo }
function aprobarSolicitudSD(radicado, usuario, accion, datos) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    datos = datos || {};
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const sol = buscarSolicitudSD(ss, radicado);
    if (!sol) return respuesta(false, null, "Solicitud no encontrada");
    const e = SD_ESTADOS;
    if (sol.estado !== e.EN_APROBACION) {
      return respuesta(false, null, "La solicitud no está pendiente de aprobación (estado: " + sol.estado + ")");
    }
    const actor = usuarioSD(usuario);
    const ruta = rutaPorProcesoSD(ss, sol.proceso);
    if (!ruta || !cumpleRolSD(actor, ruta.aprobador, ruta.correoAprobador)) {
      return respuesta(false, null, "Solo " + (ruta ? ruta.aprobador : "el aprobador") + " puede aprobar esta solicitud");
    }
    const obs = String(datos.observaciones || "").trim();
    if (datos.archivo) sol.archivo = datos.archivo;

    if (accion === "ajustes" || accion === "rechazar") {
      if (!obs) return respuesta(false, null, "Escribe las observaciones para el solicitante");
      const ajustes = accion === "ajustes";
      sol.estado = ajustes ? e.DEVUELTO : e.RECHAZADO;
      actualizarEtapaSD(sol, ruta);
      guardarFilaSolicitudSD(ss, sol);
      registrarEventoSD(ss, sol.radicado, "Aprobación",
        ajustes ? "Ajustes solicitados en aprobación" : "Solicitud rechazada en aprobación",
        ajustes ? "AJUSTES SOLICITADOS" : "RECHAZADO", actor, obs, datos.archivo, sol.estado);
      lock.releaseLock();
      ajustes ? correoAjustesSD(sol, obs) : correoRechazoSD(sol, obs);
      return respuesta(true, { estado: sol.estado });
    }
    if (accion !== "aprobar") return respuesta(false, null, "Acción no válida");

    // Si se pidió crear un documento que ya existe, la solicitud se rechaza
    const existente = sol.tipoSolicitud === "Crear" ? documentoExistenteSD(ss, sol.nombreDocumento) : null;
    if (existente) {
      const motivo = rechazarPorDuplicadoSD(ss, sol, ruta, existente, "Aprobación", actor);
      return respuesta(true, { estado: sol.estado, rechazadaPorDuplicado: true, mensaje: motivo });
    }
    const anular = sol.tipoSolicitud === "Anular";
    const crear = sol.tipoSolicitud === "Crear";
    const version = String(datos.version || "").trim();
    if (!anular && !version) return respuesta(false, null, "Indica la versión aprobada");
    if (!anular && !sol.archivo) return respuesta(false, null, "Adjunta el documento oficial antes de aprobar");
    let codigo;
    if (crear) {
      // Aprobada por todos: ahora sí se asigna el consecutivo
      const asignado = calcularCodigoSD(ss, sol.proceso, sol.tipoDocumento);
      if (!asignado.codigo) return respuesta(false, null, asignado.mensaje + ". Complétala y vuelve a aprobar.");
      codigo = asignado.codigo;
    } else {
      codigo = String(datos.codigo || sol.codigo || "").trim();
      if (!codigo) return respuesta(false, null, "Indica el código del documento");
    }

    sol.codigo = codigo;
    sol.versionAprobada = anular ? "" : version;
    sol.documentoOficial = anular ? "" : sol.archivo;
    // Copia limpia: se borra lo que está en rojo y lo resaltado en amarillo queda en negro sin resaltar
    let limpieza = null;
    if (!anular) {
      try {
        limpieza = sdDocumentoOficialLimpio_(sol.archivo, (codigo + " V" + version + " " + (sol.nombreDocumento || "")).replace(/[\\/:*?"<>|]+/g, " ").trim());
        if (limpieza.url) sol.documentoOficial = limpieza.url;
      } catch (errLimpia) {
        Logger.log("Documento oficial limpio: " + errLimpia);
        limpieza = { url: "", nota: "No se pudieron quitar las marcas de revisión (" + (errLimpia.message || errLimpia) + "): se publica el archivo tal como se adjuntó." };
      }
    }
    sol.aprobadoPor = actor.nombre + " (" + actor.cargo + ")";
    sol.fechaAprobacion = new Date();
    sol.estado = e.CERRADO;
    sol.publicado = "NO";
    actualizarEtapaSD(sol, ruta);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, sol.radicado, "Aprobación", anular ? "Anulación aprobada" : "Documento aprobado",
                      "APROBADO", actor, obs, datos.archivo, sol.estado);
    if (limpieza) registrarEventoSD(ss, sol.radicado, "Aprobación", "Documento oficial sin marcas de revisión",
      limpieza.url && limpieza.url !== sol.archivo ? "LIMPIO" : "SIN CAMBIOS", null, limpieza.nota, sol.documentoOficial, sol.estado);
    if (crear) {
      registrarEventoSD(ss, sol.radicado, "Aprobación", "Código asignado: " + codigo, "ASIGNADO", null,
                        "Consecutivo automático de la codificación documental", "", sol.estado);
    }
    registrarEventoSD(ss, sol.radicado, "Cierre", "Solicitud cerrada", "CERRADO", null, "", "", sol.estado);

    const pub = publicarSolicitudSD(ss, sol, actor);
    lock.releaseLock();
    return respuesta(true, { estado: sol.estado, publicado: pub.ok, mensajePublicacion: pub.mensaje });
  } catch (err) {
    Logger.log("ERROR aprobarSolicitudSD: " + err.toString());
    return respuesta(false, null, "Error: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

function reintentarPublicacionSD(radicado, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const sol = buscarSolicitudSD(ss, radicado);
    if (!sol || sol.estado !== SD_ESTADOS.CERRADO || esSiSD(sol.publicado)) {
      return respuesta(false, null, "La solicitud no tiene publicación pendiente");
    }
    const actor = usuarioSD(usuario);
    const ruta = rutaPorProcesoSD(ss, sol.proceso);
    if (!ruta || !cumpleRolSD(actor, ruta.aprobador, ruta.correoAprobador)) {
      return respuesta(false, null, "Solo el aprobador puede publicar");
    }
    const pub = publicarSolicitudSD(ss, sol, actor);
    return pub.ok ? respuesta(true, pub) : respuesta(false, null, pub.mensaje);
  } catch (err) {
    return respuesta(false, null, "Error: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

// Actualiza la hoja DOCUMENTOS (la misma que lee el módulo Documentos SGC):
// B Proceso | D Tipo | H Versión | I Código | J Nombre | K Enlace | N Fecha | P Estado
function publicarSolicitudSD(ss, sol, actor) { seguridadRPC_();
  try {
    const hoja = ss.getSheetByName("DOCUMENTOS");
    if (!hoja) throw new Error("No existe la hoja DOCUMENTOS");
    const data = hoja.getDataRange().getValues();
    const ancho = Math.max(hoja.getLastColumn(), 16);
    const enc = (data[0] || []).map(normalizar);
    const colOpcional = nombres => enc.findIndex(h => nombres.indexOf(h) !== -1);
    const iAprobo = colOpcional(["aprobado por", "aprobo", "aprobó"]);
    const iFechaPub = colOpcional(["fecha de publicacion", "fecha publicacion"]);
    const iRadicado = colOpcional(["radicado", "radicado sd", "solicitud"]);
    const hoy = new Date();
    const obsoleto = normalizar(SD_ESTADO_DOC_OBSOLETO);
    const codigo = normalizar(sol.codigo);

    const anteriores = [];
    data.forEach((r, i) => {
      if (i > 0 && codigo && normalizar(r[8]) === codigo && normalizar(r[15]) !== obsoleto) anteriores.push(i);
    });

    let mensaje, evento;
    if (sol.tipoSolicitud === "Anular") {
      if (!anteriores.length) throw new Error("No se encontró en DOCUMENTOS un documento vigente con código " + sol.codigo);
      anteriores.forEach(i => hoja.getRange(i + 1, 16).setValue(SD_ESTADO_DOC_OBSOLETO));
      evento = "Documento anulado (Obsoleto) en Documentos SGC";
      mensaje = "El documento " + sol.codigo + " quedó como " + SD_ESTADO_DOC_OBSOLETO +
        " en Documentos SGC. Su código queda disponible para un nuevo documento";
    } else {
      // La nueva fila copia la anterior (conserva columnas propias de la hoja) y actualiza lo publicado
      const base = anteriores.length ? data[anteriores[anteriores.length - 1]].slice() : [];
      while (base.length < ancho) base.push("");
      anteriores.forEach(i => hoja.getRange(i + 1, 16).setValue(SD_ESTADO_DOC_OBSOLETO));

      base[1] = sol.proceso;
      base[3] = sol.tipoDocumento || base[3];
      base[7] = sol.versionAprobada;
      base[8] = sol.codigo;
      base[9] = sol.nombreDocumento;
      base[10] = sol.documentoOficial;
      base[13] = hoy;
      base[15] = SD_ESTADO_DOC_VIGENTE;
      if (iAprobo !== -1) base[iAprobo] = sol.aprobadoPor;
      if (iFechaPub !== -1) base[iFechaPub] = hoy;
      if (iRadicado !== -1) base[iRadicado] = sol.radicado;
      hoja.appendRow(base.slice(0, ancho));
      evento = "Documento publicado";
      mensaje = sol.codigo + " versión " + sol.versionAprobada + " publicado como " + SD_ESTADO_DOC_VIGENTE +
        (anteriores.length ? "; versión anterior marcada como " + SD_ESTADO_DOC_OBSOLETO : "");
    }

    sol.publicado = "SI";
    sol.fechaPublicacion = hoy;
    actualizarEtapaSD(sol);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, sol.radicado, "Publicación", evento, "PUBLICADO",
      { usuario: "", nombre: "Visual IMCOLMETRIC SGC", cargo: "" }, mensaje, sol.documentoOficial, sol.estado);

    enviarCorreoSD([sol.solicitanteCorreo], "Documento disponible: " + sol.radicado,
      sol.tipoSolicitud === "Anular"
        ? "<p>La solicitud <b>" + sol.radicado + "</b> fue aprobada y cerrada. El documento <b>" + escaparHtmlSD(sol.codigo) +
          "</b> fue anulado y quedó como obsoleto en la Visual IMCOLMETRIC SGC.</p>"
        : "<p>La solicitud <b>" + sol.radicado + "</b> fue aprobada y cerrada. El documento <b>" +
          escaparHtmlSD(sol.codigo + " " + sol.nombreDocumento) + "</b> (versión " + escaparHtmlSD(sol.versionAprobada) +
          ") ya se encuentra disponible en la Visual IMCOLMETRIC SGC → Documentos SGC.</p>", sol);
    return { ok: true, mensaje: mensaje };
  } catch (err) {
    Logger.log("ERROR publicarSolicitudSD: " + err.toString());
    registrarEventoSD(ss, sol.radicado, "Publicación", "Publicación pendiente", "ERROR",
      null, err.message || err.toString(), "", sol.estado);
    return { ok: false, mensaje: "La solicitud quedó aprobada y cerrada, pero no se pudo publicar: " + (err.message || err) };
  }
}

// ---------- Ajustes del solicitante ----------
function reenviarSolicitudSD(radicado, usuario, observaciones, archivo) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const sol = buscarSolicitudSD(ss, radicado);
    if (!sol) return respuesta(false, null, "Solicitud no encontrada");
    if (sol.estado !== SD_ESTADOS.DEVUELTO) return respuesta(false, null, "La solicitud no está devuelta para ajustes");
    const actor = usuarioSD(usuario);
    if (!actor || normalizar(actor.usuario) !== normalizar(sol.solicitanteUsuario)) {
      return respuesta(false, null, "Solo el solicitante puede enviar los ajustes");
    }
    if (sol.tipoSolicitud !== "Anular" && !archivo) return respuesta(false, null, "Adjunta la nueva versión del documento");

    const ruta = rutaPorProcesoSD(ss, sol.proceso);
    if (archivo) sol.archivo = archivo;
    // Si los ajustes los pidió un líder de proceso impactado, la nueva versión vuelve a la aceptación de los procesos
    const deAceptacion = aceptacionesSD(sol).some(a => a.estado !== "ACEPTADO");
    if (deAceptacion) iniciarAceptacionSD_(ss, sol); else sol.estado = SD_ESTADOS.AJUSTADO;
    actualizarEtapaSD(sol, ruta);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, sol.radicado, "Ajuste", deAceptacion ? "Ajustes realizados y reenviada a los procesos impactados" : "Ajustes realizados y reenviada a revisión",
                      "AJUSTADO", actor, String(observaciones || "").trim(), archivo, sol.estado);
    lock.releaseLock();

    if (deAceptacion) correosAceptacionSD_(sol);
    else if (ruta) {
      enviarCorreoSD(correosRolSD(ruta.revisor, ruta.correoRevisor), "Ajustes recibidos: " + sol.radicado,
        "<p>El solicitante realizó los ajustes de la solicitud <b>" + sol.radicado +
        "</b>. Se encuentra nuevamente pendiente de su <b>revisión</b>.</p>", sol);
    }
    return respuesta(true, { estado: sol.estado });
  } catch (err) {
    Logger.log("ERROR reenviarSolicitudSD: " + err.toString());
    return respuesta(false, null, "Error: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

// ---------- Archivos ----------
function subirArchivoSD(nombre, tipo, base64) { seguridadRPC_();
  return subirArchivoDrive(SD_CARPETA, nombre, tipo, base64);
}

// ============================================================
// NOTIFICACIÓN WHATSAPP
// ============================================================
function notificarWhatsApp(datos, consecutivo) { seguridadRPC_();
  try {
    const mensaje =
      "📄 Nueva solicitud documental\n" +
      "Radicado: " + consecutivo + "\n" +
      "Tipo: " + datos.tipoSolicitud + "\n" +
      "Proceso: " + datos.proceso + "\n" +
      "Documento: " + datos.nombreDocumento + "\n" +
      "Solicitante: " + datos.solicitante + "\n" +
      "Correo: " + datos.correo;

    const url = "https://api.callmebot.com/whatsapp.php"
      + "?phone=" + NUMERO_WHATSAPP
      + "&text=" + encodeURIComponent(mensaje)
      + "&apikey=" + APIKEY_CALLMEBOT;

    UrlFetchApp.fetch(url);
  } catch (e) {
    Logger.log("Error enviando WhatsApp: " + e);
  }
}

// ============================================================
// INDICADORES - GUARDAR NUEVO INDICADOR
// ============================================================
function guardarIndicador(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario || (datos && datos.usuario), "ind", "crear"); if (np) return np; }
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hojaIndicadores = ss.getSheetByName("Indicadores") || ss.insertSheet("Indicadores");

    // Si la hoja está vacía, crear encabezados
    if (hojaIndicadores.getLastRow() === 0) {
      hojaIndicadores.appendRow([
        "ID",
        "Proceso",
        "Fecha Creación",
        "Código",
        "Versión",
        "Nombre del Indicador",
        "Objetivo Estratégico",
        "Objetivo del Indicador",
        "Responsable Medición",
        "Responsable Análisis",
        "Fuente Indicador",
        "Fuente Datos",
        "Unidad Medida",
        "Frecuencia Recolección",
        "Frecuencia Medición",
        "Tendencia",
        "Tipo Indicador",
        "Numerador",
        "Denominador",
        "Meta Vigencia",
        "Meta Objetiva",
        "Estado",
        "Fecha Sistema"
      ]);
    }

    // Generar ID único
    const id = "IND-" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + "-" + Math.random().toString(36).substr(2, 6);

    const fila = [
      id,
      datos.proceso || "",
      datos.fechaCreacion || "",
      datos.codigo || "",
      datos.version || "",
      datos.nombre || "",
      datos.objetivoEstrategico || "",
      datos.objetivoIndicador || "",
      datos.responsableMedicion || "",
      datos.responsableAnalisis || "",
      datos.fuenteIndicador || "",
      datos.fuenteDatos || "",
      datos.unidadMedida || "",
      datos.frecuenciaRecoleccion || "",
      datos.frecuenciaMedicion || "",
      datos.tendencia || "",
      datos.tipoIndicador || "",
      datos.numerador || "",
      datos.denominador || "",
      datos.metaVigencia || "",
      datos.metaObjetiva || "",
      "Activo",
      new Date()
    ];

    hojaIndicadores.appendRow(fila);

    // Crear/verificar hoja DatosIndicadores
    obtenerHojaDatos(ss);

    return respuesta(true, { id: id, mensaje: "Indicador guardado exitosamente" });

  } catch (e) {
    Logger.log("ERROR guardarIndicador: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Convierte una fila de la hoja "Indicadores" en objeto
function mapearIndicador(r) { seguridadRPC_();
  return {
    id: r[0],
    proceso: r[1],
    fechaCreacion: formatearFecha(r[2], "dd/MM/yyyy"),
    codigo: r[3],
    version: r[4],
    nombre: r[5],
    objetivoEstrategico: r[6],
    objetivoIndicador: r[7],
    responsableMedicion: r[8],
    responsableAnalisis: r[9],
    fuenteIndicador: r[10],
    fuenteDatos: r[11],
    unidadMedida: r[12],
    frecuenciaRecoleccion: r[13],
    frecuenciaMedicion: r[14],
    tendencia: r[15],
    tipoIndicador: r[16],
    numerador: r[17],
    denominador: r[18],
    metaVigencia: r[19],
    metaObjetiva: r[20],
    estado: r[21],
    fechaSistema: formatearFecha(r[22], "dd/MM/yyyy")
  };
}

// ============================================================
// INDICADORES - OBTENER LISTA
// ============================================================
// Estado del indicador: vacío o "Activo" = activo; "Inactivo" = se oculta de la Ficha de Indicadores
function estadoIndicador_(v) { return normalizar(v) === "inactivo" ? "Inactivo" : "Activo"; }

function obtenerIndicadores(usuario) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = ss.getSheetByName("Indicadores");

    if (!hoja || hoja.getLastRow() < 2) {
      return respuesta(true, []);
    }

    const data = hoja.getDataRange().getValues();
    // Meses que ya tienen medición (para mostrar qué periodos faltan por diligenciar)
    const meses = {};
    const hojaDatos = ss.getSheetByName("DatosIndicadores");
    if (hojaDatos && hojaDatos.getLastRow() > 1) {
      hojaDatos.getDataRange().getValues().slice(1).forEach(r => {
        if (!r[0] || !medicionConDatoInd_(r)) return;
        const i = indiceMesInd_(r[1]);
        if (i < 0) return;
        (meses[r[0]] = meses[r[0]] || {})[i] = true;
      });
    }
    const indicadores = data.slice(1)
      .filter(r => r[0])
      .map(r => Object.assign(mapearIndicador(r), { mesesConDato: Object.keys(meses[r[0]] || {}).map(Number).sort((a, b) => a - b) }));
    const editor = puedeEditarFichaInd_(usuario ? usuarioSD(usuario) : null);
    indicadores.forEach(i => { i.estado = estadoIndicador_(i.estado); i.puedeEditarFicha = editor; });

    return respuesta(true, indicadores);
  } catch (e) {
    Logger.log("ERROR obtenerIndicadores: " + e.toString());
    return respuesta(false, null, "Error obteniendo indicadores: " + e.toString());
  }
}

// ============================================================
// INDICADORES - OBTENER DETALLE (ficha + mediciones)
// ============================================================
// Índice 0-11 del mes guardado en DatosIndicadores ("Marzo", 3, fecha…)
function indiceMesInd_(mes) {
  if (mes instanceof Date) return mes.getMonth();
  if (typeof mes === "number") return mes >= 1 && mes <= 12 ? mes - 1 : -1;
  const t = normalizar(mes);
  if (/^\d+$/.test(t)) return indiceMesInd_(Number(t));
  return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].indexOf(t.slice(0, 3));
}

// Una fila sin variables, sin valor (o en 0), sin análisis ni usuario es un registro vacío: el periodo sigue sin diligenciar
function medicionConDatoInd_(r) {
  const vacio = v => v === "" || v === null || v === undefined;
  if (!vacio(r[5]) || !vacio(r[6])) return true;
  if (String(r[7] || "").trim() || String(r[8] || "").trim()) return true;
  return !vacio(r[2]) && Number(r[2]) !== 0;
}

// Solo el Coordinador de Calidad y el Administrador del Sistema pueden modificar la ficha técnica
function puedeEditarFichaInd_(u) {
  if (!u) return false;
  return esAdministradorPerm(u) || /^coordinador(a)? de (gestion de )?(la )?calidad/.test(normalizar(u.cargo));
}

const IND_CAMPOS_FICHA = [
  ["proceso", 1, "Proceso"], ["fechaCreacion", 2, "Fecha creación"], ["codigo", 3, "Código"], ["version", 4, "Versión"],
  ["nombre", 5, "Nombre del indicador"], ["objetivoEstrategico", 6, "Objetivo estratégico"], ["objetivoIndicador", 7, "Objetivo del indicador"],
  ["responsableMedicion", 8, "Responsable medición"], ["responsableAnalisis", 9, "Responsable análisis"], ["fuenteIndicador", 10, "Fuente del indicador"],
  ["fuenteDatos", 11, "Fuente de datos"], ["unidadMedida", 12, "Unidad de medida"], ["frecuenciaRecoleccion", 13, "Frecuencia de recolección"],
  ["frecuenciaMedicion", 14, "Frecuencia de medición"], ["tendencia", 15, "Tendencia"], ["tipoIndicador", 16, "Tipo de indicador"],
  ["numerador", 17, "Numerador (variable 1)"], ["denominador", 18, "Denominador (variable 2)"], ["metaVigencia", 19, "Meta vigencia"], ["metaObjetiva", 20, "Meta objetiva"],
  ["estado", 21, "Estado del indicador"]
];

// ============================================================
// INDICADORES - MODIFICAR FICHA TÉCNICA (Coordinador de Calidad / Administrador)
// Cada cambio queda en la hoja HistorialFichaIndicadores (campo, antes, después, quién y cuándo)
// ============================================================
function actualizarFichaIndicador(indicadorId, datos, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    if (!puedeEditarFichaInd_(u)) return respuesta(false, null, "Solo el Coordinador de Calidad o el Administrador del Sistema pueden modificar la ficha técnica.");
    datos = datos || {};
    const txt = v => String(v == null ? "" : v).trim();
    if (!txt(datos.nombre) || !txt(datos.proceso) || !txt(datos.numerador) || !txt(datos.denominador) || !txt(datos.metaObjetiva))
      return respuesta(false, null, "Completa los campos obligatorios: nombre, proceso, numerador, denominador y meta objetiva.");
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = ss.getSheetByName("Indicadores");
    if (!hoja) return respuesta(false, null, "No se encontraron indicadores");
    const data = hoja.getDataRange().getValues();
    const idx = data.findIndex((r, i) => i > 0 && r[0] === indicadorId);
    if (idx === -1) return respuesta(false, null, "Indicador no encontrado");
    const fila = data[idx].slice();
    while (fila.length < 23) fila.push("");
    const antes = mapearIndicador(fila);
    const cambios = [];
    IND_CAMPOS_FICHA.forEach(([k, col, titulo]) => {
      if (!(k in datos)) return;
      let nuevo = txt(datos[k]);
      if (k === "fechaCreacion") {
        const m = nuevo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return;
        const fa = String(antes.fechaCreacion || "").trim(), d = fa.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if ((d ? d[3] + "-" + d[2] + "-" + d[1] : fa.slice(0, 10)) === nuevo) return;   // misma fecha, sin cambio
        const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (formatearFecha(fecha, "dd/MM/yyyy") === antes.fechaCreacion) return;
        cambios.push([titulo, antes.fechaCreacion, formatearFecha(fecha, "dd/MM/yyyy")]);
        fila[col] = fecha;
        return;
      }
      if (k === "estado") { nuevo = estadoIndicador_(nuevo); if (nuevo === estadoIndicador_(antes.estado)) return; cambios.push([titulo, estadoIndicador_(antes.estado), nuevo]); fila[col] = nuevo; return; }
      if (nuevo === txt(antes[k])) return;
      cambios.push([titulo, txt(antes[k]), nuevo]);
      fila[col] = nuevo;
    });
    if (!cambios.length) return respuesta(true, { cambios: 0, mensaje: "No hubo cambios" });
    hoja.getRange(idx + 1, 1, 1, fila.length).setValues([fila]);

    const hist = ss.getSheetByName("HistorialFichaIndicadores") || ss.insertSheet("HistorialFichaIndicadores");
    if (hist.getLastRow() === 0) hist.appendRow(["Indicador", "Nombre", "Fecha", "Usuario", "Cargo", "Campo", "Valor anterior", "Valor nuevo", "Motivo"]);
    const ahora = new Date();
    cambios.forEach(c => hist.appendRow([indicadorId, fila[5], ahora, u.usuario, u.cargo, c[0], c[1], c[2], txt(datos.motivo)]));
    // Socializa el cambio en la ventana emergente de Novedades (Novedades.gs)
    let novedad = "";
    if (datos.socializar !== false && typeof novPublicarAuto_ === "function") {
      const corto = v => { v = String(v || "(vacío)"); return v.length > 300 ? v.slice(0, 297) + "…" : v; };
      novedad = novPublicarAuto_({ modulo: "ind", tipo: "Cambio", titulo: "Cambio en la ficha técnica: " + fila[5],
        resumen: (fila[3] ? fila[3] + " · " : "") + fila[1] + ". Modificado por " + u.nombre + ".",
        pasos: [{ titulo: "Qué cambió en la ficha", texto: cambios.map(c => "• " + c[0] + ": «" + corto(c[1]) + "» → «" + corto(c[2]) + "»").join("\n"),
          porque: txt(datos.motivo) || "Actualización de la ficha técnica del indicador por parte de " + u.cargo + ".",
          paraque: "Para que los responsables de medir y analizar el indicador trabajen con la ficha vigente." }] }, u);
    }
    return respuesta(true, { cambios: cambios.length, novedad: novedad, mensaje: "Ficha técnica actualizada" });
  } catch (e) {
    Logger.log("ERROR actualizarFichaIndicador: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Historial de cambios de la ficha técnica de un indicador
function historialFichaIndicador_(ss, indicadorId) {
  const hist = ss.getSheetByName("HistorialFichaIndicadores");
  if (!hist || hist.getLastRow() < 2) return [];
  return hist.getDataRange().getValues().slice(1).filter(r => r[0] === indicadorId)
    .map(r => ({ fecha: formatearFecha(r[2], "dd/MM/yyyy hh:mm a"), usuario: String(r[3] || ""), campo: String(r[5] || ""),
      antes: String(r[6] == null ? "" : r[6]), despues: String(r[7] == null ? "" : r[7]), motivo: String(r[8] || "") })).reverse();
}

function obtenerDetalleIndicador(indicadorId, usuario) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = ss.getSheetByName("Indicadores");

    if (!hoja) {
      return respuesta(false, null, "No se encontraron indicadores");
    }

    const data = hoja.getDataRange().getValues();
    const fila = data.slice(1).find(r => r[0] === indicadorId);

    if (!fila) {
      return respuesta(false, null, "Indicador no encontrado");
    }

    const indicador = mapearIndicador(fila);
    indicador.estado = estadoIndicador_(indicador.estado);

    // Mediciones mensuales
    const hojaDatos = ss.getSheetByName("DatosIndicadores");
    let datosMensuales = [];

    if (hojaDatos && hojaDatos.getLastRow() > 1) {
      const datosRaw = hojaDatos.getDataRange().getValues();
      datosMensuales = datosRaw.slice(1)
        .filter(r => r[0] === indicadorId)
        .map(r => ({
          mes: r[1],
          valor: aNumero(r[2]),
          acumulado: aNumero(r[3]),
          fechaRegistro: formatearFecha(r[4], "dd/MM/yyyy hh:mm a"),
          variable1: aNumero(r[5]),
          variable2: aNumero(r[6]),
          analisis: r[7] || "",
          usuario: r[8] || "",
          vacio: !medicionConDatoInd_(r)
        }));
    }

    indicador.datosMensuales = datosMensuales;
    indicador.puedeEditarFicha = puedeEditarFichaInd_(usuario ? usuarioSD(usuario) : null);
    indicador.historialFicha = historialFichaIndicador_(ss, indicadorId);
    indicador.mesActual = new Date().getMonth();
    return respuesta(true, indicador);
  } catch (e) {
    Logger.log("ERROR obtenerDetalleIndicador: " + e.toString());
    return respuesta(false, null, "Error obteniendo detalle: " + e.toString());
  }
}

// ============================================================
// INDICADORES - REGISTRAR VALOR MENSUAL
// extra = { variable1, variable2, analisis, usuario } (opcional)
// Si ya existe un registro para el mismo indicador y mes, se actualiza.
// ============================================================
function guardarValorIndicador(indicadorId, mes, valor, extra) { seguridadRPC_();
  try {
    extra = extra || {};
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hojaDatos = obtenerHojaDatos(ss);

    const fila = [
      indicadorId,
      mes,
      valor === null || valor === undefined ? "" : valor,
      0, // Acumulado: se calcula en la vista
      new Date(),
      extra.variable1 === null || extra.variable1 === undefined ? "" : extra.variable1,
      extra.variable2 === null || extra.variable2 === undefined ? "" : extra.variable2,
      extra.analisis || "",
      extra.usuario || ""
    ];

    // Buscar registro existente del mismo mes
    const data = hojaDatos.getDataRange().getValues();
    let filaExistente = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === indicadorId && data[i][1] === mes) {
        filaExistente = i + 1;
        break;
      }
    }

    { const np = negarPermiso(extra.usuario, "ind", filaExistente > 0 ? "editar" : "crear"); if (np) return np; }
    if (filaExistente > 0) {
      hojaDatos.getRange(filaExistente, 1, 1, fila.length).setValues([fila]);
    } else {
      hojaDatos.appendRow(fila);
    }

    return respuesta(true, { mensaje: "Valor guardado exitosamente" });

  } catch (e) {
    Logger.log("ERROR guardarValorIndicador: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Obtiene (o crea) la hoja DatosIndicadores con todos los encabezados
function obtenerHojaDatos(ss) { seguridadRPC_();
  const hoja = ss.getSheetByName("DatosIndicadores") || ss.insertSheet("DatosIndicadores");

  if (hoja.getLastRow() === 0) {
    hoja.appendRow(ENCABEZADOS_DATOS);
  } else if (hoja.getLastColumn() < ENCABEZADOS_DATOS.length) {
    // Hoja creada con la versión anterior (5 columnas): completar encabezados
    hoja.getRange(1, 1, 1, ENCABEZADOS_DATOS.length).setValues([ENCABEZADOS_DATOS]);
  }
  return hoja;
}

// ============================================================
// NO CONFORMIDADES - Formato GC-FO-011 Plan de Acciones Correctivas
// Sección 1: Registro de la No Conformidad (+ Correcciones)
// Sección 2: Análisis de Causas
// Sección 3: Acciones Correctivas
// ============================================================
const NOMBRE_CARPETA_NC = "IMCOLMETRIC - No Conformidades (Evidencias)";
const MAX_ARCHIVO_MB = 10;
// true: los adjuntos se comparten "cualquier persona con el enlace (solo lectura)" para que
// todos los colaboradores puedan verlos en la ventana emergente. false: quedan privados.
const COMPARTIR_EVIDENCIAS_CON_ENLACE = true;

const HOJAS_NC = {
  principal: {
    nombre: "NoConformidades",
    encabezados: ["N°", "Fecha Identificación", "Fecha Registro", "Descripción", "Requisito Aplicable",
                  "Evidencia Objetiva", "Estado", "% Cumplimiento", "Registrado Por", "Fecha Sistema",
                  "Actualizado Por", "Fecha Actualización", "Proceso"]
  },
  correcciones: {
    nombre: "NC_Correcciones",
    encabezados: ["N° NC", "#", "Corrección", "Fecha Implementación", "Evidencia Implementación"]
  },
  causas: {
    nombre: "NC_Causas",
    encabezados: ["N° NC", "#", "Descripción Causa"]
  },
  acciones: {
    nombre: "NC_AccionesCorrectivas",
    encabezados: ["N° NC", "#", "Acción Correctiva", "Fecha Implementación", "Evidencia Implementación",
                  "Archivo", "% Cumplimiento", "Estado"]
  }
};

function hojaNC(ss, clave) { seguridadRPC_();
  const def = HOJAS_NC[clave];
  const hoja = ss.getSheetByName(def.nombre) || ss.insertSheet(def.nombre);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(def.encabezados);
    hoja.getRange(1, 1, 1, def.encabezados.length).setFontWeight("bold");
    hoja.setFrozenRows(1);
  } else if (hoja.getLastColumn() < def.encabezados.length) {
    // Hoja de una versión anterior: se agregan los encabezados nuevos (p. ej. «Proceso»)
    const desde = hoja.getLastColumn() + 1;
    hoja.getRange(1, desde, 1, def.encabezados.length - desde + 1).setValues([def.encabezados.slice(desde - 1)]).setFontWeight("bold");
  }
  return hoja;
}

// Procesos para el campo «Proceso» de la no conformidad (matriz de rutas documentales)
function procesosNC() { seguridadRPC_();
  try { return respuesta(true, leerRutasSD(SpreadsheetApp.openById(ID_HOJA)).map(r => r.proceso)); }
  catch (e) { return respuesta(false, null, e.toString()); }
}

// Filas de datos (sin encabezado) con el ancho de la definición
function filasNC(hoja, clave) { seguridadRPC_();
  const ancho = HOJAS_NC[clave].encabezados.length;
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues();
}

// 0% → No Iniciado | 10% a 90% → En Curso | 100% → Terminado
function estadoAccionNC(porcentaje) { seguridadRPC_();
  const p = Number(porcentaje) || 0;
  if (p <= 0) return "No Iniciado";
  if (p >= 100) return "Terminado";
  return "En Curso";
}

// Estado general de la NC a partir de sus acciones correctivas
function resumenNC(acciones) { seguridadRPC_();
  if (!acciones.length) return { estado: "Abierta", cumplimiento: 0 };
  const total = acciones.reduce((s, a) => s + (Number(a.cumplimiento) || 0), 0);
  const cumplimiento = Math.round(total / acciones.length);
  let estado = "En Curso";
  if (acciones.every(a => (Number(a.cumplimiento) || 0) >= 100)) estado = "Cerrada";
  else if (acciones.every(a => (Number(a.cumplimiento) || 0) <= 0)) estado = "Abierta";
  return { estado: estado, cumplimiento: cumplimiento };
}

// "2026-10-01" → Date (evita que Sheets interprete la fecha según la configuración regional)
function aFechaNC(valor) { seguridadRPC_();
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : "";
}

function siguienteNumeroNC(filas) { seguridadRPC_();
  const anio = new Date().getFullYear();
  const prefijo = "NC-" + anio + "-";
  let max = 0;
  filas.forEach(r => {
    const n = String(r[0]);
    if (n.indexOf(prefijo) === 0) max = Math.max(max, parseInt(n.slice(prefijo.length), 10) || 0);
  });
  return prefijo + ("00" + (max + 1)).slice(-3);
}

// ---------- Listado ----------
function obtenerNoConformidades() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const principal = filasNC(hojaNC(ss, "principal"), "principal").filter(r => r[0]);
    const acciones = filasNC(hojaNC(ss, "acciones"), "acciones");

    const lista = principal.map(r => {
      const numero = String(r[0]);
      return {
        numero: numero,
        fechaIdentificacion: formatearFecha(r[1], "yyyy-MM-dd"),
        fechaRegistro: formatearFecha(r[2], "yyyy-MM-dd"),
        descripcion: r[3],
        requisito: r[4],
        estado: r[6] || "Abierta",
        cumplimiento: Number(r[7]) || 0,
        registradoPor: r[8], proceso: String(r[12] || "").trim(),
        acciones: acciones.filter(a => String(a[0]) === numero).length,
        // Archivos de evidencia de las acciones correctivas (columna Archivo)
        adjuntos: acciones.filter(a => String(a[0]) === numero && /^https?:/i.test(String(a[5] || "").trim()))
          .map(a => ({ n: Number(a[1]) || 0, archivo: String(a[5]).trim() }))
      };
    });

    lista.sort((a, b) => b.numero.localeCompare(a.numero));
    return respuesta(true, lista);
  } catch (e) {
    Logger.log("ERROR obtenerNoConformidades: " + e.toString());
    return respuesta(false, null, "Error obteniendo no conformidades: " + e.toString());
  }
}

// ---------- Detalle ----------
function obtenerNoConformidad(numero) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const r = filasNC(hojaNC(ss, "principal"), "principal").find(f => String(f[0]) === String(numero));
    if (!r) return respuesta(false, null, "No conformidad no encontrada");

    const hijas = clave => filasNC(hojaNC(ss, clave), clave)
      .filter(f => String(f[0]) === String(numero))
      .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0));

    return respuesta(true, {
      numero: String(r[0]),
      fechaIdentificacion: formatearFecha(r[1], "yyyy-MM-dd"),
      fechaRegistro: formatearFecha(r[2], "yyyy-MM-dd"),
      descripcion: r[3],
      requisito: r[4],
      evidenciaObjetiva: r[5],
      estado: r[6],
      cumplimiento: Number(r[7]) || 0,
      registradoPor: r[8],
      actualizadoPor: r[10],
      fechaActualizacion: formatearFecha(r[11], "dd/MM/yyyy hh:mm a"),
      proceso: String(r[12] || "").trim(),
      correcciones: hijas("correcciones").map(f => ({
        correccion: f[2], fecha: formatearFecha(f[3], "yyyy-MM-dd"), evidencia: f[4]
      })),
      causas: hijas("causas").map(f => ({ causa: f[2] })),
      acciones: hijas("acciones").map(f => ({
        accion: f[2], fecha: formatearFecha(f[3], "yyyy-MM-dd"), evidencia: f[4],
        archivo: f[5], cumplimiento: Number(f[6]) || 0, estado: f[7] || estadoAccionNC(f[6])
      }))
    });
  } catch (e) {
    Logger.log("ERROR obtenerNoConformidad: " + e.toString());
    return respuesta(false, null, "Error obteniendo la no conformidad: " + e.toString());
  }
}

// Todas las no conformidades con su detalle (informe consolidado en PDF)
function obtenerNoConformidadesCompletas() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hijas = {};
    ["correcciones", "causas", "acciones"].forEach(k => { hijas[k] = filasNC(hojaNC(ss, k), k).sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0)); });
    const de = (k, n) => hijas[k].filter(f => String(f[0]) === n);
    const lista = filasNC(hojaNC(ss, "principal"), "principal").filter(r => r[0]).map(r => {
      const n = String(r[0]);
      return {
        numero: n, fechaIdentificacion: formatearFecha(r[1], "yyyy-MM-dd"), fechaRegistro: formatearFecha(r[2], "yyyy-MM-dd"),
        descripcion: r[3], requisito: r[4], evidenciaObjetiva: r[5], estado: r[6] || "Abierta", cumplimiento: Number(r[7]) || 0,
        registradoPor: r[8], actualizadoPor: r[10], fechaActualizacion: formatearFecha(r[11], "dd/MM/yyyy hh:mm a"), proceso: String(r[12] || "").trim(),
        correcciones: de("correcciones", n).map(f => ({ correccion: f[2], fecha: formatearFecha(f[3], "yyyy-MM-dd"), evidencia: f[4] })),
        causas: de("causas", n).map(f => ({ causa: f[2] })),
        acciones: de("acciones", n).map(f => ({ accion: f[2], fecha: formatearFecha(f[3], "yyyy-MM-dd"), evidencia: f[4], archivo: f[5],
          cumplimiento: Number(f[6]) || 0, estado: f[7] || estadoAccionNC(f[6]) }))
      };
    });
    lista.sort((a, b) => a.numero.localeCompare(b.numero));
    return respuesta(true, lista);
  } catch (e) {
    return respuesta(false, null, "Error obteniendo las no conformidades: " + e.toString());
  }
}

// ---------- Guardar (crear o actualizar) ----------
function guardarNoConformidad(datos) { seguridadRPC_();
  { const np = negarPermiso(datos && datos.usuario, "nc", datos && String(datos.numero || "").trim() ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    if (!datos || !String(datos.descripcion || "").trim() || !datos.fechaIdentificacion) {
      return respuesta(false, null, "La fecha de identificación y la descripción son obligatorias");
    }
    lock.waitLock(20000);

    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hojaP = hojaNC(ss, "principal");
    const principal = filasNC(hojaP, "principal");
    const ahora = new Date();

    let numero = String(datos.numero || "").trim();
    let filaExistente = -1;
    if (numero) {
      filaExistente = principal.findIndex(r => String(r[0]) === numero);
      if (filaExistente === -1) return respuesta(false, null, "No conformidad no encontrada: " + numero);
    } else {
      numero = siguienteNumeroNC(principal);
    }

    const texto = v => String(v == null ? "" : v).trim();
    const porcentaje = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    const correcciones = (datos.correcciones || []).filter(c => texto(c.correccion) || texto(c.evidencia) || c.fecha);
    const causas = (datos.causas || []).filter(c => texto(c.causa));
    const acciones = (datos.acciones || [])
      .filter(a => texto(a.accion) || texto(a.evidencia) || a.fecha || texto(a.archivo))
      .map(a => Object.assign({}, a, { cumplimiento: porcentaje(a.cumplimiento) }));
    const resumen = resumenNC(acciones);

    // Hoja principal
    if (filaExistente === -1) {
      hojaP.appendRow([
        numero, aFechaNC(datos.fechaIdentificacion), ahora, texto(datos.descripcion), texto(datos.requisito),
        texto(datos.evidenciaObjetiva), resumen.estado, resumen.cumplimiento,
        texto(datos.usuario), ahora, "", "", texto(datos.proceso)
      ]);
    } else {
      const fila = filaExistente + 2;
      hojaP.getRange(fila, 2).setValue(aFechaNC(datos.fechaIdentificacion));
      hojaP.getRange(fila, 4, 1, 5).setValues([[
        texto(datos.descripcion), texto(datos.requisito), texto(datos.evidenciaObjetiva),
        resumen.estado, resumen.cumplimiento
      ]]);
      hojaP.getRange(fila, 11, 1, 2).setValues([[texto(datos.usuario), ahora]]);
      if (datos.proceso !== undefined) hojaP.getRange(fila, 13).setValue(texto(datos.proceso));
    }

    // Secciones repetibles
    reemplazarFilasNC(ss, "correcciones", numero, correcciones.map((c, i) => [
      numero, i + 1, texto(c.correccion), aFechaNC(c.fecha), texto(c.evidencia)
    ]));
    reemplazarFilasNC(ss, "causas", numero, causas.map((c, i) => [numero, i + 1, texto(c.causa)]));
    reemplazarFilasNC(ss, "acciones", numero, acciones.map((a, i) => [
      numero, i + 1, texto(a.accion), aFechaNC(a.fecha), texto(a.evidencia), texto(a.archivo),
      a.cumplimiento, estadoAccionNC(a.cumplimiento)
    ]));

    return respuesta(true, { numero: numero, estado: resumen.estado, cumplimiento: resumen.cumplimiento });
  } catch (e) {
    Logger.log("ERROR guardarNoConformidad: " + e.toString());
    return respuesta(false, null, "Error guardando la no conformidad: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Reemplaza las filas de una NC en una hoja hija conservando las de las demás NC
function reemplazarFilasNC(ss, clave, numero, nuevas) { seguridadRPC_();
  const hoja = hojaNC(ss, clave);
  const ancho = HOJAS_NC[clave].encabezados.length;
  const resto = filasNC(hoja, clave).filter(r => r[0] !== "" && String(r[0]) !== numero);
  const todas = resto.concat(nuevas);

  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).clearContent();
  if (todas.length) hoja.getRange(2, 1, todas.length, ancho).setValues(todas);
}

// ---------- Archivos de evidencia (Google Drive) ----------
function subirArchivoNC(nombre, tipo, base64) { seguridadRPC_();
  return subirArchivoDrive(NOMBRE_CARPETA_NC, nombre, tipo, base64);
}

// Sube un archivo a una carpeta de Drive (la crea si no existe) y devuelve su enlace
function subirArchivoDrive(nombreCarpeta, nombre, tipo, base64) { seguridadRPC_();
  try {
    // Sin datos: la función se ejecutó desde el editor (botón Ejecutar) o el navegador no envió el archivo
    if (!base64 || typeof base64 !== "string") {
      return respuesta(false, null, "No se recibió el contenido del archivo. Vuelve a seleccionarlo. " +
        "(Esta función se usa desde el portal; para probar desde el editor ejecuta probarSubidaDrive)");
    }
    const bytes = Utilities.base64Decode(base64);
    if (!bytes || !bytes.length) return respuesta(false, null, "El archivo está vacío o no se pudo leer. Vuelve a seleccionarlo.");
    if (bytes.length > MAX_ARCHIVO_MB * 1024 * 1024) {
      return respuesta(false, null, "El archivo supera " + MAX_ARCHIVO_MB + " MB");
    }
    const carpeta = carpetaSGC(nombreCarpeta);
    const archivo = carpeta.createFile(Utilities.newBlob(bytes, tipo || "application/octet-stream", nombre));
    if (COMPARTIR_EVIDENCIAS_CON_ENLACE) {
      try {
        archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {
        Logger.log("No se pudo compartir el archivo (política del dominio): " + e.toString());
      }
    }
    return respuesta(true, { url: archivo.getUrl(), nombre: archivo.getName() });
  } catch (e) {
    Logger.log("ERROR subirArchivoDrive: " + e.toString());
    return respuesta(false, null, "Error subiendo el archivo: " + e.toString());
  }
}

// ============================================================
// GESTIÓN DEL CAMBIO - Formato GC-FO-012 Planificación y Control de Cambios
// Hoja "GestionCambio": columna A = N° (CAM-2026-001); columnas B a W = las del formato,
// en el mismo orden, para poder pegar los registros del Excel directamente.
// ============================================================
const CAM_HOJA = "GestionCambio";
const CAM_CARPETA = "IMCOLMETRIC - Gestión del Cambio (Evidencias)";

const CAM_LISTAS = {
  origen: ["Administrativos", "Clientes", "Legislación", "Servicios", "Tecnologia", "Conocimiento"],
  tipo: ["Temporal", "Permanente", "Emergencia"],
  tipoImpacto: ["Ambiental", "Financiero", "Laboral", "Legal", "Locativos", "Operacionales", "Reputacional", "Sistemas de Gestión"],
  identificacion: ["Aspecto Ambiental", "Oportunidad", "Peligro", "Riesgo"],
  recursos: ["Humano", "Técnico", "Económico"],
  estado: ["Activo", "En proceso", "Terminado"],
  resultado: ["Eficaz", "No Eficaz"]
};

// [clave, encabezado]: A = N°, B..W = formato, X..AA = control del sistema
const CAM_COLUMNAS = [
  ["numero", "N°"],
  ["fechaSolicitud", "FECHA DE SOLICITUD"], ["solicitante", "NOMBRE DEL SOLICITANTE"], ["proceso", "PROCESO"],
  ["origen", "ORIGEN"], ["tipo", "TIPO"], ["descripcion", "DESCRIPCIÓN"], ["justificacion", "JUSTIFICACIÓN"],
  ["tipoImpacto", "TIPO DE IMPACTO"], ["identificacion", "IDENTIFICACIÓN DEL ESCENARIO"],
  ["descripcionEscenario", "DESCRIPCIÓN DEL ESCENARIO"], ["consecuencias", "CONSECUENCIAS"],
  ["seguimiento", "SEGUIMIENTO"], ["recursos", "RECURSOS"], ["actividad", "ACTIVIDAD"],
  ["fechaLimite", "FECHA LIMITE"], ["cumplimiento", "% DE CUMPLIMIENTO"], ["responsable", "RESPONSABLE"],
  ["controles", "CONTROLES"], ["estado", "ESTADO"], ["resultadoRevision", "RESULTADOS REVISIÓN CALIDAD"],
  ["observaciones", "OBSERVACIONES"], ["evidencia", "ADJUNTE EVIDENCIA"],
  ["registradoPor", "Registrado Por"], ["fechaRegistro", "Fecha Registro"],
  ["actualizadoPor", "Actualizado Por"], ["fechaActualizacion", "Fecha Actualización"],
  // Varias actividades por cambio: [{ actividad, responsable, fechaLimite, recursos }] (las columnas ACTIVIDAD, RESPONSABLE,
  // FECHA LIMITE y RECURSOS guardan el resumen para el formato y los reportes)
  ["actividades", "ACTIVIDADES (DETALLE)"],
  ["comentarioEficacia", "COMENTARIO EVALUACIÓN DE EFICACIA"],
  // Entrada del cambio, p. ej. la Oportunidad de mejora que lo originó (Acciones de Mejora → «Genera cambios en el sistema»)
  ["entrada", "ENTRADA"], ["entradaOP", "N° OPORTUNIDAD DE MEJORA"],
  // Riesgos identificados al implementar el cambio: [{ item, evento }] (item vacío = riesgo nuevo por registrar en la Matriz de Riesgos)
  ["riesgos", "RIESGOS IDENTIFICADOS (MATRIZ DE RIESGOS)"]
];
const CAM_COL = {};
CAM_COLUMNAS.forEach((c, i) => CAM_COL[c[0]] = i + 1);

function hojaCambiosCAM(ss) { seguridadRPC_();
  let hoja = ss.getSheetByName(CAM_HOJA);
  if (!hoja) hoja = ss.insertSheet(CAM_HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(CAM_COLUMNAS.map(c => c[1]));
    hoja.getRange(1, 1, 1, CAM_COLUMNAS.length).setFontWeight("bold");
    hoja.setFrozenRows(1);
    hoja.getRange(2, CAM_COL.cumplimiento, 999, 1).setNumberFormat("0%");
  } else if (hoja.getLastColumn() < CAM_COLUMNAS.length) {
    // Hoja de una versión anterior: se agregan los encabezados de las columnas nuevas
    const desde = hoja.getLastColumn() + 1;
    hoja.getRange(1, desde, 1, CAM_COLUMNAS.length - desde + 1).setValues([CAM_COLUMNAS.slice(desde - 1).map(c => c[1])]).setFontWeight("bold");
  }
  return hoja;
}

// Actividades del cambio: las guardadas en detalle o, en registros anteriores, la única actividad de las columnas del formato
function actividadesCAM(o) { seguridadRPC_();
  let lista = [];
  try { lista = JSON.parse(String(o.actividades || "") || "[]"); } catch (e) { lista = []; }
  lista = (Array.isArray(lista) ? lista : []).map(a => ({
    actividad: String(a.actividad || "").trim(), responsable: String(a.responsable || "").trim(),
    fechaLimite: String(a.fechaLimite || "").trim(), recursos: (Array.isArray(a.recursos) ? a.recursos : String(a.recursos || "").split(/\s*,\s*/)).filter(Boolean),
    control: String(a.control || "").trim(), evidencia: /^https?:\/\//i.test(String(a.evidencia || "")) ? String(a.evidencia).trim() : ""
  })).filter(a => a.actividad);
  if (!lista.length && String(o.actividad || "").trim()) lista = [{
    actividad: String(o.actividad).trim(), responsable: String(o.responsable || "").trim(),
    fechaLimite: formatearFecha(o.fechaLimite, "yyyy-MM-dd"), recursos: String(o.recursos || "").split(/\s*,\s*/).filter(Boolean),
    control: String(o.controles || "").trim(), evidencia: ""   // registros anteriores: el control general pasa a la actividad 1
  }];
  return lista;
}

// El formato guarda el % como fracción (1 = 100 %). Acepta también 0-100.
function porcentajeCAM(v) { seguridadRPC_();
  if (v === "" || v === null || v === undefined) return 0;
  let n = Number(String(v).replace("%", "").replace(",", "."));
  if (isNaN(n)) return 0;
  if (n <= 1 && String(v).indexOf("%") === -1) n = n * 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function estadoPorAvanceCAM(p) { seguridadRPC_();
  if (p >= 100) return "Terminado";
  return p > 0 ? "En proceso" : "Activo";
}

// Devuelve el valor de la lista oficial que coincide (sin importar mayúsculas/tildes)
function valorListaCAM(lista, v) { seguridadRPC_();
  const n = normalizar(v);
  return CAM_LISTAS[lista].find(x => normalizar(x) === n) || String(v || "").trim();
}

function siguienteNumeroCAM(numeros) { seguridadRPC_();
  const prefijo = "CAM-" + new Date().getFullYear() + "-";
  let max = 0;
  numeros.forEach(n => {
    n = String(n || "");
    if (n.indexOf(prefijo) === 0) max = Math.max(max, parseInt(n.slice(prefijo.length), 10) || 0);
  });
  return prefijo + ("00" + (max + 1)).slice(-3);
}

function aFechaCAM(valor) { seguridadRPC_();
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : "";
}

// Riesgos del cambio: se guardan como JSON [{ item, evento }]
function riesgosCAM_(v) {
  try { const l = JSON.parse(String(v || "") || "[]"); return Array.isArray(l) ? l.map(x => ({ item: Number(x.item) || "", evento: String(x.evento || "").trim() })).filter(x => x.item || x.evento) : []; }
  catch (e) { return []; }
}
function filaACambioCAM(r) { seguridadRPC_();
  const o = {};
  CAM_COLUMNAS.forEach((c, i) => o[c[0]] = r[i]);
  const evidencia = String(o.evidencia || "").trim();
  return {
    numero: String(o.numero || ""),
    fechaSolicitud: formatearFecha(o.fechaSolicitud, "yyyy-MM-dd"),
    solicitante: String(o.solicitante || ""), proceso: String(o.proceso || ""),
    origen: valorListaCAM("origen", o.origen), tipo: valorListaCAM("tipo", o.tipo),
    descripcion: String(o.descripcion || ""), justificacion: String(o.justificacion || ""),
    tipoImpacto: valorListaCAM("tipoImpacto", o.tipoImpacto), identificacion: valorListaCAM("identificacion", o.identificacion),
    descripcionEscenario: String(o.descripcionEscenario || ""), consecuencias: String(o.consecuencias || ""),
    seguimiento: String(o.seguimiento || ""), recursos: valorListaCAM("recursos", o.recursos),
    actividad: String(o.actividad || ""), fechaLimite: formatearFecha(o.fechaLimite, "yyyy-MM-dd"),
    cumplimiento: porcentajeCAM(o.cumplimiento), responsable: String(o.responsable || ""),
    controles: String(o.controles || ""),
    estado: o.estado ? valorListaCAM("estado", o.estado) : estadoPorAvanceCAM(porcentajeCAM(o.cumplimiento)),
    resultadoRevision: valorListaCAM("resultado", o.resultadoRevision), comentarioEficacia: String(o.comentarioEficacia || ""),
    observaciones: String(o.observaciones || ""),
    evidencia: /^https?:\/\//i.test(evidencia) ? evidencia : "",   // "Adjunte evidencia" del Excel = sin archivo
    registradoPor: String(o.registradoPor || ""), fechaRegistro: formatearFecha(o.fechaRegistro, "dd/MM/yyyy"),
    actualizadoPor: String(o.actualizadoPor || ""), fechaActualizacion: formatearFecha(o.fechaActualizacion, "dd/MM/yyyy HH:mm"),
    actividades: actividadesCAM(o),
    entrada: String(o.entrada || ""), entradaOP: Number(o.entradaOP) || "",
    riesgos: riesgosCAM_(o.riesgos)
  };
}

// ---------- Consultas ----------
function obtenerCambiosCAM() { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaCambiosCAM(ss);
    if (hoja.getLastRow() < 2) return respuesta(true, []);
    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, CAM_COLUMNAS.length).getValues();

    // Registros pegados desde el Excel sin N°: se numeran en orden
    const sinNumero = [];
    datos.forEach((r, i) => { if (!String(r[0]).trim() && r.slice(1, 23).some(v => String(v).trim())) sinNumero.push(i); });
    if (sinNumero.length) {
      lock.waitLock(20000);
      const numeros = datos.map(r => r[0]);
      sinNumero.forEach(i => {
        const n = siguienteNumeroCAM(numeros);
        numeros[i] = n; datos[i][0] = n;
        hoja.getRange(i + 2, 1).setValue(n);
      });
    }
    const lista = datos.filter(r => String(r[0]).trim()).map(filaACambioCAM).reverse();
    return respuesta(true, lista);
  } catch (e) {
    Logger.log("ERROR obtenerCambiosCAM: " + e.toString());
    return respuesta(false, null, "Error obteniendo los cambios: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function obtenerConfigCAM() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const procesos = leerRutasSD(ss).map(r => r.proceso);
    const data = inicializarHojaUsuarios().getDataRange().getValues();
    const cols = columnasUsuarios(data[0]);
    const cargos = {}, nombres = {};
    data.slice(1).filter(f => usuarioActivo(f, cols)).forEach(f => {
      const c = String(campo(f, cols, "cargo") || "").trim();
      const n = String(campo(f, cols, "nombre") || "").trim();
      if (c) cargos[normalizar(c)] = c;
      if (n) nombres[normalizar(n)] = n;
    });
    return respuesta(true, {
      listas: CAM_LISTAS,
      procesos: procesos,
      responsables: Object.values(cargos).sort((a, b) => a.localeCompare(b, "es")),
      solicitantes: Object.values(nombres).sort((a, b) => a.localeCompare(b, "es"))
    });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// ---------- Guardar (crear o editar) ----------
function guardarCambioCAM(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "cam", String(datos && datos.numero || "").trim() ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const texto = v => String(v == null ? "" : v).trim();
    // Varias actividades, cada una con responsable, fecha límite y recursos. Las columnas del formato llevan el resumen.
    const acts = (Array.isArray(datos.actividades) ? datos.actividades : []).map(a => ({
      actividad: texto(a.actividad), responsable: texto(a.responsable), fechaLimite: texto(a.fechaLimite),
      recursos: (Array.isArray(a.recursos) ? a.recursos : texto(a.recursos).split(/\s*,\s*/)).map(texto).filter(Boolean),
      control: texto(a.control), evidencia: texto(a.evidencia)
    })).filter(a => a.actividad || a.responsable || a.fechaLimite || a.control || a.evidencia);
    if (acts.length) {
      const inc = acts.map((a, i) => [!a.actividad ? "actividad" : "", !a.responsable ? "responsable" : "", !a.fechaLimite ? "fecha límite" : ""]
        .filter(Boolean).map(x => x + " de la actividad " + (i + 1))).reduce((x, y) => x.concat(y), []);
      if (inc.length) return respuesta(false, null, "Completa: " + inc.join(", "));
      const unicos = l => l.filter((v, i, a) => v && a.indexOf(v) === i);
      datos.actividad = acts.length > 1 ? acts.map((a, i) => (i + 1) + ". " + a.actividad).join("\n") : acts[0].actividad;
      datos.responsable = unicos(acts.map(a => a.responsable)).join(", ");
      datos.fechaLimite = acts.map(a => a.fechaLimite).sort().pop();   // la última fecha límite del plan
      datos.recursos = unicos(acts.reduce((x, a) => x.concat(a.recursos), [])).join(", ");
      // CONTROLES del formato: el control y/o evidencia de cada actividad
      const ctl = acts.filter(a => a.control);
      if (ctl.length) datos.controles = acts.length > 1 ? acts.map((a, i) => a.control ? (i + 1) + ". " + a.control : "").filter(Boolean).join("\n") : ctl[0].control;
    }
    const faltan = [];
    [["fechaSolicitud", "fecha de solicitud"], ["solicitante", "solicitante"], ["proceso", "proceso"],
     ["origen", "origen"], ["tipo", "tipo"], ["descripcion", "descripción"], ["justificacion", "justificación"],
     ["tipoImpacto", "tipo de impacto"], ["identificacion", "identificación del escenario"],
     ["actividad", "actividad"], ["fechaLimite", "fecha límite"], ["responsable", "responsable"]]
      .forEach(([k, n]) => { if (!texto(datos[k])) faltan.push(n); });
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));

    const actor = usuarioSD(usuario);
    const nombreActor = actor ? actor.nombre : texto(usuario);
    const p = Math.max(0, Math.min(100, Math.round(Number(datos.cumplimiento) || 0)));
    // Implementado el cambio, se identifican sus riesgos: de la Matriz de Riesgos o nuevos («Otro»)
    const conRiesgos = Array.isArray(datos.riesgos);
    const riesgos = conRiesgos ? riesgosCAM_(JSON.stringify(datos.riesgos)) : null;

    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaCambiosCAM(ss);
    const numeros = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];

    let numero = texto(datos.numero);
    let fila = -1;
    if (numero) {
      const i = numeros.findIndex(n => normalizar(n) === normalizar(numero));
      if (i === -1) return respuesta(false, null, "No existe el cambio " + numero);
      fila = i + 2;
    } else {
      numero = siguienteNumeroCAM(numeros);
    }

    const valores = {
      numero: numero, fechaSolicitud: aFechaCAM(datos.fechaSolicitud), solicitante: texto(datos.solicitante),
      proceso: texto(datos.proceso), origen: texto(datos.origen), tipo: texto(datos.tipo),
      descripcion: texto(datos.descripcion), justificacion: texto(datos.justificacion),
      tipoImpacto: texto(datos.tipoImpacto), identificacion: texto(datos.identificacion),
      descripcionEscenario: texto(datos.descripcionEscenario), consecuencias: texto(datos.consecuencias),
      seguimiento: agregarSeguimiento_("", datos.seguimientoNuevo != null ? datos.seguimientoNuevo : datos.seguimiento, nombreActor), recursos: texto(datos.recursos), actividad: texto(datos.actividad),
      fechaLimite: aFechaCAM(datos.fechaLimite), cumplimiento: p / 100, responsable: texto(datos.responsable),
      controles: texto(datos.controles), estado: estadoPorAvanceCAM(p),
      resultadoRevision: p >= 100 ? texto(datos.resultadoRevision) : "",
      comentarioEficacia: p >= 100 ? texto(datos.comentarioEficacia) : "",
      observaciones: agregarSeguimiento_("", datos.observacionesNuevo != null ? datos.observacionesNuevo : datos.observaciones, nombreActor), evidencia: texto(datos.evidencia),
      actividades: acts.length ? JSON.stringify(acts) : "",
      riesgos: riesgos ? JSON.stringify(riesgos) : ""
    };
    if (!riesgos && fila !== -1) valores.riesgos = hoja.getRange(fila, CAM_COL.riesgos).getValue();
    if (p >= 100 && !riesgosCAM_(valores.riesgos).length)
      return respuesta(false, null, "El cambio quedó implementado: identifica sus riesgos (de la Matriz de Riesgos o uno nuevo con «Otro») antes de terminarlo.");
    const ahora = new Date();
    // Cambio que nace de una Oportunidad de mejora: queda amarrado a ella (una sola vez)
    const nOP = Number(datos.entradaOP) || 0;
    let hojaOp = null, filaOp = -1;
    if (fila === -1 && nOP) {
      hojaOp = hojaOP(ss, OP_HOJA, OP_COLUMNAS.map(c => c[1]));
      const nums = hojaOp.getLastRow() > 1 ? hojaOp.getRange(2, 1, hojaOp.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0) : [];
      const i = nums.indexOf(nOP);
      if (i !== -1) {
        filaOp = i + 2;
        const ya = String(hojaOp.getRange(filaOp, OP_COL.cambioAsociado).getValue() || "").trim();
        if (ya) return respuesta(false, null, "La oportunidad de mejora " + nOP + " ya tiene el cambio " + ya + " en Gestión del Cambio.");
      }
      valores.entrada = texto(datos.entrada) || ("Oportunidad de mejora N° " + ("0" + nOP).slice(-2));
      valores.entradaOP = nOP;
    }
    if (fila === -1) {
      Object.assign(valores, { registradoPor: nombreActor, fechaRegistro: ahora, actualizadoPor: "", fechaActualizacion: "" });
      hoja.appendRow(CAM_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]]));
      fila = hoja.getLastRow();
      if (filaOp !== -1) hojaOp.getRange(filaOp, OP_COL.cambioAsociado).setValue(numero);
    } else {
      // Conserva quién y cuándo lo registró
      const actual = hoja.getRange(fila, 1, 1, CAM_COLUMNAS.length).getValues()[0];
      Object.assign(valores, {
        registradoPor: actual[CAM_COL.registradoPor - 1], fechaRegistro: actual[CAM_COL.fechaRegistro - 1],
        actualizadoPor: nombreActor, fechaActualizacion: ahora,
        // Seguimiento y observaciones: lo ya escrito queda fijo, solo se agrega
        seguimiento: agregarSeguimiento_(actual[CAM_COL.seguimiento - 1], datos.seguimientoNuevo, nombreActor),
        observaciones: agregarSeguimiento_(actual[CAM_COL.observaciones - 1], datos.observacionesNuevo, nombreActor),
        entrada: actual[CAM_COL.entrada - 1], entradaOP: actual[CAM_COL.entradaOP - 1]
      });
      hoja.getRange(fila, 1, 1, CAM_COLUMNAS.length).setValues([CAM_COLUMNAS.map(c => valores[c[0]])]);
    }
    hoja.getRange(fila, CAM_COL.cumplimiento).setNumberFormat("0%");
    return respuesta(true, { numero: numero, estado: valores.estado, riesgosNuevos: riesgosCAM_(valores.riesgos).filter(x => !x.item).map(x => x.evento) });
  } catch (e) {
    Logger.log("ERROR guardarCambioCAM: " + e.toString());
    return respuesta(false, null, "Error guardando el cambio: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Actualización rápida del avance desde el tablero
function actualizarAvanceCAM(numero, porcentaje, resultadoRevision, observaciones, evidencia, usuario, comentarioEficacia) { seguridadRPC_();
  { const np = negarPermiso(usuario, "cam", "editar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaCambiosCAM(ss);
    if (hoja.getLastRow() < 2) return respuesta(false, null, "No hay cambios registrados");
    const numeros = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
    const i = numeros.findIndex(n => normalizar(n) === normalizar(numero));
    if (i === -1) return respuesta(false, null, "No existe el cambio " + numero);
    const fila = i + 2;
    const p = Math.max(0, Math.min(100, Math.round(Number(porcentaje) || 0)));
    const actor = usuarioSD(usuario);
    if (p >= 100 && !riesgosCAM_(hoja.getRange(fila, CAM_COL.riesgos).getValue()).length)
      return respuesta(false, null, "Para terminar el cambio identifica sus riesgos: ábrelo con «Editar» y, en Seguimiento, escoge los riesgos de la matriz o escribe uno nuevo con «Otro».");

    hoja.getRange(fila, CAM_COL.cumplimiento).setValue(p / 100).setNumberFormat("0%");
    hoja.getRange(fila, CAM_COL.estado).setValue(estadoPorAvanceCAM(p));
    hoja.getRange(fila, CAM_COL.resultadoRevision).setValue(p >= 100 ? String(resultadoRevision || "").trim() : "");
    if (comentarioEficacia !== null && comentarioEficacia !== undefined)
      hoja.getRange(fila, CAM_COL.comentarioEficacia).setValue(p >= 100 ? String(comentarioEficacia).trim() : "");
    // Observaciones: nueva entrada que se agrega al historial (lo anterior no se modifica)
    if (observaciones !== null && observaciones !== undefined && String(observaciones).trim()) {
      const celda = hoja.getRange(fila, CAM_COL.observaciones);
      celda.setValue(agregarSeguimiento_(celda.getValue(), observaciones, actor ? actor.nombre : String(usuario || "")));
    }
    if (evidencia !== null && evidencia !== undefined) {
      hoja.getRange(fila, CAM_COL.evidencia).setValue(String(evidencia).trim());
    }
    hoja.getRange(fila, CAM_COL.actualizadoPor, 1, 2).setValues([[actor ? actor.nombre : String(usuario || ""), new Date()]]);
    return respuesta(true, { numero: numeros[i], estado: estadoPorAvanceCAM(p) });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function subirArchivoCAM(nombre, tipo, base64) { seguridadRPC_();
  return subirArchivoDrive(CAM_CARPETA, nombre, tipo, base64);
}

// ============================================================
// MATRIZ DE RIESGOS - Formato GC-FO-001
// Hoja "MatrizRiesgos": columnas A a AE iguales al formato (se pueden pegar los
// registros del Excel desde la fila 2) + columnas de control del sistema.
// RI = Probabilidad × Impacto (inherente), RR = Probabilidad × Impacto (residual)
// Zona: menor a 5 Bajo · menor a 12 Moderado · 12 o más Alto
// ============================================================
const MR_HOJA = "MatrizRiesgos";
const MR_CARPETA = "IMCOLMETRIC - Matriz de Riesgos (Evidencias)";
// Parámetro: ¿la evidencia de cada control (texto y archivo) es obligatoria? true = obligatoria · false = opcional
const MR_EVIDENCIA_OBLIGATORIA = false;

const MR_LISTAS = {
  tipoRiesgo: ["Riesgo Estratégico", "Riesgo Cliente o Imagen", "Riesgos Operativos",
               "Riesgos Legales o Cumplimiento", "Riesgos Tecnológicos", "Riesgos Imparcialidad"],
  solidez: ["Fuerte", "Moderado", "Débil"],
  opcionManejo: ["Reducir", "Asumir", "Evitar", "Compartir", "Eliminar", "Minimizar"],
  eficacia: ["Eficaz", "No Eficaz"]
};

const MR_COLUMNAS = [
  ["item", "Número de ítem"], ["fecha", "Fecha"], ["proceso", "Proceso"], ["objetivoEstrategico", "Objetivo Estratégico Asociado"],
  ["evento", "Evento (Riesgo)"], ["causas", "Causas del Riesgo"], ["consecuencias", "Consecuencias"], ["tipoRiesgo", "Tipo de Riesgo"],
  ["probInh", "Probabilidad"], ["impInh", "Impacto"], ["ri", "RI"], ["zonaInh", "Zona de Riesgo Inherente"],
  ["controles", "Controles"], ["solidez", "Solidez conjunto de controles"], ["evidenciaControl", "Evidencia del control"],
  ["adjuntoControl", "Adjunte Evidencia del control"],
  ["probRes", "Probabilidad"], ["impRes", "Impacto"], ["rr", "RR"], ["zonaRes", "Zona de Riesgo Residual"],
  ["opcionManejo", "Opciones de Manejo"], ["acciones", "Acciones de mejora o de control propuestas"],
  ["responsableEjecucion", "Responsable de la ejecución (Cargo)"], ["periodicidad", "Fecha de Ejecución o periodicidad"],
  ["corteMonitoreo", "Corte de Monitoreo"], ["fechaAccion", "Fecha de Ejecución de la acción"],
  ["accionesRealizadas", "Acciones Realizadas"], ["evidenciaMonitoreo", "Evidencia"], ["responsableMonitoreo", "Responsable"],
  ["adjuntoAcciones", "Adjunte Evidencia Acciones Realizadas"], ["eficacia", "Eficacia"],
  ["registradoPor", "Registrado Por"], ["fechaRegistro", "Fecha Registro"],
  ["actualizadoPor", "Actualizado Por"], ["fechaActualizacion", "Fecha Actualización"],
  ["comentarioEficacia", "Comentario evaluación de eficacia"],
  // Varios controles y varias acciones por riesgo (JSON). Las columnas Controles, Solidez, Evidencia, Acciones,
  // Responsable y Periodicidad guardan el resumen para el formato y los reportes.
  ["controlesDetalle", "Controles (detalle)"], ["accionesDetalle", "Acciones propuestas (detalle)"],
  // Riesgo identificado al implementar un cambio (Gestión del Cambio)
  ["entrada", "Entrada"], ["cambioAsociado", "Cambio asociado"]
];
const MR_COL = {};
MR_COLUMNAS.forEach((c, i) => MR_COL[c[0]] = i + 1);

function hojaRiesgosMR(ss) { seguridadRPC_();
  let hoja = ss.getSheetByName(MR_HOJA);
  if (!hoja) hoja = ss.insertSheet(MR_HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(MR_COLUMNAS.map(c => c[1]));
    hoja.getRange(1, 1, 1, MR_COLUMNAS.length).setFontWeight("bold").setWrap(true);
    hoja.setFrozenRows(1);
  } else if (hoja.getLastColumn() < MR_COLUMNAS.length) {
    // Hoja de una versión anterior: se agregan los encabezados de las columnas nuevas
    const desde = hoja.getLastColumn() + 1;
    hoja.getRange(1, desde, 1, MR_COLUMNAS.length - desde + 1).setValues([MR_COLUMNAS.slice(desde - 1).map(c => c[1])]).setFontWeight("bold");
  }
  return hoja;
}

function zonaMR(valor) { seguridadRPC_();
  const v = Number(valor) || 0;
  if (!v) return "";
  return v < 5 ? "Bajo" : v < 12 ? "Moderado" : "Alto";
}

function nivelMR(v) { seguridadRPC_();
  const n = parseInt(v, 10);
  return n >= 1 && n <= 5 ? n : 0;
}

function valorListaMR(lista, v) { seguridadRPC_();
  const n = normalizar(String(v || "").replace(/\s+/g, " "));
  return MR_LISTAS[lista].find(x => normalizar(x) === n) || String(v || "").replace(/\s+/g, " ").trim();
}

function urlOVacioMR(v) { seguridadRPC_();
  const t = String(v || "").trim();
  return /^https?:\/\//i.test(t) ? t : "";   // "Adjunte evidencia" del Excel = sin archivo
}

function aFechaMR(valor) { seguridadRPC_();
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : "";
}

// Controles del riesgo: los guardados en detalle o, en registros anteriores, el único control de las columnas del formato
function controlesMR(o) { seguridadRPC_();
  const texto = v => String(v == null ? "" : v).trim();
  try { const l = JSON.parse(o.controlesDetalle || "[]"); if (Array.isArray(l) && l.length) return l.map(c => ({
    control: texto(c.control), solidez: valorListaMR("solidez", c.solidez), evidencia: texto(c.evidencia), adjunto: urlOVacioMR(c.adjunto) })); } catch (e) {}
  return texto(o.controles) ? [{ control: texto(o.controles), solidez: valorListaMR("solidez", o.solidez), evidencia: texto(o.evidenciaControl), adjunto: urlOVacioMR(o.adjuntoControl) }] : [];
}
function accionesMR(o) { seguridadRPC_();
  const texto = v => String(v == null ? "" : v).trim();
  try { const l = JSON.parse(o.accionesDetalle || "[]"); if (Array.isArray(l) && l.length) return l.map(a => ({
    accion: texto(a.accion), responsable: texto(a.responsable), periodicidad: texto(a.periodicidad),
    evidencia: texto(a.evidencia), adjunto: urlOVacioMR(a.adjunto) })); } catch (e) {}
  const per = o.periodicidad instanceof Date ? formatearFecha(o.periodicidad, "dd/MM/yyyy") : texto(o.periodicidad);
  return texto(o.acciones) ? [{ accion: texto(o.acciones), responsable: texto(o.responsableEjecucion), periodicidad: per }] : [];
}
// Solidez del conjunto: la del control más débil
function solidezConjuntoMR(ctrls) { seguridadRPC_();
  const orden = ["Débil", "Moderado", "Fuerte"];
  return ctrls.map(c => c.solidez).filter(s => orden.indexOf(s) !== -1).sort((a, b) => orden.indexOf(a) - orden.indexOf(b))[0] || "";
}

function filaARiesgoMR(r) { seguridadRPC_();
  const o = {};
  MR_COLUMNAS.forEach((c, i) => o[c[0]] = r[i]);
  const pI = nivelMR(o.probInh), iI = nivelMR(o.impInh), pR = nivelMR(o.probRes), iR = nivelMR(o.impRes);
  const ri = pI * iI, rr = pR * iR;   // se recalculan siempre (no dependen de fórmulas pegadas)
  const texto = v => String(v == null ? "" : v).trim();
  return {
    item: Number(o.item) || 0,
    fecha: formatearFecha(o.fecha, "yyyy-MM-dd"),
    proceso: texto(o.proceso).replace(/\s+/g, " "), objetivoEstrategico: texto(o.objetivoEstrategico),
    evento: texto(o.evento), causas: texto(o.causas), consecuencias: texto(o.consecuencias),
    tipoRiesgo: valorListaMR("tipoRiesgo", o.tipoRiesgo),
    probInh: pI, impInh: iI, ri: ri, zonaInh: zonaMR(ri),
    controles: texto(o.controles), solidez: valorListaMR("solidez", o.solidez),
    evidenciaControl: texto(o.evidenciaControl), adjuntoControl: urlOVacioMR(o.adjuntoControl),
    probRes: pR, impRes: iR, rr: rr, zonaRes: zonaMR(rr),
    opcionManejo: valorListaMR("opcionManejo", o.opcionManejo), acciones: texto(o.acciones),
    responsableEjecucion: texto(o.responsableEjecucion),
    periodicidad: o.periodicidad instanceof Date ? formatearFecha(o.periodicidad, "dd/MM/yyyy") : texto(o.periodicidad),
    corteMonitoreo: formatearFecha(o.corteMonitoreo, "yyyy-MM-dd"), fechaAccion: formatearFecha(o.fechaAccion, "yyyy-MM-dd"),
    accionesRealizadas: texto(o.accionesRealizadas), evidenciaMonitoreo: texto(o.evidenciaMonitoreo),
    responsableMonitoreo: texto(o.responsableMonitoreo), adjuntoAcciones: urlOVacioMR(o.adjuntoAcciones),
    eficacia: valorListaMR("eficacia", o.eficacia), comentarioEficacia: texto(o.comentarioEficacia),
    controlesDetalle: controlesMR(o), accionesDetalle: accionesMR(o),
    registradoPor: texto(o.registradoPor), fechaRegistro: formatearFecha(o.fechaRegistro, "dd/MM/yyyy"),
    actualizadoPor: texto(o.actualizadoPor), fechaActualizacion: formatearFecha(o.fechaActualizacion, "dd/MM/yyyy HH:mm"),
    entrada: texto(o.entrada), cambioAsociado: texto(o.cambioAsociado)
  };
}

// ---------- Consultas ----------
function obtenerRiesgosMR() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaRiesgosMR(ss);
    if (hoja.getLastRow() < 2) return respuesta(true, []);
    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, MR_COLUMNAS.length).getValues();
    const lista = datos
      .map((r, i) => ({ r: r, fila: i + 2 }))
      .filter(x => String(x.r[4] || "").trim())          // con evento
      .map(x => { const o = filaARiesgoMR(x.r); o.fila = x.fila; if (!o.item) o.item = x.fila - 1; return o; });
    return respuesta(true, lista);
  } catch (e) {
    Logger.log("ERROR obtenerRiesgosMR: " + e.toString());
    return respuesta(false, null, "Error obteniendo la matriz de riesgos: " + e.toString());
  }
}

function obtenerConfigMR() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const procesos = leerRutasSD(ss).map(r => r.proceso);
    const data = inicializarHojaUsuarios().getDataRange().getValues();
    const cols = columnasUsuarios(data[0]);
    const cargos = {};
    data.slice(1).filter(f => usuarioActivo(f, cols)).forEach(f => {
      const c = String(campo(f, cols, "cargo") || "").trim();
      if (c) cargos[normalizar(c)] = c;
    });
    return respuesta(true, {
      listas: MR_LISTAS, procesos: procesos, evidenciaObligatoria: MR_EVIDENCIA_OBLIGATORIA,
      responsables: Object.values(cargos).sort((a, b) => a.localeCompare(b, "es")),
      objetivos: objetivosEstrategicos(ss)
    });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// ---------- Guardar (crear o editar) ----------
function guardarRiesgoMR(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "mr", Number(datos && datos.fila) ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const texto = v => String(v == null ? "" : v).trim();
    const faltan = [];
    [["fecha", "fecha"], ["proceso", "proceso"], ["evento", "evento (riesgo)"], ["causas", "causas"],
     ["consecuencias", "consecuencias"], ["tipoRiesgo", "tipo de riesgo"]].forEach(([k, n]) => { if (!texto(datos[k])) faltan.push(n); });
    ["probInh", "impInh", "probRes", "impRes"].forEach(k => { if (!nivelMR(datos[k])) faltan.push({ probInh: "probabilidad inherente",
      impInh: "impacto inherente", probRes: "probabilidad residual", impRes: "impacto residual" }[k]); });
    // Controles: uno o más, cada uno con su solidez, evidencia y archivo de evidencia
    const ctrls = (Array.isArray(datos.controlesDetalle) ? datos.controlesDetalle : [])
      .map(c => ({ control: texto(c.control), solidez: valorListaMR("solidez", c.solidez), evidencia: texto(c.evidencia), adjunto: texto(c.adjunto) }))
      .filter(c => c.control || c.evidencia || c.adjunto || c.solidez);
    // Compatibilidad: quien envía solo los campos del formato (un control) se registra como un control
    const legado = !Array.isArray(datos.controlesDetalle);
    if (legado && texto(datos.controles)) ctrls.push({ control: texto(datos.controles), solidez: valorListaMR("solidez", datos.solidez), evidencia: texto(datos.evidenciaControl), adjunto: texto(datos.adjuntoControl) });
    if (!ctrls.length) faltan.push("al menos un control");
    ctrls.forEach((c, i) => {
      if (legado) { if (!c.solidez) faltan.push("solidez de los controles"); return; }
      const f = [!c.control && "descripción", !c.solidez && "solidez",
        MR_EVIDENCIA_OBLIGATORIA && !c.evidencia && "evidencia", MR_EVIDENCIA_OBLIGATORIA && !c.adjunto && "archivo de evidencia"].filter(Boolean);
      if (f.length) faltan.push("control " + (i + 1) + " (" + f.join(", ") + ")");
    });
    // Acciones de mejora o de control propuestas: cero, una o más, cada una con responsable y fecha o periodicidad
    const accs = (Array.isArray(datos.accionesDetalle) ? datos.accionesDetalle
        : (texto(datos.acciones) ? [{ accion: datos.acciones, responsable: datos.responsableEjecucion || "—", periodicidad: datos.periodicidad || "—" }] : []))
      .map(a => ({ accion: texto(a.accion), responsable: texto(a.responsable), periodicidad: texto(a.periodicidad), evidencia: texto(a.evidencia), adjunto: texto(a.adjunto) }))
      .filter(a => a.accion || a.responsable || a.periodicidad || a.evidencia || a.adjunto);
    accs.forEach((a, i) => {
      const f = [!a.accion && "acción", !a.responsable && "responsable", !a.periodicidad && "fecha o periodicidad",
        MR_EVIDENCIA_OBLIGATORIA && !a.evidencia && "evidencia", MR_EVIDENCIA_OBLIGATORIA && !a.adjunto && "archivo de evidencia"].filter(Boolean);
      if (f.length) faltan.push("acción " + (i + 1) + " (" + f.join(", ") + ")");
    });
    const num = (l, k) => l.map((x, i) => (l.length > 1 ? (i + 1) + ") " : "") + x[k]).join("\n");
    datos.controles = num(ctrls, "control"); datos.solidez = solidezConjuntoMR(ctrls);
    datos.evidenciaControl = num(ctrls, "evidencia"); datos.adjuntoControl = ctrls.length ? ctrls[0].adjunto : "";
    datos.acciones = num(accs, "accion"); datos.responsableEjecucion = [...new Set(accs.map(a => a.responsable))].join(" / ");
    datos.periodicidad = num(accs, "periodicidad");
    if (!texto(datos.opcionManejo)) faltan.push("opción de manejo");
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));

    const pI = nivelMR(datos.probInh), iI = nivelMR(datos.impInh), pR = nivelMR(datos.probRes), iR = nivelMR(datos.impRes);
    const actor = usuarioSD(usuario);
    const nombreActor = actor ? actor.nombre : texto(usuario);

    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaRiesgosMR(ss);
    const items = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0) : [];

    let fila = Number(datos.fila) || 0;
    let item = Number(datos.item) || 0;
    if (fila) {
      if (fila < 2 || fila > hoja.getLastRow() || (items[fila - 2] || fila - 1) !== item) {
        return respuesta(false, null, "El riesgo cambió en la hoja mientras lo editabas. Recarga e intenta de nuevo.");
      }
    } else {
      item = items.reduce((m, n) => Math.max(m, n), 0) + 1;
    }

    const valores = {
      item: item, fecha: aFechaMR(datos.fecha), proceso: texto(datos.proceso), objetivoEstrategico: texto(datos.objetivoEstrategico),
      evento: texto(datos.evento), causas: texto(datos.causas), consecuencias: texto(datos.consecuencias), tipoRiesgo: texto(datos.tipoRiesgo),
      probInh: pI, impInh: iI, ri: pI * iI, zonaInh: zonaMR(pI * iI),
      controles: texto(datos.controles), solidez: texto(datos.solidez), evidenciaControl: texto(datos.evidenciaControl),
      adjuntoControl: texto(datos.adjuntoControl),
      probRes: pR, impRes: iR, rr: pR * iR, zonaRes: zonaMR(pR * iR),
      opcionManejo: texto(datos.opcionManejo), acciones: texto(datos.acciones), responsableEjecucion: texto(datos.responsableEjecucion),
      periodicidad: texto(datos.periodicidad), corteMonitoreo: aFechaMR(datos.corteMonitoreo), fechaAccion: aFechaMR(datos.fechaAccion),
      accionesRealizadas: agregarSeguimiento_("", datos.accionesRealizadasNuevo != null ? datos.accionesRealizadasNuevo : datos.accionesRealizadas, nombreActor), evidenciaMonitoreo: texto(datos.evidenciaMonitoreo),
      responsableMonitoreo: texto(datos.responsableMonitoreo), adjuntoAcciones: texto(datos.adjuntoAcciones), eficacia: texto(datos.eficacia),
      comentarioEficacia: texto(datos.comentarioEficacia),
      controlesDetalle: JSON.stringify(ctrls), accionesDetalle: accs.length ? JSON.stringify(accs) : ""
    };
    const ahora = new Date();
    if (!fila) {
      Object.assign(valores, { registradoPor: nombreActor, fechaRegistro: ahora, actualizadoPor: "", fechaActualizacion: "" });
      const cam = texto(datos.cambioAsociado);
      if (cam) { valores.cambioAsociado = cam; valores.entrada = texto(datos.entrada) || "Gestión del Cambio " + cam; }
      hoja.appendRow(MR_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]]));
      fila = hoja.getLastRow();
      if (cam) enlazarRiesgoCAM_(ss, cam, texto(datos.eventoCambio), item, valores.evento);
    } else {
      const actual = hoja.getRange(fila, 1, 1, MR_COLUMNAS.length).getValues()[0];
      valores.entrada = actual[MR_COL.entrada - 1]; valores.cambioAsociado = actual[MR_COL.cambioAsociado - 1];
      Object.assign(valores, { registradoPor: actual[MR_COL.registradoPor - 1], fechaRegistro: actual[MR_COL.fechaRegistro - 1],
                               actualizadoPor: nombreActor, fechaActualizacion: ahora,
                               // Acciones realizadas: lo ya escrito queda fijo, solo se agrega
                               accionesRealizadas: agregarSeguimiento_(actual[MR_COL.accionesRealizadas - 1], datos.accionesRealizadasNuevo, nombreActor) });
      hoja.getRange(fila, 1, 1, MR_COLUMNAS.length).setValues([MR_COLUMNAS.map(c => valores[c[0]])]);
    }
    return respuesta(true, { item: item, fila: fila, ri: valores.ri, zonaInh: valores.zonaInh, rr: valores.rr, zonaRes: valores.zonaRes });
  } catch (e) {
    Logger.log("ERROR guardarRiesgoMR: " + e.toString());
    return respuesta(false, null, "Error guardando el riesgo: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// El riesgo nuevo que se identificó en un cambio («Otro») queda con su número de ítem en ese cambio
function enlazarRiesgoCAM_(ss, numeroCam, eventoCambio, item, evento) {
  try {
    const h = hojaCambiosCAM(ss);
    if (h.getLastRow() < 2) return;
    const nums = h.getRange(2, 1, h.getLastRow() - 1, 1).getValues().map(r => normalizar(r[0]));
    const i = nums.indexOf(normalizar(numeroCam));
    if (i === -1) return;
    const celda = h.getRange(i + 2, CAM_COL.riesgos), lista = riesgosCAM_(celda.getValue());
    let k = lista.findIndex(x => !x.item && normalizar(x.evento) === normalizar(eventoCambio));
    if (k === -1) k = lista.findIndex(x => !x.item);
    if (k === -1) lista.push({ item: item, evento: evento }); else lista[k] = { item: item, evento: evento };
    celda.setValue(JSON.stringify(lista));
  } catch (e) { Logger.log("Enlace riesgo → cambio: " + e); }
}

// Registro rápido del monitoreo (sección 3 del formato)
function guardarMonitoreoMR(fila, item, datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "mr", "editar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaRiesgosMR(ss);
    fila = Number(fila);
    if (!fila || fila < 2 || fila > hoja.getLastRow() || (Number(hoja.getRange(fila, 1).getValue()) || fila - 1) !== Number(item)) {
      return respuesta(false, null, "El riesgo cambió en la hoja. Recarga e intenta de nuevo.");
    }
    const texto = v => String(v == null ? "" : v).trim();
    if (!datos.corteMonitoreo) return respuesta(false, null, "Indica el corte de monitoreo");
    const actor = usuarioSD(usuario);
    // Acciones realizadas: lo ya escrito queda fijo; la nueva entrada se agrega con fecha y autor
    const accPrevias = hoja.getRange(fila, MR_COL.accionesRealizadas).getValue();
    const accTexto = agregarSeguimiento_(accPrevias, datos.accionesRealizadasNuevo, actor ? actor.nombre : texto(usuario));
    hoja.getRange(fila, MR_COL.corteMonitoreo, 1, 7).setValues([[
      aFechaMR(datos.corteMonitoreo), aFechaMR(datos.fechaAccion), accTexto, texto(datos.evidenciaMonitoreo),
      texto(datos.responsableMonitoreo), texto(datos.adjuntoAcciones), texto(datos.eficacia)
    ]]);
    hoja.getRange(fila, MR_COL.comentarioEficacia).setValue(texto(datos.comentarioEficacia));
    hoja.getRange(fila, MR_COL.actualizadoPor, 1, 2).setValues([[actor ? actor.nombre : texto(usuario), new Date()]]);
    return respuesta(true, { item: Number(item) });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function subirArchivoMR(nombre, tipo, base64) { seguridadRPC_();
  return subirArchivoDrive(MR_CARPETA, nombre, tipo, base64);
}

// ============================================================
// MATRIZ DE OPORTUNIDADES - Formato GC-FO-013
// Hoja "Oportunidades": columnas A a U iguales al formato (se pueden pegar los registros del Excel).
// Hoja "Oportunidades_Actividades": varias actividades por oportunidad, cada una con su responsable.
// Calificación (igual a las fórmulas del formato):
//   Prob. = mayor entre Probabilidad y Ocurrencias previas · Beneficio = mayor de los 4 potenciales
//   Factor = Prob × Beneficio · Viabilidad: factor >= 15 → "Abordar Oportunidad"
// ============================================================
const OP_HOJA = "Oportunidades";
const OP_HOJA_ACT = "Oportunidades_Actividades";
const OP_CARPETA = "IMCOLMETRIC - Oportunidades (Evidencias)";
const OP_UMBRAL = 15;

// Listas de la hoja "Referencias" (posición = calificación 1 a 5)
const OP_LISTAS = {
  probabilidad: ["No puede ocurrir / No aplicable", "Poco probable que ocurra", "Algo probable que ocurra", "Probable que ocurra", "Es muy probable que ocurra"],
  ocurrencias: ["Nunca ha ocurrido", "No ha ocurrido en los pasados 10 años", "No ha ocurrido en los pasados 5 años", "Ha ocurrido en los pasados 5 años", "Ha ocurrido en el último año"],
  potencial: ["No Hay/ NA", "Menor", "Moderado", "Alto", "Muy alto"],
  costo: ["No Hay/ NA", "Menor", "Moderado", "Alto", "Muy alto"],
  // Lista del costo antes del cambio a «Acciones de Mejora» (solo para leer los registros anteriores)
  costoAnterior: ["> $20,000,000", "> $5,000,000", "< $1,000,000", "< $500,000", "$0 ó N/A"],
  generaCambios: ["Sí", "No"],
  exito: ["La oportunidad falló", "La oportunidad se abandono", "Se lograron algunas expectativas", "Se lograron todas las expectativas", "Se superaron las expectativas"]
};

const OP_COLUMNAS = [
  ["numero", "#"], ["proceso", "Proceso"], ["objetivoEstrategico", "Objetivo Estratégico Asociado"], ["oportunidad", "Oportunidad"],
  ["probabilidad", "Probabilidad"], ["ocurrencias", "Ocurrencias previas"], ["probCalif", "Prob. Calificación"],
  ["benCliente", "Potencial de Aumento de la Satisfacción del Cliente"], ["benImagen", "Potencial de Mejoramiento de la Imagen"],
  ["benRegulaciones", "Mejora potencial en la satisfacción de las regulaciones"], ["benProcesos", "Mejora potencial de los procesos internos del SGC"],
  ["costo", "Potencial costo de implementación"], ["benCalif", "Beneficio. Calificación"], ["factor", "Factor de la oportunidad (Prob x Ben)"],
  ["viabilidad", "Viabilidad de la Oportunidad"], ["acciones", "ACCIONES"], ["responsable", "Responsable"],
  ["planSeguimiento", "Plan de Seguimiento de Oportunidades"], ["verificacion", "Verificación ¿Hay éxito post implementación?"],
  ["fechaRegistro", "Fecha de registro"], ["fechaActualizacion", "Fecha de actualización"],
  ["registradoPor", "Registrado Por"], ["actualizadoPor", "Actualizado Por"],
  ["comentarioEficacia", "Comentario de la verificación (eficacia)"],
  ["impacto", "Impacto de la oportunidad"], ["beneficios", "Beneficios de la oportunidad"],
  ["generaCambios", "Genera Cambios en el Sistema"],
  ["cambioAsociado", "Cambio asociado (Gestión del Cambio)"],
  ["liderNotificado", "Líder notificado para la gestión del cambio"]
];
const OP_COL = {};
OP_COLUMNAS.forEach((c, i) => OP_COL[c[0]] = i + 1);
const OP_COLUMNAS_ACT = ["N° Oportunidad", "#", "Actividad", "Responsable", "Fecha Límite", "% Avance", "Estado",
                         "Evidencia", "Observaciones", "Actualizado Por", "Fecha Actualización"];

function hojaOP(ss, nombre, encabezados) { seguridadRPC_();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    // F-0001: dos pantallas pueden pedir la misma hoja a la vez; si la otra ya la creó, se usa esa
    try { hoja = ss.insertSheet(nombre); }
    catch (e) { SpreadsheetApp.flush(); hoja = ss.getSheetByName(nombre); if (!hoja) throw e; }
  }
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(encabezados);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight("bold").setWrap(true);
    hoja.setFrozenRows(1);
  }
  return asegurarColumnas_(hoja, encabezados);   // hoja de una versión anterior: agrega las columnas nuevas
}

// Compara textos de las listas ignorando mayúsculas, tildes, saltos de línea y guiones finales
function claveOP(v) { seguridadRPC_(); return normalizar(String(v || "").replace(/\s+/g, " ")).replace(/[\s\-–]+$/, "").trim(); }

function calificacionOP(lista, v) { seguridadRPC_();
  const i = OP_LISTAS[lista].findIndex(x => claveOP(x) === claveOP(v));
  return i === -1 ? 0 : i + 1;
}

function valorListaOP(lista, v) { seguridadRPC_();
  const i = OP_LISTAS[lista].findIndex(x => claveOP(x) === claveOP(v));
  return i === -1 ? String(v || "").replace(/\s+/g, " ").trim() : OP_LISTAS[lista][i];
}

// Prob. = MAX(Probabilidad; Ocurrencias previas)
// Beneficio = MAX(Satisfacción del cliente; Imagen; Regulaciones; Costo de implementación)
// Los registros anteriores (costo en pesos) conservan su cálculo: con «Procesos internos del SGC» en lugar del costo.
function costoEsAnteriorOP(costo) { seguridadRPC_(); return !calificacionOP("costo", costo) && !!calificacionOP("costoAnterior", costo); }
function calcularOP(o) { seguridadRPC_();
  const probCalif = Math.max(calificacionOP("probabilidad", o.probabilidad), calificacionOP("ocurrencias", o.ocurrencias));
  const cuarto = costoEsAnteriorOP(o.costo) ? calificacionOP("potencial", o.benProcesos) : calificacionOP("costo", o.costo);
  const benCalif = Math.max(calificacionOP("potencial", o.benCliente), calificacionOP("potencial", o.benImagen),
                            calificacionOP("potencial", o.benRegulaciones), cuarto);
  const factor = probCalif && benCalif ? probCalif * benCalif : 0;
  return { probCalif: probCalif, benCalif: benCalif, factor: factor,
           viabilidad: factor ? (factor >= OP_UMBRAL ? "Abordar oportunidad" : "Descartar oportunidad") : "" };
}
// «Genera Cambios en el Sistema» solo lo diligencian el Administrador del sistema y el Coordinador de Calidad
function puedeGenerarCambiosOP_(u) { return puedeEditarUrlDocs_(u); }

// Líder del proceso (matriz RUTAS_DOCUMENTALES; si no lo indica, el aprobador del proceso)
function liderProcesoOP_(ss, proceso) { return liderRutaSD(rutaPorProcesoSD(ss, proceso)); }

// Cuando Calidad define que la oportunidad genera cambios, se avisa al líder del proceso para que registre la gestión del cambio
function notificarLiderCambioOP_(ss, o, actor) {
  const l = liderProcesoOP_(ss, o.proceso);
  const correos = l.cargo || l.correo ? correosRolSD(l.cargo, l.correo) : [];
  let urlApp = ""; try { urlApp = ScriptApp.getService().getUrl() || ""; } catch (e) {}
  const n = ("0" + o.numero).slice(-2);
  const esc_ = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (correos.length) {
    try {
      MailApp.sendEmail({ to: correos.join(","), subject: "Registrar gestión del cambio · Oportunidad de mejora N° " + n,
        htmlBody: "<div style='font-family:Segoe UI,Arial,sans-serif;color:#0f1f33;max-width:560px'>" +
          "<div style='background:#003566;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0'><b>IMCOLMETRIC SGC</b> · Acciones de Mejora</div>" +
          "<div style='border:1px solid #e3e9f0;border-top:none;padding:18px;border-radius:0 0 8px 8px'>" +
          "<p>Calidad (" + esc_(actor ? actor.nombre : "") + ") definió que la <b>Oportunidad de mejora N° " + n + "</b> del proceso <b>" + esc_(o.proceso) +
          "</b> <b>genera cambios en el sistema</b>.</p><p style='background:#f1f5f9;padding:10px 12px;border-radius:8px'>" + esc_(o.oportunidad) + "</p>" +
          "<p>Como líder del proceso, registra la <b>Gestión del Cambio</b> en la plataforma: en «Gestión del Cambio» verás la oportunidad como entrada, con sus datos ya cargados.</p>" +
          (urlApp ? "<p><a href='" + urlApp + "' style='background:#0b3a6e;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none'>Abrir la plataforma</a></p>" : "") +
          "</div></div>" });
    } catch (e) { Logger.log("Aviso al líder (oportunidad " + n + "): " + e); }
  }
  return (l.cargo || "Líder del proceso") + (correos.length ? " (" + correos.join(", ") + ")" : " (sin correo registrado)") + " · " +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Bogota", "yyyy-MM-dd HH:mm");
}

// Oportunidades que generan cambios y aún no tienen su gestión del cambio
function oportunidadesSinCambioOP_(ss) {
  const hoja = ss.getSheetByName(OP_HOJA);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, Math.min(hoja.getLastColumn(), OP_COLUMNAS.length)).getValues().map(r => {
    const o = {}; OP_COLUMNAS.forEach((c, i) => o[c[0]] = r[i]); return o;
  }).filter(o => Number(o.numero) && valorListaOP("generaCambios", o.generaCambios) === "Sí" && !String(o.cambioAsociado || "").trim());
}

// Para Gestión del Cambio: oportunidades que el usuario (líder del proceso, o Calidad) debe convertir en un cambio
function oportunidadesParaCambioCAM(usuario) { seguridadRPC_();
  try {
    const actor = usuarioSD(usuario);
    if (!actor) return respuesta(false, null, "Usuario no válido");
    const ss = SpreadsheetApp.openById(ID_HOJA), calidad = puedeGenerarCambiosOP_(actor);
    const lista = oportunidadesSinCambioOP_(ss).map(o => {
      const l = liderProcesoOP_(ss, o.proceso), c = calcularOP(o);
      return { numero: Number(o.numero), proceso: String(o.proceso || ""), oportunidad: String(o.oportunidad || ""), impacto: String(o.impacto || ""),
        beneficios: String(o.beneficios || ""), factor: c.factor, viabilidad: c.viabilidad, lider: l.cargo || "", notificado: String(o.liderNotificado || ""),
        esLider: cumpleRolSD(actor, l.cargo, l.correo) };
    }).filter(x => x.esLider || calidad);
    return respuesta(true, lista);
  } catch (e) { return respuesta(false, null, e.toString()); }
}

function estadoActividadOP(p) { seguridadRPC_(); return p >= 100 ? "Terminada" : p > 0 ? "En curso" : "Pendiente"; }

function porcentajeOP(v) { seguridadRPC_();
  if (v === "" || v === null || v === undefined) return 0;
  let n = Number(String(v).replace("%", "").replace(",", "."));
  if (isNaN(n)) return 0;
  if (n > 0 && n <= 1 && String(v).indexOf("%") === -1) n = n * 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function aFechaOP(valor) { seguridadRPC_();
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : "";
}

// ---------- Consultas ----------
// ============================================================
// Reparación del vínculo oportunidad ↔ actividades (evidencias)
// Las actividades se enlazan por el N° de la oportunidad. Si en la hoja se insertan filas o se renumeran
// las oportunidades, cada una quedaría mostrando las actividades y evidencias de otra.
// La columna ACCIONES de cada oportunidad es el espejo de sus actividades: con ella se detecta a qué oportunidad
// pertenece realmente cada grupo de actividades y se corrige el N° en la hoja de actividades.
// Solo se mueve un grupo cuando su texto coincide con UNA sola oportunidad; nunca se borra una evidencia.
// ============================================================
function textoAccionesOP_(t) {
  return normalizar(String(t == null ? "" : t).replace(/(^|\n)\s*\d+\s*[).-]\s*/g, " ")).replace(/\s+/g, " ").trim();
}

function reconciliarActividadesOP_(filas, hojaAct, acts) {
  const opps = filas.filter(r => Number(r[0]) && String(r[3] || "").trim())
    .map(r => ({ n: Number(r[0]), a: textoAccionesOP_(r[OP_COL.acciones - 1]) }));
  const existe = {}; opps.forEach(o => existe[o.n] = o);
  const grupos = {};
  acts.forEach(a => { const n = Number(a[0]); if (n) (grupos[n] = grupos[n] || []).push(a); });
  const textoGrupo = g => textoAccionesOP_(g.slice().sort((x, y) => (Number(x[1]) || 0) - (Number(y[1]) || 0)).map(a => a[2]).join(" "));
  const destino = {};   // N° actual del grupo → N° de la oportunidad a la que pertenece
  Object.keys(grupos).forEach(k => {
    const n = Number(k), t = textoGrupo(grupos[n]);
    if (!t || (existe[n] && existe[n].a === t)) return;          // ya está bien enlazado
    const cand = opps.filter(o => o.a && o.a === t);
    if (cand.length !== 1) return;                               // sin coincidencia única: no se toca
    const m = cand[0].n;
    if (grupos[m] && textoGrupo(grupos[m]) === t && !grupos[m].every(esImportadoSinEvidenciaOP_)) return;
    destino[n] = m;
  });
  if (!Object.keys(destino).length) return null;

  const recibe = {}; Object.keys(destino).forEach(n => recibe[destino[n]] = true);
  const nuevas = [];
  acts.forEach(a => {
    const n = Number(a[0]);
    if (destino[n]) { const b = a.slice(); b[0] = destino[n]; nuevas.push(b); return; }
    // El grupo que queda en un N° que recibe sus actividades reales: si es una copia importada sin evidencia, sobra;
    // si tiene información y no pertenece a nadie, se conserva con N° 0 para revisarlo (no se pierde)
    if (n && recibe[n] && !destino[n]) {
      const t = textoGrupo(grupos[n]);
      if (existe[n] && existe[n].a === t && esImportadoSinEvidenciaOP_(a)) return;
      if (!(existe[n] && existe[n].a === t)) {
        const b = a.slice(); b[0] = 0; b[8] = ("Actividad sin oportunidad asociada (antes N° " + n + "). Revisar. " + String(a[8] || "")).trim(); nuevas.push(b); return;
      }
    }
    nuevas.push(a);
  });
  const ancho = OP_COLUMNAS_ACT.length;
  if (hojaAct.getLastRow() > 1) hojaAct.getRange(2, 1, hojaAct.getLastRow() - 1, ancho).clearContent();
  if (nuevas.length) {
    hojaAct.getRange(2, 1, nuevas.length, ancho).setValues(nuevas.map(r => { const x = r.slice(0, ancho); while (x.length < ancho) x.push(""); return x; }));
    hojaAct.getRange(2, 6, nuevas.length, 1).setNumberFormat("0%");
  }
  Logger.log("Oportunidades: actividades re-enlazadas " + JSON.stringify(destino));
  return nuevas;
}

function esImportadoSinEvidenciaOP_(a) {
  return String(a[9] || "") === "Importado del formato" && !String(a[7] || "").trim() && !String(a[8] || "").trim();
}

function obtenerOportunidadesOP() { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaOP(ss, OP_HOJA, OP_COLUMNAS.map(c => c[1]));
    const hojaAct = hojaOP(ss, OP_HOJA_ACT, OP_COLUMNAS_ACT);
    if (hoja.getLastRow() < 2) return respuesta(true, []);
    const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, OP_COLUMNAS.length).getValues();
    let acts = hojaAct.getLastRow() > 1 ? hojaAct.getRange(2, 1, hojaAct.getLastRow() - 1, OP_COLUMNAS_ACT.length).getValues() : [];

    // Si se insertaron o renumeraron filas en la hoja, las actividades vuelven a su oportunidad real
    if (acts.length) {
      lock.waitLock(20000);
      const rep = reconciliarActividadesOP_(filas, hojaAct, acts);
      if (rep) acts = rep;
    }

    // Registros pegados del Excel: numerar los que no tienen # y crear su actividad a partir de ACCIONES/Responsable
    const conTexto = filas.map((r, i) => ({ r: r, i: i })).filter(x => String(x.r[3] || "").trim());
    const sinNumero = conTexto.filter(x => !Number(x.r[0]));
    const conActividad = {};
    acts.forEach(a => conActividad[String(Number(a[0]))] = true);
    const sinActividad = conTexto.filter(x => Number(x.r[0]) && !conActividad[String(Number(x.r[0]))] && String(x.r[15] || "").trim());
    if (sinNumero.length || sinActividad.length) {
      lock.waitLock(20000);
      let max = filas.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
      sinNumero.forEach(x => { x.r[0] = ++max; hoja.getRange(x.i + 2, 1).setValue(max); });
      const nuevas = [];
      conTexto.filter(x => !conActividad[String(Number(x.r[0]))] && String(x.r[15] || "").trim()).forEach(x => {
        const p = String(x.r[18] || "").trim() ? 100 : 0;   // con verificación registrada = actividad terminada
        nuevas.push([Number(x.r[0]), 1, String(x.r[15]).trim(), String(x.r[16] || "").trim(), "", p / 100,
                     estadoActividadOP(p), "", "", "Importado del formato", new Date()]);
      });
      if (nuevas.length) {
        hojaAct.getRange(hojaAct.getLastRow() + 1, 1, nuevas.length, OP_COLUMNAS_ACT.length).setValues(nuevas);
        acts = acts.concat(nuevas);
      }
    }

    const lista = conTexto.map(x => {
      const r = x.r, o = {};
      OP_COLUMNAS.forEach((c, j) => o[c[0]] = r[j]);
      const numero = Number(o.numero);
      const base = {
        numero: numero, proceso: String(o.proceso || "").trim(), objetivoEstrategico: String(o.objetivoEstrategico || "").trim(),
        oportunidad: String(o.oportunidad || "").trim(),
        probabilidad: valorListaOP("probabilidad", o.probabilidad), ocurrencias: valorListaOP("ocurrencias", o.ocurrencias),
        benCliente: valorListaOP("potencial", o.benCliente), benImagen: valorListaOP("potencial", o.benImagen),
        benRegulaciones: valorListaOP("potencial", o.benRegulaciones), benProcesos: valorListaOP("potencial", o.benProcesos),
        costo: costoEsAnteriorOP(o.costo) ? valorListaOP("costoAnterior", o.costo) : valorListaOP("costo", o.costo),
        generaCambios: valorListaOP("generaCambios", o.generaCambios), cambioAsociado: String(o.cambioAsociado || "").trim(),
        liderNotificado: String(o.liderNotificado || "").trim(), planSeguimiento: String(o.planSeguimiento || "").trim(),
        verificacion: valorListaOP("exito", o.verificacion), comentarioEficacia: String(o.comentarioEficacia || "").trim(),
        impacto: String(o.impacto || "").trim(), beneficios: String(o.beneficios || "").trim(),
        fechaRegistro: formatearFecha(o.fechaRegistro, "yyyy-MM-dd"), fechaActualizacion: formatearFecha(o.fechaActualizacion, "yyyy-MM-dd"),
        registradoPor: String(o.registradoPor || ""), actualizadoPor: String(o.actualizadoPor || "")
      };
      Object.assign(base, calcularOP(base));
      base.actividades = acts.filter(a => Number(a[0]) === numero)
        .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
        .map(a => {
          const p = porcentajeOP(a[5]);
          return { actividad: String(a[2] || ""), responsable: String(a[3] || ""), fechaLimite: formatearFecha(a[4], "yyyy-MM-dd"),
                   avance: p, estado: estadoActividadOP(p), evidencia: String(a[7] || ""), observaciones: String(a[8] || "") };
        });
      base.avance = base.actividades.length ? Math.round(base.actividades.reduce((s, a) => s + a.avance, 0) / base.actividades.length) : 0;
      return base;
    }).sort((a, b) => a.numero - b.numero);
    return respuesta(true, lista);
  } catch (e) {
    Logger.log("ERROR obtenerOportunidadesOP: " + e.toString());
    return respuesta(false, null, "Error obteniendo las oportunidades: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function obtenerConfigOP() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const data = inicializarHojaUsuarios().getDataRange().getValues();
    const cols = columnasUsuarios(data[0]);
    const responsables = {};
    data.slice(1).filter(f => usuarioActivo(f, cols)).forEach(f => {
      [campo(f, cols, "cargo"), campo(f, cols, "nombre")].forEach(v => {
        const t = String(v || "").trim(); if (t) responsables[normalizar(t)] = t;
      });
    });
    return respuesta(true, {
      listas: OP_LISTAS, umbral: OP_UMBRAL, procesos: leerRutasSD(ss).map(r => r.proceso),
      responsables: Object.values(responsables).sort((a, b) => a.localeCompare(b, "es")),
      objetivos: objetivosEstrategicos(ss)
    });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// ---------- Guardar (crear o editar) ----------
function guardarOportunidadOP(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "op", Number(datos && datos.numero) ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const texto = v => String(v == null ? "" : v).trim();
    const faltan = [];
    [["proceso", "proceso"], ["oportunidad", "descripción de la oportunidad"], ["probabilidad", "probabilidad"], ["ocurrencias", "ocurrencias previas"],
     ["benCliente", "satisfacción del cliente"], ["benImagen", "imagen de la institución"], ["benRegulaciones", "regulaciones"],
     ["costo", "costo de implementación"]].forEach(([k, n]) => { if (!texto(datos[k])) faltan.push(n); });
    // El formulario de Acciones de Mejora ya no trae actividades ni seguimiento: si no llegan, se conservan los guardados
    const conActividades = Array.isArray(datos.actividades);
    const actividades = (datos.actividades || []).filter(a => texto(a.actividad));
    if (actividades.some(a => !texto(a.responsable))) faltan.push("responsable de cada actividad");
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));

    const actor = usuarioSD(usuario);
    const nombreActor = actor ? actor.nombre : texto(usuario);
    const calc = calcularOP(datos);

    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaOP(ss, OP_HOJA, OP_COLUMNAS.map(c => c[1]));
    const numeros = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0) : [];
    let numero = Number(datos.numero) || 0;
    let fila = -1;
    if (numero) {
      const i = numeros.indexOf(numero);
      if (i === -1) return respuesta(false, null, "No existe la oportunidad " + numero);
      fila = i + 2;
    } else {
      numero = numeros.reduce((m, n) => Math.max(m, n), 0) + 1;
    }

    const ahora = new Date();
    const valores = {
      numero: numero, proceso: texto(datos.proceso), objetivoEstrategico: texto(datos.objetivoEstrategico), oportunidad: texto(datos.oportunidad),
      probabilidad: texto(datos.probabilidad), ocurrencias: texto(datos.ocurrencias), probCalif: calc.probCalif,
      benCliente: texto(datos.benCliente), benImagen: texto(datos.benImagen), benRegulaciones: texto(datos.benRegulaciones),
      benProcesos: texto(datos.benProcesos), costo: texto(datos.costo), benCalif: calc.benCalif, factor: calc.factor,
      viabilidad: calc.viabilidad,
      // Resumen de actividades en las columnas ACCIONES y Responsable del formato
      acciones: actividades.map((a, i) => (actividades.length > 1 ? (i + 1) + ") " : "") + texto(a.actividad)).join("\n"),
      responsable: [...new Set(actividades.map(a => texto(a.responsable)))].join(" / "),
      impacto: texto(datos.impacto), beneficios: texto(datos.beneficios),
      planSeguimiento: agregarSeguimiento_("", datos.planSeguimientoNuevo != null ? datos.planSeguimientoNuevo : datos.planSeguimiento, nombreActor), verificacion: texto(datos.verificacion), comentarioEficacia: texto(datos.comentarioEficacia),
      fechaActualizacion: ahora,
      actualizadoPor: nombreActor
    };
    const gc = valorListaOP("generaCambios", datos.generaCambios);
    const puedeGC = puedeGenerarCambiosOP_(actor);
    let antesGC = "";
    if (fila === -1) {
      valores.generaCambios = puedeGC && OP_LISTAS.generaCambios.indexOf(gc) !== -1 ? gc : "";
      Object.assign(valores, { fechaRegistro: ahora, registradoPor: nombreActor, actualizadoPor: "" });
      hoja.appendRow(OP_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]]));
    } else {
      const actual = hoja.getRange(fila, 1, 1, OP_COLUMNAS.length).getValues()[0];
      valores.fechaRegistro = actual[OP_COL.fechaRegistro - 1] || ahora;
      valores.registradoPor = actual[OP_COL.registradoPor - 1];
      // Lo demás que el formulario ya no muestra se conserva como estaba
      if (datos.objetivoEstrategico === undefined) valores.objetivoEstrategico = actual[OP_COL.objetivoEstrategico - 1];
      if (datos.benProcesos === undefined) valores.benProcesos = actual[OP_COL.benProcesos - 1];
      valores.generaCambios = puedeGC ? (OP_LISTAS.generaCambios.indexOf(gc) !== -1 ? gc : "") : actual[OP_COL.generaCambios - 1];
      valores.cambioAsociado = actual[OP_COL.cambioAsociado - 1];
      valores.liderNotificado = actual[OP_COL.liderNotificado - 1];
      antesGC = valorListaOP("generaCambios", actual[OP_COL.generaCambios - 1]);
      if (!conActividades) ["acciones", "responsable", "planSeguimiento", "verificacion", "comentarioEficacia"].forEach(k => { valores[k] = actual[OP_COL[k] - 1]; });
      const c2 = calcularOP(valores);   // un registro anterior se recalcula con sus datos guardados
      Object.assign(valores, { probCalif: c2.probCalif, benCalif: c2.benCalif, factor: c2.factor, viabilidad: c2.viabilidad });
      Object.assign(calc, c2);
      // Plan de seguimiento: lo ya escrito queda fijo, solo se agrega
      valores.planSeguimiento = agregarSeguimiento_(actual[OP_COL.planSeguimiento - 1], datos.planSeguimientoNuevo, nombreActor);
      hoja.getRange(fila, 1, 1, OP_COLUMNAS.length).setValues([OP_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]])]);
    }

    // «Sí» por primera vez y sin cambio registrado: se avisa al líder del proceso
    if (valores.generaCambios === "Sí" && antesGC !== "Sí" && !String(valores.cambioAsociado || "").trim()) {
      const aviso = notificarLiderCambioOP_(ss, valores, actor);
      const filaFin = fila === -1 ? hoja.getLastRow() : fila;
      hoja.getRange(filaFin, OP_COL.liderNotificado).setValue(aviso);
      valores.liderNotificado = aviso;
    }
    if (!conActividades) return respuesta(true, { numero: numero, factor: calc.factor, viabilidad: calc.viabilidad, generaCambios: valores.generaCambios,
      cambioAsociado: valores.cambioAsociado || "", liderNotificado: valores.liderNotificado || "" });
    // Actividades: se reemplazan las de esta oportunidad
    const hojaAct = hojaOP(ss, OP_HOJA_ACT, OP_COLUMNAS_ACT);
    const ancho = OP_COLUMNAS_ACT.length;
    const resto = hojaAct.getLastRow() > 1
      ? hojaAct.getRange(2, 1, hojaAct.getLastRow() - 1, ancho).getValues().filter(a => String(a[0]).trim() && Number(a[0]) !== numero) : [];
    const nuevas = actividades.map((a, i) => {
      const p = Math.max(0, Math.min(100, Math.round(Number(a.avance) || 0)));
      return [numero, i + 1, texto(a.actividad), texto(a.responsable), aFechaOP(a.fechaLimite), p / 100, estadoActividadOP(p),
              texto(a.evidencia), texto(a.observaciones), nombreActor, ahora];
    });
    const todas = resto.concat(nuevas);
    if (hojaAct.getLastRow() > 1) hojaAct.getRange(2, 1, hojaAct.getLastRow() - 1, ancho).clearContent();
    if (todas.length) {
      hojaAct.getRange(2, 1, todas.length, ancho).setValues(todas);
      hojaAct.getRange(2, 6, todas.length, 1).setNumberFormat("0%");
    }
    return respuesta(true, { numero: numero, factor: calc.factor, viabilidad: calc.viabilidad });
  } catch (e) {
    Logger.log("ERROR guardarOportunidadOP: " + e.toString());
    return respuesta(false, null, "Error guardando la oportunidad: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function subirArchivoOP(nombre, tipo, base64) { seguridadRPC_();
  return subirArchivoDrive(OP_CARPETA, nombre, tipo, base64);
}

// ============================================================
// OBJETIVOS ESTRATÉGICOS (lista compartida por Riesgos, Oportunidades e Indicadores)
// Une las variantes del mismo objetivo: saltos de línea, espacios, comas o punto final
// distintos, o una versión que es la continuación de otra (se deja la más completa).
// ============================================================
function objetivosEstrategicos(ss) { seguridadRPC_();
  const textos = [];
  [["MatrizRiesgos", 4], [OP_HOJA, OP_COL.objetivoEstrategico], ["Indicadores", 7]].forEach(([nombre, col]) => {
    const h = ss.getSheetByName(nombre);
    if (h && h.getLastRow() > 1) h.getRange(2, col, h.getLastRow() - 1, 1).getValues().forEach(r => textos.push(r[0]));
  });
  return unificarTextosParecidos(textos);
}

function unificarTextosParecidos(textos) { seguridadRPC_();
  const limpio = t => String(t || "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  const clave = t => normalizar(t).replace(/[^a-z0-9]/g, "");
  const grupos = [];
  textos.forEach(t => {
    const c = clave(t);
    if (!c) return;
    let g = grupos.find(x => x.clave === c ||
      (Math.min(x.clave.length, c.length) >= 40 && (x.clave.indexOf(c) === 0 || c.indexOf(x.clave) === 0)));
    if (!g) { g = { clave: c, versiones: {} }; grupos.push(g); }
    if (c.length > g.clave.length) g.clave = c;
    const v = limpio(t);
    g.versiones[v] = g.versiones[v] || { n: 0, clave: c };
    g.versiones[v].n++;
  });
  // De cada grupo: la versión más completa y, entre esas, la más usada
  return grupos.map(g => Object.keys(g.versiones)
      .filter(v => g.versiones[v].clave === g.clave)
      .sort((a, b) => g.versiones[b].n - g.versiones[a].n)[0])
    .sort((a, b) => a.localeCompare(b, "es"));
}

// ============================================================
// AUDITORÍA - Formato SC-FO-003 Programa de Auditorías Internas
// Hoja "AUD_Programa": columnas A..O = las del formato; P..AC = Enero..Julio (P / E);
// AD = Observaciones (igual que el Excel, para poder pegar los registros); AE..AN = Agosto..Diciembre (P / E).
// Hoja "AUD_ProgramaGeneral": encabezado del programa (objetivo, alcance, criterios...) por vigencia.
// Hoja "AUD_ValoracionProcesos": hoja "Valoración Procesos Auditables" (A..L igual al formato).
// ============================================================
const AUD_HOJA_GENERAL = "AUD_ProgramaGeneral";
const AUD_HOJA_PROGRAMA = "AUD_Programa";
const AUD_HOJA_VALORACION = "AUD_ValoracionProcesos";
const AUD_MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const AUD_SUCURSAL = "Laboratorio IMCOLMETRIC";

const AUD_LISTAS = {
  clasificacion: ["Estratégico", "Misional", "Apoyo", "Evaluación"],
  tipo: ["Interna", "Externa"],
  ciclo: ["Primer ciclo", "Segundo Ciclo", "Tercer Ciclo"],
  instancia: ["Auditor Interno", "Auditor Externo"],
  frecuencia: ["Anual", "Semestral", "Cuatrimestral", "Trimestral"],
  estado: ["Programada", "En ejecución", "Ejecutada", "Reprogramada", "Cancelada"]
};

// Factores de la hoja "Valoración Procesos Auditables": [criterio, puntaje] y peso de cada factor
const AUD_FACTORES = [
  { clave: "cambios", titulo: "El proceso sufrió cambios que afecten la organización", peso: 0.25, criterios: [
    ["Se presentaron cambios estructurales", 100], ["Se presentaron cambios operacionales", 80],
    ["Se presentaron cambios de organigrama", 60], ["No se presentaron cambios", 20]] },
  { clave: "resultado", titulo: "Resultado auditorías", peso: 0.15, criterios: [
    ["Hallazgos mayores", 100], ["Hallazgos menores", 80], ["Observaciones", 60], ["Sin hallazgo / Oportunidades de mejora", 20]] },
  { clave: "tiempo", titulo: "Tiempo desde última auditoría", peso: 0.20, criterios: [
    ["No auditado", 100], ["Auditado hace más de 3 años", 80], ["Auditado en los últimos 2 - 3 años", 60], ["Auditado en el último año", 20]] },
  { clave: "indicadores", titulo: "Cumplimiento a indicadores", peso: 0.15, criterios: [
    ["Incumplimiento más de 6 meses", 100], ["Incumplimiento de 3 a 6 meses", 80], ["Incumplimiento dos meses", 60],
    ["Incumplimiento en un mes o sin incumplimientos", 20]] },
  { clave: "planes", titulo: "Cumplimiento de recomendaciones y/o planes de acción", peso: 0.25, criterios: [
    ["No ejecutado / Sin planes", 100], ["Aplazado", 80], ["En proceso", 60], ["Ejecutado", 20]] }
];

// Igual a la fórmula del formato: IFS(K>91;"4 veces";K>=81;"3 veces";K>=61;"2 veces";"1 vez al año")
function frecuenciaAUD(puntaje) { seguridadRPC_();
  return puntaje > 91 ? "4 veces al año" : puntaje >= 81 ? "3 veces al año" : puntaje >= 61 ? "2 veces al año" : "1 vez al año";
}
function puntajeAUD(v) { seguridadRPC_();
  return Math.round(AUD_FACTORES.reduce((s, f) => s + (Number(v[f.clave]) || 0) * f.peso, 0) * 100) / 100;
}

const AUD_GENERAL_COLUMNAS = [
  ["vigencia", "VIGENCIA"], ["metas", "METAS"], ["objetivo", "OBJETIVO DEL PROGRAMA DE AUDITORÍAS"],
  ["alcance", "ALCANCE DEL PROGRAMA DE AUDITORÍAS"], ["criterios", "CRITERIOS DE AUDITORIA"],
  ["recursos", "RECURSOS NECESARIOS"], ["responsable", "RESPONSABLE DEL PROGRAMA DE AUDITORÍAS"],
  ["riesgos", "RIESGOS"], ["meta", "META % CUMPLIMIENTO"], ["actualizadoPor", "Actualizado Por"], ["fechaActualizacion", "Fecha Actualización"]
];
// Textos del formato SC-FO-003 que se proponen al crear una vigencia nueva
const AUD_GENERAL_DEFECTO = {
  metas: "",
  objetivo: "Verificar la conformidad, implementación, mantenimiento y eficacia del Sistema de Gestión del Laboratorio conforme a los requisitos de la ISO/IEC 17025:2017, asegurando la competencia técnica, la validez de los resultados y la mejora continua de los procesos.",
  alcance: "Aplica a los procesos auditables, incluyendo las actividades técnicas (magnitudes: Masa, Presión, Temperatura y Humedad Relativa)",
  criterios: "ISO/IEC 17025:2017\nProcedimientos internos del laboratorio\nRequisitos legales y reglamentarios aplicables\nRequisitos del cliente y contratos\nPolíticas y objetivos del laboratorio\nEnfoque basado en riesgos",
  recursos: "Equipo auditor competente e independiente\nListas de verificación ISO/IEC 17025\nAcceso a documentación del sistema de gestión\nRegistros técnicos y de calidad\nEquipos de cómputo y herramientas de auditoría\nTiempo del personal auditado\nInfraestructura para entrevistas y revisión documental",
  responsable: "Coordinador de Calidad",
  riesgos: "Falta de independencia del auditor\nIncumplimiento del cronograma de auditorías\nHallazgos no identificados por baja competencia del auditor\nResistencia del personal auditado\nFalta de evidencia objetiva suficiente\nInadecuado cierre de no conformidades\nPérdida de trazabilidad de registros",
  meta: 1
};

const AUD_COLUMNAS_BASE = [
  ["numero", "N°"], ["sucursal", "SUCURSAL A AUDITAR"], ["clasificacion", "CLASIFICACIÓN DEL PROCESO A AUDITAR"],
  ["macroproceso", "NOMBRE DEL MACROPROCESO A AUDITAR"], ["proceso", "NOMBRE DEL PROCESO A AUDITAR"],
  ["tipo", "TIPO DE AUDITORIA"], ["ciclo", "CICLO"], ["alcance", "ALCANCE DE LA AUDITORÍA"],
  ["instancia", "INSTANCIA AUDITORA"], ["auditor", "RESPONSABLE DE REALIZAR LA AUDITORIA"],
  ["auditado", "RESPONSABLE AUDITADO"], ["fechas", "FECHA INICIO -FIN"], ["frecuencia", "FRECUENCIA DE LA AUDITORIA"],
  ["documento", "DOCUMENTO DE REFERENCIA"], ["estado", "ESTADO"]
];
// Columna (1 = A) de la marca P (programado) de cada mes; la E (ejecutado) va en la siguiente
function colMesAUD(m) { seguridadRPC_(); return m < 7 ? 16 + m * 2 : 31 + (m - 7) * 2; }
const AUD_COL_OBS = 30, AUD_COL_VIGENCIA = 41, AUD_TOTAL_COLS = 45;

function encabezadosProgramaAUD() { seguridadRPC_();
  const enc = AUD_COLUMNAS_BASE.map(c => c[1]);
  for (let m = 0; m < 12; m++) { enc[colMesAUD(m) - 1] = AUD_MESES[m] + " (P)"; enc[colMesAUD(m)] = AUD_MESES[m] + " (E)"; }
  enc[AUD_COL_OBS - 1] = "OBSERVACIONES";
  enc[AUD_COL_VIGENCIA - 1] = "VIGENCIA";
  enc[41] = "Registrado Por"; enc[42] = "Fecha Registro"; enc[43] = "Actualizado Por"; enc[44] = "Fecha Actualización";
  return enc;
}

function hojaAUD(ss, nombre, encabezados) { seguridadRPC_();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) {
    // F-0001: dos pantallas pueden pedir la misma hoja a la vez; si la otra ya la creó, se usa esa
    try { hoja = ss.insertSheet(nombre); }
    catch (e) { SpreadsheetApp.flush(); hoja = ss.getSheetByName(nombre); if (!hoja) throw e; }
  }
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(encabezados);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight("bold");
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Frecuencia de auditoría de la valoración del proceso (1 a 5 veces al año)
const AUD_FRECUENCIAS_VAL = ["1 vez al año", "2 veces al año", "3 veces al año", "4 veces al año", "5 veces al año"];
function frecuenciaValidaAUD_(f) {
  return AUD_FRECUENCIAS_VAL.find(x => normalizar(x) === normalizar(f)) || "";
}
function filasAUD(hoja, columnas) { seguridadRPC_();
  return hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, columnas).getValues() : [];
}

// Año de la vigencia: columna VIGENCIA o, si se pegó vacía, el año de la fecha de inicio
function vigenciaFilaAUD(r) { seguridadRPC_();
  const v = String(r[AUD_COL_VIGENCIA - 1] || "").trim();
  if (/^\d{4}$/.test(v)) return v;
  if (r[11] instanceof Date) return String(r[11].getFullYear());
  const m = String(r[11] || "").match(/(\d{4})/);
  return m ? m[1] : String(new Date().getFullYear());
}

function marcaAUD(v) { seguridadRPC_();
  const t = normalizar(v).toUpperCase();
  return t === "P" || t === "RP" || t === "E" ? t : "";
}

function filaAAuditoriaAUD(r, fila) { seguridadRPC_();
  const o = { fila: fila };
  AUD_COLUMNAS_BASE.forEach((c, i) => o[c[0]] = r[i] instanceof Date ? formatearFecha(r[i], "d/MM/yyyy") : String(r[i] == null ? "" : r[i]).trim());
  o.meses = AUD_MESES.map((_, m) => ({ p: marcaAUD(r[colMesAUD(m) - 1]), e: marcaAUD(r[colMesAUD(m)]) === "E" ? "E" : "" }));
  o.observaciones = String(r[AUD_COL_OBS - 1] || "");
  o.vigencia = vigenciaFilaAUD(r);
  o.id = o.vigencia + "|" + o.numero;
  return o;
}

function nombresAuditoresAUD(ss) { seguridadRPC_();
  const h = ss.getSheetByName(REG_TIPOS.auditores.hoja);
  if (!h) return [];
  const cols = columnasREG("auditores");
  const iNombre = cols.findIndex(c => c[0] === "nombre"), iEstado = cols.findIndex(c => c[0] === "estado");
  const nombres = {};
  filasAUD(h, cols.length).forEach(r => {
    if (normalizar(r[iEstado]) === "eliminado") return;
    const n = String(r[iNombre] || "").trim(); if (n) nombres[normalizar(n)] = n;
  });
  return Object.values(nombres).sort((a, b) => a.localeCompare(b, "es"));
}

function cargosActivosAUD() { seguridadRPC_();
  const data = inicializarHojaUsuarios().getDataRange().getValues();
  const cols = columnasUsuarios(data[0]);
  const cargos = {};
  data.slice(1).filter(f => usuarioActivo(f, cols)).forEach(f => {
    const c = String(campo(f, cols, "cargo") || "").trim(); if (c) cargos[normalizar(c)] = c;
  });
  return Object.values(cargos).sort((a, b) => a.localeCompare(b, "es"));
}

// ---------- Programa de auditorías ----------
function obtenerProgramaAUD(vigencia) { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_PROGRAMA, encabezadosProgramaAUD());
    const todas = filasAUD(hoja, AUD_TOTAL_COLS).map((r, i) => r[0] === "" && r[4] === "" ? null : filaAAuditoriaAUD(r, i + 2)).filter(Boolean);
    const hojaG = hojaAUD(ss, AUD_HOJA_GENERAL, AUD_GENERAL_COLUMNAS.map(c => c[1]));
    const generales = filasAUD(hojaG, AUD_GENERAL_COLUMNAS.length);

    const vigencias = {};
    vigencias[String(new Date().getFullYear())] = true;
    todas.forEach(a => vigencias[a.vigencia] = true);
    generales.forEach(g => { if (g[0] !== "") vigencias[String(g[0]).trim()] = true; });
    const lista = Object.keys(vigencias).sort();
    const vig = /^\d{4}$/.test(String(vigencia || "")) ? String(vigencia) : (todas.length ? todas[todas.length - 1].vigencia : lista[lista.length - 1]);

    const g = generales.find(x => String(x[0]).trim() === vig);
    const general = { vigencia: vig, guardado: !!g };
    AUD_GENERAL_COLUMNAS.slice(1, 9).forEach((c, i) => general[c[0]] = g ? g[i + 1] : AUD_GENERAL_DEFECTO[c[0]]);
    general.meta = Number(general.meta) > 1 ? Number(general.meta) / 100 : (Number(general.meta) || 1);

    return respuesta(true, {
      vigencia: vig, vigencias: lista.indexOf(vig) === -1 ? lista.concat(vig).sort() : lista,
      general: general,
      auditorias: todas.filter(a => a.vigencia === vig),
      listas: AUD_LISTAS, meses: AUD_MESES, sucursal: AUD_SUCURSAL,
      procesos: leerRutasSD(ss).map(r => r.proceso),
      auditores: nombresAuditoresAUD(ss), responsables: cargosActivosAUD(),
      valoracion: leerValoracionAUD(ss)
    });
  } catch (e) {
    Logger.log("ERROR obtenerProgramaAUD: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function guardarGeneralAUD(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "aud", "editar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const vig = String(datos.vigencia || "").trim();
    if (!/^\d{4}$/.test(vig)) return respuesta(false, null, "La vigencia debe ser un año (ej. 2026)");
    const actor = usuarioSD(usuario);
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_GENERAL, AUD_GENERAL_COLUMNAS.map(c => c[1]));
    const filas = filasAUD(hoja, AUD_GENERAL_COLUMNAS.length);
    const meta = Math.max(0, Math.min(100, Number(datos.meta) || 100)) / 100;
    const valores = [vig].concat(AUD_GENERAL_COLUMNAS.slice(1, 8).map(c => String(datos[c[0]] == null ? "" : datos[c[0]]).trim()),
      [meta, actor ? actor.nombre : String(usuario || ""), new Date()]);
    const i = filas.findIndex(r => String(r[0]).trim() === vig);
    if (i === -1) hoja.appendRow(valores); else hoja.getRange(i + 2, 1, 1, valores.length).setValues([valores]);
    return respuesta(true, { vigencia: vig });
  } catch (e) {
    return respuesta(false, null, "Error guardando el programa: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function buscarAuditoriaAUD(hoja, id) { seguridadRPC_();
  const filas = filasAUD(hoja, AUD_TOTAL_COLS);
  const i = filas.findIndex(r => (vigenciaFilaAUD(r) + "|" + String(r[0]).trim()) === String(id));
  return i === -1 ? null : { fila: i + 2, valores: filas[i], filas: filas };
}

// datos: campos base + meses [{p,e}] + observaciones + vigencia (+ id para editar)
function guardarAuditoriaAUD(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "aud", String(datos && datos.id || "").trim() ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const texto = v => String(v == null ? "" : v).trim();
    const faltan = [];
    [["proceso", "proceso a auditar"], ["clasificacion", "clasificación"], ["tipo", "tipo de auditoría"],
     ["auditor", "responsable de realizar la auditoría"], ["fechas", "fecha inicio - fin"], ["estado", "estado"]]
      .forEach(([k, n]) => { if (!texto(datos[k])) faltan.push(n); });
    const vig = texto(datos.vigencia);
    if (!/^\d{4}$/.test(vig)) faltan.push("vigencia");
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));

    const actor = usuarioSD(usuario);
    const nombreActor = actor ? actor.nombre : texto(usuario);
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_PROGRAMA, encabezadosProgramaAUD());

    let existente = null, numero = texto(datos.numero);
    if (texto(datos.id)) {
      existente = buscarAuditoriaAUD(hoja, datos.id);
      if (!existente) return respuesta(false, null, "No se encontró la auditoría a editar");
      numero = String(existente.valores[0]).trim();
    } else {
      const filas = filasAUD(hoja, AUD_TOTAL_COLS).filter(r => vigenciaFilaAUD(r) === vig);
      numero = String(filas.reduce((mx, r) => Math.max(mx, parseInt(r[0], 10) || 0), 0) + 1);
    }

    const fila = new Array(AUD_TOTAL_COLS).fill("");
    AUD_COLUMNAS_BASE.forEach((c, i) => fila[i] = texto(datos[c[0]]));
    fila[0] = Number(numero) || numero;
    if (!fila[1]) fila[1] = AUD_SUCURSAL;
    (datos.meses || []).slice(0, 12).forEach((mm, m) => {
      const p = marcaAUD(mm && mm.p);
      fila[colMesAUD(m) - 1] = p === "P" || p === "RP" ? p : "";
      fila[colMesAUD(m)] = mm && marcaAUD(mm.e) === "E" ? "E" : "";
    });
    fila[AUD_COL_OBS - 1] = texto(datos.observaciones);
    fila[AUD_COL_VIGENCIA - 1] = vig;
    const ahora = new Date();
    if (existente) {
      fila[41] = existente.valores[41]; fila[42] = existente.valores[42]; fila[43] = nombreActor; fila[44] = ahora;
      hoja.getRange(existente.fila, 1, 1, AUD_TOTAL_COLS).setValues([fila]);
    } else {
      fila[41] = nombreActor; fila[42] = ahora;
      hoja.appendRow(fila);
    }
    return respuesta(true, { id: vig + "|" + numero, numero: numero });
  } catch (e) {
    Logger.log("ERROR guardarAuditoriaAUD: " + e.toString());
    return respuesta(false, null, "Error guardando la auditoría: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Marca rápida desde el cronograma: p = "", "P" o "RP"; e = "" o "E"
function marcarMesAUD(id, mes, p, e, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "aud", "editar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const m = Number(mes);
    if (!(m >= 0 && m < 12)) return respuesta(false, null, "Mes no válido");
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_PROGRAMA, encabezadosProgramaAUD());
    const ex = buscarAuditoriaAUD(hoja, id);
    if (!ex) return respuesta(false, null, "No se encontró la auditoría");
    const mp = marcaAUD(p);
    hoja.getRange(ex.fila, colMesAUD(m), 1, 2).setValues([[mp === "P" || mp === "RP" ? mp : "", marcaAUD(e) === "E" ? "E" : ""]]);
    const actor = usuarioSD(usuario);
    hoja.getRange(ex.fila, 44, 1, 2).setValues([[actor ? actor.nombre : String(usuario || ""), new Date()]]);
    return respuesta(true, { id: id });
  } catch (err) {
    return respuesta(false, null, "Error: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

function eliminarAuditoriaAUD(id, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "aud", "eliminar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_PROGRAMA, encabezadosProgramaAUD());
    const ex = buscarAuditoriaAUD(hoja, id);
    if (!ex) return respuesta(false, null, "No se encontró la auditoría");
    anotarEliminado_(hoja, [hoja.getRange(ex.fila, 1, 1, hoja.getLastColumn()).getValues()[0]]);
    hoja.deleteRow(ex.fila);
    return respuesta(true, { id: id });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ---------- Valoración de procesos auditables ----------
const AUD_VAL_COLUMNAS = [
  ["numero", "N°"], ["sucursal", "SUCURSAL A AUDITAR"], ["clasificacion", "CLASIFICACIÓN DEL PROCESO A AUDITAR"],
  ["macroproceso", "NOMBRE DEL MACROPROCESO A AUDITAR"], ["proceso", "NOMBRE DEL PROCESO A AUDITAR"],
  ["cambios", "El proceso sufrio cambios que afecten la organización (25%)"], ["resultado", "Resultado Auditorias (15%)"],
  ["tiempo", "Tiempo desde Ultima Auditoria (20%)"], ["indicadores", "Cumplimiento a indicadores (15%)"],
  ["planes", "Cumplimiento de recomendaciones y/o planes de acción (25%)"], ["puntaje", "Puntaje Total"], ["frecuencia", "Frecuencia"],
  ["actualizadoPor", "Actualizado Por"], ["fechaActualizacion", "Fecha Actualización"]
];

function leerValoracionAUD(ss) { seguridadRPC_();
  const hoja = hojaAUD(ss, AUD_HOJA_VALORACION, AUD_VAL_COLUMNAS.map(c => c[1]));
  return filasAUD(hoja, AUD_VAL_COLUMNAS.length).map((r, i) => {
    if (r[0] === "" && r[4] === "") return null;
    const o = { fila: i + 2 };
    AUD_VAL_COLUMNAS.slice(0, 5).forEach((c, j) => o[c[0]] = String(r[j] == null ? "" : r[j]).trim());
    AUD_FACTORES.forEach((f, j) => o[f.clave] = Number(r[5 + j]) || 0);
    o.puntaje = puntajeAUD(o);              // se recalcula siempre con los pesos del formato
    o.frecuenciaSugerida = frecuenciaAUD(o.puntaje);
    o.frecuencia = frecuenciaValidaAUD_(r[11]) || o.frecuenciaSugerida;   // la frecuencia elegida (1 a 5 veces al año)
    return o;
  }).filter(Boolean);
}

function obtenerValoracionAUD() { seguridadRPC_();
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    return respuesta(true, {
      procesos: leerValoracionAUD(ss), factores: AUD_FACTORES, listas: AUD_LISTAS, frecuencias: AUD_FRECUENCIAS_VAL,
      sucursal: AUD_SUCURSAL, procesosSGC: leerRutasSD(ss).map(r => r.proceso)
    });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function guardarValoracionAUD(datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "aud", Number(datos && datos.fila) ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const texto = v => String(v == null ? "" : v).trim();
    if (!texto(datos.proceso)) return respuesta(false, null, "Indica el nombre del proceso a auditar");
    const faltan = AUD_FACTORES.filter(f => !(Number(datos[f.clave]) > 0)).map(f => f.titulo);
    if (faltan.length) return respuesta(false, null, "Califica: " + faltan.join(", "));
    const actor = usuarioSD(usuario);
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_VALORACION, AUD_VAL_COLUMNAS.map(c => c[1]));
    const filas = filasAUD(hoja, AUD_VAL_COLUMNAS.length);
    let fila = Number(datos.fila) || 0;
    if (fila && (fila < 2 || fila > filas.length + 1)) return respuesta(false, null, "No se encontró el proceso a editar");
    if (!fila && filas.some(r => normalizar(r[4]) === normalizar(datos.proceso)))
      return respuesta(false, null, "El proceso \"" + texto(datos.proceso) + "\" ya está valorado. Edítalo desde la lista.");
    const v = {};
    AUD_FACTORES.forEach(f => v[f.clave] = Number(datos[f.clave]) || 0);
    const puntaje = puntajeAUD(v);
    const numero = fila ? filas[fila - 2][0] : filas.reduce((mx, r) => Math.max(mx, parseInt(r[0], 10) || 0), 0) + 1;
    const valores = [numero, texto(datos.sucursal) || AUD_SUCURSAL, texto(datos.clasificacion), texto(datos.macroproceso) || texto(datos.proceso), texto(datos.proceso)]
      .concat(AUD_FACTORES.map(f => v[f.clave]), [puntaje, frecuenciaValidaAUD_(datos.frecuencia) || frecuenciaAUD(puntaje), actor ? actor.nombre : texto(usuario), new Date()]);
    if (fila) hoja.getRange(fila, 1, 1, valores.length).setValues([valores]); else hoja.appendRow(valores);
    return respuesta(true, { puntaje: puntaje, frecuencia: valores[11] });
  } catch (e) {
    return respuesta(false, null, "Error guardando la valoración: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function eliminarValoracionAUD(fila, proceso, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "aud", "eliminar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaAUD(ss, AUD_HOJA_VALORACION, AUD_VAL_COLUMNAS.map(c => c[1]));
    const f = Number(fila);
    if (!(f >= 2 && f <= hoja.getLastRow()) || normalizar(hoja.getRange(f, 5).getValue()) !== normalizar(proceso))
      return respuesta(false, null, "El registro cambió; recarga la lista e intenta de nuevo");
    anotarEliminado_(hoja, [hoja.getRange(f, 1, 1, hoja.getLastColumn()).getValues()[0]]);
    hoja.deleteRow(f);
    return respuesta(true, {});
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// REGISTROS CON ARCHIVO Y VERSIONES
// Informes de auditoría · Hojas de vida de auditores · Manuales de funciones
// Cada registro guarda su archivo en Drive; "Nueva versión" deja la anterior como Obsoleta (historial).
// ============================================================
const REG_TIPOS = {
  informes: { hoja: "AUD_Informes", carpeta: "IMCOLMETRIC - Auditoría (Informes)", prefijo: "INF",
    campos: [["fechaAuditoria", "FECHA DE LA AUDITORÍA"], ["tipo", "TIPO DE AUDITORÍA"], ["proceso", "PROCESO AUDITADO"],
             ["auditor", "AUDITOR"], ["observaciones", "OBSERVACIONES"]],
    requeridos: ["fechaAuditoria", "tipo"], archivo: "INFORME" },
  auditores: { hoja: "AUD_Auditores", carpeta: "IMCOLMETRIC - Auditoría (Hojas de vida)", prefijo: "AUD",
    campos: [["nombre", "NOMBRE DEL AUDITOR"], ["tipo", "TIPO DE AUDITOR"], ["proceso", "PROCESO / ESPECIALIDAD"]],
    requeridos: ["nombre"], archivo: "HOJA DE VIDA",
    extras: [["cargo", "CARGO"]] },   // columnas agregadas después: van al final de la hoja
  manuales: { hoja: "GH_ManualesFunciones", carpeta: "IMCOLMETRIC - Gestión Humana (Manuales de funciones)", prefijo: "MF",
    campos: [["codigo", "CÓDIGO"], ["cargo", "CARGO"]],
    requeridos: ["cargo"], archivo: "MANUAL DE FUNCIONES" }
};

function columnasREG(tipo) { seguridadRPC_();
  const t = REG_TIPOS[tipo];
  return [["id", "ID"], ["grupo", "GRUPO"], ["version", "VERSIÓN"], ["estado", "ESTADO"]]
    .concat(t.campos, [["archivo", t.archivo], ["fechaActualizacion", "FECHA ACTUALIZACIÓN"],
      ["registradoPor", "Registrado Por"], ["fechaRegistro", "Fecha Registro"]], t.extras || []);
}
function camposREG_(t) { return t.campos.concat(t.extras || []); }

function leerREG(ss, tipo) { seguridadRPC_();
  const cols = columnasREG(tipo);
  const hoja = asegurarColumnas_(hojaAUD(ss, REG_TIPOS[tipo].hoja, cols.map(c => c[1])), cols.map(c => c[1]));
  const filas = filasAUD(hoja, cols.length);
  // Registros pegados sin ID: se numeran y quedan como versión 1 vigente
  let max = filas.reduce((mx, r) => Math.max(mx, parseInt(String(r[0]).replace(/\D/g, ""), 10) || 0), 0);
  const lista = filas.map((r, i) => {
    const o = { fila: i + 2 };
    cols.forEach((c, j) => o[c[0]] = r[j] instanceof Date ? formatearFecha(r[j], "yyyy-MM-dd") : String(r[j] == null ? "" : r[j]).trim());
    if (!o.id && !o.archivo && cols.slice(4, 4 + REG_TIPOS[tipo].campos.length).every(c => !o[c[0]])) return null;
    if (!o.id) o.id = REG_TIPOS[tipo].prefijo + "-" + ("00" + (++max)).slice(-3);
    o.grupo = o.grupo || o.id;
    o.version = String(o.version == null ? "" : o.version).trim().replace(/^v/i, "") || "1";
    o.estado = o.estado || "Vigente";
    return o;
  }).filter(Boolean);
  return { hoja: hoja, cols: cols, lista: lista };
}

function obtenerRegistrosREG(tipo) { seguridadRPC_();
  try {
    if (!REG_TIPOS[tipo]) return respuesta(false, null, "Tipo de registro no válido");
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const lista = leerREG(ss, tipo).lista.filter(r => normalizar(r.estado) !== "eliminado");
    const extra = {};
    if (tipo === "informes" || tipo === "auditores") {
      extra.procesos = leerRutasSD(ss).map(r => r.proceso);
      extra.auditores = nombresAuditoresAUD(ss);
    }
    if (tipo === "manuales" || tipo === "auditores") extra.cargos = cargosActivosAUD();
    return respuesta(true, Object.assign({ registros: lista }, extra));
  } catch (e) {
    Logger.log("ERROR obtenerRegistrosREG: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function escribirREG(L, o) { seguridadRPC_();
  const valores = L.cols.map(c => {
    const v = o[c[0]];
    if ((c[0] === "fechaAuditoria" || c[0] === "fechaActualizacion") && /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return aFechaCAM(v);
    return v === undefined ? "" : v;
  });
  if (o.fila) L.hoja.getRange(o.fila, 1, 1, valores.length).setValues([valores]);
  else L.hoja.appendRow(valores);
}

function siguienteIdREG(L, tipo) { seguridadRPC_();
  const max = L.lista.reduce((mx, r) => Math.max(mx, parseInt(String(r.id).replace(/\D/g, ""), 10) || 0), 0);
  return REG_TIPOS[tipo].prefijo + "-" + ("00" + (max + 1)).slice(-3);
}

// Crear (sin id) o editar los datos (con id). El archivo es obligatorio al crear.
function guardarRegistroREG(tipo, datos, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, tipo === "manuales" ? "gh" : "aud", String(datos && datos.id || "").trim() ? "editar" : "crear"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    const t = REG_TIPOS[tipo];
    if (!t) return respuesta(false, null, "Tipo de registro no válido");
    const texto = v => String(v == null ? "" : v).trim();
    const faltan = t.requeridos.filter(k => !texto(datos[k])).map(k => t.campos.find(c => c[0] === k)[1].toLowerCase());
    if (!texto(datos.id) && !texto(datos.archivo)) faltan.push(t.archivo.toLowerCase() + " (archivo)");
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));
    const actor = usuarioSD(usuario);
    const nombreActor = actor ? actor.nombre : texto(usuario);
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const L = leerREG(ss, tipo);
    const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    if (texto(datos.id)) {
      const o = L.lista.find(r => r.id === texto(datos.id));
      if (!o) return respuesta(false, null, "No se encontró el registro");
      camposREG_(t).forEach(c => o[c[0]] = texto(datos[c[0]]));
      if (texto(datos.archivo)) o.archivo = texto(datos.archivo);
      if (texto(datos.fechaActualizacion)) o.fechaActualizacion = texto(datos.fechaActualizacion);
      if (texto(datos.version)) o.version = texto(datos.version).replace(/^v/i, "");
      escribirREG(L, o);
      return respuesta(true, { id: o.id });
    }
    if (tipo === "manuales") {
      const dup = L.lista.find(r => normalizar(r.estado) === "vigente" && normalizar(r.cargo) === normalizar(datos.cargo));
      if (dup) return respuesta(false, null, "Ya existe un manual vigente para el cargo " + dup.cargo + ". Usa \"Nueva versión\".");
    }
    const id = siguienteIdREG(L, tipo);
    const o = { id: id, grupo: id, version: texto(datos.version).replace(/^v/i, "") || 1, estado: "Vigente", archivo: texto(datos.archivo),
      fechaActualizacion: texto(datos.fechaActualizacion) || hoy, registradoPor: nombreActor, fechaRegistro: new Date() };
    camposREG_(t).forEach(c => o[c[0]] = texto(datos[c[0]]));
    escribirREG(L, o);
    return respuesta(true, { id: id });
  } catch (e) {
    Logger.log("ERROR guardarRegistroREG: " + e.toString());
    return respuesta(false, null, "Error guardando: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Carga un archivo nuevo: la versión actual pasa a "Obsoleto" y se crea la siguiente como "Vigente"
function nuevaVersionREG(tipo, id, archivo, usuario, versionManual) { seguridadRPC_();
  { const np = negarPermiso(usuario, tipo === "manuales" ? "gh" : "aud", "editar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    if (!REG_TIPOS[tipo]) return respuesta(false, null, "Tipo de registro no válido");
    if (!String(archivo || "").trim()) return respuesta(false, null, "Adjunta el archivo de la nueva versión");
    const actor = usuarioSD(usuario);
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const L = leerREG(ss, tipo);
    const actual = L.lista.find(r => r.id === id);
    if (!actual) return respuesta(false, null, "No se encontró el registro");
    if (normalizar(actual.estado) !== "vigente") return respuesta(false, null, "Solo se puede versionar el registro vigente");
    const version = String(versionManual == null ? "" : versionManual).trim().replace(/^v/i, "") ||
      Math.floor(L.lista.filter(r => r.grupo === actual.grupo).reduce((mx, r) => Math.max(mx, parseFloat(r.version) || 0), 0)) + 1;
    const nuevo = Object.assign({}, actual, {
      fila: 0, id: siguienteIdREG(L, tipo), version: version, estado: "Vigente", archivo: String(archivo).trim(),
      fechaActualizacion: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
      registradoPor: actor ? actor.nombre : String(usuario || ""), fechaRegistro: new Date()
    });
    actual.estado = "Obsoleto";
    escribirREG(L, actual);
    escribirREG(L, nuevo);
    return respuesta(true, { id: nuevo.id, version: version });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Eliminación lógica: el registro y su historial quedan en la hoja con estado "Eliminado"
function eliminarRegistroREG(tipo, id, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, tipo === "manuales" ? "gh" : "aud", "eliminar"); if (np) return np; }
  const lock = LockService.getScriptLock();
  try {
    if (!REG_TIPOS[tipo]) return respuesta(false, null, "Tipo de registro no válido");
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const L = leerREG(ss, tipo);
    const o = L.lista.find(r => r.id === id);
    if (!o) return respuesta(false, null, "No se encontró el registro");
    L.lista.filter(r => r.grupo === o.grupo).forEach(r => { r.estado = "Eliminado"; escribirREG(L, r); });
    return respuesta(true, { id: id });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Visualización segura de la hoja de vida, informe o manual: el servidor entrega el archivo (PDF o imagen)
// para mostrarlo en la plataforma aunque el archivo no esté compartido en Drive.
function verArchivoREG(tipo, id, usuario) { seguridadRPC_();
  try {
    if (!REG_TIPOS[tipo]) return respuesta(false, null, "Tipo de registro no válido");
    if (!usuarioSD(usuario)) return respuesta(false, null, "Usuario no válido");
    const r = leerREG(SpreadsheetApp.openById(ID_HOJA), tipo).lista.find(x => x.id === String(id || "").trim());
    if (!r || !r.archivo) return respuesta(false, null, "El registro no tiene archivo adjunto");
    const fileId = extraerIdDrive(r.archivo);
    if (!fileId) return respuesta(true, { url: r.archivo });
    const f = DriveApp.getFileById(fileId);
    let compartido = false;
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); compartido = true; } catch (e) {}
    const out = { fileId: fileId, nombre: f.getName(), mime: f.getMimeType(), url: r.archivo, compartido: compartido };
    if (f.getSize() <= 10 * 1024 * 1024 && /pdf|^image\//i.test(out.mime)) out.base64 = Utilities.base64Encode(f.getBlob().getBytes());
    return respuesta(true, out);
  } catch (e) {
    return respuesta(false, null, "No se pudo abrir el archivo: " + e.toString());
  }
}

function subirArchivoInformeAUD(nombre, tipo, base64) { seguridadRPC_(); return subirArchivoDrive(REG_TIPOS.informes.carpeta, nombre, tipo, base64); }
function subirArchivoAuditorAUD(nombre, tipo, base64) { seguridadRPC_(); return subirArchivoDrive(REG_TIPOS.auditores.carpeta, nombre, tipo, base64); }
function subirArchivoManualGH(nombre, tipo, base64) { seguridadRPC_(); return subirArchivoDrive(REG_TIPOS.manuales.carpeta, nombre, tipo, base64); }

// ============================================================
// ELIMINAR REGISTROS - No Conformidades, Gestión del Cambio, Matriz de Riesgos y Oportunidades
// Se borran las filas del registro y sus filas relacionadas (correcciones, causas, acciones, actividades).
// ============================================================
function borrarFilasDonde(hoja, ancho, criterio) { seguridadRPC_();
  const n = hoja.getLastRow();
  if (n < 2) return 0;
  const datos = hoja.getRange(2, 1, n - 1, ancho).getValues();
  let borradas = 0;
  for (let i = datos.length - 1; i >= 0; i--) {   // de abajo hacia arriba para no correr las filas
    if (criterio(datos[i])) { anotarEliminado_(hoja, [datos[i]]); hoja.deleteRow(i + 2); borradas++; }
  }
  return borradas;
}

function conBloqueo(fn) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return fn(SpreadsheetApp.openById(ID_HOJA));
  } catch (e) {
    Logger.log("ERROR eliminando: " + e.toString());
    return respuesta(false, null, "Error eliminando: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function eliminarNoConformidad(numero, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "nc", "eliminar"); if (np) return np; }
  const num = String(numero || "").trim();
  if (!num) return respuesta(false, null, "Indica la No Conformidad a eliminar");
  return conBloqueo(ss => {
    const igual = r => String(r[0]).trim() === num;
    if (!borrarFilasDonde(hojaNC(ss, "principal"), HOJAS_NC.principal.encabezados.length, igual))
      return respuesta(false, null, "No se encontró la No Conformidad " + num);
    ["correcciones", "causas", "acciones"].forEach(k => borrarFilasDonde(hojaNC(ss, k), HOJAS_NC[k].encabezados.length, igual));
    return respuesta(true, { numero: num });
  });
}

function eliminarCambioCAM(numero, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "cam", "eliminar"); if (np) return np; }
  const num = String(numero || "").trim();
  if (!num) return respuesta(false, null, "Indica el cambio a eliminar");
  return conBloqueo(ss => {
    if (!borrarFilasDonde(hojaCambiosCAM(ss), CAM_COLUMNAS.length, r => normalizar(r[0]) === normalizar(num)))
      return respuesta(false, null, "No se encontró el cambio " + num);
    return respuesta(true, { numero: num });
  });
}

// fila + ítem: se confirma que la fila sigue siendo el mismo riesgo antes de borrarla
function eliminarRiesgoMR(fila, item, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "mr", "eliminar"); if (np) return np; }
  return conBloqueo(ss => {
    const hoja = hojaRiesgosMR(ss);
    const f = Number(fila);
    if (!(f >= 2 && f <= hoja.getLastRow())) return respuesta(false, null, "El riesgo ya no existe; recarga la matriz");
    const r = hoja.getRange(f, 1, 1, MR_COLUMNAS.length).getValues()[0];
    const itemFila = String(r[0]).trim() || String(f - 1);
    if (itemFila !== String(item).trim() || !String(r[4] || "").trim())
      return respuesta(false, null, "La matriz cambió; recarga e intenta de nuevo");
    anotarEliminado_(hoja, [r]);
    hoja.deleteRow(f);
    return respuesta(true, { item: item });
  });
}

function eliminarOportunidadOP(numero, usuario) { seguridadRPC_();
  { const np = negarPermiso(usuario, "op", "eliminar"); if (np) return np; }
  const n = Number(numero);
  if (!n) return respuesta(false, null, "Indica la oportunidad a eliminar");
  return conBloqueo(ss => {
    if (!borrarFilasDonde(hojaOP(ss, OP_HOJA, OP_COLUMNAS.map(c => c[1])), OP_COLUMNAS.length, r => Number(r[0]) === n))
      return respuesta(false, null, "No se encontró la oportunidad " + n);
    borrarFilasDonde(hojaOP(ss, OP_HOJA_ACT, OP_COLUMNAS_ACT), OP_COLUMNAS_ACT.length, r => Number(r[0]) === n);
    return respuesta(true, { numero: n });
  });
}

// ============================================================
// PERMISOS POR MÓDULO (Crear · Editar · Eliminar)
// Hoja "PERMISOS": CARGO O USUARIO | MÓDULO | CREAR | EDITAR | ELIMINAR (SI / NO).
// - Una fila con el nombre de USUARIO tiene prioridad sobre la fila de su CARGO.
// - Si no hay fila para un cargo, aplica lo predeterminado: Gerente y Coordinador de Calidad tienen todo;
//   los demás cargos pueden crear y editar, pero no eliminar.
// - El Administrador siempre tiene todos los permisos y es el único que administra la matriz.
// Los permisos se validan en el servidor (no basta con ocultar botones).
// ============================================================
const PERM_HOJA = "PERMISOS";
const PERM_MODULOS = [
  { id: "nc", t: "Acciones Correctivas" }, { id: "cam", t: "Gestión del cambio" }, { id: "mr", t: "Matriz de riesgos" },
  { id: "op", t: "Acciones de Mejora" }, { id: "ind", t: "Indicadores" }, { id: "aud", t: "Auditoría" },
  { id: "gh", t: "Gestión Humana" }, { id: "cap", t: "Capacitación" }, { id: "nov", t: "Novedades de la plataforma" }, { id: "cmp", t: "Compras" }, { id: "ven", t: "Ventas" }, { id: "alm", t: "Almacén" }
];
const PERM_ACCIONES = ["crear", "editar", "eliminar"];
const PERM_TXT = { crear: "crear registros", editar: "modificar registros", eliminar: "eliminar o anular registros" };

function esAdministradorPerm(u) { seguridadRPC_();
  return !!u && (normalizar(u.usuario) === "admin" || normalizar(u.cargo).indexOf("administrador") === 0);
}

function permisoPredeterminado(u) { seguridadRPC_();
  const total = /^gerente|^coordinador(a)? de (gestion de )?(la )?calidad/.test(normalizar(u && u.cargo));
  return { crear: true, editar: true, eliminar: total };
}

// Capacitación: administrar cursos es solo de Gerencia, Calidad y Gestión / Talento Humano (todos los demás solo toman los cursos)
function permisoCapPredeterminado(u) { seguridadRPC_();
  const total = /^gerente|^coordinador(a)? de (gestion de )?(la )?calidad|humana|talento|recursos humanos/.test(normalizar(u && u.cargo));
  return { crear: total, editar: total, eliminar: total };
}

// Novedades: las publican la Gerencia y la Coordinación de Calidad (los demás solo las ven)
function permisoNovPredeterminado(u) { seguridadRPC_();
  const total = /^gerente|^coordinador(a)? de (gestion de )?(la )?calidad/.test(normalizar(u && u.cargo));
  return { crear: total, editar: total, eliminar: total };
}

function hojaPermisos(ss) { seguridadRPC_();
  let h = ss.getSheetByName(PERM_HOJA);
  if (!h) {
    h = ss.insertSheet(PERM_HOJA);
    h.appendRow(["CARGO O USUARIO", "MÓDULO", "CREAR", "EDITAR", "ELIMINAR"]);
    h.getRange(1, 1, 1, 5).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  return h;
}

function filasPermisos(ss) { seguridadRPC_();
  const h = ss.getSheetByName(PERM_HOJA);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 5).getValues()
    .filter(r => String(r[0]).trim() && String(r[1]).trim())
    .map(r => ({ quien: String(r[0]).trim(), modulo: String(r[1]).trim(), crear: esValorSi(r[2]), editar: esValorSi(r[3]), eliminar: esValorSi(r[4]) }));
}

// Permisos efectivos de un usuario: { nc: {crear, editar, eliminar}, ... }
function permisosDeUsuario(u, filas) { seguridadRPC_();
  const out = {};
  const admin = esAdministradorPerm(u);
  PERM_MODULOS.forEach(m => {
    if (admin) { out[m.id] = { crear: true, editar: true, eliminar: true }; return; }
    const delMod = (filas || []).filter(f => normalizar(f.modulo) === m.id);
    const fu = u && delMod.find(f => normalizar(f.quien) === normalizar(u.usuario));
    const fc = u && delMod.find(f => normalizar(f.quien) === normalizar(u.cargo));
    const f = fu || fc;
    out[m.id] = f ? { crear: f.crear, editar: f.editar, eliminar: f.eliminar } : (m.id === "cap" ? permisoCapPredeterminado(u) : m.id === "nov" ? permisoNovPredeterminado(u) : permisoPredeterminado(u));
  });
  return out;
}

let PERM_CACHE = null;   // una lectura por ejecución
function permisoUsuario(usuario, modulo, accion) { seguridadRPC_();
  const u = usuarioSD(usuario);
  if (!u) return false;
  if (!PERM_CACHE) PERM_CACHE = filasPermisos(SpreadsheetApp.openById(ID_HOJA));
  const p = permisosDeUsuario(u, PERM_CACHE)[modulo];
  return !!(p && p[accion]);
}

// Lanza un error si el usuario no tiene el permiso (lo usan también Compras, Ventas y Almacén)
function exigirPermiso(usuario, modulo, accion) { seguridadRPC_();
  if (permisoUsuario(usuario, modulo, accion)) return;
  const m = PERM_MODULOS.find(x => x.id === modulo);
  throw new Error("No tienes permiso para " + PERM_TXT[accion] + " en " + (m ? m.t : modulo) + ". Solicítalo al Administrador del sistema.");
}

// Igual que exigirPermiso pero devuelve la respuesta de error (para funciones que responden con respuesta())
function negarPermiso(usuario, modulo, accion) { seguridadRPC_();
  try { exigirPermiso(usuario, modulo, accion); return null; } catch (e) { return respuesta(false, null, e.message); }
}

// Permisos del usuario conectado (la pantalla oculta lo que no puede hacer)
function obtenerPermisos(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    return respuesta(true, { admin: esAdministradorPerm(u), monitor: puedeMonitorear_(u), editaUrlDocs: puedeEditarUrlDocs_(u), gestorCalidad: puedeEditarUrlDocs_(u), gestorFallos: puedeGestionarFallos_(u), permisos: permisosDeUsuario(u, filasPermisos(SpreadsheetApp.openById(ID_HOJA))) });
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// Matriz completa para la pantalla de administración (solo Administrador)
function obtenerMatrizPermisos(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!esAdministradorPerm(u)) return respuesta(false, null, "Solo el Administrador puede administrar los permisos");
    const data = inicializarHojaUsuarios().getDataRange().getValues();
    const cols = columnasUsuarios(data[0]);
    const usuarios = data.slice(1).filter(f => usuarioActivo(f, cols)).map(f => ({
      usuario: String(campo(f, cols, "usuario")), nombre: String(campo(f, cols, "nombre") || ""), cargo: String(campo(f, cols, "cargo") || "")
    }));
    const cargos = {};
    usuarios.forEach(x => { if (x.cargo) cargos[normalizar(x.cargo)] = x.cargo; });
    const filas = filasPermisos(SpreadsheetApp.openById(ID_HOJA));
    return respuesta(true, {
      modulos: PERM_MODULOS, acciones: PERM_ACCIONES, usuarios: usuarios,
      cargos: Object.values(cargos).sort((a, b) => a.localeCompare(b, "es")),
      filas: filas,
      predeterminados: Object.values(cargos).map(c => ({ cargo: c, admin: esAdministradorPerm({ usuario: "", cargo: c }), p: permisoPredeterminado({ cargo: c }), pcap: permisoCapPredeterminado({ cargo: c }), pnov: permisoNovPredeterminado({ cargo: c }) }))
    });
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// filas: [{ quien, modulo, crear, editar, eliminar }] — reemplaza toda la matriz
function guardarMatrizPermisos(usuario, filas) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    if (!esAdministradorPerm(u)) return respuesta(false, null, "Solo el Administrador puede administrar los permisos");
    lock.waitLock(20000);
    const ids = PERM_MODULOS.map(m => m.id);
    const valores = (filas || []).filter(f => String(f.quien || "").trim() && ids.indexOf(f.modulo) !== -1)
      .map(f => [String(f.quien).trim(), f.modulo, f.crear ? "SI" : "NO", f.editar ? "SI" : "NO", f.eliminar ? "SI" : "NO"]);
    const h = hojaPermisos(SpreadsheetApp.openById(ID_HOJA));
    if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 5).clearContent();
    if (valores.length) h.getRange(2, 1, valores.length, 5).setValues(valores);
    return respuesta(true, { filas: valores.length });
  } catch (e) {
    return respuesta(false, null, "Error guardando los permisos: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// AUTORIZACIÓN DE PERMISOS
// Ejecutar UNA VEZ desde el editor de Apps Script (seleccionar "autorizarPermisos"
// y pulsar Ejecutar) para que Google pida los permisos de Drive y correo.
// Luego publicar una nueva versión de la implementación.
// ============================================================
function autorizarPermisos() { seguridadRPC_();
  SpreadsheetApp.openById(ID_HOJA).getName();
  const carpeta = carpetaSGC(NOMBRE_CARPETA_NC);
  Logger.log("Drive autorizado. Carpeta de evidencias: " + carpeta.getUrl());
  ScriptApp.getService();
  Logger.log("Correos disponibles hoy: " + MailApp.getRemainingDailyQuota());
  diagnosticoAlmacenamiento();
}

// ============================================================
// CARPETAS DE DRIVE DONDE SE GUARDAN LOS ARCHIVOS CARGADOS
// Todo lo que se sube al portal queda dentro de UNA carpeta raíz:
//   - la de la propiedad del script CARPETA_RAIZ_ID (si se configura), o
//   - la carpeta de Drive donde está la hoja ID_HOJA (el Drive nuevo).
// Las subcarpetas (Solicitudes Documentales, No Conformidades, Compras...) se buscan
// SOLO dentro de esa raíz. Antes se buscaban por nombre en todo el Drive y se usaban
// las carpetas antiguas compartidas desde otra cuenta.
// ============================================================
function carpetaRaizSGC() { seguridadRPC_();
  const id = String(PropertiesService.getScriptProperties().getProperty("CARPETA_RAIZ_ID") || "").trim();
  if (id) return DriveApp.getFolderById(id);
  const padres = DriveApp.getFileById(ID_HOJA).getParents();
  return padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
}

function carpetaSGC(nombre) { seguridadRPC_();
  const raiz = carpetaRaizSGC();
  const it = raiz.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : raiz.createFolder(nombre);
}

// Ejecutar desde el editor: sube un archivo de prueba y muestra en el registro dónde quedó
function probarSubidaDrive() { seguridadRPC_();
  const r = JSON.parse(subirArchivoDrive(SD_CARPETA, "Prueba de carga.txt", "text/plain",
    Utilities.base64Encode("Archivo de prueba del portal IMCOLMETRIC SGC " + new Date())));
  Logger.log(r.ok ? "Archivo creado: " + r.data.url : "Error: " + r.error);
  diagnosticoAlmacenamiento();
}

function propietarioDrive_(item) {
  try { const o = item.getOwner(); return o ? o.getEmail() : "(unidad compartida)"; } catch (e) { return "(no disponible)"; }
}

// Ejecutar desde el editor: muestra con qué cuenta corre el código y dónde se guardan los datos.
function diagnosticoAlmacenamiento() { seguridadRPC_();
  const ss = SpreadsheetApp.openById(ID_HOJA);
  const raiz = carpetaRaizSGC();
  Logger.log("Cuenta que ejecuta el código: " + Session.getEffectiveUser().getEmail());
  Logger.log("Hoja de datos: " + ss.getName() + " | propietario: " + propietarioDrive_(DriveApp.getFileById(ID_HOJA)) + " | " + ss.getUrl());
  Logger.log("Carpeta raíz de archivos: " + raiz.getName() + " | propietario: " + propietarioDrive_(raiz) + " | " + raiz.getUrl());
  Logger.log("Si la cuenta o los propietarios no son el correo corporativo: cree una NUEVA implementación de la " +
    "aplicación web desde el correo corporativo (Ejecutar como: Yo) y use la nueva URL.");
}

// ============================================================
// UTILIDADES
// ============================================================
function extraerIdDrive(url){ seguridadRPC_();
  const m = String(url || "").match(/[-\w]{25,}/);
  return m ? m[0] : "";
}

// Seguimiento de solo agregar: lo ya registrado queda fijo; cada entrada nueva se agrega con fecha y autor.
// No llama seguridadRPC_ porque es interno (termina en _ y no es invocable desde el cliente).
function agregarSeguimiento_(previo, nuevo, autor) {
  previo = String(previo == null ? "" : previo).trim();
  nuevo = String(nuevo == null ? "" : nuevo).trim();
  if (!nuevo) return previo;
  const sello = "[" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") + " · " + String(autor || "").trim() + "]";
  return (previo ? previo + "\n\n" : "") + sello + " " + nuevo;
}

function formatearFecha(valor, formato) { seguridadRPC_();
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), formato);
  }
  return valor || "";
}

function aNumero(valor) { seguridadRPC_();
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return isNaN(n) ? null : n;
}

// ============================================================
// REGISTRO DE FALLOS · lo que ve el personal
// Cada persona ve solo los fallos que ella reportó (con su tratamiento). El registro completo
// y la bitácora los ve únicamente el Administrador del sistema (obtenerFallos).
// ============================================================
function misFallosReportados(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const hoja = SpreadsheetApp.openById(ID_HOJA).getSheetByName("REGISTRO_FALLOS");
    if (!hoja || hoja.getLastRow() < 2) return respuesta(true, { fallos: [] });
    const datos = hoja.getDataRange().getValues();
    const enc = datos[0].map(x => normalizar(x));
    const c = n => enc.indexOf(normalizar(n));
    const zona = Session.getScriptTimeZone() || "America/Bogota";
    const v = (f, n) => { const i = c(n); if (i === -1) return ""; const x = f[i]; return x instanceof Date ? Utilities.formatDate(x, zona, "yyyy-MM-dd HH:mm") : String(x === null || x === undefined ? "" : x); };
    const yo = normalizar(u.usuario);
    const fallos = datos.slice(1).filter(f => normalizar(v(f, "USUARIO")) === yo && v(f, "ORIGEN") === "Reportado por usuario").map(f => ({
      id: v(f, "ID"), fecha: v(f, "FECHA"), modulo: v(f, "MÓDULO"), descripcion: v(f, "DESCRIPCIÓN DEL FALLO"),
      accionInmediata: v(f, "ACCIÓN INMEDIATA"), accionCorrectiva: v(f, "ACCIÓN CORRECTIVA"), responsable: v(f, "RESPONSABLE"),
      estado: v(f, "ESTADO") || "Abierto", fechaCierre: v(f, "FECHA DE CIERRE")
    })).reverse();
    return respuesta(true, { fallos: fallos });
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// ============================================================
// TRATAMIENTO DE LOS FALLOS REGISTRADOS (F-0001 a F-0004) · ejecutar UNA vez desde el editor,
// después de pegar el código corregido (Code.gs e index.html).
// Diligencia todos los campos del registro: acción inmediata, acción correctiva, responsable,
// NC relacionada, estado «Cerrado», fecha de cierre y quién cierra. Lo que había escrito antes
// en esas casillas queda en el HISTORIAL (F-0004 tenía por error el tratamiento de F-0001).
// ============================================================
const FALLOS_TRATAMIENTO_NOV2026 = {
  "F-0001": {
    inmediata: "Se verificó que la hoja NOV_Vistas existe y conserva sus datos: el error no causó pérdida de información. Se recargó la pantalla de Novedades y el historial cargó con normalidad.",
    correctiva: "Causa: dos solicitudes simultáneas (aviso de novedades e historial) intentaban crear la hoja NOV_Vistas al mismo tiempo; la segunda fallaba porque la primera ya la había creado. Corrección: hojaOP, hojaSD y hojaAUD (Code.gs) ahora, si la hoja ya fue creada por otra solicitud, toman la existente en lugar de mostrar el error. Aplica a todas las hojas que crea la plataforma."
  },
  "F-0002": {
    inmediata: "Se recargó la pantalla de Permisos de usuarios, se asignaron los permisos nuevamente y se verificó en la bitácora (B-0005, 19-11-2026 15:14) que la matriz quedó guardada.",
    correctiva: "Causa: el cargo o usuario seleccionado tenía permisos guardados solo para algunos módulos; al marcar la casilla «crear» de un módulo sin registro previo, la pantalla intentaba escribir en un módulo inexistente («Cannot set properties of undefined»). Corrección: pmxAsegurar (index.html) completa los módulos que falten con su valor por defecto antes de cambiar la casilla."
  },
  "F-0003": { igual: "F-0002", casilla: "editar" },
  "F-0004": { igual: "F-0002", casilla: "eliminar" }
};
const FALLOS_RESPONSABLE = "Administrador del sistema (desarrollo de la plataforma)";
const FALLOS_NC = "No aplica: fallo de la plataforma sin impacto en resultados de calibración ni pérdida de datos.";
function documentarFallosRegistrados() { seguridadRPC_();
  if (typeof RPC_ !== "undefined" && RPC_.activo) throw new Error("Solo se ejecuta desde el editor de Apps Script.");
  const hoja = SpreadsheetApp.openById(ID_HOJA).getSheetByName("REGISTRO_FALLOS");
  if (!hoja) throw new Error("No existe la hoja REGISTRO_FALLOS.");
  const datos = hoja.getDataRange().getValues();
  const enc = datos[0].map(x => normalizar(x));
  const c = n => enc.indexOf(normalizar(n));
  const cols = { id: c("ID"), ai: c("ACCIÓN INMEDIATA"), ac: c("ACCIÓN CORRECTIVA"), r: c("RESPONSABLE"), e: c("ESTADO"),
    fc: c("FECHA DE CIERRE"), cp: c("CERRADO POR"), nc: c("NC RELACIONADA"), h: c("HISTORIAL") };
  Object.keys(cols).forEach(k => { if (cols[k] === -1) throw new Error("Falta una columna en REGISTRO_FALLOS (" + k + ")."); });
  const zona = Session.getScriptTimeZone() || "America/Bogota";
  const ahora = new Date(), txtAhora = Utilities.formatDate(ahora, zona, "yyyy-MM-dd HH:mm");
  const quien = "Administrador Sistema";
  const hechos = [];
  for (let i = 1; i < datos.length; i++) {
    const f = datos[i], id = String(f[cols.id]).trim();
    let t = FALLOS_TRATAMIENTO_NOV2026[id];
    if (!t) continue;
    if (t.igual) {
      const b = FALLOS_TRATAMIENTO_NOV2026[t.igual];
      t = { inmediata: b.inmediata, correctiva: "Mismo caso que " + t.igual + " (casilla «" + t.casilla + "»). " + b.correctiva.replace("la casilla «crear»", "la casilla «" + t.casilla + "»") };
    }
    const nuevo = { ai: t.inmediata, ac: t.correctiva, r: FALLOS_RESPONSABLE, nc: FALLOS_NC, e: "Cerrado" };
    const igual = Object.keys(nuevo).every(k => String(f[cols[k]]).trim() === nuevo[k]);
    if (igual) continue;   // ya documentado: no se repite
    const antes = ["ai", "ac", "r"].filter(k => String(f[cols[k]]).trim() && String(f[cols[k]]).trim() !== nuevo[k])
      .map(k => ({ ai: "Acción inmediata", ac: "Acción correctiva", r: "Responsable" })[k] + " anterior: " + String(f[cols[k]]).trim());
    const estAntes = String(f[cols.e]).trim() || "Abierto";
    Object.keys(nuevo).forEach(k => { f[cols[k]] = nuevo[k]; });
    f[cols.fc] = ahora; f[cols.cp] = quien;
    f[cols.h] = [String(f[cols.h] || "").trim(),
      txtAhora + " · " + quien + " · " + estAntes + " → Cerrado · Tratamiento documentado y corrección publicada (Code.gs / index.html)." +
      (antes.length ? " Se reemplazó lo registrado antes (" + (id === "F-0004" ? "correspondía al fallo F-0001" : "texto previo") + "): " + antes.join(" | ") : "")].filter(Boolean).join("\n");
    hoja.getRange(i + 1, 1, 1, f.length).setValues([f]);
    hechos.push(id);
  }
  const txt = hechos.length ? "Fallos documentados y cerrados: " + hechos.join(", ") : "No había nada pendiente por documentar.";
  Logger.log(txt);
  return txt;
}

// ============================================================
// ALERTAS DE ACTIVIDADES VENCIDAS (ventana emergente en cada ingreso)
// Reúne lo que el usuario tiene pendiente como responsable (por cargo, nombre o usuario):
//   · Gestión del Cambio: actividades con fecha límite vencida de cambios no terminados
//   · Matriz de Oportunidades: actividades con fecha límite vencida y sin terminar
//   · No Conformidades: acciones correctivas con fecha de implementación vencida (responsable: ALERTAS_RESP_NC)
//   · Matriz de Riesgos: acciones con fecha de ejecución vencida sin acciones realizadas registradas
//   · Indicadores: periodos cerrados sin diligenciar (el del mes anterior, a partir del día ALERTAS_DIA_IND),
//     para el responsable de medición / análisis (líder del proceso)
// ============================================================
const ALERTAS_DIA_IND = 5;                         // después del día 5 de cada mes se alerta el periodo que cerró el mes anterior
const ALERTAS_RESP_NC = "Coordinador de Calidad";  // las NC no tienen responsable por acción: las lidera Calidad

function alertasPendientes(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const zona = Session.getScriptTimeZone() || "America/Bogota";
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const yo = [normalizar(u.cargo), normalizar(u.nombre), normalizar(u.usuario)].filter(Boolean);
    // El responsable puede ser «Gerente / Director de Laboratorio», «Coordinador de Calidad y Gerente», un nombre o un usuario
    const esMio = resp => normalizar(resp).split(/\s*(?:\/|,|;|\by\b|\be\b|\n)\s*/).map(x => x.trim()).filter(Boolean)
      .some(p => yo.some(y => y === p || (p.length > 4 && (y.indexOf(p) === 0 || p.indexOf(y) === 0))));
    const fecha = v => {
      if (v instanceof Date) { const d = new Date(v.getTime()); d.setHours(0, 0, 0, 0); return isNaN(d) ? null : d; }
      const s = String(v || "").trim(); let m;
      if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
      if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return new Date(+m[3], +m[2] - 1, +m[1]);
      return null;
    };
    const dias = d => Math.round((hoy - d) / 86400000);
    const fmt = d => Utilities.formatDate(d, zona, "dd/MM/yyyy");
    const leer = nombre => { const h = ss.getSheetByName(nombre); if (!h || h.getLastRow() < 2) return null;
      const v = h.getDataRange().getValues(); const enc = v[0].map(x => normalizar(x));
      return { filas: v.slice(1), c: n => enc.indexOf(normalizar(n)) }; };
    const corto = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > (n || 140) ? t.slice(0, (n || 140) - 1) + "…" : t; };
    const alertas = [];
    const agregar = (o) => alertas.push(o);

    // ---- Gestión del Cambio ----
    try {
      const h = ss.getSheetByName(CAM_HOJA);
      if (h && h.getLastRow() > 1) h.getDataRange().getValues().slice(1).forEach(r => {
        const o = {}; CAM_COLUMNAS.forEach((c, i) => o[c[0]] = r[i]);
        if (!String(o.numero || "").trim() || normalizar(o.estado) === "terminado") return;
        actividadesCAM(o).forEach(a => {
          const f = fecha(a.fechaLimite);
          if (!f || f >= hoy || !esMio(a.responsable)) return;
          agregar({ modulo: "cam", nombreModulo: "Gestión del Cambio", ref: "Cambio N° " + o.numero, titulo: corto(a.actividad),
            detalle: corto(o.descripcion, 110), fecha: fmt(f), dias: dias(f), responsable: a.responsable });
        });
      });
    } catch (e) { Logger.log("Alertas CAM: " + e); }

    // ---- Acciones de Mejora que generan cambios: el líder del proceso debe registrar la gestión del cambio ----
    try {
      oportunidadesSinCambioOP_(ss).forEach(o => {
        const l = liderProcesoOP_(ss, o.proceso);
        if (!cumpleRolSD(u, l.cargo, l.correo)) return;
        const f = String(o.liderNotificado || "").match(/(\d{4})-(\d{2})-(\d{2})/);
        const d = f ? new Date(Number(f[1]), Number(f[2]) - 1, Number(f[3])) : hoy;
        agregar({ modulo: "opcam", nombreModulo: "Gestión del Cambio", ref: "Oportunidad de mejora N° " + ("0" + o.numero).slice(-2),
          titulo: "Registrar la gestión del cambio", detalle: corto(o.oportunidad, 110), fecha: fmt(d), dias: Math.max(0, dias(d)), responsable: l.cargo });
      });
    } catch (e) { Logger.log("Alertas OP→CAM: " + e); }

    // ---- Matriz de Oportunidades (actividades) ----
    try {
      const t = leer(OP_HOJA_ACT);
      if (t) t.filas.forEach(r => {
        const est = normalizar(r[t.c("Estado")]), av = Number(r[t.c("% Avance")]) || 0, pct = av > 1 ? av : av * 100;   // 1 = 100 %
        if (/^terminad|^cerrad|^cumplid/.test(est) || pct >= 100) return;
        const f = fecha(r[t.c("Fecha Límite")]);
        if (!f || f >= hoy || !esMio(r[t.c("Responsable")])) return;
        agregar({ modulo: "op", nombreModulo: "Acciones de Mejora", ref: "Oportunidad N° " + r[t.c("N° Oportunidad")], titulo: corto(r[t.c("Actividad")]),
          detalle: "Avance " + Math.round(pct) + "%", fecha: fmt(f), dias: dias(f), responsable: String(r[t.c("Responsable")]) });
      });
    } catch (e) { Logger.log("Alertas OP: " + e); }

    // ---- No Conformidades (acciones correctivas) ----
    try {
      if (esMio(ALERTAS_RESP_NC)) {
        const nc = leer("NoConformidades"), ac = leer("NC_AccionesCorrectivas"), cerradas = {};
        if (nc) nc.filas.forEach(r => { if (/^cerrad|^anulad/.test(normalizar(r[nc.c("Estado")]))) cerradas[String(r[nc.c("N°")]).trim()] = true; });
        if (ac) ac.filas.forEach(r => {
          const num = String(r[ac.c("N° NC")]).trim(), est = normalizar(r[ac.c("Estado")]), pctB = Number(r[ac.c("% Cumplimiento")]) || 0, pct = pctB > 1 ? pctB : pctB * 100;
          if (!num || cerradas[num] || /^terminad|^cerrad|^cumplid/.test(est) || pct >= 100) return;
          const f = fecha(r[ac.c("Fecha Implementación")]);
          if (!f || f >= hoy) return;
          agregar({ modulo: "nc", nombreModulo: "Acciones Correctivas", ref: num, titulo: corto(r[ac.c("Acción Correctiva")]),
            detalle: "Acción correctiva " + (r[ac.c("Estado")] || "sin iniciar") + " · " + pct + "%", fecha: fmt(f), dias: dias(f), responsable: ALERTAS_RESP_NC });
        });
      }
    } catch (e) { Logger.log("Alertas NC: " + e); }

    // ---- Matriz de Riesgos ----
    try {
      const h = ss.getSheetByName(MR_HOJA);
      if (h && h.getLastRow() > 1) h.getDataRange().getValues().slice(1).forEach(r => {
        const o = {}; MR_COLUMNAS.forEach((c, i) => o[c[0]] = r[i]);
        if (!String(o.item || "").trim() || String(o.accionesRealizadas || "").trim()) return;
        const f = fecha(o.fechaAccion);
        if (!f || f >= hoy) return;
        const accs = accionesMR(o);
        const resp = accs.map(a => a.responsable).filter(Boolean).join(" / ") || String(o.responsableEjecucion || "");
        if (!esMio(resp)) return;
        agregar({ modulo: "mr", nombreModulo: "Matriz de Riesgos", ref: "Riesgo N° " + o.item, titulo: corto(o.evento),
          detalle: "Sin acciones realizadas registradas · " + accs.length + " acción(es) propuesta(s)", fecha: fmt(f), dias: dias(f), responsable: resp });
      });
    } catch (e) { Logger.log("Alertas MR: " + e); }

    // ---- Indicadores: periodos sin diligenciar (líder del proceso) ----
    try {
      const h = ss.getSheetByName("Indicadores");
      if (h && h.getLastRow() > 1) {
        const meses = {};
        const hd = ss.getSheetByName("DatosIndicadores");
        if (hd && hd.getLastRow() > 1) hd.getDataRange().getValues().slice(1).forEach(r => {
          if (!r[0] || !medicionConDatoInd_(r)) return;
          const i = indiceMesInd_(r[1]); if (i >= 0) (meses[r[0]] = meses[r[0]] || {})[i] = true;
        });
        const mesAct = hoy.getMonth(), dia = hoy.getDate(), anio = hoy.getFullYear();
        const NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        h.getDataRange().getValues().slice(1).filter(r => r[0]).forEach(r => {
          const ind = mapearIndicador(r);
          if (estadoIndicador_(ind.estado) === "Inactivo") return;
          const lideres = [ind.responsableMedicion, ind.responsableAnalisis].filter(Boolean).join(" / ");
          if (!esMio(lideres)) return;
          const fr = normalizar(ind.frecuenciaMedicion);
          const tam = /bimes/.test(fr) ? 2 : /trimes/.test(fr) ? 3 : /cuatrimes/.test(fr) ? 4 : /semes/.test(fr) ? 6 : /anual|bienal/.test(fr) ? 12 : 1;
          const con = meses[ind.id] || {};
          const pend = [];
          for (let ini = 0; ini < 12; ini += tam) {
            const cierre = ini + tam - 1;
            if (cierre >= mesAct) break;                                 // periodo en curso o futuro
            if (cierre === mesAct - 1 && dia <= ALERTAS_DIA_IND) continue; // aún dentro de los primeros días del mes
            let lleno = false; for (let m = ini; m <= cierre; m++) if (con[m]) lleno = true;
            if (!lleno) pend.push(tam === 1 ? NOMBRES[ini] : tam === 12 ? "año " + anio : NOMBRES[ini] + "–" + NOMBRES[cierre]);
          }
          if (!pend.length) return;
          // Vence el día 5 del mes siguiente al cierre del periodo pendiente más antiguo
          const primero = pend[0], iniMes = NOMBRES.indexOf(primero.split("–").pop()) === -1 ? 11 : NOMBRES.indexOf(primero.split("–").pop());
          const vence = new Date(anio, iniMes + 1, ALERTAS_DIA_IND);
          agregar({ modulo: "ind", nombreModulo: "Indicadores", ref: (ind.codigo || "Indicador") + " · " + (ind.proceso || ""), titulo: corto(ind.nombre),
            detalle: "Sin diligenciar: " + pend.join(", ") + " (" + (ind.frecuenciaMedicion || "Mensual") + ")", fecha: fmt(vence), dias: Math.max(dias(vence), 0), responsable: lideres });
        });
      }
    } catch (e) { Logger.log("Alertas IND: " + e); }

    alertas.sort((a, b) => b.dias - a.dias);
    return respuesta(true, { alertas: alertas, hoy: fmt(hoy) });
  } catch (e) {
    return respuesta(false, null, e.toString());
  }
}

// ============================================================
// MONITOREO DE USUARIOS (solo Administrador del sistema)
//   · Presencia: cada pantalla abierta avisa cada minuto (presenciaLatido). Conectado = señal en los últimos 3 minutos.
//   · Trazabilidad: cada creación, modificación o eliminación que hace un usuario queda en la hoja TRAZABILIDAD_USUARIOS
//     con la fecha, el usuario de la sesión (lo pone el servidor, no el navegador), el módulo, la función y el resultado.
//   · Eliminaciones: además se avisa por correo a los administradores (TRAZA_CORREO_ELIMINACION).
//   · El Administrador puede cerrar la sesión de un usuario conectado (se cierra en su siguiente señal).
// ============================================================
const TRAZA_HOJA = "TRAZABILIDAD_USUARIOS";
const TRAZA_COLUMNAS = ["FECHA", "USUARIO", "NOMBRE", "CARGO", "TIPO", "MÓDULO", "PANTALLA", "FUNCIÓN", "DETALLE", "RESULTADO"];
const TRAZA_CORREO_ELIMINACION = true;
const PRES_CLAVE = "PRES_MAPA", PRES_EXPULSAR = "PRES_EXPULSAR";
// Únicos usuarios que pueden ver el monitoreo y cerrar sesiones (por usuario, no por cargo)
const MONITOR_USUARIOS = ["admin"];
function puedeMonitorear_(u) { return !!u && MONITOR_USUARIOS.map(x => normalizar(x)).indexOf(normalizar(u.usuario)) !== -1; }

function presLeer_(clave) {
  try { const c = CacheService.getScriptCache().get(clave); if (c) return JSON.parse(c); } catch (e) {}
  try { const p = PropertiesService.getScriptProperties().getProperty(clave); if (p) return JSON.parse(p); } catch (e) {}
  return {};
}
function presGuardar_(clave, obj) {
  const t = JSON.stringify(obj);
  try { CacheService.getScriptCache().put(clave, t, 21600); } catch (e) {}
  try { PropertiesService.getScriptProperties().setProperty(clave, t); } catch (e) {}
}
// Actualiza la presencia del usuario y devuelve si el Administrador pidió cerrar su sesión
function presActualizar_(u, pantalla, extra) {
  const lock = LockService.getScriptLock();
  let ok = false; try { ok = lock.tryLock(4000); } catch (e) {}
  try {
    const mapa = presLeer_(PRES_CLAVE), ahora = Date.now(), k = normalizar(u.usuario);
    Object.keys(mapa).forEach(x => { if (ahora - mapa[x].ultimo > 30 * 60000) delete mapa[x]; });   // más de 30 min sin señal: fuera
    const prev = mapa[k] || {};
    mapa[k] = Object.assign(prev, { usuario: u.usuario, nombre: u.nombre, cargo: u.cargo, ultimo: ahora,
      inicio: prev.inicio && ahora - prev.ultimo < 30 * 60000 ? prev.inicio : ahora,
      pantalla: pantalla || prev.pantalla || "", navegador: extra && extra.navegador ? String(extra.navegador).slice(0, 120) : prev.navegador || "",
      accion: extra && extra.accion ? extra.accion : prev.accion || "", fAccion: extra && extra.accion ? ahora : prev.fAccion || 0 });
    if (extra && extra.salida) delete mapa[k];
    presGuardar_(PRES_CLAVE, mapa);
    const exp = presLeer_(PRES_EXPULSAR);
    if (exp[k]) { const m = exp[k]; delete exp[k]; presGuardar_(PRES_EXPULSAR, exp); delete mapa[k]; presGuardar_(PRES_CLAVE, mapa); return m; }
    return null;
  } finally { if (ok) lock.releaseLock(); }
}

function presenciaLatido(usuario, info) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    info = info || {};
    const exp = presActualizar_(u, String(info.pantalla || "").slice(0, 80), { navegador: info.navegador, salida: info.salida });
    return respuesta(true, { expulsar: !!exp, mensaje: exp ? "El Administrador del sistema cerró tu sesión" + (exp.motivo ? ": " + exp.motivo : ".") : "" });
  } catch (e) { return respuesta(false, null, e.toString()); }
}

// Registro de acciones enviado por la pantalla (en lotes). El usuario es el de la sesión.
function trazaRegistrar(usuario, eventos) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const lista = (Array.isArray(eventos) ? eventos : []).slice(0, 60);
    if (!lista.length) return respuesta(true, { n: 0 });
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const hoja = hojaOP(ss, TRAZA_HOJA, TRAZA_COLUMNAS);
    const tipos = ["Ingreso", "Salida", "Navegación", "Creación", "Modificación", "Eliminación"];
    const t = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
    const filas = lista.map(e => [e && e.fecha && !isNaN(new Date(e.fecha)) && Math.abs(Date.now() - new Date(e.fecha)) < 6 * 3600000 ? new Date(e.fecha) : new Date(),
      u.usuario, u.nombre, u.cargo, tipos.indexOf(e.tipo) !== -1 ? e.tipo : "Modificación", t(e.modulo, 60), t(e.pantalla, 80), t(e.funcion, 60), t(e.detalle, 500), t(e.resultado, 200)]);
    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try { hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, TRAZA_COLUMNAS.length).setValues(filas); } finally { lock.releaseLock(); }
    const ult = lista[lista.length - 1] || {};
    presActualizar_(u, t(ult.pantalla, 80), { accion: t((ult.tipo || "") + " · " + (ult.modulo || "") + " · " + (ult.funcion || ""), 160) });
    // Aviso inmediato a los administradores cuando alguien elimina o anula un registro
    const elim = lista.filter(e => e.tipo === "Eliminación" && !/^Rechaz|^Error/.test(String(e.resultado || "")));
    if (TRAZA_CORREO_ELIMINACION && elim.length && !esAdministradorPerm(u)) {
      try {
        const correos = trazaCorreosAdmin_();
        if (correos.length) MailApp.sendEmail({ to: correos.join(","), subject: "⚠️ Plataforma SGC: " + u.nombre + " eliminó " + elim.length + " registro(s)",
          htmlBody: "<p><b>" + u.nombre + "</b> (" + u.cargo + ", usuario " + u.usuario + ") eliminó o anuló:</p><ul>" +
            elim.map(e => "<li><b>" + t(e.modulo, 60) + "</b> · " + t(e.funcion, 60) + " · " + t(e.detalle, 300) + "</li>").join("") +
            "</ul><p>Revísalo en la plataforma: <b>Monitoreo de usuarios</b>. Los datos eliminados quedan en la Bitácora de eliminaciones.</p>" });
      } catch (e) { Logger.log("Traza: no se pudo enviar el correo: " + e); }
    }
    return respuesta(true, { n: filas.length });
  } catch (e) { return respuesta(false, null, e.toString()); }
}
function trazaCorreosAdmin_() {
  const d = inicializarHojaUsuarios().getDataRange().getValues(), cols = columnasUsuarios(d[0]);
  return d.slice(1).filter(f => usuarioActivo(f, cols)).map(f => ({ usuario: String(campo(f, cols, "usuario")), cargo: String(campo(f, cols, "cargo") || ""), correo: String(campo(f, cols, "correo") || "").trim() }))
    .filter(x => /@/.test(x.correo) && puedeMonitorear_(x)).map(x => x.correo);
}

// Panel del Administrador: conectados ahora y trazabilidad (filtros: dias, tipo, usuario, texto)
function monitorUsuarios(usuario, filtros) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!puedeMonitorear_(u)) return respuesta(false, null, "Solo el Administrador del sistema puede ver el monitoreo de usuarios.");
    filtros = filtros || {};
    const ahora = Date.now(), zona = Session.getScriptTimeZone() || "America/Bogota";
    const f = ms => Utilities.formatDate(new Date(ms), zona, "yyyy-MM-dd HH:mm:ss");
    const mapa = presLeer_(PRES_CLAVE);
    const conectados = Object.keys(mapa).map(k => mapa[k]).filter(p => ahora - p.ultimo < 30 * 60000).map(p => ({
      usuario: p.usuario, nombre: p.nombre, cargo: p.cargo, pantalla: p.pantalla, navegador: p.navegador,
      estado: ahora - p.ultimo < 3 * 60000 ? "En línea" : "Inactivo", hace: Math.round((ahora - p.ultimo) / 1000),
      desde: f(p.inicio), minutos: Math.round((ahora - p.inicio) / 60000), accion: p.accion || "", fAccion: p.fAccion ? f(p.fAccion) : ""
    })).sort((a, b) => a.hace - b.hace);
    // Trazabilidad
    const hoja = SpreadsheetApp.openById(ID_HOJA).getSheetByName(TRAZA_HOJA);
    let eventos = [];
    const dias = Math.min(Math.max(Number(filtros.dias) || 1, 1), 90), desde = ahora - dias * 86400000;
    const resumen = { hoy: { Creación: 0, Modificación: 0, Eliminación: 0, Ingreso: 0 }, usuariosHoy: 0 };
    if (hoja && hoja.getLastRow() > 1) {
      const n = hoja.getLastRow() - 1, leer = Math.min(n, 5000);
      const v = hoja.getRange(n - leer + 2, 1, leer, TRAZA_COLUMNAS.length).getValues();
      const ini = new Date(); ini.setHours(0, 0, 0, 0);
      const quienHoy = {};
      v.forEach(r => { const d = r[0] instanceof Date ? r[0] : new Date(r[0]); if (d >= ini) { if (resumen.hoy[r[4]] !== undefined) resumen.hoy[r[4]]++; quienHoy[normalizar(r[1])] = true; } });
      resumen.usuariosHoy = Object.keys(quienHoy).length;
      const tx = normalizar(filtros.texto || ""), us = normalizar(filtros.usuario || "");
      eventos = v.filter(r => {
        const d = r[0] instanceof Date ? r[0] : new Date(r[0]);
        if (!(d >= desde)) return false;
        if (filtros.tipo && filtros.tipo !== "todos" && (filtros.tipo === "cambios" ? ["Creación", "Modificación", "Eliminación"].indexOf(r[4]) === -1 : r[4] !== filtros.tipo)) return false;
        if (us && normalizar(r[1]) !== us) return false;
        return !tx || normalizar(r.join(" ")).indexOf(tx) !== -1;
      }).reverse().slice(0, 400).map(r => ({ fecha: r[0] instanceof Date ? f(r[0].getTime()) : String(r[0]), usuario: r[1], nombre: r[2], cargo: r[3], tipo: r[4],
        modulo: r[5], pantalla: r[6], funcion: r[7], detalle: r[8], resultado: r[9] }));
    }
    const usuarios = inicializarHojaUsuarios().getDataRange().getValues();
    const cols = columnasUsuarios(usuarios[0]);
    const lista = usuarios.slice(1).filter(x => usuarioActivo(x, cols)).map(x => ({ usuario: String(campo(x, cols, "usuario")), nombre: String(campo(x, cols, "nombre") || campo(x, cols, "usuario")) }));
    return respuesta(true, { conectados: conectados, eventos: eventos, resumen: resumen, usuarios: lista, ahora: f(ahora) });
  } catch (e) { return respuesta(false, null, e.toString()); }
}

function monitorCerrarSesion(usuario, objetivo, motivo) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!puedeMonitorear_(u)) return respuesta(false, null, "Solo el Administrador del sistema puede cerrar sesiones.");
    const k = normalizar(objetivo);
    if (!k || k === normalizar(u.usuario)) return respuesta(false, null, "Selecciona otro usuario.");
    const exp = presLeer_(PRES_EXPULSAR); exp[k] = { por: u.nombre, motivo: String(motivo || "").slice(0, 200), fecha: Date.now() }; presGuardar_(PRES_EXPULSAR, exp);
    const hoja = hojaOP(SpreadsheetApp.openById(ID_HOJA), TRAZA_HOJA, TRAZA_COLUMNAS);
    hoja.appendRow([new Date(), u.usuario, u.nombre, u.cargo, "Modificación", "Monitoreo de usuarios", "Monitoreo de usuarios", "monitorCerrarSesion",
      "Cerró la sesión de " + objetivo + (motivo ? " · Motivo: " + motivo : ""), "Correcto"]);
    return respuesta(true, true);
  } catch (e) { return respuesta(false, null, e.toString()); }
}

// ============================================================
// TRAZABILIDAD DEL SERVICIO (Almacén › Detalle y Compras)
// Une, para una OT, todo el recorrido del servicio con sus documentos:
//   Laboratorio (trabajo interno): CS → OT → Recepción del equipo → Código interno (MT-FO-014 Control interno de equipos) → Certificado emitido
//   Tercerizado:                   CS → OT → Recepción del equipo → Solicitud de Compras (GCO-FO-006) → Orden de compra (GCO-FO-005) → Certificado del tercero
// Los documentos se buscan en vivo en la carpeta compartida de Drive (TRZ_CARPETA_RAIZ) y sus subcarpetas:
// Solicitudes de clientes, Ordenes de Trabajo, Control Interno de Equipos, Certificados Emitidos y Certificados Emitidos Tercerizados.
// ============================================================
const TRZ_CARPETA_RAIZ = "1fmwWzcVtqkh9rJO95-bQWkDex8d8Mhao";
const TRZ_CARPETAS = [   // [clave, palabras del nombre de la subcarpeta]
  ["bdCalibrados", /equipos calibrados/], ["recepciones", /recepcion/], ["certTerceros", /tercer/], ["certificados", /certificad/], ["controlInterno", /control interno/],
  ["ot", /orden(es)? de trabajo/], ["ordenesCompra", /orden(es)? de compra/], ["contratos", /contrato/], ["cs", /solicitud(es)? de cliente/], ["cotizaciones", /cotizaci/]
];
const TRZ_CACHE = "TRZ_INDICE_DRIVE";

function trzNorm_(v) { return String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase(); }
function trzClaveOT_(v) { const m = trzNorm_(v).match(/OT\s*-?\s*0*(\d{1,4})\s*-\s*(\d{2})\b/); return m ? "OT" + Number(m[1]) + "-" + m[2] : ""; }
function trzClaveSC_(v) { const m = trzNorm_(v).match(/\b(?:SC|CS)\s*-?\s*0*(\d{1,4})\b/); return m ? "SC" + Number(m[1]) : ""; }

// Índice de los archivos de la carpeta de Drive (nombre, enlace y carpeta). Se guarda 30 minutos.
function trzIndiceDrive_(renovar) {
  const cache = CacheService.getScriptCache();
  if (!renovar) {
    try {
      const n = Number(cache.get(TRZ_CACHE + "_n") || 0);
      if (n) { let t = ""; for (let i = 0; i < n; i++) { const p = cache.get(TRZ_CACHE + "_" + i); if (p === null) { t = ""; break; } t += p; } if (t) return JSON.parse(t); }
    } catch (e) {}
  }
  const lista = [];
  const recorrer = (carpeta, clave, prof) => {
    const fs = carpeta.getFiles();
    while (fs.hasNext()) { const f = fs.next(); lista.push({ n: f.getName(), u: f.getUrl(), c: clave, d: Utilities.formatDate(f.getLastUpdated(), Session.getScriptTimeZone() || "America/Bogota", "yyyy-MM-dd") }); }
    if (prof > 3) return;
    const sub = carpeta.getFolders();
    while (sub.hasNext()) recorrer(sub.next(), clave, prof + 1);
  };
  try {
    const raiz = DriveApp.getFolderById(TRZ_CARPETA_RAIZ), subs = raiz.getFolders();
    while (subs.hasNext()) {
      const s = subs.next(), nom = trzNorm_(s.getName()).toLowerCase();
      const def = TRZ_CARPETAS.find(d => d[1].test(nom));
      recorrer(s, def ? def[0] : "otros", 0);
    }
  } catch (e) { Logger.log("Trazabilidad: no se pudo leer la carpeta de Drive: " + e); }
  try {
    const t = JSON.stringify(lista), partes = Math.ceil(t.length / 90000) || 1, o = {};
    for (let i = 0; i < partes; i++) o[TRZ_CACHE + "_" + i] = t.slice(i * 90000, (i + 1) * 90000);
    o[TRZ_CACHE + "_n"] = String(partes);
    cache.putAll(o, 1800);
  } catch (e) {}
  return lista;
}
// Archivos cuyo nombre contiene la clave como palabra completa (IMC-GD0258-26, DEM1557, 01G27705…)
function trzBuscar_(indice, carpeta, clave) {
  const k = trzNorm_(clave).trim();
  if (!k || k.length < 4 || /^(N\/?R|N\/?A|NO REGISTRA|SIN SERIE)$/.test(k)) return [];
  const re = new RegExp("(^|[^A-Z0-9])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Z0-9]|$)");
  return indice.filter(f => (!carpeta || f.c === carpeta) && re.test(trzNorm_(f.n)));
}
// Certificado por su número en «Certificados Emitidos» y «Certificados Emitidos Tercerizados»
// (IMC-JJ2045 = IMC-JJ2045-26 = IMC-JJ-2045; el archivo suele llamarse «IMC-JJ2045-26 - DEM1358.pdf»)
function trzBuscarCert_(indice, cert, carpetas) {
  const k = trzClaveCert_(cert);
  if (!k || k.length < 4 || trzVacio_(cert)) return [];
  carpetas = carpetas || ["certificados", "certTerceros"];
  let l = [];
  carpetas.forEach(c => { if (!l.length) l = trzBuscar_(indice, c, cert); });
  if (l.length) return l;
  // Sin guiones ni espacios: IMCJJ0497 (con o sin el «26» del año) seguido de algo que no sea otro dígito
  const re = new RegExp(k + "(26)?(?![0-9])");
  return indice.filter(f => carpetas.indexOf(f.c) !== -1 && re.test(trzNorm_(f.n).replace(/[^A-Z0-9]/g, "")));
}
function trzPorOT_(indice, carpeta, ot) {
  const k = trzClaveOT_(ot); if (!k) return [];
  return indice.filter(f => f.c === carpeta && trzClaveOT_(f.n) === k);
}

// ---------- MT-FO-015 Base de datos de equipos calibrados (carpeta «BD Equipos Calibrados») ----------
// Cada fila amarra el N° de certificado con la OT y la CS (solicitud de servicio), con las fechas de
// recepción, calibración y emisión y el metrólogo. Se leen todos los Excel (.xlsx) y hojas de Google de
// la carpeta, en vivo, y se guardan 30 minutos. Columnas: ver TRZ_BD_COLS.
const TRZ_BD_CACHE = "TRZ_BD015";
const TRZ_BD_COLS = [   // [campo, encabezado]
  ["item", /^ITEM$/], ["equipo", /^EQUIPO$/], ["marca", /^MARCA$/], ["modelo", /^MODELO$/], ["serie", /^SERIE/], ["inventario", /^INVENTARIO/],
  ["cert", /CERTIFICADO/], ["fRec", /FECHA\s*(DE\s*)?RECEPCION/], ["fCal", /FECHA\s*(DE\s*)?CALIBRACION/], ["fEmi", /FECHA\s*(DE\s*)?EMISION/],
  ["ubicacion", /^UBICACION/], ["ot", /ORDEN DE TRABAJO/], ["sc", /SOLICITUD DE SERVICIO|SOLICITUD DEL CLIENTE/], ["codigo", /CODIGO INTERNO/],
  ["cliente", /^CLIENTE/], ["nit", /^NIT/], ["metrologo", /METROLOGO/], ["obs", /OBSERVACION/]
];
function trzClaveCert_(v) { return trzNorm_(v).replace(/\s+/g, "").replace(/-26$/, "").replace(/[^A-Z0-9]/g, ""); }   // IMC-JJ1055-26 = IMC-JJ1055 = IMC-JJ-1055
function trzVacio_(v) { return /^(|N\/?A|N\/?R|NONE|NINGUNA?|-+)$/.test(trzNorm_(v).trim()); }

// Lee la primera hoja de un .xlsx sin convertirlo (el archivo es un zip con XML)
function trzLeerXlsx_(blob) {
  const zip = Utilities.unzip(blob.setContentType("application/zip"));
  const de = n => zip.find(f => f.getName() === n);
  const ns = XmlService.getNamespace("http://schemas.openxmlformats.org/spreadsheetml/2006/main");
  const texto = el => { if (!el) return ""; const t = el.getChild("t", ns); if (t) return t.getText(); return el.getChildren("r", ns).map(r => { const x = r.getChild("t", ns); return x ? x.getText() : ""; }).join(""); };
  const comp = de("xl/sharedStrings.xml");
  const compartidos = comp ? XmlService.parse(comp.getDataAsString("UTF-8")).getRootElement().getChildren("si", ns).map(texto) : [];
  const hoja = de("xl/worksheets/sheet1.xml") || zip.find(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f.getName()));
  if (!hoja) return [];
  const col = ref => { let n = 0; String(ref).replace(/\d+$/, "").split("").forEach(ch => { n = n * 26 + ch.charCodeAt(0) - 64; }); return n - 1; };
  const filas = [];
  const datos = XmlService.parse(hoja.getDataAsString("UTF-8")).getRootElement().getChild("sheetData", ns);
  (datos ? datos.getChildren("row", ns) : []).forEach(r => {
    const fila = [];
    r.getChildren("c", ns).forEach(c => {
      const at = c.getAttribute("t"), tipo = at ? at.getValue() : "", v = c.getChild("v", ns);
      let val = v ? v.getText() : "";
      if (tipo === "s") val = compartidos[Number(val)] || "";
      else if (tipo === "inlineStr") val = texto(c.getChild("is", ns));
      else if (tipo !== "str" && val !== "" && !isNaN(val)) val = Number(val);
      fila[col(c.getAttribute("r").getValue())] = val;
    });
    filas.push(fila);
  });
  return filas;
}

function trzBDCalibrados_(renovar) {
  const cache = CacheService.getScriptCache();
  if (!renovar) {
    try {
      const n = Number(cache.get(TRZ_BD_CACHE + "_n") || 0);
      if (n) { let t = ""; for (let i = 0; i < n; i++) { const p = cache.get(TRZ_BD_CACHE + "_" + i); if (p === null) { t = ""; break; } t += p; } if (t) return JSON.parse(t); }
    } catch (e) {}
  }
  const zona = Session.getScriptTimeZone() || "America/Bogota";
  const fecha = v => {
    if (v instanceof Date) return Utilities.formatDate(v, zona, "yyyy-MM-dd");
    if (typeof v === "number" && v > 20000 && v < 80000) return Utilities.formatDate(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5), "UTC", "yyyy-MM-dd");
    return String(v == null ? "" : v).trim();
  };
  const campos = TRZ_BD_COLS.map(c => c[0]);
  const out = { archivos: [], filas: [] };
  try {
    const raiz = DriveApp.getFolderById(TRZ_CARPETA_RAIZ), subs = raiz.getFolders();
    while (subs.hasNext()) {
      const carpeta = subs.next();
      if (!/equipos calibrados/.test(trzNorm_(carpeta.getName()).toLowerCase())) continue;
      const fs = carpeta.getFiles();
      while (fs.hasNext()) {
        const f = fs.next(), tipo = f.getMimeType();
        let filas = null;
        try {
          if (tipo === MimeType.GOOGLE_SHEETS) filas = SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getValues();
          else if (/spreadsheetml|\.xlsx$/i.test(tipo + " " + f.getName())) filas = trzLeerXlsx_(f.getBlob());
        } catch (e) { Logger.log("BD equipos calibrados: no se pudo leer " + f.getName() + ": " + e); }
        if (!filas) continue;
        const ie = filas.findIndex(r => r && r.some(x => /CERTIFICADO/.test(trzNorm_(x))) && r.some(x => /ORDEN DE TRABAJO/.test(trzNorm_(x))));
        if (ie === -1) continue;
        const enc = filas[ie].map(x => trzNorm_(x).replace(/\s+/g, " ").trim());
        const pos = TRZ_BD_COLS.map(c => enc.findIndex(h => c[1].test(h)));
        let n = 0;
        filas.slice(ie + 1).forEach(r => {
          if (!r) return;
          const o = pos.map((p, j) => p === -1 ? "" : (/^f[A-Z]/.test(campos[j]) ? fecha(r[p]) : String(r[p] == null ? "" : r[p]).trim()));
          if (trzVacio_(o[campos.indexOf("cert")]) || /CERTIFICADO/.test(trzNorm_(o[campos.indexOf("cert")]))) return;
          out.filas.push(o); n++;
        });
        out.archivos.push({ n: f.getName(), u: f.getUrl(), filas: n });
      }
    }
  } catch (e) { Logger.log("BD equipos calibrados: " + e); }
  out.campos = campos;
  try {
    const t = JSON.stringify(out), partes = Math.ceil(t.length / 90000) || 1, o = {};
    for (let i = 0; i < partes; i++) o[TRZ_BD_CACHE + "_" + i] = t.slice(i * 90000, (i + 1) * 90000);
    o[TRZ_BD_CACHE + "_n"] = String(partes);
    cache.putAll(o, 1800);
  } catch (e) {}
  return out;
}
// Filas de la BD como objetos { cert, ot, sc, fCal, fEmi, metrologo, … }
function trzBDFilas_(bd) { return (bd.filas || []).map(r => { const o = {}; bd.campos.forEach((c, i) => { o[c] = r[i]; }); return o; }); }

// ---------- Contratos (carpeta «Contratos») y órdenes de compra (carpeta «Ordenes de Compra») ----------
function trzContratos_() { try { return typeof ventasLeer_ === "function" ? ventasLeer_("CONTRATOS") : []; } catch (e) { return []; } }
function trzClaveContrato_(n) { return trzNorm_(n).replace(/[^A-Z0-9]/g, ""); }
function trzUnicos_(l) { const v = {}; return (l || []).filter(d => { const k = trzNorm_(d.n); if (v[k]) return false; v[k] = 1; return true; }); }
// Palabras que distinguen al cliente en el nombre de un archivo (MONCALEANO, TULIA, GUADALUPE, DISCOLMETS…)
const TRZ_GENERICAS = /^(HOSPITAL|E\.?S\.?E\.?|ESE|IPS|SAS|S\.A\.S\.?|BIC|NUESTRA|SENORA|MUNICIPAL|DEPARTAMENTAL|UNIVERSITARIO|EMPRESA|SOCIAL|ESTADO|CLINICA|LABORATORIO|CENTRO|SALUD|DEL|LAS|LOS|PARA)$/;
function trzPalabrasCliente_(cliente) { return trzNorm_(cliente).split(/[^A-Z0-9]+/).filter(w => w.length > 3 && !TRZ_GENERICAS.test(w)); }
// Contrato o acuerdo de la solicitud de Ventas, con su documento (URL guardada en el contrato o archivo de la carpeta «Contratos»)
function trzContratoDe_(s, contratos, indice) {
  const num = String(s && s.NUM_CONTRATO || "").trim();
  if (!num) return null;
  const k = (contratos || []).find(x => trzClaveContrato_(x.NUM_CONTRATO) === trzClaveContrato_(num)) || null;
  const obs = String(k && k.OBSERVACIONES || "");
  let docs = (obs.match(/https?:\/\/[^\s)]+/g) || []).map(u => ({ n: (String(k && k.TIPO || "").trim() || "Contrato") + " " + (k ? k.NUM_CONTRATO : num), u: u }));
  if (!docs.length) {
    const pal = trzPalabrasCliente_(k ? k.CLIENTE : s.CLIENTE), kn = trzNorm_(num).match(/\d+/);
    // Primero por el número del contrato en el nombre; si el contrato no está registrado, por el nombre del cliente
    const enCarpeta = (indice || []).filter(f => f.c === "contratos");
    docs = kn ? enCarpeta.filter(f => new RegExp("(^|\\D)0*" + Number(kn[0]) + "(\\D|$)").test(trzNorm_(f.n).replace(/20\d\d/g, " "))) : [];
    if (!docs.length && !k) docs = enCarpeta.filter(f => pal.some(w => trzNorm_(f.n).indexOf(w) !== -1));
  }
  return { num: k ? String(k.NUM_CONTRATO) : num, tipo: String((k && k.TIPO) || s.TIPO_ACEPTACION || ""), objeto: String(k && k.OBJETO || ""),
    inicio: k ? k.F_INICIO : "", fin: k ? k.F_FIN : "", estado: String(k && k.ESTADO || ""), registrado: !!k, docs: trzUnicos_(docs) };
}
// N° de OC escritos en un texto (OC-00016-26, OC 16-26…) y sus PDF en «Ordenes de Compra»
function trzClaveOC_(v) { const m = trzNorm_(v).match(/OC\s*-?\s*0*(\d{1,6})\s*-\s*(\d{2})\b/); return m ? "OC" + Number(m[1]) + "-" + m[2] : ""; }
function trzOCs_(texto) { return (trzNorm_(texto).match(/OC\s*-?\s*0*\d{1,6}\s*-\s*\d{2}\b/g) || []).filter((x, i, a) => a.findIndex(y => trzClaveOC_(y) === trzClaveOC_(x)) === i); }
function trzDocsOC_(indice, oc) { const k = trzClaveOC_(oc); return k ? trzUnicos_(indice.filter(f => f.c === "ordenesCompra" && trzClaveOC_(f.n) === k)) : []; }

// Lista de OT para buscar (selector de la ventana de trazabilidad)
function trazabilidadOTs(usuario) { seguridadRPC_();
  try {
    if (!usuarioSD(usuario)) return respuesta(false, null, "Usuario no válido");
    const lista = typeof ventasLeer_ !== "function" ? [] : ventasLeer_("SOLICITUDES").filter(s => String(s.NUM_OT || "").trim()).map(s => ({
      ot: String(s.NUM_OT).trim(), cliente: String(s.CLIENTE || ""), id: String(s.ID || ""), estado: String(s.ESTADO || ""),
      tercerizado: String(s.TERCERIZADO || "").toUpperCase() === "SI" })).reverse();
    // OT que solo están en la base de datos de equipos calibrados (MT-FO-015)
    try {
      const ya = {}; lista.forEach(x => { ya[trzClaveOT_(x.ot)] = true; });
      trzBDFilas_(trzBDCalibrados_(false)).forEach(r => {
        const k = trzClaveOT_(r.ot);
        if (k && !ya[k]) { ya[k] = true; lista.push({ ot: r.ot, cliente: r.cliente, id: "", estado: "", tercerizado: false }); }
      });
    } catch (e) {}
    return respuesta(true, lista);
  } catch (e) { return respuesta(false, null, e.toString()); }
}

function trazabilidadServicio(usuario, ot, renovar) { seguridadRPC_();
  try {
    if (!usuarioSD(usuario)) return respuesta(false, null, "Usuario no válido");
    const zona = Session.getScriptTimeZone() || "America/Bogota";
    const f = v => { if (!v) return ""; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? String(v) : Utilities.formatDate(d, zona, "yyyy-MM-dd"); };
    const tx = v => String(v == null ? "" : v).trim();
    const url = v => /^https?:\/\//i.test(tx(v)) ? tx(v) : "";
    const indice = trzIndiceDrive_(!!renovar);
    // ---- MT-FO-015 Base de datos de equipos calibrados: N° de certificado ↔ OT ↔ CS ----
    const bd = trzBDCalibrados_(!!renovar), bdFilas = trzBDFilas_(bd);
    const porCert = {}; bdFilas.forEach(r => { const c = trzClaveCert_(r.cert); if (c && !porCert[c]) porCert[c] = r; });
    const solicitudes = typeof ventasLeer_ === "function" ? ventasLeer_("SOLICITUDES") : [];
    const almSS = typeof almLeer === "function" && typeof ALM_ID_HOJA !== "undefined" ? SpreadsheetApp.openById(ALM_ID_HOJA) : null;
    const almEq = almSS ? almLeer(almSS, "eq") : [];
    // Se puede buscar por OT, por CS o por N° de certificado
    let k = trzClaveOT_(ot), buscado = "", sDirecto = null;
    if (!k) {
      const kc = trzClaveCert_(ot), ks = trzClaveSC_(ot);
      // Certificado de un tercero (VENTAS_TERCERIZADOS) o CS sin OT (servicios bajo contrato)
      let tc = null; try { tc = kc && solicitudes.length ? ventasLeer_("TERCERIZADOS").find(t => trzClaveCert_(t.NUM_CERTIFICADO) === kc) : null; } catch (e) {}
      const sTer = tc ? solicitudes.find(x => String(x.ID).trim() === String(tc.ID_SOLICITUD).trim()) : null;
      if (sTer) { buscado = "Certificado del tercero " + tc.NUM_CERTIFICADO; if (trzClaveOT_(sTer.NUM_OT)) k = trzClaveOT_(sTer.NUM_OT); else sDirecto = sTer; }
      const sSC = !k && !sDirecto && ks ? solicitudes.find(x => trzClaveSC_(x.CONSECUTIVO_FO004) === ks && !trzClaveOT_(x.NUM_OT) && !/desist/i.test(String(x.ESTADO))) : null;
      const r = kc ? bdFilas.find(x => trzClaveCert_(x.cert) === kc && trzClaveOT_(x.ot)) : null;
      const e = !r && kc ? almEq.find(x => trzClaveCert_(x.certificado || x.certificadoTercero) === kc && trzClaveOT_(x.ot)) : null;
      if (k || sDirecto) {}
      else if (r) { k = trzClaveOT_(r.ot); buscado = "Certificado " + r.cert; }
      else if (e) { k = trzClaveOT_(e.ot); buscado = "Certificado " + (e.certificado || e.certificadoTercero); }
      else if (ks) {
        const v = solicitudes.find(x => trzClaveSC_(x.CONSECUTIVO_FO004) === ks && trzClaveOT_(x.NUM_OT));
        const b = v ? null : bdFilas.find(x => trzClaveSC_(x.sc) === ks && trzClaveOT_(x.ot));
        if (v || b) { k = trzClaveOT_(v ? v.NUM_OT : b.ot); buscado = "CS " + (v ? v.CONSECUTIVO_FO004 : b.sc); }
        else if (sSC) { sDirecto = sSC; buscado = "CS " + sSC.CONSECUTIVO_FO004 + " (sin OT)"; }
      }
      if (!k && kc && porCert[kc]) return respuesta(false, null, "El certificado " + porCert[kc].cert + " está en la base de datos de equipos calibrados (MT-FO-015), pero sin OT asociada.");
    }
    if (!k && !sDirecto) return respuesta(false, null, "Indica una OT (ej. OT-053-26), una CS (ej. SC-0053) o un N° de certificado (ej. IMC-JJ2057).");
    const bdOT = k ? bdFilas.filter(r => trzClaveOT_(r.ot) === k) : [];
    // ---- Ventas: CS y OT ----
    let s = null, terc = [];
    if (solicitudes.length) {
      s = sDirecto || solicitudes.find(x => trzClaveOT_(x.NUM_OT) === k) || null;
      if (s) try { terc = ventasLeer_("TERCERIZADOS").filter(t => tx(t.ID_SOLICITUD) === tx(s.ID)); } catch (e) {}
    }
    const tercerizado = s ? tx(s.TERCERIZADO).toUpperCase() === "SI" : false;
    const enSitioTercero = tercerizado && tx(s.MODALIDAD_TERCERO) === "Sitio";
    const contrato = s ? trzContratoDe_(s, trzContratos_(), indice) : null;
    // ---- Almacén ----
    let rec = [], eqs = [], actas = [];
    if (almSS && k) {
      rec = almLeer(almSS, "rec").filter(r => trzClaveOT_(r.ot) === k);
      eqs = almEq.filter(e => trzClaveOT_(e.ot) === k);
      const ids = {}; eqs.forEach(e => { if (e.acta) ids[e.acta] = true; });
      actas = almLeer(almSS, "acta").filter(a => ids[a.id]);
    }
    if (!s && !rec.length && !eqs.length && !bdOT.length) return respuesta(false, null, "No se encontró la " + ot + " en Ventas, en el Almacén ni en la base de datos de equipos calibrados.");
    // ---- Documentos en Drive ----
    const docsOT = trzPorOT_(indice, "ot", k);
    const scBD = (bdOT.find(r => trzClaveSC_(r.sc)) || {}).sc || "";
    const scNum = (s ? tx(s.CONSECUTIVO_FO004) : "") || scBD;
    let docsCS = [];
    if (s && scNum && url(s.URL_SOLICITUD_CLIENTE)) docsCS.push({ n: "Solicitud del cliente " + (scNum || ""), u: url(s.URL_SOLICITUD_CLIENTE) });
    if (!docsCS.length && scNum) {
      const kc = trzClaveSC_(scNum), cli = trzNorm_(s ? s.CLIENTE : (bdOT[0] || {}).cliente).split(/\s+/).filter(w => w.length > 3);
      docsCS = indice.filter(x => x.c === "cs" && trzClaveSC_(x.n) === kc && (trzClaveOT_(x.n) === k || cli.some(w => trzNorm_(x.n).indexOf(w) !== -1)));
    }
    const docsCI = trzPorOT_(indice, "controlInterno", k);
    // ---- Equipos con su código interno y certificado ----
    // Si el Almacén solo tiene un equipo genérico (o nada) para la OT, la lista sale de la base de datos de equipos calibrados.
    const sinLista = !eqs.length || eqs.every(e => /^Equipos de la/i.test(tx(e.equipo)));
    if (sinLista && tercerizado && terc.some(t => tx(t.NUM_CERTIFICADO))) eqs = eqs.filter(e => !/^Equipos de la/i.test(tx(e.equipo)));
    const colorSigla = c => ({ "CC-": "Verde oscuro", "TC-": "Verde claro", "P-": "Azul", "M-": "Amarillo" })[(tx(c).toUpperCase().match(/^[A-Z]+-/) || [""])[0]] || (tx(c) && !trzVacio_(c) ? "Rojo" : "");
    const base = sinLista && bdOT.length ? bdOT.map(r => ({ item: r.item, equipo: r.equipo, marca: r.marca, modelo: r.modelo, serie: r.serie, inventario: r.inventario,
      codigoInterno: trzVacio_(r.codigo) ? "" : r.codigo, color: trzVacio_(r.codigo) ? "" : colorSigla(r.codigo), magnitud: "", situacion: r.ubicacion ? "Calibrado · " + r.ubicacion : "Calibrado",
      recepcion: "", certificado: r.cert, acta: "", fechaSalida: "", _bd: r })) : eqs;
    const usados = {};
    const equipos = base.map(e => {
      const carpeta = tercerizado ? "certTerceros" : "certificados";
      const mismo = (a, b) => !trzVacio_(a) && trzNorm_(a).trim() === trzNorm_(b).trim();
      const b = e._bd || porCert[trzClaveCert_(e.certificadoTercero || e.certificado)] ||
        bdOT.find(r => !usados[r.cert] && (mismo(r.inventario, e.inventario) || mismo(r.serie, e.serie))) || null;
      if (b) usados[b.cert] = true;
      const cert = tx(e.certificadoTercero) || tx(e.certificado) || (b ? b.cert : "");
      // Con N° de certificado se busca ese certificado (en las dos carpetas de certificados); solo sin N° se busca por inventario o serie
      const orden = tercerizado ? ["certTerceros", "certificados"] : ["certificados", "certTerceros"];
      let docs = cert ? trzBuscarCert_(indice, cert, orden) : [];
      if (!cert) { const claves = [e.inventario, e.serie, e.identificacion].map(tx).filter(Boolean);
        for (let i = 0; i < claves.length && !docs.length; i++) docs = trzBuscar_(indice, carpeta, claves[i]); }
      const t = terc.find(x => tx(x.ID_EQUIPO) && (tx(x.EQUIPO) === tx(e.equipo))) || null;
      return { item: e.item, equipo: e.equipo, marca: e.marca, modelo: e.modelo, serie: e.serie, inventario: e.inventario,
        codigoInterno: e.codigoInterno, color: e.color, magnitud: e.magnitud, situacion: e.situacion, recepcion: e.recepcion,
        certificado: cert || (t ? tx(t.NUM_CERTIFICADO) : ""),
        certRevisado: t ? tx(t.CERT_REVISADO) : "", acta: e.acta, fechaSalida: e.fechaSalida,
        fCal: b ? b.fCal : "", fEmi: b ? b.fEmi : "", metrologo: b ? b.metrologo : "", enBD: !!b,
        docs: docs.slice(0, 3).map(d => ({ n: d.n, u: d.u })) };
    });
    // Equipos calibrados por el tercero (VENTAS_TERCERIZADOS), con el certificado del proveedor
    terc.filter(t => tx(t.NUM_CERTIFICADO) || !tx(t.ID_EQUIPO)).forEach((t, i) => {
      if (/^Equipos de la/i.test(tx(t.EQUIPO)) && !tx(t.NUM_CERTIFICADO)) return;
      const docs = tx(t.NUM_CERTIFICADO) ? trzUnicos_(trzBuscarCert_(indice, t.NUM_CERTIFICADO, ["certTerceros", "certificados"])) : [];
      equipos.push({ item: "T" + (i + 1), equipo: tx(t.EQUIPO), marca: "", modelo: "", serie: "", inventario: "", codigoInterno: "", color: "", magnitud: "",
        situacion: (tx(t.ESTADO) || "Tercerizado") + (tx(t.PROVEEDOR) ? " · " + tx(t.PROVEEDOR) : ""), recepcion: "", certificado: tx(t.NUM_CERTIFICADO),
        certRevisado: tx(t.CERT_REVISADO), acta: "", fechaSalida: "", fCal: "", fEmi: "", metrologo: "", enBD: false, tercero: tx(t.PROVEEDOR) || "Tercero",
        docs: docs.slice(0, 2).map(d => ({ n: d.n, u: d.u })) });
    });
    const equiposLab = equipos.filter(e => !e.tercero), equiposTer = equipos.filter(e => e.tercero);
    const mixto = tercerizado && equiposLab.length > 0 && bdOT.length > 0;
    const docsBD = (bd.archivos || []).map(a => ({ n: a.n, u: a.u }));
    // ---- Compras (servicio tercerizado) ----
    let cmp = null;
    if (tercerizado && s && typeof cmpEstadoTercerizado_ === "function") { try { cmp = cmpEstadoTercerizado_(s.ID); } catch (e) { Logger.log("Trazabilidad: Compras: " + e); } }
    const etapas = [];
    const et = (clave, titulo, ok, datos, docs, nota) => etapas.push({ clave: clave, titulo: titulo, ok: !!ok, datos: datos || [], docs: (docs || []).map(d => ({ n: d.n, u: d.u })), nota: nota || "" });
    const clienteBD = (bdOT[0] || {}).cliente || "";
    if (contrato) et("contrato", "Contrato / acuerdo con el cliente", true,
      [["N°", contrato.num], ["Tipo", contrato.tipo], ["Objeto", contrato.objeto], ["Vigencia", [f(contrato.inicio), f(contrato.fin)].filter(Boolean).join(" a ")], ["Estado", contrato.estado]],
      contrato.docs, contrato.docs.length ? "" : "El documento del contrato no está en la carpeta «Contratos» de Drive.");
    et("cs", "Solicitud del cliente (CS · GCV-FO-004)", !!(scNum || docsCS.length), [["N° CS", scNum || "—"], ["Cliente", s ? s.CLIENTE : (rec[0] || {}).cliente || clienteBD], ["Fecha", s ? f(s.FECHA_RECEPCION) : ""]], docsCS,
      scNum ? "" : "La OT no tiene una solicitud del cliente asociada en Ventas.");
    et("ot", "Orden de trabajo (OT · GCV-FO-002)", !!((s && tx(s.NUM_OT)) || docsOT.length || bdOT.length), [["N° OT", s ? s.NUM_OT : (bdOT[0] || {}).ot || ot], ["Solicitud Ventas", s ? s.ID : "—"], ["Aceptación", s ? tx(s.TIPO_ACEPTACION) + (tx(s.NUM_CONTRATO) ? " · " + s.NUM_CONTRATO : "") : ""],
      ["Fecha", s ? f(s.F_ACEPTADA) : ""], ["Ruta", tercerizado ? "Tercerizado" + (s.MODALIDAD_TERCERO ? " (" + s.MODALIDAD_TERCERO + ")" : "") : "Laboratorio IMCOLMETRIC"]], docsOT,
      s && !tx(s.NUM_OT) && !docsOT.length ? "Servicio sin OT registrada en Ventas" + (tx(s.NUM_CONTRATO) ? " (orden de servicio bajo el contrato " + s.NUM_CONTRATO + ")." : ".") : "");
    // Formato de recepción (CS-FO-001) de la carpeta «Recepción de Equipos»: lleva la OT en el nombre
    const docsRec = trzPorOT_(indice, "recepciones", k);
    if (!enSitioTercero) et("rec", "Recepción del equipo (almacén)", rec.length > 0 || eqs.length > 0 || docsRec.length > 0,
      rec.map(r => [r.id, f(r.fecha) + " " + tx(r.hora) + " · " + tx(r.modalidad) + " · " + (tx(r.entregaTipo) || "—") + (tx(r.entregaNombre) ? " (" + r.entregaNombre + ")" : "")]).concat([["Equipos", String(eqs.length)]]),
      rec.filter(r => url(r.constanciaArchivo)).map(r => ({ n: (r.constanciaTipo || "Constancia") + " " + r.id, u: url(r.constanciaArchivo) })).concat(docsRec),
      rec.length || docsRec.length ? "" : "Aún no se ha registrado la recepción en el almacén.");
    if (tercerizado) {
      const sol = cmp && cmp.solicitud, oc = cmp && cmp.oc;
      const ocs0 = trzOCs_([oc ? oc.id : "", tx(s.NUM_OC_TERCERO)].join(" "));
      et("solCompra", "Solicitud de Compras (GCO-FO-006)", !!(sol || tx(s.NUM_SOL_COMPRA) || ocs0.length),
        [["N° solicitud", sol ? sol.id : (tx(s.NUM_SOL_COMPRA) || "—")], ["Estado", sol ? sol.estado : ""]], sol && url(sol.url) ? [{ n: "Solicitud " + sol.id, u: sol.url }] : [],
        sol || tx(s.NUM_SOL_COMPRA) ? "" : ocs0.length ? "La orden de compra se emitió sin una solicitud de Compras registrada en la app." : "Ventas aún no ha solicitado el servicio a Compras.");
      const ocs = trzOCs_([oc ? oc.id : "", tx(s.NUM_OC_TERCERO)].join(" "));
      const docsOC = trzUnicos_([].concat(oc && url(oc.url) ? [{ n: "Orden de compra " + oc.id, u: oc.url }] : [], ...ocs.map(x => trzDocsOC_(indice, x))));
      const ocSinPDF = ocs.filter(x => !trzDocsOC_(indice, x).length);
      et("oc", "Orden de compra al tercero (GCO-FO-005)", !!(oc || ocs.length || tx(s.NUM_OC_TERCERO)),
        [["N° OC", ocs.length ? ocs.join(", ") : (oc ? oc.id : (tx(s.NUM_OC_TERCERO) || "—"))], ["Proveedor", oc ? oc.proveedor : tx(s.PROVEEDOR_TERCERO)], ["Recibido", oc ? (oc.recibida ? "Sí · " + (oc.fechaRecepcion || "") : "Pendiente") : ""]],
        docsOC, oc || ocs.length || tx(s.NUM_OC_TERCERO) ? (ocSinPDF.length ? "Sin PDF en «Ordenes de Compra»: " + ocSinPDF.join(", ") + "." : "") :
          /postventa|cerrad|factur|entregad/i.test(tx(s.ESTADO)) ? "No hay orden de compra registrada para este servicio (ni en Compras ni en la carpeta «Ordenes de Compra»)." : "Compras aún no ha emitido la orden de compra.");
      const certT = terc.filter(t => tx(t.NUM_CERTIFICADO)), conPDF = equiposTer.filter(e => e.docs.length);
      const docsT = trzUnicos_([].concat(...equiposTer.map(e => e.docs)));
      et("certTercero", "Certificado emitido por el tercero", certT.length > 0 && certT.length === terc.filter(t => !/^Equipos de la/i.test(tx(t.EQUIPO)) || tx(t.NUM_CERTIFICADO)).length,
        [["Certificados", certT.length ? certT.map(t => tx(t.NUM_CERTIFICADO)).join(", ") : "—"], ["Proveedor", certT.map(t => tx(t.PROVEEDOR)).filter((x, i, a) => x && a.indexOf(x) === i).join("; ")],
          ["Certificados en Drive", conPDF.length + " de " + equiposTer.length], ["Verificados por el laboratorio", certT.filter(t => /^S[IÍ]$/i.test(tx(t.CERT_REVISADO))).length + " de " + certT.length]],
        docsT, !certT.length ? "Aún no se ha registrado el certificado del tercero." :
          conPDF.length < equiposTer.length ? "Sin PDF en «Certificados Emitidos Tercerizados»: " + equiposTer.filter(e => !e.docs.length).map(e => e.certificado).join(", ") + "." : "");
      if (mixto) etapasLab();
    } else etapasLab();
    // Código interno (MT-FO-014) y certificado emitido por el laboratorio
    function etapasLab() {
      const equipos = equiposLab;
      const conCod = equipos.filter(e => tx(e.codigoInterno));
      et("codigo", "Asignación del código interno (MT-FO-014 Control interno de equipos)", equipos.length > 0 && conCod.length === equipos.length,
        [["Códigos asignados", conCod.length + " de " + equipos.length]], docsCI, docsCI.length ? "" : "No se encontró el formato MT-FO-014 de esta OT en «Control Interno de Equipos».");
      const conCert = equipos.filter(e => e.docs.length || e.fEmi), enBD = equipos.filter(e => e.enBD), conPDF = equipos.filter(e => e.docs.length);
      const emis = enBD.map(e => e.fEmi).filter(Boolean).sort(), metro = enBD.map(e => e.metrologo).filter((m, i, a) => m && a.indexOf(m) === i);
      et("cert", "Certificado de calibración emitido", equipos.length > 0 && conCert.length === equipos.length,
        [["Certificados emitidos", conCert.length + " de " + equipos.length], ["En la BD de equipos calibrados (MT-FO-015)", enBD.length + " de " + equipos.length],
          ["Fecha de emisión", emis.length ? (emis[0] === emis[emis.length - 1] ? emis[0] : emis[0] + " a " + emis[emis.length - 1]) : ""], ["Metrólogo", metro.join(", ")],
          ["Certificados en Drive", conPDF.length + " de " + equipos.length]],
        (function () { const vistos = {}, l = []; equipos.forEach(e => e.docs.forEach(d => { if (!vistos[d.u]) { vistos[d.u] = 1; l.push(d); } })); return l; })(),
        conPDF.length === equipos.length ? "" : (equipos.length - conPDF.length) + " certificado(s) aún no están en «Certificados Emitidos» ni en «Certificados Emitidos Tercerizados»: se buscan por el N° de certificado de la base de datos de equipos calibrados (MT-FO-015)" +
          (equipos.filter(e => !e.docs.length && e.certificado).length ? ", p. ej. " + equipos.filter(e => !e.docs.length && e.certificado).slice(0, 3).map(e => e.certificado).join(", ") : "") + ".");
    }
    const sig = etapas.find(x => !x.ok);
    return respuesta(true, { ot: s ? (tx(s.NUM_OT) || scNum || s.ID) : (bdOT[0] || eqs[0] || rec[0] || {}).ot || ot, buscado: buscado, cs: scNum, idVentas: s ? s.ID : "", cliente: s ? s.CLIENTE : (rec[0] || {}).cliente || clienteBD, estadoVentas: s ? s.ESTADO : "",
      bd: { filas: bdFilas.length, archivos: docsBD },
      ruta: mixto ? "mixto" : tercerizado ? "tercerizado" : "laboratorio", contrato: contrato ? contrato.num : "", etapas: etapas, equipos: equipos, actas: actas.map(a => ({ id: a.id, fecha: f(a.fecha), estado: a.estado, medio: a.medio })),
      completa: !sig, siguiente: sig ? sig.titulo : "Trazabilidad completa", archivosDrive: indice.length });
  } catch (e) { return respuesta(false, null, e.toString()); }
}

// ---------- Servicios prestados (Ventas, Compras y Almacén › botón «Servicios prestados») ----------
// Todas las OT/SC de servicios a clientes, del laboratorio y tercerizadas, con su contrato, OC al tercero y certificados.
// Solo servicios prestados: las compras propias del laboratorio (calibración de equipos patrón, insumos…) no aparecen,
// porque la lista sale de las solicitudes de Ventas y de la base de datos de equipos calibrados (MT-FO-015).
function serviciosPrestados(usuario, renovar) { seguridadRPC_();
  try {
    if (!usuarioSD(usuario)) return respuesta(false, null, "Usuario no válido");
    const zona = Session.getScriptTimeZone() || "America/Bogota";
    const f = v => { if (!v) return ""; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? "" : Utilities.formatDate(d, zona, "yyyy-MM-dd"); };
    const tx = v => String(v == null ? "" : v).trim();
    const sols = typeof ventasLeer_ === "function" ? ventasLeer_("SOLICITUDES") : [];
    let terc = []; try { terc = typeof ventasLeer_ === "function" ? ventasLeer_("TERCERIZADOS") : []; } catch (e) {}
    const contratos = trzContratos_();
    const kCont = {}; contratos.forEach(k => { kCont[trzClaveContrato_(k.NUM_CONTRATO)] = k; });
    // Certificados del laboratorio por OT (MT-FO-015)
    const porOT = {};
    try {
      trzBDFilas_(trzBDCalibrados_(!!renovar)).forEach(r => {
        const k = trzClaveOT_(r.ot); if (!k) return;
        const o = porOT[k] || (porOT[k] = { n: 0, ot: r.ot, sc: "", cliente: r.cliente, fEmi: "", fRec: "" });
        o.n++; if (!o.sc && trzClaveSC_(r.sc)) o.sc = r.sc;
        const fe = f(r.fEmi), fr = f(r.fRec);
        if (fe > o.fEmi) o.fEmi = fe; if (fr && (!o.fRec || fr < o.fRec)) o.fRec = fr;
      });
    } catch (e) {}
    const tercPor = {}; terc.forEach(t => { const id = tx(t.ID_SOLICITUD); if (id) (tercPor[id] = tercPor[id] || []).push(t); });
    const filas = [], vistos = {};
    sols.forEach(s => {
      const ot = tx(s.NUM_OT), sc = tx(s.CONSECUTIVO_FO004);
      if (!ot && !sc) return;
      if (/desist|anulad/i.test(tx(s.ESTADO))) return;
      const k = trzClaveOT_(ot), lab = k ? porOT[k] : null;
      if (k) vistos[k] = true;
      const t = (tercPor[tx(s.ID)] || []).filter(x => !/^Equipos de la/i.test(tx(x.EQUIPO)) || tx(x.NUM_CERTIFICADO));
      const esTerc = tx(s.TERCERIZADO).toUpperCase() === "SI";
      const kc = kCont[trzClaveContrato_(s.NUM_CONTRATO)];
      filas.push({ ot: ot, sc: sc, id: tx(s.ID), cliente: tx(s.CLIENTE), fecha: f(s.F_ACEPTADA) || f(s.FECHA_RECEPCION),
        contrato: tx(s.NUM_CONTRATO) ? (tx(kc ? kc.TIPO : s.TIPO_ACEPTACION) || "Contrato") + " N° " + tx(s.NUM_CONTRATO) : "",
        ruta: esTerc ? (lab && lab.n ? "Mixto" : "Tercerizado") : "Laboratorio",
        proveedor: esTerc ? (tx(s.PROVEEDOR_TERCERO) || t.map(x => tx(x.PROVEEDOR)).filter((x, i, a) => x && a.indexOf(x) === i).join("; ")) : "",
        oc: esTerc ? trzOCs_(s.NUM_OC_TERCERO).join(", ") || tx(s.NUM_OC_TERCERO) : "",
        certLab: lab ? lab.n : 0, fEmision: lab ? lab.fEmi : "",
        certTercero: t.filter(x => tx(x.NUM_CERTIFICADO)).length, equiposTercero: t.length,
        estado: tx(s.ESTADO) });
    });
    // OT que solo están en la base de datos de equipos calibrados (servicios del laboratorio registrados antes de la app)
    Object.keys(porOT).forEach(k => {
      if (vistos[k]) return;
      const o = porOT[k];
      filas.push({ ot: o.ot, sc: o.sc, id: "", cliente: o.cliente, fecha: o.fRec || o.fEmi, contrato: "", ruta: "Laboratorio", proveedor: "", oc: "",
        certLab: o.n, fEmision: o.fEmi, certTercero: 0, equiposTercero: 0, estado: "Solo en MT-FO-015" });
    });
    filas.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.ot.localeCompare(a.ot));
    return respuesta(true, { filas: filas, generado: Utilities.formatDate(new Date(), zona, "yyyy-MM-dd HH:mm") });
  } catch (e) { return respuesta(false, null, e.toString()); }
}
