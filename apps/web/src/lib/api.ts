import { API_BASE_URL } from './config';
// Simple wrapper around fetch API to match our backend

const BASE_URL = API_BASE_URL;

const installCredentialedFetch = () => {
  const globalScope = globalThis as typeof globalThis & { __qabilaFetchInstalled?: boolean };
  if (globalScope.__qabilaFetchInstalled) return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) =>
    originalFetch(input, {
      ...init,
      credentials: init?.credentials ?? 'include',
    })) as typeof globalThis.fetch;

  globalScope.__qabilaFetchInstalled = true;
};

installCredentialedFetch();

const getHeaders = () => {
  const token = localStorage.getItem('qabila_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

async function handleResponse(res: Response, fallbackMessage = 'Request failed') {
  if (!res.ok) {
    // Gather response body safely for debugging
    let bodyText: string | null = null;
    let bodyJson: Record<string, unknown> | null = null;
    try {
      bodyText = await res.clone().text();
    } catch (e) {
      bodyText = null;
    }
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    const token = (() => { try { return localStorage.getItem('qabila_token'); } catch { return null; } })();

    if (res.status === 401) {
      console.warn('[api] Unauthorized response', { status: res.status, body: bodyText, token: token ? 'present' : 'missing' });
      try { localStorage.removeItem('qabila_token'); } catch {}
      const err: any = new Error('Unauthorized');
      err.status = res.status;
      throw err;
    }

    if (res.status === 403) {
      console.warn('[api] Forbidden response', { status: res.status, body: bodyText, token: token ? 'present' : 'missing' });
      const err: any = new Error('Forbidden');
      err.status = res.status;
      throw err;
    }

    console.error('[api] Request failed', { status: res.status, body: bodyText });
    const errorMessage =
      (typeof bodyJson?.error === 'string' && bodyJson.error) ||
      (typeof bodyJson?.message === 'string' && bodyJson.message) ||
      fallbackMessage;
    const err: any = new Error(errorMessage);
    err.status = res.status;
    if (typeof bodyJson?.details === 'string') {
      err.details = bodyJson.details;
    }
    throw err;
  }
  return res.json();
}

export const apiClient = {
  // Auth
  login: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },

  tenantLogin: async (payload: { email: string; password: string; tenantSlug?: string; branchId?: string }) => {
    const res = await fetch(`${BASE_URL}/auth/tenant/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const error = new Error(errorData.error || `HTTP ${res.status}: Tenant login failed`);
      (error as any).status = res.status;
      if (errorData.code) (error as any).code = errorData.code;
      throw error;
    }
    return res.json();
  },

  testTenantDbConnection: async (uri: string) => {
    const res = await fetch(`${BASE_URL}/tenants/test-connection`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ uri })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      throw new Error(typeof body.error === 'string' ? body.error : 'Failed to test DB connection');
    }
    return res.json();
  },

  platformLogin: async (payload: { email: string; password: string }) => {
    const res = await fetch(`${BASE_URL}/auth/platform/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Platform admin login failed');
    return res.json();
  },
  
  register: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Registration failed');
    return res.json();
  },

  getMe: async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
  },

  logout: async () => {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Logout failed');
    return res.json();
  },

  revokeSessions: async () => {
    const res = await fetch(`${BASE_URL}/auth/revoke-sessions`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Session revocation failed');
    return res.json();
  },

  // Utility to seed initial db if empty
  seedDatabase: async (tenantSlug?: string) => {
    const res = await fetch(`${BASE_URL}/seed/init`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(tenantSlug ? { tenantSlug } : {})
    });
    return res.json();
  },

  getPersons: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/persons?tenantId=${tenantId}`, { headers: getHeaders() });
    return handleResponse(res, 'Failed to fetch persons');
  },

  getBranches: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/branches?tenantId=${tenantId}`, { headers: getHeaders() });
    return handleResponse(res, 'Failed to fetch branches');
  },

  createBranch: async (payload: { name: string, parentId?: string }) => {
    const res = await fetch(`${BASE_URL}/branches`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res, 'Failed to create branch');
  },

  updateBranch: async (branchId: string, payload: { name?: string, parentId?: string | null }) => {
    const res = await fetch(`${BASE_URL}/branches/${branchId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res, 'Failed to update branch');
  },

  deleteBranch: async (branchId: string) => {
    const res = await fetch(`${BASE_URL}/branches/${branchId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse(res, 'Failed to delete branch');
  },

  searchPersons: async (tenantId: string, query?: string, branch?: string | null, birthFrom?: number, birthTo?: number, livingOnly?: boolean, hasBioOnly?: boolean) => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (branch) params.set('branch', branch);
    if (birthFrom) params.set('birthFrom', String(birthFrom));
    if (birthTo) params.set('birthTo', String(birthTo));
    if (livingOnly) params.set('livingOnly', 'true');
    if (hasBioOnly) params.set('hasBioOnly', 'true');

    const res = await fetch(`${BASE_URL}/persons/search/${tenantId}?${params.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to search persons');
    return res.json();
  },
  
  submitJoinRequest: async (payload: any) => {
    console.log('[submitJoinRequest] Payload:', payload);
    const res = await fetch(`${BASE_URL}/join-requests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorData = await res.json();
      console.error('[submitJoinRequest] Error response:', errorData);
      
      // Build detailed error message
      let errorMsg = 'Failed to submit join request: ';
      if (errorData.details) {
        if (Array.isArray(errorData.details)) {
          errorMsg += errorData.details.map((e: any) => `${e.field}: ${e.message}`).join(', ');
        } else {
          errorMsg += errorData.details;
        }
      } else {
        errorMsg += errorData.error || 'Unknown error';
      }
      
      throw new Error(errorMsg);
    }
    return res.json();
  },

  // File upload helper (multipart/form-data)
  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('qabila_token');
    const res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: form,
    });
    if (!res.ok) throw new Error('Failed to upload file');
    return res.json();
  },

  extractTreeData: async (file: File, familyName?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (familyName) {
      form.append('familyName', familyName);
    }

    const token = localStorage.getItem('qabila_token');
    const res = await fetch(`${BASE_URL}/upload/extract-tree`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: form,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Failed to extract tree data');
      (error as any).status = res.status;
      throw error;
    }

    return res.json();
  },

  // Lineage verification endpoints
  submitLineageRequest: async (payload: { tenantId: string; documents?: string[] }) => {
    const res = await fetch(`${BASE_URL}/lineage-requests`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to submit lineage request');
    return res.json();
  },

  getMyLineageStatus: async (tenantId: string, userId: string) => {
    const params = new URLSearchParams({ tenantId, userId });
    const res = await fetch(`${BASE_URL}/lineage-requests/status?${params.toString()}`, { headers: getHeaders() });
    if (res.ok) return res.json();

    if (res.status === 404) {
      const fallback = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/all`, { headers: getHeaders() });
      if (!fallback.ok) throw new Error('Failed to fetch lineage status');
      const requests = await fallback.json();
      const request = Array.isArray(requests)
        ? requests.find((item: any) => String(item?.userId?._id || item?.userId || item?.user?.id || item?.user?._id) === String(userId))
        : null;
      return request ? {
        status: request.status,
        reviewedAt: request.reviewedAt,
        notes: request.notes,
        documents: request.documents,
      } : { status: 'unverified' };
    }

    throw new Error('Failed to fetch lineage status');
  },

  getPendingLineageRequests: async (tenantId: string, limit = 50) => {
    const res = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/all?limit=${limit}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch lineage requests');
    return res.json();
  },

  getLineageRequest: async (tenantId: string, requestId: string) => {
    const res = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/${requestId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch lineage request');
    return res.json();
  },

  updateLineageRequestStatus: async (tenantId: string, requestId: string, status: 'unverified' | 'pending' | 'verified' | 'rejected', notes?: string) => {
    const res = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/${requestId}/verify`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status, notes: notes || '' })
    });
    if (!res.ok) throw new Error('Failed to update lineage request');
    return res.json();
  },

  getJoinRequestStatus: async (tenantId: string, email: string) => {
    const params = new URLSearchParams({ tenantId, email });
    const res = await fetch(`${BASE_URL}/join-requests/status?${params.toString()}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch join request status');
    return res.json();
  },

  getAdminMetrics: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/admin/metrics?tenantId=${tenantId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin metrics');
    return res.json();
  },

  getAdminAnalytics: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/admin/analytics?tenantId=${tenantId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin analytics');
    return res.json();
  },

  exportAdminAnalyticsCsv: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/admin/analytics/export?tenantId=${tenantId}&format=csv`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to export analytics CSV');
    return res.blob();
  },

  runOneShotReminders: async (tenantId?: string) => {
    const res = await fetch(`${BASE_URL}/admin/reminders/run-once`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(tenantId ? { tenantId } : {}),
    });
    if (!res.ok) throw new Error('Failed to run one-shot reminders');
    return res.json();
  },

  getPendingJoinRequests: async (tenantId: string, limit = 20) => {
    const res = await fetch(`${BASE_URL}/admin/requests?tenantId=${tenantId}&status=pending&limit=${limit}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch join requests');
    return res.json();
  },

  updateJoinRequestStatus: async (
    requestId: string,
    status: 'approved' | 'rejected' | 'pending',
    tenantId?: string
  ) => {
    const res = await fetch(`${BASE_URL}/admin/requests/${requestId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ status, tenantId })
    });
    if (!res.ok) throw new Error('Failed to update join request');
    return res.json();
  },

  getTenant: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch tenant');
    return res.json();
  },

  startDomainVerification: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}/domain/verify/start`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(res, 'Failed to start domain verification');
  },

  confirmDomainVerification: async (tenantId: string, method: 'dns' | 'http' = 'dns') => {
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}/domain/verify/confirm`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ method })
    });
    return handleResponse(res, 'Failed to confirm domain verification');
  },

  updateTenant: async (tenantId: string, payload: { subdomain?: string; customDomain?: string; coverImage?: string; arabicName?: string; isActive?: boolean; dbName?: string; dbConnectionUri?: string; dbIsolationMode?: 'shared' | 'dedicated' }) => {
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    return handleResponse(res, 'Failed to update tenant');
  },

  deleteTenant: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete tenant');
    return res.json();
  },

  checkTenantSlugAvailability: async (slug: string): Promise<{ slug: string; available: boolean }> => {
    const res = await fetch(`${BASE_URL}/tenants/availability/slug/${encodeURIComponent(slug)}`, {
      headers: getHeaders()
    });
    return handleResponse(res, 'Failed to check tenant slug availability');
  },

  importTenant: async (payload: {
    name: string;
    subdomain: string;
    customDomain?: string;
    coverImage?: string;
    adminName?: string;
    adminEmail: string;
    adminPassword: string;
    dbName?: string;
    dbConnectionUri?: string;
    dbIsolationMode?: 'shared' | 'dedicated';
    forceCreate?: boolean;
    members?: Array<{
      id?: string;
      firstName: string;
      lastName: string;
      birthYear?: number;
      deathYear?: number;
      isLiving?: boolean;
      parentId?: string;
      branchId?: string;
      bio?: string;
      imageSrc?: string;
    }>;
  }) => {
    const res = await fetch(`${BASE_URL}/tenants/import`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({} as Record<string, unknown>));
      const error = new Error(
        typeof errorData.error === 'string'
          ? errorData.error
          : typeof errorData.message === 'string'
            ? errorData.message
            : 'Failed to import tenant'
      );
      (error as any).status = res.status;
      if (typeof errorData.details === 'string') {
        (error as any).details = errorData.details;
      }
      throw error;
    }
    return res.json();
  },

  getTenants: async () => {
    const res = await fetch(`${BASE_URL}/tenants`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch tenants');
    return res.json();
  },

  getTenantSummary: async () => {
    const res = await fetch(`${BASE_URL}/tenants/summary`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch tenant summary');
    return res.json();
  },

  resolveCurrentTenant: async () => {
    const res = await fetch(`${BASE_URL}/tenants/resolve-current`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to resolve tenant');
    return res.json();
  },

  getBranchManagers: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/admin/managers?tenantId=${tenantId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch branch managers');
    return res.json();
  },

  createBranchManager: async (payload: { tenantId: string, name: string, email: string, branchId?: string }) => {
    const res = await fetch(`${BASE_URL}/admin/managers`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create branch manager');
    return res.json();
  },

  getMembers: async (tenantId: string, branchId?: string) => {
    let url = `${BASE_URL}/admin/members?tenantId=${tenantId}`;
    if (branchId) url += `&branchId=${branchId}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch members');
    return res.json();
  },

  getEvents: async (tenantId: string, limit = 10) => {
    const res = await fetch(`${BASE_URL}/events?tenantId=${tenantId}&limit=${limit}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  getEventById: async (tenantId: string, eventId: string) => {
    const res = await fetch(`${BASE_URL}/events/${eventId}?tenantId=${tenantId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch event');
    return res.json();
  },

  registerForEvent: async (eventId: string, tenantId: string) => {
    const res = await fetch(`${BASE_URL}/events/${eventId}/register?tenantId=${tenantId}`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to register for event');
    }
    return res.json();
  },

  unregisterFromEvent: async (eventId: string, tenantId: string) => {
    const res = await fetch(`${BASE_URL}/events/${eventId}/unregister?tenantId=${tenantId}`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to unregister from event');
    }
    return res.json();
  },

  updateProfile: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  updatePerson: async (personId: string, payload: any) => {
    const res = await fetch(`${BASE_URL}/persons/${personId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update person');
    }
    return res.json();
  },

  createPerson: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/persons`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create person');
    return res.json();
  },

  updateUserProfile: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update user profile');
    return res.json();
  },

  createEvent: async (payload: any) => {
    const res = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create event');
    return res.json();
  },

  updateEvent: async (eventId: string, tenantId: string, payload: any) => {
    const res = await fetch(`${BASE_URL}/events/${eventId}?tenantId=${tenantId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update event');
    return res.json();
  },

  // Super-admin join request management
  getAllJoinRequests: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/all`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch join requests');
    return res.json();
  },

  getJoinRequest: async (tenantId: string, requestId: string) => {
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/${requestId}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch join request');
    return res.json();
  },

  approveJoinRequest: async (tenantId: string, requestId: string) => {
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/${requestId}/approve`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error('Failed to approve join request');
    return res.json();
  },

  rejectJoinRequest: async (tenantId: string, requestId: string, reason?: string) => {
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/${requestId}/reject`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ reason: reason || '' })
    });
    if (!res.ok) throw new Error('Failed to reject join request');
    return res.json();
  },

  deleteEvent: async (eventId: string, tenantId: string) => {
    const res = await fetch(`${BASE_URL}/events/${eventId}?tenantId=${tenantId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete event');
    return res.json();
  },

  getActivities: async (tenantId: string, limit = 20, skip = 0) => {
    const res = await fetch(`${BASE_URL}/activities?tenantId=${tenantId}&limit=${limit}&skip=${skip}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch activities');
    return res.json();
  },

  getMessageParticipants: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/messages/participants?tenantId=${tenantId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch message participants');
    return res.json();
  },

  getMessageConversations: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/messages/conversations?tenantId=${tenantId}`, { headers: getHeaders() });
    return handleResponse(res, 'Failed to fetch message conversations');
  },

  getMessageStreamUrl: (params: {
    tenantId: string;
    scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
    targetUserId?: string;
    branchId?: string;
  }) => {
    const token = localStorage.getItem('qabila_token');
    if (!token || !params.tenantId || !params.scope) return null;

    const query = new URLSearchParams({
      tenantId: params.tenantId,
      scope: params.scope,
      token,
    });
    if (params.targetUserId) query.set('targetUserId', params.targetUserId);
    if (params.branchId) query.set('branchId', params.branchId);
    return `${BASE_URL}/messages/stream?${query.toString()}`;
  },

  // Super Admin - Analytics & Moderation
  getGlobalAnalytics: async (lastDays: number = 30) => {
    const res = await fetch(`${BASE_URL}/super-admin/analytics/global?lastDays=${lastDays}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch global analytics');
    return res.json();
  },

  getModerationQueue: async (params?: {
    type?: 'lineage_verification' | 'join_request' | 'flagged_user' | 'flagged_activity';
    priority?: 'high' | 'medium' | 'low';
    tenantId?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.type) query.append('type', params.type);
    if (params?.priority) query.append('priority', params.priority);
    if (params?.tenantId) query.append('tenantId', params.tenantId);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));

    const res = await fetch(`${BASE_URL}/super-admin/moderation/queue?${query.toString()}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch moderation queue');
    return res.json();
  },

  getModerationQueueItem: async (itemId: string) => {
    const res = await fetch(`${BASE_URL}/super-admin/moderation/queue/${itemId}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch moderation item');
    return res.json();
  },

  processModerationAction: async (itemId: string, payload: {
    itemType: string;
    action: 'approve' | 'reject' | 'hold';
    notes?: string;
    tenantId: string;
  }) => {
    const res = await fetch(`${BASE_URL}/super-admin/moderation/queue/${itemId}/action`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to process moderation action');
    return res.json();
  },

  processBulkModerationAction: async (payload: {
    itemIds: string[];
    itemType: string;
    action: 'approve' | 'reject' | 'hold';
    notes?: string;
    tenantId: string;
  }) => {
    const res = await fetch(`${BASE_URL}/super-admin/moderation/bulk-action`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to process bulk moderation action');
    return res.json();
  },

  getPlatformSummary: async () => {
    const res = await fetch(`${BASE_URL}/super-admin/stats/summary`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch platform summary');
    return res.json();
  },

  getTenantDetailedStats: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/super-admin/stats/tenant/${tenantId}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch tenant stats');
    return res.json();
  },

  getAuditLog: async (params?: {
    limit?: number;
    page?: number;
    tenantId?: string;
    type?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.page) query.append('page', String(params.page));
    if (params?.tenantId) query.append('tenantId', params.tenantId);
    if (params?.type) query.append('type', params.type);

    const res = await fetch(`${BASE_URL}/super-admin/activity/audit-log?${query.toString()}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch audit log');
    return res.json();
  },

  getGeminiIntegrationSettings: async () => {
    const res = await fetch(`${BASE_URL}/super-admin/integrations/gemini`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch Gemini settings');
    return res.json();
  },

  saveGeminiIntegrationSettings: async (payload: { apiKey?: string; model?: string; clearApiKey?: boolean }) => {
    const res = await fetch(`${BASE_URL}/super-admin/integrations/gemini`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save Gemini settings');
    return res.json();
  },

  getTenantRoutingSettings: async () => {
    const res = await fetch(`${BASE_URL}/super-admin/integrations/tenant-routing`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch tenant routing settings');
    return res.json();
  },

  saveTenantRoutingSettings: async (payload: { baseDomain?: string; loginPath?: string }) => {
    const res = await fetch(`${BASE_URL}/super-admin/integrations/tenant-routing`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save tenant routing settings');
    return res.json();
  },

  getBunnySettings: async () => {
    const res = await fetch(`${BASE_URL}/super-admin/integrations/bunny`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch Bunny settings');
    return res.json();
  },

  saveBunnySettings: async (payload: { apiKey?: string; storageZone?: string; cdnHostname?: string; tokenKey?: string }) => {
    const res = await fetch(`${BASE_URL}/super-admin/integrations/bunny`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const errMsg = typeof body.error === 'string' ? body.error : (body.message as string) || 'Failed to save Bunny settings';
      const err: any = new Error(errMsg);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json();
  },

  downloadAnalytics: async (format: 'csv' = 'csv', lastDays: number = 30) => {
    const url = `${BASE_URL}/super-admin/analytics/export?format=${format}&lastDays=${lastDays}`;
    const token = localStorage.getItem('qabila_token');
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    }
  },

  getMessages: async (params: {
    tenantId: string;
    scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
    targetUserId?: string;
    branchId?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams({
      tenantId: params.tenantId,
      scope: params.scope,
      limit: String(params.limit || 100),
    });
    if (params.targetUserId) query.set('targetUserId', params.targetUserId);
    if (params.branchId) query.set('branchId', params.branchId);

    const res = await fetch(`${BASE_URL}/messages?${query.toString()}`, { headers: getHeaders() });
    return handleResponse(res, 'Failed to fetch messages');
  },

  sendMessage: async (payload: {
    tenantId: string;
    scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
    content: string;
    targetUserId?: string;
    branchId?: string;
  }) => {
    const res = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(res, 'Failed to send message');
  },

  markConversationRead: async (payload: {
    tenantId: string;
    scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
    targetUserId?: string;
    branchId?: string;
  }) => {
    const res = await fetch(`${BASE_URL}/messages/read`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to mark conversation as read');
    return res.json();
  },

  moderateMessage: async (messageId: string, hidden: boolean, reason?: string) => {
    const res = await fetch(`${BASE_URL}/messages/${messageId}/moderate`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ hidden, reason }),
    });
    if (!res.ok) throw new Error('Failed to moderate message');
    return res.json();
  }
  ,

  // Notifications
  getNotifications: async (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    const res = await fetch(`${BASE_URL}/notifications?${query.toString()}`, {
      headers: getHeaders(),
    });
    return handleResponse(res, 'Failed to fetch notifications');
  },

  markNotificationsRead: async (ids: string[]) => {
    const res = await fetch(`${BASE_URL}/notifications/mark-read`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error('Failed to mark notifications read');
    return res.json();
  },

  registerPushToken: async (token: string, provider: string = 'expo') => {
    const res = await fetch(`${BASE_URL}/notifications/register-token`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ token, provider }),
    });
    if (!res.ok) throw new Error('Failed to register push token');
    return res.json();
  },

  getWebPushPublicKey: async () => {
    const res = await fetch(`${BASE_URL}/notifications/web-push-key`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch web push public key');
    return res.json();
  },

  registerWebPushSubscription: async (subscription: any) => {
    const res = await fetch(`${BASE_URL}/notifications/register-web-subscription`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ subscription }),
    });
    if (!res.ok) throw new Error('Failed to register web push subscription');
    return res.json();
  },

  unregisterWebPushSubscription: async (endpoint: string) => {
    const res = await fetch(`${BASE_URL}/notifications/unregister-web-subscription`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) throw new Error('Failed to unregister web push subscription');
    return res.json();
  },

  // Database Isolation Management
  getDbIsolationStatus: async () => {
    const res = await fetch(`${BASE_URL}/tenants/status/db-isolation`, {
      headers: getHeaders(),
    });
    return handleResponse(res, 'Failed to fetch DB isolation status');
  },

  updateTenantDbStatus: async (tenantId: string) => {
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}/db-status/update`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(res, 'Failed to update tenant DB status');
  },
};
