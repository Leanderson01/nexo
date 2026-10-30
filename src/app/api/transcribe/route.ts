import { readLlmConfig, type LlmConfig } from "@/agent/llm/models";
import { MAX_RECORDING_SECONDS } from "@/features/voice/audio-format";
import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { transcribeApiError } from "@/features/voice/transcribe-errors";
import { api } from "../../../../convex/_generated/api";
import { handleTranscribe } from "./handle-transcribe";
import { createGroqTranscriber } from "./transcriber";

// POST /api/transcribe (§9, §11.1): áudio do microfone → texto editável no campo de mensagem.
// O contrato e as validações estão em `handle-transcribe.ts`; aqui só ligamos a sessão do
// Convex e o Whisper do Groq.

export async function POST(request: Request) {
  const config = readConfig();
  const agentSecret = process.env.AGENT_SERVER_SECRET;
  if (!config || !agentSecret) return transcribeApiError("unavailable");

  try {
    const convex = await createConvexClientForCurrentUser();
    return await handleTranscribe(request, {
      findCallerRole: async () => {
        if (!convex) return null;
        const person = await convex.query(api.auth.currentPerson, {});
        return person?.role ?? null;
      },
      transcribe: createGroqTranscriber(config),
      model: config.transcriptionModel,
      maxSeconds: readMaxSeconds(),
      // Limites diários da §12.3 (convex/usage.ts). Só chegam aqui com sessão de funcionário.
      isWithinDailyLimit: async () => {
        const allowed = await convex!.query(api.usage.checkTranscription, { secret: agentSecret });
        return allowed.ok;
      },
      recordUsage: async (seconds) => {
        await convex!.mutation(api.usage.recordTranscription, { secret: agentSecret, seconds });
      },
    });
  } catch (error) {
    // Erros esperados já viram resposta no handler; aqui só chega o inesperado (Convex, rede).
    console.error("[transcribe] falha inesperada", error);
    return transcribeApiError("unavailable");
  }
}

function readConfig(): LlmConfig | null {
  try {
    return readLlmConfig(process.env);
  } catch (error) {
    console.error("[transcribe] configuração do LLM incompleta", error);
    return null;
  }
}

/** `TRANSCRIPTION_MAX_SECONDS`, com os 60 s da §11.1 quando falta ou é inválido. */
function readMaxSeconds(): number {
  const value = Number(process.env.TRANSCRIPTION_MAX_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : MAX_RECORDING_SECONDS;
}
