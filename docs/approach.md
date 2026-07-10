# Approach

The implementation follows the requested phased plan:
1. Database schema and auth foundations
2. REST CRUD APIs with project membership enforcement
3. WebSocket room isolation for live updates
4. Frontend board UI with drag-and-drop and optimistic updates
5. Secure file upload support

The backend uses in-memory SQL for local development when no database URL is supplied, while the Docker setup targets PostgreSQL.
