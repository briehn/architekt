# Public demo deployment and operations

This runbook covers the approved Vercel + Upstash-compatible Redis release target. It is an operator procedure, not evidence that the public release has passed acceptance. The current gate is tracked in [TODO.md](../TODO.md). The [paid-AI command reference](paid-ai-operator.md) describes each CLI action.

## Services and isolation

- Connect the GitHub repository to a Vercel project and choose a production HTTPS origin. Keep preview AI disabled unless it has a separate exact HTTPS origin, Redis database, and credentials.
- Provide an Upstash-compatible managed Redis REST endpoint and write token. Use a dedicated production database; use a disposable, separately credentialed database for the atomic integration suite. The app adds `production`, `preview`, or `development` to its configured key prefix, but that prefix is not a substitute for separate database credentials.
- Use a dedicated OpenAI project/key for this demo. The owner should set conservative provider spending controls and billing alerts and know how to revoke/replace the key. Architekt's 2/1/8 admission units limit application requests, **not** exact tokens, dollars, or provider charges; alerts may lag spending.

Configure these **server-only** Vercel Production variables through Project Settings or a secure operator workflow. Never commit values, pass them on a shell command line, put them under `NEXT_PUBLIC_`, or paste them into an issue or chat:

| Category | Variables / rule |
| --- | --- |
| Provider | `OPENAI_API_KEY`; leave the existing model defaults unless an intentional evaluation supports an override. |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` for the production database. |
| Credential protection | Independent random 32-byte hex values for `ARCHITEKT_PAID_AI_CREDENTIAL_SECRET` and `ARCHITEKT_PAID_AI_IP_SECRET`. |
| Origin and namespace | `ARCHITEKT_PAID_AI_ALLOWED_ORIGINS` set to the exact production HTTPS origin; `ARCHITEKT_PAID_AI_NAMESPACE` set to a production-specific base prefix. |
| Policy | `ARCHITEKT_PAID_AI_POLICY_JSON` only if intentionally overriding validated defaults. Do not lower limits to make a failing release test pass. |

Vercel supplies `VERCEL=1` and `VERCEL_ENV=production` to its production functions. The app fails closed if required configuration, the exact-origin list, Redis, or the authoritative switch state is absent or invalid. `ARCHITEKT_PAID_AI_LOCAL_CLIENT_IP` is development-only. See [.env.example](../.env.example) for the variable names and [ARCHITECTURE.md](../ARCHITECTURE.md) for default limits and settlement semantics.

## Safe first deployment

1. Link the local repository to the intended Vercel project or import it through the dashboard; verify the GitHub branch and production domain before deploying. [Vercel's CLI deployment guide](https://vercel.com/docs/projects/deploy-from-cli) documents linking and production deployment. Do not assume a preview URL is the production origin.
2. Create/configure the production Redis database and server-only Vercel variables. Verify the named variables and their Production/Preview scopes without printing values. Redeploy after environment changes.
3. Deploy with the Redis control switch **unset/disabled**. Confirm the public Workbench loads and manual editing/export work while status reports AI unavailable and direct paid requests cannot reach a provider.
4. From a secure operator shell with the production variables injected into the process environment, set `VERCEL=1` and `VERCEL_ENV=production`. Run `npm run paid-ai:operator -- --confirm-production disable`, then `npm run paid-ai:operator -- --confirm-production status switch`. Expect `disabled`. Do not copy Vercel secrets into tracked `.env` files.
5. Verify the real managed Redis scripts with a separate disposable test database using `ARCHITEKT_TEST_REDIS_REST_URL` and `ARCHITEKT_TEST_REDIS_REST_TOKEN`: `npx vitest run src/server/paid-ai/paid-ai-redis.integration.test.ts`. Test single-use invite races, grant/global concurrency, allowance boundaries, release, and TTL without OpenAI calls. Never aim this destructive test fixture at the production database.
6. After origin, cookie, Redis, and no-invite checks pass, issue one test invite with `npm run paid-ai:operator -- --confirm-production issue-invite`. Its plaintext is shown **only once**; handle it privately and do not record terminal output. Enable with `npm run paid-ai:operator -- --confirm-production enable`. Recheck the switch and complete the invited browser acceptance.

The Vercel CLI can list configured variable **names** with `vercel env ls`; its [environment-variable guide](https://vercel.com/docs/cli/env) also describes running a command with environment variables injected without writing a local file. Check the selected project/environment before every operator command.

## Release acceptance record

Record actual URL, deployment identifier, browser versions, latency observations, and safe outcomes in a dated evaluation file. Do not mark [TODO.md](../TODO.md) complete until the deployed gates pass:

- Clean Chrome and Edge sessions: public editor, boundaries, Brief, Analysis, history, layout, JSON/Markdown/PNG, narrow light/dark UI; Brave representative smoke. No invite must not trigger a paid provider or microphone permission. Direct missing/opaque/cross-origin requests fail without permissive CORS.
- One invite: single-use redemption, `__Host-` Secure/HttpOnly/SameSite cookie over HTTPS, refresh, no browser storage/export leakage, safe logout. Inspect only hashed credential and operational Redis records.
- One real Generation, physical-microphone transcription in Chrome and Edge where available, and real Grounded Review. Check disclosure, evidence, explicit Apply, stale/Undo/Redo, transient state, and 2/1/8 shared admission units. Do not rerun the model-quality benchmarks.
- Controlled admissions: grant/global concurrency, rate and allowance denials, kill switch, revocation, Redis outage, provider failure, and cancellation through safe test seams. Restore production policy and Redis configuration after isolated tests; do not burn provider requests to test races or limits.
- Logs: inspect the acceptance window for prompts, diagram/Brief content, transcript/audio, provider response, invite, cookie, raw IP, hashes, and secrets. Telemetry may contain only workload, safe outcome/denial, latency, and units. Confirm production dependency audit and CI are clean.
- Focused keyboard and screen-reader speech check when available. If speech was not tested, record exactly: “Actual screen-reader speech was not manually verified.”

## Routine controls and incidents

- **Inspect:** `status switch`, `status invite <id>`, or `status grant <id>` with the production confirmation flag. IDs are non-secret operational identifiers. `status grant` returns safe usage units, not provider billing.
- **Revoke:** `revoke invite <id>` before redemption; after redemption use `revoke grant <id>` to invalidate the session centrally. Browser logout only clears that browser's cookie and does not reset allowance.
- **Suspicious traffic or spending:** `disable` first, inspect safe denial counts and provider spend controls, revoke affected grants, then rotate relevant credentials. Do not paste request bodies or secrets into logs/tickets.
- **Provider outage:** keep the public editor available; paid routes return safe errors. The switch may stay disabled until a controlled request succeeds. A previously admitted call may still incur provider charges after cancellation.
- **Redis outage:** paid AI must fail closed. Restore connectivity/control state and verify no provider construction before re-enabling. Never add a process-local fallback.
- **Secret rotation:** disable admissions, replace the affected server-only Vercel values, redeploy, then reinitialize/verify the switch. Rotating the credential-HMAC secret invalidates outstanding invites and sessions; coordinate new invites. Rotate Redis/OpenAI tokens through their providers and verify old credentials are revoked. Keep Preview isolated.
- **Rollback:** disable admissions before redeploying the last known-good Vercel deployment. Recheck exact origin, cookie, Redis namespace/control state, public editor, and direct unauthorized denial before re-enabling.
