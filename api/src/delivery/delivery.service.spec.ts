import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { StoredEvent } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { SourcesService } from '../sources/sources.service';
import { DeliveryService } from './delivery.service';

interface HarnessOptions {
  secret?: string;
  subscriberUrl?: string;
  defaultSubscriberUrl?: string;
}

interface Harness {
  deliveryService: DeliveryService;
  eventsService: EventsService;
  event: StoredEvent;
}

const response = (status: number): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
  }) as Response;

const createHarness = (options: HarnessOptions = {}): Harness => {
  const config = new ConfigService({
    API_PORT: '4002',
    SUBSCRIBER_URL:
      options.defaultSubscriberUrl ?? 'http://default.test/deliver',
  });

  const sourcesService = new SourcesService(config);
  const eventsService = new EventsService();

  const source = sourcesService.create({
    name: 'test-source',
    ...(options.secret ? { secret: options.secret } : {}),
    ...(options.subscriberUrl ? { subscriberUrl: options.subscriberUrl } : {}),
  });

  const event: StoredEvent = {
    id: 'event-1',
    sourceId: source.id,
    headers: {
      'content-type': 'application/json',
    },
    body: {
      orderId: 42,
      amount: 100,
    },
    receivedAt: '2026-07-27T15:00:00.000Z',
    delivery: {
      status: 'pending',
      attempts: [],
      lastError: null,
    },
  };

  eventsService.add(event);

  return {
    deliveryService: new DeliveryService(eventsService, sourcesService, config),
    eventsService,
    event,
  };
};

describe('DeliveryService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('успех с первой попытки: delivered без задержек', async () => {
    const { deliveryService, event } = createHarness({
      subscriberUrl: 'http://subscriber.test/deliver',
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(200));

    await deliveryService.deliverWithRetries(event.id);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(event.delivery).toEqual({
      status: 'delivered',
      attempts: [
        {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          at: expect.any(String),
          statusCode: 200,
          error: null,
        },
      ],
      lastError: null,
    });
  });

  it('500, 503, затем 204: ждёт 1 и 3 секунды и сохраняет каждую попытку', async () => {
    const { deliveryService, eventsService, event } = createHarness({
      subscriberUrl: 'http://subscriber.test/deliver',
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(204));

    const recordSpy = jest.spyOn(eventsService, 'recordDeliveryAttempt');

    const deliveryPromise = deliveryService.deliverWithRetries(event.id);

    await jest.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(event.delivery.status).toBe('pending');
    expect(event.delivery.attempts).toHaveLength(1);
    expect(event.delivery.attempts[0]).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      at: expect.any(String),
      statusCode: 500,
      error: 'HTTP 500',
    });

    await jest.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(event.delivery.status).toBe('pending');
    expect(event.delivery.attempts).toHaveLength(2);
    expect(event.delivery.attempts[1]).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      at: expect.any(String),
      statusCode: 503,
      error: 'HTTP 503',
    });

    await jest.advanceTimersByTimeAsync(2_999);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1);
    await deliveryPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(recordSpy).toHaveBeenCalledTimes(3);
    expect(event.delivery.status).toBe('delivered');
    expect(event.delivery.lastError).toBeNull();
    expect(event.delivery.attempts).toHaveLength(3);
    expect(event.delivery.attempts[2]).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      at: expect.any(String),
      statusCode: 204,
      error: null,
    });
  });

  it('после трёх не-2xx ответов помечает доставку failed', async () => {
    const { deliveryService, event } = createHarness({
      subscriberUrl: 'http://subscriber.test/deliver',
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(503));

    const deliveryPromise = deliveryService.deliverWithRetries(event.id);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(3_000);
    await deliveryPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(event.delivery.status).toBe('failed');
    expect(event.delivery.lastError).toBe('HTTP 503');
    expect(event.delivery.attempts).toHaveLength(3);
    expect(event.delivery.attempts).toEqual([
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        at: expect.any(String),
        statusCode: 500,
        error: 'HTTP 500',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        at: expect.any(String),
        statusCode: 502,
        error: 'HTTP 502',
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        at: expect.any(String),
        statusCode: 503,
        error: 'HTTP 503',
      },
    ]);
  });

  it('сетевая ошибка: statusCode null, три попытки и failed', async () => {
    const { deliveryService, event } = createHarness({
      subscriberUrl: 'http://unavailable.test/deliver',
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connection refused'));

    const deliveryPromise = deliveryService.deliverWithRetries(event.id);

    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(3_000);
    await deliveryPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(event.delivery.status).toBe('failed');
    expect(event.delivery.lastError).toBe('connection refused');
    expect(event.delivery.attempts).toHaveLength(3);

    for (const attempt of event.delivery.attempts) {
      expect(attempt.statusCode).toBeNull();
      expect(attempt.error).toBe('connection refused');
    }
  });

  it('подписывает HMAC точную строку body, переданную в fetch', async () => {
    const secret = 'delivery-secret';

    const { deliveryService, event } = createHarness({
      secret,
      subscriberUrl: 'http://subscriber.test/deliver',
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(200));

    await deliveryService.deliverWithRetries(event.id);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchSpy.mock.calls[0];
    const serializedBody = requestInit?.body;

    expect(typeof serializedBody).toBe('string');

    const expectedSignature = `sha256=${createHmac('sha256', secret)
      .update(serializedBody as string)
      .digest('hex')}`;

    expect(requestInit?.headers).toEqual({
      'content-type': 'application/json',
      'x-signature': expectedSignature,
    });

    expect(serializedBody).toBe(
      JSON.stringify({
        eventId: event.id,
        sourceId: event.sourceId,
        payload: event.body,
        receivedAt: event.receivedAt,
      }),
    );
  });

  it('без source secret не отправляет X-Signature', async () => {
    const { deliveryService, event } = createHarness({
      subscriberUrl: 'http://subscriber.test/deliver',
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(200));

    await deliveryService.deliverWithRetries(event.id);

    const [, requestInit] = fetchSpy.mock.calls[0];

    expect(requestInit?.headers).toEqual({
      'content-type': 'application/json',
    });
  });

  it('использует SUBSCRIBER_URL, если URL не задан у source', async () => {
    const defaultSubscriberUrl = 'http://default.test/from-env';

    const { deliveryService, event } = createHarness({
      defaultSubscriberUrl,
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(200));

    await deliveryService.deliverWithRetries(event.id);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      defaultSubscriberUrl,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('ошибка конфигурации URL является неожиданной и отклоняет promise', async () => {
    const config = new ConfigService({
      API_PORT: '4002',
    });

    const sourcesService = new SourcesService(config);
    const eventsService = new EventsService();

    const source = sourcesService.create({
      name: 'without-subscriber-url',
    });

    const event: StoredEvent = {
      id: 'event-without-url',
      sourceId: source.id,
      headers: {},
      body: {},
      receivedAt: '2026-07-27T15:00:00.000Z',
      delivery: {
        status: 'pending',
        attempts: [],
        lastError: null,
      },
    };

    eventsService.add(event);

    const deliveryService = new DeliveryService(
      eventsService,
      sourcesService,
      config,
    );

    await expect(deliveryService.deliverWithRetries(event.id)).rejects.toThrow(
      'Subscriber URL is not configured',
    );
  });
});
