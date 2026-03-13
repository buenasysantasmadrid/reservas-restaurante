import { useState, useEffect } from "react";

const MESAS = [1, 2, 3, 4, 5, 15, 6, 16, 7, 17, 8, 18, 10, 11, 12, 13, 40, 41, 30, 31];
const MESA_NOMBRE = { 30: "Barra 1", 31: "Barra 2" };
const getMesaNombre = (m) => MESA_NOMBRE[m] || `${m}`;
// Horarios: 13:30-16:00 cada 15 min, 20:30-23:30 cada 15 min
const HORARIOS = (() => {
  const slots = [];
  for (let h = 13, m = 30; h < 16 || (h === 16 && m === 0); m += 15) {
    slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    if (m === 45) { h++; m = -15; }
  }
  for (let h = 20, m = 30; h < 23 || (h === 23 && m <= 30); m += 15) {
    slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    if (m === 45) { h++; m = -15; }
  }
  return slots;
})();

const initialReservas = [
  { id: 1, nombre: "María García",   telefono: "611 234 567", email: "maria@email.com",   fecha: "2026-03-22", hora: "13:30", personas: 4,  mesas: [3],    notas: "Cumpleaños",        estado: "confirmada", tomadaPor: "RAMIRO",  cuando: "20/03/2026 10:15" },
  { id: 2, nombre: "Carlos López",   telefono: "622 345 678", email: "carlos@email.com",  fecha: "2026-03-22", hora: "14:00", personas: 2,  mesas: [1],    notas: "",                  estado: "confirmada", tomadaPor: "YAMILA",  cuando: "20/03/2026 11:30" },
  { id: 3, nombre: "Ana Martínez",   telefono: "633 456 789", email: "ana@email.com",     fecha: "2026-03-22", hora: "15:00", personas: 6,  mesas: [5],    notas: "Alergia al gluten", estado: "tomada",     tomadaPor: "LUCIANA", cuando: "21/03/2026 09:00" },
  { id: 4, nombre: "Pedro Sánchez",  telefono: "644 567 890", email: "pedro@email.com",   fecha: "2026-03-22", hora: "21:00", personas: 3,  mesas: [2],    notas: "",                  estado: "cancelada",  tomadaPor: "JESSICA", cuando: "21/03/2026 12:00" },
  { id: 5, nombre: "Laura Fernández",telefono: "655 111 222", email: "laura@email.com",   fecha: "2026-03-22", hora: "13:45", personas: 2,  mesas: [4],    notas: "",                  estado: "confirmada", tomadaPor: "RAMIRO",  cuando: "19/03/2026 18:00" },
  { id: 6, nombre: "Jorge Ruiz",     telefono: "666 333 444", email: "jorge@email.com",   fecha: "2026-03-22", hora: "14:45", personas: 5,  mesas: [6],    notas: "Mesa junto ventana",estado: "tomada",     tomadaPor: "JULIO",   cuando: "21/03/2026 16:45" },
  { id: 7, nombre: "Sofía Blanco",   telefono: "677 555 666", email: "sofia@email.com",   fecha: "2026-03-22", hora: "21:30", personas: 4,  mesas: [7,17], notas: "",                  estado: "confirmada", tomadaPor: "SHENAY",  cuando: "20/03/2026 14:00" },
  { id: 8, nombre: "Miguel Torres",  telefono: "688 777 888", email: "miguel@email.com",  fecha: "2026-03-22", hora: "22:00", personas: 8,  mesas: [10,11],notas: "Cena de empresa",   estado: "confirmada", tomadaPor: "JENNIFER",cuando: "18/03/2026 10:00" },
];

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function App() {
  const [vista, setVista] = useState("reservas");
  const [reservas, setReservas] = useState(initialReservas);
  const [clientesArchivados, setClientesArchivados] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("2026-03-22");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroTurno, setFiltroTurno] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [reservaEditando, setReservaEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "", fecha: "", hora: "", personas: "", mesas: [], notas: "", estado: "tomada", tomadaPor: "", prefijo: "+34" });
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [toast, setToast] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [planoModal, setPlanoModal] = useState(null); // { reservaId, mesaId, nombre }
  const [confirmarWA, setConfirmarWA] = useState(false);
  const [pendingSheetIdx, setPendingSheetIdx] = useState(null);
  const [textoPegado, setTextoPegado] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [datosInterpretados, setDatosInterpretados] = useState(null);
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1b-RaZ3yQxQov1xgQS8QIBEeHMg4FA0ZIrjH6vWNtdFA/export?format=csv&gid=0");
  const [sheetCargando, setSheetCargando] = useState(false);
  const [sheetFilas, setSheetFilas] = useState([]);
  const [sheetError, setSheetError] = useState("");

  const showToast = (msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 2800);
  };

  const getTurno = (hora) => {
    if (!hora) return "noche";
    const [h, m] = hora.split(":").map(Number);
    const mins = h * 60 + m;
    if (mins >= 13*60+30 && mins <= 14*60+30) return "t1";
    if (mins > 14*60+30 && mins < 20*60) return "t2";
    return "noche";
  };

  const TURNO_COLORES = {
    t1:    { bg: "#f4faf4", label: "1º Turno Mediodía" },
    t2:    { bg: "#e8f5e8", label: "2º Turno Mediodía" },
    noche: { bg: "#d0e8d0", label: "Noche" },
  };

  const reservasFiltradas = reservas.filter(r => {
    const matchFecha = filtroFecha ? r.fecha === filtroFecha : true;
    const matchEstado = filtroEstado === "todas" ? true : r.estado === filtroEstado;
    const matchBusqueda = r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || r.telefono.includes(busqueda);
    const turno = getTurno(r.hora);
    const matchTurno = filtroTurno === "todos" ? true
      : filtroTurno === "mediodia" ? (turno === "t1" || turno === "t2")
      : filtroTurno === turno;
    const hideCancelada = filtroTurno !== "todos" && r.estado === "cancelada";
    return matchFecha && matchEstado && matchBusqueda && matchTurno && !hideCancelada;
  });

  // Lista de nombres únicos para el desplegable de clientes
  const nombresClientes = [...new Set([
    ...reservas.map(r => r.nombre),
    ...clientesArchivados.map(c => c.nombre)
  ])].sort();

  const clientes = Object.values(
    reservas.reduce((acc, r) => {
      if (!acc[r.email]) acc[r.email] = { nombre: r.nombre, email: r.email, telefono: r.telefono, visitas: 0, reservas: [] };
      acc[r.email].visitas++;
      acc[r.email].reservas.push(r);
      return acc;
    }, {})
  );

  const abrirNueva = () => {
    setReservaEditando(null);
    setForm({ nombre: "", telefono: "", email: "", fecha: "", hora: "", personas: "", mesas: [], notas: "", estado: "tomada", tomadaPor: "", prefijo: "+34" });
    setModalAbierto(true);
  };

  const abrirEditar = (r) => {
    setReservaEditando(r.id);
    setForm({ ...r, mesas: r.mesas || (r.mesa ? [r.mesa] : []) });
    setModalAbierto(true);
  };

  const guardarReserva = () => {
    if (!form.tomadaPor) return showToast("Indica quién toma la reserva", "error");
    if (!form.nombre || !form.fecha || !form.hora) return showToast("Selecciona nombre, fecha y hora", "error");
    if (!form.personas || form.personas < 1) return showToast("Indica el número de personas", "error");
    if (!reservaEditando) {
      // Nueva reserva: pedir confirmación de WhatsApp primero
      setConfirmarWA(true);
      return;
    }
    setReservas(rs => rs.map(r => r.id === reservaEditando ? { ...form, id: r.id } : r));
    showToast("Reserva actualizada ✓");
    setModalAbierto(false);
  };

  const confirmarYGuardar = () => {
    const ahora = new Date();
    const cuando = `${String(ahora.getDate()).padStart(2,"0")}/${String(ahora.getMonth()+1).padStart(2,"0")}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2,"0")}:${String(ahora.getMinutes()).padStart(2,"0")}`;
    setReservas(rs => [...rs, { ...form, mesa: form.mesas.join("+"), id: Date.now(), cuando }]);
    if (pendingSheetIdx !== null) {
      setSheetFilas(fs => [fs[0], ...fs.slice(1).filter((_, idx) => idx + 1 !== pendingSheetIdx)]);
      setPendingSheetIdx(null);
    }
    showToast("Reserva creada ✓");
    setConfirmarWA(false);
    setModalAbierto(false);
    if (vista === "sheet") setVista("sheet");
  };

  const archivarReservasPasadas = async () => {
    const hoy = getTodayStr();
    const pasadas = reservas.filter(r => r.fecha < hoy);
    if (pasadas.length === 0) return showToast("No hay reservas pasadas para archivar", "error");

    const filas = pasadas.map(r => ({
      nombre: r.nombre,
      telefono: r.telefono || "",
      fecha: r.fecha,
      hora: r.hora || "",
      personas: r.personas || "",
      mesas: r.mesas || [],
      mesa: r.mesa || "",
      estado: r.estado || "",
      notas: r.notas || "",
      email: r.email || "",
      tomadaPor: r.tomadaPor || "",
      cuando: r.cuando || ""
    }));

    try {
      const url = "https://script.google.com/macros/s/AKfycbxr4Yb8O1Db5W0sEh9eywRa-4rUgjd72TMZC_WJjvyTiDBljmtzj3tu5JhqHqqV0-y0HA/exec";
      const res = await fetch(url, { method: "POST", body: JSON.stringify(filas) });
      if (!res.ok) throw new Error("Error al conectar con Google Sheets");
      // Guardar clientes en memoria antes de borrar las reservas
      setClientesArchivados(prev => {
        const todos = [...prev];
        pasadas.forEach(r => {
          if (!todos.find(c => c.nombre === r.nombre)) {
            todos.push({ nombre: r.nombre, telefono: r.telefono || "", email: r.email || "" });
          }
        });
        return todos;
      });
      setReservas(rs => rs.filter(r => r.fecha >= hoy));
      showToast(`${pasadas.length} reserva${pasadas.length > 1 ? "s" : ""} archivada${pasadas.length > 1 ? "s" : ""} ✓`);
    } catch (e) {
      showToast("Error al archivar en Google Sheets", "error");
    }
  };



  const MESA_CONFIG = {
    8: [{internas:[5,15,6,16]}, {internas:[3,4,7,17]}, {internas:[1,2,8,18]}, {internas:[10,11,12,13]}],
    7: [{internas:[7,17,4]}, {internas:[6,16,15]}, {internas:[8,18,2]}, {internas:[11,12,13]}],
    6: [{internas:[6,16,15]}, {internas:[7,17,4]}, {internas:[8,18,2]}, {internas:[11,12,13]}],
    5: [{internas:[1,2]}, {internas:[7,17]}, {internas:[12,13]}, {internas:[8,18]}, {internas:[3,4]}],
    4: [{internas:[12,13]}, {internas:[5,15]}, {internas:[6,16]}, {internas:[7,17]}, {internas:[1,2]}, {internas:[8,18]}, {internas:[3,4]}, {internas:[10,11]}],
    3: [{internas:[12,13]}, {internas:[5,15]}, {internas:[6,16]}, {internas:[7,17]}, {internas:[1,2]}, {internas:[8,18]}, {internas:[3,4]}, {internas:[10,11]}],
    2: [{internas:[3]}, {internas:[10]}, {internas:[11]}, {internas:[4]}, {internas:[5]}, {internas:[15]}, {internas:[7]}, {internas:[17]}, {internas:[8]}, {internas:[18]}, {internas:[1]}, {internas:[2]}, {internas:[6]}, {internas:[16]}],
    1: [{internas:[3]}, {internas:[10]}, {internas:[11]}, {internas:[4]}, {internas:[5]}, {internas:[15]}, {internas:[7]}, {internas:[17]}, {internas:[8]}, {internas:[18]}, {internas:[1]}, {internas:[2]}, {internas:[6]}, {internas:[16]}],
  };

  const asignarMesasTurno = (fecha, turno) => {
    // Get all reservas for this fecha+turno, excluding canceladas
    const reservasTurno = reservas.filter(r => r.fecha === fecha && getTurno(r.hora) === turno && r.estado !== "cancelada");
    if (reservasTurno.length === 0) return;

    // Sort by personas desc, then hora asc
    const porAsignar = [...reservasTurno].sort((a, b) => { const pd = (b.personas || 0) - (a.personas || 0); return pd !== 0 ? pd : (a.hora || "").localeCompare(b.hora || ""); });
    const asignaciones = {}; // id -> mesas[]
    const mesasUsadas = new Set();
    const sinMesa = [];

    // First pass: lock in already-assigned mesas
    for (const r of porAsignar) {
      const curr = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
      if (curr.length > 0) {
        asignaciones[r.id] = curr;
        curr.forEach(m => mesasUsadas.add(m));
      }
    }

    // Second pass: assign unassigned reservas
    for (const r of porAsignar) {
      if (asignaciones[r.id]) continue; // already assigned
      const pax = Math.min(r.personas || 1, 8);
      const opciones = MESA_CONFIG[pax] || MESA_CONFIG[1];
      let asignada = null;
      for (const op of opciones) {
        if (op.internas.every(m => !mesasUsadas.has(m))) {
          asignada = op.internas;
          break;
        }
      }
      if (asignada) {
        asignaciones[r.id] = asignada;
        asignada.forEach(m => mesasUsadas.add(m));
      } else {
        sinMesa.push(r.nombre);
      }
    }

    setReservas(rs => rs.map(r => {
      if (asignaciones[r.id]) return { ...r, mesas: asignaciones[r.id] };
      return r;
    }));

    if (sinMesa.length > 0) {
      showToast(`Sin mesa disponible: ${sinMesa.join(", ")}`, "error");
    } else {
      showToast("Mesas asignadas ✓");
    }
  };

  const borrarMesasTurno = (fecha, turno) => {
    const ids = reservas.filter(r => r.fecha === fecha && getTurno(r.hora) === turno && r.estado !== "cancelada").map(r => r.id);
    setReservas(rs => rs.map(r => ids.includes(r.id) ? { ...r, mesas: [], mesa: "" } : r));
    showToast("Mesas borradas", "error");
  };

  const eliminarReserva = (id) => {
    setReservas(rs => rs.filter(r => r.id !== id));
    showToast("Reserva eliminada", "error");
  };

  const cambiarEstado = (id, estado) => {
    setReservas(rs => rs.map(r => r.id === id ? { ...r, estado } : r));
  };

  // Al elegir un cliente existente, autocompleta sus datos
  const seleccionarNombre = (nombre) => {
    if (!nombre) { setForm(f => ({ ...f, nombre: "" })); return; }
    const existente = reservas.find(r => r.nombre === nombre) || clientesArchivados.find(c => c.nombre === nombre);
    if (existente) {
      setForm(f => ({ ...f, nombre: existente.nombre, telefono: existente.telefono || "", email: existente.email || "", prefijo: existente.prefijo || "+34" }));
    } else {
      setForm(f => ({ ...f, nombre }));
    }
  };

  const parseCSV = (texto) => {
    const lineas = texto.trim().split("\n");
    return lineas.map(l => {
      const cols = []; let cur = ""; let dentro = false;
      for (let i = 0; i < l.length; i++) {
        if (l[i] === '"') { dentro = !dentro; }
        else if (l[i] === ',' && !dentro) { cols.push(cur.trim()); cur = ""; }
        else { cur += l[i]; }
      }
      cols.push(cur.trim());
      return cols;
    });
  };

  const cargarDesdeSheet = async () => {
    setSheetCargando(true);
    setSheetError("");
    setSheetFilas([]);
    try {
      const url = "https://script.google.com/macros/s/AKfycbxr4Yb8O1Db5W0sEh9eywRa-4rUgjd72TMZC_WJjvyTiDBljmtzj3tu5JhqHqqV0-y0HA/exec";
      const res = await fetch(url);
      if (!res.ok) throw new Error("No se pudo conectar con Google Sheets");
      const json = await res.json();
      if (!Array.isArray(json) || json.length < 2) throw new Error("No hay datos en la hoja");

      // Filtrar filas que ya existen en reservas (por nombre + fecha)
      const headers = json[0];
      const filasFiltradas = json.slice(1).filter(fila => {
        const nombreFila = String(fila[0] || "").toLowerCase().trim();
        const raw = String(fila[2] || "").trim();
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const fechaFila = m ? `${m[1]}-${m[2]}-${m[3]}` : "";
        return !reservas.some(r =>
          r.nombre.toLowerCase().trim() === nombreFila && r.fecha === fechaFila
        );
      });

      if (filasFiltradas.length === 0) throw new Error("No hay reservas nuevas pendientes de importar");
      setSheetFilas([json[0], ...filasFiltradas]);
    } catch (e) {
      setSheetError(e.message || "Error al conectar con Google Sheets");
    } finally {
      setSheetCargando(false);
    }
  };

  const importarFilaSheet = (headers, fila) => {
    // A=Nombre, B=Telefono, C="2026-03-11T14:30:00.000Z", D=Pax, E=Comentarios, F=Mail
    const nombre   = String(fila[0] || "");
    const telefono = String(fila[1] || "");
    const raw      = String(fila[2] || "").trim();
    const pax      = fila[3];
    const notas    = String(fila[4] || "");
    const email    = String(fila[5] || "");

    // Parsear "2026-03-11T14:30:00.000Z" directamente sin Date para evitar problemas de zona horaria
    let fechaFmt = "";
    let horaFmt = "";
    if (raw) {
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (m) {
        fechaFmt = `${m[1]}-${m[2]}-${m[3]}`;
        horaFmt  = `${m[4]}:${m[5]}`;
      }
    }

    // Detect prefix and strip it from the number
    let prefijo = "+34";
    let telefonoLimpio = telefono.trim();
    const telDigits = telefono.replace(/\D/g, "");
    if (telefonoLimpio.startsWith("+")) {
      const mp = telefonoLimpio.match(/^(\+\d{1,3})\s*(.*)/);
      if (mp) { prefijo = mp[1]; telefonoLimpio = mp[2].trim(); }
    } else if (telDigits.length > 9) {
      const known = [["54",2],["55",2],["44",2],["33",2],["49",2],["39",2],["34",2],["1",1]];
      const found = known.find(([p]) => telDigits.startsWith(p));
      if (found) { prefijo = "+" + found[0]; telefonoLimpio = telDigits.slice(found[0].length); }
    }

    return {
      nombre,
      telefono: telefonoLimpio,
      prefijo,
      email,
      fecha: fechaFmt,
      hora: horaFmt,
      personas: parseInt(pax) || "",
      notas,
      mesas: [],
      estado: "tomada",
      tomadaPor: ""
    };
  };

  const interpretarTexto = async () => {
    if (!textoPegado.trim()) return;
    setInterpretando(true);
    setDatosInterpretados(null);
    try {
      const hoy = getTodayStr();
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Extrae los datos de reserva de restaurante del siguiente mensaje. Hoy es ${hoy}. 
Devuelve SOLO un JSON con estos campos (sin texto extra, sin markdown):
{
  "nombre": "",
  "telefono": "",
  "email": "",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "personas": 2,
  "notas": ""
}
Si no encuentras algún dato, déjalo vacío o usa el valor por defecto. Para la hora usa formato 24h. Para personas usa número entero.

Mensaje:
${textoPegado}`
          }]
        })
      });
      const data = await response.json();
      const texto = data.content.map(i => i.text || "").join("");
      const clean = texto.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setDatosInterpretados(parsed);
      setForm(f => ({ ...f, ...parsed, mesa: f.mesa, estado: "tomada", personas: parsed.personas || 2 }));
      setModalAbierto(true);
    } catch (e) {
      showToast("No se pudo interpretar el mensaje", "error");
    }
    setInterpretando(false);
  };

  const enviarWhatsApp = (r) => {
    const raw = String(r.telefono || "").trim();
    const prefijo = String(r.prefijo || "").trim();
    let tel;
    if (prefijo) {
      const preDigits = prefijo.replace(/\D/g, "");
      const numDigits = raw.replace(/\D/g, "");
      tel = preDigits + numDigits;
    } else {
      const digits = raw.replace(/\D/g, "");
      if (raw.startsWith("+")) tel = digits;
      else if (digits.length > 9) tel = digits;
      else tel = "34" + digits;
    }
    const fecha = new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const msg = `Hola ${r.nombre} 👋, le confirmamos su reserva para *${r.personas} personas* el *${fecha}* a las *${r.hora}* (${r.mesas && r.mesas.length > 0 ? r.mesas.map(getMesaNombre).join("+") : getMesaNombre(r.mesa)}). ¡Le esperamos! 🍽️`;
    window.open(`https://wa.me/+${tel}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ── Botón WhatsApp reutilizable ──────────────────────────────────────────────
  const BtnWhatsApp = ({ reserva, style = {} }) => (
    reserva.telefono ? (
      <button
        onClick={() => enviarWhatsApp(reserva)}
        title="Enviar confirmación por WhatsApp"
        style={{
          padding: "6px 14px", fontSize: 11, background: "#25D366", border: "none",
          color: "#fff", cursor: "pointer", fontFamily: "'Jost', sans-serif",
          letterSpacing: 1, textTransform: "uppercase", transition: "background 0.2s",
          display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, ...style
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#1ebe5a"}
        onMouseLeave={e => e.currentTarget.style.background = "#25D366"}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp
      </button>
    ) : null
  );

  const stats = {
    hoy: reservas.filter(r => r.fecha === getTodayStr()).length,
    confirmadas: reservas.filter(r => r.estado === "confirmada").length,
    pendientes: reservas.filter(r => r.estado === "tomada").length,
    personas: reservas.filter(r => r.fecha === getTodayStr() && r.estado === "confirmada").reduce((s, r) => s + r.personas, 0),
  };

  return (
    <div style={{ minHeight: "100vh", background: "#b8ddb8", fontFamily: "'Georgia', serif", color: "#1a2e1a", position: "relative" }}>
      {/* Hojas marca de agua */}
      <svg style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 0 }} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.13" fill="#1b5e20">
          {/* Rama grande esquina inferior derecha */}
          <path d="M1200 800 Q1050 600 1100 400 Q1160 580 1200 800Z"/>
          <path d="M1150 800 Q1000 580 1060 360 Q1120 560 1150 800Z"/>
          <path d="M1080 800 Q950 600 990 380 Q1060 570 1080 800Z"/>
          <path d="M1000 800 Q890 610 920 420 Q990 590 1000 800Z"/>
          <line x1="1100" y1="400" x2="1200" y2="800" stroke="#1b5e20" strokeWidth="2"/>
          <line x1="1060" y1="360" x2="1150" y2="800" stroke="#2e7d32" strokeWidth="1.5"/>
          <line x1="990" y1="380" x2="1080" y2="800" stroke="#1b5e20" strokeWidth="1.5"/>
          {/* Hojas sueltas esquina inferior derecha */}
          <path d="M920 750 Q970 700 1020 730 Q970 770 920 750Z"/>
          <path d="M860 780 Q910 720 970 760 Q910 790 860 780Z"/>
          {/* Rama izquierda superior */}
          <path d="M0 0 Q60 100 20 220 Q-20 110 0 0Z"/>
          <path d="M40 0 Q110 110 70 240 Q20 120 40 0Z"/>
          <path d="M90 0 Q170 120 130 260 Q70 130 90 0Z"/>
          <path d="M0 50 Q80 80 100 160 Q30 140 0 50Z"/>
          <path d="M0 120 Q90 140 120 230 Q40 210 0 120Z"/>
          <line x1="20" y1="220" x2="0" y2="0" stroke="#2e7d32" strokeWidth="2"/>
          <line x1="70" y1="240" x2="40" y2="0" stroke="#1b5e20" strokeWidth="1.5"/>
          {/* Hojitas sueltas dispersas */}
          <path d="M300 680 Q340 640 390 665 Q350 700 300 680Z"/>
          <path d="M250 720 Q285 675 335 698 Q295 735 250 720Z"/>
          <path d="M550 750 Q590 710 635 732 Q595 765 550 750Z"/>
          <path d="M180 500 Q215 460 260 482 Q222 515 180 500Z"/>
          <path d="M700 620 Q735 578 782 600 Q742 635 700 620Z"/>
          <path d="M420 400 Q450 360 495 380 Q460 415 420 400Z"/>
          <path d="M820 350 Q848 308 893 330 Q860 368 820 350Z"/>
          <path d="M600 180 Q628 138 673 160 Q640 198 600 180Z"/>
          <path d="M150 280 Q178 238 223 260 Q190 298 150 280Z"/>
          <path d="M950 200 Q978 158 1023 180 Q990 218 950 200Z"/>
        </g>
      </svg>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400;1,600&family=Cormorant+Garamond:wght@300;400;600;700&family=Jost:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --gold: #2e7d32; --gold-light: #43a047; --cream: #1a2e1a; }
        body { background: #b8ddb8; }
        input, select, textarea { outline: none; }
        input::placeholder, textarea::placeholder { color: #555; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f0f7f0; }
        ::-webkit-scrollbar-thumb { background: #81c784; border-radius: 3px; }
        .nav-btn { background: none; border: none; cursor: pointer; padding: 10px 20px; font-family: 'Jost', sans-serif; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #1a3a1a; transition: color 0.2s; }
        .nav-btn.active { color: #1b5e20; border-bottom: 2px solid #1b5e20; font-weight: 600; }
        .nav-btn:hover { color: #1b5e20; }
        .card { background: #ffffff; border: 1px solid #dcedc8; border-radius: 8px; box-shadow: 0 2px 8px rgba(46,125,50,0.08); }
        .stat-card { background: #ffffff; border: 1px solid #c8e6c9; border-radius: 4px; padding: 24px; transition: border-color 0.2s; }
        .stat-card:hover { border-color: #2e7d32; }
        .btn-gold { background: #2e7d32; color: #ffffff; border: none; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 24px; transition: background 0.2s; font-weight: 500; border-radius: 4px; }
        .btn-gold:hover { background: #1b5e20; }
        .btn-outline { background: none; border: 1px solid #81c784; color: #2e7d32; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; padding: 8px 16px; transition: all 0.2s; border-radius: 4px; }
        .btn-outline:hover { border-color: #1b5e20; color: #1b5e20; }
        .input-field { background: #ffffff; border: 1px solid #a5d6a7; color: #1a2e1a; padding: 10px 14px; font-family: 'Jost', sans-serif; font-size: 14px; width: 100%; transition: border-color 0.2s; border-radius: 4px; }
        .input-field:focus { border-color: #2e7d32; }
        .badge { display: inline-block; padding: 3px 10px; font-family: 'Jost', sans-serif; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; border-radius: 2px; }
        .badge-confirmada { background: #e8f5e9; color: #1b5e20; border: 1px solid #81c784; }
        .badge-tomada { background: #fff8e1; color: #f57f17; border: 1px solid #ffcc02; }
        .badge-cancelada { background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }
        .badge-llego { background: #f3e5f5; color: #6a1b9a; border: 1px solid #ce93d8; }
        .row-hover { transition: background 0.15s; }
        .row-hover:hover { background: #f1f8f1; }
        .overlay { position: fixed; inset: 0; background: rgba(0,60,0,0.4); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .modal { background: #ffffff; border: 1px solid #c8e6c9; padding: 40px; width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto; border-radius: 8px; }
        .toast { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); padding: 18px 36px; font-family: 'Jost', sans-serif; font-size: 16px; letter-spacing: 1px; z-index: 100; border-radius: 4px; animation: fadeIn 0.3s; text-align: center; white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
        .toast-ok { background: #e8f5e9; border: 1px solid #81c784; color: #1b5e20; }
        .toast-error { background: #ffebee; border: 1px solid #ef9a9a; color: #b71c1c; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        label { display: block; font-family: 'Jost', sans-serif; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #4a7a4a; margin-bottom: 6px; }
        .divider { border: none; border-top: 1px solid #c8e6c9; margin: 24px 0; }
        select option { background: #ffffff; color: #1a2e1a; }

        /* ── MOBILE NAV ── */
        .mobile-nav-drawer { display: none; }
        .hamburger { display: none; }

        /* ── RESERVA CARD (mobile) ── */
        .reserva-card { display: none; }

        @media (max-width: 768px) {
          .hamburger { display: flex; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; padding: 8px; }
          .hamburger span { display: block; width: 22px; height: 2px; background: #1a3a1a; border-radius: 2px; transition: all 0.2s; }
          .desktop-nav { display: none !important; }
          .desktop-subtitle { display: none !important; }
          .mobile-nav-drawer { display: flex; flex-direction: column; position: fixed; top: 64px; left: 0; right: 0; background: #fff; z-index: 9; border-bottom: 1px solid #c8e6c9; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 8px 0; }
          .mobile-nav-drawer .nav-btn { padding: 14px 24px; font-size: 14px; text-align: left; border-bottom: 1px solid #f0f7f0; }
          .mobile-nav-drawer .nav-btn:last-child { border-bottom: none; }
          .desktop-table { display: none !important; }
          .reserva-card { display: block; }
          .main-pad { padding: 16px !important; }
          .filtros-wrap { flex-direction: column !important; }
          .filtros-wrap input, .filtros-wrap select { width: 100% !important; }
          .header-actions { flex-direction: column !important; gap: 8px !important; align-items: flex-start !important; }
          .modal { padding: 24px 20px !important; width: 100% !important; max-width: 100% !important; max-height: 95vh !important; border-radius: 12px 12px 0 0 !important; }
          .modal-grid { grid-template-columns: 1fr !important; }
          .overlay { align-items: flex-end !important; padding: 0 !important; }
          .turnos-wrap { flex-wrap: wrap !important; gap: 6px !important; }
          .page-title { font-size: 32px !important; }
        }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #a5d6a7", background: "#ffffff", padding: "0 24px", position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, boxShadow: "0 2px 8px rgba(46,125,50,0.10)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontStyle: "italic" }}>
              Buenas <span style={{ color: "#2e7d32" }}>y</span> Santas
            </div>
            <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, letterSpacing: 3, color: "#5a8a5a", textTransform: "uppercase", marginTop: 3 }}>nueva cocina casera</div>
          </div>
          <span className="desktop-subtitle" style={{ color: "#c8e6c9", fontSize: 22 }}>|</span>
          <span className="desktop-subtitle" style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 3, color: "#6a9a6a", textTransform: "uppercase" }}>Gestión de Reservas</span>
        </div>
        {/* Desktop nav */}
        <nav className="desktop-nav" style={{ display: "flex", gap: 4 }}>
          <button className={`nav-btn ${vista === "reservas" ? "active" : ""}`} onClick={() => setVista("reservas")}>Reservas</button>
          <button className="nav-btn" onClick={abrirNueva}>+ Nueva</button>
          <button className={`nav-btn ${vista === "pegar" ? "active" : ""}`} onClick={() => setVista("pegar")}>📋 Pegar WhatsApp</button>
          <button className={`nav-btn ${vista === "sheet" ? "active" : ""}`} onClick={() => setVista("sheet")}>📲 Nueva WhatsApp</button>
          <button className={`nav-btn ${vista === "plano" ? "active" : ""}`} onClick={() => setVista("plano")}>🗺 Plano</button>
        </nav>
        {/* Hamburger */}
        <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menú">
          <span style={{ transform: menuOpen ? "rotate(45deg) translate(5px,5px)" : "none" }}/>
          <span style={{ opacity: menuOpen ? 0 : 1 }}/>
          <span style={{ transform: menuOpen ? "rotate(-45deg) translate(5px,-5px)" : "none" }}/>
        </button>
      </header>
      {/* Mobile drawer */}
      {menuOpen && (
        <nav className="mobile-nav-drawer">
          <button className={`nav-btn ${vista === "reservas" ? "active" : ""}`} onClick={() => { setVista("reservas"); setMenuOpen(false); }}>Reservas</button>
          <button className="nav-btn" onClick={() => { abrirNueva(); setMenuOpen(false); }}>+ Nueva reserva</button>
          <button className={`nav-btn ${vista === "pegar" ? "active" : ""}`} onClick={() => { setVista("pegar"); setMenuOpen(false); }}>📋 Pegar WhatsApp</button>
          <button className={`nav-btn ${vista === "sheet" ? "active" : ""}`} onClick={() => { setVista("sheet"); setMenuOpen(false); }}>📲 Nueva WhatsApp</button>
          <button className={`nav-btn ${vista === "plano" ? "active" : ""}`} onClick={() => { setVista("plano"); setMenuOpen(false); }}>🗺 Plano</button>
        </nav>
      )}

      <main className="main-pad" style={{ padding: "40px", maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* ── PANEL ── */}
        {vista === "panel" && (
          <div>
            <div style={{ marginBottom: 40 }}>
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>
                {new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, letterSpacing: 2 }}>Resumen de hoy</h1>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 48 }}>
              {[
                { label: "Reservas hoy", valor: stats.hoy, sub: "total del día" },
                { label: "Confirmadas", valor: stats.confirmadas, sub: "en total" },
                { label: "Tomadas", valor: stats.pendientes, sub: "por confirmar" },
                { label: "Comensales hoy", valor: stats.personas, sub: "personas esperadas" },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 12 }}>{s.label}</p>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 300, color: "#2e7d32", lineHeight: 1 }}>{s.valor}</p>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#6a9a6a", marginTop: 8 }}>{s.sub}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Reservas de hoy */}
              <div className="card" style={{ padding: 32 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400 }}>Reservas de hoy</h2>
                  <button className="btn-gold" onClick={abrirNueva}>+ Nueva</button>
                </div>
                {reservas.filter(r => r.fecha === getTodayStr()).length === 0
                  ? <p style={{ color: "#4a7a4a", fontFamily: "'Jost', sans-serif", fontSize: 13 }}>No hay reservas para hoy.</p>
                  : reservas.filter(r => r.fecha === getTodayStr()).sort((a, b) => a.hora.localeCompare(b.hora)).map(r => (
                    <div key={r.id} style={{ borderBottom: "1px solid #c8e6c9", padding: "14px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{r.nombre}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", marginTop: 2 }}>{r.hora} · {r.personas} personas · {r.mesas && r.mesas.length > 0 ? r.mesas.map(getMesaNombre).join("+") : r.mesa ? getMesaNombre(r.mesa) : ""}</p>
                        <div style={{ marginTop: 8 }}>
                          <BtnWhatsApp reserva={r} style={{ padding: "4px 10px", fontSize: 10 }} />
                        </div>
                      </div>
                      <span className={`badge badge-${r.estado}`}>{r.estado}</span>
                    </div>
                  ))
                }
              </div>

              {/* Estado de mesas */}
              <div className="card" style={{ padding: 32 }}>
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, marginBottom: 24 }}>Mesas — hoy</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {MESAS.map(m => {
                    const ocupada = reservas.find(r => r.fecha === getTodayStr() && r.mesa === m && r.estado === "confirmada");
                    return (
                      <div key={m} style={{ border: `1px solid ${ocupada ? "#c9a84c" : "#222"}`, padding: "16px 8px", textAlign: "center", background: ocupada ? "#1a140a" : "#0d0d0d", transition: "all 0.2s" }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: ocupada ? "#c9a84c" : "#333" }}>{m}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 1, color: ocupada ? "#8a6a2a" : "#333", textTransform: "uppercase", marginTop: 4 }}>{ocupada ? "ocupada" : "libre"}</p>
                        {ocupada && <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: "#c9a84c55", marginTop: 4 }}>{ocupada.hora}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── RESERVAS ── */}
        {vista === "reservas" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
              <div>
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Gestión</p>
                <h1 className="page-title" style={{ fontFamily: "'Lora', serif", fontSize: 44, fontWeight: 700, color: "#1a1a1a" }}>Reservas</h1>
              </div>
              <div className="header-actions" style={{ display: "flex", gap: 12 }}>
                <button className="btn-outline" style={{ borderColor: "#81c784", color: "#2e7d32", fontSize: 11 }} onClick={archivarReservasPasadas}>📦 Archivar pasadas</button>
                <button className="btn-gold" onClick={abrirNueva}>+ Nueva reserva</button>
              </div>
            </div>

            {/* Filtros */}
            <div className="filtros-wrap" style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" className="input-field" style={{ width: 180 }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
              <input type="text" className="input-field" style={{ width: 220 }} placeholder="Buscar cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <select className="input-field" style={{ width: 160 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="todas">Todos los estados</option>
                <option value="confirmada">Confirmadas</option>
                <option value="tomada">Tomadas</option>
                <option value="cancelada">Canceladas</option>
                <option value="llego">Llegaron</option>
              </select>
              <button className="btn-outline" onClick={() => setFiltroFecha("")}>Ver todas las fechas</button>
              <div className="turnos-wrap" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { key: "todos", label: "Todos los turnos" },
                  { key: "t1",    label: "1º Turno" },
                  { key: "t2",    label: "2º Turno" },
                  { key: "mediodia", label: "Mediodía completo" },
                  { key: "noche", label: "Noche" },
                ].map(t => (
                  <button key={t.key}
                    onClick={() => setFiltroTurno(t.key)}
                    style={{
                      padding: "8px 14px", fontSize: 11, cursor: "pointer",
                      fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase",
                      border: `1px solid ${filtroTurno === t.key ? "#1b5e20" : "#81c784"}`,
                      background: filtroTurno === t.key ? "#1b5e20" : "none",
                      color: filtroTurno === t.key ? "#fff" : "#2e7d32",
                      borderRadius: 4, transition: "all 0.2s"
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabla */}
            <div className="card desktop-table" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #c8e6c9" }}>
                    {["Cliente", "Fecha", "Hora", "Personas", "Mesa", "Estado", "Mail", "Observaciones", "Tomada por", "Cuando", "Acciones"].map(h => (
                      <th key={h} style={{ padding: "14px 20px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reservasFiltradas.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#4a7a4a", fontFamily: "'Jost', sans-serif", fontSize: 14 }}>No hay reservas con estos filtros.</td></tr>
                  ) : (() => {
                    const sorted = [...reservasFiltradas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
                    const rows = [];
                    let lastTurnoKey = null;
                    // Track which turnoKeys we've already rendered, to emit footer after last row of each group
                    // We'll collect groups first
                    const grupos = [];
                    sorted.forEach((r) => {
                      const turno = getTurno(r.hora);
                      const turnoKey = r.fecha + "_" + turno;
                      if (!grupos.length || grupos[grupos.length-1].turnoKey !== turnoKey) {
                        grupos.push({ turnoKey, turno, fecha: r.fecha, reservas: [] });
                      }
                      grupos[grupos.length-1].reservas.push(r);
                    });

                    grupos.forEach((grupo, gi) => {
                      const { turno, fecha, turnoKey } = grupo;
                      const color = TURNO_COLORES[turno];
                      // Separator between groups (not before first)
                      if (gi > 0) {
                        rows.push(<tr key={"sep_"+gi}><td colSpan={10} style={{ padding: 0, height: 28, background: "transparent", border: "none" }} /></tr>);
                      }
                      // Rows for this group
                      grupo.reservas.forEach((r, idx) => {
                      rows.push(
                    <tr key={r.id} className="row-hover" style={{ borderBottom: "1px solid #c8e6c9", background: color.bg, opacity: r.estado === "llego" ? 0.22 : 1 }}>
                      <td style={{ padding: "16px 20px" }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17 }}>{r.nombre}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a", marginTop: 2 }}>{(() => {
                          return String(r.telefono || "").trim();
                        })()}</p>
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#1b5e20" }}>{r.hora}</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{r.personas} pax</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []).map(m => (
                            <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2e7d32", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontFamily: "'Jost', sans-serif", width: "fit-content" }}>
                              {getMesaNombre(m)}
                              <button type="button" onClick={() => setReservas(rs => rs.map(x => x.id === r.id ? { ...x, mesas: (x.mesas||[x.mesa]||[]).filter(v => v !== m) } : x))}
                                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                            </span>
                          ))}
                          <select
                            style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #a5d6a7", borderRadius: 4, background: "#fff", color: "#2e7d32", fontFamily: "'Jost', sans-serif", cursor: "pointer", marginTop: 2 }}
                            value=""
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              if (!val) return;
                              setReservas(rs => rs.map(x => {
                                if (x.id !== r.id) return x;
                                const curr = x.mesas || (x.mesa ? [x.mesa] : []);
                                if (curr.includes(val) || curr.length >= 8) return x;
                                return { ...x, mesas: [...curr, val] };
                              }));
                            }}
                          >
                            <option value="">+ mesa</option>
                            {(() => {
                              const turnoR = getTurno(r.hora);
                              const mesasOcupadasEnTurno = reservas
                                .filter(x => x.id !== r.id && getTurno(x.hora) === turnoR && x.fecha === r.fecha && x.estado !== "cancelada")
                                .flatMap(x => x.mesas || (x.mesa ? [x.mesa] : []));
                              const mesasActuales = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
                              return MESAS
                                .filter(m => !mesasActuales.includes(m) && !mesasOcupadasEnTurno.includes(m))
                                .map(m => <option key={m} value={m}>{getMesaNombre(m)}</option>);
                            })()}
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        <select
                          value={r.estado}
                          onChange={e => cambiarEstado(r.id, e.target.value)}
                          className={`badge badge-${r.estado}`}
                          style={{ cursor: "pointer", border: "none", appearance: "none", paddingRight: 8 }}
                        >
                          <option value="tomada">Tomada</option>
                          <option value="confirmada">Confirmada</option>
                          <option value="cancelada">Cancelada</option>
                          <option value="llego">Llegó</option>
                        </select>
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a" }}>
                        {r.email || "—"}
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", maxWidth: 160 }}>
                        {r.notas || "—"}
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a" }}>
                        {r.tomadaPor || "—"}
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a" }}>
                        {r.cuando || "—"}
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => abrirEditar(r)}>Editar</button>
                          <BtnWhatsApp reserva={r} />
                          <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11, borderColor: "#4a2a2a", color: "#ba5d5d" }} onClick={() => eliminarReserva(r.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                      }); // end grupo.reservas.forEach

                      // Footer row: free mesas for this turno (only when a specific date is selected)
                      if (filtroFecha) {
                        const mesasOcupadas = grupo.reservas
                          .filter(x => x.estado !== "cancelada")
                          .flatMap(x => x.mesas && x.mesas.length > 0 ? x.mesas : x.mesa ? [x.mesa] : []);
                        // Also check other reservas not in filtered list (same fecha+turno)
                        const todasReservasTurno = reservas.filter(x => x.fecha === fecha && getTurno(x.hora) === turno && x.estado !== "cancelada");
                        const todasOcupadas = todasReservasTurno.flatMap(x => x.mesas && x.mesas.length > 0 ? x.mesas : x.mesa ? [x.mesa] : []);
                        const mesasLibres = MESAS.filter(m => !todasOcupadas.includes(m));
                        rows.push(
                          <tr key={"footer_"+turnoKey}>
                            <td colSpan={10} style={{ padding: "8px 20px 12px", background: color.bg, borderBottom: "1px solid #c8e6c9" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 1, color: "#4a7a4a", textTransform: "uppercase" }}>
                                  Mesas libres: {mesasLibres.length === 0 ? <span style={{ color: "#c62828" }}>ninguna</span> : mesasLibres.map(m => (
                                    <span key={m} style={{ display: "inline-block", background: "#fff", border: "1px solid #a5d6a7", borderRadius: 4, padding: "1px 7px", marginRight: 4, fontSize: 11, color: "#2e7d32" }}>{getMesaNombre(m)}</span>
                                  ))}
                                </span>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    onClick={() => asignarMesasTurno(fecha, turno)}
                                    style={{ padding: "4px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                                    onMouseEnter={e => e.currentTarget.style.background="#1b5e20"}
                                    onMouseLeave={e => e.currentTarget.style.background="#2e7d32"}
                                  >
                                    ✦ Asignar mesas
                                  </button>
                                  <button
                                    onClick={() => borrarMesasTurno(fecha, turno)}
                                    style={{ padding: "4px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "none", color: "#b71c1c", border: "1px solid #ef9a9a", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                                    onMouseEnter={e => { e.currentTarget.style.background="#ffebee"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background="none"; }}
                                  >
                                    ✕ Borrar mesas
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    }); // end grupos.forEach
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>

            {/* ── MOBILE CARDS ── */}
            <div className="reserva-card">
              {(() => {
                const sorted = [...reservasFiltradas].sort((a,b) => (a.fecha+a.hora).localeCompare(b.fecha+b.hora));
                const grupos = [];
                sorted.forEach(r => {
                  const turno = getTurno(r.hora);
                  const turnoKey = r.fecha + "_" + turno;
                  if (!grupos.length || grupos[grupos.length-1].turnoKey !== turnoKey) {
                    grupos.push({ turnoKey, turno, fecha: r.fecha, reservas: [] });
                  }
                  grupos[grupos.length-1].reservas.push(r);
                });
                return grupos.map((grupo, gi) => {
                  const color = TURNO_COLORES[grupo.turno];
                  return (
                    <div key={grupo.turnoKey} style={{ marginBottom: 20 }}>
                      <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#4a7a4a", padding: "10px 4px 6px", fontWeight: 600 }}>
                        {color.label}
                      </div>
                      {grupo.reservas.map(r => (
                        <div key={r.id} style={{ background: color.bg, border: "1px solid #c8e6c9", borderRadius: 8, padding: 16, marginBottom: 10, opacity: r.estado === "llego" ? 0.22 : 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div>
                              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#1a2e1a" }}>{r.nombre}</p>
                              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a" }}>{r.telefono}</p>
                            </div>
                            <select value={r.estado} onChange={e => cambiarEstado(r.id, e.target.value)}
                              className={`badge badge-${r.estado}`}
                              style={{ cursor: "pointer", border: "none", appearance: "none" }}>
                              <option value="tomada">Tomada</option>
                              <option value="confirmada">Confirmada</option>
                              <option value="cancelada">Cancelada</option>
                              <option value="llego">Llegó</option>
                            </select>
                          </div>
                          <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#1b5e20", fontWeight: 600 }}>{r.hora}</span>
                            <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{r.personas} pax</span>
                            <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a" }}>
                              {new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                          {/* Mesa selector mobile */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
                            {(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []).map(m => (
                              <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2e7d32", color: "#fff", borderRadius: 4, padding: "3px 10px", fontSize: 13, fontFamily: "'Jost', sans-serif" }}>
                                {getMesaNombre(m)}
                                <button type="button" onClick={() => setReservas(rs => rs.map(x => x.id === r.id ? { ...x, mesas: (x.mesas || (x.mesa ? [x.mesa] : [])).filter(v => v !== m) } : x))}
                                  style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
                              </span>
                            ))}
                            <select
                              style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #a5d6a7", borderRadius: 4, background: "#fff", color: "#2e7d32", fontFamily: "'Jost', sans-serif", cursor: "pointer" }}
                              value=""
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                if (!val) return;
                                setReservas(rs => rs.map(x => {
                                  if (x.id !== r.id) return x;
                                  const curr = x.mesas || (x.mesa ? [x.mesa] : []);
                                  if (curr.includes(val) || curr.length >= 8) return x;
                                  return { ...x, mesas: [...curr, val] };
                                }));
                              }}
                            >
                              <option value="">+ mesa</option>
                              {(() => {
                                const turnoR = getTurno(r.hora);
                                const ocupadas = reservas.filter(x => x.id !== r.id && getTurno(x.hora) === turnoR && x.fecha === r.fecha && x.estado !== "cancelada").flatMap(x => x.mesas || (x.mesa ? [x.mesa] : []));
                                const actuales = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
                                return MESAS.filter(m => !actuales.includes(m) && !ocupadas.includes(m)).map(m => (
                                  <option key={m} value={m}>{getMesaNombre(m)}</option>
                                ));
                              })()}
                            </select>
                          </div>
                          {r.notas ? <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#6a9a6a", marginBottom: 10, fontStyle: "italic" }}>{r.notas}</p> : null}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => abrirEditar(r)}>Editar</button>
                            <BtnWhatsApp reserva={r} />
                            <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11, borderColor: "#ef9a9a", color: "#ba5d5d" }} onClick={() => eliminarReserva(r.id)}>✕</button>
                          </div>
                        </div>
                      ))}
                      {filtroFecha && (() => {
                        const todasOcupadas = reservas.filter(x => x.fecha === grupo.fecha && getTurno(x.hora) === grupo.turno && x.estado !== "cancelada").flatMap(x => x.mesas && x.mesas.length > 0 ? x.mesas : x.mesa ? [x.mesa] : []);
                        const libres = MESAS.filter(m => !todasOcupadas.includes(m));
                        return (
                          <div style={{ background: color.bg, border: "1px solid #c8e6c9", borderRadius: 8, padding: "10px 14px", marginBottom: 4 }}>
                            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                              Mesas libres: {libres.length === 0 ? <span style={{ color: "#c62828" }}>ninguna</span> : libres.map(m => (
                                <span key={m} style={{ display: "inline-block", background: "#fff", border: "1px solid #a5d6a7", borderRadius: 4, padding: "1px 7px", marginRight: 4, fontSize: 11, color: "#2e7d32" }}>{getMesaNombre(m)}</span>
                              ))}
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => asignarMesasTurno(grupo.fecha, grupo.turno)}
                                style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                                ✦ Asignar mesas
                              </button>
                              <button onClick={() => borrarMesasTurno(grupo.fecha, grupo.turno)}
                                style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "none", color: "#b71c1c", border: "1px solid #ef9a9a", borderRadius: 4, cursor: "pointer" }}>
                                ✕ Borrar mesas
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── CLIENTES ── */}
        {vista === "clientes" && !clienteSeleccionado && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Base de datos</p>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, letterSpacing: 2 }}>Clientes</h1>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {clientes.map((c, i) => (
                <div key={i} className="card" style={{ padding: 28, cursor: "pointer", transition: "border-color 0.2s" }}
                  onClick={() => setClienteSeleccionado(c)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#c9a84c"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#222"}
                >
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f1f8f1", border: "1px solid #c8e6c9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#c9a84c" }}>{c.nombre[0]}</span>
                  </div>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 6 }}>{c.nombre}</p>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", marginBottom: 4 }}>{c.email}</p>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", marginBottom: 16 }}>{c.telefono}</p>
                  <div style={{ display: "flex", gap: 16, borderTop: "1px solid #c8e6c9", paddingTop: 16 }}>
                    <div>
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#2e7d32" }}>{c.visitas}</p>
                      <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 1, color: "#4a7a4a", textTransform: "uppercase" }}>visitas</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#2e7d32" }}>{c.reservas.reduce((s, r) => s + r.personas, 0)}</p>
                      <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 1, color: "#4a7a4a", textTransform: "uppercase" }}>comensales</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {vista === "clientes" && clienteSeleccionado && (
          <div>
            <button className="btn-outline" style={{ marginBottom: 32 }} onClick={() => setClienteSeleccionado(null)}>← Volver</button>
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 40 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#f1f8f1", border: "1px solid #c9a84c55", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: "#c9a84c" }}>{clienteSeleccionado.nombre[0]}</span>
              </div>
              <div>
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 300 }}>{clienteSeleccionado.nombre}</h1>
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a", marginTop: 4 }}>{clienteSeleccionado.email} · {clienteSeleccionado.telefono}</p>
              </div>
            </div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, marginBottom: 20 }}>Historial de reservas</h2>
            <div className="card">
              {clienteSeleccionado.reservas.map(r => (
                <div key={r.id} style={{ padding: "20px 28px", borderBottom: "1px solid #c8e6c9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                    <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", marginTop: 4 }}>{r.hora} · {r.personas} personas · {r.mesas && r.mesas.length > 0 ? r.mesas.map(getMesaNombre).join("+") : r.mesa ? getMesaNombre(r.mesa) : ""}{r.notas ? ` · ${r.notas}` : ""}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <BtnWhatsApp reserva={r} style={{ padding: "4px 10px", fontSize: 10 }} />
                    <span className={`badge badge-${r.estado}`}>{r.estado}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── PEGAR MENSAJE ── */}
      {vista === "pegar" && (
        <div style={{ padding: "40px", maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: "'Lora', serif", fontSize: 44, fontWeight: 700, color: "#1a1a1a" }}>Pegar mensaje</h1>
          </div>

          <div className="card" style={{ padding: 32 }}>
            <textarea
              className="input-field"
              rows={10}
              value={textoPegado}
              onChange={e => setTextoPegado(e.target.value)}
              style={{ resize: "vertical", lineHeight: 1.7, fontSize: 14 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20, alignItems: "center" }}>
              {datosInterpretados && datosInterpretados.telefono && (
                <BtnWhatsApp reserva={{ ...datosInterpretados, mesa: 1 }} style={{ padding: "12px 20px" }} />
              )}
              <button
                className="btn-gold"
                onClick={interpretarTexto}
                disabled={interpretando || !textoPegado.trim()}
                style={{ opacity: interpretando || !textoPegado.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: 10 }}
              >
                {interpretando ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    Interpretando...
                  </>
                ) : "✦ Interpretar y crear reserva"}
              </button>
            </div>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── GOOGLE SHEET ── */}
      {vista === "sheet" && (
        <div style={{ padding: "40px", maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: "'Lora', serif", fontSize: 44, fontWeight: 700, color: "#1a1a1a" }}>Nueva WhatsApp</h1>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 32, alignItems: "center" }}>
            <button className="btn-gold" onClick={cargarDesdeSheet} disabled={sheetCargando}
              style={{ display: "flex", alignItems: "center", gap: 10, opacity: sheetCargando ? 0.6 : 1 }}>
              {sheetCargando
                ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Cargando...</>
                : "Cargar reserva"}
            </button>
          </div>

          {sheetError && (
            <div style={{ background: "#2e1a1a", border: "1px solid #4a2a2a", color: "#ba5d5d", padding: "14px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, marginBottom: 24 }}>
              ⚠ {sheetError}
            </div>
          )}

          {sheetFilas.length > 1 && (() => {
            const headers = sheetFilas[0].map(h => String(h).toLowerCase().trim());
            return (
              <div className="card" style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #c8e6c9" }}>
                      <th style={{ padding: "12px 16px", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 400 }}></th>
                      {sheetFilas[0].map((h, i) => {
                        const hdr = String(h).toLowerCase();
                        if (hdr.includes("import") || hdr.includes("hora") || hdr.includes("time")) return null;
                        return <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetFilas.slice(1).map((fila, i) => (
                      <tr key={i} className="row-hover" style={{ borderBottom: "1px solid #c8e6c9" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <button className="btn-gold" style={{ padding: "8px 16px", fontSize: 11 }}
                            onClick={() => {
                              const d = importarFilaSheet(headers, fila);
                              setReservaEditando(null);
                              setForm(d);
                              setPendingSheetIdx(i + 1); // +1 porque slice(1)
                              setModalAbierto(true);
                            }}>
                            + Importar
                          </button>
                        </td>
                        {fila.map((celda, j) => {
                          const hdr = String(headers[j] || "").toLowerCase();
                          if (hdr.includes("import") || hdr.includes("hora") || hdr.includes("time")) return null;
                          // Columna C (índice 2): separar fecha y hora del string ISO
                          if (j === 2 && celda) {
                            const s = String(celda);
                            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
                            const fechaStr = m ? `${m[3]}/${m[2]}/${m[1]}` : s;
                            const horaStr  = m ? `${m[4]}:${m[5]}` : "";
                            return (
                              <td key={j} style={{ padding: "14px 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: "#1a2e1a" }}>
                                <div>{fechaStr}</div>
                                <div style={{ fontSize: 13, color: "#1b5e20" }}>{horaStr}</div>
                              </td>
                            );
                          }
                          return (
                            <td key={j} style={{ padding: "14px 16px", fontFamily: celda ? "'Cormorant Garamond', serif" : "'Jost', sans-serif", fontSize: celda ? 16 : 13, color: celda ? "#1a2e1a" : "#888" }}>
                              {celda || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── MODAL NUEVA / EDITAR RESERVA ── */}
      {modalAbierto && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setModalAbierto(false)}>
          <div className="modal">
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 32, fontWeight: 700, color: "#1a1a1a", marginBottom: 28 }}>
              {reservaEditando ? "Editar reserva" : "Nueva reserva"}
            </h2>
            <div className="modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Cliente con búsqueda por texto + datalist */}
              <div style={{ gridColumn: "1/-1" }}>
                <label>Cliente *</label>
                <input
                  className="input-field"
                  list="lista-clientes"
                  value={form.nombre}
                  onChange={e => {
                    const val = e.target.value;
                    setForm(f => ({ ...f, nombre: val }));
                    const existente = reservas.find(r => r.nombre === val) || clientesArchivados.find(c => c.nombre === val);
                    if (existente) setForm(f => ({ ...f, nombre: existente.nombre, telefono: existente.telefono || "", email: existente.email || "", prefijo: existente.prefijo || "+34" }));
                  }}
                  placeholder="Escribe o busca un cliente..."
                  autoComplete="off"
                />
                <datalist id="lista-clientes">
                  {nombresClientes.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              <div>
                <label>Teléfono</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="input-field" value={form.prefijo ?? "+34"} onChange={e => setForm(f => ({ ...f, prefijo: e.target.value }))} autoComplete="off" style={{ width: 72 }} placeholder="+34" />
                  <input className="input-field" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} autoComplete="off" />
                </div>
              </div>
              <div>
                <label>Email</label>
                <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="off" />
              </div>
              <div>
                <label>Fecha *</label>
                <input type="date" className="input-field" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} autoComplete="off" />
              </div>
              <div>
                <label>Hora *</label>
                <select className="input-field" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}>
                  <option value="">— Seleccionar hora —</option>
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label>Nº de personas *</label>
                <input
                  type="number"
                  className="input-field"
                  min={1} max={40}
                  value={form.personas}
                  onChange={e => setForm(f => ({ ...f, personas: parseInt(e.target.value) || "" }))}
                />
              </div>

              <div>
                <label>Estado</label>
                <select className="input-field" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  <option value="tomada">Tomada</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="llego">Llegó</option>
                </select>
              </div>
              <div>
                <label>Tomada por *</label>
                <select
                  className="input-field"
                  value={form.tomadaPor || ""}
                  onChange={e => setForm(f => ({ ...f, tomadaPor: e.target.value }))}
                >
                  <option value="">— Seleccionar —</option>
                  {["RAMIRO","YAMILA","LUCIANA","SHENAY","JESSICA","JULIO","JENNIFER","OTRO"].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label>Observaciones</label>
                <textarea className="input-field" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3} style={{ resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24, alignItems: "center" }}>
              <button className="btn-outline" onClick={() => setModalAbierto(false)}>Cancelar</button>
              {form.telefono && (
                <BtnWhatsApp reserva={form} style={{ padding: "12px 20px" }} />
              )}
              <button className="btn-gold" onClick={guardarReserva}>{reservaEditando ? "Guardar cambios" : "Tomar reserva"}</button>
            </div>
          </div>
        </div>
      )}

      {confirmarWA && (
        <div className="overlay" style={{ zIndex: 60 }}>
          <div className="modal" style={{ maxWidth: 420, textAlign: "center", padding: "48px 40px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
              ¿Enviaste el WhatsApp?
            </h2>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: "#4a7a4a", marginBottom: 32, lineHeight: 1.6 }}>
              Confirma que has enviado la confirmación al cliente antes de guardar la reserva.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn-outline" onClick={() => setConfirmarWA(false)}>
                Volver
              </button>
              {form.telefono && (
                <BtnWhatsApp reserva={form} style={{ padding: "12px 20px" }} />
              )}
              <button className="btn-gold" onClick={confirmarYGuardar}>
                Sí, guardar reserva
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── PLANO ── */}
      {vista === "plano" && (() => {
        // Plano fiel al PDF:
        // Fila 1: 40 41 | 12 1 3 5
        // Fila 2:        | 13 2 4 15
        // Fila 3:        |    18 17 16
        // Fila 4:        | 11 10 8 7 6
        // Barra:  Barra1 Barra2

        // U = unidad base px dentro del SVG viewBox
        const U = 60; // cell size
        const PAD = 10;
        const CHAIR = 9;
        const R = 6; // corner radius for table rect

        // Mesa position: { id, col, row, w, h } in grid units
        // Grid origin top-left. w/h in grid units.
        const MESAS_POS = [
          // 40 arriba de la 1, 41 arriba de la 3, separadas por fila en blanco
          { id: 40, cx: 3.2, cy:  0.5, w: 0.8, h: 0.8 },
          { id: 41, cx: 4.5, cy:  0.5, w: 0.8, h: 0.8 },
          // Fila 1 (gap de 1 fila bajo 40/41): 12, 1, 3, 5
          { id: 12, cx: 1,   cy: 1.7, w: 0.8, h: 0.8 },
          { id: 1,  cx: 3.2, cy: 1.7, w: 0.8, h: 0.8 },
          { id: 3,  cx: 4.5, cy: 1.7, w: 0.8, h: 0.8 },
          { id: 5,  cx: 5.8, cy: 1.7, w: 0.8, h: 0.8 },
          // Fila 2: 13, 2, 4, 15
          { id: 13, cx: 1,   cy: 2.6, w: 0.8, h: 0.8 },
          { id: 2,  cx: 3.2, cy: 2.6, w: 0.8, h: 0.8 },
          { id: 4,  cx: 4.5, cy: 2.6, w: 0.8, h: 0.8 },
          { id: 15, cx: 5.8, cy: 2.6, w: 0.8, h: 0.8 },
          // Fila 3: 18, 17, 16
          { id: 18, cx: 3.2, cy: 3.9, w: 0.8, h: 0.8 },
          { id: 17, cx: 4.5, cy: 3.9, w: 0.8, h: 0.8 },
          { id: 16, cx: 5.8, cy: 3.9, w: 0.8, h: 0.8 },
          // Fila 4: 11, 10, 8, 7, 6
          { id: 11, cx: 1,    cy: 3.4, w: 0.8, h: 0.8 },
          { id: 10, cx: 1.6,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 8,  cx: 3.2,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 7,  cx: 4.5,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 6,  cx: 5.8,  cy: 4.8, w: 0.8, h: 0.8 },
          // Barra
          { id: 30, cx: 3.2,  cy: 6.0, w: 0.8, h: 0.8, barra: true },
          { id: 31, cx: 4.5,  cy: 6.0, w: 0.8, h: 0.8, barra: true },
        ];

        const SVG_COLS = 6.1;
        const SVG_ROWS = 7.8;
        const VW = SVG_COLS * U + PAD * 2;
        const VH = SVG_ROWS * U + PAD * 2;

        // Get reservas for selected fecha+turno
        // In plano: if filtroTurno is "todos" or "mediodia", default to t1; else use selected turno
        const planoTurno = (filtroTurno === "todos" || filtroTurno === "mediodia") ? "t1" : filtroTurno;
        const reservasTurno = reservas.filter(r => {
          if (!filtroFecha || r.fecha !== filtroFecha) return false;
          return getTurno(r.hora) === planoTurno && r.estado !== "cancelada";
        });

        // Map mesa -> reserva
        const mesaReserva = {};
        reservasTurno.forEach(r => {
          const ms = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
          ms.forEach(m => { mesaReserva[m] = r; });
        });

        // All valid merge groups ordered by size desc (largest first for matching)
        // primary = first element, rest = secondaries (hidden)
        const MERGE_GROUPS = [
          // 4-mesa groups
          [1, 2, 8, 18],
          [3, 4, 17, 7],
          [5, 15, 16, 6],
          { ids: [12, 13, 11, 10], clampToFirst: true },
          // 3-mesa groups
          [5, 15, 16],
          [6, 16, 15],
          [3, 4, 17],
          [7, 17, 4, 3],
          [1, 2, 18],
          [8, 18, 2],
          { ids: [12, 13, 11], clampToFirst: true },
          // 2-mesa groups
          [1, 2], [3, 4], [5, 15], [12, 13],
          [8, 18], [7, 17], [6, 16],
          [11, 10], // horizontal pair — 11 is primary (leftmost)
          [40, 41], // horizontal pair — 40 is primary
          [30, 31], // barra pair — 30 is primary
        ];

        // For each reserva, find the best (largest) matching group
        const reservaMergeGroup = {};
        reservasTurno.forEach(r => {
          const ms = new Set(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []);
          if (ms.size < 2) return;
          for (const grp of MERGE_GROUPS) {
            const ids = Array.isArray(grp) ? grp : grp.ids;
            const unique = [...new Set(ids)];
            if (unique.every(m => ms.has(m))) {
              reservaMergeGroup[r.id] = Array.isArray(grp) ? unique : { ids: unique, clampToFirst: grp.clampToFirst };
              break;
            }
          }
        });

        const secondaryMesas = new Set();
        Object.values(reservaMergeGroup).forEach(grp => {
          const ids = Array.isArray(grp) ? grp : grp.ids;
          ids.slice(1).forEach(m => secondaryMesas.add(m));
        });

        const MesaSVG = ({ mesa }) => {
          const { id, cx, cy, w, h, barra } = mesa;

          // Skip secondary mesas (they are rendered as part of the primary)
          if (secondaryMesas.has(id)) return null;

          const res = mesaReserva[id];
          const ocupada = !!res;
          const sinConfirmar = res && res.estado === "tomada";
          const llego = res && res.estado === "llego";

          const fill   = llego ? "#f5f5f5" : ocupada ? (sinConfirmar ? "#fff8e1" : "#2e7d32") : "#e8f5e9";
          const stroke = llego ? "#e0e0e0" : ocupada ? (sinConfirmar ? "#f9a825" : "#1b5e20") : "#81c784";
          const textC  = llego ? "#bdbdbd" : ocupada ? (sinConfirmar ? "#e65100" : "#fff") : "#2e7d32";

          const mergeGroup = res ? reservaMergeGroup[res.id] : null;
          const mergeIds = mergeGroup ? (Array.isArray(mergeGroup) ? mergeGroup : mergeGroup.ids) : null;
          const clampToFirst = mergeGroup && !Array.isArray(mergeGroup) && mergeGroup.clampToFirst;
          const isMerged = mergeIds && mergeIds[0] === id;

          let mw = w * U;
          let mh = h * U;
          let mx = PAD + cx * U - (w * U) / 2;
          let my = PAD + cy * U - (h * U) / 2;

          if (isMerged && mergeIds.length > 1) {
            const origMx = mx, origMw = mw, origMy = my, origMh = mh;
            mergeIds.slice(1).forEach(secId => {
              const sec = MESAS_POS.find(p => p.id === secId);
              if (!sec) return;
              const sx = PAD + sec.cx * U - (sec.w * U) / 2;
              const sy = PAD + sec.cy * U - (sec.h * U) / 2;
              const x2 = Math.max(mx + mw, sx + sec.w * U);
              const y2 = Math.max(my + mh, sy + sec.h * U);
              mx = Math.min(mx, sx);
              my = Math.min(my, sy);
              mw = x2 - mx;
              mh = y2 - my;
            });
            if (clampToFirst) {
              // Restore x/width; only extend height for mesas in the same column (cx matches first)
              mx = origMx; mw = origMw;
              mh = origMh;
              mergeIds.slice(1).forEach(secId => {
                const sec = MESAS_POS.find(p => p.id === secId);
                if (!sec) return;
                if (Math.abs(sec.cx - cx) < 0.2) {
                  // same column — extend height
                  const sy = PAD + sec.cy * U - (sec.h * U) / 2;
                  const y2 = Math.max(my + mh, sy + sec.h * U);
                  my = Math.min(my, sy);
                  mh = y2 - my;
                }
              });
            }
          }

          const R = 8;
          const CHAIR = 9;

          const chairs = [];

          // Labels
          const labelMesa = MESA_NOMBRE[id] || String(id);

          const lineH = isMerged ? mh * 0.22 : (res ? mh * 0.28 : mh / 2 + 4);

          return (
            <g key={id} style={{ cursor: res ? "pointer" : "default" }}
              onClick={() => res && setPlanoModal({ reservaId: res.id, nombre: res.nombre, estado: res.estado })}>
              {/* Shadow */}
              <rect x={mx+1} y={my+2} width={mw} height={mh} rx={R+1} fill="rgba(0,0,0,0.06)"/>
              {/* Mesa body */}
              <rect x={mx} y={my} width={mw} height={mh} rx={R} fill={fill} stroke={stroke} strokeWidth={ocupada ? 2 : 1.2}/>
              <text x={mx + mw/2} y={my + lineH} textAnchor="middle"
                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: barra ? 11 : 13, fontWeight: 700, fill: textC, letterSpacing: 0.5 }}>
                {labelMesa}
              </text>
              {res && (
                <text x={mx + mw/2} y={my + mh * (isMerged ? 0.5 : 0.6)} textAnchor="middle"
                  style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 500, fill: textC, letterSpacing: 0.3 }}>
                  {res.nombre.split(" ")[0]}
                </text>
              )}
              {res && (
                <text x={mx + mw/2} y={my + mh * (isMerged ? 0.76 : 0.84)} textAnchor="middle"
                  style={{ fontFamily: "'Jost', sans-serif", fontSize: 7.5, fill: textC, opacity: 0.75, letterSpacing: 0.5 }}>
                  {res.personas}p
                </text>
              )}
            </g>
          );
        };

        return (
          <div style={{ padding: "40px", maxWidth: 1000, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
              <div>
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Vista sala</p>
                <h1 className="page-title" style={{ fontFamily: "'Lora', serif", fontSize: 44, fontWeight: 700, color: "#1a1a1a" }}>Plano</h1>
              </div>
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" className="input-field" style={{ width: 180 }}
                value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { key: "t1",    label: "1º Turno" },
                  { key: "t2",    label: "2º Turno" },
                  { key: "noche", label: "Noche" },
                ].map(t => (
                  <button key={t.key} onClick={() => setFiltroTurno(t.key)}
                    style={{ padding: "8px 14px", fontSize: 11, cursor: "pointer", fontFamily: "'Jost', sans-serif",
                      letterSpacing: 1, textTransform: "uppercase",
                      border: `1px solid ${planoTurno === t.key ? "#1b5e20" : "#81c784"}`,
                      background: planoTurno === t.key ? "#1b5e20" : "none",
                      color: planoTurno === t.key ? "#fff" : "#2e7d32",
                      borderRadius: 4, transition: "all 0.2s" }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 24, overflowX: "auto", background: "linear-gradient(135deg, #ffffff 0%, #f7fbf7 100%)", border: "1px solid #e0f0e0" }}>
              {/* Leyenda */}
              <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { fill: "#e8f5e9", stroke: "#81c784", label: "Libre" },
                  { fill: "#2e7d32", stroke: "#1b5e20", label: "Confirmada" },
                  { fill: "#fff8e1", stroke: "#f9a825", label: "Sin confirmar" },
                  { fill: "#f5f5f5", stroke: "#e0e0e0", label: "Llegó" },
                ].map(l => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 16, height: 16, background: l.fill, border: `2px solid ${l.stroke}`, borderRadius: 3 }}/>
                    <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a", textTransform: "uppercase", letterSpacing: 1 }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", maxWidth: 640, display: "block", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>
                <defs>
                  <filter id="mesaShadow" x="-15%" y="-15%" width="130%" height="130%">
                    <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1b5e20" floodOpacity="0.18"/>
                  </filter>
                  <pattern id="floorGrid" x="0" y="0" width={U*0.5} height={U*0.5} patternUnits="userSpaceOnUse">
                    <path d={`M ${U*0.5} 0 L 0 0 0 ${U*0.5}`} fill="none" stroke="#e8f5e9" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                {/* Floor */}
                <rect x={0} y={0} width={VW} height={VH} fill="#f4faf4" rx={12}/>
                <rect x={0} y={0} width={VW} height={VH} fill="url(#floorGrid)" rx={12}/>
                {/* Separator: horizontal between 40/41 row and main rows */}
                <line x1={PAD + 0.2*U} y1={PAD + 1.15*U} x2={PAD + 6.5*U} y2={PAD + 1.15*U} stroke="#c8e6c9" strokeWidth={0.8} strokeDasharray="5 5" opacity="0.7"/>
                {MESAS_POS.map(m => <MesaSVG key={m.id} mesa={m} />)}
              </svg>
              {!filtroFecha && (
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#9e9e9e", marginTop: 12 }}>
                  Selecciona una fecha para ver la ocupación.
                </p>
              )}
            </div>
          </div>
        );
      })()}


      {/* ── PLANO ESTADO MODAL ── */}
      {planoModal && (
        <div className="overlay" style={{ zIndex: 60 }} onClick={e => e.target === e.currentTarget && setPlanoModal(null)}>
          <div className="modal" style={{ maxWidth: 340, padding: "36px 32px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Cambiar estado</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 24 }}>{planoModal.nombre}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { value: "confirmada", label: "Confirmada", bg: "#e8f5e9", color: "#1b5e20", border: "#81c784" },
                { value: "llego",      label: "Llegó",      bg: "#f3e5f5", color: "#6a1b9a", border: "#ce93d8" },
                { value: "cancelada",  label: "Cancelada",   bg: "#ffebee", color: "#c62828", border: "#ef9a9a" },
              ].map(op => (
                <button key={op.value}
                  onClick={() => {
                    setReservas(rs => rs.map(r => r.id === planoModal.reservaId ? { ...r, estado: op.value } : r));
                    setPlanoModal(null);
                    showToast(`${planoModal.nombre} → ${op.label} ✓`);
                  }}
                  style={{
                    padding: "12px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12,
                    letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
                    background: planoModal.estado === op.value ? op.bg : "#fff",
                    color: op.color, border: `1.5px solid ${op.border}`, borderRadius: 6,
                    fontWeight: planoModal.estado === op.value ? 700 : 400,
                    transition: "all 0.15s"
                  }}>
                  {planoModal.estado === op.value ? "✓ " : ""}{op.label}
                </button>
              ))}
            </div>
            <button className="btn-outline" style={{ marginTop: 20, width: "100%", color: "#888", borderColor: "#ccc", fontSize: 11 }} onClick={() => setPlanoModal(null)}>Salir</button>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.tipo}`}>{toast.msg}</div>}
    </div>
  );
}
