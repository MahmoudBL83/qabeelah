import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import personsRouter from './routes/persons';
import seedRouter from './routes/seed';
import joinRequestsRouter from './routes/joinRequests';
import adminRouter from './routes/admin';
import superAdminRouter from './routes/superAdmin';
import tenantsRouter from './routes/tenants';
import authRouter from './routes/auth';
import eventsRouter from './routes/events';
import activitiesRouter from './routes/activities';
import uploadRouter from './routes/upload';
import messagesRouter from './routes/messages';
import lineageRequestsRouter from './routes/lineageRequests';
import notificationsRouter from './routes/notifications';
import branchRoutes from './routes/branchRoutes';
import tenantByHost from './middleware/tenantByHost';
import redirectToCustomDomain from './middleware/redirectToCustomDomain';
import cookieParser from 'cookie-parser';
import { startEventReminderScheduler } from './lib/eventReminderScheduler';
import { migrateLegacyBranches } from './scripts/migrateBranches';
const app = express();
const PORT = process.env.PORT || 3001;
// CORS: allow credentialed requests from configured origins.
// When `credentials: true` is used, Access-Control-Allow-Origin cannot be '*'.
const configuredOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

// Fallback allowed origins for common deployment platforms
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'https://qabeelah-api-vfk6.vercel.app',
  'https://qabeelah.vercel.app',
  'https://qabeelah-frontend.vercel.app'
];

const corsOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultAllowedOrigins;

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // allow non-browser requests (e.g., curl, server-side) when origin is undefined
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

let mongoConnection: Promise<typeof mongoose> | undefined;

if (process.env.VERCEL) {
  app.use(async (_req, res, next) => {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      res.status(503).json({ error: 'Database is not configured' });
      return;
    }

    try {
      mongoConnection ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 }).catch((error) => {
        mongoConnection = undefined;
        throw error;
      });
      await mongoConnection;
      next();
    } catch (error) {
      console.error('[API] MongoDB connection failed:', error);
      res.status(503).json({ error: 'Database is unavailable' });
    }
  });
}

// Redirect canonical base-domain paths (/slug/...) to verified custom domains
app.use(redirectToCustomDomain);

// Resolve tenant by incoming request host (verified custom domains only)
app.use(tenantByHost);

// Load Routers
app.use('/api/persons', personsRouter);
app.use('/api/seed', seedRouter);
app.use('/api/join-requests', joinRequestsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/super-admin', superAdminRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/lineage-requests', lineageRequestsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/branches', branchRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'قبيلة API' });
});



type MemoryMongoServer = {
  getUri(): string;
};

let mongoServer: MemoryMongoServer | undefined;

const createMemoryMongoServer = async (): Promise<MemoryMongoServer> => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  return MongoMemoryServer.create();
};

const startServer = async () => {
  try {
    const configuredMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      Boolean(process.env.RAILWAY_ENVIRONMENT) ||
      Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) ||
      Boolean(process.env.RAILWAY_SERVICE_ID);
    const useMemoryDb = process.env.USE_MEMORY_DB === 'true';
    const MONGO_URI = configuredMongoUri || (isProduction ? '' : 'mongodb://127.0.0.1:27017/qabila');

    let uri = MONGO_URI;

    if (useMemoryDb) {
      if (isProduction) {
        throw new Error('USE_MEMORY_DB is for local development only. Set MONGODB_URI in Railway.');
      }

      console.log('[API] Starting FREE In-Memory MongoDB Server...');
      mongoServer = await createMemoryMongoServer();
      uri = mongoServer.getUri();
      console.log('[API] In-Memory MongoDB running at:', uri);
    } else {
      if (!uri) {
        throw new Error('Missing MongoDB connection string. Set MONGODB_URI in Railway variables.');
      }

      console.log('[API] Attempting to connect to Atlas/Local MongoDB...');
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('[API] Connected to MongoDB successfully!');

    // Run migrations before starting services
    if (process.env.NODE_ENV !== 'test') {
      await migrateLegacyBranches();
    }

    if (process.env.NODE_ENV !== 'test') {
      startEventReminderScheduler();
    }

    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => {
        console.log(`[API] Server is running on port ${PORT}`);
      });
    } else {
      console.log('[API] Running in test mode — not listening on network');
    }
  } catch (error) {
    console.error('[API] Fatal Error during startup:', error);
    process.exit(1);
  }
};

export { app, startServer };
export default app;

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer();
}
