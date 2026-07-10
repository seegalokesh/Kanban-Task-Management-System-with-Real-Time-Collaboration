# Architecture

- Backend: Express + Socket.io + PostgreSQL/pg-mem
- Frontend: React + Vite + Tailwind + @hello-pangea/dnd
- Real-time flow: clients authenticate with JWT, join project rooms, and receive task/comment events over Socket.io
- Data flow: REST APIs handle create/read/update/delete and state changes, while the WebSocket layer broadcasts to project rooms for instant collaboration
