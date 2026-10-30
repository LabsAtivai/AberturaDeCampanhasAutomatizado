const mockGet = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ get: mockGet }) },
}));

import { CredentialsApiService } from './credentials-api.service';

const config = { get: (k: string) => (k === 'CREDENTIALS_API_URL' ? 'http://api' : 'key') } as any;

const account = (id: string, updated_at = 't1') => ({ id, email: `${id}@x.com`, updated_at });
const credentialsCalls = () => mockGet.mock.calls.filter(([u]) => u.includes('/credentials')).length;

// Simula a API: lista ACTIVE paginada (com `visible` controlando o que a paginação entrega),
// busca por q= sobre todas as contas e credenciais por id.
function mockApi(all: any[], visible: any[] = all, inactive: any[] = []) {
  mockGet.mockImplementation(async (url: string, opts: any = {}) => {
    if (url === '/api/accounts') {
      const { status, q } = opts.params;
      if (status === 'INACTIVE') return { data: { items: inactive, total: inactive.length } };
      if (q) {
        const items = all.filter((a) => a.email.includes(q));
        return { data: { items, total: items.length } };
      }
      return { data: { items: visible, total: all.length } };
    }
    const id = url.split('/')[4];
    return { data: { snov_id: `id-${id}`, snov_secret: 's', snov_email: `snov-${id}@x.com` } };
  });
}

// Desliga o varrimento em segundo plano (liga só no teste dedicado).
const newService = (crawl = false) => {
  const service: any = new CredentialsApiService(config);
  if (!crawl) service.lastCrawlAt = Date.now();
  service.crawlDelayMs = 0;
  return service as CredentialsApiService;
};

describe('CredentialsApiService', () => {
  beforeEach(() => mockGet.mockReset());

  it('cliente novo aparece no refresh e só ele busca credenciais', async () => {
    const service = newService();
    mockApi([account('a'), account('b')]);
    expect(await service.getActiveClients(true)).toHaveLength(2);
    expect(credentialsCalls()).toBe(2);

    mockApi([account('a'), account('b'), account('c')]);
    const clients = await service.getActiveClients(true);
    expect(clients.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
    expect(credentialsCalls()).toBe(3);
  });

  it('conta desativada sai da lista', async () => {
    const service = newService();
    mockApi([account('a'), account('b')]);
    await service.getActiveClients(true);
    mockApi([account('a')], [account('a')], [account('b')]);
    expect((await service.getActiveClients(true)).map((c) => c.id)).toEqual(['a']);
  });

  it('paginação repetida não duplica contas', async () => {
    const service = newService();
    const a = account('a');
    mockApi([a, account('b')], [a, a, a, account('b')]);
    expect((await service.getActiveClients(true)).map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('searchAccounts encontra conta que a paginação não entrega', async () => {
    const service = newService();
    const hidden = { id: 'blues', email: 'bluesfilmes.ativa@gmail.com', updated_at: 't1' };
    mockApi([account('a'), hidden], [account('a')]);

    expect((await service.getActiveClients(true)).map((c) => c.id)).toEqual(['a']);

    const found = await service.searchAccounts('blues');
    expect(found.map((c) => c.id).sort()).toEqual(['a', 'blues']);
    expect((await service.getActiveClients()).map((c) => c.id)).toContain('blues');
  });

  it('busca com menos de 3 caracteres não consulta a API', async () => {
    const service = newService();
    expect(await service.searchAccounts('bl')).toEqual([]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('varrimento em segundo plano descobre contas que a paginação pula', async () => {
    const service = newService(true);
    const hidden = { id: 'blues', email: 'bluesfilmes.ativa@gmail.com', updated_at: 't1' };
    mockApi([account('a'), hidden], [account('a')]);

    await service.getActiveClients(true);
    await new Promise((r) => setTimeout(r, 100));

    expect((await service.getActiveClients(true)).map((c) => c.id).sort()).toEqual(['a', 'blues']);
  });
});
