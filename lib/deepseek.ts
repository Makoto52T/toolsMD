// Minimal DeepSeek chat client (OpenAI-compatible API). The project has a
// DEEPSEEK_API_KEY in env (no ANTHROPIC_API_KEY), so the Wiki Ingest feature
// uses DeepSeek to transform raw content into an Obsidian-style wiki page.
//
// Node 20 ships a global fetch, so no SDK dependency is needed.

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export function hasDeepSeekKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

// Calls DeepSeek chat completions and returns the assistant message text.
// Throws on missing key, network error, or non-2xx response so callers can
// surface a clear error to the user (the API route maps this to a 502).
export async function deepseekChat(
  messages: DeepSeekMessage[],
  opts: DeepSeekChatOptions = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? 'deepseek-chat',
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 4096,
      stream: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`DeepSeek API ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek API returned no content');
  }
  return content;
}
