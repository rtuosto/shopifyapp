export function formatOptimizationType(optimizationType: string): string {
  const typeMap: Record<string, string> = {
    'title': 'Title Optimization',
    'description': 'Description Optimization',
    'price': 'Price Optimization',
  };

  return typeMap[optimizationType] || `${optimizationType.charAt(0).toUpperCase()}${optimizationType.slice(1)} Optimization`;
}

export function getOptimizationTypeBadges(optimizationType: string): string[] {
  const normalized = optimizationType.toLowerCase().trim();

  if (normalized === 'title and description' || normalized === 'title_description') {
    return ['Title', 'Description'];
  }

  const typeMap: Record<string, string> = {
    'title': 'Title',
    'description': 'Description',
    'price': 'Price',
  };

  return [typeMap[normalized] || optimizationType.charAt(0).toUpperCase() + optimizationType.slice(1)];
}
