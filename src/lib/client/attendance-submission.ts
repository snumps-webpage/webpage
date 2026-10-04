/** Owns a response across navigation and repeated submissions, without storage. */
export function createAttendanceSubmissionGate() {
  let generation = 0;
  return {
    begin(scope: string) {
      return { scope, generation: ++generation };
    },
    invalidate() {
      generation++;
    },
    current(ticket: { scope: string; generation: number }, scope: string) {
      return ticket.scope === scope && ticket.generation === generation;
    },
  };
}
