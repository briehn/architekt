// Each script is one Redis transition. Redis TIME keeps rolling windows and UTC days
// consistent across serverless instances; a rejected or timed-out write is never retried.
export const RATE_ATTEMPT_SCRIPT = `
local key = KEYS[1]
if redis.call('TYPE', key).ok ~= 'none' and redis.call('TYPE', key).ok ~= 'zset' then return 'invalid-admission-state' end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[2])
if redis.call('ZCOUNT', key, now - window + 1, '+inf') >= tonumber(ARGV[1]) then return 'rate-limited' end
redis.call('ZADD', key, now, ARGV[3])
redis.call('PEXPIRE', key, window)
return 'allowed'
`;

export const ISSUE_INVITE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) ~= 0 then return 'collision' end
local t = redis.call('TIME')
local now = tonumber(t[1])
redis.call('HSET', KEYS[1], 'hash', ARGV[1], 'grant', ARGV[2], 'state', 'issued', 'created', now, 'expires', now + tonumber(ARGV[3]))
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 'issued'
`;

export const REDEEM_INVITE_SCRIPT = `
local switch, invite, grant, session, iprate, globalrate = unpack(KEYS)
local expectedHash, expectedGrant, ipLimit, ipWindow, globalLimit, globalWindow, sessionTtl, nonce = unpack(ARGV)
for _, key in ipairs({switch, session}) do
  local kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= 'string' then return 'invalid-admission-state' end
end
for _, key in ipairs({invite, grant}) do
  local kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= 'hash' then return 'invalid-admission-state' end
end
for _, key in ipairs({iprate, globalrate}) do
  local kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= 'zset' then return 'invalid-admission-state' end
end
local enabled = redis.call('GET', switch)
if enabled ~= 'enabled' and enabled ~= 'disabled' then return 'invalid-admission-state' end
if enabled == 'disabled' then return 'global-ai-disabled' end
local t = redis.call('TIME')
local seconds = tonumber(t[1])
local now = seconds * 1000 + math.floor(tonumber(t[2]) / 1000)
if redis.call('ZCOUNT', iprate, now - tonumber(ipWindow) + 1, '+inf') >= tonumber(ipLimit) or
   redis.call('ZCOUNT', globalrate, now - tonumber(globalWindow) + 1, '+inf') >= tonumber(globalLimit) then return 'rate-limited' end
redis.call('ZADD', iprate, now, nonce)
redis.call('PEXPIRE', iprate, tonumber(ipWindow))
redis.call('ZADD', globalrate, now, nonce)
redis.call('PEXPIRE', globalrate, tonumber(globalWindow))
if redis.call('EXISTS', invite) == 0 then return 'invalid-or-expired-access' end
local state = redis.call('HGET', invite, 'state')
if state == 'revoked' then return 'revoked-access' end
if state ~= 'issued' then return 'invalid-or-expired-access' end
local hash = redis.call('HGET', invite, 'hash')
local grantId = redis.call('HGET', invite, 'grant')
local expiry = tonumber(redis.call('HGET', invite, 'expires'))
if not hash or not grantId or not expiry then return 'invalid-admission-state' end
if grantId ~= expectedGrant then return 'invalid-admission-state' end
if hash ~= expectedHash or expiry <= seconds then return 'invalid-or-expired-access' end
if redis.call('EXISTS', grant) ~= 0 or redis.call('EXISTS', session) ~= 0 then return 'invalid-admission-state' end
redis.call('HSET', invite, 'state', 'consumed')
redis.call('HSET', grant, 'state', 'active', 'created', seconds, 'expires', seconds + tonumber(sessionTtl), 'used', 0)
redis.call('EXPIRE', grant, tonumber(sessionTtl) + 86400)
redis.call('SET', session, grantId, 'EX', tonumber(sessionTtl))
return 'enabled'
`;

export const ACCESS_STATUS_SCRIPT = `
local switch, session, grant = unpack(KEYS)
if redis.call('TYPE', switch).ok ~= 'string' then return 'invalid-admission-state' end
local enabled = redis.call('GET', switch)
if enabled ~= 'enabled' and enabled ~= 'disabled' then return 'invalid-admission-state' end
if enabled == 'disabled' then return 'global-ai-disabled' end
local sessionKind = redis.call('TYPE', session).ok
if sessionKind == 'none' then return 'invalid-or-expired-access' end
if sessionKind ~= 'string' then return 'invalid-admission-state' end
if redis.call('GET', session) ~= ARGV[1] then return 'invalid-or-expired-access' end
local grantKind = redis.call('TYPE', grant).ok
if grantKind == 'none' then return 'invalid-or-expired-access' end
if grantKind ~= 'hash' then return 'invalid-admission-state' end
local state = redis.call('HGET', grant, 'state')
local expiry = tonumber(redis.call('HGET', grant, 'expires'))
if state == 'revoked' then return 'revoked-access' end
if state ~= 'active' or not expiry then return 'invalid-admission-state' end
local t = redis.call('TIME')
if expiry <= tonumber(t[1]) then return 'invalid-or-expired-access' end
return 'enabled'
`;

export const ADMIT_SCRIPT = `
local switch, session, grant, grantRate, globalRate, grantConc, globalConc, reservation = unpack(KEYS)
local expectedGrant, units, grantRateLimit, globalRateLimit, rateWindow, grantUnits, globalUnits,
  grantConcLimit, globalConcLimit, ttl, reservationValue, prefix, member = unpack(ARGV)
local stringKeys = {switch, session, reservation}
for _, key in ipairs(stringKeys) do
  local kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= 'string' then return 'invalid-admission-state' end
end
local kind = redis.call('TYPE', grant).ok
if kind ~= 'none' and kind ~= 'hash' then return 'invalid-admission-state' end
for _, key in ipairs({grantRate, globalRate, grantConc, globalConc}) do
  kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= 'zset' then return 'invalid-admission-state' end
end
local enabled = redis.call('GET', switch)
if enabled ~= 'enabled' and enabled ~= 'disabled' then return 'invalid-admission-state' end
if enabled == 'disabled' then return 'global-ai-disabled' end
if redis.call('GET', session) ~= expectedGrant then return 'invalid-or-expired-access' end
if redis.call('TYPE', grant).ok ~= 'hash' then return 'invalid-or-expired-access' end
local state = redis.call('HGET', grant, 'state')
local expiry = tonumber(redis.call('HGET', grant, 'expires'))
local usedRaw = redis.call('HGET', grant, 'used')
local used = usedRaw and tonumber(usedRaw)
if state == 'revoked' then return 'revoked-access' end
if state ~= 'active' or not expiry or not usedRaw or not string.match(usedRaw, '^%d+$') or not used then return 'invalid-admission-state' end
local t = redis.call('TIME')
local seconds = tonumber(t[1])
local now = seconds * 1000 + math.floor(tonumber(t[2]) / 1000)
if expiry <= seconds then return 'invalid-or-expired-access' end
local day = math.floor(seconds / 86400)
local dayKey = prefix .. ':day:' .. day
kind = redis.call('TYPE', dayKey).ok
if kind ~= 'none' and kind ~= 'string' then return 'invalid-admission-state' end
local dailyRaw = redis.call('GET', dayKey)
local daily = dailyRaw and tonumber(dailyRaw) or 0
if (dailyRaw and not string.match(dailyRaw, '^%d+$')) or not daily or redis.call('EXISTS', reservation) ~= 0 then return 'invalid-admission-state' end
if redis.call('ZCOUNT', grantRate, now - tonumber(rateWindow) + 1, '+inf') >= tonumber(grantRateLimit) or
   redis.call('ZCOUNT', globalRate, now - tonumber(rateWindow) + 1, '+inf') >= tonumber(globalRateLimit) then return 'rate-limited' end
if used + tonumber(units) > tonumber(grantUnits) then return 'grant-allowance-exhausted' end
if daily + tonumber(units) > tonumber(globalUnits) then return 'global-budget-exhausted' end
if redis.call('ZCOUNT', grantConc, now + 1, '+inf') >= tonumber(grantConcLimit) or
   redis.call('ZCOUNT', globalConc, now + 1, '+inf') >= tonumber(globalConcLimit) then return 'concurrency-limited' end
redis.call('HINCRBY', grant, 'used', tonumber(units))
redis.call('INCRBY', dayKey, tonumber(units))
redis.call('EXPIREAT', dayKey, (day + 1) * 86400)
redis.call('ZADD', grantRate, now, member)
redis.call('PEXPIRE', grantRate, tonumber(rateWindow))
redis.call('ZADD', globalRate, now, member)
redis.call('PEXPIRE', globalRate, tonumber(rateWindow))
redis.call('ZREMRANGEBYSCORE', grantConc, '-inf', now)
redis.call('ZREMRANGEBYSCORE', globalConc, '-inf', now)
redis.call('ZADD', grantConc, now + tonumber(ttl) * 1000, member)
redis.call('ZADD', globalConc, now + tonumber(ttl) * 1000, member)
local ttlMs = tonumber(ttl) * 1000
if redis.call('PTTL', grantConc) < ttlMs then redis.call('PEXPIRE', grantConc, ttlMs) end
if redis.call('PTTL', globalConc) < ttlMs then redis.call('PEXPIRE', globalConc, ttlMs) end
redis.call('SET', reservation, reservationValue, 'EX', tonumber(ttl))
return 'approved'
`;

export const RELEASE_SCRIPT = `
local reservation, grantConc, globalConc = unpack(KEYS)
local kind = redis.call('TYPE', reservation).ok
if kind ~= 'none' and kind ~= 'string' then return 'invalid-admission-state' end
for _, key in ipairs({grantConc, globalConc}) do
  kind = redis.call('TYPE', key).ok
  if kind ~= 'none' and kind ~= 'zset' then return 'invalid-admission-state' end
end
local value = redis.call('GET', reservation)
if not value then return 'already-released' end
if value ~= ARGV[1] then return 'invalid-admission-state' end
redis.call('ZREM', grantConc, ARGV[2])
redis.call('ZREM', globalConc, ARGV[2])
redis.call('DEL', reservation)
return 'released'
`;

export const SET_SWITCH_SCRIPT = `
local kind = redis.call('TYPE', KEYS[1]).ok
if kind ~= 'none' and kind ~= 'string' then return 'invalid-admission-state' end
redis.call('SET', KEYS[1], ARGV[1])
return ARGV[1]
`;

export const REVOKE_SCRIPT = `
if redis.call('TYPE', KEYS[1]).ok == 'none' then return 'not-found' end
if redis.call('TYPE', KEYS[1]).ok ~= 'hash' then return 'invalid-admission-state' end
local state = redis.call('HGET', KEYS[1], 'state')
if state ~= 'issued' and state ~= 'consumed' and state ~= 'active' and state ~= 'revoked' then return 'invalid-admission-state' end
redis.call('HSET', KEYS[1], 'state', 'revoked')
return 'revoked'
`;

export const LOOKUP_SESSION_SCRIPT = `
local kind = redis.call('TYPE', KEYS[1]).ok
if kind == 'none' then return 'missing' end
if kind ~= 'string' then return 'invalid-admission-state' end
local grant = redis.call('GET', KEYS[1])
if not string.match(grant, '^[a-f0-9]+$') or string.len(grant) ~= 32 then return 'invalid-admission-state' end
return grant
`;

export const OPERATOR_STATUS_SCRIPT = `
local kind = redis.call('TYPE', KEYS[1]).ok
if kind == 'none' then return {'not-found'} end
if kind == 'string' then
  local state = redis.call('GET', KEYS[1])
  if state ~= 'enabled' and state ~= 'disabled' then return {'invalid-admission-state'} end
  return {state}
end
if kind ~= 'hash' then return {'invalid-admission-state'} end
local state = redis.call('HGET', KEYS[1], 'state') or ''
local expires = redis.call('HGET', KEYS[1], 'expires') or ''
local t = redis.call('TIME')
if (state == 'active' or state == 'issued') and tonumber(expires) and tonumber(expires) <= tonumber(t[1]) then state = 'expired' end
return {state, redis.call('HGET', KEYS[1], 'created') or '', expires, redis.call('HGET', KEYS[1], 'used') or ''}
`;
