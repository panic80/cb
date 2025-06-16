#!/usr/bin/env python3
"""
Clean start: Delete all orphaned documents from the RAG system.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent / "app"))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def clean_start():
    """Perform a clean start by deleting all documents and resetting counters."""
    try:
        logger.info("🧹 Starting clean reset of RAG system...")
        
        # Import and initialize the pipeline manager
        from app.pipelines.manager import PipelineManager
        
        # Initialize pipeline manager
        manager = PipelineManager()
        await manager.initialize()
        
        document_store = manager.document_store
        metadata_service = manager.document_store_service
        
        # Get current counts
        total_docs_before = document_store.count_documents()
        sources_data = await metadata_service.list_sources(limit=1000)
        tracked_sources_before = len(sources_data.get('sources', []))
        
        logger.info(f"📊 Current state:")
        logger.info(f"   Documents in vector store: {total_docs_before}")
        logger.info(f"   Tracked sources: {tracked_sources_before}")
        
        # 1. Delete all documents from vector store
        if total_docs_before > 0:
            logger.info(f"🗑️  Deleting {total_docs_before} documents from vector store...")
            
            # Get all document IDs
            all_docs = document_store.filter_documents()
            doc_ids = [doc.id for doc in all_docs]
            
            # Delete in batches to avoid memory issues
            batch_size = 100
            deleted_count = 0
            
            for i in range(0, len(doc_ids), batch_size):
                batch = doc_ids[i:i + batch_size]
                try:
                    document_store.delete_documents(document_ids=batch)
                    deleted_count += len(batch)
                    logger.info(f"   Deleted batch: {deleted_count}/{len(doc_ids)} documents")
                except Exception as e:
                    logger.error(f"   Error deleting batch {i//batch_size + 1}: {e}")
            
            logger.info(f"✅ Deleted {deleted_count} documents from vector store")
        else:
            logger.info("✅ Vector store is already empty")
        
        # 2. Clear all source metadata
        if tracked_sources_before > 0:
            logger.info(f"🗑️  Clearing {tracked_sources_before} source metadata entries...")
            
            # Get all sources and delete them
            for source in sources_data.get('sources', []):
                source_id = source.get('source_id')
                if source_id:
                    try:
                        await metadata_service.delete_source(source_id)
                        logger.debug(f"   Deleted source metadata: {source_id}")
                    except Exception as e:
                        logger.error(f"   Error deleting source {source_id}: {e}")
            
            logger.info("✅ Cleared all source metadata")
        else:
            logger.info("✅ Source metadata is already empty")
        
        # 3. Verify clean state
        total_docs_after = document_store.count_documents()
        sources_data_after = await metadata_service.list_sources(limit=1000)
        tracked_sources_after = len(sources_data_after.get('sources', []))
        
        logger.info(f"🔍 Final verification:")
        logger.info(f"   Documents in vector store: {total_docs_after}")
        logger.info(f"   Tracked sources: {tracked_sources_after}")
        
        # Print summary
        print("\n" + "="*60)
        print("🧹 CLEAN START COMPLETE")
        print("="*60)
        print(f"✅ Deleted {total_docs_before} documents")
        print(f"✅ Cleared {tracked_sources_before} source metadata entries")
        print(f"✅ Vector store now has {total_docs_after} documents")
        print(f"✅ Metadata store now has {tracked_sources_after} sources")
        
        if total_docs_after == 0 and tracked_sources_after == 0:
            print("\n🎉 System successfully reset to clean state!")
            print("💡 You can now start fresh with URL ingestion")
        else:
            print(f"\n⚠️  Warning: System not completely clean")
            print(f"   Remaining documents: {total_docs_after}")
            print(f"   Remaining sources: {tracked_sources_after}")
        
        print("="*60)
        
        await manager.cleanup()
        
    except Exception as e:
        logger.error(f"❌ Clean start failed: {e}", exc_info=True)
        return False
    
    return True

async def verify_clean_state():
    """Verify the system is in a clean state."""
    try:
        logger.info("🔍 Verifying clean state...")
        
        from app.pipelines.manager import PipelineManager
        
        manager = PipelineManager()
        await manager.initialize()
        
        # Check counts
        total_docs = manager.document_store.count_documents()
        sources_data = await manager.document_store_service.list_sources(limit=1000)
        tracked_sources = len(sources_data.get('sources', []))
        
        print("\n📊 CURRENT SYSTEM STATE:")
        print(f"   Total documents: {total_docs}")
        print(f"   Tracked sources: {tracked_sources}")
        
        if total_docs == 0 and tracked_sources == 0:
            print("✅ System is in clean state")
        else:
            print("⚠️  System is not clean")
        
        await manager.cleanup()
        
    except Exception as e:
        logger.error(f"❌ Verification failed: {e}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Clean start the RAG system")
    parser.add_argument("--verify", action="store_true", help="Only verify current state")
    parser.add_argument("--force", action="store_true", help="Force cleanup without confirmation")
    args = parser.parse_args()
    
    if args.verify:
        asyncio.run(verify_clean_state())
    elif args.force:
        asyncio.run(clean_start())
    else:
        print("⚠️  This will DELETE ALL documents and sources!")
        print("Use --force to proceed or --verify to check current state")