# Monitoring & Logging

> Part of the [TAP & REVIEW Core Logic Requirements](README.md) set. This pattern should wrap the critical write operations described across [02-qr-management.md](02-qr-management.md), [03-cms-profile-builder.md](03-cms-profile-builder.md), and [04-review-management.md](04-review-management.md) (target URL updates, AI reply approval/posting, review sync).

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

Next: [12-deployment-checklist.md](12-deployment-checklist.md)
