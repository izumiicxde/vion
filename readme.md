# VION HC

# Proxy-Based API Middleware for Request Deduplication and Smart Caching

## **Overview**

This project implements a high-performance **Proxy Middleware Server** that sits between the **Client** and the **Main API Server**.  
Its primary purpose is to **deduplicate concurrent identical requests**, **cache API responses intelligently**, and **broadcast results efficiently** — drastically reducing redundant API hits and improving system responsiveness.

The proxy acts as a **smart proxy**:

- It ensures only one active request per unique resource.
- Queues concurrent identical requests until the main API responds.
- Caches the response based on content type with dynamic TTL.
- Serves future identical requests directly from cache until TTL expiry.

This architecture minimizes backend load, ensures real-time freshness balance, and improves client-side performance consistency.

---

### **Core Components**

- **Client Layer:** Any frontend or external system sending API requests.
- **Proxy/Middleware Server:**  
  Intercepts all client requests, manages deduplication, queuing, and caching logic.
- **Main API Server:**  
  Handles actual business logic and data generation.
- **Cache Store:**  
  Temporary data layer for caching responses with TTL (Redis or in-memory).
- **Queue Manager:**  
  Tracks ongoing identical requests and their waiting clients.

---

## **Workflow Summary**

1. **Request Arrival:**  
   A client sends a request which first reaches the **Proxy Server**.  
   The proxy computes a **fingerprint** (hash) from URL, params, and method.

2. **Cache Lookup:**  
   The proxy queries the cache using the fingerprint.

   - If **cache hit**, returns response immediately.
   - If **cache miss**, proceeds to queue handling.

3. **Request Deduplication & Queueing:**  
   If an identical request is already in-flight, the current request is **queued**.  
   Only the **first unique request** is sent to the main API.

4. **Response Handling:**  
   Once the API returns data:

   - The proxy caches it (with TTL based on content type).
   - Broadcasts the same response to all queued requests.
   - Clears the queue for that fingerprint.

5. **Cache Expiry:**  
   When TTL expires, the next request triggers a fresh fetch from the main API.  
   The same deduplication–cache–broadcast cycle repeats.
