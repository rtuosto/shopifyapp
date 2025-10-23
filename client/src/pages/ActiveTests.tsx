import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StopCircle, TrendingUp, Eye, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { Test, Product } from "@shared/schema";

interface EnrichedTest extends Test {
  productName: string;
}

export default function ActiveTests() {
  const { toast } = useToast();
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Fetch all tests
  const { data: tests = [] } = useQuery<Test[]>({
    queryKey: ["/api/tests"],
  });

  // Fetch all products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Filter active tests and enrich with product names
  const activeTests: EnrichedTest[] = tests
    .filter((t: Test) => t.status === "active")
    .map((test: Test) => ({
      ...test,
      productName: products.find((p: Product) => p.id === test.productId)?.title || "Unknown Product",
    }));

  // Auto-refresh every 2 seconds
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled]);

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

  // Calculate summary metrics
  const totalImpressions = activeTests.reduce((sum, t) => sum + (t.impressions || 0), 0);
  const totalConversions = activeTests.reduce((sum, t) => sum + (t.conversions || 0), 0);
  const totalRevenue = activeTests.reduce((sum, t) => sum + parseFloat(t.revenue || "0"), 0);
  const averageArpu = totalConversions > 0 ? totalRevenue / totalConversions : 0;
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
            Monitor live A/B tests and track real-time performance
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

          <Card data-testid="card-metric-arpu">
            <CardHeader className="pb-3">
              <CardDescription>Average ARPU</CardDescription>
              <CardTitle className="text-3xl">${averageArpu.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Revenue per user</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Tests List */}
      {activeTests.length === 0 ? (
        <Card data-testid="card-no-tests">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">No Active Tests</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Accept an AI recommendation from the Dashboard to launch your first A/B test
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
              const hasSignificantData = conversions >= 5; // Arbitrary threshold for "significant"
              
              return (
                <Card key={test.id} data-testid={`card-test-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg" data-testid={`text-product-name-${index}`}>
                            {test.productName}
                          </CardTitle>
                          <Badge variant="default" data-testid={`badge-status-${index}`}>
                            Live
                          </Badge>
                        </div>
                        <CardDescription data-testid={`text-test-type-${index}`}>
                          {test.testType} Test
                        </CardDescription>
                      </div>
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
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {/* Impressions */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Impressions</p>
                        <p className="text-2xl font-bold" data-testid={`text-impressions-${index}`}>
                          {(test.impressions || 0).toLocaleString()}
                        </p>
                      </div>

                      {/* Conversions */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Conversions</p>
                        <p className="text-2xl font-bold" data-testid={`text-conversions-${index}`}>
                          {test.conversions || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conversionRate.toFixed(2)}% rate
                        </p>
                      </div>

                      {/* Revenue */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-2xl font-bold" data-testid={`text-revenue-${index}`}>
                          ${parseFloat(test.revenue || "0").toFixed(2)}
                        </p>
                      </div>

                      {/* ARPU */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">ARPU</p>
                        <p className="text-2xl font-bold" data-testid={`text-arpu-${index}`}>
                          ${parseFloat(test.arpu || "0").toFixed(2)}
                        </p>
                      </div>

                      {/* ARPU Lift */}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">ARPU Lift</p>
                        <div className="flex items-center gap-1">
                          <p className={`text-2xl font-bold ${arpuLift > 0 ? 'text-chart-4' : arpuLift < 0 ? 'text-destructive' : ''}`} data-testid={`text-arpu-lift-${index}`}>
                            {formatPercentage(arpuLift)}
                          </p>
                          {arpuLift > 0 && <ArrowUpRight className="w-5 h-5 text-chart-4" />}
                          {arpuLift < 0 && <ArrowDownRight className="w-5 h-5 text-destructive" />}
                        </div>
                        {!hasSignificantData && (
                          <p className="text-xs text-yellow-600">Low sample size</p>
                        )}
                      </div>
                    </div>

                    {/* Start Date */}
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Started: {test.startDate ? new Date(test.startDate).toLocaleString() : 'Unknown'}
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
          <CardTitle>About Active Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            This page shows all live A/B tests currently running in your Shopify store. 
            Metrics update automatically every 2 seconds.
          </p>
          <p>
            <strong>ARPU Lift:</strong> Measures the percentage increase in Average Revenue Per User compared to the control group. 
            Positive values indicate the variant is performing better.
          </p>
          <p>
            <strong>Stopping a test:</strong> Deactivates the test and restores the original product values in your store.
            All collected metrics are preserved for analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
