# Authentication & Security

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. This middleware/encryption pattern is assumed to wrap every `/api/admin/*` endpoint listed in [06-api-specifications.md](06-api-specifications.md) and every place `client.googleAccessToken` / `client.googleRefreshToken` is stored or read in [04-review-management.md](04-review-management.md).

## Admin Authentication

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

## Google Token Encryption

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

> Security note: `crypto.createCipher`/`createDecipher` are deprecated in modern Node.js (no explicit IV, weaker key derivation). Prefer `createCipheriv`/`createDecipheriv` with a random IV stored alongside the ciphertext when implementing this for real — flag this to whoever picks up [04-review-management.md](04-review-management.md)'s client onboarding flow, since that's where tokens are first persisted.

---

Next: [08-business-logic-algorithms.md](08-business-logic-algorithms.md)
