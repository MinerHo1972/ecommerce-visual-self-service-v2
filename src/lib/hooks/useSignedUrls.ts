"use client"

import * as React from "react"

/**
 * 批量签名 URL 拉取 hook，带并发限制。
 * - enqueue(id) 将单个资产加入拉取队列
 * - urls[id] 为已获取到的 signed url
 * 简单的固定窗口并发（p-limit 语义）。
 */
export function useSignedUrls(concurrency = 6, variant?: "thumb") {
  const [urls, setUrls] = React.useState<Record<string, string>>({})
  const queueRef = React.useRef<string[]>([])
  const inFlightRef = React.useRef<Set<string>>(new Set())
  const doneRef = React.useRef<Set<string>>(new Set())
  const epochRef = React.useRef(0)
  const pumpRef = React.useRef<() => void>(() => {})

  const fetchOne = React.useCallback(async (id: string) => {
    if (doneRef.current.has(id) || inFlightRef.current.has(id)) return
    const epoch = epochRef.current
    inFlightRef.current.add(id)
    try {
      const qs = variant ? `?variant=${variant}` : ""
      const res = await fetch(`/api/assets/${id}/signed-url${qs}`)
      if (epoch !== epochRef.current) return
      if (!res.ok) return
      const json = await res.json()
      if (epoch !== epochRef.current) return
      const url = json?.data?.url as string | undefined
      if (url) {
        setUrls((prev) => ({ ...prev, [id]: url }))
      }
    } catch {
      // ignore
    } finally {
      if (epoch !== epochRef.current) return
      inFlightRef.current.delete(id)
      doneRef.current.add(id)
      pumpRef.current()
    }
  }, [variant])

  const pump = React.useCallback(() => {
    while (inFlightRef.current.size < concurrency && queueRef.current.length > 0) {
      const id = queueRef.current.shift()
      if (!id) break
      if (doneRef.current.has(id) || inFlightRef.current.has(id)) continue
      void fetchOne(id)
    }
  }, [concurrency, fetchOne])

  React.useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  const enqueue = React.useCallback(
    (id: string) => {
      if (doneRef.current.has(id) || inFlightRef.current.has(id)) return
      if (queueRef.current.includes(id)) return
      queueRef.current.push(id)
      pump()
    },
    [pump]
  )

  const enqueueMany = React.useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        if (doneRef.current.has(id) || inFlightRef.current.has(id)) continue
        if (queueRef.current.includes(id)) continue
        queueRef.current.push(id)
      }
      pump()
    },
    [pump]
  )

  const reset = React.useCallback(() => {
    epochRef.current += 1
    queueRef.current = []
    inFlightRef.current.clear()
    doneRef.current.clear()
    setUrls({})
  }, [])

  return { urls, enqueue, enqueueMany, reset }
}
