import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { SourcesModule } from './sources/sources.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SourcesModule],
  controllers: [HealthController],
})
export class AppModule {}
