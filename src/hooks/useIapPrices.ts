import { useEffect, useState } from 'react';
import { iapService } from '@/services/IapService';

// Subscribes to live RevenueCat-localized prices for the given product IDs.
// Returns a sparse map keyed by productId — components should always render
// `prices[id] ?? fallbackString`. In stub mode (Expo Go / no RC keys) this
// resolves to {} and callers stick with the catalog price.
//
// The key is joined to a string so a freshly-built array prop doesn't trigger
// a re-fetch every render.
export function useIapPrices(ids: string[]): Record<string, string> {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const key = ids.join(',');

  useEffect(() => {
    let cancelled = false;
    void iapService.getPrices(ids).then((p) => {
      if (!cancelled && Object.keys(p).length > 0) setPrices(p);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return prices;
}
