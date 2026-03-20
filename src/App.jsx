import { useState, useEffect, useRef } from "react";
import logoImg from "./logo_buenasysantas.jpg";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, getDocs } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// ── Firebase config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDuy8_t_-SDm85B1NMa33vRqv7ZBjeZE2I",
  authDomain: "reservas-buenas-y-santas.firebaseapp.com",
  projectId: "reservas-buenas-y-santas",
  storageBucket: "reservas-buenas-y-santas.firebasestorage.app",
  messagingSenderId: "320028238373",
  appId: "1:320028238373:web:5ec1eeaad33a825788d5cc",
  measurementId: "G-MDFWR29ZJ7"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const EMAILS_PERMITIDOS = [
  "buenasysantasmadrid@gmail.com",
  "buenasysantas9@gmail.com"
];
// ─────────────────────────────────────────────────────────────────────────────

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

const initialReservas = [];

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function App() {
  useEffect(() => {
    document.title = "Reservas · Buenas y Santas";
    const link = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon"; link.href = logoImg;
    document.head.appendChild(link);
  }, []);

  const [vista, setVista] = useState("reservas");
  const [reservas, setReservas] = useState([]);
  const [clientesArchivados, setClientesArchivados] = useState([]);
  const [fbCargando, setFbCargando] = useState(true);
  const [usuario, setUsuario] = useState(undefined); // undefined=cargando, null=no logado, obj=logado
  const seededRef = useRef(false);
  const [filtroFecha, setFiltroFecha] = useState(getTodayStr());
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
  const [pendingPegar, setPendingPegar] = useState(false);
  const [textoPegado, setTextoPegado] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [datosInterpretados, setDatosInterpretados] = useState(null);
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1b-RaZ3yQxQov1xgQS8QIBEeHMg4FA0ZIrjH6vWNtdFA/export?format=csv&gid=0");
  const [sheetCargando, setSheetCargando] = useState(false);
  const [sheetFilas, setSheetFilas] = useState([]);
  const [sheetError, setSheetError] = useState("");
  const [turnoModalAbierto, setTurnoModalAbierto] = useState(false);
  const [turnoDesde, setTurnoDesde] = useState("13:30");
  const [turnoHasta, setTurnoHasta] = useState("16:00");
  const [turnoPersonalizado, setTurnoPersonalizado] = useState(null); // { desde, hasta } when active
  const [hoveredMesa, setHoveredMesa] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(null); // callback a ejecutar si confirma salir
  const [confirmarSalidaPagina, setConfirmarSalidaPagina] = useState(null); // guardia para pegar/sheet
  // Estado independiente para el plano (no compartido con reservas)
  const [planoFecha, setPlanoFecha] = useState(getTodayStr());
  const [planoTurnoFiltro, setPlanoTurnoFiltro] = useState("t1");
  const [planoTurnoPersonalizado, setPlanoTurnoPersonalizado] = useState(null);
  const [planoTurnoModalAbierto, setPlanoTurnoModalAbierto] = useState(false);
  const [planoTurnoDesde, setPlanoTurnoDesde] = useState("13:30");
  const [planoTurnoHasta, setPlanoTurnoHasta] = useState("16:00");

  // Auto-archivar al abrir la app si son las 4am o más
  useEffect(() => {
    if (fbCargando) return; // wait until Firestore data is loaded
    const ahora = new Date();
    const hoy = getTodayStr();
    const esDespuesDeLas4 = ahora.getHours() >= 4;
    if (!esDespuesDeLas4) return;

    const pasadas = reservas.filter(r => r.fecha < hoy);
    if (pasadas.length === 0) return;

    const filas = pasadas.map(r => ({
      nombre: r.nombre, telefono: r.telefono || "", fecha: r.fecha,
      hora: r.hora || "", personas: r.personas || "", mesas: r.mesas || [],
      mesa: r.mesa || "", estado: r.estado || "", notas: r.notas || "",
      email: r.email || "", tomadaPor: r.tomadaPor || "", cuando: r.cuando || ""
    }));

    const url = "https://script.google.com/macros/s/AKfycbxslphHn0GNmCT8PQcmJHPzo4M9_bB1OABaiXEs5ugXAVxHtQNTF2v3u1HiYEi0lRrm/exec";
    fetch(url, { method: "POST", body: JSON.stringify(filas) })
      .then(res => { if (!res.ok) throw new Error(); })
      .then(async () => {
        // Archive clients to Firestore
        pasadas.forEach(r => {
          if (!clientesArchivados.find(c => c.nombre === r.nombre))
            fbSetCliente({ nombre: r.nombre, telefono: r.telefono || "", email: r.email || "" });
        });
        // Delete past reservas from Firestore
        const batch = writeBatch(db);
        pasadas.forEach(r => batch.delete(doc(db, "reservas", String(r.id))));
        await batch.commit();
      })
      .catch(() => {}); // silencioso
  }, [fbCargando]); // run once data is loaded

  // ── Firestore: listen to reservas in real time ───────────────────────────
  const sincronizarTimer = useRef(null);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "reservas"), async (snap) => {
      if (snap.empty && !seededRef.current) {
        // First run: seed with demo data
        seededRef.current = true;
        const batch = writeBatch(db);
        initialReservas.forEach(r => {
          batch.set(doc(db, "reservas", String(r.id)), r);
        });
        await batch.commit();
        return; // the commit will trigger another snapshot
      }
      seededRef.current = true;
      const nuevasReservas = snap.docs.map(d => d.data());
      setReservas(nuevasReservas);
      setFbCargando(false);
      if (sincronizarTimer.current) clearTimeout(sincronizarTimer.current);
      sincronizarTimer.current = setTimeout(() => sincronizarActuales(nuevasReservas), 2000);
    }, (err) => {
      console.error("Firestore reservas error:", err);
      setFbCargando(false);
    });
    return () => unsub();
  }, []);

  // ── Firestore: listen to clientes in real time ───────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clientes"), (snap) => {
      setClientesArchivados(snap.docs.map(d => d.data()));
    }, (err) => { console.error("Firestore clientes error:", err); });
    return () => unsub();
  }, []);

  // ── Firebase Auth: detectar sesión ──────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && EMAILS_PERMITIDOS.includes(user.email)) {
        setUsuario(user);
      } else {
        setUsuario(null);
        if (user) signOut(auth); // email no permitido → cerrar sesión
      }
    });
    return () => unsub();
  }, []);
  const fbSetReserva = async (reserva) => {
    try { await setDoc(doc(db, "reservas", String(reserva.id)), reserva); }
    catch (e) { console.error("fbSetReserva:", e); }
  };

  const fbDeleteReserva = async (id) => {
    try { await deleteDoc(doc(db, "reservas", String(id))); }
    catch (e) { console.error("fbDeleteReserva:", e); }
  };

  const fbSetCliente = async (cliente) => {
    const key = cliente.email || cliente.nombre.replace(/\s+/g, "_");
    try { await setDoc(doc(db, "clientes", key), cliente); }
    catch (e) { console.error("fbSetCliente:", e); }
  };

  const sincronizarActuales = (listaReservas) => {
    fetch("https://script.google.com/macros/s/AKfycbxslphHn0GNmCT8PQcmJHPzo4M9_bB1OABaiXEs5ugXAVxHtQNTF2v3u1HiYEi0lRrm/exec", {
      method: "POST",
      body: JSON.stringify({ action: "actualizarActuales", reservas: listaReservas })
    }).catch(() => {});
  };

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

  const mesasParaPax = (pax) => {
    if (pax <= 2) return 1;
    if (pax <= 5) return 2;
    if (pax <= 7) return 3;
    return 4;
  };

  const getTurnoStatus = (fecha, turno) => {
    const rs = reservas.filter(r => r.fecha === fecha && getTurno(r.hora) === turno && r.estado !== "cancelada");
    const totalMesas = rs.reduce((sum, r) => sum + mesasParaPax(r.personas || 1), 0);
    if (totalMesas > 13) return { status: "completo", mesas: totalMesas, bg: "#ffebee", labelBg: "#ffcdd2", labelColor: "#b71c1c" };
    if (totalMesas > 11) return { status: "cuidado", mesas: totalMesas, bg: "#fff3e0", labelBg: "#ffe0b2", labelColor: "#e65100" };
    return { status: "ok", mesas: totalMesas, bg: null, labelBg: null, labelColor: null };
  };

  const MESA_BLOCKS = [
    [3, 4, 7, 17],
    [10, 11, 12, 13],
    [5, 15, 6, 16],
    [1, 2, 8, 18],
  ];

  const getMesasDisponibles = (mesasActuales, mesasOcupadas) => {
    if (mesasActuales.length === 0) {
      return MESAS.filter(m => !mesasOcupadas.includes(m));
    }
    const block = MESA_BLOCKS.find(b => mesasActuales.some(m => b.includes(m)));
    if (block) {
      const remaining = block.filter(m => !mesasActuales.includes(m) && !mesasOcupadas.includes(m));
      if (mesasActuales.filter(m => block.includes(m)).length >= 4) {
        return MESAS.filter(m => !mesasActuales.includes(m) && !mesasOcupadas.includes(m));
      }
      return remaining;
    }
    return MESAS.filter(m => !mesasActuales.includes(m) && !mesasOcupadas.includes(m));
  };

  const reservasFiltradas = reservas.filter(r => {
    const matchFecha = filtroFecha ? r.fecha === filtroFecha : true;
    const matchEstado = filtroEstado === "todas" ? true : r.estado === filtroEstado;
    const matchBusqueda = r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || r.telefono.includes(busqueda);
    const turno = getTurno(r.hora);
    let matchTurno;
    if (filtroTurno === "custom" && turnoPersonalizado) {
      const [hD, mD] = turnoPersonalizado.desde.split(":").map(Number);
      const [hH, mH] = turnoPersonalizado.hasta.split(":").map(Number);
      const [hR, mR] = (r.hora || "00:00").split(":").map(Number);
      const minsDesde = hD * 60 + mD;
      const minsHasta = hH * 60 + mH;
      const minsR = hR * 60 + mR;
      matchTurno = minsR >= minsDesde && minsR <= minsHasta;
    } else {
      matchTurno = filtroTurno === "todos" ? true
        : filtroTurno === "mediodia" ? (turno === "t1" || turno === "t2")
        : filtroTurno === turno;
    }
    const hideCancelada = (filtroTurno !== "todos" && r.estado === "cancelada") || (filtroFecha && r.estado === "cancelada");
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

  const formTieneDatos = () => !reservaEditando && modalAbierto && (form.nombre || form.telefono || form.fecha || form.hora || form.personas);

  const navegarConGuardia = (accion) => {
    if (formTieneDatos()) {
      setConfirmarSalida(() => accion);
    } else if (vista === "pegar" && textoPegado.trim()) {
      setConfirmarSalidaPagina(() => accion);
    } else if (vista === "sheet" && sheetFilas.length > 1) {
      setConfirmarSalidaPagina(() => accion);
    } else {
      accion();
    }
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
    // Siempre pedir confirmación de WhatsApp (nueva o edición)
    setConfirmarWA(true);
  };

  const confirmarYGuardar = async () => {
    setGuardando(true);
    const ahora = new Date();
    const cuando = `${String(ahora.getDate()).padStart(2,"0")}/${String(ahora.getMonth()+1).padStart(2,"0")}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2,"0")}:${String(ahora.getMinutes()).padStart(2,"0")}`;
    let toastMsg;
    if (reservaEditando) {
      const updated = { ...form, id: reservaEditando };
      await fbSetReserva(updated);
      toastMsg = "Reserva actualizada ✓";
    } else {
      const nuevoId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const nuevaReserva = { ...form, mesa: form.mesas.join("+"), id: nuevoId, cuando };
      await fbSetReserva(nuevaReserva);
      if (pendingSheetIdx !== null) {
        setSheetFilas(fs => [fs[0], ...fs.slice(1).filter((_, idx) => idx + 1 !== pendingSheetIdx)]);
        fetch("https://script.google.com/macros/s/AKfycbxslphHn0GNmCT8PQcmJHPzo4M9_bB1OABaiXEs5ugXAVxHtQNTF2v3u1HiYEi0lRrm/exec", {
          method: "POST",
          body: JSON.stringify({ action: "marcarComoImportada", nombre: nuevaReserva.nombre, fecha: nuevaReserva.fecha })
        }).catch(() => {});
        setPendingSheetIdx(null);
      }
      toastMsg = "Reserva creada ✓";
    }
    showToast(toastMsg);
    setConfirmarWA(false);
    setModalAbierto(false);
    if (pendingPegar) {
      setTextoPegado("");
      setDatosInterpretados(null);
      setPendingPegar(false);
      setVista("pegar");
    }
    if (vista === "sheet") setVista("sheet");
    setTimeout(() => setGuardando(false), 800);
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
      const url = "https://script.google.com/macros/s/AKfycbxslphHn0GNmCT8PQcmJHPzo4M9_bB1OABaiXEs5ugXAVxHtQNTF2v3u1HiYEi0lRrm/exec";
      const res = await fetch(url, { method: "POST", body: JSON.stringify(filas) });
      if (!res.ok) throw new Error("Error al conectar con Google Sheets");
      // Guardar clientes en Firestore
      const nuevosClientes = [];
      pasadas.forEach(r => {
        if (!clientesArchivados.find(c => c.nombre === r.nombre)) {
          const cliente = { nombre: r.nombre, telefono: r.telefono || "", email: r.email || "" };
          nuevosClientes.push(cliente);
          fbSetCliente(cliente);
        }
      });
      // Borrar reservas archivadas de Firestore
      const batch = writeBatch(db);
      pasadas.forEach(r => batch.delete(doc(db, "reservas", String(r.id))));
      await batch.commit();
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

  const asignarMesasTurno = async (fecha, turno) => {
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

    const batch = writeBatch(db);
    reservasTurno.forEach(r => {
      const nuevasMesas = asignaciones[r.id];
      if (nuevasMesas) {
        batch.set(doc(db, "reservas", String(r.id)), { ...r, mesas: nuevasMesas });
      }
    });
    await batch.commit();

    if (sinMesa.length > 0) {
      showToast(`Sin mesa disponible: ${sinMesa.join(", ")}`, "error");
    } else {
      showToast("Mesas asignadas ✓");
    }
  };

  const borrarMesasTurno = async (fecha, turno) => {
    const afectadas = reservas.filter(r => r.fecha === fecha && getTurno(r.hora) === turno && r.estado !== "cancelada");
    const batch = writeBatch(db);
    afectadas.forEach(r => batch.set(doc(db, "reservas", String(r.id)), { ...r, mesas: [], mesa: "" }));
    await batch.commit();
    showToast("Mesas borradas", "error");
  };

  const eliminarReserva = (id) => {
    fbDeleteReserva(id);
    showToast("Reserva eliminada", "error");
  };

  const cambiarEstado = (id, estado) => {
    const r = reservas.find(r => r.id === id);
    if (r) fbSetReserva({ ...r, estado });
  };

  const imprimirReservas = () => {
    const logoUrl = logoImg;
    const fechaLabel = filtroFecha
      ? new Date(filtroFecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "Todas las fechas";

    const turnoLabel = filtroTurno === "todos" ? "Todos los turnos"
      : filtroTurno === "t1" ? "1º Turno Mediodía"
      : filtroTurno === "t2" ? "2º Turno Mediodía"
      : filtroTurno === "mediodia" ? "Mediodía completo"
      : filtroTurno === "noche" ? "Noche"
      : filtroTurno === "custom" && turnoPersonalizado ? `Turno ${turnoPersonalizado.desde} – ${turnoPersonalizado.hasta}`
      : "";

    const estadoLabel = "";

    const sorted = [...reservasFiltradas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

    const grupos = [];
    sorted.forEach(r => {
      const turno = getTurno(r.hora);
      const turnoKey = r.fecha + "_" + turno;
      if (!grupos.length || grupos[grupos.length - 1].turnoKey !== turnoKey) {
        grupos.push({ turnoKey, turno, fecha: r.fecha, reservas: [] });
      }
      grupos[grupos.length - 1].reservas.push(r);
    });

    const TURNO_LABEL_MAP = { t1: "1º Turno Mediodía", t2: "2º Turno Mediodía", noche: "Noche" };

    const rows = grupos.map(grupo => {
      const turnoHead = `<tr class="turno-head">
        <td colspan="6">
          ${!filtroFecha ? `${new Date(grupo.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} · ` : ""}${TURNO_LABEL_MAP[grupo.turno] || grupo.turno}
        </td>
      </tr>`;

      const reservaRows = grupo.reservas.map(r => {
        const mesas = r.mesas && r.mesas.length > 0 ? r.mesas.map(getMesaNombre).join("+") : r.mesa ? getMesaNombre(r.mesa) : "—";
        return `<tr>
          <td class="nombre">${r.nombre}</td>
          <td>${r.telefono || "—"}</td>
          <td class="hora">${r.hora}</td>
          <td style="text-align:center" class="pax">${r.personas}</td>
          <td>${mesas}</td>
          <td style="color:#333">${r.notas || ""}</td>
        </tr>`;
      }).join("");

      return turnoHead + reservaRows;
    }).join(`<tr class="gap"><td colspan="6"></td></tr>`);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title></title>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,700&family=Jost:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Jost', Arial, sans-serif; color: #000; background: #fff; padding: 22px 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #000; padding-bottom: 12px; margin-bottom: 14px; }
    .header-logo { font-family: 'Lora', Georgia, serif; font-size: 21px; font-weight: 700; font-style: italic; line-height: 1; color: #000; }
    .header-logo .y { color: #555; }
    .header-subtitle { font-family: 'Jost', Arial, sans-serif; font-size: 7.5px; font-weight: 300; letter-spacing: 3.5px; text-transform: uppercase; color: #888; margin-top: 4px; }
    .header-right { text-align: right; }
    .header-fecha { font-family: 'Jost', Arial, sans-serif; font-size: 12px; font-weight: 500; text-transform: capitalize; letter-spacing: 0.3px; }
    .header-turno { font-family: 'Jost', Arial, sans-serif; font-size: 9px; font-weight: 300; color: #666; margin-top: 3px; letter-spacing: 1.5px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 4px 8px; text-align: left; font-family: 'Jost', Arial, sans-serif; font-size: 8px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; color: #444; border-bottom: 1px solid #000; }
    td { padding: 3px 8px; font-family: 'Jost', Arial, sans-serif; font-size: 10px; color: #000; border-bottom: 1px solid #ebebeb; line-height: 1.4; }
    td.nombre { font-family: 'Lora', Georgia, serif; font-weight: 700; font-size: 12px; font-style: italic; }
    td.hora { font-family: 'Lora', Georgia, serif; font-size: 12px; font-weight: 700; font-style: italic; }
    td.pax { font-family: 'Lora', Georgia, serif !important; font-size: 12px !important; font-weight: 700 !important; }
    .turno-head td { font-family: 'Jost', Arial, sans-serif; font-size: 8px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; color: #444; padding: 5px 8px 3px; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .gap td { border: none; padding: 2px 0; background: #fff !important; }
    @media print {
      body { padding: 0; }
      @page { size: A4 landscape; margin: 14mm 16mm; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <img src="${logoUrl}" alt="Buenas y Santas" style="height:36px;width:auto;object-fit:contain;display:block"/>
    </div>
    <div class="header-right">
      <div class="header-fecha">${fechaLabel}</div>
      ${turnoLabel ? `<div class="header-turno">${turnoLabel}</div>` : ""}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:22%">Cliente</th>
        <th style="width:13%">Teléfono</th>
        <th style="width:7%">Hora</th>
        <th style="width:5%;text-align:center">Pax</th>
        <th style="width:10%">Mesa</th>
        <th>Notas</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#888;font-size:10px">No hay reservas</td></tr>'}
    </tbody>
  </table>
  <script>window.onload = () => { window.print(); }</` + `script>
</body>
</html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  const imprimirPlano = () => {
    const logoUrl = logoImg;
    const fechaLabel = planoFecha
      ? new Date(planoFecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "Todas las fechas";

    const turnoLabelMap = { t1: "1º Turno Mediodía", t2: "2º Turno Mediodía", noche: "Noche" };
    const turnoLabel = planoTurnoFiltro === "todos" ? "Todos los turnos"
      : planoTurnoFiltro === "mediodia" ? "Mediodía"
      : turnoLabelMap[planoTurnoFiltro] || (planoTurnoFiltro === "custom" && planoTurnoPersonalizado ? `Turno ${planoTurnoPersonalizado.desde} – ${planoTurnoPersonalizado.hasta}` : "");

    const planoTurnoLocal = planoTurnoFiltro === "custom" ? "custom" : (planoTurnoFiltro === "todos" || planoTurnoFiltro === "mediodia") ? "t1" : planoTurnoFiltro;
    const resTurno = reservas.filter(r => {
      if (!planoFecha || r.fecha !== planoFecha) return false;
      if (r.estado === "cancelada") return false;
      if (planoTurnoLocal === "custom" && planoTurnoPersonalizado) {
        const [hD, mD] = planoTurnoPersonalizado.desde.split(":").map(Number);
        const [hH, mH] = planoTurnoPersonalizado.hasta.split(":").map(Number);
        const [hR, mR] = (r.hora || "00:00").split(":").map(Number);
        const minsR = hR * 60 + mR;
        return minsR >= hD * 60 + mD && minsR <= hH * 60 + mH;
      }
      return getTurno(r.hora) === planoTurnoLocal;
    }).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

    const U = 60; const PAD = 10;
    const MESAS_POS_P = [
      { id: 40, cx: 3.2, cy: 0.5, w: 0.8, h: 0.8 }, { id: 41, cx: 4.5, cy: 0.5, w: 0.8, h: 0.8 },
      { id: 12, cx: 1,   cy: 1.7, w: 0.8, h: 0.8 }, { id: 1,  cx: 3.2, cy: 1.7, w: 0.8, h: 0.8 },
      { id: 3,  cx: 4.5, cy: 1.7, w: 0.8, h: 0.8 }, { id: 5,  cx: 5.8, cy: 1.7, w: 0.8, h: 0.8 },
      { id: 13, cx: 1,   cy: 2.6, w: 0.8, h: 0.8 }, { id: 2,  cx: 3.2, cy: 2.6, w: 0.8, h: 0.8 },
      { id: 4,  cx: 4.5, cy: 2.6, w: 0.8, h: 0.8 }, { id: 15, cx: 5.8, cy: 2.6, w: 0.8, h: 0.8 },
      { id: 18, cx: 3.2, cy: 3.9, w: 0.8, h: 0.8 }, { id: 17, cx: 4.5, cy: 3.9, w: 0.8, h: 0.8 },
      { id: 16, cx: 5.8, cy: 3.9, w: 0.8, h: 0.8 }, { id: 11, cx: 0.5, cy: 4.8, w: 0.8, h: 0.8 },
      { id: 10, cx: 1.6, cy: 4.8, w: 0.8, h: 0.8 }, { id: 8,  cx: 3.2, cy: 4.8, w: 0.8, h: 0.8 },
      { id: 7,  cx: 4.5, cy: 4.8, w: 0.8, h: 0.8 }, { id: 6,  cx: 5.8, cy: 4.8, w: 0.8, h: 0.8 },
    ];
    const MERGE_GROUPS_P = [
      { ids: [8,2,18,1],    clampToFirst:true, clampHeight:3.2, anchorBottom:true },
      { ids: [7,17,4,3],    clampToFirst:true, clampHeight:3.2, anchorBottom:true },
      { ids: [6,16,15,5],   clampToFirst:true, clampHeight:3.2, anchorBottom:true },
      { ids: [12,13,11,10], clampToFirst:true, clampHeight:3.2 },
      { ids: [5,15,16],     clampToFirst:true, clampHeight:2.1 },
      { ids: [6,16,15],     clampToFirst:true, clampHeight:2.1, anchorBottom:true },
      { ids: [3,4,17],      clampToFirst:true, clampHeight:2.1 },
      { ids: [7,17,4],      clampToFirst:true, clampHeight:2.1, anchorBottom:true },
      { ids: [1,2,18],      clampToFirst:true, clampHeight:2.1 },
      { ids: [8,18,2],      clampToFirst:true, clampHeight:2.1, anchorBottom:true },
      { ids: [12,13,11],    clampToFirst:true, clampHeight:2.1 },
      [1,2],[3,4],[5,15],[12,13],[8,18],[7,17],[6,16],[11,10],[40,41],
    ];
    const mesaReservaP = {};
    resTurno.forEach(r => {
      const ms = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
      ms.forEach(m => { mesaReservaP[m] = r; });
    });
    const reservaMergeGroupP = {};
    resTurno.forEach(r => {
      const ms = new Set(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []);
      if (ms.size < 2) return;
      for (const grp of MERGE_GROUPS_P) {
        const ids = Array.isArray(grp) ? grp : grp.ids;
        const unique = [...new Set(ids)];
        if (unique.every(m => ms.has(m))) {
          reservaMergeGroupP[r.id] = Array.isArray(grp) ? unique : { ids:unique, clampToFirst:grp.clampToFirst, clampHeight:grp.clampHeight, anchorBottom:grp.anchorBottom };
          break;
        }
      }
    });
    const secondaryMesasP = new Set();
    Object.values(reservaMergeGroupP).forEach(grp => {
      const ids = Array.isArray(grp) ? grp : grp.ids;
      ids.slice(1).forEach(m => secondaryMesasP.add(m));
    });
    const MESA_NOMBRE_P = { 30:"Barra 1", 31:"Barra 2" };
    const getMesaNombreP = m => MESA_NOMBRE_P[m] || String(m);

    const mesasSVG = MESAS_POS_P.map(({ id, cx, cy, w, h }) => {
      if (secondaryMesasP.has(id)) return "";
      const res = mesaReservaP[id];
      const ocupada = !!res;
      const sinConfirmar = res && res.estado === "tomada";
      const llego = res && res.estado === "llego";
      const fill   = llego ? "#f5f5f5" : sinConfirmar ? "#e8e8e8" : ocupada ? "#c8c8c8" : "#f2f2f2";
      const stroke = llego ? "#ddd"    : sinConfirmar ? "#999"    : ocupada ? "#888"    : "#ddd";
      const strokeW = ocupada ? 0.9 : 0.6;
      const strokeDash = sinConfirmar ? `stroke-dasharray="3 2"` : "";
      const textC  = llego ? "#ccc"   : sinConfirmar ? "#555"    : ocupada ? "#333"    : "#bbb";
      const mergeGroup = res ? reservaMergeGroupP[res.id] : null;
      const mergeIds = mergeGroup ? (Array.isArray(mergeGroup) ? mergeGroup : mergeGroup.ids) : null;
      const clampToFirst = mergeGroup && !Array.isArray(mergeGroup) && mergeGroup.clampToFirst;
      const clampHeight = mergeGroup && !Array.isArray(mergeGroup) ? mergeGroup.clampHeight : null;
      const anchorBottom = mergeGroup && !Array.isArray(mergeGroup) && mergeGroup.anchorBottom;
      const isMerged = mergeIds && mergeIds[0] === id;
      let mw = w*U, mh = h*U, mx = PAD+cx*U-(w*U)/2, my = PAD+cy*U-(h*U)/2;
      if (isMerged && mergeIds.length > 1) {
        const origMx=mx, origMw=mw, origMy=my, origMh=mh;
        mergeIds.slice(1).forEach(secId => {
          const sec = MESAS_POS_P.find(p => p.id === secId); if (!sec) return;
          const sx=PAD+sec.cx*U-(sec.w*U)/2, sy=PAD+sec.cy*U-(sec.h*U)/2;
          const x2=Math.max(mx+mw,sx+sec.w*U), y2=Math.max(my+mh,sy+sec.h*U);
          mx=Math.min(mx,sx); my=Math.min(my,sy); mw=x2-mx; mh=y2-my;
        });
        if (clampToFirst) {
          mx=origMx; mw=origMw; mh=origMh;
          mergeIds.slice(1).forEach(secId => {
            const sec=MESAS_POS_P.find(p=>p.id===secId); if(!sec) return;
            if(Math.abs(sec.cx-cx)<0.7){const sy=PAD+sec.cy*U-(sec.h*U)/2,y2=Math.max(my+mh,sy+sec.h*U);my=Math.min(my,sy);mh=y2-my;}
          });
          if (clampHeight) mh=Math.min(mh,clampHeight*U);
          if (anchorBottom) my=(PAD+cy*U+(h*U)/2)-mh;
        }
      }
      const label = getMesaNombreP(id);
      const lineH = isMerged ? mh*0.22 : (res ? mh*0.28 : mh/2+4);
      return `<g>
        <rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" ${strokeDash}/>
        <text x="${mx+mw/2}" y="${my+lineH}" text-anchor="middle" style="font-family:'Cormorant Garamond',serif;font-size:14px;font-style:italic;fill:${textC};font-weight:300">${label}</text>
        ${res?`<text x="${mx+mw/2}" y="${my+mh*(isMerged?0.38:0.48)}" text-anchor="middle" style="font-family:'Jost',sans-serif;font-size:7.5px;fill:#555;font-weight:300">${res.hora}</text>`:""}
        ${res?`<text x="${mx+mw/2}" y="${my+mh*(isMerged?0.58:0.68)}" text-anchor="middle" style="font-family:'Jost',sans-serif;font-size:8px;fill:#444;font-weight:300">${res.nombre.split(" ")[0]}</text>`:""}
        ${res?`<text x="${mx+mw/2}" y="${my+mh*(isMerged?0.80:0.88)}" text-anchor="middle" style="font-family:'Jost',sans-serif;font-size:7.5px;fill:#666;font-weight:300">${res.personas}p</text>`:""}
      </g>`;
    }).join("");

    const leyenda = `
      <rect x="16" y="330" width="8" height="8" rx="2" fill="#e8e8e8" stroke="#c8c8c8" stroke-width="0.5"/>
      <text x="28" y="337" style="font-family:'Jost',sans-serif;font-size:8px;fill:#bbb;font-weight:300">Ocupada</text>
      <rect x="82" y="330" width="8" height="8" rx="2" fill="#f2f2f2" stroke="#e0e0e0" stroke-width="0.5"/>
      <text x="94" y="337" style="font-family:'Jost',sans-serif;font-size:8px;fill:#bbb;font-weight:300">Libre</text>`;
    const separador = `<line x1="10" y1="${PAD+1.15*U}" x2="${PAD+5.8*U+0.8*U/2+10}" y2="${PAD+1.15*U}" stroke="#d0d0d0" stroke-width="0.8" stroke-dasharray="5 4"/>`;

    const tablaRows = resTurno.map(r => {
      const mesas = r.mesas&&r.mesas.length>0 ? r.mesas.map(getMesaNombreP).join("+") : r.mesa ? getMesaNombreP(r.mesa) : "—";
      const estadoLabel = r.estado==="confirmada"?"Conf.":r.estado==="tomada"?"Tomada":r.estado==="llego"?"Llegó":r.estado;
      return `<tr>
        <td class="nom">${r.nombre}</td><td class="tel">${r.telefono||"—"}</td>
        <td class="hr2">${r.hora}</td><td class="pax">${r.personas}</td>
        <td class="mesa">${mesas}</td><td><span class="badge">${estadoLabel}</span></td>
        <td class="nota">${r.notas||""}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Plano</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&family=Jost:wght@200;300;400&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Jost',sans-serif;color:#000;background:#fff;padding:10mm 12mm}
  .header{display:flex;align-items:flex-end;border-bottom:.7px solid #333;padding-bottom:6px;margin-bottom:9px}
  .hdr-mid{flex:1}
  .hdr-r{text-align:right}
  .fecha{font-size:9px;font-weight:600;color:#000;white-space:nowrap;font-family:'Jost',sans-serif}
  .turno{font-size:7px;font-weight:400;letter-spacing:2px;text-transform:uppercase;color:#000;margin-top:1px;white-space:nowrap;font-family:'Jost',sans-serif}
  .lbl{font-size:6px;font-weight:300;letter-spacing:2px;text-transform:uppercase;color:#bbb;margin-bottom:3px}
  .leyenda{display:flex;gap:12px;margin-top:5px;flex-wrap:wrap}
  .ley-item{display:flex;align-items:center;gap:3px;font-size:7px;color:#555;font-family:'Jost',sans-serif}
  .ley-box{width:8px;height:8px;border-radius:1px;flex-shrink:0}
  hr.div{border:none;border-top:.5px solid #ddd;margin:8px 0}
  table{width:100%;border-collapse:collapse}
  th{font-size:8px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#000;padding:3px 4px;border-bottom:.7px solid #333;text-align:left}
  th.c{text-align:center}
  td{padding:3.5px 4px;border-bottom:.4px solid #eee;vertical-align:middle;color:#000}
  td.nom{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:12px;font-weight:400;color:#000}
  td.hr2{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:12px;font-weight:400;white-space:nowrap;color:#000}
  td.pax{font-family:'Cormorant Garamond',serif;font-size:12px;font-weight:400;text-align:center;color:#000}
  td.tel{font-size:9px;color:#000;white-space:nowrap;font-weight:300}
  td.mesa{font-size:9px;color:#000;font-weight:300}
  td.nota{font-size:9px;color:#000;font-weight:300}
  .badge{background:#f0f0f0;color:#000;border:.5px solid #bbb;border-radius:2px;padding:1px 4px;font-size:7px;letter-spacing:.5px;text-transform:uppercase;font-weight:500;font-family:'Jost',sans-serif}
  @media print{body{padding:0}@page{size:A4 portrait;margin:10mm 12mm}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
  <div class="header">
    <div><img src="${logoUrl}" alt="Buenas y Santas" style="height:32px;width:auto;object-fit:contain;display:block"/></div>
    <div class="hdr-mid"></div>
    <div class="hdr-r">
      <div class="fecha">${fechaLabel}</div>
      ${turnoLabel ? `<div class="turno">${turnoLabel}</div>` : ""}
    </div>
  </div>
  <div class="lbl">Plano de sala</div>
  <svg viewBox="0 0 430 332" style="width:100%;display:block;border-radius:4px" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect width="430" height="332" fill="#f9f9f9" rx="4"/>
    ${separador}${mesasSVG}
  </svg>
  <div class="leyenda">
    <div class="ley-item"><div class="ley-box" style="background:#c8c8c8;border:1px solid #888"></div>Confirmada</div>
    <div class="ley-item"><div class="ley-box" style="background:#e8e8e8;border:1px dashed #999"></div>Sin confirmar</div>
    <div class="ley-item"><div class="ley-box" style="background:#f5f5f5;border:1px solid #ccc"></div>Llegó</div>
    <div class="ley-item"><div class="ley-box" style="background:#f2f2f2;border:1px solid #ddd"></div>Libre</div>
  </div>
  <hr class="div"/>
  <table>
    <thead><tr>
      <th style="width:22%">Cliente</th><th style="width:13%">Teléfono</th>
      <th style="width:8%">Hora</th><th class="c" style="width:5%">Pax</th>
      <th style="width:10%">Mesa</th><th style="width:9%">Estado</th><th>Notas</th>
    </tr></thead>
    <tbody>${tablaRows||'<tr><td colspan="7" style="padding:10px;text-align:center;color:#aaa;font-size:8px">No hay reservas</td></tr>'}</tbody>
  </table>
  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
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
      const url = "https://script.google.com/macros/s/AKfycbxslphHn0GNmCT8PQcmJHPzo4M9_bB1OABaiXEs5ugXAVxHtQNTF2v3u1HiYEi0lRrm/exec";
      const res = await fetch(url);
      if (!res.ok) throw new Error("No se pudo conectar con Google Sheets");
      const json = await res.json();
      if (!Array.isArray(json) || json.length < 2) throw new Error("No hay datos en la hoja");

      // Filtrar filas ya existentes en reservas Y reservas pasadas
      const hoy = getTodayStr();
      const headers = json[0];
      const filasFiltradas = json.slice(1).filter(fila => {
        const nombreFila = String(fila[0] || "").toLowerCase().trim();
        const raw = String(fila[2] || "").trim();
        // Soporta "YYYY-MM-DD..." y "DD/MM/YYYY ..."
        let fechaFila = "";
        const mISO = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const mES  = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (mISO) fechaFila = `${mISO[1]}-${mISO[2]}-${mISO[3]}`;
        else if (mES) fechaFila = `${mES[3]}-${mES[2]}-${mES[1]}`;
        if (fechaFila && fechaFila < hoy) return false;
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

    // Parsear "2026-03-11T14:30:00.000Z" o "22/03/2026 15:15:00" sin usar Date para evitar problemas de zona horaria
    let fechaFmt = "";
    let horaFmt = "";
    if (raw) {
      // Formato ISO: 2026-03-22T15:15:00.000Z
      const mISO = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      // Formato español de Google Sheets: 22/03/2026 15:15:00
      const mES  = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      if (mISO) {
        // La Z indica UTC; sumamos 1h para convertir a Madrid (UTC+1)
        let h = parseInt(mISO[4]) + 1;
        let d = parseInt(mISO[3]);
        let mo = mISO[2];
        let y = mISO[1];
        if (h >= 24) { h = 0; d += 1; } // medianoche, caso extremo
        fechaFmt = `${y}-${mo}-${String(d).padStart(2,"0")}`;
        horaFmt  = `${String(h).padStart(2,"0")}:${mISO[5]}`;
      } else if (mES) {
        fechaFmt = `${mES[3]}-${mES[2]}-${mES[1]}`;
        horaFmt  = `${mES[4]}:${mES[5]}`;
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

  const interpretarTexto = () => {
    if (!textoPegado.trim()) return;
    setInterpretando(true);
    setDatosInterpretados(null);

    try {
      const texto = textoPegado;

      // ── Helpers ──────────────────────────────────────────────────────────
      const extraer = (patrones) => {
        for (const patron of patrones) {
          const m = texto.match(patron);
          if (m && m[1] && m[1].trim()) return m[1].trim();
        }
        return "";
      };

      const MESES = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
                      ene:1,abr:4,ago:8,oct2:10 };
      const MESES_ES = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 };
      const parseFecha = (str) => {
        if (!str) return "";
        // YYYY-MM-DD
        let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) return str.slice(0,10);
        // DD/MM/YYYY o DD-MM-YYYY
        m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
        // "martes, 17 de marzo" o "17 de marzo de 2026" (español)
        m = str.match(/(\d{1,2})\s+de\s+([a-záéíóúü]+)(?:\s+(?:de\s+)?(\d{4}))?/i);
        if (m) {
          const mesNum = MESES_ES[m[2].toLowerCase()];
          if (mesNum) {
            const anyo = m[3] || new Date().getFullYear();
            return `${anyo}-${String(mesNum).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
          }
        }
        // DD Mon YYYY  o  D Mon YYYY
        m = str.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
        if (m) {
          const mes = MESES[m[2].toLowerCase()] || MESES[m[2].toLowerCase().replace(/[^a-z]/g,"")];
          if (mes) return `${m[3]}-${String(mes).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
        }
        return "";
      };

      // ── Formato columnar con tabs ─────────────────────────────────────────
      // FECHA  DISPONIBILE  HORA  PAX  NOMBRE  PREFIJO(+34)  TELEFONO  TOMADA_POR
      // Ejemplo: "martes, 17 de marzo \tDISPONIBLE\t14:15\t2\tISAAC\t34\t619859577\tRAMIRO"
      const lineas = texto.trim().split(/\r?\n/);
      for (const linea of lineas) {
        const cols = linea.split(/\t/).map(s => s.trim());
        if (cols.length >= 7) {
          const posibleHora = cols[2] || "";
          const posiblePax  = cols[3] || "";
          if (/^\d{1,2}:\d{2}$/.test(posibleHora) && /^\d+$/.test(posiblePax)) {
            // [0]=FECHA [1]=DISPONIBILE [2]=HORA [3]=PAX [4]=NOMBRE [5]=PREFIJO [6]=TELEFONO [7]=TOMADA_POR
            const fechaCol    = cols[0] || "";
            const horaCol     = cols[2] || "";
            const paxCol      = cols[3] || "";
            const nombreCol   = cols[4] || "";
            const prefijoCol  = cols[5] || "34";
            const telCol      = (cols[6] || "").replace(/\D/g, "");
            const tomadaPorCol = cols[7] || "";

            const fechaParseada = parseFecha(fechaCol);
            const horaLimpia = horaCol.replace(/^(\d):/, "0$1:");
            const prefijoLimpio = "+" + prefijoCol.replace(/\D/g, "");
            let telLimpio = telCol;
            // quitar prefijo si viene incluido en el número
            const preDigits = prefijoCol.replace(/\D/g, "");
            if (telLimpio.startsWith(preDigits) && telLimpio.length > preDigits.length + 7) {
              telLimpio = telLimpio.slice(preDigits.length);
            }

            if (nombreCol || telLimpio || fechaParseada) {
              const parsed = {
                nombre: nombreCol,
                telefono: telLimpio,
                prefijo: prefijoLimpio,
                email: "",
                fecha: fechaParseada,
                hora: horaLimpia,
                personas: parseInt(paxCol) || 2,
                notas: "",
                tomadaPor: tomadaPorCol
              };
              setDatosInterpretados(parsed);
              setForm(f => ({ ...f, ...parsed, mesas: [], estado: "tomada" }));
              setPendingPegar(true);
              setModalAbierto(true);
              setInterpretando(false);
              return;
            }
          }
        }
      }

      // ── Extraer campos ────────────────────────────────────────────────────
      const nombre = extraer([
        /(?:\d+\.\s*)?Nombre\s*:\s*(.+)/i,
        /^Nombre\s*:\s*(.+)/im
      ]);

      let telefono = extraer([
        /(?:\d+\.\s*)?N[úu]mero de Tel[eé]fono\s*:\s*(.+)/i,
        /Tel[eé]fono\s*:\s*(.+)/i,
        /Phone\s*:\s*(.+)/i
      ]).replace(/\D/g, "");
      // Si viene con prefijo 34 y tiene 11 dígitos → quitar el 34
      if (telefono.startsWith("34") && telefono.length === 11) telefono = telefono.slice(2);

      const email = extraer([
        /(?:\d+\.\s*)?Mail\s*:\s*(.+)/i,
        /(?:\d+\.\s*)?E-?mail\s*:\s*(.+)/i
      ]);

      const personasStr = extraer([
        /(?:\d+\.\s*)?[¿¡]?Cu[aá]ntas personas\??[¿¡]?\s*:\s*(.+)/i,
        /Personas\s*:\s*(.+)/i,
        /Pax\s*:\s*(.+)/i
      ]);
      const personas = parseInt(personasStr) || 2;

      // Notas: Comentarios u Observaciones — pero solo si no es un email y no está vacío
      const notasRaw = extraer([
        /(?:\d+\.\s*)?Comentarios\s*:\s*(.+)/i,
        /(?:\d+\.\s*)?Observaciones\s*:\s*(.+)/i,
        /Notas\s*:\s*(.+)/i
      ]);
      const notas = (notasRaw && !notasRaw.includes("@") && notasRaw.trim().length > 0) ? notasRaw.trim() : "";

      // Fecha y hora — pueden venir juntas o separadas
      // Formato 1: "23 Mar 2026 Hora: 14:00 Europe/Madrid"  (todo en una línea)
      // Formato 2: "Día: 23 Mar 2026\nHora: 14:00 Europe/Madrid"
      // Formato 3: "Hora de inicio de la reserva: 23 Mar 2026 Hora: 14:00 Europe/Madrid"
      let fechaRaw = "";
      let horaRaw = "";

      const lineaHoraInicio = texto.match(/Hora de inicio de la reserva\s*:\s*(.+)/i);
      if (lineaHoraInicio && lineaHoraInicio[1].trim()) {
        const resto = lineaHoraInicio[1];
        const mHora = resto.match(/Hora\s*:\s*(\d{1,2}:\d{2})/i);
        if (mHora) horaRaw = mHora[1];
        fechaRaw = resto.replace(/Hora\s*:.*$/i, "").trim();
      }
      // Si no se encontró fecha/hora en la misma línea, buscar Día: y Hora: por separado
      if (!fechaRaw) {
        const mDia = texto.match(/D[ií]a\s*:\s*(.+)/i);
        if (mDia) fechaRaw = mDia[1].trim();
      }
      if (!horaRaw) {
        const mHora = texto.match(/Hora\s*:\s*(\d{1,2}:\d{2})/i);
        if (mHora) horaRaw = mHora[1];
      }

      // Si aún no hay fecha, buscar cualquier patrón de fecha
      if (!fechaRaw) {
        const mf = texto.match(/(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/);
        if (mf) fechaRaw = mf[1];
      }

      const fecha = parseFecha(fechaRaw);
      // Hora: asegurar formato HH:MM
      const hora = horaRaw ? horaRaw.replace(/^(\d):/, "0$1:") : "";

      // ── Resultado ─────────────────────────────────────────────────────────
      const parsed = { nombre, telefono, email, fecha, hora, personas, notas };

      if (!nombre && !telefono && !fecha) {
        showToast("No se encontraron datos en el mensaje", "error");
        setInterpretando(false);
        return;
      }

      setDatosInterpretados(parsed);
      setForm(f => ({ ...f, ...parsed, mesas: [], estado: "tomada" }));
      setPendingPegar(true);
      setModalAbierto(true);
    } catch (e) {
      showToast("No se pudo interpretar el mensaje", "error");
    }
    setInterpretando(false);
  };

  const enviarWhatsApp = (r, tipo = "nueva") => {
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

    const nombreCapital = r.nombre.split(" ")[0];
    let msg;

    if (tipo === "confirmar") {
      msg =
`Hola ${nombreCapital}!
Necesitamos por favor que *CONFIRMES* tu reserva para hoy para *${r.personas}* personas a las *${r.hora}* hs.

Esperamos tu respuesta

Buenas y Santas`;
    } else {
      const fechaObj = new Date(r.fecha + "T12:00");
      const diaSemana = fechaObj.toLocaleDateString("es-ES", { weekday: "long" });
      const diaMes = fechaObj.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
      const [hh, mm] = (r.hora || "00:00").split(":").map(Number);
      const mins = hh * 60 + mm;
      const esPrimerTurno = mins >= 13 * 60 + 30 && mins <= 14 * 60;
      const lineaImportante = esPrimerTurno
        ? `*IMPORTANTE: Recuerda que podrás disfrutar de tu mesa hasta las 15:00 hs.*`
        : `*IMPORTANTE: Recuerda que podrás disfrutar de tu reserva 90 minutos.*`;
      msg =
`Hola, ${nombreCapital}
Te escribimos de Buenas y Santas para confirmar tu reserva.

Día: *${diaSemana}*, ${diaMes}, Hora: *${r.hora}*, Personas: *${r.personas}*

${lineaImportante}
(si no van a venir por favor avisar que guardamos la mesa 10 minutos)

Saludos, nos vemos

Buenas y Santas`;
    }

    window.open(`https://wa.me/+${tel}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ── Botón WhatsApp reutilizable ──────────────────────────────────────────────
  const BtnWhatsApp = ({ reserva, style = {}, tipo = "nueva", conTexto = false }) => (
    reserva.telefono ? (
      <button
        onClick={() => enviarWhatsApp(reserva, tipo)}
        title="Enviar confirmación por WhatsApp"
        style={{
          padding: "5px 8px", background: "#25D366", border: "none",
          color: "#fff", cursor: "pointer", borderRadius: 4,
          transition: "background 0.2s", display: "inline-flex",
          alignItems: "center", justifyContent: "center", gap: 6, ...style
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#1ebe5a"}
        onMouseLeave={e => e.currentTarget.style.background = "#25D366"}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {conTexto && (
          <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, letterSpacing: 0.5, fontWeight: 600 }}>
            {tipo === "confirmar" ? "Enviar WhatsApp confirmación" : "Enviar WhatsApp"}
          </span>
        )}
      </button>
    ) : null
  );

  const stats = {
    hoy: reservas.filter(r => r.fecha === getTodayStr()).length,
    confirmadas: reservas.filter(r => r.estado === "confirmada").length,
    pendientes: reservas.filter(r => r.estado === "tomada").length,
    personas: reservas.filter(r => r.fecha === getTodayStr() && r.estado === "confirmada").reduce((s, r) => s + r.personas, 0),
  };

  // ── Pantalla: comprobando sesión ─────────────────────────────────────────
  if (usuario === undefined) return (
    <div style={{ minHeight: "100vh", background: "#b8ddb8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ fontFamily: "'Lora', serif", fontSize: 28, fontWeight: 700, fontStyle: "italic", color: "#1b5e20" }}>Buenas <span style={{ color: "#555" }}>y</span> Santas</div>
      <div style={{ width: 32, height: 32, border: "3px solid #81c784", borderTopColor: "#1b5e20", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Pantalla: login ───────────────────────────────────────────────────────
  if (!usuario) return (
    <div style={{ minHeight: "100vh", background: "#b8ddb8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <img src={logoImg} alt="Buenas y Santas" style={{ height: 80, objectFit: "contain" }} onError={e => { e.target.style.display="none"; }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Lora', serif", fontSize: 28, fontWeight: 700, fontStyle: "italic", color: "#1b5e20" }}>Buenas <span style={{ color: "#555" }}>y</span> Santas</div>
        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 3, color: "#5a8a5a", textTransform: "uppercase", marginTop: 4 }}>Gestión de Reservas</div>
      </div>
      <button
        onClick={() => signInWithPopup(auth, googleProvider)}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "14px 28px",
          background: "#fff", border: "1.5px solid #a5d6a7", borderRadius: 8,
          fontFamily: "'Jost', sans-serif", fontSize: 14, fontWeight: 600,
          color: "#1a2e1a", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          letterSpacing: 0.5
        }}
      >
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Iniciar sesión con Google
      </button>
      <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#6a9a6a", textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
        Solo las cuentas autorizadas del restaurante pueden acceder.
      </p>
    </div>
  );



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
          <img src={logoImg} alt="Buenas y Santas" style={{ height: 44, width: "auto", objectFit: "contain" }} />
          <span className="desktop-subtitle" style={{ color: "#c8e6c9", fontSize: 22 }}>|</span>
          <span className="desktop-subtitle" style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 3, color: "#6a9a6a", textTransform: "uppercase" }}>Gestión de Reservas</span>
        </div>
        {/* Desktop nav */}
        <nav className="desktop-nav" style={{ display: "flex", gap: 4 }}>
          <button className={`nav-btn ${vista === "reservas" ? "active" : ""}`} onClick={() => navegarConGuardia(() => setVista("reservas"))}>Reservas</button>
          <button className={`nav-btn ${vista === "plano" ? "active" : ""}`} onClick={() => navegarConGuardia(() => setVista("plano"))}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",verticalAlign:"middle",marginRight:4}}><rect x="3" y="9" width="18" height="3" rx="1"/><line x1="5" y1="12" x2="5" y2="19"/><line x1="19" y1="12" x2="19" y2="19"/><line x1="3" y1="19" x2="21" y2="19"/></svg> Plano</button>
          <button className="nav-btn" onClick={abrirNueva}>+ Nueva</button>
          <button className={`nav-btn ${vista === "pegar" ? "active" : ""}`} onClick={() => navegarConGuardia(() => setVista("pegar"))}>📋 Pegar WhatsApp</button>
          <button className={`nav-btn ${vista === "sheet" ? "active" : ""}`} onClick={() => navegarConGuardia(() => setVista("sheet"))}>📲 Nueva WhatsApp</button>
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
          <button className={`nav-btn ${vista === "reservas" ? "active" : ""}`} onClick={() => { navegarConGuardia(() => { setVista("reservas"); setMenuOpen(false); }); }}>Reservas</button>
          <button className={`nav-btn ${vista === "plano" ? "active" : ""}`} onClick={() => { navegarConGuardia(() => { setVista("plano"); setMenuOpen(false); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{display:"inline",verticalAlign:"middle",marginRight:4}}><rect x="3" y="9" width="18" height="3" rx="1"/><line x1="5" y1="12" x2="5" y2="19"/><line x1="19" y1="12" x2="19" y2="19"/><line x1="3" y1="19" x2="21" y2="19"/></svg> Plano</button>
          <button className="nav-btn" onClick={() => { abrirNueva(); setMenuOpen(false); }}>+ Nueva reserva</button>
          <button className={`nav-btn ${vista === "pegar" ? "active" : ""}`} onClick={() => { navegarConGuardia(() => { setVista("pegar"); setMenuOpen(false); }); }}>📋 Pegar WhatsApp</button>
          <button className={`nav-btn ${vista === "sheet" ? "active" : ""}`} onClick={() => { navegarConGuardia(() => { setVista("sheet"); setMenuOpen(false); }); }}>📲 Nueva WhatsApp</button>
        </nav>
      )}

      <main className="main-pad" style={{ padding: "40px", maxWidth: 1360, margin: "0 auto", position: "relative", zIndex: 1 }}>

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
                <button className="btn-outline" style={{ borderColor: "#81c784", color: "#2e7d32", fontSize: 11 }} onClick={imprimirReservas}>🖨 Imprimir</button>
                <button className="btn-gold" onClick={abrirNueva}>+ Nueva reserva</button>
              </div>
            </div>

            {/* Filtros */}
            <div className="filtros-wrap" style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" className="input-field" style={{ width: 180 }} value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
              <button
                onClick={() => setFiltroFecha(getTodayStr())}
                style={{
                  padding: "8px 14px", fontSize: 11, cursor: "pointer",
                  fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase",
                  border: `1px solid ${filtroFecha === getTodayStr() ? "#1b5e20" : "#81c784"}`,
                  background: filtroFecha === getTodayStr() ? "#1b5e20" : "none",
                  color: filtroFecha === getTodayStr() ? "#fff" : "#2e7d32",
                  borderRadius: 4, transition: "all 0.2s", fontWeight: 500
                }}>Hoy</button>
              <input type="text" className="input-field" style={{ width: 220 }} placeholder="Buscar cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <select className="input-field" style={{ width: 160 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="todas">Todos los estados</option>
                <option value="confirmada">Confirmadas</option>
                <option value="tomada">Tomadas</option>
                <option value="cancelada">Canceladas</option>
                <option value="llego">Llegaron</option>
              </select>
              <button className="btn-outline" onClick={() => { setFiltroFecha(""); setFiltroTurno("todos"); }}>Ver todas las fechas</button>
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
                {/* Botón TURNO? personalizado */}
                <button
                  onClick={() => setTurnoModalAbierto(true)}
                  style={{
                    padding: "8px 14px", fontSize: 11, cursor: "pointer",
                    fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase",
                    border: `1px solid ${filtroTurno === "custom" ? "#1b5e20" : "#81c784"}`,
                    background: filtroTurno === "custom" ? "#1b5e20" : "none",
                    color: filtroTurno === "custom" ? "#fff" : "#2e7d32",
                    borderRadius: 4, transition: "all 0.2s"
                  }}>
                  {filtroTurno === "custom" && turnoPersonalizado
                    ? `${turnoPersonalizado.desde} – ${turnoPersonalizado.hasta}`
                    : "Turno?"}
                </button>
              </div>
            </div>

            {/* Tabla */}
            <div className="card desktop-table" style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #c8e6c9" }}>
                    {["Cliente", "Fecha", "Hora", "Personas", "Mesa", "Estado", "Observaciones", "Acciones", "Tomada por", "Mail / Cuando"].map(h => (
                      <th key={h} style={{ padding: "14px 20px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reservasFiltradas.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#4a7a4a", fontFamily: "'Jost', sans-serif", fontSize: 14 }}>No hay reservas con estos filtros.</td></tr>
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
                      const tStatus = getTurnoStatus(fecha, turno);
                      const rowBg = tStatus.status === "completo" ? "#ffebee" : tStatus.status === "cuidado" ? "#fff3e0" : color.bg;
                      // Separator between groups (not before first)
                      if (gi > 0) {
                        rows.push(<tr key={"sep_"+gi}><td colSpan={11} style={{ padding: 0, height: 14, background: "transparent", border: "none" }} /></tr>);
                      }
                      // Turno header row with label + badge
                      rows.push(
                        <tr key={"turnohead_"+turnoKey}>
                          <td colSpan={11} style={{ padding: "6px 20px 4px", background: rowBg, borderBottom: "1px solid #c8e6c9" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#4a7a4a", fontWeight: 600 }}>
                                {color.label}
                              </span>
                              {tStatus.status === "ok" && (
                                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: "#6a9a6a" }}>
                                  · {tStatus.mesas} mesa{tStatus.mesas !== 1 ? "s" : ""}
                                </span>
                              )}
                              {tStatus.status === "cuidado" && (
                                <span style={{ background: "#e65100", color: "#fff", fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "2px 10px", borderRadius: 3 }}>
                                  ⚠ CUIDADO
                                </span>
                              )}
                              {tStatus.status === "completo" && (
                                <span style={{ background: "#b71c1c", color: "#fff", fontFamily: "'Jost', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "2px 10px", borderRadius: 3 }}>
                                  🔴 COMPLETO
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                      // Rows for this group
                      grupo.reservas.forEach((r, idx) => {
                      rows.push(
                    <tr key={r.id} className="row-hover" style={{ borderBottom: "1px solid #c8e6c9", background: rowBg, opacity: r.estado === "llego" ? 0.22 : 1 }}>
                      <td style={{ padding: "9px 20px" }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17 }}>{r.nombre}</p>
                        <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a", marginTop: 2 }}>{(() => {
                          return String(r.telefono || "").trim();
                        })()}</p>
                      </td>
                      <td style={{ padding: "9px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>
                        <div>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long" }).toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: "#6a9a6a" }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</div>
                      </td>
                      <td style={{ padding: "9px 20px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: "#1b5e20" }}>{r.hora}</td>
                      <td style={{ padding: "9px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{r.personas} pax</td>
                      <td style={{ padding: "9px 20px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []).map(m => (
                            <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2e7d32", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontFamily: "'Jost', sans-serif", width: "fit-content" }}>
                              {getMesaNombre(m)}
                              <button type="button" onClick={() => { const updated = { ...r, mesas: (r.mesas||[r.mesa]||[]).filter(v => v !== m) }; fbSetReserva(updated); }}
                                style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                            </span>
                          ))}
                          <select
                            style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #a5d6a7", borderRadius: 4, background: "#fff", color: "#2e7d32", fontFamily: "'Jost', sans-serif", cursor: "pointer", marginTop: 2 }}
                            value=""
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              if (!val) return;
                              setReservas(rs => rs.map(x => {  // local optimistic update for immediate UI feedback
                                if (x.id !== r.id) return x;
                                const curr = x.mesas || (x.mesa ? [x.mesa] : []);
                                if (curr.includes(val) || curr.length >= 8) return x;
                                return { ...x, mesas: [...curr, val] };
                              }));
                              const curr = r.mesas || (r.mesa ? [r.mesa] : []);
                              if (!curr.includes(val) && curr.length < 8) fbSetReserva({ ...r, mesas: [...curr, val] });
                            }}
                          >
                            <option value="">+ mesa</option>
                            {(() => {
                              const turnoR = getTurno(r.hora);
                              const mesasOcupadasEnTurno = reservas
                                .filter(x => x.id !== r.id && getTurno(x.hora) === turnoR && x.fecha === r.fecha && x.estado !== "cancelada")
                                .flatMap(x => x.mesas || (x.mesa ? [x.mesa] : []));
                              const mesasActuales = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
                              return getMesasDisponibles(mesasActuales, mesasOcupadasEnTurno)
                                .map(m => <option key={m} value={m}>{getMesaNombre(m)}</option>);
                            })()}
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: "9px 20px" }}>
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
                      <td style={{ padding: "9px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", maxWidth: 160 }}>
                        {r.notas || "—"}
                      </td>
                      <td style={{ padding: "9px 20px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => abrirEditar(r)}>Editar</button>
                          <BtnWhatsApp reserva={r} tipo="confirmar" />
                        </div>
                      </td>
                      <td style={{ padding: "9px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a" }}>
                        {r.tomadaPor || "—"}
                      </td>
                      <td style={{ padding: "9px 20px" }}>
                        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a" }}>{r.email || "—"}</div>
                        <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, color: "#9e9e9e", marginTop: 2 }}>{r.cuando || ""}</div>
                      </td>
                    </tr>
                  );
                      }); // end grupo.reservas.forEach

                      // Footer row: always show assign/clear buttons
                      {
                        const todasReservasTurno = reservas.filter(x => x.fecha === fecha && getTurno(x.hora) === turno && x.estado !== "cancelada");
                        const todasOcupadas = todasReservasTurno.flatMap(x => x.mesas && x.mesas.length > 0 ? x.mesas : x.mesa ? [x.mesa] : []);
                        const mesasLibres = MESAS.filter(m => !todasOcupadas.includes(m));
                        rows.push(
                          <tr key={"footer_"+turnoKey}>
                            <td colSpan={11} style={{ padding: "8px 20px 12px", background: rowBg, borderBottom: "1px solid #c8e6c9" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 1, color: "#4a7a4a", textTransform: "uppercase" }}>
                                  Mesas libres: {mesasLibres.length === 0 ? <span style={{ color: "#c62828" }}>ninguna</span> : mesasLibres.map(m => (
                                    <span key={m} style={{ display: "inline-block", background: rowBg, border: "1px solid #a5d6a7", borderRadius: 4, padding: "1px 7px", marginRight: 4, fontSize: 11, color: "#2e7d32" }}>{getMesaNombre(m)}</span>
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
                                  <button
                                    onClick={() => {
                                      const conTel = todasReservasTurno.filter(x => x.telefono && x.estado !== "cancelada");
                                      if (conTel.length === 0) return showToast("No hay teléfonos en este turno", "error");
                                      conTel.forEach((r, i) => setTimeout(() => enviarWhatsApp(r, "confirmar"), i * 600));
                                      showToast(`Abriendo ${conTel.length} WhatsApp...`);
                                    }}
                                    style={{ padding: "4px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "#25D366", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                                    onMouseEnter={e => e.currentTarget.style.background="#1ebe5a"}
                                    onMouseLeave={e => e.currentTarget.style.background="#25D366"}
                                  >
                                    📲 WA a todos
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
                  const tStatus = getTurnoStatus(grupo.fecha, grupo.turno);
                  const rowBg = tStatus.status === "completo" ? "#ffebee" : tStatus.status === "cuidado" ? "#fff3e0" : color.bg;
                  return (
                    <div key={grupo.turnoKey} style={{ marginBottom: 20 }}>
                      <div style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#4a7a4a", padding: "10px 4px 6px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        {color.label}
                        {tStatus.status === "ok" && <span style={{ fontWeight: 400, color: "#6a9a6a" }}>· {tStatus.mesas} mesas</span>}
                        {tStatus.status === "cuidado" && <span style={{ background: "#e65100", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "1px 8px", borderRadius: 3 }}>⚠ CUIDADO</span>}
                        {tStatus.status === "completo" && <span style={{ background: "#b71c1c", color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: "1px 8px", borderRadius: 3 }}>🔴 COMPLETO</span>}
                      </div>
                      {grupo.reservas.map(r => (
                        <div key={r.id} style={{ background: rowBg, border: "1px solid #c8e6c9", borderRadius: 8, padding: 16, marginBottom: 10, opacity: r.estado === "llego" ? 0.22 : 1 }}>
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
                              <span style={{ display: "block" }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { weekday: "long" }).toUpperCase()}</span>
                              <span style={{ fontSize: 11, color: "#6a9a6a" }}>{new Date(r.fecha + "T12:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
                            </span>
                          </div>
                          {/* Mesa selector mobile */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
                            {(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []).map(m => (
                              <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2e7d32", color: "#fff", borderRadius: 4, padding: "3px 10px", fontSize: 13, fontFamily: "'Jost', sans-serif" }}>
                                {getMesaNombre(m)}
                                <button type="button" onClick={() => { const updated = { ...r, mesas: (r.mesas || (r.mesa ? [r.mesa] : [])).filter(v => v !== m) }; fbSetReserva(updated); }}
                                  style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
                              </span>
                            ))}
                            <select
                              style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #a5d6a7", borderRadius: 4, background: "#fff", color: "#2e7d32", fontFamily: "'Jost', sans-serif", cursor: "pointer" }}
                              value=""
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                if (!val) return;
                                setReservas(rs => rs.map(x => { // optimistic local update
                                  if (x.id !== r.id) return x;
                                  const curr = x.mesas || (x.mesa ? [x.mesa] : []);
                                  if (curr.includes(val) || curr.length >= 8) return x;
                                  return { ...x, mesas: [...curr, val] };
                                }));
                                const curr = r.mesas || (r.mesa ? [r.mesa] : []);
                                if (!curr.includes(val) && curr.length < 8) fbSetReserva({ ...r, mesas: [...curr, val] });
                              }}
                            >
                              <option value="">+ mesa</option>
                              {(() => {
                                const turnoR = getTurno(r.hora);
                                const ocupadas = reservas.filter(x => x.id !== r.id && getTurno(x.hora) === turnoR && x.fecha === r.fecha && x.estado !== "cancelada").flatMap(x => x.mesas || (x.mesa ? [x.mesa] : []));
                                const actuales = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
                                return getMesasDisponibles(actuales, ocupadas).map(m => (
                                  <option key={m} value={m}>{getMesaNombre(m)}</option>
                                ));
                              })()}
                            </select>
                          </div>
                          {r.notas ? <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#6a9a6a", marginBottom: 10, fontStyle: "italic" }}>{r.notas}</p> : null}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }} onClick={() => abrirEditar(r)}>Editar</button>
                            <BtnWhatsApp reserva={r} tipo="confirmar" />

                          </div>
                        </div>
                      ))}
                      {(() => {
                        const todasOcupadas = reservas.filter(x => x.fecha === grupo.fecha && getTurno(x.hora) === grupo.turno && x.estado !== "cancelada").flatMap(x => x.mesas && x.mesas.length > 0 ? x.mesas : x.mesa ? [x.mesa] : []);
                        const libres = MESAS.filter(m => !todasOcupadas.includes(m));
                        return (
                          <div style={{ background: rowBg, border: "1px solid #c8e6c9", borderRadius: 8, padding: "10px 14px", marginBottom: 4 }}>
                            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#4a7a4a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                              Mesas libres: {libres.length === 0 ? <span style={{ color: "#c62828" }}>ninguna</span> : libres.map(m => (
                                <span key={m} style={{ display: "inline-block", background: rowBg, border: "1px solid #a5d6a7", borderRadius: 4, padding: "1px 7px", marginRight: 4, fontSize: 11, color: "#2e7d32" }}>{getMesaNombre(m)}</span>
                              ))}
                            </p>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => asignarMesasTurno(grupo.fecha, grupo.turno)}
                                style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                                ✦ Asignar mesas
                              </button>
                              <button onClick={() => borrarMesasTurno(grupo.fecha, grupo.turno)}
                                style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "none", color: "#b71c1c", border: "1px solid #ef9a9a", borderRadius: 4, cursor: "pointer" }}>
                                ✕ Borrar mesas
                              </button>
                              <button onClick={() => {
                                const conTel = reservas.filter(x => x.fecha === grupo.fecha && getTurno(x.hora) === grupo.turno && x.estado !== "cancelada" && x.telefono);
                                if (conTel.length === 0) return showToast("No hay teléfonos en este turno", "error");
                                conTel.forEach((r, i) => setTimeout(() => enviarWhatsApp(r, "confirmar"), i * 600));
                                showToast(`Abriendo ${conTel.length} WhatsApp...`);
                              }}
                                style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "#25D366", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                                📲 WA a todos
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
        <div
          style={{ padding: "40px", maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1 }}
          onClick={e => {
            if (e.target === e.currentTarget && textoPegado.trim()) {
              setConfirmarSalidaPagina(() => () => { setTextoPegado(""); });
            }
          }}
        >
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
        <div
          style={{ padding: "40px", maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 1 }}
          onClick={e => {
            if (e.target === e.currentTarget && sheetFilas.length > 1) {
              setConfirmarSalidaPagina(() => () => { setSheetFilas([]); });
            }
          }}
        >
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
                          <button className="btn-gold" style={{ padding: "8px 16px", fontSize: 11, opacity: guardando ? 0.5 : 1, cursor: guardando ? "not-allowed" : "pointer" }}
                            disabled={guardando}
                            onClick={() => {
                              if (guardando) return;
                              const d = importarFilaSheet(headers, fila);
                              setReservaEditando(null);
                              setForm(d);
                              setPendingSheetIdx(i + 1); // +1 porque slice(1)
                              setModalAbierto(true);
                            }}>
                            {guardando ? "⏳ Importando..." : "+ Importar"}
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
                            let horaStr = m ? `${m[4]}:${m[5]}` : "";
                            if (m) {
                              let h = parseInt(m[4]) + 1;
                              if (h >= 24) h = 0;
                              horaStr = `${String(h).padStart(2,"0")}:${m[5]}`;
                            }
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
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) { navegarConGuardia(() => setModalAbierto(false)); } }}>
          <div className="modal" style={{ padding: "24px 28px" }}>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 16 }}>
              {reservaEditando ? "Editar reserva" : "Nueva reserva"}
            </h2>
            <div className="modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

              {/* Cliente con búsqueda por texto + datalist */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Cliente *</label>
                <input
                  className="input-field"
                  list="lista-clientes"
                  value={form.nombre}
                  onChange={e => {
                    const val = e.target.value;
                    setForm(f => ({ ...f, nombre: val }));
                  }}
                  onBlur={e => {
                    const val = e.target.value;
                    const esDelDesplegable = nombresClientes.includes(val);
                    if (esDelDesplegable) {
                      const existente = reservas.find(r => r.nombre === val) || clientesArchivados.find(c => c.nombre === val);
                      if (existente) setForm(f => ({ ...f, nombre: existente.nombre, telefono: existente.telefono || "", email: existente.email || "", prefijo: existente.prefijo || "+34" }));
                    }
                  }}
                  placeholder="Escribe o busca un cliente..."
                  autoComplete="off"
                  style={{ padding: "7px 10px", fontSize: 13 }}
                />
                <datalist id="lista-clientes">
                  {nombresClientes.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Teléfono</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="input-field" value={form.prefijo ?? "+34"} onChange={e => setForm(f => ({ ...f, prefijo: e.target.value }))} autoComplete="off" style={{ width: 64, padding: "7px 8px", fontSize: 13 }} placeholder="+34" />
                  <input className="input-field" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value.replace(/\s/g, "") }))} autoComplete="off" style={{ padding: "7px 10px", fontSize: 13 }} />
                </div>
                {form.telefono && (() => {
                  const digits = form.telefono.replace(/\D/g, "");
                  if (digits.length !== 9) {
                    return (
                      <div style={{ marginTop: 5, padding: "4px 10px", borderRadius: 5, background: "#fff3e0", border: "1px solid #ffcc80", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12 }}>⚠️</span>
                        <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#e65100", fontWeight: 700, letterSpacing: 0.5 }}>
                          {digits.length < 9 ? "Número de teléfono corto" : "Número de teléfono largo"}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Email</label>
                <input className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="off" style={{ padding: "7px 10px", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Fecha *</label>
                <input type="date" className="input-field" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} autoComplete="off" style={{ padding: "7px 10px", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Hora *</label>
                <select className="input-field" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} style={{ padding: "7px 10px", fontSize: 13 }}>
                  <option value="">— Hora —</option>
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Nº de personas *</label>
                <input
                  type="number"
                  className="input-field"
                  min={1} max={40}
                  value={form.personas}
                  onChange={e => setForm(f => ({ ...f, personas: parseInt(e.target.value) || "" }))}
                  style={{ padding: "7px 10px", fontSize: 13 }}
                />
                {form.fecha && form.hora && (() => {
                  const turno = getTurno(form.hora);
                  const existing = reservas.filter(r =>
                    r.fecha === form.fecha &&
                    getTurno(r.hora) === turno &&
                    r.estado !== "cancelada" &&
                    r.id !== reservaEditando
                  );
                  const mesasExistentes = existing.reduce((sum, r) => sum + mesasParaPax(r.personas || 1), 0);
                  const mesasNuevas = form.personas ? mesasParaPax(form.personas) : 0;
                  const totalMesas = mesasExistentes + mesasNuevas;
                  let status = "ok";
                  if (totalMesas > 13) status = "completo";
                  else if (totalMesas > 11) status = "cuidado";
                  if (status === "ok") return null;
                  return (
                    <div style={{ marginTop: 6, padding: "5px 10px", borderRadius: 6, background: status === "completo" ? "#ffebee" : "#fff3e0", border: `1px solid ${status === "completo" ? "#ef9a9a" : "#ffcc80"}`, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{status === "completo" ? "🔴" : "⚠️"}</span>
                      <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, fontWeight: 700, color: status === "completo" ? "#b71c1c" : "#e65100", textTransform: "uppercase", letterSpacing: 1 }}>
                        {status === "completo" ? "COMPLETO" : "CUIDADO"}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Estado</label>
                <select className="input-field" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={{ padding: "7px 10px", fontSize: 13 }}>
                  <option value="tomada">Tomada</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="llego">Llegó</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Tomada por *</label>
                <select
                  className="input-field"
                  value={form.tomadaPor || ""}
                  onChange={e => setForm(f => ({ ...f, tomadaPor: e.target.value }))}
                  style={{ padding: "7px 10px", fontSize: 13 }}
                >
                  <option value="">— Seleccionar —</option>
                  {["RAMIRO","YAMILA","LUCIANA","SHENAY","JESSICA","JULIO","JENNIFER","OTRO"].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 9, marginBottom: 3 }}>Observaciones</label>
                <textarea className="input-field" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} style={{ resize: "vertical", padding: "7px 10px", fontSize: 13 }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, alignItems: "center" }}>
              <button className="btn-outline" style={{ padding: "8px 16px", fontSize: 11 }} onClick={() => navegarConGuardia(() => setModalAbierto(false))}>Cancelar</button>
              {form.telefono && (
                <BtnWhatsApp reserva={form} style={{ padding: "8px 16px" }} conTexto={true} />
              )}
              <button className="btn-gold" style={{ padding: "8px 20px", fontSize: 11 }} onClick={guardarReserva}>{reservaEditando ? "Guardar cambios" : "Tomar reserva"}</button>
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
                <BtnWhatsApp reserva={form} style={{ padding: "12px 20px" }} conTexto={true} />
              )}
              <button className="btn-gold" disabled={guardando} style={{ opacity: guardando ? 0.5 : 1 }} onClick={confirmarYGuardar}>
                {guardando ? "⏳ Guardando..." : "Sí, guardar reserva"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── PLANO ── */}
      {vista === "plano" && (() => {
        const U = 60;
        const PAD = 10;
        const CHAIR = 9;
        const R = 6;

        const MESAS_POS = [
          { id: 40, cx: 3.2, cy:  0.5, w: 0.8, h: 0.8 },
          { id: 41, cx: 4.5, cy:  0.5, w: 0.8, h: 0.8 },
          { id: 12, cx: 1,   cy: 1.7, w: 0.8, h: 0.8 },
          { id: 1,  cx: 3.2, cy: 1.7, w: 0.8, h: 0.8 },
          { id: 3,  cx: 4.5, cy: 1.7, w: 0.8, h: 0.8 },
          { id: 5,  cx: 5.8, cy: 1.7, w: 0.8, h: 0.8 },
          { id: 13, cx: 1,   cy: 2.6, w: 0.8, h: 0.8 },
          { id: 2,  cx: 3.2, cy: 2.6, w: 0.8, h: 0.8 },
          { id: 4,  cx: 4.5, cy: 2.6, w: 0.8, h: 0.8 },
          { id: 15, cx: 5.8, cy: 2.6, w: 0.8, h: 0.8 },
          { id: 18, cx: 3.2, cy: 3.9, w: 0.8, h: 0.8 },
          { id: 17, cx: 4.5, cy: 3.9, w: 0.8, h: 0.8 },
          { id: 16, cx: 5.8, cy: 3.9, w: 0.8, h: 0.8 },
          { id: 11, cx: 0.5,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 10, cx: 1.6,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 8,  cx: 3.2,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 7,  cx: 4.5,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 6,  cx: 5.8,  cy: 4.8, w: 0.8, h: 0.8 },
          { id: 30, cx: 3.2,  cy: 6.0, w: 0.8, h: 0.8, barra: true },
          { id: 31, cx: 4.5,  cy: 6.0, w: 0.8, h: 0.8, barra: true },
        ];

        const SVG_COLS = 6.1;
        const SVG_ROWS = 7.8;
        const VW = SVG_COLS * U + PAD * 2;
        const VH = SVG_ROWS * U + PAD * 2;

        const planoTurno = planoTurnoFiltro === "custom" ? "custom" : (planoTurnoFiltro === "todos" || planoTurnoFiltro === "mediodia") ? "t1" : planoTurnoFiltro;
        const reservasTurno = reservas.filter(r => {
          if (!planoFecha || r.fecha !== planoFecha) return false;
          if (r.estado === "cancelada") return false;
          if (planoTurno === "custom" && planoTurnoPersonalizado) {
            const [hD, mD] = planoTurnoPersonalizado.desde.split(":").map(Number);
            const [hH, mH] = planoTurnoPersonalizado.hasta.split(":").map(Number);
            const [hR, mR] = (r.hora || "00:00").split(":").map(Number);
            const minsR = hR * 60 + mR;
            return minsR >= hD * 60 + mD && minsR <= hH * 60 + mH;
          }
          return getTurno(r.hora) === planoTurno;
        });

        const mesaReserva = {};
        reservasTurno.forEach(r => {
          const ms = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
          ms.forEach(m => { mesaReserva[m] = r; });
        });

        const MERGE_GROUPS = [
          { ids: [8, 2, 18, 1], clampToFirst: true, clampHeight: 3.2, anchorBottom: true },
          { ids: [7, 17, 4, 3], clampToFirst: true, clampHeight: 3.2, anchorBottom: true },
          { ids: [6, 16, 15, 5], clampToFirst: true, clampHeight: 3.2, anchorBottom: true },
          { ids: [12, 13, 11, 10], clampToFirst: true, clampHeight: 3.2 },
          { ids: [5, 15, 16], clampToFirst: true, clampHeight: 2.1 },
          { ids: [6, 16, 15], clampToFirst: true, clampHeight: 2.1, anchorBottom: true },
          { ids: [3, 4, 17], clampToFirst: true, clampHeight: 2.1 },
          { ids: [7, 17, 4], clampToFirst: true, clampHeight: 2.1, anchorBottom: true },
          { ids: [1, 2, 18], clampToFirst: true, clampHeight: 2.1 },
          { ids: [8, 18, 2], clampToFirst: true, clampHeight: 2.1, anchorBottom: true },
          { ids: [12, 13, 11], clampToFirst: true, clampHeight: 2.1 },
          [1, 2], [3, 4], [5, 15], [12, 13],
          [8, 18], [7, 17], [6, 16],
          [11, 10],
          [40, 41],
          [30, 31],
        ];

        const reservaMergeGroup = {};
        reservasTurno.forEach(r => {
          const ms = new Set(r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []);
          if (ms.size < 2) return;
          for (const grp of MERGE_GROUPS) {
            const ids = Array.isArray(grp) ? grp : grp.ids;
            const unique = [...new Set(ids)];
            if (unique.every(m => ms.has(m))) {
              reservaMergeGroup[r.id] = Array.isArray(grp) ? unique : { ids: unique, clampToFirst: grp.clampToFirst, clampHeight: grp.clampHeight, anchorBottom: grp.anchorBottom };
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
          const clampHeight = mergeGroup && !Array.isArray(mergeGroup) ? mergeGroup.clampHeight : null;
          const anchorBottom = mergeGroup && !Array.isArray(mergeGroup) && mergeGroup.anchorBottom;
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
              mx = origMx; mw = origMw;
              mh = origMh;
              mergeIds.slice(1).forEach(secId => {
                const sec = MESAS_POS.find(p => p.id === secId);
                if (!sec) return;
                if (Math.abs(sec.cx - cx) < 0.7) {
                  const sy = PAD + sec.cy * U - (sec.h * U) / 2;
                  const y2 = Math.max(my + mh, sy + sec.h * U);
                  my = Math.min(my, sy);
                  mh = y2 - my;
                }
              });
              if (clampHeight) mh = Math.min(mh, clampHeight * U);
              if (anchorBottom) my = (PAD + cy * U + (h * U) / 2) - mh;
            }
          }

          const RR = 8;
          const labelMesa = MESA_NOMBRE[id] || String(id);
          const lineH = isMerged ? mh * 0.22 : (res ? mh * 0.28 : mh / 2 + 4);

          return (
            <g key={id} style={{ cursor: res ? "pointer" : "default" }}
              onClick={() => res && setPlanoModal({ reservaId: res.id, nombre: res.nombre, estado: res.estado, telefono: res.telefono || "", prefijo: res.prefijo || "" })}
              onMouseEnter={res && res.notas ? (e) => {
                const svgEl = e.currentTarget.closest("svg");
                const svgRect = svgEl.getBoundingClientRect();
                const containerRect = svgEl.parentElement.getBoundingClientRect();
                setHoveredMesa({
                  x: mx + mw / 2, y: my,
                  nota: res.notas,
                  nombre: res.nombre.split(" ")[0],
                  svgOffsetX: svgRect.left - containerRect.left,
                  svgOffsetY: svgRect.top - containerRect.top,
                  scaleX: svgRect.width / VW,
                  scaleY: svgRect.height / VH,
                });
              } : null}
              onMouseLeave={res && res.notas ? () => setHoveredMesa(null) : null}>
              <rect x={mx+1} y={my+2} width={mw} height={mh} rx={RR+1} fill="rgba(0,0,0,0.06)"/>
              <rect x={mx} y={my} width={mw} height={mh} rx={RR} fill={fill} stroke={stroke} strokeWidth={ocupada ? 2 : 1.2}/>
              <text x={mx + mw/2} y={my + lineH} textAnchor="middle"
                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: barra ? 11 : 13, fontWeight: 700, fill: textC, letterSpacing: 0.5 }}>
                {labelMesa}
              </text>
              {res && (
                <text x={mx + mw/2} y={my + mh * (isMerged ? 0.38 : 0.48)} textAnchor="middle"
                  style={{ fontFamily: "'Jost', sans-serif", fontSize: 7.5, fontWeight: 600, fill: textC, opacity: 0.85, letterSpacing: 0.5 }}>
                  {res.hora}
                </text>
              )}
              {res && (
                <text x={mx + mw/2} y={my + mh * (isMerged ? 0.58 : 0.68)} textAnchor="middle"
                  style={{ fontFamily: "'Jost', sans-serif", fontSize: 8, fontWeight: 500, fill: textC, letterSpacing: 0.3 }}>
                  {res.nombre.split(" ")[0]}
                </text>
              )}
              {res && (
                <text x={mx + mw/2} y={my + mh * (isMerged ? 0.80 : 0.88)} textAnchor="middle"
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
              <button className="btn-outline" style={{ borderColor: "#81c784", color: "#2e7d32", fontSize: 11 }} onClick={imprimirPlano}>🖨 Imprimir plano</button>
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
              <input type="date" className="input-field" style={{ width: 180 }}
                value={planoFecha} onChange={e => setPlanoFecha(e.target.value)} />
              <button
                onClick={() => setPlanoFecha(getTodayStr())}
                style={{
                  padding: "8px 14px", fontSize: 11, cursor: "pointer",
                  fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase",
                  border: `1px solid ${planoFecha === getTodayStr() ? "#1b5e20" : "#81c784"}`,
                  background: planoFecha === getTodayStr() ? "#1b5e20" : "none",
                  color: planoFecha === getTodayStr() ? "#fff" : "#2e7d32",
                  borderRadius: 4, transition: "all 0.2s", fontWeight: 500
                }}>Hoy</button>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { key: "t1",    label: "1º Turno" },
                  { key: "t2",    label: "2º Turno" },
                  { key: "noche", label: "Noche" },
                ].map(t => (
                  <button key={t.key} onClick={() => setPlanoTurnoFiltro(t.key)}
                    style={{ padding: "8px 14px", fontSize: 11, cursor: "pointer", fontFamily: "'Jost', sans-serif",
                      letterSpacing: 1, textTransform: "uppercase",
                      border: `1px solid ${planoTurno === t.key ? "#1b5e20" : "#81c784"}`,
                      background: planoTurno === t.key ? "#1b5e20" : "none",
                      color: planoTurno === t.key ? "#fff" : "#2e7d32",
                      borderRadius: 4, transition: "all 0.2s" }}>
                    {t.label}
                  </button>
                ))}
                <button
                  onClick={() => setPlanoTurnoModalAbierto(true)}
                  style={{ padding: "8px 14px", fontSize: 11, cursor: "pointer", fontFamily: "'Jost', sans-serif",
                    letterSpacing: 1, textTransform: "uppercase",
                    border: `1px solid ${planoTurno === "custom" ? "#1b5e20" : "#81c784"}`,
                    background: planoTurno === "custom" ? "#1b5e20" : "none",
                    color: planoTurno === "custom" ? "#fff" : "#2e7d32",
                    borderRadius: 4, transition: "all 0.2s" }}>
                  {planoTurno === "custom" && planoTurnoPersonalizado
                    ? `${planoTurnoPersonalizado.desde} – ${planoTurnoPersonalizado.hasta}`
                    : "Turno?"}
                </button>
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
              <div style={{ position: "relative", display: "inline-block", width: "100%", maxWidth: 640 }}>
                <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", display: "block", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>
                  <defs>
                    <filter id="mesaShadow" x="-15%" y="-15%" width="130%" height="130%">
                      <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1b5e20" floodOpacity="0.18"/>
                    </filter>
                    <pattern id="floorGrid" x="0" y="0" width={U*0.5} height={U*0.5} patternUnits="userSpaceOnUse">
                      <path d={`M ${U*0.5} 0 L 0 0 0 ${U*0.5}`} fill="none" stroke="#e8f5e9" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect x={0} y={0} width={VW} height={VH} fill="#f4faf4" rx={12}/>
                  <rect x={0} y={0} width={VW} height={VH} fill="url(#floorGrid)" rx={12}/>
                  <line x1={PAD + 0.2*U} y1={PAD + 1.15*U} x2={PAD + 6.5*U} y2={PAD + 1.15*U} stroke="#c8e6c9" strokeWidth={0.8} strokeDasharray="5 5" opacity="0.7"/>
                  {MESAS_POS.map(m => <MesaSVG key={m.id} mesa={m} />)}
                </svg>
                {hoveredMesa && (() => {
                  const px = (hoveredMesa.svgOffsetX || 0) + hoveredMesa.x * (hoveredMesa.scaleX || 1);
                  const py = (hoveredMesa.svgOffsetY || 0) + hoveredMesa.y * (hoveredMesa.scaleY || 1) - 12;
                  return (
                    <div style={{
                      position: "absolute", left: px, top: py,
                      transform: "translate(-50%, -100%)",
                      background: "#1a2e1a", color: "#fff", borderRadius: 6,
                      padding: "7px 12px", fontFamily: "'Jost', sans-serif",
                      fontSize: 12, letterSpacing: 0.3, maxWidth: 200,
                      whiteSpace: "pre-wrap", pointerEvents: "none", zIndex: 20,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.25)", lineHeight: 1.5,
                    }}>
                      <span style={{ fontSize: 10, color: "#81c784", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 3 }}>
                        {hoveredMesa.nombre} · nota
                      </span>
                      {hoveredMesa.nota}
                      <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1a2e1a" }} />
                    </div>
                  );
                })()}
              </div>
              {!planoFecha && (
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#9e9e9e", marginTop: 12 }}>
                  Selecciona una fecha para ver la ocupación.
                </p>
              )}
            </div>

            {/* ── LISTADO DEBAJO DEL PLANO ── */}
            {planoFecha && reservasTurno.length > 0 && (
              <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #c8e6c9" }}>
                      {["Hora", "Cliente", "Pax", "Mesa", "Estado", "Notas", ""].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...reservasTurno].sort((a, b) => (a.hora || "").localeCompare(b.hora || "")).map(r => {
                      const raw = String(r.telefono || "").trim();
                      const prefijo = String(r.prefijo || "").trim();
                      const preDigits = prefijo.replace(/\D/g, "");
                      const numDigits = raw.replace(/\D/g, "");
                      const tel = preDigits ? preDigits + numDigits : "34" + numDigits;
                      const firstName = r.nombre.split(" ")[0];
                      const msg = encodeURIComponent(`Hola ${firstName}!\n\nTe escribimos porque en este momento *tenemos una mesa disponible.*\nSi te interesa venir antes de tu horario, respóndenos a este mensaje y te la guardamos.\nDe lo contrario, nos vemos a la hora de tu reserva\n\n \n¡Buenas y santas!`);
                      const turnoR = getTurno(r.hora);
                      const mesasOcupadasEnTurno = reservas.filter(x => x.id !== r.id && getTurno(x.hora) === turnoR && x.fecha === r.fecha && x.estado !== "cancelada").flatMap(x => x.mesas || (x.mesa ? [x.mesa] : []));
                      const mesasActuales = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #c8e6c9" }}>
                          <td style={{ padding: "10px 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: "#1b5e20" }}>{r.hora}</td>
                          <td style={{ padding: "10px 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: "#1a2e1a" }}>{r.nombre}</td>
                          <td style={{ padding: "10px 16px", fontFamily: "'Jost', sans-serif", fontSize: 13, color: "#4a7a4a" }}>{r.personas} pax</td>
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {mesasActuales.map(m => (
                                <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#2e7d32", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12, fontFamily: "'Jost', sans-serif", width: "fit-content" }}>
                                  {getMesaNombre(m)}
                                  <button type="button" onClick={() => fbSetReserva({ ...r, mesas: mesasActuales.filter(v => v !== m) })}
                                    style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
                                </span>
                              ))}
                              <select
                                style={{ fontSize: 11, padding: "3px 6px", border: "1px solid #a5d6a7", borderRadius: 4, background: "#fff", color: "#2e7d32", fontFamily: "'Jost', sans-serif", cursor: "pointer", marginTop: 2 }}
                                value=""
                                onChange={e => {
                                  const val = parseInt(e.target.value);
                                  if (!val) return;
                                  const curr = r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : [];
                                  if (!curr.includes(val) && curr.length < 8) fbSetReserva({ ...r, mesas: [...curr, val] });
                                }}
                              >
                                <option value="">+ mesa</option>
                                {getMesasDisponibles(mesasActuales, mesasOcupadasEnTurno).map(m => <option key={m} value={m}>{getMesaNombre(m)}</option>)}
                              </select>
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px" }}>
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
                          <td style={{ padding: "10px 16px", fontFamily: "'Jost', sans-serif", fontSize: 12, color: "#4a7a4a", maxWidth: 200 }}>{r.notas || "—"}</td>
                          <td style={{ padding: "10px 16px" }}>
                            {r.telefono && (
                              <a href={`https://wa.me/${tel}?text=${msg}`} target="_blank" rel="noreferrer"
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#25d366", borderRadius: 6, color: "#fff", textDecoration: "none" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Botones asignar/borrar mesas del turno */}
                <div style={{ padding: "12px 16px", borderTop: "1px solid #c8e6c9" }}>
                  {(() => {
                    const mesasOcupadas = reservasTurno.flatMap(r => r.mesas && r.mesas.length > 0 ? r.mesas : r.mesa ? [r.mesa] : []);
                    const mesasLibres = MESAS.filter(m => !mesasOcupadas.includes(m) && m !== 30 && m !== 31);
                    return (
                      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", fontWeight: 600 }}>
                          Mesas libres ({mesasLibres.length}):
                        </span>
                        {mesasLibres.length === 0
                          ? <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, color: "#b71c1c", fontWeight: 700 }}>Ninguna</span>
                          : mesasLibres.map(m => (
                            <span key={m} style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, background: "#e8f5e9", border: "1px solid #81c784", borderRadius: 4, padding: "2px 8px", color: "#2e7d32", fontWeight: 500 }}>
                              {getMesaNombre(m)}
                            </span>
                          ))
                        }
                      </div>
                    );
                  })()}
                  <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => asignarMesasTurno(planoFecha, planoTurno)}
                    style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                  >✦ Asignar mesas</button>
                  <button
                    onClick={() => borrarMesasTurno(planoFecha, planoTurno)}
                    style={{ padding: "6px 14px", fontSize: 11, fontFamily: "'Jost', sans-serif", letterSpacing: 1, textTransform: "uppercase", background: "none", color: "#b71c1c", border: "1px solid #ef9a9a", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}
                  >✕ Borrar mesas</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}


      {/* ── MODAL TURNO PERSONALIZADO ── */}
      {turnoModalAbierto && (
        <div className="overlay" style={{ zIndex: 60 }} onClick={e => e.target === e.currentTarget && setTurnoModalAbierto(false)}>
          <div className="modal" style={{ maxWidth: 360, padding: "36px 32px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Filtro personalizado</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginBottom: 28 }}>¿Qué turno?</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              <div>
                <label style={{ marginBottom: 8 }}>Desde</label>
                <select
                  className="input-field"
                  value={turnoDesde}
                  onChange={e => setTurnoDesde(e.target.value)}
                >
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label style={{ marginBottom: 8 }}>Hasta</label>
                <select
                  className="input-field"
                  value={turnoHasta}
                  onChange={e => setTurnoHasta(e.target.value)}
                >
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn-outline" onClick={() => setTurnoModalAbierto(false)}>Cancelar</button>
              <button
                className="btn-gold"
                onClick={() => {
                  setTurnoPersonalizado({ desde: turnoDesde, hasta: turnoHasta });
                  setFiltroTurno("custom");
                  setTurnoModalAbierto(false);
                }}
              >
                Ver reservas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PLANO ESTADO MODAL ── */}
      {planoModal && (
        <div className="overlay" style={{ zIndex: 60 }} onClick={e => e.target === e.currentTarget && setPlanoModal(null)}>
          <div className="modal" style={{ maxWidth: 340, padding: "36px 32px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Cambiar estado</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>{planoModal.nombre}</h2>

            {/* ── WhatsApp justo debajo del nombre ── */}
            {planoModal.telefono && (() => {
              const digits = planoModal.telefono.replace(/\D/g, '');
              const preDigits = (planoModal.prefijo || "34").replace(/\D/g, '');
              const tel = preDigits + digits;
              const firstName = planoModal.nombre.split(' ')[0];
              const msg = encodeURIComponent(`Hola ${firstName}!\n\nTe escribimos porque en este momento *tenemos una mesa disponible.*\nSi te interesa venir antes de tu horario, respóndenos a este mensaje y te la guardamos.\nDe lo contrario, nos vemos a la hora de tu reserva\n\n \n¡Buenas y santas!`);
              return (
                <a href={`https://wa.me/${tel}?text=${msg}`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    marginBottom: 20, padding: "10px 20px", background: "#25d366", color: "#fff",
                    borderRadius: 6, fontFamily: "'Jost', sans-serif", fontSize: 12,
                    letterSpacing: 1, textTransform: "uppercase", textDecoration: "none",
                    fontWeight: 600, cursor: "pointer" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              );
            })()}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { value: "tomada",     label: "Tomada",     bg: "#fff8e1", color: "#f57f17", border: "#ffcc02" },
                { value: "confirmada", label: "Confirmada", bg: "#e8f5e9", color: "#1b5e20", border: "#81c784" },
                { value: "llego",      label: "Llegó",      bg: "#f3e5f5", color: "#6a1b9a", border: "#ce93d8" },
                { value: "cancelada",  label: "Cancelada",   bg: "#ffebee", color: "#c62828", border: "#ef9a9a" },
              ].map(op => (
                <button key={op.value}
                  onClick={() => {
                    const r = reservas.find(r => r.id === planoModal.reservaId);
                    if (r) fbSetReserva({ ...r, estado: op.value });
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
            <button className="btn-outline" style={{ marginTop: 10, width: "100%", color: "#888", borderColor: "#ccc", fontSize: 11 }} onClick={() => setPlanoModal(null)}>Salir</button>
          </div>
        </div>
      )}

      {/* ── MODAL TURNO PERSONALIZADO (PLANO) ── */}
      {planoTurnoModalAbierto && (
        <div className="overlay" style={{ zIndex: 60 }} onClick={e => e.target === e.currentTarget && setPlanoTurnoModalAbierto(false)}>
          <div className="modal" style={{ maxWidth: 360, padding: "36px 32px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a7a4a", textTransform: "uppercase", marginBottom: 8 }}>Filtro personalizado</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginBottom: 28 }}>¿Qué turno?</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              <div>
                <label style={{ marginBottom: 8 }}>Desde</label>
                <select className="input-field" value={planoTurnoDesde} onChange={e => setPlanoTurnoDesde(e.target.value)}>
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label style={{ marginBottom: 8 }}>Hasta</label>
                <select className="input-field" value={planoTurnoHasta} onChange={e => setPlanoTurnoHasta(e.target.value)}>
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn-outline" onClick={() => setPlanoTurnoModalAbierto(false)}>Cancelar</button>
              <button className="btn-gold" onClick={() => {
                setPlanoTurnoPersonalizado({ desde: planoTurnoDesde, hasta: planoTurnoHasta });
                setPlanoTurnoFiltro("custom");
                setPlanoTurnoModalAbierto(false);
              }}>Ver plano</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL GUARDIA PEGAR / SHEET ── */}
      {confirmarSalidaPagina && (
        <div className="overlay" style={{ zIndex: 70 }}>
          <div className="modal" style={{ maxWidth: 420, textAlign: "center", padding: "48px 40px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
              ¿Salir sin guardar?
            </h2>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: "#4a7a4a", marginBottom: 32, lineHeight: 1.6 }}>
              {vista === "pegar" ? "Tienes un mensaje sin interpretar. Si sales ahora se perderá." : "Tienes reservas cargadas. Si sales ahora se perderán."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn-outline" onClick={() => setConfirmarSalidaPagina(null)}>Volver</button>
              <button
                onClick={() => { confirmarSalidaPagina(); setConfirmarSalidaPagina(null); }}
                style={{ padding: "12px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", background: "#fff", color: "#c62828", border: "1.5px solid #ef9a9a", borderRadius: 4 }}>
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmarSalida && (
        <div className="overlay" style={{ zIndex: 70 }}>
          <div className="modal" style={{ maxWidth: 420, textAlign: "center", padding: "48px 40px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
              ¿Has pasado la reserva?
            </h2>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, color: "#4a7a4a", marginBottom: 32, lineHeight: 1.6 }}>
              Tienes una reserva en curso. Si sales ahora se perderán los datos.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn-outline" onClick={() => setConfirmarSalida(null)}>
                Volver
              </button>
              <button className="btn-gold" onClick={guardarReserva}>
                Tomar reserva
              </button>
              <button
                onClick={() => { setModalAbierto(false); confirmarSalida(); setConfirmarSalida(null); }}
                style={{ padding: "12px 20px", fontFamily: "'Jost', sans-serif", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer", background: "#fff", color: "#c62828", border: "1.5px solid #ef9a9a", borderRadius: 4 }}>
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.tipo}`}>{toast.msg}</div>}
    </div>
  );
}
