import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const command = asString(ctx.config.command, "nanobot");
  const cwd = asString(ctx.config.cwd, process.cwd());

  // Check 1: Working directory
  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: false });
    checks.push({
      code: "cwd_valid",
      level: "info",
      message: `Working directory exists: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "cwd_invalid",
      level: "error",
      message: `Working directory not found: ${cwd}`,
      hint: "Create the directory or adjust the cwd config",
    });
  }

  // Check 2: Command available
  try {
    const runtimeEnv = ensurePathInEnv({ ...process.env });
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({
      code: "command_ok",
      level: "info",
      message: `Command '${command}' is available`,
    });
  } catch (err) {
    checks.push({
      code: "command_missing",
      level: "error",
      message: `Command '${command}' not found in PATH`,
      hint: "Install NanoBrain: pip install nanobot-ai",
    });
  }

  // Check 3: Hello probe
  try {
    const runtimeEnv = ensurePathInEnv({ ...process.env });
    const proc = await runChildProcess(
      "env-test",
      command,
      ["agent", "-m", "Respond with exactly: hello", "--output-format", "json", "--no-logs"],
      {
        cwd,
        env: runtimeEnv as Record<string, string>,
        timeoutSec: 30,
        graceSec: 5,
        onLog: async () => {},
      },
    );

    if ((proc.exitCode ?? 0) === 0) {
      try {
        const result = JSON.parse(proc.stdout.trim());
        if (result.exitCode === 0) {
          checks.push({
            code: "hello_ok",
            level: "info",
            message: `NanoBrain responded successfully (model: ${result.model || "unknown"})`,
          });
        } else {
          checks.push({
            code: "hello_error",
            level: "warn",
            message: `NanoBrain responded but returned exitCode ${result.exitCode}`,
          });
        }
      } catch {
        checks.push({
          code: "hello_parse_error",
          level: "warn",
          message: "NanoBrain ran but output was not valid JSON",
        });
      }
    } else {
      checks.push({
        code: "hello_failed",
        level: "warn",
        message: `NanoBrain hello probe failed with exit code ${proc.exitCode}`,
        hint: "Check NanoBrain config.json and provider setup",
      });
    }
  } catch (err) {
    checks.push({
      code: "hello_exception",
      level: "warn",
      message: `Hello probe error: ${(err as Error).message}`,
    });
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");

  return {
    adapterType: "nanobrain_local",
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
