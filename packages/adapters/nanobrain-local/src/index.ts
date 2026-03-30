export const type = "nanobrain_local";
export const label = "NanoBrain (local)";

export const models = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "deepseek-r1", label: "DeepSeek R1" },
];

export const agentConfigurationDoc = `# nanobrain_local agent configuration

Adapter: nanobrain_local

NanoBrain is a role-native digital worker agent with 6-layer ICM context
hierarchy, self-verifying skills (TDD), and 25+ LLM provider support.

Core fields:
- cwd (string, optional): NanoBrain workspace directory (created if missing)
- command (string, optional): CLI command, defaults to "nanobot"
- model (string, optional): LLM model identifier
- promptTemplate (string, optional): heartbeat prompt template with {{agent.id}}, {{context}} vars
- bootstrapPromptTemplate (string, optional): first-run prompt for fresh sessions
- maxTurnsPerRun (number, optional): max agent loop iterations per run
- env (object, optional): KEY=VALUE environment variables
- workspaceStrategy (object, optional): execution workspace strategy

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (0 = no limit)
- graceSec (number, optional): SIGTERM grace period before SIGKILL (default 20)

Notes:
- NanoBrain manages its own context via ICM layers (SOUL.md, MANAGER.md, PROJECT.md)
- Sessions persist across heartbeats via NanoBrain's workspace filesystem
- Skills are synced ephemerally per-run from Paperclip's skills directory
- Supports 25+ LLM providers via NanoBrain's ProviderRegistry
`;
