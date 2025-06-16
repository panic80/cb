#!/usr/bin/env python3

"""Comprehensive debug tool for table extraction and retrieval pipeline."""

import logging
import sys
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
import pandas as pd
from bs4 import BeautifulSoup

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack import Document
from app.pipelines.indexing import create_url_indexing_pipeline
from app.pipelines.query import create_query_pipeline
from app.components.table_aware_converter import TableAwareHTMLConverter
from app.components.table_aware_splitter import TableAwareDocumentSplitter
from app.components.score_filter import ScoreFilter
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class TablePipelineDebugger:
    """Debug tool for analyzing table extraction and retrieval issues."""
    
    def __init__(self):
        self.document_store = InMemoryDocumentStore()
        self.converter = TableAwareHTMLConverter()
        self.splitter = TableAwareDocumentSplitter(
            split_length=settings.CHUNK_SIZE,
            split_overlap=settings.CHUNK_OVERLAP,
            preserve_tables=True
        )
        self.score_filter = ScoreFilter(threshold=0.05, top_k=settings.TOP_K_RERANKING)
        
    def create_test_table_html(self) -> str:
        """Create test HTML with various table structures."""
        return """
        <html>
        <body>
            <h1>Policy Document</h1>
            <p>This document contains various allowance tables for reference.</p>
            
            <h2>Hardship Allowance Rates</h2>
            <table id="hardship-allowance" class="policy-table">
                <thead>
                    <tr>
                        <th>Level</th>
                        <th>Description</th>
                        <th>Monthly Amount</th>
                        <th>Effective Date</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>0</td>
                        <td>CFB Standard</td>
                        <td>$0</td>
                        <td>2024-01-01</td>
                    </tr>
                    <tr>
                        <td>1</td>
                        <td>Minor Hardship</td>
                        <td>$100</td>
                        <td>2024-01-01</td>
                    </tr>
                    <tr>
                        <td>2</td>
                        <td>Low Hardship</td>
                        <td>$200</td>
                        <td>2024-01-01</td>
                    </tr>
                    <tr>
                        <td>3</td>
                        <td>Moderate Hardship</td>
                        <td>$400</td>
                        <td>2024-01-01</td>
                    </tr>
                    <tr>
                        <td>4</td>
                        <td>High Hardship</td>
                        <td>$600</td>
                        <td>2024-01-01</td>
                    </tr>
                    <tr>
                        <td>5</td>
                        <td>Severe Hardship</td>
                        <td>$800</td>
                        <td>2024-01-01</td>
                    </tr>
                    <tr>
                        <td>6</td>
                        <td>Austere</td>
                        <td>$1000</td>
                        <td>2024-01-01</td>
                    </tr>
                </tbody>
            </table>
            
            <h2>Travel Allowance Rates</h2>
            <table id="travel-allowance">
                <tr>
                    <th>Category</th>
                    <th>Daily Rate</th>
                </tr>
                <tr>
                    <td>Accommodation</td>
                    <td>$150</td>
                </tr>
                <tr>
                    <td>Meals</td>
                    <td>$75</td>
                </tr>
                <tr>
                    <td>Incidentals</td>
                    <td>$25</td>
                </tr>
            </table>
            
            <p>These rates are subject to annual review and adjustment.</p>
        </body>
        </html>
        """
    
    def analyze_table_extraction(self) -> Dict[str, Any]:
        """Analyze table extraction from HTML."""
        print("\n" + "="*80)
        print("ANALYZING TABLE EXTRACTION")
        print("="*80)
        
        html_content = self.create_test_table_html()
        
        # Test converter
        result = self.converter.run(sources=[html_content])
        documents = result["documents"]
        
        analysis = {
            "html_input_size": len(html_content),
            "documents_created": len(documents),
            "tables_detected": 0,
            "table_content_preserved": False,
            "markdown_tables_found": False,
            "content_preview": ""
        }
        
        if documents:
            doc = documents[0]
            content = doc.content
            analysis["content_preview"] = content[:500]
            
            # Count markdown tables
            table_pattern = content.count("|")
            if table_pattern > 10:  # Rough estimate for table presence
                analysis["markdown_tables_found"] = True
                analysis["tables_detected"] = content.count("Level") + content.count("Category")
            
            # Check for preserved table data
            test_values = ["$100", "$200", "$400", "$600", "$800", "$1000", "Austere", "Minor Hardship"]
            preserved_count = sum(1 for val in test_values if val in content)
            analysis["table_content_preserved"] = preserved_count >= 6
            
            print(f"✅ Documents created: {analysis['documents_created']}")
            print(f"✅ Tables detected: {analysis['tables_detected']}" if analysis['tables_detected'] > 0 else f"❌ No tables detected")
            print(f"✅ Table content preserved: {analysis['table_content_preserved']}" if analysis['table_content_preserved'] else f"❌ Table content not preserved")
            print(f"✅ Markdown tables found: {analysis['markdown_tables_found']}" if analysis['markdown_tables_found'] else f"❌ No markdown tables found")
            
            print(f"\nContent preview:")
            print("-" * 40)
            print(content[:800])
            print("-" * 40)
        else:
            print("❌ No documents created from HTML input")
        
        return analysis
    
    def analyze_document_splitting(self, documents: List[Document]) -> Dict[str, Any]:
        """Analyze how documents are split while preserving tables."""
        print("\n" + "="*80)
        print("ANALYZING DOCUMENT SPLITTING")
        print("="*80)
        
        if not documents:
            print("❌ No documents to split")
            return {"error": "No documents provided"}
        
        # Test splitter
        result = self.splitter.run(documents=documents)
        split_documents = result["documents"]
        
        analysis = {
            "original_docs": len(documents),
            "split_docs": len(split_documents),
            "chunks_with_tables": 0,
            "table_boundaries_preserved": True,
            "chunk_sizes": [],
            "table_content_distribution": {}
        }
        
        table_keywords = ["Level", "Description", "Monthly Amount", "Category", "Daily Rate"]
        
        for i, doc in enumerate(split_documents):
            chunk_size = len(doc.content.split())
            analysis["chunk_sizes"].append(chunk_size)
            
            # Check for table content
            table_content_found = any(keyword in doc.content for keyword in table_keywords)
            if table_content_found:
                analysis["chunks_with_tables"] += 1
                
                # Check if table structure is preserved
                if "|" in doc.content and doc.content.count("|") > 5:
                    analysis["table_content_distribution"][f"chunk_{i}"] = {
                        "has_table_structure": True,
                        "pipe_count": doc.content.count("|"),
                        "preview": doc.content[:200]
                    }
        
        print(f"Original documents: {analysis['original_docs']}")
        print(f"Split into chunks: {analysis['split_docs']}")
        print(f"Chunks with table content: {analysis['chunks_with_tables']}")
        print(f"Average chunk size: {sum(analysis['chunk_sizes'])/len(analysis['chunk_sizes']):.1f} words" if analysis['chunk_sizes'] else "N/A")
        
        for chunk_id, info in analysis["table_content_distribution"].items():
            print(f"\n{chunk_id}: Table structure preserved: {info['has_table_structure']}")
            print(f"  Pipe characters: {info['pipe_count']}")
            print(f"  Preview: {info['preview']}")
        
        return analysis
    
    async def analyze_retrieval_scores(self, documents: List[Document]) -> Dict[str, Any]:
        """Analyze retrieval scores for table-related queries."""
        print("\n" + "="*80)
        print("ANALYZING RETRIEVAL SCORES")
        print("="*80)
        
        # Index documents
        for doc in documents:
            self.document_store.write_documents([doc])
        
        # Create query pipeline
        query_pipeline = create_query_pipeline(self.document_store)
        
        test_queries = [
            "hardship allowance table",
            "hardship allowance rates",
            "level 3 hardship allowance",
            "austere hardship allowance",
            "monthly hardship allowance amounts",
            "travel allowance rates",
            "daily meal allowance",
            "accommodation rates"
        ]
        
        analysis = {
            "query_results": {},
            "score_statistics": {
                "min_score": float('inf'),
                "max_score": 0.0,
                "avg_score": 0.0,
                "scores_below_threshold": 0,
                "total_retrievals": 0
            }
        }
        
        all_scores = []
        
        for query in test_queries:
            print(f"\nTesting query: '{query}'")
            
            try:
                # Get embedder result first
                embedder_result = query_pipeline.get_component("embedder").run(text=query)
                embedding = embedder_result["embedding"]
                
                # Run retriever
                retriever_result = query_pipeline.get_component("retriever").run(
                    query_embedding=embedding
                )
                retrieved_docs = retriever_result["documents"]
                
                # Apply score filter
                filter_result = self.score_filter.run(documents=retrieved_docs)
                filtered_docs = filter_result["documents"]
                
                query_analysis = {
                    "retrieved_count": len(retrieved_docs),
                    "filtered_count": len(filtered_docs),
                    "scores": [getattr(doc, 'score', 0.0) for doc in retrieved_docs],
                    "relevant_content_found": False
                }
                
                # Check relevance
                table_keywords = ["Level", "hardship", "allowance", "$", "rate"]
                for doc in filtered_docs:
                    if any(keyword.lower() in doc.content.lower() for keyword in table_keywords):
                        query_analysis["relevant_content_found"] = True
                        break
                
                analysis["query_results"][query] = query_analysis
                all_scores.extend(query_analysis["scores"])
                
                print(f"  Retrieved: {query_analysis['retrieved_count']} docs")
                print(f"  After filtering: {query_analysis['filtered_count']} docs")
                print(f"  Relevant content found: {query_analysis['relevant_content_found']}")
                print(f"  Score range: {min(query_analysis['scores']):.3f} - {max(query_analysis['scores']):.3f}" if query_analysis['scores'] else "No scores")
                
            except Exception as e:
                print(f"  Error: {e}")
                analysis["query_results"][query] = {"error": str(e)}
        
        # Calculate score statistics
        if all_scores:
            analysis["score_statistics"] = {
                "min_score": min(all_scores),
                "max_score": max(all_scores),
                "avg_score": sum(all_scores) / len(all_scores),
                "scores_below_threshold": sum(1 for score in all_scores if score < 0.05),
                "total_retrievals": len(all_scores)
            }
        
        print(f"\nScore Statistics:")
        stats = analysis["score_statistics"]
        print(f"  Min score: {stats['min_score']:.3f}")
        print(f"  Max score: {stats['max_score']:.3f}")
        print(f"  Average score: {stats['avg_score']:.3f}")
        print(f"  Scores below threshold (0.05): {stats['scores_below_threshold']}/{stats['total_retrievals']}")
        
        return analysis
    
    async def run_comprehensive_analysis(self):
        """Run complete analysis of table processing pipeline."""
        print("Starting comprehensive table pipeline analysis...")
        
        # Step 1: Analyze table extraction
        extraction_analysis = self.analyze_table_extraction()
        
        # Get documents for further analysis
        html_content = self.create_test_table_html()
        result = self.converter.run(sources=[html_content])
        documents = result["documents"]
        
        # Step 2: Analyze document splitting
        split_result = self.splitter.run(documents=documents)
        split_documents = split_result["documents"]
        splitting_analysis = self.analyze_document_splitting(documents)
        
        # Step 3: Analyze retrieval scores
        retrieval_analysis = await self.analyze_retrieval_scores(split_documents)
        
        # Summary
        print("\n" + "="*80)
        print("ANALYSIS SUMMARY")
        print("="*80)
        
        issues_found = []
        
        if not extraction_analysis.get("table_content_preserved", False):
            issues_found.append("Table content not properly extracted from HTML")
        
        if not extraction_analysis.get("markdown_tables_found", False):
            issues_found.append("Tables not converted to Markdown format")
        
        if splitting_analysis.get("chunks_with_tables", 0) == 0:
            issues_found.append("No table content found in document chunks")
        
        stats = retrieval_analysis.get("score_statistics", {})
        if stats.get("scores_below_threshold", 0) > stats.get("total_retrievals", 1) * 0.5:
            issues_found.append("Many retrieval scores below threshold (poor similarity matching)")
        
        relevant_queries = sum(1 for result in retrieval_analysis.get("query_results", {}).values() 
                             if isinstance(result, dict) and result.get("relevant_content_found", False))
        total_queries = len(retrieval_analysis.get("query_results", {}))
        
        if relevant_queries < total_queries * 0.7:
            issues_found.append(f"Low relevant content retrieval: {relevant_queries}/{total_queries} queries successful")
        
        if issues_found:
            print("❌ Issues identified:")
            for issue in issues_found:
                print(f"  - {issue}")
        else:
            print("✅ No major issues found in table processing pipeline")
        
        return {
            "extraction_analysis": extraction_analysis,
            "splitting_analysis": splitting_analysis,
            "retrieval_analysis": retrieval_analysis,
            "issues_found": issues_found
        }


async def main():
    """Main debug function."""
    debugger = TablePipelineDebugger()
    await debugger.run_comprehensive_analysis()


if __name__ == "__main__":
    asyncio.run(main())