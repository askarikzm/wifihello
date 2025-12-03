'use client';

import { useId } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface CascadingSelectProps {
  label: string;
  value?: string;
  placeholder: string;
  options: Option[];
  onChange: (value: string | undefined) => void;
  loading?: boolean;
  disabled?: boolean;
  allLabel?: string;
}

export function CascadingSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  loading = false,
  disabled = false,
  allLabel,
}: CascadingSelectProps) {
  const resolvedPlaceholder = loading ? `Loading ${label}...` : placeholder;
  const triggerId = useId();
  const labelId = `${triggerId}-label`;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-600" id={labelId} htmlFor={triggerId}>
        {label}
      </label>
      <Select value={value ?? ''} onValueChange={(val) => onChange(val || undefined)}>
        <SelectTrigger
          id={triggerId}
          aria-labelledby={labelId}
          disabled={disabled}
          className={cn('bg-white', disabled && 'cursor-not-allowed opacity-60')}
        >
          <SelectValue placeholder={resolvedPlaceholder} />
        </SelectTrigger>
        {!disabled && (
          <SelectContent>
            <SelectItem value="">{allLabel || `All ${label}`}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        )}
      </Select>
    </div>
  );
}
