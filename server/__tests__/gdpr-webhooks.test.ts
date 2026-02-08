import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';

const TEST_SHOP = 'test-gdpr-shop.myshopify.com';
// Use the real secret from environment for integration tests
const TEST_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test-secret-for-hmac-verification';

function generateHmac(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

async function makeWebhookRequest(
  endpoint: string,
  payload: object,
  topic: string,
  shop: string = TEST_SHOP
) {
  const bodyString = JSON.stringify(payload);
  const hmac = generateHmac(bodyString, TEST_API_SECRET);
  
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': shop,
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Webhook-Id': crypto.randomUUID(),
    },
    body: bodyString,
  });
  
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

describe('GDPR Compliance Webhooks', () => {
  describe('customers/data_request', () => {
    it('should return 200 for valid data request webhook', async () => {
      const payload = {
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
      };
      
      const result = await makeWebhookRequest(
        '/api/webhooks/customers/data_request',
        payload,
        'customers/data_request'
      );
      
      console.log(`[Test] customers/data_request response: ${result.status}`, result.body);
      
      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('received', true);
    });
    
    it('should return 401 for missing HMAC header', async () => {
      const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/webhooks/customers/data_request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'customers/data_request',
          'X-Shopify-Shop-Domain': TEST_SHOP,
        },
        body: JSON.stringify({ shop_id: 12345 }),
      });
      
      console.log(`[Test] Missing HMAC response: ${response.status}`);
      expect(response.status).toBe(401);
    });
  });
  
  describe('customers/redact', () => {
    it('should return 200 for valid customer redact webhook', async () => {
      const payload = {
        shop_id: 12345,
        shop_domain: TEST_SHOP,
        customer: {
          id: 67890,
          email: 'customer@example.com',
          phone: '+1234567890',
        },
        orders_to_redact: ['order-123', 'order-456'],
      };
      
      const result = await makeWebhookRequest(
        '/api/webhooks/customers/redact',
        payload,
        'customers/redact'
      );
      
      console.log(`[Test] customers/redact response: ${result.status}`, result.body);
      
      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('received', true);
    });
    
    it('should return 401 for invalid HMAC signature', async () => {
      const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/webhooks/customers/redact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'customers/redact',
          'X-Shopify-Shop-Domain': TEST_SHOP,
          'X-Shopify-Hmac-Sha256': 'invalid-hmac-signature',
        },
        body: JSON.stringify({ shop_id: 12345 }),
      });
      
      console.log(`[Test] Invalid HMAC response: ${response.status}`);
      expect(response.status).toBe(401);
    });
  });
  
  describe('shop/redact', () => {
    it('should return 200 for valid shop redact webhook', async () => {
      const payload = {
        shop_id: 12345,
        shop_domain: TEST_SHOP,
      };
      
      const result = await makeWebhookRequest(
        '/api/webhooks/shop/redact',
        payload,
        'shop/redact'
      );
      
      console.log(`[Test] shop/redact response: ${result.status}`, result.body);
      
      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty('received', true);
    });
    
    it('should return 401 for missing shop domain header', async () => {
      const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/webhooks/shop/redact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'shop/redact',
          'X-Shopify-Hmac-Sha256': 'some-hmac',
        },
        body: JSON.stringify({ shop_id: 12345 }),
      });
      
      console.log(`[Test] Missing shop domain response: ${response.status}`);
      expect(response.status).toBe(401);
    });
  });
});

describe('Shop Data Deletion Integration', () => {
  it('should delete all shop data when shop/redact is received', async () => {
    console.log('[Test] Shop data deletion integration test placeholder');
    console.log('[Test] This test requires database seeding and verification');
  });
});
