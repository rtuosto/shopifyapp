import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import type { DeviceType } from "./DeviceToggle";

interface ProductData {
  title: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  images: string[];
  rating?: number;
  reviewCount?: number;
}

interface ProductPreviewProps {
  product: ProductData;
  device: DeviceType;
  isVariant?: boolean;
  highlights?: string[];
}

export default function ProductPreview({ 
  product, 
  device, 
  isVariant = false,
  highlights = []
}: ProductPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const [imageRetryKey, setImageRetryKey] = useState(0);

  // Reset error state whenever product data changes
  // Depends on product object reference to trigger on refetches (even if values are identical)
  // This allows recovery from transient CDN failures
  useEffect(() => {
    setImageError(false);
    setImageRetryKey(prev => prev + 1);
  }, [product]);

  const getDeviceWidth = () => {
    switch (device) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      default:
        return "100%";
    }
  };

  const isHighlighted = (field: string) => highlights.includes(field);
  
  const hasValidImage = product.images && product.images.length > 0 && product.images[0] && !imageError;

  return (
    <div 
      className="bg-background border rounded-lg overflow-hidden"
      style={{ width: getDeviceWidth(), maxWidth: "100%" }}
      data-testid={`preview-${isVariant ? 'variant' : 'control'}`}
    >
      <div className="aspect-square bg-muted relative">
        {hasValidImage ? (
          <img 
            key={`img-${imageRetryKey}`}
            src={product.images[0]} 
            alt={product.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            data-testid="img-product"
          />
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center text-muted-foreground"
            data-testid="placeholder-no-image"
          >
            <span>No Image</span>
          </div>
        )}
        {product.compareAtPrice && (
          <Badge className="absolute top-3 right-3 bg-destructive text-destructive-foreground">
            Sale
          </Badge>
        )}
      </div>
      
      <div className="p-4 space-y-3">
        <div className={`space-y-1 ${isHighlighted('title') ? 'bg-yellow-100 dark:bg-yellow-900/20 -m-2 p-2 rounded-md border-2 border-yellow-400' : ''}`}>
          <h3 className="font-semibold text-lg leading-tight" data-testid="text-product-title">
            {product.title}
          </h3>
          {product.rating && (
            <div className="flex items-center gap-1 text-sm">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-4 h-4 ${i < Math.floor(product.rating!) ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`}
                  />
                ))}
              </div>
              <span className="text-muted-foreground">({product.reviewCount})</span>
            </div>
          )}
        </div>

        <div className={`flex items-baseline gap-2 ${isHighlighted('price') ? 'bg-yellow-100 dark:bg-yellow-900/20 -m-2 p-2 rounded-md border-2 border-yellow-400' : ''}`}>
          <span className="text-2xl font-bold" data-testid="text-product-price">
            ${product.price.toFixed(2)}
          </span>
          {product.compareAtPrice && (
            <span className="text-muted-foreground line-through text-sm">
              ${product.compareAtPrice.toFixed(2)}
            </span>
          )}
        </div>

        <div className={`text-sm text-foreground space-y-2 ${isHighlighted('description') ? 'bg-yellow-100 dark:bg-yellow-900/20 -m-2 p-2 rounded-md border-2 border-yellow-400' : ''}`}>
          <p className="leading-relaxed" data-testid="text-product-description">
            {product.description}
          </p>
        </div>

        <button 
          className="w-full bg-primary text-primary-foreground py-3 rounded-md font-medium hover-elevate active-elevate-2"
          onClick={(e) => {
            e.preventDefault();
            console.log('Add to cart clicked (preview only)');
          }}
          data-testid="button-add-to-cart"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}