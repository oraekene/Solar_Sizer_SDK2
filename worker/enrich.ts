type JsonRecord = Record<string, unknown>;

type ComponentSpec = {
  role: string;
  name: unknown;
  quantity: number;
  specs: Record<string, unknown>;
};

/**
 * Fill the product-level fields and component list that the old Express server
 * added on every catalog read. Without this, products saved without specs lose
 * their hardware breakdown in the UI.
 */
export function enrichCombinationData(product: JsonRecord, combinationData: unknown): JsonRecord | null {
  if (!combinationData || typeof combinationData !== 'object' || Array.isArray(combinationData)) return null;

  const data = combinationData as JsonRecord;
  const kitType =
    (data.kit_type as 'solar' | 'internet' | 'powerstation' | undefined) ??
    ((Number(data.battery_wh ?? 0) > 0 || Number(data.panel_w ?? 0) > 0) ? 'solar' : 'internet');

  const existingSpecs = data.component_specs;
  const componentSpecs =
    Array.isArray(existingSpecs) && existingSpecs.length > 0
      ? existingSpecs
      : kitType === 'solar'
        ? [
            {
              role: 'inverter',
              name: data.inverter,
              quantity: 1,
              specs: {
                watts: data.inverter_w ?? 0,
                price: data.inverter_price ?? 0,
              },
            },
            {
              role: 'battery',
              name: data.battery_config,
              quantity: Number(data.battery_wh ?? 0) > 0 ? 1 : 0,
              specs: {
                usable_wh: data.battery_wh ?? 0,
                price: data.battery_price ?? 0,
              },
            },
            {
              role: 'panel',
              name: data.panel_config,
              quantity: Number(data.panel_w ?? 0) > 0 ? 1 : 0,
              specs: {
                watts: data.panel_w ?? 0,
                price: data.panel_price ?? 0,
              },
            },
          ].filter((component) => component.quantity > 0)
        : kitType === 'powerstation'
          ? [
              {
                role: 'powerstation',
                name: product.name,
                quantity: 1,
                specs: {
                  capacity_wh: data.battery_wh ?? 0,
                  max_output_w: data.inverter_w ?? 0,
                  pv_input_w: data.panel_w ?? 0,
                  price: product.price ?? 0,
                },
              },
            ]
          : [
              {
                role: 'network',
                name: product.name,
                quantity: 1,
                specs: {
                  price: product.price ?? 0,
                  watts: data.inverter_w ?? 0,
                  note: product.description ?? '',
                },
              },
            ];

  return {
    ...data,
    kit_type: kitType,
    product_name: product.name,
    product_description: product.description,
    component_specs: componentSpecs as ComponentSpec[],
  };
}
