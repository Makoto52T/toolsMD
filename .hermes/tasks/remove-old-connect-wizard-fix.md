# Task: Remove old Connect Mode + Fix edgeWizard robustness

**Assignee:** @m
**Priority:** P0
**File:** `src/components/AppBuilder.tsx`

---

## Problem
User reports long-press stopped working after creating one edge. Two likely causes:

1. **Old "🔗 Connect" button in toolbar** — user may accidentally tap it → `connectMode: true` → blocks all long-press (line 423: `if (connectMode || draggingEdge || edgeWizard) return;`)
2. **Wizard modal overlay click** — tapping outside wizard card might close it before edge is created, leaving stale state

## Solution

### 1. Remove old Connect mode entirely
Delete ALL code related to the old node-to-node connect mode:
- Remove `connectMode` state (`useState(false)`)
- Remove `connectFirst`, `connectSecond` states
- Remove `setConnectMode` button from desktop AND mobile toolbar
- Remove `confirmConnect` function
- Remove connect mode indicator (toast/overlay at bottom)
- Remove `isConn` class usage in NodeCard
- Remove `onClick` connect mode logic in NodeCard (lines 558-560)

### 2. Fix handleNodePointerDown guard
```ts
// Before (line 423):
if (connectMode || draggingEdge || edgeWizard) return;

// After:
if (draggingEdge || edgeWizard) return;
```

### 3. Fix wizard modal: use overlay Close button instead of onClick
```tsx
// Before:
<div className="modal-overlay ..." onClick={() => setEdgeWizard(null)}>

// After:
<div className="modal-overlay ...">
  {/* No onClick on overlay — user must use Cancel/Back buttons */}
  <div className="modal-card" ...>
    ...
    {/* Explicit Cancel button at bottom */}
    <button onClick={() => setEdgeWizard(null)} className="btn btn-ghost btn-sm">
      Cancel
    </button>
  </div>
</div>
```

### 4. Add safety: auto-reset edgeWizard if stuck
```ts
// New useEffect — if edgeWizard is open > 60s, auto-close
useEffect(() => {
  if (!edgeWizard) return;
  const timeout = setTimeout(() => {
    setEdgeWizard(null);
    setToast('Connection cancelled (timeout)');
    setTimeout(() => setToast(''), 2000);
  }, 60000);
  return () => clearTimeout(timeout);
}, [edgeWizard]);
```

---

## Files to clean up

### Remove from state declarations (lines ~22-24):
```ts
- const [connectMode, setConnectMode] = useState(false);
- const [connectFirst, setConnectFirst] = useState<string | null>(null);
- const [connectSecond, setConnectSecond] = useState<string | null>(null);
```

### Remove from toolbar (desktop ~976-977):
```tsx
- <button onClick={() => setConnectMode(!connectMode)} ...>🔗 Connect</button>
```

### Remove from mobile toolbar (~1013-1014):
```tsx
- <button onClick={() => setConnectMode(!connectMode)} ...>🔗</button>
```

### Remove confirmConnect function (~233-245):
```ts
- const confirmConnect = async () => { ... };
```

### Remove connect mode indicator (~1173-...):
```tsx
- {connectMode && ( ... )}
```

### Clean up NodeCard
- Remove `isConn` (line 543)
- Remove connect mode logic in onClick (lines 558-560)
- Remove `connecting` class usage

---

## Commit
```
fix: remove old connect mode + robust wizard (timeout + no overlay click close)
```
