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
