/** @jsxImportSource frog/jsx */

/* Reusable JSX image components for Farcaster Frames.
 * Frog uses these to generate OG images via Satori. */

export function FrameContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(145deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)',
        padding: '48px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

export function FrameTitle({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: '42px',
        fontWeight: 700,
        color: '#ffffff',
        letterSpacing: '-0.02em',
      }}
    >
      {children}
    </div>
  );
}

export function FrameSubtitle({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: '22px',
        color: 'rgba(255,255,255,0.5)',
        marginTop: '8px',
      }}
    >
      {children}
    </div>
  );
}

export function FrameBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 24px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', fontSize: '13px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', fontSize: '28px', fontWeight: 600, color: color || '#ffffff', marginTop: '4px' }}>
        {value}
      </div>
    </div>
  );
}

export function FrameLogo() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginTop: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.1)',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        E
      </div>
      <div style={{ display: 'flex', fontSize: '16px', color: 'rgba(255,255,255,0.35)' }}>
        EliosBase · Base Network
      </div>
    </div>
  );
}

export function FrameStatusDot({ status }: { status: 'online' | 'busy' | 'offline' | string }) {
  const colors: Record<string, string> = {
    online: '#22c55e',
    busy: '#eab308',
    offline: 'rgba(255,255,255,0.3)',
  };
  return (
    <div
      style={{
        display: 'flex',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: colors[status] || colors.offline,
      }}
    />
  );
}

export function FrameProgressBar({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '24px' }}>
      {steps.map((step, i) => (
        <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: '2px solid',
                borderColor: i <= currentIndex ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
                background: i <= currentIndex
                  ? i === currentIndex
                    ? '#ffffff'
                    : 'rgba(255,255,255,0.4)'
                  : 'transparent',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: '10px',
                color: i <= currentIndex ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                marginTop: '6px',
              }}
            >
              {step}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
