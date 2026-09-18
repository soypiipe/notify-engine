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

Swagger available at `http://localhost:3000/api/docs` when `NODE_ENV` is not
`production` — it's disabled in prod because it has no auth of its own
(unlike the `/notifications` endpoints) and exposes the full API shape.

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

## Queue providers: BullMQ vs SQS

`QUEUE_PROVIDER` (env var) selects which queue backend is active — `bullmq`
or `sqs`. Only the infrastructure of the active provider is initialized at
boot: with `QUEUE_PROVIDER=sqs`, the app never registers a BullMQ queue or
worker and never opens a connection to Redis (see `QueuesModule` and
`NotificationsModule`). Both providers behave the same way when a send
fails after exhausting retries: the notification is marked `status: 'failed'`
in the database. The shared retry limit is `MAX_ATTEMPTS`
(`src/common/constants/queue.constants.ts`, currently `3`):

- **BullMQ**: `attempts: MAX_ATTEMPTS` on the job (`bull-mqqueue-adapter.ts`).
  `NotificationProcessor.onQueueFailed` marks the notification failed once
  `job.attemptsMade >= MAX_ATTEMPTS`.
- **SQS**: the consumer requests the `ApproximateReceiveCount` message
  attribute and marks the notification failed (and deletes the message)
  once that count reaches `MAX_ATTEMPTS` (`sqs-consumer.service.ts`).

### SQS: Dead Letter Queue (DLQ) and RedrivePolicy

The app only talks to `SQS_QUEUE_URL` — it doesn't provision the queue. The
consumer already marks a notification `failed` in our own DB once
`ApproximateReceiveCount` reaches `MAX_ATTEMPTS`, independent of any AWS-side
DLQ. Configuring a `RedrivePolicy` on the SQS side is still recommended so
poison messages don't loop in the main queue for other reasons (e.g. the app
being down and never getting the chance to receive/delete a message).

To keep both symmetric, set the DLQ's `maxReceiveCount` to the same value as
`MAX_ATTEMPTS` (`3`).

**Local (Floci, `dev-aws` service in `docker-compose.yml`):**

```bash
# 1. Create the DLQ
aws sqs create-queue --queue-name notifications-dlq --region us-east-1

# 2. Get the DLQ's ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/notifications-dlq \
  --attribute-names QueueArn --region us-east-1 \
  --query 'Attributes.QueueArn' --output text)

# 3. Create (or update) the main queue with the RedrivePolicy pointing at the DLQ
aws sqs create-queue --queue-name notifications --region us-east-1 \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"
```

(`aws` here is assumed aliased with `--endpoint-url=http://localhost:4566`,
as in this project's local setup — use `--endpoint-url` explicitly otherwise.
Floci has no persistent volume in `docker-compose.yml`, so both queues need
to be recreated every time the `dev-aws` container is recreated.)

**Real AWS**: same two commands, without `--endpoint-url`, against a real
queue and region. `maxReceiveCount` must still match `MAX_ATTEMPTS`.