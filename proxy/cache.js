import Redis from "ioredis";
const redis = new Redis();

export const getCache = async (fingerprint) => {
  const cached = await redis.get(fingerprint);
  return cached ? JSON.parse(cached) : null;
};

export const setCache = async (fingerprint, response, ttl = 5) => {
  await redis.setex(fingerprint, ttl, JSON.stringify(response));
};

export default redis;
