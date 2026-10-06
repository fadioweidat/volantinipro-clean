import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomePage } from '../src/pages/public/HomePage.jsx';
import { Navbar } from '../src/layouts/public/Navbar.jsx';
import { ServiceDoorToDoorPage, ServiceHandToHandPage, ServiceBusinessPage } from '../src/pages/public/ServicePages.jsx';
import { MilanoLandingPage } from '../src/pages/public/MilanoLandingPage.jsx';
import ServiceCenter from '../src/pages/public/ServiceCenter.jsx';
import QuickQuotePage from '../src/pages/public/QuickQuotePage.jsx';
import ConsultantPage from '../src/pages/public/ConsultantPage.jsx';
import { LegalPage } from '../src/pages/public/LegalPage.jsx';

const noop = () => {};
const pages = {
  home: () => <HomePage onStart={noop} />,
  'service-door-to-door': () => <ServiceDoorToDoorPage onNav={noop} />,
  'service-hand-to-hand': () => <ServiceHandToHandPage onNav={noop} />,
  'service-business': () => <ServiceBusinessPage onNav={noop} />,
  'milano-landing': () => <MilanoLandingPage onNav={noop} />,
  preventivo: () => <ServiceCenter onNav={noop} />,
  quick: () => <QuickQuotePage onStart={noop} onContact={noop} />,
  consultant: () => <ConsultantPage onStart={noop} />,
  privacy: () => <LegalPage type="privacy" onNav={noop} />,
  terms: () => <LegalPage type="terms" onNav={noop} />,
  cookie: () => <LegalPage type="cookie" onNav={noop} />,
};

export function renderMarketingPage(page) {
  const Page = pages[page];
  if (!Page) throw new Error(`No public snapshot renderer: ${page}`);
  return renderToStaticMarkup(<>{page !== 'home' && <Navbar onNav={noop} />}<Page /></>);
}
