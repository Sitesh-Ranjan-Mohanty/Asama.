import Icon from "./Icon.jsx";

const workspaceViews = [
  { view: "network", label: "Agent network", icon: "network", count: "12" },
  { view: "hardware", label: "Hardware assistant", icon: "cpu", status: true },
  { view: "agents", label: "My agents", icon: "users" },
  { view: "insights", label: "Insights", icon: "grid" }
];

const managementViews = [
  { view: "settings", label: "Settings", icon: "sliders" }
];

function NavigationItems({ items }) {
  return items.map(({ view, label, icon, count, status }) => (
    <button
      className={`nav-item${view === "network" ? " active" : ""}`}
      key={view}
      type="button"
      data-view={view}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {count && <span className="nav-count">{count}</span>}
      {status && <span className="nav-status" />}
    </button>
  ));
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Asama home" data-view="network">
        <span className="brand-mark"><span /><span /><span /><span /></span>
        <span className="brand-name">asama<span>.</span></span>
      </a>
      <button className="workspace-switcher" type="button" data-action="workspace-menu" aria-label="Switch workspace">
        <span className="workspace-avatar">N</span>
        <span className="workspace-copy"><strong>Northstar Labs</strong><span>Workspace</span></span>
        <Icon name="chevron" className="icon switch-chevron" />
      </button>
      <div className="nav-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Main navigation">
        <NavigationItems items={workspaceViews} />
      </nav>
      <div className="nav-label nav-label-spaced">MANAGE</div>
      <nav className="primary-nav" aria-label="Workspace management">
        <NavigationItems items={managementViews} />
        <button className="nav-item" type="button" data-action="open-guide" aria-label="Help guide">
          <Icon name="spark" /><span>Help guide</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <section className="sidebar-help">
          <div className="help-icon"><Icon name="spark" /></div>
          <strong>Need a hand?</strong>
          <p>Explore the Asama guide to get started.</p>
          <button type="button" className="text-link" data-action="open-guide">
            Open guide <Icon name="arrow" />
          </button>
        </section>
        <button className="profile-button" type="button" data-action="profile-menu">
          <span className="profile-avatar">AK</span>
          <span className="profile-details"><strong>Arjun Kapoor</strong><span>Admin</span></span>
          <Icon name="more" />
        </button>
      </div>
    </aside>
  );
}
