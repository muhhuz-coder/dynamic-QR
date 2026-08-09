# Review Management Admin Dashboard

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. Assumes the stack/architecture in [01-system-overview.md](01-system-overview.md). Tables referenced here (`clients`, `reviews`, `ai_replies`) are defined in [05-database-schema.md](05-database-schema.md). Google/OpenAI integration details in [10-integration-points.md](10-integration-points.md). Edge cases in [09-error-handling-edge-cases.md](09-error-handling-edge-cases.md#review-sync-edge-cases).

## 1. Client Onboarding Flow

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
          googleAccessToken: accessToken, // Store securely (encrypt) — see 07-authentication-security.md
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

## 2. Client Details Setup

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

## 3. AI Reply Configuration

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

## 4. Google Review Sync

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

## 5. AI Reply Generation

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

> Full rating-based branching rules are summarized in [08-business-logic-algorithms.md](08-business-logic-algorithms.md#ai-reply-selection-logic).

## 6. Admin Approval & Posting

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

See also: [05-database-schema.md](05-database-schema.md#clients-table) for the `clients`/`reviews` schema, [10-integration-points.md](10-integration-points.md) for Google/OpenAI scopes and endpoints, and [06-api-specifications.md](06-api-specifications.md#review-management-endpoints) for the endpoint list.

Next: [05-database-schema.md](05-database-schema.md)
