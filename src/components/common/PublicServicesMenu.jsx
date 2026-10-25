import React, { useEffect, useRef } from 'react';
import PublicNavLink from './PublicNavLink.jsx';
import './public-services-menu.css';

const SERVICES = [
  ['Door to Door', '/servizi/door-to-door', 'service-door-to-door'],
  ['Hand to Hand', '/servizi/hand-to-hand', 'service-hand-to-hand'],
  ['Business', '/servizi/business', 'service-business'],
  ['Distribuzione a Milano', '/distribuzione-volantini-milano', 'milano-landing'],
  ['Prezzi distribuzione volantini', '/prezzi-distribuzione-volantini', 'prices'],
];

export default function PublicServicesMenu({ mobile = false, onNavigate }) {
  const root = useRef(null);
  useEffect(() => {
    const closeOutside = event => {
      if (root.current && !root.current.contains(event.target)) root.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return <details ref={root} className={`vp-services-menu${mobile ? ' vp-services-menu-mobile' : ''}`}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
    <summary>Servizi <span aria-hidden="true">▾</span></summary>
    <div className="vp-services-menu-links">
      {SERVICES.map(([label, href, page]) => <PublicNavLink key={page} href={href}
        onClick={onNavigate ? () => { root.current.open = false; onNavigate(page); } : undefined}>
        {label}
      </PublicNavLink>)}
    </div>
  </details>;
}
