#!/usr/bin/env python3
"""Check NJC print version for meal rates."""

import httpx
from bs4 import BeautifulSoup
import asyncio


async def check_njc_print():
    """Check the print version of NJC page."""
    
    # Try the print version
    url = "https://www.njc-cnm.gc.ca/directive/d10/v238/en?print"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        print(f"Status: {response.status_code}")
    
    soup = BeautifulSoup(response.text, "html.parser")
    
    # Look for tables
    tables = soup.find_all("table")
    print(f"\nFound {len(tables)} tables in print version")
    
    # Look for Yukon in tables
    for i, table in enumerate(tables):
        rows = table.find_all("tr")
        for row in rows:
            cells = [cell.get_text(strip=True) for cell in row.find_all(["td", "th"])]
            if any("yukon" in cell.lower() for cell in cells):
                print(f"\nTable {i+1} - Yukon row found:")
                print(cells)
    
    # Also look for any text containing 25.65
    text = soup.get_text()
    if "25.65" in text:
        print("\nFound 25.65 in the page!")
        # Find context
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if "25.65" in line:
                print(f"Context around 25.65:")
                for j in range(max(0, i-2), min(len(lines), i+3)):
                    print(f"  {lines[j].strip()}")


asyncio.run(check_njc_print())