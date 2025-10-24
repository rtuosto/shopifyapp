/**
 * Test Runner for Shoptimizer Attribution System
 * 
 * Run with: npx tsx tests/run-tests.ts
 */

import { MemStorage } from '../server/storage';
import { runStorefrontTests } from './test-storefront-api';

async function main() {
  console.log('Initializing test environment...\n');
  
  const storage = new MemStorage();
  const testShop = 'test-shop.myshopify.com';
  
  try {
    const allPassed = await runStorefrontTests(storage, testShop);
    
    if (allPassed) {
      console.log('✓ All storefront attribution tests passed!');
      process.exit(0);
    } else {
      console.log('✗ Some tests failed. Review output above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

main();
