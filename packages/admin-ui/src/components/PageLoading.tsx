import { Flex, Spin } from 'antd';

/** Shown while a page's code is being loaded. */
export function PageLoading() {
  return (
    <Flex align="center" justify="center" style={{ padding: 48 }}>
      <Spin size="large" />
    </Flex>
  );
}
