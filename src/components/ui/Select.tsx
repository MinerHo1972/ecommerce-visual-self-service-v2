import * as React from "react"

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = "", children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={`select ${className}`.trim()} {...props}>
      {children}
    </select>
  )
})
