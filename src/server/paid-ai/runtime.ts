import { isIP } from "node:net";
import { createPaidAiAccess, logPaidAiEvent } from "./access.ts";
import { parsePaidAiPolicyOverride } from "./policy.ts";
import { createPaidAiRedisStore, createUpstashRedisExecutor } from "./redis-store.ts";
import { configuredPaidAiOrigins } from "./request.ts";

export type PaidAiRuntime = Readonly<{
  access: ReturnType<typeof createPaidAiAccess>;
  store: ReturnType<typeof createPaidAiRedisStore>;
  policy: NonNullable<ReturnType<typeof parsePaidAiPolicyOverride>>;
  deployment: "production" | "preview" | "development";
  localClientIp?: string;
}>;

/** Missing or malformed production configuration never creates an in-memory fallback. */
export function loadPaidAiRuntime(env: Readonly<Record<string, string | undefined>> = process.env): PaidAiRuntime | undefined {
  const endpoint = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  const credentialSecret = env.ARCHITEKT_PAID_AI_CREDENTIAL_SECRET;
  const ipSecret = env.ARCHITEKT_PAID_AI_IP_SECRET;
  const baseNamespace = env.ARCHITEKT_PAID_AI_NAMESPACE ?? "architekt";
  const policy = parsePaidAiPolicyOverride(env.ARCHITEKT_PAID_AI_POLICY_JSON);
  // The approved deployment target is Vercel; another production host needs its own trusted-IP/cookie decision.
  if (env.NODE_ENV === "production" && env.VERCEL !== "1") return;
  if (!endpoint || !token || !credentialSecret || !ipSecret || !/^[a-fA-F0-9]{64}$/.test(credentialSecret) ||
    !/^[a-fA-F0-9]{64}$/.test(ipSecret) || !/^[a-z0-9:_-]{1,64}$/.test(baseNamespace) || !policy) return;
  const deployment = env.VERCEL === "1" ? env.VERCEL_ENV === "production" ? "production" :
    env.VERCEL_ENV === "preview" ? "preview" : undefined : "development";
  if (!deployment) return;
  if (!configuredPaidAiOrigins(env.ARCHITEKT_PAID_AI_ALLOWED_ORIGINS, deployment)) return;
  const localClientIp = deployment === "development" && isIP(env.ARCHITEKT_PAID_AI_LOCAL_CLIENT_IP ?? "")
    ? env.ARCHITEKT_PAID_AI_LOCAL_CLIENT_IP : undefined;
  try {
    const executor = createUpstashRedisExecutor(endpoint, token);
    const store = createPaidAiRedisStore(executor, `${baseNamespace}:${deployment}`);
    return { store, policy, deployment, localClientIp,
      access: createPaidAiAccess({ store, policy, credentialSecret, ipSecret, telemetry: logPaidAiEvent }) };
  } catch { return; }
}
