import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AIRecommendationCard from "@/components/AIRecommendationCard";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkles, Plus, Archive as ArchiveIcon, RotateCcw, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import type { Product, Recommendation, Optimization } from "@shared/schema";
import { Link } from "wouter";

export default function AIRecommendations() {
  const { toast } = useToast();
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [storeIdeasDialogOpen, setStoreIdeasDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [dismissingRecommendation, setDismissingRecommendation] = useState<Recommendation | null>(null);

  // Fetch quota data
  const { data: quotaData } = useQuery<{
    quota: number;
    used: number;
    remaining: number;
    planTier: string;
    resetDate: string;
  }>({
    queryKey: ["/api/quota"],
  });

  // Fetch shop domain
  const { data: shopData } = useQuery<{ shop: string }>({
    queryKey: ["/api/shop"],
  });

  // Fetch products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Fetch pending recommendations
  const { data: recommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations?status=pending");
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
  });

  // Fetch archived recommendations
  const { data: archivedRecommendations = [] } = useQuery<Recommendation[]>({
    queryKey: ["/api/recommendations", "archived"],
    queryFn: async () => {
      const res = await fetch("/api/recommendations/archived");
      if (!res.ok) throw new Error("Failed to fetch archived recommendations");
      return res.json();
    },
  });

  // Generate store-wide recommendations
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

  // Generate product-specific recommendation
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

  // Dismiss recommendation (just dismiss or dismiss & replace)
  const dismissRecommendationMutation = useMutation({
    mutationFn: async ({ id, replace }: { id: string; replace: boolean }) => {
      const res = await apiRequest("POST", `/api/recommendations/${id}/dismiss`, { replace });
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.replacement) {
        toast({
          title: "Recommendation Replaced",
          description: "Archived old recommendation and generated a new one",
        });
      } else {
        toast({
          title: "Recommendation Dismissed",
          description: "Moved to archive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations", "archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quota"] });
      setDismissDialogOpen(false);
      setDismissingRecommendation(null);
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

  // Restore recommendation
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

  // Helper function to build optimization payload (shared between draft and activate flows)
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

    // Use edited changes if provided, otherwise use recommendation's proposed changes
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

  // Save optimization as draft (without activating)
  const saveDraftOptimizationMutation = useMutation({
    mutationFn: async ({ recommendationId, editedChanges }: { recommendationId: string; editedChanges?: Record<string, any> }) => {
      const optimizationData = buildTestPayload(recommendationId, editedChanges);

      // Create the optimization as draft (without activating)
      const createRes = await apiRequest("POST", "/api/optimizations", optimizationData);
      const createdTest = await createRes.json();

      return { test: createdTest, recommendationId };
    },
    onSuccess: async (data) => {
      // Do NOT update recommendation status - keep it as "pending"
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

  // Create and activate test from recommendation
  const createTestMutation = useMutation({
    mutationFn: async ({ recommendationId, editedChanges }: { recommendationId: string; editedChanges?: Record<string, any> }) => {
      const optimizationData = buildTestPayload(recommendationId, editedChanges);

      // Create the test
      const createRes = await apiRequest("POST", "/api/optimizations", optimizationData);
      const createdTest = await createRes.json();

      // Immediately activate the test
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

    // CRITICAL: Open window IMMEDIATELY (synchronously) during user click
    // This must happen BEFORE any async operations to avoid popup blockers
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
      // Show loading state in the preview window
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

      // Create preview session and get data
      const res = await apiRequest("POST", "/api/preview/sessions", {
        recommendationId: id,
      });
      const data = await res.json();
      
      const control = data.controlData || {};
      const variant = data.variantData || {};
      const changes = data.changes || [];
      const storefrontUrl = data.storefrontUrl || '';
      
      // Helper to escape HTML
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

      // Render the preview with tabbed interface (Comparison + Storefront Preview)
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

            // Tab switching
            document.querySelectorAll('.tab').forEach(tab => {
              tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
                
                // Load iframe on first storefront tab click
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
              
              // Use server-side proxy to fetch page (avoids CORS)
              const previewToken = ${JSON.stringify(data.token)};
              const proxyUrl = '/api/preview/proxy/' + previewToken;
              fetch(proxyUrl)
                .then(res => res.text())
                .then(html => {
                  // Parse and modify the HTML
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(html, 'text/html');
                  
                  // Inject modifications for title
                  if (variantData.changes.includes('title') && variantData.title) {
                    // Try common Shopify title selectors
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
                  
                  // Inject modifications for price
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
                  
                  // Inject modifications for description
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
                  
                  // Add base tag to fix relative URLs
                  const base = doc.createElement('base');
                  base.href = storefrontUrl;
                  doc.head.insertBefore(base, doc.head.firstChild);
                  
                  // Add preview banner at top
                  const banner = doc.createElement('div');
                  banner.style.cssText = 'background:linear-gradient(135deg,#5C6AC4,#3b4199);color:white;padding:12px 20px;text-align:center;font-family:system-ui;font-size:14px;position:sticky;top:0;z-index:99999;';
                  banner.innerHTML = '🔍 <strong>Preview Mode</strong> - Changes shown below are simulated and not yet live';
                  doc.body.insertBefore(banner, doc.body.firstChild);
                  
                  // Write to iframe
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

      // Listen for approval messages from preview window
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'shoptimizer-preview-complete') {
          console.log('[Dashboard] Preview completed:', event.data);
          
          if (event.data.approved) {
            // User approved the recommendation - create test
            createTestMutation.mutate({ recommendationId: id });
          } else {
            toast({
              title: "Preview Closed",
              description: "No changes were made",
            });
          }
          
          // Clean up listener
          window.removeEventListener('message', messageHandler);
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Clean up listener after 30 minutes
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
      }, 30 * 60 * 1000);

    } catch (error) {
      console.error("Error creating preview session:", error);
      
      // Show helpful error message in the preview window
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

    // Only extract fields that were actually changed in the recommendation
    const rec = recommendations.find(r => r.id === id);
    if (!rec) {
      createTestMutation.mutate({ recommendationId: id });
      return;
    }

    const editedChanges: Record<string, any> = {};
    
    // Only include fields that were in the original proposed changes
    if ('title' in rec.proposedChanges) {
      editedChanges.title = editedVariant.title;
    }
    if ('price' in rec.proposedChanges) {
      // Keep price as number for variant pricing multiplier to work correctly
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

    // Only extract fields that were actually changed in the recommendation
    const rec = recommendations.find(r => r.id === id);
    if (!rec) {
      saveDraftOptimizationMutation.mutate({ recommendationId: id });
      return;
    }

    const editedChanges: Record<string, any> = {};
    
    // Only include fields that were in the original proposed changes
    if ('title' in rec.proposedChanges) {
      editedChanges.title = editedVariant.title;
    }
    if ('price' in rec.proposedChanges) {
      // Keep price as number for variant pricing multiplier to work correctly
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
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">AI Recommendations</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            AI-powered optimization ideas for your products
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Badge variant="secondary" className="gap-1 hidden sm:flex">
            <Sparkles className="w-3 h-3" />
            <span className="whitespace-nowrap">{quotaUsed} AI Ideas Used · Beta: Unlimited</span>
          </Badge>
          <Badge variant="secondary" className="gap-1 sm:hidden">
            <Sparkles className="w-3 h-3" />
            <span>{quotaUsed}</span>
          </Badge>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => setStoreIdeasDialogOpen(true)}
          disabled={generateStoreRecommendationsMutation.isPending}
          data-testid="button-generate-store-ideas"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {generateStoreRecommendationsMutation.isPending ? "Generating..." : "Generate Store Ideas"}
        </Button>
        <div className="flex items-center gap-2">
          <Select value={selectedProductId} onValueChange={(value) => setSelectedProductId(value)}>
            <SelectTrigger className="w-[250px]" data-testid="select-product">
              <SelectValue placeholder="Select a product..." />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              if (selectedProductId) {
                generateProductRecommendationMutation.mutate(selectedProductId);
              }
            }}
            disabled={!selectedProductId || generateProductRecommendationMutation.isPending}
            variant="outline"
            data-testid="button-generate-product-idea"
          >
            <Plus className="w-4 h-4 mr-2" />
            {generateProductRecommendationMutation.isPending ? "Generating..." : "Generate Idea"}
          </Button>
        </div>
      </div>

      {/* SDK Installation Warning */}
      <Alert variant="default" className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
        <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        <AlertTitle className="text-orange-900 dark:text-orange-100">Preview Feature Requires SDK Installation</AlertTitle>
        <AlertDescription className="text-orange-800 dark:text-orange-200 flex items-start justify-between gap-4">
          <span>
            To use the "Preview Changes" button, install the Shoptimizer SDK on your Shopify theme. Without it, preview links will show a blank page.
          </span>
          <Button variant="outline" size="sm" asChild className="flex-shrink-0 border-orange-300 dark:border-orange-700 hover-elevate">
            <Link href="/settings">
              <SettingsIcon className="w-3 h-3 mr-1" />
              View Setup
            </Link>
          </Button>
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({recommendations.length})
          </TabsTrigger>
          <TabsTrigger value="archive" data-testid="tab-archive">
            <ArchiveIcon className="w-4 h-4 mr-2" />
            Archive ({archivedRecommendations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-6">
          {recommendations.length === 0 ? (
            <Card className="p-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Recommendations Yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate AI-powered optimization ideas for your store
              </p>
              <Button
                onClick={() => setStoreIdeasDialogOpen(true)}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Store Ideas
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {recommendations.map((rec) => {
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
                    onAccept={() => handleAccept(rec.id)}
                    onReject={() => handleDismissClick(rec.id)}
                    onPreview={() => handlePreview(rec.id)}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archive" className="space-y-4 mt-6">
          {archivedRecommendations.length === 0 ? (
            <Card className="p-12 text-center">
              <ArchiveIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Archived Recommendations</h3>
              <p className="text-muted-foreground">
                Dismissed recommendations will appear here
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      <Badge variant="outline" className="gap-1">
                        <ArchiveIcon className="w-3 h-3" />
                        Archived
                      </Badge>
                    }
                    customActions={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(rec.id)}
                          data-testid={`button-preview-${rec.id}`}
                        >
                          Preview
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleRestore(rec.id)}
                          disabled={restoreRecommendationMutation.isPending}
                          data-testid={`button-restore-${rec.id}`}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Restore
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Store Ideas Confirmation Dialog */}
      <AlertDialog open={storeIdeasDialogOpen} onOpenChange={setStoreIdeasDialogOpen}>
        <AlertDialogContent data-testid="dialog-store-ideas">
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Store Ideas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will analyze your top products and generate up to 10 AI recommendations.
              <br />
              <br />
              <span className="text-muted-foreground">Beta: Unlimited AI ideas during beta period</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-store-ideas">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => generateStoreRecommendationsMutation.mutate()}
              disabled={generateStoreRecommendationsMutation.isPending}
              data-testid="button-confirm-store-ideas"
            >
              {generateStoreRecommendationsMutation.isPending ? "Generating..." : "Generate Ideas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dismiss Dialog */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent data-testid="dialog-dismiss">
          <DialogHeader>
            <DialogTitle>Dismiss Recommendation</DialogTitle>
            <DialogDescription>
              What would you like to do with this recommendation?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">
              <strong>Just Dismiss:</strong> Archive this recommendation
            </p>
            <p className="text-sm">
              <strong>Dismiss & Replace:</strong> Archive this and generate a different recommendation for the same product
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (dismissingRecommendation) {
                  dismissRecommendationMutation.mutate({ id: dismissingRecommendation.id, replace: false });
                }
              }}
              disabled={dismissRecommendationMutation.isPending}
              data-testid="button-just-dismiss"
            >
              <ArchiveIcon className="w-4 h-4 mr-2" />
              Just Dismiss
            </Button>
            <Button
              onClick={() => {
                if (dismissingRecommendation) {
                  dismissRecommendationMutation.mutate({ id: dismissingRecommendation.id, replace: true });
                }
              }}
              disabled={dismissRecommendationMutation.isPending}
              data-testid="button-dismiss-replace"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Dismiss & Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
