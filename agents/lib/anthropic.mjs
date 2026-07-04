// Minimal, zero-dependency Anthropic Messages API client (structured output via tool use).
// Keeps the project's no-deps ethos. Requires ANTHROPIC_API_KEY in the environment.
const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Call the model and force a single tool call, returning its validated input object.
 * @param {{model:string, system:string, prompt:string, tool:object, maxTokens?:number}} o
 */
export async function extractWithTool({ model, system, prompt, tool, maxTokens = 4096 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  const block = (data.content || []).find((c) => c.type === 'tool_use');
  return block ? block.input : null;
}
