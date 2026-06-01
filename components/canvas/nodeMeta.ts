import { serverIcon, serverColor } from './stackCatalog';

export const NODE_TYPES = [
  'function',
  'http-request',
  'puppeteer',
  'sub-project',
  'server',
] as const;
export type NodeTypeName = (typeof NODE_TYPES)[number];

export const NODE_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  function: { icon: '⚡', label: 'Function', color: '#3b82f6' },
  'http-request': { icon: '↔️', label: 'HTTP Request', color: '#f59e0b' },
  puppeteer: { icon: '🎭', label: 'Puppeteer', color: '#8b5cf6' },
  'sub-project': { icon: '📦', label: 'Sub-Project', color: '#10b981' },
  // Default server meta — refined per-config by metaForServer (icon/color vary
  // by category + language).
  server: { icon: '🖥️', label: 'Server', color: '#0d9488' },
};

export function metaFor(type: string) {
  return NODE_META[type] ?? { icon: '⚙️', label: type, color: '#64748b' };
}

// Server nodes vary their icon (by language/framework) and colour (by category)
// based on config, so canvas + mobile use this instead of the static meta.
export function metaForServer(config: Record<string, any> | undefined) {
  const cfg = config ?? {};
  const category = cfg.category === 'frontend' ? 'frontend' : 'backend';
  return {
    icon: serverIcon(cfg),
    label: category === 'frontend' ? 'Frontend' : 'Backend',
    color: serverColor(category),
  };
}

// Unified accessor: returns config-aware meta for server nodes, static otherwise.
export function nodeDisplayMeta(
  type: string,
  config?: Record<string, any>,
) {
  if (type === 'server') return metaForServer(config);
  return metaFor(type);
}
