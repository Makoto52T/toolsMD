# Task: Function Edge Wizard (replace drag on mobile)

**Assignee:** @m
**Priority:** P0
**File:** `src/components/AppBuilder.tsx`

---

## Problem

Current long-press → drag line → hit small ports is still hard on mobile.
User wants: **step-by-step modal wizard** — 3 taps, no drag.

## New Flow (Mobile Only)

### Step 1: Long-press node → Function Picker
```
┌──────────────────────────────┐
│  Connect from: Auth Service  │
│                              │
│  ┌────────────────────────┐  │
│  │ 🔑 userLogin           │  │  ← tap
│  │ 🔄 refreshToken        │  │
│  │ 🚪 logout              │  │
│  └────────────────────────┘  │
│                              │
│  [Cancel]                    │
└──────────────────────────────┘
```

### Step 2: Select function → Node Picker
```
┌──────────────────────────────┐
│  🔑 userLogin  →  ?         │
│                              │
│  Select target node:        │
│  ┌────────────────────────┐  │
│  │ 📦 User Service        │  │  ← tap
│  │ 📦 Database           │  │
│  │ 📦 API Gateway        │  │
│  │ 📦 Frontend           │  │
│  └────────────────────────┘  │
│                              │
│  [Back]  [Cancel]           │
└──────────────────────────────┘
```
- Filter: ไม่รวม source node (กัน self-connect)
- แสดง node name + function count
- ถ้าไม่มี node อื่น: "No other nodes — create one first"

### Step 3: Select node → Function Picker (target)
```
┌──────────────────────────────┐
│  🔑 userLogin  →  User Svc  │
│                              │
│  Select target function:    │
│  ┌────────────────────────┐  │
│  │ 👤 getUserProfile      │  │  ← tap
│  │ 📊 getUserStats        │  │
│  │ 🔄 validateSession     │  │
│  │                         │  │
│  │ ═══════════════════════ │  │
│  │ 📦 Whole node (no fn)  │  │  ← connect to node-level
│  └────────────────────────┘  │
│                              │
│  [Back]  [Cancel]           │
└──────────────────────────────┘
```
- Optional: "📦 Whole node" = edge without to_function_id
- ถ้าไม่มี function: auto-create edge แบบ node-level โดยไม่ต้อง step 3

### Step 4: Edge created → Toast + close
```
✅ 🔑 userLogin → 👤 getUserProfile
```

---

## Implementation

### New State
```ts
const [edgeWizard, setEdgeWizard] = useState<{
  step: 1 | 2 | 3;
  fromNodeId: string;
  fromNodeName: string;
  fromFunctionId?: string;
  fromFunctionName?: string;
  toNodeId?: string;
  toNodeName?: string;
} | null>(null);
```

### Wizard Component
```tsx
{edgeWizard && (
  <div className="modal-overlay fade-in mobile-sheet" onClick={() => setEdgeWizard(null)}>
    <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
      {/* Step header — breadcrumb style */}
      <div className="wizard-breadcrumb">
        <span>{edgeWizard.fromFunctionName || '...'}</span>
        <span>→</span>
        <span className={edgeWizard.step >= 3 ? '' : 'wizard-dim'}>
          {edgeWizard.toNodeName || '?'}
        </span>
      </div>

      {/* Step content */}
      {edgeWizard.step === 1 && <FunctionList ... />}
      {edgeWizard.step === 2 && <NodeList ... />}
      {edgeWizard.step === 3 && <TargetFunctionList ... />}

      {/* Back/Cancel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        {edgeWizard.step > 1 
          ? <button onClick={goBack} className="btn btn-ghost btn-sm">← Back</button>
          : <div />
        }
        <button onClick={() => setEdgeWizard(null)} className="btn btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  </div>
)}
```

### Key functions
```ts
const startEdgeWizard = (nodeId: string) => {
  setEdgeWizard({ step: 1, fromNodeId: nodeId, fromNodeName: nodes.find(n=>n.id===nodeId)?.name || '' });
};

const selectSourceFunction = (fn: FunctionItem) => {
  setEdgeWizard(prev => prev ? {
    ...prev, step: 2,
    fromFunctionId: fn.id,
    fromFunctionName: fn.name,
  } : null);
};

const selectTargetNode = (node: NodeItem) => {
  const fns = nodeFns(node.id);
  if (fns.length === 0) {
    // No functions — create edge directly (node-level)
    createFunctionEdge(node.id, undefined);
    setEdgeWizard(null);
  } else {
    setEdgeWizard(prev => prev ? {
      ...prev, step: 3,
      toNodeId: node.id,
      toNodeName: node.name,
    } : null);
  }
};

const selectTargetFunction = (fn: FunctionItem) => {
  if (!edgeWizard?.toNodeId) return;
  createFunctionEdge(edgeWizard.toNodeId, fn.id);
  setEdgeWizard(null);
};

const goBack = () => {
  setEdgeWizard(prev => prev ? { ...prev, step: (prev.step - 1) as 1|2|3 } : null);
};
```

### createFunctionEdge (reuse existing)
```ts
const createFunctionEdge = async (toNodeId: string, toFunctionId?: string) => {
  if (!edgeWizard || !projectId) return;
  const edge = await api('POST', `/projects/${projectId}/edges`, {
    from_node_id: edgeWizard.fromNodeId,
    to_node_id: toNodeId,
    from_function_id: edgeWizard.fromFunctionId,
    to_function_id: toFunctionId || null,
    label: `${edgeWizard.fromFunctionName} → ${toFunctionId ? 'fn' : 'node'}`,
  });
  setEdges(prev => [...prev, edge]);
};
```

### Long-press → open wizard (replace drag)
```ts
// In handleNodePointerDown:
if (longPressDetected) {
  // Instead of starting drag, open wizard
  startEdgeWizard(nodeId);
  return;
}
```

### Keep desktop right-click connect
- Right-click → "Connect from:" → submenu (already implemented) 
- After selecting function on desktop, ALSO open step 2 of wizard (node picker)
- หรือ optionally: right-click → "Connect..." → opens wizard from step 1

---

## Edge Cases
1. **Source node has no functions** → show "Add functions first" message, no wizard
2. **Only 1 node in project** → step 2 shows "No other nodes"
3. **Target node has no functions** → skip step 3, create node-level edge
4. **Back button** → go to previous step, keep state
5. **Cancel / tap outside** → clear everything
6. **Duplicate edge** → API returns 409, show toast

## Commit
```
feat: step-by-step wizard for function edge connect (mobile replaces drag)
```
