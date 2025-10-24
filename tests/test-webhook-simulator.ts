/**
 * Webhook Simulator for Testing Conversion Attribution
 * 
 * Simulates Shopify ORDERS_CREATE webhook payloads with session IDs
 * to verify the complete attribution pipeline works correctly.
 */

import { IStorage } from '../server/storage';

interface SimulatedOrder {
  sessionId: string;
  productId: string;
  price: number;
  quantity: number;
  expectedVariant: 'control' | 'variant';
}

/**
 * Creates a realistic Shopify order webhook payload
 */
function createShopifyOrderPayload(order: SimulatedOrder) {
  return {
    id: Math.floor(Math.random() * 10000000),
    email: `customer-${Date.now()}@example.com`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_price: (order.price * order.quantity).toString(),
    subtotal_price: (order.price * order.quantity).toString(),
    currency: 'USD',
    financial_status: 'paid',
    fulfillment_status: null,
    line_items: [
      {
        id: Math.floor(Math.random() * 10000000),
        product_id: order.productId.replace('gid://shopify/Product/', ''),
        title: 'Test Product',
        quantity: order.quantity,
        price: order.price.toString(),
        sku: `SKU-${Date.now()}`,
        variant_id: Math.floor(Math.random() * 10000000),
        variant_title: 'Default',
        vendor: 'Test Vendor',
        fulfillment_service: 'manual',
        requires_shipping: true,
        taxable: true,
        gift_card: false,
        properties: []
      }
    ],
    note_attributes: [
      {
        name: '_shoptimizer_session',
        value: order.sessionId
      }
    ],
    customer: {
      id: Math.floor(Math.random() * 10000000),
      email: `customer-${Date.now()}@example.com`,
      first_name: 'Test',
      last_name: 'Customer'
    }
  };
}

/**
 * Simulates the webhook handler logic
 */
async function processWebhook(storage: IStorage, shop: string, payload: any): Promise<{
  success: boolean;
  sessionId?: string;
  variant?: string;
  revenue?: number;
  error?: string;
}> {
  try {
    // Extract product IDs from line items
    const shopifyProductIds = (payload.line_items || []).map((item: any) => 
      `gid://shopify/Product/${item.product_id}`
    );
    
    if (shopifyProductIds.length === 0) {
      return { success: false, error: 'No line items in order' };
    }
    
    // Find matching products
    const allProducts = await storage.getProducts(shop);
    const orderedProducts = allProducts.filter(p => 
      shopifyProductIds.includes(p.shopifyProductId)
    );
    
    if (orderedProducts.length === 0) {
      return { success: false, error: 'No matching products found' };
    }
    
    // Extract session ID
    const cartAttributes = payload.note_attributes || [];
    const sessionAttribute = cartAttributes.find((attr: any) => 
      attr.name === '_shoptimizer_session'
    );
    
    const sessionId = sessionAttribute?.value;
    
    if (!sessionId) {
      return { success: false, error: 'No session ID in order attributes' };
    }
    
    // Fetch session assignments
    const sessionAssignments = await storage.getSessionAssignments(shop, sessionId);
    
    if (sessionAssignments.length === 0) {
      return { success: false, error: 'No variant assignments for session' };
    }
    
    // Create assignment map
    const assignmentMap = new Map(
      sessionAssignments.map(a => [a.testId, a.variant])
    );
    
    // Process each product
    for (const product of orderedProducts) {
      const activeTests = await storage.getTestsByProduct(shop, product.id);
      const activeTest = activeTests.find(t => t.status === "active");
      
      // Debug logging
      if (activeTests.length === 0) {
        console.error(`[Debug] No tests found for product ${product.id}`);
      } else if (!activeTest) {
        console.error(`[Debug] Found ${activeTests.length} tests for product but none active`);
      }
      
      if (activeTest) {
        const lineItem = payload.line_items.find((item: any) => 
          `gid://shopify/Product/${item.product_id}` === product.shopifyProductId
        );
        
        if (lineItem) {
          const revenue = parseFloat(lineItem.price) * lineItem.quantity;
          const variant = assignmentMap.get(activeTest.id);
          
          if (!variant) {
            continue; // Skip if no assignment for this test
          }
          
          // Update metrics
          const updates: any = {
            conversions: (activeTest.conversions || 0) + lineItem.quantity,
            revenue: (parseFloat(activeTest.revenue || "0") + revenue).toString(),
          };
          
          if (variant === 'control') {
            updates.controlConversions = (activeTest.controlConversions || 0) + lineItem.quantity;
            updates.controlRevenue = (parseFloat(activeTest.controlRevenue || "0") + revenue).toString();
          } else {
            updates.variantConversions = (activeTest.variantConversions || 0) + lineItem.quantity;
            updates.variantRevenue = (parseFloat(activeTest.variantRevenue || "0") + revenue).toString();
          }
          
          const newConversions = updates.conversions;
          const newRevenue = parseFloat(updates.revenue);
          updates.arpu = (newRevenue / newConversions).toString();
          
          await storage.updateTest(shop, activeTest.id, updates);
          
          return {
            success: true,
            sessionId,
            variant,
            revenue
          };
        }
      }
    }
    
    return { success: false, error: 'No active tests found for products' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Run webhook simulation tests
 */
export async function runWebhookTests(storage: IStorage, shop: string) {
  console.log('\n=== Starting Webhook Simulation Tests ===\n');
  
  const testResults = {
    passed: 0,
    failed: 0,
    tests: [] as Array<{ name: string; status: 'PASS' | 'FAIL'; message?: string }>
  };

  function recordTest(name: string, passed: boolean, message?: string) {
    testResults.tests.push({
      name,
      status: passed ? 'PASS' : 'FAIL',
      message
    });
    if (passed) testResults.passed++;
    else testResults.failed++;
  }

  try {
    // Setup test data
    console.log('Setting up test data...\n');
    
    const productId = `webhook-test-product-${Date.now()}`;
    const shopifyProductId = `gid://shopify/Product/${productId}`;
    
    await storage.createProduct(shop, {
      id: productId,
      shopifyProductId,
      title: 'Webhook Test Product',
      description: 'Test product for webhook simulation',
      price: '99.99',
      imageUrl: null
    });
    
    const testId = `webhook-test-${Date.now()}`;
    await storage.createTest(shop, {
      id: testId,
      productId,
      status: 'active',
      testType: 'title',
      controlData: { title: 'Original Title' },
      variantData: { title: 'Optimized Title' },
      impressions: 100,
      conversions: 0,
      controlConversions: 0,
      variantConversions: 0,
      revenue: '0',
      controlRevenue: '0',
      variantRevenue: '0',
      arpu: '0',
      scope: 'product',
      allocationStrategy: 'fixed',
      controlAllocation: 50,
      variantAllocation: 50,
      confidenceThreshold: 95,
      minSampleSize: 100
    });
    
    console.log(`Created product: ${productId}`);
    console.log(`Created test: ${testId}\n`);
    
    // Test 1: Control variant attribution
    console.log('Test 1: Webhook with control variant');
    const session1 = `webhook-session-${Date.now()}-control`;
    await storage.createSessionAssignment(shop, {
      sessionId: session1,
      testId,
      variant: 'control',
      timestamp: new Date()
    });
    
    const order1 = createShopifyOrderPayload({
      sessionId: session1,
      productId: shopifyProductId,
      price: 99.99,
      quantity: 1,
      expectedVariant: 'control'
    });
    
    const result1 = await processWebhook(storage, shop, order1);
    recordTest(
      'Control variant attribution',
      result1.success && result1.variant === 'control' && result1.revenue === 99.99,
      result1.success 
        ? `Attributed to ${result1.variant} ($${result1.revenue})`
        : `Failed: ${result1.error}`
    );
    console.log(result1.success 
      ? `✓ Attributed to ${result1.variant} ($${result1.revenue})\n`
      : `✗ Failed: ${result1.error}\n`
    );
    
    // Test 2: Variant attribution
    console.log('Test 2: Webhook with variant');
    const session2 = `webhook-session-${Date.now()}-variant`;
    await storage.createSessionAssignment(shop, {
      sessionId: session2,
      testId,
      variant: 'variant',
      timestamp: new Date()
    });
    
    const order2 = createShopifyOrderPayload({
      sessionId: session2,
      productId: shopifyProductId,
      price: 99.99,
      quantity: 2,
      expectedVariant: 'variant'
    });
    
    const result2 = await processWebhook(storage, shop, order2);
    recordTest(
      'Variant attribution',
      result2.success && result2.variant === 'variant' && result2.revenue === 199.98,
      result2.success 
        ? `Attributed to ${result2.variant} ($${result2.revenue})`
        : `Failed: ${result2.error}`
    );
    console.log(result2.success 
      ? `✓ Attributed to ${result2.variant} ($${result2.revenue})\n`
      : `✗ Failed: ${result2.error}\n`
    );
    
    // Test 3: Verify final metrics
    console.log('Test 3: Verify aggregated metrics');
    const finalTest = await storage.getTest(shop, testId);
    
    if (!finalTest) {
      recordTest('Aggregated metrics verification', false, 'Test not found');
      console.log('✗ Test not found\n');
    } else {
      const expectedConversions = 3; // 1 control + 2 variant
      const expectedRevenue = 299.97; // 99.99 + 199.98
      const expectedArpu = expectedRevenue / expectedConversions;
      
      const metricsCorrect = 
        finalTest.conversions === expectedConversions &&
        Math.abs(parseFloat(finalTest.revenue || "0") - expectedRevenue) < 0.01 &&
        Math.abs(parseFloat(finalTest.arpu || "0") - expectedArpu) < 0.01 &&
        finalTest.controlConversions === 1 &&
        finalTest.variantConversions === 2;
      
      recordTest(
        'Aggregated metrics verification',
        metricsCorrect,
        metricsCorrect
          ? `Conversions: ${finalTest.conversions}, Revenue: $${finalTest.revenue}, ARPU: $${finalTest.arpu}`
          : `Metrics mismatch - Expected conv:${expectedConversions} rev:${expectedRevenue}, Got conv:${finalTest.conversions} rev:${finalTest.revenue}`
      );
      
      if (metricsCorrect) {
        console.log(`✓ Metrics: Conv=${finalTest.conversions}, Rev=$${finalTest.revenue}, ARPU=$${finalTest.arpu}\n`);
        console.log(`  Control: ${finalTest.controlConversions} conversions, $${finalTest.controlRevenue}`);
        console.log(`  Variant: ${finalTest.variantConversions} conversions, $${finalTest.variantRevenue}\n`);
      } else {
        console.log(`✗ Metrics don't match expected values\n`);
      }
    }
    
    // Test 4: Order without session ID
    console.log('Test 4: Order without session ID (graceful handling)');
    const order3 = {
      ...createShopifyOrderPayload({
        sessionId: '',
        productId: shopifyProductId,
        price: 99.99,
        quantity: 1,
        expectedVariant: 'control'
      }),
      note_attributes: [] // Remove session ID
    };
    
    const result3 = await processWebhook(storage, shop, order3);
    const gracefulFailure = !result3.success && result3.error === 'No session ID in order attributes';
    
    recordTest(
      'Graceful handling of missing session ID',
      gracefulFailure,
      gracefulFailure
        ? 'Correctly rejected order without session ID'
        : `Unexpected result: ${result3.error || 'Success when should fail'}`
    );
    console.log(gracefulFailure
      ? `✓ Correctly rejected: ${result3.error}\n`
      : `✗ Should have rejected but got: ${result3.error || 'success'}\n`
    );
    
  } catch (error) {
    console.error('Fatal error in webhook simulation:', error);
  }
  
  // Print summary
  console.log('\n=== Webhook Test Results Summary ===\n');
  testResults.tests.forEach(test => {
    const icon = test.status === 'PASS' ? '✓' : '✗';
    console.log(`${icon} ${test.name}: ${test.status}`);
    if (test.message) {
      console.log(`   ${test.message}`);
    }
  });
  
  console.log(`\nPassed: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`Failed: ${testResults.failed}/${testResults.tests.length}`);
  
  const allPassed = testResults.failed === 0;
  console.log(`\nOverall: ${allPassed ? '✓ ALL WEBHOOK TESTS PASSED' : '✗ SOME TESTS FAILED'}\n`);
  
  return allPassed;
}
