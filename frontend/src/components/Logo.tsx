// Brand mark: a radar scope with a slowly sweeping beam and congestion blips.
// Inherits the surrounding text color via `currentColor` (so it tracks the
// theme's primary accent), with fixed traffic-signal colors for the blips.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* radar rings */}
      <g stroke="currentColor" fill="none">
        <circle cx="12" cy="12" r="9" strokeOpacity="0.22" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="5.5" strokeOpacity="0.4" strokeWidth="1" />
      </g>

      {/* sweeping beam — rotates around the scope centre */}
      <g
        className="origin-center motion-reduce:animate-none animate-[spin_3.5s_linear_infinite]"
        style={{ transformBox: "view-box", transformOrigin: "center" }}
      >
        <path d="M12 12 L12 3 A9 9 0 0 1 20 7.6 Z" fill="currentColor" fillOpacity="0.28" />
        <line x1="12" y1="12" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* congestion blips + hub */}
      <circle cx="17" cy="7.4" r="1.15" fill="#ef4444" />
      <circle cx="7.6" cy="16" r="1" fill="#f59e0b" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}
