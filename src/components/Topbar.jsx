import Icon from "./Icon.jsx";

export default function Topbar() {
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>Northstar Labs</span>
        <Icon name="chevron" />
        <strong id="breadcrumb-current">Agent network</strong>
      </div>
      <div className="topbar-actions">
        <span className="environment-pill"><span /> Demo environment</span>
        <button className="icon-button search-button" aria-label="Search" type="button" data-action="search">
          <Icon name="search" /><span>Search <kbd>⌘ K</kbd></span>
        </button>
        <button className="icon-button notification-button" aria-label="Notifications" type="button" data-action="notifications">
          <Icon name="bell" /><i />
        </button>
        <button className="topbar-avatar profile-top-button" type="button" aria-label="Account menu" data-action="profile-menu">AK</button>
      </div>
    </header>
  );
}
