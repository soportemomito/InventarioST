# InventarioST - Service Inventory Control

InventarioST is a web app built for SoyMomo Technical Service teams to manage spare-part inventory with speed, traceability, and clear operational visibility.

## Platform URL

- [https://inventario-st-alpha.vercel.app/](https://inventario-st-alpha.vercel.app/)

## What it solves

- Centralizes stock management in one place.
- Reduces stockouts with low-stock alerts.
- Enables fast stock in/out registration.
- Provides real-time visibility through metrics and charts.
- Controls access through user approval workflows.

## Key features

- Google sign-in.
- User approval/denial from an admin panel.
- Product management (create, edit, delete).
- Stock movement tracking (inbound/outbound) with validations.
- Real-time dashboard metrics.
- Automatic low-stock email notifications (with consumption metrics).
- Export options: Excel, PDF, and PNG.

## Access model

- Only approved users can access the platform.
- Admin users can approve/deny users and manage critical actions.

## Technology

- Lightweight web application.
- Firebase integration:
  - Authentication
  - Cloud Firestore

## Project structure

- `index.html`: main version currently published on GitHub.
- `index v2.html`: local enhanced version with ongoing improvements.
- `README.md`: project documentation.

## Low-stock email alerts

The app can send automatic email alerts when one or more products reach low stock (`stock <= min`).

- Current recipients:
  - `alvarovillena7@gmail.com`
  - `javier@soymomo.com`
- Delivery service: EmailJS
- Includes per-product metrics:
  - current stock vs minimum
  - 30-day outbound consumption
  - average daily consumption

To configure EmailJS in the app:

- Set `serviceId`
- Set `templateId`
- Set `publicKey`
- In your EmailJS template body, render HTML with: `{{{html_body}}}`

## Suggested next steps

- Publish a production deployment with an internal/custom domain.
- Define periodic database backups.
- Gradually modularize the codebase as the project grows.

---

Developed for SoyMomo Technical Service.
