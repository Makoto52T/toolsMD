export interface DuplicateResult {
  name: string;
  duplicate: boolean;
  confidence: number;
  reason: string;
}

async function checkOne(newName: string, existingName: string): Promise<DuplicateResult | null> {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a semantic duplicate detector. Compare two function names and decide if they represent the same functionality. Return ONLY valid JSON with no extra text.',
          },
          {
            role: 'user',
            content: `Compare these function names semantically. Are "${newName}" and "${existingName}" duplicates?\n\nReturn JSON: {"duplicate": boolean, "confidence": number (0-1), "reason": string (explain in one sentence)}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    // Parse JSON, handling potential markdown wrapping
    const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(jsonStr);
    return {
      name: existingName,
      duplicate: parsed.duplicate,
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  } catch (err) {
    console.warn(`AI duplicate check failed for "${existingName}":`, err);
    return null;
  }
}

export async function checkSemanticDuplicate(
  newName: string,
  existingNames: string[]
): Promise<DuplicateResult[]> {
  if (!process.env.DEEPSEEK_API_KEY || existingNames.length === 0) return [];

  const results: DuplicateResult[] = [];
  for (const existingName of existingNames) {
    const r = await checkOne(newName, existingName);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Lightweight local fallback: checks if names are exact/substring or share key words.
 * Used when DEEPSEEK_API_KEY is not set.
 */
export function fastDuplicateCheck(newName: string, existingNames: string[]): DuplicateResult[] {
  const newLower = newName.toLowerCase().trim();
  return existingNames.map(name => {
    const existingLower = name.toLowerCase().trim();
    if (newLower === existingLower) {
      return { name, duplicate: true, confidence: 1, reason: 'ชื่อตรงกันทุกประการ' };
    }
    if (newLower.includes(existingLower) || existingLower.includes(newLower)) {
      return { name, duplicate: true, confidence: 0.85, reason: 'ชื่อเป็น substring ของอีกชื่อหนึ่ง' };
    }
    return { name, duplicate: false, confidence: 0, reason: 'ไม่ซ้ำ' };
  });
}

export async function checkDuplicate(
  newName: string,
  existingNames: string[]
): Promise<DuplicateResult[]> {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('[AI] DEEPSEEK_API_KEY not set — using fast local duplicate check');
    return fastDuplicateCheck(newName, existingNames);
  }
  return checkSemanticDuplicate(newName, existingNames);
}
