# 🍽️ Reservas — Panel de Gestión

App de reservas para restaurante con integración Google Sheets.

---

## 🚀 Cómo subir a GitHub Pages (5 minutos)

### Paso 1 — Crea una cuenta en GitHub
Ve a [github.com](https://github.com) y crea una cuenta gratuita si no tienes.

### Paso 2 — Crea un repositorio nuevo
1. Pulsa el botón verde **"New"** o ve a [github.com/new](https://github.com/new)
2. Nombre: `reservas-restaurante`
3. Deja todo lo demás por defecto
4. Pulsa **"Create repository"**

### Paso 3 — Sube los archivos
En la página del repositorio vacío verás un enlace **"uploading an existing file"**.
1. Pulsa ese enlace
2. **Arrastra toda la carpeta `reservas-app`** o sube los archivos uno a uno
3. Pulsa **"Commit changes"**

### Paso 4 — Instala y despliega (necesitas Node.js)
Si tienes Node.js instalado, abre una terminal en la carpeta del proyecto:

```bash
npm install
npm run deploy
```

Esto construye la app y la sube automáticamente a GitHub Pages.

### Paso 5 — Activa GitHub Pages
1. Ve a tu repositorio → **Settings** → **Pages**
2. En "Source" selecciona la rama **`gh-pages`**
3. Pulsa **Save**

Tu app estará en: `https://TU_USUARIO.github.io/reservas-restaurante`

---

## ⚡ Alternativa más rápida — Netlify Drop

Si no quieres usar terminal:
1. Abre [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta `dist` (después de hacer `npm run build`)
3. ¡Listo! Te da una URL al instante.

---

## 🔧 Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`

---

## 📋 Funcionalidades

- **Panel**: Resumen del día, mesas ocupadas
- **Reservas**: Listado con filtros, editar, eliminar, enviar WhatsApp
- **Clientes**: Historial por cliente
- **✦ Pegar mensaje**: IA interpreta texto libre y rellena la reserva
- **⊞ Google Sheet**: Importa reservas desde tu hoja de cálculo
