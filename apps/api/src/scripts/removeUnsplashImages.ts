import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import User from '../models/User';
import { getTenantModels } from '../lib/tenantDb';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/qabila';

const isTargetImage = (value: unknown) => typeof value === 'string' && /unsplash|i\.pravatar\.cc/i.test(value);

const blankTargetString = (value: unknown) => (isTargetImage(value) ? '' : value);

const blankTargetArray = (value: unknown) => {
  if (!Array.isArray(value)) return value;
  return value.map((item) => (isTargetImage(item) ? '' : item));
};

const cleanSharedCollections = async () => {
  let tenantCount = 0;
  let userCount = 0;

  const tenants = await Tenant.find({ coverImage: /unsplash|i\.pravatar\.cc/i }).select('_id coverImage').lean();
  for (const tenant of tenants) {
    await Tenant.updateOne({ _id: tenant._id }, { $set: { coverImage: '' } });
    tenantCount += 1;
  }

  const users = await User.find({ avatarUrl: /unsplash|i\.pravatar\.cc/i }).select('_id avatarUrl').lean();
  for (const user of users) {
    await User.updateOne({ _id: user._id }, { $set: { avatarUrl: '' } });
    userCount += 1;
  }

  return { tenantCount, userCount };
};

const cleanTenantCollections = async (tenantId: string) => {
  const { Person, Event } = await getTenantModels(tenantId);

  let personCount = 0;
  let eventCount = 0;

  const persons = await Person.find({ imageSrc: /unsplash|i\.pravatar\.cc/i }).select('_id imageSrc').lean();
  for (const person of persons) {
    await Person.updateOne({ _id: person._id }, { $set: { imageSrc: '' } });
    personCount += 1;
  }

  const events = await Event.find({
    $or: [{ mainImage: /unsplash|i\.pravatar\.cc/i }, { images: /unsplash|i\.pravatar\.cc/i }]
  })
    .select('_id mainImage images')
    .lean();

  for (const event of events) {
    const updates: Record<string, unknown> = {};
    const nextMainImage = blankTargetString(event.mainImage);
    const nextImages = blankTargetArray(event.images);

    if (nextMainImage !== event.mainImage) updates.mainImage = nextMainImage;
    if (JSON.stringify(nextImages) !== JSON.stringify(event.images)) updates.images = nextImages;

    if (Object.keys(updates).length > 0) {
      await Event.updateOne({ _id: event._id }, { $set: updates });
      eventCount += 1;
    }
  }

  return { personCount, eventCount };
};

const main = async () => {
  try {
    console.log('[cleanup] connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[cleanup] connected');

    const sharedCounts = await cleanSharedCollections();

    const tenants = await Tenant.find().select('_id name subdomain').lean();
    let tenantPersonUpdates = 0;
    let tenantEventUpdates = 0;

    for (const tenant of tenants) {
      const { personCount, eventCount } = await cleanTenantCollections(String(tenant._id));
      tenantPersonUpdates += personCount;
      tenantEventUpdates += eventCount;
      if (personCount > 0 || eventCount > 0) {
        console.log(`[cleanup] ${tenant.name || tenant.subdomain}: persons=${personCount}, events=${eventCount}`);
      }
    }

    console.log('[cleanup] summary');
    console.log(`  shared tenants updated: ${sharedCounts.tenantCount}`);
    console.log(`  shared users updated:   ${sharedCounts.userCount}`);
    console.log(`  tenant persons updated:  ${tenantPersonUpdates}`);
    console.log(`  tenant events updated:   ${tenantEventUpdates}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[cleanup] failed:', error);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
    process.exit(1);
  }
};

main();