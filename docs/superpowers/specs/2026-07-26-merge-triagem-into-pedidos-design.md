# Merge Triagem into Admin Pedidos — Design Spec

**Date:** 2026-07-26
**Status:** Approved

## Overview

Merge the Triagem (triage) functionality from `/admin/triagem` directly into the `/admin/pedidos` screen's "Em Preparação" tab. The operator performs SKU scanning/triage inline on order cards, and orders only advance to the next status after triage is complete. The original triage page and its navigation entries are removed.

## Motivation

- Reduce tab/page switching for operators
- Make triage a mandatory step for both delivery and pickup orders (currently pickup bypasses triage via "Marcar como Pronto para Retirar" button)
- Unify the order management workflow into a single screen

## Architecture

### Approach: `TriagemSection` wrapper component

A new component `TriagemSection` encapsulates all triage logic and is rendered inside `OrdersManagement` for the "Em Preparação" tab. `OrdersManagement` stays mostly unchanged; `TriagemScanDialog` is reused as-is.

### Component Tree (relevant parts)

```
OrdersManagement
├── Tabs (8 abas)
│   ├── "Sem Pagamento" → OrdersTable (unchanged)
│   ├── "Em Preparação" → TriagemSection (NEW)
│   │   ├── Sub-filtro: Todos / Entrega / Retirada
│   │   ├── QR/Barcode global listener
│   │   ├── Order cards (clickable, with visual indicator)
│   │   └── TriagemScanDialog (reused, minor change for pickup flow)
│   ├── "Aguardando Envio" → OrdersTable (NEW tab)
│   ├── "Pronto p/ Retirada" → OrdersTable (unchanged)
│   ├── "Em Transporte" → OrdersTable (unchanged)
│   ├── "Entregues" → OrdersTable (unchanged)
│   ├── "Devoluções" → OrdersTable (unchanged)
│   └── "Cancelados" → OrdersTable (unchanged)
```

## Detailed Changes

### 1. New Component: `src/components/admin/TriagemSection.tsx`

**Responsibilities:**
- Receives filtered `em_preparo` orders via props
- Global keyboard listener for QR/barcode scanner (ported from `AdminTriagem`)
- Renders order cards with clickable behavior (cursor pointer, hover highlight, chevron icon)
- Opens `TriagemScanDialog` on card click or QR scan
- Calls `onStatusChanged()` callback after triage completion so `OrdersManagement` reloads

**Props:**
```typescript
interface TriagemSectionProps {
  orders: Order[]              // filtered: status === 'em_preparo'
  onStatusChanged: () => void  // callback to reload orders list
  isAdmin: boolean
}
```

**QR/Barcode behavior (ported from AdminTriagem):**
- Global `keydown` listener active only when the TriagemSection is mounted
- Accumulates rapid keystrokes (<80ms gap) — characteristic of barcode scanners
- When a full UUID is detected, looks up the order and opens `TriagemScanDialog`
- Uses `lastHandledQrRef` to avoid reopening the same order

**Card UX:**
- Same layout as existing `OrdersManagement` cards, plus:
  - `cursor-pointer` and subtle background change on hover
  - Chevron-right icon on the right edge of each card
  - Optional: small badge/text "Clique para triagem"

### 2. Changes to `src/components/OrdersManagement.tsx`

- **"Em Preparação" tab filter:** Remove `aguardando_envio` from the filter. Change from:
  ```
  o.status === 'em_preparo' || o.status === 'aguardando_envio'
  ```
  to:
  ```
  o.status === 'em_preparo'
  ```
- **Render:** Instead of `OrdersTable`, the "Em Preparação" tab renders `<TriagemSection>`.
- **Remove:** "Marcar como Pronto para Retirar" button for pickup orders in "Em Preparação" (triage is now mandatory).
- **New tab "Aguardando Envio":** Added as the 3rd tab (between "Em Preparação" and "Pronto p/ Retirada"). Filters `o.status === 'aguardando_envio'`. Uses `OrdersTable` with existing actions (tracking code, "Marcar como Enviado").
- **Tab count badge:** Update key names and counts for the new tab structure.

### 3. Removal of Triagem Page

**Files to delete:**
- `src/pages/AdminTriagem.tsx`

**Files to edit (remove references):**
- `src/App.tsx` — Remove `/admin/triagem` route and its lazy import
- `src/components/Header.tsx` — Remove "Triagem" from admin shortcut bar
- `src/pages/Admin.tsx` — Remove "Triagem" card from admin grid

### 4. Minor Change to `src/components/TriagemScanDialog.tsx`

For pickup orders, the dialog currently has a "Confirmar retirada" button that sets status to `retirado`. This must change to set status to `pronto_retirada` instead, matching the new flow where the customer still needs to physically pick up the order. The button label changes to "Marcar como Pronto para Retirada".

The delivery (pack) flow remains unchanged: "Marcar como aguardando envio" → `aguardando_envio`, "Marcar como enviado" → `enviado`.

### 5. Status Flow (unchanged logic, enforced mandatorily)

| Current Status | Delivery | Pickup |
|---|---|---|
| `em_preparo` | Triagem → `aguardando_envio` | Triagem → `pronto_retirada` |
| `aguardando_envio` | Button → `enviado` | N/A |
| `pronto_retirada` | N/A | Button → `retirado` |

The `getNextStatus` function in `src/lib/orderStatus.ts` already returns `null` for delivery `em_preparo` (enforcing triage). For pickup, `getNextStatus` will now also return `null` for `em_preparo` since the manual "Marcar como Pronto para Retirar" button is removed.

### 6. Change to `src/lib/orderStatus.ts`

Update `getNextStatus` so that `em_preparo` for pickup also returns `null` (triage mandatory):

```
em_preparo + pickup → null (was: pronto_retirada)
```

### 7. Realtime Reactivity

`OrdersManagement` already subscribes to Supabase Realtime on `orders` table with debounce reload. Since `TriagemScanDialog` updates order status directly via Supabase, the reload will automatically pick up changes and move the order out of "Em Preparação" into its new tab. No changes needed.

## Files Summary

| File | Action |
|---|---|
| `src/components/admin/TriagemSection.tsx` | **Create** |
| `src/components/OrdersManagement.tsx` | Edit — embed TriagemSection, new tab, filter change |
| `src/lib/orderStatus.ts` | Edit — pickup `em_preparo` now returns null |
| `src/pages/AdminTriagem.tsx` | **Delete** |
| `src/App.tsx` | Edit — remove `/admin/triagem` route |
| `src/components/Header.tsx` | Edit — remove Triagem nav entry |
| `src/pages/Admin.tsx` | Edit — remove Triagem grid card |
| `src/components/TriagemScanDialog.tsx` | Minor edit — pickup confirm now goes to `pronto_retirada` |
| `src/lib/__tests__/orderStatus.test.ts` | Edit — update test expectations |

## Edge Cases & Error Handling

- **Card click on already-completed order:** If an order somehow gets stuck or data is stale, `TriagemScanDialog` validates status before opening — shows error toast if not `em_preparo`
- **QR scanner active outside "Em Preparação" tab:** The global listener is cleaned up when `TriagemSection` unmounts (tab switch). No ghost scans on other tabs.
- **Simultaneous scan of same order:** Prevented by `lastHandledQrRef` dedup
- **Search for non-existent SKU:** Handled inside `TriagemScanDialog` — shows error toast
