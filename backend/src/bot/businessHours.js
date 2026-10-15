// Horário de atendimento: {enabled, tz, days: {"0".."6": {open, from, to}}, message}
// 0 = domingo ... 6 = sábado. Horários "HH:MM" no fuso tz (padrão São Paulo).
export const DEFAULT_OOH_MESSAGE =
  "Olá! 😊 No momento estamos fora do horário de atendimento. Deixe sua mensagem que respondemos assim que voltarmos.";

export function isOpenNow(hours, now = new Date()) {
  if (!hours?.enabled || !hours.days) return true;
  const tz = hours.tz || "America/Sao_Paulo";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const day = hours.days[String(dow)];
  if (!day?.open) return false;
  const cur = (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
  const toMin = (t) => {
    const [h, m] = String(t || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  const from = toMin(day.from || "00:00");
  const to = toMin(day.to || "23:59");
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}
