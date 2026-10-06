import { Router } from 'express';
import mongoose from 'mongoose';
import { Tenant, User } from '../models';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types/shared';
import { getTenantModels } from '../lib/tenantDb';

const TARGET_MEMBER_COUNT = 1200;

const firstNames = [
  'خالد', 'فهد', 'عبدالعزيز', 'سعود', 'تركي', 'فيصل', 'وليد', 'نايف',
  'نواف', 'سلطان', 'زياد', 'طارق', 'ياسر', 'ماجد', 'بدر', 'سلمان',
  'راشد', 'صالح', 'عبدالله', 'عبدالرحمن', 'محمد', 'حمد', 'مشعل', 'راكان'
];

const lastNames = [
  'بن عمر', 'بن سالم', 'بن صالح', 'بن أحمد', 'بن ناصر', 'المطرفي',
  'السعيد', 'الهاشمي', 'الشريف', 'الحربي', 'القحطاني'
];

const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const buildBulkPersons = (
  tenantId: mongoose.Types.ObjectId,
  existingPeople: Array<{ _id: any; branchId?: string }>,
  defaultImage: string,
  branches: Record<string, string>
) => {
  const people: Array<Record<string, unknown>> = [];
  const parentPool = existingPeople.map((person) => person._id);
  const branchMap = new Map<string, string>();

  existingPeople.forEach((person) => {
    branchMap.set(String(person._id), person.branchId || Object.values(branches)[0]);
  });

  const currentCount = existingPeople.length;
  const remaining = Math.max(0, TARGET_MEMBER_COUNT - currentCount);

  for (let i = 0; i < remaining; i += 1) {
    const parentId = parentPool.length ? randomFrom(parentPool) : undefined;
    const newId = new mongoose.Types.ObjectId();
    const branchValues = Object.values(branches);
    const branchId = parentId ? branchMap.get(String(parentId)) || randomFrom(branchValues) : randomFrom(branchValues);
    const birthYear = 1920 + Math.floor(Math.random() * 80);
    const isLiving = birthYear > 1960;

    branchMap.set(String(newId), branchId);
    parentPool.push(newId);

    people.push({
      _id: newId,
      tenantId,
      firstName: randomFrom(firstNames),
      lastName: randomFrom(lastNames),
      birthYear,
      isLiving,
      parentId,
      imageSrc: ``,
      branchId,
      bio: i % 18 === 0 ? 'عرف بدوره في توثيق الروايات الشفهية للعائلة.' : undefined
    });
  }

  return people;
};

const buildDemoOccasions = (
  tenantId: mongoose.Types.ObjectId,
  familyName: string,
  branches: Record<string, string>
) => {
  const currentYear = new Date().getFullYear();
  const branchValues = Object.values(branches);

  return [
    {
      tenantId,
      title: `الاجتماع السنوي لعائلة ${familyName}`,
      description: 'لقاء سنوي لمراجعة المستجدات، وتبادل الأخبار، وتعزيز الروابط بين الفروع.',
      location: branchValues[0],
      eventDate: new Date(currentYear, new Date().getMonth(), 15)
    },
    {
      tenantId,
      title: 'ليلة التراث والأرشيف',
      description: 'فعالية لعرض الصور القديمة والوثائق العائلية وقصص الأجداد.',
      location: branchValues[1] || branchValues[0],
      eventDate: new Date(currentYear, new Date().getMonth() + 1, 7)
    },
    {
      tenantId,
      title: 'تكريم الخريجين والمتفوقين',
      description: 'حفل عائلي لتكريم المتفوقين والخريجين من أبناء وبنات العائلة.',
      location: branchValues[2] || branchValues[0],
      eventDate: new Date(currentYear, new Date().getMonth() + 2, 20)
    },
    {
      tenantId,
      title: 'ملتقى الأجيال الجديدة',
      description: 'جلسة تعريفية تجمع الجيل الجديد بكبار العائلة والسيرة العائلية.',
      location: branchValues[3] || branchValues[0],
      eventDate: new Date(currentYear, new Date().getMonth() + 3, 12)
    }
  ];
};

const seedAdditionalTenant = async ({
  name,
  arabicName,
  subdomain,
  defaultImage,
  branches,
}: {
  name: string;
  arabicName: string;
  subdomain: string;
  defaultImage: string;
  branches: { main: string; east: string; west: string };
}) => {
  const tenant = await Tenant.create({
    name,
    arabicName,
    subdomain,
    isActive: true
  });

  await upsertDemoUsers(tenant._id, tenant.subdomain, branches.east);

  const extraSalt = await bcrypt.genSalt(10);
  const extraPasswordHash = await bcrypt.hash('password123', extraSalt);
  await User.updateOne(
    { email: `branch2+${tenant.subdomain}@qabila.com` },
    {
      $set: {
        name: 'مدير فرع إضافي (تجريبي)',
        email: `branch2+${tenant.subdomain}@qabila.com`,
        passwordHash: extraPasswordHash,
        role: UserRole.SUB_ADMIN,
        tenantId: tenant._id,
        branchId: branches.west
      }
    },
    { upsert: true }
  );

  const { Person, JoinRequest, Event } = await getTenantModels(String(tenant._id));

  await Person.insertMany([
    {
      tenantId: tenant._id,
      firstName: 'خالد',
      lastName: 'بن سعود',
      birthYear: 1848,
      deathYear: 1918,
      isLiving: false,
      imageSrc: defaultImage,
      branchId: branches.main
    },
    {
      tenantId: tenant._id,
      firstName: 'سعود',
      lastName: 'بن خالد',
      birthYear: 1882,
      deathYear: 1956,
      isLiving: false,
      imageSrc: defaultImage,
      branchId: branches.east
    },
    {
      tenantId: tenant._id,
      firstName: 'ناصر',
      lastName: 'بن خالد',
      birthYear: 1888,
      deathYear: 1969,
      isLiving: false,
      imageSrc: defaultImage,
      branchId: branches.west,
      bio: 'من أوائل من ساهموا في جمع وثائق الأسرة.'
    },
    {
      tenantId: tenant._id,
      firstName: 'فهد',
      lastName: 'بن خالد',
      birthYear: 1894,
      deathYear: 1975,
      isLiving: false,
      imageSrc: defaultImage,
      branchId: branches.main
    }
  ]);

  const starterPeople = await Person.find({ tenantId: tenant._id })
    .select('_id branchId')
    .lean();
  const bulkPeople = buildBulkPersons(tenant._id, starterPeople as Array<{ _id: any; branchId?: string }>, defaultImage, branches);
  if (bulkPeople.length > 0) {
    await Person.insertMany(bulkPeople);
  }

  await JoinRequest.insertMany([
    {
      tenantId: tenant._id,
      fullName: 'فاطمة خالد الشهري',
      email: `fatima.${tenant.subdomain}@example.com`,
      phone: '+966555200001',
      relationship: 'حفيدة مباشرة',
      notes: 'إرفاق كامل للوثائق والأوراق المطلوبة.',
      documents: ['id.pdf']
    },
    {
      tenantId: tenant._id,
      fullName: 'عبدالله ناصر القحطاني',
      email: `abdullah.${tenant.subdomain}@example.com`,
      phone: '+966555200002',
      relationship: 'ابن عم',
      notes: 'طلب الانضمام مع بيانات العائلة.',
      documents: ['family-record.pdf']
    },
    {
      tenantId: tenant._id,
      fullName: 'ريم خالد الحربي',
      email: `reem.${tenant.subdomain}@example.com`,
      phone: '+966555200003',
      relationship: 'ابنة',
      notes: 'مراجعة بيانات النسب.',
      documents: ['certificate.pdf']
    },
    {
      tenantId: tenant._id,
      fullName: 'سلطان سعود المطيري',
      email: `sultan.${tenant.subdomain}@example.com`,
      phone: '+966555200004',
      relationship: 'حفيد',
      notes: 'التحقق من الوثائق المطلوبة.',
      documents: []
    }
  ]);

  await Event.insertMany(buildDemoOccasions(tenant._id, arabicName, branches));

  return tenant;
};

const router = Router();

const slugToTenantName = (slug: string) =>
  slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'عائلة جديدة';

const createTenantIfMissing = async (subdomain: string) => {
  const normalized = subdomain.trim().toLowerCase();
  const existing = await Tenant.findOne({ subdomain: normalized });
  if (existing) return existing;
  return Tenant.create({
    name: slugToTenantName(normalized),
    subdomain: normalized,
    isActive: true
  });
};

const upsertDemoUsers = async (tenantId: mongoose.Types.ObjectId, tenantSlug: string = '', branchId = 'الفرع الشرقي') => {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('password123', salt);

  // Generate tenant-specific demo emails to avoid unique constraint violations
  const adminEmail = tenantSlug ? `admin+${tenantSlug}@qabila.com` : 'admin@qabila.com';
  const memberEmail = tenantSlug ? `member+${tenantSlug}@qabila.com` : 'member@qabila.com';
  const branchEmail = tenantSlug ? `branch+${tenantSlug}@qabila.com` : 'branch@qabila.com';

  await User.updateOne(
    { email: adminEmail },
    {
      $set: {
        name: 'مدير العائلة (تجريبي)',
        email: adminEmail,
        passwordHash,
        role: UserRole.QABILA_ADMIN,
        tenantId
      }
    },
    { upsert: true }
  );

  await User.updateOne(
    { email: memberEmail },
    {
      $set: {
        name: 'عضو العائلة (تجريبي)',
        email: memberEmail,
        passwordHash,
        role: UserRole.MEMBER,
        tenantId
      }
    },
    { upsert: true }
  );

  await User.updateOne(
    { email: branchEmail },
    {
      $set: {
        name: 'مدير فرع (تجريبي)',
        email: branchEmail,
        passwordHash,
        role: UserRole.SUB_ADMIN,
        tenantId,
        branchId
      }
    },
    { upsert: true }
  );

  // Platform admin is global, so no tenant suffix needed
  await User.updateOne(
    { email: 'superadmin@qabila.com' },
    {
      $set: {
        name: 'مشرف المنصة (تجريبي)',
        email: 'superadmin@qabila.com',
        passwordHash,
        role: UserRole.SUPER_ADMIN
      }
    },
    { upsert: true }
  );
};

// A temporary specialized route to setup mock DB data if empty
// Note: allow frontend callers to hit this route without an API key so tenant
// resolution and seeding can be attempted from the client (used across the app).
router.post('/init', async (req, res) => {
  // Demo seeding creates known-password accounts and must stay local.
  if (!['development', 'test'].includes(process.env.NODE_ENV || '')) {
    return res.status(403).json({ error: 'Demo seeding is available only in development or test mode' });
  }
  try {
    const tenantSlug = String(req.body?.tenantSlug || req.query?.tenantSlug || '').trim().toLowerCase();
    const defaultImage = '';
    const branches = {
      main: 'الفرع الرئيسي',
      east: 'الفرع الشرقي',
      west: 'الفرع الغربي',
      north: 'الفرع الشمالي',
      south: 'الفرع الجنوبي',
      central: 'الفرع الوسط',
      coast: 'الفرع الساحلي',
      desert: 'الفرع الصحراوي'
    };

    // Prefer explicit slug, but if none provided and tenant was resolved by host middleware, use that
    let targetTenant = null;
    if (tenantSlug) {
      targetTenant = await createTenantIfMissing(tenantSlug);
    } else if (res.locals && res.locals.tenantId) {
      targetTenant = await Tenant.findById(res.locals.tenantId);
    }
    if (targetTenant) {
      return res.json({
        message: 'Tenant resolved',
        tenantId: targetTenant._id,
        tenantSlug: targetTenant.subdomain
      });
    }

    const tenantCount = await Tenant.countDocuments();
    if (tenantCount > 0 && !targetTenant) {
      const existingTenant = await Tenant.findOne();
      if (existingTenant) {
        return res.json({
          message: 'Database already has data',
          tenantId: existingTenant._id,
          tenantSlug: existingTenant.subdomain
        });
      }
    }

    // 1. Create a Seed Tenant
    const newTenant = targetTenant || await Tenant.create({
      name: 'عائلة الأحمدي',
      arabicName: 'عائلة الأحمدي',
      subdomain: 'alahmadi',
      isActive: true
    });

    // 2. Create demo users
    await upsertDemoUsers(newTenant._id, newTenant.subdomain);

    // 3. Create the seed tree
    const { Person, JoinRequest, Event } = await getTenantModels(String(newTenant._id));

    const p1 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'عبدالله',
      lastName: 'بن محمد',
      birthYear: 1850,
      deathYear: 1920,
      isLiving: false,
      imageSrc: defaultImage,
      branchId: branches.main
    });

    const p2 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'سالم',
      lastName: 'بن عبدالله',
      birthYear: 1885,
      deathYear: 1950,
      isLiving: false,
      parentId: p1._id,
      imageSrc: defaultImage,
      branchId: branches.east
    });

    const p3 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'عمر',
      lastName: 'بن عبدالله',
      birthYear: 1890,
      deathYear: 1965,
      isLiving: false,
      parentId: p1._id,
      imageSrc: defaultImage,
      bio: "كان عمر بن عبدالله من الشخصيات البارزة...",
      branchId: branches.west
    });

    const p4 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'صالح',
      lastName: 'بن عبدالله',
      birthYear: 1895,
      deathYear: 1970,
      isLiving: false,
      parentId: p1._id,
      imageSrc: defaultImage,
      branchId: branches.main
    });

    const p5 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'أحمد',
      lastName: 'بن عمر',
      birthYear: 1930,
      deathYear: 2005,
      isLiving: false,
      parentId: p3._id,
      imageSrc: defaultImage,
      branchId: branches.west
    });

    const p6 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'محمد',
      lastName: 'بن سالم',
      birthYear: 1910,
      deathYear: 1985,
      isLiving: false,
      parentId: p2._id,
      imageSrc: defaultImage,
      bio: 'شارك في تأسيس أول مجلس للعائلة واهتم بتوثيق نسب الفرع الشرقي.',
      branchId: branches.east
    });

    const p7 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'ناصر',
      lastName: 'بن سالم',
      birthYear: 1915,
      deathYear: 1992,
      isLiving: false,
      parentId: p2._id,
      imageSrc: defaultImage,
      branchId: branches.east
    });

    const p8 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'خالد',
      lastName: 'بن عمر',
      birthYear: 1922,
      deathYear: 1999,
      isLiving: false,
      parentId: p3._id,
      imageSrc: defaultImage,
      bio: 'عرف بحبه للعلم ورعايته لأوقاف العائلة في الحجاز.',
      branchId: branches.west
    });

    const p9 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'عبدالرحمن',
      lastName: 'بن صالح',
      birthYear: 1925,
      deathYear: 2001,
      isLiving: false,
      parentId: p4._id,
      imageSrc: defaultImage,
      branchId: branches.main
    });

    const p10 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'سعيد',
      lastName: 'بن صالح',
      birthYear: 1928,
      deathYear: 2008,
      isLiving: false,
      parentId: p4._id,
      imageSrc: defaultImage,
      branchId: branches.main
    });

    const p11 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'راشد',
      lastName: 'بن أحمد',
      birthYear: 1955,
      isLiving: true,
      parentId: p5._id,
      imageSrc: defaultImage,
      bio: 'قاد مبادرات رقمنة وثائق العائلة منذ عام 2010.',
      branchId: branches.west
    });

    const p12 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'نورة',
      lastName: 'بنت أحمد',
      birthYear: 1960,
      isLiving: true,
      parentId: p5._id,
      imageSrc: defaultImage,
      branchId: branches.west
    });

    const p13 = await Person.create({
      tenantId: newTenant._id,
      firstName: 'ليان',
      lastName: 'بنت راشد',
      birthYear: 1990,
      isLiving: true,
      parentId: p11._id,
      imageSrc: defaultImage,
      branchId: branches.west
    });

      await JoinRequest.insertMany([
        {
          tenantId: newTenant._id,
          fullName: 'سارة عبدالله الفايز',
          email: 'sara.a@example.com',
          phone: '+966555111222',
          relationship: 'ابنة أخ ناصر',
          notes: 'أنا ابنة عبدالله بن ناصر، حفيد الجد الأكبر. أملك وثائق رسمية تثبت ذلك من الأرشيف الوطني.',
          documents: ['identity.pdf', 'birth-certificate.pdf', 'family-record.pdf']
        },
        {
          tenantId: newTenant._id,
          fullName: 'عبدالرحمن محمد آل سعود',
          email: 'a.mohammed@example.com',
          phone: '+966555333444',
          relationship: 'حفيد أحمد',
          notes: 'أرفقت شهادة الميلاد القديمة وصك الملكية الخاص بالجد الأكبر.',
          documents: ['certificate.pdf']
        },
        {
          tenantId: newTenant._id,
          fullName: 'فهد خالد الرشيد',
          email: 'f.alrashid@example.com',
          phone: '+966555999111',
          relationship: 'صهر العائلة',
          notes: 'أرغب في المساهمة بتوثيق التراث والمشاركة في أرشفة الوثائق.',
          documents: []
        }
      ]);

      await Event.insertMany(buildDemoOccasions(newTenant._id, newTenant.arabicName || newTenant.name || 'العائلة', branches));

      await upsertDemoUsers(newTenant._id);

      
      // Bulk Data Generation
      const randomParents = [p5._id, p6._id, p7._id, p8._id, p9._id, p10._id, p11._id, p12._id, p13._id];
      const eastBranchParents = new Set([String(p6._id), String(p7._id)]);
      const westBranchParents = new Set([
        String(p5._id),
        String(p8._id),
        String(p11._id),
        String(p12._id),
        String(p13._id)
      ]);
      const randomPersons = [];
      for(let i = 0; i < 30; i++) {
        const parentId = randomParents[Math.floor(Math.random() * randomParents.length)];
        const parentBranch = eastBranchParents.has(String(parentId))
          ? branches.east
          : westBranchParents.has(String(parentId))
            ? branches.west
            : branches.main;
        randomPersons.push({
          tenantId: newTenant._id,
          firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
          lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
          birthYear: 1960 + Math.floor(Math.random() * 40),
          isLiving: true,
          parentId,
          imageSrc: defaultImage,
          branchId: parentBranch
        });
      }
      await Person.insertMany(randomPersons);

      const seededPeople = await Person.find({ tenantId: newTenant._id })
        .select('_id branchId')
        .lean();
      const bulkPeople = buildBulkPersons(newTenant._id, seededPeople, defaultImage, branches);
      if (bulkPeople.length > 0) {
        await Person.insertMany(bulkPeople);
      }

        if (tenantCount === 0) {
          await seedAdditionalTenant({
            name: 'Almalki Family',
            arabicName: 'عائلة المالكي',
            subdomain: 'almalki',
            defaultImage,
            branches
          });

          await seedAdditionalTenant({
            name: 'Alshammari Family',
            arabicName: 'عائلة الشمري',
            subdomain: 'alshammari',
            defaultImage,
            branches
          });
        }

      const randomJoinRequests = [];
      for(let i = 0; i < 12; i++) {
        randomJoinRequests.push({
          tenantId: newTenant._id,
          fullName: firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)],
          email: `user${i}@example.com`,
          phone: `+9665551234${i.toString().padStart(2, '0')}`,
          relationship: i % 2 === 0 ? 'حفيد مباشر' : 'ابن عم',
          notes: 'مرفق جميع الأوراق المطلوبة لاعتماد حسابي في شجرة العائلة',
          documents: ['doc1.pdf']
        });
      }
      await JoinRequest.insertMany(randomJoinRequests);

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('password123', salt);
      const randomUsers = [];
        const branchValues = Object.values(branches);
      for(let i = 0; i < 15; i++) {
        randomUsers.push({
          name: firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)],
          email: `member${i + 10}@qabila.com`,
          passwordHash,
          role: UserRole.MEMBER,
          tenantId: newTenant._id,
          branchId: branchValues[i % branchValues.length]
        });
      }
      await User.insertMany(randomUsers);

      res.json({
        message: 'Seed data created',
        tenantId: newTenant._id,
        tenantSlug: newTenant.subdomain
      });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed seed' });
  }
});

export default router;
