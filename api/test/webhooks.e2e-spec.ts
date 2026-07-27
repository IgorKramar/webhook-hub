import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { DeliveryService } from './../src/delivery/delivery.service';
import { EventsService } from './../src/events/events.service';
import { setupApp } from './../src/setup-app';

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

  const deliveryServiceMock = {
    deliverWithRetries: jest.fn(() => Promise.resolve()),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DeliveryService)
      .useValue(deliveryServiceMock)
      .compile();

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

  beforeEach(() => {
    deliveryServiceMock.deliverWithRetries.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('202 с верным секретом и асинхронно запускает доставку', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .set('X-Webhook-Secret', 's3cret')
      .send({ orderId: 42, amount: 100 })
      .expect(202);

    const result = body<IngestResponse>(res);

    expect(result.eventId).toEqual(expect.any(String));
    expect(result.status).toBe('received');
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(1);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledWith(
      result.eventId,
    );
  });

  it('401 UNAUTHORIZED при неверном секрете и не запускает доставку', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .set('X-Webhook-Secret', 'wrong')
      .send({ a: 1 })
      .expect(401);

    expect(body<ErrorBody>(res).code).toBe('UNAUTHORIZED');
    expect(deliveryServiceMock.deliverWithRetries).not.toHaveBeenCalled();
  });

  it('401 при отсутствии секрета, если он задан у источника', async () => {
    await request(app.getHttpServer())
      .post(`/webhooks/${securedSourceId}`)
      .send({ a: 1 })
      .expect(401);

    expect(deliveryServiceMock.deliverWithRetries).not.toHaveBeenCalled();
  });

  it('202 без секрета для источника без секрета', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .send({ a: 1 })
      .expect(202);

    const result = body<IngestResponse>(res);

    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(1);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledWith(
      result.eventId,
    );
  });

  it('404 NOT_FOUND для неизвестного sourceId', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f')
      .send({ a: 1 })
      .expect(404);

    expect(body<ErrorBody>(res).code).toBe('NOT_FOUND');
    expect(deliveryServiceMock.deliverWithRetries).not.toHaveBeenCalled();
  });

  it('404 для не-uuid sourceId', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/definitely-not-a-source')
      .send({ a: 1 })
      .expect(404);

    expect(deliveryServiceMock.deliverWithRetries).not.toHaveBeenCalled();
  });

  it('массив в body проходит', async () => {
    const res = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .send([{ a: 1 }, { b: 2 }])
      .expect(202);

    const result = body<IngestResponse>(res);

    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledWith(
      result.eventId,
    );
  });

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
    expect(event!.headers['x-webhook-secret']).toBe('***');
    expect(event!.headers['user-agent']).toBe('curl/8.0');
    expect(event!.headers).not.toHaveProperty('x-evil-header');
    expect(event!.delivery).toEqual({
      status: 'pending',
      attempts: [],
      lastError: null,
    });

    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledWith(
      eventId,
    );
  });

  it('idempotency: тот же ключ возвращает тот же eventId, не создаёт дубликат и не запускает вторую доставку', async () => {
    const first = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'key-1')
      .send({ n: 1 })
      .expect(202);

    const firstResult = body<IngestResponse>(first);
    const countAfterFirst = eventsService.findAll().length;

    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(1);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledWith(
      firstResult.eventId,
    );

    const second = await request(app.getHttpServer())
      .post(`/webhooks/${openSourceId}`)
      .set('Idempotency-Key', 'key-1')
      .send({ n: 1 })
      .expect(202);

    const secondResult = body<IngestResponse>(second);

    expect(secondResult.eventId).toBe(firstResult.eventId);
    expect(eventsService.findAll()).toHaveLength(countAfterFirst);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(1);
  });

  it('idempotency: другой ключ создаёт другое событие и новую доставку', async () => {
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

    const firstResult = body<IngestResponse>(first);
    const secondResult = body<IngestResponse>(second);

    expect(secondResult.eventId).not.toBe(firstResult.eventId);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(2);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenNthCalledWith(
      1,
      firstResult.eventId,
    );
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenNthCalledWith(
      2,
      secondResult.eventId,
    );
  });

  it('idempotency: ключ скоупится per source', async () => {
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

    const openResult = body<IngestResponse>(fromOpen);
    const securedResult = body<IngestResponse>(fromSecured);

    expect(securedResult.eventId).not.toBe(openResult.eventId);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(2);
  });
});
