# Database Schema

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. This is the single source of truth for field names/types used across [02-qr-management.md](02-qr-management.md), [03-cms-profile-builder.md](03-cms-profile-builder.md), and [04-review-management.md](04-review-management.md). If a feature doc's code sample disagrees with this schema, this schema wins.

## Core Tables

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

-- ADMINS TABLE
-- Referenced by adminAuthMiddleware in the original spec but never defined there.
-- Implemented in Slice 1b of the build (see docs/core-logic/02-qr-management.md
-- Implementation Notes) to make admin auth real rather than stubbed.
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- scrypt, salt:hash hex — see src/lib/auth/password.ts
  role VARCHAR(50) DEFAULT 'admin',

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_email (email)
);

-- AUDIT_LOG TABLE
-- Referenced by updateQRTarget() in the original spec but never defined there.
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  admin_id UUID NOT NULL REFERENCES admins(id),
  action VARCHAR(100) NOT NULL, -- e.g. UPDATE_QR_TARGET
  resource_type VARCHAR(50) NOT NULL, -- e.g. QR_CODE
  resource_id UUID NOT NULL,

  old_value TEXT,
  new_value TEXT,

  timestamp TIMESTAMP DEFAULT NOW(),

  INDEX idx_resource (resource_type, resource_id)
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

> Note: `admins` and `audit_log` (above) are now defined and implemented for the QR Management feature. The Review Management feature still references `ai_replies` and `sync_error_log` tables (see [04-review-management.md](04-review-management.md)) that remain unspecified — define these before implementing that feature.

---

Next: [06-api-specifications.md](06-api-specifications.md)
