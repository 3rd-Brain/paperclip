import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  parseObject,
  buildPaperclipEnv,
  joinPromptSections,
  buildInvocationEnvForLogs,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  resolveCommandForLogs,
  renderTemplate,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { parseNanobotStreamJson } from "./parse.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  // --- Config ---
  const command = asString(config.command, "nanobot");
  const model = asString(config.model, "");
  const maxTurns = asNumber(config.maxTurnsPerRun, 0);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 20);

  // --- Workspace ---
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const configuredCwd = asString(config.cwd, "");
  const cwd = workspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  // --- Environment ---
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  // Forward workspace context
  const workspaceSource = asString(workspaceContext.source, "");
  const workspaceId = asString(workspaceContext.workspaceId, "") || null;
  if (workspaceCwd) env.PAPERCLIP_WORKSPACE_CWD = workspaceCwd;
  if (workspaceSource) env.PAPERCLIP_WORKSPACE_SOURCE = workspaceSource;
  if (workspaceId) env.PAPERCLIP_WORKSPACE_ID = workspaceId;

  // Forward task/wake context
  const taskId = asString(context.taskId, "") || asString(context.issueId, "") || null;
  const wakeReason = asString(context.wakeReason, "") || null;
  if (taskId) env.PAPERCLIP_TASK_ID = taskId;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;

  // Apply config env overrides
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  if (authToken) env.PAPERCLIP_API_KEY = authToken;

  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  await ensureCommandResolvable(command, cwd, runtimeEnv);

  // --- Prompt ---
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your NanoBrain work.",
  );
  const bootstrapTemplate = asString(config.bootstrapPromptTemplate, "");
  const handoff = asString(context.paperclipSessionHandoffMarkdown, "");
  const isResume = !!(runtime.sessionParams && Object.keys(runtime.sessionParams).length > 0);

  const sections: string[] = [];
  if (!isResume && bootstrapTemplate) {
    sections.push(renderTemplate(bootstrapTemplate, { agent, context, runId }));
  }
  if (handoff) {
    sections.push(handoff);
  }
  sections.push(renderTemplate(promptTemplate, { agent, context, runId }));
  const prompt = joinPromptSections(sections);

  // --- Session ---
  const sessionId = isResume
    ? asString(runtime.sessionParams?.sessionId, "")
    : "";

  // --- Build CLI args ---
  const args: string[] = [
    "agent",
    "-m", prompt,
    "--output-format", "stream-json",
    "--no-logs",
  ];
  if (sessionId) {
    args.push("--session", sessionId);
  }
  if (cwd) {
    args.push("--workspace", cwd);
  }

  // --- Invoke ---
  const loggedEnv = buildInvocationEnvForLogs(env, { runtimeEnv });
  const resolvedCommand = await resolveCommandForLogs(command, cwd, runtimeEnv);

  if (onMeta) {
    await onMeta({
      adapterType: "nanobrain_local",
      command: resolvedCommand,
      cwd,
      commandArgs: args,
      env: loggedEnv,
      prompt,
    });
  }

  const proc = await runChildProcess(runId, command, args, {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onLog: onLog ?? (async () => {}),
  });

  // --- Parse result ---
  const parsed = parseNanobotStreamJson(proc.stdout);

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `NanoBrain timed out after ${timeoutSec}s`,
      errorCode: "timeout",
    };
  }

  if ((proc.exitCode ?? 0) !== 0 && !parsed.content) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: false,
      errorMessage: proc.stderr || `NanoBrain exited with code ${proc.exitCode}`,
      errorCode: "process_error",
    };
  }

  return {
    exitCode: parsed.exitCode,
    signal: proc.signal,
    timedOut: false,
    usage: {
      inputTokens: parsed.usage.inputTokens,
      outputTokens: parsed.usage.outputTokens,
    },
    sessionId: parsed.sessionId || sessionId || null,
    sessionParams: parsed.sessionId ? { sessionId: parsed.sessionId, cwd } : null,
    sessionDisplayId: parsed.sessionId || null,
    provider: parsed.provider || null,
    model: parsed.model || model || null,
    billingType: "api",
    summary: parsed.summary || null,
    resultJson: { content: parsed.content, toolCalls: parsed.toolCalls },
  };
}
