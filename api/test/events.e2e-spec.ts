import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DeliveryService } from '../src/delivery/delivery.service';
import { EventsService } from '../src/events/events.service';
import { setupApp } from '../src/setup-app';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';

interface IngestResponse {
  eventId: string;
  status: string;
}

interface EventResponse {
  id: string;
  sourceId: string;
  receivedAt: string;
  delivery: {
    status: string;
    attempts: Array<{
      at: string;
      statusCode: number | null;
      error: string | null;
    }>;
    lastError: string | null;
  };
}

interface EventsPageResponse {
  items: EventResponse[];
  page: number;
  limit: number;
  total: number;
}

interface ErrorResponse {
  error: string;
  code: string;
}

const body = <T>(response: request.Response): T => response.body as T;

describe('Events API (e2e)', () => {
  let app: NestFastifyApplication;
  let eventsService: EventsService;
  let sourceId: string;
  let eventId: string;

  const deliveryServiceMock = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deliverWithRetries: jest.fn((_eventId: string): Promise<void> =>
      Promise.resolve(),
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useClass(InMemoryStorageService)
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

    const sourceResponse = await request(app.getHttpServer())
      .post('/api/sources')
      .send({
        name: 'events-test-source',
      })
      .expect(201);

    sourceId = body<{ id: string }>(sourceResponse).id;

    const ingestResponse = await request(app.getHttpServer())
      .post(`/webhooks/${sourceId}`)
      .send({
        orderId: 42,
      })
      .expect(202);

    eventId = body<IngestResponse>(ingestResponse).eventId;
    deliveryServiceMock.deliverWithRetries.mockClear();
  });

  beforeEach(() => {
    deliveryServiceMock.deliverWithRetries.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/events возвращает страницу с дефолтной пагинацией', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/events')
      .expect(200);

    const result = body<EventsPageResponse>(response);

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items.some((event) => event.id === eventId)).toBe(true);
  });

  it('фильтрует события по sourceId', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/events?sourceId=${sourceId}`)
      .expect(200);

    const result = body<EventsPageResponse>(response);

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items.every((event) => event.sourceId === sourceId)).toBe(
      true,
    );
  });

  it('received выбирает только pending-события без попыток доставки', async () => {
    const ingestResponse = await request(app.getHttpServer())
      .post(`/webhooks/${sourceId}`)
      .send({
        kind: 'received-filter-test',
      })
      .expect(202);

    const receivedEventId = body<IngestResponse>(ingestResponse).eventId;

    const beforeAttemptResponse = await request(app.getHttpServer())
      .get('/api/events?status=received')
      .expect(200);

    const beforeAttempt = body<EventsPageResponse>(beforeAttemptResponse);

    expect(
      beforeAttempt.items.some((event) => event.id === receivedEventId),
    ).toBe(true);

    eventsService.recordDeliveryAttempt(
      receivedEventId,
      {
        at: '2026-07-27T15:59:00.000Z',
        statusCode: 500,
        error: 'HTTP 500',
      },
      'pending',
      'HTTP 500',
    );

    const afterAttemptResponse = await request(app.getHttpServer())
      .get('/api/events?status=received')
      .expect(200);

    const afterAttempt = body<EventsPageResponse>(afterAttemptResponse);

    expect(
      afterAttempt.items.some((event) => event.id === receivedEventId),
    ).toBe(false);

    const pendingResponse = await request(app.getHttpServer())
      .get('/api/events?status=pending')
      .expect(200);

    const pending = body<EventsPageResponse>(pendingResponse);

    expect(pending.items.some((event) => event.id === receivedEventId)).toBe(
      true,
    );
  });

  it('валидирует status, page и limit', async () => {
    await request(app.getHttpServer())
      .get('/api/events?status=unknown')
      .expect(400);

    await request(app.getHttpServer()).get('/api/events?page=0').expect(400);

    await request(app.getHttpServer()).get('/api/events?limit=101').expect(400);
  });

  it('GET /api/events/:id возвращает событие с историей доставки', async () => {
    eventsService.recordDeliveryAttempt(
      eventId,
      {
        at: '2026-07-27T16:00:00.000Z',
        statusCode: 500,
        error: 'HTTP 500',
      },
      'failed',
      'HTTP 500',
    );

    const response = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .expect(200);

    const event = body<EventResponse>(response);

    expect(event.id).toBe(eventId);
    expect(event.delivery.status).toBe('failed');
    expect(event.delivery.lastError).toBe('HTTP 500');
    expect(event.delivery.attempts).toContainEqual({
      at: '2026-07-27T16:00:00.000Z',
      statusCode: 500,
      error: 'HTTP 500',
    });
  });

  it('GET /api/events/:id возвращает 404 для неизвестного id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/events/unknown-event')
      .expect(404);

    expect(body<ErrorResponse>(response).code).toBe('NOT_FOUND');
  });

  it('POST retry возвращает 202, сохраняет историю и запускает новую серию', async () => {
    const attemptsBefore =
      eventsService.getByIdOrThrow(eventId).delivery.attempts.length;

    const response = await request(app.getHttpServer())
      .post(`/api/events/${eventId}/retry`)
      .expect(202);

    expect(body<{ eventId: string; status: string }>(response)).toEqual({
      eventId,
      status: 'pending',
    });

    const event = eventsService.getByIdOrThrow(eventId);

    expect(event.delivery.status).toBe('pending');
    expect(event.delivery.lastError).toBeNull();
    expect(event.delivery.attempts).toHaveLength(attemptsBefore);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledTimes(1);
    expect(deliveryServiceMock.deliverWithRetries).toHaveBeenCalledWith(
      eventId,
    );
  });

  it('POST retry возвращает 404 и не запускает доставку для неизвестного id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/events/unknown-event/retry')
      .expect(404);

    expect(body<ErrorResponse>(response).code).toBe('NOT_FOUND');
    expect(deliveryServiceMock.deliverWithRetries).not.toHaveBeenCalled();
  });

  it('применяет page и limit', async () => {
    const firstIngest = await request(app.getHttpServer())
      .post(`/webhooks/${sourceId}`)
      .send({
        pageTest: 1,
      })
      .expect(202);

    const secondIngest = await request(app.getHttpServer())
      .post(`/webhooks/${sourceId}`)
      .send({
        pageTest: 2,
      })
      .expect(202);

    const firstId = body<IngestResponse>(firstIngest).eventId;
    const secondId = body<IngestResponse>(secondIngest).eventId;

    const firstPageResponse = await request(app.getHttpServer())
      .get(`/api/events?sourceId=${sourceId}&page=1&limit=1`)
      .expect(200);

    const secondPageResponse = await request(app.getHttpServer())
      .get(`/api/events?sourceId=${sourceId}&page=2&limit=1`)
      .expect(200);

    const firstPage = body<EventsPageResponse>(firstPageResponse);
    const secondPage = body<EventsPageResponse>(secondPageResponse);

    expect(firstPage.page).toBe(1);
    expect(firstPage.limit).toBe(1);
    expect(firstPage.items).toHaveLength(1);

    expect(secondPage.page).toBe(2);
    expect(secondPage.limit).toBe(1);
    expect(secondPage.items).toHaveLength(1);

    expect(firstPage.items[0].id).toBe(secondId);
    expect(secondPage.items[0].id).toBe(firstId);
  });
});
