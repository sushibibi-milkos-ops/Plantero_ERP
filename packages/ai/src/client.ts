import Anthropic from '@anthropic-ai/sdk';

/** Kullanılan model — yalnızca yapılandırılmış (tool-use) JSON çıktı için */
export const AI_MODEL = 'claude-sonnet-5';

/** `ANTHROPIC_API_KEY` yoksa null döner — çağıran kural tabanlı fallback'e düşer */
export function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

export type StructuredCompleteOptions = {
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
};

/**
 * Tool-use ile yapılandırılmış JSON yanıt yardımcısı.
 * İstemci yoksa veya API hatası olursa `null` döner; çağıran daima fallback'e düşmelidir.
 */
export async function structuredComplete<T>(opts: StructuredCompleteOptions): Promise<T | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: opts.inputSchema as any,
        },
      ],
      tool_choice: { type: 'tool', name: opts.toolName },
    });

    const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) return null;
    return toolUse.input as T;
  } catch {
    return null;
  }
}
