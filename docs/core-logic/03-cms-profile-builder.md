# CMS Link Tree Profile Builder

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. Assumes the stack/architecture in [01-system-overview.md](01-system-overview.md). Tables referenced here (`profiles`, `profile_visits`, `profile_clicks`) are defined in [05-database-schema.md](05-database-schema.md). Endpoint summary in [06-api-specifications.md](06-api-specifications.md).

## 1. Profile Creation & Management

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

## 2. Button Management Logic

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

## 3. Profile Styling Logic

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

## 4. Profile Public View & Analytics

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

> Note: `parseDeviceType` and `getLocationFromIP` are shared helpers also used by QR scan handling — see [02-qr-management.md](02-qr-management.md#3-qr-scan-handler). Keep both implementations in sync if you extract them into a shared module.

---

See also: [05-database-schema.md](05-database-schema.md#profiles-table) for the `profiles`/`profile_visits`/`profile_clicks` schema and [06-api-specifications.md](06-api-specifications.md#cms-profile-endpoints) for the endpoint list.

Next: [04-review-management.md](04-review-management.md)
