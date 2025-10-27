import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DeviceToggle, { type DeviceType } from "./DeviceToggle";
import AIInsightsPanel from "./AIInsightsPanel";
import { ArrowLeftRight, CheckCircle2, FileText, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import ProductPreview from "./ProductPreview";
import { sendToPreview, listenToPreview, type PreviewMode, type PreviewMessage, type ApplyVariantPayload, type EditFieldPayload } from "@/lib/preview-messaging";

interface ProductData {
  title: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  images: string[];
  rating?: number;
  reviewCount?: number;
}

interface TestPreviewIframeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testTitle: string;
  productHandle: string;
  shopDomain: string;
  control: ProductData;
  variant: ProductData;
  changes: string[];
  insights: Array<{
    type: "psychology" | "competitor" | "seo" | "data";
    title: string;
    description: string;
  }>;
  onApprove?: (editedVariant?: ProductData) => void;
  onSaveDraft?: (editedVariant?: ProductData) => void;
}

export default function TestPreviewIframe({
  open,
  onOpenChange,
  testTitle,
  productHandle,
  shopDomain,
  control,
  variant,
  changes,
  insights,
  onApprove,
  onSaveDraft,
}: TestPreviewIframeProps) {
  const [device, setDevice] = useState<DeviceType>("desktop");
  const [mode, setMode] = useState<PreviewMode>("control");
  const [editedVariant, setEditedVariant] = useState<ProductData>(variant);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(800);
  const [iframeError, setIframeError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset edited variant when modal opens or variant changes
  useEffect(() => {
    setEditedVariant(variant);
  }, [variant, open]);

  // Reset to control mode when modal opens
  useEffect(() => {
    if (open) {
      setMode("control");
      setIsLoading(true);
      setIframeError(false);
    }
  }, [open]);

  // Detect iframe loading errors (CSP blocks)
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      if (isLoading) {
        // If still loading after 3 seconds, assume CSP block
        setIframeError(true);
        setIsLoading(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [open, isLoading]);

  // Listen for messages from iframe
  useEffect(() => {
    if (!open) return;

    const cleanup = listenToPreview((message: PreviewMessage) => {
      switch (message.type) {
        case 'preview:ready':
          console.log('Preview iframe ready');
          setIsLoading(false);
          // Send initial mode to iframe
          if (iframeRef.current) {
            sendToPreview(iframeRef.current, {
              type: 'preview:apply',
              payload: {
                mode: 'control',
                variantData: {},
                highlights: [],
                editable: false,
              } as ApplyVariantPayload,
            });
          }
          break;

        case 'preview:edit':
          const editPayload = message.payload as EditFieldPayload;
          setEditedVariant(prev => ({
            ...prev,
            [editPayload.field]: editPayload.value
          }));
          break;

        case 'preview:height':
          if (message.payload?.height) {
            setIframeHeight(message.payload.height);
          }
          break;
      }
    });

    return cleanup;
  }, [open]);

  // Send updated variant data when mode or editedVariant changes
  useEffect(() => {
    if (!iframeRef.current || isLoading) return;

    const payload: ApplyVariantPayload = {
      mode,
      variantData: mode === 'variant' ? {
        title: editedVariant.title,
        price: editedVariant.price,
        description: editedVariant.description,
      } : {},
      highlights: mode === 'variant' ? changes : [],
      editable: mode === 'variant',
    };

    sendToPreview(iframeRef.current, {
      type: 'preview:apply',
      payload,
    });
  }, [mode, editedVariant, changes, isLoading]);

  const handleApprove = () => {
    onApprove?.(editedVariant);
    console.log("Test approved:", testTitle);
    onOpenChange(false);
  };

  const handleSaveDraft = () => {
    onSaveDraft?.(editedVariant);
    console.log("Test saved as draft:", testTitle);
    onOpenChange(false);
  };

  const productUrl = `https://${shopDomain}/products/${productHandle}`;

  // Calculate iframe width based on device
  const getIframeWidth = () => {
    switch (device) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      case 'desktop':
      default:
        return '100%';
    }
  };

  const getIframeMaxWidth = () => {
    switch (device) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      case 'desktop':
      default:
        return '1200px';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto" data-testid="modal-test-preview">
        <DialogHeader>
          <DialogTitle className="text-2xl" data-testid="text-preview-title">{testTitle}</DialogTitle>
          <DialogDescription>
            Preview how test changes will appear on your live product page
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <DeviceToggle selected={device} onChange={setDevice} />
            
            <div className="flex items-center gap-2">
              <Button
                variant={mode === "control" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMode("control")}
                className="gap-2"
                data-testid="button-view-control"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Current
              </Button>
              <Button
                variant={mode === "variant" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setMode("variant")}
                data-testid="button-view-variant"
              >
                Proposed
              </Button>
              {mode === "variant" && (
                <Badge variant="outline" className="ml-2">
                  Click highlighted fields to edit
                </Badge>
              )}
            </div>
          </div>

          {/* Preview iframe or fallback */}
          <div className="relative bg-muted rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
            {isLoading && !iframeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading product page...</p>
                </div>
              </div>
            )}

            {iframeError ? (
              <div className="p-6 space-y-4">
                {/* CSP Error Notice */}
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                      Live Preview Unavailable
                    </h4>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Shopify's security settings prevent embedding product pages. Using mock preview instead.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={() => window.open(productUrl, '_blank')}
                      data-testid="button-open-new-tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Live Product Page
                    </Button>
                  </div>
                </div>

                {/* Mock Product Preview Fallback */}
                <div className="flex justify-center">
                  <div style={{ width: getIframeWidth(), maxWidth: getIframeMaxWidth() }}>
                    <ProductPreview
                      product={mode === "variant" ? editedVariant : control}
                      device={device}
                      highlights={mode === "variant" ? changes : []}
                      editable={mode === "variant"}
                      onEdit={(field, value) => {
                        setEditedVariant(prev => ({
                          ...prev,
                          [field]: value
                        }));
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center p-4">
                <iframe
                  ref={iframeRef}
                  src={productUrl}
                  style={{
                    width: getIframeWidth(),
                    maxWidth: getIframeMaxWidth(),
                    height: `${iframeHeight}px`,
                    border: 'none',
                    backgroundColor: 'white',
                  }}
                  title="Product Preview"
                  data-testid="iframe-preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            )}
          </div>

          {/* AI Insights */}
          <AIInsightsPanel insights={insights} />

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-preview"
            >
              Cancel
            </Button>
            <Button 
              variant="secondary"
              onClick={handleSaveDraft}
              className="gap-2"
              data-testid="button-save-draft"
            >
              <FileText className="w-4 h-4" />
              Save as Draft
            </Button>
            <Button 
              onClick={handleApprove}
              className="gap-2"
              data-testid="button-approve-test"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve & Launch Test
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
