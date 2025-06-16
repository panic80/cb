#!/usr/bin/env python3
"""
Fix metadata mismatch by rebuilding source tracking for existing documents.
"""

import asyncio
import logging
import sys
import uuid
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from typing import Dict, Any, List

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent / "app"))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def fix_metadata_mismatch(action="show"):
    """Fix the metadata mismatch by rebuilding source tracking."""
    try:
        logger.info("🔧 Starting metadata mismatch fix...")
        
        # Import and initialize the pipeline manager
        from app.pipelines.manager import PipelineManager
        
        # Initialize pipeline manager
        manager = PipelineManager()
        await manager.initialize()
        
        document_store = manager.document_store
        metadata_service = manager.document_store_service
        
        # Get all documents
        all_docs = document_store.filter_documents()
        logger.info(f"📋 Found {len(all_docs)} documents in vector store")
        
        # Group documents by source URL
        source_groups = defaultdict(list)
        for doc in all_docs:
            source_url = doc.meta.get('source', 'unknown')
            source_groups[source_url].append(doc)
        
        logger.info(f"📊 Grouped into {len(source_groups)} unique sources")
        
        if action == "show":
            await show_source_breakdown(source_groups)
        elif action == "rebuild":
            await rebuild_metadata(source_groups, metadata_service)
        elif action == "cleanup":
            await cleanup_orphaned_documents(document_store, all_docs)
        
        await manager.cleanup()
        
    except Exception as e:
        logger.error(f"❌ Fix failed: {e}", exc_info=True)

async def show_source_breakdown(source_groups: Dict[str, List]):
    """Show detailed breakdown of sources and document counts."""
    print("\n📊 DETAILED SOURCE BREAKDOWN:")
    print("-" * 80)
    
    # Sort by document count
    sorted_sources = sorted(source_groups.items(), key=lambda x: len(x[1]), reverse=True)
    
    for i, (source_url, docs) in enumerate(sorted_sources[:20], 1):
        doc_count = len(docs)
        print(f"{i:2d}. {source_url}")
        print(f"    📄 Documents: {doc_count}")
        
        # Show sample content
        if docs:
            sample_content = docs[0].content[:100].replace('\n', ' ')
            print(f"    📝 Sample: {sample_content}...")
        print()
    
    if len(sorted_sources) > 20:
        remaining = len(sorted_sources) - 20
        print(f"... and {remaining} more sources")
    
    total_docs = sum(len(docs) for docs in source_groups.values())
    print(f"\n📊 Total: {len(sorted_sources)} sources, {total_docs} documents")

async def rebuild_metadata(source_groups: Dict[str, List], metadata_service):
    """Rebuild metadata entries for all source groups."""
    logger.info("🔨 Rebuilding metadata for all sources...")
    
    created_count = 0
    for source_url, docs in source_groups.items():
        if source_url == 'unknown':
            logger.warning(f"⚠️  Skipping {len(docs)} documents with unknown source")
            continue
        
        try:
            # Generate a new source ID
            source_id = str(uuid.uuid4())
            
            # Update all documents with the new source_id
            for doc in docs:
                if not doc.meta:
                    doc.meta = {}
                doc.meta['source_id'] = source_id
            
            # Update documents in the store
            document_store = metadata_service.document_store
            document_store.write_documents(docs)
            
            # Create metadata entry
            await metadata_service.store_source_metadata(
                source_id=source_id,
                title=source_url,  # Use URL as title
                source=source_url,
                content_type="text/html",
                chunk_count=len(docs),
                metadata={
                    "rebuilt_at": datetime.utcnow().isoformat(),
                    "original_source": source_url,
                    "fix_version": "v1.0"
                }
            )
            
            created_count += 1
            logger.info(f"✅ Created metadata for {source_url} ({len(docs)} docs)")
            
        except Exception as e:
            logger.error(f"❌ Failed to create metadata for {source_url}: {e}")
    
    logger.info(f"🎉 Successfully rebuilt metadata for {created_count} sources")

async def cleanup_orphaned_documents(document_store, all_docs):
    """Clean up all orphaned documents."""
    logger.warning("🗑️  This will DELETE ALL 384 documents!")
    
    confirm = input("Type 'DELETE ALL' to confirm: ").strip()
    if confirm != "DELETE ALL":
        logger.info("❌ Cleanup cancelled")
        return
    
    try:
        doc_ids = [doc.id for doc in all_docs]
        document_store.delete_documents(document_ids=doc_ids)
        logger.info(f"✅ Deleted {len(doc_ids)} documents")
        
        # Verify cleanup
        remaining = document_store.count_documents()
        logger.info(f"📊 Remaining documents: {remaining}")
        
    except Exception as e:
        logger.error(f"❌ Cleanup failed: {e}")

async def verify_fix():
    """Verify that the fix worked."""
    logger.info("🔍 Verifying fix...")
    
    try:
        from app.pipelines.manager import PipelineManager
        
        manager = PipelineManager()
        await manager.initialize()
        
        # Check counts
        total_docs = manager.document_store.count_documents()
        sources_data = await manager.document_store_service.list_sources(limit=1000)
        tracked_sources = len(sources_data.get('sources', []))
        
        print("\n" + "="*50)
        print("✅ VERIFICATION RESULTS")
        print("="*50)
        print(f"Total documents: {total_docs}")
        print(f"Tracked sources: {tracked_sources}")
        
        if tracked_sources > 0:
            print("\n📚 Sources:")
            for source in sources_data.get('sources', [])[:10]:
                title = source.get('title', 'Unknown')[:60]
                chunks = source.get('chunk_count', 0)
                print(f"  • {title}: {chunks} chunks")
        
        await manager.cleanup()
        
    except Exception as e:
        logger.error(f"❌ Verification failed: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Fix metadata mismatch in RAG system")
    parser.add_argument("--action", choices=["show", "rebuild", "cleanup"], default="show", 
                       help="Action to take: show sources, rebuild metadata, or cleanup documents")
    parser.add_argument("--verify", action="store_true", help="Verify fix results")
    args = parser.parse_args()
    
    if args.verify:
        asyncio.run(verify_fix())
    else:
        asyncio.run(fix_metadata_mismatch(args.action))