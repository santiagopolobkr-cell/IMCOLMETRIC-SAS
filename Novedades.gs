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
    resumen: "El histórico de Drive (2025 y 2026) quedó en Ventas: 65 servicios con OT o solicitud del cliente en «Postventa» y 150 cotizaciones sin OT en «Cerrada por desistimiento». Las 60 OT quedaron despachadas en el Almacén.", pasos: [
    { titulo: "Ventas: seguimiento postventa", texto: "Los servicios con OT o solicitud del cliente están en «Postventa», con las fechas del flujo y su registro de encuesta (uno por cliente y semestre) en estado «Pendiente envío». Las cotizaciones que no tuvieron OT ni solicitud quedan «Cerrada por desistimiento» y no van a la encuesta. Las fechas posteriores a la OT son aproximadas y la factura figura como «N/R (histórico)».",
      porque: "Esos servicios ya se ejecutaron y entregaron.", paraque: "Para hacer el seguimiento postventa y la encuesta de satisfacción (5.10) sobre servicios reales." },
    { titulo: "Almacén: OT despachadas", texto: "Cada OT tiene su recepción, salida al área técnica, retorno y despacho con acta de entrega, y sus equipos quedan «Despachado». Los registros llevan la marca [Importado de Drive]: verifica las fechas contra los soportes físicos.",
      porque: "Lo que entra como OT entra al almacén y cierra allí su flujo.", paraque: "Para que Ventas y Almacén muestren la misma ruta completa de cada servicio." }] },
  { clave: "2026-11-logo-menu", modulo: "general", titulo: "Logo de IMCOLMETRIC en el menú lateral", tipo: "Mejora",
    resumen: "El encabezado del menú lateral ahora muestra el logo oficial de IMCOLMETRIC «Precisión y calidad».", pasos: [
    { titulo: "Identidad de la empresa", texto: "En lugar del recuadro «IM» y el texto, el encabezado del menú muestra el logo de IMCOLMETRIC en su versión para fondo oscuro (letras blancas), con «Sistema de Gestión de Calidad» debajo.",
      porque: "La plataforma debe reflejar la imagen institucional.", paraque: "Para que los usuarios reconozcan la herramienta como propia de la empresa." }] },
  { clave: "2026-11-login-laboratorio", modulo: "general", titulo: "Nueva pantalla de ingreso: el laboratorio en 3D", tipo: "Mejora",
    resumen: "El ingreso a la plataforma muestra al laboratorio de metrología calibrando un manómetro, con efecto de profundidad y lecturas en vivo.", pasos: [
    { titulo: "Ingreso renovado", texto: "La foto del laboratorio se inclina con el movimiento del ratón y muestra la lectura del manómetro recorriendo los puntos de calibración y las condiciones ambientales. El formulario de usuario y contraseña funciona igual que antes.",
      porque: "La primera pantalla debe transmitir lo que hace IMCOLMETRIC: calibración con trazabilidad bajo ISO/IEC 17025.", paraque: "Para reforzar la identidad del laboratorio desde el primer momento." }] },
  { clave: "2026-11-fallos-reporte", modulo: "general", titulo: "Fallos y bitácora: todo el personal puede reportar fallos", tipo: "Mejora",
    resumen: "El módulo «Fallos y bitácora» ahora está disponible para todos: tiene el formulario para reportar fallos de la plataforma y la lista «Mis reportes».", pasos: [
    { titulo: "Reportar un fallo", texto: "Entra a «Fallos y bitácora», elige el módulo, describe qué pasó y, si tomaste alguna acción inmediata, escríbela. El reporte queda con tu usuario y la fecha.",
      porque: "Los fallos de la plataforma deben registrarse y tratarse (ISO/IEC 17025, 7.11.3).", paraque: "Para que el Administrador los corrija y quede la evidencia." },
    { titulo: "Quién ve qué", texto: "Cada persona ve solo sus reportes y el tratamiento que se les dio (acción inmediata, correctiva, responsable y estado). El registro completo y la bitácora los ve únicamente el Administrador del sistema.",
      porque: "Los registros pueden contener información técnica y de otros usuarios.", paraque: "Para proteger la información y dar seguimiento a cada reporte." },
    { titulo: "Correcciones aplicadas", texto: "Se corrigieron los fallos registrados: el error «Ya existe una hoja con el nombre NOV_Vistas» (F-0001) y el error al marcar casillas en Permisos de usuarios (F-0002 a F-0004).",
      porque: "Estaban abiertos en el registro.", paraque: "Para que esas pantallas funcionen sin errores." }] },
  { clave: "2026-11-alertas-vencidas", modulo: "general", titulo: "Alertas de actividades vencidas e indicadores sin diligenciar", tipo: "Nuevo",
    resumen: "Al ingresar, la plataforma te muestra una ventana con lo que tienes vencido como responsable en Cambios, Oportunidades, No Conformidades, Riesgos e Indicadores.", pasos: [
    { titulo: "Actividades vencidas", texto: "Si eres responsable (por tu cargo) de una actividad de Gestión del Cambio, de la Matriz de Oportunidades, de una acción de la Matriz de Riesgos o de una acción correctiva de No Conformidades y su fecha ya pasó sin terminarse, aparece en la ventana con la fecha en que venció y los días de atraso.",
      porque: "Las acciones del SGC deben cumplirse en las fechas planificadas.", paraque: "Para que nada se quede vencido sin que el responsable lo sepa." },
    { titulo: "Indicadores después del día 5", texto: "Si después del día 5 de cada mes el indicador no tiene diligenciado el periodo que cerró, al líder del proceso (responsable de medición o de análisis) le sale el recordatorio.",
      porque: "La medición debe registrarse a tiempo para analizar el desempeño del proceso.", paraque: "Para mantener los indicadores al día." },
    { titulo: "Se recuerda en cada ingreso", texto: "La ventana aparece cada vez que entras a la plataforma mientras tengas pendientes vencidos: si ingresas 20 veces en el día, se te recuerda 20 veces. Con «Ir al módulo» vas directo a resolverlo.",
      porque: "Un recordatorio que se puede ignorar una sola vez se olvida.", paraque: "Para que el pendiente se atienda." }] },
  { clave: "2026-11-trazabilidad-usuarios", modulo: "general", titulo: "Trazabilidad de las acciones en la plataforma", tipo: "Nuevo",
    resumen: "Cada ingreso y cada registro que creas, modificas o eliminas queda registrado con tu usuario, la fecha y el módulo.", pasos: [
    { titulo: "Qué se registra", texto: "Ingresos y salidas, el módulo que abres y cada creación, modificación o eliminación de registros, con su resultado. No se registran contraseñas ni el contenido de los archivos.",
      porque: "La información del SGC debe estar protegida contra cambios o eliminaciones no autorizados (ISO/IEC 17025, 7.11 y 8.4).", paraque: "Para saber quién hizo cada cambio y poder recuperarlo." },
    { titulo: "Quién lo ve", texto: "Solo el Administrador del sistema ve en tiempo real quién está conectado y la trazabilidad, y recibe un correo cuando alguien elimina un registro. Puede cerrar la sesión de un usuario si es necesario.",
      porque: "El control lo ejerce el Administrador.", paraque: "Para prevenir eliminaciones o cambios no deseados." }] },
  { clave: "2026-11-trazabilidad-servicio", modulo: "alm", titulo: "Trazabilidad completa de cada servicio, con sus documentos", tipo: "Nuevo",
    resumen: "En Almacén, Compras y Ventas, el botón «Trazabilidad de un servicio» muestra todo el recorrido de una OT con los documentos de la carpeta de Drive.", pasos: [
    { titulo: "Trabajo del laboratorio", texto: "Solicitud del cliente (CS) → Orden de trabajo (OT) → Recepción del equipo → Código interno (MT-FO-014 Control interno de equipos) → Certificado emitido. La trazabilidad termina en el Almacén.",
      porque: "Cada servicio debe poder reconstruirse de principio a fin (ISO/IEC 17025, 7.4 y 7.5).", paraque: "Para responder a cualquier pregunta del cliente o del auditor con el soporte a la mano." },
    { titulo: "Servicio tercerizado", texto: "Solicitud del cliente (CS) → OT → Recepción del equipo → Solicitud de Compras (GCO-FO-006) → Orden de compra (GCO-FO-005) → Certificado emitido por el tercero. La trazabilidad termina en Compras.",
      porque: "El laboratorio responde por el trabajo del proveedor externo (6.6).", paraque: "Para verificar que cada servicio tercerizado tenga su compra y su certificado." },
    { titulo: "Los documentos se leen solos", texto: "La plataforma busca en vivo en la carpeta compartida de Drive (Solicitudes de clientes, Ordenes de Trabajo, Control Interno de Equipos, Certificados Emitidos y Certificados Emitidos Tercerizados) por el número de OT, el N° de certificado, el inventario o la serie del equipo. Lo nuevo que se suba aparece sin hacer nada más.",
      porque: "Los documentos se siguen guardando en esa carpeta.", paraque: "Para que la trazabilidad esté siempre al día." }] },
  { clave: "2026-11-ven-historico-limpio", modulo: "ven", titulo: "Línea de tiempo del histórico más clara", tipo: "Mejora",
    resumen: "Las solicitudes del histórico muestran en su línea de tiempo solo el registro de la solicitud y su cierre (postventa o desistimiento), con sus fechas reales.", pasos: [
    { titulo: "Sin notas de carga", texto: "Se quitaron de Ventas y Almacén las notas y rutas que dejó la carga del histórico. Los enlaces a los documentos se conservan.",
      porque: "La línea de tiempo debe mostrar lo que pasó con el servicio.", paraque: "Para leer cada solicitud sin ruido." }] },
  { clave: "2026-11-equipos-control-interno", modulo: "alm", titulo: "Equipos reales de cada OT y trazabilidad desde el Detalle", tipo: "Mejora",
    resumen: "Las OT del histórico muestran ahora sus equipos reales, con código interno y N° de certificado, y el Detalle del equipo y las solicitudes y órdenes de compra de un tercerizado abren la trazabilidad completa del servicio.", pasos: [
    { titulo: "Equipos según el MT-FO-014", texto: "Cada OT del histórico tiene la lista real de equipos del Control interno de equipos (MT-FO-014): equipo, marca, modelo, serie, inventario, código interno con su color de etiqueta y N° de certificado. El acta de entrega quedó con la misma lista.",
      porque: "El código interno y el certificado identifican cada equipo durante todo el servicio (ISO/IEC 17025, 7.4).", paraque: "Para que la trazabilidad de cada OT muestre sus certificados y no un equipo genérico." },
    { titulo: "Botón en el Detalle del equipo", texto: "En Almacén, al abrir el Detalle de un equipo, el botón «🔎 Ver trazabilidad completa del servicio» muestra la CS, la OT, la recepción, el código interno y el certificado emitido.",
      porque: "El servicio del laboratorio termina en el Almacén.", paraque: "Para consultar todo el recorrido sin salir del equipo." },
    { titulo: "Botón en Compras", texto: "Las solicitudes y órdenes de compra de un servicio tercerizado muestran la OT, el cliente y la solicitud de Ventas, con el mismo botón de trazabilidad hasta el certificado del tercero.",
      porque: "El servicio tercerizado termina en Compras (ISO/IEC 17025, 6.6).", paraque: "Para verificar la compra y el certificado del proveedor desde la misma pantalla." }] },
  { clave: "2026-11-bd-equipos-calibrados", modulo: "alm", titulo: "Certificados amarrados a su OT y su CS (MT-FO-015)", tipo: "Mejora",
    resumen: "La trazabilidad del servicio lee la Base de datos de equipos calibrados (MT-FO-015) de la carpeta «BD Equipos Calibrados» y une cada N° de certificado con su OT y su CS.", pasos: [
    { titulo: "Busca por OT, CS o certificado", texto: "En la ventana «Trazabilidad de un servicio» puedes escribir la OT (OT-053-26), la CS (SC-0053) o el N° de certificado (IMC-JJ2057): la plataforma encuentra la OT y muestra todo el recorrido.",
      porque: "El certificado debe poder rastrearse hasta la solicitud del cliente (ISO/IEC 17025, 7.5 y 7.8).", paraque: "Para responder de inmediato a un cliente o auditor que pregunta por un certificado." },
    { titulo: "Fechas y metrólogo de cada certificado", texto: "Cada equipo muestra su fecha de calibración, su fecha de emisión y el metrólogo que lo calibró, tomados del MT-FO-015. Si el Almacén no tiene la lista de equipos de una OT, la lista sale de esa base de datos.",
      porque: "El MT-FO-015 es el registro del laboratorio de los equipos calibrados.", paraque: "Para que la etapa «Certificado emitido» quede completa con el soporte del laboratorio." },
    { titulo: "Siempre al día", texto: "Basta con mantener actualizado el MT-FO-015 en la carpeta «BD Equipos Calibrados»: la plataforma lo vuelve a leer cada 30 minutos o al pulsar «↻ Volver a leer Drive».",
      porque: "La base de datos se sigue llevando en Excel.", paraque: "Para no registrar dos veces la misma información." }] },
  { clave: "2026-11-doc-editar-url", modulo: "doc", titulo: "Cambiar el enlace de un documento desde el listado maestro", tipo: "Mejora",
    resumen: "El Administrador del sistema y el Coordinador de Calidad pueden corregir el enlace del archivo de cualquier documento con el botón «✏️ URL» del listado maestro.", pasos: [
    { titulo: "Botón «✏️ URL»", texto: "En Documentos SGC › Listado maestro, junto a «Ver», el botón «✏️ URL» muestra el enlace actual y permite pegar el nuevo enlace de Google Drive (Compartir › Copiar vínculo).",
      porque: "Cuando un archivo se reemplaza o se mueve en Drive, el enlace del listado debe apuntar al archivo vigente (ISO 9001, 7.5.3).", paraque: "Para que todos vean siempre la versión correcta sin editar la hoja." },
    { titulo: "Queda registrado", texto: "Cada cambio guarda quién lo hizo, cuándo, el enlace anterior y el nuevo en la trazabilidad de Solicitud Documental. Solo aparece para el Administrador y el Coordinador de Calidad.",
      porque: "Los cambios en la información documentada deben ser controlados.", paraque: "Para poder revisar o revertir un cambio de enlace." }] },
  { clave: "2026-11-sol-documento-limpio", modulo: "sol", titulo: "El documento aprobado se publica sin las marcas de revisión", tipo: "Mejora",
    resumen: "Al aprobar una solicitud documental, el sistema genera el documento oficial limpio: borra lo que está en rojo y deja en negro normal lo que está resaltado en amarillo.", pasos: [
    { titulo: "Cómo marcar los cambios", texto: "En el documento que se adjunta a la solicitud: lo que se elimina va en letra ROJA y lo nuevo va RESALTADO EN AMARILLO. Así lo ven el revisor y el aprobador.",
      porque: "Los cambios deben identificarse en la revisión del documento (ISO 9001, 7.5.2).", paraque: "Para que quien revisa y aprueba vea exactamente qué cambia." },
    { titulo: "Al aprobar", texto: "Se crea una copia con el código y la versión en el nombre (ej. GC-PR-002 V2 …): sin el texto rojo y con lo amarillo en negro normal. Esa copia es la que se publica en Documentos SGC. Funciona con Word (.docx), Excel (.xlsx y .xlsm, conservando las macros) y documentos de Google.",
      porque: "El documento vigente no debe mostrar las marcas de revisión.", paraque: "Para publicar el documento listo para usar, sin editarlo a mano." },
    { titulo: "Queda el soporte", texto: "El archivo con las marcas se conserva como soporte de la revisión y la trazabilidad de la solicitud muestra cuántos textos rojos se eliminaron y cuántos resaltados se quitaron.",
      porque: "Se debe conservar la evidencia de los cambios aprobados.", paraque: "Para poder consultar qué cambió en cada versión." }] },
  { clave: "2026-11-gd-siguiente-pendiente", modulo: "gd", titulo: "Pasa a la siguiente solicitud pendiente sin volver a la bandeja", tipo: "Mejora",
    resumen: "Al revisar, aceptar o aprobar una solicitud documental, las flechas «‹ Anterior» y «Siguiente ›» llevan a las demás solicitudes pendientes.", pasos: [
    { titulo: "Flechas en la solicitud", texto: "Si abres una solicitud desde «Pendientes de Revisión», «Pendientes de Aceptación» o «Pendientes de Aprobación», arriba a la derecha verás cuántas tienes (ej. 1 de 3 pendientes por aprobar) y las flechas para moverte entre ellas.",
      porque: "Revisar varias solicitudes seguidas debe ser ágil.", paraque: "Para no volver a la página principal después de cada solicitud." },
    { titulo: "Después de aprobar", texto: "Cuando apruebas, solicitas ajustes o rechazas, aparece el botón «Siguiente solicitud (N pendientes) ›» y la solicitud atendida deja de contarse como pendiente.",
      porque: "La bandeja se atiende en orden.", paraque: "Para terminar todas las pendientes en un solo recorrido." }] },
  { clave: "2026-11-visor-zoom", modulo: "general", titulo: "Ampliar los documentos en el visor", tipo: "Mejora",
    resumen: "El visor de documentos (manuales de funciones, hojas de vida, informes y documentos del SGC) tiene botones para ampliar y reducir.", pasos: [
    { titulo: "Botones − y +", texto: "Arriba a la derecha del visor: «+» amplía, «−» reduce y «↔ Ajustar» vuelve al ancho de la ventana. El porcentaje muestra el tamaño actual (hasta 400 %). Al ampliar puedes moverte hacia los lados con la barra de desplazamiento.",
      porque: "Algunos formatos tienen letra muy pequeña.", paraque: "Para leer el documento completo sin descargarlo." },
    { titulo: "Atajos", texto: "También puedes usar las teclas + y − (0 para ajustar) o Ctrl + rueda del ratón. Los manuales de funciones, hojas de vida e informes se vuelven a dibujar al tamaño elegido, así que se leen nítidos.",
      porque: "Es la forma habitual de ampliar en el computador.", paraque: "Para ampliar rápido." }] },
  { clave: "2026-11-op-acciones-mejora", modulo: "op", titulo: "«Matriz de Oportunidades» ahora se llama «Acciones de Mejora»", tipo: "Cambio",
    resumen: "El módulo cambia de nombre y el formulario queda con los campos del formato: proceso, descripción, impacto y beneficios de la oportunidad, su evaluación y si genera cambios en el sistema.", pasos: [
    { titulo: "Lo que registra el colaborador", texto: "Proceso, descripción de la oportunidad, impacto, beneficios, probabilidad, ocurrencias previas y los cuatro potenciales: satisfacción del cliente, imagen de la institución, satisfacción de las regulaciones y costo de implementación (No Hay/ NA, Menor, Moderado, Alto, Muy alto).",
      porque: "Las oportunidades se evalúan con los mismos criterios del formato (ISO 9001, 6.1).", paraque: "Para que cualquier colaborador pueda proponer una acción de mejora." },
    { titulo: "Calificación automática", texto: "Prob. calificación = el mayor entre probabilidad y ocurrencias; Beneficio calificación = el mayor de los cuatro potenciales; Factor = Prob × Beneficio. Desde 15 sale «Abordar oportunidad» y por debajo «Descartar oportunidad».",
      porque: "Son las fórmulas del formato con la hoja Referencias.", paraque: "Para decidir qué oportunidades se abordan." },
    { titulo: "Genera cambios en el sistema", texto: "Al final del formulario, «Genera cambios en el sistema» (Sí / No) solo lo diligencian el Administrador del sistema y el Coordinador de Calidad; para los demás aparece bloqueado.",
      porque: "Los cambios del sistema se planifican de forma controlada (ISO 9001, 6.3).", paraque: "Para identificar las acciones de mejora que deben pasar a Gestión del Cambio." }] },
  { clave: "2026-11-op-pasa-a-cambio", modulo: "cam", titulo: "Las acciones de mejora que generan cambios pasan a Gestión del Cambio", tipo: "Mejora",
    resumen: "Cuando Calidad define que una oportunidad genera cambios en el sistema, se avisa al líder del proceso y la oportunidad queda como entrada de la gestión del cambio.", pasos: [
    { titulo: "El formulario de la oportunidad", texto: "La acción de mejora ya no lleva actividades ni seguimiento: se registra la oportunidad y su evaluación. Las actividades se planifican en Gestión del Cambio.",
      porque: "El plan del cambio se lleva en un solo lugar.", paraque: "Para no duplicar el seguimiento." },
    { titulo: "Aviso al líder del proceso", texto: "Al guardar «Sí» en «Genera cambios en el sistema», el líder del proceso (matriz de rutas documentales) recibe un correo y, cada vez que ingresa, la ventana de pendientes le recuerda registrar la gestión del cambio.",
      porque: "El líder del proceso planifica y controla el cambio (ISO 9001, 6.3).", paraque: "Para que ninguna oportunidad que genera cambios quede sin gestionar." },
    { titulo: "La oportunidad como entrada", texto: "En Gestión del Cambio, el recuadro «Oportunidades de mejora que generan cambios» tiene el botón «Registrar gestión del cambio»: el formulario se abre con el proceso, la descripción, la justificación y el escenario «Oportunidad» ya cargados, y la entrada «Oportunidad de mejora N°». Al guardarlo, la oportunidad queda enlazada a su cambio.",
      porque: "Cada cambio debe mostrar de dónde viene.", paraque: "Para tener la trazabilidad oportunidad → cambio." }] },
  { clave: "2026-11-cam-riesgos", modulo: "cam", titulo: "Al terminar un cambio se identifican sus riesgos", tipo: "Mejora",
    resumen: "Cuando el cambio llega al 100 % (implementado), en «Seguimiento» se identifican sus riesgos: de la Matriz de Riesgos o nuevos con «Otro».", pasos: [
    { titulo: "Riesgos de la matriz", texto: "Al poner el cumplimiento en 100 % aparece «Riesgos del cambio implementado» con la lista de riesgos de la Matriz de Riesgos (con buscador). Marca los que aplican al cambio. Sin riesgos identificados, el cambio no se puede terminar.",
      porque: "Los cambios pueden generar riesgos nuevos o modificar los existentes (ISO 9001, 6.1 y 6.3).", paraque: "Para que cada cambio implementado tenga sus riesgos controlados." },
    { titulo: "Riesgo nuevo («Otro»)", texto: "Marca «Otro» y escribe el riesgo nuevo (puedes agregar varios). Al guardar el cambio se abre la Matriz de Riesgos con el evento, el proceso y la entrada «Gestión del Cambio CAM-…» ya cargados, para hacer todo el proceso: identificación, riesgo inherente, controles y residual, tratamiento y monitoreo.",
      porque: "Todo riesgo se evalúa con la misma metodología de la matriz.", paraque: "Para no dejar riesgos sin evaluar." },
    { titulo: "Quedan enlazados", texto: "El riesgo registrado queda con la entrada del cambio y el cambio muestra sus riesgos con el número de ítem de la matriz.",
      porque: "Se debe poder seguir el camino oportunidad → cambio → riesgo.", paraque: "Para tener la trazabilidad completa." }] },
  { clave: "2026-11-informes-pdf", modulo: "general", titulo: "Informes en PDF con el membrete de IMCOLMETRIC", tipo: "Nuevo",
    resumen: "Gestión del Cambio, Acciones de Mejora y No Conformidades generan el informe en PDF de cada registro y un informe consolidado con todos.", pasos: [
    { titulo: "PDF de un registro", texto: "En Gestión del Cambio: botón «📄 PDF» en el detalle del cambio. En Acciones de Mejora y No Conformidades: botón «PDF» en la columna Opciones del listado. El informe se descarga con el membrete (GC-OD-001) y las secciones del registro.",
      porque: "Los registros del SGC deben poder presentarse como soporte (ISO 9001, 7.5).", paraque: "Para entregar o archivar el informe de cada registro." },
    { titulo: "Informe consolidado", texto: "El botón «📄 Informe consolidado (PDF)» de cada módulo genera un solo PDF: primero un resumen con todos los registros y luego el informe completo de cada uno, cada uno en su página.",
      porque: "La revisión por la dirección y las auditorías requieren ver todos los registros.", paraque: "Para tener el consolidado listo sin armarlo a mano." }] },
  { clave: "2026-11-informes-por-proceso", modulo: "mr", titulo: "Informes PDF de la Matriz de Riesgos y consolidados por proceso", tipo: "Mejora",
    resumen: "La Matriz de Riesgos también genera informes en PDF y todos los consolidados (Gestión del Cambio, Acciones de Mejora, No Conformidades y Matriz de Riesgos) se pueden sacar en general o por proceso.", pasos: [
    { titulo: "Matriz de Riesgos en PDF", texto: "Botón «PDF» en la columna Opciones de la lista y «📄 PDF» en el detalle del riesgo: identificación, riesgo inherente, controles y residual, tratamiento y monitoreo, con el membrete de IMCOLMETRIC.",
      porque: "La matriz de riesgos es soporte de la planificación del SGC (ISO 9001, 6.1).", paraque: "Para presentar cada riesgo con su evaluación completa." },
    { titulo: "General o por proceso", texto: "Al pulsar «📄 Informe consolidado (PDF)» se abre una ventana para escoger «General» (todos los procesos) o un proceso, con el número de registros de cada uno.",
      porque: "Cada líder revisa los registros de su proceso.", paraque: "Para entregar a cada proceso solo lo suyo." },
    { titulo: "Proceso en las No Conformidades", texto: "El formulario de No Conformidades tiene ahora el campo «Proceso». Las registradas antes quedan como «Sin proceso» hasta que se les asigne.",
      porque: "Sin proceso no se puede sacar el informe por proceso.", paraque: "Para filtrar las no conformidades por proceso." },
    { titulo: "PDF desde la lista de cambios", texto: "En Gestión del Cambio, vista «Lista», la columna Opciones tiene el botón «PDF».",
      porque: "Es donde se consulta cada cambio.", paraque: "Para descargar el informe sin abrir el detalle." }] },
  { clave: "2026-11-nc-acciones-correctivas", modulo: "nc", titulo: "«No Conformidades» ahora se llama «Acciones Correctivas»", tipo: "Cambio",
    resumen: "El módulo cambia de nombre en el menú, en el inicio, en los permisos, en las alertas y en los informes PDF. Los registros, sus números y su información no cambian.", pasos: [
    { titulo: "Mismo funcionamiento", texto: "Se sigue registrando la no conformidad con su corrección, el análisis de causas y las acciones correctivas (formato GC-FO-011 Plan de acciones correctivas).",
      porque: "El nombre del módulo refleja el formato que se diligencia.", paraque: "Para encontrar el módulo con el nombre del proceso del SGC." }] },
  { clave: "2026-11-trz-recepcion-certificados", modulo: "alm", titulo: "Trazabilidad: formato de recepción y certificados emitidos", tipo: "Mejora",
    resumen: "La trazabilidad del servicio muestra el formato de recepción de la OT y los certificados emitidos (en PDF) de cada equipo.", pasos: [
    { titulo: "Recepción del equipo", texto: "La etapa «Recepción del equipo» enlaza el formato CS-FO-001 de la carpeta «Recepción de Equipos» que lleva la OT en el nombre (ej. CS-FO-001 V0 OT-053-26.pdf).",
      porque: "La recepción es evidencia del estado en que llegó el equipo (ISO/IEC 17025, 7.4).", paraque: "Para ver el soporte de la recepción sin buscarlo en Drive." },
    { titulo: "Certificado emitido", texto: "Con el N° de certificado de la base de datos de equipos calibrados (MT-FO-015) se busca el PDF en «Certificados Emitidos» y en «Certificados Emitidos Tercerizados». La etapa muestra los certificados encontrados y avisa cuáles aún no están cargados.",
      porque: "El certificado es el resultado del servicio (ISO/IEC 17025, 7.8).", paraque: "Para abrir el certificado de cada equipo desde la OT." }] },
  { clave: "2026-11-servicios-prestados", modulo: "ven", titulo: "Servicios prestados y contratos de los clientes", tipo: "Nuevo",
    resumen: "En Ventas, Compras y Almacén, el botón «📋 Servicios prestados» muestra la trazabilidad de todos los servicios (laboratorio y tercerizados), con su contrato, OC al tercero y certificados.", pasos: [
    { titulo: "Botón «Servicios prestados»", texto: "Está en la barra superior de Ventas, Compras y Almacén. Lista cada OT o CS con su fecha, cliente, contrato o acuerdo, ruta (Laboratorio, Tercerizado o Mixto), tercero, OC y certificados. Se filtra por texto, ruta y cliente, y se descarga a Excel. «Ver trazabilidad» abre el recorrido completo de ese servicio.",
      porque: "Solo aparecen servicios prestados a clientes: las órdenes de compra propias del laboratorio (equipos patrón, insumos) no se mezclan.", paraque: "Para ver en un solo lugar el estado y los soportes de cada servicio." },
    { titulo: "Contrato del cliente en la trazabilidad", texto: "Cuando la SC está bajo un contrato o acuerdo, la trazabilidad empieza por el contrato (N°, objeto, vigencia) y enlaza el PDF de la carpeta «Contratos» de Drive. Las SC del Hospital Moncaleano (contrato 169), Baraya (contrato 54) y Guadalupe (contratos 024 y 220) quedan asociadas a su contrato, y las de DISCOLMETS a su acuerdo de servicios.",
      porque: "El contrato es la revisión de la solicitud y la aceptación del cliente (ISO/IEC 17025, 7.1).", paraque: "Para saber bajo qué contrato se prestó cada servicio." },
    { titulo: "OC y certificado del tercero", texto: "En los servicios tercerizados se enlazan las órdenes de compra de la carpeta «Ordenes de Compra» y el certificado que emitió el tercero (carpeta «Certificados Emitidos Tercerizados»). También se puede buscar por el N° de certificado del tercero (ej. P26-491) o por una CS sin OT.",
      porque: "El servicio externo debe quedar controlado y verificado (ISO/IEC 17025, 6.6).", paraque: "Para tener la evidencia completa del servicio tercerizado." }] },
  { clave: "2026-11-op-formato-anterior", modulo: "op", titulo: "Acciones de Mejora: cada registro conserva su formato", tipo: "Mejora",
    resumen: "Las oportunidades ya registradas se ven y se editan con su formato anterior (Matriz de Oportunidades); las nuevas usan el formato de Acciones de Mejora.", pasos: [
    { titulo: "Registros anteriores", texto: "Conservan el objetivo estratégico, los procesos internos del SGC, el costo en pesos, las actividades, el seguimiento y la verificación, y su cálculo original (el costo no entra en el beneficio; «Abordar Oportunidad» o «Descartar y/o reevaluar Oportunidad»). En el listado, «Genera cambios» dice «No aplica · formato anterior», y su informe PDF sale con esa estructura.",
      porque: "Los registros del SGC no se modifican después de emitidos (ISO/IEC 17025, 8.4).", paraque: "Para que lo registrado quede tal como se evaluó." },
    { titulo: "Registros nuevos", texto: "Desde ahora cada oportunidad nueva se registra con el formato de Acciones de Mejora (cuatro potenciales con el costo de implementación, y «Genera cambios en el sistema» definido por Calidad). El formato queda guardado en cada registro.",
      porque: "El formulario corregido rige hacia adelante.", paraque: "Para no mezclar estructuras en un mismo registro." }] },
  { clave: "2026-11-boton-regresar", modulo: "general", titulo: "Botón «Regresar» en todas las pantallas", tipo: "Nuevo",
    resumen: "En la barra superior aparece «← Regresar», que lo devuelve a la pantalla anterior en la que estuvo, en cualquier módulo.", pasos: [
    { titulo: "Cómo funciona", texto: "Cada pantalla que abre (menú, pestañas, listados, formularios, detalles y las vistas de Ventas, Compras y Almacén) queda en el historial. «← Regresar» vuelve un paso atrás, abre el módulo si hace falta y espera a que carguen los datos. También funciona con Alt + ←.",
      porque: "Volver por el menú obligaba a buscar de nuevo el registro.", paraque: "Para moverse entre pantallas sin perder el lugar." },
    { titulo: "Qué no repite", texto: "Regresar solo repite la navegación: nunca vuelve a guardar, eliminar, aprobar ni enviar nada. Las ventanas emergentes se cierran con su botón ✕. Al cerrar sesión el historial empieza de nuevo.",
      porque: "Volver atrás no debe cambiar ningún registro.", paraque: "Para usarlo con tranquilidad." }] },
  { clave: "2026-11-tnc-gc-fo-007", modulo: "nc", titulo: "Trabajo No Conforme (TNC) en Acciones Correctivas", tipo: "Nuevo",
    resumen: "Acciones Correctivas tiene la pestaña «🧾 Trabajo No Conforme (TNC)» con el formulario GC-FO-007, los 4 TNC ya registrados y sus evidencias de Drive.", pasos: [
    { titulo: "Registrar un TNC", texto: "El formulario sigue el GC-FO-007 V3: datos generales, descripción, evaluación de impacto (Sí/No), importancia, aceptabilidad, corrección inmediata, verificación y cierre, evidencias anexas y firma. La causa se puede elegir de la matriz GC-FO-008, que sugiere la importancia y la acción inmediata. El N° de consecutivo se asigna al guardar.",
      porque: "El laboratorio debe controlar el trabajo que no cumple sus procedimientos o los requisitos del cliente (ISO/IEC 17025, 7.10).", paraque: "Para registrar y cerrar cada TNC en la plataforma." },
    { titulo: "Adjuntos del TNC", texto: "Las evidencias se adjuntan en el TNC y se ven en la columna «Adjuntos» y en la consulta, con vista previa, como en los demás módulos. Al guardar se genera el registro GC-FO-007 en PDF y queda en los adjuntos. Los TNC 1 a 4 muestran las evidencias que ya tenían.",
      porque: "Las evidencias deben quedar juntas y controladas (ISO/IEC 17025, 8.4).", paraque: "Para encontrar el soporte de cada TNC sin buscarlo en Drive." },
    { titulo: "Acción correctiva", texto: "Si el TNC puede repetirse o no es aceptable, marca «Requiere acción correctiva» y usa «Registrar la acción correctiva»: abre la no conformidad con los datos del TNC.",
      porque: "ISO/IEC 17025, 7.10.2: si el trabajo no conforme puede repetirse se toma una acción correctiva.", paraque: "Para pasar del TNC a la acción correctiva sin volver a escribir." }] },
  { clave: "2026-11-trz-carpetas-laboratorio", modulo: "alm", titulo: "Trazabilidad: documentos de las carpetas del laboratorio", tipo: "Mejora",
    resumen: "La trazabilidad del servicio toma las CS, las OT, las recepciones, el MT-FO-014 y los certificados (emitidos y tercerizados) de las carpetas de la unidad compartida del laboratorio.", pasos: [
    { titulo: "Carpetas", texto: "CS: «Solicitudes clientes» · OT: «GCV-FO-002 V0 ORDEN DE TRABAJO» · Recepción: «MT-FO-001- DILIGENCIADO» · Código interno: «MT-FO-014 CONTROL INTERNO DE EQUIPOS» · Certificados: «CERTIFICADOS EMITIDOS» y «CERTIFICADOS TERCERIZADOS».",
      porque: "Los registros se conservan en las carpetas del laboratorio (ISO/IEC 17025, 8.4).", paraque: "Para que la trazabilidad muestre siempre los documentos vigentes." },
    { titulo: "Recepción del equipo", texto: "Si el nombre del archivo no trae la OT, se busca dentro de las actas por el N° de certificado o el inventario de los equipos de la OT.",
      porque: "Las actas se nombran por su consecutivo, no por la OT.", paraque: "Para encontrar la recepción aunque el archivo no diga la OT." }] },
  { clave: "2026-11-ventas-cotizaciones", modulo: "ven", titulo: "Ventas: cotizaciones GCV-FO-003 con el portafolio de servicios", tipo: "Nuevo",
    resumen: "En Ventas está el botón «🧾 Cotizaciones»: se cotiza con los servicios y precios del portafolio GCV-FO-005, se genera el PDF con la hoja membrete y, con la cotización, se crea la «Nueva solicitud».", pasos: [
    { titulo: "Cotizar primero", texto: "«➕ Nueva cotización» tiene los campos del GCV-FO-003 V3: fecha, cliente, Nit, dirección, ciudad, Ref. y N° de cotización (2026-0001…). Los servicios se toman del portafolio con su valor e IVA (se pueden ajustar), con marca, referencia o modelo y cantidad; los totales se calculan solos. Las condiciones generales del formato van completas en el PDF.",
      porque: "La oferta al cliente debe quedar documentada antes de aceptar el trabajo (ISO/IEC 17025, 7.1).", paraque: "Para cotizar rápido y con los precios vigentes." },
    { titulo: "PDF con la hoja membrete", texto: "Al guardar se descarga el PDF de la cotización con el membrete de IMCOLMETRIC y queda guardado en Drive (carpeta de Ventas › Cotizaciones). El botón «📄 PDF» lo genera de nuevo cuando lo necesite.",
      porque: "El formato controlado se emite igual para todos los clientes.", paraque: "Para enviar la cotización al cliente sin pasar por Excel." },
    { titulo: "Portafolio editable (GCV-FO-005)", texto: "En «📚 Portafolio de servicios» la Gerencia o el Administrador agregan, modifican, desactivan o quitan servicios y precios, uno a uno o pegando las filas del Excel (descripción, valor, IVA). Las cotizaciones ya emitidas conservan su precio.",
      porque: "Los precios cambian y el portafolio debe estar al día.", paraque: "Para que cada cotización salga con el precio correcto." },
    { titulo: "De la cotización a la Nueva solicitud", texto: "«➡ Nueva solicitud» abre Ventas con los datos del cliente y los servicios de la cotización. Al registrarla, la cotización queda unida a la solicitud (N°, valores y PDF). En la Nueva solicitud ya no está «Lugar del servicio», «Comercial responsable» es la lista «Gerente» y hay un campo nuevo: «Correo de Emisión de Certificado».",
      porque: "Primero se cotiza y después se registra la solicitud del cliente.", paraque: "Para no escribir dos veces los mismos datos y saber a qué correo enviar los certificados." }] },
  { clave: "2026-11-ventas-nueva-solicitud-fo004", modulo: "ven", titulo: "Ventas: «Nueva solicitud» con los campos del GCV-FO-004 V2", tipo: "Mejora",
    resumen: "La «Nueva solicitud» sigue el formato de solicitud de calibración de equipos GCV-FO-004 V2.03.2026, sección por sección y con sus campos obligatorios.", pasos: [
    { titulo: "Secciones del formato", texto: "Información del formato (consecutivo, fecha, canal, comercial «Gerente»), información de la solicitud (N° de cotización), generación de certificados, conformidad (documento y regla de decisión: Aceptación Simple, ILAC G8, Sigma 3 o Sigma 6), entrega de certificados, calibración en sitio, datos para facturación (con fecha del cierre contable), servicio tercerizado a Imcolmetric y equipos a calibrar.",
      porque: "La solicitud debe recoger toda la información que pide el GCV-FO-004 para emitir certificados correctos (ISO/IEC 17025, 7.1 y 7.8).", paraque: "Para que no falte ningún dato del cliente ni de los equipos." },
    { titulo: "Campos obligatorios", texto: "No se registra la solicitud si falta un campo con * del formato: N° de cotización (salvo órdenes de servicio por contrato), datos de certificados, contacto y dirección de calibración en sitio, facturación y, en cada equipo, equipo, marca, modelo, serie, código de inventario y ubicación. Si la entrega es en otra dirección («NO»), se piden sus datos.",
      porque: "El formato marca estos datos como obligatorios.", paraque: "Para evitar reprocesos con el cliente." },
    { titulo: "Consecutivo y cotización", texto: "Al registrar con cotización se asigna el número de consecutivo (SC) que llevará la OT. Si la cotización es del módulo de Cotizaciones, se llenan solos los datos del cliente y los servicios, y la cotización queda unida a la solicitud. Todos los datos del formato quedan en la hoja VENTAS_FO004.",
      porque: "El consecutivo lo asigna el asesor comercial con la cotización.", paraque: "Para mantener la secuencia SC ↔ OT." }] }
];
const NOV_IR_A = { cap: "Capacitación", sol: "Solicitud Documental", gd: "Gestión Documental", doc: "Documentos SGC", gh: "Gestión Humana",
  ind: "Indicadores", aud: "Auditoría", nc: "Acciones Correctivas", op: "Acciones de Mejora", cam: "Gestión del Cambio", mr: "Matriz de Riesgos",
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
