import * as cheerio from 'cheerio';

export interface ThemePositioningRules {
  mainProductContainer: string | null;
  productInfoContainer: string | null;
  descriptionSelector: string | null;
  descriptionInsertionPoint: {
    method: 'appendChild' | 'insertBefore' | 'insertAfter';
    targetSelector: string;
    className: string | null;
  } | null;
  titleSelector: string | null;
  priceSelectors: string[] | null;
  hasDescriptionByDefault: boolean | null;
}

/**
 * Analyze HTML to extract theme positioning rules
 * Identifies where key elements (description, title, price) are positioned in the DOM
 */
export function analyzeThemeStructure(html: string): ThemePositioningRules {
  const $ = cheerio.load(html);
  
  console.log('[Theme Analyzer] Starting HTML analysis...');
  
  // Find main product container
  const mainProductContainer = findMainProductContainer($);
  console.log(`[Theme Analyzer] Main product container: ${mainProductContainer}`);
  
  // Find product info container (where title, price, description typically live)
  const productInfoContainer = findProductInfoContainer($, mainProductContainer);
  console.log(`[Theme Analyzer] Product info container: ${productInfoContainer}`);
  
  // Find title selector
  const titleSelector = findTitleSelector($, productInfoContainer);
  console.log(`[Theme Analyzer] Title selector: ${titleSelector}`);
  
  // Find price selectors
  const priceSelectors = findPriceSelectors($, productInfoContainer);
  console.log(`[Theme Analyzer] Price selectors: ${priceSelectors?.join(', ')}`);
  
  // Find description selector and insertion point
  const descriptionInfo = findDescriptionInfo($, productInfoContainer);
  console.log(`[Theme Analyzer] Description selector: ${descriptionInfo.selector}`);
  console.log(`[Theme Analyzer] Description insertion point:`, descriptionInfo.insertionPoint);
  
  return {
    mainProductContainer,
    productInfoContainer,
    titleSelector,
    priceSelectors,
    descriptionSelector: descriptionInfo.selector,
    descriptionInsertionPoint: descriptionInfo.insertionPoint,
    hasDescriptionByDefault: descriptionInfo.hasDescription,
  };
}

/**
 * Find the main product container
 * Common selectors used by Shopify themes
 */
function findMainProductContainer($: cheerio.CheerioAPI): string | null {
  const selectors = [
    'main[id*="product"]',
    'main[class*="product"]',
    '[id*="MainProduct"]',
    '.product-single',
    '.product-template',
    '#product',
    '.main-product',
    'section[id*="product"]',
    'section[class*="product"]'
  ];
  
  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      // Return most specific selector if element has ID
      const id = element.attr('id');
      if (id) return `#${id}`;
      
      // Otherwise return class-based selector
      const classes = element.attr('class');
      if (classes) {
        const firstClass = classes.split(' ')[0];
        return `.${firstClass}`;
      }
      
      return selector;
    }
  }
  
  // Fallback to main or body
  if ($('main').length > 0) return 'main';
  return null;
}

/**
 * Find the product info container (where title, price, form typically are)
 */
function findProductInfoContainer($: cheerio.CheerioAPI, mainContainer: string | null): string | null {
  const containerEl = mainContainer ? $(mainContainer) : $('body');
  
  const selectors = [
    '.product__info',
    '.product-form',
    '.product-details',
    '.product-info',
    '.product__info-wrapper',
    '[class*="product-info"]',
    '[class*="product__info"]'
  ];
  
  for (const selector of selectors) {
    const element = containerEl.find(selector).first();
    if (element.length > 0) {
      const classes = element.attr('class');
      if (classes) {
        const firstClass = classes.split(' ')[0];
        return `.${firstClass}`;
      }
      return selector;
    }
  }
  
  return null;
}

/**
 * Find the product title selector
 */
function findTitleSelector($: cheerio.CheerioAPI, infoContainer: string | null): string | null {
  const containerEl = infoContainer ? $(infoContainer) : $('body');
  
  const selectors = [
    '.product-single__title',
    '.product__title',
    '[data-product-title]',
    '.product-title',
    'h1[itemprop="name"]',
    'h1'
  ];
  
  for (const selector of selectors) {
    const element = containerEl.find(selector).first();
    if (element.length > 0 && element.text().trim().length > 0) {
      const classes = element.attr('class');
      if (classes) {
        const firstClass = classes.split(' ')[0];
        return `.${firstClass}`;
      }
      return selector;
    }
  }
  
  return null;
}

/**
 * Find price element selectors
 */
function findPriceSelectors($: cheerio.CheerioAPI, infoContainer: string | null): string[] | null {
  const containerEl = infoContainer ? $(infoContainer) : $('body');
  
  const selectors = [
    '.product__price',
    '.product-single__price',
    '[data-product-price]',
    '.price',
    '[itemprop="price"]',
    '.price-item--regular'
  ];
  
  const found: string[] = [];
  
  for (const selector of selectors) {
    const elements = containerEl.find(selector);
    if (elements.length > 0) {
      // Add class-based selector if available
      elements.each((_, el) => {
        const classes = $(el).attr('class');
        if (classes) {
          const firstClass = classes.split(' ')[0];
          const classSelector = `.${firstClass}`;
          if (!found.includes(classSelector)) {
            found.push(classSelector);
          }
        }
      });
      
      // Also add the original selector if not class-based
      if (!selector.startsWith('.') && !found.includes(selector)) {
        found.push(selector);
      }
    }
  }
  
  return found.length > 0 ? found : null;
}

/**
 * Find description element and determine insertion point
 */
function findDescriptionInfo($: cheerio.CheerioAPI, infoContainer: string | null): {
  selector: string | null;
  insertionPoint: {
    method: 'appendChild' | 'insertBefore' | 'insertAfter';
    targetSelector: string;
    className: string | null;
  } | null;
  hasDescription: boolean;
} {
  const containerEl = infoContainer ? $(infoContainer) : $('body');
  
  const descSelectors = [
    '.product-single__description',
    '.product__description',
    '[data-product-description]',
    '.product-description',
    '[itemprop="description"]',
    '.rte'
  ];
  
  // Try to find existing description
  for (const selector of descSelectors) {
    const element = containerEl.find(selector).first();
    if (element.length > 0 && element.text().trim().length > 0) {
      const classes = element.attr('class');
      const classSelector = classes ? `.${classes.split(' ')[0]}` : selector;
      
      // Determine insertion point relative to surrounding elements
      const insertionPoint = determineInsertionPoint($, element);
      
      return {
        selector: classSelector,
        insertionPoint,
        hasDescription: true
      };
    }
  }
  
  // No description found - determine where it should go
  // Default: insert after the "add to cart" button or form
  const addToCartBtn = containerEl.find('button[name="add"], button[type="submit"], .product-form__submit').first();
  if (addToCartBtn.length > 0) {
    return {
      selector: null,
      insertionPoint: {
        method: 'insertAfter',
        targetSelector: 'button[name="add"], button[type="submit"], .product-form__submit',
        className: 'product__description'
      },
      hasDescription: false
    };
  }
  
  // Fallback: append to product info container
  if (infoContainer) {
    return {
      selector: null,
      insertionPoint: {
        method: 'appendChild',
        targetSelector: infoContainer,
        className: 'product__description'
      },
      hasDescription: false
    };
  }
  
  return {
    selector: null,
    insertionPoint: null,
    hasDescription: false
  };
}

/**
 * Determine the best insertion point for an element based on its position in the DOM
 */
function determineInsertionPoint($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): {
  method: 'appendChild' | 'insertBefore' | 'insertAfter';
  targetSelector: string;
  className: string | null;
} | null {
  // Get the previous sibling
  const prevSibling = element.prev();
  if (prevSibling.length > 0) {
    const selector = getElementSelector($, prevSibling);
    if (selector) {
      return {
        method: 'insertAfter',
        targetSelector: selector,
        className: element.attr('class')?.split(' ')[0] || null
      };
    }
  }
  
  // Get the next sibling
  const nextSibling = element.next();
  if (nextSibling.length > 0) {
    const selector = getElementSelector($, nextSibling);
    if (selector) {
      return {
        method: 'insertBefore',
        targetSelector: selector,
        className: element.attr('class')?.split(' ')[0] || null
      };
    }
  }
  
  // Fallback: append to parent
  const parent = element.parent();
  if (parent.length > 0) {
    const selector = getElementSelector($, parent);
    if (selector) {
      return {
        method: 'appendChild',
        targetSelector: selector,
        className: element.attr('class')?.split(' ')[0] || null
      };
    }
  }
  
  return null;
}

/**
 * Get a CSS selector for an element (prefer class, fallback to tag)
 */
function getElementSelector($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string | null {
  const classes = element.attr('class');
  if (classes) {
    const firstClass = classes.split(' ')[0];
    return `.${firstClass}`;
  }
  
  const id = element.attr('id');
  if (id) {
    return `#${id}`;
  }
  
  const tag = element.prop('tagName');
  if (tag) {
    return tag.toLowerCase();
  }
  
  return null;
}
