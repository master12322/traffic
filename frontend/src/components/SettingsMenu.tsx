import { useEffect, useState } from "react";
import { Bell, BellOff, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { notificationPermission, pushSupported } from "@/lib/push";

interface SettingsMenuProps {
  pushEnabled: boolean;
  onTogglePush: (enabled: boolean) => void;
  busy?: boolean;
}

export function SettingsMenu({ pushEnabled, onTogglePush, busy }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  // Re-read permission whenever the menu opens (it can change in browser UI).
  useEffect(() => {
    if (open) setPerm(notificationPermission());
  }, [open]);

  const supported = pushSupported();
  const blocked = perm === "denied";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Settings"
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-border bg-secondary/50 text-foreground transition hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 sm:h-10 sm:w-10"
      >
        <Settings className="h-[18px] w-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <DropdownMenuLabel className="px-3 py-2.5">Settings</DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <div className="px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">
                {pushEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">Push notifications</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Get an OS alert when your watch area jams, even in another tab.
                </p>
              </div>
            </div>
            <Switch
              aria-label="Toggle push notifications"
              checked={pushEnabled}
              disabled={!supported || blocked || busy}
              onCheckedChange={onTogglePush}
            />
          </div>

          {!supported && (
            <p className="mt-2 text-[11px] text-amber-400">
              This browser doesn’t support Web Push.
            </p>
          )}
          {supported && blocked && (
            <p className="mt-2 text-[11px] text-amber-400">
              Notifications are blocked — enable them in your browser’s site settings.
            </p>
          )}
          {supported && !blocked && (
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              {pushEnabled
                ? busy
                  ? "Updating…"
                  : "On — alerts arrive while any Traffic Radar tab is open."
                : "Off — no notifications."}
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
