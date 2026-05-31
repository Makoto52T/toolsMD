# Task: Edge Delete UI + Self-Node Function Connect

**Assignee:** @m
**Priority:** P0
**File:** `src/components/AppBuilder.tsx`

---

## Fix 1: Delete Edge — Tap Label

### Problem
No way to delete edges from UI.

### Solution
Each edge label on node card is tappable → shows delete confirmation.

### UX Flow
```
Node Card:
  🔑 userLogin  → 👤getUser     ← tap the "→ 👤getUser" part
        ↓
  ┌──────────────────────────────┐
  │ Delete connection?           │
  │ userLogin → getUser          │
  │                              │
  │ [Cancel]       [Delete]      │
  └──────────────────────────────┘
        ↓ (tap Delete)
  DELETE /api/edges/:id → edge removed
```

### Implementation
```tsx
// Edge label becomes a button
{fns.map(f => {
  const outEdges = edges.filter(e => e.from_function_id === f.id);
  return (
    <span key={f.id} className="node-fn-tag">
      {f.icon} {f.name}
      {outEdges.map(e => {
        const targetFn = functions.find(fn => fn.id === e.to_function_id);
        return (
          <button
            key={e.id}
            className="fn-edge-label"
            onClick={(ev) => {
              ev.stopPropagation();
              setDeleteEdgeTarget(e);  // show confirm
            }}
          >
            → {targetFn?.name || 'node'}
          </button>
        );
      })}
    </span>
  );
})}
```

### Delete Confirmation
- Lightweight inline confirmation (ไม่ใช้ modal เต็ม):
```tsx
{deleteEdgeTarget && (
  <div className="edge-delete-confirm">
    Delete "{deleteEdgeTarget.label}"?
    <button onClick={confirmDeleteEdge} className="btn btn-sm btn-danger">Delete</button>
    <button onClick={() => setDeleteEdgeTarget(null)} className="btn btn-sm btn-ghost">Cancel</button>
  </div>
)}
```

หรือใช้ `confirm()` ก็ได้ถ้าเร็ว:
```ts
const confirmDeleteEdge = async () => {
  if (!deleteEdgeTarget) return;
  await api('DELETE', `/edges/${deleteEdgeTarget.id}`);
  setEdges(prev => prev.filter(e => e.id !== deleteEdgeTarget.id));
  setDeleteEdgeTarget(null);
};
```

### Delete Edge API Route
Check if `DELETE /api/edges/[id]` exists. If not, create:
```ts
// src/app/api/edges/[id]/route.ts
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pool.execute('DELETE FROM edges WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
```

### Also: Edge SVG lines — tap to delete
```
Tap edge line on canvas → highlight → show delete button
```
- เพิ่ม `onClick` + `pointerEvents: 'auto'` บน SVG `<line>`
- เพิ่ม invisible wider hit area (`strokeWidth={12}` transparent + `strokeWidth={2}` visible)

---

## Fix 2: Self-Node Function Connect

### Problem
Wizard step 2 filters out source node → can't connect functions within same node.

### Current code (remove this filter)
```ts
// Step 2: Node List
const otherNodes = nodes.filter(n => n.id !== edgeWizard.fromNodeId);
```

### Fix
```ts
// Step 2: Show ALL nodes including source
// Step 3: When target node === source node, hide source function
const targetFunctions = nodeFns(selectedNodeId);
const availableFunctions = selectedNodeId === edgeWizard.fromNodeId
  ? targetFunctions.filter(f => f.id !== edgeWizard.fromFunctionId)
  : targetFunctions;
```

### Self-connect validation
- `from_node_id === to_node_id` ✓ (อนุญาต)
- `from_function_id === to_function_id` ✗ (ห้าม — update API duplicate check)

### Update API duplicate check
```ts
// src/app/api/projects/[id]/edges/route.ts
if (from_function_id && from_function_id === to_function_id) {
  return NextResponse.json({ error: 'SELF_REFERENCE', message: 'Cannot connect function to itself' }, { status: 400 });
}
```

### Step 3: "Whole node" option
- ถ้า target = source node → "Whole node" ก็ควรมี (connect function to node itself)
- แต่ควรมีแค่ถ้ามีประโยชน์ — ตัดสินใจว่าควรมีหรือไม่ (ส่วนใหญ่ไม่มีประโยชน์)
- → **ตัดออก** ถ้า target === source (ไม่แสดง "Whole node")

---

## Commit Message
```
fix: delete edge by tapping label + allow self-node function connect
```

## Verification
1. Tap edge label → delete confirm → edge gone
2. Long-press node → select function → select same node → select other function → edge created
3. Long-press node → select function → select same node → source function NOT in list
4. Tap SVG edge line → can delete too
5. Build passes, deploy
