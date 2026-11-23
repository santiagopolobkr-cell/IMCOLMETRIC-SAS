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

  const rows = data.slice(1).map(r => ({
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
    sol.aprobadoPor = actor.nombre + " (" + actor.cargo + ")";
    sol.fechaAprobacion = new Date();
    sol.estado = e.CERRADO;
    sol.publicado = "NO";
    actualizarEtapaSD(sol, ruta);
    guardarFilaSolicitudSD(ss, sol);
    registrarEventoSD(ss, sol.radicado, "Aprobación", anular ? "Anulación aprobada" : "Documento aprobado",
                      "APROBADO", actor, obs, datos.archivo, sol.estado);
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
                  "Actualizado Por", "Fecha Actualización"]
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
  }
  return hoja;
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
        registradoPor: r[8],
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
        texto(datos.usuario), ahora, "", ""
      ]);
    } else {
      const fila = filaExistente + 2;
      hojaP.getRange(fila, 2).setValue(aFechaNC(datos.fechaIdentificacion));
      hojaP.getRange(fila, 4, 1, 5).setValues([[
        texto(datos.descripcion), texto(datos.requisito), texto(datos.evidenciaObjetiva),
        resumen.estado, resumen.cumplimiento
      ]]);
      hojaP.getRange(fila, 11, 1, 2).setValues([[texto(datos.usuario), ahora]]);
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
  ["comentarioEficacia", "COMENTARIO EVALUACIÓN DE EFICACIA"]
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
    actividades: actividadesCAM(o)
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
      actividades: acts.length ? JSON.stringify(acts) : ""
    };
    const ahora = new Date();
    if (fila === -1) {
      Object.assign(valores, { registradoPor: nombreActor, fechaRegistro: ahora, actualizadoPor: "", fechaActualizacion: "" });
      hoja.appendRow(CAM_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]]));
      fila = hoja.getLastRow();
    } else {
      // Conserva quién y cuándo lo registró
      const actual = hoja.getRange(fila, 1, 1, CAM_COLUMNAS.length).getValues()[0];
      Object.assign(valores, {
        registradoPor: actual[CAM_COL.registradoPor - 1], fechaRegistro: actual[CAM_COL.fechaRegistro - 1],
        actualizadoPor: nombreActor, fechaActualizacion: ahora,
        // Seguimiento y observaciones: lo ya escrito queda fijo, solo se agrega
        seguimiento: agregarSeguimiento_(actual[CAM_COL.seguimiento - 1], datos.seguimientoNuevo, nombreActor),
        observaciones: agregarSeguimiento_(actual[CAM_COL.observaciones - 1], datos.observacionesNuevo, nombreActor)
      });
      hoja.getRange(fila, 1, 1, CAM_COLUMNAS.length).setValues([CAM_COLUMNAS.map(c => valores[c[0]])]);
    }
    hoja.getRange(fila, CAM_COL.cumplimiento).setNumberFormat("0%");
    return respuesta(true, { numero: numero, estado: valores.estado });
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
  ["controlesDetalle", "Controles (detalle)"], ["accionesDetalle", "Acciones propuestas (detalle)"]
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
    actualizadoPor: texto(o.actualizadoPor), fechaActualizacion: formatearFecha(o.fechaActualizacion, "dd/MM/yyyy HH:mm")
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
      hoja.appendRow(MR_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]]));
      fila = hoja.getLastRow();
    } else {
      const actual = hoja.getRange(fila, 1, 1, MR_COLUMNAS.length).getValues()[0];
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
  costo: ["> $20,000,000", "> $5,000,000", "< $1,000,000", "< $500,000", "$0 ó N/A"],
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
  ["impacto", "Impacto de la oportunidad"], ["beneficios", "Beneficios de la oportunidad"]
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

function calcularOP(o) { seguridadRPC_();
  const probCalif = Math.max(calificacionOP("probabilidad", o.probabilidad), calificacionOP("ocurrencias", o.ocurrencias));
  const benCalif = Math.max(calificacionOP("potencial", o.benCliente), calificacionOP("potencial", o.benImagen),
                            calificacionOP("potencial", o.benRegulaciones), calificacionOP("potencial", o.benProcesos));
  const factor = probCalif && benCalif ? probCalif * benCalif : 0;
  return { probCalif: probCalif, benCalif: benCalif, factor: factor,
           viabilidad: factor ? (factor >= OP_UMBRAL ? "Abordar Oportunidad" : "Descartar y/o reevaluar Oportunidad") : "" };
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
        costo: valorListaOP("costo", o.costo), planSeguimiento: String(o.planSeguimiento || "").trim(),
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
    [["proceso", "proceso"], ["oportunidad", "oportunidad"], ["probabilidad", "probabilidad"], ["ocurrencias", "ocurrencias previas"],
     ["benCliente", "satisfacción del cliente"], ["benImagen", "imagen"], ["benRegulaciones", "regulaciones"],
     ["benProcesos", "procesos internos"], ["costo", "costo de implementación"]].forEach(([k, n]) => { if (!texto(datos[k])) faltan.push(n); });
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
    if (fila === -1) {
      Object.assign(valores, { fechaRegistro: ahora, registradoPor: nombreActor, actualizadoPor: "" });
      hoja.appendRow(OP_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]]));
    } else {
      const actual = hoja.getRange(fila, 1, 1, OP_COLUMNAS.length).getValues()[0];
      valores.fechaRegistro = actual[OP_COL.fechaRegistro - 1] || ahora;
      valores.registradoPor = actual[OP_COL.registradoPor - 1];
      // Plan de seguimiento: lo ya escrito queda fijo, solo se agrega
      valores.planSeguimiento = agregarSeguimiento_(actual[OP_COL.planSeguimiento - 1], datos.planSeguimientoNuevo, nombreActor);
      hoja.getRange(fila, 1, 1, OP_COLUMNAS.length).setValues([OP_COLUMNAS.map(c => valores[c[0]] === undefined ? "" : valores[c[0]])]);
    }

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
  { id: "nc", t: "No conformidades" }, { id: "cam", t: "Gestión del cambio" }, { id: "mr", t: "Matriz de riesgos" },
  { id: "op", t: "Oportunidades" }, { id: "ind", t: "Indicadores" }, { id: "aud", t: "Auditoría" },
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
    return respuesta(true, { admin: esAdministradorPerm(u), gestorFallos: puedeGestionarFallos_(u), permisos: permisosDeUsuario(u, filasPermisos(SpreadsheetApp.openById(ID_HOJA))) });
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
