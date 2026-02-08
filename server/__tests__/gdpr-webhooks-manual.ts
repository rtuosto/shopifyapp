ok #!/usr/bin/env npx tsx
/**
 * Manual GDPR Webhook Test Script
 * 
 * This script tests the GDPR compliance webhooks by sending properly-signed
 * requests using the actual SHOPIFY_API_SECRET from the environment.
 * 
 * Usage: npx tsx server/__tests__/gdpr-webhooks-manual.ts
 * 
 * Prerequisites:
 * - Server must be running on localhost:3000
 * - SHOPIFY_API_SECRET must be set in environment
 */

import crypto from 'crypto';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const TEST_SHOP = 'test-gdpr-shop.myshopify.com';

if (!API_SECRET) {
  console.error('ERROR: SHOPIFY_API_SECRET environment variable is required');
  console.error('Make sure the server is running with proper Shopify credentials');
  process.exit(1);
}

function generateHmac(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

async function testWebhook(
  name: string,
  endpoint: string,
  topic: string,
  payload: object,
  shop: string = TEST_SHOP
): Promise<{ success: boolean; status: number; body: any }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Topic: ${topic}`);
  console.log(`${'='.repeat(60)}`);
  
  const bodyString = JSON.stringify(payload);
  const hmac = generateHmac(bodyString, API_SECRET!);
  
  console.log(`Payload: ${bodyString.substring(0, 100)}...`);
  console.log(`HMAC: ${hmac.substring(0, 20)}...`);
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': topic,
        'X-Shopify-Shop-Domain': shop,
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Webhook-Id': crypto.randomUUID(),
        'X-Shopify-API-Version': '2024-01',
      },
      body: bodyString,
    });
    
    const responseBody = await response.json().catch(() => null);
    
    const success = response.status === 200;
    console.log(`\nStatus: ${response.status} ${success ? '✓' : '✗'}`);
    console.log(`Response:`, JSON.stringify(responseBody, null, 2));
    
    return { success, status: response.status, body: responseBody };
  } catch (error) {
    console.error(`\nRequest failed:`, error);
    return { success: false, status: 0, body: null };
  }
}

async function testInvalidHmac(endpoint: string, topic: string): Promise<boolean> {
  console.log(`\nTesting invalid HMAC for ${endpoint}...`);
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': TEST_SHOP,
      'X-Shopify-Hmac-Sha256': 'invalid-hmac-signature',
      'X-Shopify-Webhook-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({ shop_id: 12345 }),
  });
  
  const success = response.status === 401;
  console.log(`Invalid HMAC rejected: ${success ? '✓' : '✗'} (status: ${response.status})`);
  return success;
}

async function testMissingHeaders(endpoint: string): Promise<boolean> {
  console.log(`\nTesting missing headers for ${endpoint}...`);
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ shop_id: 12345 }),
  });
  
  const success = response.status === 401;
  console.log(`Missing headers rejected: ${success ? '✓' : '✗'} (status: ${response.status})`);
  return success;
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('GDPR WEBHOOK COMPLIANCE TEST SUITE');
  console.log('='.repeat(60));
  console.log(`Server: ${BASE_URL}`);
  console.log(`Test Shop: ${TEST_SHOP}`);
  console.log(`API Secret: ${API_SECRET!.substring(0, 8)}...`);
  
  const results: { name: string; passed: boolean }[] = [];
  
  // Test 1: customers/data_request
  const dataRequest = await testWebhook(
    'Customer Data Request (GDPR Article 15)',
    '/api/webhooks/customers/data_request',
    'customers/data_request',
    {
      shop_id: 12345,
      shop_domain: TEST_SHOP,
      orders_requested: ['order-123', 'order-456'],
      customer: {
        id: 67890,
        email: 'customer@example.com',
        phone: '+1234567890',
      },
      data_request: {
        id: crypto.randomUUID(),
      },
    }
  );
  results.push({ name: 'customers/data_request - Valid request', passed: dataRequest.success });
  
  // Test 2: customers/redact
  const customerRedact = await testWebhook(
    'Customer Data Redact (GDPR Article 17)',
    '/api/webhooks/customers/redact',
    'customers/redact',
    {
      shop_id: 12345,
      shop_domain: TEST_SHOP,
      customer: {
        id: 67890,
        email: 'customer@example.com',
        phone: '+1234567890',
      },
      orders_to_redact: ['order-123', 'order-456'],
    }
  );
  results.push({ name: 'customers/redact - Valid request', passed: customerRedact.success });
  
  // Test 3: shop/redact
  const shopRedact = await testWebhook(
    'Shop Data Redact (App Uninstall)',
    '/api/webhooks/shop/redact',
    'shop/redact',
    {
      shop_id: 12345,
      shop_domain: TEST_SHOP,
    }
  );
  results.push({ name: 'shop/redact - Valid request', passed: shopRedact.success });
  
  // Test 4: Security - Invalid HMAC should be rejected
  const invalidHmac1 = await testInvalidHmac('/api/webhooks/customers/data_request', 'customers/data_request');
  results.push({ name: 'Security - Invalid HMAC rejected (data_request)', passed: invalidHmac1 });
  
  const invalidHmac2 = await testInvalidHmac('/api/webhooks/customers/redact', 'customers/redact');
  results.push({ name: 'Security - Invalid HMAC rejected (redact)', passed: invalidHmac2 });
  
  const invalidHmac3 = await testInvalidHmac('/api/webhooks/shop/redact', 'shop/redact');
  results.push({ name: 'Security - Invalid HMAC rejected (shop/redact)', passed: invalidHmac3 });
  
  // Test 5: Security - Missing headers should be rejected
  const missingHeaders1 = await testMissingHeaders('/api/webhooks/customers/data_request');
  results.push({ name: 'Security - Missing headers rejected (data_request)', passed: missingHeaders1 });
  
  const missingHeaders2 = await testMissingHeaders('/api/webhooks/shop/redact');
  results.push({ name: 'Security - Missing headers rejected (shop/redact)', passed: missingHeaders2 });
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  for (const result of results) {
    console.log(`${result.passed ? '✓' : '✗'} ${result.name}`);
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed! Review the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✓ All GDPR webhook tests passed!');
    process.exit(0);
  }
}

runTests().catch(console.error);
