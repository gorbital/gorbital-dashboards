import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Checkbox as RadixCheckbox, Switch as RadixSwitch } from "radix-ui";

/* One look for every control: code-dark ground, hairline border, lime ring when focused. */
const control =
  "w-full rounded-lg border border-border bg-code-bg px-2.5 text-[12px] text-text placeholder:text-faint outline-none transition-colors hover:border-border-2 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger/50";

export function Input({ className = "", mono, ...rest }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={`${control} h-8 ${mono ? "font-mono" : ""} ${className}`} {...rest} />;
}

export function Textarea({ className = "", mono, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return <textarea rows={rows} className={`${control} resize-y py-1.5 leading-[1.6] ${mono ? "font-mono" : ""} ${className}`} {...rest} />;
}

/** A native select, dressed like the other controls. Pass `<option>`s as children. */
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative inline-flex w-full ${className}`}>
      <select className={`${control} h-8 appearance-none pr-8`} {...rest}>
        {children}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dim" />
    </span>
  );
}

type SwitchProps = { checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean; id?: string; "aria-label"?: string; className?: string };

export function Switch({ className = "", ...rest }: SwitchProps) {
  return (
    <RadixSwitch.Root
      className={`relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full border border-border bg-elevated transition-colors data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <RadixSwitch.Thumb className="block h-[12px] w-[12px] translate-x-[2px] rounded-full bg-muted transition-transform data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-primary" />
    </RadixSwitch.Root>
  );
}

type CheckboxProps = { checked?: boolean | "indeterminate"; defaultChecked?: boolean; onCheckedChange?: (checked: boolean | "indeterminate") => void; disabled?: boolean; id?: string; "aria-label"?: string; className?: string };

export function Checkbox({ className = "", ...rest }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border border-border bg-code-bg transition-colors hover:border-border-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <RadixCheckbox.Indicator className="text-bg data-[state=indeterminate]:text-primary">
        <Check size={11} strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

export function Label({ children, htmlFor, className = "" }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`font-mono text-[10px] uppercase tracking-wider text-dim ${className}`}>
      {children}
    </label>
  );
}

type FieldProps = {
  label: ReactNode;
  /** The control's id, so the label focuses it. */
  htmlFor?: string;
  /** One line under the control: the type, the bounds, an example. */
  hint?: ReactNode;
  /** Replaces the hint in danger tone when set. */
  error?: ReactNode;
  /** Puts the control before the label, for a Switch or Checkbox. */
  inline?: boolean;
  children: ReactNode;
  className?: string;
};

/** Label, control and a hint or an error, stacked. */
export function Field({ label, htmlFor, hint, error, inline, children, className = "" }: FieldProps) {
  const note = error ? <span className="text-[11px] text-danger">{error}</span> : hint ? <span className="text-[11px] text-dim">{hint}</span> : null;
  if (inline) {
    return (
      <div className={`grid gap-1 ${className}`}>
        <label htmlFor={htmlFor} className="flex items-center gap-2.5 text-[12px] text-text">
          {children}
          {label}
        </label>
        {note}
      </div>
    );
  }
  return (
    <div className={`grid gap-1 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {note}
    </div>
  );
}
