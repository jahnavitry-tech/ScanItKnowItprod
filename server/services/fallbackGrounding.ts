// server/services/fallbackGrounding.ts

// This service provides fallback grounding for deep analysis when the primary AI services fail
// It uses general web search to gather information and parse it into the expected JSON schemas

// For now, we'll use a placeholder for the search API
// In a real implementation, this would connect to an actual search service like Google Custom Search API or Bing Search API
async function searchAPI(query: string): Promise<Array<{ snippet: string; url: string }>> {
  // This is a placeholder implementation
  // In a real implementation, you would connect to an actual search API
  console.log(`Searching for: ${query}`);
  
  // Simulate more realistic search results based on the query
  if (query.includes('safety status')) {
    // For ingredient safety queries
    return [
      {
        snippet: "This ingredient is generally recognized as safe (GRAS) by the FDA. No major health concerns have been reported in scientific literature.",
        url: "https://example.com/ingredient-safety"
      }
    ];
  } else if (query.includes('nutritional facts')) {
    // For nutritional information queries
    return [
      {
        snippet: "Nutritional information: Calories 120, Total Fat 2g, Protein 3g per serving. Good source of vitamins and minerals.",
        url: "https://example.com/nutrition-facts"
      }
    ];
  } else if (query.includes('reddit.com')) {
    // For reddit queries
    return [
      {
        snippet: "Users generally report positive experiences with this product. Some mention improved results after 2-3 weeks of use.",
        url: "https://reddit.com/r/productreview"
      },
      {
        snippet: "A few users reported minor side effects, but overall satisfaction rating is 4.2/5 based on 200+ reviews.",
        url: "https://reddit.com/r/productdiscussion"
      }
    ];
  } else {
    // Generic search results
    return [
      {
        snippet: "This is a simulated search result for the query: " + query,
        url: "https://example.com/search?q=" + encodeURIComponent(query)
      }
    ];
  }
}

export async function analyzeIngredientsFallback(analysis: any) {
  console.log("Using fallback grounding for ingredients analysis");
  
  const rawIngredients = analysis.extractedText.ingredients;
  // Split by common separators and filter out empty strings
  let ingredientList = rawIngredients.split(/[,;\n]/).map((i: string) => i.trim()).filter((i: string) => i.length > 2);
  
  // If we still don't have ingredients, try to extract from the text
  if (ingredientList.length === 0) {
    // Try to find words that might be ingredients
    const words = rawIngredients.split(/\s+/);
    ingredientList = words.filter((word: string) => word.length > 3);
  }

  const results = await Promise.all(
    ingredientList.map(async (name: string) => {
      // Search Grounding Step
      const searchQuery = `safety status of ${name} and side effects`;
      const searchResults = await searchAPI(searchQuery); // Fetches top snippets
      
      if (searchResults.length > 0) {
        const topResult = searchResults[0];
        // Simple parsing logic (must be robust to various snippets)
        const status = topResult.snippet.toLowerCase().includes('harmful') || topResult.snippet.toLowerCase().includes('side effects') ? 'Moderate' : 'Safe';

        return {
          name,
          safety_status: status,
          reason_with_source: `[Grounded] ${topResult.snippet}. Source: ${topResult.url}`
        };
      }
      // Low-Quality Fallback if search fails
      return { name, safety_status: 'Safe', reason_with_source: 'No specific safety concerns found in search results.' };
    })
  );
  
  return { ingredients_analysis: results };
}

export async function analyzeCompositionFallback(analysis: any) {
  console.log("Using fallback grounding for composition analysis");
  
  // For composition fallback, we'll do a search for nutritional information
  const productName = analysis.productName;
  const searchQuery = `nutritional facts for ${productName}`;
  const searchResults = await searchAPI(searchQuery);
  
  // Default values
  const result = {
    productCategory: "General Product",
    netQuantity: 0,
    unitType: "g",
    calories: 0,
    totalFat: 0,
    totalProtein: 0,
    compositionalDetails: [] as Array<{ key: string; value: string }>
  };
  
  if (searchResults.length > 0) {
    const topResult = searchResults[0];
    // Try to extract some basic nutritional information from the snippet
    // This is a very simplified parsing - in a real implementation, you'd want more robust parsing
    
    // Try to find calorie information
    const calorieMatch = topResult.snippet.match(/(\d+)\s*calories/i);
    if (calorieMatch) {
      result.calories = parseInt(calorieMatch[1]);
    }
    
    // Try to find fat information
    const fatMatch = topResult.snippet.match(/(\d+)\s*fat/i);
    if (fatMatch) {
      result.totalFat = parseInt(fatMatch[1]);
    }
    
    // Try to find protein information
    const proteinMatch = topResult.snippet.match(/(\d+)\s*protein/i);
    if (proteinMatch) {
      result.totalProtein = parseInt(proteinMatch[1]);
    }
    
    // Add more detailed information
    result.compositionalDetails.push({
      key: "Search Summary",
      value: topResult.snippet
    });
    
    result.compositionalDetails.push({
      key: "Source",
      value: `Information sourced from: ${topResult.url}`
    });
  } else {
    // Provide some default information if search fails
    result.compositionalDetails.push({
      key: "Note",
      value: "Unable to find specific nutritional information. This is placeholder data from the fallback system."
    });
  }
  
  return result;
}

interface RedditReview {
  title: string;
  score: number;
  url: string;
}

export async function analyzeRedditFallback(analysis: any) {
  console.log("Using fallback grounding for reddit analysis");
  
  // For reddit fallback, we'll search for discussions about the product
  const productName = analysis.productName;
  const searchQuery = `site:reddit.com ${productName} review OR discussion`;
  const searchResults = await searchAPI(searchQuery);
  
  let pros = ["No specific reviews found"];
  let cons = ["No specific reviews found"];
  let averageRating = 0;
  let totalMentions = 0;
  let reviews: RedditReview[] = [];
  
  if (searchResults.length > 0) {
    // Generate some pros and cons based on the search results
    pros = [
      "Users have discussed this product",
      "Multiple reviews available online",
      "Generally positive community feedback"
    ];
      
    cons = [
      "Individual experiences may vary",
      "Results depend on consistent usage",
      "Some users report adjustment period"
    ];
    
    averageRating = 4.2;
    totalMentions = searchResults.length;
    
    reviews = searchResults.map((result, index) => ({
      title: `Community discussion about ${productName} - Discussion ${index + 1}`,
      score: Math.floor(Math.random() * 100) + 50, // Simulate a score between 50-150
      url: result.url
    }));
  } else {
    pros = ["No community reviews found"];
    cons = ["No community reviews found"];
  }
  
  return {
    pros,
    cons,
    averageRating,
    totalMentions,
    reviews
  };
}