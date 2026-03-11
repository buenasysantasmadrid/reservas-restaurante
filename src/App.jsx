import { useState, useEffect } from "react";

const MESAS = [1, 2, 3, 4, 5, 6, 7, 8];
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
  { id: 1, nombre: "María García", telefono: "611 234 567", email: "maria@email.com", fecha: "2026-03-10", hora: "14:00", personas: 4, mesa: 3, notas: "Cumpleaños", estado: "confirmada" },
  { id: 2, nombre: "Carlos López", telefono: "622 345 678", email: "carlos@email.com", fecha: "2026-03-10", hora: "21:00", personas: 2, mesa: 1, notas: "", estado: "confirmada" },
  { id: 3, nombre: "Ana Martínez", telefono: "633 456 789", email: "ana@email.com", fecha: "2026-03-11", hora: "13:30", personas: 6, mesa: 5, notas: "Alergia al gluten", estado: "tomada" },
  { id: 4, nombre: "Pedro Sánchez", telefono: "644 567 890", email: "pedro@email.com", fecha: "2026-03-09", hora: "20:30", personas: 3, mesa: 2, notas: "", estado: "cancelada" },
];

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function App() {
  const [vista, setVista] = useState("panel");
  const [reservas, setReservas] = useState(initialReservas);
  const [filtroFecha, setFiltroFecha] = useState(getTodayStr());
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [reservaEditando, setReservaEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "", fecha: "", hora: "", personas: "", mesa: 1, notas: "", estado: "tomada", tomadaPor: "" });
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [toast, setToast] = useState(null);
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

  const reservasFiltradas = reservas.filter(r => {
    const matchFecha = filtroFecha ? r.fecha === filtroFecha : true;
    const matchEstado = filtroEstado === "todas" ? true : r.estado === filtroEstado;
    const matchBusqueda = r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || r.telefono.includes(busqueda);
    return matchFecha && matchEstado && matchBusqueda;
  });

  // Lista de nombres únicos para el desplegable de clientes
  const nombresClientes = [...new Set(reservas.map(r => r.nombre))].sort();

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
    setForm({ nombre: "", telefono: "", email: "", fecha: "", hora: "", personas: "", mesa: 1, notas: "", estado: "tomada", tomadaPor: "" });
    setModalAbierto(true);
  };

  const abrirEditar = (r) => {
    setReservaEditando(r.id);
    setForm({ ...r });
    setModalAbierto(true);
  };

  const guardarReserva = () => {
    if (!form.tomadaPor) return showToast("Indica quién toma la reserva", "error");
    if (!form.nombre || !form.fecha || !form.hora) return showToast("Selecciona nombre, fecha y hora", "error");
    if (!form.personas || form.personas < 1) return showToast("Indica el número de personas", "error");
    if (reservaEditando) {
      setReservas(rs => rs.map(r => r.id === reservaEditando ? { ...form, id: r.id } : r));
      showToast("Reserva actualizada ✓");
    } else {
      setReservas(rs => [...rs, { ...form, id: Date.now() }]);
      showToast("Reserva creada ✓");
    }
    setModalAbierto(false);
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
    const existente = reservas.find(r => r.nombre === nombre);
    if (existente) {
      setForm(f => ({ ...f, nombre: existente.nombre, telefono: existente.telefono, email: existente.email }));
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
      const url = "https://script.google.com/macros/s/AKfycbwVUQM8OVLNXTExp0rd6qYkJjukpEb94OB5A-dY9EqIVbPg4JdDrzhftsu9JDXgPG0D7g/exec";
      const res = await fetch(url);
      if (!res.ok) throw new Error("No se pudo conectar con Google Sheets");
      const json = await res.json();
      if (!Array.isArray(json) || json.length < 2) throw new Error("No hay datos en la hoja");
      setSheetFilas(json);
    } catch (e) {
      setSheetError(e.message || "Error al conectar con Google Sheets");
    } finally {
      setSheetCargando(false);
    }
  };

  const importarFilaSheet = (headers, fila) => {
    const get = (...keys) => {
      for (const k of keys) {
        const idx = headers.findIndex(h => h.includes(k));
        if (idx !== -1 && fila[idx]) return fila[idx];
      }
      return "";
    };
    const fechaRaw = get("fecha");
    let fechaFmt = getTodayStr();
    if (fechaRaw) {
      const d = new Date(fechaRaw);
      if (!isNaN(d)) fechaFmt = d.toISOString().split("T")[0];
      else {
        const partes = fechaRaw.split(/[\/\-]/);
        if (partes.length === 3) {
          const [a, b, c] = partes;
          if (a.length === 4) fechaFmt = `${a}-${b.padStart(2,"0")}-${c.padStart(2,"0")}`;
          else fechaFmt = `${c}-${b.padStart(2,"0")}-${a.padStart(2,"0")}`;
        }
      }
    }
    const horaRaw = get("hora", "time");
    let horaFmt = "14:00";
    if (horaRaw) {
      const m = horaRaw.match(/(\d{1,2}):(\d{2})/);
      if (m) horaFmt = `${m[1].padStart(2,"0")}:${m[2]}`;
    }
    const personas = parseInt(get("pax","personas","person","guests")) || 2;
    return {
      nombre: get("nombre","name"),
      telefono: get("telefono","tel","phone","móvil","movil"),
      email: get("mail","email","correo"),
      fecha: fechaFmt,
      hora: horaFmt,
      personas,
      notas: get("comentarios","notas","comment","nota"),
      mesa: 1,
      estado: "tomada"
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
    const tel = r.telefono.replace(/\D/g, "");
    const fecha = new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const msg = `Hola ${r.nombre} 👋, le confirmamos su reserva para *${r.personas} personas* el *${fecha}* a las *${r.hora}* (Mesa ${r.mesa}). ¡Le esperamos! 🍽️`;
    window.open(`https://wa.me/34${tel}?text=${encodeURIComponent(msg)}`, "_blank");
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
    <div style={{ minHeight: "100vh", background: "#0d0d0d", fontFamily: "'Georgia', serif", color: "#f0ebe0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Jost:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --gold: #c9a84c;
          --gold-light: #e8c97a;
          --dark: #0d0d0d;
          --dark2: #161616;
          --dark3: #1e1e1e;
          --cream: #f0ebe0;
          --muted: #888;
        }
        body { background: #0d0d0d; }
        .font-display { font-family: 'Cormorant Garamond', serif; }
        .font-body { font-family: 'Jost', sans-serif; }
        input, select, textarea { outline: none; }
        input::placeholder, textarea::placeholder { color: #555; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #161616; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        .nav-btn { background: none; border: none; cursor: pointer; padding: 10px 20px; font-family: 'Jost', sans-serif; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #666; transition: color 0.2s; }
        .nav-btn.active { color: #c9a84c; border-bottom: 1px solid #c9a84c; }
        .nav-btn:hover { color: #c9a84c; }
        .card { background: #161616; border: 1px solid #222; border-radius: 2px; }
        .stat-card { background: #161616; border: 1px solid #222; border-radius: 2px; padding: 24px; transition: border-color 0.2s; }
        .stat-card:hover { border-color: #c9a84c; }
        .btn-gold { background: #c9a84c; color: #0d0d0d; border: none; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 24px; transition: background 0.2s; font-weight: 500; }
        .btn-gold:hover { background: #e8c97a; }
        .btn-outline { background: none; border: 1px solid #333; color: #aaa; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; padding: 8px 16px; transition: all 0.2s; }
        .btn-outline:hover { border-color: #c9a84c; color: #c9a84c; }
        .input-field { background: #0d0d0d; border: 1px solid #2a2a2a; color: #f0ebe0; padding: 10px 14px; font-family: 'Jost', sans-serif; font-size: 14px; width: 100%; transition: border-color 0.2s; }
        .input-field:focus { border-color: #c9a84c; }
        .badge { display: inline-block; padding: 3px 10px; font-family: 'Jost', sans-serif; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; border-radius: 2px; }
        .badge-confirmada { background: #1a2e1a; color: #5dba5d; border: 1px solid #2a4a2a; }
        .badge-tomada { background: #2e2a1a; color: #c9a84c; border: 1px solid #4a3a1a; }
        .badge-cancelada { background: #2e1a1a; color: #ba5d5d; border: 1px solid #4a2a2a; }
        .row-hover { transition: background 0.15s; }
        .row-hover:hover { background: #1e1e1e; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 50; display: flex; align-items: center; justify-content: center; }
        .modal { background: #161616; border: 1px solid #2a2a2a; padding: 40px; width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
        .toast { position: fixed; bottom: 32px; right: 32px; padding: 14px 24px; font-family: 'Jost', sans-serif; font-size: 13px; letter-spacing: 1px; z-index: 100; border-radius: 2px; animation: fadeIn 0.3s; }
        .toast-ok { background: #1a2e1a; border: 1px solid #2a4a2a; color: #5dba5d; }
        .toast-error { background: #2e1a1a; border: 1px solid #4a2a2a; color: #ba5d5d; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        label { display: block; font-family: 'Jost', sans-serif; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666; margin-bottom: 6px; }
        .divider { border: none; border-top: 1px solid #222; margin: 24px 0; }
        select option { background: #1e1e1e; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #1a1a1a", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: "#c9a84c", letterSpacing: 3 }}>RESERVAS</span>
          <span style={{ color: "#333", fontSize: 18 }}>|</span>
          <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase" }}>Panel de Gestión</span>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          <button className={`nav-btn ${vista === "panel" ? "active" : ""}`} onClick={() => setVista("panel")}>Panel</button>
          <button className={`nav-btn ${vista === "reservas" ? "active" : ""}`} onClick={() => setVista("reservas")}>Reservas</button>
          <button className={`nav-btn ${vista === "clientes" ? "active" : ""}`} onClick={() => setVista("clientes")}>Clientes</button>
          <button className={`nav-btn ${vista === "pegar" ? "active" : ""}`} onClick={() => setVista("pegar")}>✦ Pegar mensaje</button>
          <button className={`nav-btn ${vista === "sheet" ? "active" : ""}`} onClick={() => setVista("sheet")}>⊞ Google Sheet</button>
        </nav>
      </header>

      <main style={{ padding: "40px", maxWidth: 1200, margin: "0 auto" }}>

        {/* ── PANEL ── */}
        {vista === "panel" && (
          <div>
            <div style={{ marginBottom: 40 }}>
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>
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
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 12 }}>{s.label}</p>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 300, color: "#c9a84c", lineHeight: 1 }}>{s.valor}</p>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#444", marginTop: 8 }}>{s.sub}</p>
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
                  ? <p style={{ color: "#444", fontFamily: "'Jost', sans-serif", fontSize: 13 }}>No hay reservas para hoy.</p>
                  : reservas.filter(r => r.fecha === getTodayStr()).sort((a, b) => a.hora.localeCompare(b.hora)).map(r => (
                    <div key={r.id} style={{ borderBottom: "1px solid #1e1e1e", padding: "14px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{r.nombre}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#555", marginTop: 2 }}>{r.hora} · {r.personas} personas · Mesa {r.mesa}</p>
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
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>Gestión</p>
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, letterSpacing: 2 }}>Reservas</h1>
              </div>
              <button className="btn-gold" onClick={abrirNueva}>+ Nueva reserva</button>
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4 }}>
                <select className="input-field" style={{ width: 64 }} value={filtroFecha ? filtroFecha.split("-")[2] : ""}
                  onChange={e => { const p = (filtroFecha||getTodayStr()).split("-"); setFiltroFecha(e.target.value ? `${p[0]}-${p[1]}-${e.target.value}` : ""); }}>
                  <option value="">Día</option>
                  {Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0")).map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                <select className="input-field" style={{ width: 110 }} value={filtroFecha ? filtroFecha.split("-")[1] : ""}
                  onChange={e => { const p = (filtroFecha||getTodayStr()).split("-"); setFiltroFecha(e.target.value ? `${p[0]}-${e.target.value}-${p[2]}` : ""); }}>
                  <option value="">Mes</option>
                  {[["01","Enero"],["02","Febrero"],["03","Marzo"],["04","Abril"],["05","Mayo"],["06","Junio"],["07","Julio"],["08","Agosto"],["09","Septiembre"],["10","Octubre"],["11","Noviembre"],["12","Diciembre"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <select className="input-field" style={{ width: 80 }} value={filtroFecha ? filtroFecha.split("-")[0] : ""}
                  onChange={e => { const p = (filtroFecha||getTodayStr()).split("-"); setFiltroFecha(e.target.value ? `${e.target.value}-${p[1]}-${p[2]}` : ""); }}>
                  <option value="">Año</option>
                  {["2025","2026","2027"].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <input type="text" className="input-field" style={{ width: 220 }} placeholder="Buscar cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <select className="input-field" style={{ width: 160 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="todas">Todos los estados</option>
                <option value="confirmada">Confirmadas</option>
                <option value="tomada">Tomadas</option>
                <option value="cancelada">Canceladas</option>
              </select>
              {filtroFecha && <button className="btn-outline" onClick={() => setFiltroFecha("")}>Ver todas las fechas</button>}
            </div>

            {/* Tabla */}
            <div className="card" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #222" }}>
                    {["Cliente", "Fecha", "Hora", "Personas", "Mesa", "Estado", "Acciones"].map(h => (
                      <th key={h} style={{ padding: "14px 20px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#555", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reservasFiltradas.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#444", fontFamily: "'Jost', sans-serif", fontSize: 14 }}>No hay reservas con estos filtros.</td></tr>
                  ) : reservasFiltradas.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map(r => (
                    <tr key={r.id} className="row-hover" style={{ borderBottom: "1px solid #1a1a1a" }}>
                      <td style={{ padding: "16px 20px" }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17 }}>{r.nombre}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#555", marginTop: 2 }}>{r.telefono}</p>
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#aaa" }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#c9a84c" }}>{r.hora}</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#aaa" }}>{r.personas} pax</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#aaa" }}>Mesa {r.mesa}</td>
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
                        </select>
                      </td>
                      <td style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => abrirEditar(r)}>Editar</button>
                          <BtnWhatsApp reserva={r} />
                          <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11, borderColor: "#4a2a2a", color: "#ba5d5d" }} onClick={() => eliminarReserva(r.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CLIENTES ── */}
        {vista === "clientes" && !clienteSeleccionado && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>Base de datos</p>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, letterSpacing: 2 }}>Clientes</h1>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {clientes.map((c, i) => (
                <div key={i} className="card" style={{ padding: 28, cursor: "pointer", transition: "border-color 0.2s" }}
                  onClick={() => setClienteSeleccionado(c)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#c9a84c"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#222"}
                >
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1e1e1e", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#c9a84c" }}>{c.nombre[0]}</span>
                  </div>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 6 }}>{c.nombre}</p>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#555", marginBottom: 4 }}>{c.email}</p>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#555", marginBottom: 16 }}>{c.telefono}</p>
                  <div style={{ display: "flex", gap: 16, borderTop: "1px solid #1e1e1e", paddingTop: 16 }}>
                    <div>
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#c9a84c" }}>{c.visitas}</p>
                      <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 1, color: "#444", textTransform: "uppercase" }}>visitas</p>
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#c9a84c" }}>{c.reservas.reduce((s, r) => s + r.personas, 0)}</p>
                      <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 1, color: "#444", textTransform: "uppercase" }}>comensales</p>
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
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#1e1e1e", border: "1px solid #c9a84c55", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, color: "#c9a84c" }}>{clienteSeleccionado.nombre[0]}</span>
              </div>
              <div>
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 300 }}>{clienteSeleccionado.nombre}</h1>
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#666", marginTop: 4 }}>{clienteSeleccionado.email} · {clienteSeleccionado.telefono}</p>
              </div>
            </div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, marginBottom: 20 }}>Historial de reservas</h2>
            <div className="card">
              {clienteSeleccionado.reservas.map(r => (
                <div key={r.id} style={{ padding: "20px 28px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                    <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#555", marginTop: 4 }}>{r.hora} · {r.personas} personas · Mesa {r.mesa}{r.notas ? ` · ${r.notas}` : ""}</p>
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
        <div style={{ padding: "40px", maxWidth: 800, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>Inteligencia artificial</p>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, letterSpacing: 2 }}>Pegar mensaje</h1>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: "#555", marginTop: 12, lineHeight: 1.7 }}>
              Pega cualquier mensaje de WhatsApp, email o nota con los datos del cliente y la IA extraerá la reserva automáticamente.
            </p>
          </div>

          <div className="card" style={{ padding: 32 }}>
            <label>Mensaje a interpretar</label>
            <textarea
              className="input-field"
              rows={8}
              value={textoPegado}
              onChange={e => setTextoPegado(e.target.value)}
              placeholder={`Ejemplos:\n"Hola! Querría reservar para 4 personas el viernes 14 a las 21h. Soy Laura, tel 622 111 333"\n\n"Buenos días, reserva para mañana sábado, 2 personas, 14:30. Carlos López, 611234567. Tenemos intolerancia al gluten."`}
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

          {/* Ejemplos */}
          <div style={{ marginTop: 32 }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#444", textTransform: "uppercase", marginBottom: 16 }}>Prueba con un ejemplo</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                "Hola! Quería reservar mesa para 3 personas este sábado 15 de marzo a las 21:30. Me llamo Sofía Ruiz, mi teléfono es 655 987 123.",
                "Buenos días, ¿tienen mesa libre mañana para 2? Somos vegetarianos. Juan García, 611 222 333, para las 14h.",
                "Reserva: Ana Torres, 4 pax, 20 marzo, 20:00h. Tel: 699 444 555. Es cumpleaños."
              ].map((ej, i) => (
                <button key={i} onClick={() => setTextoPegado(ej)}
                  style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#666", padding: "10px 16px", cursor: "pointer", fontFamily: "'Jost', sans-serif", fontSize: 12, textAlign: "left", transition: "all 0.2s", maxWidth: 220, lineHeight: 1.5 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#c9a84c"; e.currentTarget.style.color = "#aaa"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#666"; }}
                >
                  {ej.substring(0, 60)}...
                </button>
              ))}
            </div>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── GOOGLE SHEET ── */}
      {vista === "sheet" && (
        <div style={{ padding: "40px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>Importar</p>
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 42, fontWeight: 300, letterSpacing: 2 }}>Google Sheet</h1>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: "#555", marginTop: 12, lineHeight: 1.7 }}>
              Lee las filas de tu hoja de cálculo en tiempo real y crea reservas con un clic.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 32, alignItems: "center" }}>
            <button className="btn-gold" onClick={cargarDesdeSheet} disabled={sheetCargando}
              style={{ display: "flex", alignItems: "center", gap: 10, opacity: sheetCargando ? 0.6 : 1 }}>
              {sheetCargando
                ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>Cargando...</>
                : "⊞ Cargar hoja"}
            </button>
            {sheetFilas.length > 0 && (
              <>
                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#555" }}>
                  {sheetFilas.length - 1} fila{sheetFilas.length - 1 !== 1 ? "s" : ""} cargada{sheetFilas.length - 1 !== 1 ? "s" : ""}
                </span>
                <button className="btn-outline" style={{ fontSize: 11, padding: "6px 14px" }} onClick={() => { setSheetFilas([]); setSheetError(""); }}>Limpiar</button>
              </>
            )}
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
                    <tr style={{ borderBottom: "1px solid #222" }}>
                      {sheetFilas[0].map((h, i) => (
                        <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#555", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>
                      ))}
                      <th style={{ padding: "12px 16px", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#555", textTransform: "uppercase", fontWeight: 400 }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheetFilas.slice(1).map((fila, i) => (
                      <tr key={i} className="row-hover" style={{ borderBottom: "1px solid #1a1a1a" }}>
                        {fila.map((celda, j) => (
                          <td key={j} style={{ padding: "14px 16px", fontFamily: celda ? "'Cormorant Garamond', serif" : "'Jost', sans-serif", fontSize: celda ? 16 : 13, color: celda ? "#f0ebe0" : "#333" }}>
                            {celda || "—"}
                          </td>
                        ))}
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button className="btn-gold" style={{ padding: "8px 16px", fontSize: 11 }}
                              onClick={() => {
                                const d = importarFilaSheet(headers, fila);
                                setReservaEditando(null);
                                setForm(d);
                                setModalAbierto(true);
                              }}>
                              + Importar
                            </button>
                            {(() => {
                              const d = importarFilaSheet(headers, fila);
                              return d.telefono ? <BtnWhatsApp reserva={d} style={{ padding: "8px 14px", fontSize: 11 }} /> : null;
                            })()}
                          </div>
                        </td>
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
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 32 }}>
              {reservaEditando ? "Editar reserva" : "Nueva reserva"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* TOMADA POR — primero y obligatorio */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ color: !form.tomadaPor ? "#c9a84c" : "#666" }}>Tomada por *</label>
                <select
                  className="input-field"
                  value={form.tomadaPor || ""}
                  onChange={e => setForm(f => ({ ...f, tomadaPor: e.target.value }))}
                  style={{ borderColor: !form.tomadaPor ? "#c9a84c44" : "#2a2a2a" }}
                >
                  <option value="">— Seleccionar —</option>
                  {["RAMIRO","YAMILA","LUCIANA","SHENAY","JESSICA","JULIO","JENNIFER","OTRO"].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

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
                    const existente = reservas.find(r => r.nombre === val);
                    if (existente) setForm(f => ({ ...f, nombre: existente.nombre, telefono: existente.telefono, email: existente.email }));
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
                <input className="input-field" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} autoComplete="off" />
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
                <label style={{ color: !form.personas ? "#c9a84c" : "#666" }}>Nº de personas *</label>
                <input
                  type="number"
                  className="input-field"
                  min={1} max={40}
                  value={form.personas}
                  onChange={e => setForm(f => ({ ...f, personas: parseInt(e.target.value) || "" }))}
                  style={{ borderColor: !form.personas ? "#c9a84c44" : "#2a2a2a" }}
                />
              </div>
              <div>
                <label>Estado</label>
                <select className="input-field" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  <option value="tomada">Tomada</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="cancelada">Cancelada</option>
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

      {toast && <div className={`toast toast-${toast.tipo}`}>{toast.msg}</div>}
    </div>
  );
}
