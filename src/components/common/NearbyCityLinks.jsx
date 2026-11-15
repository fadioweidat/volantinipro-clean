import React from "react";
import PublicNavLink from "./PublicNavLink.jsx";
import { cityPageKey, cityPath } from "../../lib/seo/seoLandingRoutes.js";

// Link interni (SEO, 2026-11-15) dalla homepage e dalla pagina Milano verso
// le pagine dei comuni confinanti, con anchor "distribuzione volantini a [Comune]".
export const NEARBY_CITY_LINKS = [
  { slug: "sesto-san-giovanni", name: "Sesto San Giovanni" },
  { slug: "cinisello-balsamo", name: "Cinisello Balsamo" },
].map((c) => ({ ...c, href: cityPath(c.slug), pageKey: cityPageKey(c.slug), label: `distribuzione volantini a ${c.name}` }));

const F = "'DM Sans', Inter, system-ui, sans-serif";

export default function NearbyCityLinks({ onNav, intro = "Lavori anche nei comuni vicini a Milano?", style }) {
  return (
    <nav aria-label="Comuni vicini a Milano" data-testid="nearby-city-links" style={{ fontFamily: F, fontSize: 15, lineHeight: 1.7, color: "rgba(248,250,252,0.72)", ...style }}>
      {intro}{" "}
      {NEARBY_CITY_LINKS.map((c, i) => (
        <React.Fragment key={c.slug}>
          {i > 0 ? " · " : ""}
          <PublicNavLink href={c.href} onClick={() => onNav?.(c.pageKey)} style={{ color: "#F07A3E", fontWeight: 700, display: "inline-block", padding: "6px 0" }}>
            {c.label}
          </PublicNavLink>
        </React.Fragment>
      ))}
    </nav>
  );
}
