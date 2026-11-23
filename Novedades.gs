// ============================================================
// NOVEDADES DE LA PLATAFORMA (cambios en los módulos)
// Cada novedad es un instructivo de uno o más pasos: imagen, explicación, por qué y para qué del cambio.
// Al ingresar, cada persona ve en una ventana emergente las novedades publicadas que aún no ha visto,
// y queda el registro de quién las vio, cuándo y si recorrió todos los pasos.
// Hojas (se crean solas): NOV_Novedades y NOV_Vistas.
// Las publican el Administrador y quien tenga permiso de editar en "Novedades" (matriz de permisos;
// por defecto Gerencia y Coordinación de Calidad).
// ============================================================
const NOV_HOJA = "NOV_Novedades";
const NOV_HOJA_VISTAS = "NOV_Vistas";
const NOV_CARPETA = "IMCOLMETRIC - Novedades (Imágenes)";
const NOV_TIPOS = ["Nuevo", "Mejora", "Cambio", "Eliminado", "Corrección"];
const NOV_COLUMNAS = [["id", "ID"], ["fecha", "Fecha"], ["modulo", "Módulo"], ["titulo", "Título"], ["tipo", "Tipo de cambio"],
  ["resumen", "Resumen"], ["pasos", "Pasos del instructivo (detalle)"], ["dirigidoA", "Dirigido a (detalle)"], ["estado", "Estado"],
  ["creadoPor", "Creado por"], ["fechaCreacion", "Fecha creación"], ["actualizadoPor", "Actualizado por"], ["fechaActualizacion", "Fecha actualización"],
  ["clave", "Clave (cambio de la plataforma)"]];
const NOV_VISTAS_COLUMNAS = ["Novedad", "Usuario", "Nombre", "Cargo", "Primera vista", "Última vista", "Pasos vistos", "Total pasos", "Completó"];

// ============================================================
// CAMBIOS DE LA PLATAFORMA
// Cada vez que se actualiza un módulo (se agrega, cambia o elimina algo) se agrega aquí su novedad con una «clave» única.
// Al publicar la nueva versión, la novedad se crea sola en la hoja como Publicada y le sale a todos en la ventana emergente.
// Una novedad ya creada no se vuelve a crear aunque se elimine de la hoja.
// ============================================================
const NOV_INICIALES = [
  { clave: "2026-11-cap-aula", modulo: "cap", titulo: "Nuevo: Aula virtual de capacitación", tipo: "Nuevo",
    resumen: "Gestión Humana ahora tiene un aula virtual con cursos, videos, material de apoyo y evaluaciones.", pasos: [
    { titulo: "Mis cursos", texto: "En el menú lateral encontrarás «Capacitación». Ahí ves los cursos asignados a tu cargo, tu avance y la fecha límite de cada uno.",
      porque: "Las capacitaciones se hacían por fuera de la plataforma y no quedaba evidencia ordenada de quién las hizo.",
      paraque: "Para que cada persona sepa qué cursos tiene pendientes y la organización tenga la evidencia de la formación (ISO/IEC 17025 · 6.2)." },
    { titulo: "Dentro del curso", texto: "Cada curso tiene secciones con videos, material de apoyo y lecturas. Al abrir cada recurso queda marcado «✓ Hecho» y avanza tu porcentaje.",
      porque: "Se necesita saber que la persona realmente revisó el contenido.", paraque: "Para medir el avance real y habilitar la evaluación solo cuando se vio todo el contenido." },
    { titulo: "Evaluación y constancia", texto: "Al final presentas la evaluación. Si alcanzas la nota mínima, el curso queda aprobado y puedes descargar tu constancia.",
      porque: "La competencia del personal debe demostrarse, no solo la asistencia.", paraque: "Para evidenciar la eficacia de la formación con una calificación y una constancia." },
    { titulo: "Aviso de cursos pendientes", texto: "Si tienes cursos sin terminar, al ingresar verás una ventana con la lista y la fecha límite de cada uno.",
      porque: "Los cursos con fecha límite se olvidaban.", paraque: "Para que nadie pase por alto una capacitación obligatoria." }] },
  { clave: "2026-11-sol-impacto", modulo: "sol", titulo: "Solicitud documental: procesos que impacta el documento", tipo: "Mejora",
    resumen: "Ahora indicas qué otros procesos impacta el documento y sus líderes lo aceptan antes de la revisión de Calidad.", pasos: [
    { titulo: "Agregar los procesos impactados", texto: "En «Nueva solicitud», en «Procesos que impacta el documento», elige cada proceso y pulsa «＋ Agregar». Se arma una tabla con el líder que debe aceptarlo.",
      porque: "Un documento de un proceso suele afectar el trabajo de otros procesos que no se enteraban del cambio.",
      paraque: "Para que todos los procesos afectados conozcan y estén de acuerdo con el documento antes de publicarlo." },
    { titulo: "Primero aceptan los líderes", texto: "La ruta ahora es: Solicitud → Aceptación de los procesos impactados → Revisión Calidad → Aprobación. Cada líder recibe un correo y acepta desde Gestión Documental → «Pendientes de aceptación».",
      porque: "Calidad debe revisar un documento que ya fue validado por los procesos que lo van a usar.",
      paraque: "Para evitar reprocesos: si un proceso pide ajustes, se corrigen antes de llegar a Calidad." }] },
  { clave: "2026-11-aud-frecuencia", modulo: "aud", titulo: "Valoración de procesos: frecuencia de auditoría de 1 a 5 veces al año", tipo: "Mejora",
    resumen: "En la valoración de cada proceso se elige la frecuencia de auditoría.", pasos: [
    { titulo: "Elegir la frecuencia", texto: "Al valorar un proceso, en «Frecuencia de auditoría» eliges entre 1 y 5 veces al año. El sistema sugiere una según el puntaje y la puedes cambiar.",
      porque: "Algunos procesos críticos requieren auditarse con más frecuencia de la que da el puntaje.",
      paraque: "Para que la frecuencia definida quede registrada y sea la base del programa de auditorías." }] },
  { clave: "2026-11-aud-auditores", modulo: "aud", titulo: "Hoja de vida de auditores: cargo, proceso y visualización del documento", tipo: "Mejora",
    resumen: "La lista de auditores muestra cargo, proceso y quién lo registró, y la hoja de vida se ve dentro de la plataforma.", pasos: [
    { titulo: "Más datos del auditor", texto: "Al registrar un auditor indicas su cargo y su proceso o especialidad. La tabla muestra ID, fecha, quién lo registró, tipo, cargo y proceso.",
      porque: "Faltaba información para evaluar la competencia e independencia del auditor.", paraque: "Para elegir al auditor adecuado para cada proceso." },
    { titulo: "Ver la hoja de vida", texto: "Con «Ver Documento» la hoja de vida (PDF o imagen) se muestra dentro de la plataforma, aunque el archivo no esté compartido en Drive.",
      porque: "Antes salía un error de Google al intentar ver el archivo.", paraque: "Para consultar la hoja de vida sin permisos adicionales de Drive." }] },
  { clave: "2026-11-op-impacto", modulo: "op", titulo: "Oportunidades de mejora: impacto y beneficios", tipo: "Mejora",
    resumen: "Cada oportunidad registra su impacto y sus beneficios.", pasos: [
    { titulo: "Dos campos nuevos", texto: "Al registrar o editar una oportunidad encontrarás «Impacto de la oportunidad» y «Beneficios de la oportunidad» (texto libre).",
      porque: "La calificación numérica no explicaba a quién afecta ni qué se gana.", paraque: "Para justificar mejor la decisión de abordar la oportunidad." }] },
  { clave: "2026-11-seguimiento-fijo", modulo: "mr", titulo: "Seguimiento fijo en Riesgos, Gestión del cambio y Oportunidades", tipo: "Cambio",
    resumen: "Lo que se escribe en el seguimiento queda fijo con fecha y autor; solo se agregan entradas nuevas.", pasos: [
    { titulo: "Historial que no se borra", texto: "En «Acciones realizadas», «Seguimiento», «Observaciones» y «Plan de seguimiento» ves el historial arriba y escribes la nueva entrada abajo. Al guardar se agrega con fecha y usuario.",
      porque: "El texto anterior se podía modificar y se perdía la trazabilidad del seguimiento.", paraque: "Para conservar la evidencia del monitoreo tal como se registró (control de registros)." }] },
  { clave: "2026-11-novedades", modulo: "general", titulo: "Nuevo: Novedades de la plataforma", tipo: "Nuevo",
    resumen: "Cada cambio de los módulos se explica en esta ventana: qué cambió, por qué y para qué.", pasos: [
    { titulo: "Esta ventana", texto: "Cuando se actualiza un módulo, al ingresar verás el instructivo del cambio paso a paso. Avanza con «Siguiente» o con las flechas del teclado; con «Probarlo ahora» vas directo al módulo.",
      porque: "Los cambios de la plataforma no se comunicaban y cada persona los descubría por su cuenta.",
      paraque: "Para que todo el personal conozca los cambios y quede el registro de quién los vio (comunicación interna, ISO 9001 · 7.4)." },
    { titulo: "Menú «Novedades»", texto: "En el menú lateral está «Novedades» con todos los cambios por mes. El número verde indica cuántas te faltan por ver. Si eliges «Ver más tarde», la novedad te vuelve a salir hasta que la termines.",
      porque: "No siempre hay tiempo de leer el cambio al ingresar.", paraque: "Para consultar los cambios cuando lo necesites." }] },
  { clave: "2026-11-ind-diligenciamiento", modulo: "ind", titulo: "Indicadores: periodos sin diligenciar, variables de la fórmula y edición de la ficha técnica", tipo: "Mejora",
    resumen: "La ficha de indicadores muestra qué periodos faltan por diligenciar según la frecuencia de medición de cada indicador.", pasos: [
    { titulo: "¿Qué indicadores faltan por diligenciar?", texto: "En «Ficha de Indicadores» los indicadores con periodos vencidos sin medición salen primero, con borde rojo. Cada tarjeta tiene una franja de periodos (meses, trimestres, semestres o año): verde = diligenciado, rojo = sin diligenciar, azul punteado = periodo en curso. El botón rojo «Diligenciar» te lleva directo al mes que falta.",
      porque: "Era difícil saber qué indicadores estaban atrasados sin abrirlos uno por uno.",
      paraque: "Para que cada responsable reporte a tiempo y Calidad haga seguimiento rápido al cumplimiento de la medición." },
    { titulo: "Variable 1 y Variable 2 con el nombre de la fórmula", texto: "En la tabla del indicador y en «Registrar medición», la Variable 1 muestra el numerador y la Variable 2 el denominador tal como están en la fórmula. Los meses que no corresponden a la frecuencia dicen «No aplica».",
      porque: "Con «Variable 1» y «Variable 2» no se sabía qué dato iba en cada casilla.",
      paraque: "Para registrar cada dato en la casilla correcta y evitar resultados errados." },
    { titulo: "Modificar la ficha técnica", texto: "El Coordinador de Calidad y el Administrador del Sistema tienen el botón «✏️ Modificar ficha técnica». Cada cambio queda en el historial de la ficha con el valor anterior, el nuevo, quién y cuándo, y se socializa en esta ventana.",
      porque: "Corregir una fórmula, meta o responsable obligaba a crear el indicador de nuevo.",
      paraque: "Para mantener la ficha actualizada con trazabilidad y control (solo quienes administran el SGC)." }] },
  { clave: "2026-11-ind-estado", modulo: "ind", titulo: "Indicadores: estado Activo / Inactivo en la ficha técnica", tipo: "Mejora",
    resumen: "Los indicadores que ya no se miden se pueden inactivar y dejan de aparecer en la Ficha de Indicadores.", pasos: [
    { titulo: "Estado del indicador", texto: "La ficha técnica tiene el campo «Estado del indicador» con la lista Activo / Inactivo. El Coordinador de Calidad o el Administrador lo cambian con «✏️ Modificar ficha técnica».",
      porque: "Indicadores que ya no se miden seguían apareciendo y se mostraban como pendientes por diligenciar.",
      paraque: "Para que la Ficha de Indicadores muestre solo los indicadores vigentes y el seguimiento sea real." },
    { titulo: "Los inactivos no aparecen", texto: "Un indicador inactivo se oculta de la Ficha de Indicadores y no cuenta en el resumen de pendientes. Su información y mediciones se conservan. Calidad y el Administrador pueden verlos con «Ver inactivos» para reactivarlos.",
      porque: "No se debe perder la historia del indicador al dejar de medirlo.", paraque: "Para conservar la evidencia y poder reactivarlo si se vuelve a necesitar." }] },
  { clave: "2026-11-op-evidencias", modulo: "op", titulo: "Oportunidades: cada oportunidad muestra sus propias evidencias", tipo: "Corrección",
    resumen: "Se corrigió que, al agregar oportunidades nuevas en la hoja, algunas mostraban las actividades y evidencias de otra.", pasos: [
    { titulo: "Evidencias en su oportunidad", texto: "Las actividades y evidencias se enlazaban solo por el N° de la oportunidad. Si en la hoja se insertaban filas o se renumeraban, cada oportunidad mostraba las de la que antes tenía su número. Ahora la plataforma lo detecta y devuelve cada actividad con su evidencia a la oportunidad correcta.",
      porque: "Las dos oportunidades nuevas (N° 1 y 2) aparecían con la evidencia de otra oportunidad.",
      paraque: "Para que la verificación de eficacia de cada oportunidad se haga con su evidencia real." },
    { titulo: "Recomendación", texto: "Registra las oportunidades nuevas con «＋ Registrar oportunidad»: el N° se asigna solo y no se mueve el de las demás. Si las pegas en la hoja, ponlas al final sin cambiar los números existentes.",
      porque: "Renumerar en la hoja rompe el enlace con las actividades.", paraque: "Para mantener la trazabilidad de cada oportunidad." }] },
  { clave: "2026-11-ven-historico-postventa", modulo: "ven", titulo: "Ventas y Almacén: histórico 2025-2026 cargado con el flujo completo", tipo: "Cambio",
    resumen: "Las cotizaciones, órdenes de trabajo y solicitudes de clientes de Drive (2025 y 2026) quedaron en Ventas en «Postventa» y sus OT quedaron despachadas en el Almacén.", pasos: [
    { titulo: "Ventas: seguimiento postventa", texto: "Todas las solicitudes históricas están en «Postventa», con las fechas del flujo y su registro de encuesta (uno por cliente y semestre) en estado «Pendiente envío». Las fechas posteriores a la OT son aproximadas y la factura figura como «N/R (histórico)».",
      porque: "Esos servicios ya se ejecutaron y entregaron.", paraque: "Para hacer el seguimiento postventa y la encuesta de satisfacción (5.10) sobre servicios reales." },
    { titulo: "Almacén: OT despachadas", texto: "Cada OT tiene su recepción, salida al área técnica, retorno y despacho con acta de entrega, y sus equipos quedan «Despachado». Los registros llevan la marca [Importado de Drive]: verifica las fechas contra los soportes físicos.",
      porque: "Lo que entra como OT entra al almacén y cierra allí su flujo.", paraque: "Para que Ventas y Almacén muestren la misma ruta completa de cada servicio." }] }
];
const NOV_IR_A = { cap: "Capacitación", sol: "Solicitud Documental", gd: "Gestión Documental", doc: "Documentos SGC", gh: "Gestión Humana",
  ind: "Indicadores", aud: "Auditoría", nc: "No Conformidades", op: "Matriz de Oportunidades", cam: "Gestión del Cambio", mr: "Matriz de Riesgos",
  cmp: "Compras", ven: "Ventas", alm: "Almacén", calidad: "Inicio · Calidad", ayuda: "Ayuda y manuales", general: "Toda la plataforma" };

// ---------- Hojas ----------
function novHojas_(ss) {
  const h = hojaOP(ss, NOV_HOJA, NOV_COLUMNAS.map(c => c[1]));
  const v = hojaOP(ss, NOV_HOJA_VISTAS, NOV_VISTAS_COLUMNAS);
  novSincronizar_(h);
  return { nov: h, vis: v };
}

// Crea (una sola vez) las novedades de los cambios de la plataforma que aún no están en la hoja
function novSincronizar_(h) {
  const props = PropertiesService.getScriptProperties();
  const hechas = String(props.getProperty("NOV_CLAVES") || "").split("|").filter(Boolean);
  const faltan = NOV_INICIALES.filter(n => hechas.indexOf(n.clave) === -1);
  if (!faltan.length) return;
  const lock = LockService.getScriptLock();
  let bloqueado = false;
  try { bloqueado = lock.tryLock(10000); } catch (e) {}
  try {
    const ya = String(props.getProperty("NOV_CLAVES") || "").split("|").filter(Boolean);
    const lista = novLeer_(h);
    let max = lista.reduce((m, n) => Math.max(m, parseInt(n.id.replace(/\D/g, ""), 10) || 0), 0);
    const ahora = new Date();
    faltan.filter(n => ya.indexOf(n.clave) === -1).forEach(n => {
      // Hojas creadas con la versión anterior: la novedad ya existe con el mismo título (se le asigna la clave)
      const previa = lista.find(x => x.clave === n.clave || (!x.clave && normalizar(x.titulo) === normalizar(n.titulo)));
      if (previa) { if (!previa.clave) h.getRange(previa.fila, NOV_COLUMNAS.length).setValue(n.clave); }
      else {
        max++;
        const o = { id: "NOV-" + ("00" + max).slice(-3), fecha: ahora, modulo: n.modulo, titulo: n.titulo, tipo: n.tipo, resumen: n.resumen,
          pasos: JSON.stringify(n.pasos.map((p, j) => Object.assign({ id: "p" + (j + 1), imagen: "" }, p))), dirigidoA: JSON.stringify({ todos: true, cargos: [] }),
          estado: "Publicado", creadoPor: "Plataforma SGC", fechaCreacion: ahora, actualizadoPor: "", fechaActualizacion: "", clave: n.clave };
        h.appendRow(NOV_COLUMNAS.map(c => o[c[0]]));
      }
      ya.push(n.clave);
    });
    props.setProperty("NOV_CLAVES", ya.join("|"));
  } catch (e) {
    Logger.log("ERROR novSincronizar_: " + e.toString());
  } finally {
    if (bloqueado) try { lock.releaseLock(); } catch (e) {}
  }
}

// Publica una novedad generada por la propia plataforma (p. ej. al modificar la ficha técnica de un indicador).
// El autor del cambio queda como que ya la vio.
function novPublicarAuto_(n, autor) {
  try {
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = novHojas_(ss);
    const lista = novLeer_(h.nov);
    const id = "NOV-" + ("00" + (lista.reduce((m, x) => Math.max(m, parseInt(x.id.replace(/\D/g, ""), 10) || 0), 0) + 1)).slice(-3);
    const ahora = new Date();
    const pasos = n.pasos.map((p, j) => ({ id: "p" + (j + 1), titulo: String(p.titulo || ""), texto: String(p.texto || ""), porque: String(p.porque || ""), paraque: String(p.paraque || ""), imagen: "" }));
    const o = { id: id, fecha: ahora, modulo: n.modulo, titulo: n.titulo, tipo: n.tipo || "Cambio", resumen: n.resumen || "",
      pasos: JSON.stringify(pasos).slice(0, 49000), dirigidoA: JSON.stringify({ todos: true, cargos: [] }), estado: "Publicado",
      creadoPor: autor ? autor.nombre : "Plataforma SGC", fechaCreacion: ahora, actualizadoPor: "", fechaActualizacion: "", clave: "" };
    h.nov.appendRow(NOV_COLUMNAS.map(c => o[c[0]]));
    if (autor) h.vis.appendRow([id, autor.usuario, autor.nombre, autor.cargo, ahora, ahora, pasos.length, pasos.length, "SI"]);
    return id;
  } catch (e) {
    Logger.log("ERROR novPublicarAuto_: " + e.toString());
    return "";
  }
}

function novJSON_(v, d) { try { const x = JSON.parse(String(v == null ? "" : v) || "null"); return x == null ? d : x; } catch (e) { return d; } }

function novLeer_(h) {
  if (h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, NOV_COLUMNAS.length).getValues().map((r, i) => {
    const o = { fila: i + 2 };
    NOV_COLUMNAS.forEach((c, j) => o[c[0]] = r[j]);
    o.id = String(o.id || "").trim();
    if (!o.id) return null;
    o.fechaISO = o.fecha instanceof Date ? formatearFecha(o.fecha, "yyyy-MM-dd") : String(o.fecha || "");
    o.fecha = formatearFecha(o.fecha, "dd/MM/yyyy");
    o.pasos = novJSON_(o.pasos, []);
    const d = novJSON_(o.dirigidoA, {});
    o.dirigidoA = { todos: d.todos !== false, cargos: Array.isArray(d.cargos) ? d.cargos : [] };
    o.estado = String(o.estado || "Borrador");
    ["modulo", "titulo", "tipo", "resumen", "creadoPor", "actualizadoPor", "clave"].forEach(k => o[k] = String(o[k] || "").trim());
    o.fechaCreacion = formatearFecha(o.fechaCreacion, "dd/MM/yyyy HH:mm");
    o.fechaActualizacion = formatearFecha(o.fechaActualizacion, "dd/MM/yyyy HH:mm");
    return o;
  }).filter(Boolean);
}

function novLeerVistas_(h) {
  if (h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, NOV_VISTAS_COLUMNAS.length).getValues().map((r, i) => ({
    fila: i + 2, novedad: String(r[0] || "").trim(), usuario: String(r[1] || "").trim(), nombre: String(r[2] || ""), cargo: String(r[3] || ""),
    primera: formatearFecha(r[4], "dd/MM/yyyy HH:mm"), ultima: formatearFecha(r[5], "dd/MM/yyyy HH:mm"), primeraD: r[4],
    pasos: Number(r[6]) || 0, total: Number(r[7]) || 0, completo: esValorSi(r[8])
  })).filter(x => x.novedad && x.usuario);
}

function novParaUsuario_(n, u) {
  if (!u) return false;
  if (n.dirigidoA.todos) return true;
  return n.dirigidoA.cargos.some(c => normalizar(c) === normalizar(u.cargo));
}

// Lo que se envía al navegador (las imágenes se piden aparte, paso por paso)
function novVista_(n, vista) {
  return { id: n.id, fecha: n.fecha, fechaISO: n.fechaISO, modulo: n.modulo, moduloNombre: NOV_IR_A[n.modulo] || n.modulo, titulo: n.titulo,
    tipo: n.tipo, resumen: n.resumen, estado: n.estado,
    pasos: n.pasos.map(p => ({ id: p.id, titulo: p.titulo, texto: p.texto, porque: p.porque, paraque: p.paraque, imagen: !!p.imagen })),
    vista: !!(vista && vista.completo), abierta: !!vista, fechaVista: vista ? vista.ultima : "" };
}

function novEsGestor_(u) {
  if (!u) return false;
  if (esAdministradorPerm(u)) return true;
  const p = permisosDeUsuario(u, filasPermisos(SpreadsheetApp.openById(ID_HOJA))).nov;
  return !!(p && p.editar);
}

// ---------- Para todos ----------
function novPendientes(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(true, { novedades: [] });
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const vistas = novLeerVistas_(h.vis).filter(v => normalizar(v.usuario) === normalizar(u.usuario));
    const lista = novLeer_(h.nov).filter(n => n.estado === "Publicado" && novParaUsuario_(n, u))
      .filter(n => !vistas.some(v => v.novedad === n.id && v.completo))
      .sort((a, b) => a.fechaISO < b.fechaISO ? -1 : a.fechaISO > b.fechaISO ? 1 : (a.id < b.id ? -1 : 1))
      .map(n => novVista_(n, vistas.find(v => v.novedad === n.id)));
    return respuesta(true, { novedades: lista });
  } catch (e) {
    Logger.log("ERROR novPendientes: " + e.toString());
    return respuesta(true, { novedades: [] });
  }
}

function novHistorial(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const vistas = novLeerVistas_(h.vis).filter(v => normalizar(v.usuario) === normalizar(u.usuario));
    const lista = novLeer_(h.nov).filter(n => n.estado === "Publicado" && novParaUsuario_(n, u))
      .sort((a, b) => a.fechaISO > b.fechaISO ? -1 : a.fechaISO < b.fechaISO ? 1 : (a.id > b.id ? -1 : 1))
      .map(n => novVista_(n, vistas.find(v => v.novedad === n.id)));
    return respuesta(true, { novedades: lista, gestor: novEsGestor_(u), modulos: NOV_IR_A, tipos: NOV_TIPOS });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Registra que la persona vio la novedad (pasos recorridos y si la terminó)
function novMarcarVista(id, pasosVistos, completo, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    lock.waitLock(20000);
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const n = novLeer_(h.nov).find(x => x.id === String(id || "").trim());
    if (!n) return respuesta(false, null, "La novedad no existe");
    const total = n.pasos.length;
    const pasos = Math.max(0, Math.min(total, Math.round(Number(pasosVistos) || 0)));
    const v = novLeerVistas_(h.vis).find(x => x.novedad === n.id && normalizar(x.usuario) === normalizar(u.usuario));
    const ahora = new Date();
    if (v) {
      const fila = [n.id, u.usuario, u.nombre, u.cargo, v.primeraD || ahora, ahora, Math.max(v.pasos, pasos), total, (v.completo || completo) ? "SI" : "NO"];
      h.vis.getRange(v.fila, 1, 1, fila.length).setValues([fila]);
    } else {
      h.vis.appendRow([n.id, u.usuario, u.nombre, u.cargo, ahora, ahora, pasos, total, completo ? "SI" : "NO"]);
    }
    return respuesta(true, { id: n.id });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Imagen de un paso: el servidor la entrega para mostrarla aunque el archivo no esté compartido en Drive
function novImagen(id, pasoId, usuario) { seguridadRPC_();
  try {
    if (!usuarioSD(usuario)) return respuesta(false, null, "Usuario no válido");
    const n = novLeer_(novHojas_(SpreadsheetApp.openById(ID_HOJA)).nov).find(x => x.id === String(id || "").trim());
    const p = n && n.pasos.find(x => x.id === pasoId);
    if (!p || !p.imagen) return respuesta(false, null, "Sin imagen");
    const fileId = extraerIdDrive(p.imagen);
    if (!fileId) return respuesta(true, { url: p.imagen });
    const f = DriveApp.getFileById(fileId);
    if (!/^image\//i.test(f.getMimeType())) return respuesta(true, { url: p.imagen });
    if (f.getSize() > 8 * 1024 * 1024) return respuesta(true, { url: p.imagen });
    return respuesta(true, { mime: f.getMimeType(), base64: Utilities.base64Encode(f.getBlob().getBytes()) });
  } catch (e) {
    return respuesta(false, null, "No se pudo cargar la imagen: " + e.toString());
  }
}

// ---------- Administración ----------
function novNegar_(usuario) {
  return novEsGestor_(usuarioSD(usuario)) ? null : respuesta(false, null, "No tienes permiso para administrar las novedades. Solicítalo al Administrador del sistema.");
}

function novAdmin(usuario) { seguridadRPC_();
  try {
    { const np = novNegar_(usuario); if (np) return np; }
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const vistas = novLeerVistas_(h.vis);
    const usuarios = capUsuariosActivos_();
    const cargos = {};
    usuarios.forEach(x => { if (x.cargo) cargos[normalizar(x.cargo)] = x.cargo; });
    const lista = novLeer_(h.nov).sort((a, b) => a.fechaISO > b.fechaISO ? -1 : a.fechaISO < b.fechaISO ? 1 : (a.id > b.id ? -1 : 1)).map(n => {
      const dest = usuarios.filter(x => novParaUsuario_(n, x));
      const vs = vistas.filter(v => v.novedad === n.id && dest.some(d => normalizar(d.usuario) === normalizar(v.usuario)));
      return Object.assign(novVista_(n, null), { dirigidoA: n.dirigidoA, destinatarios: dest.length,
        completas: vs.filter(v => v.completo).length, abiertas: vs.filter(v => !v.completo).length, creadoPor: n.creadoPor });
    });
    return respuesta(true, { novedades: lista, modulos: NOV_IR_A, tipos: NOV_TIPOS,
      cargos: Object.values(cargos).sort((a, b) => a.localeCompare(b, "es")) });
  } catch (e) {
    Logger.log("ERROR novAdmin: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function novEditar(id, usuario) { seguridadRPC_();
  try {
    { const np = novNegar_(usuario); if (np) return np; }
    const n = novLeer_(novHojas_(SpreadsheetApp.openById(ID_HOJA)).nov).find(x => x.id === String(id || "").trim());
    if (!n) return respuesta(false, null, "La novedad no existe");
    delete n.fila;
    return respuesta(true, n);
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function novGuardar(datos, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    { const np = novNegar_(usuario); if (np) return np; }
    datos = datos || {};
    const t = v => String(v == null ? "" : v).trim();
    const pasos = (Array.isArray(datos.pasos) ? datos.pasos : []).map((p, i) => ({
      id: /^[\w-]{1,30}$/.test(String(p.id || "")) ? String(p.id) : "p" + Utilities.getUuid().slice(0, 6),
      titulo: t(p.titulo), texto: t(p.texto), porque: t(p.porque), paraque: t(p.paraque), imagen: t(p.imagen)
    })).filter(p => p.titulo || p.texto || p.porque || p.paraque || p.imagen);
    const faltan = [];
    if (!t(datos.titulo)) faltan.push("título de la novedad");
    if (!NOV_IR_A[t(datos.modulo)]) faltan.push("módulo");
    if (!pasos.length) faltan.push("al menos un paso del instructivo");
    pasos.forEach((p, i) => { if (!p.titulo) faltan.push("título del paso " + (i + 1)); if (!p.texto) faltan.push("explicación del paso " + (i + 1)); });
    const d = datos.dirigidoA || {};
    const dirigidoA = { todos: d.todos !== false, cargos: (d.cargos || []).map(t).filter(Boolean) };
    if (!dirigidoA.todos && !dirigidoA.cargos.length) faltan.push("a quién va dirigida");
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));
    const u = usuarioSD(usuario);
    lock.waitLock(20000);
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const lista = novLeer_(h.nov);
    const actual = t(datos.id) ? lista.find(n => n.id === t(datos.id)) : null;
    if (t(datos.id) && !actual) return respuesta(false, null, "La novedad ya no existe");
    const id = actual ? actual.id : "NOV-" + ("00" + (lista.reduce((m, n) => Math.max(m, parseInt(n.id.replace(/\D/g, ""), 10) || 0), 0) + 1)).slice(-3);
    const ahora = new Date();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(t(datos.fechaISO)) ? aFechaOP(t(datos.fechaISO)) : ahora;
    // Si se vuelve a publicar con «mostrar de nuevo», se borra el registro de vistas para que todos la vean otra vez
    if (actual && datos.mostrarDeNuevo) {
      const vis = novLeerVistas_(h.vis).filter(v => v.novedad === id).map(v => v.fila).sort((a, b) => b - a);
      vis.forEach(f => { anotarEliminado_(h.vis, [h.vis.getRange(f, 1, 1, NOV_VISTAS_COLUMNAS.length).getValues()[0]]); h.vis.deleteRow(f); });
    }
    const valores = { id: id, fecha: fecha, modulo: t(datos.modulo), titulo: t(datos.titulo), tipo: NOV_TIPOS.indexOf(t(datos.tipo)) !== -1 ? t(datos.tipo) : "Mejora",
      resumen: t(datos.resumen), pasos: JSON.stringify(pasos), dirigidoA: JSON.stringify(dirigidoA), estado: t(datos.estado) === "Publicado" ? "Publicado" : "Borrador",
      creadoPor: actual ? actual.creadoPor : (u ? u.nombre : ""), fechaCreacion: actual ? h.nov.getRange(actual.fila, 11).getValue() : ahora,
      actualizadoPor: actual ? (u ? u.nombre : "") : "", fechaActualizacion: actual ? ahora : "", clave: actual ? actual.clave : "" };
    if (valores.pasos.length > 49000) return respuesta(false, null, "La novedad tiene demasiado texto. Divídela en dos novedades.");
    const fila = NOV_COLUMNAS.map(c => valores[c[0]]);
    if (actual) h.nov.getRange(actual.fila, 1, 1, fila.length).setValues([fila]); else h.nov.appendRow(fila);
    return respuesta(true, { id: id });
  } catch (e) {
    Logger.log("ERROR novGuardar: " + e.toString());
    return respuesta(false, null, "Error guardando la novedad: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function novEliminar(id, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    { const np = novNegar_(usuario); if (np) return np; }
    lock.waitLock(20000);
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const n = novLeer_(h.nov).find(x => x.id === String(id || "").trim());
    if (!n) return respuesta(false, null, "La novedad no existe");
    anotarEliminado_(h.nov, [h.nov.getRange(n.fila, 1, 1, NOV_COLUMNAS.length).getValues()[0]]);
    h.nov.deleteRow(n.fila);
    return respuesta(true, { id: n.id });   // el registro de vistas se conserva como evidencia
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Registro de quién vio la novedad
function novRegistro(id, usuario) { seguridadRPC_();
  try {
    { const np = novNegar_(usuario); if (np) return np; }
    const h = novHojas_(SpreadsheetApp.openById(ID_HOJA));
    const n = novLeer_(h.nov).find(x => x.id === String(id || "").trim());
    if (!n) return respuesta(false, null, "La novedad no existe");
    const vistas = novLeerVistas_(h.vis).filter(v => v.novedad === n.id);
    const filas = capUsuariosActivos_().filter(x => novParaUsuario_(n, x)).map(x => {
      const v = vistas.find(k => normalizar(k.usuario) === normalizar(x.usuario));
      return { usuario: x.usuario, nombre: x.nombre, cargo: x.cargo, estado: !v ? "Pendiente" : v.completo ? "Vio todo" : "Abrió sin terminar",
        primera: v ? v.primera : "", ultima: v ? v.ultima : "", pasos: v ? v.pasos : 0, total: n.pasos.length };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return respuesta(true, { novedad: novVista_(n, null), registro: filas });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Imagen del paso (se comprime en el navegador antes de subirla)
function subirImagenNovedad(nombre, tipo, base64, usuario) { seguridadRPC_();
  try {
    { const np = novNegar_(usuario); if (np) return np; }
    if (!base64 || typeof base64 !== "string") return respuesta(false, null, "No se recibió la imagen");
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 8 * 1024 * 1024) return respuesta(false, null, "La imagen supera 8 MB");
    const f = carpetaSGC(NOV_CARPETA).createFile(Utilities.newBlob(bytes, tipo || "image/jpeg", nombre));
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    return respuesta(true, { url: f.getUrl() });
  } catch (e) {
    return respuesta(false, null, "Error subiendo la imagen: " + e.toString());
  }
}
