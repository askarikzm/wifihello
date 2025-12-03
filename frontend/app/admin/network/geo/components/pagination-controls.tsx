'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface PaginationControlsProps {
  page: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function PaginationControls({ page, totalPages = 1, totalItems, onPageChange, disabled = false }: PaginationControlsProps) {
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
      <div>
        Page {page} of {Math.max(totalPages, 1)}
        {typeof totalItems === 'number' && (
          <span className="ml-2 text-xs text-slate-500">({totalItems.toLocaleString()} records)</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoPrev || disabled}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoNext || disabled}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
