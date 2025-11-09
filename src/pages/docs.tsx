import dynamic from 'next/dynamic';
import Head from 'next/head';
import React from 'react';

// swagger-ui-react does not support SSR well — load it dynamically on client
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function DocsPage() {
  return (
    <>
      <Head>
        <title>API Docs - Lightweight Scraper</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4.18.3/swagger-ui.css" />
      </Head>
      <div style={{ height: '100vh' }}>
        <SwaggerUI url="/openapi.json" />
      </div>
    </>
  );
}
