declare global {
  interface Window {
    shopify?: {
      toast: {
        show: (message: string, options?: { duration?: number; isError?: boolean }) => void;
      };
      environment?: {
        embedded?: boolean;
      };
    };
  }
}

export function isEmbedded(): boolean {
  try {
    return window.self !== window.top || !!window.shopify?.environment?.embedded;
  } catch {
    return true;
  }
}

export function showToast(message: string, options?: { isError?: boolean }) {
  if (window.shopify?.toast) {
    window.shopify.toast.show(message, {
      duration: 5000,
      isError: options?.isError,
    });
  } else {
    const event = new CustomEvent('shoptimizer-toast', {
      detail: { message, isError: options?.isError },
    });
    window.dispatchEvent(event);
  }
}
