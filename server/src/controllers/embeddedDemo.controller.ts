import { Controller, Get, Header } from '@nestjs/common';
import { readEmbeddedDemoStaticToken } from '../embeddedDemo';
import { randomBytes } from 'node:crypto';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('embedded')
export class EmbeddedDemoController {
  private readonly staticToken = readEmbeddedDemoStaticToken();

  @Get('/demo-session.js')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Pragma', 'no-cache')
  @SkipThrottle()
  Session(): string {
    const staticToken = this.staticToken || randomBytes(32).toString('hex');
    return `window.NotelixEmbeddedConfig = Object.freeze({
      server: window.location.origin,
      staticToken: ${JSON.stringify(staticToken)},
      rootElementClassName: "notelix-enabled",
      demoLocalOnly: ${this.staticToken ? 'false' : 'true'},
      language: "en",
      theme: "light"
    });`;
  }
}
