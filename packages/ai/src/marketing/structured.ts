import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { generateChatCompletion } from "../chat";

export interface StructuredCallResult<T> {
  ok: boolean;
  data?: T;
  tokensUsed: number;
  costUsd: number;
  error?: string;
}

/**
 * Forced function-call with schema + validator and bounded retries.
 * Never trusts raw model text; a result is only returned when the
 * validator accepts the parsed arguments.
 */
export async function structuredCall<T>(options: {
  messages: ChatCompletionMessageParam[];
  functionName: string;
  description: string;
  parameters: Record<string, unknown>;
  validate: (raw: any) => T | null;
  maxAttempts?: number;
  temperature?: number;
}): Promise<StructuredCallResult<T>> {
  const maxAttempts = options.maxAttempts ?? 2;
  let tokensUsed = 0;
  let costUsd = 0;
  let lastError = "INVALID_STRUCTURED_OUTPUT";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await generateChatCompletion({
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        tools: [
          {
            type: "function",
            function: {
              name: options.functionName,
              description: options.description,
              parameters: options.parameters,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: options.functionName } },
      });
      tokensUsed += result.tokensUsed;
      costUsd += result.cost;

      const toolCall = result.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        lastError = "NO_TOOL_CALL";
        continue;
      }
      let parsed: any;
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        lastError = "UNPARSEABLE_ARGUMENTS";
        continue;
      }
      const validated = options.validate(parsed);
      if (validated !== null) {
        return { ok: true, data: validated, tokensUsed, costUsd };
      }
      lastError = "VALIDATION_FAILED";
    } catch (error: any) {
      lastError = error?.message ?? "AI_CALL_FAILED";
    }
  }

  return { ok: false, tokensUsed, costUsd, error: lastError };
}
