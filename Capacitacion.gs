// ============================================================
// CAPACITACIÓN · AULA VIRTUAL (Gestión Humana)
// Cursos con videos, material de apoyo y evaluación, asignados por cargo o por usuario.
// Hojas (se crean solas):
//   CAP_Cursos    un curso por fila; el contenido y la evaluación se guardan en detalle (JSON)
//   CAP_Progreso  avance de cada persona en cada curso (recursos vistos, estado, nota, intentos)
//   CAP_Intentos  cada intento de evaluación con su nota y respuestas (evidencia de la capacitación)
// Administran los cursos: el Administrador y quien tenga permiso de editar en "Capacitación"
// (por defecto Gerente, Coordinador de Calidad y cargos de Gestión / Talento Humano).
// Las respuestas correctas nunca se envían al navegador del estudiante: la nota se calcula aquí.
// ============================================================
const CAP_HOJA = "CAP_Cursos";
const CAP_HOJA_PROG = "CAP_Progreso";
const CAP_HOJA_INT = "CAP_Intentos";
const CAP_CARPETA = "IMCOLMETRIC - Capacitación (Material)";
const CAP_MAX_MB = 25;   // videos más grandes: subirlos a Drive o YouTube y pegar el enlace
const CAP_ESTADOS_CURSO = ["Borrador", "Publicado", "Archivado"];

const CAP_COLUMNAS = [
  ["id", "ID"], ["titulo", "Título"], ["descripcion", "Descripción"], ["categoria", "Categoría"], ["color", "Color"],
  ["estado", "Estado"], ["obligatorio", "Obligatorio"], ["asignacion", "Dirigido a (detalle)"], ["fechaLimite", "Fecha límite"],
  ["duracion", "Duración"], ["notaMinima", "Nota mínima (%)"], ["intentosMax", "Intentos permitidos (0 = ilimitados)"],
  ["requiereContenido", "Evaluación requiere ver todo el contenido"], ["contenido", "Contenido (detalle)"],
  ["evaluacion", "Evaluación (detalle)"], ["creadoPor", "Creado por"], ["fechaCreacion", "Fecha creación"],
  ["actualizadoPor", "Actualizado por"], ["fechaActualizacion", "Fecha actualización"]
];
const CAP_PROG_COLUMNAS = ["Curso", "Usuario", "Nombre", "Cargo", "Recursos vistos", "Estado", "Nota (%)", "Intentos",
  "Fecha inicio", "Fecha finalización", "Última actividad"];
const CAP_INT_COLUMNAS = ["Curso", "Usuario", "Nombre", "Fecha", "Nota (%)", "Aprobado", "Respuestas"];

// ---------- Utilidades ----------
function capJSON_(v, def) {
  try { const x = JSON.parse(String(v == null ? "" : v) || "null"); return x == null ? def : x; } catch (e) { return def; }
}
function capTexto_(v) { return String(v == null ? "" : v).trim(); }
function capHoy_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"); }

function capHojas_(ss) {
  return {
    cursos: hojaOP(ss, CAP_HOJA, CAP_COLUMNAS.map(c => c[1])),
    prog: hojaOP(ss, CAP_HOJA_PROG, CAP_PROG_COLUMNAS),
    int: hojaOP(ss, CAP_HOJA_INT, CAP_INT_COLUMNAS)
  };
}

function capLeerCursos_(hoja) {
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, CAP_COLUMNAS.length).getValues().map((r, i) => {
    const o = { fila: i + 2 };
    CAP_COLUMNAS.forEach((c, j) => o[c[0]] = r[j]);
    o.id = capTexto_(o.id);
    if (!o.id) return null;
    o.titulo = capTexto_(o.titulo); o.descripcion = capTexto_(o.descripcion);
    o.categoria = capTexto_(o.categoria) || "General"; o.color = capTexto_(o.color) || "#0f6cbf";
    o.estado = CAP_ESTADOS_CURSO.find(e => normalizar(e) === normalizar(o.estado)) || "Borrador";
    o.obligatorio = esValorSi(o.obligatorio);
    o.requiereContenido = o.requiereContenido === "" ? true : esValorSi(o.requiereContenido);
    const a = capJSON_(o.asignacion, {});
    o.asignacion = { todos: !!a.todos, cargos: Array.isArray(a.cargos) ? a.cargos : [], usuarios: Array.isArray(a.usuarios) ? a.usuarios : [] };
    o.fechaLimite = o.fechaLimite instanceof Date ? formatearFecha(o.fechaLimite, "yyyy-MM-dd") : capTexto_(o.fechaLimite);
    o.duracion = capTexto_(o.duracion);
    o.notaMinima = o.notaMinima === "" ? 80 : Math.max(0, Math.min(100, Number(o.notaMinima) || 0));
    o.intentosMax = Math.max(0, Math.round(Number(o.intentosMax) || 0));
    o.contenido = capJSON_(o.contenido, []);
    o.evaluacion = capJSON_(o.evaluacion, []);
    o.creadoPor = capTexto_(o.creadoPor); o.fechaCreacion = formatearFecha(o.fechaCreacion, "dd/MM/yyyy");
    o.actualizadoPor = capTexto_(o.actualizadoPor); o.fechaActualizacion = formatearFecha(o.fechaActualizacion, "dd/MM/yyyy HH:mm");
    return o;
  }).filter(Boolean);
}

function capLeerProgreso_(hoja) {
  if (hoja.getLastRow() < 2) return [];
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, CAP_PROG_COLUMNAS.length).getValues().map((r, i) => ({
    fila: i + 2, curso: capTexto_(r[0]), usuario: capTexto_(r[1]), nombre: capTexto_(r[2]), cargo: capTexto_(r[3]),
    vistos: capJSON_(r[4], []), estado: capTexto_(r[5]) || "No iniciado", nota: r[6] === "" ? null : Number(r[6]),
    intentos: Number(r[7]) || 0, fechaInicio: formatearFecha(r[8], "dd/MM/yyyy"), fechaFinal: formatearFecha(r[9], "dd/MM/yyyy"),
    fechaInicioD: r[8], fechaFinalD: r[9],
    ultima: formatearFecha(r[10], "dd/MM/yyyy HH:mm")
  })).filter(p => p.curso && p.usuario);
}

function capProgresoDe_(lista, cursoId, usuario) {
  return lista.find(p => p.curso === cursoId && normalizar(p.usuario) === normalizar(usuario)) || null;
}

function capItems_(c) {
  return (c.contenido || []).reduce((t, s) => t.concat(Array.isArray(s.items) ? s.items : []), []);
}

function capAsignado_(c, u) {
  if (!u) return false;
  const a = c.asignacion || {};
  if (a.todos) return true;
  if ((a.usuarios || []).some(x => normalizar(x) === normalizar(u.usuario))) return true;
  return (a.cargos || []).some(x => normalizar(x) === normalizar(u.cargo));
}

function capUsuariosActivos_() {
  const data = inicializarHojaUsuarios().getDataRange().getValues();
  const cols = columnasUsuarios(data[0]);
  return data.slice(1).filter(f => usuarioActivo(f, cols)).map(f => ({
    usuario: capTexto_(campo(f, cols, "usuario")), nombre: capTexto_(campo(f, cols, "nombre")) || capTexto_(campo(f, cols, "usuario")),
    cargo: capTexto_(campo(f, cols, "cargo"))
  })).filter(x => x.usuario);
}

// Administran los cursos: Administrador o permiso de editar en el módulo "cap" (matriz de permisos)
function capEsGestor_(u) {
  if (!u) return false;
  if (esAdministradorPerm(u)) return true;
  const p = permisosDeUsuario(u, filasPermisos(SpreadsheetApp.openById(ID_HOJA))).cap;
  return !!(p && p.editar);
}

// Estado y avance de una persona en un curso
function capResumen_(c, p) {
  const items = capItems_(c).map(i => i.id);
  const vistos = (p ? p.vistos : []).filter(v => items.indexOf(v) !== -1);
  const hayEval = (c.evaluacion || []).length > 0;
  let estado = p ? p.estado : "No iniciado";
  if (!hayEval && items.length && vistos.length === items.length) estado = "Completado";
  else if (estado === "Completado") estado = "En curso";   // se agregó contenido nuevo al curso
  const terminado = estado === "Aprobado" || estado === "Completado";
  const total = items.length + (hayEval ? 1 : 0);
  const hechos = vistos.length + (hayEval && estado === "Aprobado" ? 1 : 0);
  return {
    vistos: vistos, totalRecursos: items.length, porcentaje: terminado ? 100 : (total ? Math.round(hechos / total * 100) : 0),
    estado: estado, terminado: terminado, nota: p ? p.nota : null, intentos: p ? p.intentos : 0,
    vencido: !terminado && !!c.fechaLimite && c.fechaLimite < capHoy_(),
    fechaInicio: p ? p.fechaInicio : "", fechaFinal: p ? p.fechaFinal : "", ultima: p ? p.ultima : ""
  };
}

// Lo que ve el estudiante: sin las respuestas correctas
function capVista_(c, p, conPreguntas) {
  const o = {
    id: c.id, titulo: c.titulo, descripcion: c.descripcion, categoria: c.categoria, color: c.color, estadoCurso: c.estado,
    obligatorio: c.obligatorio, fechaLimite: c.fechaLimite, duracion: c.duracion, notaMinima: c.notaMinima,
    intentosMax: c.intentosMax, requiereContenido: c.requiereContenido, preguntas: (c.evaluacion || []).length,
    contenido: conPreguntas ? c.contenido : undefined
  };
  if (conPreguntas) o.evaluacion = (c.evaluacion || []).map(q => ({ id: q.id, texto: q.texto, tipo: q.tipo, opciones: q.opciones }));
  return Object.assign(o, capResumen_(c, p));
}

function capGuardarProgreso_(hoja, p) {
  const fila = [p.curso, p.usuario, p.nombre, p.cargo, JSON.stringify(p.vistos || []), p.estado, p.nota == null ? "" : p.nota,
    p.intentos || 0, p.fechaInicioD || "", p.fechaFinalD || "", new Date()];
  if (p.fila) hoja.getRange(p.fila, 1, 1, fila.length).setValues([fila]);
  else hoja.appendRow(fila);
}

// ---------- Configuración ----------
function capConfig(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const gestor = capEsGestor_(u);
    const out = { gestor: gestor, maxMb: CAP_MAX_MB, estados: CAP_ESTADOS_CURSO };
    if (gestor) {
      const usuarios = capUsuariosActivos_();
      const cargos = {};
      usuarios.forEach(x => { if (x.cargo) cargos[normalizar(x.cargo)] = x.cargo; });
      const ss = SpreadsheetApp.openById(ID_HOJA);
      const cats = {};
      capLeerCursos_(capHojas_(ss).cursos).forEach(c => cats[normalizar(c.categoria)] = c.categoria);
      ["Inducción", "Reinducción", "Calidad · ISO/IEC 17025", "Seguridad y salud en el trabajo", "Metrología", "Imparcialidad y confidencialidad"]
        .forEach(c => { if (!cats[normalizar(c)]) cats[normalizar(c)] = c; });
      out.usuarios = usuarios;
      out.cargos = Object.values(cargos).sort((a, b) => a.localeCompare(b, "es"));
      out.categorias = Object.values(cats).sort((a, b) => a.localeCompare(b, "es"));
    }
    return respuesta(true, out);
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// ---------- Estudiante ----------
function capMisCursos(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = capHojas_(ss);
    const prog = capLeerProgreso_(h.prog);
    const cursos = capLeerCursos_(h.cursos)
      .filter(c => c.estado === "Publicado" && capAsignado_(c, u))
      .map(c => capVista_(c, capProgresoDe_(prog, c.id, u.usuario), false));
    return respuesta(true, { cursos: cursos, gestor: capEsGestor_(u), nombre: u.nombre, cargo: u.cargo });
  } catch (e) {
    Logger.log("ERROR capMisCursos: " + e.toString());
    return respuesta(false, null, "Error cargando los cursos: " + e.toString());
  }
}

// Para la ventana emergente al ingresar
function capPendientes(usuario) { seguridadRPC_();
  try {
    const r = JSON.parse(capMisCursos(usuario));
    if (!r.ok) return respuesta(true, { cursos: [] });
    const pend = r.data.cursos.filter(c => !c.terminado && c.estado !== "Reprobado")
      .sort((a, b) => (a.fechaLimite || "9999") < (b.fechaLimite || "9999") ? -1 : 1)
      .map(c => ({ id: c.id, titulo: c.titulo, categoria: c.categoria, color: c.color, fechaLimite: c.fechaLimite,
                   vencido: c.vencido, obligatorio: c.obligatorio, porcentaje: c.porcentaje, estado: c.estado }));
    return respuesta(true, { cursos: pend });
  } catch (e) {
    return respuesta(true, { cursos: [] });
  }
}

function capCurso(id, usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = capHojas_(ss);
    const c = capLeerCursos_(h.cursos).find(x => x.id === capTexto_(id));
    if (!c) return respuesta(false, null, "El curso no existe");
    const gestor = capEsGestor_(u);
    const asignado = c.estado === "Publicado" && capAsignado_(c, u);
    if (!asignado && !gestor) return respuesta(false, null, "Este curso no está asignado a tu cargo");
    const p = capProgresoDe_(capLeerProgreso_(h.prog), c.id, u.usuario);
    const o = capVista_(c, p, true);
    o.asignado = asignado;
    o.vistaPrevia = !asignado;
    o.historial = h.int.getLastRow() < 2 ? [] : h.int.getRange(2, 1, h.int.getLastRow() - 1, 6).getValues()
      .filter(r => capTexto_(r[0]) === c.id && normalizar(r[1]) === normalizar(u.usuario))
      .map(r => ({ fecha: formatearFecha(r[3], "dd/MM/yyyy HH:mm"), nota: Number(r[4]) || 0, aprobado: esValorSi(r[5]) }));
    o.estudiante = { nombre: u.nombre, cargo: u.cargo };
    return respuesta(true, o);
  } catch (e) {
    Logger.log("ERROR capCurso: " + e.toString());
    return respuesta(false, null, "Error cargando el curso: " + e.toString());
  }
}

// Marca un recurso como visto (finalización automática al abrirlo)
function capMarcarVisto(id, itemId, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = capHojas_(ss);
    const c = capLeerCursos_(h.cursos).find(x => x.id === capTexto_(id));
    if (!c) return respuesta(false, null, "El curso no existe");
    if (c.estado !== "Publicado" || !capAsignado_(c, u)) return respuesta(true, { guardado: false });   // vista previa del administrador
    if (!capItems_(c).some(i => i.id === itemId)) return respuesta(false, null, "El recurso ya no existe en el curso");
    const p = capProgresoDe_(capLeerProgreso_(h.prog), c.id, u.usuario) ||
      { curso: c.id, usuario: u.usuario, vistos: [], estado: "No iniciado", nota: null, intentos: 0 };
    p.nombre = u.nombre; p.cargo = u.cargo;
    if (p.vistos.indexOf(itemId) === -1) p.vistos.push(itemId);
    if (!p.fechaInicioD) p.fechaInicioD = new Date();
    if (p.estado === "No iniciado") p.estado = "En curso";
    const r = capResumen_(c, p);
    if (r.estado === "Completado" && p.estado !== "Completado") { p.estado = "Completado"; p.fechaFinalD = new Date(); }
    capGuardarProgreso_(h.prog, p);
    return respuesta(true, Object.assign({ guardado: true }, capResumen_(c, p)));
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// respuestas: { idPregunta: [índices de las opciones elegidas] }
function capEnviarEvaluacion(id, respuestas, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    if (!u) return respuesta(false, null, "Usuario no válido");
    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = capHojas_(ss);
    const c = capLeerCursos_(h.cursos).find(x => x.id === capTexto_(id));
    if (!c) return respuesta(false, null, "El curso no existe");
    if (c.estado !== "Publicado" || !capAsignado_(c, u)) return respuesta(false, null, "Solo las personas asignadas al curso pueden presentar la evaluación");
    const preguntas = c.evaluacion || [];
    if (!preguntas.length) return respuesta(false, null, "El curso no tiene evaluación");
    const p = capProgresoDe_(capLeerProgreso_(h.prog), c.id, u.usuario) ||
      { curso: c.id, usuario: u.usuario, vistos: [], estado: "No iniciado", nota: null, intentos: 0, fechaInicioD: new Date() };
    p.nombre = u.nombre; p.cargo = u.cargo;
    if (p.estado === "Aprobado") return respuesta(false, null, "Ya aprobaste este curso");
    if (c.intentosMax && p.intentos >= c.intentosMax) return respuesta(false, null, "Ya usaste los " + c.intentosMax + " intentos permitidos. Solicita un nuevo intento a Gestión Humana.");
    if (c.requiereContenido) {
      const faltan = capItems_(c).filter(i => p.vistos.indexOf(i.id) === -1).length;
      if (faltan) return respuesta(false, null, "Primero revisa todo el contenido del curso (faltan " + faltan + " recurso" + (faltan === 1 ? "" : "s") + ")");
    }
    respuestas = respuestas || {};
    const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    let buenas = 0;
    const detalle = preguntas.map(q => {
      const elegidas = (Array.isArray(respuestas[q.id]) ? respuestas[q.id] : []).map(Number).filter(n => n >= 0).sort((a, b) => a - b);
      const correctas = (q.correctas || []).map(Number).sort((a, b) => a - b);
      const ok = elegidas.length > 0 && igual(elegidas, correctas);
      if (ok) buenas++;
      return { id: q.id, correcta: ok, respondida: elegidas.length > 0 };
    });
    const nota = Math.round(buenas / preguntas.length * 100);
    const aprobado = nota >= c.notaMinima;
    p.intentos = (p.intentos || 0) + 1;
    p.nota = p.nota == null ? nota : Math.max(p.nota, nota);   // calificación más alta
    if (aprobado) { p.estado = "Aprobado"; p.fechaFinalD = new Date(); }
    else p.estado = c.intentosMax && p.intentos >= c.intentosMax ? "Reprobado" : "En curso";
    capGuardarProgreso_(h.prog, p);
    h.int.appendRow([c.id, u.usuario, u.nombre, new Date(), nota, aprobado ? "SI" : "NO", JSON.stringify(respuestas)]);
    return respuesta(true, { nota: nota, aprobado: aprobado, notaMinima: c.notaMinima, buenas: buenas, total: preguntas.length,
      intentos: p.intentos, intentosMax: c.intentosMax, estado: p.estado, mejorNota: p.nota, detalle: detalle });
  } catch (e) {
    Logger.log("ERROR capEnviarEvaluacion: " + e.toString());
    return respuesta(false, null, "Error enviando la evaluación: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// ---------- Administración de cursos ----------
function capNegarGestor_(u) {
  return capEsGestor_(u) ? null : respuesta(false, null, "No tienes permiso para administrar los cursos de capacitación. Solicítalo al Administrador del sistema.");
}

function capGestionCursos(usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    const np = capNegarGestor_(u); if (np) return np;
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = capHojas_(ss);
    const prog = capLeerProgreso_(h.prog);
    const usuarios = capUsuariosActivos_();
    const lista = capLeerCursos_(h.cursos).map(c => {
      const asignados = usuarios.filter(x => capAsignado_(c, x));
      const res = asignados.map(x => capResumen_(c, capProgresoDe_(prog, c.id, x.usuario)));
      return {
        id: c.id, titulo: c.titulo, categoria: c.categoria, color: c.color, estado: c.estado, obligatorio: c.obligatorio,
        fechaLimite: c.fechaLimite, asignacion: c.asignacion, recursos: capItems_(c).length, preguntas: (c.evaluacion || []).length,
        asignados: asignados.length, terminados: res.filter(r => r.terminado).length, enCurso: res.filter(r => !r.terminado && r.estado !== "No iniciado").length,
        sinIniciar: res.filter(r => r.estado === "No iniciado").length, vencidos: res.filter(r => r.vencido).length,
        reprobados: res.filter(r => r.estado === "Reprobado").length, actualizado: c.fechaActualizacion || c.fechaCreacion
      };
    });
    return respuesta(true, lista);
  } catch (e) {
    Logger.log("ERROR capGestionCursos: " + e.toString());
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function capCursoEditar(id, usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    const np = capNegarGestor_(u); if (np) return np;
    const c = capLeerCursos_(capHojas_(SpreadsheetApp.openById(ID_HOJA)).cursos).find(x => x.id === capTexto_(id));
    if (!c) return respuesta(false, null, "El curso no existe");
    delete c.fila;
    return respuesta(true, c);
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

function capGuardarCurso(datos, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    const np = capNegarGestor_(u); if (np) return np;
    datos = datos || {};
    const t = capTexto_;
    const idSeguro = (v, pref) => /^[\w-]{3,40}$/.test(String(v || "")) ? String(v) : pref + Utilities.getUuid().slice(0, 8);
    const faltan = [];
    if (!t(datos.titulo)) faltan.push("título del curso");
    const tipos = ["video", "archivo", "enlace", "texto"];
    const contenido = (Array.isArray(datos.contenido) ? datos.contenido : []).map((s, si) => ({
      id: idSeguro(s.id, "sec"), titulo: t(s.titulo) || "Sección " + (si + 1), resumen: t(s.resumen),
      items: (Array.isArray(s.items) ? s.items : []).map(it => ({
        id: idSeguro(it.id, "it"), tipo: tipos.indexOf(it.tipo) !== -1 ? it.tipo : "archivo", titulo: t(it.titulo),
        url: t(it.url), texto: String(it.texto == null ? "" : it.texto).trim()
      })).filter(it => it.titulo || it.url || it.texto)
    }));
    contenido.forEach((s, si) => s.items.forEach((it, ii) => {
      const n = "recurso " + (ii + 1) + " de la sección " + (si + 1);
      if (!it.titulo) faltan.push("nombre del " + n);
      if (it.tipo !== "texto" && !/^https?:\/\//i.test(it.url)) faltan.push("enlace o archivo del " + n);
      if (it.tipo === "texto" && !it.texto) faltan.push("texto de la lectura del " + n);
    }));
    const evaluacion = (Array.isArray(datos.evaluacion) ? datos.evaluacion : []).map(q => {
      const tipo = ["unica", "multiple", "vf"].indexOf(q.tipo) !== -1 ? q.tipo : "unica";
      const opciones = tipo === "vf" ? ["Verdadero", "Falso"] : (Array.isArray(q.opciones) ? q.opciones : []).map(t).filter(Boolean);
      const correctas = (Array.isArray(q.correctas) ? q.correctas : []).map(Number).filter(n => n >= 0 && n < opciones.length)
        .filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
      return { id: idSeguro(q.id, "q"), tipo: tipo, texto: t(q.texto), opciones: opciones, correctas: correctas };
    }).filter(q => q.texto || q.opciones.length);
    evaluacion.forEach((q, i) => {
      const n = "pregunta " + (i + 1);
      if (!q.texto) faltan.push("enunciado de la " + n);
      if (q.opciones.length < 2) faltan.push("al menos 2 opciones en la " + n);
      if (!q.correctas.length) faltan.push("respuesta correcta de la " + n);
      if (q.tipo !== "multiple" && q.correctas.length > 1) faltan.push("una sola respuesta correcta en la " + n);
    });
    const a = datos.asignacion || {};
    const asignacion = { todos: !!a.todos, cargos: (a.cargos || []).map(t).filter(Boolean), usuarios: (a.usuarios || []).map(t).filter(Boolean) };
    const estado = CAP_ESTADOS_CURSO.find(e => e === datos.estado) || "Borrador";
    if (estado === "Publicado") {
      if (!contenido.some(s => s.items.length) && !evaluacion.length) faltan.push("al menos un recurso o una pregunta para publicar");
      if (!asignacion.todos && !asignacion.cargos.length && !asignacion.usuarios.length) faltan.push("a quién va dirigido el curso");
    }
    const fechaLimite = /^\d{4}-\d{2}-\d{2}$/.test(t(datos.fechaLimite)) ? t(datos.fechaLimite) : "";
    if (faltan.length) return respuesta(false, null, "Completa: " + faltan.join(", "));

    lock.waitLock(20000);
    const ss = SpreadsheetApp.openById(ID_HOJA);
    const h = capHojas_(ss);
    const cursos = capLeerCursos_(h.cursos);
    let actual = t(datos.id) ? cursos.find(c => c.id === t(datos.id)) : null;
    if (t(datos.id) && !actual) return respuesta(false, null, "El curso ya no existe");
    let id = actual ? actual.id : "";
    if (!id) {
      const pref = "CUR-" + new Date().getFullYear() + "-";
      const max = cursos.reduce((m, c) => c.id.indexOf(pref) === 0 ? Math.max(m, parseInt(c.id.slice(pref.length), 10) || 0) : m, 0);
      id = pref + ("00" + (max + 1)).slice(-3);
    }
    const ahora = new Date();
    const valores = {
      id: id, titulo: t(datos.titulo), descripcion: String(datos.descripcion == null ? "" : datos.descripcion).trim(),
      categoria: t(datos.categoria) || "General", color: /^#[0-9a-f]{6}$/i.test(t(datos.color)) ? t(datos.color) : "#0f6cbf",
      estado: estado, obligatorio: datos.obligatorio ? "SI" : "NO", asignacion: JSON.stringify(asignacion),
      fechaLimite: fechaLimite ? aFechaOP(fechaLimite) : "", duracion: t(datos.duracion),
      notaMinima: Math.max(0, Math.min(100, Math.round(Number(datos.notaMinima) || 0))),
      intentosMax: Math.max(0, Math.round(Number(datos.intentosMax) || 0)), requiereContenido: datos.requiereContenido === false ? "NO" : "SI",
      contenido: JSON.stringify(contenido), evaluacion: JSON.stringify(evaluacion),
      creadoPor: actual ? actual.creadoPor : u.nombre, fechaCreacion: actual ? h.cursos.getRange(actual.fila, CAP_COLUMNAS.findIndex(c => c[0] === "fechaCreacion") + 1).getValue() : ahora,
      actualizadoPor: actual ? u.nombre : "", fechaActualizacion: actual ? ahora : ""
    };
    if (valores.contenido.length > 49000 || valores.evaluacion.length > 49000)
      return respuesta(false, null, "El curso es demasiado extenso para una sola fila. Divide el contenido en dos cursos.");
    const fila = CAP_COLUMNAS.map(c => valores[c[0]]);
    if (actual) h.cursos.getRange(actual.fila, 1, 1, fila.length).setValues([fila]);
    else h.cursos.appendRow(fila);
    return respuesta(true, { id: id, estado: estado });
  } catch (e) {
    Logger.log("ERROR capGuardarCurso: " + e.toString());
    return respuesta(false, null, "Error guardando el curso: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Elimina el curso. El avance y los intentos de las personas se conservan como evidencia.
function capEliminarCurso(id, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    const np = capNegarGestor_(u); if (np) return np;
    lock.waitLock(20000);
    const h = capHojas_(SpreadsheetApp.openById(ID_HOJA));
    const c = capLeerCursos_(h.cursos).find(x => x.id === capTexto_(id));
    if (!c) return respuesta(false, null, "El curso no existe");
    anotarEliminado_(h.cursos, [h.cursos.getRange(c.fila, 1, 1, CAP_COLUMNAS.length).getValues()[0]]);
    h.cursos.deleteRow(c.fila);
    return respuesta(true, { id: c.id });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Informe de participantes de un curso
function capParticipantes(id, usuario) { seguridadRPC_();
  try {
    const u = usuarioSD(usuario);
    const np = capNegarGestor_(u); if (np) return np;
    const h = capHojas_(SpreadsheetApp.openById(ID_HOJA));
    const c = capLeerCursos_(h.cursos).find(x => x.id === capTexto_(id));
    if (!c) return respuesta(false, null, "El curso no existe");
    const prog = capLeerProgreso_(h.prog);
    const lista = capUsuariosActivos_().filter(x => capAsignado_(c, x)).map(x =>
      Object.assign({ usuario: x.usuario, nombre: x.nombre, cargo: x.cargo }, capResumen_(c, capProgresoDe_(prog, c.id, x.usuario))))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    lista.forEach(x => delete x.vistos);
    return respuesta(true, { curso: { id: c.id, titulo: c.titulo, categoria: c.categoria, color: c.color, fechaLimite: c.fechaLimite,
      notaMinima: c.notaMinima, intentosMax: c.intentosMax, preguntas: (c.evaluacion || []).length, recursos: capItems_(c).length }, participantes: lista });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  }
}

// Habilita un nuevo intento de evaluación a una persona que agotó los intentos
function capNuevoIntento(id, persona, usuario) { seguridadRPC_();
  const lock = LockService.getScriptLock();
  try {
    const u = usuarioSD(usuario);
    const np = capNegarGestor_(u); if (np) return np;
    lock.waitLock(20000);
    const h = capHojas_(SpreadsheetApp.openById(ID_HOJA));
    const p = capProgresoDe_(capLeerProgreso_(h.prog), capTexto_(id), persona);
    if (!p) return respuesta(false, null, "La persona aún no ha iniciado el curso");
    if (p.estado === "Aprobado") return respuesta(false, null, "La persona ya aprobó el curso");
    p.intentos = Math.max(0, (p.intentos || 0) - 1);
    if (p.estado === "Reprobado") p.estado = "En curso";
    capGuardarProgreso_(h.prog, p);
    return respuesta(true, { intentos: p.intentos });
  } catch (e) {
    return respuesta(false, null, "Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// Videos y material de apoyo (Drive). Más de CAP_MAX_MB: subirlo a Drive o YouTube y pegar el enlace.
function subirArchivoCapacitacion(nombre, tipo, base64, usuario) { seguridadRPC_();
  try {
    const np = capNegarGestor_(usuarioSD(usuario)); if (np) return np;
    if (!base64 || typeof base64 !== "string") return respuesta(false, null, "No se recibió el contenido del archivo. Vuelve a seleccionarlo.");
    const bytes = Utilities.base64Decode(base64);
    if (!bytes.length) return respuesta(false, null, "El archivo está vacío");
    if (bytes.length > CAP_MAX_MB * 1024 * 1024) return respuesta(false, null, "El archivo supera " + CAP_MAX_MB + " MB. Súbelo a Google Drive o YouTube y pega el enlace.");
    const archivo = carpetaSGC(CAP_CARPETA).createFile(Utilities.newBlob(bytes, tipo || "application/octet-stream", nombre));
    try { archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {
      Logger.log("No se pudo compartir el material (política del dominio): " + e.toString());
    }
    return respuesta(true, { url: archivo.getUrl(), nombre: archivo.getName() });
  } catch (e) {
    return respuesta(false, null, "Error subiendo el archivo: " + e.toString());
  }
}
