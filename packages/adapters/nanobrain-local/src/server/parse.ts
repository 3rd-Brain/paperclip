export interface NanobotStreamEvent {
  event: string;
  content?: string;
  toolHint?: boolean;
  resuming?: boolean;
  exitCode?: number;
  sessionId?: string;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
  provider?: string;
  toolCalls?: number;
  summary?: string;
}

export interface NanobotResult {
  exitCode: number;
  sessionId: string | null;
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string | null;
  provider: string | null;
  toolCalls: number;
  summary: string;
}

export function parseNanobotStreamJson(stdout: string): NanobotResult {
  const lines = stdout.trim().split("\n").filter(l => l.trim());
  let result: NanobotResult = {
    exitCode: 1,
    sessionId: null,
    content: "",
    usage: { inputTokens: 0, outputTokens: 0 },
    model: null,
    provider: null,
    toolCalls: 0,
    summary: "",
  };

  for (const line of lines) {
    try {
      const evt: NanobotStreamEvent = JSON.parse(line);
      if (evt.event === "result") {
        result = {
          exitCode: evt.exitCode ?? 0,
          sessionId: evt.sessionId ?? null,
          content: evt.content ?? "",
          usage: evt.usage ?? { inputTokens: 0, outputTokens: 0 },
          model: evt.model ?? null,
          provider: evt.provider ?? null,
          toolCalls: evt.toolCalls ?? 0,
          summary: evt.summary ?? "",
        };
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return result;
}
