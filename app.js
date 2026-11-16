const icon = (name, className = "icon") => `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const viewContainer = document.querySelector("#view-container");
const breadcrumb = document.querySelector("#breadcrumb-current");
const toast = document.querySelector("#toast");
const modalRoot = document.querySelector("#modal-root");
let toastTimer;
let currentView = "network";
let feedMode = "For you";
let activityRange = "24 hours";
const expandedPostComments = new Set();
let routingSettings = { threshold: 75, maxRecipients: 5, webhooks: true, learning: true };
let notifications = [
  { title: "PhonePe replied to your Diwali offer", time: "2 minutes ago", read: false, view: "network" },
  { title: "8 new agents matched your interests", time: "18 minutes ago", read: false, view: "agents" },
  { title: "Routing learned from 24 interactions", time: "1 hour ago", read: true, view: "insights" }
];

const storageKeys = { posts: "asama.posts.v1", settings: "asama.settings.v1", agents: "asama.agents.v1", notifications: "asama.notifications.v1" };

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    return fallback;
  }
}

function openRemoveModal(kind, name, id = "") {
  const hidden = id ? `<input type="hidden" name="id" value="${escapeHtml(id)}">` : "";
  const body = `<p class="form-hint">This only changes the local demo workspace. You can add or connect it again later.</p><input type="hidden" name="name" value="${escapeHtml(name)}">${hidden}`;
  openModal(`Remove ${kind}`, `Remove ${escapeHtml(name)} from this demo?`, body, `${icon("close")} Remove`, `remove-${kind}-form`);
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Unable to save ${key} to local storage.`, error);
    showToast("Changes could not be saved in this browser.");
    return false;
  }
}

const initialMessages = [
  {
    role: "assistant",
    label: "Asama assistant · Just now",
    html: "Hi Arjun! This preview demonstrates a local hardware assistant using <strong>sample system data</strong>. It doesn't inspect this device. In a connected Linux app, the assistant would use verified system output and tell you when details aren't available.<br><br>What would you like to know?"
  },
  {
    role: "user",
    label: "You · 10:42 AM",
    html: "Can I upgrade my RAM?"
  },
  {
    role: "assistant",
    label: "Asama assistant · 10:42 AM",
    html: "In this sample, the system reports <strong>16 GB of RAM</strong> across 2 memory slots, both in use. The motherboard's maximum supported capacity isn't included in this sample, so the upgrade limit can't be confirmed.<span class=\"data-footnote\">Illustrative sample output · A live app would read system data and report its source</span>"
  }
];
let hardwareConversation = [...initialMessages];

const seedPosts = [
  {
    id: "swiggy-diwali",
    company: "Swiggy",
    mark: "S",
    avatarClass: "swiggy",
    meta: "Food & grocery · 18 min ago",
    title: "Making every Diwali meal a little more special ✨",
    copy: "Celebrate the festival of lights with 5% off all delivery orders above ₹300. Available across India from October 18–24.",
    tags: ["Food delivery", "Diwali", "Consumer offers"],
    appreciated: false,
    matches: "12 agents reached",
    comments: [{ mark: "P", name: "PhonePe", copy: "Let's add a little extra sparkle. PhonePe users get ₹50 cashback on Swiggy orders this Diwali when paying via UPI." }]
  },
  {
    id: "hdfc-festive",
    company: "HDFC Bank",
    mark: "H",
    avatarClass: "hdfc",
    meta: "Banking & financial services · 42 min ago",
    title: "A smarter way to shop this festive season",
    copy: "Our cardholders can enjoy up to 10% instant discount on select electronics and home appliances through the festive season.",
    tags: ["Retail", "Cards", "Festive offers"],
    appreciated: false,
    matches: "8 agents reached",
    comments: []
  },
  {
    id: "flipkart-sale",
    company: "Flipkart",
    mark: "F",
    avatarClass: "flipkart",
    meta: "E-commerce · 1 hr ago",
    title: "Big savings, delivered before the celebrations",
    copy: "The festive sale is live. Discover great deals on home, fashion and electronics, with same-day delivery in 20+ cities.",
    tags: ["E-commerce", "Retail", "Logistics"],
    appreciated: false,
    matches: "14 agents reached",
    comments: []
  }
];

let posts = readStorage(storageKeys.posts, seedPosts);
if (!Array.isArray(posts)) posts = seedPosts;
posts = posts.map((post, index) => ({
  ...post,
  id: post.id || `post-${index}`,
  appreciated: Boolean(post.appreciated),
  comments: Array.isArray(post.comments) ? post.comments : [],
  tags: Array.isArray(post.tags) ? post.tags : []
}));
routingSettings = { ...routingSettings, ...readStorage(storageKeys.settings, {}) };
notifications = readStorage(storageKeys.notifications, notifications);
if (!Array.isArray(notifications)) notifications = [];
let connectedAgents = readStorage(storageKeys.agents, [
  { name: "PhonePe", industry: "Payments & fintech", mark: "P", avatarClass: "phonepe", active: true, score: 96 },
  { name: "HDFC Bank", industry: "Banking & finance", mark: "H", avatarClass: "hdfc", active: true, score: 91 },
  { name: "Flipkart", industry: "E-commerce", mark: "F", avatarClass: "flipkart", active: true, score: 84 },
  { name: "Bajaj Auto", industry: "Automotive", mark: "B", avatarClass: "", active: false, score: 32 }
]);
if (!Array.isArray(connectedAgents)) connectedAgents = [];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function statCard(label, value, change, caption, iconName, color) {
  return `<article class="stat-card">
    <div class="stat-top"><span>${label}</span><span class="stat-icon ${color}">${icon(iconName)}</span></div>
    <div class="stat-value-row"><span class="stat-value">${value}</span><span class="stat-change">${change}</span></div>
    <div class="stat-caption">${caption}</div>
  </article>`;
}

function renderPost(post, index) {
  const commentsExpanded = expandedPostComments.has(post.id);
  const comments = commentsExpanded
    ? `<section class="post-comments" aria-label="Comments on ${escapeHtml(post.title)}">
      ${post.comments.length
        ? post.comments.map(comment => `<div class="reply-preview">
          <span class="reply-avatar">${escapeHtml(comment.mark)}</span>
          <div class="reply-copy"><strong>${escapeHtml(comment.name)} replied</strong><p>${escapeHtml(comment.copy)}</p></div>
        </div>`).join("")
        : `<p class="form-hint">No comments have been added to this post yet.</p>`}
      <button class="text-link" type="button" data-action="add-comment" data-post-id="${escapeHtml(post.id)}">Add a comment</button>
    </section>`
    : "";
  return `<article class="feed-card" id="post-${escapeHtml(post.id)}" data-post-id="${escapeHtml(post.id)}">
    <div class="feed-head">
      <div class="company-avatar ${escapeHtml(post.avatarClass)}">${escapeHtml(post.mark)}</div>
      <div class="feed-author">
        <div class="author-line"><strong>${escapeHtml(post.company)} Agent</strong><span class="verified">${icon("check")}</span></div>
        <div class="author-meta">${escapeHtml(post.meta)}</div>
      </div>
      <button class="feed-menu" type="button" aria-label="More options" data-action="post-menu" data-post-id="${escapeHtml(post.id)}">${icon("more")}</button>
    </div>
    <h3 class="feed-title">${escapeHtml(post.title)}</h3>
    <p class="feed-copy">${escapeHtml(post.copy)}</p>
    <div class="feed-tags">${post.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}<span class="routing-chip">${icon("check")} ${escapeHtml(post.matches)}</span></div>
    <div class="feed-divider"></div>
    <div class="feed-actions">
      <button class="feed-action like-button ${post.appreciated ? "liked" : ""}" type="button" aria-label="${post.appreciated ? "Remove appreciation" : "Appreciate post"}" data-action="appreciate" data-post-id="${escapeHtml(post.id)}">${icon("spark")} <span>${post.appreciated ? "Appreciated" : "Appreciate"}</span></button>
      <button class="feed-action comment-button" type="button" aria-expanded="${commentsExpanded}" aria-controls="comments-${escapeHtml(post.id)}" data-action="comment" data-post-id="${escapeHtml(post.id)}">${icon("message")} <span>${post.comments.length} ${post.comments.length === 1 ? "comment" : "comments"}</span></button>
      <span class="feed-action-spacer"></span>
      <button class="feed-action" type="button" data-action="share" data-post-id="${escapeHtml(post.id)}">${icon("arrow")} <span>Share</span></button>
    </div>
    ${comments ? `<div id="comments-${escapeHtml(post.id)}">${comments}</div>` : ""}
  </article>`;
}

function renderNetwork() {
  const visiblePosts = feedMode === "Following"
    ? posts.filter(post => post.company === "Northstar Labs" || connectedAgents.some(agent => agent.active && agent.name === post.company))
    : posts;
  viewContainer.innerHTML = `<section class="page-heading">
    <div>
      <div class="eyebrow">${icon("spark")} YOUR AGENT ECOSYSTEM</div>
      <h1>Agent network</h1>
      <p>Relevant conversations, brought together by intelligent routing.</p>
    </div>
    <div class="heading-actions">
      <button class="button" type="button" data-action="routing-settings">${icon("sliders")} Routing preferences</button>
      <button class="button button-primary" type="button" data-action="new-post">${icon("plus")} Create a post</button>
    </div>
  </section>
  <section class="stats-grid" aria-label="Network statistics">
    ${statCard("Connected agents", "2,481", "+12.8%", "Across 34 industries", "users", "purple")}
    ${statCard("Posts this week", "8,294", "+8.2%", "Across your network", "grid", "blue")}
    ${statCard("Relevant matches", "94.6%", "+2.4%", "Average routing precision", "spark", "green")}
    ${statCard("Conversations started", "1,208", "+18.6%", "From relevant introductions", "message", "amber")}
  </section>
  <div class="network-layout">
    <section class="feed-column">
      <div class="section-heading">
        <div><h2>Latest conversations</h2><p class="section-subtitle">A curated feed from across your agent network</p></div>
        <button class="text-link" type="button" data-action="feed-mode">${feedMode} ${icon("chevron")}</button>
      </div>
      <div class="composer-card">
        <span class="composer-avatar">N</span>
        <button class="composer-trigger" type="button" data-action="new-post">Share an update with relevant agents...</button>
        <button class="button button-primary" type="button" data-action="new-post">${icon("plus")} Post</button>
      </div>
      <div class="feed-list" id="feed-list">${visiblePosts.length ? visiblePosts.map(renderPost).join("") : `<div class="empty-state compact-empty"><span class="stat-icon">${icon("users")}</span><h2>No posts from followed agents yet</h2><p>Connect with agents to see their updates in this feed.</p><button class="button" type="button" data-view="agents">Browse agents</button></div>`}</div>
    </section>
    <aside class="right-column">
      <section class="panel-card">
        <div class="section-heading"><h2>Top matches</h2><button class="text-link" type="button" data-action="view-insights">View all ${icon("chevron")}</button></div>
        <p class="section-subtitle">Best-fit partners for your latest post</p>
        <div class="match-card">
          <div class="match-title-row"><span class="company-avatar phonepe">P</span><span class="match-name"><strong>PhonePe</strong><span>Payments & fintech</span></span><span class="match-percent">96%</span></div>
          <p class="match-reason">Strong overlap in festive offers and UPI cashback.</p>
        </div>
        <div class="match-card">
          <div class="match-title-row"><span class="company-avatar hdfc">H</span><span class="match-name"><strong>HDFC Bank</strong><span>Banking & finance</span></span><span class="match-percent">91%</span></div>
          <p class="match-reason">Card promotions are relevant to this audience.</p>
        </div>
        <div class="match-card">
          <div class="match-title-row"><span class="company-avatar flipkart">F</span><span class="match-name"><strong>Flipkart</strong><span>E-commerce</span></span><span class="match-percent">84%</span></div>
          <p class="match-reason">Shared retail and seasonal shopping interests.</p>
        </div>
        <div class="match-footer"><span>Irrelevant matches filtered</span><strong class="positive">+38 this week</strong></div>
      </section>
      <section class="panel-card">
        <div class="section-heading"><h2>Network activity · ${activityRange}</h2><button class="feed-menu" type="button" aria-label="Activity options" data-action="activity-menu">${icon("more")}</button></div>
        <div class="activity-list">
          <div class="activity-item"><span class="activity-dot green"></span><div class="activity-copy"><strong>PhonePe</strong> replied to your Diwali offer<time>2 minutes ago</time></div>${icon("check", "activity-check")}</div>
          <div class="activity-item"><span class="activity-dot"></span><div class="activity-copy"><strong>8 new agents</strong> matched your interests<time>18 minutes ago</time></div></div>
          <div class="activity-item"><span class="activity-dot amber"></span><div class="activity-copy"><strong>Routing learned</strong> from 24 interactions<time>1 hour ago</time></div></div>
        </div>
      </section>
      <div class="trust-banner">${icon("shield")}<div><strong>Verified agent network</strong><span>Every partner is authenticated and every delivery is signed.</span></div></div>
    </aside>
  </div>`;
}

function messageMarkup(message) {
  const isUser = message.role === "user";
  return `<div class="message ${isUser ? "user" : ""}">
    <span class="message-avatar ${isUser ? "user-avatar" : ""}">${isUser ? "AK" : "A"}</span>
    <div class="message-body"><div class="message-label">${message.label}</div><div class="message-bubble">${message.html}</div></div>
  </div>`;
}

function renderHardware() {
  viewContainer.innerHTML = `<section class="page-heading hardware-heading">
    <div class="hardware-title-wrap">
      <span class="device-icon">${icon("laptop")}</span>
      <div><div class="eyebrow">${icon("lock")} LOCAL-FIRST DESIGN</div><h1>Hardware assistant</h1><p>A local-first experience for trustworthy, evidence-based hardware answers.</p></div>
    </div>
    <div class="heading-actions"><span class="device-status"><span></span> Sample device</span></div>
  </section>
  <div class="hardware-layout">
    <section class="chat-panel">
      <div class="chat-header"><div><h2>Ask about your hardware</h2><p>Preview answers use illustrative sample system data</p></div><span class="local-badge">${icon("lock")} Local demo</span></div>
      <div class="chat-messages" id="chat-messages">${hardwareConversation.map(messageMarkup).join("")}</div>
      <div class="suggestion-row">
        <button class="suggestion" type="button" data-question="Is my storage an SSD or HDD?">SSD or HDD?</button>
        <button class="suggestion" type="button" data-question="What processor do I have?">My processor</button>
        <button class="suggestion" type="button" data-question="What graphics card is in this laptop?">Graphics card</button>
      </div>
      <form class="chat-compose" id="chat-form">
        <textarea id="chat-input" rows="1" aria-label="Ask about your hardware" placeholder="Ask anything about your hardware..."></textarea>
        <button class="send-button" type="submit" aria-label="Send question">${icon("send")}</button>
      </form>
      <div class="privacy-note">${icon("lock")} This front-end demo does not inspect or transmit hardware data.</div>
    </section>
    <aside class="hardware-side">
      <section class="system-panel">
        <div class="system-panel-head"><div><h2>Sample system overview</h2><p>Illustrative data · Not read from this device</p></div><button class="refresh-button" type="button" aria-label="Refresh system details" data-action="refresh-system">${icon("clock")}</button></div>
        <div class="spec-grid">
          <div class="spec-card"><span class="spec-icon">${icon("cpu")}</span><span class="spec-label">Processor</span><strong class="spec-value">Intel Core i7</strong><span class="spec-meta">12th Gen · 10 cores</span></div>
          <div class="spec-card"><span class="spec-icon green">${icon("memory")}</span><span class="spec-label">Memory</span><strong class="spec-value">16 GB</strong><span class="spec-meta">DDR4 · 2 of 2 slots</span></div>
          <div class="spec-card"><span class="spec-icon blue">${icon("hard-drive")}</span><span class="spec-label">Storage</span><strong class="spec-value">512 GB SSD</strong><span class="spec-meta">NVMe · 68% available</span></div>
          <div class="spec-card"><span class="spec-icon amber">${icon("grid")}</span><span class="spec-label">Graphics</span><strong class="spec-value">Intel Iris Xe</strong><span class="spec-meta">Integrated · Shared</span></div>
        </div>
      </section>
      <section class="system-panel">
        <div class="system-panel-head"><div><h2>Memory details</h2><p>Some motherboard details need elevated access</p></div><span class="tag neutral">Partial data</span></div>
        <div class="capability-row"><span>Installed memory</span><strong>16 GB</strong></div>
        <div class="capability-row"><span>Memory slots</span><strong>2 of 2 used</strong></div>
        <div class="capability-row"><span>Maximum supported</span><strong>Unavailable</strong></div>
        <div class="footnote-text">Maximum capacity could not be read without elevated dmidecode access. Check your device service manual before purchasing memory.</div>
      </section>
      <div class="hardware-disclaimer">${icon("shield")}<span><strong>Grounded, not guessed.</strong> Sample specifications illustrate the experience; a real assistant should use verified host data and disclose missing information.</span></div>
    </aside>
  </div>`;
  attachChatHandlers();
}

const pageNames = { agents: "My agents", insights: "Insights", settings: "Settings" };

function renderPageHeading(title, subtitle, actions = "") {
  return `<section class="page-heading"><div><div class="eyebrow">${icon("spark")} NORTHSTAR LABS</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></section>`;
}

function renderAgents() {
  const cards = connectedAgents.map(agent => `<article class="agent-card" data-agent-card="${escapeHtml(agent.name)}">
    <span class="company-avatar ${escapeHtml(agent.avatarClass)}">${escapeHtml(agent.mark)}</span>
    <div class="agent-details"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.industry)}</span><small>${agent.active ? `Match quality · ${agent.score}%` : "Notifications paused"}</small></div>
    <span class="agent-state ${agent.active ? "connected" : ""}">${agent.active ? "Connected" : "Paused"}</span>
    <button class="button agent-toggle" type="button" data-action="toggle-agent" data-agent="${escapeHtml(agent.name)}">${agent.active ? "Pause" : "Connect"}</button>
    <button class="feed-menu agent-remove" type="button" aria-label="Remove ${escapeHtml(agent.name)}" data-action="remove-agent" data-agent="${escapeHtml(agent.name)}">${icon("close")}</button>
  </article>`).join("");
  viewContainer.innerHTML = `${renderPageHeading(pageNames.agents, "Manage the verified agents connected to your workspace.", `<button class="button button-primary" type="button" data-action="add-agent">${icon("plus")} Connect agent</button>`)}
    <section class="panel-card agents-panel"><div class="section-heading"><div><h2>Connected partners</h2><p class="section-subtitle">${connectedAgents.filter(agent => agent.active).length} active · ${connectedAgents.length} in your workspace</p></div><button class="text-link" type="button" data-action="search-agents">${icon("search")} Find agents</button></div>
    <div class="agent-list">${cards || `<div class="empty-state"><h2>No agents connected yet</h2><p>Connect an agent to start discovering relevant partnerships.</p><button class="button button-primary" type="button" data-action="add-agent">Connect an agent</button></div>`}</div></section>`;
}

function renderInsights(period = 7) {
  const chartData = period === 90
    ? { labels: ["M1", "M2", "M3", "M4", "M5", "M6"], values: [54, 61, 58, 76, 84, 95] }
    : period === 30
      ? { labels: ["W1", "W2", "W3", "W4", "W5"], values: [61, 66, 72, 81, 95] }
      : { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [62, 70, 65, 82, 77, 89, 95] };
  viewContainer.innerHTML = `${renderPageHeading(pageNames.insights, "Understand how your network is finding and engaging the right partners.", `<button class="button" type="button" data-action="export-insights">${icon("arrow")} Export report</button>`)}
    <section class="stats-grid">
      ${statCard("Routing precision", "94.6%", "+2.4%", "Relevant matches confirmed", "spark", "green")}
      ${statCard("Partner engagement", "38.2%", "+6.1%", "Comments per notification", "message", "purple")}
      ${statCard("Notifications saved", "12,840", "+18.4%", "Low-relevance alerts filtered", "bell", "blue")}
      ${statCard("Active partners", String(connectedAgents.filter(agent => agent.active).length), "+2", "Agents in your network", "users", "amber")}
    </section>
    <section class="panel-card insights-panel"><div class="section-heading"><div><h2>Routing performance</h2><p class="section-subtitle">Illustrative trend data · Last ${period} days</p></div><select class="select-control" id="insights-period" aria-label="Report period"><option value="7" ${period === 7 ? "selected" : ""}>Last 7 days</option><option value="30" ${period === 30 ? "selected" : ""}>Last 30 days</option><option value="90" ${period === 90 ? "selected" : ""}>Last 90 days</option></select></div>
    <div class="chart-area" aria-label="Sample routing performance chart"><div class="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div class="chart-grid"><div class="chart-bars">${chartData.values.map((height, index) => `<div class="chart-column"><span class="chart-bar" style="height:${height}%"></span><span class="chart-x-label">${chartData.labels[index]}</span></div>`).join("")}</div></div></div>
    <div class="insight-note">${icon("spark")} Engagement feedback helps improve future routing. Current settings: notify up to ${routingSettings.maxRecipients} agents when relevance is at least ${routingSettings.threshold}%.</div></section>`;
  document.querySelector("#insights-period").addEventListener("change", event => renderInsights(Number(event.target.value)));
}

function renderSettings() {
  viewContainer.innerHTML = `${renderPageHeading(pageNames.settings, "Configure routing, notifications, and workspace security.")}
    <form class="settings-form" id="settings-form">
      <section class="panel-card settings-section"><div class="section-heading"><div><h2>Relevance routing</h2><p class="section-subtitle">Control which matched agents receive a notification.</p></div></div>
        <label class="setting-row" for="threshold-range"><span><strong>Minimum relevance score</strong><small>Matches below this score will not be notified.</small></span><span class="range-control"><input id="threshold-range" name="threshold" type="range" min="50" max="95" step="1" value="${routingSettings.threshold}"><output id="threshold-value">${routingSettings.threshold}%</output></span></label>
        <label class="setting-row" for="max-recipients"><span><strong>Maximum recipients per post</strong><small>Limit how many agents receive each update.</small></span><select id="max-recipients" name="maxRecipients" class="select-control"><option value="3" ${routingSettings.maxRecipients === 3 ? "selected" : ""}>3 agents</option><option value="5" ${routingSettings.maxRecipients === 5 ? "selected" : ""}>5 agents</option><option value="10" ${routingSettings.maxRecipients === 10 ? "selected" : ""}>10 agents</option></select></label>
      </section>
      <section class="panel-card settings-section"><div class="section-heading"><div><h2>Delivery & learning</h2><p class="section-subtitle">Manage the behavior of your agent network.</p></div></div>
        <label class="setting-row" for="webhooks-toggle"><span><strong>Signed webhook notifications</strong><small>Deliver relevant updates to connected agent endpoints.</small></span><input id="webhooks-toggle" name="webhooks" class="toggle-input" type="checkbox" ${routingSettings.webhooks ? "checked" : ""}></label>
        <label class="setting-row" for="learning-toggle"><span><strong>Learn from engagement</strong><small>Use replies and ignored notifications to improve future matches.</small></span><input id="learning-toggle" name="learning" class="toggle-input" type="checkbox" ${routingSettings.learning ? "checked" : ""}></label>
      </section>
      <div class="settings-footer"><span>Settings are saved in this browser for this demo.</span><button class="button button-primary" type="submit">${icon("check")} Save changes</button></div>
    </form>`;
  document.querySelector("#threshold-range").addEventListener("input", event => {
    document.querySelector("#threshold-value").textContent = `${event.target.value}%`;
  });
}

function renderPlaceholder(view) {
  if (view === "agents") renderAgents();
  else if (view === "insights") renderInsights();
  else if (view === "settings") renderSettings();
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const title = view === "network" ? "Agent network" : view === "hardware" ? "Hardware assistant" : pageNames[view];
  breadcrumb.textContent = title;
  document.title = `Asama — ${title}`;
  if (view === "network") renderNetwork();
  else if (view === "hardware") renderHardware();
  else renderPlaceholder(view);
}

function openPostModal() {
  modalRoot.innerHTML = `<div class="modal-backdrop">
    <form class="modal" id="post-form" aria-labelledby="modal-title">
      <div class="modal-head"><div><h2 id="modal-title">Create a post</h2><p>Share an update with the agents most likely to care.</p></div><button class="modal-close" type="button" aria-label="Close" data-action="close-modal">${icon("close")}</button></div>
      <div class="form-field"><label for="post-title">Post title</label><input id="post-title" name="title" maxlength="100" placeholder="Give your update a clear title" required></div>
      <div class="form-field"><label for="post-content">What's happening?</label><textarea id="post-content" name="content" maxlength="500" placeholder="Add context so the right agents can find you..." required></textarea><span class="form-hint">Asama will route this to relevant agents only.</span></div>
      <div class="modal-actions"><button class="button" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${icon("send")} Publish post</button></div>
    </form>
  </div>`;
  modalRoot.querySelector("#post-title").focus();
}

function openModal(title, description, body, submitLabel = "", formId = "") {
  const formOpen = formId ? `<form class="modal" id="${formId}">` : `<section class="modal">`;
  const formClose = formId ? "</form>" : "</section>";
  modalRoot.innerHTML = `<div class="modal-backdrop">
    ${formOpen}
      <div class="modal-head"><div><h2>${title}</h2><p>${description}</p></div><button class="modal-close" type="button" aria-label="Close" data-action="close-modal">${icon("close")}</button></div>
      ${body}
      <div class="modal-actions"><button class="button" type="button" data-action="close-modal">Cancel</button>${submitLabel ? `<button class="button button-primary" type="submit">${submitLabel}</button>` : ""}</div>
    ${formClose}
  </div>`;
}

function openCommentModal(postId) {
  const post = posts.find(item => item.id === postId);
  if (!post) return showToast("That post is no longer available.");
  const comments = post.comments.map(comment => `<div class="comment-item"><span class="reply-avatar">${escapeHtml(comment.mark)}</span><div class="reply-copy"><strong>${escapeHtml(comment.name)} · ${escapeHtml(comment.time || "Recently")}</strong><p>${escapeHtml(comment.copy)}</p></div></div>`).join("");
  const body = `<div class="comment-context"><strong>${escapeHtml(post.title)}</strong><p>${escapeHtml(post.copy)}</p></div><div class="comment-list">${comments || `<p class="form-hint">No comments from your workspace yet. Start the conversation.</p>`}</div><div class="form-field"><label for="comment-content">Add a comment</label><textarea id="comment-content" name="content" maxlength="400" placeholder="Write a thoughtful reply..." required></textarea></div><input type="hidden" name="postId" value="${escapeHtml(post.id)}">`;
  openModal("Conversation", `${post.comments.length} ${post.comments.length === 1 ? "comment" : "comments"} · Join the discussion`, body, `${icon("send")} Add comment`, "comment-form");
  document.querySelector("#comment-content").focus();
}

function openSearchModal(query = "") {
  const body = `<div class="form-field"><label for="search-query">Search posts and agents</label><input id="search-query" type="search" value="${escapeHtml(query)}" placeholder="Try “Diwali”, “payments”, or an agent name"></div><div id="search-results" class="search-results"></div>`;
  openModal("Search your network", "Find posts, conversations, and connected agents.", body);
  const input = document.querySelector("#search-query");
  const update = () => {
    const term = input.value.trim().toLowerCase();
    const results = document.querySelector("#search-results");
    if (!term) {
      results.innerHTML = `<p class="form-hint">Start typing to search your workspace.</p>`;
      return;
    }
    const postResults = posts.filter(post => `${post.company} ${post.title} ${post.copy} ${post.tags.join(" ")}`.toLowerCase().includes(term)).slice(0, 5);
    const agentResults = connectedAgents.filter(agent => `${agent.name} ${agent.industry}`.toLowerCase().includes(term)).slice(0, 5);
    results.innerHTML = `${postResults.map(post => `<button class="search-result" type="button" data-action="open-search-result" data-result-type="post" data-result-id="${escapeHtml(post.id)}"><span class="result-icon">${icon("message")}</span><span><strong>${escapeHtml(post.title)}</strong><small>Post · ${escapeHtml(post.company)}</small></span>${icon("chevron")}</button>`).join("")}${agentResults.map(agent => `<button class="search-result" type="button" data-action="open-search-result" data-result-type="agent" data-result-id="${escapeHtml(agent.name)}"><span class="company-avatar ${escapeHtml(agent.avatarClass)}">${escapeHtml(agent.mark)}</span><span><strong>${escapeHtml(agent.name)}</strong><small>Agent · ${escapeHtml(agent.industry)}</small></span>${icon("chevron")}</button>`).join("")}${postResults.length + agentResults.length ? "" : `<p class="form-hint">No matching posts or agents found.</p>`}`;
  };
  input.addEventListener("input", update);
  update();
  input.focus();
}

function openNotifications() {
  const items = notifications.map((item, index) => `<button class="notification-item ${item.read ? "" : "unread"}" type="button" data-action="open-notification" data-notification-index="${index}" data-notification-view="${escapeHtml(item.view)}"><span class="activity-dot ${item.read ? "" : "green"}"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.time)}</small></span>${icon("chevron")}</button>`).join("");
  const body = `<div class="notification-list">${items || `<p class="form-hint">You're all caught up.</p>`}</div><button class="text-link mark-read-button" type="button" data-action="mark-notifications-read">Mark all as read</button>`;
  openModal("Notifications", "Updates from your agent network.", body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button button-primary" type="button" data-action="close-modal">Done</button>`;
}

function openWorkspaceMenu() {
  const workspace = readStorage("asama.workspace", "Northstar Labs");
  const names = ["Northstar Labs", "Acme Commerce", "Demo Workspace"];
  const body = `<div class="workspace-options">${names.map(name => `<button class="workspace-option ${name === workspace ? "selected" : ""}" type="button" data-action="select-workspace" data-workspace="${escapeHtml(name)}"><span class="workspace-avatar">${escapeHtml(name.charAt(0))}</span><span><strong>${escapeHtml(name)}</strong><small>${name === workspace ? "Current workspace" : "Switch workspace"}</small></span>${name === workspace ? icon("check") : icon("chevron")}</button>`).join("")}</div>`;
  openModal("Switch workspace", "Choose which workspace you want to view.", body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button" type="button" data-action="close-modal">Close</button>`;
}

function openProfileMenu() {
  const profile = readStorage("asama.profile", { name: "Arjun Kapoor", role: "Admin" });
  const body = `<div class="profile-summary"><span class="profile-avatar">${escapeHtml(profile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase())}</span><span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.role)} · Northstar Labs</small></span></div><div class="profile-menu-actions"><button class="button" type="button" data-action="edit-profile">Edit profile</button><button class="button" type="button" data-view="settings">Workspace settings</button></div>`;
  openModal("Your account", "Manage your workspace profile.", body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button button-primary" type="button" data-action="close-modal">Done</button>`;
}

function openEditProfile() {
  const profile = readStorage("asama.profile", { name: "Arjun Kapoor", role: "Admin" });
  const body = `<div class="form-field"><label for="profile-name">Full name</label><input id="profile-name" name="name" maxlength="60" value="${escapeHtml(profile.name)}" required></div><div class="form-field"><label for="profile-role">Role</label><input id="profile-role" name="role" maxlength="60" value="${escapeHtml(profile.role)}" required></div>`;
  openModal("Edit profile", "Update the name and role shown in your workspace.", body, `${icon("check")} Save profile`, "profile-form");
}

function openGuide() {
  const body = `<div class="guide-steps"><div><span>1</span><strong>Connect an agent</strong><p>Register a verified business agent and describe the partnerships it cares about.</p></div><div><span>2</span><strong>Share an update</strong><p>Publish a clear post; the routing engine finds relevant partners instead of broadcasting to everyone.</p></div><div><span>3</span><strong>Start a conversation</strong><p>Appreciate a post or add a comment to continue the collaboration.</p></div><div><span>4</span><strong>Ask about hardware</strong><p>The assistant preview uses sample data. A real Linux integration should collect facts using read-only, allow-listed tools.</p></div></div>`;
  openModal("Welcome to Asama", "A quick guide to the two workspace experiences.", body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button" type="button" data-view="agents">Explore agents</button><button class="button button-primary" type="button" data-action="close-modal">Got it</button>`;
}

function openAddAgentModal() {
  const body = `<div class="form-field"><label for="agent-name">Company or agent name</label><input id="agent-name" name="name" maxlength="60" placeholder="e.g. Acme Payments" required></div><div class="form-field"><label for="agent-industry">Industry</label><input id="agent-industry" name="industry" maxlength="60" placeholder="e.g. Payments & fintech" required></div><div class="form-field"><label for="agent-webhook">Webhook URL <span class="form-hint">optional in this demo</span></label><input id="agent-webhook" name="webhook" type="url" placeholder="https://agent.example.com/events"></div><p class="form-hint">This adds a local demo entry only. It does not register a real webhook or contact a service.</p>`;
  openModal("Connect an agent", "Add an agent to your local workspace preview.", body, `${icon("plus")} Add agent`, "agent-form");
}

function openPostMenu(postId) {
  const post = posts.find(item => item.id === postId);
  if (!post) return;
  const removeAction = post.company === "Northstar Labs" ? `<button class="action-list-item danger-action" type="button" data-action="remove-post" data-post-id="${escapeHtml(post.id)}">${icon("close")} Delete this demo post</button>` : "";
  const body = `<div class="action-list"><button class="action-list-item" type="button" data-action="share" data-post-id="${escapeHtml(post.id)}">${icon("arrow")} Share post link</button><button class="action-list-item" type="button" data-action="report-post" data-post-id="${escapeHtml(post.id)}">${icon("shield")} Report this post</button>${removeAction}</div>`;
  openModal("Post options", escapeHtml(post.title), body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button" type="button" data-action="close-modal">Close</button>`;
}

function openReportModal(postId) {
  const body = `<p class="form-hint">Reports are stored locally in this demo and are not sent to a moderation service.</p><div class="form-field"><label for="report-reason">Why are you reporting this post?</label><select id="report-reason" name="reason" class="select-control"><option>Misleading information</option><option>Spam or irrelevant content</option><option>Abusive or unsafe content</option><option>Other</option></select></div><input type="hidden" name="postId" value="${escapeHtml(postId)}">`;
  openModal("Report post", "Let your workspace know about a concern.", body, `${icon("shield")} Submit report`, "report-form");
}

function openActivityMenu() {
  const body = `<div class="action-list"><button class="action-list-item" type="button" data-action="activity-filter" data-filter="24 hours">${icon("clock")} Last 24 hours</button><button class="action-list-item" type="button" data-action="activity-filter" data-filter="7 days">${icon("clock")} Last 7 days</button><button class="action-list-item" type="button" data-action="activity-filter" data-filter="30 days">${icon("clock")} Last 30 days</button></div>`;
  openModal("Activity range", "Choose the time range for network activity.", body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button" type="button" data-action="close-modal">Close</button>`;
}

function sharePost(postId) {
  const url = `${location.href.split("#")[0]}#post-${encodeURIComponent(postId)}`;
  try {
    if (!navigator.clipboard?.writeText) return openShareModal(url);
    navigator.clipboard.writeText(url).then(() => showToast("Post link copied to clipboard.")).catch(() => openShareModal(url));
  } catch (error) {
    console.error("Unable to copy the post link.", error);
    openShareModal(url);
  }
}

function openShareModal(url) {
  const body = `<div class="form-field"><label for="share-link">Post link</label><input id="share-link" value="${escapeHtml(url)}" readonly><span class="form-hint">Copy this link to share the post.</span></div>`;
  openModal("Share post", "Share a link to this conversation.", body);
  modalRoot.querySelector(".modal-actions").innerHTML = `<button class="button" type="button" data-action="close-modal">Close</button><button class="button button-primary" type="button" data-action="copy-share-link">${icon("check")} Copy link</button>`;
  const input = document.querySelector("#share-link");
  input.focus();
  input.select();
}

function exportInsights() {
  const rows = [["Metric", "Value"], ["Routing precision", "94.6%"], ["Partner engagement", "38.2%"], ["Notifications saved", "12840"], ["Active partners", connectedAgents.filter(agent => agent.active).length]];
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "asama-network-insights.csv";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("Insights report downloaded.");
}

function submitPost(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const title = String(formData.get("title")).trim();
  const copy = String(formData.get("content")).trim();
  if (!title || !copy) return;
  posts.unshift({
    id: `post-${Date.now()}`,
    company: "Northstar Labs",
    mark: "N",
    avatarClass: "",
    meta: "Technology · just now",
    title,
    copy,
    tags: ["New post", "Partner opportunity"],
    appreciated: false,
    matches: "Routing in progress",
    comments: []
  });
  writeStorage(storageKeys.posts, posts);
  modalRoot.innerHTML = "";
  if (currentView === "network") renderNetwork();
  showToast("Your post is live. Finding the right agents now.");
}

function getHardwareAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes("ram") || q.includes("memory") || q.includes("upgrade")) {
    return "The <strong>sample data</strong> shows 16 GB of installed memory, with 2 of 2 slots in use. It doesn't include the motherboard's maximum supported capacity, so I can't confirm the upgrade limit. Please check the device service manual before planning an upgrade.<span class=\"data-footnote\">Illustrative sample only · No live system inspection is connected</span>";
  }
  if (q.includes("ssd") || q.includes("storage") || q.includes("drive") || q.includes("disk")) {
    return "The <strong>sample data</strong> shows a 512 GB NVMe SSD. NVMe is a protocol commonly used by SSDs connected over PCIe. I don't have information here to confirm the exact drive model.<span class=\"data-footnote\">Illustrative sample only · No live system inspection is connected</span>";
  }
  if (q.includes("processor") || q.includes("cpu") || q.includes("core")) {
    return "The <strong>sample data</strong> lists an Intel Core i7, 12th generation, with 10 cores. It doesn't include an exact SKU, so I can't reliably provide the model number.<span class=\"data-footnote\">Illustrative sample only · No live system inspection is connected</span>";
  }
  if (q.includes("gpu") || q.includes("graphics") || q.includes("video")) {
    return "The <strong>sample data</strong> lists Intel Iris Xe integrated graphics. Integrated graphics typically share system memory; this demo data doesn't establish whether your actual device has a dedicated GPU.<span class=\"data-footnote\">Illustrative sample only · No live system inspection is connected</span>";
  }
  return "I don't have a matching data source for that question in this preview. It demonstrates sample answers for memory, storage, processor, and graphics; it does not inspect your device. Try asking about one of those sample components.";
}

function sendHardwareQuestion(question) {
  const text = question.trim();
  if (!text) return;
  const container = document.querySelector("#chat-messages");
  if (!container) return;
  const userMessage = { role: "user", label: "You · just now", html: escapeHtml(text) };
  const assistantMessage = { role: "assistant", label: "Asama assistant · just now", html: getHardwareAnswer(text) };
  hardwareConversation.push(userMessage, assistantMessage);
  container.insertAdjacentHTML("beforeend", messageMarkup(userMessage));
  container.insertAdjacentHTML("beforeend", messageMarkup(assistantMessage));
  container.scrollTop = container.scrollHeight;
  const input = document.querySelector("#chat-input");
  if (input) input.value = "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function attachChatHandlers() {
  document.querySelector("#chat-form")?.addEventListener("submit", event => {
    event.preventDefault();
    sendHardwareQuestion(document.querySelector("#chat-input").value);
  });
  document.querySelectorAll(".suggestion").forEach(button => button.addEventListener("click", () => sendHardwareQuestion(button.dataset.question)));
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    event.preventDefault();
    modalRoot.innerHTML = "";
    setView(nav.dataset.view);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    const post = posts.find(item => item.id === action.dataset.postId);
    switch (action.dataset.action) {
      case "new-post": openPostModal(); break;
      case "close-modal": modalRoot.innerHTML = ""; break;
      case "refresh-system": {
        const label = document.querySelector(".system-panel-head p");
        if (label) label.textContent = `Illustrative data · Refreshed ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        showToast("Sample system overview refreshed.");
        break;
      }
      case "routing-settings": setView("settings"); break;
      case "view-insights": setView("insights"); break;
      case "feed-mode":
        feedMode = feedMode === "For you" ? "Following" : "For you";
        renderNetwork();
        break;
      case "activity-menu": openActivityMenu(); break;
      case "activity-filter":
        activityRange = action.dataset.filter;
        modalRoot.innerHTML = "";
        renderNetwork();
        showToast(`Network activity updated to ${activityRange}.`);
        break;
      case "appreciate":
        if (post) {
          post.appreciated = !post.appreciated;
          writeStorage(storageKeys.posts, posts);
          renderNetwork();
          showToast(post.appreciated ? "Thanks for the appreciation." : "Appreciation removed.");
        }
        break;
      case "comment":
        if (post) {
          if (expandedPostComments.has(post.id)) expandedPostComments.delete(post.id);
          else expandedPostComments.add(post.id);
          renderNetwork();
        }
        break;
      case "add-comment": openCommentModal(action.dataset.postId); break;
      case "share":
        if (post) {
          modalRoot.innerHTML = "";
          sharePost(post.id);
        }
        break;
      case "post-menu": openPostMenu(action.dataset.postId); break;
      case "report-post": openReportModal(action.dataset.postId); break;
      case "remove-post": openRemoveModal("post", post ? post.title : "", action.dataset.postId); break;
      case "search": openSearchModal(); break;
      case "search-agents": setView("agents"); openSearchModal(); break;
      case "open-search-result":
        if (action.dataset.resultType === "post") {
          modalRoot.innerHTML = "";
          setView("network");
          requestAnimationFrame(() => document.getElementById(`post-${action.dataset.resultId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
        } else {
          modalRoot.innerHTML = "";
          setView("agents");
          requestAnimationFrame(() => Array.from(document.querySelectorAll(".agent-card")).find(card => card.dataset.agentCard === action.dataset.resultId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
        }
        break;
      case "notifications": openNotifications(); break;
      case "open-notification": {
        const notification = notifications[Number(action.dataset.notificationIndex)];
        if (notification) {
          notification.read = true;
          writeStorage(storageKeys.notifications, notifications);
          updateNotificationIndicator();
          modalRoot.innerHTML = "";
          setView(action.dataset.notificationView);
        }
        break;
      }
      case "remove-agent": openRemoveModal("agent", action.dataset.agent); break;
      case "mark-notifications-read":
        notifications = notifications.map(item => ({ ...item, read: true }));
        writeStorage(storageKeys.notifications, notifications);
        updateNotificationIndicator();
        modalRoot.innerHTML = "";
        showToast("All notifications marked as read.");
        break;
      case "workspace-menu": openWorkspaceMenu(); break;
      case "select-workspace":
        writeStorage("asama.workspace", action.dataset.workspace);
        document.querySelector(".workspace-copy strong").textContent = action.dataset.workspace;
        document.querySelector(".breadcrumbs > span").textContent = action.dataset.workspace;
        modalRoot.innerHTML = "";
        showToast(`Switched to ${action.dataset.workspace}.`);
        break;
      case "profile-menu": openProfileMenu(); break;
      case "edit-profile": openEditProfile(); break;
      case "open-guide": openGuide(); break;
      case "add-agent": openAddAgentModal(); break;
      case "toggle-agent": {
        const agent = connectedAgents.find(item => item.name === action.dataset.agent);
        if (agent) {
          agent.active = !agent.active;
          writeStorage(storageKeys.agents, connectedAgents);
          renderAgents();
          showToast(`${agent.name} ${agent.active ? "connected" : "paused"}.`);
        }
        break;
      }
      case "export-insights": exportInsights(); break;
      case "copy-share-link": {
        const input = document.querySelector("#share-link");
        if (input) {
          input.select();
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(input.value).then(() => { modalRoot.innerHTML = ""; showToast("Post link copied to clipboard."); }).catch(() => showToast("Select the link and copy it to share."));
          else showToast("Select the link and copy it to share.");
        }
        break;
      }
      default: break;
    }
  }
  if (event.target.classList.contains("modal-backdrop")) modalRoot.innerHTML = "";
});

function updateNotificationIndicator() {
  const button = document.querySelector(".notification-button");
  if (!button) return;
  if (notifications.some(item => !item.read)) {
    if (!button.querySelector("i")) button.insertAdjacentHTML("beforeend", "<i></i>");
  } else {
    button.querySelector("i")?.remove();
  }
}

document.addEventListener("submit", event => {
  if (event.target.matches("#post-form")) {
    submitPost(event);
    return;
  }
  if (event.target.matches("#comment-form")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const post = posts.find(item => item.id === formData.get("postId"));
    const content = String(formData.get("content") || "").trim();
    if (!post || !content) return;
    post.comments.push({ mark: "A", name: "Arjun Kapoor", copy: content, time: "just now" });
    writeStorage(storageKeys.posts, posts);
    modalRoot.innerHTML = "";
    if (currentView === "network") renderNetwork();
    showToast("Your comment was added.");
    return;
  }
  if (event.target.matches("#settings-form")) {
    event.preventDefault();
    const data = new FormData(event.target);
    routingSettings = {
      threshold: Number(data.get("threshold")),
      maxRecipients: Number(data.get("maxRecipients")),
      webhooks: data.get("webhooks") === "on",
      learning: data.get("learning") === "on"
    };
    writeStorage(storageKeys.settings, routingSettings);
    renderSettings();
    showToast("Routing settings saved.");
    return;
  }
  if (event.target.matches("#profile-form")) {
    event.preventDefault();
    const data = new FormData(event.target);
    const profile = { name: String(data.get("name")).trim(), role: String(data.get("role")).trim() };
    if (!profile.name || !profile.role) return;
    writeStorage("asama.profile", profile);
    const initials = profile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
    document.querySelector(".profile-details strong").textContent = profile.name;
    document.querySelector(".profile-details span").textContent = profile.role;
    document.querySelectorAll(".profile-avatar, .topbar-avatar").forEach(node => { node.textContent = initials; });
    modalRoot.innerHTML = "";
    showToast("Your profile was updated.");
    return;
  }
  if (event.target.matches("#agent-form")) {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get("name")).trim();
    const industry = String(data.get("industry")).trim();
    if (!name || !industry) return;
    if (connectedAgents.some(agent => agent.name.toLowerCase() === name.toLowerCase())) {
      showToast("That agent is already in your workspace.");
      return;
    }
    connectedAgents.push({ name, industry, mark: name.charAt(0).toUpperCase(), avatarClass: "", active: true, score: 75 });
    writeStorage(storageKeys.agents, connectedAgents);
    modalRoot.innerHTML = "";
    renderAgents();
    showToast(`${name} was added to this demo workspace.`);
    return;
  }
  if (event.target.matches("#report-form")) {
    event.preventDefault();
    const reports = readStorage("asama.reports", []);
    const data = new FormData(event.target);
    reports.push({ postId: data.get("postId"), reason: data.get("reason"), createdAt: new Date().toISOString() });
    writeStorage("asama.reports", reports);
    modalRoot.innerHTML = "";
    showToast("Report saved in this browser demo.");
    return;
  }
  if (event.target.matches("#remove-post-form")) {
    event.preventDefault();
    const data = new FormData(event.target);
    const id = String(data.get("id"));
    posts = posts.filter(post => post.id !== id);
    writeStorage(storageKeys.posts, posts);
    modalRoot.innerHTML = "";
    if (currentView === "network") renderNetwork();
    showToast("Demo post removed.");
    return;
  }
  if (event.target.matches("#remove-agent-form")) {
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get("name"));
    connectedAgents = connectedAgents.filter(agent => agent.name !== name);
    writeStorage(storageKeys.agents, connectedAgents);
    modalRoot.innerHTML = "";
    if (currentView === "agents") renderAgents();
    showToast(`${name} removed from this workspace.`);
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") modalRoot.innerHTML = "";
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearchModal();
  }
});

const workspaceName = readStorage("asama.workspace", "Northstar Labs");
document.querySelector(".workspace-copy strong").textContent = workspaceName;
document.querySelector(".breadcrumbs > span").textContent = workspaceName;
const savedProfile = readStorage("asama.profile", null);
if (savedProfile) {
  const initials = savedProfile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  document.querySelector(".profile-details strong").textContent = savedProfile.name;
  document.querySelector(".profile-details span").textContent = savedProfile.role;
  document.querySelectorAll(".profile-avatar, .topbar-avatar").forEach(node => { node.textContent = initials; });
}
updateNotificationIndicator();

setView("network");
