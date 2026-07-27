import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/setup-app';
import { EventsService } from './../src/events/events.service';

interface ErrorBody {
  error: string;
  code: string;
}

interface IngestResponse {
  eventId: string;
  status: string;
}

const body = <T>(res: request.Response): T => res.body as T;

describe('Webhooks ingest (e2e)', () => {
  let app: NestFastifyApplication;
  let eventsService: EventsService;
  let securedSourceId: string;
  let openSourceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    setupApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    eventsService = app.get(EventsService);

    const secured = await request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'secured', secret: 's3cret' })
      .expect(201);
    securedSourceId = body<{ id: string }>(secured).id;

    const open = await request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'open' })
      .expect(201);
    openSourceId = body<{ id: string }>(open).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('202 с верным секретом (сценарий из раздела 7 ТЗ)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .set('X-Webhook-Secret', 's3cret')
      .send({ orderId: 42, amount: 100 })
      .expect(202);

    const r = body<IngestResponse>(res);
    expect(r.eventId).toEqual(expect.any(String));
    expect(r.status).toBe('received');
  });

  it('401 UNAUTHORIZED при неверном секрете', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .set('X-Webhook-Secret', 'wrong')
      .send({ a: 1 })
      .expect(401);

    expect(body<ErrorBody>(res).code).toBe('UNAUTHORIZED');
  });

  it('401 при отсутствии секрета, если он задан у источника', () =>
    request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .send({ a: 1 })
      .expect(401));

  it('202 без секрета для источника без секрета', () =>
    request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .send({ a: 1 })
      .expect(202));

  it('404 NOT_FOUND для неизвестного sourceId', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f')
      .send({ a: 1 })
      .expect(404);

    expect(body<ErrorBody>(res).code).toBe('NOT_FOUND');
  });

  it('404 для не-uuid sourceId (тоже "неизвестный", 400 был бы отсебятиной)', () =>
    request(app.getHttpServer())
      .post('/webhooks/definitely-not-a-source')
      .send({ a: 1 })
      .expect(404));

  it('массив в body проходит (требование "объект И массив")', () =>
    request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .send([{ a: 1 }, { b: 2 }])
      .expect(202));

  it('событие сохранено: whitelist заголовков, secret замаскирован, delivery pending', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .set('X-Webhook-Secret', 's3cret')
      .set('User-Agent', 'curl/8.0')
      .set('X-Evil-Header', 'should-not-be-stored')
      .send({ orderId: 7 })
      .expect(202);

    const { eventId } = body<IngestResponse>(res);
    const event = eventsService.findById(eventId);

    expect(event).toBeDefined();
    expect(event!.sourceId).toBe(securedSourceId);
    expect(event!.body).toEqual({ orderId: 7 });
    expect(event!.headers['x-webhook-secret']).toBe('***'); // маскировка из ТЗ
    expect(event!.headers['user-agent']).toBe('curl/8.0');
    expect(event!.headers).not.toHaveProperty('x-evil-header'); // whitelist
    expect(event!.delivery).toEqual({
      status: 'pending',
      attempts: [],
      lastError: null,
    });
  });

  it('idempotency: тот же ключ -> тот же eventId, дубликат не создаётся', async () => {
    const first = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'key-1')
      .send({ n: 1 })
      .expect(202);

    const countAfterFirst = eventsService.findAll().length;

    const second = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'key-1')
      .send({ n: 1 })
      .expect(202);

    expect(body<IngestResponse>(second).eventId).toBe(
      body<IngestResponse>(first).eventId,
    );
    expect(eventsService.findAll().length).toBe(countAfterFirst); // без дубля
  });

  it('idempotency: другой ключ -> другой eventId', async () => {
    const first = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'key-a')
      .send({ n: 1 })
      .expect(202);

    const second = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'key-b')
      .send({ n: 1 })
      .expect(202);

    expect(body<IngestResponse>(second).eventId).not.toBe(
      body<IngestResponse>(first).eventId,
    );
  });

  it('idempotency: ключ скоупится per source — тот же ключ у другого источника даёт другой eventId', async () => {
    const fromOpen = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'shared-key')
      .send({ n: 1 })
      .expect(202);

    const fromSecured = await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .set('X-Webhook-Secret', 's3cret')
      .set('Idempotency-Key', 'shared-key')
      .send({ n: 1 })
      .expect(202);

    expect(body<IngestResponse>(fromSecured).eventId).not.toBe(
      body<IngestResponse>(fromOpen).eventId,
    );
  });
});
