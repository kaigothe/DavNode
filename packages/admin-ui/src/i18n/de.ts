import type { Translation } from './en';

/** Deutsche UI-Texte; dieselben Schlüssel wie `en.ts`. */
export const de: Translation = {
  app: { title: 'DavNode Admin' },
  common: {
    logout: 'Abmelden',
    retry: 'Erneut versuchen',
    loading: 'Lädt …',
    yes: 'Ja',
    no: 'Nein',
  },
  prefs: {
    language: 'Sprache',
    theme: 'Darstellung',
    themeSystem: 'System',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
  },
  login: {
    title: 'Anmelden',
    subtitle: 'Tenants, Nutzer, Gruppen und Quotas dieses Servers verwalten.',
    tenant: 'Tenant',
    tenantHint: 'Der Kurzname deines Tenants, z. B. „acme“',
    tenantRequired: 'Bitte den Tenant eingeben',
    username: 'Benutzername',
    usernameRequired: 'Bitte den Benutzernamen eingeben',
    password: 'Passwort',
    passwordRequired: 'Bitte das Passwort eingeben',
    submit: 'Anmelden',
    expired: 'Deine Sitzung ist beendet. Bitte melde dich erneut an.',
    insecure:
      'Diese Verbindung ist nicht verschlüsselt. Dein Passwort wird im Klartext gesendet; nutze HTTPS.',
  },
  nav: { overview: 'Übersicht' },
  role: {
    server_admin: 'Server-Administrator',
    tenant_admin: 'Tenant-Administrator',
    member: 'Mitglied',
  },
  noAdmin: {
    title: 'Keine Administratorrechte',
    text: 'Du bist als {{username}} angemeldet, dieser Bereich ist aber nur für Administratoren.',
  },
  notFound: { title: 'Seite nicht gefunden', back: 'Zurück zur Übersicht' },
  overview: {
    title: 'Übersicht',
    account: 'Dein Konto',
    username: 'Benutzername',
    email: 'E-Mail',
    role: 'Rolle',
    tenant: 'Tenant',
    providers: 'Authentifizierungsanbieter',
    providersHint:
      'Anbieter werden auf dem Server konfiguriert und lassen sich hier nicht ändern.',
    enabled: 'Aktiv',
    disabled: 'Inaktiv',
    issuers: 'Vertrauenswürdige OAuth2-Aussteller',
    providerName: {
      basic: 'Basic (Passwort)',
      digest: 'Digest',
      oauth2: 'OAuth2 / OpenID Connect',
    },
  },
  errors: {
    unauthorized: 'Benutzername oder Passwort ist falsch.',
    forbidden: 'Dafür fehlt dir die Berechtigung.',
    not_found: 'Nicht gefunden. Prüfe den Tenant-Namen.',
    rate_limited:
      'Zu viele Fehlversuche. Bitte warte einen Moment und versuche es erneut.',
    network_error: 'Der Server ist nicht erreichbar.',
    insufficient_role: 'Dafür ist eine höhere Rolle nötig.',
    wrong_tenant: 'Du kannst nur deinen eigenen Tenant verwalten.',
    tenant_not_found: 'Diesen Tenant gibt es nicht.',
    unknown: 'Etwas ist schiefgelaufen.',
  },
};
