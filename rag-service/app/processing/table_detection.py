"""Table and structured content detection utilities."""

import re
import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)


class StructuredContentDetector:
    """Detects boundaries of structured content like tables and code blocks."""
    
    def __init__(self):
        # Enhanced regex patterns for detecting Markdown tables
        self.table_start_pattern = re.compile(r'^\s*\|.*\|.*$', re.MULTILINE)
        self.table_separator_pattern = re.compile(r'^\s*\|[\s\-\|:]*\|.*$', re.MULTILINE)
        self.table_header_pattern = re.compile(r'^\s*\|.*\|\s*$', re.MULTILINE)
        
        # Enhanced table detection patterns
        self.table_content_indicators = [
            r'\|\s*[^|]+\s*\|',  # Basic table cell pattern
            r'\$\d+',  # Monetary amounts
            r'Level\s*\|',  # Level indicators
            r'Rate\s*\|',  # Rate indicators
            r'Amount\s*\|',  # Amount indicators
            r'Description\s*\|'  # Description indicators
        ]
        
        # Regex patterns for detecting code blocks
        self.code_block_pattern = re.compile(r'```[\s\S]*?```', re.MULTILINE)
        self.inline_code_pattern = re.compile(r'`[^`]+`')
    
    def contains_structured_content(self, content: str) -> bool:
        """Check if content contains tables, code blocks, or other structured content."""
        # Check for tables
        lines = content.split('\n')
        table_lines = 0
        
        for line in lines:
            if self.table_start_pattern.match(line):
                table_lines += 1
                if table_lines >= 2:  # At least header + one row
                    return True
        
        # Check for code blocks
        if self.code_block_pattern.search(content):
            return True
        
        return False
    
    def identify_structured_boundaries(self, content: str) -> List[Tuple[int, int, str]]:
        """
        Identify start and end line numbers of all structured content.
        
        Returns:
            List of tuples (start_line, end_line, content_type)
        """
        lines = content.split('\n')
        boundaries = []
        
        # Find tables
        in_table = False
        table_start = None
        
        for i, line in enumerate(lines):
            is_table_line = self.table_start_pattern.match(line)
            is_separator = self.table_separator_pattern.match(line)
            
            if is_table_line and not in_table:
                # Start of a new table
                table_start = i
                in_table = True
            elif in_table and not is_table_line and not is_separator:
                # End of current table
                if table_start is not None:
                    boundaries.append((table_start, i - 1, 'table'))
                in_table = False
                table_start = None
        
        # Handle table that goes to end of content
        if in_table and table_start is not None:
            boundaries.append((table_start, len(lines) - 1, 'table'))
        
        # Find code blocks
        full_content = '\n'.join(lines)
        for match in self.code_block_pattern.finditer(full_content):
            start_pos = match.start()
            end_pos = match.end()
            
            # Convert positions to line numbers
            start_line = full_content[:start_pos].count('\n')
            end_line = full_content[:end_pos].count('\n')
            
            boundaries.append((start_line, end_line, 'code'))
        
        # Sort boundaries by start line
        boundaries.sort(key=lambda x: x[0])
        
        return boundaries
    
    def find_structured_at_line(self, line_num: int, structured_boundaries: List[Tuple[int, int, str]]) -> Optional[Tuple[int, int, str]]:
        """Find if given line number is the start of structured content."""
        for start, end, content_type in structured_boundaries:
            if line_num == start:
                return (start, end, content_type)
        return None
    
    def contains_table_content(self, content: str) -> bool:
        """Enhanced check if content contains table structures."""
        # Check for basic table structure
        if content.count('|') < 4:  # Need at least 4 pipes for a minimal table
            return False
        
        # Check for table patterns
        lines = content.split('\n')
        table_lines = 0
        
        for line in lines:
            if self.table_start_pattern.match(line):
                table_lines += 1
                if table_lines >= 2:  # Header + at least one data row
                    return True
        
        # Check for table content indicators
        for pattern in self.table_content_indicators:
            if re.search(pattern, content):
                return True
        
        return False
    
    def identify_table_type(self, content: str) -> str:
        """Identify the type of table based on content patterns."""
        content_lower = content.lower()
        
        # Check for specific table types
        if any(term in content_lower for term in ['hardship', 'allowance']):
            if 'level' in content_lower:
                return 'hardship_allowance'
            return 'allowance'
        
        if any(term in content_lower for term in ['travel', 'accommodation', 'meal']):
            return 'travel_allowance'
        
        if any(term in content_lower for term in ['rate', 'amount', 'cost']):
            return 'rates_table'
        
        if any(term in content_lower for term in ['schedule', 'time']):
            return 'schedule_table'
        
        return 'general_table'
    
    def count_table_rows(self, content: str) -> int:
        """Count the number of table rows in content."""
        lines = content.split('\n')
        row_count = 0
        
        for line in lines:
            if self.table_start_pattern.match(line):
                # Skip separator lines
                if not self.table_separator_pattern.match(line):
                    row_count += 1
        
        return row_count
    
    def get_table_context_boundaries(self, table_start: int, table_end: int, lines: List[str], struct_type: str) -> Tuple[int, int]:
        """Get expanded boundaries that include table context (title, description)."""
        if struct_type != 'table':
            return table_start, table_end
        
        context_start = table_start
        context_end = table_end
        
        # Look backwards for table title/heading (up to 3 lines)
        for i in range(max(0, table_start - 3), table_start):
            line = lines[i].strip()
            if line and (
                line.startswith('#') or  # Markdown heading
                'table' in line.lower() or
                'allowance' in line.lower() or
                'rate' in line.lower() or
                'schedule' in line.lower()
            ):
                context_start = i
                break
        
        # Look forward for table description/notes (up to 2 lines)
        for i in range(table_end + 1, min(len(lines), table_end + 3)):
            line = lines[i].strip()
            if line and not line.startswith('|') and (
                'note' in line.lower() or
                'effective' in line.lower() or
                'subject to' in line.lower() or
                'rates are' in line.lower()
            ):
                context_end = i
            else:
                break
        
        return context_start, context_end


def create_table_detector() -> StructuredContentDetector:
    """Factory function to create a configured table detector."""
    return StructuredContentDetector()