import { Product } from "@shared/schema";

/**
 * Product scoring for intelligent recommendation generation
 * Combines profit potential, sales performance, and optimization gaps
 */

interface ProductScore {
  product: Product;
  score: number;
  breakdown: {
    profitScore: number;
    salesScore: number;
    gapScore: number;
    priceScore: number;
  };
}

/**
 * Calculate profit score based on margin and absolute profit
 * Higher score for products with good margins and profit potential
 */
function calculateProfitScore(product: Product): number {
  const price = parseFloat(product.price);
  const margin = product.margin ? parseFloat(product.margin) : null;
  const cost = product.cost ? parseFloat(product.cost) : null;

  // No cost data = use price as proxy (50% assumed margin)
  if (!margin || !cost) {
    return price * 0.5; // Assume 50% margin
  }

  // Calculate absolute profit per unit
  const profit = price - cost;
  
  // Weight by margin percentage (higher margins = better)
  const marginMultiplier = Math.min(margin / 50, 2); // Cap at 2x for 50%+ margins
  
  return profit * marginMultiplier;
}

/**
 * Calculate sales score based on recent revenue and velocity
 * Higher score for products with recent sales activity
 */
function calculateSalesScore(product: Product): number {
  const revenue30d = product.revenue30d ? parseFloat(product.revenue30d) : 0;
  const totalSold = product.totalSold || 0;
  const lastSale = product.lastSaleDate ? new Date(product.lastSaleDate) : null;

  let score = revenue30d; // Base score on recent revenue

  // Boost for active products (sold in last 7 days)
  if (lastSale) {
    const daysSinceLastSale = (Date.now() - lastSale.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastSale < 7) {
      score *= 1.5; // 50% boost for recently sold
    } else if (daysSinceLastSale < 30) {
      score *= 1.2; // 20% boost for sold this month
    }
  }

  // Slight boost for total volume (indicates product importance)
  score += Math.sqrt(totalSold) * 0.1;

  return score;
}

/**
 * Calculate optimization gap score
 * Higher score for products with clear improvement opportunities
 */
function calculateGapScore(product: Product): number {
  let gapScore = 0;

  // Missing or weak description (major gap)
  if (!product.description || product.description.length < 100) {
    gapScore += 50;
  }

  // Short title (potential optimization)
  if (product.title.length < 30) {
    gapScore += 20;
  }

  // Many variants but no compareAtPrice (price testing opportunity)
  if (product.variants && product.variants.length > 5 && !product.compareAtPrice) {
    gapScore += 30;
  }

  // No images or few images
  if (!product.images || product.images.length < 2) {
    gapScore += 15;
  }

  return gapScore;
}

/**
 * Calculate price positioning score
 * Higher score for premium products (more revenue impact potential)
 */
function calculatePriceScore(product: Product, products: Product[]): number {
  const price = parseFloat(product.price);
  
  // Calculate price percentile within catalog
  const prices = products.map(p => parseFloat(p.price)).sort((a, b) => a - b);
  const percentile = prices.filter(p => p <= price).length / prices.length;
  
  // Higher score for products in top 30% by price
  if (percentile > 0.7) {
    return price * 1.5; // Premium products get boost
  } else if (percentile > 0.5) {
    return price;
  } else {
    return price * 0.5; // Lower priority for cheap products
  }
}

/**
 * Score a single product across all dimensions
 */
export function scoreProduct(product: Product, allProducts: Product[]): ProductScore {
  const profitScore = calculateProfitScore(product);
  const salesScore = calculateSalesScore(product);
  const gapScore = calculateGapScore(product);
  const priceScore = calculatePriceScore(product, allProducts);

  // Weighted combination
  // Profit (40%) + Sales (30%) + Gaps (20%) + Price (10%)
  const score = 
    (profitScore * 0.4) +
    (salesScore * 0.3) +
    (gapScore * 0.2) +
    (priceScore * 0.1);

  return {
    product,
    score,
    breakdown: {
      profitScore,
      salesScore,
      gapScore,
      priceScore,
    },
  };
}

/**
 * Select top N products for AI recommendation generation
 * Excludes products that already have active tests
 */
export function selectTopProducts(
  products: Product[],
  activeProductIds: string[],
  limit: number = 25
): ProductScore[] {
  // Filter out products with active tests
  const eligibleProducts = products.filter(p => !activeProductIds.includes(p.id));

  // Score all eligible products
  const scored = eligibleProducts.map(p => scoreProduct(p, products));

  // Sort by score descending and take top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get products that need optimization (high potential, low performance)
 * These are "hidden gems" - high value but underperforming
 */
export function getHiddenGems(products: Product[], limit: number = 10): ProductScore[] {
  const scored = products.map(p => scoreProduct(p, products));

  // Hidden gems = high profit potential but low sales
  return scored
    .filter(s => s.breakdown.profitScore > 10 && s.breakdown.salesScore < 50)
    .sort((a, b) => b.breakdown.profitScore - a.breakdown.profitScore)
    .slice(0, limit);
}

/**
 * Get top revenue generators that could be optimized further
 */
export function getTopPerformers(products: Product[], limit: number = 10): ProductScore[] {
  const scored = products.map(p => scoreProduct(p, products));

  // Top performers = high sales with optimization gaps
  return scored
    .filter(s => s.breakdown.salesScore > 100 && s.breakdown.gapScore > 20)
    .sort((a, b) => b.breakdown.salesScore - a.breakdown.salesScore)
    .slice(0, limit);
}
