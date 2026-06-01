# 9arm Skills Configuration

## Installed Skills
The following skills from `thananon/9arm-skills` are permanently enabled:

- **debug-mantra** — Structured debugging methodology
- **post-mortem** — Documentation framework for fixed bugs  
- **scrutinize** — Code review with external perspective
- **management-talk** — Technical-to-leadership translation

These skills are installed in `~/.agents/skills/` and symlinked for this project.

## Usage
These skills are available for use at any time during this session and all future sessions. They follow the standard skill invocation pattern: `/skill-name`.

## Memory (Hermes)
Persistent memory is stored in Hermes — shared across all agents and sessions.

**ทุก session ใหม่ต้องทำ:**
1. `cat /root/.hermes/memories/MEMORY.md` — อ่าน hot memory
2. อ่าน detail เมื่อต้องการ: `hm read <topic>`

**บันทึก memory ใหม่:**
- Hot (สั้น, โหลดทุก session): `hm remember "fact"`
- Cold (รายละเอียด, อ่านเมื่อต้องการ): `hm detail "topic" "content"`

**ห้าม** ใช้ Claude auto-memory (Write ไปยัง `/root/.claude/projects/...`) — ใช้ `hm` เท่านั้น
