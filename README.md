# Webhook Hub

## Quick Start
## Architecture
## API (см. также /docs — Swagger)
## Usage Example (curl)
## Design Decisions

- Fastify вместо дефолтного Express — быстрее на I/O-нагрузке (приём вебхуков — как раз она) и осознанный уход от дефолта; цена — пара особенностей адаптера (бинд на 0.0.0.0, порядок регистрации Swagger), они учтены.

## Testing
## What I'd Improve With More Time
