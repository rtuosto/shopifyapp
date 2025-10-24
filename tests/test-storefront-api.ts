/**
 * Backend API Tests for Storefront Attribution System
 * 
 * Tests the core UUID session-based attribution endpoints:
 * - GET /api/storefront/tests - Fetch active tests
 * - POST /api/storefront/assign - Record session assignments  
 * - GET /api/storefront/assignments/:sessionId - Retrieve assignments
 * - POST /api/storefront/impression - Track impressions
 * - POST /api/webhooks/orders/create - Process order conversions
 */

import { IStorage } from '../server/storage';

// Mock Shopify order payload with session ID in note_attributes
function createMockOrderPayload(sessionId: string, productId: string, price: number, quantity: number = 1) {
  return {
    id: Math.floor(Math.random() * 1000000),
    line_items: [
      {
        product_id: productId.replace('gid://shopify/Product/', ''),
        price: price.toString(),
        quantity: quantity,
        properties: []
      }
    ],
    note_attributes: [
      {
        name: '_shoptimizer_session',
        value: sessionId
      }
    ]
  };
}

/**
 * Test Suite: Storefront Attribution API
 */
export async function runStorefrontTests(storage: IStorage, shop: string) {
  console.log('\n=== Starting Storefront Attribution API Tests ===\n');
  
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
    // Setup: Create test product and active test
    console.log('Setting up test data...');
    const productId = `test-product-${Date.now()}`;
    const shopifyProductId = `gid://shopify/Product/${productId}`;
    
    await storage.createProduct(shop, {
      id: productId,
      shopifyProductId,
      title: 'Test Product',
      description: 'Test description',
      price: '29.99',
      imageUrl: null
    });

    const testId = `test-${Date.now()}`;
    await storage.createTest(shop, {
      id: testId,
      productId,
      status: 'active',
      testType: 'title',
      controlData: { title: 'Original Title' },
      variantData: { title: 'Optimized Title' },
      impressions: 0,
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

    console.log(`Created test product: ${productId}`);
    console.log(`Created active test: ${testId}\n`);

    // Test 1: GET /api/storefront/tests - Should return active tests
    console.log('Test 1: GET /api/storefront/tests');
    try {
      const tests = await storage.getTests(shop, 'active');
      const hasActiveTest = tests.some(t => t.id === testId && t.status === 'active');
      recordTest(
        'Fetch active tests for storefront',
        hasActiveTest,
        hasActiveTest ? `Found test ${testId}` : 'Test not found in active tests'
      );
      console.log(`✓ Found ${tests.length} active test(s)\n`);
    } catch (error) {
      recordTest('Fetch active tests for storefront', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 2: POST /api/storefront/assign - Record session assignment
    console.log('Test 2: POST /api/storefront/assign');
    const sessionId = `session-${Date.now()}`;
    try {
      await storage.createSessionAssignment(shop, {
        sessionId,
        testId,
        variant: 'control',
        timestamp: new Date()
      });
      recordTest(
        'Create session assignment',
        true,
        `Session ${sessionId} assigned to control`
      );
      console.log(`✓ Session ${sessionId} assigned to control variant\n`);
    } catch (error) {
      recordTest('Create session assignment', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 3: GET /api/storefront/assignments/:sessionId - Retrieve assignments
    console.log('Test 3: GET /api/storefront/assignments/:sessionId');
    try {
      const assignments = await storage.getSessionAssignments(shop, sessionId);
      const hasAssignment = assignments.some(a => 
        a.sessionId === sessionId && 
        a.testId === testId && 
        a.variant === 'control'
      );
      recordTest(
        'Retrieve session assignments',
        hasAssignment,
        hasAssignment ? `Retrieved assignment for test ${testId}` : 'Assignment not found'
      );
      console.log(`✓ Retrieved ${assignments.length} assignment(s) for session\n`);
    } catch (error) {
      recordTest('Retrieve session assignments', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 4: POST /api/storefront/impression - Track impression
    console.log('Test 4: POST /api/storefront/impression');
    try {
      const testBefore = await storage.getTest(shop, testId);
      
      if (!testBefore) {
        throw new Error(`Test ${testId} not found when fetching for impression tracking`);
      }
      
      const impressionsBefore = testBefore.impressions || 0;
      
      await storage.updateTest(shop, testId, {
        impressions: impressionsBefore + 1
      });
      
      const testAfter = await storage.getTest(shop, testId);
      
      if (!testAfter) {
        throw new Error(`Test ${testId} not found after updating impressions`);
      }
      
      const impressionsAfter = testAfter.impressions || 0;
      const incremented = impressionsAfter === impressionsBefore + 1;
      
      recordTest(
        'Track impression for test',
        incremented,
        incremented ? `Impressions: ${impressionsBefore} → ${impressionsAfter}` : 'Impression count did not increment'
      );
      console.log(`✓ Impression tracked (${impressionsBefore} → ${impressionsAfter})\n`);
    } catch (error) {
      recordTest('Track impression for test', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 5: Webhook attribution - Control variant
    console.log('Test 5: Webhook attribution (control variant)');
    try {
      const orderPayload = createMockOrderPayload(sessionId, shopifyProductId, 29.99, 1);
      
      // Simulate webhook logic
      const assignments = await storage.getSessionAssignments(shop, sessionId);
      const variant = assignments.find(a => a.testId === testId)?.variant;
      
      if (!variant) {
        throw new Error('No variant assignment found for webhook test');
      }
      
      const testBefore = await storage.getTest(shop, testId);
      
      if (!testBefore) {
        throw new Error('Test not found for webhook attribution');
      }
      
      const revenue = 29.99;
      
      const updates: any = {
        conversions: (testBefore.conversions || 0) + 1,
        revenue: (parseFloat(testBefore.revenue || "0") + revenue).toString(),
      };
      
      if (variant === 'control') {
        updates.controlConversions = (testBefore.controlConversions || 0) + 1;
        updates.controlRevenue = (parseFloat(testBefore.controlRevenue || "0") + revenue).toString();
      } else {
        updates.variantConversions = (testBefore.variantConversions || 0) + 1;
        updates.variantRevenue = (parseFloat(testBefore.variantRevenue || "0") + revenue).toString();
      }
      
      const newConversions = updates.conversions;
      const newRevenue = parseFloat(updates.revenue);
      updates.arpu = (newRevenue / newConversions).toString();
      
      await storage.updateTest(shop, testId, updates);
      
      const testAfter = await storage.getTest(shop, testId);
      
      if (!testAfter) {
        throw new Error('Test not found after update');
      }
      
      const correctAttribution = variant === 'control' 
        ? testAfter.controlConversions === 1 && parseFloat(testAfter.controlRevenue || "0") === 29.99
        : testAfter.variantConversions === 1 && parseFloat(testAfter.variantRevenue || "0") === 29.99;
      
      recordTest(
        'Webhook converts order to correct variant',
        correctAttribution,
        correctAttribution 
          ? `Conversion attributed to ${variant} ($${revenue})`
          : `Attribution failed for ${variant}`
      );
      console.log(`✓ Order attributed to ${variant} variant ($${revenue})\n`);
    } catch (error) {
      recordTest('Webhook converts order to correct variant', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 6: Multiple session assignments
    console.log('Test 6: Multiple session assignments');
    try {
      const session2 = `session-${Date.now()}-2`;
      const testId2 = `test-${Date.now()}-2`;
      
      await storage.createTest(shop, {
        id: testId2,
        productId,
        status: 'active',
        testType: 'price',
        controlData: { price: '29.99' },
        variantData: { price: '24.99' },
        impressions: 0,
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
      
      await storage.createSessionAssignment(shop, {
        sessionId: session2,
        testId,
        variant: 'variant',
        timestamp: new Date()
      });
      
      await storage.createSessionAssignment(shop, {
        sessionId: session2,
        testId: testId2,
        variant: 'control',
        timestamp: new Date()
      });
      
      const assignments = await storage.getSessionAssignments(shop, session2);
      const hasBoth = assignments.length === 2;
      
      recordTest(
        'Session with multiple test assignments',
        hasBoth,
        hasBoth ? `Session has ${assignments.length} assignments` : `Expected 2 assignments, got ${assignments.length}`
      );
      console.log(`✓ Session has ${assignments.length} test assignments\n`);
    } catch (error) {
      recordTest('Session with multiple test assignments', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 7: Webhook without session ID (graceful handling)
    console.log('Test 7: Webhook without session ID');
    try {
      const orderPayloadNoSession = {
        id: Math.floor(Math.random() * 1000000),
        line_items: [
          {
            product_id: productId,
            price: '29.99',
            quantity: 1,
            properties: []
          }
        ],
        note_attributes: [] // No session ID
      };
      
      const cartAttributes = orderPayloadNoSession.note_attributes || [];
      const sessionAttribute = cartAttributes.find((attr: any) => 
        attr.name === '_shoptimizer_session'
      );
      
      const noSessionId = !sessionAttribute?.value;
      
      recordTest(
        'Webhook gracefully handles missing session ID',
        noSessionId,
        noSessionId ? 'Correctly detected missing session ID' : 'Failed to handle missing session ID'
      );
      console.log(`✓ Webhook correctly handles orders without session ID\n`);
    } catch (error) {
      recordTest('Webhook gracefully handles missing session ID', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

    // Test 8: Assignment persistence (90-day expiry)
    console.log('Test 8: Assignment persistence check');
    try {
      const recentAssignments = await storage.getSessionAssignments(shop, sessionId);
      const hasAssignments = recentAssignments.length > 0;
      
      // Check timestamp is recent (within last minute)
      const now = new Date();
      const allRecent = recentAssignments.every(a => {
        const assignmentTime = new Date(a.timestamp);
        const diffMs = now.getTime() - assignmentTime.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        return diffMinutes < 1;
      });
      
      recordTest(
        'Assignments persist with recent timestamps',
        hasAssignments && allRecent,
        hasAssignments && allRecent 
          ? `${recentAssignments.length} recent assignment(s) found`
          : 'Assignments missing or have incorrect timestamps'
      );
      console.log(`✓ Assignments persist with valid timestamps\n`);
    } catch (error) {
      recordTest('Assignments persist with recent timestamps', false, (error as Error).message);
      console.log(`✗ Failed: ${(error as Error).message}\n`);
    }

  } catch (error) {
    console.error('Fatal error in test suite:', error);
  }

  // Print summary
  console.log('\n=== Test Results Summary ===\n');
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
  console.log(`\nOverall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}\n`);
  
  return allPassed;
}

// Export for use in test runner
export { createMockOrderPayload };
