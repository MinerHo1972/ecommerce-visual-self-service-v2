"use client";

import { useCallback, useEffect, useState } from "react";
import { Server, Settings, RefreshCw } from "lucide-react";

type SettingsData = {
  appName: string;
  templateRepositoryMode: string;
  generationJobRepositoryMode: string;
  generationMode: string;
  qualityReviewEnabled: boolean;
  oss: {
    region: string;
    bucket: string;
    publicBaseUrl: string | null;
    uploadTokenMode: string;
  };
  system: {
    nodeVersion: string;
    platform: string;
    buildTime: string;
  };
};

function modeLabel(mode: string) {
  if (mode === "enabled") return { text: "已开启", color: "#0f766e" };
  if (mode === "disabled") return { text: "已关闭", color: "#6b7280" };
  if (mode === "mock") return { text: "Mock 内存", color: "#6b7280" };
  if (mode === "rds") return { text: "阿里云 RDS", color: "#0f766e" };
  if (mode === "aliyun") return { text: "阿里云 OSS", color: "#0f766e" };
  if (mode === "grsai") return { text: "GRSAI", color: "#7c3aed" };
  return { text: mode, color: "#334155" };
}

function ConfigRow({ label, value, modeTag }: { label: string; value: string; modeTag?: { text: string; color: string } }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 14, color: "#334155", fontWeight: 500 }}>{label}</span>
      {modeTag ? (
        <span style={{
          background: modeTag.color === "#6b7280" ? "#f1f5f9" : "#f0fdfa",
          color: modeTag.color,
          border: `1px solid ${modeTag.color}33`,
          borderRadius: 999,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 600,
        }}>
          {modeTag.text}
        </span>
      ) : (
        <span style={{ fontSize: 14, color: "var(--muted)" }}>{value}</span>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      } else {
        setError(data.error?.message ?? "加载配置失败");
      }
    } catch {
      setError("网络异常");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const toggleQualityReview = async () => {
    setToggling(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_quality_review" }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSettings((prev) => prev ? { ...prev, qualityReviewEnabled: data.data.qualityReviewEnabled } : prev);
      } else {
        setError(data.error?.message ?? "切换失败");
      }
    } catch {
      setError("网络异常");
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: 180 }}>
        <RefreshCw size={24} />
        <p>加载配置中...</p>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="alert error">
        <span>{error ?? "未知错误"}</span>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-2" style={{ gap: 16, alignItems: "start" }}>
        {/* 运行时配置 */}
        <section className="panel">
          <div className="panel-head">
            <h2><Settings size={17} style={{ marginRight: 6, verticalAlign: -3 }} />运行时配置</h2>
          </div>
          <ConfigRow label="应用名称" value={settings.appName} />
          <ConfigRow label="模板存储" value="" modeTag={modeLabel(settings.templateRepositoryMode)} />
          <ConfigRow label="任务存储" value="" modeTag={modeLabel(settings.generationJobRepositoryMode)} />
          <ConfigRow label="生成模式" value="" modeTag={modeLabel(settings.generationMode)} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <span style={{ fontSize: 14, color: "#334155", fontWeight: 500 }}>AI 图片质检</span>
              <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                关闭后不自动质检，历史图也不展示质检徽章和补检入口。设回 .env 持久化。
              </p>
            </div>
            <button
              onClick={toggleQualityReview}
              disabled={toggling}
              style={{
                position: "relative",
                width: 48, height: 26,
                borderRadius: 999,
                border: "none",
                cursor: toggling ? "not-allowed" : "pointer",
                background: settings.qualityReviewEnabled ? "#0f766e" : "#cbd5e1",
                transition: "background 0.2s",
                flexShrink: 0,
                opacity: toggling ? 0.6 : 1,
              }}
            >
              <span style={{
                position: "absolute",
                top: 3, left: settings.qualityReviewEnabled ? 25 : 3,
                width: 20, height: 20,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.15s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </section>

        {/* OSS 配置 */}
        <section className="panel">
          <div className="panel-head">
            <h2><Server size={17} style={{ marginRight: 6, verticalAlign: -3 }} />OSS 配置</h2>
          </div>
          <ConfigRow label="Region" value={settings.oss.region} />
          <ConfigRow label="Bucket" value={settings.oss.bucket} />
          <ConfigRow label="上传签名模式" value="" modeTag={modeLabel(settings.oss.uploadTokenMode)} />
          {settings.oss.publicBaseUrl && (
            <ConfigRow label="公开访问域名" value={settings.oss.publicBaseUrl} />
          )}
          <div style={{ padding: "10px 0", fontSize: 12, color: "var(--muted)" }}>
            AK / SK 已配置，不在界面展示。
          </div>
        </section>

        {/* 系统状态 */}
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-head">
            <h2>系统状态</h2>
          </div>
          <div className="metric-row">
            <span>Node {settings.system.nodeVersion}</span>
            <span>Platform: {settings.system.platform}</span>
            <span>构建时间: {new Date(settings.system.buildTime).toLocaleString("zh-CN")}</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            所有配置通过环境变量设定，当前为只读展示。如需修改请更新 .env 文件后重新部署。
          </p>
        </section>
      </div>
    </div>
  );
}
