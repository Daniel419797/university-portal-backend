export function formatStudentId(counter: number, date = new Date()): string {
  const year = date.getFullYear();
  const padded = String(counter).padStart(4, '0');
  return `ST/${padded}/${year}`;
}
