import { Platform } from 'react-native';

import * as storage from '@/lib/storage';
import { createMockApi } from './mock';
import type {
  ApiErrorBody,
  CreateRestaurantInput,
  CreateRestaurantResult,
  DishCard,
  FeedbackInput,
  RestaurantDetail,
  RestaurantSummary,
  ScanResult,
  TasteProfile,
} from './types';

export interface ScanImage {
  uri: string;
  mimeType: string;
  fileName: string;
}

export interface Api {
  listRestaurants(q?: string): Promise<RestaurantSummary[]>;
  getRestaurant(id: string): Promise<RestaurantDetail>;
  scanMenu(image: ScanImage): Promise<ScanResult>;
  createRestaurant(input: CreateRestaurantInput): Promise<CreateRestaurantResult>;
  sendFeedback(dishId: string, input: FeedbackInput): Promise<{ dish: DishCard }>;
  /** Resolves to null when the diner has not created a taste profile yet. */
  getTasteProfile(): Promise<TasteProfile | null>;
  putTasteProfile(profile: TasteProfile): Promise<TasteProfile>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'fare.token';

export function createHttpApi(baseUrl: string): Api {
  let token: string | null = null;
  let authInFlight: Promise<string> | null = null;

  async function authenticate(): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/anonymous`, { method: 'POST' });
    if (!res.ok) throw await toError(res);
    const body = (await res.json()) as { token: string };
    token = body.token;
    await storage.setItem(TOKEN_KEY, token);
    return token;
  }

  async function getToken(): Promise<string> {
    if (token) return token;
    token = await storage.getItem(TOKEN_KEY);
    if (token) return token;
    authInFlight ??= authenticate().finally(() => {
      authInFlight = null;
    });
    return authInFlight;
  }

  async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await getToken()}`,
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    if (res.status === 401 && !retried) {
      // Stored token expired or the database was reset: get a fresh anonymous identity.
      token = null;
      await storage.removeItem(TOKEN_KEY);
      return request<T>(path, init, true);
    }
    if (!res.ok) throw await toError(res);
    return (await res.json()) as T;
  }

  return {
    listRestaurants: (q) =>
      request(`/restaurants${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    getRestaurant: (id) => request(`/restaurants/${encodeURIComponent(id)}`),
    async scanMenu(image) {
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await (await fetch(image.uri)).blob();
        form.append('image', blob, image.fileName);
      } else {
        // React Native's FormData accepts a file descriptor object.
        form.append('image', {
          uri: image.uri,
          name: image.fileName,
          type: image.mimeType,
        } as unknown as Blob);
      }
      return request('/scans', { method: 'POST', body: form });
    },
    createRestaurant: (input) =>
      request('/restaurants', { method: 'POST', body: JSON.stringify(input) }),
    sendFeedback: (dishId, input) =>
      request(`/dishes/${encodeURIComponent(dishId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    async getTasteProfile() {
      try {
        return await request<TasteProfile | null>('/me/taste-profile');
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    putTasteProfile: (profile) =>
      request('/me/taste-profile', { method: 'PUT', body: JSON.stringify(profile) }),
  };
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error) return new ApiError(res.status, body.error.code, body.error.message);
  } catch {
    // non-JSON error body
  }
  return new ApiError(res.status, 'http_error', `Request failed with status ${res.status}`);
}

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const useMock = process.env.EXPO_PUBLIC_API_MOCK === '1' || !baseUrl;

export const api: Api = useMock ? createMockApi() : createHttpApi(baseUrl!);
export const isMockApi = useMock;

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return 'You have scanned a lot of menus in the last hour. Try again later.';
    if (e.status === 413) return 'That photo is too large. Pick a smaller image or crop it to the menu.';
    return e.message;
  }
  if (e instanceof TypeError) return 'Could not reach the Fare server. Check your connection and try again.';
  return e instanceof Error ? e.message : 'Something went wrong.';
}
