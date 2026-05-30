export interface FunctionInfo {
  name: string;
  description?: string;
}

export interface DuplicateResult {
  name: string;
  duplicate: boolean;
  confidence: number;
  reason: string;
}

function buildPrompt(newName: string, newDesc: string | undefined, existing: FunctionInfo): string {
  const newPart = newDesc
    ? `New function: name="${newName}", description="${newDesc}"`
    : `New function: "${newName}" (no description)`;
  const existingPart = existing.description
    ? `Existing function: name="${existing.name}", description="${existing.description}"`
    : `Existing function: "${existing.name}" (no description)`;
  return `Compare these two functions semantically. Use both name and description to determine if they represent the same functionality.\n\n${newPart}\n${existingPart}\n\nReturn JSON: {"duplicate": boolean, "confidence": number (0-1), "reason": string (explain in one sentence, in English)}`;
}

async function checkOne(newName: string, newDescription: string | undefined, existing: FunctionInfo): Promise<DuplicateResult | null> {
  try {
    const prompt = buildPrompt(newName, newDescription, existing);

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
            content: 'You are a semantic duplicate detector for software functions. Compare two functions by their name AND description (markdown text describing what the function does). Determine if they represent the same functionality. Return ONLY valid JSON with no extra text.',
          },
          {
            role: 'user',
            content: prompt,
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
      name: existing.name,
      duplicate: parsed.duplicate,
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  } catch (err) {
    console.warn(`AI duplicate check failed for "${existing.name}":`, err);
    return null;
  }
}

export async function checkSemanticDuplicate(
  newName: string,
  newDescription: string | undefined,
  existingFunctions: FunctionInfo[]
): Promise<DuplicateResult[]> {
  if (!process.env.DEEPSEEK_API_KEY || existingFunctions.length === 0) return [];

  const results: DuplicateResult[] = [];
  for (const existing of existingFunctions) {
    const r = await checkOne(newName, newDescription, existing);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Lightweight local fallback: checks if names are exact/substring or share key words.
 * Used when DEEPSEEK_API_KEY is not set.
 */
export function fastDuplicateCheck(
  newName: string,
  newDescription: string | undefined,
  existingFunctions: FunctionInfo[]
): DuplicateResult[] {
  const newLower = newName.toLowerCase().trim();
  return existingFunctions.map(fn => {
    const existingLower = fn.name.toLowerCase().trim();
    if (newLower === existingLower) {
      return { name: fn.name, duplicate: true, confidence: 1, reason: 'Name is identical' };
    }
    if (newLower.includes(existingLower) || existingLower.includes(newLower)) {
      return { name: fn.name, duplicate: true, confidence: 0.85, reason: 'Name is a substring of the other' };
    }
    return { name: fn.name, duplicate: false, confidence: 0, reason: 'Not duplicate' };
  });
}

export async function checkDuplicate(
  newName: string,
  newDescription: string | undefined,
  existingFunctions: FunctionInfo[]
): Promise<DuplicateResult[]> {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('[AI] DEEPSEEK_API_KEY not set — using fast local duplicate check');
    return fastDuplicateCheck(newName, newDescription, existingFunctions);
  }
  return checkSemanticDuplicate(newName, newDescription, existingFunctions);
}
