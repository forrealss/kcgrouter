export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiRequestOptions = Omit<RequestInit, "body" | "headers" | "method"> & {
  headers?: HeadersInit;
};

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => undefined);
  }

  return response.text().catch(() => undefined);
}

function getResponseErrorMessage(response: Response, data: unknown): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  if (typeof data === "string" && data.trim()) return data;
  return response.statusText || `Request failed with status ${response.status}`;
}

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { headers, ...requestOptions } = options;
  const requestHeaders = new Headers(headers);

  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...requestOptions,
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: requestHeaders,
    credentials: "include",
  });
  const data = await readResponseBody(response);

  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      getResponseErrorMessage(response, data),
      data,
    );
  }

  return data as T;
}

export const apiClient = {
  get<T>(path: string, options?: ApiRequestOptions) {
    return request<T>(path, "GET", undefined, options);
  },
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return request<T>(path, "POST", body, options);
  },
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return request<T>(path, "PATCH", body, options);
  },
  delete<T>(path: string, options?: ApiRequestOptions) {
    return request<T>(path, "DELETE", undefined, options);
  },
};

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan yang tidak terduga.";
}
