import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/setup-app';
import { Source } from './../src/sources/entities/source.entity';

interface ErrorBody {
  error: string;
  code: string;
}

/**
 * Тело ответа supertest типизировано как `any`.
 * Единственное приведение типа — здесь; фактическую форму тела
 * всё равно проверяют сами expect'ы.
 */
const body = <T>(res: request.Response): T => res.body as T;

describe('Sources (e2e)', () => {
  let app: NestFastifyApplication;

  const validBody = {
    name: 'GitHub',
    slug: 'github-prod',
    subscriberUrl: 'http://localhost:5001/deliver',
  };

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /sources -> 201, полный объект с id и createdAt', async () => {
    const res = await request(app.getHttpServer())
      .post('/sources')
      .send(validBody)
      .expect(201);

    const created = body<Source>(res);
    expect(created).toMatchObject(validBody);
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('POST /sources -> 400 при невалидном slug, формат { error, code }', async () => {
    const res = await request(app.getHttpServer())
      .post('/sources')
      .send({ name: 'Bad', slug: '--Bad Slug--' })
      .expect(400);

    expect(body<ErrorBody>(res)).toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      error: expect.stringContaining('slug'),
      code: 'VALIDATION_ERROR',
    });
  });

  it('POST /sources: whitelist отрезает лишние поля', async () => {
    const res = await request(app.getHttpServer())
      .post('/sources')
      .send({ name: 'Stripe', slug: 'stripe', hacker: 'field' })
      .expect(201);

    expect(body<Source>(res)).not.toHaveProperty('hacker');
  });

  it('POST /sources -> 409 SLUG_TAKEN при дубле slug', async () => {
    await request(app.getHttpServer())
      .post('/sources')
      .send({ name: 'First', slug: 'dup-slug' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/sources')
      .send({ name: 'Second', slug: 'dup-slug' })
      .expect(409);

    expect(body<ErrorBody>(res).code).toBe('SLUG_TAKEN');
  });

  it('GET /sources -> 200, массив содержит созданные источники', async () => {
    const res = await request(app.getHttpServer()).get('/sources').expect(200);

    const list = body<Source[]>(res);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('полный цикл: create -> get -> patch -> delete -> 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/sources')
      .send({ name: 'Lifecycle', slug: 'lifecycle' })
      .expect(201);
    const { id } = body<Source>(created);

    await request(app.getHttpServer()).get(`/sources/${id}`).expect(200);

    const patched = await request(app.getHttpServer())
      .patch(`/sources/${id}`)
      .send({ name: 'Renamed' })
      .expect(200);

    const patchedSource = body<Source>(patched);
    expect(patchedSource.name).toBe('Renamed');
    expect(patchedSource.slug).toBe('lifecycle'); // slug не тронут

    await request(app.getHttpServer()).delete(`/sources/${id}`).expect(204);

    const res = await request(app.getHttpServer())
      .get(`/sources/${id}`)
      .expect(404);
    expect(body<ErrorBody>(res).code).toBe('NOT_FOUND');
  });

  it('PATCH с тем же slug -> 200, а не 409 (не конфликтует сам с собой)', async () => {
    const created = await request(app.getHttpServer())
      .post('/sources')
      .send({ name: 'Self', slug: 'self-slug' })
      .expect(201);
    const { id } = body<Source>(created);

    await request(app.getHttpServer())
      .patch(`/sources/${id}`)
      .send({ slug: 'self-slug', name: 'Self Updated' })
      .expect(200);
  });

  it('GET /sources/:id с не-uuid -> 400 (ParseUUIDPipe)', async () => {
    const res = await request(app.getHttpServer())
      .get('/sources/not-a-uuid')
      .expect(400);

    expect(body<ErrorBody>(res).code).toBe('VALIDATION_ERROR');
  });

  it('DELETE несуществующего uuid -> 404', () =>
    request(app.getHttpServer())
      .delete('/sources/3f2a8c1e-5b0d-4f7a-9c3e-1d2b4a5c6e7f')
      .expect(404));
});
