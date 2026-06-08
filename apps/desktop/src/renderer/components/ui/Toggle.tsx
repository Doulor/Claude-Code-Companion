import React from "react";

interface ToggleProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <div
        className={`toggle ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
      >
        <div className="toggle-knob" />
      </div>
    </label>
  );
}
