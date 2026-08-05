import { AI_PAGES } from "../contracts.js";

const cleanPath = (value) => {
  try { return new URL(value, "https://volantinipro.local").pathname.toLowerCase().replace(/\/$/, "") || "/"; }
  catch { return "/__invalid__"; }
};

/** Pure route classifier. Non modifica e non sostituisce il routing dell'applicazione. */
export class AiPageResolver {
  resolve(location = "/") {
    const path = cleanPath(typeof location === "string" ? location : location?.href ?? location?.pathname ?? "/");
    if (path === "/" || path === "/home" || path === "/index.html") return AI_PAGES.HOMEPAGE;
    if (path === "/preventivo-rapido") return AI_PAGES.QUICK_QUOTE;
    if (path === "/consulente" || path === "/consulenza") return AI_PAGES.CONSULTING;
    if (["/configuratore", "/zona", "/step2", "/calendario", "/step3", "/riepilogo", "/step4"].includes(path)) return AI_PAGES.GUIDED_QUOTE;
    if (/^\/admin\/campaigns\/[^/]+\/(gps|operations)$/.test(path) || path === "/admin/live") return AI_PAGES.GPS;
    if (/^\/(customer|client)\/campaigns\/[^/]+\/tracking$/.test(path) || /^\/(driver|operator)(\/tracking)?\/[^/]+$/.test(path)) return AI_PAGES.GPS;
    if (/\/report$/.test(path)) return AI_PAGES.REPORT;
    if (path === "/admin" || path.startsWith("/admin/")) return AI_PAGES.ADMIN_DASHBOARD;
    if (path === "/supplier" || path.startsWith("/supplier/") || path === "/fornitore" || path.startsWith("/fornitore/")) return AI_PAGES.SUPPLIER_DASHBOARD;
    if (path === "/dashboard" || path.startsWith("/dashboard/") || path.startsWith("/customer/") || path.startsWith("/client/")) return AI_PAGES.CLIENT_DASHBOARD;
    if (path === "/profilo" || path === "/profile" || /\/(profilo|profile)$/.test(path)) return AI_PAGES.PROFILE;
    return AI_PAGES.UNKNOWN;
  }
}

