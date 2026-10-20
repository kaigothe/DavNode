import type { FormInstance } from 'antd';

/**
 * The validated values of `form`, or `null` when a field is invalid. Ant
 * Design shows the messages next to the fields; calling `validateFields`
 * bare would also reject, and nobody handles that rejection.
 */
export async function validated<T>(form: FormInstance<T>): Promise<T | null> {
  try {
    return await form.validateFields();
  } catch {
    return null;
  }
}
