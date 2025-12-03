'use client';

import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser-client';
import type {
  AreaDto,
  CityDto,
  DistrictDto,
  OltListItemDto,
  OnuListItemDto,
  PaginatedResponse,
  RegionDto,
  RegionListResponse,
} from '@/types/inventory';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE;
const supabaseBrowserClient = createSupabaseBrowserClient();

const GEO_STALE_TIME = 5 * 60 * 1000;
const GEO_GC_TIME = 30 * 60 * 1000;
const INVENTORY_STALE_TIME = 60 * 1000;
const INVENTORY_GC_TIME = 5 * 60 * 1000;

type QueryParams = Record<string, string | number | undefined | null>;

interface FetchOptions {
  params?: QueryParams;
  signal?: AbortSignal;
}

async function authedFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, signal } = options;
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_BASE is not configured');
  }

  const {
    data: { session },
  } = await supabaseBrowserClient.auth.getSession();

  if (!session) {
    throw new Error('User session is not available');
  }

  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url.pathname}`);
  }

  return response.json();
}

export function useRegions(limit = 200) {
  const query = useQuery<RegionListResponse>({
    queryKey: ['geo', 'regions', limit],
    queryFn: ({ signal }) => authedFetch<RegionListResponse>('/geo/regions', { params: { limit }, signal }),
    staleTime: GEO_STALE_TIME,
    gcTime: GEO_GC_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    data: query.data?.items ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCities(regionId?: string) {
  const query = useQuery<CityDto[]>({
    queryKey: ['geo', 'cities', regionId],
    queryFn: ({ signal }) => authedFetch<CityDto[]>(`/geo/regions/${regionId}/cities`, { signal }),
    enabled: Boolean(regionId),
    staleTime: GEO_STALE_TIME,
    gcTime: GEO_GC_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    data: regionId ? query.data ?? [] : [],
    isLoading: regionId ? query.isLoading : false,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useDistricts(cityId?: string) {
  const query = useQuery<DistrictDto[]>({
    queryKey: ['geo', 'districts', cityId],
    queryFn: ({ signal }) => authedFetch<DistrictDto[]>(`/geo/cities/${cityId}/districts`, { signal }),
    enabled: Boolean(cityId),
    staleTime: GEO_STALE_TIME,
    gcTime: GEO_GC_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    data: cityId ? query.data ?? [] : [],
    isLoading: cityId ? query.isLoading : false,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useAreas(districtId?: string) {
  const query = useQuery<AreaDto[]>({
    queryKey: ['geo', 'areas', districtId],
    queryFn: ({ signal }) => authedFetch<AreaDto[]>(`/geo/districts/${districtId}/areas`, { signal }),
    enabled: Boolean(districtId),
    staleTime: GEO_STALE_TIME,
    gcTime: GEO_GC_TIME,
    refetchOnWindowFocus: false,
  });

  return {
    data: districtId ? query.data ?? [] : [],
    isLoading: districtId ? query.isLoading : false,
    isError: query.isError,
    refetch: query.refetch,
  };
}

interface UseOltsParams {
  regionId?: string;
  cityId?: string;
  districtId?: string;
  areaId?: string;
  search?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useOlts(params: UseOltsParams) {
  const { regionId, cityId, districtId, areaId, search, page = 1, limit = 25, enabled = true } = params;

  const query = useQuery<PaginatedResponse<OltListItemDto>>({
    queryKey: ['inventory', 'olts', { regionId, cityId, districtId, areaId, search, page, limit }],
    queryFn: ({ signal }) =>
      authedFetch<PaginatedResponse<OltListItemDto>>('/olts', {
        params: {
          regionId,
          cityId,
          districtId,
          areaId,
          search,
          page,
          limit,
        },
        signal,
      }),
    enabled,
    staleTime: INVENTORY_STALE_TIME,
    gcTime: INVENTORY_GC_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const paginated = query.data as PaginatedResponse<OltListItemDto> | undefined;
  const items = useMemo(() => paginated?.items ?? [], [paginated]);

  return {
    data: paginated,
    items,
    pagination: paginated?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

interface UseOnusParams {
  oltId?: string;
  regionId?: string;
  cityId?: string;
  districtId?: string;
  areaId?: string;
  search?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useOnus(params: UseOnusParams) {
  const { oltId, regionId, cityId, districtId, areaId, search, page = 1, limit = 25, enabled = true } = params;

  const query = useQuery<PaginatedResponse<OnuListItemDto>>({
    queryKey: ['inventory', 'onus', { oltId, regionId, cityId, districtId, areaId, search, page, limit }],
    queryFn: ({ signal }) =>
      authedFetch<PaginatedResponse<OnuListItemDto>>('/onus', {
        params: {
          oltId,
          regionId,
          cityId,
          districtId,
          areaId,
          search,
          page,
          limit,
        },
        signal,
      }),
    enabled,
    staleTime: INVENTORY_STALE_TIME,
    gcTime: INVENTORY_GC_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const paginated = query.data as PaginatedResponse<OnuListItemDto> | undefined;
  const items = useMemo(() => paginated?.items ?? [], [paginated]);

  return {
    data: paginated,
    items,
    pagination: paginated?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
