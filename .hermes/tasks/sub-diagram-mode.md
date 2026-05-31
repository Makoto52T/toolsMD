# Task: Sub-Diagram Mode — Double-click Node Opens Function Canvas

**Assignee:** @m
**Priority:** P0
**Files:** `src/components/AppBuilder.tsx`, `src/components/SubDiagram.tsx` (new)

---

## Goal

เมื่อ double-click node → canvas เปลี่ยนเป็น **sub-diagram** แสดง function ทั้งหมดของ node นั้นเป็น card เล็กๆ พร้อมเส้นเชื่อม function-to-function ที่มีอยู่ใน `edges`

## UX Flow

### Normal Canvas (main)
```
┌──────────┐      ┌──────────┐
│  Auth    │──────│  User    │
│  [2 fns] │      │  [3 fns] │
└──────────┘      └──────────┘
```

### Double-click "Auth" → Sub-Diagram
```
┌──────────────────────────────────────┐
│ ← Project   Auth Service    [+ Fn]  │  ← Topbar
│                                      │
│  ┌───────────┐    ┌───────────┐      │
│  │🔑userLogin│───→│👤getUser  │      │  ← function cards (draggable)
│  │           │    │           │      │
│  └───────────┘    └───────────┘      │
│       │                              │
│       └──────────────→┌───────────┐  │
│                       │🔄refresh  │  │
│                       └───────────┘  │
└──────────────────────────────────────┘
```

## Implementation

### 1. New State: `subDiagramNodeId`
```ts
const [subDiagramNodeId, setSubDiagramNodeId] = useState<string | null>(null);
```

### 2. Double-click Node → Enter Sub-Diagram
```ts
// In NodeCard onDoubleClick:
onDoubleClick={() => {
  const fns = nodeFns(n.id);
  if (fns.length > 0) {
    setSubDiagramNodeId(n.id);
  } else {
    setEditingNode(n.id);  // fallback: edit if no functions
  }
}}
```

### 3. SubDiagram Component (inline or new file)

**Topbar:**
```tsx
<div className="topbar">
  <button onClick={() => setSubDiagramNodeId(null)} className="btn btn-ghost btn-sm">
    ← {projectName}
  </button>
  <span className="topbar-name">{node.name}</span>
  <button onClick={openCreateModal} className="btn btn-ghost btn-sm">+ Function</button>
  <button onClick={exportPlan} className="btn btn-primary btn-sm">📋 Export</button>
</div>
```

**Canvas:**
```tsx
<div className="canvas" onClick={() => setSelectedFn(null)}>
  <div className="canvas-grid" />
  
  {/* Edges between functions in this node */}
  <svg style={{ position:'absolute', inset:0, pointerEvents:'none', minWidth:2000, minHeight:2000 }}>
    {subEdges.map(e => {
      const ff = subFns.find(f => f.id === e.from_function_id);
      const tf = subFns.find(f => f.id === e.to_function_id);
      if (!ff || !tf) return null;
      return (
        <line key={e.id}
          x1={ff.x + 90} y1={ff.y + 20}
          x2={tf.x} y2={tf.y + 20}
          stroke="var(--border-hover)" strokeWidth={2}
        />
      );
    })}
  </svg>

  {/* Function cards — draggable, same as node cards */}
  {subFns.map(f => (
    <FunctionCard key={f.id} fn={f} ... />
  ))}
</div>
```

### 4. FunctionCard (mini draggable card)
```tsx
const FunctionCard = ({ fn }: { fn: FunctionItem & { x?: number; y?: number } }) => {
  const x = fn.x ?? 100 + Math.random() * 200;
  const y = fn.y ?? 80 + Math.random() * 160;
  
  return (
    <div className="fn-card" style={{ left: x, top: y }}
      onPointerDown={...} // draggable
      onClick={...}       // select
      onDoubleClick={...} // edit name/desc
    >
      <div className="fn-card-icon">{fn.icon || '⚙️'}</div>
      <div className="fn-card-name">{fn.name}</div>
    </div>
  );
};
```

### 5. Sub-Edges Filter
```ts
// Edges where BOTH from_function_id AND to_function_id are in this node
const subEdges = edges.filter(e => {
  const ff = functions.find(f => f.id === e.from_function_id);
  const tf = functions.find(f => f.id === e.to_function_id);
  return ff && tf && ff.node_id === subDiagramNodeId && tf.node_id === subDiagramNodeId;
});
```

### 6. Cross-Node Edges (dotted)
สำหรับ edges ที่ `from_function_id` อยู่ใน node นี้ แต่ `to_function_id` อยู่ node อื่น:
```ts
const crossEdges = edges.filter(e => {
  const ff = functions.find(f => f.id === e.from_function_id);
  if (!ff || ff.node_id !== subDiagramNodeId) return false;
  const tf = functions.find(f => f.id === e.to_function_id);
  return !tf || tf.node_id !== subDiagramNodeId;
});

// ใน SubDiagram canvas: แสดง crossEdges เป็นเส้นประ
// + label: "→ User Service.getUserById"
// ปลายเส้นวิ่งออกขอบ canvas
```

### 7. Function Card CSS
```css
.fn-card {
  position: absolute;
  width: 120px;
  min-height: 50px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
  cursor: grab;
  font-size: 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  touch-action: none;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.fn-card-icon { font-size: 18px; }
.fn-card-name { 
  font-weight: 600; 
  color: var(--text-primary); 
  text-align: center;
  word-break: break-word;
}
.fn-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
```

### 8. Edit Function in Sub-Diagram
- Double-click function card → inline edit name/description (simple modal)
- Delete button on selected card

### 9. Connect in Sub-Diagram
- Long-press function card (same 800ms timer) → wizard step 2 (เลือก target function ใน node นี้ หรือ node อื่น)
- หรือ: ลากจาก function card ไป function card อื่น (ถ้าเอา drag กลับมาเฉพาะใน sub-diagram)
- **แนะนำ:** ใช้ wizard เหมือนเดิม รับทั้ง in-node และ cross-node

### 10. Save Function Position
เพิ่ม `x`, `y` columns ใน `functions` table:
```sql
ALTER TABLE functions ADD COLUMN x INT DEFAULT NULL;
ALTER TABLE functions ADD COLUMN y INT DEFAULT NULL;
```

หรือเก็บใน localStorage ถ้าไม่อยากเปลี่ยน schema:
```ts
// เก็บ position map ใน state
const [fnPositions, setFnPositions] = useState<Record<string, {x:number,y:number}>>({});
```

แนะนำ: localStorage ง่ายกว่า ไม่ต้อง migrate DB

---

## Render Logic

```tsx
if (subDiagramNodeId) {
  return <SubDiagramView 
    node={nodes.find(n => n.id === subDiagramNodeId)!}
    functions={nodeFns(subDiagramNodeId)}
    allEdges={edges}
    allNodes={nodes}
    allFunctions={functions}
    onBack={() => setSubDiagramNodeId(null)}
    onUpdate={() => loadData()}
    projectId={projectId}
    projectName={projectName}
  />;
}

// else: normal canvas (current code)
```

---

## Export Plan Update
```markdown
### 1. 📦 Auth Service
- 🔑userLogin (2 edges)
  - → User Service.👤getUser
  - → Database.💾saveSession
- 🔄refreshToken
  - → User Service.🔄validateSession
```

---

## Commit
```
feat: sub-diagram mode — double-click node shows function canvas
```
