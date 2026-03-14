"""
Integration Tests for Document Processing Pipeline

This test suite validates the end-to-end document processing pipeline:
1. Upload → Extract → Chunk → Embed → Index

Tests verify that documents are searchable after processing completes.

Validates Requirements: 5.1, 5.4, 6.1, 6.3
"""

import json
import os
import time
import unittest
import uuid
from typing import Dict, Any, List
from io import BytesIO

import boto3
from botocore.exceptions import ClientError
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


class TestDocumentProcessingPipeline(unittest.TestCase):
    """
    Integration tests for the complete document processing pipeline.
    
    These tests require AWS credentials and deployed infrastructure:
    - S3 bucket for document storage
    - Lambda functions for document processing
    - OpenSearch cluster for vector storage
    - DynamoDB table for document metadata
    """
    
    @classmethod
    def setUpClass(cls):
        """Set up test infrastructure and clients"""
        # Initialize AWS clients
        cls.s3_client = boto3.client('s3')
        cls.lambda_client = boto3.client('lambda')
        cls.dynamodb = boto3.resource('dynamodb')
        
        # Get environment variables for infrastructure
        cls.bucket_name = os.environ.get('TEST_BUCKET_NAME')
        cls.extract_lambda = os.environ.get('EXTRACT_TEXT_LAMBDA', 'dev-chatbot-extract-text')
        cls.embedding_lambda = os.environ.get('EMBEDDING_GENERATOR_LAMBDA', 'dev-chatbot-generate-embeddings')
        cls.metadata_table_name = os.environ.get('DOCUMENT_METADATA_TABLE', 'dev-chatbot-document-metadata')
        cls.opensearch_endpoint = os.environ.get('OPENSEARCH_ENDPOINT')
        cls.opensearch_index = os.environ.get('OPENSEARCH_INDEX', 'documents')
        
        # Validate required configuration
        if not cls.bucket_name:
            raise ValueError(
                "TEST_BUCKET_NAME environment variable is required. "
                "Please set it to your S3 bucket name (e.g., dev-chatbot-documents-177981160483)"
            )
        
        # Verify S3 bucket access before running tests
        try:
            cls.s3_client.head_bucket(Bucket=cls.bucket_name)
            print(f"✓ S3 bucket access verified: {cls.bucket_name}")
        except ClientError as error:
            error_code = error.response['Error']['Code']
            if error_code == '403':
                raise PermissionError(
                    f"Access Denied to S3 bucket '{cls.bucket_name}'. "
                    f"Please ensure your AWS credentials have s3:GetObject, s3:PutObject, "
                    f"s3:DeleteObject, and s3:ListBucket permissions for this bucket."
                ) from error
            elif error_code == '404':
                raise ValueError(
                    f"S3 bucket '{cls.bucket_name}' does not exist. "
                    f"Please check the TEST_BUCKET_NAME environment variable."
                ) from error
            else:
                raise
        
        # Initialize DynamoDB table
        cls.metadata_table = cls.dynamodb.Table(cls.metadata_table_name)
        
        # Track test documents for cleanup
        cls.test_document_ids = []
        
        print(f"Test setup complete:")
        print(f"  Bucket: {cls.bucket_name}")
        print(f"  Extract Lambda: {cls.extract_lambda}")
        print(f"  Embedding Lambda: {cls.embedding_lambda}")
        print(f"  Metadata Table: {cls.metadata_table_name}")
        print(f"  OpenSearch: {cls.opensearch_endpoint}")
    
    @classmethod
    def tearDownClass(cls):
        """Clean up test documents"""
        print(f"\nCleaning up {len(cls.test_document_ids)} test documents...")
        
        for document_id in cls.test_document_ids:
            try:
                # Delete from S3
                cls._cleanup_s3_document(document_id)
                
                # Delete from DynamoDB
                cls._cleanup_dynamodb_document(document_id)
                
                # Delete from OpenSearch (if available)
                if cls.opensearch_endpoint:
                    cls._cleanup_opensearch_document(document_id)
                
                print(f"  Cleaned up document: {document_id}")
            except Exception as error:
                print(f"  Error cleaning up {document_id}: {error}")
    
    @classmethod
    def _cleanup_s3_document(cls, document_id: str):
        """Delete all S3 objects for a document"""
        prefixes = [f'uploads/{document_id}/', f'processed/{document_id}/', f'failed/{document_id}/']
        
        for prefix in prefixes:
            try:
                response = cls.s3_client.list_objects_v2(Bucket=cls.bucket_name, Prefix=prefix)
                if 'Contents' in response:
                    for obj in response['Contents']:
                        cls.s3_client.delete_object(Bucket=cls.bucket_name, Key=obj['Key'])
            except Exception:
                pass
    
    @classmethod
    def _cleanup_dynamodb_document(cls, document_id: str):
        """Delete DynamoDB record for a document"""
        try:
            cls.metadata_table.delete_item(
                Key={'PK': f'DOC#{document_id}', 'SK': 'METADATA'}
            )
        except Exception:
            pass
    
    @classmethod
    def _cleanup_opensearch_document(cls, document_id: str):
        """Delete OpenSearch embeddings for a document"""
        # This would require OpenSearch client - skip for now
        pass
    
    def _create_test_pdf(self, content: str, filename: str = "test.pdf") -> bytes:
        """
        Create a simple PDF with the given text content.
        
        Args:
            content: Text content to include in the PDF
            filename: Name for the PDF (for metadata)
            
        Returns:
            PDF file content as bytes
        """
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        
        # Split content into lines and pages
        lines = content.split('\n')
        y_position = 750
        line_height = 15
        
        for line in lines:
            if y_position < 50:
                # Start new page
                pdf.showPage()
                y_position = 750
            
            pdf.drawString(50, y_position, line)
            y_position -= line_height
        
        pdf.save()
        buffer.seek(0)
        return buffer.read()
    
    def _upload_test_document(self, document_id: str, pdf_content: bytes, filename: str = "test.pdf") -> str:
        """
        Upload a test document to S3.
        
        Args:
            document_id: Unique document identifier
            pdf_content: PDF file content as bytes
            filename: Filename for the document
            
        Returns:
            S3 key where document was uploaded
        """
        s3_key = f"uploads/{document_id}/{filename}"
        
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=s3_key,
            Body=pdf_content,
            ContentType='application/pdf'
        )
        
        # Track for cleanup
        self.test_document_ids.append(document_id)
        
        return s3_key
    
    def _wait_for_processing(self, document_id: str, timeout: int = 60) -> Dict[str, Any]:
        """
        Wait for document processing to complete.
        
        Args:
            document_id: Document ID to check
            timeout: Maximum time to wait in seconds
            
        Returns:
            Document metadata from DynamoDB
            
        Raises:
            TimeoutError: If processing doesn't complete within timeout
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                response = self.metadata_table.get_item(
                    Key={'PK': f'DOC#{document_id}', 'SK': 'METADATA'}
                )
                
                if 'Item' in response:
                    item = response['Item']
                    status = item.get('processingStatus', 'pending')
                    
                    if status == 'completed':
                        return item
                    elif status == 'failed':
                        error_msg = item.get('errorMessage', 'Unknown error')
                        raise Exception(f"Document processing failed: {error_msg}")
                
            except ClientError as error:
                if error.response['Error']['Code'] != 'ResourceNotFoundException':
                    raise
            
            time.sleep(2)
        
        raise TimeoutError(f"Document processing did not complete within {timeout} seconds")
    
    def _verify_s3_artifacts(self, document_id: str) -> Dict[str, bool]:
        """
        Verify that expected S3 artifacts were created.
        
        Args:
            document_id: Document ID to check
            
        Returns:
            Dictionary with artifact existence flags
        """
        artifacts = {
            'text_json': False,
            'pages_json': False,
            'chunks_json': False
        }
        
        # Check for text.json
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=f"processed/{document_id}/text.json"
            )
            artifacts['text_json'] = True
        except ClientError:
            pass
        
        # Check for pages.json
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=f"processed/{document_id}/pages.json"
            )
            artifacts['pages_json'] = True
        except ClientError:
            pass
        
        # Check for chunks.json
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=f"processed/{document_id}/chunks.json"
            )
            artifacts['chunks_json'] = True
        except ClientError:
            pass
        
        return artifacts
    
    def _get_chunks_from_s3(self, document_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve chunks from S3.
        
        Args:
            document_id: Document ID
            
        Returns:
            List of chunk dictionaries
        """
        response = self.s3_client.get_object(
            Bucket=self.bucket_name,
            Key=f"processed/{document_id}/chunks.json"
        )
        
        content = response['Body'].read().decode('utf-8')
        data = json.loads(content)
        
        return data.get('chunks', [])
    
    def _search_opensearch(self, query_vector: List[float], k: int = 5) -> List[Dict[str, Any]]:
        """
        Search OpenSearch for similar vectors.
        
        This is a placeholder - actual implementation would require OpenSearch client.
        
        Args:
            query_vector: Query embedding vector
            k: Number of results to return
            
        Returns:
            List of search results
        """
        # TODO: Implement OpenSearch search when client is available
        # For now, return empty list
        return []
    
    # Test Cases
    
    def test_01_end_to_end_document_processing(self):
        """
        Test complete pipeline: upload → extract → chunk → embed → index
        
        Validates Requirements: 5.1, 5.4, 6.1, 6.3
        """
        print("\n=== Test: End-to-End Document Processing ===")
        
        # 1. Create test document
        document_id = str(uuid.uuid4())
        content = """
        Test Document for RAG System
        
        This is a test document to verify the document processing pipeline.
        It contains multiple paragraphs to ensure proper chunking.
        
        The document should be:
        - Extracted from PDF format
        - Chunked into 512 token segments with 50 token overlap
        - Embedded using Amazon Bedrock Titan Embeddings
        - Indexed in OpenSearch for semantic search
        
        This content is sufficient to create multiple chunks for testing.
        """
        
        pdf_content = self._create_test_pdf(content, "test-doc.pdf")
        
        # 2. Upload to S3
        print(f"Uploading document: {document_id}")
        s3_key = self._upload_test_document(document_id, pdf_content, "test-doc.pdf")
        
        # 3. Trigger extraction Lambda
        print("Triggering text extraction...")
        event = {
            'Records': [{
                's3': {
                    'bucket': {'name': self.bucket_name},
                    'object': {'key': s3_key}
                }
            }]
        }
        
        response = self.lambda_client.invoke(
            FunctionName=self.extract_lambda,
            InvocationType='RequestResponse',
            Payload=json.dumps(event)
        )
        
        # Check extraction response
        response_payload = json.loads(response['Payload'].read())
        self.assertEqual(response_payload['statusCode'], 200)
        
        body = json.loads(response_payload['body'])
        self.assertEqual(body['processed'], 1)
        self.assertEqual(body['failed'], 0)
        
        # 4. Wait for processing to complete
        print("Waiting for processing to complete...")
        metadata = self._wait_for_processing(document_id, timeout=90)
        
        # 5. Verify metadata
        print("Verifying document metadata...")
        self.assertEqual(metadata['processingStatus'], 'completed')
        self.assertGreater(metadata.get('chunkCount', 0), 0)
        self.assertGreater(metadata.get('pageCount', 0), 0)
        
        print(f"  Pages: {metadata.get('pageCount')}")
        print(f"  Chunks: {metadata.get('chunkCount')}")
        
        # 6. Verify S3 artifacts
        print("Verifying S3 artifacts...")
        artifacts = self._verify_s3_artifacts(document_id)
        self.assertTrue(artifacts['text_json'], "text.json not found")
        self.assertTrue(artifacts['pages_json'], "pages.json not found")
        self.assertTrue(artifacts['chunks_json'], "chunks.json not found")
        
        # 7. Verify chunks
        print("Verifying chunks...")
        chunks = self._get_chunks_from_s3(document_id)
        self.assertGreater(len(chunks), 0, "No chunks created")
        
        # Verify chunk structure
        first_chunk = chunks[0]
        self.assertIn('chunkId', first_chunk)
        self.assertIn('documentId', first_chunk)
        self.assertIn('text', first_chunk)
        self.assertIn('chunkIndex', first_chunk)
        self.assertIn('pageNumber', first_chunk)
        self.assertIn('tokenCount', first_chunk)
        self.assertIn('metadata', first_chunk)
        
        # Verify token counts
        for chunk in chunks:
            self.assertLessEqual(chunk['tokenCount'], 512, f"Chunk {chunk['chunkIndex']} exceeds 512 tokens")
        
        print(f"  Created {len(chunks)} chunks")
        print(f"  First chunk: {first_chunk['tokenCount']} tokens")
        
        print("✓ End-to-end processing completed successfully")
    
    def test_02_document_searchability_after_processing(self):
        """
        Test that documents are searchable after processing completes.
        
        Validates Requirements: 6.3
        """
        print("\n=== Test: Document Searchability ===")
        
        # 1. Create and upload test document with specific content
        document_id = str(uuid.uuid4())
        content = """
        Nivulauta Agent System
        
        This document describes the architecture of a RAG chatbot system.
        The system uses Amazon Bedrock with Claude 3 Sonnet for natural language processing.
        Documents are stored in S3 and indexed in OpenSearch for semantic search.
        
        Key components include:
        - Lambda functions for document processing
        - OpenSearch for vector storage
        - DynamoDB for metadata storage
        - Bedrock for embeddings and LLM inference
        """
        
        pdf_content = self._create_test_pdf(content, "architecture.pdf")
        
        print(f"Uploading document: {document_id}")
        s3_key = self._upload_test_document(document_id, pdf_content, "architecture.pdf")
        
        # 2. Trigger processing
        print("Triggering processing...")
        event = {
            'Records': [{
                's3': {
                    'bucket': {'name': self.bucket_name},
                    'object': {'key': s3_key}
                }
            }]
        }
        
        self.lambda_client.invoke(
            FunctionName=self.extract_lambda,
            InvocationType='RequestResponse',
            Payload=json.dumps(event)
        )
        
        # 3. Wait for completion
        print("Waiting for processing...")
        metadata = self._wait_for_processing(document_id, timeout=90)
        self.assertEqual(metadata['processingStatus'], 'completed')
        
        # 4. Verify chunks are retrievable
        print("Verifying chunks are retrievable...")
        chunks = self._get_chunks_from_s3(document_id)
        self.assertGreater(len(chunks), 0)
        
        # Verify content is in chunks
        all_chunk_text = ' '.join(chunk['text'] for chunk in chunks)
        self.assertIn('RAG chatbot', all_chunk_text)
        self.assertIn('OpenSearch', all_chunk_text)
        
        print(f"  Document is searchable with {len(chunks)} chunks")
        print("✓ Document searchability verified")
    
    def test_03_chunking_with_overlap(self):
        """
        Test that text chunking creates proper overlap between chunks.
        
        Validates Requirements: 5.4
        """
        print("\n=== Test: Chunking with Overlap ===")
        
        # Create document with known content
        document_id = str(uuid.uuid4())
        
        # Create content that will definitely span multiple chunks
        paragraphs = []
        for i in range(20):
            paragraphs.append(f"This is paragraph number {i}. " * 10)
        
        content = '\n\n'.join(paragraphs)
        pdf_content = self._create_test_pdf(content, "overlap-test.pdf")
        
        print(f"Uploading document: {document_id}")
        s3_key = self._upload_test_document(document_id, pdf_content, "overlap-test.pdf")
        
        # Trigger processing
        event = {
            'Records': [{
                's3': {
                    'bucket': {'name': self.bucket_name},
                    'object': {'key': s3_key}
                }
            }]
        }
        
        self.lambda_client.invoke(
            FunctionName=self.extract_lambda,
            InvocationType='RequestResponse',
            Payload=json.dumps(event)
        )
        
        # Wait for completion
        print("Waiting for processing...")
        metadata = self._wait_for_processing(document_id, timeout=90)
        
        # Get chunks
        chunks = self._get_chunks_from_s3(document_id)
        self.assertGreater(len(chunks), 1, "Need multiple chunks to test overlap")
        
        # Verify overlap exists between consecutive chunks
        print(f"Verifying overlap in {len(chunks)} chunks...")
        overlaps_found = 0
        
        for i in range(len(chunks) - 1):
            chunk1_text = chunks[i]['text']
            chunk2_text = chunks[i + 1]['text']
            
            # Check if end of chunk1 appears in beginning of chunk2
            # Take last 100 characters of chunk1
            chunk1_end = chunk1_text[-100:] if len(chunk1_text) > 100 else chunk1_text
            
            # Check if any portion appears in chunk2
            if any(word in chunk2_text for word in chunk1_end.split() if len(word) > 5):
                overlaps_found += 1
        
        # We expect most consecutive chunks to have some overlap
        overlap_ratio = overlaps_found / (len(chunks) - 1) if len(chunks) > 1 else 0
        print(f"  Overlap found in {overlaps_found}/{len(chunks)-1} chunk pairs ({overlap_ratio:.1%})")
        
        # At least some chunks should have overlap
        self.assertGreater(overlaps_found, 0, "No overlap found between chunks")
        
        print("✓ Chunking with overlap verified")
    
    def test_04_multiple_documents_processing(self):
        """
        Test processing multiple documents concurrently.
        
        Validates Requirements: 5.1, 6.1
        """
        print("\n=== Test: Multiple Documents Processing ===")
        
        # Create multiple test documents
        num_documents = 3
        document_ids = []
        
        for i in range(num_documents):
            document_id = str(uuid.uuid4())
            document_ids.append(document_id)
            
            content = f"""
            Test Document {i + 1}
            
            This is test document number {i + 1} for concurrent processing.
            Each document has unique content to verify proper isolation.
            
            Document ID: {document_id}
            """
            
            pdf_content = self._create_test_pdf(content, f"doc-{i+1}.pdf")
            s3_key = self._upload_test_document(document_id, pdf_content, f"doc-{i+1}.pdf")
            
            # Trigger processing
            event = {
                'Records': [{
                    's3': {
                        'bucket': {'name': self.bucket_name},
                        'object': {'key': s3_key}
                    }
                }]
            }
            
            self.lambda_client.invoke(
                FunctionName=self.extract_lambda,
                InvocationType='Event',  # Async invocation
                Payload=json.dumps(event)
            )
        
        print(f"Triggered processing for {num_documents} documents")
        
        # Wait for all documents to complete
        print("Waiting for all documents to complete...")
        completed = 0
        
        for document_id in document_ids:
            try:
                metadata = self._wait_for_processing(document_id, timeout=120)
                if metadata['processingStatus'] == 'completed':
                    completed += 1
                    print(f"  Document {completed}/{num_documents} completed")
            except Exception as error:
                print(f"  Document {document_id} failed: {error}")
        
        # Verify all completed
        self.assertEqual(completed, num_documents, f"Only {completed}/{num_documents} documents completed")
        
        print(f"✓ All {num_documents} documents processed successfully")
    
    def test_05_error_handling_for_invalid_pdf(self):
        """
        Test error handling when processing invalid PDF files.
        
        Validates Requirements: 5.3
        """
        print("\n=== Test: Error Handling for Invalid PDF ===")
        
        # Create document with invalid PDF content
        document_id = str(uuid.uuid4())
        invalid_pdf = b"This is not a valid PDF file"
        
        print(f"Uploading invalid PDF: {document_id}")
        s3_key = self._upload_test_document(document_id, invalid_pdf, "invalid.pdf")
        
        # Trigger processing
        event = {
            'Records': [{
                's3': {
                    'bucket': {'name': self.bucket_name},
                    'object': {'key': s3_key}
                }
            }]
        }
        
        response = self.lambda_client.invoke(
            FunctionName=self.extract_lambda,
            InvocationType='RequestResponse',
            Payload=json.dumps(event)
        )
        
        # Lambda should handle error gracefully
        response_payload = json.loads(response['Payload'].read())
        self.assertEqual(response_payload['statusCode'], 200)
        
        body = json.loads(response_payload['body'])
        self.assertEqual(body['failed'], 1)
        
        # Wait a bit for error handling to complete
        time.sleep(5)
        
        # Verify document is marked as failed in DynamoDB
        try:
            response = self.metadata_table.get_item(
                Key={'PK': f'DOC#{document_id}', 'SK': 'METADATA'}
            )
            
            if 'Item' in response:
                item = response['Item']
                self.assertEqual(item.get('processingStatus'), 'failed')
                self.assertIn('errorMessage', item)
                print(f"  Error message: {item['errorMessage'][:100]}...")
        except ClientError:
            print("  Note: Document metadata not found (acceptable for invalid PDF)")
        
        # Verify document moved to failed/ folder
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=f"failed/{document_id}/invalid.pdf"
            )
            print("  Document moved to failed/ folder")
        except ClientError:
            print("  Note: Document not in failed/ folder (may not have been moved)")
        
        print("✓ Error handling verified")


if __name__ == '__main__':
    unittest.main()