<div align="center">

# Webhook Hub

### Receive. Inspect. Retry.

[English documentation](../README.en.md) · [Документация на русском](../README.md)

**TypeScript · NestJS / Fastify · Next.js / React**

</div>

---

A fullstack webhook-delivery demo with an API, browser UI and mock subscriber. Follow an event from ingestion to delivery attempts, inspect its history and trigger a retry from the interface.

| Backend | Frontend | Engineering |
| :--- | :--- | :--- |
| Async delivery, HMAC signatures, source-scoped idempotency | Event filters, delivery details, manual retry | DTO validation, Swagger, health checks, E2E test script |

**Demo scope:** single-process JSON-file persistence. Idempotency keys are in memory and do not survive API restarts. This is not a distributed production broker.

```sh
npm ci
cp .env.example .env
npm run dev
```

[Setup & behaviour (EN)](../README.en.md) · [Полное руководство, схемы и примеры API (RU)](../README.md)

---

[Igor Kramar](https://github.com/IgorKramar) · Fullstack engineering
