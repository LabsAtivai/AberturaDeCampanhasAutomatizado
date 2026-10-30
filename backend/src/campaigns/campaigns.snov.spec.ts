const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ get: mockGet, post: mockPost }) },
}));

import { CampaignsService } from './campaigns.service';

const tokenResponse = (token: string) => ({ data: { access_token: token } });
const httpError = (status: number, headers: Record<string, string> = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, headers } });

describe('CampaignsService - Snov.io', () => {
  let service: CampaignsService;

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    service = new CampaignsService({ getActiveClients: jest.fn() } as any);
  });

  it('pedidos simultâneos de token da mesma conta fazem uma só chamada', async () => {
    mockPost.mockResolvedValue(tokenResponse('tok'));
    const [a, b] = await Promise.all([
      service.getAccessToken('c1', 's1'),
      service.getAccessToken('c1', 's1'),
    ]);
    expect(a).toBe('tok');
    expect(b).toBe('tok');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('429 bloqueia a conta e as próximas chamadas falham sem ir à rede', async () => {
    mockPost.mockResolvedValue(tokenResponse('tok'));
    const token = await service.getAccessToken('c1', 's1');
    mockGet.mockRejectedValue(httpError(429, { 'retry-after': '120' }));

    await expect(service.getUserCampaigns(token, true)).rejects.toMatchObject({ response: { status: 429 } });
    expect(mockGet).toHaveBeenCalledTimes(1);

    await expect(service.getUserCampaigns(token, true)).rejects.toMatchObject({ response: { status: 429 } });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('401 renova o token uma vez e repete a chamada', async () => {
    mockPost.mockResolvedValueOnce(tokenResponse('old')).mockResolvedValueOnce(tokenResponse('new'));
    const token = await service.getAccessToken('c1', 's1');
    mockGet
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ data: [{ id: 1, campaign: 'A', created_at: 1 }] });

    const campaigns = await service.getUserCampaigns(token, true);

    expect(campaigns).toEqual([{ id: '1', name: 'A', createdAt: 1 }]);
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockGet.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
  });

  it('lista de campanhas é reaproveitada do cache', async () => {
    mockPost.mockResolvedValue(tokenResponse('tok'));
    const token = await service.getAccessToken('c1', 's1');
    mockGet.mockResolvedValue({ data: [{ id: 1, campaign: 'A' }] });

    await service.getUserCampaigns(token);
    await service.getUserCampaigns(token);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
