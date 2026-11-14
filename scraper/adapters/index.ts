// The source registry. One adapter per site. The runner walks this list, so a
// new site joins the sweep by adding one line here and one adapter file.

import { jiji } from './jiji.ts';
import { jumia } from './jumia.ts';
import { solarShopNigeria } from './solarshopnigeria.ts';
import type { SourceAdapter } from './types.ts';

export const ADAPTERS: Record<string, SourceAdapter> = {
  jiji,
  jumia,
  solarshopnigeria: solarShopNigeria,
};

export function adapterFor(site: string): SourceAdapter | null {
  return ADAPTERS[site] ?? null;
}
