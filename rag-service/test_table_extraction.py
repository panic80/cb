#!/usr/bin/env python3

"""Simple test for table extraction with hardship allowance table."""

import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from app.components.table_aware_converter import TableAwareHTMLConverter

def test_table_extraction():
    """Test table extraction with a hardship allowance table."""
    
    print("Testing table extraction with hardship allowance table...")
    
    # Sample HTML with hardship allowance table
    sample_html = """
    <html>
    <body>
        <h2>Hardship Allowance (HA) Monthly Rates</h2>
        <p>The following table shows the monthly hardship allowance rates by level:</p>
        <table id="hardship-allowance">
            <thead>
                <tr>
                    <th>HA Level</th>
                    <th>Description</th>
                    <th>Monthly Rate (CAD)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>0</td>
                    <td>CFB Standard (No hardship)</td>
                    <td>$0</td>
                </tr>
                <tr>
                    <td>1</td>
                    <td>Minor Hardship</td>
                    <td>$150</td>
                </tr>
                <tr>
                    <td>2</td>
                    <td>Low Hardship</td>
                    <td>$300</td>
                </tr>
                <tr>
                    <td>3</td>
                    <td>Moderate Hardship</td>
                    <td>$450</td>
                </tr>
                <tr>
                    <td>4</td>
                    <td>High Hardship</td>
                    <td>$600</td>
                </tr>
                <tr>
                    <td>5</td>
                    <td>Severe Hardship</td>
                    <td>$750</td>
                </tr>
                <tr>
                    <td>6</td>
                    <td>Austere</td>
                    <td>$900</td>
                </tr>
            </tbody>
        </table>
        <p>These rates are effective as of the current fiscal year.</p>
    </body>
    </html>
    """
    
    # Test the converter
    converter = TableAwareHTMLConverter()
    result = converter.run(sources=[sample_html])
    documents = result["documents"]
    
    print(f"Extracted {len(documents)} documents")
    
    if documents:
        doc = documents[0]
        print("\n" + "="*60)
        print("EXTRACTED CONTENT:")
        print("="*60)
        print(doc.content)
        print("="*60)
        
        # Check for key elements
        checks = [
            ("Table headers", ["HA Level", "Description", "Monthly Rate"]),
            ("Table data", ["CFB Standard", "$150", "$300", "$450", "$600", "$750", "$900"]),
            ("Context", ["Hardship Allowance", "monthly", "rates"]),
            ("Markdown table format", ["|", "---"])
        ]
        
        for check_name, terms in checks:
            found_terms = [term for term in terms if term in doc.content]
            if found_terms:
                print(f"✅ {check_name}: Found {len(found_terms)}/{len(terms)} terms: {found_terms}")
            else:
                print(f"❌ {check_name}: No terms found")
    else:
        print("❌ No documents extracted")

if __name__ == "__main__":
    test_table_extraction()