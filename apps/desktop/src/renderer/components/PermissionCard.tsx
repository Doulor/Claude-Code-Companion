import React from "react";
import type { PermissionRequest, ToolName } from "../../shared/events";
import { useI18n } from "../useI18n";
import { Shield, Check, X, AlertTriangle } from "lucide-react";

interface PermissionCardProps {
  permission: PermissionRequest;
  queueCount: number;
  onAllow: () => void;
  onDeny: () => void;
  settings: { permissionScale?: number; permissionOpacity?: number };
}

type Risk = "low" | "medium" | "high";

export function PermissionCard({ permission, queueCount, onAllow, onDeny, settings }: PermissionCardProps) {
  const { t } = useI18n();
  const risk = riskForTool(permission.toolName, permission.toolDetail);
  return (
    <div className={`permission-card permission-card-v2 risk-${risk}`} style={{ opacity: settings.permissionOpacity ?? 1, transform: `scale(${settings.permissionScale ?? 1})` }}>
      <div className="permission-header">
        <Shield size={16} />
        <span>{t("pet.permissionTitle", "Need confirmation")}</span>
        <span className={`permission-risk ${risk}`}><AlertTriangle size={12} /> {risk.toUpperCase()}</span>
        {queueCount > 1 && <span className="permission-badge">{queueCount}</span>}
      </div>
      <div className="permission-tool-row">
        <div>
          <div className="permission-tool">{permission.toolName}</div>
          <div className="permission-meta">{new Date(permission.timestamp).toLocaleTimeString()} · {permission.sessionId?.slice(0, 8) ?? "current session"}</div>
        </div>
      </div>
      {permission.toolDetail && <div className="permission-detail">{permission.toolDetail}</div>}
      <div className="permission-risk-note">{riskCopy(risk, permission.toolName)}</div>
      <div className="permission-actions">
        <button className="ghost-btn deny-btn" onClick={onDeny}>
          <X size={14} /> {t("pet.permissionDeny", "Deny")}
        </button>
        <button className="ghost-btn allow-btn" onClick={onAllow}>
          <Check size={14} /> {t("pet.permissionAllow", "Allow")}
        </button>
      </div>
    </div>
  );
}

function riskForTool(tool: ToolName, detail?: string): Risk {
  if (tool === "Bash") {
    const command = detail?.toLowerCase() ?? "";
    if (/rm\s|reset --hard|push --force|del\s|rmdir|kill|shutdown/.test(command)) return "high";
    return "high";
  }
  if (tool === "Edit" || tool === "Write" || tool === "Notebook") return "medium";
  return "low";
}

function riskCopy(risk: Risk, tool: ToolName): string {
  if (risk === "high") return `${tool} may change your system or repository. Review before allowing.`;
  if (risk === "medium") return `${tool} may modify project files.`;
  return `${tool} is usually read-only or low impact.`;
}
