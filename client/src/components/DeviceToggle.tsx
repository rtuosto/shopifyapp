import { Button } from "@/components/ui/button";
import { Monitor, Tablet, Smartphone } from "lucide-react";

export type DeviceType = "desktop" | "tablet" | "mobile";

interface DeviceToggleProps {
  selected: DeviceType;
  onChange: (device: DeviceType) => void;
}

export default function DeviceToggle({ selected, onChange }: DeviceToggleProps) {
  const devices: { type: DeviceType; icon: typeof Monitor; label: string }[] = [
    { type: "desktop", icon: Monitor, label: "Desktop" },
    { type: "tablet", icon: Tablet, label: "Tablet" },
    { type: "mobile", icon: Smartphone, label: "Mobile" },
  ];

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg" data-testid="device-toggle">
      {devices.map(({ type, icon: Icon, label }) => (
        <Button
          key={type}
          variant={selected === type ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onChange(type)}
          className={`gap-2 ${selected === type ? "bg-background shadow-sm" : ""}`}
          data-testid={`button-device-${type}`}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}