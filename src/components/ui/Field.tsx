import * as React from "react"

interface FieldProps {
  label?: React.ReactNode
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
  htmlFor?: string
}

export function Field({ label, hint, children, className = "", htmlFor }: FieldProps) {
  return (
    <div className={`field ${className}`.trim()}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <p className="hint" style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{hint}</p>}
    </div>
  )
}
