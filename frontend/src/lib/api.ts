export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function request<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      cache: 'no-store',
      signal: options.signal || AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      'We couldn’t reach playhud. Check your connection and try again.',
    );
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      msg =
        typeof body.detail === 'string'
          ? body.detail
          : Array.isArray(body.detail)
            ? body.detail
                .map(
                  (entry: { loc?: (string | number)[]; msg?: string }) =>
                    `${entry.loc?.slice(1).join(' ') || 'Field'}: ${entry.msg || 'Invalid value'}`,
                )
                .join('. ')
            : msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export const sports = [
  'Badminton',
  'Cricket',
  'Football',
  'Basketball',
  'Tennis',
  'Pickleball',
  'Table Tennis',
  'Volleyball',
  'Running',
  'Cycling',
];
