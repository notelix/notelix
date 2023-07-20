import {Controller, Get} from '@nestjs/common';

@Controller('meta')
export class MetaController {
    constructor() {
    }

    @Get('/version')
    async Version(): Promise<any> {
        return {notelix: true};
    }
}
