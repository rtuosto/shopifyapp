import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DeviceToggle, { type DeviceType } from "./DeviceToggle";
import ProductPreview from "./ProductPreview";
import AIInsightsPanel from "./AIInsightsPanel";
import { ArrowLeftRight, CheckCircle2, FileText } from "lucide-react";

interface ProductData {
  title: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  images: string[];
  rating?: number;
  reviewCount?: number;
}

interface TestPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testTitle: string;
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

export default function TestPreviewModal({
  open,
  onOpenChange,
  testTitle,
  control,
  variant,
  changes,
  insights,
  onApprove,
  onSaveDraft,
}: TestPreviewModalProps) {
  const [device, setDevice] = useState<DeviceType>("desktop");
  const [viewMode, setViewMode] = useState<"side-by-side" | "single">("side-by-side");
  const [editedVariant, setEditedVariant] = useState<ProductData>(variant);

  // Reset edited variant when modal opens or variant changes
  useEffect(() => {
    setEditedVariant(variant);
  }, [variant, open]);

  const handleFieldEdit = (field: keyof ProductData, value: string | number) => {
    setEditedVariant(prev => ({
      ...prev,
      [field]: value
    }));
  };

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" data-testid="modal-test-preview">
        <DialogHeader>
          <DialogTitle className="text-2xl" data-testid="text-preview-title">{testTitle}</DialogTitle>
          <DialogDescription>
            Compare control vs. variant to see exactly what will change
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <DeviceToggle selected={device} onChange={setDevice} />
            
            <div className="flex gap-2">
              <Button
                variant={viewMode === "side-by-side" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("side-by-side")}
                className="gap-2"
                data-testid="button-view-side-by-side"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Side by Side
              </Button>
              <Button
                variant={viewMode === "single" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("single")}
                data-testid="button-view-single"
              >
                Tabbed
              </Button>
            </div>
          </div>

          {viewMode === "side-by-side" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-muted-foreground" data-testid="text-control-label">
                    CONTROL (Current)
                  </h4>
                </div>
                <div className="flex justify-center">
                  <ProductPreview 
                    product={control} 
                    device={device}
                    isVariant={false}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-primary" data-testid="text-variant-label">
                    VARIANT (Proposed) — Click highlighted changes to edit
                  </h4>
                </div>
                <div className="flex justify-center">
                  <ProductPreview 
                    product={editedVariant} 
                    device={device}
                    isVariant={true}
                    highlights={changes}
                    editable={true}
                    onFieldEdit={handleFieldEdit}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="control" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="control" data-testid="tab-control">
                  Control (Current)
                </TabsTrigger>
                <TabsTrigger value="variant" data-testid="tab-variant">
                  Variant (Proposed)
                </TabsTrigger>
              </TabsList>
              <TabsContent value="control" className="flex justify-center py-4">
                <ProductPreview 
                  product={control} 
                  device={device}
                  isVariant={false}
                />
              </TabsContent>
              <TabsContent value="variant" className="flex justify-center py-4">
                <ProductPreview 
                  product={editedVariant} 
                  device={device}
                  isVariant={true}
                  highlights={changes}
                  editable={true}
                  onFieldEdit={handleFieldEdit}
                />
              </TabsContent>
            </Tabs>
          )}

          <AIInsightsPanel
            insights={insights}
          />

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