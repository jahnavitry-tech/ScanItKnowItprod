const lower = (s: string) => s.toLowerCase();

const containsAny = (text: string, terms: string[]) =>
  terms.some(t => lower(text).includes(t));

export function detectAllergens(ingredients: string): string[] {
  const t = lower(ingredients);
  const found: string[] = [];
  if (containsAny(t, ['milk', 'dairy', 'lactose', 'casein', 'whey', 'butter', 'cream', 'cheese'])) found.push('🥛 Dairy');
  if (containsAny(t, ['egg', 'albumin', 'lecithin (egg)'])) found.push('🥚 Eggs');
  if (containsAny(t, ['peanut', 'groundnut', 'arachis'])) found.push('🥜 Peanuts');
  if (containsAny(t, ['tree nut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut'])) found.push('🌰 Tree Nuts');
  if (containsAny(t, ['wheat', 'barley', 'rye', 'oat', 'spelt', 'kamut', 'malt', 'gluten'])) found.push('🌾 Gluten');
  if (containsAny(t, ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh'])) found.push('🫘 Soy');
  if (containsAny(t, ['fish', 'cod', 'salmon', 'tuna', 'tilapia', 'bass', 'flounder', 'anchov'])) found.push('🐟 Fish');
  if (containsAny(t, ['shellfish', 'shrimp', 'crab', 'lobster', 'crayfish', 'prawn', 'clam', 'scallop', 'mussel', 'oyster'])) found.push('🦐 Shellfish');
  if (containsAny(t, ['sesame', 'tahini'])) found.push('🌱 Sesame');
  if (containsAny(t, ['sulfite', 'sulphite', 'so2', 'sulfur dioxide'])) found.push('⚗️ Sulfites');
  return found;
}

export function getDietaryTags(ingredients: string, productCategory: string): string[] {
  if (ingredients.length < 20) return [];
  const t = lower(ingredients);
  const tags: string[] = [];

  // Vegan
  const nonVegan = ['milk', 'dairy', 'egg', 'honey', 'gelatin', 'lanolin', 'casein', 'whey', 'beeswax', 'carmine', 'shellac', 'butter', 'cream', 'cheese', 'lactose', 'meat', 'fish', 'chicken', 'beef', 'pork', 'lard', 'tallow'];
  if (!containsAny(t, nonVegan)) tags.push('🌱 Vegan');

  // Gluten-Free
  const glutenTerms = ['wheat', 'barley', 'rye', 'oat', 'spelt', 'kamut', 'malt', 'gluten'];
  if (!containsAny(t, glutenTerms)) tags.push('🌾 Gluten-Free');

  // Organic
  if (t.includes('organic')) tags.push('🌿 Organic');

  // Parabens (cosmetics)
  if (!t.includes('paraben')) {
    const cosmeticKeywords = ['cream', 'lotion', 'serum', 'shampoo', 'conditioner', 'moisturizer', 'cleanser', 'toner', 'gel', 'balm', 'mask', 'exfoliant', 'scrub'];
    if (containsAny(lower(productCategory), cosmeticKeywords) || containsAny(t, cosmeticKeywords)) {
      tags.push('✓ Paraben-Free');
    }
  }

  // Sulfate-Free (cosmetics)
  if (!containsAny(t, ['sulfate', 'sulphate'])) {
    const cosmeticKeywords = ['shampoo', 'conditioner', 'cleanser', 'body wash', 'face wash'];
    if (containsAny(lower(productCategory), cosmeticKeywords) || containsAny(t, cosmeticKeywords)) {
      tags.push('✓ Sulfate-Free');
    }
  }

  return tags;
}
