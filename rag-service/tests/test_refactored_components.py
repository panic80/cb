"""
Unit tests for refactored components to demonstrate the improved architecture.
"""

import pytest
from unittest.mock import Mock, patch
from app.processing.table_detection import StructuredContentDetector
from app.processing.query_classifier import QueryClassifier
from app.models.documents import create_source_metadata, SourceMetadata
from app.models.query import create_query_context


class TestTableDetection:
    """Test the extracted table detection functionality."""
    
    def setup_method(self):
        self.detector = StructuredContentDetector()
    
    def test_detects_simple_table(self):
        """Test detection of basic markdown table."""
        content = """
        | Column 1 | Column 2 |
        |----------|----------|
        | Value 1  | Value 2  |
        """
        assert self.detector.contains_table_content(content)
        assert self.detector.contains_structured_content(content)
    
    def test_identifies_hardship_allowance_table(self):
        """Test identification of specific table types."""
        content = """
        | Level | Hardship Allowance | Monthly Rate |
        |-------|-------------------|--------------|
        | 1     | Basic            | $500         |
        | 2     | Standard         | $750         |
        """
        assert self.detector.contains_table_content(content)
        table_type = self.detector.identify_table_type(content)
        assert table_type == "hardship_allowance"
    
    def test_counts_table_rows(self):
        """Test table row counting."""
        content = """
        | Header 1 | Header 2 |
        |----------|----------|
        | Row 1    | Data 1   |
        | Row 2    | Data 2   |
        | Row 3    | Data 3   |
        """
        row_count = self.detector.count_table_rows(content)
        assert row_count == 4  # Header + 3 data rows
    
    def test_detects_code_blocks(self):
        """Test detection of code blocks."""
        content = """
        Here's some Python code:
        
        ```python
        def hello():
            print("Hello, World!")
        ```
        """
        assert self.detector.contains_structured_content(content)
        boundaries = self.detector.identify_structured_boundaries(content)
        assert len(boundaries) == 1
        assert boundaries[0][2] == "code"


class TestQueryClassifier:
    """Test the extracted query classification functionality."""
    
    def setup_method(self):
        self.classifier = QueryClassifier()
    
    def test_classifies_table_query(self):
        """Test classification of table-related queries."""
        query = "What are the hardship allowance rates for level 3?"
        classification = self.classifier.classify(query)
        
        assert classification.query_type == "table_query"
        assert classification.confidence > 0.7
        assert "hardship allowance" in classification.detected_keywords
    
    def test_classifies_analytical_query(self):
        """Test classification of analytical queries."""
        query = "Why do hardship allowances vary by level?"
        classification = self.classifier.classify(query)
        
        assert classification.query_type == "analytical_query"
        assert classification.characteristics["requires_analysis"]
    
    def test_is_table_query_compatibility(self):
        """Test backward compatibility with simple boolean check."""
        table_query = "Show me the travel allowance rates"
        general_query = "How are you today?"
        
        assert self.classifier.is_table_query(table_query)
        assert not self.classifier.is_table_query(general_query)
    
    def test_pipeline_config_recommendations(self):
        """Test pipeline configuration recommendations."""
        table_query = "List all hardship allowance levels"
        config = self.classifier.get_recommended_pipeline_config(table_query)
        
        assert config["use_table_aware_pipeline"]
        assert config["use_enhanced_pipeline"]
        assert config["lower_similarity_threshold"]


class TestDocumentMetadata:
    """Test the standardized metadata models."""
    
    def test_creates_source_metadata(self):
        """Test creation of standardized source metadata."""
        metadata = create_source_metadata(
            source_id="test-123",
            source="test.pdf",
            content_type="application/pdf",
            title="Test Document"
        )
        
        assert isinstance(metadata, SourceMetadata)
        assert metadata.source_id == "test-123"
        assert metadata.source == "test.pdf"
        assert metadata.content_type == "application/pdf"
        assert metadata.indexed_at is not None
    
    def test_metadata_dict_conversion(self):
        """Test conversion to dictionary for Haystack compatibility."""
        metadata = create_source_metadata(
            source_id="test-123",
            source="test.pdf",
            content_type="application/pdf"
        )
        
        metadata_dict = metadata.dict(exclude_none=True)
        assert "source_id" in metadata_dict
        assert "source" in metadata_dict
        assert "content_type" in metadata_dict
        # None values should be excluded
        assert metadata_dict.get("title") is None or "title" not in metadata_dict


class TestQueryContext:
    """Test the query context model."""
    
    def test_creates_query_context(self):
        """Test creation of query context."""
        context = create_query_context(
            query="What are hardship allowance rates?",
            model="gpt-4o",
            retrieval_mode="hybrid"
        )
        
        assert context.query == "What are hardship allowance rates?"
        assert context.model == "gpt-4o"
        assert context.retrieval_mode == "hybrid"
    
    def test_applies_classification(self):
        """Test application of query classification to context."""
        from app.processing.query_classifier import QueryClassification
        
        context = create_query_context(
            query="Show me hardship allowance table",
            model="gpt-4o"
        )
        
        # Mock classification
        classification = QueryClassification(
            query_type="table_query",
            confidence=0.9,
            detected_keywords={"hardship allowance", "table"},
            characteristics={"requires_tables": True, "is_specific_lookup": True}
        )
        
        context.apply_classification(classification)
        
        assert context.use_table_aware_pipeline
        assert context.use_enhanced_pipeline
        assert context.lower_similarity_threshold
        assert context.enable_source_filtering
    
    def test_pipeline_inputs_generation(self):
        """Test generation of pipeline inputs."""
        context = create_query_context(
            query="Test query",
            conversation_history=[{"role": "user", "content": "Previous message"}]
        )
        
        inputs = context.get_pipeline_inputs()
        
        assert "prompt_builder" in inputs
        assert inputs["prompt_builder"]["question"] == "Test query"
        assert len(inputs["prompt_builder"]["conversation_history"]) == 1


# Integration test
class TestRefactoredIntegration:
    """Test integration between refactored components."""
    
    def test_end_to_end_table_query_processing(self):
        """Test complete processing flow for a table query."""
        # Step 1: Classify query
        classifier = QueryClassifier()
        query = "What are the level 4 hardship allowance rates?"
        classification = classifier.classify(query)
        
        # Step 2: Create context
        context = create_query_context(query=query)
        context.apply_classification(classification)
        
        # Step 3: Verify correct pipeline configuration
        config = context.get_pipeline_config()
        assert config["use_table_aware_pipeline"]
        assert config["use_enhanced_pipeline"]
        
        # Step 4: Test table detection
        detector = StructuredContentDetector()
        table_content = """
        | Level | Monthly Rate |
        |-------|-------------|
        | 4     | $1000       |
        """
        assert detector.contains_table_content(table_content)
        assert detector.identify_table_type(table_content) == "rates_table"


if __name__ == "__main__":
    pytest.main([__file__])