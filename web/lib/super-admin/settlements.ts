// Pure period check for settlement runs (#297). ISO YYYY-MM-DD compares lexically,
// so a string compare is a valid date order test.
export function periodValid(start: string, end: string): boolean {
  return Boolean(start) && Boolean(end) && start <= end
}
