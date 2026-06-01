// Stack catalog for the "server" node type. A server node represents a running
// frontend or backend process; the user picks a framework (and, for backend, a
// language) from this catalog or types a custom one.

export const FRONTEND_FRAMEWORKS = [
  'Next.js',
  'React',
  'Vue',
  'Nuxt',
  'Angular',
  'Svelte/SvelteKit',
  'SolidJS',
  'Astro',
  'Remix',
  'Vanilla JS',
] as const;

// Backend frameworks grouped by language. The language drives the node's icon.
export const BACKEND_FRAMEWORKS: Record<string, string[]> = {
  JavaScript: ['Express', 'NestJS', 'Fastify', 'Koa', 'Hono', 'Deno', 'Bun'],
  Python: ['Django', 'FastAPI', 'Flask', 'Tornado'],
  'Java/Kotlin': ['Spring Boot', 'Quarkus', 'Micronaut', 'Ktor'],
  PHP: ['Laravel', 'Symfony', 'Yii', 'Slim'],
  'C#': ['ASP.NET Core', 'Minimal API'],
  Go: ['Gin', 'Echo', 'Fiber', 'Chi', 'net/http'],
  Rust: ['Actix', 'Axum', 'Rocket'],
  Ruby: ['Rails', 'Sinatra'],
};

export const BACKEND_LANGUAGES = Object.keys(BACKEND_FRAMEWORKS);

// Per-language icon (backend nodes). Frontend uses a single ▲ glyph.
export const LANGUAGE_ICONS: Record<string, string> = {
  JavaScript: '🟢',
  Python: '🐍',
  'Java/Kotlin': '☕',
  PHP: '🐘',
  'C#': '🔷',
  Go: '🐹',
  Rust: '🦀',
  Ruby: '💎',
};

export const FRONTEND_ICON = '▲';

// Resolve the glyph to show on a server node from its config.
export function serverIcon(cfg: {
  category?: string;
  language?: string;
}): string {
  if (cfg.category === 'frontend') return FRONTEND_ICON;
  if (cfg.language && LANGUAGE_ICONS[cfg.language]) return LANGUAGE_ICONS[cfg.language];
  return '🖥️';
}

// Frontend = cyan, backend = teal. Chosen to not clash with sub-project emerald.
export function serverColor(category?: string): string {
  return category === 'frontend' ? '#06b6d4' : '#0d9488';
}
