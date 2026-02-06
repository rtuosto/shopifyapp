import { QueryClient, QueryFunction } from "@tanstack/react-query";

function getShopParam(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('shop');
}

function addShopToUrl(url: string): string {
  const shop = getShopParam();
  if (!shop) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}shop=${encodeURIComponent(shop)}`;
}

let authErrorCallback: ((redirectUrl: string) => void) | null = null;

export function setAuthErrorCallback(cb: (redirectUrl: string) => void) {
  authErrorCallback = cb;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText || "Request failed";
    let redirectUrl: string | null = null;
    let upgradeRequired = false;
    try {
      const json = await res.json();
      errorMessage = json.error || errorMessage;
      redirectUrl = json.redirectUrl || null;
      upgradeRequired = json.upgradeRequired || false;
    } catch {
    }

    if (res.status === 401 && redirectUrl && authErrorCallback) {
      authErrorCallback(redirectUrl);
    }

    const err = new Error(errorMessage);
    (err as any).status = res.status;
    (err as any).redirectUrl = redirectUrl;
    (err as any).upgradeRequired = upgradeRequired;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = addShopToUrl(url);
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = queryKey.join("/") as string;
    const fullUrl = addShopToUrl(baseUrl);
    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
