import {
  addDays,
  addMonths,
  cycleDates,
  dayOfCycle,
  dayOfWeek,
  daysInMonth,
  daysLeftIncludingToday,
  diffDays,
  getPayCycle,
  isLeapYear,
  isValidLocalDate,
  shiftPayCycle,
} from '..';

describe('local dates', () => {
  it('leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('validates', () => {
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('26-1-1')).toBe(false);
  });

  it('arithmetic crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('day of week', () => {
    expect(dayOfWeek('1970-01-01')).toBe(4); // Thursday
    expect(dayOfWeek('2026-11-19')).toBe(4); // Thursday
    expect(dayOfWeek('2026-11-22')).toBe(0); // Sunday
  });
});

describe('pay cycles', () => {
  it('pay day 1 → calendar month', () => {
    expect(getPayCycle('2026-11-19', 1)).toEqual({ start: '2026-11-01', end: '2026-11-30', lengthDays: 30 });
  });

  it('pay day 25 → 25th to 24th', () => {
    expect(getPayCycle('2026-11-19', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24', lengthDays: 31 });
    expect(getPayCycle('2026-11-25', 25)).toEqual({ start: '2026-11-25', end: '2026-12-24', lengthDays: 30 });
    expect(getPayCycle('2026-11-24', 25).end).toBe('2026-11-24');
  });

  it('crosses year end', () => {
    expect(getPayCycle('2027-01-10', 25)).toEqual({ start: '2026-12-25', end: '2027-01-24', lengthDays: 31 });
  });

  it('clamps pay day 31 / 30 to short months, incl. leap years', () => {
    expect(getPayCycle('2026-02-28', 31)).toEqual({ start: '2026-02-28', end: '2026-03-30', lengthDays: 31 });
    expect(getPayCycle('2026-02-27', 31)).toEqual({ start: '2026-01-31', end: '2026-02-27', lengthDays: 28 });
    expect(getPayCycle('2028-02-29', 30)).toEqual({ start: '2028-02-29', end: '2028-03-29', lengthDays: 30 });
    expect(getPayCycle('2028-02-28', 30)).toEqual({ start: '2028-01-30', end: '2028-02-28', lengthDays: 30 });
  });

  it('cycles tile the calendar with no gaps or overlaps', () => {
    for (const payDay of [1, 15, 25, 28, 29, 30, 31]) {
      let c = getPayCycle('2027-12-15', payDay);
      for (let i = 0; i < 30; i++) {
        const prev = shiftPayCycle(c, -1, payDay);
        expect(addDays(prev.end, 1)).toBe(c.start);
        expect(cycleDates(prev)).toHaveLength(prev.lengthDays);
        c = prev;
      }
    }
  });

  it('day counters', () => {
    const c = getPayCycle('2026-11-19', 25);
    expect(dayOfCycle('2026-10-25', c)).toBe(1);
    expect(daysLeftIncludingToday('2026-10-25', c)).toBe(31);
    expect(daysLeftIncludingToday('2026-11-24', c)).toBe(1);
  });

  it('shift forward and back', () => {
    const c = getPayCycle('2026-11-19', 25);
    expect(shiftPayCycle(c, 1, 25).start).toBe('2026-11-25');
    expect(shiftPayCycle(c, -2, 25).start).toBe('2026-08-25');
    expect(shiftPayCycle(c, 0, 25)).toBe(c);
  });

  it('rejects invalid pay days', () => {
    expect(() => getPayCycle('2026-11-19', 0)).toThrow(RangeError);
    expect(() => getPayCycle('2026-11-19', 32)).toThrow(RangeError);
  });
});
