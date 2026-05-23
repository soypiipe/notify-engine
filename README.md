# Notify Engine

Notification Engine is a service designed to send notifications across multiple channels (email, SMS, Slack), centralizing the entire notification process.

## Local Setup

### Prerequisites
- Node.js v24+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)

### Installation

1. Clone repository
2. Install dependencies: `npm install`
3. Create `.env` from `.env.example`
4. Start services: `npm run docker:up`
5. Run application: `npm run start:dev`

### Environment Variables

See `.env.example` for full list.

## Project Structure
```
src/
├── notifications/       # Notification management
├── common/             # Shared utilities
└── app.module.ts       # Application root
```

## API Documentation

Swagger available at `http://localhost:3000/api/docs`

### Current Endpoints (Bloque A)

- `POST /notifications` — Create notification
- `GET /notifications/:id` — Get notification status
- `GET /notifications` — List all notifications

## Architecture Decisions (Bloque A)

- **TypeORM**: ORM for PostgreSQL
- **UUID**: Auto-generated primary keys
- **Synchronize**: Auto-create schema (dev only)
- **Synchronous Persistence**: Notifications saved to database immediately upon receipt
- **Database**: Save notifications on postgres database


## Next Steps (Bloque B)

- Message queues (BullMQ + Redis)
- Observability (OpenTelemetry + Grafana)
- AWS SQS integration (Floci local)