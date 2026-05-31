import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios, { AxiosError } from 'axios';

// POST /api/functions/[id]/execute?chain=true
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const chain = searchParams.get('chain') === 'true';
  const t0 = Date.now();

  try {
    // ── Load function from DB ──
    const [rows] = await pool.query(
      `SELECT f.*, n.project_id
       FROM functions f
       JOIN nodes n ON f.node_id = n.id
       WHERE f.id = ?`,
      [id]
    );
    const fn = (rows as any[])[0];
    if (!fn) {
      return NextResponse.json({ success: false, message: 'Function not found' }, { status: 404 });
    }

    // ── Chain execution ──
    if (chain) {
      return await executeChain(fn);
    }

    // ── Single execution ──
    const result = await executeFunction(fn);
    result.duration_ms = Date.now() - t0;
    return NextResponse.json(result);

  } catch (err: any) {
    const duration = Date.now() - t0;
    const axiosErr = err as AxiosError;

    if (axiosErr.isAxiosError) {
      return NextResponse.json({
        success: false,
        status: axiosErr.response?.status || 0,
        statusText: axiosErr.message,
        headers: axiosErr.response?.headers || {},
        body: axiosErr.response?.data || null,
        duration_ms: duration,
        extracts: {},
        error: axiosErr.message,
      });
    }

    console.error('Execute function error:', err);
    return NextResponse.json({
      success: false,
      message: err.message || 'Execution failed',
      duration_ms: duration,
    }, { status: 500 });
  }
}

// ─── Chain execution: follow from_function_id → to_function_id ───
async function executeChain(startFn: any) {
  const steps: any[] = [];

  // Build the chain: follow edges from each function to the next
  const chainFns: any[] = [startFn];
  const visited = new Set<string>();
  visited.add(startFn.id);

  let currentFn = startFn;
  while (true) {
    // Find edge where current function is the source
    const [edgeRows] = await pool.query(
      `SELECT e.* FROM edges e
       WHERE e.from_function_id = ?
       LIMIT 1`,
      [currentFn.id]
    );
    const edges = edgeRows as any[];
    if (!edges.length) break; // No more downstream functions

    const edge = edges[0];
    if (!edge.to_function_id) break; // Edge to node only, not function

    // Prevent cycles
    if (visited.has(edge.to_function_id)) break;
    visited.add(edge.to_function_id);

    // Load the next function
    const [fnRows] = await pool.query(
      `SELECT f.*, n.project_id
       FROM functions f
       JOIN nodes n ON f.node_id = n.id
       WHERE f.id = ?`,
      [edge.to_function_id]
    );
    if (!(fnRows as any[]).length) break;

    const nextFn = (fnRows as any[])[0];
    chainFns.push(nextFn);
    currentFn = nextFn;
  }

  // Accumulated extracts from all previous steps
  let accumulatedExtracts: Record<string, any> = {};

  for (let i = 0; i < chainFns.length; i++) {
    const fn = chainFns[i];
    const stepStart = Date.now();

    // Inject variables from accumulated extracts
    const injectedFn = applyVariableInjection(fn, accumulatedExtracts);

    const result = await executeFunction(injectedFn);
    result.duration_ms = Date.now() - stepStart;

    // Merge extracts into accumulated pool
    if (result.extracts && typeof result.extracts === 'object') {
      accumulatedExtracts = { ...accumulatedExtracts, ...result.extracts };
    }

    steps.push({
      step: i + 1,
      function_id: fn.id,
      function_name: fn.name,
      fn_type: fn.fn_type,
      ...result,
      accumulated_extracts: { ...accumulatedExtracts },
    });
  }

  const totalDurationMs = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

  return NextResponse.json({
    success: true,
    chain: true,
    total_steps: steps.length,
    steps,
    final_extracts: accumulatedExtracts,
    total_duration_ms: totalDurationMs,
  });
}

// ─── Variable injection: replace {{var}} in config with accumulated extracts ───
function applyVariableInjection(fn: any, extracts: Record<string, any>): any {
  const schema = typeof fn.schema === 'string' ? JSON.parse(fn.schema) : (fn.schema || {});
  const config = schema.config || {};
  const extractKeys = Object.keys(extracts);

  if (extractKeys.length === 0) return fn; // No variables to inject

  // Deep replace {{var}} in any string value within config
  const injectedConfig = replaceVariablesAny(config, extracts);

  const injectedSchema = { ...schema, config: injectedConfig };

  return { ...fn, schema: injectedSchema, _injected: true };
}

// ─── Recursively replace {{variable}} in any object/array/string ───
function replaceVariablesAny(value: any, extracts: Record<string, any>): any {
  if (typeof value === 'string') {
    let result = value;
    for (const [key, val] of Object.entries(extracts)) {
      const placeholder = `{{${key}}}`;
      if (result.includes(placeholder)) {
        result = result.replaceAll(placeholder, val !== undefined ? String(val) : '');
      }
    }
    return result;
  } else if (Array.isArray(value)) {
    return value.map(item => replaceVariablesAny(item, extracts));
  } else if (value !== null && typeof value === 'object') {
    const newObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      newObj[k] = replaceVariablesAny(v, extracts);
    }
    return newObj;
  }
  return value;
}

// ─── Execute a single function ───
async function executeFunction(fn: any): Promise<{
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: any;
  body?: any;
  message?: string;
  extracts: Record<string, any>;
  duration_ms?: number;
}> {
  // ── Puppeteer: not supported yet ──
  if (fn.fn_type === 'puppeteer') {
    return {
      success: false,
      message: 'Puppeteer execution requires VPS',
      extracts: {},
    };
  }

  // ── HTTP execution ──
  if (fn.fn_type === 'http') {
    const schema = typeof fn.schema === 'string' ? JSON.parse(fn.schema) : (fn.schema || {});
    const config = schema.config || {};
    const method = (config.method || 'GET').toLowerCase();
    let url = config.url;

    if (!url) {
      return {
        success: false,
        message: 'URL is required for HTTP execution',
        extracts: {},
      };
    }

    // Build headers from serialized headers object (or headersList if present)
    let headers: Record<string, string> = {};
    if (config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers)) {
      headers = { ...config.headers };
    } else if (config.headersList && Array.isArray(config.headersList)) {
      config.headersList.forEach((h: any) => {
        if (h.key) headers[h.key] = h.value || '';
      });
    }

    // Build body from serialized body string or bodyParams
    let body: any = undefined;
    if (['post', 'put', 'patch'].includes(method)) {
      if (config.body && typeof config.body === 'string') {
        try { body = JSON.parse(config.body); } catch { body = config.body; }
      } else if (config.bodyParams && Array.isArray(config.bodyParams)) {
        const obj: Record<string, any> = {};
        config.bodyParams.forEach((p: any) => {
          if (p.key) obj[p.key] = p.value;
        });
        body = obj;
      }
    }

    // Set Content-Type if not already set
    if (body && !headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Parse body JSON values (might be string representations from injection)
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string') {
          try {
            const parsed = JSON.parse(v);
            if (typeof parsed !== 'string') body[k] = parsed;
          } catch {}
        }
      }
    }

    // Execute
    const axiosConfig: any = {
      method,
      url,
      headers,
      timeout: 30000,
      validateStatus: () => true, // accept all status codes
    };
    if (body) {
      axiosConfig.data = body;
    }

    const response = await axios(axiosConfig);

    // Extract output values based on schema.outputs
    const outputs = schema.outputs || [];
    const extracts: Record<string, any> = {};
    let respBody = response.data;
    if (typeof respBody === 'object') {
      for (const out of outputs) {
        if (out.extract && out.name) {
          try {
            // Simple lodash-like path extraction
            const value = getPath(respBody, out.extract);
            if (value !== undefined) {
              extracts[out.name] = value;
            }
          } catch {}
        }
      }
    }

    return {
      success: response.status >= 200 && response.status < 400,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: respBody,
      extracts,
    };
  }

  // ── Custom / unknown type ──
  return {
    success: false,
    message: `Execution not supported for function type: ${fn.fn_type}`,
    extracts: {},
  };
}

// Simple lodash-like path getter: "data.user.name" or "headers.x-auth"
function getPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.replace(/^\./, '').split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    // Support array index: "items.0.name"
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[parseInt(part, 10)];
    } else {
      current = current[part];
    }
  }
  // Don't return objects/arrays — only primitives
  if (typeof current === 'object' && current !== null) {
    return JSON.stringify(current);
  }
  return current;
}
