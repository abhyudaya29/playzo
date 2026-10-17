'use client';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
export function OptionSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (string | { value: string; label: string })[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} className="w-full bg-white">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const entry =
            typeof option === 'string'
              ? { value: option, label: option }
              : option;
          return (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
