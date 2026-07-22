"use client"

import * as React from "react"

interface FileButtonProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "id"> {
  children: React.ReactNode
  buttonClassName?: string
  id?: string
}

export function FileButton({
  children,
  buttonClassName = "",
  className,
  id: providedId,
  ...inputProps
}: FileButtonProps) {
  const autoId = React.useId()
  const id = providedId || `file-${autoId}`
  return (
    <div className="file-button" style={{ display: "inline-block" }}>
      <input id={id} type="file" className={className} {...inputProps} />
      <label htmlFor={id} className={`button primary ${buttonClassName}`.trim()}>
        {children}
      </label>
    </div>
  )
}
