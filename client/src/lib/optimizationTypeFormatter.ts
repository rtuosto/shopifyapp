/**
 * Format optimization type for display
 * Converts internal optimization type names to user-friendly labels
 * 
 * @param optimizationType - The internal optimization type (e.g., "title", "description", "price")
 * @returns Formatted label (e.g., "Title Optimization", "Description Optimization")
 */
export function formatOptimizationType(optimizationType: string): string {
  const typeMap: Record<string, string> = {
    'title': 'Title Optimization',
    'description': 'Description Optimization',
    'price': 'Price Optimization',
  };

  return typeMap[optimizationType] || `${optimizationType.charAt(0).toUpperCase()}${optimizationType.slice(1)} Optimization`;
}
