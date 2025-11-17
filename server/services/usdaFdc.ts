// USDA FoodData Central API configuration
const USDA_API_KEY = process.env.USDA_API_KEY || 'wVi6AtDBX0R0Ij0VySFV4mkHb43ZGQ0rhi4D1Xu1';
const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1';

/**
 * Search USDA FDC API for food composition data
 * @param query Search query (product name or keywords)
 * @returns Promise with composition data
 */
export async function searchUSDAFDC(query: string): Promise<any> {
  try {
    console.log("Searching USDA FDC for: " + query);
    
    // First, search for food items
    const searchResponse = await fetch(USDA_API_URL + "/foods/search?query=" + encodeURIComponent(query) + "&api_key=" + USDA_API_KEY);
    
    if (!searchResponse.ok) {
      throw new Error("USDA FDC search failed with status " + searchResponse.status);
    }
    
    const searchData = await searchResponse.json();
    
    if (!searchData || !searchData.foods || searchData.foods.length === 0) {
      return null;
    }
    
    // Get details for the first result
    const foodId = searchData.foods[0].fdcId;
    
    const detailsResponse = await fetch(USDA_API_URL + "/food/" + foodId + "?api_key=" + USDA_API_KEY);
    
    if (!detailsResponse.ok) {
      throw new Error("USDA FDC details failed with status " + detailsResponse.status);
    }
    
    const detailsData = await detailsResponse.json();
    return detailsData;
  } catch (error) {
    console.error("USDA FDC search failed:", error);
    return null;
  }
}

/**
 * Map USDA FDC data to our composition schema
 * @param usdaData Raw USDA data
 * @returns Formatted composition data
 */
export function mapUSDAtoCompositionSchema(usdaData: any): any {
  if (!usdaData) {
    return {
      productCategory: "General/Unspecified",
      netQuantity: 0,
      unitType: "g",
      calories: 0,
      totalFat: 0,
      totalProtein: 0,
      compositionalDetails: []
    };
  }
  
  const result: any = {
    productCategory: usdaData.description || "General/Unspecified",
    netQuantity: 100, // Default serving size (per 100g)
    unitType: "g",
    calories: 0,
    totalFat: 0,
    totalProtein: 0,
    compositionalDetails: []
  };
  
  // Extract nutrients from the foodNutrients array
  if (usdaData.foodNutrients) {
    for (const nutrient of usdaData.foodNutrients) {
      const nutrientName = nutrient.nutrient && nutrient.nutrient.name || '';
      const value = nutrient.amount || 0;
      const unit = nutrient.nutrient && nutrient.nutrient.unitName || '';
      
      // Map specific nutrients to our schema
      if (nutrientName === 'Energy' && unit === 'kcal') {
        result.calories = value;
      } else if (nutrientName === 'Protein') {
        result.totalProtein = value;
      } else if (nutrientName === 'Total lipid (fat)') {
        result.totalFat = value;
      }
      
      // Add all nutrients to compositional details
      result.compositionalDetails.push({
        key: nutrientName,
        value: value + " " + unit
      });
    }
  }
  
  // Add serving size information if available
  if (usdaData.servingSize) {
    result.compositionalDetails.push({
      key: "Serving Size",
      value: usdaData.servingSize + " " + (usdaData.servingSizeUnit || 'g')
    });
  }
  
  return result;
}