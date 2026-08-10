interface AppHeaderProps {
  activeView: "chat" | "trace";
  traceStepCount?: number;
}

export function AppHeader({ activeView, traceStepCount = 0 }: AppHeaderProps) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Ops Pilot home">
        <span className="brand-mark" aria-hidden="true">
          OP
        </span>
        <span>
          <strong>Ops Pilot</strong>
          <small>Developer Operations Agent</small>
        </span>
      </a>

      <div className="topbar-actions">
        <nav className="view-navigation" aria-label="Workspace views">
          <a
            className={activeView === "chat" ? "is-active" : undefined}
            href="/"
            aria-current={activeView === "chat" ? "page" : undefined}
          >
            Chat
          </a>
          <a
            className={activeView === "trace" ? "is-active" : undefined}
            href="/trace"
            aria-current={activeView === "trace" ? "page" : undefined}
          >
            Agent trace
            {traceStepCount > 0 ? <span>{traceStepCount}</span> : null}
          </a>
        </nav>

        <div className="environment-pill">
          <span aria-hidden="true" />
          Local simulation
        </div>
      </div>
    </header>
  );
}
