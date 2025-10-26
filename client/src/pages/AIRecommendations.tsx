import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import TestPreviewModal from "@/components/TestPreviewModal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkles, Plus, Archive as ArchiveIcon, RotateCcw } from "lucide-react";
import type { Product, Recommendation, Test } from "@shared/schema";

export default function AIRecommendations() {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [storeIdeasDialogOpen, setStoreIdeasDialogOpen] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [dismissingRecommendation, setDismissingRecommendation] = useState<Recommendation | null>(null);

  // Fetch quota data
  const { data: quotaData } = useQuery<{
    quota: number;
    used: number;
    remaining: number;
    planTier: string;
    resetDate: string;
  }>({
    queryKey: ["/api/quota"],
  });

  // Fetch products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch pending recommendations
  const { data: recommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
  });

  // Fetch archived recommendations
  const { data: archivedRecommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations", "archived"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations/archived");
      if (!res.ok) throw new Error("Failed to fetch archived recommendations");
      return res.json();
    },
  });

  // Generate store-wide recommendations
  const generateStoreRecommendationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recommendations/store-analysis");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Store Ideas Generated",
        description: `Generated ${data.recommendations?.length || 0} recommendations for your top products`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
      setStoreIdeasDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Generate Ideas",
        description: error.message || "Could not generate store-wide recommendations",
        variant: "destructive",
      });
      setStoreIdeasDialogOpen(false);
    },
  });

  // Generate product-specific recommendation
  const generateProductRecommendationMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", `/api/recommendations/product/${productId}/generate`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Product Idea Generated",
        description: "Generated new recommendation for this product",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
      setSelectedProductId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Generate Idea",
        description: error.message || "Could not generate product recommendation",
        variant: "destructive",
      });
    },
  });

  // Dismiss recommendation (just dismiss or dismiss & replace)
  const dismissRecommendationMutation = useMutation({
    mutationFn: async ({ id, replace }: { id: string; replace: boolean }) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/dismiss`, { replace });
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.replacement) {
        toast({
          title: "Recommendation Replaced",
          description: "Archived old recommendation and generated a new one",
        });
      } else {
        toast({
          title: "Recommendation Dismissed",
          description: "Moved to archive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
      setDismissDialogOpen(false);
      setDismissingRecommendation(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Dismiss",
        description: error.message || "Could not dismiss recommendation",
        variant: "destructive",
      });
      setDismissDialogOpen(false);
      setDismissingRecommendation(null);
    },
  });

  // Restore recommendation
  const restoreRecommendationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/restore`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Recommendation Restored",
        description: "Moved back to pending recommendations",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "archived"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Restore",
        description: error.message || "Could not restore recommendation",
        variant: "destructive",
      });
    },
  });

  // Create and activate test from recommendation
  const createTestMutation = useMutation({
    mutationFn: async ({ recommendationId, editedChanges }: { recommendationId: string; editedChanges?: Record<string, any> }) => {
      const recommendation = recommendations.find(r => r.id === recommendationId);
      if (!recommendation) throw new Error("Recommendation not found");

      const product = products.find(p => p.id === recommendation.productId);
      if (!product) throw new Error("Product not found");

      const controlData: Record<string, any> = {
        title: product.title,
        description: product.description || "",
        price: product.price,
      };

      if (recommendation.testType === "price") {
        controlData.variantPrices = product.variants.map((v: any) => ({
          id: v.id,
          price: v.price,
        }));
      }

      // Use edited changes if provided, otherwise use recommendation's proposed changes
      const proposedChanges = editedChanges || recommendation.proposedChanges;

      const variantData: Record<string, any> = {
        ...controlData,
        ...proposedChanges,
      };

      if (recommendation.testType === "price" && controlData.variantPrices) {
        const priceMultiplier = variantData.price / controlData.price;
        variantData.variantPrices = controlData.variantPrices.map((v: any) => ({
          id: v.id,
          price: (parseFloat(v.price) * priceMultiplier).toFixed(2),
        }));
      }

      const testData = {
        productId: product.id,
        recommendationId: recommendation.id,
        testType: recommendation.testType,
        status: "draft",
        controlData,
        variantData,
        arpu: "0",
        arpuLift: "0",
        impressions: 0,
        conversions: 0,
        revenue: "0",
      };

      // Create the test
      const createRes = await apiRequest("POST", "/api/tests", testData);
      const createdTest = await createRes.json();

      // Immediately activate the test
      const activateRes = await apiRequest("POST", `/api/tests/${createdTest.id}/activate`);
      const activatedTest = await activateRes.json();

      return { test: activatedTest, recommendationId };
    },
    onSuccess: async (data) => {
      await apiRequest("PATCH", `/api/recommendations/${data.recommendationId}`, { status: "testing" });
      
      toast({
        title: "Test Launched",
        description: "Your A/B test is now live and collecting data",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Launch Test",
        description: error.message || "Could not create and activate test from recommendation",
        variant: "destructive",
      });
    },
  });

  const handlePreview = (id: string) => {
    const rec = recommendations.find(r => r.id === id) || archivedRecommendations.find(r => r.id === id);
    if (!rec) return;

    console.log('[AIRecommendations] Opening preview for recommendation:', rec);
    console.log('[AIRecommendations] Insights:', rec.insights);
    console.log('[AIRecommendations] Insights type:', typeof rec.insights);
    console.log('[AIRecommendations] Is array?', Array.isArray(rec.insights));

    const product = products.find(p => p.id === rec.productId);
    setSelectedRecommendation(rec);
    setSelectedProduct(product || null);
    setPreviewOpen(true);
  };

  const handleAccept = (id: string, editedVariant?: any) => {
    if (!editedVariant) {
      createTestMutation.mutate({ recommendationId: id });
      return;
    }

    // Only extract fields that were actually changed in the recommendation
    const rec = recommendations.find(r => r.id === id);
    if (!rec) {
      createTestMutation.mutate({ recommendationId: id });
      return;
    }

    const editedChanges: Record<string, any> = {};
    
    // Only include fields that were in the original proposed changes
    if ('title' in rec.proposedChanges) {
      editedChanges.title = editedVariant.title;
    }
    if ('price' in rec.proposedChanges) {
      // Keep price as number for variant pricing multiplier to work correctly
      editedChanges.price = editedVariant.price;
    }
    if ('description' in rec.proposedChanges) {
      editedChanges.description = editedVariant.description;
    }
    
    createTestMutation.mutate({ recommendationId: id, editedChanges });
  };

  const handleDismissClick = (id: string) => {
    const rec = recommendations.find(r => r.id === id);
    if (!rec) return;
    setDismissingRecommendation(rec);
    setDismissDialogOpen(true);
  };

  const handleRestore = (id: string) => {
    restoreRecommendationMutation.mutate(id);
  };

  const quotaRemaining = quotaData?.remaining ?? 0;
  const quotaUsed = quotaData?.used ?? 0;
  const quotaTotal = quotaData?.quota ?? 20;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Recommendations</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered optimization ideas for your products
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="w-3 h-3" />
            {quotaUsed} AI Ideas Used · Beta: Unlimited
          </Badge>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => setStoreIdeasDialogOpen(true)}
          disabled={generateStoreRecommendationsMutation.isPending}
          data-testid="button-generate-store-ideas"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {generateStoreRecommendationsMutation.isPending ? "Generating..." : "Generate Store Ideas"}
        </Button>
        <div className="flex items-center gap-2">
          <Select value={selectedProductId} onValueChange={(value) => setSelectedProductId(value)}>
            <SelectTrigger className="w-[250px]" data-testid="select-product">
              <SelectValue placeholder="Select a product..." />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              if (selectedProductId) {
                generateProductRecommendationMutation.mutate(selectedProductId);
              }
            }}
            disabled={!selectedProductId || generateProductRecommendationMutation.isPending}
            variant="outline"
            data-testid="button-generate-product-idea"
          >
            <Plus className="w-4 h-4 mr-2" />
            {generateProductRecommendationMutation.isPending ? "Generating..." : "Generate Idea"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({recommendations.length})
          </TabsTrigger>
          <TabsTrigger value="archive" data-testid="tab-archive">
            <ArchiveIcon className="w-4 h-4 mr-2" />
            Archive ({archivedRecommendations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-6">
          {recommendations.length === 0 ? (
            <Card className="p-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Recommendations Yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate AI-powered optimization ideas for your store
              </p>
              <Button
                onClick={() => setStoreIdeasDialogOpen(true)}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Store Ideas
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {recommendations.map((rec) => {
                const product = products.find(p => p.id === rec.productId);
                const productImage = product?.images?.[0];
                return (
                  <AIRecommendationCard
                    key={rec.id}
                    id={rec.id}
                    title={rec.title}
                    description={rec.description}
                    productName={product?.title || 'Unknown Product'}
                    productImage={productImage}
                    testType={rec.testType}
                    impactScore={rec.impactScore}
                    onAccept={() => handleAccept(rec.id)}
                    onReject={() => handleDismissClick(rec.id)}
                    onPreview={() => handlePreview(rec.id)}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archive" className="space-y-4 mt-6">
          {archivedRecommendations.length === 0 ? (
            <Card className="p-12 text-center">
              <ArchiveIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Archived Recommendations</h3>
              <p className="text-muted-foreground">
                Dismissed recommendations will appear here
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {archivedRecommendations.map((rec) => {
                const product = products.find(p => p.id === rec.productId);
                const productImage = product?.images?.[0];
                return (
                  <AIRecommendationCard
                    key={rec.id}
                    id={rec.id}
                    title={rec.title}
                    description={rec.description}
                    productName={product?.title || 'Unknown Product'}
                    productImage={productImage}
                    testType={rec.testType}
                    impactScore={rec.impactScore}
                    borderColor="border-l-muted"
                    imageOpacity="opacity-60"
                    headerBadge={
                      <Badge variant="outline" className="gap-1">
                        <ArchiveIcon className="w-3 h-3" />
                        Archived
                      </Badge>
                    }
                    customActions={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(rec.id)}
                          data-testid={`button-preview-${rec.id}`}
                        >
                          Preview
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleRestore(rec.id)}
                          disabled={restoreRecommendationMutation.isPending}
                          data-testid={`button-restore-${rec.id}`}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Restore
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Store Ideas Confirmation Dialog */}
      <AlertDialog open={storeIdeasDialogOpen} onOpenChange={setStoreIdeasDialogOpen}>
        <AlertDialogContent data-testid="dialog-store-ideas">
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Store Ideas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will analyze your top products and generate up to 10 AI recommendations.
              <br />
              <br />
              <strong>Cost: 10 AI Ideas</strong> (You have {quotaRemaining} remaining)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-store-ideas">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => generateStoreRecommendationsMutation.mutate()}
              disabled={generateStoreRecommendationsMutation.isPending}
              data-testid="button-confirm-store-ideas"
            >
              {generateStoreRecommendationsMutation.isPending ? "Generating..." : "Generate Ideas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dismiss Dialog */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent data-testid="dialog-dismiss">
          <DialogHeader>
            <DialogTitle>Dismiss Recommendation</DialogTitle>
            <DialogDescription>
              What would you like to do with this recommendation?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">
              <strong>Just Dismiss:</strong> Archive this recommendation
            </p>
            <p className="text-sm">
              <strong>Dismiss & Replace:</strong> Archive this and generate a different recommendation for the same product
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (dismissingRecommendation) {
                  dismissRecommendationMutation.mutate({ id: dismissingRecommendation.id, replace: false });
                }
              }}
              disabled={dismissRecommendationMutation.isPending}
              data-testid="button-just-dismiss"
            >
              <ArchiveIcon className="w-4 h-4 mr-2" />
              Just Dismiss
            </Button>
            <Button
              onClick={() => {
                if (dismissingRecommendation) {
                  dismissRecommendationMutation.mutate({ id: dismissingRecommendation.id, replace: true });
                }
              }}
              disabled={dismissRecommendationMutation.isPending}
              data-testid="button-dismiss-replace"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Dismiss & Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      {selectedRecommendation && selectedProduct && (
        <TestPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          testTitle={selectedRecommendation.title}
          control={{
            title: selectedProduct.title,
            price: parseFloat(selectedProduct.price),
            compareAtPrice: selectedProduct.compareAtPrice ? parseFloat(selectedProduct.compareAtPrice) : undefined,
            description: selectedProduct.description ?? "",
            images: selectedProduct.images,
            rating: selectedProduct.rating ? parseFloat(selectedProduct.rating) : undefined,
            reviewCount: selectedProduct.reviewCount ?? undefined,
          }}
          variant={{
            title: (selectedRecommendation.proposedChanges.title as string | undefined) ?? selectedProduct.title,
            price: selectedRecommendation.proposedChanges.price 
              ? parseFloat(selectedRecommendation.proposedChanges.price as string)
              : parseFloat(selectedProduct.price),
            compareAtPrice: selectedProduct.compareAtPrice ? parseFloat(selectedProduct.compareAtPrice) : undefined,
            description: (selectedRecommendation.proposedChanges.description as string | undefined) ?? selectedProduct.description ?? "",
            images: selectedProduct.images,
            rating: selectedProduct.rating ? parseFloat(selectedProduct.rating) : undefined,
            reviewCount: selectedProduct.reviewCount ?? undefined,
          }}
          changes={Object.keys(selectedRecommendation.proposedChanges)}
          insights={selectedRecommendation.insights}
          onApprove={(editedVariant) => handleAccept(selectedRecommendation.id, editedVariant)}
        />
      )}
    </div>
  );
}
