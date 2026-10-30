const mockGet = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ get: mockGet }) },
}));

import { CredentialsApiService } from './credentials-api.service';

const config = { get: (k: string) => (k === 'CREDENTIALS_API_URL' ? 'http://api' : 'key') } as any;

const account = (id: string, updated_at = 't1') => ({ id, email: `${id}@x.com`, updated_at });

function mockApi(accounts: any[]) {
  mockGet.mockImplementation(async (url: string) => {
    if (url === '/api/accounts') return { data: { items: accounts, total: accounts.length } };
    const id = url.split('/')[4];
    return { data: { snov_id: `id-${id}`, snov_secret: 's', snov_email: `snov-${id}@x.com` } };
  });
}

describe('CredentialsApiService', () => {
  beforeEach(() => mockGet.mockReset());

  it('cliente novo aparece no refresh e só ele busca credenciais', async () => {
    const service = new CredentialsApiService(config);
    mockApi([account('a'), account('b')]);
    expect(await service.getActiveClients(true)).toHaveLength(2);
    const credCalls = () => mockGet.mock.calls.filter(([u]) => u.includes('/credentials')).length;
    expect(credCalls()).toBe(2);

    mockApi([account('a'), account('b'), account('c')]);
    const clients = await service.getActiveClients(true);
    expect(clients.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(credCalls()).toBe(3);
  });

  it('conta removida da lista sai do resultado', async () => {
    const service = new CredentialsApiService(config);
    mockApi([account('a'), account('b')]);
    await service.getActiveClients(true);
    mockApi([account('a')]);
    expect((await service.getActiveClients(true)).map((c) => c.id)).toEqual(['a']);
  });
});
