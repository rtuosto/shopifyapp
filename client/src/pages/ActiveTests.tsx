import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StopCircle, TrendingUp, Eye, ArrowUpRight, ArrowDownRight, Play } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { Test, Product, TestEvolutionSnapshot } from "@shared/schema";

interface EnrichedTest extends Test {
  productName: string;
}

interface TestEvolutionChartsProps {
  testId: string;
}

function TestEvolutionCharts({ testId }: TestEvolutionChartsProps) {
  const { data: snapshots = [], isLoading } = useQuery<TestEvolutionSnapshot[]>({
    queryKey: ["/api/tests", testId, "evolution"],
    queryFn: async () => {
      const res = await fetch(`/api/tests/${testId}/evolution`);
      if (!res.ok) throw new Error("Failed to fetch evolution data");
      return res.json();
    },
  });

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
      <div className="p-4 border rounded-lg space-y-3" data-testid={`chart-rpv-evolution-${testId}`}>
        <div>
          <div className="text-sm font-medium">RPV Evolution Over Time</div>
          <p className="text-xs text-muted-foreground">
            Cumulative revenue per visitor tracked at 100-impression intervals
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="impressions" 
              label={{ value: 'Total Test Impressions', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              label={{ value: 'RPV ($)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              formatter={(value: number) => `$${value.toFixed(2)}`}
              labelFormatter={(label) => `${label} impressions`}
            />
            <Legend />
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
      <div className="p-4 border rounded-lg space-y-3" data-testid={`chart-allocation-evolution-${testId}`}>
        <div>
          <div className="text-sm font-medium">Traffic Allocation Evolution</div>
          <p className="text-xs text-muted-foreground">
            Cumulative traffic split adjustments tracked at 100-impression intervals
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="impressions" 
              label={{ value: 'Total Test Impressions', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              label={{ value: 'Allocation (%)', angle: -90, position: 'insideLeft' }}
              domain={[0, 100]}
            />
            <Tooltip 
              formatter={(value: number) => `${value.toFixed(1)}%`}
              labelFormatter={(label) => `${label} impressions`}
            />
            <Legend />
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

export default function ActiveTests() {
  const { toast } = useToast();
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Fetch all tests with auto-refresh using refetchInterval
  const { data: tests = [], isLoading: testsLoading } = useQuery<Test[]>({
    queryKey: ["/api/tests"],
    refetchInterval: autoRefreshEnabled ? 2000 : false,
  });

  // Fetch all products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Filter active and draft tests and enrich with product names
  const activeTests: EnrichedTest[] = tests
    .filter((t: Test) => t.status === "active" || t.status === "draft")
    .map((test: Test) => ({
      ...test,
      productName: products.find((p: Product) => p.id === test.productId)?.title || "Unknown Product",
    }));

  // Activate test mutation
  const activateTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      const res = await apiRequest("POST", `/api/tests/${testId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Activated",
        description: "Test is now live and collecting data",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate test",
        variant: "destructive",
      });
    },
  });

  // Deactivate test mutation
  const deactivateTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      const res = await apiRequest("POST", `/api/tests/${testId}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Stopped",
        description: "Test has been deactivated and original values restored",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to stop test",
        variant: "destructive",
      });
    },
  });

  // Calculate summary metrics with safe parsing
  // Parse bigint fields as numbers (they come from DB as strings)
  const totalImpressions = activeTests.reduce((sum, t) => sum + (Number(t.impressions) || 0), 0);
  const totalConversions = activeTests.reduce((sum, t) => sum + (Number(t.conversions) || 0), 0);
  const totalRevenue = activeTests.reduce((sum, t) => {
    const revenue = t.revenue ? parseFloat(t.revenue) : 0;
    return sum + (isNaN(revenue) ? 0 : revenue);
  }, 0);
  const averageRpv = totalImpressions > 0 ? totalRevenue / totalImpressions : 0;
  const averageConversionRate = totalImpressions > 0 ? (totalConversions / totalImpressions) * 100 : 0;

  const formatPercentage = (value: number) => {
    return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Active Tests</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Activate draft tests and monitor live A/B test performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
            <div className={`w-2 h-2 rounded-full ${autoRefreshEnabled ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
            <span className="text-muted-foreground">
              {autoRefreshEnabled ? "Live" : "Paused"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            data-testid="button-toggle-auto-refresh"
          >
            {autoRefreshEnabled ? "Pause Updates" : "Resume Updates"}
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      {activeTests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-metric-tests">
            <CardHeader className="pb-3">
              <CardDescription>Active Tests</CardDescription>
              <CardTitle className="text-3xl">{activeTests.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Running experiments</p>
            </CardContent>
          </Card>

          <Card data-testid="card-metric-impressions">
            <CardHeader className="pb-3">
              <CardDescription>Total Impressions</CardDescription>
              <CardTitle className="text-3xl">{totalImpressions.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Product page views</p>
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
              <CardTitle className="text-3xl">${averageRpv.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Revenue per visitor</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Tests List */}
      {testsLoading ? (
        <Card data-testid="card-loading">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">Loading active tests...</p>
            </div>
          </CardContent>
        </Card>
      ) : activeTests.length === 0 ? (
        <Card data-testid="card-no-tests">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">No Tests Yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Create a test from an AI recommendation to get started
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold" data-testid="text-tests-heading">Running Tests</h2>
          <div className="grid grid-cols-1 gap-4">
            {activeTests.map((test, index) => {
              const impressions = test.impressions || 0;
              const conversions = test.conversions || 0;
              const conversionRate = impressions > 0 ? (conversions / impressions) * 100 : 0;
              const arpuLift = parseFloat(test.arpuLift || "0");
              
              // 2-State Badge System: "Still Learning" vs "Ready to Decide"
              // All tests now use Bayesian allocation - check if we have sufficient data per variant
              const hasSufficientData = impressions >= 2000 && // Matches Bayesian promotion criteria
                (test.controlConversions || 0) >= 30 && // Control has meaningful data
                (test.variantConversions || 0) >= 30;   // Variant has meaningful data
              
              // Check if we have a clear winner (probability >80% or <20%)
              const CONFIDENCE_THRESHOLD = 0.80;
              let hasClearWinner = false;
              if (test.bayesianConfig && typeof test.bayesianConfig === 'object') {
                const config = test.bayesianConfig as any;
                const prob = config.probVariantBetter || 0.5;
                hasClearWinner = prob > CONFIDENCE_THRESHOLD || prob < (1 - CONFIDENCE_THRESHOLD);
              }
              
              // Badge: "Ready to Decide" only if BOTH sufficient data AND clear winner
              const isReadyToDecide = hasSufficientData && hasClearWinner;
              
              return (
                <Card key={test.id} data-testid={`card-test-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg" data-testid={`text-product-name-${index}`}>
                            {test.productName}
                          </CardTitle>
                          <Badge 
                            variant={test.status === "draft" ? "secondary" : "default"} 
                            data-testid={`badge-status-${index}`}
                          >
                            {test.status === "draft" ? "Draft" : "Live"}
                          </Badge>
                        </div>
                        <CardDescription data-testid={`text-test-type-${index}`}>
                          {test.testType} Test
                        </CardDescription>
                      </div>
                      {test.status === "draft" ? (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => activateTestMutation.mutate(test.id)}
                          disabled={activateTestMutation.isPending}
                          data-testid={`button-activate-test-${index}`}
                          className="gap-1"
                        >
                          <Play className="w-4 h-4" />
                          {activateTestMutation.isPending ? "Activating..." : "Activate Test"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deactivateTestMutation.mutate(test.id)}
                          disabled={deactivateTestMutation.isPending}
                          data-testid={`button-stop-test-${index}`}
                          className="gap-1"
                        >
                          <StopCircle className="w-4 h-4" />
                          Stop Test
                        </Button>
                      )}
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
                            <p className="text-xs text-muted-foreground">Impressions</p>
                            <p className="text-xl font-bold" data-testid={`text-control-impressions-${index}`}>
                              {(test.controlImpressions || 0).toLocaleString()}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-muted-foreground">Conversions</p>
                            <p className="text-xl font-bold" data-testid={`text-control-conversions-${index}`}>
                              {test.controlConversions || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(test.controlImpressions || 0) > 0 
                                ? (((test.controlConversions || 0) / (test.controlImpressions || 1)) * 100).toFixed(2)
                                : '0.00'}% rate
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-muted-foreground">Revenue</p>
                            <p className="text-xl font-bold" data-testid={`text-control-revenue-${index}`}>
                              ${(() => {
                                const rev = test.controlRevenue ? parseFloat(test.controlRevenue) : 0;
                                return (isNaN(rev) ? 0 : rev).toFixed(2);
                              })()}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-muted-foreground">RPV (Revenue Per Visitor)</p>
                            <p className="text-xl font-bold" data-testid={`text-control-rpv-${index}`}>
                              ${(() => {
                                const impressions = test.controlImpressions || 0;
                                const revenue = test.controlRevenue ? parseFloat(test.controlRevenue) : 0;
                                const rpv = impressions > 0 ? revenue / impressions : 0;
                                return (isNaN(rpv) ? 0 : rpv).toFixed(2);
                              })()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              AOV: ${(() => {
                                const conversions = test.controlConversions || 0;
                                const revenue = test.controlRevenue ? parseFloat(test.controlRevenue) : 0;
                                const aov = conversions > 0 ? revenue / conversions : 0;
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
                            <p className="text-xs text-muted-foreground">Impressions</p>
                            <p className="text-xl font-bold" data-testid={`text-variant-impressions-${index}`}>
                              {(test.variantImpressions || 0).toLocaleString()}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-muted-foreground">Conversions</p>
                            <p className="text-xl font-bold" data-testid={`text-variant-conversions-${index}`}>
                              {test.variantConversions || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(test.variantImpressions || 0) > 0 
                                ? (((test.variantConversions || 0) / (test.variantImpressions || 1)) * 100).toFixed(2)
                                : '0.00'}% rate
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-muted-foreground">Revenue</p>
                            <p className="text-xl font-bold" data-testid={`text-variant-revenue-${index}`}>
                              ${(() => {
                                const rev = test.variantRevenue ? parseFloat(test.variantRevenue) : 0;
                                return (isNaN(rev) ? 0 : rev).toFixed(2);
                              })()}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-xs text-muted-foreground">RPV (Revenue Per Visitor)</p>
                            <p className="text-xl font-bold text-green-600" data-testid={`text-variant-rpv-${index}`}>
                              ${(() => {
                                const impressions = test.variantImpressions || 0;
                                const revenue = test.variantRevenue ? parseFloat(test.variantRevenue) : 0;
                                const rpv = impressions > 0 ? revenue / impressions : 0;
                                return (isNaN(rpv) ? 0 : rpv).toFixed(2);
                              })()}
                            </p>
                            {(() => {
                              // Calculate RPV lift (what Bayesian optimizes)
                              const controlImpressions = test.controlImpressions || 0;
                              const controlRevenue = test.controlRevenue ? parseFloat(test.controlRevenue) : 0;
                              const controlRpv = controlImpressions > 0 ? controlRevenue / controlImpressions : 0;
                              
                              const variantImpressions = test.variantImpressions || 0;
                              const variantRevenue = test.variantRevenue ? parseFloat(test.variantRevenue) : 0;
                              const variantRpv = variantImpressions > 0 ? variantRevenue / variantImpressions : 0;
                              
                              const lift = controlRpv > 0 ? ((variantRpv - controlRpv) / controlRpv) * 100 : 0;
                              const hasData = (test.controlConversions || 0) >= 3 && (test.variantConversions || 0) >= 3;
                              
                              return hasData && (
                                <div className="flex items-center gap-1 mt-1">
                                  <p className={`text-sm font-semibold ${lift > 0 ? 'text-green-600' : lift < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                    {lift >= 0 ? '+' : ''}{lift.toFixed(1)}% vs control
                                  </p>
                                  {lift > 0 && <ArrowUpRight className="w-4 h-4 text-green-600" />}
                                  {lift < 0 && <ArrowDownRight className="w-4 h-4 text-red-600" />}
                                </div>
                              );
                            })()}
                            <p className="text-xs text-muted-foreground">
                              AOV: ${(() => {
                                const conversions = test.variantConversions || 0;
                                const revenue = test.variantRevenue ? parseFloat(test.variantRevenue) : 0;
                                const aov = conversions > 0 ? revenue / conversions : 0;
                                return (isNaN(aov) ? 0 : aov).toFixed(2);
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bayesian Metrics (all tests use Bayesian allocation) */}
                    <div className="mt-6 pt-6 border-t space-y-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">Dynamic Traffic Allocation</h3>
                        <Badge variant="secondary" className="text-xs">Bayesian</Badge>
                      </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Actual Traffic Distribution */}
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Actual Traffic Distribution</p>
                            <div className="space-y-1">
                              {(() => {
                                const totalImpressions = (test.controlImpressions || 0) + (test.variantImpressions || 0);
                                const controlPct = totalImpressions > 0 
                                  ? ((test.controlImpressions || 0) / totalImpressions * 100).toFixed(1)
                                  : '0.0';
                                const variantPct = totalImpressions > 0
                                  ? ((test.variantImpressions || 0) / totalImpressions * 100).toFixed(1)
                                  : '0.0';
                                
                                return (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">Control:</span>
                                      <span className="text-sm font-bold">{controlPct}%</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">Variant:</span>
                                      <span className="text-sm font-bold text-green-600">{variantPct}%</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mt-2">
                                      <div 
                                        className="bg-blue-500 h-full transition-all duration-500"
                                        style={{ width: `${controlPct}%` }}
                                      />
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Bayesian Metrics */}
                          {test.bayesianConfig && typeof test.bayesianConfig === 'object' && (
                            <>
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">Variant Win Probability</p>
                                <p className="text-2xl font-bold text-primary">
                                  {(() => {
                                    const config = test.bayesianConfig as any;
                                    const prob = config.probVariantBetter || 0.5;
                                    return (prob * 100).toFixed(1);
                                  })()}%
                                </p>
                              </div>

                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">Expected Loss (per 1K)</p>
                                <p className="text-2xl font-bold">
                                  ${(() => {
                                    const config = test.bayesianConfig as any;
                                    const eoc = config.expectedOpportunityCost || 0;
                                    return eoc.toFixed(2);
                                  })()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {(() => {
                                    const config = test.bayesianConfig as any;
                                    const budget = config.safetyBudget || 50;
                                    const eoc = config.expectedOpportunityCost || 0;
                                    const remaining = Math.max(0, budget - eoc);
                                    return `${remaining.toFixed(0)} of ${budget} budget left`;
                                  })()}
                                </p>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Promotion Status */}
                        {test.bayesianConfig && typeof test.bayesianConfig === 'object' && (() => {
                          const config = test.bayesianConfig as any;
                          const prob = config.probVariantBetter || 0.5;
                          const totalSessions = (test.controlImpressions || 0) + (test.variantImpressions || 0);
                          const shouldPromote = prob > 0.95 && totalSessions >= 2000;
                          
                          return shouldPromote && (
                            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                              <TrendingUp className="w-5 h-5 text-green-600" />
                              <p className="text-sm text-green-700 dark:text-green-300 font-semibold">
                                Ready for promotion - Variant significantly outperforms control
                              </p>
                            </div>
                          );
                        })()}
                      </div>

                    {/* Evolution Charts */}
                    <TestEvolutionCharts testId={test.id} />

                    {/* Start Date and Status Badge */}
                    <div className="mt-6 pt-4 border-t flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Started: {test.startDate ? new Date(test.startDate).toLocaleString() : 'Unknown'}
                      </div>
                      {isReadyToDecide ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          ✓ Ready to Decide
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                          ⏱ Still Learning
                        </Badge>
                      )}
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
          <CardTitle>About Active Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This page shows all live A/B tests currently running in your Shopify store. 
            Metrics update automatically every 2 seconds.
          </p>
          <p>
            <strong>Control vs Variant:</strong> Each test shows side-by-side performance metrics. 
            The Control represents your original product, while the Variant shows the proposed changes.
          </p>
          <p>
            <strong>RPV (Revenue Per Visitor):</strong> The primary metric optimized by our Bayesian engine. 
            RPV = Total Revenue ÷ Total Impressions. A variant can win with higher RPV even if it has lower AOV, 
            by converting visitors at a higher rate. AOV (Average Order Value) is shown as a secondary metric.
          </p>
          <p>
            <strong>Stopping a test:</strong> Deactivates the test and stops showing variants to customers.
            All collected metrics are preserved for analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
