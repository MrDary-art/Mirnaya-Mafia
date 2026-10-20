import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import SocialNotifications from "../src/pages/SocialNotifications.jsx";
import { CompanyNotifications } from "../src/company/notifications.jsx";
import { api } from "../src/api.js";
import "../src/design/tokens.css";
import "../src/index.css";
import "../src/business/business.css";
import "../src/design/light-sage.css";

document.documentElement.dataset.theme = "sage-light";
function Harness() {
  const [data, setData] = useState(null);
  const company = new URLSearchParams(location.search).has("company");
  const reload = async () => setData(await api("/api/company/context?company_id=7"));
  useEffect(() => {
    if (company) reload();
    const changed = () => { window.notificationChanges = (window.notificationChanges || 0) + 1; };
    window.addEventListener("arena:notifications-changed", changed);
    return () => window.removeEventListener("arena:notifications-changed", changed);
  }, []);
  return company ? data && <div className="business-shell"><output aria-label="Непрочитанные">{data.inbox.filter(item => !item.read).length}</output><CompanyNotifications data={data} reload={reload} onNavigate={path => { window.notificationNavigation = path; }} /></div> : <SocialNotifications embedded />;
}
createRoot(document.getElementById("root")).render(<MemoryRouter><Harness /></MemoryRouter>);
