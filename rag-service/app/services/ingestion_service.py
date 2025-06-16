import logging
import base64
import tempfile
import time
import uuid
from pathlib import Path
from typing import Dict, Any

from app.models.schemas import URLIngestRequest, FileIngestRequest
from app.pipelines.manager import PipelineManager
from app.services.metrics import metrics_service, MetricsContext
from app.utils.file_utils import save_uploaded_file_streaming, calculate_file_hash, calculate_content_hash

logger = logging.getLogger(__name__)

class JobStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

_ingestion_jobs: Dict[str, Dict[str, Any]] = {}

class IngestionService:
    def __init__(self, pipeline_manager: PipelineManager):
        self.pipeline_manager = pipeline_manager

    def create_job(self, job_type: str, details: Dict) -> str:
        job_id = str(uuid.uuid4())
        _ingestion_jobs[job_id] = {
            "id": job_id,
            "status": JobStatus.PENDING,
            "created_at": time.time(),
            **details
        }
        return job_id

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        return _ingestion_jobs.get(job_id)

    async def process_url_ingestion(self, job_id: str, request: URLIngestRequest):
        with MetricsContext("ingestion_duration", {"type": "url"}):
            try:
                logger.info(f"Processing URL ingestion job {job_id}: {request.url}")
                _ingestion_jobs[job_id]["status"] = JobStatus.PROCESSING
                metrics_service.increment_counter("ingestion_jobs_total", tags={"type": "url"})
                
                result = await self.pipeline_manager.index_url(
                    url=request.url,
                    metadata=request.metadata,
                    enable_crawling=request.enable_crawling,
                    max_depth=request.max_depth,
                    max_pages=request.max_pages,
                    follow_external_links=request.follow_external_links
                )
                
                _ingestion_jobs[job_id].update({
                    "status": JobStatus.COMPLETED,
                    "result": {"document_id": result["document_id"], "chunk_count": result["chunk_count"]}
                })
                metrics_service.increment_counter("ingestion_jobs_success", tags={"type": "url"})
                metrics_service.increment_counter("documents_total", value=result["chunk_count"])
            except Exception as e:
                logger.error(f"URL ingestion job {job_id} failed: {e}", exc_info=True)
                _ingestion_jobs[job_id].update({"status": JobStatus.FAILED, "error": str(e)})
                metrics_service.increment_counter("ingestion_jobs_failed", tags={"type": "url"})
                metrics_service.record_error("url_ingestion_error", str(e), {"job_id": job_id})

    async def process_file_ingestion(self, job_id: str, request: FileIngestRequest, content_hash: str):
        tmp_path = None
        try:
            logger.info(f"Processing file ingestion job {job_id}: {request.filename}")
            _ingestion_jobs[job_id]["status"] = JobStatus.PROCESSING
            
            file_content = base64.b64decode(request.content)
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(request.filename).suffix) as tmp_file:
                tmp_file.write(file_content)
                tmp_path = tmp_file.name
            
            metadata = dict(request.metadata) if request.metadata else {}
            metadata["content_hash"] = content_hash
            
            result = await self.pipeline_manager.index_file(
                file_path=tmp_path,
                filename=request.filename,
                content_type=request.content_type,
                metadata=metadata
            )
            
            _ingestion_jobs[job_id].update({
                "status": JobStatus.COMPLETED,
                "result": {"document_id": result["document_id"], "chunk_count": result["chunk_count"]}
            })
        except Exception as e:
            logger.error(f"File ingestion job {job_id} failed: {e}", exc_info=True)
            _ingestion_jobs[job_id].update({"status": JobStatus.FAILED, "error": str(e)})
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    async def process_file_upload_ingestion(self, job_id: str, file_path: str, filename: str, content_type: str, file_hash: str):
        with MetricsContext("ingestion_duration", {"type": "file_upload"}):
            try:
                logger.info(f"Processing file upload ingestion job {job_id}: {filename}")
                _ingestion_jobs[job_id]["status"] = JobStatus.PROCESSING
                metrics_service.increment_counter("ingestion_jobs_total", tags={"type": "file_upload"})
                
                result = await self.pipeline_manager.index_file(
                    file_path=file_path,
                    filename=filename,
                    content_type=content_type,
                    metadata={"source": "direct_upload", "content_hash": file_hash}
                )
                
                _ingestion_jobs[job_id].update({
                    "status": JobStatus.COMPLETED,
                    "result": {"document_id": result["document_id"], "chunk_count": result["chunk_count"]}
                })
                metrics_service.increment_counter("ingestion_jobs_success", tags={"type": "file_upload"})
                metrics_service.increment_counter("documents_total", value=result["chunk_count"])
            except Exception as e:
                logger.error(f"File upload ingestion job {job_id} failed: {e}", exc_info=True)
                _ingestion_jobs[job_id].update({"status": JobStatus.FAILED, "error": str(e)})
                metrics_service.increment_counter("ingestion_jobs_failed", tags={"type": "file_upload"})
                metrics_service.record_error("file_ingestion_error", str(e), {"job_id": job_id})
            finally:
                Path(file_path).unlink(missing_ok=True)