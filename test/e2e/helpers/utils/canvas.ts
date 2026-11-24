import { Locator, Page } from '@playwright/test'

export async function getCanvasImageData(page: Page, locator: Locator): Promise<string> {
    return await locator.evaluate((canvas: HTMLCanvasElement) => {
        return canvas.toDataURL(); // Возвращает base64 строку
    });
}

// True until the canvas has drawn something: compares it with an empty canvas of the same size
export async function isCanvasBlank(locator: Locator): Promise<boolean> {
    return await locator.evaluate((canvas: HTMLCanvasElement) => {
        const empty = document.createElement('canvas')
        empty.width = canvas.width
        empty.height = canvas.height
        return canvas.toDataURL() === empty.toDataURL()
    })
}

// Number of distinct colours in a sample of the canvas pixels: 1 while nothing was drawn
export async function countCanvasColors(locator: Locator): Promise<number> {
    return await locator.evaluate((canvas: HTMLCanvasElement) => {
        if (!canvas.width || !canvas.height) {
            return 0
        }
        const copy = document.createElement('canvas')
        copy.width = 64
        copy.height = 64
        const context = copy.getContext('2d')!
        context.drawImage(canvas, 0, 0, copy.width, copy.height)
        const data = context.getImageData(0, 0, copy.width, copy.height).data
        const colors = new Set<number>()
        for (let i = 0; i < data.length; i += 4) {
            colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
        }
        return colors.size
    })
}
