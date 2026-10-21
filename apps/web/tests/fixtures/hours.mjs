// Explicitly synthetic hours, unrelated to a seller's real current status.
export const HOURS_CHECKED_AT = '2026-10-21T10:00:00+03:30';

export function syntheticHours(status = 'unknown') {
  return {
    status,
    reason: status === 'declared_open' ? 'within_declared_shift'
      : status === 'declared_closed' ? 'outside_declared_shifts' : 'missing_schedule',
    local_day: 'wed',
    today_shifts: status === 'unknown' ? []
      : [{ start_time: '09:00:00', end_time: '18:00:00', ends_next_day: false }],
    previous_day_overnight_shifts: [],
  };
}
