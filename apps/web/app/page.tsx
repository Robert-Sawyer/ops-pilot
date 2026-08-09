const services = ["payments-api", "notifications-api", "user-service"];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Developer Operations Agent</p>
        <h1>Ops Pilot</h1>
        <p className="intro">
          The foundation for an AI agent that investigates operational issues with
          typed, auditable tool calls.
        </p>
      </section>

      <section aria-labelledby="workspace-title" className="workspace">
        <div>
          <p className="eyebrow">Stage 1</p>
          <h2 id="workspace-title">Project scaffold is ready</h2>
          <p>
            The chat workspace, tool execution, confirmation flow, and trace view
            will be built in the next stages.
          </p>
        </div>
        <div className="service-list" aria-label="Planned monitored services">
          {services.map((service) => (
            <span key={service}>{service}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
