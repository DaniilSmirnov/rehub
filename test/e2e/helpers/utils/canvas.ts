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
