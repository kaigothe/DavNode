import { describe, expect, it } from 'vitest';
import { parseAdminUiConfig } from './admin-ui-config.js';

describe('parseAdminUiConfig', () => {
  it('is off by default', () => {
    expect(parseAdminUiConfig({})).toEqual({
      enabled: false,
      contentView: false,
      logView: false,
      logBuffer: 2000,
    });
  });

  it('reads both flags', () => {
    expect(
      parseAdminUiConfig({
        DAVNODE_ADMIN_UI_ENABLED: 'true',
        DAVNODE_ADMIN_UI_CONTENT_VIEW: ' TRUE ',
      }),
    ).toMatchObject({ enabled: true, contentView: true, logView: false });
  });

  it('reads the optional build directory', () => {
    expect(
      parseAdminUiConfig({ DAVNODE_ADMIN_UI_DIR: ' /srv/ui ' }).directory,
    ).toBe('/srv/ui');
    expect(parseAdminUiConfig({ DAVNODE_ADMIN_UI_DIR: ' ' }).directory).toBe(
      undefined,
    );
  });

  it('reads the log view and the size of its buffer', () => {
    expect(
      parseAdminUiConfig({
        DAVNODE_ADMIN_UI_ENABLED: 'true',
        DAVNODE_ADMIN_UI_LOG_VIEW: 'true',
        DAVNODE_ADMIN_UI_LOG_BUFFER: '5000',
      }),
    ).toMatchObject({ logView: true, logBuffer: 5000 });
    expect(parseAdminUiConfig({})).toMatchObject({
      logView: false,
      logBuffer: 2000,
    });
  });

  it('refuses the log view without the UI', () => {
    expect(() =>
      parseAdminUiConfig({ DAVNODE_ADMIN_UI_LOG_VIEW: 'true' }),
    ).toThrow(/LOG_VIEW requires DAVNODE_ADMIN_UI_ENABLED/);
  });

  it.each(['10', '99', '50001', 'abc', '2.5'])(
    'rejects a log buffer of %s',
    (size) => {
      expect(() =>
        parseAdminUiConfig({ DAVNODE_ADMIN_UI_LOG_BUFFER: size }),
      ).toThrow(/DAVNODE_ADMIN_UI_LOG_BUFFER must be a whole number/);
    },
  );

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
