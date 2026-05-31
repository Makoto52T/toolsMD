import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import axios, { AxiosError } from 'axios';

// POST /api/functions/[id]/execute
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

    // ── Puppeteer: not supported yet ──
    if (fn.fn_type === 'puppeteer') {
      return NextResponse.json({
        success: false,
        message: 'Puppeteer execution requires VPS'
      });
    }

    // ── HTTP execution ──
    if (fn.fn_type === 'http') {
      const schema = typeof fn.schema === 'string' ? JSON.parse(fn.schema) : (fn.schema || {});
      const config = schema.config || {};
      const method = (config.method || 'GET').toLowerCase();
      const url = config.url;

      if (!url) {
        return NextResponse.json(
          { success: false, message: 'URL is required for HTTP execution' },
          { status: 400 }
        );
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
      const duration = Date.now() - t0;

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

      return NextResponse.json({
        success: response.status >= 200 && response.status < 400,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: respBody,
        duration_ms: duration,
        extracts,
      });
    }

    // ── Custom / unknown type ──
    return NextResponse.json({
      success: false,
      message: `Execution not supported for function type: ${fn.fn_type}`
    }, { status: 400 });

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
