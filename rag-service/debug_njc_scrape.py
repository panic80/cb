#!/usr/bin/env python3
"""Debug script to check NJC page scraping."""

import httpx
from bs4 import BeautifulSoup
import asyncio


async def debug_njc_scrape():
    """Debug NJC page scraping to see what content is extracted."""
    
    url = "https://www.njc-cnm.gc.ca/directive/d10/v238/en"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
    
    soup = BeautifulSoup(response.text, "html.parser")
    
    # Check page structure
    print("Page title:", soup.find("title").text if soup.find("title") else "No title")
    
    # Look for tables
    tables = soup.find_all("table")
    print(f"\nFound {len(tables)} tables")
    
    # Check main content area
    main_content = soup.find("main") or soup.find(class_="content") or soup.find(id="content")
    if main_content:
        print(f"\nMain content found with tag: {main_content.name}")
        # Count text length
        text = main_content.get_text()
        print(f"Text length: {len(text)} characters")
        
        # Count paragraphs and lists
        paras = main_content.find_all("p")
        lists = main_content.find_all(["ul", "ol"])
        print(f"Paragraphs: {len(paras)}, Lists: {len(lists)}")
    
    # Extract meal rates table specifically
    print("\n--- Looking for meal rates table ---")
    for i, table in enumerate(tables):
        # Check if this is the meal rates table
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if any("breakfast" in h.lower() or "lunch" in h.lower() for h in headers):
            print(f"\nTable {i+1} appears to be meal rates:")
            print("Headers:", headers)
            
            # Count rows
            rows = table.find_all("tr")
            print(f"Total rows: {len(rows)}")
            
            # Show first few rows
            print("\nFirst 5 data rows:")
            data_rows = [tr for tr in rows if tr.find_all("td")]
            for j, row in enumerate(data_rows[:5]):
                cells = [td.get_text(strip=True) for td in row.find_all("td")]
                print(f"  {cells}")
            
            # Look for Yukon specifically
            print("\nSearching for Yukon...")
            for row in data_rows:
                cells = [td.get_text(strip=True) for td in row.find_all("td")]
                if any("yukon" in cell.lower() for cell in cells):
                    print(f"FOUND: {cells}")


asyncio.run(debug_njc_scrape())