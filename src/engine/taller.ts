import { todasLasEras } from '../eras';
import type { EraData } from './eras';

/**
 * The workshop: a worker that generates eras' data off the main thread. It knows every era (the
 * same registry the page uses) and answers `{ id, ticket }` with `{ ticket, data }`, handing the
 * typed arrays over without copying them. Generation may be async (an era that loads data).
 */

const specs = new Map(todasLasEras().map((m) => [m.spec.id, m.spec]));

function buffers(v: unknown, out = new Set<ArrayBuffer>()) {
  if (ArrayBuffer.isView(v)) out.add(v.buffer as ArrayBuffer);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) buffers(x, out);
  return out;
}

const scope = self as unknown as {
  onmessage: (ev: MessageEvent<{ id: string; ticket: number }>) => void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async (ev) => {
  const { id, ticket } = ev.data;
  try {
    const data: EraData = await specs.get(id)!.generate();
    scope.postMessage({ ticket, data }, [...buffers(data)]);
  } catch (err) {
    scope.postMessage({ ticket, error: String(err) });
  }
};
