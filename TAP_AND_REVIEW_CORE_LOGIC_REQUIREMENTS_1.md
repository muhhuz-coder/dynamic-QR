# TAP & REVIEW - CORE LOGIC REQUIREMENTS

**Document Version:** 1.0  
**Date:** January 2024  
**Target Audience:** Mid-level Backend/Full-stack Developer  
**Detail Level:** Deep Dive  
**Apps Covered:** QR Management, CMS Profile Builder, Review Management Admin Dashboard

---

## TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [QR Management System](#qr-management-system)
3. [CMS Link Tree Profile Builder](#cms-link-tree-profile-builder)
4. [Review Management Admin Dashboard](#review-management-admin-dashboard)
5. [Database Schema](#database-schema)
6. [API Specifications](#api-specifications)
7. [Authentication & Security](#authentication--security)
8. [Business Logic & Algorithms](#business-logic--algorithms)
9. [Integration Points](#integration-points)
10. [Error Handling & Edge Cases](#error-handling--edge-cases)

---

## SYSTEM OVERVIEW

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    ADMIN INTERFACE                      │
│  (QR Management + CMS Builder + Review Dashboard)      │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
   │ QR Mgmt │    │ CMS     │   │ Review  │
   │ Service │    │ Service │   │ Service │
   └────┬────┘    └────┬────┘   └────┬────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼─────────┐         ┌────────▼────┐
   │ PostgreSQL   │         │ External    │
   │ Database     │         │ Services    │
   └──────────────┘         │ (Google,    │
                            │  OpenAI)    │
                            └─────────────┘
```

### Core Technology Stack

**Frontend:**

- Next.js 14+ (App Router)
- React 18+
- Tailwind CSS 3+
- TypeScript
- SWR/React Query (data fetching)
- Zustand (state management)

**Backend:**

- Next.js API Routes (Serverless)
- Node.js 18+
- TypeScript
- Middleware (authentication, logging)

**Database:**

- PostgreSQL 14+
- Prisma ORM (recommended) or Raw SQL
- Redis (caching, sessions)

**Hosting:**

- Vercel (Frontend + Backend)
- Supabase or AWS RDS (Database)
- Cloudflare (CDN, Workers for edge)

---

## QR MANAGEMENT SYSTEM

### 1. Core Concepts

#### What is a QR Code in This System?

A QR code is a **dynamic redirect pointer** that:

- Has a **static QR image** (printed/hardcoded to NFC)
- Contains a **short code** (e.g., `tap.pk/order-12345`)
- Points to a **dynamic target URL** (changeable anytime)
- Tracks **analytics** (scans, location, device, time)

```
┌─────────────────────────────────────────────────┐
│ Physical Stand with QR Printed                  │
│                                                 │
│  QR Image encodes: tap.pk/order-12345          │
│  (STATIC - never changes after printing)       │
│                                                 │
│  NFC Chip hardcodes: tap.pk/order-12345        │
│  (STATIC - never changes after programming)   │
└──────────────────┬──────────────────────────────┘
                   │
                   │ When scanned
                   │
                   ▼
        ┌──────────────────────┐
        │ System checks DB:    │
        │ short_code =         │
        │ "order-12345"        │
        │ target_url = ?       │
        └──────────────┬───────┘
                       │
                       │ Looks up current target
                       │
                       ▼
        ┌─────────────────────────────┐
        │ Current target in database: │
        │ www.pizzahub.com            │
        │ (DYNAMIC - can change)      │
        └──────────────┬──────────────┘
                       │
                       │ Redirect
                       │
                       ▼
        Customer sees: www.pizzahub.com
```

### 2. QR Generation Logic

#### Batch Create QR Codes

**Input Processing:**

```javascript
// When admin uploads CSV or uses bulk form
const processBatchQRs = (input) => {
  // 1. Validate input
  const validated = validateQRInput(input);

  // 2. Check for duplicates
  const duplicates = await checkDuplicateQRNames(validated);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate QR names found: ${duplicates}`);
  }

  // 3. Generate short codes
  const qrsWithShortCodes = validated.map((qr) => ({
    ...qr,
    shortCode: generateUniqueShortCode(), // e.g., "order-12345"
    // Full redirect URL will be: tap.pk/order-12345
  }));

  // 4. Create QR images
  const qrsWithImages = await Promise.all(
    qrsWithShortCodes.map(async (qr) => ({
      ...qr,
      qrImageUrl: await generateQRImage(qr.shortCode),
      // Generates PNG/SVG of QR code
    }))
  );

  // 5. Batch insert to database
  const created = await db.qrCodes.createMany({
    data: qrsWithImages,
    skipDuplicates: false, // Fail if duplicates exist
  });

  // 6. Return batch info
  return {
    batchId: generateBatchId(),
    totalCreated: created.count,
    qrs: created,
    downloadUrls: {
      png: generatePNGZip(created),
      svg: generateSVGZip(created),
      pdf: generatePrintablePDF(created),
    },
  };
};
```

**Key Logic Points:**

- **Short code generation:** Must be unique, URL-safe, memorable

  ```javascript
  const generateUniqueShortCode = async () => {
    let shortCode;
    let exists = true;

    while (exists) {
      // Generate 8-character alphanumeric code
      shortCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Check if already exists
      exists = await db.qrCodes.findUnique({
        where: { shortCode },
      });
    }

    return shortCode;
  };
  ```

- **Naming with sequences:** When quantity > 1

  ```javascript
  const generateQRNames = (baseName, quantity) => {
    // If quantity = 1: just baseName
    // If quantity = 2: baseName, baseName-02
    // If quantity = 10: baseName, baseName-02 to baseName-10

    if (quantity === 1) {
      return [baseName];
    }

    const names = [baseName]; // First one is base name

    for (let i = 2; i <= quantity; i++) {
      const padded = String(i).padStart(2, '0');
      names.push(`${baseName}-${padded}`);
    }

    return names;
  };
  ```

- **Batch tracking:** Store batch metadata
  ```javascript
  const batchId = `batch-qr-${Date.now()}-${Math.random()}`;
  // All QRs created in this batch get same batchId
  // Allows admin to view/manage batch as unit
  ```

### 3. QR Scan Handler

**When customer scans QR or taps NFC:**

```javascript
// API Endpoint: GET /qr/:shortCode
export const handleQRScan = async (req, res) => {
  const { shortCode } = req.params;

  try {
    // 1. Find QR in database
    const qrCode = await db.qrCodes.findUnique({
      where: { shortCode },
    });

    if (!qrCode) {
      // QR doesn't exist
      return res.status(404).json({ error: 'QR code not found' });
    }

    // 2. Extract device/location info from request
    const scanInfo = {
      deviceType: parseDeviceType(req.headers['user-agent']),
      deviceOS: parseOS(req.headers['user-agent']),
      browser: parseBrowser(req.headers['user-agent']),
      ipAddress: getClientIP(req),
      timestamp: new Date(),
    };

    // 3. Get geolocation from IP (using GeoIP service)
    const location = await getLocationFromIP(scanInfo.ipAddress);

    // 4. Update QR analytics in database
    await db.qrScanEvents.create({
      data: {
        qrId: qrCode.id,
        shortCode,
        ...scanInfo,
        ...location,
        targetUrlAtScan: qrCode.targetUrl, // Store what it redirected to
      },
    });

    // 5. Update QR code summary (last scan info)
    await db.qrCodes.update({
      where: { id: qrCode.id },
      data: {
        totalScanCount: { increment: 1 },
        lastScannedAt: new Date(),
        lastScannedLocation: location.city,
        lastScannedByDevice: scanInfo.deviceType,
      },
    });

    // 6. Redirect to target URL
    return res.redirect(302, qrCode.targetUrl);
  } catch (error) {
    console.error('QR scan error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

**Helper Functions:**

```javascript
// Parse device type from user agent
const parseDeviceType = (userAgent) => {
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

// Parse OS from user agent
const parseOS = (userAgent) => {
  if (/ios|iphone/i.test(userAgent)) return 'iOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/macintosh|macos/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
};

// Parse browser from user agent
const parseBrowser = (userAgent) => {
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/edge/i.test(userAgent)) return 'Edge';
  return 'Unknown';
};

// Get geolocation from IP (using MaxMind GeoIP2 or similar)
const getLocationFromIP = async (ipAddress) => {
  try {
    const response = await geoipService.lookup(ipAddress);
    return {
      country: response.country,
      city: response.city,
      latitude: response.latitude,
      longitude: response.longitude,
      timezone: response.timezone,
    };
  } catch (error) {
    return {
      country: 'Unknown',
      city: 'Unknown',
      latitude: null,
      longitude: null,
      timezone: null,
    };
  }
};
```

### 4. QR Update Logic

**Admin can change target URL anytime:**

```javascript
// API Endpoint: PUT /admin/qr/:qrName/update-target
export const updateQRTarget = async (req, res) => {
  const { qrName } = req.params;
  const { newTargetUrl } = req.body;

  try {
    // 1. Validate auth (admin only)
    const admin = await verifyAdminAuth(req);
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });

    // 2. Validate URL format
    if (!isValidURL(newTargetUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // 3. Find QR by name
    const qrCode = await db.qrCodes.findUnique({
      where: { qrName },
    });

    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // 4. Update target URL
    const updated = await db.qrCodes.update({
      where: { id: qrCode.id },
      data: {
        targetUrl: newTargetUrl,
        targetUrlUpdatedAt: new Date(),
      },
    });

    // 5. Log this change (for audit trail)
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'UPDATE_QR_TARGET',
        resourceType: 'QR_CODE',
        resourceId: qrCode.id,
        oldValue: qrCode.targetUrl,
        newValue: newTargetUrl,
        timestamp: new Date(),
      },
    });

    // 6. Return success
    return res.json({
      success: true,
      qrName,
      oldTarget: qrCode.targetUrl,
      newTarget: newTargetUrl,
      message: 'Target URL updated successfully',
    });
  } catch (error) {
    console.error('Update QR target error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// URL validation
const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
```

### 5. QR Analytics Query Logic

**Fetch analytics for a specific QR:**

```javascript
// API Endpoint: GET /admin/qr/:qrName/analytics
export const getQRAnalytics = async (req, res) => {
  const { qrName } = req.params;
  const { period = '30d' } = req.query; // 7d, 30d, 90d, all

  try {
    // 1. Find QR
    const qrCode = await db.qrCodes.findUnique({
      where: { qrName },
    });

    if (!qrCode) {
      return res.status(404).json({ error: 'QR not found' });
    }

    // 2. Calculate date range
    const dateRange = calculateDateRange(period);

    // 3. Get scan events within date range
    const scanEvents = await db.qrScanEvents.findMany({
      where: {
        qrId: qrCode.id,
        scanTimestamp: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      orderBy: { scanTimestamp: 'desc' },
    });

    // 4. Calculate analytics
    const analytics = {
      totalScans: scanEvents.length,
      lastScanned: scanEvents[0]?.scanTimestamp || null,

      // By method
      byMethod: {
        nfc: scanEvents.filter((e) => e.scanMethod === 'nfc_tap').length,
        qr: scanEvents.filter((e) => e.scanMethod === 'qr_scan').length,
      },

      // By device
      byDevice: {
        mobile: scanEvents.filter((e) => e.deviceType === 'mobile').length,
        desktop: scanEvents.filter((e) => e.deviceType === 'desktop').length,
        tablet: scanEvents.filter((e) => e.deviceType === 'tablet').length,
      },

      // By location
      byLocation: groupBy(scanEvents, 'location.city'),

      // Hourly distribution (last 24h only)
      hourlyDistribution:
        period === '7d' || period === '30d' ? calculateHourlyDistribution(scanEvents) : null,

      // Daily trend
      dailyTrend: calculateDailyTrend(scanEvents),

      // Recent scans (last 20)
      recentScans: scanEvents.slice(0, 20),
    };

    return res.json({
      qrName,
      period,
      analytics,
    });
  } catch (error) {
    console.error('Get QR analytics error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper: Calculate date range based on period
const calculateDateRange = (period) => {
  const now = new Date();
  let start;

  switch (period) {
    case '7d':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      start = new Date('2000-01-01'); // Arbitrary old date
      break;
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start, end: now };
};

// Helper: Group by location and count
const groupBy = (array, property) => {
  return array.reduce((acc, obj) => {
    const key = getNestedProperty(obj, property);
    if (!acc[key]) acc[key] = 0;
    acc[key]++;
    return acc;
  }, {});
};

// Helper: Daily trend
const calculateDailyTrend = (scanEvents) => {
  const grouped = {};

  scanEvents.forEach((event) => {
    const date = event.scanTimestamp.toISOString().split('T')[0];
    if (!grouped[date]) grouped[date] = 0;
    grouped[date]++;
  });

  return Object.entries(grouped).map(([date, count]) => ({
    date,
    scans: count,
  }));
};
```

---

## CMS LINK TREE PROFILE BUILDER

### 1. Profile Creation & Management

**Core Profile Data Structure:**

```javascript
// When admin/client creates a profile
const createProfile = async (req, res) => {
  const { businessName, profileSlug, ownerId } = req.body;

  try {
    // 1. Validate slug uniqueness
    const existingProfile = await db.profiles.findUnique({
      where: { profileSlug },
    });

    if (existingProfile) {
      return res.status(400).json({ error: 'Profile slug already taken' });
    }

    // 2. Create profile with defaults
    const profile = await db.profiles.create({
      data: {
        businessName,
        profileSlug,
        ownerId,

        // Default values
        header: {
          logo: null,
          backgroundImage: null,
          businessName: businessName,
          tagline: '',
        },

        colors: {
          primary: '#000000',
          secondary: '#FFFFFF',
          text: '#333333',
          background: '#FFFFFF',
        },

        buttons: [], // Empty initially
        socialLinks: [], // Empty initially

        settings: {
          isPublished: false,
          visibility: 'private', // Can be: private, public
          customDomain: null,
        },

        analytics: {
          totalVisits: 0,
          totalClicks: 0,
          lastVisit: null,
        },

        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 3. Generate public URL
    const publicUrl = `${process.env.BASE_URL}/profile/${profile.profileSlug}`;

    return res.json({
      profile,
      publicUrl,
      message: 'Profile created successfully',
    });
  } catch (error) {
    console.error('Create profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

### 2. Button Management Logic

**Adding Buttons to Profile:**

```javascript
// API: POST /admin/profile/:profileId/buttons
const addButton = async (req, res) => {
  const { profileId } = req.params;
  const { name, type, url, pdfContent } = req.body;

  try {
    // 1. Validate input
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type required' });
    }

    // 2. Validate type-specific data
    const validation = validateButtonData(type, { url, pdfContent });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // 3. Find profile
    const profile = await db.profiles.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // 4. Create button object
    const newButton = {
      id: generateId(), // uuid
      name,
      type, // 'url', 'pdf', 'phone', 'email', etc
      content: {
        url: type === 'url' ? url : null,
        pdf: type === 'pdf' ? pdfContent : null,
        phone: type === 'phone' ? url : null,
        email: type === 'email' ? url : null,
      },
      order: profile.buttons.length, // Position in list
      isActive: true,
      icon: getIconForType(type),
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      createdAt: new Date(),
    };

    // 5. Add button to profile
    profile.buttons.push(newButton);

    // 6. Save profile
    const updated = await db.profiles.update({
      where: { id: profileId },
      data: { buttons: profile.buttons },
    });

    // 7. Log activity
    await logProfileActivity(profileId, 'BUTTON_ADDED', {
      buttonName: name,
      buttonType: type,
    });

    return res.json({
      button: newButton,
      message: 'Button added successfully',
    });
  } catch (error) {
    console.error('Add button error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Validation for different button types
const validateButtonData = (type, data) => {
  const { url, pdfContent } = data;

  switch (type) {
    case 'url':
      if (!url || !isValidURL(url)) {
        return { valid: false, error: 'Invalid URL' };
      }
      break;

    case 'pdf':
      if (!pdfContent) {
        return { valid: false, error: 'PDF content required' };
      }
      break;

    case 'phone':
      if (!url || !isValidPhoneNumber(url)) {
        return { valid: false, error: 'Invalid phone number' };
      }
      break;

    case 'email':
      if (!url || !isValidEmail(url)) {
        return { valid: false, error: 'Invalid email' };
      }
      break;
  }

  return { valid: true };
};

// Get icon based on button type
const getIconForType = (type) => {
  const iconMap = {
    url: 'link',
    pdf: 'file',
    phone: 'phone',
    email: 'mail',
    instagram: 'instagram',
    facebook: 'facebook',
    twitter: 'twitter',
    whatsapp: 'whatsapp',
    google_review: 'star',
  };
  return iconMap[type] || 'link';
};
```

**Button Reordering:**

```javascript
// API: PUT /admin/profile/:profileId/buttons/reorder
const reorderButtons = async (req, res) => {
  const { profileId } = req.params;
  const { buttonOrder } = req.body; // Array of button IDs in new order

  try {
    // 1. Find profile
    const profile = await db.profiles.findUnique({
      where: { id: profileId },
    });

    // 2. Create order map
    const orderMap = new Map(buttonOrder.map((id, index) => [id, index]));

    // 3. Reorder buttons
    const reorderedButtons = profile.buttons
      .map((btn) => ({
        ...btn,
        order: orderMap.get(btn.id) ?? profile.buttons.length,
      }))
      .sort((a, b) => a.order - b.order);

    // 4. Save
    const updated = await db.profiles.update({
      where: { id: profileId },
      data: { buttons: reorderedButtons },
    });

    return res.json({
      buttons: reorderedButtons,
      message: 'Buttons reordered successfully',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

### 3. Profile Styling Logic

**Color & Branding Management:**

```javascript
// API: PUT /admin/profile/:profileId/styling
const updateProfileStyling = async (req, res) => {
  const { profileId } = req.params;
  const { logo, backgroundImage, colors, font, borderRadius, buttonStyle } = req.body;

  try {
    // 1. Process and validate images
    let logoUrl = null;
    let bgImageUrl = null;

    if (logo) {
      // Upload to cloud storage (Cloudinary, S3, etc)
      logoUrl = await uploadImage(logo, {
        folder: 'tap-and-review/profiles',
        width: 200,
        height: 200,
      });
    }

    if (backgroundImage) {
      bgImageUrl = await uploadImage(backgroundImage, {
        folder: 'tap-and-review/profiles',
        responsive: true,
      });
    }

    // 2. Validate colors (hex format)
    const validColors = {};
    for (const [key, value] of Object.entries(colors || {})) {
      if (isValidHexColor(value)) {
        validColors[key] = value;
      }
    }

    // 3. Update profile
    const updated = await db.profiles.update({
      where: { id: profileId },
      data: {
        header: {
          logo: logoUrl,
          backgroundImage: bgImageUrl,
        },
        colors: validColors,
        styling: {
          font: font || 'inter', // Font family
          borderRadius: borderRadius || 8, // px
          buttonStyle: buttonStyle || 'rounded', // rounded, sharp, pill
        },
      },
    });

    return res.json({
      profile: updated,
      message: 'Styling updated successfully',
    });
  } catch (error) {
    console.error('Update styling error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Hex color validation
const isValidHexColor = (color) => {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};
```

### 4. Profile Public View & Analytics

**When Customer Views Profile:**

```javascript
// API: GET /profile/:profileSlug (Public endpoint, no auth needed)
const getPublicProfile = async (req, res) => {
  const { profileSlug } = req.params;

  try {
    // 1. Find profile
    const profile = await db.profiles.findUnique({
      where: { profileSlug },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // 2. Check visibility
    if (profile.settings.visibility === 'private') {
      return res.status(403).json({ error: 'Profile is private' });
    }

    // 3. Record visit
    const visitInfo = {
      profileId: profile.id,
      visitorIP: getClientIP(req),
      userAgent: req.headers['user-agent'],
      timestamp: new Date(),
      deviceType: parseDeviceType(req.headers['user-agent']),
      location: await getLocationFromIP(getClientIP(req)),
    };

    // Async log (don't wait)
    db.profileVisits.create({ data: visitInfo }).catch(console.error);

    // 4. Update visit count (use Redis for real-time, persist later)
    await redisClient.increment(`profile:${profile.id}:visits`);

    // 5. Return profile data (without sensitive info)
    return res.json({
      profile: {
        businessName: profile.businessName,
        header: profile.header,
        colors: profile.colors,
        buttons: profile.buttons.filter((b) => b.isActive),
        socialLinks: profile.socialLinks.filter((l) => l.isActive),
        analytics: {
          totalVisits: profile.analytics.totalVisits,
        },
      },
    });
  } catch (error) {
    console.error('Get public profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Track button clicks
// API: POST /profile/:profileSlug/track-click/:buttonId
const trackButtonClick = async (req, res) => {
  const { profileSlug, buttonId } = req.params;

  try {
    // 1. Find profile
    const profile = await db.profiles.findUnique({
      where: { profileSlug },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // 2. Record click
    const clickInfo = {
      profileId: profile.id,
      buttonId,
      visitorIP: getClientIP(req),
      timestamp: new Date(),
      deviceType: parseDeviceType(req.headers['user-agent']),
      location: await getLocationFromIP(getClientIP(req)),
    };

    // Async log
    db.profileClicks.create({ data: clickInfo }).catch(console.error);

    // 3. Update click count (Redis)
    await redisClient.increment(`profile:${profile.id}:button:${buttonId}:clicks`);

    // 4. Get button target and return redirect URL
    const button = profile.buttons.find((b) => b.id === buttonId);

    if (!button) {
      return res.status(404).json({ error: 'Button not found' });
    }

    // Get appropriate URL based on button type
    const targetUrl = getButtonTargetUrl(button);

    return res.json({
      url: targetUrl,
      message: 'Click tracked',
    });
  } catch (error) {
    console.error('Track click error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Get target URL for button click
const getButtonTargetUrl = (button) => {
  switch (button.type) {
    case 'url':
      return button.content.url;
    case 'phone':
      return `tel:${button.content.phone}`;
    case 'email':
      return `mailto:${button.content.email}`;
    case 'whatsapp':
      return `https://wa.me/${button.content.phone}`;
    case 'instagram':
      return `https://instagram.com/${button.content.username}`;
    case 'facebook':
      return button.content.url;
    case 'google_review':
      return button.content.url;
    default:
      return button.content.url;
  }
};
```

---

## REVIEW MANAGEMENT ADMIN DASHBOARD

### 1. Client Onboarding Flow

**Accepting Google Business Profile Invitation:**

```javascript
// When admin accepts Google invite
const acceptGoogleInvite = async (req, res) => {
  const { googleAuthCode } = req.body;

  try {
    // 1. Exchange auth code for access token
    const tokens = await exchangeGoogleAuthCode(googleAuthCode);
    const accessToken = tokens.access_token;

    // 2. Get Business Profile info from Google API
    const businessInfo = await fetchGoogleBusinessProfile(accessToken);

    // Extract key info
    const { name: businessName, locationId, phoneNumber, address, email } = businessInfo;

    // 3. Check if client already exists
    let client = await db.clients.findUnique({
      where: { googleLocationId: locationId },
    });

    if (!client) {
      // 4. Create new client (onboarding section)
      client = await db.clients.create({
        data: {
          businessName,
          googleLocationId: locationId,
          googleAccessToken: accessToken, // Store securely (encrypt)
          googleRefreshToken: tokens.refresh_token,
          googleTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),

          onboardingStatus: 'invited', // States: invited, details_pending, setup_pending, active
          onboardingStep: 1, // Track which step they're on

          // Initially populated from Google
          businessName,
          phoneNumber,
          email,
          address,

          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      // Update existing client
      client = await db.clients.update({
        where: { id: client.id },
        data: {
          googleAccessToken: accessToken,
          googleRefreshToken: tokens.refresh_token,
          googleTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          onboardingStatus: 'invited',
          updatedAt: new Date(),
        },
      });
    }

    return res.json({
      clientId: client.id,
      businessName: client.businessName,
      onboardingStatus: client.onboardingStatus,
      nextStep: 'complete-details',
      message: 'Google Business Profile connected',
    });
  } catch (error) {
    console.error('Accept Google invite error:', error);
    return res.status(500).json({ error: 'Failed to accept invitation' });
  }
};

// Exchange Google auth code for tokens
const exchangeGoogleAuthCode = async (code) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange auth code');
  }

  return response.json();
};

// Fetch business info from Google Business Profile API
const fetchGoogleBusinessProfile = async (accessToken) => {
  // This would call Google's Business Profile API
  // Implementation depends on which Google API you use
  // Could be Google My Business API or later replacements

  const response = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch business profile');
  }

  return response.json();
};
```

### 2. Client Details Setup

**After invitation, admin completes details:**

```javascript
// API: PUT /admin/client/:clientId/setup-details
const setupClientDetails = async (req, res) => {
  const { clientId } = req.params;
  const { ownerName, ownerPhone, ownerEmail, billingEmail, reportEmails, whatsappNumber } =
    req.body;

  try {
    // 1. Find client
    const client = await db.clients.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // 2. Validate emails
    if (!isValidEmail(ownerEmail) || !isValidEmail(billingEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 3. Parse report emails (comma-separated)
    const reportEmailsList = reportEmails
      .split(',')
      .map((e) => e.trim())
      .filter(isValidEmail);

    // 4. Update client
    const updated = await db.clients.update({
      where: { id: clientId },
      data: {
        contactInfo: {
          ownerName,
          ownerPhone,
          ownerEmail,
          billingEmail,
          whatsappNumber,
        },
        emailSettings: {
          reportEmails: reportEmailsList,
          sendMonthlyReports: true,
          sendAlerts: true,
        },
        onboardingStatus: 'details_completed',
        onboardingStep: 2,
        updatedAt: new Date(),
      },
    });

    return res.json({
      client: updated,
      message: 'Client details saved',
      nextStep: 'setup-ai-replies',
    });
  } catch (error) {
    console.error('Setup client details error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

### 3. AI Reply Configuration

**Admin configures AI reply settings:**

```javascript
// API: PUT /admin/client/:clientId/ai-config
const configureAIReplies = async (req, res) => {
  const { clientId } = req.params;
  const {
    aiEnabled,
    starRatings,
    complaintEmail,
    complaintPhone,
    instagramHandle,
    upsellItems,
    closingMessages,
  } = req.body;

  try {
    // 1. Find client
    const client = await db.clients.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // 2. Validate star ratings
    const validStarRatings = starRatings.filter((rating) => rating >= 1 && rating <= 5);

    if (validStarRatings.length === 0) {
      return res.status(400).json({
        error: 'At least one star rating must be selected',
      });
    }

    // 3. Validate upsell items
    const validUpsellItems = (upsellItems || []).filter((item) => {
      return item.name && item.description;
    });

    // 4. Validate closing messages
    const validClosingMessages = (closingMessages || []).filter((msg) => msg.trim().length > 0);

    if (validClosingMessages.length === 0) {
      return res.status(400).json({
        error: 'At least one closing message must be provided',
      });
    }

    // 5. Update AI config
    const updated = await db.clients.update({
      where: { id: clientId },
      data: {
        aiReplyConfig: {
          enabled: aiEnabled,

          starRatings: validStarRatings, // Array: [1,2,3,4,5]
          // If empty, AI won't reply to any reviews

          complaints: {
            email: complaintEmail || null,
            phone: complaintPhone || null,
            // For 1-2 star reviews
          },

          instagram: {
            enabled: instagramHandle ? true : false,
            handle: instagramHandle, // @username
            // Add to 4-5 star reviews only
          },

          upsellItems: validUpsellItems, // Array of {name, description}
          // Will mention randomly in positive reviews

          closingMessages: validClosingMessages,
          // Will pick random one for each reply

          tone: 'professional', // professional, friendly, apologetic
          maxLength: 150, // Character limit
        },

        onboardingStatus: 'setup_completed',
        onboardingStep: 3,
        updatedAt: new Date(),
      },
    });

    return res.json({
      client: updated,
      aiConfig: updated.aiReplyConfig,
      message: 'AI configuration saved',
      nextStep: 'enable-ai-replies',
    });
  } catch (error) {
    console.error('Configure AI error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

### 4. Google Review Sync

**Periodically sync reviews from Google:**

```javascript
// Background job (runs every hour or on-demand)
const syncGoogleReviews = async (clientId) => {
  try {
    // 1. Find client
    const client = await db.clients.findUnique({
      where: { id: clientId },
    });

    if (!client || !client.googleAccessToken) {
      console.log('Client not found or no Google token');
      return;
    }

    // 2. Check if token needs refresh
    if (new Date() > client.googleTokenExpiresAt) {
      await refreshGoogleToken(client);
    }

    // 3. Fetch reviews from Google API
    const reviews = await fetchGoogleReviews(client.googleAccessToken, client.googleLocationId);

    // 4. Process each review
    for (const review of reviews) {
      // Check if review already exists
      const existing = await db.reviews.findUnique({
        where: {
          externalReviewId: review.reviewId,
        },
      });

      if (existing) {
        // Update if rating/text changed
        await db.reviews.update({
          where: { id: existing.id },
          data: {
            rating: review.rating,
            reviewText: review.comment,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new review
        const newReview = await db.reviews.create({
          data: {
            clientId: client.id,
            externalReviewId: review.reviewId,
            source: 'google',

            reviewerName: review.reviewer.displayName,
            reviewerEmail: review.reviewer.emailAddress,
            reviewerAvatar: review.reviewer.profilePhotoUrl,

            rating: review.rating,
            reviewText: review.comment,
            reviewDate: new Date(review.reviewTime),

            status: 'new', // new, seen, replied, archived

            createdAt: new Date(),
          },
        });

        // 5. If AI is enabled, generate reply automatically
        if (client.aiReplyConfig.enabled) {
          await generateAndPostAIReply(newReview, client);
        }

        // 6. Send notification to client
        if (client.emailSettings.sendAlerts) {
          await sendReviewNotification(client, newReview);
        }
      }
    }

    // 7. Update last sync timestamp
    await db.clients.update({
      where: { id: clientId },
      data: {
        googleLastSyncAt: new Date(),
      },
    });

    console.log(`Synced ${reviews.length} reviews for client ${clientId}`);
  } catch (error) {
    console.error('Sync Google reviews error:', error);
    // Log error for monitoring
    await db.syncErrorLog.create({
      data: {
        clientId,
        service: 'google_reviews',
        error: error.message,
        timestamp: new Date(),
      },
    });
  }
};

// Refresh Google token if expired
const refreshGoogleToken = async (client) => {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: client.googleRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokens = await response.json();

    await db.clients.update({
      where: { id: client.id },
      data: {
        googleAccessToken: tokens.access_token,
        googleTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return tokens.access_token;
  } catch (error) {
    console.error('Refresh Google token error:', error);
    throw error;
  }
};

// Fetch reviews from Google
const fetchGoogleReviews = async (accessToken, locationId) => {
  // Call Google My Business API or equivalent
  const response = await fetch(
    `https://mybusinessaccountmanagement.googleapis.com/v1/accounts/*/locations/${locationId}/reviews`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch reviews from Google');
  }

  const data = await response.json();
  return data.reviews || [];
};
```

### 5. AI Reply Generation

**Generate AI replies using OpenAI:**

```javascript
// Generate reply for a review
const generateAIReply = async (review, client) => {
  try {
    // 1. Build prompt based on review and config
    const prompt = buildAIPrompt(review, client.aiReplyConfig);

    // 2. Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a professional business manager responding to reviews. 
            - Keep responses under ${client.aiReplyConfig.maxLength} characters
            - Be ${client.aiReplyConfig.tone}
            - Never use the word "feedback"
            - Always use comma after greeting
            - End with: "Best regards, ${client.businessName} Team"`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    let generatedText = response.choices[0].message.content.trim();

    // 3. Post-processing: ensure quality
    generatedText = sanitizeAIReply(generatedText, client.aiReplyConfig);

    // 4. Store generated reply
    const aiReply = await db.aiReplies.create({
      data: {
        reviewId: review.id,
        clientId: client.id,
        generatedText,
        model: 'gpt-4o-mini',
        tokensUsed: response.usage.completion_tokens,
        approved: false, // Admin must approve before posting
      },
    });

    return aiReply;
  } catch (error) {
    console.error('Generate AI reply error:', error);
    throw error;
  }
};

// Build AI prompt based on review
const buildAIPrompt = (review, config) => {
  let prompt = `Review Rating: ${review.rating}/5\nReview: "${review.reviewText}"\n\n`;

  if (review.rating >= 4 && config.upsellItems.length > 0) {
    // Positive review - mention upsell
    const randomUpsell = config.upsellItems[Math.floor(Math.random() * config.upsellItems.length)];
    prompt += `Mention our "${randomUpsell.name}" - ${randomUpsell.description}\n`;
  }

  if (review.rating <= 2 && config.complaints.email) {
    // Negative review - add complaint contact
    prompt += `Include our email for feedback: ${config.complaints.email}\n`;
  }

  if (review.rating >= 4 && config.instagram.enabled) {
    // Positive review - add Instagram
    prompt += `Suggest following us on Instagram: @${config.instagram.handle}\n`;
  }

  // Add closing message instruction
  const randomClosing =
    config.closingMessages[Math.floor(Math.random() * config.closingMessages.length)];
  prompt += `\nEnd with: "${randomClosing},"`;

  return prompt;
};

// Sanitize AI reply
const sanitizeAIReply = (text, config) => {
  let sanitized = text;

  // Remove "feedback" word if present
  sanitized = sanitized.replace(/\bfeedback\b/gi, 'review');

  // Ensure comma after greeting
  sanitized = sanitized.replace(/(^.*?[!,.])\s/m, (match, p1) => {
    if (!p1.includes(',')) {
      return p1 + ', ';
    }
    return match;
  });

  // Truncate if too long
  if (sanitized.length > config.maxLength) {
    sanitized = sanitized.substring(0, config.maxLength - 3) + '...';
  }

  return sanitized;
};
```

### 6. Admin Approval & Posting

**Admin can approve/reject AI replies:**

```javascript
// API: PUT /admin/client/:clientId/review/:reviewId/approve-reply
const approveAndPostReply = async (req, res) => {
  const { clientId, reviewId } = req.params;
  const { approved, editedText } = req.body; // Admin can edit before posting

  try {
    // 1. Find review and reply
    const review = await db.reviews.findUnique({
      where: { id: reviewId },
    });

    const aiReply = await db.aiReplies.findUnique({
      where: { reviewId },
    });

    if (!review || !aiReply) {
      return res.status(404).json({ error: 'Review or reply not found' });
    }

    if (!approved) {
      // Reject reply
      await db.aiReplies.delete({ where: { id: aiReply.id } });
      return res.json({ message: 'Reply rejected' });
    }

    // 2. Use edited text if provided, otherwise use generated
    const textToPost = editedText || aiReply.generatedText;

    // 3. Post reply to Google
    const client = await db.clients.findUnique({
      where: { id: clientId },
    });

    // Refresh token if needed
    if (new Date() > client.googleTokenExpiresAt) {
      await refreshGoogleToken(client);
    }

    // Post to Google API
    const posted = await postReplyToGoogle(
      client.googleAccessToken,
      review.externalReviewId,
      textToPost,
    );

    // 4. Update review status
    await db.reviews.update({
      where: { id: reviewId },
      data: {
        status: 'replied',
        replyText: textToPost,
        replyPostedAt: new Date(),
      },
    });

    // 5. Update AI reply record
    await db.aiReplies.update({
      where: { id: aiReply.id },
      data: {
        approved: true,
        approvedAt: new Date(),
        approvedByAdmin: req.user.id,
        finalText: textToPost,
        postedToGoogle: true,
        postedAt: new Date(),
      },
    });

    return res.json({
      message: 'Reply posted to Google',
      review,
    });
  } catch (error) {
    console.error('Approve reply error:', error);
    return res.status(500).json({ error: 'Failed to post reply' });
  }
};

// Post reply to Google
const postReplyToGoogle = async (accessToken, reviewId, replyText) => {
  const response = await fetch(
    `https://mybusinessaccountmanagement.googleapis.com/v1/accounts/*/locations/*/reviews/${reviewId}/reply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comment: replyText,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to post to Google: ${error.message}`);
  }

  return response.json();
};
```

---

## DATABASE SCHEMA

### Core Tables

```sql
-- CLIENTS TABLE
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Google Business Profile
  google_location_id VARCHAR(100) UNIQUE,
  google_access_token TEXT, -- Encrypted
  google_refresh_token TEXT, -- Encrypted
  google_token_expires_at TIMESTAMP,

  -- Business Info
  business_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  address TEXT,

  -- Contact Info
  contact_info JSONB, -- {ownerName, ownerEmail, etc}
  email_settings JSONB, -- {reportEmails, sendMonthlyReports}

  -- AI Reply Config
  ai_reply_config JSONB, -- {enabled, starRatings, complaintEmail, etc}

  -- Onboarding
  onboarding_status VARCHAR(50), -- invited, details_completed, setup_completed, active
  onboarding_step INT,

  -- Sync Info
  google_last_sync_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_google_location (google_location_id),
  INDEX idx_onboarding_status (onboarding_status)
);

-- REVIEWS TABLE
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id UUID NOT NULL REFERENCES clients(id),
  external_review_id VARCHAR(100),
  source VARCHAR(50) DEFAULT 'google', -- google, facebook, instagram

  -- Reviewer Info
  reviewer_name VARCHAR(255),
  reviewer_email VARCHAR(255),
  reviewer_avatar TEXT,

  -- Review Content
  rating DECIMAL(2,1) NOT NULL,
  review_text TEXT,
  review_date TIMESTAMP,

  -- Status
  status VARCHAR(50) DEFAULT 'new', -- new, seen, replied, archived

  -- Reply
  reply_text TEXT,
  reply_posted_at TIMESTAMP,

  -- Sentiment (from AI analysis)
  sentiment VARCHAR(50), -- positive, neutral, negative
  sentiment_score DECIMAL(3,2),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_client_id (client_id),
  INDEX idx_external_id (external_review_id),
  INDEX idx_status (status)
);

-- QR_CODES TABLE
CREATE TABLE qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- QR Identity
  qr_name VARCHAR(50) UNIQUE NOT NULL,
  short_code VARCHAR(20) UNIQUE NOT NULL,

  -- QR Image
  qr_image_url TEXT,

  -- Target Link (Dynamic)
  target_url TEXT NOT NULL,
  target_url_updated_at TIMESTAMP,

  -- Product Info
  product_type VARCHAR(50), -- stand, coin, card

  -- Batch Info
  batch_id VARCHAR(50),
  batch_name VARCHAR(255),

  -- Analytics
  total_scan_count INT DEFAULT 0,
  last_scanned_at TIMESTAMP,
  last_scanned_location VARCHAR(100),
  last_scanned_by_device VARCHAR(50),

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_qr_name (qr_name),
  INDEX idx_short_code (short_code),
  INDEX idx_batch_id (batch_id)
);

-- QR_SCAN_EVENTS TABLE
CREATE TABLE qr_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  qr_id UUID NOT NULL REFERENCES qr_codes(id),
  short_code VARCHAR(20),

  -- Scan Info
  scan_timestamp TIMESTAMP DEFAULT NOW(),
  scan_method VARCHAR(50), -- nfc_tap, qr_scan

  -- Device Info
  device_type VARCHAR(50), -- mobile, desktop, tablet
  device_os VARCHAR(50), -- iOS, Android, Windows
  browser VARCHAR(100),
  user_agent TEXT,

  -- Location Info
  ip_address VARCHAR(45),
  location_city VARCHAR(100),
  location_country VARCHAR(100),
  location_latitude DECIMAL(10,8),
  location_longitude DECIMAL(11,8),

  -- What it redirected to
  target_url_at_scan TEXT,

  INDEX idx_qr_id (qr_id),
  INDEX idx_scan_timestamp (scan_timestamp)
);

-- PROFILES TABLE (CMS)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_id UUID NOT NULL,
  business_name VARCHAR(255),
  profile_slug VARCHAR(100) UNIQUE NOT NULL,

  -- Header
  header JSONB, -- {logo, backgroundImage, businessName, tagline}

  -- Colors
  colors JSONB, -- {primary, secondary, text, background}

  -- Buttons
  buttons JSONB, -- Array of {id, name, type, url, order}

  -- Social Links
  social_links JSONB, -- Array of social media links

  -- Styling
  styling JSONB, -- {font, borderRadius, buttonStyle}

  -- Settings
  settings JSONB, -- {isPublished, visibility, customDomain}

  -- Analytics
  total_visits INT DEFAULT 0,
  total_clicks INT DEFAULT 0,
  last_visit TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_owner_id (owner_id),
  INDEX idx_profile_slug (profile_slug)
);

-- PROFILE_VISITS TABLE
CREATE TABLE profile_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  profile_id UUID NOT NULL REFERENCES profiles(id),
  visitor_ip VARCHAR(45),
  device_type VARCHAR(50),
  location_city VARCHAR(100),

  visit_timestamp TIMESTAMP DEFAULT NOW(),

  INDEX idx_profile_id (profile_id)
);

-- PROFILE_CLICKS TABLE
CREATE TABLE profile_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  profile_id UUID NOT NULL REFERENCES profiles(id),
  button_id VARCHAR(50),
  visitor_ip VARCHAR(45),
  device_type VARCHAR(50),

  click_timestamp TIMESTAMP DEFAULT NOW(),

  INDEX idx_profile_id (profile_id),
  INDEX idx_button_id (button_id)
);
```

---

## API SPECIFICATIONS

### QR Management Endpoints

```
POST /api/admin/qr/batch/import-csv
  - Upload CSV and create multiple QR codes
  - Returns: batch_id, qrs_created, download_links

GET /qr/:shortCode
  - Public endpoint: Scan redirect
  - Returns: 302 redirect to target_url
  - Logs analytics

PUT /api/admin/qr/:qrName/update-target
  - Change where QR points
  - Returns: success, old/new targets

GET /api/admin/qr/:qrName/analytics
  - Fetch QR analytics
  - Query params: period (7d, 30d, 90d, all)
  - Returns: scans, location, device breakdown
```

### Review Management Endpoints

```
POST /api/admin/client/:clientId/setup-details
  - Complete client onboarding details
  - Body: ownerName, ownerEmail, reportEmails, etc

PUT /api/admin/client/:clientId/ai-config
  - Configure AI reply settings
  - Body: aiEnabled, starRatings, complaintEmail, upsellItems, etc

GET /api/admin/client/:clientId/reviews
  - List all reviews for client
  - Query: status, page, limit
  - Returns: reviews with ai reply suggestions

PUT /api/admin/client/:clientId/review/:reviewId/approve-reply
  - Approve AI reply and post to Google
  - Body: approved, editedText
  - Returns: success message
```

### CMS Profile Endpoints

```
POST /api/admin/profile/:profileId/buttons
  - Add button to profile
  - Body: name, type, url, pdfContent
  - Returns: button object

PUT /api/admin/profile/:profileId/styling
  - Update profile colors, fonts, images
  - Body: colors, logo, backgroundImage
  - Returns: updated profile

GET /profile/:profileSlug
  - Public endpoint: Get profile
  - Returns: profile data, buttons, social links

POST /profile/:profileSlug/track-click/:buttonId
  - Track button click
  - Returns: redirect URL
```

---

## AUTHENTICATION & SECURITY

### Admin Authentication

```javascript
// JWT-based authentication
const adminAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Check admin role
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Not an admin' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### Google Token Encryption

```javascript
// Encrypt sensitive Google tokens
const encryptToken = (token) => {
  const cipher = crypto.createCipher('aes192', process.env.ENCRYPTION_KEY);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decryptToken = (encrypted) => {
  const decipher = crypto.createDecipher('aes192', process.env.ENCRYPTION_KEY);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
```

---

## BUSINESS LOGIC & ALGORITHMS

### Review Status Transitions

```
new → seen → replied → archived
      ↓
      Do not reply (manual archive)
```

### QR Naming with Sequences

```
Input: qr_name="order-12345", quantity=10

Output:
1. order-12345 (first one is base)
2. order-12345-02
3. order-12345-03
...
10. order-12345-10

If quantity=1: Just "order-12345"
```

### AI Reply Selection Logic

```
IF rating >= 4 THEN
  - Mention upsell item
  - Add Instagram handle
ELSE IF rating <= 2 THEN
  - Add complaint email/phone
END IF

- Pick random closing message
- Enforce max length
- Remove "feedback" word
```

---

## ERROR HANDLING & EDGE CASES

### QR Scan Edge Cases

```
1. QR not found
   → Return 404, log to error tracking

2. Target URL invalid
   → Return 400, notify admin

3. Database error during scan
   → Log error, still redirect (don't block customer)

4. Geolocation service down
   → Log with "Unknown" location, continue

5. Rate limiting exceeded
   → Return 429, add to abuse log
```

### Review Sync Edge Cases

```
1. Google API returns 401 (token expired)
   → Auto-refresh token, retry

2. Review already exists
   → Update if rating/text changed

3. Batch contains 1000+ reviews
   → Process in chunks to avoid timeout

4. Network error during sync
   → Log error, retry later via queue

5. Client has no Google token
   → Skip silently, log warning
```

---

## INTEGRATION POINTS

### Google Business Profile API

```javascript
// Required scopes
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Endpoints used
- GET /accounts/*/locations: Get business info
- GET /locations/*/reviews: Fetch reviews
- POST /reviews/*/reply: Post replies
```

### OpenAI API

```javascript
// Model: gpt-4o-mini
// Usage: Generate review replies
// Rate: Monitor token usage for cost
// Fallback: Use template replies if API down
```

---

## MONITORING & LOGGING

```javascript
// Log all critical operations
const logOperation = (operation, data, status) => {
  const logEntry = {
    timestamp: new Date(),
    operation,
    data,
    status, // success, error
    userId: req.user?.id,
  };

  if (status === 'error') {
    errorLogger.error(logEntry);
    // Alert admin
  } else {
    auditLogger.info(logEntry);
  }
};
```

---

## DEPLOYMENT CHECKLIST

- [ ] Set environment variables
- [ ] Configure database migrations
- [ ] Set up Redis for caching
- [ ] Configure Google API credentials
- [ ] Set up OpenAI API key
- [ ] Configure Cloudflare Workers (for edge routing)
- [ ] Set up monitoring/alerting
- [ ] Configure backups
- [ ] Set up CI/CD pipeline
- [ ] Test all integrations

---

**END OF DOCUMENT**

Last Updated: January 2024  
Version: 1.0  
Ready for Development: YES
