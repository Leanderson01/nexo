// fetch falso para o @ai-sdk/groq: guarda o corpo de cada requisição e devolve respostas
// enfileiradas no formato da API de chat completions do Groq (JSON ou SSE).

export interface GroqUsageBody {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens: number };
}

export interface FakeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type FakeReply = (body: unknown) => Response;

export interface FakeGroq {
  fetch: typeof fetch;
  requests: Record<string, unknown>[];
  reply: (fn: FakeReply) => void;
}

export function createFakeGroqFetch(): FakeGroq {
  const requests: Record<string, unknown>[] = [];
  const queue: FakeReply[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    const next = queue.shift();
    if (!next) throw new Error("fetch falso sem resposta enfileirada");
    return next(body);
  };
  return { fetch: fakeFetch, requests, reply: (fn) => queue.push(fn) };
}

function usageOf(input: number, output: number, cached = 0): GroqUsageBody {
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: input + output,
    prompt_tokens_details: { cached_tokens: cached },
  };
}

export function jsonCompletion(
  model: string,
  content: string,
  usage: { input: number; output: number; cached?: number },
): FakeReply {
  return () =>
    Response.json({
      id: "chatcmpl-falso",
      created: 1,
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: usageOf(usage.input, usage.output, usage.cached),
    });
}

export function rateLimited(retryAfterSeconds: number): FakeReply {
  return () =>
    Response.json(
      { error: { message: "Rate limit reached", type: "tokens", code: "rate_limit_exceeded" } },
      { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
    );
}

function sse(chunks: unknown[]): Response {
  const text =
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

function chunk(model: string, delta: unknown, finishReason: string | null, extra = {}) {
  return {
    id: "chatcmpl-falso",
    created: 1,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...extra,
  };
}

export function streamToolCall(
  model: string,
  call: FakeToolCall,
  usage: { input: number; output: number; cached?: number },
): FakeReply {
  return () =>
    sse([
      chunk(
        model,
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            },
          ],
        },
        null,
      ),
      chunk(model, {}, "tool_calls", {
        x_groq: { usage: usageOf(usage.input, usage.output, usage.cached) },
      }),
    ]);
}

export function streamText(
  model: string,
  pieces: string[],
  usage: { input: number; output: number; cached?: number },
): FakeReply {
  return () =>
    sse([
      ...pieces.map((piece) => chunk(model, { content: piece }, null)),
      chunk(model, {}, "stop", {
        x_groq: { usage: usageOf(usage.input, usage.output, usage.cached) },
      }),
    ]);
}
