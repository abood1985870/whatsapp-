import { prisma } from '@qanoai/database';

// Uses server-local time, not the organization's own timezone (Organization
// has no timezone-aware conversion wired up yet) - close enough for a single
// deployment region, but not correct for multi-region tenants.
export async function isWithinWorkingHours(organizationId: string, now: Date = new Date()): Promise<boolean> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const holiday = await prisma.holiday.findFirst({
    where: { organizationId, date: { gte: startOfDay, lt: endOfDay } }
  });
  if (holiday) return false;

  const hours = await prisma.workingHours.findMany({
    where: { organizationId, dayOfWeek: now.getDay(), isActive: true }
  });
  if (!hours.length) return true; // No configured schedule = treat as always open

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return hours.some(h => {
    const [startH, startM] = h.startTime.split(':').map(Number);
    const [endH, endM] = h.endTime.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    return currentMinutes >= start && currentMinutes < end;
  });
}
