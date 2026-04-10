# InventarioST + Technical Service (ST)

Internal web app for **SoyMomo** to manage spare-parts inventory, stock movements, and a **Technical Service** module (operations dashboard and public intake form).

---

## What this application does

### Inventory (`index.html`)

- After **Google sign-in**, users with `users/{uid}.status === 'approved'` can open the inventory UI (products, movements, low-stock alerts, admin user approval).
- Stock and history live in **Firestore** (`products`, `movements`, `users`, `config/settings`).
- Optional **EmailJS** configuration in `index.html` can send low-stock notifications (client-side).

### Technical Service (`st/`)

- **`st/dash.html` + `st/dash-app.js`**: authenticated dashboard for validations, work orders, Google Docs report generation, email sending (via Apps Script), and **Cambios ST** (rows backed by a Google Sheet via a Web App).
- **`st/ingreso.html`**: public intake form (no Firebase Auth). Writes to **`st_validaciones`** and increments sequence counters in **`st_meta`** (`seq_P`, `seq_E`, `seq_S`) for intake numbers like `P1`, `E2`, `S3`.

### Post-login navigation

- **Default:** after a successful login, **approved** users always see the purple **module selector** and choose **Inventory** or **Technical Service (ST)**. This avoids automatic redirects that could fail or feel like a crash.
- From there, **Servicio Técnico** runs `redirectToStDash()` (same site `./st/dash.html` or external URL from `soymomo_st_dash_url`).

---

## Implementation stack

| Layer | Technology |
|--------|------------|
| UI | Static **HTML**, **CSS**, **vanilla JavaScript** (no React/Vue build step) |
| Auth & database | **Firebase Authentication** (Google provider), **Cloud Firestore** |
| ST ↔ Sheets / Gmail / Docs | **Google Apps Script** projects deployed as **Web Apps** (`…/exec` URLs) |
| Hosting | Typical **static hosting** (e.g. **Vercel**); `index.html` at site root, ST at `/st/dash.html`, `/st/ingreso.html` |
| Optional alerts | **EmailJS** REST API from the browser (inventory low-stock) |

### Repository layout (main entry points)

| Path | Role |
|------|------|
| `index.html` | Login, module selector, inventory app |
| `st/dash.html` | ST operations UI |
| `st/dash-app.js` | ST logic, Firestore queries, `fetch` to Apps Script Web Apps |
| `st/ingreso.html` | Public ST intake form |
| `firestore.rules` | **Canonical** Firestore rules (inventory + ST); deploy in Firebase Console or `firebase deploy --only firestore:rules` |
| `firebase.json`, `.firebaserc` | Optional CLI deploy for rules (project id in `.firebaserc`) |
| `st/firestore-rules-st.txt` | ST-only `match` blocks (for merging into an existing rules file) |
| `st/google-apps-script-informe.gs` | Web App: `doPost` for Docs + mail from the dash; **add** to the same Apps Script project as sheet-based scripts (do not delete legacy sheet functions unless intended) |
| `st/google-apps-script-cambios-st.gs` | Web App: read/append **Cambios ST** sheet |
| `st/google-apps-script-solicitud-lookup.gs` | Web Apps (per spreadsheet) for **P/E “Cargar”** solicitation lookup |
| `st/appsscript.json` | Example **OAuth scopes** manifest for the informe project (enable manifest in Apps Script settings and merge scopes) |

### Config URLs in `st/dash-app.js` (and overrides)

- **`SHEETS_EXEC_URL_P` / `SHEETS_EXEC_URL_E`**: solicitation lookup Web Apps.
- **`INFORME_SCRIPT_URL`**: informe / email Web App; can be overridden with `localStorage` key `st_informe_script_url`.
- **`CAMBIOS_ST_SCRIPT_URL`**: Cambios ST Web App; can be overridden with `st_cambios_st_script_url`.
- **External ST host:** `localStorage` `soymomo_st_dash_url` (or `__soymomoSetStDashUrl`) when inventory and ST are on different origins.

---

## Firestore data model (same Firebase project)

| Collections / docs | Used by | Purpose |
|--------------------|---------|---------|
| `products`, `movements`, `users`, `config/settings` | `index.html` | Inventory |
| `st_validaciones` | `st/ingreso.html`, `st/dash.html` | Intake submissions; staff review |
| `st_ordenes` | `st/dash.html` | Work orders |
| `st_meta/ordenes` | `st/dash-app.js` | Order counters by channel (P/E/S) |
| `st_meta/seq_P`, `seq_E`, `seq_S` | `st/ingreso.html` | Public +1 sequence for intake numbers (rules allow unauthenticated increment) |
| `st_salidas`, `st_email_log`, `st_usuarios` | Rules reserved | Progressive ST features |

Empty collections **do not appear** in the Firebase console until at least one document exists.

**Important:** Sheet “solicitud” numbers loaded with **Cargar** in the dash **fill the form** from Google Sheets; they are not automatically written to Firestore until you create/save an order through the app flow.

---

## Security rules

- Publish **`firestore.rules`** (root) to **Firebase Console → Firestore → Rules** (or use Firebase CLI).
- The public form uses **`addDoc` without Auth**; rules must allow controlled **`create`** on `st_validaciones` and controlled updates on `st_meta` sequence docs. Do **not** rely on `signInAnonymously` for intake if Anonymous sign-in is disabled in Firebase.

---

## Google Apps Script deployment notes

1. **Informe / Gmail / Docs:** merge **`st/appsscript.json`** scopes into the project manifest; add **`google-apps-script-informe.gs`** as an extra file if you keep sheet-only functions (e.g. bulk `enviarCorreos`). Deploy **Web App**; single global **`doPost`** entry point.
2. **Cambios ST:** deploy from the spreadsheet project (or any project with access to that file); set **`CAMBIOS_ST_SCRIPT_URL`** (or `localStorage`).
3. **P/E lookup:** deploy **new version** per spreadsheet; set **`SHEETS_EXEC_URL_P` / `SHEETS_EXEC_URL_E`**.

If `fetch` to `script.google.com` is blocked by CORS in some environments, use a server-side proxy or JSONP (rare for standard Web App GET/POST from browser).

---

## Two-site setup (inventory + ST on different URLs)

1. Add both domains under **Firebase Authentication → Authorized domains**.
2. From the inventory origin, set the ST dashboard URL, e.g.  
   `localStorage.setItem('soymomo_st_dash_url', 'https://your-st-host/st/dash.html')`  
   or `__soymomoSetStDashUrl(...)`.
3. Redirect passes `#st_token=…&inv=…`; ST stores token in `sessionStorage` and return URL in `soymomo_inventario_url` where applicable.

Single deployment: relative `./st/dash.html` is enough; external URL not required.

---

## Local development

Serve the folder with any static server (Live Server, `npx serve`, etc.) and open `index.html`. Opening files via `file://` may break Auth or module loading in some browsers.

---

## Requirements

- Modern browser (Chrome, Edge, Firefox).
- Firebase project with **Authentication** + **Firestore** and published rules aligned with this repo.
- Deployed Apps Script Web Apps for features that call Google Sheets, Docs, or Gmail from the dash.

---

## Suggested follow-ups (product)

- Normalize ST states across the UI.
- Finalize email templates by order prefix (`P*`, `E*`, `S*`, etc.).
- Unify a single data model for ST intake/outbound if you grow beyond Firestore + Sheets.

---

*Spanish documentation previously lived in this file; this README is now maintained in **English** as the primary project description.*
