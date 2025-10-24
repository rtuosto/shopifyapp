/**
 * Test Runner for Shoptimizer Attribution System
 * 
 * Run with: npx tsx tests/run-tests.ts
 */

import { MemStorage } from '../server/storage';
import { runStorefrontTests } from './test-storefront-api';
import { runWebhookTests } from './test-webhook-simulator';

async function main() {
  console.log('Initializing test environment...\n');
  
  const storage = new MemStorage();
  const testShop = 'test-shop.myshopify.com';
  
  try {
    // Run all test suites
    const storefrontPassed = await runStorefrontTests(storage, testShop);
    const webhookPassed = await runWebhookTests(storage, testShop);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('FINAL TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Storefront API Tests: ${storefrontPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`Webhook Simulation Tests: ${webhookPassed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('='.repeat(50) + '\n');
    
    if (storefrontPassed && webhookPassed) {
      console.log('🎉 ALL TESTS PASSED! Attribution pipeline is working correctly.\n');
      process.exit(0);
    } else {
      console.log('❌ SOME TESTS FAILED. Review output above.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

main();
