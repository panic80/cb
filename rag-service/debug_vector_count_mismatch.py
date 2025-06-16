#!/usr/bin/env python3
"""
Debug script to investigate vector count mismatch in RAG system.
This script examines the document store and metadata to find discrepancies.
"""

import asyncio
import logging
import sys
import json
from pathlib import Path
from collections import defaultdict, Counter
from typing import Dict, Any, List, Optional

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent / "app"))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def debug_vector_count_mismatch():
    """Main debug function to investigate vector count mismatch."""
    try:
        logger.info("🔍 Starting vector count mismatch investigation...")
        
        # Import and initialize the pipeline manager
        from app.pipelines.manager import PipelineManager
        from app.core.config import settings
        
        # Initialize pipeline manager
        manager = PipelineManager()
        await manager.initialize()
        
        # Get document store and metadata service
        document_store = manager.document_store
        metadata_service = manager.document_store_service
        
        logger.info("✅ Pipeline manager initialized successfully")
        
        # 1. Get total document count from vector store
        total_docs = document_store.count_documents()
        logger.info(f"📊 Total documents in vector store: {total_docs}")
        
        # 2. Get all documents and analyze their metadata
        all_docs = document_store.filter_documents()
        logger.info(f"📋 Retrieved {len(all_docs)} documents for analysis")
        
        # 3. Analyze document metadata
        source_counts = defaultdict(int)
        source_ids = defaultdict(int)
        content_types = Counter()
        missing_metadata = []
        
        for doc in all_docs:
            meta = doc.meta or {}
            
            # Count by source
            source = meta.get('source', 'unknown')
            source_counts[source] += 1
            
            # Count by source_id
            source_id = meta.get('source_id', 'unknown')
            source_ids[source_id] += 1
            
            # Count content types
            content_type = meta.get('content_type', 'unknown')
            content_types[content_type] += 1
            
            # Track documents with missing key metadata
            if not meta.get('source') and not meta.get('source_id'):
                missing_metadata.append({
                    'doc_id': doc.id,
                    'content_preview': doc.content[:100] + '...' if len(doc.content) > 100 else doc.content,
                    'meta': meta
                })
        
        # 4. Get sources from metadata store
        sources_data = await metadata_service.list_sources(limit=1000)
        tracked_sources = sources_data.get('sources', [])
        
        logger.info(f"📚 Sources tracked in metadata store: {len(tracked_sources)}")
        
        # 5. Print detailed analysis
        print("\n" + "="*80)
        print("🔍 VECTOR COUNT MISMATCH ANALYSIS")
        print("="*80)
        
        print(f"\n📊 SUMMARY:")
        print(f"   Total vectors in store: {total_docs}")
        print(f"   Sources in metadata:    {len(tracked_sources)}")
        print(f"   Unique sources found:   {len(source_counts)}")
        print(f"   Unique source IDs:      {len(source_ids)}")
        
        print(f"\n📋 DOCUMENTS BY SOURCE:")
        for source, count in sorted(source_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"   {source}: {count} documents")
        
        print(f"\n🆔 DOCUMENTS BY SOURCE ID:")
        for source_id, count in sorted(source_ids.items(), key=lambda x: x[1], reverse=True):
            print(f"   {source_id}: {count} documents")
        
        print(f"\n📄 CONTENT TYPES:")
        for content_type, count in content_types.most_common():
            print(f"   {content_type}: {count} documents")
        
        print(f"\n📚 TRACKED SOURCES (from metadata store):")
        total_tracked_chunks = 0
        for source in tracked_sources:
            chunk_count = source.get('chunk_count', 0)
            total_tracked_chunks += chunk_count
            print(f"   {source.get('title', 'Unknown')}: {chunk_count} chunks")
            print(f"      Source ID: {source.get('source_id', 'N/A')}")
            print(f"      Created: {source.get('created_at', 'N/A')}")
            print()
        
        print(f"📊 TOTAL TRACKED CHUNKS: {total_tracked_chunks}")
        
        # 6. Identify discrepancies
        discrepancy = total_docs - total_tracked_chunks
        print(f"\n⚠️  DISCREPANCY ANALYSIS:")
        print(f"   Vector store documents: {total_docs}")
        print(f"   Tracked source chunks:  {total_tracked_chunks}")
        print(f"   Unaccounted documents:  {discrepancy}")
        
        if discrepancy > 0:
            print(f"\n🔍 POSSIBLE CAUSES:")
            print(f"   • {len(missing_metadata)} documents with missing source metadata")
            print(f"   • Orphaned documents from deleted sources")
            print(f"   • Documents created before metadata tracking")
            print(f"   • Inconsistent source tracking")
        
        # 7. Show documents with missing metadata
        if missing_metadata:
            print(f"\n❌ DOCUMENTS WITH MISSING METADATA ({len(missing_metadata)}):")
            for i, doc in enumerate(missing_metadata[:10]):  # Show first 10
                print(f"   {i+1}. Doc ID: {doc['doc_id']}")
                print(f"      Content: {doc['content_preview']}")
                print(f"      Meta: {doc['meta']}")
                print()
            
            if len(missing_metadata) > 10:
                print(f"   ... and {len(missing_metadata) - 10} more")
        
        # 8. Check for duplicate tracking
        print(f"\n🔄 DUPLICATE ANALYSIS:")
        source_id_duplicates = {sid: count for sid, count in source_ids.items() if count > 1 and sid != 'unknown'}
        if source_id_duplicates:
            print("   Found duplicate source IDs:")
            for sid, count in source_id_duplicates.items():
                print(f"   • {sid}: {count} documents")
        else:
            print("   No duplicate source IDs found")
        
        # 9. Recommendations
        print(f"\n💡 RECOMMENDATIONS:")
        if discrepancy > 0:
            print(f"   1. Clean up {discrepancy} untracked documents")
            print(f"   2. Implement source metadata validation")
            print(f"   3. Add cleanup job for orphaned documents")
        
        if missing_metadata:
            print(f"   4. Fix {len(missing_metadata)} documents with missing metadata")
        
        if source_id_duplicates:
            print(f"   5. Resolve duplicate source ID tracking")
        
        print("\n" + "="*80)
        
        await manager.cleanup()
        
    except Exception as e:
        logger.error(f"❌ Debug failed: {e}", exc_info=True)
        return False
    
    return True

async def fix_orphaned_documents():
    """Fix orphaned documents by either cleaning them up or adding proper metadata."""
    logger.info("🔧 Starting orphaned document cleanup...")
    
    try:
        # Import and initialize the pipeline manager
        from app.pipelines.manager import PipelineManager
        
        # Initialize pipeline manager
        manager = PipelineManager()
        await manager.initialize()
        
        document_store = manager.document_store
        
        # Get all documents
        all_docs = document_store.filter_documents()
        orphaned_docs = []
        
        for doc in all_docs:
            meta = doc.meta or {}
            if not meta.get('source') and not meta.get('source_id'):
                orphaned_docs.append(doc.id)
        
        if orphaned_docs:
            logger.info(f"🗑️  Found {len(orphaned_docs)} orphaned documents")
            
            # Ask user for confirmation
            response = input(f"Delete {len(orphaned_docs)} orphaned documents? (y/N): ")
            if response.lower() == 'y':
                document_store.delete_documents(document_ids=orphaned_docs)
                logger.info(f"✅ Deleted {len(orphaned_docs)} orphaned documents")
            else:
                logger.info("❌ Cleanup cancelled")
        else:
            logger.info("✅ No orphaned documents found")
        
        await manager.cleanup()
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {e}", exc_info=True)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Debug vector count mismatch in RAG system")
    parser.add_argument("--fix", action="store_true", help="Fix orphaned documents")
    args = parser.parse_args()
    
    if args.fix:
        asyncio.run(fix_orphaned_documents())
    else:
        asyncio.run(debug_vector_count_mismatch())