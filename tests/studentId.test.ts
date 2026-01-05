import { formatStudentId } from '../src/utils/studentId';

test('formatStudentId produces expected format', () => {
  const id = formatStudentId(1, new Date('2026-01-01'));
  expect(id).toBe('ST/0001/2026');
  expect(formatStudentId(123, new Date('2026-12-31'))).toBe('ST/0123/2026');
});
