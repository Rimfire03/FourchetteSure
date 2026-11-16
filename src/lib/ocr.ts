import { parseLabel, type LabelGuess } from './logic'

/** OCR local (tesseract.js, chargé à la demande). Les données de langue 'fra' sont téléchargées au premier usage (Internet requis une fois). */
export async function ocrLabel(blob: Blob): Promise<{ text: string; guess: LabelGuess }> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('fra')
  try {
    const { data } = await worker.recognize(blob)
    return { text: data.text, guess: parseLabel(data.text) }
  } finally {
    await worker.terminate()
  }
}
