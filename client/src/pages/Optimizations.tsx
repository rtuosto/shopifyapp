import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Divider,
  Spinner,
  Badge,
  Banner,
  Button,
  TextField,
  Select,
} from "@shopify/polaris";

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

  const chartData = snapshots.map((snapshot) => ({
    impressions: snapshot.impressions,
    controlRPV: parseFloat(snapshot.controlRPV),
    variantRPV: parseFloat(snapshot.variantRPV),
    controlAllocation: parseFloat(snapshot.controlAllocation),
    variantAllocation: parseFloat(snapshot.variantAllocation),
  }));

  if (isLoading) {
    return (
      <Box padding="400">
        <Divider />
        <Box padding="400">
          <BlockStack gap="200" align="center">
            <Spinner size="small" accessibilityLabel="Loading evolution data" />
            <Text as="p" variant="bodySm" tone="subdued">Loading evolution data...</Text>
          </BlockStack>
        </Box>
      </Box>
    );
  }

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Box padding="400">
      <Divider />
      <BlockStack gap="400">
        <Text as="h3" variant="headingSm" fontWeight="semibold">Performance Evolution</Text>

        <Card>
          <Box padding="400" data-testid={`chart-rpv-evolution-${optimizationId}`}>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="medium">RPV Evolution Over Time</Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Cumulative revenue per visitor tracked at 100-impression intervals
              </Text>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: 0, bottom: -10 }}
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
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400" data-testid={`chart-allocation-evolution-${optimizationId}`}>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" fontWeight="medium">Traffic Allocation Evolution</Text>
              <Text as="span" variant="bodyXs" tone="subdued">
                Cumulative traffic split adjustments tracked at 100-impression intervals
              </Text>
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
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Box>
  );
}

function getStatusBadgeTone(status: string): "success" | "info" | "warning" | "critical" | "read-only" {
  switch (status) {
    case "active": return "success";
    case "completed": return "info";
    case "paused": return "warning";
    case "cancelled": return "critical";
    case "draft": return "read-only";
    default: return "read-only";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "draft": return "Draft";
    case "paused": return "Paused";
    case "active": return "Live";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return "Unknown";
  }
}

export default function Optimizations() {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [productSearch, setProductSearch] = useState<string>("");
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  const { data: optimizations = [], isLoading: optimizationsLoading } = useQuery<Optimization[]>({
    queryKey: ["/api/optimizations"],
    refetchInterval: 2000,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const allOptimizationsWithNames: EnrichedOptimization[] = optimizations.map((optimization: Optimization) => ({
    ...optimization,
    productName:
      products.find((p: Product) => p.id === optimization.productId)?.title ||
      "Unknown Product",
  }));

  const filteredOptimizations = allOptimizationsWithNames.filter((optimization) => {
    if (statusFilter !== "all" && optimization.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "all" && optimization.optimizationType !== typeFilter) {
      return false;
    }
    if (productSearch && !optimization.productName.toLowerCase().includes(productSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  const activeAndDraftOptimizations = filteredOptimizations;

  const trulyActiveOptimizations = activeAndDraftOptimizations.filter(
    (t) => t.status === "active",
  );

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
      if ((error as any).upgradeRequired) {
        setUpgradeMessage(error.message);
      } else {
        let title = "Activation Failed";
        let description = error.message || "Failed to activate optimization";
        if (description.includes("active") && description.includes("optimization")) {
          title = "Conflicting Optimization Active";
        }
        toast({
          title,
          description,
          variant: "destructive",
        });
      }
    },
  });

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

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || productSearch;

  const handleClearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setProductSearch("");
  };

  return (
    <Page data-testid="text-page-title">
      <BlockStack gap="600">
        <BlockStack gap="200">
          <Text as="h1" variant="headingLg" data-testid="text-page-title">Optimizations</Text>
          <Text as="p" variant="bodySm" tone="subdued" data-testid="text-page-description">
            Manage all your A/B optimizations - draft, active, paused, and completed
          </Text>
        </BlockStack>

        {upgradeMessage && (
          <Banner
            title="Plan limit reached"
            tone="warning"
            onDismiss={() => setUpgradeMessage(null)}
            action={{ content: "View Plans", url: "/billing" }}
          >
            <Text as="p" variant="bodyMd">{upgradeMessage}</Text>
          </Banner>
        )}

        <Card data-testid="card-filters">
          <Box padding="400">
            <BlockStack gap="400">
              <InlineStack gap="200" align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" fontWeight="semibold">Filters:</Text>
                {hasActiveFilters && (
                  <Button
                    variant="plain"
                    size="slim"
                    onClick={handleClearFilters}
                    data-testid="button-clear-filters"
                  >
                    Clear
                  </Button>
                )}
              </InlineStack>

              <InlineGrid columns={3} gap="400">
                <Select
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value)}
                  data-testid="select-status-filter"
                  options={[
                    { label: "All Statuses", value: "all" },
                    { label: "Draft", value: "draft" },
                    { label: "Live", value: "active" },
                    { label: "Paused", value: "paused" },
                    { label: "Completed", value: "completed" },
                    { label: "Cancelled", value: "cancelled" },
                  ]}
                />

                <Select
                  label="Optimization Type"
                  value={typeFilter}
                  onChange={(value) => setTypeFilter(value)}
                  data-testid="select-type-filter"
                  options={[
                    { label: "All Types", value: "all" },
                    { label: "Price", value: "price" },
                    { label: "Title", value: "title" },
                    { label: "Description", value: "description" },
                  ]}
                />

                <TextField
                  label="Product"
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(value) => setProductSearch(value)}
                  data-testid="input-product-search"
                  autoComplete="off"
                />
              </InlineGrid>
            </BlockStack>
          </Box>
        </Card>

        {trulyActiveOptimizations.length > 0 && (
          <InlineGrid columns={4} gap="400">
            <Card data-testid="card-metric-optimizations">
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="span" variant="bodyXs" tone="subdued">Active Optimizations</Text>
                  <Text as="h2" variant="headingLg" fontWeight="bold">
                    {String(trulyActiveOptimizations.length)}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">Running experiments</Text>
                </BlockStack>
              </Box>
            </Card>

            <Card data-testid="card-metric-impressions">
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="span" variant="bodyXs" tone="subdued">Total Impressions</Text>
                  <Text as="h2" variant="headingLg" fontWeight="bold">
                    {totalImpressions.toLocaleString()}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">Product page views</Text>
                </BlockStack>
              </Box>
            </Card>

            <Card data-testid="card-metric-conversions">
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="span" variant="bodyXs" tone="subdued">Total Conversions</Text>
                  <Text as="h2" variant="headingLg" fontWeight="bold">{String(totalConversions)}</Text>
                  <Text as="span" variant="bodyXs" tone="subdued">
                    {averageConversionRate.toFixed(2)}% conversion rate
                  </Text>
                </BlockStack>
              </Box>
            </Card>

            <Card data-testid="card-metric-rpv">
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="span" variant="bodyXs" tone="subdued">Average RPV</Text>
                  <Text as="h2" variant="headingLg" fontWeight="bold">
                    ${averageRpv.toFixed(2)}
                  </Text>
                  <Text as="span" variant="bodyXs" tone="subdued">Revenue per visitor</Text>
                </BlockStack>
              </Box>
            </Card>
          </InlineGrid>
        )}

        {optimizationsLoading ? (
          <Card data-testid="card-loading">
            <Box padding="400">
              <BlockStack gap="400" align="center">
                <Spinner size="large" accessibilityLabel="Loading optimizations" />
                <Text as="p" variant="bodySm" tone="subdued">Loading optimizations...</Text>
              </BlockStack>
            </Box>
          </Card>
        ) : activeAndDraftOptimizations.length === 0 ? (
          <Card data-testid="card-no-optimizations">
            <Box padding="400">
              <BlockStack gap="400" align="center">
                <Text as="h3" variant="headingSm">No Optimizations Yet</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Create an optimization from an AI recommendation to get started
                </Text>
              </BlockStack>
            </Box>
          </Card>
        ) : (
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd" data-testid="text-optimizations-heading">
              Optimizations
            </Text>
            <BlockStack gap="400">
              {activeAndDraftOptimizations.map((optimization, index) => {
                const impressions = optimization.impressions || 0;
                const conversions = optimization.conversions || 0;
                const conversionRate =
                  impressions > 0 ? (conversions / impressions) * 100 : 0;
                const arpuLift = parseFloat(optimization.arpuLift || "0");

                const hasSufficientData =
                  impressions >= 2000 &&
                  (optimization.controlConversions || 0) >= 30 &&
                  (optimization.variantConversions || 0) >= 30;

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

                const isReadyToDecide = hasSufficientData && hasClearWinner;

                const renderChangePreview = () => {
                  const { controlData, variantData, optimizationType } = optimization;

                  if (optimizationType === "price") {
                    const controlPrice = controlData.variantPrices?.[0]?.price || controlData.price;
                    const variantPrice = variantData.variantPrices?.[0]?.price || variantData.price;
                    return (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="bodySm" fontWeight="medium">${controlPrice}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">&rarr;</Text>
                        <Text as="p" variant="bodySm" fontWeight="medium" tone="success">${variantPrice}</Text>
                      </InlineStack>
                    );
                  } else if (optimizationType === "title") {
                    return (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="bodySm" fontWeight="medium" truncate>{controlData.title}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">&rarr;</Text>
                        <Text as="p" variant="bodySm" fontWeight="medium" tone="success" truncate>{variantData.title}</Text>
                      </InlineStack>
                    );
                  } else if (optimizationType === "description") {
                    return (
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="bodySm" truncate>{controlData.description?.substring(0, 30)}...</Text>
                        <Text as="p" variant="bodySm" tone="subdued">&rarr;</Text>
                        <Text as="p" variant="bodySm" tone="success" truncate>{variantData.description?.substring(0, 30)}...</Text>
                      </InlineStack>
                    );
                  }
                  return null;
                };

                const status = (optimization.status || "").toLowerCase();

                return (
                  <Card key={optimization.id} data-testid={`card-test-${index}`}>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text
                            as="h3"
                            variant="headingSm"
                            data-testid={`text-product-name-${index}`}
                          >
                            {optimization.productName}
                          </Text>
                          <Badge
                            tone={getStatusBadgeTone(status)}
                            data-testid={`badge-status-${index}`}
                          >
                            {getStatusLabel(status)}
                          </Badge>
                          {isReadyToDecide && status === "active" && (
                            <Badge tone="success">Ready to Decide</Badge>
                          )}
                          {!isReadyToDecide && status === "active" && (
                            <Badge tone="read-only">Still Learning</Badge>
                          )}
                        </InlineStack>

                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="bodySm" fontWeight="medium">
                              {formatOptimizationType(optimization.optimizationType)}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">&#8226;</Text>
                            {renderChangePreview()}
                          </InlineStack>

                          {optimization.startDate && (
                            <Text as="span" variant="bodyXs" tone="subdued">
                              Started {new Date(optimization.startDate).toLocaleDateString()}
                              {optimization.endDate && (
                                <> &#8226; Ended {new Date(optimization.endDate).toLocaleDateString()}</>
                              )}
                            </Text>
                          )}
                        </BlockStack>

                        <InlineStack gap="200">
                          {status === "draft" && (
                            <Button
                              variant="primary"
                              size="slim"
                              onClick={() => activateOptimizationMutation.mutate(optimization.id)}
                              disabled={activateOptimizationMutation.isPending}
                              loading={activateOptimizationMutation.isPending}
                              data-testid={`button-activate-test-${index}`}
                            >
                              Activate Optimization
                            </Button>
                          )}

                          {status === "active" && (
                            <>
                              <Button
                                size="slim"
                                onClick={() => pauseOptimizationMutation.mutate(optimization.id)}
                                disabled={pauseOptimizationMutation.isPending}
                                loading={pauseOptimizationMutation.isPending}
                                data-testid={`button-pause-test-${index}`}
                              >
                                Pause
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => deactivateOptimizationMutation.mutate(optimization.id)}
                                disabled={deactivateOptimizationMutation.isPending}
                                loading={deactivateOptimizationMutation.isPending}
                                data-testid={`button-cancel-test-${index}`}
                              >
                                Cancel
                              </Button>
                            </>
                          )}

                          {status === "paused" && (
                            <>
                              <Button
                                variant="primary"
                                size="slim"
                                onClick={() => resumeOptimizationMutation.mutate(optimization.id)}
                                disabled={resumeOptimizationMutation.isPending}
                                loading={resumeOptimizationMutation.isPending}
                                data-testid={`button-resume-test-${index}`}
                              >
                                Resume
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => deactivateOptimizationMutation.mutate(optimization.id)}
                                disabled={deactivateOptimizationMutation.isPending}
                                loading={deactivateOptimizationMutation.isPending}
                                data-testid={`button-cancel-test-${index}`}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </InlineStack>

                        <Divider />

                        <InlineGrid columns={2} gap="400">
                          <BlockStack gap="400">
                            <InlineStack gap="200" blockAlign="center">
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: "#3b82f6" }} />
                              <Text as="p" variant="bodySm" fontWeight="semibold">Control (Original)</Text>
                            </InlineStack>

                            <BlockStack gap="400">
                              <BlockStack gap="200">
                                <Text as="span" variant="bodyXs" tone="subdued">Impressions</Text>
                                <Text as="h2" variant="headingMd" fontWeight="bold" data-testid={`text-control-impressions-${index}`}>
                                  {(optimization.controlImpressions || 0).toLocaleString()}
                                </Text>
                              </BlockStack>

                              <BlockStack gap="200">
                                <Text as="span" variant="bodyXs" tone="subdued">Conversions</Text>
                                <Text as="h2" variant="headingMd" fontWeight="bold" data-testid={`text-control-conversions-${index}`}>
                                  {String(optimization.controlConversions || 0)}
                                </Text>
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  {(optimization.controlImpressions || 0) > 0
                                    ? (
                                        ((optimization.controlConversions || 0) /
                                          (optimization.controlImpressions || 1)) *
                                        100
                                      ).toFixed(2)
                                    : "0.00"}
                                  % rate
                                </Text>
                              </BlockStack>

                              <BlockStack gap="200">
                                <Text as="span" variant="bodyXs" tone="subdued">RPV (Revenue Per Visitor)</Text>
                                <Text as="h2" variant="headingMd" fontWeight="bold" data-testid={`text-control-rpv-${index}`}>
                                  $
                                  {(() => {
                                    const impressions = optimization.controlImpressions || 0;
                                    const revenue = optimization.controlRevenue
                                      ? parseFloat(optimization.controlRevenue)
                                      : 0;
                                    const rpv = impressions > 0 ? revenue / impressions : 0;
                                    return (isNaN(rpv) ? 0 : rpv).toFixed(2);
                                  })()}
                                </Text>
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  AOV: $
                                  {(() => {
                                    const conversions = optimization.controlConversions || 0;
                                    const revenue = optimization.controlRevenue
                                      ? parseFloat(optimization.controlRevenue)
                                      : 0;
                                    const aov = conversions > 0 ? revenue / conversions : 0;
                                    return (isNaN(aov) ? 0 : aov).toFixed(2);
                                  })()}
                                </Text>
                              </BlockStack>
                            </BlockStack>
                          </BlockStack>

                          <BlockStack gap="400">
                            <InlineStack gap="200" blockAlign="center">
                              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                              <Text as="p" variant="bodySm" fontWeight="semibold">Variant (New)</Text>
                            </InlineStack>

                            <BlockStack gap="400">
                              <BlockStack gap="200">
                                <Text as="span" variant="bodyXs" tone="subdued">Impressions</Text>
                                <Text as="h2" variant="headingMd" fontWeight="bold" data-testid={`text-variant-impressions-${index}`}>
                                  {(optimization.variantImpressions || 0).toLocaleString()}
                                </Text>
                              </BlockStack>

                              <BlockStack gap="200">
                                <Text as="span" variant="bodyXs" tone="subdued">Conversions</Text>
                                <Text as="h2" variant="headingMd" fontWeight="bold" data-testid={`text-variant-conversions-${index}`}>
                                  {String(optimization.variantConversions || 0)}
                                </Text>
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  {(optimization.variantImpressions || 0) > 0
                                    ? (
                                        ((optimization.variantConversions || 0) /
                                          (optimization.variantImpressions || 1)) *
                                        100
                                      ).toFixed(2)
                                    : "0.00"}
                                  % rate
                                </Text>
                              </BlockStack>

                              <BlockStack gap="200">
                                <Text as="span" variant="bodyXs" tone="subdued">RPV (Revenue Per Visitor)</Text>
                                <Text as="h2" variant="headingMd" fontWeight="bold" tone="success" data-testid={`text-variant-rpv-${index}`}>
                                  $
                                  {(() => {
                                    const impressions = optimization.variantImpressions || 0;
                                    const revenue = optimization.variantRevenue
                                      ? parseFloat(optimization.variantRevenue)
                                      : 0;
                                    const rpv = impressions > 0 ? revenue / impressions : 0;
                                    return (isNaN(rpv) ? 0 : rpv).toFixed(2);
                                  })()}
                                </Text>
                                {(() => {
                                  const controlImpressions = optimization.controlImpressions || 0;
                                  const controlRevenue = optimization.controlRevenue
                                    ? parseFloat(optimization.controlRevenue)
                                    : 0;
                                  const controlRpv =
                                    controlImpressions > 0 ? controlRevenue / controlImpressions : 0;

                                  const variantImpressions = optimization.variantImpressions || 0;
                                  const variantRevenue = optimization.variantRevenue
                                    ? parseFloat(optimization.variantRevenue)
                                    : 0;
                                  const variantRpv =
                                    variantImpressions > 0 ? variantRevenue / variantImpressions : 0;

                                  const lift =
                                    controlRpv > 0
                                      ? ((variantRpv - controlRpv) / controlRpv) * 100
                                      : 0;
                                  const hasData =
                                    (optimization.controlConversions || 0) >= 3 &&
                                    (optimization.variantConversions || 0) >= 3;

                                  return (
                                    hasData && (
                                      <Text
                                        as="p"
                                        variant="bodySm"
                                        fontWeight="semibold"
                                        tone={lift > 0 ? "success" : lift < 0 ? "critical" : "subdued"}
                                      >
                                        {lift >= 0 ? "+" : ""}{lift.toFixed(1)}% vs control
                                      </Text>
                                    )
                                  );
                                })()}
                                <Text as="span" variant="bodyXs" tone="subdued">
                                  AOV: $
                                  {(() => {
                                    const conversions = optimization.variantConversions || 0;
                                    const revenue = optimization.variantRevenue
                                      ? parseFloat(optimization.variantRevenue)
                                      : 0;
                                    const aov = conversions > 0 ? revenue / conversions : 0;
                                    return (isNaN(aov) ? 0 : aov).toFixed(2);
                                  })()}
                                </Text>
                              </BlockStack>
                            </BlockStack>
                          </BlockStack>
                        </InlineGrid>
                      </BlockStack>
                    </Box>
                  </Card>
                );
              })}
            </BlockStack>
          </BlockStack>
        )}

        <Card data-testid="card-info">
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h3" variant="headingSm">About Optimizations</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  This page shows all your A/B optimizations across all statuses - drafts waiting to be activated,
                  live optimizations collecting data, paused optimizations, and completed experiments. Use the filters above
                  to find specific optimizations. Metrics update automatically every 2 seconds.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>Control vs Variant:</strong> Each optimization shows side-by-side
                  performance metrics. The Control represents your original product,
                  while the Variant shows the proposed changes.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>RPV (Revenue Per Visitor):</strong> The primary metric
                  optimized by our smart allocation system. RPV = Total Revenue ÷ Total
                  Impressions. A variant can win with higher RPV even if it has lower
                  AOV, by converting visitors at a higher rate. AOV (Average Order
                  Value) is shown as a secondary metric.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <strong>Stopping an optimization:</strong> Deactivates the optimization and stops
                  showing variants to customers. All collected metrics are preserved
                  for analysis.
                </Text>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
