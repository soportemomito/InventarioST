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

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox).
- Acceso a internet.
- Backend/API de ST activo para endpoints `http://localhost:3000` (segun configuracion actual del modulo ST).
- Proyecto Firebase configurado para Inventario y login.

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
