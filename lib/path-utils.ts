// Utilities for turning an arbitrary HTTP response (object / array / scalar)
// into a flat list of dot-notation paths the user can bind to tags, and for
// reading a value back out of an object given such a path.
//
// Path grammar (subset, deliberately small):
//   data.access_token        -> object property access
//   items[0].name            -> array index access
//   users[2].roles[0]        -> mixed
//
// Guard rails so a pathological response can't blow up a serverless invocation:
//   - MAX_DEPTH levels of nesting are walked (deeper values are not flattened)
//   - MAX_PATHS entries are emitted (further leaves are dropped)

export const MAX_DEPTH = 5;
export const MAX_PATHS = 200;
// Cap how many array elements we descend into when flattening — a 10k-element
// array would otherwise produce 10k paths. The user can still bind deeper via a
// typed path; this only limits the *suggested* list.
const MAX_ARRAY_ITEMS = 25;

export type FlatType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface FlatEntry {
  path: string;
  // The raw value at that path (for preview). Objects/arrays are included so the
  // UI can show "{…}" but binding a leaf scalar is the common case.
  value: unknown;
  type: FlatType;
}

function typeOf(v: unknown): FlatType {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'string';
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Flatten an arbitrary value into a list of bindable leaf paths.
 * Leaves (scalars: string/number/boolean/null) are always emitted. Container
 * nodes (object/array) are also emitted (so the user can bind the whole thing,
 * stringified) but are then descended into until MAX_DEPTH / MAX_PATHS.
 */
export function flattenPaths(input: unknown): FlatEntry[] {
  const out: FlatEntry[] = [];

  const walk = (value: unknown, path: string, depth: number): void => {
    if (out.length >= MAX_PATHS) return;

    const t = typeOf(value);

    // Record this path (skip the synthetic empty root path).
    if (path) out.push({ path, value, type: t });

    if (depth >= MAX_DEPTH) return;

    if (t === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (out.length >= MAX_PATHS) return;
        const childPath = path ? `${path}.${key}` : key;
        walk((value as Record<string, unknown>)[key], childPath, depth + 1);
      }
    } else if (t === 'array') {
      const arr = value as unknown[];
      const limit = Math.min(arr.length, MAX_ARRAY_ITEMS);
      for (let i = 0; i < limit; i++) {
        if (out.length >= MAX_PATHS) return;
        walk(arr[i], `${path}[${i}]`, depth + 1);
      }
    }
  };

  walk(input, '', 0);
  return out;
}

// Tokenise a path like `data.items[0].name` into ['data','items','0','name'].
// Returns null on a malformed path.
function tokenize(path: string): string[] | null {
  if (typeof path !== 'string' || !path) return null;
  const tokens: string[] = [];
  // Match a leading identifier-ish segment, then any number of [n] or .seg.
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    // Reject gaps (characters not consumed by the regex => malformed).
    if (m.index !== lastIndex && path[lastIndex] !== '.') {
      // allow the dot separator; anything else is a gap
    }
    tokens.push(m[1] !== undefined ? m[1] : m[2]);
    lastIndex = re.lastIndex;
  }
  return tokens.length ? tokens : null;
}

/**
 * Read the value at a dot/bracket path out of an object.
 * Returns `undefined` if any segment is missing (caller treats undefined as
 * "binding path no longer resolves" → missing-field alert).
 */
export function getByPath(obj: unknown, path: string): unknown {
  const tokens = tokenize(path);
  if (!tokens) return undefined;
  let cur: unknown = obj;
  for (const tok of tokens) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(tok);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      if (!(tok in (cur as Record<string, unknown>))) return undefined;
      cur = (cur as Record<string, unknown>)[tok];
    } else {
      // Reached a scalar but path continues → no such value.
      return undefined;
    }
  }
  return cur;
}

/**
 * Coerce a resolved value into the string a tag stores:
 *   object / array  -> JSON.stringify
 *   number / boolean -> String()
 *   null / undefined -> ''
 *   string -> as-is
 */
export function valueToTagString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Leaf key of a path, used as a default tag key suggestion in the UI.
// `data.items[0].access_token` -> `access_token`.
export function leafKey(path: string): string {
  const tokens = tokenize(path);
  if (!tokens || tokens.length === 0) return path;
  // Skip trailing pure-numeric (array index) tokens for a nicer key.
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(tokens[i])) return tokens[i];
  }
  return tokens[tokens.length - 1];
}

// ---------------------------------------------------------------------------
// Tag interpolation — n8n-style `{{tagKey}}` substitution inside a string.
//
// Used so a user can write a header value like `Bearer {{access_token}}` (or a
// url / body string with `{{tag}}` placeholders) and have it resolved against
// the project tags at execute time. Matches tags by their `key` (not id), so
// the user types the human-readable key shown in the UI.
//
//   interpolateTags('Bearer {{access_token}}', [{key:'access_token',value:'abc'}])
//     => { result: 'Bearer abc', missing: [] }
//
// Behaviour:
//   - `{{key}}`        -> tag.value (whitespace inside braces is trimmed)
//   - unknown key      -> the placeholder is left intact AND reported in
//                         `missing` so the UI can warn. We deliberately do NOT
//                         drop it to empty (silent data loss is worse than a
//                         visible, un-substituted token the user can fix).
//   - `{{}}` / blank   -> left intact (not a valid placeholder).
// Matching is last-write-wins on duplicate keys (consistent with tag merging).
// ---------------------------------------------------------------------------
const TAG_PLACEHOLDER_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export interface InterpolateResult {
  result: string;
  // Keys referenced via {{...}} that had no matching tag.
  missing: string[];
}

export function interpolateTags(
  input: string,
  tags: Array<{ key: string; value: string }>,
): InterpolateResult {
  if (typeof input !== 'string' || input.indexOf('{{') === -1) {
    return { result: input, missing: [] };
  }
  // Last-write-wins map of key -> value.
  const byKey = new Map<string, string>();
  for (const t of tags) {
    if (t && typeof t.key === 'string') byKey.set(t.key, t.value ?? '');
  }
  const missing: string[] = [];
  const result = input.replace(TAG_PLACEHOLDER_RE, (whole, rawKey: string) => {
    const key = String(rawKey);
    if (!key) return whole; // `{{}}` — not a real placeholder
    if (byKey.has(key)) return byKey.get(key) as string;
    if (!missing.includes(key)) missing.push(key);
    return whole; // leave the token intact so the user notices
  });
  return { result, missing };
}

// Does a string contain any {{tag}} placeholder? Cheap pre-check for the UI.
export function hasTagPlaceholder(input: unknown): boolean {
  return typeof input === 'string' && /\{\{\s*[^{}]+?\s*\}\}/.test(input);
}

// Recursively interpolate every string found in an object/array (header maps,
// JSON bodies). Non-string leaves pass through untouched. Returns the new value
// plus the union of all missing keys encountered.
export function interpolateDeep(
  value: unknown,
  tags: Array<{ key: string; value: string }>,
): { value: unknown; missing: string[] } {
  const missing: string[] = [];
  const seen = (k: string) => {
    if (!missing.includes(k)) missing.push(k);
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = interpolateTags(v, tags);
      r.missing.forEach(seen);
      return r.result;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return { value: walk(value), missing };
}
