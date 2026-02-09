# Caching Policy & Configuration

This document outlines the server-side caching strategy used in the SNUMPS Automation platform to optimize performance and reduce Notion API usage.

## 1. Overview
The application utilizes a lightweight, in-memory caching layer (`src/lib/server/cache.ts`) to store frequently accessed data. This cache is **ephemeral** and **per-instance**, meaning it does not persist across server restarts or share state between serverless lambda instances.

## 2. Implementation Details
- **Storage**: JavaScript `Map<string, CacheEntry>`.
- **Eviction Strategy**:
  - **Passive**: Checks expiry on read (`get`).
  - **Active**: Probabilistic pruning (5% chance) on write (`set`) to remove expired entries.
  - **Capacity**: Hard limit of **1000 items**. If the limit is exceeded after pruning, the oldest entries are evicted (FIFO approximation).
- **Scope**: Server-side only (SvelteKit `lib/server`).

## 3. Cache Durations (TTL)
Time-To-Live (TTL) values are tuned based on the frequency of data updates and the criticality of real-time consistency.

| Data Type | Key Pattern | Duration | Rationale |
|-----------|-------------|----------|-----------|
| **Events** | `all_events` | **1 min** | Frequent updates to attendance status/codes. |
| **Members List** | `all_members` | **1 min** | Critical for admin dashboards; frequent changes during recruitment. |
| **Single Member** | `member_${email}` | **5 mins** | User profile data changes infrequently. |
| **Activities** | `all_activities` | **1 min** | High traffic view; balanced for freshness. |
| **Activity Range** | `activities_${start}_${end}` | **5 mins** | Filtered views are less likely to change rapidly. |
| **User Activities** | `user_activities_${id}` | **5 mins** | Personal history changes rarely. |
| **President Info** | `president_${semester}` | **1 hour** | Semi-static configuration data. |
| **DB Schema** | `schema_${dbId}` | **1 hour** | Structure changes are rare deployment events. |

## 4. Manual Invalidation
Currently, the system primarily relies on TTL expiry. However, critical mutation actions (like updating a member profile) should ideally invalidate relevant cache keys to ensure immediate consistency, though strictly relying on TTL is the current baseline implementation.

## 5. Serverless Considerations
Since the project may be deployed on serverless platforms (like Vercel), this in-memory cache is **not shared**.
- **Pros**: Zero latency, no external dependencies (Redis/Memcached).
- **Cons**: Users hitting different lambda instances may see slightly different states until caches align or expire.
