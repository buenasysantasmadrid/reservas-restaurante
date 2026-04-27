function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Hoja 1");
  const data = sheet.getDataRange().getValues();
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);

  if (data.action === "marcarComoImportada") {
    marcarComoImportada(ss, data.nombre, data.fecha, data.telefono); // ← añadido data.telefono
    return ContentService.createTextOutput("ok");
  }

  if (data.action === "actualizarActuales") {
    actualizarHojaActuales(data.reservas || []);
    return ContentService.createTextOutput("ok");
  }

  if (data.action === "archivarEnViejas") {
    actualizarHojaViejas(data.reservas || []);
    return ContentService.createTextOutput("ok");
  }

  const sheet = ss.getSheetByName("VIEJAS");
  const reservas = Array.isArray(data) ? data : [];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["NOMBRE","TELEFONO","FECHA","HORA","PAX","MESAS","ESTADO","NOTAS","EMAIL","TOMADA POR","CUANDO"]);
  }

  reservas.forEach(r => {
    sheet.appendRow([
      r.nombre     || "",
      r.telefono   || "",
      r.fecha      || "",
      r.hora       || "",
      r.personas   || "",
      (r.mesas && r.mesas.length > 0 ? r.mesas.join("+") : r.mesa || ""),
      r.estado     || "",
      r.notas      || "",
      r.email      || "",
      r.tomadaPor  || "",
      r.cuando     || ""
    ]);
  });

  return ContentService.createTextOutput("ok");
}

function marcarComoImportada(ss, nombre, fecha, telefonoEnviado) {
  const hoja1   = ss.getSheetByName("Hoja 1");
  const pasadas = ss.getSheetByName("Pasadas");
  if (!hoja1 || !pasadas) return;

  // Normaliza un teléfono quitando espacios y el prefijo 34/+34 si lo lleva
  function normalizarTel(t) {
    let s = String(t || "").replace(/\s/g, "");
    if (s.startsWith("+34")) s = s.slice(3);
    else if (s.startsWith("34") && s.length === 11) s = s.slice(2);
    return s;
  }

  const telEnviado = normalizarTel(telefonoEnviado);

  const datos = hoja1.getDataRange().getValues();
  for (let i = 1; i < datos.length; i++) {
    const nombreFila = String(datos[i][0] || "").trim();
    const telFila    = normalizarTel(datos[i][1]); // columna B = teléfono
    const celdaFecha = datos[i][2];

    let fechaFila = "";
    if (celdaFecha instanceof Date) {
      const y  = celdaFecha.getFullYear();
      const mo = String(celdaFecha.getMonth() + 1).padStart(2, "0");
      const d  = String(celdaFecha.getDate()).padStart(2, "0");
      fechaFila = `${y}-${mo}-${d}`;
    } else {
      const raw = String(celdaFecha || "").trim();
      const m   = raw.match(/(\w+)\s+(\d{1,2})\s+(\d{4})/);
      if (m) {
        const meses = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
        const mesNum = meses[m[1]];
        if (mesNum) fechaFila = `${m[3]}-${String(mesNum).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
      }
    }

    const nombreOk = nombreFila.toLowerCase() === nombre.toLowerCase();
    const fechaOk  = fechaFila === fecha;
    // Si hay teléfono en ambos lados, úsalo como criterio adicional; si falta en alguno, no bloquea
    const telOk    = !telEnviado || !telFila || telFila === telEnviado;

    if (nombreOk && fechaOk && telOk) {
      pasadas.appendRow(datos[i]);
      hoja1.deleteRow(i + 1);
      return;
    }
  }
}

function actualizarHojaActuales(reservas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName("ACTUALES");
  if (!hoja) return;

  hoja.clearContents();
  hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).clearContent();

  const DIAS = ["DOMINGO","LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO"];

  const ordenadas = [...reservas].sort((a, b) => {
    const fa = (a.fecha || "") + (a.hora || "");
    const fb = (b.fecha || "") + (b.hora || "");
    if (fa < fb) return -1;
    if (fa > fb) return 1;
    return 0;
  });

  const filas = [["NOMBRE","TELEFONO","FECHA","HORA","PERSONAS","MESAS","ESTADO","NOTAS","EMAIL","TOMADA POR","CUANDO"]];

  ordenadas.forEach(r => {
    const partes = (r.fecha || "").split("-");
    const diaSemana = partes.length === 3
      ? DIAS[new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2])).getDay()]
      : "";
    const fechaCell = diaSemana ? diaSemana + "\n" + r.fecha : r.fecha || "";

    filas.push([
      r.nombre     || "",
      r.telefono   || "",
      fechaCell,
      r.hora       || "",
      r.personas   || "",
      (r.mesas && r.mesas.length > 0 ? r.mesas.join("+") : r.mesa || ""),
      r.estado     || "",
      r.notas      || "",
      r.email      || "",
      r.tomadaPor  || "",
      r.cuando     || ""
    ]);
  });

  hoja.getRange(1, 1, filas.length, 11).setValues(filas);
}

function actualizarHojaViejas(reservas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName("VIEJAS");
  if (!hoja) return;

  const DIAS = ["DOMINGO","LUNES","MARTES","MIÉRCOLES","JUEVES","VIERNES","SÁBADO"];

  if (hoja.getLastRow() === 0) {
    hoja.appendRow(["NOMBRE","TELEFONO","FECHA","HORA","PERSONAS","MESAS","ESTADO","NOTAS","EMAIL","TOMADA POR","CUANDO"]);
  }

  reservas.forEach(r => {
    const partes = (r.fecha || "").split("-");
    const diaSemana = partes.length === 3
      ? DIAS[new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2])).getDay()]
      : "";
    const fechaCell = diaSemana ? diaSemana + "\n" + r.fecha : r.fecha || "";

    hoja.appendRow([
      r.nombre     || "",
      r.telefono   || "",
      fechaCell,
      r.hora       || "",
      r.personas   || "",
      (r.mesas && r.mesas.length > 0 ? r.mesas.join("+") : r.mesa || ""),
      r.estado     || "",
      r.notas      || "",
      r.email      || "",
      r.tomadaPor  || "",
      r.cuando     || ""
    ]);
  });
}

function archivarPasadas() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const hojaOrig  = ss.getSheetByName("Hoja 1");
  const hojaDest  = ss.getSheetByName("Pasadas");

  if (!hojaOrig) { Logger.log('No se encontró la hoja "Hoja 1"');  return; }
  if (!hojaDest) { Logger.log('No se encontró la hoja "Pasadas"'); return; }

  const hoy        = new Date();
  hoy.setHours(0, 0, 0, 0);

  const lastRow    = hojaOrig.getLastRow();
  const lastCol    = hojaOrig.getLastColumn();

  if (lastRow < 2) { Logger.log("No hay filas de datos en Hoja 1"); return; }

  const datos      = hojaOrig.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const filasAMover   = [];
  const filasABorrar  = [];

  datos.forEach((fila, i) => {
    const celdaFecha = fila[2];

    if (!celdaFecha) return;

    const ms = celdaFecha.getTime ? celdaFecha.getTime() : NaN;
    if (isNaN(ms)) return;

    const fecha = new Date(ms);
    fecha.setHours(0, 0, 0, 0);

    Logger.log(`Fila ${i+2} | fecha=${fecha} | hoy=${hoy} | pasada=${fecha < hoy}`);

    if (fecha < hoy) {
      filasAMover.push(fila);
      filasABorrar.push(i + 2);
    }
  });

  if (filasAMover.length === 0) {
    Logger.log("No hay filas pasadas para archivar.");
    return;
  }

  const primeraLibre = hojaDest.getLastRow() + 1;
  hojaDest
    .getRange(primeraLibre, 1, filasAMover.length, lastCol)
    .setValues(filasAMover);

  for (let i = filasABorrar.length - 1; i >= 0; i--) {
    hojaOrig.deleteRow(filasABorrar[i]);
  }

  Logger.log(`Archivadas ${filasAMover.length} fila(s) en "Pasadas".`);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `${filasAMover.length} reserva(s) archivada(s) en "Pasadas"`,
    "Archivo automático ✓",
    4
  );
}
