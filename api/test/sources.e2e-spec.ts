import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/setup-app';
import { SourceResponseDto } from './../src/sources/dto/source-response.dto';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';

interface ErrorBody {
  error: string;
  code: string;
}

const body = <T>(res: request.Response): T => res.body as T;

describe('Sources (e2e)', () => {
  let app: NestFastifyApplication;

  const specBody = {
    name: 'payments',
    secret: 's3cret',
    subscriberUrl: 'http://localhost:5001/deliver',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useClass(InMemoryStorageService)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    setupApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/sources (тело из ТЗ) -> 201: ingestUrl, hasSecret, БЕЗ secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sources')
      .send(specBody)
      .expect(201);

    const created = body<SourceResponseDto>(res);
    expect(created.id).toEqual(expect.any(String));
    expect(created.name).toBe('payments');
    expect(created.hasSecret).toBe(true);
    expect(created.ingestUrl).toContain(`/webhooks/${created.id}`);
    expect(created.subscriberUrl).toBe('http://localhost:5001/deliver');
    expect(created.createdAt).toEqual(expect.any(String));
    expect(created).not.toHaveProperty('secret'); // секрет не течёт наружу
  });

  it('POST /api/sources без secret -> hasSecret: false', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'no-secret' })
      .expect(201);

    expect(body<SourceResponseDto>(res).hasSecret).toBe(false);
  });

  it('POST /api/sources: пустое name -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: '' })
      .expect(400);

    expect(body<ErrorBody>(res).code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/sources: name из 65 символов -> 400', () =>
    request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'a'.repeat(65) })
      .expect(400));

  it('POST /api/sources: невалидный subscriberUrl -> 400', () =>
    request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'bad-url', subscriberUrl: 'not a url' })
      .expect(400));

  it('POST /api/sources: whitelist отрезает лишние поля', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'extra', hacker: 'field' })
      .expect(201);

    expect(body<SourceResponseDto>(res)).not.toHaveProperty('hacker');
  });

  it('GET /api/sources -> 200, массив с созданными источниками', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sources')
      .expect(200);

    const list = body<SourceResponseDto[]>(res);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.every((s) => !('secret' in s))).toBe(true); // и в списке не течёт
  });

  it('GET /api/sources/:id -> 200 для существующего', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/sources')
      .send({ name: 'findable' })
      .expect(201);
    const { id } = body<SourceResponseDto>(created);

    const res = await request(app.getHttpServer())
      .get(`/api/sources/${id}`)
      .expect(200);
    expect(body<SourceResponseDto>(res).id).toBe(id);
  });

  it('GET /api/sources/:id: неизвестный uuid -> 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sources/3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f')
      .expect(404);

    expect(body<ErrorBody>(res).code).toBe('NOT_FOUND');
  });

  it('GET /api/sources/:id: не-uuid -> 400 (ParseUUIDPipe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sources/not-a-uuid')
      .expect(400);

    expect(body<ErrorBody>(res).code).toBe('VALIDATION_ERROR');
  });
});
