import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

export const ENDPOINTS = Object.freeze({
  issuer: 'https://auth.openai.com',
  discovery: 'https://auth.openai.com/.well-known/openid-configuration',
  jwks: 'https://auth.openai.com/.well-known/jwks.json',
  authorize: 'https://auth.openai.com/api/accounts/authorize',
  token: 'https://auth.openai.com/api/accounts/oauth/token',
  revoke: 'https://auth.openai.com/api/accounts/oauth/revoke',
  models: 'https://api.openai.com/v1/models',
  responses: 'https://api.openai.com/v1/responses',
  resource: 'https://api.openai.com/v1',
});
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export class ProofError extends Error {
  constructor(code, status = null) { super(code); this.code = code; this.status = status; }
}
export function requireThat(condition, code) { if (!condition) throw new ProofError(code); }
export function equalSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0 &&
    Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function newAttempt({ hostId, port, registration }) {
  requireThat(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hostId), 'INVALID_HOST_ID');
  requireThat(Number.isInteger(port) && port > 0 && port <= 65535, 'INVALID_LOOPBACK_PORT');
  if (registration) requireThat(registration.client_id && registration.client_id !== 'dynamic_agent_client', 'INVALID_SAVED_CLIENT');
  const attempt = {
    hostId, state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'), redirectUri: `http://127.0.0.1:${port}/auth/callback`,
    clientId: registration?.client_id || 'dynamic_agent_client', registration,
    expiresAt: Date.now() + 10 * 60_000,
  };
  const url = new URL(ENDPOINTS.authorize);
  const params = { client_id: attempt.clientId, ext_agent_host_id: hostId,
    response_type: 'code', redirect_uri: attempt.redirectUri, scope: SCOPES,
    resource: ENDPOINTS.resource, state: attempt.state, nonce: attempt.nonce,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url') };
  if (!registration) params.agent_name_hint = 'Auric Mechanics Local Reading Proof';
  // Hints are optional. Keeping tokens out of all browser URLs simplifies this bounded harness.
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return { attempt, url: url.toString() };
}
export function validateCallback(attempt, url) {
  requireThat(attempt && Date.now() < attempt.expiresAt, 'AUTH_ATTEMPT_EXPIRED');
  requireThat(url.origin + url.pathname === attempt.redirectUri, 'CALLBACK_URI_MISMATCH');
  for (const key of ['state', 'code', 'client_id', 'error']) requireThat(url.searchParams.getAll(key).length <= 1, 'AMBIGUOUS_CALLBACK');
  requireThat(equalSecret(url.searchParams.get('state'), attempt.state), 'OAUTH_STATE_MISMATCH');
  if (url.searchParams.has('error')) throw new ProofError(url.searchParams.get('error') === 'access_denied' ? 'CONSENT_DECLINED' : 'OAUTH_DENIED');
  const code = url.searchParams.get('code');
  requireThat(code && code.length < 8192, 'CODE_MISSING');
  const issued = url.searchParams.get('client_id');
  const clientId = issued || (attempt.clientId !== 'dynamic_agent_client' ? attempt.clientId : null);
  requireThat(typeof clientId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(clientId) && clientId !== 'dynamic_agent_client', 'ISSUED_CLIENT_MISSING');
  if (attempt.registration) requireThat(clientId === attempt.clientId, 'REGISTRATION_MISMATCH');
  return { code, clientId };
}
export function validateIdToken(token, jwks, { clientId, nonce, priorIdentity, now = Date.now() / 1000 }) {
  requireThat(typeof token === 'string' && token.length < 32000, 'ID_TOKEN_MISSING');
  let header, claims, parts;
  try { parts = token.split('.'); requireThat(parts.length === 3, 'ID_TOKEN_MALFORMED');
    header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  } catch { throw new ProofError('ID_TOKEN_MALFORMED'); }
  requireThat(header.alg === 'RS256' && !header.crit && typeof header.kid === 'string', 'ID_TOKEN_ALGORITHM');
  const keys = jwks.keys?.filter(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')) || [];
  requireThat(keys.length === 1, 'ID_TOKEN_KEY_MISSING');
  requireThat(verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), createPublicKey({ key: keys[0], format: 'jwk' }), Buffer.from(parts[2], 'base64url')), 'ID_TOKEN_SIGNATURE');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  requireThat(claims.iss === ENDPOINTS.issuer && audience.includes(clientId) &&
    (audience.length === 1 || claims.azp === clientId) && (!claims.azp || claims.azp === clientId), 'ID_TOKEN_IDENTITY');
  requireThat(Number.isFinite(claims.exp) && claims.exp > now && Number.isFinite(claims.iat) && claims.iat <= now + 60 && (!claims.nbf || claims.nbf <= now + 60), 'ID_TOKEN_EXPIRED');
  if (nonce !== undefined) requireThat(equalSecret(claims.nonce, nonce), 'ID_TOKEN_NONCE');
  requireThat(typeof claims.sub === 'string' && claims.sub.length > 0, 'ID_TOKEN_SUBJECT');
  if (priorIdentity) requireThat(priorIdentity.subject === claims.sub && priorIdentity.issuer === claims.iss, 'ACCOUNT_CHANGED');
  return { issuer: claims.iss, subject: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
}
export function assertPlanGrant(session, { allowExpired = false } = {}) {
  requireThat(session?.validatedIdentity === true && typeof session.access_token === 'string' && session.access_token && !session.access_token.startsWith('sk-'), 'OAUTH_SESSION_REQUIRED');
  requireThat(session.resource === ENDPOINTS.resource, 'RESOURCE_PERMISSION_MISSING');
  requireThat(['openid', 'resource.invoke', 'chatgpt.tokens.use.direct'].every(s => session.scopes?.includes(s)), 'PLAN_SCOPE_MISSING');
  if (!allowExpired) requireThat(Number.isFinite(session.expiresAt) && session.expiresAt > Date.now(), 'ACCESS_TOKEN_EXPIRED');
}
export function modelChoices(body) {
  requireThat(Array.isArray(body?.models), 'MODEL_CATALOGUE_FORMAT');
  return body.models.filter(m => m.visibility === 'list' && typeof m.slug === 'string' && typeof m.display_name === 'string')
    .map(m => ({ slug: m.slug, display_name: m.display_name,
      reasoningEfforts: Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map(r=>r.effort).filter(e=>typeof e==='string') : [] }));
}
/** Preserve reported counters; absent cache-write/usage fields remain unknown. */
export function responseUsage(value){
 const counters={};
 const walk=(v,prefix='',depth=0)=>{if(!v||typeof v!=='object'||Array.isArray(v)||depth>2)return;for(const [key,n] of Object.entries(v)){const path=prefix+key;if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&/tokens$/.test(key))counters[path]=n;else if(n&&typeof n==='object')walk(n,path+'.',depth+1);}};walk(value);
 const pick=(...keys)=>{for(const key of keys)if(counters[key]!==undefined)return counters[key];return null;};
 return {status:Object.keys(counters).length?'reported':'unavailable',inputTokens:pick('input_tokens'),cachedInputTokens:pick('input_tokens_details.cached_tokens'),cacheWriteTokens:pick('input_tokens_details.cache_write_tokens','input_tokens_details.cache_creation_tokens','input_tokens_details.write_tokens','cache_creation_input_tokens'),outputTokens:pick('output_tokens'),reasoningTokens:pick('output_tokens_details.reasoning_tokens'),totalTokens:pick('total_tokens'),reportedCounters:counters,subscriptionAllowancePercent:null};
}
export async function consumeStream(response) {
  requireThat(response.ok, 'HTTP_INFERENCE_FAILED');
  const contentType=response.headers.get('content-type');
  // Some transports omit headers. Accept them only if the body still passes
  // the complete strict SSE and terminal-event validation below.
  requireThat(contentType===null||contentType.includes('text/event-stream'), 'STREAM_FORMAT');
  let buffer = '', text = '', terminal = null, responseId = null, usage=responseUsage(null); const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
    requireThat(buffer.length < 4_000_000, 'STREAM_EVENT_TOO_LARGE');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      let event; try { event = JSON.parse(data); } catch { throw new ProofError('STREAM_JSON_INVALID'); }
      if(event.response?.usage)usage=responseUsage(event.response.usage);
      const failWithUsage=code=>{const error=new ProofError(code);error.usage=usage;throw error;};
      if (event.type === 'response.failed') failWithUsage(typeof event.response?.error?.code === 'string' && /^[a-zA-Z0-9_]{1,100}$/.test(event.response.error.code) ? event.response.error.code : 'STREAM_FAILED');
      if (event.type === 'response.incomplete' || event.type === 'error') failWithUsage('STREAM_INCOMPLETE');
      if (event.type === 'response.output_text.delta') { requireThat(!terminal && typeof event.delta === 'string', 'STREAM_ORDER'); text += event.delta; requireThat(text.length < 2_000_000, 'OUTPUT_TOO_LARGE'); }
      if (event.type === 'response.completed') { requireThat(!terminal && event.response?.status === 'completed', 'STREAM_COMPLETION_INVALID'); terminal = 'response.completed'; responseId = event.response.id; }
    }
  }
  buffer += decoder.decode();
  requireThat(!buffer.trim(), 'STREAM_TRUNCATED_EVENT');
  requireThat(terminal === 'response.completed' && text.trim(), 'STREAM_INTERRUPTED');
  return { text, responseId, terminal, usage };
}
