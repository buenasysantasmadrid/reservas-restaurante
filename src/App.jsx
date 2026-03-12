import { useState, useEffect } from "react";

const MESAS = [1, 2, 3, 4, 5, 15, 6, 16, 7, 17, 8, 18, 10, 11, 12, 13, 40, 41, 30, 31];
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
  const [vista, setVista] = useState("reservas");
  const [reservas, setReservas] = useState(initialReservas);
  const [filtroFecha, setFiltroFecha] = useState(getTodayStr());
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [reservaEditando, setReservaEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "", fecha: "", hora: "", personas: "", mesas: [], notas: "", estado: "tomada", tomadaPor: "" });
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
    setForm({ nombre: "", telefono: "", email: "", fecha: "", hora: "", personas: "", mesas: [], notas: "", estado: "tomada", tomadaPor: "" });
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
    if (reservaEditando) {
      setReservas(rs => rs.map(r => r.id === reservaEditando ? { ...form, id: r.id } : r));
      showToast("Reserva actualizada ✓");
    } else {
      setReservas(rs => [...rs, { ...form, mesa: form.mesas.join("+"), id: Date.now() }]);
      showToast("Reserva creada ✓");
    }
    setModalAbierto(false);
    if (vista === "sheet") setVista("sheet");
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
      const url = "https://script.google.com/macros/s/AKfycbxr4Yb8O1Db5W0sEh9eywRa-4rUgjd72TMZC_WJjvyTiDBljmtzj3tu5JhqHqqV0-y0HA/exec";
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
    // A=Nombre, B=Telefono, C=fecha+hora (Date object o string), D=Pax, E=Comentarios, F=Mail
    const nombre   = String(fila[0] || "");
    const telefono = String(fila[1] || "");
    const raw      = fila[2];
    const pax      = fila[3];
    const notas    = String(fila[4] || "");
    const email    = String(fila[5] || "");

    let fechaFmt = "";
    let horaFmt = "";

    if (raw) {
      // Viene como "2026-03-11T14:30:00.000Z" o Date object
      const d = new Date(raw);
      if (!isNaN(d)) {
        // Usar hora LOCAL (no UTC) para no perder la hora por zona horaria
        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, "0");
        const dd   = String(d.getDate()).padStart(2, "0");
        const hh   = String(d.getHours()).padStart(2, "0");
        const min  = String(d.getMinutes()).padStart(2, "0");
        fechaFmt = `${yyyy}-${mm}-${dd}`;
        horaFmt  = `${hh}:${min}`;
      }
    }

    return {
      nombre,
      telefono,
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
    const tel = r.telefono.replace(/\D/g, "");
    const fecha = new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const msg = `Hola ${r.nombre} 👋, le confirmamos su reserva para *${r.personas} personas* el *${fecha}* a las *${r.hora}* (Mesa ${r.mesas && r.mesas.length > 0 ? r.mesas.join("+") : r.mesa}). ¡Le esperamos! 🍽️`;
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
        :root {
          --gold: #2e7d32;
          --gold-light: #43a047;
          --dark: #e8f5e9;
          --dark2: #ffffff;
          --dark3: #f1f8f1;
          --cream: #1a2e1a;
          --muted: #555;
        }
        body { background: #b8ddb8; }
        .font-display { font-family: 'Cormorant Garamond', serif; }
        .font-body { font-family: 'Jost', sans-serif; }
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
        .btn-gold { background: #2e7d32; color: #ffffff; border: none; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; padding: 12px 24px; transition: background 0.2s; font-weight: 500; }
        .btn-gold:hover { background: #1b5e20; }
        .btn-outline { background: none; border: 1px solid #81c784; color: #2e7d32; cursor: pointer; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; padding: 8px 16px; transition: all 0.2s; }
        .btn-outline:hover { border-color: #1b5e20; color: #1b5e20; }
        .input-field { background: #ffffff; border: 1px solid #a5d6a7; color: #1a2e1a; padding: 10px 14px; font-family: 'Jost', sans-serif; font-size: 14px; width: 100%; transition: border-color 0.2s; }
        .input-field:focus { border-color: #2e7d32; }
        .badge { display: inline-block; padding: 3px 10px; font-family: 'Jost', sans-serif; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; border-radius: 2px; }
        .badge-confirmada { background: #e8f5e9; color: #1b5e20; border: 1px solid #81c784; }
        .badge-tomada { background: #fff8e1; color: #f57f17; border: 1px solid #ffcc02; }
        .badge-cancelada { background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }
        .row-hover { transition: background 0.15s; }
        .row-hover:hover { background: #f1f8f1; }
        .overlay { position: fixed; inset: 0; background: rgba(0,60,0,0.4); z-index: 50; display: flex; align-items: center; justify-content: center; }
        .modal { background: #ffffff; border: 1px solid #c8e6c9; padding: 40px; width: 90%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
        .toast { position: fixed; bottom: 32px; right: 32px; padding: 14px 24px; font-family: 'Jost', sans-serif; font-size: 13px; letter-spacing: 1px; z-index: 100; border-radius: 2px; animation: fadeIn 0.3s; }
        .toast-ok { background: #e8f5e9; border: 1px solid #81c784; color: #1b5e20; }
        .toast-error { background: #ffebee; border: 1px solid #ef9a9a; color: #b71c1c; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        label { display: block; font-family: 'Jost', sans-serif; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #4a7a4a; margin-bottom: 6px; }
        .divider { border: none; border-top: 1px solid #c8e6c9; margin: 24px 0; }
        select option { background: #ffffff; color: #1a2e1a; }
      `}</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #a5d6a7", background: "#ffffff", padding: "0 40px", position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 700, color: "#1a1a1a", fontStyle: "italic" }}>
              Buenas <span style={{ color: "#2e7d32" }}>y</span> Santas
            </div>
            <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 9, letterSpacing: 3, color: "#5a8a5a", textTransform: "uppercase", marginTop: 3 }}>nueva cocina casera</div>
          </div>
          <span style={{ color: "#c8e6c9", fontSize: 22 }}>|</span>
          <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 3, color: "#6a9a6a", textTransform: "uppercase" }}>Gestión de Reservas</span>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          <button className={`nav-btn ${vista === "reservas" ? "active" : ""}`} onClick={() => setVista("reservas")} style={{ color: vista === "reservas" ? "#1b5e20" : "#1a3a1a" }}>Reservas</button>
          <button className="nav-btn" onClick={abrirNueva} style={{ color: "#1a3a1a" }}>+ Nueva</button>
          <button className={`nav-btn ${vista === "pegar" ? "active" : ""}`} onClick={() => setVista("pegar")} style={{ color: vista === "pegar" ? "#1b5e20" : "#1a3a1a" }}>📋 Pegar WhatsApp</button>
          <button className={`nav-btn ${vista === "sheet" ? "active" : ""}`} onClick={() => setVista("sheet")} style={{ color: vista === "sheet" ? "#1b5e20" : "#1a3a1a" }}>📲 Nueva WhatsApp</button>
        </nav>
      </header>

      <main style={{ padding: "40px", maxWidth: 1200, margin: "0 auto", position: "relative", zIndex: 1 }}>

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
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", marginTop: 2 }}>{r.hora} · {r.personas} personas · {r.mesas && r.mesas.length > 0 ? "Mesa "+r.mesas.join("+") : r.mesa ? "Mesa "+r.mesa : ""}</p>
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
                <h1 style={{ fontFamily: "'Lora', serif", fontSize: 44, fontWeight: 700, color: "#1a1a1a" }}>Reservas</h1>
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
                  <tr style={{ borderBottom: "1px solid #c8e6c9" }}>
                    {["Cliente", "Fecha", "Hora", "Personas", "Mesa", "Estado", "Acciones"].map(h => (
                      <th key={h} style={{ padding: "14px 20px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reservasFiltradas.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#4a7a4a", fontFamily: "'Jost', sans-serif", fontSize: 14 }}>No hay reservas con estos filtros.</td></tr>
                  ) : reservasFiltradas.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)).map(r => (
                    <tr key={r.id} className="row-hover" style={{ borderBottom: "1px solid #c8e6c9" }}>
                      <td style={{ padding: "16px 20px" }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17 }}>{r.nombre}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a", marginTop: 2 }}>{r.telefono}</p>
                      </td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#1b5e20" }}>{r.hora}</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{r.personas} pax</td>
                      <td style={{ padding: "16px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []).map(m => (
                            <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2e7d32", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontFamily: "'Jost', sans-serif", width: "fit-content" }}>
                              {m}
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
                            {MESAS.filter(m => !(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []).includes(m)).map(m => (
                              <option key={m} value={m}>Mesa {m}</option>
                            ))}
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
                    <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", marginTop: 4 }}>{r.hora} · {r.personas} personas · {r.mesas && r.mesas.length > 0 ? "Mesa "+r.mesas.join("+") : r.mesa ? "Mesa "+r.mesa : ""}{r.notas ? ` · ${r.notas}` : ""}</p>
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
                              setModalAbierto(true);
                            }}>
                            + Importar
                          </button>
                        </td>
                        {fila.map((celda, j) => {
                          // Ocultar columnas: última (fila real), col G (importado=idx 6), hora (idx que matchee "hora")
                          const hdr = String(headers[j] || "").toLowerCase();
                          if (hdr.includes("import") || hdr.includes("hora") || hdr.includes("time")) return null;
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

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

      {toast && <div className={`toast toast-${toast.tipo}`}>{toast.msg}</div>}
    </div>
  );
}
