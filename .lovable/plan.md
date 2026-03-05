

## Plan: Editable Client Field with Client Linking on Sales Page

### What changes

**1. Make the Client column editable inline (like Category already is)**
- Clicking the client name opens an inline edit mode with a combo-box/popover
- The combo-box shows a searchable list of known clients (from the Clients table used by the job/site scheduler)
- User can either select a known client OR type a custom name manually
- Selecting a known client stores the clean client name; typing custom text stores that instead

**2. Update `useSalesLogic` hook**
- Add `editingClientId` state to track which row's client is being edited
- Add a `handleClientChange(id, clientName)` handler that calls `updateSale.mutate({ id, client: clientName })`
- Expose the `clients` list (already fetched via `useClients`) from the hook return

**3. Build the inline client editor UI in `SalesPage.tsx`**
- When `editingClientId === s.id`, render a `Popover` containing a `Command` (cmdk) component:
  - `CommandInput` for searching/typing a custom name
  - `CommandGroup` listing matched known clients from the clients table
  - A "Use custom name" option that takes whatever text was typed
- When not editing, show the formatted client name (via `extractVendorName`) with a hover pencil icon (same pattern as category editing)

### Files to modify
- `src/hooks/useSalesLogic.ts` — add `editingClientId` state, `handleClientChange`, expose `clients`
- `src/pages/SalesPage.tsx` — replace static client `<td>` with inline editable combo-box using `Popover` + `Command`

### No database changes needed
The `sales.client` column is already a text field that stores the client name.

