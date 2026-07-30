export const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);

export const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const monthKey = (iso: string) => iso.slice(0, 7);

export const monthLabel = (key: string) => {
  const d = new Date(`${key}-01T00:00:00`);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

const pad = (value: number) => String(value).padStart(2, "0");

export const toLocalISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
};

export const todayISO = () => toLocalISODate(new Date());