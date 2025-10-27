/**
 * Preview Messaging Utilities
 * Handles communication between the preview iframe and the parent window
 */

export type PreviewMode = 'control' | 'variant';

export interface PreviewMessage {
  type: 'preview:init' | 'preview:apply' | 'preview:edit' | 'preview:ready' | 'preview:height';
  payload: any;
}

export interface ApplyVariantPayload {
  mode: PreviewMode;
  variantData: {
    title?: string;
    price?: number;
    description?: string;
  };
  highlights: string[];
  editable: boolean;
}

export interface EditFieldPayload {
  field: 'title' | 'price' | 'description';
  value: string | number;
}

export interface HeightPayload {
  height: number;
}

/**
 * Send a message from parent to iframe
 */
export function sendToPreview(iframe: HTMLIFrameElement, message: PreviewMessage) {
  if (!iframe.contentWindow) return;
  iframe.contentWindow.postMessage(message, '*');
}

/**
 * Listen for messages from iframe in parent window
 */
export function listenToPreview(callback: (message: PreviewMessage) => void) {
  const handler = (event: MessageEvent) => {
    // Validate message structure
    if (event.data && typeof event.data === 'object' && event.data.type?.startsWith('preview:')) {
      callback(event.data as PreviewMessage);
    }
  };

  window.addEventListener('message', handler);

  // Return cleanup function
  return () => window.removeEventListener('message', handler);
}

/**
 * Send a message from iframe to parent
 */
export function sendToParent(message: PreviewMessage) {
  if (window.parent === window) return; // Not in iframe
  window.parent.postMessage(message, '*');
}

/**
 * Listen for messages from parent in iframe
 */
export function listenToParent(callback: (message: PreviewMessage) => void) {
  const handler = (event: MessageEvent) => {
    // Validate message structure
    if (event.data && typeof event.data === 'object' && event.data.type?.startsWith('preview:')) {
      callback(event.data as PreviewMessage);
    }
  };

  window.addEventListener('message', handler);

  // Return cleanup function
  return () => window.removeEventListener('message', handler);
}
