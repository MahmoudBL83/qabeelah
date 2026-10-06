import { Router } from 'express';
import { User } from '../models';
import { getTenantModels } from '../lib/tenantDb';
import { UserRole } from '../types/shared';
import bcrypt from 'bcryptjs';
import Activity, { ActivityType } from '../models/Activity';
import { runEventReminderCycleOnce } from '../lib/eventReminderScheduler';

const router = Router();

type PersonLike = {
  _id: unknown;
  parentId?: unknown;
  isLiving?: boolean;
  deathYear?: number;
};

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

const computeMaxGenerations = (persons: PersonLike[]) => {
  const ids = new Set(persons.map((p) => String(p._id)));
  const parentById = new Map<string, string>();

  for (const person of persons) {
    const personId = String(person._id);
    const parentId = person.parentId ? String(person.parentId) : '';
    if (parentId && ids.has(parentId)) {
      parentById.set(personId, parentId);
    }
  }

  const memo = new Map<string, number>();

  const depth = (id: string, visiting: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 1;

    visiting.add(id);
    const parent = parentById.get(id);
    const value = parent ? depth(parent, visiting) + 1 : 1;
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };

  let max = 0;
  for (const person of persons) {
    max = Math.max(max, depth(String(person._id), new Set()));
  }

  return max;
};

const getAnalyticsForTenant = async (tenantId: string, branchId?: string) => {
  const { Person, JoinRequest, Event } = await getTenantModels(tenantId);

  // Build branch filter for sub-admin queries
  const branchFilter = branchId ? { branchId } : {};

  const [persons, pendingRequests, adminCount, events, activityRecent, memberUsers] = await Promise.all([
    Person.find({ tenantId, ...branchFilter }).select('_id parentId isLiving deathYear').lean() as Promise<PersonLike[]>,
    JoinRequest.countDocuments({ tenantId, status: 'pending', ...branchFilter }),
    User.countDocuments({ tenantId, role: { $in: [UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN] }, ...branchFilter }),
    Event.find({ tenantId, ...branchFilter })
      .select('_id title eventDate registeredCount capacity status')
      .sort({ eventDate: -1 })
      .lean(),
    Activity.find({
      tenantId,
      createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    })
      .select('type createdAt')
      .lean(),
    User.find({ tenantId, role: UserRole.MEMBER, ...branchFilter })
      .select('createdAt')
      .lean(),
  ]);

  const totalMembers = persons.length;
  const livingMembers = persons.filter((p) => p.isLiving !== false && !p.deathYear).length;
  const deceasedMembers = totalMembers - livingMembers;
  const maxGenerations = computeMaxGenerations(persons);

  const now = new Date();
  const upcomingEvents = events.filter((event: any) => new Date(event.eventDate) >= now).length;
  const totalEvents = events.length;
  const totalEventRegistrations = events.reduce((sum: number, event: any) => sum + Number(event.registeredCount || 0), 0);
  const avgAttendancePerEvent = totalEvents > 0 ? Number((totalEventRegistrations / totalEvents).toFixed(2)) : 0;

  const dayCounts = new Map<string, number>();
  for (const activity of activityRecent as Array<{ createdAt: Date }>) {
    const key = isoDay(new Date(activity.createdAt));
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }

  const activityByDay = Array.from({ length: 14 }).map((_, index) => {
    const date = new Date(Date.now() - (13 - index) * 24 * 60 * 60 * 1000);
    const key = isoDay(date);
    return {
      date: key,
      count: dayCounts.get(key) || 0,
    };
  });

  const typeCounts = new Map<string, number>();
  for (const activity of activityRecent as Array<{ type?: string }>) {
    const type = activity.type || ActivityType.PROFILE_UPDATED;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  const topActivityTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => ({ type, count }));

  const months = buildMonthWindow(6);
  const monthlyNewCounts = new Map<string, number>();

  for (const user of memberUsers as Array<{ createdAt?: Date }>) {
    if (!user.createdAt) continue;
    const key = monthKey(new Date(user.createdAt));
    monthlyNewCounts.set(key, (monthlyNewCounts.get(key) || 0) + 1);
  }

  let runningTotal = 0;
  const memberGrowth = months.map((monthStart) => {
    const key = monthKey(monthStart);
    const newMembers = monthlyNewCounts.get(key) || 0;
    runningTotal += newMembers;
    return {
      month: key,
      label: monthLabelAr(monthStart),
      newMembers,
      totalMembers: runningTotal,
    };
  });

  const eventAttendance = events.slice(0, 10).map((event: any) => {
    const registeredCount = Number(event.registeredCount || 0);
    const capacity = typeof event.capacity === 'number' ? event.capacity : null;
    const occupancyRate = capacity && capacity > 0 ? Number(((registeredCount / capacity) * 100).toFixed(1)) : null;

    return {
      eventId: String(event._id),
      title: event.title,
      eventDate: event.eventDate,
      registeredCount,
      capacity,
      occupancyRate,
      status: event.status || 'UPCOMING',
    };
  });

  return {
    overview: {
      totalMembers,
      livingMembers,
      deceasedMembers,
      pendingRequests,
      adminCount,
      upcomingEvents,
      totalEvents,
      totalEventRegistrations,
      avgAttendancePerEvent,
      maxGenerations,
    },
    activityByDay,
    topActivityTypes,
    memberGrowth,
    eventAttendance,
  };
};

router.get('/metrics', async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware if needed, but we'll validate manually
    const user = req.user as any;
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { Person, JoinRequest } = await getTenantModels(String(tenantId));
    
    // Build branch-aware queries for sub-admins
    const branchFilter = user?.role === UserRole.SUB_ADMIN 
      ? { branchId: user?.branchId || 'الفرع الرئيسي' }
      : {};

    const [totalMembers, pendingRequests, qabilaAdminCount, subAdminCount] = await Promise.all([
      Person.countDocuments({ tenantId, ...branchFilter }),
      JoinRequest.countDocuments({ tenantId, status: 'pending', ...branchFilter }),
      User.countDocuments({ tenantId, role: UserRole.QABILA_ADMIN, ...branchFilter }),
      User.countDocuments({ tenantId, role: UserRole.SUB_ADMIN, ...branchFilter })
    ]);

    const metricsResponse: any = {
      totalMembers,
      pendingRequests,
      qabilaAdminCount,
      upcomingEvents: 0
    };

    // Only QABILA_ADMIN can see subAdminCount
    if (user?.role === UserRole.QABILA_ADMIN) {
      metricsResponse.subAdminCount = subAdminCount;
    }

    res.json(metricsResponse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch admin metrics' });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware if needed, but we'll validate manually
    const user = req.user as any;
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const branchId = user?.role === UserRole.SUB_ADMIN 
      ? (user?.branchId || 'الفرع الرئيسي')
      : undefined;

    const analytics = await getAnalyticsForTenant(String(tenantId), branchId);
    return res.json(analytics);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

router.get('/analytics/export', async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware if needed, but we'll validate manually
    const user = req.user as any;
    const { tenantId, format } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const exportFormat = String(format || 'csv').toLowerCase();
    if (exportFormat !== 'csv') {
      return res.status(400).json({ error: 'Only csv format is currently supported' });
    }

    const branchId = user?.role === UserRole.SUB_ADMIN 
      ? (user?.branchId || 'الفرع الرئيسي')
      : undefined;

    const analytics = await getAnalyticsForTenant(String(tenantId), branchId);
    const rows: string[] = [];

    rows.push('section,key,value');
    for (const [key, value] of Object.entries(analytics.overview)) {
      rows.push(`overview,${key},${value}`);
    }

    for (const row of analytics.activityByDay) {
      rows.push(`activityByDay,${row.date},${row.count}`);
    }

    for (const row of analytics.memberGrowth) {
      rows.push(`memberGrowth-${row.month},newMembers,${row.newMembers}`);
      rows.push(`memberGrowth-${row.month},totalMembers,${row.totalMembers}`);
    }

    for (const row of analytics.eventAttendance) {
      rows.push(`eventAttendance-${row.eventId},registeredCount,${row.registeredCount}`);
      rows.push(`eventAttendance-${row.eventId},occupancyRate,${row.occupancyRate ?? ''}`);
    }

    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${tenantId}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to export analytics' });
  }
});

router.post('/reminders/run-once', async (req, res) => {
  try {
    const tenantId = typeof req.body?.tenantId === 'string' ? req.body.tenantId : undefined;
    const result = await runEventReminderCycleOnce(tenantId);
    return res.json({
      message: tenantId ? 'Reminder cycle triggered for tenant' : 'Reminder cycle triggered for all tenants',
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to run one-shot reminder cycle' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const { tenantId, status, limit } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const query: Record<string, unknown> = { tenantId };
    if (status) {
      query.status = status;
    }

    const limitNumber = limit ? Math.min(Number(limit), 100) : 50;
    const { JoinRequest } = await getTenantModels(String(tenantId));
    const requests = await JoinRequest.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNumber)
      .lean();

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch join requests' });
  }
});

router.patch('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const tenantId = String(req.body?.tenantId || req.query?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    const { JoinRequest } = await getTenantModels(tenantId);
    const updated = await JoinRequest.findByIdAndUpdate(
      id,
      { status, reviewedAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update join request' });
  }
});

// Branch Managers endpoints
router.get('/managers', async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware if needed, but we'll validate manually
    const user = req.user as any;
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const query: any = { tenantId, role: UserRole.SUB_ADMIN };
    
    // Enforce branch scoping for sub-admins
    if (user?.role === UserRole.SUB_ADMIN) {
      query.branchId = user?.branchId || 'الفرع الرئيسي';
    }

    const managers = await User.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();

    res.json(managers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch branch managers' });
  }
});

router.post('/managers', async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware if needed, but we'll validate manually
    const user = req.user as any;
    const { tenantId, name, email, branchId } = req.body;

    if (!tenantId || !name || !email) {
      return res.status(400).json({ error: 'tenantId, name, and email are required' });
    }

    // Enforce branch scoping for sub-admins
    let effectiveBranchId = branchId || 'الفرع الرئيسي';
    if (user?.role === UserRole.SUB_ADMIN) {
      // Sub-admins can only create managers for their own branch
      if (String(effectiveBranchId) !== String(user?.branchId || 'الفرع الرئيسي')) {
        return res.status(403).json({ error: 'Access denied: Sub-admin can only create managers for own branch' });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Default password MVP for Branch Managers
    const defaultPassword = 'password123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(defaultPassword, salt);

    const newManager = await User.create({
      name,
      email,
      passwordHash,
      role: UserRole.SUB_ADMIN,
      tenantId,
      branchId: effectiveBranchId
    });

    const safeManager = newManager.toObject();
    // @ts-ignore
    delete safeManager.passwordHash;

    res.status(201).json(safeManager);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create branch manager' });
  }
});

// Members endpoint
router.get('/members', async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware if needed, but we'll validate manually
    const user = req.user as any;
    const { tenantId, branchId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    // Enforce branch scoping for sub-admins
    let effectiveBranchId = branchId;
    if (user?.role === UserRole.SUB_ADMIN) {
      // Sub-admins can only query their own branch (or default if not set)
      if (branchId && String(branchId) !== String(user?.branchId || 'الفرع الرئيسي')) {
        return res.status(403).json({ error: 'Access denied: Sub-admin can only view own branch members' });
      }
      effectiveBranchId = user?.branchId || 'الفرع الرئيسي';
    }

    const query: any = { tenantId, role: UserRole.MEMBER };
    if (effectiveBranchId) {
      query.branchId = effectiveBranchId;
    }

    const members = await User.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .lean();

    res.json(members);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;
