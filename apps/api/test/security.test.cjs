const test = require('node:test');
const assert = require('node:assert/strict');

const security = require('../dist/lib/security.js');
const authMiddleware = require('../dist/middleware/auth.js');

const createReqRes = (headers = {}, ip = '127.0.0.1') => {
  const req = { headers, ip };
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return { req, res };
};

test('normalize client ip strips ipv6 mapped prefix', () => {
  assert.equal(security.getClientIp({ headers: {}, ip: '::ffff:127.0.0.1' }), '127.0.0.1');
});

test('rate limiter allows the first request and blocks after threshold', () => {
  security.resetRateLimitStateForTests();
  const limiter = security.createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: 'test' });

  const first = createReqRes();
  let nextCalled = false;
  limiter(first.req, first.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  nextCalled = false;
  const second = createReqRes();
  limiter(second.req, second.res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(second.res.statusCode, 429);
  assert.equal(second.res.body.error, 'Too many requests');
});

test('tenant id extraction checks body, params, query, then user', () => {
  const bodyFirst = security.extractTenantIdFromRequest({ body: { tenantId: 'body-id' }, params: {}, query: {}, user: {} });
  const paramsSecond = security.extractTenantIdFromRequest({ body: {}, params: { tenantId: 'param-id' }, query: {}, user: {} });
  const queryThird = security.extractTenantIdFromRequest({ body: {}, params: {}, query: { tenantId: 'query-id' }, user: {} });

  assert.equal(bodyFirst, 'body-id');
  assert.equal(paramsSecond, 'param-id');
  assert.equal(queryThird, 'query-id');
});

test('api key middleware accepts configured keys and rejects missing keys', () => {
  process.env.SERVICE_API_KEYS = 'alpha,beta';
  const apiKeyMiddleware = security.requireApiKey();

  const accepted = createReqRes({ 'x-api-key': 'beta' });
  let nextCalled = false;
  apiKeyMiddleware(accepted.req, accepted.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);

  nextCalled = false;
  const rejected = createReqRes();
  apiKeyMiddleware(rejected.req, rejected.res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(rejected.res.statusCode, 401);
  assert.equal(rejected.res.body.error, 'Invalid or missing API key');
  delete process.env.SERVICE_API_KEYS;
});

test('session version helper accepts matching versions and rejects stale ones', () => {
  assert.equal(authMiddleware.isSessionCurrent(1, 1), true);
  assert.equal(authMiddleware.isSessionCurrent(1, 2), false);
  assert.equal(authMiddleware.isSessionCurrent(undefined, 0), true);
  assert.equal(authMiddleware.isSessionCurrent(undefined, 1), false);
});