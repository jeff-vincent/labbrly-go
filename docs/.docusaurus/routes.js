import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/docs/',
    component: ComponentCreator('/docs/', '4b1'),
    routes: [
      {
        path: '/docs/',
        component: ComponentCreator('/docs/', '5c9'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/api-overview',
        component: ComponentCreator('/docs/api-overview', 'ed3'),
        exact: true
      },
      {
        path: '/docs/custom-environments',
        component: ComponentCreator('/docs/custom-environments', '247'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/embedding',
        component: ComponentCreator('/docs/embedding', 'b33'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/environment-isolation',
        component: ComponentCreator('/docs/environment-isolation', 'bdd'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/get-user-link',
        component: ComponentCreator('/docs/get-user-link', '59e'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/how-it-works',
        component: ComponentCreator('/docs/how-it-works', 'e68'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/pricing',
        component: ComponentCreator('/docs/pricing', 'b6d'),
        exact: true,
        sidebar: "docs"
      },
      {
        path: '/docs/quickstart',
        component: ComponentCreator('/docs/quickstart', '726'),
        exact: true,
        sidebar: "docs"
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
