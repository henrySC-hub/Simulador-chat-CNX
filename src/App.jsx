// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

// ================== Firebase (coloca tu config) ==================
// Si ya lo inicializas en otro archivo, importa `db` desde allí y
// borra este bloque de inicialización.
const firebaseConfig = {
  // TODO: pega tu firebaseConfig aquí (apiKey, authDomain, projectId, etc.)
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================== Constantes ==================
const palette = [
  "#0f172a", // negro-azul
  "#1d4ed8",
  "#0ea5e9",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#22c55e",
  "#2563eb",
  "#fb7185",
];

// Plantillas rápidas para el Agente
const AGENT_TEMPLATES = [
  "Hola, soy del soporte CNX. ¿En qué puedo ayudarte?",
  "¿Podrías indicarme tu ID de cliente y el número de ticket?",
  "He escalado tu caso al área técnica; te avisaremos por este chat.",
  "¿Puedes reiniciar el equipo y confirmarme si las luces quedan en verde?",
  "Gracias por contactarnos. Cierro el caso, pero si necesitas algo más, escribe aquí.",
];

// ================== Utilidades ==================
function parseHash() {
  // #/agente  #/moderador  #/?room=algo
  const h = window.location.hash.replace(/^#\/?/, "").trim();
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  const room = params.get("room") || "";
  const role =
    path === "agente" || path === "agent"
      ? "agent"
      : path === "moderador" || path === "moderator"
      ? "moderator"
      : null;
  return { room, role };
}

function shortName(name) {
  const t = (name || "").trim();
  if (!t) return "??";
  const parts = t.split(/\s+/);
  if (parts.length === 1) return t[0]?.toUpperCase() ?? "A";
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ================== Componentes ==================
function RolePanel({ title, autoNote, state, setState, onExit, isAgent }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-neutral-200 p-4">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-full grid place-items-center text-white text-sm font-semibold"
          style={{ background: state.color }}
          title={state.name}
        >
          {shortName(state.name)}
        </div>
        <div>
          <div className="text-base font-semibold">
            {title}{" "}
            <span className="text-xs text-neutral-400 align-middle">(auto)</span>
          </div>
          <div className="text-xs text-neutral-500">
            Elige nombre y color. Pulsa Entrar.
          </div>
        </div>
      </div>

      <label className="text-sm text-neutral-700">Nombre</label>
      <input
        className="w-full mt-1 mb-3 rounded-md border px-3 py-2"
        placeholder={title}
        value={state.name}
        onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
      />

      <div className="text-sm text-neutral-700 mb-1">Color</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {palette.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setState((s) => ({ ...s, color: c }))}
            className="w-6 h-6 rounded-md ring-offset-2 focus:ring-2"
            style={{ background: c, outline: state.color === c ? "2px solid #111" : "none" }}
            title={c}
          />
        ))}
      </div>

      <div className="flex gap-2">
        {!state.joined ? (
          <button
            type="button"
            className="px-3 py-2 rounded-md bg-black text-white hover:bg-neutral-800"
            onClick={() => setState((s) => ({ ...s, joined: true }))}
          >
            Entrar
          </button>
        ) : (
          <button
            type="button"
            className="px-3 py-2 rounded-md border border-neutral-300 hover:bg-neutral-100"
            onClick={onExit}
          >
            Salir
          </button>
        )}

        {autoNote && (
          <span className="text-xs text-neutral-400 self-center">{autoNote}</span>
        )}
      </div>
    </div>
  );
}

function QuickTemplates({ onUse }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {AGENT_TEMPLATES.map((t, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onUse(t)}
          className="text-xs rounded-full bg-neutral-200 hover:bg-neutral-300 px-2 py-1"
          title={t}
        >
          {t.length > 28 ? t.slice(0, 28) + "…" : t}
        </button>
      ))}
    </div>
  );
}

// ================== App ==================
export default function App() {
  // Room y hash
  const [roomId, setRoomId] = useState(parseHash().room || ""); // por defecto vacío
  const [forcedRole, setForcedRole] = useState(parseHash().role);

  // Estados de los roles
  const [agent, setAgent] = useState({
    name: "Agente",
    color: palette[0],
    joined: false,
  });
  const [moderator, setModerator] = useState({
    name: "Moderador",
    color: palette[1],
    joined: false,
  });

  // Mensajes y conexión
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [connError, setConnError] = useState("");

  // Drafts y refs para inputs
  const [agentDraft, setAgentDraft] = useState("");
  const [moderatorDraft, setModeratorDraft] = useState("");
  const agentInputRef = useRef(null);
  const modInputRef = useRef(null);

  // ---- Suscripción a Firestore ----
  useEffect(() => {
    setMessages([]);
    setConnected(false);
    setConnError("");

    if (!roomId) return;

    const q = query(
      collection(db, "rooms", roomId, "msgs"),
      orderBy("at", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = [];
        snap.forEach((doc) => {
          const d = doc.data();
          arr.push({
            id: doc.id,
            text: d.text,
            nick: d.nick,
            color: d.color,
            from: d.from, // 'agent' | 'moderator'
            at: d.at?.toDate ? d.at.toDate().toISOString() : new Date().toISOString(),
          });
        });
        setMessages(arr);
        setConnected(true);
        setConnError("");
      },
      (e) => {
        console.error("onSnapshot error", e);
        setConnected(false);
        setConnError(e?.message || "Error conectando a Firestore");
      }
    );

    return () => unsub();
  }, [roomId]);

  // Mantener scroll al final cuando llegan mensajes
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Cambios de hash (#/agente, #/moderador, ?room=…)
  useEffect(() => {
    const onHash = () => {
      const p = parseHash();
      if (p.role !== forcedRole) setForcedRole(p.role || null);
      if (p.room && p.room !== roomId) setRoomId(p.room);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [forcedRole, roomId]);

  // ---- Enviar mensaje ----
  async function send(role, text) {
    const who = role === "agent" ? agent : moderator;
    if (!roomId || !text.trim() || !who.joined) return;
    try {
      await addDoc(collection(db, "rooms", roomId, "msgs"), {
        text: text.trim(),
        nick: who.name || role,
        color: who.color || "#111",
        from: role,
        at: serverTimestamp(),
      });
    } catch (e) {
      console.error("send error", e);
      alert("No se pudo enviar: " + (e?.message || e));
    }
  }

  // ---- UI helpers ----
  const showAgentPanel = forcedRole !== "moderator";
  const showModPanel = forcedRole !== "agent";

  const enterLink = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    const roomPart = roomId ? `?room=${encodeURIComponent(roomId)}` : "";
    return {
      agent: `${base}#/agente${roomPart}`,
      moderator: `${base}#/moderador${roomPart}`,
      generic: `${base}#/${roomPart}`,
    };
  }, [roomId]);

  const onExitAgent = () => {
    setAgent((s) => ({ ...s, joined: false }));
    window.location.hash = "/"; // volver al landing
  };
  const onExitModerator = () => {
    setModerator((s) => ({ ...s, joined: false }));
    window.location.hash = "/"; // volver al landing
  };

  // ======= Render =======
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-lg font-semibold leading-tight">
            SIMULADOR DE CHAT CNX
          </div>
          <div className="text-xs text-neutral-500">
            Sala:{" "}
            <span className="font-medium text-neutral-700">
              {roomId || "(sin sala)"}
            </span>
            <span className="ml-4">
              Enlaces:{" "}
              <a
                className="underline"
                href={enterLink.agent}
                title="Abrir como Agente"
              >
                Agente
              </a>{" "}
              ·{" "}
              <a
                className="underline"
                href={enterLink.moderator}
                title="Abrir como Moderador"
              >
                Moderador
              </a>
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 grid lg:grid-cols-12 gap-4">
        {/* Panel izquierdo: landing + roles */}
        <section className="lg:col-span-3 order-1 lg:order-none space-y-4">
          {/* Landing / selector de Room */}
          <div className="rounded-2xl bg-white shadow-sm border border-neutral-200 p-4">
            <div className="text-sm font-medium mb-2">
              ¿Eres agente o moderador?
            </div>
            <div className="text-xs text-neutral-500 mb-3">
              Elige tu rol y entrarás al chat. Puedes fijar la sala aquí abajo.
            </div>

            <label className="text-sm text-neutral-700">Room ID</label>
            <input
              className="w-full mt-1 mb-3 rounded-md border px-3 py-2"
              placeholder="(escribe una sala)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />

            <div className="flex gap-2">
              <a
                className="px-3 py-2 rounded-md bg-black text-white hover:bg-neutral-800 text-sm"
                href={enterLink.agent}
              >
                Entrar como Agente
              </a>
              <a
                className="px-3 py-2 rounded-md border border-neutral-300 hover:bg-neutral-100 text-sm"
                href={enterLink.moderator}
              >
                Entrar como Moderador
              </a>
            </div>

            <div className="text-xs text-neutral-500 mt-3">
              Comparte este enlace (genérico) y deja que cada uno elija:
              <div className="mt-1 break-all">{enterLink.generic}</div>
            </div>
          </div>

          {/* Panel Agente */}
          {showAgentPanel && (
            <RolePanel
              title="Agente"
              autoNote="(auto)"
              state={agent}
              setState={setAgent}
              onExit={onExitAgent}
              isAgent
            />
          )}

          {/* Panel Moderador */}
          {showModPanel && (
            <RolePanel
              title="Moderador"
              autoNote="(auto)"
              state={moderator}
              setState={setModerator}
              onExit={onExitModerator}
              isAgent={false}
            />
          )}
        </section>

        {/* Panel derecho: chat */}
        <section className="lg:col-span-9">
          <div
            ref={listRef}
            className="rounded-2xl bg-white shadow-sm border border-neutral-200 h-[70vh] overflow-y-auto p-4 space-y-3"
          >
            {/* Placeholders */}
            {!roomId ? (
              <div className="h-full grid place-items-center text-neutral-500 text-sm text-center px-6">
                Escribe un <b>Room ID</b> en el panel izquierdo para comenzar.
              </div>
            ) : messages.length === 0 && !connError ? (
              <div className="h-full grid place-items-center text-neutral-500 text-sm text-center px-6">
                {connected ? "Aún no hay mensajes. ¡Escribe desde alguno de los paneles!" : "Conectando..."}
              </div>
            ) : null}

            {/* Mensajes */}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  m.from === "agent"
                    ? "bg-neutral-100 self-start"
                    : "bg-black text-white ml-auto"
                }`}
                style={{ borderLeft: `4px solid ${m.color || "#111"}` }}
              >
                <div className="text-[11px] opacity-70 mb-0.5">{m.nick}</div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}

            {/* Error de conexión */}
            {!!connError && (
              <div className="mt-3 text-center text-red-600 text-sm">
                No se pudo conectar a Firestore: {connError}
              </div>
            )}
          </div>

          {/* Área de envío */}
          <div className="grid lg:grid-cols-2 gap-3 mt-3">
            {/* Agente */}
            <div className="rounded-xl border border-neutral-200 p-2">
              <div className="text-xs text-neutral-500 mb-1">
                {agent.joined
                  ? "Escribe como Agente:"
                  : "(Pulsa Entrar en el panel de Agente)"}
              </div>
              <div className="flex gap-2">
                <input
                  ref={agentInputRef}
                  className="flex-1 rounded-md border px-3 py-2"
                  placeholder="Escribe como Agente"
                  value={agentDraft}
                  onChange={(e) => setAgentDraft(e.target.value)}
                  disabled={!agent.joined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (agentDraft.trim()) {
                        send("agent", agentDraft);
                        setAgentDraft("");
                      }
                    }
                  }}
                />
                <button
                  className="px-3 py-2 rounded-md bg-black text-white hover:bg-neutral-800 disabled:opacity-40"
                  disabled={!agent.joined || !agentDraft.trim()}
                  onClick={() => {
                    send("agent", agentDraft);
                    setAgentDraft("");
                  }}
                >
                  Enviar
                </button>
              </div>

              {/* Templates rápidos del Agente */}
              <QuickTemplates
                onUse={(txt) => {
                  // Opción simple: reemplazar todo
                  // setAgentDraft(txt);

                  // Opción PRO: insertar donde esté el cursor
                  const el = agentInputRef.current;
                  if (!el) return setAgentDraft(txt);
                  const start = el.selectionStart ?? el.value.length;
                  const end = el.selectionEnd ?? el.value.length;
                  const value = el.value ?? "";
                  const next = value.slice(0, start) + txt + value.slice(end);
                  setAgentDraft(next);
                  // Devolver foco y cursor al final del insert
                  requestAnimationFrame(() => {
                    el.focus();
                    const pos = start + txt.length;
                    el.setSelectionRange(pos, pos);
                  });
                }}
              />
            </div>

            {/* Moderador */}
            <div className="rounded-xl border border-neutral-200 p-2">
              <div className="text-xs text-neutral-500 mb-1">
                {moderator.joined
                  ? "Escribe como Moderador:"
                  : "(Pulsa Entrar en el panel de Moderador)"}
              </div>
              <div className="flex gap-2">
                <input
                  ref={modInputRef}
                  className="flex-1 rounded-md border px-3 py-2"
                  placeholder="Escribe como Moderador"
                  value={moderatorDraft}
                  onChange={(e) => setModeratorDraft(e.target.value)}
                  disabled={!moderator.joined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (moderatorDraft.trim()) {
                        send("moderator", moderatorDraft);
                        setModeratorDraft("");
                      }
                    }
                  }}
                />
                <button
                  className="px-3 py-2 rounded-md bg-black text-white hover:bg-neutral-800 disabled:opacity-40"
                  disabled={!moderator.joined || !moderatorDraft.trim()}
                  onClick={() => {
                    send("moderator", moderatorDraft);
                    setModeratorDraft("");
                  }}
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400 mt-3 text-center">
            
          </div>
        </section>
      </main>
    </div>
  );
}
