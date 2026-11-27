/**
 * =====================================================================================
 *  IMCOLMETRIC S.A.S. - SISTEMA DE GESTIÓN DE CALIDAD (SGC)
 *  MÓDULO: VENTAS DE SERVICIOS                              Archivo: Ventasvista.gs
 * =====================================================================================
 *  Interfaz del módulo (HTML + CSS + JS). El portal (index.html) la pide con ventasVista()
 *  y la muestra dentro de un marco, así sus estilos y funciones no se cruzan con Calidad ni Compras.
 *  Todas las llamadas al servidor pasan por ventasLlamar(usuario, función, argumentos).
 *
 *  Vistas: Tablero (Kanban) | Nueva solicitud | Cotizaciones | Detalle de servicio |
 *          Clientes (con contratos) | Postventa | Importar (clientes, contratos y OT)
 *
 *  Nota técnica: el HTML se devuelve como String.raw. El código del cliente NO usa
 *  comillas invertidas ni la secuencia dólar-llave para no interferir con la plantilla.
 * =====================================================================================
 */

function ventasVistaHtml_() {
  return String.raw`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ventas de Servicios - IMCOLMETRIC</title>
<style>
  :root{
    --azul:#0b3d6b; --azul2:#145a9c; --celeste:#e8f1fa; --gris:#f4f6f9; --borde:#d9e0e8; --texto:#1f2d3d; --suave:#5d6b7a;
    --verde:#1e9e5a; --amarillo:#e0a800; --rojo:#d63b3b; --gristono:#9aa5b1; --blanco:#fff;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;color:var(--texto);background:var(--gris)}
  header{background:var(--azul);color:#fff;padding:10px 16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  header h1{font-size:17px;margin:0;font-weight:600}
  header .sub{font-size:11px;opacity:.8}
  nav{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
  nav button{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px}
  nav button.activo,nav button:hover{background:#fff;color:var(--azul)}
  main{padding:14px 16px}
  .vista{display:none}.vista.activa{display:block}
  .barra{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;background:#fff;padding:10px;border:1px solid var(--borde);border-radius:6px}
  .barra label{display:flex;flex-direction:column;font-size:11px;color:var(--suave);gap:2px}
  input,select,textarea{font:inherit;padding:5px 7px;border:1px solid var(--borde);border-radius:4px;background:#fff;color:var(--texto);min-width:0}
  textarea{resize:vertical;min-height:54px}
  input:focus,select:focus,textarea:focus{outline:2px solid var(--azul2);outline-offset:-1px}
  .btn{background:var(--azul2);color:#fff;border:none;border-radius:4px;padding:7px 13px;cursor:pointer;font-size:12px;white-space:nowrap}
  .btn:hover{filter:brightness(1.1)}
  .btn.sec{background:#fff;color:var(--azul2);border:1px solid var(--azul2)}
  .btn.ok{background:var(--verde)}.btn.peligro{background:var(--rojo)}.btn.mini{padding:3px 8px;font-size:11px}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .tarjeta{background:#fff;border:1px solid var(--borde);border-radius:6px;padding:12px;margin-bottom:12px}
  .tarjeta h3{margin:0 0 10px;font-size:14px;color:var(--azul)}
  .grid{display:grid;gap:10px}
  .g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .campo{display:flex;flex-direction:column;gap:3px}.campo>span{font-size:11px;color:var(--suave)}
  .campo.req>span:after{content:" *";color:var(--rojo)}
  .col2{grid-column:span 2}.col3{grid-column:span 3}.col4{grid-column:1/-1}
  @media (max-width:900px){.g2,.g3,.g4{grid-template-columns:1fr}.col2,.col3{grid-column:auto}}
  /* Kanban */
  .kanban{display:flex;gap:10px;overflow-x:auto;padding-bottom:10px;align-items:flex-start}
  .columna{flex:0 0 235px;background:#e9edf2;border-radius:6px;padding:8px;max-height:calc(100vh - 200px);overflow-y:auto}
  .columna h4{margin:0 0 8px;font-size:12px;display:flex;justify-content:space-between;color:var(--azul)}
  .columna h4 .n{background:var(--azul);color:#fff;border-radius:10px;padding:0 7px;font-size:11px}
  .tk{background:#fff;border-radius:5px;padding:8px;margin-bottom:7px;border-left:4px solid var(--gristono);cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.06)}
  .tk:hover{box-shadow:0 2px 6px rgba(0,0,0,.15)}
  .tk.verde{border-left-color:var(--verde)}.tk.amarillo{border-left-color:var(--amarillo)}.tk.rojo{border-left-color:var(--rojo)}
  .tk .id{font-weight:600;color:var(--azul2)}.tk .cli{margin:2px 0;font-weight:500}.tk .meta{font-size:11px;color:var(--suave);display:flex;justify-content:space-between;gap:4px}
  .tk .flag{font-size:10px;background:#fff3cd;color:#7a5a00;border-radius:3px;padding:1px 4px;margin-top:4px;display:inline-block}
  .sem{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--gristono);vertical-align:middle}
  .sem.verde{background:var(--verde)}.sem.amarillo{background:var(--amarillo)}.sem.rojo{background:var(--rojo)}
  /* tablas */
  .tabla-cont{overflow-x:auto;background:#fff;border:1px solid var(--borde);border-radius:6px}
  table{border-collapse:collapse;width:100%}
  th,td{padding:6px 8px;border-bottom:1px solid var(--borde);text-align:left;vertical-align:top}
  th{background:var(--celeste);color:var(--azul);font-weight:600;font-size:11px;position:sticky;top:0;white-space:nowrap}
  tr.click{cursor:pointer}tr.click:hover td{background:#f6f9fc}
  td.num,th.num{text-align:right;white-space:nowrap}
  .eq-tabla input,.eq-tabla select{width:100%;padding:3px 4px;font-size:12px}
  .eq-tabla td{padding:3px}
  .eq-tabla select[data-k=MAGNITUD]{min-width:170px}.eq-tabla select[data-k=TIPO_SERVICIO]{min-width:105px}
  .chip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:var(--celeste);color:var(--azul);white-space:nowrap}
  .chip.verde{background:#dff4e8;color:#14683c}.chip.rojo{background:#fbe1e1;color:#8f1f1f}.chip.amarillo{background:#fff3cd;color:#7a5a00}
  .aviso{padding:8px 10px;border-radius:5px;margin:8px 0;font-size:12px}
  .aviso.adv{background:#fff3cd;border:1px solid #f0d58a;color:#6b4e00}
  .aviso.err{background:#fbe1e1;border:1px solid #f0b0b0;color:#7c1d1d}
  .aviso.info{background:var(--celeste);border:1px solid #bcd3ea;color:var(--azul)}
  .aviso.ok{background:#ecfdf3;border:1px solid #b7e4c7;color:#166534}
  p.ayuda{font-size:12px;color:var(--suave);margin:4px 0 6px;line-height:1.4}
  .im-subir{display:flex;gap:12px;align-items:center;border:2px dashed var(--borde);border-radius:8px;padding:10px 12px;margin:8px 0;font-size:12px;color:var(--suave)}
  .im-subir.sobre{border-color:var(--azul);background:#eef4fb}
  .im-subir .btn{white-space:nowrap;cursor:pointer}
  #im-arch-res div{font-size:12px;padding:3px 0}
  .is-card{border:1px solid var(--borde);border-radius:8px;padding:12px;margin-top:12px;background:#fbfcfe}
  .is-card .is-tit{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;font-weight:600;color:var(--azul)}
  .is-card .is-tit a{font-weight:400;font-size:12px}
  .is-card h4{margin:12px 0 6px;font-size:13px;color:var(--azul)}
  .ruta{border:1px solid var(--borde);border-radius:8px;padding:10px 12px;margin-top:10px;background:#fbfcfe}
  .ruta .rt-cab{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .ruta-et{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:8px}
  .ruta-et span{padding:4px 10px;border-radius:999px;font-size:12px;border:1px solid #cfd8e3;background:#fff;color:var(--suave)}
  .ruta-et span.ok{background:#ecfdf3;border-color:#b7e4c7;color:#166534}
  .ruta-et span.sig{background:#fff7e0;border-color:#f3d27a;color:#7a5600;font-weight:600}
  .ruta-et i{color:#9aa9bb;font-style:normal}
  .ns-modos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .ns-modo{display:flex;gap:10px;align-items:flex-start;border:2px solid #dbe3ec;border-radius:10px;padding:12px;cursor:pointer;background:#fff}
  .ns-modo.on{border-color:var(--azul);background:#f2f7fd}
  .ns-modo input{margin-top:3px}
  .ns-modo b{display:block;font-size:13px}
  .ns-modo small{display:block;font-size:12px;color:#5b6b7f;margin-top:2px;line-height:1.35}
  @media (max-width:700px){.ns-modos{grid-template-columns:1fr}}
  /* detalle */
  .det-cab{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
  .det-cab .grande{font-size:20px;font-weight:700;color:var(--azul)}
  .subtabs{display:flex;gap:2px;border-bottom:2px solid var(--borde);margin:12px 0;flex-wrap:wrap}
  .subtabs button{background:none;border:none;padding:8px 12px;cursor:pointer;color:var(--suave);font-size:12px;border-bottom:2px solid transparent;margin-bottom:-2px}
  .subtabs button.activo{color:var(--azul);border-bottom-color:var(--azul);font-weight:600}
  .subvista{display:none}.subvista.activa{display:block}
  .timeline{list-style:none;padding:0;margin:0;position:relative}
  .timeline:before{content:"";position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--borde)}
  .timeline li{position:relative;padding:0 0 12px 26px}
  .timeline li:before{content:"";position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:var(--azul2);border:2px solid #fff}
  .timeline li.post:before{background:var(--amarillo)}
  .timeline .f{font-size:11px;color:var(--suave)}
  .hitos{display:flex;gap:0;flex-wrap:wrap;margin:6px 0 4px}
  .hito{flex:1;min-width:90px;text-align:center;font-size:10px;color:var(--suave);position:relative;padding-top:18px}
  .hito:before{content:"";position:absolute;top:5px;left:50%;width:10px;height:10px;border-radius:50%;background:#cfd7e0;transform:translateX(-50%)}
  .hito.hecho:before{background:var(--verde)}.hito.hecho{color:var(--texto)}
  .hito b{display:block;font-size:11px}
  .acciones{display:flex;gap:6px;flex-wrap:wrap}
  /* KPI */
  .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-bottom:12px}
  .kpi{background:#fff;border:1px solid var(--borde);border-radius:6px;padding:10px;border-top:3px solid var(--azul2)}
  .kpi .v{font-size:22px;font-weight:700;color:var(--azul)}.kpi .n{font-size:11px;color:var(--suave)}
  .kpi.cumple{border-top-color:var(--verde)}.kpi.nocumple{border-top-color:var(--rojo)}
  .barras .fila{display:grid;grid-template-columns:200px 1fr 70px;gap:8px;align-items:center;margin:4px 0;font-size:12px}
  .barras .b{height:14px;background:var(--azul2);border-radius:3px;min-width:2px}
  @media (max-width:700px){.barras .fila{grid-template-columns:110px 1fr 50px}}
  /* modal */
  .modal-fondo{position:fixed;inset:0;background:rgba(10,25,45,.45);display:none;align-items:flex-start;justify-content:center;z-index:50;overflow-y:auto;padding:30px 10px}
  .modal-fondo.ver{display:flex}
  .modal{background:#fff;border-radius:8px;width:min(720px,100%);box-shadow:0 10px 40px rgba(0,0,0,.3)}
  .modal .mh{padding:12px 16px;border-bottom:1px solid var(--borde);font-weight:600;color:var(--azul);display:flex;justify-content:space-between}
  .modal .mb{padding:14px 16px}.modal .mf{padding:10px 16px;border-top:1px solid var(--borde);display:flex;justify-content:flex-end;gap:8px}
  .x{cursor:pointer;border:none;background:none;font-size:18px;color:var(--suave)}
  #cargando{position:fixed;top:10px;right:10px;background:var(--azul);color:#fff;padding:6px 12px;border-radius:4px;display:none;z-index:99;font-size:12px}
  #toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:5px;color:#fff;display:none;z-index:99;max-width:90%}
  .vacio{color:var(--suave);font-style:italic;padding:8px}
  .derecha{margin-left:auto}
  a{color:var(--azul2)}
</style>
</head>
<body>
<header>
  <div>
    <h1>Ventas de Servicios</h1>
    <div class="sub">IMCOLMETRIC S.A.S. · SGC · ISO/IEC 17025 §7.1 · GCV</div>
  </div>
  <nav id="nav">
    <button data-v="tablero" class="activo">Tablero</button>
    <button data-v="nueva">Nueva solicitud</button>
    <button data-v="cotizaciones">Cotizaciones</button>
    <button data-v="detalle">Detalle</button>
    <button data-v="clientes">Clientes</button>
    <button data-v="postventa">Postventa</button>
    <button data-v="importar">Importar OT</button>
  </nav>
</header>

<main>
  <!-- ============================ TABLERO ============================ -->
  <section id="v-tablero" class="vista activa">
    <div class="barra">
      <label>Comercial<select id="tb-comercial"><option value="">Todos</option></select></label>
      <label>Buscar<input id="tb-texto" placeholder="ID, cliente, OT, contrato"></label>
      <label><span>&nbsp;</span><button class="btn" onclick="cargarTablero()">Actualizar</button></label>
      <label class="derecha"><span>Semáforo</span>
        <span><span class="sem verde"></span> en plazo &nbsp;<span class="sem amarillo"></span> por vencer &nbsp;<span class="sem rojo"></span> vencido &nbsp;<span class="sem"></span> sin plazo</span></label>
      <label><span>&nbsp;</span><span><input type="checkbox" id="tb-cerradas"> Mostrar cerradas por desistimiento</span></label>
    </div>
    <div id="kanban" class="kanban"></div>
  </section>

  <!-- ========================= NUEVA SOLICITUD ======================== -->
  <section id="v-nueva" class="vista">
    <div class="tarjeta">
      <h3>Tipo de ingreso</h3>
      <div class="ns-modos">
        <label class="ns-modo"><input type="radio" name="ns-modo" value="cotizacion" checked onchange="modoNueva()"><span><b>Solicitud con cotización</b><small>Flujo normal: revisión de requisitos, cotización, seguimiento y aceptación.</small></span></label>
        <label class="ns-modo"><input type="radio" name="ns-modo" value="contrato" onchange="modoNueva()"><span><b>Orden de servicio por contrato</b><small>Cliente con contrato vigente: sin cotización. Se asigna la OT de inmediato y queda lista para programar.</small></span></label>
      </div>
      <div id="ns-contrato" class="grid g4" style="display:none;margin-top:12px">
        <label class="campo req"><span>Tipo</span><select id="ns-ktipo" onchange="if(this.value==='Contrato público') setv('ns-tipo','Público')"></select></label>
        <label class="campo req"><span>N° de contrato</span><input id="ns-knum" list="dl-contratos" placeholder="Ej.: CT-045-2026"></label>
        <label class="campo"><span>N° orden de servicio del cliente</span><input id="ns-kos" placeholder="Opcional"></label>
        <label class="campo"><span>Llegada de los equipos</span><input type="date" id="ns-kllegada"></label>
        <div class="aviso info col4">La revisión de requisitos y la aceptación se hicieron al firmar el contrato, por eso no se genera cotización (GCV-FO-003). La orden de trabajo (OT) usará el número del contrato como referencia (5.7) y el Almacén podrá recibir los equipos con esa OT.</div>
      </div>
      <datalist id="dl-contratos"></datalist>
    </div>
    <div class="tarjeta">
      <h3>1. Recepción de la solicitud (5.1)</h3>
      <div class="grid g4">
        <label class="campo req"><span>Fecha de recepción</span><input type="date" id="ns-fecha"></label>
        <label class="campo req"><span>Canal</span><select id="ns-canal"></select></label>
        <label class="campo req"><span>Comercial responsable</span><input id="ns-comercial" autocomplete="off" placeholder="Escriba el nombre del comercial"></label>
        <label class="campo"><span>Lugar del servicio</span><select id="ns-lugar"></select></label>
        <label class="campo col4"><span>Referencia / asunto</span><input id="ns-ref" placeholder="Ej.: Calibración de termohigrómetros sede norte"></label>
      </div>
    </div>
    <div class="tarjeta">
      <h3>2. Cliente</h3>
      <div class="grid g4">
        <label class="campo req"><span>NIT / Identificación</span><input id="ns-nit" list="dl-clientes" placeholder="Escriba para buscar"></label>
        <label class="campo req col2"><span>Nombre o razón social</span><input id="ns-nombre"></label>
        <label class="campo"><span>Tipo</span><select id="ns-tipo"></select></label>
        <label class="campo"><span>Contacto</span><input id="ns-contacto"></label>
        <label class="campo"><span>Teléfono / WhatsApp</span><input id="ns-tel"></label>
        <label class="campo"><span>Correo</span><input id="ns-correo" type="email"></label>
        <label class="campo"><span>Ciudad</span><input id="ns-ciudad"></label>
        <label class="campo col2"><span>Dirección</span><input id="ns-dir"></label>
        <label class="campo col2"><span>Correo de facturación</span><input id="ns-correofac" type="email"></label>
      </div>
      <datalist id="dl-clientes"></datalist>
    </div>
    <div class="tarjeta">
      <h3>3. Equipos / servicios solicitados</h3>
      <div class="aviso info">El plazo de entrega se calcula automáticamente según la magnitud: 8 días hábiles (propio) o 15 días hábiles (tercerizado), contados desde el día siguiente a la llegada del equipo.</div>
      <div id="ns-equipos"></div>
    </div>
    <div class="tarjeta">
      <h3>4. Declaración de conformidad (5.7.1)</h3>
      <div id="ns-conf"></div>
    </div>
    <div class="tarjeta">
      <label class="campo"><span>Observaciones</span><textarea id="ns-obs"></textarea></label>
      <div class="acciones" style="margin-top:10px">
        <button class="btn ok" onclick="guardarSolicitud()">Registrar solicitud</button>
        <button class="btn sec" onclick="limpiarNueva()">Limpiar</button>
      </div>
    </div>
  </section>

  <!-- =========================== COTIZACIONES ========================= -->
  <section id="v-cotizaciones" class="vista">
    <div class="barra">
      <label>Cliente<input id="ct-cliente" placeholder="Nombre o NIT"></label>
      <label>Estado<select id="ct-estado"><option value="">Todos</option></select></label>
      <label>Comercial<select id="ct-comercial"><option value="">Todos</option></select></label>
      <label>Desde<input type="date" id="ct-desde"></label>
      <label>Hasta<input type="date" id="ct-hasta"></label>
      <label>Texto<input id="ct-texto" placeholder="ID, OT, contrato"></label>
      <label><span>&nbsp;</span><button class="btn" onclick="cargarCotizaciones()">Filtrar</button></label>
      <label><span>&nbsp;</span><button class="btn sec" onclick="exportarCSV()">Exportar CSV</button></label>
    </div>
    <div class="tabla-cont"><table id="ct-tabla"></table></div>
  </section>

  <!-- ============================ DETALLE ============================= -->
  <section id="v-detalle" class="vista">
    <div class="barra">
      <label>ID de solicitud<input id="dt-id" placeholder="2026-0001"></label>
      <label><span>&nbsp;</span><button class="btn" onclick="abrirDetalle(val('dt-id'))">Abrir</button></label>
    </div>
    <div id="dt-cont"><div class="vacio">Seleccione una solicitud desde el tablero o el listado de cotizaciones.</div></div>
  </section>

  <!-- ============================ CLIENTES ============================ -->
  <section id="v-clientes" class="vista">
    <div class="barra">
      <label>Buscar<input id="cl-buscar" placeholder="Nombre, NIT, ciudad" oninput="pintarClientes()"></label>
      <label><span>&nbsp;</span><button class="btn" onclick="cargarClientes()">Actualizar</button></label>
      <label><span>&nbsp;</span><button class="btn ok" onclick="formCliente()">+ Nuevo cliente</button></label>
    </div>
    <div class="tabla-cont"><table id="cl-tabla"></table></div>
  </section>

  <!-- ============================ POSTVENTA =========================== -->
  <section id="v-importar" class="vista">
    <div class="tarjeta">
      <h3>Paso 1 · Solicitudes de los clientes (CS) y solicitudes de calibración (PDF / Excel)</h3>
      <div class="aviso info">Siga el orden del procedimiento GCV-PR-001:
        <b>1.</b> la <b>solicitud del cliente</b> (correo, carta o pedido de cotización) crea la solicitud «Recibida» → revisión de requisitos → cotización → aceptación;
        <b>2.</b> la <b>solicitud de calibración GCV-FO-004 (SC)</b> que el cliente diligencia después se registra en <b>su cotización aceptada</b> (o en su OT / contrato) y no crea otra solicitud.
        El sistema reconoce el tipo de documento, lee el cliente y los equipos (PDF con IA; el GCV-FO-004 en Excel se lee directo), y guarda el archivo en Drive como soporte.</div>
      <div class="im-subir" id="is-zona">
        <label class="btn">📄 Subir solicitudes o SC<input type="file" id="is-arch" multiple accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.xlsm" style="display:none" onchange="isArchivos(this.files);this.value=''"></label>
        <span>o arrastre aquí los archivos: PDF, foto o el GCV-FO-004 en Excel (uno por solicitud, máximo 19 MB cada uno).</span>
      </div>
      <div id="is-lista"></div>
    </div>
    <div class="tarjeta">
      <h3>Cotizaciones (GCV-FO-003) — PDF, Word o Excel</h3>
      <div class="aviso info">Cargue la cotización enviada al cliente y asóciela a su <b>SC</b> y/o <b>OT</b> (o a la solicitud de la cotización). El archivo queda en Drive enlazado al paquete y su valor total queda como valor de la venta.
        El PDF se lee con IA; del Excel se toman el número, el cliente y los totales; del Word, el número que tenga el nombre del archivo. Si la SC y la OT escritas no son del mismo paquete, o el cliente no coincide, el sistema lo avisa.</div>
      <div class="im-subir" id="cz-zona">
        <label class="btn">💲 Subir cotizaciones<input type="file" id="cz-arch" multiple accept=".pdf,.doc,.docx,.xlsx,.xls,.xlsm,.jpg,.jpeg,.png" style="display:none" onchange="czArchivos(this.files);this.value=''"></label>
        <span>o arrastre aquí los archivos (PDF, Word o Excel; máximo 19 MB cada uno).</span>
      </div>
      <div id="cz-lista"></div>
    </div>
    <div class="tarjeta">
      <h3>Cargar clientes y contratos</h3>
      <div class="aviso info">Copie desde Excel la base de clientes y, si los hay, sus contratos. Un cliente ya registrado (mismo NIT, con o sin dígito de verificación) no se duplica: solo se completan sus datos.
        Si el nombre se parece al de otro cliente con NIT distinto (p. ej. «ESE HOSPITAL GUADALUPE» y «HOSPITAL GUADALUPE») el sistema le pedirá confirmar si es el mismo cliente o uno nuevo.</div>
      <p class="ayuda" style="margin-top:10px">Clientes — columnas: <b>NIT · Nombre o razón social · Tipo (Privado/Público) · Contacto · Teléfono · Correo · Dirección · Ciudad · Correo de facturación</b></p>
      <textarea id="ic-cl" rows="6" placeholder="Pegue aquí los clientes (Ctrl+V)" style="width:100%;font-family:monospace;font-size:12px"></textarea>
      <p class="ayuda" style="margin-top:10px">Contratos — columnas: <b>NIT del cliente · N° de contrato · Tipo (privado/público/orden de servicio) · Objeto · Fecha inicio · Fecha fin · Valor · Estado</b></p>
      <textarea id="ic-k" rows="4" placeholder="Pegue aquí los contratos (opcional)" style="width:100%;font-family:monospace;font-size:12px"></textarea>
      <div class="acciones" style="margin-top:8px"><button class="btn sec" onclick="icImportar(true)">Revisar</button><button class="btn ok" onclick="icImportar(false)">Importar clientes y contratos</button></div>
      <div id="ic-res" style="margin-top:12px"></div>
    </div>
    <div class="tarjeta">
      <h3>Paso 2 · Cargar las órdenes de trabajo que ya existen (después de las CS)</h3>
      <div class="aviso adv"><b>Orden de carga:</b> <b>1.</b> cargue primero las <b>solicitudes de los clientes (CS)</b> en el recuadro de arriba; <b>2.</b> después importe aquí las <b>OT</b>.
        Al revisar o importar, el sistema le pide <b>asociar cada OT a su CS</b>: el número de la CS no tiene que coincidir con el de la OT (la CS 001 puede ser de un cliente y la OT 001 de otro),
        pero solo se puede asociar una CS <b>del mismo cliente</b>; si no coincide, el sistema lo avisa y no la asocia. La OT asociada no crea otra solicitud.</div>
      <div class="aviso info" style="margin-top:6px">Para no crear una por una las OT que ya se llevaban (registro <b>GCV-FO-002</b>): copie las filas del Excel y péguelas aquí.
        La OT sin CS queda como venta cerrada <b>sin cotización</b>, con su número original, lista para que el Almacén reciba sus equipos.
        Las OT que ya existan en el sistema se omiten, y la numeración automática continúa después de la última OT cargada.</div>
      <h3 style="margin-top:12px">1. Órdenes de trabajo</h3>
      <div class="im-subir" id="im-zona">
        <label class="btn">📎 Subir Excel o PDF<input type="file" id="im-arch" multiple accept=".xlsx,.xls,.xlsm,.csv,.pdf,.jpg,.jpeg,.png" style="display:none" onchange="imArchivos(this.files);this.value=''"></label>
        <span>o arrastre aquí los archivos. <b>Excel</b>: el registro GCV-FO-002 o cualquier hoja con encabezados (Fecha, Cliente, NIT, N° OT…); si trae columnas o una hoja de equipos, también se cargan.
          <b>PDF</b> (o foto): el registro o las OT escaneadas; se leen con inteligencia artificial, revise los datos antes de importar.</span>
      </div>
      <div id="im-arch-res"></div>
      <p class="ayuda">Copie desde el GCV-FO-002 las columnas <b>A a H</b> (Fecha · Cliente · NIT · N° de cotización/contrato · Tipo de servicio · N° solicitud calibración · Lugar de trabajo · N° OT), desde la primera OT hasta la última, y péguelas. Opcional: una 9.ª columna con el estado.</p>
      <textarea id="im-ot" rows="8" placeholder="Pegue aquí las filas del Excel (Ctrl+V)" style="width:100%;font-family:monospace;font-size:12px"></textarea>
      <div class="acciones" style="margin-top:6px"><button class="btn sec mini" onclick="imLeerRegistro()">Leer directamente del registro GCV-FO-002</button></div>
      <h3 style="margin-top:14px">2. Equipos de cada OT (opcional)</h3>
      <p class="ayuda">Para que el Almacén pueda «Cargar equipos de la OT». Columnas: <b>N° OT · Magnitud · Equipo · Marca · Modelo · Serie · Cód. inventario · Cantidad</b> (una fila por equipo).</p>
      <textarea id="im-eq" rows="5" placeholder="Pegue aquí los equipos (opcional)" style="width:100%;font-family:monospace;font-size:12px"></textarea>
      <div class="grid g3" style="margin-top:12px">
        <label class="campo"><span>Estado en que quedan</span><select id="im-estado"></select></label>
        <label class="campo"><span>Comercial responsable</span><input id="im-comercial" autocomplete="off"></label>
        <label class="campo"><span>&nbsp;</span><span class="acciones"><button class="btn sec" onclick="imRevisar(true)">Revisar</button><button class="btn ok" onclick="imRevisar(false)">Importar</button></span></label>
      </div>
      <div id="im-res" style="margin-top:12px"></div>
    </div>
  </section>

  <section id="v-postventa" class="vista">
    <div class="barra">
      <label>Periodo<input id="pv-periodo" placeholder="2026-S1"></label>
      <label>Estado<select id="pv-estado"><option value="">Todos</option><option>Pendiente envío</option><option>Enviada</option><option>Enviada (recordatorio)</option><option>Respondida</option></select></label>
      <label><span>&nbsp;</span><button class="btn" onclick="cargarPostventa()">Filtrar</button></label>
      <label><span>&nbsp;</span><button class="btn sec" onclick="generarEncuestas()">Generar encuestas del semestre anterior</button></label>
      <label class="derecha"><span>&nbsp;</span><a id="pv-pqrsf" target="_blank" class="btn sec" style="text-decoration:none">Gestor PQRSF</a></label>
    </div>
    <div class="aviso info">Encuesta semestral (5.10): el sistema la genera automáticamente el 1 de enero y el 1 de julio para clientes con servicios entregados en el semestre anterior, y envía recordatorio a los 20 días hábiles sin respuesta.</div>
    <div class="tabla-cont"><table id="pv-tabla"></table></div>
  </section>

</main>

<div class="modal-fondo" id="modal">
  <div class="modal">
    <div class="mh"><span id="m-titulo"></span><button class="x" onclick="cerrarModal()">×</button></div>
    <div class="mb" id="m-cuerpo"></div>
    <div class="mf"><button class="btn sec" onclick="cerrarModal()">Cancelar</button><button class="btn" id="m-ok">Guardar</button></div>
  </div>
</div>
<div id="cargando">Procesando…</div>
<div id="toast"></div>

<script>
/* ================================ ESTADO GLOBAL ================================ */
var CAT = null;          // catálogos del servidor
var DET = null;          // detalle abierto
var LISTA_CT = [];       // listado de cotizaciones
var LISTA_CL = [];       // listado de clientes
var pendientes = 0;

/* ================================ UTILIDADES ================================ */
function $(id){ return document.getElementById(id); }
function val(id){ var e = $(id); return e ? String(e.value || '').trim() : ''; }
function setv(id, v){ var e = $(id); if (e) e.value = (v === null || v === undefined) ? '' : v; }
function esc(s){ return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function money(n){ n = Number(n) || 0; return '$ ' + n.toLocaleString('es-CO', {maximumFractionDigits:0}); }
function fFecha(s){ if (!s) return ''; var p = String(s).substring(0,10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }
function hoyISO(){ var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().substring(0,10); }
function opciones(lista, sel, vacio){
  var h = vacio !== undefined ? '<option value="">' + esc(vacio) + '</option>' : '';
  (lista || []).forEach(function(o){ h += '<option' + (String(o) === String(sel) ? ' selected' : '') + '>' + esc(o) + '</option>'; });
  return h;
}
function toast(msg, tipo){
  var t = $('toast'); t.textContent = msg; t.style.background = tipo === 'err' ? 'var(--rojo)' : (tipo === 'adv' ? '#b98600' : 'var(--verde)');
  t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(function(){ t.style.display = 'none'; }, tipo === 'err' ? 7000 : 3500);
}
function cargando(on){ pendientes += on ? 1 : -1; if (pendientes < 0) pendientes = 0; $('cargando').style.display = pendientes ? 'block' : 'none'; }

/** Llama al servidor: srv('ventasFuncion', [args], function(data){...}, function(err){...}) */
function srv(fn, args, ok, fail){
  if (typeof google === 'undefined' || !google.script){ toast('Abra el módulo de Ventas desde el portal.', 'err'); return; }
  cargando(true);
  var r = google.script.run.withSuccessHandler(function(res){
    cargando(false);
    if (res && typeof res === 'object' && res.ok === false){ toast(res.error, 'err'); if (fail) fail(res.error); return; }
    if (ok) ok(res && typeof res === 'object' && 'ok' in res ? res.data : res);
  }).withFailureHandler(function(e){ cargando(false); toast(e && e.message ? e.message : String(e), 'err'); if (fail) fail(e); });
  // Desde el portal se envía el usuario de la sesión; abierto aparte se llama la función directamente
  if (window.VENTAS_USUARIO) r.ventasLlamar(window.VENTAS_USUARIO, fn, args || []);
  else r[fn].apply(r, args || []);
}

function modal(titulo, html, onOk, txtOk){
  $('m-titulo').textContent = titulo; $('m-cuerpo').innerHTML = html;
  var b = $('m-ok'); b.textContent = txtOk || 'Guardar'; b.style.display = onOk ? '' : 'none';
  var cx = document.querySelector('#modal .mf .btn.sec'); if (cx) cx.textContent = onOk ? 'Cancelar' : 'Cerrar';
  b.onclick = function(){ onOk && onOk(); };
  $('modal').classList.add('ver');
}
function cerrarModal(){ $('modal').classList.remove('ver'); }

/* ================================ NAVEGACIÓN ================================ */
function irA(v){
  Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function(b){ b.classList.toggle('activo', b.getAttribute('data-v') === v); });
  Array.prototype.forEach.call(document.querySelectorAll('.vista'), function(s){ s.classList.toggle('activa', s.id === 'v-' + v); });
  if (v === 'tablero') cargarTablero();
  if (v === 'cotizaciones') cargarCotizaciones();
  if (v === 'clientes') cargarClientes();
  if (v === 'postventa') cargarPostventa();
  if (v === 'importar') imPreparar();
}
Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function(b){ b.onclick = function(){ irA(b.getAttribute('data-v')); }; });

/* ================================ INICIO ================================ */
function iniciar(){
  srv('ventasCatalogos', [], function(c){
    CAT = c;
    pintarFiltrosComercial();
    $('ct-estado').innerHTML = opciones(c.estados, '', 'Todos');
    $('pv-pqrsf').href = c.urlPqrsf || '#';
    pintarDatalistClientes();
    limpiarNueva();
    cargarTablero();
  });
}
function pintarFiltrosComercial(){
  ['tb-comercial','ct-comercial'].forEach(function(id){ var sel = val(id); $(id).innerHTML = opciones(CAT.comerciales, sel, 'Todos'); });
}
function pintarDatalistClientes(){
  $('dl-clientes').innerHTML = (CAT.clientes || []).map(function(c){ return '<option value="' + esc(c.NIT) + '">' + esc(c.NOMBRE) + '</option>'; }).join('');
}

/* ================================ TABLERO ================================ */
function cargarTablero(){
  srv('ventasTablero', [{ comercial: val('tb-comercial'), texto: val('tb-texto') }], function(d){
    var verDesist = $('tb-cerradas').checked;
    var h = '';
    d.estados.forEach(function(e){
      if (e === 'Cerrada por desistimiento' && !verDesist) return;
      var lista = d.columnas[e] || [];
      h += '<div class="columna"><h4><span>' + esc(e) + '</span><span class="n">' + lista.length + '</span></h4>';
      if (!lista.length) h += '<div class="vacio" style="font-size:11px">Sin registros</div>';
      lista.forEach(function(s){
        var dias = s.SEMAFORO === 'gris' ? '' : (s.DIAS_RESTANTES < 0 ? 'Vencido ' + Math.abs(s.DIAS_RESTANTES) + 'd' : s.DIAS_RESTANTES + 'd rest.');
        h += '<div class="tk ' + esc(s.SEMAFORO) + '" onclick="abrirDetalle(\'' + esc(s.ID) + '\')">' +
             '<div class="meta"><span class="id">' + esc(s.ID) + (Number(s.VERSION) > 1 ? ' V' + esc(s.VERSION) : '') + '</span><span><span class="sem ' + esc(s.SEMAFORO) + '"></span> ' + esc(dias) + '</span></div>' +
             '<div class="cli">' + esc(s.CLIENTE) + '</div>' +
             '<div class="meta"><span>' + esc(s.COMERCIAL) + '</span><span>' + money(s.VALOR_TOTAL) + '</span></div>' +
             (s.NUM_OT ? '<div class="meta"><span>OT ' + esc(s.NUM_OT) + '</span><span>' + (s.F_COMPROMISO ? 'Entrega ' + fFecha(s.F_COMPROMISO) : '') + '</span></div>' : '') +
             (s.ACT_FO003 === 'PENDIENTE' || s.ACT_FO004 === 'PENDIENTE' ? '<span class="flag">Actualizar FO-003/004</span> ' : '') +
             (s.REVISION_CONTRATO_REABIERTA === 'SÍ' ? '<span class="flag">Revisión de contrato reabierta</span>' : '') +
             '</div>';
      });
      h += '</div>';
    });
    $('kanban').innerHTML = h;
  });
}
$('tb-cerradas').onchange = cargarTablero;
$('tb-comercial').onchange = cargarTablero;
$('tb-texto').onkeydown = function(e){ if (e.key === 'Enter') cargarTablero(); };

/* ============================ EDITOR DE EQUIPOS ============================ */
// Columnas visibles de los equipos (los valores comerciales van en la cotización cargada).
// Los datos que ya tenía un equipo en otras columnas (rango, U, EMP, valores...) se conservan al guardar.
var EQ_COLS = [
  ['MAGNITUD','Magnitud','sel'], ['EQUIPO','Equipo*'], ['MARCA','Marca'], ['MODELO','Modelo'], ['SERIE','Serie'],
  ['CODIGO_INVENTARIO','Cód. inv.'], ['UBICACION','Ubicación'], ['TIPO_SERVICIO','Servicio','tipo'], ['CANTIDAD','Cant.','num']
];
function eqFila(e){
  e = e || {};
  var extra = {};
  Object.keys(e).forEach(function(k){ if (!EQ_COLS.some(function(c){ return c[0] === k; }) && k.charAt(0) !== '_' && e[k] !== '' && e[k] !== null && typeof e[k] !== 'object') extra[k] = e[k]; });
  var h = '<tr data-extra="' + esc(JSON.stringify(extra)) + '">';
  EQ_COLS.forEach(function(c){
    var v = e[c[0]] === undefined ? '' : e[c[0]];
    if (c[2] === 'sel') h += '<td><select data-k="' + c[0] + '" onchange="eqPlazo(this)">' + opciones(CAT.magnitudes, v, '-') + '</select></td>';
    else if (c[2] === 'tipo') h += '<td><select data-k="' + c[0] + '" onchange="eqPlazo(this)">' + opciones(['Propio','Tercerizado'], v || 'Propio') + '</select></td>';
    else if (c[2] === 'num') h += '<td><input type="number" step="any" data-k="' + c[0] + '" value="' + esc(c[0] === 'IVA_PCT' && v === '' ? CAT.config.iva : (c[0] === 'CANTIDAD' && v === '' ? 1 : v)) + '" style="width:80px" oninput="eqTotales(this)"></td>';
    else h += '<td><input data-k="' + c[0] + '" value="' + esc(v) + '" style="min-width:' + (c[0] === 'EQUIPO' ? 140 : 85) + 'px"></td>';
  });
  h += '<td style="white-space:nowrap"><button class="btn sec mini" title="Copiar esta fila (duplica la información)" onclick="eqCopiar(this)">⧉</button> ' +
       '<button class="btn mini peligro" title="Quitar" onclick="var t=this.closest(\'table\');this.closest(\'tr\').remove();eqTotales(t)">×</button></td></tr>';
  return h;
}
function eqEditor(cont, lista){
  var serv = (CAT.servicios || []).map(function(s){ return '<option value="' + esc(s.CODIGO) + '">' + esc(s.CODIGO + ' · ' + s.DESCRIPCION + ' · ' + money(s.VALOR)) + '</option>'; }).join('');
  var h = '<div class="tabla-cont"><table class="eq-tabla"><thead><tr>' + EQ_COLS.map(function(c){ return '<th>' + esc(c[1]) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>';
  (lista && lista.length ? lista : [{}]).forEach(function(e){ h += eqFila(e); });
  h += '</tbody></table></div><div class="acciones" style="margin-top:8px;align-items:center">' +
       '<button class="btn sec mini" onclick="eqAgregar(\'' + cont + '\')">+ Agregar equipo</button>' +
       (serv ? '<select id="' + cont + '-serv" style="max-width:380px"><option value="">Agregar desde portafolio (GCV-FO-005)…</option>' + serv + '</select>' +
       '<button class="btn sec mini" onclick="eqDesdePortafolio(\'' + cont + '\')">Agregar</button>' : '') +
       '<span class="derecha" id="' + cont + '-tot"></span></div>';
  $(cont).innerHTML = h;
  Array.prototype.forEach.call($(cont).querySelectorAll('tbody tr'), function(tr){ eqPlazo(tr.querySelector('select')); });
  eqTotales($(cont).querySelector('table'));
}
function eqAgregar(cont, e){ $(cont).querySelector('tbody').insertAdjacentHTML('beforeend', eqFila(e)); var trs = $(cont).querySelectorAll('tbody tr'); eqPlazo(trs[trs.length-1].querySelector('select')); eqTotales($(cont).querySelector('table')); }
// Duplica la fila debajo con la misma información (la serie queda vacía porque es única de cada equipo)
function eqCopiar(btn){
  var tr = btn.closest('tr'), e = {};
  try { e = JSON.parse(tr.getAttribute('data-extra') || '{}'); } catch (x) { e = {}; }
  Array.prototype.forEach.call(tr.querySelectorAll('[data-k]'), function(i){ e[i.getAttribute('data-k')] = i.value; });
  e.SERIE = '';
  tr.insertAdjacentHTML('afterend', eqFila(e));
  var nueva = tr.nextElementSibling;
  eqPlazo(nueva.querySelector('select'));
  eqTotales(tr.closest('table'));
  var c = nueva.querySelector('[data-k=SERIE]'); if (c) c.focus();
  toast('Fila copiada: escribe la serie del nuevo equipo.');
}
function eqDesdePortafolio(cont){
  var cod = val(cont + '-serv'); if (!cod) return;
  var s = (CAT.servicios || []).filter(function(x){ return String(x.CODIGO) === cod; })[0]; if (!s) return;
  eqAgregar(cont, { MAGNITUD: s.MAGNITUD, EQUIPO: s.DESCRIPCION, VALOR_UNITARIO: s.VALOR, IVA_PCT: s.IVA_PCT === '' ? CAT.config.iva : s.IVA_PCT, TIPO_SERVICIO: s.TIPO_SERVICIO || 'Propio', CANTIDAD: 1 });
}
function eqPlazo(el){
  if (!el) return;
  var tr = el.closest('tr'), cel = tr.querySelector('.plazo');
  if (!cel) return;   // el plazo se calcula en el servidor (8 días hábiles propio, 15 tercerizado)
  var mag = tr.querySelector('[data-k=MAGNITUD]').value, tipo = tr.querySelector('[data-k=TIPO_SERVICIO]').value;
  cel.textContent = (tipo === 'Tercerizado' ? CAT.plazoTercerizado : (CAT.plazos[mag] || 8)) + ' d háb.';
}
function eqTotales(el){
  var t = el && el.closest ? (el.tagName === 'TABLE' ? el : el.closest('table')) : null; if (!t) return;
  var filas = 0, cant = 0;
  Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function(tr){ filas++; cant += Number((tr.querySelector('[data-k=CANTIDAD]') || {}).value) || 0; });
  var cont = t.closest('.tabla-cont') ? t.closest('.tabla-cont').parentElement : null;
  if (cont && $(cont.id + '-tot')) $(cont.id + '-tot').innerHTML = '<b>' + filas + '</b> fila(s) · cantidad total <b>' + cant + '</b>';
}
function eqLeer(cont){
  var out = [];
  Array.prototype.forEach.call($(cont).querySelectorAll('tbody tr'), function(tr){
    var o = {};
    try { o = JSON.parse(tr.getAttribute('data-extra') || '{}'); } catch (x) { o = {}; }
    Array.prototype.forEach.call(tr.querySelectorAll('[data-k]'), function(i){ o[i.getAttribute('data-k')] = String(i.value || '').trim(); });
    if (o.EQUIPO || o.MAGNITUD) out.push(o);
  });
  return out;
}

/* ========================= BLOQUE DE CONFORMIDAD ========================= */
function confEditor(cont, c){
  c = c || {};
  var sol = c.SOLICITA_DECLARACION || 'NO';
  $(cont).innerHTML =
    '<div class="grid g3">' +
    '<label class="campo"><span>¿Solicita declaración de conformidad?</span><select id="' + cont + '-sol">' + opciones(['NO','SÍ'], sol) + '</select></label>' +
    '<label class="campo"><span>Conformidad según documento</span><input id="' + cont + '-norma" value="' + esc(c.NORMA_ESPECIFICACION) + '" placeholder="Ej.: OIML R 76-1, NTC 2031, acuerdo de servicio"></label>' +
    '<label class="campo"><span>Regla de decisión</span><select id="' + cont + '-regla">' + opciones(CAT.reglas, c.REGLA_DECISION, '-') + '</select></label>' +
    '</div><div id="' + cont + '-av"></div>';
  var f = function(){
    var s = val(cont + '-sol'), r = val(cont + '-regla'), h = '';
    $(cont + '-norma').disabled = $(cont + '-regla').disabled = s !== 'SÍ';
    if (s === 'SÍ' && r.indexOf('simple') > -1) h = '<div class="aviso adv"><b>Regla binaria simple:</b> se requiere que la incertidumbre expandida U sea ≤ 1/3 del EMP. Verifique U y EMP con el laboratorio en la revisión de requisitos (5.2).</div>';
    if (s === 'SÍ' && r.indexOf('zona') > -1) h = '<div class="aviso info">Zona de seguridad W = U (95%). Los límites de aceptación se reducen en W.</div>';
    if (c.ADVERTENCIAS) h += '<div class="aviso ' + (c.VALIDACION === 'NO CUMPLE' ? 'err' : 'adv') + '">Validación: <b>' + esc(c.VALIDACION) + '</b><br>' + esc(c.ADVERTENCIAS) + '</div>';
    $(cont + '-av').innerHTML = h;
  };
  $(cont + '-sol').onchange = f; $(cont + '-regla').onchange = f; f();
}
function confLeer(cont){ return { SOLICITA: val(cont + '-sol'), NORMA: val(cont + '-norma'), REGLA: val(cont + '-regla') }; }

/* ============================= IMPORTAR OT ============================= */
function imPreparar(){
  $('im-estado').innerHTML = opciones(CAT.estadosImportables || ['Solicitud de calibración recibida'], val('im-estado') || 'Entregada');
  if (!val('im-comercial')) setv('im-comercial', CAT.usuarioActual || '');
}
// Fechas del Excel: 15/07/2025, 15-07-2025 o 2025-07-15
function imFecha(t){
  t = String(t || '').trim();
  var m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { var a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return a + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
}
function imFilas(id, n){
  return String(val(id) || '').split(/\r?\n/).map(function(l){ return l.split('\t').map(function(x){ return x.trim(); }); })
    .filter(function(c){ return c.some(Boolean) && c.length >= Math.min(n, 2); });
}
function imDatos(){
  var ots = imFilas('im-ot', 8).filter(function(c){ return /^OT/i.test(c[7] || ''); }).map(function(c){
    return { FECHA: imFecha(c[0]), CLIENTE: c[1], NIT: c[2], REFERENCIA: c[3], TIPO_SERVICIO: c[4], SOLICITUD_CAL: c[5], LUGAR: c[6], OT: c[7], ESTADO: c[8] || '' };
  });
  var eqs = imFilas('im-eq', 3).filter(function(c){ return /^OT/i.test(c[0] || ''); }).map(function(c){
    return { OT: c[0], MAGNITUD: c[1], EQUIPO: c[2], MARCA: c[3], MODELO: c[4], SERIE: c[5], CODIGO_INVENTARIO: c[6], CANTIDAD: c[7] };
  });
  return { ots: ots, eqs: eqs };
}
// Asociación OT ↔ solicitud del cliente (CS): la elige el usuario; el número de la CS no tiene que coincidir con el de la OT
var IM_ASOC = {};   // clave OT → ID de la CS | 'NINGUNA'
function imLeerAsociaciones(){
  var faltan = [];
  Array.prototype.forEach.call(document.querySelectorAll('select.im-cs'), function(x){
    if (x.value) IM_ASOC[x.getAttribute('data-ot')] = x.value; else { delete IM_ASOC[x.getAttribute('data-ot')]; faltan.push(x.getAttribute('data-n')); }
  });
  return faltan;
}
function imElegirCS(sel){
  var o = sel.options[sel.selectedIndex];
  if (o && o.getAttribute('data-mismo') === '0') {
    errorModal('El cliente no coincide', 'La ' + sel.getAttribute('data-n') + ' es de «' + sel.getAttribute('data-cliente') + '», pero la CS ' + o.value + ' es de «' + o.getAttribute('data-cliente') +
      '». Solo se puede asociar una CS del mismo cliente.');
    sel.value = ''; delete IM_ASOC[sel.getAttribute('data-ot')]; return;
  }
  if (sel.value) IM_ASOC[sel.getAttribute('data-ot')] = sel.value; else delete IM_ASOC[sel.getAttribute('data-ot')];
}
function imAsociarHtml(lista){
  if (!(lista || []).length) return '';
  var op = function(c, sel){ return '<option value="' + esc(c.ID) + '" data-mismo="' + (c.MISMO ? 1 : 0) + '" data-cliente="' + esc(c.CLIENTE) + '"' + (sel === c.ID ? ' selected' : '') + '>' + esc(c.ID + (c.SC ? ' · ' + c.SC : '') + ' · ' + c.CLIENTE + (c.FECHA ? ' · ' + fFecha(c.FECHA) : '') + (c.EQUIPOS ? ' · ' + c.EQUIPOS + ' eq.' : '') + (c.REFERENCIA ? ' · ' + c.REFERENCIA : '')) + '</option>'; };
  return '<div class="aviso adv" style="margin-top:8px"><b>Asocie cada OT a su solicitud del cliente (CS)</b> y pulse <b>Importar</b>. El número de la CS no tiene que coincidir con el de la OT, pero la CS debe ser <b>del mismo cliente</b>. ' +
      'Si la OT no tiene CS elija «Sin CS».</div>' +
    '<div class="tabla-cont"><table><thead><tr><th>OT</th><th>Cliente de la OT</th><th>Fecha</th><th>Solicitud del cliente (CS)</th></tr></thead><tbody>' +
    lista.map(function(a){
      var mismos = a.candidatos.filter(function(c){ return c.MISMO; }), otros = a.candidatos.filter(function(c){ return !c.MISMO; });
      if (a.SUGERIDA && !IM_ASOC[a.CLAVE]) IM_ASOC[a.CLAVE] = a.SUGERIDA;
      var sel = IM_ASOC[a.CLAVE] || '';
      return '<tr><td><b>' + esc(a.OT) + '</b></td><td>' + esc(a.CLIENTE) + '<br><small style="color:var(--suave)">NIT ' + esc(a.NIT) + '</small></td><td>' + fFecha(a.FECHA) + '</td><td>' +
        '<select class="im-cs" data-ot="' + esc(a.CLAVE) + '" data-n="' + esc(a.OT) + '" data-cliente="' + esc(a.CLIENTE) + '" onchange="imElegirCS(this)" style="width:100%">' +
        '<option value="">— Elija la CS —</option>' +
        (mismos.length ? '<optgroup label="CS de ' + esc(a.CLIENTE) + '">' + mismos.map(function(c){ return op(c, sel); }).join('') + '</optgroup>' : '') +
        '<option value="NINGUNA"' + (sel === 'NINGUNA' ? ' selected' : '') + '>Sin CS (crear la venta solo con la OT)</option>' +
        (otros.length ? '<optgroup label="CS de otros clientes (no se pueden asociar)">' + otros.map(function(c){ return op(c, ''); }).join('') + '</optgroup>' : '') + '</select>' +
        (a.SUGERIDA ? '<small style="color:var(--suave)">Sugerida: ' + esc(a.SUGERIDA) + ' (' + esc(a.POR) + ')</small>' : !mismos.length ? '<small style="color:var(--suave)">Este cliente no tiene CS pendientes</small>' : '') +
        '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
function imRevisar(soloRevisar){
  var d = imDatos();
  if (!d.ots.length){ toast('No se encontraron OT en lo pegado. Verifique que la columna H tenga el N° de OT.', 'err'); return; }
  var faltan = imLeerAsociaciones();
  if (!soloRevisar && faltan.length){ toast('Asocie a una CS (o elija «Sin CS») la(s) OT: ' + faltan.join(', ') + '.', 'err'); return; }
  if (!soloRevisar && !confirm('¿Importar ' + d.ots.length + ' OT' + (d.eqs.length ? ' con ' + d.eqs.length + ' equipo(s)' : '') + '?')) return;
  srv('ventasImportarOT', [d.ots, d.eqs, { estado: val('im-estado'), comercial: val('im-comercial'), soloRevisar: soloRevisar, decisiones: IM_DEC, asociar: IM_ASOC }], function(r){
    var pend = r.porAsociar || [];
    $('im-res').innerHTML = '<div class="aviso ' + (r.creadas.length ? 'ok' : 'adv') + '"><b>' + (soloRevisar ? 'Revisión: ' + r.creadas.length + ' OT listas para importar' : r.creadas.length + ' OT importadas') +
      '</b>' + (r.equipos ? ' · ' + r.equipos + ' equipo(s)' : '') + (pend.length ? ' · ' + pend.length + ' por asociar a su CS' : '') + (r.omitidas.length ? ' · ' + r.omitidas.length + ' omitida(s)' : '') + '</div>' +
      imAsociarHtml(pend) +
      (r.creadas.length ? '<div class="tabla-cont" style="margin-top:8px"><table><thead><tr><th>OT</th><th>Cliente</th><th>Solicitud del cliente (CS)</th><th>Equipos</th>' + (soloRevisar ? '' : '<th>ID</th>') + '</tr></thead><tbody>' +
        r.creadas.map(function(x){ return '<tr><td><b>' + esc(x.OT) + '</b></td><td>' + esc(x.CLIENTE) + '</td><td>' + (x.CS ? '🔗 ' + (soloRevisar ? 'Se asociará a ' : 'Asociada a ') + '<b>' + esc(x.CS) + '</b> (mismo cliente)' : '<span style="color:var(--suave)">Sin CS: se crea la venta de la OT</span>') +
          '</td><td>' + x.EQUIPOS + '</td>' + (soloRevisar ? '' : '<td>' + esc(x.ID) + '</td>') + '</tr>'; }).join('') + '</tbody></table></div>' : '') +
      imConfirmarHtml(r.confirmar, 'imRevisar(true)') +
      (r.omitidas.length ? '<div class="aviso adv" style="margin-top:8px"><b>Omitidas:</b><br>' + r.omitidas.map(esc).join('<br>') + '</div>' : '');
    if ((r.noCoinciden || []).length) errorModal('El cliente no coincide', 'No se asociaron porque la CS es de otro cliente: ' + r.noCoinciden.join('; ') + '.');
    if (!soloRevisar && r.creadas.length) {
      toast(r.creadas.length + ' OT importadas.');
      r.creadas.forEach(function(x){ delete IM_ASOC[String(x.OT).toUpperCase().replace(/[^A-Z0-9]/g, '')]; });
      // Si quedan OT por asociar o por confirmar el cliente, se deja lo pegado para importarlas después de decidir
      if (!(r.confirmar || []).length && !pend.length) { setv('im-ot', ''); setv('im-eq', ''); IM_ASOC = {}; }
    }
  });
}
// ---- Subir las OT en Excel o PDF: los datos se pasan a los cuadros de texto para revisarlos antes de importar
function imCargarXLSX(cb){
  if (window.XLSX) { cb(); return; }
  var urls = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
  var intentar = function(i){
    if (i >= urls.length) { cargando(false); toast('No se pudo cargar el lector de Excel. Revise la conexión o copie y pegue las filas.', 'err'); return; }
    var sc = document.createElement('script'); sc.src = urls[i];
    sc.onload = function(){ cargando(false); cb(); }; sc.onerror = function(){ intentar(i + 1); };
    document.head.appendChild(sc);
  };
  cargando(true); intentar(0);
}
function imArchivos(files){
  Array.prototype.forEach.call(files || [], function(f){
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var linea = document.createElement('div'); linea.textContent = '⏳ ' + f.name + ': leyendo…'; $('im-arch-res').appendChild(linea);
    var fin = function(txt, err){ linea.textContent = (err ? '⚠️ ' : '✅ ') + f.name + ': ' + txt; linea.style.color = err ? 'var(--rojo)' : ''; };
    if (['xlsx', 'xls', 'xlsm', 'csv'].indexOf(ext) !== -1) {
      imCargarXLSX(function(){
        var r = new FileReader();
        r.onload = function(){
          try { var d = imDesdeLibro(XLSX.read(new Uint8Array(r.result), { type: 'array', cellNF: true, raw: ext === 'csv' })); fin(imAgregar(d.ots, d.eqs)); }
          catch (e) { fin(e.message || String(e), true); }
        };
        r.readAsArrayBuffer(f);
      });
    } else if (ext === 'pdf' || /^image\//.test(f.type)) {
      if (f.size > 19 * 1024 * 1024) { fin('supera 19 MB; divídalo en partes.', true); return; }
      var r = new FileReader();
      r.onload = function(){
        linea.textContent = '⏳ ' + f.name + ': leyendo el PDF con IA (puede tardar hasta un minuto)…';
        srv('ventasLeerOTArchivo', [String(r.result).split(',')[1], f.type || 'application/pdf', f.name], function(res){
          var eqs = [];
          res.ordenes.forEach(function(o){ (o.equipos || []).forEach(function(e){ eqs.push(Object.assign({ OT: o.OT }, e)); }); });
          fin('leído con IA (verifique los datos) · ' + imAgregar(res.ordenes, eqs));
        }, function(e){ fin(e && e.message ? e.message : String(e), true); });
      };
      r.readAsDataURL(f);
    } else fin('formato no admitido (use Excel, CSV o PDF).', true);
  });
}
// Normaliza un encabezado: minúsculas, sin tildes ni signos
function imNormH(h){ return String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
var IM_COLS = [
  ['SOLICITUD_CAL', /solicitud/], ['OT', /(^| )(ot|o t|orden de trabajo|ordenes de trabajo)( |$)/], ['REFERENCIA', /cotizacion|contrato|orden de servicio|referencia/],
  ['LUGAR', /lugar/], ['NIT', /(^| )nit( |$)|identificacion|cedula/], ['ESTADO', /estado/], ['MAGNITUD', /magnitud/], ['MARCA', /marca|fabricante/],
  ['MODELO', /modelo/], ['SERIE', /serie/], ['CODIGO_INVENTARIO', /inventario|codigo/], ['CANTIDAD', /cant/], ['FECHA', /fecha/],
  ['TIPO_SERVICIO', /servicio/], ['CLIENTE', /cliente|razon social|empresa/], ['EQUIPO', /equipo|instrumento|descripcion/]
];
function imMapa(fila){
  var m = {};
  fila.forEach(function(h, i){
    var n = imNormH(h); if (!n || n.length > 60) return;
    for (var j = 0; j < IM_COLS.length; j++) if (IM_COLS[j][1].test(n)) { if (m[IM_COLS[j][0]] === undefined) m[IM_COLS[j][0]] = i; break; }
  });
  return m;
}
// Filas de una hoja como texto; las fechas de Excel se pasan a AAAA-MM-DD
function imFilasHoja(ws){
  if (!ws['!ref']) return [];
  var rg = XLSX.utils.decode_range(ws['!ref']), filas = [];
  for (var r = rg.s.r; r <= rg.e.r; r++) {
    var fila = [];
    for (var c = rg.s.c; c <= rg.e.c; c++) {
      var x = ws[XLSX.utils.encode_cell({ r: r, c: c })], v = '';
      if (x) {
        if (x.t === 'd' && x.v instanceof Date) v = x.v.getFullYear() + '-' + ('0' + (x.v.getMonth() + 1)).slice(-2) + '-' + ('0' + x.v.getDate()).slice(-2);
        else if (x.t === 'n' && x.z && XLSX.SSF.is_date(x.z)) { var p = XLSX.SSF.parse_date_code(x.v); v = p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2); }
        else v = x.v;
      }
      fila.push(String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ').trim());
    }
    filas.push(fila);
  }
  return filas;
}
function imOT(v){ v = String(v || '').trim().toUpperCase(); return /^\d{1,4}\s*-\s*\d{2}$/.test(v) ? 'OT-' + v.replace(/\s/g, '') : v; }
function imDesdeLibro(wb){
  var ots = [], eqs = [];
  wb.SheetNames.forEach(function(nh){
    var filas = imFilasHoja(wb.Sheets[nh]); if (!filas.length) return;
    var hi = -1, mapa = null, mejor = 0;
    for (var i = 0; i < Math.min(filas.length, 25); i++) {
      var m = imMapa(filas[i]), n = Object.keys(m).length;
      if (m.OT !== undefined && (m.CLIENTE !== undefined || m.EQUIPO !== undefined || m.SERIE !== undefined) && n > mejor) { hi = i; mapa = m; mejor = n; }
    }
    var g = function(f, k){ return mapa[k] === undefined ? '' : (f[mapa[k]] || ''); };
    if (!mapa) {
      // Sin encabezados reconocibles: columnas A–H del GCV-FO-002
      filas.forEach(function(f){ if (/^O\.?T/i.test(f[7] || '')) ots.push({ FECHA: f[0], CLIENTE: f[1], NIT: f[2], REFERENCIA: f[3], TIPO_SERVICIO: f[4], SOLICITUD_CAL: f[5], LUGAR: f[6], OT: imOT(f[7]), ESTADO: f[8] || '' }); });
      return;
    }
    var hayEq = mapa.EQUIPO !== undefined || mapa.SERIE !== undefined || mapa.MAGNITUD !== undefined;
    filas.slice(hi + 1).forEach(function(f){
      var ot = imOT(g(f, 'OT')); if (!/^O\.?T/.test(ot)) return;
      if (mapa.CLIENTE !== undefined && g(f, 'CLIENTE'))
        ots.push({ FECHA: g(f, 'FECHA'), CLIENTE: g(f, 'CLIENTE'), NIT: g(f, 'NIT'), REFERENCIA: g(f, 'REFERENCIA'), TIPO_SERVICIO: g(f, 'TIPO_SERVICIO'), SOLICITUD_CAL: g(f, 'SOLICITUD_CAL'), LUGAR: g(f, 'LUGAR'), OT: ot, ESTADO: g(f, 'ESTADO') });
      if (hayEq && (g(f, 'EQUIPO') || g(f, 'SERIE')))
        eqs.push({ OT: ot, MAGNITUD: g(f, 'MAGNITUD'), EQUIPO: g(f, 'EQUIPO'), MARCA: g(f, 'MARCA'), MODELO: g(f, 'MODELO'), SERIE: g(f, 'SERIE'), CODIGO_INVENTARIO: g(f, 'CODIGO_INVENTARIO'), CANTIDAD: g(f, 'CANTIDAD') || 1 });
    });
  });
  if (!ots.length && !eqs.length) throw new Error('no se encontraron OT. Verifique que tenga una columna «N° OT» con valores como OT-015-26.');
  return { ots: ots, eqs: eqs };
}
// Agrega las OT y equipos leídos a los cuadros de texto (sin repetir OT que ya estén)
function imAgregar(ots, eqs){
  var k = function(x){ return String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  var limpio = function(v){ return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); };
  var ya = {}; imFilas('im-ot', 8).forEach(function(c){ if (c[7]) ya[k(c[7])] = true; });
  var nuevas = {}, lOt = [], lEq = [], rep = 0;
  ots.forEach(function(o){
    var kk = k(o.OT); if (!kk) return;
    if (ya[kk] || nuevas[kk]) { rep++; return; }
    nuevas[kk] = true;
    lOt.push([o.FECHA, o.CLIENTE, o.NIT, o.REFERENCIA, o.TIPO_SERVICIO, o.SOLICITUD_CAL, o.LUGAR, o.OT, o.ESTADO || ''].map(limpio).join('\t'));
  });
  // Equipos: los de OT nuevas, o de OT que solo vienen en la hoja de equipos
  eqs.forEach(function(e){ if (ya[k(e.OT)] && !nuevas[k(e.OT)]) return; lEq.push([e.OT, e.MAGNITUD, e.EQUIPO, e.MARCA, e.MODELO, e.SERIE, e.CODIGO_INVENTARIO, e.CANTIDAD || 1].map(limpio).join('\t')); });
  if (lOt.length) setv('im-ot', (val('im-ot') ? val('im-ot') + '\n' : '') + lOt.join('\n'));
  if (lEq.length) setv('im-eq', (val('im-eq') ? val('im-eq') + '\n' : '') + lEq.join('\n'));
  return lOt.length + ' OT' + (lEq.length ? ' y ' + lEq.length + ' equipo(s)' : '') + ' agregadas' + (rep ? ' · ' + rep + ' ya estaban en la lista' : '') + (lOt.length ? '. Pulse «Revisar».' : '');
}
(function(){
  var z = $('im-zona'); if (!z) return;
  z.addEventListener('dragover', function(e){ e.preventDefault(); z.classList.add('sobre'); });
  z.addEventListener('dragleave', function(){ z.classList.remove('sobre'); });
  z.addEventListener('drop', function(e){ e.preventDefault(); z.classList.remove('sobre'); imArchivos(e.dataTransfer.files); });
})();
// ---- Solicitudes de clientes en PDF: se leen con IA, se revisan y se registran una por una
var IS_ARCH = {}, IS_N = 0, IS_DAT = {};
// Ventana de error (sin el código interno del mensaje)
function errorModal(titulo, msg){
  modal(titulo, '<div class="aviso err" style="font-size:14px">⛔ ' + esc(String(msg || '').replace(/^[A-Z_]+:\s*/, '')) + '</div>');
}
function isArchivos(files){
  Array.prototype.forEach.call(files || [], function(f){
    var n = ++IS_N, ext = (f.name.split('.').pop() || '').toLowerCase(), excel = ['xlsx', 'xls', 'xlsm'].indexOf(ext) !== -1;
    var card = document.createElement('div'); card.className = 'is-card'; card.id = 'is-' + n;
    card.innerHTML = '<div class="is-tit"><span>📄 ' + esc(f.name) + '</span></div><div class="aviso info">⏳ ' + (excel ? 'Leyendo el GCV-FO-004…' : 'Leyendo el documento con IA (puede tardar hasta un minuto)…') + '</div>';
    $('is-lista').insertBefore(card, $('is-lista').firstChild);
    var error = function(msg){ card.innerHTML = '<div class="is-tit"><span>📄 ' + esc(f.name) + '</span><button class="btn mini sec" onclick="isQuitar(' + n + ')">Quitar</button></div><div class="aviso err">' + esc(msg) + '</div>'; };
    if (ext !== 'pdf' && !excel && !/^image\//.test(f.type)) { error('Formato no admitido: suba un PDF, una imagen o el GCV-FO-004 en Excel.'); return; }
    if (f.size > 19 * 1024 * 1024) { error('El archivo supera 19 MB.'); return; }
    var url = ''; try { url = URL.createObjectURL(f); } catch (e) {}
    var r = new FileReader();
    r.onload = function(){
      var adj = { base64: String(r.result).split(',')[1], mime: f.type || (excel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'), nombre: f.name };
      if (excel) {
        imCargarXLSX(function(){
          var d;
          try { d = isLeerExcelSC(XLSX.read(Uint8Array.from(atob(adj.base64), function(ch){ return ch.charCodeAt(0); }), { type: 'array', cellNF: true }), f.name); }
          catch (e) { error(e.message || String(e)); return; }
          srv('ventasPrepararSolicitud', [d], function(x){ IS_ARCH[n] = adj; isPintar(n, x, ''); }, function(e){ error('No se pudo preparar: ' + (e && e.message ? e.message : String(e))); });
        });
        return;
      }
      srv('ventasLeerSolicitudArchivo', [adj.base64, adj.mime, f.name], function(d){ IS_ARCH[n] = adj; isPintar(n, d, url); },
        function(e){ error('No se pudo leer: ' + (e && e.message ? e.message : String(e))); });
    };
    r.readAsDataURL(f);
  });
}
// GCV-FO-004 en Excel: los datos están a la derecha de cada rótulo de la columna A; los equipos debajo de la fila «Item»
function isLeerExcelSC(wb, nombre){
  var ws = wb.Sheets['Formato'] || wb.Sheets[wb.SheetNames[0]];
  var filas = imFilasHoja(ws), d = { TIPO_DOCUMENTO: 'SC', archivo: nombre, cliente: {}, CONFORMIDAD: {}, equipos: [] };
  var na = function(v){ v = String(v || '').trim(); return /^n\s*\/?\s*a$/i.test(v) ? '' : v; };
  var valor = function(f){ for (var i = 1; i < f.length; i++) if (na(f[i])) return na(f[i]); return ''; };
  var seccion = '', enEquipos = false, esGCV = false;
  filas.forEach(function(f){
    var r = imNormH(f[0]);
    if (/formato de solicitud de calibracion/.test(imNormH(f.join(' ')))) esGCV = true;
    if (enEquipos) {
      if (/^notas/.test(r) || !f.some(function(x, i){ return i > 0 && na(x); })) { if (/^notas/.test(r)) enEquipos = false; return; }
      d.equipos.push({ EQUIPO: na(f[1]), MARCA: na(f[2]), MODELO: na(f[3]), SERIE: na(f[4]), CODIGO_INVENTARIO: na(f[5]), UBICACION: na(f[6]), PUNTOS_CALIBRACION: na(f[7]), CANTIDAD: 1 });
      return;
    }
    if (r === 'item') { enEquipos = true; return; }
    if (/^informacion para entrega/.test(r)) seccion = 'entrega';
    else if (/^informacion para calibracion en sitio/.test(r)) seccion = 'sitio';
    else if (/^datos para facturacion/.test(r)) seccion = 'factura';
    var v = valor(f);
    if (/numero de consecutivo/.test(r)) d.NUM_SC = v;
    else if (/numero de cotizacion/.test(r)) d.NUM_COTIZACION = v;
    else if (/razon social a quien/.test(r)) d.cliente.NOMBRE = v;
    else if (/^direccion/.test(r) && !seccion) d.cliente.DIRECCION = v;
    else if (/^ciudad/.test(r) && !seccion) d.cliente.CIUDAD = v;
    else if (/nombre del cliente o contacto/.test(r)) d.cliente.CONTACTO = v;
    else if (/telefono o correo/.test(r)) { if (/@/.test(v)) d.cliente.CORREO = v; else d.cliente.TELEFONO = v; }
    else if (/conformidad para los equipos/.test(r)) { d.CONFORMIDAD = { SOLICITA: na(f[1]), NORMA: na(f[5]) || na(f[4]) || na(f[3]), REGLA: na(f[8]) || na(f[9]) }; }
    else if (/^direccion/.test(r) && seccion === 'sitio' && v) d.LUGAR = 'En sitio';
    else if (/^nit/.test(r) && seccion === 'factura') d.cliente.NIT = v;
    else if (/^telefono/.test(r) && seccion === 'factura' && v && !d.cliente.TELEFONO) d.cliente.TELEFONO = v;
    else if (/correo electronico para radicacion/.test(r) && v && !d.cliente.CORREO) d.cliente.CORREO = v;
    else if (/tercerizado a imcolmetric/.test(r)) d.TERCERIZADO_A_IMC = v;
  });
  if (!esGCV && !d.NUM_SC && !d.cliente.NOMBRE) throw new Error('El Excel no parece un GCV-FO-004 (Solicitud de calibración de equipos).');
  return d;
}
function isQuitar(n){ var c = $('is-' + n); if (c) c.remove(); delete IS_ARCH[n]; }
function isTitulo(n){
  var x = IS_DAT[n], d = x.d;
  return '<div class="is-tit"><span>📄 ' + esc(d.archivo) + (d.TIPO_DOCUMENTO === 'SC' ? ' · <b>GCV-FO-004 ' + esc(d.NUM_SC || 'sin consecutivo') + '</b>' : ' · Solicitud del cliente') +
    (x.url ? ' · <a href="' + x.url + '" target="_blank">Ver documento</a>' : '') + '</span><button class="btn mini sec" onclick="isQuitar(' + n + ')">Descartar</button></div>';
}
function isPintar(n, d, url){
  IS_DAT[n] = { d: d, url: url };
  if (d.TIPO_DOCUMENTO === 'SC') { if (d.paquete) isPintarPaquete(n); else isPintarSCSinDestino(n); return; }
  isPintarForm(n, false);
}
// Solicitud inicial del cliente (pedido de cotización) — o, desde una SC sin cotización, la orden de servicio por contrato
function isPintarForm(n, desdeSC){
  var d = IS_DAT[n].d;
  var p = 'is-' + n + '-', c = d.cliente || {}, reg = d.mismoNit;
  var vig = (d.contratos || []).filter(function(k){ return k.VIGENTE; });
  var kLeido = d.contratoSC || (d.contratos || []).filter(function(k){ return d.NUM_CONTRATO && k.NUMERO.toUpperCase().replace(/[^A-Z0-9]/g, '') === d.NUM_CONTRATO.toUpperCase().replace(/[^A-Z0-9]/g, ''); })[0];
  var kSug = kLeido || (vig.length ? vig[vig.length - 1] : null);
  var porContrato = desdeSC || !!(d.NUM_CONTRATO || (d.ORDEN_SERVICIO && vig.length));
  var cli = reg ? '<div class="aviso ok">✔ Cliente registrado: <b>' + esc(reg.NOMBRE) + '</b> (NIT ' + esc(reg.NIT) + ')' + (vig.length ? ' · ' + vig.length + ' contrato(s) vigente(s)' : '') + '</div>'
    : (d.parecidos || []).length ? '<div class="aviso adv">⚠ «' + esc(c.NOMBRE) + '» se parece a ' + d.parecidos.map(function(x){ return '<b>' + esc(x.NOMBRE) + '</b> (NIT ' + esc(x.NIT) + ')'; }).join(', ') + '. Al registrar se le pedirá confirmar si es el mismo cliente.</div>'
    : '<div class="aviso info">Cliente nuevo: se creará al registrar la solicitud.</div>';
  var f = function(id, l, v, cls, req, t){ return '<label class="campo' + (req ? ' req' : '') + (cls ? ' ' + cls : '') + '"><span>' + l + '</span><input id="' + p + id + '" type="' + (t || 'text') + '" value="' + esc(v) + '"></label>'; };
  var h = isTitulo(n) + cli +
    (desdeSC ? '<div class="aviso info">📄 La SC <b>' + esc(d.NUM_SC) + '</b> se registra como <b>orden de servicio por contrato</b> (sin cotización, GCV-PR-001 5.7 nota): se asigna la OT de inmediato.</div>'
      : IS_DAT[n].esperaOT ? '<div class="aviso info">📄 La SC <b>' + esc(d.NUM_SC || '') + '</b> se registra como <b>solicitud del cliente (CS)</b>. Cuando importe su OT (Paso 2) la asocia a esta solicitud; su número no tiene que coincidir con el de la OT.</div>'
      : '<div class="aviso info">Solicitud inicial del cliente (5.1): queda «Recibida» para la revisión de requisitos y la cotización. Cuando importe su OT (Paso 2) la asocia a esta solicitud.</div>') +
    '<h4>Tipo de ingreso</h4><div class="grid g4">' +
      '<label class="campo"><span>Ingreso</span><select id="' + p + 'modo" onchange="isModo(' + n + ')"' + (desdeSC ? ' disabled' : '') + '><option value="cotizacion"' + (porContrato ? '' : ' selected') + '>Solicitud con cotización</option><option value="contrato"' + (porContrato ? ' selected' : '') + '>Orden de servicio por contrato</option></select></label>' +
      '<label class="campo req ' + p + 'k"><span>N° de contrato</span><input id="' + p + 'knum" list="' + p + 'dl" value="' + esc(kSug ? kSug.NUMERO : (d.NUM_CONTRATO || d.NUM_COTIZACION)) + '"></label>' +
      '<label class="campo req ' + p + 'k"><span>Tipo</span><select id="' + p + 'ktipo">' + opciones(CAT.tiposContrato, kSug ? kSug.TIPO : 'Contrato privado') + '</select></label>' +
      '<label class="campo ' + p + 'k"><span>N° orden de servicio del cliente</span><input id="' + p + 'kos" value="' + esc(d.ORDEN_SERVICIO) + '"></label>' +
      '<datalist id="' + p + 'dl">' + (d.contratos || []).map(function(k){ return '<option value="' + esc(k.NUMERO) + '">' + esc(k.TIPO) + (k.VIGENTE ? '' : ' · VENCIDO') + '</option>'; }).join('') + '</datalist></div>' +
    '<h4>Recepción (5.1)</h4><div class="grid g4">' +
      f('fecha', 'Fecha de recepción', d.FECHA || hoyISO(), '', 1, 'date') +
      '<label class="campo req"><span>Canal</span><select id="' + p + 'canal">' + opciones(CAT.canales, 'Correo electrónico') + '</select></label>' +
      f('comercial', 'Comercial responsable', CAT.usuarioActual || '', '', 1) +
      '<label class="campo"><span>Lugar del servicio</span><select id="' + p + 'lugar">' + opciones(CAT.lugares, d.LUGAR || CAT.lugares[0]) + '</select></label>' +
      f('ref', 'Referencia / asunto', d.REFERENCIA, 'col4') + '</div>' +
    '<h4>Cliente</h4><div class="grid g4">' +
      f('nit', 'NIT / Identificación', reg ? reg.NIT : c.NIT, '', 1) + f('nombre', 'Nombre o razón social', reg ? reg.NOMBRE : c.NOMBRE, 'col2', 1) +
      '<label class="campo"><span>Tipo</span><select id="' + p + 'tipo">' + opciones(CAT.tiposCliente, 'Privado') + '</select></label>' +
      f('contacto', 'Contacto', c.CONTACTO) + f('tel', 'Teléfono / WhatsApp', c.TELEFONO) + f('correo', 'Correo', c.CORREO) + f('ciudad', 'Ciudad', c.CIUDAD) +
      f('dir', 'Dirección', c.DIRECCION, 'col2') + '</div>' +
    '<h4>Equipos / servicios solicitados (' + (d.equipos || []).length + ' leídos)</h4><div id="' + p + 'eq"></div>' + rutaCampos(p, d) +
    '<label class="campo" style="margin-top:8px"><span>Observaciones</span><textarea id="' + p + 'obs">' + esc(d.OBSERVACIONES) + '</textarea></label>' +
    '<div class="acciones" style="margin-top:10px"><button class="btn ok" id="' + p + 'btn" onclick="isRegistrar(' + n + ')">Registrar solicitud</button></div>';
  $('is-' + n).innerHTML = h;
  if (reg) { var cc = (CAT.clientes || []).filter(function(x){ return claveNit(x.NIT) === claveNit(reg.NIT); })[0]; if (cc) setv(p + 'tipo', cc.TIPO_CLIENTE || 'Privado'); }
  eqEditor(p + 'eq', d.equipos || []);
  isModo(n);
}
function isSCResumen(d){
  var c = d.cliente || {};
  return '<b>Solicitud de calibración ' + esc(d.NUM_SC || '(sin consecutivo)') + '</b><br>Cliente: ' + esc(c.NOMBRE) + (c.NIT ? ' · NIT ' + esc(c.NIT) : '') +
    (d.NUM_COTIZACION ? '<br>N° de cotización indicado: <b>' + esc(d.NUM_COTIZACION) + '</b>' : '') + (d.FECHA ? '<br>Fecha: ' + fFecha(d.FECHA) : '') +
    (d.TERCERIZADO_A_IMC ? '<br>Tercerizado a IMCOLMETRIC (casilla de la SC): <b>' + esc(d.TERCERIZADO_A_IMC) + '</b>' : '');
}
// SC con su cotización / OT: se registra allí solo si el cliente coincide y la cotización ya fue aceptada
function isPintarPaquete(n){
  var x = IS_DAT[n], d = x.d, q = d.paquete, p = 'is-' + n + '-', c = d.cliente || {};
  var destino = q.NUM_OT ? q.NUM_OT : 'cotización ' + q.ID;
  var resumen = '<div class="grid g2" style="margin-top:8px"><div class="aviso info">' + isSCResumen(d) + '</div>' +
    '<div class="aviso info"><b>' + esc(q.NUM_OT ? q.NUM_OT + ' (' + q.ID + ')' : 'Cotización ' + q.ID) + '</b> · ' + esc(q.ESTADO) + '<br>Cliente: ' + esc(q.CLIENTE) + ' · NIT ' + esc(q.CLIENTE_NIT) +
    (q.REFERENCIA ? '<br>' + esc(q.REFERENCIA) : '') + '<br>Equipos registrados: ' + q.EQUIPOS + '</div></div>';
  var problema = !q.COINCIDE ? ['El cliente no coincide', 'La solicitud ' + (d.NUM_SC || '') + ' es de «' + c.NOMBRE + '», pero la ' + destino + ' es de «' + q.CLIENTE + '». No pertenecen al mismo paquete, por eso no se puede registrar. Verifique el número de la SC, de la cotización o de la OT.']
    : q.SIN_ACEPTAR ? ['La cotización no está aceptada', 'La cotización ' + q.ID + ' está en estado «' + q.ESTADO + '». La solicitud de calibración se recibe cuando el cliente ya aceptó la cotización (GCV-PR-001 5.6): registre primero la aceptación («Cerrada por venta») en el detalle de la cotización.']
    : q.OTRA_SC ? ['Ya tiene SC', 'La ' + destino + ' ya tiene la solicitud de calibración ' + q.SC_ACTUAL + '. Una OT solo puede tener una SC.']
    : q.SECUENCIA_ERROR ? ['La SC y la OT no coinciden', q.SECUENCIA_ERROR] : null;
  if (problema) {
    $('is-' + n).innerHTML = isTitulo(n) + '<div class="aviso err">⛔ ' + esc(problema[1]) + '</div>' + resumen + isBuscarHtml(n) +
      (q.SIN_ACEPTAR && q.COINCIDE ? '<div class="acciones" style="margin-top:6px"><button class="btn sec" onclick="abrirDetalle(\'' + esc(q.ID) + '\')">Abrir la cotización ' + esc(q.ID) + '</button></div>' : '');
    errorModal(problema[0], problema[1]);
    return;
  }
  $('is-' + n).innerHTML = isTitulo(n) +
    '<div class="aviso ok">📦 Paquete: <b>' + esc(d.NUM_SC || 'SC') + ' ↔ ' + esc(destino) + '</b> · el cliente coincide (' + esc(q.CLIENTE) + ').' +
      (q.ESTADO === 'Cerrada por venta' ? ' La cotización está aceptada: al registrar la SC pasa a «Solicitud de calibración recibida» y se asigna la ' + (q.OT_PREVISTA ? '<b>' + esc(q.OT_PREVISTA) + '</b> (mismo consecutivo de la SC)' : 'OT') + ' (5.7).' : ' La SC se registra en esta orden; no se crea una solicitud aparte.') + '</div>' + resumen +
    (q.EQUIPOS ? '<div class="aviso info">Ya tiene ' + q.EQUIPOS + ' equipo(s) registrados (cotizados): no se modifican.</div>'
      : '<h4>Equipos de la SC (' + (d.equipos || []).length + ' leídos) — se cargarán</h4><div id="' + p + 'eq"></div>') +
    rutaCampos(p, d) +
    '<div class="acciones" style="margin-top:10px"><button class="btn ok" onclick="isVincular(' + n + ')">Registrar ' + esc(d.NUM_SC || 'SC') + ' en la ' + esc(destino) + '</button></div>';
  if (!q.EQUIPOS) eqEditor(p + 'eq', d.equipos || []);
}
function isBuscarHtml(n){
  var d = IS_DAT[n].d, p = 'is-' + n + '-';
  return '<div class="grid g4" style="align-items:end;margin-top:8px">' +
    ((d.candidatos || []).length ? '<label class="campo col2"><span>Cotizaciones de este cliente que esperan la SC</span><select id="' + p + 'cand"><option value="">— Elegir —</option>' +
      d.candidatos.map(function(x){ return '<option value="' + esc(x.ID) + '">' + esc(x.ID + (x.NUM_OT ? ' · ' + x.NUM_OT : '') + ' · ' + x.ESTADO + (x.REFERENCIA ? ' · ' + x.REFERENCIA : '')) + '</option>'; }).join('') + '</select></label>' : '') +
    '<label class="campo"><span>o escriba la cotización, contrato u OT</span><input id="' + p + 'ref2" placeholder="Ej.: 2026-0005 u OT-001-26"></label>' +
    '<label class="campo"><span>&nbsp;</span><button class="btn sec" onclick="isBuscarDestino(' + n + ')">Buscar</button></label></div>';
}
// SC sin cotización / OT encontrada: elegir la cotización del cliente, o (con contrato vigente) crear la orden de servicio por contrato
function isPintarSCSinDestino(n){
  var d = IS_DAT[n].d, vig = (d.contratos || []).filter(function(k){ return k.VIGENTE; });
  var k = d.contratoSC;
  $('is-' + n).innerHTML = isTitulo(n) +
    '<div class="aviso adv">📦 No se encontró la cotización aceptada ni la OT de esta solicitud de calibración' + (d.NUM_COTIZACION ? ' (N° de cotización indicado: <b>' + esc(d.NUM_COTIZACION) + '</b>)' : '') +
      '. Según el procedimiento (5.6), la SC llega después de la cotización: elija la cotización del cliente o escriba su número.' +
      (k || vig.length ? ' Si el cliente trabaja bajo <b>contrato</b>' + (k ? ' (' + esc(k.NUMERO) + (k.VIGENTE ? '' : ', VENCIDO') + ')' : '') + ', puede registrarla como orden de servicio por contrato.' : '') +
      ' Si su OT aún no está cargada, regístrela como <b>solicitud del cliente (CS)</b>: al importar la OT se la asocia.</div>' +
    '<div class="aviso info" style="margin-top:8px">' + isSCResumen(d) + '</div>' + isBuscarHtml(n) +
    '<div class="acciones" style="margin-top:8px"><button class="btn ok" onclick="IS_DAT[' + n + '].esperaOT = true; isPintarForm(' + n + ', false)">Registrar como solicitud del cliente (CS) y asociar su OT al cargarla</button>' +
    (k || vig.length ? '<button class="btn" onclick="IS_DAT[' + n + '].esperaOT = false; isPintarForm(' + n + ', true)">Registrar como orden de servicio por contrato</button>' : '') + '</div>';
}
function isBuscarDestino(n){
  var x = IS_DAT[n], d = x.d, p = 'is-' + n + '-';
  var ref = ($(p + 'cand') && val(p + 'cand')) || val(p + 'ref2');
  if (!ref){ toast('Elija la cotización o escriba su número, el contrato o la OT.', 'err'); return; }
  srv('ventasConsultarPaquete', [d.NUM_SC, ref, (d.cliente || {}).NIT, (d.cliente || {}).NOMBRE], function(q){
    if (!q){ toast('No se encontró «' + ref + '».', 'err'); return; }
    d.paquete = q; isPintarPaquete(n);
  });
}
function isVincular(n){
  var x = IS_DAT[n], d = x.d, q = d.paquete, p = 'is-' + n + '-';
  var ruta = rutaLeer(p); if (!ruta) return;
  var conf = d.CONFORMIDAD || {};
  var datos = { NUM_SC: d.NUM_SC, FECHA: d.FECHA, cliente: d.cliente, equipos: $(p + 'eq') ? eqLeer(p + 'eq') : [], adjunto: IS_ARCH[n], ruta: ruta,
    TERCERIZADO_A_IMC: d.TERCERIZADO_A_IMC, conformidad: conf.SOLICITA === 'NO' || (conf.SOLICITA === 'SI' && conf.NORMA && conf.REGLA) ? conf : null };
  srv('ventasRegistrarSC', [q.ID, datos], function(r){
    delete IS_ARCH[n];
    $('is-' + n).innerHTML = '<div class="aviso ok">✅ Solicitud de calibración <b>' + esc(r.NUM_SC || '') + '</b> registrada en la ' + (r.NUM_OT ? '<b>' + esc(r.NUM_OT) + '</b> (' + esc(r.ID) + ')' : 'solicitud <b>' + esc(r.ID) + '</b>') +
      ' · estado «' + esc(r.ESTADO) + '»' + (r.equipos ? ' · ' + r.equipos + ' equipo(s) cargados' : '') +
      '. El documento quedó como soporte.' + (r.mensajeRuta ? ' ' + esc(r.mensajeRuta) : '') + ' <button class="btn mini" onclick="abrirDetalle(\'' + esc(r.ID) + '\')">Abrir</button> <button class="btn mini sec" onclick="isQuitar(' + n + ')">Cerrar</button></div>';
    toast('SC registrada' + (r.NUM_OT ? ' · ' + r.NUM_OT : '') + '.');
  }, function(e){ if (/CLIENTE_NO_COINCIDE|COTIZACION_SIN_ACEPTAR|SECUENCIA|ya tiene la solicitud/.test(String(e))) errorModal('No se puede registrar la SC', e); });
}
function isModo(n){
  var k = val('is-' + n + '-modo') === 'contrato';
  Array.prototype.forEach.call(document.querySelectorAll('.is-' + n + '-k'), function(e){ e.style.display = k ? '' : 'none'; });
  $('is-' + n + '-btn').textContent = k ? 'Registrar orden de servicio y asignar OT' : 'Registrar solicitud';
}
// Confirma el cliente antes de registrar: mismo NIT → el registrado; nombre parecido → el usuario elige
function verificarClienteGen(nit, nombre, cb){
  srv('ventasVerificarCliente', [{ NIT: nit, NOMBRE: nombre }], function(r){
    if (r.mismoNit) { cb({ NIT: r.mismoNit.NIT, NOMBRE: r.mismoNit.NOMBRE }); return; }
    if (!r.parecidos.length) { cb({ NIT: nit, NOMBRE: nombre }); return; }
    elegirCliente({ NIT: nit, NOMBRE: nombre }, r.parecidos, function(e){
      cb(e === 'NUEVO' ? { NIT: nit, NOMBRE: nombre, CONFIRMAR_NUEVO: true } : { NIT: e.NIT, NOMBRE: e.NOMBRE });
    });
  });
}
function isRegistrar(n){
  var p = 'is-' + n + '-';
  var datos = {
    solicitud: { FECHA_RECEPCION: val(p + 'fecha'), CANAL: val(p + 'canal'), COMERCIAL: val(p + 'comercial'), LUGAR_SERVICIO: val(p + 'lugar'), REFERENCIA: val(p + 'ref'), OBSERVACIONES: val(p + 'obs'),
      NUM_SC: IS_DAT[n].d.TIPO_DOCUMENTO === 'SC' ? IS_DAT[n].d.NUM_SC : '', NUM_COTIZACION: IS_DAT[n].d.NUM_COTIZACION || '', ESPERA_OT: !!IS_DAT[n].esperaOT && val(p + 'modo') !== 'contrato' },
    TERCERIZADO_A_IMC: IS_DAT[n].d.TERCERIZADO_A_IMC || '',
    cliente: { NIT: val(p + 'nit'), NOMBRE: val(p + 'nombre'), TIPO_CLIENTE: val(p + 'tipo'), CONTACTO: val(p + 'contacto'), TELEFONO: val(p + 'tel'), CORREO: val(p + 'correo'), CIUDAD: val(p + 'ciudad'), DIRECCION: val(p + 'dir') },
    equipos: eqLeer(p + 'eq'),
    adjunto: IS_ARCH[n],
    ruta: rutaLeer(p)
  };
  if (!datos.ruta) return;
  if (!datos.cliente.NIT || !datos.cliente.NOMBRE || !datos.solicitud.CANAL || !datos.solicitud.COMERCIAL){ toast('Complete los campos obligatorios (*): NIT, nombre, canal y comercial.', 'err'); return; }
  var cf = IS_DAT[n].d.CONFORMIDAD || {};
  if (IS_DAT[n].d.TIPO_DOCUMENTO === 'SC' && (cf.SOLICITA === 'NO' || (cf.SOLICITA === 'SI' && cf.NORMA && cf.REGLA))) datos.conformidad = cf;
  if (val(p + 'modo') === 'contrato') {
    datos.contrato = { TIPO: val(p + 'ktipo'), NUMERO: val(p + 'knum'), ORDEN_SERVICIO: val(p + 'kos') };
    if (!datos.contrato.NUMERO){ toast('Indique el número del contrato.', 'err'); return; }
    if (!datos.equipos.length){ toast('Registre los equipos de la orden de servicio.', 'err'); return; }
  }
  verificarClienteGen(datos.cliente.NIT, datos.cliente.NOMBRE, function(c){
    datos.cliente.NIT = c.NIT; datos.cliente.NOMBRE = c.NOMBRE; setv(p + 'nit', c.NIT); setv(p + 'nombre', c.NOMBRE);
    if (c.CONFIRMAR_NUEVO) datos.cliente.CONFIRMAR_NUEVO = true;
    srv('ventasCrearSolicitud', [datos], function(r){
      delete IS_ARCH[n]; delete IS_DAT[n];
      $('is-' + n).innerHTML = '<div class="aviso ok">✅ ' + (r.NUM_OT ? 'Orden de servicio <b>' + esc(r.ID) + '</b> registrada con la OT <b>' + esc(r.NUM_OT) + '</b>' : 'Solicitud <b>' + esc(r.ID) + '</b> registrada') +
        ' para ' + esc(c.NOMBRE) + '. El PDF quedó guardado como soporte.' + (r.mensajeRuta ? ' ' + esc(r.mensajeRuta) : '') + ' <button class="btn mini" onclick="abrirDetalle(\'' + esc(r.ID) + '\')">Abrir</button> <button class="btn mini sec" onclick="isQuitar(' + n + ')">Cerrar</button></div>';
      toast(r.NUM_OT ? 'OT ' + r.NUM_OT + ' asignada.' : 'Solicitud ' + r.ID + ' registrada.');
      srv('ventasCatalogos', [], function(cc){ CAT = cc; pintarDatalistClientes(); pintarFiltrosComercial(); });
    }, function(e){ if (/CLIENTE_NO_COINCIDE|pertenece a la|GCV-FO-004|SECUENCIA/.test(String(e))) errorModal('Solicitud de calibración', e); });
  });
}
(function(){
  var z = $('is-zona'); if (!z) return;
  z.addEventListener('dragover', function(e){ e.preventDefault(); z.classList.add('sobre'); });
  z.addEventListener('dragleave', function(){ z.classList.remove('sobre'); });
  z.addEventListener('drop', function(e){ e.preventDefault(); z.classList.remove('sobre'); isArchivos(e.dataTransfer.files); });
})();
// ---- Cotizaciones (GCV-FO-003) en PDF, Word o Excel: se asocian a su solicitud, SC y/o OT
var CZ_ARCH = {}, CZ_DAT = {}, CZ_N = 0;
function czArchivos(files){
  Array.prototype.forEach.call(files || [], function(f){
    var n = ++CZ_N, ext = (f.name.split('.').pop() || '').toLowerCase();
    var tipo = ext === 'pdf' || /^image\//.test(f.type) ? 'pdf' : (['xlsx', 'xls', 'xlsm'].indexOf(ext) !== -1 ? 'excel' : (['docx', 'doc'].indexOf(ext) !== -1 ? 'word' : ''));
    var card = document.createElement('div'); card.className = 'is-card'; card.id = 'cz-' + n;
    card.innerHTML = '<div class="is-tit"><span>💲 ' + esc(f.name) + '</span></div><div class="aviso info">⏳ ' + (tipo === 'pdf' ? 'Leyendo la cotización con IA…' : 'Preparando…') + '</div>';
    $('cz-lista').insertBefore(card, $('cz-lista').firstChild);
    var error = function(msg){ card.innerHTML = '<div class="is-tit"><span>💲 ' + esc(f.name) + '</span><button class="btn mini sec" onclick="czQuitar(' + n + ')">Quitar</button></div><div class="aviso err">' + esc(msg) + '</div>'; };
    if (!tipo) { error('Formato no admitido: suba la cotización en PDF, Word o Excel.'); return; }
    if (f.size > 19 * 1024 * 1024) { error('El archivo supera 19 MB.'); return; }
    var url = ''; try { url = URL.createObjectURL(f); } catch (e) {}
    var r = new FileReader();
    r.onload = function(){
      var adj = { base64: String(r.result).split(',')[1], mime: f.type || (tipo === 'word' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : tipo === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'), nombre: f.name };
      var listo = function(d){ CZ_ARCH[n] = adj; CZ_DAT[n] = { d: d, url: url }; czPintar(n); };
      var fallo = function(e){ error('No se pudo leer: ' + (e && e.message ? e.message : String(e))); };
      if (tipo === 'pdf') { srv('ventasLeerCotizacionArchivo', [adj.base64, adj.mime, f.name], listo, fallo); return; }
      if (tipo === 'excel') {
        imCargarXLSX(function(){
          var d;
          try { d = czLeerExcel(XLSX.read(Uint8Array.from(atob(adj.base64), function(ch){ return ch.charCodeAt(0); }), { type: 'array', cellNF: true }), f.name); } catch (e) { fallo(e); return; }
          srv('ventasPrepararCotizacion', [d], listo, fallo);
        });
        return;
      }
      // Word: no se lee el contenido; se toma el número del nombre del archivo (p. ej. «Cotización 2026-0005.docx»)
      srv('ventasPrepararCotizacion', [czDesdeNombre(f.name)], listo, fallo);
    };
    r.readAsDataURL(f);
  });
}
function czDesdeNombre(nombre){
  var m = String(nombre).match(/(\d{4})\s*-\s*(\d{3,5})/), sc = String(nombre).match(/S\.?\s*C\s*-?\s*\d+(?:-\d+)?/i), ot = String(nombre).match(/O\.?\s*T\s*-?\s*\d+(?:-\d{2})?/i);
  return { archivo: nombre, NUM_COTIZACION: m ? m[1] + '-' + m[2] : '', NUM_SC: sc ? sc[0] : '', NUM_OT: ot ? ot[0] : '' };
}
// GCV-FO-003 en Excel: «Cotización No. …», cliente (encima de «Nit:»), NIT y totales
function czLeerExcel(wb, nombre){
  var d = czDesdeNombre(nombre);
  wb.SheetNames.forEach(function(nh){
    var filas = imFilasHoja(wb.Sheets[nh]);
    filas.forEach(function(f, i){
      f.forEach(function(v, j){
        var t = String(v || ''), m;
        if (!d.NUM_COTIZACION && (m = t.match(/cotizaci[oó]n\s*(?:no\.?|n°|nº|#)?\s*:?\s*([A-Z0-9][\w-]*)/i)) && /\d/.test(m[1])) d.NUM_COTIZACION = m[1];
        if (!d.NIT && (m = t.match(/^\s*nit\s*:?\s*([\d.\- ]{5,})/i))) {
          d.NIT = m[1].trim();
          for (var k = i - 1; k >= Math.max(0, i - 3) && !d.CLIENTE; k--) { var c = String(filas[k][j] || '').trim(); if (c && !/señor|cliente|^ref/i.test(c)) d.CLIENTE = c; }
        }
        if (/^\s*totales\s*$/i.test(t)) {
          // Fila de totales del GCV-FO-003: subtotal · IVA · total con IVA
          var nums = f.slice(j + 1).map(function(v){ return czNumFila(['', v], 0); }).filter(function(v){ return v !== ''; });
          if (nums.length >= 3) { d.VALOR_SUBTOTAL = nums[0]; d.VALOR_IVA = nums[1]; d.VALOR_TOTAL = nums[2]; } else if (nums.length) d.VALOR_TOTAL = nums[nums.length - 1];
        }
        else if (/^\s*(sub\s*total)\s*$/i.test(t)) d.VALOR_SUBTOTAL = czNumFila(f, j);
        else if (/^\s*(total\s*iva|iva)\s*$/i.test(t)) d.VALOR_IVA = czNumFila(f, j);
        else if (/^\s*(valor\s*)?total(\s*(a\s*pagar|general|cotizaci[oó]n))?\s*$/i.test(t)) d.VALOR_TOTAL = czNumFila(f, j);
        if (/^\s*ref\.?\s/i.test(t) && !d.REFERENCIA) d.REFERENCIA = t.replace(/^\s*ref\.?\s*/i, '').trim();
      });
    });
  });
  return d;
}
function czNumFila(f, desde){
  for (var j = f.length - 1; j > desde; j--) { var v = String(f[j] || '').replace(/[^\d.,-]/g, ''); if (v) { var n = Number(v.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); if (n) return n; } }
  return '';
}
function czQuitar(n){ var c = $('cz-' + n); if (c) c.remove(); delete CZ_ARCH[n]; delete CZ_DAT[n]; }
function czPintar(n){
  var x = CZ_DAT[n], d = x.d, p = 'cz-' + n + '-', q = d.destino;
  var f = function(id, l, v, t){ return '<label class="campo"><span>' + l + '</span><input id="' + p + id + '" type="' + (t || 'text') + '" value="' + esc(v) + '"></label>'; };
  var leido = '<div class="aviso info">Leído: cotización <b>' + esc(d.NUM_COTIZACION || '—') + '</b>' + (d.CLIENTE ? ' · ' + esc(d.CLIENTE) : '') + (d.NIT ? ' · NIT ' + esc(d.NIT) : '') +
    (d.VALOR_TOTAL ? ' · total <b>' + money(d.VALOR_TOTAL) + '</b>' : '') + (d.FECHA ? ' · ' + fFecha(d.FECHA) : '') + '</div>';
  var dest = q ? '<div class="aviso ' + (q.COINCIDE ? 'ok' : 'err') + '">' + (q.COINCIDE ? '📦 Se asociará a: ' : '⛔ El cliente no coincide: ') +
      '<b>' + esc(q.ID) + '</b>' + (q.SC ? ' · SC <b>' + esc(q.SC) + '</b>' : ' · sin SC') + (q.NUM_OT ? ' · <b>' + esc(q.NUM_OT) + '</b>' : ' · sin OT') +
      ' · ' + esc(q.CLIENTE) + ' · ' + esc(q.ESTADO) + (q.URL_COTIZACION ? ' · <a href="' + esc(q.URL_COTIZACION) + '" target="_blank">ya tiene cotización ' + esc(q.NUM_COTIZACION_DOC) + '</a>' : '') +
      (q.AVISO ? '<br>' + esc(q.AVISO) : '') + '</div>'
    : d.conflicto ? '<div class="aviso err">⛔ ' + esc(d.conflicto) + '</div>'
    : '<div class="aviso adv">Indique a qué SC y/o OT (o cotización) pertenece y pulse «Buscar».</div>';
  $('cz-' + n).innerHTML = '<div class="is-tit"><span>💲 ' + esc(d.archivo) + (x.url ? ' · <a href="' + x.url + '" target="_blank">Ver documento</a>' : '') + '</span><button class="btn mini sec" onclick="czQuitar(' + n + ')">Descartar</button></div>' + leido +
    '<div class="grid g4" style="align-items:end;margin-top:8px">' +
      f('cot', 'N° de cotización', d.NUM_COTIZACION) + f('sc', 'N° de SC', q ? q.SC || d.NUM_SC : d.NUM_SC) + f('ot', 'N° de OT', q ? q.NUM_OT || d.NUM_OT : d.NUM_OT) + f('val', 'Valor total', d.VALOR_TOTAL, 'number') +
      ((d.candidatos || []).length ? '<label class="campo col2"><span>O elija una solicitud de este cliente</span><select id="' + p + 'cand" onchange="czElegir(' + n + ', this.value)"><option value="">— Elegir —</option>' +
        d.candidatos.map(function(c){ return '<option value="' + esc(c.ID) + '">' + esc(c.ID + (c.SC ? ' · ' + c.SC : '') + (c.NUM_OT ? ' · ' + c.NUM_OT : '') + ' · ' + c.ESTADO + (c.TIENE ? ' · ya tiene cotización' : '')) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label class="campo"><span>&nbsp;</span><button class="btn sec" onclick="czBuscar(' + n + ')">Buscar</button></label></div>' + dest +
    (q && q.COINCIDE ? '<div class="acciones" style="margin-top:10px"><button class="btn ok" onclick="czAsociar(' + n + ')">Asociar cotización a ' + esc(q.NUM_OT || q.SC || q.ID) + '</button></div>' : '');
  if (q && !q.COINCIDE) errorModal('El cliente no coincide', 'La cotización es de «' + (d.CLIENTE || '') + '», pero ' + (q.NUM_OT || q.ID) + ' es de «' + q.CLIENTE + '». No pertenecen al mismo paquete.');
  else if (d.conflicto) errorModal('Las referencias no son del mismo paquete', d.conflicto);
}
function czElegir(n, id){ if (!id) return; var c = CZ_DAT[n].d.candidatos.filter(function(x){ return x.ID === id; })[0]; setv('cz-' + n + '-cot', id); setv('cz-' + n + '-sc', c.SC); setv('cz-' + n + '-ot', c.NUM_OT); czBuscar(n, true); }
function czBuscar(n, porId){
  var x = CZ_DAT[n], d = x.d, p = 'cz-' + n + '-';
  var sc = val(p + 'sc'), ot = val(p + 'ot'), cot = val(p + 'cot');
  if (!sc && !ot && !cot){ toast('Escriba el N° de SC, de OT o de cotización.', 'err'); return; }
  d.NUM_COTIZACION = cot; d.VALOR_TOTAL = val(p + 'val');
  srv('ventasConsultarCotizacion', [porId ? '' : sc, porId ? '' : ot, cot, d.NIT, d.CLIENTE], function(q){ d.destino = q; d.conflicto = ''; czPintar(n); },
    function(e){ if (/PAQUETE_DISTINTO/.test(String(e))) errorModal('Las referencias no son del mismo paquete', e); });
}
function czAsociar(n, reemplazar){
  var x = CZ_DAT[n], d = x.d, q = d.destino, p = 'cz-' + n + '-';
  var datos = { adjunto: CZ_ARCH[n], NUM_COTIZACION: val(p + 'cot') || d.NUM_COTIZACION, FECHA: d.FECHA, CLIENTE: d.CLIENTE, NIT: d.NIT,
    VALOR_SUBTOTAL: d.VALOR_SUBTOTAL, VALOR_IVA: d.VALOR_IVA, VALOR_TOTAL: val(p + 'val') || d.VALOR_TOTAL, reemplazar: !!reemplazar };
  srv('ventasAsociarCotizacion', [q.ID, datos], function(r){
    delete CZ_ARCH[n];
    $('cz-' + n).innerHTML = '<div class="aviso ok">✅ Cotización <b>' + esc(datos.NUM_COTIZACION || '') + '</b> asociada a ' + esc(r.ID) + (r.SC ? ' · SC ' + esc(r.SC) : '') + (r.NUM_OT ? ' · ' + esc(r.NUM_OT) : '') +
      (r.VALOR_TOTAL ? ' · valor ' + money(r.VALOR_TOTAL) : '') + '. <a href="' + esc(r.URL) + '" target="_blank">Ver en Drive</a> <button class="btn mini" onclick="abrirDetalle(\'' + esc(r.ID) + '\')">Abrir</button> <button class="btn mini sec" onclick="czQuitar(' + n + ')">Cerrar</button></div>';
    toast('Cotización asociada.');
  }, function(e){
    if (/YA_TIENE/.test(String(e))) { if (confirm(String(e).replace(/^[A-Z_]+:\s*/, '') + '\n\n¿Reemplazarla?')) czAsociar(n, true); }
    else if (/CLIENTE_NO_COINCIDE/.test(String(e))) errorModal('El cliente no coincide', e);
  });
}
(function(){
  var z = $('cz-zona'); if (!z) return;
  z.addEventListener('dragover', function(e){ e.preventDefault(); z.classList.add('sobre'); });
  z.addEventListener('dragleave', function(){ z.classList.remove('sobre'); });
  z.addEventListener('drop', function(e){ e.preventDefault(); z.classList.remove('sobre'); czArchivos(e.dataTransfer.files); });
})();
// ---- Clientes parecidos en cargas masivas: el usuario decide si es el mismo cliente o uno nuevo
var IM_DEC = {};   // clave NIT → NIT del cliente existente | 'NUEVO'
function imConfirmarHtml(lista, reintentar){
  if (!lista || !lista.length) return '';
  return '<div class="aviso adv" style="margin-top:8px"><b>Confirme estos clientes (' + lista.length + ').</b> Su nombre se parece al de un cliente ya registrado con otro NIT. Elija si es el mismo cliente (se usará el registrado) o si es un cliente nuevo.</div>' +
    '<div class="tabla-cont"><table><thead><tr><th>Cliente en lo pegado</th><th>NIT</th><th>Filas / OT</th><th>¿Quién es?</th></tr></thead><tbody>' +
    lista.map(function(p){
      return '<tr><td><b>' + esc(p.NOMBRE) + '</b></td><td>' + esc(p.NIT) + '</td><td>' + esc((p.filas || []).join(', ')) + '</td><td><select class="im-dec" data-clave="' + esc(p.CLAVE) + '">' +
        '<option value="">— Elegir —</option>' + p.parecidos.map(function(x){ return '<option value="' + esc(x.NIT) + '">Es el mismo: ' + esc(x.NOMBRE) + ' (NIT ' + esc(x.NIT) + ')</option>'; }).join('') +
        '<option value="NUEVO">Es un cliente nuevo</option></select></td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="acciones" style="margin-top:6px"><button class="btn" onclick="imAplicarDecisiones(function(){ ' + reintentar + '; })">Aplicar y volver a revisar</button></div>';
}
function imAplicarDecisiones(despues){
  var sels = document.querySelectorAll('select.im-dec'), faltan = 0;
  Array.prototype.forEach.call(sels, function(x){ if (x.value) IM_DEC[x.getAttribute('data-clave')] = x.value; else faltan++; });
  if (faltan && !confirm(faltan + ' cliente(s) sin decidir seguirán pendientes. ¿Continuar?')) return;
  despues();
}
// ---- Clientes y contratos
function icDatos(){
  var cls = imFilas('ic-cl', 2).filter(function(c){ return c[0] && !/^nit/i.test(c[0]); }).map(function(c){
    return { NIT: c[0], NOMBRE: c[1], TIPO_CLIENTE: /p[uú]blic/i.test(c[2] || '') ? 'Público' : (c[2] ? 'Privado' : ''), CONTACTO: c[3] || '', TELEFONO: c[4] || '', CORREO: c[5] || '', DIRECCION: c[6] || '', CIUDAD: c[7] || '', CORREO_FACTURACION: c[8] || '' };
  });
  var ks = imFilas('ic-k', 2).filter(function(c){ return c[0] && !/^nit/i.test(c[0]); }).map(function(c){
    return { CLIENTE_NIT: c[0], NUM_CONTRATO: c[1], TIPO: c[2] || '', OBJETO: c[3] || '', F_INICIO: imFecha(c[4]), F_FIN: imFecha(c[5]), VALOR: String(c[6] || '').replace(/[^\d,]/g, '').replace(',', '.'), ESTADO: c[7] || '' };
  });
  return { cls: cls, ks: ks };
}
function icImportar(soloRevisar){
  var d = icDatos();
  if (!d.cls.length && !d.ks.length){ toast('Pegue los clientes y/o contratos.', 'err'); return; }
  if (!soloRevisar && !confirm('¿Importar ' + d.cls.length + ' cliente(s) y ' + d.ks.length + ' contrato(s)?')) return;
  srv('ventasImportarClientes', [d.cls, d.ks, { soloRevisar: soloRevisar, decisiones: IM_DEC }], function(r){
    var nuevos = r.clientes.filter(function(x){ return x.NUEVO; }).length;
    $('ic-res').innerHTML = '<div class="aviso ' + (r.clientes.length || r.contratos.length ? 'ok' : 'adv') + '"><b>' + (soloRevisar ? 'Revisión: ' : '') +
      r.clientes.length + ' cliente(s)</b> (' + nuevos + ' nuevo(s), ' + (r.clientes.length - nuevos) + ' ya registrado(s): se completan sus datos) · <b>' + r.contratos.length + ' contrato(s)</b>' +
      (r.omitidos.length ? ' · ' + r.omitidos.length + ' omitido(s)' : '') + '</div>' +
      imConfirmarHtml(r.confirmar, 'icImportar(true)') +
      (r.omitidos.length ? '<div class="aviso adv" style="margin-top:8px"><b>Omitidos:</b><br>' + r.omitidos.map(esc).join('<br>') + '</div>' : '');
    if (!soloRevisar) {
      toast('Clientes y contratos cargados.');
      if (!(r.confirmar || []).length) { setv('ic-cl', ''); setv('ic-k', ''); }
      srv('ventasCatalogos', [], function(c){ CAT = c; pintarDatalistClientes(); });
    }
  });
}
function imLeerRegistro(){
  srv('ventasLeerRegistroFO002', [], function(lista){
    if (!lista.length){ toast('El registro GCV-FO-002 no tiene OT.', 'adv'); return; }
    setv('im-ot', lista.map(function(r){ return [r.FECHA, r.CLIENTE, r.NIT, r.REFERENCIA, r.TIPO_SERVICIO, r.SOLICITUD_CAL, r.LUGAR, r.OT].join('\t'); }).join('\n'));
    toast(lista.length + ' OT leídas del registro. Revise y luego Importar.');
  });
}

/* ============================= NUEVA SOLICITUD ============================= */
function limpiarNueva(){
  ['ns-ref','ns-nit','ns-nombre','ns-contacto','ns-tel','ns-correo','ns-ciudad','ns-dir','ns-correofac','ns-obs'].forEach(function(i){ setv(i, ''); });
  setv('ns-fecha', hoyISO());
  $('ns-canal').innerHTML = opciones(CAT.canales, '', '-');
  setv('ns-comercial', '');
  $('ns-lugar').innerHTML = opciones(CAT.lugares, CAT.lugares[0]);
  $('ns-tipo').innerHTML = opciones(CAT.tiposCliente, 'Privado');
  eqEditor('ns-equipos', []);
  confEditor('ns-conf', {});
  $('ns-ktipo').innerHTML = opciones(CAT.tiposContrato || ['Contrato privado', 'Contrato público', 'Orden de servicio'], 'Contrato privado');
  ['ns-knum', 'ns-kos', 'ns-kllegada'].forEach(function(i){ setv(i, ''); });
  NS_NUEVO_OK = '';
  var r = document.querySelector('input[name=ns-modo][value=cotizacion]'); if (r) r.checked = true;
  modoNueva();
}
function modoContrato(){ var r = document.querySelector('input[name=ns-modo]:checked'); return !!r && r.value === 'contrato'; }
function modoNueva(){
  var k = modoContrato();
  $('ns-contrato').style.display = k ? '' : 'none';
  Array.prototype.forEach.call(document.querySelectorAll('.ns-modo'), function(l){ l.classList.toggle('on', l.querySelector('input').checked); });
  var b = document.querySelector('#v-nueva .btn.ok'); if (b) b.textContent = k ? 'Registrar orden de servicio y asignar OT' : 'Registrar solicitud';
  pintarContratosCliente();
}
// NIT comparable: solo dígitos y sin dígito de verificación (igual que en el servidor)
function claveNit(n){ var t = String(n || '').trim(), b = t.indexOf('-') > 0 ? t.slice(0, t.indexOf('-')) : t; return b.replace(/\D/g, '') || t.toUpperCase().replace(/\s+/g, ''); }
function contratosDe(nit){ var k = claveNit(nit); return (CAT.contratos || []).filter(function(x){ return k && claveNit(x.NIT) === k; }); }
function pintarContratosCliente(){
  var nit = val('ns-nit');
  $('dl-contratos').innerHTML = (nit ? contratosDe(nit) : (CAT.contratos || []))
    .map(function(x){ return '<option value="' + esc(x.NUMERO) + '">' + esc(x.TIPO) + (x.VIGENTE === false ? ' · VENCIDO' : '') + (x.F_FIN ? ' · hasta ' + fFecha(x.F_FIN) : '') + '</option>'; }).join('');
}
function cargarClienteNueva(c){
  setv('ns-nit', c.NIT); setv('ns-nombre', c.NOMBRE); setv('ns-tipo', c.TIPO_CLIENTE || 'Privado');
  if (c.CONTACTO) setv('ns-contacto', c.CONTACTO); if (c.TELEFONO) setv('ns-tel', c.TELEFONO); if (c.CORREO) setv('ns-correo', c.CORREO); if (c.CIUDAD) setv('ns-ciudad', c.CIUDAD);
  NS_NUEVO_OK = '';
  pintarContratosCliente();
  var ks = contratosDe(c.NIT).filter(function(x){ return x.VIGENTE !== false; });
  if (modoContrato() && ks.length && !val('ns-knum')) { setv('ns-knum', ks[ks.length - 1].NUMERO); setv('ns-ktipo', ks[ks.length - 1].TIPO); }
}
var NS_NUEVO_OK = '';   // NIT que el usuario confirmó como cliente nuevo (aunque se parezca a otro)
$('ns-nit').onchange = function(){
  var c = (CAT.clientes || []).filter(function(x){ return claveNit(x.NIT) === claveNit(val('ns-nit')); })[0];
  if (!c) { pintarContratosCliente(); return; }
  cargarClienteNueva(c);
  toast('Cliente existente cargado: ' + c.NOMBRE);
};
$('ns-nombre').onchange = function(){ verificarClienteNueva(function(){}); };
$('ns-knum').onchange = function(){
  var k = contratosDe(val('ns-nit')).filter(function(x){ return String(x.NUMERO).toUpperCase().replace(/[^A-Z0-9]/g, '') === val('ns-knum').toUpperCase().replace(/[^A-Z0-9]/g, ''); })[0];
  if (k) { setv('ns-ktipo', k.TIPO); if (k.VIGENTE === false) toast('El contrato ' + k.NUMERO + ' no está vigente. Actualícelo en Clientes → Contratos.', 'adv'); }
  else if (val('ns-knum')) toast('Contrato no registrado para este cliente: se registrará con esta orden de servicio.', 'adv');
};
// Antes de crear la solicitud: mismo NIT → se usa el cliente registrado; nombre parecido con otro NIT → se pide confirmación
function verificarClienteNueva(continuar){
  var nit = val('ns-nit'), nombre = val('ns-nombre');
  if (!nit || !nombre) { continuar(); return; }
  srv('ventasVerificarCliente', [{ NIT: nit, NOMBRE: nombre }], function(r){
    if (val('ns-nit') !== nit || val('ns-nombre') !== nombre) { continuar(); return; }   // el cliente ya cambió mientras se verificaba
    if (r.mismoNit) {
      if (r.mismoNit.NOMBRE !== nombre) { setv('ns-nombre', r.mismoNit.NOMBRE); toast('El NIT ya está registrado como «' + r.mismoNit.NOMBRE + '»: se usa ese cliente.', 'adv'); }
      continuar(); return;
    }
    if (!r.parecidos.length || NS_NUEVO_OK === claveNit(nit)) { continuar(); return; }
    elegirCliente({ NIT: nit, NOMBRE: nombre }, r.parecidos, function(eleccion){
      if (eleccion === 'NUEVO') { NS_NUEVO_OK = claveNit(nit); continuar(); return; }
      var c = (CAT.clientes || []).filter(function(x){ return claveNit(x.NIT) === claveNit(eleccion.NIT); })[0] || eleccion;
      cargarClienteNueva(c);
      toast('Se usará el cliente registrado: ' + c.NOMBRE + ' (NIT ' + c.NIT + ').');
      continuar();
    });
  });
}
/** Ventana de confirmación: ¿el cliente escrito es uno de los registrados o es nuevo? */
function elegirCliente(c, parecidos, cb){
  var h = '<div class="aviso adv">Ya hay ' + (parecidos.length === 1 ? 'un cliente registrado' : parecidos.length + ' clientes registrados') + ' con un nombre parecido a <b>«' + esc(c.NOMBRE) + '»</b> (NIT ' + esc(c.NIT) + '). Para no duplicar clientes, confirme:</div>' +
    parecidos.map(function(p, i){ return '<label class="ns-modo" style="margin-top:8px"><input type="radio" name="ec-op" value="' + i + '"' + (i === 0 ? ' checked' : '') + '><span><b>Es el mismo cliente: ' + esc(p.NOMBRE) + '</b><small>NIT ' + esc(p.NIT) + (p.CIUDAD ? ' · ' + esc(p.CIUDAD) : '') + ' — se usará el cliente ya registrado</small></span></label>'; }).join('') +
    '<label class="ns-modo" style="margin-top:8px"><input type="radio" name="ec-op" value="NUEVO"><span><b>Es un cliente nuevo</b><small>Registrar «' + esc(c.NOMBRE) + '» con NIT ' + esc(c.NIT) + ' como cliente distinto</small></span></label>';
  modal('Confirmar cliente', h, function(){
    var r = document.querySelector('input[name=ec-op]:checked'); if (!r) return;
    cerrarModal();
    cb(r.value === 'NUEVO' ? 'NUEVO' : parecidos[Number(r.value)]);
  }, 'Continuar');
}
function guardarSolicitud(){
  var datos = {
    solicitud: { FECHA_RECEPCION: val('ns-fecha'), CANAL: val('ns-canal'), COMERCIAL: val('ns-comercial'), LUGAR_SERVICIO: val('ns-lugar'), REFERENCIA: val('ns-ref'), OBSERVACIONES: val('ns-obs') },
    cliente: { NIT: val('ns-nit'), NOMBRE: val('ns-nombre'), TIPO_CLIENTE: val('ns-tipo'), CONTACTO: val('ns-contacto'), TELEFONO: val('ns-tel'), CORREO: val('ns-correo'), CIUDAD: val('ns-ciudad'), DIRECCION: val('ns-dir'), CORREO_FACTURACION: val('ns-correofac') },
    equipos: eqLeer('ns-equipos'),
    conformidad: confLeer('ns-conf')
  };
  if (!datos.cliente.NIT || !datos.cliente.NOMBRE || !datos.solicitud.CANAL || !datos.solicitud.COMERCIAL){ toast('Complete los campos obligatorios (*).', 'err'); return; }
  if (modoContrato()) {
    datos.contrato = { TIPO: val('ns-ktipo'), NUMERO: val('ns-knum'), ORDEN_SERVICIO: val('ns-kos'), F_LLEGADA_EQUIPOS: val('ns-kllegada') };
    if (!datos.contrato.NUMERO){ toast('Indique el número del contrato u orden de servicio.', 'err'); return; }
  }
  verificarClienteNueva(function(){
    // El cliente pudo cambiar por el registrado
    datos.cliente.NIT = val('ns-nit'); datos.cliente.NOMBRE = val('ns-nombre');
    if (NS_NUEVO_OK && NS_NUEVO_OK === claveNit(datos.cliente.NIT)) datos.cliente.CONFIRMAR_NUEVO = true;
    crearSolicitud(datos);
  });
}
function crearSolicitud(datos){
  srv('ventasCrearSolicitud', [datos], function(r){
    toast(r.NUM_OT ? 'Orden de servicio ' + r.ID + ' registrada con la OT ' + r.NUM_OT + '.' : 'Solicitud ' + r.ID + ' registrada.');
    srv('ventasCatalogos', [], function(c){ CAT = c; pintarDatalistClientes(); pintarFiltrosComercial(); limpiarNueva(); });
    abrirDetalle(r.ID);
  });
}

/* =============================== COTIZACIONES =============================== */
function cargarCotizaciones(){
  var f = { cliente: val('ct-cliente'), estado: val('ct-estado'), comercial: val('ct-comercial'), desde: val('ct-desde'), hasta: val('ct-hasta'), texto: val('ct-texto') };
  srv('ventasListarSolicitudes', [f], function(lista){
    LISTA_CT = lista;
    var h = '<thead><tr><th></th><th>ID</th><th>Ver.</th><th>Recepción</th><th>Canal</th><th>Cliente</th><th>Tipo</th><th>Comercial</th><th>Estado</th><th class="num">Valor total</th><th>Contrato / OS</th><th>OT</th><th>Compromiso</th></tr></thead><tbody>';
    if (!lista.length) h += '<tr><td colspan="13" class="vacio">Sin resultados</td></tr>';
    lista.forEach(function(s){
      h += '<tr class="click" onclick="abrirDetalle(\'' + esc(s.ID) + '\')"><td><span class="sem ' + esc(s.SEMAFORO) + '"></span></td><td><b>' + esc(s.ID) + '</b></td><td>' + esc(s.VERSION) + '</td><td>' + fFecha(s.FECHA_RECEPCION) + '</td><td>' + esc(s.CANAL) + '</td><td>' + esc(s.CLIENTE) + '</td><td>' + esc(s.TIPO_CLIENTE) + '</td><td>' + esc(s.COMERCIAL) + '</td><td><span class="chip">' + esc(s.ESTADO) + '</span></td><td class="num">' + money(s.VALOR_TOTAL) + '</td><td>' + esc(s.NUM_CONTRATO) + '</td><td>' + esc(s.NUM_OT) + '</td><td>' + fFecha(s.F_COMPROMISO) + '</td></tr>';
    });
    $('ct-tabla').innerHTML = h + '</tbody>';
  });
}
function exportarCSV(){
  if (!LISTA_CT.length){ toast('No hay datos para exportar.', 'adv'); return; }
  var cols = ['ID','VERSION','FECHA_RECEPCION','CANAL','CLIENTE_NIT','CLIENTE','TIPO_CLIENTE','COMERCIAL','ESTADO','VALOR_TOTAL','NUM_CONTRATO','NUM_OT','F_COMPROMISO','SEMAFORO'];
  var nl = String.fromCharCode(10);
  var csv = cols.join(';') + nl + LISTA_CT.map(function(s){ return cols.map(function(c){ return '"' + String(s[c] === undefined ? '' : s[c]).replace(/"/g, '""') + '"'; }).join(';'); }).join(nl);
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'ventas_cotizaciones_' + hoyISO() + '.csv'; a.click();
}

/* ================================= DETALLE ================================= */
var HITOS = [['FECHA_RECEPCION','Recibida'],['F_REVISION','Revisada'],['F_COTIZADA','Cotizada'],['F_ACEPTADA','Aceptada'],['F_SOLICITUD_CAL','Sol. calibración'],['F_LLEGADA_EQUIPOS','Llegada equipos'],['F_PROGRAMADA','Programada'],['F_EJECUCION','Ejecución'],['F_RESULTADOS','Resultados'],['F_ENTREGADA','Entregada'],['F_FACTURADA','Facturada']];

function abrirDetalle(id){
  if (!id) return;
  irA('detalle'); setv('dt-id', id);
  srv('ventasDetalle', [id], function(d){ DET = d; pintarDetalle(); });
}
function recargarDetalle(sub){ srv('ventasDetalle', [DET.solicitud.ID], function(d){ DET = d; pintarDetalle(sub); }); }

function pintarDetalle(sub){
  var s = DET.solicitud, c = DET.cliente || {};
  var semTxt = s.SEMAFORO === 'gris' ? 'Sin plazo activo' : (s.DIAS_TRANSCURRIDOS + ' de ' + s.DIAS_PLAZO + ' días hábiles' + (s.DIAS_RESTANTES < 0 ? ' (vencido)' : ''));
  var h = '<div class="tarjeta"><div class="det-cab">' +
    '<div><div class="grande">' + esc(s.ID) + ' <small style="font-size:13px;color:var(--suave)">V' + esc(s.VERSION) + '</small></div><div>' + esc(s.CLIENTE) + ' · NIT ' + esc(s.CLIENTE_NIT) + ' · ' + esc(s.TIPO_CLIENTE) + '</div></div>' +
    '<div><span class="chip">' + esc(s.ESTADO) + '</span></div>' +
    '<div><span class="sem ' + esc(s.SEMAFORO) + '"></span> ' + esc(semTxt) + '</div>' +
    '<div><b>' + money(s.VALOR_TOTAL) + '</b><div style="font-size:11px;color:var(--suave)">Comercial: ' + esc(s.COMERCIAL) + '</div></div>' +
    '<div class="acciones derecha">' +
      (s.SIGUIENTES.length ? '<select id="dt-sig">' + opciones(s.SIGUIENTES) + '</select><button class="btn" onclick="formEstado(val(\'dt-sig\'))">Avanzar estado</button>' : '') +
      (['Cotizada','En seguimiento'].indexOf(s.ESTADO) > -1 ? '<button class="btn sec" onclick="formSeguimiento()">Registrar seguimiento</button>' : '') +
      '<button class="btn sec" onclick="formNota()">Nota</button>' +
    '</div></div>';
  var flags = '';
  if (s.ACT_FO003 === 'PENDIENTE' || s.ACT_FO004 === 'PENDIENTE') flags += '<div class="aviso adv">Modificación de alcance (5.6): actualizar ' + (s.ACT_FO003 === 'PENDIENTE' ? 'GCV-FO-003 ' : '') + (s.ACT_FO004 === 'PENDIENTE' ? 'GCV-FO-004' : '') + '. Use la pestaña Documentos para regenerarlos.</div>';
  if (s.REVISION_CONTRATO_REABIERTA === 'SÍ') flags += '<div class="aviso err">Revisión del contrato reabierta (5.5): registre la re-revisión en la pestaña "Revisión" antes de emitir resultados.</div>';
  if (s.TIPO_CIERRE === 'Desistimiento') flags += '<div class="aviso err">Cerrada por desistimiento. Motivo: ' + esc(s.MOTIVO_CIERRE) + '</div>';
  if (/^NO APLICA/.test(String(s.ACT_FO003 || ''))) flags += '<div class="aviso ok">Orden de servicio por contrato: <b>sin cotización</b>. La revisión y aceptación están cubiertas por el ' + esc(s.TIPO_ACEPTACION) + ' N° <b>' + esc(s.NUM_CONTRATO) + '</b>' + (s.NUM_OT ? ' · OT <b>' + esc(s.NUM_OT) + '</b>' : '') + '.</div>';
  if (!s.NUM_OT && ['Recibida', 'En revisión de requisitos'].indexOf(s.ESTADO) > -1) flags += '<div class="aviso info">📦 ¿Esta solicitud (SC) pertenece a una orden de trabajo que ya existe? <button class="btn mini" onclick="formUnirOT()">Unir a su OT</button></div>';
  if (!s.NUM_OT && s.OT_PREVISTA) flags += '<div class="aviso info">🔢 Consecutivo de la SC: <b>' + esc(s.CONSECUTIVO_FO004) + '</b> → la orden de trabajo será la <b>' + esc(s.OT_PREVISTA) + '</b> (misma secuencia).</div>';
  else if (!s.NUM_OT && s.SIGUIENTE_SC && ['Cotizada', 'En seguimiento', 'Cerrada por venta'].indexOf(s.ESTADO) > -1)
    flags += '<div class="aviso info">🔢 La SC y la OT llevan el mismo consecutivo. Siguiente libre: <b>' + esc(s.SIGUIENTE_SC) + '</b>. <button class="btn mini" onclick="reservarConsecutivo()">Asignar ' + esc(s.SIGUIENTE_SC) + ' para el GCV-FO-004</button></div>';
  if (s.URL_COTIZACION) flags += '<div class="aviso info">💲 Cotización cargada' + (s.NUM_COTIZACION_DOC ? ' N° <b>' + esc(s.NUM_COTIZACION_DOC) + '</b>' : '') + ': <a href="' + esc(s.URL_COTIZACION) + '" target="_blank">Ver cotización</a></div>';
  if (s.URL_SOLICITUD_CLIENTE) flags += '<div class="aviso info">📄 Documento con que el cliente pidió el servicio: <a href="' + esc(s.URL_SOLICITUD_CLIENTE) + '" target="_blank">Ver solicitud del cliente</a></div>';
  if (s.NUM_CONTRATO) flags += '<div class="aviso info">' + esc(s.TIPO_ACEPTACION) + ' N° <b>' + esc(s.NUM_CONTRATO) + '</b>: este número reemplaza al de la cotización en la orden de trabajo interna (5.7).</div>';
  h += flags;
  h += '<div class="hitos">' + HITOS.map(function(x){ return '<div class="hito' + (s[x[0]] ? ' hecho' : '') + '"><b>' + esc(x[1]) + '</b>' + fFecha(s[x[0]]) + '</div>'; }).join('') +
       '<div class="hito' + (s.F_COMPROMISO ? ' hecho' : '') + '"><b>Compromiso</b>' + fFecha(s.F_COMPROMISO) + '</div></div>' + rutaHtml(s) + '</div>';

  var tabs = [['general','General'],['timeline','Línea de tiempo'],['equipos','Equipos (' + DET.equipos.length + ')'],['revision','Revisión (' + DET.revisiones.length + ')'],['conformidad','Conformidad'],['terc','Tercerizados (' + DET.tercerizados.length + ')'],['docs','Documentos'],['versiones','Versiones (' + DET.versiones.length + ')'],['post','Postventa']];
  sub = sub || 'general';
  h += '<div class="subtabs">' + tabs.map(function(t){ return '<button data-s="' + t[0] + '" class="' + (t[0] === sub ? 'activo' : '') + '" onclick="subTab(\'' + t[0] + '\')">' + esc(t[1]) + '</button>'; }).join('') + '</div>';

  // General
  h += '<div class="subvista" id="sv-general"><div class="tarjeta"><div class="grid g4">' +
    campoE('CANAL','Canal','sel',CAT.canales) + campoE('COMERCIAL','Comercial') + campoE('LUGAR_SERVICIO','Lugar','sel',CAT.lugares) + campoE('TIPO_CLIENTE','Tipo cliente','sel',CAT.tiposCliente) +
    campoE('CONTACTO','Contacto') + campoE('TELEFONO_CONTACTO','Teléfono') + campoE('CORREO_CONTACTO','Correo') + campoE('F_LLEGADA_EQUIPOS','Llegada de equipos','date') +
    campoE('REFERENCIA','Referencia','',null,'col2') + campoE('F_PROXIMO_SEGUIMIENTO','Próximo seguimiento','date') + campoE('NUM_CONTRATO','N° contrato / orden de servicio') +
    campoE('OBSERVACIONES','Observaciones','area',null,'col4') +
    '</div><div class="acciones" style="margin-top:10px"><button class="btn" onclick="guardarGeneral()">Guardar cambios</button>' +
    '<span class="derecha" style="font-size:11px;color:var(--suave)">Dirección cliente: ' + esc(c.DIRECCION) + ' · ' + esc(c.CIUDAD) + ' · Recepción: ' + fFecha(s.FECHA_RECEPCION) + ' · Consecutivo FO-004: ' + esc(s.CONSECUTIVO_FO004 || '-') + ' · OT: ' + esc(s.NUM_OT || '-') + ' · Factura: ' + esc(s.NUM_FACTURA || '-') + '</span></div></div></div>';

  // Línea de tiempo
  h += '<div class="subvista" id="sv-timeline"><div class="tarjeta"><ul class="timeline">' +
    (DET.historial.length ? DET.historial.slice().reverse().map(function(x){
      return '<li class="' + (x.POSTERIOR_INICIO_TRABAJO === 'SÍ' ? 'post' : '') + '"><div class="f">' + esc(String(x.FECHA).replace('T',' ')) + ' · ' + esc(x.USUARIO) + '</div><b>' + esc(x.ACCION) + '</b>' +
        (x.ESTADO_ANTERIOR !== x.ESTADO_NUEVO && x.ESTADO_NUEVO ? ' <span class="chip">' + esc(x.ESTADO_ANTERIOR || '—') + ' → ' + esc(x.ESTADO_NUEVO) + '</span>' : '') +
        (x.OBSERVACION ? '<div>' + esc(x.OBSERVACION) + '</div>' : '') +
        (x.POSTERIOR_INICIO_TRABAJO === 'SÍ' ? '<div class="f">⚠ Modificación posterior al inicio del trabajo' + (x.PERSONAL_COMUNICADO ? ' · Comunicado a: ' + esc(x.PERSONAL_COMUNICADO) : '') + '</div>' : '') + '</li>';
    }).join('') : '<li>Sin registros</li>') + '</ul></div></div>';

  // Equipos
  h += '<div class="subvista" id="sv-equipos"><div class="tarjeta">' +
    (['Recibida','En revisión de requisitos'].indexOf(s.ESTADO) > -1 ? '<div class="aviso info">Antes de emitir la cotización puede editar libremente los equipos.</div>' :
     '<div class="aviso adv">La cotización ya fue emitida: cualquier cambio se registra como <b>modificación del alcance (5.6)</b>, genera una nueva versión, guarda la anterior, marca GCV-FO-003/004 para actualizar y notifica al laboratorio.' + (s.TRABAJO_INICIADO ? ' <b>El trabajo ya inició:</b> se reabrirá la revisión del contrato (5.5).' : '') + '</div>') +
    '<div id="dt-equipos"></div><div class="acciones" style="margin-top:10px"><button class="btn" onclick="guardarEquiposDet()">Guardar equipos</button></div>' +
    '<h3 style="margin-top:14px">Fechas compromiso por equipo</h3><div class="tabla-cont"><table><thead><tr><th>Ítem</th><th>Equipo</th><th>Magnitud</th><th>Servicio</th><th>Plazo</th><th>Compromiso</th><th>Estado</th></tr></thead><tbody>' +
    DET.equipos.map(function(e){ return '<tr><td>' + esc(e.ITEM) + '</td><td>' + esc(e.EQUIPO) + ' ' + esc(e.SERIE) + '</td><td>' + esc(e.MAGNITUD) + '</td><td>' + esc(e.TIPO_SERVICIO) + '</td><td>' + esc(e.PLAZO_DIAS) + ' d háb.</td><td>' + (fFecha(e.F_COMPROMISO) || '<i>al registrar llegada</i>') + '</td><td>' + esc(e.ESTADO_EQUIPO) + '</td></tr>'; }).join('') +
    '</tbody></table></div></div></div>';

  // Revisión
  var ultRev = DET.revisiones.length ? DET.revisiones[DET.revisiones.length - 1] : null;
  h += '<div class="subvista" id="sv-revision"><div class="tarjeta"><h3>Revisión de requisitos y capacidad (5.2)' + (s.TRABAJO_INICIADO || s.REVISION_CONTRATO_REABIERTA === 'SÍ' ? ' · Re-revisión de contrato (5.5)' : '') + '</h3>' +
    '<div class="grid g4">' +
      chk('PERSONAL_COMPETENTE','Personal competente') + chk('PATRONES','Patrones / equipos') + chk('METODO','Método') + chk('INSTALACIONES','Instalaciones') + chk('COND_AMBIENTALES','Condiciones ambientales') +
      '<label class="campo req"><span>Resultado</span><select id="rv-RESULTADO">' + opciones(CAT.resultadosRevision, '', '-') + '</select></label>' +
      '<label class="campo req"><span>Responsable técnico</span><select id="rv-RESP_TECNICO">' + opciones(CAT.tecnicos, '', '-') + '</select></label>' +
      '<label class="campo req"><span>Responsable comercial</span><input id="rv-RESP_COMERCIAL" autocomplete="off" value="' + esc(s.COMERCIAL) + '"></label>' +
    '</div><div id="rv-desv" style="display:none;margin-top:10px"><div class="aviso adv">Desviación técnica (5.4): es obligatorio registrar la notificación al cliente. Si la cotización ya había sido emitida se reabre con una nueva versión.</div><div class="grid g3">' +
      '<label class="campo req col3"><span>Descripción de la desviación</span><textarea id="rv-DESVIACION"></textarea></label>' +
      '<label class="campo req"><span>Fecha de notificación al cliente</span><input type="date" id="rv-F_CLIENTE_NOTIFICADO"></label>' +
      '<label class="campo"><span>Medio de notificación</span><select id="rv-MEDIO_NOTIFICACION">' + opciones(CAT.canales, '', '-') + '</select></label>' +
    '</div></div><label class="campo" style="margin-top:10px"><span>Observaciones</span><textarea id="rv-OBSERVACIONES"></textarea></label>' +
    '<div class="acciones" style="margin-top:10px"><button class="btn" onclick="guardarRevision()">Registrar revisión</button></div></div>' +
    '<div class="tabla-cont"><table><thead><tr><th>ID</th><th>Ver.</th><th>Tipo</th><th>Fecha</th><th>Pers.</th><th>Patr.</th><th>Mét.</th><th>Inst.</th><th>Amb.</th><th>Resultado</th><th>Desviación / notificación</th><th>Nueva cot.</th><th>Resp. técnico</th><th>Resp. comercial</th></tr></thead><tbody>' +
    (DET.revisiones.length ? DET.revisiones.map(function(r){ return '<tr><td>' + esc(r.ID_REVISION) + '</td><td>' + esc(r.VERSION) + '</td><td>' + esc(r.TIPO_REVISION) + '</td><td>' + fFecha(r.FECHA) + '</td><td>' + esc(r.PERSONAL_COMPETENTE) + '</td><td>' + esc(r.PATRONES) + '</td><td>' + esc(r.METODO) + '</td><td>' + esc(r.INSTALACIONES) + '</td><td>' + esc(r.COND_AMBIENTALES) + '</td><td><span class="chip ' + (r.RESULTADO === 'Capacidad confirmada' ? 'verde' : (r.RESULTADO === 'No atendible' ? 'rojo' : 'amarillo')) + '">' + esc(r.RESULTADO) + '</span></td><td>' + esc(r.DESVIACION) + (r.F_CLIENTE_NOTIFICADO ? '<br><small>Notificado ' + fFecha(r.F_CLIENTE_NOTIFICADO) + ' (' + esc(r.MEDIO_NOTIFICACION) + ')</small>' : '') + '</td><td>' + esc(r.NUEVA_COTIZACION) + '</td><td>' + esc(r.RESP_TECNICO) + '</td><td>' + esc(r.RESP_COMERCIAL) + '</td></tr>'; }).join('') : '<tr><td colspan="14" class="vacio">Sin revisiones registradas</td></tr>') +
    '</tbody></table></div></div>';

  // Conformidad
  h += '<div class="subvista" id="sv-conformidad"><div class="tarjeta"><h3>Declaración de conformidad (5.7.1)</h3><div id="dt-conf"></div>' +
    '<div class="acciones" style="margin-top:10px"><button class="btn" onclick="guardarConf()">Guardar y validar</button></div></div></div>';

  // Tercerizados
  h += '<div class="subvista" id="sv-terc"><div class="tarjeta"><h3>Servicios tercerizados (5.8.1)</h3><div class="acciones" style="margin-bottom:8px"><button class="btn ok" onclick="formTerc()">+ Registrar envío a proveedor</button></div>' +
    '<div class="tabla-cont"><table><thead><tr><th>ID</th><th>Equipo</th><th>Proveedor</th><th>GCO-FO-006</th><th>Salida</th><th>Retorno esperado</th><th>Entrada</th><th>Certificado</th><th>Cert. revisado</th><th>Entregable verificado</th><th>Estado</th><th></th></tr></thead><tbody>' +
    (DET.tercerizados.length ? DET.tercerizados.map(function(t, i){ return '<tr><td>' + esc(t.ID_TERC) + '</td><td>' + esc(t.EQUIPO) + '</td><td>' + esc(t.PROVEEDOR) + '</td><td>' + esc(t.NUM_GCO_FO_006) + '</td><td>' + fFecha(t.F_SALIDA) + '</td><td>' + fFecha(t.F_ENTRADA_ESPERADA) + '</td><td>' + fFecha(t.F_ENTRADA) + '</td><td>' + esc(t.NUM_CERTIFICADO) + '</td><td>' + esc(t.CERT_REVISADO) + (t.REVISADO_POR ? '<br><small>' + esc(t.REVISADO_POR) + '</small>' : '') + '</td><td>' + esc(t.ENTREGABLE_VERIFICADO) + '</td><td><span class="chip ' + (t.ESTADO === 'Verificado' ? 'verde' : 'amarillo') + '">' + esc(t.ESTADO) + '</span></td><td><button class="btn mini sec" onclick="formTerc(' + i + ')">Editar</button></td></tr>'; }).join('') : '<tr><td colspan="12" class="vacio">Sin servicios tercerizados</td></tr>') +
    '</tbody></table></div></div></div>';

  // Documentos
  var docs = [['FO003','GCV-FO-003 Cotización','URL_FO003','ventasGenerarFO003'],['FO004','GCV-FO-004 Solicitud de calibración','URL_FO004','ventasGenerarFO004'],['FO002','GCV-FO-002 Orden de trabajo interna','URL_FO002','ventasGenerarFO002'],['FO001','GCV-FO-001 Contrato','URL_FO001','ventasGenerarFO001']];
  h += '<div class="subvista" id="sv-docs"><div class="tarjeta"><h3>Generación de documentos</h3><div class="tabla-cont"><table><thead><tr><th>Formato</th><th>Estado</th><th>Enlace</th><th></th></tr></thead><tbody>' +
    docs.map(function(d){
      var est = d[0] === 'FO003' ? s.ACT_FO003 : (d[0] === 'FO004' ? s.ACT_FO004 : '');
      return '<tr><td><b>' + esc(d[1]) + '</b></td><td>' + (est ? '<span class="chip ' + (est === 'PENDIENTE' ? 'amarillo' : 'verde') + '">' + esc(est) + '</span>' : '') + '</td><td>' + (s[d[2]] ? '<a href="' + esc(s[d[2]]) + '" target="_blank">Abrir</a>' : '<span class="vacio">No generado</span>') + '</td><td><button class="btn mini" onclick="generarDoc(\'' + d[3] + '\')">' + (s[d[2]] ? 'Regenerar' : 'Generar') + '</button></td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="aviso info" style="margin-top:8px">GCV-FO-002 usa el número del contrato u orden de servicio en lugar del número de cotización cuando existe (5.7). GCV-FO-001 usa marcadores {{CLIENTE}}, {{NIT}}, {{NUM_CONTRATO}}, {{VALOR}}, {{OBJETO}}, {{ALCANCE}}, {{COTIZACION}}, {{FECHA}} en la plantilla de Google Docs.</div>' +
    '<h3 style="margin-top:14px">Modificación del contrato (5.5)</h3><button class="btn sec" onclick="formContrato()">Registrar modificación del contrato</button></div></div>';

  // Versiones
  h += '<div class="subvista" id="sv-versiones"><div class="tabla-cont"><table><thead><tr><th>Fecha</th><th>Versión</th><th>Tipo</th><th>Motivo</th><th>Usuario</th><th></th></tr></thead><tbody>' +
    (DET.versiones.length ? DET.versiones.map(function(v){ return '<tr><td>' + fFecha(v.FECHA) + '</td><td>V' + esc(v.VERSION_ANTERIOR) + ' → V' + esc(v.VERSION_NUEVA) + '</td><td>' + esc(v.TIPO) + '</td><td>' + esc(v.MOTIVO) + '</td><td>' + esc(v.USUARIO) + '</td><td><button class="btn mini sec" onclick="verVersion(' + esc(v.VERSION_ANTERIOR) + ')">Ver V' + esc(v.VERSION_ANTERIOR) + '</button></td></tr>'; }).join('') : '<tr><td colspan="6" class="vacio">Sin versiones anteriores</td></tr>') +
    '</tbody></table></div></div>';

  // Postventa
  h += '<div class="subvista" id="sv-post"><div class="tarjeta"><h3>Postventa (5.10)</h3>' +
    (['Entregada','Facturada','Postventa'].indexOf(s.ESTADO) > -1 ? '<button class="btn sec" onclick="crearPost()">Crear registro de encuesta para este servicio</button>' : '<div class="vacio">Disponible cuando el servicio esté entregado.</div>') +
    '<div class="tabla-cont" style="margin-top:8px"><table><thead><tr><th>ID</th><th>Periodo</th><th>Envío</th><th>Respuesta</th><th>Calificación</th><th>Comentarios</th><th>PQRSF</th></tr></thead><tbody>' +
    (DET.postventa.length ? DET.postventa.map(function(p){ return '<tr><td>' + esc(p.ID_POST) + '</td><td>' + esc(p.PERIODO) + '</td><td>' + fFecha(p.F_ENVIO) + '</td><td>' + fFecha(p.F_RESPUESTA) + '</td><td>' + esc(p.CALIFICACION) + '</td><td>' + esc(p.COMENTARIOS) + '</td><td>' + (p.PQRSF_NUM ? (p.PQRSF_ENLACE ? '<a target="_blank" href="' + esc(p.PQRSF_ENLACE) + '">' + esc(p.PQRSF_NUM) + '</a>' : esc(p.PQRSF_NUM)) + ' (' + esc(p.PQRSF_ESTADO) + ')' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="7" class="vacio">Sin encuestas</td></tr>') +
    '</tbody></table></div></div></div>';

  $('dt-cont').innerHTML = h;
  eqEditor('dt-equipos', DET.equipos);
  confEditor('dt-conf', DET.conformidad || {});
  $('rv-RESULTADO').onchange = function(){ $('rv-desv').style.display = this.value === 'Con desviación' ? 'block' : 'none'; };
  subTab(sub);
}
function campoE(k, label, tipo, lista, clase){
  var s = DET.solicitud, v = s[k] === undefined ? '' : s[k], inp;
  if (tipo === 'sel') inp = '<select id="ge-' + k + '">' + opciones(lista, v, '-') + '</select>';
  else if (tipo === 'date') inp = '<input type="date" id="ge-' + k + '" value="' + esc(String(v).substring(0,10)) + '">';
  else if (tipo === 'area') inp = '<textarea id="ge-' + k + '">' + esc(v) + '</textarea>';
  else inp = '<input id="ge-' + k + '" value="' + esc(v) + '">';
  return '<label class="campo ' + (clase || '') + '"><span>' + esc(label) + '</span>' + inp + '</label>';
}
function chk(k, label){ return '<label class="campo"><span>' + esc(label) + '</span><select id="rv-' + k + '">' + opciones(['SÍ','NO','N/A'], '', '-') + '</select></label>'; }
function subTab(n){
  Array.prototype.forEach.call(document.querySelectorAll('.subtabs button'), function(b){ b.classList.toggle('activo', b.getAttribute('data-s') === n); });
  Array.prototype.forEach.call(document.querySelectorAll('.subvista'), function(v){ v.classList.toggle('activa', v.id === 'sv-' + n); });
}
function guardarGeneral(){
  var c = {};
  ['CANAL','COMERCIAL','LUGAR_SERVICIO','TIPO_CLIENTE','CONTACTO','TELEFONO_CONTACTO','CORREO_CONTACTO','F_LLEGADA_EQUIPOS','REFERENCIA','F_PROXIMO_SEGUIMIENTO','NUM_CONTRATO','OBSERVACIONES'].forEach(function(k){ c[k] = val('ge-' + k); });
  srv('ventasActualizarSolicitud', [DET.solicitud.ID, c], function(r){ toast(r.sinCambios ? 'Sin cambios.' : 'Datos actualizados.'); recargarDetalle('general'); });
}
function guardarEquiposDet(){
  var s = DET.solicitud, eqs = eqLeer('dt-equipos');
  if (['Recibida','En revisión de requisitos'].indexOf(s.ESTADO) > -1){
    srv('ventasGuardarEquipos', [s.ID, eqs, ''], function(){ toast('Equipos guardados.'); recargarDetalle('equipos'); });
    return;
  }
  modal('Modificación del alcance (5.6)',
    '<div class="aviso adv">Se guardará la versión V' + esc(s.VERSION) + ', se creará la V' + (Number(s.VERSION) + 1) + ', se marcará GCV-FO-003 y GCV-FO-004 para actualizar y se avisará al laboratorio.</div>' +
    '<label class="campo req"><span>Motivo de la modificación</span><textarea id="ma-motivo"></textarea></label>' +
    (s.TRABAJO_INICIADO ? '<label class="campo req" style="margin-top:8px"><span>Personal afectado al que se comunicó el cambio (5.5)</span><input id="ma-personal" placeholder="Nombres separados por coma"></label>' : ''),
    function(){
      srv('ventasModificarAlcance', [s.ID, eqs, val('ma-motivo'), val('ma-personal')], function(r){ cerrarModal(); toast('Alcance modificado. Nueva versión V' + r.version + '.'); recargarDetalle('equipos'); });
    }, 'Confirmar modificación');
}
function guardarRevision(){
  var r = {};
  ['PERSONAL_COMPETENTE','PATRONES','METODO','INSTALACIONES','COND_AMBIENTALES','RESULTADO','RESP_TECNICO','RESP_COMERCIAL','DESVIACION','F_CLIENTE_NOTIFICADO','MEDIO_NOTIFICACION','OBSERVACIONES'].forEach(function(k){ r[k] = val('rv-' + k); });
  srv('ventasRegistrarRevision', [DET.solicitud.ID, r], function(x){
    toast('Revisión registrada.' + (x.nuevaCotizacion ? ' Se reabrió la cotización con versión V' + x.version + '.' : ''), x.nuevaCotizacion ? 'adv' : '');
    recargarDetalle('revision');
  });
}
function guardarConf(){
  srv('ventasGuardarConformidad', [DET.solicitud.ID, confLeer('dt-conf')], function(r){
    toast('Conformidad guardada. Validación: ' + r.validacion, r.validacion === 'NO CUMPLE' ? 'err' : (r.advertencias.length ? 'adv' : ''));
    recargarDetalle('conformidad');
  });
}

/* --------- cambio de estado con campos según destino --------- */
function formEstado(nuevo){
  if (!nuevo) return;
  var s = DET.solicitud, h = '<div class="grid g2">';
  h += '<label class="campo"><span>Fecha</span><input type="date" id="fe-fecha" value="' + hoyISO() + '"></label>';
  if (nuevo === 'Cerrada por venta'){
    h += '<label class="campo req"><span>Forma de aceptación</span><select id="fe-acep">' + opciones(CAT.tiposAceptacion, s.TIPO_CLIENTE === 'Público' ? 'Contrato público' : '', '-') + '</select></label>';
    h += '<label class="campo"><span>N° orden de servicio / contrato</span><input id="fe-contrato" value="' + esc(s.NUM_CONTRATO) + '"></label>';
    h += '<div class="aviso info col2">El número de la orden de servicio o del contrato (público o privado) reemplazará al de cotización en la orden de trabajo interna (5.7).</div>';
  }
  if (nuevo === 'Cerrada por desistimiento') h += '<label class="campo req"><span>Motivo</span><select id="fe-motivo">' + opciones(CAT.motivosDesistimiento, '', '-') + '</select></label>';
  if (nuevo === 'Solicitud de calibración recibida'){
    h += '<label class="campo"><span>Consecutivo GCV-FO-004 (vacío = automático)</span><input id="fe-fo004" value="' + esc(s.CONSECUTIVO_FO004) + '"></label>';
    h += '<label class="campo"><span>Fecha de llegada de equipos</span><input type="date" id="fe-llegada" value="' + esc(String(s.F_LLEGADA_EQUIPOS || '').substring(0,10)) + '"></label>';
  }
  if (nuevo === 'Programada'){
    h += '<label class="campo req"><span>Fecha programada</span><input type="date" id="fe-prog"></label>';
    h += '<label class="campo' + (s.LUGAR_SERVICIO === 'En sitio' ? '' : ' req') + '"><span>Fecha de llegada de equipos</span><input type="date" id="fe-llegada" value="' + esc(String(s.F_LLEGADA_EQUIPOS || '').substring(0,10)) + '"></label>';
    h += '<div class="aviso info col2">Los días hábiles se cuentan desde el día siguiente a la llegada del equipo. Se asignará número de OT y se avisará al laboratorio.</div>';
  }
  if (nuevo === 'En seguimiento') h += '<label class="campo"><span>Próximo seguimiento</span><input type="date" id="fe-prox"></label>';
  if (nuevo === 'Facturada') h += '<label class="campo req"><span>N° de factura</span><input id="fe-factura"></label>';
  if (nuevo === 'Cotizada') h += '<div class="aviso info col2">Requisitos: equipos registrados y revisión de requisitos con capacidad confirmada o desviación notificada al cliente. Recuerde generar GCV-FO-003.</div>';
  if (nuevo === 'En revisión de requisitos' && ['Cotizada','En seguimiento'].indexOf(s.ESTADO) > -1) h += '<div class="aviso adv col2">Se reabrirá la cotización con una nueva versión.</div>';
  h += '<label class="campo col2' + (nuevo === 'En revisión de requisitos' && ['Cotizada','En seguimiento'].indexOf(s.ESTADO) > -1 ? ' req' : '') + '"><span>Observación</span><textarea id="fe-obs"></textarea></label></div>';
  modal(s.ESTADO + ' → ' + nuevo, h, function(){
    var x = { fecha: val('fe-fecha'), observacion: val('fe-obs'), tipoAceptacion: val('fe-acep'), numContrato: val('fe-contrato'), motivo: val('fe-motivo'), consecutivoFO004: val('fe-fo004'), fechaLlegada: val('fe-llegada'), fechaProgramada: val('fe-prog'), proximo: val('fe-prox'), numFactura: val('fe-factura') };
    srv('ventasCambiarEstado', [s.ID, nuevo, x], function(){ cerrarModal(); toast('Estado actualizado: ' + nuevo); recargarDetalle('timeline'); });
  }, 'Confirmar');
}
function formSeguimiento(){
  modal('Seguimiento comercial', '<label class="campo req"><span>Detalle del contacto con el cliente</span><textarea id="sg-nota"></textarea></label><label class="campo" style="margin-top:8px"><span>Próximo seguimiento</span><input type="date" id="sg-prox"></label>',
    function(){ srv('ventasRegistrarSeguimiento', [DET.solicitud.ID, val('sg-nota'), val('sg-prox')], function(){ cerrarModal(); toast('Seguimiento registrado.'); recargarDetalle('timeline'); }); });
}
/* ---------- Ruta del servicio: propio o tercerizado (en sitio / en el laboratorio del proveedor) ---------- */
function rutaEtapas(r){
  var sig = false;
  return '<div class="ruta-et">' + r.etapas.map(function(e, i){
    var cls = e.ok ? 'ok' : (!sig ? (sig = true, 'sig') : '');
    return (i ? '<i>→</i>' : '') + '<span class="' + cls + '" title="' + esc(e.detalle) + '">' + (e.ok ? '✓ ' : '') + esc(e.t) + (e.detalle && !e.ok && cls === 'sig' ? ' · ' + esc(e.detalle) : '') + '</span>';
  }).join('') + '</div>';
}
function rutaHtml(s){
  var r = s.RUTA; if (!r) return '';
  var bloqueada = !!r.oc, sug = r.alcanceSugerido || {};
  return '<div class="ruta"><div class="rt-cab"><div><b>Ruta del servicio:</b> ' + esc(r.nombre) + ' · <span style="color:var(--suave)">Siguiente: ' + esc(r.siguiente) + '</span>' +
      (r.tercerizadoAImc === 'SI' ? '<div style="font-size:12px;color:var(--suave)">SC: el cliente subcontrató este servicio a IMCOLMETRIC.</div>' : '') + '</div>' +
    '<div class="acciones" style="align-items:center">' +
      '<label style="font-size:12px" title="' + esc(sug.texto || '') + '">¿Dentro del alcance del laboratorio (MT-FO-006)? <select id="rt-alc" onchange="rutaAlcance(\'rt-\')"' + (bloqueada ? ' disabled' : '') + '>' + opciones(['SI', 'NO'], r.alcance || sug.sugerido || '', '-') + '</select></label>' +
      '<label style="font-size:12px">¿Se terceriza con un proveedor? <select id="rt-terc" onchange="rutaAlcance(\'rt-\')"' + (bloqueada ? ' disabled' : '') + '>' + opciones(['NO', 'SI'], r.tercerizado ? 'SI' : 'NO') + '</select></label>' +
      '<label id="rt-modw" style="font-size:12px;' + (r.tercerizado ? '' : 'display:none') + '">Tercero en <select id="rt-mod"' + (bloqueada ? ' disabled' : '') + '>' + opciones(CAT.modalidadesTercero || ['Sitio', 'Laboratorio'], r.modalidad || '', '-') + '</select></label>' +
      (bloqueada ? '<span style="font-size:12px;color:var(--suave)">OC ' + esc(r.oc.id) + ' emitida a ' + esc(r.oc.proveedor) + '</span>' : '<button class="btn mini" onclick="guardarRuta()">Guardar ruta</button>') +
    '</div></div>' + (sug.texto && !r.alcance ? '<p class="ayuda">Sugerencia según el MT-FO-006: ' + esc(sug.texto) + '</p>' : '') + rutaEtapas(r) + '</div>';
}
// Fuera del alcance → se terceriza (obligatorio); dentro del alcance → lo hace el laboratorio salvo que se decida tercerizar
function rutaAlcance(p){
  var a = $(p + 'alc'), t = $(p + 'terc');
  if (a && a.value === 'NO') { t.value = 'SI'; t.disabled = true; } else if (t && !t.hasAttribute('data-bloq')) t.disabled = false;
  var w = $(p + 'modw'); if (w) w.style.display = t.value === 'SI' ? '' : 'none';
}
function guardarRuta(){
  var r = { ALCANCE: val('rt-alc'), TERCERIZADO: val('rt-terc'), MODALIDAD: val('rt-mod') };
  if (!r.ALCANCE){ toast('Indique si el servicio está dentro del alcance del laboratorio.', 'err'); return; }
  if (r.TERCERIZADO === 'SI' && !r.MODALIDAD){ toast('Indique si el tercero trabaja en Sitio o en su Laboratorio.', 'err'); return; }
  srv('ventasDefinirRuta', [DET.solicitud.ID, r], function(x){ toast('Ruta: ' + x.nombre + (x.mensaje ? '. ' + x.mensaje : '')); recargarDetalle(); });
}
// Campos de ruta en las tarjetas: primero el alcance del laboratorio, luego si se terceriza
function rutaCampos(p, d){
  d = d || {};
  var q = d.paquete, sug = q && q.EQUIPOS && q.ALCANCE ? q.ALCANCE : (d.alcance || {}), al = (q && q.ALCANCE_LAB) || sug.sugerido || '';
  return '<h4>¿El servicio está dentro del alcance del laboratorio? (MT-FO-006)</h4><div class="grid g4">' +
    '<label class="campo req"><span>Dentro del alcance</span><select id="' + p + 'alc" onchange="rutaAlcance(\'' + p + '\')">' + opciones(['SI', 'NO'], al, '-') + '</select></label>' +
    '<p class="ayuda col3">' + (sug.texto ? 'Sugerencia: ' + esc(sug.texto).replace(/\.$/, '') + '. ' : '') + 'Alcance declarado: ' + (CAT.alcance || []).map(function(a){ return esc(a.magnitud) + (a.lugares.indexOf('Sitio') !== -1 ? ' (laboratorio y sitio)' : ' (laboratorio)'); }).join(' · ') + '.</p></div>' +
    '<h4>¿Se terceriza con un proveedor?</h4><div class="grid g4">' +
    '<label class="campo req"><span>Tercerizar</span><select id="' + p + 'terc" onchange="rutaAlcance(\'' + p + '\')"' + (al === 'NO' ? ' disabled' : '') + '>' + opciones(['NO', 'SI'], al === 'NO' ? 'SI' : 'NO') + '</select></label>' +
    '<div id="' + p + 'modw" class="col3" style="' + (al === 'NO' ? '' : 'display:none') + '"><div class="grid g3">' +
      '<label class="campo req"><span>El tercero trabaja en</span><select id="' + p + 'mod">' + opciones(CAT.modalidadesTercero || ['Sitio', 'Laboratorio'], '', '-') + '</select></label>' +
      '<label class="campo col2"><span>Proveedor sugerido (opcional)</span><input id="' + p + 'prov"></label></div>' +
      '<p class="ayuda">Sitio: Compras emite la orden de compra → el tercero va donde el cliente → facturación. Laboratorio: orden de compra → el almacén recibe → envío al tercero → regresa al almacén → despacho → facturación.</p></div></div>' +
    (d.TERCERIZADO_A_IMC ? '<p class="ayuda">Casilla de la SC «El servicio solicitado ha sido tercerizado a IMCOLMETRIC»: <b>' + esc(d.TERCERIZADO_A_IMC) + '</b>' +
      (d.TERCERIZADO_A_IMC === 'SI' ? ' (el cliente nos subcontrató el servicio)' : '') + '. Es informativa: no define si IMCOLMETRIC terceriza.</p>' : '');
}
function rutaLeer(p){
  var r = { ALCANCE: val(p + 'alc'), TERCERIZADO: val(p + 'terc') || 'NO', MODALIDAD: val(p + 'mod'), PROVEEDOR_SUGERIDO: val(p + 'prov') };
  if (!r.ALCANCE) { toast('Indique si el servicio está dentro del alcance del laboratorio (MT-FO-006).', 'err'); return null; }
  if (r.ALCANCE === 'NO') r.TERCERIZADO = 'SI';
  if (r.TERCERIZADO === 'SI' && !r.MODALIDAD) { toast('Indique si el tercero trabaja en Sitio o en su Laboratorio.', 'err'); return null; }
  return r;
}
function reservarConsecutivo(){
  srv('ventasReservarConsecutivo', [DET.solicitud.ID], function(r){ toast('Consecutivo ' + r.SC + ' asignado: la OT será la ' + r.OT + '. Escríbalo en el GCV-FO-004 que envía al cliente.'); recargarDetalle(); });
}
function formUnirOT(){
  var s = DET.solicitud;
  srv('ventasOTsCliente', [s.ID], function(ots){
    modal('Unir ' + s.ID + ' a su orden de trabajo', '<div class="aviso info">La solicitud de <b>' + esc(s.CLIENTE) + '</b> se integrará al paquete de la OT: se pasan el PDF, el N° de SC y los equipos (si la OT no tiene), y esta solicitud suelta se elimina. ' +
      'La OT debe ser del mismo cliente.</div>' +
      (ots.length ? '<label class="campo" style="margin-top:8px"><span>OT de este cliente</span><select id="un-sel" onchange="setv(\'un-ot\', this.value)"><option value="">— Elegir —</option>' +
        ots.map(function(o){ return '<option value="' + esc(o.NUM_OT) + '">' + esc(o.NUM_OT + ' · ' + o.ID + ' · ' + o.ESTADO + (o.SC ? ' · ya tiene ' + o.SC : '')) + '</option>'; }).join('') + '</select></label>'
        : '<div class="aviso adv" style="margin-top:8px">No hay OT registradas con el nombre o NIT de este cliente. Revise que el cliente de la OT sea el mismo.</div>') +
      '<label class="campo req" style="margin-top:8px"><span>N° de OT</span><input id="un-ot" placeholder="Ej.: OT03 u OT-003-26"></label>',
      function(){
        var ot = val('un-ot'); if (!ot){ toast('Escriba o elija el N° de OT.', 'err'); return; }
        srv('ventasUnirSolicitudAOT', [s.ID, ot], function(r){ cerrarModal(); toast('Solicitud unida a la ' + r.NUM_OT + '.'); abrirDetalle(r.ID); },
          function(e){ if (/CLIENTE_NO_COINCIDE/.test(String(e))) errorModal('El cliente no coincide con la OT', e); else if (/SECUENCIA/.test(String(e))) errorModal('La SC y la OT no coinciden', e); });
      }, 'Unir');
  });
}
function formNota(){
  modal('Nota en bitácora', '<label class="campo req"><span>Nota</span><textarea id="nt-nota"></textarea></label>' + (DET.solicitud.TRABAJO_INICIADO ? '<label class="campo" style="margin-top:8px"><span>Personal comunicado (si aplica)</span><input id="nt-pers"></label>' : ''),
    function(){ if (!val('nt-nota')) return toast('Escriba la nota.', 'err'); srv('ventasAgregarNota', [DET.solicitud.ID, val('nt-nota'), val('nt-pers')], function(){ cerrarModal(); recargarDetalle('timeline'); }); });
}
function formContrato(){
  var s = DET.solicitud;
  modal('Modificación del contrato (5.5)',
    '<div class="aviso adv">Se guardará la versión actual, se reabrirá la revisión del contrato y se notificará al laboratorio. Deberá registrar una nueva revisión en la pestaña "Revisión".</div>' +
    '<label class="campo req"><span>Descripción de la modificación</span><textarea id="mc-det"></textarea></label>' +
    '<label class="campo' + (s.TRABAJO_INICIADO ? ' req' : '') + '" style="margin-top:8px"><span>Personal afectado al que se comunicó</span><input id="mc-pers" placeholder="Nombres separados por coma"></label>',
    function(){ srv('ventasModificarContrato', [s.ID, val('mc-det'), val('mc-pers')], function(){ cerrarModal(); toast('Modificación registrada. Revisión reabierta.', 'adv'); recargarDetalle('revision'); }); });
}
function formTerc(i){
  var t = i === undefined ? {} : DET.tercerizados[i];
  var eqs = DET.equipos.map(function(e){ return '<option value="' + esc(e.ID_EQUIPO) + '"' + (e.ID_EQUIPO === t.ID_EQUIPO ? ' selected' : '') + '>' + esc(e.ITEM + '. ' + e.EQUIPO + ' ' + e.SERIE) + '</option>'; }).join('');
  var f = function(k){ return esc(String(t[k] || '').substring(0,10)); };
  modal(i === undefined ? 'Registrar servicio tercerizado (5.8.1)' : 'Actualizar ' + t.ID_TERC,
    '<div class="grid g2">' +
    '<label class="campo req col2"><span>Equipo</span><select id="tc-eq"><option value="">-</option>' + eqs + '</select></label>' +
    '<label class="campo req"><span>Proveedor</span><input id="tc-prov" value="' + esc(t.PROVEEDOR) + '"></label>' +
    '<label class="campo req"><span>N° GCO-FO-006</span><input id="tc-fo" value="' + esc(t.NUM_GCO_FO_006) + '"></label>' +
    '<label class="campo"><span>Fecha de salida</span><input type="date" id="tc-sal" value="' + f('F_SALIDA') + '"></label>' +
    '<label class="campo"><span>Fecha de entrada</span><input type="date" id="tc-ent" value="' + f('F_ENTRADA') + '"></label>' +
    '<label class="campo"><span>N° certificado del proveedor</span><input id="tc-cert" value="' + esc(t.NUM_CERTIFICADO) + '"></label>' +
    '<label class="campo"><span>¿Certificado revisado?</span><select id="tc-rev">' + opciones(['NO','SÍ'], t.CERT_REVISADO || 'NO') + '</select></label>' +
    '<label class="campo"><span>Revisado por</span><select id="tc-por">' + opciones(CAT.tecnicos, t.REVISADO_POR, '-') + '</select></label>' +
    '<label class="campo"><span>¿Entregable verificado?</span><select id="tc-ver">' + opciones(['NO','SÍ'], t.ENTREGABLE_VERIFICADO || 'NO') + '</select></label>' +
    '<label class="campo col2"><span>Observaciones</span><textarea id="tc-obs">' + esc(t.OBSERVACIONES) + '</textarea></label></div>',
    function(){
      var x = { ID_TERC: t.ID_TERC || '', ID_EQUIPO: val('tc-eq'), PROVEEDOR: val('tc-prov'), NUM_GCO_FO_006: val('tc-fo'), F_SALIDA: val('tc-sal'), F_ENTRADA: val('tc-ent'), NUM_CERTIFICADO: val('tc-cert'), CERT_REVISADO: val('tc-rev'), REVISADO_POR: val('tc-por'), ENTREGABLE_VERIFICADO: val('tc-ver'), OBSERVACIONES: val('tc-obs') };
      srv('ventasGuardarTercerizado', [DET.solicitud.ID, x], function(){ cerrarModal(); toast('Tercerizado guardado.'); recargarDetalle('terc'); });
    });
}
function generarDoc(fn){
  srv(fn, [DET.solicitud.ID], function(r){
    toast('Documento generado' + (r.ot ? ' (' + r.ot + ')' : '') + '.');
    if (r.url) window.open(r.url, '_blank');
    recargarDetalle('docs');
  });
}
function verVersion(v){
  srv('ventasVerVersion', [DET.solicitud.ID, v], function(d){
    var eqs = (d.equipos || []);
    var h = '<div class="aviso info">Estado: <b>' + esc(d.solicitud && d.solicitud.ESTADO) + '</b> · Valor: <b>' + money(d.solicitud && d.solicitud.VALOR_TOTAL) + '</b></div>' +
      '<div class="tabla-cont"><table><thead><tr><th>Ítem</th><th>Magnitud</th><th>Equipo</th><th>Serie</th><th>Servicio</th><th>Cant.</th><th class="num">Vr. unit.</th></tr></thead><tbody>' +
      eqs.map(function(e){ return '<tr><td>' + esc(e.ITEM) + '</td><td>' + esc(e.MAGNITUD) + '</td><td>' + esc(e.EQUIPO) + '</td><td>' + esc(e.SERIE) + '</td><td>' + esc(e.TIPO_SERVICIO) + '</td><td>' + esc(e.CANTIDAD) + '</td><td class="num">' + money(e.VALOR_UNITARIO) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    modal('Versión V' + v + ' de ' + DET.solicitud.ID, h);
  });
}
function crearPost(){ srv('ventasCrearPostventa', [DET.solicitud.ID], function(){ toast('Registro de postventa creado.'); recargarDetalle('post'); }); }

/* ================================= CLIENTES ================================= */
function cargarClientes(){ srv('ventasListarClientes', [], function(l){ LISTA_CL = l; pintarClientes(); }); }
function pintarClientes(){
  var q = val('cl-buscar').toLowerCase();
  var l = LISTA_CL.filter(function(c){ return !q || [c.NIT, c.NOMBRE, c.CIUDAD, c.CONTACTO].join(' ').toLowerCase().indexOf(q) > -1; });
  var h = '<thead><tr><th>NIT</th><th>Cliente</th><th>Tipo</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Ciudad</th><th class="num">Solicitudes</th><th class="num">Ventas</th><th class="num">Valor vendido</th><th>Satisfacción</th><th>Última solicitud</th><th></th></tr></thead><tbody>';
  if (!l.length) h += '<tr><td colspan="13" class="vacio">Sin clientes</td></tr>';
  l.forEach(function(c, i){
    h += '<tr class="click" onclick="histCliente(\'' + esc(c.NIT) + '\')"><td>' + esc(c.NIT) + '</td><td><b>' + esc(c.NOMBRE) + '</b></td><td>' + esc(c.TIPO_CLIENTE) + '</td><td>' + esc(c.CONTACTO) + '</td><td>' + esc(c.TELEFONO) + '</td><td>' + esc(c.CORREO) + '</td><td>' + esc(c.CIUDAD) + '</td><td class="num">' + esc(c.TOTAL_SOLICITUDES) + '</td><td class="num">' + esc(c.TOTAL_VENTAS) + '</td><td class="num">' + money(c.VALOR_VENDIDO) + '</td><td>' + (c.SATISFACCION !== '' ? esc(c.SATISFACCION) + ' / 5' : '-') + '</td><td>' + fFecha(c.ULTIMA_SOLICITUD) + '</td><td><button class="btn mini sec" onclick="event.stopPropagation();formCliente(\'' + esc(c.NIT) + '\')">Editar</button></td></tr>';
  });
  $('cl-tabla').innerHTML = h + '</tbody>';
}
function formCliente(nit){
  var c = nit ? LISTA_CL.filter(function(x){ return String(x.NIT) === String(nit); })[0] || {} : {};
  var f = function(k, l, req, cls){ return '<label class="campo ' + (req ? 'req ' : '') + (cls || '') + '"><span>' + l + '</span><input id="fc-' + k + '" value="' + esc(c[k]) + '"' + (k === 'NIT' && nit ? ' readonly' : '') + '></label>'; };
  modal(nit ? 'Editar cliente' : 'Nuevo cliente', '<div class="grid g2">' + f('NIT','NIT',1) + f('NOMBRE','Nombre o razón social',1) +
    '<label class="campo"><span>Tipo</span><select id="fc-TIPO_CLIENTE">' + opciones(CAT.tiposCliente, c.TIPO_CLIENTE || 'Privado') + '</select></label>' +
    f('CONTACTO','Contacto') + f('TELEFONO','Teléfono / WhatsApp') + f('CORREO','Correo') + f('DIRECCION','Dirección') + f('CIUDAD','Ciudad') + f('CORREO_FACTURACION','Correo de facturación') + f('OBSERVACIONES','Observaciones') + '</div>',
    function(){
      var x = {}; ['NIT','NOMBRE','TIPO_CLIENTE','CONTACTO','TELEFONO','CORREO','DIRECCION','CIUDAD','CORREO_FACTURACION','OBSERVACIONES'].forEach(function(k){ x[k] = val('fc-' + k); });
      if (!x.NIT || !x.NOMBRE){ toast('El NIT y el nombre son obligatorios.', 'err'); return; }
      var guardar = function(y){ srv('ventasGuardarCliente', [y], function(){ cerrarModal(); toast('Cliente guardado.'); cargarClientes(); srv('ventasCatalogos', [], function(cc){ CAT = cc; pintarDatalistClientes(); }); }); };
      if (nit) { guardar(x); return; }
      // Cliente nuevo: no duplicar
      srv('ventasVerificarCliente', [x], function(r){
        if (r.mismoNit) {
          if (!confirm('El NIT ' + x.NIT + ' ya está registrado como «' + r.mismoNit.NOMBRE + '». ¿Actualizar los datos de ese cliente (se conserva su nombre)?')) return;
          x.NIT = r.mismoNit.NIT; x.NOMBRE = r.mismoNit.NOMBRE; guardar(x); return;
        }
        if (!r.parecidos.length) { guardar(x); return; }
        elegirCliente(x, r.parecidos, function(e){
          if (e === 'NUEVO') { x.CONFIRMAR_NUEVO = true; guardar(x); return; }
          // Es el mismo cliente: se completan sus datos sin cambiar NIT ni nombre
          x.NIT = e.NIT; x.NOMBRE = e.NOMBRE; guardar(x);
        });
      });
    });
}
function histCliente(nit){
  srv('ventasHistorialCliente', [nit], function(d){
    var c = d.cliente || {};
    var h = '<div class="aviso info">' + esc(c.NOMBRE) + ' · NIT ' + esc(c.NIT) + ' · ' + esc(c.TIPO_CLIENTE) + ' · ' + esc(c.CIUDAD) + '</div><h3>Servicios</h3><div class="tabla-cont"><table><thead><tr><th>ID</th><th>Fecha</th><th>Referencia</th><th>Estado</th><th class="num">Valor</th></tr></thead><tbody>' +
      (d.solicitudes.length ? d.solicitudes.map(function(s){ return '<tr class="click" onclick="cerrarModal();abrirDetalle(\'' + esc(s.ID) + '\')"><td>' + esc(s.ID) + '</td><td>' + fFecha(s.FECHA_RECEPCION) + '</td><td>' + esc(s.REFERENCIA) + '</td><td><span class="chip">' + esc(s.ESTADO) + '</span></td><td class="num">' + money(s.VALOR_TOTAL) + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="vacio">Sin servicios</td></tr>') +
      '</tbody></table></div><h3 style="margin-top:12px">Encuestas</h3><div class="tabla-cont"><table><thead><tr><th>Periodo</th><th>Envío</th><th>Respuesta</th><th>Calificación</th><th>Comentarios</th><th>PQRSF</th></tr></thead><tbody>' +
      (d.encuestas.length ? d.encuestas.map(function(p){ return '<tr><td>' + esc(p.PERIODO) + '</td><td>' + fFecha(p.F_ENVIO) + '</td><td>' + fFecha(p.F_RESPUESTA) + '</td><td>' + esc(p.CALIFICACION) + '</td><td>' + esc(p.COMENTARIOS) + '</td><td>' + esc(p.PQRSF_NUM) + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="vacio">Sin encuestas</td></tr>') +
      '</tbody></table></div>' +
      '<h3 style="margin-top:12px">Contratos</h3><div class="tabla-cont"><table><thead><tr><th>N°</th><th>Tipo</th><th>Objeto</th><th>Inicio</th><th>Fin</th><th class="num">Valor</th><th>Estado</th><th></th></tr></thead><tbody>' +
      ((d.contratos || []).length ? d.contratos.map(function(k, i){ return '<tr><td><b>' + esc(k.NUM_CONTRATO) + '</b></td><td>' + esc(k.TIPO) + '</td><td>' + esc(k.OBJETO) + '</td><td>' + fFecha(k.F_INICIO) + '</td><td>' + fFecha(k.F_FIN) + '</td><td class="num">' + (k.VALOR ? money(k.VALOR) : '') + '</td><td><span class="chip">' + esc(k.ESTADO) + (k.VIGENTE ? '' : ' · no vigente') + '</span></td><td><button class="btn mini sec" onclick="formContratoCli(' + i + ')">Editar</button></td></tr>'; }).join('') : '<tr><td colspan="8" class="vacio">Sin contratos registrados</td></tr>') +
      '</tbody></table></div><div class="acciones" style="margin-top:6px"><button class="btn mini ok" onclick="formContratoCli()">+ Agregar contrato</button></div>';
    HIST_CL = d;
    modal('Historial del cliente', h);
  });
}
var HIST_CL = null;
function formContratoCli(i){
  var c = HIST_CL.cliente || {}, k = i === undefined ? {} : HIST_CL.contratos[i];
  var f = function(id, l, v, t, req){ return '<label class="campo' + (req ? ' req' : '') + '"><span>' + l + '</span><input id="kc-' + id + '" type="' + (t || 'text') + '" value="' + esc(v) + '"' + (id === 'NUM' && i !== undefined ? ' readonly' : '') + '></label>'; };
  modal((i === undefined ? 'Nuevo contrato · ' : 'Contrato ' + k.NUM_CONTRATO + ' · ') + (c.NOMBRE || ''), '<div class="grid g2">' +
    f('NUM', 'N° de contrato', k.NUM_CONTRATO, '', 1) +
    '<label class="campo req"><span>Tipo</span><select id="kc-TIPO">' + opciones(CAT.tiposContrato, k.TIPO || (c.TIPO_CLIENTE === 'Público' ? 'Contrato público' : 'Contrato privado')) + '</select></label>' +
    '<label class="campo col2"><span>Objeto</span><input id="kc-OBJ" value="' + esc(k.OBJETO) + '"></label>' +
    f('INI', 'Fecha de inicio', String(k.F_INICIO || '').slice(0, 10), 'date') + f('FIN', 'Fecha de terminación', String(k.F_FIN || '').slice(0, 10), 'date') +
    f('VAL', 'Valor', k.VALOR, 'number') +
    '<label class="campo"><span>Estado</span><select id="kc-EST">' + opciones(['Vigente', 'Suspendido', 'Terminado', 'Anulado'], k.ESTADO || 'Vigente') + '</select></label>' +
    '<label class="campo col2"><span>Observaciones</span><input id="kc-OBS" value="' + esc(k.OBSERVACIONES) + '"></label></div>',
    function(){
      var x = { NUM_CONTRATO: val('kc-NUM'), CLIENTE_NIT: c.NIT, TIPO: val('kc-TIPO'), OBJETO: val('kc-OBJ'), F_INICIO: val('kc-INI'), F_FIN: val('kc-FIN'), VALOR: val('kc-VAL'), ESTADO: val('kc-EST'), OBSERVACIONES: val('kc-OBS') };
      if (!x.NUM_CONTRATO){ toast('Indique el número del contrato.', 'err'); return; }
      srv('ventasGuardarContrato', [x], function(){ toast('Contrato guardado.'); srv('ventasCatalogos', [], function(cc){ CAT = cc; }); histCliente(c.NIT); });
    });
}

/* ================================= POSTVENTA ================================= */
var LISTA_PV = [];
function cargarPostventa(){
  srv('ventasListarPostventa', [{ periodo: val('pv-periodo'), estado: val('pv-estado') }], function(l){
    LISTA_PV = l;
    var h = '<thead><tr><th>ID</th><th>Periodo</th><th>Cliente</th><th>Servicios</th><th>Envío</th><th>Respuesta</th><th>Calificación</th><th>Comentarios</th><th>PQRSF</th><th>Estado</th><th></th></tr></thead><tbody>';
    if (!l.length) h += '<tr><td colspan="11" class="vacio">Sin registros</td></tr>';
    l.forEach(function(p, i){
      var cal = Number(p.CALIFICACION);
      h += '<tr><td>' + esc(p.ID_POST) + '</td><td>' + esc(p.PERIODO) + '</td><td>' + esc(p.CLIENTE) + '</td><td>' + esc(p.ID_SOLICITUDES) + '</td><td>' + fFecha(p.F_ENVIO) + '</td><td>' + fFecha(p.F_RESPUESTA) + '</td><td>' + (p.CALIFICACION !== '' ? '<span class="chip ' + (cal >= 4 ? 'verde' : (cal <= 2 ? 'rojo' : 'amarillo')) + '">' + esc(p.CALIFICACION) + ' / 5</span>' : '') + '</td><td>' + esc(p.COMENTARIOS) + '</td><td>' +
        (p.PQRSF_NUM ? (p.PQRSF_ENLACE ? '<a target="_blank" href="' + esc(p.PQRSF_ENLACE) + '">' + esc(p.PQRSF_NUM) + '</a>' : esc(p.PQRSF_NUM)) + '<br><small>' + esc(p.PQRSF_TIPO) + ' · ' + esc(p.PQRSF_ESTADO) + '</small>' : '') + '</td><td>' + esc(p.ESTADO) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn mini" onclick="formEncuesta(' + i + ')">Respuesta</button> <button class="btn mini sec" onclick="formPqrsf(' + i + ')">PQRSF</button></td></tr>';
    });
    $('pv-tabla').innerHTML = h + '</tbody>';
  });
}
function formEncuesta(i){
  var p = LISTA_PV[i];
  modal('Respuesta de encuesta · ' + p.CLIENTE, '<label class="campo req"><span>Calificación (1 a 5)</span><select id="en-cal">' + opciones(['5','4','3','2','1'], p.CALIFICACION, '-') + '</select></label><label class="campo" style="margin-top:8px"><span>Comentarios</span><textarea id="en-com">' + esc(p.COMENTARIOS) + '</textarea></label>',
    function(){ srv('ventasRegistrarEncuesta', [p.ID_POST, val('en-cal'), val('en-com')], function(){ cerrarModal(); toast('Encuesta registrada.'); cargarPostventa(); }); });
}
function formPqrsf(i){
  var p = LISTA_PV[i];
  modal('Vincular PQRSF · ' + p.CLIENTE, '<div class="grid g2">' +
    '<label class="campo req"><span>N° PQRSF</span><input id="pq-num" value="' + esc(p.PQRSF_NUM) + '"></label>' +
    '<label class="campo"><span>Tipo</span><select id="pq-tipo">' + opciones(['Petición','Queja','Reclamo','Sugerencia','Felicitación'], p.PQRSF_TIPO, '-') + '</select></label>' +
    '<label class="campo"><span>Estado</span><select id="pq-est">' + opciones(['Abierta','En análisis','En tratamiento','Cerrada'], p.PQRSF_ESTADO || 'Abierta') + '</select></label>' +
    '<label class="campo"><span>Enlace al gestor de no conformidades</span><input id="pq-url" value="' + esc(p.PQRSF_ENLACE || CAT.urlPqrsf) + '"></label></div>',
    function(){ srv('ventasVincularPQRSF', [p.ID_POST, val('pq-num'), val('pq-tipo'), val('pq-est'), val('pq-url')], function(){ cerrarModal(); toast('PQRSF vinculada.'); cargarPostventa(); }); });
}
function generarEncuestas(){
  if (!confirm('¿Generar y enviar las encuestas del semestre anterior a los clientes con servicios entregados?')) return;
  srv('ventasEncuestaSemestral', [true], function(r){ toast(String(r)); cargarPostventa(); });
}

/* ============================== ARRANQUE ============================== */
$('modal').addEventListener('click', function(e){ if (e.target === this) cerrarModal(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') cerrarModal(); });
iniciar();
</script>
</body>
</html>`;
}
