// اجرای مدل حذف پس‌زمینه (ISNet) در پس‌زمینه‌ی مرورگر تا پنل قفل نشه.
// همه‌ی فایل‌ها از خود سایت لود می‌شن (بدون CDN خارجی) تا از ایران بدون فیلترشکن کار کنه.
import * as ort from '../vendor/ort/ort.wasm.min.mjs';

ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
// GitHub Pages هدرهای cross-origin isolation نمی‌فرسته، پس معمولاً تک‌رشته‌ای اجرا می‌شه
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const MODEL_SIZE = 46360717;
let session = null;

async function load() {
  if (session) return session;
  const res = await fetch(new URL('isnet.onnx', import.meta.url).href);
  if (!res.ok) throw new Error('model_http_' + res.status);
  let buf;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      postMessage({ type: 'progress', stage: 'download', p: Math.min(1, got / MODEL_SIZE) });
    }
    buf = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { buf.set(c, o); o += c.length; }
  } else {
    buf = new Uint8Array(await res.arrayBuffer());
  }
  postMessage({ type: 'progress', stage: 'init' });
  session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return session;
}

self.onmessage = async (e) => {
  const { id, input, size } = e.data;
  try {
    const s = await load();
    postMessage({ type: 'progress', id, stage: 'run' });
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]) }, [s.outputNames[0]]);
    const mask = new Float32Array(out[s.outputNames[0]].data.subarray(0, size * size));
    postMessage({ type: 'done', id, mask }, [mask.buffer]);
  } catch (err) {
    postMessage({ type: 'error', id, message: String((err && err.message) || err) });
  }
};
