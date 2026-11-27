// ============================================================
// CONTRATOS DE LOS HOSPITALES Y ACUERDO DE DISCOLMETS → VENTAS (carga única)
//   1. Ejecuta  simularContratosServicios  → en el registro verás qué se cambia, sin escribir nada.
//   2. Ejecuta  aplicarContratosServicios  → registra los contratos y asocia cada SC con su contrato,
//      su orden de compra al tercero y los certificados que emitió el tercero.
// · Contratos leídos de la carpeta «Contratos» de Drive:
//     Hospital Universitario Hernando Moncaleano Perdomo · Contrato de prestación de servicios N° 169 de 2026
//     E.S.E. Hospital Tulia Durán de Borrero (Baraya)      · Contrato N° 54 de 2026
//     E.S.E. Hospital Nuestra Señora de Guadalupe          · Contrato N° 220 de 2026 (y el N° 024 de 2026, citado en la OT-016-26 y la SC-0015)
//     DISCOLMETS S.A.S. BIC                                · Acuerdo de servicio OF-GI-003-2026 (no es contrato: reemplaza el registro provisional N° 2)
// · Las SC de los hospitales quedan como servicio TERCERIZADO (laboratorio del proveedor), con su OC
//   (carpeta «Ordenes de Compra») y los certificados del tercero (carpeta «Certificados Emitidos Tercerizados»).
// · Se puede ejecutar de nuevo sin duplicar nada. Cuando termines, elimina este archivo del proyecto.
// ============================================================
const CSV_DRIVE = id => "https://drive.google.com/file/d/" + id + "/view";

// Contratos con su PDF en la carpeta «Contratos»
const CSV_CONTRATOS = [
  { num: "169 DE 2026", nit: "891.180.268-0", cliente: "HOSPITAL UNIVERSITARIO HERNANDO MONCALEANO PERDOMO", tipo: "Contrato público",
    objeto: "Prestación de servicios de mantenimiento preventivo, correctivo y calibración de equipos de la central de mezclas (Resolución 0444 de 2008)",
    inicio: "2026-04-13", fin: "2026-12-31", valor: 89995306, pdf: "1i9kSm-ShYI3sW-Pbjgaf-zes1Pn08_VV",
    obs: "Contrato de prestación de servicios firmado el 13/04/2026 (el encabezado del PDF dice «No. 169-2025»). Plazo: desde el acta de inicio hasta el 31/12/2026." },
  { num: "54 DE 2026", nit: "891.180.159-6", cliente: "E.S.E. Hospital Tulia Durán de Borrero", tipo: "Contrato público",
    objeto: "Prestación de servicios para la calibración metrológica de los equipos biomédicos y de diagnóstico médico de la E.S.E. Hospital Tulia Durán de Borrero de Baraya (Huila)",
    inicio: "2026-01-29", fin: "2026-03-29", valor: 11000000, pdf: "1eisTaO3jajwGUbdRCfBtUH2QaIItsjF5",
    obs: "Firmado el 29/01/2026. Plazo: dos (2) meses desde el acta de inicio (fecha de fin aproximada)." },
  { num: "220 DE 2026", nit: "813.007.875-9", cliente: "E.S.E. HOSPITAL NUESTRA SEÑORA DE GUADALUPE", tipo: "Contrato público",
    objeto: "Prestación de servicios profesionales para la calibración metrológica de los equipos biomédicos (dos calibraciones en el año)",
    inicio: "2026-08-29", fin: "2026-12-29", valor: 34584590, pdf: "1Bf9xJ_1YBF3y-Vr_pfRy9UdQMnsQCFLZ",
    obs: "Firmado el 29/08/2026. Plazo: cuatro (4) meses." },
  { num: "024 DE 2026", nit: "813.007.875-9", cliente: "E.S.E. HOSPITAL NUESTRA SEÑORA DE GUADALUPE", tipo: "Contrato público",
    objeto: "Contrato de prestación de servicios N° 024 de 2026 (calibración de equipos biomédicos)",
    inicio: "", fin: "", valor: "", pdf: "", estado: "Terminado",
    obs: "Citado en la OT-016-26 y en la SC-0015. El PDF no está en la carpeta «Contratos» de Drive: súbelo ahí para verlo en la trazabilidad." }
];
// Acuerdo de servicios de DISCOLMETS: se usa el contrato que ya está registrado para su NIT
// (circular OF-GI-003-2026 del 13/05/2026, «Acuerdo de servicios IMCOLMETRIC 2026.pdf» en la carpeta «Contratos»)
const CSV_DISCOLMETS = { nit: "828002423", tipo: "Acuerdo de servicio", num: "OF-GI-003-2026",
  objeto: "Acuerdo de servicio para la compra, calibración y/o mantenimiento de los equipos de medición (termohigrómetros, termómetros digitales, de punzón e infrarrojos, y calificación de neveras)",
  obs: "Acuerdo de servicio DISCOLMETS S.A.S. – IMCOLMETRIC S.A.S. (circular OF-GI-003-2026 del 13/05/2026). Entrega de equipos calibrados: máximo 8 días hábiles; pago a crédito 30 días. Documento: " + CSV_DRIVE("1uj4k723TTCYsP5lB9wJ5MK28eKWOPe8L") };

// SC de los hospitales: contrato, OC al tercero y certificados del tercero [equipo, N° certificado, proveedor]
const CSV_MEBI = "MEBI METROLOGÍA BIOMÉDICA S.A.", CSV_IMB = "INSTITUTO DE METROLOGÍA BIOMÉDICA (H. U. SAN VICENTE FUNDACIÓN)",
  CSV_MC = "METROLOGICAL CENTER S.A.S.", CSV_PAC = "PAC SERVICES PESAJE AUTOMATIZACIÓN & CONTROL", CSV_SYG = "SET Y GAD S.A.S.";
const CSV_SERVICIOS = [
  // Moncaleano · contrato 169 (las OC dicen «Calibración de equipos contrato 169 de 2026 HUHMP»)
  { id: "2026-0060", cliente: /MONCALEANO/, contrato: "169 DE 2026", ocs: ["OC-00016-26"], prov: [CSV_MC],
    certs: [["Medidor de presión diferencial (W41AE KV)", "P26-336", CSV_MC], ["Medidor de presión diferencial (W41AE MG)", "P26-337", CSV_MC]] },
  { id: "2026-0129", cliente: /MONCALEANO/, contrato: "169 DE 2026", ocs: ["OC-00025-26", "OC-00031-26"], prov: [CSV_MC],
    certs: [["Medidor de presión diferencial (S09020359)", "P26-491", CSV_MC], ["Medidor de presión diferencial (W40AE KS)", "P26-492", CSV_MC], ["Medidor de presión diferencial", "P26-493", CSV_MC]] },
  { id: "2026-0125", cliente: /MONCALEANO/, contrato: "169 DE 2026", ocs: ["OC-00035-26", "OC-00046-26", "OC-00052-26", "OC-00058-26"], prov: [CSV_PAC, CSV_MC], certs: [] },
  // Baraya · contrato 54
  { id: "2026-0024", cliente: /TULIA/, contrato: "54 DE 2026", ocs: [], prov: [CSV_MEBI, CSV_IMB],
    certs: [["Micropipeta analógica BRAND 100-1000 µL (01F66194)", "318005", CSV_MEBI], ["Micropipeta analógica 20-200 µL", "318006", CSV_MEBI],
      ["Micropipeta analógica 100-1000 µL", "318009", CSV_MEBI], ["Pipeta de volumen fijo BRAND 10 µL (01G27705)", "EA-14257-26", CSV_IMB]] },
  { id: "2026-0025", cliente: /TULIA/, contrato: "54 DE 2026", ocs: [], prov: [], certs: [] },
  // Guadalupe · contrato 024 (marzo) y contrato 220 (septiembre en adelante)
  { id: "2026-0045", cliente: /GUADALUPE/, contrato: "024 DE 2026", ocs: [], prov: [CSV_MEBI],
    certs: [["Micropipeta analógica BOECO 100-1000 µL (9039038)", "315058", CSV_MEBI], ["Micropipeta analógica", "315059", CSV_MEBI],
      ["Micropipeta analógica", "315060", CSV_MEBI], ["Micropipeta analógica", "315061", CSV_MEBI]] },
  { id: "2026-0047", cliente: /GUADALUPE/, contrato: "024 DE 2026", ocs: [], prov: [], certs: [] },
  { id: "2026-0117", cliente: /GUADALUPE/, contrato: "220 DE 2026", ocs: ["OC-00043-26"], prov: [CSV_SYG],
    certs: [["Micropipeta monocanal HUMAN 5 µL (01G31407)", "LG7709-26", CSV_SYG], ["Micropipeta monocanal 5 µL (CS50406)", "LG7809-26", CSV_SYG]] },
  { id: "2026-0128", cliente: /GUADALUPE/, contrato: "220 DE 2026", ocs: [], prov: [], certs: [] }
];

function simularContratosServicios() { return csvCargar_(true); }
function aplicarContratosServicios() { return csvCargar_(false); }

function csvCargar_(simular) {
  if (typeof RPC_ !== "undefined" && RPC_.activo) throw new Error("La carga solo se ejecuta desde el editor de Apps Script.");
  if (typeof ventasLeer_ !== "function" || typeof ventasActualizarFila_ !== "function") throw new Error("El módulo de Ventas no está en el proyecto.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const txt = v => String(v == null ? "" : v).trim();
    const norm = v => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    const claveK = n => norm(n).replace(/[^A-Z0-9]/g, "");
    const claveNit = n => { const t = txt(n), b = t.indexOf("-") > 0 ? t.slice(0, t.indexOf("-")) : t; return b.replace(/\D/g, ""); };
    const fecha = v => { const m = txt(v).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : ""; };
    const ahora = new Date();
    const log = [];
    if (!simular && typeof ventasAsegurarColumnas_ === "function") { try { ventasAsegurarColumnas_("SOLICITUDES"); } catch (e) {} }

    // ---- 1. Contratos ----
    const contratos = ventasLeer_("CONTRATOS");
    CSV_CONTRATOS.forEach(k => {
      const ex = contratos.find(x => claveK(x.NUM_CONTRATO) === claveK(k.num));
      const datos = { NUM_CONTRATO: k.num, CLIENTE_NIT: k.nit, CLIENTE: k.cliente, TIPO: k.tipo, OBJETO: k.objeto,
        F_INICIO: fecha(k.inicio), F_FIN: fecha(k.fin), VALOR: k.valor, ESTADO: k.estado || "Vigente",
        OBSERVACIONES: k.obs + (k.pdf ? " Documento: " + CSV_DRIVE(k.pdf) : "") };
      log.push((ex ? "Contrato actualizado: " : "Contrato nuevo: ") + k.num + " · " + k.cliente);
      if (simular) return;
      if (ex) ventasActualizarFila_("CONTRATOS", ex._fila, datos);
      else { datos.F_REGISTRO = ahora; ventasInsertar_("CONTRATOS", datos); }
    });
    const disc = contratos.find(x => claveNit(x.CLIENTE_NIT) === CSV_DISCOLMETS.nit);
    if (disc) {
      log.push("DISCOLMETS: el registro N° " + disc.NUM_CONTRATO + " (" + disc.TIPO + ") queda como Acuerdo de servicio N° " + CSV_DISCOLMETS.num);
      if (!simular) ventasActualizarFila_("CONTRATOS", disc._fila, { NUM_CONTRATO: CSV_DISCOLMETS.num, TIPO: CSV_DISCOLMETS.tipo, OBJETO: CSV_DISCOLMETS.objeto, OBSERVACIONES: CSV_DISCOLMETS.obs, ESTADO: disc.ESTADO || "Vigente",
        VALOR: Number(disc.VALOR) === 500 ? "" : disc.VALOR });   // 500 era un valor provisional: el acuerdo es por tarifas
    } else log.push("⚠ No hay un contrato registrado para DISCOLMETS (NIT " + CSV_DISCOLMETS.nit + "): sus SC no se asocian.");

    // ---- 2. SC de los hospitales ----
    const sols = ventasLeer_("SOLICITUDES");
    const terc = ventasLeer_("TERCERIZADOS");
    let nTerc = 0, nSC = 0;
    let sigTer = (terc.reduce((m, t) => { const x = txt(t.ID_TERC).match(/(\d+)$/); return x ? Math.max(m, Number(x[1])) : m; }, 0));
    CSV_SERVICIOS.forEach(d => {
      const s = sols.find(x => txt(x.ID) === d.id);
      if (!s) { log.push("⚠ " + d.id + ": no está en Ventas (no se toca)."); return; }
      if (!d.cliente.test(norm(s.CLIENTE))) { log.push("⚠ " + d.id + ": el cliente es «" + s.CLIENTE + "» (no se toca)."); return; }
      const ref = [txt(s.CONSECUTIVO_FO004), txt(s.NUM_OT)].filter(Boolean).join(" / ") || d.id;
      const cambios = { TIPO_ACEPTACION: "Contrato público", NUM_CONTRATO: d.contrato, TERCERIZADO: "SI",
        MODALIDAD_TERCERO: txt(s.MODALIDAD_TERCERO) || "Laboratorio", F_ACTUALIZACION: ahora };
      if (d.ocs.length) cambios.NUM_OC_TERCERO = d.ocs.join(", ");
      if (d.prov.length) cambios.PROVEEDOR_TERCERO = d.prov.join("; ");
      nSC++;
      log.push(d.id + " (" + ref + ") → contrato " + d.contrato + " · tercerizado" + (d.ocs.length ? " · " + d.ocs.join(", ") : " · sin OC en Drive") +
        (d.certs.length ? " · certificados " + d.certs.map(c => c[1]).join(", ") : ""));
      const nuevos = d.certs.filter(c => !terc.some(t => txt(t.ID_SOLICITUD) === d.id && claveK(t.NUM_CERTIFICADO) === claveK(c[1])));
      nTerc += nuevos.length;
      if (simular) return;
      ventasActualizarFila_("SOLICITUDES", s._fila, cambios);
      nuevos.forEach(c => {
        sigTer++;
        ventasInsertar_("TERCERIZADOS", { ID_TERC: "TER-" + ("00000" + sigTer).slice(-5), ID_SOLICITUD: d.id, ID_EQUIPO: "", EQUIPO: c[0], PROVEEDOR: c[2],
          NUM_GCO_FO_006: "", NUM_CERTIFICADO: c[1], CERT_REVISADO: "", ESTADO: "Certificado recibido",
          OBSERVACIONES: "Certificado del tercero en «Certificados Emitidos Tercerizados»" + (d.ocs.length ? " · " + d.ocs.join(", ") : "") + " · contrato " + d.contrato });
      });
      if (typeof ventasLog_ === "function") ventasLog_(d.id, "Asociación al contrato " + d.contrato + " (servicio tercerizado)", s.ESTADO, s.ESTADO,
        (d.ocs.length ? "OC " + d.ocs.join(", ") + ". " : "") + (d.certs.length ? "Certificados del tercero: " + d.certs.map(c => c[1]).join(", ") + "." : ""));
    });

    // ---- 3. SC de DISCOLMETS bajo el acuerdo de servicios ----
    let nDisc = 0;
    const numDisc = disc ? [claveK(disc.NUM_CONTRATO), claveK(CSV_DISCOLMETS.num)] : [];
    if (disc) sols.forEach(s => {
      if (claveNit(s.CLIENTE_NIT) !== CSV_DISCOLMETS.nit && !/DISCOLMET/.test(norm(s.CLIENTE))) return;
      if (/desist/i.test(txt(s.ESTADO)) || !(txt(s.NUM_OT) || txt(s.CONSECUTIVO_FO004) || s.F_ACEPTADA)) return;
      if (claveK(s.NUM_CONTRATO) === claveK(CSV_DISCOLMETS.num) && txt(s.TIPO_ACEPTACION) === CSV_DISCOLMETS.tipo) return;
      if (txt(s.NUM_CONTRATO) && numDisc.indexOf(claveK(s.NUM_CONTRATO)) === -1) { log.push("⚠ " + s.ID + " (DISCOLMETS) ya tiene el contrato «" + s.NUM_CONTRATO + "» (no se toca)."); return; }
      nDisc++;
      if (!simular) ventasActualizarFila_("SOLICITUDES", s._fila, { TIPO_ACEPTACION: CSV_DISCOLMETS.tipo, NUM_CONTRATO: CSV_DISCOLMETS.num, F_ACTUALIZACION: ahora });
    });

    // ---- 4. Registro provisional «1» de Guadalupe: reemplazado por los contratos reales ----
    const prov = contratos.find(x => claveK(x.NUM_CONTRATO) === "1" && claveNit(x.CLIENTE_NIT) === "813007875");
    if (prov) {
      const usados = CSV_SERVICIOS.map(d => d.id);
      const quedan = sols.filter(s => claveK(s.NUM_CONTRATO) === "1" && usados.indexOf(txt(s.ID)) === -1);
      if (!quedan.length) {
        log.push("Contrato provisional N° 1 de Guadalupe → Anulado (reemplazado por 024 DE 2026 y 220 DE 2026)");
        if (!simular) ventasActualizarFila_("CONTRATOS", prov._fila, { ESTADO: "Anulado", OBSERVACIONES: "Registro provisional reemplazado por los contratos 024 DE 2026 y 220 DE 2026." });
      } else log.push("⚠ El contrato provisional N° 1 sigue en uso por: " + quedan.map(s => s.ID).join(", ") + " (no se anula).");
    }

    const texto = "Simulación: " + (simular ? "SÍ (no se escribió nada)" : "NO") +
      "\nSC de hospitales asociadas: " + nSC + " · certificados del tercero nuevos: " + nTerc + " · SC de DISCOLMETS bajo el acuerdo de servicio: " + nDisc +
      (typeof VENTAS_CFG !== "undefined" && (VENTAS_CFG.TIPOS_CONTRATO || []).indexOf("Acuerdo de servicio") === -1 ? "\n⚠ Agrega 'Acuerdo de servicio' a TIPOS_ACEPTACION y TIPOS_CONTRATO en Ventas.gs (líneas de VENTAS_CFG)." : "") +
      "\n" + log.join("\n");
    Logger.log(texto);
    if (!simular) SpreadsheetApp.flush();
    return texto;
  } finally {
    lock.releaseLock();
  }
}
