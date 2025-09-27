import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";

// SIMULADOR DE CHAT — MODO RÁPIDO con URLs por rol
// -------------------------------------------------------------
// ✅ Firebase config embebido (una vez) — NO se pide en la UI
// ✅ Un solo Room ID (editable en código o vía hash ?room= )
// ✅ Dos URLs independientes:
//      • #/agente        → Página del Agente
//      • #/moderador     → Página del Moderador
//    (Hash routing para que funcione en GitHub Pages sin 404)
// ✅ En cada URL, el rol se auto-conecta y se oculta el otro panel
// ✅ También puedes usar solo la home (/) con ambos paneles visibles
// -------------------------------------------------------------

// 1) TU configuración de Firebase (pegada una vez)
const firebaseConfig = {
  apiKey: "AIzaSyA3GBVke-k06TtwB34uLqqowomD5W_vzxE",
  authDomain: "simulador-chat-cnx.firebaseapp.com",
  projectId: "simulador-chat-cnx",
  storageBucket: "simulador-chat-cnx.firebasestorage.app",
  messagingSenderId: "716129241539",
  appId: "1:716129241539:web:897b3e67784dd878919576"
};

// 2) Sala por defecto. Cambia aquí si quieres otra.
const DEFAULT_ROOM_ID = "sala-practica";

const DEFAULT_AGENT_COLOR = "#111827"; // gris oscuro
const DEFAULT_MOD_COLOR = "#2563eb";   // azul

function formatTime(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseHash() {
  // Soporta: #/agente?room=soporte1  |  #/moderador?room=...  |  #role=agent&room=...
  const raw = (window.location.hash || "").replace(/^#/, "");
  let role = null;
  let room = null;

  if (raw.startsWith("/")) {
    const [path, qs] = raw.slice(1).split("?");
    if (path === "agente") role = "agent";
    if (path === "moderador") role = "moderator";
    if (qs) {
      const p = new URLSearchParams(qs);
      room = p.get("room") || null;
    }
  } else if (raw.includes("=")) {
    const p = new URLSearchParams(raw);
    const r = p.get("role");
    if (r === "agent" || r === "agente") role = "agent";
    if (r === "moderator" || r === "moderador") role = "moderator";
    room = p.get("room") || null;
  }
  return { role, room };
}

function shareLink(role, roomId) {
  const base = window.location.origin + window.location.pathname + window.location.search;
  const path = role === "agent" ? "#/agente" : "#/moderador";
  const qs = roomId ? `?room=${encodeURIComponent(roomId)}` : "";
  return `${base}${path}${qs}`;
}

export default function ChatSim() {
  // 1) Lee rol y sala desde el hash (para URLs por rol)
  const init = parseHash();
  const [forcedRole, setForcedRole] = useState(init.role); // 'agent' | 'moderator' | null
  const [roomId, setRoomId] = useState(init.room ?? "");
  // Normaliza el room; si está vacío NO nos suscribimos para evitar mostrar chat
  const normalizedRoomId = (roomId || "").trim();
  const effectiveRoomId = normalizedRoomId || DEFAULT_ROOM_ID; // solo para fallback UI si lo necesitas
  const hasRoom = !!normalizedRoomId;

  // 2) Firebase init + suscripción a la sala
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);
  const fb = useRef({ app: null, db: null, unsub: null });
  const [connError, setConnError] = useState("");

  useEffect(() => {
    // init Firebase una vez
    if (!getApps().length) fb.current.app = initializeApp(firebaseConfig);
    else fb.current.app = getApps()[0];
    fb.current.db = getFirestore();
  }, []);

  useEffect(() => {
    if (!fb.current.db) return;
    // Si no hay room, desuscribe y limpia para no mostrar chat
    if (!hasRoom) {
      if (fb.current.unsub) fb.current.unsub();
      setMessages([]);
      setConnected(false);
      setConnError("");
      return;
    }
    if (fb.current.unsub) fb.current.unsub();

    const q = query(
      collection(fb.current.db, "rooms", normalizedRoomId, "messages"),
      orderBy("at", "asc"),
      limit(1000)
    );

    fb.current.unsub = onSnapshot(
      q,
      {
        next: (snap) => {
          const arr = [];
          snap.forEach((doc) => {
            const d = doc.data();
            const at = d.at?.toDate ? d.at.toDate().toISOString() : d.at || new Date().toISOString();
            arr.push({ id: doc.id, from: d.from, nick: d.nick, color: d.color, text: d.text, at });
          });
          setMessages(arr);
          setConnected(true);
          setConnError("");
        },
        error: (e) => {
          console.error("onSnapshot error", e);
          setConnected(false);
          setConnError(e?.message || "Error conectando a Firestore (¿reglas de seguridad?)");
        },
      }
    );

    return () => { if (fb.current.unsub) fb.current.unsub(); };
  }, [normalizedRoomId, hasRoom]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages]);

  // 3) Manejar cambios del hash (usuario cambia /agente ↔ /moderador o room)
  useEffect(() => {
    const onHash = () => {
      const p = parseHash();
      if (p.role !== forcedRole) setForcedRole(p.role || null);
      if (p.room && p.room !== roomId) setRoomId(p.room);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [forcedRole, roomId]);

  // 4) Estados de cada rol (solo uno se muestra cuando forcedRole está definido)
  const [agent, setAgent] = useState({ joined: !!(init.role === "agent"), name: "Agente", color: DEFAULT_AGENT_COLOR, draft: "" });
  const [mod, setMod] = useState({ joined: !!(init.role === "moderator"), name: "Moderador", color: DEFAULT_MOD_COLOR, draft: "" });

  useEffect(() => {
    if (forcedRole === "agent") setAgent((s) => ({ ...s, joined: true }));
    if (forcedRole === "moderator") setMod((s) => ({ ...s, joined: true }));
  }, [forcedRole]);

  async function send(role, payload) {
    if (!fb.current.db) return alert("Firebase no configurado correctamente");
    if (!hasRoom) return alert("Escribe un Room ID antes de enviar");
    const text = (payload.draft || "").trim();
    if (!text) return;
    try {
      await addDoc(collection(fb.current.db, "rooms", normalizedRoomId, "messages"), {
        from: role,
        nick: payload.name || (role === "agent" ? "Agente" : "Moderador"),
        color: payload.color || (role === "agent" ? DEFAULT_AGENT_COLOR : DEFAULT_MOD_COLOR),
        text,
        at: serverTimestamp(),
      });
      if (role === "agent") setAgent((s) => ({ ...s, draft: "" }));
      else setMod((s) => ({ ...s, draft: "" }));
    } catch (e) {
      console.error(e);
      alert("No se pudo enviar: " + (e.message || e));
    }
  }

  const palette = ["#111827", "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#b91c1c"];

  const agentLink = shareLink("agent", normalizedRoomId);
  const modLink = shareLink("moderator", normalizedRoomId);

  const showAgentPanel = !forcedRole || forcedRole === "agent";
  const showModPanel = !forcedRole || forcedRole === "moderator";

  return (
    <div className="w-full min-h-[90vh] bg-neutral-100 text-neutral-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-neutral-900 text-white grid place-items-center font-bold">💬</div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">SIMULADOR DE CHAT CNX</h1>
              <p className="text-xs text-neutral-500">Usa URLs por rol. Sin configuración.</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-500">Sala: <span className="font-medium">{normalizedRoomId || "—"}</span></div>
            <div className="text-[11px] text-neutral-500">
              Enlaces: <a className="underline" href={agentLink}>Agente</a> · <a className="underline" href={modLink}>Moderador</a>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-6xl mx-auto w-full px-4 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Paneles (se ocultan según URL) */}
        <section className="lg:col-span-3 space-y-4 order-2 lg:order-1">
          {!forcedRole ? (
            <LandingCard
              roomId={roomId}
              setRoomId={setRoomId}
              agentLink={agentLink}
              modLink={modLink}
            />
          ) : (
            <>
              {showAgentPanel && (
                <RolePanel
                  title="Agente"
                  role="agent"
                  state={agent}
                  setState={setAgent}
                  palette={palette}
                  autoNote={forcedRole === "agent" ? "(auto)" : undefined}
                />
              )}
              {showModPanel && (
                <RolePanel
                  title="Moderador"
                  role="moderator"
                  state={mod}
                  setState={setMod}
                  palette={palette}
                  autoNote={forcedRole === "moderator" ? "(auto)" : undefined}
                />
              )}
            </>
          )}
        </section>

        {/* Chat */}
        <section className="lg:col-span-9 order-1 lg:order-2">
          <div className="rounded-2xl bg-white shadow-sm border border-neutral-200 flex flex-col h-[70vh]">
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
  {
    !hasRoom ? (
      <div className="h-full w-full grid place-items-center text-neutral-500 text-sm text-center px-6">
        Escribe un <b>Room ID</b> en el panel izquierdo para comenzar.
      </div>
    ) : (
      (messages.length === 0 && !connError) && (
        <div className="h-full w-full grid place-items-center text-neutral-500 text-sm text-center px-6">
          {connected ? "Aún no hay mensajes. ¡Escribe desde alguno de los paneles!" : "Conectando..."}
        </div>
      )
    )
  }

  {connError && (
    <div className="h-full w-full grid place-items-center text-red-600 text-sm text-center px-6">
      <div className="max-w-md">
        <div className="font-semibold mb-1">No se pudo conectar a Firestore</div>
        <div className="text-red-500/90">{connError}</div>
        <div className="text-[11px] text-neutral-500 mt-2">
          Tip: en pruebas usa reglas abiertas en Firestore o crea la base en modo de prueba.
        </div>
      </div>
    </div>
  )}

  {messages.map((m) => (
    <MessageBubble
      key={m.id}
      align={m.from === "agent" ? "left" : "right"}
      name={m.nick || (m.from === "agent" ? "Agente" : "Moderador")}
      color={m.color || (m.from === "agent" ? DEFAULT_AGENT_COLOR : DEFAULT_MOD_COLOR)}
      text={m.text}
      time={formatTime(m.at)}
    />
  ))}
</div>


            {/* Entradas: si hay URL por rol, muestra SOLO una caja */}
            <div className="border-t border-neutral-200 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(!forcedRole || forcedRole === "agent") && (
                <InputBox
                  disabled={!agent.joined || !hasRoom}
                  label={agent.joined ? `Escribe como ${agent.name}` : "Agente: presiona Entrar"}
                  value={agent.draft}
                  onChange={(v) => setAgent((s) => ({ ...s, draft: v }))}
                  onSend={() => send("agent", agent)}
                  color={agent.color}
                />
              )}
              {(!forcedRole || forcedRole === "moderator") && (
                <InputBox
                  disabled={!mod.joined || !hasRoom}
                  label={mod.joined ? `Escribe como ${mod.name}` : "Moderador: presiona Entrar"}
                  value={mod.draft}
                  onChange={(v) => setMod((s) => ({ ...s, draft: v }))}
                  onSend={() => send("moderator", mod)}
                  color={mod.color}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="text-xs text-neutral-500 text-center py-3">
        Abre <code>#/agente</code> y <code>#/moderador</code> (mismo room) en dos PCs o dos tabs. Para cambiar de sala: añade <code>?room=soporte1</code>.
      </footer>
    </div>
  );
}

function LandingCard({ roomId, setRoomId, agentLink, modLink }) {
  return (
    <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-4">
      <h2 className="font-semibold mb-1">¿Eres agente o moderador?</h2>
      <p className="text-xs text-neutral-500 mb-3">Elige tu rol y entrarás al chat. Puedes fijar la sala aquí abajo.</p>
      <div className="mb-3">
        <label className="text-xs text-neutral-600">Room ID</label>
        <input
          className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-300"
          placeholder="Ej. soporte1"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={agentLink} className="px-3 py-2 rounded-xl text-center bg-neutral-900 text-white hover:opacity-90">Entrar como Agente</a>
        <a href={modLink} className="px-3 py-2 rounded-xl text-center border border-neutral-300 hover:bg-neutral-50">Entrar como Moderador</a>
      </div>
      <div className="text-[11px] text-neutral-500 mt-2">Comparte este enlace (genérico) y deja que cada uno elija: <code>#{"/"}</code>. Si quieres sala fija en el link: <code>#{"/?room=soporte1"}</code>.</div>
    </div>
  );
}

function RolePanel({ title, role, state, setState, palette, autoNote }) {
  const initials = useMemo(() => (state.name || title).slice(0, 2).toUpperCase(), [state.name, title]);
  return (
    <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl text-white grid place-items-center font-semibold" style={{ backgroundColor: state.color }}>{initials}</div>
        <div className="flex-1">
          <h2 className="font-semibold">{title} {autoNote ? <span className="text-xs text-neutral-400">{autoNote}</span> : null}</h2>
          <p className="text-xs text-neutral-500">Elige nombre y color. Pulsa Entrar.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-neutral-600">Nombre</label>
          <input
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-300"
            placeholder={title}
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          />
        </div>

        <ColorPicker color={state.color} setColor={(c) => setState((s) => ({ ...s, color: c }))} palette={palette} />

        <div className="flex gap-2">
          {!state.joined ? (
            <button onClick={() => setState((s) => ({ ...s, joined: true }))} className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white hover:opacity-90">Entrar</button>
          ) : (
            <button onClick={() => setState((s) => ({ ...s, joined: false, draft: "" }))} className="px-3 py-1.5 rounded-xl border border-neutral-300 hover:bg-neutral-50">Salir</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ color, setColor, palette }) {
  return (
    <div>
      <label className="text-xs text-neutral-600">Color</label>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        {palette.map((c) => (
          <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-lg border border-neutral-300" style={{ backgroundColor: c, outline: color === c ? "2px solid black" : "none" }} title={c} />
        ))}
        <input type="color" className="ml-1 w-10 h-6 rounded-lg border border-neutral-300" value={color} onChange={(e) => setColor(e.target.value)} title="Personalizar" />
      </div>
    </div>
  );
}

function MessageBubble({ align = "left", name, color, text, time }) {
  const isLeft = align === "left";
  return (
    <div className={`flex ${isLeft ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] flex ${isLeft ? "flex-row" : "flex-row-reverse"} items-end gap-2`}>
        {/* Avatar */}
        <div className="w-8 h-8 rounded-xl text-white grid place-items-center text-xs font-semibold shrink-0" style={{ backgroundColor: color }} title={name}>
          {name?.slice(0, 2).toUpperCase()}
        </div>
        {/* Bubble */}
        <div className={`${isLeft ? "bg-neutral-100" : "bg-neutral-900 text-white"} rounded-2xl px-3 py-2 shadow-sm border ${isLeft ? "border-neutral-200" : "border-neutral-800"}`}>
          <div className="text-xs opacity-70 mb-0.5">{name}</div>
          <div className="whitespace-pre-wrap text-sm">{text}</div>
          <div className={`text-[10px] mt-1 ${isLeft ? "text-neutral-500" : "text-neutral-300"}`}>{time}</div>
        </div>
      </div>
    </div>
  );
}

function InputBox({ disabled, label, value, onChange, onSend, color }) {
  return (
    <div className={`rounded-xl border ${disabled ? "border-neutral-200 bg-neutral-50" : "border-neutral-300 bg-white"} p-2`}>
      <div className="text-xs mb-1 text-neutral-600 flex items-center justify-between">
        <span>{label}</span>
        {disabled && <span className="italic text-neutral-400">(Pulsa Entrar en el panel)</span>}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          disabled={disabled}
          rows={2}
          className="flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-300 disabled:opacity-60"
          placeholder={disabled ? "" : "Escribe y presiona Enter (Shift+Enter = salto)"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button
          disabled={disabled || !value.trim()}
          onClick={onSend}
          className="px-3 py-2 rounded-xl text-white disabled:opacity-50"
          style={{ backgroundColor: color }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
