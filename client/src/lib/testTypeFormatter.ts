/**
 * Format test type for display
 * Converts internal test type names to user-friendly labels
 * 
 * @param testType - The internal test type (e.g., "title", "description", "price")
 * @returns Formatted label (e.g., "Title Optimization", "Description Optimization")
 */
export function formatTestType(testType: string): string {
  const typeMap: Record<string, string> = {
    'title': 'Title Optimization',
    'description': 'Description Optimization',
    'price': 'Price Optimization',
  };

  return typeMap[testType] || `${testType.charAt(0).toUpperCase()}${testType.slice(1)} Test`;
}
