import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ReadinessService } from '../services/readiness';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('meta')
export class MetaController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get('/version')
  async Version(): Promise<any> {
    return { notelix: true };
  }

  @Get('/health')
  @SkipThrottle()
  Health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('/ready')
  async Ready() {
    const checks = await this.readinessService.check();
    const response = {
      status:
        checks.postgres === 'up' && checks.meilisearch === 'up'
          ? 'ok'
          : 'unavailable',
      checks,
    };

    if (response.status !== 'ok') {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }
}
