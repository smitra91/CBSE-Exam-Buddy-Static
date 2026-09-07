import * as pdfjsLib from "./pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;

window.extractPdfText = async function extractPdfText(file, onProgress = () => {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(pageNumber, pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = [];
    let currentLine = [];
    let previousY = null;

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform?.[5] ?? previousY;
      if (previousY !== null && y !== null && Math.abs(y - previousY) > 4 && currentLine.length) {
        lines.push(currentLine.join(" "));
        currentLine = [];
      }
      if (item.str.trim()) currentLine.push(item.str.trim());
      previousY = y;
    }
    if (currentLine.length) lines.push(currentLine.join(" "));
    pages.push(lines.join("\n"));
  }

  return pages.join("\n\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
};
