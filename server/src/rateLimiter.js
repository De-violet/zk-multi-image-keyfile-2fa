/**
 * In-Memory Sliding Window Rate Limiter
 * Melindungi endpoint otentikasi dari serangan brute-force dan harvesting commitment.
 */

export function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 10,
  message = 'Terlalu banyak permintaan. Harap tunggu beberapa saat sebelum mencoba lagi.'
} = {}) {
  const tracker = new Map();

  // Pembersihan berkala data lama di memori
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of tracker.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        tracker.delete(key);
      } else {
        tracker.set(key, valid);
      }
    }
  }, windowMs);

  if (timer.unref) timer.unref();

  return (req, res, next) => {
    // Lewati saat automated testing berjalan agar test suite tidak terhambat
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const identifier = req.body?.username ? `${ip}_${req.body.username.toLowerCase()}` : ip;
    const now = Date.now();

    const timestamps = tracker.get(identifier) || [];
    const valid = timestamps.filter(t => now - t < windowMs);

    if (valid.length >= maxRequests) {
      const oldest = valid[0];
      const retryAfter = Math.ceil((windowMs - (now - oldest)) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: message,
        retryAfter
      });
    }

    valid.push(now);
    tracker.set(identifier, valid);
    next();
  };
}
