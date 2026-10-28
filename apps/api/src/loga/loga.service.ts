import { Injectable } from '@nestjs/common';
import {
  LogaClient,
  type LogaCustomer,
  type LogaMemberRef,
  LogaRequestError,
  logaCuid,
} from './loga.types';

/** Live reads are cached briefly so paging back and forth doesn't call LOGA every time. */
const CACHE_TTL_MS = 60_000;

/** LOGA access used by the rest of the API: short read cache + "find or create" linking. */
@Injectable()
export class LogaService {
  private readonly cache = new Map<string, { value: LogaCustomer | null; expires: number }>();

  constructor(private readonly client: LogaClient) {}

  async getCustomer(ref: LogaMemberRef): Promise<LogaCustomer | null> {
    const key = logaCuid(ref);
    if (!key) return null;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const value = await this.client.getCustomer(ref);
    this.cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /**
   * The member's LOGA ID: an existing LOGA member with this phone, otherwise a new one.
   * LOGA refuses to create a phone it already has, so a failed create is checked once more
   * (someone may have registered in LINE at the same moment).
   */
  async findOrCreate(phone: string, name: string): Promise<LogaMemberRef & { created: boolean }> {
    const existing = await this.client.findCustomerByPhone(phone);
    if (existing) return { uid: existing.uid, pcardId: existing.pcardId, created: false };
    try {
      return { ...(await this.client.createCustomer({ phone, name })), created: true };
    } catch (err) {
      if (!(err instanceof LogaRequestError)) throw err;
      const again = await this.client.findCustomerByPhone(phone);
      if (!again) throw err;
      return { uid: again.uid, pcardId: again.pcardId, created: false };
    }
  }

  /** Read many members with at most `concurrency` LOGA calls at a time. */
  async getMany<T extends LogaMemberRef>(
    refs: T[],
    concurrency = 5,
  ): Promise<{ ref: T; customer: LogaCustomer | null; error?: unknown }[]> {
    const results: { ref: T; customer: LogaCustomer | null; error?: unknown }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const ref = refs[next++];
        try {
          results.push({ ref, customer: await this.getCustomer(ref) });
        } catch (error) {
          results.push({ ref, customer: null, error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, refs.length) }, worker));
    return results;
  }
}
