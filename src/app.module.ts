import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { configRoot } from './core/config/configuration';

@Module({
  imports: [ConfigModule.forRoot(configRoot())],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
