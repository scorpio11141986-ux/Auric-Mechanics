import { ENDPOINTS, ProofError, requireThat, validateCallback, validateIdToken, assertPlanGrant, modelChoices, sha256, consumeStream } from './protocol.mjs';

export class Connection {
  constructor({ store, fetchImpl = fetch, receipt = (_kind, _data) => {} }) { this.store = store; this.fetch = fetchImpl; this.receipt = receipt; this.refreshing = null; }
  async request(url, options = {}) {
    requireThat(Object.values(ENDPOINTS).includes(url), 'UNSUPPORTED_ENDPOINT');
    try { return await this.fetch(url, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(30_000) }); }
    catch { throw new ProofError('NETWORK_UNAVAILABLE'); }
  }
  async json(url, options) {
    const r = await this.request(url, options);
    let body; try { body = await r.json(); } catch { throw new ProofError('HTTP_BODY_NOT_JSON', r.status); }
    if (!r.ok) {
      const raw = body?.error?.code || body?.error;
      const code = typeof raw === 'string' && /^[a-zA-Z0-9_]{1,100}$/.test(raw) ? raw : `HTTP_${r.status}`;
      this.receipt('http-error', { endpoint: url, status: r.status, code, bodyKeys: Object.keys(body || {}), requestId: r.headers.get('x-request-id') });
      throw new ProofError(code, r.status);
    }
    return body;
  }
  async metadata() {
    const m = await this.json(ENDPOINTS.discovery);
    requireThat(m.issuer === ENDPOINTS.issuer && m.authorization_endpoint === ENDPOINTS.authorize && m.token_endpoint === ENDPOINTS.token && m.jwks_uri === ENDPOINTS.jwks && m.revocation_endpoint === ENDPOINTS.revoke, 'OIDC_METADATA_MISMATCH');
    return m;
  }
  async tokenRequest(fields) {
    return this.json(ENDPOINTS.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  }
  async acceptCallback(attempt, url) {
    const { code, clientId } = validateCallback(attempt, url);
    // Preserve a new registration for retry without persisting an authorization code.
    if (!attempt.registration) await this.store('save', { client_id: clientId, ext_agent_host_id: attempt.hostId, validatedIdentity: false });
    await this.metadata();
    const tokens = await this.tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code,
      code_verifier: attempt.verifier, redirect_uri: attempt.redirectUri, resource: ENDPOINTS.resource });
    const keys = await this.json(ENDPOINTS.jwks);
    const identity = validateIdToken(tokens.id_token, keys, { clientId, nonce: attempt.nonce,
      priorIdentity: attempt.registration?.identity });
    requireThat(tokens.token_type?.toLowerCase() === 'bearer' && typeof tokens.access_token === 'string' &&
      Number.isFinite(tokens.expires_in) && tokens.expires_in > 0 && typeof tokens.scope === 'string', 'TOKEN_RESPONSE_INVALID');
    const session = { ...identity, identity, validatedIdentity: true, client_id: clientId, ext_agent_host_id: attempt.hostId,
      access_token: tokens.access_token, refresh_token: tokens.refresh_token || null, id_token: tokens.id_token,
      token_type: 'Bearer', scopes: tokens.scope.split(/\s+/).filter(Boolean), resource: ENDPOINTS.resource,
      expiresAt: Date.now() + tokens.expires_in * 1000 };
    await this.store('save', session);
    let enabled = false; try { assertPlanGrant(session); enabled = true; } catch { /* Identity-only is retained without inference. */ }
    this.receipt('oauth', { granted: true, identitySignatureValidated: true, stateValidated: true, nonceValidated: true,
      pkce: 'S256', resource: session.resource, grantedScopes: session.scopes, planUseEnabled: enabled,
      identityHash: sha256(identity.issuer + ':' + identity.subject), registrationHash: sha256(clientId),
      callback: attempt.redirectUri, credentialStore: 'Windows DPAPI CurrentUser; local application directory; owner-only ACL', otherProgramCredentialsRead: false });
    return { connected: true, planUseEnabled: enabled, email: identity.email };
  }
  async current() {
    let session = await this.store('load'); assertPlanGrant(session, { allowExpired: true });
    if (session.expiresAt > Date.now() + 60_000) return session;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh(session).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async refresh(session) {
    requireThat(session.refresh_token, 'ACCESS_TOKEN_EXPIRED');
    let tokens;
    try { tokens = await this.tokenRequest({ grant_type: 'refresh_token', client_id: session.client_id,
      refresh_token: session.refresh_token, resource: ENDPOINTS.resource }); }
    catch (e) {
      if (['invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused'].includes(e.code)) {
        await this.store('save', { client_id: session.client_id, ext_agent_host_id: session.ext_agent_host_id, identity: session.identity, validatedIdentity: false });
      }
      throw e;
    }
    requireThat(tokens.token_type?.toLowerCase() === 'bearer' && typeof tokens.access_token === 'string' && Number.isFinite(tokens.expires_in) && tokens.expires_in > 0, 'REFRESH_RESPONSE_INVALID');
    if (tokens.id_token) validateIdToken(tokens.id_token, await this.json(ENDPOINTS.jwks), { clientId: session.client_id, priorIdentity: session.identity });
    const next = { ...session, access_token: tokens.access_token, refresh_token: tokens.refresh_token || session.refresh_token,
      id_token: tokens.id_token || session.id_token, scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : session.scopes,
      expiresAt: Date.now() + tokens.expires_in * 1000 };
    await this.store('save', next); assertPlanGrant(next);
    this.receipt('refresh', { success: true, rotatingTokenReplacedAtomically: true }); return next;
  }
  async discover() {
    const session = await this.current();
    const models = modelChoices(await this.json(ENDPOINTS.models, { headers: { Authorization: `Bearer ${session.access_token}` } }));
    this.receipt('models', { endpoint: ENDPOINTS.models, models, sameOAuthRegistration: sha256(session.client_id), noApiKeyFallback: true });
    return models;
  }
  async signOut() {
    const session = await this.store('load'); let remoteRevocationConfirmed = false;
    if (session?.refresh_token) {
      try { await this.metadata();
        const r = await this.request(ENDPOINTS.revoke, { method: 'POST', headers: { 'Content-Type':'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: session.refresh_token, token_type_hint: 'refresh_token', client_id: session.client_id }) });
        remoteRevocationConfirmed = r.status === 200;
      } catch { /* Local removal still takes effect; receipt explicitly reports remote state. */ }
    }
    if (session?.client_id) await this.store('save', { client_id: session.client_id, ext_agent_host_id: session.ext_agent_host_id, identity: session.identity, validatedIdentity: false });
    this.receipt('logout', { localTokensCleared: true, remoteRevocationConfirmed }); return { remoteRevocationConfirmed };
  }
}
