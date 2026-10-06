# QABILA Platform - Feature Roadmap & Gap Analysis

## Current Status
- **MVP Stage:** 85% feature-complete
- **Production Ready:** Web ✅, Mobile ⚠️ (blocked by TypeScript errors)
- **Target Market:** Arab families/clans seeking genealogy documentation

---

## 🔴 CRITICAL BLOCKERS (Must Fix First)

### 1. **Mobile App - TypeScript Build Failure**
**Status:** ❌ Blocks mobile deployment
**Issues:**
- Theme type definitions incomplete (missing `secondaryContainer`, `button`, `xxl`)
- Form style types not defined (`tabButtonActive`, `fieldGroup`, `label`)
- Vector icon type mismatch
**Fix Priority:** URGENT - Week 1
**Owner:** Mobile team
**Effort:** 2-3 hours

### 2. **Input Validation & Sanitization**
**Status:** ❌ Security vulnerability
**Missing:**
- API endpoint validation (no schema checking)
- XSS prevention on text fields
- SQL injection protection (though using Mongoose)
**Affected Endpoints:**
- POST /persons, /users, /events, /join-requests
- PATCH /profile, /person/{id}
**Fix Priority:** URGENT - Week 1
**Effort:** 4-6 hours

### 3. **File Upload Service**
**Status:** ❌ Images not actually uploadable
**Current:** URLs stored in DB only
**Missing:**
- Cloud storage integration (AWS S3, Cloudinary, or similar)
- File validation (size, type, MIME)
- Image optimization/resizing
**Affected Features:**
- Family member photos
- Family cover images
- Event images
**Fix Priority:** HIGH - Week 2
**Effort:** 6-8 hours

---

## ⚠️ PARTIAL IMPLEMENTATIONS (Need Completion)

### 1. **Email System**
**Implemented:** ✅ Welcome email on join request approval
**Missing:**
- Email templates (professional styling)
- Password reset flow
- Email verification on signup
- Event reminders
- Announcement broadcasts
- Unsubscribe management
**Fix Priority:** HIGH - Week 2-3
**Effort:** 8-12 hours

### 2. **User Profile Management**
**Implemented:** ✅ Basic view/edit (name, email, phone)
**Missing:**
- Profile preferences (notifications, privacy)
- Password change functionality
- Two-factor authentication (2FA)
- Account deactivation
- Profile completion progress indicator
**Fix Priority:** MEDIUM - Week 3-4
**Effort:** 6-8 hours

### 3. **Search & Discovery**
**Implemented:** ✅ Basic person search with relationship filters
**Missing:**
- Full-text search across family tree
- Saved searches
- Advanced filters (birth year range, location, branch)
- Search history
- Autocomplete suggestions
- Mobile search UI
**Fix Priority:** MEDIUM - Week 3
**Effort:** 5-7 hours

### 4. **Admin Dashboard Analytics**
**Implemented:** ✅ Activity logging + analytics dashboard (activity charts, growth trends, family stats, event attendance)
**Delivered:**
- Analytics API endpoint with overview + trends
- Dashboard visual sections for activity, growth, family-tree stats, and event attendance
- Export CSV report from dashboard
- PDF export via browser print workflow
- One-shot reminders trigger endpoint for operational testing
**Remaining:**
- Optional server-side PDF generation endpoint (if required beyond print-to-PDF)
**Fix Priority:** ✅ Completed
**Effort:** ~9 hours

---

## ❌ NOT IMPLEMENTED (New Features)

### 1. **Payment & Subscription System** (Revenue Model)
**Status:** ❌ 0%
**Scope:**
- Stripe/Paddle integration
- Subscription plans (Free, Pro, Enterprise)
- Family plan pricing
- Invoice generation
- Dunning management
**Fix Priority:** HIGH (Business critical) - Week 5-6
**Effort:** 12-16 hours
**Blockers:** Need payment processor account

### 2. **Real-Time Features**
**Status:** ⚠️ Partially implemented
**Scope:**
- Live message updates via SSE
- Real-time notifications center on web
- Mobile notification refresh path
- Live event chat
**Fix Priority:** LOW - Week 8+
**Effort:** 10-14 hours

### 3. **Messaging & Communication**
**Status:** ✅ Completed (MVP + realtime + unread/read tracking)
**Delivered:**
- Direct messaging between members
- Group chats for branches
- Announcements system
- Moderation tools
- Real-time delivery via SSE updates
- Unread badges and read receipts
**Remaining:**
- Attachment support (images/files)
- Message search and archival controls
**Fix Priority:** LOW - follow-up polish
**Effort:** Optional enhancements only

### 4. **Content & Media Library**
**Status:** ❌ 0%
**Scope:**
- Family stories/articles
- Photo gallery (organized by event/time)
- Document storage (birth certificates, genealogy records)
- Audio/video stories
- Timeline view
**Fix Priority:** MEDIUM - Week 7-8
**Effort:** 14-18 hours

### 5. **Advanced Security Features**
**Status:** ⚠️ 30% (JWT + RBAC only)
**Missing:**
- Rate limiting (prevent brute force)
- API key authentication
- Audit log dashboard
- IP whitelisting per tenant
- Session management
- Encryption at rest
**Fix Priority:** MEDIUM - Week 5
**Effort:** 6-8 hours

### 6. **Testing Infrastructure**
**Status:** ❌ 0% (no tests found)
**Scope:**
- Unit tests (models, utilities)
- API integration tests
- E2E tests (auth, family tree, approvals)
- Mobile component tests
**Fix Priority:** MEDIUM - Ongoing
**Effort:** 20+ hours

---

## 📋 FEATURE COMPLETION CHECKLIST

### Web Features
- [x] Authentication (signup, login, logout)
- [x] Family tree CRUD
- [x] Family tree visualization
- [x] Events management
- [x] Join request workflow
- [x] Admin dashboard
- [x] Super admin dashboard
- [x] Member profiles
- [ ] Advanced search
- [ ] Privacy settings
- [x] Notifications center
- [ ] Export family tree
- [ ] Print family tree

### Mobile Features
- [x] Authentication
- [x] Family tree view
- [x] Family tree editor
- [x] Events list/detail
- [x] Admin screens
- [x] Approvals
- [x] Member profiles
- [ ] Offline mode
- [ ] Push notifications
- [ ] Share family tree
- [ ] Photo upload/gallery
- [ ] Background sync

### Admin Features
- [x] Clan admin dashboard
- [x] Super admin dashboard
- [x] Join request approval
- [x] Member management
- [x] Tenant import
- [ ] Advanced analytics
- [ ] Member invitations
- [ ] Bulk member import
- [ ] Moderation tools
- [ ] Usage reports

---

## 📊 ESTIMATED TIMELINE

### Phase 1: Stabilization (Weeks 1-2) ⏰ ~40 hours
- Fix mobile TypeScript errors
- Add input validation
- Implement error logging
- File upload integration

### Phase 2: Enhancement (Weeks 3-4) ⏰ ~35 hours
- Complete email system
- Advanced search
- Analytics dashboard
- Profile management

### Phase 3: Growth (Weeks 5-6) ⏰ ~30 hours
- Payment system
- Advanced security
- Messaging system
- Content library

### Phase 4: Polish (Weeks 7-8) ⏰ ~25 hours
- Testing suite
- Real-time features
- Performance optimization
- Documentation

**Total Effort:** ~130 hours (~3-4 months for 1 developer, ~1 month for team of 3)

---

## 🎯 RECOMMENDED PRIORITY ORDER

**Week 1 (Critical - Block all):**
1. Mobile TypeScript fixes
2. Input validation
3. Error logging (Sentry)

**Week 2:**
1. File upload (S3)
2. Email templates
3. Rate limiting

**Week 3:**
1. Advanced search
2. User preferences
3. Analytics dashboard

**Week 4+:**
1. Payment system (revenue)
2. Messaging (engagement)
3. Content library (stickiness)

---

## 🏗️ ARCHITECTURE IMPROVEMENTS NEEDED

### Backend
- [ ] Connection pooling for per-tenant DBs
- [ ] Query optimization (add indexes)
- [ ] Caching layer (Redis)
- [ ] Rate limiting middleware
- [ ] Error tracking (Sentry)
- [ ] API documentation (Swagger)

### Frontend
- [ ] Component testing
- [ ] Performance monitoring
- [ ] Error boundary components
- [ ] Offline mode support

### DevOps
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated testing in pipeline
- [ ] Staging environment
- [ ] Monitoring & alerts
- [ ] Database backups

---

## 💡 DOMAIN-SPECIFIC FEATURES FOR ARAB CLANS

Based on platform being Arab family-focused, consider:
2. **Islamic calendar integration** (Hijri dates alongside Gregorian)
3. **Lineage verification system** (proof of tribal membership)
4. **Clan hierarchy visualization** (branches, tribes, sub-tribes)
5. **Marriage/divorce workflows** (cultural events)
6. **Inheritance tracking** (waqf, estate management)
7. **Traditional ceremonies** (wedding, naming, memorials)
8. **Elder/wisdom keeper roles** (cultural authority positions)

---

## ✅ WHAT'S WORKING WELL

- ✅ Responsive design (web + mobile)
- ✅ RTL support (Arabic text)
- ✅ Multi-tenancy architecture
- ✅ Family tree visualization
- ✅ Role-based access control
- ✅ Material Design 3 consistency
- ✅ Activity audit trail

## ❌ TOP 3 RISKS

1. **No payment system** = Cannot monetize or scale sustainably
2. **No tests** = Technical debt accumulates, regressions unpredictable
3. **Mobile build blocked** = Can't ship mobile app as-is

---
