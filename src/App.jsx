// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { AGENT_TEMPLATES_DB } from "./templates-agents";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  setDoc,
} from "firebase/firestore";

/* =========================
   1) CONFIG FIREBASE
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyA3GBVke-k06TtwB34uLqqowomD5W_vzxE",
  authDomain: "simulador-chat-cnx.firebaseapp.com",
  projectId: "simulador-chat-cnx",
  storageBucket: "simulador-chat-cnx.firebasestorage.app",
  messagingSenderId: "716129241539",
  appId: "1:716129241539:web:897b3e67784dd878919576",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================
   2) UTILES HASH (rol/sala)
   ========================= */
const DEFAULT_ROOM_ID = "";
const parseHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path, qs] = hash.split("?");
  const role =
    path === "agente" ? "agent" : path === "moderador" ? "moderator" : null;
  const params = new URLSearchParams(qs || "");
  const room = params.get("room") || "";
  return { role, room };
};
const setHash = (role, room) => {
  const base = role === "agent" ? "agente" : role === "moderator" ? "moderador" : "";
  const qs = room ? `?room=${encodeURIComponent(room)}` : "";
  window.location.hash = base ? `#/${base}${qs}` : `#/`;
};

/* =========================
   3) TEMPLATES RÁPIDAS (para buscador en ChatArea)
   ========================= */
const AGENT_TEMPLATES = [
  "¡Hola! Soy el agente de soporte, ¿en qué puedo ayudarte?",
  "¿Podrías brindarme más detalles del inconveniente?",
  "Enseguida reviso tu caso, gracias por la paciencia.",
  "Te comparto los pasos para solucionarlo:",
  "Gracias por contactarnos. ¿Quedó resuelto?",
];

/* =========================
   3.1) SNIPPETS (chips)
   ========================= */
const QUICK_SNIPPETS = {
  ayuda_extra:
    "Espero haber resuelto tu duda. ¿Hay algo más en lo que pueda ayudarte?",
  ausencia:
    "¿Sigues en línea? Si es así, con gusto puedo seguir ayudándote con tu solicitud. Si no recibo respuesta, tendré que cerrar el chat por ahora, pero no te preocupes, estaremos aquí para ayudarte en cualquier momento.",
  cierre_inactivo:
    "Como no recibí respuesta, cerraré el chat por ahora. Cuando necesites ayuda, puedes contactarnos; con gusto te asistiremos.",
  despedida:
    "Me alegra haber podido ayudarte. Si en algún momento necesitas algo más, estaremos aquí para lo que necesites; ¡no dudes en escribirnos!",
};

/* =========================
   3.2) REGLAS DE SUGERENCIAS (keywords -> Motivo3 / Local)
   ========================= */
const SUGGESTION_RULES = [
  { keywords: ["dispositivo dañado", "dañado", "no enciende", "pantalla rota"],
    m3: "Dispositivo Dañado", ml: "Verificar Go Droid" },

  { keywords: ["sin sonido", "no suena", "bajo volumen", "pelican"],
    m3: "Pregunta Sobre Funcionalidad", ml: "Verificar Pelican (Sin sonido)" },

  { keywords: ["cámara", "camara", "no escanea", "qr", "pelican cámara"],
    m3: "Pregunta Sobre Funcionalidad", ml: "Verificar Pelican (Cámara)" },

  { keywords: ["sin conexión", "no conecta", "internet", "wifi", "conexión", "latencia"],
    m3: "Problemas de conexión", ml: "Verificar GoWin" },

  { keywords: ["cambió sistema", "cambiar sistema", "nuevo pos", "fudo", "sistema de recepción"],
    m3: "Local cambió sistema de recepción", ml: "Instalación GoWeb" },

  { keywords: ["recambio", "reemplazo", "cambio de dispositivo"],
    m3: "Solicitud de recambio de dispositivo", ml: "Verificación de Pelican" },

  { keywords: ["cambiar banco", "cuenta bancaria", "cambio de cuenta", "cbu", "cci"],
    m3: "Solicitud de llamada Telefónica", ml: "Ruta correcta - Cambio de cuenta bancaria" },

  { keywords: ["baja", "dar de baja", "desactivar"],
    m3: "Solicitud de llamada Telefónica", ml: "Ruta correcta - Baja de la plataforma" },
];

/* =========================
   4) UI: CHIP COLOR
   ========================= */
const palette = ["#111827", "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#b91c1c"];

/* =========================
   5) CABECERA
   ========================= */
function Header({ roomId, isAgent }) {
  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold tracking-tight">
          <span className="text-neutral-700">SIMULADOR DE CHAT CNX</span>
          <span className="text-neutral-400"> · Sala: </span>
          <span className="text-neutral-500">{roomId || "—"}</span>
        </h1>
        <nav className="text-sm space-x-3">
          <a className={`underline ${isAgent ? "font-semibold" : ""}`} href="#/agente">Agente</a>
          <a className={`${!isAgent ? "font-semibold" : ""} underline`} href="#/moderador">Moderador</a>
        </nav>
      </div>
    </header>
  );
}

/* =========================
   LANDING (elegante + validaciones)
   ========================= */
function Landing({ roomDraft, setRoomDraft, onEnter }) {
  const [role, setRole] = useState(""); // 'agent' | 'moderator'
  const roomOk = roomDraft.trim().length > 0;
  const roleOk = !!role;
  const canEnter = roomOk && roleOk;

  const submit = () => { if (canEnter) onEnter(role); };

  return (
    <main className="relative min-h-[88vh] overflow-hidden bg-gradient-to-b from-neutral-50 via-white to-neutral-100">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-rose-200/40 blur-3xl" />

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            <span className="text-neutral-900">SIMULADOR DE CHAT CNX</span>
          </h1>
          <p className="mt-2 text-neutral-600">
            Ingrese el <b>ID ROOM</b> y seleccione su <b>rol</b> para continuar.
          </p>
        </div>

        <div className="card mt-10 p-6 md:p-8">
          <label className="block text-sm font-medium text-neutral-700 mb-2">ID ROOM</label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                className={[
                  "w-full rounded-xl border px-4 py-3 outline-none transition",
                  roomOk ? "focus:ring-2 focus:ring-indigo-500" : "focus:ring-2 focus:ring-rose-400",
                ].join(" ")}
                placeholder="CNX-123456"
                value={roomDraft}
                onChange={(e) => setRoomDraft(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                aria-invalid={!roomOk}
                aria-describedby="room-help"
              />
              {!roomOk && (
                <p id="room-help" className="mt-1 text-xs text-rose-600">
                  Ingresa un ID de sala para habilitar el ingreso.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium text-neutral-700 mb-2">Seleccione su rol</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("agent")}
                className={[
                  "rounded-xl border px-4 py-4 text-left transition",
                  role === "agent" ? "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50" : "hover:bg-neutral-50",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full grid place-items-center bg-indigo-600 text-white font-semibold">AG</div>
                  <div>
                    <div className="font-semibold">Agente</div>
                    <p className="text-xs text-neutral-500">Soporte / atención al partner.</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole("moderator")}
                className={[
                  "rounded-xl border px-4 py-4 text-left transition",
                  role === "moderator" ? "ring-2 ring-rose-500 border-rose-500 bg-rose-50" : "hover:bg-neutral-50",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full grid place-items-center bg-rose-500 text-white font-semibold">MO</div>
                  <div>
                    <div className="font-semibold">Moderador</div>
                    <p className="text-xs text-neutral-500">Revisión / coordinación del caso.</p>
                  </div>
                </div>
              </button>
            </div>
            {!roleOk && <p className="mt-2 text-xs text-rose-600">Selecciona tu rol para continuar.</p>}
          </div>

          <button
            onClick={submit}
            disabled={!canEnter}
            className={[
              "w-full mt-6 rounded-xl px-4 py-3 font-semibold transition",
              canEnter ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-neutral-200 text-neutral-500 cursor-not-allowed",
            ].join(" ")}
            title={!canEnter ? "Completa ID ROOM y selecciona rol" : "Ingresar"}
          >
            Ingresar
          </button>

          <p className="mt-3 text-center text-xs text-neutral-400">
            Tip: Enter para enviar si ya completaste ID ROOM y rol.
          </p>
        </div>
      </div>
    </main>
  );
}

/* ==========================================================
   5.1) MAPEOS — Motivo de contacto 3 -> Motivo de contacto local
   ========================================================== */
const MOTIVO3_OPCIONES = [
  "Configurar o cambiar",
  "Dispositivo Dañado",
  "Local cambió sistema de recepción",
  "Método de Transmisión Cambió",
  "Problemas de conexión",
  "Problemas con el Dispositivo",
  "Pregunta Sobre Funcionalidad",
  "Otros Problemas con la APP",
  "Solicitud de recambio de dispositivo",
  "Solicitud de llamada Telefónica",
];

const MOTIVO_LOCAL_POR_MOTIVO3 = {
  "Configurar o cambiar": ["Verificar integración", "vacío"],
  "Dispositivo Dañado": ["Verificar Go Droid"],
  "Local cambió sistema de recepción": ["Instalación GoWeb"],
  "Método de Transmisión Cambió": ["GoDroid App"],
  "Solicitud de recambio de dispositivo": ["Verificación de Pelican"],
  "Problemas de conexión": ["Verificar GoWin"],
  "Problemas con el Dispositivo": ["Serial POS Correcto", "Serial POS Incorrecto", "N/A"],
  "Pregunta Sobre Funcionalidad": ["Verificar Pelican (Sin sonido)", "Verificación de Pelican", "Verificar Pelican (Cámara)"],
  "Otros Problemas con la APP": ["Centralizar/Unificar", "Descentralizar/Desunificar"],
  "Solicitud de llamada Telefónica": [
    "Consultas finanzas",
    "Consultas finanzas - Early Life",
    "Integration Support -> Billing",
    "Integration Support -> Content",
    "Integration Support -> Order Live",
    "Integration Support -> PICS",
    "Integration Support -> Sales",
    "Integration Support -> Technical",
    "Tech a ps live - chat",
    "Tech a ps live - phone",
    "Ruta correcta - Actualizar email de facturación",
    "Ruta correcta - Baja de la plataforma",
    "Ruta correcta - Cambio de cuenta bancaria",
    "Ruta correcta - Cambio de dirección",
    "Ruta correcta - Cambio de Dueño",
    "Ruta correcta - Cambio de Razón Social",
    "Ruta correcta - Eliminar evaluaciones y opiniones",
    "Ruta correcta - Publicidad en la App",
    "Ruta correcta - Retiro en el local",
    "Ruta correcta - Solicitud de disputa",
    "Ruta correcta desde Claims a otro equipo",
    "Ruta feedback al rider",
    "Transferencia a otro equipo live",
  ],
};

/* =========================
   6) ROLE PANEL (con Proceso sugerido)
   ========================= */
function RolePanel({
  title,
  name,
  setName,
  color,
  setColor,
  onSalir,
  isAgent,
  templates = [], // no se usa, mantenido por compatibilidad
  draft,
  setDraft,
  onSend,
  roomId,
  messages, // <- para las sugerencias
}) {
  const [motivo3, setMotivo3] = useState("");
  const [motivoLocal, setMotivoLocal] = useState("");

  const opcionesLocal = useMemo(
    () => (motivo3 ? MOTIVO_LOCAL_POR_MOTIVO3[motivo3] || [] : []),
    [motivo3]
  );

  // Escucha del documento de la sala
  useEffect(() => {
    if (!roomId) return;
    const ref = doc(db, "rooms", roomId);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data() || {};
      setMotivo3(typeof d.motivo3 === "string" ? d.motivo3 : "");
      setMotivoLocal(typeof d.motivoLocal === "string" ? d.motivoLocal : "");
    });
    return () => unsub();
  }, [roomId]);

  const persist = async (m3, ml) => {
    if (!roomId || !isAgent) return;
    await setDoc(doc(db, "rooms", roomId), { motivo3: m3 || "", motivoLocal: ml || "" }, { merge: true });
  };

  const onChangeMotivo3 = async (e) => {
    const nextM3 = e.target.value;
    const arr = MOTIVO_LOCAL_POR_MOTIVO3[nextM3] || [];
    const nextML = arr[0] || "";
    setMotivo3(nextM3);
    setMotivoLocal(nextML);
    await persist(nextM3, nextML);
  };

  const onChangeMotivoLocal = async (e) => {
    const nextML = e.target.value;
    setMotivoLocal(nextML);
    await persist(motivo3, nextML);
  };

  // ===== Sugerencias a partir de mensajes del moderador =====
  const normalize = (s = "") =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const textoModerador = useMemo(() => {
    const last = (messages || [])
      .filter(m => (m.role || "").toLowerCase() === "moderator")
      .slice(-5)
      .map(m => m.text || "")
      .join(" ");
    return normalize(last);
  }, [messages]);

  const suggestions = useMemo(() => {
    if (!textoModerador) return [];
    const res = [];
    for (const rule of SUGGESTION_RULES) {
      const hits = [];
      for (const kw of rule.keywords) {
        const k = normalize(kw);
        if (k && textoModerador.includes(k)) hits.push(kw);
      }
      if (hits.length) res.push({ ...rule, score: hits.length, matches: hits });
    }
    const uniq = new Map();
    for (const r of res.sort((a, b) => b.score - a.score)) {
      const key = r.m3 + "|" + r.ml;
      if (!uniq.has(key)) uniq.set(key, r);
      if (uniq.size >= 3) break;
    }
    return Array.from(uniq.values());
  }, [textoModerador]);

  return (
    <section className="mt-6 md:mt-6 md:sticky md:top-4">
      {/* Perfil / Salir */}
      <div className="rounded-xl bg-white shadow-sm border p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full grid place-items-center text-white font-semibold"
               style={{ background: color || "#2563eb" }}>
            {name?.slice(0, 2)?.toUpperCase() || "US"}
          </div>
          <div>
            <div className="text-neutral-500 text-sm">Rol</div>
            <div className="font-semibold">{title}</div>
          </div>
        </div>

        <div className="text-sm text-neutral-500 mb-2">Elige nombre y color. Pulsa Salir.</div>

        <label className="block text-sm font-medium text-neutral-700 mb-1">Nombre</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder={title}
        />

        <div className="mt-3">
          <div className="text-sm font-medium text-neutral-700">Color</div>
          <div className="flex gap-2 mt-1">
            {palette.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border"
                style={{ background: c, outline: color === c ? "3px solid rgba(99,102,241,.5)" : "none" }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <button
          className="mt-3 w-full border rounded-md py-2 bg-white hover:bg-neutral-50"
          onClick={onSalir}
          title="Salir y volver a la página principal"
        >
          Salir
        </button>
      </div>

      {/* Motivo de contacto */}
      <div className="mt-5 rounded-xl bg-white shadow-sm border p-4">
        <h3 className="font-semibold mb-2">Motivo de contacto</h3>

        <label className="block text-sm font-medium text-neutral-700 mb-1">Motivo de contacto 3</label>
        <select
          value={motivo3}
          onChange={onChangeMotivo3}
          disabled={!isAgent}
          className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 mb-3 disabled:bg-neutral-100"
        >
          <option value="">Seleccione…</option>
          {MOTIVO3_OPCIONES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-neutral-700 mb-1">Motivo de contacto local</label>
        <select
          value={motivoLocal}
          onChange={onChangeMotivoLocal}
          disabled={!isAgent || (opcionesLocal.length === 0)}
          className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-neutral-100"
        >
          {opcionesLocal.length === 0 ? (
            <option value="">—</option>
          ) : (
            opcionesLocal.map((o) => <option key={o} value={o}>{o}</option>)
          )}
        </select>
      </div>

      {/* Proceso sugerido (reemplaza “Respuestas rápidas”) */}
      {isAgent && (
        <div className="mt-5 rounded-xl bg-white shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Proceso sugerido</h3>
            <span className="text-xs text-neutral-400">basado en el último mensaje del moderador</span>
          </div>

          {suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-400">Sin sugerencias por ahora.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {suggestions.map((sug, i) => (
                <div key={i} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {sug.m3} <span className="text-neutral-400">→</span>{" "}
                      <span className="text-neutral-700">{sug.ml}</span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      Palabras clave:{" "}
                      {sug.matches.map((m, idx) => (
                        <span key={idx} className="inline-block bg-neutral-100 rounded px-1.5 py-0.5 mr-1">{m}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700"
                    onClick={async () => {
                      setMotivo3(sug.m3);
                      setMotivoLocal(sug.ml);
                      await setDoc(doc(db, "rooms", roomId), { motivo3: sug.m3, motivoLocal: sug.ml }, { merge: true });
                    }}
                    title="Aplicar al motivo de contacto"
                  >
                    Aplicar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* =========================
   5.2) BUSCADOR DE PLANTILLAS (dropdown scrollable)
   ========================= */
function normalizeText(s = "") {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function tokenize(s = "") {
  const clean = normalizeText(s);
  return clean.match(/\p{L}+/gu) || [];
}
function scoreTemplate(queryTokens, tpl) {
  const inText = normalizeText(`${tpl.title} ${tpl.text}`);
  const inTags = (tpl.tags || []).map(normalizeText);
  let score = 0;
  for (const t of queryTokens) {
    if (!t) continue;
    if (inText.includes(t)) score += 2;
    if (inTags.some((tg) => tg.includes(t))) score += 3;
  }
  return score;
}

function TemplateAssist({ db, draft, setDraft }) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key === ";") {
        setOpen(true);
        setDropdownVisible(true);
        setTimeout(() => inputRef.current?.focus(), 10);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        setDropdownVisible(false);
        setSearch("");
        inputRef.current?.blur();
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setDropdownVisible(false);
        setSearch("");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const MIN = 2;
  const showResultsGate = normalizeText(search).length >= MIN;

  const results = useMemo(() => {
    if (!showResultsGate) return [];
    const tokens = tokenize(search).filter((w) => w.length > 1);
    return db
      .map((t) => ({ ...t, _score: scoreTemplate(tokens, t) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 50);
  }, [db, search, showResultsGate]);

  const insert = (tpl) => {
    setDraft((prev) => (prev ? `${prev} ${tpl.text}` : tpl.text));
    setDropdownVisible(false);
    setSearch("");
    inputRef.current?.blur();
  };

  if (!open) {
    return (
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-neutral-500">Plantillas</div>
        <button onClick={() => setOpen(true)} className="text-sm px-2 py-1 border rounded-md">
          Mostrar
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mb-3 rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDropdownVisible(true); }}
            onFocus={() => setDropdownVisible(true)}
            placeholder="Type to search, or CTRL + ; to browse template"
            className="w-full rounded-md border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {dropdownVisible && showResultsGate && results.length > 0 && (
            <div className="absolute left-0 right-0 z-10 mt-1 rounded-md border bg-white shadow max-h-60 overflow-y-auto">
              {results.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => insert(tpl)}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-100 focus:bg-neutral-100"
                >
                  <span className="text-sm">{tpl.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setSearch(draft || "");
            setDropdownVisible(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }}
          className="px-3 py-2 rounded-md border bg-neutral-50 hover:bg-neutral-100 text-sm"
          title="Sugerir en base a lo que estás escribiendo"
        >
          💡 Suggest templates
        </button>
      </div>

      {!showResultsGate && (
        <div className="text-sm text-neutral-400 mt-2">
          Escribe al menos <b>{MIN}</b> caracteres para ver coincidencias.
        </div>
      )}
      {showResultsGate && dropdownVisible && results.length === 0 && (
        <div className="text-sm text-neutral-400 mt-2">Sin resultados.</div>
      )}
    </div>
  );
}

/* =========================
   5.3) CHIPS RÁPIDOS (se mantienen en ChatArea)
   ========================= */
function QuickChips({ setDraft }) {
  const Chip = ({ label, onClick }) => (
    <button onClick={onClick} className="px-3 py-1 text-sm rounded-full border bg-white hover:bg-neutral-50">
      {label}
    </button>
  );
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      <Chip label="Ayuda extra" onClick={() => setDraft(QUICK_SNIPPETS.ayuda_extra)} />
      <Chip label="Ausencia" onClick={() => setDraft(QUICK_SNIPPETS.ausencia)} />
      <Chip label="Despedida" onClick={() => setDraft(QUICK_SNIPPETS.despedida)} />
      <Chip label="Cierre Inactivo" onClick={() => setDraft(QUICK_SNIPPETS.cierre_inactivo)} />
    </div>
  );
}

/* =========================
   5.4) CHAT AREA
   ========================= */
function ChatArea({ messages, role, draft, setDraft, onSend, canWrite, name, color }) {
  const listRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    if (!textRef.current) return;
    const el = textRef.current;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [draft]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  return (
    <section className="mt-6">
      <div ref={listRef} className="rounded-xl bg-white shadow-sm border h-[65vh] overflow-y-auto p-4">
        {messages.map((m) => {
          const currentRole = (role || "").toLowerCase();
          const msgRole = (m.role || "").toLowerCase();
          const alignRight = msgRole && currentRole && msgRole === currentRole;
          const initials = (m.nick || m.role || "?").slice(0, 2).toUpperCase();

          return (
            <div key={m.id} className="mb-4">
              <div className={`text-xs text-neutral-400 mb-1 ${alignRight ? "text-right" : "text-left"}`}>
                <span className="font-medium text-neutral-600">{m.nick || m.role}</span>
                <span> · </span>
                <span>{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>

              <div className={`flex items-start gap-2 ${alignRight ? "justify-end" : "justify-start"}`}>
                {!alignRight && (
                  <div
                    className="h-7 w-7 rounded-full grid place-items-center text-white text-xs font-semibold"
                    style={{ background: m.color || "#2563eb" }}
                    title={m.nick || m.role}
                  >
                    {initials}
                  </div>
                )}

                <div className={`max-w-[80%] rounded-xl px-3 py-2 ${alignRight ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-800"}`}>
                  {m.text}
                </div>

                {alignRight && (
                  <div
                    className="h-7 w-7 rounded-full grid place-items-center text-white text-xs font-semibold"
                    style={{ background: m.color || "#2563eb" }}
                    title={m.nick || m.role}
                  >
                    {initials}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {role === "agent" && (
        <>
          <QuickChips setDraft={setDraft} />
          <TemplateAssist db={AGENT_TEMPLATES_DB} draft={draft} setDraft={setDraft} />
        </>
      )}

      <div className="mt-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <textarea
              ref={textRef}
              disabled={!canWrite}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) onSend(draft.trim(), { nick: name, color });
                }
              }}
              placeholder={`Escribe como ${role === "agent" ? "Agente" : "Moderador"}`}
              rows={3}
              className={[
                "w-full rounded-xl border px-4 py-3",
                "outline-none focus:ring-2 leading-relaxed",
                "resize-none min-h-[96px] max-h-[200px] overflow-auto",
                canWrite ? "focus:ring-indigo-500 bg-white" : "bg-neutral-100 cursor-not-allowed",
              ].join(" ")}
            />
          </div>

          <button
            disabled={!canWrite || !draft.trim()}
            onClick={() => onSend(draft.trim(), { nick: name, color })}
            className={`self-center rounded-lg px-5 py-3 font-semibold ${
              !canWrite || !draft.trim()
                ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            Enviar
          </button>
        </div>

        <div className="mt-1 text-[11px] text-neutral-400">Enter para enviar · Shift+Enter para nueva línea</div>
      </div>
    </section>
  );
}

/* =========================
   7) APP
   ========================= */
export default function App() {
  const [forcedRole, setForcedRole] = useState(null);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);

  const [agentName, setAgentName] = useState("Agente");
  const [agentColor, setAgentColor] = useState(palette[1]);

  const [modName, setModName] = useState("Moderador");
  const [modColor, setModColor] = useState(palette[0]);

  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState("");

  const [draft, setDraft] = useState("");

  const role = forcedRole || "agent";
  const isAgent = role === "agent";

  // Listener del hash: asegura volver a landing con null
  useEffect(() => {
    const refresh = () => {
      const p = parseHash();
      setForcedRole(p.role || null);
      setRoomId(p.room || DEFAULT_ROOM_ID);
    };
    refresh();
    window.addEventListener("hashchange", refresh);
    return () => window.removeEventListener("hashchange", refresh);
  }, []);

  useEffect(() => {
    setMessages([]);
    setConnected(false);
    setConnError("");
    if (!roomId) return;

    const qref = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("at", "asc"),
      limit(500)
    );
    const unsub = onSnapshot(
      qref,
      (snap) => {
        const arr = [];
        snap.forEach((docu) => {
          const d = docu.data();
          arr.push({
            id: docu.id,
            text: d.text,
            nick: d.nick,
            color: d.color,
            role: d.role,
            at: d.at?.toDate ? d.at.toDate() : d.at || new Date().toISOString(),
          });
        });
        setMessages(arr);
        setConnected(true);
      },
      (e) => {
        setConnected(false);
        setConnError(e?.message || "Error conectando a Firestore (¿reglas de seguridad?)");
      }
    );
    return () => unsub();
  }, [roomId]);

  const send = async (text, meta = {}) => {
    if (!text) return;
    if (!roomId) return;
    const nick = isAgent ? agentName : modName;
    const color = isAgent ? agentColor : modColor;

    await addDoc(collection(db, "rooms", roomId, "messages"), {
      text,
      role,
      nick: meta.nick ?? nick,
      color: meta.color ?? color,
      at: serverTimestamp(),
    });
    setDraft("");
  };

  const [roomDraft, setRoomDraft] = useState("");
  const goEnter = (targetRole) => {
    const finalRoom = (roomDraft || roomId || "").trim();
    setHash(targetRole, finalRoom);
  };
  const salir = () => {
    setForcedRole(null);
    setRoomId(DEFAULT_ROOM_ID);
    setDraft("");
    setHash(null, "");
  };

  const agentLink = useMemo(() => {
    const r = roomId ? `?room=${encodeURIComponent(roomId)}` : "";
    return `#/agente${r}`;
  }, [roomId]);
  const modLink = useMemo(() => {
    const r = roomId ? `?room=${encodeURIComponent(roomId)}` : "";
    return `#/moderador${r}`;
  }, [roomId]);

  if (!forcedRole) {
    return (
      <>
        <Landing roomDraft={roomDraft} setRoomDraft={setRoomDraft} onEnter={goEnter} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header roomId={roomId} isAgent={isAgent} />

      <main className="max-w-6xl mx-auto px-4 pb-10">
        {connError && (
          <div className="mt-6 p-3 rounded-lg bg-red-50 text-red-700 border border-red-100">
            {connError}
          </div>
        )}

        <div className="md:flex md:gap-6">
          {/* Chat */}
          <div className={`flex-1 ${isAgent ? "md:order-2" : "md:order-1"}`}>
            <ChatArea
              messages={messages}
              role={role}
              draft={draft}
              setDraft={setDraft}
              onSend={(txt, meta) => send(txt, meta)}
              canWrite={Boolean(roomId)}
              name={isAgent ? agentName : modName}
              color={isAgent ? agentColor : modColor}
            />
          </div>

          {/* Panel */}
          <div className={`md:w-[320px] ${isAgent ? "md:order-1" : "md:order-2"}`}>
            <RolePanel
              title={isAgent ? "Agente" : "Moderador"}
              name={isAgent ? agentName : modName}
              setName={isAgent ? setAgentName : setModName}
              color={isAgent ? agentColor : modColor}
              setColor={isAgent ? setAgentColor : setModColor}
              onSalir={salir}
              isAgent={isAgent}
              templates={isAgent ? AGENT_TEMPLATES : []}
              draft={draft}
              setDraft={setDraft}
              onSend={(txt, meta) => send(txt, meta)}
              roomId={roomId}
              messages={messages}      // <- necesario para Proceso sugerido
            />

            <div className="mt-4 text-xs text-neutral-500">
              Enlaces: <a className="underline" href={agentLink}>Agente</a> ·{" "}
              <a className="underline" href={modLink}>Moderador</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
