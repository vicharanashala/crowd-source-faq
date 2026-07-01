export function parseResetTime(timeStr: string): { hours: number; minutes: number } {
  // Matches "HH:MM AM/PM" or "HH:MM"
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) {
    return { hours: 9, minutes: 0 }; // default fallback
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];

  if (ampm) {
    const isPM = ampm.toUpperCase() === 'PM';
    const isAM = ampm.toUpperCase() === 'AM';
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
  }
  return { hours, minutes };
}

export function getLastResetTime(timeStr: string): Date {
  const { hours, minutes } = parseResetTime(timeStr);
  const now = new Date();
  
  const resetToday = new Date(now);
  resetToday.setHours(hours, minutes, 0, 0);

  if (now >= resetToday) {
    return resetToday;
  } else {
    const resetYesterday = new Date(resetToday);
    resetYesterday.setDate(resetYesterday.getDate() - 1);
    return resetYesterday;
  }
}
