import React from 'react';

// Keep the existing SPA handler for an ordinary click, and native link behaviour
// for opening a new tab, copying the URL or browsing before React boots.
export default function PublicNavLink({ href, onClick, style, children, ...rest }) {
  return <a {...rest} href={href} style={{ textDecoration: 'none', ...style }} onClick={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (onClick) {
      event.preventDefault();
      onClick(event);
    }
  }}>{children}</a>;
}
