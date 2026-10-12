import type { createPaidAiAccess } from "./access.ts";
import { RedisStateError, type PaidAiStore } from "./redis-store.ts";

export function operatorCommandArgs(args: readonly string[], deployment: "production" | "preview" | "development"): readonly string[] | undefined {
  return deployment === "production" ? args[0] === "--confirm-production" ? args.slice(1) : undefined : args;
}

export function createPaidAiOperator(store: PaidAiStore, access: ReturnType<typeof createPaidAiAccess>) {
  const validId = (id: string) => /^[a-f0-9]{32}$/.test(id);
  return {
    issueInvite: () => access.issueInvite(),
    async setEnabled(enabled: boolean): Promise<{ state: "enabled" | "disabled" }> {
      await store.setEnabled(enabled);
      return { state: enabled ? "enabled" : "disabled" };
    },
    async status(kind: "switch" | "invite" | "grant", id?: string): Promise<Readonly<Record<string, string | number>>> {
      if (kind !== "switch" && (!id || !validId(id))) throw new RedisStateError();
      const fields = await store.operatorStatus(kind, id);
      if (fields[0] === "not-found") return { state: "not-found" };
      if (fields[0] === "invalid-admission-state") throw new RedisStateError();
      if (kind === "switch") {
        if (fields.length !== 1 || (fields[0] !== "enabled" && fields[0] !== "disabled")) throw new RedisStateError();
        return { state: fields[0] };
      }
      const allowed = kind === "invite" ? ["issued", "consumed", "revoked", "expired"] : ["active", "revoked", "expired"];
      if (fields.length !== 4 || !allowed.includes(fields[0]) || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2]) ||
        (kind === "grant" && !/^\d+$/.test(fields[3]))) throw new RedisStateError();
      return { state: fields[0], createdAtUnixSeconds: Number(fields[1]), expiresAtUnixSeconds: Number(fields[2]),
        ...(kind === "grant" ? { usedUnits: Number(fields[3]) } : {}) };
    },
    async revoke(kind: "invite" | "grant", id: string): Promise<{ state: "revoked" | "not-found" }> {
      if (!validId(id)) throw new RedisStateError();
      return { state: await store.revoke(kind, id) };
    },
  };
}
