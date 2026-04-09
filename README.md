# InventarioST + Servicio Tecnico

Aplicacion web interna de SoyMomo para:

- Gestion de inventario de repuestos.
- Control de movimientos de stock.
- Acceso al modulo de Servicio Tecnico (dashboard y formulario de ingreso).

## Estado actual

- `index.html` contiene el panel principal de inventario con autenticacion Firebase.
- Desde `index.html` se puede entrar al modulo ST.
- Modulo ST integrado en:
  - `st/dash.html` (dashboard operativo de ST)
  - `st/ingreso.html` (formulario de ingreso de equipos)

## Estructura del proyecto

- `index.html`: modulo Inventario + selector de modulos.
- `st/dash.html`: dashboard de Servicio Tecnico.
- `st/ingreso.html`: formulario de ingreso para clientes/recepcion.
- `README.md`: documentacion principal.

## Flujo principal

1. Usuario inicia sesion en `index.html`.
2. Selecciona modulo:
   - Inventario
   - Servicio Tecnico
3. En ST:
   - Se pueden gestionar ordenes.
   - Se pueden crear ordenes manuales.
   - En canales `P` y `E` se puede cargar por numero de solicitud.

## Cambios recientes (integracion ST)

- Habilitado acceso directo a ST desde `index.html`.
- Agregado folder `st/` al repo con `dash.html` e `ingreso.html`.
- Actualizado formulario de ingreso:
  - Se elimino telefono.
  - Catalogos de producto/modelo ajustados a operacion real.
  - Mercados: incluye `Otro` (con campo extra) y `No recuerdo`.
  - Colores: incluye `Otro` (con campo extra).
- Nueva orden manual (`st/dash.html`) ahora incluye:
  - `numero_solicitud`
  - soporte de origen/color "Otro"
  - canal `S` contemplado para recepcion.

## Servicio Tecnico y Firebase (Firestore)

El panel ST (`st/dash.html` + `st/dash-app.js`) y el formulario `st/ingreso.html` usan **el mismo proyecto Firebase** que el inventario. Los datos viven en Firestore:

- `st_validaciones` — solicitudes del formulario de ingreso.
- `st_ordenes` — ordenes creadas desde el dash.
- `st_meta/ordenes` — contadores por canal (P/E/S) para numeros de orden.

En **Firebase Console → Firestore → Reglas** debes permitir lectura/escritura autenticada para tecnicos y, si el formulario publico escribe sin login, una regla controlada de `create` en `st_validaciones`.

## Dos URLs en Vercel (inventario + ST)

Si el inventario esta en una URL (ej. `https://inventario-xxx.vercel.app`) y el ST en otra (ej. `https://st-yyy.vercel.app/st/dash.html`):

1. **Firebase Authentication → Configuracion → Dominios autorizados**: agrega **ambos** dominios `*.vercel.app` (o tus dominios custom).
2. En el navegador, en la app de **inventario**, guarda la URL del dash ST (una sola vez por equipo/navegador):

   ```js
   localStorage.setItem('soymomo_st_dash_url', 'https://st-yyy.vercel.app/st/dash.html');
   ```

   Tambien puedes usar la consola del inventario:

   ```js
   __soymomoSetStDashUrl('https://st-yyy.vercel.app/st/dash.html');
   ```

3. Al elegir **Servicio Tecnico**, el inventario redirige al ST con `#st_token=...&inv=...`. El dash guarda el token en `sessionStorage` y la URL de retorno al inventario en `localStorage` (`soymomo_inventario_url`), asi **Salir** o sesion caducada pueden volver al login del inventario.
4. Si abres el ST **sin** pasar por inventario, configura a mano:

   ```js
   localStorage.setItem('soymomo_inventario_url', 'https://inventario-xxx.vercel.app');
   ```

5. Tras login, forzar ir al ST: `https://inventario-xxx.vercel.app/index.html?continue=st`

**Mismo sitio** (todo en un solo deploy): no hace falta `soymomo_st_dash_url`; se usa `./st/dash.html` y el token solo en `sessionStorage`.

## Modulo «Cambios garantia ST» (piloto)

En `st/dash.html` hay una vista **Cambios garantia ST** con tabla almacenada en **localStorage del navegador** (pruebas piloto). Permite agregar filas, marcar listo, ver vista previa del HTML del correo (mismo criterio que tu script de Sheets) y eliminar filas. La integracion real con envio Gmail/Sheets sera en backend.

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox).
- Acceso a internet.
- Proyecto Firebase (Auth + Firestore) con reglas acordes a `st_*`.

## Despliegue (Vercel)

1. **Opcion A — un solo proyecto**: despliega el repo como sitio estatico; `index.html` en la raiz y rutas `/st/dash.html`, `/st/ingreso.html`.
2. **Opcion B — dos proyectos**: inventario en un deployment y ST (carpeta `st/` o copia minima) en otro; configura `soymomo_st_dash_url` en el inventario como arriba.

## Piloto del formulario de ingreso

- Abrir `st/ingreso.html?canal=P` o `?canal=E`.
- Los envios crean documentos en `st_validaciones` (Firestore).
- Modulo Cambios ST en el dash sigue usando solo localStorage del navegador.

## Ejecucion local

Como el proyecto usa HTML estatico, puedes abrir `index.html` directamente, pero para una integracion estable se recomienda servirlo con un servidor local.

Ejemplo con VS Code Live Server o cualquier servidor estatico:

- Abrir carpeta del proyecto.
- Levantar servidor local.
- Abrir `index.html`.

## Notas de arquitectura

- Inventario hoy opera con Firebase.
- ST se preparo para no depender de Google Sheets como base principal.
- Se considera futura interoperabilidad con Supabase/Firebase para unificar datos entre dashboards.

## Pendientes sugeridos

- Unificar estados ST a: `Ingresado`, `En revision`, `Revisado`.
- Definir reglas finales de correo por prefijo de orden:
  - `P*` plantilla P
  - `E*` plantilla E
  - `S*` flujo recepcion
  - otros prefijos sin correo externo
- Centralizar modelo de datos unico para entrada/salida ST.
