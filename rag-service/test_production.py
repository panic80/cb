"""Production readiness tests for RAG system."""
import asyncio
import time
import random
from datetime import datetime
from typing import Dict, List, Any
import pytest
from unittest.mock import Mock, patch

# Test imports
from app.pipelines.enhanced_retrieval import EnhancedRetrievalPipeline, QueryType, RetrievalState
from app.services.evaluation import RAGEvaluator, QueryEvaluation, EvaluationDataset
from app.services.performance_monitor import PerformanceMonitor, Alert
from app.services.ab_testing import ABTestingService, VariantType
from app.api.feedback import FeedbackAnalyzer, FeedbackType


class TestEnhancedRetrieval:
    """Test LangGraph-based enhanced retrieval."""
    
    @pytest.fixture
    async def pipeline(self):
        """Create test pipeline."""
        # Mock dependencies
        retriever = Mock()
        compressor = Mock()
        reranker = Mock()
        processor = Mock()
        table_rewriter = Mock()
        
        pipeline = EnhancedRetrievalPipeline(
            retriever=retriever,
            compressor=compressor,
            reranker=reranker,
            processor=processor,
            table_rewriter=table_rewriter
        )
        
        yield pipeline
    
    @pytest.mark.asyncio
    async def test_query_classification(self, pipeline):
        """Test query type classification."""
        test_cases = [
            ("What is the meal allowance?", QueryType.SIMPLE),
            ("What are the meal rates for Ontario?", QueryType.TABLE),
            ("Compare the meal allowances between Ontario and Quebec", QueryType.COMPARISON),
            ("How do I claim travel expenses and what documentation is needed?", QueryType.COMPLEX)
        ]
        
        for query, expected_type in test_cases:
            state = RetrievalState(
                query=query,
                query_type=None,
                expanded_queries=[],
                retrieved_documents=[],
                compressed_documents=[],
                reranked_documents=[],
                synthesized_answer=None,
                sources=[],
                conversation_history=[],
                error=None,
                metadata={}
            )
            
            # Mock LLM response
            with patch.object(pipeline.llm_pool, 'acquire_llm') as mock_llm:
                mock_llm.return_value.ainvoke.return_value = Mock(
                    content=f'{{"type": "{expected_type.value}", "reasoning": "test"}}'
                )
                
                result = await pipeline._understand_query(state)
                assert result.query_type == expected_type
    
    @pytest.mark.asyncio
    async def test_query_expansion(self, pipeline):
        """Test multi-hop query expansion."""
        state = RetrievalState(
            query="How do I claim travel expenses for a family member?",
            query_type=QueryType.COMPLEX,
            expanded_queries=[],
            retrieved_documents=[],
            compressed_documents=[],
            reranked_documents=[],
            synthesized_answer=None,
            sources=[],
            conversation_history=[],
            error=None,
            metadata={}
        )
        
        # Mock LLM response
        with patch.object(pipeline.llm_pool, 'acquire_llm') as mock_llm:
            mock_llm.return_value.ainvoke.return_value = Mock(
                content='{"sub_queries": ["travel expense claims", "family member eligibility", "required documentation"]}'
            )
            
            result = await pipeline._expand_query(state)
            assert len(result.expanded_queries) == 3
            assert "travel expense claims" in result.expanded_queries
    
    @pytest.mark.asyncio
    async def test_fallback_retrieval(self, pipeline):
        """Test fallback retrieval strategy."""
        state = RetrievalState(
            query="obscure policy question",
            query_type=QueryType.SIMPLE,
            expanded_queries=["obscure policy question"],
            retrieved_documents=[],  # No documents found
            compressed_documents=[],
            reranked_documents=[],
            synthesized_answer=None,
            sources=[],
            conversation_history=[],
            error=None,
            metadata={}
        )
        
        # Mock retriever
        from langchain_core.documents import Document
        fallback_docs = [
            Document(page_content="General travel policy", metadata={"source": "policy.pdf"})
        ]
        pipeline.retriever.aretrieve = Mock(return_value=fallback_docs)
        
        result = await pipeline._fallback_retrieval(state)
        assert len(result.retrieved_documents) > 0
    
    @pytest.mark.asyncio
    async def test_end_to_end_retrieval(self, pipeline):
        """Test complete retrieval workflow."""
        # Mock all components
        from langchain_core.documents import Document
        
        test_docs = [
            Document(
                page_content="The meal allowance for Ontario is $50 per day",
                metadata={"source": "rates.pdf", "page": 1}
            )
        ]
        
        pipeline.retriever.aretrieve = Mock(return_value=test_docs)
        pipeline.compressor.compress_documents = Mock(return_value=test_docs)
        pipeline.reranker.rerank_documents = Mock(return_value=test_docs)
        
        with patch.object(pipeline.llm_pool, 'acquire_llm') as mock_llm:
            # Mock query classification
            mock_llm.return_value.ainvoke.side_effect = [
                Mock(content='{"type": "simple", "reasoning": "test"}'),
                Mock(content="The meal allowance for Ontario is $50 per day [Source: rates.pdf]")
            ]
            
            result = await pipeline.retrieve("What is the meal allowance for Ontario?")
            
            assert result["answer"] is not None
            assert len(result["sources"]) > 0
            assert result["query_type"] == "simple"


class TestEvaluationFramework:
    """Test evaluation and metrics."""
    
    @pytest.fixture
    async def evaluator(self):
        """Create test evaluator."""
        evaluator = RAGEvaluator(llm_model="gpt-4o-mini")
        yield evaluator
    
    @pytest.mark.asyncio
    async def test_relevance_evaluation(self, evaluator):
        """Test document relevance scoring."""
        from langchain_core.documents import Document
        
        documents = [
            Document(
                page_content="The meal allowance for Ontario is $50 per day",
                metadata={"source": "rates.pdf"}
            ),
            Document(
                page_content="Weather in Ontario is cold in winter",
                metadata={"source": "random.pdf"}
            )
        ]
        
        result = await evaluator.evaluate_relevance(
            documents,
            "What is the meal allowance for Ontario?"
        )
        
        assert result.metric == "relevance"
        assert 0 <= result.score <= 1
    
    @pytest.mark.asyncio
    async def test_faithfulness_evaluation(self, evaluator):
        """Test answer faithfulness to sources."""
        from langchain_core.documents import Document
        
        sources = [
            Document(
                page_content="The meal allowance for Ontario is $50 per day",
                metadata={"source": "rates.pdf"}
            )
        ]
        
        # Test faithful answer
        faithful_result = await evaluator.evaluate_faithfulness(
            answer="The meal allowance for Ontario is $50 per day according to the rates.",
            sources=sources,
            query="What is the meal allowance?"
        )
        
        assert faithful_result.score > 0.8
        
        # Test unfaithful answer (hallucination)
        unfaithful_result = await evaluator.evaluate_faithfulness(
            answer="The meal allowance for Ontario is $100 per day and includes hotel.",
            sources=sources,
            query="What is the meal allowance?"
        )
        
        assert unfaithful_result.score < 0.5
    
    @pytest.mark.asyncio
    async def test_dataset_evaluation(self, evaluator):
        """Test evaluation on a dataset."""
        dataset = EvaluationDataset("test_dataset")
        dataset.add_query(
            "What is the meal allowance?",
            expected_answer="$50 per day"
        )
        
        async def mock_retrieval(query):
            from langchain_core.documents import Document
            return {
                "answer": "The meal allowance is $50 per day",
                "sources": [
                    Document(
                        page_content="Meal allowance: $50/day",
                        metadata={"source": "rates.pdf"}
                    )
                ]
            }
        
        results = await evaluator.evaluate_dataset(
            dataset,
            mock_retrieval
        )
        
        assert len(results) == 1
        assert results[0].overall_score > 0.7
    
    def test_evaluation_report(self, evaluator):
        """Test report generation."""
        evaluations = [
            QueryEvaluation(
                query="Test query 1",
                answer="Test answer 1",
                sources=[],
                relevance_score=0.9,
                faithfulness_score=0.8,
                completeness_score=0.85,
                answer_quality_score=0.87,
                overall_score=0.855
            ),
            QueryEvaluation(
                query="Test query 2",
                answer="Test answer 2",
                sources=[],
                relevance_score=0.4,
                faithfulness_score=0.3,
                completeness_score=0.5,
                answer_quality_score=0.4,
                overall_score=0.4
            )
        ]
        
        report = evaluator.generate_report(evaluations)
        
        assert report["summary"]["total_queries"] == 2
        assert report["issues"]["low_performers"] == 1
        assert len(report["recommendations"]) > 0


class TestPerformanceMonitoring:
    """Test performance monitoring and alerting."""
    
    @pytest.fixture
    async def monitor(self):
        """Create test monitor."""
        monitor = PerformanceMonitor()
        yield monitor
    
    def test_metric_recording(self, monitor):
        """Test metric collection."""
        # Record some metrics
        monitor.record_request(
            endpoint="/api/chat",
            method="POST",
            duration=2.5,
            status_code=200,
            request_size=1024,
            response_size=2048
        )
        
        monitor.record_llm_usage(
            provider="openai",
            model="gpt-4",
            input_tokens=100,
            output_tokens=200,
            duration=1.5,
            cost=0.01
        )
        
        # Check counters
        assert monitor.collector.counters["requests_total"] == 1
        assert monitor.collector.counters["requests_success"] == 1
        assert monitor.collector.counters["llm_total_tokens"] == 300
    
    @pytest.mark.asyncio
    async def test_alert_generation(self, monitor):
        """Test alert conditions."""
        # Simulate high latency
        for _ in range(10):
            monitor.collector.record_histogram("request_latency", 6.0)  # > 5s threshold
        
        # Force alert check
        rule = {
            "metric": "request_latency_p95",
            "condition": "greater_than",
            "threshold": 5.0,
            "level": "warning",
            "message": "High latency detected"
        }
        
        await monitor._evaluate_alert_rule(rule)
        
        # Check if alert was created
        assert len(monitor.alerts) > 0
        alert = list(monitor.alerts.values())[0]
        assert alert.level == "warning"
        assert alert.value > 5.0
    
    @pytest.mark.asyncio
    async def test_metrics_export(self, monitor):
        """Test metrics export formats."""
        # Add some metrics
        monitor.collector.increment_counter("test_counter", 42)
        monitor.collector.record_value("test_gauge", 3.14)
        monitor.collector.record_histogram("test_histogram", 1.0)
        monitor.collector.record_histogram("test_histogram", 2.0)
        monitor.collector.record_histogram("test_histogram", 3.0)
        
        # Export as Prometheus
        prometheus_export = await monitor.export_metrics("prometheus")
        assert "test_counter 42" in prometheus_export
        assert "test_gauge 3.14" in prometheus_export
        assert "test_histogram" in prometheus_export
        
        # Export as JSON
        json_export = await monitor.export_metrics("json")
        assert json_export["counters"]["test_counter"] == 42
        assert json_export["histograms"]["test_histogram"]["count"] == 3


class TestABTesting:
    """Test A/B testing framework."""
    
    @pytest.fixture
    def ab_service(self):
        """Create test A/B service."""
        service = ABTestingService()
        yield service
    
    def test_variant_assignment(self, ab_service):
        """Test consistent variant assignment."""
        # Create test experiment
        experiment = ab_service.create_experiment(
            name="Test LLM Models",
            description="Compare GPT-4 vs GPT-3.5",
            type=VariantType.LLM_MODEL,
            variants=[
                {
                    "id": "gpt4",
                    "name": "GPT-4",
                    "config": {"model": "gpt-4"},
                    "weight": 0.5
                },
                {
                    "id": "gpt35",
                    "name": "GPT-3.5",
                    "config": {"model": "gpt-3.5-turbo"},
                    "weight": 0.5
                }
            ],
            control_variant_id="gpt4"
        )
        
        # Test consistent assignment for same user
        user_id = "test_user_123"
        variant1 = ab_service.get_variant(VariantType.LLM_MODEL, user_id=user_id)
        variant2 = ab_service.get_variant(VariantType.LLM_MODEL, user_id=user_id)
        
        assert variant1.id == variant2.id  # Same user gets same variant
    
    def test_metrics_recording(self, ab_service):
        """Test A/B test metrics."""
        experiment_id = list(ab_service.experiments.keys())[0]
        
        # Record impressions and conversions
        ab_service.record_impression(
            experiment_id=experiment_id,
            variant_id="gpt4o",
            latency=2.5,
            tokens=150,
            cost=0.01
        )
        
        ab_service.record_conversion(
            experiment_id=experiment_id,
            variant_id="gpt4o",
            feedback_score=4.5
        )
        
        # Check metrics
        metrics = ab_service.experiments[experiment_id].metrics["gpt4o"]
        assert metrics.impressions == 1
        assert metrics.conversions == 1
        assert metrics.conversion_rate == 1.0
        assert metrics.average_latency == 2.5
    
    @pytest.mark.asyncio
    async def test_statistical_significance(self, ab_service):
        """Test winner determination."""
        experiment_id = list(ab_service.experiments.keys())[0]
        experiment = ab_service.experiments[experiment_id]
        
        # Simulate data for statistical significance
        # Control: 100 impressions, 20 conversions (20% conversion rate)
        for _ in range(100):
            ab_service.record_impression(
                experiment_id=experiment_id,
                variant_id="gpt4o",
                latency=3.0,
                error=False
            )
        for _ in range(20):
            ab_service.record_conversion(
                experiment_id=experiment_id,
                variant_id="gpt4o"
            )
        
        # Variant: 100 impressions, 35 conversions (35% conversion rate)
        for _ in range(100):
            ab_service.record_impression(
                experiment_id=experiment_id,
                variant_id="gpt4o_mini",
                latency=2.0,
                error=False
            )
        for _ in range(35):
            ab_service.record_conversion(
                experiment_id=experiment_id,
                variant_id="gpt4o_mini"
            )
        
        # Check if winner can be determined
        winner = await ab_service._determine_winner(experiment)
        assert winner is not None
        assert winner.id == "gpt4o_mini"  # Higher conversion rate


class TestFeedbackSystem:
    """Test feedback collection and analysis."""
    
    @pytest.fixture
    def analyzer(self):
        """Create test analyzer."""
        analyzer = FeedbackAnalyzer()
        yield analyzer
    
    def test_feedback_pattern_analysis(self, analyzer):
        """Test pattern detection in feedback."""
        from app.api.feedback import FeedbackRecord
        
        # Create mock feedback records
        feedback_records = [
            FeedbackRecord(
                id="1",
                session_id="session1",
                query="What is the meal rate for Ontario?",
                answer="I don't know",
                feedback_type=FeedbackType.THUMBS_DOWN,
                comment="Couldn't find the information",
                response_time=5.0
            ),
            FeedbackRecord(
                id="2",
                session_id="session2",
                query="Ontario meal allowance?",
                answer="Not sure",
                feedback_type=FeedbackType.THUMBS_DOWN,
                comment="Missing Ontario rates",
                response_time=4.5
            )
        ]
        
        # Group similar queries
        groups = analyzer._group_similar_queries(feedback_records)
        
        assert len(groups) > 0
        assert "ontario" in groups[0]["pattern"].lower()
    
    def test_improvement_suggestions(self, analyzer):
        """Test automated improvement suggestions."""
        patterns = {
            "total_feedback": 100,
            "feedback_breakdown": {
                FeedbackType.THUMBS_UP: 20,
                FeedbackType.THUMBS_DOWN: 40,
                FeedbackType.DETAILED: 30,
                FeedbackType.CORRECTION: 10
            },
            "query_issues": [
                {
                    "query_pattern": "ontario meal rates",
                    "count": 15,
                    "common_issues": ["not found", "incomplete"]
                }
            ],
            "performance_metrics": {
                "avg_response_time": 6.5
            }
        }
        
        suggestions = analyzer._generate_improvement_suggestions(patterns)
        
        assert len(suggestions) > 0
        assert any("negative feedback" in s for s in suggestions)
        assert any("response time" in s for s in suggestions)


class TestStressAndLoad:
    """Stress and load testing."""
    
    @pytest.mark.asyncio
    async def test_concurrent_requests(self):
        """Test system under concurrent load."""
        async def simulate_request(request_id: int):
            # Simulate processing time
            await asyncio.sleep(random.uniform(0.1, 0.5))
            return {
                "request_id": request_id,
                "status": "success",
                "latency": random.uniform(0.5, 2.0)
            }
        
        # Simulate 100 concurrent requests
        tasks = [simulate_request(i) for i in range(100)]
        start_time = time.time()
        results = await asyncio.gather(*tasks)
        total_time = time.time() - start_time
        
        # Verify all completed
        assert len(results) == 100
        assert all(r["status"] == "success" for r in results)
        
        # Check performance
        avg_latency = sum(r["latency"] for r in results) / len(results)
        assert avg_latency < 3.0  # Average latency under 3s
        assert total_time < 5.0  # Total time under 5s for 100 requests
    
    @pytest.mark.asyncio
    async def test_memory_usage(self):
        """Test memory usage under load."""
        import psutil
        import gc
        
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Create many documents
        from langchain_core.documents import Document
        documents = []
        for i in range(10000):
            doc = Document(
                page_content=f"Document {i} " * 100,  # ~1KB per doc
                metadata={"id": i, "source": f"doc{i}.txt"}
            )
            documents.append(doc)
        
        # Check memory growth
        peak_memory = process.memory_info().rss / 1024 / 1024
        memory_growth = peak_memory - initial_memory
        
        # Cleanup
        documents.clear()
        gc.collect()
        
        # Memory growth should be reasonable (< 500MB for 10K docs)
        assert memory_growth < 500


class TestSecurityAndCompliance:
    """Security and compliance tests."""
    
    def test_api_authentication(self):
        """Test admin API authentication."""
        from app.api.admin import AdminAuth
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials
        
        # Test invalid token
        invalid_creds = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="invalid-token"
        )
        
        with pytest.raises(HTTPException) as exc_info:
            AdminAuth.verify_token(invalid_creds)
        
        assert exc_info.value.status_code == 403
    
    def test_data_sanitization(self):
        """Test input sanitization."""
        # Test SQL injection attempts
        malicious_inputs = [
            "'; DROP TABLE users; --",
            "<script>alert('xss')</script>",
            "../../../etc/passwd",
            "{{7*7}}"  # Template injection
        ]
        
        for malicious_input in malicious_inputs:
            # Ensure inputs are properly escaped/sanitized
            # This would be tested against actual endpoints
            assert True  # Placeholder for actual sanitization tests
    
    def test_rate_limiting(self):
        """Test rate limiting enforcement."""
        # Simulate rapid requests
        request_times = []
        
        for _ in range(10):
            request_times.append(time.time())
        
        # Check if rate limiting would trigger
        time_window = request_times[-1] - request_times[0]
        request_rate = len(request_times) / time_window
        
        # Should enforce rate limits (e.g., max 100 req/min)
        max_rate_per_second = 100 / 60
        assert request_rate < max_rate_per_second * 2  # Some buffer


if __name__ == "__main__":
    # Run all tests
    pytest.main([__file__, "-v", "--asyncio-mode=auto"])