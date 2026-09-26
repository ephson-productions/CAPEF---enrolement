import { describe, expect, it } from "vitest";
import { validateActivityLineItem } from "../routes/members";

const singleProduction = {
  superficieHa: 0,
  productionQuantity: 0,
  productionUnit: "kg",
  productionFcfa: 0,
};

const products = [
  { name: "Lait", quantity: 0, unit: "L", fcfa: 0 },
];

describe("activity line-item validation", () => {
  it.each(["agriculteur", "pecheur", "artisan"])(
    "accepts zero for every mandatory numeric field (%s)",
    (activityType) => {
      expect(validateActivityLineItem(activityType, singleProduction)).toEqual([]);
    },
  );

  it.each(["eleveur", "forestier"])(
    "accepts zero-valued product rows and requires the products array (%s)",
    (activityType) => {
      expect(validateActivityLineItem(activityType, {
        superficieHa: 0,
        products,
        productionFcfa: 0,
      })).toEqual([]);

      expect(validateActivityLineItem(activityType, {
        superficieHa: 0,
        products: [],
      })).toEqual(expect.arrayContaining([
        { field: "products", code: "min_one_product_required" },
      ]));
    },
  );

  it("rejects missing, non-finite, and negative numeric values", () => {
    const errors = validateActivityLineItem("agriculteur", {
      superficieHa: -1,
      productionQuantity: Number.NaN,
      productionUnit: "kg",
      productionFcfa: Number.POSITIVE_INFINITY,
    });

    expect(errors).toEqual(expect.arrayContaining([
      { field: "superficieHa", code: "negative" },
      { field: "productionQuantity", code: "invalid_quantity" },
      { field: "productionFcfa", code: "invalid_fcfa" },
    ]));
  });

  it("rejects malformed product rows with field-level errors", () => {
    const errors = validateActivityLineItem("forestier", {
      superficieHa: 1,
      products: [{ name: "", quantity: -1, unit: "", fcfa: -10 }],
    });

    expect(errors).toEqual(expect.arrayContaining([
      { field: "products.0.name", code: "required_and_max_100" },
      { field: "products.0.quantity", code: "invalid_quantity" },
      { field: "products.0.unit", code: "required_unit" },
      { field: "products.0.fcfa", code: "invalid_fcfa" },
    ]));
  });
});