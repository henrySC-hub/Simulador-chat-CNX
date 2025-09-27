<<<<<<< HEAD
# Simulador-chat-CNX
=======
# Simulador de Chat (Roles sin Auth)

## Archivos incluidos
- `src/App.jsx` — Interfaz del chat, roles Agente/Moderador, Firestore realtime.
- `src/main.jsx` — Bootstrap de React.
- `index.html` — Tailwind por CDN.
- `vite.config.js` — `base` para GitHub Pages.

## Uso
1. Copia estos archivos dentro de tu proyecto Vite + React.
2. En `index.html` ya está referenciado `src/main.jsx`.
3. `vite.config.js`: ajusta `base` al nombre real de tu repo (por ejemplo `/chat-simulador/`).

## Firebase (solo demo)
- Pega tu JSON de configuración en la UI del app.
- Usa reglas abiertas *solo para pruebas*:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## URL con contraseñas (opcional)
Añade al hash: `#ap=CLAVEAGENTE&mp=CLAVEMODERADOR&room=salita`

---
> Este login liviano **no es seguridad**, sólo diferencia roles.
>>>>>>> 4074789 (Primera versión del simulador de chat)
