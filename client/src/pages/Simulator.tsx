import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Play, Users, ShoppingCart, Zap } from "lucide-react";
import type { Test, Product } from "@shared/schema";

interface EnrichedTest extends Test {
  productName: string;
}

export default function Simulator() {
  const { toast } = useToast();
  const [selectedTestId, setSelectedTestId] = useState<string>("");
  
  // Batch simulation parameters
  const [visitors, setVisitors] = useState(1000);
  const [conversionRate, setConversionRate] = useState(3);
  
  // Individual simulation parameters
  const [impressions, setImpressions] = useState(100);
  const [orders, setOrders] = useState(10);

  // Fetch active tests
  const { data: tests = [], isLoading: testsLoading } = useQuery<EnrichedTest[]>({
    queryKey: ["/api/tests", "active"],
    select: (data) => data.filter((t: Test) => t.status === "active"),
  });

  // Fetch all products to enrich test data
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Enrich tests with product names
  const enrichedTests = tests.map((test) => ({
    ...test,
    productName: products.find((p) => p.id === test.productId)?.title || "Unknown Product",
  }));

  // Batch simulation mutation
  const batchSimulation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulate/batch", {
        testId: selectedTestId,
        visitors,
        conversionRate: conversionRate / 100,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Simulation Complete",
        description: `Generated ${data.simulation.visitors} visitors and ${data.simulation.orders} orders (${data.simulation.conversionRate}% CR)`,
      });
      // Refresh test data
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Traffic simulation mutation
  const trafficSimulation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulate/traffic", {
        testId: selectedTestId,
        impressions,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Traffic Simulated",
        description: `Generated ${data.impressions.total} impressions (Control: ${data.impressions.control}, Variant: ${data.impressions.variant})`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Order simulation mutation
  const orderSimulation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulate/orders", {
        testId: selectedTestId,
        orders,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Orders Simulated",
        description: `Generated ${data.orders.total} orders with $${data.revenue} revenue (ARPU: $${data.arpu})`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedTest = enrichedTests.find((t) => t.id === selectedTestId);

  const isSimulating = batchSimulation.isPending || trafficSimulation.isPending || orderSimulation.isPending;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Test Simulator</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Simulate traffic and conversions to verify A/B test allocation and performance tracking
        </p>
      </div>

      {/* Test Selection */}
      <Card data-testid="card-test-selection">
        <CardHeader>
          <CardTitle>Select Active Test</CardTitle>
          <CardDescription>Choose a test to simulate traffic and conversions</CardDescription>
        </CardHeader>
        <CardContent>
          {testsLoading ? (
            <div className="text-sm text-muted-foreground">Loading tests...</div>
          ) : enrichedTests.length === 0 ? (
            <div className="text-sm text-muted-foreground" data-testid="text-no-tests">
              No active tests available. Create and activate a test from the Dashboard first.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-select">Active Test</Label>
                <Select value={selectedTestId} onValueChange={setSelectedTestId}>
                  <SelectTrigger id="test-select" data-testid="select-test">
                    <SelectValue placeholder="Select a test" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrichedTests.map((test) => (
                      <SelectItem key={test.id} value={test.id} data-testid={`option-test-${test.id}`}>
                        {test.productName} - {test.testType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTest && (
                <div className="p-4 bg-muted rounded-lg space-y-2" data-testid="card-test-info">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Product:</span>
                    <span className="text-sm font-medium" data-testid="text-product-name">{selectedTest.productName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Test Type:</span>
                    <span className="text-sm font-medium" data-testid="text-test-type">{selectedTest.testType}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Impressions:</span>
                    <span className="text-sm font-medium" data-testid="text-current-impressions">{selectedTest.impressions || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current Conversions:</span>
                    <span className="text-sm font-medium" data-testid="text-current-conversions">{selectedTest.conversions || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Current ARPU:</span>
                    <span className="text-sm font-medium" data-testid="text-current-arpu">${selectedTest.arpu || "0.00"}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Simulation - Easy Mode */}
      <Card data-testid="card-batch-simulation">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <CardTitle>Batch Simulation</CardTitle>
          </div>
          <CardDescription>
            Simulate realistic traffic and conversions in one click. Perfect for validating A/B test allocation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="visitors">Visitors</Label>
                <Input
                  id="visitors"
                  type="number"
                  value={visitors}
                  onChange={(e) => setVisitors(Number(e.target.value))}
                  min={10}
                  max={100000}
                  data-testid="input-visitors"
                />
                <p className="text-xs text-muted-foreground">
                  Number of product page views (split 50/50 between control and variant)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="conversion-rate">Conversion Rate (%)</Label>
                <Input
                  id="conversion-rate"
                  type="number"
                  value={conversionRate}
                  onChange={(e) => setConversionRate(Number(e.target.value))}
                  min={0}
                  max={100}
                  step={0.1}
                  data-testid="input-conversion-rate"
                />
                <p className="text-xs text-muted-foreground">
                  Percentage of visitors who make a purchase
                </p>
              </div>
            </div>

            <Button
              onClick={() => batchSimulation.mutate()}
              disabled={!selectedTestId || isSimulating}
              className="w-full gap-2"
              data-testid="button-run-batch"
            >
              <Play className="w-4 h-4" />
              {batchSimulation.isPending ? "Simulating..." : "Run Batch Simulation"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Simulation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Traffic Simulation */}
        <Card data-testid="card-traffic-simulation">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-chart-1" />
              <CardTitle>Traffic Simulation</CardTitle>
            </div>
            <CardDescription>Simulate product page impressions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="impressions">Impressions</Label>
                <Input
                  id="impressions"
                  type="number"
                  value={impressions}
                  onChange={(e) => setImpressions(Number(e.target.value))}
                  min={1}
                  max={10000}
                  data-testid="input-impressions"
                />
                <p className="text-xs text-muted-foreground">
                  Number of product page views to simulate
                </p>
              </div>

              <Button
                onClick={() => trafficSimulation.mutate()}
                disabled={!selectedTestId || isSimulating}
                className="w-full gap-2"
                variant="outline"
                data-testid="button-simulate-traffic"
              >
                <Users className="w-4 h-4" />
                {trafficSimulation.isPending ? "Simulating..." : "Simulate Traffic"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Order Simulation */}
        <Card data-testid="card-order-simulation">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-chart-2" />
              <CardTitle>Order Simulation</CardTitle>
            </div>
            <CardDescription>Simulate conversions and revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orders">Orders</Label>
                <Input
                  id="orders"
                  type="number"
                  value={orders}
                  onChange={(e) => setOrders(Number(e.target.value))}
                  min={1}
                  max={1000}
                  data-testid="input-orders"
                />
                <p className="text-xs text-muted-foreground">
                  Number of purchase orders to simulate
                </p>
              </div>

              <Button
                onClick={() => orderSimulation.mutate()}
                disabled={!selectedTestId || isSimulating}
                className="w-full gap-2"
                variant="outline"
                data-testid="button-simulate-orders"
              >
                <ShoppingCart className="w-4 h-4" />
                {orderSimulation.isPending ? "Simulating..." : "Simulate Orders"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Information Card */}
      <Card data-testid="card-info">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Batch Simulation:</strong> Generates realistic traffic and conversions in one step. 
            Visitors are split 50/50 between control and variant, and conversions are calculated based on your specified rate.
          </p>
          <p>
            <strong>Traffic Simulation:</strong> Adds product page impressions to verify allocation tracking. 
            Useful for calculating conversion rates and ensuring the 50/50 split is maintained.
          </p>
          <p>
            <strong>Order Simulation:</strong> Creates purchase conversions with realistic revenue variance (±20%). 
            Updates test metrics including conversions, revenue, and ARPU.
          </p>
          <p>
            <strong>Allocation Verification:</strong> All simulations use 50/50 allocation between control and variant. 
            Monitor the dashboard metrics to confirm proper distribution.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
