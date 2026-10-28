import { LogaService } from './loga.service';
import { LogaUnavailableError } from './loga.types';
import { MOCK_LOGA_DOWN_PHONE, MockLogaClient } from './mock-loga.client';

describe('LogaService (with the mock LOGA)', () => {
  let client: MockLogaClient;
  let service: LogaService;
  beforeEach(() => {
    client = new MockLogaClient(0);
    service = new LogaService(client);
  });

  it('links to an existing LOGA member instead of creating a new one', async () => {
    await expect(service.findOrCreate('0812341234', 'สมชาย ใจดี')).resolves.toEqual({
      uid: '100001',
      pcardId: null,
      created: false,
    });
  });

  it('creates a LOGA member when the phone is new', async () => {
    const ref = await service.findOrCreate('0861112222', 'ลูกค้า ใหม่');
    expect(ref).toMatchObject({ uid: null, created: true });
    expect(ref.pcardId).toMatch(/^\d+$/);
    // Asking again finds the member that was just created.
    await expect(service.findOrCreate('0861112222', 'ลูกค้า ใหม่')).resolves.toMatchObject({
      pcardId: ref.pcardId,
      created: false,
    });
  });

  it('uses the existing member if LOGA refuses the create as a duplicate', async () => {
    const find = jest
      .spyOn(client, 'findCustomerByPhone')
      .mockResolvedValueOnce(null) // someone registers in LINE between our lookup and create
      .mockResolvedValueOnce({
        uid: '999',
        pcardId: null,
        name: null,
        birthday: null,
        level: null,
        points: 0,
      });
    await client.createCustomer({ phone: '0861113333', name: 'x' });

    await expect(service.findOrCreate('0861113333', 'x')).resolves.toEqual({
      uid: '999',
      pcardId: null,
      created: false,
    });
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('passes LOGA outages through', async () => {
    await expect(service.findOrCreate(MOCK_LOGA_DOWN_PHONE, 'x')).rejects.toBeInstanceOf(
      LogaUnavailableError,
    );
  });

  it('caches live reads for a short time', async () => {
    const get = jest.spyOn(client, 'getCustomer');
    const ref = { uid: '100001', pcardId: null };
    expect((await service.getCustomer(ref))?.points).toBe(520);
    await service.getCustomer(ref);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('reads many members, keeping failures per member', async () => {
    jest
      .spyOn(client, 'getCustomer')
      .mockImplementation(async (ref) =>
        ref.uid === 'bad'
          ? Promise.reject(new LogaUnavailableError())
          : { ...ref, name: null, birthday: null, level: null, points: 1 },
      );
    const refs = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      uid: i === 3 ? 'bad' : `u${i}`,
      pcardId: null,
    }));
    const results = await service.getMany(refs, 5);
    expect(results).toHaveLength(12);
    expect(results.find((r) => r.ref.id === '3')?.error).toBeInstanceOf(LogaUnavailableError);
    expect(results.filter((r) => r.customer?.points === 1)).toHaveLength(11);
  });
});
