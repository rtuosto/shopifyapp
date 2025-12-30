import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Get shop parameter from current URL
function getShopParam(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('shop');
}

// Add shop parameter to URL if it exists in the current page URL
function addShopToUrl(url: string): string {
  const shop = getShopParam();
  if (!shop) return url;
  
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}shop=${encodeURIComponent(shop)}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const json = await res.json();
      const errorMessage = json.error || res.statusText;
      throw new Error(errorMessage);
    } catch (parseError) {
      // If JSON parsing fails, fall back to status text
      const text = res.statusText || "Request failed";
      throw new Error(text);
    }
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
