export const formatKES = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return `KES ${v.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
};

export const formatKESCompact = (n: number) =>
  `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
