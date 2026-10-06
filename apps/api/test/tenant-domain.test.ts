declare const jest: any;
declare const describe: any;
declare const beforeAll: any;
declare const afterAll: any;
declare const it: any;
declare const expect: any;

import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Tenant from '../src/models/Tenant';
import User from '../src/models/User';
import { app, startServer } from '../src/server';
import { UserRole } from '../src/types/shared';

jest.mock('dns/promises', () => ({
  resolveTxt: jest.fn()
}));

const dns = require('dns/promises');

describe('Tenant domain verification', () => {
  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.NODE_ENV = 'test';
    await startServer();
  }, 20000);

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('starts verification and confirms via mocked DNS', async () => {
    const uniqueSuffix = Date.now().toString(36);
    const tenant = await Tenant.create({ name: 'Test', subdomain: `test-sub-${uniqueSuffix}`, isActive: true });

    // create user (tenant admin)
    const passwordHash = 'x';
    const user = await User.create({ name: 'Admin', email: `a-${uniqueSuffix}@b.com`, passwordHash, role: UserRole.QABILA_ADMIN, tenantId: tenant._id });

    const token = jwt.sign({ id: String(user._id), role: user.role, tenantId: String(tenant._id), sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET as string);

    // set customDomain
    tenant.customDomain = 'example.test';
    await tenant.save();

    const startRes = await request(app).post(`/api/tenants/${tenant._id}/domain/verify/start`).set('Authorization', `Bearer ${token}`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.token).toBeTruthy();

    // mock DNS to include token
    (dns.resolveTxt as any).mockResolvedValue([[startRes.body.token]]);

    const confirmRes = await request(app).post(`/api/tenants/${tenant._id}/domain/verify/confirm`).set('Authorization', `Bearer ${token}`).send({ method: 'dns' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);

    const updated = await Tenant.findById(tenant._id).lean();
    expect(updated?.domainVerified).toBe(true);
  });

  it('resolves a verified custom domain through tenantByHost', async () => {
    const uniqueSuffix = Date.now().toString(36);
    const tenant = await Tenant.create({
      name: 'Host Test',
      subdomain: `host-test-${uniqueSuffix}`,
      customDomain: `family-${uniqueSuffix}.example.test`,
      domainVerified: true,
      isActive: true
    });

    const resolveRes = await request(app)
      .get('/api/tenants/resolve-current')
      .set('Host', `family-${uniqueSuffix}.example.test`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.tenant).toBeTruthy();
    expect(String(resolveRes.body.tenant._id)).toBe(String(tenant._id));

    const passwordHash = 'x';
    const user = await User.create({
      name: 'Owner',
      email: `owner-${uniqueSuffix}@b.com`,
      passwordHash,
      role: UserRole.QABILA_ADMIN,
      tenantId: tenant._id
    });
    const token = jwt.sign({ id: String(user._id), role: user.role, tenantId: String(tenant._id), sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET as string);

    const startRes = await request(app)
      .post(`/api/tenants/${tenant._id}/domain/verify/start`)
      .set('Host', `family-${uniqueSuffix}.example.test`)
      .set('Authorization', `Bearer ${token}`);

    expect(startRes.status).toBe(200);
    expect(startRes.body.instructions).toBeTruthy();
  });

  it('allows cookie-based session auth on custom host (no Authorization header)', async () => {
    const uniqueSuffix = Date.now().toString(36) + '-cookie';
    const tenant = await Tenant.create({ name: 'Cookie Test', subdomain: `cookie-test-${uniqueSuffix}`, customDomain: `cookie-${uniqueSuffix}.example.test`, isActive: true });

    const user = await User.create({ name: 'OwnerCookie', email: `owner-${uniqueSuffix}@b.com`, passwordHash: 'x', role: UserRole.QABILA_ADMIN, tenantId: tenant._id });
    const cookieToken = jwt.sign({ id: String(user._id), role: user.role, tenantId: String(tenant._id), sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET as string);

    const res = await request(app)
      .post(`/api/tenants/${tenant._id}/domain/verify/start`)
      .set('Host', tenant.customDomain as string)
      .set('Cookie', `qabila_session=${cookieToken}`);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('uses the auth cookie on a verified custom domain without Authorization header', async () => {
    const uniqueSuffix = Date.now().toString(36);
    const customDomain = `cookie-${uniqueSuffix}.example.test`;
    const tenant = await Tenant.create({
      name: 'Cookie Test',
      subdomain: `cookie-test-${uniqueSuffix}`,
      customDomain,
      domainVerified: true,
      isActive: true
    });

    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
      name: 'Cookie Admin',
      email: `cookie-${uniqueSuffix}@b.com`,
      passwordHash,
      role: UserRole.QABILA_ADMIN,
      tenantId: tenant._id
    });

    const loginRes = await request(app)
      .post('/api/auth/tenant/login')
      .set('Host', customDomain)
      .send({ email: `cookie-${uniqueSuffix}@b.com`, password });

    expect(loginRes.status).toBe(200);
    const cookieHeader = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'][0]?.split(';')[0]
      : '';
    expect(cookieHeader).toBeTruthy();

    const resolveRes = await request(app)
      .get('/api/tenants/resolve-current')
      .set('Host', customDomain);

    expect(resolveRes.status).toBe(200);
    expect(String(resolveRes.body.tenant._id)).toBe(String(tenant._id));

    const startRes = await request(app)
      .post(`/api/tenants/${tenant._id}/domain/verify/start`)
      .set('Host', customDomain)
      .set('Cookie', cookieHeader)
      .send();

    expect(startRes.status).toBe(200);
    expect(startRes.body.token).toBeTruthy();
  });
});
