// Node accent color by wiki frontmatter `type`. Falls back to neutral for any
// type we haven't explicitly styled (e.g. wiki-index, project-map, ingest-log).
export const TYPE_COLORS: Record<string, string> = {
  'project-wiki': '#2563eb', // blue
  'tech-wiki': '#7c3aed', // purple
  'research-wiki': '#059669', // green
  'site-wiki': '#d97706', // amber
  'session-summary': '#cf3a1e', // vermilion
  'cross-rules': '#cf3a1e', // vermilion
};

export const FALLBACK_COLOR = '#5f636c'; // neutral-500

export function colorForType(type: string): string {
  return TYPE_COLORS[type] || FALLBACK_COLOR;
}

// Stable, friendly display labels for the filter checkboxes. Any type not
// listed here is shown verbatim.
export const TYPE_LABELS: Record<string, string> = {
  'project-wiki': 'Project',
  'tech-wiki': 'Tech',
  'research-wiki': 'Research',
  'site-wiki': 'Site',
  'session-summary': 'Session',
  'cross-rules': 'Cross-rules',
  'wiki-index': 'Index',
  'project-map': 'Project map',
  'ingest-log': 'Log',
  unknown: 'Untyped',
};

export function labelForType(type: string): string {
  return TYPE_LABELS[type] || type;
}
