'use client';

import { useEffect, useMemo, useRef, useState, type RefObject, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Search, Layers, ListFilter, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CascadingSelect } from './components/cascading-select';
import { PaginationControls } from './components/pagination-controls';
import { useAreas, useCities, useDistricts, useOlts, useOnus, useRegions } from '@/hooks/use-geo-inventory';
import type { OltListItemDto, OnuListItemDto } from '@/types/inventory';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

type InventoryTab = 'olts' | 'onus';

const TAB_CONFIG: Record<InventoryTab, { label: string; tabId: string; panelId: string }> = {
  olts: {
    label: 'OLTs',
    tabId: 'geo-inventory-tab-olts',
    panelId: 'geo-inventory-panel-olts',
  },
  onus: {
    label: 'ONUs',
    tabId: 'geo-inventory-tab-onus',
    panelId: 'geo-inventory-panel-onus',
  },
};

const TAB_ORDER: InventoryTab[] = ['olts', 'onus'];

export default function GeoNetworkExplorerPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('olts');
  const [regionId, setRegionId] = useState<string | undefined>();
  const [cityId, setCityId] = useState<string | undefined>();
  const [districtId, setDistrictId] = useState<string | undefined>();
  const [areaId, setAreaId] = useState<string | undefined>();
  const [selectedOltId, setSelectedOltId] = useState<string | undefined>();
  const [oltPage, setOltPage] = useState(1);
  const [onuPage, setOnuPage] = useState(1);
  const [oltSearch, setOltSearch] = useState('');
  const [onuSearch, setOnuSearch] = useState('');

  const oltSearchRef = useRef<HTMLInputElement>(null);
  const onuSearchRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<InventoryTab, HTMLButtonElement | null>>({
    olts: null,
    onus: null,
  });

  const debouncedOltSearch = useDebouncedValue(oltSearch, 400);
  const debouncedOnuSearch = useDebouncedValue(onuSearch, 400);

  const regionsQuery = useRegions();
  const citiesQuery = useCities(regionId);
  const districtsQuery = useDistricts(cityId);
  const areasQuery = useAreas(districtId);

  const oltQuery = useOlts({
    regionId,
    cityId,
    districtId,
    areaId,
    search: debouncedOltSearch,
    page: oltPage,
    limit: PAGE_SIZE,
  });

  const onuQuery = useOnus({
    oltId: selectedOltId,
    regionId,
    cityId,
    districtId,
    areaId,
    search: debouncedOnuSearch,
    page: onuPage,
    limit: PAGE_SIZE,
    enabled: activeTab === 'onus',
  });

  useEffect(() => {
    setOltPage(1);
  }, [regionId, cityId, districtId, areaId, debouncedOltSearch]);

  useEffect(() => {
    setOnuPage(1);
  }, [regionId, cityId, districtId, areaId, debouncedOnuSearch, selectedOltId]);

  useEffect(() => {
    if (activeTab === 'olts') {
      oltSearchRef.current?.focus();
    } else {
      onuSearchRef.current?.focus();
    }
  }, [activeTab]);

  const focusTab = (tab: InventoryTab) => {
    tabRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: InventoryTab) => {
    const currentIndex = TAB_ORDER.indexOf(currentTab);
    if (currentIndex === -1) {
      return;
    }

    if (event.key === 'ArrowRight') {
      const nextTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
      setActiveTab(nextTab);
      requestAnimationFrame(() => focusTab(nextTab));
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      const prevTab = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
      setActiveTab(prevTab);
      requestAnimationFrame(() => focusTab(prevTab));
      event.preventDefault();
    } else if (event.key === 'Home') {
      const firstTab = TAB_ORDER[0];
      setActiveTab(firstTab);
      requestAnimationFrame(() => focusTab(firstTab));
      event.preventDefault();
    } else if (event.key === 'End') {
      const lastTab = TAB_ORDER[TAB_ORDER.length - 1];
      setActiveTab(lastTab);
      requestAnimationFrame(() => focusTab(lastTab));
      event.preventDefault();
    }
  };

  const oltOptions = useMemo(() =>
    oltQuery.items.map((olt) => ({ value: olt.id, label: olt.siteLabel || olt.hostname })),
  [oltQuery.items]);

  const handleRegionChange = (value?: string) => {
    setRegionId(value);
    setCityId(undefined);
    setDistrictId(undefined);
    setAreaId(undefined);
    setSelectedOltId(undefined);
  };

  const handleCityChange = (value?: string) => {
    setCityId(value);
    setDistrictId(undefined);
    setAreaId(undefined);
    setSelectedOltId(undefined);
  };

  const handleDistrictChange = (value?: string) => {
    setDistrictId(value);
    setAreaId(undefined);
    setSelectedOltId(undefined);
  };

  const handleAreaChange = (value?: string) => {
    setAreaId(value);
    setSelectedOltId(undefined);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Network Geo Inventory</h1>
          <p className="text-sm text-slate-600">Navigate regions, OLTs, and ONUs with cascading filters.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            regionsQuery.refetch();
            citiesQuery.refetch();
            districtsQuery.refetch();
            areasQuery.refetch();
            oltQuery.refetch();
            onuQuery.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh Data
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListFilter className="h-5 w-5 text-blue-600" />
            Geo Filters
          </CardTitle>
          <CardDescription>Filters cascade automatically – updating higher tiers resets deeper selections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <CascadingSelect
              label="Region"
              placeholder="All regions"
              value={regionId}
              options={regionsQuery.data.map((region) => ({
                value: region.id,
                label: region.name,
              }))}
              loading={regionsQuery.isLoading}
              onChange={handleRegionChange}
            />
            <CascadingSelect
              label="City"
              placeholder={regionId ? 'All cities' : 'Select a region first'}
              value={cityId}
              options={citiesQuery.data.map((city) => ({ value: city.id, label: city.name }))}
              loading={citiesQuery.isLoading}
              disabled={!regionId}
              onChange={handleCityChange}
            />
            <CascadingSelect
              label="District"
              placeholder={cityId ? 'All districts' : 'Select a city first'}
              value={districtId}
              options={districtsQuery.data.map((district) => ({ value: district.id, label: district.name }))}
              loading={districtsQuery.isLoading}
              disabled={!cityId}
              onChange={handleDistrictChange}
            />
            <CascadingSelect
              label="Area"
              placeholder={districtId ? 'All areas' : 'Select a district first'}
              value={areaId}
              options={areasQuery.data.map((area) => ({ value: area.id, label: area.name }))}
              loading={areasQuery.isLoading}
              disabled={!districtId}
              onChange={handleAreaChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-600" /> Inventory Explorer
              </CardTitle>
              <CardDescription>Toggle between OLT and ONU records filtered by the geo hierarchy.</CardDescription>
            </div>
            <div className="flex gap-2 rounded-full border bg-slate-50 p-1" role="tablist" aria-label="Inventory sections">
              {TAB_ORDER.map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  id={TAB_CONFIG[tab].tabId}
                  aria-controls={TAB_CONFIG[tab].panelId}
                  aria-selected={activeTab === tab}
                  tabIndex={activeTab === tab ? 0 : -1}
                  ref={(node) => {
                    tabRefs.current[tab] = node;
                  }}
                  className={cn(
                    'rounded-full px-4 py-1 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    activeTab === tab ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
                  )}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab)}
                >
                  {TAB_CONFIG[tab].label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="tabpanel"
            id={TAB_CONFIG.olts.panelId}
            aria-labelledby={TAB_CONFIG.olts.tabId}
            hidden={activeTab !== 'olts'}
          >
            <InventorySection
              type="olt"
              items={oltQuery.items}
              paginationTotal={oltQuery.pagination?.total}
              paginationPages={oltQuery.pagination?.totalPages}
              page={oltPage}
              isLoading={oltQuery.isLoading}
              isError={oltQuery.isError}
              errorLabel="Could not load OLT inventory"
              searchValue={oltSearch}
              onSearchChange={setOltSearch}
              onPageChange={setOltPage}
              onPrimaryAction={(item) => {
                setSelectedOltId(item.id);
                setOnuPage(1);
                setActiveTab('onus');
              }}
              searchInputRef={oltSearchRef}
              highlightedId={selectedOltId}
            />
          </div>
          <div
            role="tabpanel"
            id={TAB_CONFIG.onus.panelId}
            aria-labelledby={TAB_CONFIG.onus.tabId}
            hidden={activeTab !== 'onus'}
          >
            <InventorySection
              type="onu"
              items={onuQuery.items}
              paginationTotal={onuQuery.pagination?.total}
              paginationPages={onuQuery.pagination?.totalPages}
              page={onuPage}
              isLoading={onuQuery.isLoading}
              isError={onuQuery.isError}
              errorLabel="Could not load ONU inventory"
              searchValue={onuSearch}
              onSearchChange={setOnuSearch}
              onPageChange={setOnuPage}
              oltOptions={oltOptions}
              selectedOltId={selectedOltId}
              onOltFilterChange={(value) => {
                setSelectedOltId(value || undefined);
                setOnuPage(1);
              }}
              searchInputRef={onuSearchRef}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface InventorySectionProps {
  type: 'olt' | 'onu';
  items: Array<OltListItemDto | OnuListItemDto>;
  paginationTotal?: number;
  paginationPages?: number;
  page: number;
  isLoading: boolean;
  isError: boolean;
  errorLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPrimaryAction?: (item: OltListItemDto) => void;
  oltOptions?: Array<{ value: string; label: string }>;
  selectedOltId?: string;
  onOltFilterChange?: (value?: string) => void;
  searchInputRef?: RefObject<HTMLInputElement>;
  highlightedId?: string;
}

function InventorySection({
  type,
  items,
  paginationTotal,
  paginationPages,
  page,
  isLoading,
  isError,
  errorLabel,
  searchValue,
  onSearchChange,
  onPageChange,
  onPrimaryAction,
  oltOptions = [],
  selectedOltId,
  onOltFilterChange,
  searchInputRef,
  highlightedId,
}: InventorySectionProps) {
  const isOlt = type === 'olt';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchInputRef}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={isOlt ? 'Search by hostname, IP, geo label…' : 'Search by ONU ID, serial, MAC…'}
            className="pl-10"
          />
        </div>
        {!isOlt && (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Focus ONUs for a specific OLT</label>
            <select
              value={selectedOltId ?? ''}
              onChange={(event) => onOltFilterChange?.(event.target.value || undefined)}
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
            >
              <option value="">All OLTs (respect geo filters)</option>
              {oltOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="rounded-lg border" aria-live="polite" aria-busy={isLoading}>
        <div className="overflow-auto" role="region" aria-label={isOlt ? 'OLT results' : 'ONU results'}>
          <Table className="min-w-[900px] text-sm">
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                {isOlt ? (
                  <>
                    <TableHead>OLT Name</TableHead>
                    <TableHead>OLT ID</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>District</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>ONU Name</TableHead>
                    <TableHead>ONU ID</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>MAC</TableHead>
                    <TableHead>OLT</TableHead>
                    <TableHead>Region / City</TableHead>
                    <TableHead>District / Area</TableHead>
                    <TableHead>Status</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} role="status" aria-live="polite">
                    <div className="space-y-3 py-6">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-10/12" />
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && isError && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-red-600" role="alert">
                    {errorLabel}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-slate-500" role="status" aria-live="polite">
                    No {isOlt ? 'OLTs' : 'ONUs'} match the current filters.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && items.length > 0 &&
                items.map((item) =>
                  isOlt ? (
                    <OltRow
                      key={item.id}
                      olt={item as OltListItemDto}
                      onPrimaryAction={onPrimaryAction}
                      isSelected={highlightedId === item.id}
                    />
                  ) : (
                    <OnuRow key={item.id} onu={item as OnuListItemDto} />
                  ),
                )}
            </TableBody>
          </Table>
        </div>
        <div className="px-4 pb-4">
          <PaginationControls
            page={page}
            totalPages={paginationPages}
            totalItems={paginationTotal}
            onPageChange={onPageChange}
            disabled={isLoading || isError}
          />
        </div>
      </div>
    </div>
  );
}

function OltRow({
  olt,
  onPrimaryAction,
  isSelected,
}: {
  olt: OltListItemDto;
  onPrimaryAction?: (item: OltListItemDto) => void;
  isSelected?: boolean;
}) {
  return (
    <TableRow
      className={cn(
        'hover:bg-slate-50',
        isSelected && 'border-l-4 border-blue-500 bg-blue-50/40'
      )}
      data-selected={isSelected}
      aria-selected={Boolean(isSelected)}
    >
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{olt.siteLabel || olt.hostname}</p>
          {olt.vendor && <p className="text-xs text-slate-500">{olt.vendor}</p>}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-slate-600">{olt.id}</TableCell>
      <TableCell>{olt.regionName ?? '—'}</TableCell>
      <TableCell>{olt.cityName ?? '—'}</TableCell>
      <TableCell>{olt.districtName ?? '—'}</TableCell>
      <TableCell>{olt.areaName ?? '—'}</TableCell>
      <TableCell>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          olt.status === 'active' || olt.isActive
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-600'
        )}>
          {olt.status}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/network/olts/${olt.id}`}>View Details</Link>
          </Button>
          {onPrimaryAction && (
            <Button size="sm" onClick={() => onPrimaryAction(olt)}>
              View ONUs
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function OnuRow({ onu }: { onu: OnuListItemDto }) {
  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{onu.name || 'Unnamed ONU'}</p>
          <p className="text-xs text-slate-500">Customer ID: {onu.customerId ?? '—'}</p>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-slate-600">{onu.id}</TableCell>
      <TableCell className="font-mono text-xs text-slate-600">{onu.serialNumber ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs text-slate-600">{onu.macAddress ?? '—'}</TableCell>
      <TableCell>
        <div>
          <p className="font-medium text-slate-900">{onu.oltName ?? '—'}</p>
          <p className="text-xs text-slate-500">{onu.portLabel ?? '—'}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-slate-600">
          <div>{onu.regionName ?? '—'}</div>
          <div className="text-xs text-slate-500">{onu.cityName ?? '—'}</div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm text-slate-600">
          <div>{onu.districtName ?? '—'}</div>
          <div className="text-xs text-slate-500">{onu.areaName ?? '—'}</div>
        </div>
      </TableCell>
      <TableCell>
        <span className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          onu.statusNote ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
        )}>
          {onu.statusNote ?? 'No status'}
        </span>
      </TableCell>
    </TableRow>
  );
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
