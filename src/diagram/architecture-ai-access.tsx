"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { paidAiDenialEvent, paidAiDenialMessages, type PaidAiClientDenial } from "./architecture-ai-access-events";

type AccessStatus = "checking" | "enabled" | "access-required" | "expired" | "revoked" | "temporarily-unavailable";
export function useArchitectureAiAccess() {
  const [status, setStatus] = useState<AccessStatus>("checking");
  const [denial, setDenial] = useState<PaidAiClientDenial | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/ai-access/status", { cache: "no-store" });
      const body: unknown = await response.json();
      const next = body && typeof body === "object" && "status" in body &&
        ["enabled", "access-required", "expired", "revoked", "temporarily-unavailable"].includes(String(body.status))
        ? body.status as AccessStatus : "temporarily-unavailable";
      setStatus(next);
      return next === "enabled";
    } catch { setStatus("temporarily-unavailable"); return false; }
  }, []);

  useEffect(() => {
    const onDenial = (event: Event) => {
      setDenial((event as CustomEvent<PaidAiClientDenial>).detail);
      void refresh();
    };
    window.addEventListener(paidAiDenialEvent, onDenial);
    return () => window.removeEventListener(paidAiDenialEvent, onDenial);
  }, [refresh]);

  const redeem = useCallback(async (code: string): Promise<boolean> => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/ai-access/redeem", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }), cache: "no-store" });
      if (response.ok) {
        setDenial(null);
        const enabled = await refresh();
        setMessage(enabled ? "AI access enabled on this browser." : "AI features are temporarily unavailable.");
        return enabled;
      } else {
        setMessage(response.status === 429 ? paidAiDenialMessages["rate-limited"] : response.status === 503 ?
          paidAiDenialMessages["admission-store-unavailable"] : "This demo code is invalid or no longer available.");
        return false;
      }
    } catch { setMessage(paidAiDenialMessages["admission-store-unavailable"]); return false; }
    finally { setBusy(false); }
  }, [refresh]);

  const logout = useCallback(async (): Promise<boolean> => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/ai-access/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) { setMessage("Could not clear AI access. Try again."); return false; }
      setDenial(null);
      await refresh();
      setMessage("AI access disabled on this browser.");
      return true;
    } catch { setMessage("Could not clear AI access. Try again."); return false; }
    finally { setBusy(false); }
  }, [refresh]);

  return { status, enabled: status === "enabled", denial, denialMessage: denial ? paidAiDenialMessages[denial] : null,
    message, busy, refresh, redeem, logout };
}

type AccessControl = ReturnType<typeof useArchitectureAiAccess>;

export function ArchitectureAiAccessPanel({ access }: Readonly<{ access: AccessControl }>) {
  const [code, setCode] = useState("");
  const focusAfterChange = useRef<"enabled" | "disabled" | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const clearRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusAfterChange.current === "enabled" && access.enabled) { clearRef.current?.focus(); focusAfterChange.current = null; }
    if (focusAfterChange.current === "disabled" && !access.enabled && access.status !== "checking") { codeRef.current?.focus(); focusAfterChange.current = null; }
  }, [access.enabled, access.status]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = code;
    setCode("");
    focusAfterChange.current = "enabled";
    if (!(await access.redeem(submitted))) focusAfterChange.current = null;
  }
  return <section aria-label="Demo AI access" className="mb-4 border-b border-border pb-4 text-xs text-text-secondary">
    {access.status === "checking" ? <p role="status">Checking AI access…</p> : null}
    {access.enabled ? <div className="flex flex-wrap items-center justify-between gap-2">
      <p>Demo AI access enabled.</p>
      <button className="design-brief-secondary" disabled={access.busy} onClick={() => { focusAfterChange.current = "disabled"; void access.logout().then((cleared) => { if (!cleared) focusAfterChange.current = null; }); }} ref={clearRef} type="button">Disable AI access on this browser</button>
    </div> : <>
      <p>{access.status === "temporarily-unavailable" ? "AI features are temporarily unavailable." : "Enable AI access with a demo code."}</p>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => { void submit(event); }}>
        <label className="min-w-0 flex-1 font-semibold text-text-secondary">Demo code
          <input autoComplete="off" className="mt-1 block h-9 w-full min-w-0 rounded-sm border border-border bg-surface px-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" onChange={(event) => setCode(event.target.value)} ref={codeRef} type="text" value={code} />
        </label>
        <button className="design-brief-primary" disabled={access.busy || !code.trim()} type="submit">Enable AI access</button>
      </form>
    </>}
    {access.denialMessage ? <p className="mt-2 text-danger" role="alert">{access.denialMessage}</p> : null}
    {access.message ? <p className="mt-2" role="status">{access.message}</p> : null}
  </section>;
}
