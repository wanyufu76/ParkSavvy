import * as ort from "onnxruntime-web";

ort.env.wasm.wasmPaths = "/";
ort.env.wasm.simd = true;
ort.env.wasm.numThreads = 1;

export type Box = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cls: string;
  conf: number;
};

export type DetectResult = {
  hasMotorcycle: boolean;
  boxes: Box[];
};

type OnnxCfg = {
  modelUrl: string;
  confThres?: number;
  iouThres?: number;
  normalize?: boolean;
  inputSize?: number;
};

function letterboxToTarget(
  src: ImageData,
  dstSize: number
) {
  const { width: rawW, height: rawH } = src;
  const dstW = dstSize;
  const dstH = dstSize;

  const r = Math.min(dstW / rawW, dstH / rawH);
  const newW = Math.round(rawW * r);
  const newH = Math.round(rawH * r);
  const padX = Math.floor((dstW - newW) / 2);
  const padY = Math.floor((dstH - newH) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, dstW, dstH);

  const tmp = document.createElement("canvas");
  tmp.width = rawW;
  tmp.height = rawH;
  const tctx = tmp.getContext("2d")!;
  tctx.putImageData(src, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, 0, 0, rawW, rawH, padX, padY, newW, newH);

  return { canvas, gain: r, padX, padY, dstW, dstH };
}

function toTensorFromCanvas(
  canvas: HTMLCanvasElement,
  normalize = true
): ort.Tensor {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext("2d")!;
  const im = ctx.getImageData(0, 0, W, H).data;

  const out = new Float32Array(W * H * 3);
  let pr = 0, pg = W * H, pb = 2 * W * H;
  if (normalize) {
    for (let i = 0; i < im.length; i += 4) {
      out[pr++] = im[i] / 255;
      out[pg++] = im[i + 1] / 255;
      out[pb++] = im[i + 2] / 255;
    }
  } else {
    for (let i = 0; i < im.length; i += 4) {
      out[pr++] = im[i];
      out[pg++] = im[i + 1];
      out[pb++] = im[i + 2];
    }
  }
  return new ort.Tensor("float32", out, [1, 3, H, W]);
}

function restoreToRaw(
  x1: number, y1: number, x2: number, y2: number,
  gain: number, padX: number, padY: number,
  rawW: number, rawH: number
) {
  const rx1 = (x1 - padX) / gain;
  const ry1 = (y1 - padY) / gain;
  const rx2 = (x2 - padX) / gain;
  const ry2 = (y2 - padY) / gain;

  const X1 = Math.max(0, Math.min(rawW, rx1));
  const Y1 = Math.max(0, Math.min(rawH, ry1));
  const X2 = Math.max(0, Math.min(rawW, rx2));
  const Y2 = Math.max(0, Math.min(rawH, ry2));

  return {
    x1: Math.round(Math.min(X1, X2)),
    y1: Math.round(Math.min(Y1, Y2)),
    x2: Math.round(Math.max(X1, X2)),
    y2: Math.round(Math.max(Y1, Y2)),
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function parseDetections(
  preds: Float32Array,
  confThres: number,
  gain: number, padX: number, padY: number,
  rawW: number, rawH: number
): Box[] {
  const numClasses = 80;
  const stride = 5 + numClasses;
  const boxes: Box[] = [];

  for (let i = 0; i + stride <= preds.length; i += stride) {
    // 假設輸出仍是 cx,cy,w,h,obj（logits），對 obj/cls 套 sigmoid
    const cx = preds[i];
    const cy = preds[i + 1];
    const w  = preds[i + 2];
    const h  = preds[i + 3];
    const obj = sigmoid(preds[i + 4]);

    // 最高類別（先找 raw，再做 sigmoid）
    let bestC = -1, bestRaw = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      const raw = preds[i + 5 + c];
      if (raw > bestRaw) { bestRaw = raw; bestC = c; }
    }
    const clsId = bestC;
    const clsConf = sigmoid(bestRaw);

    const conf = obj * clsConf; // 現在範圍 0~1
    if (conf < confThres) continue;

    // 保留 COCO: motorcycle = 3
    if (clsId !== 3) continue;

    const x1 = cx - w / 2;
    const y1 = cy - h / 2;
    const x2 = cx + w / 2;
    const y2 = cy + h / 2;

    const r = restoreToRaw(x1, y1, x2, y2, gain, padX, padY, rawW, rawH);
    if (r.x2 - r.x1 < 2 || r.y2 - r.y1 < 2) continue;

    boxes.push({
      ...r,
      cls: "motorcycle",
      conf,
    });
  }
  return boxes;
}

export function createOnnxDetector(cfg: OnnxCfg) {
  const {
    modelUrl,
    confThres = 0.7,
    iouThres = 0.45,
    normalize = true,
    inputSize = 640,
  } = cfg;

  let session: ort.InferenceSession | null = null;

  async function load() {
    if (!session) {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ["wasm"],
      });
      console.log("✅ YOLOv8 ONNX 已載入:", modelUrl);
    }
  }

  async function detect(imageData: ImageData): Promise<DetectResult> {
    if (!session) await load();

    const rawW = imageData.width;
    const rawH = imageData.height;

    const { canvas, gain, padX, padY } = letterboxToTarget(imageData, inputSize);
    const input = toTensorFromCanvas(canvas, normalize);
    const outputs = await session!.run({ images: input });
    const firstKey = Object.keys(outputs)[0];
    const out = outputs[firstKey];
    const data = out.data as Float32Array;

    const boxes = parseDetections(data, confThres, gain, padX, padY, rawW, rawH);

    return {
      hasMotorcycle: boxes.length > 0,
      boxes,
    };
  }

  return { load, detect };
}
