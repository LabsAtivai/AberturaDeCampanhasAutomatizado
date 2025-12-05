import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'aberturas-backend'
    };
  }

  @Get()
  getHello() {
    return {
      message: 'API de Aberturas de Campanhas',
      version: '1.0.0',
      endpoints: {
        getEmails: '/api/campaigns/get-emails',
        generateReport: '/api/campaigns (POST)',
        downloadCSV: '/api/campaigns/download',
        testClient: '/api/campaigns/test/:emailSnovio',
        health: '/api/health'
      }
    };
  }
}
