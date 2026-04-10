import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

/**
 * Export a dashboard container to PDF by rendering each section separately.
 * Sections are never split across pages.
 * Uses 3x scale for sharp text.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string = 'report.pdf',
) {
  // Hide no-print elements
  const hidden: HTMLElement[] = []
  element.querySelectorAll('.no-print').forEach((el) => {
    const htmlEl = el as HTMLElement
    htmlEl.dataset.prevDisplay = htmlEl.style.display
    htmlEl.style.display = 'none'
    hidden.push(htmlEl)
  })

  // Allow reflow after hiding
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 10
    const contentW = pageW - margin * 2
    const gap = 4

    // Collect visible top-level children
    const sections: HTMLElement[] = []
    for (const child of element.children) {
      const el = child as HTMLElement
      if (el.offsetHeight === 0 || el.offsetWidth === 0) continue
      sections.push(el)
    }

    if (sections.length === 0) {
      // Fallback: capture entire element
      sections.push(element)
    }

    let cursorY = margin
    let isFirstImage = true

    for (const section of sections) {
      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvas(section, {
          scale: 3,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: element.scrollWidth,
        })
      } catch (err) {
        console.warn('Skipping section due to render error:', section.className, err)
        continue
      }

      const renderH = (canvas.height / canvas.width) * contentW

      // New page if doesn't fit (but not before the very first image)
      if (!isFirstImage && cursorY + renderH > pageH - margin) {
        pdf.addPage()
        cursorY = margin
      }

      // If single section is taller than full page, scale to fit
      if (renderH > pageH - margin * 2) {
        const scaledH = pageH - margin * 2
        const scaledW = (canvas.width / canvas.height) * scaledH
        const offsetX = margin + (contentW - scaledW) / 2
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', offsetX, margin, scaledW, scaledH)
        pdf.addPage()
        cursorY = margin
      } else {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, cursorY, contentW, renderH)
        cursorY += renderH + gap
      }

      isFirstImage = false
    }

    pdf.save(filename)
  } finally {
    hidden.forEach((el) => {
      el.style.display = el.dataset.prevDisplay ?? ''
      delete el.dataset.prevDisplay
    })
  }
}
