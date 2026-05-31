export const NODE_TYPES = ['function', 'http-request', 'puppeteer', 'sub-project'] as const;
export type NodeTypeName = (typeof NODE_TYPES)[number];

export const NODE_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  function: { icon: '⚡', label: 'Function', color: '#3b82f6' },
  'http-request': { icon: '↔️', label: 'HTTP Request', color: '#f59e0b' },
  puppeteer: { icon: '🎭', label: 'Puppeteer', color: '#8b5cf6' },
  'sub-project': { icon: '📦', label: 'Sub-Project', color: '#10b981' },
};

export function metaFor(type: string) {
  return NODE_META[type] ?? { icon: '⚙️', label: type, color: '#64748b' };
}
