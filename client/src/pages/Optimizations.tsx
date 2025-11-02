import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  StopCircle,
  TrendingUp,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Pause,
  ArrowRight,
  Calendar,
  X,
  Search,
  Filter,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Optimization, Product, OptimizationEvolutionSnapshot } from "@shared/schema";
import { formatOptimizationType } from "@/lib/optimizationTypeFormatter";

interface EnrichedOptimization extends Optimization {
  productName: string;
}

interface OptimizationEvolutionChartsProps {
  optimizationId: string;
}

function OptimizationEvolutionCharts({ optimizationId }: OptimizationEvolutionChartsProps) {
  const { data: snapshots = [], isLoading } = useQuery<OptimizationEvolutionSnapshot[]>(
    {
      queryKey: ["/api/optimizations", optimizationId, "evolution"],
      queryFn: async () => {
        const res = await fetch(`/api/optimizations/${optimizationId}/evolution`);
        if (!res.ok) throw new Error("Failed to fetch evolution data");
        return res.json();
      },
    },
  );

  // Transform snapshots for chart display
  const chartData = snapshots.map((snapshot) => ({
    impressions: snapshot.impressions,
    controlRPV: parseFloat(snapshot.controlRPV),
    variantRPV: parseFloat(snapshot.variantRPV),
    controlAllocation: parseFloat(snapshot.controlAllocation),
    variantAllocation: parseFloat(snapshot.variantAllocation),
  }));

  if (isLoading) {
    return (
      <div className="mt-6 pt-6 border-t">
        <div className="text-sm text-muted-foreground text-center py-4">
          Loading evolution data...
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t space-y-4">
      <h3 className="font-semibold text-sm">Performance Evolution</h3>

      {/* RPV Evolution Chart */}
      <div
        className="p-4 border rounded-lg space-y-3"
        data-testid={`chart-rpv-evolution-${optimizationId}`}
      >
        <div>
          <div className="text-sm font-medium">RPV Evolution Over Time</div>
          <p className="text-xs text-muted-foreground">
            Cumulative revenue per visitor tracked at 100-impression intervals
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: -10 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="impressions"
              label={{
                value: "Total Optimization Impressions",
                position: "insideBottom",
                offset: -10,
              }}
            />
            <YAxis
              label={{ value: "RPV ($)", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              formatter={(value: number) => `$${value.toFixed(2)}`}
              labelFormatter={(label) => `${label} impressions`}
              contentStyle={{
                backgroundColor: "#1d2025",
                border: "1px solid #ccc",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
            <Legend height={36} />
            <Line
              type="monotone"
              dataKey="controlRPV"
              stroke="#8884d8"
              name="Control RPV"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="variantRPV"
              stroke="#82ca9d"
              name="Variant RPV"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Allocation Evolution Chart */}
      <div
        className="p-4 border rounded-lg space-y-3"
        data-testid={`chart-allocation-evolution-${optimizationId}`}
      >
        <div>
          <div className="text-sm font-medium">
            Traffic Allocation Evolution
          </div>
          <p className="text-xs text-muted-foreground">
            Cumulative traffic split adjustments tracked at 100-impression
            intervals
          </p>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="impressions"
              label={{
                value: "Total Optimization Impressions",
                position: "insideBottom",
                offset: -10,
              }}
            />
            <YAxis
              label={{
                value: "Allocation (%)",
                angle: -90,
                position: "insideLeft",
              }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(1)}%`}
              labelFormatter={(label) => `${label} impressions`}
            />
            <Legend verticalAlign="bottom" height={36} />
            <Line
              type="monotone"
              dataKey="controlAllocation"
              stroke="#8884d8"
              name="Control %"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="variantAllocation"
              stroke="#82ca9d"
              name="Variant %"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Optimizations() {
  const { toast } = useToast();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [productSearch, setProductSearch] = useState<string>("");

  // Fetch all optimizations with auto-refresh using refetchInterval
  const { data: optimizations = [], isLoading: optimizationsLoading } = useQuery<Optimization[]>({
    queryKey: ["/api/optimizations"],
    refetchInterval: 2000,
  });

  // Fetch all products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Enrich all optimizations with product names
  const allOptimizationsWithNames: EnrichedOptimization[] = optimizations.map((optimization: Optimization) => ({
    ...optimization,
    productName:
      products.find((p: Product) => p.id === optimization.productId)?.title ||
      "Unknown Product",
  }));

  // Apply filters
  const filteredOptimizations = allOptimizationsWithNames.filter((optimization) => {
    // Status filter
    if (statusFilter !== "all" && optimization.status !== statusFilter) {
      return false;
    }

    // Type filter
    if (typeFilter !== "all" && optimization.optimizationType !== typeFilter) {
      return false;
    }

    // Product search
    if (productSearch && !optimization.productName.toLowerCase().includes(productSearch.toLowerCase())) {
      return false;
    }

    return true;
  });

  // For displaying - show all filtered optimizations
  const activeAndDraftOptimizations = filteredOptimizations;

  // Filter only truly active optimizations for metrics (exclude drafts and paused)
  const trulyActiveOptimizations = activeAndDraftOptimizations.filter(
    (t) => t.status === "active",
  );

  // Activate optimization mutation
  const activateOptimizationMutation = useMutation({
    mutationFn: async (optimizationId: string) => {
      const res = await apiRequest("POST", `/api/optimizations/${optimizationId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimization Activated",
        description: "Optimization is now live and collecting data",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      // Provide more helpful error messages
      let title = "Activation Failed";
      let description = error.message || "Failed to activate optimization";
      
      // Handle specific error cases
      if (description.includes("active") && description.includes("optimization")) {
        title = "Conflicting Optimization Active";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  // Pause optimization mutation
  const pauseOptimizationMutation = useMutation({
    mutationFn: async (optimizationId: string) => {
      const res = await apiRequest("POST", `/api/optimizations/${optimizationId}/pause`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimization Paused",
        description: "Optimization stopped collecting data but can be resumed",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to pause optimization",
        variant: "destructive",
      });
    },
  });

  // Resume optimization mutation
  const resumeOptimizationMutation = useMutation({
    mutationFn: async (optimizationId: string) => {
      const res = await apiRequest("POST", `/api/optimizations/${optimizationId}/resume`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimization Resumed",
        description: "Optimization is now live and collecting data again",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resume optimization",
        variant: "destructive",
      });
    },
  });

  // Deactivate optimization mutation (renamed to Cancel Optimization in UI)
  const deactivateOptimizationMutation = useMutation({
    mutationFn: async (optimizationId: string) => {
      const res = await apiRequest("POST", `/api/optimizations/${optimizationId}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Optimization Cancelled",
        description: "Optimization has been cancelled and original values restored",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel optimization",
        variant: "destructive",
      });
    },
  });

  // Calculate summary metrics ONLY from truly active optimizations (exclude drafts)
  // Sum control and variant impressions/conversions separately to avoid string concatenation
  const totalImpressions = trulyActiveOptimizations.reduce(
    (sum, t) => sum + (Number(t.controlImpressions) || 0) + (Number(t.variantImpressions) || 0),
    0,
  );
  const totalConversions = trulyActiveOptimizations.reduce(
    (sum, t) => sum + (Number(t.controlConversions) || 0) + (Number(t.variantConversions) || 0),
    0,
  );
  const totalRevenue = trulyActiveOptimizations.reduce((sum, t) => {
    const revenue = t.revenue ? parseFloat(t.revenue) : 0;
    return sum + (isNaN(revenue) ? 0 : revenue);
  }, 0);
  const averageRpv = totalImpressions > 0 ? totalRevenue / totalImpressions : 0;
  const averageConversionRate =
    totalImpressions > 0 ? (totalConversions / totalImpressions) * 100 : 0;

  const formatPercentage = (value: number) => {
    return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Optimizations
        </h1>
        <p
          className="text-muted-foreground"
          data-testid="text-page-description"
        >
          Manage all your A/B optimizations - draft, active, paused, and completed
        </p>
      </div>

      {/* Filter Controls */}
      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid="select-status-filter">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Live</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Optimization Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger data-testid="select-type-filter">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="price">Price</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="description">Description</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Product Search */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Product</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-product-search"
                  />
                </div>
              </div>
            </div>

            {/* Clear Filters Button */}
            {(statusFilter !== "all" || typeFilter !== "all" || productSearch) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setTypeFilter("all");
                  setProductSearch("");
                }}
                data-testid="button-clear-filters"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Metrics */}
      {trulyActiveOptimizations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-metric-optimizations">
            <CardHeader className="pb-3">
              <CardDescription>Active Optimizations</CardDescription>
              <CardTitle className="text-3xl">
                {trulyActiveOptimizations.length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Running experiments
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-impressions">
            <CardHeader className="pb-3">
              <CardDescription>Total Impressions</CardDescription>
              <CardTitle className="text-3xl">
                {totalImpressions.toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Product page views
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-conversions">
            <CardHeader className="pb-3">
              <CardDescription>Total Conversions</CardDescription>
              <CardTitle className="text-3xl">{totalConversions}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {averageConversionRate.toFixed(2)}% conversion rate
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-rpv">
            <CardHeader className="pb-3">
              <CardDescription>Average RPV</CardDescription>
              <CardTitle className="text-3xl">
                ${averageRpv.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Revenue per visitor
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Optimizations List */}
      {optimizationsLoading ? (
        <Card data-testid="card-loading">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">Loading optimizations...</p>
            </div>
          </CardContent>
        </Card>
      ) : activeAndDraftOptimizations.length === 0 ? (
        <Card data-testid="card-no-optimizations">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">No Optimizations Yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create an optimization from an AI recommendation to get started
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2
            className="text-xl font-semibold"
            data-testid="text-optimizations-heading"
          >
            Optimizations
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {activeAndDraftOptimizations.map((optimization, index) => {
              const impressions = optimization.impressions || 0;
              const conversions = optimization.conversions || 0;
              const conversionRate =
                impressions > 0 ? (conversions / impressions) * 100 : 0;
              const arpuLift = parseFloat(optimization.arpuLift || "0");

              // 2-State Badge System: "Still Learning" vs "Ready to Decide"
              // All optimizations now use Bayesian allocation - check if we have sufficient data per variant
              const hasSufficientData =
                impressions >= 2000 && // Matches Bayesian promotion criteria
                (optimization.controlConversions || 0) >= 30 && // Control has meaningful data
                (optimization.variantConversions || 0) >= 30; // Variant has meaningful data

              // Check if we have a clear winner (probability >80% or <20%)
              const CONFIDENCE_THRESHOLD = 0.8;
              let hasClearWinner = false;
              if (
                optimization.bayesianConfig &&
                typeof optimization.bayesianConfig === "object"
              ) {
                const config = optimization.bayesianConfig as any;
                const prob = config.probVariantBetter || 0.5;
                hasClearWinner =
                  prob > CONFIDENCE_THRESHOLD ||
                  prob < 1 - CONFIDENCE_THRESHOLD;
              }

              // Badge: "Ready to Decide" only if BOTH sufficient data AND clear winner
              const isReadyToDecide = hasSufficientData && hasClearWinner;

              // Helper to render change preview
              const renderChangePreview = () => {
                const { controlData, variantData, optimizationType } = optimization;
                
                if (optimizationType === "price") {
                  // For price optimizations, show the first variant price change
                  const controlPrice = controlData.variantPrices?.[0]?.price || controlData.price;
                  const variantPrice = variantData.variantPrices?.[0]?.price || variantData.price;
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">${controlPrice}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-green-600">${variantPrice}</span>
                    </div>
                  );
                } else if (optimizationType === "title") {
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium truncate max-w-[200px]">{controlData.title}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-green-600 truncate max-w-[200px]">{variantData.title}</span>
                    </div>
                  );
                } else if (optimizationType === "description") {
                  return (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate max-w-[200px]">{controlData.description?.substring(0, 30)}...</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-green-600 truncate max-w-[200px]">{variantData.description?.substring(0, 30)}...</span>
                    </div>
                  );
                }
                return null;
              };

              return (
                <Card key={optimization.id} data-testid={`card-test-${index}`}>
                  <CardHeader>
                    {/* Top Section: Title, Status, Dates, and Controls */}
                    <div className="space-y-4">
                      {/* Title Row */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle
                              className="text-lg"
                              data-testid={`text-product-name-${index}`}
                            >
                              {optimization.productName}
                            </CardTitle>
                            <Badge
                              variant={
                                optimization.status === "draft" ? "secondary" : 
                                optimization.status === "paused" ? "outline" : "default"
                              }
                              data-testid={`badge-status-${index}`}
                            >
                              {optimization.status === "draft" ? "Draft" : 
                               optimization.status === "paused" ? "Paused" : "Live"}
                            </Badge>
                            {isReadyToDecide && optimization.status === "active" && (
                              <Badge variant="default" className="bg-green-600">
                                Ready to Decide
                              </Badge>
                            )}
                            {!isReadyToDecide && optimization.status === "active" && (
                              <Badge variant="outline">
                                Still Learning
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Change Preview and Test Info */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium">{formatOptimizationType(optimization.optimizationType)}</span>
                          <span>•</span>
                          {renderChangePreview()}
                        </div>
                        
                        {/* Dates */}
                        {optimization.startDate && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>Started {new Date(optimization.startDate).toLocaleDateString()}</span>
                            {optimization.endDate && (
                              <span>• Ended {new Date(optimization.endDate).toLocaleDateString()}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {optimization.status === "draft" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => activateTestMutation.mutate(optimization.id)}
                            disabled={activateOptimizationMutation.isPending}
                            data-testid={`button-activate-test-${index}`}
                            className="gap-1"
                          >
                            <Play className="w-4 h-4" />
                            {activateOptimizationMutation.isPending ? "Activating..." : "Activate Optimization"}
                          </Button>
                        )}
                        
                        {optimization.status === "active" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => pauseTestMutation.mutate(optimization.id)}
                              disabled={pauseOptimizationMutation.isPending}
                              data-testid={`button-pause-test-${index}`}
                              className="gap-1"
                            >
                              <Pause className="w-4 h-4" />
                              Pause
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deactivateTestMutation.mutate(optimization.id)}
                              disabled={deactivateOptimizationMutation.isPending}
                              data-testid={`button-cancel-test-${index}`}
                              className="gap-1"
                            >
                              <X className="w-4 h-4" />
                              Cancel
                            </Button>
                          </>
                        )}

                        {optimization.status === "paused" && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => resumeTestMutation.mutate(optimization.id)}
                              disabled={resumeOptimizationMutation.isPending}
                              data-testid={`button-resume-test-${index}`}
                              className="gap-1"
                            >
                              <Play className="w-4 h-4" />
                              {resumeOptimizationMutation.isPending ? "Resuming..." : "Resume"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deactivateTestMutation.mutate(optimization.id)}
                              disabled={deactivateOptimizationMutation.isPending}
                              data-testid={`button-cancel-test-${index}`}
                              className="gap-1"
                            >
                              <X className="w-4 h-4" />
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Control vs Variant Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Control Column */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                          <h3 className="font-semibold">Control (Original)</h3>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Impressions
                            </p>
                            <p
                              className="text-xl font-bold"
                              data-testid={`text-control-impressions-${index}`}
                            >
                              {(optimization.controlImpressions || 0).toLocaleString()}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              Conversions
                            </p>
                            <p
                              className="text-xl font-bold"
                              data-testid={`text-control-conversions-${index}`}
                            >
                              {optimization.controlConversions || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(optimization.controlImpressions || 0) > 0
                                ? (
                                    ((optimization.controlConversions || 0) /
                                      (optimization.controlImpressions || 1)) *
                                    100
                                  ).toFixed(2)
                                : "0.00"}
                              % rate
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              RPV (Revenue Per Visitor)
                            </p>
                            <p
                              className="text-xl font-bold"
                              data-testid={`text-control-rpv-${index}`}
                            >
                              $
                              {(() => {
                                const impressions =
                                  optimization.controlImpressions || 0;
                                const revenue = optimization.controlRevenue
                                  ? parseFloat(optimization.controlRevenue)
                                  : 0;
                                const rpv =
                                  impressions > 0 ? revenue / impressions : 0;
                                return (isNaN(rpv) ? 0 : rpv).toFixed(2);
                              })()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              AOV: $
                              {(() => {
                                const conversions =
                                  optimization.controlConversions || 0;
                                const revenue = optimization.controlRevenue
                                  ? parseFloat(optimization.controlRevenue)
                                  : 0;
                                const aov =
                                  conversions > 0 ? revenue / conversions : 0;
                                return (isNaN(aov) ? 0 : aov).toFixed(2);
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Variant Column */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          <h3 className="font-semibold">Variant (New)</h3>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Impressions
                            </p>
                            <p
                              className="text-xl font-bold"
                              data-testid={`text-variant-impressions-${index}`}
                            >
                              {(optimization.variantImpressions || 0).toLocaleString()}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              Conversions
                            </p>
                            <p
                              className="text-xl font-bold"
                              data-testid={`text-variant-conversions-${index}`}
                            >
                              {optimization.variantConversions || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(optimization.variantImpressions || 0) > 0
                                ? (
                                    ((optimization.variantConversions || 0) /
                                      (optimization.variantImpressions || 1)) *
                                    100
                                  ).toFixed(2)
                                : "0.00"}
                              % rate
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              RPV (Revenue Per Visitor)
                            </p>
                            <p
                              className="text-xl font-bold text-green-600"
                              data-testid={`text-variant-rpv-${index}`}
                            >
                              $
                              {(() => {
                                const impressions =
                                  optimization.variantImpressions || 0;
                                const revenue = optimization.variantRevenue
                                  ? parseFloat(optimization.variantRevenue)
                                  : 0;
                                const rpv =
                                  impressions > 0 ? revenue / impressions : 0;
                                return (isNaN(rpv) ? 0 : rpv).toFixed(2);
                              })()}
                            </p>
                            {(() => {
                              // Calculate RPV lift (what Bayesian optimizes)
                              const controlImpressions =
                                optimization.controlImpressions || 0;
                              const controlRevenue = optimization.controlRevenue
                                ? parseFloat(optimization.controlRevenue)
                                : 0;
                              const controlRpv =
                                controlImpressions > 0
                                  ? controlRevenue / controlImpressions
                                  : 0;

                              const variantImpressions =
                                optimization.variantImpressions || 0;
                              const variantRevenue = optimization.variantRevenue
                                ? parseFloat(optimization.variantRevenue)
                                : 0;
                              const variantRpv =
                                variantImpressions > 0
                                  ? variantRevenue / variantImpressions
                                  : 0;

                              const lift =
                                controlRpv > 0
                                  ? ((variantRpv - controlRpv) / controlRpv) *
                                    100
                                  : 0;
                              const hasData =
                                (optimization.controlConversions || 0) >= 3 &&
                                (optimization.variantConversions || 0) >= 3;

                              return (
                                hasData && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <p
                                      className={`text-sm font-semibold ${lift > 0 ? "text-green-600" : lift < 0 ? "text-red-600" : "text-muted-foreground"}`}
                                    >
                                      {lift >= 0 ? "+" : ""}
                                      {lift.toFixed(1)}% vs control
                                    </p>
                                    {lift > 0 && (
                                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                                    )}
                                    {lift < 0 && (
                                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                                    )}
                                  </div>
                                )
                              );
                            })()}
                            <p className="text-xs text-muted-foreground">
                              AOV: $
                              {(() => {
                                const conversions =
                                  optimization.variantConversions || 0;
                                const revenue = optimization.variantRevenue
                                  ? parseFloat(optimization.variantRevenue)
                                  : 0;
                                const aov =
                                  conversions > 0 ? revenue / conversions : 0;
                                return (isNaN(aov) ? 0 : aov).toFixed(2);
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Card */}
      <Card data-testid="card-info">
        <CardHeader>
          <CardTitle>About Optimizations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This page shows all your A/B optimizations across all statuses - drafts waiting to be activated,
            live optimizations collecting data, paused optimizations, and completed experiments. Use the filters above
            to find specific optimizations. Metrics update automatically every 2 seconds.
          </p>
          <p>
            <strong>Control vs Variant:</strong> Each optimization shows side-by-side
            performance metrics. The Control represents your original product,
            while the Variant shows the proposed changes.
          </p>
          <p>
            <strong>RPV (Revenue Per Visitor):</strong> The primary metric
            optimized by our smart allocation system. RPV = Total Revenue ÷ Total
            Impressions. A variant can win with higher RPV even if it has lower
            AOV, by converting visitors at a higher rate. AOV (Average Order
            Value) is shown as a secondary metric.
          </p>
          <p>
            <strong>Stopping an optimization:</strong> Deactivates the optimization and stops
            showing variants to customers. All collected metrics are preserved
            for analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
