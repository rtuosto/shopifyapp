import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AIRecommendationCard, { AIRecommendationCardSkeleton } from "@/components/AIRecommendationCard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Product, Recommendation, Optimization } from "@shared/schema";
import { Link } from "wouter";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Badge,
  Banner,
  Button,
  Select,
  ButtonGroup,
  Modal,
} from "@shopify/polaris";

export default function AIRecommendations() {
  const { toast } = useToast();
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [storeIdeasDialogOpen, setStoreIdeasDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [dismissingRecommendation, setDismissingRecommendation] = useState<Recommendation | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "archive">("pending");
  const [replacementPendingInfo, setReplacementPendingInfo] = useState<{ productId: string; dismissedIndex: number } | null>(null);

  const { data: quotaData } = useQuery<{
    quota: number;
    used: number;
    remaining: number;
    planTier: string;
    resetDate: string;
  }>({
    queryKey: ["/api/quota"],
  });

  const { data: shopData } = useQuery<{ shop: string }>({
    queryKey: ["/api/shop"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: recommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
  });

  const { data: archivedRecommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations", "archived"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations/archived");
      if (!res.ok) throw new Error("Failed to fetch archived recommendations");
      return res.json();
    },
  });

  const generateStoreRecommendationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recommendations/store-analysis");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Store Ideas Generated",
        description: `Generated ${data.recommendations?.length || 0} recommendations for your top products`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
      setStoreIdeasDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Generate Ideas",
        description: error.message || "Could not generate store-wide recommendations",
        variant: "destructive",
      });
      setStoreIdeasDialogOpen(false);
    },
  });

  const generateProductRecommendationMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", `/api/recommendations/product/${productId}/generate`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Product Idea Generated",
        description: "Generated new recommendation for this product",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
      setSelectedProductId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Generate Idea",
        description: error.message || "Could not generate product recommendation",
        variant: "destructive",
      });
    },
  });

  const dismissRecommendationMutation = useMutation({
    mutationFn: async ({ id, replace, productId }: { id: string; replace: boolean; productId: string }) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/dismiss`, { replace });
      return res.json();
    },
    onSuccess: (data, variables) => {
      const { productId } = variables;
      const dismissedIndex = recommendations.findIndex(r => r.id === variables.id);

      const preExistingRecIds = new Set(
        recommendations
          .filter(r => r.productId === productId && r.id !== variables.id)
          .map(r => r.id)
      );

      if (data.replacementPending && productId) {
        setReplacementPendingInfo({
          productId,
          dismissedIndex: dismissedIndex >= 0 ? dismissedIndex : 0,
        });
      }

      setDismissDialogOpen(false);
      setDismissingRecommendation(null);

      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });

      if (data.replacementPending && productId) {
        toast({
          title: "Recommendation Dismissed",
          description: "A replacement is being generated — it will appear shortly",
        });
        const pollForReplacement = (attempts: number) => {
          if (attempts <= 0) {
            setReplacementPendingInfo(null);
            queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
            return;
          }
          setTimeout(async () => {
            try {
              const res = await fetch("/api/recommendations?status=pending");
              if (!res.ok) {
                pollForReplacement(attempts - 1);
                return;
              }
              const freshRecs: Recommendation[] = await res.json();
              const hasNewRecForProduct = freshRecs.some(
                r => r.productId === productId && !preExistingRecIds.has(r.id) && r.id !== variables.id
              );
              if (hasNewRecForProduct) {
                setReplacementPendingInfo(null);
                queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
                queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
              } else {
                pollForReplacement(attempts - 1);
              }
            } catch {
              pollForReplacement(attempts - 1);
            }
          }, 4000);
        };
        pollForReplacement(8);
      } else {
        toast({
          title: "Recommendation Dismissed",
          description: "Moved to archive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Dismiss",
        description: error.message || "Could not dismiss recommendation",
        variant: "destructive",
      });
      setDismissDialogOpen(false);
      setDismissingRecommendation(null);
    },
  });

  const restoreRecommendationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/restore`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Recommendation Restored",
        description: "Moved back to pending recommendations",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "archived"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Restore",
        description: error.message || "Could not restore recommendation",
        variant: "destructive",
      });
    },
  });

  const buildTestPayload = (recommendationId: string, editedChanges?: Record<string, any>) => {
    const recommendation = recommendations.find(r => r.id === recommendationId);
    if (!recommendation) throw new Error("Recommendation not found");

    const product = products.find(p => p.id === recommendation.productId);
    if (!product) throw new Error("Product not found");

    const controlData: Record<string, any> = {
      title: product.title,
      description: product.description || "",
      price: product.price,
    };

    if (recommendation.optimizationType === "price") {
      controlData.variantPrices = product.variants.map((v: any) => ({
        id: v.id,
        price: v.price,
      }));
    }

    const proposedChanges = editedChanges || recommendation.proposedChanges;

    const variantData: Record<string, any> = {
      ...controlData,
      ...proposedChanges,
    };

    if (recommendation.optimizationType === "price" && controlData.variantPrices) {
      const priceMultiplier = variantData.price / controlData.price;
      variantData.variantPrices = controlData.variantPrices.map((v: any) => ({
        id: v.id,
        price: (parseFloat(v.price) * priceMultiplier).toFixed(2),
      }));
    }

    return {
      productId: product.id,
      recommendationId: recommendation.id,
      optimizationType: recommendation.optimizationType,
      status: "draft",
      controlData,
      variantData,
      arpu: "0",
      arpuLift: "0",
      impressions: 0,
      conversions: 0,
      revenue: "0",
    };
  };

  const saveDraftOptimizationMutation = useMutation({
    mutationFn: async ({ recommendationId, editedChanges }: { recommendationId: string; editedChanges?: Record<string, any> }) => {
      const optimizationData = buildTestPayload(recommendationId, editedChanges);

      const createRes = await apiRequest("POST", "/api/optimizations", optimizationData);
      const createdTest = await createRes.json();

      return { test: createdTest, recommendationId };
    },
    onSuccess: async (data) => {
      toast({
        title: "Draft Saved",
        description: "Test saved as draft. Activate it from the Tests page when ready.",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Save Optimization Draft",
        description: error.message || "Could not save optimization as draft",
        variant: "destructive",
      });
    },
  });

  const createTestMutation = useMutation({
    mutationFn: async ({ recommendationId, editedChanges }: { recommendationId: string; editedChanges?: Record<string, any> }) => {
      const optimizationData = buildTestPayload(recommendationId, editedChanges);

      const createRes = await apiRequest("POST", "/api/optimizations", optimizationData);
      const createdTest = await createRes.json();

      const activateRes = await apiRequest("POST", `/api/optimizations/${createdTest.id}/activate`);
      const activatedTest = await activateRes.json();

      return { test: activatedTest, recommendationId };
    },
    onSuccess: async (data) => {
      await apiRequest("PATCH", `/api/recommendations/${data.recommendationId}`, { status: "testing" });
      
      toast({
        title: "Optimization Launched",
        description: "Your A/B optimization is now live and collecting data",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/optimizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Launch Optimization",
        description: error.message || "Could not create and activate test from recommendation",
        variant: "destructive",
      });
    },
  });

  const handlePreview = async (id: string) => {
    const rec = recommendations.find(r => r.id === id) || archivedRecommendations.find(r => r.id === id);
    if (!rec) return;

    const previewWindow = window.open('about:blank', '_blank', 'width=1400,height=900');
    
    if (!previewWindow) {
      toast({
        title: "Popup Blocked",
        description: "Please allow popups to preview on your store",
        variant: "destructive",
      });
      return;
    }

    try {
      previewWindow.document.write(`
        <html>
          <head>
            <title>Loading Preview...</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
              }
              .loader {
                text-align: center;
              }
              .spinner {
                border: 4px solid #e0e0e0;
                border-top: 4px solid #5C6AC4;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="loader">
              <div class="spinner"></div>
              <p>Preparing preview...</p>
            </div>
          </body>
        </html>
      `);

      const res = await apiRequest("POST", "/api/preview/sessions", {
        recommendationId: id,
      });
      const data = await res.json();
      
      const control = data.controlData || {};
      const variant = data.variantData || {};
      const changes = data.changes || [];
      const storefrontUrl = data.storefrontUrl || '';
      
      const escapeHtml = (text: string | null | undefined): string => {
        if (!text) return '';
        const htmlEscapes: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
      };

      previewWindow.document.open();
      previewWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Preview Changes - Shoptimizer</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background: #f4f6f8;
              color: #1a1a1a;
              line-height: 1.5;
              height: 100vh;
              display: flex;
              flex-direction: column;
            }
            .header {
              background: linear-gradient(135deg, #5C6AC4 0%, #3b4199 100%);
              color: white;
              padding: 16px 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-shrink: 0;
            }
            .header h1 { font-size: 20px; font-weight: 600; }
            .header-actions { display: flex; gap: 12px; }
            .btn {
              padding: 8px 16px;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              border: none;
              transition: all 0.2s;
              text-decoration: none;
              display: inline-block;
            }
            .btn-secondary { background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); }
            .btn-secondary:hover { background: rgba(255,255,255,0.3); }
            .btn-primary { background: white; color: #5C6AC4; }
            .btn-primary:hover { background: #f0f0f0; }
            .tabs {
              display: flex;
              background: white;
              border-bottom: 1px solid #e0e0e0;
              flex-shrink: 0;
            }
            .tab {
              padding: 12px 24px;
              cursor: pointer;
              border: none;
              background: none;
              font-size: 14px;
              font-weight: 500;
              color: #666;
              border-bottom: 2px solid transparent;
              transition: all 0.2s;
            }
            .tab:hover { color: #5C6AC4; }
            .tab.active { color: #5C6AC4; border-bottom-color: #5C6AC4; }
            .tab-content { display: none; flex: 1; overflow: hidden; }
            .tab-content.active { display: flex; flex-direction: column; }
            .container { max-width: 1400px; margin: 0 auto; padding: 24px; overflow: auto; flex: 1; }
            .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
            @media (max-width: 900px) { .comparison { grid-template-columns: 1fr; } }
            .card {
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              overflow: hidden;
            }
            .card-header {
              padding: 16px 24px;
              border-bottom: 1px solid #e5e5e5;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .card-header.control { background: #f5f5f5; }
            .card-header.variant { background: #e8f5e9; }
            .badge {
              padding: 4px 10px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
            }
            .badge-control { background: #e0e0e0; color: #616161; }
            .badge-variant { background: #c8e6c9; color: #2e7d32; }
            .card-content { padding: 24px; }
            .field { margin-bottom: 20px; }
            .field:last-child { margin-bottom: 0; }
            .field-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
            .field-value { font-size: 16px; }
            .field-value.title { font-size: 20px; font-weight: 600; }
            .field-value.price { font-size: 24px; font-weight: 700; color: #2e7d32; }
            .field-value.description { color: #444; white-space: pre-wrap; }
            .changed { background: #fff3cd; padding: 4px 8px; border-radius: 4px; }
            .storefront-container { flex: 1; display: flex; flex-direction: column; background: #f0f0f0; }
            .storefront-notice {
              background: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 8px;
              padding: 12px 16px;
              margin: 16px;
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .storefront-notice-icon { font-size: 20px; }
            .storefront-notice-text { font-size: 14px; color: #856404; }
            .storefront-iframe {
              flex: 1;
              border: none;
              background: white;
            }
            .loading-overlay {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(255,255,255,0.9);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            }
            .spinner {
              border: 4px solid #e0e0e0;
              border-top: 4px solid #5C6AC4;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Preview Changes</h1>
            <div class="header-actions">
              <button class="btn btn-secondary" onclick="window.close()">Close</button>
              <button class="btn btn-primary" onclick="approveAndClose()">Launch Optimization</button>
            </div>
          </div>
          <div class="tabs">
            <button class="tab active" data-tab="comparison">Side-by-Side Comparison</button>
            <button class="tab" data-tab="storefront">Storefront Preview</button>
          </div>
          <div id="comparison" class="tab-content active">
            <div class="container">
              <div class="comparison">
                <div class="card">
                  <div class="card-header control">
                    <span class="badge badge-control">Current (Control)</span>
                  </div>
                  <div class="card-content">
                    <div class="field">
                      <div class="field-label">Title</div>
                      <div class="field-value title">${escapeHtml(control.title)}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Price</div>
                      <div class="field-value price">$${parseFloat(control.price || '0').toFixed(2)}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Description</div>
                      <div class="field-value description">${escapeHtml(control.description) || '(No description)'}</div>
                    </div>
                  </div>
                </div>
                <div class="card">
                  <div class="card-header variant">
                    <span class="badge badge-variant">Proposed (Variant)</span>
                  </div>
                  <div class="card-content">
                    <div class="field">
                      <div class="field-label">Title</div>
                      <div class="field-value title ${changes.includes('title') ? 'changed' : ''}">${escapeHtml(variant.title)}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Price</div>
                      <div class="field-value price ${changes.includes('price') ? 'changed' : ''}">$${parseFloat(variant.price || '0').toFixed(2)}</div>
                    </div>
                    <div class="field">
                      <div class="field-label">Description</div>
                      <div class="field-value description ${changes.includes('description') ? 'changed' : ''}">${escapeHtml(variant.description) || '(No description)'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="storefront" class="tab-content">
            <div class="storefront-container" style="position: relative;">
              <div class="storefront-notice">
                <span class="storefront-notice-icon">ℹ️</span>
                <span class="storefront-notice-text">This preview simulates how your changes will look. The actual product isn't modified until you launch the optimization.</span>
              </div>
              <div id="iframe-loading" class="loading-overlay">
                <div class="spinner"></div>
                <p style="margin-top: 16px; color: #666;">Loading storefront preview...</p>
              </div>
              <iframe 
                id="storefront-iframe" 
                class="storefront-iframe"
                sandbox="allow-same-origin allow-scripts"
                style="opacity: 0; transition: opacity 0.3s;"
              ></iframe>
            </div>
          </div>
          <script>
            const variantData = {
              title: ${JSON.stringify(variant.title || '')},
              price: ${JSON.stringify(variant.price || '')},
              description: ${JSON.stringify(variant.description || '')},
              changes: ${JSON.stringify(changes)}
            };
            const storefrontUrl = ${JSON.stringify(storefrontUrl)};
            let iframeLoaded = false;

            function approveAndClose() {
              if (window.opener) {
                window.opener.postMessage({ type: 'shoptimizer-preview-complete', approved: true }, '*');
              }
              window.close();
            }

            document.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
                
                if (tab.dataset.tab === 'storefront' && !iframeLoaded && storefrontUrl) {
                  loadStorefrontPreview();
                }
              });
            });

            function loadStorefrontPreview() {
              if (!storefrontUrl) return;
              iframeLoaded = true;
              
              const iframe = document.getElementById('storefront-iframe');
              const loading = document.getElementById('iframe-loading');
              
              const previewToken = ${JSON.stringify(data.token)};
              const proxyUrl = '/api/preview/proxy/' + previewToken;
              fetch(proxyUrl)
                .then(res => res.text())
                .then(html => {
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(html, 'text/html');
                  
                  if (variantData.changes.includes('title') && variantData.title) {
                    const titleSelectors = [
                      'h1.product__title',
                      'h1.product-title', 
                      '.product__title h1',
                      '.product-single__title',
                      'h1[data-product-title]',
                      '.product h1',
                      'h1'
                    ];
                    for (const sel of titleSelectors) {
                      const el = doc.querySelector(sel);
                      if (el && el.textContent.trim()) {
                        el.innerHTML = variantData.title + ' <span style="background:#c8e6c9;color:#2e7d32;font-size:12px;padding:2px 6px;border-radius:4px;margin-left:8px;">PREVIEW</span>';
                        break;
                      }
                    }
                  }
                  
                  if (variantData.changes.includes('price') && variantData.price) {
                    const priceSelectors = [
                      '.product__price .price-item--regular',
                      '.product__price .money',
                      '.product-price .money',
                      '.price__regular .price-item',
                      '[data-product-price]',
                      '.product-single__price',
                      '.price .money'
                    ];
                    const formattedPrice = '$' + parseFloat(variantData.price).toFixed(2);
                    for (const sel of priceSelectors) {
                      const els = doc.querySelectorAll(sel);
                      els.forEach(el => {
                        if (el.textContent.includes('$')) {
                          el.innerHTML = formattedPrice + ' <span style="background:#c8e6c9;color:#2e7d32;font-size:10px;padding:1px 4px;border-radius:3px;">PREVIEW</span>';
                        }
                      });
                      if (els.length) break;
                    }
                  }
                  
                  if (variantData.changes.includes('description') && variantData.description) {
                    const descSelectors = [
                      '.product__description',
                      '.product-single__description',
                      '.product-description',
                      '[data-product-description]',
                      '.rte'
                    ];
                    for (const sel of descSelectors) {
                      const el = doc.querySelector(sel);
                      if (el) {
                        el.innerHTML = '<div style="border-left:3px solid #4caf50;padding-left:12px;background:#f1f8e9;padding:12px;border-radius:4px;margin-bottom:8px;"><span style="background:#c8e6c9;color:#2e7d32;font-size:10px;padding:1px 4px;border-radius:3px;margin-bottom:8px;display:inline-block;">PREVIEW</span><br>' + variantData.description.replace(/\\n/g, '<br>') + '</div>';
                        break;
                      }
                    }
                  }
                  
                  const base = doc.createElement('base');
                  base.href = storefrontUrl;
                  doc.head.insertBefore(base, doc.head.firstChild);
                  
                  const banner = doc.createElement('div');
                  banner.style.cssText = 'background:linear-gradient(135deg,#5C6AC4,#3b4199);color:white;padding:12px 20px;text-align:center;font-family:system-ui;font-size:14px;position:sticky;top:0;z-index:99999;';
                  banner.innerHTML = '🔍 <strong>Preview Mode</strong> - Changes shown below are simulated and not yet live';
                  doc.body.insertBefore(banner, doc.body.firstChild);
                  
                  iframe.srcdoc = doc.documentElement.outerHTML;
                  
                  iframe.onload = () => {
                    loading.style.display = 'none';
                    iframe.style.opacity = '1';
                  };
                })
                .catch(err => {
                  console.error('Failed to load storefront:', err);
                  loading.innerHTML = '<p style="color:#d32f2f;">Unable to load storefront preview due to cross-origin restrictions.<br><br><a href="' + storefrontUrl + '" target="_blank" style="color:#5C6AC4;">Open product page in new tab</a></p>';
                });
            }
          </script>
        </body>
        </html>
      `);
      previewWindow.document.close();

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'shoptimizer-preview-complete') {
          console.log('[Dashboard] Preview completed:', event.data);
          
          if (event.data.approved) {
            createTestMutation.mutate({ recommendationId: id });
          } else {
            toast({
              title: "Preview Closed",
              description: "No changes were made",
            });
          }
          
          window.removeEventListener('message', messageHandler);
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
      }, 30 * 60 * 1000);

    } catch (error) {
      console.error("Error creating preview session:", error);
      
      if (previewWindow && !previewWindow.closed) {
        previewWindow.document.write(`
          <html>
            <head>
              <title>Preview Setup Required</title>
              <style>
                body {
                  margin: 0;
                  padding: 40px;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: #f5f5f5;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                }
                .container {
                  background: white;
                  border-radius: 12px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                  padding: 40px;
                  max-width: 600px;
                  text-align: center;
                }
                h1 {
                  color: #202223;
                  margin: 0 0 16px 0;
                  font-size: 24px;
                }
                p {
                  color: #666;
                  line-height: 1.6;
                  margin: 0 0 24px 0;
                }
                .steps {
                  background: #f9f9f9;
                  border-radius: 8px;
                  padding: 20px;
                  text-align: left;
                  margin: 24px 0;
                }
                .steps h3 {
                  margin: 0 0 12px 0;
                  font-size: 16px;
                  color: #202223;
                }
                .steps ol {
                  margin: 0;
                  padding-left: 20px;
                }
                .steps li {
                  margin: 8px 0;
                  color: #666;
                }
                .button {
                  display: inline-block;
                  background: #5C6AC4;
                  color: white;
                  padding: 12px 24px;
                  border-radius: 6px;
                  text-decoration: none;
                  font-weight: 500;
                  margin-top: 8px;
                }
                .button:hover {
                  background: #4A5AA8;
                }
                .icon {
                  width: 64px;
                  height: 64px;
                  margin: 0 auto 16px;
                  background: #f0f0f0;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .icon svg {
                  width: 32px;
                  height: 32px;
                  color: #5C6AC4;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </div>
                <h1>SDK Installation Required</h1>
                <p>To preview AI recommendations on your actual storefront, you need to install the Shoptimizer SDK on your Shopify theme.</p>
                
                <div class="steps">
                  <h3>Quick Setup:</h3>
                  <ol>
                    <li>Go to the Settings page in Shoptimizer</li>
                    <li>Copy the installation script</li>
                    <li>Add it to your Shopify theme's theme.liquid file</li>
                    <li>Save and try previewing again</li>
                  </ol>
                </div>
                
                <p style="font-size: 14px; color: #888;">This window will close automatically...</p>
              </div>
              <script>
                setTimeout(() => {
                  window.close();
                }, 10000);
              </script>
            </body>
          </html>
        `);
      }
      
      toast({
        title: "Preview Failed",
        description: "Could not create preview session",
        variant: "destructive",
      });
    }
  };

  const handleAccept = (id: string, editedVariant?: any) => {
    if (!editedVariant) {
      createTestMutation.mutate({ recommendationId: id });
      return;
    }

    const rec = recommendations.find(r => r.id === id);
    if (!rec) {
      createTestMutation.mutate({ recommendationId: id });
      return;
    }

    const editedChanges: Record<string, any> = {};
    
    if ('title' in rec.proposedChanges) {
      editedChanges.title = editedVariant.title;
    }
    if ('price' in rec.proposedChanges) {
      editedChanges.price = editedVariant.price;
    }
    if ('description' in rec.proposedChanges) {
      editedChanges.description = editedVariant.description;
    }
    
    createTestMutation.mutate({ recommendationId: id, editedChanges });
  };

  const handleSaveDraft = (id: string, editedVariant?: any) => {
    if (!editedVariant) {
      saveDraftOptimizationMutation.mutate({ recommendationId: id });
      return;
    }

    const rec = recommendations.find(r => r.id === id);
    if (!rec) {
      saveDraftOptimizationMutation.mutate({ recommendationId: id });
      return;
    }

    const editedChanges: Record<string, any> = {};
    
    if ('title' in rec.proposedChanges) {
      editedChanges.title = editedVariant.title;
    }
    if ('price' in rec.proposedChanges) {
      editedChanges.price = editedVariant.price;
    }
    if ('description' in rec.proposedChanges) {
      editedChanges.description = editedVariant.description;
    }
    
    saveDraftOptimizationMutation.mutate({ recommendationId: id, editedChanges });
  };

  const handleDismissClick = (id: string) => {
    const rec = recommendations.find(r => r.id === id);
    if (!rec) return;
    setDismissingRecommendation(rec);
    setDismissDialogOpen(true);
  };

  const handleRestore = (id: string) => {
    restoreRecommendationMutation.mutate(id);
  };

  const quotaRemaining = quotaData?.remaining ?? 0;
  const quotaUsed = quotaData?.used ?? 0;
  const quotaTotal = quotaData?.quota ?? 20;

  return (
    <Page>
      <BlockStack gap="600">
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <BlockStack gap="200">
            <Text as="h1" variant="headingLg" data-testid="text-page-title">AI Recommendations</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              AI-powered optimization ideas for your products
            </Text>
          </BlockStack>
          <Badge tone="info" data-testid="badge-quota">
            {`${quotaUsed} AI Ideas Used · Beta: Unlimited`}
          </Badge>
        </InlineStack>

        <InlineStack gap="400" blockAlign="center" wrap>
          <Button
            variant="primary"
            onClick={() => setStoreIdeasDialogOpen(true)}
            disabled={generateStoreRecommendationsMutation.isPending}
            loading={generateStoreRecommendationsMutation.isPending}
            data-testid="button-generate-store-ideas"
          >
            {generateStoreRecommendationsMutation.isPending ? "Generating..." : "Generate Store Ideas"}
          </Button>
          <InlineStack gap="200" blockAlign="center">
            <Select
              label="Product"
              labelHidden
              value={selectedProductId}
              onChange={(value) => setSelectedProductId(value)}
              data-testid="select-product"
              options={[
                { label: "Select a product...", value: "" },
                ...products.map((product) => ({
                  label: product.title,
                  value: product.id,
                })),
              ]}
            />
            <Button
              onClick={() => {
                if (selectedProductId) {
                  generateProductRecommendationMutation.mutate(selectedProductId);
                }
              }}
              disabled={!selectedProductId || generateProductRecommendationMutation.isPending}
              loading={generateProductRecommendationMutation.isPending}
              data-testid="button-generate-product-idea"
            >
              {generateProductRecommendationMutation.isPending ? "Generating..." : "Generate Idea"}
            </Button>
          </InlineStack>
        </InlineStack>

        <Banner title="Preview Feature Requires SDK Installation" tone="warning">
          <InlineStack align="space-between" blockAlign="center" gap="400">
            <Text as="p" variant="bodySm">
              To use the "Preview Changes" button, install the Shoptimizer SDK on your Shopify theme. Without it, preview links will show a blank page.
            </Text>
            <Button
              variant="plain"
              size="slim"
              onClick={() => { window.location.href = '/settings'; }}
              accessibilityLabel="View Setup in Settings"
              data-testid="button-view-setup"
            >
              View Setup
            </Button>
          </InlineStack>
        </Banner>

        <BlockStack gap="400">
          <ButtonGroup variant="segmented">
            <Button
              variant={activeTab === "pending" ? "primary" : undefined}
              onClick={() => setActiveTab("pending")}
              data-testid="tab-pending"
            >
              {`Pending (${recommendations.length})`}
            </Button>
            <Button
              variant={activeTab === "archive" ? "primary" : undefined}
              onClick={() => setActiveTab("archive")}
              data-testid="tab-archive"
            >
              {`Archive (${archivedRecommendations.length})`}
            </Button>
          </ButtonGroup>

          {activeTab === "pending" && (
            <BlockStack gap="400">
              {recommendations.length === 0 && !generateStoreRecommendationsMutation.isPending && !generateProductRecommendationMutation.isPending && !replacementPendingInfo ? (
                <Card>
                  <Box padding="600">
                    <BlockStack gap="400" align="center">
                      <Text as="h2" variant="headingMd">No Recommendations Yet</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Generate AI-powered optimization ideas for your store
                      </Text>
                      <Button
                        variant="primary"
                        onClick={() => setStoreIdeasDialogOpen(true)}
                      >
                        Generate Store Ideas
                      </Button>
                    </BlockStack>
                  </Box>
                </Card>
              ) : (
                <InlineGrid columns={2} gap="400">
                  {(() => {
                    const cards: React.ReactNode[] = [];
                    recommendations.forEach((rec, index) => {
                      if (replacementPendingInfo && index === replacementPendingInfo.dismissedIndex) {
                        cards.push(<AIRecommendationCardSkeleton key="replacement-skeleton" />);
                      }
                      const product = products.find(p => p.id === rec.productId);
                      const productImage = product?.images?.[0];
                      cards.push(
                        <AIRecommendationCard
                          key={rec.id}
                          id={rec.id}
                          title={rec.title}
                          description={rec.description}
                          productName={product?.title || 'Unknown Product'}
                          productImage={productImage}
                          optimizationType={rec.optimizationType}
                          impactScore={rec.impactScore}
                          onAccept={() => handleAccept(rec.id)}
                          onReject={() => handleDismissClick(rec.id)}
                          onPreview={() => handlePreview(rec.id)}
                        />
                      );
                    });
                    if (replacementPendingInfo && replacementPendingInfo.dismissedIndex >= recommendations.length) {
                      cards.push(<AIRecommendationCardSkeleton key="replacement-skeleton" />);
                    }
                    return cards;
                  })()}
                  {(generateStoreRecommendationsMutation.isPending || generateProductRecommendationMutation.isPending) && (
                    <>
                      <AIRecommendationCardSkeleton />
                      <AIRecommendationCardSkeleton />
                      {generateStoreRecommendationsMutation.isPending && (
                        <AIRecommendationCardSkeleton />
                      )}
                    </>
                  )}
                </InlineGrid>
              )}
            </BlockStack>
          )}

          {activeTab === "archive" && (
            <BlockStack gap="400">
              {archivedRecommendations.length === 0 ? (
                <Card>
                  <Box padding="600">
                    <BlockStack gap="400" align="center">
                      <Text as="h2" variant="headingMd">No Archived Recommendations</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Dismissed recommendations will appear here
                      </Text>
                    </BlockStack>
                  </Box>
                </Card>
              ) : (
                <InlineGrid columns={2} gap="400">
                  {archivedRecommendations.map((rec) => {
                    const product = products.find(p => p.id === rec.productId);
                    const productImage = product?.images?.[0];
                    return (
                      <AIRecommendationCard
                        key={rec.id}
                        id={rec.id}
                        title={rec.title}
                        description={rec.description}
                        productName={product?.title || 'Unknown Product'}
                        productImage={productImage}
                        optimizationType={rec.optimizationType}
                        impactScore={rec.impactScore}
                        borderColor="border-l-muted"
                        imageOpacity="opacity-60"
                        headerBadge={
                          <Badge tone="read-only">Archived</Badge>
                        }
                        customActions={
                          <>
                            <Button
                              variant="plain"
                              size="slim"
                              onClick={() => handlePreview(rec.id)}
                              data-testid={`button-preview-${rec.id}`}
                            >
                              Preview
                            </Button>
                            <Button
                              size="slim"
                              onClick={() => handleRestore(rec.id)}
                              disabled={restoreRecommendationMutation.isPending}
                              loading={restoreRecommendationMutation.isPending}
                              data-testid={`button-restore-${rec.id}`}
                            >
                              Restore
                            </Button>
                          </>
                        }
                      />
                    );
                  })}
                </InlineGrid>
              )}
            </BlockStack>
          )}
        </BlockStack>
      </BlockStack>

      <Modal
        open={storeIdeasDialogOpen}
        onClose={() => setStoreIdeasDialogOpen(false)}
        title="Generate Store Ideas?"
        data-testid="dialog-store-ideas"
        primaryAction={{
          content: generateStoreRecommendationsMutation.isPending ? "Generating..." : "Generate Ideas",
          onAction: () => generateStoreRecommendationsMutation.mutate(),
          disabled: generateStoreRecommendationsMutation.isPending,
          loading: generateStoreRecommendationsMutation.isPending,
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: () => setStoreIdeasDialogOpen(false),
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodyMd">
              This will analyze your top products and generate up to 10 AI recommendations.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Beta: Unlimited AI ideas during beta period
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={dismissDialogOpen}
        onClose={() => {
          setDismissDialogOpen(false);
          setDismissingRecommendation(null);
        }}
        title="Dismiss Recommendation"
        data-testid="dialog-dismiss"
        primaryAction={{
          content: "Dismiss & Replace",
          onAction: () => {
            if (dismissingRecommendation) {
              dismissRecommendationMutation.mutate({ id: dismissingRecommendation.id, replace: true, productId: dismissingRecommendation.productId });
            }
          },
          disabled: dismissRecommendationMutation.isPending,
          loading: dismissRecommendationMutation.isPending,
        }}
        secondaryActions={[{
          content: "Just Dismiss",
          onAction: () => {
            if (dismissingRecommendation) {
              dismissRecommendationMutation.mutate({ id: dismissingRecommendation.id, replace: false, productId: dismissingRecommendation.productId });
            }
          },
          disabled: dismissRecommendationMutation.isPending,
          loading: dismissRecommendationMutation.isPending,
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodySm" tone="subdued">
              What would you like to do with this recommendation?
            </Text>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                <strong>Just Dismiss:</strong> Archive this recommendation
              </Text>
              <Text as="p" variant="bodySm">
                <strong>Dismiss &amp; Replace:</strong> Archive this and generate a different recommendation for the same product
              </Text>
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
