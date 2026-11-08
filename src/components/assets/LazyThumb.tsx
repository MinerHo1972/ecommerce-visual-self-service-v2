"use client"

import * as React from "react"

interface LazyThumbProps {
  assetId: string
  signedUrl: string | undefined
  alt: string
  className?: string
}

/**
 * 缩略图组件。
 * - 缩略图体积很小（4-32KB），直接渲染 <img>，不用 IntersectionObserver 懒加载。
 * - 优先用签名 URL 直连 TOS CDN；未就绪时回退同源 /preview 代理。
 * - 签名 URL 加载失败自动回退同源 /preview 代理。
 */
export function LazyThumb({ assetId, signedUrl, alt, className }: LazyThumbProps) {
  const [useProxy, setUseProxy] = React.useState(false)
  const [errored, setErrored] = React.useState(false)

  // 签名 URL 切换时重置代理回退状态
  React.useEffect(() => {
    setUseProxy(false)
    setErrored(false)
  }, [signedUrl])

  const src = useProxy || !signedUrl
    ? `/api/assets/${assetId}/preview?variant=thumb`
    : signedUrl

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      {!errored ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          onError={() => {
            if (!useProxy && signedUrl) {
              setUseProxy(true)
            } else {
              setErrored(true)
            }
          }}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#94a3b8" }}>
          加载失败
        </div>
      )}
    </div>
  )
}
