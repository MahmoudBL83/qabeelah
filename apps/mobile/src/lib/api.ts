import { API_BASE_URL } from './config';
// Simple wrapper around fetch API to match our backend

import { storage } from './storage';

const BASE_URL = API_BASE_URL;

const getHeaders = async () => {
  const token = await storage.getItem('qabila_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

async function handleResponse(res: Response, fallbackMessage = 'Request failed') {
  if (!res.ok) {
    // capture body for debugging
    let bodyText: string | null = null;
    try { bodyText = await res.clone().text(); } catch { bodyText = null; }

    const token = await (async () => { try { return await storage.getItem('qabila_token'); } catch { return null; } })();

    if (res.status === 401) {
      console.warn('[api-mobile] Unauthorized response', { status: res.status, body: bodyText, token: token ? 'present' : 'missing' });
      await storage.removeItem('qabila_token');
      const err: any = new Error('Unauthorized');
      err.status = res.status;
      throw err;
    }

    if (res.status === 403) {
      console.warn('[api-mobile] Forbidden response', { status: res.status, body: bodyText, token: token ? 'present' : 'missing' });
      const err: any = new Error('Forbidden');
      err.status = res.status;
      throw err;
    }

    console.error('[api-mobile] Request failed', { status: res.status, body: bodyText });
    let body: any = null;
    try { body = await res.json(); } catch { body = bodyText; }
    const errMsg = body && body.error ? `${fallbackMessage}: ${body.error}` : fallbackMessage;
    throw new Error(errMsg);
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

  tenantLogin: async (payload: { email: string; password: string; tenantSlug?: string }) => {
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
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/auth/me`, { headers });
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
  },

  logout: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error('Logout failed');
    return res.json();
  },

  revokeSessions: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/auth/revoke-sessions`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error('Session revocation failed');
    return res.json();
  },

  // File upload (multipart)
  uploadFile: async (file: any) => {
    const token = await storage.getItem('qabila_token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: form
    });
    if (!res.ok) throw new Error('Failed to upload file');
    return res.json();
  },

  // Lineage verification
  submitLineageRequest: async (payload: { tenantId: string; documents?: string[] }) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/lineage-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to submit lineage request');
    return res.json();
  },

  getMyLineageStatus: async (tenantId: string, userId: string) => {
    const headers = await getHeaders();
    const params = new URLSearchParams({ tenantId, userId });
    const res = await fetch(`${BASE_URL}/lineage-requests/status?${params.toString()}`, { headers });
    if (res.ok) return res.json();

    if (res.status === 404) {
      const fallback = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/all`, { headers });
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

  getPendingLineageRequests: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/all`, { headers });
    if (!res.ok) throw new Error('Failed to fetch lineage requests');
    return res.json();
  },

  updateLineageRequestStatus: async (tenantId: string, requestId: string, status: 'unverified' | 'pending' | 'verified' | 'rejected', notes?: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/lineage-requests/${tenantId}/${requestId}/verify`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, notes: notes || '' })
    });
    if (!res.ok) throw new Error('Failed to update lineage request');
    return res.json();
  },

  updateUserProfile: async (payload: { name?: string; phone?: string; bio?: string; location?: string; avatarUrl?: string }) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/auth/me`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update user profile');
    return res.json();
  },

  seedDatabase: async (tenantSlug?: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/seed/init`, {
      method: 'POST',
      headers,
      body: JSON.stringify(tenantSlug ? { tenantSlug } : {})
    });
    return res.json();
  },

  getPersons: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/persons?tenantId=${tenantId}`, { headers });
    return handleResponse(res, 'Failed to fetch persons');
  },

  getBranches: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/branches?tenantId=${tenantId}`, { headers });
    return handleResponse(res, 'Failed to fetch branches');
  },

  createBranch: async (payload: { tenantId?: string, name: string, parentId?: string }) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/branches`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return handleResponse(res, 'Failed to create branch');
  },

  updateBranch: async (branchId: string, payload: { name?: string, parentId?: string | null }) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/branches/${branchId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    return handleResponse(res, 'Failed to update branch');
  },

  deleteBranch: async (branchId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/branches/${branchId}`, {
      method: 'DELETE',
      headers
    });
    return handleResponse(res, 'Failed to delete branch');
  },

  searchPersons: async (tenantId: string, query?: string, branch?: string | null, birthFrom?: number, birthTo?: number, livingOnly?: boolean, hasBioOnly?: boolean) => {
    const headers = await getHeaders();
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (branch) params.set('branch', branch);
    if (birthFrom) params.set('birthFrom', String(birthFrom));
    if (birthTo) params.set('birthTo', String(birthTo));
    if (livingOnly) params.set('livingOnly', 'true');
    if (hasBioOnly) params.set('hasBioOnly', 'true');

    const res = await fetch(`${BASE_URL}/persons/search/${tenantId}?${params.toString()}`, { headers });
    if (!res.ok) throw new Error('Failed to search persons');
    return res.json();
  },

  submitJoinRequest: async (payload: any) => {
    const headers = await getHeaders();
    console.log('[submitJoinRequest] Payload:', payload);
    const res = await fetch(`${BASE_URL}/join-requests`, {
      method: 'POST',
      headers,
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

  getJoinRequestStatus: async (tenantId: string, email: string) => {
    const headers = await getHeaders();
    const params = new URLSearchParams({ tenantId, email });
    const res = await fetch(`${BASE_URL}/join-requests/status?${params.toString()}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch join request status');
    return res.json();
  },

  getAdminMetrics: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/admin/metrics?tenantId=${tenantId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch admin metrics');
    return res.json();
  },

  getPendingJoinRequests: async (tenantId: string, limit = 20) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/admin/requests?tenantId=${tenantId}&status=pending&limit=${limit}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch join requests');
    return res.json();
  },

  updateJoinRequestStatus: async (
    requestId: string,
    status: 'approved' | 'rejected' | 'pending',
    tenantId?: string
  ) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/admin/requests/${requestId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, tenantId })
    });
    if (!res.ok) throw new Error('Failed to update join request');
    return res.json();
  },

  getTenant: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/tenants/${tenantId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch tenant');
    return res.json();
  },

  getTenants: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/tenants`, { headers });
    if (!res.ok) throw new Error('Failed to fetch tenants');
    return res.json();
  },

  getTenantSummary: async () => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/tenants/summary`, { headers });
    if (!res.ok) throw new Error('Failed to fetch tenant summary');
    return res.json();
  },

  getAllJoinRequests: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/all`, { headers });
    if (!res.ok) throw new Error('Failed to fetch join requests');
    return res.json();
  },

  getJoinRequest: async (tenantId: string, requestId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/${requestId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch join request');
    return res.json();
  },

  approveJoinRequest: async (tenantId: string, requestId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/${requestId}/approve`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error('Failed to approve join request');
    return res.json();
  },

  rejectJoinRequest: async (tenantId: string, requestId: string, reason?: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/join-requests/${tenantId}/${requestId}/reject`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reason: reason || '' })
    });
    if (!res.ok) throw new Error('Failed to reject join request');
    return res.json();
  },

  getBranchManagers: async (tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/admin/managers?tenantId=${tenantId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch branch managers');
    return res.json();
  },

  createBranchManager: async (payload: { tenantId: string; name: string; email: string; branchId?: string }) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/admin/managers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create branch manager');
    return res.json();
  },

  getMembers: async (tenantId: string, branchId?: string) => {
    const headers = await getHeaders();
    let url = `${BASE_URL}/admin/members?tenantId=${tenantId}`;
    if (branchId) url += `&branchId=${branchId}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Failed to fetch members');
    return res.json();
  },

  getEvents: async (tenantId: string, limit = 10) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/events?tenantId=${tenantId}&limit=${limit}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  getEventById: async (tenantId: string, eventId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/events/${eventId}?tenantId=${tenantId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch event');
    return res.json();
  },

  updatePerson: async (personId: string, payload: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/persons/${personId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update person');
    }
    return res.json();
  },

  createPerson: async (payload: any) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/persons`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create person');
    return res.json();
  },

  deletePerson: async (personId: string, tenantId?: string) => {
    const headers = await getHeaders();
    const url = new URL(`${BASE_URL}/persons/${personId}`);
    if (tenantId) url.searchParams.set('tenantId', tenantId);
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Failed to delete person');
    return res.json();
  },

  registerForEvent: async (eventId: string, tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/events/${eventId}/register?tenantId=${tenantId}`, {
      method: 'POST',
      headers
    });
    if (!res.ok) throw new Error('Failed to register for event');
    return res.json();
  },

  unregisterFromEvent: async (eventId: string, tenantId: string) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/events/${eventId}/unregister?tenantId=${tenantId}`, {
      method: 'POST',
      headers
    });
    if (!res.ok) throw new Error('Failed to unregister from event');
    return res.json();
  },

  getActivities: async (tenantId: string, limit = 20, skip = 0) => {
    const headers = await getHeaders();
    const res = await fetch(`${BASE_URL}/activities?tenantId=${tenantId}&limit=${limit}&skip=${skip}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch activities');
    return res.json();
    },

    // Super Admin - Analytics & Moderation
    getGlobalAnalytics: async (lastDays: number = 30) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/super-admin/analytics/global?lastDays=${lastDays}`, {
        headers
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
      const headers = await getHeaders();
      const query = new URLSearchParams();
      if (params?.type) query.append('type', params.type);
      if (params?.priority) query.append('priority', params.priority);
      if (params?.tenantId) query.append('tenantId', params.tenantId);
      if (params?.page) query.append('page', String(params.page));
      if (params?.limit) query.append('limit', String(params.limit));

      const res = await fetch(`${BASE_URL}/super-admin/moderation/queue?${query.toString()}`, {
        headers
      });
      if (!res.ok) throw new Error('Failed to fetch moderation queue');
      return res.json();
    },

    processModerationAction: async (itemId: string, payload: {
      itemType: string;
      action: 'approve' | 'reject' | 'hold';
      notes?: string;
      tenantId: string;
    }) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/super-admin/moderation/queue/${itemId}/action`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to process moderation action');
      return res.json();
    },

    getPlatformSummary: async () => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/super-admin/stats/summary`, {
        headers
      });
      if (!res.ok) throw new Error('Failed to fetch platform summary');
      return res.json();
    },

    getTenantDetailedStats: async (tenantId: string) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/super-admin/stats/tenant/${tenantId}`, {
        headers
      });
      if (!res.ok) throw new Error('Failed to fetch tenant stats');
      return res.json();
    },
    // Notifications
    getNotifications: async (params?: { page?: number; limit?: number }) => {
      const headers = await getHeaders();
      const query = new URLSearchParams();
      if (params?.page) query.append('page', String(params.page));
      if (params?.limit) query.append('limit', String(params.limit));
      const res = await fetch(`${BASE_URL}/notifications?${query.toString()}`, { headers });
      return handleResponse(res, 'Failed to fetch notifications');
    },

    registerPushToken: async (token: string, provider: string = 'expo') => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/notifications/register-token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ token, provider }),
      });
      if (!res.ok) throw new Error('Failed to register push token');
      return res.json();
    },

    markNotificationsRead: async (ids: string[]) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/notifications/mark-read`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed to mark notifications read');
      return res.json();
    },

    // Messages
    getMessageParticipants: async (tenantId: string) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/messages/participants?tenantId=${tenantId}`, {
        headers,
      });
      if (!res.ok) throw new Error('Failed to fetch message participants');
      return res.json();
    },

    getMessageConversations: async (tenantId: string) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/messages/conversations?tenantId=${tenantId}`, { headers });
      return handleResponse(res, 'Failed to fetch message conversations');
    },

    getMessageStreamUrl: async (params: {
      tenantId: string;
      scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
      targetUserId?: string;
      branchId?: string;
    }) => {
      const token = await storage.getItem('qabila_token');
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

    getMessages: async (params: {
      tenantId: string;
      scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
      targetUserId?: string;
      branchId?: string;
      limit?: number;
    }) => {
      const headers = await getHeaders();
      const query = new URLSearchParams({
        tenantId: params.tenantId,
        scope: params.scope,
        limit: String(params.limit || 100),
      });
      if (params.targetUserId) query.set('targetUserId', params.targetUserId);
      if (params.branchId) query.set('branchId', params.branchId);

      const res = await fetch(`${BASE_URL}/messages?${query.toString()}`, { headers });
      return handleResponse(res, 'Failed to fetch messages');
    },

    sendMessage: async (payload: {
      tenantId: string;
      scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
      content: string;
      targetUserId?: string;
      branchId?: string;
    }) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/messages`, {
        method: 'POST',
        headers,
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
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/messages/read`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to mark conversation as read');
      return res.json();
    },

    moderateMessage: async (messageId: string, hidden: boolean, reason?: string) => {
      const headers = await getHeaders();
      const res = await fetch(`${BASE_URL}/messages/${messageId}/moderate`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ hidden, reason }),
      });
      if (!res.ok) throw new Error('Failed to moderate message');
      return res.json();
    },
};

export default apiClient;
