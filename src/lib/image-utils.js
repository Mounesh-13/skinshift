/*
 * Upload pipeline: validate -> decode -> resize -> re-encode -> sample.
 * Popup-only (uses DOM canvas). The service worker never sees raw uploads.
 *
 * Why re-encode at all: a 40 MB camera photo would eat storage and slow every page load.
 * Re-encoding to JPEG also strips metadata (EXIF GPS etc.), which matters for a privacy tool.
 */
(function (g) {
  'use strict';
  const NS = (g.SkinShift = g.SkinShift || {});

  function fail(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
  }

  function validateFile(file) {
    if (!file) throw fail('no-file', 'No file selected.');
    if (file.size > NS.LIMITS.maxUploadBytes) {
      throw fail('too-large', 'That file is over 15 MB. Try a smaller image.');
    }
    if (!NS.LIMITS.acceptedTypes.includes(file.type)) {
      throw fail('bad-type', 'Use a JPEG, PNG or WebP image.');
    }
  }

  // Contain-fit: never upscale, never crop. Cropping is a per-screen decision made at render time.
  function fitWithin(w, h, maxW, maxH) {
    const scale = Math.min(1, maxW / w, maxH / h);
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  }

  // Average colour of the central band where chat text sits (20%–80% of width). The band is
  // deliberately a little wider than the typical text column so the check is conservative.
  function sampleColumnMean(canvas, x0, x1) {
    const w = 64;
    const h = Math.max(1, Math.round((w * canvas.height) / canvas.width));
    const probe = document.createElement('canvas');
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    const left = Math.floor(w * x0);
    const span = Math.max(1, Math.ceil(w * (x1 - x0)));
    const data = ctx.getImageData(left, 0, span, h).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      gg += data[i + 1];
      b += data[i + 2];
      n++;
    }
    return { r: r / n, g: gg / n, b: b / n };
  }

  NS.prepareWallpaper = async function prepareWallpaper(file) {
    validateFile(file);

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      throw fail('decode-failed', 'Could not read that image. It may be corrupted.');
    }

    const size = fitWithin(bitmap.width, bitmap.height, NS.LIMITS.maxWidth, NS.LIMITS.maxHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    // JPEG has no alpha channel. Flatten transparency onto white instead of letting it go black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, size.w, size.h);
    if (typeof bitmap.close === 'function') bitmap.close();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(fail('encode-failed', 'Could not process the image.'))),
        'image/jpeg',
        NS.LIMITS.jpegQuality
      );
    });

    return {
      blob,
      width: size.w,
      height: size.h,
      sample: sampleColumnMean(canvas, 0.2, 0.8)
    };
  };

  NS.fitWithin = fitWithin;
  NS.validateFile = validateFile;
})(typeof self !== 'undefined' ? self : window);
