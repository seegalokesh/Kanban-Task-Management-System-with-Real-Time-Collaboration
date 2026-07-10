# Tradeoffs

- PostgreSQL was chosen because the data model is strongly relational and fits the project hierarchy.
- Socket.io was chosen over raw WebSockets for a faster implementation and built-in reconnection support.
- Optimistic UI update logic is intentionally simple to keep the first version responsive, while the backend still remains the source of truth.
- The current local implementation uses an in-memory SQL provider when no database URL is supplied; production deployments should use PostgreSQL.
