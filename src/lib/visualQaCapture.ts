import html2canvas from "html2canvas";

const RENDER_WIDTH = 390;
const MAX_SLICE_HEIGHT = 1200;

/**
 * Render HTML email in a hidden iframe at 470px, capture as image slices.
 * Returns base64 JPEG data URLs ready for vision model consumption.
 */
export async function captureEmailScreenshots(
  html: string,
): Promise<{ slices: string[]; totalHeight: number }> {
  return new Promise((resolve, reject) => {
    // Inject styles that match the preview — no height:auto!important so grid heights are respected
    const preparedHtml = html.replace(
      /(<head[^>]*>)/i,
      '$1<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}table{max-width:100%!important;width:100%!important;box-sizing:border-box!important;}img{max-width:100%;}td{box-sizing:border-box!important;}</style>'
    );

    const iframe = document.createElement("iframe");
    iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${RENDER_WIDTH}px;border:none;visibility:hidden;`;
    iframe.sandbox.add("allow-same-origin");
    document.body.appendChild(iframe);

    iframe.srcdoc = preparedHtml;

    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) throw new Error("iframe body not available");

        // Wait for all images to load
        const images = Array.from(doc.querySelectorAll("img"));
        await Promise.all(
          images.map(
            (img) =>
              new Promise<void>((res) => {
                if (img.complete) return res();
                img.onload = () => res();
                img.onerror = () => res();
                // Safety timeout per image
                setTimeout(res, 5000);
              })
          )
        );

        // Give a moment for final layout reflow
        await new Promise((r) => setTimeout(r, 500));

        // Set iframe height to full content height
        const totalHeight = Math.max(
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight,
          200
        );
        iframe.style.height = `${totalHeight}px`;

        // Wait for resize
        await new Promise((r) => setTimeout(r, 200));

        // Capture with html2canvas
        const canvas = await html2canvas(doc.body, {
          width: RENDER_WIDTH,
          height: totalHeight,
          windowWidth: RENDER_WIDTH,
          windowHeight: totalHeight,
          scale: 1,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        // Slice the canvas into segments
        const sliceCount = Math.max(1, Math.ceil(totalHeight / MAX_SLICE_HEIGHT));
        const sliceHeight = Math.ceil(totalHeight / sliceCount);
        const slices: string[] = [];

        for (let i = 0; i < sliceCount; i++) {
          const sy = i * sliceHeight;
          const sh = Math.min(sliceHeight, totalHeight - sy);

          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = RENDER_WIDTH;
          sliceCanvas.height = sh;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, sy, RENDER_WIDTH, sh, 0, 0, RENDER_WIDTH, sh);

          // JPEG for smaller payloads
          const dataUrl = sliceCanvas.toDataURL("image/jpeg", 0.85);
          slices.push(dataUrl);
        }

        document.body.removeChild(iframe);
        resolve({ slices, totalHeight });
      } catch (err) {
        document.body.removeChild(iframe);
        reject(err);
      }
    };

    iframe.onerror = () => {
      document.body.removeChild(iframe);
      reject(new Error("Failed to load iframe for visual QA"));
    };

    // Safety timeout
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
        reject(new Error("Visual QA capture timed out"));
      }
    }, 30000);
  });
}
