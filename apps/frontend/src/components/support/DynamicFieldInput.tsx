// DynamicFieldInput — renders the right input widget for a
// SupportContextFieldDefinition and reports the value up. Used in
// the user submit wizard (write) and can also be used in the admin
// schema editor's preview.

import React, { useId } from 'react';
import type {
  SupportContextFieldDefinition,
  SupportFieldType,
} from './types';

export interface DynamicFieldInputProps {
  field: SupportContextFieldDefinition;
  value: string | number | boolean | null;
  onChange: (value: string | number | boolean | null) => void;
  /** When true (e.g. on the admin schema editor preview), the field
   *  is shown but disabled. */
  disabled?: boolean;
  /** When the user has tried to submit with this field missing/empty,
   *  the parent flips this to true to render the red border. */
  errored?: boolean;
}

function FieldShell({
  field,
  children,
  helpText,
  errored,
  disabled,
  id,
}: {
  field: SupportContextFieldDefinition;
  children: React.ReactNode;
  helpText?: string;
  errored?: boolean;
  disabled?: boolean;
  id: string;
}): React.ReactElement {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-ink-soft block mb-1">
        {field.label}
        {field.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {helpText && (
        <p className="text-[11px] text-ink-faint mt-1">{helpText}</p>
      )}
      {errored && (
        <p className="text-[11px] text-danger mt-1">This field is required.</p>
      )}
    </div>
  );
}

export function DynamicFieldInput({
  field,
  value,
  onChange,
  disabled = false,
  errored = false,
}: DynamicFieldInputProps): React.ReactElement {
  const id = useId();
  const common = 'rounded-xl border bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 transition-colors w-full px-3 py-2';
  const borderClass = errored ? 'border-danger' : 'border-border';
  const disabledClass = disabled ? 'opacity-60 cursor-not-allowed' : '';

  switch (field.type as SupportFieldType) {
    case 'text':
      return (
        <FieldShell field={field} helpText={field.helpText} errored={errored} disabled={disabled} id={id}>
          <input
            id={id}
            type="text"
            value={value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={`${common} ${borderClass} ${disabledClass}`}
          />
        </FieldShell>
      );
    case 'textarea':
      return (
        <FieldShell field={field} helpText={field.helpText} errored={errored} disabled={disabled} id={id}>
          <textarea
            id={id}
            value={value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder}
            maxLength={2000}
            rows={4}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={`${common} ${borderClass} ${disabledClass} resize-y`}
          />
        </FieldShell>
      );
    case 'number':
      return (
        <FieldShell field={field} helpText={field.helpText} errored={errored} disabled={disabled} id={id}>
          <input
            id={id}
            type="number"
            value={value === null || value === undefined ? '' : String(value)}
            placeholder={field.placeholder}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v === '' ? null : Number(v));
            }}
            className={`${common} ${borderClass} ${disabledClass}`}
          />
        </FieldShell>
      );
    case 'date':
      return (
        <FieldShell field={field} helpText={field.helpText} errored={errored} disabled={disabled} id={id}>
          <input
            id={id}
            type="date"
            value={value === null || value === undefined ? '' : String(value).slice(0, 10)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
            className={`${common} ${borderClass} ${disabledClass}`}
          />
        </FieldShell>
      );
    case 'boolean':
      return (
        <FieldShell field={field} helpText={field.helpText} errored={errored} disabled={disabled} id={id}>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              id={id}
              type="checkbox"
              checked={Boolean(value)}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-ink-soft">
              {value ? 'Yes' : 'No'}
            </span>
          </label>
        </FieldShell>
      );
    case 'dropdown':
      return (
        <FieldShell field={field} helpText={field.helpText} errored={errored} disabled={disabled} id={id}>
          <select
            id={id}
            value={value === null || value === undefined ? '' : String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
            className={`${common} ${borderClass} ${disabledClass}`}
          >
            <option value="">— select —</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FieldShell>
      );
  }
}
