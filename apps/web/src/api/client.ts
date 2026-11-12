export interface ApiError {
  error: string;
  statusCode: number;
  message?: string;
  details?: any;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (options.body && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
    credentials: "include", // Ensures auth cookie is sent
  });

  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const error: ApiError = {
      error: data?.error || res.statusText || "Request failed",
      statusCode: res.status,
      message: data?.message || (typeof data === "string" ? data : undefined),
      details: data?.details,
    };
    throw error;
  }

  return data as T;
}

