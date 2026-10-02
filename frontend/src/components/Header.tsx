import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { ModeToggle } from "@/components/ModeToggle";
import { SettingsMenu } from "@/components/SettingsMenu";

interface HeaderProps {
  connected: boolean;
  lastTick: number | null;
  pushEnabled: boolean;
  onTogglePush: (enabled: boolean) => void;
  pushBusy?: boolean;
}

export function Header({ connected, lastTick, pushEnabled, onTogglePush, pushBusy }: HeaderProps) {
  const age = lastTick ? Math.max(0, Math.round((Date.now() - lastTick) / 1000)) : null;

  return (
    // `shrink-0` keeps the bar at full height and stops the logo and status
    // controls being squeezed on narrow phones: with both sides shrinking, the
    // fixed-width logo box lost width and the badge text clipped. Now only the
    // title/subtitle text is allowed to truncate.
    <header className="glass sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 px-3 sm:h-16 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 sm:h-10 sm:w-10">
          <Logo className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
          <span className="absolute inset-0 rounded-xl ring-1 ring-primary/40" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            Traffic&nbsp;Radar
            <span className="ml-2 hidden align-middle text-[10px] font-normal uppercase tracking-widest text-muted-foreground sm:inline">
              live congestion
            </span>
          </h1>
          <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
            <span className="hidden sm:inline">Phase 3 · </span>live traffic
            {age !== null && ` · updated ${age}s ago`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {connected ? (
          <Badge variant="success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <Wifi className="h-3 w-3" /> Live
          </Badge>
        ) : (
          <Badge variant="danger">
            <WifiOff className="h-3 w-3" /> Reconnecting…
          </Badge>
        )}
        <ModeToggle />
        <SettingsMenu pushEnabled={pushEnabled} onTogglePush={onTogglePush} busy={pushBusy} />
      </div>
    </header>
  );
}
