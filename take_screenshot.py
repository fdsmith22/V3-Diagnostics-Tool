#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright
import sys

async def take_screenshot(url, output_file):
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=True)
        
        # Create context with viewport size
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        
        # Create page
        page = await context.new_page()
        
        # Navigate to URL
        print(f"Navigating to {url}")
        await page.goto(url, wait_until='networkidle')
        
        # Wait a bit for any animations
        await page.wait_for_timeout(2000)
        
        # Take screenshot
        await page.screenshot(path=output_file, full_page=False)
        print(f"Screenshot saved to {output_file}")
        
        # Close browser
        await browser.close()

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5000/terminal"
    output = sys.argv[2] if len(sys.argv) > 2 else "terminal_screenshot.png"
    
    asyncio.run(take_screenshot(url, output))