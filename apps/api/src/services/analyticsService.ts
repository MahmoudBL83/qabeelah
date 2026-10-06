import { Tenant, User } from '../models';
import Activity, { ActivityType } from '../models/Activity';
import { getTenantModels } from '../lib/tenantDb';
import { UserRole } from '../types/shared';

/**
 * Advanced analytics service for super admin dashboard
 * Provides cross-tenant metrics, trends, and aggregations
 */

export interface GlobalAnalytics {
  overview: {
    totalTenants: number;
    activeTenants: number;
    totalPlatformUsers: number;
    totalSuperAdmins: number;
    totalQabilaAdmins: number;
    totalMembers: number;
    lineageVerificationStats: {
      verified: number;
      pending: number;
      rejected: number;
      unverified: number;
    };
  };
  recentActivity: Array<{
    date: string;
    eventCount: number;
    userJoinCount: number;
    verificationCount: number;
  }>;
  tenantGrowth: Array<{
    date: string;
    label: string;
    newTenants: number;
    totalTenants: number;
    activeUsers: number;
  }>;
  topTenants: Array<{
    tenantId: string;
    name: string;
    memberCount: number;
    adminCount: number;
    joinRequestsPending: number;
    eventCount: number;
    createdAt: Date;
  }>;
  activityTypeDistribution: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  platformHealth: {
    avgMembersPerTenant: number;
    avgAdminsPerTenant: number;
    totalLineageSubmissions: number;
    verificationRate: number;
    lastUpdated: Date;
  };
}

export interface ModerationQueueItem {
  type: 'lineage_verification' | 'join_request' | 'flagged_user' | 'flagged_activity';
  id: string;
  tenantId: string;
  tenantName: string;
  userId?: string;
  userName?: string;
  status: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  data: Record<string, any>;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthLabelAr = (date: Date) =>
  new Intl.DateTimeFormat('ar-SA', { month: 'short', year: 'numeric' }).format(date);

const buildMonthWindow = (months: number) => {
  const now = new Date();
  const result: Date[] = [];

  for (let i = months - 1; i >= 0; i--) {
    result.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }

  return result;
};

export async function getGlobalAnalytics(lastDays: number = 30): Promise<GlobalAnalytics> {
  const tenants = await Tenant.find().lean();
  const allUsers = await User.find().lean();

  // Count users by role
  const superAdmins = allUsers.filter((u: any) => u.role === UserRole.SUPER_ADMIN).length;
  const qabilaAdmins = allUsers.filter((u: any) => u.role === UserRole.QABILA_ADMIN).length;
  const members = allUsers.filter((u: any) => u.role === UserRole.MEMBER).length;

  // Get lineage verification stats
  let lineageStats = {
    verified: 0,
    pending: 0,
    rejected: 0,
    unverified: 0,
  };

  for (const tenant of tenants) {
    try {
      const { LineageVerification } = await getTenantModels(String(tenant._id));
      const verifications = await LineageVerification.find({ tenantId: tenant._id }).lean();
      for (const verification of verifications as any[]) {
        const status = verification.status || 'unverified';
        if (lineageStats[status as keyof typeof lineageStats]) {
          lineageStats[status as keyof typeof lineageStats]++;
        }
      }
    } catch (error) {
      // Tenant may not have lineage collection yet
    }
  }

  // Activity timeline (last N days)
  const activityCutoff = new Date(Date.now() - lastDays * 24 * 60 * 60 * 1000);
  const recentActivities = await Activity.find({
    createdAt: { $gte: activityCutoff },
  }).lean();

  const activityByDay = new Map<string, { eventCount: number; userJoinCount: number; verificationCount: number }>();

  for (const activity of recentActivities as any[]) {
    const day = isoDay(new Date(activity.createdAt));
    if (!activityByDay.has(day)) {
      activityByDay.set(day, { eventCount: 0, userJoinCount: 0, verificationCount: 0 });
    }
    const dayData = activityByDay.get(day)!;

    if (activity.type === ActivityType.EVENT_CREATED) dayData.eventCount++;
    if (activity.type === ActivityType.MEMBER_JOINED || activity.type === ActivityType.MEMBER_APPROVED)
      dayData.userJoinCount++;
    if (activity.type === 'LINEAGE_VERIFIED') dayData.verificationCount++;
  }

  const recentActivity = Array.from({ length: lastDays }).map((_, index) => {
    const date = new Date(Date.now() - (lastDays - 1 - index) * 24 * 60 * 60 * 1000);
    const dayKey = isoDay(date);
    const dayData = activityByDay.get(dayKey) || { eventCount: 0, userJoinCount: 0, verificationCount: 0 };
    return {
      date: dayKey,
      ...dayData,
    };
  });

  // Tenant growth (last 6 months)
  const months = buildMonthWindow(6);
  const tenantsByMonth = new Map<string, number>();
  const monthlyActiveUsers = new Map<string, Set<string>>();

  for (const tenant of tenants) {
    const createdDate = new Date(tenant.createdAt);
    const monthStr = monthKey(createdDate);
    tenantsByMonth.set(monthStr, (tenantsByMonth.get(monthStr) || 0) + 1);
  }

  // Get monthly active users
  for (const user of allUsers as any[]) {
    const createdDate = new Date(user.createdAt);
    const monthStr = monthKey(createdDate);
    if (!monthlyActiveUsers.has(monthStr)) {
      monthlyActiveUsers.set(monthStr, new Set());
    }
    monthlyActiveUsers.get(monthStr)!.add(String(user._id));
  }

  let runningTotal = 0;
  const tenantGrowth = months.map((monthStart) => {
    const key = monthKey(monthStart);
    const newTenants = tenantsByMonth.get(key) || 0;
    runningTotal += newTenants;
    const activeUsers = monthlyActiveUsers.get(key)?.size || 0;
    return {
      date: key,
      label: monthLabelAr(monthStart),
      newTenants,
      totalTenants: runningTotal,
      activeUsers,
    };
  });

  // Top tenants by member count
  const tenantStats = await Promise.all(
    tenants.map(async (tenant: any) => {
      try {
        const { JoinRequest, Person } = await getTenantModels(String(tenant._id));
        const [joinRequestsPending, adminCount, personCount, eventCount] = await Promise.all([
          JoinRequest.countDocuments({ tenantId: tenant._id, status: 'pending' }),
          User.countDocuments({ tenantId: tenant._id, role: { $in: [UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN] } }),
          Person.countDocuments({ tenantId: tenant._id }),
          (await getTenantModels(String(tenant._id))).Event.countDocuments({ tenantId: tenant._id }),
        ]);

        return {
          tenantId: String(tenant._id),
          name: tenant.name,
          memberCount: personCount,
          adminCount,
          joinRequestsPending,
          eventCount,
          createdAt: tenant.createdAt,
        };
      } catch (error) {
        return {
          tenantId: String(tenant._id),
          name: tenant.name,
          memberCount: 0,
          adminCount: 0,
          joinRequestsPending: 0,
          eventCount: 0,
          createdAt: tenant.createdAt,
        };
      }
    })
  );

  const topTenants = tenantStats.sort((a, b) => b.memberCount - a.memberCount).slice(0, 10);

  // Activity type distribution
  const typeDistribution = new Map<string, number>();
  for (const activity of recentActivities as any[]) {
    const type = activity.type || ActivityType.PROFILE_UPDATED;
    typeDistribution.set(type, (typeDistribution.get(type) || 0) + 1);
  }

  const totalActivityCount = recentActivities.length || 1;
  const activityTypeDistribution = Array.from(typeDistribution.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: Number(((count / totalActivityCount) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);

  // Platform health metrics
  const avgMembersPerTenant = tenants.length > 0 ? Number((tenantStats.reduce((sum, t) => sum + t.memberCount, 0) / tenants.length).toFixed(1)) : 0;
  const avgAdminsPerTenant =
    tenants.length > 0 ? Number((tenantStats.reduce((sum, t) => sum + t.adminCount, 0) / tenants.length).toFixed(1)) : 0;
  const totalLineageSubmissions = lineageStats.verified + lineageStats.pending + lineageStats.rejected;
  const verificationRate =
    totalLineageSubmissions > 0
      ? Number(((lineageStats.verified / totalLineageSubmissions) * 100).toFixed(1))
      : 0;

  return {
    overview: {
      totalTenants: tenants.length,
      activeTenants: tenants.filter((t: any) => t.isActive).length,
      totalPlatformUsers: allUsers.length,
      totalSuperAdmins: superAdmins,
      totalQabilaAdmins: qabilaAdmins,
      totalMembers: members,
      lineageVerificationStats: lineageStats,
    },
    recentActivity,
    tenantGrowth,
    topTenants,
    activityTypeDistribution,
    platformHealth: {
      avgMembersPerTenant,
      avgAdminsPerTenant,
      totalLineageSubmissions,
      verificationRate,
      lastUpdated: new Date(),
    },
  };
}

export async function getModerationQueue(): Promise<ModerationQueueItem[]> {
  const queue: ModerationQueueItem[] = [];

  // Get all tenants
  const tenants = await Tenant.find().lean();

  // Collect pending lineage verifications and join requests
  for (const tenant of tenants) {
    try {
      const { LineageVerification, JoinRequest } = await getTenantModels(String(tenant._id));

      // Pending lineage verifications
      const pendingLineage = await LineageVerification.find({
        tenantId: tenant._id,
        status: 'pending',
      }).lean();

      for (const lineage of pendingLineage as any[]) {
        const user = await User.findById(lineage.userId).lean();
        queue.push({
          type: 'lineage_verification',
          id: String(lineage._id),
          tenantId: String(tenant._id),
          tenantName: tenant.name,
          userId: String(lineage.userId),
          userName: user?.name,
          status: 'pending',
          priority: 'high',
          createdAt: lineage.createdAt || new Date(),
          data: {
            documents: lineage.documents,
            notes: lineage.notes,
            documentCount: lineage.documents?.length || 0,
          },
        });
      }

      // Pending join requests
      const pendingRequests = await JoinRequest.find({
        tenantId: tenant._id,
        status: 'pending',
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      for (const request of pendingRequests as any[]) {
        const user = await User.findById(request.userId).lean();
        queue.push({
          type: 'join_request',
          id: String(request._id),
          tenantId: String(tenant._id),
          tenantName: tenant.name,
          userId: String(request.userId),
          userName: user?.name,
          status: 'pending',
          priority: 'medium',
          createdAt: request.createdAt || new Date(),
          data: {
            memberCount: request.memberCount,
            estimatedRelatives: request.estimatedRelatives,
            relationshipToProbandDescription: request.relationshipToProbandDescription,
          },
        });
      }
    } catch (error) {
      console.error(`Error collecting moderation items for tenant ${tenant._id}:`, error);
    }
  }

  // Sort by priority and date
  return queue.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function processModerationAction(
  queueItemId: string,
  itemType: string,
  action: 'approve' | 'reject' | 'hold',
  notes: string,
  tenantId: string
): Promise<void> {
  if (itemType === 'lineage_verification') {
    const { LineageVerification } = await getTenantModels(tenantId);
    const statusMap = { approve: 'verified', reject: 'rejected', hold: 'pending' };
    await LineageVerification.findByIdAndUpdate(queueItemId, {
      status: statusMap[action],
      notes: notes || undefined,
      reviewedAt: new Date(),
      reviewedBy: 'SuperAdmin',
    });
  } else if (itemType === 'join_request') {
    const { JoinRequest } = await getTenantModels(tenantId);
    const statusMap = { approve: 'approved', reject: 'rejected', hold: 'pending' };
    await JoinRequest.findByIdAndUpdate(queueItemId, {
      status: statusMap[action],
      reviewedAt: new Date(),
    });
  }

  // Log the action
  await Activity.create({
    tenantId,
    type: 'MODERATION_ACTION',
    description: `Moderation action: ${action} on ${itemType}`,
    metadata: { queueItemId, itemType, action, notes },
    createdAt: new Date(),
  });
}

export async function getTenantDetailedStats(tenantId: string) {
  try {
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) throw new Error('Tenant not found');

    const { Person, JoinRequest, Event, LineageVerification } = await getTenantModels(tenantId);

    const [
      personCount,
      pendingJoinRequests,
      adminCount,
      eventCount,
      lineageVerifications,
      recentActivities,
    ] = await Promise.all([
      Person.countDocuments({ tenantId }),
      JoinRequest.countDocuments({ tenantId, status: 'pending' }),
      User.countDocuments({ tenantId, role: { $in: [UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN] } }),
      Event.countDocuments({ tenantId }),
      LineageVerification.find({ tenantId }).lean(),
      Activity.find({ tenantId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const lineageStats = {
      verified: (lineageVerifications as any[]).filter((l: any) => l.status === 'verified').length,
      pending: (lineageVerifications as any[]).filter((l: any) => l.status === 'pending').length,
      rejected: (lineageVerifications as any[]).filter((l: any) => l.status === 'rejected').length,
      total: lineageVerifications.length,
    };

    return {
      tenantId: String(tenant._id),
      tenantName: tenant.name,
      personCount,
      pendingJoinRequests,
      adminCount,
      eventCount,
      lineageStats,
      createdAt: tenant.createdAt,
      recentActivityCount: recentActivities.length,
    };
  } catch (error) {
    throw new Error(`Failed to get tenant stats: ${error}`);
  }
}
