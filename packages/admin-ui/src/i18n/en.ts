/** English UI texts; `de.ts` must define exactly the same keys. */
export const en = {
  app: { title: 'DavNode Admin' },
  common: {
    logout: 'Log out',
    retry: 'Try again',
    loading: 'Loading…',
    yes: 'Yes',
    no: 'No',
  },
  prefs: {
    language: 'Language',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  login: {
    title: 'Sign in',
    subtitle: 'Manage tenants, users, groups and quotas of this server.',
    tenant: 'Tenant',
    tenantHint: 'The short name of your tenant, e.g. "acme"',
    tenantRequired: 'Enter your tenant',
    username: 'Username',
    usernameRequired: 'Enter your username',
    password: 'Password',
    passwordRequired: 'Enter your password',
    submit: 'Sign in',
    expired: 'Your session has ended. Please sign in again.',
    insecure:
      'This connection is not encrypted. Your password is sent in clear text; use HTTPS.',
  },
  nav: { overview: 'Overview' },
  role: {
    server_admin: 'Server administrator',
    tenant_admin: 'Tenant administrator',
    member: 'Member',
  },
  noAdmin: {
    title: 'No administrator rights',
    text: 'You are signed in as {{username}}, but this area is only for administrators.',
  },
  notFound: { title: 'Page not found', back: 'Back to the overview' },
  overview: {
    title: 'Overview',
    account: 'Your account',
    username: 'Username',
    email: 'E-mail',
    role: 'Role',
    tenant: 'Tenant',
    providers: 'Authentication providers',
    providersHint:
      'Providers are configured on the server and cannot be changed here.',
    enabled: 'Enabled',
    disabled: 'Disabled',
    issuers: 'Trusted OAuth2 issuers',
    providerName: {
      basic: 'Basic (password)',
      digest: 'Digest',
      oauth2: 'OAuth2 / OpenID Connect',
    },
  },
  errors: {
    unauthorized: 'The username or password is wrong.',
    forbidden: 'You are not allowed to do this.',
    not_found: 'Not found. Check the tenant name.',
    rate_limited:
      'Too many failed attempts. Please wait a while and try again.',
    network_error: 'The server could not be reached.',
    insufficient_role: 'This requires a higher role.',
    wrong_tenant: 'You can only manage your own tenant.',
    tenant_not_found: 'This tenant does not exist.',
    unknown: 'Something went wrong.',
  },
};

/** The shape every language has to provide. */
export type Translation = typeof en;
