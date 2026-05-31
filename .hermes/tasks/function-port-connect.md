# Task: Function-to-Function Edge Connect (Mobile + Desktop)

**Assignee:** @m (agent-m — toolsMD)
**Priority:** P0
**Files affected:** `src/components/AppBuilder.tsx`, `src/app/api/edges/route.ts`

---

## Goal

เปลี่ยนจาก node-to-node connect เป็น **function-to-function connect** รองรับทั้งมือถือและ desktop

---

## Spec

### Mobile: Long-Press → Drag

#### Step 1: Long-press source node (800ms)
- กด node ค้าง 800ms →  trigger `onLongPress`
- Node กระพริบ (pulse animation, scale 1.05)
- **Overlay** เด้งขึ้นมาแสดง function list ของ node นั้น:

```
┌─────────────────────────┐
│  Auth Service           │
│                         │
│  ┌───────────────────┐  │
│  │ 🔑 userLogin      │  │  ← ปุ่มกดได้
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ 🔄 refreshToken   │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ 🚪 logout         │  │
│  └───────────────────┘  │
│                         │
│  [ยกเลิก]               │
└─────────────────────────┘
```

- ถ้า node นั้นไม่มี function: แสดง "No functions — add one first" + ปิด overlay
- `[ยกเลิก]` หรือ tap outside = ปิด overlay, ยกเลิก connect

#### Step 2: Tap function → Start drag line
- Tap function → overlay ปิด, เริ่มสถานะ `draggingEdge: { fromNodeId, fromFunctionId, fromFunctionName }`
- เส้น SVG ลากตามนิ้วจาก function port ไปยัง cursor
- ระหว่างลาก: canvas pan หยุด (ป้องกัน scroll สู้กับ drag)

#### Step 3: Target node shows ports
- เมื่อ drag line เข้าใกล้ node เป้าหมาย (ระยะ < 60px จาก center):
  - Function ports ปรากฏเป็นวงกลม `○` หน้าชื่อ function
  - วงกลมท้าย node (node-level port) สำหรับ connect แบบไม่ระบุ function

```
    ┌──────────────────────┐
    │ User Service         │
    │                      │
  ──○ 👤 getUserProfile   │  ← port หน้าฟังก์ชั่น
    │                      │
  ──○ 📊 getUserStats     │
    │                      │
    │                   ○  │  ← port ท้าย = node-level
    └──────────────────────┘
```

- แต่ละ port pulse เมื่อนิ้วลากเข้าใกล้ (ระยะ < 30px)
- ถ้าไม่มี function: แสดงเฉพาะ port ท้าย

#### Step 4: Release on port → Create edge
- ปล่อยนิ้วที่ port → สร้าง edge ทันที:
  - Port หน้าฟังก์ชั่น → `edge: { from_node_id, to_node_id, from_function_id, to_function_id }`
  - Port ท้าย → `edge: { from_node_id, to_node_id, from_function_id, to_function_id: null }`
- Edge ถูกบันทึกผ่าน `POST /api/projects/:pid/edges`
- Toast: "🔑 userLogin → 👤 getUserProfile"
- ปล่อยที่ว่าง (ไม่มี port) → ยกเลิก

### Desktop: Right-Click → Context Menu

#### Right-click node → Context menu
```
┌──────────────────┐
│ ✏️ Edit          │
│ 🔗 Connect...    │ ← เลือกอันนี้
│ 📋 Duplicate     │
│ 🗑️ Delete        │
└──────────────────┘
```

#### เลือก "Connect..." → Submenu เลือก function
```
┌──────────────────┐
│ Connect from:    │
│ ├ 🔑 userLogin   │
│ ├ 🔄 refreshToken│
│ └ 🚪 logout      │
└──────────────────┘
```

- เลือก function → cursor เปลี่ยนเป็น crosshair + เส้น drag ตามเมาส์
- เหมือน mobile step 3-4 (target แสดง ports, click port = create edge)

### Edge Display (หลังเชื่อมแล้ว)

#### บน Node Card
```
┌──────────────────────────────────────┐
│ Auth Service                         │
│                                      │
│  🔑 userLogin     → User.getUser    │  ← label เล็กๆ แสดง target
│  🔄 refreshToken  → User.validate   │
│  🚪 logout                           │
└──────────────────────────────────────┘
```

#### SVG Lines บน Canvas
- Edge ที่มี `from_function_id` → เส้นออกจากตำแหน่ง function tag (ไม่ใช่กลาง node)
- Edge ที่ไม่มี → เส้นจากขอบ node (เหมือนเดิม)

### Port Visual Spec
```css
.edge-port {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  opacity: 0;  /* hidden by default */
  transition: opacity 0.15s;
  cursor: crosshair;
}
.target-port-visible .edge-port { opacity: 1; }
.edge-port:hover { transform: scale(1.3); background: #4493f8; }
```

---

## Implementation Steps

### 1. State additions (AppBuilder.tsx)
```ts
// New states
const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
const [longPressNode, setLongPressNode] = useState<string | null>(null);
const [draggingEdge, setDraggingEdge] = useState<{
  fromNodeId: string;
  fromFunctionId: string;
  fromFunctionName: string;
} | null>(null);
const [dragLinePos, setDragLinePos] = useState<{ x: number; y: number } | null>(null);
const [hoveredTargetNode, setHoveredTargetNode] = useState<string | null>(null);
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
```

### 2. Long-press logic
- `onPointerDown` → start 800ms timer → `setLongPressNode(nodeId)`
- `onPointerMove` → ถ้า move เกิน 10px ก่อน 800ms → clear timer (เป็น drag ปกติ)
- `onPointerUp` → clear timer

### 3. Function selector overlay (mobile)
- Component: `<FunctionSelectorOverlay nodeId={longPressNode} functions={nodeFns} onSelect={fn => ...} onCancel />`
- แสดงเมื่อ `longPressNode !== null`
- Position: centered on screen (modal style) บนมือถือ / positioned near node บน desktop

### 4. Drag line rendering
- SVG `<line>` ตามจาก function position ไปยัง `dragLinePos`
- ใช้ `onPointerMove` บน canvas ระหว่าง `draggingEdge !== null`
- Hit-test: เช็คระยะจาก `dragLinePos` ไปศูนย์กลาง node → รู้ว่า hover node ไหน

### 5. Target port rendering
- เมื่อ `hoveredTargetNode` มีค่า → render port circles บน node card นั้น
- Port position: หน้าชื่อ function (ซ้ายของ tag) หรือท้าย node (ขวาล่าง)

### 6. Create edge
```ts
const createFunctionEdge = async (toNodeId: string, toFunctionId?: string) => {
  if (!draggingEdge || !projectId) return;
  const edge = await api('POST', `/projects/${projectId}/edges`, {
    from_node_id: draggingEdge.fromNodeId,
    to_node_id: toNodeId,
    from_function_id: draggingEdge.fromFunctionId,
    to_function_id: toFunctionId || null,
    label: `${draggingEdge.fromFunctionName} → ...`,
  });
  setEdges(prev => [...prev, edge]);
  setDraggingEdge(null);
  setDragLinePos(null);
  setHoveredTargetNode(null);
};
```

### 7. Right-click context menu (desktop)
```ts
onContextMenu={(e) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, nodeId: n.id });
}}
```
- Close on outside click / Escape

### 8. Node card edge labels
```ts
// ใน NodeCard component
{fns.map(f => {
  const outEdges = edges.filter(e => e.from_function_id === f.id);
  return (
    <span key={f.id} className="node-fn-tag">
      {f.icon} {f.name}
      {outEdges.map(e => {
        const targetNode = nodes.find(n => n.id === e.to_node_id);
        const targetFn = functions.find(fn => fn.id === e.to_function_id);
        return <span key={e.id} className="fn-edge-label"> → {targetFn?.name || targetNode?.name}</span>;
      })}
    </span>
  );
})}
```

### 9. Update exportPlan()
- แสดง function-level edges ใน markdown ตาม spec ด้านบน

---

## Edge cases

1. **Node ไม่มี function** → แสดงแค่ port ท้าย (node-level connect)
2. **Function ถูกลบ** → edge ที่อ้างอิงต้องถูกลบ cascade (API ทำอยู่แล้ว)
3. **Connect ตัวเอง** → ห้าม (check `from_node_id !== to_node_id`)
4. **Edge ซ้ำ** → API check `from_function_id + to_function_id` unique
5. **Canvas scroll ระหว่างลาก** → lock scroll เมื่อ `draggingEdge !== null`

---

## Verification

1. Long-press node บนมือถือ → function overlay ปรากฏ
2. Tap function → เส้นลากตามนิ้ว
3. ลากไป node อื่น → ports ปรากฏ
4. ปล่อยที่ port → edge สร้าง + toast
5. Right-click node desktop → context menu → Connect → submenu functions
6. Export plan → มี function-level edges ใน markdown
7. Deploy to Vercel → test on tools-md.vercel.app
