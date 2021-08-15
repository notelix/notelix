import { Controller, Get } from '@nestjs/common';
import { AuthenticationService } from '../authenticators/authentication.service';

@Controller('meta')
export class MetaController {
  constructor() {}

  @Get('/version')
  async Version(): Promise<any> {
    return { notelix: true };
  }
}
