import { Flex, Progress, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatBytes, usagePercent } from '../lib/bytes';

/** Used space, as a bar when there is a limit and as plain text when there is none. */
export function QuotaBar({
  used,
  limit,
}: {
  used: number;
  limit: number | null;
}) {
  const { t, i18n } = useTranslation();
  const percent = usagePercent(used, limit);
  if (percent === null) {
    return (
      <Typography.Text>
        {formatBytes(used, i18n.language)}{' '}
        <Typography.Text type="secondary">
          ({t('quota.unlimited')})
        </Typography.Text>
      </Typography.Text>
    );
  }
  return (
    <Flex vertical gap={2} style={{ minWidth: 140 }}>
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        status={
          percent >= 100 ? 'exception' : percent >= 90 ? 'normal' : 'active'
        }
        strokeColor={percent >= 90 && percent < 100 ? '#faad14' : undefined}
        aria-label={t('quota.usage')}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {formatBytes(used, i18n.language)} /{' '}
        {formatBytes(limit ?? 0, i18n.language)}
      </Typography.Text>
    </Flex>
  );
}
