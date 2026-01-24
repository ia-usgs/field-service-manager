# Field Service Manager

A desktop-first field service and customer management application built with **Tauri**. Designed for small businesses, independent technicians, and service providers who need lightweight, fast, and offline-capable job tracking without SaaS lock-in.

---

## Overview

Field Service Manager is a local-first desktop application that provides customer relationship management (CRM), job/work order tracking, invoicing support, and operational dashboards — all packaged as a secure native app using Tauri.

The goal of the project is to replace spreadsheets, notes apps, and fragmented tools with a single, fast, self-hosted solution.

---

## Core Features

### Dashboard
- KPI cards:
  - Total revenue
  - Monthly revenue
  - Outstanding invoices
  - Net profit
  - Average job value
- 6-month revenue trend (line/area chart)
- Revenue vs expenses comparison
- Expense breakdown by category
- Top customers by spend
- Upcoming reminders (next 30 days) with quick-complete actions

### Customer Management (CRM)
- Full customer profiles:
  - Name, email, phone, address
  - Notes and tags
- JSON import for bulk migration
  - Automatic deduplication by email
- Customer archive (soft delete)
  - Customers with jobs cannot be permanently removed
- 360° customer view:
  - Job history
  - Invoice history
  - Service reminders
- Unified media gallery:
  - Attachments across all jobs
- Per-customer statistics:
  - Total spend
  - Outstanding balance
  - Job count
  - Average job value

### Job / Work Order System
- Create and edit jobs linked to customers
- Fields include:
  - Date
  - Problem description
  - Work performed
  - Labor hours and rate
  - Parts
  - Miscellaneous fees
  - Tax rate
  - Status
  - Technician notes
- Job lifecycle:
  - Quoted → In Progress → Completed → Invoiced → Paid

### Parts & Inventory
- Select parts from inventory with live stock counts
- Out-of-stock items automatically disabled
- Add custom parts on the fly
  - Optional prompt to save into inventory catalog

---

## Technology Stack
- **Tauri** – secure, lightweight desktop runtime
- **Web Frontend** – modern JS/TS framework (Vite-based)
- **Rust (Tauri backend)** – native bindings, filesystem access, security
- **Local Storage / Embedded DB**
- **Cross-platform** – Windows, macOS, Linux

---

## Project Structure
```
field-service-manager/
├─ src/
├─ src-tauri/
├─ public/
├─ tauri.conf.json
├─ package.json
└─ README.md
```

---

## Development Setup

### Prerequisites
- Node.js (LTS)
- Rust (stable)
- Tauri CLI

```bash
npm install -g @tauri-apps/cli
npm install
npm exec tauri dev
```

---

## Building

Update the bundle identifier in `tauri.conf.json`:

```json
"identifier": "com.yourcompany.fieldservicemanager"
```

```bash
npm exec tauri build
```

---

## Design Principles
- Local-first
- Offline-capable
- Fast startup
- Business-focused
- No subscriptions

---

## Roadmap
- Invoice PDF generation
- Payment tracking
- Technician roles
- Optional cloud sync
- Reporting exports

---

## License
Private / Internal use only.

---

## Disclaimer
This software is provided as-is. Always maintain backups of your business data.

