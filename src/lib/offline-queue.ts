export type QueuedSale = {
  id: string;
  customer_name: string;
  items: { product_id: string; quantity: number }[];
  total: number;
  queued_at: string;
};

const KEY = "agripos_sale_queue";

export function getQueue(): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch { return []; }
}

export function enqueue(sale: Omit<QueuedSale, "id" | "queued_at">): QueuedSale {
  const entry: QueuedSale = {
    ...sale,
    id: crypto.randomUUID(),
    queued_at: new Date().toISOString(),
  };
  const q = getQueue();
  q.push(entry);
  localStorage.setItem(KEY, JSON.stringify(q));
  return entry;
}

export function dequeue(id: string) {
  const q = getQueue().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function clearQueue() {
  localStorage.removeItem(KEY);
}
