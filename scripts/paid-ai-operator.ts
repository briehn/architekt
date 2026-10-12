import { createPaidAiOperator, operatorCommandArgs } from "../src/server/paid-ai/operator.ts";
import { loadPaidAiRuntime } from "../src/server/paid-ai/runtime.ts";

const runtime = loadPaidAiRuntime();
if (!runtime) {
  process.stderr.write("Paid-AI operator configuration is unavailable.\n");
  process.exitCode = 1;
} else {
  const args = operatorCommandArgs(process.argv.slice(2), runtime.deployment);
  if (!args) {
    process.stderr.write("Production commands require --confirm-production.\n");
    process.exitCode = 1;
  } else {
    const [command, kind, id] = args;
    const operator = createPaidAiOperator(runtime.store, runtime.access);
    try {
      let result: unknown;
      switch (command) {
        case "issue-invite": result = await operator.issueInvite(); break;
        case "status":
          if (kind !== "switch" && kind !== "invite" && kind !== "grant") throw Error("Expected status switch|invite|grant [id]");
          result = await operator.status(kind, id); break;
        case "revoke":
          if ((kind !== "invite" && kind !== "grant") || !id) throw Error("Expected revoke invite|grant <id>");
          result = await operator.revoke(kind, id); break;
        case "enable": result = await operator.setEnabled(true); break;
        case "disable": result = await operator.setEnabled(false); break;
        default: throw Error("Expected issue-invite, status, revoke, enable, or disable");
      }
      // Only issue-invite output may include a plaintext credential.
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch {
      process.stderr.write("Operator command failed; inspect configuration and Redis availability.\n");
      process.exitCode = 1;
    }
  }
}
