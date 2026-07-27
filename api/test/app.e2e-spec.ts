import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/setup-app';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';

describe('App (e2e)', () => {
  let app: NestFastifyApplication;

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
    await app.getHttpAdapter().getInstance().ready(); // грабля Fastify!
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health -> 200 { status: ok }', () =>
    request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' }));

  it('GET /unknown -> 404 в формате { error, code }', async () => {
    const res = await request(app.getHttpServer()).get('/unknown').expect(404);
    expect(res.body).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      error: expect.any(String),
      code: 'NOT_FOUND',
    });
  });
});
