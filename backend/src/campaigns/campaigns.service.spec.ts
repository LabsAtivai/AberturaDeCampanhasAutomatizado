import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsService } from './campaigns.service';
import { CredentialsApiService } from '../shared/credentials-api.service';
import { ConfigModule } from '@nestjs/config';

const mockCredentialsApiService = { getActiveClients: jest.fn() };

describe('CampaignsService', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        CampaignsService,
        { provide: CredentialsApiService, useValue: mockCredentialsApiService },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('parseBrDate', () => {
    it('converte dd/mm/yyyy corretamente', () => {
      const d = (service as any).parseBrDate('15/06/2024');
      expect(d.getFullYear()).toBe(2024);
      expect(d.getMonth()).toBe(5);
      expect(d.getDate()).toBe(15);
    });
  });

  describe('formatDate', () => {
    it('formata data como dd-mm-yyyy', () => {
      const d = new Date(2024, 5, 5);
      expect((service as any).formatDate(d)).toBe('05-06-2024');
    });
  });

  describe('generateCsvBuffer', () => {
    it('gera CSV com BOM e cabeçalho correto', () => {
      const data = [{
        clientEmail: 'test@ativa.ai',
        campaignId: 'campaign-1',
        campaign: 'Campanha A',
        prospectEmail: 'prospect@empresa.com',
        sourcePage: 'https://linkedin.com/in/test',
        visitedAt: '01-06-2024',
      }];
      const buf = service.generateCsvBuffer(data);
      const text = buf.toString('utf-8');
      expect(text.startsWith('\uFEFF')).toBe(true);
      expect(text).toContain('Email do cliente,Campanha');
      expect(text).toContain('Campanha A');
      expect(text).toContain('prospect@empresa.com');
    });

    it('retorna CSV vazio (só cabeçalho) quando sem dados', () => {
      const buf = service.generateCsvBuffer([]);
      const text = buf.toString('utf-8');
      expect(text).toContain('Email do cliente');
      expect(text.split('\n').length).toBe(2); // BOM+header + empty line
    });
  });

  describe('tokenCache', () => {
    it('retorna token do cache quando válido', async () => {
      const cache = (service as any).tokenCache;
      cache.set('clientId123', { token: 'cached-token', expiresAt: Date.now() + 100000 });

      const token = await service.getAccessToken('clientId123', 'secret');
      expect(token).toBe('cached-token');
    });
  });
});
