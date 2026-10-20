import { describe, expect, it } from 'vitest';
import { parseAdminUiConfig } from './admin-ui-config.js';

describe('parseAdminUiConfig', () => {
  it('is off by default', () => {
    expect(parseAdminUiConfig({})).toEqual({
      enabled: false,
      contentView: false,
    });
  });

  it('reads both flags', () => {
    expect(
      parseAdminUiConfig({
        DAVNODE_ADMIN_UI_ENABLED: 'true',
        DAVNODE_ADMIN_UI_CONTENT_VIEW: ' TRUE ',
      }),
    ).toEqual({ enabled: true, contentView: true });
  });

  it('reads the optional build directory', () => {
    expect(
      parseAdminUiConfig({ DAVNODE_ADMIN_UI_DIR: ' /srv/ui ' }).directory,
    ).toBe('/srv/ui');
    expect(parseAdminUiConfig({ DAVNODE_ADMIN_UI_DIR: ' ' }).directory).toBe(
      undefined,
    );
  });

  it('rejects anything but true/false', () => {
    expect(() => parseAdminUiConfig({ DAVNODE_ADMIN_UI_ENABLED: '1' })).toThrow(
      /DAVNODE_ADMIN_UI_ENABLED must be "true" or "false"/,
    );
  });

  it('refuses the content view without the UI', () => {
    expect(() =>
      parseAdminUiConfig({ DAVNODE_ADMIN_UI_CONTENT_VIEW: 'true' }),
    ).toThrow(/requires DAVNODE_ADMIN_UI_ENABLED/);
  });
});
